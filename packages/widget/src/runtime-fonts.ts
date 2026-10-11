/**
 * POLICES À L'EXÉCUTION — deux sources qui se complètent :
 *
 *  1. EMBARQUÉES : le petit jeu livré dans le bundle (12 polices). Il permet au
 *     configurateur de fonctionner sans hôte (démo, mode autonome) et sert de
 *     repli si la boutique n'a rien configuré.
 *  2. FOURNIES PAR L'HÔTE : le plugin sert le pack complet depuis ses propres
 *     fichiers et transmet, dans le contexte, UNIQUEMENT les polices que le
 *     marchand a activées — avec leur URL et leurs métriques. On les charge à
 *     la demande : le bundle ne grossit pas du pack entier.
 *
 * Les MÉTRIQUES sont indispensables : c'est la longueur de tracé par glyphe qui
 * donne les mètres de tube, donc le prix. Une police sans métriques est ignorée.
 */

import type { FontClass } from '@neon/core';
import type { FontMetricsManifest } from '@neon/core';
import { FONTS as BUILTIN_FONTS, MANIFESTS as BUILTIN_MANIFESTS, type FontEntry } from './catalog';
import { hostContext } from './host-context';

/** Police transmise par la plateforme hôte. */
export interface HostFont {
  id: string;
  label: string;
  class: FontClass;
  /** URL du WOFF2 servi par l'hôte (absente pour une police déjà embarquée). */
  url?: string;
  /** Métriques (manifeste du pipeline) — obligatoires si non embarquée. */
  metrics?: FontMetricsManifest;
}

const STYLE_ID = 'ahns-config-host-fonts';

/** Famille CSS d'une police de l'hôte (préfixe distinct des embarquées). */
const hostFamily = (id: string) => `NeonHost_${id.replace(/[^a-z0-9]/gi, '_')}`;

/**
 * Résout le catalogue effectif : polices proposées au client + métriques
 * correspondantes. Injecte les @font-face nécessaires dans le DOCUMENT (elles
 * ne se chargent pas depuis un Shadow DOM — même contrainte que les embarquées).
 */
export function resolveFonts(): { fonts: FontEntry[]; manifests: Record<string, FontMetricsManifest> } {
  // Le contexte hôte est du JSON produit par le serveur : on le lit à travers
  // la forme attendue, et chaque entrée est validée ci-dessous (une police sans
  // fichier ni métriques est simplement ignorée).
  const hostFonts = hostContext()?.fonts as HostFont[] | undefined;
  if (!hostFonts?.length) {
    return { fonts: BUILTIN_FONTS, manifests: BUILTIN_MANIFESTS };
  }

  const manifests: Record<string, FontMetricsManifest> = { ...BUILTIN_MANIFESTS };
  const fonts: FontEntry[] = [];
  const faces: string[] = [];

  for (const hf of hostFonts) {
    const builtin = BUILTIN_FONTS.find((f) => f.id === hf.id);
    if (builtin && !hf.url) {
      // Déjà dans le bundle : rien à charger.
      fonts.push({ ...builtin, label: hf.label || builtin.label });
      continue;
    }
    const metrics = hf.metrics ?? BUILTIN_MANIFESTS[hf.id];
    if (!metrics || !hf.url) {
      // Sans métriques ni fichier, la police ne peut être ni tarifée ni rendue.
      continue;
    }
    const family = hostFamily(hf.id);
    faces.push(
      `@font-face { font-family: '${family}'; src: url('${hf.url}') format('woff2'); font-display: block; }`,
    );
    manifests[hf.id] = metrics;
    fonts.push({ id: hf.id, label: hf.label, class: hf.class, cssFamily: family, weight: 400 });
  }

  if (faces.length && !document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = faces.join('\n');
    document.head.appendChild(style);
  }

  // Si le marchand n'a rien activé d'exploitable, on garde les embarquées :
  // un configurateur sans police ne servirait à rien.
  return fonts.length ? { fonts, manifests } : { fonts: BUILTIN_FONTS, manifests: BUILTIN_MANIFESTS };
}
