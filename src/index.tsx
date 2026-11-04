import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { readConfig } from './config';
import type { Config } from './config';
import {
  hostFetcher, loadChamber, loadChicagoBoard, MAJORITY, PLUGIN_ID, SEATS, SENATE_HOLDOVER,
  seatLabel, seatOrder, SourceError,
} from './data';
import type { Chamber, Fetcher, Party, Race } from './data';
import { countSeats, project } from './projection';
import type { Projection, SeatCount } from './projection';
import { closeAt, closings, listOf, loadNews, newsItems, pollItems } from './feed';
import type { FeedItem, Headline } from './feed';
import { GEO, MAP_SIZE, NAMES } from './geo';
import { HOUSE_WATCH } from './watch';
import { COLOR, CSS, FONTS_HREF } from './styles';
import { CelebrationOverlay } from './celebrate';
import type { Celebration, Win } from './celebrate';

/** After a failed load, try again this soon. */
const RETRY_MS = 30_000;
/** New headlines this often. */
const NEWS_MS = 2 * 60_000;
/** A feed item this new is highlighted. */
const FRESH_MS = 3 * 60_000;

const PARTY_WORD: Record<Party, string> = { D: 'Democrat', R: 'Republican', I: 'independent', O: 'third-party candidate' };

function log(level: 'info' | 'warn' | 'error', message: string) {
  try {
    window.__HS_SDK__?.emit?.({ type: 'log', level, message: `[${PLUGIN_ID}] ${message}` });
  } catch { /* logging is best effort */ }
}

// ── Results ─────────────────────────────────────────────────────────────────
// Kept outside React so a module that unmounts when its screen rotates away
// shows the last count at once when it comes back, without a new request.

/** A call as this module first saw it: civicAPI doesn't say when it was made. */
interface SeenCall {
  at: number;
  party: Party;
  gain: boolean;
  title: string;
  state: string;
}

interface Store {
  senate: Chamber | null;
  house: Chamber | null;
  school: Race[];
  /** School board race ids, found by searching. */
  /** The last search for them failed: civicAPI's search is slow under load. */
  schoolFailed: boolean;
  schoolLoadedAt: number;
  schoolLoading: Promise<void> | null;
  failure: string | null;
  loadedAt: number;
  /** When the count shown, saved by an earlier run, was had: 0 once a new
   *  one is in. */
  savedAt: number;
  loading: Promise<void> | null;
  news: Headline[];
  newsLoadedAt: number;
  newsLoading: Promise<void> | null;
  calls: Record<string, SeenCall> | null;
  /** Calls seen from here on are news: false until the first count, unless
   *  an earlier run saved what it had seen. */
  callsPrimed: boolean;
  /** Who led each Senate count last time, for lead changes. */
  leaders: Record<string, string>;
  leads: FeedItem[];
  /** Democratic wins seen in the count being loaded. */
  wins: Win[];
  /** Waiting to be shown, oldest first. */
  celebrations: Celebration[];
  /** Showings already played, as "id:n". */
  played: Set<string>;
}

const store: Store = {
  senate: null, house: null, school: [], schoolFailed: false,
  schoolLoadedAt: 0, schoolLoading: null, failure: null, loadedAt: 0, savedAt: 0, loading: null,
  news: [], newsLoadedAt: 0, newsLoading: null, calls: null, callsPrimed: false, leaders: {}, leads: [], wins: [], celebrations: [], played: new Set(),
};

/** Re-render on a partial load. */
const listeners = new Set<() => void>();

const CALLS_KEY = `${PLUGIN_ID}:calls:2026-11-03`;

const describe = (e: unknown) => (e instanceof SourceError ? `civicAPI answered with an error (${e.status})` : "Can't reach civicAPI");

export function raceTitle(race: Race, chamber: 'senate' | 'house'): string {
  if (chamber === 'senate') return `${NAMES[race.state] ?? race.state} Senate`;
  return `${race.state}-${race.district === 0 ? 'AL' : String(race.district).padStart(2, '0')}`;
}

/** Watched in the feed and the race list: every Senate race, and the House
 *  seats on the watch list, rated a toss-up or a lean, or changing hands. */
function watched(race: Race, pr: Projection, chamber: 'senate' | 'house'): boolean {
  if (chamber === 'senate') return true;
  return !!HOUSE_WATCH[race.key] || /toss|tilt|lean/i.test(race.prior?.rating ?? '') || pr.flip;
}

/** New calls and lead changes since the last count, for the live feed. */
function track(chamber: 'senate' | 'house', races: Race[]) {
  if (!store.calls) {
    try {
      const saved = localStorage.getItem(CALLS_KEY);
      store.calls = saved ? JSON.parse(saved) : {};
      store.callsPrimed = !!saved;
    } catch {
      store.calls = {};
    }
  }
  // Calls already made when the module first ever runs aren't news to anyone.
  const primed = store.callsPrimed || store.loadedAt > 0;
  const calls = store.calls!;
  let changed = false;
  for (const race of races) {
    const pr = project(race);
    const id = `${chamber}:${race.key}`;
    if (pr.status === 'called' && pr.leader && !calls[id]) {
      const holder = race.prior?.incumbentParty;
      calls[id] = {
        at: primed && watched(race, pr, chamber) ? Date.now() : 0,
        party: pr.leader.party,
        gain: !!holder && holder !== pr.leader.party,
        title: `${raceTitle(race, chamber)} called for ${pr.leader.name} (${pr.leader.party})`,
        state: race.state,
      };
      if (primed && pr.leader.party === 'D') {
        store.wins.push({ title: raceTitle(race, chamber), name: pr.leader.name, gain: calls[id].gain, fromR: holder === 'R', senate: chamber === 'senate' });
      }
      changed = true;
    }
    if (chamber !== 'senate' || pr.status === 'called' || pr.totalVotes === 0) continue;
    // The count's leader, not the model's favourite.
    const [a, b] = race.candidates;
    if (!a || !b || a.votes === b.votes) continue;
    const before = store.leaders[race.key];
    store.leaders[race.key] = a.name;
    if (before && before !== a.name && race.reporting >= 5) {
      const total = race.candidates.reduce((s, c) => s + c.votes, 0);
      store.leads.unshift({
        id: `lead-${race.key}-${Date.now()}`,
        kind: 'lead',
        at: Date.now(),
        party: a.party,
        state: race.state,
        title: `${raceTitle(race, chamber)}: ${a.name} (${a.party}) moves ahead of ${b.name} (${b.party})`,
        text: `${((a.votes / total) * 100).toFixed(1)}% to ${((b.votes / total) * 100).toFixed(1)}% with ${Math.round(race.reporting)}% counted.`,
      });
      store.leads.length = Math.min(store.leads.length, 40);
    }
  }
  if (changed) {
    try { localStorage.setItem(CALLS_KEY, JSON.stringify(calls)); } catch { /* full or blocked */ }
  }
}

