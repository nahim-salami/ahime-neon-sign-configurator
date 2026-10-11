/**
 * LE MODÈLE PARAMÉTRIQUE — une seule description de l'objet physique (E11).
 *
 * ── Le problème, tel qu'il se présentait ────────────────────────────────────
 *
 * Le diamètre du tube existait à TROIS endroits, et rien ne les tenait ensemble
 * une fois la commande passée :
 *
 *   - `DEFAULT_COEFFICIENTS.tube.diameterMm` — ce qui FACTURE et ce qui REFUSE ;
 *   - `SPEC.tubeDiameterCm` dans le widget — ce que le client VOIT
 *     (`spec-tube.test.ts` le tient déjà attaché au coefficient) ;
 *   - **`0.005` et `0.01`, écrits en dur dans `workshop-export.ts`** — ce que
 *     l'atelier FABRIQUE.
 *
 * Les trois valent 10 mm aujourd'hui, donc rien ne se voit. Le jour où le
 * catalogue ouvre le Ø 8 mm — c'est prévu, docs/02 §2 — le client verrait 8, la
 * facture compterait 8, et le STL sortirait à 10. La pièce ne rentrerait pas
 * dans son canal, et personne ne saurait pourquoi.
 *
 * ── Ce que ce module fait, et surtout ce qu'il ne fait pas ──────────────────
 *
 * Il décrit l'objet en **mètres**, une fois, à partir du barème effectif. Il ne
 * dessine rien : ni maillage, ni polyligne. Le tracé reste ce qu'il était — la
 * géométrie rastérisée du widget — et c'est délibéré : unifier le TRACÉ demande
 * un axe médian exact, ce que docs/43 §7 a mesuré et écarté.
 *
 * Ce qui est unifié ici, ce sont les **cotes**. C'est là qu'était le risque
 * silencieux, parce qu'une cote fausse ne se voit pas à l'écran.
 *
 * ── Il voyage avec la commande ─────────────────────────────────────────────
 *
 * Le point qui rend l'affaire non triviale : l'export tourne dans
 * l'administration WordPress, des mois plus tard, sans la configuration. Il ne
 * peut donc pas recalculer le modèle — il faut que celui-ci ait été ENREGISTRÉ.
 * D'où `ModeleFabrication` sérialisé dans la géométrie de commande.
 *
 * Une commande passée avant ce jour n'en a pas : `modeleDepuisStockage` rend
 * alors les valeurs du catalogue livré, en le disant. C'est le comportement
 * d'avant, pas une régression — mais on sait désormais quand on l'applique.
 */

import { DEFAULT_COEFFICIENTS, diametreTubeDuDesign, type PricingCoefficients } from './coefficients.js';
import { DEFAULT_TUBE } from './electrical.js';

/**
 * Les cotes de l'objet, en MÈTRES — l'unité de la scène 3D et des maillages.
 *
 * Tout est en mètres et rien n'est en centimètres : c'est ce qui évite la
 * conversion oubliée. Les millimètres du barème sont convertis une fois, ici.
 */
export interface ModeleFabrication {
  /** Diamètre du tube. */
  tubeDiametreM: number;
  /** Rayon du tube — la moitié, calculée une fois pour toutes. */
  tubeRayonM: number;
  /** Épaisseur de la plaque support. */
  plaqueEpaisseurM: number;
  /** Marge de plaque autour du tube, pour la découpe « contour ». */
  plaqueMargeM: number;
  /** Profondeur du caisson ; 0 quand il n'y en a pas. */
  caissonProfondeurM: number;
  /** Pas d'échantillonnage des solides exportés. */
  pasSolideM: number;
  /** Pas de coupe du tube, pour la fiche d'atelier. */
  pasDeCoupeM: number;
}

/**
 * Le modèle du catalogue livré — ce qu'on applique faute de mieux.
 *
 * Il n'est PAS une constante de repli discrète : `modeleDepuisStockage` dit
 * quand il s'en sert.
 */
export const MODELE_PAR_DEFAUT: ModeleFabrication = {
  tubeDiametreM: DEFAULT_TUBE.diameterMm / 1000,
  tubeRayonM: DEFAULT_TUBE.diameterMm / 2000,
  plaqueEpaisseurM: 0.005,
  plaqueMargeM: 0.012,
  caissonProfondeurM: 0,
  // 0,4 mm : sous le pour cent d'écart de volume, cinquante millisecondes
  // (mesuré dans `solid.ts`). L'export du widget employait 0,6 mm ; on garde
  // sa valeur pour ne pas alourdir un téléchargement en administration.
  pasSolideM: 0.0006,
  pasDeCoupeM: DEFAULT_TUBE.cutPitchMm / 1000,
};

