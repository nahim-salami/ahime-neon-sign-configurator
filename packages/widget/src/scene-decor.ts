/**
 * LES DÉCORS EN VOLUME — le fond de la 2D, devenu une pièce.
 *
 * En 2D, le client choisit un décor : un mur sombre de studio, un mur de
 * brique, une chambre au crépuscule, le mur crème d'un salon. En 3D, il n'en
 * recevait aucun : la scène était un aplat de couleur devant un plan de plâtre
 * gris. Il choisissait son mur, basculait, et son mur disparaissait.
 *
 * Ce module construit le décor choisi EN VOLUME, aux dimensions réelles :
 *
 *   — un MUR à sa vraie hauteur, avec sa matière. Trois d'entre elles portent
 *     un MODULE RÉEL et sont donc des règles graduées : la brique de parement
 *     (215 × 65 mm), le papier millimétré (carreau de 1 cm) et le panneau
 *     perforé (trous au pas de 25 mm). Devant l'un d'eux, le client n'a plus
 *     à croire la cote écrite : il peut compter ;
 *   — un SOL à 1,50 m sous le centre de l'objet — la hauteur d'accrochage des
 *     galeries et des poseurs d'enseigne, celle qui met le centre de la pièce
 *     à hauteur d'œil ;
 *   — une PLINTHE, et le plus souvent un MEUBLE À TAILLE CONNUE (buffet à
 *     76 cm, bureau à 74 cm, comptoir à 110 cm, établi à 90 cm, allège de
 *     vitrine à 60 cm). C'est lui qui donne l'échelle : sans objet familier
 *     dans le cadre, un néon de 30 cm et un néon de 150 cm font la même image.
 *
 * Un décor est une DONNÉE, pas du code : une palette, une matière de mur, un
 * sol, une liste de meubles et une lumière dominante. C'est ce qui permet d'en
 * ajouter un douzième sans ajouter une douzième branche.
 *
 * Et l'ENVIRONNEMENT RÉFLÉCHI vient du décor lui-même, plus du studio de
 * démonstration de three.js : ce que le miroir renvoie est enfin la pièce
 * qu'on voit.
 *
 * Rien n'est téléchargé. Tout est dessiné au canvas ou fait de boîtes — le
 * mur de plâtre d'origine montrait la voie, on la suit. Le seul décor qui
 * coûte des octets est la photo que la boutique fournit elle-même.
 */
import * as THREE from 'three';
/*
 * LES DEUX CHARGEURS NE SONT PAS IMPORTÉS ICI — ET C'EST MESURÉ.
 *
 * `GLTFLoader.js` pèse 112 Ko de source à lui seul, et il traînait dans le lot
 * de la vue 3D chez TOUS les visiteurs qui l'ouvrent — y compris ceux dont le
 * décor ne contient aucun objet. `RGBELoader` est minuscule, mais il tire la
 * même logique de chargement.
 *
 * La compétence `performance-3d-temps-reel` §8 fixe le lot 2 à **800 Ko** ; il
 * en pesait 1 192 avant ce changement, soit 49 % au-dessus. Le budget existait,
 * personne ne le mesurait.
 *
 * Les deux fonctions qui s'en servent sont DÉJÀ asynchrones et rendent `null`
 * en cas d'échec : le chargeur peut donc voyager avec le fichier qu'il lit,
 * sans changer une ligne de leurs appelants. C'est la même règle que pour les
 * cartes HDR elles-mêmes (E21) — ce qui n'est pas demandé ne se télécharge pas.
 */

/** Hauteur d'accrochage : centre de l'objet à 1,50 m du sol. */
export const MOUNT_HEIGHT_M = 1.5;

/** Dimensions de la pièce (m). Assez grandes pour qu'aucune arête n'entre
 *  dans le cadre, assez petites pour rester une pièce et non un hangar. */
const WALL_W = 7;
const WALL_H = 3.2;
const FLOOR_W = 8;
const FLOOR_D = 5;

export interface DecorOptions {
  /** Z du plan de mur (m) — le décor pose son mur juste derrière. */
  wallZ: number;
  /** Néon allumé : la pièce s'assombrit, comme le soir. */
  lit: boolean;
  /** Image de scène fournie par la boutique, le cas échéant. */
  image?: string;
  /** Appelé quand l'image de la boutique est arrivée — la vue redessine. */
  onImageLoaded?: () => void;
}

export interface Decor {
  /** L'identifiant réellement rendu — il diffère de celui demandé quand une
   *  photo de boutique n'a pas pu être chargée et qu'on est retombé sur un
   *  décor du livre. */
  id: string;
  /** Tout le décor, à ajouter à la scène. */
  group: THREE.Group;
  /** Fond de la scène, au-delà de la pièce. */
  backgroundHex: number;
  /** Teinte et force de la lumière d'ambiance propre au décor. */
  ambientHex: number;
  ambientLit: number;
  ambientOff: number;
  /** Exposition de la prise de vue — voir `Palette.exposure`. */
  exposure: number;
  /** Direction de prise de vue imposée par le décor, le cas échéant. */
  dirVue: readonly [number, number, number] | null;
  /** Hauteur de pose réellement appliquée (m) — le banc la lit plutôt que de
   *  supposer la valeur par défaut, qui n'est plus vraie partout. */
  poseM: number;
  /** Ce décor n'a ni plancher ni plinthe (une façade à cinquante mètres du
   *  trottoir). La vue « pièce » n'a alors rien à faire entrer dans le cadre. */
  sansSol: boolean;
  /** Recale le bâtiment pour que son toit affleure sous l'enseigne. Sans
   *  effet sur les décors qui n'ont pas de tour. */
  poserSousLEnseigne(basDeLEnseigne: number): void;
  /** Champ minimal à cadrer (m) — voir `Palette.champMinM`. */
  champMinM: number;
  /** Force du halo peint sur ce mur — voir `Palette.haloMul`. */
  haloMul: number;
  /**
   * ALBÉDO DU MUR — ce qu'il RENVOIE, et dans quelle couleur (E22).
   *
   * Le halo peint représente la lumière du néon réfléchie par le mur. Or une
   * lumière réfléchie est le produit, canal par canal, de la lumière incidente
   * et de la réflectance de la surface : un mur de brique éclairé en vert ne
   * renvoie pas du vert, il ne renvoie presque rien — la brique n'a pas de
   * réflectance dans le vert.
   *
   * C'est ce que le halo ignorait : il portait la couleur du tube, plate,
   * identique sur du plâtre blanc et sur de la brique sombre.
   *
   * On expose donc l'albédo que le rendu emploie DÉJÀ pour peindre le mur.
   * Aucune table de réflectances n'est inventée : la seule source honnête de ce
   * que le mur renvoie est le mur qu'on dessine.
   */
  murHex: number;
  /**
   * Carte d'environnement HDR de ce décor, ou `null` (E21).
   *
   * `undefined` tant qu'elle n'est pas arrivée : l'environnement procédural
   * tient la place, et la scène n'a jamais de trame sans reflets.
   */
  hdri: string | null;
  /** Charge la carte et la rend, ou `null`. À appeler par la vue, qui seule
   *  possède le générateur PMREM. */
  chargerHdri(): Promise<THREE.DataTexture | null>;
  /** Point où repose l'alimentation : plateau d'un meuble, sol ou derrière
   *  l'enseigne sur une façade sans sol. Coordonnées monde, en mètres. */
  powerAnchor: [number, number, number];
  /** Petite scène de couleurs plates dont on tire la carte d'environnement.
   *  Même quand le mur porte la photo d'une boutique, les reflets viennent
   *  d'ici : voir le commentaire du chargement d'image. */
  envScene: THREE.Scene;
  dispose(): void;
}

/* -------------------------------------------------------------------------- */
/* Palettes — elles suivent les dégradés CSS de `catalog.ts`, pour que les     */
/* deux vues montrent le même lieu.                                            */
/* -------------------------------------------------------------------------- */

interface Palette {
  background: number;
  wall: number;
  floor: number;
  plinth: number;
  ambient: number;
  /**
   * LUMIÈRE PROPRE DE LA PIÈCE, NÉON ALLUMÉ ET NÉON ÉTEINT.
   *
   * Deux valeurs et non un multiplicateur : les deux modes n'ont aucune raison
   * d'être liés. Un multiplicateur unique obligeait à choisir entre une
   * chambre lisible le soir et une chambre surexposée le jour.
   *
   * `ambientLit` est le réglage qui compte. Tant que le bloom débordait sur
   * les murs, il les éclairait par accident et cette valeur pouvait rester
   * basse. Le bloom ne voyant plus que les sources, la pièce doit désormais
   * s'éclairer elle-même — sinon le néon flotte dans le noir, et le client ne
   * voit plus ni son mur, ni son sol, ni son meuble.
   *
   * ORDRE DE GRANDEUR, parce qu'il surprend : une lumière d'ambiance ressort
   * sur une surface diffuse à `intensité × albédo / π`. Le facteur π fait
   * qu'une valeur de 1 éclaire trois fois moins qu'on ne l'attend, et qu'il
   * faut passer à 4 ou 5 pour qu'un mur sombre se voie franchement. Trois
   * essais ont été perdus à monter ces nombres par petits pas avant de
   * retrouver ce π.
   */
  ambientLit: number;
  ambientOff: number;
  /**
   * EXPOSITION DE LA PRISE DE VUE.
   *
   * Un appareil photo expose pour la SCÈNE. Devant un mur crème en plein
   * jour, il ferme ; dans un studio sombre, il ouvre. Garder une exposition
   * unique pour les quatre décors revenait à photographier une pièce claire
   * au réglage d'une pièce noire : le mur crème sortait à rgb(255,255,255),
   * sans grain, sans rai de jour, et le néon avec lui.
   *
   * Le cœur du tube, lui, ne bouge pas : il est en `toneMapped: false`
   * (`three-view.tsx`), donc l'exposition ne l'atteint pas. Fermer
   * l'exposition assombrit la pièce ET FAIT RESSORTIR LE TUBE — ce qui est
   * exactement ce qu'on voit en photographiant une enseigne.
   */
  exposure: number;
  /**
   * FORCE DU HALO PEINT SUR CE MUR.
   *
   * Le halo du néon est peint sur le mur en fondu ADDITIF (`three-view.tsx`).
   * Son opacité était une constante — 0,34, quel que soit le lieu. Sur un mur
   * sombre, elle fait la lumière ; sur un mur crème déjà à 0,85, y ajouter 0,34
   * donne du blanc pur, et la pièce entière disparaît.
   *
   * Et c'est FAUX, pas seulement laid : un néon de quelques centaines de
   * lumens n'éclaire pas visiblement une pièce en plein jour. Il se voit la
   * nuit. Le multiplicateur dit donc simplement quelle part de la lumière du
   * lieu le néon représente.
   *
   * C'est une constante par décor, donc une approximation assumée : la phase 4
   * du plan (docs/27) la remplacera par un calcul à partir du flux réel, qui
   * la fera aussi croître avec la longueur de tube.
   */
  haloMul: number;
  /**
   * CARTE D'ENVIRONNEMENT HDR de ce lieu (E21), fichier de `ressources/hdri/`.
   *
   * Absente, l'environnement reste procédural — quelques plans de couleur plate
   * aux teintes de la pièce. Ce n'est pas un pis-aller : c'est un choix qui a
   * corrigé un vrai défaut, `RoomEnvironment` faisant renvoyer au miroir un
   * studio blanc qui n'existait nulle part.
   *
   * Une carte ne se déclare donc QUE si elle montre le même genre de lieu que
   * le décor. Une belle HDRI de studio dans un décor de salon de coiffure
   * rejouerait exactement le défaut qu'on a corrigé — en plus joli, et pour
   * 1,6 Mo.
   *
   * ── ET SEULEMENT APRÈS MESURE ─────────────────────────────────────────────
   *
   * Un seul décor en déclare une aujourd'hui, `dark`, et c'est le seul dont le
   * gain ait été mesuré : à caméra forcée et configuration identique, la
   * luminance moyenne de l'image passe de 22,715 à 29,738, soit **+31 %**, et le
   * maximum de 185 à 231 (docs/43 §41).
   *
   * Les six autres cartes du fonds attendent la même mesure, une par une. Ce
   * n'est pas de la prudence de principe : `environmentIntensity` vaut 1,15, et
   * ce nombre a été réglé pour l'environnement PROCÉDURAL. Une carte qui porte
   * une vraie énergie lumineuse déplace l'éclairage d'un décor qui, lui, a été
   * réglé à la main — `ambientLit` et `exposure` par lieu. Activer les sept d'un
   * coup, c'est déplacer sept réglages sans regarder aucun.
   *
   * La règle est celle de `seo-web-vitals` : jamais un gain sans chiffre avant
   * et après. Elle vaut ici pour l'image autant que pour le poids.
   */
  hdri?: string;
  /** Matière du mur. Trois d'entre elles portent un MODULE RÉEL, et sont donc
   *  des règles graduées : la brique (215 × 65 mm), le papier millimétré
   *  (carreau de 1 cm) et le panneau perforé (trous au pas de 25 mm). */
  mur?: 'platre' | 'brique' | 'millimetre' | 'perfore' | 'facade';
  /** `aucun` : ni sol ni plinthe. Une façade à cinquante mètres du sol n'a
   *  ni l'un ni l'autre, et lui en poser un mentirait sur où l'on est. */
  sol?: 'uni' | 'lattes' | 'aucun';
  meubles?: Meuble[];
  /**
   * CE QUI FAIT RECONNAÎTRE LE LIEU.
   *
   * Un mur et un meuble ne suffisent pas toujours. Un salon de coiffure sans
   * MIROIR n'est pas un salon de coiffure ; le hall d'une tour sans la ville
   * derrière sa baie n'est qu'un couloir. Ces éléments-là ne donnent pas
   * l'échelle — ils donnent le LIEU, et c'est ce que la peau promet.
   */
  elements?: Element[];
  /**
   * LE MUR EST UNE TOUR, ET NON UN PLAN.
   *
   * Un décor de façade posait jusqu'ici un plan très large couvert de la trame
   * d'une façade. Cadré à douze mètres, ce plan en montre onze travées de front
   * et sept étages : le client ne voit plus un bâtiment mais un damier de
   * fenêtres qui se répète, et le marchand l'a dit — « ça montre trop de tours ».
   *
   * Avec ceci, le mur devient un VOLUME de largeur finie : une tour, dont on
   * voit les côtés, et derrière laquelle il y a du ciel. C'est ce que la 2D
   * dessine depuis toujours (une tour au centre, deux silhouettes au fond) ;
   * la 3D montrait autre chose.
   *
   * La hauteur est volontairement très supérieure au champ : une tour dont on
   * verrait le pied ne serait plus une tour, et à cinquante mètres du trottoir
   * il n'y a rien à voir en bas.
   */
  tour?: {
    largeur: number;
    hauteur: number;
    profondeur: number;
    /** Hauteur (m, dans le repère de l'objet) du TOIT. C'est ce qui donne à la
     *  tour une fin : sans lui elle traverse le cadre de haut en bas et n'est
     *  plus un bâtiment mais un mur. La 2D fait de même — son immeuble s'arrête
     *  aux trois quarts de la scène, et le ciel commence. */
    sommet: number;
  };
  /**
   * Baie vitrée découpée dans le mur, et ce qu'on voit au travers.
   *
   * Le mur cesse alors d'être un plan : il se rend en quatre panneaux, autour
   * du trou. C'est ce qui permet à un hall de tour d'avoir une ville dehors.
   */
  baie?: { x: number; largeur: number; hauteur: number; centreY: number };
  /**
   * CHAMP MINIMAL À CADRER (m) — pour les décors qui ont leur propre échelle.
   *
   * Une pièce se cadre sur l'objet : c'est le meuble qui donne la mesure. Une
   * FAÇADE, non. À 49 cm d'enseigne, la caméra cadre 86 cm — et une façade
   * d'immeuble à ce zoom, c'est une seule fenêtre jaune en plein écran.
   *
   * Le décor impose donc son champ. Et la conséquence est VOULUE : sur une
   * tour, une enseigne de 49 cm est un point. C'est la vérité du produit, et
   * c'est précisément ce que cette scène doit apprendre à qui envisage une
   * enseigne de bâtiment.
   */
  champMinM?: number;
  /**
   * DIRECTION DE PRISE DE VUE PROPRE AU DÉCOR (x, y, z), depuis la cible.
   *
   * La vue par défaut est très légèrement plongeante : c'est juste pour une
   * enseigne accrochée à hauteur d'homme, qu'on regarde d'un peu au-dessus.
   * Elle ne l'est pas pour une enseigne posée sur un toit, qu'on regarde
   * forcément d'en bas. Un y négatif place l'appareil SOUS l'enseigne et lui
   * fait lever la tête.
   */
  vue?: readonly [number, number, number];
  /**
   * HAUTEUR DE POSE DE L'ENSEIGNE DANS CE LIEU (m au-dessus du sol).
   *
   * Le composant place TOUJOURS l'enseigne à l'origine, et c'est le décor qui
   * descend son sol sous elle. La valeur par défaut — 1,50 m — est celle d'une
   * enseigne de boutique, accrochée à hauteur d'œil ; elle est juste presque
   * partout.
   *
   * Elle ne l'est pas dans un accueil d'entreprise. Là, le logo est posé HAUT,
   * au-dessus de la banque et du feuillage, à un peu plus de deux mètres — sur
   * la photo de référence, il y a près d'un mètre de mur nu entre le plateau et
   * les lettres. À 1,50 m, l'enseigne se retrouvait tassée sur la jardinière,
   * et il fallait rogner le feuillage pour qu'elle respire : on corrigeait la
   * plante d'un défaut qui venait du mur.
   */
  poseM?: number;
  /** La lumière dominante du lieu — c'est elle que le miroir reflétera. */
  lumiere: { hex: number; genre: 'plafond' | 'baie' | 'lampe' };
}

