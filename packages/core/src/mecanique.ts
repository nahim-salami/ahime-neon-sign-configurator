/**
 * MASSE ET FIXATION D'UNE ENSEIGNE (écart E09).
 *
 * « Ça tient sur du placo ? » est la question que le client pose, et à laquelle
 * rien ne répondait. Elle a une réponse chiffrée, et elle est dans les fiches de
 * chevilles du fonds.
 *
 * Ce module ne fait pas de prix. Il donne une masse, un nombre de points de
 * fixation et une référence de cheville — ce qui va dans la notice et sur la
 * fiche d'atelier.
 */

import { masseKgM2, type PanelMaterial } from './panels.js';

/**
 * Masse linéique du tube néon flex, en kg/m.
 *
 * **NON SOURCÉE.** Aucune fiche de `ressources/flex-led/` ne donne le poids au
 * mètre — elles parlent toutes de « lightweight » sans un chiffre. La valeur
 * ci-dessous est une provision d'ordre de grandeur pour un profil 6 × 12 en
 * silicone, et elle est marquée comme telle plutôt que présentée comme un
 * relevé. Sur une enseigne courante elle pèse quelques centaines de grammes
 * face à plusieurs kilos de plaque : l'incertitude ne déplace pas la conclusion.
 *
 * À remplacer dès qu'une fiche donne le chiffre.
 */
export const MASSE_TUBE_KG_M = 0.09;

export interface EntreeMasse {
  materiau: PanelMaterial;
  epaisseurMm: number;
  largeurCm: number;
  hauteurCm: number;
  /** Longueur de tube (m) — celle du manifeste. */
  tubeM?: number;
  /**
   * Masse de l'alimentation (kg). Les blocs de `ressources/alimentations.json`
   * pèsent 0,18 kg (APV-35) à 0,61 kg (LPV-100) — relevés sur fiche et audités.
   * Absente, on ne l'ajoute pas plutôt que d'en inventer une.
   */
  alimentationKg?: number;
}

export interface Masse {
  /** Masse totale (kg), arrondie au décagramme. */
  totalKg: number;
  plaqueKg: number;
  tubeKg: number;
  alimentationKg: number;
}

/** La masse d'une enseigne, poste par poste. */
export function masseEnseigne(e: EntreeMasse): Masse {
  const m2 = (Math.max(0, e.largeurCm) * Math.max(0, e.hauteurCm)) / 10_000;
  const plaque = masseKgM2(e.materiau, e.epaisseurMm) * m2;
  const tube = Math.max(0, e.tubeM ?? 0) * MASSE_TUBE_KG_M;
  const alim = Math.max(0, e.alimentationKg ?? 0);
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  return {
    totalKg: arrondi(plaque + tube + alim),
    plaqueKg: arrondi(plaque),
    tubeKg: arrondi(tube),
    alimentationKg: arrondi(alim),
  };
}

/** Les supports que le client sait nommer. */
export type SupportMural =
  | 'beton'
  | 'brique-pleine'
  | 'brique-creuse'
  | 'beton-cellulaire'
  | 'placo-12'
  | 'placo-double';

