// Results and forecasts from civicAPI (civicapi.org): free, no key, and
// attribution required, which the module shows in its footer. Two requests
// cover every federal race: one "race" per chamber whose `region_results`
// hold each state's or district's own count.

import { HOUSE_WATCH, RATING_NAME, SENATE_SEATS } from './watch';

export const PLUGIN_ID = 'election-night';

export const API = 'https://civicapi.org/api/v2';
/** The nationwide House and Senate races for 3 November 2026. */
export const HOUSE_RACE = 87524;
export const SENATE_RACE = 87528;
export const ELECTION_DAY = '2026-11-03';

/** Senate seats not up this year: 32 Democrats plus King and Sanders, who
 *  caucus with them, and 31 Republicans. Matches civicAPI's own count. */
export const SENATE_HOLDOVER: Record<Party, number> = { D: 34, R: 31, I: 0, O: 0 };
export const MAJORITY = { senate: 51, house: 218 } as const;
export const SEATS = { senate: 100, house: 435 } as const;

// ── Fetching ────────────────────────────────────────────────────────────────

export interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
  cacheTtlMs?: number;
}

export type Fetcher = (req: FetchRequest) => Promise<{ status: number; body: unknown }>;

export function hostFetcher(): Fetcher {
  return async (req) => {
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) throw new Error('Host SDK unavailable');
    const res = await sdk.pluginFetch(PLUGIN_ID, req);
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, body };
  };
}

export class SourceError extends Error {
  constructor(readonly status: number) {
    super(`civicAPI answered ${status}`);
  }
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  // civicAPI itself caches for 15 s, so there's nothing fresher to be had.
  const { status, body } = await fetcher({ url, cacheTtlMs: 15_000 });
  if (status < 200 || status >= 300 || typeof body !== 'object' || body === null) throw new SourceError(status);
  return body;
}

// ── Races ───────────────────────────────────────────────────────────────────

/** D and R, independents (who can win: Osborn in Nebraska), and the rest. */
export type Party = 'D' | 'R' | 'I' | 'O';

export interface Candidate {
  name: string;
  party: Party;
  votes: number;
  winner: boolean;
  incumbent: boolean;
}

/** A forecaster's rating and win chances, from before any votes. */
export interface Prior {
  rating: string;
  /** Each candidate's chance of winning, by name; sums to ~1. */
  chance: Record<string, number>;
  incumbentParty: Party | null;
}

export interface Race {
  /** `il` for a Senate race, `il-07` or `ak-al` for a House one, or the
   *  civicAPI race id for anything else. */
  key: string;
  state: string;
  /** House district number, 0 for at-large; absent for anything else. */
  district?: number;
  name: string;
  /** Percent of the expected vote counted, 0 to 100. */
  reporting: number;
  /** Most votes first. */
  candidates: Candidate[];
  prior?: Prior;
}

export function partyOf(name: unknown): Party {
  const p = String(name ?? '').toLowerCase();
  if (p.startsWith('democrat')) return 'D';
  if (p.startsWith('republican')) return 'R';
  if (p === 'independent') return 'I';
  return 'O';
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function readCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c.name === 'string' && partyOfRaw(c) !== 'write-in')
    .map((c) => ({
      name: c.name.trim(),
      party: partyOf(c.party),
      votes: num(c.votes),
      winner: c.winner === true,
      incumbent: c.incumbent === true,
    }))
    .sort((a, b) => b.votes - a.votes);
}

const partyOfRaw = (c: { party?: unknown }) => String(c.party ?? '').toLowerCase();

/** `il-07` → { state: 'IL', district: 7 }; `ak-al` → district 0. */
export function parseDistrictKey(key: string): { state: string; district?: number } {
  const [st, d] = key.split('-');
  const state = st.toUpperCase();
  if (d === undefined) return { state };
  return { state, district: d.toLowerCase() === 'al' ? 0 : Number(d) };
}

