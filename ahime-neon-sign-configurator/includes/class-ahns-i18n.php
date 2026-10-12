<?php
/**
 * Traduction du plugin (docs/07, lot E).
 *
 * Deux choses, seulement :
 *
 * 1. Charger le catalogue de traductions du plugin.
 * 2. Faire que la LANGUE CHOISIE PAR LE MARCHAND l'emporte sur celle du site.
 *    Une boutique française tenue par une équipe anglophone doit pouvoir avoir
 *    une administration en anglais sans que la vitrine change de langue.
 *
 * Version gratuite : le texte source est l'anglais ; les traductions viennent de
 * translate.wordpress.org et WordPress les charge lui-même. Les points 1 et 2 et le
 * paragraphe suivant ne valent que pour la version complète.
 * Version complète : le texte source est en français ; sans fichier de traduction, tout s'affiche
 * en français. C'est le comportement voulu — le français n'est pas une
 * traduction, c'est l'original.
 *
 * ### Libellés rangés dans des constantes
 *
 * PHP interdit les appels de fonction dans une constante : `const PALETTE`
 * ne peut pas contenir `__( 'Blanc chaud' )`. Ces libellés-là passent par
 * `AHNS_I18n::t()` au moment de l'affichage, et le générateur de catalogue
 * (`scripts/build-pot.py`) va les chercher directement dans les constantes.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_I18n
 */
class AHNS_I18n {

	const DOMAIN = 'ahime-neon-sign-configurator';

	public function hooks() {
		// Rien à brancher : WordPress charge les traductions de translate.wordpress.org lui-même.
	}

	/**
	 * Traduit un libellé venu d'une constante.
	 *
	 * @param string $text Texte source (français).
	 * @return string
	 */
	public static function t( $text ) {
		// Deux gardes indispensables : traduire la chaîne vide renverrait
		// l'en-tête du catalogue, et un nombre n'est pas du texte (les
		// constantes de réglages mêlent libellés et facteurs).
		if ( ! is_string( $text ) || '' === $text ) {
			return $text;
		}
		// translate() et non __() : le texte n'est pas un littéral ici, il vient
		// d'une constante. Les outils d'extraction le récupèrent via build-pot.
		return translate( $text, self::DOMAIN ); // phpcs:ignore WordPress.WP.I18n -- libellés tirés de constantes, extraits par scripts/build-pot.py.
	}

	/**
	 * Traduit les valeurs d'un tableau de libellés (clé => libellé).
	 *
	 * @param array $map Tableau à traduire.
	 * @return array
	 */
	public static function t_map( array $map ) {
		$out = array();
		foreach ( $map as $key => $value ) {
			$out[ $key ] = is_array( $value ) ? array_map( array( __CLASS__, 't' ), $value ) : self::t( $value );
		}
		return $out;
	}
}
