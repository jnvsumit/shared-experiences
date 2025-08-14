import { Router } from 'express'
import { Cluster, Experience } from '../models/index.js'
import { extractThemes } from '../services/nlp.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const clusters = await Cluster.find({}).sort({ size: -1 }).limit(8).lean()
    if (clusters.length > 0) {
      return res.json(clusters.map(c => ({ theme: c.label || 'topic', count: c.size, clusterId: String(c._id) })))
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await Experience.find({ createdAt: { $gte: since } })
    const themeCounts = new Map()
    for (const e of recent) {
      const themes = (e.themes && e.themes.length ? e.themes : extractThemes(e.text))
      for (const t of themes) themeCounts.set(t, (themeCounts.get(t) || 0) + 1)
    }
    const top = [...themeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([theme,count])=>({ theme, count }))
    res.json(top)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

export default router


