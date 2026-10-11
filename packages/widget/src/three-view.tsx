/**
 * Vue 3D RÉELLE — le néon tel qu'il sera fabriqué, à l'échelle (1 unité = 1 m).
 *
 * Rien n'est « dessiné sur un plan » : les tubes sont de VRAIS tubes extrudés
 * (TubeGeometry Ø 10 mm) pliés le long de la ligne médiane des lettres
 * (neon-geometry.ts), montés sur une plaque acrylique d'épaisseur réelle
 * (5 mm) ou dans un caisson (parois + face diffusante), avec entretoises,
 * câble de sortie, matériaux physiques (transmission, miroir, métal),
 * environnement réfléchi (PMREM) et halo par bloom.
 *
 * Les COTES sont affichées comme sur un plan de fabrication (largeur, hauteur,
 * profondeur, Ø du tube, épaisseur de plaque).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Palier, SupportFinish, SupportType } from '@neon/core';
import { JugeDeQualite, homogeneiteCaisson, profilFace, haloSurMur, fractionRenvoyee, haloVisible, reglagesDe, formatsCaisson, sectionProfil, constructionLettre, classerContours } from '@neon/core';
import type { Contour2 } from '@neon/core';
import type { NeonGeometry, Polyline } from './neon-geometry';
import { MOUNT_HEIGHT_M, buildDecor } from './scene-decor';

/** Spécifications physiques réelles (cm) — affichées dans la vue. */
// Les cotes vivent dans `spec.ts`, qui ne dépend de rien : l'aperçu 2D en a
// besoin, et il n'a aucune raison de télécharger three.js pour cela.
export { SPEC } from './spec';
import { SPEC } from './spec';

/**
 * LA SCÈNE EST EN MÈTRES. Tout le reste du dépôt est en centimètres, et la
 * fabrication en millimètres.
 *
 * Ces deux fonctions ne font rien qu'une division ne ferait — elles NOMMENT
 * la division. Dix `/ 100` et deux `/ 1000` couraient dans ce fichier, et rien
 * ne distinguait un « diviser pour convertir » d'un « diviser pour prendre la
 * moitié » : c'est l'écart E11, et c'est le genre de confusion qui produit un
 * objet cent fois trop grand sans qu'aucun test ne s'en aperçoive.
 */
const enM = (cm: number): number => cm / 100;
/** Le retour : la scène est en mètres, le catalogue et le client en centimètres. */
const enCm = (m: number): number => m * 100;
const mmEnM = (mm: number): number => mm / 1000;

/**
 * Plaque ou caisson à représenter — panneaux et caissons uniquement.
 *
 * Quand elle est fournie, on ne plie aucun tube : on pose un volume aux
 * dimensions réelles. Le reste de la scène ne change pas.
 */
export interface PlateSpec {
  kind: 'panel' | 'box';
  /** Épaisseur d'un panneau, ou profondeur d'un caisson (cm). */
  depthCm: number;
  /** Couleur de la matière (CSS). */
  materialCss: string;
  /** Caisson : nombre de faces lumineuses. */
  faces?: 1 | 2;
  /** La face porte-t-elle un visuel imprimé ? */
  printed?: boolean;
  channelLetters?: {
    material: 'acrylic' | 'wood' | 'metal';
    depthMm: number;
    faceColor: string;
    sideColor: string;
    lighting: 'none' | 'front' | 'back' | 'front-back';
    glowColor: string;
    backboardLayers: Array<{ material: 'acrylic' | 'wood' | 'metal'; color: string; thicknessMm: number; extensionCm: number }>;
  };
}

export interface ThreeViewProps {
  geometry: NeonGeometry;
  plate?: PlateSpec;
  supportType: SupportType;
  finish: SupportFinish;
  /** Couleur du tube allumé. */
  glowHex: string;
  /**
   * Couleur de CHAQUE trajet de tube, dans l'ordre de `geometry.strokes`.
   *
   * Depuis qu'un mot porte sa propre bobine, une pièce n'a plus une couleur
   * mais une par mot ; le 2D le montrait déjà, la 3D non. Une case vide, ou la
   * prop absente, retombe sur `glowHex` — une pièce d'une seule couleur n'a
   * rien à passer, et les appelants d'avant continuent de marcher.
   */
  couleursTraits?: Array<string | undefined>;
  /** Profondeur du caisson (cm). */
  boxDepthCm: number;
  /** Cotes réelles issues de @neon/core (celles qui sont facturées). */
  widthCm: number;
  heightCm: number;
  /** Longueur issue du manifeste, utilisée par le prix et la fiche atelier. */
  billedTubeLengthM?: number;
  locale?: string;
  /** Néon allumé (défaut) ou éteint — vue « de jour », tube hors tension. */
  lit?: boolean;
  /**
   * Décalage horizontal, en pixels, du centre RÉELLEMENT VISIBLE.
   *
   * Dans les thèmes immersifs (Atelier Nuit, Story), le panneau de réglages
   * flotte AU-DESSUS de la scène : la toile fait toute la largeur, mais un
   * tiers en est masqué. Sans ce décalage, l'objet est centré sur la toile —
   * donc à moitié caché derrière le panneau, exactement comme l'était le
   * dessin 2D.
   *
   * Négatif quand le panneau est à droite. Le parent le mesure ; la 3D ne
   * cherche pas à le deviner.
   */
  centerOffsetPx?: number;
  /**
   * LE DÉCOR CHOISI PAR LE CLIENT, celui de la barre des fonds.
   *
   * Sans lui, la 3D posait le néon devant un mur de plâtre gris quel que soit
   * le fond retenu en 2D : le client choisissait sa brique, basculait, et sa
   * brique disparaissait — pendant que la barre des fonds restait affichée
   * sans plus rien commander.
   *
   * `id` est celui du catalogue (`dark`, `brick`, `room`, `salon`) ou celui
   * d'une scène de boutique ; `image` est la photo que la boutique fournit,
   * qui devient le mur. Un identifiant inconnu retombe sur le studio sombre.
   */
  decor?: {
    id: string;
    image?: string;
    /**
     * Visuel du client pour une plaque en impression UV (E18, reste).
     *
     * Le produit ne peut pas l'inventer : l'impression est le visuel du CLIENT
     * sur la plaque du MARCHAND. Absent, un dégradé procédural tient lieu de
     * bouche-trou, et le code écrit qu'il en est un.
     */
    imageImprimee?: string;
  };
  /**
   * ÉCLAT DU HALO, relatif à une configuration de référence écrite.
   *
   * Vaut 1 sur la configuration de référence de `@neon/core` — 3 m de tube
   * blanc neutre sur un signe de 60 × 24 cm. Le parent le calcule avec
   * `eclairementDeScene`, parce que le flux dépend du CATALOGUE (lm/m déclarés,
   * W/m de la bobine) et que la 3D ne connaît pas le catalogue.
   *
   * Absent, la 3D rend exactement ce qu'elle rendait avant : la constante seule.
   * C'est une bascule franche, comme le prix du tube par SKU.
   */
  eclat?: number;
  /**
   * DIAMÈTRE DU TUBE (cm) — écart E28.
   *
   * `SPEC.tubeDiameterCm` était lu ici en dur. Depuis que le catalogue déclare
   * un diamètre par référence, la 3D doit dessiner celui de la commande : elle
   * modelait un Ø 10 pendant que la facture comptait un Ø 8, et le HUD
   * l'ANNONÇAIT au client.
   *
   * Absent : la valeur livrée, ce qui est le cas de toutes les boutiques à un
   * seul tube.
   */
  tubeDiametreCm?: number;
  /** Traducteur fourni par le parent. */
  t: (s: string) => string;
}

/** px de la rastérisation → mètres, repère centré, Y vers le haut. */
function toMeters(geom: NeonGeometry) {
  const k = 1 / (geom.pxPerCm * 100);
  // Centre = centre de l'ENCRE (pas du masque, qui porte une marge technique).
  const ink = geom.ink ?? { x0: 0, y0: 0, w: geom.widthPx, h: geom.heightPx };
  const cx = ink.x0 + ink.w / 2;
  const cy = ink.y0 + ink.h / 2;
  return (p: [number, number]): [number, number] => [(p[0] - cx) * k, -(p[1] - cy) * k];
}

/**
 * Matériau de la plaque selon la finition (physique, réfléchit l'environnement).
 *
 * @param imageImprimee Visuel fourni par le marchand pour la finition
 *   `printed-uv`. Absent, un dégradé procédural tient lieu de bouche-trou — et
 *   il est écrit qu'il en est un.
 */
function boardMaterial(finish: SupportFinish, glow: THREE.Color, imageImprimee?: string): THREE.Material {
  switch (finish) {
    case 'black':
      return new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0 });
    case 'white':
      return new THREE.MeshPhysicalMaterial({ color: 0xf3f3f3, roughness: 0.55, clearcoat: 0.4, metalness: 0, emissive: glow, emissiveIntensity: 0.02 });
    case 'mirror':
      return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.035, metalness: 1 });
    case 'colored':
      return new THREE.MeshPhysicalMaterial({ color: 0xf05fb4, roughness: 0.28, clearcoat: 1, metalness: 0 });
    case 'printed-uv': {
      /*
       * L'IMAGE DU MARCHAND D'ABORD (E18, reste — chantier D).
       *
       * Ce dégradé était un bouche-trou assumé depuis le premier jour :
       * `materiaux-enseigne` §6 le note comme tel. Il montre « une plaque
       * imprimée » sans montrer CE QUI est imprimé — trois violets qui ne
       * ressemblent à aucun visuel réel.
       *
       * Il n'y a pas d'image à inventer ici : l'impression UV est le visuel du
       * CLIENT, sur la plaque du MARCHAND. Le produit ne peut que savoir la
       * recevoir. C'est la même règle que pour les bobines et les blocs, et
       * elle rejoint le parc de composants du chantier A.
       *
       * Absente, le dégradé reste — et il reste écrit qu'il est un bouche-trou.
       */
      if (imageImprimee) {
        const tex = new THREE.TextureLoader().load(imageImprimee);
        tex.colorSpace = THREE.SRGBColorSpace;
        // `clearcoat` plus haut que le dégradé : un vernis UV brille, et c'est
        // ce qui distingue une plaque imprimée d'un fond peint.
        const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.8 });
        // Marqué pour que le banc CONSTATE que le visuel du marchand est
        // employé, au lieu de compter des maillages qui ne changent pas.
        m.userData.imprimeReel = true;
        return m;
      }
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 256, 256);
      g.addColorStop(0, '#241b4d');
      g.addColorStop(0.5, '#7a2b6d');
      g.addColorStop(1, '#20304f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.42, clearcoat: 0.6 });
    }
    default: // clear — acrylique transparent réel
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.02,
        metalness: 0,
        transmission: 0.97,
        thickness: 0.005,
        ior: 1.49,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        // Volontairement DISCRET : une plaque de PMMA transparente ne se voit
        // qu'à ses arêtes et à ses reflets — sinon elle forme une silhouette
        // blanche autour des lettres (constaté en capture).
        envMapIntensity: 0.32,
        specularIntensity: 0.45,
        transparent: true,
        side: THREE.DoubleSide,
      });
  }
}

