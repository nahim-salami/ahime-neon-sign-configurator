/**
 * Composant principal du configurateur.
 *
 * TOUT le calcul (mesures, prix, validation) vient de @neon/core — le widget
 * n'invente rien : il affiche. Rendu néon : texte HTML dans la vraie police
 * avec halo CSS multi-couches (fidèle au rendu physique d'un tube LED).
 */

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_COEFFICIENTS,
  DEFAULT_MATERIALS,
  computePrice,
  couleurEteinte,
  eclairementDeScene,
  measureConfiguration,
  configVersJeton,
  contenuLivre,
  jetonVersConfig,
  emettreMesure,
  lireLienDEntree,
  qrEnSvg,
  delaiAnnonce,
  garantieAnnoncee,
  messageScission,
  scissionRequise,
  compositionMockup,
  echelleDepuisReference,
  incertitudeEnPourcent,
  legendeMockup,
  largeurFondPx,
  longueurSegment,
  type Echelle,
  masseEnseigne,
  gabaritPapierSvg,
  referencePour,
  referencesClassees,
  diametreTubeDuDesign,
  etatRa,
  extinctionRequise,
  heureFr,
  modeleDepuisCoefficients,
  modeleVersStockage,
  type ModeleStocke,
  INTERLINE_RATIO,
  motsDeLigne,
  validateConfiguration,
  type NeonConfiguration,
  type NeonLine,
  type PriceLine,
  type SupportFinish,
  type SupportType,
} from '@neon/core';
import {
  BACKGROUNDS,
  FAMILIES,
  findBackground,
  NEON_COLORS,
  PANEL_CUTS,
  PANEL_FINISHES,
  PANEL_MATERIALS,
  SIZE_PRESETS,
  SUPPORT_FINISHES,
  SUPPORT_TYPES,
} from './catalog';
import { cheminRa } from './ar-capacite';
import { resolveFonts } from './runtime-fonts';
import { hostContext } from './host-context';
import { resolveTheme } from './themes';
import { t, isRtlLocale } from './i18n';
import { CAPTURE_PX_PAR_LETTRE, captureCompositePng, captureNeonCanvas, captureNeonPng, captureLogoPng, melangeSrgb, type CaptureLine, type CapturePlate } from './capture';
import { loadLogoSvgOuImage, loadRasterLogo, logoAEchelle, type LogoData } from './logo-importe';
import { SPEC } from './spec';
import type { PlateSpec } from './three-view';

/**
 * VUE 3D CHARGÉE À LA DEMANDE.
 *
 * three.js et ses passes de post-traitement pèsent à eux seuls la moitié du
 * widget. Un visiteur qui compose son néon en 2D et l'achète sans jamais
 * basculer en 3D n'a aucune raison de les télécharger.
 */
const ThreeView = lazy(() => import('./three-view'));

/* La DÉTECTION de RA est chargée avec le widget 2D — elle pèse quelques lignes
   et décide si le bouton existe. Le reste (`ar.ts`, ses exportateurs et son
   dépôt) n'est atteint que par l'importation dynamique du gestionnaire de clic :
   `realite-augmentee-widget` §9.5, « rien de la RA n'est téléchargé avant le
   clic ». Un import statique d'`ar.ts` ici annulerait tout le lot 4. */
import { buildLogoGeometry, buildTextGeometry, composerGeometries, type NeonGeometry } from './neon-geometry';

/**
 * Géométrie compacte figée avec la commande : coordonnées en dixièmes de mm,
 * et depuis la version 2 les COTES de fabrication (écart E11).
 */
function geometryForOrder(geom: NeonGeometry, modele: ModeleStocke) {
  const ink = geom.ink ?? { x0: 0, y0: 0, w: geom.widthPx, h: geom.heightPx };
  const cx = ink.x0 + ink.w / 2;
  const cy = ink.y0 + ink.h / 2;
  const point = ([x, y]: [number, number]): [number, number] => [
    Math.round(((x - cx) / geom.pxPerCm) * 100),
    Math.round((-(y - cy) / geom.pxPerCm) * 100),
  ];
  const paths = (values: NeonGeometry['strokes']) => values.filter((p) => p.length >= 2).map((p) => p.map(point));
  return {
    // VERSION 2 : la géométrie emporte désormais le MODÈLE (écart E11).
    //
    // L'export tourne dans l'administration, des mois plus tard, sans la
    // configuration : il ne peut pas recalculer les cotes, il faut qu'elles
    // aient voyagé. Sans ça, il fabriquait avec un diamètre écrit en dur,
    // quel que soit le tube commandé.
    //
    // Les commandes de version 1 n'en ont pas ; `modeleDepuisStockage` le dit
    // à l'atelier au lieu de retomber en silence sur le catalogue courant.
    version: 2,
    unit: '0.1mm',
    modele,
    strokes: paths(geom.strokes),
    contourOutline: paths(geom.contourOutline),
    letterOutlines: paths(geom.letterOutlines),
  };
}

const euros = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Apparence 2D de la plaque selon la finition. `solid` sert aux découpes qui
 * suivent la lettre (contour / à-la-lettre), réalisées par un contour de texte
 * épais — une seule couleur y est possible ; `css` sert aux plaques
 * rectangulaires et aux caissons, qui acceptent un dégradé.
 */
const PLATE_2D: Record<string, { solid: string; css: string; edge: string }> = {
  clear: { solid: 'rgba(226,238,250,0.012)', css: 'linear-gradient(135deg, rgba(238,246,255,0.035), rgba(198,214,232,0.008))', edge: 'rgba(255,255,255,0.035)' },
  black: { solid: '#15181e', css: 'linear-gradient(135deg, #20242c, #0d0f13)', edge: 'rgba(255,255,255,0.22)' },
  white: { solid: '#eceef1', css: 'linear-gradient(135deg, #f7f8fa, #dfe3e8)', edge: 'rgba(255,255,255,0.9)' },
  colored: { solid: '#e879b9', css: 'linear-gradient(135deg, #f0a8d6, #b45ec9)', edge: 'rgba(255,255,255,0.5)' },
  mirror: { solid: '#c3cdd8', css: 'linear-gradient(135deg, #f4f7fa 8%, #9aa7b5 52%, #e8edf2 92%)', edge: 'rgba(255,255,255,0.95)' },
  'printed-uv': { solid: '#5b3b8c', css: 'linear-gradient(135deg, #241b4d, #7a2b6d 52%, #20304f)', edge: 'rgba(255,255,255,0.45)' },
};

/**
 * Ligne d'option à interrupteur. TOUTE LA LIGNE est la cible tactile (au doigt,
 * viser un interrupteur de 30 px est pénible) tout en restant un vrai
 * `role="switch"` accessible au clavier.
 */
function OptionRow({
  label,
  hint,
  checked,
  onToggle,
  price,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
  /** « +49 € », « +25 % » — affiché seulement par les peaux qui le demandent
      (le ticket du Comptoir dit le prix de chaque extra, comme un menu). */
  price?: string;
}) {
  return (
    <div
      className="optrow"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span>
        {label}
        <small>{hint}</small>
      </span>
      {price && <small className="opt-prix">{price}</small>}
      <span className={`switch${checked ? ' on' : ''}`} aria-hidden="true" />
    </div>
  );
}

/**
 * Halo néon multi-couches à partir de la couleur du tube.
 *
 * La lumière d'un vrai néon ne s'arrête pas au bord du tube : elle décroît
 * sur plusieurs dizaines de centimètres. Les trois dernières nappes, larges
 * et de plus en plus transparentes, font toute la différence entre un
 * autocollant brillant et une source de lumière.
 */
const glow = (hex: string) =>
  [
    '0 0 1px #fff',
    `0 0 2px color-mix(in srgb, ${hex} 30%, white)`,
    `0 0 6px color-mix(in srgb, ${hex} 72%, white)`,
    `0 0 12px ${hex}`,
    `0 0 24px ${hex}`,
    `0 0 46px color-mix(in srgb, ${hex} 64%, transparent)`,
    `0 0 82px color-mix(in srgb, ${hex} 36%, transparent)`,
  ].join(', ');

/** Contexte canvas partagé pour mesurer l'encre des glyphes (TextMetrics). */
let sharedMeasureCtx: CanvasRenderingContext2D | null | undefined;
function measureContext(): CanvasRenderingContext2D | null {
  if (sharedMeasureCtx === undefined) {
    sharedMeasureCtx = document.createElement('canvas').getContext('2d');
  }
  return sharedMeasureCtx;
}

/** Tube ALLUMÉ : cœur blanc chaud, fine gaine colorée, halo complet. */
const litStyle = (color: string, fontPx: number) => ({
  color: '#fffdf8',
  WebkitTextStrokeWidth: `${Math.max(1, fontPx * 0.012)}px`,
  WebkitTextStrokeColor: `color-mix(in srgb, ${color} 62%, white)`,
  paintOrder: 'stroke fill' as const,
  textShadow: glow(color),
});

/**
 * Tube ÉTEINT : le silicone reste légèrement teinté par son pigment — un
 * néon rose éteint n'est pas gris, il est rose laiteux. Le liseré plus
 * soutenu dessine la paroi du tube, le filet blanc du haut fait le reflet.
 */
const offStyle = (color: string, fontPx: number) => ({
  color: `color-mix(in srgb, ${color} 14%, #edeff2)`,
  WebkitTextStrokeWidth: `${Math.max(1, fontPx * 0.012)}px`,
  WebkitTextStrokeColor: `color-mix(in srgb, ${color} 28%, #c3c8cf)`,
  paintOrder: 'stroke fill' as const,
  textShadow: '0 1px 0 rgba(255,255,255,.30), 0 2px 4px rgba(0,0,0,.48)',
  opacity: 0.97,
});

type MobileTab = 'text' | 'couleur' | 'size' | 'support' | 'options';
const MOBILE_TABS: Array<{ id: MobileTab; label: string }> = [
  { id: 'text', label: 'Texte' },
  { id: 'size', label: 'Taille' },
  { id: 'support', label: 'Support' },
  { id: 'options', label: 'Options' },
];

/**
 * LES ONGLETS DU TÉLÉPHONE SUIVENT LES CARTES, SINON L'UN D'EUX OUVRE SUR RIEN.
 *
 * La disposition « ticket » (Comptoir) range en quatre cartes de caisse :
 * Message, Couleur, Format — qui absorbe le support —, Extras. Avec la liste
 * d'onglets d'origine, le client de téléphone touchait « Support » et
 * trouvait une page blanche, tandis que la couleur n'avait aucun onglet.
 *
 * Les groupes du composant ne changent pas (« text » porte le message ET la
 * couleur) : seuls les onglets sont redécoupés, et la carte Couleur reçoit
 * son propre groupe d'affichage.
 */
const TICKET_TABS: Array<{ id: MobileTab; label: string }> = [
  { id: 'text', label: 'Message' },
  { id: 'couleur', label: 'Couleur' },
  { id: 'size', label: 'Format' },
  { id: 'options', label: 'Extras' },
];

/**
 * L'ambiance du site hôte, recopiée sur la racine du widget.
 *
 * Le pack « Maison » donne deux visages au site — le jour et le soir — et le
 * cadre les commande en posant `data-mode` sur la racine du DOCUMENT. Le
 * widget vit dans un Shadow DOM : aucune règle de la page ne l'atteint, et
 * `:root` de sa feuille désigne SA racine à lui, pas celle du document. Sans
 * ce report, le configurateur resterait clair sur un site passé au soir —
 * la seule zone de la page à ne pas suivre le curseur.
 *
 * On observe l'attribut plutôt que de le lire une fois : la bascule est un
 * réglage qu'on manipule EN REGARDANT la scène, pas avant de la charger.
 *
 * Rien à faire pour les autres peaux : elles n'ont qu'un visage et ignorent
 * l'attribut. Rien non plus hors navigateur (rendu serveur, test).
 */
function useAmbianceHote(): string | undefined {
  const [mode, setMode] = useState<string | undefined>(undefined);

  useEffect(() => {
    if ('undefined' === typeof document) return;
    const racine = document.documentElement;
    const lire = () => setMode(racine.getAttribute('data-mode') ?? undefined);
    lire();
    const oeil = new MutationObserver(lire);
    oeil.observe(racine, { attributes: true, attributeFilter: ['data-mode'] });
    return () => oeil.disconnect();
  }, []);

  return mode;
}

/**
 * La place que le configurateur prend dans la page.
 *
 *   'pleine' : il occupe la hauteur que l'hôte lui donne et fait défiler ses
 *              colonnes — la page dédiée, où il est seul à l'écran.
 *   'fiche'  : il se déroule et c'est la PAGE qui défile — la fiche produit,
 *              où il partage l'écran avec un titre, une description et des
 *              onglets. Deux ascenseurs imbriqués y perdent le client.
 */
export type VueDuConfigurateur = 'pleine' | 'fiche';

/** Le texte affiché tant que le client n'a rien tapé. */
const TEXTE_DE_DEPART = 'Hello';

