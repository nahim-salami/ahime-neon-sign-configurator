/**
 * Panneaux, enseignes et caissons lumineux.
 *
 * Jusqu'ici le produit n'était qu'un néon posé sur un fond. Deux familles
 * manquaient, et ce sont celles qui font vivre un atelier d'enseignes :
 *
 *   PANNEAU — une plaque de matière découpée et imprimée. Elle se vend au m²,
 *   pas au mètre de tube : la formule du néon ne s'y applique pas du tout.
 *
 *   CAISSON LUMINEUX — une boîte à face translucide, éclairée de l'intérieur.
 *   Sa puissance ne se déduit pas d'une longueur de tube mais d'une SURFACE à
 *   éclairer uniformément — c'est une autre physique, donc une autre formule.
 *
 * Ce fichier ne contient QUE ce que ces deux familles ont de propre. Ce qui
 * leur est commun avec le néon (mise en route, extérieur, express, paliers de
 * taille) reste dans `pricing.ts` : une seule règle, appliquée partout.
 */

import { entraxeModulesMm } from './caisson.js';

/** Matières de panneau. Chacune a son tarif au m² et ses épaisseurs. */
export type PanelMaterial = 'pvc' | 'dibond' | 'aluminium' | 'plexi' | 'bois';

/** Ce qu'on fait de la plaque. */
export type PanelFinish =
  | 'raw'          // brute, juste découpée
  | 'printed'      // impression numérique directe
  | 'printed-lam'  // impression + pelliculage (extérieur, anti-UV)
  | 'letters'      // lettres découpées et collées en relief
  | 'engraved';    // gravure

/** Découpe du contour. */
export type PanelCut = 'rect' | 'rounded' | 'shape';

export interface PanelSpec {
  material: PanelMaterial;
  /** Épaisseur en millimètres — elle doit exister pour la matière choisie. */
  thicknessMm: number;
  finish: PanelFinish;
  cut: PanelCut;
  /** Impression au dos aussi (double face). */
  doubleSided?: boolean;
  /** Lettres découpées/boîtiers fixées sur la plaque. */
  channelLetters?: {
    material: 'acrylic' | 'wood' | 'metal';
    depthMm: number;
    faceColor: string;
    sideColor: string;
    lighting: 'none' | 'front' | 'back' | 'front-back';
    glowColor: string;
    backboardLayers: Array<{
      material: 'acrylic' | 'wood' | 'metal';
      color: string;
      thicknessMm: number;
      extensionCm: number;
    }>;
  };
}

export interface BoxSignSpec {
  /** Matière du corps du caisson. */
  material: PanelMaterial;
  /** Profondeur du caisson (cm) : c'est elle qui donne l'uniformité de la lumière. */
  depthCm: number;
  /** Face avant seule, ou avant + arrière. */
  faces: 1 | 2;
  /** La face lumineuse est-elle imprimée ? */
  printedFace: boolean;
}

// ---------------------------------------------------------------------------
// Catalogue des matières
// ---------------------------------------------------------------------------

export interface MaterialSpec {
  label: string;
  /** Épaisseurs disponibles (mm), de la plus fine à la plus épaisse. */
  thicknessesMm: number[];
  /** Tarif de la matière au m², PAR MILLIMÈTRE d'épaisseur (centimes). */
  perM2PerMmCents: number;
  /** Part incompressible au m² : manutention, chutes, façonnage (centimes). */
  baseM2Cents: number;
  /** Convient-il à l'extérieur sans traitement ? */
  outdoorReady: boolean;
  /**
   * FORMAT DE LA PLAQUE D'ACHAT, en millimètres (écart E18).
   *
   * `materiaux-enseigne` §2 : « le format de la plaque d'achat est un paramètre
   * MARCHAND par matière », et sa règle de sortie est catégorique — « ne jamais
   * ajouter une matière au catalogue sans son format d'achat et sa méthode de
   * découpe : c'est la chute et la machine qui font le prix, pas le m². »
   *
   * Il ne change AUCUN prix aujourd'hui : le tarif reste au m². Il sert au coût
   * de revient (B36), qui prend le rectangle prélevé et non le contour, et il
   * dira demain si une pièce entre dans une plaque.
   */
  formatAchatMm: { largeur: number; hauteur: number };
  /**
   * Ce qui coupe cette matière — et ce qui ne la coupe pas.
   *
   * Deux interdictions viennent de la chimie, pas du goût : le **PVC au laser
   * dégage du chlore**, et le **polycarbonate jaunit** au laser. Les écrire
   * dans le catalogue évite qu'un atelier les découvre à la première plaque.
   */
  decoupe: ReadonlyArray<'laser' | 'cnc' | 'cisaille'>;
  /** Pourquoi une méthode manque, quand la raison n'est pas évidente. */
  decoupeNote?: string;
}

