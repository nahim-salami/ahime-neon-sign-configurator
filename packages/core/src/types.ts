/**
 * Types de la configuration néon — LE modèle partagé (widget, backend, plugin).
 * Toute évolution ici doit rester rétro-compatible : les configurations sont
 * persistées avec les commandes (hash re-vérifié à la commande, anti-fraude).
 */

import type { PanelSpec, BoxSignSpec } from './panels.js';

/** Classe typographique — pilote les contraintes physiques et les heuristiques de mesure. */
export type FontClass = 'block' | 'script';

/** Police du catalogue (le manifeste de métriques est généré par le pipeline de build). */
export interface NeonFont {
  id: string;
  label: string;
  class: FontClass;
  /** Hauteur de lettre minimale fabricable (cm). Défaut : 8 block / 10 script. */
  minLetterHeightCm?: number;
}

export type NeonColorMode = 'solid' | 'rgb';

/** Une ligne de texte du design (police et couleur PAR LIGNE — mix autorisé). */
export interface NeonLine {
  text: string;
  fontId: string;
  /** Hex de la couleur du tube allumé (ignoré si colorMode = 'rgb'). */
  colorHex: string;
  /**
   * Référence du tube au catalogue du marchand (écart E02).
   *
   * Une couleur n'est pas un hexadécimal : c'est une BOBINE, avec sa puissance,
   * son flux, son profil, son prix d'achat et son aspect éteint. Deux roses du
   * même hex peuvent coûter et consommer différemment.
   *
   * Optionnel, et il le restera : `colorHex` reste la source pour toutes les
   * configurations enregistrées avant le 2 septembre 2026, et pour un marchand
   * qui ne veut pas tenir de catalogue. Quand les deux sont là, le SKU gagne.
   */
  tubeSku?: string;
  align?: 'left' | 'center' | 'right';
  /** Placement manuel sur la maquette, en centimètres physiques. */
  offsetXCm?: number;
  offsetYCm?: number;
  /** Déplacement indépendant de chaque mot du texte. */
  wordOffsets?: Array<{ xCm: number; yCm: number }>;
  /**
   * COULEUR — ET DONC BOBINE — PAR MOT.
   *
   * Une entrée absente, ou sans `colorHex`, retombe sur la couleur de la
   * ligne : une configuration enregistrée avant ce jour se relit sans rien
   * changer, et une ligne d'une seule couleur n'a pas besoin de ce tableau.
   *
   * Le SKU voyage avec la couleur, comme sur la ligne (écart E28) : deux roses
   * du même hexadécimal peuvent être deux bobines, de deux diamètres et de
   * deux prix. Un mot d'une autre couleur EST une autre bobine — ce n'est pas
   * un choix d'affichage, c'est une seconde longueur de tube à acheter.
   */
  wordColors?: Array<{ colorHex?: string; tubeSku?: string }>;
}

export type SupportType = 'cut-to-letter' | 'contour' | 'rectangle' | 'stand' | 'box' | 'none';
export type SupportFinish = 'clear' | 'black' | 'white' | 'mirror' | 'colored' | 'printed-uv';

export type Environment = 'indoor' | 'outdoor';
export type PowerRegion = 'EU' | 'UK' | 'US' | 'AU';
export type Mounting = 'screws' | 'chains' | 'ceiling' | 'stand';

/** Type de produit configuré. */
export type NeonKind = 'text' | 'logo-svg' | 'panel' | 'box-sign';

export interface NeonConfiguration {
  kind: NeonKind;
  /** Lignes de texte (1 à 3) — vide pour un logo uploadé. */
  lines: NeonLine[];
  /** Hauteur de lettre cible (cm) — la largeur est CALCULÉE, jamais saisie. */
  letterHeightCm: number;
  colorMode: NeonColorMode;
  support: { type: SupportType; finish: SupportFinish };
  environment: Environment;
  powerRegion: PowerRegion;
  mounting: Mounting;
  options: {
    dimmerRemote: boolean;
    express: boolean;
    /**
     * PROGRAMMATEUR D'EXTINCTION (B20).
     *
     * Ce n'est pas un accessoire de confort : l'article R581-59 du code de
     * l'environnement impose l'extinction des enseignes lumineuses entre 1 h et
     * 6 h quand l'activite signalee a cesse, sous peine d'une contravention de
     * 5e classe (decret 2022-1294). Le calcul de la plage reellement applicable
     * vit dans `extinction.ts`, avec le texte cite.
     *
     * Absent d'une configuration ancienne : `undefined` vaut `false`, et aucun
     * prix deja calcule ne bouge.
     */
    nightTimer?: boolean;
  };
  /**
   * Logo téléversé : longueur de tube mesurée dans le navigateur du client
   * (mm) + boîte englobante. Vectoriel, la mesure vient des chemins ; image
   * matricielle, du squelette (`logo-importe.ts`). Dans les deux cas le
   * serveur ne peut pas la refaire, et la commande part « à vérifier avant
   * fabrication ».
   *
   * `lines` peut être NON VIDE en même temps : le logo se compose alors avec
   * le texte. Absent des configurations antérieures, où `lines` valait `[]`.
   */
  logo?: {
    tubeLengthMm: number;
    widthCm: number;
    heightCm: number;
    /** Où le logo se pose par rapport au texte. Défaut : en dessous. */
    placement?: 'below' | 'above';
    /**
     * Placement manuel sur la maquette (cm), comme `NeonLine.offsetXCm`.
     * Aucune mesure ne le lit — déplacer une pièce ne change ni le tube ni la
     * matière ; il ne sert qu'à ce que la maquette et le bon à tirer montrent
     * la composition voulue par le client.
     */
    offsetXCm?: number;
    offsetYCm?: number;
  };
  /** Caisson : profondeur (cm). Défaut coefficients.boxDepthCm. */
  boxDepthCm?: number;
  /**
   * Dimensions SAISIES — panneaux et caissons uniquement.
   *
   * Pour un néon, la largeur est calculée à partir du texte : elle ne se
   * saisit pas. Une plaque, elle, n'a pas de texte dont on la déduirait : le
   * client donne ses deux dimensions.
   */
  sizeCm?: { widthCm: number; heightCm: number };
  /** Panneau : matière, épaisseur, finition, découpe. */
  panel?: PanelSpec;
  /** Caisson lumineux : matière, profondeur, nombre de faces. */
  boxSign?: BoxSignSpec;
}

