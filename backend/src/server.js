import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import OpenAI from 'openai';
import skmeans from 'skmeans';
import neo4j from 'neo4j-driver';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120
});
app.use(limiter);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shared_experiences';
const PORT = process.env.PORT || 4000;

// Schemas
const ExperienceSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    themes: { type: [String], default: [] },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    summary: { type: String, default: '' },
    meToos: { type: Number, default: 0 },
    sessionId: { type: String, index: true },
    meTooSessions: { type: [String], default: [] },
    meTooFingerprints: { type: [String], default: [] },
    meTooIpHashes: { type: [String], default: [] },
    embedding: { type: [Number], default: undefined },
    clusterLabel: { type: String, index: true },
    ipHash: { type: String, index: true },
    fingerprintHash: { type: String, index: true }
  },
  { timestamps: true }
);

const Experience = mongoose.model('Experience', ExperienceSchema);

// Cluster schema to store semantic groups
const ClusterSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  centroid: { type: [Number], default: undefined },
  size: { type: Number, default: 0 },
  sampleIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
const Cluster = mongoose.model('Cluster', ClusterSchema);

// Cached summaries for stability across reloads
const GroupSummarySchema = new mongoose.Schema({
  sig: { type: String, unique: true }, // hash of sorted post ids in a group
  summary: { type: String, default: '' },
  count: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});
const GroupSummary = mongoose.model('GroupSummary', GroupSummarySchema);

// Lightweight local NLP helpers as fallback in place of LLM for MVP
import Sentiment from 'sentiment';
const sentimentAnalyzer = new Sentiment();

// Anonymous session identification middleware
function identifySession(req, res, next) {
  let sid = req.cookies?.sid;
  if (!sid) {
    sid = crypto.randomUUID();
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 180 * 24 * 60 * 60 * 1000 // ~180 days
    });
  }
  req.sessionId = sid;
  req.clientIp = req.ip;
  req.userAgent = req.get('user-agent') || '';
  const rawFp = req.get('x-client-fingerprint') || '';
  const ipHash = crypto.createHash('sha256').update(String(req.clientIp || '')).digest('hex');
  const fpHash = rawFp ? crypto.createHash('sha256').update(String(rawFp)).digest('hex') : '';
  req.ipHash = ipHash;
  req.fingerprintHash = fpHash;
  next();
}
app.use(identifySession);

// Store a lightweight user identity record for analytics/abuse control
const UserIdentitySchema = new mongoose.Schema({
  ipHash: { type: String, index: true },
  fingerprintHash: { type: String, index: true },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});
const UserIdentity = mongoose.model('UserIdentity', UserIdentitySchema);

app.use(async (req, _res, next) => {
  try {
    if (!req.ipHash && !req.fingerprintHash) return next();
    await UserIdentity.findOneAndUpdate(
      { ipHash: req.ipHash || null, fingerprintHash: req.fingerprintHash || null },
      { $set: { userAgent: req.userAgent, lastSeen: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  } catch {}
  next();
});

// Optional LLM setup (DeepSeek preferred if configured)
const LLM_PROVIDER = (process.env.LLM_PROVIDER || '').toLowerCase();
let llmClient = null;
let llmModelCategorize = '';
let llmModelEmbed = '';

if (LLM_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
  llmClient = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  });
  llmModelCategorize = process.env.DEEPSEEK_MODEL_CATEGORIZE || 'deepseek-chat';
  // Embeddings may not be available; leave empty to disable
  llmModelEmbed = process.env.DEEPSEEK_MODEL_EMBED || '';
} else if (process.env.OPENAI_API_KEY) {
  llmClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  llmModelCategorize = process.env.OPENAI_MODEL_CATEGORIZE || 'gpt-4o-mini';
  llmModelEmbed = process.env.OPENAI_MODEL_EMBED || 'text-embedding-3-small';
}

async function categorizeWithLLM(text) {
  if (!llmClient || !llmModelCategorize) return null;
  try {
    const system = 'You categorize short anonymous posts. Reply with strict JSON: {"themes":["..."],"sentiment":"positive|neutral|negative","summary":"..."}. Keep 3-5 themes as short keywords.';
    const user = `Post: ${text}`;
    const resp = await llmClient.chat.completions.create({
      model: llmModelCategorize,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 200
    });
    const content = resp.choices?.[0]?.message?.content || '{}';
    console.log("content", content);
    
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.themes) || !parsed.sentiment || !parsed.summary) return null;
    // sanitize themes
    parsed.themes = parsed.themes
      .map(t => String(t || '').toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!['positive','neutral','negative'].includes(parsed.sentiment)) parsed.sentiment = 'neutral';
    return parsed;
  } catch (e) {
    console.log("error", e);
    
    return null;
  }
}