type Element =
  /** Un miroir mural, avec son cadre. Il reflète l'environnement du décor —
   *  donc la pièce elle-même, depuis la phase 1. */
  | { type: 'miroir'; x: number; largeur: number; hauteur: number; centreY: number; cadre: number }
  /** Moulures : cimaise horizontale et couvre-joints verticaux, comme dans un
   *  salon ancien. Elles portent aussi une graduation utile — la cimaise est
   *  posée à 1 m du sol. */
  | { type: 'moulures'; couleur: number; pas: number }
  /** La ville derrière une baie : des tours, avec leurs fenêtres allumées. */
  | { type: 'tours' }
  /** Le ciel — une toile posée derrière tout, et rien d'autre. C'est ce que
   *  voit qui lève les yeux vers une enseigne de toiture. */
  | { type: 'ciel' }
  /** Une jardinière et ses feuilles dressées, derrière une banque d'accueil.
   *  C'est le détail qui fait reconnaître un accueil d'entreprise entre mille
   *  murs blancs — les deux photos de référence en ont une. */
  | { type: 'plantes'; x: number; largeur: number }
  /** Une cloison vitrée à montants, sur le côté : le hall d'un immeuble de
   *  bureaux, où l'on voit les salles à travers le verre dépoli. */
  | { type: 'cloison'; x: number; largeur: number; hauteur: number }
  /** Le poste d'accueil complet : la banque en L, ce qui est posé dessus, le
   *  fauteuil et le panneau de chêne. Voir la palette « accueil ». */
  | { type: 'poste-accueil' };

/**
 * UN MEUBLE DE DÉCOR : une boîte posée au sol, à sa hauteur réelle.
 *
 * C'est peu, et c'est voulu. Le meuble n'est pas là pour être regardé — il est
 * là pour être RECONNU, et donner sa taille à ce qui est accroché au-dessus.
 * Un buffet dessiné dans le détail attire l'œil ; un buffet suggéré à 78 cm
 * donne l'échelle et se tait.
 */
interface Meuble {
  /** Largeur, hauteur, profondeur (m). La hauteur est celle du meuble réel. */
  taille: [number, number, number];
  /** Centre en x (m) — 0 est sous le néon. */
  x: number;
  couleur: number;
  rugosite?: number;
  /** Plateau débordant : débord latéral, épaisseur, couleur. */
  plateau?: { debord: number; epaisseur: number; couleur: number };
  /** Une lampe posée dessus (chevet). */
  lampe?: boolean;
}

