// The live feed: race calls and lead changes as this module sees them, poll
// closings, and election headlines from news feeds. Only the last half hour
// (by default) is shown, newest first.

import type { Fetcher, Party } from './data';
import { CLOSE_ET, NAMES } from './geo';

export interface NewsSource {
  label: string;
  url: string;
}

/** Politics feeds that cover election night as it happens. Their hosts are
 *  in the manifest's allowedDomains too. AP has no feed of its own, so its
 *  stories come by way of Google News. */
export const NEWS_SOURCES: NewsSource[] = [
  { label: 'AP', url: 'https://news.google.com/rss/search?q=election+source:%22Associated+Press%22+when:1h&hl=en-US&gl=US&ceid=US:en' },
  { label: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/politics' },
  { label: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml' },
  { label: 'PBS News', url: 'https://www.pbs.org/newshour/feeds/rss/politics' },
  { label: 'NPR', url: 'https://feeds.npr.org/1014/rss.xml' },
];

export interface Headline {
  title: string;
  time: number;
  source: string;
}

// ── RSS, read as text: no DOM needed ────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (xml: string, name: string): string => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
};

export function parseRss(xml: string, label: string): Headline[] {
  const out: Headline[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const item = m[0];
    let title = tag(item, 'title');
    const time = Date.parse(tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated') || tag(item, 'dc:date'));
    if (!title || !Number.isFinite(time)) continue;
    // Google News ends each headline with its publisher: " - Associated Press".
    const publisher = tag(item, 'source');
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
    out.push({ title, time, source: label });
  }
  return out;
}

/** On election night nearly everything in a politics feed is about the
 *  election; this keeps out the rest. */
const ELECTION = /\b(elect|election|electoral|midterms?|senate|house|congress|congressional|polls?|ballots?|votes?|voters?|voting|race|races|wins?|won|defeats?|concedes?|projected|flips?|seats?|majority|recount|runoff|results?|turnout|exit poll|governor|mayor|school board|candidate|campaign|democrats?|republicans?|gop)\b/i;

export const isElectionNews = (title: string) => ELECTION.test(title);

export async function loadNews(fetcher: Fetcher): Promise<Headline[]> {
  const got = await Promise.allSettled(NEWS_SOURCES.map(async (s) => {
    const { status, body } = await fetcher({ url: s.url, cacheTtlMs: 60_000, headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (status < 200 || status >= 300 || typeof body !== 'string') throw new Error(`${s.label} answered ${status}`);
    return parseRss(body, s.label);
  }));
  const seen = new Set<string>();
  return got
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((h) => isElectionNews(h.title))
    .sort((a, b) => b.time - a.time)
    .filter((h) => {
      // The same story from two feeds, or twice in one.
      const k = h.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ── Feed items ──────────────────────────────────────────────────────────────

export type ItemKind = 'call' | 'lead' | 'polls' | 'news';

export interface FeedItem {
  id: string;
  kind: ItemKind;
  at: number;
  /** The party a call or lead is for. */
  party?: Party;
  /** A call that changes the seat's party. */
  gain?: boolean;
  /** Two-letter state, or 'US'. */
  state?: string;
  title: string;
  text?: string;
  source?: string;
}

/** A state named at the start of a headline ("Georgia Senate: …", "PA-07"). */
export function stateOf(text: string): string | undefined {
  const code = /\b([A-Z]{2})-(\d{1,2}|AL)\b/.exec(text);
  if (code && NAMES[code[1]]) return code[1];
  let best: string | undefined;
  for (const [k, n] of Object.entries(NAMES)) {
    if (k === 'DC') continue;
    // "Virginia", not the "Virginia" in "West Virginia".
    const re = new RegExp(`(^|[^A-Za-z])${n}(?![A-Za-z])`);
    const m = re.exec(text);
    if (m && !(n === 'Virginia' && /West\s+$/.test(text.slice(0, m.index + m[1].length)))) {
      if (!best || n.length > NAMES[best].length) best = k;
    }
  }
  return best;
}

/** Poll-closing time in each state, as epoch ms. Eastern is UTC−5 tonight. */
export function closeAt(state: string): number | null {
  const h = CLOSE_ET[state];
  if (h == null) return null;
  return Date.UTC(2026, 10, 3, Math.floor(h) + 5, Math.round((h % 1) * 60));
}

/** The poll-closing times, each with its states, in order. */
export function closings(): { at: number; states: string[] }[] {
  const by = new Map<number, string[]>();
  for (const st of Object.keys(CLOSE_ET)) {
    const t = closeAt(st)!;
    by.set(t, [...(by.get(t) ?? []), st]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([at, states]) => ({ at, states }));
}

export function pollItems(now: number, since: number, watched: Set<string>): FeedItem[] {
  return closings()
    .filter((c) => c.at <= now && c.at > since)
    .map((c) => {
      const key = c.states.filter((s) => watched.has(s));
      const names = (key.length ? key : c.states).map((s) => NAMES[s] ?? s);
      return {
        id: `polls-${c.at}`,
        kind: 'polls' as const,
        at: c.at,
        title: `Polls have closed in ${listOf(c.states.map((s) => NAMES[s] ?? s))}.`,
        text: key.length && key.length < c.states.length ? `Senate races to watch: ${listOf(names)}.` : undefined,
      };
    });
}

export function listOf(xs: string[]): string {
  if (xs.length <= 2) return xs.join(' and ');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function newsItems(news: Headline[], since: number): FeedItem[] {
  return news
    .filter((h) => h.time > since)
    .map((h) => ({ id: `news-${h.source}-${h.time}-${h.title}`, kind: 'news' as const, at: h.time, title: h.title, source: h.source, state: stateOf(h.title) }));
}