async function embedWithLLM(text) {
  if (!llmClient || !llmModelEmbed) return null;
  try {
    const resp = await llmClient.embeddings.create({ model: llmModelEmbed, input: text });
    const vec = resp.data?.[0]?.embedding;
    if (!Array.isArray(vec)) return null;
    return vec.map(v => Number(v));
  } catch (e) {
    return null;
  }
}

function extractThemes(text) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const stop = new Set([
    // Articles/Pronouns/Prepositions/Auxiliaries
    'the','a','an','and','or','but','if','then','i','me','my','we','our','you','your','they','them','their','to','of','in','on','for','with','at','from','by','it','is','was','are','were','be','been','am','as','that','this','these','those','so','just','really','very','have','has','had','do','did','does','than','because','while','during','over','under','into','out','about','after','before','between','through','without','within','across','against','around','down','up','off','onto','upon','via','per','each','every','either','neither','both','all','any','some','many','much','most','more','less','few','lot','lots','none','no','not','never','always',
    // Question/modal/common verbs and fillers
    'can','could','should','would','will','shall','may','might','must','what','when','why','how','where','who','whom','whose','like','feel','feels','felt','feeling','think','thinks','thought','know','knows','knew','known','say','says','said','make','makes','made','get','gets','got','gotten','go','goes','went','gone','come','comes','came','seem','seems','seemed','seeming','try','tries','tried','want','wants','wanted','need','needs','needed','able','cannot','gonna','wanna',
    // Generic intensity/comparison words
    'good','bad','worse','worst','best','better','great','okay','ok','fine','ever','about','wonder','wondered','wondering'
  ]);

  const freq = new Map();
  for (const t of tokens) {
    if (t.length <= 3) continue; // drop very short tokens
    if (/^\d+$/.test(t)) continue; // drop pure numbers
    if (stop.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
  return top;
}

function analyzeSentiment(text) {
  const result = sentimentAnalyzer.analyze(text);
  if (result.score > 1) return 'positive';
  if (result.score < -1) return 'negative';
  return 'neutral';
}

function summarize(text) {
  const s = text.trim();
  if (s.length <= 120) return s;
  return s.slice(0, 117) + '...';
}

function jaccardSimilarity(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = new Set([...sa].filter(x => sb.has(x)));
  const union = new Set([...sa, ...sb]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    na += a * a;
    nb += b * b;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Optional Neo4j setup
const NEO4J_URI = process.env.NEO4J_URI || '';
const NEO4J_USER = process.env.NEO4J_USER || '';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';
const neoDriver = (NEO4J_URI && NEO4J_USER && NEO4J_PASSWORD) ? neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)) : null;

async function neoRun(cypher, params) {
  if (!neoDriver) return null;
  const session = neoDriver.session();
  try { return await session.run(cypher, params); } finally { await session.close(); }
}

async function upsertPostNode(p) {
  if (!neoDriver) return;
  await neoRun(
    'MERGE (n:Post {id: $id}) SET n.createdAt=$createdAt, n.meToos=$meToos',
    { id: String(p._id), createdAt: new Date(p.createdAt || Date.now()).toISOString(), meToos: p.meToos || 0 }
  );
  for (const t of (p.themes || [])) {
    await neoRun('MERGE (th:Theme {name:$t})', { t });
    await neoRun('MATCH (n:Post {id:$id}),(th:Theme {name:$t}) MERGE (n)-[:HAS_THEME]->(th)', { id: String(p._id), t });
  }
}

async function upsertSimilarityEdges(source, candidates) {
  if (!neoDriver) return;
  const sid = String(source._id);
  for (const c of candidates) {
    const tid = String(c._id);
    await neoRun('MATCH (a:Post {id:$a}),(b:Post {id:$b}) MERGE (a)-[r:SIMILAR]-(b) SET r.weight=$w', { a: sid, b: tid, w: c._score || 0 });
  }
}

async function labelClusterWithLLM(examples) {
  if (!examples || examples.length === 0) return '';
  // Try LLM label if available
  if (llmClient && llmModelCategorize) {
    try {
      const system = 'You are labeling a group of short anonymous posts. Produce a concise 3-6 word label capturing the shared context. Respond with plain text only.';
      const content = examples.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n');
    const resp = await llmClient.chat.completions.create({
        model: llmModelCategorize,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content }
        ],
      temperature: 0,
        max_tokens: 24
      });
      const label = (resp.choices?.[0]?.message?.content || '').trim();
      return label.slice(0, 80);
    } catch {}
  }
  // Fallback: join top keywords
  const words = examples.join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w).join(' ');
}