/**
 * Le modèle d'une commande, tiré du barème EFFECTIF.
 *
 * ── LE DIAMÈTRE PEUT VENIR DE LA BOBINE (écart E28) ────────────────────────
 *
 * Depuis que le catalogue déclare un diamètre par référence, celui du dessin
 * n'est plus forcément celui de la boutique. Quand les lignes sont fournies, on
 * retient le PLUS GROS — un canal fraisé au Ø 8 ne reçoit pas un tube de 10, et
 * un aperçu dessiné au Ø 8 promettrait un trait plus fin que celui qui arrive.
 *
 * Sans les lignes, rien ne change : c'est le réglage de boutique, et c'est le
 * cas de toutes les commandes déjà passées.
 *
 * @param coeff        Coefficients du marchand, fusionnés aux défauts.
 * @param profondeurCm Profondeur du caisson quand la pièce en a un.
 * @param lines        Lignes du design, pour résoudre le diamètre réel.
 */
export function modeleDepuisCoefficients(
  coeff: Partial<PricingCoefficients> = {},
  profondeurCaissonCm = 0,
  lines?: ReadonlyArray<{ tubeSku?: string; colorHex?: string }>,
): ModeleFabrication {
  const c = { ...DEFAULT_COEFFICIENTS, ...coeff };
  const tube = c.tube ?? DEFAULT_TUBE;
  const diametreMm = lines && lines.length
    ? diametreTubeDuDesign(lines, c)
    : Math.max(0, tube.diameterMm);
  const diametreM = Math.max(0, diametreMm) / 1000;
  return {
    tubeDiametreM: diametreM,
    tubeRayonM: diametreM / 2,
    plaqueEpaisseurM: MODELE_PAR_DEFAUT.plaqueEpaisseurM,
    // La marge de découpe « contour » suit le barème du marchand : c'est elle
    // qui fait la surface facturée du support.
    plaqueMargeM: Math.max(0, c.supportMarginCm) / 100,
    caissonProfondeurM: Math.max(0, profondeurCaissonCm) / 100,
    pasSolideM: MODELE_PAR_DEFAUT.pasSolideM,
    pasDeCoupeM: Math.max(0, tube.cutPitchMm ?? DEFAULT_TUBE.cutPitchMm) / 1000,
  };
}

/** Ce qu'on enregistre : des millimètres entiers, lisibles dans un JSON. */
export interface ModeleStocke {
  tubeMm: number;
  plaqueMm: number;
  margeMm: number;
  caissonMm: number;
  coupeMm: number;
}

/** Vers la forme enregistrée avec la commande. */
export function modeleVersStockage(m: ModeleFabrication): ModeleStocke {
  const mm = (x: number) => Math.round(x * 10000) / 10; // m → mm, au dixième
  return {
    tubeMm: mm(m.tubeDiametreM),
    plaqueMm: mm(m.plaqueEpaisseurM),
    margeMm: mm(m.plaqueMargeM),
    caissonMm: mm(m.caissonProfondeurM),
    coupeMm: mm(m.pasDeCoupeM),
  };
}

/**
 * Depuis la forme enregistrée, ou le catalogue livré quand elle manque.
 *
 * @returns Le modèle, et `origine` — `'commande'` ou `'defaut'`. L'appelant
 *          DOIT pouvoir le dire à l'atelier : fabriquer d'après le catalogue
 *          courant une commande passée il y a six mois est une décision, pas un
 *          détail d'implémentation.
 */
export function modeleDepuisStockage(
  stocke: Partial<ModeleStocke> | null | undefined,
): { modele: ModeleFabrication; origine: 'commande' | 'defaut' } {
  const positif = (x: unknown): number | null =>
    'number' === typeof x && Number.isFinite(x) && x > 0 ? x : null;
  const tube = positif(stocke?.tubeMm);
  if (!stocke || tube === null) {
    return { modele: MODELE_PAR_DEFAUT, origine: 'defaut' };
  }
  const ou = (v: unknown, defautM: number): number => {
    const p = positif(v);
    return p === null ? defautM : p / 1000;
  };
  return {
    origine: 'commande',
    modele: {
      tubeDiametreM: tube / 1000,
      tubeRayonM: tube / 2000,
      plaqueEpaisseurM: ou(stocke.plaqueMm, MODELE_PAR_DEFAUT.plaqueEpaisseurM),
      plaqueMargeM: ou(stocke.margeMm, MODELE_PAR_DEFAUT.plaqueMargeM),
      // Un caisson de zéro est une valeur LÉGITIME — la pièce n'en a pas — et
      // ne doit donc pas retomber sur un défaut.
      caissonProfondeurM: 'number' === typeof stocke.caissonMm && stocke.caissonMm >= 0
        ? stocke.caissonMm / 1000
        : MODELE_PAR_DEFAUT.caissonProfondeurM,
      pasSolideM: MODELE_PAR_DEFAUT.pasSolideM,
      pasDeCoupeM: ou(stocke.coupeMm, MODELE_PAR_DEFAUT.pasDeCoupeM),
    },
  };
}
