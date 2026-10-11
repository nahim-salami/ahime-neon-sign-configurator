/**
 * Catalogue par défaut du widget — polices, couleurs, tailles, supports,
 * finitions, fonds, familles et matières.
 *
 * CE N'EST PLUS UNE DÉMONSTRATION : ces valeurs sont celles que voit le client
 * d'un marchand qui n'a rien réglé, donc elles sont livrées. Le marchand les
 * remplace depuis son back-office et le plugin les sert par sa REST locale ;
 * les formes de données sont celles de @neon/core, des deux côtés.
 *
 * Ce qui reste à faire ici est nommé dans docs/39 : chaque couleur doit
 * pointer vers une RÉFÉRENCE DE TUBE commandable (E02) et chaque police
 * afficher sa hauteur minimale de fabrication (B02) — aujourd'hui une couleur
 * n'est qu'un hexadécimal, que l'atelier ne peut pas commander.
 */

import type { FontClass, SupportFinish, SupportType } from '@neon/core';
// Métriques des polices EMBARQUÉES uniquement : le pack complet est servi
// par le plugin et transmis dans le contexte hôte (voir runtime-fonts.ts).
import manifestsJson from './generated/font-metrics-builtin.json';
import type { FontMetricsManifest } from '@neon/core';

export const MANIFESTS = manifestsJson as unknown as Record<string, FontMetricsManifest>;

export interface FontEntry {
  id: string;
  label: string;
  class: FontClass;
  cssFamily: string;
  weight: number;
}

/** Polices embarquées (mesurées par le pipeline — voir packages/core/fonts). */
export const FONTS: FontEntry[] = [
  { id: 'pacifico', label: 'Pacifico', class: 'script', cssFamily: 'NeonPacifico', weight: 400 },
  { id: 'great-vibes', label: 'Great Vibes', class: 'script', cssFamily: 'NeonGreatVibes', weight: 400 },
  { id: 'lobster', label: 'Lobster', class: 'script', cssFamily: 'NeonLobster', weight: 400 },
  { id: 'poppins-bold', label: 'Poppins', class: 'block', cssFamily: 'NeonPoppins', weight: 700 },
  { id: 'bebas-neue', label: 'Bebas', class: 'block', cssFamily: 'NeonBebas', weight: 400 },
];

export const FONT_CLASS_BY_ID: Record<string, FontClass> = Object.fromEntries(
  FONTS.map((f) => [f.id, f.class]),
);

/** 15 couleurs de tube (allumé) — palette du marché. */
/*
 * `sku` optionnel : la palette LIVRÉE n'en déclare pas — elle décrit des
 * couleurs, pas des références d'approvisionnement, et le diamètre du tube est
 * alors celui du réglage de boutique. C'est le marchand qui, en réglant sa
 * propre palette, désigne ses bobines et ouvre le Ø 8 (écart E28).
 */
export const NEON_COLORS: Array<{ hex: string; label: string; sku?: string }> = [
  { hex: '#fff6e0', label: 'Blanc chaud' },
  { hex: '#ffffff', label: 'Blanc froid' },
  { hex: '#ff2d95', label: 'Rose' },
  { hex: '#ff5aa7', label: 'Rose clair' },
  { hex: '#ff1f1f', label: 'Rouge' },
  { hex: '#ff7a1a', label: 'Orange' },
  { hex: '#ffd60a', label: 'Jaune' },
  { hex: '#b4ff39', label: 'Vert citron' },
  { hex: '#2dff6e', label: 'Vert' },
  { hex: '#19e6c1', label: 'Turquoise' },
  { hex: '#33d1ff', label: 'Bleu glacier' },
  { hex: '#2979ff', label: 'Bleu' },
  { hex: '#7b5bff', label: 'Violet' },
  { hex: '#c05bff', label: 'Lilas' },
  { hex: '#ff9ad5', label: 'Rose pastel' },
];

/** Presets de taille : hauteur de lettre (cm) — la largeur est calculée. */
export const SIZE_PRESETS: Array<{ id: string; label: string; letterHeightCm: number }> = [
  { id: 'S', label: 'S', letterHeightCm: 12 },
  { id: 'M', label: 'M', letterHeightCm: 18 },
  { id: 'L', label: 'L', letterHeightCm: 25 },
  { id: 'XL', label: 'XL', letterHeightCm: 35 },
];

