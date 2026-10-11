/**
 * LE PRIX D'UNE LETTRE BOÎTIER — par lettre et par hauteur (chantier A5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE MARCHÉ COMPTE, ET CE QUE LE CODE COMPTAIT
 *
 * `lettres-boitiers` §5 est catégorique : « Ne jamais tarifer une lettre
 * lumineuse au m² : le marché, l'atelier et le client comptent en **lettres et
 * en centimètres de haut**. »
 *
 * La branche `panel` tarifait pourtant une SURFACE — `aire × materialRate`. Ce
 * n'est pas une approximation grossière, c'est une autre unité de vente. Deux
 * « I » de 50 cm et un « M » de 50 cm couvrent des surfaces très différentes ;
 * l'atelier, lui, plie trois retours, découpe trois faces et pose trois trims.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UNE GRILLE DU MARCHAND, ET PAS UNE FORMULE
 *
 * Aucune fiche fournisseur ne donne un prix de VENTE. Les repères du marché
 * relevés dans la compétence — PVC 10 mm non lumineux à 5,33 € en 20 cm et
 * 12,32 € en 50 cm, boîtier PVC 30 mm à 58,33 € et 159,82 € — viennent de
 * pages de concurrents, pas du fonds documentaire, et ce sont **leurs** prix.
 *
 * C'est donc une grille en escalier que l'intégrateur déclare, comme il déclare
 * ses bobines et ses alimentations. Sans grille, le calcul à la surface
 * s'applique — **rien ne bouge tant que le marchand n'a rien dit**.
 */

/** Comment la lettre est construite — le prix n'a rien à voir entre les deux. */
export type ConstructionTarifee = 'channel' | 'solid' | 'flat';

/** Un palier de la grille : « jusqu'à N cm de haut, tant par lettre ». */
export interface PalierLettre {
  /** Hauteur maximale couverte par ce palier, en centimètres. */
  maxHauteurCm: number;
  /** Prix par lettre, en centimes. */
  cents: number;
  /**
   * Construction visée.
   *
   * Absente, le palier vaut pour toutes : c'est ce qui permet à un marchand de
   * commencer par une grille unique et de l'affiner ensuite.
   */
  construction?: ConstructionTarifee;
}

/** Ce que la grille a facturé, et pourquoi. */
export interface ChiffrageLettres {
  /** Total, en centimes. */
  cents: number;
  /** Nombre de lettres comptées. */
  lettres: number;
  /** `null` quand aucune grille ne s'applique : l'appelant retombe au m². */
  palierCents: number | null;
}

/**
 * Compte les lettres d'un texte, comme l'atelier les compte.
 *
 * Les espaces et les retours à la ligne ne sont pas des lettres : personne ne
 * plie un retour de tôle pour un espace. Les signes de ponctuation, si — un
 * « & » ou un « ! » se fabrique exactement comme un « A ».
 */
export function compterLettres(texte: string): number {
  return [...texte].filter((c) => !/\s/u.test(c)).length;
}

/**
 * Le palier applicable à une hauteur.
 *
 * Les paliers sont triés à la volée : une grille saisie dans le désordre par un
 * marchand doit donner le même prix qu'une grille rangée. Le premier palier
 * dont la hauteur maximale couvre la lettre gagne ; au-delà du dernier, la
 * grille ne s'applique pas — mieux vaut retomber sur la surface que d'inventer
 * une extrapolation sur une enseigne de deux mètres.
 */
export function palierPourHauteur(
  hauteurCm: number,
  grille: readonly PalierLettre[],
  construction: ConstructionTarifee = 'channel',
): PalierLettre | null {
  const applicables = grille
    .filter((p) => !p.construction || p.construction === construction)
    .filter((p) => p.maxHauteurCm > 0 && p.cents >= 0)
    .sort((a, b) => a.maxHauteurCm - b.maxHauteurCm);
  return applicables.find((p) => hauteurCm <= p.maxHauteurCm) ?? null;
}

/**
 * Chiffre un jeu de lignes à la grille.
 *
 * Rend `palierCents: null` — et un total nul — dès qu'aucun palier ne couvre la
 * hauteur demandée. L'appelant sait alors qu'il doit retomber sur son calcul
 * habituel, au lieu de facturer zéro.
 */
export function chiffrerLettres(
  textes: readonly string[],
  hauteurCm: number,
  grille: readonly PalierLettre[] | undefined,
  construction: ConstructionTarifee = 'channel',
): ChiffrageLettres {
  const lettres = textes.reduce((n, t) => n + compterLettres(t), 0);
  if (!grille || 0 === grille.length || 0 === lettres) {
    return { cents: 0, lettres, palierCents: null };
  }
  const palier = palierPourHauteur(hauteurCm, grille, construction);
  if (!palier) return { cents: 0, lettres, palierCents: null };
  return { cents: palier.cents * lettres, lettres, palierCents: palier.cents };
}
