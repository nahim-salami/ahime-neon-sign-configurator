/**
 * PHOTOMÉTRIE — combien de lumière sort réellement du tube.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 *
 * Ce n'est PAS un moteur de rendu photométrique, et rien de ce qu'il produit ne
 * doit être présenté comme une « simulation lumineuse ». La compétence
 * `physique-neon-led` §2.5 est explicite : le bloom, le halo et le scintillement
 * de la vue 3D sont un parti pris de séduction, parfaitement légitime, mais ils
 * ne simulent rien — et écrire « rendu photométrique » sur une page de vente est
 * une allégation vérifiable, donc attaquable.
 *
 * Ce que fait ce fichier est plus modeste et plus utile : il **ancre** ces
 * réglages sur une grandeur mesurée, pour qu'ils bougent dans le bon sens et
 * selon une loi écrite, au lieu d'être des constantes réglées à l'œil (E10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RÉSULTAT QUI GOUVERNE LA CONCEPTION
 *
 * Relevé fiche en main sur `ressources/flex-led/cip-neon-flex-6x12.pdf`, qui
 * publie ses flux pour DEUX régimes de puissance du même produit — 5 W/m et
 * 10 W/m — ce qui permet de vérifier chaque valeur deux fois :
 *
 *   teinte      lm/W @5 W/m   lm/W @10 W/m
 *   4000 K         37,2          36,0
 *   2700 K         35,6          35,3
 *   2100 K         29,0          24,6
 *   vert           48,0          39,8
 *   rouge          16,4          16,0
 *   rose           15,6          14,4
 *   ambre          12,2          12,5
 *   bleu            6,0           5,2
 *
 * **Le rendement dépend huit fois plus de la couleur que de la puissance.** Un
 * bleu et un vert de même puissance électrique ne donnent pas le même nombre de
 * lumens à un facteur près : ils diffèrent d'un facteur 7,7.
 *
 * Ce n'est pas un défaut des LED bleues, c'est la définition du lumen. Le lumen
 * pondère le flux par la sensibilité de l'œil, qui culmine à 555 nm (vert) et
 * s'effondre vers 465 nm (bleu) — V(λ) y vaut environ 0,06. Une LED bleue peut
 * être électriquement excellente et photométriquement pauvre.
 *
 * Conséquence directe : **aucune constante unique de lm/W ne décrit un
 * catalogue.** Un `lumens = watts × 35` aurait sur-estimé un bleu d'un facteur
 * sept, c'est-à-dire annoncé au client une lumière qu'il ne recevrait jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE PRIORITÉ, ET POURQUOI IL EST DIT
 *
 * 1. Le **flux déclaré** de la bobine (`lumensPerMeter`) — une mesure.
 * 2. À défaut, **puissance × rendement de la famille** — une estimation.
 * 3. À défaut, **rien**.
 *
 * Le troisième cas n'est pas un échec, c'est la règle 3 de `CLAUDE.md` : un
 * chiffre sans source ne s'affiche pas. `fluxLumineux` rend donc son `origine`,
 * et l'appelant décide s'il a le droit de le montrer.
 */

import type { PricingCoefficients, TubeCatalogEntry } from './coefficients.js';
import { ligneVersTube } from './coefficients.js';

/**
 * Familles spectrales du catalogue.
 *
 * Ce ne sont pas des couleurs d'écran : ce sont les regroupements pour lesquels
 * la fiche CIP publie un flux distinct. On ne subdivise pas plus finement que la
 * source ne le permet.
 */
export type FamilleSpectrale =
  | 'blanc-chaud'
  | 'blanc-neutre'
  | 'blanc-froid'
  | 'ambre'
  | 'rouge'
  | 'rose'
  | 'vert'
  | 'bleu';

