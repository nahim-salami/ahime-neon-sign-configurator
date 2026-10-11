/**
 * GÉOMÉTRIE RÉELLE du néon — de la forme des lettres (ou d'un logo) vers les
 * TRAJETS DE TUBE et les CONTOURS DE PLAQUE, comme en fabrication.
 *
 * Principe (identique au métier du plieur de néon) : on part de la silhouette
 * de la lettre, on en extrait la LIGNE MÉDIANE (le tube suit l'axe du trait,
 * pas son contour), puis on plie le tube le long de cette ligne.
 *
 * Pipeline : rastérisation (police réelle déjà chargée / image du logo) →
 * squelettisation Zhang-Suen → traçage en polylignes → simplification
 * Douglas-Peucker. En parallèle : traçage du contour (Moore) dilaté pour la
 * découpe de la plaque (contour / à-la-lettre).
 *
 * Tout est rendu en PIXELS de la rastérisation + un facteur `pxPerCm` : le
 * consommateur (three-view) convertit en mètres à l'échelle réelle.
 *
 * NOTE : ce module sert au RENDU 3D uniquement. Le PRIX reste calculé par
 * @neon/core sur le manifeste de métriques (parité JS/PHP verrouillée) — on ne
 * change pas la tarification en changeant le visuel.
 */

import type { FontMetricsManifest } from '@neon/core';

export interface GeomLine {
  text: string;
  cssFamily: string;
  fontWeight: number;
  fontId: string;
}

export type Polyline = Array<[number, number]>;

export interface NeonGeometry {
  /** Trajets de tube (ligne médiane des traits), en px. */
  strokes: Polyline[];
  /** Contour de la silhouette dilatée — plaque « contour ». */
  contourOutline: Polyline[];
  /** Contours serrés par lettre — plaque « à la lettre ». */
  letterOutlines: Polyline[];
  /**
   * CONTOURS DES GLYPHES EUX-MÊMES, sans aucune dilatation.
   *
   * ── POURQUOI CE N'EST PAS `letterOutlines` ──────────────────────────────
   *
   * `letterOutlines` est un contour de DÉCOUPE : la silhouette gonflée du
   * rayon du tube plus 4 mm, pour qu'une plaque « à la lettre » laisse passer
   * le néon posé dessus. Sur un « ABC » en Poppins à 20 cm, cette dilatation
   * SOUDE les trois lettres en une seule masse — constaté à l'écran le
   * 3 septembre 2026 (docs/43 §69).
   *
   * Une lettre boîtier n'est pas une plaque de support : c'est la lettre
   * elle-même, pliée en coque. Elle a besoin du contour du glyphe, au trait
   * près.
   *
   * Même masque, même transformée de distance, une simplification plus fine :
   * ces contours servent à extruder un volume qu'on regarde de près, là où une
   * découpe se juge à la tolérance de la machine.
   */
  glyphOutlines: Polyline[];
  widthPx: number;
  heightPx: number;
  /** Boîte englobante de l'encre dans le masque (le DESSIN réel, sans la marge
   *  de rastérisation) — sert aux cotes, au support et au cadrage caméra. */
  ink: { x0: number; y0: number; w: number; h: number };
  pxPerCm: number;
  /** Longueur totale des trajets (m) — indicative, sert de contrôle visuel. */
  tubeLengthM: number;
  /**
   * À QUEL MOT CHAQUE TRAJET APPARTIENT — `null` quand on ne sait pas.
   *
   * La 3D ne recevait qu'UNE couleur pour toute la pièce : un néon de deux
   * lignes de deux couleurs s'y affichait d'une seule, et personne ne l'avait
   * signalé. Depuis qu'un MOT peut porter la sienne, il fallait trancher —
   * soit la 3D apprend d'où vient chaque tube, soit elle ment un peu plus.
   *
   * Le masque, lui, ne garde aucune trace des mots : il est rastérisé d'un
   * bloc. On rattache donc après coup, en comparant le milieu de chaque
   * trajet aux boîtes des mots relevées à la rastérisation.
   */
  strokeMots?: Array<{ ligne: number; mot: number } | null>;
}

/** La boîte d'un mot dans le masque, relevée à la rastérisation. */
export interface BoiteMot {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ligne: number;
  mot: number;
}

interface Mask {
  data: Uint8Array; // 1 = encre
  w: number;
  h: number;
}

/** Résolution cible de la rastérisation (le plus grand côté). Compromis
 *  précision / temps de calcul : ~480 px donne un tube lisse en < 150 ms. */
const TARGET_PX = 480;

/**
 * RÉSOLUTION MAXIMALE DE RASTÉRISATION, en pixels par centimètre.
 *
 * ── LE PLANTAGE QU'ELLE ÉVITE ──────────────────────────────────────────────
 *
 * `TARGET_PX` vise le plus grand côté du dessin. Sur un texte d'UNE lettre, la
 * lettre occupe seule toute la cible : la résolution par centimètre double.
 * Mesuré le 4 septembre 2026 — « B » en Poppins Bold à 20 cm montait à
 * **24 px/cm**, contre 12,8 pour « BB » et 8 pour un mot ordinaire.
 *
 * À cette densité, l'amincissement de Zhang-Suen sur un trait gras et lissé
 * produit des motifs en damier : le squelette part en **10 065 fragments** de
 * trois points, là où le même « B » dans « BB » en donne 98. Le recousage des
 * brins, qui compare les fragments deux à deux, s'y noie — et l'onglet meurt
 * sans message : « Target crashed ».
 *
 * Un client qui tape une initiale est un cas parfaitement ordinaire.
 *
 * ── POURQUOI 16, ET POURQUOI CE N'EST PAS UNE PERTE ────────────────────────
 *
 * Le détail utile est borné par le TUBE, pas par le canevas : à 16 px/cm, un
 * tube de 10 mm fait 16 pixels de diamètre, et son axe se place au demi-pixel.
 * Rastériser plus fin ne décrit pas mieux un objet qu'on plie à la main.
 *
 * Les cas ordinaires ne bougent pas — ils tournent entre 8 et 13 px/cm, sous
 * le plafond. Seule la lettre isolée redescend, et elle redescend au niveau
 * qu'elle aurait dans un mot.
 *
 * ── CE QUE CELA NE TOUCHE PAS ──────────────────────────────────────────────
 *
 * **Aucun prix.** La longueur facturée vient du manifeste
 * (`measureConfiguration`), jamais de cette géométrie — dont le `tubeLengthM`
 * est documenté « indicatif, sert de contrôle visuel ».
 */
