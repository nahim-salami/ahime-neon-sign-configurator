/**
 * Le logo du client — VECTORIEL OU IMAGE — mesuré pour en donner la taille.
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI ────────────────────────────────────────────
 *
 * Ce module ne lisait que le SVG. Une image matricielle partait au devis, avec
 * le bon motif : « c'est une image, pas un tracé, sa longueur de tube ne se
 * mesure pas ». C'était vrai du SVG et faux de l'outil : `buildLogoGeometry`
 * squelettise DÉJÀ une image matricielle — c'est elle qui alimente la vue 3D
 * depuis le début. Le client voyait donc son logo en tube à l'écran pendant
 * qu'on lui disait qu'on ne savait pas le mesurer.
 *
 * Il manquait deux choses, pas une chaîne de traitement :
 *
 * 1. **Le détourage.** `maskFromCanvas` lit le canal ALPHA et rien d'autre. Un
 *    JPEG n'en a pas : son fond blanc est aussi opaque que l'encre, et le
 *    masque sort en rectangle plein. On le reconstruit ici.
 * 2. **Le branchement sur le prix.** La mesure existait, elle ne servait qu'au
 *    rendu.
 *
 * ── CE QUE CETTE MESURE VAUT ────────────────────────────────────────────────
 *
 * Exactement ce que vaut celle du SVG : elle est faite dans le NAVIGATEUR du
 * client, et le serveur ne peut pas la refaire (pas de DOM, pas de canevas).
 * Les deux chemins portent donc la même réserve, celle du métier — « une
 * maquette vous sera confirmée avant fabrication » — et `class-ahns-order.php`
 * marque déjà la commande « à VÉRIFIER avant fabrication ».
 *
 * La différence entre les deux : le SVG apporte les tracés du client, l'image
 * les fait déduire d'un seuil. Un détourage raté se voit à l'écran — le client
 * regarde son logo en tube avant de commander — mais il ne se prouve pas.
 */

import { buildLogoGeometry, geometrieVersSvg, type NeonGeometry } from './neon-geometry';

export interface LogoData {
  /** Les TRACÉS DE TUBE en SVG — ce qui part avec la commande. */
  svgText: string;
  /** L'image affichée dans l'aperçu 2D et rastérisée pour la 3D. */
  dataUrl: string;
  /**
   * L'image DÉTOURÉE d'origine, pour une source matricielle.
   *
   * `dataUrl` porte les trajets de tube, qui sont un RÉSULTAT de la mesure.
   * Re-mesurer à partir de lui reviendrait à squelettiser un squelette, et
   * le tracé dériverait un peu plus à chaque changement de diamètre. On
   * repart donc toujours du dessin.
   */
  sourceUrl?: string;
  /** Longueur totale des tracés (unités utilisateur SVG, ou pixels du masque). */
  unitsLen: number;
  unitsW: number;
  unitsH: number;
  /**
   * D'où vient le logo. Change ce qu'on dit au client, et rien d'autre : les
   * deux sources produisent le même `unitsLen / unitsW / unitsH`, et le
   * configurateur les met à l'échelle de la même façon.
   */
  source: 'vecteur' | 'image';
  /**
   * Diamètre de tube avec lequel une source IMAGE a été mesurée.
   *
   * Il compte : `processMask` prolonge chaque bout libre du rayon du tube, et
   * un logo qui rend une centaine de brins accumule deux cents prolongements.
   * Mesuré sur le logo « démo » : 97 cm de tube d'écart entre Ø 8 et
   * Ø 10 mm, sur 8,5 m — 11 %. La mesure se refait donc quand le diamètre
   * change. Un SVG, lui, porte ses propres tracés et ne dépend de rien.
   */
  tubeDiameterCm?: number;
  /**
   * La géométrie mesurée, gardée pour redessiner l'aperçu À LA BONNE
   * ÉCHELLE — voir `logoAEchelle`. Absente d'un logo vectoriel, qui porte
   * déjà le dessin du client.
   */
  geometrie?: NeonGeometry;
}

