/**
 * Styles du widget — injectés dans le Shadow DOM (isolation totale du thème
 * hôte). Desktop : aperçu à gauche, panneau à droite. Mobile (<900px) :
 * disposition validée — aperçu épinglé, onglets, barre d'action contextuelle.
 */

export const WIDGET_CSS = `
:host { all: initial; max-height: 100vh; max-height: 100dvh; }
*,
*::before,
*::after { box-sizing: border-box; margin: 0; padding: 0; }
.root {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #1f2937; background: #fff; height: 100%;
  
  min-height: min(480px, 100dvh);
  display: flex; flex-direction: column; overflow: hidden;
  --accent: #ec4899;
}
button { font: inherit; cursor: pointer; border: 0; background: none; -webkit-tap-highlight-color: transparent; }
input,
select { font: inherit; }
.pied-actions { display: contents; }
.hd { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #eceef2; background: rgba(255,255,255,.92); z-index: 30; }
.hd h1 { font-size: 14px; font-weight: 800; letter-spacing: -.2px; flex: 1; }
.hd .brandlink { flex: 1; text-decoration: none; color: inherit; }
.hd .brandlink:hover h1 { opacity: .7; }
.body { flex: 1; min-height: 0; display: flex; }
.preview-wrap { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; }
.stage { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: background .3s; }
.stage::after { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(115% 95% at 50% 42%, transparent 52%, rgba(0,0,0,.42) 100%); }
.neon-stage-inner { position: relative; z-index: 1; display: inline-block; }
.neon-text { position: relative; z-index: 1; text-align: center; user-select: none; line-height: 1.35; white-space: pre; }
.plate-cut { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.plate-cut .neon-line { text-shadow: none !important; }
.plate-cut--face { z-index: 0; }
.plate-rect { position: absolute; z-index: 0; pointer-events: none; }
.plate-rect.is-box::after { content: ''; position: absolute; left: 2%; right: 2%; bottom: -7px; height: 7px; border-radius: 0 0 8px 8px; background: rgba(0,0,0,.5); }
.logo-preview { position: relative; z-index: 1; }
.neon-line { display: block; }
.neon-line-row { display: block; white-space: nowrap; }
.neon-word { display: inline-block; position: relative; }
.neon-word + .neon-word { margin-left: .28em; }
.neon-stage-inner--editable { transform-origin: center; transition: transform .18s ease; }
.neon-stage-inner--editable > .neon-text:not(.plate-cut) .neon-line { cursor: grab; touch-action: none; }
.neon-stage-inner--editable > .neon-text:not(.plate-cut) .neon-line:active { cursor: grabbing; }
.neon-line--lit { position: relative; isolation: isolate; }
.neon-line--lit::before {
  content: attr(data-text); position: absolute; inset: 0; z-index: -2;
  color: var(--neon-color); -webkit-text-stroke: .035em var(--neon-color);
  paint-order: stroke fill; opacity: .34; filter: blur(18px);
  
  text-shadow: 0 0 34px var(--neon-color), 0 0 72px var(--neon-color);
  transform: scale(1.012); transform-origin: center;
  pointer-events: none;
}
.neon-line--lit::after {
  content: attr(data-text); position: absolute; inset: 0; z-index: -1;
  color: color-mix(in srgb, var(--neon-color) 72%, white);
  -webkit-text-stroke: .022em var(--neon-color); paint-order: stroke fill;
  opacity: .78; filter: blur(3.5px); pointer-events: none;
}
.scene-ruler { position: absolute; z-index: 5; color: rgba(245,248,252,.9); pointer-events: none; font: 700 11px/1.15 system-ui,sans-serif; }
.scene-ruler::before { content: ''; position: absolute; background: currentColor; opacity: .82; }
.scene-ruler i { position: absolute; display: block; background: currentColor; opacity: .9; }
.scene-ruler span { position: absolute; white-space: nowrap; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.9);
  scale: var(--ahns-cote, 1); }
.scene-ruler small { font: inherit; font-size: 10px; }
.scene-ruler--vertical { top: 0; bottom: 0; left: -58px; width: 42px; }
.scene-ruler--vertical::before { top: 0; bottom: 0; right: 0; width: calc(1px * var(--ahns-cote, 1)); }
.scene-ruler--vertical i { right: calc(-8px * var(--ahns-cote, 1)); width: calc(17px * var(--ahns-cote, 1)); height: calc(1px * var(--ahns-cote, 1)); }
.scene-ruler--vertical i:first-child { top: 0; }
.scene-ruler--vertical i:last-child { bottom: 0; }
.scene-ruler--vertical span { right: 10px; top: 50%; transform: translateY(-50%); }
.scene-ruler--horizontal { left: 0; right: 0; bottom: -48px; height: 34px; }
.scene-ruler--horizontal::before { left: 0; right: 0; top: 0; height: calc(1px * var(--ahns-cote, 1)); }
.scene-ruler--horizontal i { top: calc(-8px * var(--ahns-cote, 1)); width: calc(1px * var(--ahns-cote, 1)); height: calc(17px * var(--ahns-cote, 1)); }
.scene-ruler--horizontal i:first-child { left: 0; }
.scene-ruler--horizontal i:last-child { right: 0; }
.scene-ruler--horizontal span { left: 50%; top: 9px; transform: translateX(-50%); }
.scene-toolbar { position: absolute; z-index: 10; left: calc(50% + var(--ahns-dx, 0px)); bottom: 14px; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; padding: 5px; border: 1px solid rgba(255,255,255,.12); border-radius: 11px; background: rgba(28,33,43,.82); backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,.3); }
.scene-toolbar button { min-width: 35px; height: 35px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; color: #eef3f8; font-size: 20px; line-height: 1; }
.scene-toolbar button:hover:not(:disabled) { background: rgba(255,255,255,.12); }
.scene-toolbar button:disabled { opacity: .3; cursor: default; }
.scene-toolbar__background { font-size: 11px !important; font-weight: 800; border-left: 1px solid rgba(255,255,255,.13); border-radius: 0 8px 8px 0 !important; }
.scene-toolbar__background i { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,.55); }
.hud { position: absolute; z-index: 6; display: flex; align-items: center; gap: 3px;
  color: rgba(245,248,252,.88);
  background: rgba(10,12,16,.66); backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 4px;
  box-shadow: 0 6px 22px rgba(0,0,0,.28); }
.hud__label { font-size: 9px; font-weight: 900; letter-spacing: .11em; text-transform: uppercase;
  color: #93a3b6; padding: 0 7px 0 5px; }
.hud button { display: inline-flex; align-items: center; gap: 6px; color: #cfd8e3;
  font-size: 11.5px; font-weight: 700; padding: 6px 10px; border-radius: 9px; white-space: nowrap; }
.hud button:hover { background: rgba(255,255,255,.10); color: #fff; }
.hud button.on { background: #fff; color: #111827; }
.hud button > i { width: 13px; height: 13px; border-radius: 4px; flex: none;
  border: 1px solid rgba(255,255,255,.4); }
.hud--bg {
  top: 12px; left: calc(12px + var(--ahns-masque-g, 0px));
  
  max-width: calc(100% - 126px - var(--ahns-masque-g, 0px) - var(--ahns-masque-d, 0px));
  overflow-x: auto; scrollbar-width: none;
}
.hud--bg::-webkit-scrollbar { display: none; }
.hud__fonds { display: contents; }
.hud__light { margin-left: 3px; padding-left: 12px !important; border-left: 1px solid rgba(255,255,255,.16); border-radius: 0 9px 9px 0 !important; }
.hud__light svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.hud__light.on { background: #ffd45e !important; color: #402e00 !important; border-left-color: transparent; }
.hud--cotes { display: none; left: calc(12px + var(--ahns-masque-g, 0px)); bottom: 12px;
  padding: 7px 12px; gap: 9px; font-size: 11px; font-weight: 700; }
.hud--cotes b { font-variant-numeric: tabular-nums; color: #fff; }
.hud--cotes i {
  width: auto; height: auto; background: none;
  color: rgba(255, 255, 255, .5);
}
.hud--cotes i::before { content: '·'; }
.hud--info { left: calc(12px + var(--ahns-masque-g, 0px)); bottom: 12px; padding: 7px 12px; gap: 9px;
  color: #b3c0d0; font-size: 11px; font-weight: 600; letter-spacing: .01em; }
.hud--info b { color: #eef3f9; font-weight: 800; }
.hud--info i { width: 1px; height: 11px; background: rgba(255,255,255,.22); }
.logo-preview--eteint {
  -webkit-mask-image: var(--ahns-logo); mask-image: var(--ahns-logo);
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
  filter: drop-shadow(0 2px 5px rgba(0,0,0,.45));
}
.breakdown .delai { display: flex; justify-content: space-between; margin-top: 8px;
  padding-top: 8px; border-top: 1px solid rgba(0,0,0,.09); font-size: 12px; }
.breakdown .delai b { color: #1c2430; }
.qr-boite { margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #dfe4ea;
  border-radius: 10px; display: flex; justify-content: center; }
.qr-boite svg { display: block; width: 200px; height: 200px; }
.breakdown .colis { display: block; margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(0,0,0,.09); }
.colis h3 { margin: 0 0 5px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
  text-transform: uppercase; color: #5a6675; }
.colis ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.colis li { position: relative; padding-left: 15px; font-size: 12px; color: #1c2430; }
.colis li::before { content: '✓'; position: absolute; left: 0; color: #178a4a; font-weight: 800; }
.colis li span { color: #6b7684; }
.gabarit-lien { display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; margin-top: 10px; padding: 10px 12px; text-align: left;
  background: #f6f7f9; border: 1px dashed #c3cad4; border-radius: 10px;
  font-size: 13px; font-weight: 700; color: #1c2430; cursor: pointer; }
.gabarit-lien:hover { background: #eef1f5; border-color: #97a3b3; }
.gabarit-lien small { font-weight: 500; font-size: 11px; color: #5a6675; }
.repere2d { position: absolute; z-index: 4; pointer-events: none;
  opacity: .34; color: #e8eef6; }
.repere2d svg { width: 100%; height: 100%; display: block; }
.repere2d svg > * { fill: currentColor; }
.repere2d__trait { fill: none !important; stroke: rgba(0,0,0,.45); stroke-width: .7; }
.repere2d b { position: absolute; left: 50%; top: calc(100% + 4px); transform: translateX(-50%);
  font-size: 10px; font-weight: 700; letter-spacing: .02em; white-space: nowrap;
  color: #cfd8e4; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
.hud--avis { left: calc(12px + var(--ahns-masque-g, 0px)); top: 58px; max-width: 62%;
  padding: 7px 12px; color: #ffd9a0; background: rgba(46, 30, 8, .82);
  border: 1px solid rgba(255, 190, 90, .35); font-size: 11px; font-weight: 700;
  line-height: 1.35; }
.hud--views { right: 12px; bottom: 12px; }
.hud__sep { margin-left: 3px; padding-left: 12px !important; border-left: 1px solid rgba(255,255,255,.16); border-radius: 0 9px 9px 0 !important; }
.viewchip { position: absolute; top: 12px; right: calc(12px + var(--ahns-masque-d, 0px)); z-index: 7; display: flex; gap: 2px;
  background: rgba(10,12,16,.66); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.14);
  padding: 4px; border-radius: 12px; box-shadow: 0 6px 22px rgba(0,0,0,.28); }
.viewchip button { color: #cfd8e3; font-size: 10.5px; font-weight: 900; letter-spacing: .08em; padding: 6px 13px; border-radius: 9px; }
.viewchip button:hover { background: rgba(255,255,255,.10); color: #fff; }
.viewchip button.on { background: #fff; color: #111827; }
.building3d { color: #9fb3c8; font-size: 12.5px; font-weight: 700; }
.logo-preview { max-width: 82%; object-fit: contain; user-select: none; }
.upload { display: block; padding: 12px; border: 1.5px dashed #d1d5db; border-radius: 12px; text-align: center; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; }
.upload:hover { border-color: var(--accent); color: var(--accent); }
.quote-note { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; padding: 13px 15px;
  border: 1.5px solid var(--accent); border-radius: 12px; background: rgba(236,72,153,.06); }
.quote-note strong { font-size: 13px; }
.quote-note span { font-size: 12.5px; color: #6b7280; line-height: 1.5; }
.quote-cta { align-self: flex-start; margin-top: 3px; padding: 9px 18px; border-radius: 999px;
  background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; }
.quote-cta:hover { filter: brightness(1.07); }
.quote-hint { font-style: italic; }
.quote-field { width: 100%; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 9px;
  font-size: 13px; font-family: inherit; background: #fff; color: #111; }
.quote-field:focus { outline: none; border-color: var(--accent); }
.quote-cta { border: 0; cursor: pointer; font-family: inherit; }
.quote-cta:disabled { opacity: .5; cursor: default; }
.quote-ok { color: #0b6b45; font-weight: 700; font-size: 12.5px; }
.quote-err { color: #b91c1c; font-size: 12.5px; }
.quote-link { display: block; margin-top: 9px; font-size: 12px; color: #6b7280;
  text-decoration: underline; text-underline-offset: 3px; }
.quote-link:hover { color: var(--accent); }
.quote-panel { display: flex; flex-direction: column; gap: 9px; }
.quote-panel__head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 2px; }
.quote-panel__head strong { font-size: 16px; }
.quote-panel__head span { font-size: 12.5px; color: #6b7280; }
.quote-panel .cta { width: 100%; margin-top: 6px; flex: none; height: 54px;
  font-size: 14.5px; letter-spacing: .03em; }
.quote-sent { display: flex; flex-direction: column; gap: 5px; padding: 16px 18px; border-radius: 12px;
  background: rgba(45,255,110,.10); border: 1.5px solid #2dff6e33; }
.quote-sent strong { font-size: 15px; color: #0b6b45; }
.quote-sent span { font-size: 13px; color: #6b7280; line-height: 1.5; }
.familles { display: flex; gap: 4px; padding: 0 14px 10px; border-bottom: 1px solid #eceef2; }
.familles button { flex: 1; padding: 11px 8px; border: 0; border-radius: 10px 10px 0 0;
  background: transparent; color: #6b7280; font-size: 13.5px; font-weight: 800;
  font-family: inherit; cursor: pointer; border-bottom: 2.5px solid transparent; }
.familles button:hover { color: #111; }
.familles button.on { color: var(--accent); border-bottom-color: var(--accent); }
.dims-in { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 6px; }
.dims-in label { display: flex; flex-direction: column; gap: 4px; }
.dims-in span { font-size: 12px; font-weight: 700; color: #6b7280; }
.dims-in input { width: 100%; padding: 11px 12px; border: 1.5px solid #d1d5db; border-radius: 10px;
  font: inherit; font-size: 15px; font-weight: 700; color: #111; background: #fff; }
.dims-in input:focus { outline: none; border-color: var(--accent); }
.swatch-mat { display: block; width: 30px; height: 24px; border-radius: 6px;
  border: 1px solid rgba(0,0,0,.12); }
.cards button:has(.swatch-mat) {
  display: grid; grid-template-columns: auto 1fr; column-gap: 9px; row-gap: 1px;
  align-items: center; text-align: left; padding: 8px 10px; font-size: 12.5px; }
.cards button:has(.swatch-mat) .swatch-mat { grid-row: 1 / span 2; }
.cards button:has(.swatch-mat) small { grid-column: 2; display: block;
  font-size: 10.5px; font-weight: 600; color: #8b93a0; line-height: 1.25; }
.cards button.on:has(.swatch-mat) small { color: #b86a92; }
.plaque2d { position: relative; display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(0,0,0,.22); overflow: hidden; --tranche: #23262c; }
.plaque2d.mat-pvc { background:
  linear-gradient(145deg, rgba(255,255,255,.16), rgba(0,0,0,.05) 60%),
  #f0f1ee; --tranche: #b9bab4; }
.plaque2d.mat-dibond { background:
  linear-gradient(120deg, rgba(255,255,255,.22), transparent 35%, rgba(255,255,255,.10) 60%, transparent 80%),
  repeating-linear-gradient(90deg, #cfd4da 0 2px, #c4cad1 2px 3px, #cbd0d7 3px 5px),
  #c9ced5; --tranche: #8d939b; }
.plaque2d.mat-aluminium { background:
  linear-gradient(115deg, rgba(255,255,255,.34), transparent 30%, rgba(255,255,255,.16) 55%, transparent 75%),
  repeating-linear-gradient(90deg, #c2c9d1 0 1px, #b4bbc4 1px 2px, #bdc4cc 2px 4px),
  #b9c0c9; --tranche: #7e858e; }
.plaque2d.mat-plexi { background:
  linear-gradient(125deg, rgba(255,255,255,.38) 4%, rgba(255,255,255,.06) 30%, rgba(255,255,255,.20) 46%, rgba(255,255,255,.03) 62%),
  linear-gradient(160deg, rgba(214,232,248,.42), rgba(180,205,230,.28));
  border-color: rgba(255,255,255,.5); --tranche: rgba(150,180,205,.55);
  backdrop-filter: blur(1px); }
.plaque2d.mat-bois { background:
  repeating-linear-gradient(88deg, rgba(92,61,30,.13) 0 2px, transparent 2px 11px, rgba(92,61,30,.07) 11px 14px, transparent 14px 27px),
  repeating-linear-gradient(90deg, #cba576 0 22px, #c09a6b 22px 34px, #c7a172 34px 55px, #b8905f 55px 60px),
  #c49d6f; --tranche: #8a6a44; }
.plaque2d__reflet { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,.13) 38%, rgba(255,255,255,.30) 46%, rgba(255,255,255,.10) 55%, transparent 70%); }
.plaque2d.mat-pvc .plaque2d__reflet,
.plaque2d.mat-bois .plaque2d__reflet { opacity: .35; }
.plaque2d__vis { position: absolute; width: 11px; height: 11px; border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #f5f8fb, #aeb6bf 52%, #6f7680 100%);
  box-shadow: 0 1px 2px rgba(0,0,0,.5), inset 0 0 0 1px rgba(0,0,0,.18); }
.plaque2d__vis.vis-0 { top: 7px; left: 7px; }
.plaque2d__vis.vis-1 { top: 7px; right: 7px; }
.plaque2d__vis.vis-2 { bottom: 7px; left: 7px; }
.plaque2d__vis.vis-3 { bottom: 7px; right: 7px; }
.plaque2d__artwork { position: absolute; inset: 7%; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(120% 90% at 18% 20%, rgba(255,102,160,.55), transparent 55%),
    radial-gradient(110% 100% at 85% 30%, rgba(80,170,255,.5), transparent 60%),
    radial-gradient(130% 110% at 55% 95%, rgba(255,200,80,.42), transparent 55%),
    #f6f4ef; }
.plaque2d__print { font-size: 13px; font-weight: 800; color: rgba(30,35,45,.5);
  letter-spacing: .08em; text-transform: uppercase; user-select: none; position: relative; z-index: 1; }
.plaque2d__lettres { font-size: clamp(15px, 4vw, 30px); font-weight: 900;
  letter-spacing: .05em; text-transform: uppercase; color: #191c22;
  text-shadow: 1.5px 2.5px 0 rgba(0,0,0,.35), 3px 5px 7px rgba(0,0,0,.3); user-select: none; }
.plaque2d__grave { font-size: clamp(15px, 4vw, 30px); font-weight: 900;
  letter-spacing: .05em; text-transform: uppercase; color: rgba(0,0,0,.34);
  text-shadow: 0 1px 0 rgba(255,255,255,.55), 0 -1px 1px rgba(0,0,0,.45); user-select: none; }
.channel-letter-preview { position: relative; z-index: 2; display: inline-grid; place-items: center; max-width: 86%; font-size: clamp(24px, 5.2vw, 58px); font-weight: 900; line-height: 1; white-space: nowrap; transform: translateY(-3px); }
.channel-letter-preview > span { grid-area: 1 / 1; }
.channel-letter-layer { position: relative; z-index: 0; paint-order: stroke fill; filter: drop-shadow(0 5px 5px rgba(0,0,0,.28)); }
.channel-letter-face { position: relative; z-index: 3; color: var(--letter-face); -webkit-text-stroke: 1px rgba(255,255,255,.78); paint-order: stroke fill; text-shadow: 1px 1px 0 var(--letter-side), 2px 2px 0 var(--letter-side), 3px 3px 0 var(--letter-side), var(--letter-depth) var(--letter-depth) 8px rgba(0,0,0,.42); }
.channel-letter-preview.mat-acrylic .channel-letter-face { background: linear-gradient(145deg,rgba(255,255,255,.9),transparent 32%); background-clip: text; }
.channel-letter-preview.mat-metal .channel-letter-face { filter: saturate(.72) contrast(1.12); }
.channel-letter-preview.mat-wood .channel-letter-face { filter: sepia(.2); }
.channel-letter-face.is-lit.light-front,
.channel-letter-face.is-lit.light-front-back { text-shadow: 0 0 3px #fff, 0 0 10px var(--letter-glow), 1px 1px 0 var(--letter-side), 3px 3px 0 var(--letter-side), var(--letter-depth) var(--letter-depth) 8px rgba(0,0,0,.38); }
.channel-letter-face.is-lit.light-back,
.channel-letter-face.is-lit.light-front-back { filter: drop-shadow(0 0 7px var(--letter-glow)) drop-shadow(0 0 15px var(--letter-glow)); }
.channel-options { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid #e2e6ec; border-radius: 14px; background: #fafbfc; }
.cards--three { grid-template-columns: repeat(3,minmax(0,1fr)); }
.cards--two { grid-template-columns: repeat(2,minmax(0,1fr)); }
.channel-colors { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.channel-colors label { display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 8px; border: 1px solid #dce1e7; border-radius: 9px; background: #fff; font-size: 11px; font-weight: 800; }
.channel-colors input { width: 28px; height: 28px; padding: 0; border: 0; background: none; }
.backboard-layer { display: grid; grid-template-columns: 1fr 1.3fr 36px; gap: 7px; align-items: center; padding: 10px; border: 1px solid #dce1e7; border-radius: 10px; background: #fff; }
.backboard-layer label { grid-column: 1 / -1; display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; }
.backboard-layer label input { width: 72px; padding: 5px 7px; border: 1px solid #d1d5db; border-radius: 6px; }
.plaque2d.est-caisson { padding: 9px; overflow: visible; background:
  linear-gradient(115deg, rgba(255,255,255,.28), transparent 40%, rgba(255,255,255,.12) 65%),
  repeating-linear-gradient(90deg, #b7bec7 0 2px, #aab1bb 2px 4px), #aeb5be;
  --tranche: #6d747d; }
.plaque2d__face { position: relative; width: 100%; height: 100%; border-radius: 2px;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  
  background: linear-gradient(150deg, #eceded, #d8dadc); box-shadow: inset 0 0 7px rgba(0,0,0,.3); }
.plaque2d__face.allumee {
  
  background: radial-gradient(105% 130% at 50% 45%, #fffdf6 0 42%, #ffeec2 78%, #f5d894 100%);
  box-shadow: inset 0 0 16px rgba(255,180,60,.25); }
.plaque2d__face.allumee .plaque2d__print { color: rgba(120,80,20,.55); }
.plaque2d.est-caisson .plaque2d__reflet { inset: 9px; opacity: .5; }
.neon2d-vis { position: absolute; width: 10px; height: 10px; border-radius: 50%; z-index: 2;
  background: radial-gradient(circle at 34% 30%, #f2f6fa, #a8b0ba 55%, #666d77 100%);
  box-shadow: 0 1px 3px rgba(0,0,0,.6); pointer-events: none; }
.neon2d-vis.vis-0 { top: var(--d, 0); left: var(--d, 0); }
.neon2d-vis.vis-1 { top: var(--d, 0); right: var(--d, 0); }
.neon2d-vis.vis-2 { bottom: var(--d, 0); left: var(--d, 0); }
.neon2d-vis.vis-3 { bottom: var(--d, 0); right: var(--d, 0); }
.neon2d-cable { display: none; position: absolute; top: 100%; left: 68%; width: 42px; height: 86px;
  z-index: 0; pointer-events: none; opacity: .9; }
.hint { font-size: 11px; color: #9ca3af; font-weight: 500; line-height: 1.5; }
.dims { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 14px; padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.12); backdrop-filter: blur(6px); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.dims b { font-variant-numeric: tabular-nums; }
.bgs { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; z-index: 5; }
.bgs button { width: 30px; height: 30px; border-radius: 10px; border: 2px solid rgba(255,255,255,.35); }
.bgs button.on { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
.panel { width: clamp(320px, 32vw, 420px); border-left: 1px solid #eceef2; display: flex; flex-direction: column; min-height: 0; background: #fff; }
.tabs { display: none; }
.panes { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }
.sect { display: flex; flex-direction: column; gap: 8px; }
.sect--na { display: none !important; }
.sect > h2 { font-size: 10.5px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; color: #9ca3af; }
.linebox { border: 1.5px solid #e5e7eb; border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.linebox input[type=text] { width: 100%; border: 0; outline: none; font-size: 16px; font-weight: 700; letter-spacing: .06em; }
.hint--lead { font-size: 12px; color: #6b7280; font-weight: 600; margin: -2px 0 2px; }
.textfield { width: 100%; height: 52px; padding: 0 14px; border: 2px solid #d3d8e0 !important;
  border-radius: 12px; background: #f7f9fc; font-size: 17px; font-weight: 800; letter-spacing: .08em;
  color: #111827; outline: none; transition: border-color .15s, box-shadow .15s, background .15s; }
.textfield::placeholder { color: #98a2af; font-weight: 700; letter-spacing: .06em; }
.textfield:hover { border-color: #b3bcc8 !important; }
.textfield:focus { border-color: var(--accent) !important; background: #fff; box-shadow: 0 0 0 4px rgba(236,72,153,.16); }
.linerow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fontpick { display: flex; gap: 6px; flex-wrap: wrap; }
.fontpick button { padding: 6px 12px; border-radius: 10px; background: #f3f4f6; color: #6b7280; font-size: 13px; }
.fontpick button.on { background: #111827; color: #fff; }
.rmline { margin-left: auto; color: #ef4444; font-size: 12px; font-weight: 700; }
.addline { align-self: flex-start; padding: 8px 14px; border-radius: 10px; background: #f3f4f6; font-size: 12.5px; font-weight: 700; color: #374151; }
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
.sw.on { outline: 2.5px solid #111827; outline-offset: 2px; }
.sw--rgb { background: conic-gradient(#ff1f1f,#ffd60a,#2dff6e,#33d1ff,#7b5bff,#ff2d95,#ff1f1f); }
.sizes { display: flex; gap: 8px; }
.sizes button { flex: 1; padding: 10px 0; border-radius: 12px; background: #f3f4f6; font-weight: 800; color: #6b7280; }
.sizes button.on { background: var(--accent); color: #fff; }
.slider-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b7280; font-weight: 700; }
.slider-row input { flex: 1; accent-color: var(--accent); }
.cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.cards button { padding: 11px 10px; border-radius: 12px; background: #f4f6f8; font-size: 12.5px;
  font-weight: 700; color: #4b5563; border: 2px solid #dde2e9; }
.cards button:hover:not(:disabled) { border-color: #b3bcc8; }
.cards button:disabled { opacity: .45; cursor: not-allowed; }
.cards button.on { border-color: var(--accent); background: #fdf2f8; color: #9d2463; }
.finishes { display: flex; gap: 8px; flex-wrap: wrap; }
.finish { position: relative; width: 52px; height: 52px; border-radius: 12px;
  border: 2px solid #b6bfca; box-shadow: inset 0 1px 2px rgba(0,0,0,.10);
  display: flex; align-items: flex-end; justify-content: center; font-size: 8.5px; font-weight: 800;
  color: #45505e; padding-bottom: 3px; text-shadow: 0 1px 0 rgba(255,255,255,.75); }
.finish:hover { border-color: #8a95a3; }
.finish.on { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(236,72,153,.22); }
.finish.on::after { content: '✓'; position: absolute; top: -7px; right: -7px; width: 20px; height: 20px;
  border-radius: 50%; background: var(--accent); color: #fff; font-size: 12px; line-height: 20px;
  text-align: center; text-shadow: none; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.optrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; user-select: none; }
.optrow:hover { border-color: #cbd2db; }
.optrow:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.optrow small { display: block; font-weight: 500; color: #9ca3af; }
.opt-prix { flex: none; }
.switch { position: relative; width: 42px; height: 24px; border-radius: 999px; background: #e5e7eb; transition: background .15s; flex: none; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.switch.on { background: var(--accent); }
.switch.on::after { left: 21px; }
.issues { display: flex; flex-direction: column; gap: 6px; }
.issue { font-size: 12px; font-weight: 600; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 8px 12px; }
.mention-legale { margin: 2px 0 6px; font-size: 11px; line-height: 1.45; color: var(--muted, #6b7280); opacity: .95; }
.horaires { display: flex; flex-wrap: wrap; gap: 10px; margin: -2px 0 8px; padding: 8px 10px; border-left: 2px solid var(--accent, #ff2fb0); background: rgba(0,0,0,.03); border-radius: 0 6px 6px 0; }
.horaires label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.horaires input[type="time"] { font: inherit; padding: 3px 6px; border: 1px solid #d7dae0; border-radius: 6px; background: #fff; color: inherit; }
.horaires-verdict { flex: 1 0 100%; margin: 0; font-size: 11px; line-height: 1.45; color: var(--muted, #6b7280); }
.photo-mesure { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(8,10,14,.72); backdrop-filter: blur(2px); }
.photo-mesure__boite { width: min(680px, 100%); max-height: 100%; overflow: auto; padding: 16px 18px 14px; border-radius: 14px; background: #fff; color: #111; box-shadow: 0 18px 60px rgba(0,0,0,.4); }
.photo-mesure__boite h3 { margin: 0 0 4px; font-size: 16px; }
.photo-mesure__boite > p { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #4b5563; }
.photo-mesure__vue { position: relative; line-height: 0; border-radius: 8px; overflow: hidden; background: #eceef2; }
.photo-mesure__vue img { display: block; width: 100%; height: auto; max-height: 46vh; min-height: 140px; object-fit: contain; cursor: crosshair; }
.photo-mesure__trait circle { fill: #fff; stroke: var(--accent, #ff2fb0); stroke-width: 2; }
.photo-mesure__trait { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.photo-mesure__trait line { stroke: var(--accent, #ff2fb0); stroke-width: 2; stroke-dasharray: 5 4; }
.photo-mesure__saisie { margin: 10px 0 4px; font-size: 13px; }
.photo-mesure__saisie label { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }
.photo-mesure__saisie input { width: 92px; font: inherit; padding: 4px 7px; border: 1px solid #d7dae0; border-radius: 6px; }
.photo-mesure__verdict { min-height: 1.4em; margin: 2px 0 6px; font-size: 13px; font-weight: 600; }
.photo-mesure__avis { margin: 0 0 12px; font-size: 11.5px; line-height: 1.5; color: #6b7280; }
.photo-mesure__pied { display: flex; gap: 8px; justify-content: flex-end; }
.photo-mesure__pied button { font: inherit; font-size: 13px; padding: 7px 13px; border-radius: 8px; border: 1px solid #d7dae0; background: #fff; cursor: pointer; }
.photo-mesure__pied .primaire { background: var(--accent, #ff2fb0); border-color: transparent; color: #fff; font-weight: 700; }
.photo-mesure__pied button[disabled] { opacity: .45; cursor: not-allowed; }
.hud__photo-entree { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.hud__photo svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor;
  stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.pricebar { flex: none; border-top: 1px solid #eceef2; background: #fafafa; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 7px; }
.pricebar .row { display: flex; align-items: center; gap: 12px; }
.total { flex: none; }
.total .p { font-size: 20px; font-weight: 900; letter-spacing: -.4px; }
.total .s { font-size: 9px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: .06em; }
.detail-toggle { align-self: center; min-height: 24px; padding: 5px 6px; font-size: 11.5px; font-weight: 700; color: #6b7280; text-decoration: underline; text-underline-offset: 3px; line-height: 1.2; }
.cta { flex: 1; height: 48px; border-radius: 14px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; box-shadow: 0 8px 20px rgba(236,72,153,.3); }
.cta:active { transform: scale(.98); }
.breakdown { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b5563; }
.breakdown div { display: flex; justify-content: space-between; }
.breakdown b { font-variant-numeric: tabular-nums; }
.added-head { font-size: 11.5px; font-weight: 700; color: #374151; text-align: center; }
.added-head .ok { display: inline-flex; width: 16px; height: 16px; border-radius: 50%; background: #10b981; color: #fff; font-size: 10px; align-items: center; justify-content: center; margin-right: 4px; }
.added-btns { display: flex; gap: 8px; }
.btn-ghost { flex: 1; height: 48px; border-radius: 14px; border: 2px solid var(--accent); background: #fff; color: var(--accent); font-size: 12px; font-weight: 900; text-transform: uppercase; }
.added-btns .cta { flex: 1.2; }
.familles button,
.fontpick button,
.sizes button,
.cards button,
.sw,
.finish,
.optrow,
.tabs button,
.addline,
.upload,
.bgs button,
.cta,
.btn-ghost {
  transition: background .15s, border-color .15s, color .15s, box-shadow .15s, transform .12s, opacity .15s; }
.familles button:hover:not(.on) { background: #f6f7f9; }
.fontpick button:hover:not(.on) { background: #e8eaee; color: #1f2937; }
.sizes button:hover:not(.on) { background: #e8eaee; color: #374151; }
.sw:hover { transform: scale(1.09); }
.sw.on { transform: scale(1.05); }
.finish:hover { transform: translateY(-1px); }
.cards button.on { box-shadow: 0 4px 12px rgba(236,72,153,.16); }
.addline:hover { background: #e8eaee; color: #111827; }
.panes > .sect + .sect { border-top: 1px solid #f1f3f6; padding-top: 16px; }
.linebox:focus-within { border-color: var(--accent); }
.panes { scrollbar-width: thin; scrollbar-color: #d4d9e0 transparent; }
.panes::-webkit-scrollbar { width: 8px; }
.panes::-webkit-scrollbar-thumb { background: #d4d9e0; border-radius: 99px; }
.panes::-webkit-scrollbar-track { background: transparent; }
.cta:hover { filter: brightness(1.06); box-shadow: 0 10px 26px rgba(236,72,153,.38); }
.btn-ghost:hover { background: #fdf2f8; }
.detail-toggle:hover { color: #111827; }

@media (max-width: 899px) {
.hud { gap: 2px; padding: 3px; border-radius: 11px; }
.hud__txt,
.hud__label { display: none !important; }
.hud button { padding: 7px 8px; gap: 0; }
.hud button > i { width: 16px; height: 16px; }
.hud__light,
.hud__sep { margin-left: 2px; padding-left: 8px !important; }
.hud--bg { top: 8px; left: 8px; }
.viewchip { top: 8px; right: 8px; padding: 3px; }
.viewchip button { padding: 7px 11px; }
.hud--info { left: 8px; bottom: 26px; padding: 6px 10px; font-size: 10.5px; }
.hud--views { right: 8px; bottom: 26px; }
.fontpick { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.fontpick::-webkit-scrollbar { display: none; }
.fontpick button { flex: none; }
.body { flex-direction: column; }
.preview-wrap { flex: none; height: 38%; min-height: 180px; }
.root.sheet-full .preview-wrap { height: 110px; min-height: 110px; }
.root.sheet-full .dims,
.root.sheet-full .bgs { display: none; }
.panel { width: 100%; flex: 1; min-height: 0; border-left: 0; border-top: 1px solid #eceef2; border-radius: 18px 18px 0 0; margin-top: -14px; z-index: 10; }
.handle { display: flex; justify-content: center; align-items: center; min-height: 24px; padding: 10px 0 9px; }
.handle i { width: 40px; height: 5px; border-radius: 99px; background: #d1d5db; }
.tabs { display: flex; gap: 6px; padding: 4px 12px 8px; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button { flex: none; min-width: 68px; min-height: 44px; padding: 10px 14px; border-radius: 14px; background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 800; }
.optrow { padding: 12px; cursor: pointer; }
.switch { width: 52px; height: 30px; }
.switch::after { width: 24px; height: 24px; }
.switch.on::after { left: 25px; }
.tabs button.on { background: var(--accent); color: #fff; box-shadow: 0 6px 16px rgba(236,72,153,.3); }
.panes .sect.off { display: none; }
.sw { width: 44px; height: 44px; }
.finish { width: 52px; height: 52px; }
.root.quote { height: auto; min-height: 0; overflow: visible; }
.root.quote .body { flex-direction: column; }
.root.quote .preview-wrap { flex: none; height: 300px; min-height: 300px; }
.root.quote .panel { flex: none; margin-top: -14px; }
.root.quote .panes { overflow: visible; }
.root.quote .foot { position: static; }
.root.quote .quote-panel { padding-bottom: 6px; }
.root.quote .quote-field { padding: 12px 13px; font-size: 15px; }
}
@media (min-width: 900px) {
.handle { display: none; }
}
.root .preview-wrap:has(canvas)::after,
.root .stage:has(canvas)::before,
.root .stage:has(canvas)::after {
  
  content: none !important;
  display: none !important;
}
.fontpick__plus {
  border: 1.5px dashed var(--vt-bord, #e8e9f0) !important;
  background: none !important;
  color: var(--vt-txt2, #5f6675) !important;
  font-family: inherit !important;
  font-weight: 700;
  min-height: 32px;
}
.fontpick__plus:hover {
  border-color: var(--vt-txt3, #9aa1b0) !important;
  color: var(--vt-txt, #171923) !important;
}
.root[data-theme="clair-boutique"] .stage {
  aspect-ratio: 4 / 3;
  height: auto;
  min-height: 0;
}

@media (min-width: 900px) {
.root[data-theme="clair-boutique"] .preview-wrap { align-self: start; }
}
:host([data-vue="fiche"]) { max-height: none; height: auto; display: block; }
.root[data-vue="fiche"] {
  height: auto; min-height: 0;
  
  overflow: visible;

  
  background: none;

  
  position: relative;
}
.root[data-vue="fiche"] .body {
  height: auto; min-height: 0; max-height: none; min-width: 0;
  max-width: 100%;
  overflow: visible; 
}
.root[data-vue="fiche"] .stage {
  flex: none; min-height: 0;
  height: auto; aspect-ratio: 4 / 3; max-height: 640px;
}
.root[data-vue="fiche"] .panel {
  height: auto; min-height: 0; max-height: none; min-width: 0;
}
.root[data-vue="fiche"] .panes {
  flex: none;
  height: auto; min-height: 0; max-height: none; min-width: 0;
  max-width: 100%;
  
  overflow: clip visible;
}
.root[data-vue="fiche"] .linerow,
.root[data-vue="fiche"] .fontpick,
.root[data-vue="fiche"] .cards,
.root[data-vue="fiche"] .finishes {
  overflow-x: auto; scrollbar-width: none; min-width: 0;
}
.root[data-vue="fiche"] .linerow::-webkit-scrollbar,
.root[data-vue="fiche"] .fontpick::-webkit-scrollbar,
.root[data-vue="fiche"] .cards::-webkit-scrollbar,
.root[data-vue="fiche"] .finishes::-webkit-scrollbar { display: none; }
.root[data-vue="fiche"] .handle { display: none; }
.root[data-vue="fiche"] .pricebar { flex: none; max-height: none; overflow: visible; }

@media (min-width: 900px) {
.root[data-vue="fiche"]:not([data-theme="comptoir"]):not([data-theme="atelier-fabrication"]):not([data-theme="la-lettre"]) .preview-wrap {
    
    inset: auto;
    position: sticky; top: 12px;
    
    height: fit-content; min-height: 0;
  }
}

@media (max-width: 899px) {
.root[data-vue="fiche"] .preview-wrap { position: relative; }
.root[data-vue="fiche"] .stage { height: auto; aspect-ratio: 4 / 3; }
}

`;
