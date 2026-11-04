// Over the module when Democrats win a seat: blue fireworks and confetti for a
// win, and for a seat taken from the Republicans a flip, where a red banner
// turns over to blue and only then do the confetti and fireworks start. When
// they win control of a chamber, a bigger banner and a bigger show. Drawn on one
// canvas, with modest particle counts so a Raspberry Pi keeps up.

import React, { useEffect, useRef } from 'react';

export interface Win {
  /** "Georgia Senate", "PA-07". */
  title: string;
  name: string;
  /** Won from the other party. */
  gain: boolean;
  /** Taken from a Republican seat. */
  fromR: boolean;
  senate: boolean;
}

export type Chamber = 'senate' | 'house';

export interface Celebration {
  id: number;
  wins: Win[];
  /** Show it as a flip: red turning blue. */
  flip: boolean;
  /** The chambers Democrats have won control of, for a control celebration. */
  control?: Chamber[];
  /** Seats won in each chamber, for its banner. */
  seats?: Record<Chamber, number>;
}

const BLUES = ['#6A9BF4', '#1C5BCC', '#9DB9EC', '#3D7BEA', '#C9DAFB', '#FFFFFF'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** When a flip turns blue, from the start. */
export const FLIP_AT = 1600;

/** How long a celebration runs: longest for a flip, then a Senate seat. */
export const lengthOf = (c: Celebration) =>
  c.control?.length ? 15_000 : c.flip ? 12_000 : c.wins.some((w) => w.senate || w.gain) ? 10_000 : 7_000;

interface Spark { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number }
interface Rocket { x: number; y: number; vy: number; burstAt: number; color: string }
interface Bit { x: number; y: number; vy: number; sway: number; phase: number; spin: number; angle: number; w: number; h: number; color: string; turn: number }

function useFireworks(canvas: React.RefObject<HTMLCanvasElement | null>, duration: number, flipAt: number | null, grand = false) {
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const W = (el.width = el.clientWidth);
    const H = (el.height = el.clientHeight);
    // Sized to the module, but never so small a spark can't be seen.
    const scale = Math.max(0.8, Math.min(W, H) / 700);
    const start = performance.now();
    const sparks: Spark[] = [];
    const rockets: Rocket[] = [];
    const bits: Bit[] = Array.from({ length: flipAt == null ? 140 : 170 }, () => ({
      x: Math.random() * W,
      // A flip's confetti appears all over the module at once when it turns.
      y: flipAt == null ? -Math.random() * H * 0.9 - 10 : Math.random() * H * 1.1 - H * 0.3,
      vy: (60 + Math.random() * 90) * scale,
      sway: (20 + Math.random() * 40) * scale,
      phase: Math.random() * Math.PI * 2,
      spin: 2 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      w: (6 + Math.random() * 6) * scale,
      h: (10 + Math.random() * 8) * scale,
      color: pick(BLUES),
      turn: 0,
    }));
    // Each piece appears a moment apart, in a wave across the module.
    for (const b of bits) b.turn = (flipAt ?? 0) + (b.x / W) * 500 + Math.random() * 150;
    let nextRocket = start + (flipAt ?? 0);
    let last = start;
    let frame = 0;

    const burst = (x: number, y: number, color: string, now: number, big: boolean) => {
      const n = big ? 80 : 56;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const v = (180 + Math.random() * (big ? 320 : 200)) * scale;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: 1200 + Math.random() * 800, color: Math.random() < 0.25 ? '#FFFFFF' : color, size: (2.5 + Math.random() * 2.5) * scale });
      }
      // The flash of the burst.
      sparks.push({ x, y, vx: 0, vy: 0, born: now, life: 260, color: '#FFFFFF', size: (big ? 40 : 26) * scale });
    };
    let flipped = false;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now - start;
      // Fade the whole show out over its last second.
      const fade = Math.max(0, Math.min(1, (duration - t) / 1000));
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      // The moment of a flip, or the start of a grand show: a ring of big
      // bursts across the module.
      const ringAt = flipAt ?? (grand ? 300 : null);
      if (ringAt != null && !flipped && t >= ringAt) {
        flipped = true;
        for (let i = 0; i < 4; i++) burst(W * (0.2 + i * 0.2), H * (0.25 + (i % 2) * 0.12), pick(BLUES.slice(0, 4)), now, true);
      }
      if (t < duration - 2200 && now >= nextRocket) {
        rockets.push({ x: W * (0.12 + Math.random() * 0.76), y: H, vy: -(H * (0.9 + Math.random() * 0.35)), burstAt: H * (0.12 + Math.random() * 0.3), color: pick(BLUES.slice(0, 5)) });
        nextRocket = now + (grand ? 110 : flipAt == null ? 280 : 200) + Math.random() * (grand ? 220 : 380);
      }

      ctx.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        r.vy *= 0.985;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 4 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x, r.y + 40 * scale);
        ctx.stroke();
        if (r.y <= r.burstAt || r.vy > -60) {
          burst(r.x, r.y, r.color, now, false);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.born) / s.life;
        if (age >= 1) { sparks.splice(i, 1); continue; }
        s.vx *= 0.975;
        s.vy = s.vy * 0.975 + 110 * scale * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = fade * (1 - age) * (1 - age * 0.3);
        // A short tail behind each spark, then the spark itself.
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size * 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 0.07, s.y - s.vy * 0.07);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 - age * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      for (const b of bits) {
        b.y += b.vy * dt;
        b.angle += b.spin * dt;
        if (b.y > H + 20 && t < duration - 1500) b.y = -20;
        // Before a flip, only the red banner: no confetti yet.
        if (flipAt != null && t < b.turn) continue;
        const x = b.x + Math.sin(t / 600 + b.phase) * b.sway;
        ctx.save();
        ctx.translate(x, b.y);
        ctx.rotate(b.angle);
        // A flat piece turning over: its width shrinks and grows.
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w * Math.abs(Math.cos(b.angle * 1.7)) + 1, b.h);
        ctx.restore();
      }

      if (t < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canvas, duration, flipAt, grand]);
}

