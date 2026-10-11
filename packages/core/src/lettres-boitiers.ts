/**
 * LETTRES BOÎTIERS — combien de modules, en combien de rangées (écart E05).
 *
 * Une lettre boîtier n'est pas une surface qu'on éclaire : c'est un caisson à la
 * forme de la lettre, dans lequel on pose des RANGÉES de modules le long du
 * tracé. Le nombre de rangées dépend de la largeur du trait et de la profondeur
 * du retour ; le nombre de modules dépend de la longueur du tracé.
 *
 * Ce module ne fait pas de prix. Il donne à l'atelier ce qu'il commande, et à la
 * validation de quoi refuser une lettre que personne ne peut allumer.
 *
 * ── D'où viennent les chiffres ──────────────────────────────────────────────
 *
 * `ressources/composants/principal-sloan-densite-lettres-boitiers-guide.pdf`,
 * gamme **Qwik Mod 12 V Gen 2 Small**, recopiée telle quelle :
 *
 * | Profondeur | Modules/pied | Trait max. 1 rangée | Entraxe multi-rangées |
 * |---|---|---|---|
 * | 2″ | 4 | 5″ | 3″ |
 * | 3″ | 2 | 8″ | 6″ |
 * | 4″ | 1,5 | 12″ | 10″ |
 * | 5″ | 1,5 | 14″ | 12″ |
 *
 * **Pourquoi cette gamme et pas une autre.** Le guide en tabule une dizaine, et
 * elles ne s'accordent pas : à 3 pouces de profondeur, la Qwik Small couvre 8″
 * de trait quand la Prism Mini en couvre 10″ et la Spec aussi. Prendre la plus
 * généreuse ferait annoncer une rangée là où il en faut deux, et livrer une
 * lettre sombre. On prend donc la plus CONSERVATRICE des gammes courantes :
 * une rangée de trop se voit sur la facture, une rangée de moins se voit sur le
 * mur.
 *
 * Un marchand qui travaille avec une autre gamme remplace la table par la
 * sienne — c'est un coefficient, pas une constante.
 */

/** Une ligne de la table de densité d'un fabricant. */
export interface DensiteModules {
  /** Profondeur du retour (mm). */
  profondeurMm: number;
  /** Modules par mètre de rangée. */
  modulesParMetre: number;
  /** Largeur de trait qu'UNE rangée éclaire (mm). */
  traitMaxUneRangeeMm: number;
  /** Entraxe entre rangées au-delà (mm). */
  entraxeMm: number;
}

const PO = 25.4;

/**
 * Qwik Mod 12 V Gen 2 Small — la table du guide, convertie en millimètres.
 *
 * Les modules par pied deviennent des modules par mètre : 4/pied = 13,1/m.
 */
export const DENSITE_QWIK_SMALL: DensiteModules[] = [
  { profondeurMm: 2 * PO, modulesParMetre: 4 / 0.3048, traitMaxUneRangeeMm: 5 * PO, entraxeMm: 3 * PO },
  { profondeurMm: 3 * PO, modulesParMetre: 2 / 0.3048, traitMaxUneRangeeMm: 8 * PO, entraxeMm: 6 * PO },
  { profondeurMm: 4 * PO, modulesParMetre: 1.5 / 0.3048, traitMaxUneRangeeMm: 12 * PO, entraxeMm: 10 * PO },
  { profondeurMm: 5 * PO, modulesParMetre: 1.5 / 0.3048, traitMaxUneRangeeMm: 14 * PO, entraxeMm: 12 * PO },
];

/**
 * Trait le plus étroit qu'une lettre lumineuse puisse avoir, en millimètres.
 *
 * Le guide de densité descend à **1,5 pouce**, soit 38,1 mm, et pas plus bas :
 * en dessous, aucune ligne de table ne couvre le cas, et il n'y a physiquement
 * plus la place pour un module entre les deux retours. On arrondit à **40 mm**,
 * du côté sûr.
 *
 * La compétence `lettres-boitiers` annonçait « trait minimal 40 mm » sans dire
 * d'où il venait ; il vient de là.
 */
export const TRAIT_MINIMAL_MM = 40;

/** La ligne de table qui s'applique à une profondeur donnée. */
function ligneDeTable(profondeurMm: number, table: DensiteModules[]): DensiteModules {
  const triee = [...table].sort((a, b) => a.profondeurMm - b.profondeurMm);
  // Sous la première profondeur tabulée, on retient la première : c'est la plus
  // dense, donc la plus prudente. Au-dessus de la dernière, la dernière — un
  // retour plus profond n'éclaire pas moins bien.
  let choisie = triee[0]!;
  for (const l of triee) {
    if (profondeurMm >= l.profondeurMm) choisie = l;
  }
  return choisie;
}

export interface PlanModules {
  /** Nombre de rangées de modules le long du tracé. */
  rangees: number;
  /** Nombre de modules à commander, arrondi au module entier supérieur. */
  modules: number;
  /** Profondeur retenue dans la table (mm) — utile pour tracer la décision. */
  profondeurTabuleeMm: number;
  /** Le trait est-il trop fin pour qu'une lettre s'allume ? */
  traitTropFin: boolean;
}

/**
 * Le plan de modules d'une lettre boîtier.
 *
 * @param traitMm      Largeur du trait de la lettre (mm).
 * @param longueurCm   Longueur du TRACÉ de la lettre (cm) — la ligne médiane,
 *                     celle que le manifeste de police mesure déjà.
 * @param profondeurMm Profondeur du retour (mm).
 * @param table        Table de densité ; à défaut, la Qwik Mod Small.
 */
