<?php
/**
 * Écran « Configurateur » — OÙ vit le configurateur et CE QU'IL propose
 * (docs/07 §2.3) : page dédiée, produit facturé, mode d'affichage par défaut,
 * et surtout les OPTIONS ACTIVABLES.
 *
 * Une option éteinte disparaît du configurateur client ET est refusée à
 * l'ajout au panier : le marchand ne doit jamais recevoir une commande qu'il
 * ne sait pas produire.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Configurator
 */
class AHNS_Configurator {

	const PAGE_SLUG = 'ahns-configurator';
	const OPTION    = 'ahns_configurator';
	const NONCE     = 'ahns_configurator_save';

	/** Options proposées au client : clé => [libellé, description]. */
	const FEATURES = array(
		'rgb'      => array( 'RGB colour-changing', '7 animated colours, controller included.' ),
		'outdoor'  => array( 'Outdoor', 'Drained IP65 box, IP67 tube and driver, UV-proof. Requires an equipped workshop.' ),
		'dimmer'   => array( 'Remote + dimmer', 'Brightness and modes.' ),
		'express'  => array( 'Rush production', 'Surcharge for a shortened lead time.' ),
		'logo'     => array( 'Logo upload', 'The customer drops in a vector SVG and gets an instant price.' ),
		'view3d'   => array( '3D view', 'Extruded tubes, plate and box at true thickness.' ),
	);