async function loadSchool(fetcher: Fetcher): Promise<void> {
  try {
    const races = (await loadChicagoBoard(fetcher)).filter((r) => BOARD_SEATS.includes(seatLabel(r.name)));
    if (races.length) store.school = races.sort((a, b) => seatOrder(seatLabel(a.name)) - seatOrder(seatLabel(b.name)));
    if (store.schoolFailed) log('info', 'Sun-Times results are answering again');
    store.schoolFailed = false;
  } catch (e) {
    // The last count stays up.
    if (!store.schoolFailed) log('warn', `Sun-Times results: ${String(e)}`);
    store.schoolFailed = true;
  }
}

function refresh(fetcher: Fetcher, cfg: Config): Promise<void> | null {
  const since = Date.now() - store.loadedAt;
  const due = store.loadedAt === 0 || since >= (store.failure ? RETRY_MS : cfg.refreshSeconds * 1000);
  if (!due || store.loading) return store.loading;
  store.loading = (async () => {
    // Each chamber shows as soon as it's in: under load, one can take a minute.
    const load = async (chamber: 'senate' | 'house') => {
      const got = await loadChamber(fetcher, chamber);
      track(chamber, got.races);
      store[chamber] = got;
      try { localStorage.setItem(`${PLUGIN_ID}:${chamber}`, JSON.stringify({ ...got, savedAt: Date.now() })); } catch { /* full or blocked */ }
      for (const l of listeners) l();
    };
    // After a restart, the last count this browser saw, until a new one is in.
    if (store.loadedAt === 0) {
      for (const chamber of ['senate', 'house'] as const) {
        try {
          const saved = JSON.parse(localStorage.getItem(`${PLUGIN_ID}:${chamber}`) ?? 'null');
          if (saved?.races && !store[chamber]) {
            store[chamber] = { races: saved.races, updated: saved.updated };
            store.savedAt = Math.max(store.savedAt, saved.savedAt ?? 0);
          }
        } catch { /* nothing saved */ }
      }
      for (const l of listeners) l();
    }
    const [senate, house] = await Promise.allSettled([load('senate'), load('house')]);
    // One celebration for everything a count brings in, Senate seats first.
    if (store.wins.length) {
      const wins = store.wins.sort((a, b) => Number(b.senate) - Number(a.senate) || Number(b.gain) - Number(a.gain));
      store.celebrations = [...store.celebrations, { id: Date.now(), wins, flip: false }].slice(-20);
      store.wins = [];
    }
    const failed = [senate, house].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const failure = failed ? describe(failed.reason) : null;
    if (failure !== store.failure) log(failure ? 'warn' : 'info', failure ?? 'civicAPI is answering again');
    store.failure = failure;
    if (!failure) store.savedAt = 0;
    store.loadedAt = Date.now();
    store.loading = null;
  })();
  return store.loading;
}

/** The school board on its own timer, from its own source, so neither holds
 *  up the other. */
function refreshSchool(fetcher: Fetcher, cfg: Config): Promise<void> | null {
  if (!cfg.schoolBoard) return null;
  const due = Date.now() - store.schoolLoadedAt >= cfg.refreshSeconds * 1000;
  if (!due || store.schoolLoading) return store.schoolLoading;
  store.schoolLoading = loadSchool(fetcher)
    .catch(() => {})
    .finally(() => {
      store.schoolLoadedAt = Date.now();
      store.schoolLoading = null;
    });
  return store.schoolLoading;
}

function refreshNews(fetcher: Fetcher, cfg: Config): Promise<void> | null {
  if (!cfg.news) return null;
  if (Date.now() - store.newsLoadedAt < NEWS_MS || store.newsLoading) return store.newsLoading;
  store.newsLoading = loadNews(fetcher)
    .then((news) => { if (news.length || !store.news.length) store.news = news; })
    .catch((e) => log('warn', `headlines: ${String(e)}`))
    .finally(() => {
      store.newsLoadedAt = Date.now();
      store.newsLoading = null;
    });
  return store.newsLoading;
}

function useResults(fetcher: Fetcher, cfg: Config) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () => {
      for (const p of [refresh(fetcher, cfg), refreshSchool(fetcher, cfg), refreshNews(fetcher, cfg)]) {
        p?.then(() => { if (alive) setTick((t) => t + 1); });
      }
    };
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    check();
    const timer = setInterval(check, 5_000);
    return () => {
      alive = false;
      listeners.delete(update);
      clearInterval(timer);
    };
  }, [fetcher, cfg]);
  return store;
}

// ── Timers and size ─────────────────────────────────────────────────────────

/** A counter that goes up every `seconds`, from the wall clock, so it carries
 *  on where it was when a screen rotates back. */
function useStep(seconds: number): number {
  const ms = seconds * 1000;
  const [step, setStep] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      setStep(Math.floor(now / ms));
      timer = setTimeout(arm, ms - (now % ms) + 20);
    };
    arm();
    return () => clearTimeout(timer);
  }, [ms]);
  return step;
}

function useBoxSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Layout size, not on-screen size: the editor scales the canvas down
      // with a transform, and the layout must match the module's real shape.
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function useFonts() {
  useEffect(() => {
    if (document.getElementById(`${PLUGIN_ID}-fonts`)) return;
    const link = document.createElement('link');
    link.id = `${PLUGIN_ID}-fonts`;
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }, []);
}

const timeFmt = (tz: string | undefined, seconds = false) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZone: tz });

function tzName(tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: tz }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** "Mary Peltola" → "Peltola"; keeps "Jr." and "III" off the end. */
export function lastName(name: string): string {
  const parts = name.replace(/\(.*?\)|“.*?”|".*?"/g, ' ').trim().split(/\s+/);
  while (parts.length > 1 && /^(jr|sr|ii|iii|iv)\.?,?$/i.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1]?.replace(/,$/, '') ?? name;
}

const pct = (x: number) => (x >= 0.995 && x < 1 ? '>99' : String(Math.round(x * 100)));

interface Scored {
  race: Race;
  pr: Projection;
  chamber: 'senate' | 'house';
}

const holderOf = (s: Scored): Party | null => s.race.prior?.incumbentParty ?? null;

interface Tally {
  seats: SeatCount;
  called: number;
  total: number;
  gains: Record<Party, number>;
  /** Flips this module expects that aren't called yet. */
  likely: Record<Party, number>;
  net: { D: number; R: number };
}

export function tally(scored: Scored[], holdover?: Record<Party, number>): Tally {
  const zero = (): Record<Party, number> => ({ D: 0, R: 0, I: 0, O: 0 });
  const t: Tally = { seats: countSeats(scored.map((s) => s.pr), holdover), called: 0, total: scored.length, gains: zero(), likely: zero(), net: { D: 0, R: 0 } };
  for (const s of scored) {
    const done = s.pr.status === 'called' || s.pr.status === 'unopposed';
    if (done) t.called++;
    const holder = holderOf(s);
    const p = s.pr.leader?.party;
    if (!p || !holder || p === holder) continue;
    if (done) {
      t.gains[p]++;
      if (p === 'D' || p === 'R') t.net[p]++;
      if (holder === 'D' || holder === 'R') t.net[holder]--;
    } else if (s.pr.flip) {
      t.likely[p]++;
    }
  }
  return t;
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A number that pops when it changes. */
function Num({ value, className }: { value: number; className?: string }) {
  const last = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (last.current !== value) setBump((b) => b + 1);
    last.current = value;
  }, [value]);
  return <span key={bump} className={`${className ?? ''}${bump ? ' bump' : ''}`}>{value}</span>;
}

function Gain({ party, label, t, note }: { party: Party; label: string; t: Tally; note?: string }) {
  const net = party === 'D' || party === 'R' ? `Net ${sign(t.net[party])}` : note ?? '';
  const likely = t.likely[party] ? ` · +${t.likely[party]} likely` : '';
  return (
    <div className={`gain ${party}`}>
      <span className="lbl">{label}</span>
      <Num className="num" value={t.gains[party]} />
      <span className="net">{net}{likely}</span>
    </div>
  );
}

function ChamberPanel({ chamber, t }: { chamber: 'senate' | 'house'; t: Tally }) {
  const total = SEATS[chamber];
  const { won, ahead, expected, open } = t.seats;
  const w = (n: number) => ({ width: `${(n / total) * 100}%` });
  const senate = chamber === 'senate';
  const dNeed = MAJORITY[chamber] - won.D;
  // The vice president breaks a 50–50 tie for the Republicans.
  const rNeed = (senate ? 50 : MAJORITY.house) - won.R;
  const verdict = dNeed <= 0
    ? `Democrats have won control of the ${senate ? 'Senate' : 'House'}.`
    : rNeed <= 0
    ? `Republicans have kept control of the ${senate ? 'Senate' : 'House'}.`
    : `Dems need ${dNeed} more · GOP needs ${rNeed} more`;
  const verdictColor = dNeed <= 0 ? COLOR.dem : rNeed <= 0 ? COLOR.rep : undefined;
  const showI = senate || t.gains.I > 0 || won.I > 0;
  const aheadNote = (p: Party) => (ahead[p] ? <em>+{ahead[p]} ahead</em> : null);
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>{senate ? 'Senate' : 'House'}</h2>
        {/* What each party is on course for, by this board's estimate. */}
        <span className="small">
          {t.called} of {t.total} called · Expected <b className="pD">{Math.round(expected.D)}</b>–<b className="pR">{Math.round(expected.R)}</b>
          {expected.I >= 0.5 ? <>–<b className="pI">{Math.round(expected.I)}</b></> : null}
        </span>
      </div>
      <div className={`gains${showI ? ' three' : ''}`}>
        <Gain party="D" label="Dem gains" t={t} />
        <Gain party="R" label="Rep gains" t={t} />
        {showI && <Gain party="I" label="Ind gains" t={t} note={senate ? 'Osborn (NE)' : ''} />}
      </div>
      <div className="bar" role="img" aria-label={`${won.D} Democratic, ${won.R} Republican, ${open} to call`}>
        <span className="bD" style={w(won.D)} />
        <span className="bD soft" style={w(ahead.D)} />
        <span className="bI" style={w(won.I + won.O)} />
        <span className="bI soft" style={w(ahead.I + ahead.O)} />
        <span style={{ flex: 1 }} />
        <span className="bR soft" style={w(ahead.R)} />
        <span className="bR" style={w(won.R)} />
        <i className="mark" style={{ left: `calc(${(MAJORITY[chamber] / total) * 100}% - 0.07em)` }} />
      </div>
      <div className="barlegend">
        <span className="D"><b>{won.D}</b> Dem{aheadNote('D')}</span>
        {won.I > 0 && <span className="I"><b>{won.I}</b> Ind</span>}
        <span className="R">{aheadNote('R')}<b>{won.R}</b> GOP</span>
      </div>
      <div className="verdict" style={{ color: verdictColor }}>{verdict}</div>
    </div>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────────

/** Drawn as boxes in the Atlantic: too small to see on the map. */
const SMALL = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];
const FULL: Record<Party, string> = { D: COLOR.dem, R: COLOR.rep, I: COLOR.ind, O: COLOR.ind };
const HOLD: Record<Party, string> = { D: COLOR.demHold, R: COLOR.repHold, I: COLOR.indHold, O: COLOR.indHold };

