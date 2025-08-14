import { Router } from 'express'
import { Experience, Cluster } from '../models/index.js'
import { neoRun } from '../services/neo.js'
import { nearestToCentroid } from '../services/cluster.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { theme, cluster, graphSimilarTo } = req.query
    let postsQuery = {}
    if (graphSimilarTo) {
      const result = await neoRun('MATCH (a:Post {id:$id})- [r:SIMILAR] - (b:Post) RETURN b.id as id, r.weight as w ORDER BY w DESC LIMIT 10', { id: String(graphSimilarTo) })
      const ids = (result?.records || []).map(rec => rec.get('id'))
      const docs = await Experience.find({ _id: { $in: ids } }).lean()
      const order = new Map(ids.map((v,i)=>[v,i]))
      return res.json(docs.sort((x,y)=>(order.get(String(x._id))??0)-(order.get(String(y._id))??0)))
    }
    if (cluster && typeof cluster === 'string') {
      const c = await Cluster.findById(cluster).lean()
      if (c && Array.isArray(c.centroid)) {
        const recent = await Experience.find({ embedding: { $exists: true, $type: 'array' } }).sort({ createdAt: -1 }).limit(400).lean()
        return res.json(nearestToCentroid(c.centroid, recent, 10))
      }
    }
    if (theme && typeof theme === 'string' && theme.trim()) {
      postsQuery = { themes: theme.trim().toLowerCase() }
    }
    const posts = await Experience.find(postsQuery).sort({ meToos: -1, createdAt: -1 }).limit(10).lean()
    res.json(posts)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

export default router


