/**
 * DU TRACÉ AU SOLIDE — le volume fermé qu'on peut exporter et fabriquer.
 *
 * La vue 3D pose, pour chaque trait, un tube ouvert bouché par deux sphères
 * posées par-dessus. C'est le bon choix pour AFFICHER : c'est rapide, et un
 * rendu ne voit pas la différence. C'est inexploitable pour FABRIQUER — un
 * trancheur y voit une soupe de triangles, pas un volume.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE MOTEUR BOOLÉEN ICI
 *
 * L'approche attendue serait : construire un tube par trait, puis tout unir
 * avec un moteur CSG. Elle marche, elle coûte une dépendance WASM, et elle
 * échoue sur les faces coplanaires.
 *
 * Il y a mieux, et c'est une identité, pas une astuce : un tube de rayon
 * constant balayé le long d'une courbe EST l'ensemble des points situés à
 * moins de `r` de cette courbe. Autrement dit la somme de Minkowski de la
 * courbe et d'une boule. Deux conséquences :
 *
 *   — les traits qui se croisent **s'unissent tout seuls**, puisqu'on ne
 *     construit jamais deux objets à réunir mais un seul ensemble ;
 *   — les jonctions et les bouts sont **arrondis par construction**, ce qui
 *     est exactement ce que produit un outil rond — donc plus juste qu'un
 *     balayage naïf, qui se replie sur lui-même dans les virages serrés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET POURQUOI IL N'Y A PAS NON PLUS DE MARCHING CUBES
 *
 * Le tracé est PLAN — tous les points partagent le même Z. La distance à la
 * courbe se décompose donc :
 *
 *     dist³ᴰ((x, y, z), courbe)² = dist²ᴰ((x, y), courbe)² + z²
 *
 * La surface `dist³ᴰ = r` s'écrit alors `z = ± √(r² − D²)`, où `D` est un
 * champ de distance PLAN. Le solide est une lentille : deux nappes, une
 * au-dessus et une en dessous, qui se rejoignent exactement là où `D = r` —
 * puisque `z` y vaut zéro des deux côtés.
 *
 * On n'a donc besoin que de trianguler une RÉGION DU PLAN, ce que les
 * marching squares font avec seize cas au lieu de deux cent cinquante-six. Le
 * maillage obtenu est fermé et de variété par CONSTRUCTION : les deux nappes
 * partagent leurs sommets de bord, il n'y a aucune paroi à recoudre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LA PLAQUE, ELLE, N'EST PAS FAITE COMME LE TUBE
 *
 * Le champ de distance convient au tube parce qu'un tube n'occupe qu'une
 * FRANGE de son cadre. Une plaque remplit tout : une grille uniforme y
 * subdivise un intérieur parfaitement plat, pour deux cent vingt-neuf
 * mégaoctets là où douze triangles suffisent (mesures en tête de `PrismOptions`).
 *
 * `buildPrismSolid` triangule donc le POLYGONE et non la région — découpe
 * d'oreilles, trous cousus par un pont. Deux machineries, parce qu'il y a deux
 * problèmes : un tube s'épaissit depuis une ligne, une plaque se remplit depuis
 * un contour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE MODULE NE TOUCHE À AUCUN PRIX. Il décrit l'objet ; il ne le tarife pas,
 * et il n'a donc pas de miroir PHP à tenir — la parité JS ↔ PHP ne couvre que
 * ce qui facture. Les cotes montrées au client continuent de venir du
 * manifeste de mesures, jamais d'un maillage.
 */

/** Un point du plan, en mètres. */
export type Point2 = readonly [number, number];

/** Une polyligne, en mètres. */
export type Polyline2 = readonly Point2[];

/** Un maillage triangulé. Positions en MÈTRES, repère de la scène. */
export interface Mesh {
  /** Trois flottants par sommet : x, y, z. */
  positions: Float64Array;
  /** Trois indices par triangle. */
  indices: Uint32Array;
}

export interface SolidOptions {
  /**
   * Pas d'échantillonnage du plan (m).
   *
   * C'est le seul réglage de précision, et il coûte cher au carré : diviser le
   * pas par deux quadruple le nombre de cellules.
   *
   * Relevé sur une barre de 6 cm en Ø 10 mm, dont le volume exact se calcule :
   *
   *     pas 1,20 mm  →  −3,58 %      2 068 triangles     13 ms
   *     pas 0,60 mm  →  −1,41 %      7 780 triangles     19 ms
   *     pas 0,40 mm  →  −0,90 %     17 124 triangles     47 ms
   *     pas 0,20 mm  →  −0,32 %     68 120 triangles    108 ms
   *
   * L'écart est TOUJOURS NÉGATIF, et ce n'est pas un hasard : la région est
   * approchée par des cordes, qui passent toutes en deçà de la silhouette. Le
   * solide obtenu est donc légèrement MAIGRE, jamais gras — ce qui est le bon
   * sens de l'erreur pour une pièce qui doit entrer quelque part.
   *
   * 0,4 mm est le défaut : sous le pour cent, et cinquante millisecondes.
   */
  stepM?: number;
}

