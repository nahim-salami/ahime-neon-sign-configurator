/**
 * Contexte injecté par la plateforme hôte (plugin WooCommerce…), même contrat
 * que le projet de référence : window.__AHNS_CONTEXT__. Sans contexte, le widget
 * tourne en mode démo (évènements DOM, pas de panier réel).
 */

import type { NeonConfiguration, PricingCoefficients } from '@neon/core';

export interface HostContext {
  platform: 'woocommerce' | 'generic';
  ajaxUrl?: string;
  nonce?: string;
  productId?: number;
  /**
   * VISUEL D'IMPRESSION UV fourni par la boutique (E18, reste).
   *
   * Une plaque en `printed-uv` porte le visuel du CLIENT, imprimé sur la
   * matière du MARCHAND. Le widget ne peut pas l'inventer — il montrait jusqu'ici
   * un dégradé procédural assumé comme bouche-trou (`materiaux-enseigne` §6).
   *
   * La boutique le fournit quand elle l'a : c'est elle qui a fait téléverser le
   * fichier, et elle seule sait où il est. Absent, le dégradé reste.
   */
  printedArtworkUrl?: string;
  /**
   * La boutique a-t-elle le droit de vendre ? Faux pendant un essai expiré ou
   * un abonnement résilié : le configurateur reste ENTIER, seul l'ajout au
   * panier se ferme. Le serveur refuse de toute façon — ceci évite juste au
   * client de composer un néon pour rien.
   */
  canAddToCart?: boolean;
  cartClosedReason?: string;
  /**
   * Action de dépôt d'une demande de devis. Un JPEG, un PNG ou un PDF n'a
   * aucun tracé : il est IMPOSSIBLE d'en mesurer une longueur de tube, donc
   * impossible d'en donner un prix ferme.
   *
   * La demande se dépose SUR LA BOUTIQUE, par le même `ajaxUrl` que le panier.
   * Le client ne sort pas du site du marchand au milieu de son achat, et ses
   * coordonnées ne transitent nulle part ailleurs.
   */
  quoteAction?: string;
  /** Page dédiée du marchand, pour un projet qui n'a pas encore de fichier. */
  quotePageUrl?: string;
  /**
   * Mode devis : le configurateur sert à COMPOSER, pas à acheter. Le prix
   * disparaît — annoncer un chiffre sur une pièce qu'on ne sait pas encore
   * mesurer serait un engagement qu'on ne peut pas tenir.
   */
  quoteMode?: boolean;
  /**
   * Familles de produit proposées. Un atelier qui ne fait que du néon ne doit
   * pas voir apparaître des panneaux dans son configurateur.
   */
  families?: { neon?: boolean; panel?: boolean; boxSign?: boolean };
  cartUrl?: string;
  checkoutUrl?: string;
  homeUrl?: string;
  /** Nom du site hôte — affiché dans l'en-tête du widget (cliquable → accueil). */
  siteName?: string;
  /** Locale du widget (ex. « en_US ») — vide/absent = français. */
  locale?: string;
  /** Surcharges de coefficients du marchand (Réglages WP) — le widget affiche
   *  avec les MÊMES coefficients que le serveur facture. Clés scalaires only
   *  (fusion superficielle, identique des deux côtés). */
  pricing?: Partial<PricingCoefficients>;
  /** Édition d'une ligne de panier existante : à l'enregistrement, le serveur
   *  REMPLACE cette ligne au lieu d'en ajouter une. */
  editCartItemKey?: string;
  /** Configuration à recharger dans le configurateur (mode édition). */
  initialConfiguration?: Partial<NeonConfiguration>;
  /** Tailles proposées (réglage marchand) — boutons du configurateur. */
  sizePresets?: Array<{ label: string; letterHeightCm: number }>;
  /** Bornes du curseur de taille libre (cm). */
  sizeBounds?: { minCm: number; maxCm: number };
  /** Options proposées par le marchand : une option à `false` DISPARAÎT du
   *  configurateur (et sera refusée à l'ajout au panier, côté serveur). */
  features?: Partial<Record<'rgb' | 'outdoor' | 'dimmer' | 'express' | 'logo' | 'view3d' | 'timer', boolean>>;
  /** Fonds d'aperçu proposés, ancienne forme : oui/non sur les trois livrés. */
  backgrounds?: Partial<Record<'dark' | 'brick' | 'room', boolean>>;
  /**
   * LES SCÈNES DE CE CONFIGURATEUR, dans l'ordre où elles s'affichent.
   *
   * La boutique tient une bibliothèque de décors — les trois dessinés par la
   * feuille de style, plus ses propres photos — et chaque configurateur choisit
   * ceux qu'il propose. Quand cette liste arrive, elle REMPLACE la précédente :
   * elle dit à la fois lesquels et dans quel ordre, et elle porte l'adresse des
   * images, ce que des booléens ne pouvaient pas faire.
   */
  scenes?: Array<{ id: string; label: string; image?: string }>;
  /** Nombre de lignes de texte maximum (1 à 3). */
  maxLines?: number;
  /**
   * Palette de tube proposée par le marchand.
   *
   * `sku` DÉSIGNE LA BOBINE, et c'est ce qui manquait (écart E28). Sans lui,
   * `ligneVersTube` doit retrouver la référence PAR SA COULEUR — et deux
   * bobines du même rose, l'une en Ø 8 et l'autre en Ø 10, sont alors
   * indistinguables : la première trouvée gagne. Le marchand ne pouvait donc
   * pas offrir les deux diamètres que docs/02 §2 lui promet.
   *
   * Absent, la recherche par couleur continue de fonctionner : c'est le cas de
   * toutes les palettes déjà réglées.
   */
  colors?: Array<{ hex: string; label: string; sku?: string }>;
  /** Couleur retenue pour un nouveau design. */
  defaultColor?: string;
  /** Découpes et finitions proposées. */
  supportTypes?: string[];
  supportFinishes?: string[];
  /** Profondeur de caisson (cm). */
  boxDepthCm?: number;
  /** Apparence : couleur de marque, libellés, logo d'en-tête, thème. */
  appearance?: {
    accent?: string;
    labels?: Partial<Record<'title' | 'addToCart' | 'checkout' | 'another', string>>;
    logoUrl?: string;
    headerLayout?: 'text' | 'logo' | 'logo-left' | 'logo-right' | 'logo-top' | 'logo-bottom';
    /** Thème d'interface choisi par le marchand (registre : themes.ts).
     *  Inconnu ou absent → « clair-boutique ». */
    theme?: string;
  };
  /** Polices ACTIVÉES par le marchand (pack servi par l'hôte). Chacune porte
   *  son URL et ses métriques — sans métriques, pas de prix possible. */
  fonts?: Array<{
    id: string;
    label: string;
    class: 'block' | 'script';
    url?: string;
    metrics?: unknown;
  }>;
}

export function hostContext(): HostContext | null {
  const ctx = (window as unknown as { __AHNS_CONTEXT__?: HostContext }).__AHNS_CONTEXT__;
  return ctx && typeof ctx === 'object' ? ctx : null;
}
