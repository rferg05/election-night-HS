// Blue fireworks and confetti over the module when Democrats win a seat.
// Drawn on one canvas, with modest particle counts so a Raspberry Pi keeps up.

import React, { useEffect, useRef } from 'react';

export interface Win {
  /** "Georgia Senate", "PA-07". */
  title: string;
  name: string;
  /** Won from the other party. */
  gain: boolean;
  senate: boolean;
}

export interface Celebration {
  id: number;
  wins: Win[];
}

const BLUES = ['#6A9BF4', '#1C5BCC', '#9DB9EC', '#3D7BEA', '#C9DAFB', '#FFFFFF'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** How long a celebration runs: longer for a Senate seat or a flip. */
export const lengthOf = (c: Celebration) => (c.wins.some((w) => w.senate || w.gain) ? 10_000 : 7_000);

interface Spark { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number }
interface Rocket { x: number; y: number; vy: number; burstAt: number; color: string }
interface Bit { x: number; y: number; vy: number; sway: number; phase: number; spin: number; angle: number; w: number; h: number; color: string }

function useFireworks(canvas: React.RefObject<HTMLCanvasElement | null>, duration: number) {
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
    const bits: Bit[] = Array.from({ length: 140 }, () => ({
      x: Math.random() * W,
      y: -Math.random() * H * 0.9 - 10,
      vy: (60 + Math.random() * 90) * scale,
      sway: (20 + Math.random() * 40) * scale,
      phase: Math.random() * Math.PI * 2,
      spin: 2 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      w: (6 + Math.random() * 6) * scale,
      h: (10 + Math.random() * 8) * scale,
      color: pick(BLUES),
    }));
    let nextRocket = start;
    let last = start;
    let frame = 0;

    const burst = (x: number, y: number, color: string, now: number) => {
      const n = 56;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const v = (180 + Math.random() * 200) * scale;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: 1200 + Math.random() * 800, color: Math.random() < 0.25 ? '#FFFFFF' : color, size: (2.5 + Math.random() * 2.5) * scale });
      }
      // The flash of the burst.
      sparks.push({ x, y, vx: 0, vy: 0, born: now, life: 260, color: '#FFFFFF', size: 26 * scale });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now - start;
      // Fade the whole show out over its last second.
      const fade = Math.max(0, Math.min(1, (duration - t) / 1000));
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      if (t < duration - 2200 && now >= nextRocket) {
        rockets.push({ x: W * (0.12 + Math.random() * 0.76), y: H, vy: -(H * (0.9 + Math.random() * 0.35)), burstAt: H * (0.12 + Math.random() * 0.3), color: pick(BLUES.slice(0, 5)) });
        nextRocket = now + 280 + Math.random() * 380;
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
          burst(r.x, r.y, r.color, now);
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
  }, [canvas, duration]);
}

export function CelebrationOverlay({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const duration = lengthOf(celebration);
  useFireworks(canvas, duration);
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [celebration.id, duration, onDone]);

  const { wins } = celebration;
  const one = wins.length === 1 ? wins[0] : null;
  const flips = wins.filter((w) => w.gain).length;
  return (
    <div className="cele" style={{ animationDuration: `${duration}ms` }}>
      <canvas ref={canvas} />
      <div className="cele-card">
        {flips > 0 && <span className="cele-flip">{flips === 1 ? 'Democratic pickup' : `${flips} Democratic pickups`}</span>}
        <b>{one ? 'Democratic win' : `${wins.length} Democratic wins`}</b>
        {one ? (
          <span>{one.title} · {one.name}</span>
        ) : (
          <span>{wins.slice(0, 4).map((w) => w.title).join(' · ')}{wins.length > 4 ? ` · +${wins.length - 4} more` : ''}</span>
        )}
      </div>
    </div>
  );
}
