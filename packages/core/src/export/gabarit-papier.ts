/**
 * LE GABARIT PAPIER — CE QUE LE CLIENT SCOTCHE AU MUR AVANT DE PAYER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, ET POURQUOI C'EST LE PLUS FORT DES REMÈDES
 *
 * `parcours-configurateur-ux` §2 classe les remèdes au seul problème qui coûte
 * des retours — « reçu 30 cm × 2 cm alors que la photo le montrait au-dessus du
 * canapé ». L'objet de référence à l'échelle vient en premier (fait, §42), et le
 * gabarit papier en quatrième.
 *
 * Mais c'est le seul qui soit PHYSIQUE. Les trois autres améliorent une image ;
 * celui-ci met un rectangle de papier sur le mur du client, à sa taille réelle,
 * chez lui, avant qu'il paie. Aucune image ne fait ça — et c'est précisément le
 * pas qu'un client hésitant a besoin de franchir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DESSINE, ET CE QU'IL NE DESSINE PAS
 *
 * L'ENCOMBREMENT et la SILHOUETTE, rien d'autre. Pas le tube, pas les couleurs,
 * pas la lueur : une enseigne imprimée en noir sur du papier blanc ne ressemble
 * à rien, et un client qui la scotche jugerait le dessin au lieu de juger la
 * taille. On lui donne un contour et des cotes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'EST PAS : UN GABARIT DE PERÇAGE
 *
 * Les deux se ressemblent — même pavage A4, mêmes hirondelles, même règle de
 * 100 mm — et c'est exactement pourquoi il faut qu'on ne puisse pas les
 * confondre. Un client qui percerait quatre trous d'après CELUI-CI se
 * tromperait : il ne porte aucun perçage, et l'enseigne ne se pose pas
 * forcément là où son contour tombe.
 *
 * Chaque feuille le dit donc en toutes lettres, et la mention est dans
 * l'en-tête, pas en petit dans un coin.
 */

import type { Polyline2 } from '../solid.js';
import {
  A4, F, paverEnA4, cadreFeuille, texte, hirondelles, regleDeControle,
  enteteCommune, enveloppeFeuille, type OptionsPavage,
} from './pavage-a4.js';

export interface GabaritPapierOptions extends OptionsPavage {
  reference: string;
  /** Encombrement hors-tout de la pièce (m). */
  largeurM: number;
  hauteurM: number;
  /** Nom montré au client, s'il en a donné un. */
  designation?: string;
  /**
   * Silhouette à tracer, en mètres, dans le repère du dessin (Y vers le haut).
   *
   * Absente, on ne trace que l'encombrement. Ce n'est pas un repli dégradé : un
   * rectangle aux bonnes cotes suffit à juger une taille, et c'est même plus
   * lisible qu'un contour de lettres découpé sur six feuilles.
   */
  contours?: readonly Polyline2[];
}

export interface GabaritPapier {
  feuilles: string[];
  colonnes: number;
  lignes: number;
}

/** Le gabarit papier, découpé en feuilles A4 à l'échelle 1. */
export function gabaritPapierSvg(o: GabaritPapierOptions): GabaritPapier {
  const largeurMm = Math.max(0, o.largeurM) * 1000;
  const hauteurMm = Math.max(0, o.hauteurM) * 1000;
  if (!(largeurMm > 0) || !(hauteurMm > 0)) {
    throw new Error('gabarit papier : encombrement nul');
  }
  const p = paverEnA4(o.largeurM, o.hauteurM, o);
  const feuilles: string[] = [];
  for (let i = 0; i < p.colonnes * p.lignes; i++) {
    feuilles.push(feuille(cadreFeuille(i, p), o, largeurMm, hauteurMm));
  }
  return { feuilles, colonnes: p.colonnes, lignes: p.lignes };
}