/**
 * L'APERÇU D'UN LOGO REDESSINÉ À LA TAILLE QUE LE CLIENT A RÉGLÉE.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION EXISTE POUR CORRIGER ──────────────────────
 *
 * Le SVG des trajets était sérialisé UNE FOIS, à l'import, avec l'épaisseur
 * de tube d'une pièce de `HAUTEUR_NOMINALE_CM`. Or cette hauteur n'est qu'un
 * échafaudage : le client, lui, règle 33 cm. Le tube sortait donc à
 * `stroke-width` 2,34 sur un dessin large de 696 unités — trois fois trop
 * fin. Relevé le 7 septembre 2026 : « Together » ne rendait plus des lettres
 * mais des filaments, chaque hésitation du squelette visible parce qu'aucun
 * tube ne la recouvrait. La 3D, elle, travaillait à la vraie taille et
 * montrait la bonne pièce : les deux vues se contredisaient.
 *
 * ── L'ÉCHELLE, POSÉE UNE FOIS POUR TOUTES ──────────────────────────────────
 *
 * `hauteurCm` est l'encombrement HORS TOUT, tube compris — c'est la cote que
 * le client lit et qu'il mesurera au mètre. La ligne médiane, elle, occupe
 * `hauteurCm − diamètre`. D'où, en pixels du masque :
 *
 *     px/cm = mediane_px / (hauteurCm − diamètre)
 *     trait = diamètre × px/cm
 *
 * et le viewBox rendu vaut `mediane + trait`, ce que `getBBox()` retrouvera
 * grâce au repère de cadrage. Le configurateur remet ensuite tout à
 * l'échelle par `hauteurCm / unitsH` et retombe exactement sur ses pieds.
 *
 * Un logo VECTORIEL est rendu inchangé : il porte les tracés du client, pas
 * un squelette qu'on redessine.
 */
export function logoAEchelle(logo: LogoData, hauteurCm: number, tubeDiameterCm: number): LogoData {
  const geo = logo.geometrie;
  if (!geo || 'image' !== logo.source) return logo;
  // Sous un tube de hauteur, il n'y a plus de ligne médiane à dessiner : on
  // garde une échelle plancher plutôt que de diviser par zéro.
  const medianeCm = Math.max(tubeDiameterCm, hauteurCm - tubeDiameterCm);
  const sansTrait = geometrieVersSvg(geo, 0);
  if (!(sansTrait.medianeH > 0)) return logo;
  const traitPx = (tubeDiameterCm * sansTrait.medianeH) / medianeCm;
  const { svg, largeurPx, hauteurPx } = geometrieVersSvg(geo, traitPx);
  if (!svg) return logo;
  return {
    ...logo,
    svgText: svg,
    dataUrl: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))),
    unitsW: largeurPx,
    unitsH: hauteurPx,
  };
}

const MAX_SVG_BYTES = 500_000;

/**
 * RÉSOLUTION DE TRAVAIL DE L'IMAGE DÉTOURÉE, en pixels du plus grand côté.
 *
 * Elle sert à deux choses aux exigences opposées : l'aperçu 2D, qu'on regarde
 * de près, et la rastérisation pour la mesure, qui retombe de toute façon à
 * 480 px (`TARGET_PX`). 1200 px donne un aperçu net sans faire porter au
 * navigateur un canevas de photo d'appareil.
 */
const TRAVAIL_PX = 1200;

/** Retire scripts, gestionnaires d'évènements et références externes. */
function sanitizeSvg(text: string): string | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.tagName.toLowerCase() !== 'svg') {
    return null;
  }
  for (const el of Array.from(doc.querySelectorAll('script, foreignObject, use[href^="http"], image'))) {
    el.remove();
  }
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith('on') || value.includes('javascript:') || (name === 'href' && value.startsWith('http'))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