interface Paint {
  fill: string;
  opacity?: number;
  hatch?: boolean;
  /** White text: on a strong fill. */
  on?: boolean;
  label?: string;
  sub?: string;
}

function senatePaint(s: Scored | undefined): Paint {
  if (!s) return { fill: COLOR.mapNone };
  const { pr, race } = s;
  const p = pr.leader?.party;
  const counting = pr.totalVotes > 0 && pr.status !== 'called' ? `${Math.round(race.reporting)}%` : undefined;
  if (!p) return { fill: COLOR.mapOpen, sub: counting };
  const flip = !!holderOf(s) && holderOf(s) !== p;
  if (pr.status === 'called' || pr.status === 'unopposed') return flip ? { fill: FULL[p], hatch: true, on: true } : { fill: HOLD[p], on: true };
  // Not called: this module's estimate, fainter the less sure it is.
  const strength = pr.status === 'projected' ? 0.75 : pr.status === 'likely' ? 0.55 : pr.status === 'leaning' ? 0.3 : 0;
  if (!strength || pr.totalVotes === 0) return { fill: COLOR.mapOpen, sub: counting };
  return { fill: flip ? FULL[p] : HOLD[p], opacity: strength, sub: counting };
}

function housePaint(list: Scored[] | undefined): Paint {
  if (!list?.length) return { fill: COLOR.mapNone };
  const flips: Record<Party, number> = { D: 0, R: 0, I: 0, O: 0 };
  let calledFlips = 0;
  let open = 0;
  for (const s of list) {
    const done = s.pr.status === 'called' || s.pr.status === 'unopposed';
    if (!done) open++;
    const p = s.pr.leader?.party;
    if (p && s.pr.flip) {
      flips[p]++;
      if (done) calledFlips++;
    }
  }
  const total = flips.D + flips.R + flips.I + flips.O;
  if (!total) return { fill: open ? COLOR.mapOpen : COLOR.mapDone };
  const top = (Object.keys(flips) as Party[]).sort((a, b) => flips[b] - flips[a]);
  const tie = flips[top[0]] === flips[top[1]];
  const label = tie ? `${flips.D}D ${flips.R}R` : `+${flips[top[0]]}${top[0]}`;
  return { fill: tie ? COLOR.live : FULL[top[0]], opacity: calledFlips ? 1 : 0.55, on: true, label };
}

const UsMap = memo(function UsMap({ view, senate, house }: { view: 'senate' | 'house'; senate: Scored[]; house: Scored[] }) {
  const paints = useMemo(() => {
    const out: Record<string, Paint> = {};
    if (view === 'senate') {
      const by = new Map(senate.map((s) => [s.race.state, s]));
      for (const st of Object.keys(GEO)) out[st] = senatePaint(by.get(st));
    } else {
      const by = new Map<string, Scored[]>();
      for (const s of house) by.set(s.race.state, [...(by.get(s.race.state) ?? []), s]);
      for (const st of Object.keys(GEO)) out[st] = housePaint(by.get(st));
    }
    return out;
  }, [view, senate, house]);

  const shapes: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  let boxY = 168;
  for (const [st, g] of Object.entries(GEO)) {
    const k = paints[st];
    const has = k.fill !== COLOR.mapNone;
    shapes.push(<path key={st} className="st" d={g.d} fill={k.fill} fillOpacity={k.opacity ?? 1} />);
    if (k.hatch) overlays.push(<path key={st} d={g.d} fill="url(#en26hatch)" />);
    const text = (x: number, y: number, small: boolean) => {
      if (k.label && !small) return <text key={st} className="flipLbl" x={x} y={y}>{st} {k.label}</text>;
      return (
        <text key={st} className={`lbl${k.on && (k.opacity ?? 1) > 0.7 ? ' on' : ''}`} x={x} y={y}>
          <tspan x={x} dy={k.sub && !small ? '-0.45em' : 0}>{small && k.label ? `${st} ${k.label}` : st}</tspan>
          {k.sub && !small && <tspan className="pc" x={x} dy="1.15em">{k.sub}</tspan>}
        </text>
      );
    };
    if (SMALL.includes(st)) {
      const b = { x: 922, y: boxY, w: 50, h: 20 };
      boxY += 25;
      shapes.push(<rect key={`${st}-box`} className="st" x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill={k.fill} fillOpacity={k.opacity ?? 1} />);
      if (k.hatch) overlays.push(<rect key={`${st}-box`} x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="url(#en26hatch)" />);
      labels.push(text(b.x + b.w / 2, b.y + b.h / 2, true));
    } else if (has) {
      const [x, y] = st === 'FL' ? [g.c[0] + 12, g.c[1]] : st === 'MI' ? [g.c[0] + 8, g.c[1] + 18] : st === 'LA' ? [g.c[0] - 10, g.c[1]] : g.c;
      labels.push(text(x, y, false));
    }
  }
  return (
    <svg className="usmap" viewBox={`0 0 ${MAP_SIZE.w} ${MAP_SIZE.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${view === 'senate' ? 'Senate' : 'House'} results map`}>
      <defs>
        <pattern id="en26hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.6" height="7" fill="rgba(255,255,255,.5)" />
        </pattern>
      </defs>
      {shapes}
      {overlays}
      {labels}
    </svg>
  );
});