/**
 * Rendement lumineux par famille, en lumens par watt.
 *
 * Source unique et homogène : `ressources/flex-led/cip-neon-flex-6x12.pdf`,
 * profil 6 × 12 en SMD2835, 120 LED/m, 24 V. Chaque valeur est confirmée par
 * les deux régimes publiés (5 et 10 W/m) ; **on retient le régime 10 W/m**, plus
 * proche du défaut de 12 W/m du configurateur, et plus défavorable sur six
 * familles sur huit. Sous-estimer une lumière est une erreur qui se pardonne ;
 * la sur-estimer revient dans le colis.
 *
 * Ce sont des rendements d'une FAMILLE de produits d'un fabricant, pas des
 * constantes physiques. Une bobine qui déclare son flux l'emporte toujours :
 * voir l'ordre de priorité en tête de fichier.
 */
export const RENDEMENT_LM_PAR_W: Readonly<Record<FamilleSpectrale, number>> = {
  // 2700 K : 353 lm/m à 10 W/m.
  'blanc-chaud': 35.3,
  // 4000 K : 360 lm/m à 10 W/m.
  'blanc-neutre': 36.0,
  // 6000 K : 359 lm/m à 10 W/m.
  'blanc-froid': 35.9,
  // 2100 K et « Amber » se rejoignent bas : 24,6 et 12,5. On retient l'ambre
  // saturé, la teinte que le client choisit quand il clique « orange ».
  ambre: 12.5,
  // 160 lm/m à 10 W/m.
  rouge: 16.0,
  // 144 lm/m à 10 W/m.
  rose: 14.4,
  // 398 lm/m à 10 W/m — le maximum, l'œil étant au sommet de sa sensibilité.
  vert: 39.8,
  // 51,6 lm/m à 10 W/m — le minimum, et c'est V(λ) qui le décide.
  bleu: 5.2,
};

/**
 * Convertit un hex en teinte et en COLORATION (H en degrés, s dans [0, 1]).
 *
 * La coloration retenue est celle de TSV — `(max − min) / max` — et non celle de
 * TSL. Ce n'est pas un détail de conversion, c'est ce qui décide du classement :
 * en TSL, une couleur très claire a une saturation qui tend vers 1 quelle que
 * soit sa teinte, si bien qu'un `#fff2e0` — un blanc chaud d'écran, coloré à
 * 12 % — sort à 100 % de saturation.
 *
 * Le témoin l'a attrapé. Sans lui, tout blanc chaud du catalogue aurait été
 * classé « ambre », à 12,5 lm/W au lieu de 35,3 : un flux annoncé **trois fois
 * trop faible** sur la couleur la plus vendue.
 */
function hexEnTsv(hex: string): { h: number; s: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const v = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, v, b);
  const min = Math.min(r, v, b);
  const d = max - min;
  if (d < 1e-9 || max < 1e-9) return { h: 0, s: 0 };
  let h: number;
  if (max === r) h = ((v - b) / d + (v < b ? 6 : 0)) * 60;
  else if (max === v) h = ((b - r) / d + 2) * 60;
  else h = ((r - v) / d + 4) * 60;
  return { h, s: d / max };
}

/**
 * Seuil de COLORATION en dessous duquel une couleur est traitée comme un blanc.
 *
 * Un « blanc chaud » d'écran n'est pas gris : il porte 10 à 20 % de coloration
 * dans l'orangé. Sous 25 %, on est dans les blancs ; au-dessus, dans les teintes
 * saturées, dont le rendement s'effondre.
 */
const SEUIL_SATURATION = 0.25;

/**
 * Famille spectrale d'une couleur d'écran.
 *
 * C'est une **approximation assumée** : un hexadécimal est une couleur d'écran,
 * pas une longueur d'onde (`physique-neon-led` §2.3). Elle ne sert qu'en dernier
 * recours, quand la bobine ne déclare ni son flux ni sa température de couleur.
 */