export const SUPPORT_TYPES: Array<{ id: SupportType; label: string }> = [
  { id: 'contour', label: 'Contour' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'cut-to-letter', label: 'À la lettre' },
  { id: 'box', label: 'Caisson' },
];

export const SUPPORT_FINISHES: Array<{ id: SupportFinish; label: string; swatch: string }> = [
  { id: 'clear', label: 'Transparent', swatch: 'linear-gradient(135deg,#e8eef5,#cfd8e3)' },
  { id: 'black', label: 'Noir', swatch: '#15171c' },
  { id: 'white', label: 'Blanc', swatch: '#f5f5f5' },
  { id: 'colored', label: 'Coloré', swatch: 'linear-gradient(135deg,#ff9ad5,#7b5bff)' },
  { id: 'mirror', label: 'Miroir', swatch: 'linear-gradient(135deg,#f3f6f9,#9aa7b5 55%,#e8edf2)' },
  { id: 'printed-uv', label: 'Imprimé', swatch: 'linear-gradient(135deg,#ffd60a,#ff2d95,#2979ff)' },
];

/**
 * UN FOND DE LIEU EST UNE IMAGE, PAS UN EMPILEMENT DE DÉGRADÉS.
 *
 * Les fonds de MATIÈRE — brique, papier millimétré, plâtre, verre — se décrivent
 * très bien en CSS : trois lignes, zéro octet, et la matière est juste. Un LIEU,
 * non. Un accueil d'entreprise a une banque en L, un fauteuil, un écran, une
 * jardinière et un panneau de bois ; dessiné en dégradés, cela donne une bande
 * verte et deux rectangles — et c'est exactement ce que le marchand a renvoyé.
 *
 * L'image vient de NOTRE PROPRE 3D, photographiée sans son enseigne par
 * `scripts/capturer-les-fonds-3d.mjs`. Les deux vues montrent donc la même
 * chose, et pour une raison qui ne peut pas dériver : c'est la même scène.
 *
 * ELLE N'EST PAS DANS LE BUNDLE, pour la même raison que les modèles 3D : elle
 * voyage à côté du composant et n'est demandée que par le décor qui s'en sert.
 * Et l'adresse se découpe à la main plutôt que par `new URL(..., import.meta.url)`
 * — Vite reconnaît ce motif et le remplace à la construction par une table des
 * fichiers présents sur le disque, table vide ici puisque les images sont
 * recopiées après, par `scripts/build-site.py`.
 *
 * SI ELLE N'ARRIVE PAS, le calque suivant s'affiche : chaque lieu garde derrière
 * son image un fond dessiné, plus pauvre mais jamais vide.
 */
function fondPresDuModule(fichier: string): string {
  try {
    const ici = import.meta.url;
    const base = ici.slice(0, ici.lastIndexOf('/') + 1) + 'objets/' + fichier;
    return `url("${base}") center / cover no-repeat`;
  } catch {
    return '';
  }
}

export const BACKGROUNDS: Array<{ id: string; label: string; css: string }> = [
  {
    id: 'dark',
    label: 'Sombre',
    // Mur de studio : une lumière douce tombe du haut-gauche, le reste plonge.
    css: 'radial-gradient(120% 85% at 32% 16%, #272b34 0%, #171a20 46%, #0c0e12 100%)',
  },
  {
    id: 'brick',
    label: 'Brique',
    // Vraies briques en QUINCONCE (le motif classique à 4 dégradés décalés),
    // pas une grille : chaque rang est décalé d'une demi-brique, les arêtes
    // sombres dessinent le joint. Par-dessus, la pénombre du soir.
    css: [
      'linear-gradient(rgba(16,9,8,.58), rgba(12,7,6,.76)) 0 0/100% 100%',
      'linear-gradient(335deg, rgba(0,0,0,.32) 23px, transparent 23px) 0 2px/58px 58px repeat',
      'linear-gradient(155deg, rgba(0,0,0,.32) 23px, transparent 23px) 4px 35px/58px 58px repeat',
      'linear-gradient(335deg, rgba(0,0,0,.32) 23px, transparent 23px) 29px 31px/58px 58px repeat',
      'linear-gradient(155deg, rgba(0,0,0,.32) 23px, transparent 23px) 34px 6px/58px 58px repeat',
    ].join(', ') + ', #5d3b2f',
  },
  {
    id: 'room',
    label: 'Chambre',
    // Chambre au crépuscule : mur mauve qui fonce vers le sol, et la flaque
    // chaude d'une lampe de chevet en bas à droite.
    css: [
      'radial-gradient(55% 42% at 78% 88%, rgba(255,186,120,.13), transparent 65%) 0 0/100% 100%',
      'linear-gradient(180deg, #474060 0%, #322c47 58%, #262138 82%, #1b1830 100%) 0 0/100% 100%',
    ].join(', '),
  },
];

