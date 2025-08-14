import { Router } from 'express'
import { reclusterRecent } from '../services/cluster.js'
import { CLUSTER_K } from '../config/env.js'

const router = Router()

router.post('/', async (_req, res) => {
  try {
    const clusters = await reclusterRecent(CLUSTER_K)
    res.json({ ok: true, clusters })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router


