/**
 * Coefficients de prix — valeurs par défaut CALIBRÉES SUR LE MARCHÉ
 * (docs/04-formules-prix.md). Tous éditables par le marchand ; les tests de
 * non-régression (test/pricing.test.ts) vérifient que les défauts restent dans
 * les fourchettes constatées sur le marché.
 *
 * Montants en CENTIMES d'euro pour éviter tout flottant en sortie.
 */

import type { PsuCatalogEntry } from './alimentations.js';
import type { TimerCatalogEntry, TransporteurSpec } from './parc-composants.js';
import type { PalierLettre } from './grille-lettres.js';

/**
 * Palier de prix par taille (réglage marchand).
 * `maxWidthCm` : borne haute de la tranche (incluse).
 */
import { DEFAULT_PANEL_COEFFICIENTS, type PanelCoefficients } from './panels.js';
import { DEFAULT_TUBE, type TubeSpec } from './electrical.js';

export interface SizeTier {
  maxWidthCm: number;
  mode: 'surcharge' | 'floor';
  cents: number;
}

export interface PricingCoefficients {
  /** Mise en route : découpe, câblage, contrôle qualité. */
  baseCents: number;
  /** €/m de tube LED posé (centimes/m). */
  tubePerMeterCents: number;
  /** Multiplicateurs de complexité. */
  complexity: { singleLine: number; multiLine: number; logo: number };
  /** €/m² de support par finition (centimes/m²). */
  supportPerM2Cents: Record<'clear' | 'black' | 'white' | 'colored' | 'mirror' | 'printed-uv', number>;
  /** Marge du support autour du design (cm, par côté). */
  supportMarginCm: number;
  /** Alimentation : paliers par puissance (W = tube × wattsPerMeter). */
  wattsPerMeter: number;
  powerTiersCents: Array<{ maxWatts: number; cents: number }>;
  /** Fallback au-delà du dernier palier. */
  powerMaxCents: number;
  /** Options. */
  dimmerRemoteCents: number;
  /**
   * PROGRAMMATEUR D'EXTINCTION — prix d'une piece ACHETEE.
   *
   * CLAUDE.md, regle 2 : « Un chiffre qui depend d'un composant achete n'est
   * pas une constante du code. » Aucune fiche de programmateur n'est au fonds
   * `ressources/` : ce defaut n'est donc PAS source, c'est un point de depart
   * que le marchand remplace par le prix de son fournisseur (docs/04 s5.9).
   * Il est aligne sur `dimmerRemoteCents`, seule autre option a piece du
   * bareme, faute de mieux — et parce qu'un defaut trop bas se remarque moins
   * qu'un defaut trop haut, alors qu'il coute autant.
   */
  nightTimerCents: number;
  rgbFlatCents: number;
  /** Le tube RGB coûte plus cher au mètre (multiplicateur sur T_tube). */
  rgbTubeMultiplier: number;
  mountingCents: Record<'screws' | 'chains' | 'ceiling' | 'stand', number>;
  /** Caisson (box). */
  boxPerM2Cents: number;
  boxAssemblyCents: number;
  boxDepthCm: number;
  /** Panneaux. */
  panelPerM2Cents: Record<'dibond' | 'alu', number>;
  /** Multiplicateurs finaux. */
  outdoorMultiplier: number;
  expressMultiplier: number;
  /**
   * DÉLAI DE FABRICATION ANNONCÉ, en jours ouvrés.
   *
   * `parcours-configurateur-ux` §5 demande que le délai soit « affiché dans le
   * configurateur, pas en CGV ». Un client qui commande pour une date doit le
   * lire avant de payer, et non le découvrir dans un article de conditions
   * générales qu'il n'ouvrira pas.
   *
   * Les valeurs viennent de `docs/02` §Production — « Standard (10-15 j ouvrés)
   * / Express (+25 %, 5-7 j) » — et NON des concurrents que cite la compétence
   * (8 jours à 5 semaines) : ce sont les délais de cet atelier-ci.
   *
   * Quatre entiers plutôt que deux couples, parce que `OVERRIDABLE` du miroir
   * PHP n'accepte que des scalaires : ajouter un type tableau pour deux
   * réglages aurait coûté plus de machinerie que de valeur.
   */
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
  leadTimeExpressMinDays: number;
  leadTimeExpressMaxDays: number;
  /**
   * GARANTIE COMMERCIALE, en mois, par environnement.
   *
   * Elle s'AJOUTE a la garantie legale de deux ans, elle ne la remplace jamais
   * (`livraison.ts`, `garantieAnnoncee`). Les defauts reprennent ce
   * qu'annoncait docs/02 — 24 mois dedans, 12 dehors — et ni l'un ni l'autre ne
   * s'affichera a un particulier, puisqu'aucun ne depasse le plancher legal.
   *
   * Le reglage sert donc surtout entre PROFESSIONNELS, ou la garantie legale
   * des consommateurs ne s'applique pas. On le garde pour cette raison, et non
   * parce qu'il change quelque chose a la vitrine.
   */
  warrantyIndoorMonths: number;
  warrantyOutdoorMonths: number;
  /**
   * LIMITES DU COLIS, en centimetres — au-dela, la piece part en panneaux (E19).
   *
   * `materiaux-enseigne` §2 : « ce qui borne une piece d'un seul tenant n'est
   * pas la matiere mais LE TRANSPORT », et « la scission est une regle
   * MARCHANDE liee a son transporteur ». Les defauts sont ceux releves chez un
   * concurrent, et la competence precise qu'ils ne sont PAS sources dans le
   * depot : ce sont des points de depart.
   *
   * Ils ne changent aucun prix : la scission avertit, elle ne facture pas.
   */
  parcelMaxLengthCm: number;
  parcelMaxWidthCm: number;
  /** Arrondi marketing : total au € supérieur se terminant par 9. */
  marketingRounding: boolean;
  /**
   * PALIERS DE PRIX PAR TAILLE — réglés par le marchand, EN COMPLÉMENT de la
   * tarification au mètre de tube (jamais en remplacement) :
   *   - `surcharge` : ajoute un montant fixe pour cette tranche de largeur ;
   *   - `floor`     : garantit un prix minimum pour cette tranche.
   * Le premier palier dont `maxWidthCm` couvre la largeur s'applique (liste
   * triée par largeur croissante). Vide = aucun palier (comportement d'origine).
   */
  sizeTiers: SizeTier[];
  /** Panneaux et caissons : matières, découpes, finitions, éclairage. */
  panels: PanelCoefficients;
  /**
   * LE TUBE DU CATALOGUE — diamètre, rayon de courbure minimal, tension.
   * Source unique : la cote de l'aperçu, la contrainte de fabricabilité et le
   * plan de câblage en descendent tous les trois. N'entre dans AUCUN calcul de
   * prix : changer ces valeurs ne déplace pas un centime.
   */
  tube: TubeSpec;
  /**
   * Flux linéique à partir duquel une bobine est dite « vitrine » (lm/m).
   *
   * Une enseigne derrière une vitrine ensoleillée lutte contre le jour : il lui
   * faut la bande haute du néon flex. Ce seuil dit laquelle.
   *
   * CE N'EST PAS UNE CONSTANTE PHYSIQUE, c'est une frontière commerciale, et
   * elle se règle. Le défaut de 800 lm/m vient du relevé des fiches du fonds
   * (docs/43 §18) : le néon flex documenté va de 110 à 1 476 lm/m, un 6 × 12
   * courant sort entre 145 et 360, et 800 place la bobine au-dessus des trois
   * quarts de ce qui existe. Le besoin B18 annonçait « ≥ 5 000 lm/m » — aucun
   * produit du fonds n'en approche, et le maximum toutes familles confondues
   * est 3 344 lm/m sur un ruban nu.
   */
  vitrineLumensPerMeter: number;

