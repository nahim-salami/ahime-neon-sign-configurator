/**
 * LES FICHIERS DE SORTIE.
 *
 * Trois familles, et les confondre est l'erreur classique :
 *
 *   VOIR      GLB, USDZ    — le client, le marchand, la réalité augmentée
 *   IMPRIMER  3MF, STL     — l'impression 3D
 *   DÉCOUPER  DXF, SVG 1:1 — le laser, la fraiseuse, l'établi
 *
 * Tout est PUR : aucune dépendance à three.js, aucun accès au DOM, aucune
 * lecture d'horloge. C'est ce qui permet de les tester dans Node, et ce qui les
 * garde hors du lot de la vue 3D — un visiteur qui regarde son néon n'a aucune
 * raison de télécharger un écrivain de DXF.
 */
export * from './pavage-a4.js';
export * from './gabarit-papier.js';
export * from './usdz.js';
export * from './glb.js';