const PX_PAR_CM_MAX = 16;

// ---------------------------------------------------------------------------
// 1. Rastérisation
// ---------------------------------------------------------------------------

function maskFromCanvas(canvas: HTMLCanvasElement): Mask | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < data.length; i++, p += 4) {
    data[i] = img[p]! > 128 ? 1 : 0;
  }
  return { data, w, h };
}

/** Rastérise les lignes de texte dans leur police réelle, à l'échelle demandée. */
function rasterizeText(
  lines: GeomLine[],
  letterHeightCm: number,
  manifests: Record<string, FontMetricsManifest>,
): { mask: Mask; pxPerCm: number; mots: BoiteMot[] } | null {
  const visible = lines.filter((l) => l.text.trim() !== '');
  if (visible.length === 0) return null;

  // Échelle : le plus grand côté ≈ TARGET_PX.
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;

  const fontSizeFor = (l: GeomLine, letterHeightPx: number) => {
    const m = manifests[l.fontId];
    const ratio = m ? m.capHeight / m.unitsPerEm : 0.7; // capHeight / em
    return letterHeightPx / ratio;
  };

  // Première passe à échelle 1 cm = 10 px pour connaître les proportions.
  let pxPerCm = 10;
  for (let pass = 0; pass < 2; pass++) {
    const letterHeightPx = letterHeightCm * pxPerCm;
    let maxW = 0;
    for (const l of visible) {
      probe.font = `${l.fontWeight} ${fontSizeFor(l, letterHeightPx)}px ${l.cssFamily}`;
      maxW = Math.max(maxW, probe.measureText(l.text).width);
    }
    const gap = letterHeightPx * 0.35;
    const totalH = visible.length * letterHeightPx + (visible.length - 1) * gap;
    const largest = Math.max(maxW, totalH);
    if (pass === 0) pxPerCm = Math.min(PX_PAR_CM_MAX, (pxPerCm * TARGET_PX) / Math.max(largest, 1));
  }

  const letterHeightPx = letterHeightCm * pxPerCm;
  const gap = letterHeightPx * 0.35;
  const pad = Math.ceil(letterHeightPx * 0.45); // marge : descendantes + dilatation
  let maxW = 0;
  for (const l of visible) {
    probe.font = `${l.fontWeight} ${fontSizeFor(l, letterHeightPx)}px ${l.cssFamily}`;
    maxW = Math.max(maxW, probe.measureText(l.text).width);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(maxW + pad * 2);
  canvas.height = Math.ceil(visible.length * letterHeightPx + (visible.length - 1) * gap + pad * 2);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  /*
   * ON DESSINE LA LIGNE ENTIÈRE, ET ON RELÈVE LA BOÎTE DE CHAQUE MOT.
   *
   * Dessiner mot par mot changerait le crénage aux jointures — le moteur
   * de rendu ajuste les paires de lettres, et couper la chaîne casse ces
   * ajustements. Le dessin reste donc d'un bloc ; seules les BOÎTES sont
   * relevées, par mesure des préfixes.
   */
  const mots: BoiteMot[] = [];
  visible.forEach((l, i) => {
    ctx.font = `${l.fontWeight} ${fontSizeFor(l, letterHeightPx)}px ${l.cssFamily}`;
    // Ligne de base = bas de la hauteur de capitale de cette ligne.
    const baseline = pad + (i + 1) * letterHeightPx + i * gap;
    ctx.fillText(l.text, canvas.width / 2, baseline);
    const gauche = canvas.width / 2 - ctx.measureText(l.text).width / 2;
    let mot = 0;
    for (const m of l.text.matchAll(/\S+/g)) {
      const debut = m.index ?? 0;
      const x0 = gauche + ctx.measureText(l.text.slice(0, debut)).width;
      mots.push({
        x0,
        x1: x0 + ctx.measureText(m[0]).width,
        // Assez haut pour prendre les hampes, assez bas pour les jambages.
        y0: baseline - letterHeightPx * 1.25,
        y1: baseline + letterHeightPx * 0.4,
        ligne: i,
        mot: mot++,
      });
    }
  });

  const mask = maskFromCanvas(canvas);
  return mask ? { mask, pxPerCm, mots } : null;
}

/** Rastérise une image (logo SVG déjà chargée) à la hauteur réelle demandée. */
/**
 * BUDGET DE RASTÉRISATION D'UNE IMAGE, en pixels du plus grand côté.
 *
 * ── POURQUOI CE N'EST PLUS `TARGET_PX` ─────────────────────────────────────
 *
 * `TARGET_PX` vaut 480 et vise le plus grand côté. Sur un texte, c'est le bon
 * compromis : la police est redessinée à la demande, et 480 px décrivent un mot
 * largement assez. Sur un LOGO, non — parce qu'un logo n'est pas fait d'un seul
 * corps de texte. Celui d'un client, mesuré le 7 septembre 2026 : deux lignes,
 * dont la seconde tient dans un tiers de la hauteur. Ramenée à 480 px de large,
 * elle ne faisait plus que 52 pixels de haut, ses lettres 35, leurs traits 6, et
 * l'œil du « e » TROIS. À trois pixels, le lissage referme la contreforme, la
 * lettre devient un pâté, son squelette un moignon — et l'élagage des barbules,
 * qui retire jusqu'à 1 cm, emporte le moignon. « Together » sortait en
 * « t‑h‑—‑— » : des jambages sans lettres.
 *
 * Le détail utile ne vient pas d'un nombre rond mais de DEUX bornes réelles :
 *
 * — **la source**. On ne rastérise jamais plus fin que le fichier du client :
 *   agrandir un JPEG n'y ajoute pas de dessin, seulement du temps de calcul.
 * — **le tube**, par `PX_PAR_CM_MAX`. Au-delà de 16 px/cm, on décrit au
 *   dixième de millimètre un objet qu'on plie à la main — et l'amincissement
 *   part en damier (voir la note de cette constante).
 *
 * 900 px est le plafond de calcul entre les deux : sur ce logo il rend la
 * source intacte (861 px), soit 8,3 px/cm à 33 cm de haut au lieu de 4,6.
 */
const BUDGET_LOGO_PX = 900;

function rasterizeImage(img: HTMLImageElement, heightCm: number): { mask: Mask; pxPerCm: number } | null {
  const aspect = img.width / Math.max(img.height, 1);
  const source = Math.min(1, BUDGET_LOGO_PX / Math.max(img.width, img.height, 1));
  let hPx = Math.max(1, img.height * source);
  let pxPerCm = hPx / Math.max(heightCm, 1);
  // Le plafond du tube : une petite pièce ne se décrit pas plus finement qu'une
  // grande, elle porte simplement moins de détail.
  if (pxPerCm > PX_PAR_CM_MAX) {
    pxPerCm = PX_PAR_CM_MAX;
    hPx = PX_PAR_CM_MAX * Math.max(heightCm, 1);
  }
  const wPx = hPx * aspect;
  const pad = Math.ceil(hPx * 0.12);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(wPx + pad * 2);
  canvas.height = Math.ceil(hPx + pad * 2);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, pad, pad, wPx, hPx);
  const mask = maskFromCanvas(canvas);
  return mask ? { mask, pxPerCm } : null;
}