/**
 * Tarifs par défaut, calibrés sur le marché européen de la signalétique.
 *
 * Le prix d'une plaque n'est pas proportionnel à son épaisseur seule : il y a
 * une part fixe au m² (manutention, chutes, façonnage) et une part qui suit
 * l'épaisseur. Un modèle purement proportionnel sous-facture les plaques fines
 * et surfacture les épaisses — c'est l'erreur classique.
 */
/**
 * MASSES VOLUMIQUES DES MATIÈRES, EN kg/m³ — relevées sur fiche (écart E18).
 *
 * Sans elles, aucune masse ne se calcule, donc aucune fixation ne se
 * dimensionne : c'est le chaînon qui manquait entre le catalogue et la
 * mécanique. Chaque valeur porte sa fiche ; celle qui n'en a pas le dit.
 *
 * | Matière | Fiche | Valeur |
 * |---|---|---|
 * | PVC expansé | `pvc-expanse-forex-…` et `…-foamalite-…` | 400 à 700 selon la qualité, ISO 1183 |
 * | Aluminium | `aluminium-5754-gleich-…` / `…-1050a-bikar-…` | 2 670 et 2 700 |
 * | PMMA | `pmma-plexiglas-gs-xt-rohm-…` | 1 190, ISO 1183 |
 * | Polycarbonate | `polycarbonate-makrolon-gp-…` | 1 200, ISO 1183-1 |
 *
 * Le **Dibond n'a pas de masse volumique utile** : c'est un composite, deux
 * peaux d'aluminium de 0,3 mm sur une âme polyéthylène. Sa masse ne varie pas
 * proportionnellement à l'épaisseur, et `masseKgM2` le traite à part.
 *
 * Le **bois** n'a aucune fiche dans le fonds : sa valeur est marquée non
 * sourcée plutôt que devinée, et un devis qui s'appuie dessus doit le savoir.
 */
export const MASSE_VOLUMIQUE_KG_M3: Record<PanelMaterial, number> = {
  // Milieu de la plage 400-700 des deux fiches 3A Composites. Une qualité
  // donnée peut s'en écarter de 40 % : c'est la matière la plus incertaine du
  // catalogue, et c'est aussi la plus légère, donc la moins critique.
  pvc: 500,
  // Valeur de façade : `masseKgM2` ne l'emploie PAS pour le Dibond, qui est
  // traité comme le composite qu'il est. Elle sert seulement à ce que le
  // registre soit complet.
  dibond: 0,
  // 5754 (le plus courant en enseigne) à 2 670, 1050A à 2 700.
  aluminium: 2_670,
  plexi: 1_190,
  // NON SOURCÉ — aucune fiche bois dans le fonds. Ordre de grandeur admis pour
  // du peuplier sec ; à remplacer dès qu'une fiche entre au fonds.
  bois: 450,
};

