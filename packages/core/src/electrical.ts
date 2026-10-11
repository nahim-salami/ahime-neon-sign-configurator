/**
 * PLAN ÉLECTRIQUE d'un néon — ce que l'atelier doit sortir du magasin et câbler.
 *
 * Deux chiffres manquaient à la spécification, et ce sont deux chiffres de
 * physique, pas de prix :
 *
 *   L'ALIMENTATION. La puissance appelée (longueur × W/m) n'est pas la
 *   puissance du transformateur à commander. Une enseigne allumée toute la
 *   journée est une charge continue : la pratique constante est de ne pas
 *   dépasser 70 à 80 % de la sortie nominale, faute de quoi la durée de vie
 *   s'effondre — et la courbe de dérating fait encore tomber la sortie utile
 *   quand la température ambiante monte. Un néon de 5 m à 12 W/m appelle
 *   exactement 60 W : sur un transfo 60 W, c'est 100 % de charge en continu.
 *
 *   LES BRANCHES. Le tube ne s'alimente pas indéfiniment par un bout : la
 *   tension chute le long du conducteur. En 12 V, une branche tient environ
 *   5 m (la longueur d'une couronne) ; en 24 V, environ 10 m. Un design de
 *   25 m — la limite autorisée — n'est donc pas un tube, c'est cinq branches
 *   câblées en parallèle. Personne ne le disait à l'atelier.
 *
 * Ce module ne touche PAS au prix. Il décrit ce qu'il faut poser. Le tarif de
 * l'alimentation reste piloté par `powerTiersCents` (docs/04 §2), calibré sur
 * le marché — si la marge de sécurité rend ces paliers insuffisants, c'est une
 * décision commerciale à instruire, pas un coefficient à corriger en douce.
 */

import type { PricingCoefficients } from './coefficients.js';

/** Caractéristiques du tube LED du catalogue marchand. */
export interface TubeSpec {
  /** Diamètre du tube (mm) — 8 mm fin, 10 mm standard. */
  diameterMm: number;
  /**
   * Rayon de courbure minimal (mm). Le néon flex à flexion latérale accepte
   * 30 mm sur les profils fins, 60 mm sur les profils standard. En dessous,
   * le silicone se plisse et les LED se décollent. Sert à la documentation
   * d'atelier ; les angles d'un glyphe, eux, se coupent au lieu de se plier
   * (voir `corners` dans le manifeste de police).
   */
  bendRadiusMm: number;
  /**
   * Part du diamètre du tube que le trait de la lettre doit au moins
   * atteindre. 0,5 = on refuse quand le tube fait plus du double du trait :
   * à ce stade la lettre se boucle sur elle-même et l'objet livré n'a plus de
   * rapport avec la police choisie. Relevé sur les trente polices du pack, ce
   * seuil ne mord que sur les cursives les plus fines et sur Monoton.
   */
  minStrokeRatio: number;
  /** Tension du catalogue. */
  voltage: 12 | 24;
  /** Longueur maximale d'une branche alimentée par une extrémité (m). */
  maxBranchM: number;
  /** Taux de charge visé de l'alimentation (0,8 = 80 %). */
  psuLoadFactor: number;
  /**
   * Le câble livré entre le tube et le bloc : longueur (m) et section (mm²).
   *
   * RÉGLAGES DU MARCHAND, pas des constantes : ce qui est livré dépend de ce
   * qui est acheté. Les défauts — 2 m de 2 × 0,5 mm² — correspondent à l'usage
   * courant (Custom Neon annonce 1,5 m, puis 0,9 à 1,8 m de câble noir), mais
   * la section n'est sourcée par aucune fiche du fonds : la compétence
   * `assemblage-cablage-composants` la range explicitement parmi ses valeurs
   * non sourcées. Un marchand qui livre du 1 mm² doit le dire ici.
   */
  cableLengthM: number;
  cableSectionMm2: number;
  /**
   * PAS DE COUPE du tube, en millimètres (écart E16).
   *
   * Un néon flex ne se coupe pas où l'on veut : il porte des repères, et entre
   * deux repères le circuit n'est pas refermé. Une lettre qui demande 43 cm de
   * tube en consomme donc 45 si le pas est de 50 mm.
   *
   * RÉGLAGE DU MARCHAND, pas une constante : le pas dépend de la bobine
   * achetée. Relevé dans le fonds — CIP 6 × 12 « Cut Length: 50 mm », Flexfire
   * « can be cut every 1″ (25 mm) » en 12 V et « every 2″ (50 mm) » ailleurs,
   * Magiclite NFLX « cuttable every 4″ » soit 102 mm. La plage va donc de 25 à
   * 102 mm, et le défaut de 50 est la valeur la plus répandue.
   */
  cutPitchMm: number;
  /**
   * Sens de cintrage de la bobine (écart E16).
   *
   * `lateral` — le tube plie dans le plan de la face, ce qu'il faut pour des
   * lettres à plat. `vertical` — il plie perpendiculairement, pour un bandeau
   * qui suit une corniche. Une bobine ne fait pas les deux : Flexfire le dit
   * sans détour, « bending it up and down could damage the LED strip light ».
   *
   * Sert à la fiche d'atelier et au choix de bobine ; aucun calcul ne s'y
   * appuie encore.
   */
  bendDirection: 'lateral' | 'vertical';
  /**
   * Chute de tension admise dans ce câble, en part de la tension (0,03 = 3 %).
   *
   * Cible de physique générale, pas davantage tirée d'une fiche : au-delà, le
   * bout du tube s'assombrit visiblement par rapport au départ.
   */
  maxDropRatio: number;
}