/**
 * CHARGES ADMISSIBLES PAR POINT, EN daN, relevées sur fiche.
 *
 * ── Maçonnerie : cheville nylon fischer SX ─────────────────────────────────
 * `ressources/fixation/fischer-sx-cheville-nylon.pdf`, tableau « Charges
 * admissibles en traction axiale, traction oblique et cisaillement (daN) »,
 * colonnes SX 5 / 6 / 8 / 10 / 12 / 14 / 16 :
 *
 * | Support | 5 | 6 | 8 | 10 | 12 | 14 | 16 |
 * |---|---|---|---|---|---|---|---|
 * | Béton ≥ C20/25 | 30 | 65 | 70 | 120 | 170 | 200 | 260 |
 * | Brique pleine Mz 12 | 25 | 30 | 60 | 65 | 70 | 80 | 90 |
 * | Brique alvéolaire Hlz 12 | 7 | 7 | 17 | 17 | 26 | 40 | 60 |
 * | Béton cellulaire G4 | 9 | 9 | 14 | 30 | 45 | 50 | 60 |
 *
 * ── Plaque de plâtre : cheville à bascule fischer DuoTec ───────────────────
 * `ressources/fixation/fischer-duotec-cheville-bascule-placo.pdf`, « Charges
 * recommandées Frec [daN] » : **17 daN** sur 9,5 mm, **20 daN** sur 12,5 mm,
 * **43 daN** sur 2 × 12,5 mm.
 *
 * La même fiche ajoute la phrase qui rassure le client : « pour les charges
 * jusqu'à 10 daN, les fixations peuvent se faire directement dans les plaques
 * de plâtre » — sans cheville à bascule.
 *
 * **Ces charges tiennent déjà compte de coefficients de sécurité**, la fiche le
 * dit. On n'en rajoute donc pas un par-dessus : ce serait dimensionner deux
 * fois, et pousser un client vers une cheville inutilement grosse.
 */
const CHARGES_DAN: Record<SupportMural, Array<{ reference: string; chargeDaN: number }>> = {
  beton: [
    { reference: 'SX 6', chargeDaN: 65 },
    { reference: 'SX 8', chargeDaN: 70 },
    { reference: 'SX 10', chargeDaN: 120 },
    { reference: 'SX 12', chargeDaN: 170 },
  ],
  'brique-pleine': [
    { reference: 'SX 6', chargeDaN: 30 },
    { reference: 'SX 8', chargeDaN: 60 },
    { reference: 'SX 10', chargeDaN: 65 },
    { reference: 'SX 12', chargeDaN: 70 },
  ],
  'brique-creuse': [
    { reference: 'SX 8', chargeDaN: 17 },
    { reference: 'SX 12', chargeDaN: 26 },
    { reference: 'SX 14', chargeDaN: 40 },
    { reference: 'SX 16', chargeDaN: 60 },
  ],
  'beton-cellulaire': [
    { reference: 'SX 8', chargeDaN: 14 },
    { reference: 'SX 10', chargeDaN: 30 },
    { reference: 'SX 12', chargeDaN: 45 },
    { reference: 'SX 14', chargeDaN: 50 },
  ],
  'placo-12': [{ reference: 'DuoTec 10', chargeDaN: 20 }],
  'placo-double': [{ reference: 'DuoTec 10', chargeDaN: 43 }],
};

/** En dessous, la fiche DuoTec autorise la pose directe, sans cheville. */
export const CHARGE_SANS_CHEVILLE_DAN = 10;

export interface PlanFixation {
  support: SupportMural;
  /** Référence de cheville retenue. */
  reference: string;
  /** Charge admissible par point (daN). */
  chargeParPointDaN: number;
  /** Nombre de points à poser. */
  points: number;
  /** La pose directe suffit-elle (plaque de plâtre, charge très faible) ? */
  poseDirecte: boolean;
  /** Aucune cheville du tableau ne suffit : il faut un autre support. */
  horsCapacite: boolean;
}

/**
 * Combien de points, et quelle cheville, pour tenir cette masse.
 *
 * DEUX POINTS AU MINIMUM, toujours. Ce n'est pas une marge sur la charge —
 * c'est de la géométrie : une enseigne accrochée en un seul point tourne
 * autour de lui, et finit de travers quel que soit le calcul.
 */
