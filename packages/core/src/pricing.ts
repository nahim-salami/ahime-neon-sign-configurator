/**
 * Formules de prix — implémentation EXACTE de docs/04-formules-prix.md.
 *
 * PRIX = [ base + tube×T×k_complexité + surface×T_matière + alim + options ]
 *        × k_extérieur × k_express
 *
 * Tout en centimes. Le widget affiche ce calcul en temps réel ; le backend et
 * le plugin le ré-exécutent — LE SERVEUR FAIT FOI.
 */

import type { NeonConfiguration, NeonMeasurements, PriceLine, PriceResult, SupportFinish, SupportType } from './types.js';
import { DEFAULT_COEFFICIENTS, ligneVersTube, wattsDemandes, type PricingCoefficients } from './coefficients.js';
import {
  boxBodyM2,
  boxLitM2,
  materialM2Cents,
  panelAreaM2,
  panelCutLengthM,
  wattsPerM2Effectif,
} from './panels.js';
import { DEFAULT_TUBE } from './electrical.js';
import { choisirAlimentation } from './alimentations.js';
import { prixProgrammateur } from './parc-composants.js';
import { chiffrerLettres } from './grille-lettres.js';

/** Surface du support (m²) selon le type — voir docs/04 §1. */
export function supportAreaM2(
  type: SupportType,
  widthCm: number,
  heightCm: number,
  coeff: PricingCoefficients,
): number {
  const m = coeff.supportMarginCm;
  const rectM2 = ((widthCm + 2 * m) * (heightCm + 2 * m)) / 10_000;
  switch (type) {
    case 'rectangle':
    case 'stand':
      return rectM2;
    case 'contour':
      // Silhouette ≈ 75 % du rectangle, découpe +15 %.
      return rectM2 * 0.75 * 1.15;
    case 'cut-to-letter':
      // Aire des lettres ≈ 45 % du rectangle, découpe fine +25 %.
      return rectM2 * 0.45 * 1.25;
    case 'box':
    case 'none':
      return 0; // le caisson a sa propre formule ; « none » = pose directe.
  }
}

/** Faces d'un caisson (m²) : 2 faces + chant périmétrique. */
export function boxFacesM2(widthCm: number, heightCm: number, depthCm: number): number {
  const w = widthCm / 100;
  const h = heightCm / 100;
  const d = depthCm / 100;
  return 2 * (w * h) + 2 * (w + h) * d;
}

/** Palier d'alimentation pour une puissance donnée. */
function wattsCents(watts: number, coeff: PricingCoefficients): number {
  for (const tier of coeff.powerTiersCents) {
    if (watts <= tier.maxWatts) return tier.cents;
  }
  return coeff.powerMaxCents;
}

/**
 * Le prix de l'alimentation — celui du bloc DÉCLARÉ quand il y en a un.
 *
 * ── L'ORDRE DES REPLIS, ET POURQUOI AUCUN NE BLOQUE ─────────────────────────
 *
 * 1. un catalogue existe, une référence convient ET porte un prix → ce prix ;
 * 2. sinon → `powerTiersCents`, c'est-à-dire le calcul d'aujourd'hui.
 *
 * Le second cas couvre trois situations volontairement confondues ici : aucun
 * catalogue, un catalogue dont aucune référence ne convient, et une référence
 * qui convient sans prix. Aucune ne doit **empêcher** de chiffrer : refuser un
 * prix parce qu'un marchand n'a pas fini de remplir son catalogue casserait sa
 * boutique au lieu de l'aider.
 *
 * C'est le chantier A6 — « pas de composant, pas de vente » — qui décidera de
 * masquer l'option, et il le fera dans la validation, pas dans le calcul.
 */
function powerCents(
  watts: number,
  coeff: PricingCoefficients,
  besoin: { voltage: number; exterieur?: boolean; variateur?: boolean },
): number {
  const catalogue = coeff.psus ?? [];
  if (catalogue.length > 0) {
    /*
     * LE DÉRATAGE EST APPLIQUÉ ICI, ET UNE SEULE FOIS.
     *
     * `choisirAlimentation` attend la puissance NOMINALE nécessaire, pas la
     * puissance appelée : une enseigne allumée toute la journée est une charge
     * continue, et un bloc chargé à 100 % ne tient pas. `electricalPlan` fait
     * la même division ; la refaire après elle surdimensionnerait deux fois.
     */
    const tube = coeff.tube ?? DEFAULT_TUBE;
    const facteur = tube.psuLoadFactor > 0 && tube.psuLoadFactor <= 1 ? tube.psuLoadFactor : 0.8;
    const { choix } = choisirAlimentation(watts / facteur, catalogue, besoin);
    if (choix && 'number' === typeof choix.priceCents) return choix.priceCents;
  }
  return wattsCents(watts, coeff);
}

