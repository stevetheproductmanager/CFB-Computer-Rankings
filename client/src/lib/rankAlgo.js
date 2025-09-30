// client/src/lib/rankAlgo.js
// Uses teams.json (ALL teams: FBS + FCS). Rankings return only FBS teams,
// but all opponents (including FCS) are counted in W-L/Results/SOS/Quality/etc.

function val(o, keys, d = undefined) {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
  }
  return d;
}
function capMov(m){ const cap = 24; return Math.max(-cap, Math.min(cap, m)) }
function gameWeek(g){ return val(g, ['week','game_week','gameWeek'], 1) }
function isNeutral(g){ return !!val(g, ['neutral_site','neutral','isNeutral'], false) }
function locWeight(isHome, isAway, neutral){
  if (neutral) return 1.0;
  if (isHome) return 1.0;   // keep venue modest; MOV already capped
  if (isAway) return 1.02;  // small road tilt
  return 1.0;
}
function vsClassWeight(opp) {
  const cls = (opp?.classification || '').toLowerCase();
  if (cls === 'fcs') return { winMul: 0.75, lossMul: 1.30 }; // less credit to FCS wins, harsher loss
  return { winMul: 1.00, lossMul: 1.00 };
}

function safeDiv(a,b){ return b ? (a/b) : 0 }
function pickTeamName(t) {
  return (val(t, ['school','team','name','displayName','teamName'], '') || '').trim();
}

function clamp(v, lo = -1e9, hi = 1e9) { return Math.max(lo, Math.min(hi, v)); }


/** Index from teams.json (ALL teams). */
export function buildTeamsIndex(teamsRaw = []) {
  const byId = new Map();
  const byName = new Map();
  const meta = new Map(); // canonical -> { name, conference, classification }

  for (const t of teamsRaw) {
    const id = val(t, ['id','teamId','schoolId','cfbd_id'], null);
    const canonical = pickTeamName(t);
    if (!canonical) continue;

    const classification = (t.classification || t.division || t.subdivision || '').toString().toLowerCase() || 'unknown';
    const conference = t.conference || t.conf || t.conference_abbreviation || 'Unknown';

    meta.set(canonical, { name: canonical, conference, classification });

    if (id != null) byId.set(String(id), canonical);

    const aliases = new Set();
    ['school','team','name','displayName','abbreviation','alt_name1','alt_name2','alt_name3','mascot']
      .forEach(k => { const v = (t?.[k] || '').toString().trim(); if (v) aliases.add(v); });
    for (const a of aliases) byName.set(a.toLowerCase(), canonical);
  }
  return { byId, byName, meta };
}

function parseGames(gamesRaw = []) {
  const out = [];
  for (const g of gamesRaw) {
    const homeId = val(g, ['home_id','homeId','homeTeamId','homeTeamID'], null);
    const awayId = val(g, ['away_id','awayId','awayTeamId','awayTeamID'], null);
    const homeName = val(g, ['home','homeTeam','home_team','team_home','team1','homeSchool','home_school'], null);
    const awayName = val(g, ['away','awayTeam','away_team','team_away','team2','awaySchool','away_school'], null);
    const hp = val(g, ['home_points','homePoints','points_home','home_score','score1'], null);
    const ap = val(g, ['away_points','awayPoints','points_away','away_score','score2'], null);
    if (hp == null || ap == null || isNaN(+hp) || isNaN(+ap)) continue;

    out.push({
      homeId: homeId != null ? String(homeId) : null,
      awayId: awayId != null ? String(awayId) : null,
      homeName: homeName != null ? String(homeName).trim() : null,
      awayName: awayName != null ? String(awayName).trim() : null,
      hp: +hp, ap: +ap,
      week: gameWeek(g),
      neutral: isNeutral(g),
    });
  }
  return out;
}

export function attachGames(teamsMap, index, gamesRaw) {
  const games = parseGames(gamesRaw);
  const { byId, byName } = index;

  for (const g of games) {
    let h = null, a = null;
    if (g.homeId && byId.has(g.homeId)) h = byId.get(g.homeId);
    if (g.awayId && byId.has(g.awayId)) a = byId.get(g.awayId);
    if (!h && g.homeName) h = byName.get(g.homeName.toLowerCase()) || g.homeName;
    if (!a && g.awayName) a = byName.get(g.awayName.toLowerCase()) || g.awayName;

    const home = teamsMap.get(h);
    const away = teamsMap.get(a);
    if (!home || !away) continue; // teams.json should contain both; if not, skip quietly

    home.games.push({ opp: away.name, for: g.hp, against: g.ap, week: g.week, neutral: g.neutral, home: true });
    away.games.push({ opp: home.name, for: g.ap, against: g.hp, week: g.week, neutral: g.neutral, away: true });
  }
}

