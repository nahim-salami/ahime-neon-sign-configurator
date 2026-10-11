/**
 * GLB — le fichier qu'on REGARDE, et celui que la réalité augmentée posera
 * sur un mur.
 *
 * Écrit à la main, sans three.js : ce module doit rester testable dans Node et
 * hors du lot de la vue 3D. Un GLB de maillage est un format simple — un
 * en-tête, un morceau de JSON, un morceau de binaire — et l'écrire soi-même
 * donne le contrôle sur les trois choses qui comptent ici : l'unité,
 * l'orientation, et l'émission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'UNITÉ EST LE MÈTRE, et ce n'est pas un choix : glTF l'impose. C'est aussi
 * ce qui rend la RA honnête — un modèle en mètres se pose à sa vraie taille
 * sans qu'on ait rien à régler. Le maillage arrive déjà en mètres, il n'y a
 * donc RIEN à convertir, et c'est exactement pour cela qu'il ne faut rien
 * convertir : chaque facteur d'échelle ajouté est une occasion de se tromper.
 *
 * L'ORIENTATION EST Y VERS LE HAUT, ce que glTF impose aussi, et ce que la
 * scène utilise déjà. Le néon vit dans le plan XY, face vers +Z : posé sur un
 * mur, il en sort. C'est ce que `ar-placement="wall"` attend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉMISSION, ET SON AMBIGUÏTÉ ASSUMÉE
 *
 * Sans `KHR_materials_emissive_strength`, l'émission plafonne à 1,0 et un tube
 * allumé sort GRIS CLAIR chez le destinataire. L'extension lève ce plafond.
 *
 * Reste que son unité est discutée : la spécification parle de candelas par
 * mètre carré « pour les implémentations qui ont besoin d'une unité physique »,
 * mais la plupart des visionneuses la traitent comme un simple multiplicateur
 * et brûlent l'image dès la dizaine. On expose donc la valeur telle quelle, on
 * la documente, et on retient un défaut modeste. La phase 4 du plan (docs/27)
 * la reliera au flux réel du tube ; d'ici là, mieux vaut un chiffre honnête
 * qu'un chiffre physique que personne n'affiche correctement.
 */

import type { Mesh } from '../solid.js';

export interface GlbOptions {
  /** Nom de la pièce, visible dans toute visionneuse. */
  nom: string;
  /** Couleur de base, en sRGB 0–1. */
  couleur?: [number, number, number];
  /** Couleur d'émission, en sRGB 0–1. Absente : la pièce n'émet pas. */
  emission?: [number, number, number];
  /**
   * Force d'émission (`KHR_materials_emissive_strength`).
   *
   * Au-dessus de 1, la surface passe en territoire de halo dans un moteur HDR.
   * Voir l'ambiguïté d'unité en tête de fichier.
   */
  forceEmission?: number;
  /** Rugosité et métallicité, pour que l'acrylique ne sorte pas en plastique mat. */
  rugosite?: number;
  metallique?: number;
  /**
   * Normales LISSES ou À FACETTES.
   *
   * Un tube est une surface lisse : ses normales se moyennent, y compris sur
   * la silhouette, où la normale vraie est bien horizontale. Une plaque, elle,
   * a de VRAIES arêtes : les lisser arrondirait ses angles vifs. D'où le
   * réglage, et le défaut à facettes — se tromper vers l'arête franche est
   * moins grave que de fondre un angle droit.
   */
  lisse?: boolean;
}

/** Aligne une longueur sur quatre octets, comme le format l'exige. */
const cale4 = (n: number) => (n + 3) & ~3;

/** Normales par sommet : moyenne des faces, pondérée par leur aire. */
function normalesLisses(positions: Float64Array, indices: Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let f = 0; f < indices.length; f += 3) {
    const ia = indices[f]! * 3;
    const ib = indices[f + 1]! * 3;
    const ic = indices[f + 2]! * 3;
    const ux = positions[ib]! - positions[ia]!;
    const uy = positions[ib + 1]! - positions[ia + 1]!;
    const uz = positions[ib + 2]! - positions[ia + 2]!;
    const vx = positions[ic]! - positions[ia]!;
    const vy = positions[ic + 1]! - positions[ia + 1]!;
    const vz = positions[ic + 2]! - positions[ia + 2]!;
    // Produit vectoriel NON normalisé : sa longueur vaut deux fois l'aire, ce
    // qui pondère la moyenne comme il faut.
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [ia, ib, ic]) {
      n[i] = n[i]! + nx;
      n[i + 1] = n[i + 1]! + ny;
      n[i + 2] = n[i + 2]! + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!);
    if (l > 0) {
      n[i] = n[i]! / l;
      n[i + 1] = n[i + 1]! / l;
      n[i + 2] = n[i + 2]! / l;
    }
  }
  return n;
}

