/**
 * LE CATALOGUE D'ALIMENTATIONS DU MARCHAND (chantier A1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 *
 * Ce dépôt ne vend pas de néons : il vend la solution à ceux qui en vendent. Le
 * bloc d'alimentation qu'un atelier achète — sa référence, sa puissance, sa
 * tension, son indice de protection, son prix — n'appartient donc pas au
 * produit. Il appartient à chaque intégrateur, et il est différent pour chacun.
 *
 * `psuRatingsW` permettait déjà de déclarer des CALIBRES. C'est la moitié du
 * chemin : on savait qu'un 100 W existe, pas ce qu'il coûte ni sous quelle
 * tension il sort.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA FICHE SUPPRIME
 *
 * docs/44 liste un contrôle **manuel** : « rien ne vérifie qu'un HLG-150H-24A
 * saisi sur un design 12 V soit cohérent », et la seule protection est que la
 * fiche technique imprime la tension deux lignes au-dessus — c'est-à-dire un
 * humain attentif, à chaque commande.
 *
 * Une alimentation déclarée avec sa tension se vérifie en machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE HÉRITÉE DE `TubeCatalogEntry`, ET ELLE NE SE NÉGOCIE PAS
 *
 * « Un marchand qui veut seulement nommer ses blocs n'a pas à remplir une fiche
 * technique, et un champ vide vaut "comme le réglage général", **jamais zéro**. »
 *
 * Conséquence directe sur les prix : un catalogue vide laisse `powerTiersCents`
 * décider, exactement comme aujourd'hui. Déclarer une alimentation sans prix ne
 * change rien non plus. **Rien ne bouge tant que le marchand n'a rien dit.**
 */

/** Une alimentation réellement achetée par l'atelier. */
export interface PsuCatalogEntry {
  /** Référence chez le fournisseur — ce qu'on tape sur un bon de commande. */
  sku: string;
  /** Nom montré à l'atelier ; à défaut, le `sku`. */
  label?: string;
  /** Puissance nominale de sortie, en watts. */
  wattsNominal: number;
  /** Tension de sortie. Doit correspondre à celle de la bobine. */
  voltage: 12 | 24;
  /**
   * Indice de protection tel qu'annoncé par la fiche : « IP20 », « IP65 »…
   *
   * Il n'est pas déduit : un bloc en coffret métal peut être IP67 sans que rien
   * dans sa référence ne le dise, et l'inventer exposerait un client à un bloc
   * noyé.
   */
  ip?: string;
  /**
   * Prix de VENTE de l'alimentation, en centimes.
   *
   * Absent : les paliers `powerTiersCents` de la boutique s'appliquent. C'est
   * ce qui permet à un marchand de nommer ses blocs sans revoir son barème.
   */
  priceCents?: number;
  /** Le bloc accepte-t-il un variateur ? */
  dimmable?: boolean;
}

/** Pourquoi une alimentation a été écartée. */
export type MotifRefusPsu = 'tension' | 'puissance' | 'exterieur' | 'variateur';

/** Ce que la sélection a retenu, et ce qu'elle a écarté. */
export interface ChoixAlimentation {
  /** L'alimentation retenue, ou `null` si aucune ne convient. */
  choix: PsuCatalogEntry | null;
  /**
   * Ce qui a écarté chaque référence, dans l'ordre du catalogue.
   *
   * Ce n'est pas du confort : quand aucune alimentation ne convient, « aucune
   * ne convient » n'aide personne. « Les trois sont en 12 V, votre bobine est
   * en 24 » dit quoi acheter.
   */
  refus: Array<{ sku: string; motif: MotifRefusPsu }>;
}

/** Un indice de protection est-il tenable dehors ? IP65 au minimum. */
export function tenableDehors(ip: string | undefined): boolean {
  if (!ip) return false;
  const m = /^IP(\d)(\d)$/i.exec(ip.trim());
  if (!m) return false;
  // Le second chiffre est celui de l'eau ; c'est lui qui décide dehors.
  return Number(m[2]) >= 5;
}

/**
 * Choisit la plus petite alimentation qui tient la charge.
 *
 * @param wattsRequis Puissance NOMINALE nécessaire, dérating déjà appliqué —
 *   `electricalPlan` divise déjà la demande par le taux de charge, et le
 *   refaire ici surdimensionnerait deux fois.
 * @param catalogue  Les blocs que le marchand a déclarés.
 * @param besoin     Ce que le design impose.
 */
export function choisirAlimentation(
  wattsRequis: number,
  catalogue: readonly PsuCatalogEntry[],
  besoin: { voltage: number; exterieur?: boolean; variateur?: boolean },
): ChoixAlimentation {
  const refus: ChoixAlimentation['refus'] = [];
  const retenues: PsuCatalogEntry[] = [];

  for (const p of catalogue) {
    /*
     * L'ORDRE DES REFUS COMPTE, et il va du plus structurel au plus accessoire.
     *
     * Un bloc 12 V sur une bobine 24 V est une erreur d'achat ; un bloc trop
     * petit se remplace par le modèle du dessus. Signaler « puissance » sur un
     * bloc qui de toute façon n'a pas la bonne tension enverrait le marchand
     * commander une version plus puissante du mauvais produit.
     */
    if (p.voltage !== besoin.voltage) { refus.push({ sku: p.sku, motif: 'tension' }); continue; }
    if (besoin.exterieur && !tenableDehors(p.ip)) { refus.push({ sku: p.sku, motif: 'exterieur' }); continue; }
    if (besoin.variateur && false === p.dimmable) { refus.push({ sku: p.sku, motif: 'variateur' }); continue; }
    if (p.wattsNominal < wattsRequis) { refus.push({ sku: p.sku, motif: 'puissance' }); continue; }
    retenues.push(p);
  }

  // La plus petite qui tient : un bloc surdimensionné coûte plus cher et
  // travaille moins bien à faible charge.
  retenues.sort((a, b) => a.wattsNominal - b.wattsNominal);
  return { choix: retenues[0] ?? null, refus };
}

/**
 * L'alimentation saisie est-elle cohérente avec la tension du tube ?
 *
 * C'est le contrôle qui remplace un œil humain. Rend `null` quand tout va bien,
 * sinon la phrase à afficher — écrite pour un atelier, pas pour un journal.
 */
export function incoherenceTension(
  psu: Pick<PsuCatalogEntry, 'sku' | 'voltage'> | null | undefined,
  tubeVoltage: number,
): string | null {
  if (!psu) return null;
  if (psu.voltage === tubeVoltage) return null;
  return `${psu.sku} sort en ${psu.voltage} V, le tube est en ${tubeVoltage} V.`;
}