/**
 * REPEINT UN SVG A LA COULEUR DU TUBE.
 *
 * ── LE DEFAUT ──────────────────────────────────────────────────────────────
 *
 * Un logo s'exporte NOIR, neuf fois sur dix. Pose noir sur la scene sombre du
 * configurateur, il disparait : mesure du 7 septembre 2026 sur un logo
 * `fill="#000000"` — 1 120 pixels opaques, ZERO pixel clair. Le client le
 * televerse, l'ecran ne montre rien, et il conclut que l'import a echoue.
 * `fill="currentColor"`, tres courant a l'export Figma, donne exactement la
 * meme chose : dans une image, `currentColor` retombe sur le noir initial.
 *
 * ── POURQUOI ON REPEINT PLUTOT QU'ON N'AVERTIT ─────────────────────────────
 *
 * Parce qu'un neon n'a pas les couleurs du logo. C'est UN tube, d'UNE couleur,
 * celle que le client choisit aux pastilles. Garder le noir de la charte ne
 * conserve rien de vrai : cela promet une piece que personne ne fabriquera —
 * le meme raisonnement que pour une image matricielle, ou l'apercu montre deja
 * le tube. Les deux chemins disent enfin la meme chose.
 *
 * Le coeur blanc est ce que rend un tube allume ; la lueur, elle, vient de la
 * couleur choisie, appliquee par-dessus. Eteint, le widget repeint en teinte
 * silicone. La MESURE ne bouge pas d'un millimetre : on ne touche qu'aux
 * couleurs, jamais a la geometrie, et le prix vient des traces.
 *
 * ── COMMENT ────────────────────────────────────────────────────────────────
 *
 * Par une feuille de style ajoutee au document, et non en reecrivant chaque
 * attribut : un export porte ses couleurs tantot en attribut, tantot en
 * `style=""`, tantot dans un `<style>` a lui. Une regle `!important` les prend
 * toutes. `:not([fill="none"])` epargne les dessins au trait — un contour vide
 * rempli de blanc deviendrait un pate.
 */
function repeindreEnTube(doc: Document): void {
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = [
    '*:not([fill="none"]){fill:#ffffff!important}',
    '*[stroke]:not([stroke="none"]){stroke:#ffffff!important}',
    // Un degrade ou un motif garde ses propres couleurs : on les neutralise en
    // les rendant blancs eux aussi.
    'stop{stop-color:#ffffff!important}',
  ].join('');
  doc.documentElement.insertBefore(style, doc.documentElement.firstChild);
}

/** Charge + mesure un SVG. Retourne les données du logo ou un message d'erreur. */
export function loadSvgLogo(fileText: string): LogoData | { error: string } {
  if (fileText.length > MAX_SVG_BYTES) {
    return { error: 'SVG trop lourd (500 Ko maximum).' };
  }
  const clean = sanitizeSvg(fileText);
  if (!clean) {
    return { error: 'Fichier SVG illisible.' };
  }

  // Montage caché : getTotalLength/getBBox exigent un élément rendu.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1000px;height:1000px;opacity:0;pointer-events:none;';
  host.innerHTML = clean;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector('svg');
    if (!svg) return { error: 'Fichier SVG illisible.' };
    const geoms = Array.from(
      svg.querySelectorAll<SVGGeometryElement>('path, line, polyline, polygon, circle, ellipse, rect'),
    );
    if (geoms.length === 0) {
      return { error: 'Aucun tracé vectoriel trouvé : exportez votre logo en chemins (contours vectorisés).' };
    }
    let len = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const g of geoms) {
      try {
        len += g.getTotalLength();
        const b = g.getBBox();
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      } catch {
        /* élément non mesurable → ignoré */
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (!(len > 0) || !(w > 0) || !(h > 0)) {
      return { error: 'Tracés du SVG non mesurables.' };
    }
    /*
     * DEUX COPIES : celle qu'on MESURE, et celle qu'on MONTRE.
     *
     * La mesure vient d'etre faite sur le document monte plus haut, aux
     * couleurs du client. Ce qui part a l'ecran est la meme geometrie repeinte
     * a la couleur du tube.
     */
    const affiche = new DOMParser().parseFromString(clean, 'image/svg+xml');
    repeindreEnTube(affiche);
    const peint = new XMLSerializer().serializeToString(affiche.documentElement);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(peint)));
    return { svgText: clean, dataUrl, unitsLen: len, unitsW: w, unitsH: h, source: 'vecteur' };
  } finally {
    host.remove();
  }
}

