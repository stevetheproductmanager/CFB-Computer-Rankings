
export async function getManifest(year = 2025) {
  const res = await fetch(`/api/data/manifest?year=${year}`);
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const j = await res.json();
  try { localStorage.setItem('cfbd.manifest', JSON.stringify(j)); } catch {}
  return j;
}

export function getCachedManifest() {
  try {
    const raw = localStorage.getItem('cfbd.manifest');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

