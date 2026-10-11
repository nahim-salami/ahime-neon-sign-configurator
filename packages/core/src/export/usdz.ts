/**
 * USDZ — le fichier que l'iPhone pose sur le mur du client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FORMAT EXISTE ICI
 *
 * `realite-augmentee-widget` §1 : Safari sur iOS ne fait toujours pas de WebXR
 * `immersive-ar`. Ce n'est pas une lacune à contourner — AR Quick Look donne un
 * suivi, un éclairage et une occlusion meilleurs que ce qu'on écrirait, et il
 * s'ouvre depuis un simple lien vers un USDZ. **Sur iOS on livre un fichier, on
 * n'écrit pas une application.**
 *
 * Android prend le GLB, qui existe déjà (`glb.ts`). Les deux chemins sont
 * nécessaires ; aucun ne remplace l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÉCRIT À LA MAIN, POUR LA MÊME RAISON QUE LE GLB
 *
 * three.js embarque un `USDZExporter`, et il fonctionne. Mais il vit dans le lot
 * de la vue 3D, alors que ce module doit rester testable dans Node : c'est là
 * qu'on vérifie qu'un fichier fait bien les centimètres qu'il annonce, et un
 * contrôle qui demande un navigateur ne tourne pas à chaque commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE N'EST PAS L'USD, C'EST L'ARCHIVE
 *
 * Un USDZ est un ZIP, et Apple lui impose deux contraintes que personne
 * n'applique par défaut :
 *
 *   1. **AUCUNE COMPRESSION.** Les données doivent être lisibles en place ; un
 *      zip « deflate », pourtant parfaitement valide, ne s'ouvre pas.
 *   2. **ALIGNEMENT SUR 64 OCTETS.** Le contenu de chaque fichier doit commencer
 *      à un multiple de 64, faute de quoi la lecture par projection mémoire
 *      échoue. On y arrive en gonflant le champ « extra » de l'en-tête local,
 *      qui existe précisément pour ce genre de bourrage.
 *
 * Aucune bibliothèque de zip du dépôt n'expose ces deux réglages ensemble ; un
 * ZIP « stored » à une entrée tient en cinquante lignes, et on le maîtrise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'UNITÉ ET L'ORIENTATION
 *
 * `metersPerUnit = 1` et `upAxis = "Y"`, exactement comme le GLB. Le maillage
 * arrive déjà en mètres : il n'y a RIEN à convertir, et c'est précisément pour
 * cela qu'il ne faut rien convertir — chaque facteur ajouté est une occasion de
 * se tromper d'un facteur cent.
 */

import type { Mesh } from '../solid.js';

export interface UsdzOptions {
  /** Nom de la pièce, visible dans Quick Look. */
  nom: string;
  /** Couleur de base, en sRGB 0–1. */
  couleur?: [number, number, number];
  /** Couleur d'émission, en sRGB 0–1. Absente : la pièce n'émet pas. */
  emission?: [number, number, number];
  rugosite?: number;
  metallique?: number;
}

/** Trois décimales : le millimètre, et le fichier reste lisible. */
const f = (v: number) => {
  const s = (Math.round(v * 1000) / 1000).toString();
  return '-0' === s ? '0' : s;
};

/**
 * Le texte USD de la scène.
 *
 * On écrit du `.usda` — la forme TEXTE — et non du `.usdc` binaire. Quick Look
 * accepte les deux ; le texte se relit à l'œil, se compare dans un diff, et son
 * unité s'y vérifie en une ligne. Pour un maillage de cette taille, l'écart de
 * poids ne justifie pas de perdre cela.
 */
export function meshVersUsda(mesh: Mesh, o: UsdzOptions): string {
  const n = mesh.positions.length / 3;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(`(${f(mesh.positions[i * 3]!)}, ${f(mesh.positions[i * 3 + 1]!)}, ${f(mesh.positions[i * 3 + 2]!)})`);
  }
  const tri = mesh.indices.length / 3;
  const comptes: string[] = [];
  const idx: number[] = [];
  for (let t = 0; t < tri; t++) {
    comptes.push('3');
    idx.push(mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!);
  }

  const c = o.couleur ?? [1, 1, 1];
  const e = o.emission ?? [0, 0, 0];
  // Un nom de prim USD n'accepte que des lettres, chiffres et soulignés, et ne
  // commence pas par un chiffre. Un nom de client peut être n'importe quoi.
  const prim = (o.nom || 'Neon').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1') || 'Neon';

  return `#usda 1.0
(
    defaultPrim = "${prim}"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "${prim}"
{
    def Mesh "maillage"
    {
        uniform bool doubleSided = 1
        int[] faceVertexCounts = [${comptes.join(', ')}]
        int[] faceVertexIndices = [${idx.join(', ')}]
        point3f[] points = [${pts.join(', ')}]
        rel material:binding = </${prim}/matiere>
        uniform token subdivisionScheme = "none"
    }

    def Material "matiere"
    {
        token outputs:surface.connect = </${prim}/matiere/surface.outputs:surface>

        def Shader "surface"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (${f(c[0])}, ${f(c[1])}, ${f(c[2])})
            color3f inputs:emissiveColor = (${f(e[0])}, ${f(e[1])}, ${f(e[2])})
            float inputs:metallic = ${f(o.metallique ?? 0)}
            float inputs:roughness = ${f(o.rugosite ?? 0.4)}
            token outputs:surface
        }
    }
}
`;
}