	/** Fonds d'aperçu proposés. */
	const BACKGROUNDS = array(
		'dark'  => 'Dark wall',
		'brick' => 'Brick wall',
		'room'  => 'Bedroom',
	);

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 11 );
		add_action( 'admin_post_ahns_save_configurator', array( $this, 'handle_save' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Configurator - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Configurator', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Réglages effectifs (défauts : tout activé). */
	public static function settings() {
		$saved = (array) get_option( self::OPTION, array() );
		$out   = array(
			'product_id'   => isset( $saved['product_id'] ) ? (int) $saved['product_id'] : 0,
			'default_mode' => isset( $saved['default_mode'] ) && in_array( $saved['default_mode'], array( 'inline', 'modal', 'redirect' ), true )
				? $saved['default_mode'] : 'inline',
			'max_lines'    => isset( $saved['max_lines'] ) ? max( 1, min( 3, (int) $saved['max_lines'] ) ) : 3,
			'features'     => array(),
			'backgrounds'  => array(),
		);
		foreach ( array_keys( self::FEATURES ) as $key ) {
			// Absent = activé : une boutique qui n'a jamais ouvert cet écran
			// garde le configurateur complet.
			$out['features'][ $key ] = isset( $saved['features'][ $key ] ) ? (bool) $saved['features'][ $key ] : true;
		}
		foreach ( array_keys( self::BACKGROUNDS ) as $key ) {
			$out['backgrounds'][ $key ] = isset( $saved['backgrounds'][ $key ] ) ? (bool) $saved['backgrounds'][ $key ] : true;
		}
		// Au moins un fond, sinon l'aperçu n'aurait pas de décor.
		if ( ! in_array( true, $out['backgrounds'], true ) ) {
			$out['backgrounds']['dark'] = true;
		}
		return $out;
	}

	/** Une option est-elle proposée au client ? */
	public static function feature_enabled( $key ) {
		$s = self::settings();
		return ! empty( $s['features'][ $key ] );
	}

	/**
	 * Produit facturé par défaut (hors fiche produit).
	 *
	 * Il vient du configurateur par défaut, et non plus du réglage unique :
	 * c'est lui qu'on édite désormais. L'ancien réglage reste le repli — il a
	 * servi de source à la migration, il ne peut pas être plus à jour qu'elle.
	 */
	public static function default_product_id() {
		if ( class_exists( 'AHNS_Configurateurs' ) ) {
			return (int) AHNS_Configurateurs::defaut()['product_id'];
		}
		return (int) self::settings()['product_id'];
	}

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$features = array();
		foreach ( array_keys( self::FEATURES ) as $key ) {
			$features[ $key ] = ! empty( $_POST['features'][ $key ] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		}
		$backgrounds = array();
		foreach ( array_keys( self::BACKGROUNDS ) as $key ) {
			$backgrounds[ $key ] = ! empty( $_POST['backgrounds'][ $key ] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		}

		update_option(
			self::OPTION,
			array(
				'product_id'   => isset( $_POST['product_id'] ) ? absint( wp_unslash( $_POST['product_id'] ) ) : 0,
				'default_mode' => isset( $_POST['default_mode'] ) ? sanitize_text_field( wp_unslash( $_POST['default_mode'] ) ) : 'inline',
				'max_lines'    => isset( $_POST['max_lines'] ) ? absint( wp_unslash( $_POST['max_lines'] ) ) : 3,
				'features'     => $features,
				'backgrounds'  => $backgrounds,
			)
		);

		// Création de la page dédiée à la demande.
		if ( ! empty( $_POST['create_page'] ) && current_user_can( 'publish_pages' ) ) {
			AHNS_Page::ensure_page( isset( $_POST['product_id'] ) ? absint( wp_unslash( $_POST['product_id'] ) ) : 0 );
		}

		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$s       = self::settings();
		$page_id = (int) get_option( AHNS_Page::OPTION, 0 );
		$page_ok = $page_id > 0 && 'publish' === get_post_status( $page_id );

		AHNS_Admin_UI::open(
			__( 'Configurator', 'ahime-neon-sign-configurator' ),
			__( 'Where your configurator lives, which product it bills, and what it offers your customers.', 'ahime-neon-sign-configurator' ),
			$page_ok ? AHNS_Admin_UI::button( __( 'View page', 'ahime-neon-sign-configurator' ), (string) get_permalink( $page_id ), 'on-accent', array( 'target' => '_blank', 'rel' => 'noopener' ) ) : ''
		);
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Settings saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_configurator" />';
		wp_nonce_field( self::NONCE );

		// --- Page dédiée -----------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Configurator page', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'A blank-canvas page with no theme chrome: no conflict is possible. The configurator header takes your customers back to the home page.', 'ahime-neon-sign-configurator' ) . '</p>';
		if ( $page_ok ) {
			printf(
				'<p>%s <a href="%s" target="_blank" rel="noopener">%s</a> &nbsp; <a class="button" href="%s">' . esc_html__( 'Edit page', 'ahime-neon-sign-configurator' ) . '</a></p>',
				AHNS_Admin_UI::badge( __( 'Created', 'ahime-neon-sign-configurator' ), 'ok' ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				esc_url( (string) get_permalink( $page_id ) ),
				esc_html( (string) get_permalink( $page_id ) ),
				esc_url( (string) get_edit_post_link( $page_id ) )
			);
		} else {
			printf( '<p>' . /* translators: %s: status badge ("To do"). */ esc_html__( '%s No dedicated page yet.', 'ahime-neon-sign-configurator' ) . '</p>', AHNS_Admin_UI::badge( __( 'To do', 'ahime-neon-sign-configurator' ), 'todo' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo '<p><label><input type="checkbox" name="create_page" value="1" checked /> ' . esc_html__( 'Create the page when saving', 'ahime-neon-sign-configurator' ) . '</label></p>';
		}
		AHNS_Admin_UI::card_close();

		// --- Produit facturé --------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Billed product', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'The WooCommerce product used when the configurator is placed outside a product page (dedicated page, shortcode). On a product page, it is always that page\'s product.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<select name="product_id" style="min-width:340px;">';
		echo '<option value="0">' . esc_html__( '- None (demo mode, no cart) -', 'ahime-neon-sign-configurator' ) . '</option>';
		foreach ( (array) wc_get_products( array( 'limit' => 100, 'orderby' => 'title', 'order' => 'ASC', 'status' => 'publish' ) ) as $product ) {
			printf(
				'<option value="%d"%s>%s</option>',
				(int) $product->get_id(),
				selected( $s['product_id'], $product->get_id(), false ),
				esc_html( $product->get_name() )
			);
		}
		echo '</select>';
		AHNS_Admin_UI::card_close();

		// --- Affichage sur les fiches produit ---------------------------------
		AHNS_Admin_UI::card_open( __( 'Default display on a product page', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Offered when you create a customisable product. Each product can then have its own mode.', 'ahime-neon-sign-configurator' ) . '</p>';
		foreach ( AHNS_Product::MODES as $value => $label ) {
			printf(
				'<p><label><input type="radio" name="default_mode" value="%s"%s /> %s</label></p>',
				esc_attr( $value ),
				checked( $s['default_mode'], $value, false ),
				esc_html( $label )
			);
		}
		AHNS_Admin_UI::card_close();

		// --- Options proposées -------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'What the configurator offers', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p class="ahns-hint">%s</p>',
			// La phrase reste entière pour le traducteur ; seule la mise en
			// valeur du mot-clé la traverse.
			wp_kses(
				__( 'An option you untick <strong>disappears</strong> from the configurator and is refused at cart time - you will never receive an order you cannot make.', 'ahime-neon-sign-configurator' ),
				array( 'strong' => array() )
			)
		);
		foreach ( AHNS_I18n::t_map( self::FEATURES ) as $key => $def ) {
			printf(
				'<p style="margin:10px 0;"><label><input type="checkbox" name="features[%s]" value="1"%s /> <strong>%s</strong></label><br /><span class="ahns-hint" style="margin-left:24px;">%s</span></p>',
				esc_attr( $key ),
				checked( ! empty( $s['features'][ $key ] ), true, false ),
				esc_html( $def[0] ),
				esc_html( $def[1] )
			);
		}
		printf(
			'<p style="margin-top:16px;"><label>' . esc_html__( 'Maximum number of text lines:', 'ahime-neon-sign-configurator' ) . ' <select name="max_lines">%s</select></label></p>',
			wp_kses(
				implode(
					'',
					array_map(
						static function ( $n ) use ( $s ) {
							return sprintf( '<option value="%1$d"%2$s>%1$d</option>', $n, selected( $s['max_lines'], $n, false ) );
						},
						array( 1, 2, 3 )
					)
				),
				array( 'option' => array( 'value' => true, 'selected' => true ) )
			)
		);
		AHNS_Admin_UI::card_close();

		// --- Fonds d'aperçu ----------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Preview backgrounds', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'The settings your customer sees their neon against.', 'ahime-neon-sign-configurator' ) . '</p>';
		foreach ( AHNS_I18n::t_map( self::BACKGROUNDS ) as $key => $label ) {
			printf(
				'<label style="display:inline-flex;align-items:center;gap:6px;margin-right:18px;"><input type="checkbox" name="backgrounds[%s]" value="1"%s /> %s</label>',
				esc_attr( $key ),
				checked( ! empty( $s['backgrounds'][ $key ] ), true, false ),
				esc_html( $label )
			);
		}
		AHNS_Admin_UI::card_close();

		submit_button( __( 'Save', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
		AHNS_Admin_UI::close();
	}
}
