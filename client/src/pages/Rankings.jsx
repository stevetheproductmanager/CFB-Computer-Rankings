import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { rankTeams } from '../lib/rankAlgo'
import { confColor } from '../lib/confColors'
import { getManifest, getCachedManifest } from '../store/dataState';
import { useTheme } from '../theme/ThemeProvider.jsx'
import  TeamLogo from '../components/TeamLogo.jsx'

async function fetchJSON(path){
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed ${path} (${res.status})`)
  return res.json()
}

const fmt = (n, d=3) => (typeof n === 'number' ? n : 0).toFixed(d)
const fmt0 = (n) => (typeof n === 'number' ? Math.round(n) : 0)

function CopyButton({ payload }) {
  const [ok, setOk] = React.useState(false);

  const handleClick = async (e) => {
    e?.stopPropagation?.();
    await navigator.clipboard.writeText(payload);
    setOk(true);
    setTimeout(() => setOk(false), 1200);
  };

  return (
    <button className="btn copy-btn" onClick={handleClick} title="Copy summary">
      {ok ? <span className="checkmark">✓</span> : <span className="copy-text">Copy</span>}
    </button>
  );
}



/** Mini bars visual without any libs */
function Bars({ items }) {
  const maxAbs = Math.max( ...items.map(i => Math.abs(i.maxAbs ?? i.value ?? 0)), 1 )
  return (
    <div className="bars">
      {items.map((it) => {
        const v = Number(it.value || 0)
        const w = Math.min(100, Math.abs(v) / maxAbs * 100)
        const pos = v >= 0
        return (
          <div key={it.label} className="bar-row" title={it.hint || `${it.label}: ${fmt(v)}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className={`bar-fill ${pos ? 'pos' : 'neg'}`} style={{ width: `${w}%` }} />
            </div>
            <div className="bar-val">{fmt(v,3)}</div>
          </div>
        )
      })}
    </div>
  )
}

