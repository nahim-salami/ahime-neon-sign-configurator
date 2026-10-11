/**
 * Registre des thèmes du configurateur.
 *
 * Un thème n'est PAS un widget différent : c'est un habillage du même moteur
 * (voir docs/10-integration-themes.md). La logique — état, familles, prix,
 * validation, panier — est unique et partagée ; un thème fournit sa peau
 * (règles CSS ciblées par `[data-theme="…"]` dans le Shadow DOM) et, pour
 * certains, sa disposition (étapes, cartes dépliantes, tiroir…).
 *
 * Le marchand choisit dans WordPress (Apparence → Thème du configurateur) ;
 * la valeur descend par le contexte hôte (`appearance.theme`). Un identifiant
 * inconnu retombe TOUJOURS sur le thème par défaut : une boutique dont le
 * réglage vient d'une version plus récente du plugin ne doit jamais afficher
 * un configurateur cassé.
 *
 * Le miroir PHP de ce registre vit dans AHNS_Appearance::THEMES — les deux
 * listes doivent rester alignées (le PHP est la barrière de saisie, ce
 * fichier est la barrière d'affichage).
 */

export interface ThemeDef {
  id: string;
  /** Nom montré au marchand (l'écran d'admin a le sien, en français). */
  label: string;
  /**
   * Disposition du panneau de réglages :
   * - `scroll`    : toutes les sections empilées, on défile (l'historique) ;
   * - `steps`     : une section à la fois, barre de progression et Retour /
   *   Continuer — le client est guidé ;
   * - `accordion` : cartes dépliantes numérotées, une ouverte à la fois ;
   *   fermée, une carte RÉSUME le choix ; visitée, elle porte une coche.
   * - `ticket`    : les réglages passent SOUS la scène en cartes côte à côte,
   *   et le panneau devient un ticket de caisse qui imprime les choix ligne à
   *   ligne. C'est la seule disposition qui AJOUTE un contenu au lieu d'en
   *   réorganiser — le récapitulatif n'existait nulle part ailleurs, et c'est
   *   pourquoi aucune feuille de style ne pouvait produire ce thème.
   * - `lettre`    : il n'y a plus de panneau du tout. La commande est UNE
   *   PHRASE — « je veux un néon qui dit Hello, écrit en Pacifico, qui brille
   *   en rose flamant… » — dont chaque valeur est soulignée et se clique ;
   *   une bulle s'ouvre SOUS le mot, on choisit, la phrase se réécrit. C'est
   *   l'interface la plus simple possible : il suffit de savoir lire.
   * Les cinq réutilisent les groupes des onglets mobiles : les sections
   * portent déjà leur appartenance, aucune logique n'est dupliquée.
   */
  layout: 'scroll' | 'steps' | 'accordion' | 'ticket' | 'lettre';
  /**
   * Disposition RETENUE EN FICHE PRODUIT, quand elle diffère.
   *
   * Une peau a deux endroits où vivre, et les maquettes le disent : une PAGE
   * DÉDIÉE, où le configurateur est seul et prend l'écran, et une FICHE
   * PRODUIT, où il partage la page avec un fil d'Ariane, des avis, une
   * description et un pied. « La Maison » a les deux : prototypes/maison.html
   * guide le client pas à pas dans une pièce en plein cadre, et
   * prototypes/maison-produit.html empile ses réglages dans une colonne qui
   * défile avec la page, à côté d'une scène collée.
   *
   * Ce n'est pas un détail d'habillage : un parcours par étapes DANS une page
   * qui défile déjà donne deux progressions concurrentes. La feuille de style
   * ne pouvait pas décider seule — la disposition est lue par le composant.
   *
   * Absent : la peau garde `layout` partout, ce qui reste le cas des onze
   * autres.
   */
  ficheLayout?: 'scroll' | 'steps' | 'accordion' | 'ticket' | 'lettre';
  /**
   * Le panneau guidé peut-il être REFERMÉ tout entier ?
   *
   * Les parcours par étapes ouvrent toujours sur un groupe : c'est ce qu'on
   * veut d'un panneau qui occupe sa colonne — vide, il ne serait qu'un trou.
   *
   * « La Maison » ne pose pas un panneau : elle pose une BULLE au-dessus de
   * la pièce, et une bulle ouverte cache le néon qu'on vient composer. Sa
   * maquette (prototypes/maison.html) ouvre donc sur AUCUN groupe — on voit
   * son enseigne dans son salon — et chaque bouton du bandeau ouvre le sien,
   * puis le referme si on le reclique.
   *
   * Absent : le panneau montre toujours un groupe, comme les autres.
   */
  panneauRepliable?: boolean;
  /**
   * LES LIEUX DE CETTE PEAU — sa famille de décors.
   *
   * Pas UN décor mais TROIS, et c'est le point : la barre des fonds propose
   * trois vignettes, et il n'y a aucune raison que la première suive la peau
   * pendant que les deux autres restent les murs de studio livrés par défaut.
   * Un configurateur de salon de coiffure doit proposer trois salons — coiffure,
   * barbier, institut — et pas un salon plus deux murs quelconques.
   *
   * Le premier de la liste est le DÉFAUT ; le client garde le droit de changer,
   * mais il change à l'intérieur du monde de la peau.
   *
   * Absent : la peau ouvre sur les trois décors livrés, ce qui reste le bon
   * choix pour « Clair boutique » — un fond neutre pour une boutique
   * quelconque, qui ne raconte rien de particulier.
   */
  decors?: readonly string[];
}

export const DEFAULT_THEME_ID = 'clair-boutique';

export const THEMES: readonly ThemeDef[] = [
  { id: 'clair-boutique', label: 'Clair boutique', layout: 'scroll' },
];

/** Définition sûre : connue du registre, sinon le défaut. */
export function resolveTheme(id: string | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? (THEMES.find((t) => t.id === DEFAULT_THEME_ID) as ThemeDef);
}

/** Identifiant sûr : connu du registre, sinon le défaut. */
export function resolveThemeId(id: string | undefined): string {
  return resolveTheme(id).id;
}
