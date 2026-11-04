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
  /** Scales all the text: 1 is sized for a full screen read across a room. */
  textScale: number;
  /** Blue fireworks and confetti when Democrats win a seat. */
  celebrate: boolean;
  /** Seats taken from the Republicans get a flip: red turning blue. */
  celebrateFlips: boolean;
  /** Each celebration plays this many times… */
  celebrateTimes: number;
  /** …this many minutes apart. */
  celebrateEvery: number;
  /** A celebration when Democrats win control of a chamber… */
  celebrateControl: boolean;
  /** …repeated this many minutes apart for the rest of the night. */
  controlEvery: number;
  schoolBoard: boolean;
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;

export function readConfig(raw: Record<string, unknown>): Config {
  const map = String(raw.map);
  return {
    refreshSeconds: num(raw.refreshSeconds, 60, 30, 600),
    map: map === 'senate' || map === 'house' ? map : 'rotate',
    rotateSeconds: num(raw.rotateSeconds, 20, 5, 300),
    pageSeconds: num(raw.pageSeconds, 10, 4, 60),
    news: bool(raw.news, true),
    feedMinutes: num(raw.feedMinutes, 30, 5, 240),
    textScale: num(raw.textScale, 1, 0.6, 1.6),
    celebrate: bool(raw.celebrate, true),
    celebrateFlips: bool(raw.celebrateFlips, true),
    celebrateTimes: Math.round(num(raw.celebrateTimes, 3, 1, 5)),
    celebrateEvery: num(raw.celebrateEvery, 3, 1, 15),
    celebrateControl: bool(raw.celebrateControl, true),
    controlEvery: num(raw.controlEvery, 10, 1, 60),
    schoolBoard: bool(raw.schoolBoard, true),
  };
}
