import { describe, expect, it } from 'vitest';
import { closeAt, decode, isElectionNews, newsItems, parseRss, pollItems, stateOf } from '../src/feed';
import { fillHolders } from '../src/data';
import type { Candidate, Race } from '../src/data';
import { project } from '../src/projection';
import { tally } from '../src/index';

const rss = `<?xml version="1.0"?><rss><channel><title>Feed</title>
<item><title><![CDATA[Ossoff holds Georgia Senate seat, AP projects]]></title><pubDate>Wed, 04 Nov 2026 01:10:00 GMT</pubDate></item>
<item><title>Polls close in Ohio &amp; West Virginia - Associated Press</title><source url="https://apnews.com">Associated Press</source><pubDate>Wed, 04 Nov 2026 00:31:00 GMT</pubDate></item>
<item><title>No date here</title></item>
</channel></rss>`;

describe('parseRss', () => {
  it('reads headlines and times, without the publisher on the end', () => {
    const h = parseRss(rss, 'AP');
    expect(h.map((x) => x.title)).toEqual(['Ossoff holds Georgia Senate seat, AP projects', 'Polls close in Ohio & West Virginia']);
    expect(h[0].time).toBe(Date.UTC(2026, 10, 4, 1, 10));
    expect(h[0].source).toBe('AP');
  });

  it('decodes entities and drops markup', () => {
    expect(decode('A &#8217;b&#x27; <b>c</b> &quot;d&quot;')).toBe('A ’b\' c "d"');
  });

  it('keeps election stories', () => {
    expect(isElectionNews('Ossoff holds Georgia Senate seat')).toBe(true);
    expect(isElectionNews('Recipe: pumpkin bread')).toBe(false);
  });
});

describe('feed items', () => {
  it('finds the state a headline is about', () => {
    expect(stateOf('Georgia Senate: Ossoff ahead')).toBe('GA');
    expect(stateOf('PA-07 too close to call')).toBe('PA');
    expect(stateOf('Polls close in West Virginia')).toBe('WV');
    expect(stateOf('Turnout runs high nationwide')).toBeUndefined();
  });

  it('keeps only the window', () => {
    const now = Date.UTC(2026, 10, 4, 1, 20);
    const items = newsItems(parseRss(rss, 'AP'), now - 30 * 60_000);
    expect(items.map((i) => i.title)).toEqual(['Ossoff holds Georgia Senate seat, AP projects']);
    expect(items[0].state).toBe('GA');
  });

  it('notes poll closings in the window', () => {
    // 7:30 PM Eastern is 00:30 UTC.
    expect(closeAt('OH')).toBe(Date.UTC(2026, 10, 4, 0, 30));
    const items = pollItems(Date.UTC(2026, 10, 4, 0, 45), Date.UTC(2026, 10, 4, 0, 15), new Set(['OH', 'NC']));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Polls have closed in North Carolina, Ohio and West Virginia.');
    expect(items[0].text).toBe('Senate races to watch: North Carolina and Ohio.');
  });
});

const cand = (name: string, party: Candidate['party'], votes: number, winner = false, incumbent = false): Candidate =>
  ({ name, party, votes, winner, incumbent });

describe('gains', () => {
  it('fills in who holds a seat when the forecast is missing', () => {
    const races: Race[] = [
      { key: 'ne', state: 'NE', name: 'NE', reporting: 0, candidates: [cand('Osborn', 'I', 0), cand('Ricketts', 'R', 0, false, true)] },
      { key: 'zz-01', state: 'ZZ', district: 1, name: 'ZZ', reporting: 0, candidates: [cand('A', 'D', 0, false, true), cand('B', 'R', 0)] },
    ];
    fillHolders(races, 'senate');
    expect(races[0].prior?.incumbentParty).toBe('R');
    expect(races[0].prior?.rating).toBe('Likely R');
    fillHolders(races.slice(1), 'house');
    expect(races[1].prior?.incumbentParty).toBe('D');
  });

  it('counts called gains and net change', () => {
    const prior = (holder: 'D' | 'R') => ({ rating: '', chance: {}, incumbentParty: holder });
    const race = (key: string, holder: 'D' | 'R', cands: Candidate[], reporting = 90): Race =>
      ({ key, state: key.toUpperCase(), name: key, reporting, candidates: cands, prior: prior(holder) });
    const scored = [
      race('ga', 'D', [cand('Ossoff', 'D', 60, true), cand('Collins', 'R', 40)]),
      race('nc', 'R', [cand('Cooper', 'D', 60, true), cand('Whatley', 'R', 40)]),
      race('me', 'R', [cand('Jackson', 'D', 60_000), cand('Collins', 'R', 40_000)], 95),
    ].map((r) => ({ race: r, pr: project(r), chamber: 'senate' as const }));
    const t = tally(scored);
    expect(t.called).toBe(2);
    expect(t.gains.D).toBe(1);
    expect(t.net).toEqual({ D: 1, R: -1 });
    expect(t.likely.D).toBe(1);
  });
});