/**
 * Masse d'un mètre carré de plaque, en kg.
 *
 * Le Dibond fait exception et c'est vérifiable : sa fiche donne 2,9 / 3,8 /
 * 4,7 / 6,6 kg/m² pour 2 / 3 / 4 / 6 mm — une progression qui n'est pas
 * proportionnelle, parce que les deux peaux d'aluminium de 0,3 mm pèsent
 * autant quelle que soit l'âme. Le modèle « deux peaux + âme polyéthylène à
 * 0,9 » retombe sur 2,88 et 6,48 : la fiche est reproduite à 2 % près, ce qui
 * vaut mieux qu'une masse volumique moyenne fausse aux deux bouts.
 */
export function masseKgM2(material: PanelMaterial, thicknessMm: number): number {
  const e = Math.max(0, thicknessMm);
  if (e <= 0) return 0;
  if (material === 'dibond') {
    const PEAU_MM = 0.3;
    const RHO_ALU = 2.70; // g/cm³
    const RHO_AME = 0.90; // polyéthylène LDPE, donné par la même fiche
    const ame = Math.max(0, e - 2 * PEAU_MM);
    return Math.round((2 * PEAU_MM * RHO_ALU + ame * RHO_AME) * 100) / 100;
  }
  // kg/m² = épaisseur (m) × masse volumique (kg/m³).
  return Math.round(((e / 1000) * MASSE_VOLUMIQUE_KG_M3[material]) * 100) / 100;
}

export const DEFAULT_MATERIALS: Record<PanelMaterial, MaterialSpec> = {
  pvc: {
    label: 'PVC expansé',
    thicknessesMm: [3, 5, 10, 19],
    perM2PerMmCents: 4_20,
    baseM2Cents: 18_00,
    outdoorReady: true,
    formatAchatMm: { largeur: 3050, hauteur: 2030 },
    // Le laser est INTERDIT ici, et pas par prudence : le PVC dégage du chlore
    // en brûlant — corrosif pour la machine, toxique pour l'opérateur.
    decoupe: ['cnc'],
    decoupeNote: 'Laser interdit : le PVC dégage du chlore en brûlant.',
  },
  dibond: {
    label: 'Dibond (aluminium composite)',
    thicknessesMm: [2, 3, 4],
    perM2PerMmCents: 14_00,
    baseM2Cents: 32_00,
    outdoorReady: true,
    // Largeur ≤ 2050 sur fiche 3A Composites ; le 3050 × 1500 est le format de
    // négoce courant.
    formatAchatMm: { largeur: 3050, hauteur: 1500 },
    decoupe: ['cnc', 'cisaille'],
  },
  aluminium: {
    label: 'Aluminium',
    thicknessesMm: [1, 2, 3],
    perM2PerMmCents: 26_00,
    baseM2Cents: 45_00,
    outdoorReady: true,
    formatAchatMm: { largeur: 3000, hauteur: 1500 },
    // Laser FIBRE, pas CO2 : un laser CO2 se réfléchit sur l'aluminium.
    decoupe: ['cnc', 'laser', 'cisaille'],
  },
  plexi: {
    label: 'Plexiglas',
    thicknessesMm: [3, 5, 8, 10],
    perM2PerMmCents: 19_00,
    baseM2Cents: 38_00,
    outdoorReady: true,
    // Coulé : 3050 × 2030 sur fiche Röhm. C'est ce format qui borne une pièce
    // d'un seul tenant côté MATIÈRE — le transport, lui, borne bien avant.
    formatAchatMm: { largeur: 3050, hauteur: 2030 },
    decoupe: ['laser', 'cnc'],
  },
  bois: {
    label: 'Bois (peuplier)',
    thicknessesMm: [5, 10, 18],
    perM2PerMmCents: 5_50,
    baseM2Cents: 22_00,
    // Le bois brut ne tient pas dehors : la validation le refusera.
    outdoorReady: false,
    formatAchatMm: { largeur: 2440, hauteur: 1220 },
    decoupe: ['cnc', 'laser'],
  },
};

