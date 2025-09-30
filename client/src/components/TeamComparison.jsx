// client/src/components/TeamComparison.jsx
import { useEffect, useMemo, useState } from 'react';

function val(o, keys, d = undefined) {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
  }
  return d;
}

// Normalize a ranking row to a single shape so UI is simple & consistent
function normalizeRankRow(r) {
  return {
    id: val(r, ['id', 'teamId', 'team_id']),
    school: val(r, ['team', 'school', 'name']),
    abbreviation: val(r, ['abbreviation', 'abbr']),
    conf: val(r, ['conference', 'conf']),
    wins: val(r, ['wins', 'W', 'w'], 0),
    losses: val(r, ['losses', 'L', 'l'], 0),

    results: val(r, ['Results', 'results']),
    sos: val(r, ['SOS', 'sos']),
    quality: val(r, ['Quality', 'quality']),
    recency: val(r, ['Recency', 'recency']),
    top10w: val(r, ['Top10W', 'Top 10 W', 'top10w', 'top10']),
    top25w: val(r, ['Top25W', 'Top 25 W', 'top25w', 'top25']),
    top50w: val(r, ['Top50W', 'Top 50 W', 'top50w', 'top50']),
    pf: val(r, ['PF', 'pointsFor', 'points_for']),
    pa: val(r, ['PA', 'pointsAgainst', 'points_against']),
    offRank: val(r, ['Off Rk', 'OffRk', 'offRank', 'off_rank']),
    defRank: val(r, ['Def Rk', 'DefRk', 'defRank', 'def_rank']),
    score: val(r, ['Score', 'score']),
    logos: val(r, ['logos'], []),
    color: val(r, ['color']),
    altColor: val(r, ['alternateColor', 'altColor']),
  };
}

function fmt(n, p = 3) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (typeof n === 'number') return n.toFixed(p);
  const asNum = Number(n);
  return Number.isNaN(asNum) ? String(n) : asNum.toFixed(p);
}
function fmtInt(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  const asNum = Number(n);
  return Number.isNaN(asNum) ? String(n) : Math.round(asNum).toString();
}
function wl(w, l) {
  if (w == null && l == null) return '—';
  return `${w ?? 0}-${l ?? 0}`;
}