// ---------------------------------------------------------------------------
// 2. Squelettisation (Zhang-Suen) — la ligne médiane du trait
// ---------------------------------------------------------------------------

/** Flou-seuil séparable : arrondit les bords en escalier du rendu de police. */
function smoothMask(src: Mask, radius: number): Mask {
  const r = Math.max(1, Math.round(radius));
  const { w, h } = src;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const win = r * 2 + 1;
  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src.data[row + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      const add = src.data[row + Math.min(w - 1, x + r + 1)]!;
      const sub = src.data[row + Math.max(0, x - r)]!;
      acc += add - sub;
    }
  }
  // Vertical + seuil.
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win >= 0.5 ? 1 : 0;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return { data: out, w, h };
}

/**
 * Élagage des BARBULES du squelette : les petites branches parasites nées de la
 * squelettisation sont supprimées sur le GRAPHE (pas après traçage), sinon on
 * ouvrirait des trous au milieu des lettres.
 */
function pruneSpurs(skel: Mask, maxLenPx: number, rounds = 3): Mask {
  const { w, h } = skel;
  const data = Uint8Array.from(skel.data);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  const degree = (x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of N8) if (on(x + dx, y + dy)) n++;
    return n;
  };
  for (let round = 0; round < rounds; round++) {
    const doomed: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!on(x, y) || degree(x, y) !== 1) continue;
        // Remonte la branche jusqu'à un embranchement.
        const path: Array<[number, number]> = [[x, y]];
        let cx = x;
        let cy = y;
        let prevX = -1;
        let prevY = -1;
        while (path.length <= maxLenPx + 1) {
          let nx = -1;
          let ny = -1;
          for (const [dx, dy] of N8) {
            const tx = cx + dx;
            const ty = cy + dy;
            if (on(tx, ty) && !(tx === prevX && ty === prevY)) {
              nx = tx;
              ny = ty;
              break;
            }
          }
          if (nx < 0) break;
          if (degree(nx, ny) > 2) {
            // Barbule confirmée : assez courte et rattachée à un embranchement.
            for (const [px, py] of path) doomed.push(py * w + px);
            break;
          }
          prevX = cx;
          prevY = cy;
          cx = nx;
          cy = ny;
          path.push([cx, cy]);
        }
      }
    }
    if (doomed.length === 0) break;
    for (const i of doomed) data[i] = 0;
  }
  return { data, w, h };
}

function thinZhangSuen(src: Mask): Mask {
  const { w, h } = src;
  const data = Uint8Array.from(src.data);
  // Chemin chaud : AUCUNE allocation dans la boucle (les voisins sont lus
  // directement) — sinon quelques dizaines de millions de tableaux de 8.
  const toRemove = new Int32Array(w * h);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 40) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      let n = 0;
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const i = row + x;
          if (data[i] === 0) continue;
          const p2 = data[i - w]!;        // N
          const p3 = data[i - w + 1]!;    // NE
          const p4 = data[i + 1]!;        // E
          const p5 = data[i + w + 1]!;    // SE
          const p6 = data[i + w]!;        // S
          const p7 = data[i + w - 1]!;    // SO
          const p8 = data[i - 1]!;        // O
          const p9 = data[i - w - 1]!;    // NO
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          let a = 0;
          if (p2 === 0 && p3 === 1) a++;
          if (p3 === 0 && p4 === 1) a++;
          if (p4 === 0 && p5 === 1) a++;
          if (p5 === 0 && p6 === 1) a++;
          if (p6 === 0 && p7 === 1) a++;
          if (p7 === 0 && p8 === 1) a++;
          if (p8 === 0 && p9 === 1) a++;
          if (p9 === 0 && p2 === 1) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          toRemove[n++] = i;
        }
      }
      if (n > 0) {
        changed = true;
        for (let k = 0; k < n; k++) data[toRemove[k]!] = 0;
      }
    }
  }
  return { data, w, h };
}

// ---------------------------------------------------------------------------
// 3. Traçage du squelette en polylignes
// ---------------------------------------------------------------------------

