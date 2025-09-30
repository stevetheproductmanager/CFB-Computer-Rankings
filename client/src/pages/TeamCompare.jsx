import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildRankingsForYear } from '../lib/buildRankings.js' // shared builder that mirrors Rankings tab

/* ---------------- helpers ---------------- */
const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v))
const pct = (a, b) => { const s=(a||0)+(b||0); return s? (a/s) : 0.5 }
const fmt1 = n => n==null ? '—' : (typeof n==='number' ? n.toFixed(1) : Number(n).toFixed(1))
const fmt2 = n => n==null ? '—' : (typeof n==='number' ? n.toFixed(2) : Number(n).toFixed(2))
const fmt3 = n => n==null ? '—' : (typeof n==='number' ? n.toFixed(3) : Number(n).toFixed(3))
const cx = (...xs) => xs.filter(Boolean).join(' ')

/* logistic prediction from Score diff + tiny home tilt (consistent w/ prior message) */
function predictProb(scoreA, scoreB, venue='neutral'){
  const scale = 0.12;     // steeper curve if smaller
  const homeEdge = 0.008; // ~0.8% Score bump for home
  let a = Number(scoreA)||0, b = Number(scoreB)||0
  if (venue === 'homeA') a += homeEdge
  if (venue === 'homeB') b += homeEdge
  const diff = a - b
  const pA = 1 / (1 + Math.exp(-diff/scale))
  return { pA, pB: 1 - pA, diff }
}

/* ---------------- win probability donut ---------------- */
function ProbDonut({ left, right, leftLabel, rightLabel }) {
  const p = Math.round(clamp(pct(left, right)) * 100)        // left side %
  const grad = `conic-gradient(var(--brand) 0 ${p}%, rgba(255,255,255,.12) ${p}% 100%)`
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:14, alignItems:'center' }}>
      <div style={{ display:'grid', gap:8 }}>
        <div className="row" style={{ justifyContent:'space-between', color:'var(--muted)', fontSize:12 }}>
          <span>{leftLabel}</span><span>{rightLabel}</span>
        </div>
        <div style={{ height: 12, borderRadius: 999, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${p}%`, background:'linear-gradient(90deg, var(--brand) 0%, var(--brand2) 100%)', transition:'width .45s ease' }} />
        </div>
      </div>
      <div style={{ width:120, height:120, display:'grid', placeItems:'center' }}>
        <div style={{
          width: '100%', height:'100%', borderRadius:'50%', background:grad, transition:'background .45s ease',
          boxShadow:'inset 0 0 0 8px var(--panel), 0 1px 2px rgba(0,0,0,.25)'
        }}>
          <div style={{
            position:'relative', inset:8, width:'calc(100% - 16px)', height:'calc(100% - 16px)',
            margin:8, borderRadius:'50%', background:'var(--panel)', display:'grid', placeItems:'center'
          }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{p}%</div>
              <div className="small" style={{ color:'var(--muted)' }}>{leftLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- per-trait row ---------------- */
function TraitRow({ label, a, b, better='high', fmt=(x)=>x, tip }) {
  const aNum = (a==null || a==='—') ? null : Number(a)
  const bNum = (b==null || b==='—') ? null : Number(b)
  const aWin = aNum!=null && bNum!=null && (better==='high' ? aNum>bNum : aNum<bNum)
  const bWin = aNum!=null && bNum!=null && !aWin && aNum!==bNum
  const av = a==null ? '—' : fmt(aNum)
  const bv = b==null ? '—' : fmt(bNum)

  // Normalize for mini bar (invert if lower is better)
  const na = (better==='high') ? (aNum ?? 0) : (aNum!=null ? 1/Math.max(aNum,1e-6) : 0)
  const nb = (better==='high') ? (bNum ?? 0) : (bNum!=null ? 1/Math.max(bNum,1e-6) : 0)
  const leftPct = Math.round(pct(na, nb) * 100)

  return (
    <div style={{ display:'grid', gridTemplateColumns:'160px 1fr 1fr', gap:12, alignItems:'center', padding:'8px 0' }}>
      <div className="small" title={tip || ''} style={{ color:'var(--text)' }}>
        {label}{better==='low' && <span title="Lower is better" className="small" style={{ marginLeft:6, color:'var(--muted)' }}>↓</span>}
      </div>
      <div>
        <div className={cx('small', aWin && 'badge ok')} style={{ display:'inline-block', minWidth:28 }}>{av}</div>
        <div style={{ height:8, borderRadius:6, background:'rgba(255,255,255,.08)', marginTop:6, overflow:'hidden' }}>
          <div style={{ width:`${leftPct}%`, height:'100%', background:'rgba(149,208,255,0.75)', transition:'width .35s ease' }} />
        </div>
      </div>
      <div>
	<div className={cx('small', bWin && 'badge ok')} style={{ display:'inline-block', minWidth:28 }}>{bv}</div>
        <div style={{ height:8, borderRadius:6, background:'rgba(255,255,255,.08)', marginTop:6, overflow:'hidden' }}>
          <div style={{ width:`${100-leftPct}%`, height:'100%', background:'rgba(149,208,255,0.25)', transition:'width .35s ease', marginLeft:'auto' }} />
        </div>
      </div>
    </div>
  )
}

/* ---------------- data fetchers ---------------- */
async function fetchTeamsIndex(year) {
  // used for the searchable pickers (logos, names, conf)
  const res = await fetch(`/data/${year}/teams-fbs.json`)
  if (!res.ok) throw new Error(`load teams-fbs.json HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.teams || [])
}