const PALETTES: Record<string, Palette> = {
  // --- les quatre livrés d'abord, réglages mesurés au banc -------------------

  // Studio : une lumière douce tombe du haut-gauche, le reste plonge.
  dark: {
    background: 0x0b0d11, wall: 0x2e323b, floor: 0x1a1d23, plinth: 0x393f4a,
    ambient: 0xffffff, ambientLit: 7, ambientOff: 10, exposure: 0.82, haloMul: 1, hdri: 'studio_small_09_1k.hdr',
    lumiere: { hex: 0xdfe6f2, genre: 'plafond' },
  },
  // Brique : la terre cuite RÉELLE ; c'est la pénombre qui l'assombrit, pas
  // un voile peint dessus comme en CSS.
  brick: {
    background: 0x120b09, wall: 0x7a4a3a, floor: 0x1d1512, plinth: 0x2a1f1a,
    ambient: 0xffd9c4, ambientLit: 3.3, ambientOff: 6, exposure: 0.74, haloMul: 0.95,
    mur: 'brique', lumiere: { hex: 0xffd9c4, genre: 'plafond' },
  },
  // Chambre au crépuscule : mur mauve, et la flaque chaude d'une lampe.
  room: {
    background: 0x171426, wall: 0x554a7d, floor: 0x2b2540, plinth: 0x6a5f95,
    // Chambre au crépuscule : la lumière est FAIBLE, c'est son propos. Remontée
    // avec les autres après la correction de l'environnement, elle est partie
    // à fond dans le bleu — rgb(91, 60, 245). La chaleur vient de la lampe,
    // qui est locale ; l'ambiance, elle, reste basse.
    ambient: 0xe4dcff, ambientLit: 5, ambientOff: 9, exposure: 0.8, haloMul: 0.3,
    lumiere: { hex: 0xffb877, genre: 'lampe' },
    // Table de chevet : 44 × 52 × 34 cm, à droite, avec sa lampe.
    meubles: [{ taille: [0.44, 0.52, 0.34], x: 0.95, couleur: 0x6a5443, lampe: true }],
  },
  // Salon : mur crème traversé d'un rai de jour, parquet de chêne clair.
  // Un mur crème est DÉJÀ clair : lui ajouter une ambiance forte le brûle.
  // Mesure à l'appui — la bordure sortait à rgb(255,255,255), c'est-à-dire
  // qu'il ne restait plus aucune matière à voir.
  /*
   * MAISON — le mur crème de Maison Lumière, son buffet et son parquet.
   *
   * Il s'est d'abord appelé « salon », par confusion avec la pièce à vivre. Or
   * il existe une peau « Le Salon », et c'est un SALON DE COIFFURE : deux lieux
   * qui n'ont rien à voir ne pouvaient pas partager un identifiant. Le mur
   * crème porte donc le nom de sa peau, `maison`, et `salon` est rendu à ce
   * qu'il désigne.
   */
  maison: {
    background: 0xd9d0be, wall: 0xece5d7, floor: 0xc7a97e, plinth: 0xf5f0e6,
    ambient: 0xfffdf7, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.46, haloMul: 0.16,
    sol: 'lattes', lumiere: { hex: 0xdfe7f2, genre: 'baie' },
    // Buffet : 155 × 76 × 42 cm, centré sous le néon — celui de la maquette 2D.
    meubles: [{
      taille: [1.55, 0.72, 0.42], x: 0, couleur: 0x6b4b33,
      plateau: { debord: 0.035, epaisseur: 0.04, couleur: 0x7a583d },
    }],
  },

  /*
   * SALON — un vrai salon de coiffure, et pas un mur rose.
   *
   * Rose poudré, laiton rose, moulures : les couleurs de sa maquette
   * (`prototypes/salon.html`). Et surtout un MIROIR, avec sa coiffeuse en
   * dessous — sans lui, la scène ne dit pas le métier. C'est le miroir qui
   * profite le plus du travail de la phase 1 : ce qu'il renvoie est la pièce
   * qu'on voit, et non le studio de démonstration de three.js.
   */
  salon: {
    background: 0xe8d6da, wall: 0xf7e7ea, floor: 0xd8c4b4, plinth: 0xfdf6f4,
    ambient: 0xfff4f6, ambientLit: 1.26, ambientOff: 2.4, exposure: 0.44, haloMul: 0.2,
    sol: 'lattes', lumiere: { hex: 0xffe8ee, genre: 'plafond' },
    elements: [
      { type: 'moulures', couleur: 0xfdf6f4, pas: 0.62 },
      // Miroir de coiffure : 75 × 105 cm, son bas à 62 cm du sol — la hauteur
      // d'une coiffeuse.
      { type: 'miroir', x: -0.98, largeur: 0.75, hauteur: 1.05, centreY: -0.35, cadre: 0.045 },
    ],
    meubles: [{
      taille: [0.92, 0.76, 0.42], x: -0.98, couleur: 0xc98ba4,
      plateau: { debord: 0.04, epaisseur: 0.04, couleur: 0xe3b9c8 },
    }],
  },

  // --- les huit suivants ----------------------------------------------------
  //
  // Chacun suit sa peau (`themes.ts`) et reprend les couleurs de sa maquette
  // (`prototypes/*.html`), pour que la 3D montre le lieu que la 2D promet.

  /*
   * BUREAU — celui que le marchand a nommé le premier, avec le miroir, la
   * table et la chambre. Il n'appartient à aucune peau : c'est un lieu, que
   * n'importe quelle boutique peut demander par son identifiant.
   */
  bureau: {
    background: 0x8f99a6, wall: 0x9aa4b1, floor: 0xb9a888, plinth: 0xe8ecf1,
    ambient: 0xffffff, ambientLit: 1.65, ambientOff: 3.3, exposure: 0.56, haloMul: 0.28,
    sol: 'lattes', lumiere: { hex: 0xdfe7f2, genre: 'baie' },
    // Plan de bureau : 74 cm, la hauteur normalisée. Tout le monde la connaît
    // sans savoir qu'il la connaît — c'est ce qui en fait un bon repère.
    meubles: [{
      taille: [1.4, 0.7, 0.62], x: 0, couleur: 0x6f6558,
      plateau: { debord: 0.04, epaisseur: 0.04, couleur: 0x9c8a6e },
    }],
  },

  /*
   * COMPTOIR — la caisse d'une belle boutique : feutrine verte et laiton.
   * Le comptoir monte à 110 cm, la hauteur d'un bar.
   */
  comptoir: {
    background: 0x0e1512, wall: 0x265240, floor: 0x1e2a22, plinth: 0x3f6b54,
    // La feutrine doit rester VERTE. Sous une ambiance franchement chaude et
    // le halo d'un tube rose, un vert sombre vire au brun : le Comptoir et le
    // Lobby devenaient deux pièces brunes indiscernables, ce que le banc a
    // signalé (écart de 6 sur 765). D'où un vert plus soutenu et une lumière
    // moins ambrée — le laiton reste dans la source du plafond.
    ambient: 0xdcf7ea, ambientLit: 9, ambientOff: 12, exposure: 0.78, haloMul: 0.4,
    lumiere: { hex: 0xffd9a0, genre: 'plafond' },
    meubles: [{
      taille: [1.8, 1.05, 0.55], x: 0, couleur: 0x2c3b31,
      plateau: { debord: 0.05, epaisseur: 0.05, couleur: 0x8a6a3c },
    }],
  },

  /*
   * ATELIER — on entre chez le fabricant. Le mur est un PANNEAU PERFORÉ, dont
   * les trous sont au pas de 25 mm : c'est une règle graduée, comme la brique.
   */
  atelier: {
    background: 0x2a231b, wall: 0xa8865c, floor: 0x4a4038, plinth: 0x6b563c,
    ambient: 0xfffaf2, ambientLit: 2.55, ambientOff: 5.7, exposure: 0.5, haloMul: 0.42,
    mur: 'perfore', lumiere: { hex: 0xffe9cc, genre: 'plafond' },
    // Établi : 90 cm, la hauteur de travail debout.
    meubles: [{
      taille: [1.7, 0.86, 0.6], x: 0, couleur: 0x8a5a33,
      plateau: { debord: 0.05, epaisseur: 0.05, couleur: 0x6d4526 },
    }],
  },

  /*
   * ÉTABLI — le plan de fabrication comme langage. Le mur est du PAPIER
   * MILLIMÉTRÉ au carreau de 1 cm : le décor le plus fin du catalogue pour
   * juger une taille, puisqu'on peut littéralement compter les carreaux.
   */
  etabli: {
    background: 0xe6e1d4, wall: 0xeeeeea, floor: 0xd4d4cf, plinth: 0xf8f8f5,
    ambient: 0xf7f9ff, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.33, haloMul: 0.16,
    mur: 'millimetre', lumiere: { hex: 0xeef2f8, genre: 'plafond' },
    meubles: [{
      taille: [1.5, 0.86, 0.6], x: 0, couleur: 0xb9b2a2,
      plateau: { debord: 0.04, epaisseur: 0.04, couleur: 0xd9d3c4 },
    }],
  },

  /*
   * VITRINE — plein jour derrière un vitrage. L'ALLÈGE, ce muret sous la
   * vitre, est à 60 cm : c'est elle qui donne l'échelle, et elle traverse
   * toute la largeur.
   */
  vitrine: {
    background: 0xdfe2ea, wall: 0xeceef4, floor: 0xc9ccd6, plinth: 0xf8f9fc,
    ambient: 0xffffff, ambientLit: 1.02, ambientOff: 2.04, exposure: 0.34, haloMul: 0.18,
    // Pas de blanc pur en source : même erreur que sur le mur crème, et même
    // résultat — une baie à 1,0 dans une pièce déjà claire brûle le mur.
    lumiere: { hex: 0xdfe7f2, genre: 'baie' },
    meubles: [{
      taille: [3, 0.56, 0.28], x: 0, couleur: 0xdcdfe7,
      plateau: { debord: 0.03, epaisseur: 0.04, couleur: 0xc8ccd6 },
    }],
  },

  /*
   * LOBBY — la fiche d'un professionnel : bois sombre et laiton. La banque
   * d'accueil monte à 110 cm, comme un comptoir.
   */
  lobby: {
    background: 0x1a120c, wall: 0x33261a, floor: 0x1d150f, plinth: 0x53412c,
    ambient: 0xffe0a8, ambientLit: 8.4, ambientOff: 11.4, exposure: 0.76, haloMul: 0.85,
    lumiere: { hex: 0xffd489, genre: 'plafond' },
    /*
     * PAS DE GRATTE-CIEL DANS UN HALL.
     *
     * La première version perçait le mur d'une baie et posait la ville
     * derrière. Le marchand a tranché, et il a raison sur les deux points :
     * une enseigne devant des tours n'est pas une enseigne de hall, c'est une
     * enseigne de FAÇADE — et une façade n'a pas de banque d'accueil.
     *
     * Les deux scènes existent donc séparément : ici le hall, avec ses meubles
     * et son bois ; et `gratte-ciel` pour la façade, sans meuble aucun.
     */
    meubles: [
      // Banque d'accueil, 110 cm.
      {
        taille: [2, 1.05, 0.6], x: -0.35, couleur: 0x2e2218,
        plateau: { debord: 0.07, epaisseur: 0.05, couleur: 0x8a6c4a },
      },
      // Et le bureau bas qui la prolonge : un hall en a toujours deux.
      {
        taille: [1.1, 0.74, 0.55], x: -1.85, couleur: 0x33261a,
        plateau: { debord: 0.05, epaisseur: 0.04, couleur: 0x7a5f40 },
      },
    ],
  },

  /*
   * NUIT — l'atelier de nuit et la story : la pénombre, le halo qui domine,
   * presque rien d'autre. Aucun meuble : c'est le propos de ces deux peaux,
   * et la plinthe suffit à poser le sol.
   */
  nuit: {
    background: 0x07080d, wall: 0x1a1b26, floor: 0x0e0f16, plinth: 0x252739,
    ambient: 0xa9b4ff, ambientLit: 10.2, ambientOff: 12.6, exposure: 0.84, haloMul: 1,
    lumiere: { hex: 0x8b5cf6, genre: 'plafond' },
  },

  /*
   * PAPIER — La Lettre. Le dépouillement : un mur, rien d'autre, et c'est le
   * propos. La plinthe est le seul repère, comme dans le studio sombre.
   */
  papier: {
    background: 0xeae3d4, wall: 0xf6f1e6, floor: 0xe0d9c9, plinth: 0xfbf8f2,
    ambient: 0xfffdf7, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.36, haloMul: 0.16,
    lumiere: { hex: 0xf2ece0, genre: 'plafond' },
  },

  /* ------------------------------------------------------------------------ */
  /* LES FAMILLES — trois lieux par peau                                       */
  /*                                                                           */
  /* La barre des fonds propose trois vignettes. Il n'y a aucune raison que la  */
  /* première suive la peau pendant que les deux autres restent des murs de     */
  /* studio : un configurateur de salon de coiffure propose trois salons, pas   */
  /* un salon plus deux fonds quelconques. Chaque peau porte donc sa famille    */
  /* (`themes.ts`), et le client change de lieu SANS sortir de l'univers.       */
  /* ------------------------------------------------------------------------ */

  // --- Le Salon : coiffure, barbier, institut -------------------------------

  /** Barbier : vert bouteille, laiton, cuir. Le miroir reste obligatoire. */
  barbier: {
    background: 0x121d18, wall: 0x27452f, floor: 0x2a2118, plinth: 0x3f6349,
    // Vert bouteille sous une ambiance CHAUDE = brun. Même piège que le
    // Comptoir, même correction : la lumière se refroidit, le laiton reste
    // dans la source du plafond.
    ambient: 0xdff5e4, ambientLit: 8.4, ambientOff: 11.4, exposure: 0.74, haloMul: 0.5,
    lumiere: { hex: 0xffd9a0, genre: 'plafond' },
    elements: [
      { type: 'moulures', couleur: 0x35543f, pas: 0.68 },
      { type: 'miroir', x: -0.98, largeur: 0.7, hauteur: 1, centreY: -0.36, cadre: 0.05 },
    ],
    meubles: [{
      taille: [0.95, 0.78, 0.44], x: -0.98, couleur: 0x3b2a1c,
      plateau: { debord: 0.04, epaisseur: 0.045, couleur: 0x8a6a3c },
    }],
  },

  /** Institut : blanc, marbre, lumière douce. Le contraire du barbier. */
  institut: {
    background: 0xe6e6e4, wall: 0xf4f3f0, floor: 0xdedcd6, plinth: 0xfbfaf8,
    ambient: 0xfdfdff, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.42, haloMul: 0.16,
    lumiere: { hex: 0xeef2f8, genre: 'plafond' },
    elements: [{ type: 'miroir', x: -0.95, largeur: 0.85, hauteur: 1.15, centreY: -0.3, cadre: 0.03 }],
    meubles: [{
      taille: [1.05, 0.74, 0.4], x: -0.95, couleur: 0xe8e6e1,
      plateau: { debord: 0.04, epaisseur: 0.035, couleur: 0xd7d4cd },
    }],
  },

  // --- Maison Lumière : mur crème, chambre, cuisine -------------------------

  /** Cuisine : crédence claire et plan de travail à 90 cm. */
  cuisine: {
    background: 0xdcd9cf, wall: 0xeceae2, floor: 0xc0a988, plinth: 0xf6f5f0,
    ambient: 0xfffdf6, ambientLit: 1.02, ambientOff: 1.98, exposure: 0.4, haloMul: 0.18,
    sol: 'lattes', lumiere: { hex: 0xdfe7f2, genre: 'baie' },
    meubles: [{
      // Plan de travail : 90 cm, la hauteur normalisée d'une cuisine.
      taille: [1.9, 0.86, 0.6], x: 0, couleur: 0x8d8579,
      plateau: { debord: 0.03, epaisseur: 0.04, couleur: 0x4a463f },
    }],
  },

  // --- Le Comptoir : caisse, bar, épicerie ----------------------------------

  /** Bar : bois sombre, laiton, lumière basse. */
  bar: {
    background: 0x140f0a, wall: 0x2b1f16, floor: 0x1a130d, plinth: 0x4a3722,
    ambient: 0xffdca6, ambientLit: 7.8, ambientOff: 10.8, exposure: 0.76, haloMul: 0.85,
    lumiere: { hex: 0xffc978, genre: 'plafond' },
    meubles: [{
      taille: [2.2, 1.08, 0.6], x: 0, couleur: 0x3a2a1c,
      plateau: { debord: 0.08, epaisseur: 0.055, couleur: 0x8a6a3c },
    }],
  },

  /** Épicerie : bois clair, étagères, lumière franche. */
  epicerie: {
    background: 0xd8c9ad, wall: 0xd9c7a6, floor: 0xa8895f, plinth: 0xefe4cd,
    ambient: 0xfff6e2, ambientLit: 2.4, ambientOff: 4.8, exposure: 0.5, haloMul: 0.3,
    sol: 'lattes', lumiere: { hex: 0xfff0d6, genre: 'plafond' },
    meubles: [
      {
        taille: [1.7, 0.95, 0.45], x: 0, couleur: 0x9c7a4f,
        plateau: { debord: 0.05, epaisseur: 0.045, couleur: 0xb99263 },
      },
    ],
  },

  // --- L'Atelier : panneau perforé, béton, planches -------------------------

  /** Béton brut : le mur d'un vrai atelier, avec son établi. */
  beton: {
    background: 0x24262a, wall: 0x6e7075, floor: 0x3b3d41, plinth: 0x55575c,
    ambient: 0xf4f6ff, ambientLit: 3, ambientOff: 6, exposure: 0.56, haloMul: 0.5,
    lumiere: { hex: 0xdfe6f2, genre: 'plafond' },
    meubles: [{
      taille: [1.7, 0.86, 0.6], x: 0, couleur: 0x6b5a45,
      plateau: { debord: 0.05, epaisseur: 0.05, couleur: 0x53412c },
    }],
  },

  /** Planches : mur de bois brut, cloué. */
  planches: {
    background: 0x2e2318, wall: 0x8a6a45, floor: 0x453629, plinth: 0x6b5335,
    ambient: 0xfff2dc, ambientLit: 2.55, ambientOff: 5.4, exposure: 0.52, haloMul: 0.45,
    lumiere: { hex: 0xffe9cc, genre: 'plafond' },
    elements: [{ type: 'moulures', couleur: 0x6b5335, pas: 0.34 }],
    meubles: [{
      taille: [1.6, 0.86, 0.58], x: 0, couleur: 0x7a5c3a,
      plateau: { debord: 0.05, epaisseur: 0.05, couleur: 0x5e452b },
    }],
  },

  // --- Établi : millimétré, calque, ardoise ---------------------------------

  /** Calque : le bleu du papier calque, et sa table à dessin. */
  calque: {
    background: 0xc9d4dc, wall: 0xdce6ec, floor: 0xb4bdc4, plinth: 0xeef4f8,
    ambient: 0xf2f8ff, ambientLit: 1.02, ambientOff: 1.98, exposure: 0.36, haloMul: 0.18,
    lumiere: { hex: 0xeef4ff, genre: 'plafond' },
    meubles: [{
      taille: [1.5, 0.86, 0.6], x: 0, couleur: 0x9aa6ae,
      plateau: { debord: 0.04, epaisseur: 0.04, couleur: 0xc3ced5 },
    }],
  },

  /** Ardoise : le tableau noir, mat et sans reflet. */
  ardoise: {
    background: 0x161a18, wall: 0x2b322f, floor: 0x1c211f, plinth: 0x4a5450,
    ambient: 0xeef4f0, ambientLit: 6.6, ambientOff: 9.6, exposure: 0.8, haloMul: 0.9,
    lumiere: { hex: 0xdfe6ea, genre: 'plafond' },
    meubles: [{
      taille: [1.5, 0.86, 0.55], x: 0, couleur: 0x4a443c,
      plateau: { debord: 0.04, epaisseur: 0.04, couleur: 0x6b6357 },
    }],
  },

  // --- Vitrine : plein jour, rue, podium ------------------------------------

  /** Rue : la vitrine ouverte sur l'extérieur, par une baie. */
  rue: {
    background: 0xbfcbd8, wall: 0xe4e7ee, floor: 0xc2c6cf, plinth: 0xf4f6fa,
    ambient: 0xffffff, ambientLit: 1.02, ambientOff: 1.98, exposure: 0.34, haloMul: 0.16,
    lumiere: { hex: 0xdfe7f2, genre: 'baie' },
    baie: { x: 1.9, largeur: 2.6, hauteur: 2.4, centreY: 0.05 },
    meubles: [{
      taille: [2.6, 0.56, 0.3], x: -0.7, couleur: 0xdcdfe7,
      plateau: { debord: 0.03, epaisseur: 0.04, couleur: 0xc8ccd6 },
    }],
  },

  /** Podium : le fond neutre d'une photo produit, et son socle. */
  podium: {
    background: 0xdadde2, wall: 0xe9ebef, floor: 0xd2d5da, plinth: 0xf2f4f7,
    ambient: 0xffffff, ambientLit: 1.02, ambientOff: 1.98, exposure: 0.36, haloMul: 0.2,
    lumiere: { hex: 0xffffff, genre: 'plafond' },
    meubles: [{
      taille: [1.5, 0.32, 0.7], x: 0, couleur: 0xdfe2e7,
      plateau: { debord: 0.03, epaisseur: 0.03, couleur: 0xccd0d6 },
    }],
  },

  // --- Le Lobby : hall de tour, réception, salle de conseil -----------------

  /** Réception : bois et marbre clair, sans baie. */
  reception: {
    background: 0x2b241c, wall: 0x584634, floor: 0x342a20, plinth: 0x7d6647,
    ambient: 0xffe6bd, ambientLit: 4.8, ambientOff: 7.8, exposure: 0.66, haloMul: 0.6,
    lumiere: { hex: 0xffd489, genre: 'plafond' },
    meubles: [{
      taille: [2.2, 1.05, 0.62], x: 0, couleur: 0x4a3a29,
      plateau: { debord: 0.08, epaisseur: 0.05, couleur: 0x9c9384 },
    }],
  },

  /** Salle de conseil : boiseries sombres et grande table. */
  conseil: {
    background: 0x1c1610, wall: 0x3c2f21, floor: 0x241d15, plinth: 0x604c33,
    ambient: 0xffe0a8, ambientLit: 7.2, ambientOff: 10.2, exposure: 0.74, haloMul: 0.8,
    lumiere: { hex: 0xffd489, genre: 'plafond' },
    elements: [{ type: 'moulures', couleur: 0x604c33, pas: 0.78 }],
    meubles: [{
      taille: [2.6, 0.74, 0.9], x: 0, couleur: 0x4a3826,
      plateau: { debord: 0.06, epaisseur: 0.045, couleur: 0x6f5638 },
    }],
  },

  // --- Atelier Nuit et Story : nuit, club, béton de nuit --------------------

  /** Club : la pénombre, mais traversée de violet et de cyan. */
  club: {
    background: 0x0a0714, wall: 0x241a3a, floor: 0x140f22, plinth: 0x3a2c5c,
    ambient: 0xb79cff, ambientLit: 9, ambientOff: 12, exposure: 0.84, haloMul: 1,
    lumiere: { hex: 0x22d3ee, genre: 'plafond' },
  },

  /** Béton de nuit : le même béton que l'atelier, la lumière en moins. */
  'beton-nuit': {
    background: 0x0e1013, wall: 0x33363c, floor: 0x191b1f, plinth: 0x44474e,
    ambient: 0xdfe6f2, ambientLit: 7.2, ambientOff: 10.2, exposure: 0.82, haloMul: 1,
    lumiere: { hex: 0xdfe6f2, genre: 'plafond' },
  },

  // --- La Lettre : papier, lin, plâtre --------------------------------------

  /*
   * ACCUEIL — la banque d'accueil d'un espace de travail.
   *
   * La peau Skyline offrait « Béton de nuit » et « Nuit » à côté de sa façade.
   * Ni l'un ni l'autre ne dit quoi que ce soit d'une enseigne d'entreprise : ce
   * sont des fonds d'atelier, empruntés à d'autres peaux. Le marchand a montré
   * ce qu'il attend — l'accueil d'un bureau, le logo repris derrière la banque,
   * là où un visiteur le lit de près. C'est le second usage réel du même logo,
   * après la façade.
   *
   * Le bois à gauche, la banque à 110 cm, la jardinière derrière : trois cotes
   * connues, donc trois graduations. Une banque d'accueil fait toujours 110 cm.
   */
  accueil: {
    background: 0xd9d7d2, wall: 0xefedea, floor: 0x3c3b3a, plinth: 0xf4f2ef,
    ambient: 0xfffaf2, ambientLit: 1.5, ambientOff: 2.4, exposure: 0.5, haloMul: 0.3,
    lumiere: { hex: 0xfff3e2, genre: 'plafond' },
    /*
     * TROIS MÈTRES QUARANTE DE CHAMP, SANS QUOI ON A LE NEZ SUR LA BANQUE.
     *
     * Une pièce se cadre d'ordinaire sur l'objet, et c'est juste : le meuble
     * voisin donne l'échelle. Ici le meuble fait 2,60 m de long — plus large
     * que le champ qu'une enseigne de 49 cm réclame. Mesuré sans cette valeur :
     * la banque remplissait les deux tiers de l'image et il ne restait ni le
     * bois, ni la jardinière, ni le sol. On ne reconnaissait pas un accueil, on
     * regardait un panneau blanc.
     *
     * Relevé à 4,80 m quand la banque est devenue un L : le retour vient vers
     * le visiteur, donc vers l'appareil, et à 3,40 m il barrait le bas de
     * l'image d'un mur blanc. Un accueil se photographie de loin.
     */
    champMinM: 5.2,
    /*
     * ET ON LE REGARDE D'UN PEU AU-DESSUS.
     *
     * Le plateau est à 1,10 m, l'appareil d'une personne debout à 1,60 : on
     * voit donc le DESSUS de la banque, ce qui est indispensable ici — c'est
     * là que sont le sous-main, le clavier, l'écran et les objets. À hauteur
     * d'enseigne, tout cela se réduisait à une tranche de deux pixels.
     */
    vue: [0.34, 0.3, 1],
    /* 2,15 m : la hauteur à laquelle un logo d'accueil est posé, et celle de la
       photo de référence. Elle laisse un mètre de mur nu entre le plateau de la
       banque et le bas des lettres — c'est ce vide qui fait qu'on les lit. */
    poseM: 2.15,
    /*
     * TOUT LE POSTE EST UN SEUL ÉLÉMENT, ET C'EST DÉLIBÉRÉ.
     *
     * La banque, le sous-main, le clavier, l'écran, le fauteuil et le panneau
     * de chêne se calent les uns sur les autres : le sous-main sur le plateau,
     * le clavier sur le sous-main, l'écran au bord. Les déclarer un par un
     * reviendrait à recopier la hauteur du plateau dans huit endroits, et à la
     * corriger dans huit endroits le jour où la banque change de hauteur.
     */
    elements: [
      { type: 'plantes', x: 0.35, largeur: 2.7 },
      { type: 'poste-accueil' },
    ],
  },

  /*
   * HALL — l'accueil d'un immeuble de bureaux.
   *
   * Le pendant sobre du précédent, et la première photo de référence : cloison
   * vitrée, moquette grise, étagère à dossiers, banque blanche. Rien de chaud,
   * rien de décoré — c'est un lieu de passage, et c'est justement le lieu où
   * une enseigne intérieure doit se lire sans aide.
   */
  'hall-bureaux': {
    background: 0xc7cad0, wall: 0xf0f1f2, floor: 0x4b4d51, plinth: 0xf6f7f8,
    ambient: 0xffffff, ambientLit: 1.6, ambientOff: 2.6, exposure: 0.5, haloMul: 0.28,
    lumiere: { hex: 0xf2f6fb, genre: 'plafond' },
    // Même raison qu'à l'accueil : la banque et la cloison ne tiennent pas
    // dans le champ d'une enseigne de 49 cm.
    champMinM: 3.4,
    meubles: [
      { taille: [2.2, 1.12, 0.58], x: 0.42, couleur: 0xf8f8f6, rugosite: 0.45,
        plateau: { debord: 0.06, epaisseur: 0.05, couleur: 0xeeece6 } },
      // L'étagère à dossiers, contre le mur — 1,90 m, une hauteur d'homme.
      { taille: [0.85, 1.9, 0.3], x: -1.45, couleur: 0xe2e0da, rugosite: 0.6 },
    ],
    elements: [{ type: 'cloison', x: -2.05, largeur: 1.4, hauteur: 2.45 }],
  },

  /*
   * GRATTE-CIEL — l'enseigne posée sur le bâtiment, et non devant lui.
   *
   * Le marchand l'a dit en deux mots : « le LED devrait être sur les
   * gratte-ciel, et quand il y a les gratte-ciel, pas de table ». Les deux
   * sont justes, et ils vont ensemble : une enseigne devant une ville est une
   * enseigne de FAÇADE, et une façade n'a ni banque d'accueil ni plancher.
   *
   * Le mur EST donc la tour, avec ses fenêtres au module réel — un étage de
   * 3 m, une trame de 1,35 m. C'est la seule graduation qui vaille à cette
   * échelle : personne ne sait juger un mètre sur un immeuble, tout le monde
   * sait qu'un étage fait trois mètres. Une enseigne haute comme un étage se
   * lit d'un coup d'œil.
   *
   * Et pas de sol : à cinquante mètres du trottoir, il n'y en a pas. Lui en
   * poser un mentirait sur l'endroit où l'on est.
   */
  'gratte-ciel': {
    // Le fond est le CIEL, et le ciel est de jour. Il ne se voit qu'aux bords
    // de la toile ; sa raison d'être est de ne jamais laisser un liseré d'une
    // autre couleur au ras du cadre.
    background: 0x6ea3d2, wall: 0xffffff, floor: 0x090c12, plinth: 0x090c12,
    /*
     * DE NUIT À PLEIN JOUR, ET CE N'EST PAS UN GOÛT.
     *
     * Une enseigne de bâtiment se VEND sur la photo de jour : c'est celle que
     * l'annonceur montre à son conseil, celle qui dit à quoi ressemble sa
     * façade dans la rue à midi. Le décor « Nuit » de la même peau reste là
     * pour l'autre moitié de la journée — le marchand a les deux dans sa barre
     * des fonds, et il n'y a jamais eu de raison qu'ils montrent tous les deux
     * la nuit.
     *
     * L'exposition monte donc, et l'ambiante avec : la scène n'a plus à faire
     * exister un mur dans le noir, elle a à ne pas brûler un ciel clair.
     */
    ambient: 0xdcebfb, ambientLit: 1.9, ambientOff: 2.6, exposure: 0.95, haloMul: 0.9,
    // Douze mètres de champ : quatre étages. En deçà, on regarde une fenêtre.
    champMinM: 12,
    /*
     * LA TOUR DU CLIENT, ET RIEN QU'ELLE.
     *
     * 5,4 m de front : quatre travées de mur-rideau, à peu près la moitié de
     * la largeur cadrée — la proportion du bâtiment de référence, dont on voit
     * l'angle et deux faces. 60 m de haut pour un champ de 12 : le pied est
     * hors cadre, ce qui est exactement ce qu'on voit d'une tour depuis le
     * trottoir d'en face. Autant de profondeur que de front, parce que c'est
     * l'ANGLE qui fait le bâtiment : une face seule est une affiche.
     *
     * `sommet` n'est ici qu'une valeur d'attente : la vue la recale sous
     * l'enseigne dès qu'elle en connaît la hauteur (voir `poserSousLEnseigne`).
     */
    tour: { largeur: 5.4, hauteur: 60, profondeur: 5.4, sommet: -0.2 },
    elements: [{ type: 'ciel' }],
    /*
     * LA CONTRE-PLONGÉE.
     *
     * On ne regarde pas une enseigne de toiture d'en face : on est en bas, elle
     * est en haut, et c'est ce qui donne à ces photos leurs lignes de fuite
     * verticales. La vue par défaut du composant est très légèrement plongeante
     * (bon pour une enseigne d'intérieur accrochée à hauteur d'œil) ; celle-ci
     * regarde vers le haut.
     */
    vue: [0.52, -0.30, 1],
    mur: 'facade', sol: 'aucun', lumiere: { hex: 0xeaf3ff, genre: 'plafond' },
  },

  /** Lin : la toile d'un beau papier, plus chaude que le blanc. */
  lin: {
    background: 0xe0d8c8, wall: 0xeee6d6, floor: 0xd4cab6, plinth: 0xf7f2e8,
    ambient: 0xfffaf0, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.36, haloMul: 0.16,
    lumiere: { hex: 0xf6efe2, genre: 'plafond' },
  },

  /** Plâtre : le mur nu, juste taloché. */
  platre: {
    background: 0xdedcd8, wall: 0xeeece8, floor: 0xcfccc6, plinth: 0xf6f5f2,
    ambient: 0xfdfdfb, ambientLit: 0.9, ambientOff: 1.8, exposure: 0.36, haloMul: 0.16,
    lumiere: { hex: 0xf2f2ee, genre: 'plafond' },
  },

};