const N8: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function tracePolylines(skel: Mask): Polyline[] {
  const { data, w, h } = skel;
  const idx = (x: number, y: number) => y * w + x;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[idx(x, y)] === 1;
  const visited = new Uint8Array(w * h);
  const neighbours = (x: number, y: number) => N8.filter(([dx, dy]) => on(x + dx, y + dy)).map(([dx, dy]) => [x + dx, y + dy] as [number, number]);
  const degree = (x: number, y: number) => neighbours(x, y).length;

  const walk = (sx: number, sy: number, firstStep?: [number, number]): Polyline => {
    const pts: Polyline = [[sx, sy]];
    visited[idx(sx, sy)] = 1;
    let cur: [number, number] = firstStep ?? [sx, sy];
    if (firstStep) {
      pts.push(firstStep);
      visited[idx(firstStep[0], firstStep[1])] = 1;
    }
    for (;;) {
      const [cx, cy] = cur;
      const next = neighbours(cx, cy).find(([nx, ny]) => !visited[idx(nx, ny)]);
      if (!next) break;
      visited[idx(next[0], next[1])] = 1;
      pts.push(next);
      cur = next;
      // On s'arrête aux embranchements : chaque branche devient son propre trajet.
      if (degree(next[0], next[1]) > 2) break;
    }
    return pts;
  };

  const out: Polyline[] = [];
  // a) départs aux extrémités et aux embranchements.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y) || visited[idx(x, y)]) continue;
      const d = degree(x, y);
      if (d === 1 || d > 2) {
        if (d > 2) {
          // Une polyligne par branche non visitée.
          visited[idx(x, y)] = 1;
          for (const nb of neighbours(x, y)) {
            if (visited[idx(nb[0], nb[1])]) continue;
            out.push(walk(x, y, nb));
          }
        } else {
          out.push(walk(x, y));
        }
      }
    }
  }
  // b) boucles fermées restantes (« O », « 0 »…).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y) && !visited[idx(x, y)]) {
        const loop = walk(x, y);
        /*
         * ON NE REFERME QUE CE QUI EST REVENU AU POINT DE DÉPART.
         *
         * `loop.push(loop[0])` était inconditionnel. Or `walk` ne fait pas
         * toujours le tour : il s'arrête au premier EMBRANCHEMENT rencontré
         * (`degree > 2`), et il s'arrête aussi quand tous les voisins sont
         * déjà vus. Refermer un arc qui s'est arrêté en route ne trace pas une
         * boucle — cela tire une CORDE d'un bout à l'autre, en travers de la
         * contreforme.
         *
         * Mesuré le 7 septembre 2026 sur le logo « démo » d'un client :
         * le « O » rendait un brin de 80 points dont le dernier pas faisait
         * 55 px, et le « e » un autre de 18 px. À l'écran, une barre oblique
         * en travers de chaque lettre ronde — la première lettre de la marque.
         *
         * Le tour complet revient FORCÉMENT à un voisin du départ : sur un
         * squelette 8-connexe, à √2 pixel près. Au-delà, la marche s'est
         * arrêtée ailleurs, le reste de l'anneau sera tracé au tour suivant de
         * cette même boucle, et `mergeStrokes` recoudra les morceaux — ce
         * qu'il ne pouvait pas faire tant qu'une corde tenait les deux bouts.
         */
        const debut = loop[0]!;
        const fin = loop[loop.length - 1]!;
        if (loop.length > 3 && Math.hypot(fin[0] - debut[0], fin[1] - debut[1]) <= 1.5) {
          loop.push(debut); // referme la boucle
        }
        out.push(loop);
      }
    }
  }
  return out.filter((p) => p.length >= 2);
}

// ---------------------------------------------------------------------------
// 3 bis. Recousage des brins
// ---------------------------------------------------------------------------

/**
 * Fusionne les brins qui se prolongent l'un l'autre aux embranchements.
 *
 * Le traceur coupe à CHAQUE croisement : un « Hello » cursif ressort en
 * dizaines de petits morceaux, et chaque morceau dessiné séparément montre
 * ses bouts — le tube semble rapiécé. Un artisan, lui, plie UN tube qui
 * traverse les croisements et passe par-dessus lui-même.
 *
 * On refait son geste : à chaque nœud, les deux brins dont les tangentes se
 * prolongent le mieux (la continuation la plus droite) sont cousus en un seul
 * trajet, et on itère jusqu'à ce que plus rien ne se couse. Les brins qui
 * arrivent au nœud de biais restent séparés — comme le vrai tube qui, lui
 * aussi, s'arrête en butée contre un autre.
 */
