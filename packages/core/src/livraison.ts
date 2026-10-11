/**
 * CE QU'IL Y A DANS LE COLIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PLAINTE QU'ON TRAITE, ET SON REVERS
 *
 * `parcours-configurateur-ux` §3 nomme la plainte n° 7 : « surcoûts découverts
 * tard ». La règle qu'elle en tire est que le prix de l'étape 1 doit être celui
 * qu'on paie.
 *
 * Le revers est aussi important et personne ne le traite : le client ne sait pas
 * ce qu'il **n'a pas** à racheter. Il commande une enseigne et se demande s'il
 * lui faudra un transfo, des vis, une rallonge. Un client qui l'ignore compare
 * un prix complet à un prix nu, et il choisit le prix nu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UN CALCUL ET NON UNE LISTE ÉCRITE
 *
 * La tentation était de recopier la liste de la compétence — télécommande,
 * variateur, kit de vis, câble, prise, garantie. Elle cite ce que font les
 * concurrents, et c'est un piège : **la télécommande n'est PAS incluse ici par
 * défaut.** `docs/02` §Électronique le dit — « option payante (défaut) ou
 * incluse (réglage marchand) » — et `dimmerRemoteCents` vaut 19 €.
 *
 * L'écrire dans une liste en dur aurait promis au client quelque chose qu'il
 * n'aurait pas reçu. C'est exactement ce que la règle 3 de `CLAUDE.md` interdit,
 * et la faute aurait survécu à toute relecture parce que la phrase venait d'une
 * compétence.
 *
 * Le contenu est donc DÉDUIT de la configuration et des coefficients du
 * marchand. Une ligne n'apparaît que si elle part vraiment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON N'Y MET PAS : LA GARANTIE
 *
 * `docs/02` §Production la détaille — deux ans de garantie légale de conformité
 * pour les particuliers en France, plancher non modulable. C'est vrai, et ce
 * n'est pas dans le colis : c'est un droit, il dépend du pays de l'acheteur et
 * de sa qualité de particulier ou de professionnel. L'annoncer ici en dur le
 * promettrait à un client américain dans les mêmes termes qu'à un client
 * français.
 *
 * Sa place est aux CGV, où le thème l'écrit déjà (art. 6).
 */

import type { NeonConfiguration } from './types.js';
import type { PricingCoefficients } from './coefficients.js';
import { DEFAULT_TUBE } from './electrical.js';

export interface LigneLivree {
  /** Clé de traduction. */
  libelle: string;
  /** Précision chiffrée, quand il y en a une de vérifiable. */
  detail?: string;
}

/**
 * Le contenu du colis, tel qu'il partira RÉELLEMENT.
 *
 * @param config Ce que le client a composé.
 * @param coeff  Les coefficients EFFECTIFS du marchand.
 */
export function contenuLivre(
  config: NeonConfiguration,
  coeff: Pick<PricingCoefficients, 'dimmerRemoteCents' | 'tube'>,
): LigneLivree[] {
  const out: LigneLivree[] = [];

  // L'ENSEIGNE ELLE-MÊME N'EST PAS LISTÉE : le client vient de la composer, la
  // lui annoncer ferait du remplissage et diluerait le reste.

  /*
   * L'ALIMENTATION ET SON CÂBLE.
   *
   * La longueur vient de la bobine choisie, pas d'une constante d'affichage :
   * un marchand qui livre 5 m ne doit pas voir « 2 m » écrit sous son produit.
   */
  const cableM = coeff.tube?.cableLengthM ?? DEFAULT_TUBE.cableLengthM;
  out.push({ libelle: 'Bloc d’alimentation et sa prise' });
  if (cableM > 0) {
    out.push({ libelle: 'Câble transparent', detail: `${cableM} m` });
  }

  // Le kit de fixation — `docs/02` §Fixations : « inclus », sans condition.
  out.push({ libelle: 'Kit de vis et entretoises' });

  /*
   * LA TÉLÉCOMMANDE : SEULEMENT SI ELLE PART.
   *
   * Trois cas, et ils se distinguent : le client l'a prise en option ; le
   * marchand l'a rendue gratuite (`dimmerRemoteCents` à zéro) ; ou elle n'est
   * pas du voyage. Dans le troisième, on se tait — la mentionner « en option »
   * dans une liste de contenu ferait croire qu'elle y est.
   */
  if (config.options?.dimmerRemote || 0 === coeff.dimmerRemoteCents) {
    out.push({ libelle: 'Télécommande et variateur' });
  }

  // Le contrôleur RGB voyage AVEC la bobine RGB, il n'est pas séparable.
  if ('rgb' === config.colorMode) {
    out.push({ libelle: 'Contrôleur RGB' });
  }

  return out;
}

