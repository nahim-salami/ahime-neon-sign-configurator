/**
 * QUALITÉ ADAPTATIVE DE LA VUE 3D (E26, B40, lot 12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON JUGE LE TEMPS D'IMAGE, PAS L'APPAREIL
 *
 * `performance-3d-temps-reel` §5 est explicite : la qualité « se juge sur le
 * temps d'image MESURÉ, pas sur le modèle d'appareil ». La tentation inverse
 * est forte — lire l'agent utilisateur, chercher « Android », baisser — et elle
 * se trompe deux fois : elle punit un téléphone récent et elle laisse ramer un
 * vieil ordinateur portable.
 *
 * Un plafond de densité de pixels existe déjà (`min(devicePixelRatio, 2)`), et
 * il est sain : sans lui, un écran à 3 rend **neuf fois** les pixels d'un écran
 * ordinaire. Ce qui manquait, c'est que rien ne REDESCEND quand ça rame.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PALIERS DE LA COMPÉTENCE
 *
 * | Palier   | Densité      | Bloom | Ombres |
 * |----------|--------------|-------|--------|
 * | confort  | min(dpr, 2)  | oui   | oui    |
 * | réduit   | 1,5          | oui   | non    |
 * | secours  | 1,0          | non   | non    |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PIÈGES, QUI NE SONT PAS DANS LE TABLEAU
 *
 * **1. L'oscillation.** Un seuil unique fait battre la qualité d'un palier à
 * l'autre à chaque image, autour de la valeur limite. Et un battement se voit
 * BEAUCOUP plus qu'un palier plus bas tenu franchement : l'œil pardonne une
 * image moins fine, pas une image qui change de finesse dix fois par seconde.
 * D'où deux seuils par frontière — on descend plus tôt qu'on ne remonte.
 *
 * **2. Les premières images mentent.** Après une reconstruction, les shaders se
 * compilent, les textures montent sur la carte : les premières images sont
 * lentes chez tout le monde, y compris sur une machine puissante. Réagir à
 * elles enverrait chaque visiteur en « secours » dès l'ouverture, sur une scène
 * qui allait très bien tourner une seconde plus tard.
 *
 * On travaille donc sur une MOYENNE GLISSANTE, et on ne décide qu'une fois la
 * fenêtre remplie.
 */

export type Palier = 'confort' | 'reduit' | 'secours';

export interface Reglages {
  /** Densité de pixels à demander au rendu. */
  densite: number;
  bloom: boolean;
  ombres: boolean;
}

/**
 * Les seuils, en millisecondes par image.
 *
 * 16,7 ms est la cible d'un écran à 60 Hz ; la compétence demande « ≥ 30 images
 * par seconde en orbite » sur un milieu de gamme, soit 33,3 ms. On dégrade donc
 * au-delà de 33 ms, et on remonte nettement en dessous — l'écart entre les deux
 * EST l'hystérésis.
 */
export const SEUILS = Object.freeze({
  /** Au-delà, on descend d'un palier. */
  descendreMs: 33,
  /** En dessous, on remonte d'un palier. Franchement plus bas : c'est la garde
   *  contre l'oscillation, et elle vaut mieux qu'un battement visible. */
  remonterMs: 22,
});

/** Nombre d'images à observer avant de décider quoi que ce soit. */
export const FENETRE = 30;

export const REGLAGES: Readonly<Record<Palier, Readonly<Reglages>>> = Object.freeze({
  confort: Object.freeze({ densite: 2, bloom: true, ombres: true }),
  reduit: Object.freeze({ densite: 1.5, bloom: true, ombres: false }),
  secours: Object.freeze({ densite: 1, bloom: false, ombres: false }),
});

const ORDRE: readonly Palier[] = ['confort', 'reduit', 'secours'];

/**
 * Les réglages d'un palier, bornés par l'écran.
 *
 * La densité du palier « confort » est un PLAFOND, pas une consigne : demander
 * 2 sur un écran qui en a 1 ferait rendre quatre fois trop de pixels pour rien.
 */
export function reglagesDe(palier: Palier, densiteEcran: number): Reglages {
  const r = REGLAGES[palier];
  const dpr = Number.isFinite(densiteEcran) && densiteEcran > 0 ? densiteEcran : 1;
  return { ...r, densite: Math.min(r.densite, dpr) };
}

/**
 * Le juge : il mémorise les temps d'image et rend le palier à tenir.
 *
 * Un objet plutôt qu'une fonction pure, parce qu'une moyenne glissante EST un
 * état. Il reste testable dans Node — aucune dépendance au navigateur.
 */
export class JugeDeQualite {
  private readonly temps: number[] = [];

  private courant: Palier = 'confort';

  /** Vrai tant qu'on n'a pas assez d'images pour décider. */
  private assez = false;

  constructor(palierInitial: Palier = 'confort') {
    this.courant = palierInitial;
  }

  get palier(): Palier {
    return this.courant;
  }

  /** La moyenne observée, ou `null` tant que la fenêtre n'est pas remplie. */
  get moyenneMs(): number | null {
    if (this.temps.length < FENETRE) return null;
    return this.temps.reduce((s, v) => s + v, 0) / this.temps.length;
  }

  /**
   * Une image de plus.
   *
   * @param ms       Durée de l'image écoulée.
   * @param enMouvement La caméra est-elle en train d'orbiter ?
   * @returns Le palier après cette image.
   */
  image(ms: number, enMouvement = true): Palier {
    if (!Number.isFinite(ms) || ms <= 0) return this.courant;
    this.temps.push(ms);
    if (this.temps.length > FENETRE) this.temps.shift();
    if (this.temps.length < FENETRE) return this.courant;

    // Les premières images mentent : on ne décide qu'une fois la fenêtre
    // remplie UNE PREMIÈRE FOIS, et on la vide alors pour repartir propre.
    if (!this.assez) {
      this.assez = true;
      this.temps.length = 0;
      return this.courant;
    }

    const moyenne = this.temps.reduce((s, v) => s + v, 0) / this.temps.length;
    const i = ORDRE.indexOf(this.courant);

    if (moyenne > SEUILS.descendreMs && i < ORDRE.length - 1) {
      this.courant = ORDRE[i + 1]!;
      // On repart d'une fenêtre vide : juger le nouveau palier sur les images
      // de l'ancien le ferait redescendre en cascade jusqu'au secours.
      this.temps.length = 0;
      return this.courant;
    }

    /*
     * ON NE REMONTE QU'À L'ARRÊT.
     *
     * « Pendant une orbite, on peut baisser ; à l'arrêt, on remonte. C'est le
     * compromis que l'œil pardonne le mieux. » Remonter en plein mouvement
     * ferait sauter la qualité au milieu du geste — le moment précis où le
     * changement se voit le plus.
     */
    if (!enMouvement && moyenne < SEUILS.remonterMs && i > 0) {
      this.courant = ORDRE[i - 1]!;
      this.temps.length = 0;
    }
    return this.courant;
  }

  /** Après une reconstruction : les prochaines images vont mentir à nouveau. */
  reinitialiser(): void {
    this.temps.length = 0;
    this.assez = false;
  }
}
