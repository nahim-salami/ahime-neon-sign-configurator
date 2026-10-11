/**
 * SCISSION EN PANNEAUX (E19).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UNE CONTRAINTE DE MATIÈRE
 *
 * `materiaux-enseigne` §2 le dit sans ambiguïté : « la plaque d'achat autorise
 * 3050 × 2030 mm en coulé ; ce qui borne une pièce d'un seul tenant n'est donc
 * pas la matière mais **le transport** ». Et : « la scission en panneaux est une
 * **règle marchande** liée à son transporteur, pas une contrainte de
 * fabrication. »
 *
 * D'où la forme de ce fichier : il ne décide de rien, il applique un seuil que
 * le marchand règle. Les défauts viennent de ce que la compétence relève chez
 * les concurrents — 150 × 300 cm chez des imprimeurs, 2,34 × 1,19 m chez Custom
 * Neon — et elle précise que **ces chiffres ne sont pas sourcés dans le
 * dépôt** : ce sont des points de départ, pas des mesures.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCINDER N'EST PAS REFUSER
 *
 * Une pièce trop grande pour un colis n'est pas infabricable : elle part en
 * plusieurs panneaux, avec un joint. C'est un AVERTISSEMENT et un supplément,
 * jamais un blocage — bloquer perdrait la vente la plus rentable du catalogue.
 *
 * Ce qui doit être dit au client, en revanche, c'est qu'il y aura un joint
 * VISIBLE, et où. Le découvrir à la livraison est exactement le genre d'écart
 * que ce projet combat.
 */

export interface LimitesTransport {
  /** Plus grande dimension livrable d'un seul tenant (cm). */
  maxLongueurCm: number;
  /** Plus petite des deux dimensions du colis (cm). */
  maxLargeurCm: number;
}

/**
 * Défauts de place — relevés chez des concurrents, NON SOURCÉS dans le dépôt.
 *
 * 234 × 119 cm est ce que Custom Neon annonce avant de scinder. La compétence
 * le note comme relevé sur leur site, et c'est à ce titre qu'il sert de point
 * de départ : le marchand le remplace par ce que son transporteur accepte.
 */
export const TRANSPORT_DEFAUT: Readonly<LimitesTransport> = Object.freeze({
  maxLongueurCm: 234,
  maxLargeurCm: 119,
});

export interface Scission {
  /** Nombre de panneaux à fabriquer. 1 = pièce d'un seul tenant. */
  panneaux: number;
  /** Où passent les coupes, en centimètres depuis le bord gauche ou bas. */
  coupesCm: number[];
  /** Sens des coupes. `null` quand il n'y en a pas. */
  sens: 'verticale' | 'horizontale' | null;
  /** Dimensions d'un panneau (cm) — elles sont égales entre elles. */
  panneauCm: { largeurCm: number; hauteurCm: number };
}

/**
 * En combien de panneaux une pièce doit-elle partir.
 *
 * ── ON COUPE DANS LE SENS LE PLUS LONG, ET EN PARTS ÉGALES ────────────────
 *
 * Deux décisions qui ne sont pas des détails. Couper le côté le plus long
 * minimise le nombre de joints ; couper en parts INÉGALES donnerait un panneau
 * étroit qui gauchit au transport et un joint décentré, que l'œil trouve
 * immédiatement sur une enseigne.
 */
export function scissionRequise(
  largeurCm: number,
  hauteurCm: number,
  limites: LimitesTransport = TRANSPORT_DEFAUT,
): Scission {
  const L = Math.max(0, largeurCm);
  const H = Math.max(0, hauteurCm);
  const maxL = limites.maxLongueurCm > 0 ? limites.maxLongueurCm : TRANSPORT_DEFAUT.maxLongueurCm;
  const maxl = limites.maxLargeurCm > 0 ? limites.maxLargeurCm : TRANSPORT_DEFAUT.maxLargeurCm;

  /*
   * LE COLIS N'A PAS DE SENS : une pièce de 100 × 200 tient dans un colis de
   * 234 × 119 en la couchant. On compare donc la plus grande dimension à la
   * plus grande limite, et la plus petite à la plus petite — et non largeur à
   * largeur, ce qui refuserait une pièce parfaitement transportable.
   */
  const grand = Math.max(L, H);
  const petit = Math.min(L, H);
  const grandeLimite = Math.max(maxL, maxl);
  const petiteLimite = Math.min(maxL, maxl);

  if (grand <= grandeLimite && petit <= petiteLimite) {
    return { panneaux: 1, coupesCm: [], sens: null, panneauCm: { largeurCm: L, hauteurCm: H } };
  }

  // On coupe le côté le plus long : c'est celui qui dépasse, et c'est le
  // découpage qui donne le moins de joints.
  const couperLaLargeur = L >= H;
  const aDecouper = couperLaLargeur ? L : H;
  const autre = couperLaLargeur ? H : L;

  /*
   * LE NOMBRE DE PANNEAUX DÉPEND DES DEUX CÔTÉS.
   *
   * Couper seulement le côté long ne suffit pas si l'autre dépasse déjà la
   * petite limite : chaque morceau resterait hors colis. On borne donc le
   * morceau par la limite qui LAISSE PASSER l'autre côté.
   */
  const limitePourLeMorceau = autre <= petiteLimite ? grandeLimite : petiteLimite;
  const panneaux = Math.max(1, Math.ceil(aDecouper / Math.max(1, limitePourLeMorceau)));
  const pas = aDecouper / panneaux;

  const coupesCm: number[] = [];
  for (let i = 1; i < panneaux; i++) coupesCm.push(Math.round(pas * i * 10) / 10);

  return {
    panneaux,
    coupesCm,
    sens: couperLaLargeur ? 'verticale' : 'horizontale',
    panneauCm: couperLaLargeur
      ? { largeurCm: Math.round(pas * 10) / 10, hauteurCm: H }
      : { largeurCm: L, hauteurCm: Math.round(pas * 10) / 10 },
  };
}

/** Ce qu'on dit au client — le joint se voit, il doit le savoir avant. */
export function messageScission(s: Scission): string | null {
  if (s.panneaux <= 1) return null;
  const sens = 'verticale' === s.sens ? 'verticaux' : 'horizontaux';
  // Virgule décimale : l'interface écrit « 683 × 94 cm » partout ailleurs, et
  // « 226.3 » au milieu d'une phrase française est un anglicisme.
  const n = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  return `Trop grande pour un seul colis : livrée en ${s.panneaux} panneaux ${sens} `
    + `de ${n(s.panneauCm.largeurCm)} × ${n(s.panneauCm.hauteurCm)} cm, `
    + `assemblés à la pose. Le joint reste visible de près.`;
}
