import Sentiment from 'sentiment'

const sentimentAnalyzer = new Sentiment()

export function extractThemes(text) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const stop = new Set([
    'the','a','an','and','or','but','if','then','i','me','my','we','our','you','your','they','them','their','to','of','in','on','for','with','at','from','by','it','is','was','are','were','be','been','am','as','that','this','these','those','so','just','really','very','have','has','had','do','did','does','than','because','while','during','over','under','into','out','about','after','before','between','through','without','within','across','against','around','down','up','off','onto','upon','via','per','each','every','either','neither','both','all','any','some','many','much','most','more','less','few','lot','lots','none','no','not','never','always',
    'can','could','should','would','will','shall','may','might','must','what','when','why','how','where','who','whom','whose','like','feel','feels','felt','feeling','think','thinks','thought','know','knows','knew','known','say','says','said','make','makes','made','get','gets','got','gotten','go','goes','went','gone','come','comes','came','seem','seems','seemed','seeming','try','tries','tried','want','wants','wanted','need','needs','needed','able','cannot','gonna','wanna',
    'good','bad','worse','worst','best','better','great','okay','ok','fine','ever','about','wonder','wondered','wondering'
  ])

  const freq = new Map()
  for (const t of tokens) {
    if (t.length <= 3) continue
    if (/^\d+$/.test(t)) continue
    if (stop.has(t)) continue
    freq.set(t, (freq.get(t) || 0) + 1)
  }
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w])=>w)
}

export function analyzeSentiment(text) {
  const result = sentimentAnalyzer.analyze(text)
  if (result.score > 1) return 'positive'
  if (result.score < -1) return 'negative'
  return 'neutral'
}

export function summarize(text) {
  const s = text.trim()
  if (s.length <= 120) return s
  return s.slice(0, 117) + '...'
}

export function jaccardSimilarity(a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  const inter = new Set([...sa].filter(x => sb.has(x)))
  const union = new Set([...sa, ...sb])
  return union.size === 0 ? 0 : inter.size / union.size
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i]
    const b = vecB[i]
    dot += a * b
    na += a * a
    nb += b * b
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}


