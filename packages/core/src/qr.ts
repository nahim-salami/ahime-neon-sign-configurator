/**
 * LE QR DU LIEN DE PARTAGE (B14, seconde moitié).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * À QUOI IL SERT, ET POURQUOI LE LIEN NE SUFFIT PAS
 *
 * Le §49 a donné le lien : le client le copie, se l'envoie, y revient. Ce qu'un
 * lien copié ne fait PAS, c'est traverser un appareil. Un client qui compose sur
 * son ordinateur et veut voir son néon sur son téléphone — pour le montrer, pour
 * juger la taille dans la pièce — n'a aucun moyen simple d'y arriver.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'IMPORTATION EST DYNAMIQUE, ET CE N'EST PAS UN DÉTAIL
 *
 * `qrcode` pèse 234 Ko. Importé normalement, il partirait dans le paquet du
 * widget, donc chez TOUS les visiteurs d'une page produit — y compris ceux qui
 * n'ouvrent jamais le configurateur, et a fortiori ceux qui ne demandent jamais
 * de QR.
 *
 * C'est la même règle que la vue 3D, que les cartes HDR et que les modèles
 * d'atelier : ce qui n'est pas demandé ne se télécharge pas. Le dépôt a déjà payé
 * la leçon inverse — « le pack n° 14 en a publié 11,1 Mo que personne ne
 * demandait jamais ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DU SVG, PAS UNE IMAGE MATRICIELLE
 *
 * Un QR est fait de carrés : en SVG il reste net à toute taille, y compris
 * imprimé, et il pèse moins qu'un PNG de la même lisibilité. C'est aussi ce qui
 * permet de le glisser tel quel dans la page du gabarit papier, le jour où on le
 * voudra.
 */

/**
 * Rend le QR d'un texte en SVG, ou `null` si l'encodeur n'est pas disponible.
 *
 * Ne jette JAMAIS : un QR est un agrément, et l'absence d'agrément ne doit pas
 * casser le bouton qui l'a demandé.
 *
 * @param texte  Le contenu à encoder — ici l'adresse de partage.
 * @param taille Côté du carré, en pixels CSS.
 */
export async function qrEnSvg(texte: string, taille = 220): Promise<string | null> {
  if ('string' !== typeof texte || !texte) return null;
  try {
    /*
     * L'importation est ici, DANS la fonction, et non en tête de fichier : un
     * `import` de tête serait résolu à la construction et le paquet entier
     * partirait dans le lot principal, ce que tout ce commentaire cherche à
     * éviter.
     */
    const mod = await import('qrcode');
    const QR = (mod as unknown as { default?: unknown }).default ?? mod;
    const svg: string = await (QR as {
      toString: (t: string, o: Record<string, unknown>) => Promise<string>;
    }).toString(texte, {
      type: 'svg',
      // La marge est réglementaire — quatre modules de silence, faute de quoi
      // beaucoup de lecteurs refusent de reconnaître le motif.
      margin: 2,
      width: taille,
      // Correction MOYENNE : un QR affiché à l'écran n'est ni sali ni plié, et
      // un niveau plus haut grossirait le motif donc réduirait les modules.
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    });
    return svg;
  } catch {
    return null;
  }
}
