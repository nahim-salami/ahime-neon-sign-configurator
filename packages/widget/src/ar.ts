/**
 * LE LOT DE LA RÉALITÉ AUGMENTÉE — chargé au clic, jamais avant.
 *
 * `realite-augmentee-widget` §6 : quatre lots, pas trois. Le widget 2D pour
 * tout le monde, la vue 3D au clic sur « 3D », les exportateurs au clic sur
 * « télécharger », **la RA au clic sur « voir chez moi », et sur mobile
 * seulement**. Ce fichier est le quatrième : il ne doit être atteint par aucun
 * import statique du configurateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL N'Y A PAS DE RA SANS ALLER-RETOUR SERVEUR
 *
 * Quick Look suit un `<a rel="ar" href=…>`, Scene Viewer une intention
 * `?file=…`. Dans les deux cas c'est le SYSTÈME qui va chercher le fichier, hors
 * du navigateur : un `blob:` de la page lui est inaccessible. Le modèle est donc
 * construit ici, puis DÉPOSÉ sur la boutique (`AHNS_Ar`), qui rend une adresse.
 *
 * On aurait pu le cacher derrière un joli bouton et découvrir la panne sur un
 * téléphone. `etatRa` en fait un refus nommé, `'hebergement'`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MISE EN LUMIÈRE N'EST PAS CELLE DE LA VUE 3D
 *
 * §5 : « Un néon allumé en plein jour, en RA, sera peu spectaculaire — et c'est
 * LA VÉRITÉ. Ne pas compenser par une émission gonflée : ce serait remplacer un
 * mensonge de taille par un mensonge de luminosité. » L'émission portée ici est
 * donc celle de l'export atelier, pas celle de la scène 3D et de son bloom.
 */

import {
  ATTRIBUTS_RA, buildTubeSolid, meshVersGlb, meshVersUsdz,
  type ModeleFabrication, type Polyline2,
} from '@neon/core';
import type { CheminRa } from './ar-capacite';

export interface DemandeRa {
  /** Trajets du tube, en mètres, déjà centrés. */
  strokes: readonly Polyline2[];
  /** Cotes de fabrication — le tube du catalogue LIVRÉ, pas une constante. */
  modele: ModeleFabrication;
  /** Couleur du tube allumé, en sRGB 0–1. */
  emission: [number, number, number];
  nom: string;
  chemin: CheminRa;
  /** Dépôt du modèle sur la boutique. */
  ajaxUrl: string;
  nonce: string;
}

/** Base64 sans passer par `btoa(String.fromCharCode(...tableau))`, qui explose
 *  la pile au-delà de quelques dizaines de milliers d'octets. */
function base64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 8192) {
    s += String.fromCharCode(...octets.subarray(i, i + 8192));
  }
  return btoa(s);
}

/** Dépose le modèle et rend son adresse publique. */
async function deposer(octets: Uint8Array, d: DemandeRa): Promise<string> {
  const fd = new FormData();
  fd.append('action', 'ahns_ar_model');
  fd.append('nonce', d.nonce);
  fd.append('modele', base64(octets));
  const res = await fetch(d.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd });
  const json = (await res.json()) as { success: boolean; data?: { url?: string } | string };
  if (!json.success || 'string' === typeof json.data || !json.data?.url) {
    throw new Error('string' === typeof json.data ? json.data : "Le modèle n'a pas pu être publié.");
  }
  return json.data.url;
}

/**
 * Construit le modèle, le publie, et ouvre le visualiseur du système.
 *
 * Rend `true` si le visualiseur a été ouvert. Lève sinon — l'appelant affiche
 * le message ; §8.3 rappelle qu'un refus est un état NORMAL, pas une erreur.
 */
export async function ouvrirRa(d: DemandeRa): Promise<boolean> {
  const mesh = buildTubeSolid(d.strokes, d.modele.tubeRayonM, { stepM: d.modele.pasSolideM });

  if ('quick-look' === d.chemin) {
    const url = await deposer(meshVersUsdz(mesh, { nom: d.nom, emission: d.emission, couleur: d.emission }), d);
    /*
     * QUICK LOOK S'OUVRE PAR UN CLIC, PAS PAR `location.assign`.
     *
     * Safari n'engage la visionneuse que sur l'activation d'un `<a rel="ar">`
     * qui CONTIENT une image — c'est la règle d'Apple, et sans l'enfant image
     * le lien se comporte comme un téléchargement ordinaire. L'ancre vit le
     * temps du clic ; on ne la laisse pas dans la page.
     */
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = url;
    a.appendChild(document.createElement('img'));
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
    return true;
  }

  const url = await deposer(meshVersGlb(mesh, { nom: d.nom, emission: d.emission, forceEmission: 6 }), d);
  /*
   * SCENE VIEWER : `resizable=false` est le `ar-scale="fixed"` d'Android.
   *
   * Même décision, même raison : le client vient vérifier une TAILLE, on ne lui
   * donne pas les moyens de la changer au pincement sans s'en apercevoir. Le
   * garde-fou vaut ce que vaut sa transposition — s'il ne tenait que dans le
   * fichier de core, il serait vrai sur iOS et faux sur Android.
   */
  const params = new URLSearchParams({
    file: url,
    mode: 'ar_only',
    resizable: 'fixed' === ATTRIBUTS_RA['ar-scale'] ? 'false' : 'true',
    title: d.nom,
  });
  // L'intention porte un `S.browser_fallback_url` : sans lui, un appareil sans
  // Scene Viewer affiche une page blanche au lieu de revenir au configurateur.
  const repli = encodeURIComponent(window.location.href);
  window.location.assign(
    `intent://arvr.google.com/scene-viewer/1.0?${params.toString()}`
    + `#Intent;scheme=https;package=com.google.ar.core;`
    + `S.browser_fallback_url=${repli};end;`,
  );
  return true;
}