/** Décor de repli quand l'identifiant est inconnu (ancienne version du widget,
 *  décor retiré du catalogue) : on montre un néon, jamais un cadre vide. */
const FALLBACK = 'dark';

export function paletteFor(id: string): Palette {
  return PALETTES[id] ?? PALETTES[FALLBACK]!;
}

/* -------------------------------------------------------------------------- */
/* Matières dessinées au canvas                                                */
/* -------------------------------------------------------------------------- */

/** Grain de plâtre — repris du mur d'origine, qui avait raison : sans relief,
 *  la lumière du néon semble peinte sur un aplat. */
function plasterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v},0.03)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/**
 * Brique en appareil à demi-brique, AU MODULE RÉEL.
 *
 * Une brique de parement fait 215 × 65 mm, le joint 10 mm : le module est donc
 * de 225 × 75 mm. La tuile dessinée ici couvre exactement DEUX modules en
 * largeur et DEUX assises en hauteur (0,45 × 0,15 m), ce qui est la période de
 * l'appareil : la rangée du bas est décalée d'une demi-brique, celle du haut
 * ne l'est pas, et la tuile se répète sans couture.
 *
 * Le module réel n'est pas un détail d'esthétique. C'est ce qui fait de ce mur
 * la seule RÈGLE GRADUÉE du catalogue : quel que soit le zoom, le client peut
 * compter les briques et savoir quelle taille il commande.
 */
export const BRICK_TILE_W = 0.45;
export const BRICK_TILE_H = 0.15;

function brickTexture(): THREE.CanvasTexture {
  const PX = 512; // 0,45 m → ~1,1 mm par pixel
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = Math.round((PX * BRICK_TILE_H) / BRICK_TILE_W);
  const ctx = c.getContext('2d')!;
  const k = PX / BRICK_TILE_W; // pixels par mètre
  const bw = 0.215 * k;
  const bh = 0.065 * k;
  const joint = 0.01 * k;
  // Le joint, d'abord : c'est le fond, les briques se posent dessus.
  ctx.fillStyle = '#6e6259';
  ctx.fillRect(0, 0, c.width, c.height);
  const poser = (x: number, y: number) => {
    // Chaque brique tire sa propre teinte : une terre cuite est tout sauf
    // uniforme, et un mur d'une seule couleur se voit immédiatement.
    const r = 150 + Math.random() * 40;
    const g = 88 + Math.random() * 26;
    const b = 70 + Math.random() * 22;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(x, y, bw, bh);
    // Arête basse plus sombre : c'est elle qui dessine l'ombre du joint.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + bh - joint * 0.6, bw, joint * 0.6);
  };
  // Assise du bas, alignée ; assise du haut, décalée d'une demi-brique.
  for (let i = -1; i <= 2; i++) poser(i * (bw + joint), c.height - bh);
  for (let i = -1; i <= 2; i++) poser(i * (bw + joint) - (bw + joint) / 2, c.height - 2 * bh - joint);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(WALL_W / BRICK_TILE_W, WALL_H / BRICK_TILE_H);
  return tex;
}