/**
 * LE DÉLAI DE FABRICATION ANNONCÉ, en jours ouvrés.
 *
 * `parcours-configurateur-ux` §5 : « affiché dans le configurateur, pas en
 * CGV ». Un client qui commande pour une date doit le lire avant de payer.
 *
 * Rend `null` sur des valeurs incohérentes plutôt qu'un intervalle absurde : un
 * marchand qui saisit 15 puis 10 verrait « 15 à 10 jours », et c'est pire que
 * pas de délai du tout.
 */
export function delaiAnnonce(
  coeff: Pick<PricingCoefficients,
    'leadTimeMinDays' | 'leadTimeMaxDays' | 'leadTimeExpressMinDays' | 'leadTimeExpressMaxDays'>,
  express: boolean,
): { min: number; max: number } | null {
  const min = express ? coeff.leadTimeExpressMinDays : coeff.leadTimeMinDays;
  const max = express ? coeff.leadTimeExpressMaxDays : coeff.leadTimeMaxDays;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (!(min > 0) || !(max > 0) || max < min) return null;
  return { min: Math.round(min), max: Math.round(max) };
}

/**
 * LA GARANTIE ANNONCÉE — et le piège juridique qu'elle cache (B07).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GARANTIES, ET UNE SEULE EST NÉGOCIABLE
 *
 * `conformite-ce-enseigne` §6.1 : « Pour un acheteur **consommateur**, la
 * garantie légale de conformité est de **deux ans** et ne peut pas être réduite
 * contractuellement. Une garantie commerciale de 12 mois n'a le droit d'exister
 * qu'en **supplément**, jamais en remplacement. »
 *
 * docs/02 annonçait « garantie 24 mois intérieur, 12 mois extérieur ». Écrit
 * ainsi, sur une fiche destinée à des particuliers, c'est illégal : le client a
 * deux ans quoi qu'il arrive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONSÉQUENCE QU'ON N'ATTENDAIT PAS : UNE GARANTIE COMMERCIALE PLUS COURTE
 * NE S'AFFICHE PAS
 *
 * Le réflexe serait d'écrire les deux lignes côte à côte — « légale 2 ans,
 * commerciale 12 mois ». C'est exact et c'est trompeur : le lecteur retient le
 * plus petit chiffre, et le plus petit chiffre ne veut rien dire pour lui.
 *
 * Une garantie commerciale de douze mois est **entièrement absorbée** par les
 * vingt-quatre mois légaux. Elle n'ajoute rien, elle ne retire rien : elle
 * n'existe pas, du point de vue du consommateur. On ne l'affiche donc que
 * lorsqu'elle **dépasse** le plancher légal — c'est-à-dire quand elle apporte
 * réellement quelque chose.
 *
 * Le marchand garde son réglage : il lui sert entre professionnels, où la
 * garantie légale des consommateurs ne s'applique pas.
 */

/** Le plancher, en mois. Ce n'est pas un réglage : c'est la loi. */
export const GARANTIE_LEGALE_MOIS = 24;

export interface Garantie {
  /** Toujours 24 pour un particulier. */
  legaleMois: number;
  /**
   * La garantie commerciale, UNIQUEMENT si elle dépasse le plancher légal.
   * `null` quand elle n'ajoute rien — ce qui est le cas le plus fréquent.
   */
  commercialeMois: number | null;
  /** Ce qui s'affiche, en une phrase. */
  texte: string;
}

/**
 * Ce qu'on a le droit d'annoncer à un particulier.
 *
 * @param commercialeMois Réglage marchand pour cet environnement. Absent,
 *                        incohérent ou inférieur au plancher : ignoré.
 */
export function garantieAnnoncee(commercialeMois?: number | null): Garantie {
  const c = Number.isFinite(commercialeMois) ? Number(commercialeMois) : 0;
  // « > » et non « >= » : une commerciale égale au plancher n'ajoute rien non
  // plus, et l'écrire ferait croire à deux garanties là où il n'y en a qu'une.
  const utile = c > GARANTIE_LEGALE_MOIS ? Math.round(c) : null;
  return {
    legaleMois: GARANTIE_LEGALE_MOIS,
    commercialeMois: utile,
    texte: null === utile
      ? 'Garantie légale de conformité : 2 ans'
      : `Garantie légale de conformité : 2 ans ; garantie commerciale ${utile} mois`,
  };
}
