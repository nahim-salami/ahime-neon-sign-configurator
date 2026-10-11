<?php
/**
 * Ahime Neon Sign Configurator for WooCommerce: uninstall.
 *
 * Deletes everything the plugin stored under its own prefix (ahns_): settings, setup state, cached price
 * ranges, product settings and the temporary augmented reality models. It keeps two things on purpose:
 * the order line details (they are part of the merchant's WooCommerce orders and invoices) and the
 * configurator page (a normal WordPress page the merchant may have edited).
 *
 * @package AhimeNeonSignConfigurator
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Deletes the plugin data of the current site.
 *
 * @return void
 */
function ahns_uninstall_site() {
	global $wpdb;

	$options = array(
		'ahns_settings',
		'ahns_appearance',
		'ahns_annonces',
		'ahns_colors',
		'ahns_supports',
		'ahns_materials',
		'ahns_fonts',
		'ahns_custom_fonts',
		'ahns_fonds',
		'ahns_profiles',
		'ahns_configurator',
		'ahns_configurateurs',
		'ahns_onboarding',
		'ahns_onboarding_redirect',
		'ahns_page_id',
		'ahns_schema_version',
		'ahns_upgrade_notice',
	);
	foreach ( $options as $option ) {
		delete_option( $option );
	}

	// Cached price ranges (one transient per product and currency).
	$transients = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one-off cleanup on uninstall.
		$wpdb->prepare(
			"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
			$wpdb->esc_like( '_transient_ahns_' ) . '%'
		)
	);
	foreach ( (array) $transients as $name ) {
		delete_transient( substr( (string) $name, strlen( '_transient_' ) ) );
	}

	// Product and page settings. Order line details are NOT deleted: they belong to the orders.
	$meta_keys = array(
		'_ahns_enabled',
		'_ahns_display_mode',
		'_ahns_configurateur',
		'_ahns_bareme',
		'_ahns_catalogue',
		'_ahns_kind',
		'_ahns_profile',
		'_ahns_clean_page',
	);
	foreach ( $meta_keys as $meta_key ) {
		delete_post_meta_by_key( $meta_key );
	}

	// The daily purge of augmented reality models, and the models themselves.
	wp_clear_scheduled_hook( 'ahns_ar_purge' );
	$uploads = wp_upload_dir( null, false );
	if ( empty( $uploads['error'] ) ) {
		$dir = trailingslashit( $uploads['basedir'] ) . 'ahns-ar';
		if ( is_dir( $dir ) ) {
			foreach ( (array) glob( $dir . '/*' ) as $file ) {
				if ( is_file( $file ) ) {
					wp_delete_file( $file );
				}
			}
			global $wp_filesystem;
			if ( ! $wp_filesystem ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
			}
			if ( $wp_filesystem ) {
				$wp_filesystem->rmdir( $dir );
			}
		}
	}
}

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids' ) ) as $ahns_site_id ) {
		switch_to_blog( $ahns_site_id );
		ahns_uninstall_site();
		restore_current_blog();
	}
} else {
	ahns_uninstall_site();
}
