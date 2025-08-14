import mongoose from 'mongoose'

// Experience
const ExperienceSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    themes: { type: [String], default: [] },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    summary: { type: String, default: '' },
    meToos: { type: Number, default: 0 },
    sessionId: { type: String, index: true },
    meTooSessions: { type: [String], default: [] },
    meTooFingerprints: { type: [String], default: [] },
    meTooIpHashes: { type: [String], default: [] },
    embedding: { type: [Number], default: undefined },
    clusterLabel: { type: String, index: true },
    ipHash: { type: String, index: true },
    fingerprintHash: { type: String, index: true }
  },
  { timestamps: true }
)

export const Experience = mongoose.model('Experience', ExperienceSchema)

// Cluster
const ClusterSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  centroid: { type: [Number], default: undefined },
  size: { type: Number, default: 0 },
  sampleIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  updatedAt: { type: Date, default: Date.now }
})

export const Cluster = mongoose.model('Cluster', ClusterSchema)

// GroupSummary
const GroupSummarySchema = new mongoose.Schema({
  sig: { type: String, unique: true },
  summary: { type: String, default: '' },
  count: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
})

export const GroupSummary = mongoose.model('GroupSummary', GroupSummarySchema)

// UserIdentity
const UserIdentitySchema = new mongoose.Schema({
  ipHash: { type: String, index: true },
  fingerprintHash: { type: String, index: true },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
})

export const UserIdentity = mongoose.model('UserIdentity', UserIdentitySchema)