async function fetchMatchup({ team1, team2, year }) {
  // keep existing API for all-time series history (multi-year)
  const res = await fetch('/api/teams/compare', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ team1, team2, year })
  })
  if (!res.ok) throw new Error(`matchup HTTP ${res.status}`)
  return res.json()
}

/* ---------------- Team Picker (pill + dropdown) ---------------- */
function TeamPicker({ label, value, onChange, teams }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(()=> setQ(value || ''), [value])

  useEffect(() => {
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return teams.slice(0, 250)
    return teams.filter(t =>
      t.school?.toLowerCase().includes(s) ||
      t.mascot?.toLowerCase().includes(s) ||
      t.abbreviation?.toLowerCase()===s ||
      (t.alternateNames||[]).some(n=>String(n).toLowerCase().includes(s))
    ).slice(0, 250)
  }, [q, teams])

  const selected = useMemo(() => teams.find(t => t.school===value), [teams, value])

  return (
    <div ref={box} style={{ minWidth:280 }}>
      <label className="small" style={{ color:'var(--muted)' }}>{label}</label>
      <div className="row" style={{
        gap:10, alignItems:'center', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)',
        borderRadius:999, padding:'6px 10px'
      }}>
        {selected?.logos?.[0] && <img src={selected.logos[0]} alt="" style={{ width:18, height:18, borderRadius:4, objectFit:'contain' }}/>}
        <input
          className="input"
          style={{ background:'transparent', border:'0', padding:0 }}
          placeholder="Type to search…"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); if (!open) setOpen(true) }}
          onKeyDown={e => {
            if (e.key==='Enter' && filtered[0]) {
              onChange(filtered[0].school); setQ(filtered[0].school); setOpen(false)
            }
          }}
        />
      </div>
      {open && (
        <div style={{
          position:'absolute', zIndex:100, marginTop:6, width:360, maxWidth:'min(92vw, 360px)',
          maxHeight: 360, overflow:'auto', background:'var(--panel)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12
        }}>
          {filtered.map(t => (
            <div key={t.id}
              onClick={() => { onChange(t.school); setQ(t.school); setOpen(false) }}
              className="row"
              style={{ gap:10, padding:'10px 12px', cursor:'pointer' }}
            >
              <img src={t.logos?.[0]} alt="" style={{ width:22, height:22, borderRadius:4, objectFit:'contain' }}/>
              <div style={{ display:'flex', flexDirection:'column' }}>
                <div style={{ fontSize:13 }}>{t.school}</div>
                <div className="small" style={{ color:'var(--muted)' }}>{t.conference} • {t.mascot}</div>
              </div>
            </div>
          ))}
          {!filtered.length && <div className="small" style={{ padding:12, color:'var(--muted)' }}>No matches</div>}
        </div>
      )}
    </div>
  )
}

