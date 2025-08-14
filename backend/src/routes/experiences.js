import { Router } from 'express'
import { Experience } from '../models/index.js'
import { extractThemes, analyzeSentiment, summarize, jaccardSimilarity, cosineSimilarity } from '../services/nlp.js'
import { getLLM } from '../services/llm.js'
import { upsertPostNode, upsertSimilarityEdges } from '../services/neo.js'

const router = Router()

async function categorizeWithLLM(text) {
  const { llmClient, llmModelCategorize } = getLLM()
  if (!llmClient || !llmModelCategorize) return null
  try {
    const system = 'You categorize short anonymous posts. Reply with strict JSON: {"themes":["..."],"sentiment":"positive|neutral|negative","summary":"..."}. Keep 3-5 themes as short keywords.'
    const user = `Post: ${text}`
    const resp = await llmClient.chat.completions.create({
      model: llmModelCategorize,
      messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 200
    })
    const content = resp.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed.themes) || !parsed.sentiment || !parsed.summary) return null
    parsed.themes = parsed.themes.map(t=>String(t||'').toLowerCase().trim()).filter(Boolean).slice(0,5)
    if (!['positive','neutral','negative'].includes(parsed.sentiment)) parsed.sentiment = 'neutral'
    return parsed
  } catch { return null }
}

async function embedWithLLM(text) {
  const { llmClient, llmModelEmbed } = getLLM()
  if (!llmClient || !llmModelEmbed) return null
  try {
    const resp = await llmClient.embeddings.create({ model: llmModelEmbed, input: text })
    const vec = resp.data?.[0]?.embedding
    if (!Array.isArray(vec)) return null
    return vec.map(v => Number(v))
  } catch { return null }
}

router.post('/', async (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' })
    }
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    if (wordCount > 1000) return res.status(400).json({ error: 'Post exceeds 1000-word limit' })

    let themes = extractThemes(text)
    let sentiment = analyzeSentiment(text)
    let summary = summarize(text)
    const categorized = await categorizeWithLLM(text)
    if (categorized) {
      themes = categorized.themes?.length ? categorized.themes : themes
      sentiment = categorized.sentiment || sentiment
      summary = categorized.summary || summary
    }
    const embedding = await embedWithLLM(text)

    const newExp = await Experience.create({ text, themes, sentiment, summary, sessionId: req.sessionId, embedding, ipHash: req.ipHash, fingerprintHash: req.fingerprintHash })
    await upsertPostNode(newExp)

    let similar = []
    if (embedding) {
      const all = await Experience.find({ _id: { $ne: newExp._id }, embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(300)
      const scored = all
        .map(e => ({ e, score: cosineSimilarity(embedding, e.embedding || []) }))
        .filter(x => x.score >= 0.75)
        .sort((a,b)=>b.score-a.score)
        .map(x => x.e)
      similar = scored
      await upsertSimilarityEdges(newExp, scored.slice(0, 10).map(e => ({ ...e, _score: cosineSimilarity(embedding, e.embedding || []) })))
    } else {
      const all = await Experience.find({ _id: { $ne: newExp._id } }).sort({ createdAt: -1 }).limit(200)
      similar = all.filter(e => jaccardSimilarity(e.themes, themes) >= 0.34)
    }

    const expObj = newExp.toObject ? newExp.toObject() : newExp
    expObj.isOwn = true
    const examplesOut = similar.slice(0, 5).map(doc => {
      const o = doc.toObject ? doc.toObject() : doc
      return { ...o, isOwn: String(o.sessionId || '') === String(req.sessionId || '') }
    })
    res.status(201).json({ experience: expObj, similarCount: similar.length, examples: examplesOut })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/similar', async (req, res) => {
  try {
    const { id } = req.params
    const base = await Experience.findById(id).lean()
    if (!base) return res.status(404).json({ error: 'Not found' })
    let examples = []
    if (Array.isArray(base.embedding) && base.embedding.length) {
      const all = await Experience.find({ _id: { $ne: id }, embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(300).lean()
      examples = all
        .map(e => ({ e, score: cosineSimilarity(base.embedding, e.embedding || []) }))
        .filter(x => x.score >= 0.75)
        .sort((a,b)=>b.score-a.score)
        .slice(0, 10)
        .map(x => x.e)
    } else {
      const themes = (base.themes && base.themes.length) ? base.themes : extractThemes(base.text)
      const all = await Experience.find({ _id: { $ne: id } }).sort({ createdAt: -1 }).limit(200).lean()
      examples = all.filter(e => jaccardSimilarity(themes, (e.themes && e.themes.length) ? e.themes : extractThemes(e.text)) >= 0.34).slice(0, 10)
    }
    return res.json({ similarCount: examples.length, examples })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router


