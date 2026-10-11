/**
 * Capture du design néon — dessin DIRECT sur canvas (mêmes polices, même halo
 * que l'aperçu) : sert à la fois de preuve jointe au panier (fond sombre) et
 * de texture émissive pour la vue 3D (fond transparent).
 */

export interface CaptureLine {
  text: string;
  cssFamily: string;
  fontWeight: number;
  colorHex: string;
  /**
   * Couleur du tube ÉTEINT, MESURÉE sur photo par le marchand (écart E02).
   *
   * Absente, la capture la calcule en délavant `colorHex` — approximation
   * honnête, mais le silicone d'un fournisseur donné a sa teinte propre, et une
   * photo vaut mieux que n'importe quelle formule.
   */
  offHex?: string;
  /**
   * Couleur — et aspect éteint — MOT PAR MOT, dans l'ordre des mots du texte.
   *
   * Le panier, le devis et le bon à tirer partent avec ces images : sans ce
   * détail, un client qui a demandé « OPEN » en rose et « BAR » en vert
   * recevrait une confirmation où tout est rose. Absent, ou sans aucun
   * `colorHex`, la ligne se dessine d'un bloc comme avant.
   */
  wordColors?: Array<{ colorHex?: string; offHex?: string } | undefined>;
  offsetXCm?: number;
  offsetYCm?: number;
}

/** Un morceau de ligne à peindre : son texte, son centre, ses deux couleurs. */
interface MorceauDeLigne {
  texte: string;
  x: number;
  colorHex: string;
  offHex?: string;
}

/**
 * DÉCOUPE UNE LIGNE EN MORCEAUX DE MÊME COULEUR.
 *
 * Tant que les mots partagent la couleur de la ligne, on rend UN seul morceau
 * — le texte entier, dessiné d'un trait comme il l'a toujours été. Découper
 * systématiquement ferait dériver le crénage entre les mots, et changerait
 * l'image de toutes les commandes d'une seule couleur pour rien.
 *
 * Les abscisses se déduisent des largeurs de préfixe : `textAlign` vaut
 * `center`, donc le bord gauche est à `x − largeur/2`, et chaque mot se centre
 * sur ce que le texte qui le précède a déjà consommé. La police doit être
 * posée sur le contexte AVANT l'appel.
 */