/** ---------------- Scoring components ---------------- **/

/** Results: more binary, MOV capped & de-emphasized, small venue weight, slight recency. */
function computeResults(team, teamsMapRef){
  let sum = 0, w=0, l=0, rec=0;
  for (const g of team.games) {
    const mov = capMov(g.for - g.against);
    const win = g.for > g.against ? 1 : 0;
    const lw = locWeight(!!g.home, !!g.away, g.neutral);
    const week = g.week || 1;
    const recency = 0.02 * week;

    
     const opp = teamsMapRef.get(g.opp);
      const { winMul, lossMul } = vsClassWeight(opp);
      const base = win ? (1.30 * winMul) : (-1.20 * lossMul);
      const gameScore = base + (mov / 24) * 0.28; // slightly less MOV
      sum += gameScore * lw + recency;

    if (win) w++; else l++;
    rec += recency;
  }
  team.w = w; team.l = l; team.recency = rec;
  return team.games.length ? (sum / team.games.length) : 0;
}

/** Iterative SOS from opponents' results (all teams considered). */
function iterateSOS(teamsMap, loops=5){
  for (let i=0;i<loops;i++){
    for (const t of teamsMap.values()) {
      if (!t.games.length){ t.sos_iter = 0; continue }
      let opp = 0;
      for (const g of t.games){ opp += (teamsMap.get(g.opp)?.results ?? 0) }
      t.sos_iter = opp / t.games.length;
    }
    for (const t of teamsMap.values()){ t.results = 0.9*t.results + 0.1*(t.sos_iter ?? 0) }
  }
}

/** OWP: opponents' win% (all opponents). */
function computeOWP(teamsMap){
  for (const t of teamsMap.values()) {
    if (!t.games.length){ t.owp = 0; continue }
    let sum = 0;
    for (const g of t.games) {
      const opp = teamsMap.get(g.opp);
      const games = (opp?.games?.length || 0);
      const wins = (opp?.w || 0);
      sum += games ? (wins / games) : 0.5;
    }
    t.owp = sum / t.games.length;  // 0..1
  }
}

/** Interim sets (all teams) define Top10/25/50 for résumé logic. */
function buildTopSets(teams){
  const tmp = [...teams].sort((a,b)=> (b.results + b.sos) - (a.results + a.sos));
  return {
    top10: new Set(tmp.slice(0,10).map(t=>t.name)),
    top25: new Set(tmp.slice(0,25).map(t=>t.name)),
    top50: new Set(tmp.slice(0,50).map(t=>t.name))
  };
}

/** Quality résumé: per-game credit/debit. All teams in consideration. */
function computeQuality(teamsMap, sets){
  const { top10, top25, top50 } = sets;
  for (const t of teamsMap.values()) {
    let q = 0;
    for (const g of t.games) {
      const opp = g.opp;
      const won = g.for > g.against;
      if (won) {
        if (top10.has(opp)) q += 0.50;
        else if (top25.has(opp)) q += 0.32;
        else if (top50.has(opp)) q += 0.16;
      } else {
        if (!top50.has(opp)) q -= 0.26;     // bad loss (e.g., to weak FCS)
        else if (!top25.has(opp)) q -= 0.11; // decent loss
      }
    }
    t.quality = safeDiv(q, Math.max(1, t.games.length));
  }
}

/** Opponent-adjusted performance using all opponents. */
function computeOpponentAverages(teamsMap){
  for (const t of teamsMap.values()) {
    let pf=0, pa=0;
    for (const g of t.games){ pf += (g.for||0); pa += (g.against||0); }
    const gp = t.games.length || 1;
    t.pf_pg = pf / gp;
    t.pa_pg = pa / gp;
  }
}
function computePerformanceIndex(teamsMap){
  computeOpponentAverages(teamsMap);
  for (const t of teamsMap.values()){
    let agg = 0;
    for (const g of t.games){
      const opp = teamsMap.get(g.opp);
      const oppPA = opp?.pa_pg ?? null;  // opp’s avg points allowed
      const oppPF = opp?.pf_pg ?? null;  // opp’s avg points scored
      if (oppPA == null || oppPF == null) continue;

      const offRel = (g.for - oppPA) / 28;  // ~ -1..+1
      const defRel = (oppPF - g.against) / 28;
      const rel = Math.max(-1.2, Math.min(1.2, offRel + defRel));
      agg += rel;
    }
    t.perf = safeDiv(agg, (t.games.length || 1));
  }
}