export function planModulesLettre(
  traitMm: number,
  longueurCm: number,
  profondeurMm: number,
  table: DensiteModules[] = DENSITE_QWIK_SMALL,
): PlanModules {
  const ligne = ligneDeTable(profondeurMm, table);
  const trait = Math.max(0, traitMm);
  const longueurM = Math.max(0, longueurCm) / 100;

  if (trait <= 0 || longueurM <= 0) {
    return { rangees: 0, modules: 0, profondeurTabuleeMm: ligne.profondeurMm, traitTropFin: trait > 0 && trait < TRAIT_MINIMAL_MM };
  }

  // UNE rangée tant que le trait tient dans ce qu'elle éclaire ; au-delà, on
  // divise par l'ENTRAXE et non par la couverture d'une rangée seule — les
  // rangées se recouvrent, c'est la raison d'être de la seconde colonne.
  const rangees = trait <= ligne.traitMaxUneRangeeMm
    ? 1
    : Math.ceil(trait / ligne.entraxeMm);

  return {
    rangees,
    // On commande des modules entiers, et jamais zéro sur une lettre qui existe.
    modules: Math.max(1, Math.ceil(rangees * longueurM * ligne.modulesParMetre)),
    profondeurTabuleeMm: ligne.profondeurMm,
    traitTropFin: trait < TRAIT_MINIMAL_MM,
  };
}

// ---------------------------------------------------------------------------
// LA CONSTRUCTION D'UNE LETTRE BOÎTIER — retour, face, trim cap (E05, volet 3D)
// ---------------------------------------------------------------------------

/**
 * LE BISEAU QUI N'EXISTE SUR AUCUNE LETTRE BOÎTIER.
 *
 * `lettres-boitiers` §7 est catégorique : « Le corps est un `BoxGeometry` +
 * extrusion biseautée : remplacer par **retour + face + trim cap**. Le biseau
 * actuel n'existe sur aucune lettre boîtier. »
 *
 * Et c'est vrai de la fabrication : une lettre boîtier est une **coque** — un
 * retour d'aluminium plié refermé sur un fond, une face d'acrylique posée
 * dessus, un trim cap qui pince les deux. Il n'y a nulle part une arête cassée
 * à 45° ; le biseau est le geste d'une fraise dans un bloc plein, c'est-à-dire
 * exactement l'autre construction.
 *
 * Une lettre DÉCOUPÉE, elle, est massive, et son arête est bien celle d'un
 * outil : le biseau y reste juste. Ce module dit donc laquelle est laquelle,
 * plutôt que d'appliquer le même geste aux deux.
 */

/**
 * Largeurs de ruban du trim cap, en millimètres.
 *
 * Relevé sur `ressources/composants/gemini-gemtrim-trim-cap-fiche.pdf` :
 * « Available 3/4", 1", or 2" wide ». Verdict `juste` — 19,05 · 25,4 · 50,8.
 */
export const TRIM_LARGEURS_MM = [19.05, 25.4, 50.8] as const;

/** D'où vient une cote : lue sur une fiche, ou pas connue du tout. */
export type OrigineCote = 'fiche' | 'inconnue';

/** Ce qu'il faut pour dessiner une lettre — et d'où vient chaque cote. */
export interface ConstructionLettre {
  /** `channel` : coque. `solid` : bloc massif (lettre découpée). */
  construction: 'channel' | 'solid';
  /** Le biseau d'arête est-il légitime ? Faux sur un boîtier. */
  biseau: boolean;
  /** Largeur de ruban du trim cap, en millimètres. `0` s'il n'y en a pas. */
  trimRubanMm: number;
  /**
   * Largeur du trim cap VISIBLE en façade, en millimètres — ou `null`.
   *
   * ── POURQUOI ELLE EST `null`, ET LE RESTE ───────────────────────────────
   *
   * La fiche GemTrim donne la largeur du **ruban** (3/4″, 1″, 2″), pas sa
   * répartition entre l'aile qui couvre la face et celle qui descend sur le
   * retour. Ce sont deux grandeurs différentes, et seule la seconde se voit de
   * face.
   *
   * Une première version posait « la moitié du ruban ». Le rendu l'a réfutée
   * en une image : 9,5 mm de liseré sur chaque bord d'un trait de 30 mm ne
   * laissent plus de face, et les lettres d'un « ABC » se rejoignaient en une
   * masse. Ce n'était pas une approximation grossière, c'était une cote
   * inventée — exactement ce que la règle 2 de CLAUDE.md interdit sur un
   * composant acheté.
   *
   * Elle vaut donc `null`, et `origineTrimVisible` dit `inconnue`. Le jour où
   * un marchand donne la référence de son trim, c'est un coefficient qui
   * arrive, pas une constante à corriger.
   */
  trimVisibleMm: number | null;
  origineTrimVisible: OrigineCote;
}

/**
 * Comment se construit une lettre, selon qu'elle est lumineuse ou non.
 *
 * @param lumineuse Un éclairage autre que `none`.
 * @param trimRubanMm Largeur de ruban choisie ; par défaut le 3/4".
 */
export function constructionLettre(
  lumineuse: boolean,
  trimRubanMm: number = TRIM_LARGEURS_MM[0],
): ConstructionLettre {
  if (!lumineuse) {
    /*
     * Une lettre découpée n'a ni retour, ni face rapportée, ni trim cap : elle
     * est taillée dans la masse. Son arête EST celle de l'outil, et le biseau
     * y est le seul rendu juste.
     */
    return {
      construction: 'solid',
      biseau: true,
      trimRubanMm: 0,
      trimVisibleMm: 0,
      origineTrimVisible: 'fiche',
    };
  }
  return {
    construction: 'channel',
    biseau: false,
    trimRubanMm,
    trimVisibleMm: null,
    origineTrimVisible: 'inconnue',
  };
}