/** Arrondi marketing : plus petit entier ≥ total (en €) se terminant par 9. */
export function marketingRoundCents(totalCents: number): number {
  const euros = Math.ceil(totalCents / 100);
  const lastDigit = euros % 10;
  const rounded = lastDigit === 9 ? euros : euros + ((9 - lastDigit + 10) % 10);
  return rounded * 100;
}

export interface ComputePriceInput {
  config: NeonConfiguration;
  measurements: NeonMeasurements;
  coefficients?: Partial<PricingCoefficients>;
}

export function computePrice({ config, measurements, coefficients }: ComputePriceInput): PriceResult {
  const coeff: PricingCoefficients = { ...DEFAULT_COEFFICIENTS, ...(coefficients ?? {}) };
  const lines: PriceLine[] = [];
  const { tubeLengthM, widthCm, heightCm } = measurements;
  const isRgb = config.colorMode === 'rgb';
  const isOutdoor = config.environment === 'outdoor';
  // Extérieur ⇒ caisson obligatoire (imposé aussi par la validation).
  const supportType: SupportType = isOutdoor ? 'box' : config.support.type;

  lines.push({ key: 'base', label: 'Mise en route', amountCents: coeff.baseCents });

  // --- PANNEAU -------------------------------------------------------------
  // Une plaque se vend au m², pas au mètre de tube. La formule du néon ne s'y
  // applique pas : on ne la bricole pas, on en écrit une autre.
  if ('panel' === config.kind && config.panel) {
    const p = config.panel;
    const pc = coeff.panels;
    const aire = panelAreaM2(widthCm, heightCm);
    const faces = p.doubleSided ? 2 : 1;

    lines.push({
      key: 'material',
      label: `${pc.materials[p.material]?.label ?? p.material} ${p.thicknessMm} mm · ${aire.toFixed(2)} m²`,
      amountCents: Math.round(aire * materialM2Cents(p.material, p.thicknessMm, pc)),
    });

    const ml = panelCutLengthM(widthCm, heightCm, p.cut);
    lines.push({
      key: 'cut',
      label: `Découpe ${ml.toFixed(2)} ml`,
      amountCents: Math.round(ml * pc.cutPerMeterCents[p.cut]),
    });

    if ('raw' !== p.finish) {
      lines.push({
        key: 'finish',
        label: `Finition ${p.finish}${faces > 1 ? ' (recto verso)' : ''}`,
        amountCents: Math.round(aire * faces * pc.finishPerM2Cents[p.finish]),
      });
    }
    if ('letters' === p.finish && p.channelLetters) {
      const letters = p.channelLetters;
      /*
       * LA GRILLE DU MARCHAND D'ABORD, LA SURFACE ENSUITE (chantier A5).
       *
       * `lettres-boitiers` §5 : « Ne jamais tarifer une lettre lumineuse au
       * m². » Deux « I » de 50 cm et un « M » de 50 cm couvrent des surfaces
       * très différentes ; l'atelier, lui, plie trois retours, découpe trois
       * faces et pose trois trims.
       *
       * `chiffrerLettres` rend `palierCents: null` — et non zéro — quand aucune
       * grille ne couvre le cas. La distinction est tout l'intérêt : zéro
       * factureait des lettres gratuites, `null` dit de retomber sur la
       * surface, c'est-à-dire sur le calcul d'aujourd'hui.
       */
      const parLettre = chiffrerLettres(
        (config.lines ?? []).map((l) => l.text ?? ''),
        config.letterHeightCm ?? 0,
        coeff.grilleLettres,
        'none' === letters.lighting ? 'solid' : 'channel',
      );
      if (null !== parLettre.palierCents) {
        lines.push({
          key: 'letters',
          label: `Lettres 3D ${letters.material} · ${parLettre.lettres} lettre(s) de ${config.letterHeightCm} cm`,
          amountCents: parLettre.cents,
        });
      } else {
        const materialRate = 'metal' === letters.material ? 24_000 : 'wood' === letters.material ? 13_000 : 18_000;
        lines.push({
          key: 'letters',
          label: `Lettres 3D ${letters.material} · profondeur ${letters.depthMm} mm`,
          amountCents: Math.round(aire * materialRate + letters.depthMm * 85),
        });
      }
      if ('none' !== letters.lighting) {
        lines.push({
          key: 'led',
          label: `Éclairage ${letters.lighting}`,
          amountCents: Math.round(aire * ('front-back' === letters.lighting ? 14_000 : 9_000)),
        });
      }
      letters.backboardLayers.forEach((layer, index) => {
        const layerArea = aire * (1 + layer.extensionCm / 10);
        const layerRate = 'metal' === layer.material ? 15_000 : 'wood' === layer.material ? 8_000 : 11_000;
        lines.push({
          key: 'material',
          label: `Support couche ${index + 1} · ${layer.material} ${layer.thicknessMm} mm`,
          amountCents: Math.round(layerArea * layerRate),
        });
      });
    }
    lines.push({ key: 'fixing', label: 'Perçage et fixations', amountCents: pc.fixingCents });
    return finaliser(lines, config, coeff, measurements);
  }

  // --- CAISSON LUMINEUX ----------------------------------------------------
  // Sa puissance ne se déduit pas d'une longueur de tube mais d'une SURFACE à
  // éclairer uniformément. Autre physique, autre formule.
  if ('box-sign' === config.kind && config.boxSign) {
    const b = config.boxSign;
    const pc = coeff.panels;
    const corps = boxBodyM2(widthCm, heightCm, b.depthCm, b.faces);
    const lumineuse = boxLitM2(widthCm, heightCm, b.faces);

    lines.push({
      key: 'body',
      label: `Corps ${pc.materials[b.material]?.label ?? b.material} · ${corps.toFixed(2)} m²`,
      amountCents: Math.round(corps * materialM2Cents(b.material, 3, pc)),
    });
    lines.push({
      key: 'diffuser',
      label: `Face${b.faces > 1 ? 's' : ''} diffusante${b.faces > 1 ? 's' : ''} · ${lumineuse.toFixed(2)} m²`,
      amountCents: Math.round(lumineuse * pc.diffuserPerM2Cents),
    });
    if (b.printedFace) {
      lines.push({
        key: 'finish',
        label: 'Impression de la face',
        amountCents: Math.round(lumineuse * pc.finishPerM2Cents['printed-lam']),
      });
    }
    lines.push({
      key: 'led',
      label: 'Éclairage interne',
      amountCents: Math.round(lumineuse * pc.ledPerM2Cents),
    });
    // L'alimentation suit les MÊMES paliers que le néon : c'est le même
    // matériel, il n'y a aucune raison de le tarifer deux fois différemment.
    // La puissance d'éclairage dépend de la PROFONDEUR, pas de la seule
    // surface : plus le module est loin de la face, plus son cône couvre large
    // (docs/43 §20). Le coefficient marchand la remplace quand il est donné.
    const watts = lumineuse * wattsPerM2Effectif(b.depthCm, pc);
    lines.push({
      key: 'power',
      label: `Alimentation ${Math.round(watts)} W`,
      amountCents: wattsCents(watts, coeff),
    });
    lines.push({ key: 'build', label: 'Assemblage du caisson', amountCents: pc.boxBuildCents });
    lines.push({ key: 'fixing', label: 'Perçage et fixations', amountCents: pc.fixingCents });
    return finaliser(lines, config, coeff, measurements);
  }


  // Tube : longueur × tarif × complexité (× surcoût RGB éventuel).
  const complexity =
    config.kind === 'logo-svg' || config.kind === 'panel'
      ? coeff.complexity.logo
      : config.lines.length > 1
        ? coeff.complexity.multiLine
        : coeff.complexity.singleLine;
  const tubeRate = coeff.tubePerMeterCents * (isRgb ? coeff.rgbTubeMultiplier : 1);

  // LE PRIX PAR RÉFÉRENCE DE TUBE (écart E02), et le chemin d'origine intact.
  //
  // Deux couleurs peuvent coûter différemment : une bobine de blanc chaud et
  // une de RGB ne s'achètent pas au même prix, et le marchand qui tient son
  // catalogue doit pouvoir le dire. Mais tant qu'AUCUNE référence ne porte son
  // propre `tubePerMeterCents`, on reprend exactement le calcul d'avant —
  // même arrondi, même total, au centime. C'est la seule façon d'ajouter cette
  // possibilité sans déplacer un seul prix du catalogue existant, et
  // `tube-par-sku.test.ts` le vérifie sur tous les témoins.
  //
  // Le détail par ligne n'est employé QUE dans le cas contraire, parce qu'il
  // n'est pas arrondi de la même manière : `tubeLengthM` est arrondi une fois,
  // les lignes ne le sont pas.
  const tarifDeLaLigne = (line: { tubeSku?: string; colorHex?: string }): number | null => {
    const sku = ligneVersTube(line, coeff);
    return sku && typeof sku.tubePerMeterCents === 'number' ? sku.tubePerMeterCents : null;
  };
  const parLigne = config.lines.length > 0
    && Array.isArray(measurements.lineTubeM)
    && measurements.lineTubeM.length === config.lines.length
    && config.lines.some((l) => tarifDeLaLigne(l) !== null);

  /*
   * ET LE PRIX PAR MOT, d'un cran plus fin.
   *
   * Depuis qu'un mot peut porter sa propre couleur, il porte sa propre bobine :
   * « OUVERT » en rouge et « 24H » en blanc, ce sont deux references, deux
   * achats, parfois deux tarifs au metre. Facturer la ligne au prix du premier
   * mot ferait payer le blanc au tarif du rouge.
   *
   * Meme discipline qu'au-dessus : ce chemin ne s'ouvre QUE si un mot porte un
   * tarif propre. Sans catalogue tarifie — le cas livre — rien ne change, au
   * centime.
   */
  const tarifDuMot = (mot: { colorHex?: string; tubeSku?: string } | undefined): number | null => (
    mot && (mot.colorHex || mot.tubeSku) ? tarifDeLaLigne(mot) : null
  );
  const parMot = Array.isArray(measurements.wordTubeM)
    && measurements.wordTubeM.length === config.lines.length
    && config.lines.some((l, i) => (l.wordColors ?? []).some((mot, j) => (
      tarifDuMot(mot) !== null && typeof measurements.wordTubeM![i]?.[j] === 'number'
    )));

  let tubeCents: number;
  if (parMot) {
    let cumul = 0;
    config.lines.forEach((line, i) => {
      const parDefaut = tarifDeLaLigne(line) ?? coeff.tubePerMeterCents;
      (measurements.wordTubeM![i] ?? []).forEach((longueur, j) => {
        const base = tarifDuMot(line.wordColors?.[j]) ?? parDefaut;
        cumul += longueur * base * (isRgb ? coeff.rgbTubeMultiplier : 1) * complexity;
      });
    });
    tubeCents = Math.round(cumul);
  } else if (parLigne) {
    let cumul = 0;
    config.lines.forEach((line, i) => {
      const base = tarifDeLaLigne(line) ?? coeff.tubePerMeterCents;
      const taux = base * (isRgb ? coeff.rgbTubeMultiplier : 1);
      cumul += (measurements.lineTubeM![i] ?? 0) * taux * complexity;
    });
    tubeCents = Math.round(cumul);
  } else {
    tubeCents = Math.round(tubeLengthM * tubeRate * complexity);
  }

  lines.push({
    key: 'tube',
    label: `Tube LED ${tubeLengthM.toFixed(2)} m`,
    amountCents: tubeCents,
  });

  // Support plat OU caisson.
  if (supportType === 'box') {
    const faces = boxFacesM2(widthCm, heightCm, config.boxDepthCm ?? coeff.boxDepthCm);
    lines.push({
      key: 'box',
      label: 'Caisson',
      amountCents: Math.round(faces * coeff.boxPerM2Cents) + coeff.boxAssemblyCents,
    });
  } else if (supportType !== 'none') {
    const area = supportAreaM2(supportType, widthCm, heightCm, coeff);
    const finish: SupportFinish = config.support.finish;
    lines.push({
      key: 'support',
      label: `Support ${supportType} (${finish})`,
      amountCents: Math.round(area * coeff.supportPerM2Cents[finish]),
    });
    if (supportType === 'stand') {
      lines.push({ key: 'mounting', label: 'Pied à poser', amountCents: coeff.mountingCents.stand });
    }
  }

  // La puissance appelée, bobine par bobine quand le catalogue la déclare
  // (docs/43 §16). Sans catalogue, `wattsDemandes` rend exactement
  // `tubeLengthM × wattsPerMeter` : le calcul d'avant, au watt près.
  const wattsAppeles = wattsDemandes(config.lines ?? [], measurements, coeff);
  const tubeCoeff = coeff.tube ?? DEFAULT_TUBE;
  lines.push({
    key: 'power',
    label: 'Alimentation',
    amountCents: powerCents(wattsAppeles, coeff, {
      voltage: tubeCoeff.voltage,
      exterieur: 'outdoor' === config.environment,
      variateur: Boolean(config.options?.dimmerRemote),
    }),
  });

  if (isRgb) {
    // LE CONTRÔLEUR DE LA BOBINE, quand elle en déclare un (docs/43 §19).
    //
    // Un contrôleur RGB à trois canaux et un contrôleur SPI à pixels adressables
    // n'ont pas le même prix ; le forfait unique les confondait. On prend le
    // plus cher des contrôleurs déclarés par les lignes — l'atelier n'en pose
    // qu'un, et c'est celui que la bobine la plus exigeante réclame.
    //
    // Aucune bobine n'en déclare : le forfait s'applique, au centime, comme
    // avant.
    let controleur = 0;
    for (const line of config.lines ?? []) {
      const c = ligneVersTube(line, coeff)?.controllerCents;
      if (typeof c === 'number' && c > controleur) controleur = c;
    }
    // Le contrôleur INCLUT le variateur/télécommande (pas de double vente).
    lines.push({
      key: 'rgb',
      label: 'RGB color-changing (contrôleur inclus)',
      amountCents: controleur > 0 ? controleur : coeff.rgbFlatCents,
    });
  } else if (config.options.dimmerRemote) {
    lines.push({ key: 'dimmer', label: 'Télécommande + variateur', amountCents: coeff.dimmerRemoteCents });
  }

  /*
   * LE PROGRAMMATEUR EST UNE LIGNE À PART, PAS UNE VARIANTE DU VARIATEUR.
   *
   * Le variateur et le contrôleur RGB s'excluent (« pas de double vente » :
   * le contrôleur fait déjà variateur). Le programmateur, lui, ne fait pas
   * double emploi avec eux — il coupe l'alimentation à heure fixe, il ne
   * règle pas l'intensité. Le mettre dans la même chaîne de `else if` aurait
   * silencieusement privé de minuterie toute enseigne RGB, c'est-à-dire
   * précisément celles qu'on vend aux professionnels.
   */
  if (config.options.nightTimer) {
    /*
     * LE PROGRAMMATEUR DÉCLARÉ, OU LE DÉFAUT NON SOURCÉ (chantier A2).
     *
     * `prixProgrammateur` rend aussi d'où vient le chiffre. On ne s'en sert pas
     * ici — une ligne de prix n'a pas à porter ses états d'âme — mais la
     * validation et la fiche d'atelier peuvent le dire, et c'est ce qui permet
     * à un intégrateur de savoir qu'il vend une pièce dont il ignore le coût.
     */
    lines.push({
      key: 'night-timer',
      label: 'Programmateur d’extinction',
      amountCents: prixProgrammateur(coeff.timers, coeff.nightTimerCents).cents,
    });
  }

  if (config.mounting !== 'screws' && config.mounting !== 'stand' && supportType !== 'stand') {
    const cents = coeff.mountingCents[config.mounting];
    if (cents > 0) lines.push({ key: 'mounting', label: 'Fixations', amountCents: cents });
  }

  return finaliser(lines, config, coeff, measurements);
}

