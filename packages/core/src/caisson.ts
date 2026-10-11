/**
 * HOMOGÉNÉITÉ DE LA FACE D'UN CAISSON (E24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION
 *
 * « Pourquoi je vois des points sur ma face ? » La compétence `caisson-lumineux`
 * la pose en tête : à 6 cm de profondeur — le minimum accepté par
 * `validate.ts` — des modules trop espacés donnent des taches, et sa règle de
 * clôture est sans appel : **ne jamais laisser une profondeur au catalogue sans
 * le pas de LED qui la rend homogène.**
 *
 * Le pas était déjà calculé, mais enfermé dans `wattsPerM2ForDepth` où il ne
 * servait qu'à une puissance. Il en sort ici, et rien n'est recalculé en double :
 * `wattsPerM2ForDepth` appelle désormais `entraxeModulesMm`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MODÈLE, ET CE QU'IL NE PRÉTEND PAS ÊTRE
 *
 * Des rangées parallèles de modules lambertiens, à distance `h` sous la face.
 * L'éclairement reçu par un point de la face, à la distance transversale x d'une
 * rangée, s'obtient en intégrant les éléments de la rangée le long de sa
 * longueur :
 *
 *     E(x) = Σ_k  h² / ((x − k·p)² + h²)^{3/2}          (à une constante près)
 *
 * — la somme portant sur TOUTES les rangées, pas seulement la plus proche : ce
 * sont les voisines qui remplissent les creux, et un modèle à une seule rangée
 * conclurait au tachetage partout.
 *
 * C'est de la photométrie de manuel — loi en carré inverse et loi de Lambert —
 * pas une allégation de fabricant. Mais il faut dire ce qu'elle ne couvre pas :
 * elle donne l'éclairement **incident sur la face intérieure**, AVANT que le
 * diffuseur ne l'étale. Un PMMA opale à 47 % de transmission adoucit encore le
 * résultat. Le nombre produit ici n'est donc **pas** ce que l'œil voit ; c'est un
 * indice comparatif.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE SEUIL — ET POURQUOI PAS DU BREVET
 *
 * La compétence cite « uniformité acceptable sous 30 % de variation »
 * (US 7303309). Ce brevet **n'est pas dans le fonds** : la compétence le range
 * elle-même parmi ses sources non vérifiables. La règle 2 de `CLAUDE.md`
 * interdit de le transformer en constante du code.
 *
 * On prend donc le seuil ailleurs, et à une source qu'on peut ouvrir :
 * **l'entraxe que SloanLED recommande lui-même**, passé dans le modèle
 * ci-dessus. Autrement dit, « acceptable » = ce que le fabricant expédie.
 *
 *     profondeur   entraxe    h        uniformité
 *       30 mm       75 mm    27 mm       0,397  ← la plus basse
 *       40 mm      100 mm    37 mm       0,417
 *       50 mm      125 mm    47 mm       0,429
 *       60 mm      150 mm    57 mm       0,437
 *
 * Quatre profondeurs, quatre entraxes, une uniformité **quasi constante**. Ce
 * n'est pas un hasard : le fabricant maintient un rapport entraxe/distance à peu
 * près fixe, ce qui revient exactement à maintenir l'uniformité. Cette constance
 * est la meilleure preuve que le modèle décrit bien ce que la table encode.
 *
 * Le seuil est donc **0,39**, juste sous la plus basse des quatre. Un caisson
 * qui fait moins bien que le plus serré des cas recommandés est tacheté.
 *
 * L'arrondi va vers le BAS, et ce n'est pas un détail : arrondi à 0,40, le seuil
 * condamnait le cas à 30 mm qui vaut 0,397 — c'est-à-dire qu'il déclarait
 * tacheté un montage que le fabricant recommande. Un seuil calibré sur une
 * référence ne doit jamais condamner sa propre référence ; le témoin l'a
 * attrapé.
 */

/**
 * Épaisseur de face retenue pour calculer la distance LED-face.
 *
 * ESP : 3 mm jusqu'à 800 mm de hauteur, 4 mm au-delà. On prend 3 mm, le cas le
 * plus courant, et le SENS de l'approximation est le bon : une face plus épaisse
 * rapproche encore les LED, ce qui dégrade l'uniformité — on ne la surestime
 * donc jamais.
 */
export const EPAISSEUR_FACE_MM = 3;

/**
 * Distance des modules à la face, en millimètres.
 *
 * Ce n'est PAS la profondeur hors-tout, et la confusion entre les deux est
 * exactement ce qui a fait écrire « règle 2:1 » là où la fiche tabule 2,5. Le
 * module est posé au fond ; la lumière traverse la profondeur intérieure moins
 * l'épaisseur de la face.
 */
export function distanceLedFaceMm(profondeurCm: number, epaisseurFaceMm = EPAISSEUR_FACE_MM): number {
  return Math.max(0, profondeurCm * 10 - epaisseurFaceMm);
}

/**
 * Entraxe des rangées de modules, en millimètres, pour une profondeur donnée.
 *
 * Table `sloanled-brightline-2-modules-caisson-faible-profondeur.pdf` : 75, 100,
 * 125 puis 150 mm pour 30, 40, 50 et 60 mm de profondeur — soit 2,5 fois la
 * profondeur, plafonné à 150. Au-delà de 122 mm on change de gamme : le
 * SignBOX II travaille en rangées à 305 mm (12 pouces).
 *
 * Rend 0 sur une profondeur nulle ou négative — il n'y a alors pas de caisson.
 */
