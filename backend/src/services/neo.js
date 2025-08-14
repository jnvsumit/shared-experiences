import neo4j from 'neo4j-driver'
import { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } from '../config/env.js'

export const neoDriver = (NEO4J_URI && NEO4J_USER && NEO4J_PASSWORD)
  ? neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
  : null

export async function neoRun(cypher, params) {
  if (!neoDriver) return null
  const session = neoDriver.session()
  try { return await session.run(cypher, params) } finally { await session.close() }
}

export async function upsertPostNode(p) {
  if (!neoDriver) return
  await neoRun(
    'MERGE (n:Post {id: $id}) SET n.createdAt=$createdAt, n.meToos=$meToos',
    { id: String(p._id), createdAt: new Date(p.createdAt || Date.now()).toISOString(), meToos: p.meToos || 0 }
  )
  for (const t of (p.themes || [])) {
    await neoRun('MERGE (th:Theme {name:$t})', { t })
    await neoRun('MATCH (n:Post {id:$id}),(th:Theme {name:$t}) MERGE (n)-[:HAS_THEME]->(th)', { id: String(p._id), t })
  }
}

export async function upsertSimilarityEdges(source, candidates) {
  if (!neoDriver) return
  const sid = String(source._id)
  for (const c of candidates) {
    const tid = String(c._id)
    await neoRun('MATCH (a:Post {id:$a}),(b:Post {id:$b}) MERGE (a)-[r:SIMILAR]-(b) SET r.weight=$w', { a: sid, b: tid, w: c._score || 0 })
  }
}