export function planFixation(masseKg: number, support: SupportMural): PlanFixation {
  const daN = Math.max(0, masseKg); // 1 kg ≈ 1 daN sous la pesanteur terrestre
  const echelle = CHARGES_DAN[support];
  const placo = support === 'placo-12' || support === 'placo-double';

  if (placo && daN <= CHARGE_SANS_CHEVILLE_DAN) {
    return {
      support,
      reference: 'vis à plaque de plâtre',
      chargeParPointDaN: CHARGE_SANS_CHEVILLE_DAN,
      points: 2,
      poseDirecte: true,
      horsCapacite: false,
    };
  }

  // La plus PETITE cheville qui tient en six points au plus : au-delà, on
  // perce trop, et c'est le signe qu'il faut monter en diamètre.
  for (const c of echelle) {
    const points = Math.max(2, Math.ceil(daN / c.chargeDaN));
    if (points <= 6) {
      return { support, reference: c.reference, chargeParPointDaN: c.chargeDaN, points, poseDirecte: false, horsCapacite: false };
    }
  }

  const derniere = echelle[echelle.length - 1]!;
  return {
    support,
    reference: derniere.reference,
    chargeParPointDaN: derniere.chargeDaN,
    points: Math.max(2, Math.ceil(daN / derniere.chargeDaN)),
    poseDirecte: false,
    horsCapacite: true,
  };
}

// ---------------------------------------------------------------------------
// FLÈCHE ET ENTRAXE DES FIXATIONS
// ---------------------------------------------------------------------------

/**
 * RIGIDITÉ DE FLEXION, en N·mm² par millimètre de largeur.
 *
 * ── Le Dibond fait exception, et sa fiche donne mieux qu'un module ─────────
 *
 * `dibond-3a-composites-fiche-technique.pdf` tabule directement la **rigidité
 * E·I** du composite : 345 / 865 / 1620 / 3840 kN·cm²/m pour 2 / 3 / 4 / 6 mm.
 * C'est exactement la grandeur qu'une flèche demande, et elle ne se déduit
 * d'aucun module unique — les deux peaux d'aluminium travaillent loin de la
 * fibre neutre, l'âme presque pas. Même leçon qu'au §22 pour la masse.
 *
 * Contre-épreuve : deux peaux de 0,3 mm à ± 0,85 mm de l'axe, E = 70 000 MPa,
 * donnent 30 300 N·mm²/mm pour le 2 mm — la fiche en annonce 34 500. Le modèle
 * simple retrouve l'ordre de grandeur, la fiche fait foi.
 *
 * ── Les matières homogènes : E × t³/12 ────────────────────────────────────
 *
 * | Matière | E | Fiche |
 * |---|---|---|
 * | PMMA | **3 300 MPa** | `pmma-plexiglas-gs-xt-rohm-…`, Et court terme |
 * | Polycarbonate | **2 350 MPa** | `polycarbonate-makrolon-gp-…`, ISO 178 |
 * | PVC expansé | **400 à 800 MPa** selon la qualité | `pvc-expanse-forex-…`, ISO 527-2 |
 * | Aluminium | **70 000 MPa** | valeur du métal, donnée par la fiche Dibond |
 *
 * Le PVC retenu à 500 MPa est le milieu de sa plage, comme sa masse au §22 —
 * c'est la matière la plus incertaine, et c'est aussi la plus souple, donc
 * celle dont l'incertitude se voit le plus. Le **bois n'a pas de fiche** : il
 * est absent, et la flèche n'est pas calculée pour lui.
 */
const MODULE_MPA: Partial<Record<PanelMaterial, number>> = {
  plexi: 3_300,
  aluminium: 70_000,
  pvc: 500,
};

/** Rigidité E·I du Dibond, en kN·cm²/m, telle que la fiche la tabule. */
const RIGIDITE_DIBOND_KNCM2_M: Array<[number, number]> = [
  [2, 345],
  [3, 865],
  [4, 1620],
  [6, 3840],
];

/**
 * Rigidité de flexion par millimètre de largeur (N·mm²/mm), ou null quand la
 * matière n'a pas de module au fonds.
 */