const listed = (wins: Win[]) =>
  `${wins.slice(0, 4).map((w) => w.title).join(' · ')}${wins.length > 4 ? ` · +${wins.length - 4} more` : ''}`;

export function CelebrationOverlay({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const duration = lengthOf(celebration);
  const control = celebration.control ?? [];
  useFireworks(canvas, duration, celebration.flip && !control.length ? FLIP_AT : null, control.length > 0);
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [celebration.id, duration, onDone]);

  const { wins } = celebration;
  const one = wins.length === 1 ? wins[0] : null;

  if (control.length) {
    const both = control.length === 2;
    const seats = celebration.seats;
    const counts = control.map((ch) => `${seats?.[ch] ?? ''} ${ch === 'senate' ? 'Senate' : 'House'} seats`.trim());
    return (
      <div className="cele control" style={{ animationDuration: `${duration}ms` }}>
        <canvas ref={canvas} />
        <div className="cele-card control">
          <span className="cele-flip">{both ? 'Control of Congress' : control[0] === 'senate' ? 'Senate control' : 'House control'}</span>
          <b>{both ? 'Democrats win the House and Senate' : `Democrats win the ${control[0] === 'senate' ? 'Senate' : 'House'}`}</b>
          <span>{counts.join(' · ')}</span>
        </div>
      </div>
    );
  }

  if (celebration.flip) {
    const flips = wins.filter((w) => w.fromR);
    const others = wins.length - flips.length;
    const first = flips[0];
    return (
      <div className="cele flip" style={{ animationDuration: `${duration}ms` }}>
        <canvas ref={canvas} />
        <div className="cele-card flip" style={{ animationDuration: `${FLIP_AT * 1.6}ms` }}>
          <div className="face front">
            <span className="cele-flip">{flips.length === 1 ? 'Republican seat' : `${flips.length} Republican seats`}</span>
            <b>{flips.length === 1 ? first.title : `${flips.length} seats`}</b>
            <span>{flips.length === 1 ? 'Held by the GOP' : listed(flips)}</span>
          </div>
          <div className="face back">
            <span className="cele-flip">{flips.length === 1 ? first.title : listed(flips)}</span>
            <b>{flips.length === 1 ? 'Democratic flip' : `${flips.length} Democratic flips`}</b>
            <span>{flips.length === 1 ? first.name : ''}{others > 0 ? `${flips.length === 1 ? ' · ' : ''}plus ${others} more Democratic win${others === 1 ? '' : 's'}` : ''}</span>
          </div>
        </div>
      </div>
    );
  }

  const gains = wins.filter((w) => w.gain).length;
  return (
    <div className="cele" style={{ animationDuration: `${duration}ms` }}>
      <canvas ref={canvas} />
      <div className="cele-card">
        {gains > 0 && <span className="cele-flip">{gains === 1 ? 'Democratic pickup' : `${gains} Democratic pickups`}</span>}
        <b>{one ? 'Democratic win' : `${wins.length} Democratic wins`}</b>
        <span>{one ? `${one.title} · ${one.name}` : listed(wins)}</span>
      </div>
    </div>
  );
}
