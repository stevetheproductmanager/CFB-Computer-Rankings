// client/src/lib/buildRankings.js
import { rankTeams } from './rankAlgo';

function fmtNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

function enrichTeams(ranked){
  const rMap = new Map(ranked.map(t => [t.name, t.rank]));
  // Top wins + PF/PA totals
  for (const t of ranked) {
    let pf=0, pa=0, t10=0, t25=0, t50=0;
    for (const g of (t.games || [])) {
      pf += fmtNum(g.for);
      pa += fmtNum(g.against);
      const oppRank = rMap.get(g.opp) || 999;
      const win = fmtNum(g.for) > fmtNum(g.against);
      if (win) {
        if (oppRank <= 10) t10++;
        if (oppRank <= 25) t25++;
        if (oppRank <= 50) t50++;
      }
    }
    t.pf = pf; t.pa = pa;
    t.top10Wins = t10; t.top25Wins = t25; t.top50Wins = t50;
  }
  // Off/Def rank (off = PF/G high better, def = PA/G low better)
  const usage = ranked.map(t => {
    const gp = (t.games || []).length || 1;
    return { name: t.name, off: (t.pf||0)/gp, def: (t.pa||0)/gp };
  });
  const offPos = new Map([...usage].sort((a,b)=>b.off-a.off).map((t,i)=>[t.name, i+1]));
  const defPos = new Map([...usage].sort((a,b)=>a.def-b.def).map((t,i)=>[t.name, i+1]));
  for (const t of ranked) {
    t.offRank = offPos.get(t.name);
    t.defRank = defPos.get(t.name);
  }
  return ranked;
}

export async function buildRankingsForYear(year){
  // Prefer ALL teams so FCS games count; fallback to FBS
  const teams = await fetch(`/data/${year}/teams.json`).then(async r=>{
    if (r.ok) return r.json();
    const r2 = await fetch(`/data/${year}/teams-fbs.json`);
    if (!r2.ok) throw new Error(`Failed teams for ${year}`);
    return r2.json();
  });

  const games = await fetch(`/data/${year}/games-regular.json`).then(r=>{
    if (!r.ok) throw new Error(`Failed games-regular.json (${r.status})`);
    return r.json();
  });

  // Optional early-season prior
  const sp = await fetch(`/data/${year}/sp-ratings.json`).then(r=> r.ok ? r.json() : []);

  // Rank
  let ranked = rankTeams({ teamsRaw: teams, gamesRaw: games, spRaw: sp });

  // Tiny UI nudges (mirror your Rankings page)
  for (const t of ranked) {
    const gp = (t.games || []).length;
    if (gp >= 3 && t.l === 0) t.score += 0.01;
    if (t.l >= 2 && gp <= 5) t.score -= 0.01;
  }
  ranked.sort((a,b)=> b.score - a.score);
  ranked.forEach((t,i)=> (t.rank = i+1));
  ranked = enrichTeams(ranked);

  // Attach logos from teams file
  const logoMap = new Map();
  for (const t of teams || []) {
    const primary = Array.isArray(t.logos) && t.logos.length ? t.logos[0] : null;
    if (t.school) logoMap.set(t.school, primary);
    if (t.abbreviation) logoMap.set(t.abbreviation, primary);
    if (Array.isArray(t.alternateNames)) t.alternateNames.forEach(n => logoMap.set(n, primary));
  }
  for (const t of ranked) t.logo = logoMap.get(t.name) || null;

  return ranked;
}