const DEFAULT_STEP_M = 0.0004;

/**
 * UNE SEULE TOLÉRANCE, ET ELLE EST EN LONGUEUR.
 *
 * Sous le nanomètre, deux points sont le même point — six ordres de grandeur
 * sous la précision de n'importe quelle machine d'atelier. Tout le reste en
 * découle, et c'est le point important : la classification d'un coin
 * (dedans/dehors) et l'identité d'un sommet (dédoublé/partagé) DOIVENT dire la
 * même chose. Quand elles divergent, on obtient un coin déclaré intérieur dont
 * l'épaisseur est nulle — et donc une arête intérieure que les deux nappes
 * parcourent chacune deux fois. C'est ce qui a produit six arêtes de
 * non-variété aux angles rentrants d'une croix.
 *
 * L'épaisseur vaut `h = √(g(2r − g))`. Exiger `h > ε` revient donc à exiger
 * `g > ε²/2r` : c'est `seuilChamp()`, et il n'existe que pour garder les deux
 * critères d'accord.
 */
const EPS_M = 1e-9;

const seuilChamp = (rayon: number) => (EPS_M * EPS_M) / (2 * rayon);

/* -------------------------------------------------------------------------- */
/* 1. Le champ de distance plan                                                */
/* -------------------------------------------------------------------------- */

interface Champ {
  /** `r − D` : positif à l'intérieur du tube, nul sur sa silhouette. */
  g: Float64Array;
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  step: number;
}

/** Distance d'un point au segment [a, b]. */
function distSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Champ de distance à un réseau de polylignes.
 *
 * On ne balaie PAS toute la grille pour chaque segment : chaque segment ne
 * dépose sa distance que sur les cellules de sa propre boîte englobante,
 * élargie du rayon. Le coût suit donc la surface du tube, pas celle de
 * l'image — un « Hello » de 28 traits couvre quelques pour cent de la grille.
 */
function champDeDistance(strokes: readonly Polyline2[], rayon: number, step: number): Champ {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) throw new Error('solide : aucun point dans le tracé');

  // Une cellule de marge tout autour : la silhouette doit se fermer À
  // L'INTÉRIEUR de la grille, sinon le maillage sort avec un bord libre.
  const marge = rayon + step * 2;
  const x0 = minX - marge;
  const y0 = minY - marge;
  const nx = Math.ceil((maxX - minX + marge * 2) / step) + 1;
  const ny = Math.ceil((maxY - minY + marge * 2) / step) + 1;

  const g = new Float64Array(nx * ny).fill(-rayon); // loin du tube : g < 0
  const portee = rayon + step * 2;

  for (const s of strokes) {
    for (let k = 1; k < s.length; k++) {
      const [ax, ay] = s[k - 1]!;
      const [bx, by] = s[k]!;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - portee - x0) / step));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + portee - x0) / step));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - portee - y0) / step));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + portee - y0) / step));
      for (let j = j0; j <= j1; j++) {
        const py = y0 + j * step;
        const base = j * nx;
        for (let i = i0; i <= i1; i++) {
          const d = distSegment(x0 + i * step, py, ax, ay, bx, by);
          const v = rayon - d;
          if (v > g[base + i]!) g[base + i] = v;
        }
      }
    }
    // Un trait réduit à un point reste un point : il donne une bille, pas rien.
    if (1 === s.length) {
      const [ax, ay] = s[0]!;
      const i0 = Math.max(0, Math.floor((ax - portee - x0) / step));
      const i1 = Math.min(nx - 1, Math.ceil((ax + portee - x0) / step));
      const j0 = Math.max(0, Math.floor((ay - portee - y0) / step));
      const j1 = Math.min(ny - 1, Math.ceil((ay + portee - y0) / step));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const v = rayon - Math.hypot(x0 + i * step - ax, y0 + j * step - ay);
          if (v > g[j * nx + i]!) g[j * nx + i] = v;
        }
      }
    }
  }
  return { g, nx, ny, x0, y0, step };
}

/* -------------------------------------------------------------------------- */
/* 2. La région du plan, triangulée                                            */
/* -------------------------------------------------------------------------- */

/** Un sommet du plan, avec la valeur du champ qui y règne. */
interface Sommet {
  x: number;
  y: number;
  g: number;
}