function MapPanel({ view, rotating, senate, house }: { view: 'senate' | 'house'; rotating: boolean; senate: Scored[]; house: Scored[] }) {
  const sw = (fill: string, label: string, extra?: React.CSSProperties) => (
    <span key={label}><i style={{ background: fill, ...extra }} />{label}</span>
  );
  const hatch = (c: string, h: string) => ({ background: `repeating-linear-gradient(45deg, ${c} 0 3px, ${h} 3px 5px)` });
  return (
    <section className="panel mapwrap">
      <div className="maptools">
        <div className="seg">
          {(rotating || view === 'senate') && <span className={view === 'senate' ? 'on' : ''}>Senate map</span>}
          {(rotating || view === 'house') && <span className={view === 'house' ? 'on' : ''}>House flips</span>}
        </div>
      </div>
      <div className="mapbox"><UsMap view={view} senate={senate} house={house} /></div>
      <div className="legend">
        {view === 'senate' ? [
          sw(COLOR.dem, 'Dem flip', hatch(COLOR.dem, COLOR.demHold)),
          sw(COLOR.rep, 'GOP flip', hatch(COLOR.rep, COLOR.repHold)),
          sw(COLOR.demHold, 'Dem hold'),
          sw(COLOR.repHold, 'GOP hold'),
          <span key="faint"><i style={{ background: `linear-gradient(90deg, ${COLOR.demHold}88 50%, ${COLOR.repHold}88 50%)` }} />Likely, not called</span>,
          sw(COLOR.mapOpen, 'Not called'),
        ] : [
          sw(COLOR.dem, 'More Dem flips'),
          sw(COLOR.rep, 'More GOP flips'),
          <span key="faint"><i style={{ background: `linear-gradient(90deg, ${COLOR.dem}88 50%, ${COLOR.rep}88 50%)` }} />Likely, not called</span>,
          sw(COLOR.mapOpen, 'No flips yet'),
          sw(COLOR.mapDone, 'All called'),
        ]}
      </div>
    </section>
  );
}

// ── Clock and next poll closing ─────────────────────────────────────────────

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Clock({ tz }: { tz?: string }) {
  const now = useNow(1000);
  return <span className="chip clock">{timeFmt(tz, true).format(now)} {tzName(tz)}</span>;
}

