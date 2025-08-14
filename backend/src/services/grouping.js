import { extractThemes } from './nlp.js'
import { getLLM } from './llm.js'

export function topKeywordsForTexts(texts, max = 5) {
  const freq = new Map()
  for (const t of texts) {
    for (const th of extractThemes(t)) {
      freq.set(th, (freq.get(th) || 0) + 1)
    }
  }
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, max).map(([w])=>w)
}

export async function summarizeGroupWithLLM(texts) {
  if (!texts || texts.length === 0) return ''
  const { llmClient, llmModelCategorize } = getLLM()
  if (!llmClient || !llmModelCategorize) {
    const kws = topKeywordsForTexts(texts, 4)
    return kws.length ? `Experiences about ${kws.join(', ')}.` : 'Similar experiences from users.'
  }
  try {
    const system = 'You summarize what multiple short anonymous posts have in common. Respond with ONE concise sentence (max 18 words). Keep wording stable and neutral; avoid rephrasing if similar.'
    const content = texts.slice(0, 6).map((t,i)=>`${i+1}. ${t}`).join('\n')
    const resp = await llmClient.chat.completions.create({
      model: llmModelCategorize,
      messages: [ { role: 'system', content: system }, { role: 'user', content } ],
      temperature: 0,
      max_tokens: 40
    })
    return (resp.choices?.[0]?.message?.content || '').trim().slice(0, 160)
  } catch {
    const kws = topKeywordsForTexts(texts, 4)
    return kws.length ? `Experiences about ${kws.join(', ')}.` : 'Similar experiences from users.'
  }
}


