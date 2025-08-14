import mongoose from 'mongoose'
import app from './app.js'
import { MONGO_URI, PORT } from './config/env.js'

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    console.log('MongoDB connected')
    app.listen(PORT, () => console.log(`API listening on :${PORT}`))
  } catch (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
}

start()