async function reclusterRecent(k = 8) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await Experience.find({ createdAt: { $gte: since } }).limit(800).lean();
  const embedded = recent.filter(r => Array.isArray(r.embedding) && r.embedding.length);
  if (embedded.length < k) return [];
  const matrix = embedded.map(r => r.embedding);
  const result = skmeans(matrix, k);
  const clusters = [];
  for (let i = 0; i < k; i++) {
    const indices = result.idxs.map((cid, idx) => cid === i ? idx : -1).filter(x => x >= 0);
    if (indices.length === 0) continue;
    const samples = indices.map(ii => embedded[ii]);
    const examples = samples.slice(0, 5).map(s => s.text);
    const label = await labelClusterWithLLM(examples);
    const centroid = result.centroids[i];
    clusters.push({ label, centroid, size: indices.length, sampleIds: samples.slice(0, 10).map(s => s._id), updatedAt: new Date() });
  }
  await Cluster.deleteMany({});
  await Cluster.insertMany(clusters);
  return clusters;
}

function topKeywordsForTexts(texts, max = 5) {
  const freq = new Map();
  for (const t of texts) {
    for (const th of extractThemes(t)) {
      freq.set(th, (freq.get(th) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, max).map(([w])=>w);
}

async function summarizeGroupWithLLM(texts) {
  if (!texts || texts.length === 0) return '';
  if (!llmClient || !llmModelCategorize) {
    const kws = topKeywordsForTexts(texts, 4);
    return kws.length ? `Experiences about ${kws.join(', ')}.` : 'Similar experiences from users.';
  }
  try {
    const system = 'You summarize what multiple short anonymous posts have in common. Respond with ONE concise sentence (max 18 words). Keep wording stable and neutral; avoid rephrasing if similar.';
    const content = texts.slice(0, 6).map((t,i)=>`${i+1}. ${t}`).join('\n');
    const resp = await llmClient.chat.completions.create({
      model: llmModelCategorize,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content }
      ],
      temperature: 0,
      max_tokens: 40
    });
    return (resp.choices?.[0]?.message?.content || '').trim().slice(0, 160);
  } catch {
    const kws = topKeywordsForTexts(texts, 4);
    return kws.length ? `Experiences about ${kws.join(', ')}.` : 'Similar experiences from users.';
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/experiences', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 1000) {
      return res.status(400).json({ error: 'Post exceeds 1000-word limit' });
    }

    let themes = extractThemes(text);
    let sentiment = analyzeSentiment(text);
    let summary = summarize(text);
    // Try LLM categorize
    const categorized = await categorizeWithLLM(text);
    if (categorized) {
      themes = categorized.themes?.length ? categorized.themes : themes;
      sentiment = categorized.sentiment || sentiment;
      summary = categorized.summary || summary;
    }
    // Try embedding
    const embedding = await embedWithLLM(text);

    const newExp = await Experience.create({ text, themes, sentiment, summary, sessionId: req.sessionId, embedding, ipHash: req.ipHash, fingerprintHash: req.fingerprintHash });
    await upsertPostNode(newExp);

    // Find similar experiences
    let similar = [];
    if (embedding) {
      const all = await Experience.find({ _id: { $ne: newExp._id }, embedding: { $exists: true, $type: 'array' } })
        .sort({ createdAt: -1 })
        .limit(300);
      const scored = all
        .map(e => ({ e, score: cosineSimilarity(embedding, e.embedding || []) }))
        .filter(x => x.score >= 0.75)
        .sort((a, b) => b.score - a.score)
        .map(x => x.e);
      similar = scored;
      // Upsert SIMILAR edges in graph
      await upsertSimilarityEdges(newExp, scored.slice(0, 10).map(e => ({ ...e, _score: cosineSimilarity(embedding, e.embedding || []) })));
    } else {
      const all = await Experience.find({ _id: { $ne: newExp._id } }).sort({ createdAt: -1 }).limit(200);
      similar = all.filter(e => jaccardSimilarity(e.themes, themes) >= 0.34);
    }

    // Assign cluster label opportunistically
    try {
      const clusters = await Cluster.find({}).lean();
      if (clusters.length && Array.isArray(embedding)) {
        let best = null;
        for (const c of clusters) {
          const s = cosineSimilarity(embedding, c.centroid || []);
          if (!best || s > best.score) best = { c, score: s };
        }
        if (best && best.score >= 0.7) {
          await Experience.updateOne({ _id: newExp._id }, { $set: { clusterLabel: best.c.label } });
        }
      }
    } catch {}

    const expObj = newExp.toObject ? newExp.toObject() : newExp;
    expObj.isOwn = true;
    const examplesOut = similar.slice(0, 5).map(doc => {
      const o = doc.toObject ? doc.toObject() : doc;
      return { ...o, isOwn: String(o.sessionId || '') === String(req.sessionId || '') };
    });
    res.status(201).json({
      experience: expObj,
      similarCount: similar.length,
      examples: examplesOut
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Me Too feature removed by product decision

// Get similar experiences for an existing post
app.get('/api/experiences/:id/similar', async (req, res) => {
  try {
    const { id } = req.params;
    const base = await Experience.findById(id).lean();
    if (!base) return res.status(404).json({ error: 'Not found' });
    let examples = [];
    if (Array.isArray(base.embedding) && base.embedding.length) {
      const all = await Experience.find({ _id: { $ne: id }, embedding: { $exists: true, $type: 'array' } })
        .sort({ createdAt: -1 })
        .limit(300)
        .lean();
      examples = all
        .map(e => ({ e, score: cosineSimilarity(base.embedding, e.embedding || []) }))
        .filter(x => x.score >= 0.75)
        .sort((a,b)=>b.score-a.score)
        .slice(0, 10)
        .map(x => x.e);
    } else {
      const themes = (base.themes && base.themes.length) ? base.themes : extractThemes(base.text);
      const all = await Experience.find({ _id: { $ne: id } }).sort({ createdAt: -1 }).limit(200).lean();
      examples = all.filter(e => jaccardSimilarity(themes, (e.themes && e.themes.length) ? e.themes : extractThemes(e.text)) >= 0.34).slice(0, 10);
    }
    return res.json({ similarCount: examples.length, examples });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    // Prefer cluster-based trending if embeddings available
    const clusters = await Cluster.find({}).sort({ size: -1 }).limit(8).lean();
    if (clusters.length > 0) {
      return res.json(clusters.map(c => ({ theme: c.label || 'topic', count: c.size, clusterId: String(c._id) })));
    }
    // Fallback to theme counts
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await Experience.find({ createdAt: { $gte: since } });
    const themeCounts = new Map();
    for (const e of recent) {
      const themes = (e.themes && e.themes.length ? e.themes : extractThemes(e.text));
      for (const t of themes) {
        themeCounts.set(t, (themeCounts.get(t) || 0) + 1);
      }
    }
    const top = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));
    res.json(top);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch top posts (default) or posts related to a theme
app.get('/api/posts', async (req, res) => {
  try {
    const { theme, cluster, graphSimilarTo } = req.query;
    let postsQuery = {};
    if (graphSimilarTo && neoDriver) {
      // Return neighbors by SIMILAR edges ordered by weight
      const result = await neoRun(
        'MATCH (a:Post {id:$id})- [r:SIMILAR] - (b:Post) RETURN b.id as id, r.weight as w ORDER BY w DESC LIMIT 10',
        { id: String(graphSimilarTo) }
      );
      const ids = (result?.records || []).map(rec => rec.get('id'));
      const docs = await Experience.find({ _id: { $in: ids } }).lean();
      // preserve order by weight
      const order = new Map(ids.map((v,i)=>[v,i]));
      return res.json(docs.sort((x,y)=>(order.get(String(x._id))??0)-(order.get(String(y._id))??0)));
    }
    if (cluster && typeof cluster === 'string') {
      // nearest to cluster centroid
      const c = await Cluster.findById(cluster).lean();
      if (c && Array.isArray(c.centroid)) {
        const recent = await Experience.find({ embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(400).lean();
        const scored = recent
          .map(e => ({ e, score: cosineSimilarity(c.centroid, e.embedding || []) }))
          .sort((a,b)=>b.score-a.score)
          .slice(0, 10)
          .map(x => x.e);
        return res.json(scored);
      }
    }
    if (theme && typeof theme === 'string' && theme.trim()) {
      postsQuery = { themes: theme.trim().toLowerCase() };
    }

    const posts = await Experience.find(postsQuery)
      .sort({ meToos: -1, createdAt: -1 })
      .limit(10)
      .lean();
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger reclustering (admin/dev)
app.post('/api/recluster', async (req, res) => {
  try {
    const k = Number(process.env.CLUSTER_K || 8);
    const clusters = await reclusterRecent(k);
    res.json({ ok: true, clusters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Grouped summaries: returns concise sentences with counts
app.get('/api/grouped-summaries', async (req, res) => {
  try {
    const { theme, cluster } = req.query;
    let posts = [];
    if (cluster) {
      const c = await Cluster.findById(cluster).lean();
      if (c && Array.isArray(c.centroid)) {
        const recent = await Experience.find({ embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(600).lean();
        posts = recent
          .map(e => ({ e, score: cosineSimilarity(c.centroid, e.embedding || []) }))
          .sort((a,b)=>b.score-a.score)
          .slice(0, 120)
          .map(x => x.e);
      }
    } else if (theme) {
      posts = await Experience.find({ themes: String(theme).toLowerCase() }).sort({ createdAt: -1 }).limit(200).lean();
    } else {
      posts = await Experience.find({}).sort({ createdAt: -1 }).limit(200).lean();
    }

    if (posts.length === 0) return res.json([]);

    // Fuzzy bucketing by Jaccard on themes (or fallback to text keywords)
    const buckets = [];
    const used = new Set();
    const getThemes = p => (p.themes && p.themes.length ? p.themes : extractThemes(p.text));
    for (let i = 0; i < posts.length; i++) {
      if (used.has(posts[i]._id.toString())) continue;
      const seed = posts[i];
      const seedThemes = getThemes(seed);
      const group = [seed];
      used.add(seed._id.toString());
      for (let j = i + 1; j < posts.length; j++) {
        const pj = posts[j];
        if (used.has(pj._id.toString())) continue;
        const sim = jaccardSimilarity(seedThemes, getThemes(pj));
        if (sim >= 0.34) {
          group.push(pj);
          used.add(pj._id.toString());
        }
      }
      buckets.push(group);
    }

    // Summarize each bucket and compute counts (cache by deterministic signature)
    const results = [];
    for (const g of buckets) {
      if (g.length < 2) continue; // skip singletons
      const ids = g.map(x => String(x._id)).sort();
      const sig = crypto.createHash('sha1').update(ids.join('|')).digest('hex');
      let cached = await GroupSummary.findOne({ sig });
      if (!cached || cached.count !== g.length) {
        const texts = g.map(x => x.text);
        const summary = await summarizeGroupWithLLM(texts);
        cached = await GroupSummary.findOneAndUpdate(
          { sig },
          { $set: { summary, count: g.length, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
      }
      results.push({ summary: cached.summary, count: cached.count });
    }
    results.sort((a,b)=>b.count-a.count);
    res.json(results.slice(0, 10));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000
    });
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();