function NextClose({ tz, senateStates }: { tz?: string; senateStates: Set<string> }) {
  const now = useNow(1000);
  const next = closings().find((c) => c.at > now);
  const fmt = timeFmt(tz);
  if (!next) {
    return (
      <section className="next">
        <span className="t">All closed</span>
        <div className="what"><b>Every poll in the country has closed</b><span className="sts">Watch for calls in the West and Alaska, and for close races counted overnight.</span></div>
      </section>
    );
  }
  const ms = next.at - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  // Names for a few states; codes for a long list, so it fits on one line.
  const name = (list: string[]) => (list.length > 3 ? list.join(', ') : listOf(list.map((st) => NAMES[st] ?? st)));
  const key = next.states.filter((st) => senateStates.has(st));
  return (
    <section className="next">
      <span className="t">{h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`}</span>
      <div className="what">
        <b>Polls close at {fmt.format(next.at)} {tzName(tz)}</b>
        <span className="sts">{key.length ? `Senate races: ${name(key)}` : `States: ${name(next.states)}`}</span>
      </div>
    </section>
  );
}

// ── Pages: the race list and the live feed turn over on their own ──────────

interface Group<T> {
  label: string;
  items: T[];
}

function Pager<T>({ groups, rowEm, gapEm, em, seconds, row, empty }: {
  groups: Group<T>[];
  rowEm: number;
  gapEm: number;
  em: number;
  seconds: number;
  row: (item: T) => React.ReactNode;
  empty: React.ReactNode;
}) {
  const [ref, box] = useBoxSize();
  const step = useStep(seconds);
  const per = Math.max(1, Math.floor((box.h / em + gapEm) / (rowEm + gapEm)));
  const pages = groups.flatMap((g) => {
    const n = Math.ceil(g.items.length / per);
    return Array.from({ length: n }, (_, i) => ({ label: g.label, items: g.items.slice(i * per, (i + 1) * per), i, n }));
  });
  const index = pages.length ? step % pages.length : 0;
  const page = pages[index];
  // Where the progress bar starts, so it lines up with the wall clock.
  const elapsed = (Date.now() % (seconds * 1000)) / 1000;
  return (
    <div className="pager">
      {page && (
        <div className="pages">
          <span>{page.label}{page.n > 1 ? ` · ${page.i + 1} of ${page.n}` : ''}</span>
          {pages.length > 1 && <span className="track"><span key={step} style={{ animationDuration: `${seconds}s`, animationDelay: `-${elapsed}s` }} /></span>}
        </div>
      )}
      <div ref={ref} className="rows">
        {box.h > 0 && <div key={`${index}-${pages.length}`} className="page">{page ? page.items.map((item) => row(item)) : empty}</div>}
      </div>
    </div>
  );
}

// ── Race desk ───────────────────────────────────────────────────────────────

const RATING_ORDER = (rating: string) =>
  /toss/i.test(rating) ? 0 : /tilt|lean/i.test(rating) ? 1 : /likely/i.test(rating) ? 2 : /safe|solid/i.test(rating) ? 4 : 3;

// Row heights, in the module's em: few enough per page to read across a room.
const RACE_EM = 3.6;
const FEED_EM = 5.4;

function RaceRow({ s, tz, calls }: { s: Scored; tz?: string; calls: Record<string, SeenCall> | null }) {
  const { race, pr, chamber } = s;
  const fmt = timeFmt(tz);
  const holder = holderOf(s);
  const counted = pr.totalVotes > 0;
  const shown = [pr.leader, pr.runnerUp].filter((c): c is NonNullable<typeof c> => !!c).sort((a, b) => (counted ? b.votes - a.votes : 0));
  const done = pr.status === 'called' || pr.status === 'unopposed';
  const flip = !!pr.leader && !!holder && pr.leader.party !== holder && (done || pr.flip);
  const close = closeAt(race.state);
  const code = chamber === 'senate' ? race.state : raceTitle(race, chamber);
  // A House district's code already says the state.
  const sub = chamber === 'senate' ? NAMES[race.state] ?? race.state : '';
  const rating = race.prior?.rating ?? '';

  let note: React.ReactNode;
  if (counted && shown.length >= 2) {
    const [a, b] = shown;
    const sa = (pr.share[a.name] ?? 0) * 100;
    const sb = (pr.share[b.name] ?? 0) * 100;
    note = (
      <>
        <span className="n"><b>{sa.toFixed(1)}%</b> – <b>{sb.toFixed(1)}%</b> · {Math.round(race.reporting)}% in</span>
        <div className="h2hbar">
          <span className={`b${a.party}`} style={{ width: `${sa}%` }} />
          <span style={{ flex: 1 }} />
          <span className={`b${b.party}`} style={{ width: `${sb}%` }} />
          <i className="mid" />
        </div>
      </>
    );
  } else {
    // Before any votes, the pre-election rating says what to expect.
    note = <span className="n">{rating || `Held by ${holder ? (holder === 'I' ? 'Ind' : holder) : '—'}`}{close ? ` · polls closed ${fmt.format(close)}` : ''}</span>;
  }

  let result: React.ReactNode;
  if (done && pr.leader) {
    const seen = calls?.[`${chamber}:${race.key}`];
    result = (
      <div className="res">
        <span className={`w ${pr.leader.party}`}>{pr.leader.party} {flip ? 'GAIN' : 'HOLD'}</span>
        <span className="at">{pr.status === 'unopposed' ? 'unopposed' : seen?.at ? `called ${fmt.format(seen.at)}` : 'called'}</span>
      </div>
    );
  } else if (!counted || !pr.leader) {
    const open = close != null && close > Date.now();
    result = <div className="res"><span className="at">{open ? `Polls ${fmt.format(close!)}` : 'No votes yet'}</span></div>;
  } else if (pr.status === 'tossup') {
    result = <div className="res"><span className="e TU">Too close</span><span className="at">{pr.leader.party} {pct(pr.chance)}% to win</span></div>;
  } else {
    const word = pr.status === 'projected' ? 'Projected' : pr.status === 'likely' ? 'Likely' : 'Leaning';
    result = (
      <div className="res">
        <span className={`e p${pr.leader.party}`}>{word} {pr.leader.party}</span>
        <span className="at">{pct(pr.chance)}% to win</span>
      </div>
    );
  }

  const party = (p: Party) => (p === 'O' ? 'I' : p);
  return (
    <div key={`${chamber}-${race.key}`} className={`race h${holder ?? ''}${flip ? ' flip' : ''}`} style={{ height: `${RACE_EM}em` }}>
      <div className="code">{code}{sub && <small>{sub}</small>}</div>
      <div className="who">
        <div className="m">
          {shown.length === 0 ? <span className="small">No candidates listed</span> : shown.map((c, i) => (
            <React.Fragment key={c.name}>
              {i > 0 && <span className="small"> vs </span>}
              {/* Names are in their party's color; only others say which. */}
              <span className={`p${party(c.party)}`}>{lastName(c.name)}{c.party === 'D' || c.party === 'R' ? '' : ` (${c.party})`}</span>
              {c.incumbent && <span className="small"> inc.</span>}
              {c.winner && ' ✓'}
            </React.Fragment>
          ))}
        </div>
        {note}
      </div>
      {result}
    </div>
  );
}

function RaceDesk({ senate, house, tz, em, seconds, calls }: { senate: Scored[]; house: Scored[]; tz?: string; em: number; seconds: number; calls: Record<string, SeenCall> | null }) {
  const groups = useMemo(() => {
    // Races being counted first, closest first; then the latest calls; then
    // those still waiting, by poll closing and rating.
    const phase = (s: Scored) => (s.pr.status === 'called' || s.pr.status === 'unopposed' ? 1 : s.pr.totalVotes > 0 ? 0 : 2);
    const calledAt = (s: Scored) => calls?.[`${s.chamber}:${s.race.key}`]?.at ?? 0;
    const order = (a: Scored, b: Scored) =>
      phase(a) - phase(b)
      || (phase(a) === 0 ? a.pr.chance - b.pr.chance : 0)
      || (phase(a) === 1 ? calledAt(b) - calledAt(a) : 0)
      || (closeAt(a.race.state) ?? 0) - (closeAt(b.race.state) ?? 0)
      || RATING_ORDER(a.race.prior?.rating ?? '') - RATING_ORDER(b.race.prior?.rating ?? '')
      || a.race.key.localeCompare(b.race.key, undefined, { numeric: true });
    // Fewer rows to a page makes for a long round, so it leaves out what
    // isn't news: races whose polls haven't closed (the countdown has those),
    // and House calls more than an hour old.
    const now = Date.now();
    const pending = (s: Scored) => s.pr.totalVotes === 0 && phase(s) === 2 && (closeAt(s.race.state) ?? 0) > now;
    const stale = (s: Scored) => phase(s) === 1 && now - calledAt(s) > 60 * 60_000;
    const sen = senate.filter((s) => !pending(s));
    const h = house.filter((s) => watched(s.race, s.pr, 'house') && !pending(s) && !stale(s));
    return [
      { label: 'Senate races', items: sen.sort(order) },
      { label: 'House · competitive seats', items: h.sort(order) },
    ].filter((g) => g.items.length);
  }, [senate, house, calls]);
  return (
    <Pager
      groups={groups}
      rowEm={RACE_EM}
      gapEm={0.35}
      em={em}
      seconds={seconds}
      row={(s) => <RaceRow key={`${s.chamber}-${s.race.key}`} s={s} tz={tz} calls={calls} />}
      empty={<div className="empty">No polls have closed yet.</div>}
    />
  );
}

// ── Live feed ───────────────────────────────────────────────────────────────

function FeedRow({ item, tz, now }: { item: FeedItem; tz?: string; now: number }) {
  let tag: React.ReactNode;
  if (item.kind === 'call' && item.party) tag = <span className={`tag ${item.party}`}>{item.party} {item.gain ? 'GAIN' : 'HOLD'}</span>;
  else if (item.kind === 'lead' && item.party) tag = <span className={`tag ${item.party}`}>LEAD</span>;
  else if (item.kind === 'polls') tag = <span className="tag N">POLLS</span>;
  else tag = <span className="tag W">NEWS</span>;
  const st = item.kind === 'news' ? <span className="tag ST">{item.state ?? 'US'}</span> : null;
  return (
    <div className={`item${now - item.at < FRESH_MS ? ' fresh' : ''}`} style={{ height: `${FEED_EM}em` }}>
      <div className="head">{tag}{st}<span className="tm">{timeFmt(tz).format(item.at)}{item.source ? ` · ${item.source}` : ''}</span></div>
      <div className="body"><b>{item.title}</b>{item.text ? ` ${item.text}` : ''}</div>
    </div>
  );
}

function LiveFeed({ items, minutes, tz, em, seconds }: { items: FeedItem[]; minutes: number; tz?: string; em: number; seconds: number }) {
  const now = Date.now();
  return (
    <section className="panel feedpanel">
      <div className="panel-h">
        <h2><span className="livedot" aria-hidden="true" />Live feed</h2>
        <span className="small">Last {minutes} min{items.length ? ` · ${items.length}` : ''}</span>
      </div>
      <Pager
        groups={items.length ? [{ label: 'Newest first', items }] : []}
        rowEm={FEED_EM}
        gapEm={0}
        em={em}
        seconds={seconds}
        row={(item) => <FeedRow key={item.id} item={item} tz={tz} now={now} />}
        empty={<div className="empty">Nothing in the last {minutes} minutes. Race calls, lead changes, poll closings and headlines show up here.</div>}
      />
    </section>
  );
}

// ── Chicago Board of Education ──────────────────────────────────────────────

/** The Chicago races shown: the board president and one district seat. */
export const BOARD_SEATS = ['President', '6A'];

function BoardRace({ label, race }: { label: string; race?: Race }) {
  const pr = race ? project(race) : null;
  const counted = !!pr && pr.totalVotes > 0;
  const shown = pr ? [pr.leader, pr.runnerUp].filter((c): c is NonNullable<typeof c> => !!c).sort((a, b) => b.votes - a.votes) : [];
  const share = (name: string) => (pr?.share[name] ?? 0) * 100;
  const called = pr?.status === 'called';
  return (
    <div className={`brace${called ? ' done' : ''}`}>
      <div className="bhead">
        <b>{label === 'President' ? 'Board president' : `District ${label}`}</b>
        <span className="small">{!race ? '—' : called ? 'Called' : counted ? `${Math.round(race.reporting)}% in` : 'No votes yet'}</span>
      </div>
      {shown.length > 0 && (
        <div className="bcands">
          {shown.map((c) => (
            <div key={c.name} className="bcand">
              <span className="bn">{lastName(c.name)}{c.winner ? ' ✓' : ''}</span>
              {counted && <span className="bp">{share(c.name).toFixed(1)}%</span>}
            </div>
          ))}
        </div>
      )}
      {counted && shown.length >= 2 && (
        <div className="h2hbar board">
          <span style={{ width: `${share(shown[0].name)}%` }} />
          <span style={{ flex: 1 }} />
          <span className="second" style={{ width: `${share(shown[1].name)}%` }} />
          <i className="mid" />
        </div>
      )}
    </div>
  );
}

function SchoolBoard({ races, failed }: { races: Race[]; failed: boolean }) {
  const by = new Map(races.map((r) => [seatLabel(r.name), r]));
  return (
    <section className="panel boardpanel">
      <div className="panel-h">
        <h2 style={{ fontSize: '1.15em' }}>Chicago Board of Ed</h2>
        {races.length === 0 && <span className="small">{failed ? 'Sun-Times not answering' : 'Loading…'}</span>}
      </div>
      {BOARD_SEATS.map((label) => <BoardRace key={label} label={label} race={by.get(label)} />)}
    </section>
  );
}

// ── Module ──────────────────────────────────────────────────────────────────

export default function ElectionNight(props: PluginComponentProps & { fetcher?: Fetcher }) {
  const { style } = props;
  const cfg = useMemo(() => readConfig(props.config ?? {}), [props.config]);
  const fetcher = useMemo(() => props.fetcher ?? hostFetcher(), [props.fetcher]);
  const tz = props.timezone ?? window.__HS_SDK__?.getHostSettings?.().timezone;
  useFonts();
  const data = useResults(fetcher, cfg);
  const mapStep = useStep(cfg.rotateSeconds);
  const [ref, box] = useBoxSize();

  const senate = useMemo(() => (data.senate?.races ?? []).map((race) => ({ race, pr: project(race), chamber: 'senate' as const })), [data.senate]);
  const house = useMemo(() => (data.house?.races ?? []).map((race) => ({ race, pr: project(race), chamber: 'house' as const })), [data.house]);
  const senateT = useMemo(() => tally(senate, SENATE_HOLDOVER), [senate]);
  const houseT = useMemo(() => tally(house), [house]);
  const senateStates = useMemo(() => new Set(senate.map((s) => s.race.state)), [senate]);

  // Rebuilt with each count or headline load, and each minute for the window.
  const minute = Math.floor(Date.now() / 60_000);
  const feed = useMemo(() => {
    const now = Date.now();
    const since = now - cfg.feedMinutes * 60_000;
    const calls: FeedItem[] = Object.entries(data.calls ?? {})
      .filter(([, c]) => c.at > since)
      .map(([id, c]) => ({ id, kind: 'call', at: c.at, party: c.party, gain: c.gain, state: c.state, title: `${c.title}.` }));
    return [
      ...calls,
      ...data.leads.filter((l) => l.at > since),
      ...pollItems(now, since, senateStates),
      ...(cfg.news ? newsItems(data.news, since) : []),
    ].sort((a, b) => b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loadedAt, data.newsLoadedAt, minute, cfg.feedMinutes, cfg.news, senateStates]);

  const gap = cfg.celebrateEvery * 60_000;
  const late = Math.min(3 * 60_000, gap);
  const { due, nextAt } = showingsOf(data.celebrations, data.played, Date.now(), cfg);
  const celebration = due ? { ...due.c, id: due.at } : undefined;
  const [, setDone] = useState(0);
  // Come back for the next showing, however quiet the count is by then.
  useEffect(() => {
    if (!nextAt) return;
    const t = setTimeout(() => setDone((n) => n + 1), nextAt - Date.now() + 50);
    return () => clearTimeout(t);
  }, [nextAt]);
  const finish = useCallback(() => {
    if (due) store.played.add(due.key);
    // A celebration with every showing behind it is done with.
    const end = (cfg.celebrateTimes - 1) * gap + late;
    store.celebrations = store.celebrations.filter((c) => Date.now() - c.id < end);
    setDone((n) => n + 1);
  }, [due?.key, cfg.celebrateTimes, gap, late]);

  const view = cfg.map === 'rotate' ? (mapStep % 2 === 0 ? 'senate' : 'house') : cfg.map;
  const portrait = box.h > box.w * 1.05;
  // Everything is sized in em from the module's size, to read from across the
  // room: the root is 26 px on a full 1920 × 1080 screen (21 px on a portrait
  // one) and scales with it. Text size, and the Style panel's, scale it from
  // there.
  const fit = portrait ? Math.min(box.w / 1080, box.h / 1920) * 21 : Math.min(box.w / 1920, box.h / 1080) * 26;
  const unit = Math.max(8, fit * cfg.textScale * (style.fontSize > 0 ? style.fontSize / 16 : 1));
  const radius = Math.max(0, (Number(style.borderRadius) || 0) - (Number(style.padding) || 0));
  const updated = data.savedAt ? timeFmt(tz).format(data.savedAt) : data.loadedAt ? timeFmt(tz).format(data.loadedAt) : '';

  let notice: { title: string; detail?: string } | null = null;
  if (!data.senate && !data.house) notice = data.failure ? { title: data.failure, detail: 'Trying again shortly.' } : { title: 'Loading results…' };

  return (
    <div style={{ ...hostFrameStyle(style, { baseFontSize: 16 }) }}>
      <style>{CSS}</style>
      <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: radius, fontSize: unit }}>
        {box.w > 0 && (
          <div className={`en26${portrait ? ' portrait' : ''}`}>
            <header>
              <div>
                <h1>Election Night 2026</h1>
              </div>
              <div className="hdr-right">
                <span className={`chip ${data.failure || data.savedAt ? 'warn' : data.loadedAt ? 'live' : ''}`}>
                  <span className="dot" />
                  {data.failure
                    ? `${data.failure}${updated ? ` · showing ${updated}` : ''}`
                    : data.savedAt
                    ? <>Waiting on civicAPI · showing <b>{updated}</b></>
                    : updated ? <>Live · updated <b>{updated}</b></> : 'Connecting…'}
                </span>
                <Clock tz={tz} />
              </div>
            </header>
            {notice ? (
              <div className="notice"><b>{notice.title}</b>{notice.detail && <span className="small">{notice.detail}</span>}</div>
            ) : (
              <>
                <div className="layout">
                  <div className="main">
                    <section className="board">
                      <ChamberPanel chamber="senate" t={senateT} />
                      <ChamberPanel chamber="house" t={houseT} />
                    </section>
                    <div className="lower">
                      <MapPanel view={view} rotating={cfg.map === 'rotate'} senate={senate} house={house} />
                      <div className="desk">
                        <NextClose tz={tz} senateStates={senateStates} />
                        <RaceDesk senate={senate} house={house} tz={tz} em={unit} seconds={cfg.pageSeconds} calls={data.calls} />
                      </div>
                    </div>
                  </div>
                  <aside className="side">
                    <LiveFeed items={feed} minutes={cfg.feedMinutes} tz={tz} em={unit} seconds={cfg.pageSeconds} />
                    {cfg.schoolBoard && <SchoolBoard races={data.school} failed={data.schoolFailed} />}
                  </aside>
                </div>
                <footer>
                  <span>Results: civicAPI{cfg.news ? ' · Headlines: AP, CBS, NYT, PBS, NPR' : ''}</span>
                  <span>Only &ldquo;called&rdquo; races are calls. Likely and Leaning are this board&rsquo;s estimate.</span>
                </footer>
              </>
            )}
          </div>
        )}
        {celebration && <CelebrationOverlay key={celebration.id} celebration={celebration} onDone={finish} />}
      </div>
    </div>
  );
}

/** Which showing of which celebration is due now, and when the next one
 *  is: each plays `celebrateTimes` times, `celebrateEvery` minutes apart,
 *  the first as the wins come in. A showing more than 3 minutes late (the
 *  module was off screen) is skipped. Which wins it shows, and whether as a
 *  flip, is up to the settings. */
export function showingsOf(
  celebrations: Celebration[],
  played: Set<string>,
  now: number,
  cfg: Pick<Config, 'celebrate' | 'celebrateFlips' | 'celebrateTimes' | 'celebrateEvery'>,
) {
  const gap = cfg.celebrateEvery * 60_000;
  const late = Math.min(3 * 60_000, gap);
  const showings = celebrations
    .map((c): Celebration => {
      const wins = cfg.celebrate ? c.wins : cfg.celebrateFlips ? c.wins.filter((w) => w.fromR) : [];
      return { ...c, wins, flip: cfg.celebrateFlips && wins.some((w) => w.fromR) };
    })
    .filter((c) => c.wins.length > 0)
    .flatMap((c) => Array.from({ length: cfg.celebrateTimes }, (_, n) => ({ c, key: `${c.id}:${n}`, at: c.id + n * gap })))
    .filter((s) => !played.has(s.key))
    .sort((a, b) => a.at - b.at);
  return {
    due: showings.find((s) => s.at <= now && now - s.at < late),
    nextAt: showings.find((s) => s.at > now)?.at,
  };
}

/** Starts a celebration as if these seats had just been called: for the
 *  preview page. */
export function celebrateForPreview(wins: Win[]) {
  store.celebrations = [...store.celebrations, { id: Date.now(), wins, flip: false }].slice(-20);
  for (const l of listeners) l();
}