/**
 * UN SVG QU'ON NE SAIT PAS LIRE EN VECTEURS EST ENCORE UNE IMAGE.
 *
 * `loadSvgLogo` refuse trois choses, et refusait tout court : un fichier de
 * plus de 500 Ko, un SVG sans aucun trace (du texte non vectorise, ou une
 * photo enrobee dans un SVG — ce que rendent « Enregistrer sous » et bien des
 * exports en ligne), et des traces non mesurables.
 *
 * Ces trois refus dataient du temps ou l'on ne savait rien faire d'une image.
 * On sait, maintenant. Plutot que de renvoyer le client a un devis pour un
 * fichier parfaitement lisible, on le RASTERISE : le meme chemin que son JPEG,
 * avec le meme detourage et la meme mesure.
 *
 * ── LA TAILLE DE RASTERISATION ─────────────────────────────────────────────
 *
 * Un SVG sans `width`/`height` prend 300 px de large par defaut dans une
 * image — trop peu pour y suivre un trait. On lui pose donc des dimensions
 * tirees de son `viewBox`, mises a l'echelle du budget de trace.
 *
 * ── ET LA SECURITE ─────────────────────────────────────────────────────────
 *
 * On rasterise le fichier D'ORIGINE, pas la copie assainie : c'est justement
 * l'element `<image>` que l'assainisseur retire qui porte le dessin. Un SVG
 * charge dans une balise `<img>` ne peut ni executer de script ni charger de
 * ressource externe — le navigateur le lui interdit. Et le texte conserve dans
 * `svgText`, lui, reste celui des traces mesures : rien d'inspecte n'entre
 * dans ce qui repart vers le serveur.
 */
async function svgCommeImage(
  texte: string,
  tubeDiameterCm: number,
): Promise<LogoData | { error: string }> {
  let dessin = texte;
  const boite = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(texte);
  if (boite) {
    const w = Number(boite[1]);
    const h = Number(boite[2]);
    if (w > 0 && h > 0) {
      const k = TRAVAIL_PX / Math.max(w, h);
      dessin = texte.replace(
        /<svg/,
        `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`,
      );
    }
  }
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(dessin)));
  return loadRasterLogo(url, tubeDiameterCm);
}

/**
 * Charge un logo, quel que soit ce qu'il y a dedans.
 *
 * On tente d'abord la lecture VECTORIELLE — elle apporte les traces du client,
 * mesures au chemin pres. Si le fichier n'est pas lisible ainsi, on retombe
 * sur la voie image plutot que de refuser.
 */
export async function loadLogoSvgOuImage(
  texte: string,
  tubeDiameterCm: number,
): Promise<LogoData | { error: string }> {
  const vecteur = loadSvgLogo(texte);
  if (!('error' in vecteur)) return vecteur;
  const image = await svgCommeImage(texte, tubeDiameterCm);
  // Les deux ont echoue : on rend le motif VECTORIEL, qui nomme le vrai
  // probleme (« exportez en chemins ») plutot que « aucun dessin trouve ».
  return 'error' in image ? vecteur : image;
}

// ---------------------------------------------------------------------------
// Image matricielle
// ---------------------------------------------------------------------------

