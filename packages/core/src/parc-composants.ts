/**
 * LE PARC DU MARCHAND — les fiches simples (chantiers A2 et A4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MOTIF, ET POURQUOI IL EST LE MÊME PARTOUT
 *
 * Ce dépôt vend la solution, pas les néons. Le programmateur qu'un atelier
 * achète et le transporteur avec qui il a un contrat ne sont pas des constantes
 * du produit : ce sont des **données que le produit doit savoir recevoir**.
 *
 * `TubeCatalogEntry` puis `PsuCatalogEntry` ont posé la forme, et la règle qui
 * la rend utilisable :
 *
 * > Un marchand qui veut seulement nommer ses pièces n'a pas à remplir une
 * > fiche technique, et un champ vide vaut « comme le réglage général »,
 * > **jamais zéro**.
 *
 * Les deux fiches de ce fichier sont petites au point qu'un fichier chacune
 * n'aurait porté que son en-tête. Elles partagent surtout la même leçon, et la
 * lire une fois vaut mieux que deux.
 */

// ---------------------------------------------------------------------------
// A2 — LE PROGRAMMATEUR D'EXTINCTION
// ---------------------------------------------------------------------------

/**
 * Un programmateur réellement acheté par l'atelier.
 *
 * ── POURQUOI CETTE FICHE COMPTE PLUS QUE LES AUTRES ────────────────────────
 *
 * `nightTimerCents` vaut 19 €, et docs/04 §5.9 le dit sans détour : **ce chiffre
 * n'est pas sourcé**. Aucune fiche de programmateur n'existe au fonds
 * `ressources/` ; il a été aligné sur le prix du variateur faute de mieux.
 *
 * Or l'extinction nocturne peut être une **obligation légale** (R581-59). Un
 * intégrateur vend donc aujourd'hui une pièce dont il ignore le coût, sur une
 * option qui engage la conformité de son client. C'est le pire endroit du
 * barème pour un chiffre inventé.
 */
export interface TimerCatalogEntry {
  /** Référence chez le fournisseur. */
  sku: string;
  /** Nom montré à l'atelier ; à défaut, le `sku`. */
  label?: string;
  /**
   * Prix de VENTE, en centimes.
   *
   * Absent : `nightTimerCents` s'applique — donc le défaut non sourcé. Nommer
   * une référence pour la nomenclature ne déplace aucun tarif.
   */
  priceCents?: number;
  /** Tension d'entrée, quand elle est connue. Un 230 V ne se pose pas en 12 V. */
  voltage?: 12 | 24 | 230;
  /**
   * Astronomique — il suit le lever et le coucher du soleil.
   *
   * Ce n'est pas un détail de confort : R581-59 fixe une plage en heures
   * d'horloge, mais un commerce qui veut éteindre « à la tombée du jour » a
   * besoin d'autre chose qu'une minuterie fixe. Absent, on ne suppose rien.
   */
  astronomique?: boolean;
}

/**
 * Le prix du programmateur : celui du modèle déclaré, ou le défaut du barème.
 *
 * Rend aussi d'où vient le chiffre, parce que « 19 € » et « 19 € parce que
 * personne n'a rien déclaré » ne se valent pas devant un client.
 */
export function prixProgrammateur(
  catalogue: readonly TimerCatalogEntry[] | undefined,
  defautCents: number,
): { cents: number; origine: 'declare' | 'defaut'; sku: string | null } {
  const avecPrix = (catalogue ?? []).find((t) => 'number' === typeof t.priceCents);
  if (avecPrix) return { cents: avecPrix.priceCents!, origine: 'declare', sku: avecPrix.sku };
  return { cents: defautCents, origine: 'defaut', sku: null };
}

// ---------------------------------------------------------------------------
// A4 — LE TRANSPORTEUR
// ---------------------------------------------------------------------------

/**
 * Les limites du transporteur avec qui le marchand a un contrat.
 *
 * ── CE QUE LES DÉFAUTS VALENT AUJOURD'HUI ──────────────────────────────────
 *
 * `parcelMaxLengthCm: 234` et `parcelMaxWidthCm: 119` viennent d'un CONCURRENT
 * — relevés sur le site de Custom Neon — et non d'un contrat de transport.
 * `materiaux-enseigne` le dit : « ce qui borne une pièce d'un seul tenant n'est
 * pas la matière mais le transport », et la plaque d'achat autorise
 * 3050 × 2030 mm.
 *
 * Un marchand qui livre en palette n'a pas les mêmes limites qu'un autre qui
 * expédie en Colissimo. Aucun chiffre ne peut être juste pour les deux.
 */
export interface TransporteurSpec {
  /** Nom du transporteur ou de l'offre — ce qui parlera à l'atelier. */
  nom?: string;
  /** Longueur maximale d'un colis, en centimètres. */
  maxLongueurCm: number;
  /** Largeur maximale d'un colis, en centimètres. */
  maxLargeurCm: number;
  /**
   * Poids maximal d'un colis, en kilogrammes.
   *
   * Absent : aucune limite de poids n'est vérifiée. C'est volontaire — un
   * caisson de 2 × 0,8 m pèse 25 à 35 kg (`caisson-lumineux` §5), et inventer
   * un plafond ferait scinder des pièces qui passent très bien.
   */
  maxPoidsKg?: number;
}

/** Ce qu'un colis dépasse, s'il dépasse quelque chose. */
export interface DepassementColis {
  longueur: boolean;
  largeur: boolean;
  poids: boolean;
}

/**
 * Le colis passe-t-il chez ce transporteur ?
 *
 * La pièce est comparée dans les deux sens : une plaque de 200 × 80 passe chez
 * un transporteur qui plafonne à 100 × 210, en la couchant. Ne comparer que
 * longueur à longueur ferait scinder des pièces qui tiennent.
 */
export function depassementColis(
  largeurCm: number,
  hauteurCm: number,
  t: TransporteurSpec,
  poidsKg?: number,
): DepassementColis | null {
  const grand = Math.max(largeurCm, hauteurCm);
  const petit = Math.min(largeurCm, hauteurCm);
  const longueur = grand > t.maxLongueurCm;
  const largeur = petit > t.maxLargeurCm;
  const poids = 'number' === typeof t.maxPoidsKg && 'number' === typeof poidsKg
    ? poidsKg > t.maxPoidsKg
    : false;
  if (!longueur && !largeur && !poids) return null;
  return { longueur, largeur, poids };
}
