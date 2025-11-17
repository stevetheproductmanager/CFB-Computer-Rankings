// src/views/NarrativeExplorer.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildRankingsForYear } from '../lib/buildRankings.js'
import { confColor } from '../lib/confColors.js'
import TeamLogo from '../components/TeamLogo.jsx'

/* ----------------- small helpers ----------------- */

const fmt1 = (n) =>
  n == null ? '—' : (typeof n === 'number' ? n : Number(n)).toFixed(1)

const fmt2 = (n) =>
  n == null ? '—' : (typeof n === 'number' ? n : Number(n)).toFixed(2)

const fmt3 = (n) =>
  n == null ? '—' : (typeof n === 'number' ? n : Number(n)).toFixed(3)

const cx = (...xs) => xs.filter(Boolean).join(' ')

/* relative “importance” of a game for narrative purposes */
function computeNarrativeWeight({ winnerRank, loserRank, margin, isRoad, isNeutral }) {
  let w = 1

  // Beat a good team
  if (loserRank <= 10) w += 2.0
  else if (loserRank <= 25) w += 1.5
  else if (loserRank <= 50) w += 1.0

  // Upset (worse-ranked team beating a better-ranked team)
  if (winnerRank > loserRank && loserRank < 200) w += 0.5

  // Margin
  if (margin >= 21) w += 0.6
  else if (margin >= 14) w += 0.3

  // Road / neutral
  if (isRoad) w += 0.4
  if (isNeutral) w += 0.2

  return Number(w.toFixed(2))
}