/**
 * Triangulation de la région `{ g ≥ 0 }`, cellule par cellule.
 *
 * Aucune table de cas n'est nécessaire : on parcourt le bord de la cellule
 * dans le sens direct en gardant les coins intérieurs et les traversées
 * d'arête. Cela donne le polygone découpé, déjà bien orienté.
 *
 * Reste l'ambiguïté du COL — deux coins opposés dedans, deux dehors : les deux
 * parties sont-elles jointes au milieu, ou séparées ? On tranche par la valeur
 * moyenne de la cellule. Le choix ne se voit qu'à l'intérieur d'UNE cellule,
 * les traversées d'arête étant les mêmes des deux façons : deux cellules
 * voisines restent donc cousues quoi qu'il arrive, et le maillage de variété.
 */
function trianguler(c: Champ, gMin: number): { sommets: Sommet[]; tris: number[] } {
  const { g, nx, ny, x0, y0, step } = c;
  const sommets: Sommet[] = [];
  const tris: number[] = [];
  /** Clés de partage : deux cellules voisines doivent réutiliser LE MÊME
   *  sommet, sans quoi la surface se déchire le long de chaque arête. */
  const index = new Map<string, number>();

  const poser = (cle: string, x: number, y: number, gv: number): number => {
    const vu = index.get(cle);
    if (undefined !== vu) return vu;
    const id = sommets.length;
    sommets.push({ x, y, g: gv });
    index.set(cle, id);
    return id;
  };

  const coin = (i: number, j: number) => poser(`c${i}_${j}`, x0 + i * step, y0 + j * step, g[j * nx + i]!);

  /*
   * TRAVERSÉE SUR UNE ARÊTE DE GRILLE — et le cas qui a coûté un maillage.
   *
   * Quand la grille tombe PILE sur la silhouette, un coin vaut exactement zéro.
   * Il est alors compté « dedans », et la traversée de chacune de ses arêtes se
   * calcule au même endroit que lui : deux sommets confondus, d'indices
   * différents. Le maillage paraît correct, il est fermé, et il n'est PAS de
   * variété — quatre cent cinquante arêtes parcourues quatre fois sur une
   * simple paire de barres.
   *
   * Et ce n'est pas un cas rare : la grille part du bord de l'objet moins le
   * rayon, donc elle tombe sur la silhouette d'une barre droite à tous les
   * coups. On RECOLLE donc au coin dès que la traversée s'y confond.
   *
   * La décision ne dépend que des deux valeurs de l'arête, partagées par les
   * deux cellules voisines : elles recollent donc identiquement, et la surface
   * ne se déchire pas.
   */
  const croisement = (i0: number, j0: number, i1: number, j1: number): number => {
    const ga = g[j0 * nx + i0]!;
    const gb = g[j1 * nx + i1]!;
    const t = ga / (ga - gb); // ga et gb sont de signes opposés
    if (t <= 1e-7) return coin(i0, j0);
    if (t >= 1 - 1e-7) return coin(i1, j1);
    const cle = j0 === j1 ? `h${Math.min(i0, i1)}_${j0}` : `v${i0}_${Math.min(j0, j1)}`;
    const vu = index.get(cle);
    if (undefined !== vu) return vu;
    const x = x0 + (i0 + (i1 - i0) * t) * step;
    const y = y0 + (j0 + (j1 - j0) * t) * step;
    const id = sommets.length;
    sommets.push({ x, y, g: 0 });
    index.set(cle, id);
    return id;
  };

  /**
   * Triangule un polygone de cellule, après avoir retiré les répétitions.
   *
   * Le recollage ci-dessus peut faire apparaître deux fois le même sommet dans
   * le polygone — le coin, puis la traversée recollée sur lui. Les garder
   * produirait des triangles d'aire nulle, que tout trancheur signale.
   */
  const eventail = (brut: number[]) => {
    const poly: number[] = [];
    for (const s of brut) if (s !== poly[poly.length - 1]) poly.push(s);
    while (poly.length > 1 && poly[0] === poly[poly.length - 1]) poly.pop();
    if (poly.length < 3) return;
    for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0]!, poly[k]!, poly[k + 1]!);
  };

  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      // Coins dans le sens direct, en partant du bas-gauche.
      const ci = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ] as const;
      const gv = ci.map(([a, b]) => g[b * nx + a]!);
      /*
       * LE ZÉRO APPARTIENT AU BORD, PAS À L'INTÉRIEUR.
       *
       * Compter `g = 0` comme « dedans » paraît anodin et ne l'est pas. La
       * silhouette d'une barre droite tombe EXACTEMENT sur des lignes de
       * grille — la grille part du bord moins le rayon, donc c'est le cas
       * ordinaire, pas le cas limite. Une cellule dont trois coins valent zéro
       * et le quatrième est dehors produisait alors un triangle entier situé
       * HORS de la région, collé contre le bord.
       *
       * Ce triangle fantôme donnait une arête intérieure dont les deux bouts
       * sont d'épaisseur nulle : les deux nappes la parcouraient chacune deux
       * fois, soit quatre — la définition même d'une arête de non-variété. Six
       * arêtes sur une croix, aux quatre angles rentrants.
       *
       * Avec `> 0`, un coin sur la silhouette n'est plus qu'un point du bord,
       * atteint par le recollage des traversées. C'est ce qu'il est.
       */
      const dedans = gv.map((v) => v > gMin);
      const combien = dedans.filter(Boolean).length;
      if (0 === combien) continue;

      // Le col : deux coins opposés dedans, deux dehors.
      const col = 2 === combien && dedans[0] === dedans[2] && dedans[1] === dedans[3];
      if (col) {
        const moyenne = (gv[0]! + gv[1]! + gv[2]! + gv[3]!) / 4;
        if (moyenne < 0) {
          // Séparés : deux coins isolés, chacun avec son petit triangle.
          for (let k = 0; k < 4; k++) {
            if (!dedans[k]) continue;
            const p = (k + 3) % 4;
            const s = (k + 1) % 4;
            eventail([
              croisement(ci[p]![0], ci[p]![1], ci[k]![0], ci[k]![1]),
              coin(ci[k]![0], ci[k]![1]),
              croisement(ci[k]![0], ci[k]![1], ci[s]![0], ci[s]![1]),
            ]);
          }
          continue;
        }
      }

      const poly: number[] = [];
      for (let k = 0; k < 4; k++) {
        const s = (k + 1) % 4;
        if (dedans[k]) poly.push(coin(ci[k]![0], ci[k]![1]));
        if (dedans[k] !== dedans[s]) poly.push(croisement(ci[k]![0], ci[k]![1], ci[s]![0], ci[s]![1]));
      }
      if (poly.length < 3) continue;
      eventail(poly);
    }
  }
  return { sommets, tris };
}