/**
 * Fin de calcul, commune aux trois familles.
 *
 * Palier de taille, extérieur, express, arrondi : ces règles ne dépendent pas
 * de ce qu'on fabrique. Les dupliquer dans chaque branche garantirait qu'un
 * jour l'une d'elles divergerait — et le client verrait deux prix différents
 * pour la même majoration.
 */
function finaliser(
  lines: PriceLine[],
  config: NeonConfiguration,
  coeff: PricingCoefficients,
  measurements: NeonMeasurements,
): PriceResult {
  let total = lines.reduce((sum, l) => sum + l.amountCents, 0);

  // PALIER DE TAILLE (réglage marchand) — appliqué sur le sous-total, AVANT
  // les multiplicateurs extérieur/express : le palier porte sur le produit de
  // base, les majorations le suivent ensuite.
  const tier = [...coeff.sizeTiers]
    .sort((a, b) => a.maxWidthCm - b.maxWidthCm)
    .find((t) => measurements.widthCm <= t.maxWidthCm);
  if (tier) {
    const extra = tier.mode === 'surcharge' ? tier.cents : Math.max(0, tier.cents - total);
    if (extra > 0) {
      lines.push({
        key: 'sizeTier',
        label: tier.mode === 'surcharge' ? 'Supplément taille' : 'Prix minimum (taille)',
        amountCents: extra,
      });
      total += extra;
    }
  }

  if ('outdoor' === config.environment) {
    const extra = Math.round(total * (coeff.outdoorMultiplier - 1));
    lines.push({ key: 'outdoor', label: 'Extérieur (caisson drainé, tube et alim IP67, anti-UV)', amountCents: extra });
    total += extra;
  }
  if (config.options.express) {
    const extra = Math.round(total * (coeff.expressMultiplier - 1));
    lines.push({ key: 'express', label: 'Production express', amountCents: extra });
    total += extra;
  }

  return {
    totalCents: total,
    displayTotalCents: coeff.marketingRounding ? marketingRoundCents(total) : total,
    lines,
    measurements,
  };
}
