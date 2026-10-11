/**
 * L'EXTINCTION NOCTURNE DES ENSEIGNES — ce que la loi impose, et ce que le
 * programmateur doit donc savoir faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER N'EST PAS « UNE OPTION À 39 € »
 *
 * B20 demande un « programmateur d'extinction 1 h – 6 h en option ». Lu vite,
 * c'est un accessoire de plus dans une liste. Lu à la source, ce n'en est pas
 * un : **1 h – 6 h est une plage LÉGALE**, pas une caractéristique de produit.
 *
 * Code de l'environnement, article R581-59, version en vigueur au 1ᵉʳ janvier
 * 2024 (`ressources/reglementation/article-R581-59-code-environnement.pdf`, et
 * le relevé intégral R581-58 à 71 du même dossier) :
 *
 *   « Les enseignes lumineuses sont éteintes entre 1 heure et 6 heures, lorsque
 *   l'activité signalée a cessé. Lorsqu'une activité cesse ou commence entre
 *   minuit et 7 heures du matin, les enseignes sont éteintes au plus tard une
 *   heure après la cessation d'activité de l'établissement et peuvent être
 *   allumées une heure avant la reprise de cette activité. »
 *
 * Le décret 2022-1294 du 5 octobre 2022 en fait une contravention de 5ᵉ classe
 * (`ressources/reglementation/jorf-2022-10-06-enseignes.pdf`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA CHANGE POUR LE CONFIGURATEUR
 *
 * Un client qui ferme à 2 h du matin et qu'on équipe d'une minuterie réglée
 * « 1 h – 6 h » aurait son enseigne éteinte PENDANT qu'il travaille. La loi a
 * prévu son cas ; une option vendue sans le savoir le met en tort d'un côté ou
 * l'autre. C'est pour cela que le calcul vit ici, dans `core`, avec un témoin,
 * et non dans un libellé de fiche produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 *
 * Il ne dit pas au client s'il a le droit de poser son enseigne : cela dépend du
 * règlement local de publicité et du maire (L581-4, L581-8), qu'aucun calcul ne
 * remplace. Il ne fixe pas non plus de seuil de luminance : R581-59 le renvoie à
 * un arrêté ministériel, et l'arrêté du 27 décembre 2018 présent au dossier
 * porte une fiche ministérielle disant qu'il « ne concerne pas les éclairages
 * publicitaires (enseignes, pré-enseignes) ». Le chiffre n'est donc pas établi
 * ici, et on n'en invente pas.
 */

/** La plage de droit commun : éteint entre 1 h et 6 h. */
export const PLAGE_LEGALE = Object.freeze({ debutH: 1, finH: 6 });

/**
 * La fenêtre « nuit » du second alinéa : minuit à 7 h.
 *
 * Une activité qui cesse OU commence dans cette fenêtre bascule sur la règle
 * décalée. Ce n'est pas la même chose que la plage d'extinction, et les
 * confondre donnerait 1 h – 6 h à un bar qui ferme à 2 h.
 */
export const FENETRE_NUIT = Object.freeze({ debutH: 0, finH: 7 });

/** Horaires de l'établissement, en heures décimales (2,5 = 2 h 30). */
export interface HorairesActivite {
  /** Heure de cessation d'activité. */
  fermetureH: number;
  /** Heure de reprise. */
  ouvertureH: number;
}