/** The regions of a nationwide race, each a race of its own. */
export function readRegionRaces(body: unknown): Race[] {
  const regions = (body as { region_results?: Record<string, unknown> }).region_results;
  if (!regions || typeof regions !== 'object') return [];
  return Object.entries(regions).map(([key, r]) => {
    const region = r as { name?: string; percent_reporting?: unknown; candidates?: unknown };
    return {
      key: key.toLowerCase(),
      ...parseDistrictKey(key),
      name: region.name ?? key.toUpperCase(),
      reporting: Math.min(100, Math.max(0, num(region.percent_reporting))),
      candidates: readCandidates(region.candidates),
    };
  });
}

/** One race on its own (`/race/{id}`), such as a school board seat. */
export function readRace(id: number | string, body: unknown): Race {
  const r = body as { election_name?: string; province?: string; percent_reporting?: unknown; candidates?: unknown };
  return {
    key: String(id),
    state: String(r.province ?? '').toUpperCase(),
    name: r.election_name ?? `Race ${id}`,
    reporting: Math.min(100, Math.max(0, num(r.percent_reporting))),
    candidates: readCandidates(r.candidates),
  };
}

interface ForecastEntry {
  rating?: string;
  democrat_pct?: number;
  republican_pct?: number;
  independent_pct?: number;
  incumbent_party?: string;
  democratic?: string;
  republican?: string;
  independent?: string;
}

/** civicAPI's own forecast gives each race a rating and win chances for its
 *  Democrat, Republican and independent (`*_pct`: chances, not vote shares,
 *  98.7 for a safe seat); matched to the candidates by name, or else by
 *  party when only one candidate has it. */
export function attachPriors(races: Race[], forecast: unknown): void {
  const states = (forecast as { states?: Record<string, ForecastEntry> })?.states;
  if (!states) return;
  const byKey = new Map(Object.entries(states).map(([k, v]) => [k.toLowerCase(), v]));
  for (const race of races) {
    const f = byKey.get(race.key);
    if (!f) continue;
    const slots: [Party, string | undefined, number | undefined][] = [
      ['D', f.democratic, f.democrat_pct],
      ['R', f.republican, f.republican_pct],
      ['I', f.independent, f.independent_pct],
    ];
    const chance: Record<string, number> = {};
    for (const [party, name, pct] of slots) {
      if (!pct) continue;
      const byName = name && race.candidates.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
      const ofParty = race.candidates.filter((c) => c.party === party);
      const match = byName || (ofParty.length === 1 ? ofParty[0] : undefined);
      if (match) chance[match.name] = (chance[match.name] ?? 0) + pct / 100;
    }
    const inc = f.incumbent_party?.toUpperCase();
    race.prior = {
      rating: f.rating ?? '',
      chance,
      incumbentParty: inc === 'D' || inc === 'R' || inc === 'I' ? inc : null,
    };
  }
}

export interface Chamber {
  races: Race[];
  updated: number;
}

/** Who holds each seat, where the forecast doesn't say: the template board's
 *  tables, or else the party of an incumbent who is running. Without it a
 *  flip can't be told from a hold. */
export function fillHolders(races: Race[], chamber: 'house' | 'senate'): void {
  for (const race of races) {
    const seat = (chamber === 'senate' ? SENATE_SEATS : HOUSE_WATCH)[race.key];
    const holder = seat?.holder ?? race.candidates.find((c) => c.incumbent)?.party ?? null;
    if (!race.prior) {
      if (seat || holder) race.prior = { rating: seat ? RATING_NAME[seat.rating] : '', chance: {}, incumbentParty: holder };
    } else if (!race.prior.incumbentParty || (chamber === 'senate' && seat)) {
      // The Senate tables are checked by hand (NE: an independent's challenge
      // to a Republican seat; FL and OH: specials), so they win.
      race.prior.incumbentParty = holder;
    }
  }
}

/** The forecast doesn't change tonight, and civicAPI drops it under load:
 *  once had, it's kept, in memory and in the browser across restarts. */
