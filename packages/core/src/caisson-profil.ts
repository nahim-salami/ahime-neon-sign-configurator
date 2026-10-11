/**
 * LE PROFILÉ DU CAISSON — sa section, et ce qu'il cache de la face (E24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA 3D DESSINAIT
 *
 * Quatre `BoxGeometry` et une face diffusante bord à bord : une boîte à
 * chaussures. `caisson-lumineux` §6 le note — « le retour du profilé (parclose,
 * chant de 44 mm visible) n'existe pas ».
 *
 * Ce n'est pas qu'une affaire de joli. Un caisson réel est un **profilé
 * extrudé** dont une aile revient en façade et **recouvre le bord de la face**.
 * Le client qui compose son texte sur une face pleine bord à bord le verra
 * mangé par l'alu à la livraison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CHIFFRES, RELEVÉS SUR LE CATALOGUE
 *
 * `ressources/catalogues/esp-enseignes-caissons-2024.pdf`, une ligne par
 * profilé, verdict `juste` :
 *
 * | Profilé ESP            | SUPPORT   | VISIBLE   | Retour par côté |
 * |------------------------|-----------|-----------|-----------------|
 * | 44 mm avec parclose 44PC | HT − 10 | HT − 44   | 22 mm           |
 * | 50 mm SANS parclose      | HT − 25 | HT − 35   | 17,5 mm         |
 * | 80 et 85 (PCR22, PCR85)  | HT − 10 | HT − 44   | 22 mm           |
 * | 122                      | HT − 10 | HT − 44   | 22 mm           |
 * | 152                      | HT − 10 | HT − 44   | 22 mm           |
 *
 * Deux lectures. D'abord, **22 mm par côté sur toute la gamme à parclose** —
 * c'est une constante du métier, pas un réglage. Ensuite, le profilé 50 **sans**
 * parclose montre moins (17,5) tout en engageant plus la face (12,5 contre 5) :
 * sans parclose, la face se pince dans la gorge au lieu d'être recouverte.
 *
 * La face est donc engagée de (44 − 10) / 2 = **17 mm** sous la parclose, et
 * 5 mm de plus dans la gorge. C'est ce recouvrement qui tient la face au vent
 * sans une seule vis traversante.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE NE FAIT PAS
 *
 * Il ne change **aucun prix**. `S_faces` reste calculé sur le hors-tout, et
 * c'est juste : on achète et on laque la tôle hors-tout, pas la partie visible.
 * Ce module dit ce qu'on VOIT, pas ce qu'on paie.
 */

/**
 * Retrait du format SUPPORT sur le hors-tout, en millimètres (les deux côtés).
 *
 * C'est la face acrylique elle-même : 5 mm de moins par côté, pour qu'elle
 * entre dans la gorge du profilé.
 */
export const RETRAIT_SUPPORT_MM = 10;

/**
 * Retrait du format VISIBLE sur le hors-tout, en millimètres (les deux côtés).
 *
 * Donc 22 mm de profilé visible tout autour. C'est le chiffre que le
 * configurateur doit connaître : au-delà, le texte du client passe sous l'alu.
 */
export const RETRAIT_VISIBLE_MM = 44;

/** Épaisseur d'aile du profilé, en millimètres. */
export const EPAISSEUR_AILE_MM = 2;

/** Les trois formats d'un caisson, en centimètres. */
export interface FormatsCaisson {
  /** Ce qu'on fixe au mur, et ce qu'on facture. */
  horsToutCm: { largeur: number; hauteur: number };
  /** La face acrylique à commander. */
  supportCm: { largeur: number; hauteur: number };
  /** Ce que le client voit — le reste est sous la parclose. */
  visibleCm: { largeur: number; hauteur: number };
  /** Largeur du profilé visible tout autour, en centimètres. */
  retourCm: number;
}

/**
 * Les trois formats d'un caisson, depuis son hors-tout.
 *
 * Un caisson plus petit que le retour lui-même n'a pas de face visible : on
 * rend zéro plutôt qu'un négatif, parce qu'un négatif se propagerait en
 * silence dans une cote affichée.
 */
export function formatsCaisson(largeurCm: number, hauteurCm: number): FormatsCaisson {
  const support = RETRAIT_SUPPORT_MM / 10;
  const visible = RETRAIT_VISIBLE_MM / 10;
  return {
    horsToutCm: { largeur: largeurCm, hauteur: hauteurCm },
    supportCm: {
      largeur: Math.max(0, largeurCm - support),
      hauteur: Math.max(0, hauteurCm - support),
    },
    visibleCm: {
      largeur: Math.max(0, largeurCm - visible),
      hauteur: Math.max(0, hauteurCm - visible),
    },
    retourCm: visible / 2,
  };
}

/** Un point de la section du profilé, en mètres. */
export type PointSection = readonly [number, number];

/**
 * LA SECTION DU PROFILÉ, en mètres — un « L » couché.
 *
 * Repère : `u` va de l'extérieur du caisson vers l'intérieur, `v` va du fond
 * (négatif) à la façade (zéro). Le retour de parclose est l'aile qui court en
 * façade et recouvre la face.
 *
 * ```
 *   v=0    ┌────────────────┐  ← retour de parclose (22 mm)
 *          │────────────────┘
 *          ││  ← aile de chant (2 mm), sur toute la profondeur
 *          ││
 *   v=-D   └┘
 *          u=0            u=22 mm
 * ```
 *
 * Extrudée le long d'un côté, elle donne le chant vu de profil ET le liseré vu
 * de face. Quatre `BoxGeometry` ne donnaient ni l'un ni l'autre.
 *
 * @param profondeurM Profondeur du caisson, en mètres.
 */
export function sectionProfil(profondeurM: number): PointSection[] {
  const e = EPAISSEUR_AILE_MM / 1000;
  const r = RETRAIT_VISIBLE_MM / 2000;   // le retour d'UN côté, en mètres
  const d = Math.max(profondeurM, e * 2);
  return [
    [0, 0],
    [r, 0],
    [r, -e],
    [e, -e],
    [e, -d],
    [0, -d],
  ];
}
