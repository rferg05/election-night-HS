export type MapView = 'rotate' | 'senate' | 'house';

export interface Config {
  refreshSeconds: number;
  map: MapView;
  rotateSeconds: number;
  /** How long each page of the race list and the live feed stays up. */
  pageSeconds: number;
  /** Headlines in the live feed. */
  news: boolean;
  /** The live feed shows this much of the night, in minutes. */
  feedMinutes: number;
  /** Blue fireworks and confetti when Democrats win a seat. */
  celebrate: boolean;
  schoolBoard: boolean;
  /** civicAPI race ids for the school board, for when the search can't find
   *  them. Empty: found by searching. */
  schoolBoardIds: number[];
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;

export function readIds(v: unknown): number[] {
  return String(v ?? '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0);
}

export function readConfig(raw: Record<string, unknown>): Config {
  const map = String(raw.map);
  return {
    refreshSeconds: num(raw.refreshSeconds, 60, 30, 600),
    map: map === 'senate' || map === 'house' ? map : 'rotate',
    rotateSeconds: num(raw.rotateSeconds, 20, 5, 300),
    pageSeconds: num(raw.pageSeconds, 10, 4, 60),
    news: bool(raw.news, true),
    feedMinutes: num(raw.feedMinutes, 30, 5, 240),
    celebrate: bool(raw.celebrate, true),
    schoolBoard: bool(raw.schoolBoard, true),
    schoolBoardIds: readIds(raw.schoolBoardIds),
  };
}