export function morceauxDeLigne(ctx: CanvasRenderingContext2D, l: CaptureLine, x: number): MorceauDeLigne[] {
  if (!l.wordColors?.some((m) => m?.colorHex)) return [{ texte: l.text, x, colorHex: l.colorHex, offHex: l.offHex }];
  const gauche = x - ctx.measureText(l.text).width / 2;
  const out: MorceauDeLigne[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while (null !== (m = re.exec(l.text))) {
    const propre = l.wordColors[i]?.colorHex;
    out.push({
      texte: m[0],
      x: gauche + ctx.measureText(l.text.slice(0, m.index)).width + ctx.measureText(m[0]).width / 2,
      colorHex: propre || l.colorHex,
      // L'aspect éteint MESURÉ de la ligne décrit SA bobine : il ne vaut pas
      // pour un mot qui en emploie une autre. Sans mesure propre, la capture
      // délave la couleur du mot, comme elle le fait pour une ligne sans
      // catalogue.
      offHex: propre ? l.wordColors[i]?.offHex : l.offHex,
    });
    i += 1;
  }
  return out;
}

/**
 * Support à dessiner derrière le néon, dans les mêmes proportions réelles que
 * la vue 2D et la 3D.
 *  - `cut`  : découpe suivant la lettre (contour / à-la-lettre) — obtenue par un
 *             tracé de texte épais, exactement comme le `-webkit-text-stroke`
 *             de l'aperçu 2D.
 *  - `rect` : plaque rectangulaire (ou caisson) à coins arrondis.
 */
export interface CapturePlate {
  kind: 'none' | 'cut' | 'rect';
  /** Dilatation de la silhouette, en cm (rayon du tube + marge de découpe). */
  dilateCm: number;
  /** Marge autour du dessin pour une plaque rectangulaire, en cm. */
  marginCm: number;
  fill: string;
  /** Couleur de la TRANCHE (arête) de la plaque — la rend lisible sous le halo. */
  edge: string;
  /** Hauteur de lettre réelle (cm) — donne l'échelle cm → px du canvas. */
  letterHeightCm: number;
}

/**
 * LE TUBE ÉTEINT, EN CANVAS — le même mélange que `offStyle` de l'aperçu.
 *
 * Un néon rose éteint n'est pas gris : le silicone reste teinté par son
 * pigment. L'aperçu 2D obtient ça avec `color-mix(in srgb, couleur 14 %,
 * #edeff2)` pour le corps et 28 % de #c3c8cf pour la paroi ; le canvas n'a pas
 * `color-mix`, on refait donc l'interpolation à la main — dans le MÊME espace
 * sRGB, sur les composantes encodées, sinon les deux images ne coïncident pas.
 *
 * Ces deux constantes sont la seule chose à garder synchronisée avec
 * `NeonConfigurator.tsx` ; `capture-eteinte.test.ts` le vérifie.
 */
const CORPS_ETEINT = '#edeff2';
const PAROI_ETEINTE = '#c3c8cf';

/** `#rrggbb` → [r, g, b]. Rend null sur tout ce qui n'est pas un hex à 6. */
function hexVersRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Équivalent de `color-mix(in srgb, a part%, b)` — interpolation composante à composante. */
export function melangeSrgb(a: string, part: number, b: string): string {
  const ca = hexVersRgb(a);
  const cb = hexVersRgb(b);
  if (!ca || !cb) return b;
  const t = Math.min(1, Math.max(0, part));
  const v = ca.map((x, i) => Math.round(x * t + cb[i]! * (1 - t)));
  return `#${v.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Dessine le néon sur un canvas.
 *
 * @param transparent Texture 3D (pas de fond).
 * @param lit         Tube allumé. `false` rend l'image ÉTEINTE — celle qui dit
 *                    au client à quoi ressemble l'objet le jour, éteint sur son
 *                    mur, et qui évite la déception la plus fréquente du métier.
 */
/**
 * PIXELS DE CANVAS PAR HAUTEUR DE LETTRE.
 *
 * C'est ce nombre qui donne l'échelle de la capture : `pxParCm = 84 /
 * letterHeightCm`. Il était écrit en dur dans la fonction, ce qui allait tant
 * que personne d'autre n'en avait besoin — mais le mockup sur photo (B30) doit
 * savoir combien de centimètres couvre le canvas pour le poser à la bonne
 * taille, et recopier le 84 chez lui aurait donné deux vérités à faire diverger.
 */
export const CAPTURE_PX_PAR_LETTRE = 84;

export function captureNeonCanvas(
  lines: CaptureLine[],
  transparent = false,
  plate?: CapturePlate,
  lit = true,
): HTMLCanvasElement | null {
  try {
    const visible = lines.filter((l) => l.text.trim() !== '');
    if (visible.length === 0) return null;
    const PX = CAPTURE_PX_PAR_LETTRE;
    const GAP = PX * 0.35;
    // Échelle réelle du canvas + marge suffisante pour la plaque.
    const pxPerCm = plate && plate.letterHeightCm > 0 ? PX / plate.letterHeightCm : 0;
    const plateExtraPx = plate
      ? (plate.kind === 'cut' ? plate.dilateCm : plate.kind === 'rect' ? plate.marginCm : 0) * pxPerCm
      : 0;
    const PAD = PX * 0.9 + plateExtraPx;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let width = 0;
    for (const l of visible) {
      ctx.font = `${l.fontWeight} ${PX}px ${l.cssFamily}`;
      width = Math.max(width, ctx.measureText(l.text).width);
    }
    const minX = Math.min(0, ...visible.map((line) => line.offsetXCm ?? 0));
    const maxX = Math.max(0, ...visible.map((line) => line.offsetXCm ?? 0));
    const minY = Math.min(0, ...visible.map((line) => line.offsetYCm ?? 0));
    const maxY = Math.max(0, ...visible.map((line) => line.offsetYCm ?? 0));
    const offsetScale = pxPerCm || PX / 18;
    canvas.width = Math.ceil(width + PAD * 2 + (maxX - minX) * offsetScale);
    canvas.height = Math.ceil(visible.length * PX + (visible.length - 1) * GAP + PAD * 2 + (maxY - minY) * offsetScale);
    const lineX = (line: CaptureLine) => canvas.width / 2 + ((line.offsetXCm ?? 0) - (minX + maxX) / 2) * offsetScale;
    const lineY = (line: CaptureLine, index: number) => PAD + PX / 2 + index * (PX + GAP) + ((line.offsetYCm ?? 0) - minY) * offsetScale;

    if (!transparent) {
      const bg = ctx.createRadialGradient(canvas.width * 0.3, canvas.height * 0.2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
      bg.addColorStop(0, '#23262e');
      bg.addColorStop(1, '#101216');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---- SUPPORT (derrière le néon) ----
    if (plate && plate.kind !== 'none' && pxPerCm > 0) {
      if (plate.kind === 'rect') {
        const m = plate.marginCm * pxPerCm;
        const x0 = PAD - m;
        const y0 = PAD - m;
        const w = canvas.width - 2 * x0;
        const h = canvas.height - 2 * y0;
        ctx.save();
        ctx.fillStyle = plate.fill;
        ctx.beginPath();
        ctx.roundRect(x0, y0, w, h, Math.min(2 * pxPerCm, w / 2, h / 2));
        ctx.fill();
        ctx.restore();
      } else {
        // Découpe suivant la lettre : silhouette dilatée par un tracé épais.
        // Deux passes : la TRANCHE (arête claire) puis la face — le liseré
        // reste lisible même sous le halo du néon.
        const w = plate.dilateCm * pxPerCm * 2;
        const rim = Math.max(1.5, pxPerCm * 0.18); // ~1,8 mm de tranche
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const pass of [
          { lw: w, color: plate.edge },
          { lw: Math.max(0.5, w - rim * 2), color: plate.fill },
        ]) {
          ctx.strokeStyle = pass.color;
          ctx.fillStyle = pass.color;
          ctx.lineWidth = pass.lw;
          visible.forEach((l, i) => {
            ctx.font = `${l.fontWeight} ${PX}px ${l.cssFamily}`;
            ctx.strokeText(l.text, lineX(l), lineY(l, i));
            ctx.fillText(l.text, lineX(l), lineY(l, i));
          });
        }
        ctx.restore();
      }
    }

    visible.forEach((l, i) => {
      ctx.font = `${l.fontWeight} ${PX}px ${l.cssFamily}`;
      const morceaux = morceauxDeLigne(ctx, l, lineX(l));
      if (!lit) {
        // ÉTEINT : aucune lueur, une paroi puis un corps teintés. L'ordre —
        // paroi tracée d'abord, corps rempli par-dessus — reproduit le
        // `paintOrder: 'stroke fill'` de l'aperçu ; l'inverse mangerait la
        // moitié du liseré.
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.48)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1, PX * 0.012) * 2; // le tracé canvas est centré
        // Le hex mesuré prime : il décrit LA bobine, là où le délavage ne
        // décrit qu'une couleur allumée. La paroi reste calculée à partir de
        // lui, faute d'une seconde mesure.
        for (const mc of morceaux) {
          ctx.strokeStyle = melangeSrgb(mc.offHex ?? mc.colorHex, 0.28, PAROI_ETEINTE);
          ctx.strokeText(mc.texte, mc.x, lineY(l, i));
        }
        ctx.restore();
        for (const mc of morceaux) {
          ctx.fillStyle = mc.offHex ?? melangeSrgb(mc.colorHex, 0.14, CORPS_ETEINT);
          ctx.fillText(mc.texte, mc.x, lineY(l, i));
        }
        return;
      }
      for (const blur of [34, 18, 8]) {
        for (const mc of morceaux) {
          ctx.shadowColor = mc.colorHex;
          ctx.shadowBlur = blur;
          ctx.fillStyle = mc.colorHex;
          ctx.fillText(mc.texte, mc.x, lineY(l, i));
        }
      }
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      for (const mc of morceaux) ctx.fillText(mc.texte, mc.x, lineY(l, i));
    });
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Capture PNG (fond sombre) pour le panier — jamais bloquante.
 *
 * @param lit Tube allumé. Passer `false` rend l'image éteinte (écart E03).
 */
export function captureNeonPng(
  lines: CaptureLine[],
  maxBytes = 350_000,
  plate?: CapturePlate,
  lit = true,
): string | null {
  const canvas = captureNeonCanvas(lines, false, plate, lit);
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL('image/png');
    return url.length <= maxBytes ? url : canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/**
 * Dessine un LOGO SVG (data-URL) avec halo néon sur canvas. Async (Image).
 * `transparent` = texture 3D. Retourne le canvas, ou null (jamais bloquant).
 */
/**
 * DESSINE LE LOGO DANS UN CONTEXTE DONNÉ — allumé ou éteint.
 *
 * Extrait de `captureLogoCanvas` le 7 septembre 2026 : la capture composite
 * (texte + logo) en a besoin elle aussi, et la façon dont un tube s'éteint est
 * exactement le genre de règle qui, recopiée, finit par différer d'un rendu à
 * l'autre.
 */
function dessinerLogo(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  glowHex: string,
  allume: boolean,
): void {
  if (allume) {
    // Halo : l'ombre portée suit l'alpha de l'image (3 passes), puis l'image.
    for (const blur of [42, 22, 10]) {
      ctx.shadowColor = glowHex;
      ctx.shadowBlur = blur;
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.shadowBlur = 0;
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  /*
   * ÉTEINT : le pochoir. On dessine l'image pour son ALPHA, puis `source-in`
   * remplace toute la matière par la teinte du silicone. L'illustration
   * disparaît, sa forme reste — c'est ce que le client verra les trois quarts
   * du temps.
   *
   * Le remplissage se fait dans une toile SÉPARÉE : `source-in` sur la toile
   * principale effacerait aussi le fond dégradé, et le logo flotterait sur du
   * vide.
   */
  const pochoir = document.createElement('canvas');
  pochoir.width = ctx.canvas.width;
  pochoir.height = ctx.canvas.height;
  const pc = pochoir.getContext('2d');
  if (!pc) return;
  pc.drawImage(img, x, y, w, h);
  pc.globalCompositeOperation = 'source-in';
  pc.fillStyle = melangeSrgb(glowHex, 0.14, CORPS_ETEINT);
  pc.fillRect(0, 0, pochoir.width, pochoir.height);
  // Une ombre courte le décolle du mur : éteint, il a du relief.
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(pochoir, 0, 0);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * @param allume Néon sous tension. ÉTEINT, on ne dessine PAS l'illustration.
 *
 * Un néon éteint ne montre pas le dessin : il montre le TUBE, un boudin de
 * silicone mat et laiteux plié à cette forme (`physique-neon-led` §2.4). Rendre
 * l'illustration en gris serait une demi-vérité — elle garderait ses couleurs
 * d'origine, que le client ne verra jamais sur son mur.
 *
 * On se sert donc de l'image comme d'un POCHOIR et on la remplit de la teinte
 * éteinte, la même que celle du texte (`melangeSrgb` à 14 %) : les deux familles
 * s'éteignent de la même façon, parce que c'est le même tube.
 */
export function captureLogoCanvas(
  logoDataUrl: string,
  glowHex: string,
  transparent = false,
  allume = true,
): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const MAXW = 900;
          const scale = Math.min(1, MAXW / Math.max(img.width, 1));
          const w = Math.max(60, Math.round(img.width * scale));
          const h = Math.max(60, Math.round(img.height * scale));
          const PAD = Math.round(Math.max(w, h) * 0.14);
          const canvas = document.createElement('canvas');
          canvas.width = w + PAD * 2;
          canvas.height = h + PAD * 2;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          if (!transparent) {
            const bg = ctx.createRadialGradient(canvas.width * 0.3, canvas.height * 0.2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
            bg.addColorStop(0, '#23262e');
            bg.addColorStop(1, '#101216');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          dessinerLogo(ctx, img, PAD, PAD, w, h, glowHex, allume);
          resolve(canvas);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoDataUrl;
    } catch {
      resolve(null);
    }
  });
}

/** Capture PNG d'un logo (fond sombre) pour le panier. */
export async function captureLogoPng(logoDataUrl: string, glowHex: string, maxBytes = 350_000, allume = true): Promise<string | null> {
  const canvas = await captureLogoCanvas(logoDataUrl, glowHex, false, allume);
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL('image/png');
    return url.length <= maxBytes ? url : canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/**
 * CAPTURE D'UNE PIÈCE QUI PORTE UN TEXTE *ET* UN LOGO.
 *
 * Le panier, le bon à tirer et l'e-mail de devis prenaient `captureLogoPng` dès
 * qu'un logo était là : depuis que les deux se composent, cette image montrait
 * la moitié de ce que le client commandait — et c'est cette image-là que
 * l'atelier regarde.
 *
 * On empile donc les deux dans une seule toile, à la MÊME échelle que la scène :
 * `CAPTURE_PX_PAR_LETTRE` pixels valent une hauteur de lettre, le logo occupe
 * donc `logoHeightCm / letterHeightCm` fois cette hauteur, et l'écart est le
 * même 0,35 que partout ailleurs.
 */
export async function captureCompositePng(
  lines: CaptureLine[],
  logoDataUrl: string,
  glowHex: string,
  logoHeightCm: number,
  letterHeightCm: number,
  placement: 'above' | 'below',
  maxBytes = 350_000,
  allume = true,
): Promise<string | null> {
  const texte = captureNeonCanvas(lines, true, undefined, allume);
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const e = new Image();
    e.onload = () => resolve(e);
    e.onerror = () => resolve(null);
    e.src = logoDataUrl;
  });
  if (!texte || !img || !(img.naturalWidth > 0)) return null;
  try {
    const PX = CAPTURE_PX_PAR_LETTRE;
    const hLogo = Math.max(24, (logoHeightCm / Math.max(1, letterHeightCm)) * PX);
    const wLogo = (hLogo * img.naturalWidth) / Math.max(1, img.naturalHeight);
    const ecart = PX * 0.35;
    // Le halo déborde du dessin : sans marge, il serait tranché au bord.
    const PAD = PX * 0.9;
    const largeur = Math.ceil(Math.max(texte.width, wLogo + PAD * 2));
    const hauteur = Math.ceil(texte.height + ecart + hLogo);

    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const bg = ctx.createRadialGradient(canvas.width * 0.3, canvas.height * 0.2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
    bg.addColorStop(0, '#23262e');
    bg.addColorStop(1, '#101216');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const yLogo = 'above' === placement ? 0 : texte.height + ecart;
    const yTexte = 'above' === placement ? hLogo + ecart : 0;
    ctx.drawImage(texte, (largeur - texte.width) / 2, yTexte);
    dessinerLogo(ctx, img, (largeur - wLogo) / 2, yLogo, wLogo, hLogo, glowHex, allume);

    const url = canvas.toDataURL('image/png');
    return url.length <= maxBytes ? url : canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}