/** Dimensions physiques dérivées d'une configuration (calculées, en cm / m). */
export interface NeonMeasurements {
  tubeLengthM: number;
  widthCm: number;
  heightCm: number;
  /**
   * Longueur de tube LIGNE PAR LIGNE (m), dans l'ordre de `config.lines`.
   *
   * Ne sert qu'au jour où deux lignes emploient des tubes de prix différents
   * (E02). Le total reste `tubeLengthM`, et c'est LUI qui fait foi : la somme
   * de ce tableau peut en différer d'un centième, parce que le total est
   * arrondi une fois là où les lignes ne le sont pas.
   */
  lineTubeM?: number[];
  /**
   * Longueur de tube MOT PAR MOT (m), dans l'ordre des lignes puis des mots.
   *
   * Même raison que `lineTubeM`, d'un cran plus fin : depuis qu'un mot peut
   * porter sa propre couleur, il peut porter sa propre bobine, et donc son
   * propre tarif au mètre. Sans ce détail, un marchand au catalogue tarifé
   * facturerait toute la ligne au prix du premier mot.
   *
   * La somme d'une ligne vaut `lineTubeM` : une espace n'a pas de tube, elle
   * n'a qu'une avance.
   */
  wordTubeM?: number[][];
}

/** Ligne du détail de prix (transparence client : chaque composant est nommé). */
export interface PriceLine {
  key:
    | 'base'
    | 'tube'
    | 'support'
    | 'power'
    | 'rgb'
    | 'dimmer'
    | 'night-timer'
    | 'mounting'
    | 'box'
    | 'outdoor'
    | 'sizeTier'
    | 'express'
    // Panneaux et caissons
    | 'material'
    | 'cut'
    | 'finish'
    | 'fixing'
    | 'body'
    | 'diffuser'
    | 'led'
    /**
     * Lettres boîtiers tarifées PAR LETTRE (chantier A5).
     *
     * Une clé à part, et non `material` : deux lignes qui partagent une clé
     * sont ambiguës, et celle-ci a trompé son propre banc — un `find` sur
     * `material` renvoyait la matière du panneau, pas les lettres.
     */
    | 'letters'
    | 'build';
  label: string;
  amountCents: number;
}

export interface PriceResult {
  /** Total en centimes AVANT arrondi marketing. */
  totalCents: number;
  /** Total affiché (centimes) après arrondi marketing éventuel (…9 €). */
  displayTotalCents: number;
  lines: PriceLine[];
  measurements: NeonMeasurements;
}

export interface ValidationIssue {
  /**
   * `block` (défaut) : la configuration est refusée, au panier comme au widget.
   * `warn`  : le configurateur informe et corrige de lui-même, sans bloquer —
   *           c'est le cas de l'extérieur, qui SÉLECTIONNE le caisson au lieu
   *           de renvoyer le client à son erreur.
   */
  severity?: 'block' | 'warn';
  code:
    | 'letter-height-too-small'
    | 'too-wide'
    | 'tube-too-long'
    | 'too-many-lines'
    | 'empty-text'
    | 'unknown-font'
    | 'outdoor-requires-box'
    | 'unsupported-characters'
    | 'stroke-thinner-than-tube'
    // Panneaux et caissons
    | 'panel-size-required'
    | 'panel-too-large'
    | 'panel-too-small'
    | 'material-not-outdoor'
    | 'box-too-shallow'
    | 'panel-split'
    | 'jumper-too-long'
    | 'tube-not-rgb'
    | 'panel-larger-than-sheet'
    | 'mirror-no-channel';
  message: string;
}