export function rigiditeFlexion(materiau: PanelMaterial, epaisseurMm: number): number | null {
  const e = Math.max(0, epaisseurMm);
  if (e <= 0) return null;
  if (materiau === 'dibond') {
    // On interpole entre les épaisseurs tabulées, et on ne sort pas de la
    // plage : au-delà, la fiche ne dit rien.
    const t = RIGIDITE_DIBOND_KNCM2_M;
    if (e < t[0]![0] || e > t[t.length - 1]![0]) return null;
    let bas = t[0]!;
    let haut = t[t.length - 1]!;
    for (let i = 0; i < t.length - 1; i++) {
      if (e >= t[i]![0] && e <= t[i + 1]![0]) {
        bas = t[i]!;
        haut = t[i + 1]!;
        break;
      }
    }
    const k = haut[0] === bas[0] ? 0 : (e - bas[0]) / (haut[0] - bas[0]);
    const kNcm2ParM = bas[1] + k * (haut[1] - bas[1]);
    // 1 kN·cm² = 100 000 N·mm² ; « par mètre » = par 1 000 mm de largeur.
    return (kNcm2ParM * 100_000) / 1_000;
  }
  const E = MODULE_MPA[materiau];
  if (!E) return null;
  return (E * e ** 3) / 12;
}

/**
 * Flèche au milieu d'une portée, en millimètres.
 *
 * Modèle de POUTRE sur deux appuis, chargée uniformément : δ = 5qL⁴/384EI.
 * C'est **conservateur** pour une plaque réelle, tenue sur quatre points ou
 * plus, qui travaille en deux directions et fléchit moins. On préfère annoncer
 * une flèche un peu forte qu'un panneau qui gondole.
 *
 * @param chargeSupplementaireNM2 Charge en plus du poids propre (N/m²) — le
 *                                vent, par exemple. Zéro à l'intérieur.
 */
export function flecheMm(
  materiau: PanelMaterial,
  epaisseurMm: number,
  porteeCm: number,
  chargeSupplementaireNM2 = 0,
): number | null {
  const EI = rigiditeFlexion(materiau, epaisseurMm);
  if (EI === null || EI <= 0) return null;
  const L = Math.max(0, porteeCm) * 10;
  if (L <= 0) return 0;
  const poidsPropreNM2 = masseKgM2(materiau, epaisseurMm) * 9.81;
  // N/m² → N/mm² ; sur une bande d'un millimètre de large, c'est aussi N/mm.
  const q = (poidsPropreNM2 + Math.max(0, chargeSupplementaireNM2)) / 1e6;
  return Math.round(((5 * q * L ** 4) / (384 * EI)) * 100) / 100;
}

/**
 * Flèche admissible : la portée divisée par ce nombre.
 *
 * **CONVENTION, pas une valeur de fiche.** L/200 est l'usage courant en
 * bardage et en enseigne — au-delà, l'ondulation se voit en lumière rasante.
 * Aucun document du fonds ne la prescrit pour une enseigne ; elle est donc
 * réglable, et marquée comme un choix.
 */
export const RATIO_FLECHE_ADMISSIBLE = 200;

/**
 * Entraxe maximal des fixations, en centimètres, pour rester sous la flèche
 * admissible. Rend null quand la matière n'a pas de module au fonds.
 *
 * La flèche varie en L⁴ et l'admissible en L : le rapport varie en L³, donc on
 * cherche par dichotomie plutôt que par une formule fermée — c'est plus court
 * à lire, et le nombre d'itérations est fixe.
 */
export function entraxeMaxCm(
  materiau: PanelMaterial,
  epaisseurMm: number,
  chargeSupplementaireNM2 = 0,
  ratio = RATIO_FLECHE_ADMISSIBLE,
): number | null {
  if (rigiditeFlexion(materiau, epaisseurMm) === null) return null;
  let bas = 1;
  let haut = 500; // 5 m : au-delà, personne ne pose une enseigne d'un tenant
  for (let i = 0; i < 40; i++) {
    const milieu = (bas + haut) / 2;
    const f = flecheMm(materiau, epaisseurMm, milieu, chargeSupplementaireNM2) ?? 0;
    if (f <= (milieu * 10) / ratio) bas = milieu;
    else haut = milieu;
  }
  return Math.round(bas);
}

// ---------------------------------------------------------------------------
// PRESSION DE VENT
// ---------------------------------------------------------------------------

/** Catégorie de terrain au sens de la NF EN 1991-1-4 (Eurocode 1). */
export type CategorieTerrain = 'IV' | 'IIIb' | 'IIIa' | 'II' | '0';