export interface PanelCoefficients {
  materials: Record<PanelMaterial, MaterialSpec>;
  /** Découpe, au mètre linéaire de contour (centimes). */
  cutPerMeterCents: Record<PanelCut, number>;
  /** Finitions, au m² (centimes). `raw` est gratuit par construction. */
  finishPerM2Cents: Record<PanelFinish, number>;
  /** Perçage et fixations, forfait par panneau (centimes). */
  fixingCents: number;
  // --- Caisson ------------------------------------------------------------
  /** Face translucide diffusante, au m² (centimes). */
  diffuserPerM2Cents: number;
  /** Assemblage d'un caisson, forfait (centimes). */
  boxBuildCents: number;
  /**
   * Puissance pour éclairer un m² de face, en watts — SURCHARGE MARCHAND.
   *
   * 0 (le défaut) signifie « suivre la courbe de profondeur »
   * `wattsPerM2ForDepth`, qui est la réalité du produit. Une valeur > 0 la
   * remplace, pour un marchand dont les modules diffèrent de la gamme relevée.
   *
   * Ce champ valait 90 W/m², plat, quelle que soit la profondeur. C'était juste
   * pour un caisson de 30 mm et deux à trois fois trop haut au-delà : la
   * puissance ne dépend pas de la surface seule, elle dépend de l'ESPACEMENT
   * des rangées, qui dépend de la profondeur (docs/43 §20).
   */
  wattsPerM2: number;
  /** Éclairage interne : modules LED, au m² de face (centimes). */
  ledPerM2Cents: number;
}

export const DEFAULT_PANEL_COEFFICIENTS: PanelCoefficients = {
  materials: DEFAULT_MATERIALS,
  cutPerMeterCents: {
    rect: 3_50,     // coupe droite
    rounded: 7_00,  // angles arrondis
    shape: 16_00,   // forme libre, suivi de tracé
  },
  finishPerM2Cents: {
    raw: 0,
    printed: 42_00,
    'printed-lam': 68_00,
    letters: 145_00,
    engraved: 95_00,
  },
  fixingCents: 12_00,
  diffuserPerM2Cents: 88_00,
  boxBuildCents: 65_00,
  wattsPerM2: 0, // 0 = suivre la courbe de profondeur (voir wattsPerM2ForDepth)
  ledPerM2Cents: 74_00,
};

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

/** Surface d'un panneau (m²). */
export function panelAreaM2(widthCm: number, heightCm: number): number {
  return (widthCm * heightCm) / 10_000;
}

/**
 * Longueur à découper (mètres linéaires).
 *
 * Une forme libre ne se découpe pas au périmètre du rectangle : le tracé
 * serpente. On majore de 40 %, comme on majore déjà le contour d'un fond de
 * néon — même raisonnement, même ordre de grandeur.
 */
export function panelCutLengthM(widthCm: number, heightCm: number, cut: PanelCut): number {
  const perimetre = (2 * (widthCm + heightCm)) / 100;
  return 'shape' === cut ? perimetre * 1.4 : perimetre;
}

/** Surface de matière d'un caisson : face(s) + chant périmétrique (m²). */
export function boxBodyM2(widthCm: number, heightCm: number, depthCm: number, faces: 1 | 2): number {
  const w = widthCm / 100;
  const h = heightCm / 100;
  const d = depthCm / 100;
  // Le corps porte le fond (toujours) et le chant ; la ou les faces lumineuses
  // sont facturées à part, en matière diffusante.
  return w * h + 2 * (w + h) * d - (2 === faces ? w * h : 0);
}

/** Surface lumineuse d'un caisson (m²). */
export function boxLitM2(widthCm: number, heightCm: number, faces: 1 | 2): number {
  return (faces * widthCm * heightCm) / 10_000;
}