function mergeStrokes(strokes: Polyline[]): Polyline[] {
  const TOL = 2.2; // px : deux extrémités à moins de ~2 px partagent un nœud
  // Seuil volontairement tolérant (~75°) : les points du squelette suivent des
  // marches d'escalier, la tangente mesurée est bruitée. Le MEILLEUR candidat
  // gagne de toute façon — le seuil n'écarte que les butées franches en T.
  const MIN_DOT = 0.25;
  const merged = strokes.map((p) => p.slice());

  /** Direction SORTANTE à une extrémité, moyennée sur quelques points. */
  const endDir = (p: Polyline, atStart: boolean): [number, number] => {
    const k = Math.min(7, p.length - 1);
    const a = atStart ? p[0]! : p[p.length - 1]!;
    const b = atStart ? p[k]! : p[p.length - 1 - k]!;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (const iStart of [true, false]) {
        const pi = merged[i]!;
        const first = pi[0]!;
        const last = pi[pi.length - 1]!;
        // Une boucle fermée n'a rien à coudre.
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < TOL && pi.length > 6) continue;
        const ei = iStart ? first : last;
        let best = -1;
        let bestStart = false;
        let bestDot = MIN_DOT;
        for (let j = 0; j < merged.length; j++) {
          if (i === j) continue;
          const pj = merged[j]!;
          for (const jStart of [true, false]) {
            const ej = jStart ? pj[0]! : pj[pj.length - 1]!;
            if (Math.hypot(ei[0] - ej[0], ei[1] - ej[1]) > TOL) continue;
            const di = endDir(pi, iStart);
            const dj = endDir(pj, jStart);
            // Directions opposées = le trajet continue tout droit.
            const dot = -(di[0] * dj[0] + di[1] * dj[1]);
            if (dot > bestDot) {
              bestDot = dot;
              best = j;
              bestStart = jStart;
            }
          }
        }
        if (best >= 0) {
          const pj = merged[best]!;
          const a = iStart ? pi.slice().reverse() : pi.slice();
          const b = bestStart ? pj : pj.slice().reverse();
          merged[i] = a.concat(b.slice(1));
          merged.splice(best, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 4. Simplification (Douglas-Peucker)
// ---------------------------------------------------------------------------

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Lisse une polyligne par moyenne glissante sur les points INTÉRIEURS.
 *
 * Le squelette suit les pixels : il monte d'un pixel, avance d'un pixel, monte
 * encore. Cet escalier est plus long que la diagonale qu'il approche — d'où un
 * tube dessiné 5 à 11 % plus long que le tube mesuré sur le contour du glyphe.
 *
 * Les extrémités ne bougent pas : elles portent les jonctions entre brins, et
 * les déplacer ouvrirait des trous dans le tube.
 */
function smoothPolyline(points: Polyline, passes = 2): Polyline {
  if (points.length < 3) return points;
  let out = points;
  for (let k = 0; k < passes; k++) {
    const next: Polyline = [out[0]!];
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      next.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

function simplify(points: Polyline, eps: number): Polyline {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = 0;
    let maxK = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(points[k]!, points[i]!, points[j]!);
      if (d > maxD) {
        maxD = d;
        maxK = k;
      }
    }
    if (maxD > eps && maxK > 0) {
      keep[maxK] = 1;
      stack.push([i, maxK], [maxK, j]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

// ---------------------------------------------------------------------------
// 5. Contours de plaque (dilatation + suivi de frontière Moore)
// ---------------------------------------------------------------------------

/**
 * Transformée de distance euclidienne EXACTE (Felzenszwalb & Huttenlocher) —
 * distance² de chaque pixel au pixel d'encre le plus proche, en O(w·h).
 * Indispensable : une dilatation naïve serait en O(w·h·r²) (des dizaines de
 * millions d'opérations pour une marge de 1,2 cm) et bloquerait le thread.
 */
function distanceSq(src: Mask): Float64Array {
  const { data, w, h } = src;
  const INF = 1e12;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const out = new Float64Array(w * h);

  const transform1D = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) {
        k--;
        s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1]! < q) k++;
      const dv = q - v[k]!;
      d[q] = dv * dv + f[v[k]!]!;
    }
  };

  // Colonnes.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = data[y * w + x] ? 0 : INF;
    transform1D(h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
  }
  // Lignes.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = out[row + x]!;
    transform1D(w);
    for (let x = 0; x < w; x++) out[row + x] = d[x]!;
  }
  return out;
}

/** Dilatation par disque de `radius` px, via la transformée de distance. */
function dilate(src: Mask, radius: number, dsq?: Float64Array): Mask {
  if (radius <= 0) return src;
  const { w, h } = src;
  const dist = dsq ?? distanceSq(src);
  const r2 = radius * radius;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = dist[i]! <= r2 ? 1 : 0;
  return { data: out, w, h };
}

/**
 * Contours des composantes connexes (suivi de frontière Moore, sens horaire,
 * critère d'arrêt de Jacob). La garde est SERRÉE : un périmètre ne peut pas
 * dépasser ~2·(w+h)·4 pixels ; sans cela, un aller-retour entre deux pixels
 * ferait tourner la boucle des centaines de milliers de fois et figerait le
 * navigateur (constaté).
 */
function traceContours(mask: Mask, minPerimeter = 24): Polyline[] {
  const { data, w, h } = mask;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  const started = new Uint8Array(w * h); // départs déjà utilisés
  const contours: Polyline[] = [];
  const maxSteps = Math.min(8 * (w + h), 12000);

  /*
   * LE DEHORS, INONDÉ DEPUIS LES BORDS (chantier G).
   *
   * Un contour se suit dans un sens pour une silhouette, dans l'AUTRE pour un
   * trou. La convention d'ici — arrivée par le haut, recherche horaire — est
   * juste pour une silhouette et fausse pour un trou : sur le bord bas d'une
   * contreforme, elle repart dans la matière et se referme en trois pas. Un
   * anneau de 40 px donnait ainsi UN contour au lieu de deux, et vingt
   * avortons de quatre points que le filtre de périmètre effaçait.
   *
   * Reste à savoir de quel côté on est. Le voisin de gauche ne suffit pas :
   * sur un bord courbe — le « O » — le premier pixel rencontré a du vide à sa
   * gauche et le critère se trompe, ce qui explique que les « O » sortaient
   * déjà leurs trous quand les « D » et les « A » n'en sortaient aucun.
   *
   * La seule réponse fiable est topologique : le vide au-dessus du départ
   * communique-t-il avec le bord du canevas ? S'il communique, c'est le
   * dehors ; sinon, c'est un trou. Une inondation en O(n), une fois.
   */
  const dehors = new Uint8Array(w * h);
  const file: number[] = [];
  const semer = (x: number, y: number) => {
    const j = y * w + x;
    if (!dehors[j] && data[j] !== 1) { dehors[j] = 1; file.push(j); }
  };
  for (let x = 0; x < w; x++) { semer(x, 0); semer(x, h - 1); }
  for (let y = 0; y < h; y++) { semer(0, y); semer(w - 1, y); }
  while (file.length) {
    const j = file.pop()!;
    const x = j % w;
    const y = (j / w) | 0;
    if (x + 1 < w) semer(x + 1, y);
    if (x > 0) semer(x - 1, y);
    if (y + 1 < h) semer(x, y + 1);
    if (y > 0) semer(x, y - 1);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!on(x, y) || started[i]) continue;
      if (on(x, y - 1)) continue; // pixel intérieur : ce n'est pas un bord supérieur

      // Le vide juste au-dessus : dehors → silhouette, trou → contreforme.
      // Au bord haut du masque il n'y a pas de vide au-dessus, donc dehors.
      const interieur = y > 0 && !dehors[i - w];
      const contour: Polyline = [[x, y]];
      started[i] = 1;
      let cx = x;
      let cy = y;
      // On arrive par le haut : première recherche vers l'est sur une
      // silhouette, vers l'ouest sur un trou — les deux sens de rotation.
      let dir = interieur ? 3 : 7;
      let steps = 0;
      while (steps++ < maxSteps) {
        let moved = false;
        // Recherche horaire à partir de la case suivant le retour arrière ;
        // anti-horaire sur une contreforme.
        for (let k = 0; k < 8; k++) {
          const d = interieur ? ((dir + 3 - k) % 8 + 8) % 8 : (dir + 5 + k) % 8;
          const [dx, dy] = N8[d]!;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!on(nx, ny)) continue;
          cx = nx;
          cy = ny;
          dir = d;
          contour.push([nx, ny]);
          started[ny * w + nx] = 1;
          moved = true;
          break;
        }
        if (!moved) break; // pixel isolé
        // Arrêt au PREMIER retour sur le pixel de départ : garantit la
        // terminaison (le critère « même direction » de Jacob ne se déclenchait
        // pas sur les frontières en escalier → la garde était atteinte).
        if (cx === x && cy === y && steps > 2) break;
      }
      if (contour.length >= minPerimeter) contours.push(contour);
    }
  }
  return contours;
}

// ---------------------------------------------------------------------------
// 6. API
// ---------------------------------------------------------------------------