/** Forme THREE à partir d'un contour en px (pour l'extrusion de la plaque). */
function shapeFromContour(contour: Polyline, conv: (p: [number, number]) => [number, number]): THREE.Shape | null {
  if (contour.length < 3) return null;
  const shape = new THREE.Shape();
  const [x0, y0] = conv(contour[0]!);
  shape.moveTo(x0, y0);
  for (let i = 1; i < contour.length; i++) {
    const [x, y] = conv(contour[i]!);
    shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * LES CONTREFORMES SONT DES TROUS, PAS DES FORMES (E05, volet 3D).
 *
 * `traceContours` rend TOUS les bords d'un masque : la silhouette du « A », et
 * aussi le triangle de sa contreforme. Extrudés séparément, le triangle devient
 * un volume plein posé sur la lettre, et le « ABC » sort creusé avec le fond
 * visible à travers. Vu à la capture, jamais par un test — une géométrie fausse
 * compile parfaitement.
 *
 * LE CLASSEMENT EST DANS `@neon/core`, PAS ICI. C'est de l'arithmétique de
 * polygones : inclusion, aire, règle pair-impair. Écrite dans ce fichier, elle
 * aurait exigé un navigateur et une scène three.js pour être éprouvée — donc
 * elle ne l'aurait pas été. `classerContours` est testée en Node sur des carrés
 * emboîtés, et ce fichier ne fait plus que bâtir les `Shape`.
 */
function formesAvecTrous(
  contours: readonly Polyline[],
  conv: (p: [number, number]) => [number, number],
): THREE.Shape[] {
  const { formes, trous } = classerContours(contours as ReadonlyArray<Contour2>);
  const shapes = new Map<number, THREE.Shape>();
  for (const i of formes) {
    const sh = shapeFromContour(contours[i]!, conv);
    if (sh) shapes.set(i, sh);
  }
  for (const t of trous) {
    const parent = shapes.get(t.parent);
    if (!parent) continue;
    const trou = shapeFromContour(contours[t.indice]!, conv);
    if (trou) parent.holes.push(trou);
  }
  // L'ordre d'entrée est conservé : deux lettres voisines gardent leur rang, et
  // une capture comparée d'une version à l'autre ne bouge pas sans raison.
  return formes.map((i) => shapes.get(i)).filter((sh): sh is THREE.Shape => Boolean(sh));
}

/** Étiquette de cote : sprite texte net, toujours face caméra. */
function makeLabel(text: string, scale = 1): THREE.Sprite {
  const pad = 12;
  const fontPx = 44;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  c.width = Math.ceil(w + pad * 2);
  c.height = fontPx + pad * 2;
  const ctx2 = c.getContext('2d')!;
  ctx2.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx2.fillStyle = 'rgba(12,14,18,0.82)';
  ctx2.beginPath();
  const r = 14;
  ctx2.roundRect(0, 0, c.width, c.height, r);
  ctx2.fill();
  ctx2.fillStyle = '#eef2f7';
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = 'center';
  ctx2.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const hM = 0.05 * scale;
  sprite.scale.set((hM * c.width) / c.height, hM, 1);
  return sprite;
}

/** Ligne de cote (trait + embouts) entre deux points. */
function dimensionLine(a: THREE.Vector3, b: THREE.Vector3, color = 0x9fb3c8): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat));
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const perp = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.012);
  for (const p of [a, b]) {
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().copy(p).add(perp),
      new THREE.Vector3().copy(p).sub(perp),
    ]), mat));
  }
  return g;
}

