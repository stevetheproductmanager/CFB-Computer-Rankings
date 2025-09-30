import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { rankTeams } from '../lib/rankAlgo'
import { confColor } from '../lib/confColors'
import { getManifest, getCachedManifest } from '../store/dataState';

async function fetchJSON(path){
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed ${path} (${res.status})`)
  return res.json()
}

/* ---------- number helpers ---------- */
const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const isFiniteNum = (v) => Number.isFinite(Number(v))
const fmt = (v, d=3) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d)
}
const fmtOrDash = (v, d=2) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : '—'
}

/* Prefer model-provided Results; otherwise compute from win%. */
function getTeamResults(t){
  const r = [t?.results, t?.result, t?.baseline].find(isFiniteNum)
  if (isFiniteNum(r)) return Number(r)
  const w = toNum(t?.w), l = toNum(t?.l)
  const gp = w + l
  return gp > 0 ? (w / gp) : 0
}

/* Average skipping missing values */
function avgOf(list, pick){
  let sum = 0, cnt = 0
  for (const x of list){
    const v = pick(x)
    if (Number.isFinite(v)){ sum += v; cnt++ }
  }
  return cnt ? (sum / cnt) : NaN
}

/* Merge logos from teamsRaw into ranked teams by id or school/name */
function buildTeamIndex(teamsRaw){
  const byId = new Map(), byName = new Map()
  for (const t of (teamsRaw || [])){
    if (t?.id != null) byId.set(Number(t.id), t)
    if (t?.school) byName.set(String(t.school).toLowerCase(), t)
    if (t?.name) byName.set(String(t.name).toLowerCase(), t)
  }
  return { byId, byName }
}
function attachLogos(rankedTeams, teamsRaw){
  const idx = buildTeamIndex(teamsRaw)
  return rankedTeams.map(rt => {
    let source = null
    if (rt?.id != null && idx.byId.has(Number(rt.id))) source = idx.byId.get(Number(rt.id))
    if (!source && rt?.school && idx.byName.has(String(rt.school).toLowerCase())) source = idx.byName.get(String(rt.school).toLowerCase())
    if (!source && rt?.name && idx.byName.has(String(rt.name).toLowerCase())) source = idx.byName.get(String(rt.name).toLowerCase())
    const logos = source?.logos || rt?.logos || []
    return { ...rt, logos }
  })
}

/** Aggregate teams -> conference metrics (rank by avg Score) */
function aggregateConferences(teams) {
  const byConf = new Map()
  for (const t of teams) {
    const key = t?.conference || 'Unknown'
    if (!byConf.has(key)) byConf.set(key, [])
    byConf.get(key).push(t)
  }

  const rows = []
  for (const [conference, list] of byConf.entries()) {
    list.sort((a,b)=> toNum(b?.score) - toNum(a?.score))

    const count = list.length
    const sumW = list.reduce((s,t)=> s + toNum(t?.w), 0)
    const sumL = list.reduce((s,t)=> s + toNum(t?.l), 0)

    const avgScore   = avgOf(list, t => toNum(t?.score))
    const avgResult  = avgOf(list, t => getTeamResults(t))
    const avgSOS     = avgOf(list, t => toNum(t?.sos))
    const avgQuality = avgOf(list, t => toNum(t?.quality))
    const avgRank    = avgOf(list, t => isFiniteNum(t?.rank) ? Number(t.rank) : NaN)

    // Hi/Low overall team rank in conference (best is smallest number)
    let hiRank = NaN, lowRank = NaN
    for (const t of list){
      if (isFiniteNum(t?.rank)){
        const rk = Number(t.rank)
        if (!Number.isFinite(hiRank) || rk < hiRank) hiRank = rk
        if (!Number.isFinite(lowRank) || rk > lowRank) lowRank = rk
      }
    }

    rows.push({
      conference,
      teams: list,
      count,
      sumW, sumL,
      avgRank,
      hiRank: Number.isFinite(hiRank) ? hiRank : null,
      lowRank: Number.isFinite(lowRank) ? lowRank : null,
      avgScore, avgResult, avgSOS, avgQuality,
      confScore: avgScore,
    })
  }

  rows.sort((a,b)=> (toNum(b.confScore) - toNum(a.confScore)))
  rows.forEach((r, i)=> r.rank = i+1)
  return rows
}

/** Small inline bar visualization */
function Bars({ items }) {
  const vals = items.map(i => Number(i?.value ?? 0)).filter(Number.isFinite)
  const maxAbs = Math.max(1, ...vals.map(Math.abs))
  return (
    <div className="bars">
      {items.map((it) => {
        const v = Number(it?.value ?? 0)
        const vSafe = Number.isFinite(v) ? v : 0
        const w = Math.min(100, Math.abs(vSafe) / maxAbs * 100)
        const pos = vSafe >= 0
        return (
          <div key={it.label} className="bar-row" title={it.hint || `${it.label}: ${fmt(vSafe)}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className={`bar-fill ${pos ? 'pos' : 'neg'}`} style={{ width: `${w}%` }} />
            </div>
            <div className="bar-val">{fmt(vSafe,3)}</div>
          </div>
        )
      })}
    </div>
  )
}