export default function TeamComparison({
  year,
  teamA,        // preferred: numeric id; also accepts school/abbreviation string
  teamB,        // preferred: numeric id; also accepts school/abbreviation string
  rankingsData, // optional: pass preloaded rankings array to avoid re-fetch
}) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const shouldFetch = !rankingsData;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!shouldFetch) return;
      try {
        // Keep path consistent with the rest of your data files
        const res = await fetch(`/data/${year}/rankings.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : data?.rows ?? []);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to load rankings');
      }
    }
    run();
    return () => { cancelled = true; };
  }, [year, shouldFetch]);

  const normalized = useMemo(() => {
    const src = rankingsData ?? rows ?? [];
    return src.map(normalizeRankRow);
  }, [rankingsData, rows]);

  const index = useMemo(() => {
    const byId = new Map();
    const byKey = new Map();
    for (const r of normalized) {
      if (r.id != null) byId.set(String(r.id), r);
      const keys = [
        r.school?.toLowerCase(),
        r.abbreviation?.toLowerCase(),
      ].filter(Boolean);
      for (const k of keys) {
        if (!byKey.has(k)) byKey.set(k, r);
      }
    }
    return { byId, byKey };
  }, [normalized]);

  function resolveTeam(t) {
    if (t == null) return null;
    // numeric id or stringified id
    const asId = index.byId.get(String(t));
    if (asId) return asId;
    // name/abbr
    const asKey = index.byKey.get(String(t).toLowerCase());
    return asKey ?? null;
  }

  const A = resolveTeam(teamA);
  const B = resolveTeam(teamB);

  if (err) {
    return (
      <div style={{ padding: 16, background: 'var(--panel)', color: 'var(--err)', borderRadius: 12 }}>
        Failed to load rankings: {err}
      </div>
    );
  }
  if (!normalized.length) {
    return (
      <div style={{ padding: 16, color: 'var(--muted)' }}>
        Loading rankings…
      </div>
    );
  }
  if (!A || !B) {
    return (
      <div style={{ padding: 16, color: 'var(--warn)' }}>
        Couldn’t find { !A && !B ? 'either team' : !A ? 'Team A' : 'Team B' } in the rankings data for {year}.
      </div>
    );
  }

  const traits = [
    { label: 'Conference', a: A.conf, b: B.conf, fmt: v => v ?? '—' },
    { label: 'W - L', a: wl(A.wins, A.losses), b: wl(B.wins, B.losses), fmt: v => v },
    { label: 'Results', a: A.results, b: B.results, fmt: v => fmt(v, 3) },
    { label: 'SOS', a: A.sos, b: B.sos, fmt: v => fmt(v, 3) },
    { label: 'Quality', a: A.quality, b: B.quality, fmt: v => fmt(v, 3) },
    { label: 'Recency', a: A.recency, b: B.recency, fmt: v => fmt(v, 3) },
    { label: 'Top 10 Wins', a: A.top10w, b: B.top10w, fmt: v => fmtInt(v) },
    { label: 'Top 25 Wins', a: A.top25w, b: B.top25w, fmt: v => fmtInt(v) },
    { label: 'Top 50 Wins', a: A.top50w, b: B.top50w, fmt: v => fmtInt(v) },
    { label: 'PF', a: A.pf, b: B.pf, fmt: v => fmtInt(v) },
    { label: 'PA', a: A.pa, b: B.pa, fmt: v => fmtInt(v) },
    { label: 'Off Rk', a: A.offRank, b: B.offRank, fmt: v => fmtInt(v) },
    { label: 'Def Rk', a: A.defRank, b: B.defRank, fmt: v => fmtInt(v) },
    { label: 'Score', a: A.score, b: B.score, fmt: v => fmt(v, 3) },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' }}>
        <TeamCard team={A} align="right" />
        <div style={{ display: 'grid', placeItems: 'center', padding: 8, color: 'var(--muted)' }}>
          <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>vs</span>
        </div>
        <TeamCard team={B} align="left" />
      </div>

      {/* Traits table */}
      <div style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,.25)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr', gap: 8, fontSize: 14, color: 'var(--muted)', padding: '4px 8px' }}>
          <div style={{ textAlign: 'right' }}>{A.school}</div>
          <div style={{ textAlign: 'center', color: 'var(--text)' }}>Trait</div>
          <div style={{ textAlign: 'left' }}>{B.school}</div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '6px 0 10px' }} />

        {traits.map((t) => (
          <Row key={t.label} label={t.label} a={t.fmt(t.a)} b={t.fmt(t.b)} />
        ))}
      </div>
    </div>
  );
}

function TeamCard({ team, align = 'left' }) {
  const logo = Array.isArray(team.logos) && team.logos.length ? team.logos[0] : null;
  const justify = align === 'right' ? 'flex-end' : 'flex-start';
  const textAlign = align === 'right' ? 'right' : 'left';
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02))',
      borderRadius: 16,
      padding: 12,
      display: 'flex',
      gap: 12,
      justifyContent: justify,
      alignItems: 'center',
      minHeight: 84
    }}>
      {align === 'right' && logo && <img src={logo} alt={`${team.school} logo`} style={{ width: 44, height: 44, objectFit: 'contain' }} />}
      <div style={{ textAlign }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{team.conf ?? '—'}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{team.school}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{wl(team.wins, team.losses)}</div>
      </div>
      {align === 'left' && logo && <img src={logo} alt={`${team.school} logo`} style={{ width: 44, height: 44, objectFit: 'contain' }} />}
    </div>
  );
}

function Row({ label, a, b }) {
  // left/right emphasis bars to subtly show advantage when both are numeric
  const numA = Number(a), numB = Number(b);
  const bothNumeric = !Number.isNaN(numA) && !Number.isNaN(numB);
  const sum = bothNumeric ? Math.abs(numA) + Math.abs(numB) : 0;
  const pLeft = bothNumeric && sum > 0 ? (Math.abs(numA) / sum) * 100 : 50;
  const pRight = 100 - pLeft;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr', gap: 8, alignItems: 'center', padding: '10px 8px', borderRadius: 12 }}>
      <div style={{ position: 'relative', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: bothNumeric ? `${pLeft}%` : '0%', background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand2) 100%)', opacity: .18, transition: 'width .45s ease' }} />
        <div style={{ position: 'relative', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{a}</div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>{label}</div>

      <div style={{ position: 'relative', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: bothNumeric ? `${pRight}%` : '0%', background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand2) 100%)', opacity: .18, transition: 'width .45s ease' }} />
        <div style={{ position: 'relative', textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>{b}</div>
      </div>
    </div>
  );
}
