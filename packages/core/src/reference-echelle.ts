/**
 * L'OBJET DE RÉFÉRENCE À L'ÉCHELLE (E25).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QU'IL RÈGLE
 *
 * `parcours-configurateur-ux` §2 ouvre sur l'avis type : « reçu 30 cm × 2 cm
 * alors que la photo le montrait au-dessus du canapé ». C'est **le seul problème
 * qui coûte des retours**, et la compétence classe les remèdes par efficacité :
 * l'objet de référence à l'échelle vient en premier, avant la règle du 1/10,
 * avant le guide par usage, avant le gabarit papier, avant la réalité augmentée.
 *
 * Il existe en 3D. Il manquait dans l'aperçu 2D, qui est pourtant l'écran où le
 * client passe l'essentiel de son temps.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UN CALCUL ET NON UNE IMAGE
 *
 * La compétence nomme quatre repères : silhouette 1,75 m, porte 2,04 m, canapé
 * 1,8 m, feuille A4. On ne peut pas les poser tous, ni en poser un au hasard :
 * à l'échelle de l'aperçu, une silhouette de 1,75 m à côté d'une enseigne de
 * 49 cm mesurerait **1 590 pixels de haut** — hors de l'écran, et le client ne
 * verrait plus son néon.
 *
 * Un repère n'apprend quelque chose que s'il est COMPARABLE à l'objet. On
 * choisit donc celui dont la hauteur est la plus proche de celle de l'enseigne,
 * au sens du rapport — c'est-à-dire en écart logarithmique, la seule mesure qui
 * traite « deux fois plus grand » et « deux fois plus petit » à égalité.
 */

export interface ReferenceEchelle {
  /** Clé de traduction. */
  nom: string;
  hauteurCm: number;
  largeurCm: number;
  /** Dessin à employer côté widget. */
  forme: 'feuille' | 'silhouette' | 'porte' | 'canape';
}

/**
 * Les quatre repères de la compétence, avec leurs cotes.
 *
 * L'A4 est le seul dont la cote soit une NORME : 210 × 297 mm (ISO 216), et
 * c'est aussi le seul que le client puisse poser sur sa table pour vérifier.
 * Les trois autres sont des ordres de grandeur usuels — une porte française de
 * passage fait 204 cm de bloc, une personne adulte environ 175 cm, un canapé
 * deux places environ 180 cm de long. Ce sont des repères de PERCEPTION, pas des
 * cotes de fabrication, et rien dans le prix n'en dépend.
 */
export const REFERENCES: readonly ReferenceEchelle[] = [
  { nom: 'Feuille A4', hauteurCm: 29.7, largeurCm: 21, forme: 'feuille' },
  { nom: 'Canapé', hauteurCm: 80, largeurCm: 180, forme: 'canape' },
  { nom: 'Personne', hauteurCm: 175, largeurCm: 46, forme: 'silhouette' },
  { nom: 'Porte', hauteurCm: 204, largeurCm: 83, forme: 'porte' },
];

/**
 * Le repère le plus parlant pour une enseigne donnée.
 *
 * On compare les HAUTEURS en écart logarithmique. Comparer les écarts absolus
 * choisirait la porte pour toute enseigne au-delà de 1 m, y compris une de
 * 3 m — alors qu'un rapport de 1,5 se lit et qu'un rapport de 6 ne se lit pas.
 *
 * @param hauteurCm Hauteur hors-tout de l'enseigne.
 */
export function referencesClassees(hauteurCm: number): ReferenceEchelle[] {
  if (!(hauteurCm > 0) || !Number.isFinite(hauteurCm)) return [];
  return [...REFERENCES].sort(
    (a, b) => Math.abs(Math.log(a.hauteurCm / hauteurCm)) - Math.abs(Math.log(b.hauteurCm / hauteurCm)),
  );
}

/**
 * Le meilleur repère, et rien d'autre.
 *
 * L'appelant qui a des contraintes de place — et l'aperçu en a — doit prendre
 * `referencesClassees` et descendre la liste jusqu'à ce qu'un repère tienne.
 * Vu au navigateur : à 65 cm, le meilleur repère est le canapé, large de 180 cm,
 * et il sortait de la scène par la droite. Un repère COUPÉ ne se compare pas ;
 * mieux vaut le suivant que rien.
 */
export function referencePour(hauteurCm: number): ReferenceEchelle | null {
  return referencesClassees(hauteurCm)[0] ?? null;
}
