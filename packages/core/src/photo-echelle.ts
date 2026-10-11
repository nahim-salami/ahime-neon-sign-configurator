/**
 * LE NÉON SUR LA PHOTO DU CLIENT, À LA BONNE TAILLE (B12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ÉTAPE EXISTE
 *
 * `parcours-configurateur-ux` §1, étape 8 : « décor photo → **photo du client à
 * l'échelle** → RA murale ». Et §2 rappelle pourquoi c'est la seule plainte qui
 * coûte des retours : « reçu 30 cm × 2 cm alors que la photo le montrait
 * au-dessus du canapé ».
 *
 * Le décor photo montre un mur qui n'est pas le sien. La RA montre le sien,
 * mais elle demande un téléphone récent et le client n'est pas toujours devant
 * le mur. Entre les deux, il reste le cas le plus fréquent : quelqu'un devant
 * son ordinateur, avec une photo de son salon.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PHOTO NE PORTE AUCUNE ÉCHELLE — IL FAUT LA LUI DONNER
 *
 * D'où la « référence saisie » de B12 : le client trace un segment sur quelque
 * chose dont il connaît la taille — une porte, une prise, un carreau — et dit
 * combien il mesure. Deux nombres suffisent à tout : une longueur en pixels et
 * une longueur en centimètres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE PEUT PAS FAIRE, ET QU'IL FAUT DONC DIRE
 *
 * **La perspective.** Une photo projette ; l'échelle n'est constante que dans
 * UN plan. Une référence mesurée sur le mur du fond ne vaut rien pour un néon
 * posé sur le mur de côté, et rien ne permet de le détecter depuis deux
 * nombres. On ne le corrige pas — on l'écrit, et c'est la seule réponse
 * honnête.
 *
 * **La précision du tracé.** Le client vise à la souris. Une erreur d'un pixel
 * sur un segment de 40 px fait 2,5 % ; sur 400 px, 0,25 %. Cette incertitude se
 * reporte TELLE QUELLE sur la taille affichée du néon, et elle est calculable :
 * c'est `1 / segmentPx`. On la rend, et on refuse en dessous du seuil où elle
 * dépasse la tolérance de fabrication.
 *
 * Rien de tout cela ne sort du navigateur : la photo n'est ni envoyée, ni
 * enregistrée. Comme le flux caméra de la RA, c'est vrai par construction et
 * c'est à ÉCRIRE, parce que le visiteur n'a aucun moyen de le vérifier.
 */

/**
 * L'incertitude maximale acceptée sur l'échelle, en part de 1.
 *
 * 5 % est le seuil de la compétence `realite-augmentee-widget` §0 pour la RA :
 * « un écart de plus de 5 % rend la fonction nuisible : elle est plus
 * convaincante que la cote écrite, donc elle gagne. » La photo à l'échelle pose
 * exactement le même problème — elle est plus convaincante que les centimètres
 * du curseur — et mérite donc le même seuil, pas un plus indulgent.
 */
export const INCERTITUDE_MAX = 0.05;

/** En dessous, le tracé est trop court pour que 5 % soient tenables. */
export const SEGMENT_MIN_PX = Math.ceil(1 / INCERTITUDE_MAX);

/** Une référence hors de ces bornes n'est pas une erreur de visée, c'est une faute de frappe. */
export const REFERENCE_MIN_CM = 1;
export const REFERENCE_MAX_CM = 2000;

export type RefusEchelle =
  /** Le segment tracé est trop court : la visée à un pixel près y pèse trop. */
  | 'segment-trop-court'
  /** La longueur annoncée n'est pas plausible. */
  | 'longueur-invalide';

export interface Echelle {
  /** Combien de centimètres réels vaut un pixel de la photo. */
  cmParPixel: number;
  /**
   * L'incertitude relative, née de la visée : `1 / segmentPx`.
   *
   * Elle se reporte telle quelle sur la taille affichée. À 2 %, un néon de
   * 90 cm est dessiné à ± 1,8 cm — sous la tolérance d'atelier. À 10 %, il est
   * dessiné à ± 9 cm, et l'aperçu ment plus que le curseur qu'il illustre.
   */
  incertitude: number;
}

export type ResultatEchelle =
  | { ok: true; echelle: Echelle }
  | { ok: false; refus: RefusEchelle };

/**
 * L'échelle de la photo, d'après le segment de référence.
 *
 * @param segmentPx        Longueur du trait tracé par le client, en pixels d'image.
 * @param longueurReelleCm Ce qu'il déclare mesurer.
 */