/* ---------------- derive traits from Rankings rows ---------------- */
function toTeamIndex(rows){
  const byName = new Map()
  for (const t of rows||[]){
    const name = t.name || t.school
    if (name) byName.set(name.toLowerCase(), t)
  }
  return byName
}
function perGame(total, games){
  const gp = (games||[]).length || 1
  return (Number(total)||0)/gp
}
function buildSeasonStatsFromRankings(A, B, year){
  // uses fields present in Rankings rows: score, results, sos, quality, rec, top10Wins, top25Wins, top50Wins, pf, pa, offRank, defRank, games, rank
  if (!A || !B) return null
  const aGP = (A.games||[]).length || 1
  const bGP = (B.games||[]).length || 1
  const aPfPer = perGame(A.pf, A.games)
  const aPaPer = perGame(A.pa, A.games)
  const bPfPer = perGame(B.pf, B.games)
  const bPaPer = perGame(B.pa, B.games)

  // prediction from Score diff
  const { pA, pB, diff } = predictProb(A.score, B.score, 'neutral')
  const favorite = pA >= pB ? (A.name || 'Team A') : (B.name || 'Team B')
  const margin = diff // interpret Score Δ as margin proxy (small magnitude)
  const projectedScore = {
    [A.name]: Math.max(7, Math.round(aPfPer * 0.9 + (diff>0 ? 3 : 0))),
    [B.name]: Math.max(7, Math.round(bPfPer * 0.9 + (diff<0 ? 3 : 0))),
  }

  return {
    ok: true,
    year,
    weights: {
      Results: 0.42, SOS: 0.25, Quality: 0.20, Consistency: 0.05, Recency: 0.03,
      Notes: 'Same philosophy as Rankings tab; tiny early-season priors/bonuses applied in the builder.'
    },
    teams: [
      {
        name: A.name,
        rank: A.rank,
        score: A.score,
        results: A.results,
        sos: A.sos,
        quality: A.quality,
        recency: A.rec || 0,
        top10W: A.top10Wins||0,
        top25W: A.top25Wins||0,
        top50W: A.top50Wins||0,
        pfPer: aPfPer,
        paPer: aPaPer,
        offRank: A.offRank,
        defRank: A.defRank,
        breakdown: { Results:A.results, SOS:A.sos, Quality:A.quality, Recency:A.rec||0 }
      },
      {
        name: B.name,
        rank: B.rank,
        score: B.score,
        results: B.results,
        sos: B.sos,
        quality: B.quality,
        recency: B.rec || 0,
        top10W: B.top10Wins||0,
        top25W: B.top25Wins||0,
        top50W: B.top50Wins||0,
        pfPer: bPfPer,
        paPer: bPaPer,
        offRank: B.offRank,
        defRank: B.defRank,
        breakdown: { Results:B.results, SOS:B.sos, Quality:B.quality, Recency:B.rec||0 }
      }
    ],
    prediction: {
      favorite,
      margin,
      confidence: Math.max(pA, pB),
      projectedScore,
      why: `Based on overall Score (Rankings), schedule strength, quality wins, and recent form. Score Δ=${fmt3(diff)}`
    }
  }
}

/* “this season” H2H + common opponents from Rankings rows */
function buildInSeason(A, B){
  if (!A || !B) return { h2h: [], common: [] }
  const aGames = A.games || []
  const bGames = B.games || []

  // H2H this year
  const h2h = aGames
    .filter(g => g.opp === B.name)
    .map(g => ({
      week: g.week ?? 0,
      scoreA: g.for ?? 0,
      scoreB: g.against ?? 0,
      wlA: (g.for ?? 0) > (g.against ?? 0) ? 'W' : 'L',
      loc: g.neutral ? 'N' : (g.home ? 'H' : 'A'),
    }))
    .sort((x,y)=> x.week - y.week)

  // Common opponents snapshot
  const oppSetA = new Set(aGames.map(g=>g.opp))
  const commonOpps = [...new Set(bGames.map(g=>g.opp).filter(o => oppSetA.has(o)))]
  const common = commonOpps.map(opp => {
    const ga = aGames.find(g => g.opp === opp)
    const gb = bGames.find(g => g.opp === opp)
    return {
      opp,
      a: ga ? { wl: (ga.for>ga.against)?'W':'L', score:`${ga.for}-${ga.against}` } : null,
      b: gb ? { wl: (gb.for>gb.against)?'W':'L', score:`${gb.for}-${gb.against}` } : null,
    }
  })

  return { h2h, common }
}