/** Parquet à lattes — le sol que la peau Maison dessine déjà en 2D. */
function plankTexture(): THREE.CanvasTexture {
  const PX = 512;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const ctx = c.getContext('2d')!;
  const k = PX / 1.0; // la tuile couvre 1 m
  ctx.fillStyle = '#c39f74';
  ctx.fillRect(0, 0, PX, PX);
  const plank = 0.14 * k;
  for (let i = 0; i * plank < PX; i++) {
    const y = i * plank;
    const v = 0.92 + Math.random() * 0.16;
    ctx.fillStyle = `rgba(196,161,116,${v * 0.5})`;
    ctx.fillRect(0, y, PX, plank - 1);
    ctx.fillStyle = 'rgba(70,48,28,0.35)';
    ctx.fillRect(0, y + plank - 2, PX, 2);
    // Joint de bout, décalé d'une latte à l'autre.
    const bout = ((i * 0.37) % 1) * PX;
    ctx.fillRect(bout, y, 2, plank);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(FLOOR_W, FLOOR_D);
  return tex;
}

/**
 * Papier millimétré — le mur de la peau Établi.
 *
 * Carreau de 1 cm, trait renforcé tous les 5 cm : la trame normalisée, celle
 * qu'on a tous eue sous les yeux à l'école. C'est le décor le plus précis du
 * catalogue pour juger une taille, puisqu'on peut littéralement COMPTER LES
 * CARREAUX derrière l'enseigne. Une brique donne l'ordre de grandeur ; un
 * carreau de 1 cm donne la cote.
 */
function graphTexture(): THREE.CanvasTexture {
  const TUILE = 0.1; // la tuile couvre 10 cm, soit dix carreaux
  const PX = 400; // 0,25 mm par pixel
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, PX, PX);
  const pas = PX / 10;
  for (let i = 0; i <= 10; i++) {
    // Le trait des 5 cm est plus épais et plus soutenu, comme sur le vrai
    // papier — c'est lui qui permet de compter sans se perdre.
    const fort = 0 === i % 5;
    ctx.strokeStyle = fort ? 'rgba(46,90,140,0.55)' : 'rgba(46,90,140,0.26)';
    ctx.lineWidth = fort ? 2.4 : 1;
    ctx.beginPath();
    ctx.moveTo(i * pas, 0);
    ctx.lineTo(i * pas, PX);
    ctx.moveTo(0, i * pas);
    ctx.lineTo(PX, i * pas);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(WALL_W / TUILE, WALL_H / TUILE);
  return tex;
}

/**
 * FAÇADE DE TOUR — le mur sur lequel une enseigne de bâtiment se pose.
 *
 * Un étage de bureaux fait 3 m de haut ; une trame de façade, 1,35 m. La tuile
 * dessinée ici couvre exactement UN ÉTAGE sur DEUX TRAMES, soit 2,70 × 3,00 m.
 *
 * Comme la brique, le papier millimétré et le panneau perforé, c'est un module
 * RÉEL — donc une graduation. Et c'est la seule qui vaille à cette échelle :
 * devant une façade, personne ne sait juger un mètre, mais tout le monde sait
 * qu'un étage fait trois mètres. C'est ce qui permet de comprendre qu'une
 * enseigne de 3 m est haute comme un étage.
 */
/*
 * LA TUILE COUVRE QUATRE TRAVÉES SUR QUATRE ÉTAGES, ET C'EST UNE CORRECTION.
 *
 * Elle n'en couvrait qu'UNE SUR DEUX — deux fenêtres. Le tirage au sort des
 * fenêtres allumées se faisait donc sur ces deux-là, une fois pour toutes, et
 * la tuile se répétait ensuite à l'identique sur toute la façade : le hasard
 * ne produisait pas une ville de nuit mais un DAMIER RÉGULIER, et un tirage
 * sur quatre donnait un immeuble dont chaque fenêtre était allumée. Sur un mur
 * de trente mètres cela se remarquait à peine ; sur une tour de cinq mètres de
 * front, cela saute aux yeux.
 *
 * Seize fenêtres tirées séparément, et la tuile fait exactement la largeur de
 * la tour et la hauteur du champ cadré : en frontal, on ne voit jamais deux
 * fois le même motif.
 *
 * LE MODULE RÉEL EST INTACT, et c'est lui qui compte : la travée fait toujours
 * 1,35 m et l'étage 3 m. C'est la graduation de ce décor — devant une façade,
 * personne ne sait juger un mètre, mais tout le monde sait qu'un étage fait
 * trois mètres.
 */
const FACADE_TRAVEE_W = 1.35;
export const FACADE_TRAME_W = FACADE_TRAVEE_W * 4;
export const FACADE_ETAGE_H = 12;
const FACADE_ETAGE_UN = 3;

/*
 * CE N'EST PLUS UNE FAÇADE PERCÉE, C'EST UN MUR-RIDEAU.
 *
 * La première version dessinait des fenêtres découpées dans un mur plein, et
 * en allumait une sur trois. C'est la façade d'un immeuble de bureaux des
 * années soixante-dix ; ce n'est pas celle sur laquelle on pose une enseigne
 * de marque aujourd'hui. Le bâtiment de référence — celui que le marchand a
 * montré — est un MUR-RIDEAU : des panneaux de verre jointifs, tenus par une
 * grille de meneaux clairs, qui réfléchit le ciel plutôt que de montrer des
 * bureaux.
 *
 * Ce que cela change, et qui n'est pas cosmétique : le verre RÉFLÉCHIT. Le
 * matériau qui porte cette texture est donc métallique et lisse, et c'est la
 * carte d'environnement — donc le ciel — qui fait la moitié de l'image. Une
 * fenêtre peinte ne réagit pas à l'heure ; un panneau de verre, si.
 *
 * LE MODULE RESTE RÉEL, et c'est lui qui compte : le panneau fait une travée
 * de 1,35 m et un étage de 3 m. C'est la graduation de ce décor — devant une
 * façade, personne ne sait juger un mètre, mais tout le monde sait qu'un étage
 * fait trois mètres.
 */
function facadeTexture(nuit: boolean): THREE.CanvasTexture {
  const PX = 512;
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = Math.round((PX * FACADE_ETAGE_H) / FACADE_TRAME_W);
  const ctx = c.getContext('2d')!;
  const k = PX / FACADE_TRAME_W;
  const MENEAU = 0.06; // 6 cm de profilé entre deux panneaux : la cote réelle
  ctx.fillStyle = nuit ? '#39434f' : '#aebdd0';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let etage = 0; etage < 4; etage++) {
    for (let t = 0; t < 4; t++) {
      const x = (t * FACADE_TRAVEE_W + MENEAU / 2) * k;
      const y = (etage * FACADE_ETAGE_UN + MENEAU / 2) * k;
      const w = (FACADE_TRAVEE_W - MENEAU) * k;
      const h = (FACADE_ETAGE_UN - MENEAU) * k;
      /*
       * CHAQUE PANNEAU EST UN PEU DIFFÉRENT DE SON VOISIN, et c'est ce détail
       * qui fait un bâtiment plutôt qu'un quadrillage. Sur un vrai mur-rideau,
       * deux vitrages jointifs ne renvoient jamais exactement la même chose :
       * la pose n'est pas au dixième de degré, et le verre trempé bombe très
       * légèrement. On tire donc une nuance par panneau, dans une fourchette
       * étroite — assez pour que l'œil voie du verre, pas assez pour que la
       * façade devienne un patchwork.
       */
      const n = 0.9 + Math.random() * 0.2;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      const teinte = (l: number, a = 1) => (nuit
        ? `rgba(${Math.round(28 * n * l)},${Math.round(38 * n * l)},${Math.round(54 * n * l)},${a})`
        : `rgba(${Math.round(108 * n * l)},${Math.round(140 * n * l)},${Math.round(178 * n * l)},${a})`);
      // Le haut du panneau prend le ciel, le bas prend le sol : c'est ce
      // dégradé-là qui se lit sur toutes les tours de verre.
      g.addColorStop(0, teinte(1.18));
      g.addColorStop(0.55, teinte(0.92));
      g.addColorStop(1, teinte(0.72));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      // Le reflet en biais, en haut du panneau — une bande claire, très douce.
      ctx.fillStyle = nuit ? 'rgba(180,205,240,.05)' : 'rgba(255,255,255,.09)';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.34);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h * 0.16);
      ctx.lineTo(x, y + h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(WALL_W / FACADE_TRAME_W, WALL_H / FACADE_ETAGE_H);
  return tex;
}

/**
 * LE CIEL DE CRÉPUSCULE DE LA PEAU SKYLINE.
 *
 * Exactement le dégradé de la 2D — « #2c3f66 → #4a4a72 à 45 % → #a06a56 à
 * 78 % → #c98a5e », et ses étoiles dans le haut. Le reprendre à l'identique
 * n'est pas de la coquetterie : les deux vues montrent LE MÊME LIEU, et un
 * banc le vérifie en comparant leurs teintes (scripts/verifier-les-decors.mjs).
 *
 * ET SURTOUT, IL N'EST PAS MARQUÉ « NON TONE-MAPPÉ ». La vue 3D reconnaît une
 * source de lumière à cela — voir `emetDeLaLumiere` dans three-view.tsx — et
 * un ciel classé source passerait dans le halo du bloom : toute l'image se
 * mettrait à luire, et l'enseigne, qui est la vraie source, n'aurait plus rien
 * de remarquable. Le ciel est donc une surface ordinaire, éclairée par
 * personne, qui traverse l'exposition comme le reste.
 */
export const CIEL_JOUR = [
  [0, '#2f6fb5'],
  [0.42, '#5d97cf'],
  [0.72, '#9dc2e2'],
  [1, '#d9e7f2'],
  // (voir styles.ts : la 2D peint exactement ces quatre arrêts)
] as const;

function skyTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [stop, couleur] of CIEL_JOUR) g.addColorStop(stop, couleur);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  /*
   * LES NUAGES, ET POURQUOI ILS SONT DES TACHES FLOUES.
   *
   * Un nuage dessiné avec un contour est un nuage de dessin animé ; ce qu'on
   * veut ici est ce que voit un objectif : des masses claires aux bords
   * indistincts, plus denses en bas qu'en haut. Un dégradé radial dont
   * l'opacité tombe à zéro donne exactement cela, et quelques-uns qui se
   * recouvrent font une masse. Ils restent PÂLES : le sujet est l'enseigne, et
   * un ciel qui attire l'œil est un ciel raté.
   */
  /*
   * ILS SONT PETITS ET NOMBREUX, ET C'EST VOULU. La voûte fait 260 m de rayon
   * et l'appareil n'en voit qu'une bande étroite : trois gros nuages avaient
   * toutes les chances d'être hors champ, ou de couvrir le ciel entier. Une
   * quinzaine de petits, répartis sur toute la hauteur, garantit qu'il y en a
   * dans le cadre quel que soit l'angle — y compris quand le client fait
   * tourner la scène.
   */
  const nuages: Array<[number, number, number, number]> = [
    // x, y, rayon, opacité — en fractions de la toile
    [0.08, 0.3, 0.042, 0.62], [0.14, 0.325, 0.03, 0.5], [0.03, 0.345, 0.027, 0.4],
    [0.26, 0.27, 0.036, 0.55], [0.31, 0.295, 0.027, 0.42],
    [0.45, 0.35, 0.045, 0.58], [0.52, 0.375, 0.03, 0.45],
    [0.66, 0.29, 0.039, 0.5], [0.72, 0.315, 0.027, 0.38],
    [0.86, 0.34, 0.042, 0.46], [0.93, 0.36, 0.03, 0.35],
    [0.19, 0.44, 0.036, 0.34], [0.38, 0.47, 0.042, 0.3], [0.59, 0.45, 0.033, 0.28],
    [0.78, 0.48, 0.039, 0.26], [0.1, 0.53, 0.033, 0.24], [0.48, 0.55, 0.036, 0.22],
  ];
  /*
   * ILS SONT DESSINÉS QUATRE FOIS ET DEMIE TROP LARGES, ET C'EST EXPRÈS.
   *
   * L'image fait trois fois le tour de la voûte (voir plus bas) : tout ce
   * qu'on y dessine ressort donc COMPRIMÉ au tiers en largeur. Des nuages
   * ronds donnaient des œufs debout — mesuré à l'œil sur la première capture,
   * et impossible à comprendre sans savoir d'où vient la compression. On les
   * dessine donc étirés de trois, plus un facteur une fois et demie parce
   * qu'un nuage est plus large que haut.
   */
  const ETIREMENT = 4.5;
  for (const [x, y, r, a] of nuages) {
    ctx.save();
    ctx.translate(x * W, y * H);
    ctx.scale(ETIREMENT, 1);
    const n = ctx.createRadialGradient(0, 0, 0, 0, 0, r * W);
    n.addColorStop(0, `rgba(255,255,255,${a})`);
    n.addColorStop(0.5, `rgba(255,255,255,${a * 0.42})`);
    n.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = n;
    ctx.beginPath();
    ctx.arc(0, 0, r * W, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  /*
   * LA TOILE FAIT LE TOUR DE LA VOÛTE TROIS FOIS, ET C'EST CE QUI REND LES
   * NUAGES VISIBLES.
   *
   * Une sphère étale sa texture sur 360°. L'appareil, lui, en voit une
   * TRENTAINE : soit un douzième de la largeur de l'image, une bande étroite
   * dans laquelle il n'y avait, la plupart du temps, aucun nuage. On les a
   * cherchés longtemps du côté de leur opacité alors qu'ils étaient simplement
   * hors champ, derrière l'observateur.
   *
   * En répétant trois fois, la bande visible couvre un tiers de l'image et en
   * contient toujours plusieurs. La répétition ne se voit pas : il faudrait
   * faire un tour complet sur soi-même, et l'orbite ne le permet pas.
   */
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * CHÊNE CLAIR — le panneau mural d'un accueil d'entreprise.
 *
 * Un aplat de couleur ne fait pas du bois : ce qui le fait, c'est le FIL, et
 * le fait qu'il soit vertical sur un panneau mural. La tuile couvre une lame
 * de 40 cm sur 2 m — les cotes d'un panneau de placage — et ses veines sont
 * calculées, pas tirées au sort : le banc des décors compare des images entre
 * deux exécutions, un `Math.random` y ferait varier la scène sans raison.
 */
const BOIS_LAME_W = 0.4;
const BOIS_LAME_H = 2;

function woodTexture(): THREE.CanvasTexture {
  const PX = 256;
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = Math.round((PX * BOIS_LAME_H) / BOIS_LAME_W);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, PX, 0);
  g.addColorStop(0, '#d9bb8e');
  g.addColorStop(0.5, '#cfae7d');
  g.addColorStop(1, '#c3a06d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX, c.height);
  // Les veines : des courbes molles, plus serrées vers les bords de la lame.
  for (let i = 0; i < 34; i++) {
    const x = ((i * 61) % 100) / 100 * PX;
    const largeur = 0.6 + ((i * 37) % 7) * 0.35;
    const teinte = ((i * 29) % 5) - 2;
    ctx.strokeStyle = `rgba(${118 + teinte * 6},${86 + teinte * 5},${48 + teinte * 4},${0.1 + ((i * 13) % 6) * 0.026})`;
    ctx.lineWidth = largeur;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + (((i * 17) % 9) - 4) * 2.2, c.height * 0.33,
      x + (((i * 23) % 9) - 4) * 2.6, c.height * 0.66,
      x + (((i * 41) % 7) - 3) * 1.8, c.height,
    );
    ctx.stroke();
  }
  // Le joint entre deux lames, sur le bord droit de la tuile.
  ctx.fillStyle = 'rgba(90,64,34,.35)';
  ctx.fillRect(PX - 2, 0, 2, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Panneau perforé — le mur de la peau Atelier.
 *
 * Trous de 6 mm au pas de 25 mm : le standard, celui des panneaux d'outillage.
 * Comme la brique et le papier millimétré, c'est un module réel, donc une
 * graduation : quatre trous font dix centimètres.
 */
function pegboardTexture(): THREE.CanvasTexture {
  const TUILE = 0.1; // quatre trous par tuile
  const PX = 256;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c9a06c';
  ctx.fillRect(0, 0, PX, PX);
  const pas = PX / 4;
  const r = (0.006 / TUILE) * PX * 0.5;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = (i + 0.5) * pas;
      const y = (j + 0.5) * pas;
      // Le trou, puis son ombre haute : sans elle, le panneau est une grille
      // de points peints et non une tôle percée.
      ctx.fillStyle = '#3a2c1c';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,215,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y + 1, r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(WALL_W / TUILE, WALL_H / TUILE);
  return tex;
}

/* -------------------------------------------------------------------------- */
/* Environnement réfléchi                                                      */
/* -------------------------------------------------------------------------- */

/**
 * La petite scène dont on tire la carte d'environnement.
 *
 * Elle est faite de couleurs plates (aucune lumière n'y est nécessaire) :
 * une boîte aux couleurs du décor, vue de l'intérieur, plus un ou deux
 * panneaux clairs qui tiennent lieu de sources. C'est la même construction
 * que `RoomEnvironment` de three.js — à ceci près qu'elle porte les couleurs
 * DU décor affiché, et pas celles d'un studio blanc générique.
 *
 * Le miroir cesse ainsi de refléter un lieu qui n'existe nulle part.
 */
function environmentScene(id: string): THREE.Scene {
  const p = paletteFor(id);
  const s = new THREE.Scene();
  const plat = (hex: number) => new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide });

  /*
   * UNE PIÈCE NE RENVOIE PAS TOUTE SA LUMIÈRE.
   *
   * La boîte d'environnement portait la couleur du mur TELLE QUELLE. Sur un
   * décor sombre, sans conséquence. Sur un mur presque blanc, la pièce
   * s'éclairait ELLE-MÊME : l'environnement fournissait la quasi-totalité de
   * la lumière du mur, qui saturait quoi qu'on fasse de l'exposition.
   *
   * Mesuré en coupant l'environnement sur l'Institut : le mur passait de
   * rgb(248, 6, 8) à rgb(31, 0, 2) — trente fois moins. Trois séances de
   * réglage à l'aveugle sont passées à côté, parce qu'on cherchait du côté de
   * l'exposition et de l'ambiance, jamais du côté du miroir aux alouettes.
   *
   * Un mur réel renvoie 60 à 80 % de ce qu'il reçoit, et ce qu'il reçoit n'est
   * pas son propre albédo. Le facteur ci-dessous coupe la boucle : la boîte
   * n'est plus le mur, elle est CE QUE LE MUR RENVOIE.
   */
  const RENVOI = 0.35;
  const attenue = (hex: number) => new THREE.Color(hex).multiplyScalar(RENVOI).getHex();

  /*
   * DEHORS, IL N'Y A PAS DE PIÈCE À REFLÉTER.
   *
   * Cette fonction fabrique la « pièce » que les surfaces brillantes renvoient :
   * une boîte aux couleurs du décor, avec ses sources. C'est juste pour un mur,
   * une plaque, un tube — tous sont dans une pièce.
   *
   * Un MUR-RIDEAU ne l'est pas. Ce qu'il renvoie est le ciel : clair en haut,
   * plus pâle vers l'horizon, sombre vers le bas où il n'y a que la ville. Lui
   * donner la boîte d'intérieur donnait une tour NOIRE — mesuré, et visible du
   * premier coup d'œil : un monolithe sombre sur un ciel bleu, alors que la
   * référence est un bâtiment qui MIROITE. Le verre ne s'éclaire pas, il
   * reflète ; si on ne lui donne rien à refléter, il est noir.
   */
  if (p.tour) {
    const dehors = new THREE.Scene();
    // La voûte : le ciel, vu de dedans.
    dehors.add(new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), plat(0x86b0d8)));
    // La nappe du haut — le ciel zénithal, franchement plus clair : c'est elle
    // qui allume l'arête du bâtiment.
    const haut = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xdcecfb }));
    haut.rotation.x = Math.PI / 2;
    haut.position.y = 2.9;
    dehors.add(haut);
    // Et le bas, sourd : sous l'horizon il n'y a pas de ciel. Sans lui, le
    // vitrage renvoie du bleu jusqu'en bas et le bâtiment perd son assise.
    const bas = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0x2b3644 }));
    bas.rotation.x = -Math.PI / 2;
    bas.position.y = -2.9;
    dehors.add(bas);
    return dehors;
  }

  // La pièce, vue de l'intérieur.
  const box = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), plat(attenue(p.wall)));
  s.add(box);
  // Le sol, plus sombre que les murs — sinon les reflets rasants sont faux.
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: attenue(p.floor) }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = -1.99;
  s.add(sol);

  // Les sources. Ce sont elles qui font les reflets nets sur une plaque
  // brillante ; sans elles, le miroir est un aplat sans vie.
  const source = (hex: number, w: number, h: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    s.add(m);
  };
  /*
   * La source dominante, telle que la palette la déclare. Trois genres
   * suffisent à couvrir le catalogue, et ce sont les trois qu'on rencontre :
   * une nappe au plafond, une baie sur le côté, une lampe basse. Les décrire
   * par leur GENRE plutôt que par des coordonnées évite qu'un douzième décor
   * demande une douzième branche.
   */
  const l = p.lumiere;
  if ('baie' === l.genre) {
    source(l.hex, 1.6, 2.2, [-3.9, 0.2, 0.6], [0, Math.PI / 2, 0]);
    source(attenue(p.wall), 5, 5, [0, 1.98, 0], [Math.PI / 2, 0, 0]);
  } else if ('lampe' === l.genre) {
    source(l.hex, 0.6, 0.6, [1.6, -1.1, 1.2], [0, -0.6, 0]);
    source(attenue(p.wall), 5, 5, [0, 1.98, 0], [Math.PI / 2, 0, 0]);
  } else {
    source(l.hex, 2.4, 2.4, [-1.2, 1.98, 0.4], [Math.PI / 2, 0, 0]);
  }
  return s;
}

/* -------------------------------------------------------------------------- */
/* Construction du décor                                                       */
/* -------------------------------------------------------------------------- */

/**
 * LES MODÈLES QU'ON N'A PAS DESSINÉS.
 *
 * Tout le reste de ce fichier construit ses volumes à la main, et c'est le bon
 * choix : une banque d'accueil est une boîte, un panneau de bois est une boîte,
 * et une boîte ne coûte rien. Une PLANTE, non. Un feuillage n'a pas de forme
 * qu'on puisse écrire ; toutes les tentatives donnent des lames de carton, et
 * c'est ce que le marchand a vu tout de suite.
 *
 * D'où ce chargeur, et les trois règles qui vont avec :
 *
 *   1. LE FICHIER N'EST PAS DANS LE BUNDLE. `vite.embed.config.ts` intègre en
 *      base64 tout ce qu'on lui donne à importer : un modèle importé
 *      normalement serait téléchargé par TOUS les visiteurs d'une boutique, y
 *      compris ceux qui n'ouvrent jamais la 3D. Il est donc servi comme un
 *      fichier à part et demandé à l'exécution.
 *
 *   2. L'ADRESSE SE DÉDUIT DE CELLE DU MODULE. `import.meta.url` désigne le
 *      morceau de code en train de tourner ; les modèles sont posés à côté de
 *      lui par `scripts/build-site.py`. Le même code marche donc sur le site et
 *      chez un marchand, sans qu'aucun des deux ait une URL à régler.
 *
 *   3. UN ÉCHEC NE CASSE RIEN. Réseau coupé, fichier absent, WebGL fatigué :
 *      la promesse retombe sur `null` et l'appelant garde ce qu'il avait
 *      dessiné. Un décor qui dépend d'un téléchargement pour s'afficher est un
 *      décor qui s'affichera vide un jour, chez quelqu'un, sans prévenir.
 *
 * Pas de cache entre deux constructions, et c'est volontaire : le décor libère
 * tout ce qu'il contient à sa fermeture (`dispose`), et une géométrie partagée
 * avec un cache serait libérée sous les pieds de la scène suivante. Le cache
 * HTTP du navigateur fait déjà le travail, lui, et sans ce risque.
 */
function chargerModele(nom: string): Promise<THREE.Group | null> {
  /*
   * L'ADRESSE SE FABRIQUE À LA MAIN, ET IL Y A UNE RAISON.
   *
   * Écrit « new URL(`./objets/${nom}`, import.meta.url) » — la forme qu'on
   * trouve partout — le résultat est un fichier introuvable. Vite RECONNAÎT ce
   * motif et le remplace à la construction par une table des fichiers trouvés
   * sur le disque ; comme les modèles n'y sont pas (ils sont recopiés APRÈS,
   * par scripts/build-site.py, et volontairement pas empaquetés), la table sort
   * vide et l'adresse vaut `undefined`. Aucun message : juste un modèle qui ne
   * se charge jamais.
   *
   * Découper la chaîne soi-même ne ressemble à aucun motif : rien n'est
   * réécrit, et l'adresse est bien celle du morceau de code en train de
   * tourner, donc celle du dossier où le modèle a été recopié.
   */
  let url: string;
  try {
    const ici = import.meta.url;
    url = ici.slice(0, ici.lastIndexOf('/') + 1) + 'objets/' + nom;
  } catch {
    return Promise.resolve(null);
  }
  return import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new Promise<THREE.Group | null>((resolve) => {
      try {
        new GLTFLoader().load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          () => resolve(null),
        );
      } catch {
        resolve(null);
      }
    }))
    // Un décor sans objet ne doit jamais faire tomber la scène : l'échec du
    // chargeur se traite exactement comme l'échec du fichier.
    .catch(() => null);
}

/**
 * CHARGE UNE CARTE D'ENVIRONNEMENT HDR, À LA DEMANDE (E21).
 *
 * Même règle que les modèles ci-dessus, et pour la même raison chiffrée : ces
 * fichiers pèsent 1,5 à 1,7 Mo pièce, 11,3 Mo pour les sept. Empaquetés, ils
 * partiraient chez TOUS les visiteurs d'une boutique, y compris ceux qui
 * n'ouvrent jamais la 3D. Le dépôt a déjà payé cette leçon — « le pack n° 14 en
 * a publié 11,1 Mo que personne ne demandait jamais » (`build-site.py`), soit
 * très exactement le poids de ce dossier.
 *
 * Servie comme fichier, une carte n'est demandée que par le décor qui la nomme,
 * et le cache du navigateur la garde ensuite.
 *
 * Droits vérifiés au manifeste : Poly Haven, CC0, `diffusable: true`, aucune
 * attribution requise, usage commercial libre.
 */