  /**
   * Catalogue de tubes du marchand, par référence (écart E02).
   *
   * Absent, rien ne change : le prix au mètre reste `tubePerMeterCents` pour
   * toutes les couleurs, et l'aspect éteint est calculé à partir du hex allumé.
   * Renseigné, chaque référence peut porter son propre TARIF DE VENTE au mètre,
   * son aspect éteint mesuré sur photo, et les caractéristiques que l'atelier
   * réclame. Son prix d'ACHAT est un autre champ — voir `coutParMetreCents`.
   *
   * **Le prix ne bouge que si une référence porte `tubePerMeterCents`.** Tant
   * qu'aucune ne le fait, le calcul emprunte exactement le même chemin qu'avant
   * — c'est vérifié par un témoin.
   */
  tubes?: TubeCatalogEntry[];

  /**
   * Calibres d'alimentation du marchand (W).
   *
   * Absent, l'échelle générique `PSU_RATINGS_W` s'applique. Renseigné, la fiche
   * d'atelier annonce des références qui existent vraiment chez le fournisseur
   * — les blocs documentés dans `ressources/alimentations/` sortent notamment à
   * 75,6, 81,6, 100,8, 102 et 151,2 W, cinq valeurs absentes de l'échelle
   * générique.
   */
  psuRatingsW?: number[];
  /**
   * LES ALIMENTATIONS RÉELLEMENT ACHETÉES (chantier A1).
   *
   * `psuRatingsW` déclare des CALIBRES : on sait qu'un 100 W existe, pas ce
   * qu'il coûte ni sous quelle tension il sort. Ce catalogue-ci porte des
   * RÉFÉRENCES — `sku`, watts, tension, IP, prix — et c'est ce qui permet de
   * vérifier en machine qu'un bloc 24 V ne parte pas sur un design 12 V.
   *
   * Absent : `powerTiersCents` décide, exactement comme aujourd'hui. Une
   * référence déclarée sans prix ne change rien non plus. **Rien ne bouge tant
   * que le marchand n'a rien dit.**
   */
  psus?: PsuCatalogEntry[];
  /**
   * LES PROGRAMMATEURS D'EXTINCTION RÉELLEMENT ACHETÉS (chantier A2).
   *
   * `nightTimerCents` vaut 19 €, et docs/04 §5.9 le dit sans détour : ce
   * chiffre **n'est pas sourcé**. Aucune fiche de programmateur n'existe au
   * fonds ; il a été aligné sur le prix du variateur faute de mieux.
   *
   * Or l'extinction nocturne peut être une obligation légale (R581-59) : c'est
   * le pire endroit du barème pour un chiffre inventé. Une référence déclarée
   * avec son prix le remplace ; sans catalogue, rien ne bouge.
   */
  timers?: TimerCatalogEntry[];
  /**
   * LE TRANSPORTEUR DU MARCHAND (chantier A4).
   *
   * `parcelMaxLengthCm` et `parcelMaxWidthCm` viennent d'un CONCURRENT, relevés
   * sur son site. Un marchand qui livre en palette n'a pas les mêmes limites
   * qu'un autre qui expédie en Colissimo : aucun chiffre ne peut être juste
   * pour les deux.
   *
   * Absent, les deux coefficients s'appliquent comme aujourd'hui. Ce réglage ne
   * touche AUCUN prix — la scission avertit, elle ne facture pas.
   */
  transporteur?: TransporteurSpec;
  /**
   * LA GRILLE DE PRIX PAR LETTRE ET PAR HAUTEUR (chantier A5).
   *
   * `lettres-boitiers` §5 : « Ne jamais tarifer une lettre lumineuse au m² : le
   * marché, l'atelier et le client comptent en lettres et en centimètres de
   * haut. »
   *
   * Aucune fiche fournisseur ne donne un prix de VENTE, et les repères du
   * marché relevés dans la compétence sont ceux de concurrents. C'est donc une
   * grille que l'intégrateur déclare. Absente, le calcul à la surface
   * s'applique — rien ne bouge tant que le marchand n'a rien dit.
   */
  grilleLettres?: PalierLettre[];