function processMask(mask: Mask, pxPerCm: number, tubeDiameterCm: number): NeonGeometry {
  // Lissage ≈ 1,5 mm : supprime les escaliers sans déformer la lettre.
  const smooth = smoothMask(mask, Math.max(1, Math.round(pxPerCm * 0.15)));
  // Squelette, puis élagage des barbules jusqu'à ~1 cm (elles viennent des
  // extrémités et des jonctions, jamais du tracé réel du tube).
  const skel = pruneSpurs(thinZhangSuen(smooth), Math.round(pxPerCm * 1.0));
  const eps = Math.max(1.2, pxPerCm * 0.12); // tolérance ≈ 1,2 mm
  const minLen = pxPerCm * 0.3; // ne reste que le bruit résiduel < 3 mm
  // Recousage AVANT lissage : les anciens nœuds deviennent des points
  // intérieurs, et le lissage les traverse — le tube coule d'un seul trait.
  const strokes = mergeStrokes(tracePolylines(skel))
    // Lissage AVANT simplification : on retire le crénelage pixel, puis on
    // allège. L'ordre inverse figerait l'escalier dans les points conservés.
    .map((p) => simplify(smoothPolyline(p, 3), eps))
    .filter((p) => {
      if (p.length < 2) return false;
      let len = 0;
      for (let i = 1; i < p.length; i++) len += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
      return len >= minLen;
    });

  const tubeR = (tubeDiameterCm / 2) * pxPerCm;
  // Une seule transformée de distance sert aux deux dilatations.
  const dsq = distanceSq(mask);
  // Plaque « contour » : silhouette + marge de 1,2 cm autour du tube.
  const contourOutline = traceContours(dilate(mask, tubeR + pxPerCm * 1.2, dsq)).map((c) => simplify(c, eps * 1.6));
  // Plaque « à la lettre » : silhouette + 0,4 cm.
  const letterOutlines = traceContours(dilate(mask, tubeR + pxPerCm * 0.4, dsq)).map((c) => simplify(c, eps * 1.2));
  /*
   * LE GLYPHE NU — aucune dilatation (E05, volet 3D).
   *
   * ── CE QUE CE CONTOUR NE RATTRAPE PAS : LA CONTREFORME DU « A » ─────────
   *
   * Mesuré le 4 septembre 2026 : « PPP », « DDD », « RRR » et « OOO » rendent
   * six contours — trois silhouettes et trois contreformes. « AAA » n'en rend
   * que trois, à 20, 40 comme 60 cm.
   *
   * Ce n'est PAS le filtre de périmètre. Le seuil a été balayé de 24 à 6 sans
   * rien changer, et à 4 il ramasse d'un coup 111 contours — tout le bruit du
   * seuillage, et toujours pas le « A ». La contreforme n'existe simplement pas
   * dans le masque : le triangle du « A » est étroit et pointu, et l'antialiasing
   * seuillé le referme.
   *
   * La corriger demande de toucher à la RASTÉRISATION.
   *
   * ── ET CE N'EST PAS UNE QUESTION DE PRIX, CONTRAIREMENT À CE QU'ON A ÉCRIT ─
   *
   * Une première rédaction concluait : « ce même masque sert à mesurer la ligne
   * médiane, donc la longueur de tube, donc le prix ». **C'est faux**, vérifié
   * le 4 septembre 2026 : la longueur facturée vient de `measureConfiguration`
   * (`packages/core/src/metrics.ts`), qui travaille sur les manifestes de
   * polices et n'ouvre aucun canvas. Le `tubeLengthM` de cette géométrie est
   * documenté deux lignes plus haut comme « indicatif, sert de contrôle
   * visuel ».
   *
   * Le blocage n'est donc pas la règle 1 mais un fait géométrique : le seuil de
   * périmètre a été balayé de 24 à 6 sans effet, et à 4 il ramasse 111 contours
   * de bruit sans récupérer le « A ». Il faudrait changer le SEUILLAGE du
   * masque, ce qui déplacerait tous les contours de toutes les lettres — un
   * vrai travail, porté au plan (docs/46).
   *
   * ── ET CE QU'IL A FALLU POUR L'OBTENIR : UNE LIGNE ──────────────────────
   *
   * Il a fallu deux jours pour voir que c'était une ligne. Le 3 septembre,
   * docs/43 §69 concluait que sortir ce contour était « un vrai travail, pas
   * un branchement » — conclusion tirée sans ouvrir la fonction voisine, alors
   * que `mask` était déjà là, deux lignes plus haut, avec sa transformée de
   * distance.
   *
   * La simplification est plus fine que celle des découpes (0,7 contre 1,2) :
   * une lettre boîtier s'extrude en volume et se regarde de près, quand un
   * contour de découpe se juge à la tolérance de la machine.
   */
  const glyphOutlines = traceContours(mask).map((c) => simplify(c, eps * 0.7));

  // Boîte englobante de l'encre.
  let ix0 = mask.w;
  let iy0 = mask.h;
  let ix1 = 0;
  let iy1 = 0;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.data[y * mask.w + x]) continue;
      if (x < ix0) ix0 = x;
      if (y < iy0) iy0 = y;
      if (x > ix1) ix1 = x;
      if (y > iy1) iy1 = y;
    }
  }
  const ink = ix1 >= ix0
    ? { x0: ix0, y0: iy0, w: ix1 - ix0 + 1, h: iy1 - iy0 + 1 }
    : { x0: 0, y0: 0, w: mask.w, h: mask.h };

  // Chaque bout de brin ouvert se termine comme chez l'artisan :
  // — un bout proche d'un AUTRE trajet est une butée : on le prolonge
  //   JUSQU'AU CONTACT, avec un léger chevauchement pour que les cylindres
  //   s'interpénètrent franchement (ni bosse plantée au hasard, ni jour
  //   entre les deux tubes) ;
  // — un bout vraiment libre est un bout de lettre : l'amincissement s'arrête
  //   un demi-trait trop tôt, on le prolonge du rayon du tube.
  const extendPx = tubeR;
  if (extendPx > 0.5) {
    /** Point le plus proche sur les autres trajets (jamais le sien). */
    const nearestOnOthers = (self: number, pt: [number, number]): { d: number; q: [number, number] } | null => {
      let best: { d: number; q: [number, number] } | null = null;
      for (let s = 0; s < strokes.length; s++) {
        if (s === self) continue;
        const poly = strokes[s]!;
        for (let i = 1; i < poly.length; i++) {
          const a = poly[i - 1]!;
          const b = poly[i]!;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2));
          const q: [number, number] = [a[0] + t * dx, a[1] + t * dy];
          const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
          if (!best || d < best.d) best = { d, q };
        }
      }
      return best;
    };
    for (let s = 0; s < strokes.length; s++) {
      const p = strokes[s]!;
      if (p.length < 2) continue;
      const [ax, ay] = p[0]!;
      const [bx, by] = p[p.length - 1]!;
      const closed = Math.hypot(bx - ax, by - ay) < extendPx;
      if (closed) continue;
      const push = (from: [number, number], to: [number, number]): [number, number] => {
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const d = Math.hypot(dx, dy);
        return d < 1e-6 ? to : [to[0] + (dx / d) * extendPx, to[1] + (dy / d) * extendPx];
      };
      for (const atStart of [true, false]) {
        const end = atStart ? p[0]! : p[p.length - 1]!;
        const near = nearestOnOthers(s, end);
        let ajout: [number, number] | null = null;
        if (near && near.d < tubeR * 3) {
          // Butée : au contact, et un tiers de rayon AU-DELÀ.
          if (near.d > 0.5) {
            const dx = near.q[0] - end[0];
            const dy = near.q[1] - end[1];
            const d = Math.hypot(dx, dy);
            ajout = [near.q[0] + (dx / d) * tubeR * 0.35, near.q[1] + (dy / d) * tubeR * 0.35];
          }
          // (déjà au contact : l'embout arrondi suffit)
        } else {
          // Bout de lettre : prolongement dans sa propre direction.
          ajout = atStart ? push(p[1]!, p[0]!) : push(p[p.length - 2]!, p[p.length - 1]!);
        }
        if (ajout) {
          if (atStart) p.unshift(ajout);
          else p.push(ajout);
        }
      }
    }
  }

  let totalPx = 0;
  for (const p of strokes) {
    for (let i = 1; i < p.length; i++) totalPx += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
  }

  return {
    strokes,
    contourOutline,
    letterOutlines,
    glyphOutlines,
    widthPx: mask.w,
    heightPx: mask.h,
    ink,
    pxPerCm,
    tubeLengthM: totalPx / pxPerCm / 100,
  };
}