/* -------------------------------------------------------------------------- */
/* 3. La lentille                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Le solide du tube : le lieu des points à moins de `radiusM` du tracé.
 *
 * Les polylignes sont en MÈTRES, dans le plan z = 0. Le solide obtenu est
 * fermé, de variété, orienté vers l'extérieur.
 */
export function buildTubeSolid(
  strokes: readonly Polyline2[],
  radiusM: number,
  o: SolidOptions = {},
): Mesh {
  if (!(radiusM > 0)) throw new Error('solide : rayon nul ou négatif');
  const step = o.stepM ?? DEFAULT_STEP_M;
  const gMin = seuilChamp(radiusM);
  const { sommets, tris } = trianguler(champDeDistance(strokes, radiusM, step), gMin);

  /*
   * DEUX NAPPES QUI SE REJOIGNENT SUR LA SILHOUETTE.
   *
   * `h = √(r² − D²)` avec `D = r − g`, soit `h = √(g(2r − g))`. Sur le bord,
   * `g = 0` donc `h = 0` : le sommet est UNIQUE et sert aux deux nappes. C'est
   * lui qui ferme le volume — il n'y a aucune paroi à ajouter, et donc aucune
   * couture à rater.
   */
  /*
   * UN NANOMÈTRE, ET POURQUOI IL FAUT LE DIRE.
   *
   * Un sommet de la silhouette doit être UNIQUE : c'est lui qui coud les deux
   * nappes. On le reconnaît à son épaisseur nulle — sauf que `g` vaut parfois
   * 1e-18 au lieu de 0, par simple bruit de calcul, quand la grille tombe pile
   * sur le bord. L'épaisseur devient alors 1e-11 m, le sommet se dédouble, et
   * la surface s'ouvre : trois cents arêtes de bord sur une paire de barres,
   * pour des sommets distants d'un dixième de nanomètre.
   *
   * D'où un seuil EXPRIMÉ EN LONGUEUR, et non en valeur de champ : sous le
   * nanomètre, deux points sont le même point — c'est six ordres de grandeur
   * sous la précision de n'importe quelle machine d'atelier.
   */
  const positions: number[] = [];
  const hautDe = new Int32Array(sommets.length).fill(-1);
  const basDe = new Int32Array(sommets.length).fill(-1);
  for (let k = 0; k < sommets.length; k++) {
    const s = sommets[k]!;
    const gg = Math.min(Math.max(s.g, 0), radiusM);
    const h = Math.sqrt(gg * (2 * radiusM - gg));
    const idHaut = positions.length / 3;
    hautDe[k] = idHaut;
    if (h <= EPS_M) {
      positions.push(s.x, s.y, 0); // et pas `h` : on éviterait un zéro négatif
      basDe[k] = idHaut; // le même sommet : la silhouette est partagée
    } else {
      positions.push(s.x, s.y, h);
      basDe[k] = positions.length / 3;
      positions.push(s.x, s.y, -h);
    }
  }

  const indices: number[] = [];
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = tris[t]!;
    const b = tris[t + 1]!;
    const c = tris[t + 2]!;
    // Nappe du dessus : sens direct vu de +Z, normale vers +Z.
    indices.push(hautDe[a]!, hautDe[b]!, hautDe[c]!);
    // Nappe du dessous : sens inverse, normale vers −Z.
    indices.push(basDe[a]!, basDe[c]!, basDe[b]!);
  }

  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

