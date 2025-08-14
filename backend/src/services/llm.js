import OpenAI from 'openai'
import {
  LLM_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_MODEL_CATEGORIZE,
  OPENAI_MODEL_EMBED,
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_CATEGORIZE,
  DEEPSEEK_MODEL_EMBED
} from '../config/env.js'

let llmClient = null
let llmModelCategorize = ''
let llmModelEmbed = ''

if (LLM_PROVIDER === 'deepseek' && DEEPSEEK_API_KEY) {
  llmClient = new OpenAI({ apiKey: DEEPSEEK_API_KEY, baseURL: DEEPSEEK_BASE_URL })
  llmModelCategorize = DEEPSEEK_MODEL_CATEGORIZE
  llmModelEmbed = DEEPSEEK_MODEL_EMBED
} else if (OPENAI_API_KEY) {
  llmClient = new OpenAI({ apiKey: OPENAI_API_KEY })
  llmModelCategorize = OPENAI_MODEL_CATEGORIZE
  llmModelEmbed = OPENAI_MODEL_EMBED
}

export function getLLM() {
  return { llmClient, llmModelCategorize, llmModelEmbed }
}