export default function ThreeView(props: ThreeViewProps) {
  const { geometry, plate, supportType, finish, glowHex, couleursTraits, boxDepthCm, widthCm, heightCm, billedTubeLengthM = 0, t, lit = true, centerOffsetPx = 0, decor, eclat = 1, tubeDiametreCm = SPEC.tubeDiameterCm } = props;
  const decorId = decor?.id ?? 'dark';
  const decorImage = decor?.image;
  const mountRef = useRef<HTMLDivElement>(null);
  const [showDims, setShowDims] = useState(true);
  /** Part de lumière que le mur renvoie, quand elle est trop faible pour que
   *  l'auréole d'une lettre rétroéclairée se voie. `null` : rien à dire. */
  const [avisAureole, setAvisAureole] = useState<number | null>(null);
  /*
   * LE CADRAGE SURVIT À LA RECONSTRUCTION DE LA SCÈNE.
   *
   * La scène est rebâtie à chaque frappe au clavier. Si le choix « pièce »
   * vivait dans un état React, il serait respecté ; mais s'il vivait seulement
   * dans la caméra, chaque lettre tapée ramènerait le client à la vue objet
   * pendant qu'il regarde justement son néon dans la pièce. D'où la référence :
   * l'effet la lit au moment de bâtir, sans en dépendre.
   */
  const [vue, setVue] = useState<'objet' | 'piece'>('piece');
  const vueRef = useRef<'objet' | 'piece'>('piece');
  const cadrerRef = useRef<((v: 'objet' | 'piece') => void) | null>(null);
  /** Rendu de rattrapage, quand une image de décor arrive après coup. */
  const composerRef = useRef<(() => void) | null>(null);
  /*
   * Le décalage vit dans une référence, PAS dans les dépendances de la scène.
   *
   * Il change quand la fenêtre est redimensionnée ou quand le panneau change
   * de côté ; reconstruire toute la 3D — géométrie, tubes, éclairage, bloom —
   * pour déplacer un cadrage serait payer une seconde de calcul pour un
   * réglage qui coûte une matrice.
   */
  const offsetRef = useRef(centerOffsetPx);
  offsetRef.current = centerOffsetPx;
  const recadrerRef = useRef<(() => void) | null>(null);
  useEffect(() => { recadrerRef.current?.(); }, [centerOffsetPx]);
  // Groupe des cotes conservé hors du cycle de la scène : basculer l'affichage
  // ne doit PAS reconstruire toute la 3D.
  const dimsRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    if (dimsRef.current) dimsRef.current.visible = showDims;
  }, [showDims]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = () => el.clientWidth || 320;
    const H = () => el.clientHeight || 240;

    // preserveDrawingBuffer : permet de capturer la vue 3D (aperçu partageable,
    // contrôle qualité automatisé) après le rendu.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Posée plus bas, une fois le décor connu : chaque pièce a la sienne.
    renderer.toneMappingExposure = 0.82;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    /* Ce qui appartient à l'enseigne sans vivre dans ses groupes : le cordon
       d'alimentation, le halo peint sur le mur. `masquerLEnseigne` doit les
       emporter aussi — sans quoi une capture de la pièce vide garde une tache
       rose et un fil qui pend, ce qu'a montré la première image produite. */
    const accessoiresDuNeon: THREE.Object3D[] = [];

    // ----- le décor, en volume ----------------------------------------------
    const wallZ = -0.02;
    const decor = buildDecor(decorId, {
      wallZ,
      lit,
      image: decorImage,
      // Une photo de boutique arrive après coup : la boucle de rendu tourne
      // déjà, il n'y a donc rien à relancer — mais si elle a été suspendue
      // (onglet caché), un rendu de rattrapage évite un mur resté nu.
      onImageLoaded: () => composerRef.current?.(),
    });
    scene.add(decor.group);

    // Éteint = scène « de jour » : fond et lumières remontés pour qu'on voie
    // le tube silicone et le support, comme sur une photo produit hors tension.
    const bg = new THREE.Color(decor.backgroundHex);
    if (!lit) bg.lerp(new THREE.Color(0xffffff), 0.18);
    scene.background = bg;
    // L'exposition suit le décor : un mur crème en plein jour se photographie
    // fermé, un studio sombre ouvert. Le cœur du tube, en `toneMapped: false`,
    // n'en dépend pas — fermer l'exposition le fait donc RESSORTIR.
    renderer.toneMappingExposure = decor.exposure * (lit ? 1 : 1.25);

    /*
     * L'ENVIRONNEMENT RÉFLÉCHI EST LE LIEU QU'ON VOIT.
     *
     * Il venait de `RoomEnvironment` — le studio blanc de démonstration livré
     * avec three.js. C'est lui qui éclairait l'acrylique, et surtout c'est lui
     * que la finition MIROIR renvoyait : le client commandait un miroir et y
     * voyait le reflet d'un lieu qui n'existe nulle part, sans rapport avec
     * aucun des décors du catalogue.
     *
     * `fromScene` accepte n'importe quelle scène. Le décor fournit donc la
     * sienne — quelques plans de couleur plate aux teintes de la pièce, plus
     * ses sources. Zéro octet téléchargé, et le miroir dit enfin la vérité.
     */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(decor.envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.15;

    /*
     * LA CARTE HDR REMPLACE L'ENVIRONNEMENT PROCÉDURAL — SI ELLE ARRIVE (E21).
     *
     * L'ordre compte : le procédural est posé D'ABORD, et la carte le remplace
     * quand elle est là. Attendre 1,6 Mo avant de rendre le premier cadre
     * donnerait une scène sans reflets pendant une seconde, ce qui est pire que
     * de ne rien charger du tout.
     *
     * Un décor sans carte ne demande rien : `chargerHdri` rend `null` sans
     * toucher au réseau.
     */
    let envHdrRT: THREE.WebGLRenderTarget | null = null;
    let hdriAbandonnee = false;
    void decor.chargerHdri().then((tex) => {
      if (!tex || hdriAbandonnee) { tex?.dispose(); return; }
      envHdrRT = pmrem.fromEquirectangular(tex);
      tex.dispose();
      scene.environment = envHdrRT.texture;
      rendre();
    });

    // ----- dimensions réelles ------------------------------------------------
    const conv = toMeters(geometry);
    // Encombrement RÉEL du néon = dessin + le rayon du tube de chaque côté.
    const tubeMarginM = enM(tubeDiametreCm);
    const inkBox = geometry.ink ?? { x0: 0, y0: 0, w: geometry.widthPx, h: geometry.heightPx };
    // Une plaque tient ses dimensions de la SAISIE du client, pas d'un tracé.
    const signW = plate ? enM(widthCm) : enM(inkBox.w / geometry.pxPerCm) + tubeMarginM;
    const signH = plate ? enM(heightCm) : enM(inkBox.h / geometry.pxPerCm) + tubeMarginM;
    const boardT = enM(SPEC.boardThicknessCm);
    const tubeR = enM(tubeDiametreCm) / 2; // rayon : la moitié du DIAMÈTRE converti
    const isBox = supportType === 'box';
    // Un PANNEAU n'émet aucune lumière : ni halo sur le mur, ni bloom, ni
    // alimentation. Un CAISSON, lui, est bien lumineux.
    const emissif = plate ? 'box' === plate.kind : true;
    const boxD = enM(Math.max(boxDepthCm, 3));
    const color = new THREE.Color(glowHex);

    const camera = new THREE.PerspectiveCamera(35, W() / H(), 0.01, 60);
    const frame = Math.max(signW, signH);

    /*
     * LE DÉCOR APPREND ICI LA TAILLE DE L'ENSEIGNE.
     *
     * Il s'est construit plus haut, avant qu'on ne sache quoi que ce soit du
     * dessin — c'est l'ordre normal, la scène existe avant son contenu. Mais un
     * décor de TOITURE a besoin de cette cote : son couronnement doit affleurer
     * sous les lettres, quelle que soit leur hauteur, sans quoi l'enseigne
     * flotte ou se noie dans la façade. On la lui donne dès qu'elle est connue,
     * et les décors qui n'en ont pas l'usage ne font rien.
     */
    decor.poserSousLEnseigne(-signH / 2);

    /*
     * LE PANNEAU CACHE UNE PART DE LA TOILE, LA CAMÉRA EN TIENT COMPTE.
     *
     * `setViewOffset` déplace la FENÊTRE de la caméra dans son image, sans
     * toucher ni à sa position ni à sa cible : l'orbite du client continue de
     * fonctionner exactement pareil, et l'objet se retrouve centré sur la
     * bande visible. Reculer un peu, en proportion de ce qui est masqué,
     * évite qu'il en ressorte par le côté.
     */
    const recul = offsetRef.current
      ? Math.min(1.6, W() / Math.max(120, W() - Math.abs(offsetRef.current) * 2))
      : 1;
    const poserCadrage = () => {
      const dx = offsetRef.current;
      if (dx) camera.setViewOffset(W(), H(), -dx, 0, W(), H());
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    recadrerRef.current = poserCadrage;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = frame * 0.45;
    /*
     * Il faut pouvoir reculer jusqu'à voir le sol, à 1,50 m sous l'objet. Le
     * plafond proportionnel d'avant (frame × 6 + 1) valait 2,3 m pour un néon
     * de 22 cm de haut : moins que la distance nécessaire. La vue « pièce »
     * était donc inatteignable là où elle sert le plus — sur les petits néons,
     * ceux dont la taille surprend à la livraison.
     */
    controls.maxDistance = Math.max(frame * 6 + 1, 7, decor.champMinM * 1.8);
    controls.maxPolarAngle = Math.PI * 0.78;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.minAzimuthAngle = -Math.PI * 0.42;
    controls.maxAzimuthAngle = Math.PI * 0.42;

    /*
     * DEUX CADRAGES, ET C'EST VOULU.
     *
     * « Pièce » — on recule jusqu'au sol et au meuble. C'est LA VUE PAR DÉFAUT,
     * sur décision du marchand, et il l'a prise après avoir vu les deux : la
     * 3D s'ouvre sur un objet POSÉ QUELQUE PART, pas sur un objet flottant.
     *
     * « Objet » — le néon remplit le cadre. C'est la vue de travail : on règle
     * une couleur, une police, on veut les voir de près.
     *
     * Le coût du défaut est connu et assumé : à cette distance, un « Merci » de
     * 22 cm occupe un dixième de l'image. Le bouton fait donc l'inverse de ce
     * qu'il faisait — il rapproche.
     *
     * Le cadrage « objet » est SOUS-LINÉAIRE (× 1,55 + 0,55 au lieu de
     * × 1,75 + 0,3) : un grand néon remplit davantage le cadre qu'un petit, au
     * lieu que tous le remplissent pareil. C'est la moitié de la réponse à
     * l'échelle — l'autre moitié est le meuble du décor.
     *
     * La DIRECTION de vue, elle, ne dépend plus de la taille. Auparavant la
     * caméra se posait à `frame × 0,9` sur X : un petit néon était vu presque
     * de face, un grand de trois quarts prononcé. Deux objets du même
     * catalogue n'ont aucune raison d'être photographiés différemment.
     */
    const FOV_RAD = (35 * Math.PI) / 180;
    const CIBLE_OBJET = new THREE.Vector3(0, 0, 0);
    // La cible descend en vue « pièce » : c'est ce qui fait entrer le sol et le
    // meuble dans le cadre, l'objet restant dans le tiers supérieur — là où on
    // regarde une enseigne accrochée.
    /*
     * LA CIBLE DESCEND AVEC LA HAUTEUR DE POSE.
     *
     * 55 cm sous l'enseigne : la bonne valeur quand elle est accrochée à 1,50 m,
     * c'est-à-dire presque partout. Un décor peut la poser plus haut — un logo
     * d'accueil est à 2,15 m — et la pièce descend d'autant sous elle : cadrée
     * sur l'enseigne, on ne voyait plus ni le pied de la banque ni le sol.
     * La cible suit donc, aux deux tiers du décalage : suivre au mètre près
     * remettrait l'enseigne en haut du cadre, où elle serait à l'étroit.
     */
    const CIBLE_PIECE = new THREE.Vector3(0, -0.55 - Math.max(0, decor.poseM - MOUNT_HEIGHT_M) * 0.66, 0);
    /*
     * LA DIRECTION DE PRISE DE VUE, ET POURQUOI ELLE N'EST PLUS UNIQUE.
     *
     * Un y légèrement positif place l'appareil un peu AU-DESSUS de l'objet :
     * c'est le bon point de vue sur une enseigne accrochée à hauteur d'homme,
     * qu'on regarde en baissant un peu les yeux. Ce n'en est pas un sur une
     * enseigne posée sur un toit, qu'on ne voit jamais autrement qu'en levant
     * la tête. Le décor peut donc imposer la sienne (`Palette.vue`), et la
     * contre-plongée du gratte-ciel vient de là.
     */
    const dv = decor.dirVue;
    const DIR = new THREE.Vector3(...(dv ?? [0.4, 0.14, 1])).normalize();
    let visibleHeightM = 0;
    const cadrer = (vue: 'objet' | 'piece') => {
      // Un décor peut imposer son échelle : une façade se regarde de loin, quelle
      // que soit la taille de l'enseigne qu'on y pose.
      const planche = decor.champMinM / (2 * Math.tan(FOV_RAD / 2));
      const base = 'piece' === vue ? Math.max(3.4, frame * 2.4) : frame * 1.55 + 0.55;
      const d = Math.max(base, planche) * recul;
      /* La cible ne descend QUE s'il y a une pièce à montrer. Une FAÇADE n'a ni
         sol ni meuble — la baisser reviendrait à cadrer du vide sous le
         bâtiment. Le critère est donc le sol, et non la vue imposée : un
         accueil impose sa vue lui aussi, et il a bel et bien un plancher. */
      const cible = 'piece' === vue && !decor.sansSol ? CIBLE_PIECE : CIBLE_OBJET;
      camera.position.copy(cible).addScaledVector(DIR, d);
      controls.target.copy(cible);
      camera.lookAt(cible);
      visibleHeightM = 2 * d * Math.tan(FOV_RAD / 2);
      controls.update();
    };
    cadrerRef.current = cadrer;
    cadrer(vueRef.current);
    poserCadrage();

    // Le mur, le sol, la plinthe et le meuble d'échelle sont posés par
    // `scene-decor.ts` (voir plus haut) : il n'y a plus de mur d'ambiance ici.

    /*
     * CE QUE LE PROFILÉ OCCUPE RÉELLEMENT (E24).
     *
     * Mesuré sur les maillages construits, pas recalculé depuis les cotes
     * d'entrée : quatre montants tournés de travers compilent parfaitement et
     * rendent une croix, et seule une `Box3` sur la géométrie posée le voit.
     */
    /** Le visuel d'impression du marchand a-t-il été employé (E18) ? */
    let imprimeReel = false;
    const montantsPoses: THREE.Mesh[] = [];
    let facePosee: THREE.Mesh | null = null;
    /*
     * CE QUI A ÉTÉ RÉELLEMENT BÂTI EN LETTRES BOÎTIERS (E05).
     *
     * Compté sur les `Shape` construites, pas sur les contours reçus : c'est la
     * différence entre « le classement a rendu trois formes » et « trois
     * lettres sont dans la scène ». Le rendu de ce bloc a été du code mort
     * pendant des mois sans que rien ne le dise ; ces deux nombres sont ce qui
     * permet à un banc de le constater au lieu de le supposer.
     */
    let lettresBaties = 0;
    let trousBaties = 0;

    // ----- PANNEAU / CAISSON -------------------------------------------------
    // Un volume aux dimensions réelles. Le caisson émet sa lumière par la face
    // avant : c'est un matériau non éclairé par la scène, et c'est le bloom qui
    // fabrique le halo — exactement comme pour un tube.
    if (plate) {
      const d = enM(Math.max(plate.depthCm, 0.2));
      /*
       * LE CORPS S'ARRÊTE SOUS LA PARCLOSE (E24).
       *
       * Il allait jusqu'à `d`, donc jusqu'au nu de la façade — et la face
       * diffusante devait alors se poser DEVANT lui, donc devant le profilé,
       * qu'elle cachait entièrement. Le liseré était construit, mesurable, et
       * invisible : c'est en le regardant à l'écran qu'on l'a vu, pas dans la
       * `Box3` qui le trouvait parfaitement.
       *
       * Un caisson réel est creux : la face vient en façade et la parclose la
       * recouvre. On rend donc les trois derniers millimètres au profilé.
       */
      const CREUX_M = 0.003;
      const corps = new THREE.Mesh(
        new THREE.BoxGeometry(signW, signH, Math.max(d - CREUX_M, d / 2)),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(plate.materialCss),
          roughness: 'box' === plate.kind ? 0.45 : 0.62,
          metalness: 'box' === plate.kind ? 0.35 : 0.12,
          clearcoat: 0.25,
        }),
      );
      corps.position.z = Math.max(d - CREUX_M, d / 2) / 2;
      corps.castShadow = true;
      scene.add(corps);

      /*
       * LES LETTRES BOÎTIERS SE DESSINENT SUR LE GLYPHE, PAS SUR LA DÉCOUPE.
       *
       * `letterOutlines` est la silhouette gonflée du rayon du tube plus 4 mm,
       * faite pour qu'une plaque laisse passer un néon posé dessus. L'employer
       * ici soudait les lettres d'un « ABC » en une seule masse — réfuté par la
       * capture, pas par un test (docs/43 §69).
       */
      const contoursLettres = geometry.glyphOutlines.length
        ? geometry.glyphOutlines
        : geometry.letterOutlines;
      if ('panel' === plate.kind && plate.channelLetters && contoursLettres.length) {
        const channel = plate.channelLetters;
        const frontLit = lit && ('front' === channel.lighting || 'front-back' === channel.lighting);
        const backLit = lit && ('back' === channel.lighting || 'front-back' === channel.lighting);
        const faceMat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(channel.faceColor),
          roughness: 'metal' === channel.material ? 0.22 : 'wood' === channel.material ? 0.72 : 0.12,
          metalness: 'metal' === channel.material ? 0.82 : 0,
          transmission: 'acrylic' === channel.material ? 0.12 : 0,
          clearcoat: 'acrylic' === channel.material ? 1 : 0.25,
          emissive: new THREE.Color(channel.glowColor),
          emissiveIntensity: frontLit ? 1.4 : 0,
        });
        const sideMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(channel.sideColor), roughness: 0.46, metalness: 'metal' === channel.material ? 0.7 : 0.05 });
        /*
         * L'AURÉOLE D'UNE LETTRE RÉTROÉCLAIRÉE SUIT LE MUR (E22, second volet).
         *
         * C'était le plus nu des halos : une opacité de 0,82 en dur, dans la
         * couleur de la lettre, identique sur du plâtre blanc et sur de la
         * brique — alors que `lettres-boitiers` §4 dit précisément l'inverse,
         * « l'auréole n'existe que sur un mur mat et clair ; sur brique sombre
         * ou bardage brillant, elle disparaît ».
         *
         * Il reçoit donc le même traitement que le halo du néon : la teinte
         * filtrée par l'albédo du mur, et le niveau porté par `haloMul`, qui
         * dit quelle part de la lumière du lieu l'enseigne représente. Ce n'est
         * pas un ajout de facteur — c'est un alignement : ce halo-ci n'en avait
         * AUCUN des deux.
         */
        const teinteAureole = haloSurMur(new THREE.Color(channel.glowColor).getHex(), decor.murHex);
        const backGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(teinteAureole), toneMapped: false, transparent: true, opacity: backLit ? 0.82 * decor.haloMul : 0 });
        const letterDepth = Math.max(0.005, mmEnM(channel.depthMm));

        const formesLettres = formesAvecTrous(contoursLettres, conv);
        lettresBaties = formesLettres.length;
        trousBaties = formesLettres.reduce((n, f) => n + f.holes.length, 0);
        for (const shape of formesLettres) {
          channel.backboardLayers.slice().reverse().forEach((layer, index) => {
            const layerDepth = Math.max(0.001, mmEnM(layer.thicknessMm));
            const layerMesh = new THREE.Mesh(
              new THREE.ExtrudeGeometry(shape, { depth: layerDepth, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0005, bevelSegments: 2 }),
              new THREE.MeshPhysicalMaterial({ color: new THREE.Color(layer.color), roughness: 'metal' === layer.material ? 0.3 : 'wood' === layer.material ? 0.8 : 0.16, metalness: 'metal' === layer.material ? 0.75 : 0, clearcoat: 'acrylic' === layer.material ? 0.9 : 0.1 }),
            );
            const scale = 1 + layer.extensionCm / Math.max(12, heightCm);
            layerMesh.scale.set(scale, scale, 1);
            layerMesh.position.z = d + 0.001 + index * 0.001;
            layerMesh.castShadow = true;
            scene.add(layerMesh);
          });
          if (backLit) {
            const glowMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), backGlowMat);
            glowMesh.scale.set(1.035, 1.035, 1);
            glowMesh.position.z = d + 0.002;
            scene.add(glowMesh);
          }
          /*
           * RETOUR, FACE ET TRIM CAP — et non un bloc biseauté (E05).
           *
           * `lettres-boitiers` §7 : « Le biseau actuel n'existe sur aucune
           * lettre boîtier. » C'est vrai de la fabrication : une lettre
           * boîtier est une COQUE — un retour d'aluminium plié, une face
           * d'acrylique posée dessus, un trim cap qui pince les deux. Il n'y a
           * nulle part une arête cassée à 45° ; le biseau est le geste d'une
           * fraise dans un bloc plein, donc exactement l'autre construction.
           *
           * Une lettre DÉCOUPÉE, elle, est massive : son arête est bien celle
           * de l'outil, et le biseau y reste juste. C'est `constructionLettre`
           * qui tranche, au lieu d'appliquer le même geste aux deux.
           */
          const cons = constructionLettre('none' !== channel.lighting);
          const zLettre = d + 0.003 + channel.backboardLayers.length * 0.001;

          const corps = new THREE.Mesh(
            new THREE.ExtrudeGeometry(shape, cons.biseau
              ? { depth: letterDepth, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.001, bevelSegments: 3 }
              : { depth: letterDepth, bevelEnabled: false }),
            cons.biseau ? [faceMat, sideMat] : [sideMat, sideMat],
          );
          corps.position.z = zLettre;
          corps.castShadow = true;
          scene.add(corps);

          if ('channel' === cons.construction) {
            /*
             * LA FACE EST UNE PIÈCE À PART, posée sur le retour.
             *
             * C'est ce qui distingue une lettre boîtier d'un bloc peint : le
             * retour est opaque et mat, la face est translucide et s'allume.
             * Un seul maillage à deux matériaux ne le montrait pas — il donnait
             * un volume dont le dessus se trouvait être d'une autre couleur.
             *
             * ── LE TRIM CAP N'EST PAS DESSINÉ, ET C'EST DÉLIBÉRÉ ───────────
             *
             * `lettres-boitiers` §7 en demande un troisième matériau. Il
             * manque, et sa cote est la raison : la fiche GemTrim
             * (`ressources/composants/`) donne la largeur du RUBAN — 3/4″, 1″,
             * 2″ — pas la part qui se voit en façade.
             *
             * Une première version a posé « la moitié ». Le rendu l'a réfutée
             * en une image : 9,5 mm de liseré de chaque côté d'un trait de
             * 30 mm, et les lettres d'un « ABC » se rejoignaient en une seule
             * masse. Dessiner un liseré demande une cote de composant acheté ;
             * tant qu'aucun marchand n'a donné la sienne, on préfère une lettre
             * juste sans trim à une lettre fausse avec.
             */
            const visage = new THREE.Mesh(new THREE.ShapeGeometry(shape), faceMat);
            visage.position.z = zLettre + letterDepth + 0.0004;
            scene.add(visage);
          }
        }
      }

      if ('box' === plate.kind) {
        /*
         * LA FACE EST PEINTE AU PAS DES RANGÉES DE MODULES (E24).
         *
         * Elle portait un dégradé radial qui ne dépendait de rien : la même
         * image à 6 cm de profondeur et à 15, alors que c'est précisément la
         * profondeur qui décide si le client verra les rangées. Un rendu qui ne
         * change pas quand le produit change ne montre pas le produit.
         *
         * `profilFace` (@neon/core) donne l'éclairement transversal calculé
         * pour l'entraxe et la distance LED-face réels. Le dégradé radial reste
         * PAR-DESSUS, en multiplicatif : il tient le tiédissement des bords, que
         * les rangées ne décrivent pas.
         *
         * Le contraste est volontairement adouci d'un facteur `DIFFUSEUR` :
         * `profilFace` rend l'éclairement INCIDENT, avant que le PMMA opale ne
         * l'étale. Peindre le profil brut montrerait des bandes bien plus
         * marquées que la réalité — un rendu alarmiste vaut à peine mieux qu'un
         * rendu flatteur.
         *
         * Ce motif est resté INVISIBLE le temps d'un commit : la face sortait
         * saturée à 765/765 sur 62 % de sa hauteur. La cause n'était ni le
         * bloom ni l'émissif mais l'ambiante de la scène sur un albédo blanc —
         * voir la matière ci-dessous, et docs/43 §38.
         */
        const homogeneite = homogeneiteCaisson(boxDepthCm, heightCm);
        const faceTex = (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          const g2 = c.getContext('2d')!;
          const gr = g2.createRadialGradient(128, 118, 12, 128, 128, 175);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.55, '#fff4dc');
          gr.addColorStop(1, '#f0d9a8');
          g2.fillStyle = gr;
          g2.fillRect(0, 0, 256, 256);
          if (homogeneite) {
            const DIFFUSEUR = 0.45;
            const profil = profilFace(256, heightCm * 10, homogeneite.entraxeMm, homogeneite.distanceLedFaceMm);
            const img = g2.getImageData(0, 0, 256, 256);
            for (let y = 0; y < 256; y++) {
              const k = 1 - DIFFUSEUR * (1 - (profil[y] ?? 1));
              for (let x = 0; x < 256; x++) {
                const i = (y * 256 + x) * 4;
                img.data[i] = Math.round(img.data[i]! * k);
                img.data[i + 1] = Math.round(img.data[i + 1]! * k);
                img.data[i + 2] = Math.round(img.data[i + 2]! * k);
              }
            }
            g2.putImageData(img, 0, 0);
          }
          const t2 = new THREE.CanvasTexture(c);
          t2.colorSpace = THREE.SRGBColorSpace;
          return t2;
        })();
        const faceMat = lit
          /*
           * UNE FACE RÉTROÉCLAIRÉE NE PREND PAS L'AMBIANTE DE LA PIÈCE.
           *
           * Son albédo était `0xf6f2e8`, presque blanc, et la scène pose une
           * ambiante de 7 — que la branche caisson multiplie encore par 1,4,
           * soit 9,8. Un blanc sous 9,8 d'ambiante sort à 765/765 AVANT toute
           * émission et avant tout halo : mesuré, bloom coupé, la colonne
           * centrale était saturée à 100 %.
           *
           * C'est ce qui effaçait le motif d'E24, et non le bloom ni l'émissif
           * — trois hypothèses ont été essayées et réfutées à la mesure avant
           * celle-ci.
           *
           * Un diffuseur éclairé PAR L'INTÉRIEUR tire son aspect de sa source
           * interne, pas de la lumière de la pièce. L'albédo passe donc au
           * sombre, et tout ce qu'on voit vient de `emissiveMap` — c'est-à-dire
           * du profil calculé au pas des rangées.
           */
          ? new THREE.MeshPhysicalMaterial({ color: 0x0e0e0e, roughness: 0.5, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 1.15 })
          : new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.9, transmission: 0.15 });
        /*
         * LA FACE FAIT LE FORMAT SUPPORT, PAS UN POURCENTAGE (E24).
         *
         * Elle était retirée de 3,5 % en largeur et 6 % en hauteur — des
         * facteurs choisis à l'œil. Or le profilé d'un caisson ne se rétrécit
         * pas avec lui : ESP 2024 donne « Format SUPPORT = Format HORS-TOUT
         * − 10 mm » et « Format VISIBLE = Format HORS-TOUT − 44 mm » sur toute
         * sa gamme à parclose, du 44 mm au 152 mm.
         *
         * Le proportionnel se trompait donc dans les deux sens : sur un caisson
         * de 2 m il montrait 35 mm de bord là où l'atelier en fait 22, et sur
         * un 40 cm il en montrait 7. Le client d'un petit caisson voyait un
         * liseré trois fois trop fin et composait son texte jusqu'au bord.
         */
        // `enCm` et `enM` de part et d'autre : `formatsCaisson` parle en
        // centimètres — l'unité du catalogue et du client — quand la scène est
        // en mètres. Diviser par 100 à la main ici, c'est exactement ce que
        // `unites-3d.test.ts` interdit, et il a eu raison de m'arrêter.
        const fmt = formatsCaisson(enCm(signW), enCm(signH));
        const avant = new THREE.Mesh(
          new THREE.PlaneGeometry(enM(fmt.supportCm.largeur), enM(fmt.supportCm.hauteur)),
          faceMat,
        );
        // Sous le retour de parclose, qui occupe les 2 derniers millimètres —
        // et non devant lui, où elle le masquait.
        avant.position.z = d - 0.0025;

        /*
         * ET LE PROFILÉ EXISTE, au lieu d'être suggéré par un retrait.
         *
         * `caisson-lumineux` §6 : « le retour du profilé (parclose, chant de
         * 44 mm visible) n'existe pas ; le caisson ressemble à une boîte à
         * chaussures ». La section extrudée le pose vraiment — c'est elle qui
         * RECOUVRE le bord de la face, et c'est ce recouvrement de 17 mm qui la
         * tient au vent sans une seule vis traversante.
         */
        const forme = new THREE.Shape(
          sectionProfil(d).map(([u, v]) => new THREE.Vector2(u, v)),
        );
        const aluProfil = new THREE.MeshPhysicalMaterial({ color: 0x8a9099, metalness: 0.85, roughness: 0.4 });
        /*
         * `sectionProfil` dessine u vers l'intérieur et v vers le fond ;
         * `rotateX(π/2)` la met debout — u reste en X, l'extrusion part vers
         * −Y, v devient la profondeur. Chaque côté n'est plus qu'une rotation
         * autour de Z, donc quatre lignes qu'on peut relire.
         */
        const montantCaisson = (longueur: number, rotZ: number) => {
          const g = new THREE.ExtrudeGeometry(forme, { depth: longueur, bevelEnabled: false });
          g.rotateX(Math.PI / 2);
          g.rotateZ(rotZ);
          return g;
        };
        const eAile = 0.002;
        const entreM = signW - 2 * eAile;
        const poserMontant = (g: THREE.BufferGeometry, x: number, y: number) => {
          const m = new THREE.Mesh(g, aluProfil);
          // Le corps va de z = 0 à z = d : la façade du profilé tombe donc sur d.
          m.position.set(x, y, d);
          m.castShadow = true;
          scene.add(m);
          montantsPoses.push(m);
        };
        poserMontant(montantCaisson(signH, 0), -signW / 2, signH / 2);
        poserMontant(montantCaisson(signH, Math.PI), signW / 2, -signH / 2);
        poserMontant(montantCaisson(entreM, Math.PI / 2), -signW / 2 + eAile, -signH / 2);
        poserMontant(montantCaisson(entreM, -Math.PI / 2), signW / 2 - eAile, signH / 2);
        facePosee = avant;
        /*
         * LA FACE N'ENTRE PAS DANS LE BLOOM (E23).
         *
         * Le bloom sert à faire déborder une source INTENSE et PETITE : un tube
         * de 10 mm déborde, c'est ce qui fait qu'un néon a l'air allumé. Une face
         * diffusante de 1 × 0,5 m n'a rien à faire déborder — flouter un aplat
         * large ne fait que le repeindre par-dessus lui-même, en blanc.
         *
         * Mesuré, et c'est ce qui a permis de trancher : 62 % de sa colonne
         * centrale sortait à 765/765. Deux hypothèses ont été essayées et
         * RÉFUTÉES avant celle-ci — le mélange additif (l'écran ne rend que
         * 58 %) et l'émissif trop fort (0,9 au lieu de 1,5 ne rend que 57 %).
         * C'est bien le bloom qui lave la face, et rien d'autre.
         *
         * Le caisson ne perd pas sa diffusion sur le mur : elle vient du halo
         * peint, qui reste, lui, dans le bloom.
         */
        avant.userData.horsBloom = true;
        scene.add(avant);
        if (2 === plate.faces) {
          const arriere = avant.clone();
          arriere.position.z = -0.001;
          arriere.rotation.y = Math.PI;
          scene.add(arriere);
        }
      }

      // Cotes et lumières restent communes : on saute seulement le support de
      // néon et le pliage des tubes.
      // Une plaque n'émet rien : elle a besoin de plus de lumière de scène
      // qu'un tube pour se voir. D'où le supplément, par-dessus l'ambiance du
      // décor ajoutée plus bas.
      scene.add(new THREE.AmbientLight(decor.ambientHex, lit ? decor.ambientLit * 1.4 : decor.ambientOff * 0.6));
      const keyP = new THREE.DirectionalLight(0xffffff, 1.15);
      keyP.position.set(-1.1, 1.4, 2.2);
      scene.add(keyP);
      const rimP = new THREE.DirectionalLight(0xbcd4ff, 0.5);
      rimP.position.set(1.6, -0.6, 1.2);
      scene.add(rimP);
    }

    // ----- support : plaque extrudée OU caisson ------------------------------
    const boardGroup = new THREE.Group();
    // Le support d'un néon n'a pas de sens ici.
    if (plate) boardGroup.visible = false;
    scene.add(boardGroup);
    let boardFrontZ = 0; // face avant du support (départ des tubes)

    const extrudeSettings = { depth: boardT, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0008, bevelSegments: 2 };

    if (isBox) {
      // CAISSON réel : parois alu + fond + face diffusante translucide.
      const alu = new THREE.MeshPhysicalMaterial({ color: 0x6f767e, metalness: 0.85, roughness: 0.45 });
      const wallT = enM(SPEC.boxWallCm);
      const bw = signW + 0.04;
      const bh = signH + 0.04;
      const backMat = new THREE.MeshPhysicalMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.3 });
      const back = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, wallT), backMat);
      back.position.z = -boxD + wallT / 2;
      back.castShadow = true;
      boardGroup.add(back);
      /*
       * LE PROFILÉ, ET NON QUATRE PLANCHES (E24).
       *
       * Les montants étaient des `BoxGeometry` : une boîte à chaussures, sans
       * le RETOUR DE PARCLOSE qui, sur un caisson réel, recouvre le bord de la
       * face. `caisson-lumineux` §6 le relevait, et ce n'est pas une affaire
       * d'esthétique : ESP 2024 donne « Format VISIBLE = Format HORS-TOUT
       * − 44 mm » sur toute sa gamme à parclose, soit 22 mm d'alu tout autour.
       * Une face dessinée bord à bord fait composer au client un texte que le
       * profilé mangera à la livraison.
       *
       * ── LA POSE DES QUATRE MONTANTS ────────────────────────────────────
       *
       * `sectionProfil` dessine la section dans le plan XY (u = vers
       * l'intérieur, v = vers le fond) ; `ExtrudeGeometry` l'étire selon +Z.
       * `rotateX(π/2)` la remet debout : u reste en X, l'extrusion part vers
       * −Y, et v devient la profondeur (0 en façade, négatif au fond).
       *
       * Chaque côté n'est alors qu'une rotation autour de Z — donc quatre
       * lignes qu'on peut relire, au lieu de trois angles d'Euler à
       * reconstituer de tête.
       */
      const forme = new THREE.Shape(
        sectionProfil(boxD).map(([u, v]) => new THREE.Vector2(u, v)),
      );
      const montant = (longueur: number, rotZ: number) => {
        const g = new THREE.ExtrudeGeometry(forme, { depth: longueur, bevelEnabled: false });
        g.rotateX(Math.PI / 2);
        g.rotateZ(rotZ);
        return g;
      };
      // Les verticaux prennent la hauteur entière ; les horizontaux passent
      // entre eux. C'est l'assemblage par équerres du catalogue, et il évite
      // des onglets à 45° qu'on ne verrait pas d'un mètre.
      const entre = bw - 2 * wallT;
      const poser = (g: THREE.BufferGeometry, x: number, y: number) => {
        const m = new THREE.Mesh(g, alu);
        m.position.set(x, y, 0);
        m.castShadow = true;
        boardGroup.add(m);
        montantsPoses.push(m);
      };
      poser(montant(bh, 0), -bw / 2, bh / 2);                    // gauche
      poser(montant(bh, Math.PI), bw / 2, -bh / 2);              // droit
      poser(montant(entre, Math.PI / 2), -bw / 2 + wallT, -bh / 2);   // bas
      poser(montant(entre, -Math.PI / 2), bw / 2 - wallT, bh / 2);    // haut

      /*
       * La face fait le format SUPPORT — hors-tout moins 10 mm — parce que
       * c'est la plaque qu'on COMMANDE. Les 17 mm qui restent entre elle et le
       * bord visible sont sous la parclose : c'est ce recouvrement qui la tient
       * au vent sans une seule vis traversante.
       */
      const fmt = formatsCaisson(enCm(bw), enCm(bh));
      const face = new THREE.Mesh(
        new THREE.BoxGeometry(enM(fmt.supportCm.largeur), enM(fmt.supportCm.hauteur), 0.004),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.06,
          transmission: 0.94,
          thickness: 0.004,
          ior: 1.49,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          envMapIntensity: 1.4,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      face.position.z = 0.0015;
      face.renderOrder = 2;
      boardGroup.add(face);
      facePosee = face;
      boardFrontZ = -boxD + wallT + tubeR + 0.004;
    } else if (supportType !== 'none') {
      const contours =
        supportType === 'cut-to-letter'
          ? geometry.letterOutlines
          : supportType === 'contour'
            ? geometry.contourOutline
            : [];
      const mat = boardMaterial(finish, color, props.decor?.imageImprimee);
      imprimeReel = true === mat.userData?.imprimeReel;
      if (contours.length > 0) {
        // Plaque découpée : une extrusion par contour.
        for (const c of contours) {
          const shape = shapeFromContour(c, conv);
          if (!shape) continue;
          const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrudeSettings), mat);
          mesh.position.z = -boardT;
          mesh.castShadow = true;
          boardGroup.add(mesh);
        }
      } else {
        // Rectangle (ou pied) : plaque à coins arrondis, marge réelle 3 cm.
        const m = 0.03;
        const rw = signW + m * 2;
        const rh = signH + m * 2;
        const rr = Math.min(0.02, rw / 2, rh / 2);
        const s = new THREE.Shape();
        s.moveTo(-rw / 2 + rr, -rh / 2);
        s.lineTo(rw / 2 - rr, -rh / 2);
        s.quadraticCurveTo(rw / 2, -rh / 2, rw / 2, -rh / 2 + rr);
        s.lineTo(rw / 2, rh / 2 - rr);
        s.quadraticCurveTo(rw / 2, rh / 2, rw / 2 - rr, rh / 2);
        s.lineTo(-rw / 2 + rr, rh / 2);
        s.quadraticCurveTo(-rw / 2, rh / 2, -rw / 2, rh / 2 - rr);
        s.lineTo(-rw / 2, -rh / 2 + rr);
        s.quadraticCurveTo(-rw / 2, -rh / 2, -rw / 2 + rr, -rh / 2);
        const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, extrudeSettings), mat);
        mesh.position.z = -boardT;
        mesh.castShadow = true;
        boardGroup.add(mesh);
        // Pied acrylique à poser.
        if (supportType === 'stand') {
          const standMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transmission: 0.9, thickness: 0.008, ior: 1.49, transparent: true });
          const foot = new THREE.Mesh(new THREE.BoxGeometry(rw * 0.55, 0.012, 0.06), standMat);
          foot.position.set(0, -rh / 2 - 0.006, 0.02);
          boardGroup.add(foot);
        }
      }
      boardFrontZ = tubeR + 0.001;

      // Entretoises murales (vis) — visibles aux quatre coins.
      if (supportType === 'rectangle' || supportType === 'contour') {
        const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.18 });
        const sw = signW / 2 + 0.012;
        const sh = signH / 2 + 0.012;
        const len = enM(SPEC.standoffLengthCm);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 16), chrome);
          pin.rotation.x = Math.PI / 2;
          pin.position.set(sx * sw, sy * sh, -boardT - len / 2);
          boardGroup.add(pin);
        }
      }
    } else {
      boardFrontZ = tubeR + 0.001;
    }

    // ----- TUBES RÉELS -------------------------------------------------------
    // Un vrai tube LED néon allumé est BLANC BRÛLANT au centre et coloré sur
    // les bords : la gaine silicone teintée laisse voir le diffuseur qui
    // sature. On le construit physiquement — un cœur émissif presque blanc
    // DANS une gaine translucide (transmission) teintée et elle-même émissive.
    // De face on voit le cœur au travers, en incidence rasante la couleur de
    // la gaine domine : exactement le dégradé du produit réel. L'ancien rendu
    // (un seul MeshBasicMaterial plat) donnait un tube autocollant, sans
    // matière, que les lumières de la scène ignoraient.
    /*
     * UN JEU DE MATÉRIAUX PAR COULEUR, ET PAS UN SEUL POUR LA PIÈCE.
     *
     * La vue ne recevait qu'un `glowHex` : un néon de deux lignes de deux
     * couleurs s'y affichait d'une seule, et depuis qu'un MOT peut porter la
     * sienne, l'écart se serait vu à chaque commande. Les matériaux sont donc
     * fabriqués à la demande et gardés en cache : une pièce de trois couleurs
     * en crée trois jeux, pas trois cents.
     */
    const jeux = new Map<string, { gaine: THREE.Material; coeur: THREE.Material }>();
    const materiauxPour = (hex: string) => {
      const deja = jeux.get(hex);
      if (deja) return deja;
      const c = new THREE.Color(hex);
      // On ne fabrique QUE la gaine qui sera posée : la libération se fait en
      // parcourant la scène, et une matière qu'on n'y attache jamais fuit
      // (`performance-3d-temps-reel` §6). Avec un jeu par couleur, l'oubli se
      // paierait autant de fois qu'il y a de mots.
      const sleeveLit = !lit ? null : new THREE.MeshPhysicalMaterial({
        color: c,
        emissive: c,
        // Assez fort pour que le canal dominant de N'IMPORTE quelle couleur
        // franchisse le seuil du bloom une fois passé par l'ACES (≈0.95 > 0.82)
        // — un rose sombre brille autant qu'un cyan. C'est le tone mapping qui
        // écrase l'excédent en blanc chaud au centre, comme sur le vrai tube.
        emissiveIntensity: 2.2,
        roughness: 0.3,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25,
        transmission: 0.55,
        thickness: tubeR * 2,
        ior: 1.42,
      });
      const coreLit = !lit ? null : new THREE.MeshBasicMaterial({
        color: c.clone().lerp(new THREE.Color(0xffffff), 0.72),
        toneMapped: false,
      });
      // Éteint : gaine silicone laiteuse ENCORE teintée par son pigment — un
      // néon rose hors tension est rose pâle, pas gris.
      const sleeveOff = lit ? null : new THREE.MeshPhysicalMaterial({
        color: c.clone().lerp(new THREE.Color(0xf3f4f7), 0.62),
        roughness: 0.45,
        transmission: 0.22,
        thickness: 0.004,
        clearcoat: 0.6,
      });
      const jeu = { gaine: (lit ? sleeveLit : sleeveOff)!, coeur: coreLit! };
      jeux.set(hex, jeu);
      return jeu;
    };

    const tubeGroup = new THREE.Group();
    scene.add(tubeGroup);
    const curves: THREE.CatmullRomCurve3[] = [];
    (plate ? [] : geometry.strokes).forEach((stroke, iTrait) => {
      const jeu = materiauxPour(couleursTraits?.[iTrait] || glowHex);
      const pts = stroke.map((p) => {
        const [x, y] = conv(p);
        return new THREE.Vector3(x, y, boardFrontZ);
      });
      if (pts.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
      curves.push(curve);
      const segs = Math.min(420, Math.max(16, pts.length * 6));
      const sleeve = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, tubeR, 12, false), jeu.gaine);
      sleeve.castShadow = false;
      tubeGroup.add(sleeve);
      if (lit) {
        const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, tubeR * 0.58, 10, false), jeu.coeur);
        tubeGroup.add(core);
      }
      // Embouts arrondis du tube.
      const capGeo = new THREE.SphereGeometry(tubeR, 12, 10);
      for (const p of [pts[0]!, pts[pts.length - 1]!]) {
        const cap = new THREE.Mesh(capGeo, jeu.gaine);
        cap.position.copy(p);
        tubeGroup.add(cap);
      }
    });

    // ----- câble de sortie + transformateur ---------------------------------
    // Un panneau qui n'émet rien n'a pas d'alimentation : la montrer serait
    // promettre un produit qu'on ne livrera pas.
    if (supportType !== 'none' && emissif) {
      const cableMat = new THREE.MeshPhysicalMaterial({ color: 0x8e97a3, roughness: 0.55, transmission: 0.25, thickness: 0.002, transparent: true, opacity: 0.9 });
      const startX = signW * 0.28;
      const yBottom = -signH / 2 - 0.02;
      const [powerX, powerY, powerZ] = decor.powerAnchor;
      const cable = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, yBottom + 0.02, boardFrontZ - tubeR),
        new THREE.Vector3(startX + 0.01, yBottom - 0.08, -boardT - 0.01),
        new THREE.Vector3((startX + powerX) / 2, (yBottom + powerY) / 2, powerZ),
        new THREE.Vector3(powerX - 0.06, powerY, powerZ),
      ]);
      const cordon = new THREE.Mesh(
        new THREE.TubeGeometry(cable, 48, enM(SPEC.cableDiameterCm) / 2, 8, false), cableMat,
      );
      accessoiresDuNeon.push(cordon);
      scene.add(cordon);
      const psu = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.035, 0.03),
        new THREE.MeshPhysicalMaterial({ color: 0x1a1d23, roughness: 0.5, metalness: 0.2 }),
      );
      psu.position.set(powerX, powerY, powerZ);
      psu.castShadow = true;
      scene.add(psu);
    }

    // ----- lumières ----------------------------------------------------------
    // La teinte et la force viennent du décor : une chambre au crépuscule
    // n'est pas un salon en plein jour, et un mur crème renvoie beaucoup
    // plus de lumière qu'un mur de studio.
    scene.add(new THREE.AmbientLight(decor.ambientHex, lit ? decor.ambientLit : decor.ambientOff));
    const rim = new THREE.DirectionalLight(0xbcd2ea, 0.25);
    rim.position.set(-frame * 1.4, frame * 0.6, frame * 0.9);
    scene.add(rim);
    const key = new THREE.DirectionalLight(0xffffff, lit ? 0.4 : 0.95);
    key.position.set(frame * 1.2, frame * 1.6, frame * 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.05;
    key.shadow.camera.far = 12;
    scene.add(key);
    // Diffusion du néon sur le mur : halo PEINT (dégradé radial additif) plaqué
    // sur le mur, aux dimensions du signe. Une PointLight à quelques cm du mur
    // devenait un point brûlé aveuglant dès qu'on orbitait autour du signe.
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.28, 'rgba(255,255,255,0.34)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.09)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // Depuis que le tube émet vraiment (gaine émissive + bloom + lumières
    // ponctuelles sur le mur), ce halo peint n'est plus qu'un APPOINT : il
    // adoucit le pied du dégradé, il ne fabrique plus la lumière. À moitié
    // opaque et très étendu, il écrasait la scène — un projecteur caché
    // derrière l'enseigne, exactement ce qu'un vrai néon n'a pas.
    /*
     * LE HALO PREND LA COULEUR DU MUR AUTANT QUE CELLE DU NÉON (E22).
     *
     * Une lumière réfléchie est le produit, canal par canal, de la lumière
     * incidente et de la réflectance de la surface. Un mur de brique éclairé en
     * vert ne renvoie pas du vert : la brique n'a presque pas de réflectance
     * dans le vert, et le mur reste sourd. Le halo, lui, portait la couleur du
     * tube, plate, la même sur du plâtre blanc et sur de la brique.
     *
     * ── POURQUOI LA CHROMATICITÉ SEULE, ET PAS L'ALBÉDO ENTIER ─────────────
     *
     * L'albédo porte deux informations : une TEINTE et un NIVEAU. La teinte
     * manquait ; le niveau, lui, est déjà porté par `haloMul`.
     *
     * On s'en assure en regardant les valeurs : `haloMul` vaut 1 sur le studio
     * sombre (mur #2e323b) et 0,16 sur le salon crème (#ece5d7) — il est
     * INVERSEMENT lié à la clarté du mur, parce qu'il encode le contraste avec
     * l'ambiance et non la réflectance. Les deux facteurs sont donc bien
     * distincts, et appliquer le niveau une seconde fois assombrirait chaque
     * décor de sa propre clarté sans qu'aucune mesure le demande.
     *
     * On normalise donc l'albédo sur son canal le plus fort : il ne reste que
     * la teinte, et le niveau est laissé à qui le portait déjà.
     *
     * Le calcul lui-même vit dans `@neon/core` (`haloSurMur`), où il est pur et
     * testable : la conversion sRGB ↔ linéaire est le seul endroit où l'on
     * pouvait diverger sans le voir, et trois de ses témoins sont les valeurs
     * RELEVÉES ici même, dans le navigateur, avant qu'il n'y monte.
     */
    /*
     * LE MUR REÇOIT LA SOMME DES TUBES, PAS LA COULEUR DU PREMIER MOT.
     *
     * Depuis qu'un mot porte sa propre bobine, `glowHex` n'est plus que la
     * couleur de la première ligne : une pièce moitié rose moitié cyan aurait
     * éclairé son mur en rose. On mélange donc les couleurs émises, chacune au
     * prorata de la LONGUEUR de son tube — un mot de trois lettres n'éclaire
     * pas autant qu'un mot de dix.
     *
     * Le mélange se fait en LINÉAIRE, parce que c'est là que la lumière
     * s'additionne : moyenner les octets sRGB donnerait un lilas trop sombre
     * d'environ un quart. `haloSurMur` reprend ensuite la main, en sRGB, comme
     * pour une pièce d'une seule couleur — ses témoins ne bougent pas.
     */
    const teinteDesTubes = () => {
      if (plate || !couleursTraits?.some(Boolean)) return color;
      const somme = new THREE.Color(0, 0, 0);
      let poids = 0;
      geometry.strokes.forEach((stroke, i) => {
        let len = 0;
        for (let k = 1; k < stroke.length; k += 1) {
          len += Math.hypot(stroke[k]![0] - stroke[k - 1]![0], stroke[k]![1] - stroke[k - 1]![1]);
        }
        if (0 === len) return;
        const lin = new THREE.Color(couleursTraits[i] || glowHex).convertSRGBToLinear();
        somme.add(lin.multiplyScalar(len));
        poids += len;
      });
      if (0 === poids) return color;
      return somme.multiplyScalar(1 / poids).convertLinearToSRGB();
    };
    const couleurDuHalo = new THREE.Color(haloSurMur(
      plate && 'box' === plate.kind ? 0xfff0d2 : teinteDesTubes().getHex(),
      decor.murHex,
    ));
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(signW * 1.7 + 0.2, signH * 2.2 + 0.2),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        // Un caisson à face blanche rayonne BLANC CHAUD, pas la couleur du
        // tube néon : il n'a pas de tube. Le halo suivait `glowHex` et le
        // caisson éclairait le mur en rose.
        color: couleurDuHalo,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        // Trois facteurs, et chacun répond à une question différente :
        //
        //   0.34       le réglage de la configuration de RÉFÉRENCE de
        //              `@neon/core` — 3 m de blanc neutre sur 60 × 24 cm. Sans
        //              cette référence écrite, « 0,34 » ne veut rien dire.
        //   haloMul    le DÉCOR : une constante seule brûlait tout mur clair,
        //              et prétendait qu'un néon éclaire une pièce en plein jour.
        //   eclat      l'ÉCART à la référence, mesuré (E10) : flux du design
        //              rapporté à la surface du signe. C'est ce qui manquait —
        //              un bleu à 5,2 lm/W et un vert à 39,8 avaient le même
        //              halo, alors qu'ils diffèrent d'un facteur 7,7.
        opacity: 0.34 * decor.haloMul * eclat,
      }),
    );
    halo.position.set(0, 0, wallZ - 0.05);
    halo.visible = lit && emissif;
    halo.renderOrder = -1;
    accessoiresDuNeon.push(halo);
    scene.add(halo);
    // Éclairer la scène avec de VRAIES sources ponctuelles a été essayé deux
    // fois, et les deux réglages échouent : près de la plaque (9 cm), la
    // décroissance en 1/d² fait brûler le reflet dès qu'on orbite ; à
    // distance, il reste deux points spéculaires collés sur l'acrylique. Une
    // plaque brillante + une source ponctuelle = un artefact, quel que soit
    // le recul. La lumière murale est donc PEINTE (le halo ci-dessus) : douce
    // par construction, identique sous tous les angles, jamais aveuglante.
    const spill: THREE.PointLight[] = [];

    // ----- COTES (plan de fabrication) --------------------------------------
    const dims = new THREE.Group();
    dims.visible = dimsRef.current?.visible ?? true;
    dimsRef.current = dims;
    scene.add(dims);
    const cm = (v: number) => `${Math.round(v)} cm`;
    const yDim = -signH / 2 - 0.075;
    const xDim = -signW / 2 - 0.075;
    dims.add(dimensionLine(new THREE.Vector3(-signW / 2, yDim, 0), new THREE.Vector3(signW / 2, yDim, 0)));
    const wLabel = makeLabel(cm(widthCm));
    wLabel.position.set(0, yDim - 0.035, 0);
    dims.add(wLabel);
    dims.add(dimensionLine(new THREE.Vector3(xDim, -signH / 2, 0), new THREE.Vector3(xDim, signH / 2, 0)));
    const hLabel = makeLabel(cm(heightCm));
    hLabel.position.set(xDim - 0.05, 0, 0);
    dims.add(hLabel);
    // Profondeur (caisson) ou épaisseur de plaque, cotée sur le côté.
    const depthLabel = makeLabel(
      plate
        ? 'box' === plate.kind
          ? `${t('Caisson lumineux')} ${Math.round(plate.depthCm)} cm`
          : `${t('Épaisseur')} ${Math.round(plate.depthCm * 10)} mm`
        : isBox
          ? `${t('Caisson')} ${Math.round(boxDepthCm)} cm`
          : `${t('Support')} ${SPEC.boardThicknessCm * 10} mm`,
      0.86,
    );
    depthLabel.position.set(signW / 2 + 0.07, signH / 2 + 0.02, isBox ? -boxD / 2 : 0);
    dims.add(depthLabel);
    // Un panneau n'a pas de tube : lui coller cette étiquette serait annoncer
    // une pièce qui n'existe pas dans la commande.
    if (!plate || 'box' === plate.kind) {
      const tubeLabel = makeLabel(
        plate ? `${t('Faces lumineuses')} ${plate.faces ?? 1}` : `${t('Tube LED')} Ø ${Math.round(tubeDiametreCm * 10)} mm`,
        0.86,
      );
      tubeLabel.position.set(signW / 2 + 0.07, signH / 2 - 0.055, boardFrontZ);
      dims.add(tubeLabel);
    }

    /*
     * PRÉVENIR QUAND LE DÉCOR TUE L'AURÉOLE.
     *
     * `lettres-boitiers` §4 ne demande pas seulement de rendre l'auréole
     * correctement : elle demande que « la scénographie 3D PRÉVIENNE quand le
     * décor choisi tue le halo ». C'est une exigence de produit, pas de rendu —
     * un client qui commande du rétroéclairé pour un mur de brique doit
     * l'apprendre avant de payer, pas à la pose.
     *
     * L'avis n'est PAS dans le groupe des cotes : il ne doit pas disparaître
     * quand on décoche « Cotes ». Un avertissement qu'on peut masquer par
     * inadvertance ne prévient personne.
     */
    const lettres = plate?.channelLetters;
    const retroeclaire = Boolean(lettres && ('back' === lettres.lighting || 'front-back' === lettres.lighting));
    const aureoleRendue = retroeclaire && lit
      ? haloVisible(new THREE.Color(lettres!.glowColor).getHex(), decor.murHex)
      : null;
    /*
     * L'avis part dans la SURCOUCHE DOM, pas dans la scène.
     *
     * Une première version en posait le texte comme les cotes, avec
     * `makeLabel`. Regardé dans la vue « Pièce », il était illisible : ces
     * étiquettes sont dimensionnées pour être lues de près, et un avertissement
     * qu'on ne peut pas lire ne prévient personne.
     *
     * La pastille des cotes, elle, reste lisible à toute distance parce qu'elle
     * n'est pas dans la scène. L'avis la rejoint.
     */
    setAvisAureole(false === aureoleRendue
      ? Math.round(fractionRenvoyee(new THREE.Color(lettres!.glowColor).getHex(), decor.murHex) * 100)
      : null);

    /*
     * ----- post-traitement : LE BLOOM NE VOIT QUE CE QUI ÉMET ----------------
     *
     * Le réglage précédent filtrait par LUMINANCE : tout pixel au-dessus de 0,4
     * après tone mapping partait dans le halo. Le raisonnement était juste tant
     * que la scène était sombre — un tube saturé plafonne vers 0,4-0,5, et le
     * seuil ne laissait passer que lui.
     *
     * Il s'effondre dès qu'un décor est CLAIR. Un mur crème se rend vers 0,82 :
     * il franchit le seuil sur toute sa surface, part dans le halo, et revient
     * additionné — la pièce entière sortait à rgb(255, 255, 255), sans grain,
     * sans plinthe, sans sol, le néon fantôme au milieu. Aucune exposition ne
     * rattrape cela : le mur et le tube ont la même luminance, donc aucun seuil
     * ne peut les séparer.
     *
     * On ne filtre donc plus par luminance mais par NATURE. Les surfaces qui
     * émettent — tube, cœur, halo, face de caisson, lettres rétroéclairées —
     * portent un calque ; le bloom rend cette passe-là, sur fond noir, et son
     * résultat est ajouté à l'image. Un mur, quelle que soit sa clarté, n'est
     * jamais une source. C'est aussi ce qui rendra les décors clairs à venir
     * (vitrine en plein jour) possibles sans y revenir.
     */
    const CALQUE_BLOOM = 1;
    /** Une surface qui émet de la lumière, par opposition à une surface claire. */
    const emetDeLaLumiere = (m: THREE.Material): boolean => {
      // Non tone-mappée : c'est une SOURCE, posée telle quelle dans l'image —
      // le cœur du tube, le halo peint, la lueur arrière des lettres.
      if (false === (m as { toneMapped?: boolean }).toneMapped) return true;
      const s = m as THREE.MeshStandardMaterial;
      return Boolean(s.emissive) && s.emissive.getHex() !== 0 && (s.emissiveIntensity ?? 0) >= 0.4;
    };
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      /* DEUX RAISONS D'ÊTRE HORS BLOOM, et le drapeau ne dit que le fait.
         Il s'appelait `pasUneSource`, ce qui était vrai d'une voûte de ciel —
         non tone-mappée sans être une source, et qui sans cette réserve passait
         tout entière dans le halo — mais faux d'une face de caisson, qui en est
         une. Une face de 1 × 0,5 m est simplement trop ÉTENDUE pour qu'un flou
         lui ajoute quoi que ce soit : il ne fait que la repeindre en blanc. */
      if (o.userData.horsBloom) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && emetDeLaLumiere(m))) o.layers.enable(CALQUE_BLOOM);
    });

    const composerBloom = new EffectComposer(renderer);
    composerBloom.renderToScreen = false;
    composerBloom.setSize(W(), H());
    composerBloom.addPass(new RenderPass(scene, camera));
    // Le seuil tombe à zéro : la sélection est déjà faite par le calque, et
    // tout ce qui arrive ici est, par construction, une source.
    const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), lit && emissif ? 0.62 : 0, 0.55, 0);
    composerBloom.addPass(bloom);

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    composer.addPass(new RenderPass(scene, camera));
    const melange = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: composerBloom.renderTarget2.texture },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        /*
         * LE HALO N'EFFACE PAS CE QU'IL RECOUVRE (E23).
         *
         * Le mélange était une ADDITION pure, et c'est ce qui détruisait la face
         * du caisson. Mesuré : une face à 0,90 et une à 0,85 — la modulation que
         * `profilFace` vient de peindre (E24) — donnaient toutes deux exactement
         * 1,000 une fois le halo ajouté. Pas atténuée : ANNULÉE.
         *
         * L'opérateur « écran », `1 − (1 − a)(1 − b)`, est le bon pour de la
         * lumière qui s'ajoute à de la lumière : deux sources ne peuvent pas
         * dépasser le blanc, et ce qui est déjà clair ne peut plus que tendre
         * vers lui. Sur les mêmes valeurs il rend 0,950 et 0,925 — l'écart
         * survit.
         *
         * Et il ne coûte rien là où l'addition marchait : sur fond sombre — le
         * cas du néon, où la mesure donne ZÉRO pixel saturé — le terme (1 − a)
         * vaut presque 1 et l'écran se confond avec l'addition. Il ne se
         * distingue d'elle que là où l'addition allait justement jeter de
         * l'information.
         */
        fragmentShader:
          'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;'
          + ' void main(){ vec4 b = texture2D(baseTexture, vUv); vec4 h = texture2D(bloomTexture, vUv);'
          + ' gl_FragColor = vec4(vec3(1.0) - (vec3(1.0) - b.rgb) * (vec3(1.0) - clamp(h.rgb, 0.0, 1.0)), b.a); }',
      }),
      'baseTexture',
    );
    melange.needsSwap = true;
    composer.addPass(melange);

    /**
     * Rend l'image : d'abord les sources seules sur fond noir, puis la scène,
     * puis l'addition. Le fond est retiré le temps de la première passe —
     * sinon un décor clair sert de source à lui tout seul, ce qui est
     * exactement le défaut qu'on vient de corriger.
     */
    /** Coupé au palier « secours » : c'est la passe la plus chère de la scène. */
    let bloomActif = true;
    /** Vrai tant que l'orbite bouge : on ne remonte la qualité qu'à l'arrêt. */
    let controlsBouge = false;

    const rendre = () => {
      const fond = scene.background;
      scene.background = null;
      if (bloomActif) {
        camera.layers.set(CALQUE_BLOOM);
        composerBloom.render();
        camera.layers.set(0);
      }
      scene.background = fond;
      composer.render();
    };

    /*
     * LA QUALITÉ ADAPTATIVE (`performance-3d-temps-reel` §5).
     *
     * Le plafond de densité de pixels existait déjà ; ce qui manquait, c'est
     * que rien ne REDESCEND quand ça rame. Le juge vit dans `core`, avec ses
     * témoins — hystérésis contre l'oscillation, et fenêtre d'échauffement
     * parce que les premières images mentent chez tout le monde.
     *
     * On ne lui donne QUE des mesures : jamais l'agent utilisateur, jamais le
     * modèle d'appareil. « Se juge sur le temps d'image mesuré. »
     */
    /*
     * QUI DIT QUE LA CAMÉRA BOUGE ? `OrbitControls` le sait, et il l'annonce.
     * Se fier au seul bouton de souris raterait la molette, le pincement et
     * l'amortissement — qui continue de bouger la caméra après le geste.
     */
    controls.addEventListener('start', () => { controlsBouge = true; });
    controls.addEventListener('end', () => { controlsBouge = false; });

    const juge = new JugeDeQualite();
    let palierApplique: Palier = juge.palier;
    const appliquerPalier = (p: Palier) => {
      const r = reglagesDe(p, window.devicePixelRatio);
      renderer.setPixelRatio(r.densite);
      // Le bloom passe par un composeur à part : on le coupe en cessant de le
      // rendre, pas en démontant la passe — la démonter obligerait à la
      // reconstruire, donc à recompiler des shaders au pire moment.
      bloomActif = r.bloom;
      renderer.shadowMap.enabled = r.ombres;
      // Une carte d'ombre déjà rendue reste affichée tant qu'on ne la
      // réactualise pas : il faut le dire aux matières.
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = (o as THREE.Mesh).material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => { if (mm) mm.needsUpdate = true; });
        }
      });
      palierApplique = p;
    };

    let raf = 0;
    let derniereImage = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      /*
       * LE TEMPS D'IMAGE SE MESURE ENTRE DEUX APPELS, pas autour du rendu.
       * Mesurer le seul `rendre()` raterait tout ce que le navigateur fait à
       * côté — composition, autres onglets, saisie — et c'est pourtant ce que
       * le visiteur ressent.
       */
      const t = performance.now();
      if (derniereImage > 0) {
        const p = juge.image(t - derniereImage, controlsBouge);
        if (p !== palierApplique) appliquerPalier(p);
      }
      derniereImage = t;
      // Léger scintillement (comme un vrai néon alimenté).
      const flicker = lit ? 1 + Math.sin(clock.getElapsedTime() * 7.3) * 0.012 : 0;
      (halo.material as THREE.MeshBasicMaterial).opacity = 0.34 * decor.haloMul * eclat * flicker;
      for (const l of spill) l.intensity = 0.35 * flicker;
      controls.update();
      rendre();
    };
    composerRef.current = () => {
      controls.update();
      rendre();
    };
    animate();

    const onResize = () => {
      const w = W();
      const h = H();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      composerBloom.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      // `setViewOffset` retient les dimensions qu'on lui a données : après un
      // redimensionnement, il faut les lui redonner, sinon le décalage se
      // calcule sur l'ancienne taille.
      poserCadrage();
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    // Expose l'état pour la vérification automatisée (tests navigateur).
    (el as unknown as { __ahns3d?: unknown }).__ahns3d = {
      tubeMeshes: tubeGroup.children.length,
      strokeCount: geometry.strokes.length,
      boardMeshes: boardGroup.children.length,
      tubeLengthM: geometry.tubeLengthM,
      billedTubeLengthM,
      geometryDeltaPct: billedTubeLengthM > 0
        ? ((geometry.tubeLengthM - billedTubeLengthM) / billedTubeLengthM) * 100
        : 0,
      /**
       * L'ÉCART DE LARGEUR ENTRE LE MANIFESTE ET LE RENDU (E14).
       *
       * `metrics.ts` additionne les avances de glyphes, une par une, telles que
       * `measure-font.cjs` les a relevées avec opentype.js. Le navigateur, lui,
       * applique GPOS et GSUB : il RAPPROCHE le « A » et le « V », il fond le
       * « f » et le « i » en une ligature. Les deux largeurs n'ont donc aucune
       * raison d'être égales.
       *
       * Ce n'est pas une curiosité : `widthCm` est une cote annoncée au client
       * et un palier de prix, quand `ink.w` est ce qu'il verra sur son mur.
       * Sans ces deux nombres côte à côte, l'écart ne se mesure pas — il se
       * suppose, et c'est ce qu'on a fait trop longtemps.
       *
       * `largeurAnnonceeCm` est nulle sur une plaque : sa largeur est saisie,
       * pas déduite d'un texte.
       */
      largeurAnnonceeCm: plate ? 0 : widthCm,
      largeurRendueCm: plate ? 0 : (geometry.ink?.w ?? geometry.widthPx) / geometry.pxPerCm,
      largeurDeltaPct: plate || !widthCm
        ? 0
        : (((geometry.ink?.w ?? geometry.widthPx) / geometry.pxPerCm - widthCm) / widthCm) * 100,
      powerAnchor: decor.powerAnchor,
      /** Le visuel d'impression du marchand est-il RÉELLEMENT peint (E18) ? */
      imprimeReel,
      /** Lettres boîtiers réellement extrudées, et contreformes percées (E05). */
      lettresBaties,
      trousBaties,
      /** Contours de glyphe reçus, et leur densité — pour comprendre un plantage
       *  d'extrusion au lieu de le régler au jugé. */
      glyphesContours: geometry.glyphOutlines.length,
      glyphesPoints: geometry.glyphOutlines.reduce((n, c) => n + c.length, 0),
      /**
       * LE PROFILÉ DU CAISSON, MESURÉ (E24) — `null` hors caisson.
       *
       * Les cotes viennent d'une `Box3` sur les maillages posés. Les recopier
       * depuis `bw`, `bh` et `boxD` reviendrait à contrôler l'arithmétique en
       * elle-même, et laisserait passer exactement la faute qu'on redoute :
       * une section extrudée bien dimensionnée et mal orientée.
       */
      profilCaisson: montantsPoses.length
        ? (() => {
            const cadre = new THREE.Box3();
            for (const m of montantsPoses) cadre.union(new THREE.Box3().setFromObject(m));
            const f = facePosee ? new THREE.Box3().setFromObject(facePosee) : null;
            // Le retour de parclose est la largeur transversale d'un montant
            // VERTICAL : plus haut que large, il ne peut pas être confondu.
            const vert = montantsPoses
              .map((m) => new THREE.Box3().setFromObject(m))
              .filter((b) => b.max.y - b.min.y > b.max.x - b.min.x);
            return {
              montants: montantsPoses.length,
              cadreLargeurM: cadre.max.x - cadre.min.x,
              cadreHauteurM: cadre.max.y - cadre.min.y,
              profondeurM: cadre.max.z - cadre.min.z,
              retourM: vert.length ? vert[0]!.max.x - vert[0]!.min.x : 0,
              faceLargeurM: f ? f.max.x - f.min.x : 0,
              faceHauteurM: f ? f.max.y - f.min.y : 0,
              faceZM: f ? f.max.z : 0,
            };
          })()
        : null,
      signWidthM: signW,
      signHeightM: signH,
      bloom: true,
      dims: dims.children.length,
      /** Le décor RÉELLEMENT rendu — il diffère du demandé quand une photo
       *  de boutique n'a pas pu être chargée. */
      decorId: decor.id,
      /*
       * LA MÉMOIRE DE THREE.JS — le défaut qui ne se voit qu'à la dixième
       * ouverture (`performance-3d-temps-reel` §6).
       *
       * Une scène ne se libère pas toute seule : chaque géométrie, chaque
       * matière, chaque texture demande son `dispose()`. Ici TOUT est
       * reconstruit à chaque frappe — une lettre, une couleur, une finition —
       * si bien qu'une libération oubliée laisse derrière elle des tubes, des
       * sphères et des textures de canvas. Au bout d'un moment le navigateur
       * perd le contexte WebGL et la vue devient NOIRE, sans message.
       *
       * La compétence donne le seul contrôle qui l'attrape : « ouvrir et
       * fermer la vue vingt fois, lire `renderer.info.memory` ; il doit
       * revenir à son point de départ. » Sans ces deux nombres exposés, ce
       * contrôle est impossible à écrire.
       */
      memoire: {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      /** Palier de qualité RÉELLEMENT appliqué — sans lui, un banc ne peut
       *  que constater que la scène tourne, jamais qu'elle s'est adaptée. */
      palier: palierApplique,
      /** Réglages RÉELLEMENT en vigueur — pour que le banc puisse constater au
       *  lieu de déduire. Trois séances de réglage à l'aveugle ont été perdues
       *  faute de pouvoir lire ces trois nombres. */
      exposure: renderer.toneMappingExposure,
      /** L'ÉCLAT reçu et l'opacité de halo qui en sort RÉELLEMENT (E10).
       *  Sans ces deux nombres, on ne peut que déduire qu'un bleu s'assombrit ;
       *  avec eux, on le constate — et c'est la même leçon que les trois
       *  réglages ci-dessus, payée trois séances. */
      eclat,
      haloOpacity: (halo.material as THREE.MeshBasicMaterial).opacity,
      /** Ce que le mur RENVOIE (E22) : son albédo, et la teinte normalisée qui
       *  filtre réellement le halo. */
      murHex: decor.murHex,
      haloHex: (halo.material as THREE.MeshBasicMaterial).color.getHex(),
      /** Les couleurs RÉELLEMENT posées sur les tubes, sans doublon, et le
       *  nombre de jeux de matières fabriqués. Depuis qu'un mot porte sa
       *  bobine, « la 3D est-elle de la bonne couleur ? » n'a plus de réponse
       *  à une seule valeur : un banc doit pouvoir lire la liste. */
      teintesDesTubes: [...jeux.keys()],
      /** `null` : pas de lettres rétroéclairées. Sinon, le mur les rend-il ? */
      aureoleRendue,
      /** L'homogénéité RÉELLEMENT peinte sur la face du caisson (E24), ou null
       *  quand le support n'est pas un caisson. Même raison que ci-dessus : on
       *  constate au lieu de déduire. */
      caisson: plate && 'box' === plate.kind
        ? homogeneiteCaisson(boxDepthCm, heightCm)
        : null,
      ambientLit: decor.ambientLit,
      envIntensity: scene.environmentIntensity,
      /** Sol à cette distance sous le centre de l'objet. */
      mountHeightM: decor.poseM,
      /** Hauteur du monde visible dans le cadre (m) — c'est elle qui dit si
       *  l'échelle est lisible : signHeightM / visibleHeightM doit différer
       *  nettement entre un néon de 30 cm et un de 150 cm. */
      visibleHeightM: () => visibleHeightM,
      vue: () => vueRef.current,
      cadrer: (v: 'objet' | 'piece') => {
        cadrer(v);
        rendre();
      },
      /**
       * CACHE L'ENSEIGNE ET NE LAISSE QUE LE LIEU.
       *
       * Sert à photographier une scène VIDE : `scripts/capturer-les-fonds-3d.mjs`
       * fabrique les fonds 2D des décors de lieu en prenant une image de leur
       * 3D, et un fond qui contiendrait déjà un néon en montrerait deux dès que
       * le client écrit son texte.
       *
       * La première version vidait simplement le champ de saisie. Elle ne
       * pouvait pas marcher : sans texte il n'y a rien à montrer, le composant
       * affiche « Rien à afficher » et la vue 3D ne s'ouvre pas. Il faut donc
       * une enseigne, et la cacher — d'où ce crochet, du côté où les groupes
       * sont accessibles.
       *
       * Les quatre groupes couvrent tout ce qui appartient à l'enseigne : les
       * tubes, le support, les cotes, et la lumière qu'elle jette sur le mur.
       */
      masquerLEnseigne: (masquer: boolean) => {
        tubeGroup.visible = !masquer;
        boardGroup.visible = !masquer;
        dims.visible = !masquer;
        for (const l of spill) l.visible = !masquer;
        for (const a of accessoiresDuNeon) a.visible = !masquer;
        controls.update();
        rendre();
      },
      /** Rend une image immédiatement (utile quand rAF est suspendu : onglet
       *  caché, capture, contrôle qualité). */
      renderOnce: () => {
        controls.update();
        rendre();
      },
      /** Positionne la caméra (azimut/élévation en degrés) puis rend. */
      orbit: (azDeg: number, polDeg: number) => {
        const radius = camera.position.distanceTo(controls.target);
        const az = (azDeg * Math.PI) / 180;
        const pol = ((90 - polDeg) * Math.PI) / 180;
        camera.position.set(
          controls.target.x + radius * Math.sin(pol) * Math.sin(az),
          controls.target.y + radius * Math.cos(pol),
          controls.target.z + radius * Math.sin(pol) * Math.cos(az),
        );
        camera.lookAt(controls.target);
        controls.update();
        rendre();
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      composer.dispose();
      composerBloom.dispose();
      melange.dispose();
      envRT.dispose();
      // La carte HDR peut arriver APRÈS le démontage : le drapeau évite qu'un
      // téléchargement en vol ne rende une cible sur un générateur déjà libéré.
      hdriAbandonnee = true;
      envHdrRT?.dispose();
      pmrem.dispose();
      decor.dispose();
      glowTex.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const m = (o as THREE.Mesh).material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => mm && mm.dispose());
        }
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // `plate` manquait : la scène gardait la première plaque vue, et un panneau
  // s'affichait avec l'étiquette « Caisson lumineux » du passage précédent.
  // On dépend de son CONTENU, pas de l'objet — il est recréé à chaque rendu.
  }, [
    geometry, supportType, finish, glowHex, (couleursTraits ?? []).join('|'), boxDepthCm, widthCm, heightCm, billedTubeLengthM, lit, eclat,
    // Le décor change le mur, le sol, l'ambiance ET l'environnement réfléchi :
    // il ne se remplace pas à chaud, il rebâtit la scène.
    decorId, decorImage,
    plate?.kind, plate?.depthCm, plate?.materialCss, plate?.faces, plate?.printed, JSON.stringify(plate?.channelLetters),
  ]);

  return (
    <div className="three-wrap" style={{ position: 'absolute', inset: 0 }}>
      <div ref={mountRef} data-testid="three-view" style={{ position: 'absolute', inset: 0 }} />
      {/* Deux groupes DISTINCTS et jamais superposés : l'information de
          fabrication à gauche, les commandes de vue à droite. Auparavant tout
          était dans un seul bandeau qui s'entremêlait. */}
      <div className="hud hud--info" data-testid="three-spec">
        <b>{Math.round(widthCm)} × {Math.round(heightCm)} cm</b>
        {/* Détails techniques masqués sur petit écran (place limitée). */}
        <i className="hud__txt" />
        <span className="hud__txt">Ø {Math.round(tubeDiametreCm * 10)} mm</span>
        <i className="hud__txt" />
        <span className="hud__txt">
          {supportType === 'box'
            ? `${t('Caisson')} ${Math.round(boxDepthCm)} cm`
            : `${t('Support')} ${SPEC.boardThicknessCm * 10} mm`}
        </span>
      </div>
      {null !== avisAureole && (
        /* `lettres-boitiers` §4 : « la scénographie 3D doit PRÉVENIR quand le
           décor choisi tue le halo ». Un client qui commande du rétroéclairé
           pour un mur de brique doit l'apprendre avant de payer, pas à la pose.
           La part renvoyée est donnée : elle se vérifie, contrairement à un
           avis sans chiffre. */
        <div className="hud hud--avis" data-testid="three-avis-aureole">
          {t('Sur ce mur, l’auréole ne se verra pas')} — {avisAureole} %
        </div>
      )}
      <div className="hud hud--views">
        <span className="hud__label">{t('Vue')}</span>
        {([
          { label: t('Face'), az: 0, pol: 0 },
          { label: '3/4', az: 32, pol: 12 },
          { label: t('Profil'), az: 68, pol: 6 },
        ] as const).map((view) => (
          <button
            key={view.label}
            onClick={() => {
              const api = (mountRef.current as unknown as { __ahns3d?: { orbit?: (a: number, p: number) => void } } | null)?.__ahns3d;
              api?.orbit?.(view.az, view.pol);
            }}
          >
            {view.label}
          </button>
        ))}
        {/*
            LA VUE QUI DIT LA TAILLE.

            Les trois boutons ci-dessus changent l'ANGLE, à distance constante :
            ils ne renseignent pas sur l'encombrement. Celui-ci change la
            DISTANCE, jusqu'à faire entrer le sol et le meuble dans le cadre -
            c'est là, et seulement là, qu'un néon de 30 cm cesse de ressembler
            à un néon de 150 cm.

            Il ne peut pas être le réglage par défaut : à cette distance, un
            « Merci » de 22 cm occupe un dixième de l'image, et on ne règle pas
            une police sur un dixième d'image.
        */}
        <button
          className={'piece' === vue ? 'on' : ''}
          data-testid="three-piece"
          onClick={() => {
            const v = 'piece' === vue ? 'objet' : 'piece';
            vueRef.current = v;
            setVue(v);
            cadrerRef.current?.(v);
          }}
        >
          {t('Pièce')}
        </button>
        <button className={`hud__sep${showDims ? ' on' : ''}`} onClick={() => setShowDims((s) => !s)}>
          {t('Cotes')}
        </button>
      </div>
    </div>
  );
}
