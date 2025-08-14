import skmeans from 'skmeans'
import { Cluster } from '../models/index.js'
import { cosineSimilarity } from './nlp.js'
import { getLLM } from './llm.js'

export async function labelClusterWithLLM(examples) {
  if (!examples || examples.length === 0) return ''
  const { llmClient, llmModelCategorize } = getLLM()
  if (llmClient && llmModelCategorize) {
    try {
      const system = 'You are labeling a group of short anonymous posts. Produce a concise 3-6 word label capturing the shared context. Respond with plain text only.'
      const content = examples.slice(0, 5).map((t,i)=>`${i+1}. ${t}`).join('\n')
      const resp = await llmClient.chat.completions.create({
        model: llmModelCategorize,
        messages: [ { role: 'system', content: system }, { role: 'user', content } ],
        temperature: 0,
        max_tokens: 24
      })
      const label = (resp.choices?.[0]?.message?.content || '').trim()
      return label.slice(0, 80)
    } catch {}
  }
  const words = examples.join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  const counts = new Map()
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1)
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w).join(' ')
}

export async function reclusterRecent(k = 8) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recent = await import('../models/index.js').then(m => m.Experience.find({ createdAt: { $gte: since } }).limit(800).lean())
  const embedded = (await recent).filter(r => Array.isArray(r.embedding) && r.embedding.length)
  if (embedded.length < k) return []
  const matrix = embedded.map(r => r.embedding)
  const result = skmeans(matrix, k)
  const clusters = []
  for (let i = 0; i < k; i++) {
    const indices = result.idxs.map((cid, idx) => cid === i ? idx : -1).filter(x => x >= 0)
    if (indices.length === 0) continue
    const samples = indices.map(ii => embedded[ii])
    const examples = samples.slice(0, 5).map(s => s.text)
    const label = await labelClusterWithLLM(examples)
    const centroid = result.centroids[i]
    clusters.push({ label, centroid, size: indices.length, sampleIds: samples.slice(0, 10).map(s => s._id), updatedAt: new Date() })
  }
  await Cluster.deleteMany({})
  await Cluster.insertMany(clusters)
  return clusters
}

export function nearestToCentroid(centroid, docs, limit = 10) {
  const scored = docs.map(e => ({ e, score: cosineSimilarity(centroid, e.embedding || []) }))
  return scored.sort((a,b)=>b.score-a.score).slice(0, limit).map(x => x.e)
}


