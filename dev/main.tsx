import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import manifest from '../manifest.json';
import ElectionNight, { celebrateForPreview } from '../src/index';
import type { Fetcher } from '../src/data';
import { makeHostDisplayCache } from './host-cache';
import { fakeSchoolBoard, simulate } from './simulate';

// Stand-in for the host: just enough SDK for the module to run.
(window as unknown as { React: typeof React }).React = React;
(window as unknown as { __HS_SDK__: unknown }).__HS_SDK__ = {
  displayCache: makeHostDisplayCache(),
  emit: (e: unknown) => console.info('[host emit]', e),
};

const params = new URLSearchParams(location.search);
/** ?sim=40 fills the races with a made-up count about 40% in. */
const sim = Number(params.get('sim') ?? 0);
/** ?board=fake shows stand-in school board races (race id 1). */
const fakeBoard = params.get('board') === 'fake';

const devFetcher: Fetcher = async (req) => {
  if (fakeBoard && req.url.includes('/race/search')) return { status: 200, body: { races: [{ id: 1, election_name: 'Chicago Board of Education', municipality: 'Chicago' }] } };
  if (fakeBoard && /\/race\/1$/.test(req.url)) return { status: 200, body: simulate(req.url, fakeSchoolBoard(), sim) };
  // Through the preview server, standing in for the host proxy: the news
  // feeds don't allow browser requests, and civicAPI's errors under load
  // come without its CORS header.
  const res = await fetch(`/proxy?q=${encodeURIComponent(JSON.stringify({ url: req.url, headers: req.headers }))}`);
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep the text */ }
  return { status: res.status, body: res.ok ? simulate(req.url, body, sim) : body };
};

const style = {
  fontSize: Number(params.get('fs') ?? manifest.defaultStyle.fontSize), fontFamily: 'inter', textColor: '#ffffff',
  backgroundColor: manifest.defaultStyle.backgroundColor, borderRadius: manifest.defaultStyle.borderRadius,
  padding: manifest.defaultStyle.padding, opacity: 1, backdropBlur: 0,
};
const config: Record<string, unknown> = {
  ...manifest.defaultConfig,
  rotateSeconds: 10,
  ...Object.fromEntries([...params].filter(([k]) => !['w', 'h', 'fs', 'sim', 'board'].includes(k))),
};

/** The module at a size you can change, to check the layout refits live. */
function Harness() {
  const [w, setW] = useState(Number(params.get('w') ?? manifest.defaultSize.w));
  const [h, setH] = useState(Number(params.get('h') ?? manifest.defaultSize.h));
  useEffect(() => {
    (window as unknown as { setBox: unknown }).setBox = (nw: number, nh: number) => { setW(nw); setH(nh); };
  }, []);
  const btn = { font: 'inherit', padding: '4px 10px', borderRadius: 6, border: '1px solid #fff4', background: '#0006', color: '#fff', cursor: 'pointer' };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, color: '#fff', fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
        {[[1600, 900], [1920, 1080], [1280, 720], [960, 540], [1080, 1920]].map(([bw, bh]) => (
          <button key={`${bw}x${bh}`} style={btn} onClick={() => { setW(bw); setH(bh); }}>{bw}{'×'}{bh}</button>
        ))}
        <button style={btn} onClick={() => celebrateForPreview([{ title: 'Georgia Senate', name: 'Jon Ossoff', gain: false, senate: true }])}>Celebrate 1</button>
        <button style={btn} onClick={() => celebrateForPreview([
          { title: 'Maine Senate', name: 'Troy Jackson', gain: true, senate: true },
          { title: 'PA-07', name: 'Bob Brooks', gain: true, senate: false },
          { title: 'VA-01', name: 'Shannon Taylor', gain: true, senate: false },
          { title: 'IL-07', name: 'Danny Davis', gain: false, senate: false },
          { title: 'NY-17', name: 'Cait Conley', gain: true, senate: false },
        ])}>Celebrate 5</button>
        <span>{w}{'×'}{h} {'·'} add ?sim=40 for a made-up count, ?board=fake, ?map=house{'…'} to the URL</span>
      </div>
      <div id="module" style={{ width: w, height: h, resize: 'both', overflow: 'hidden' }}>
        <ElectionNight config={config} style={style} fetcher={devFetcher} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