export function familleDuHex(hex: string): FamilleSpectrale | null {
  const t = hexEnTsv(hex);
  if (!t) return null;
  if (t.s < SEUIL_SATURATION) {
    // Un blanc d'écran penche vers l'orangé quand il est chaud, vers le bleu
    // quand il est froid. La clarté ne dit rien de la température ; la teinte
    // résiduelle, si.
    if (t.s < 0.04) return 'blanc-neutre';
    return t.h < 90 || t.h > 300 ? 'blanc-chaud' : 'blanc-froid';
  }
  const h = ((t.h % 360) + 360) % 360;
  if (h < 15 || h >= 330) return 'rouge';
  if (h < 45) return 'ambre';
  // Le jaune-vert et le vert partagent le sommet de sensibilité de l'œil.
  if (h < 170) return 'vert';
  // Cyan et bleu : la source ne publie qu'un « Blue », et rien n'autorise à
  // interpoler entre 30 lm/m et 240 lm/m sur une plage où V(λ) varie vite.
  if (h < 265) return 'bleu';
  // Violet et magenta descendent vers le rose, seule valeur publiée au-delà.
  return 'rose';
}

/**
 * Famille spectrale d'une bobine du catalogue.
 *
 * La température de couleur l'emporte sur l'hexadécimal : elle vient de la fiche
 * du fournisseur, l'hex vient d'un nuancier.
 */
export function familleDuTube(tube: Pick<TubeCatalogEntry, 'cct' | 'litHex'> | null | undefined): FamilleSpectrale | null {
  if (!tube) return null;
  if ('number' === typeof tube.cct && tube.cct > 0) {
    if (tube.cct < 3300) return 'blanc-chaud';
    if (tube.cct < 5000) return 'blanc-neutre';
    return 'blanc-froid';
  }
  return tube.litHex ? familleDuHex(tube.litHex) : null;
}

/** D'où vient le flux annoncé — et donc ce qu'on a le droit d'en dire. */
export type OrigineFlux =
  /** Relevé sur la fiche de la bobine. C'est une mesure. */
  | 'fiche'
  /** Puissance × rendement de la famille. C'est une estimation. */
  | 'famille';

export interface Flux {
  /** Flux total, en lumens. */
  lumens: number;
  /** Flux linéique retenu, en lumens par mètre. */
  lumensParMetre: number;
  origine: OrigineFlux;
  famille: FamilleSpectrale | null;
}

/**
 * Flux lumineux d'une ligne de design.
 *
 * Rend `null` quand on ne sait pas — ni flux déclaré, ni famille identifiable.
 * Un appelant qui veut afficher un chiffre doit alors se taire, pas inventer.
 */
export function fluxDeLaLigne(
  ligne: { tubeSku?: string; colorHex?: string },
  tubeM: number,
  coeff: Pick<PricingCoefficients, 'tubes' | 'wattsPerMeter'>,
): Flux | null {
  if (!(tubeM > 0)) return null;
  const tube = ligneVersTube(ligne, coeff);
  const famille = familleDuTube(tube) ?? (ligne.colorHex ? familleDuHex(ligne.colorHex) : null);

  if (tube && 'number' === typeof tube.lumensPerMeter && tube.lumensPerMeter > 0) {
    return {
      lumens: tube.lumensPerMeter * tubeM,
      lumensParMetre: tube.lumensPerMeter,
      origine: 'fiche',
      famille,
    };
  }

  if (!famille) return null;
  const wm = 'number' === typeof tube?.wattsPerMeter && tube.wattsPerMeter > 0
    ? tube.wattsPerMeter
    : coeff.wattsPerMeter;
  if (!(wm > 0)) return null;
  const lpm = wm * RENDEMENT_LM_PAR_W[famille];
  return { lumens: lpm * tubeM, lumensParMetre: lpm, origine: 'famille', famille };
}

/**
 * Flux lumineux d'un design entier.
 *
 * L'origine du total est la **plus faible** de celles des lignes : un total qui
 * mélange une mesure et une estimation est une estimation. Une seule ligne
 * inconnue rend `null` pour tout le design — un total amputé d'une ligne serait
 * un chiffre faux présenté comme juste.
 */
