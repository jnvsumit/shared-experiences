import dotenv from 'dotenv'
dotenv.config()

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shared_experiences'
export const PORT = Number(process.env.PORT || 4000)

export const LLM_PROVIDER = (process.env.LLM_PROVIDER || '').toLowerCase()
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
export const OPENAI_MODEL_CATEGORIZE = process.env.OPENAI_MODEL_CATEGORIZE || 'gpt-4o-mini'
export const OPENAI_MODEL_EMBED = process.env.OPENAI_MODEL_EMBED || 'text-embedding-3-small'

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
export const DEEPSEEK_MODEL_CATEGORIZE = process.env.DEEPSEEK_MODEL_CATEGORIZE || 'deepseek-chat'
export const DEEPSEEK_MODEL_EMBED = process.env.DEEPSEEK_MODEL_EMBED || ''

export const NEO4J_URI = process.env.NEO4J_URI || ''
export const NEO4J_USER = process.env.NEO4J_USER || ''
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || ''
export const CLUSTER_K = Number(process.env.CLUSTER_K || 8)


