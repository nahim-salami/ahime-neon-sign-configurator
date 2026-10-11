/**
 * Cotes physiques du produit.
 *
 * Ce fichier ne dépend de RIEN. C'est ce qui permet à l'aperçu 2D et au calcul
 * de capture de connaître le diamètre du tube sans entraîner three.js avec eux :
 * la vue 3D pèse à elle seule la moitié du widget, et un visiteur qui ne
 * l'ouvre jamais n'a aucune raison de la télécharger.
 */
/**
 * ATTENTION — ces valeurs sont les DÉFAUTS du catalogue livré, pas la source
 * d'autorité. L'autorité, c'est `DEFAULT_COEFFICIENTS.tube` dans `@neon/core`,
 * que le marchand règle et que la fiche d'atelier enregistre à la commande.
 *
 * Le diamètre était écrit en dur à trois endroits : ici, dans la cote de la
 * vue 3D, et dans la fiche de production PHP. Le jour où le catalogue ouvre le
 * Ø 8 mm (prévu — docs/02 §2), deux de ces trois auraient continué d'afficher
 * 10 mm sans que rien ne casse. La fiche PHP lit désormais le plan enregistré ;
 * ici, un test de non-régression (`test/spec-tube.test.ts`) échoue si cette
 * constante et le coefficient divergent.
 */
export const SPEC = {
  tubeDiameterCm: 1.0, // LED néon flex Ø 10 mm — miroir de coefficients.tube.diameterMm
  boardThicknessCm: 0.5, // acrylique 5 mm
  boxWallCm: 0.4,
  standoffLengthCm: 2.0,
  cableDiameterCm: 0.3,
};