/* -------------------------------------------------------------------------- */
/* 3 bis. La plaque, le caisson, les lettres boîtiers                          */
/* -------------------------------------------------------------------------- */

/*
 * POURQUOI UNE PLAQUE N'EST PAS FAITE COMME UN TUBE.
 *
 * Le champ de distance convient au tube parce qu'un tube n'occupe qu'une
 * FRANGE : quelques pour cent de la grille. Une plaque, elle, remplit tout, et
 * une grille uniforme subdivise alors un intérieur parfaitement plat.
 *
 * Mesuré, avant de changer d'approche :
 *
 *     plaque  20 × 10 cm, pas 0,4 mm  →     503 k triangles,   11 Mo,   0,6 s
 *     plaque  50 × 20 cm, pas 0,4 mm  →   2 507 k triangles,   57 Mo,   3,9 s
 *     plaque 100 × 40 cm, pas 0,4 mm  →  10 014 k triangles,  229 Mo,  18,1 s
 *
 * Deux cent vingt-neuf mégaoctets pour un rectangle que douze triangles
 * décrivent exactement. Les faces d'un prisme sont PLANES : elles n'ont besoin
 * de triangles que là où le contour tourne, jamais au milieu.
 *
 * On triangule donc le POLYGONE, pas la région — par découpe d'oreilles, les
 * trous cousus au contour extérieur. La même plaque tombe à quelques dizaines
 * de triangles, et le contour reste EXACT au lieu d'être rééchantillonné.
 */