function chargerHdri(nom: string): Promise<THREE.DataTexture | null> {
  let url: string;
  try {
    const ici = import.meta.url;
    url = ici.slice(0, ici.lastIndexOf('/') + 1) + 'objets/' + nom;
  } catch {
    return Promise.resolve(null);
  }
  return import('three/examples/jsm/loaders/RGBELoader.js')
    .then(({ RGBELoader }) => new Promise<THREE.DataTexture | null>((resolve) => {
      try {
        new RGBELoader().load(url, (tex) => resolve(tex), undefined, () => resolve(null));
      } catch {
        resolve(null);
      }
    }))
    .catch(() => null);
}

/** Met un modèle à la taille voulue et le pose sur le sol du décor : les
 *  bibliothèques n'ont ni échelle ni origine commune, et un modèle posé tel
 *  quel arrive soit minuscule, soit à moitié enterré. */
function poserAuSol(modele: THREE.Object3D, hauteurM: number, x: number, y: number, z: number): void {
  /* LES MATRICES D'ABORD. `Box3.setFromObject` lit les matrices MONDE des
     maillages ; sur un objet qui n'a pas encore été ajouté à une scène, elles
     datent du chargement. Mesuré sans cette ligne : des plantes de plusieurs
     mètres, parce que la boîte englobante rendue était celle du modèle brut et
     non celle du modèle une fois mis à l'échelle. */
  modele.updateMatrixWorld(true);
  const boite = new THREE.Box3().setFromObject(modele);
  const taille = new THREE.Vector3();
  boite.getSize(taille);
  if (taille.y > 0.0001) {
    /* ON MULTIPLIE, ON NE FIXE PAS. `setScalar` écrase l'échelle : appliqué à
       un objet DÉJÀ mis à l'échelle — ce qui est le cas de tous les clones,
       puisqu'ils héritent de celle de leur modèle — il annulait le travail
       précédent et rendait la plante à sa taille d'origine, plusieurs mètres.
       Le facteur se calcule sur la taille MESURÉE, donc actuelle ; il faut
       donc le composer avec l'échelle en place, pas la remplacer. */
    const k = hauteurM / taille.y;
    modele.scale.multiplyScalar(k);
    modele.updateMatrixWorld(true);
    boite.setFromObject(modele);
  }
  const centre = new THREE.Vector3();
  boite.getCenter(centre);
  modele.position.set(x - centre.x, y - boite.min.y, z - centre.z);
}