/** Écrit un entier sur quatre octets, petit-boutiste. */
function u32(vue: DataView, pos: number, v: number): void {
  vue.setUint32(pos, v >>> 0, true);
}

/**
 * Emballe un `.usda` dans un `.usdz`.
 *
 * ZIP à une seule entrée, SANS compression et aligné sur 64 octets — voir
 * l'entête du fichier pour les deux raisons.
 */
export function usdaVersUsdz(usda: string, nomInterne = 'model.usda'): Uint8Array {
  const donnees = new TextEncoder().encode(usda);
  const nom = new TextEncoder().encode(nomInterne);

  /*
   * LE BOURRAGE VA DANS LE CHAMP « EXTRA », PAS AVANT L'EN-TÊTE.
   *
   * L'en-tête local fait 30 octets, plus le nom, plus l'extra. Le contenu
   * commence donc à 30 + nom + extra : on choisit l'extra pour que cette somme
   * tombe sur un multiple de 64.
   *
   * Un champ extra a lui-même un en-tête de 4 octets (identifiant + longueur).
   * Si le bourrage nécessaire est inférieur à 4, on ajoute 64 : mieux vaut
   * soixante-quatre octets perdus qu'un champ extra malformé.
   */
  const avant = 30 + nom.length;
  let extra = (64 - (avant % 64)) % 64;
  if (extra > 0 && extra < 4) extra += 64;

  const tailleLocale = avant + extra;
  const tailleCentrale = 46 + nom.length;
  const total = tailleLocale + donnees.length + tailleCentrale + 22;

  const out = new Uint8Array(total);
  const vue = new DataView(out.buffer);
  let p = 0;

  // --- en-tête local ------------------------------------------------------
  u32(vue, p, 0x04034b50); p += 4;
  vue.setUint16(p, 20, true); p += 2;   // version minimale
  vue.setUint16(p, 0, true); p += 2;    // drapeaux
  vue.setUint16(p, 0, true); p += 2;    // méthode 0 = STORED, jamais deflate
  vue.setUint16(p, 0, true); p += 2;    // heure
  vue.setUint16(p, 0, true); p += 2;    // date
  const crc = crc32(donnees);
  u32(vue, p, crc); p += 4;
  u32(vue, p, donnees.length); p += 4;  // compressé  = brut, puisque STORED
  u32(vue, p, donnees.length); p += 4;  // décompressé
  vue.setUint16(p, nom.length, true); p += 2;
  vue.setUint16(p, extra, true); p += 2;
  out.set(nom, p); p += nom.length;
  if (extra > 0) {
    // Identifiant 0x0000 : un champ inconnu, que tout lecteur saute. C'est
    // exactement l'usage prévu pour du bourrage.
    vue.setUint16(p, 0, true);
    vue.setUint16(p + 2, extra - 4, true);
    p += extra;
  }

  const debutDonnees = p;
  out.set(donnees, p); p += donnees.length;

  // --- répertoire central -------------------------------------------------
  const debutCentral = p;
  u32(vue, p, 0x02014b50); p += 4;
  vue.setUint16(p, 20, true); p += 2;   // version d'écriture
  vue.setUint16(p, 20, true); p += 2;   // version minimale
  vue.setUint16(p, 0, true); p += 2;
  vue.setUint16(p, 0, true); p += 2;    // STORED
  vue.setUint16(p, 0, true); p += 2;
  vue.setUint16(p, 0, true); p += 2;
  u32(vue, p, crc); p += 4;
  u32(vue, p, donnees.length); p += 4;
  u32(vue, p, donnees.length); p += 4;
  vue.setUint16(p, nom.length, true); p += 2;
  vue.setUint16(p, 0, true); p += 2;    // pas d'extra au central
  vue.setUint16(p, 0, true); p += 2;    // commentaire
  vue.setUint16(p, 0, true); p += 2;    // disque
  vue.setUint16(p, 0, true); p += 2;    // attributs internes
  u32(vue, p, 0); p += 4;               // attributs externes
  u32(vue, p, 0); p += 4;               // décalage de l'en-tête local
  out.set(nom, p); p += nom.length;

  // --- fin du répertoire --------------------------------------------------
  u32(vue, p, 0x06054b50); p += 4;
  vue.setUint16(p, 0, true); p += 2;    // numéro de disque
  vue.setUint16(p, 0, true); p += 2;    // disque du répertoire central
  vue.setUint16(p, 1, true); p += 2;    // entrées sur ce disque
  vue.setUint16(p, 1, true); p += 2;    // entrées au total
  u32(vue, p, tailleCentrale); p += 4;  // taille du répertoire central
  u32(vue, p, debutCentral); p += 4;    // où il commence
  vue.setUint16(p, 0, true); p += 2;    // longueur du commentaire

  // Contrôle : le contenu DOIT commencer sur un multiple de 64.
  if (0 !== debutDonnees % 64) {
    throw new Error(`usdz : contenu non aligné (${debutDonnees})`);
  }
  return out;
}

/** Table CRC-32, calculée une fois. */
let TABLE: Uint32Array | null = null;
function crc32(d: Uint8Array): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Le chemin complet : un maillage en mètres, un USDZ prêt pour Quick Look. */
export function meshVersUsdz(mesh: Mesh, o: UsdzOptions): Uint8Array {
  return usdaVersUsdz(meshVersUsda(mesh, o));
}