/** Small local H2H smoothing. */
function applyHeadToHeadNudge(sorted, teamsMap){
  const beatenBy = new Map();
  for (const t of teamsMap.values()) beatenBy.set(t.name, new Set());
  for (const t of teamsMap.values()) {
    for (const g of t.games) {
      const won = g.for > g.against;
      if (!won) beatenBy.get(t.name).add(g.opp);
    }
  }
  for (let i=0; i<sorted.length; i++){
    const t = sorted[i];
    const lossesTo = beatenBy.get(t.name) || new Set();
    for (let j=i+1; j<Math.min(sorted.length, i+8); j++){
      const lower = sorted[j];
      const lowerBeatT = !(beatenBy.get(lower.name)?.has(t.name));
      if (lowerBeatT && !lossesTo.has(lower.name)) {
        lower.score += 0.004;
      }
    }
  }
}

/** SP+ prior (optional, fades quickly). */
function indexSP(spRaw = []) {
  const map = new Map();
  for (const r of spRaw) {
    const name = (r.team || r.school || r.name || '').toString().trim();
    const rating = Number(r.rating ?? r.sp ?? r.overall) || 0;
    if (!name) continue;
    map.set(name.toLowerCase(), rating);
  }
  const vals = Array.from(map.values());
  if (!vals.length) return { get: () => null };
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const std = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/vals.length) || 1;
  const get = (canonicalName) => {
    const key = canonicalName?.toLowerCase();
    if (!key) return null;
    const raw = map.get(key) ?? null;
    if (raw == null) return null;
    const z = (raw - mean) / std;
    return Math.max(-2.5, Math.min(2.5, z)) / 10; // [-0.25, 0.25]
  };
  return { get };
}

/** Simple percentiles for PF/PA allowing undefeated bonus to scale with efficiency. */
function toPercentiles(arr, higherIsBetter=true){
  const sorted = [...arr].sort((a,b)=> a - b);
  const n = sorted.length || 1;
  return arr.map(v => {
    let rank = sorted.findIndex(x => x > v);
    if (rank === -1) rank = n - 1;
    const p = rank / (n - 1 || 1); // 0..1
    return higherIsBetter ? p : (1 - p);
  });
}