/** Tarif d'une plaque au m², matière et épaisseur comprises (centimes). */
export function materialM2Cents(
  material: PanelMaterial,
  thicknessMm: number,
  coeff: PanelCoefficients,
): number {
  const spec = coeff.materials[material];
  if (!spec) return 0;
  // Épaisseur ramenée à ce qui existe : on ne facture pas une plaque qui ne se
  // fabrique pas.
  const e = spec.thicknessesMm.includes(thicknessMm)
    ? thicknessMm
    : spec.thicknessesMm.reduce((a, b) => (Math.abs(b - thicknessMm) < Math.abs(a - thicknessMm) ? b : a));
  return spec.baseM2Cents + e * spec.perM2PerMmCents;
}

/**
 * PUISSANCE D'ÉCLAIRAGE D'UN CAISSON, EN W/m² DE FACE, SELON SA PROFONDEUR.
 *
 * ── D'où ça vient ───────────────────────────────────────────────────────────
 *
 * Un caisson ne s'éclaire pas « au m² » : il s'éclaire par RANGÉES de modules,
 * et l'espacement des rangées dépend de la profondeur — plus le module est loin
 * de la face, plus son cône couvre large, moins il en faut. La fiche
 * `sloanled-brightline-2-modules-caisson-faible-profondeur.pdf` donne la table
 * directement :
 *
 *     profondeur 30 mm → entraxe  75 mm
 *                40 mm →         100 mm
 *                50 mm →         125 mm
 *                60 mm et plus → 150 mm
 *
 * soit un entraxe de **2,5 × la profondeur** sur les quatre lignes. (La règle
 * « 2:1 » que citaient docs/39 et la compétence porte sur la distance
 * LED-face, qui n'est pas la profondeur hors-tout : ce sont deux grandeurs
 * différentes, et c'est la seconde que la fiche tabule.)
 *
 * La densité linéique de la bande est, elle, sans ambiguïté : 3,0 W pour
 * 479 mm et 1,0 W pour 160 mm donnent tous deux **6,26 W par mètre de bande**.
 * D'où W/m² = 6,26 ÷ entraxe.
 *
 * Contre-épreuve sur un AUTRE produit et une autre profondeur : le SignBOX II
 * (`sloanled-signbox-2-modules-caisson-fiche.pdf`) annonce 3 modules de 0,90 W
 * par pied, soit 8,86 W par mètre de rangée, en rangées à 12 pouces pour des
 * caissons de 5 à 12 pouces — **29,1 W/m²**. La courbe ci-dessous y tend, ce
 * qui est rassurant : deux gammes distinctes, un même ordre de grandeur.
 *
 * ── Ce que ça corrige ───────────────────────────────────────────────────────
 *
 * Le coefficient valait **90 W/m², plat**. C'est à peu près juste pour un
 * caisson de 30 mm (83 W/m²) et deux à trois fois trop haut au-delà. Comme le
 * dépôt refuse les caissons sous 6 cm, la valeur employée en pratique était
 * TOUJOURS trop haute — d'un facteur 2,2 au minimum.
 *
 * ── Ce qu'elle ne dit pas ───────────────────────────────────────────────────
 *
 * La fiche BrightLine porte aussi « 20 W/m » à côté de la bande de 3,0 W, ce
 * qui ne se réconcilie ni avec 6,26 W/m ni avec la table d'entraxe. On ne s'en
 * sert donc pas, et on l'écrit ici pour que personne ne « corrige » la courbe
 * avec ce chiffre-là sans avoir rouvert la fiche.
 *
 * @param depthCm Profondeur hors-tout du caisson (cm).
 * @returns W/m² de face, simple face.
 */