/** Charge une adresse d'image en `HTMLImageElement`. */
function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * REND SON ALPHA À UNE IMAGE QUI N'EN A PAS.
 *
 * Le fond est estimé sur le CADRE de l'image — la médiane des pixels du bord,
 * canal par canal. La médiane, et pas la moyenne : un logo qui touche un bord
 * décale une moyenne, il ne décale pas une médiane. Et le cadre, et pas les
 * quatre coins : un coin peut porter de l'encre, quatre valeurs ne se
 * défendent pas entre elles.
 *
 * L'opacité suit ensuite la DISTANCE au fond, avec une rampe douce plutôt
 * qu'un seuil : le crénelage du bord des lettres est de l'information, et un
 * seuil sec le transforme en escalier que `smoothMask` devra ensuite lisser.
 *
 * Rend `false` si l'image portait déjà sa transparence — un PNG détouré par le
 * graphiste du client vaut mieux que n'importe quelle estimation.
 */
function poserLAlpha(data: Uint8ClampedArray, w: number, h: number): boolean {
  for (let p = 3; p < data.length; p += 4) {
    if (data[p]! < 250) return false; // transparence déjà présente
  }

  const bords: number[][] = [[], [], []];
  const prendre = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    bords[0]!.push(data[i]!);
    bords[1]!.push(data[i + 1]!);
    bords[2]!.push(data[i + 2]!);
  };
  for (let x = 0; x < w; x++) {
    prendre(x, 0);
    prendre(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    prendre(0, y);
    prendre(w - 1, y);
  }
  const fond = bords.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1] ?? 255;
  });

  // Rampe : transparent sous 24 de distance, opaque au-dessus de 80. Le seuil
  // du masque (`alpha > 128`) tombe donc vers 50 — au milieu du crénelage.
  const BAS = 24;
  const HAUT = 80;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.max(
      Math.abs(data[i]! - fond[0]!),
      Math.abs(data[i + 1]! - fond[1]!),
      Math.abs(data[i + 2]! - fond[2]!),
    );
    data[i + 3] = d <= BAS ? 0 : d >= HAUT ? 255 : Math.round(((d - BAS) / (HAUT - BAS)) * 255);
  }
  return true;
}

/** La boîte de l'encre (alpha > 128), ou null si l'image est vide. */
function boiteDeLEncre(data: Uint8ClampedArray, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! <= 128) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 >= x0 && y1 >= y0 ? { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}

/**
 * HAUTEUR NOMINALE DE MESURE, en centimètres.
 *
 * `buildLogoGeometry` demande une taille réelle pour poser son échelle. Celle
 * qu'on lui donne ici n'a aucune importance — le configurateur ne garde que le
 * RAPPORT `unitsLen / unitsH`, et remet tout à l'échelle de la hauteur réglée
 * par le client. 100 cm est simplement une valeur ronde qui tient loin des
 * bornes de `rasterizeImage`.
 */
const HAUTEUR_NOMINALE_CM = 100;

/**
 * Charge + mesure une image matricielle (PNG, JPEG, WebP…).
 *
 * `tubeDiameterCm` entre dans la mesure : voir `LogoData.tubeDiameterCm`.
 */