export function buildDecor(idDemande: string, o: DecorOptions): Decor {
  const jetables: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();

  /*
   * UNE PHOTO DE BOUTIQUE NE DEVIENT JAMAIS UNE TEXTURE SANS CORS.
   *
   * La toile 3D est lue par `captureNeonPng` (aperçu de commande, contrôle
   * qualité) via `preserveDrawingBuffer`. Une image d'un autre domaine servie
   * sans en-tête CORS SOUILLE la toile : la capture lève une exception, et la
   * commande part sans aperçu. On demande donc explicitement `anonymous` — si
   * le serveur de la boutique ne répond pas, l'image n'arrive pas, et on reste
   * sur le décor du livre. Un fond moins joli vaut mieux qu'une commande
   * amputée de son aperçu.
   */
  const id = PALETTES[idDemande] ? idDemande : FALLBACK;
  const p = paletteFor(id);

  /*
   * UN DÉCOR À GRANDE ÉCHELLE A BESOIN D'UN GRAND MUR.
   *
   * Sept mètres suffisent à une pièce, dont on ne voit jamais plus de deux.
   * Une façade cadrée à douze mètres, elle, laisse voir le bord du mur et le
   * vide noir derrière — ce qui se remarque immédiatement.
   */
  let murW = Math.max(WALL_W, (p.champMinM ?? 0) * 2.6);
  let murH = Math.max(WALL_H, (p.champMinM ?? 0) * 1.9);
  /* Sauf quand le mur est une TOUR : là, ses cotes sont celles du bâtiment, et
     c'est justement de ne PAS s'étendre qui en fait un bâtiment. Elles servent
     aussi à la trame : la texture de façade se répète en fonction de murW et
     murH quelques lignes plus bas, donc trois travées sur vingt étages. */
  if (p.tour) {
    murW = p.tour.largeur;
    murH = p.tour.hauteur;
  }

  // ----- le mur -------------------------------------------------------------
  /*
   * Trois murs sur quatre portent une texture À MODULE RÉEL, et ce n'est pas
   * décoratif : la brique, le carreau de 1 cm et le trou au pas de 25 mm sont
   * des GRADUATIONS. Devant l'un d'eux, le client n'a plus à croire la cote
   * écrite — il peut compter.
   */
  /*
   * LE SOL DE CE DÉCOR — voir `Palette.poseM`. Tout ce qui est posé par terre
   * s'y rapporte : le plancher, la plinthe, les meubles, les éléments. Une
   * seule constante à lire, donc, et un seul endroit à corriger le jour où un
   * lieu pose son enseigne plus haut ou plus bas.
   */
  const SOL = -(p.poseM ?? MOUNT_HEIGHT_M);

  const matiereMur = p.mur ?? 'platre';
  let murMat: THREE.Material;
  if ('platre' === matiereMur) {
    const tex = plasterTexture();
    jetables.push(tex);
    murMat = new THREE.MeshPhysicalMaterial({
      color: p.wall,
      roughnessMap: tex,
      roughness: 1,
      metalness: 0,
      specularIntensity: 0,
      bumpMap: tex,
      bumpScale: 0.35,
      envMapIntensity: 0.2,
    });
  } else {
    const tex = 'brique' === matiereMur
      ? brickTexture()
      : 'millimetre' === matiereMur ? graphTexture()
        /* EN VARIANTE DE JOUR — le décor « Gratte-ciel » est passé au plein
           jour, et la variante de nuit de cette texture dessinait un verre
           presque noir : c'était elle, et pas les réflexions, qui donnait un
           monolithe sombre. La variante de nuit reste écrite : la peau a un
           décor « Nuit » qui l'attend le jour où il portera lui aussi une
           tour. */
        : 'facade' === matiereMur ? facadeTexture(false) : pegboardTexture();
    tex.repeat.set(tex.repeat.x * (murW / WALL_W), tex.repeat.y * (murH / WALL_H));
    /*
     * FILTRAGE ANISOTROPE — contre le moiré des surfaces vues de biais.
     *
     * Une trame fine regardée en oblique — les meneaux d'un mur-rideau, les
     * joints d'une brique — se réduit à moins d'un pixel de large : le rendu
     * échantillonne alors au hasard dans la texture et produit des vagues qui
     * ondulent quand la caméra bouge. Le filtrage anisotrope prend plusieurs
     * échantillons le long de la direction écrasée ; c'est exactement le
     * remède, et il ne coûte presque rien sur des murs.
     *
     * Huit est un plafond demandé, pas garanti : le pilote ramène au maximum
     * qu'il sait faire, souvent 16, parfois 2. Aucun appareil n'échoue là-dessus.
     */
    tex.anisotropy = 8;
    jetables.push(tex);
    /*
     * LE VERRE N'EST PAS UN MUR, ET NE PEUT PAS PARTAGER SES RÉGLAGES.
     *
     * Brique, papier et tôle sont des surfaces MATES : rugosité au plafond,
     * aucun métal, presque pas d'environnement. Un mur-rideau est l'exact
     * contraire — c'est une surface spéculaire dont la moitié de l'image vient
     * du ciel qu'elle renvoie. Avec les réglages du mur, la tour sortait plate
     * et grise, exactement ce qu'on cherchait à quitter.
     *
     * Le relief part aussi : la texture dessine des meneaux en clair, et les
     * prendre pour une carte de relief creusait les joints comme des rainures.
     * Un mur-rideau est lisse ; c'est un plan de verre, pas une maçonnerie.
     */
    const verre = 'facade' === matiereMur;
    murMat = new THREE.MeshPhysicalMaterial({
      map: tex,
      // Le papier millimétré est PLAT : lui donner du relief ferait des traits
      // en creux, ce qu'aucun papier ne fait. La brique et la tôle perforée,
      // elles, ont bien un relief.
      bumpMap: 'millimetre' === matiereMur || verre ? null : tex,
      bumpScale: 'brique' === matiereMur ? 1.2 : 0.5,
      roughness: verre ? 0.09 : 'millimetre' === matiereMur ? 0.88 : 0.95,
      metalness: verre ? 0.72 : 0,
      specularIntensity: verre ? 1 : 0.15,
      envMapIntensity: verre ? 1.5 : 0.2,
    });
  }
  /*
   * LE MUR, ET LE TROU QU'IL PEUT AVOIR.
   *
   * Sans baie, c'est un plan. Avec, il se rend en QUATRE PANNEAUX autour du
   * trou — gauche, droite, dessus, dessous. C'est ce qui permet à un hall de
   * tour d'avoir une ville dehors, et à une vitrine d'avoir une rue.
   *
   * Le mur monte du sol : son centre est donc à mi-hauteur de la pièce, pas à
   * hauteur de l'objet.
   */
  const murZ = o.wallZ - 0.08;
  const basMur = SOL;
  /* La tour et son couronnement, retenus pour pouvoir être RECALÉS plus tard :
     leur hauteur dépend de celle de l'enseigne, que le décor ne connaît pas
     encore quand il se construit. Voir `poserSousLEnseigne` plus bas. */
  let tourMobile: { corps: THREE.Mesh; acrotere: THREE.Mesh; sommet: number } | null = null;
  const panneau = (larg: number, haut: number, cx: number, cy: number) => {
    if (larg <= 0.001 || haut <= 0.001) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, haut), murMat);
    m.position.set(cx, cy, murZ);
    m.receiveShadow = true;
    group.add(m);
  };
  if (p.tour) {
    /*
     * LA TOUR EST UN VOLUME, PAS UN PANNEAU.
     *
     * Son AVANT est exactement là où le panneau se serait trouvé — c'est le
     * plan sur lequel l'enseigne se pose, et il ne doit pas bouger d'un
     * millimètre sous peine de décoller l'enseigne du bâtiment. Le reste du
     * bloc part donc vers l'arrière.
     *
     * Le même matériau habille les six faces. Les côtés reçoivent la trame de
     * la façade à la densité de l'avant : sur 3,40 m de retour, cela fait un
     * peu plus d'une travée et demie — pas la vérité d'un plan d'architecte,
     * mais ce qu'il faut pour que l'angle du bâtiment se lise.
     */
    const t = p.tour;
    /*
     * LE CORPS S'ARRÊTE DANS L'ACROTÈRE, ET C'EST TOUT LE CORRECTIF.
     *
     * Il montait EXACTEMENT à `sommet`, la cote à laquelle l'acrotère s'arrête
     * lui aussi : deux faces horizontales dans le même plan, à la même hauteur,
     * qui se disputaient chaque pixel du toit. Le résultat se voit dès qu'on
     * regarde le bâtiment d'un peu au-dessus — un toit rayé de bandes qui
     * bougent avec la caméra, ce que le marchand a décrit comme « des trucs
     * bizarres ». C'est un défaut classique (deux surfaces coplanaires, et la
     * profondeur ne peut pas les départager), et il ne se corrige pas par un
     * réglage : il faut que les faces cessent d'être dans le même plan.
     *
     * Le corps monte donc 30 cm plus bas et se termine À L'INTÉRIEUR du
     * couronnement, qui le coiffe. Plus aucune face commune, et rien de
     * changé à l'image : cette partie-là était de toute façon cachée dans la
     * tôle.
     */
    const corps = new THREE.Mesh(new THREE.BoxGeometry(t.largeur, t.hauteur, t.profondeur), murMat);
    corps.position.set(0, t.sommet - 0.3 - t.hauteur / 2, murZ - t.profondeur / 2);
    corps.receiveShadow = true;
    group.add(corps);
    /*
     * L'ACROTÈRE — le bandeau plein qui couronne un mur-rideau.
     *
     * Ce n'est pas un ornement : c'est la pièce qui existe sur tous ces
     * bâtiments, celle qui cache l'étanchéité et les machines du toit, et
     * SURTOUT celle sur laquelle l'enseigne est boulonnée. Sans elle, les
     * lettres flottent au-dessus du vitrage ; avec elle, elles sont posées sur
     * quelque chose. 55 cm de haut, 8 cm de débord — les cotes courantes.
     *
     * Il est en tôle laquée mate, pas en verre : sur les photos, c'est ce
     * contraste entre la bande sourde du couronnement et le miroir du vitrage
     * qui détache le haut du bâtiment sur le ciel.
     */
    const acrotere = new THREE.Mesh(
      new THREE.BoxGeometry(t.largeur + 0.16, 0.55, t.profondeur + 0.16),
      new THREE.MeshPhysicalMaterial({
        color: 0x9fadbe, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6,
      }),
    );
    acrotere.position.set(0, t.sommet - 0.275, murZ - t.profondeur / 2);
    group.add(acrotere);
    tourMobile = { corps, acrotere, sommet: t.sommet };
  } else if (p.baie) {
    const b = p.baie;
    const g0 = -murW / 2;
    const bg = b.x - b.largeur / 2;
    const bd = b.x + b.largeur / 2;
    const bb = b.centreY - b.hauteur / 2;
    const bh = b.centreY + b.hauteur / 2;
    panneau(bg - g0, murH, (g0 + bg) / 2, basMur + murH / 2);
    panneau(murW / 2 - bd, murH, (bd + murW / 2) / 2, basMur + murH / 2);
    panneau(b.largeur, bb - basMur, b.x, (basMur + bb) / 2);
    panneau(b.largeur, basMur + murH - bh, b.x, (bh + basMur + murH) / 2);
  } else {
    panneau(murW, murH, 0, basMur + murH / 2);
  }

  // ----- le sol -------------------------------------------------------------
  let solMat: THREE.Material;
  if ('lattes' === p.sol) {
    const tex = plankTexture();
    jetables.push(tex);
    solMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.62, metalness: 0, envMapIntensity: 0.3 });
  } else {
    solMat = new THREE.MeshPhysicalMaterial({ color: p.floor, roughness: 0.8, metalness: 0, envMapIntensity: 0.15 });
  }
  const sansSol = 'aucun' === p.sol;
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D), solMat);
  sol.rotation.x = -Math.PI / 2;
  sol.position.set(0, SOL, o.wallZ + FLOOR_D / 2 - 0.2);
  sol.receiveShadow = true;
  if (!sansSol) group.add(sol);

  // ----- la plinthe ---------------------------------------------------------
  // 10 cm : la cote la plus courante, et la première graduation du décor.
  const plinthe = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_W, 0.1, 0.022),
    new THREE.MeshPhysicalMaterial({ color: p.plinth, roughness: 0.55, metalness: 0, envMapIntensity: 0.2 }),
  );
  plinthe.position.set(0, SOL + 0.05, o.wallZ + 0.011);
  plinthe.receiveShadow = true;
  if (!sansSol) group.add(plinthe);

  // ----- le meuble à taille connue ------------------------------------------
  /*
   * C'EST LUI QUI DIT LA TAILLE.
   *
   * Un néon cadré seul n'a pas de taille : la caméra recadre, et 30 cm donne
   * la même image que 150 cm. Un objet familier dans le champ — un buffet à
   * 80 cm, une table de chevet à 52 cm — et l'œil fait la conversion sans
   * qu'on ait à écrire une cote.
   *
   * Un seul par décor. Deux encombrent, et le sujet de la vue reste le néon.
   */
  const bois = (hex: number, rug = 0.6) =>
    new THREE.MeshPhysicalMaterial({ color: hex, roughness: rug, metalness: 0, envMapIntensity: 0.25 });

  const meubles = p.meubles ?? [];
  for (const m of meubles) {
    const [larg, haut, prof] = m.taille;
    const corps = new THREE.Mesh(new THREE.BoxGeometry(larg, haut, prof), bois(m.couleur, m.rugosite));
    // Posé AU SOL, contre le mur : la hauteur donnée est celle du meuble réel,
    // donc son centre est à la moitié de cette hauteur au-dessus du plancher.
    corps.position.set(m.x, SOL + haut / 2, o.wallZ + prof / 2 + 0.02);
    corps.castShadow = true;
    corps.receiveShadow = true;
    group.add(corps);

    let dessus = SOL + haut;
    if (m.plateau) {
      const pl = m.plateau;
      const plateau = new THREE.Mesh(
        new THREE.BoxGeometry(larg + pl.debord * 2, pl.epaisseur, prof + pl.debord),
        bois(pl.couleur, 0.42),
      );
      plateau.position.set(m.x, dessus + pl.epaisseur / 2, o.wallZ + prof / 2 + 0.02);
      plateau.castShadow = true;
      group.add(plateau);
      dessus += pl.epaisseur;
    }

    if (!m.lampe) continue;
    /*
     * LA LAMPE RESTE ALLUMÉE, MÊME AVEC LE NÉON.
     *
     * Elle a d'abord été coupée dès que le néon s'allumait, parce qu'à son
     * réglage d'alors elle le dépassait franchement : en vue « pièce », on
     * regardait un abat-jour. Mais la couper éteignait la pièce avec elle — le
     * néon flottait dans le noir, sans mur, sans sol, sans meuble.
     *
     * Le vrai problème n'était pas qu'elle soit allumée : c'est qu'elle était
     * trop forte. À 0,3 d'émission et 1,2 candela, elle pose sa flaque chaude
     * sans jamais approcher le tube. Les deux cohabitent, comme dans une
     * chambre.
     */
    const abatJour = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.115, 0.15, 20, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xf3e2c8,
        roughness: 0.85,
        side: THREE.DoubleSide,
        emissive: 0xffb877,
        emissiveIntensity: 0.14,
      }),
    );
    abatJour.position.set(m.x, dessus + 0.11, o.wallZ + prof / 2 + 0.02);
    group.add(abatJour);
    /*
     * L'AMPOULE EST À SEPT CENTIMÈTRES DE SON PROPRE ABAT-JOUR.
     *
     * L'intensité est en candelas et la décroissance en 1/d². À 30 cm — le
     * plateau de la table — une candela donne déjà de quoi voir ; mais la face
     * interne de l'abat-jour, elle, est à 7 cm, soit dix-huit fois plus
     * éclairée. Quatre candelas la brûlaient en blanc pur, et le meuble avec.
     *
     * C'est l'abat-jour lui-même, légèrement émissif, qui fait la lampe. La
     * source ne sert qu'à poser la flaque sur la table et sur le mur — et sa
     * PORTÉE est bornée à 1,10 m, donc elle s'éteint dans le vide avant
     * d'atteindre la plaque. Le code de la vue porte l'avertissement gagné à
     * la dure : une ponctuelle près d'une plaque brillante fait un point
     * spéculaire brûlé dès qu'on orbite.
     */
    const flaque = new THREE.PointLight(0xffb877, 0.65, 1.1, 2);
    flaque.position.set(m.x, dessus + 0.1, o.wallZ + prof / 2 + 0.05);
    group.add(flaque);
  }

  // ----- ce qui fait reconnaître le lieu ------------------------------------
  for (const el of p.elements ?? []) {
    if ('moulures' === el.type) {
      /*
       * Cimaise à 1 m du sol et couvre-joints verticaux — le lambris d'un
       * salon ancien. La cimaise sert aussi de graduation : sa hauteur est
       * une cote que tout le monde connaît sans le savoir.
       */
      const bois = new THREE.MeshPhysicalMaterial({
        color: el.couleur, roughness: 0.42, metalness: 0, envMapIntensity: 0.3,
      });
      const cimaise = new THREE.Mesh(new THREE.BoxGeometry(WALL_W, 0.055, 0.018), bois);
      cimaise.position.set(0, SOL + 1, o.wallZ + 0.009);
      cimaise.castShadow = true;
      group.add(cimaise);
      const geo = new THREE.BoxGeometry(0.035, 0.9, 0.012);
      for (let x = -WALL_W / 2 + el.pas / 2; x < WALL_W / 2; x += el.pas) {
        const b = new THREE.Mesh(geo, bois);
        b.position.set(x, SOL + 0.55, o.wallZ + 0.006);
        group.add(b);
      }
    } else if ('miroir' === el.type) {
      /*
       * LE MIROIR — celui qui profite le plus de la phase 1.
       *
       * Il renvoie `scene.environment`, qui n'est plus le studio blanc de
       * three.js mais LA PIÈCE elle-même. Un salon de coiffure dont le miroir
       * reflétait un studio inexistant aurait raté son seul objet obligatoire.
       *
       * C'est un reflet d'ENVIRONNEMENT, pas une seconde passe de rendu : le
       * néon lui-même n'y apparaît pas. Le faire coûterait un rendu complet
       * par image, pour un objet posé sur le même mur que l'enseigne — donc
       * presque jamais dans son champ.
       */
      const cadre = new THREE.Mesh(
        new THREE.BoxGeometry(el.largeur + el.cadre * 2, el.hauteur + el.cadre * 2, 0.03),
        new THREE.MeshPhysicalMaterial({ color: 0xc98ba4, metalness: 0.85, roughness: 0.3 }),
      );
      cadre.position.set(el.x, el.centreY, o.wallZ + 0.015);
      cadre.castShadow = true;
      group.add(cadre);
      const glace = new THREE.Mesh(
        new THREE.PlaneGeometry(el.largeur, el.hauteur),
        new THREE.MeshPhysicalMaterial({
          /*
           * UN MIROIR NE DOIT PAS ÊTRE PLUS LUMINEUX QUE L'ENSEIGNE.
           *
           * À 1,6 d'environnement et 0,02 de rugosité, il concentrait toute la
           * lumière de la pièce en une plaque plus claire que le tube — le
           * banc l'a chiffré : le pixel le plus clair de l'image tombait sur
           * le miroir, pas sur le néon. Une glace réelle dans une pièce peu
           * éclairée est sombre ; c'est ce qu'on rend ici.
           */
          color: 0xdfe3e8, metalness: 1, roughness: 0.06, envMapIntensity: 0.5,
        }),
      );
      glace.position.set(el.x, el.centreY, o.wallZ + 0.031);
      group.add(glace);
    } else if ('ciel' === el.type) {
      /*
       * LE CIEL, ET RIEN D'AUTRE DERRIÈRE.
       *
       * Il y avait ici deux silhouettes d'immeubles au fond. Elles partent :
       * le bâtiment de référence est SEUL dans son ciel, et c'est ce qui donne
       * à ces photos leur force — une façade, une enseigne, du vide autour.
       * Poser des voisins revenait à raconter un quartier alors que ce qu'on
       * vend est une enseigne.
       *
       * LA TOILE EST DEVANT LE FOND DE SCÈNE, JAMAIS DEVANT LA TOUR. Trente
       * mètres derrière le mur : il n'y a rien entre les deux, et elle est
       * assez grande pour couvrir le champ à cette distance — sans quoi on
       * verrait ses bords, ce qui est le genre de détail qu'on ne remarque
       * qu'une fois en production.
       *
       * ET ELLE N'EST PAS MARQUÉE « NON TONE-MAPPÉE ». La vue reconnaît une
       * source de lumière à cela — voir `emetDeLaLumiere` dans three-view.tsx —
       * et un ciel classé source passerait dans le halo du bloom : toute
       * l'image se mettrait à luire, et l'enseigne, qui est la vraie source,
       * n'aurait plus rien de remarquable.
       */
      /*
       * UNE VOÛTE, ET NON UNE TOILE — parce qu'une toile a des BORDS.
       *
       * Deux essais de plan de fond ont laissé la même trace : une diagonale
       * nette en haut de l'image, là où le bord de la toile entrait dans le
       * champ. C'est propre à la contre-plongée — la caméra balaie vers le
       * haut, et le client peut en plus faire tourner la scène à la souris :
       * il n'existe aucune taille de plan qui garantisse que le bord reste
       * dehors dans toutes les orientations. Agrandir déplaçait la diagonale
       * sans jamais la supprimer.
       *
       * Une sphère vue de l'intérieur n'a pas ce problème : quel que soit
       * l'endroit où l'on regarde, il y a du ciel. C'est la réponse habituelle,
       * et c'est la seule qui tienne quand l'orbite est libre.
       */
      const voute = new THREE.Mesh(
        /*
         * QUARANTE MÈTRES DE RAYON, ET CE NOMBRE N'EST PAS AU HASARD.
         *
         * La caméra de la vue porte à SOIXANTE mètres (`far`), pas au-delà.
         * Une première voûte de 260 m était donc invisible — entièrement
         * derrière le plan de coupe — et l'image continuait de montrer la
         * couleur de fond, à laquelle la courbe de l'image s'applique : d'où
         * un ciel toujours trop sombre malgré tous les réglages. La leçon vaut
         * d'être écrite : un objet qu'on ne voit pas ne prévient pas.
         *
         * Quarante laisse de la marge dans toutes les directions (la caméra
         * s'éloigne d'une vingtaine de mètres au plus), et rien de ce que le
         * décor pose n'arrive jusque-là.
         */
        new THREE.SphereGeometry(40, 40, 28),
        new THREE.MeshBasicMaterial({
          map: skyTexture(),
          side: THREE.BackSide,
          depthWrite: false,
          /*
           * LE CIEL SORT TEL QUEL, SANS PASSER PAR LA COURBE DE L'IMAGE.
           *
           * Le rendu applique une courbe cinéma (ACES) à tout ce qui est
           * éclairé : elle creuse les tons moyens, ce qui est exactement ce
           * qu'on veut sur des matières, et exactement ce qu'on ne veut pas
           * sur un fond. Mesuré : le bleu #5d97cf de la 2D ressortait vers
           * #2a5487 en 3D — deux vues, deux ciels, alors que la règle de la
           * maison est qu'elles montrent le même lieu. Le ciel n'est pas une
           * matière : c'est le fond, et un fond se pose.
           */
          toneMapped: false,
        }),
      );
      jetables.push((voute.material as THREE.MeshBasicMaterial).map!);
      /*
       * ... MAIS CE N'EST PAS UNE SOURCE POUR AUTANT.
       *
       * La vue reconnaît les sources de lumière à leur « toneMapped: false »
       * (voir `emetDeLaLumiere`) et les fait passer dans le halo du bloom.
       * C'est juste pour un tube ou une face de caisson ; appliqué au ciel,
       * cela ferait luire toute l'image et l'enseigne n'aurait plus rien de
       * remarquable. Ce drapeau dit à la vue de ne pas s'y tromper.
       */
      voute.userData.horsBloom = true;
      group.add(voute);
    } else if ('plantes' === el.type) {
      /*
       * LA JARDINIÈRE, ET DES LAMES PLUTÔT QUE DES FEUILLES.
       *
       * Les deux photos montrent des sansevières : des lames dressées, droites,
       * plus hautes que larges. C'est la plante des accueils parce qu'elle
       * survit à tout, et c'est une chance ici — une lame se dessine avec une
       * boîte fine, là où un feuillage demanderait un modèle.
       *
       * LEURS VARIATIONS SONT CALCULÉES, PAS TIRÉES AU SORT. Le banc des
       * décors compare des images entre deux exécutions : un `Math.random`
       * ferait varier la scène d'un rendu à l'autre et rendrait la mesure
       * inutilisable. L'indice de la lame suffit à les faire toutes
       * différentes, et toujours de la même façon.
       */
      /* LE BAC MONTE À 40 CM ET LES LAMES À UN MÈTRE, ET CES DEUX COTES SONT
         LIÉES À UNE TROISIÈME : la banque fait 110 cm. Des lames plus courtes
         passaient ENTIÈREMENT derrière le plateau — mesuré, pas une feuille
         visible, et une jardinière qu'on ne voit pas ne sert à rien. Il faut
         que le feuillage dépasse, comme sur les deux photos. */
      const bac = new THREE.Mesh(
        new THREE.BoxGeometry(el.largeur, 0.4, 0.34),
        new THREE.MeshPhysicalMaterial({ color: 0x7d5f3e, roughness: 0.8, metalness: 0 }),
      );
      bac.position.set(el.x, SOL + 0.2, o.wallZ + 0.3);
      bac.receiveShadow = true;
      group.add(bac);
      /* PLUS CLAIRES QU'ON NE CROIT. Un vert de feuille sous une ambiance
         chaude et derrière un halo rose vire au brun-noir : les lames
         ressortaient comme des planches sombres posées sur la banque. La
         sansevière est de toute façon un vert-de-gris, pas un vert forêt. */
      const lame = new THREE.MeshPhysicalMaterial({ color: 0x5c8a56, roughness: 0.62, metalness: 0 });
      /*
       * LES LAMES SONT DÉSORMAIS UN REPLI, PAS LE RÉSULTAT.
       *
       * Elles s'affichent tout de suite — une scène ne doit jamais attendre un
       * téléchargement pour exister — puis s'effacent dès que la vraie plante
       * arrive. Si elle n'arrive pas, elles restent, et personne ne voit de
       * trou. C'est le même contrat que la photo de boutique un peu plus bas.
       */
      const lames = new THREE.Group();
      const n = Math.max(6, Math.round(el.largeur / 0.1));
      for (let i = 0; i < n; i++) {
        /* La cote qui compte n'est pas la hauteur de la lame mais ce qu'elle
           DÉPASSE : le plateau est à 35 cm sous l'enseigne, et le feuillage
           doit monter d'une vingtaine de centimètres au-dessus sans jamais
           atteindre les lettres. D'où cette fourchette étroite. */
        /* LA CONTRAINTE VIENT DE L'ENSEIGNE, PAS DE LA PLANTE. Le plateau
           est à 1,15 m du sol et l'enseigne à 1,50 : il ne reste que 35 cm de
           mur entre les deux. Le feuillage doit donc dépasser le plateau — sans
           quoi on ne le voit pas — et s'arrêter avant les lettres, sans quoi il
           les mange. La fourchette ci-dessous tient dans ces 35 cm ; c'est plus
           serré que sur la photo, où le logo est à 2,20 m. */
        const haut = 0.74 + ((i * 37) % 13) * 0.012;
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.042, haut, 0.014), lame);
        f.position.set(
          el.x - el.largeur / 2 + 0.07 + (i * (el.largeur - 0.14)) / (n - 1),
          SOL + 0.34 + haut / 2,
          o.wallZ + 0.3 + (((i * 13) % 5) - 2) * 0.045,
        );
        f.rotation.z = (((i * 29) % 13) - 6) * 0.022;
        f.castShadow = true;
        lames.add(f);
      }
      group.add(lames);

      /*
       * ET LA VRAIE PLANTE, EN CINQ EXEMPLAIRES.
       *
       * La photo montre une jardinière continue, pas un pot : un seul modèle
       * posé au milieu ferait une plante isolée sur deux mètres de bac. On le
       * répète donc le long du bac, chacun un peu tourné et un peu plus haut
       * ou plus bas que son voisin — sans quoi cinq copies du même objet se
       * voient immédiatement pour ce qu'elles sont.
       *
       * Le pot d'origine est masqué : il est DANS le bac, et deux contenants
       * l'un dans l'autre ne ressemblent à rien. C'est le feuillage qu'on est
       * venu chercher.
       */
      const largeurBac = el.largeur;
      const xBac = el.x;
      chargerModele('plante-verte.glb').then((modele) => {
        if (!modele) return;
        lames.visible = false;
        const COPIES = 7;
        for (let i = 0; i < COPIES; i++) {
          /* CHAQUE EXEMPLAIRE EST UN CLONE, Y COMPRIS LE PREMIER. Réutiliser
             le modèle d'origine pour le premier revenait à le déformer avant
             de le cloner : les quatre suivants héritaient de sa position, de
             sa rotation et de son échelle, et repartaient de travers. */
          const exemplaire = modele.clone(true);
          const haut = 0.78 + (((i * 37) % 5) - 2) * 0.05;
          poserAuSol(
            exemplaire,
            haut,
            xBac - largeurBac / 2 + (largeurBac * (i + 0.5)) / COPIES,
            SOL + 0.36,
            o.wallZ + 0.3 + (((i * 13) % 3) - 1) * 0.05,
          );
          exemplaire.rotation.y = (((i * 29) % 8) - 4) * 0.5;
          exemplaire.traverse((n2) => {
            if (n2 instanceof THREE.Mesh) {
              n2.castShadow = true;
              n2.receiveShadow = true;
            }
          });
          group.add(exemplaire);
        }
        // La vue tourne peut-être au ralenti (onglet caché) : on lui demande
        // une image, sinon la plante n'apparaîtrait qu'au prochain mouvement.
        o.onImageLoaded?.();
      });
    } else if ('cloison' === el.type) {
      /*
       * LA CLOISON VITRÉE — trois panneaux et leurs montants.
       *
       * Elle est POSÉE EN AVANT DU MUR, à 90 cm : c'est ce décalage qui lui
       * donne son épaisseur à l'image et qui fait qu'on la lit comme une
       * cloison plutôt que comme un motif peint sur le mur du fond.
       *
       * Le verre est dépoli — translucide et rugueux, pas un miroir. Un
       * vitrage poli renverrait la scène et attirerait l'œil du côté du décor,
       * alors qu'il est là pour situer le lieu et se taire.
       */
      const verre = new THREE.MeshPhysicalMaterial({
        color: 0xdde8ee, transparent: true, opacity: 0.34,
        roughness: 0.42, metalness: 0, envMapIntensity: 0.7,
      });
      const montant = new THREE.MeshPhysicalMaterial({
        color: 0xb7bcc2, roughness: 0.38, metalness: 0.55, envMapIntensity: 0.7,
      });
      const PANNEAUX = 3;
      const larg = el.largeur / PANNEAUX;
      for (let i = 0; i < PANNEAUX; i++) {
        const x = el.x - el.largeur / 2 + larg / 2 + i * larg;
        const panneauVitre = new THREE.Mesh(
          new THREE.BoxGeometry(larg - 0.05, el.hauteur, 0.028), verre,
        );
        panneauVitre.position.set(x, SOL + el.hauteur / 2, o.wallZ + 0.9);
        group.add(panneauVitre);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, el.hauteur, 0.055), montant);
        m.position.set(x + larg / 2, SOL + el.hauteur / 2, o.wallZ + 0.9);
        group.add(m);
      }
    } else if ('poste-accueil' === el.type) {
      /*
       * LE POSTE D'ACCUEIL.
       *
       * Toutes les cotes sont réelles, et c'est ce qui fait tenir la scène : la
       * banque à 110 cm, le plateau à 4,5 cm, le sous-main à 90 × 45, un clavier
       * de 44 cm, un écran de 24 pouces, une assise à 46 cm. Ce sont ces
       * objets-là que l'œil connaît par cœur — c'est en les reconnaissant qu'il
       * déduit la taille de l'enseigne accrochée derrière, ce qu'aucune cote
       * écrite ne fait aussi bien.
       *
       * LA BANQUE EST EN L, comme sur la photo : un retour vient vers le
       * visiteur. Deux volumes, donc, et le second est ce qui donne au décor sa
       * profondeur — vue de face, une banque droite n'est qu'un mur bas.
       */
      const HAUT_BANQUE = 1.1;
      const EP_PLATEAU = 0.045;
      const Y_SOL = SOL;
      const Y_PLATEAU = Y_SOL + HAUT_BANQUE + EP_PLATEAU / 2;
      const DESSUS = Y_SOL + HAUT_BANQUE + EP_PLATEAU;
      const blanc = new THREE.MeshPhysicalMaterial({
        color: 0xf7f6f3, roughness: 0.4, metalness: 0, envMapIntensity: 0.35,
      });
      const plateauMat = new THREE.MeshPhysicalMaterial({
        color: 0xfbfaf8, roughness: 0.26, metalness: 0, envMapIntensity: 0.5,
      });
      const noir = new THREE.MeshPhysicalMaterial({ color: 0x24262b, roughness: 0.62, metalness: 0 });
      const plastique = new THREE.MeshPhysicalMaterial({ color: 0xf1f1ef, roughness: 0.4, metalness: 0 });
      const metal = new THREE.MeshPhysicalMaterial({
        color: 0xb9bcc0, roughness: 0.32, metalness: 0.7, envMapIntensity: 0.8,
      });

      const poser = (m: THREE.Mesh, x: number, y: number, z: number) => {
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
        return m;
      };

      // --- la banque, ses deux volumes et ses deux plateaux ------------------
      const dosX = 0.45;
      const dosZ = o.wallZ + 1.0;
      const retX = -0.95;
      const retZ = o.wallZ + 1.55;
      poser(new THREE.Mesh(new THREE.BoxGeometry(2.5, HAUT_BANQUE, 0.62), blanc),
        dosX, Y_SOL + HAUT_BANQUE / 2, dosZ);
      poser(new THREE.Mesh(new THREE.BoxGeometry(1.0, HAUT_BANQUE, 1.5), blanc),
        retX, Y_SOL + HAUT_BANQUE / 2, retZ);
      poser(new THREE.Mesh(new THREE.BoxGeometry(2.6, EP_PLATEAU, 0.72), plateauMat),
        dosX, Y_PLATEAU, dosZ + 0.02);
      poser(new THREE.Mesh(new THREE.BoxGeometry(1.1, EP_PLATEAU, 1.6), plateauMat),
        retX, Y_PLATEAU, retZ);

      // --- le sous-main, et ce qui est posé dessus ---------------------------
      /*
       * LE SOUS-MAIN TIENT SUR LE PLATEAU, ET LE CLAVIER TIENT SUR LE SOUS-MAIN.
       *
       * Ni l'un ni l'autre n'était vrai : un sous-main de 90 cm posé sur un
       * retour de 70 débordait de dix centimètres dans le vide de chaque côté,
       * et le clavier était calé vers l'arrière-gauche au lieu d'être devant
       * l'opérateur. Le retour s'élargit à 1 m — la cote d'un vrai poste — et
       * les deux se centrent sur lui.
       */
      const xPoste = retX;
      poser(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.006, 0.45), noir),
        xPoste, DESSUS + 0.003, retZ + 0.02);
      poser(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.016, 0.135), plastique),
        xPoste, DESSUS + 0.014, retZ + 0.1);
      // Le combiné et sa base — le volume noir du premier plan de la photo.
      poser(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.24), noir),
        xPoste - 0.32, DESSUS + 0.041, retZ + 0.34);
      poser(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.07), noir),
        xPoste - 0.32, DESSUS + 0.104, retZ + 0.3);

      // --- l'écran, vu de dos ------------------------------------------------
      /* 24 pouces, incliné, sur un bras et un socle : de la place du visiteur on
         n'en voit QUE le dos, une coque blanche unie. C'est ce qui le rend facile
         à poser — il n'y a pas d'image à inventer, et une dalle allumée volerait
         la vedette à l'enseigne. */
      const socle = poser(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.02, 24), plastique),
        -0.32, DESSUS + 0.01, o.wallZ + 1.15);
      socle.castShadow = false;
      const bras = poser(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 16), plastique),
        -0.32, DESSUS + 0.16, o.wallZ + 1.15);
      bras.rotation.x = -0.12;
      const dalle = poser(new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.33, 0.022), plastique),
        -0.32, DESSUS + 0.36, o.wallZ + 1.19);
      dalle.rotation.x = 0.14;

      // --- les petits objets du plateau -------------------------------------
      const bocal = poser(new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.15, 24),
        new THREE.MeshPhysicalMaterial({
          color: 0xe9f1f4, transparent: true, opacity: 0.3,
          roughness: 0.08, metalness: 0, envMapIntensity: 1.1,
        }),
      ), 0.72, DESSUS + 0.075, o.wallZ + 1.08);
      bocal.castShadow = false;
      poser(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 20),
        new THREE.MeshPhysicalMaterial({ color: 0xe8a4b4, roughness: 0.8 })),
        0.72, DESSUS + 0.035, o.wallZ + 1.08);
      poser(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.1, 18),
        new THREE.MeshPhysicalMaterial({ color: 0x2b2c30, roughness: 0.25, metalness: 0.1 })),
        0.46, DESSUS + 0.05, o.wallZ + 1.1);
      for (let i = 0; i < 4; i++) {
        const tige = poser(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.2, 6),
          new THREE.MeshPhysicalMaterial({ color: 0xc8b28c, roughness: 0.8 })),
          0.46 + (i - 1.5) * 0.012, DESSUS + 0.18, o.wallZ + 1.1);
        tige.rotation.z = (i - 1.5) * 0.13;
        tige.castShadow = false;
      }
      /* Les cubes de bois — « WELCOME » sur la photo. Ils ne portent aucune
         lettre ici : à cette taille une écriture serait illisible et n'ajouterait
         que du bruit, alors que la silhouette suffit à les reconnaître. */
      for (let i = 0; i < 4; i++) {
        const cube = poser(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045),
          new THREE.MeshPhysicalMaterial({ color: 0xd9c39c, roughness: 0.75 })),
          1.0 + i * 0.05, DESSUS + 0.023, o.wallZ + 1.02);
        cube.rotation.y = (((i * 29) % 7) - 3) * 0.05;
      }
      /*
       * LES BROCHURES FLOTTAIENT DANS LE VIDE, ET RIEN NE LE DISAIT.
       *
       * Elles étaient posées à x = −0,42 alors que le retour s'arrête à −0,45 :
       * trois centimètres dehors, donc entièrement hors du meuble, suspendues
       * au-dessus du sol à 1,15 m. C'est le genre de faute qu'aucun test
       * n'attrape — les cotes sont plausibles une par une — et qu'on ne voit
       * qu'en regardant l'image. Elles se calent désormais SUR le retour, en
       * partant de son axe, et leur position se déduit de celle du meuble au
       * lieu d'être écrite à la main.
       */
      for (let i = 0; i < 3; i++) {
        const bro = poser(new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.005, 0.215),
          new THREE.MeshPhysicalMaterial({ color: 0xd8c3ad, roughness: 0.6 })),
          xPoste - 0.16 + i * 0.15, DESSUS + 0.003 + i * 0.001, retZ + 0.52);
        bro.rotation.y = 0.1 - i * 0.06;
        bro.castShadow = false;
      }

      // --- le fauteuil de bureau --------------------------------------------
      /*
       * LE FAUTEUIL EST HAUT, ET CE N'EST PAS UNE ERREUR DE COTE.
       *
       * Un siège de bureau ordinaire s'assoit à 46 cm : derrière une banque de
       * 110 cm, il DISPARAÎT — mesuré, le haut du dossier arrivait deux
       * centimètres sous le plateau, et on ne voyait rien. Ce n'est d'ailleurs
       * pas ainsi qu'on équipe un accueil : à un comptoir où l'on reçoit
       * debout, on met un siège haut, assise vers 66 cm, pour être au niveau du
       * visiteur. La cote juste est donc celle-là, et elle a l'avantage de se
       * voir — le dossier dépasse d'une vingtaine de centimètres, et c'est ce
       * qui dit qu'il y a quelqu'un.
       */
      const xSiege = -0.55;
      const zSiege = o.wallZ + 0.62;
      poser(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.48), noir),
        xSiege, Y_SOL + 0.66, zSiege);
      const dossier = poser(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.08), noir),
        xSiege, Y_SOL + 1.03, zSiege - 0.2);
      dossier.rotation.x = -0.1;
      const verin = poser(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 14), metal),
        xSiege, Y_SOL + 0.33, zSiege);
      verin.castShadow = false;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const branche = poser(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.045), noir),
          xSiege + Math.cos(a) * 0.15, Y_SOL + 0.045, zSiege + Math.sin(a) * 0.15);
        branche.rotation.y = -a;
        branche.castShadow = false;
      }

      // --- le panneau de chêne, sur toute la gauche --------------------------
      const texBois = woodTexture();
      texBois.repeat.set(1.4 / BOIS_LAME_W, 2.5 / BOIS_LAME_H);
      jetables.push(texBois);
      const panneau = poser(new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.5, 0.1),
        new THREE.MeshPhysicalMaterial({
          map: texBois, roughness: 0.55, metalness: 0, envMapIntensity: 0.3,
        }),
      ), -1.95, Y_SOL + 1.25, o.wallZ + 0.06);
      panneau.castShadow = false;
    } else if ('tours' === el.type) {
      /*
       * LA VILLE, DERRIÈRE LA BAIE.
       *
       * Des blocs sombres et leurs fenêtres allumées — de quoi reconnaître un
       * hall de tour, pas de quoi regarder. Les fenêtres sont émissives et
       * PASSENT DONC DANS LE HALO du bloom sélectif : c'est voulu, une ville de
       * nuit scintille. Elles restent modestes pour que le néon garde la
       * vedette, ce que le banc vérifie.
       */
      const nuit = new THREE.MeshPhysicalMaterial({ color: 0x141a26, roughness: 0.75 });
      const fenetres = new THREE.MeshBasicMaterial({ color: 0xffd489, toneMapped: false });
      const geoF = new THREE.BoxGeometry(0.055, 0.075, 0.01);
      const tours: Array<[number, number, number, number]> = [
        // x, largeur, hauteur, recul
        [1.1, 0.9, 3.4, 3.2], [2.2, 1.3, 4.6, 4.6], [3.2, 0.8, 2.6, 3.8],
      ];
      for (const [tx, larg, haut, recul] of tours) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(larg, haut, 0.6), nuit);
        t.position.set(tx, SOL + haut / 2, o.wallZ - recul);
        group.add(t);
        for (let fy = 0.35; fy < haut - 0.2; fy += 0.34) {
          for (let fx = -larg / 2 + 0.12; fx < larg / 2 - 0.05; fx += 0.19) {
            if (Math.random() > 0.55) continue;
            const f = new THREE.Mesh(geoF, fenetres);
            f.position.set(tx + fx, SOL + fy, o.wallZ - recul + 0.305);
            group.add(f);
          }
        }
      }
    }
  }

  // ----- la photo de la boutique -------------------------------------------
  if (o.image) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      o.image,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        jetables.push(tex);
        /*
         * La photo devient le mur — et rien d'autre.
         *
         * Elle ne devient PAS l'environnement réfléchi : une photo plate n'est
         * pas une carte équirectangulaire, et l'utiliser comme telle donne un
         * miroir tordu, pire que le studio qu'on remplace. Le décor du livre
         * le plus proche continue donc de fournir les reflets, et la photo ne
         * répond que de ce qu'elle sait faire : montrer le lieu, de face.
         */
        // Tous les panneaux du mur partagent LE MÊME matériau : on le change
        // une fois, ils suivent — y compris quand le mur est percé d'une baie.
        const m = murMat as THREE.MeshPhysicalMaterial;
        m.map = tex;
        m.color.set(0xffffff);
        m.needsUpdate = true;
        o.onImageLoaded?.();
      },
      undefined,
      // Échec — serveur sans CORS, adresse morte, image supprimée. On garde le
      // décor du livre, sans un mot : le client voit un mur, pas une erreur.
      () => {},
    );
  }

  const envScene = environmentScene(id);

  // Le transformateur ne flotte plus à une distance arbitraire sous le
  // produit. Il repose sur le meuble le plus proche du centre, sinon au sol.
  // Une façade sans sol le cache derrière l'enseigne, comme une vraie pose.
  const proche = meubles.slice().sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  const powerAnchor: [number, number, number] = proche
    ? [
        proche.x + (proche.x < 0 ? proche.taille[0] * 0.22 : -proche.taille[0] * 0.22),
        SOL + proche.taille[1] + (proche.plateau?.epaisseur ?? 0) + 0.0175,
        o.wallZ + proche.taille[2] * 0.56 + 0.04,
      ]
    : 'aucun' === p.sol
      ? [0.24, -0.16, o.wallZ + 0.012]
      : [0.46, SOL + 0.0175, o.wallZ + 0.18];

  /** Libère les maillages d'un conteneur — le décor et la scène d'environnement
   *  ont exactement le même besoin, et l'oubli du second ne se voit qu'à la
   *  dixième ouverture de la vue, quand le contexte WebGL lâche. */
  const liberer = (racine: THREE.Object3D) => {
    racine.traverse((n) => {
      if (n instanceof THREE.Mesh) {
        n.geometry.dispose();
        const m = n.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => mm && mm.dispose());
      }
    });
  };

  return {
    id,
    group,
    backgroundHex: p.background,
    ambientHex: p.ambient,
    ambientLit: p.ambientLit,
    ambientOff: p.ambientOff,
    exposure: p.exposure,
    champMinM: p.champMinM ?? 0,
    haloMul: p.haloMul,
    murHex: p.wall,
    hdri: p.hdri ?? null,
    chargerHdri: () => (p.hdri ? chargerHdri(p.hdri) : Promise.resolve(null)),
    powerAnchor,
    envScene,
    dirVue: p.vue ?? null,
    poseM: p.poseM ?? MOUNT_HEIGHT_M,
    sansSol: 'aucun' === p.sol,
    /*
     * L'ENSEIGNE EST POSÉE SUR LE TOIT, PAS ACCROCHÉE À LA FAÇADE.
     *
     * C'est la différence entre une enseigne de bâtiment et une enseigne de
     * boutique, et elle se voit au premier coup d'œil : les lettres d'une
     * enseigne de toiture se détachent SUR LE CIEL, au-dessus du couronnement.
     * Collées au vitrage, elles ressemblent à une plaque de bureau agrandie.
     *
     * Le décor ne peut pas le calculer tout seul : il se construit avant que
     * la vue ne sache quelle taille fait l'enseigne. Elle le lui dit ici, et le
     * bâtiment descend juste ce qu'il faut pour que son acrotère affleure sous
     * les lettres. Six centimètres de jeu : de quoi voir le ciel passer entre
     * la tôle et le bas des lettres, comme sur les vraies.
     */
    poserSousLEnseigne(basDeLEnseigne: number) {
      if (!tourMobile) return;
      const vise = basDeLEnseigne - 0.06;
      const dy = vise - tourMobile.sommet;
      tourMobile.corps.position.y += dy;
      tourMobile.acrotere.position.y += dy;
      tourMobile.sommet = vise;
    },
    dispose() {
      for (const j of jetables) j.dispose();
      liberer(group);
      liberer(envScene);
    },
  };
}