/**
 * Une polyligne rendue en courbes, et non en segments.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LISSER ICI, ET NULLE PART AILLEURS
 *
 * Le trajet de tube est simplifié pour la 3D : une dizaine de points par
 * lettre suffisent à un tube extrudé, où le maillage arrondit ce que la
 * polyligne anguleuse laisse. Sur du papier, il n'y a pas de maillage — et un
 * « Hello » cursif imprimé sortait en polygones, avec des angles là où l'œil
 * attend des courbes.
 *
 * On ne touche PAS à la géométrie pour autant : la corriger en amont
 * changerait ce que mesure et facture le reste du dépôt. Le lissage est
 * strictement un fait de tracé, local à ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CATMULL-ROM, PARCE QU'ELLE PASSE PAR LES POINTS
 *
 * C'est la seule propriété qui compte ici. Une courbe qui APPROCHE ses points
 * — Bézier lissante, B-spline — rognerait les extrémités du dessin, donc son
 * encombrement, sur un document dont tout l'objet est d'être à l'échelle 1.
 * Catmull-Rom passe exactement par chaque point relevé : la boîte du tracé ne
 * bouge pas d'un dixième de millimètre, seul le chemin entre deux points
 * change.
 *
 * Le sixième est la tension standard de la forme cardinale ; au-delà, la
 * courbe déborde entre les points au lieu de les relier.
 */
function cheminLisse(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length < 3) {
    return pts.map((q, i) => `${0 === i ? 'M' : 'L'}${F(q[0])} ${F(q[1])}`).join(' ');
  }
  const a = pts[0]!;
  const z = pts[pts.length - 1]!;
  const bouclee = Math.abs(a[0] - z[0]) < 0.01 && Math.abs(a[1] - z[1]) < 0.01;
  // Aux extrémités d'une ligne OUVERTE il n'y a pas de voisin : on répète le
  // point, ce qui rend le départ et l'arrivée droits — le comportement voulu
  // pour un trait qui commence. Une ligne fermée, elle, prend son voisin de
  // l'autre bout, sinon la jointure ferait un angle.
  const au = (i: number): readonly [number, number] => {
    if (i < 0) return bouclee ? pts[pts.length - 2]! : pts[0]!;
    if (i >= pts.length) return bouclee ? pts[1]! : pts[pts.length - 1]!;
    return pts[i]!;
  };
  let d = `M${F(a[0])} ${F(a[1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = au(i - 1), p1 = au(i), p2 = au(i + 1), p3 = au(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${F(c1x)} ${F(c1y)} ${F(c2x)} ${F(c2y)} ${F(p2[0])} ${F(p2[1])}`;
  }
  return d;
}