export const DEFAULT_TUBE: TubeSpec = {
  diameterMm: 10,
  bendRadiusMm: 30,
  voltage: 12,
  maxBranchM: 5,
  psuLoadFactor: 0.8,
  minStrokeRatio: 0.5,
  cutPitchMm: 50,
  bendDirection: 'lateral',
  cableLengthM: 2,
  cableSectionMm2: 0.5,
  maxDropRatio: 0.03,
};

/**
 * Résistivité du cuivre recuit à 20 °C, en Ω·mm²/m.
 *
 * C'est une constante de MATÉRIAU, pas de composant acheté : elle vaut 1/58,
 * la conductivité de référence du cuivre recuit (IACS 100 %), et c'est la
 * valeur employée partout pour dimensionner un câble.
 *
 * Deux réserves, écrites ici parce qu'elles décident du SENS de l'erreur : le
 * cuivre chauffe, et sa résistivité monte d'environ 0,4 % par degré ; et un
 * câble du commerce a une section réelle inférieure à sa section nominale. Le
 * calcul ci-dessous est donc OPTIMISTE — la chute réelle est un peu plus forte,
 * jamais plus faible. C'est le bon sens pour une marge de sécurité.
 */
export const RHO_CUIVRE = 0.0172;

/**
 * Puissances nominales d'alimentation. On ne commande pas « 46,2 W » : on
 * commande le calibre au-dessus.
 *
 * CETTE ÉCHELLE EST UN DÉFAUT, PAS UNE VÉRITÉ. Elle dépend de ce que le
 * marchand achète, et un calibre est un composant acheté — donc pas une
 * constante du code (CLAUDE.md règle 2). Les douze blocs effectivement
 * documentés dans `ressources/alimentations/` sortent à 36, 60, 75,6, 81,6,
 * 100,8, 102, 150 et 151,2 W : CINQ de ces huit valeurs ne sont pas dans
 * l'échelle ci-dessous. Une demande de 78 W fait donc annoncer « 100 W » à la
 * fiche d'atelier, là où la référence réellement commandée est un HLG-80H de
 * 81,6 W.
 *
 * L'échelle reste le défaut pour ne rien déplacer sans qu'on le demande ; un
 * marchand qui renseigne `coefficients.psuRatingsW` fait annoncer ses vraies
 * références.
 */
export const PSU_RATINGS_W = [12, 20, 25, 30, 36, 40, 50, 60, 75, 100, 120, 150, 200, 240, 300, 350, 400];

export interface ElectricalPlan {
  /** Puissance appelée par le tube (W). */
  demandW: number;
  /** Puissance nominale de l'alimentation à commander (W). */
  psuW: number;
  /** Nombre de branches à câbler en parallèle. */
  branches: number;
  /** Tension retenue. */
  voltage: number;
  /** Longueur maximale d'une branche (m). */
  maxBranchM: number;
  /** Taux de charge effectif de l'alimentation retenue (0–1). */
  loadFactor: number;
  /** Chute de tension dans le câble livré (V). */
  cableDropV: number;
  /** La même, en part de la tension (0,057 = 5,7 %). */
  cableDropRatio: number;
  /**
   * Section qu'il faudrait pour tenir la cible (mm²) — égale à la section
   * livrée quand celle-ci suffit. C'est le chiffre utile à l'atelier : il dit
   * quoi commander, là où un « hors tolérance » ne dit rien.
   */
  cableSectionNeededMm2: number;
}

/**
 * Calibre d'alimentation au-dessus d'une puissance donnée.
 *
 * @param calibres Échelle du marchand ; à défaut, `PSU_RATINGS_W`.
 */
export function psuRatingFor(watts: number, calibres?: readonly number[]): number {
  const echelle = calibres && calibres.length > 0 ? [...calibres].sort((a, b) => a - b) : PSU_RATINGS_W;
  for (const r of echelle) {
    if (watts <= r) return r;
  }
  // Au-delà du plus gros calibre : arrondi à la centaine supérieure, l'atelier
  // posera plusieurs alimentations.
  return Math.ceil(watts / 100) * 100;
}

/**
 * Plan électrique d'un design.
 *
 * @param tubeLengthM Longueur de tube (m) — celle du manifeste, qui fait foi.
 * @param coeff       Coefficients (pour `wattsPerMeter` et le bloc `tube`).
 * @param demandeW    Puissance appelée, quand l'appelant l'a calculée bobine par
 *                    bobine (`wattsDemandes`). Absente, on retombe sur
 *                    `tubeLengthM × wattsPerMeter`, qui est le calcul d'origine.
 *                    Ce paramètre existe pour que le plan n'ait pas besoin de la
 *                    configuration entière : il ne connaît que de l'électricité.
 */