/**
 * DÉCORS CONNUS MAIS NON PROPOSÉS PAR DÉFAUT.
 *
 * `BACKGROUNDS` est la liste offerte à toute boutique ; y ajouter une entrée
 * la ferait apparaître partout. Certains décors, eux, existent sans être
 * offerts : le mur crème est celui de la peau Maison Lumière, et une boutique
 * peut le demander par son identifiant via `ctx.scenes`.
 *
 * Ils vivent ici parce que **la 2D et la 3D doivent lire le même livre**. Le
 * mur crème n'était écrit qu'en dur dans la peau Maison : une boutique qui
 * demandait `{ id: 'salon' }` recevait donc un mur crème en 3D et un mur
 * SOMBRE en 2D, les deux vues montrant deux lieux différents. Le banc
 * `verifier-les-decors.mjs` compare désormais les teintes des deux côtés, et
 * c'est lui qui a trouvé l'écart.
 *
 * Ce fichier ne dépend pas de three.js — comme `spec.ts`, et pour la même
 * raison : l'aperçu 2D ne doit pas télécharger la 3D pour connaître un décor.
 */
export const EXTRA_BACKGROUNDS: Array<{ id: string; label: string; css: string }> = [
  {
    /*
     * LE MUR CRÈME S'APPELAIT « salon », ET C'ÉTAIT UNE CONFUSION.
     *
     * Il existe une peau « Le Salon », et c'est un SALON DE COIFFURE — rose
     * poudré, laiton rose, moulures. Deux lieux qui n'ont rien à voir ne
     * peuvent pas partager un identifiant : le mur crème porte donc le nom de
     * sa peau, `maison`, et `salon` est rendu à ce qu'il désigne.
     */
    id: 'maison',
    label: 'Mur crème',
    // Un crème traversé d'un rai de jour — le mur de la maquette Maison.
    css: [
      'linear-gradient(100deg, rgba(255, 250, 235, .55) 0%, transparent 46%)',
      'linear-gradient(180deg, #efe8dc 0%, #e9e1d2 68%, #e2d8c6 100%)',
    ].join(', '),
  },
  {
    id: 'salon',
    label: 'Salon',
    // Rose poudré et moulures — les couleurs de `prototypes/salon.html`.
    css: [
      'radial-gradient(70% 50% at 50% 12%, rgba(255,255,255,.55), transparent 66%)',
      'linear-gradient(180deg, #fdf6f4 0%, #f6e3e7 62%, #edd9dc 100%)',
    ].join(', '),
  },
  {
    id: 'bureau',
    label: 'Bureau',
    // Mur gris-bleu de bureau, lumière de fenêtre venant de la gauche.
    css: [
      'linear-gradient(105deg, rgba(255,255,255,.42) 0%, transparent 52%)',
      'linear-gradient(180deg, #a8b2bf 0%, #99a3b0 62%, #8b95a3 100%)',
    ].join(', '),
  },
  {
    id: 'comptoir',
    label: 'Comptoir',
    // Feutrine verte et lueur de laiton — la caisse d'une belle boutique.
    css: [
      'radial-gradient(60% 45% at 50% 82%, rgba(193,154,91,.20), transparent 70%)',
      'linear-gradient(180deg, #24352b 0%, #1a281f 64%, #101a15 100%)',
    ].join(', '),
  },
  {
    id: 'atelier',
    label: 'Atelier',
    // Panneau perforé : le pas de 25 mm est dessiné, pas suggéré — c'est la
    // même graduation qu'en 3D, et elle doit se retrouver dans les deux vues.
    css: [
      'radial-gradient(circle at 6px 6px, rgba(40,30,18,.55) 1.6px, transparent 1.8px) 0 0/12px 12px',
      'linear-gradient(180deg, #bc9670 0%, #a8845a 66%, #8e7048 100%)',
    ].join(', '),
  },
  {
    id: 'etabli',
    label: 'Établi',
    // Papier millimétré : carreau fin, trait renforcé tous les cinq.
    css: [
      'repeating-linear-gradient(0deg, rgba(46,90,140,.30) 0 1px, transparent 1px 40px)',
      'repeating-linear-gradient(90deg, rgba(46,90,140,.30) 0 1px, transparent 1px 40px)',
      'repeating-linear-gradient(0deg, rgba(46,90,140,.16) 0 1px, transparent 1px 8px)',
      'repeating-linear-gradient(90deg, rgba(46,90,140,.16) 0 1px, transparent 1px 8px)',
      'linear-gradient(180deg, #f7f4ea 0%, #f1ede1 100%)',
    ].join(', '),
  },
  {
    id: 'vitrine',
    label: 'Vitrine',
    // Plein jour derrière un vitrage : clair, froid, presque sans matière.
    css: [
      'linear-gradient(110deg, rgba(255,255,255,.7) 0%, transparent 44%)',
      'linear-gradient(180deg, #f6f5fa 0%, #e9ebf2 70%, #dfe2ea 100%)',
    ].join(', '),
  },
  {
    id: 'lobby',
    label: 'Lobby',
    // Bois sombre et laiton — la fiche d'un professionnel.
    css: [
      'radial-gradient(55% 40% at 50% 20%, rgba(201,169,97,.18), transparent 68%)',
      'linear-gradient(180deg, #3d2e20 0%, #2a1f16 62%, #1a120c 100%)',
    ].join(', '),
  },
  {
    id: 'nuit',
    label: 'Nuit',
    // L'Atelier Nuit et la Story : la pénombre, et deux accents qui la teintent.
    css: [
      'radial-gradient(60% 50% at 26% 18%, rgba(139,92,246,.20), transparent 66%)',
      'radial-gradient(50% 40% at 82% 76%, rgba(34,211,238,.12), transparent 70%)',
      'linear-gradient(180deg, #1e2030 0%, #12141d 58%, #07080d 100%)',
    ].join(', '),
  },
  {
    id: 'papier',
    label: 'Papier',
    // La Lettre : un mur, rien d'autre, et c'est le propos.
    css: 'linear-gradient(180deg, #faf7f0 0%, #f2eee3 66%, #eae3d4 100%)',
  },
  {
    id: 'barbier',
    label: 'Barbier',
    css: [
      // Le miroir vit dans styles.ts, comme celui du Salon. Ici : mur de
      // barbier, soubassement sombre et enseigne tricolore.
      'repeating-linear-gradient(135deg, #b6232c 0 9px, #f4eee4 9px 18px, #214a72 18px 27px) 8% 38%/18px 36% no-repeat',
      'linear-gradient(180deg, transparent 0 78%, #17251d 78% 100%)',
      'repeating-linear-gradient(90deg, transparent 0 120px, rgba(215,188,128,.06) 120px 122px)',
      'radial-gradient(70% 48% at 50% 22%, rgba(214,190,135,.13), transparent 70%)',
      'linear-gradient(180deg, #284836 0%, #1c3528 62%, #12241a 100%)',
    ].join(', '),
  },
  {
    id: 'institut',
    label: 'Institut',
    css: [
      // Cabine de soin mate : aucun blanc pur, pour que le néon reste le point
      // lumineux et que l'interface n'aveugle pas.
      'radial-gradient(ellipse at 50% 80%, #bdb3aa 0 21%, transparent 22%) center 91%/58% 18% no-repeat',
      'linear-gradient(180deg, #e5ded8, #cfc5bd) center 84%/46% 12% no-repeat',
      'linear-gradient(90deg, #bca99c 0 8%, transparent 8% 22%, #9fb5aa 22% 30%, transparent 30% 44%, #c9a8aa 44% 52%, transparent 52%) 82% 48%/24% 4% no-repeat',
      'linear-gradient(#9e8b7d, #9e8b7d) 82% 53%/24% 1% no-repeat',
      'radial-gradient(ellipse at 50% 100%, rgba(238,229,219,.42) 0 42%, transparent 43%) center 12%/56% 55% no-repeat',
      'linear-gradient(110deg, rgba(255,248,238,.18) 0%, transparent 48%)',
      'linear-gradient(180deg, #d9d0c8 0%, #c9beb5 62%, #b7aca4 100%)',
    ].join(', '),
  },
  {
    id: 'cuisine',
    label: 'Cuisine',
    css: [
      'repeating-linear-gradient(90deg, #d7d2c8 0 1px, transparent 1px 72px) 0 36%/100% 28% no-repeat',
      'repeating-linear-gradient(0deg, #d7d2c8 0 1px, transparent 1px 54px) 0 36%/100% 28% no-repeat',
      'linear-gradient(90deg, #c7b89f 0 24%, #ece8df 24% 48%, #c7b89f 48% 72%, #ece8df 72%) center bottom/86% 23% no-repeat',
      'linear-gradient(#8c7255, #6c553e) center 77%/92% 3% no-repeat',
      'radial-gradient(ellipse at 50% 100%, #78906c 0 38%, transparent 40%) 88% 65%/12% 22% no-repeat',
      'linear-gradient(180deg, #f2f0e9 0%, #e6e3da 62%, #dcd9cf 100%)',
    ].join(', '),
  },
  {
    id: 'bar',
    label: 'Bar',
    css: [
      'repeating-linear-gradient(90deg, transparent 0 44px, rgba(218,177,95,.55) 44px 48px, transparent 48px 92px) center 38%/72% 30% no-repeat',
      'linear-gradient(#8d6437, #5f3c21) center 55%/78% 3% no-repeat',
      'radial-gradient(circle, #d6b56b 0 18%, transparent 20%) center 22%/52% 35% no-repeat',
      'linear-gradient(180deg, #81502b, #3f281b) center bottom/94% 25% no-repeat',
      'repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 90px) center bottom/94% 25% no-repeat',
      'linear-gradient(180deg, #33251a 0%, #241a12 62%, #140f0a 100%)',
    ].join(', '),
  },
  {
    id: 'epicerie',
    label: 'Épicerie',
    css: [
      'repeating-linear-gradient(90deg, #765839 0 3px, transparent 3px 90px) center 38%/88% 42% no-repeat',
      'repeating-linear-gradient(0deg, transparent 0 58px, #765839 58px 62px) center 38%/88% 42% no-repeat',
      'radial-gradient(circle, #b94732 0 28%, transparent 30%) 15% 42%/38px 38px repeat',
      'linear-gradient(180deg, #b49368, #8b6945) center bottom/74% 22% no-repeat',
      'repeating-linear-gradient(90deg, rgba(69,45,24,.28) 0 2px, transparent 2px 74px) center bottom/74% 22% no-repeat',
      'linear-gradient(180deg, #e2d2b4 0%, #d1bd99 62%, #c0ac8a 100%)',
    ].join(', '),
  },
  {
    id: 'beton',
    label: 'Béton',
    css: [
      'radial-gradient(circle at 18% 22%, rgba(255,255,255,.12) 0 2px, transparent 3px)',
      'radial-gradient(circle at 74% 58%, rgba(30,32,35,.16) 0 2px, transparent 3px)',
      'repeating-linear-gradient(90deg, transparent 0 32%, rgba(40,42,46,.16) 32% 32.3%)',
      'linear-gradient(180deg, #7b7d83 0%, #666a70 62%, #55575c 100%)',
    ].join(', '),
  },
  {
    id: 'planches',
    label: 'Planches',
    css: [
      'repeating-linear-gradient(90deg, rgba(45,29,16,.38) 0 3px, transparent 3px 64px)',
      'repeating-linear-gradient(0deg, transparent 0 24px, rgba(255,235,196,.10) 25px 26px, transparent 27px 52px)',
      'radial-gradient(ellipse, rgba(54,34,18,.22) 0 12%, transparent 14%) 20px 14px/110px 56px repeat',
      'linear-gradient(180deg, #9a7850 0%, #836244 62%, #6b5335 100%)',
    ].join(', '),
  },
  {
    id: 'calque',
    label: 'Calque',
    css: [
      'repeating-linear-gradient(0deg, rgba(46,90,140,.18) 0 1px, transparent 1px 20px)',
      'repeating-linear-gradient(90deg, rgba(46,90,140,.18) 0 1px, transparent 1px 20px)',
      'linear-gradient(165deg, transparent 0 49.5%, rgba(42,84,128,.36) 49.7% 50%, transparent 50.2%)',
      'linear-gradient(15deg, transparent 0 49.5%, rgba(42,84,128,.22) 49.7% 50%, transparent 50.2%)',
      'linear-gradient(180deg, #e6eff4 0%, #d7e2ea 62%, #c9d4dc 100%)',
    ].join(', '),
  },
  {
    id: 'ardoise',
    label: 'Ardoise',
    css: [
      'linear-gradient(8deg, transparent 0 47%, rgba(224,232,222,.13) 47.5% 48%, transparent 48.5%)',
      'linear-gradient(-5deg, transparent 0 61%, rgba(224,232,222,.10) 61.5% 62%, transparent 62.5%)',
      'radial-gradient(ellipse at 30% 30%, rgba(230,240,235,.12), transparent 42%)',
      'linear-gradient(#9d7c4c, #66482d) center 86%/72% 2% no-repeat',
      'linear-gradient(180deg, #333b37 0%, #252b28 62%, #161a18 100%)',
    ].join(', '),
  },
  {
    id: 'rue',
    label: 'Rue',
    css: [
      'linear-gradient(90deg, rgba(255,255,255,.75) 0 2%, rgba(154,174,196,.45) 2% 4%, transparent 4% 32%, rgba(154,174,196,.45) 32% 34%, rgba(255,255,255,.65) 34% 36%, transparent 36%) center 28%/70% 52% no-repeat',
      'linear-gradient(180deg, transparent 0 72%, #aeb5bd 72% 75%, #747b83 75% 100%)',
      'repeating-linear-gradient(90deg, transparent 0 120px, rgba(255,255,255,.35) 120px 124px) center bottom/100% 25% no-repeat',
      'linear-gradient(180deg, #eef0f5 0%, #d6dde6 62%, #bfcbd8 100%)',
    ].join(', '),
  },
  {
    id: 'podium',
    label: 'Podium',
    css: [
      'radial-gradient(ellipse at 50% 100%, #ffffff 0 29%, #d9dce2 30% 38%, transparent 39%) center bottom/66% 31% no-repeat',
      'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.95) 0 8%, rgba(255,255,255,.28) 30%, transparent 62%) center top/70% 88% no-repeat',
      'linear-gradient(90deg, transparent 0 18%, #c9ccd3 18% 18.5%, transparent 18.5% 81.5%, #c9ccd3 81.5% 82%, transparent 82%)',
      'linear-gradient(180deg, #f1f2f5 0%, #e6e8ec 62%, #dadde2 100%)',
    ].join(', '),
  },
  {
    id: 'reception',
    label: 'Réception',
    css: [
      'linear-gradient(90deg, transparent 0 12%, rgba(201,169,97,.55) 12% 12.5%, transparent 12.5% 87.5%, rgba(201,169,97,.55) 87.5% 88%, transparent 88%)',
      'linear-gradient(180deg, #785a3d, #3f2d20) center bottom/64% 25% no-repeat',
      'linear-gradient(90deg, rgba(201,169,97,.5) 0 1px, transparent 1px 82px) center bottom/64% 25% no-repeat',
      'radial-gradient(circle, rgba(242,210,137,.32), transparent 66%) center 20%/42% 35% no-repeat',
      'linear-gradient(180deg, #63503c 0%, #4a3a2b 62%, #34291e 100%)',
    ].join(', '),
  },
  {
    id: 'conseil',
    label: 'Salle de conseil',
    css: [
      'radial-gradient(ellipse at 50% 100%, #6b4c31 0 34%, #3a291d 35% 43%, transparent 44%) center bottom/82% 32% no-repeat',
      'repeating-linear-gradient(90deg, transparent 0 70px, rgba(201,169,97,.22) 70px 72px) center 30%/78% 48% no-repeat',
      'linear-gradient(#76583a, #4f3928) center 54%/82% 2% no-repeat',
      'radial-gradient(circle, rgba(242,210,137,.26), transparent 65%) center 14%/54% 38% no-repeat',
      'linear-gradient(180deg, #463726 0%, #2f2519 62%, #1c1610 100%)',
    ].join(', '),
  },
  {
    id: 'club',
    label: 'Club',
    css: [
      'repeating-linear-gradient(90deg, transparent 0 12%, rgba(139,92,246,.12) 12% 12.5%)',
      'radial-gradient(circle at 20% 18%, rgba(139,92,246,.45), transparent 32%)',
      'radial-gradient(circle at 82% 72%, rgba(34,211,238,.25), transparent 34%)',
      'linear-gradient(180deg, transparent 0 76%, #080611 76% 100%)',
      'linear-gradient(180deg, #2b1f47 0%, #18112b 62%, #0a0714 100%)',
    ].join(', '),
  },
  {
    id: 'beton-nuit',
    label: 'Béton de nuit',
    css: [
      'radial-gradient(circle at 34% 16%, rgba(223,230,242,.18), transparent 34%)',
      'repeating-linear-gradient(90deg, transparent 0 31%, rgba(190,198,210,.08) 31% 31.3%)',
      'radial-gradient(circle at 18% 62%, rgba(0,0,0,.22) 0 2px, transparent 3px)',
      'linear-gradient(180deg, transparent 0 78%, #111318 78% 100%)',
      'linear-gradient(180deg, #3b3e45 0%, #22252a 62%, #0e1013 100%)',
    ].join(', '),
  },
  /*
   * ACCUEIL — la banque d'accueil d'un espace de travail.
   *
   * L'enseigne de bâtiment ne se pose pas que sur un toit : le MÊME logo est
   * repris derrière la banque d'accueil, et c'est là qu'un visiteur le lit de
   * près. C'est ce que montrent les deux photos de référence du marchand, et
   * ce que « Béton de nuit » ne montrait pas — un mur de béton la nuit n'est
   * ni un bureau ni un hall.
   *
   * Les calques, de devant vers l'arrière : le plateau de la banque, son
   * corps, la jardinière et ses feuilles, le panneau de bois à gauche, le mur.
   */
  {
    id: 'accueil',
    label: 'Accueil',
    css: [
      // La photo de la 3D — et, dessous, le dessin d'origine en repli.
      fondPresDuModule('fond-accueil.jpg'),
      // Le plateau de la banque, et le corps blanc dessous.
      'linear-gradient(180deg, #fbfaf8 0 3px, #e8e5df 3px 8px, transparent 8px) 0 74%/100% 26% no-repeat',
      'linear-gradient(96deg, rgba(0,0,0,.06) 0%, transparent 26%, transparent 70%, rgba(0,0,0,.09) 100%) 0 100%/100% 26% no-repeat',
      'linear-gradient(180deg, #f7f5f2 0%, #e6e2da 100%) 0 100%/100% 26% no-repeat',
      /* LA JARDINIÈRE. Deux trames de lames plutôt qu'une : la même largeur
         répétée donnait une palissade, et une palissade n'est pas une plante.
         Deux périodes qui ne tombent pas juste l'une sur l'autre (13 et 9 px),
         deux verts, et un léger biais — l'œil y lit un feuillage sans compter
         les feuilles. */
      'repeating-linear-gradient(93deg, transparent 0 4px, #4e7f4a 4px 7px, transparent 7px 13px) 0 66%/100% 9% no-repeat',
      'repeating-linear-gradient(87deg, transparent 0 3px, #3c6b3f 3px 5px, transparent 5px 9px) 0 68%/100% 7% no-repeat',
      'linear-gradient(180deg, #8a6a45 0%, #6d5133 100%) 0 74%/100% 3.5% no-repeat',
      // Le panneau de bois, à gauche, du sol au plafond — le chêne clair des
      // deux photos, et non l'acajou vers lequel une première valeur tirait.
      'repeating-linear-gradient(90deg, rgba(120,84,48,.13) 0 2px, transparent 2px 26px) 0 0/26% 100% no-repeat',
      'linear-gradient(180deg, #dcbe93 0%, #c4a271 100%) 0 0/26% 100% no-repeat',
      // Le mur, chaud et presque blanc, avec la nappe des spots au plafond.
      'radial-gradient(70% 45% at 55% 0%, rgba(255,247,235,.85), transparent 70%) 0 0/100% 100% no-repeat',
      'linear-gradient(180deg, #edeae4 0%, #e4e0d8 62%, #d8d3c9 100%) 0 0/100% 100% no-repeat',
    ].join(', '),
  },
  /*
   * HALL — l'accueil d'un immeuble de bureaux : cloison vitrée, moquette
   * grise, banque blanche. Le pendant sobre du précédent, et la seconde photo
   * de référence.
   */
  {
    id: 'hall-bureaux',
    label: 'Hall',
    css: [
      fondPresDuModule('fond-hall.jpg'),
      'linear-gradient(180deg, #ffffff 0 3px, #e9e9e6 3px 8px, transparent 8px) 0 72%/100% 28% no-repeat',
      'linear-gradient(96deg, rgba(0,0,0,.05) 0%, transparent 26%, transparent 70%, rgba(0,0,0,.08) 100%) 0 100%/100% 28% no-repeat',
      'linear-gradient(180deg, #fbfbf9 0%, #e9e9e5 100%) 0 100%/100% 28% no-repeat',
      // La moquette, entre la banque et le mur.
      'linear-gradient(180deg, #56585c 0%, #45474b 100%) 0 72%/100% 8% no-repeat',
      // La cloison vitrée, à gauche : montants clairs et verre dépoli.
      'repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 3px, rgba(206,220,228,.34) 3px 46px) 0 0/30% 100% no-repeat',
      // Le mur blanc et la nappe froide des dalles de plafond.
      'radial-gradient(75% 40% at 52% 0%, rgba(255,255,255,.9), transparent 72%) 0 0/100% 100% no-repeat',
      'linear-gradient(180deg, #f3f4f5 0%, #eaebec 60%, #dfe1e4 100%) 0 0/100% 100% no-repeat',
    ].join(', '),
  },
  {
    id: 'gratte-ciel',
    label: 'Gratte-ciel',
    // La trame d'une façade de nuit : des fenêtres, dont quelques-unes
    // allumées. Le module dessiné ici est celui de la 3D.
    css: [
      'repeating-linear-gradient(90deg, rgba(255,212,137,.10) 0 14px, transparent 14px 34px)',
      'repeating-linear-gradient(0deg, rgba(0,0,0,.42) 0 6px, transparent 6px 38px)',
      'linear-gradient(180deg, #2a2f38 0%, #1a1f26 62%, #090c12 100%)',
    ].join(', '),
  },
  {
    id: 'lin',
    label: 'Lin',
    css: [
      'repeating-linear-gradient(90deg, rgba(110,91,67,.055) 0 1px, transparent 1px 4px)',
      'repeating-linear-gradient(0deg, rgba(110,91,67,.045) 0 1px, transparent 1px 5px)',
      'linear-gradient(102deg, rgba(255,250,240,.5) 0%, transparent 48%)',
      'linear-gradient(180deg, #f4ecdd 0%, #eae2d2 62%, #e0d8c8 100%)',
    ].join(', '),
  },
  {
    id: 'platre',
    label: 'Plâtre',
    css: [
      'radial-gradient(circle at 22% 34%, rgba(120,115,105,.06) 0 1px, transparent 2px)',
      'radial-gradient(circle at 71% 63%, rgba(120,115,105,.05) 0 1px, transparent 2px)',
      'linear-gradient(104deg, rgba(255,255,253,.5) 0%, transparent 48%)',
      'linear-gradient(180deg, #f4f3f0 0%, #e9e7e3 62%, #dedcd8 100%)',
    ].join(', '),
  },
];

