/**
 * PAVER UN DESSIN À L'ÉCHELLE 1 SUR DES FEUILLES A4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 *
 * Le gabarit de perçage savait déjà le faire (docs/43 §33). Le gabarit papier —
 * celui que le client scotche au mur avant de payer — a besoin exactement du
 * même pavage, des mêmes hirondelles et de la même règle de contrôle.
 *
 * Le recopier aurait donné deux implémentations à faire diverger. C'est la faute
 * que `CLAUDE.md` interdit à un banc d'essai, et qui ne vaut pas mieux ici : le
 * jour où l'on corrige le recouvrement d'un côté, l'autre reste faux, et
 * personne ne le voit avant qu'un client ait scotché ses feuilles de travers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST COMMUN, ET CE QUI NE L'EST PAS
 *
 * Commun : la découpe en feuilles, le repère de chaque feuille, les hirondelles
 * de raccord, la règle de 100 mm, l'avertissement d'impression, l'enveloppe SVG.
 *
 * Propre à chaque gabarit : ce qu'on dessine dedans. Le perçage montre des
 * croix, le gabarit papier montre une silhouette. Ce module ne sait rien de
 * l'un ni de l'autre — il tient la feuille, pas le dessin.
 */

/** A4 paysage, en millimètres. */
export const A4 = { largeurMm: 297, hauteurMm: 210 } as const;

/** Deux décimales : au-delà, le SVG grossit sans que l'imprimante en profite. */
export const F = (v: number) => (Math.round(v * 100) / 100).toString();

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface OptionsPavage {
  /** Marge d'impression (mm). Dix par défaut : aucune imprimante ne fait moins. */
  margeMm?: number;
  /** Recouvrement entre feuilles (mm). */
  recouvrementMm?: number;
}

export interface Pavage {
  colonnes: number;
  lignes: number;
  marge: number;
  recouvre: number;
  utileL: number;
  utileH: number;
  pasL: number;
  pasH: number;
  hauteurMm: number;
}

/**
 * Combien de feuilles, et de combien elles se décalent.
 *
 * Le PAS est l'utile moins le recouvrement : c'est de combien la feuille
 * suivante se décale, pas de combien elle montre. Confondre les deux donne un
 * gabarit dont les feuilles ne se recouvrent jamais — et deux feuilles bord à
 * bord se collent toujours de travers.
 */
export function paverEnA4(largeurM: number, hauteurM: number, o: OptionsPavage = {}): Pavage {
  const marge = o.margeMm ?? 10;
  const recouvre = o.recouvrementMm ?? 10;
  const utileL = A4.largeurMm - 2 * marge;
  const utileH = A4.hauteurMm - 2 * marge;
  const pasL = utileL - recouvre;
  const pasH = utileH - recouvre;
  const largeurMm = Math.max(0, largeurM) * 1000;
  const hauteurMm = Math.max(0, hauteurM) * 1000;
  return {
    colonnes: Math.max(1, Math.ceil(largeurMm / pasL)),
    lignes: Math.max(1, Math.ceil(hauteurMm / pasH)),
    marge, recouvre, utileL, utileH, pasL, pasH, hauteurMm,
  };
}

export interface CadreFeuille {
  co: number;
  li: number;
  numero: number;
  total: number;
  /** Une voisine à droite ? en dessous ? */
  droite: boolean;
  bas: boolean;
  /** Mètres du dessin → millimètres de CETTE feuille. */
  px: (xM: number) => number;
  py: (yM: number) => number;
  pavage: Pavage;
}

/** Le cadre de la feuille `index`, dans l'ordre de lecture. */
export function cadreFeuille(index: number, p: Pavage): CadreFeuille {
  const co = index % p.colonnes;
  const li = Math.floor(index / p.colonnes);
  // Origine de CETTE feuille dans le repère de la pièce, en millimètres. Le
  // dessin monte, le SVG descend : on retourne l'axe Y une fois, ici.
  const x0 = co * p.pasL;
  const y0 = li * p.pasH;
  return {
    co, li,
    numero: index + 1,
    total: p.colonnes * p.lignes,
    droite: co < p.colonnes - 1,
    bas: li < p.lignes - 1,
    px: (xM: number) => p.marge + (xM * 1000 - x0),
    py: (yM: number) => p.marge + (p.hauteurMm - yM * 1000 - y0),
    pavage: p,
  };
}

/** Un point est-il dans la zone utile de cette feuille ? */
export function dansLaZoneUtile(c: CadreFeuille, xMm: number, yMm: number): boolean {
  const p = c.pavage;
  return xMm >= p.marge && yMm >= p.marge
    && xMm <= p.marge + p.utileL && yMm <= p.marge + p.utileH;
}

