import { UserIdentity } from '../models/index.js'

export default async function identitiesTracker(req, _res, next) {
  try {
    if (!req.ipHash && !req.fingerprintHash) return next()
    await UserIdentity.findOneAndUpdate(
      { ipHash: req.ipHash || null, fingerprintHash: req.fingerprintHash || null },
      { $set: { userAgent: req.userAgent, lastSeen: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    )
  } catch {}
  next()
}