/* Copy button that won't bubble row click */
function CopyButton({ payload, onCopied }) {
  const [ok, setOk] = useState(false);

  return (
    <button
      className="btn"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(payload);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
        onCopied?.();
      }}
      title="Copy summary"
      style={{
        width: "4.5em",          // matches "Copy"
        display: "inline-flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {ok ? "✓" : "Copy"}
    </button>
  );
}


function Drawer({ open, row, onClose, onPrev, onNext }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onPrev, onNext])

  if (!open || !row) return null

  const {
    conference, rank, teams, count,
    sumW, sumL,
    avgScore, avgResult, avgSOS, avgQuality,
    avgRank
  } = row

  const bars = [
    { label: 'Avg Score', value: avgScore },
    { label: 'Avg SOS', value: avgSOS },
    { label: 'Avg Quality', value: avgQuality },
    { label: 'Avg Results', value: avgResult },
  ]

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <button className="nav-btn" onClick={onPrev} title="Previous (←)">←</button>
          <div className="drawer-title">
            <div className="drawer-rank">#{rank}</div>
            <div className="drawer-name">{conference}</div>
            <span
              className="badge"
              style={{ background:'#0f1533', borderColor:'#2a3975', color:'#fff', borderLeft:`8px solid ${confColor(conference)}` }}
              title={conference}
            >
              {conference}
            </span>
          </div>
          <button className="nav-btn" onClick={onNext} title="Next (→)">→</button>
        </div>

        <div className="drawer-body">
          <div className="drawer-kpis">
            <div className="kpi"><div className="kpi-label">Teams</div><div className="kpi-val">{count}</div></div>
            <div className="kpi"><div className="kpi-label">W-L</div><div className="kpi-val">{sumW}-{sumL}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Rank</div><div className="kpi-val">{fmtOrDash(avgRank,2)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Score</div><div className="kpi-val">{fmt(avgScore,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg SOS</div><div className="kpi-val">{fmt(avgSOS,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Quality</div><div className="kpi-val">{fmt(avgQuality,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Results</div><div className="kpi-val">{fmt(avgResult,3)}</div></div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '8px 0 6px' }}>Why this conference ranks here</h3>
            <Bars items={bars} />
            <div className="small" style={{ marginTop: 6 }}>
              Ranking = average of each team’s <strong>Score</strong> in the conference.
            </div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '12px 0 6px' }}>Teams in {conference}</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left' }}>
                    <th style={{ padding:'6px' }}>#</th>
                    <th style={{ padding:'6px' }}>Logo</th>
                    <th style={{ padding:'6px' }}>Team</th>
                    <th style={{ padding:'6px' }}>W-L</th>
                    <th style={{ padding:'6px' }}>Results</th>
                    <th style={{ padding:'6px' }}>SOS</th>
                    <th style={{ padding:'6px' }}>Quality</th>
                    <th style={{ padding:'6px' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(t => {
                    const w = toNum(t?.w), l = toNum(t?.l)
                    const resultsVal = getTeamResults(t)
                    const logo = Array.isArray(t?.logos) && t.logos.length ? t.logos[0] : null
                    return (
                      <tr key={t?.name || `${w}-${l}-${toNum(t?.score)}`} style={{ borderTop:'1px solid #1b2447' }}>
                        <td style={{ padding:'6px' }}>{isFiniteNum(t?.rank) ? Number(t.rank) : ''}</td>
                        <td style={{ padding:'6px' }}>
                          {logo ? (
                            <img src={logo} alt={`${t?.name || t?.school || 'team'} logo`} style={{ width: 28, height: 28, objectFit:'contain' }} />
                          ) : '—'}
                        </td>
                        <td style={{ padding:'6px' }}>{t?.name ?? t?.school ?? '—'}</td>
                        <td style={{ padding:'6px' }}>{w}-{l}</td>
                        <td style={{ padding:'6px' }}>{fmt(resultsVal)}</td>
                        <td style={{ padding:'6px' }}>{fmt(toNum(t?.sos))}</td>
                        <td style={{ padding:'6px' }}>{fmt(toNum(t?.quality))}</td>
                        <td style={{ padding:'6px', fontWeight:700 }}>{fmt(toNum(t?.score))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="drawer-section">
            <div className="row" style={{ gap: 6 }}>
              <CopyButton payload={
                `#${rank} ${conference} — W-L ${sumW}-${sumL} | Avg Rank ${fmtOrDash(avgRank,2)} | Conf Avg ${fmt(avgScore,3)} | Avg SOS ${fmt(avgSOS,3)} | Avg Quality ${fmt(avgQuality,3)} | Avg Results ${fmt(avgResult,3)}`
              }/>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function ConferenceRankings(){
  const [year, setYear] = useState(2025)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [teams, setTeams] = useState([])
  const [manifest, setManifest] = useState(getCachedManifest())

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const confRows = useMemo(()=> aggregateConferences(teams), [teams])
  const current = confRows[idx]

  const openAt = useCallback((i) => { setIdx(i); setOpen(true); }, [])
  const onPrev  = useCallback(() => setIdx(i => (i <= 0 ? confRows.length - 1 : i - 1)), [confRows.length])
  const onNext  = useCallback(() => setIdx(i => (i >= confRows.length - 1 ? 0 : i + 1)), [confRows.length])

  useEffect(()=>{
    let cancelled = false
    async function run(){
      setLoading(true); setErr(null)
      try {
        const m = await getManifest(Number(year)); if (cancelled) return; setManifest(m)

        // Load raw teams for logos + fallback and games
        const teamsRaw = await fetch(`/data/${year}/teams-fbs.json`)
          .then(r => r.ok ? r.json() : fetch(`/data/${year}/teams.json`).then(r2 => {
            if (!r2.ok) throw new Error(`Failed /data/${year}/teams.json (${r2.status})`)
            return r2.json()
          }))

        const games = await fetch(`/data/${year}/games-regular.json`)
          .then(r => { if (!r.ok) throw new Error(`Failed /data/${year}/games-regular.json (${r.status})`); return r.json() })

        // Rank, then attach logos from teamsRaw
        const rankedTeams = rankTeams({ teamsRaw, gamesRaw: games })
        const withLogos = attachLogos(Array.isArray(rankedTeams) ? rankedTeams : [], teamsRaw)

        setTeams(withLogos)
        setIdx(0)
      } catch(e){
        setErr(String(e.message || e))
      } finally {
        setLoading(false)
      }
    }
    run()
    return ()=>{ cancelled = true }
  }, [year])

  return (
    <div className="card">
      <h2>Conference Rankings</h2>
      <div className="row" style={{ marginTop: 8 }}>
        <label>Season</label>
        <input
          className="input"
          type="number"
          value={year}
          onChange={e=>{
            const v = Number(e.target.value)
            setYear(Number.isFinite(v) ? v : 0)
          }}
        />
        <span className="small">
          Ranked by the average team <strong>Score</strong> per conference.
        </span>
        {manifest?.files?.length > 0 && (
          <span className="badge" title={`Found ${manifest.files.length} files for ${manifest.year}`}>
            Files: {manifest.files.length}
          </span>
        )}
      </div>

      {err && <div className="progress"><span className="badge err">Error</span> {err}</div>}
      {loading && <div className="progress">Building conference rankings…</div>}

      {!loading && !err && (
        <div style={{ overflowX:'auto', marginTop: 12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ textAlign:'left' }}>
                <th style={{ padding:'8px' }}>#</th>
                <th style={{ padding:'8px' }}>Conference</th>
                <th style={{ padding:'8px' }}>Teams</th>
                <th style={{ padding:'8px' }}>W-L</th>
                <th style={{ padding:'8px' }}>Hi / Low</th>
                <th style={{ padding:'8px' }}>Avg Rank</th>
                <th style={{ padding:'8px' }}>Avg Score</th>
                <th style={{ padding:'8px' }}>Avg SOS</th>
                <th style={{ padding:'8px' }}>Avg Quality</th>
                <th style={{ padding:'8px' }}>Avg Results</th>
                <th style={{ padding:'8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {confRows.map((r, i) => {
                const hiLow = (r.hiRank && r.lowRank) ? `${r.hiRank} / ${r.lowRank}` : '—'
                const payload =
                  `#${r.rank} ${r.conference} — W-L ${r.sumW}-${r.sumL} | Hi/Low ${hiLow} | ` +
                  `Avg Rank ${fmtOrDash(r.avgRank,2)} | Conf Avg ${fmt(r.avgScore)} | ` +
                  `SOS ${fmt(r.avgSOS)} | Quality ${fmt(r.avgQuality)} | Results ${fmt(r.avgResult)}`
                return (
                  <tr
                    key={r.conference}
                    style={{ borderTop:'1px solid #1b2447', cursor:'pointer' }}
                    onClick={()=>openAt(i)}
                  >
                    <td style={{ padding:'8px' }}>{r.rank}</td>
                    <td style={{ padding:'8px' }}>
                      <span
                        className="badge"
                        style={{ background:'#0f1533', borderColor:'#2a3975', color:'#fff', borderLeft:`8px solid ${confColor(r.conference)}` }}
                        title={r.conference}
                      >
                        {r.conference}
                      </span>
                    </td>
                    <td style={{ padding:'8px' }}>{r.count}</td>
                    <td style={{ padding:'8px' }}>{r.sumW}-{r.sumL}</td>
                    <td style={{ padding:'8px' }}>{hiLow}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.avgRank,2)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgScore)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgSOS)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgQuality)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgResult)}</td>
                    <td style={{ padding:'8px' }}>
                      <CopyButton payload={payload} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={open}
        row={current}
        onClose={()=>setOpen(false)}
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  )
}
