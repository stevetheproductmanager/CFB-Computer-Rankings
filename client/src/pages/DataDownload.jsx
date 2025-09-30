import React, { useEffect, useState } from 'react'
import { downloadSeason, status } from '../api'
import { getManifest, getCachedManifest } from '../store/dataState'

export default function DataDownload() {
  const [year, setYear] = useState(2025)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // will be set from manifest OR fresh download
  const [server, setServer] = useState(null)
  const [err, setErr] = useState(null)
  const [manifest, setManifest] = useState(getCachedManifest())

  // small helper to fetch a JSON and return a "count" for display
  const fetchCount = async (url) => {
    try {
      const r = await fetch(url)
      if (!r.ok) return 0
      const j = await r.json()
      if (Array.isArray(j)) return j.length
      if (j && typeof j === 'object') {
        // sometimes objects contain arrays under common keys
        for (const k of ['data','items','results','teams','games','lines']) {
          if (Array.isArray(j[k])) return j[k].length
        }
        return 1
      }
      return 0
    } catch {
      return 0
    }
  }

  // Build a "result-like" object from the manifest so the UI looks identical
  const hydrateFromManifest = async (y, lastRun = null) => {
    try {
      const m = await getManifest(Number(y))
      setManifest(m)

      if (!m?.files?.length) {
        // If we just ran a download, preserve errors/summary even if no files exist.
        if (lastRun) {
          setResult({
            year: Number(y),
            results: [],
            errors: lastRun.errors || [],
            summary: lastRun.summary || { ok: false, downloaded: 0, failed: lastRun.errors?.length || 0 }
          })
        } else {
          setResult(null)
        }        
        return
      }

      // Build rows and compute counts
      const files = m.files.filter(f => f.endsWith('.json'))
      const rows = await Promise.all(files.map(async (fn) => {
        const slug = fn.replace(/\.json$/,'')
        const url = `/data/${m.year}/${fn}`
        const count = await fetchCount(url)
        return { slug, count }
      }))

      rows.sort((a,b) => a.slug.localeCompare(b.slug))

      // If we came from a fresh run, MERGE: keep its errors/summary, but replace results with on-disk rows
      const merged = lastRun ? {
        year: Number(m.year),
        results: rows,
        errors: lastRun.errors || [],
        summary: {
          ...(lastRun.summary || {}),
          // Optionally, sanity check: if we downloaded N but only see M on disk, mark not ok
          ok: (lastRun.summary?.ok ?? true) && rows.length >= (lastRun.summary?.downloaded ?? 0)
        }
      } : {
        year: Number(m.year),
        results: rows,
        errors: [],
        summary: {
          // Don’t blindly force ok=true; ok means “no known errors”
          ok: true,
          downloaded: rows.length,
          failed: 0
        }
      }
      setResult(merged)
    } catch (e) {
      // If manifest fails, don't blow up the page — just show an inline hint
      setErr(String(e.message || e))
    }
  }

  // On first mount: get server status and hydrate from manifest
  useEffect(() => {
    status().then(setServer).catch(() => {})
    hydrateFromManifest(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the year changes, refresh manifest view for that year
  useEffect(() => {
    hydrateFromManifest(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  // If this component remounts (e.g., user switches away & back), it will run the mount effect above.
  // If your tab system keeps components mounted, you could also add a 'visibilitychange' listener:
  // useEffect(() => {
  //   const onVis = () => { if (document.visibilityState === 'visible') hydrateFromManifest(year) }
  //   document.addEventListener('visibilitychange', onVis)
  //   return () => document.removeEventListener('visibilitychange', onVis)
  // }, [year])

  const onDownload = async () => {
    setBusy(true); setErr(null)
    try {
      const data = await downloadSeason(Number(year))
      // Show fresh results immediately (with errors if any)…
      setResult(data)
      // …then re-hydrate from disk but KEEP the errors/summary from the fresh run.
      await hydrateFromManifest(year, data)
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Data Download</h2>
      <p className="small">
        Downloads season-scoped data from CFBD and saves locally under <code className="inline">server/data/{'{year}'}</code>.
        Your API key is read from <code className="inline">server/.env</code> on the server — it is never exposed to the browser.
      </p>

      <div className="row" style={{ marginTop: 10 }}>
        <label>Season Year</label>
        <input className="input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        <button className="btn" disabled={busy} onClick={onDownload}>
          {busy ? 'Downloading…' : `Download Season Data (${year})`}
        </button>
        {server && (
          <span className="badge">Base: {server.baseUrl}</span>
        )}
        {manifest?.files?.length > 0 && (
          <span className="badge ok" title={`Found ${manifest.files.length} files for ${manifest.year}`}>
            Data found: {manifest.files.length} files
          </span>
        )}
      </div>

      {err && <div className="progress"><span className="badge err">Error</span> {err}</div>}

      {result && (
        <div className="progress">
          <div className="row">
            <span className={`badge ${result.summary?.ok ? 'ok' : 'err'}`}>
              {result.summary?.ok ? 'Ready' : 'Completed with errors'}
            </span>
            <span className="badge">Files: {result.summary?.downloaded ?? (result.results?.length || 0)}</span>
            {!!result.summary?.failed && <span className="badge err">Failed: {result.summary.failed}</span>}
          </div>
          <div className="kv">
            <div><b>Season</b></div><div>{result.year}</div>
            <div><b>Saved To</b></div><div><code className="inline">server/data/{result.year}/</code></div>
          </div>

          <h3 style={{ marginTop: 16 }}>Files</h3>
          <ul>
            {result.results?.map(r => (
              <li key={r.slug}>
                <code className="inline">{r.slug}.json</code>
                {' '}<span className="small">({typeof r.count === 'number' ? r.count : '—'} records)</span>
                {' — '}<a href={`/data/${result.year}/${r.slug}.json`} target="_blank" rel="noreferrer">view</a>
              </li>
            ))}
          </ul>

          {result.errors?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Errors</h3>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <code className="inline">{e.slug}</code> — {e.message} <span className="small">({e.pathTried || e.path || 'n/a'})</span>
                  </li>
                ))}
              </ul>
              <p className="small">Tip: You can edit <code className="inline">server/src/endpoints.js</code> to remove or adjust failing endpoints.</p>
            </div>
          )}
        </div>
      )}

      {!result && !busy && (
        <div className="progress small">
          No files detected for {year}. Click “Download” to fetch the season, or change the year.
        </div>
      )}
    </div>
  )
}