/** Éclate le maillage : un sommet par coin de face, normale de la face. */
function aFacettes(mesh: Mesh): { pos: Float32Array; nor: Float32Array; idx: Uint32Array } {
  const nf = mesh.indices.length / 3;
  const pos = new Float32Array(nf * 9);
  const nor = new Float32Array(nf * 9);
  const idx = new Uint32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const s = [mesh.indices[f * 3]! * 3, mesh.indices[f * 3 + 1]! * 3, mesh.indices[f * 3 + 2]! * 3];
    const ux = mesh.positions[s[1]!]! - mesh.positions[s[0]!]!;
    const uy = mesh.positions[s[1]! + 1]! - mesh.positions[s[0]! + 1]!;
    const uz = mesh.positions[s[1]! + 2]! - mesh.positions[s[0]! + 2]!;
    const vx = mesh.positions[s[2]!]! - mesh.positions[s[0]!]!;
    const vy = mesh.positions[s[2]! + 1]! - mesh.positions[s[0]! + 1]!;
    const vz = mesh.positions[s[2]! + 2]! - mesh.positions[s[0]! + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (let k = 0; k < 3; k++) {
      const o = (f * 3 + k) * 3;
      pos[o] = mesh.positions[s[k]!]!;
      pos[o + 1] = mesh.positions[s[k]! + 1]!;
      pos[o + 2] = mesh.positions[s[k]! + 2]!;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
      idx[f * 3 + k] = f * 3 + k;
    }
  }
  return { pos, nor, idx };
}

/** Le maillage en GLB. Positions en MÈTRES en entrée comme en sortie. */
export function meshVersGlb(mesh: Mesh, o: GlbOptions): Uint8Array {
  const lisse = o.lisse ?? false;
  const { pos, nor, idx } = lisse
    ? {
        pos: Float32Array.from(mesh.positions),
        nor: normalesLisses(mesh.positions, mesh.indices),
        idx: mesh.indices,
      }
    : aFacettes(mesh);

  const nv = pos.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }

  // Le binaire : positions, normales, indices — chacun aligné sur quatre octets.
  const oPos = 0;
  const oNor = cale4(oPos + pos.byteLength);
  const oIdx = cale4(oNor + nor.byteLength);
  const taille = cale4(oIdx + idx.byteLength);
  const bin = new Uint8Array(taille);
  bin.set(new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength), oPos);
  bin.set(new Uint8Array(nor.buffer, nor.byteOffset, nor.byteLength), oNor);
  bin.set(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), oIdx);

  const emet = Boolean(o.emission);
  const materiau: Record<string, unknown> = {
    name: o.nom,
    pbrMetallicRoughness: {
      baseColorFactor: [...(o.couleur ?? [0.8, 0.8, 0.8]), 1],
      metallicFactor: o.metallique ?? 0,
      roughnessFactor: o.rugosite ?? 0.5,
    },
    doubleSided: false,
  };
  if (emet) {
    materiau.emissiveFactor = o.emission;
    materiau.extensions = {
      KHR_materials_emissive_strength: { emissiveStrength: o.forceEmission ?? 4 },
    };
  }

  const json = {
    asset: { version: '2.0', generator: 'ahime-neon-sign-configurator' },
    ...(emet ? { extensionsUsed: ['KHR_materials_emissive_strength'] } : {}),
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: o.nom }],
    meshes: [{ name: o.nom, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [materiau],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: oPos, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: oNor, byteLength: nor.byteLength, target: 34962 },
      { buffer: 0, byteOffset: oIdx, byteLength: idx.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: taille }],
  };

  const texte = new TextEncoder().encode(JSON.stringify(json));
  // Le morceau JSON se complète avec des ESPACES, le binaire avec des zéros :
  // c'est écrit dans la spécification, et une visionneuse stricte le vérifie.
  const jsonCale = new Uint8Array(cale4(texte.length)).fill(0x20);
  jsonCale.set(texte);

  const total = 12 + 8 + jsonCale.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const vue = new DataView(out.buffer);
  vue.setUint32(0, 0x46546c67, true); // « glTF »
  vue.setUint32(4, 2, true);
  vue.setUint32(8, total, true);
  vue.setUint32(12, jsonCale.length, true);
  vue.setUint32(16, 0x4e4f534a, true); // « JSON »
  out.set(jsonCale, 20);
  const oBin = 20 + jsonCale.length;
  vue.setUint32(oBin, bin.length, true);
  vue.setUint32(oBin + 4, 0x004e4942, true); // « BIN\0 »
  out.set(bin, oBin + 8);
  return out;
}