/**
 * LES TRAJETS DE TUBE EN SVG — le document que l'atelier ouvre.
 *
 * Vit ici, et pas chez ses deux appelants (`logo-importe.ts` pour la commande,
 * `__probe-logo-svg.ts` pour préparer un fichier client), parce que deux
 * sérialisations du même tracé finiraient par ne plus décrire le même objet.
 *
 * ── LE REPÈRE DE CADRAGE, DEUX POINTS SANS LONGUEUR ─────────────────────────
 *
 * `loadSvgLogo` mesure la pièce par `getBBox()`, qui ignore l'épaisseur du
 * trait : la boîte rendue serait celle des LIGNES MÉDIANES, alors que l'image
 * dessinée est celle du `viewBox`, tube compris. Deux pour cent d'écart, soit
 * deux centimètres annoncés en trop sur un mètre.
 *
 * Le dernier chemin ne porte donc que deux `moveto` : `getTotalLength()` rend
 * zéro — la longueur de tube, donc le prix, ne bouge pas d'un millimètre — et
 * `getBBox()` rend l'encombrement réel.
 */
export function geometrieVersSvg(
  geo: NeonGeometry,
  traitPx: number,
): { svg: string; largeurPx: number; hauteurPx: number; medianeW: number; medianeH: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of geo.strokes) {
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) return { svg: '', largeurPx: 0, hauteurPx: 0, medianeW: 0, medianeH: 0 };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const largeur = x1 - x0;
  const hauteur = y1 - y0;
  const trait = traitPx;
  const marge = trait / 2;
  const d = (p: Polyline) =>
    p.map(([x, y], i) => `${0 === i ? 'M' : 'L'}${r2(x - x0)},${r2(y - y0)}`).join(' ');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(-marge)} ${r2(-marge)} ${r2(largeur + trait)} ${r2(hauteur + trait)}">`,
    // Le trait est BLANC : dans le configurateur, la couleur du logo pilote la
    // lueur, pas la matière. Un cœur blanc est ce que rend un tube allumé ;
    // éteint, le widget le repeint en teinte silicone.
    `<g fill="none" stroke="#ffffff" stroke-width="${r2(trait)}" stroke-linecap="round" stroke-linejoin="round">`,
    ...geo.strokes.map((p) => `<path d="${d(p)}"/>`),
    '</g>',
    `<path stroke="none" fill="none" d="M${r2(-marge)},${r2(-marge)} M${r2(largeur + marge)},${r2(hauteur + marge)}"/>`,
    '</svg>',
    '',
  ].join('\n');
  // La boîte RENDUE, tube compris — c'est elle que `getBBox()` verra, grâce au
  // repère de cadrage, et donc elle qui fixe l'échelle de la pièce.
  return { svg, largeurPx: largeur + trait, hauteurPx: hauteur + trait, medianeW: largeur, medianeH: hauteur };
}

/**
 * DEUX GÉOMÉTRIES EMPILÉES EN UNE — le texte et le logo dans la même pièce.
 *
 * Elles n'arrivent pas à la même échelle : chacune a été rastérisée pour elle
 * seule, et `pxPerCm` en sort différent (le texte suit la hauteur de lettre, le
 * logo la sienne). On les ramène donc toutes deux à la PLUS FINE des deux —
 * jamais à la plus grossière, qui perdrait des points qu'on a déjà payés en
 * temps de calcul.
 *
 * L'écart entre les deux est celui du cœur (`INTERLINE_RATIO × hauteur de
 * lettre`), passé par l'appelant : c'est lui qui entre dans la hauteur
 * facturée, et la 3D doit montrer la pièce qu'on vend.
 *
 * Ce que cette composition NE fait pas : réunir les deux contours de plaque en
 * une seule silhouette. Elle les juxtapose, ce qui donne deux découpes là où
 * l'atelier n'en ferait qu'une sur une plaque « contour ». Visible seulement en
 * 3D, sans effet sur le prix (la surface du support vient de `pricing.ts`, à
 * partir des cotes) — noté dans docs/50.
 */
