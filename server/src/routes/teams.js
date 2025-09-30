// server/src/routes/teams.js
import express from 'express'
import { writeJson } from '../save.js'

export default function makeTeamsRouter({ baseURL, apiKey }) {
  const router = express.Router()

  async function cfbdGet(pathAndQuery) {
    const url = `${baseURL}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    const data = await res.json().catch(() => null)
    return { status: res.status, data }
  }

  // ---------- helpers ----------
  const clamp01 = (x) => Math.max(0, Math.min(1, x))
  const avg = (xs) => xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0

  async function ratingsSP(year, team) {
    const r = await cfbdGet(`/ratings/sp?year=${year}${team ? `&team=${encodeURIComponent(team)}`:''}`)
    if (r.status !== 200) throw new Error(`CFBD /ratings/sp ${r.status}`)
    return r.data
  }

  async function gamesFor(year, team) {
    const r = await cfbdGet(`/games?year=${year}&team=${encodeURIComponent(team)}`)
    if (r.status !== 200) throw new Error(`CFBD /games ${r.status}`)
    return r.data
  }

  function buildRanks(all) {
    const overall = all.slice().sort((a,b)=>(b.rating??-1)-(a.rating??-1))
    const off =    all.slice().sort((a,b)=>(b.offense?.rating??-1)-(a.offense?.rating??-1))
    const def =    all.slice().sort((a,b)=>(b.defense?.rating??-1)-(a.defense?.rating??-1))
    const index = {}
    overall.forEach((t,i)=> index[t.team] = {
      team: t.team,
      rank: i+1,
      rating: t.rating,
      off: t.offense?.rating,
      def: t.defense?.rating,
      offRank: off.findIndex(x=>x.team===t.team)+1,
      defRank: def.findIndex(x=>x.team===t.team)+1,
      sos: t.strengthOfSchedule ?? t.SOS
    })
    return index
  }

  async function seasonBundle(team, year) {
    const [spTeam, spAll, games] = await Promise.all([
      ratingsSP(year, team),        // filtered to team
      ratingsSP(year, undefined),   // full list for ranks
      gamesFor(year, team)
    ])
    const spRow = spTeam?.[0] || {}
    const idx = buildRanks(spAll || [])
    const i = idx[team] || {}
    const played = (games || []).filter(g => g.home_points!=null && g.away_points!=null)

    const pf = played.reduce((sum,g)=>{
      const home = g.home_team === team
      return sum + (home ? g.home_points : g.away_points)
    }, 0)
    const pa = played.reduce((sum,g)=>{
      const home = g.home_team === team
      return sum + (home ? g.away_points : g.home_points)
    }, 0)

    const pfPer = played.length ? pf/played.length : null
    const paPer = played.length ? pa/played.length : null

    const diffs = played
      .slice()
      .sort((a,b)=> new Date(a.start_date) - new Date(b.start_date))
      .map(g=>{
        const home = g.home_team === team
        const us = home ? g.home_points : g.away_points
        const them = home ? g.away_points : g.home_points
        return (us??0)-(them??0)
      })
    const recency = clamp01((avg(diffs.slice(-3)) + 21) / 42)

    // top-N wins by opponent SP rank
    let top10W=0, top25W=0, top50W=0
    for (const g of played) {
      const home = g.home_team === team
      const us = home ? g.home_points : g.away_points
      const them = home ? g.away_points : g.home_points
      if ((us??-1) > (them??-1)) {
        const opp = home ? g.away_team : g.home_team
        const r = idx[opp]?.rank
        if (r) {
          if (r<=10) top10W++
          if (r<=25) top25W++
          if (r<=50) top50W++
        }
      }
    }

    return {
      team,
      sp: {
        rating: spRow.rating ?? null,
        off: spRow.offense?.rating ?? null,
        def: spRow.defense?.rating ?? null,
        rank: i.rank ?? null,
        offRank: i.offRank ?? null,
        defRank: i.defRank ?? null
      },
      sos: i.sos ?? null,
      pfPer, paPer,
      recency,
      top10W, top25W, top50W,
      playedCount: played.length
    }
  }

  const WEIGHTS = {
    spOverall: 0.18,
    offRank:   0.18,
    defRank:   0.18,
    sos:       0.10,
    top10W:    0.08,
    top25W:    0.08,
    top50W:    0.05,
    pfPer:     0.07,
    paPer:     0.04,
    recency:   0.04
  }

  function scorePair(a, b) {
    const fields = {
      spOverall: { better: 'high', a: a.sp.rating, b: b.sp.rating },
      offRank:   { better: 'low',  a: a.sp.offRank, b: b.sp.offRank },
      defRank:   { better: 'low',  a: a.sp.defRank, b: b.sp.defRank },
      sos:       { better: 'high', a: a.sos,        b: b.sos },
      top10W:    { better: 'high', a: a.top10W,     b: b.top10W },
      top25W:    { better: 'high', a: a.top25W,     b: b.top25W },
      top50W:    { better: 'high', a: a.top50W,     b: b.top50W },
      pfPer:     { better: 'high', a: a.pfPer,      b: b.pfPer },
      paPer:     { better: 'low',  a: a.paPer,      b: b.paPer },
      recency:   { better: 'high', a: a.recency,    b: b.recency },
    }
    let A=0, B=0
    const bA={}, bB={}
    for (const [k,w] of Object.entries(WEIGHTS)) {
      const f = fields[k]
      const va = f.a, vb = f.b
      if (va==null || vb==null) {
        A += w*0.5; B += w*0.5; bA[k]=w*0.5; bB[k]=w*0.5; continue
      }
      if (f.better==='high') {
        const sum = Math.max(va+vb, 1e-6)
        const pa = va/sum, pb = vb/sum
        A += w*pa; B += w*pb; bA[k]=w*pa; bB[k]=w*pb
      } else {
        const invA = 1/Math.max(va,1e-6)
        const invB = 1/Math.max(vb,1e-6)
        const sum = invA+invB
        const pa = invA/sum, pb = invB/sum
        A += w*pa; B += w*pb; bA[k]=w*pa; bB[k]=w*pb
      }
    }
    return { totals:[A,B], breakdowns:[bA,bB] }
  }

  function predictToday(a, b, t1, t2) {
    const spDiff = (a.sp.rating ?? 0) - (b.sp.rating ?? 0)
    const recentDiff = ((a.recency ?? 0) - (b.recency ?? 0)) * 6
    const margin = spDiff + recentDiff
    const pace = avg([a.pfPer ?? 28, b.pfPer ?? 28])
    const s1 = Math.max(7, pace + margin/2)
    const s2 = Math.max(7, pace - margin/2)
    const conf = clamp01(1/(1+Math.exp(-Math.abs(margin)/6)))
    const favorite = margin >= 0 ? t1 : t2
    const why = [
      Math.abs(spDiff)>0.5 ? `SP+ edge of ${Math.abs(spDiff).toFixed(1)} points` : null,
      Math.abs(recentDiff)>1 ? `recent form (${margin>=0?t1:t2} trending up)` : null,
      a.sp.offRank && b.sp.offRank && Math.abs(a.sp.offRank - b.sp.offRank) >= 10 ? `${(margin>=0?t1:t2)} offense rank advantage` : null,
      a.sp.defRank && b.sp.defRank && Math.abs(a.sp.defRank - b.sp.defRank) >= 10 ? `${(margin>=0?t1:t2)} defense rank advantage` : null
    ].filter(Boolean).join('; ') || 'overall composite advantage'

    return {
      favorite, margin, confidence: conf,
      projectedScore: { [t1]: s1, [t2]: s2 },
      why
    }
  }

  // POST /api/teams/season-stats
  router.post('/season-stats', async (req, res) => {
    try {
      const { team1, team2, year } = req.body || {}
      if (!team1 || !team2 || !year) return res.status(400).json({ ok:false, message:'team1, team2, year required' })

      const [A, B] = await Promise.all([
        seasonBundle(team1, Number(year)),
        seasonBundle(team2, Number(year))
      ])

      const { totals, breakdowns } = scorePair(A, B)
      res.json({
        ok: true,
        year: Number(year),
        weights: WEIGHTS,
        teams: [
          { team: team1, ...A, totalScore: totals[0], breakdown: breakdowns[0] },
          { team: team2, ...B, totalScore: totals[1], breakdown: breakdowns[1] }
        ],
        prediction: predictToday(A, B, team1, team2)
      })
    } catch (e) {
      res.status(500).json({ ok:false, message:String(e?.message || e) })
    }
  })

  // POST /api/teams/compare  (all-time head-to-head, saved + returned)
  router.post('/compare', async (req, res) => {
    try {
      const { team1, team2, year } = req.body || {}
      if (!team1 || !team2 || !year) return res.status(400).json({ ok:false, message:'team1, team2, year required' })

      const candidates = [
        `/teams/matchup?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}&season=${year}`,
        `/teams/matchup?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}&year=${year}`,
        `/teams/matchup?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}`
      ]

      let chosen = null
      for (const p of candidates) {
        const r = await cfbdGet(p)
        if (r.status === 200) { chosen = { path: p, data: r.data }; break }
        await new Promise(r => setTimeout(r, 120))
      }
      if (!chosen) return res.json({ ok:false, message:'No successful response from /teams/matchup', tried: candidates })

      // Normalize to a stable shape (matches your sample)
      const src = chosen.data
      const norm = {
        team1, team2,
        team1Wins: src?.team1Wins ?? 0,
        team2Wins: src?.team2Wins ?? 0,
        ties: src?.ties ?? 0,
        games: Array.isArray(src?.games) ? src.games.map(g => ({
          season: g.season,
          week: g.week,
          seasonType: g.season_type || g.seasonType,
          date: g.start_date || g.date,
          neutralSite: !!(g.neutral_site ?? g.neutralSite),
          venue: g.venue || null,
          homeTeam: g.home_team || g.homeTeam,
          homeScore: g.home_points ?? g.homeScore ?? null,
          awayTeam: g.away_team || g.awayTeam,
          awayScore: g.away_points ?? g.awayScore ?? null,
          winner: g.winner || null
        })) : []
      }

      // Save alongside your other data
      const savedTo = writeJson(Number(year), `matchup-${team1.replace(/\s+/g,'_')}-vs-${team2.replace(/\s+/g,'_')}`, norm)
      const count = norm.games.length

      res.json({ ok:true, year:Number(year), pathTried: chosen.path, savedTo, count, data: norm })
    } catch (e) {
      res.json({ ok:false, message:String(e?.message || e) })
    }
  })

  return router
}
