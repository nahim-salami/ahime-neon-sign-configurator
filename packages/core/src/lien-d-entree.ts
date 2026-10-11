/**
 * LES LIENS D'ENTRÉE — une URL qu'un marchand écrit à la main (B35).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE JETON DE PARTAGE NE SUFFIT PAS
 *
 * `partage.ts` produit déjà un lien : `#n=<jeton>`, une configuration complète
 * compressée. Il est fait pour le CLIENT — il naît d'un dessin existant, et
 * personne ne l'écrit à la main.
 *
 * Un lien d'entrée répond au besoin inverse. Le marchand prépare une campagne,
 * un article, un e-mail, une fiche produit, et veut que le configurateur
 * s'ouvre déjà sur « BONJOUR en Pacifico rose, 25 cm ». Il doit pouvoir taper
 * cette URL sans outil :
 *
 *     ?ahns-texte=BONJOUR&ahns-police=pacifico&ahns-hauteur=25&ahns-couleur=ff2fb0
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'URL PROPOSE, LE CATALOGUE DISPOSE
 *
 * C'est la règle qui tient tout le reste. Une URL vient d'ailleurs — d'un
 * e-mail suivi, d'un moteur de recherche, d'un lien recopié de travers, ou de
 * quelqu'un qui essaie des valeurs. Elle n'a aucune autorité :
 *
 * - une police absente du catalogue est ignorée, pas ajoutée ;
 * - une hauteur hors des bornes est ignorée, pas rognée en silence — rogner
 *   ouvrirait le configurateur sur un chiffre que personne n'a demandé ;
 * - une couleur qui n'est pas six chiffres hexadécimaux est ignorée ;
 * - un texte trop long est ignoré, parce qu'un texte tronqué est un texte faux.
 *
 * Chaque paramètre est jugé SÉPARÉMENT : un lien dont la police est mauvaise
 * ouvre quand même sur le bon texte. Refuser le lien entier punirait le
 * visiteur d'une faute du marchand.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET RIEN N'EST DIT DE CE QUI A ÉTÉ IGNORÉ, SAUF AU MARCHAND
 *
 * `ignores` liste les paramètres écartés. Il ne sert pas à afficher une erreur
 * au visiteur — il n'y peut rien — mais à ce que le marchand puisse vérifier
 * son lien avant de l'imprimer sur dix mille prospectus.
 */

/** Préfixe des paramètres, pour ne jamais heurter ceux de la boutique. */
export const PREFIXE = 'ahns-';

/** Longueur maximale du texte accepté depuis une URL. */
export const TEXTE_MAX = 60;

/** Bornes de hauteur de lettre, en centimètres. */
export const HAUTEUR_MIN_CM = 5;
export const HAUTEUR_MAX_CM = 60;

/** Ce qu'un lien d'entrée a pu porter, une fois filtré. */
export interface EntreeLien {
  texte?: string;
  policeId?: string;
  hauteurCm?: number;
  couleurHex?: string;
  /** Paramètres présents mais écartés, avec la raison — pour le marchand. */
  ignores: Array<{ cle: string; motif: string }>;
}

/** Un `#rrggbb` valide, ou `null`. */
function couleur(v: string): string | null {
  const s = v.replace(/^#/, '').trim();
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : null;
}

/**
 * Lit un lien d'entrée.
 *
 * @param recherche La chaîne de requête (`location.search`), avec ou sans `?`.
 * @param polices   Les identifiants de police RÉELLEMENT au catalogue.
 */
export function lireLienDEntree(
  recherche: string,
  polices: readonly string[],
): EntreeLien {
  const out: EntreeLien = { ignores: [] };
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  } catch {
    // Une chaîne de requête illisible n'est pas une erreur du visiteur : le
    // configurateur s'ouvre sur ses défauts, sans un mot.
    return out;
  }
  const ecarter = (cle: string, motif: string) => out.ignores.push({ cle: PREFIXE + cle, motif });

  const texte = p.get(`${PREFIXE}texte`);
  if (null !== texte) {
    const t = texte.trim();
    if (!t) ecarter('texte', 'vide');
    // Tronquer donnerait un texte faux, donc un aperçu faux, donc un prix faux.
    else if (t.length > TEXTE_MAX) ecarter('texte', `plus de ${TEXTE_MAX} caractères`);
    else out.texte = t;
  }

  const police = p.get(`${PREFIXE}police`);
  if (null !== police) {
    if (polices.includes(police)) out.policeId = police;
    else ecarter('police', `absente du catalogue (${police})`);
  }

  const hauteur = p.get(`${PREFIXE}hauteur`);
  if (null !== hauteur) {
    const h = Number(hauteur.replace(',', '.'));
    if (!Number.isFinite(h)) ecarter('hauteur', 'pas un nombre');
    else if (h < HAUTEUR_MIN_CM || h > HAUTEUR_MAX_CM) {
      // Rogner ouvrirait le configurateur sur un chiffre que personne n'a
      // demandé, et que le visiteur croirait choisi pour lui.
      ecarter('hauteur', `hors de ${HAUTEUR_MIN_CM}-${HAUTEUR_MAX_CM} cm`);
    } else out.hauteurCm = h;
  }

  const c = p.get(`${PREFIXE}couleur`);
  if (null !== c) {
    const hex = couleur(c);
    if (hex) out.couleurHex = hex;
    else ecarter('couleur', 'pas six chiffres hexadécimaux');
  }

  return out;
}

/**
 * Écrit un lien d'entrée — l'outil que le marchand utilise pour ne pas se
 * tromper en le tapant.
 *
 * Ne pose que les paramètres donnés : une URL qui traîne quatre paramètres
 * vides se recopie mal et se lit encore plus mal.
 */
export function ecrireLienDEntree(base: string, e: Omit<EntreeLien, 'ignores'>): string {
  const p = new URLSearchParams();
  if (e.texte) p.set(`${PREFIXE}texte`, e.texte);
  if (e.policeId) p.set(`${PREFIXE}police`, e.policeId);
  if (undefined !== e.hauteurCm) p.set(`${PREFIXE}hauteur`, String(e.hauteurCm));
  if (e.couleurHex) p.set(`${PREFIXE}couleur`, e.couleurHex.replace(/^#/, ''));
  const q = p.toString();
  if (!q) return base;
  return base + (base.includes('?') ? '&' : '?') + q;
}
