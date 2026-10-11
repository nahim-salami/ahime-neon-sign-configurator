/**
 * PARTAGER UNE CONFIGURATION PAR UN LIEN (B14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA SERT
 *
 * `docs/38` B14 : « Sauvegarde et partage (lien, QR), reprise de panier ». Un
 * client compose son néon, l'envoie à son associé, revient dessus le lendemain.
 * Sans lien, il recommence — et souvent il ne revient pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN LIEN EST UNE ENTRÉE NON FIABLE, ET C'EST LE POINT CENTRAL
 *
 * Tout ce qui arrive par une adresse a été écrit par quelqu'un d'autre. Un
 * jeton peut porter un texte de dix mille caractères, une hauteur de lettre de
 * 10^9, un type inventé, ou n'être pas du JSON du tout.
 *
 * On ne lui fait donc AUCUNE confiance : chaque champ est vérifié, borné, et
 * ramené au défaut s'il ne tient pas. C'est exactement la discipline de
 * `sanitize_geometry` côté serveur, et pour la même raison — sauf qu'ici c'est
 * le navigateur du client qui encaisse.
 *
 * Le principe qui gouverne : **on ne rend jamais une configuration à moitié
 * valide**. Soit tout tient, soit on rend `null` et le configurateur s'ouvre sur
 * ses défauts. Un néon composé aux trois quarts d'après un lien abîmé serait
 * plus trompeur qu'un néon vierge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE LIEN NE PORTE PAS
 *
 * **Le logo.** Un SVG téléversé pèse jusqu'à 500 Ko ; encodé dans une adresse,
 * il la rendrait inutilisable — la plupart des navigateurs et des serveurs
 * coupent bien avant. Une configuration à logo se partage donc sans son logo, et
 * `jetonVersConfig` le signale plutôt que de rendre un lien qui trahit
 * silencieusement.
 *
 * **Le prix.** Il se recalcule à l'ouverture, avec les coefficients du marchand
 * du moment. Le figer dans un lien permettrait de faire circuler un prix
 * périmé — ou fabriqué.
 */

import type { NeonConfiguration, NeonLine } from './types.js';

/** Version du format. Un jeton d'une autre version est refusé, pas deviné. */
export const VERSION_JETON = 1;

/**
 * Bornes de lecture.
 *
 * Elles ne remplacent pas `validateConfiguration`, qui reste seul juge de ce qui
 * part à l'atelier : elles empêchent seulement qu'un lien fasse entrer une
 * valeur absurde dans l'interface.
 */
const MAX_LIGNES = 3;
const MAX_CARACTERES = 120;
const MIN_HAUTEUR_CM = 2;
const MAX_HAUTEUR_CM = 300;
/** Au-delà, aucune adresse ne survit au partage par messagerie. */
export const MAX_OCTETS_JETON = 1800;

const HEX = /^#[0-9a-f]{6}$/i;

const nombreBorne = (v: unknown, min: number, max: number): number | null => {
  if ('number' !== typeof v || !Number.isFinite(v)) return null;
  return v >= min && v <= max ? v : null;
};

const texteBorne = (v: unknown): string | null => {
  if ('string' !== typeof v) return null;
  // Les caractères de commande n'ont rien à faire dans un texte d'enseigne, et
  // ils sont le vecteur habituel des adresses fabriquées.
  const propre = v.replace(/[\u0000-\u001f\u007f]/g, '');
  return propre.length <= MAX_CARACTERES ? propre : null;
};

