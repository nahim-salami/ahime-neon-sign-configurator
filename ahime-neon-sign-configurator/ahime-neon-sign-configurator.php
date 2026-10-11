<?php
/**
 * Plugin Name:       Ahime Neon Sign Configurator for WooCommerce
 * Plugin URI:        https://github.com/nahim-salami/ahime-neon-sign-configurator
 * Description:       Customers design their LED neon sign in 2D or 3D and see the price instantly. Your store calculates it, without any external service.
 * Version:           1.3.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            Ahime
 * Author URI:        https://ahime.net
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       ahime-neon-sign-configurator
 * Domain Path:       /languages
 *
 * Version gratuite, dérivée de la version complète par scripts/package-lite.py : mêmes moteurs de prix et de
 * rendu, sans ce qui se vend (voir l'en-tête de ce script).
 */

defined( 'ABSPATH' ) || exit;

// La version complète est active : elle fait tout ce que fait celle-ci, on s'efface.
if ( defined( 'NLC_VERSION' ) ) {
	return;
}

define( 'AHNS_VERSION', '1.3.1' );
define( 'AHNS_PLUGIN_FILE', __FILE__ );
define( 'AHNS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'AHNS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
/* « dossier/fichier.php » — l'identifiant sous lequel WordPress connaît une
   extension : nom du filtre de ses liens, clé de ses mises à jour. */
define( 'AHNS_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-i18n.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-upgrade.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-admin-ui.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-pricing.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-embed.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-cart.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-settings.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-order.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-ar.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-page.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-product.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-fonts.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-dashboard.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-configurator.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-configurateurs.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-admin-configurateurs.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-catalogue-produit.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-bareme-produit.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-fonds.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-profiles.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-catalog.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-materials.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-appearance.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-annonces.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-identite.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-help.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-onboarding.php';
require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-schema.php';

add_action( 'plugins_loaded', function () {
	// La version complète, chargée après celle-ci, est active : on ne branche rien.
	if ( defined( 'NLC_VERSION' ) ) {
		return;
	}
	( new AHNS_I18n() )->hooks();
	( new AHNS_Upgrade() )->hooks();
	( new AHNS_Admin_UI() )->hooks();
	$pricing = new AHNS_Pricing();
	$embed = new AHNS_Embed( $pricing );
	$embed->hooks();
	( new AHNS_Cart( $pricing ) )->hooks();
	( new AHNS_Settings() )->hooks();
	( new AHNS_Identite() )->hooks();
	( new AHNS_Order() )->hooks();
	( new AHNS_Ar() )->hooks();
	( new AHNS_Page() )->hooks();
	( new AHNS_Product( $embed ) )->hooks();
	( new AHNS_Fonts() )->hooks();
	( new AHNS_Dashboard() )->hooks();
	// L'écran des configurateurs prend la place de l'ancien « Configurateur »
	// (même adresse). AHNS_Configurator garde ses constantes et ses réglages :
	// c'est de là que part la migration.
	( new AHNS_Admin_Configurateurs() )->hooks();
	( new AHNS_Catalogue_Produit() )->hooks();
	( new AHNS_Bareme_Produit() )->hooks();
	( new AHNS_Fonds() )->hooks();
	( new AHNS_Profiles() )->hooks();
	( new AHNS_Catalog() )->hooks();
	( new AHNS_Materials() )->hooks();
	( new AHNS_Appearance() )->hooks();
	( new AHNS_Annonces() )->hooks();
	( new AHNS_Help() )->hooks();
	( new AHNS_Onboarding() )->hooks();
	( new AHNS_Schema() )->hooks();
} );

// La purge des modeles de RA est un rendez-vous WP-Cron : il survivrait a la
// desactivation du greffon et reveillerait une classe absente.
register_deactivation_hook( __FILE__, function () {
	require_once AHNS_PLUGIN_DIR . 'includes/class-ahns-ar.php';
	AHNS_Ar::desactiver();
} );
