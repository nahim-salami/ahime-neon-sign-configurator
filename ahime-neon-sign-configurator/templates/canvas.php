<?php
/**
 * Gabarit « toile vierge » de la page configurateur dédiée : document minimal
 * SANS aucun markup du thème. wp_head()/wp_footer() restent appelés (enqueue
 * du widget + contexte hôte) ; les assets du thème sont retirés en amont
 * (AHNS_Page::strip_theme_assets()).
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'ahns-canvas' ); ?>>
<?php wp_body_open(); ?>
<main class="ahns-canvas__main">
	<?php
	while ( have_posts() ) {
		the_post();
		the_content();
	}
	?>
</main>
<?php wp_footer(); ?>
</body>
</html>