/** Région de vent, au sens de l'annexe nationale française. */
export type RegionVent = 1 | 2 | 3 | 4;

/**
 * PRESSION DE VENT W50, EN PASCALS.
 *
 * `ressources/fixation/cstb-tableaux-pressions-vent-facades.pdf`, fiche
 * technique n° 45-C, « Tableaux des Pressions de vent W50 », calculées selon la
 * **NF EN 1991-1-4** et son annexe nationale. Les colonnes sont les hauteurs de
 * BÂTIMENT : < 9 m, 9-18, 18-28, 28-50, 50-100.
 *
 * La fiche précise pourquoi c'est la hauteur du bâtiment et non celle de
 * l'enseigne : « les valeurs de dépressions étant les valeurs dimensionnantes,
 * la hauteur de référence pour le calcul est donc toujours la hauteur totale du
 * bâtiment ». Une enseigne au rez-de-chaussée d'un immeuble de 30 m se calcule
 * donc avec les valeurs de 28-50 m.
 *
 * Les cinq catégories de terrain, de la plus abritée à la plus exposée :
 * **IV** zone urbaine dense, **IIIb**, **IIIa**, **II** rase campagne,
 * **0** mer ou zone côtière exposée.
 *
 * ── Ce qui n'est PAS repris ────────────────────────────────────────────────
 *
 * Le document porte plusieurs autres tableaux — d'autres cas de charge, et la
 * région 5 (Antilles, Réunion, Mayotte). Leur en-tête ne s'extrait pas assez
 * proprement pour les attribuer sans risque, et un tableau de vent mal apparié
 * sous-dimensionne une fixation sans que personne s'en aperçoive. Ils sont donc
 * laissés de côté, comme la fiche DuoPower au §25. Le fonds les contient ; il
 * faudra les relire à l'œil pour les ajouter.
 */
const VENT_W50_PA: Record<RegionVent, Record<CategorieTerrain, [number, number, number, number, number]>> = {
  1: {
    IV: [383, 417, 505, 630, 793],
    IIIb: [399, 532, 623, 753, 920],
    IIIa: [524, 660, 753, 883, 1050],
    II: [676, 810, 900, 1026, 1185],
    '0': [842, 964, 1046, 1158, 1298],
  },
  2: {
    IV: [456, 497, 601, 750, 944],
    IIIb: [475, 633, 742, 896, 1095],
    IIIa: [624, 786, 897, 1051, 1250],
    II: [804, 963, 1071, 1221, 1410],
    '0': [1002, 1148, 1245, 1378, 1545],
  },
  3: {
    IV: [535, 583, 705, 880, 1108],
    IIIb: [558, 743, 871, 1051, 1285],
    IIIa: [732, 922, 1052, 1234, 1467],
    II: [944, 1131, 1257, 1433, 1655],
    '0': [1177, 1347, 1461, 1617, 1813],
  },
  4: {
    IV: [620, 676, 818, 1020, 1285],
    IIIb: [647, 861, 1010, 1219, 1491],
    IIIa: [849, 1070, 1220, 1431, 1701],
    II: [1095, 1311, 1458, 1661, 1919],
    '0': [1364, 1562, 1694, 1875, 2102],
  },
};

/** Bornes hautes des tranches de hauteur de bâtiment, en mètres. */
const TRANCHES_M = [9, 18, 28, 50, 100];

/**
 * La pression de vent à retenir, en pascals.
 *
 * @param hauteurBatimentM Hauteur TOTALE du bâtiment, pas celle de l'enseigne —
 *                         la fiche est explicite là-dessus.
 * @returns null au-delà de 100 m, où la fiche s'arrête.
 */
export function pressionVentPa(
  region: RegionVent,
  categorie: CategorieTerrain,
  hauteurBatimentM: number,
): number | null {
  const h = Math.max(0, hauteurBatimentM);
  const i = TRANCHES_M.findIndex((borne) => h <= borne);
  if (i < 0) return null; // au-delà de 100 m : la fiche ne dit plus rien
  return VENT_W50_PA[region][categorie][i]!;
}