export function wattsPerM2ForDepth(depthCm: number): number {
  const profondeurMm = Math.max(0, depthCm) * 10;
  if (profondeurMm <= 0) return 0;
  // L'ENTRAXE N'EST PLUS CALCULÉ ICI. Il l'était, et il ne servait qu'à une
  // puissance — alors qu'il décide aussi de l'homogénéité de la face (E24). Le
  // rejouer dans `caisson.ts` aurait donné deux fonctions à faire diverger :
  // c'est exactement la faute que `CLAUDE.md` interdit à un banc d'essai, et
  // elle ne vaut pas mieux dans du code de production.
  const entraxeMm = entraxeModulesMm(depthCm);
  if (!(entraxeMm > 0)) return 0;
  // Au-delà de 12,2 cm on est dans le domaine du SignBOX II : 8,86 W par mètre
  // de rangée au lieu des 6,26 W de la BrightLINE 2.
  const lineique = profondeurMm >= 122 ? 8.86 : 6.26;
  return Math.round((lineique / (entraxeMm / 1000)) * 10) / 10;
}

/**
 * La puissance à retenir : la surcharge du marchand si elle existe, la courbe
 * de profondeur sinon.
 */
export function wattsPerM2Effectif(depthCm: number, pc: PanelCoefficients): number {
  return pc.wattsPerM2 > 0 ? pc.wattsPerM2 : wattsPerM2ForDepth(depthCm);
}

/**
 * FORMAT DE PLAQUE À L'ACHAT, en millimètres (écart E18).
 *
 * Un panneau plus grand qu'une plaque du commerce ne se fabrique pas d'une
 * pièce : il se raboute, avec un joint visible, ou il ne se fait pas. Aujourd'hui
 * rien ne le dit — `maxWidthCm` plafonne à 250 cm, ce qui laisse passer un
 * panneau de 2,50 m que la plaque de PMMA (2,03 m dans sa petite dimension) ne
 * peut pas porter en travers.
 *
 * ── CE QUE LE FONDS DONNE, ET CE QU'IL NE DONNE PAS ─────────────────────────
 *
 * | Matière | Fiche | Format |
 * |---|---|---|
 * | PMMA | `pmma-plexiglas-gs-xt-rohm-fiche-technique.pdf` | **3050 × 2030 mm** jusqu'à 25 mm d'épaisseur ; 3000 × 2000 au-delà de 30 mm |
 * | Dibond | `dibond-3a-composites-guide-produit.pdf` | largeur **jusqu'à 2050 mm** — la longueur n'est pas donnée |
 * | PVC expansé | les deux guides 3A | « widest range of sheet sizes », **aucun chiffre** |
 * | Aluminium, bois | — | **aucune fiche de format** |
 *
 * Trois matières sur cinq n'ont donc pas de format sourcé. Elles restent
 * **absentes** de la table plutôt que devinées : le contrôle ne se déclenche que
 * là où l'on sait, et se tait ailleurs. C'est un manque du fonds, pas une
 * approximation du code, et le combler demande un catalogue fournisseur.
 */
export const FORMAT_PLAQUE_MM: Partial<Record<PanelMaterial, { longueurMm: number; largeurMm: number }>> = {
  // Röhm, « standard size 3050 x 2030 mm up to 25 mm thick ». Toutes les
  // épaisseurs du catalogue (3 à 10 mm) sont sous cette limite.
  plexi: { longueurMm: 3050, largeurMm: 2030 },
};

/**
 * Le panneau tient-il sur une plaque, dans un sens ou dans l'autre ?
 *
 * Rend `null` quand le format de la matière n'est pas connu — et `null` veut
 * dire « on ne sait pas », jamais « oui ». Un appelant qui confondrait les deux
 * annoncerait fabricable ce qu'il n'a pas vérifié.
 */
export function tientSurUnePlaque(
  material: PanelMaterial,
  widthCm: number,
  heightCm: number,
): boolean | null {
  const f = FORMAT_PLAQUE_MM[material];
  if (!f) return null;
  // On compare petit côté à petit côté : la plaque se tourne.
  const petit = Math.min(widthCm, heightCm) * 10;
  const grand = Math.max(widthCm, heightCm) * 10;
  const petitF = Math.min(f.largeurMm, f.longueurMm);
  const grandF = Math.max(f.largeurMm, f.longueurMm);
  return petit <= petitF && grand <= grandF;
}
