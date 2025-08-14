import { Router } from 'express'
import crypto from 'crypto'
import { Experience, GroupSummary, Cluster } from '../models/index.js'
import { extractThemes, jaccardSimilarity, cosineSimilarity } from '../services/nlp.js'
import { summarizeGroupWithLLM } from '../services/grouping.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { theme, cluster } = req.query
    let posts = []
    if (cluster) {
      const c = await Cluster.findById(cluster).lean()
      if (c && Array.isArray(c.centroid)) {
        const recent = await Experience.find({ embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(600).lean()
        posts = recent
          .map(e => ({ e, score: cosineSimilarity(c.centroid, e.embedding || []) }))
          .sort((a,b)=>b.score-a.score)
          .slice(0, 120)
          .map(x => x.e)
      }
    } else if (theme) {
      posts = await Experience.find({ themes: String(theme).toLowerCase() }).sort({ createdAt: -1 }).limit(200).lean()
    } else {
      posts = await Experience.find({}).sort({ createdAt: -1 }).limit(200).lean()
    }

    if (posts.length === 0) return res.json([])

    const buckets = []
    const used = new Set()
    const getThemes = p => (p.themes && p.themes.length ? p.themes : extractThemes(p.text))
    for (let i = 0; i < posts.length; i++) {
      if (used.has(posts[i]._id.toString())) continue
      const seed = posts[i]
      const seedThemes = getThemes(seed)
      const group = [seed]
      used.add(seed._id.toString())
      for (let j = i + 1; j < posts.length; j++) {
        const pj = posts[j]
        if (used.has(pj._id.toString())) continue
        const sim = jaccardSimilarity(seedThemes, getThemes(pj))
        if (sim >= 0.34) { group.push(pj); used.add(pj._id.toString()) }
      }
      buckets.push(group)
    }

    const results = []
    for (const g of buckets) {
      if (g.length < 2) continue
      const ids = g.map(x => String(x._id)).sort()
      const sig = crypto.createHash('sha1').update(ids.join('|')).digest('hex')
      let cached = await GroupSummary.findOne({ sig })
      if (!cached || cached.count !== g.length) {
        const texts = g.map(x => x.text)
        const summary = await summarizeGroupWithLLM(texts)
        cached = await GroupSummary.findOneAndUpdate(
          { sig },
          { $set: { summary, count: g.length, updatedAt: new Date() } },
          { upsert: true, new: true }
        )
      }
      results.push({ summary: cached.summary, count: cached.count })
    }
    results.sort((a,b)=>b.count-a.count)
    res.json(results.slice(0, 10))
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

export default router