export async function loadRasterLogo(
  fileOrUrl: File | string,
  tubeDiameterCm: number,
): Promise<LogoData | { error: string }> {
  const src = 'string' === typeof fileOrUrl ? fileOrUrl : await new Promise<string>((resolve) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve('string' === typeof lecteur.result ? lecteur.result : '');
    lecteur.onerror = () => resolve('');
    lecteur.readAsDataURL(fileOrUrl);
  });
  if (!src) return { error: 'Image illisible.' };

  const img = await chargerImage(src);
  if (!img || !(img.naturalWidth > 0)) return { error: 'Image illisible.' };

  const echelle = Math.min(1, TRAVAIL_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * echelle));
  const h = Math.max(1, Math.round(img.naturalHeight * echelle));
  const toile = document.createElement('canvas');
  toile.width = w;
  toile.height = h;
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { error: 'Image illisible.' };
  ctx.drawImage(img, 0, 0, w, h);

  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, w, h);
  } catch {
    // Toile souillée : l'image vient d'une autre origine sans CORS.
    return { error: 'Image illisible.' };
  }
  poserLAlpha(pixels.data, w, h);
  const boite = boiteDeLEncre(pixels.data, w, h);
  if (!boite) {
    return { error: 'Aucun dessin trouvé : l’image est uniforme, ou son sujet ne se détache pas du fond.' };
  }
  ctx.putImageData(pixels, 0, 0);

  /*
   * ON RECADRE SUR L'ENCRE, ET CE N'EST PAS COSMÉTIQUE.
   *
   * La hauteur réglée par le client est celle du DESSIN, pas celle du fichier.
   * Le JPEG d'« démo » portait 74 px de blanc à gauche et 83 à droite :
   * les compter dans les 100 cm demandés aurait rendu un néon de 82 cm sans
   * que personne le voie. Le recadrage fait aussi coïncider `ink.h` avec la
   * hauteur rastérisée, ce qui rend la mise à l'échelle du configurateur
   * exacte au lieu d'approchée.
   */
  const coupe = document.createElement('canvas');
  coupe.width = boite.w;
  coupe.height = boite.h;
  const cctx = coupe.getContext('2d');
  if (!cctx) return { error: 'Image illisible.' };
  cctx.drawImage(toile, boite.x0, boite.y0, boite.w, boite.h, 0, 0, boite.w, boite.h);
  const dataUrl = coupe.toDataURL('image/png');

  const detouree = await chargerImage(dataUrl);
  if (!detouree) return { error: 'Image illisible.' };
  const geo = buildLogoGeometry(detouree, HAUTEUR_NOMINALE_CM, tubeDiameterCm);
  if (!geo || !(geo.tubeLengthM > 0) || !(geo.ink.w > 0) || !(geo.ink.h > 0)) {
    return { error: 'Dessin trop fin ou trop petit pour en tirer un trajet de tube.' };
  }

  /*
   * CE QU'ON MONTRE, C'EST LE TUBE — PAS LE DESSIN DU CLIENT.
   *
   * L'aperçu 2D affichait l'image telle quelle, avec une lueur par-dessus :
   * sur ce logo-ci, un « Together » orange et un « at amazon » noir, brillants
   * de rose. Cela promet une pièce bicolore que personne ne fabriquera — un
   * néon, c'est UN tube, d'UNE couleur, qui suit la ligne médiane. Et la vue
   * 3D, elle, montrait déjà le tube : les deux vues du même objet ne disaient
   * pas la même chose.
   *
   * L'aperçu devient donc le SVG des trajets, celui-là même qui part à
   * l'atelier. La 2D et la 3D montrent enfin la même pièce, et la couleur
   * choisie par le client est la seule qui apparaisse.
   *
   * (Un logo VECTORIEL garde pour l'instant ses propres couleurs — même
   * défaut, autre chemin ; noté dans docs/50.)
   */
  const { svg, largeurPx, hauteurPx } = geometrieVersSvg(geo, tubeDiameterCm * geo.pxPerCm);
  if (!svg) return { error: 'Dessin trop fin ou trop petit pour en tirer un trajet de tube.' };

  return {
    svgText: svg,
    dataUrl: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))),
    sourceUrl: dataUrl,
    // Les unités sont les PIXELS DU MASQUE : le configurateur ne se sert que du
    // rapport, exactement comme pour les unités utilisateur d'un SVG. La boîte
    // est celle du SVG affiché, tube compris — sans quoi la cote et le dessin
    // divergeraient de l'épaisseur du trait.
    unitsLen: geo.tubeLengthM * 100 * geo.pxPerCm,
    unitsW: largeurPx,
    unitsH: hauteurPx,
    source: 'image',
    tubeDiameterCm,
    geometrie: geo,
  };
}
