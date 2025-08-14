import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

import { FRONTEND_ORIGIN } from './config/env.js'
import identifySession from './middleware/identifySession.js'
import identitiesTracker from './middleware/identitiesTracker.js'

// Routes
import healthRouter from './routes/health.js'
import experiencesRouter from './routes/experiences.js'
import postsRouter from './routes/posts.js'
import trendingRouter from './routes/trending.js'
import groupedSummariesRouter from './routes/groupedSummaries.js'
import adminRouter from './routes/admin.js'

dotenv.config()

const app = express()
app.set('trust proxy', 1)

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json())
app.use(morgan('dev'))
app.use(cookieParser())

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 })
app.use(limiter)

// session + identity
app.use(identifySession)
app.use(identitiesTracker)

// mount routes
app.use('/api/health', healthRouter)
app.use('/api/experiences', experiencesRouter)
app.use('/api/posts', postsRouter)
app.use('/api/trending', trendingRouter)
app.use('/api/grouped-summaries', groupedSummariesRouter)
app.use('/api/recluster', adminRouter)

export default app


