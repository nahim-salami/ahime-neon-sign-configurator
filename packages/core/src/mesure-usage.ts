/**
 * LA MESURE D'USAGE — ce que le widget dit, et ce qu'il n'envoie à personne (B35).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE WIDGET N'A PAS D'ANALYTIQUE. IL EN A LE VOCABULAIRE.
 *
 * B35 demande de l'« analytics ». Il y a deux façons de le faire, et une seule
 * est tenable ici.
 *
 * La première : le widget appelle un service, pose un identifiant, compte les
 * visiteurs. Elle est exclue. Ce composant est **embarqué chez un marchand**,
 * sur son domaine, sous SA politique de confidentialité et sous SA bannière de
 * consentement. Un appel réseau parti du widget serait un tiers que le marchand
 * n'a pas déclaré, dans un consentement qu'il n'a pas recueilli — et il
 * l'apprendrait d'une mise en demeure.
 *
 * La seconde, celle-ci : le widget **émet des événements DOM** et s'arrête là.
 * Le marchand les branche sur l'analytique qu'il a déjà — GA4, Matomo,
 * Plausible, un journal maison — avec son consentement et ses règles. Le widget
 * n'ouvre aucune connexion, ne pose aucun cookie, ne lit aucun identifiant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES ÉVÉNEMENTS PORTENT, ET CE QU'ILS NE PORTENT PAS
 *
 * Ils portent l'ÉTAPE et la FORME du choix : quelle famille, quelle police,
 * combien de centimètres, quel total affiché. C'est ce qui répond à la seule
 * question utile — « où les gens s'arrêtent-ils, et sur quoi ? »
 *
 * Ils ne portent **jamais le texte saisi**. C'est un prénom, une date de
 * mariage, le nom d'un commerce, parfois le nom d'un enfant. Il n'a rien à
 * faire dans une mesure d'audience, et l'y mettre le ferait sortir du
 * navigateur par le canal du marchand sans que personne l'ait décidé.
 *
 * `longueurTexte` suffit à savoir si les gens écrivent un mot ou une phrase.
 */

/** Les moments qui comptent dans le parcours. */
export type EtapeMesuree =
  | 'ouverture'
  | 'famille'
  | 'texte'
  | 'police'
  | 'couleur'
  | 'taille'
  | 'support'
  | 'options'
  | 'vue-3d'
  | 'realite-augmentee'
  | 'partage'
  | 'panier';

/** Le nom de l'événement DOM émis. Un seul, pour un seul écouteur. */
export const NOM_EVENEMENT = 'ahns:mesure';

/** Ce qu'un événement porte. Rien d'autre n'y entre. */
export interface Mesure {
  etape: EtapeMesuree;
  /** Famille de produit en cours. */
  famille?: 'neon' | 'panel' | 'boxSign';
  /** Identifiant de police — un choix de catalogue, pas une donnée du client. */
  policeId?: string;
  /** Hauteur de lettre, en centimètres. */
  hauteurCm?: number;
  /**
   * Longueur du texte, en caractères — jamais le texte.
   *
   * Le texte d'un néon est un prénom, une date de mariage, le nom d'un enfant.
   * Sa longueur dit tout ce qu'une mesure d'audience a besoin de savoir : si
   * les gens écrivent un mot ou une phrase.
   */
  longueurTexte?: number;
  /** Total affiché, en centimes — le palier atteint, pas le panier. */
  totalCents?: number;
}

/** Les clés interdites, quoi qu'il arrive. */
const INTERDITES = ['texte', 'text', 'lines', 'email', 'nom', 'name', 'tel', 'adresse'];

/** Les seules clés dont une valeur de type chaîne est admise. */
const CHAINES_ADMISES = ['etape', 'famille', 'policeId'];

/**
 * Nettoie une mesure avant de l'émettre.
 *
 * Ce n'est pas de la ceinture et des bretelles : le jour où quelqu'un ajoutera
 * un champ à `Mesure` par commodité, c'est ici que ça s'arrêtera, et pas dans
 * le journal du marchand.
 */
export function mesurePropre(m: Mesure): Mesure {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (INTERDITES.includes(k.toLowerCase())) continue;
    if (undefined === v) continue;
    // Une chaîne libre n'a rien à faire ici : seules les clés de catalogue et
    // les nombres passent.
    if ('string' === typeof v && !CHAINES_ADMISES.includes(k)) continue;
    out[k] = v;
  }
  return out as unknown as Mesure;
}

/**
 * Émet la mesure sur l'hôte — et rien de plus.
 *
 * L'événement remonte (`bubbles`) et traverse le Shadow DOM (`composed`) :
 * sans les deux, le marchand devrait connaître la racine d'ombre du composant
 * pour écouter, ce qui reviendrait à lui demander d'en connaître l'intérieur.
 *
 * Rend `false` quand rien n'a pu être émis — hôte absent, environnement sans
 * DOM — pour qu'un appelant puisse le constater au lieu de le supposer.
 */
export function emettreMesure(hote: EventTarget | null | undefined, m: Mesure): boolean {
  if (!hote || 'function' !== typeof hote.dispatchEvent) return false;
  try {
    hote.dispatchEvent(
      new CustomEvent(NOM_EVENEMENT, {
        detail: mesurePropre(m),
        bubbles: true,
        composed: true,
      }),
    );
    return true;
  } catch {
    // Un environnement sans `CustomEvent` ne doit pas casser un configurateur.
    return false;
  }
}