export type Extinction =
  /**
   * Aucune obligation calculable.
   *
   * `activite-continue` : l'activité ne cesse pas — l'obligation est
   * conditionnée à « lorsque l'activité signalée a cessé ». Un hôtel, une
   * pharmacie de garde, une station-service : le texte ne les vise pas.
   *
   * `horaires-invalides` : on nous a donné des heures qu'on ne sait pas lire.
   * On refuse plutôt que de programmer une minuterie au hasard.
   *
   * `plage-nulle` : la dérogation referme la plage sur elle-même. Une boîte de
   * nuit qui ferme à 5 h doit être éteinte « au plus tard » à 6 h, et la plage
   * de droit commun s'achève à 6 h : il ne reste aucune durée à programmer. Ce
   * cas EXISTE et il a failli passer inaperçu — un premier calcul en tirait une
   * extinction de 24 heures, parce qu'une durée nulle et une journée entière
   * s'écrivent pareil sur un cadran.
   */
  | { obligation: 'aucune'; motif: 'activite-continue' | 'horaires-invalides' | 'plage-nulle' }
  | {
      obligation: 'plage';
      /** Heure d'extinction. */
      deH: number;
      /** Heure de rallumage autorisé. */
      aH: number;
      /** `commune` : 1 h – 6 h. `nuit` : le second alinéa de R581-59. */
      regle: 'commune' | 'nuit';
      /** Durée d'extinction, en heures — ce qu'on programme dans l'appareil. */
      dureeH: number;
    };

const valide = (h: number) => Number.isFinite(h) && h >= 0 && h < 24;
const dansLaNuit = (h: number) => h >= FENETRE_NUIT.debutH && h < FENETRE_NUIT.finH;
/** Ramène une heure dans [0, 24) — 25 h devient 1 h. */
const cyclique = (h: number) => ((h % 24) + 24) % 24;

/**
 * Ce que le programmateur doit exécuter, pour ces horaires-là.
 *
 * L'ORDRE DES DEUX RÈGLES COMPTE. Le second alinéa est une DÉROGATION au
 * premier : il ne s'applique qu'aux établissements dont l'activité cesse ou
 * commence entre minuit et 7 h. Le tester en premier reviendrait à appliquer la
 * dérogation à tout le monde ; le tester en dernier reviendrait à ne jamais
 * l'appliquer. On teste donc la condition de la dérogation, pas son effet.
 */
export function extinctionRequise(h: HorairesActivite): Extinction {
  if (!valide(h.fermetureH) || !valide(h.ouvertureH)) {
    return { obligation: 'aucune', motif: 'horaires-invalides' };
  }
  // « lorsque l'activité signalée a cessé » : si elle ne cesse pas, la
  // condition du texte n'est jamais remplie.
  if (h.fermetureH === h.ouvertureH) {
    return { obligation: 'aucune', motif: 'activite-continue' };
  }

  const nuit = dansLaNuit(h.fermetureH) || dansLaNuit(h.ouvertureH);
  const deH = nuit && dansLaNuit(h.fermetureH) ? cyclique(h.fermetureH + 1) : PLAGE_LEGALE.debutH;
  const aH = nuit && dansLaNuit(h.ouvertureH) ? cyclique(h.ouvertureH - 1) : PLAGE_LEGALE.finH;

  /*
   * LA DURÉE SE COMPTE EN TOURNANT, PAS EN SOUSTRAYANT.
   *
   * Une extinction va de 23 h à 6 h : `aH - deH` donnerait −17. La plage
   * franchit minuit dans presque tous les cas réels, et c'est le cas normal,
   * pas l'exception.
   *
   * MAIS UNE DIFFÉRENCE NULLE N'EST PAS UNE JOURNÉE ENTIÈRE. Sur un cadran,
   * « de 6 h à 6 h » s'écrit comme « rien » et comme « tout ». La loi
   * n'impose jamais vingt-quatre heures d'extinction : c'est donc « rien ».
   */
  if (deH === aH) return { obligation: 'aucune', motif: 'plage-nulle' };

  return { obligation: 'plage', deH, aH, regle: nuit ? 'nuit' : 'commune', dureeH: cyclique(aH - deH) };
}

/** « 2.5 » → « 2 h 30 ». Pour la fiche d'atelier et le courriel du client. */
export function heureFr(h: number): string {
  const entier = Math.floor(h);
  const minutes = Math.round((h - entier) * 60);
  return 0 === minutes ? `${entier} h` : `${entier} h ${String(minutes).padStart(2, '0')}`;
}