/** base64url — l'adresse ne doit contenir ni `+`, ni `/`, ni `=`. */
function enBase64Url(s: string): string {
  const octets = new TextEncoder().encode(s);
  let brut = '';
  for (const o of octets) brut += String.fromCharCode(o);
  return btoa(brut).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(s: string): string | null {
  try {
    const rempli = s.replace(/-/g, '+').replace(/_/g, '/');
    const brut = atob(rempli + '='.repeat((4 - (rempli.length % 4)) % 4));
    const octets = new Uint8Array(brut.length);
    for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
    return new TextDecoder().decode(octets);
  } catch {
    return null;
  }
}

export interface JetonPartage {
  jeton: string;
  /** Le logo n'y est PAS : à dire au client, pas à taire. */
  logoOmis: boolean;
}

/**
 * Encode une configuration en jeton d'adresse.
 *
 * Rend `null` si le jeton dépasse la borne : mieux vaut pas de lien qu'un lien
 * qui sera tronqué par une messagerie et qui ouvrira sur un néon vierge.
 */
export function configVersJeton(config: NeonConfiguration): JetonPartage | null {
  const utile: Record<string, unknown> = {
    v: VERSION_JETON,
    k: config.kind,
    h: config.letterHeightCm,
    c: config.colorMode,
    s: config.support,
    e: config.environment,
    r: config.powerRegion,
    m: config.mounting,
    o: config.options,
    l: config.lines.map((x) => ({ t: x.text, f: x.fontId, c: x.colorHex, s: x.tubeSku })),
  };
  if (config.sizeCm) utile.d = config.sizeCm;
  if (config.boxDepthCm) utile.p = config.boxDepthCm;
  if (config.panel) utile.pa = config.panel;
  if (config.boxSign) utile.bo = config.boxSign;

  const jeton = enBase64Url(JSON.stringify(utile));
  if (jeton.length > MAX_OCTETS_JETON) return null;
  return { jeton, logoOmis: Boolean(config.logo) };
}

/**
 * Relit un jeton. `null` dès qu'un champ ne tient pas — jamais une
 * configuration à moitié valide.
 */
export function jetonVersConfig(jeton: string): NeonConfiguration | null {
  if ('string' !== typeof jeton || !jeton || jeton.length > MAX_OCTETS_JETON) return null;
  const texte = deBase64Url(jeton);
  if (null === texte) return null;

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!brut || 'object' !== typeof brut) return null;
  const o = brut as Record<string, unknown>;
  if (o.v !== VERSION_JETON) return null;

  const hauteur = nombreBorne(o.h, MIN_HAUTEUR_CM, MAX_HAUTEUR_CM);
  if (null === hauteur) return null;

  if (!Array.isArray(o.l) || 0 === o.l.length || o.l.length > MAX_LIGNES) return null;
  const lignes: NeonLine[] = [];
  for (const e of o.l as Array<Record<string, unknown>>) {
    if (!e || 'object' !== typeof e) return null;
    const t = texteBorne(e.t);
    if (null === t) return null;
    if ('string' !== typeof e.f || e.f.length > 40) return null;
    if ('string' !== typeof e.c || !HEX.test(e.c)) return null;
    if (undefined !== e.s && ('string' !== typeof e.s || e.s.length > 60)) return null;
    lignes.push({
      text: t,
      fontId: e.f,
      colorHex: e.c,
      ...(e.s ? { tubeSku: e.s as string } : {}),
    } as NeonLine);
  }

  const s = o.s as Record<string, unknown> | undefined;
  if (!s || 'string' !== typeof s.type || 'string' !== typeof s.finish) return null;
  const opts = o.o as Record<string, unknown> | undefined;

  const config: NeonConfiguration = {
    kind: 'text',
    lines: lignes,
    letterHeightCm: hauteur,
    colorMode: 'rgb' === o.c ? 'rgb' : 'solid',
    support: { type: s.type, finish: s.finish },
    environment: 'outdoor' === o.e ? 'outdoor' : 'indoor',
    powerRegion: o.r,
    mounting: o.m,
    options: {
      dimmerRemote: Boolean(opts?.dimmerRemote),
      express: Boolean(opts?.express),
    },
  } as NeonConfiguration;

  const d = o.d as Record<string, unknown> | undefined;
  if (d) {
    const w = nombreBorne(d.widthCm, 1, 1000);
    const h = nombreBorne(d.heightCm, 1, 1000);
    if (null === w || null === h) return null;
    config.sizeCm = { widthCm: w, heightCm: h };
  }
  const p = nombreBorne(o.p, 1, 100);
  if (undefined !== o.p) {
    if (null === p) return null;
    config.boxDepthCm = p;
  }
  if (o.pa) config.panel = o.pa as NeonConfiguration['panel'];
  if (o.bo) config.boxSign = o.bo as NeonConfiguration['boxSign'];

  return config;
}
