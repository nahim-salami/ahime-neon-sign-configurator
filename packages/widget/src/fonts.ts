/**
 * Polices embarquées : SOUS-ENSEMBLES WOFF2 générés par le pipeline
 * (packages/core/scripts/build-fonts.mjs — mêmes glyphes que le manifeste de
 * mesure, ~200 Ko au total pour 12 polices vs ~1,9 Mo de TTF complets).
 * GOTCHA : les @font-face déclarées DANS un Shadow DOM ne chargent pas la
 * police (Chrome) — elles sont injectées UNE FOIS dans document.head.
 */

import pacificoUrl from './generated/fonts/pacifico.woff2?url';
import poppinsUrl from './generated/fonts/poppins-bold.woff2?url';
import greatVibesUrl from './generated/fonts/great-vibes.woff2?url';
import lobsterUrl from './generated/fonts/lobster.woff2?url';
import bebasUrl from './generated/fonts/bebas-neue.woff2?url';
/* UNE ÉCRITURE POUR L'INTERFACE, ET NON POUR UN NÉON.
   Les douze au-dessus sont proposées au client pour son enseigne. Caveat, elle,
   sert à une PEAU : la fiche de fabrication de « L'Atelier » se remplit à la
   main, et c'est tout le propos du thème. Un repli sur la cursive du système
   ne ressemblerait à rien — la police est donc embarquée comme les autres.
   Le sous-ensemble existait déjà (packages/core/fonts/caveat__script.ttf), il
   ne coûte que son poids. */
/* Et l'anglaise du Salon : son titre de carte est écrit à la plume, c'est la
   signature du thème. Même raison que Caveat — un repli sur la cursive du
   système ne ressemble à rien. */

/** famille CSS → [url, weight] — la source des @font-face ET du catalogue. */
export const FONT_FACES: Record<string, [string, number]> = {
  NeonPacifico: [pacificoUrl, 400],
  NeonPoppins: [poppinsUrl, 700],
  NeonGreatVibes: [greatVibesUrl, 400],
  NeonLobster: [lobsterUrl, 400],
  NeonBebas: [bebasUrl, 400],
};

const STYLE_ID = 'ahns-config-fonts';

export function ensureFontsInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = Object.entries(FONT_FACES)
    .map(
      ([family, [url, weight]]) =>
        `@font-face { font-family: '${family}'; src: url('${url}') format('woff2'); font-weight: ${weight}; font-display: block; }`,
    )
    .join('\n');
  document.head.appendChild(style);
}