export function echelleDepuisReference(segmentPx: number, longueurReelleCm: number): ResultatEchelle {
  if (!Number.isFinite(longueurReelleCm)
    || longueurReelleCm < REFERENCE_MIN_CM
    || longueurReelleCm > REFERENCE_MAX_CM) {
    return { ok: false, refus: 'longueur-invalide' };
  }
  if (!Number.isFinite(segmentPx) || segmentPx < SEGMENT_MIN_PX) {
    // On refuse AVANT de diviser : un segment de 2 px donnerait une échelle
    // parfaitement calculable et parfaitement fausse.
    return { ok: false, refus: 'segment-trop-court' };
  }
  return {
    ok: true,
    echelle: { cmParPixel: longueurReelleCm / segmentPx, incertitude: 1 / segmentPx },
  };
}

/** Longueur d'un segment tracé, en pixels. */
export function longueurSegment(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * La taille du néon sur la photo, en pixels.
 *
 * Rend aussi la marge que l'incertitude laisse : c'est ce qui permet de dessiner
 * un liseré « il fera entre ceci et cela » plutôt qu'un trait net qui promet une
 * précision qu'on n'a pas.
 */
export function tailleSurPhoto(
  largeurCm: number,
  hauteurCm: number,
  e: Echelle,
): { largeurPx: number; hauteurPx: number; margePx: number } {
  const largeurPx = largeurCm / e.cmParPixel;
  const hauteurPx = hauteurCm / e.cmParPixel;
  return {
    largeurPx,
    hauteurPx,
    // La marge se prend sur la plus GRANDE dimension : c'est elle que l'œil
    // compare au mur, et c'est sur elle que l'erreur se voit.
    margePx: Math.max(largeurPx, hauteurPx) * e.incertitude,
  };
}

/** Ce qu'on affiche au client : « ± 2 % » — et l'avertissement qui va avec. */
export function incertitudeEnPourcent(e: Echelle): number {
  return Math.round(e.incertitude * 1000) / 10;
}

/**
 * LA TAILLE À DONNER À LA PHOTO POUR QU'ELLE PARTAGE L'ÉCHELLE DE L'APERÇU.
 *
 * ── C'EST LA PHOTO QU'ON MET À L'ÉCHELLE, PAS LE NÉON ─────────────────────
 *
 * Le réflexe serait de dessiner le néon plus ou moins gros sur la photo. C'est
 * l'inverse qu'il faut faire : l'aperçu 2D a DÉJÀ une échelle à lui, sur
 * laquelle reposent les cotes affichées, le repère de taille et le gabarit
 * papier. Y toucher pour un fond ferait mentir les trois.
 *
 * On zoome donc la photo jusqu'à ce que son échelle rejoigne celle de l'aperçu.
 * Un pixel d'image vaut `cmParPixel` centimètres réels ; l'aperçu dessine
 * `pxParCm` pixels d'écran par centimètre réel ; donc un pixel d'image doit
 * occuper `cmParPixel × pxParCm` pixels d'écran, et l'image entière suit.
 *
 * Le néon garde sa taille, la photo prend la sienne, et les deux se comparent.
 */
export function largeurFondPx(largeurImagePx: number, e: Echelle, pxParCm: number): number {
  return largeurImagePx * e.cmParPixel * pxParCm;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LE MOCKUP SUR PHOTO DU SITE CLIENT (B30)
 *
 * B12 met le néon à l'échelle SUR L'ÉCRAN du client, le temps qu'il regarde.
 * B30 en fait un FICHIER que le revendeur envoie à son propre client — et la
 * différence de conséquence est entière : une image part, circule, se rouvre
 * dans six semaines, et personne n'aura le configurateur sous les yeux pour la
 * relativiser.
 *
 * `parcours-configurateur-ux` §7 le range en « Should » du parcours revendeur :
 * « mockup sur photo du site sans travail manuel ». Sans travail manuel veut
 * dire sans retoucheur — pas sans garde-fou.
 *
 * ── LE PIÈGE EST LE MÊME QU'AU DÉPART, EN PIRE ────────────────────────────
 *
 * L'avis qui a fondé tout ce travail : « reçu 30 cm × 2 cm alors que la photo
 * le montrait au-dessus du canapé ». Un mockup produit automatiquement, à la
 * mauvaise échelle, EST cette photo-là. C'est pourquoi deux choses ne se
 * négocient pas ici :
 *
 *   1. **on ne rétrécit jamais le néon pour qu'il tienne.** S'il dépasse la
 *      photo à son échelle réelle, c'est un fait sur la pièce, pas un problème
 *      de cadrage — et le dire est la seule réponse juste ;
 *   2. **l'image porte ses cotes.** Un mockup muet redevient exactement la
 *      photo trompeuse de l'avis. Deux lignes de légende coûtent trois lignes
 *      de code et retirent tout le pouvoir de nuisance de l'image.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Où poser le néon sur la photo, en part de l'image (0,5 = centre). */
export interface Ancrage {
  xPart: number;
  yPart: number;
}

export interface Composition {
  /** Coin haut-gauche du néon, en pixels d'image. */
  xPx: number;
  yPx: number;
  largeurPx: number;
  hauteurPx: number;
  /**
   * Le néon sort-il du cadre à son échelle réelle ?
   *
   * Ce n'est PAS une erreur à corriger : c'est un fait sur la pièce, et le
   * revendeur doit le voir. Rétrécir pour que ça tienne reproduirait
   * exactement le mensonge que ce projet combat.
   */
  deborde: boolean;
}

/**
 * Où et à quelle taille poser le néon sur la photo.
 *
 * L'ancrage est ramené dans le cadre, mais la TAILLE ne l'est jamais : on
 * déplace, on ne redimensionne pas.
 */
export function compositionMockup(
  photoLargeurPx: number,
  photoHauteurPx: number,
  e: Echelle,
  neonLargeurCm: number,
  neonHauteurCm: number,
  ancrage: Ancrage = { xPart: 0.5, yPart: 0.42 },
): Composition {
  const largeurPx = neonLargeurCm / e.cmParPixel;
  const hauteurPx = neonHauteurCm / e.cmParPixel;
  const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  /*
   * L'ancrage se borne pour que la pièce reste VISIBLE, mais seulement quand
   * elle peut l'être. Sur un néon plus large que la photo, `max` passe sous
   * `min` : on centre alors le débordement plutôt que de le coller à gauche,
   * ce qui montre au moins le milieu de la pièce.
   */
  const xVoulu = ancrage.xPart * photoLargeurPx - largeurPx / 2;
  const yVoulu = ancrage.yPart * photoHauteurPx - hauteurPx / 2;
  const deborde = largeurPx > photoLargeurPx || hauteurPx > photoHauteurPx;
  return {
    xPx: deborde && largeurPx > photoLargeurPx
      ? (photoLargeurPx - largeurPx) / 2
      : borne(xVoulu, 0, photoLargeurPx - largeurPx),
    yPx: deborde && hauteurPx > photoHauteurPx
      ? (photoHauteurPx - hauteurPx) / 2
      : borne(yVoulu, 0, photoHauteurPx - hauteurPx),
    largeurPx,
    hauteurPx,
    deborde,
  };
}

/**
 * La légende que l'image DOIT porter.
 *
 * Un mockup muet redevient la photo trompeuse de l'avis fondateur. Celle-ci
 * dit trois choses : les cotes réelles, l'incertitude de l'échelle, et le fait
 * qu'il s'agit d'un montage — parce qu'un client qui reçoit l'image six semaines
 * plus tard ne se souviendra pas de la manière dont elle a été faite.
 */
export function legendeMockup(
  neonLargeurCm: number,
  neonHauteurCm: number,
  e: Echelle,
  deborde = false,
): string[] {
  /*
   * ARRONDI À L'ENTIER, COMME LA PASTILLE DE COTES DE L'APERÇU.
   *
   * La légende écrivait un dixième — « 18,6 cm » — quand la pastille affichait
   * « 19 cm ». Deux nombres pour la même pièce, sur le même écran : le
   * revendeur envoie l'un et devise l'autre.
   *
   * Et le dixième promettait une précision que l'échelle n'a pas : à ± 0,2 %,
   * un mètre est déjà connu à deux millimètres près, et à ± 2 % il l'est à deux
   * centimètres. Le dixième de centimètre n'a de sens dans aucun des deux cas.
   */
  const n = (v: number) => Math.round(v).toString();
  const lignes = [
    `${n(neonLargeurCm)} × ${n(neonHauteurCm)} cm : montage à l’échelle sur photo`,
    `échelle donnée par un repère de la photo, à ± ${incertitudeEnPourcent(e).toString().replace('.', ',')} %`,
  ];
  if (deborde) {
    // Le cas où l'image seule tromperait le plus : la pièce sort du cadre.
    lignes.push('à cette taille, la pièce dépasse le cadrage de la photo');
  }
  return lignes;
}