  /** Bornes de validation. */
  limits: {
    minLetterHeightBlockCm: number;
    minLetterHeightScriptCm: number;
    maxWidthCm: number;
    maxTubeM: number;
    maxLines: number;
    maxCharsPerLine: number;
    /**
     * Largeur au-delà de laquelle la pièce part en PLUSIEURS panneaux.
     *
     * Ce n'est pas une constante physique : c'est la limite du transporteur du
     * marchand, et elle se règle. Le défaut de 234 cm est celui qu'annonce
     * Custom Neon (relevé dans docs/38 §4), pris comme ordre de grandeur du
     * métier et non comme vérité. Un marchand qui expédie en messagerie
     * palettisée le montera ; un autre qui expédie en colis le descendra.
     */
    /**
     * Profondeur minimale d'un caisson lumineux (cm).
     *
     * Valait **6 cm**, avec pour motif que « sous 6 cm les modules se devinent
     * sur la face ». La fiche
     * `sloanled-brightline-2-modules-caisson-faible-profondeur.pdf` dit le
     * contraire : cette gamme existe précisément pour les caissons peu
     * profonds, et couvre **30 mm** avec un entraxe resserré à 75 mm. Le motif
     * était juste pour des modules à entraxe large, faux pour ceux-là.
     *
     * Le défaut passe donc à **3 cm** — la plus faible profondeur documentée
     * dans le fonds. En dessous, aucune famille de modules relevée ne couvre le
     * cas, et le refus redevient légitime. Un marchand qui ne stocke que des
     * modules à entraxe large le remonte.
     */
    boxMinDepthCm: number;

    maxPanelWidthCm: number;
    /**
     * Longueur au-delà de laquelle le fil qui saute d'un mot au suivant devient
     * un problème d'atelier : il faut le gainer, le fixer et le cacher, sans
     * quoi il pend derrière la plaque.
     *
     * Convention d'atelier reprise de docs/39 §2.2, pas une valeur mesurée.
     * Elle se règle comme le reste.
     */
    maxJumperCm: number;
  };
}