export function electricalPlan(
  tubeLengthM: number,
  coeff: PricingCoefficients,
  demandeW?: number,
): ElectricalPlan {
  const tube = coeff.tube ?? DEFAULT_TUBE;
  const demandW = typeof demandeW === 'number' && demandeW >= 0
    ? demandeW
    : tubeLengthM * coeff.wattsPerMeter;
  const facteur = tube.psuLoadFactor > 0 && tube.psuLoadFactor <= 1 ? tube.psuLoadFactor : 0.8;
  const psuW = demandW > 0 ? psuRatingFor(demandW / facteur, coeff.psuRatingsW) : 0;
  const maxBranchM = tube.maxBranchM > 0 ? tube.maxBranchM : DEFAULT_TUBE.maxBranchM;

  // CHUTE DE TENSION DANS LE CÂBLE LIVRÉ (écart E08).
  //
  //   ΔU = 2 · ρ · L · I / S
  //
  // Le 2 est l'aller-retour : le courant descend par un conducteur et remonte
  // par l'autre, et les deux chutent. C'est l'oubli classique, et il divise le
  // résultat par deux.
  //
  // Ce que ça vaut : 5 m de tube à 12 W/m en 12 V tirent 5 A ; sur 2 m de
  // 0,5 mm², ΔU = 0,69 V, soit 5,7 % — le bout du tube s'assombrit. Il faut
  // alors 1 mm², ou passer en 24 V, qui divise le courant par deux et donc la
  // chute relative par quatre.
  const longueur = tube.cableLengthM ?? DEFAULT_TUBE.cableLengthM;
  const section = tube.cableSectionMm2 ?? DEFAULT_TUBE.cableSectionMm2;
  const cible = tube.maxDropRatio ?? DEFAULT_TUBE.maxDropRatio;
  const courant = tube.voltage > 0 ? demandW / tube.voltage : 0;
  const chuteV = section > 0 && longueur > 0 ? (2 * RHO_CUIVRE * longueur * courant) / section : 0;
  const ratio = tube.voltage > 0 ? chuteV / tube.voltage : 0;
  // À chute admissible fixée, la section requise est inversement
  // proportionnelle : on y remonte directement, sans itérer sur un catalogue.
  const sectionNecessaire = ratio > cible && cible > 0
    ? (2 * RHO_CUIVRE * longueur * courant) / (cible * tube.voltage)
    : section;

  return {
    demandW: Math.round(demandW * 10) / 10,
    psuW,
    branches: tubeLengthM > 0 ? Math.max(1, Math.ceil(tubeLengthM / maxBranchM)) : 0,
    voltage: tube.voltage,
    maxBranchM,
    loadFactor: psuW > 0 ? Math.round((demandW / psuW) * 100) / 100 : 0,
    cableDropV: Math.round(chuteV * 1000) / 1000,
    cableDropRatio: Math.round(ratio * 10000) / 10000,
    cableSectionNeededMm2: Math.round(sectionNecessaire * 100) / 100,
  };
}

/**
 * LONGUEUR DE TUBE RÉELLEMENT CONSOMMÉE, en mètres.
 *
 * Chaque BRIN se coupe au repère suivant : un brin de 43 cm en consomme 45 si
 * le pas est de 50 mm. La perte est donc proportionnelle au NOMBRE DE BRINS, et
 * pas à la longueur — c'est ce qui la rend visible sur un texte à trente
 * lettres et négligeable sur un mot d'un seul tenant.
 *
 * @param longueurM Longueur utile totale (m), celle du manifeste.
 * @param brins     Nombre de brins séparés. Un seul par défaut : c'est la
 *                  borne BASSE de la perte, jamais une sous-estimation
 *                  déguisée en certitude.
 * @param pasMm     Pas de coupe ; à défaut, celui de `DEFAULT_TUBE`.
 */
export function longueurCoupeeM(longueurM: number, brins = 1, pasMm = DEFAULT_TUBE.cutPitchMm): number {
  const pas = pasMm > 0 ? pasMm : DEFAULT_TUBE.cutPitchMm;
  const n = Math.max(1, Math.round(brins));
  const L = Math.max(0, longueurM);
  if (L <= 0) return 0;
  // Chaque brin porte en moyenne L/n, et se coupe au repère au-dessus.
  const parBrinMm = (L * 1000) / n;
  return Math.round(((n * Math.ceil(parBrinMm / pas) * pas) / 1000) * 1000) / 1000;
}

/** Ce que la coupe fait perdre, en mètres. */
export function perteDeCoupeM(longueurM: number, brins = 1, pasMm = DEFAULT_TUBE.cutPitchMm): number {
  return Math.round((longueurCoupeeM(longueurM, brins, pasMm) - Math.max(0, longueurM)) * 1000) / 1000;
}