export default function NeonConfigurator({ vue = 'pleine' }: { vue?: VueDuConfigurateur }) {
  /**
   * ÉDITION DEPUIS LE PANIER : le plugin injecte la configuration de la ligne
   * à modifier. On en dérive les états INITIAUX (une seule lecture : le
   * contexte ne change pas pendant la vie de la page).
   */
  const editCtx = useMemo(() => hostContext(), []);
  /**
   * CATALOGUE DE POLICES EFFECTIF : celles activées par le marchand si la
   * boutique en fournit, sinon les polices embarquées (démo / mode autonome).
   */
  const { fonts: FONTS, manifests: MANIFESTS } = useMemo(() => resolveFonts(), []);
  /**
   * CE QUE LE MARCHAND PROPOSE. Une option absente du contexte est considérée
   * ACTIVE : une boutique qui n'a jamais ouvert l'écran Configurateur garde le
   * configurateur complet.
   */
  const feature = (key: 'rgb' | 'outdoor' | 'dimmer' | 'express' | 'logo' | 'view3d' | 'timer') =>
    editCtx?.features?.[key] !== false;
  const maxLines = Math.max(1, Math.min(3, editCtx?.maxLines ?? 3));
  /** Abonnement : la boutique n'a pas le droit de vendre en ce moment. */
  const cartClosed = false === editCtx?.canAddToCart;
  /** Page de devis : on compose, on ne vend pas. */
  const quoteMode = true === editCtx?.quoteMode;

  /** Catalogue proposé par la boutique (repli : le catalogue livré). */
  const colors = useMemo(
    () => (editCtx?.colors?.length ? editCtx.colors : NEON_COLORS),
    [editCtx],
  );
  const supportTypes = useMemo(
    () => (editCtx?.supportTypes?.length ? SUPPORT_TYPES.filter((t) => editCtx.supportTypes!.includes(t.id)) : SUPPORT_TYPES),
    [editCtx],
  );
  const supportFinishes = useMemo(
    () => (editCtx?.supportFinishes?.length ? SUPPORT_FINISHES.filter((f) => editCtx.supportFinishes!.includes(f.id)) : SUPPORT_FINISHES),
    [editCtx],
  );
  /** Libellés du marchand (un libellé vide reprend la traduction par défaut). */
  const L = (key: 'title' | 'addToCart' | 'checkout' | 'another', fallback: string) =>
    editCtx?.appearance?.labels?.[key] || fallback;
  const FONT_CLASS_BY_ID = useMemo(
    () => Object.fromEntries(FONTS.map((f) => [f.id, f.class])),
    [FONTS],
  );
  /**
   * TAILLES DU MARCHAND : boutons et bornes du curseur viennent des réglages
   * de la boutique quand ils sont fournis ; sinon, le catalogue par défaut.
   */
  const sizePresets = useMemo(() => {
    const fromHost = editCtx?.sizePresets;
    if (fromHost?.length) {
      return fromHost.map((p, i) => ({ id: `${p.label}-${i}`, label: p.label, letterHeightCm: p.letterHeightCm }));
    }
    return SIZE_PRESETS;
  }, [editCtx]);
  const sizeBounds = useMemo(
    () => ({ minCm: editCtx?.sizeBounds?.minCm ?? 8, maxCm: editCtx?.sizeBounds?.maxCm ?? 60 }),
    [editCtx],
  );
  /**
   * LA CONFIGURATION DE DÉPART — et le lien partagé, s'il y en a un (B14).
   *
   * L'ORDRE COMPTE. Une reprise de panier l'emporte sur un lien : le client qui
   * modifie un article de son panier doit retrouver CET article, même s'il a
   * gardé dans son adresse le fragment d'un partage précédent. Le lien ne sert
   * qu'à ouvrir sur un dessin qu'aucun panier ne porte.
   *
   * `jetonVersConfig` rend `null` sur le moindre champ douteux, et le
   * configurateur s'ouvre alors sur ses défauts. Un lien abîmé n'affiche donc
   * jamais un néon composé à moitié — voir `partage.ts`.
   */
  const jetonPartage = useMemo(() => {
    try {
      const h = window.location.hash || '';
      const m = /[#&]n=([A-Za-z0-9_-]+)/.exec(h);
      return m ? jetonVersConfig(m[1]!) : null;
    } catch {
      return null;
    }
  }, []);
  /**
   * LE LIEN D'ENTRÉE (B35) — celui que le marchand écrit à la main.
   *
   * Le jeton `#n=` ci-dessus naît d'un dessin existant : personne ne le tape.
   * Un lien d'entrée répond au besoin inverse — une campagne, un article, une
   * fiche produit qui ouvrent sur « BONJOUR en Pacifico, 25 cm » :
   *
   *     ?ahns-texte=BONJOUR&ahns-police=pacifico&ahns-hauteur=25
   *
   * Il passe APRÈS le jeton dans l'ordre de priorité, et c'est volontaire : un
   * client qui ouvre le lien de partage de son propre dessin doit retrouver son
   * dessin, même si l'URL traîne encore les paramètres de la campagne qui l'a
   * amené là.
   *
   * `lireLienDEntree` juge chaque paramètre séparément et n'accepte que ce que
   * le catalogue connaît : l'URL propose, le catalogue dispose.
   */
  const lienDEntree = useMemo(() => {
    try {
      return lireLienDEntree(window.location.search || '', FONTS.map((f) => f.id));
    } catch {
      return { ignores: [] as Array<{ cle: string; motif: string }> };
    }
  }, [FONTS]);

  const initLien = useMemo((): Partial<NeonConfiguration> | undefined => {
    const l = lienDEntree;
    if (!l.texte && !l.policeId && undefined === l.hauteurCm && !l.couleurHex) return undefined;
    return {
      kind: 'text' as const,
      lines: [{
        text: l.texte ?? 'Bonjour',
        fontId: l.policeId ?? 'pacifico',
        colorHex: l.couleurHex ?? '#ff2fb0',
      }],
      ...(undefined === l.hauteurCm ? {} : { letterHeightCm: l.hauteurCm }),
    };
  }, [lienDEntree]);

  const init = editCtx?.initialConfiguration ?? jetonPartage ?? initLien ?? undefined;
  const isEditing = Boolean(editCtx?.editCartItemKey);

  /**
   * FAMILLE DE PRODUIT. On choisit d'abord CE QU'ON FABRIQUE, ensuite comment :
   * une interface qui mélange un tube LED et une plaque de dibond ne se
   * comprend pas.
   */
  const families = useMemo(() => {
    const f = editCtx?.families;
    // Sans indication de la boutique, on ne propose QUE le néon. Ouvrir les
    // panneaux et les caissons d'office ferait proposer au client ce que le
    // marchand ne fabrique peut-être pas — c'est à lui de les activer.
    if (!f) return FAMILIES.filter((x) => 'neon' === x.id);
    const actives = FAMILIES.filter((x) => true === f[x.id as 'neon' | 'panel' | 'boxSign']);
    return actives.length ? actives : FAMILIES.filter((x) => 'neon' === x.id);
  }, [editCtx]);
  const initialKind = init?.kind === 'panel' ? 'panel' : init?.kind === 'box-sign' ? 'boxSign' : 'neon';
  const [family, setFamily] = useState<'neon' | 'panel' | 'boxSign'>(
    families.some((f) => f.id === initialKind) ? initialKind : (families[0]!.id as 'neon'),
  );

  // Dimensions SAISIES — panneaux et caissons. Le néon, lui, déduit sa largeur
  // du texte : elle ne se saisit pas.
  /* La grille d'écritures est repliée par défaut : douze visibles, le reste
     derrière un bouton. Voir le commentaire au-dessus de « .fontpick ». */
  const [policesOuvertes, setPolicesOuvertes] = useState(false);
  const [plateW, setPlateW] = useState(init?.sizeCm?.widthCm ?? 100);
  const [plateH, setPlateH] = useState(init?.sizeCm?.heightCm ?? 50);
  const [material, setMaterial] = useState(init?.panel?.material ?? init?.boxSign?.material ?? 'dibond');
  const [thickness, setThickness] = useState(init?.panel?.thicknessMm ?? 3);
  const [panelFinish, setPanelFinish] = useState(init?.panel?.finish ?? 'printed');
  const [panelCut, setPanelCut] = useState(init?.panel?.cut ?? 'rect');
  const [doubleSided, setDoubleSided] = useState(Boolean(init?.panel?.doubleSided));
  const [letterMaterial, setLetterMaterial] = useState<'acrylic' | 'wood' | 'metal'>(init?.panel?.channelLetters?.material ?? 'acrylic');
  const [letterDepthMm, setLetterDepthMm] = useState(init?.panel?.channelLetters?.depthMm ?? 30);
  const [letterFaceColor, setLetterFaceColor] = useState(init?.panel?.channelLetters?.faceColor ?? '#f4d900');
  const [letterSideColor, setLetterSideColor] = useState(init?.panel?.channelLetters?.sideColor ?? '#d6b600');
  const [letterLighting, setLetterLighting] = useState<'none' | 'front' | 'back' | 'front-back'>(init?.panel?.channelLetters?.lighting ?? 'front-back');
  const [letterGlowColor, setLetterGlowColor] = useState(init?.panel?.channelLetters?.glowColor ?? '#ff5a5f');
  const [multiLayer, setMultiLayer] = useState((init?.panel?.channelLetters?.backboardLayers?.length ?? 0) > 0);
  const [backboardLayers, setBackboardLayers] = useState(init?.panel?.channelLetters?.backboardLayers ?? [
    { material: 'acrylic' as const, color: '#ffffff', thicknessMm: 5, extensionCm: 1.2 },
    { material: 'metal' as const, color: '#24262b', thicknessMm: 3, extensionCm: 2.4 },
  ]);
  const [boxDepth, setBoxDepth] = useState(init?.boxSign?.depthCm ?? 12);
  const [boxFaces, setBoxFaces] = useState<1 | 2>(init?.boxSign?.faces ?? 1);
  const [boxPrinted, setBoxPrinted] = useState(init?.boxSign?.printedFace !== false);

  /** Épaisseurs réellement disponibles pour la matière choisie. */
  const thicknesses = useMemo(
    () => DEFAULT_MATERIALS[material as keyof typeof DEFAULT_MATERIALS]?.thicknessesMm ?? [3],
    [material],
  );
  // Changer de matière peut rendre l'épaisseur courante impossible : on la
  // ramène plutôt que de laisser un choix qui ne se fabrique pas.
  useEffect(() => {
    if (!thicknesses.includes(thickness)) setThickness(thicknesses[0]!);
  }, [thicknesses, thickness]);
  /*
   * LE TEXTE DE DÉPART EST UN EXEMPLE, PAS UNE SAISIE.
   *
   * Il faut pouvoir le distinguer, maintenant qu'un logo ne remplace plus
   * le texte mais s'y ajoute : sans cela, un client qui téléverse son logo
   * sans avoir touché au champ repartirait avec « Hello » gravé dessus.
   */
  const [lines, setLines] = useState<NeonLine[]>(
    init?.lines?.length
      ? (init.lines as NeonLine[])
      : [{ text: TEXTE_DE_DEPART, fontId: 'pacifico', colorHex: '#ff2d95' }],
  );
  const [letterHeightCm, setLetterHeightCm] = useState(init?.letterHeightCm ?? 18);
  const [rgb, setRgb] = useState(init?.colorMode === 'rgb');
  const [supportType, setSupportType] = useState<SupportType>(init?.support?.type ?? 'contour');
  const [finish, setFinish] = useState<SupportFinish>(init?.support?.finish ?? 'clear');
  const [outdoor, setOutdoor] = useState(init?.environment === 'outdoor');
  const [dimmer, setDimmer] = useState(Boolean(init?.options?.dimmerRemote));
  /*
   * LE PROGRAMMATEUR D'EXTINCTION, ET LES DEUX HEURES QUI LE RENDENT UTILE.
   *
   * R581-59 éteint les enseignes lumineuses entre 1 h et 6 h « lorsque
   * l'activité signalée a cessé » — sauf si cette activité cesse ou commence
   * entre minuit et 7 h, auquel cas la plage se décale. Vendre une minuterie
   * sans demander les horaires reviendrait à livrer un appareil réglé au
   * hasard : un bar qui ferme à 2 h aurait son enseigne éteinte en plein
   * service.
   *
   * Les défauts (19 h / 9 h) décrivent un commerce de jour, le cas majoritaire,
   * et donnent d'emblée la plage de droit commun.
   */
  const [nightTimer, setNightTimer] = useState(Boolean(init?.options?.nightTimer));
  const [fermetureH, setFermetureH] = useState(19);
  const [ouvertureH, setOuvertureH] = useState(9);
  const [express, setExpress] = useState(Boolean(init?.options?.express));
  /**
   * LES FONDS PROPOSÉS PAR CE CONFIGURATEUR.
   *
   * Deux formes coexistent, et c'est voulu. « scenes » est la nouvelle : elle
   * porte le nom ET l'adresse de l'image, donc la boutique peut montrer sa
   * propre vitrine. « backgrounds » est l'ancienne — trois booléens sur trois
   * décors dessinés ici même ; on la garde parce qu'un site dont le widget a
   * été reconstruit avant l'extension (ou l'inverse) doit continuer à montrer
   * un néon plutôt qu'un cadre vide.
   *
   * Un fond de la boutique n'a pas de « css » : on lui en fabrique un à partir
   * de son image. « cover » et non « contain » : une scène est un mur, pas une
   * vignette — elle remplit le cadre, quitte à être rognée.
   */
  const allowedBackgrounds = useMemo<Array<{ id: string; label: string; css: string; image?: string }>>(() => {
    const ctx = hostContext();
    const scenes = ctx?.scenes;
    if (scenes && scenes.length) {
      const list = scenes.map((s) => {
        // `findBackground` et non `BACKGROUNDS.find` : une boutique peut
        // demander un décor connu mais non offert par défaut, comme le mur
        // crème. Sans cela elle recevait le premier décor venu — un mur
        // sombre — pendant que la 3D lui montrait son mur crème.
        const livre = findBackground(s.id);
        return {
          id: s.id,
          label: s.label || livre?.label || s.id,
          // L'adresse est conservée TELLE QUELLE à côté du css : la 3D en a
          // besoin comme texture, et elle ne peut pas la relire dans une
          // déclaration `background` CSS.
          image: s.image,
          css: s.image
            ? `url("${s.image.replace(/"/g, '%22')}") center / cover no-repeat, #14161c`
            : (livre?.css ?? BACKGROUNDS[0]!.css),
        };
      });
      if (list.length) return list;
    }
    const list = BACKGROUNDS.filter((b) => ctx?.backgrounds?.[b.id as 'dark' | 'brick' | 'room'] !== false);
    const retenus = list.length ? list : BACKGROUNDS;
    /*
     * LA PEAU PROPOSE SES PROPRES LIEUX, LES TROIS.
     *
     * Une peau ne pose pas un néon sur un fond : elle le pose QUELQUE PART.
     * Et il n'y a aucune raison que seule la première vignette suive la peau
     * pendant que les deux autres restent des murs de studio : un
     * configurateur de salon de coiffure propose trois salons — coiffure,
     * barbier, institut — pas un salon plus deux fonds quelconques.
     *
     * La famille vient de `themes.ts`. Le premier est le défaut ; le client
     * garde le droit d'en changer, mais à l'intérieur du monde de la peau.
     *
     * Et seulement quand la boutique n'a pas défini ses propres scènes : dans
     * ce cas c'est elle qui décide, et lui imposer une famille par-dessus
     * serait ignorer son réglage.
     */
    const famille = resolveTheme(hostContext()?.appearance?.theme).decors;
    if (famille?.length) {
      // Les décors viennent du LIVRE (`EXTRA_BACKGROUNDS`), plus d'une copie
      // écrite ici : la 3D lit les mêmes identifiants, et les deux vues ne
      // peuvent pas diverger.
      const lieux = famille.map((id) => findBackground(id)).filter(Boolean) as typeof retenus;
      if (lieux.length) return lieux;
    }
    return retenus;
  }, []);
  const [background, setBackground] = useState(allowedBackgrounds[0]!);
  /**
   * LA PHOTO DU CLIENT, À L'ÉCHELLE (B12).
   *
   * `parcours-configurateur-ux` §1 étape 8 : « décor photo → photo du client à
   * l'échelle → RA murale ». Le décor montre un mur qui n'est pas le sien ; la
   * RA montre le sien mais réclame un téléphone récent ET d'être devant le mur.
   * Entre les deux, le cas le plus fréquent : quelqu'un à son bureau, avec une
   * photo de son salon.
   *
   * TOUT RESTE DANS LE NAVIGATEUR. La photo devient une `blob:` locale ; elle
   * n'est ni envoyée, ni enregistrée, ni jointe à la commande. C'est vrai par
   * construction — et c'est à ÉCRIRE, parce que le visiteur n'a aucun moyen de
   * le vérifier (même règle que le flux caméra de la RA, §8.2).
   */
  const [photo, setPhoto] = useState<{ url: string; largeur: number; hauteur: number } | null>(null);
  const [photoPoints, setPhotoPoints] = useState<Array<[number, number]>>([]);
  const [photoRefCm, setPhotoRefCm] = useState('204');
  const [photoEchelle, setPhotoEchelle] = useState<Echelle | null>(null);
  const [mesurePhoto, setMesurePhoto] = useState(false);
  const entreePhoto = useRef<HTMLInputElement>(null);

  const choisirPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // On garde les dimensions NATURELLES : c'est en pixels d'image que le
      // segment se mesure, et une image affichée à 40 % donnerait une échelle
      // deux fois et demie trop grande.
      setPhoto((p) => { if (p) URL.revokeObjectURL(p.url); return { url, largeur: img.naturalWidth, hauteur: img.naturalHeight }; });
      setPhotoPoints([]);
      setPhotoEchelle(null);
      setMesurePhoto(true);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    // Le champ est remis à zéro : sans cela, rechoisir LE MÊME fichier après
    // l'avoir refusé ne déclenche aucun évènement.
    e.target.value = '';
  };

  /** Un clic sur la photo pose un bout du segment, en pixels d'IMAGE. */
  const pointerPhoto = (ev: React.MouseEvent<HTMLImageElement>) => {
    if (!photo) return;
    const r = ev.currentTarget.getBoundingClientRect();
    /*
     * UNE IMAGE PAS ENCORE DIMENSIONNÉE NE SE LAISSE PAS CLIQUER.
     *
     * Sans cette garde, la division rend `NaN`, le point est mémorisé quand
     * même, et le panneau répond « ce trait est trop court » — un message
     * doublement faux : le trait n'est pas court, il n'existe pas, et le
     * client va viser plus grand pour rien.
     *
     * Trouvé en pilotant le panneau au clavier avant que la mise en page
     * n'ait eu lieu. Un client rapide, ou une image lente, tombe dessus.
     */
    if (!(r.width > 0) || !(r.height > 0)) return;
    /*
     * `object-fit: contain` MET DES BANDES, ET LA BOÎTE N'EST PAS L'IMAGE.
     *
     * Mesuré : une photo de 1600 × 900 (rapport 1,778) s'affiche dans une boîte
     * de 644 × 331 (rapport 1,945), parce que `max-height: 46vh` a écrêté la
     * hauteur. L'image dessinée fait donc 588 px de large, centrée, avec
     * 28 pixels de vide de chaque côté.
     *
     * Rapporter le clic à la BOÎTE plaçait le bord gauche de l'image à 70 px
     * au lieu de 0 : un biais silencieux sur le repère, donc sur l'échelle,
     * donc sur toutes les tailles que le client croit voir. Et un biais qui
     * grandit avec l'écrêtage, c'est-à-dire sur les petits écrans.
     *
     * On reconstruit donc le rectangle réellement dessiné avant de convertir.
     */
    const rapportImage = photo.largeur / photo.hauteur;
    const rapportBoite = r.width / r.height;
    const dessineW = rapportBoite > rapportImage ? r.height * rapportImage : r.width;
    const dessineH = rapportBoite > rapportImage ? r.height : r.width / rapportImage;
    const gauche = r.left + (r.width - dessineW) / 2;
    const haut = r.top + (r.height - dessineH) / 2;
    const x = ((ev.clientX - gauche) / dessineW) * photo.largeur;
    const y = ((ev.clientY - haut) / dessineH) * photo.hauteur;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Un clic tombé dans une bande n'est pas un point de l'image.
    if (x < 0 || y < 0 || x > photo.largeur || y > photo.hauteur) return;
    setPhotoPoints((p) => (2 === p.length ? [[x, y]] : [...p, [x, y]]));
  };

  /** L'échelle en cours de saisie, ou le refus à afficher. */
  const echelleEnCours = useMemo(() => {
    if (2 !== photoPoints.length) return null;
    return echelleDepuisReference(
      longueurSegment(photoPoints[0]!, photoPoints[1]!),
      Number(photoRefCm.replace(',', '.')),
    );
  }, [photoPoints, photoRefCm]);

  const [sceneZoom, setSceneZoom] = useState(1);
  const [scenePast, setScenePast] = useState<Array<{ lines: NeonLine[]; backgroundId: string }>>([]);
  const [sceneFuture, setSceneFuture] = useState<Array<{ lines: NeonLine[]; backgroundId: string }>>([]);
  const dragLine = useRef<{ index: number; wordIndex: number; x: number; y: number; offset: { xCm: number; yCm: number }; snapshot: { lines: NeonLine[]; backgroundId: string }; moved: boolean } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('text');
  const [sheetFull, setSheetFull] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // Logo téléversé (remplace le texte tant qu'il est présent) — vectoriel ou
  // image matricielle, les deux mesurés (voir `logo-importe.ts`).
  const [logo, setLogo] = useState<LogoData | null>(null);
  const [logoHeightCm, setLogoHeightCm] = useState(40);
  /*
   * UNE HAUTEUR DE LOGO HORS BORNES SE RAMENE DANS LES BORNES.
   *
   * Le curseur du logo montait a 120 cm avant qu'il partage celles des
   * lettres. Une configuration enregistree a 100 cm, rechargee par un lien
   * ou par le panier, porterait donc une hauteur que le curseur ne sait plus
   * atteindre : le client la verrait sans pouvoir y revenir. On la ramene, et
   * le prix suit — plutot qu'un chiffre que personne ne peut plus reproduire.
   */
  useEffect(() => {
    setLogoHeightCm((h) => Math.min(sizeBounds.maxCm, Math.max(sizeBounds.minCm, h)));
  }, [sizeBounds.minCm, sizeBounds.maxCm]);
  const [logoColor, setLogoColor] = useState('#ff2d95');
  const [logoError, setLogoError] = useState<string | null>(null);
  /* Le détourage puis la squelettisation d'une image prennent le temps
     qu'ils prennent — près d'une seconde sur un logo chargé. Sans ce
     témoin, le client clique, rien ne bouge, et il reclique. */
  const [logoMesure, setLogoMesure] = useState(false);
  /*
   * OÙ LE LOGO SE POSE, ET OÙ LE CLIENT L'A MIS.
   *
   * `logoPlacement` donne la composition de départ — en dessous du texte,
   * parce que c'est là que va une signature et que c'est ce que montrent les
   * enseignes du métier. `logoOffset` est le geste du client par-dessus,
   * exactement comme `wordOffsets` l'est pour un mot : on ne lui impose pas
   * une grille, on lui donne un point de départ qui tient debout.
   *
   * Aucun des deux n'entre dans le prix — voir `NeonConfiguration.logo`.
   */
  /*
   * QUEL MOT LES PASTILLES TEIGNENT.
   *
   * `null` — le cas ordinaire — veut dire TOUTE la ligne. Une rangee de
   * pastilles par mot aurait empile trois rangees de quinze sur une ligne
   * de trois mots : on garde UNE rangee, et on dit ce qu'elle vise.
   */
  const [motChoisi, setMotChoisi] = useState<{ ligne: number; mot: number } | null>(null);
  const [logoPlacement, setLogoPlacement] = useState<'below' | 'above'>('below');
  const [logoOffset, setLogoOffset] = useState({ xCm: 0, yCm: 0 });
  // Vue 2D (défaut) / 3D (géométrie réelle : tubes extrudés + support).
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');

  /**
   * LA MESURE D'USAGE (B35) — le widget émet, il n'envoie rien.
   *
   * Ce composant est embarqué chez un marchand, sur son domaine, sous SA
   * politique de confidentialité et SA bannière de consentement. Un appel
   * réseau parti d'ici serait un tiers qu'il n'a pas déclaré, dans un
   * consentement qu'il n'a pas recueilli — il l'apprendrait d'une mise en
   * demeure.
   *
   * On émet donc un événement DOM, et le marchand le branche sur l'analytique
   * qu'il a déjà. `emettreMesure` interdit au passage tout ce qui ressemble au
   * texte saisi : un néon porte un prénom, une date de mariage, le nom d'un
   * enfant, et rien de cela n'a sa place dans une mesure d'audience.
   */
  const mesurer = useCallback((m: Parameters<typeof emettreMesure>[1]) => {
    const racine = racineRef.current;
    emettreMesure(racine && (racine.getRootNode() as ShadowRoot | null)?.host, m);
  }, []);
  const [geom3d, setGeom3d] = useState<NeonGeometry | null>(null);
  /**
   * Support minimal pour la 3D d'une plaque : aucune ligne à plier, mais la
   * vue a besoin d'un objet valide pour se construire. Les dimensions
   * viennent de la saisie, pas d'ici.
   */
  const geomPlaque = useMemo<NeonGeometry>(
    () => ({
      strokes: [], contourOutline: [], letterOutlines: [], glyphOutlines: [],
      widthPx: 100, heightPx: 100,
      ink: { x0: 0, y0: 0, w: 100, h: 100 },
      pxPerCm: 1, tubeLengthM: 0,
    }),
    [],
  );
  const [building3d, setBuilding3d] = useState(false);
  // Néon allumé / éteint : voir le tube hors tension est une attente réelle
  // (le client veut savoir à quoi ressemble l'objet de jour, éteint).
  const [lit, setLit] = useState(true);
  /**
   * LE REPÈRE À L'ÉCHELLE (E25), et pourquoi il est ALLUMÉ par défaut.
   *
   * `parcours-configurateur-ux` §2 le classe premier contre le seul problème
   * qui coûte des retours — « reçu 30 cm × 2 cm alors que la photo le montrait
   * au-dessus du canapé ». Un remède qu'il faut penser à activer ne protège que
   * ceux qui savaient déjà. Il se coupe, il ne se demande pas.
   */
  const [repere, setRepere] = useState(true);

  /*
   * L'OUVERTURE EST LA PREMIÈRE MESURE, et la seule que le visiteur ne
   * déclenche pas. Sans elle, aucun taux ne se calcule : on saurait combien de
   * gens ouvrent la 3D, jamais sur combien.
   */
  useEffect(() => { mesurer({ etape: 'ouverture' }); }, [mesurer]);

  /*
   * LES ÉTAPES INTERMÉDIAIRES (B35, reste).
   *
   * L'ouverture, le passage en 3D et l'ajout au panier faisaient les trois
   * bornes d'un entonnoir. Entre elles, on ne savait rien : un visiteur qui
   * ouvre, essaie quatre polices et s'en va ressemblait à un visiteur qui ouvre
   * et s'en va.
   *
   * ── POURQUOI DES EFFETS ET NON DES GESTIONNAIRES DE CLIC ──────────────────
   *
   * Un gestionnaire n'attrape que le geste qu'on lui a branché. La police
   * change au clic d'une vignette, mais aussi par un lien d'entrée, par un
   * jeton de partage, par la reprise d'un panier — quatre chemins, dont trois
   * qu'on oublierait. L'effet observe l'ÉTAT, donc les quatre.
   *
   * ── ET LA DÉPENDANCE EST LA VALEUR, PAS L'OBJET ──────────────────────────
   *
   * `[lines[0]?.fontId]` et non `[lines]` : le tableau est recréé à chaque
   * frappe au clavier, et dépendre de lui enverrait un événement « police »
   * par caractère tapé. Ce serait pire que de ne rien mesurer — le marchand
   * lirait des milliers de changements de police qui n'ont jamais eu lieu.
   */
  const policeCourante = lines[0]?.fontId;
  useEffect(() => {
    if (policeCourante) mesurer({ etape: 'police', famille: family, policeId: policeCourante });
  }, [policeCourante, family, mesurer]);

  const couleurCourante = lines[0]?.colorHex;
  useEffect(() => {
    // La couleur n'est pas un choix de catalogue au sens de `policeId` : c'est
    // un hex, donc une chaîne libre, et `emettreMesure` la refuserait. On
    // signale l'étape, pas la teinte.
    if (couleurCourante) mesurer({ etape: 'couleur', famille: family });
  }, [couleurCourante, family, mesurer]);

  useEffect(() => {
    mesurer({ etape: 'taille', famille: family, hauteurCm: letterHeightCm });
  }, [letterHeightCm, family, mesurer]);

  useEffect(() => {
    mesurer({ etape: 'support', famille: family });
  }, [supportType, family, mesurer]);


  /** Construit la même géométrie pour la vue 3D et pour le dossier atelier. */
  const buildCurrentGeometry = useCallback(async (): Promise<NeonGeometry | null> => {
    /*
     * LA FAMILLE PANNEAU N'A PAS DE GLYPHE À PLIER — SAUF EN FINITION LETTRES.
     *
     * Cette ligne renvoyait `geomPlaque` — contours vides — pour TOUTE la
     * famille panneau. Conséquence : le bloc de rendu des lettres boîtiers de
     * `three-view.tsx` — retour, face, halo, couches de fond — n'a jamais pu
     * s'exécuter. Du code mort, et la ligne d'appel le disait sans qu'on
     * l'entende : `'letters' === panelFinish && geom3d ? geom3d : geomPlaque`,
     * avec un `geom3d` qui ne pouvait rien porter. Mesuré : `strokeCount: 0`,
     * pas une lettre à l'écran (docs/43 §69).
     *
     * Une première tentative de déblocage a été RÉFUTÉE PAR LE RENDU : elle
     * servait `letterOutlines`, qui est un contour de découpe dilaté du rayon
     * du tube plus 4 mm, et les trois lettres d'un « ABC » se soudaient en une
     * masse. C'est `glyphOutlines` qu'il fallait — le glyphe nu, ajouté depuis
     * à `neon-geometry.ts` en une ligne.
     *
     * Une plaque imprimée ou brute, elle, n'a effectivement aucun glyphe à
     * plier : le court-circuit reste juste pour elle.
     */
    const lettresDecoupees = 'panel' === family && 'letters' === panelFinish;
    if (('panel' === family && !lettresDecoupees) || 'boxSign' === family) return geomPlaque;
    await document.fonts.ready;
    const geomTexte = () => buildTextGeometry(
      lines.filter((l) => l.text.trim() !== '').map((l) => {
        const font = FONTS.find((f) => f.id === l.fontId) ?? FONTS[0]!;
        return { text: l.text, cssFamily: font.cssFamily, fontWeight: font.weight, fontId: font.id };
      }),
      letterHeightCm,
      MANIFESTS,
      tubeDiametreCm,
    );
    if (logo) {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        /*
         * ON REPART DU DESSIN, PAS DES TUBES DÉJÀ TRACÉS.
         *
         * Depuis qu'une image importée s'affiche sous forme de trajets,
         * `dataUrl` EST le squelette. Le rastériser pour le squelettiser à
         * nouveau fait fondre le tube : à 480 px, deux trajets voisins se
         * touchent et n'en donnent plus qu'un. Mesuré le 7 septembre 2026
         * sur « démo » : 3,91 m rendus pour 5,31 m facturés, soit
         * −26 %, là où la première passe tombait juste.
         *
         * `sourceUrl` est le dessin détouré — la même entrée que celle qui
         * a servi à la mesure. La 3D et le prix décrivent alors le même
         * tracé, ce qui est tout ce qu'on lui demande.
         */
        img.src = logo.sourceUrl ?? logo.dataUrl;
      });
      const geomLogo = img.naturalWidth > 0 ? buildLogoGeometry(img, logoHeightCm, tubeDiametreCm) : null;
      /*
       * LA 3D MONTRE LA MÊME PIÈCE QUE LA 2D.
       *
       * Elle ne rendait que le logo dès qu'un logo était là. Depuis que les
       * deux se composent, s'arrêter au logo montrerait au client la moitié de
       * ce qu'il paie — et le banc e2e « compare le tracé dessiné à la longueur
       * facturée » verrait passer un écart de moitié.
       *
       * L'écart entre les deux est celui de `metrics.ts` : 0,35 × la hauteur
       * de lettre. Une constante recopiée est une constante qui divergera ; on
       * la reprend donc de la même source que la mesure.
       */
      const geomT = avecTexte ? geomTexte() : null;
      if (geomLogo && geomT) {
        const ecart = letterHeightCm * INTERLINE_RATIO;
        return 'above' === logoPlacement
          ? composerGeometries(geomLogo, geomT, ecart)
          : composerGeometries(geomT, geomLogo, ecart);
      }
      return geomLogo;
    }
    return geomTexte();
    // `avecTexte` et `tubeDiametreCm` sont tous deux dérivés de `lines`, qui
    // est dans la liste : les nommer ici les lirait avant leur déclaration.
  }, [family, panelFinish, geomPlaque, logo, logoHeightCm, logoPlacement, lines, letterHeightCm]);

  /*
   * CES TROIS-LÀ REMONTENT AVANT LE DESSIN DU LOGO.
   *
   * Ils vivaient plus bas, après la configuration. Depuis que l'aperçu du
   * logo se dessine à la taille réglée, il lui faut le DIAMÈTRE DU TUBE —
   * et un `useMemo` lit ses dépendances au rendu, pas plus tard : les
   * laisser derrière rendait le composant muet sur un « Cannot access
   * 'tubeDiametreCm' before initialization ». Aucun des trois ne dépend de
   * la configuration, ils peuvent donc la précéder.
   */
  // Coefficients du marchand (Réglages WP) : le widget AFFICHE avec les mêmes
  // coefficients que le serveur FACTURE.
  const hostPricing = useMemo(() => hostContext()?.pricing, []);

  const coeffEffectifs = useMemo(() => ({ ...DEFAULT_COEFFICIENTS, ...(hostPricing || {}) }), [hostPricing]);

  /*
   * LE DIAMÈTRE DU TUBE VIENT DU CATALOGUE, PLUS D'UNE CONSTANTE (écart E28).
   *
   * `SPEC.tubeDiameterCm` valait 1,0 en dur. docs/02 §2 vend pourtant « tube
   * LED 8 mm (fin), 10 mm (standard) — choix marchand par catalogue » : un
   * marchand qui passe au Ø 8 voyait la facture compter 8, la validation
   * refuser sur 8, et l'aperçu dessiner 10. Le client composait un objet qui
   * n'était pas celui qu'il recevait.
   *
   * `physique-neon-led` §2.2 le dit sans détour : « Si le catalogue ouvre le
   * 8 mm, l'aperçu 2D, la 3D et les cotes doivent suivre. »
   *
   * Le plus gros des tubes du dessin — voir `diametreTubeDuDesign` : le masque
   * est rastérisé pour l'ensemble, et retenir le plus petit promettrait un
   * trait plus fin que celui qui arrive.
   */
  const tubeDiametreCm = useMemo(
    () => diametreTubeDuDesign(lines, coeffEffectifs) / 10,
    [lines, coeffEffectifs],
  );
  /*
   * LE LOGO TEL QU'IL SERA DESSINÉ, à la taille que le client a réglée.
   *
   * `logo` porte la mesure ; celui-ci porte le DESSIN. Tout ce qui affiche
   * ou chiffre la pièce passe par lui — l'aperçu 2D, la 3D, les cotes, le
   * prix, les captures — sans quoi l'un montrerait un tube de la bonne
   * épaisseur et l'autre pas. Voir `logoAEchelle`.
   */
  const logoRendu = useMemo(
    () => (logo ? logoAEchelle(logo, logoHeightCm, tubeDiametreCm) : null),
    // `tubeDiametreCm` dérive de `lines`, qui suffit à la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logo, logoHeightCm, lines],
  );

  const config: NeonConfiguration = useMemo(() => {
    const common = {
      colorMode: (rgb ? 'rgb' : 'solid') as NeonConfiguration['colorMode'],
      support: { type: (outdoor ? 'box' : supportType) as SupportType, finish },
      environment: (outdoor ? 'outdoor' : 'indoor') as NeonConfiguration['environment'],
      powerRegion: 'EU' as const,
      mounting: 'screws' as const,
      options: { dimmerRemote: dimmer, express, nightTimer },
    };
    // --- PANNEAU ET CAISSON ------------------------------------------------
    if ('panel' === family) {
      return {
        kind: 'panel' as const,
        lines: [],
        letterHeightCm,
        ...common,
        sizeCm: { widthCm: plateW, heightCm: plateH },
        panel: {
          material: material as 'pvc',
          thicknessMm: thickness,
          finish: panelFinish as 'printed',
          cut: panelCut as 'rect',
          doubleSided,
          ...('letters' === panelFinish ? {
            channelLetters: {
              material: letterMaterial,
              depthMm: letterDepthMm,
              faceColor: letterFaceColor,
              sideColor: letterSideColor,
              lighting: letterLighting,
              glowColor: letterGlowColor,
              backboardLayers: multiLayer && 'shape' === panelCut ? backboardLayers : [],
            },
          } : {}),
        },
      };
    }
    if ('boxSign' === family) {
      return {
        kind: 'box-sign' as const,
        lines: [],
        letterHeightCm,
        ...common,
        sizeCm: { widthCm: plateW, heightCm: plateH },
        boxSign: {
          material: material as 'dibond',
          depthCm: boxDepth,
          faces: boxFaces,
          printedFace: boxPrinted,
        },
      };
    }
    if (logo) {
      const scale = logoHeightCm / (logoRendu ?? logo).unitsH; // cm par unité SVG
      /*
       * LE LOGO NE REMPLACE PLUS LE TEXTE, IL S'Y AJOUTE.
       *
       * On envoyait `lines: []` et `letterHeightCm: logoHeightCm` : le texte
       * saisi disparaissait de la configuration, et la hauteur de LETTRE
       * portait celle du LOGO. Un client qui voulait son logo au-dessus de son
       * nom devait commander deux pièces.
       *
       * Les deux hauteurs sont maintenant distinctes — `letterHeightCm` reste
       * celle des lettres, `logo.heightCm` celle du logo — et `measureConfiguration`
       * les compose (miroir PHP dans `class-ahns-pricing.php`).
       *
       * Sans texte, la configuration est identique à ce qu'elle était :
       * `lines` vide et les deux hauteurs égales. Les commandes enregistrées se
       * relisent donc sans rien changer.
       */
      const avecTexte = lines.some((l) => '' !== l.text.trim());
      return {
        kind: 'logo-svg',
        lines: avecTexte ? lines : [],
        letterHeightCm: avecTexte ? letterHeightCm : logoHeightCm,
        ...common,
        logo: {
          tubeLengthMm: Math.round((logoRendu ?? logo).unitsLen * scale * 10 * 100) / 100,
          widthCm: Math.round((logoRendu ?? logo).unitsW * scale * 100) / 100,
          heightCm: logoHeightCm,
          ...(avecTexte ? { placement: logoPlacement } : {}),
          ...(logoOffset.xCm || logoOffset.yCm ? { offsetXCm: logoOffset.xCm, offsetYCm: logoOffset.yCm } : {}),
        },
      };
    }
    return { kind: 'text', lines, letterHeightCm, ...common };
  }, [
    family, plateW, plateH, material, thickness, panelFinish, panelCut, doubleSided,
    letterMaterial, letterDepthMm, letterFaceColor, letterSideColor, letterLighting, letterGlowColor, multiLayer, backboardLayers,
    boxDepth, boxFaces, boxPrinted,
    logo, logoRendu, logoHeightCm, logoPlacement, logoOffset, lines, letterHeightCm, rgb, supportType, finish, outdoor, dimmer, express, nightTimer,
  ]);

  const measurements = useMemo(
    () => measureConfiguration(config, FONT_CLASS_BY_ID, MANIFESTS),
    [config],
  );
  // Langue du site hôte (WP get_locale() mappée) — français par défaut.
  const locale = useMemo(() => hostContext()?.locale, []);
  const isRtl = isRtlLocale(locale);
  const T = (s: string) => t(s, locale);
  /** Libellés du détail de prix, traduits par CLÉ (le core émet du français). */
  const priceLineLabel = (l: PriceLine): string => {
    switch (l.key) {
      case 'base': return T('Mise en route');
      case 'tube': return `${T('Tube LED')} ${measurements.tubeLengthM.toFixed(2)} m`;
      case 'support': return T('Support');
      case 'box': return T('Caisson');
      case 'power': return T('Alimentation');
      case 'rgb': return T('RGB color-changing');
      case 'dimmer': return T('Télécommande + variateur');
      case 'night-timer': return T('Programmateur d’extinction');
      case 'mounting': return l.label === 'Pied à poser' ? T('Pied à poser') : T('Fixations');
      case 'sizeTier': return l.label === 'Supplément taille' ? T('Supplément taille') : T('Prix minimum (taille)');
      case 'outdoor': return T('Extérieur');
      case 'express': return T('Production express');
      default: return l.label;
    }
  };
  const price = useMemo(
    () => computePrice({ config, measurements, coefficients: hostPricing }),
    [config, measurements, hostPricing],
  );
  /**
   * Les coefficients EFFECTIFS — plateforme + surcharges du marchand — tels
   * que le calcul les applique. Ils servent à AFFICHER le prix des extras
   * avant qu'ils soient cochés (le ticket du Comptoir les annonce comme un
   * menu) : ce sont les mêmes chiffres que la facture, pas une copie.
   */


  /**
   * PROFONDEUR DU CAISSON MONTRÉE EN 3D — celle du barème, pas un 8 écrit en
   * dur (écart E11).
   *
   * Elle décide de ce que le client VOIT ; le prix, lui, la prenait déjà de
   * `coeff.boxDepthCm`. Les deux valeurs étant égales par défaut, la divergence
   * n'apparaissait que chez un marchand qui l'avait réglée — soit exactement
   * celui à qui elle coûtait cher, puisqu'il voyait une chose et en facturait
   * une autre.
   */
  const profondeurCaissonCm = config.boxDepthCm ?? coeffEffectifs.boxDepthCm;

  const issues = useMemo(
    () => validateConfiguration({
      config,
      measurements,
      fontClassById: FONT_CLASS_BY_ID,
      manifests: MANIFESTS,
      // Les coefficients du MARCHAND, pas ceux de la plateforme : c'est avec
      // eux que le serveur jugera au panier.
      coefficients: hostPricing || undefined,
    }),
    [config, measurements, hostPricing],
  );
  // Un avertissement informe sans bloquer — l'extérieur, par exemple, force
  // déjà le caisson au lieu de renvoyer le client à son erreur.
  const blockingIssues = issues.filter((i) => 'warn' !== i.severity);

  /*
   * « 19.5 » ↔ « 19:30 ». `<input type="time">` parle en chaînes, `extinction.ts`
   * en heures décimales. La conversion est ici, en un seul endroit, et une
   * saisie illisible RETOMBE SUR L'ANCIENNE VALEUR au lieu de produire un NaN
   * qui remonterait silencieusement jusqu'à la fiche d'atelier.
   */
  const enHhMm = (h: number) => {
    const e = Math.floor(h);
    const m = Math.round((h - e) * 60);
    return `${String(e).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const depuisHhMm = (v: string, repli: number) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return repli;
    const h = Number(m[1]) + Number(m[2]) / 60;
    return Number.isFinite(h) && h >= 0 && h < 24 ? h : repli;
  };

  /**
   * LE MOCKUP SUR PHOTO, EN UN FICHIER (B30).
   *
   * `parcours-configurateur-ux` §7 : « mockup sur photo du site sans travail
   * manuel » — sans retoucheur, pas sans garde-fou. C'est le pendant revendeur
   * de B12, et la différence de conséquence est entière : une image PART, elle
   * circule, elle se rouvre dans six semaines, et personne n'aura le
   * configurateur sous les yeux pour la relativiser.
   *
   * Deux règles viennent de `core` et ne se négocient pas : on ne rétrécit
   * JAMAIS le néon pour qu'il tienne dans le cadre, et l'image porte ses cotes.
   */
  const [mockupErreur, setMockupErreur] = useState<string | null>(null);
  const exporterMockup = () => {
    setMockupErreur(null);
    if (!photo || !photoEchelle) {
      setMockupErreur(T('Choisissez d’abord une photo et donnez-lui son échelle.'));
      return;
    }
    const img = new Image();
    img.onerror = () => setMockupErreur(T('La photo n’a pas pu être relue.'));
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = photo.largeur;
      cv.height = photo.hauteur;
      const ctx = cv.getContext('2d');
      if (!ctx) { setMockupErreur(T('Ce navigateur ne sait pas composer l’image.')); return; }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);

      /*
       * LES COTES DU MONTAGE SONT CELLES QUE LE CLIENT LIT À L'ÉCRAN.
       *
       * J'avais pris `measurements`, la mesure brute du texte. La pastille de
       * l'aperçu affiche, elle, `positioned*` — les cotes de la pièce telle
       * qu'elle est COMPOSÉE, lignes déplacées comprises. Constaté sur le même
       * dessin : « 51 × 19 cm » sur la pastille, « 48,6 × 18 cm » sur le
       * montage.
       *
       * Un revendeur aurait envoyé à son client une image contredisant son
       * propre devis — et c'est l'écart de taille, précisément, que tout ce
       * travail cherche à supprimer.
       */
      const largeurCm = positionedWidthCm;
      const hauteurCm = positionedHeightCm;
      const comp = compositionMockup(
        photo.largeur, photo.hauteur, photoEchelle,
        largeurCm, hauteurCm,
      );

      // Le néon sur fond TRANSPARENT : la même fonction que la capture du
      // panier, avec son halo et sa plaque.
      const neon = captureNeonCanvas(captureLines, true, plateSpec, lit);
      if (neon && plateSpec.letterHeightCm > 0) {
        /*
         * LE CANVAS EST PLUS GRAND QUE LA PIÈCE, et de beaucoup : il porte une
         * marge pour le halo et pour la plaque. Le dessiner à la largeur de la
         * pièce donnerait donc un néon TROP PETIT de toute cette marge —
         * l'erreur exacte que ce mockup existe pour éviter.
         *
         * On passe par les centimètres, qui sont la seule grandeur commune aux
         * deux images. `CAPTURE_PX_PAR_LETTRE` vient de `capture.ts` : le
         * recopier ici aurait donné deux vérités à faire diverger.
         */
        const cmParPxCanvas = plateSpec.letterHeightCm / CAPTURE_PX_PAR_LETTRE;
        const dessineW = (neon.width * cmParPxCanvas) / photoEchelle.cmParPixel;
        const dessineH = (neon.height * cmParPxCanvas) / photoEchelle.cmParPixel;
        // Centré sur la place de la PIÈCE, pas du canvas : la marge déborde
        // symétriquement, comme le halo qu'elle porte.
        ctx.drawImage(
          neon,
          comp.xPx + comp.largeurPx / 2 - dessineW / 2,
          comp.yPx + comp.hauteurPx / 2 - dessineH / 2,
          dessineW, dessineH,
        );
      }

      /*
       * LA LÉGENDE — la moitié utile du fichier.
       *
       * Un mockup muet redevient la photo trompeuse de l'avis qui a fondé tout
       * ce travail. Deux lignes de texte retirent à l'image tout son pouvoir de
       * nuisance, et elles coûtent moins cher que le premier retour.
       */
      const lignes = legendeMockup(largeurCm, hauteurCm, photoEchelle, comp.deborde);
      // La taille suit celle de l'image : une légende de 12 px sur une photo de
      // 4 000 px serait illisible, et l'illisible ne protège personne.
      const taille = Math.max(12, Math.round(cv.width / 55));
      const pad = Math.round(taille * 0.7);
      const hBloc = Math.round(lignes.length * taille * 1.45 + pad * 2);
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(0, cv.height - hBloc, cv.width, hBloc);
      ctx.fillStyle = '#ffffff';
      ctx.font = `${taille}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      lignes.forEach((l, i) => ctx.fillText(l, pad, cv.height - hBloc + pad + i * taille * 1.45));

      cv.toBlob((b) => {
        if (!b) { setMockupErreur(T('L’image n’a pas pu être produite.')); return; }
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mockup-${(lines.map((l) => l.text).filter(Boolean).join('-') || 'neon').slice(0, 30).replace(/[^\w-]+/g, '-')}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    };
    img.src = photo.url;
  };

  /** Ce que le programmateur exécutera, dit en français au client. */
  const plageDite = (() => {
    const e = extinctionRequise({ fermetureH, ouvertureH });
    if ('aucune' === e.obligation) {
      return 'activite-continue' === e.motif
        // Le cas de l'hôtel ou de la pharmacie de garde : l'obligation est
        // conditionnée à « lorsque l'activité signalée a cessé ».
        ? T('Votre activité ne cesse pas : l’extinction nocturne ne s’applique pas. Le programmateur reste utile pour économiser.')
        : 'plage-nulle' === e.motif
          ? T('Avec ces horaires, aucune extinction n’est due : votre activité reprend avant la fin de la plage.')
          : T('Horaires illisibles : corrigez-les pour que l’atelier règle l’appareil.');
    }
    const r = 'nuit' === e.regle
      ? T('activité de nuit : la plage est décalée (art. R581-59, second alinéa)')
      : T('plage de droit commun');
    return `${T('Éteint de')} ${heureFr(e.deH)} ${T('à')} ${heureFr(e.aH)} · ${r}`;
  })();

  const patchLine = (i: number, patch: Partial<NeonLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const edited = () => { setJustAdded(false); setCartError(null); };

  const [submitting, setSubmitting] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  /** Support tel qu'il doit être dessiné (aperçu 2D ET capture panier). */
  const plateSpec: CapturePlate = useMemo(() => {
    const effType = outdoor ? 'box' : supportType;
    const isCut = effType === 'contour' || effType === 'cut-to-letter';
    return {
      kind: effType === 'none' ? 'none' : isCut ? 'cut' : 'rect',
      dilateCm: tubeDiametreCm / 2 + (effType === 'contour' ? 1.2 : 0.4),
      marginCm: 3,
      fill: (PLATE_2D[finish] ?? PLATE_2D.clear!).solid,
      edge: (PLATE_2D[finish] ?? PLATE_2D.clear!).edge,
      letterHeightCm,
    };
  }, [outdoor, supportType, finish, letterHeightCm]);

  /** Lignes prêtes pour la capture / texture 3D (police CSS + couleur résolues). */
  /* Y a-t-il du texte ? C'est ce qui décide si le logo est LA pièce ou une
     partie d'elle — donc si le curseur de taille parle des lettres. */
  const avecTexte = lines.some((l) => '' !== l.text.trim());
  const captureLines: CaptureLine[] = useMemo(
    () =>
      lines.map((l) => {
        const font = FONTS.find((f) => f.id === l.fontId) ?? FONTS[0]!;
        return {
          text: l.text,
          cssFamily: font.cssFamily,
          fontWeight: font.weight,
          colorHex: rgb ? '#c05bff' : l.colorHex,
          // L'aspect éteint MESURÉ, quand le marchand tient son catalogue de
          // tubes (E02). Absent, la capture délave le hex allumé elle-même.
          // En RGB, aucune bobine ne correspond : on laisse faire le calcul.
          offHex: rgb ? undefined : (couleurEteinte(l, { tubes: hostPricing?.tubes }) ?? undefined),
          // La couleur de chaque mot voyage jusqu'au panier et au devis. En
          // RGB il n'y en a qu'une : la pièce entière change en même temps.
          wordColors: rgb
            ? undefined
            : l.wordColors?.map((m) =>
                m?.colorHex
                  ? { colorHex: m.colorHex, offHex: couleurEteinte(m, { tubes: hostPricing?.tubes }) ?? undefined }
                  : undefined,
              ),
          offsetXCm: l.offsetXCm,
          offsetYCm: l.offsetYCm,
        };
      }),
    [lines, rgb, hostPricing],
  );

  /**
   * LA COULEUR DE CHAQUE TUBE DE LA 3D.
   *
   * `geom3d.strokeMots` dit à quel mot appartient chaque trajet ; il ne reste
   * qu'à lire la couleur de ce mot. Un trajet non attribué — la boucle d'un
   * logo, un trait à cheval sur deux mots — retombe sur la couleur de la
   * ligne, puis sur `glowHex` côté 3D.
   *
   * En RGB il n'y a rien à faire : la pièce entière change de couleur en
   * même temps, et un mot ne peut pas y être « d'une autre couleur ».
   */
  const couleursTraits3d = useMemo(() => {
    const mots = geom3d?.strokeMots;
    if (rgb || !mots) return undefined;
    return mots.map((m) => {
      if (!m) return undefined;
      const ligne = lines[m.ligne];
      if (!ligne) return undefined;
      return ligne.wordColors?.[m.mot]?.colorHex || ligne.colorHex;
    });
  }, [geom3d, lines, rgb]);

  /**
   * L'ÉCLAT DU HALO 3D, ancré sur le flux réel (E10).
   *
   * Le calcul est ICI et non dans la vue 3D parce qu'il dépend du CATALOGUE :
   * les lm/m déclarés d'une bobine, à défaut ses W/m, à défaut le rendement de
   * sa famille spectrale. La 3D ne connaît pas le catalogue, et ne doit pas
   * l'apprendre pour régler une opacité.
   *
   * On part de `lines` et non de `captureLines` : c'est `tubeSku` qui ouvre le
   * catalogue, et la capture ne le porte pas. En RGB, aucune bobine ne
   * correspond — on passe la couleur affichée et on laisse la famille décider.
   *
   * `eclairementDeScene` rend `null` quand rien ne permet de conclure. On
   * retombe alors sur 1, c'est-à-dire exactement le rendu d'avant : en cas de
   * doute, on ne change rien.
   */
  const eclatHalo = useMemo(() => {
    const pourFlux = lines.map((l) => (rgb
      ? { colorHex: '#c05bff' }
      : { tubeSku: l.tubeSku, colorHex: l.colorHex }));
    const e = eclairementDeScene(
      pourFlux,
      { tubeLengthM: measurements.tubeLengthM, lineTubeM: measurements.lineTubeM },
      coeffEffectifs,
      measurements.widthCm / 100,
      measurements.heightCm / 100,
    );
    return e?.eclat ?? 1;
  }, [lines, rgb, measurements, coeffEffectifs]);

  /**
   * GÉOMÉTRIE RÉELLE pour la 3D : squelette des lettres (ou du logo) → trajets
   * de tube + contours de plaque. Calculée à la demande (ouverture de la vue
   * 3D) et re-calculée quand le design ou la taille change. Les polices doivent
   * être chargées, sinon la rastérisation mesurerait une police de repli.
   */
  useEffect(() => {
    if (viewMode !== '3D') return;
    // Le passage en 3D est le geste qui sépare « je regarde » de « j'y pense » :
    // c'est celui qu'un marchand veut voir dans son entonnoir.
    mesurer({ etape: 'vue-3d', famille: family, hauteurCm: letterHeightCm });
    let cancelled = false;
    setBuilding3d(true);
    const run = async () => {
      const g = await buildCurrentGeometry();
      if (cancelled) return;
      if (!cancelled) {
        setGeom3d(g);
        setBuilding3d(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [viewMode, buildCurrentGeometry]);

  /** Le fichier déposé n'est pas vectoriel : on ne peut rien en mesurer. */
  const [needsQuote, setNeedsQuote] = useState<string | null>(null);
  const [quoteFile, setQuoteFile] = useState<string | null>(null);
  const [quoteName, setQuoteName] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteBrief, setQuoteBrief] = useState('');
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteDone, setQuoteDone] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  /** Envoie la demande à la boutique — même adresse que le panier. */
  /*
   * L'IMAGE QUI PART AVEC LA COMMANDE MONTRE TOUTE LA PIÈCE.
   *
   * Les quatre appels de capture — panier, devis, et leurs versions éteintes —
   * choisissaient entre le texte et le logo. Depuis qu'une pièce peut porter
   * les deux, ce choix en montrait la moitié, sur l'image même que regardent
   * le client au panier et l'atelier au bon à tirer.
   */
  const capturerLaPiece = (allume: boolean): Promise<string | null> | string | null => {
    if (!logo) return captureNeonPng(captureLines, 350_000, plateSpec, allume);
    if (!avecTexte) return captureLogoPng((logoRendu ?? logo).dataUrl, logoColor, 350_000, allume);
    return captureCompositePng(
      captureLines, (logoRendu ?? logo).dataUrl, logoColor, logoHeightCm, letterHeightCm, logoPlacement, 350_000, allume,
    );
  };

  const sendQuote = async () => {
    const ctx = hostContext();
    if (!ctx?.quoteAction || !ctx.ajaxUrl) return;
    setQuoteError(null);
    setQuoteSending(true);
    try {
      const fd = new FormData();
      fd.append('action', ctx.quoteAction);
      fd.append('nonce', ctx.nonce ?? '');
      fd.append('name', quoteName);
      fd.append('email', quoteEmail);
      fd.append('brief', quoteBrief);
      if (quoteFile) {
        fd.append('file', quoteFile);
        fd.append('fileName', needsQuote ?? 'logo');
      }
      // Le dessin composé accompagne la demande : c'est ce qui distingue ce
      // devis-ci d'un formulaire de contact. Le marchand voit ce que le client
      // a voulu, au lieu de le lui faire décrire.
      fd.append('config', JSON.stringify(config));
      fd.append('measurements', JSON.stringify({
        widthCm: Math.round(measurements.widthCm),
        heightCm: Math.round(measurements.heightCm),
        tubeM: Number(measurements.tubeLengthM.toFixed(2)),
      }));
      const apercu = await capturerLaPiece(true);
      if (apercu) fd.append('preview', apercu);
      // Le devis part avec l'image éteinte lui aussi : c'est là que le client
      // décide, et c'est là qu'il doit voir l'objet des deux façons (E03).
      const apercuEteint = await capturerLaPiece(false);
      if (apercuEteint) fd.append('previewOff', apercuEteint);
      const vue3d = capture3d();
      if (vue3d) fd.append('preview3d', vue3d);
      /*
       * LA MASSE PART AVEC LA COMMANDE, ELLE NE SE RECALCULE PAS EN PHP.
       *
       * Le bon à tirer l'annonce au client et la fiche de pose en a besoin. La
       * porter côté serveur demanderait de réécrire `masseEnseigne` et la table
       * des masses volumiques : deux implémentations à faire diverger, pour un
       * chiffre que le navigateur vient de calculer. C'est le même chemin que
       * la géométrie.
       */
      const m = masseEnseigne({
        // `material` sert aux DEUX familles : la ligne 392 le montre, il
        // retombe sur `boxSign.material` quand c'est un caisson.
        materiau: material,
        epaisseurMm: 'boxSign' === family ? 3 : thickness,
        largeurCm: measurements.widthCm,
        hauteurCm: measurements.heightCm,
        tubeM: measurements.tubeLengthM,
      });
      if (m.totalKg > 0) fd.append('massKg', String(m.totalKg));
      const res = await fetch(ctx.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd });
      const json = (await res.json()) as { success: boolean; data?: unknown };
      if (!json.success) {
        setQuoteError(typeof json.data === 'string' ? json.data : 'Envoi impossible.');
      } else {
        const d = json.data as { message?: string };
        setQuoteDone(d?.message ?? 'Votre demande est partie.');
      }
    } catch {
      setQuoteError('Envoi impossible. Vérifiez votre connexion.');
    } finally {
      setQuoteSending(false);
    }
  };

  /**
   * Import d'un logo — VECTORIEL OU IMAGE.
   *
   * ── CE QUE CE CHEMIN NE FAIT PLUS ───────────────────────────────────────
   *
   * Toute image matricielle partait au devis, au motif qu'« un pixel n'a pas
   * de tracé ». Le motif était juste pour le SVG et faux pour l'outil : la vue
   * 3D squelettise cette image depuis toujours (`buildLogoGeometry`). Le
   * client voyait son logo en tube à l'écran pendant qu'on lui disait qu'on ne
   * savait pas le mesurer, et il devait attendre un devis pour un chiffre que
   * son navigateur venait de calculer.
   *
   * Restent au devis ce qui n'a vraiment pas d'image exploitable — un PDF, un
   * .ai, un .eps — et toute image dont le détourage ne sort aucun dessin. La
   * porte reste donc ouverte, elle ne s'ouvre simplement plus pour rien.
   */
  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4_000_000) {
      setLogoError('Fichier trop lourd (4 Mo maximum).');
      return;
    }

    const nom = file.name.toLowerCase();
    const vectoriel = nom.endsWith('.svg') || 'image/svg+xml' === file.type;
    const matriciel = !vectoriel
      && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(nom));

    /** Repli honnête : on nomme ce qui a bloqué, et on ouvre le devis. */
    const versDevis = (motif: string | null) => {
      setLogo(null);
      setLogoError(motif);
      setNeedsQuote(file.name);
      setQuoteDone(null);
      setQuoteError(null);
      // Le visuel part AVEC la demande : un devis sans le logo ne sert à rien.
      const lecteur = new FileReader();
      lecteur.onload = () => setQuoteFile(typeof lecteur.result === 'string' ? lecteur.result : null);
      lecteur.readAsDataURL(file);
    };

    const retenir = (res: LogoData) => {
      /*
       * On efface le texte D'EXEMPLE, jamais celui du client.
       *
       * Le logo et le texte se composent désormais. Garder le texte de
       * départ écrirait « Hello » sur l'enseigne de quelqu'un qui n'a
       * demandé que son logo ; l'effacer sans regarder jetterait le nom
       * que ce même quelqu'un vient peut-être de taper.
       */
      setLines((current) => (current.length === 1 && TEXTE_DE_DEPART === current[0]!.text
        ? [{ ...current[0]!, text: '' }]
        : current));
      setLogoError(null);
      setNeedsQuote(null);
      setQuoteFile(null);
      setLogo(res);
      edited();
    };

    if (matriciel) {
      setLogoMesure(true);
      loadRasterLogo(file, tubeDiametreCm)
        .then((res) => ('error' in res ? versDevis(res.error) : retenir(res)))
        .catch(() => versDevis(null))
        .finally(() => setLogoMesure(false));
      return;
    }
    if (!vectoriel) {
      versDevis(null);
      return;
    }

    /*
     * UN SVG SE LIT EN VECTEURS, ET SINON EN IMAGE.
     *
     * `loadLogoSvgOuImage` tente d'abord les traces du client — c'est la
     * mesure la plus fidele — puis retombe sur la rasterisation quand le
     * fichier n'est pas lisible ainsi : trop lourd, du texte non vectorise,
     * ou une photo enrobee dans un SVG. Trois refus qui dataient du temps ou
     * l'on ne savait rien faire d'une image.
     */
    setLogoMesure(true);
    file.text()
      .then((txt) => loadLogoSvgOuImage(txt, tubeDiametreCm))
      .then((res) => {
        if ('error' in res) setLogoError(res.error);
        else retenir(res);
      })
      .catch(() => setLogoError('Fichier SVG illisible.'))
      .finally(() => setLogoMesure(false));
  };

  /*
   * LE DIAMÈTRE DU TUBE ENTRE DANS LA MESURE D'UNE IMAGE.
   *
   * `processMask` prolonge chaque bout libre du rayon du tube, et un logo qui
   * rend une centaine de brins accumule deux cents prolongements. Mesuré sur
   * « démo » : 97 cm d'écart entre Ø 8 et Ø 10 mm, sur 8,5 m de tube.
   * Laisser la mesure d'origine, ce serait faire bouger le prix d'un dixième
   * en changeant une couleur, sans rien dire.
   *
   * Un logo VECTORIEL ne dépend de rien : il porte ses propres tracés.
   */
  useEffect(() => {
    if (!logo || 'image' !== logo.source) return;
    if (logo.tubeDiameterCm === tubeDiametreCm) return;
    let vivant = true;
    setLogoMesure(true);
    loadRasterLogo(logo.sourceUrl ?? logo.dataUrl, tubeDiametreCm)
      .then((res) => {
        if (vivant && !('error' in res)) setLogo(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivant) setLogoMesure(false);
      });
    return () => {
      vivant = false;
    };
  }, [logo, tubeDiametreCm]);

  /** Ajout au panier : plateforme hôte (WooCommerce via admin-ajax) si un
   *  contexte est injecté, sinon mode démo (évènement DOM). Le PRIX est
   *  RECALCULÉ CÔTÉ SERVEUR (PHP) — celui envoyé ici ne sert qu'au contrôle. */
  const addToCart = async () => {
    if (blockingIssues.length > 0 || submitting) return;
    /*
     * LE TOTAL PART, LE TEXTE NON. Le palier de prix atteint dit à un marchand
     * ce que ses visiteurs composent réellement ; le texte, lui, est le prénom
     * de quelqu'un. `emettreMesure` le refuserait de toute façon — mais on ne
     * le lui donne pas.
     */
    mesurer({
      etape: 'panier',
      famille: family,
      policeId: lines[0]?.fontId,
      hauteurCm: letterHeightCm,
      longueurTexte: lines.reduce((n, l) => n + l.text.length, 0),
      totalCents: price?.totalCents,
    });
    const ctx = hostContext();
    if (!ctx?.ajaxUrl) {
      dispatchEvent(new CustomEvent('ahns:add-to-cart', { detail: { config, price } }));
      setJustAdded(true);
      return;
    }
    setSubmitting(true);
    setCartError(null);
    try {
      const fd = new FormData();
      fd.append('action', 'ahns_add_to_cart');
      fd.append('nonce', ctx.nonce ?? '');
      fd.append('productId', String(ctx.productId ?? 0));
      fd.append('config', JSON.stringify(config));
      fd.append('priceCents', String(price.displayTotalCents));
      // Le serveur REMPLACE cette ligne au lieu d'en ajouter une.
      if (ctx.editCartItemKey) fd.append('editCartItemKey', ctx.editCartItemKey);
      // Capture fidèle du design (vignette panier + commande) — jamais bloquante.
      const preview = await capturerLaPiece(true);
      if (preview) fd.append('preview', preview);
      // LA SECONDE IMAGE, TUBE ÉTEINT (écart E03).
      //
      // Un néon passe la plus grande partie de sa vie éteint, et c'est la
      // déception la plus courante du métier : le client n'a vu que l'objet
      // allumé. L'image éteinte part donc avec la commande, pour le BAT et pour
      // l'e-mail. Un logo n'en a pas : sa capture vient d'un SVG fourni, sans
      // couleur de tube à éteindre.
      const previewOff = await capturerLaPiece(false);
      if (previewOff) fd.append('previewOff', previewOff);
      const vue3d = capture3d();
      if (vue3d) fd.append('preview3d', vue3d);
      // Le SVG source part avec la commande (vérification atelier avant fabrication).
      // L'atelier reçoit le tracé À LA TAILLE COMMANDÉE, pas à une échelle
      // de travail : c'est ce fichier qu'il ouvrira pour plier.
      if (logo) fd.append('logoSvg', (logoRendu ?? logo).svgText);
      // La géométrie de fabrication est figée À LA COMMANDE. Même un client
      // resté en 2D l'obtient : l'atelier ne doit pas dépendre d'un clic 3D.
      // Ne pas réutiliser `geom3d` : si le client revient en 2D puis modifie
      // le texte, ce cache décrit encore l'ancien dessin.
      const orderGeometry = await buildCurrentGeometry();
      // Le MODÈLE part avec la géométrie : c'est ce qui permettra à l'atelier
      // de fabriquer avec le tube de CETTE commande, et non celui du catalogue
      // du jour où il ouvrira le fichier (écart E11).
      const modeleStocke = modeleVersStockage(
        // Les LIGNES partent avec : c'est d'elles que sort le diamètre réel (E28).
        modeleDepuisCoefficients(hostPricing || {}, 'boxSign' === family ? boxDepth : 0, lines),
      );
      if (orderGeometry && ('text' === config.kind || 'logo-svg' === config.kind)) {
        fd.append('geometry', JSON.stringify(geometryForOrder(orderGeometry, modeleStocke)));
      }
      const res = await fetch(ctx.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd });
      const json = (await res.json()) as { success: boolean; data?: unknown };
      if (!json.success) {
        setCartError(typeof json.data === 'string' ? json.data : "Impossible d'ajouter au panier.");
        return;
      }
      if (isEditing && ctx.cartUrl) {
        window.location.assign(ctx.cartUrl);
        return;
      }
      setJustAdded(true);
    } catch {
      setCartError('Erreur réseau : réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const goCheckout = () => {
    const ctx = hostContext();
    const url = ctx?.checkoutUrl || ctx?.cartUrl;
    if (url) window.location.assign(url);
    else dispatchEvent(new CustomEvent('ahns:checkout'));
  };

  /** Échelle d'affichage : le design entier tient dans ~600 px de large. */
  /**
   * ÉCHELLE ADAPTATIVE : le dessin (plaque comprise) doit toujours tenir DANS
   * le cadre d'aperçu, halo inclus — une échelle fixe débordait sur mobile.
   * On mesure le cadre en direct et on en déduit les pixels par centimètre.
   */
  /**
   * LA PEAU EST ANNONCÉE À L'HÔTE, sur l'élément lui-même.
   *
   * Elle n'était connue que du Shadow DOM — le marchand la règle, le composant
   * la lit dans son contexte, la feuille interne s'en sert. L'HÔTE, lui, ne
   * savait pas laquelle tournait dedans, et il en a besoin : « Vitrine » ne
   * défile pas, elle COULE. Sa racine passe en « height: auto » et l'aperçu se
   * colle à la PAGE. Un hôte qui lui impose 85 vh se retrouve avec un contenu
   * de 1011 pixels dans une boîte de 765 : mesuré, deux cent quarante-six
   * pixels de configurateur passés par-dessus le texte de la page, qui se
   * déplace derrière lui au défilement.
   *
   * L'attribut permet à la feuille de répondre depuis « :host ». Le plugin le
   * posait déjà pour habiller la page autour ; le composant le pose maintenant
   * LUI-MÊME, avec la peau vraiment retenue — la sienne fait foi, celle de
   * l'hôte n'était qu'un pari écrit avant le chargement.
   */
  const racineRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneDesignRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 640, h: 420, dx: 0, masqueG: 0, masqueD: 0 });
  /** La dernière mesure POUSSÉE — voir la boucle expliquée dans syncStageSize. */
  const dernierePoussee = useRef<{ w: number; h: number; dx: number } | null>(null);
  const [sceneBounds, setSceneBounds] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);
  /** Largeur RÉELLE du conteneur de scène — mesurée, pas déduite : c'est elle
   *  qui décide de la place libre à droite pour le repère à l'échelle (E25). */
  const [innerW, setInnerW] = useState(0);
  /** Position du haut de ce conteneur dans l'étage. Sans elle, on peut savoir
   *  qu'un repère est trop HAUT sans savoir s'il sort par le haut. */
  const [innerTop, setInnerTop] = useState(0);
  /** Et son bord gauche. Les coordonnées de `sceneBounds` partent de LÀ, pas du
   *  centre : c'est l'hypothèse fausse qui a fait disparaître le repère en
   *  disposition bureau. */
  const [innerLeft, setInnerLeft] = useState(0);
  /**
   * Relit la PLACE RÉELLEMENT LIBRE dans le cadre ; ne réécrit l'état que si
   * elle a bougé.
   *
   * LE NÉON ÉTAIT TROP GRAND, ET IL PASSAIT SOUS LE PANNEAU.
   *
   * Dans la disposition côte à côte du thème clair, le panneau de réglages
   * occupe sa propre colonne : mesurer le cadre suffit. Mais les thèmes
   * immersifs — Atelier Nuit, Story — étalent la scène sur TOUTE la surface
   * (`preview-wrap { position: absolute; inset: 0 }`) et posent le panneau
   * PAR-DESSUS. Le cadre mesurait alors 1 130 px là où il n'en restait que
   * 700 de visibles : le dessin était calculé pour une toile dont un tiers
   * était caché, et le client voyait ses lettres sortir de l'écran, coupées
   * par le panneau.
   *
   * On retranche donc l'empiétement du panneau, et on décale le centre
   * d'autant : à quoi bon réduire le dessin s'il reste centré sur une zone
   * dont il ne voit qu'une partie.
   */
  const syncStageSize = () => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;

    let gauche = r.left;
    let droite = r.right;

    const p = panelRef.current?.getBoundingClientRect();
    // Un panneau en `display: contents` (thème Comptoir) ne mesure rien : il
    // ne recouvre donc rien non plus.
    const recouvre = p && p.width > 1 && p.height > 1 && p.top < r.bottom - 1 && p.bottom > r.top + 1;
    if (recouvre) {
      const milieu = r.left + r.width / 2;
      // Le panneau est à droite ou à gauche : on ne garde que la bande libre.
      if (p.left > milieu) droite = Math.min(droite, p.left);
      else if (p.right < milieu) gauche = Math.max(gauche, p.right);
      // S'il couvre le milieu (plein écran, panneau en feuille basse), on ne
      // touche à rien : la hauteur, elle, est déjà réduite par la disposition.
    }

    const w = Math.max(120, droite - gauche);
    const dx = (gauche + droite) / 2 - (r.left + r.width / 2);
    // Ce que le panneau mange de chaque côté : les commandes flottantes s'en
    // servent pour ne pas se ranger sous lui.
    const masqueG = Math.max(0, gauche - r.left);
    const masqueD = Math.max(0, r.right - droite);

    /*
     * ON NE REPOUSSE JAMAIS DEUX FOIS LA MÊME MESURE.
     *
     * Ce calcul tourne après CHAQUE rendu, et il écrit un état — donc il
     * provoque le rendu suivant. Il s'arrête parce qu'il compare sa mesure à
     * l'état : égaux, il ne touche à rien.
     *
     * Cette comparaison ne suffit pas. Quand React enchaîne plusieurs rendus
     * sans rien valider entre eux, il REJOUE la file des mises à jour depuis
     * l'état de départ : la fonction reçoit alors toujours l'ANCIENNE valeur,
     * la trouve différente de la mesure, et en réenfile une autre. La boucle
     * ne se ferme jamais et React finit par tout jeter — le configurateur
     * DISPARAÎT (erreur React 185).
     *
     * Mesuré sur L'Établi, page dédiée, en 1280 : Taille, puis Support, puis
     * Options. Le tiroir passe de 329 à 207 px, la scène de 369 à 491 — un
     * saut de 122 px — et la trace montre quarante fois de suite
     * « 369 -> 491 » : l'état n'avance plus, la mesure ne bouge plus.
     *
     * Le remède retient CE QU'ON A DÉJÀ DEMANDÉ, dans une référence, que le
     * rejeu ne remet pas en arrière. Une mesure identique à la précédente ne
     * repart pas ; une mesure vraiment nouvelle passe, comme avant. Une
     * oscillation réelle entre deux tailles, elle, resterait visible — ce
     * garde-fou ne la masque pas.
     */
    const dernier = dernierePoussee.current;
    if (dernier
      && Math.abs(dernier.w - w) <= 1
      && Math.abs(dernier.h - r.height) <= 1
      && Math.abs(dernier.dx - dx) <= 1) return;
    dernierePoussee.current = { w, h: r.height, dx };
    setStageSize((prev) =>
      Math.abs(prev.w - w) > 1 || Math.abs(prev.h - r.height) > 1 || Math.abs(prev.dx - dx) > 1
        ? { w, h: r.height, dx, masqueG, masqueD }
        : prev,
    );
  };
  // Après CHAQUE rendu : converge en une passe, sans dépendre de ResizeObserver
  // (qui ne se déclenche pas quand la page ne compose pas de frames).
  useLayoutEffect(syncStageSize);

  // Capture du design, accessible depuis l'extérieur — exactement celle qui
  // part au panier. Sert au contrôle automatisé et à produire les visuels de
  // la vitrine : une image de démonstration doit être le VRAI rendu, pas un
  // dessin refait à la main. Pendant du hook `__ahns3d` de la vue 3D.
  useEffect(() => {
    const w = window as unknown as { __ahnsCapture?: () => string | null };
    w.__ahnsCapture = () => captureNeonPng(captureLines, 3_000_000, plateSpec);
    return () => {
      delete w.__ahnsCapture;
    };
  }, [captureLines, plateSpec]);
  useEffect(() => {
    window.addEventListener('resize', syncStageSize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncStageSize) : null;
    if (ro && stageRef.current) ro.observe(stageRef.current);
    return () => {
      window.removeEventListener('resize', syncStageSize);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pxPerCm = useMemo(() => {
    // Marge de la plaque + respiration pour le halo et les chips du HUD.
    const plateCm = (outdoor ? 'box' : supportType) === 'contour' || (outdoor ? 'box' : supportType) === 'cut-to-letter'
      ? tubeDiametreCm / 2 + 1.2
      : 3;
    /*
     * LE REPÈRE À L'ÉCHELLE FAIT PARTIE DE LA COMPOSITION (E25).
     *
     * Il lui faut de la place, et l'aperçu n'en réservait aucune : le dessin
     * occupe 78 % de la largeur par construction, si bien qu'une enseigne de
     * 171 cm ne laissait rien à sa droite. Le repère disparaissait alors sur
     * les GRANDES pièces — c'est-à-dire là où se trompe de taille coûte le plus
     * cher.
     *
     * On l'ajoute donc à la largeur à cadrer, avec son écart. L'enseigne se
     * dessine un peu plus petite ; elle reste juste, puisque les deux objets
     * partagent la même échelle — et c'est tout l'objet d'un repère.
     */
    const refCm = repere ? referencePour(measurements.heightCm) : null;
    const placeRepereCm = refCm ? refCm.largeurCm + 4 : 0;
    const designW = Math.max(measurements.widthCm + plateCm * 2 + placeRepereCm, 10);
    const designH = Math.max(measurements.heightCm + plateCm * 2, 6);
    /*
     * 78 % DE LA LARGEUR / 62 % DE LA HAUTEUR : le halo déborde du dessin.
     *
     * MAIS LA SCÈNE N'EST PAS ENTIÈREMENT LIBRE. Deux barres y flottent — les
     * fonds en haut, les outils en bas — et elles mesurent une CINQUANTAINE DE
     * PIXELS chacune, quelle que soit la scène. Sur un écran de bureau, où la
     * scène fait sept cents pixels de haut, elles en occupent un septième et ne
     * gênent personne. Sur un téléphone, où elle en fait deux cent soixante,
     * elles en prennent LES DEUX TIERS.
     *
     * L'enseigne, elle, prenait 62 % de la hauteur TOTALE : sur un téléphone,
     * son bord supérieur passait sous la barre des fonds dès que le texte était
     * court — un texte court s'affiche GRAND, l'ajustement se faisant sur la
     * largeur. C'est le défaut signalé : « le texte va sous la barre ».
     *
     * On prend donc la plus PETITE des deux mesures : l'ancienne part de la
     * hauteur totale, et une part plus généreuse de la hauteur RESTANTE une
     * fois les cent pixels de barres retirés. Les deux se rejoignent vers
     * 720 px — la hauteur d'une scène de bureau — si bien que RIEN NE CHANGE
     * là où il n'y avait pas de problème, et que l'enseigne rétrécit seulement
     * quand les barres lui prennent vraiment la place.
     *
     * Cent pixels est un FORFAIT, et il ne peut pas être juste pour les douze
     * peaux à la fois : chacune place ses barres où elle veut. Mesuré, il
     * ramène le pire chevauchement de onze pixels sous la barre des fonds à
     * quatre ou sept pixels sur la barre d'outils, et sur trois peaux au lieu
     * de sept. Vouloir l'annuler tout à fait en durcissant le forfait le fait
     * repasser de l'autre côté : c'est aux peaux concernées de remonter leur
     * barre d'outils, pas au calcul de deviner où elle est.
     *
     * Déplacer l'enseigne plutôt que la réduire ne servait à rien : mesuré, la
     * dégager de la barre du haut la posait sur celle du bas.
     */
    const barresPx = 100;
    const hLibre = Math.max(120, stageSize.h - barresPx);
    const partHauteur = Math.min(stageSize.h * 0.62, hLibre * 0.72);
    const fit = Math.min((stageSize.w * 0.78) / designW, partHauteur / designH);
    // Plancher très bas : un design hors limites (le client tape un texte trop
    // long) doit RÉDUIRE jusqu'à tenir, jamais déborder du cadre.
    return Math.max(0.05, Math.min(26, fit));
  }, [stageSize, measurements.widthCm, measurements.heightCm, supportType, outdoor, repere]);
  /**
  * Taille de police d'une ligne : le client règle une HAUTEUR DE CAPITALE
  * (c'est la cote affichée et celle qui sert au prix), pas une taille de
  * police — on convertit via le rapport capHeight/em du manifeste.
  */
  const fontPxFor = (fontId: string) => {
    const m = MANIFESTS[fontId];
    const capRatio = m ? m.capHeight / m.unitsPerEm : 0.7;
    return Math.max(12, (letterHeightCm * pxPerCm) / capRatio);
  };

  /**
   * Mesure les bords réellement PEINTS des mots, transformations comprises.
   *
   * La boîte CSS d'un mot (getBoundingClientRect) contient la boîte de ligne
   * entière : sur une cursive, cela ajoute un grand vide au-dessus et en
   * dessous des lettres — les cotes semblaient flotter loin du texte et on ne
   * lisait plus ce qu'elles mesuraient. On descend donc à l'ENCRE des glyphes
   * (TextMetrics.actualBoundingBox*), et on ne retombe sur la boîte CSS que si
   * le navigateur ne sait pas la donner.
   */
  useLayoutEffect(() => {
    const syncBounds = () => {
      const design = sceneDesignRef.current;
      if (!design) return;
      const words = Array.from(design.querySelectorAll<HTMLElement>('.neon-text:not(.plate-cut) .neon-line'));
      /*
       * UN LOGO N'A PAS DE MOT — ET LES COTES RESTAIENT CELLES DU TEXTE.
       *
       * `.neon-line` n'existe que sur la famille TEXTE. Sur un logo téléversé,
       * la liste sortait vide, la mesure s'arrêtait là (`if (!words.length)
       * return`), et `sceneBounds` gardait sa valeur précédente : les bornes en
       * pixels du texte affiché AVANT l'import. Comme `positionedWidthCm` les
       * divise par le `pxPerCm` COURANT, la cote suivait ensuite le zoom de la
       * scène au lieu de suivre la pièce.
       *
       * Mesuré le 7 septembre 2026, logo « démo » à 1 m de large, fenêtre
       * de 1440 px : réglé à 10 cm de haut la scène annonçait « 40 × 15 cm », à
       * 32 cm « 85 × 32 cm », à 60 cm « 250 × 95 cm » — trois fois les mêmes
       * 532 × 200 pixels hérités, jamais la pièce. Et le repère à l'échelle
       * (feuille A4, canette, porte) est posé À CÔTÉ de ces bornes : il devenait
       * un mensonge sur la seule chose qu'il sert à dire.
       *
       * Rien de tout cela ne touchait le PRIX, qui vient de `measurements` — et
       * c'est précisément ce qui a permis au défaut de vivre : le total était
       * juste, la validation refusait bien un logo trop large, seule la cote
       * écrite à côté du dessin était fausse.
       *
       * L'aperçu du logo est UNE boîte, à l'échelle depuis que son plafond de
       * 320 px a sauté (voir plus bas) : elle se mesure comme un mot.
       */
      const apercuLogo = design.querySelector<HTMLElement>('[data-testid="logo-preview"]');
      if (!words.length && !apercuLogo) return;
      const root = design.getBoundingClientRect();
      /*
       * L'ÉCHELLE RÉELLEMENT APPLIQUÉE, ET NON LE SEUL ZOOM DU COMPOSANT.
       *
       * On divisait par `sceneZoom` — le facteur que le composant écrit
       * lui-même — pour ramener les boîtes mesurées à l'écran dans les unités
       * non transformées où vivent les métriques de police. C'était juste tant
       * que ce zoom était la SEULE transformation.
       *
       * Il ne l'est pas : chaque peau redimensionne l'enseigne à sa façon
       * (« scale: .55 » sur L'Établi, « .5 » sur L'Atelier, « .42 » sur Le
       * Salon…). Le reste de la division laissait donc les cotes dans une
       * échelle qui n'était celle de personne. Mesuré sur L'Établi : la cote
       * horizontale tombait soixante-quatre pixels à gauche de l'enseigne, et
       * la verticale ne mesurait que 105 pixels pour une enseigne qui en fait
       * 149 — elle annonçait donc une hauteur fausse.
       *
       * Le rapport entre la boîte PEINTE et la boîte de MISE EN PAGE capture
       * toutes les transformations à la fois, quelle qu'en soit l'origine :
       * c'est la seule mesure qui ne se laisse pas dépasser par une peau.
       */
      const echelle = design.offsetWidth > 0
        ? Math.max(0.01, root.width / design.offsetWidth)
        : Math.max(0.01, sceneZoom);
      const zoom = echelle;
      /** La boîte d'un élément dans le repère non transformé du dessin. */
      const boiteDe = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return {
          left: (rect.left - root.left) / zoom,
          top: (rect.top - root.top) / zoom,
          right: (rect.right - root.left) / zoom,
          bottom: (rect.bottom - root.top) / zoom,
        };
      };
      /*
       * LES MOTS *ET* LE LOGO — les deux, quand les deux sont là.
       *
       * La première version prenait le logo SEULEMENT quand il n'y avait
       * aucun mot, ce qui était vrai tant qu'un logo remplaçait le texte.
       * Depuis qu'ils se composent, mesurer les seuls mots rendrait une
       * cote qui oublie la moitié de la pièce — et le repère à l'échelle
       * se poserait à côté de cette moitié.
       */
      const boxes = words.map((word) => {
        const box = boiteDe(word);
        const ctx = measureContext();
        const text = word.textContent ?? '';
        if (!ctx || !text.trim()) return box;
        const cs = getComputedStyle(word);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = ctx.measureText(text);
        if (!Number.isFinite(m.actualBoundingBoxAscent) || !Number.isFinite(m.fontBoundingBoxAscent)) return box;
        // Ligne de base : la boîte de ligne centre l'ascendeur + descendeur de
        // la police ; l'encre se mesure ensuite depuis cette ligne.
        const spanH = box.bottom - box.top;
        const spanW = box.right - box.left;
        const baseline = (spanH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
        const x0 = box.left + (spanW - m.width) / 2;
        return {
          left: x0 - m.actualBoundingBoxLeft,
          right: x0 + m.actualBoundingBoxRight,
          top: box.top + baseline - m.actualBoundingBoxAscent,
          bottom: box.top + baseline + m.actualBoundingBoxDescent,
        };
      });
      if (apercuLogo) boxes.push(boiteDe(apercuLogo));
      if (!boxes.length) return;
      const next = {
        left: Math.min(...boxes.map((b) => b.left)),
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
      };
      setSceneBounds((current) => current && Object.keys(next).every((key) => Math.abs(current[key as keyof typeof next] - next[key as keyof typeof next]) < 0.25) ? current : next);
      // Mesurée au même moment que les bornes, avec la même référence : c'est
      // la boîte dans laquelle `sceneBounds` est exprimé, donc la seule qui
      // permette de savoir ce qui tient à droite du dessin.
      const boite = sceneDesignRef.current?.getBoundingClientRect();
      const etage = stageRef.current?.getBoundingClientRect();
      if (boite && boite.width > 1) setInnerW((v) => (Math.abs(v - boite.width) < 0.5 ? v : boite.width));
      if (boite && etage) {
        const t = boite.top - etage.top;
        const g = boite.left - etage.left;
        setInnerTop((v) => (Math.abs(v - t) < 0.5 ? v : t));
        setInnerLeft((v) => (Math.abs(v - g) < 0.5 ? v : g));
      }
    };
    syncBounds();
    const frame = requestAnimationFrame(syncBounds);
    void document.fonts?.ready.then(syncBounds);
    return () => cancelAnimationFrame(frame);
    // `logo` et `logoHeightCm` : sans eux, l'import d'un logo et le curseur de
    // taille ne redéclenchaient pas la mesure — c'est la moitié du défaut
    // décrit plus haut.
  }, [lines, letterHeightCm, pxPerCm, sceneZoom, lit, logo, logoHeightCm, logoOffset, logoPlacement]);

  const cloneSceneLines = (source: NeonLine[]) => source.map((line) => ({ ...line, wordOffsets: line.wordOffsets?.map((offset) => ({ ...offset })) }));
  const sceneSnapshot = () => ({ lines: cloneSceneLines(lines), backgroundId: background.id });
  const restoreScene = (snapshot: { lines: NeonLine[]; backgroundId: string }) => {
    setLines(cloneSceneLines(snapshot.lines));
    setBackground(allowedBackgrounds.find((item) => item.id === snapshot.backgroundId) ?? allowedBackgrounds[0]!);
    edited();
  };
  const commitScene = (before: { lines: NeonLine[]; backgroundId: string }) => {
    setScenePast((past) => [...past.slice(-29), before]);
    setSceneFuture([]);
  };
  const undoScene = () => {
    const previous = scenePast[scenePast.length - 1];
    if (!previous) return;
    setScenePast((past) => past.slice(0, -1));
    setSceneFuture((future) => [sceneSnapshot(), ...future].slice(0, 30));
    restoreScene(previous);
  };
  const redoScene = () => {
    const next = sceneFuture[0];
    if (!next) return;
    setSceneFuture((future) => future.slice(1));
    setScenePast((past) => [...past.slice(-29), sceneSnapshot()]);
    restoreScene(next);
  };
  const cycleBackground = () => {
    commitScene(sceneSnapshot());
    const index = allowedBackgrounds.findIndex((item) => item.id === background.id);
    setBackground(allowedBackgrounds[(index + 1) % allowedBackgrounds.length]!);
  };
  const linePointerDown = (event: React.PointerEvent<HTMLSpanElement>, index: number, wordIndex: number, line: NeonLine) => {
    if (viewMode !== '2D') return;
    event.preventDefault();
    // Un pointeur peut disparaître entre l'appui et la capture (stylet levé,
    // événement synthétique) : la capture est un confort, pas une condition.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* on suit le pointeur sans capture */ }
    dragLine.current = { index, wordIndex, x: event.clientX, y: event.clientY, offset: { ...(line.wordOffsets?.[wordIndex] ?? { xCm: 0, yCm: 0 }) }, snapshot: sceneSnapshot(), moved: false };
  };
  const linePointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragLine.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = (event.clientX - drag.x) / Math.max(0.05, pxPerCm * sceneZoom);
    const dy = (event.clientY - drag.y) / Math.max(0.05, pxPerCm * sceneZoom);
    if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
    setLines((current) => current.map((line, index) => {
      if (index !== drag.index) return line;
      const words = line.text.trim() ? line.text.trim().split(/\s+/) : [' '];
      const offsets = words.map((_, wordIndex) => ({ ...(line.wordOffsets?.[wordIndex] ?? { xCm: 0, yCm: 0 }) }));
      offsets[drag.wordIndex] = {
        xCm: Math.round((drag.offset.xCm + dx) * 10) / 10,
        yCm: Math.round((drag.offset.yCm + dy) * 10) / 10,
      };
      return { ...line, wordOffsets: offsets };
    }));
  };
  const linePointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragLine.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragLine.current = null;
    if (drag.moved) commitScene(drag.snapshot);
  };

  /*
   * LE LOGO SE DÉPLACE COMME UN MOT.
   *
   * Même geste, même conversion pixels → centimètres réels, même arrondi au
   * millimètre : le client ne doit pas sentir qu'il manipule deux objets de
   * natures différentes. Ce qui change, c'est seulement OÙ le décalage est
   * rangé — `logoOffset` plutôt que `wordOffsets[i]`, parce que le logo n'est
   * pas une ligne de texte.
   */
  const dragLogo = useRef<{ x: number; y: number; offset: { xCm: number; yCm: number }; moved: boolean } | null>(null);
  const logoPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ('2D' !== viewMode) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* on suit le pointeur sans capture */ }
    dragLogo.current = { x: event.clientX, y: event.clientY, offset: { ...logoOffset }, moved: false };
  };
  const logoPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragLogo.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = (event.clientX - drag.x) / Math.max(0.05, pxPerCm * sceneZoom);
    const dy = (event.clientY - drag.y) / Math.max(0.05, pxPerCm * sceneZoom);
    if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
    setLogoOffset({
      xCm: Math.round((drag.offset.xCm + dx) * 10) / 10,
      yCm: Math.round((drag.offset.yCm + dy) * 10) / 10,
    });
  };
  const logoPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragLogo.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragLogo.current = null;
    if (drag.moved) edited();
  };

  /**
   * LE NUMÉRO DU TICKET — « NC-2026-5701 » sur le prototype.
   *
   * Il n'est pas tiré au sort : il est calculé sur la configuration elle-même,
   * donc STABLE tant que le client ne change rien, et différent dès qu'il
   * change quelque chose. Deux clients qui composent le même néon le même
   * jour lisent le même numéro — c'est voulu : ce n'est pas un numéro de
   * commande, c'est l'identité du dessin.
   */
  const numeroTicket = useMemo(() => {
    const graine = JSON.stringify(lines) + '|' + letterHeightCm + '|' + supportType;
    let h = 0;
    for (let i = 0; i < graine.length; i += 1) h = (h * 31 + graine.charCodeAt(i)) >>> 0;
    return 'NC-' + new Date().getFullYear() + '-' + String(h % 10000).padStart(4, '0');
  }, [lines, letterHeightCm, supportType]);

  /**
   * COPIER LE LIEN DE LA CONFIGURATION (B14).
   *
   * Un client compose son néon, l'envoie à son associé, revient dessus le
   * lendemain. Sans lien il recommence — et souvent il ne revient pas.
   *
   * Le jeton vit dans le FRAGMENT (`#n=`), pas dans la requête : un fragment ne
   * part jamais au serveur. Le dessin du client ne se retrouve donc ni dans les
   * journaux d'accès de la boutique, ni dans ses statistiques, ni dans le
   * référent envoyé au site suivant.
   *
   * Ce que le lien ne porte pas est dit au client, pas tu : un logo téléversé
   * pèse jusqu'à 500 Ko et ne tient dans aucune adresse.
   */
  const [lienCopie, setLienCopie] = useState<'ok' | 'sans-logo' | 'trop-long' | null>(null);
  /**
   * LE QR DU LIEN — pour passer de l'ordinateur au téléphone.
   *
   * Un lien copié ne traverse pas un appareil. Le client qui compose sur son
   * écran et veut voir son néon dans sa pièce, téléphone en main, n'avait aucun
   * chemin simple.
   *
   * Il n'est calculé QUE sur demande : l'encodeur pèse 234 Ko et son importation
   * est dynamique (voir `qr.ts`). Ce qui n'est pas demandé ne se télécharge pas.
   */
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const copierLeLien = async () => {
    const t = configVersJeton(config);
    if (!t) { setLienCopie('trop-long'); return; }
    const base = window.location.href.split('#')[0];
    try {
      await navigator.clipboard.writeText(`${base}#n=${t.jeton}`);
      setLienCopie(t.logoOmis ? 'sans-logo' : 'ok');
    } catch {
      // Le presse-papiers peut être refusé (page non sécurisée, permission) :
      // on met le lien dans l'adresse, où le client peut le copier à la main.
      window.location.hash = `n=${t.jeton}`;
      setLienCopie(t.logoOmis ? 'sans-logo' : 'ok');
    }
    setTimeout(() => setLienCopie(null), 6000);
  };

  /**
   * « VOIR CHEZ MOI » — la fonction la plus demandée, et celle qui ment le plus vite.
   *
   * ── LE GARDE-FOU AVANT TOUT LE RESTE ──────────────────────────────────────
   *
   * `realite-augmentee-widget` §7, textuellement : « C'est le point le plus
   * important de cette compétence, et il ne relève pas de la technique. » La RA
   * est la forme la plus CONVAINCANTE de montrer ; l'offrir sur une
   * configuration refusée, c'est faire voir au client, sur son propre mur, un
   * objet que l'atelier n'enverra jamais.
   *
   * La décision ne se prend donc pas ici : elle vient d'`etatRa`, dans `core`,
   * avec la validation dont elle dépend et un banc qui la vérifie dans Node.
   *
   * ── ET UNE CONTRAINTE QU'ON NE POUVAIT PAS CONTOURNER ─────────────────────
   *
   * Quick Look et Scene Viewer réclament une ADRESSE que le système va chercher
   * lui-même : un `blob:` de la page leur est inaccessible. Sans boutique pour
   * héberger le modèle, il n'y a pas de RA — d'où le troisième refus.
   */
  const chemRa = useMemo(() => cheminRa(), []);
  const hote = useMemo(() => hostContext(), []);
  const ra = etatRa({
    problemes: issues,
    appareilCapable: null !== chemRa,
    hebergementDispo: !!hote?.ajaxUrl && !!hote?.nonce,
  });
  // Le pliage des tubes prend une fraction de seconde, et le gabarit
  // l'attend désormais. Sans repère, le client clique deux fois.
  const [gabaritEnCours, setGabaritEnCours] = useState(false);
  const [raEnCours, setRaEnCours] = useState(false);
  const [raErreur, setRaErreur] = useState<string | null>(null);

  const voirChezMoi = async () => {
    if (!ra.disponible || !chemRa || !hote?.ajaxUrl || !hote.nonce) return;
    setRaEnCours(true);
    setRaErreur(null);
    try {
      // On refait la géométrie plutôt que de reprendre `geom3d` : ce cache
      // décrit le dernier passage en 3D, pas forcément le dessin affiché.
      const g = await buildCurrentGeometry();
      if (!g) throw new Error('Ce dessin ne peut pas encore être posé sur un mur.');
      const modele = modeleDepuisCoefficients(hostPricing || {}, 'boxSign' === family ? boxDepth : 0, lines);
      // Le tube est en centièmes de cm dans le stockage ; la RA veut des MÈTRES.
      const g2 = geometryForOrder(g, modeleVersStockage(modele));
      const strokes = g2.strokes.map((p) => p.map(([x, y]) => [x! / 10_000, y! / 10_000] as const));
      if (!strokes.length) throw new Error('Ce dessin ne peut pas encore être posé sur un mur.');
      const c = lines[0]?.colorHex ?? '#ff2fb0';
      const canal = (i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      const { ouvrirRa } = await import('./ar');
      await ouvrirRa({
        strokes,
        modele,
        emission: [canal(0), canal(1), canal(2)],
        nom: (lines.map((l) => l.text).filter(Boolean).join(' ') || 'neon').slice(0, 40),
        chemin: chemRa,
        ajaxUrl: hote.ajaxUrl,
        nonce: hote.nonce,
      });
    } catch (e) {
      // §8.3 : un refus est un ÉTAT NORMAL, pas une alerte. On le dit sous le
      // bouton et on laisse le client dans son configurateur.
      setRaErreur(e instanceof Error ? e.message : 'La vue sur votre mur n’a pas pu s’ouvrir.');
    } finally {
      setRaEnCours(false);
    }
  };

  const montrerLeQr = async () => {
    if (qrSvg) { setQrSvg(null); return; }
    const t = configVersJeton(config);
    if (!t) { setLienCopie('trop-long'); return; }
    const base = window.location.href.split('#')[0];
    setQrSvg(await qrEnSvg(`${base}#n=${t.jeton}`, 200));
  };

  /**
   * LA CAPTURE 3D — SEULEMENT SI LA VUE EST DÉJÀ CONSTRUITE.
   *
   * `parcours-configurateur-ux` §5 veut un mockup automatique fait de « la
   * capture 2D + la 3D sur décor ». La 2D partait déjà, allumée et éteinte ; la
   * 3D ne partait pas.
   *
   * ── LA RÈGLE QUI GOUVERNE, ET CE QU'ELLE REFUSE ───────────────────────────
   *
   * On ne construit JAMAIS la scène pour la photographier. Bâtir la 3D demande
   * la mesure des polices, la rastérisation et le pliage des tubes : plusieurs
   * secondes, pendant lesquelles « Ajouter au panier » ne répondrait pas. Faire
   * attendre un client au moment précis où il décide d'acheter, pour embellir un
   * courriel qu'il ne lira que plus tard, est le plus mauvais des échanges.
   *
   * Le marchand reçoit donc la vue 3D des clients qui l'ont ouverte — les plus
   * engagés — et rien de plus pour les autres. Un manque assumé vaut mieux
   * qu'une seconde d'attente au panier.
   *
   * `renderOnce` force une image avant la lecture : la boucle de rendu peut être
   * à l'arrêt, et `toDataURL` rendrait alors une toile vide.
   */
  const capture3d = (): string | null => {
    try {
      const hote = stageRef.current?.querySelector('[data-testid="three-view"]') as
        (HTMLElement & { __ahns3d?: { renderOnce?: () => void } }) | null;
      if (!hote?.__ahns3d) return null;
      hote.__ahns3d.renderOnce?.();
      const toile = hote.querySelector('canvas');
      if (!toile) return null;
      const url = (toile as HTMLCanvasElement).toDataURL('image/jpeg', 0.82);
      // Même borne que les captures 2D : au-delà, on préfère ne rien envoyer
      // plutôt que de faire échouer l'ajout au panier sur un dépassement.
      return url.length <= 400_000 ? url : null;
    } catch {
      return null;
    }
  };

  /**
   * IMPRIMER LE GABARIT PAPIER — le client le scotche au mur avant de payer.
   *
   * ── POURQUOI UNE VUE D'IMPRESSION ET NON UN PDF ───────────────────────────
   *
   * Un PDF demanderait une bibliothèque de plus dans un widget qui se charge sur
   * une page produit, pour produire un fichier que le client devrait ensuite
   * ouvrir puis imprimer. Le document est fait pour être IMPRIMÉ, pas gardé : on
   * ouvre donc directement une page prête à l'être, et `@page` fixe le format
   * A4 paysage sans marge.
   *
   * ── CE QUI NE DOIT PAS ÊTRE PERDU ─────────────────────────────────────────
   *
   * L'échelle. Chaque feuille porte sa règle de 100 mm, et la page rappelle de
   * ne pas cocher « ajuster à la page » — le réglage par défaut de la plupart
   * des pilotes, qui réduit de 3 à 6 % sans rien dire. Un gabarit à l'échelle 1
   * qui n'y est pas est faux avec assurance.
   */
  const imprimerGabarit = async () => {
    /*
     * LA SILHOUETTE SE CONSTRUIT ICI, ELLE NE SE PRÊTE PAS DE LA 3D.
     *
     * Ce bouton passait `geom3d?.strokes`. Or `geom3d` n'est rempli que par
     * l'effet qui commence par `if (viewMode !== '3D') return` : un client qui
     * n'a jamais ouvert la vue 3D — et rien ne l'y oblige — imprimait donc un
     * RECTANGLE VIDE. C'est ce qu'on a constaté le 4 septembre 2026 sur un
     * gabarit de 49 × 18 cm : deux feuilles, un cadre, deux cotes, aucune
     * lettre.
     *
     * L'en-tête du fichier promet pourtant « l'encombrement ET la silhouette ».
     * Le contrat était bon ; c'est l'appelant qui ne le tenait pas.
     *
     * On refait donc la géométrie, exactement comme « voir chez moi » (§ RA) et
     * pour la raison qu'il donne déjà : ce cache décrit le dernier passage en
     * 3D, pas forcément le dessin affiché. Ici il pouvait en plus être vide.
     */
    if (gabaritEnCours) return;
    setGabaritEnCours(true);
    let contours: ReadonlyArray<ReadonlyArray<readonly [number, number]>> | undefined;
    try {
      const g = await buildCurrentGeometry();
      /*
       * LES UNITÉS — LE SECOND DÉFAUT, QUE LE PREMIER CACHAIT.
       *
       * `buildCurrentGeometry` rend des PIXELS de rastérisation avec son
       * facteur `pxPerCm` (`neon-geometry.ts` le dit en tête). `gabaritPapierSvg`
       * attend des MÈTRES. L'ancien appel passait `geom3d.strokes` tel quel :
       * l'erreur était donc déjà là, invisible parce que `geom3d` valait
       * toujours `null` au moment du clic. Corriger le premier défaut a fait
       * sortir le second — silhouette tracée à x = 80 000 dans une feuille de
       * 297 mm, c'est-à-dire hors de la page.
       *
       * `y` est inversé : la rastérisation compte vers le BAS, le gabarit vers
       * le HAUT (« dans le repère du dessin, Y vers le haut »).
       */
      if (g && g.pxPerCm > 0) {
        /*
         * ET IL FAUT RECALER, pas seulement convertir.
         *
         * La rastérisation a sa propre origine — le coin du canevas, marges
         * comprises — quand le gabarit dessine son encombrement à partir de
         * (0, 0). Converti sans recalage, le tracé sortait à 96 mm du bord
         * gauche d'un cadre qui commence à 10, et débordait d'autant à droite.
         * L'échelle, elle, était juste : 490 mm de tracé pour 486 d'encombrement.
         *
         * On ramène donc la boîte du tracé sur celle de la pièce, et on la
         * CENTRE : l'encombrement vient des mesures (`widthCm`), le tracé de la
         * rastérisation, et les deux ne coïncident jamais au millimètre.
         */
        const k = g.pxPerCm * 100;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const ligne of g.strokes) {
          for (const [x, y] of ligne) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        if (Number.isFinite(x0)) {
          const largeM = measurements.widthCm / 100;
          const hautM = measurements.heightCm / 100;
          const decX = (largeM - (x1 - x0) / k) / 2;
          const decY = (hautM - (y1 - y0) / k) / 2;
          contours = g.strokes.map((ligne) =>
            ligne.map(([x, y]) => [
              (x - x0) / k + decX,
              // Y descend à la rastérisation, il monte sur le gabarit.
              hautM - decY - (y - y0) / k,
            ] as const),
          );
        }
      }
    } catch {
      /*
       * UN GABARIT SANS SILHOUETTE VAUT MIEUX QUE PAS DE GABARIT.
       *
       * Le client veut juger une TAILLE ; le rectangle aux bonnes cotes y
       * suffit, et c'est ce que dit `gabarit-papier.ts` — « ce n'est pas un
       * repli dégradé ». On imprime donc, silhouette ou pas.
       */
      contours = undefined;
    } finally {
      setGabaritEnCours(false);
    }
    // PAS DE RÉFÉRENCE DE COMMANDE : il n'y en a pas encore, et c'est le point —
    // ce gabarit sert AVANT l'achat. L'en-tête porte donc le dessin du client.
    const dessin = lines.map((l) => l.text).filter(Boolean).join(' ').slice(0, 40);
    const g = gabaritPapierSvg({
      reference: dessin || T('Votre néon'),
      largeurM: measurements.widthCm / 100,
      hauteurM: measurements.heightCm / 100,
      contours,
    });
    const pages = g.feuilles
      .map((f) => `<div class="feuille">${f}</div>`)
      .join('\n');
    const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8">`
      + `<title>${T('Gabarit papier')} · ${Math.round(measurements.widthCm)} × ${Math.round(measurements.heightCm)} cm</title>`
      + `<style>`
      + `@page { size: 297mm 210mm; margin: 0; }`
      + `body { margin: 0; background: #666; font-family: Helvetica, Arial, sans-serif; }`
      + `.avis { background: #fff3cd; color: #513c06; padding: 12px 16px; font-size: 14px; line-height: 1.5; }`
      + `.feuille { width: 297mm; height: 210mm; margin: 10px auto; background: #fff; overflow: hidden; }`
      + `.feuille svg { display: block; width: 297mm; height: 210mm; }`
      + `@media print { .avis { display: none; } .feuille { margin: 0; page-break-after: always; } }`
      + `</style></head><body>`
      + `<div class="avis"><b>${T('IMPRIMER À 100 %')}</b> · ${T('ne pas cocher « ajuster à la page ». Vérifiez la règle de 100 mm au réglet sur la feuille imprimée avant de scotcher.')}</div>`
      + pages + `</body></html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    const onglet = window.open(url, '_blank');
    // UN BLOQUEUR DE FENÊTRES NE DOIT PAS FAIRE DISPARAÎTRE LE GABARIT EN
    // SILENCE : sans ce repli, le client clique et il ne se passe rien.
    if (!onglet) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `gabarit-${Math.round(measurements.widthCm)}x${Math.round(measurements.heightCm)}cm.html`;
      a.click();
    }
    // On ne révoque pas tout de suite : l'onglet doit avoir le temps de lire.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /**
   * LE REPÈRE À L'ÉCHELLE (E25), dessiné DANS LA SCÈNE.
   *
   * Il ne peut pas vivre à côté d'elle : `neon-stage-inner` porte
   * `scale(sceneZoom)`, et un repère resté dehors garderait sa taille pendant
   * que l'enseigne grandit. Il MENTIRAIT sur l'échelle au premier zoom — c'est
   * exactement la faute qu'il est censé empêcher.
   *
   * Dedans, il subit la même transformation, et `sceneBounds` — les bornes
   * réelles du dessin, celles qui positionnent déjà les règles de cotation —
   * est exprimé dans ce même repère. Le repère est donc aligné sur ce que la
   * cote mesure, par construction et non par coïncidence.
   */
  const repereEchelle = useMemo(() => {
    if ('2D' !== viewMode || !repere || !sceneBounds) return null;
    /*
     * ON DESCEND LA LISTE JUSQU'À CE QU'UN REPÈRE TIENNE.
     *
     * Vu au navigateur : à 65 cm de haut, le meilleur repère est le canapé —
     * juste au sens du rapport — mais il est large de 180 cm et sortait de la
     * scène par la droite. Un repère COUPÉ ne se compare pas : on prend alors
     * le suivant, et on ne se tait que si aucun ne tient.
     *
     * Redimensionner celui qui déborde serait la pire des solutions : ce serait
     * afficher une fausse échelle sous un objet dont le seul rôle est de dire
     * l'échelle.
     */
    const gaucheRef = sceneBounds.right + 24;
    /*
     * TROIS ESPACES, ET DEUX ERREURS PAYÉES AVANT DE LES DÉMÊLER.
     *
     * `sceneBounds` est exprimé dans le conteneur `neon-stage-inner`, qui est
     * CENTRÉ dans l'étage et que `sceneZoom` agrandit. Mesuré au navigateur :
     * étage de 731 px, conteneur de 292 px posé à x = 219, c'est-à-dire
     * exactement `(731 − 292) / 2`.
     *
     * Comparer directement à `stageSize.w` mélangeait donc deux origines ET
     * deux échelles. Première tentative : le canapé sortait de l'écran alors
     * que le calcul le déclarait à sa place. Deuxième : plus rien ne
     * s'affichait sous 45 cm.
     *
     * La place libre à droite, dans les coordonnées du conteneur, vaut donc la
     * demi-largeur de l'étage ramenée au zoom, plus la demi-largeur du
     * conteneur lui-même — puisque son origine est son bord gauche.
     */
    /*
     * LA CONVERSION EXACTE, ÉCRITE UNE FOIS.
     *
     * Le conteneur est posé en (innerLeft, innerTop) dans l'étage, large de
     * innerW, et `scale(z)` l'agrandit AUTOUR DE SON CENTRE. Un point d'abscisse
     * X dans ses coordonnées apparaît donc à
     *
     *     innerLeft + innerW/2 + (X − innerW/2) · z
     *
     * Deux hypothèses fausses ont précédé celle-ci, chacune payée d'un
     * aller-retour au navigateur : que l'origine du conteneur soit son centre,
     * puis que les bornes de l'étage se comparent directement aux coordonnées
     * de la scène. On écrit la transformation plutôt que de la deviner.
     */
    const z = Math.max(0.05, sceneZoom);
    const droiteDispo = innerW / 2 + (stageSize.w - 8 - innerLeft - innerW / 2) / z;
    const ref = referencesClassees(measurements.heightCm).find((c) => {
      const h = c.hauteurCm * pxPerCm;
      const l = c.largeurCm * pxPerCm;
      // Trop petit à l'écran, il ne se lit plus ; plus haut que l'étage, il le
      // mange. Les deux seuils sont en pixels d'ÉCRAN, donc après zoom.
      // TROP PETIT : il ne se lit plus. SORT PAR LE HAUT : il est coupé, et un
      // repère coupé ne se compare pas. Le second test a demandé de mesurer où
      // commence le conteneur — comparer la seule HAUTEUR à celle de l'étage
      // laissait passer un repère qui dépassait, parce que la ligne de base
      // n'est pas au milieu.
      if (h * z < 14) return false;
      // Même conversion, sur l'autre axe : le sommet du repère, en pixels
      // d'écran. Comparer la seule HAUTEUR à celle de l'étage laissait passer
      // un repère qui dépassait, parce que la ligne de base n'est pas au milieu.
      if (innerTop + (sceneBounds.bottom - h) * z < 4) return false;
      return gaucheRef + l <= droiteDispo;
    });
    if (!ref) return null;
    const h = ref.hauteurCm * pxPerCm;
    const l = ref.largeurCm * pxPerCm;
    /*
     * À DROITE, ET C'EST LA PREMIÈRE VERSION QUI L'A APPRIS. Posé à gauche, il
     * se superposait à la ligne de cote — deux informations d'échelle empilées,
     * dont aucune ne se lisait — et son sommet passait sous la barre des fonds.
     * La cotation occupe le flanc gauche ; le repère prend le droit.
     */
    return (
      <div
        className="repere2d"
        data-testid="repere-echelle"
        data-forme={ref.forme}
        style={{ left: `${gaucheRef}px`, top: `${sceneBounds.bottom - h}px`, width: `${l}px`, height: `${h}px` }}
      >
        <svg viewBox={`0 0 ${ref.largeurCm} ${ref.hauteurCm}`} preserveAspectRatio="none" aria-hidden="true">
          {'feuille' === ref.forme && (
            <>
              <rect x="0.6" y="0.6" width={ref.largeurCm - 1.2} height={ref.hauteurCm - 1.2} rx="0.6" />
              <path d={`M2.5 6 h${ref.largeurCm - 5} M2.5 10 h${ref.largeurCm - 5} M2.5 14 h${ref.largeurCm - 8}`} className="repere2d__trait" />
            </>
          )}
          {'silhouette' === ref.forme && (
            <>
              <circle cx={ref.largeurCm / 2} cy="12" r="9" />
              <path d={`M${ref.largeurCm / 2 - 15} ${ref.hauteurCm} v-70 a15 15 0 0 1 30 0 v70`} />
            </>
          )}
          {'porte' === ref.forme && (
            <>
              <rect x="0.8" y="0.8" width={ref.largeurCm - 1.6} height={ref.hauteurCm - 0.8} rx="1" />
              <circle cx={ref.largeurCm - 12} cy={ref.hauteurCm / 2} r="3" className="repere2d__trait" />
            </>
          )}
          {'canape' === ref.forme && (
            <>
              <rect x="0" y={ref.hauteurCm * 0.42} width={ref.largeurCm} height={ref.hauteurCm * 0.58} rx="4" />
              <rect x="6" y="0" width={ref.largeurCm - 12} height={ref.hauteurCm * 0.5} rx="5" />
            </>
          )}
        </svg>
        <b>{T(ref.nom)}</b>
      </div>
    );
  }, [viewMode, repere, sceneBounds, innerW, innerTop, innerLeft, measurements.heightCm, pxPerCm, stageSize.h, stageSize.w, sceneZoom, T]);

  const positionedWidthCm = sceneBounds ? (sceneBounds.right - sceneBounds.left) / pxPerCm : measurements.widthCm;
  const positionedHeightCm = sceneBounds ? (sceneBounds.bottom - sceneBounds.top) / pxPerCm : measurements.heightCm;

  /*
   * LA SCISSION EN PANNEAUX (E19) — un avertissement, jamais un refus.
   *
   * Une pièce trop grande pour un colis n'est pas infabricable : elle part en
   * plusieurs panneaux, avec un joint. Bloquer perdrait la vente la plus
   * rentable du catalogue.
   *
   * Ce que le client doit savoir avant de payer, c'est qu'il y aura un joint
   * VISIBLE, et où. Le découvrir à la livraison est exactement l'écart que tout
   * ce travail cherche à supprimer.
   */
  const scission = useMemo(
    /*
     * LES COTES DE LA SCISSION SONT CELLES QUE LE CLIENT LIT.
     *
     * `measurements` mesure l'ENCRE ; la pastille de l'aperçu affiche
     * `positioned*`, la pièce telle qu'elle sera fabriquée, plaque comprise.
     * Constaté sur le même dessin : « 683 × 94 cm » sur la pastille, des
     * panneaux annoncés « × 60 cm » par la scission.
     *
     * Et pour le transport, c'est bien la pièce qui entre dans le colis, pas
     * son encre : les deux raisons désignent le même nombre.
     */
    /*
     * LE TRANSPORTEUR DÉCLARÉ PASSE AVANT LES DEUX COEFFICIENTS (chantier A4).
     *
     * `parcelMaxLengthCm` et `parcelMaxWidthCm` viennent d'un CONCURRENT,
     * relevés sur son site. Un marchand qui livre en palette n'a pas les mêmes
     * limites qu'un autre qui expédie en Colissimo — aucun chiffre ne peut être
     * juste pour les deux.
     *
     * Sans transporteur déclaré, les deux coefficients s'appliquent comme
     * avant. Aucun prix ne bouge dans les deux cas : la scission avertit, elle
     * ne facture pas.
     */
    () => scissionRequise(positionedWidthCm, positionedHeightCm,
      coeffEffectifs.transporteur ?? {
        maxLongueurCm: coeffEffectifs.parcelMaxLengthCm,
        maxLargeurCm: coeffEffectifs.parcelMaxWidthCm,
      }),
    [positionedWidthCm, positionedHeightCm, coeffEffectifs],
  );

  // La classe de groupe (grp-…) donne aux thèmes une prise CSS par section —
  // l'accordéon s'en sert pour intercaler ses en-têtes via `order`.
  const sectCls = (tab: MobileTab) => `sect grp-${tab}${mobileTab === tab ? '' : ' off'}`;

  /* ----------------------------- thème ----------------------------------- */
  const theme = resolveTheme(editCtx?.appearance?.theme);
  /*
   * LA DISPOSITION DÉPEND AUSSI DE L'ENDROIT OÙ LE WIDGET EST POSÉ.
   *
   * Une peau peut vouloir guider le client pas à pas sur sa page dédiée, où le
   * configurateur est seul et prend l'écran, et le laisser tout voir d'un coup
   * sur une fiche produit, où la page défile déjà pour ses avis, sa description
   * et son pied. Deux progressions concurrentes dans la même page, c'est une
   * barre d'étapes qui avance pendant que l'ascenseur recule.
   *
   * « La Maison » a une maquette pour chacun des deux cas, et elles ne se
   * ressemblent pas : prototypes/maison.html guide dans une pièce en plein
   * cadre, prototypes/maison-produit.html empile ses réglages à côté d'une
   * scène collée. Une peau sans « ficheLayout » garde sa disposition partout.
   */
  const disposition = ('fiche' === vue && theme.ficheLayout) || theme.layout;
  /** La disposition « ticket » (Comptoir) réorganise le panneau en quatre
      cartes de caisse : Message · Couleur · Format · Extras — celles de la
      maquette. Les autres dispositions gardent le panneau d'origine. */
  const enTicket = 'ticket' === disposition;
  /**
   * LA DISPOSITION « LETTRE » : la commande est une phrase, et chaque valeur
   * soulignée ouvre une bulle SOUS le mot. Trois choses seulement sont tenues
   * ici — quel mot est ouvert, sur quel groupe de réglages il donne, et où il
   * se trouve pour poser la bulle dessous. Le reste (les sections, leur
   * contenu, l'état du configurateur) ne bouge pas d'un pouce : la bulle
   * montre la section que le tiroir du téléphone montrerait.
   */
  const enLettre = 'lettre' === disposition;
  const [motOuvert, setMotOuvert] = useState<string | null>(null);
  const [ancreMot, setAncreMot] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Les onglets du téléphone, accordés aux cartes de la disposition. */
  const ONGLETS = enTicket ? TICKET_TABS : MOBILE_TABS;
  const prixExtra = (v: string) => (enTicket ? v : undefined);

  /**
   * Les lignes du ticket de caisse — thème « Comptoir » uniquement.
   *
   * Elles reprennent, dans l'ordre, celles du prototype : Texte, Écriture,
   * Couleur, Hauteur, Tube LED, Support, puis les options retenues. Chacune
   * est LUE DANS L'ÉTAT, jamais recopiée : le ticket dit ce que le client a
   * choisi, il ne raconte pas une commande imaginaire.
   */
  const ticketLines = useMemo(() => {
    if ('ticket' !== disposition) return [];
    const l0 = lines[0];
    const font = FONTS.find((f) => f.id === l0?.fontId);
    const couleur = colors.find((c) => c.hex?.toLowerCase() === l0?.colorHex?.toLowerCase());
    const support = supportTypes.find((s) => s.id === config.support.type);
    const out: Array<{ lib: string; val: string }> = [];
    if (l0?.text) out.push({ lib: T('Texte'), val: '« ' + l0.text + ' »' });
    if (font) out.push({ lib: T('Écriture'), val: font.label });
    if (couleur) out.push({ lib: T('Couleur'), val: couleur.label });
    out.push({ lib: T('Hauteur'), val: config.letterHeightCm + ' cm' });
    if (measurements.tubeLengthM > 0) {
      out.push({ lib: T('Tube LED'), val: measurements.tubeLengthM.toFixed(2) + ' m' });
    }
    if (support) out.push({ lib: T('Support'), val: support.label });
    if ('rgb' === config.colorMode) out.push({ lib: T('RGB'), val: T('inclus') });
    if (config.options.dimmerRemote) out.push({ lib: T('Variateur'), val: T('inclus') });
    if ('outdoor' === config.environment) out.push({ lib: T('Extérieur'), val: 'caisson drainé · IP67 tube et bloc' });
    if (config.options.express) out.push({ lib: T('Express'), val: T('inclus') });
    return out;
  }, [disposition, lines, FONTS, colors, supportTypes, config, measurements, T]);
  /**
   * Les valeurs que la phrase donne à lire. Mêmes sources que le ticket de
   * caisse — il n'y a qu'une vérité sur ce qui est configuré, et deux peaux
   * qui la racontent différemment.
   */
  const motsDeLaLettre = useMemo(() => {
    const l0 = lines[0];
    const font = FONTS.find((f) => f.id === l0?.fontId);
    const couleur = colors.find((c) => c.hex?.toLowerCase() === l0?.colorHex?.toLowerCase());
    const support = supportTypes.find((s) => s.id === config.support.type);
    const extras: string[] = [];
    if ('rgb' === config.colorMode) extras.push(T('la couleur changeante'));
    if (config.options.dimmerRemote) extras.push(T('le variateur'));
    if ('outdoor' === config.environment) extras.push(T('la tenue à l’extérieur'));
    if (config.options.express) extras.push(T('la fabrication express'));
    /* LA GRAMMAIRE COMPTE. « avec les options le variateur et la fabrication
       express » ne se dit pas ; le prototype accorde sa phrase, et une
       interface qui se lit doit se lire juste. */
    const listeExtras = extras.length === 0
      ? T('sans extra')
      : extras.length === 1
        ? T('avec') + ' ' + extras[0]
        : T('avec') + ' ' + extras.slice(0, -1).join(', ') + ' ' + T('et') + ' ' + extras[extras.length - 1];
    return {
      texte: l0?.text ? '« ' + l0.text + ' »' : T('（votre texte）'),
      police: font ? font.label : '-',
      /* Hors palette — une teinte reprise d'un panier, ou choisie au
         nuancier — la phrase dit le code plutôt qu'un tiret : « qui brille
         en — » ne veut rien dire, et c'est une phrase qui se lit. */
      couleur: couleur ? couleur.label.toLowerCase() : (l0?.colorHex ?? '-'),
      taille: config.letterHeightCm + ' cm',
      support: support ? support.label.toLowerCase() : '-',
      extras: listeExtras,
    };
  }, [lines, FONTS, colors, supportTypes, config, T]);

  /** Ouvre (ou referme) la bulle d'un mot, et retient où poser sa flèche. */
  const ouvrirMot = (mot: string, groupe: MobileTab, e: React.MouseEvent<HTMLButtonElement>) => {
    const bouton = e.currentTarget;
    setAncreMot({ x: bouton.offsetLeft + bouton.offsetWidth / 2, y: bouton.offsetTop + bouton.offsetHeight });
    setMobileTab(groupe);
    setMotOuvert((m) => (m === mot ? null : mot));
  };

  /* Un clic à côté referme la bulle — c'est le geste attendu, et sans lui elle
     resterait ouverte pendant qu'on regarde son néon. */
  useEffect(() => {
    if (!enLettre || !motOuvert) return;
    const fermer = (ev: Event) => {
      const cible = ev.target as HTMLElement | null;
      if (cible?.closest('.lettre-mot') || cible?.closest('.panes')) return;
      setMotOuvert(null);
    };
    document.addEventListener('pointerdown', fermer, true);
    return () => document.removeEventListener('pointerdown', fermer, true);
  }, [enLettre, motOuvert]);

  // Parcours guidé et accordéon : une section à la fois, sur TOUS les écrans.
  // Les deux réutilisent l'état des onglets mobiles — les sections portent
  // déjà leur groupe via sectCls(), seule la feuille du thème étend le
  // masquage au bureau. Le mode devis garde le défilement : son panneau a sa
  // propre logique. Hors famille néon, retour au défilement (mêmes limites
  // que les onglets mobiles).
  const guidedOn = ('steps' === disposition || 'accordion' === disposition) && !quoteMode && 'neon' === family;
  const stepsOn = guidedOn && 'steps' === disposition;
  const accordionOn = guidedOn && 'accordion' === disposition;
  const stepIndex = ONGLETS.findIndex((t) => t.id === mobileTab);
  const goStep = (i: number) => {
    const cible = ONGLETS[Math.max(0, Math.min(ONGLETS.length - 1, i))];
    if (cible) setMobileTab(cible.id);
  };
  /*
   * LA BULLE S'OUVRE SUR RIEN, ET SE REFERME.
   *
   * Un panneau à étapes ouvre toujours sur un groupe — dans une colonne,
   * c'est juste. « La Maison » ne pose pas une colonne : elle pose une bulle
   * PAR-DESSUS la pièce, et une bulle ouverte d'emblée cache l'enseigne
   * qu'on vient composer. Sa maquette ouvre donc sur aucun groupe.
   *
   * Le groupe courant reste « mobileTab » : on ne touche ni au parcours ni
   * aux sections. On ajoute seulement de quoi dire que la bulle est fermée —
   * l'attribut descend dans le DOM, la peau en fait ce qu'elle veut.
   */
  const [bulleFermee, setBulleFermee] = useState(true);
  const replie = Boolean(theme.panneauRepliable) && stepsOn && bulleFermee;
  const ouvrirEtape = (i: number) => {
    if (!theme.panneauRepliable) { goStep(i); return; }
    // Recliquer le groupe ouvert le referme : c'est le geste de la maquette,
    // et le seul moyen de revoir son néon en entier sans changer de réglage.
    if (i === stepIndex && !bulleFermee) { setBulleFermee(true); return; }
    goStep(i);
    setBulleFermee(false);
  };
  // Cartes déjà visitées (accordéon) : elles portent une coche une fois qu'on
  // en est reparti — le client voit d'un coup d'œil où il en est.
  const [visitedTabs, setVisitedTabs] = useState<MobileTab[]>([]);
  const openCard = (tab: MobileTab) => {
    if (tab === mobileTab) return;
    setVisitedTabs((v) => (v.includes(mobileTab) ? v : [...v, mobileTab]));
    setMobileTab(tab);
  };
  /** Résumé d'une carte fermée : le choix, pas un rappel de consigne. */
  const cardSummary = (tab: MobileTab): string => {
    if ('text' === tab) {
      const texte = lines.map((l) => l.text.trim()).filter(Boolean).join(' / ') || '-';
      const font = FONTS.find((f) => f.id === lines[0]?.fontId);
      return `« ${texte} »${font ? ' · ' + font.label : ''}`;
    }
    if ('size' === tab) return `${letterHeightCm} cm`;
    if ('support' === tab) {
      const type = SUPPORT_TYPES.find((t) => t.id === supportType);
      return type ? T(type.label) : '-';
    }
    const n = [rgb, outdoor, dimmer, express, nightTimer].filter(Boolean).length;
    return n ? `${n} ${T(n > 1 ? 'options' : 'option')}` : T('Aucune option');
  };
  // L'ambiance du site (« Maison » : jour / soir), reportée sur la racine.
  const ambianceHote = useAmbianceHote();
  // La signature de Vitrine : l'interface prend la couleur du tube choisi.
  const themeTint = 'vitrine' === theme.id ? (lines[0]?.colorHex || '#ff2d95') : undefined;

  useLayoutEffect(() => {
    const racine = racineRef.current;
    const hote = racine && (racine.getRootNode() as ShadowRoot | null)?.host;
    if (hote instanceof HTMLElement) hote.setAttribute('data-peau', theme.id);
  }, [theme.id]);

  return (
    <div
      ref={racineRef}
      className={`root${sheetFull ? ' sheet-full' : ''}${quoteMode ? ' quote' : ''}`}
      // Le thème d'interface choisi par le marchand : les peaux se ciblent par
      // [data-theme="…"] dans la feuille du Shadow DOM. Un identifiant inconnu
      // retombe sur « clair-boutique » — jamais de configurateur cassé.
      data-theme={theme.id}
      data-vue={vue}
      data-mode={ambianceHote}
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        ...(editCtx?.appearance?.accent ? { '--accent': editCtx.appearance.accent } : null),
        ...(themeTint ? { '--vt-neon': themeTint } : null),
      } as React.CSSProperties}
    >
      <header className="hd">
        {(() => {
          const ctx = hostContext();
          const title = editCtx?.appearance?.labels?.title || ctx?.siteName || 'Neon Sign Configurator';
          return ctx?.homeUrl ? (
            <a className="brandlink" href={ctx.homeUrl} title={T("Retour à l'accueil")}>
              <h1>{title}</h1>
            </a>
          ) : (
            <h1>{title}</h1>
          );
        })()}
      </header>

      <div className="body">
        {/* ---------- Aperçu ---------- */}
        <div className="preview-wrap">
          {/* Les trois mesures descendent en variables CSS : les commandes
              flottantes (bascule 2D/3D, barre d'outils, cotes) s'y accrochent
              pour rester dans la partie VISIBLE de la scène — sans quoi elles
              se rangent sous le panneau des thèmes immersifs, et le client ne
              les trouve jamais. */}
          {/* ─── LA MESURE DE LA PHOTO (B12) ─────────────────────────────
              Une photo ne porte AUCUNE échelle : il faut la lui donner. Le
              client trace un segment sur quelque chose dont il connaît la
              taille — une porte, une prise, un carreau — et dit combien il
              mesure. Deux nombres suffisent à tout.

              Le panneau est modal exprès : viser deux points demande de
              l'attention, et la faire au milieu du configurateur donnerait une
              mesure bâclée sur laquelle tout le reste reposerait. */}
          {mesurePhoto && photo && (
            <div className="photo-mesure" data-testid="photo-mesure">
              <div className="photo-mesure__boite">
                <h3>{T('Donnez l’échelle à votre photo')}</h3>
                <p>
                  {T('Cliquez les deux bouts de quelque chose dont vous connaissez la taille (une porte, une prise, un carreau), puis dites combien il mesure.')}
                </p>
                <div className="photo-mesure__vue">
                  <img src={photo.url} alt="" onClick={pointerPhoto} data-testid="photo-vue" />
                  {/* LES REPÈRES VIVENT DANS LE SVG, PAS EN POURCENTAGE.
                      Posés en pourcentage de la BOÎTE, ils dérivaient comme le
                      clic : `max-height` écartèle l'image, `object-fit: contain`
                      ajoute des bandes, et la boîte cesse d'être l'image. Un SVG
                      au même `viewBox`, avec le `preserveAspectRatio` par défaut,
                      lettreboxe EXACTEMENT comme `contain` — les points tombent
                      donc pile sur ce que le client a visé, sans calcul. */}
                  <svg
                    className="photo-mesure__trait"
                    viewBox={`0 0 ${photo.largeur} ${photo.hauteur}`}
                  >
                    {2 === photoPoints.length && (
                      <line
                        x1={photoPoints[0]![0]} y1={photoPoints[0]![1]}
                        x2={photoPoints[1]![0]} y2={photoPoints[1]![1]}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {photoPoints.map((pt, i) => (
                      <circle key={i} cx={pt[0]} cy={pt[1]} r={Math.max(4, photo.largeur / 160)} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                </div>
                <div className="photo-mesure__saisie">
                  <label>
                    {T('Ce segment mesure')}
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={photoRefCm}
                      onChange={(e) => setPhotoRefCm(e.target.value)}
                      data-testid="photo-ref-cm"
                    />
                    cm
                  </label>
                </div>
                <p className="photo-mesure__verdict" data-testid="photo-verdict">
                  {(() => {
                    if (2 !== photoPoints.length) return T('Cliquez le premier point.');
                    if (!echelleEnCours) return '';
                    if (!echelleEnCours.ok) {
                      /* On REFUSE plutôt que d'approximer : un segment de deux
                         pixels donnerait une échelle parfaitement calculable et
                         parfaitement fausse. */
                      return T('segment-trop-court' === echelleEnCours.refus
                        ? 'Ce trait est trop court pour donner une échelle fiable : visez quelque chose de plus grand sur la photo.'
                        : 'Cette longueur ne semble pas juste : donnez une valeur en centimètres.');
                    }
                    // `toLocaleString` et non l'écriture brute : « ± 0.4 % »
                    // avec un point est un anglicisme dans une interface qui
                    // écrit « 51 × 20 cm » partout ailleurs.
                    return `${T('Échelle établie, à ±')} ${incertitudeEnPourcent(echelleEnCours.echelle).toLocaleString(locale?.replace('_', '-') || 'fr-FR')} %`;
                  })()}
                </p>
                {/* CE QU'ON NE SAIT PAS FAIRE, ET QU'IL FAUT DONC DIRE.
                    Une photo projette : l'échelle n'est constante que dans UN
                    plan. Rien ne permet de détecter, depuis deux nombres, que
                    le repère et le néon ne sont pas sur le même mur. */}
                <p className="photo-mesure__avis">
                  {T('Mesurez sur le mur où ira le néon : sur une photo, l’échelle n’est juste que dans un seul plan. Votre photo reste sur votre appareil ; elle n’est ni envoyée ni enregistrée.')}
                </p>
                <div className="photo-mesure__pied">
                  <button onClick={() => { setPhotoPoints([]); }} data-testid="photo-recommencer">
                    {T('Recommencer le tracé')}
                  </button>
                  <button
                    className="primaire"
                    disabled={!echelleEnCours?.ok}
                    onClick={() => {
                      if (!echelleEnCours?.ok) return;
                      setPhotoEchelle(echelleEnCours.echelle);
                      setBackground({ id: 'ma-photo', label: 'Ma photo', css: '#14161c' });
                      setMesurePhoto(false);
                    }}
                    data-testid="photo-valider"
                  >
                    {T('Voir mon néon dessus')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            className="stage"
            ref={stageRef}
            data-decor={background.id}
            style={{
              /*
               * LA PHOTO DU CLIENT PORTE SA PROPRE TAILLE (B12).
               *
               * Les autres fonds sont en `cover` : un mur remplit le cadre,
               * quitte à être rogné. Celui-ci ne peut pas — sa taille EST
               * l'information. On la calcule dans `core` : un pixel d'image
               * vaut `cmParPixel` centimètres réels, l'aperçu dessine `pxPerCm`
               * pixels par centimètre, donc l'image entière prend
               * `largeurFondPx`. C'est la photo qu'on met à l'échelle du néon,
               * jamais l'inverse — l'échelle de l'aperçu porte aussi les cotes,
               * le repère de taille et le gabarit papier.
               */
              background: 'ma-photo' === background.id && photo && photoEchelle
                ? `url("${photo.url}") center / ${Math.round(largeurFondPx(photo.largeur, photoEchelle, pxPerCm))}px auto no-repeat, #14161c`
                : background.css,
              ['--ahns-dx' as string]: `${stageSize.dx}px`,
              ['--ahns-masque-g' as string]: `${stageSize.masqueG}px`,
              ['--ahns-masque-d' as string]: `${stageSize.masqueD}px`,
            }}
          >
            {/* Fond NOMMÉ (les pastilles seules n'étaient pas compréhensibles)
                + interrupteur du néon. */}
            <div className="hud hud--bg">
              {/* LE GROUPE DES FONDS. Il n'existe que pour les peaux qui
                  séparent la barre en deux — échantillons à gauche,
                  interrupteur à droite, comme le « .scene-hud » du Comptoir.
                  Partout ailleurs il est transparent au sens propre
                  (« display: contents ») : aucune boîte, aucune incidence sur
                  la mise en page existante. */}
              <span className="hud__fonds">
              <span className="hud__label">{T('Fond')}</span>
              {allowedBackgrounds.map((b) => (
                <button
                  key={b.id}
                  className={background.id === b.id ? 'on' : ''}
                  onClick={() => setBackground(b)}
                >
                  <i style={{ background: b.css, backgroundSize: 'cover' }} />
                  <span className="hud__txt">{T(b.label)}</span>
                </button>
              ))}
              {/* « MA PHOTO » — la troisième réponse à la question de la
                  taille, entre le décor (un mur qui n'est pas le sien) et la
                  RA (son mur, mais il faut un téléphone récent et être devant).
                  `parcours-configurateur-ux` §1, étape 8. */}
              {/* UN BOUTON, PAS UN « LABEL ».
                  Mesure au navigateur, barre des fonds : les voisins sont a
                  11,5 px / 700 et 7 px de marge (« .hud button »), le label
                  etait a 16 px / 400 sans marge — plus gros, d'une autre
                  graisse, sur la meme ligne. Un label n'est pas un bouton :
                  aucune des regles de la barre ne le visait, ni celles des
                  onze peaux qui reprennent « .hud button ». Le remettre en
                  bouton le raccroche a toutes, aujourd'hui et aux suivantes ;
                  l'entree de fichier reste, cachee, et c'est le bouton qui
                  l'ouvre. */}
              <input
                ref={entreePhoto}
                type="file"
                accept="image/*"
                onChange={choisirPhoto}
                data-testid="photo-input"
                className="hud__photo-entree"
              />
              <button
                className="hud__photo"
                title={T('Utiliser une photo de votre mur')}
                onClick={() => entreePhoto.current?.click()}
              >
                {/* IL LUI FAUT UNE ICONE, comme a ses voisins. Sous 900 px la
                    barre cache les libelles et ne garde que les pastilles : le
                    bouton photo, qui n'avait que du texte, tombait a 14 px de
                    haut contre 30 pour les autres — un creux invisible dans la
                    barre, mesure au navigateur. */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 8.5h3.4L8 6h8l1.6 2.5H21v11H3z" />
                  <circle cx="12" cy="13.6" r="3.4" />
                </svg>
                <span className="hud__txt">{T(photoEchelle ? 'Ma photo' : 'Ma photo…')}</span>
              </button>
              </span>
              <button
                className={`hud__light${lit ? ' on' : ''}`}
                onClick={() => setLit((l) => !l)}
                title={T(lit ? 'Éteindre le néon' : 'Allumer le néon')}
                data-testid="light-toggle"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="10" r="4.4" />
                  <path d="M12 2.8v1.7M19.6 10h-1.7M6.1 10H4.4M17.3 4.7l-1.2 1.2M7.9 5.9 6.7 4.7" />
                  <path d="M10.1 18.2h3.8M10.7 20.8h2.6" />
                </svg>
                <span className="hud__txt">{T(lit ? 'Allumé' : 'Éteint')}</span>
              </button>
              {/* Le repère ne se montre qu'en 2D : la 3D a déjà le sien, et la
                  pièce entière y donne l'échelle. */}
              {'2D' === viewMode && (
                <button
                  className={`hud__light${repere ? ' on' : ''}`}
                  onClick={() => setRepere((r) => !r)}
                  title={T('Objet de référence à l’échelle')}
                  data-testid="repere-toggle"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 4h11v16H4z" />
                    <path d="M18 6v12M16.4 7.6 18 6l1.6 1.6M16.4 16.4 18 18l1.6-1.6" />
                  </svg>
                  <span className="hud__txt">{T('Échelle')}</span>
                </button>
              )}
            </div>
            <div className="viewchip">
              {(feature('view3d') ? (['2D', '3D'] as const) : (['2D'] as const)).map((v) => (
                <button key={v} className={viewMode === v ? 'on' : ''} onClick={() => setViewMode(v)}>
                  {v}
                </button>
              ))}
            </div>
            {viewMode === '3D' ? (
              geom3d || 'neon' !== family ? (
                <Suspense fallback={<div className="building3d">{T('Chargement de la vue 3D…')}</div>}>
                <ThreeView
                  geometry={'neon' === family ? geom3d! : ('panel' === family && 'letters' === panelFinish && geom3d ? geom3d : geomPlaque)}
                  plate={
                    'neon' === family
                      ? undefined
                      : {
                          kind: 'boxSign' === family ? 'box' : 'panel',
                          depthCm: 'boxSign' === family ? boxDepth : thickness / 10,
                          materialCss:
                            PANEL_MATERIALS.find((m) => m.id === material)?.css ?? '#c9ced6',
                          faces: boxFaces,
                          printed: 'boxSign' === family ? boxPrinted : 'raw' !== panelFinish,
                          channelLetters: 'panel' === family && 'letters' === panelFinish ? {
                            material: letterMaterial,
                            depthMm: letterDepthMm,
                            faceColor: letterFaceColor,
                            sideColor: letterSideColor,
                            lighting: letterLighting,
                            glowColor: letterGlowColor,
                            backboardLayers: multiLayer ? backboardLayers : [],
                          } : undefined,
                        }
                  }
                  /*
                   * L'IMAGE D'IMPRESSION VIENT DU CONTEXTE HÔTE (E18, reste).
                   *
                   * Ce n'est ni un décor ni un réglage du widget : c'est le
                   * visuel du client, que la boutique lui a fait téléverser.
                   * Le produit sait le recevoir ; il ne l'invente pas.
                   */
                  decor={{
                    id: background.id,
                    image: background.image,
                    imageImprimee: editCtx?.printedArtworkUrl,
                  }}
                  centerOffsetPx={stageSize.dx}
                  widthCm={measurements.widthCm}
                  heightCm={measurements.heightCm}
                  billedTubeLengthM={measurements.tubeLengthM}
                  supportType={outdoor ? 'box' : supportType}
                  finish={finish}
                  boxDepthCm={profondeurCaissonCm}
                  glowHex={logo ? logoColor : captureLines[0]?.colorHex ?? '#ff2d95'}
                  couleursTraits={couleursTraits3d}
                  locale={locale}
                  lit={lit}
                  eclat={eclatHalo}
                  tubeDiametreCm={tubeDiametreCm}
                  t={T}
                />
                </Suspense>
              ) : (
                <div className="building3d">{building3d ? T('Pliage des tubes…') : T('Rien à afficher')}</div>
              )
            ) : (
              'neon' !== family ? (
                (() => {
                  // ---- PANNEAU / CAISSON EN 2D ----
                  // Sans cela, la scène restait vide : le client réglait des
                  // dimensions sans rien voir. On dessine la plaque à sa VRAIE
                  // proportion, avec sa matière et son épaisseur.
                  const cmPx = (v: number) => v * pxPerCm;
                  const w = cmPx(plateW);
                  const h = cmPx(plateH);
                  const rayon = 'rounded' === panelCut ? Math.min(w, h) * 0.08 : 'shape' === panelCut ? Math.min(w, h) * 0.22 : 2;
                  const estCaisson = 'boxSign' === family;
                  // La tranche traduit l'épaisseur réelle — 3 mm ne doit pas
                  // ressembler à 19 mm — et elle est de la MÊME matière que la
                  // face, juste dans l'ombre.
                  const tranche = estCaisson ? Math.max(7, cmPx(boxDepth) * 0.4) : Math.max(2, cmPx(thickness / 10));
                  const imprime = estCaisson ? boxPrinted : 'printed' === panelFinish || 'printed-lam' === panelFinish;
                  return (
                    // Même décalage que la scène néon : un panneau centré sur
                    // toute la largeur passerait lui aussi sous le panneau de
                    // réglages des thèmes immersifs.
                    <div className="neon-stage-inner" style={{ transform: `translateX(${stageSize.dx}px)` }}>
                      {/* L'ombre portée au mur : c'est elle qui « décolle » la
                          pièce du fond et lui donne son volume. */}
                      <div
                        className={`plaque2d mat-${material}${estCaisson ? ' est-caisson' : ''}${lit ? '' : ' eteint'}`}
                        data-testid="plaque2d"
                        style={{
                          width: `${w}px`,
                          height: `${h}px`,
                          borderRadius: `${rayon}px`,
                          // Tranche sous la plaque + ombre au sol, en une seule
                          // pile : la tranche est nette, l'ombre est diffuse.
                          boxShadow: estCaisson && lit
                            ? `0 ${tranche}px 0 -1px var(--tranche), 0 ${tranche + 14}px 34px rgba(0,0,0,.5), 0 0 ${cmPx(20)}px ${cmPx(7)}px rgba(255,222,150,.38)`
                            : `0 ${tranche}px 0 -1px var(--tranche), 0 ${tranche + 14}px 34px rgba(0,0,0,.5)`,
                        } as unknown as React.CSSProperties}
                      >
                        {/* Caisson : cadre en profilé aluminium, comme sur le
                            produit réel — la lumière vit DEDANS. */}
                        {estCaisson ? (
                          <div className={`plaque2d__face${lit ? ' allumee' : ''}`}>
                            {imprime && <span className="plaque2d__print">{T('Votre visuel')}</span>}
                          </div>
                        ) : (
                          <>
                            {imprime && (
                              <div className="plaque2d__artwork">
                                <span className="plaque2d__print">{T('Votre visuel')}</span>
                              </div>
                            )}
                            {'letters' === panelFinish && (
                              <span
                                className={`channel-letter-preview mat-${letterMaterial}`}
                                style={{
                                  fontFamily: (FONTS.find((font) => font.id === lines[0]?.fontId) ?? FONTS[0]!).cssFamily,
                                  '--letter-face': letterFaceColor,
                                  '--letter-side': letterSideColor,
                                  '--letter-glow': letterGlowColor,
                                  '--letter-depth': `${Math.max(2, letterDepthMm / 5)}px`,
                                } as unknown as React.CSSProperties}
                              >
                                {multiLayer && backboardLayers.slice().reverse().map((layer, reverseIndex) => (
                                  <span
                                    key={reverseIndex}
                                    className={`channel-letter-layer mat-${layer.material}`}
                                    style={{ color: layer.color, WebkitTextStroke: `${Math.max(2, cmPx(layer.extensionCm))}px ${layer.color}` }}
                                  >{lines[0]?.text || T('Votre enseigne')}</span>
                                ))}
                                <span className={`channel-letter-face light-${letterLighting}${lit ? ' is-lit' : ''}`}>{lines[0]?.text || T('Votre enseigne')}</span>
                              </span>
                            )}
                            {'engraved' === panelFinish && (
                              <span className="plaque2d__grave">{T('Votre visuel')}</span>
                            )}
                            {/* Vis d'écartement aux angles : elles sont sur la
                                facture (« perçage et fixations »), donc sur
                                l'image. */}
                            {[0, 1, 2, 3].map((i) => (
                              <span key={i} className={`plaque2d__vis vis-${i}`} />
                            ))}
                          </>
                        )}
                        {/* Reflet d'éclairage : une surface réelle n'est jamais
                            uniformément éclairée. */}
                        <div className="plaque2d__reflet" />
                      </div>
                    </div>
                  );
                })()
              ) : (
              (() => {
                // ---- PLAQUE 2D : le support tel qu'il sera découpé ----
                const effType = outdoor ? 'box' : supportType;
                const plate = PLATE_2D[finish] ?? PLATE_2D.clear!;
                const cmPx = (v: number) => v * pxPerCm; // cm réels → px d'affichage
                // Marges réelles de découpe (identiques à la 3D).
                const marginCm = tubeDiametreCm / 2 + (effType === 'contour' ? 1.2 : 0.4);
                const isCut = effType === 'contour' || effType === 'cut-to-letter';
                const strokePx = isCut ? cmPx(marginCm) * 2 : 0;
                const rectMarginPx = cmPx(3);

                const neonLines = (plateLayer: boolean, plateColor?: string, plateStroke?: number) =>
                  lines.map((line, i) => {
                    const font = FONTS.find((f) => f.id === line.fontId) ?? FONTS[0]!;
                    const color = rgb ? NEON_COLORS[(i * 5 + 2) % NEON_COLORS.length]!.hex : line.colorHex;
                    const words = line.text.trim().split(/\s+/).filter(Boolean);
                    if (words.length > 1) {
                      return (
                        <span key={i} className="neon-line-row">
                          {words.map((word, wordIndex) => {
                            const offset = line.wordOffsets?.[wordIndex] ?? { xCm: 0, yCm: 0 };
                            /* LA COULEUR DU MOT, SINON CELLE DE LA LIGNE.
                               Une entrée absente n'est pas du noir : c'est un mot
                               qui n'a pas été distingué, et qui suit sa ligne. */
                            const couleurMot = rgb ? color : (line.wordColors?.[wordIndex]?.colorHex || color);
                            return (
                              <span
                                key={`${wordIndex}-${word}`}
                                className={`neon-line neon-word${!plateLayer && lit ? ' neon-line--lit' : ''}`}
                                data-text={word}
                                onPointerDown={!plateLayer ? (event) => linePointerDown(event, i, wordIndex, line) : undefined}
                                onPointerMove={!plateLayer ? linePointerMove : undefined}
                                onPointerUp={!plateLayer ? linePointerUp : undefined}
                                onPointerCancel={!plateLayer ? linePointerUp : undefined}
                                style={{
                                  fontFamily: font.cssFamily,
                                  fontWeight: font.weight,
                                  fontSize: `${fontPxFor(line.fontId)}px`,
                                  '--neon-color': couleurMot,
                                  transform: `translate(${offset.xCm * pxPerCm}px, ${offset.yCm * pxPerCm}px)`,
                                  ...(plateLayer
                                    ? { color: plateColor ?? plate.solid, WebkitTextStrokeWidth: `${plateStroke ?? strokePx}px`, WebkitTextStrokeColor: plateColor ?? plate.solid, paintOrder: 'stroke fill' }
                                    : lit
                                      ? litStyle(couleurMot, fontPxFor(line.fontId))
                                      : offStyle(couleurMot, fontPxFor(line.fontId))),
                                } as unknown as React.CSSProperties}
                              >{word}</span>
                            );
                          })}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={i}
                        className={`neon-line${!plateLayer && lit ? ' neon-line--lit' : ''}`}
                        data-text={line.text || ' '}
                        onPointerDown={!plateLayer ? (event) => linePointerDown(event, i, 0, line) : undefined}
                        onPointerMove={!plateLayer ? linePointerMove : undefined}
                        onPointerUp={!plateLayer ? linePointerUp : undefined}
                        onPointerCancel={!plateLayer ? linePointerUp : undefined}
                        style={{
                          fontFamily: font.cssFamily,
                          fontWeight: font.weight,
                          fontSize: `${fontPxFor(line.fontId)}px`,
                          '--neon-color': color,
                          transform: `translate(${(line.wordOffsets?.[0]?.xCm ?? line.offsetXCm ?? 0) * pxPerCm}px, ${(line.wordOffsets?.[0]?.yCm ?? line.offsetYCm ?? 0) * pxPerCm}px)`,
                          ...(plateLayer
                            ? {
                                color: plateColor ?? plate.solid,
                                WebkitTextStrokeWidth: `${plateStroke ?? strokePx}px`,
                                WebkitTextStrokeColor: plateColor ?? plate.solid,
                                paintOrder: 'stroke fill',
                              }
                            : lit
                              ? litStyle(color, fontPxFor(line.fontId))
                              : offStyle(color, fontPxFor(line.fontId))),
                        } as unknown as React.CSSProperties}
                      >
                        {line.text || ' '}
                      </span>
                    );
                  });

                // Une ligne vide n'est pas du texte : sans ce filtre, le logo
                // gardait un interligne sous lui alors qu'il était seul.
                const texteVisible = lines.some((l) => '' !== l.text.trim());
                const apercuLogo = logo ? (
                  /*
                   * LA HAUTEUR DU LOGO EST CELLE DE SA COTE, SANS PLAFOND.
                   *
                   * Elle valait `max(60, min(320, hauteur × pxPerCm))`. Le
                   * plafond de 320 px mordait dès que la scène était large :
                   * mesuré le 7 septembre 2026 sur une fenêtre de 1440 px, un
                   * logo réglé à 32 cm sortait à 19,9 px/cm, donc 636 px —
                   * ramenés à 320, c'est-à-dire à la MOITIÉ de son échelle.
                   *
                   * Or les cotes de la scène ne sont pas calculées, elles sont
                   * MESURÉES sur le dessin (`positionedWidthCm` /
                   * `positionedHeightCm`, bornes du DOM ÷ pxPerCm), et le
                   * repère à l'échelle — la feuille A4 posée à côté — est
                   * dessiné, lui, au vrai `pxPerCm`. Le client voyait donc son
                   * néon d'un mètre annoncé « 41,9 × 16,1 cm » à côté d'une
                   * feuille A4 deux fois trop grande. C'est exactement l'erreur
                   * de taille que le repère existe pour empêcher
                   * (`parcours-configurateur-ux` §2 : la plainte n° 1).
                   *
                   * Aucun plafond n'est nécessaire : `pxPerCm` est déjà calculé
                   * pour faire TENIR la pièce dans la scène — il part de
                   * `measurements`, dont la hauteur est justement celle du logo
                   * (`metrics.ts`, branche `logo-svg`). Le plancher de 60 px
                   * faussait l'échelle dans l'autre sens, sur les petites.
                   *
                   * Le prix ne bouge pas : il vient de `logo.tubeLengthMm`,
                   * mesuré sur les tracés du SVG, jamais de l'aperçu.
                   */
                  /*
                   * L'INTERRUPTEUR NE FAISAIT RIEN SUR UN LOGO.
                   *
                   * `parcours-configurateur-ux` §4 appelle l'état éteint « l'angle
                   * mort des concurrents, pas le nôtre ». Il l'était pourtant
                   * aussi ici dès qu'on téléversait un logo : la lueur était
                   * appliquée sans condition, et le client actionnait la bascule
                   * sans que rien ne bouge.
                   *
                   * ÉTEINT, ON NE MONTRE PAS L'ILLUSTRATION. Un néon éteint
                   * montre le TUBE — un boudin de silicone mat plié à cette forme
                   * (`physique-neon-led` §2.4). L'image sert donc de POCHOIR et
                   * se remplit de la teinte éteinte, la même que celle du texte :
                   * les deux familles s'éteignent pareil, parce que c'est le même
                   * tube.
                   */
                  lit ? (
                    <img
                      src={(logoRendu ?? logo).dataUrl}
                      alt="Logo néon"
                      className="logo-preview"
                      data-testid="logo-preview"
                      onPointerDown={logoPointerDown}
                      onPointerMove={logoPointerMove}
                      onPointerUp={logoPointerUp}
                      onPointerCancel={logoPointerUp}
                      style={{
                        // Dans la pile, le logo est un bloc centré : sans cela
                        // il resterait en ligne, collé au dernier mot.
                        display: 'block',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        // L'écart avec le texte est celui du cœur (0,35 × la
                        // hauteur de lettre), et il n'existe que s'il y a du
                        // texte au-dessus ou en dessous.
                        ...(texteVisible
                          ? { ['below' === logoPlacement ? 'marginTop' : 'marginBottom']: `${letterHeightCm * 0.35 * pxPerCm}px` }
                          : {}),
                        transform: `translate(${logoOffset.xCm * pxPerCm}px, ${logoOffset.yCm * pxPerCm}px)`,
                        height: `${logoHeightCm * pxPerCm}px`,
                        // `max-width: 82%` (styles.ts) rognait la boite
                        // avant que l'echelle s'applique : mesure du
                        // 7 septembre 2026, un logo de 99,6 cm sortait a
                        // 80 cm de large, hauteur juste et largeur fausse.
                        // Le cadrage est deja assure par `pxPerCm`.
                        maxWidth: 'none',
                        filter: `drop-shadow(0 0 5px ${logoColor}) drop-shadow(0 0 16px ${logoColor}) drop-shadow(0 0 38px ${logoColor})`,
                      }}
                    />
                  ) : (
                    <div
                      className="logo-preview logo-preview--eteint"
                      data-testid="logo-preview"
                      role="img"
                      aria-label="Logo néon éteint"
                      onPointerDown={logoPointerDown}
                      onPointerMove={logoPointerMove}
                      onPointerUp={logoPointerUp}
                      onPointerCancel={logoPointerUp}
                      style={{
                        // Dans la pile, le logo est un bloc centré : sans cela
                        // il resterait en ligne, collé au dernier mot.
                        display: 'block',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        // L'écart avec le texte est celui du cœur (0,35 × la
                        // hauteur de lettre), et il n'existe que s'il y a du
                        // texte au-dessus ou en dessous.
                        ...(texteVisible
                          ? { ['below' === logoPlacement ? 'marginTop' : 'marginBottom']: `${letterHeightCm * 0.35 * pxPerCm}px` }
                          : {}),
                        transform: `translate(${logoOffset.xCm * pxPerCm}px, ${logoOffset.yCm * pxPerCm}px)`,
                        height: `${logoHeightCm * pxPerCm}px`,
                        // `max-width: 82%` (styles.ts) rognait la boite
                        // avant que l'echelle s'applique : mesure du
                        // 7 septembre 2026, un logo de 99,6 cm sortait a
                        // 80 cm de large, hauteur juste et largeur fausse.
                        // Le cadrage est deja assure par `pxPerCm`.
                        maxWidth: 'none',
                        // Le rapport vient du SVG lui-même : sans lui, la boîte
                        // du pochoir serait carrée et la forme écrasée.
                        aspectRatio: String(((logoRendu ?? logo).unitsW || 1) / ((logoRendu ?? logo).unitsH || 1)),
                        background: melangeSrgb(logoColor, 0.14, '#edeff2'),
                        ['--ahns-logo' as string]: `url("${(logoRendu ?? logo).dataUrl}")`,
                      }}
                    />
                  )
                ) : null;

                /*
                 * TEXTE + LOGO DANS LA MÊME PILE.
                 *
                 * Le logo REMPLAÇAIT le texte : `content` était l'un ou
                 * l'autre. Il prend maintenant sa place dans la même colonne
                 * centrée que les lignes, au-dessus ou en dessous, et il se
                 * déplace ensuite au doigt comme un mot.
                 *
                 * L'écart qui le sépare du texte est celui du CŒUR —
                 * `letterHeightCm × INTERLINE_RATIO` — et pas une valeur
                 * choisie ici : c'est lui qui entre dans la hauteur facturée,
                 * et le dessin doit montrer la pièce qu'on vend.
                 */
                const content = !apercuLogo ? (
                  <div className="neon-text" data-testid="neon-text">{neonLines(false)}</div>
                ) : !texteVisible ? apercuLogo : (
                  <div className="neon-text" data-testid="neon-text">
                    {'above' === logoPlacement && apercuLogo}
                    {neonLines(false)}
                    {'below' === logoPlacement && apercuLogo}
                  </div>
                );

                // Découpe suivant la lettre : un calque de texte au CONTOUR
                // épais donne exactement la silhouette dilatée de la plaque.
                // Deux calques : la TRANCHE (arête claire) puis la face — le
                // liseré garde la plaque lisible sous le halo du néon.
                const rimPx = Math.max(1.5, cmPx(0.18));
                const showClearPlate = finish !== 'clear' || !lit;
                const cutPlate = isCut && !logo && strokePx > 0 && showClearPlate ? (
                  <>
                    <div
                      className="neon-text plate-cut"
                      data-testid="plate-2d"
                      aria-hidden="true"
                      style={{
                        filter: finish === 'clear'
                          ? `drop-shadow(0 1px ${Math.max(1, cmPx(0.18))}px rgba(0,0,0,.12))`
                          : `drop-shadow(0 ${Math.max(1, cmPx(0.25))}px ${cmPx(0.6)}px rgba(0,0,0,.55))`,
                      }}
                    >
                      {neonLines(true, plate.edge, strokePx)}
                    </div>
                    <div className="neon-text plate-cut plate-cut--face" aria-hidden="true">
                      {neonLines(true, plate.solid, Math.max(0, strokePx - rimPx * 2))}
                    </div>
                  </>
                ) : null;

                // Plaque rectangulaire / pied / caisson (+ tranche pour le caisson).
                const rectPlate = (!isCut || logo) && effType !== 'none' && showClearPlate ? (
                  <div
                    className={`plate-rect${effType === 'box' ? ' is-box' : ''}`}
                    data-testid="plate-2d"
                    aria-hidden="true"
                    style={{
                      inset: `-${rectMarginPx}px`,
                      background: plate.css,
                      borderRadius: `${cmPx(2)}px`,
                      boxShadow: `inset 0 1px 0 ${plate.edge}, 0 ${cmPx(0.4)}px ${cmPx(1.4)}px rgba(0,0,0,.5)`,
                    }}
                  />
                ) : null;

                return (
                  <div ref={sceneDesignRef} className="neon-stage-inner neon-stage-inner--editable" style={{ transform: `translateX(${stageSize.dx}px) scale(${sceneZoom})` }}>
                    {repereEchelle}
                    <div className="scene-ruler scene-ruler--vertical" aria-hidden="true" style={sceneBounds ? { top: `${sceneBounds.top}px`, bottom: 'auto', left: `${sceneBounds.left - 58}px`, height: `${sceneBounds.bottom - sceneBounds.top}px` } : undefined}>
                      <i /><span>{positionedHeightCm.toFixed(1)} cm<br /><small>{(positionedHeightCm / 2.54).toFixed(2)} in</small></span><i />
                    </div>
                    <div className="scene-ruler scene-ruler--horizontal" aria-hidden="true" style={sceneBounds ? { left: `${sceneBounds.left}px`, right: 'auto', top: `${sceneBounds.bottom + 14}px`, bottom: 'auto', width: `${sceneBounds.right - sceneBounds.left}px` } : undefined}>
                      <i /><span>{positionedWidthCm.toFixed(1)} cm / {(positionedWidthCm / 2.54).toFixed(2)} in</span><i />
                    </div>
                    {rectPlate}
                    {cutPlate}
                    {content}
                    {/* Entretoises : le support est VISSÉ au mur, pas collé.
                        Seulement sur les plaques rectangulaires — sur une
                        découpe à la lettre, elles se cachent derrière. */}
                    {('rectangle' === effType || 'box' === effType) &&
                      [0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`neon2d-vis vis-${i}`}
                          style={{ '--d': `${-rectMarginPx + 7}px` } as React.CSSProperties}
                        />
                      ))}
                    {/* Le câble d'alimentation, comme en 3D : il descend du
                        bord et sort du cadre. Un néon sans câble est un dessin. */}
                    <svg className="neon2d-cable" viewBox="0 0 60 120" aria-hidden="true">
                      <path d="M30 2 C 30 40, 48 52, 46 86 S 38 112, 40 118" fill="none" stroke="rgba(190,198,208,.65)" strokeWidth="2.6" strokeLinecap="round" />
                      <path d="M30 2 C 30 40, 48 52, 46 86 S 38 112, 40 118" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                  </div>
                );
              })()
            ))}
            {/* LES COTES, EN CLAIR SOUS LA SCÈNE.
                Elles n'existaient en 2D que sur les RÈGLES d'atelier, autour
                du dessin. Une peau qui les masque - Comptoir le fait, sa
                maquette ne montre aucune règle : laissait alors le client sans
                aucune dimension : il compose une enseigne sans savoir quelle
                taille elle fait. Cette pastille dit la même chose en une
                ligne. Masquée par défaut, elle ne s'affiche que dans les peaux
                qui renoncent aux règles. */}
            {'neon' === family && viewMode === '2D' && (
              <div className="hud hud--cotes" data-testid="scene-cotes">
                <span><b>{Math.round(positionedWidthCm)}</b> × <b>{Math.round(positionedHeightCm)}</b> cm</span>
                <i />
                <span>{T('tube')} <b>{measurements.tubeLengthM.toFixed(1)}</b> m</span>
              </div>
            )}
            {'neon' === family && viewMode === '2D' && (
              <div className="scene-toolbar" data-testid="scene-toolbar">
                <button onClick={() => setSceneZoom((zoom) => Math.min(1.6, Math.round((zoom + 0.1) * 10) / 10))} title={T('Zoomer')} aria-label={T('Zoomer')}>＋</button>
                <button onClick={() => setSceneZoom((zoom) => Math.max(0.55, Math.round((zoom - 0.1) * 10) / 10))} title={T('Dézoomer')} aria-label={T('Dézoomer')}>−</button>
                <button onClick={() => setSceneZoom(1)} title={T('Ajuster à la scène')} aria-label={T('Ajuster à la scène')}>⌖</button>
                <button onClick={undoScene} disabled={!scenePast.length} title={T('Annuler')} aria-label={T('Annuler')}>↶</button>
                <button onClick={redoScene} disabled={!sceneFuture.length} title={T('Rétablir')} aria-label={T('Rétablir')}>↷</button>
                <button className="scene-toolbar__background" onClick={cycleBackground} title={T('Changer le fond')} aria-label={T('Changer le fond')}>
                  <i style={{ background: background.css, backgroundSize: 'cover' }} />
                  <span>{T('Fond')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Panneau ---------- */}
        <div className="panel" ref={panelRef} data-replie={replie ? 'oui' : undefined}>
          {/* ================= LA COMMANDE EST UNE PHRASE =================
              Peau « La Lettre ». Chaque valeur est un bouton souligné : on le
              clique, une bulle s'ouvre dessous avec la section correspondante,
              on choisit, la phrase se réécrit. Les six mots donnent sur quatre
              groupes — le texte, l'écriture et la couleur habitent la même
              section, et la feuille de style de la peau n'y montre alors que
              ce que le mot annonce.

              CE N'EST PAS UN RÉSUMÉ, C'EST LE PANNEAU. Il n'y a pas d'autre
              endroit où régler quoi que ce soit dans cette peau — d'où le soin
              mis à ce que chaque valeur configurable ait son mot. */}
          {enLettre && (
            <p className="lettre">
              {T('Je veux un néon qui dit')}{' '}
              <button
                className={`lettre-mot${'texte' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('texte', 'text', e)}
              >{motsDeLaLettre.texte}</button>{T(', écrit en')}{' '}
              <button
                className={`lettre-mot${'police' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('police', 'text', e)}
              >{motsDeLaLettre.police}</button>{T(', qui brille en')}{' '}
              <button
                className={`lettre-mot${'couleur' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('couleur', 'text', e)}
              >{motsDeLaLettre.couleur}</button>{T(', avec des lettres de')}{' '}
              <button
                className={`lettre-mot${'taille' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('taille', 'size', e)}
              >{motsDeLaLettre.taille}</button>{T(', monté sur')}{' '}
              <button
                className={`lettre-mot${'support' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('support', 'support', e)}
              >{motsDeLaLettre.support}</button>{', '}
              <button
                className={`lettre-mot${'extras' === motOuvert ? ' ouvert' : ''}`}
                onClick={(e) => ouvrirMot('extras', 'options', e)}
              >{motsDeLaLettre.extras}</button>{' · '}{T('pour')}{' '}
              <span className="lettre-prix">{euros(price.displayTotalCents)}</span>.
            </p>
          )}
          {enLettre && (
            <p className="lettre-signature">
              {T('Chaque lettre sera pliée à la main dans un tube LED continu.')}
              <br />
              <b>{'- ' + (hostContext()?.siteName || T('votre atelier'))}</b>
            </p>
          )}
          <button className="handle" onClick={() => setSheetFull((f) => !f)} aria-label="Agrandir ou réduire le panneau">
            <i />
          </button>
          <div className={`tabs${'neon' === family ? '' : ' sect--na'}`}>
            {ONGLETS.map((tab) => (
              <button key={tab.id} className={mobileTab === tab.id ? 'on' : ''} onClick={() => setMobileTab(tab.id)}>
                {T(tab.label)}
              </button>
            ))}
          </div>
          {/* Parcours guidé (thèmes à étapes) : la barre de progression
              remplace les onglets — mêmes groupes, autre présentation. */}
          {stepsOn && (
            <div className="etapes" data-testid="etapes">
              {ONGLETS.map((tab, i) => (
                <button
                  key={tab.id}
                  className={`etape-pas${i === stepIndex && !replie ? ' courante' : ''}${i < stepIndex && !replie ? ' faite' : ''}`}
                  data-nom={T(tab.label)}
                  aria-expanded={theme.panneauRepliable ? (i === stepIndex && !replie) : undefined}
                  onClick={() => ouvrirEtape(i)}
                  aria-label={T(tab.label)}
                />
              ))}
            </div>
          )}
          <div
            className="panes"
            data-mot={enLettre ? (motOuvert ?? '') : undefined}
            style={
              enLettre
                ? ({
                    ['--ahns-mot-x' as string]: `${Math.round(ancreMot.x)}px`,
                    ['--ahns-mot-y' as string]: `${Math.round(ancreMot.y)}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {/* CE QU'ON FABRIQUE - avant tout le reste. Une interface qui
                mélange un tube LED et une plaque de dibond ne se comprend pas. */}
            {families.length > 1 && (
              <div className="familles" data-testid="familles">
                {families.map((f) => (
                  <button
                    key={f.id}
                    className={family === f.id ? 'on' : ''}
                    onClick={() => { setFamily(f.id as 'neon'); edited(); }}
                    title={T(f.hint)}
                  >
                    {T(f.label)}
                  </button>
                ))}
              </div>
            )}

            {/* Accordéon (disposition « accordion ») : les en-têtes de carte
                s'intercalent entre les sections par `order` CSS — le balisage
                des sections, lui, ne bouge pas. Fermée, une carte résume le
                choix ; visitée, elle porte une coche. */}
            {accordionOn && ONGLETS.map((tab, i) => {
              const courante = tab.id === mobileTab;
              const faite = !courante && visitedTabs.includes(tab.id);
              return (
                <button
                  key={`acc-${tab.id}`}
                  className={`acc-tete grp-${tab.id}${courante ? ' courante' : ''}${faite ? ' faite' : ''}`}
                  data-testid={`acc-${tab.id}`}
                  onClick={() => openCard(tab.id)}
                >
                  <span className="acc-num">{faite ? '✓' : i + 1}</span>
                  <span className="acc-infos">
                    <b>{T(tab.label)}</b>
                    {!courante && <small>{cardSummary(tab.id)}</small>}
                  </span>
                  <span className="acc-fleche">▾</span>
                </button>
              );
            })}

            {/* --- PANNEAU / CAISSON ------------------------------------- */}
            {'neon' !== family && (
              <section className="sect" data-testid="plaque">
                <h2>{T('boxSign' === family ? 'Votre caisson' : 'Votre panneau')}</h2>

                <div className="dims-in">
                  <label>
                    <span>{T('Largeur (cm)')}</span>
                    <input
                      type="number" min={10} max={250} step={1} value={plateW}
                      onChange={(e) => { setPlateW(Math.max(1, Number(e.target.value) || 0)); edited(); }}
                      data-testid="plate-w"
                    />
                  </label>
                  <label>
                    <span>{T('Hauteur (cm)')}</span>
                    <input
                      type="number" min={10} max={250} step={1} value={plateH}
                      onChange={(e) => { setPlateH(Math.max(1, Number(e.target.value) || 0)); edited(); }}
                      data-testid="plate-h"
                    />
                  </label>
                </div>

                <h2>{T('Matière')}</h2>
                <div className="cards">
                  {PANEL_MATERIALS.map((m) => (
                    <button
                      key={m.id}
                      className={material === m.id ? 'on' : ''}
                      onClick={() => { setMaterial(m.id); edited(); }}
                    >
                      <span className="swatch-mat" style={{ background: m.css }} />
                      {T(m.label)}
                      <small>{T(m.hint)}</small>
                    </button>
                  ))}
                </div>

                {'panel' === family && (
                  <>
                    <h2>{T('Épaisseur')}</h2>
                    <div className="sizes">
                      {thicknesses.map((e) => (
                        <button
                          key={e}
                          className={thickness === e ? 'on' : ''}
                          onClick={() => { setThickness(e); edited(); }}
                        >
                          {e}<br /><small>mm</small>
                        </button>
                      ))}
                    </div>

                    <h2>{T('Finition')}</h2>
                    <div className="cards">
                      {PANEL_FINISHES.map((f) => (
                        <button
                          key={f.id}
                          className={panelFinish === f.id ? 'on' : ''}
                          onClick={() => { setPanelFinish(f.id); edited(); }}
                        >
                          {T(f.label)}
                          <small>{T(f.hint)}</small>
                        </button>
                      ))}
                    </div>

                    <h2>{T('Découpe')}</h2>
                    <div className="cards">
                      {PANEL_CUTS.map((c) => (
                        <button
                          key={c.id}
                          className={panelCut === c.id ? 'on' : ''}
                          onClick={() => { setPanelCut(c.id); edited(); }}
                        >
                          {T(c.label)}
                          <small>{T(c.hint)}</small>
                        </button>
                      ))}
                    </div>

                    {'letters' === panelFinish && (
                      <div className="channel-options" data-testid="channel-options">
                        <h2>{T('Matière des lettres 3D')}</h2>
                        <div className="cards cards--three">
                          {([
                            { id: 'acrylic', label: 'Acrylique', hint: 'Brillant, diffusant' },
                            { id: 'wood', label: 'Bois', hint: 'Chaleureux et naturel' },
                            { id: 'metal', label: 'Métal', hint: 'Aluminium ou inox' },
                          ] as const).map((item) => (
                            <button key={item.id} className={letterMaterial === item.id ? 'on' : ''} onClick={() => { setLetterMaterial(item.id); edited(); }}>
                              {T(item.label)}<small>{T(item.hint)}</small>
                            </button>
                          ))}
                        </div>

                        <h2>{T('Profondeur des lettres')}</h2>
                        <div className="sizes">
                          {[10, 20, 30, 50, 80].map((depth) => <button key={depth} className={letterDepthMm === depth ? 'on' : ''} onClick={() => { setLetterDepthMm(depth); edited(); }}>{depth}<br /><small>mm</small></button>)}
                        </div>

                        <h2>{T('Éclairage')}</h2>
                        <div className="cards cards--two">
                          {([
                            { id: 'none', label: 'Sans éclairage' },
                            { id: 'front', label: 'Face lumineuse' },
                            { id: 'back', label: 'Rétroéclairé' },
                            { id: 'front-back', label: 'Face + rétroéclairage' },
                          ] as const).map((item) => <button key={item.id} className={letterLighting === item.id ? 'on' : ''} onClick={() => { setLetterLighting(item.id); edited(); }}>{T(item.label)}</button>)}
                        </div>

                        <div className="channel-colors">
                          <label><span>{T('Face')}</span><input type="color" value={letterFaceColor} onChange={(event) => { setLetterFaceColor(event.target.value); edited(); }} /></label>
                          <label><span>{T('Tranche')}</span><input type="color" value={letterSideColor} onChange={(event) => { setLetterSideColor(event.target.value); edited(); }} /></label>
                          <label><span>{T('Lumière')}</span><input type="color" value={letterGlowColor} onChange={(event) => { setLetterGlowColor(event.target.value); edited(); }} /></label>
                        </div>

                        <OptionRow
                          label={T('Support multicouche')}
                          hint={T('Plusieurs matières et couleurs découpées autour des lettres')}
                          checked={multiLayer}
                          onToggle={() => { setMultiLayer((value) => !value); setPanelCut('shape'); edited(); }}
                        />
                        {multiLayer && backboardLayers.map((layer, layerIndex) => (
                          <div className="backboard-layer" key={layerIndex}>
                            <strong>{T(`Couche ${layerIndex + 1}`)}</strong>
                            <select value={layer.material} onChange={(event) => setBackboardLayers((current) => current.map((item, index) => index === layerIndex ? { ...item, material: event.target.value as 'acrylic' | 'wood' | 'metal' } : item))}>
                              <option value="acrylic">{T('Acrylique')}</option><option value="wood">{T('Bois')}</option><option value="metal">{T('Métal')}</option>
                            </select>
                            <input type="color" value={layer.color} onChange={(event) => setBackboardLayers((current) => current.map((item, index) => index === layerIndex ? { ...item, color: event.target.value } : item))} />
                            <label>{T('Débord')} <input type="number" min={0.4} max={8} step={0.2} value={layer.extensionCm} onChange={(event) => setBackboardLayers((current) => current.map((item, index) => index === layerIndex ? { ...item, extensionCm: Number(event.target.value) } : item))} /> cm</label>
                          </div>
                        ))}
                      </div>
                    )}

                    <OptionRow
                      label={T('Impression recto verso')}
                      hint={T('Le dos est imprimé lui aussi')}
                      checked={doubleSided}
                      onToggle={() => { setDoubleSided((v) => !v); edited(); }}
                    />
                  </>
                )}

                {'boxSign' === family && (
                  <>
                    <h2>{T('Profondeur')}</h2>
                    <div className="sizes">
                      {[8, 12, 16, 20].map((d) => (
                        <button
                          key={d}
                          className={boxDepth === d ? 'on' : ''}
                          onClick={() => { setBoxDepth(d); edited(); }}
                        >
                          {d}<br /><small>cm</small>
                        </button>
                      ))}
                    </div>
                    <p className="hint">
                      {T('Sous 6 cm, les modules LED se devinent sur la face : la lumière n’est plus uniforme.')}
                    </p>

                    <h2>{T('Faces lumineuses')}</h2>
                    <div className="cards">
                      {([1, 2] as const).map((n) => (
                        <button
                          key={n}
                          className={boxFaces === n ? 'on' : ''}
                          onClick={() => { setBoxFaces(n); edited(); }}
                        >
                          {T(1 === n ? 'Simple face' : 'Double face')}
                          <small>{T(1 === n ? 'Contre un mur' : 'En drapeau, vu des deux côtés')}</small>
                        </button>
                      ))}
                    </div>

                    <OptionRow
                      label={T('Face imprimée')}
                      hint={T('Votre visuel sur la face lumineuse')}
                      checked={boxPrinted}
                      onToggle={() => { setBoxPrinted((v) => !v); edited(); }}
                    />
                  </>
                )}
              </section>
            )}

            {/* Texte / Logo */}
            <section className={'neon' === family || ('panel' === family && 'letters' === panelFinish) ? sectCls('text') : 'sect sect--na'}>
              <h2>{T(logo
                ? (avecTexte ? 'Votre logo et votre texte' : 'Votre logo')
                : (enTicket ? 'Message' : 'Votre texte'))}</h2>
              {!logo && <p className="hint hint--lead">{T('Tapez ici le texte de votre néon')}</p>}
              {logo && (
                <div className="linebox">
                  <div className="linerow" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {T('image' === logo.source ? 'Image importée' : 'Logo vectoriel importé')}
                    </span>
                    <button className="rmline" onClick={() => { setLogo(null); edited(); }}>
                      {T('Retirer le logo')}
                    </button>
                  </div>
                  {!enTicket && (
                    <>
                    {/* LA RANGEE SE NOMME DES QU'UNE AUTRE LUI RESSEMBLE.

                        Depuis que le texte reste visible sous un logo, l'ecran
                        porte DEUX rangees de pastilles identiques : celle-ci,
                        qui teinte le logo, et celle de la ligne de texte, qui
                        ne le touche pas. Signale par un client le 7 septembre
                        2026 — « on n'arrive pas a changer la couleur une fois
                        le logo importe » : il cliquait la seconde, celle qui
                        tombe sous les polices, la ou l'oeil va. */}
                    {avecTexte && <span className="mini-label">{T('Couleur du logo')}</span>}
                    <div className="swatches">
                      {colors.map((c) => (
                        <button
                          key={c.hex}
                          className={`sw${logoColor === c.hex ? ' on' : ''}`}
                          style={{ background: c.hex, boxShadow: `0 0 10px ${c.hex}` }}
                          title={c.label}
                          onClick={() => { setLogoColor(c.hex); edited(); }}
                        />
                      ))}
                    </div>
                    </>
                  )}
                  <p className="hint">
                    {/* On dit SUR QUOI la mesure a été faite : « vos tracés »
                        promettrait une précision de vectoriel à quelqu'un qui a
                        déposé une photo de son enseigne. */}
                    {logoMesure
                      ? T('Mesure du tracé de tube en cours…')
                      : <>
                          {T('image' === logo.source
                            ? 'Longueur de tube mesurée sur votre image :'
                            : 'Longueur de tube mesurée sur vos tracés :')}
                          {/* LA LONGUEUR DU LOGO, PAS CELLE DE LA PIÈCE.
                              Avec un texte à côté, `measurements` porte le
                              total des deux : l'annoncer ici, sous une phrase
                              qui dit « mesurée sur votre image », attribuerait
                              au logo le tube des lettres. Le total est au
                              détail du prix, à sa place. */}
                          {' '}{((config.logo?.tubeLengthMm ?? 0) / 1000).toFixed(2)} m.
                          {' '}{T('Une maquette vous sera confirmée avant fabrication.')}
                        </>}
                  </p>
                  {/*
                    * LA HAUTEUR DU LOGO VIT AVEC LE LOGO.
                    *
                    * Elle était portée par le curseur de taille commun, qui
                    * changeait de sens selon qu'un logo était chargé ou non.
                    * Dès qu'un texte l'accompagne, il y a DEUX hauteurs à
                    * régler, et un curseur ne peut pas en dire deux.
                    */}
                  {/* LES MEMES BORNES QUE LES LETTRES.

                      Le curseur des lettres allait de 8 a 60 cm, celui du logo
                      de 10 a 120, en dur. Deux mesures de meme nature sur la
                      meme piece, avec deux echelles : signale par un client le
                      7 septembre 2026. Le logo suit desormais `sizeBounds`, que
                      le marchand regle — et qu'il regle donc UNE fois pour les
                      deux. */}
                  <span className="mini-label">{T('Hauteur du logo')}</span>
                  <div className="slider-row">
                    <span>{sizeBounds.minCm}</span>
                    <input
                      type="range"
                      min={sizeBounds.minCm}
                      max={sizeBounds.maxCm}
                      value={logoHeightCm}
                      aria-label={T('Hauteur du logo')}
                      data-testid="taille-logo"
                      onChange={(e) => { setLogoHeightCm(Number(e.target.value)); edited(); }}
                    />
                    <span>{sizeBounds.maxCm} cm</span>
                  </div>
                  {avecTexte && (
                    <>
                      <span className="mini-label">{T('Place du logo')}</span>
                      <div className="sizes">
                        {([['above', 'Au-dessus du texte'], ['below', 'En dessous du texte']] as const).map(([id, libelle]) => (
                          <button
                            key={id}
                            className={logoPlacement === id ? 'on' : ''}
                            onClick={() => { setLogoPlacement(id); setLogoOffset({ xCm: 0, yCm: 0 }); edited(); }}
                          >{T(libelle)}</button>
                        ))}
                      </div>
                      {(logoOffset.xCm || logoOffset.yCm) ? (
                        <button
                          className="rmline"
                          onClick={() => { setLogoOffset({ xCm: 0, yCm: 0 }); edited(); }}
                        >{T('Remettre le logo à sa place')}</button>
                      ) : (
                        <p className="hint">{T('Faites glisser le logo sur l’aperçu pour le placer où vous voulez.')}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* LE TEXTE NE DISPARAÎT PLUS DERRIÈRE LE LOGO.
                  Les deux se composent : masquer les champs revenait à dire au
                  client de choisir entre son nom et sa marque. */}
              {lines.map((line, i) => {
                /*
                 * UNE LIGNE VIDE SOUS UN LOGO NE MONTRE QUE SON CHAMP.
                 *
                 * Le client qui televerse son logo et ne veut QUE son logo
                 * voyait quand meme, dessous, un champ vide, trente-trois
                 * ecritures et quinze pastilles — des reglages pour un texte
                 * qui n'existe pas. Et ces pastilles-la ne teintent pas le
                 * logo : elles sont a la disposition d'une ligne muette.
                 *
                 * Elles reviennent des qu'il tape un caractere, et la
                 * composition reste possible : on ne ferme pas la porte, on
                 * arrete juste de la montrer ouverte sur une piece vide.
                 */
                const reglagesLigne = !logo || '' !== line.text.trim();
                return (
                <div key={i} className="linebox">
                  <input
                    type="text"
                    className="textfield"
                    autoFocus={i === 0}
                    value={line.text}
                    maxLength={40}
                    placeholder={T('Votre texte…')}
                    onChange={(e) => {
                      /* LES COULEURS PAR MOT SUIVENT LE TEXTE.
                         Ajouter un mot au milieu decalerait toutes les couleurs
                         d'un cran si on gardait le tableau tel quel ; on le
                         recale sur le nouveau nombre de mots, et on le retire
                         quand il n'en reste qu'un. */
                      const mots = motsDeLigne(e.target.value);
                      const avant = line.wordColors;
                      patchLine(i, {
                        text: e.target.value,
                        ...(avant
                          ? { wordColors: mots.length > 1 ? mots.map((_, j) => ({ ...(avant[j] ?? {}) })) : undefined }
                          : {}),
                      });
                      if (motChoisi && motChoisi.ligne === i && motChoisi.mot >= mots.length) setMotChoisi(null);
                      edited();
                    }}
                  />
                  {reglagesLigne && (<div className="linerow">
                    <div className="fontpick">
                      {/*
                        Trente-trois écritures d'un coup, c'est un catalogue
                        d'imprimeur posé au milieu d'un achat : le client
                        parcourt une liste au lieu de choisir. On en montre
                        DOUZE, puis on propose le reste.

                        Et l'écriture RETENUE reste toujours visible, même
                        repliée : si elle est au-delà du douzième rang, elle
                        remonte en tête. Sans cela, un client qui a choisi
                        « Yellowtail » ne voit plus son propre choix en
                        revenant sur l'étape — c'est le seul cas qui compte
                        vraiment, et c'est celui qu'on oublie.
                      */}
                      {(() => {
                        const VISIBLES = 12;
                        const choisie = FONTS.find((f) => f.id === line.fontId);
                        const rang = FONTS.findIndex((f) => f.id === line.fontId);
                        const debut = rang >= VISIBLES && choisie
                          ? [choisie, ...FONTS.filter((f) => f.id !== line.fontId).slice(0, VISIBLES - 1)]
                          : FONTS.slice(0, VISIBLES);
                        return (policesOuvertes ? FONTS : debut).map((f) => (
                          <button
                            key={f.id}
                            className={line.fontId === f.id ? 'on' : ''}
                            style={{ fontFamily: f.cssFamily }}
                            onClick={() => { patchLine(i, { fontId: f.id }); edited(); }}
                          >
                            {f.label}
                          </button>
                        ));
                      })()}
                      {FONTS.length > 12 && (
                        <button
                          type="button"
                          className="fontpick__plus"
                          aria-expanded={policesOuvertes}
                          onClick={() => setPolicesOuvertes((v) => !v)}
                        >
                          {policesOuvertes
                            ? T('Voir moins')
                            : `+ ${FONTS.length - 12} ${T('autres écritures')}`}
                        </button>
                      )}
                    </div>
                    {lines.length > 1 && (
                      <button className="rmline" onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); edited(); }}>
                        {T('Retirer')}
                      </button>
                    )}
                  </div>)}
                  {reglagesLigne && !rgb && (!enTicket || lines.length > 1) && (
                    <>
                    {motsDeLigne(line.text).length > 1 && (
                      <>
                        {/* UNE RANGEE, ET ON DIT CE QU'ELLE VISE.
                            Le client demandait a colorer chaque mot ; une rangee
                            par mot aurait empile quarante-cinq pastilles sur une
                            ligne de trois mots. On choisit d'abord la cible. */}
                        <span className="mini-label">{T('Colorer')}</span>
                        <div className="sizes">
                          <button
                            className={motChoisi && motChoisi.ligne === i ? '' : 'on'}
                            onClick={() => setMotChoisi(null)}
                          >{T('Toute la ligne')}</button>
                          {motsDeLigne(line.text).map((mot, j) => (
                            <button
                              key={`${j}-${mot}`}
                              className={motChoisi && motChoisi.ligne === i && motChoisi.mot === j ? 'on' : ''}
                              onClick={() => setMotChoisi({ ligne: i, mot: j })}
                            >{mot}</button>
                          ))}
                        </div>
                      </>
                    )}
                    {logo && <span className="mini-label">{T('Couleur du texte')}</span>}
                    <div className="swatches">
                      {colors.map((c) => (
                        <button
                          key={c.hex}
                          className={`sw${(motChoisi && motChoisi.ligne === i
                            ? (line.wordColors?.[motChoisi.mot]?.colorHex || line.colorHex)
                            : line.colorHex) === c.hex ? ' on' : ''}`}
                          style={{ background: c.hex, boxShadow: `0 0 10px ${c.hex}` }}
                          title={c.label}
                          onClick={() => {
                            /* LE SKU PART AVEC LA COULEUR (E28). Deux bobines
                               du même rose ne se distinguent pas au hex : sans
                               le SKU, le catalogue rend la première trouvée, et
                               le diamètre choisi n'arrive jamais. `undefined`
                               quand la palette n'en déclare pas : la recherche
                               par couleur reprend alors la main. */
                            const cible = motChoisi && motChoisi.ligne === i ? motChoisi.mot : null;
                            if (null === cible) {
                              /* « Toute la ligne » efface les couleurs par mot :
                                 sans cela, le client repeindrait la ligne et
                                 verrait un mot lui résister sans savoir pourquoi. */
                              patchLine(i, { colorHex: c.hex, tubeSku: c.sku, wordColors: undefined });
                            } else {
                              const mots = motsDeLigne(line.text);
                              const wc = mots.map((_, j) => ({ ...(line.wordColors?.[j] ?? {}) }));
                              wc[cible] = { colorHex: c.hex, tubeSku: c.sku };
                              patchLine(i, { wordColors: wc });
                            }
                            edited();
                          }}
                        />
                      ))}
                    </div>
                    </>
                  )}
                </div>
                );
              })}
              <div className="pied-actions">
                {lines.length < maxLines && (
                  <button
                    className="addline"
                    onClick={() => { setLines((ls) => [...ls, { text: '', fontId: ls[0]!.fontId, colorHex: ls[0]!.colorHex }]); edited(); }}
                  >
                    {T('+ Ajouter une ligne')}
                  </button>
                )}
                {!logo && feature('logo') && (
                  <label className="upload">
                    ⤒ {T('Ou téléversez votre logo')}
                    <input
                      type="file"
                      accept=".svg,image/svg+xml,image/png,image/jpeg,application/pdf"
                      hidden
                      onChange={onLogoFile}
                      data-testid="logo-input"
                    />
                  </label>
                )}
              </div>
              {logoError && <div className="issue">{T(logoError)}</div>}
              {!needsQuote && editCtx?.quotePageUrl && (
                <a className="quote-link" href={editCtx.quotePageUrl} data-testid="quote-link">
                  {T('Un projet sur mesure, une grande enseigne ? Demandez un devis.')}
                </a>
              )}
              {needsQuote && (
                <div className="quote-note" data-testid="quote-note">
                  <strong>{T('Ce fichier ne peut pas être chiffré automatiquement.')}</strong>
                  <span>
                    {'« '}{needsQuote}{T(' » est une image, pas un tracé : sa longueur de tube ne se mesure pas.')}
                  </span>
                  {quoteDone ? (
                    <span className="quote-ok" data-testid="quote-done">{quoteDone}</span>
                  ) : editCtx?.quoteAction ? (
                    <>
                      <span>{T('Laissez-nous vos coordonnées : nous revenons vers vous avec un prix ferme.')}</span>
                      <input
                        className="quote-field"
                        type="text"
                        placeholder={T('Votre nom')}
                        value={quoteName}
                        onChange={(e) => setQuoteName(e.target.value)}
                      />
                      <input
                        className="quote-field"
                        type="email"
                        placeholder={T('Votre e-mail')}
                        value={quoteEmail}
                        onChange={(e) => setQuoteEmail(e.target.value)}
                        data-testid="quote-email"
                      />
                      <textarea
                        className="quote-field"
                        rows={3}
                        placeholder={T('Où sera-t-il posé ? Quelles dimensions ? Quelle couleur ?')}
                        value={quoteBrief}
                        onChange={(e) => setQuoteBrief(e.target.value)}
                      />
                      <button
                        className="quote-cta"
                        onClick={sendQuote}
                        disabled={quoteSending || !quoteEmail.includes('@')}
                        data-testid="quote-send"
                      >
                        {quoteSending ? T('Envoi…') : T('Demander un devis')}
                      </button>
                      {quoteError && <span className="quote-err">{T(quoteError)}</span>}
                    </>
                  ) : (
                    <span className="quote-hint">
                      {T('Astuce : exportez votre logo en SVG avec les contours vectorisés, et le prix s’affichera tout seul.')}
                    </span>
                  )}
                </div>
              )}
              {feature('rgb') && !enTicket && (
                <OptionRow
                  label={T('RGB color-changing')}
                  hint={T('7 couleurs animées, contrôleur inclus')}
                  checked={rgb}
                  onToggle={() => { setRgb((v) => !v); edited(); }}
                />
              )}
            </section>

            {/* ------------------------------------------------------------
                COULEUR : carte propre à la disposition « ticket ».
                La maquette du Comptoir donne à la couleur sa carte, entre le
                message et le format. Dans le modèle du produit, la couleur
                appartient à CHAQUE LIGNE (un néon peut être bicolore) : cette
                carte pilote donc toutes les lignes d'un geste — le cas de la
                maquette — et laisse les pastilles par ligne reprendre la main
                dès qu'une seconde ligne existe. Rien n'est perdu, et à une
                ligne c'est exactement la maquette. */}
            {enTicket && ('neon' === family || ('panel' === family && 'letters' === panelFinish)) && (
              <section className={sectCls('couleur')} data-testid="carte-couleur">
                <h2>{T('Couleur')}</h2>
                {!rgb && (
                  <div className="swatches swatches--carte">
                    {colors.map((c) => {
                      const on = logo ? logoColor === c.hex : lines.every((l) => l.colorHex === c.hex);
                      return (
                        <button
                          key={c.hex}
                          className={`sw${on ? ' on' : ''}`}
                          style={{ background: c.hex, boxShadow: `0 0 10px ${c.hex}` }}
                          title={c.label}
                          onClick={() => {
                            if (logo) setLogoColor(c.hex);
                            else setLines((ls) => ls.map((l) => ({ ...l, colorHex: c.hex, tubeSku: c.sku })));
                            edited();
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                {rgb && <p className="hint">{T('7 couleurs animées, contrôleur inclus')}</p>}
                {feature('rgb') && !logo && (
                  <OptionRow
                    label={T('RGB color-changing')}
                    hint={T('7 couleurs animées, contrôleur inclus')}
                    checked={rgb}
                    onToggle={() => { setRgb((v) => !v); edited(); }}
                    price={prixExtra('+' + Math.round(coeffEffectifs.rgbFlatCents / 100) + ' €')}
                  />
                )}
              </section>
            )}

            {/* Taille */}
            <section className={'neon' === family && (!logo || avecTexte) ? sectCls('size') : 'sect sect--na'}>
              {/*
                * CE CURSEUR NE PARLE PLUS DE DEUX CHOSES À LA FOIS.
                *
                * Il portait la hauteur du LOGO dès qu'un logo était chargé, et
                * celle des LETTRES sinon. Tant qu'un logo remplaçait le texte,
                * cela tenait. Maintenant qu'ils se composent, il y a deux
                * hauteurs, et celle du logo a rejoint le logo — juste au-dessus,
                * dans sa propre boîte. Celui-ci ne dit plus que les lettres, et
                * il disparaît quand il n'y en a pas.
                */}
              <h2>{T(enTicket ? 'Format' : 'Taille (hauteur de lettre)')}</h2>
              <div className="sizes">
                {sizePresets.map((s) => (
                  <button
                    key={s.id}
                    className={letterHeightCm === s.letterHeightCm ? 'on' : ''}
                    onClick={() => { setLetterHeightCm(s.letterHeightCm); edited(); }}
                  >
                    {s.label}
                    <br />
                    {/* La maquette écrit « 12 », pas « 12 cm » : dans une
                        carte de caisse, l'unité est dite par le curseur. */}
                    <small>{s.letterHeightCm}{enTicket ? '' : ' cm'}</small>
                  </button>
                ))}
              </div>
              <div className="slider-row">
                <span>{sizeBounds.minCm}</span>
                <input
                  type="range"
                  min={sizeBounds.minCm}
                  max={sizeBounds.maxCm}
                  value={letterHeightCm}
                  aria-label={T('Taille (hauteur de lettre)')}
                  data-testid="taille-lettres"
                  onChange={(e) => { setLetterHeightCm(Number(e.target.value)); edited(); }}
                />
                <span>{sizeBounds.maxCm} cm</span>
              </div>
              {enTicket && 'neon' === family && (
                <>
                  {/* Le préfixe vit AU-DESSUS du sélecteur, pas dans ses
                      options : « Support : Découpe contour » tronquait en
                      « Support : Cont » dans une carte étroite, et le client
                      lisait un mot coupé sur un menu déroulant. */}
                  <span className="mini-label">{T('Support')}</span>
                  <select
                    className="support-select"
                    value={outdoor ? 'box' : supportType}
                    disabled={outdoor}
                    aria-label={T('Support')}
                    onChange={(e) => { setSupportType(e.target.value as SupportType); edited(); }}
                  >
                    {supportTypes.map((sp) => (
                      <option key={sp.id} value={sp.id}>{T(sp.label)}</option>
                    ))}
                  </select>
                  <span className="mini-label">{T('Finition')}</span>
                  <select
                    className="support-select"
                    value={finish}
                    aria-label={T('Finition')}
                    onChange={(e) => { setFinish(e.target.value as SupportFinish); edited(); }}
                  >
                    {supportFinishes.map((f) => (
                      <option key={f.id} value={f.id}>{T(f.label)}</option>
                    ))}
                  </select>
                </>
              )}
              {/* LE GABARIT PAPIER, DANS L'ÉTAPE OÙ LA QUESTION SE POSE.
                  `parcours-configurateur-ux` §2 : c'est le seul remède PHYSIQUE
                  au problème qui coûte des retours. Le mettre ailleurs — dans
                  un pied de page, dans les options — reviendrait à le réserver
                  à ceux qui le cherchent, c'est-à-dire à ceux qui doutent déjà. */}
              <button className="gabarit-lien" onClick={imprimerGabarit} disabled={gabaritEnCours} data-testid="imprimer-gabarit">
                {gabaritEnCours ? T('Préparation du gabarit…') : T('Imprimer le gabarit papier')}
                <small>{T('à scotcher au mur pour voir la taille réelle')}</small>
              </button>
              {/* LE LIEN DE PARTAGE, au même endroit et pour la même raison :
                  emporter son projet hors du configurateur. L'un sur du papier,
                  l'autre dans une messagerie. */}
              {/* « VOIR CHEZ MOI » - au MÊME endroit que le gabarit papier,
                  parce que c'est la même question : quelle taille ça fait
                  chez moi ? L'un sur du papier, l'autre à travers la caméra.
                  Le bouton N'EXISTE PAS si `etatRa` refuse - design bloqué,
                  poste fixe, ou boutique sans hébergement (voir `ar.ts`). */}
              {ra.disponible && (
                <button
                  className="gabarit-lien"
                  onClick={voirChezMoi}
                  disabled={raEnCours}
                  data-testid="voir-chez-moi"
                >
                  {T(raEnCours ? 'Préparation…' : 'Voir chez moi')}
                  <small>
                    {T(raErreur
                      // §8.2 : le visiteur n'a aucun moyen de vérifier que le
                      // flux caméra ne sort pas de son appareil. On l'écrit.
                      ?? 'à poser sur votre mur ; la caméra ne quitte pas votre téléphone')}
                  </small>
                </button>
              )}
              {/* LE MOCKUP SUR PHOTO (B30) — n'apparaît qu'une fois la photo
                  mise à l'échelle. Un bouton d'export visible avant serait un
                  bouton qui ne peut que refuser : le fichier n'a de sens que
                  s'il porte la bonne taille, et la bonne taille demande le
                  repère. Il vit ici, avec le gabarit et la RA, parce que les
                  trois répondent à la même question. */}
              {photo && photoEchelle && (
                <button className="gabarit-lien" onClick={exporterMockup} data-testid="exporter-mockup">
                  {T('Enregistrer le montage sur ma photo')}
                  <small>
                    {T(mockupErreur
                      ?? 'une image à l’échelle, avec ses cotes écrites dessus, à envoyer au client')}
                  </small>
                </button>
              )}
              <button className="gabarit-lien" onClick={copierLeLien} data-testid="copier-lien">
                {T(null === lienCopie ? 'Copier le lien de ce néon' : (
                  'trop-long' === lienCopie ? 'Ce dessin est trop grand pour un lien'
                    : 'Lien copié'))}
                <small>
                  {T('sans-logo' === lienCopie
                    ? 'attention : le logo téléversé n’est pas dans le lien'
                    : 'pour le retrouver plus tard ou l’envoyer à quelqu’un')}
                </small>
              </button>
              <button className="gabarit-lien" onClick={montrerLeQr} data-testid="qr-lien">
                {T(qrSvg ? 'Masquer le QR' : 'Afficher un QR')}
                <small>{T('à scanner avec un téléphone pour continuer dessus')}</small>
              </button>
              {qrSvg && (
                /* Le SVG vient de `qrcode`, pas d'une saisie : il n'y a pas de
                   texte du client dedans, seulement des rectangles noirs. */
                <div className="qr-boite" data-testid="qr-image" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              )}
            </section>

            {/* Support — sa carte propre, sauf en disposition « ticket » où il
                vit dans Format, en sélecteurs, comme sur la maquette. */}
            {!enTicket && (
            <section className={'neon' === family ? sectCls('support') : 'sect sect--na'}>
              <h2>{T('Support')}</h2>
              <div className="cards">
                {supportTypes.map((s) => (
                  <button
                    key={s.id}
                    className={(outdoor ? 'box' : supportType) === s.id ? 'on' : ''}
                    disabled={outdoor && s.id !== 'box'}
                    onClick={() => { setSupportType(s.id); edited(); }}
                  >
                    {T(s.label)}
                  </button>
                ))}
              </div>
              <h2>{T('Finition')}</h2>
              <div className="finishes">
                {supportFinishes.map((f) => (
                  <button
                    key={f.id}
                    className={`finish${finish === f.id ? ' on' : ''}`}
                    style={{ background: f.swatch }}
                    title={T(f.label)}
                    onClick={() => { setFinish(f.id); edited(); }}
                  >
                    {T(f.label)}
                  </button>
                ))}
              </div>
            </section>
            )}

            {/* Options */}
            <section className={sectCls('options')}>
              <h2>{T(enTicket ? 'Extras' : 'Options')}</h2>
              {feature('outdoor') && (
                <OptionRow
                  label={T('Extérieur')}
                  hint={T('Caisson drainé IP65, tube et bloc IP67, anti-UV : obligatoire dehors')}
                  checked={outdoor}
                  onToggle={() => { setOutdoor((v) => !v); edited(); }}
                  price={prixExtra('+' + Math.round((coeffEffectifs.outdoorMultiplier - 1) * 100) + ' %')}
                />
              )}
              {/* UNE ENSEIGNE EXTÉRIEURE N'EST PAS QU'UN OBJET : elle est
                  réglementée. Le client professionnel doit le savoir AVANT de
                  payer, pas en recevant un courrier de la mairie. Aucun
                  concurrent grand public ne le dit — c'est de la réassurance,
                  pas un repoussoir. */}
              {outdoor && feature('outdoor') && (
                <p className="mention-legale" data-testid="mention-enseigne">
                  {T('Enseigne extérieure : une autorisation de votre mairie peut être nécessaire, et une extinction nocturne (1 h · 6 h) peut être obligatoire. Certaines communes taxent la surface du dispositif. Renseignez-vous avant la pose.')}
                </p>
              )}
              {/* LE PROGRAMMATEUR : LA RÉPONSE À LA MENTION CI-DESSUS.
                  Dire au client qu'une extinction nocturne « peut être
                  obligatoire » et ne rien lui vendre pour s'y conformer, c'est
                  l'inquiéter sans l'aider. L'option est donc ICI, juste sous
                  l'avertissement, et pas au milieu des accessoires de confort.
                  Elle ne s'affiche qu'en extérieur : un néon de salon n'est pas
                  une enseigne, et R581-59 ne le vise pas. */}
              {outdoor && feature('timer') && (
                <>
                  <OptionRow
                    label={T('Programmateur d’extinction')}
                    hint={T('coupe l’enseigne aux heures imposées ; se règle en atelier')}
                    checked={nightTimer}
                    onToggle={() => { setNightTimer((v) => !v); edited(); }}
                    price={prixExtra('+' + Math.round(coeffEffectifs.nightTimerCents / 100) + ' €')}
                  />
                  {nightTimer && (
                    <div className="horaires" data-testid="horaires-extinction">
                      {/* DEUX HEURES, PARCE QUE LA LOI LES DEMANDE. Le second
                          alinéa de R581-59 décale la plage pour qui cesse ou
                          commence son activité entre minuit et 7 h. Sans ces
                          deux champs, on livrerait une minuterie réglée au
                          hasard, et un bar qui ferme à 2 h verrait son
                          enseigne s'éteindre en plein service. */}
                      <label>
                        {T('Fermeture')}
                        <input
                          type="time"
                          value={enHhMm(fermetureH)}
                          onChange={(e) => { setFermetureH(depuisHhMm(e.target.value, fermetureH)); edited(); }}
                          data-testid="heure-fermeture"
                        />
                      </label>
                      <label>
                        {T('Ouverture')}
                        <input
                          type="time"
                          value={enHhMm(ouvertureH)}
                          onChange={(e) => { setOuvertureH(depuisHhMm(e.target.value, ouvertureH)); edited(); }}
                          data-testid="heure-ouverture"
                        />
                      </label>
                      <p className="horaires-verdict" data-testid="plage-extinction">{plageDite}</p>
                    </div>
                  )}
                </>
              )}
              {!rgb && feature('dimmer') && (
                <OptionRow
                  label={T('Télécommande + variateur')}
                  hint={T('Intensité et modes')}
                  checked={dimmer}
                  onToggle={() => { setDimmer((v) => !v); edited(); }}
                  price={prixExtra('+' + Math.round(coeffEffectifs.dimmerRemoteCents / 100) + ' €')}
                />
              )}
              {feature('express') && (
                <OptionRow
                  label={T('Production express')}
                  /* LE « +25 % » ÉTAIT ÉCRIT EN DUR ICI, à côté d'une pastille
                     qui, elle, calcule `expressMultiplier`. Un marchand qui
                     passe à 1,30 lisait « +25 % » et « +30 % » DANS LA MÊME
                     LIGNE. Le pourcentage reste à la pastille, dont c'est le
                     rôle ; le libellé ne garde que le délai, et il le prend au
                     coefficient lui aussi. */
                  hint={(() => {
                    const d = delaiAnnonce(coeffEffectifs, true);
                    return d ? `${d.min} ${T('à')} ${d.max} ${T('jours ouvrés')}` : '';
                  })()}
                  checked={express}
                  onToggle={() => { setExpress((v) => !v); edited(); }}
                  price={prixExtra('+' + Math.round((coeffEffectifs.expressMultiplier - 1) * 100) + ' %')}
                />
              )}
            </section>

            {/* LE JOINT SE DIT AVANT, PAS À LA LIVRAISON. Il vit avec les
                autres avertissements et non dans le détail du prix : c'est une
                information de PRODUIT, pas de facture. */}
            {scission.panneaux > 1 && (
              <p className="mention-legale" data-testid="scission">
                {T(messageScission(scission) ?? '')}
              </p>
            )}
            {blockingIssues.length > 0 && (
              <div className="issues">
                {blockingIssues.map((i) => (
                  <div key={i.code + i.message} className="issue">{i.message}</div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation du parcours guidé. « Continuer » disparaît à la
              dernière étape : l'action finale est le bouton d'achat de la
              barre de prix, toujours visible - le moteur ne change pas. */}
          {stepsOn && (
            <div className="etapes-nav" data-testid="etapes-nav">
              <button
                className="etapes-retour"
                style={0 === stepIndex ? { visibility: 'hidden' } : undefined}
                onClick={() => goStep(stepIndex - 1)}
              >
                {T('Retour')}
              </button>
              {stepIndex < ONGLETS.length - 1 && (
                <button className="etapes-suite" onClick={() => goStep(stepIndex + 1)}>
                  {T('Continuer')}
                </button>
              )}
            </div>
          )}

          {/* ---------- Barre de prix / actions (2 états) ---------- */}
          <div className="pricebar" data-testid="pricebar">
            {justAdded ? (
              <>
                <p className="added-head">
                  <span className="ok">✓</span> {T('Ajouté au panier')} · <b>{euros(price.displayTotalCents)}</b>
                </p>
                <div className="added-btns">
                  <button className="btn-ghost" onClick={() => { setLogo(null); setLines([{ text: '', fontId: 'pacifico', colorHex: '#ff2d95' }]); setJustAdded(false); }}>
                    ✚ {L('another', T('Faire un autre'))}
                  </button>
                  <button className="cta" onClick={goCheckout}>
                    {L('checkout', T('Passer à la caisse'))}
                  </button>
                </div>
              </>
            ) : quoteMode ? (
              /* MODE DEVIS — le design est déjà composé au-dessus ; il ne reste
                 qu'à savoir à qui répondre. Aucun prix n'est annoncé : c'est
                 précisément ce que le marchand va chiffrer. */
              <div className="quote-panel" data-testid="quote-panel">
                {quoteDone ? (
                  <div className="quote-sent" data-testid="quote-done">
                    <strong>{T('Merci, c’est envoyé.')}</strong>
                    <span>{quoteDone}</span>
                    <span>{T('Votre dessin est joint à la demande : nous savons exactement ce que vous voulez.')}</span>
                  </div>
                ) : (
                  <>
                    <div className="quote-panel__head">
                      <strong>{T('Recevoir mon prix')}</strong>
                      <span>{T('Votre dessin part avec la demande, tel que vous le voyez.')}</span>
                    </div>
                    <input
                      className="quote-field"
                      type="text"
                      placeholder={T('Votre nom')}
                      value={quoteName}
                      onChange={(e) => setQuoteName(e.target.value)}
                    />
                    <input
                      className="quote-field"
                      type="email"
                      placeholder={T('Votre e-mail')}
                      value={quoteEmail}
                      onChange={(e) => setQuoteEmail(e.target.value)}
                      data-testid="quote-email"
                    />
                    <textarea
                      className="quote-field"
                      rows={3}
                      placeholder={T('Où sera-t-il posé ? Intérieur ou extérieur ? Une contrainte particulière ?')}
                      value={quoteBrief}
                      onChange={(e) => setQuoteBrief(e.target.value)}
                    />
                    <button
                      className="cta"
                      onClick={sendQuote}
                      disabled={quoteSending || !quoteEmail.includes('@')}
                      data-testid="quote-send"
                    >
                      {quoteSending ? T('Envoi…') : T('Demander mon devis')}
                    </button>
                    {quoteError && <div className="issue">{T(quoteError)}</div>}
                    <span className="quote-hint">
                      {T('Gratuit et sans engagement. Réponse sous 48 h ouvrées.')}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <>
                {/*
                  LE TICKET DE CAISSE — thème « Comptoir ».

                  Sa maquette (prototypes/comptoir.html) ne montre pas les choix
                  dans les réglages : elle les IMPRIME, ligne à ligne, sur un
                  ticket qui porte aussi le total et le bouton. C'est le cœur du
                  thème, et aucune feuille de style ne pouvait le fabriquer — le
                  composant n'émettait qu'un total et un bouton. D'où l'écart
                  que le marchand a relevé : j'habillais un panneau au lieu de
                  produire un récapitulatif.

                  Il ne s'affiche que pour la disposition « ticket » : partout
                  ailleurs le panneau montre déjà les valeurs à côté de leurs
                  intitulés, et une seconde liste ferait doublon.
                */}
                {'ticket' === disposition && (
                  <div className="ticket">
                    <div className="t-tete">
                      <b>{hostContext()?.siteName || 'NEON'}</b>
                      <div>{T('Enseignes lumineuses sur mesure')}</div>
                      {/* La date : un reçu en porte une, et c'est elle qui fait
                          croire au papier. Le prototype l'imprime sous
                          l'enseigne du magasin. */}
                      {/* `locale` peut être une chaîne VIDE quand l'hôte ne
                          l'annonce pas : passée telle quelle, elle fait lever
                          « Invalid language tag » et emporte tout le rendu.
                          On repasse alors la main au navigateur. */}
                      <div>{new Date().toLocaleString(locale || undefined, { dateStyle: 'long', timeStyle: 'short' })}</div>
                    </div>
                    <hr className="t-sep" />
                    {ticketLines.map((l) => (
                      <div className="t-ligne" key={l.lib}>
                        <span className="lib">{l.lib}</span>
                        <span className="points" />
                        <span className="val">{l.val}</span>
                      </div>
                    ))}
                    <hr className="t-sep" />
                  </div>
                )}
                <div className="row">
                  <div className="total">
                    {/* Sur un ticket de caisse, le total s'annonce. Le mot
                        n'apparaît que dans cette disposition : ailleurs, le
                        prix est seul et c'est très bien. */}
                    {'ticket' === disposition && <span className="t-total-lib">{T('TOTAL')}</span>}
                    <div className="p" data-testid="total">{euros(price.displayTotalCents)}</div>
                    <div className="s">
                      {cartClosed ? (editCtx?.cartClosedReason || T('Commande momentanément indisponible')) : T('Prix calculé en direct')}
                    </div>
                  </div>
                  <button
                    className="cta"
                    onClick={addToCart}
                    disabled={blockingIssues.length > 0 || submitting || cartClosed}
                  >
                    {submitting
                      ? T('Ajout…')
                      : cartClosed
                        ? T('Commande indisponible')
                        : isEditing
                          ? T('Enregistrer les modifications')
                          : L('addToCart', T('Ajouter au panier'))}
                  </button>
                </div>
                {cartError && <div className="issue">{T(cartError)}</div>}
                {/* LE PIED DU TICKET vient APRÈS le total et le bouton, comme
                    sur le prototype : on remercie une fois la note réglée, pas
                    avant. Séparé du haut du ticket pour cette seule raison -
                    la barre de prix s'intercale entre les deux. */}
                {'ticket' === disposition && (
                  <div className="ticket-pied">
                    <hr className="t-sep" />
                    {/* LE VISA DE L'ATELIER : le tampon « bon pour fabrication »
                        de la maquette. Il n'existe que pour cette peau — sur un
                        ticket de caisse il n'aurait aucun sens. Et c'est du TEXTE,
                        pas un décor en feuille de style : un tampon écrit en CSS ne
                        se traduit pas, et le client d'une boutique anglophone
                        lirait du français. */}
                    {'atelier-fabrication' === theme.id && (
                      <div className="tk-visa">{T('Bon pour fabrication')}</div>
                    )}
                    <div className="t-merci">{T('Fait main dans notre atelier, merci !')}<br />{T('conservez ce ticket')}</div>
                    <div className="code-barres" aria-hidden="true" />
                    {/* LE NUMÉRO DU TICKET, sous le code-barres. Il n'est pas
                        décoratif : c'est l'empreinte de la configuration —
                        celle-là même qui identifie le design côté serveur. Un
                        client qui appelle peut la lire au téléphone. */}
                    <div className="t-num">N° {numeroTicket}</div>
                  </div>
                )}
                <button className="detail-toggle" onClick={() => setShowBreakdown((v) => !v)}>
                  {T(showBreakdown ? 'Masquer le détail' : 'Voir le détail du prix')}
                </button>
                {showBreakdown && (
                  <div className="breakdown" data-testid="breakdown">
                    {price.lines.map((l, i) => (
                      <div key={l.key + i}>
                        <span>{priceLineLabel(l)}</span>
                        <b>{euros(l.amountCents)}</b>
                      </div>
                    ))}
                    {/* CE QU'IL Y A DANS LE COLIS.
                        `parcours-configurateur-ux` §3 traite la plainte « surcoûts
                        découverts tard ». Son revers n'est traité nulle part : le
                        client ne sait pas ce qu'il n'a PAS à racheter, et il
                        compare alors un prix complet à un prix nu.
                        La liste est CALCULÉE — une ligne n'apparaît que si elle
                        part vraiment. La télécommande, par exemple, est une option
                        payante ici, et l'écrire en dur l'aurait promise à tort. */}
                    {/* LE DÉLAI STANDARD — `parcours-configurateur-ux` §5 le veut
                        DANS le configurateur, pas en CGV. Il manquait : seul
                        l'express annonçait le sien, si bien que le client qui ne
                        le prenait pas ne savait pas quand il serait livré. */}
                    {(() => {
                      const d = delaiAnnonce(coeffEffectifs, express);
                      return d ? (
                        <div className="delai" data-testid="delai">
                          <span>{T('Fabrication')}</span>
                          <b>{d.min} {T('à')} {d.max} {T('jours ouvrés')}</b>
                        </div>
                      ) : null;
                    })()}
                    {/* LA GARANTIE, AVEC LE DÉLAI ET PAS EN CGV.
                        `parcours-configurateur-ux` §5 range les deux ensemble,
                        et `conformite-ce-enseigne` §6.1 explique pourquoi le
                        chiffre affiché n'est pas celui du réglage marchand :
                        une garantie commerciale plus courte que les deux ans
                        légaux est entièrement absorbée par eux. L'écrire
                        ferait retenir au client le plus petit des deux
                        chiffres — celui qui ne veut rien dire pour lui. */}
                    {(() => {
                      const g = garantieAnnoncee(outdoor
                        ? coeffEffectifs.warrantyOutdoorMonths
                        : coeffEffectifs.warrantyIndoorMonths);
                      return (
                        <div className="delai" data-testid="garantie">
                          <span>{T('Garantie')}</span>
                          <b>
                            {T('2 ans')}
                            {null === g.commercialeMois ? '' : ` + ${g.commercialeMois} ${T('mois')}`}
                          </b>
                        </div>
                      );
                    })()}
                    <div className="colis" data-testid="colis">
                      <h3>{T('Livré avec')}</h3>
                      <ul>
                        {contenuLivre(config, coeffEffectifs).map((l) => (
                          <li key={l.libelle}>
                            {T(l.libelle)}
                            {l.detail ? <span> · {l.detail}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
