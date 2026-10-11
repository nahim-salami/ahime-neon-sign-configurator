<?php
/**
 * Qui édite cette extension, et où aller ensuite.
 *
 * CE QUE VOYAIT UN MARCHAND JUSQU'ICI. L'extension se disait écrite par « The
 * Neon Light », et les thèmes renvoyaient — dans Apparence › Détails du thème —
 * vers un PROFIL GITHUB PERSONNEL. Deux erreurs d'attribution dans l'écran même
 * où l'on vérifie à qui l'on fait confiance avant d'installer.
 *
 * L'ÉDITEUR EST AHIME. « Neon Light » est une de ses marques : le nom du
 * produit, celui de l'abonnement, celui du domaine où vit la boutique
 * (neon-light.ahime.net). Ce sont deux choses différentes, et les en-têtes le
 * disent désormais séparément :
 *
 *     Plugin URI : https://neon-light.ahime.net   le produit
 *     Author URI : https://ahime.net              la maison
 *
 * WordPress fait de `Author URI` le lien « Par Ahime » de la liste des
 * extensions. Cette classe ajoute le reste de la ligne — réglages, aide,
 * abonnement — pour que le marchand n'ait pas à chercher dans les menus ce
 * qu'il vient d'installer.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Identite
 */
class AHNS_Identite {

	/** La marque, chez l'éditeur. */
	const SITE_PRODUIT = 'https://neon-light.ahime.net';
	const SITE_EDITEUR = 'https://ahime.net';

	public function hooks() {
		add_filter( 'plugin_action_links_' . AHNS_PLUGIN_BASENAME, array( $this, 'liens_action' ) );
		add_filter( 'plugin_row_meta', array( $this, 'liens_meta' ), 10, 2 );
	}

	/**
	 * Les liens en gras, juste sous le nom : ce qu'on veut ouvrir tout de suite.
	 *
	 * @param array $liens
	 * @return array
	 */
	public function liens_action( $liens ) {
		$miens = array(
			'ahns-reglages' => sprintf(
				'<a href="%s">%s</a>',
				esc_url( admin_url( 'admin.php?page=' . AHNS_Dashboard::PAGE_SLUG ) ),
				esc_html__( 'Settings', 'ahime-neon-sign-configurator' )
			),
		);
		return array_merge( $miens, is_array( $liens ) ? $liens : array() );
	}

	/**
	 * La seconde ligne, plus discrète : à qui l'on a affaire, et où s'abonner.
	 *
	 * ON NE L'AJOUTE QU'À NOTRE PROPRE LIGNE. Ce filtre passe sur CHAQUE
	 * extension installée ; sans cette comparaison, nos liens s'ajouteraient
	 * sous toutes les autres.
	 *
	 * @param array  $liens
	 * @param string $fichier L'extension dont WordPress dessine la ligne.
	 * @return array
	 */
	public function liens_meta( $liens, $fichier ) {
		if ( AHNS_PLUGIN_BASENAME !== $fichier ) {
			return $liens;
		}
		$liens   = is_array( $liens ) ? $liens : array();
		// UN SEUL LIEN vers la version complète (règle 11 : l'administration n'est pas détournée).
		$liens[] = sprintf(
			'<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
			esc_url( 'https://neon-light.ahime.net/en/tarifs' ),
			esc_html__( 'All fonts, interfaces and workshop tools: Neon Light', 'ahime-neon-sign-configurator' )
		);
		return $liens;
	}
}
