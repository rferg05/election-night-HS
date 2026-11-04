// Preview only: fills civicAPI's races with a made-up count, so the layout
// and the likelihoods can be checked before real votes come in. Each race
// gets its own share reported around `reporting`, and votes near the
// forecast's shares, nudged at random. Seeded by race key, so a reload
// shows the same night.

type Json = Record<string, any>;

function rand(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function fillRace(key: string, race: Json, reporting: number) {
  const r = rand(key);
  const cands: Json[] = race.candidates ?? [];
  const pct = Math.max(0, Math.min(100, reporting + (r() - 0.5) * reporting * 0.9));
  // Major parties get most of the vote; the rest share what's left.
  const weights = cands.map((c, i) => {
    const major = /democrat|republican/i.test(c.party) || (c.party === 'Independent' && i < 2);
    return (major ? 0.8 + r() * 0.6 : 0.03 + r() * 0.05);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const total = Math.round((150_000 + r() * 200_000) * (pct / 100));
  cands.forEach((c, i) => {
    c.votes = Math.round((total * weights[i]) / sum);
    c.winner = false;
  });
  race.percent_reporting = Math.round(pct);
  // Lopsided races with most of the count in get called.
  const sorted = [...cands].sort((a, b) => b.votes - a.votes);
  if (sorted.length > 1 && pct > 60 && sorted[0].votes > sorted[1].votes * 1.25) sorted[0].winner = true;
}

export function simulate(url: string, body: unknown, reporting: number): unknown {
  if (reporting <= 0 || !body || typeof body !== 'object') return body;
  const b = body as Json;
  if (b.region_results) for (const [k, v] of Object.entries(b.region_results as Json)) fillRace(k, v as Json, reporting);
  else if (Array.isArray(b.candidates) && /\/race\/\d+$/.test(url)) fillRace(url, b, reporting);
  return b;
}