/* Build a directed graph of “narrative” edges from Rankings rows */
function buildNarrativeEdges(rows) {
  const rankByName = new Map()
  rows.forEach((t) => rankByName.set(t.name, t.rank ?? 999))

  const edges = []
  const seen = new Set()

  for (const t of rows || []) {
    const games = t.games || []
    for (const g of games) {
      const aName = t.name
      const bName = g.opp
      if (!aName || !bName) continue

      const aScore = g.for ?? 0
      const bScore = g.against ?? 0
      if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue

      const isATeamWinner = aScore > bScore
      const winner = isATeamWinner ? aName : bName
      const loser = isATeamWinner ? bName : aName

      // dedupe using winner/loser/score/week key
      const key = [
        winner,
        loser,
        g.week ?? 'na',
        Math.max(aScore, bScore),
        Math.min(aScore, bScore),
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const winnerRank = rankByName.get(winner) ?? 999
      const loserRank = rankByName.get(loser) ?? 999
      const margin = Math.abs(aScore - bScore)
      const isNeutral = !!g.neutral
      const isHome = !!g.home && !g.neutral
      const isRoad = !g.home && !g.neutral && isATeamWinner === (winner === aName)

      const weight = computeNarrativeWeight({
        winnerRank,
        loserRank,
        margin,
        isRoad,
        isNeutral,
      })

      edges.push({
        id: edges.length,
        winner,
        loser,
        winnerRank,
        loserRank,
        margin,
        week: g.week ?? null,
        neutral: isNeutral,
        // “winnerHome” is just for description; we don’t need precise side for both teams
        winnerHome: isHome && winner === aName,
        winnerRoad: isRoad,
        score: `${aScore}-${bScore}`,
        weight,
      })
    }
  }

  return edges
}

/* Find a short transitive path: start → ... → end (maxHops edges) */
function findNarrativePath(edges, start, end, maxHops = 4) {
  if (!start || !end || start === end) return null

  const adj = new Map()
  for (const e of edges) {
    if (!adj.has(e.winner)) adj.set(e.winner, [])
    adj.get(e.winner).push(e.loser)
  }

  const queue = [{ team: start, depth: 0 }]
  const prev = new Map([[start, null]])
  const depthMap = new Map([[start, 0]])

  while (queue.length) {
    const { team, depth } = queue.shift()
    if (depth >= maxHops) continue

    const neighbors = adj.get(team) || []
    for (const n of neighbors) {
      if (prev.has(n)) continue
      prev.set(n, team)
      depthMap.set(n, depth + 1)

      if (n === end) {
        // reconstruct chain
        const seq = [end]
        let cur = end
        while (prev.get(cur) != null) {
          cur = prev.get(cur)
          seq.push(cur)
        }
        seq.reverse()

        const steps = []
        for (let i = 0; i < seq.length - 1; i++) {
          const w = seq[i]
          const l = seq[i + 1]
          const best = edges
            .filter((e) => e.winner === w && e.loser === l)
            .sort((a, b) => b.weight - a.weight)[0]
          steps.push({ from: w, to: l, game: best || null })
        }
        return { teams: seq, steps }
      }

      queue.push({ team: n, depth: depth + 1 })
    }
  }

  return null
}

/* derive quick lookup from Rankings rows */
function toTeamIndex(rows) {
  const byName = new Map()
  for (const t of rows || []) {
    if (t.name) byName.set(t.name.toLowerCase(), t)
  }
  return byName
}

/* FBS teams list for search dropdowns */
async function fetchTeamsIndex(year) {
  const res = await fetch(`/data/${year}/teams-fbs.json`)
  if (!res.ok) throw new Error(`load teams-fbs.json HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : data.teams || []
}

/* -------------- Team Picker (copied/adapted from TeamCompare) -------------- */

function TeamPicker({ label, value, onChange, teams }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => setQ(value || ''), [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return teams.slice(0, 250)
    return teams
      .filter((t) => {
        const school = t.school?.toLowerCase() || ''
        const mascot = t.mascot?.toLowerCase() || ''
        const abbr = t.abbreviation?.toLowerCase() || ''
        const alt = (t.alternateNames || []).some((n) =>
          String(n).toLowerCase().includes(s),
        )
        return (
          school.includes(s) ||
          mascot.includes(s) ||
          abbr === s ||
          alt
        )
      })
      .slice(0, 250)
  }, [q, teams])

  const selected = useMemo(
    () => teams.find((t) => t.school === value),
    [teams, value],
  )

  return (
    <div ref={box} style={{ minWidth: 260, position: 'relative' }}>
      <label className="small" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      <div
        className="row"
        style={{
          gap: 10,
          alignItems: 'center',
          background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 999,
          padding: '6px 10px',
        }}
      >
        {selected?.logos?.[0] && (
          <img
            src={selected.logos[0]}
            alt=""
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              objectFit: 'contain',
            }}
          />
        )}
        <input
          className="input"
          style={{ background: 'transparent', border: 0, padding: 0 }}
          placeholder="Type to search…"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            if (!open) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) {
              onChange(filtered[0].school)
              setQ(filtered[0].school)
              setOpen(false)
            }
          }}
        />
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 100,
            marginTop: 6,
            width: 360,
            maxWidth: 'min(92vw, 360px)',
            maxHeight: 360,
            overflow: 'auto',
            background: 'var(--panel)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 12,
          }}
        >
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                onChange(t.school)
                setQ(t.school)
                setOpen(false)
              }}
              className="row"
              style={{ gap: 10, padding: '10px 12px', cursor: 'pointer' }}
            >
              {t.logos?.[0] && (
                <img
                  src={t.logos[0]}
                  alt=""
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    objectFit: 'contain',
                  }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13 }}>{t.school}</div>
                <div className="small" style={{ color: 'var(--muted)' }}>
                  {t.conference} • {t.mascot}
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div
              className="small"
              style={{ padding: 12, color: 'var(--muted)' }}
            >
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* -------------- Narrative résumé card -------------- */

function NarrativeResume({ team, edges, title }) {
  if (!team) {
    return (
      <div className="card" style={{ minWidth: 280 }}>
        <h3 style={{ margin: '6px 0 8px' }}>{title}</h3>
        <div className="small" style={{ color: 'var(--muted)' }}>
          Select a team to see its narrative résumé.
        </div>
      </div>
    )
  }

  const name = team.name
  const wins = edges.filter((e) => e.winner === name).sort((a, b) => b.weight - a.weight)
  const losses = edges.filter((e) => e.loser === name).sort((a, b) => b.weight - a.weight)

  const topWins = wins.slice(0, 6)
  const topLosses = losses.slice(0, 4)

  const headerBadgeColor = confColor(team.conference)

  const renderLoc = (e, perspective) => {
    if (e.neutral) return 'N'
    if (perspective === 'win') {
      if (e.winnerHome) return 'H'
      if (e.winnerRoad) return 'A'
    }
    return '—'
  }

  return (
    <div className="card" style={{ minWidth: 280 }}>
      <h3 style={{ margin: '6px 0 8px' }}>{title}</h3>

      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
        {team.logo && <TeamLogo src={team.logo} alt={`${name} logo`} size={26} />}
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div className="small" style={{ color: 'var(--muted)' }}>
            #{team.rank} • {team.w}-{team.l}{' '}
            <span
              className="badge"
              style={{
                marginLeft: 6,
                background: '#0f1533',
                borderColor: '#2a3975',
                color: '#fff',
                borderLeft: `8px solid ${headerBadgeColor}`,
              }}
            >
              {team.conference}
            </span>
          </div>
        </div>
      </div>

      <div className="small" style={{ color: 'var(--muted)', marginBottom: 6 }}>
        Score {fmt3(team.score)} • Results {fmt3(team.results)} • SOS {fmt3(team.sos)} • Quality{' '}
        {fmt3(team.quality)}
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
          Best narrative wins
        </div>
        {topWins.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="small" style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 6px' }}>Opponent</th>
                  <th style={{ padding: '4px 6px' }}>Opp Rk</th>
                  <th style={{ padding: '4px 6px' }}>Wk</th>
                  <th style={{ padding: '4px 6px' }}>Loc</th>
                  <th style={{ padding: '4px 6px' }}>Score</th>
                  <th style={{ padding: '4px 6px' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {topWins.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid #1b2447' }}>
                    <td style={{ padding: '4px 6px' }}>{e.loser}</td>
                    <td style={{ padding: '4px 6px' }}>#{e.loserRank}</td>
                    <td style={{ padding: '4px 6px' }}>{e.week ?? '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{renderLoc(e, 'win')}</td>
                    <td style={{ padding: '4px 6px' }}>{e.score}</td>
                    <td style={{ padding: '4px 6px' }}>{fmt2(e.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="small" style={{ color: 'var(--muted)' }}>
            No notable wins found yet.
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
          Tough / bad losses
        </div>
        {topLosses.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="small" style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 6px' }}>Opponent</th>
                  <th style={{ padding: '4px 6px' }}>Opp Rk</th>
                  <th style={{ padding: '4px 6px' }}>Wk</th>
                  <th style={{ padding: '4px 6px' }}>Score</th>
                  <th style={{ padding: '4px 6px' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {topLosses.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid #1b2447' }}>
                    <td style={{ padding: '4px 6px' }}>{e.winner}</td>
                    <td style={{ padding: '4px 6px' }}>#{e.winnerRank}</td>
                    <td style={{ padding: '4px 6px' }}>{e.week ?? '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{e.score}</td>
                    <td style={{ padding: '4px 6px' }}>{fmt2(e.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="small" style={{ color: 'var(--muted)' }}>
            No losses on record yet.
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------- Narrative path card -------------- */

function NarrativePathCard({ fromTeam, toTeam, edges, maxHops }) {
  const fromName = fromTeam?.name
  const toName = toTeam?.name

  const pathForward = useMemo(
    () => (fromName && toName ? findNarrativePath(edges, fromName, toName, maxHops) : null),
    [edges, fromName, toName, maxHops],
  )

  const pathReverse = useMemo(
    () => (fromName && toName ? findNarrativePath(edges, toName, fromName, maxHops) : null),
    [edges, fromName, toName, maxHops],
  )

  return (
    <div className="card" style={{ minWidth: 320 }}>
      <h3 style={{ margin: '6px 0 8px' }}>Transitive chains</h3>
      {!fromName || !toName ? (
        <div className="small" style={{ color: 'var(--muted)' }}>
          Pick two teams to see “Team A beat Team B beat Team C…” style chains.
        </div>
      ) : (
        <>
          <div className="small" style={{ color: 'var(--muted)', marginBottom: 6 }}>
            Showing shortest chains within {maxHops} hops.
          </div>

          <div style={{ marginTop: 6 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
              {fromName} &rarr; {toName}
            </div>
            {pathForward?.steps?.length ? (
              <ol className="small" style={{ paddingLeft: 18, marginTop: 2 }}>
                {pathForward.steps.map((s, i) => {
                  const g = s.game
                  if (!g) {
                    return (
                      <li key={i}>
                        {s.from} beat {s.to}
                      </li>
                    )
                  }
                  const loc = g.neutral
                    ? 'neutral'
                    : g.winnerHome
                    ? 'home'
                    : g.winnerRoad
                    ? 'road'
                    : ''
                  return (
                    <li key={i} style={{ marginBottom: 2 }}>
                      {g.winner} beat {g.loser}{' '}
                      {g.score && (
                        <>
                          {g.score} {loc && `(${loc})`}
                        </>
                      )}{' '}
                      {g.week != null && <>in Week {g.week}</>}. Weight {fmt2(g.weight)}.
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="small" style={{ color: 'var(--muted)' }}>
                No chain found from {fromName} to {toName} within {maxHops} steps.
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
              {toName} &rarr; {fromName}
            </div>
            {pathReverse?.steps?.length ? (
              <ol className="small" style={{ paddingLeft: 18, marginTop: 2 }}>
                {pathReverse.steps.map((s, i) => {
                  const g = s.game
                  if (!g) {
                    return (
                      <li key={i}>
                        {s.from} beat {s.to}
                      </li>
                    )
                  }
                  const loc = g.neutral
                    ? 'neutral'
                    : g.winnerHome
                    ? 'home'
                    : g.winnerRoad
                    ? 'road'
                    : ''
                  return (
                    <li key={i} style={{ marginBottom: 2 }}>
                      {g.winner} beat {g.loser}{' '}
                      {g.score && (
                        <>
                          {g.score} {loc && `(${loc})`}
                        </>
                      )}{' '}
                      {g.week != null && <>in Week {g.week}</>}. Weight {fmt2(g.weight)}.
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="small" style={{ color: 'var(--muted)' }}>
                No chain found from {toName} to {fromName} within {maxHops} steps.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* -------------- Main page -------------- */

export default function NarrativeExplorer() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)

  const [teamsIdx, setTeamsIdx] = useState([])
  const [teamAName, setTeamAName] = useState('')
  const [teamBName, setTeamBName] = useState('')

  const [rows, setRows] = useState(null)
  const [edges, setEdges] = useState([])
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const [maxHops, setMaxHops] = useState(3)

  // load search index
  useEffect(() => {
    fetchTeamsIndex(year)
      .then(setTeamsIdx)
      .catch((e) => setErr((prev) => prev || String(e.message || e)))
  }, [year])

  // load rankings rows (same builder as Rankings / TeamCompare)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const r = await buildRankingsForYear(Number(year))
        if (cancelled) return
        setRows(r)
        setEdges(buildNarrativeEdges(r || []))

        // default selection: top 2
        if (r && r.length >= 2) {
          setTeamAName((prev) => prev || r[0].name)
          setTeamBName((prev) => prev || r[1].name)
        }
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [year])

  const rowsIndex = useMemo(() => toTeamIndex(rows || []), [rows])
  const teamA = useMemo(
    () => rowsIndex.get(String(teamAName || '').toLowerCase()),
    [rowsIndex, teamAName],
  )
  const teamB = useMemo(
    () => rowsIndex.get(String(teamBName || '').toLowerCase()),
    [rowsIndex, teamBName],
  )

  const totalEdges = edges.length
  const edgesInvolvingA = useMemo(
    () =>
      teamA
        ? edges.filter((e) => e.winner === teamA.name || e.loser === teamA.name)
        : [],
    [edges, teamA],
  )
  const edgesInvolvingB = useMemo(
    () =>
      teamB
        ? edges.filter((e) => e.winner === teamB.name || e.loser === teamB.name)
        : [],
    [edges, teamB],
  )

  return (
    <div className="card" style={{ borderRadius: 14 }}>
      <h2 style={{ marginBottom: 6 }}>Narrative Explorer</h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
        Visualize the committee-style narrative: best wins, bad losses, and
        “Team A beat Team B beat Team C…” transitive chains, using the same
        underlying Scores as the Rankings tab.
      </p>

      {/* Controls */}
      <div
        className="row"
        style={{ marginTop: 12, gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <TeamPicker
          label="Team A"
          value={teamAName}
          onChange={setTeamAName}
          teams={teamsIdx}
        />
        <TeamPicker
          label="Team B"
          value={teamBName}
          onChange={setTeamBName}
          teams={teamsIdx}
        />
        <div style={{ minWidth: 120 }}>
          <label className="small" style={{ color: 'var(--muted)' }}>
            Season
          </label>
          <input
            className="input"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || thisYear)}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="small" style={{ color: 'var(--muted)' }}>
            Max chain length (hops)
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={6}
            value={maxHops}
            onChange={(e) =>
              setMaxHops(() => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return 3
                return Math.max(1, Math.min(6, v))
              })
            }
          />
        </div>
      </div>

      {err && (
        <div className="progress" style={{ marginTop: 10 }}>
          <span className="badge err">Error</span> {err}
        </div>
      )}
      {loading && (
        <div className="progress" style={{ marginTop: 10 }}>
          Building narrative graph…
        </div>
      )}

      {!loading && !err && (
        <>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">
              Teams: {rows?.length || 0}
            </span>
            <span className="badge">
              Narrative edges: {totalEdges}
            </span>
            {teamA && (
              <span className="badge" title="Edges touching Team A">
                {teamA.name}: {edgesInvolvingA.length} edges
              </span>
            )}
            {teamB && (
              <span className="badge" title="Edges touching Team B">
                {teamB.name}: {edgesInvolvingB.length} edges
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'minmax(280px,1fr) minmax(280px,1fr)',
              gap: 16,
            }}
          >
            <NarrativeResume team={teamA} edges={edges} title="Team A résumé" />
            <NarrativeResume team={teamB} edges={edges} title="Team B résumé" />
          </div>

          <div style={{ marginTop: 16 }}>
            <NarrativePathCard
              fromTeam={teamA}
              toTeam={teamB}
              edges={edges}
              maxHops={maxHops}
            />
          </div>
        </>
      )}
    </div>
  )
}
