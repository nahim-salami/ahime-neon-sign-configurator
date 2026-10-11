/**
 * QUAND A-T-ON LE DROIT DE PROPOSER LA RÉALITÉ AUGMENTÉE ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GARDE-FOU, ET POURQUOI IL EST ICI PLUTÔT QUE DANS LE WIDGET
 *
 * `realite-augmentee-widget` §7 : « C'est le point le plus important de cette
 * compétence, et il ne relève pas de la technique. »
 *
 * `validate.ts` refuse une configuration infabricable — police trop fine pour le
 * tube, plaque trop grande, matière non tenable dehors, caisson trop plat. La RA
 * est la forme la plus CONVAINCANTE de montrer : l'offrir sur une configuration
 * refusée, c'est faire voir au client, sur son propre mur, un objet que l'atelier
 * n'enverra jamais.
 *
 * La règle vit donc dans `core`, avec la validation dont elle dépend, et non
 * dans un composant d'interface où elle serait une condition d'affichage parmi
 * d'autres — de celles qu'on déplace un jour « pour simplifier le rendu ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AUTRE MOITIÉ EST UNE QUESTION DE POIDS
 *
 * §6 : le bouton n'a aucune raison d'exister sur un poste fixe. On ne teste pas
 * la largeur de l'écran — un ordinateur portable en fenêtre étroite n'est pas un
 * téléphone — mais la présence d'un écran TACTILE et d'un pointeur grossier,
 * ce qui décrit exactement l'appareil qu'on tient en main devant un mur.
 */

import type { ValidationIssue } from './types.js';

/** Ce qui empêche de proposer la RA, ou `null` si rien ne l'empêche. */
export type RefusRa =
  /** La configuration ne part pas en fabrication : on ne la montre pas non plus. */
  | 'bloquee'
  /** L'appareil ne sait pas poser un objet sur un mur. */
  | 'appareil'
  /**
   * LA BOUTIQUE N'HÉBERGE PAS LE MODÈLE — et c'est un refus à part entière.
   *
   * AR Quick Look suit un `<a rel="ar" href=…>` et Scene Viewer une intention
   * `?file=…` : les deux réclament une **adresse que le système va chercher
   * lui-même**. Un `blob:` fabriqué dans la page ne leur est pas accessible,
   * parce que ce n'est pas la page qui ouvre le fichier — c'est le système
   * d'exploitation, hors du navigateur.
   *
   * Il n'y a donc pas de RA sans un aller-retour serveur, quoi qu'on écrive
   * côté client. Ce refus existe pour que cette contrainte se lise dans le
   * code plutôt que de se découvrir sur un téléphone.
   */
  | 'hebergement';

export interface EtatRa {
  /** Le bouton doit-il exister ? */
  disponible: boolean;
  /** Pourquoi il n'existe pas. `null` quand il existe. */
  refus: RefusRa | null;
}

export interface ContexteRa {
  /** Ce que `validateConfiguration` a renvoyé. */
  problemes: readonly ValidationIssue[];
  /**
   * L'appareil sait-il faire de la RA murale ?
   *
   * Le widget le renseigne ; `core` ne connaît pas de navigateur, et c'est
   * exprès — cette règle doit rester vérifiable dans Node.
   */
  appareilCapable: boolean;
  /**
   * La boutique sait-elle publier le modèle à une adresse ?
   *
   * Voir `'hebergement'` ci-dessus : sans elle, aucun des deux visualiseurs du
   * système ne peut ouvrir le fichier.
   */
  hebergementDispo: boolean;
}

/**
 * Le bouton « voir chez moi » doit-il exister ?
 *
 * L'ORDRE DES DEUX REFUS N'EST PAS INDIFFÉRENT. On regarde d'abord la
 * configuration : un design infabricable ne doit pas devenir montrable le jour
 * où l'on améliore la détection d'appareil. Le refus le plus grave est celui
 * qu'on nomme.
 */
export function etatRa(ctx: ContexteRa): EtatRa {
  const bloque = ctx.problemes.some((p) => 'block' === p.severity);
  if (bloque) return { disponible: false, refus: 'bloquee' };
  if (!ctx.appareilCapable) return { disponible: false, refus: 'appareil' };
  if (!ctx.hebergementDispo) return { disponible: false, refus: 'hebergement' };
  return { disponible: true, refus: null };
}

/**
 * Les attributs que le visualiseur DOIT porter.
 *
 * Ce ne sont pas des réglages : ce sont les deux décisions de la compétence,
 * écrites une fois et vérifiées par un témoin.
 *
 * `ar-scale="fixed"` — la valeur par défaut, `auto`, laisse le visiteur
 * redimensionner l'objet au pincement. Acceptable pour un meuble ; inacceptable
 * ici, où le client vient précisément vérifier une taille et où la RA lui
 * donnerait le pouvoir de la changer sans s'en apercevoir. S'il trouve l'objet
 * trop grand, il revient au configurateur et change la hauteur de lettre — là
 * où le prix suit.
 *
 * `ar-placement="wall"` — un néon ne se pose pas par terre.
 */
export const ATTRIBUTS_RA = Object.freeze({
  'ar-scale': 'fixed',
  'ar-placement': 'wall',
  'ar-modes': 'webxr scene-viewer quick-look',
});