/**
 * Une référence de tube au catalogue du marchand.
 *
 * Tout est optionnel sauf la référence et le hex allumé : un marchand qui veut
 * seulement nommer ses bobines n'a pas à remplir une fiche technique, et un
 * champ vide vaut « comme le réglage général », jamais zéro.
 */
export interface TubeCatalogEntry {
  /** Référence chez le fournisseur — ce qu'on tape sur un bon de commande. */
  sku: string;
  /** Nom montré au client. */
  label?: string;
  /** Couleur du tube ALLUMÉ. */
  litHex: string;
  /**
   * Couleur du tube ÉTEINT, **mesurée sur photo** et non déduite.
   *
   * Absente, l'aperçu et la capture la calculent en délavant le hex allumé
   * (docs/43 §14). C'est une approximation honnête, mais le silicone d'un
   * fournisseur donné a sa teinte propre, et un marchand qui photographie ses
   * bobines fait mieux que n'importe quelle formule.
   */
  offHex?: string;
  /**
   * TARIF DE VENTE au mètre, en centimes. Absent : `tubePerMeterCents` de la
   * boutique.
   *
   * ── CE CHAMP ÉTAIT DOCUMENTÉ « PRIX D'ACHAT », ET IL NE L'EST PAS ────────
   *
   * `pricing.ts` s'en sert comme tarif facturé : `tarifDeLaLigne(line) ??
   * coeff.tubePerMeterCents`, où le second est le 95 €/m de VENTE de docs/04.
   * Le commentaire disait l'inverse.
   *
   * Personne ne s'en est aperçu tant que le coût de revient n'existait pas :
   * relevé en écrivant B36, où il aurait donné une marge de zéro sur chaque
   * ligne — un chiffre faux et parfaitement crédible.
   */
  tubePerMeterCents?: number;
  /**
   * PRIX D'ACHAT au mètre, en centimes — celui du fournisseur.
   *
   * N'entre dans AUCUN calcul de prix de vente : il ne sert qu'au coût de
   * revient (`marge.ts`, B36), qui est une information marchand. Absent, la
   * marge de cette ligne est déclarée inconnue plutôt qu'estimée.
   */
  coutParMetreCents?: number;
  /** Puissance linéique (W/m). Absente : `wattsPerMeter`. */
  wattsPerMeter?: number;
  /** Flux linéique (lm/m) — documentation d'atelier et argument de vente. */
  lumensPerMeter?: number;
  /** Température de couleur (K), pour les blancs. */
  cct?: number;
  /** Profil, en millimètres : « 6x12 », « 8x16 »… */
  profile?: string;
  /**
   * DIAMÈTRE DU TUBE, en millimètres — le champ qui manquait (écart E28).
   *
   * docs/02 §2 vend « tube LED 8 mm (fin), 10 mm (standard) — choix marchand
   * par catalogue ». Le catalogue n'avait aucun moyen de le dire : le diamètre
   * vivait dans le SEUL `tube.diameterMm` de la boutique, donc un marchand qui
   * stocke les deux ne pouvait pas les offrir. La promesse était plus large que
   * le produit.
   *
   * Ce n'est PAS un choix de prix mais d'ASPECT. `physique-neon-led` §2.2 : à
   * puissance égale, un Ø 8 paraît plus intense qu'un Ø 10 — même lumière,
   * surface plus petite. Le diamètre n'entre dans aucune ligne de facture ;
   * c'est `tubePerMeterCents`, déjà par référence, qui porte le prix.
   *
   * Absent : le diamètre de la boutique. Un catalogue existant ne bouge pas.
   */
  diameterMm?: number;
  /** Tension de la bobine. */
  voltage?: 12 | 24;
  /** Indice de protection tel qu'annoncé par la fiche : « IP65 », « IP67 ». */
  ip?: string;
  /** Résistant aux UV — décide de ce qui part dehors. */
  uvResistant?: boolean;
  /**
   * Ce que la bobine sait faire.
   *
   * - `solid` — une couleur, celle du silicone. C'est le défaut, et c'est
   *   l'immense majorité du catalogue.
   * - `rgb` — la bobine change de couleur d'un bout à l'autre, d'un seul bloc.
   * - `spi` — chaque pixel est adressable ; l'Enttec Neon Flex SPI du fonds en
   *   compte 20 par mètre pour 17 W/m. C'est une autre bobine, un autre
   *   contrôleur, et un autre métier au câblage.
   *
   * Une bobine `solid` ne fera jamais du RGB, quel que soit le contrôleur posé
   * devant : `validate.ts` refuse la combinaison plutôt que de la laisser partir
   * à l'atelier.
   */
  mode?: 'solid' | 'rgb' | 'spi';
  /**
   * Prix du contrôleur propre à cette bobine, en centimes.
   *
   * Un contrôleur RGB à trois canaux et un contrôleur SPI à pixels adressables
   * n'ont pas le même prix, et le forfait unique `rgbFlatCents` les confondait.
   * Absent, ce forfait s'applique — donc rien ne bouge tant que le marchand ne
   * distingue pas ses contrôleurs.
   */
  controllerCents?: number;
}