export function entraxeModulesMm(profondeurCm: number): number {
  const profondeurMm = Math.max(0, profondeurCm) * 10;
  if (profondeurMm <= 0) return 0;
  if (profondeurMm >= 122) return 305;
  return Math.min(150, 2.5 * profondeurMm);
}

/**
 * Éclairement relatif reçu par la face, à la distance transversale `xMm` d'une
 * rangée, pour un entraxe `pMm` et une distance LED-face `hMm`.
 *
 * La somme porte sur `n` rangées de part et d'autre. Vingt suffisent : la
 * contribution d'une rangée décroît en 1/d³, et la vingtième pèse moins de
 * 10⁻⁴ de la première.
 */
export function eclairementFace(xMm: number, pMm: number, hMm: number, n = 20): number {
  if (!(hMm > 0) || !(pMm > 0)) return 0;
  let s = 0;
  for (let k = -n; k <= n; k++) {
    const d = xMm - k * pMm;
    s += (hMm * hMm) / Math.pow(d * d + hMm * hMm, 1.5);
  }
  return s;
}

/**
 * Uniformité incidente : le rapport du minimum au maximum sur une période.
 *
 * 1 est un éclairement parfaitement plat ; plus on descend, plus les rangées se
 * dessinent. C'est un INDICE COMPARATIF, pas un pourcentage perçu — voir l'entête
 * du fichier sur ce que le modèle ne couvre pas.
 */
export function uniformiteIncidente(entraxeMm: number, hMm: number, echantillons = 200): number {
  if (!(entraxeMm > 0) || !(hMm > 0)) return 0;
  let mini = Number.POSITIVE_INFINITY;
  let maxi = 0;
  for (let i = 0; i <= echantillons; i++) {
    // Une demi-période suffit : le motif est symétrique autour de chaque rangée.
    const e = eclairementFace((i / echantillons) * (entraxeMm / 2), entraxeMm, hMm);
    if (e < mini) mini = e;
    if (e > maxi) maxi = e;
  }
  return maxi > 0 ? mini / maxi : 0;
}

/**
 * Le seuil, calibré sur les entraxes que le fabricant recommande lui-même.
 *
 * Voir l'entête : la plus basse des quatre valeurs de la table SloanLED vaut
 * 0,397, à 30 mm ; on arrondit VERS LE BAS, sans quoi le seuil condamnerait sa
 * propre référence. Un caisson qui fait moins bien que le plus serré des cas
 * recommandés est tacheté.
 */
export const UNIFORMITE_ACCEPTABLE = 0.39;

export interface HomogeneiteCaisson {
  /** Entraxe retenu, en mm. */
  entraxeMm: number;
  /** Distance des modules à la face, en mm. */
  distanceLedFaceMm: number;
  /** Rapport entraxe / distance — la grandeur que la règle de métier borne. */
  rapport: number;
  /** Indice d'uniformité incidente, entre 0 et 1. */
  uniformite: number;
  /** La face montrera-t-elle les rangées ? */
  tachete: boolean;
  /** Nombre de rangées sur la hauteur donnée. */
  rangees: number;
}

/**
 * Homogénéité d'une face de caisson.
 *
 * @param profondeurCm Profondeur hors-tout.
 * @param hauteurCm    Hauteur de la face, pour compter les rangées.
 * @param entraxeMm    Entraxe imposé. Absent, celui de la table.
 */
export function homogeneiteCaisson(
  profondeurCm: number,
  hauteurCm: number,
  entraxeMm?: number,
): HomogeneiteCaisson | null {
  const h = distanceLedFaceMm(profondeurCm);
  const p = 'number' === typeof entraxeMm && entraxeMm > 0 ? entraxeMm : entraxeModulesMm(profondeurCm);
  if (!(h > 0) || !(p > 0)) return null;
  const u = uniformiteIncidente(p, h);
  return {
    entraxeMm: p,
    distanceLedFaceMm: h,
    rapport: p / h,
    uniformite: u,
    tachete: u < UNIFORMITE_ACCEPTABLE,
    // Une rangée aux deux bords plus celles du milieu : c'est ainsi qu'un
    // atelier pose, et c'est ce qui évite le bord sombre.
    rangees: Math.max(1, Math.round((hauteurCm * 10) / p) + 1),
  };
}

/**
 * Le profil transversal d'éclairement, NORMALISÉ à 1 au maximum.
 *
 * C'est ce que la vue 3D peint sur la face, à la place du dégradé radial qui ne
 * dépendait de rien (E24). Le rendu cesse alors d'être décoratif : desserrer les
 * rangées fait apparaître les bandes, et c'est le seul moyen honnête de
 * justifier au client qu'un caisson plus profond coûte plus cher.
 *
 * @param echantillons Nombre de points rendus sur la hauteur.
 * @param hauteurMm    Hauteur de la face.
 */
export function profilFace(
  echantillons: number,
  hauteurMm: number,
  entraxeMm: number,
  hMm: number,
): number[] {
  const n = Math.max(2, Math.floor(echantillons));
  if (!(hauteurMm > 0) || !(entraxeMm > 0) || !(hMm > 0)) return new Array(n).fill(1);
  const v: number[] = [];
  // On centre le motif sur la face : une rangée au milieu, symétrique aux bords.
  for (let i = 0; i < n; i++) {
    const y = (i / (n - 1) - 0.5) * hauteurMm;
    v.push(eclairementFace(y, entraxeMm, hMm));
  }
  const maxi = Math.max(...v);
  return maxi > 0 ? v.map((x) => x / maxi) : v.map(() => 1);
}