export const texte = (x: number, y: number, t: string, taille = 3.2, ancre = 'start') =>
  `<text x="${F(x)}" y="${F(y)}" font-size="${taille}" text-anchor="${ancre}" font-family="Helvetica,Arial,sans-serif">${esc(t)}</text>`;

/**
 * Les hirondelles de raccord, du seul côté où il y a une voisine.
 *
 * En poser des quatre côtés inviterait à raccorder une feuille avec du vide.
 */
export function hirondelles(c: CadreFeuille): string[] {
  const p = c.pavage;
  const hir = (x: number, y: number) =>
    `<line x1="${F(x - 4)}" y1="${F(y)}" x2="${F(x + 4)}" y2="${F(y)}" class="raccord"/>`
    + `<line x1="${F(x)}" y1="${F(y - 4)}" x2="${F(x)}" y2="${F(y + 4)}" class="raccord"/>`;
  const out: string[] = [];
  if (c.droite) {
    out.push(hir(p.marge + p.utileL - p.recouvre, p.marge));
    out.push(hir(p.marge + p.utileL - p.recouvre, p.marge + p.utileH));
  }
  if (c.bas) {
    out.push(hir(p.marge, p.marge + p.utileH - p.recouvre));
    out.push(hir(p.marge + p.utileL, p.marge + p.utileH - p.recouvre));
  }
  return out;
}

/**
 * LA RÈGLE DE CONTRÔLE, SUR CHAQUE FEUILLE.
 *
 * Un gabarit à l'échelle 1 qui n'y est pas est faux avec assurance, et
 * « ajuster à la page » est le réglage par défaut de la plupart des pilotes :
 * il réduit de 3 à 6 % sans rien dire.
 *
 * Elle est répétée sur CHAQUE feuille parce que quelqu'un peut n'en imprimer
 * qu'une — et c'est le seul élément du gabarit qui ne décrit pas la pièce.
 *
 * @param avertissement Ce qu'on perd si l'échelle est fausse. Il diffère : un
 *                      gabarit de perçage coûte des trous dans le mur, un
 *                      gabarit papier coûte seulement une mauvaise impression.
 */
export function regleDeControle(c: CadreFeuille, avertissement: string): string[] {
  const rx = c.pavage.marge;
  const ry = A4.hauteurMm - c.pavage.marge + 1;
  let regle = `<line x1="${F(rx)}" y1="${F(ry)}" x2="${F(rx + 100)}" y2="${F(ry)}" class="regle"/>`;
  for (let i = 0; i <= 10; i++) {
    const h = 0 === i % 5 ? 3 : 1.6;
    regle += `<line x1="${F(rx + i * 10)}" y1="${F(ry - h)}" x2="${F(rx + i * 10)}" y2="${F(ry)}" class="regle"/>`;
  }
  return [regle, texte(rx + 104, ry, `100 mm · ${avertissement}`, 3)];
}

/** L'en-tête commun : titre, numéro de feuille, avertissement d'impression. */
export function enteteCommune(c: CadreFeuille, titre: string): string[] {
  const p = c.pavage;
  const out = [
    texte(p.marge, p.marge - 4, titre, 3.6),
    texte(A4.largeurMm - p.marge, p.marge - 4, `Feuille ${c.numero}/${c.total}`, 3.2, 'end'),
    texte(p.marge, A4.hauteurMm - p.marge - 3, 'IMPRIMER À 100 % · ne pas « ajuster à la page »', 3),
  ];
  const voisines = [c.droite ? 'à droite' : null, c.bas ? 'en dessous' : null].filter(Boolean).join(' et ');
  if (voisines) {
    out.push(texte(A4.largeurMm - p.marge, A4.hauteurMm - p.marge - 3, `Se raccorde ${voisines} · aligner les croix de raccord`, 2.8, 'end'));
  }
  return out;
}

/** L'enveloppe SVG d'une feuille, avec son cadre de zone utile. */
export function enveloppeFeuille(c: CadreFeuille, styles: string, corps: string): string {
  const p = c.pavage;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.largeurMm}mm" height="${A4.hauteurMm}mm" viewBox="0 0 ${A4.largeurMm} ${A4.hauteurMm}">
<style>
  text { fill: #111; }
${styles}
  .raccord { stroke: #111; stroke-width: 0.5; }
  .regle { stroke: #111; stroke-width: 0.4; }
  .cadre { fill: none; stroke: #bbb; stroke-width: 0.3; }
</style>
<rect x="0" y="0" width="${A4.largeurMm}" height="${A4.hauteurMm}" fill="#fff"/>
<rect x="${F(p.marge)}" y="${F(p.marge)}" width="${F(p.utileL)}" height="${F(p.utileH)}" class="cadre"/>
${corps}
</svg>
`;
}