/** ---------------- Main ranking (ALL teams internally; filter to FBS at the end) ---------------- **/
export function rankTeams({ teamsRaw = [], gamesRaw = [], spRaw = [] }) {
  const teamsMap = new Map();
  const { meta, byId, byName } = buildTeamsIndex(teamsRaw);

  // Initialize EVERY team from teams.json
  for (const [name, m] of meta.entries()) {
    teamsMap.set(name, {
      name,
      conference: m.conference,
      classification: m.classification, // 'fbs' or 'fcs' (or unknown)
      games: [],
      w: 0, l: 0,
      results: 0, sos_iter: 0, owp: 0, sos: 0,
      quality: 0, recency: 0, rec: 0,
      perf: 0,
      pf_pg: 0, pa_pg: 0,
      score: 0
    });
  }

  // Attach games: uses all teams; FCS opponents resolve properly.
  attachGames(teamsMap, { byId, byName }, gamesRaw);

  // If no games, return FBS alphabetically (legacy fallback)
  const totalGames = Array.from(teamsMap.values()).reduce((a, t) => a + t.games.length, 0);
  if (totalGames === 0) {
    const flat = Array.from(teamsMap.values()).filter(t => (t.classification || '').toLowerCase() === 'fbs');
    flat.sort((a,b)=> a.name.localeCompare(b.name));
    flat.forEach((t, i)=> { t.rank = i+1; t.score = -0.085; });
    return flat;
  }

  const gamesMean = Array.from(teamsMap.values())
  .reduce((a,x)=> a + x.games.length, 0) / Math.max(1, teamsMap.size);
const late = gamesMean >= 4.5; // after ~week 4
  
  // Results & SOS
  for (const t of teamsMap.values()) t.results = computeResults(t, teamsMap);
  iterateSOS(teamsMap, 5);
  computeOWP(teamsMap);

  // Combine SOS parts; mild floor for early cupcake slates
  for (const t of teamsMap.values()) {
    const iter = t.sos_iter ?? 0;
    const owpC = (t.owp ?? 0) - 0.5;
    let sos = 0.72*iter + 0.28*owpC;
    if (sos < -0.15) sos = -0.15 + 0.6*(sos + 0.15);
t.sos = late ? (sos * 1.06) : sos; // modestly stronger
  }
    {
    const allTeams = Array.from(teamsMap.values());
    const sosSortedAll = [...allTeams].sort((a, b) => b.sos - a.sos); // higher = tougher
    sosSortedAll.forEach((t, i) => { t.sosRankAll = i + 1; });
  }

  // Quality on all opponents
  const sets = buildTopSets(Array.from(teamsMap.values()));
  computeQuality(teamsMap, sets);

  // Opponent-adjusted performance
  computePerformanceIndex(teamsMap);

  // Recency per-game
  for (const t of teamsMap.values()) {
    t.rec = safeDiv(t.recency, Math.max(1, t.games.length));
  }

  // Efficiency percentiles for undefeated scaling
  const allPF = Array.from(teamsMap.values()).map(t => t.pf_pg || 0);
  const allPA = Array.from(teamsMap.values()).map(t => t.pa_pg || 0);
  const pfPct = toPercentiles(allPF, true);
  const paPct = toPercentiles(allPA, false);
  const nameToPcts = new Map();
  Array.from(teamsMap.values()).forEach((t, i)=> {
    const offPct = pfPct[i];       // higher is better
    const defPct = paPct[i];       // higher is better (we inverted earlier)
    nameToPcts.set(t.name, { offPct, defPct });
    // Attach to team for downstream use / debugging
    t.offPct = offPct;
    t.defPct = defPct;
  });

  // Optional prior (mostly FBS; missing for FCS is fine)
// Optional prior (mostly FBS; missing for FCS is fine)
const prior = indexSP(spRaw, null);

for (const t of teamsMap.values()) {
  const gp = t.games.length;

  // Pull existing channels you already computed
  const results = t.results;   // your binary-ish game results with capped MOV
  const sos     = t.sos;       // iterated SOS + OWP blend
  const quality = t.quality;   // résumé credit incl. Top10/25/50 & bad-loss debits
  const rec     = t.rec;       // per-game recency
  const perf    = t.perf;      // opponent-adjusted performance

  // --- Efficiency from your percentiles (already computed above) ---
  const offPct = t.offPct ?? 0.5;   // 0..1, higher is better
  const defPct = t.defPct ?? 0.5;   // 0..1, higher is better

  // Geometric mean emphasizes being good at BOTH O and D
  const effCore = Math.sqrt(offPct * defPct);

  // Small balance bonus for well-rounded teams
  const balanceBonus = 0.02 * (1 - Math.abs(offPct - defPct)); // 0..0.02
  const efficiency = clamp(effCore + balanceBonus, 0, 1);

  // --- Blend weights (shift more weight to efficiency & clean records) ---
  // Sums to 1.0 before undefeated/prior adjustments
  const wEFF = 0.45;  // efficiency (off/def)
  const wRES = 0.25;  // results (wins/losses; your logic)
  const wSOS = 0.15;  // schedule strength
  const wQLT = 0.10;  // quality wins/losses
  const wREC = 0.05;  // recency (kept modest)
  // (perf is already partially captured by efficiency; fold it into quality/results here)
  // If you want perf explicitly: shave a few points from RES/QLT and add wPER ~ 0.05.

  let core =
      wEFF * efficiency +
      wRES * results +
      wSOS * sos +
      wQLT * quality +
      wREC * rec;

  // --- Undefeated boost (small but real), scales with games played ---
  if (t.l === 0 && gp >= 3) {
    // tops out ~0.045–0.06 depending on efficiency; rewards clean starts without overpowering SOS/quality
    const scale = (1 - Math.exp(-gp / 5));          // 0→~0.63 by ~week 6+
    const effTilt = 0.7 + 0.3 * efficiency;         // better teams get a bit more
    const undefeated = 0.048 * scale * effTilt;     // ≈ 0.02–0.05 early-mid season
    core += Math.min(0.06, undefeated);
  }

  // Optional: tiny early loss drag so 1-loss teams don’t jump spotless teams too fast
  if (t.l >= 1 && gp <= 6) {
    const factor = (7 - gp) / 7; // fades as season progresses
    core -= 0.006 * t.l * factor;
  }

  // --- Prior (SP+) that fades quickly as games accumulate ---
  const sp = prior.get(t.name) ?? 0; // already in [-0.25, 0.25]
  const priorW = Math.max(0, Math.min(0.08, 0.12 - 0.02 * gp)); // 0.12 at 0 GP → ~0 by ~6 GP

  t.score = (1 - priorW) * core + priorW * sp;
}


  // Sort all for consistency, apply tiny H2H smoothing, resort
  let rankedAll = Array.from(teamsMap.values());
  rankedAll.sort((a,b)=> b.score - a.score);
  applyHeadToHeadNudge(rankedAll, teamsMap);
  rankedAll.sort((a,b)=> b.score - a.score);

  // Final output = FBS only
  const rankedFBS = rankedAll.filter(t => (t.classification || '').toLowerCase() === 'fbs');
  rankedFBS.forEach((t, i)=> t.rank = i+1);
    {
    const sosSortedFBS = [...rankedFBS].sort((a, b) => b.sos - a.sos); // higher = tougher
    const nameToFbsSosRank = new Map(sosSortedFBS.map((t, i) => [t.name, i + 1]));
    rankedFBS.forEach(t => { t.sosRank = nameToFbsSosRank.get(t.name) || null; });
  }
  return rankedFBS;
}