/** Aire signée d'un anneau : positive s'il est parcouru dans le sens direct. */
function aireSignee(anneau: Polyline2): number {
  let a = 0;
  for (let k = 0; k < anneau.length; k++) {
    const [x1, y1] = anneau[k]!;
    const [x2, y2] = anneau[(k + 1) % anneau.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Le point est-il dans l'anneau ? Parité des traversées d'un rayon vers +x. */
function dansAnneau(anneau: Polyline2, px: number, py: number): boolean {
  let dedans = false;
  for (let k = 0; k < anneau.length; k++) {
    const [x1, y1] = anneau[k]!;
    const [x2, y2] = anneau[(k + 1) % anneau.length]!;
    if (y1 <= py === y2 <= py) continue;
    if (px < x1 + ((py - y1) / (y2 - y1)) * (x2 - x1)) dedans = !dedans;
  }
  return dedans;
}

/**
 * Range les contours en anneaux extérieurs et trous.
 *
 * On ne demande PAS au producteur des contours de déclarer lesquels sont des
 * trous, ni dans quel sens les parcourir. Beaucoup de chaînes l'exigent et se
 * trompent en silence quand on se trompe — un « o » plein au lieu d'un anneau.
 * Ici la profondeur d'imbrication tranche : profondeur paire, on est dehors ;
 * impaire, on est dans un trou.
 */
function grouperContours(outlines: readonly Polyline2[]): Array<{ exterieur: Point2[]; trous: Point2[][] }> {
  const anneaux = outlines.filter((c) => c.length >= 3 && Math.abs(aireSignee(c)) > 1e-12);
  const profondeur = anneaux.map((c, i) => {
    const [px, py] = c[0]!;
    let n = 0;
    for (let j = 0; j < anneaux.length; j++) if (j !== i && dansAnneau(anneaux[j]!, px, py)) n++;
    return n;
  });

  /** Le contenant le plus PROCHE : celui d'aire minimale parmi ceux qui le
   *  contiennent et se trouvent un cran plus haut. */
  const parent = anneaux.map((c, i) => {
    if (0 === profondeur[i]! % 2) return -1;
    let meilleur = -1;
    let aire = Infinity;
    const [px, py] = c[0]!;
    for (let j = 0; j < anneaux.length; j++) {
      if (j === i || profondeur[j]! !== profondeur[i]! - 1) continue;
      if (!dansAnneau(anneaux[j]!, px, py)) continue;
      const a = Math.abs(aireSignee(anneaux[j]!));
      if (a < aire) {
        aire = a;
        meilleur = j;
      }
    }
    return meilleur;
  });

  /** Sens imposé : extérieur direct, trou rétrograde. La découpe d'oreilles en
   *  dépend, et le producteur des contours n'a pas à s'en soucier. */
  const oriente = (c: Polyline2, direct: boolean): Point2[] => {
    const pts = c.map((p) => [p[0], p[1]] as Point2);
    if (aireSignee(pts) > 0 !== direct) pts.reverse();
    return pts;
  };

  const groupes = anneaux.map((c, i) =>
    0 === profondeur[i]! % 2 ? { exterieur: oriente(c, true), trous: [] as Point2[][] } : null,
  );
  for (let i = 0; i < anneaux.length; i++) {
    const p = parent[i]!;
    if (p >= 0 && groupes[p]) groupes[p]!.trous.push(oriente(anneaux[i]!, false));
  }
  return groupes.filter(Boolean) as Array<{ exterieur: Point2[]; trous: Point2[][] }>;
}

/** Le point p est-il dans le triangle abc, pris dans le sens direct ? */
function dansTriangle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number,
): boolean {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return d1 >= 0 && d2 >= 0 && d3 >= 0;
}

/**
 * Un sommet du polygone cousu.
 *
 * `pont` marque l'arête qui MÈNE AU SUIVANT comme étant un pont de couture, et
 * non un morceau de contour réel. Cette distinction n'est pas cosmétique : une
 * paroi verticale posée sur un pont produit deux faces superposées et opposées.
 * Le volume reste juste, la surface reste fermée — et l'on a fabriqué une
 * auto-intersection, exactement ce qu'un fichier de fabrication ne doit pas
 * contenir.
 */
interface Noeud {
  x: number;
  y: number;
  pont: boolean;
}

/**
 * Coud un trou au contour extérieur par un PONT.
 *
 * Le procédé est classique et vaut d'être dit : on part du point du trou le
 * plus à droite, on tire un rayon vers +x, on prend l'arête du contour qu'il
 * rencontre en premier, et l'on relie au sommet de cette arête qui est visible
 * depuis le trou. Le pont est ensuite parcouru DEUX FOIS, une fois dans chaque
 * sens : le polygone reste simple, et la découpe d'oreilles n'a plus de trou à
 * connaître.
 */
function coudreTrou(exterieur: Noeud[], trou: Noeud[]): Noeud[] {
  let iM = 0;
  for (let k = 1; k < trou.length; k++) if (trou[k]!.x > trou[iM]!.x) iM = k;
  const mx = trou[iM]!.x;
  const my = trou[iM]!.y;

  let plusProche = Infinity;
  let iP = -1;
  for (let k = 0; k < exterieur.length; k++) {
    const a = exterieur[k]!;
    const b = exterieur[(k + 1) % exterieur.length]!;
    if (a.y <= my === b.y <= my) continue;
    const x = a.x + ((my - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (x < mx || x - mx >= plusProche) continue;
    plusProche = x - mx;
    iP = a.x > b.x ? k : (k + 1) % exterieur.length;
  }
  // Le trou n'appartient pas à ce contour : on le laisse plutôt que de coudre
  // un polygone croisé, qui donnerait un maillage inexploitable.
  if (iP < 0) return exterieur;

  /*
   * Le sommet touché par le rayon n'est pas toujours VISIBLE depuis le trou :
   * un autre repli du contour peut s'interposer. On retient alors le sommet,
   * situé dans le triangle de visée, qui fait le plus petit angle avec le
   * rayon — c'est celui qu'on rencontre en premier en tournant.
   */
  const p0 = exterieur[iP]!;
  let meilleurAngle = Infinity;
  let iVis = iP;
  for (let k = 0; k < exterieur.length; k++) {
    if (k === iP) continue;
    const q = exterieur[k]!;
    if (q.x <= mx) continue;
    if (!dansTriangle(mx, my, mx + plusProche, my, p0.x, p0.y, q.x, q.y)) continue;
    const angle = Math.abs(q.y - my) / (q.x - mx);
    if (angle < meilleurAngle) {
      meilleurAngle = angle;
      iVis = k;
    }
  }

  const sortie: Noeud[] = [];
  for (let k = 0; k < iVis; k++) sortie.push(exterieur[k]!);
  // L'arête qui part d'ici entre dans le trou : c'est le pont aller.
  sortie.push({ ...exterieur[iVis]!, pont: true });
  for (let k = 0; k < trou.length; k++) sortie.push(trou[(iM + k) % trou.length]!);
  // Et celle-ci en ressort : c'est le pont retour.
  sortie.push({ ...trou[iM]!, pont: true });
  for (let k = iVis; k < exterieur.length; k++) sortie.push(exterieur[k]!);
  return sortie;
}

/**
 * Découpe d'oreilles.
 *
 * On retire une à une les « oreilles » — trois sommets consécutifs formant un
 * coin saillant et vide. C'est en O(n²), ce qui est sans importance ici : un
 * contour simplifié compte quelques centaines de points, pas des millions.
 */
function decouperLesOreilles(poly: readonly Noeud[]): number[] {
  const n = poly.length;
  const tris: number[] = [];
  if (n < 3) return tris;
  const restants: number[] = [];
  for (let k = 0; k < n; k++) restants.push(k);

  let garde = 0;
  while (restants.length > 3 && garde++ < n * n + 16) {
    let coupe = false;
    for (let k = 0; k < restants.length; k++) {
      const ia = restants[(k + restants.length - 1) % restants.length]!;
      const ib = restants[k]!;
      const ic = restants[(k + 1) % restants.length]!;
      const { x: ax, y: ay } = poly[ia]!;
      const { x: bx, y: by } = poly[ib]!;
      const { x: cx, y: cy } = poly[ic]!;
      // Coin saillant ?
      if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 0) continue;
      /*
       * Vide ? Aucun autre sommet restant à l'intérieur — À CECI PRÈS que les
       * sommets CONFONDUS avec un coin de l'oreille ne comptent pas.
       *
       * Coudre un trou duplique ses deux extrémités de pont, par construction.
       * Sans cette exception, chacun de ces doublons se trouve « dans » tout
       * triangle qui le touche, plus aucune oreille n'est trouvée, et la
       * découpe rend zéro triangle : une plaque trouée sortait avec ses vingt
       * arêtes de bord et un volume faux, sans rien signaler.
       */
      let vide = true;
      for (const j of restants) {
        if (j === ia || j === ib || j === ic) continue;
        const { x: px, y: py } = poly[j]!;
        if (
          (Math.abs(px - ax) < EPS_M && Math.abs(py - ay) < EPS_M)
          || (Math.abs(px - bx) < EPS_M && Math.abs(py - by) < EPS_M)
          || (Math.abs(px - cx) < EPS_M && Math.abs(py - cy) < EPS_M)
        ) continue;
        if (dansTriangle(ax, ay, bx, by, cx, cy, px, py)) {
          vide = false;
          break;
        }
      }
      if (!vide) continue;
      tris.push(ia, ib, ic);
      restants.splice(k, 1);
      coupe = true;
      break;
    }
    // Contour dégénéré ou croisé : on s'arrête plutôt que de tourner sans fin.
    if (!coupe) break;
  }
  if (3 === restants.length) tris.push(restants[0]!, restants[1]!, restants[2]!);
  return tris;
}

export interface PrismOptions {
  /** Cote du plan médian du prisme (m). Défaut : zéro. */
  zCenterM?: number;
}

/**
 * Le solide d'une PLAQUE — ou d'un caisson, ou d'une couche de lettre boîtier.
 *
 * Une plaque n'est pas une lentille : elle a des faces PLANES et des parois
 * verticales. Le contour donné sert donc tel quel, sans rééchantillonnage — la
 * découpe garde exactement la précision qu'elle avait en entrée.
 *
 * Les contours peuvent s'emboîter sans qu'on ait à déclarer leur sens ni leur
 * rôle : un « o » découpé à la lettre donne un anneau, pas un disque.
 */
export function buildPrismSolid(
  outlines: readonly Polyline2[],
  thicknessM: number,
  o: PrismOptions = {},
): Mesh {
  if (!(thicknessM > 0)) throw new Error('solide : épaisseur nulle ou négative');
  const zc = o.zCenterM ?? 0;
  const zHaut = zc + thicknessM / 2;
  const zBas = zc - thicknessM / 2;

  const positions: number[] = [];
  const indices: number[] = [];

  for (const { exterieur, trous } of grouperContours(outlines)) {
    let poly: Noeud[] = exterieur.map(([x, y]) => ({ x, y, pont: false }));
    // Les trous les plus à droite en premier : chaque pont doit viser un
    // contour que les ponts précédents n'ont pas encore traversé.
    const ordonnes = [...trous].sort(
      (a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])),
    );
    for (const trou of ordonnes) {
      poly = coudreTrou(poly, trou.map(([x, y]) => ({ x, y, pont: false })));
    }

    /*
     * LA SOUDURE, ET CE QU'ELLE REFERME.
     *
     * Le pont duplique deux sommets. Sans soudure, la face porte une FENTE le
     * long du pont : deux arêtes confondues d'indices différents, chacune vue
     * par un seul triangle — donc deux arêtes de bord, donc un volume ouvert.
     *
     * Soudés, les deux bords de la fente ne font qu'une arête, vue par les
     * deux triangles qui l'encadrent. La face redevient continue, et le
     * genre retrouve sa valeur : une plaque trouée est un tore, pas une sphère.
     */
    const memePoint = new Map<string, number>();
    const idx = poly.map((n) => {
      const cle = `${n.x}_${n.y}`;
      const vu = memePoint.get(cle);
      if (undefined !== vu) return vu;
      const id = positions.length / 3;
      positions.push(n.x, n.y, zHaut);
      positions.push(n.x, n.y, zBas);
      memePoint.set(cle, id);
      return id;
    });
    const haut = (k: number) => idx[k]!;
    const bas = (k: number) => idx[k]! + 1;

    for (const t of [decouperLesOreilles(poly)]) {
      for (let i = 0; i + 2 < t.length; i += 3) {
        const a = t[i]!;
        const b = t[i + 1]!;
        const c = t[i + 2]!;
        indices.push(haut(a), haut(b), haut(c));
        indices.push(bas(a), bas(c), bas(b));
      }
    }

    /*
     * LA PAROI, ET SON SENS.
     *
     * Le polygone cousu est parcouru dans le sens direct, donc son intérieur
     * est à GAUCHE de chaque arête, et la normale de la paroi doit pointer à
     * DROITE — d'où cet ordre de sommets et pas l'autre.
     *
     * Les ponts, eux, n'en reçoivent aucune : ce ne sont pas des bords de la
     * pièce, seulement le chemin par lequel on est entré dans le trou.
     */
    for (let k = 0; k < poly.length; k++) {
      if (poly[k]!.pont) continue;
      const a = k;
      const b = (k + 1) % poly.length;
      indices.push(haut(a), bas(b), haut(b));
      indices.push(haut(a), bas(a), bas(b));
    }
  }

  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

/* -------------------------------------------------------------------------- */
/* 4. Le contrôle                                                              */
/* -------------------------------------------------------------------------- */

export interface MeshReport {
  vertices: number;
  triangles: number;
  /** Arêtes n'appartenant qu'à UNE face. Zéro = le volume est fermé. */
  boundaryEdges: number;
  /** Arêtes partagées par plus de deux faces. Zéro = c'est une variété. */
  nonManifoldEdges: number;
  /** Arêtes parcourues deux fois dans le MÊME sens : orientation incohérente. */
  misorientedEdges: number;
  /** Volume signé (m³). Positif = normales vers l'extérieur. */
  volumeM3: number;
  areaM2: number;
  /** Genre de la surface — le nombre d'anses. Doit être un ENTIER. */
  genus: number;
  /** Vrai si le maillage est exportable en l'état. */
  ok: boolean;
}

/**
 * Ce qu'un trancheur vérifiera avant nous.
 *
 * Le contrôle décisif n'est pas le volume mais le compte d'arêtes : sur une
 * surface fermée et orientable, chaque arête est parcourue exactement deux
 * fois, une fois dans chaque sens. Une seule arête de bord, et le volume n'en
 * est plus un.
 *
 * Le genre se déduit d'Euler-Poincaré, `V − A + F = 2 − 2g`. Il n'a pas à
 * valoir zéro — un « o » a un trou, un « B » en a deux — mais il doit être
 * ENTIER : un demi-genre signale un maillage qui n'est pas une surface.
 */
export function meshReport(mesh: Mesh): MeshReport {
  const { positions, indices } = mesh;
  const nv = positions.length / 3;
  const nf = indices.length / 3;

  /** arête (min,max) → [nombre de parcours a→b, nombre de parcours b→a] */
  const aretes = new Map<number, [number, number]>();
  const cle = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);

  let volume6 = 0;
  let aire2 = 0;
  for (let f = 0; f < nf; f++) {
    const ia = indices[f * 3]!;
    const ib = indices[f * 3 + 1]!;
    const ic = indices[f * 3 + 2]!;
    for (const [u, v] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
      if (u === v) continue; // triangle dégénéré : l'arête n'existe pas
      const k = cle(u, v);
      let e = aretes.get(k);
      if (!e) aretes.set(k, (e = [0, 0]));
      e[u < v ? 0 : 1]++;
    }
    const ax = positions[ia * 3]!, ay = positions[ia * 3 + 1]!, az = positions[ia * 3 + 2]!;
    const bx = positions[ib * 3]!, by = positions[ib * 3 + 1]!, bz = positions[ib * 3 + 2]!;
    const cx = positions[ic * 3]!, cy = positions[ic * 3 + 1]!, cz = positions[ic * 3 + 2]!;
    // Volume signé : somme des tétraèdres (origine, a, b, c).
    volume6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    aire2 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let misorientedEdges = 0;
  for (const [ab, ba] of aretes.values()) {
    const total = ab + ba;
    if (1 === total) boundaryEdges++;
    else if (total > 2) nonManifoldEdges++;
    else if (2 === total && 1 !== ab) misorientedEdges++;
  }

  const genus = (2 - (nv - aretes.size + nf)) / 2;
  const volumeM3 = volume6 / 6;
  return {
    vertices: nv,
    triangles: nf,
    boundaryEdges,
    nonManifoldEdges,
    misorientedEdges,
    volumeM3,
    areaM2: aire2 / 2,
    genus,
    ok: 0 === boundaryEdges && 0 === nonManifoldEdges && 0 === misorientedEdges && volumeM3 > 0,
  };
}

/** Longueur cumulée d'un réseau de polylignes (m) — la ligne médiane. */
export function polylineLengthM(strokes: readonly Polyline2[]): number {
  let total = 0;
  for (const s of strokes) {
    for (let k = 1; k < s.length; k++) {
      total += Math.hypot(s[k]![0] - s[k - 1]![0], s[k]![1] - s[k - 1]![1]);
    }
  }
  return total;
}