/** Cherche un décor par identifiant, offert par défaut ou non. */
export const findBackground = (id: string) =>
  BACKGROUNDS.find((b) => b.id === id) ?? EXTRA_BACKGROUNDS.find((b) => b.id === id);

// ---------------------------------------------------------------------------
// Panneaux et caissons
// ---------------------------------------------------------------------------

/** Les trois familles, dans l'ordre où on les propose. */
export const FAMILIES = [
  { id: 'neon', label: 'Néon', hint: 'Texte ou logo en tube LED' },
  { id: 'panel', label: 'Panneau & lettres 3D', hint: 'Acrylique, bois, métal et supports multicouches' },
  { id: 'boxSign', label: 'Caisson lumineux', hint: 'Boîte éclairée de l’intérieur' },
] as const;

export const PANEL_MATERIALS = [
  { id: 'pvc', label: 'PVC expansé', hint: 'Léger, économique', css: '#eceef1' },
  { id: 'dibond', label: 'Dibond', hint: 'Aluminium composite, très plan', css: '#c9ced6' },
  { id: 'aluminium', label: 'Aluminium', hint: 'Rigide, haut de gamme', css: '#b9c0c9' },
  { id: 'plexi', label: 'Plexiglas', hint: 'Translucide, brillant', css: '#dfe9f2' },
  { id: 'bois', label: 'Bois', hint: 'Chaleureux : intérieur seulement', css: '#c8a273' },
] as const;

export const PANEL_FINISHES = [
  { id: 'raw', label: 'Brut', hint: 'Juste découpé' },
  { id: 'printed', label: 'Imprimé', hint: 'Impression numérique directe' },
  { id: 'printed-lam', label: 'Imprimé + verni', hint: 'Anti-UV, pour l’extérieur' },
  { id: 'letters', label: 'Lettres relief', hint: 'Découpées et collées' },
  { id: 'engraved', label: 'Gravé', hint: 'Gravure mécanique' },
] as const;

export const PANEL_CUTS = [
  { id: 'rect', label: 'Rectangle', hint: 'Coupe droite' },
  { id: 'rounded', label: 'Angles arrondis', hint: 'Plus doux, plus sûr' },
  { id: 'shape', label: 'Forme libre', hint: 'Suivi de votre tracé' },
] as const;
