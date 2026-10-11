/**
 * Règles de validation — docs/04-formules-prix.md §5. Exécutées côté widget
 * (retour immédiat) ET côté serveur (juge de paix, refus à la commande).
 */

import type { FontClass, NeonConfiguration, NeonMeasurements, ValidationIssue } from './types.js';
import { bobinesDuDesign, DEFAULT_COEFFICIENTS, diametreTubeMm, ligneVersTube, type PricingCoefficients } from './coefficients.js';
import { fabricationMetrics, type FontMetricsManifest } from './metrics.js';
import { FORMAT_PLAQUE_MM, tientSurUnePlaque } from './panels.js';

export interface ValidateInput {
  config: NeonConfiguration;
  measurements: NeonMeasurements;
  fontClassById: Record<string, FontClass>;
  manifests?: Record<string, FontMetricsManifest>;
  coefficients?: Partial<PricingCoefficients>;
}

export function validateConfiguration({
  config,
  measurements,
  fontClassById,
  manifests = {},
  coefficients,
}: ValidateInput): ValidationIssue[] {
  const coeff: PricingCoefficients = { ...DEFAULT_COEFFICIENTS, ...(coefficients ?? {}) };
  const issues: ValidationIssue[] = [];
  const L = coeff.limits;

  // --- Panneaux et caissons ------------------------------------------------
  if ('panel' === config.kind || 'box-sign' === config.kind) {
    const t = config.sizeCm;
    if (!t || t.widthCm <= 0 || t.heightCm <= 0) {
      issues.push({ code: 'panel-size-required', message: 'Indiquez la largeur et la hauteur.' });
    } else {
      const max = coeff.limits.maxWidthCm;
      if (t.widthCm > max || t.heightCm > max) {
        issues.push({
          code: 'panel-too-large',
          message: `Dimension maximale ${max} cm : au-delà, la plaque ne passe plus en transport standard.`,
        });
      }
      if (t.widthCm < 10 || t.heightCm < 10) {
        issues.push({ code: 'panel-too-small', message: 'Dimensions minimales : 10 × 10 cm.' });
      }
      // NE TIENT PAS SUR UNE PLAQUE — avertissement, jamais refus.
      //
      // Une plaque de PMMA fait 3050 × 2030 mm : un panneau de 2,50 m en
      // travers ne s'y taille pas, il faut raboutter, et la jonction se voit.
      // `maxWidthCm` plafonne à 250 cm et laisse donc passer le cas.
      //
      // `null` veut dire « format inconnu pour cette matière » — trois sur cinq
      // n'ont pas de fiche au fonds — et surtout PAS « oui ». On se tait alors,
      // plutôt que d'annoncer fabricable ce qu'on n'a pas vérifié.
      const matiere = 'panel' === config.kind ? config.panel?.material : config.boxSign?.material;
      if (matiere) {
        const tient = tientSurUnePlaque(matiere, t.widthCm, t.heightCm);
        if (tient === false) {
          const f = FORMAT_PLAQUE_MM[matiere]!;
          issues.push({
            code: 'panel-larger-than-sheet',
            severity: 'warn',
            message: `Plus grand qu'une plaque de ${f.longueurMm / 10} × ${f.largeurMm / 10} cm : la pièce sera raboutée, et la jonction se verra.`,
          });
        }
      }
    }
    // Une matière qui ne tient pas dehors ne doit pas partir dehors : c'est le
    // genre d'erreur qui revient en service après-vente six mois plus tard.
    const mat = 'panel' === config.kind ? config.panel?.material : config.boxSign?.material;
    const spec = mat ? coeff.panels.materials[mat] : undefined;
    if ('outdoor' === config.environment && spec && !spec.outdoorReady) {
      issues.push({
        code: 'material-not-outdoor',
        message: `${spec.label} ne convient pas à l'extérieur sans traitement.`,
      });
    }
    // PROFONDEUR MINIMALE — 3 cm, et non 6 (docs/43 §21).
    //
    // Le motif d'origine — « sous 6 cm les modules se devinent sur la face » —
    // est vrai pour des modules à entraxe large, et faux pour la gamme
    // BrightLine, qui existe précisément pour les caissons peu profonds et
    // couvre 30 mm avec un entraxe resserré à 75 mm. Sous 3 cm, en revanche,
    // aucune famille de modules du fonds ne couvre le cas.
    const miniCm = L.boxMinDepthCm > 0 ? L.boxMinDepthCm : 3;
    if ('box-sign' === config.kind && config.boxSign && config.boxSign.depthCm < miniCm) {
      issues.push({
        code: 'box-too-shallow',
        message: `Profondeur minimale d'un caisson : ${miniCm} cm. En dessous, aucun module ne diffuse assez large pour éclairer la face sans laisser voir ses points lumineux.`,
      });
    }
    return issues;
  }

  /*
   * LES RÈGLES DU TEXTE S'APPLIQUENT DÈS QU'IL Y A DU TEXTE.
   *
   * Elles étaient réservées à `kind === 'text'`. Depuis qu'un logo peut se
   * composer AVEC des lignes, ce test laissait passer sans un mot une hauteur
   * de lettre de 2 cm ou une police dont le trait est deux fois plus fin que
   * le tube — au seul motif qu'un logo accompagnait le texte.
   *
   * `empty-text`, lui, reste réservé au texte seul : un logo sans texte est
   * une pièce complète, pas un design vide.
   */
  const avecTexte = config.lines.some((l) => '' !== l.text.trim());
  if (config.kind === 'text' || ('logo-svg' === config.kind && avecTexte)) {
    if ('text' === config.kind && !avecTexte) {
      issues.push({ code: 'empty-text', message: 'Saisissez un texte pour votre néon.' });
    }
    if (config.lines.length > L.maxLines) {
      issues.push({ code: 'too-many-lines', message: `${L.maxLines} lignes maximum.` });
    }
    for (const line of config.lines) {
      if (line.text.length > L.maxCharsPerLine) {
        issues.push({ code: 'too-many-lines', message: `${L.maxCharsPerLine} caractères maximum par ligne.` });
        break;
      }
    }
    // Hauteur de lettre minimale selon la classe de police la plus exigeante.
    for (const line of config.lines) {
      const cls = fontClassById[line.fontId];
      if (!cls) {
        issues.push({ code: 'unknown-font', message: `Police inconnue : ${line.fontId}.` });
        continue;
      }
      const min = cls === 'script' ? L.minLetterHeightScriptCm : L.minLetterHeightBlockCm;
      if (config.letterHeightCm < min) {
        issues.push({
          code: 'letter-height-too-small',
          message: `Hauteur de lettre minimale : ${min} cm pour cette police.`,
        });
        break;
      }
    }
    // LE TUBE TIENT-IL DANS LA LETTRE ?
    //
    // Le seuil forfaitaire ci-dessus (8 cm bâton / 10 cm cursive) est un proxy
    // grossier : il laisse passer une bâton très fine et refuse une cursive
    // grasse parfaitement fabricable. La classe typographique n'est pas la
    // bonne variable — l'ÉPAISSEUR DU TRAIT l'est, et elle est mesurée au
    // build, glyphe par glyphe.
    //
    // Cette règle ne remplace pas le forfait, elle le complète : elle ne mord
    // que là où le forfait est trop permissif.
    //
    // CHAQUE LIGNE AVEC SON PROPRE TUBE (écart E28). Le catalogue peut
    // désormais déclarer un diamètre par référence : avec un diamètre unique,
    // une ligne fine en Ø 8 se voyait refusée au motif du Ø 10 de la ligne
    // voisine. Le refus doit venir de la pièce, pas du réglage de boutique.
    const fab = fabricationMetrics(
      config,
      manifests,
      coeff.tube.diameterMm / 10,
      coeff.tube.minStrokeRatio,
      (line) => diametreTubeMm(line, coeff) / 10,
    );
    if (fab.minLetterHeightCm > 0 && config.letterHeightCm < fab.minLetterHeightCm) {
      issues.push({
        code: 'stroke-thinner-than-tube',
        severity: 'block',
        message:
          // Le diamètre CITÉ est celui du tube coupable, pas celui de la
          // boutique : citer l'autre enverrait changer la mauvaise chose.
          `À cette taille, le tube (Ø ${fab.tubeDiameterMm} mm) est plus large que le trait de la lettre ` +
          `« ${fab.narrowestChar} » : les pleins se boucheraient. Hauteur de lettre minimale pour cette ` +
          `police : ${fab.minLetterHeightCm} cm, ou choisissez une police plus grasse.`,
      });
    }

    // Caractères couverts par le manifeste de la police (si manifeste présent).
    for (const line of config.lines) {
      const manifest = manifests[line.fontId];
      if (!manifest) continue;
      const missing = [...line.text].filter((ch) => !/\s/.test(ch) && !manifest.glyphs[ch]);
      if (missing.length > 0) {
        issues.push({
          code: 'unsupported-characters',
          message: `Caractères non disponibles dans cette police : ${[...new Set(missing)].join(' ')}`,
        });
      }
    }
  }

  if (measurements.widthCm > L.maxWidthCm) {
    issues.push({ code: 'too-wide', message: `Largeur maximale : ${L.maxWidthCm} cm (actuelle ≈ ${Math.round(measurements.widthCm)} cm). Réduisez la taille ou le texte.` });
  }
  if (measurements.tubeLengthM > L.maxTubeM) {
    issues.push({ code: 'tube-too-long', message: `Longueur de tube maximale : ${L.maxTubeM} m.` });
  }
  // UNE BOBINE UNICOLORE NE FERA JAMAIS DU RGB.
  //
  // Le mode couleur et la référence de tube sont deux réglages séparés, et rien
  // n'empêchait de commander « RGB » sur une bobine de silicone rose. À l'écran
  // c'est joli ; à l'atelier, personne ne peut le fabriquer, et le refus arrive
  // par téléphone trois jours plus tard. Refus, donc, et pas avertissement : la
  // pièce n'est pas fabricable, ce n'est pas une question de goût.
  if (config.colorMode === 'rgb') {
    // LES MOTS COMPTENT AUSSI. Depuis qu'un mot porte sa propre bobine, ne
    // regarder que les lignes laissait passer « OUVERT » en RGB avec un
    // « 24H » sur du silicone unicolore : refusé à l'atelier, pas à l'écran.
    const incapables = bobinesDuDesign(config.lines ?? [])
      .map((l) => ligneVersTube(l, coeff))
      .filter((t) => t && t.mode && t.mode === 'solid');
    if (incapables.length > 0) {
      const noms = [...new Set(incapables.map((t) => t!.label ?? t!.sku))].join(', ');
      issues.push({
        code: 'tube-not-rgb',
        message: `${noms} : cette référence de tube n'existe qu'en une couleur. Choisissez un tube RGB, ou revenez à une couleur fixe.`,
      });
    }
  }

  // SCISSION EN PANNEAUX — avertissement, jamais refus.
  //
  // Au-delà de la limite du transporteur, la pièce part en plusieurs morceaux
  // à assembler sur place. Ça reste vendable, mais le client doit le savoir
  // AVANT de payer : découvrir à la livraison qu'une enseigne de 2,40 m arrive
  // en deux panneaux avec un joint au milieu, c'est un litige.
  const largeurPanneau = L.maxPanelWidthCm;
  if (largeurPanneau > 0 && measurements.widthCm > largeurPanneau) {
    const n = Math.ceil(measurements.widthCm / largeurPanneau);
    issues.push({
      code: 'panel-split',
      severity: 'warn',
      message: `Au-delà de ${largeurPanneau} cm, la pièce est livrée en ${n} panneaux à assembler (jonction visible).`,
    });
  }

  // CAVALIER TROP LONG entre deux mots.
  //
  // Entre deux mots, aucun tube ne court : c'est un fil qui saute l'espace,
  // gainé et plaqué derrière le support. Passé une certaine longueur il pend,
  // se voit et se décroche. La longueur du saut est celle de l'espace de la
  // police, mise à l'échelle de la hauteur de lettre — donc connue sans
  // dessiner quoi que ce soit.
  if (config.kind !== 'logo-svg' && L.maxJumperCm > 0) {
    let pire = 0;
    for (const line of config.lines) {
      if (!line.text.includes(' ')) continue;
      const manifest = manifests[line.fontId];
      if (!manifest?.capHeight) continue;
      const espace = manifest.glyphs[' ']?.advance;
      if (!espace || espace <= 0) continue;
      pire = Math.max(pire, (espace * config.letterHeightCm) / manifest.capHeight);
    }
    if (pire > L.maxJumperCm) {
      issues.push({
        code: 'jumper-too-long',
        severity: 'warn',
        message: `L'espace entre les mots atteint ${Math.round(pire)} cm : le fil qui le saute devra être gainé et fixé (au-delà de ${L.maxJumperCm} cm).`,
      });
    }
  }

  // Extérieur ⇒ caisson obligatoire. Drainé, pas scellé : une boîte fermée pleine
  // d'air condense ; l'étanchéité est portée par le tube surmoulé et le bloc IP67.
  if (config.environment === 'outdoor' && config.support.type !== 'box') {
    issues.push({ code: 'outdoor-requires-box', severity: 'warn', message: 'Un néon extérieur nécessite un caisson drainé (tube et alimentation IP67) : sélectionné automatiquement.' });
  }

  /*
   * LE MIROIR NE SE FRAISE PAS EN CANAL (écart E18).
   *
   * `materiaux-enseigne` §3 : « le miroir est un dépôt ARRIÈRE » — une couche
   * métallisée déposée au dos de la plaque. Fraiser une gorge dans la face
   * traverse le PMMA et **arrache ce dépôt** : la gorge devient une cicatrice
   * grise, visible de face et impossible à rattraper.
   *
   * Le tube se pose donc EN SURFACE sur un miroir. Ce n'est pas un défaut :
   * le miroir cache le dos, donc les fils ne se voient pas — c'est même la
   * finition où le montage en surface se remarque le moins.
   *
   * Un AVERTISSEMENT et non un blocage : la pièce se fabrique parfaitement,
   * seule sa méthode de pose change. Bloquer refuserait la finition la plus
   * chère du catalogue pour une contrainte d'atelier.
   */
  if ('mirror' === config.support.finish && 'cut-to-letter' === config.support.type) {
    issues.push({
      code: 'mirror-no-channel',
      severity: 'warn',
      message: 'Le miroir est un dépôt appliqué au dos de la plaque : une gorge fraisée '
        + 'l’arracherait et laisserait une cicatrice grise visible de face. Le tube sera '
        + 'donc posé en surface : le miroir cachant le dos, les fils ne se verront pas.',
    });
  }

  return issues;
}
