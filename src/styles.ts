// The look of the Election Night 2026 board this module is modelled on (its
// dark theme), scoped to the module and sized in em, so the whole board
// scales with the module's size.

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap';

export const COLOR = {
  bg: '#0E1116', surface: '#161A21', surface2: '#1E232C', ink: '#E6E9EE', muted: '#97A0AF', line: '#2A303B',
  dem: '#6A9BF4', demSoft: '#18263F', rep: '#F2756B', repSoft: '#3A1C1A', ind: '#AE93E6', indSoft: '#2A2140',
  live: '#F0B444', liveSoft: '#33280F', ok: '#4FC28A',
  demHold: '#2D4C82', repHold: '#7A3631', indHold: '#4B3B73', mapNone: '#1C2028', mapOpen: '#3A414D', mapDone: '#4A5260',
} as const;

export const CSS = `
.en26{
  --bg:${COLOR.bg};--surface:${COLOR.surface};--surface-2:${COLOR.surface2};--ink:${COLOR.ink};--muted:${COLOR.muted};--line:${COLOR.line};
  --dem:${COLOR.dem};--dem-soft:${COLOR.demSoft};--rep:${COLOR.rep};--rep-soft:${COLOR.repSoft};--ind:${COLOR.ind};--ind-soft:${COLOR.indSoft};
  --live:${COLOR.live};--live-soft:${COLOR.liveSoft};--ok:${COLOR.ok};
  --f-display:"Barlow Condensed","Arial Narrow","Roboto Condensed",Arial,sans-serif;
  --f-body:"Source Sans 3","Segoe UI",system-ui,sans-serif;
  --f-mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
  position:absolute;inset:0;box-sizing:border-box;padding:.9em 1em;overflow:hidden;
  display:flex;flex-direction:column;gap:.75em;
  color:var(--ink);font-family:var(--f-body);line-height:1.3;text-shadow:none;
}
.en26 *{box-sizing:border-box}
.en26 .mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
.en26 .small{font-size:.8em;color:var(--muted)}
.en26 .pD{color:var(--dem)}.en26 .pR{color:var(--rep)}.en26 .pI,.en26 .pO{color:var(--ind)}

/* header */
.en26 header{flex:none;display:flex;align-items:flex-end;justify-content:space-between;gap:.8em}
.en26 h1{font-family:var(--f-display);font-weight:700;font-size:1.75em;line-height:1;margin:0;letter-spacing:.01em;text-transform:uppercase}
.en26 .sub{color:var(--muted);margin-top:.15em;font-size:.95em}
.en26 .hdr-right{display:flex;gap:.6em;align-items:center}
.en26 .chip{display:inline-flex;align-items:center;gap:.4em;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:.2em .65em;font-size:.8em;color:var(--muted);white-space:nowrap}
.en26 .chip b{color:var(--ink);font-weight:600}
.en26 .dot{width:.55em;height:.55em;border-radius:50%;background:var(--muted)}
.en26 .chip.live .dot{background:var(--ok);box-shadow:0 0 0 .2em color-mix(in srgb,var(--ok) 25%,transparent)}
.en26 .chip.warn .dot{background:var(--live)}
.en26 .clock{font-family:var(--f-mono);font-size:.9em;color:var(--ink)}

/* layout */
.en26 .layout{flex:1 1 0;min-height:0;display:flex;gap:.9em}
.en26 .main{flex:1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:.75em}
.en26 .side{flex:0 0 21em;min-width:0;min-height:0;display:flex;flex-direction:column;gap:.75em}
.en26 .lower{flex:1 1 0;min-height:0;display:flex;gap:.75em}
.en26 .desk{flex:1.1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:.6em}
.en26.portrait .layout{flex-direction:column}
.en26.portrait .side{flex:1 1 0;flex-direction:row}
.en26.portrait .side>*{flex:1 1 0}
.en26.portrait .lower{flex-direction:column;flex:2 1 0}
.en26.portrait .side{flex:.6 1 0}
.en26.portrait .mapwrap{flex:1 1 0}
.en26.portrait .desk{flex:1.25 1 0}

.en26 .panel{background:var(--surface);border:1px solid var(--line);border-radius:.6em;padding:.75em .9em;display:flex;flex-direction:column;gap:.55em;min-width:0;min-height:0}
.en26 .panel-h{flex:none;display:flex;justify-content:space-between;align-items:baseline;gap:.5em}
.en26 .panel-h h2{font-family:var(--f-display);font-size:1.3em;font-weight:700;margin:0;text-transform:uppercase;letter-spacing:.03em;line-height:1.05;white-space:nowrap}

/* scoreboard */
.en26 .board{flex:none;display:flex;gap:.75em}
.en26 .board>.panel{flex:1 1 0}
.en26 .gains{display:grid;grid-template-columns:1fr 1fr;gap:.55em}
.en26 .gains.three{grid-template-columns:1fr 1fr 1fr}
.en26 .gain{border-radius:.45em;padding:.3em .6em;display:flex;flex-direction:column;gap:.05em;min-width:0}
.en26 .gain.D{background:var(--dem-soft)}.en26 .gain.R{background:var(--rep-soft)}.en26 .gain.I{background:var(--ind-soft)}
.en26 .gain .lbl{font-size:.72em;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.en26 .gain.D .lbl{color:var(--dem)}.en26 .gain.R .lbl{color:var(--rep)}.en26 .gain.I .lbl{color:var(--ind)}
.en26 .gain .num{font-family:var(--f-display);font-weight:700;font-size:2em;line-height:1;font-variant-numeric:tabular-nums}
.en26 .gain .net{font-size:.75em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en26 .bump{animation:en26bump .9s ease}
@keyframes en26bump{0%{transform:scale(1)}30%{transform:scale(1.15)}100%{transform:scale(1)}}
.en26 .bar{position:relative;height:1.1em;border-radius:.35em;overflow:hidden;display:flex;background:var(--surface-2);flex:none}
.en26 .bar span{display:block;height:100%;transition:width .5s ease}
.en26 .bar .bD{background:var(--dem)}.en26 .bar .bI{background:var(--ind)}.en26 .bar .bR{background:var(--rep)}
.en26 .bar .soft{opacity:.42}
.en26 .bar .mark{position:absolute;top:0;bottom:0;width:.14em;background:var(--ink);opacity:.85}
.en26 .barlegend{display:flex;justify-content:space-between;align-items:baseline;gap:.5em;font-size:.82em;white-space:nowrap}
.en26 .barlegend .small{font-size:1em}
.en26 .barlegend b{font-family:var(--f-display);font-size:1.5em;font-variant-numeric:tabular-nums}
.en26 .barlegend .D b{color:var(--dem)}.en26 .barlegend .R b{color:var(--rep)}
.en26 .barlegend em{font-style:normal;color:var(--muted)}
.en26 .verdict{font-weight:700;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* map */
.en26 .mapwrap{flex:1 1 0}
.en26 .maptools{flex:none;display:flex;justify-content:space-between;align-items:center;gap:.6em}
.en26 .seg{display:inline-flex;border:1px solid var(--line);border-radius:.45em;overflow:hidden;background:var(--surface);flex:none}
.en26 .seg span{padding:.2em .6em;color:var(--muted);font-size:.75em;white-space:nowrap}
.en26 .seg span.on{background:var(--ink);color:var(--bg);font-weight:600}
.en26 .legend{flex:none;display:flex;gap:.1em .8em;flex-wrap:wrap;justify-content:center;font-size:.72em;color:var(--muted)}
.en26 .legend span{display:inline-flex;align-items:center;gap:.3em;white-space:nowrap}
.en26 .legend i{width:1em;height:.75em;border-radius:.12em;display:inline-block;border:1px solid var(--line)}
.en26 .mapbox{flex:1 1 0;min-height:0;position:relative}
.en26 svg.usmap{position:absolute;inset:0;width:100%;height:100%;display:block}
.en26 svg.usmap .st{stroke:var(--surface);stroke-width:1;transition:fill .4s ease}
.en26 svg.usmap .lbl{font-family:var(--f-mono);font-size:14px;font-weight:600;fill:var(--ink);text-anchor:middle;dominant-baseline:central}
.en26 svg.usmap .lbl.on{fill:#fff}
.en26 svg.usmap .lbl .pc{font-size:11px;font-weight:400;fill-opacity:.85}
.en26 svg.usmap .flipLbl{font-family:var(--f-display);font-size:19px;font-weight:700;fill:#fff;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:2px}

/* next close strip */
.en26 .next{flex:none;display:flex;gap:.8em;align-items:center;background:var(--live-soft);border:1px solid color-mix(in srgb,var(--live) 40%,transparent);border-radius:.6em;padding:.5em .9em;min-width:0}
.en26 .next .t{font-family:var(--f-display);font-weight:700;font-size:1.6em;line-height:1;color:var(--live);font-variant-numeric:tabular-nums;white-space:nowrap}
.en26 .next .what{min-width:0;flex:1}
.en26 .next .what b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en26 .next .sts{display:block;color:var(--muted);font-size:.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* pages */
.en26 .pager{flex:1 1 0;min-height:0;display:flex;flex-direction:column}
.en26 .pages{flex:none;display:flex;align-items:center;gap:.5em;font-size:.75em;color:var(--muted);white-space:nowrap}
.en26 .pages .track{flex:1;height:.25em;border-radius:.2em;background:var(--surface-2);overflow:hidden;min-width:2em}
.en26 .pages .track span{display:block;height:100%;background:var(--muted);opacity:.7;transform-origin:left;animation:en26fill linear both}
@keyframes en26fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.en26 .rows{flex:1 1 0;min-height:0;overflow:hidden;margin-top:.45em}
.en26 .page{display:flex;flex-direction:column;gap:.35em;animation:en26in .5s ease both}
.en26 .feedpanel .page{gap:0}
@keyframes en26in{from{opacity:0;transform:translateY(.6em)}to{opacity:1;transform:none}}
.en26 .empty{padding:1.2em;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:.5em}

/* race rows */
.en26 .race{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.7em;align-items:center;background:var(--surface);border:1px solid var(--line);border-left:.32em solid var(--muted);border-radius:.5em;padding:0 .7em;overflow:hidden}
.en26 .race.hD{border-left-color:var(--dem)}.en26 .race.hR{border-left-color:var(--rep)}.en26 .race.hI{border-left-color:var(--ind)}
.en26 .race.flip{box-shadow:inset 0 0 0 1px var(--live)}
.en26 .race .code{font-family:var(--f-mono);font-weight:600;font-size:.9em;white-space:nowrap;min-width:3.4em}
.en26 .race .code small{display:block;font-family:var(--f-body);font-weight:400;color:var(--muted);font-size:.85em;max-width:5.5em;overflow:hidden;text-overflow:ellipsis}
.en26 .who{min-width:0;display:flex;flex-direction:column;gap:.15em}
.en26 .who .m{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en26 .who .n{font-size:.8em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en26 .who .n b{color:var(--ink);font-variant-numeric:tabular-nums}
.en26 .h2hbar{position:relative;display:flex;height:.4em;border-radius:.2em;overflow:hidden;background:var(--surface-2)}
.en26 .h2hbar span{display:block;height:100%}
.en26 .h2hbar .bD{background:var(--dem)}.en26 .h2hbar .bR{background:var(--rep)}.en26 .h2hbar .bI,.en26 .h2hbar .bO{background:var(--ind)}
.en26 .h2hbar .mid{position:absolute;left:calc(50% - 1px);top:0;bottom:0;width:2px;background:var(--ink);opacity:.55}
.en26 .pill{font-size:.72em;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:.2em .6em;white-space:nowrap;border:1px solid var(--line);color:var(--muted)}
.en26 .pill.TU{color:var(--live);border-color:color-mix(in srgb,var(--live) 50%,transparent);background:var(--live-soft)}
.en26 .pill.D{color:var(--dem);border-color:color-mix(in srgb,var(--dem) 40%,transparent)}
.en26 .pill.R{color:var(--rep);border-color:color-mix(in srgb,var(--rep) 40%,transparent)}
.en26 .res{display:flex;flex-direction:column;align-items:flex-end;gap:.05em;min-width:5.6em}
.en26 .res .w{font-family:var(--f-display);font-weight:700;font-size:1.1em;letter-spacing:.03em;padding:.1em .55em;border-radius:.35em;color:#fff;white-space:nowrap}
.en26 .res .w.D{background:var(--dem)}.en26 .res .w.R{background:var(--rep)}.en26 .res .w.I,.en26 .res .w.O{background:var(--ind)}
.en26 .res .e{font-family:var(--f-display);font-weight:700;font-size:1.1em;letter-spacing:.03em;white-space:nowrap}
.en26 .res .e.TU{color:var(--live)}
.en26 .res .at{font-size:.75em;color:var(--muted);white-space:nowrap}

/* feed */
.en26 .feedpanel{flex:1 1 0}
.en26 .livedot{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:var(--rep);margin-right:.45em;vertical-align:.12em;animation:en26pulse 1.6s ease-in-out infinite}
@keyframes en26pulse{0%,100%{opacity:1}50%{opacity:.35}}
.en26 .item{flex:none;display:flex;flex-direction:column;gap:.15em;padding:.35em .35em;border-bottom:1px solid var(--line);overflow:hidden}
.en26 .item .head{display:flex;align-items:center;white-space:nowrap;overflow:hidden;font-size:.8em}
.en26 .item .body{font-size:1em;line-height:1.18;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.en26 .item .body b{font-weight:600}
.en26 .item:last-child{border-bottom:0}
.en26 .item.fresh{background:var(--live-soft);border-radius:.35em}
.en26 .item .tm{font-family:var(--f-mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.en26 .item.fresh .tm{color:var(--live);font-weight:600}
.en26 .tag{display:inline-block;flex:none;font-size:.9em;font-weight:700;letter-spacing:.05em;padding:0 .45em;border-radius:.25em;margin-right:.4em;color:#fff;vertical-align:.1em;line-height:1.5}
.en26 .tag.D{background:var(--dem)}.en26 .tag.R{background:var(--rep)}.en26 .tag.I,.en26 .tag.O{background:var(--ind)}
.en26 .tag.N{background:var(--live);color:#1a1405}.en26 .tag.W{background:var(--ink);color:var(--bg)}
.en26 .tag.ST{background:var(--surface-2);color:var(--ink);border:1px solid var(--line);padding:0 .35em}

/* school board */
.en26 .boardpanel{flex:none}
.en26 .brace{display:flex;flex-direction:column;gap:.2em;padding:.4em .55em;border-radius:.45em;background:var(--surface-2);border-left:.3em solid var(--live)}
.en26 .brace.done{background:color-mix(in srgb,var(--live) 18%,var(--surface-2))}
.en26 .bhead{display:flex;justify-content:space-between;align-items:baseline;gap:.5em;white-space:nowrap}
.en26 .bhead b{font-size:.9em}
.en26 .bcands{display:flex;justify-content:space-between;gap:.8em;min-width:0}
.en26 .bcand{display:flex;align-items:baseline;gap:.35em;min-width:0}
.en26 .bcand:last-child{justify-content:flex-end;text-align:right}
.en26 .bcand .bn{font-weight:700;color:var(--live);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.en26 .bcand:last-child .bn{color:var(--ink);opacity:.85}
.en26 .bcand .bp{font-variant-numeric:tabular-nums;font-weight:600}
.en26 .h2hbar.board span{background:var(--live)}
.en26 .h2hbar.board span.second{background:var(--muted)}

.en26 footer{flex:none;display:flex;justify-content:space-between;gap:1em;font-size:.68em;color:var(--muted);border-top:1px solid var(--line);padding-top:.3em;white-space:nowrap;overflow:hidden}
.en26 footer span{overflow:hidden;text-overflow:ellipsis}
.en26 .notice{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:.4em}
.en26 .notice b{font-family:var(--f-display);font-size:1.8em;text-transform:uppercase}
.cele{position:absolute;inset:0;z-index:20;pointer-events:none;animation:en26cele linear both;font-family:"Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#fff}
@keyframes en26cele{0%{background:rgba(10,24,56,0)}6%{background:rgba(10,24,56,.55)}88%{background:rgba(10,24,56,.55)}100%{background:rgba(10,24,56,0)}}
.cele canvas{position:absolute;inset:0;width:100%;height:100%}
.cele-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:.25em;padding:.6em 1.6em .7em;border-radius:.4em;background:rgba(28,91,204,.88);box-shadow:0 0 0 .12em rgba(201,218,251,.6),0 1em 3em rgba(0,0,0,.5);text-align:center;max-width:85%;animation:en26card .7s cubic-bezier(.2,1.4,.4,1) both}
@keyframes en26card{from{opacity:0;transform:translate(-50%,-50%) scale(.6)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.cele-card b{font-size:4.2em;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.02em}
.cele-card span{font-family:"Source Sans 3","Segoe UI",sans-serif;font-size:1.5em;font-weight:600}
.cele-card .cele-flip{font-family:inherit;font-size:1.1em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:#fff;color:#1C5BCC;padding:.05em .6em;border-radius:.25em}
.cele.flip{animation-name:en26celeflip}
@keyframes en26celeflip{0%{background:rgba(60,12,10,0)}5%{background:rgba(60,12,10,.55)}12.5%{background:rgba(60,12,10,.55)}15%{background:rgba(10,24,56,.55)}90%{background:rgba(10,24,56,.55)}100%{background:rgba(10,24,56,0)}}
.cele-card.flip{display:grid;padding:0;background:#C42F28;animation-name:en26flipcard;animation-timing-function:ease-in-out}
.cele-card.flip .face{grid-area:1/1;display:flex;flex-direction:column;align-items:center;gap:.25em;padding:.6em 1.6em .7em;animation-duration:inherit;animation-fill-mode:both;animation-timing-function:linear}
.cele-card.flip .front{animation-name:en26front}
.cele-card.flip .back{animation-name:en26back}
.cele-card.flip .front .cele-flip{color:#C42F28}
@keyframes en26flipcard{
  0%{opacity:0;transform:translate(-50%,-50%) perspective(60em) scale(.6);background:#C42F28}
  20%{opacity:1;transform:translate(-50%,-50%) perspective(60em) scale(1);background:#C42F28}
  50%{transform:translate(-50%,-50%) perspective(60em) rotateY(0);background:#C42F28}
  62.4%{transform:translate(-50%,-50%) perspective(60em) rotateY(90deg);background:#C42F28}
  62.6%{transform:translate(-50%,-50%) perspective(60em) rotateY(90deg);background:rgba(28,91,204,.92)}
  78%{transform:translate(-50%,-50%) perspective(60em) rotateY(0) scale(1.1);background:rgba(28,91,204,.92)}
  100%{opacity:1;transform:translate(-50%,-50%) perspective(60em) scale(1);background:rgba(28,91,204,.88)}}
@keyframes en26front{0%,62.4%{opacity:1}62.6%,100%{opacity:0}}
@keyframes en26back{0%,62.4%{opacity:0}62.6%,100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.en26 *{animation:none!important;transition:none!important}}
`;
