import crypto from 'crypto'

export default function identifySession(req, res, next) {
  let sid = req.cookies?.sid
  if (!sid) {
    sid = crypto.randomUUID()
    let isHttps = false
    try { const u = new URL(process.env.FRONTEND_ORIGIN || 'http://localhost:5173'); isHttps = u.protocol === 'https:' } catch {}
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      maxAge: 180 * 24 * 60 * 60 * 1000
    })
  }
  req.sessionId = sid
  req.clientIp = req.ip
  req.userAgent = req.get('user-agent') || ''
  const rawFp = req.get('x-client-fingerprint') || ''
  const ipHash = crypto.createHash('sha256').update(String(req.clientIp || '')).digest('hex')
  const fpHash = rawFp ? crypto.createHash('sha256').update(String(rawFp)).digest('hex') : ''
  req.ipHash = ipHash
  req.fingerprintHash = fpHash
  next()
}


