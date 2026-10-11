/**
 * Mesure du tube LED et des dimensions du design.
 *
 * Source de vérité : le MANIFESTE DE MÉTRIQUES par police (généré par
 * scripts/build-fonts.mjs à partir des fichiers de police réels) — longueur de
 * tracé et avance par glyphe, en unités/em. La même mesure sert au RENDU et au
 * PRIX : jamais d'écart entre ce que le client voit et ce qu'il paie.
 *
 * Repli heuristique (aucun manifeste) : coefficients moyens par classe de
 * police, calibrés sur les mesures réelles des polices du pipeline. Utilisé
 * uniquement tant qu'une police n'a pas été passée au pipeline.
 */

import type { FontClass, NeonConfiguration, NeonMeasurements } from './types.js';

/** Métriques d'un glyphe, en unités/em (voir scripts/build-fonts.mjs). */
export interface GlyphMetrics {
  /** Avance horizontale. */
  advance: number;
  /**
   * Périmètre du contour ÷ 2 — mesure historique. Conservée pour relire les
   * manifestes produits avant la mesure de ligne médiane.
   */
  pathLen: number;
  /**
   * Longueur de la LIGNE MÉDIANE : le tube que l'atelier plie réellement.
   * Mesurée au build par conservation de surface (aire ÷ épaisseur), vérifiée
   * exacte sur une barre et sur un anneau. C'est elle qui fait le prix.
   * Absente des anciens manifestes → repli sur `pathLen`.
   */
  medianLen?: number;
  /**
   * ÉPAISSEUR DU TRAIT (unités/em) — mesurée sur la transformée de distance,
   * à la même occasion que `medianLen`. Un tube de 10 mm posé sur un trait de
   * 4 mm déborde de la lettre : les contreformes se bouchent, le mot devient
   * un pâté lumineux. Absente des manifestes antérieurs → contrôle ignoré.
   */
  strokeW?: number;
  /**
   * NOMBRE D'ANGLES du tracé — les endroits où la ligne médiane tourne plus
   * court que le tube. Un angle ne se plie pas : il se coupe. C'est donc un
   * compteur de coupes, d'embouts et de soudures, c'est-à-dire de TEMPS
   * d'atelier — pas un critère de refus.
   */
  corners?: number;
}

export interface FontMetricsManifest {
  fontId: string;
  class: FontClass;
  unitsPerEm: number;
  /** Hauteur de capitale (unités/em) — l'échelle « hauteur de lettre » du client. */
  capHeight: number;
  glyphs: Record<string, GlyphMetrics>;
}

/** Heuristiques de repli par classe (rapport longueur de tube / hauteur de lettre, par caractère). */
const FALLBACK = {
  block: { tubePerChar: 2.2, advancePerChar: 0.62 },
  script: { tubePerChar: 2.6, advancePerChar: 0.55 },
} as const;

/**
 * Espace entre deux lignes, en fraction de la hauteur de lettre.
 *
 * EXPORTÉ parce que le widget en a besoin : c'est le même écart qui sépare le
 * logo du texte dans la scène 2D et dans la géométrie 3D. Recopié là-bas, il
 * finirait par ne plus valoir 0,35 des deux côtés — et le dessin ne montrerait
 * plus la pièce facturée.
 */
export const INTERLINE_RATIO = 0.35;

/**
 * LES MOTS D'UNE LIGNE — un seul découpage, partagé.
 *
 * Le widget découpait déjà le texte pour placer les mots un à un
 * (`wordOffsets`) ; le cœur doit maintenant le découper aussi, pour mesurer le
 * tube de chacun. Deux découpages du même texte finiraient par ne plus rendre
 * le même nombre de mots — et le tableau des couleurs ne tomberait plus en
 * face du bon mot.
 */
export function motsDeLigne(text: string): string[] {
  const t = text.trim();
  return '' === t ? [] : t.split(/\s+/);
}

function isSpace(ch: string): boolean {
  return /\s/.test(ch);
}

/** Longueur de tube (m) + largeur (cm) d'UNE ligne à l'échelle demandée. */
function measureLine(
  text: string,
  letterHeightCm: number,
  fontClass: FontClass,
  manifest: FontMetricsManifest | null,
): { tubeM: number; widthCm: number } {
  let tubeUnits = 0;
  let advanceUnits = 0;
  if (manifest) {
    const scale = letterHeightCm / manifest.capHeight; // cm par unité
    for (const ch of text) {
      const g = manifest.glyphs[ch];
      if (!g) {
        if (isSpace(ch)) {
          advanceUnits += manifest.unitsPerEm * 0.3;
        }
        continue; // caractère inconnu → refusé par la validation en amont
      }
      // La ligne médiane fait foi ; `pathLen` n'est là que pour les manifestes
      // antérieurs (police téléversée avant la mise à jour, par exemple).
      tubeUnits += g.medianLen ?? g.pathLen;
      advanceUnits += g.advance;
    }
    return { tubeM: (tubeUnits * scale) / 100, widthCm: advanceUnits * scale };
  }
  const f = FALLBACK[fontClass];
  let chars = 0;
  let spaces = 0;
  for (const ch of text) (isSpace(ch) ? spaces++ : chars++);
  const tubeCm = chars * f.tubePerChar * letterHeightCm;
  const widthCm = (chars * f.advancePerChar + spaces * 0.3) * letterHeightCm;
  return { tubeM: tubeCm / 100, widthCm };
}

