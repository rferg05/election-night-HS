import { describe, expect, it } from 'vitest';
import { countSeats, normalCdf, probit, project, shareFromChance } from '../src/projection';
import type { Candidate, Race } from '../src/data';

const cand = (name: string, party: Candidate['party'], votes: number, winner = false): Candidate =>
  ({ name, party, votes, winner, incumbent: false });

const race = (reporting: number, cands: Candidate[], prior?: Race['prior']): Race =>
  ({ key: 'xx-01', state: 'XX', district: 1, name: 'Test', reporting, candidates: cands, prior });

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(probit(0.975)).toBeCloseTo(1.96, 2);
  });

  it('turns a win chance into a modest share', () => {
    expect(shareFromChance(0.5)).toBeCloseTo(0.5, 6);
    expect(shareFromChance(0.98)).toBeGreaterThan(0.6);
    expect(shareFromChance(0.999)).toBeLessThanOrEqual(0.7);
  });
});

describe('project', () => {
  it('takes a call from the source', () => {
    const pr = project(race(40, [cand('A', 'D', 100), cand('B', 'R', 120, true)]));
    expect(pr.status).toBe('called');
    expect(pr.leader?.name).toBe('B');
  });

  it('uses the forecast before any votes', () => {
    const pr = project(race(0, [cand('A', 'D', 0), cand('B', 'R', 0)], { rating: 'Lean R', chance: { A: 0.25, B: 0.75 }, incumbentParty: 'R' }));
    expect(pr.status).toBe('forecast');
    expect(pr.leader?.name).toBe('B');
    expect(pr.chance).toBeCloseTo(0.75, 6);
  });

  it('calls nothing on a big early lead', () => {
    const pr = project(race(3, [cand('A', 'D', 7000), cand('B', 'R', 3000)]));
    expect(pr.leader?.name).toBe('A');
    expect(['leaning', 'tossup']).toContain(pr.status);
  });

  it('is sure of a lead the rest of the count cannot overturn', () => {
    // 95% in, 20-point lead: the runner-up would need far more than all of what's left.
    const pr = project(race(95, [cand('A', 'D', 60_000), cand('B', 'R', 40_000)]));
    expect(pr.chance).toBe(1);
    expect(pr.status).toBe('projected');
  });

  it('calls a near tie too close', () => {
    const pr = project(race(90, [cand('A', 'D', 50_100), cand('B', 'R', 49_900)]));
    expect(pr.status).toBe('tossup');
    expect(pr.chance).toBeGreaterThanOrEqual(0.5);
  });

  it('favours the trailing candidate when the forecast says the rest is theirs', () => {
    // Early, narrowly lopsided batch for A in a race forecast strongly for B.
    const pr = project(race(5, [cand('A', 'D', 5_200), cand('B', 'R', 4_800)], { rating: 'Safe R', chance: { A: 0.02, B: 0.98 }, incumbentParty: 'R' }));
    expect(pr.leader?.name).toBe('B');
  });

  it('lets a clear count outweigh the forecast', () => {
    // 57% in and 22 points ahead in a seat forecast safe for the other side.
    const pr = project(race(57, [cand('A', 'R', 112_720), cand('B', 'D', 71_147)], { rating: 'Safe D', chance: { A: 0.011, B: 0.989 }, incumbentParty: 'D' }));
    expect(pr.leader?.name).toBe('A');
    expect(pr.chance).toBeGreaterThan(0.95);
  });

  it('marks a flip only once it is likely', () => {
    const prior = { rating: 'Tossup', chance: { A: 0.5, B: 0.5 }, incumbentParty: 'R' as const };
    expect(project(race(90, [cand('A', 'D', 50_100), cand('B', 'R', 49_900)], prior)).flip).toBe(false);
    expect(project(race(95, [cand('A', 'D', 60_000), cand('B', 'R', 40_000)], prior)).flip).toBe(true);
  });

  it('gives the forecast chance it named no one for to the candidates it missed', () => {
    // Alaska: the forecast names the Democrat and an independent, not the Republican incumbent.
    const prior = { rating: 'Tilt D', chance: { Peltola: 0.622, Hill: 0.001 }, incumbentParty: 'R' as const };
    const pr = project(race(0, [cand('Peltola', 'D', 0), cand('Sullivan', 'R', 0), cand('Hill', 'I', 0)], prior));
    expect(pr.leader?.name).toBe('Peltola');
    expect(pr.runnerUp?.name).toBe('Sullivan');
    expect(pr.chance).toBeCloseTo(0.622, 2);
  });

  it('treats a lone candidate as unopposed', () => {
    expect(project(race(0, [cand('A', 'D', 0)])).status).toBe('unopposed');
  });
});

describe('countSeats', () => {
  it('adds holdovers, calls and leads', () => {
    const prs = [
      project(race(80, [cand('A', 'D', 100, true), cand('B', 'R', 50)])),
      project(race(50, [cand('C', 'R', 5200), cand('D', 'D', 4800)])),
    ];
    const s = countSeats(prs, { D: 34, R: 31, I: 0, O: 0 });
    expect(s.won).toEqual({ D: 35, R: 31, I: 0, O: 0 });
    expect(s.ahead.R).toBe(1);
    expect(s.open).toBe(1);
    expect(s.expected.D + s.expected.R).toBeCloseTo(67, 6);
  });
});