function GameTable({ team, rankMap, teamMap }) {
  const rows = (team?.games || []).map(g => {
    const oppObj = teamMap.get(g.opp)
    const oppConf = oppObj?.conference || 'Unknown'
    const oppRank = rankMap.get(g.opp) || '—'
    const loc = g.neutral ? 'N' : (g.home ? 'H' : 'A')
    const win = g.for > g.against
    return {
      opp: g.opp,
      oppConf,
      oppRank,
      loc,
      score: `${g.for}-${g.against}`,
      wl: win ? 'W' : 'L',
      week: g.week || 0
    }
  }).sort((a,b)=>a.week - b.week)

  if (!rows.length) return <div className="small">No games played.</div>

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ textAlign:'left' }}>
            <th style={{ padding:'6px' }}>Week</th>
            <th style={{ padding:'6px' }}>Opponent</th>
            <th style={{ padding:'6px' }}>Conf</th>
            <th style={{ padding:'6px' }}>Opp Rank</th>
            <th style={{ padding:'6px' }}>H/A/N</th>
            <th style={{ padding:'6px' }}>Score</th>
            <th style={{ padding:'6px' }}>W/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=>(
            <tr key={i} style={{ borderTop:'1px solid #1b2447' }}>
              <td style={{ padding:'6px' }}>{r.week}</td>
              <td style={{ padding:'6px' }}>{r.opp}</td>
              <td style={{ padding:'6px' }}>
                <span
                  className="badge"
                  style={{ background:'#0f1533', borderColor:'#2a3975', color:'#fff', borderLeft:`8px solid ${confColor(r.oppConf)}` }}
                >
                  {r.oppConf}
                </span>
              </td>
              <td style={{ padding:'6px' }}>{r.oppRank}</td>
              <td style={{ padding:'6px' }}>{r.loc}</td>
              <td style={{ padding:'6px' }}>{r.score}</td>
              <td style={{ padding:'6px', fontWeight:700, color: r.wl === 'W' ? '#1a7935ff' : '#ff0000ff' }}>{r.wl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Drawer({ open, team, onClose, onPrev, onNext, rankMap, teamMap }) {
  // Close on ESC + ←/→ nav
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

  if (!open || !team) return null

  const {
    name, conference, rank, w, l, results, sos, quality, rec, games,
    score, top10Wins, top25Wins, top50Wins, pf, pa, offRank, defRank
  } = team

  const bars = [
    { label: 'Results', value: results, hint: 'Win/Loss + MOV + venue (per-game)' },
    { label: 'SOS', value: sos, hint: 'Iterative strength + opponents’ win%' },
    { label: 'Quality', value: quality, hint: 'Top-10/25/50 wins; bad losses debits (per-game)' },
    { label: 'Recency', value: rec || 0, hint: 'Recent games weigh slightly more' },
  ]

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <button className="nav-btn" onClick={onPrev} title="Previous (←)">←</button>
          <div className="drawer-title">
            <div className="drawer-rank">#{rank}</div>
            <div className="drawer-name">{name}</div>
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
            <div className="kpi"><div className="kpi-label">Record</div><div className="kpi-val">{w}-{l}</div></div>
            <div className="kpi"><div className="kpi-label">Score</div><div className="kpi-val">{fmt(score,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Top 10 W</div><div className="kpi-val">{top10Wins||0}</div></div>
            <div className="kpi"><div className="kpi-label">Top 25 W</div><div className="kpi-val">{top25Wins||0}</div></div>
            <div className="kpi"><div className="kpi-label">Top 50 W</div><div className="kpi-val">{top50Wins||0}</div></div>
            <div className="kpi"><div className="kpi-label">PF</div><div className="kpi-val">{fmt0(pf)}</div></div>
            <div className="kpi"><div className="kpi-label">PA</div><div className="kpi-val">{fmt0(pa)}</div></div>
            <div className="kpi"><div className="kpi-label">Off Rank</div><div className="kpi-val">{offRank || '—'}</div></div>
            <div className="kpi"><div className="kpi-label">Def Rank</div><div className="kpi-val">{defRank || '—'}</div></div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '8px 0 6px' }}>How this score is built</h3>
            <Bars items={bars} />
            <div className="small" style={{ marginTop: 6 }}>
              Weights: Results 42%, SOS 25%, Quality 20%, Consistency 5%, Recency 3% (+ small early-season prior). Undefeated bonus and stronger bad-loss debits applied.
            </div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '12px 0 6px' }}>2025 Games</h3>
            <GameTable team={team} rankMap={rankMap} teamMap={teamMap} />
          </div>

          <div className="drawer-section">
            <div className="row" style={{ gap: 6 }}>
              <CopyButton payload={
                `#${rank} ${name} (${conference}) — Score ${fmt(score,3)} | Results ${fmt(results,3)}, SOS ${fmt(sos,3)}, Quality ${fmt(quality,3)}, Recency ${fmt(rec||0,3)} | T10W ${top10Wins||0}, T25W ${top25Wins||0}, T50W ${top50Wins||0}, PF ${fmt0(pf)}, PA ${fmt0(pa)}, OffR ${offRank||'—'}, DefR ${defRank||'—'}`
              }/>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function Rankings(){
  const { theme } = useTheme(); // NEW
  const [year, setYear] = useState(2025)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [rows, setRows] = useState([])
  const [manifest, setManifest] = useState(getCachedManifest())
  const [note, setNote] = useState(null)

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0) // index in rows for the drawer

  const [logoMap, setLogoMap] = useState(() => new Map())
  const [logoDarkMap, setLogoDarkMap] = useState(() => new Map())

  const current = rows[idx]

  const openAt = useCallback((i) => { setIdx(i); setOpen(true) }, [])
  const onPrev = useCallback(() => { setIdx(i => (i <= 0 ? rows.length - 1 : i - 1)) }, [rows.length])
  const onNext = useCallback(() => { setIdx(i => (i >= rows.length - 1 ? 0 : i + 1)) }, [rows.length])

  // Build fast lookup maps for drawer table + extra columns
  const rankMap = useMemo(() => {
    const m = new Map()
    rows.forEach(t => m.set(t.name, t.rank))
    return m
  }, [rows])

  const teamMap = useMemo(() => {
    const m = new Map()
    rows.forEach(t => m.set(t.name, t))
    return m
  }, [rows])

  // After ranking, compute extra derived columns (top wins, PF/PA, offense/defense rank)
  const enrichTeams = useCallback((ranked) => {
    const rMap = new Map(ranked.map(t => [t.name, t.rank]))
    // PF/PA totals
    for (const t of ranked) {
      let pf = 0, pa = 0, t10=0, t25=0, t50=0
      const games = t.games || []
      for (const g of games) {
        pf += (g.for || 0)
        pa += (g.against || 0)
        const oppRank = rMap.get(g.opp) || 999
        const win = (g.for || 0) > (g.against || 0)
        if (win) {
          if (oppRank <= 10) t10++
          if (oppRank <= 25) t25++
          if (oppRank <= 50) t50++
        }
      }
      t.pf = pf; t.pa = pa
      t.top10Wins = t10; t.top25Wins = t25; t.top50Wins = t50
    }
    // Offense = PF per game (higher better), Defense = PA per game (lower better)
    const withUsage = ranked.map(t => {
      const gp = (t.games || []).length || 1
      return {
        name: t.name,
        off: t.pf / gp,
        def: t.pa / gp
      }
    })
    // offense rank descending
    const offOrder = [...withUsage].sort((a,b)=> b.off - a.off)
    const offPos = new Map(offOrder.map((t,i)=>[t.name, i+1]))
    // defense rank ascending (lower PA better)
    const defOrder = [...withUsage].sort((a,b)=> a.def - b.def)
    const defPos = new Map(defOrder.map((t,i)=>[t.name, i+1]))

    for (const t of ranked) {
      t.offRank = offPos.get(t.name)
      t.defRank = defPos.get(t.name)
    }
    return ranked
  }, [])

useEffect(() => {
  let cancelled = false;
  async function run() {
    setLoading(true); setErr(null); setNote(null);
    try {
      const m = await getManifest(Number(year));
      if (cancelled) return;
      setManifest(m);

      // Prefer ALL teams (FBS+FCS) so FCS games count in W-L/Results/SOS/etc.
      const teamsPromise = fetch(`/data/${year}/teams.json`)
        .then(async r => {
          if (r.ok) return r.json();
          // fallback to FBS-only if teams.json missing
          const r2 = await fetch(`/data/${year}/teams-fbs.json`);
          if (!r2.ok) throw new Error(`Failed /data/${year}/teams.json (${r.status}) and /teams-fbs.json (${r2.status})`);
          return r2.json();
        });

      const gamesPromise = fetch(`/data/${year}/games-regular.json`)
        .then(r => { if (!r.ok) throw new Error(`Failed /data/${year}/games-regular.json (${r.status})`); return r.json(); });

      // Optional early-season prior (OK if missing)
      const spPromise = fetch(`/data/${year}/sp-ratings.json`)
        .then(r => r.ok ? r.json() : []);

      const [teams, games, sp] = await Promise.all([teamsPromise, gamesPromise, spPromise]);

      if (cancelled) return;

      // Build logo map from teams data
      const lm = new Map(); // primary/color logo only

      for (const t of teams || []) {
        const primary = Array.isArray(t.logos) && t.logos.length ? t.logos[0] : null;
        if (t.school) lm.set(t.school, primary);
        if (t.abbreviation) lm.set(t.abbreviation, primary);
        if (Array.isArray(t.alternateNames)) t.alternateNames.forEach(n => lm.set(n, primary));
      }

      setLogoMap(lm);

      let ranked = rankTeams({ teamsRaw: teams, gamesRaw: games, spRaw: sp });

      // Tiny UI-side undefeated nudge / early multi-loss soft debit to keep table intuitive.
      for (const t of ranked) {
        const gp = (t.games || []).length;
        if (gp >= 3 && t.l === 0) t.score += 0.01;
        if (t.l >= 2 && gp <= 5) t.score -= 0.01;
      }
      ranked.sort((a, b) => b.score - a.score);
      ranked.forEach((t, i) => (t.rank = i + 1));

      ranked = enrichTeams(ranked);

      // attach logo url if available
 for (const t of ranked) {
t.logo = lm.get(t.name) || null;
 }

      if (ranked.every(t => (t.w || 0) + (t.l || 0) === 0)) {
        setNote('No games were attached to teams. Check that game team IDs/names align with the teams file.');
      }
      setRows(ranked);
      setIdx(0);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }
  run();
  return () => { cancelled = true; };
}, [year, enrichTeams]);



  return (
    <div className="card">
      <h2>Rankings</h2>
      <div className="row" style={{ marginTop: 8 }}>
        <label>Season</label>
        <input className="input" type="number" value={year} onChange={e=>setYear(e.target.value)} />
        <span className="small">Computed locally from downloaded JSON.</span>
        {manifest?.files?.length > 0 && (
          <span className="badge" title={`Found ${manifest.files.length} files for ${manifest.year}`}>
            Files: {manifest.files.length}
          </span>
        )}
      </div>

      {err && <div className="progress"><span className="badge err">Error</span> {err}</div>}
      {note && <div className="progress"><span className="badge warn">Note</span> {note}</div>}
      {loading && <div className="progress">Building rankings…</div>}

      {!loading && !err && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ textAlign:'left' }}>
                <th style={{ padding:'8px' }}>#</th>
                <th style={{ padding:'8px' }}>Team</th>
                <th style={{ padding:'8px' }}>Conf</th>
                <th style={{ padding:'8px' }}>W-L</th>
                <th style={{ padding:'8px' }}>Results</th>
                <th style={{ padding:'8px' }}>SOS Rank</th>
                <th style={{ padding:'8px' }}>SOS</th>
                <th style={{ padding:'8px' }}>Quality</th>
                <th style={{ padding:'8px' }}>Recency</th>
                <th style={{ padding:'8px' }}>Top 10 W</th>
                <th style={{ padding:'8px' }}>Top 25 W</th>
                <th style={{ padding:'8px' }}>Top 50 W</th>
                <th style={{ padding:'8px' }}>PF</th>
                <th style={{ padding:'8px' }}>PA</th>
                <th style={{ padding:'8px' }}>Off Rk</th>
                <th style={{ padding:'8px' }}>Def Rk</th>
                <th style={{ padding:'8px' }}>Score</th>
                <th style={{ padding:'8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const payload =
                  `${t.rank}. ${t.name} — Score: ${fmt(t.score,3)} | ` +
                  `Results: ${fmt(t.results,3)}, SOS Rank: #${fmt(t.sosRank,0)}, Quality: ${fmt(t.quality,3)}, Recency: ${fmt(t.rec||0,3)} | ` +
                  `T10W: ${t.top10Wins||0}, T25W: ${t.top25Wins||0}, T50W: ${t.top50Wins||0}, ` +
                  `Off Rk: #${t.offRank||'—'}, Def Rk: #${t.defRank||'—'}`
                return (
                  <tr
                    key={t.name}
                    style={{ borderTop:'1px solid #1b2447', cursor:'pointer' }}
                    onClick={() => openAt(i)}
                  >
                    <td style={{ padding:'8px' }}>{t.rank}</td>
                    <td style={{ padding:'8px', display:'flex', alignItems:'center', gap:8 }}>
                    {t.logo && (
                      <TeamLogo src={t.logo} alt={`${t.name} logo`} size={24} />
                    )}
                      <span>{t.name}</span>
                    </td>
                    <td style={{ padding:'8px' }}>
                      <span
                        className="badge"
                        style={{ background:'#0f1533', borderColor:'#2a3975', color:'#fff', borderLeft:`8px solid ${confColor(t.conference)}` }}
                        title={t.conference}
                      >
                        {t.conference}
                      </span>
                    </td>
                    <td style={{ padding:'8px' }}>{t.w}-{t.l}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.results)}</td>
                    <td style={{ padding:'8px' }}>{t.sosRank ?? '—'}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.sos)}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.quality)}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.rec || 0)}</td>
                    <td style={{ padding:'8px' }}>{t.top10Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{t.top25Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{t.top50Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{fmt0(t.pf)}</td>
                    <td style={{ padding:'8px' }}>{fmt0(t.pa)}</td>
                    <td style={{ padding:'8px' }}>{t.offRank || '—'}</td>
                    <td style={{ padding:'8px' }}>{t.defRank || '—'}</td>
                    <td style={{ padding:'8px', fontWeight:700 }}>{fmt(t.score,3)}</td>
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
        team={current}
        onClose={() => setOpen(false)}
        onPrev={onPrev}
        onNext={onNext}
        rankMap={rankMap}
        teamMap={teamMap}
      />
    </div>
  )
}