export function composerGeometries(
  haut: NeonGeometry,
  bas: NeonGeometry,
  ecartCm: number,
): NeonGeometry {
  const pxPerCm = Math.max(haut.pxPerCm, bas.pxPerCm);
  const pad = Math.round(pxPerCm); // 1 cm de marge, comme les rastérisations

  const poser = (g: NeonGeometry, dx: number, dy: number) => {
    const f = pxPerCm / g.pxPerCm;
    const t = (p: Polyline): Polyline =>
      p.map(([x, y]) => [(x - g.ink.x0) * f + dx, (y - g.ink.y0) * f + dy] as [number, number]);
    return {
      strokes: g.strokes.map(t),
      contourOutline: g.contourOutline.map(t),
      letterOutlines: g.letterOutlines.map(t),
      glyphOutlines: g.glyphOutlines.map(t),
      w: g.ink.w * f,
      h: g.ink.h * f,
    };
  };

  const wHaut = (haut.ink.w * pxPerCm) / haut.pxPerCm;
  const wBas = (bas.ink.w * pxPerCm) / bas.pxPerCm;
  const hHaut = (haut.ink.h * pxPerCm) / haut.pxPerCm;
  const largeur = Math.max(wHaut, wBas);
  const ecartPx = ecartCm * pxPerCm;

  // Centrées l'une sur l'autre : c'est la composition que montre la 2D, et la
  // seule qui ne demande pas au client de rattraper un décalage.
  const a = poser(haut, pad + (largeur - wHaut) / 2, pad);
  const b = poser(bas, pad + (largeur - wBas) / 2, pad + hHaut + ecartPx);
  const hauteur = hHaut + ecartPx + b.h;

  return {
    strokes: [...a.strokes, ...b.strokes],
    // Les étiquettes de mot suivent leurs trajets : celles du LOGO n'existent
    // pas (un dessin n'a pas de mots), et valent donc `null`.
    strokeMots: [
      ...haut.strokes.map((_, i) => haut.strokeMots?.[i] ?? null),
      ...bas.strokes.map((_, i) => bas.strokeMots?.[i] ?? null),
    ],
    contourOutline: [...a.contourOutline, ...b.contourOutline],
    letterOutlines: [...a.letterOutlines, ...b.letterOutlines],
    glyphOutlines: [...a.glyphOutlines, ...b.glyphOutlines],
    widthPx: Math.ceil(largeur + pad * 2),
    heightPx: Math.ceil(hauteur + pad * 2),
    ink: { x0: pad, y0: pad, w: largeur, h: hauteur },
    pxPerCm,
    // Un seul tube plié plus long : les deux longueurs s'ajoutent, exactement
    // comme dans `measureConfiguration`.
    tubeLengthM: haut.tubeLengthM + bas.tubeLengthM,
  };
}

/** Géométrie réelle d'un néon TEXTE. Les polices doivent être chargées. */
export function buildTextGeometry(
  lines: GeomLine[],
  letterHeightCm: number,
  manifests: Record<string, FontMetricsManifest>,
  tubeDiameterCm = 1,
): NeonGeometry | null {
  const r = rasterizeText(lines, letterHeightCm, manifests);
  if (!r) return null;
  const geo = processMask(r.mask, r.pxPerCm, tubeDiameterCm);
  return geo ? { ...geo, strokeMots: rattacherLesTraitsAuxMots(geo.strokes, r.mots) } : null;
}

/**
 * DE QUEL MOT VIENT CHAQUE TRAJET.
 *
 * Le masque est rastérisé d'un bloc : il ne garde aucune trace des mots. On
 * rattache donc après coup, en comparant le MILIEU de chaque trajet aux boîtes
 * relevées au dessin.
 *
 * Le milieu, et non le premier point : un trajet recousu par `mergeStrokes`
 * peut commencer sur la queue d'une lettre et finir sur la suivante, et son
 * point de départ n'est alors representatif de rien.
 *
 * Hors de toute boîte — cela arrive à un accent ou à un point d'exclamation
 * isolé, dont la boîte est étroite — on prend la plus proche EN X à l'intérieur
 * de la même bande de ligne. Faute de quoi `null` : la 3D retombera sur la
 * couleur de la pièce, ce qui est le comportement d'avant.
 */
export function rattacherLesTraitsAuxMots(
  strokes: Polyline[],
  mots: BoiteMot[],
): Array<{ ligne: number; mot: number } | null> {
  if (0 === mots.length) return strokes.map(() => null);
  return strokes.map((p) => {
    if (0 === p.length) return null;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of p) {
      sx += x;
      sy += y;
    }
    const cx = sx / p.length;
    const cy = sy / p.length;
    const dansLaBande = mots.filter((m) => cy >= m.y0 && cy <= m.y1);
    const candidats = dansLaBande.length ? dansLaBande : mots;
    const dedans = candidats.find((m) => cx >= m.x0 && cx <= m.x1);
    if (dedans) return { ligne: dedans.ligne, mot: dedans.mot };
    let proche = candidats[0]!;
    let best = Infinity;
    for (const m of candidats) {
      const d = cx < m.x0 ? m.x0 - cx : cx > m.x1 ? cx - m.x1 : 0;
      if (d < best) {
        best = d;
        proche = m;
      }
    }
    return { ligne: proche.ligne, mot: proche.mot };
  });
}

/** Exposé pour le banc d'essai Node (__probe-geometry.ts) — pas d'usage runtime. */
// `processMask` est exposé pour que les bancs d'essai mesurent LA chaîne, et
// non une reconstitution. Un banc qui réenchaîne les primitives à la main omet
// tôt ou tard une étape — le recousage, le filtre des brins courts — et rend
// des chiffres qui n'ont rien à voir avec ce que voit le client.
export const __internals = { thinZhangSuen, distanceSq, dilate, traceContours, tracePolylines, simplify, smoothMask, pruneSpurs, mergeStrokes, processMask };

/** Géométrie réelle d'un néon LOGO (image déjà chargée). */
export function buildLogoGeometry(
  img: HTMLImageElement,
  heightCm: number,
  tubeDiameterCm = 1,
): NeonGeometry | null {
  const r = rasterizeImage(img, heightCm);
  return r ? processMask(r.mask, r.pxPerCm, tubeDiameterCm) : null;
}
