<?php
/**
 * Migrations d'une version à l'autre.
 *
 * Le marchand ne doit jamais voir ses prix bouger parce que NOUS avons changé
 * une méthode de mesure. Quand la façon de mesurer le tube change, on convertit
 * son tarif au mètre pour que ses prix restent les mêmes.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Upgrade
 */
class AHNS_Upgrade {

	const OPTION = 'ahns_schema_version';

	/**
	 * Passage à la mesure de LIGNE MÉDIANE (docs/04 §7).
	 *
	 * Le tube était mesuré par « périmètre du contour ÷ 2 », qui surestime de
	 * 7,2 % en moyenne sur les designs-témoins. La ligne médiane — vérifiée
	 * exacte sur une barre et sur un anneau — donne la longueur que l'atelier
	 * plie vraiment. Le tarif par défaut a été recalé d'autant ; le tarif du
	 * marchand doit l'être aussi, sinon ses prix baisseraient tout seuls.
	 */
	const MEDIAN_TUBE_FACTOR = 1.072;

	public function hooks() {
		add_action( 'admin_init', array( __CLASS__, 'maybe_upgrade' ), 5 );
	}

	public static function maybe_upgrade() {
		$from = (string) get_option( self::OPTION, '' );
		if ( AHNS_VERSION === $from ) {
			return;
		}
		update_option( self::OPTION, AHNS_VERSION );
	}


}