/* ---------------- Main ---------------- */
export default function TeamCompare() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)

  const [teamsIdx, setTeamsIdx] = useState([])
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const [rows, setRows] = useState(null)           // Rankings rows
  const [stats, setStats] = useState(null)         // built from Rankings rows (season)
  const [matchup, setMatchup] = useState(null)     // all-time series (API)
  const [venue, setVenue] = useState('neutral')    // 'neutral' | 'homeA' | 'homeB'

  // load searchable teams list
  useEffect(() => {
    fetchTeamsIndex(year)
      .then(setTeamsIdx)
      .catch(e => setErr(e.message || String(e)))
  }, [year])

  // compute rankings rows for the year (same as Rankings tab)
  useEffect(() => {
    let cancelled = false
    ;(async ()=>{
      try{
        const r = await buildRankingsForYear(year)
        if (!cancelled) setRows(r)
      }catch(e){
        if (!cancelled) setErr(String(e.message || e))
      }
    })()
    return ()=>{ cancelled = true }
  }, [year])

  const t1Meta = useMemo(() => teamsIdx.find(t => t.school===team1) || {}, [teamsIdx, team1])
  const t2Meta = useMemo(() => teamsIdx.find(t => t.school===team2) || {}, [teamsIdx, team2])

  const rowsIndex = useMemo(()=> toTeamIndex(rows || []), [rows])
  const A = useMemo(()=> rowsIndex.get(String(team1||'').toLowerCase()), [rowsIndex, team1])
  const B = useMemo(()=> rowsIndex.get(String(team2||'').toLowerCase()), [rowsIndex, team2])

  // default to top 2 once rows load (keeps old convenience)
  useEffect(()=>{
    if (!rows || !rows.length) return
    if (!team1) setTeam1(rows[0]?.name || '')
    if (!team2) setTeam2(rows[1]?.name || '')
    // eslint-disable-next-line
  }, [rows])

  const onCompare = async () => {
    setBusy(true); setErr(null); setStats(null); setMatchup(null)
    try {
      // 1) season stats from Rankings rows (source of truth)
      const season = buildSeasonStatsFromRankings(A, B, Number(year))
      // adjust prediction for chosen venue
      if (season && season.prediction) {
        const { pA, pB, diff } = predictProb(A?.score||0, B?.score||0, venue)
        season.prediction.confidence = Math.max(pA, pB)
        season.prediction.margin = diff
        season.prediction.why = `Based on Rankings Score & components; venue=${venue}; Score Δ=${fmt3(diff)}`
      }
      setStats(season)

      // 2) all-time h2h (keep your existing API)
      const matchupRes = await fetchMatchup({ team1, team2, year: Number(year) })
      setMatchup(matchupRes)
      if (matchupRes?.ok === false) setErr(prev => prev || matchupRes.message || 'Matchup failed')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  const inSeason = useMemo(()=> buildInSeason(A, B), [A, B])
  const { pA, pB, diff } = useMemo(()=>{
    if (!A || !B) return { pA: 0.5, pB: 0.5, diff: 0 }
    return predictProb(A.score || 0, B.score || 0, venue)
  }, [A, B, venue])

  return (
    <div className="card" style={{ borderRadius:14 }}>
      <h2 style={{ marginBottom:6 }}>Team Comparison</h2>
      <p className="small" style={{ color:'var(--muted)', marginTop:0 }}>
        Pick two teams to compare using the <b>same numbers as Rankings</b>, see a prediction, this-season head-to-head & common opponents, and all-time series history.
      </p>

      {/* Inputs */}
      <div className="row" style={{ marginTop: 12, gap: 16, flexWrap:'wrap' }}>
        <TeamPicker label="Team A" value={team1} onChange={setTeam1} teams={teamsIdx} />
        <TeamPicker label="Team B" value={team2} onChange={setTeam2} teams={teamsIdx} />
        <div style={{ minWidth:140 }}>
          <label className="small" style={{ color:'var(--muted)' }}>Season</label>
          <input className="input" type="number" value={year} onChange={e => setYear(Number(e.target.value)||thisYear)} />
        </div>
        <button className="btn" disabled={busy || !team1 || !team2} onClick={onCompare}>
          {busy ? 'Crunching…' : 'Compare'}
        </button>
                <div className="row" style={{ gap: 8, alignItems:'end' }}>
          <label className="small" style={{ color:'var(--muted)' }}>Venue</label>
          <select className="input" value={venue} onChange={e=>setVenue(e.target.value)}>
            <option value="neutral">Neutral</option>
            <option value="homeA">Home (Team A)</option>
            <option value="homeB">Home (Team B)</option>
          </select>
        </div>
      </div>

      {err && <div className="progress" style={{ marginTop:12 }}><span className="badge err">Error</span> {err}</div>}

      {/* Quick prediction badges (live from current picks; button refines + loads H2H history) */}
      {A && B && (
        <div className="row" style={{ marginTop: 12, gap: 12, flexWrap:'wrap' }}>
          <span className="badge" title="Probability Team A wins">
            {A.name}: {(pA*100).toFixed(1)}%
          </span>
          <span className="badge" title="Probability Team B wins">
            {B.name}: {(pB*100).toFixed(1)}%
          </span>
          <span className="badge" title="Score difference baseline (A - B)">
            Score Δ: {fmt3(diff)} ({venue})
          </span>
          <span className="badge" title="Ranking positions">
            Ranks: #{A.rank} vs #{B.rank}
          </span>
        </div>
      )}

      {/* Results */}
      {A && B && (
        <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'minmax(520px,1fr) 420px', gap:16 }}>
          {/* LEFT: Traits + overall (from Rankings rows) */}
          <div className="card" style={{ padding:16, borderRadius:14 }}>
            <div className="row" style={{ gap:10, alignItems:'center', marginBottom:8 }}>
              {A.logo && <img src={A.logo} alt="" style={{ width:28, height:28, borderRadius:6, objectFit:'contain' }} />}
              <b>{A.name}</b>
              <span className="small" style={{ color:'var(--muted)' }}>vs</span>
              <b>{B.name}</b>
              {B.logo && <img src={B.logo} alt="" style={{ width:28, height:28, borderRadius:6, objectFit:'contain' }} />}
            </div>

            <ProbDonut
              left={A.score}
              right={B.score}
              leftLabel={A.name}
              rightLabel={B.name}
            />

            <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,.08)', paddingTop:12 }}>
              {/* Header row for columns */}
              <div style={{ display:'grid', gridTemplateColumns:'160px 1fr 1fr', gap:12, marginBottom:6 }}>
                <div className="small" style={{ color:'var(--muted)' }}>Trait</div>
                <div className="small" style={{ color:'var(--muted)' }}>
                  <div className="row" style={{ gap:6, alignItems:'center' }}>
                    {A.logo && <img src={A.logo} alt="" style={{ width:14, height:14, borderRadius:3, objectFit:'contain' }}/>}
                    {A.name}
                  </div>
                </div>
                <div className="small" style={{ color:'var(--muted)' }}>
                  <div className="row" style={{ gap:6, alignItems:'center' }}>
                    {B.logo && <img src={B.logo} alt="" style={{ width:14, height:14, borderRadius:3, objectFit:'contain' }}/>}
                    {B.name}
                  </div>
                </div>
              </div>

              {/* Replace SP+ Overall with Score (Rankings source of truth) */}
              <TraitRow label="Score"        a={A.score}      b={B.score}      better="high" fmt={fmt3} tip="Overall ranking score" />
              <TraitRow label="Off Rank"     a={A.offRank}    b={B.offRank}    better="low"  fmt={(x)=>x} tip="Lower rank is better" />
              <TraitRow label="Def Rank"     a={A.defRank}    b={B.defRank}    better="low"  fmt={(x)=>x} tip="Lower rank is better" />
              <TraitRow label="SOS"          a={A.sos}        b={B.sos}        better="high" fmt={fmt3} tip="Strength of Schedule" />
              <TraitRow label="Top 10 Wins"  a={A.top10Wins}  b={B.top10Wins}  better="high" fmt={(x)=>x} />
              <TraitRow label="Top 25 Wins"  a={A.top25Wins}  b={B.top25Wins}  better="high" fmt={(x)=>x} />
              <TraitRow label="Top 50 Wins"  a={A.top50Wins}  b={B.top50Wins}  better="high" fmt={(x)=>x} />
              <TraitRow label="PF / G"       a={perGame(A.pf,A.games)} b={perGame(B.pf,B.games)} better="high" fmt={fmt1} />
              <TraitRow label="PA / G"       a={perGame(A.pa,A.games)} b={perGame(B.pa,B.games)} better="low"  fmt={fmt1} />
              <TraitRow label="Recency (L3)" a={A.rec||0}     b={B.rec||0}     better="high" fmt={fmt2} tip="Normalized last-3 differential" />

              {/* Optional breakdown (mirrors Rankings components) */}
              <details style={{ marginTop:10 }}>
                <summary className="small">How we score (weights + per-team breakdown)</summary>
                <pre className="small" style={{ whiteSpace:'pre-wrap' }}>
{JSON.stringify({
  Results: 0.42, SOS: 0.25, Quality: 0.20, Consistency: 0.05, Recency: 0.03
}, null, 2)}
                </pre>
                <div className="row" style={{ gap:16, marginTop:6 }}>
                  <div className="small"><b>{A.name}</b><br/>{JSON.stringify({Results:A.results, SOS:A.sos, Quality:A.quality, Recency:A.rec||0}, null, 2)}</div>
                  <div className="small"><b>{B.name}</b><br/>{JSON.stringify({Results:B.results, SOS:B.sos, Quality:B.quality, Recency:B.rec||0}, null, 2)}</div>
                </div>
              </details>
            </div>
          </div>

          {/* RIGHT: Prediction (from Rankings diff, respects venue) */}
          <div className="card" style={{ padding:16, borderRadius:14 }}>
            <div className="row" style={{ gap:10, alignItems:'center' }}>
              <span className="badge">Prediction</span>
              <span className="small" style={{ color:'var(--muted)' }}>Season {year}</span>
            </div>
            
            <div style={{ marginTop:14, display:'grid', gap:14 }}>
              <div className="row" style={{ gap:10, alignItems:'center' }}>
                {(pA >= pB ? A.logo : B.logo) && (
                  <img src={(pA >= pB ? A.logo : B.logo)} alt="" style={{ width:36, height:36, borderRadius:8, objectFit:'contain' }} />
                )}
                <div>
                  <div className="small" style={{ color:'var(--muted)' }}>Favored</div>
                  <div style={{ fontSize:20, fontWeight:800 }}>
                    {(pA >= pB ? A.name : B.name)} by {Math.abs(diff).toFixed(1)}
                  </div>
                  <div className="small">Confidence: {Math.round(Math.max(pA,pB)*100)}%</div>
                </div>
              </div>

              <div>
                <div className="small" style={{ color:'var(--muted)' }}>Projected Score</div>
                <div style={{ fontSize:18, fontWeight:800, marginTop:4 }}>
                  {A.name} {Math.max(7, Math.round(perGame(A.pf,A.games)*0.9 + (diff>0?3:0)))}
                  {' '}–{' '}
                  {B.name} {Math.max(7, Math.round(perGame(B.pf,B.games)*0.9 + (diff<0?3:0)))}
                </div>
              </div>

              <div>
                <div className="small" style={{ color:'var(--muted)' }}>Why</div>
                <div className="small" style={{ marginTop:4, lineHeight:1.4 }}>
                  Rankings Score differential, strength of schedule, quality wins, recent form, and venue tilt ({venue}).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* This-season H2H & Common Opponents (from Rankings rows) */}
      {A && B && (
        <div className="row" style={{ marginTop:16, gap: 24, flexWrap:'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ margin: '6px 0 8px' }}>Head-to-Head (this season)</h3>
            {inSeason.h2h.length ? (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left' }}>
                    <th style={{ padding:'6px' }}>Week</th>
                    <th style={{ padding:'6px' }}>Loc</th>
                    <th style={{ padding:'6px' }}>{A.name}</th>
                    <th style={{ padding:'6px' }}>{B.name}</th>
                    <th style={{ padding:'6px' }}>W/L ({A.name})</th>
                  </tr>
                </thead>
                <tbody>
                  {inSeason.h2h.map((g, i)=>(
                    <tr key={i} style={{ borderTop:'1px solid #1b2447' }}>
                      <td style={{ padding:'6px' }}>{g.week}</td>
                      <td style={{ padding:'6px' }}>{g.loc}</td>
                      <td style={{ padding:'6px' }}>{g.scoreA}</td>
                      <td style={{ padding:'6px' }}>{g.scoreB}</td>
                      <td style={{ padding:'6px' }}>{g.wlA}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="small">No H2H game recorded this season.</div>}
          </div>

          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ margin: '6px 0 8px' }}>Common Opponents (this season)</h3>
            {inSeason.common.length ? (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left' }}>
                    <th style={{ padding:'6px' }}>Opponent</th>
                    <th style={{ padding:'6px' }}>{A.name}</th>
                    <th style={{ padding:'6px' }}>{B.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {inSeason.common.map((r, i)=>(
                    <tr key={i} style={{ borderTop:'1px solid #1b2447' }}>
                      <td style={{ padding:'6px' }}>{r.opp}</td>
                      <td style={{ padding:'6px' }}>{r.a ? `${r.a.wl} ${r.a.score}` : '—'}</td>
                      <td style={{ padding:'6px' }}>{r.b ? `${r.b.wl} ${r.b.score}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="small">No common opponents yet.</div>}
          </div>
        </div>
      )}

      {/* All-time Head-to-Head (API) */}
      {matchup && (
        <div className="card" style={{ marginTop:16, borderRadius:14 }}>
          <h3>All-time Head-to-Head</h3>
          {matchup.ok && matchup.data?.games?.length ? (
            <>
              <div className="row" style={{ gap:10 }}>
                <span className="badge">Series</span>
                <div className="small">
                  {matchup.data.team1}: <b>{matchup.data.team1Wins}</b> • {matchup.data.team2}: <b>{matchup.data.team2Wins}</b> • Ties: <b>{matchup.data.ties}</b>
                </div>
              </div>
              <table className="table" style={{ marginTop:10 }}>
                <thead>
                  <tr>
                    <th className="small">Season</th>
                    <th className="small">Date</th>
                    <th className="small">Site</th>
                    <th className="small">Home</th>
                    <th className="small">Away</th>
                    <th className="small">Score</th>
                    <th className="small">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {matchup.data.games.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map((g,i)=>(
                    <tr key={i}>
                      <td className="small">{g.season}</td>
                      <td className="small">{new Date(g.date).toLocaleDateString()}</td>
                      <td className="small">{g.neutralSite ? 'Neutral' : (g.venue || '—')}</td>
                      <td className="small">{g.homeTeam} {g.homeScore!=null ? `(${g.homeScore})` : ''}</td>
                      <td className="small">{g.awayTeam} {g.awayScore!=null ? `(${g.awayScore})` : ''}</td>
                      <td className="small">{g.homeScore!=null && g.awayScore!=null ? `${g.homeScore}–${g.awayScore}` : '—'}</td>
                      <td className="small">{g.winner || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="small" style={{ color:'var(--muted)' }}>
              {matchup.ok ? 'These teams have never played.' : (matchup.message || 'Could not load head-to-head.')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
