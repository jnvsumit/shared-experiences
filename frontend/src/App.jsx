import React, { useEffect, useMemo, useState, useRef } from 'react'
import axios from 'axios'
import { CONFIG } from './config'
import { api } from './api/client'
import './styles.css'

const API_BASE = CONFIG.apiBase

export default function App() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [trending, setTrending] = useState([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [charCount, setCharCount] = useState(0)
  const [posting, setPosting] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  // Removed Me Too feature: keep placeholder for backward compatibility
  const [reactedIds] = useState(new Set())
  const textareaRef = useRef(null)
  const [feed, setFeed] = useState([])
  const [activeTheme, setActiveTheme] = useState('')
  const [activeCluster, setActiveCluster] = useState('')
  const [grouped, setGrouped] = useState([])
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [loadingGrouped, setLoadingGrouped] = useState(false)
  const [sidecarOpen, setSidecarOpen] = useState(false)
  const [sidecarItems, setSidecarItems] = useState([])
  const [sidecarAnchorId, setSidecarAnchorId] = useState('')
  const [sidecarLoading, setSidecarLoading] = useState(false)

  const client = api

  async function submit() {
    setError('')
    if (!text.trim()) {
      setError('Please write something first')
      return
    }
    setLoading(true)
    setPosting(true)
    try {
      const res = await client.post('/api/experiences', { text })
      setResult(res.data)
      await loadTrending()
      await loadFeed(activeTheme)
      setToast({ type: 'success', msg: 'Posted!' })
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to post')
      setToast({ type: 'error', msg: e?.response?.data?.error || 'Failed to post' })
    } finally {
      setLoading(false)
      setPosting(false)
    }
  }

  async function loadTrending() {
    try {
      const res = await client.get('/api/trending')
      setTrending(res.data)
    } catch {}
  }

  async function loadFeed(theme = '', cluster = '') {
    try {
      setLoadingFeed(true)
      const params = cluster ? { cluster } : (theme ? { theme } : {})
      const res = await client.get('/api/posts', { params })
      setFeed(res.data)
    } catch {} finally { setLoadingFeed(false) }
  }

  async function loadGrouped(theme = '', cluster = '') {
    try {
      setLoadingGrouped(true)
      const params = cluster ? { cluster } : (theme ? { theme } : {})
      const res = await client.get('/api/grouped-summaries', { params })
      setGrouped(res.data)
    } catch {} finally { setLoadingGrouped(false) }
  }

  // Me Too removed

  async function viewSimilar(id) {
    try {
      setSidecarLoading(true)
      // Open sidecar immediately for smooth layout transition
      setSidecarAnchorId(id)
      setSidecarOpen(true)
      const res = await client.get(`/api/experiences/${id}/similar`)
      const items = res.data.examples || []
      setSidecarItems(items)
      setToast({ type: 'success', msg: `Found ${res.data.similarCount} similar`, ttl: 1200 })
      // inject into result panel for convenience if matches main post
      if (result && result.experience && result.experience._id === id) {
        setResult(prev => ({ ...prev, similarCount: res.data.similarCount, examples: res.data.examples }))
      }
    } catch {} finally { setSidecarLoading(false) }
  }

  function closeSidecar() { setSidecarOpen(false); setSidecarItems([]); setSidecarAnchorId('') }

  useEffect(() => { loadTrending() }, [])
  useEffect(() => { loadFeed(activeTheme, activeCluster); loadGrouped(activeTheme, activeCluster) }, [activeTheme, activeCluster])
  useEffect(() => {
    setCharCount(text.length)
    const wc = text.trim() ? text.trim().split(/\s+/).length : 0
    setWordCount(wc)
  }, [text])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), toast.ttl || 3000)
    return () => clearTimeout(id)
  }, [toast])

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="container">
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type}`}>
            {toast.msg}
          </div>
        </div>
      )}
      <div className="header">
        <div>
          <div className="title">Shared Experiences</div>
          <div className="cta subtitle highlight">Share your experience and instantly see how many others relate.</div>
        </div>
        <button
          className="btn ghost"
          onClick={() => { loadTrending(); loadFeed(activeTheme, activeCluster); loadGrouped(activeTheme, activeCluster); }}
          aria-label="Refresh all sections"
        >
          Refresh
        </button>
      </div>

      <div className="spacer" />

      <div className="panel">
        {error && <div className="banner error" style={{ marginBottom: 8 }}>{error}</div>}
        <textarea
          className="textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
          placeholder="Share your experience..."
          rows={6}
        />
        <div className="divider" />
        <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 10 }}>
          <div className="cta">Keep it respectful and anonymous. Share feelings, events, thoughts — no personal data, no names.</div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="count">{wordCount} words</div>
            <div className="count">{charCount} chars</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={submit} disabled={loading || wordCount > 1000 || !text.trim()} title={wordCount > 1000 ? 'Limit: 1000 words' : undefined}>
            {posting ? <span className="row"><span className="spinner" />&nbsp;Posting...</span> : 'Post'}
          </button>
          {wordCount > 1000 && <div className="muted" style={{ color: '#ef9ca0' }}>Max 1000 words</div>}
        </div>
      </div>

      {result ? (
        <div className="spacer" />
      ) : (
        <div className="spacer" />
      )}

      {result && (
        <div className="grid cols-2">
          <div className="card">
            <div style={{ whiteSpace: 'pre-wrap' }}>{result.experience.text}</div>
            <div className="meta">
              <span className="badge">Sentiment: {result.experience.sentiment}</span>
              &nbsp;
              <span className="badge">Themes: {result.experience.themes.join(', ') || '—'}</span>
            </div>
            
          </div>

          <div className="card">
            <div className="row wrap" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>Similar experiences</div>
              <div className="muted">Found {result.similarCount}</div>
            </div>
            <div className="grid">
              {(result.examples || []).length === 0 && <div className="muted">No close matches found yet.</div>}
              {(result.examples || []).map(ex => (
                <div key={ex._id} className="panel" style={{ padding: 10 }}>
                  <div className="collapse" style={{ whiteSpace: 'pre-wrap' }}>{ex.text}</div>
                  <div className="meta"><span className="badge">{ex.sentiment}</span>&nbsp;<span className="badge">{ex.themes.join(', ') || '—'}</span></div>
                  
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="spacer" />
      <div className="panel">
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>Trending (24h)</div>
        </div>
        <div className="chips">
          <button className={`btn chip${!activeTheme && !activeCluster ? ' primary' : ''}`} onClick={() => { setActiveTheme(''); setActiveCluster(''); }} title="Show top posts" aria-pressed={!activeTheme && !activeCluster}>All</button>
          {trending.map(t => (
            <button key={`${t.clusterId||''}-${t.theme}`} className={`btn chip${activeTheme === t.theme || activeCluster === t.clusterId ? ' primary' : ''}`} title={`${t.count} posts`} onClick={() => { setActiveTheme(t.theme); setActiveCluster(t.clusterId || ''); }} aria-pressed={activeTheme === t.theme || activeCluster === t.clusterId}>
              {t.clusterId ? t.theme : `#${t.theme}`} · {t.count}
            </button>
          ))}
          {trending.length === 0 && <div className="skeleton" />}
        </div>
      </div>

      <div className="spacer" />
      <div className={`panel loading-wrap ${loadingGrouped ? 'is-loading' : ''}`}>
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Top experiences</div>
        </div>
        <div className="summary-grid">
          {grouped.length === 0 && <div className="muted">No grouped summaries yet.</div>}
          {grouped.map((g, idx) => (
            <div key={idx} className="summary-card">
              <div className="summary-head">
                <div className="summary-text">{g.summary}</div>
                <div className="summary-count">{g.count}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="loading-overlay"><span className="spinner big" /></div>
      </div>

      <div className="spacer" />
      <div className={`panel loading-wrap ${loadingFeed ? 'is-loading' : ''}`}>
          <div className="row wrap" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{activeTheme ? `Top posts: #${activeTheme}` : 'Top posts'}</div>
        </div>
        <div className="grid">
          {feed.length === 0 && <div className="muted">No posts yet.</div>}
          {feed.map(p => (
            <div key={p._id} className="panel" style={{ padding: 10 }}>
              <div className="collapse" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
              <div className="row" style={{ marginTop: 6 }}>
            <div className="meta"><span className="badge">{p.sentiment}</span>&nbsp;<span className="badge">{(p.themes||[]).join(', ') || '—'}</span></div>
                <div className="meta-time">{new Date(p.createdAt || Date.now()).toLocaleString()}</div>
              </div>
          <div className="row" style={{ marginTop: 6 }}>
                <button className="btn ghost" onClick={() => (sidecarOpen && sidecarAnchorId===p._id) ? closeSidecar() : viewSimilar(p._id)}>{(sidecarOpen && sidecarAnchorId===p._id) ? '✕' : 'View similar'}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="loading-overlay"><span className="spinner big" /></div>
      </div>

      {/* Modal for similar list */}
      <div className={`modal ${sidecarOpen ? 'show' : ''}`}>
        <div className="modal-backdrop" onClick={closeSidecar} />
        <div className="modal-dialog">
          <div className="panel loading-wrap">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Similar posts</div>
              <button className="btn ghost" onClick={closeSidecar} aria-label="Close similar">✕</button>
            </div>
            <div className="grid">
              {sidecarItems.length === 0 && !sidecarLoading && <div className="muted">No similar posts yet.</div>}
              {sidecarItems.slice(0,10).map(item => (
                <div key={item._id} className="panel" style={{ padding: 10 }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>
                  <div className="meta"><span className="badge">{item.sentiment}</span>&nbsp;<span className="badge">{(item.themes||[]).join(', ') || '—'}</span></div>
                </div>
              ))}
            </div>
            <div className="loading-overlay" style={{ opacity: sidecarLoading ? 1 : 0 }}><span className="spinner big" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}