export const DEFAULT_COEFFICIENTS: PricingCoefficients = {
  baseCents: 39_00,
  tubePerMeterCents: 101_84,
  complexity: { singleLine: 1.0, multiLine: 1.15, logo: 1.3 },
  supportPerM2Cents: {
    clear: 90_00,
    black: 90_00,
    white: 90_00,
    colored: 110_00,
    mirror: 160_00,
    'printed-uv': 180_00,
  },
  supportMarginCm: 3,
  wattsPerMeter: 12,
  powerTiersCents: [
    { maxWatts: 60, cents: 25_00 },
    { maxWatts: 120, cents: 39_00 },
  ],
  powerMaxCents: 59_00,
  dimmerRemoteCents: 19_00,
  nightTimerCents: 19_00,
  rgbFlatCents: 49_00,
  rgbTubeMultiplier: 1.25,
  mountingCents: { screws: 0, chains: 15_00, ceiling: 15_00, stand: 29_00 },
  boxPerM2Cents: 120_00,
  boxAssemblyCents: 49_00,
  boxDepthCm: 8,
  panelPerM2Cents: { dibond: 140_00, alu: 190_00 },
  outdoorMultiplier: 1.7,
  expressMultiplier: 1.25,
  leadTimeMinDays: 10,
  leadTimeMaxDays: 15,
  leadTimeExpressMinDays: 5,
  leadTimeExpressMaxDays: 7,
  warrantyIndoorMonths: 24,
  warrantyOutdoorMonths: 12,
  parcelMaxLengthCm: 234,
  parcelMaxWidthCm: 119,
  marketingRounding: true,
  vitrineLumensPerMeter: 800,
  sizeTiers: [],
  panels: DEFAULT_PANEL_COEFFICIENTS,
  tube: DEFAULT_TUBE,
  limits: {
    minLetterHeightBlockCm: 8,
    minLetterHeightScriptCm: 10,
    maxWidthCm: 250,
    maxTubeM: 25,
    maxLines: 3,
    maxCharsPerLine: 40,
    boxMinDepthCm: 3,
    maxPanelWidthCm: 234,
    maxJumperCm: 15,
  },
};

