/**
 * L'APPAREIL SAIT-IL POSER UN OBJET SUR UN MUR ?
 *
 * Cette question se pose AVANT tout téléchargement — c'est elle qui décide si
 * le bouton existe (`realite-augmentee-widget` §6 et §9.5 : « rien de la RA
 * n'est téléchargé avant le clic »). Le module est donc minuscule et chargé
 * avec le widget 2D ; tout le reste part dans le lot chargé au clic.
 *
 * ON NE MESURE PAS LA LARGEUR DE L'ÉCRAN. Un portable en fenêtre étroite n'est
 * pas un téléphone, et un téléphone en paysage n'est pas un ordinateur. Ce
 * qu'on cherche, c'est un appareil qu'on TIENT devant un mur : un écran
 * tactile, un pointeur grossier, et l'un des deux visualiseurs du système.
 */

/** Le chemin que le système offre, ou `null` s'il n'en offre aucun. */
export type CheminRa = 'quick-look' | 'scene-viewer';

/**
 * iOS : le test canonique d'Apple.
 *
 * Ce n'est pas une détection d'agent utilisateur — c'est Safari lui-même qui
 * déclare savoir suivre `<a rel="ar">`. Une chaîne d'agent se falsifie et se
 * périme ; `relList.supports` répond pour la version installée.
 */
function quickLookDisponible(): boolean {
  try {
    const a = document.createElement('a');
    return !!(a.relList && a.relList.supports && a.relList.supports('ar'));
  } catch {
    return false;
  }
}

/**
 * Android : Scene Viewer n'expose aucun test équivalent.
 *
 * Il faut donc regarder l'agent utilisateur, faute de mieux — mais on le double
 * du tactile, pour ne pas ouvrir le bouton sur un émulateur de bureau qui se
 * déclare Android.
 */
function sceneViewerDisponible(): boolean {
  return /android/i.test(navigator.userAgent);
}

/** Un appareil qu'on tient en main : tactile ET pointeur grossier. */
function tenuEnMain(): boolean {
  const tactile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const grossier = !window.matchMedia || window.matchMedia('(pointer: coarse)').matches;
  return tactile && grossier;
}

/**
 * Le chemin de RA offert par cet appareil, ou `null`.
 *
 * L'ordre importe peu — aucun appareil n'offre les deux — mais Quick Look passe
 * en premier parce que son test est le seul qui ne devine rien.
 */
export function cheminRa(): CheminRa | null {
  if (!tenuEnMain()) return null;
  if (quickLookDisponible()) return 'quick-look';
  if (sceneViewerDisponible()) return 'scene-viewer';
  return null;
}