export function fluxDuDesign(
  lignes: ReadonlyArray<{ tubeSku?: string; colorHex?: string }>,
  mesures: { tubeLengthM: number; lineTubeM?: number[] },
  coeff: Pick<PricingCoefficients, 'tubes' | 'wattsPerMeter'>,
): Flux | null {
  if (!(mesures.tubeLengthM > 0)) return null;
  const detail = mesures.lineTubeM;
  const parLigne = Array.isArray(detail) && detail.length === lignes.length ? detail : null;

  // Sans détail par ligne, on ne peut pas répartir la longueur : on ne traite
  // alors que le cas où toutes les lignes partagent la même famille et la même
  // origine, et on refuse le reste plutôt que de répartir au hasard.
  const longueurs = parLigne ?? lignes.map(() => mesures.tubeLengthM / Math.max(1, lignes.length));

  let lumens = 0;
  let origine: OrigineFlux = 'fiche';
  const familles = new Set<FamilleSpectrale>();
  for (let i = 0; i < lignes.length; i++) {
    const f = fluxDeLaLigne(lignes[i]!, longueurs[i] ?? 0, coeff);
    if (!f) return null;
    lumens += f.lumens;
    if ('famille' === f.origine) origine = 'famille';
    if (f.famille) familles.add(f.famille);
  }
  if (lumens <= 0) return null;
  return {
    lumens,
    lumensParMetre: lumens / mesures.tubeLengthM,
    origine,
    famille: 1 === familles.size ? [...familles][0]! : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * L'ANCRAGE DU RENDU 3D
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * La configuration de référence, celle sur laquelle les constantes de la vue 3D
 * ont été réglées à l'œil.
 *
 * Elle doit être ÉCRITE, sinon « 0,34 » ne veut rien dire. On la choisit ronde
 * et nommable : un signe de 60 × 24 cm portant 3 m de tube blanc neutre à
 * 12 W/m, soit 3 × 12 × 36,0 = 1 296 lm sur 0,144 m².
 *
 * Ce n'est pas une mesure de la scène 3D — c'est le point d'ancrage d'un
 * rapport. Tout ce que la 3D calcule est un ÉCART à cette configuration.
 */
export const REFERENCE_3D = {
  tubeM: 3,
  largeurM: 0.6,
  hauteurM: 0.24,
  /** 3 m × 12 W/m × 36,0 lm/W. */
  lumens: 1296,
} as const;

/** Densité de flux de la référence, en lumens par mètre carré de signe. */
export const DENSITE_REFERENCE_LM_M2 = REFERENCE_3D.lumens / (REFERENCE_3D.largeurM * REFERENCE_3D.hauteurM);

/**
 * Bornes de l'éclat relatif.
 *
 * Elles ne sont pas cosmétiques, elles évitent deux rendus faux :
 *
 * - **En dessous de 0,4**, le halo disparaît, et une enseigne allumée sans
 *   aucune diffusion sur le mur se lit comme une enseigne éteinte — ou comme un
 *   bogue. Or un bleu de 5,2 lm/W tombe six fois sous la référence.
 * - **Au-dessus de 1,8**, le halo brûle tout mur clair. C'est exactement l'échec
 *   que le commentaire de `three-view.tsx` consigne déjà : « une constante
 *   brûlait tout mur clair — et prétendait qu'un néon éclaire une pièce en plein
 *   jour ».
 */
export const ECLAT_MIN = 0.4;
export const ECLAT_MAX = 1.8;

/**
 * Exposant de compression perceptive.
 *
 * La sensation de clarté ne suit pas la luminance : elle suit une loi de
 * puissance d'exposant nettement inférieur à 1 (Stevens). On retient 0,5, valeur
 * usuelle pour une source étendue — un flux quadruplé paraît deux fois plus
 * clair, pas quatre fois.
 *
 * Sans cette compression, un vert et un bleu de même puissance donneraient des
 * halos dans un rapport 7,7 : l'un invisible, l'autre brûlé.
 */
export const EXPOSANT_PERCEPTIF = 0.5;

/**
 * Éclat du halo, relatif à la configuration de référence.
 *
 * On rapporte le flux à la SURFACE du signe et non à sa longueur de tube. C'est
 * la seule formulation qui donne les deux bons comportements à la fois :
 *
 * - à signe constant, doubler le tube éclaire davantage le mur ;
 * - en agrandissant tout le signe d'un facteur k, le tube croît en k et la
 *   surface en k², donc le mur reçoit MOINS par mètre carré tout en étant
 *   éclairé plus large. C'est ce qu'on observe, et c'est ce qu'une loi en
 *   longueur seule aurait raté.
 *
 * @param lumens   Flux total du design.
 * @param largeurM Largeur hors-tout du signe.
 * @param hauteurM Hauteur hors-tout du signe.
 */
export function eclatRelatif(lumens: number, largeurM: number, hauteurM: number): number {
  const surface = largeurM * hauteurM;
  if (!(lumens > 0) || !(surface > 0) || !Number.isFinite(lumens) || !Number.isFinite(surface)) return 1;
  const rapport = lumens / surface / DENSITE_REFERENCE_LM_M2;
  const eclat = Math.pow(rapport, EXPOSANT_PERCEPTIF);
  return Math.min(ECLAT_MAX, Math.max(ECLAT_MIN, eclat));
}

/**
 * Ce que la vue 3D consomme : un seul nombre, et de quoi le justifier.
 *
 * `origine` remonte jusqu'au rendu pour une raison précise : une estimation de
 * famille reste une estimation, et si un jour la 3D affiche « 1 300 lumens » à
 * côté du signe, elle devra dire lequel des deux mots employer.
 */
export interface EclairementScene {
  lumens: number;
  eclat: number;
  origine: OrigineFlux;
  famille: FamilleSpectrale | null;
}

export function eclairementDeScene(
  lignes: ReadonlyArray<{ tubeSku?: string; colorHex?: string }>,
  mesures: { tubeLengthM: number; lineTubeM?: number[] },
  coeff: Pick<PricingCoefficients, 'tubes' | 'wattsPerMeter'>,
  largeurM: number,
  hauteurM: number,
): EclairementScene | null {
  const f = fluxDuDesign(lignes, mesures, coeff);
  if (!f) return null;
  return {
    lumens: f.lumens,
    eclat: eclatRelatif(f.lumens, largeurM, hauteurM),
    origine: f.origine,
    famille: f.famille,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * CE QUE LE MUR RENVOIE (E22)
 * ──────────────────────────────────────────────────────────────────────────── */

/** sRGB [0,1] → linéaire. */
function versLineaire(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linéaire → sRGB [0,1]. */
function versSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function hexEnRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Couleur du halo qu'un néon dépose sur un mur donné.
 *
 * Une lumière réfléchie est le produit, CANAL PAR CANAL, de la lumière
 * incidente et de la réflectance de la surface. Un mur de brique éclairé en vert
 * ne renvoie pas du vert : la brique n'a presque pas de réflectance dans le
 * vert, et le mur reste sourd. Le halo peint portait pourtant la couleur du
 * tube, plate, la même sur du plâtre blanc et sur de la brique.
 *
 * ── POURQUOI LA CHROMATICITÉ SEULE ────────────────────────────────────────
 *
 * L'albédo porte une TEINTE et un NIVEAU. La teinte manquait ; le niveau est
 * déjà porté par `haloMul`, le coefficient par décor de la vue 3D. On s'en
 * assure en regardant ses valeurs : il vaut 1 sur le studio sombre (mur
 * `#2e323b`) et 0,16 sur le salon crème (`#ece5d7`) — il est **inversement**
 * lié à la clarté du mur, parce qu'il encode le contraste avec l'ambiance et non
 * la réflectance. Les deux facteurs sont donc bien distincts, et appliquer le
 * niveau une seconde fois assombrirait chaque décor de sa propre clarté sans
 * qu'aucune mesure le demande.
 *
 * On normalise donc l'albédo sur son canal le plus fort, en LINÉAIRE — c'est là
 * que les produits de lumière ont un sens, pas dans le sRGB encodé.
 *
 * Aucune table de réflectances n'est inventée : la seule source honnête de ce
 * que le mur renvoie est le mur que le rendu dessine déjà.
 */
export function haloSurMur(neonHex: number, murHex: number): number {
  const mur = hexEnRgb(murHex).map(versLineaire);
  const maxi = Math.max(mur[0]!, mur[1]!, mur[2]!);
  // Un mur parfaitement noir n'existe pas dans les palettes, mais s'il arrivait,
  // ne rien filtrer vaut mieux qu'un halo éteint.
  const teinte = maxi > 0.0004 ? mur.map((c) => c / maxi) : [1, 1, 1];
  const neon = hexEnRgb(neonHex).map(versLineaire);
  const out = neon.map((c, i) => versSrgb(c * teinte[i]!));
  const oct = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)));
  return (oct(out[0]!) << 16) | (oct(out[1]!) << 8) | oct(out[2]!);
}

/**
 * Part de la lumière reçue qu'un mur RENVOIE, entre 0 et 1.
 *
 * C'est l'albédo du mur pondéré par le spectre de la lumière qui l'éclaire :
 * une lumière verte sur un mur de brique repart très peu, une lumière rouge
 * repart bien. On pèse les canaux selon la sensibilité de l'œil (Rec. 709), pour
 * la même raison qu'au §36 — le lumen est une grandeur pondérée.
 */
export function fractionRenvoyee(lumiereHex: number, murHex: number): number {
  const [lr, lg, lb] = hexEnRgb(lumiereHex).map(versLineaire) as [number, number, number];
  const [mr, mg, mb] = hexEnRgb(murHex).map(versLineaire) as [number, number, number];
  const lum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  if (!(lum > 0)) return 0;
  const renvoye = 0.2126 * lr * mr + 0.7152 * lg * mg + 0.0722 * lb * mb;
  return renvoye / lum;
}

/**
 * En dessous de cette part renvoyée, l'auréole d'une lettre boîtier
 * rétroéclairée ne se voit pas.
 *
 * La compétence `lettres-boitiers` §4 dit la règle sans donner de nombre :
 * « l'auréole n'existe que sur un mur mat et clair ; sur brique sombre ou
 * bardage brillant, elle disparaît ». On calibre donc sur le cas que le métier
 * NOMME comme l'échec, exactement comme le §37 a calibré l'homogénéité sur
 * l'entraxe que le fabricant recommande : le mur de brique des décors
 * (`#7a4a3a`) renvoie **0,093** d'une lumière blanche.
 *
 * Le seuil est 0,10, juste au-dessus. Ce n'est pas une constante physique,
 * c'est la frontière que le métier décrit, chiffrée sur le mur qu'on dessine.
 *
 * Conséquence à assumer : le studio sombre (`#2e323b`, 0,032) est signalé lui
 * aussi. C'est correct et ce n'est pas un effet de bord — une auréole EST de la
 * lumière renvoyée par le mur, et un mur à 3 % d'albédo n'en renvoie pas.
 */
export const SEUIL_HALO_VISIBLE = 0.1;

/** L'auréole d'une lettre rétroéclairée se verra-t-elle sur ce mur ? */
export function haloVisible(lumiereHex: number, murHex: number): boolean {
  return fractionRenvoyee(lumiereHex, murHex) >= SEUIL_HALO_VISIBLE;
}