const forecasts: Partial<Record<'house' | 'senate', unknown>> = {};

async function forecastFor(fetcher: Fetcher, chamber: 'house' | 'senate'): Promise<unknown> {
  const key = `${PLUGIN_ID}:forecast:${chamber}`;
  if (forecasts[chamber] === undefined) {
    try { forecasts[chamber] = JSON.parse(localStorage.getItem(key) ?? 'null') ?? undefined; } catch { /* no storage */ }
  }
  if (forecasts[chamber] !== undefined) return forecasts[chamber];
  try {
    const body = await getJson(fetcher, `${API}/forecast/${chamber}/2026/civicapi`);
    forecasts[chamber] = body;
    try { localStorage.setItem(key, JSON.stringify(body)); } catch { /* full or blocked */ }
    return body;
  } catch {
    return null;
  }
}

export async function loadChamber(fetcher: Fetcher, chamber: 'house' | 'senate'): Promise<Chamber> {
  const id = chamber === 'house' ? HOUSE_RACE : SENATE_RACE;
  const [results, forecast] = await Promise.all([
    getJson(fetcher, `${API}/race/${id}`),
    // A missing forecast only loses the pre-results baseline.
    forecastFor(fetcher, chamber),
  ]);
  const races = readRegionRaces(results);
  if (races.length === 0) throw new SourceError(204);
  attachPriors(races, forecast);
  fillHolders(races, chamber);
  const updated = Date.parse(String((results as { last_updated?: string }).last_updated ?? '')) || 0;
  return { races, updated };
}

// ── Chicago Board of Education ──────────────────────────────────────────────

export interface SearchHit {
  id: number;
  name: string;
}

/** Is this the Chicago Board of Education, rather than a suburban district's
 *  board? Chicago's seats are its 20 lettered subdistricts and a president. */
export function isChicagoBoard(name: string, municipality?: unknown, district?: unknown): boolean {
  if (!/board of education/i.test(name)) return false;
  const where = `${name} ${municipality ?? ''} ${district ?? ''}`;
  if (/chicago/i.test(where)) return true;
  return /district\s+\d{1,2}[ab]\b|president/i.test(name) && /cook/i.test(where);
}

/** Finds this election's Chicago school board races. The search is slow and
 *  times out under election-night load, so callers keep what it finds. */
export async function searchSchoolBoard(fetcher: Fetcher): Promise<SearchHit[]> {
  const q = new URLSearchParams({
    query: 'Board of Education',
    province: 'IL',
    startDate: ELECTION_DAY,
    endDate: ELECTION_DAY,
    limit: '100',
  });
  const body = await getJson(fetcher, `${API}/race/search?${q}`);
  const races = (body as { races?: unknown[] }).races;
  if (!Array.isArray(races)) throw new SourceError(503);
  return races
    .map((r) => r as { id?: unknown; election_name?: unknown; municipality?: unknown; district?: unknown })
    .filter((r) => typeof r.id === 'number' && typeof r.election_name === 'string' && isChicagoBoard(r.election_name, r.municipality, r.district))
    .map((r) => ({ id: r.id as number, name: r.election_name as string }));
}

/** A race, or, when civicAPI rolls the board up into one race, its seats. */
export async function loadSchoolRace(fetcher: Fetcher, id: number): Promise<Race[]> {
  const body = await getJson(fetcher, `${API}/race/${id}`);
  const seats = readRegionRaces(body);
  return seats.length > 0 ? seats : [readRace(id, body)];
}

/** "Board of Education District 1A" → "1A"; the president's race → "President". */
export function seatLabel(name: string): string {
  if (/president/i.test(name)) return 'President';
  const m = /(?:district|subdistrict)\s*(\d{1,2}\s*[ab]?)/i.exec(name);
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : name;
}

/** President first, then 1A, 1B, 2A … 10B. */
export function seatOrder(label: string): number {
  if (label === 'President') return -1;
  const m = /^(\d+)([AB]?)$/.exec(label);
  return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 999;
}