/**
 * La référence de tube d'une ligne, ou null.
 *
 * Deux chemins, dans cet ordre : le `tubeSku` de la ligne s'il existe au
 * catalogue, sinon la référence dont le hex allumé correspond à `colorHex`.
 * Le second existe pour les configurations enregistrées avant l'arrivée du
 * catalogue : elles ne portent qu'une couleur, et doivent quand même profiter
 * de l'aspect éteint mesuré si le marchand l'a renseigné.
 *
 * La comparaison de hex est insensible à la casse et tolère l'absence de « # »,
 * parce que ces valeurs viennent tantôt d'un champ de couleur de navigateur,
 * tantôt d'un back-office saisi à la main.
 */
export function ligneVersTube(
  line: { tubeSku?: string; colorHex?: string },
  coeff: Pick<PricingCoefficients, 'tubes'>,
): TubeCatalogEntry | null {
  const catalogue = coeff.tubes;
  if (!catalogue || catalogue.length === 0) return null;
  if (line.tubeSku) {
    const exact = catalogue.find((t) => t.sku === line.tubeSku);
    if (exact) return exact;
  }
  if (!line.colorHex) return null;
  const norme = (h: string) => h.trim().replace(/^#/, '').toLowerCase();
  const cible = norme(line.colorHex);
  return catalogue.find((t) => norme(t.litHex) === cible) ?? null;
}

/**
 * LE DIAMÈTRE DU TUBE D'UNE LIGNE, en millimètres.
 *
 * La bobine choisie d'abord, la valeur de boutique ensuite. C'est le sens qui
 * compte : une référence déclare ce qu'elle est, le réglage de boutique dit ce
 * qu'on emploie à défaut.
 */
export function diametreTubeMm(
  line: { tubeSku?: string; colorHex?: string },
  coeff: Pick<PricingCoefficients, 'tubes' | 'tube'>,
): number {
  const d = ligneVersTube(line, coeff)?.diameterMm;
  const boutique = coeff.tube?.diameterMm ?? DEFAULT_TUBE.diameterMm;
  return 'number' === typeof d && d > 0 ? d : boutique;
}

/**
 * TOUTES LES BOBINES D'UN DESSIN — les lignes, et les mots qui s'en écartent.
 *
 * Un mot d'une autre couleur est une autre bobine (`NeonLine.wordColors`), avec
 * son diamètre, sa puissance et son mode. Tout ce qui raisonne « sur les tubes
 * du design » — le diamètre retenu pour la rastérisation, le refus d'un RGB sur
 * du silicone unicolore — doit donc les voir, sans quoi la règle ne s'applique
 * qu'à la moitié de la pièce.
 *
 * Les entrées vides sont écartées : un mot sans couleur propre suit sa ligne,
 * qui est déjà dans la liste.
 */
export function bobinesDuDesign(
  lines: ReadonlyArray<{ tubeSku?: string; colorHex?: string; wordColors?: Array<{ colorHex?: string; tubeSku?: string }> }>,
): Array<{ tubeSku?: string; colorHex?: string }> {
  const out: Array<{ tubeSku?: string; colorHex?: string }> = [];
  for (const l of lines ?? []) {
    out.push({ tubeSku: l.tubeSku, colorHex: l.colorHex });
    for (const mot of l.wordColors ?? []) {
      if (mot && (mot.colorHex || mot.tubeSku)) out.push({ tubeSku: mot.tubeSku, colorHex: mot.colorHex });
    }
  }
  return out;
}

/**
 * LE DIAMÈTRE QUI GOUVERNE LE DESSIN ET LA FABRICATION : le PLUS GROS.
 *
 * Un design peut mêler trois lignes de trois bobines différentes. L'aperçu, le
 * solide 3D et le DXF n'ont, eux, qu'un seul diamètre — le masque est
 * rastérisé pour l'ensemble du dessin, pas ligne par ligne.
 *
 * On retient donc le plus gros, et le choix n'est pas indifférent : c'est le
 * sens SÛR. Un canal fraisé au Ø 8 ne reçoit pas un tube de 10 ; un aperçu
 * dessiné au Ø 8 promet un trait plus fin que celui qui arrive. Dans les deux
 * cas, retenir le plus petit fabriquerait une pièce inutilisable ou mentirait
 * au client.
 *
 * La VALIDATION, elle, ne s'en sert pas : elle regarde chaque ligne avec son
 * propre tube, parce que refuser une ligne fine à cause du gros tube de la
 * ligne voisine serait un refus injustifié.
 */
export function diametreTubeDuDesign(
  lines: ReadonlyArray<{ tubeSku?: string; colorHex?: string }>,
  coeff: Pick<PricingCoefficients, 'tubes' | 'tube'>,
): number {
  let max = 0;
  for (const l of lines ?? []) {
    const d = diametreTubeMm(l, coeff);
    if (d > max) max = d;
  }
  return max > 0 ? max : (coeff.tube?.diameterMm ?? DEFAULT_TUBE.diameterMm);
}

/**
 * La couleur du tube ÉTEINT pour une ligne : celle du catalogue si le marchand
 * l'a mesurée, sinon `null` — à l'appelant de la calculer en délavant le hex
 * allumé, comme le font l'aperçu et la capture (docs/43 §14).
 */
export function couleurEteinte(
  line: { tubeSku?: string; colorHex?: string },
  coeff: Pick<PricingCoefficients, 'tubes'>,
): string | null {
  return ligneVersTube(line, coeff)?.offHex ?? null;
}

/**
 * La puissance appelée par un design (W), bobine par bobine.
 *
 * Un tube de 8 W/m et un de 14 W/m ne demandent pas la même alimentation, et le
 * calibre décide du prix de l'alimentation. Le catalogue permet donc de le dire.
 *
 * MÊME BASCULE FRANCHE QUE POUR LE PRIX DU TUBE (docs/43 §15) : tant qu'aucune
 * référence ne déclare sa puissance linéique, on rend exactement
 * `tubeLengthM × wattsPerMeter` — la longueur TOTALE, arrondie, comme avant.
 * Dès qu'une seule la déclare, on somme ligne par ligne. Les deux ne donnent pas
 * rigoureusement le même résultat, parce que le total est arrondi une fois et
 * les lignes non ; c'est la raison de la bascule plutôt que d'un calcul unifié.
 *
 * @param lignes  Lignes du design (`config.lines`).
 * @param mesures Mesures, dont `lineTubeM` quand il existe.
 */
export function wattsDemandes(
  lignes: ReadonlyArray<{
    tubeSku?: string;
    colorHex?: string;
    wordColors?: Array<{ colorHex?: string; tubeSku?: string }>;
  }>,
  mesures: { tubeLengthM: number; lineTubeM?: number[]; wordTubeM?: number[][] },
  coeff: Pick<PricingCoefficients, 'tubes' | 'wattsPerMeter'>,
): number {
  /*
   * LA PUISSANCE SUIT LE MOT, quand un mot a sa propre bobine.
   *
   * Deux bobines n'appellent pas les mêmes watts au mètre. Depuis qu'un mot
   * peut porter la sienne, compter toute la ligne au tarif de la première
   * sous-dimensionnerait l'alimentation — ou la surdimensionnerait, ce qui se
   * paie aussi.
   */
  const parMot = mesures.wordTubeM;
  if (Array.isArray(parMot) && parMot.length === lignes.length
      && lignes.some((l, i) => (l.wordColors ?? []).some((mot, j) => (
        mot && (mot.colorHex || mot.tubeSku)
        && 'number' === typeof ligneVersTube(mot, coeff)?.wattsPerMeter
        && 'number' === typeof parMot[i]?.[j]
      )))) {
    let w = 0;
    lignes.forEach((l, i) => {
      const parDefaut = ligneVersTube(l, coeff)?.wattsPerMeter;
      (parMot[i] ?? []).forEach((longueur, j) => {
        const mot = l.wordColors?.[j];
        const sku = mot && (mot.colorHex || mot.tubeSku) ? ligneVersTube(mot, coeff) : null;
        const wpm = 'number' === typeof sku?.wattsPerMeter ? sku.wattsPerMeter
          : ('number' === typeof parDefaut ? parDefaut : coeff.wattsPerMeter);
        w += longueur * wpm;
      });
    });
    return w;
  }
  const detail = mesures.lineTubeM;
  const parLigne = Array.isArray(detail)
    && detail.length === lignes.length
    && lignes.length > 0
    && lignes.some((l) => typeof ligneVersTube(l, coeff)?.wattsPerMeter === 'number');
  if (!parLigne) return mesures.tubeLengthM * coeff.wattsPerMeter;
  let w = 0;
  lignes.forEach((l, i) => {
    const sku = ligneVersTube(l, coeff);
    const parMetre = typeof sku?.wattsPerMeter === 'number' ? sku.wattsPerMeter : coeff.wattsPerMeter;
    w += (detail![i] ?? 0) * parMetre;
  });
  return w;
}

/**
 * Cette bobine tient-elle derrière une vitrine ensoleillée (besoin B18) ?
 *
 * Une bobine qui ne déclare pas son flux rend `false` : on ne promet pas une
 * luminosité qu'on ne connaît pas. C'est la règle 3 de `CLAUDE.md` appliquée à
 * un argument de vente — « vitrine » écrit à côté d'un tube dont personne n'a
 * relevé les lumens, c'est une promesse sans mesure derrière.
 */
export function estTubeVitrine(
  tube: TubeCatalogEntry | null | undefined,
  coeff: Pick<PricingCoefficients, 'vitrineLumensPerMeter'>,
): boolean {
  const seuil = coeff.vitrineLumensPerMeter > 0
    ? coeff.vitrineLumensPerMeter
    : DEFAULT_COEFFICIENTS.vitrineLumensPerMeter;
  return typeof tube?.lumensPerMeter === 'number' && tube.lumensPerMeter >= seuil;
}

/** Les références du catalogue qui tiennent en vitrine, dans l'ordre du catalogue. */
export function tubesVitrine(
  coeff: Pick<PricingCoefficients, 'tubes' | 'vitrineLumensPerMeter'>,
): TubeCatalogEntry[] {
  return (coeff.tubes ?? []).filter((t) => estTubeVitrine(t, coeff));
}