function feuille(
  c: ReturnType<typeof cadreFeuille>,
  o: GabaritPapierOptions,
  largeurMm: number,
  hauteurMm: number,
): string {
  const p = c.pavage;
  const parties: string[] = [];

  /*
   * L'ENCOMBREMENT, EN TRAIT PLEIN ET ÉPAIS.
   *
   * C'est LUI que le client découpe et scotche, pas la silhouette. Le rectangle
   * est tracé entier ; le navigateur et l'imprimante le coupent au bord de la
   * feuille, ce qui est le comportement voulu — le trait continue sur la
   * feuille voisine.
   */
  const gx = c.px(0);
  const gy = c.py(hauteurMm / 1000);
  parties.push(
    `<rect x="${F(gx)}" y="${F(gy)}" width="${F(largeurMm)}" height="${F(hauteurMm)}" class="encombrement"/>`,
  );

  // --- LA SILHOUETTE, EN TRAIT FIN -----------------------------------------
  //
  // Fine et grise : elle situe le dessin dans son encombrement, elle ne se
  // découpe pas. Un trait aussi fort que le contour ferait hésiter sur ce qu'il
  // faut couper.
  for (const ligne of o.contours ?? []) {
    if (ligne.length < 2) continue;
    const d = cheminLisse(ligne.map((pt) => [c.px(pt[0]), c.py(pt[1])] as const));
    /*
     * ON NE FERME QUE CE QUI EST DÉJÀ FERMÉ.
     *
     * Ce `Z` était inconditionnel. Il convient à un contour de plaque, qui
     * boucle ; il est FAUX sur un trajet de tube, qui ne boucle pas — et c'est
     * un trajet de tube que l'appelant fournit. Chaque lettre se retrouvait
     * reliée de sa fin à son début par une longue diagonale, et un « Hello »
     * imprimé ressemblait à un entrelacs.
     *
     * Constaté le 4 septembre 2026 sur un gabarit de 49 × 18 cm, après que la
     * silhouette a enfin commencé à s'afficher : le défaut existait avant, mais
     * rien ne le montrait tant que rien n'était tracé.
     *
     * Le critère est la géométrie, pas une option : une polyligne fermée a ses
     * deux extrémités confondues. La tolérance est le dixième de millimètre —
     * en dessous, deux points sont le même point sur du papier.
     */
    const a = ligne[0]!;
    const z = ligne[ligne.length - 1]!;
    const fermee = Math.abs(a[0] - z[0]) < 0.0001 && Math.abs(a[1] - z[1]) < 0.0001;
    parties.push(`<path d="${d}${fermee ? ' Z' : ''}" class="silhouette"/>`);
  }

  /*
   * LES COTES, SUR LA PREMIÈRE FEUILLE ET DANS SON COIN.
   *
   * Sur un gabarit large, l'encombrement dépasse de toutes les feuilles : une
   * cote répétée sur chacune afficherait six fois « 120 cm » sur six morceaux
   * qui n'en montrent qu'un sixième. Elle est donc écrite une fois, et l'en-tête
   * la rappelle en toutes lettres partout ailleurs.
   *
   * ET ELLE EST ANCRÉE AU COIN, PAS AU MILIEU. Placée au milieu de la pièce,
   * elle tombait à 300 mm sur une feuille qui s'arrête à 277 : dessinée, mais
   * hors de la zone visible, donc perdue. Vu en regardant la feuille, pas en
   * lisant le code — et c'est la même faute que l'entraxe qui pointait vers une
   * croix absente (docs/43 §37).
   *
   * Le coin haut-gauche de la pièce est, lui, TOUJOURS sur la première feuille :
   * c'est son origine.
   */
  if (1 === c.numero) {
    parties.push(texte(gx + 4, gy + 7, `${(largeurMm / 10).toFixed(0)} cm de large`, 5));
    parties.push(texte(gx + 4, gy + 15, `${(hauteurMm / 10).toFixed(0)} cm de haut`, 5));
  }

  parties.push(...hirondelles(c));
  // L'avertissement diffère de celui du gabarit de PERÇAGE : ici une échelle
  // fausse coûte une impression, pas quatre trous dans un mur.
  parties.push(...regleDeControle(c, 'vérifier avant de scotcher'));

  const entete = enteteCommune(c, `${o.reference} · GABARIT PAPIER, ÉCHELLE 1`);
  entete.push(texte(
    A4.largeurMm / 2, p.marge - 4,
    `${(largeurMm / 10).toFixed(0)} × ${(hauteurMm / 10).toFixed(0)} cm, taille réelle`,
    3.4, 'middle',
  ));
  /*
   * LA MENTION QUI ÉVITE LA CONFUSION AVEC LE GABARIT DE PERÇAGE.
   *
   * Les deux documents se ressemblent au premier coup d'œil. Celui-ci ne porte
   * aucun perçage, et l'enseigne ne se pose pas forcément là où son contour
   * tombe. Un client qui percerait d'après lui se tromperait.
   */
  entete.push(texte(
    A4.largeurMm / 2, A4.hauteurMm - p.marge - 3,
    'Pour VOIR la taille : ne pas percer d’après ce gabarit',
    3, 'middle',
  ));
  if (o.designation) {
    entete.push(texte(A4.largeurMm - p.marge, p.marge + 1, o.designation, 3, 'end'));
  }

  return enveloppeFeuille(c, `
  .encombrement { fill: none; stroke: #111; stroke-width: 0.8; }
  .silhouette { fill: none; stroke: #999; stroke-width: 0.4; }`,
  `${parties.join('\n')}\n${entete.join('\n')}`);
}
