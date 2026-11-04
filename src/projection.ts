// Who is likely to win, from the count so far. Not a race call: a call only
// ever comes from the source's `winner` flag, shown as "Called".
//
// The model: the uncounted vote is estimated from the share counted. The
// runner-up needs some share `need` of it to catch up. Their share of what's
// left is taken as a blend of their share so far and a baseline from the
// forecast (leaning on the forecast early, when the first batches can be
// lopsided), with an uncertainty that narrows as the count goes on. The
// chance they get less than `need` is the leader's chance.

import type { Candidate, Party, Race } from './data';

export type Status =
  | 'called'      // the source called it
  | 'unopposed'
  | 'projected'   // out of reach for the runner-up, by this model
  | 'likely'
  | 'leaning'
  | 'tossup'      // too close to say
  | 'forecast';   // no votes yet: the forecast's rating

export interface Projection {
  /** The candidate ahead (or expected to be, before any votes). */
  leader: Candidate | null;
  runnerUp: Candidate | null;
  status: Status;
  /** The leader's chance of winning, 0.5 to 1. */
  chance: number;
  /** The party now leading, or that won. */
  party: Party | null;
  /** The seat changes hands, by the leader's party. */
  flip: boolean;
  /** Share of the counted vote, by candidate name. */
  share: Record<string, number>;
  totalVotes: number;
}

/** The chance a forecast rating gives its favourite. */
const RATING_CHANCE: [RegExp, number][] = [
  [/safe|solid/i, 0.98],
  [/likely/i, 0.88],
  [/lean/i, 0.75],
  [/tilt/i, 0.6],
];

export function ratingChance(rating: string): number {
  for (const [re, c] of RATING_CHANCE) if (re.test(rating)) return c;
  return 0.5;
}

/** Inverse of the standard normal CDF, by bisection: plenty for a baseline. */
export function probit(p: number): number {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The two-way vote share a forecast's win chance implies: a safe seat
 *  (98%) about 66%, a tossup 50%. Kept within 30 to 70%, so the count soon
 *  outweighs it. */
export function shareFromChance(chance: number): number {
  const c = Math.min(0.999, Math.max(0.001, chance));
  return Math.min(0.7, Math.max(0.3, 0.5 + 0.08 * probit(c)));
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Late and provisional ballots: even at 100% reported, some votes remain. */
const LATE_SHARE = 0.02;

export function project(race: Race): Projection {
  const cands = race.candidates;
  const totalVotes = cands.reduce((s, c) => s + c.votes, 0);
  const share: Record<string, number> = {};
  for (const c of cands) share[c.name] = totalVotes > 0 ? c.votes / totalVotes : 0;
  const incumbentParty = race.prior?.incumbentParty ?? null;
  const result = (leader: Candidate | null, runnerUp: Candidate | null, status: Status, chance: number): Projection => ({
    leader,
    runnerUp,
    status,
    chance,
    party: leader?.party ?? null,
    flip: !!leader && !!incumbentParty && leader.party !== incumbentParty && (status === 'called' || status === 'projected' || status === 'likely'),
    share,
    totalVotes,
  });

  const winner = cands.find((c) => c.winner);
  if (winner) return result(winner, cands.find((c) => c !== winner) ?? null, 'called', 1);
  if (cands.length === 0) return result(null, null, 'tossup', 0.5);
  if (cands.length === 1) return result(cands[0], null, 'unopposed', 1);

  const known = race.prior?.chance ?? {};
  // The chance the forecast gave no one by name (Alaska's forecast names no
  // Republican, with two running) is split among the candidates it missed.
  const unmatched = cands.filter((c) => !(c.name in known));
  const spare = Math.max(0, 1 - Object.values(known).reduce((s, x) => s + x, 0));
  const hasPrior = Object.keys(known).length > 0;
  const prior = (name: string) => known[name] ?? (hasPrior && unmatched.length ? spare / unmatched.length : 0);

  if (totalVotes === 0) {
    // Before results: the forecast's favourite and its chance against the next.
    if (!hasPrior) return result(null, null, 'forecast', 0.5);
    const ranked = [...cands].sort((a, b) => prior(b.name) - prior(a.name));
    const top = prior(ranked[0].name);
    const chance = top / (top + prior(ranked[1].name)) || ratingChance(race.prior?.rating ?? '');
    return result(ranked[0], ranked[1], 'forecast', chance);
  }

  const [lead, next] = cands;
  const p = Math.min(1, Math.max(0.005, race.reporting / 100));
  const remaining = totalVotes * ((1 - p) / p + LATE_SHARE);
  const topTwo = lead.votes + next.votes;
  // The part of what's left that goes to these two, at their share so far.
  const remainingTwo = remaining * (topTwo / totalVotes);
  const gap = lead.votes - next.votes;
  const need = 0.5 + gap / (2 * remainingTwo);

  // The runner-up's expected share of the rest of the two-way vote.
  const nowShare = next.votes / topTwo;
  const pl = prior(lead.name);
  const pn = prior(next.name);
  const priorShare = pl + pn > 0 ? shareFromChance(pn / (pl + pn)) : nowShare;
  // Even a small count says a good deal: half the weight by 25% in.
  const w = Math.sqrt(p);
  const mean = w * nowShare + (1 - w) * priorShare;
  const sd = 0.03 + 0.1 * (1 - p);
  const chance = need >= 1 ? 1 : normalCdf((need - mean) / sd);

  // Below 0.5 the rest is expected to overturn the lead: the runner-up is
  // the one favoured.
  const [fav, other, favChance] = chance >= 0.5 ? [lead, next, chance] : [next, lead, 1 - chance];
  return result(fav, other, statusFor(favChance, p), favChance);
}

function statusFor(chance: number, reported: number): Status {
  // Too little is in to be sure of anything.
  if (chance >= 0.995 && reported >= 0.5) return 'projected';
  if (chance >= 0.95 && reported >= 0.1) return 'likely';
  if (chance >= 0.75) return 'leaning';
  return 'tossup';
}

// ── Seat counts ─────────────────────────────────────────────────────────────

export interface SeatCount {
  /** Won: called by the source, plus seats not up this year. */
  won: Record<Party, number>;
  /** Ahead in the count, in races not yet called. */
  ahead: Record<Party, number>;
  /** Expected seats: each race's chance added up. */
  expected: Record<Party, number>;
  /** Races still to be called. */
  open: number;
}

const zero = (): Record<Party, number> => ({ D: 0, R: 0, I: 0, O: 0 });

export function countSeats(projections: Projection[], holdover: Record<Party, number> = zero()): SeatCount {
  const won = { ...holdover };
  const ahead = zero();
  const expected = { ...holdover };
  let open = 0;
  for (const pr of projections) {
    if (!pr.leader) { open++; continue; }
    if (pr.status === 'called' || pr.status === 'unopposed') {
      won[pr.leader.party]++;
      expected[pr.leader.party]++;
      continue;
    }
    open++;
    // Before any votes, a forecast favourite isn't ahead of anyone yet.
    if (pr.status !== 'forecast') ahead[pr.leader.party]++;
    expected[pr.leader.party] += pr.chance;
    if (pr.runnerUp) expected[pr.runnerUp.party] += 1 - pr.chance;
  }
  return { won, ahead, expected, open };
}