/**
 * Mesures complètes d'une configuration.
 * `manifests` : manifestes par fontId (absent → heuristique de repli).
 * `fontClassById` : classe de chaque police du catalogue (pour le repli).
 */
export function measureConfiguration(
  config: NeonConfiguration,
  fontClassById: Record<string, FontClass>,
  manifests: Record<string, FontMetricsManifest> = {},
): NeonMeasurements {
  // Panneaux et caissons : les DEUX dimensions sont saisies. Il n'y a pas de
  // texte dont on déduirait la largeur, et aucun tube à mesurer — la longueur
  // reste donc à zéro, ce qui est la vérité et non une valeur manquante.
  if (('panel' === config.kind || 'box-sign' === config.kind) && config.sizeCm) {
    return {
      tubeLengthM: 0,
      widthCm: round2(config.sizeCm.widthCm),
      heightCm: round2(config.sizeCm.heightCm),
    };
  }
  let tubeM = 0;
  let widthCm = 0;
  const H = config.letterHeightCm;
  // Le détail par ligne sert au jour où deux lignes emploient des tubes de prix
  // différents (E02). Il est calculé ici parce que c'est le seul endroit qui
  // connaît déjà chaque ligne — le recalculer ailleurs, ce serait deux mesures
  // qui divergent.
  const lineTubeM: number[] = [];
  const wordTubeM: number[][] = [];
  for (const line of config.lines) {
    const cls = fontClassById[line.fontId] ?? 'block';
    const manifest = manifests[line.fontId] ?? null;
    const m = measureLine(line.text, H, cls, manifest);
    tubeM += m.tubeM;
    lineTubeM.push(m.tubeM);
    // Le tube d'un MOT, pour le jour — arrivé — où deux mots d'une même
    // ligne emploient deux bobines. Une espace n'ayant pas de tube, la
    // somme des mots vaut celle de la ligne.
    wordTubeM.push(motsDeLigne(line.text).map((mot) => measureLine(mot, H, cls, manifest).tubeM));
    widthCm = Math.max(widthCm, m.widthCm);
  }
  /*
   * Les lignes ÉCRITES ne servent qu'à la composition avec un logo, ci-dessous.
   *
   * La branche TEXTE, elle, continue de compter `config.lines.length` — y
   * compris une ligne vide. C'est discutable (on paie la plaque autour de
   * rien), mais c'est le calcul en place : le corriger ferait bouger le prix
   * du support sans témoin reprix, ce que la règle 1 interdit. À traiter pour
   * lui-même, avec sa note dans docs/04.
   */
  const ecrites = config.lines.filter((l) => '' !== l.text.trim());

  /*
   * TEXTE + LOGO DANS LA MÊME PIÈCE.
   *
   * Le logo REMPLAÇAIT le texte : cette branche rendait ses trois chiffres et
   * `config.lines` n'était jamais lu. Un client qui voulait son logo au-dessus
   * de son nom devait commander deux pièces.
   *
   * Les deux se mesurent maintenant ensemble, et de la seule façon qui se
   * défende : la longueur de tube s'AJOUTE — c'est un seul tube plié, plus
   * long — la largeur est la plus grande des deux, et la hauteur les empile
   * avec le même interligne que deux lignes de texte.
   *
   * ── CE QUE CETTE MESURE IGNORE, ET POURQUOI ─────────────────────────────
   *
   * Le placement manuel. Le client peut faire glisser le logo comme il fait
   * déjà glisser ses mots (`NeonLine.offsetXCm`, `wordOffsets`), et le cœur
   * n'a jamais lu ces décalages non plus. Ce n'est pas un oubli : déplacer une
   * pièce ne change ni la longueur de tube ni la matière, seulement
   * l'encombrement de la maquette — que la scène mesure sur le dessin, à
   * l'écran. Le prix, lui, se fonde sur la composition NOMINALE, la même des
   * deux côtés du réseau.
   *
   * Rétro-compatible : une configuration enregistrée avant ce jour porte
   * `lines: []` avec son logo, et retombe exactement sur l'ancien calcul.
   */
  if ('logo-svg' === config.kind && config.logo) {
    const logoTubeM = config.logo.tubeLengthMm / 1000;
    if (0 === ecrites.length) {
      return {
        tubeLengthM: config.logo.tubeLengthMm / 1000,
        widthCm: config.logo.widthCm,
        heightCm: config.logo.heightCm,
      };
    }
    const nTexte = ecrites.length;
    const hauteurTexte = nTexte * H + (nTexte - 1) * H * INTERLINE_RATIO;
    return {
      tubeLengthM: round2(tubeM + logoTubeM),
      widthCm: round2(Math.max(widthCm, config.logo.widthCm)),
      heightCm: round2(hauteurTexte + H * INTERLINE_RATIO + config.logo.heightCm),
      lineTubeM,
      wordTubeM,
    };
  }

  const n = Math.max(1, config.lines.length);
  const heightCm = n * H + (n - 1) * H * INTERLINE_RATIO;
  return {
    tubeLengthM: round2(tubeM),
    widthCm: round2(widthCm),
    heightCm: round2(heightCm),
    lineTubeM,
    wordTubeM,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------
// Fabricabilité
// ---------------------------------------------------------------------------

/** Ce que la géométrie des glyphes dit de la fabrication d'un design. */
export interface FabricationMetrics {
  /**
   * Hauteur de lettre minimale (cm) sous laquelle le tube est trop gros pour
   * le trait le plus fin du texte. 0 = aucun manifeste ne porte la mesure.
   */
  minLetterHeightCm: number;
  /** Caractère qui impose cette limite (le trait le plus fin du texte). */
  narrowestChar: string;
  /**
   * Diamètre (mm) du tube DE LA LIGNE qui impose la limite — écart E28.
   *
   * Un design peut mêler trois bobines de diamètres différents. Le message de
   * refus doit citer celui qui bloque, sans quoi il envoie le client changer
   * la mauvaise chose.
   */
  tubeDiameterMm: number;
  /**
   * Nombre d'angles du dessin — donc de coupes, d'embouts et de soudures.
   * 0 = non mesuré.
   */
  corners: number;
}

/**
 * Fabricabilité d'un texte : le tube tient-il dans la lettre, et combien
 * l'atelier devra-t-il faire de coupes ?
 *
 * Le seuil n'est pas « le trait doit être aussi large que le tube » — ce serait
 * refuser toutes les cursives, que les ateliers fabriquent pourtant tous les
 * jours en assumant un rendu plus gras que la police. Le seuil est le point où
 * le tube fait le DOUBLE du trait : au-delà, ce n'est plus une lettre grasse,
 * c'est un pâté, et la lettre dessinée n'a plus de rapport avec l'objet livré.
 *
 * @param ratio Part du diamètre du tube que le trait doit au moins atteindre.
 */
export function fabricationMetrics(
  config: NeonConfiguration,
  manifests: Record<string, FontMetricsManifest>,
  tubeDiameterCm: number,
  ratio: number,
  /**
   * LE DIAMÈTRE DE *CETTE* LIGNE, en cm — écart E28.
   *
   * Le catalogue peut désormais déclarer un diamètre par référence, et un
   * design peut mêler trois bobines. Avec un diamètre unique, une ligne fine
   * en Ø 8 se voyait refusée au motif du Ø 10 de la ligne voisine : un refus
   * qu'aucune pièce ne justifie.
   *
   * Absent, le diamètre passé en argument s'applique à tout — c'est le
   * comportement d'avant, et il reste celui des boutiques à un seul tube.
   */
  diametreCmDeLaLigne?: (line: NeonConfiguration['lines'][number]) => number,
): FabricationMetrics {
  let minLetterHeightCm = 0;
  let narrowestChar = '';
  let tubeDiameterMm = tubeDiameterCm * 10;
  let corners = 0;
  let mesure = false;
  for (const line of config.lines) {
    const manifest = manifests[line.fontId];
    if (!manifest || !manifest.capHeight) continue;
    const dCm = diametreCmDeLaLigne ? diametreCmDeLaLigne(line) : tubeDiameterCm;
    for (const ch of line.text) {
      const g = manifest.glyphs[ch];
      if (!g) continue;
      if (g.corners) corners += g.corners;
      if (!g.strokeW || g.strokeW <= 0) continue;
      mesure = true;
      // Hauteur à laquelle ce glyphe atteint tout juste le trait minimal.
      const h = (ratio * dCm * manifest.capHeight) / g.strokeW;
      if (h > minLetterHeightCm) {
        minLetterHeightCm = h;
        narrowestChar = ch;
        // ON RETIENT LE DIAMÈTRE DU COUPABLE, pas celui de la boutique. Le
        // message de refus le cite : citer un autre tube que celui qui bloque
        // enverrait le client changer la mauvaise chose.
        tubeDiameterMm = dCm * 10;
      }
    }
  }
  return {
    minLetterHeightCm: mesure ? Math.ceil(minLetterHeightCm * 10) / 10 : 0,
    narrowestChar,
    tubeDiameterMm,
    corners,
  };
}
