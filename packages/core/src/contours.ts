/**
 * QUI EST UNE FORME, QUI EST UN TROU (E05, volet 3D).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A RENDU CE FICHIER NÉCESSAIRE
 *
 * Un traceur de contours rend TOUS les bords d'un masque : la silhouette du
 * « A », et aussi le triangle de sa contreforme. Extrudés séparément, le
 * triangle devient un volume plein posé sur la lettre — le « ABC » sort creusé,
 * avec le fond visible à travers.
 *
 * Constaté à la capture le 4 septembre 2026, jamais par un test : une géométrie
 * fausse compile parfaitement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCLUSION, PAS LE SENS DE PARCOURS
 *
 * On aurait pu trancher par l'aire signée : les extérieurs dans un sens, les
 * trous dans l'autre. C'est plus court et c'est fragile — le sens dépend de la
 * façon dont le traceur a suivi le bord, et il suffit d'une convention inverse
 * pour que tout bascule : un « O » deviendrait un disque, et son disque un
 * « O ». Le défaut serait alors total et silencieux.
 *
 * L'inclusion ne dépend de rien d'autre que de la géométrie. Un contour dont un
 * point est à l'intérieur d'un autre est dedans, quel que soit le sens dans
 * lequel l'un ou l'autre a été tracé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAIR-IMPAIR, ET LE PLUS PETIT PARENT
 *
 * Un contour inclus dans un nombre PAIR d'autres est une forme : zéro pour une
 * lettre posée seule, deux pour l'îlot au centre d'un « ⊙ ». Un nombre impair
 * en fait un trou. La règle gère les emboîtements profonds sans cas
 * particulier, là où « inclus dans quelque chose = trou » percerait l'îlot.
 *
 * Et le parent d'un trou est le plus PETIT de ses englobants. Sans cela, la
 * contreforme d'un « B » posé dans un cadre irait se rattacher au cadre, et le
 * « B » ressortirait plein.
 */

/** Un contour fermé, en unités quelconques. */
export type Contour2 = ReadonlyArray<readonly [number, number]>;

/** Le classement d'un jeu de contours. */
export interface ClassementContours {
  /** Indices des contours qui sont des formes pleines, dans l'ordre d'entrée. */
  formes: number[];
  /** Les trous, chacun avec l'indice du contour qu'il perce. */
  trous: Array<{ indice: number; parent: number }>;
}

/** Un point est-il à l'intérieur d'un contour ? Lancer de rayon vers la droite. */
export function pointDansContour(px: number, py: number, c: Contour2): boolean {
  let dedans = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i]!;
    const [xj, yj] = c[j]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/**
 * LA BOÎTE ENGLOBANTE, ET POURQUOI ELLE N'EST PAS UNE OPTIMISATION.
 *
 * `classerContours` teste chaque contour contre tous les autres, et chaque test
 * parcourt le contour visé : c'est O(n² · m). Sur un « ABC » cela passe. Sur un
 * « B » SEUL — rastérisé bien plus finement, puisque le canvas s'ajuste à
 * l'encre — l'onglet du navigateur **plante** : « Target crashed », sans
 * message ni pile.
 *
 * Ce n'est donc pas une question de vitesse mais de robustesse : un
 * configurateur qui meurt sur une lettre unique ne rend rien du tout, et un
 * client qui tape une initiale est un cas parfaitement ordinaire.
 *
 * Le rejet par boîte est exact — un point hors de la boîte est hors du contour,
 * toujours — et ramène l'immense majorité des paires à quatre comparaisons.
 */
interface Boite { x0: number; y0: number; x1: number; y1: number }

function boiteDe(c: Contour2): Boite {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const horsBoite = (px: number, py: number, b: Boite): boolean =>
  px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1;

/** L'aire absolue d'un contour — sert à choisir le plus petit englobant. */
export function aireContour(c: Contour2): number {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    a += c[j]![0] * c[i]![1] - c[i]![0] * c[j]![1];
  }
  return Math.abs(a) / 2;
}

/**
 * Classe des contours en formes et en trous.
 *
 * Les contours de moins de trois points sont ignorés : ils ne délimitent rien,
 * et les garder ferait des formes d'aire nulle qu'aucun moteur ne sait extruder.
 */
export function classerContours(contours: readonly Contour2[]): ClassementContours {
  const out: ClassementContours = { formes: [], trous: [] };
  const utiles = contours
    .map((c, i) => ({ c, i, boite: boiteDe(c), aire: aireContour(c) }))
    .filter(({ c }) => c.length >= 3);

  for (const { c, i } of utiles) {
    const px = c[0]![0];
    const py = c[0]![1];
    const englobants = utiles.filter(
      ({ c: autre, i: j, boite }) =>
        j !== i && !horsBoite(px, py, boite) && pointDansContour(px, py, autre),
    );
    if (0 === englobants.length % 2) {
      out.formes.push(i);
      continue;
    }
    // Les aires sont calculées une fois, à l'entrée : les recalculer ici
    // rendrait la boucle quadratique une seconde fois.
    let choisi = englobants[0]!;
    for (const e of englobants) if (e.aire < choisi.aire) choisi = e;
    out.trous.push({ indice: i, parent: choisi.i });
  }
  return out;
}
