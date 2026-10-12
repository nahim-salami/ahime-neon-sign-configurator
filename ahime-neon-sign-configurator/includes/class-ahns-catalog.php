<?php
/**
 * Catalogue — COULEURS et SUPPORTS proposés au client (docs/07 §2.5 et §2.6).
 *
 * Même principe que les options du configurateur : ce qui n'est pas activé
 * disparaît du configurateur ET est refusé à l'ajout au panier. Le marchand ne
 * doit jamais recevoir une commande dans une couleur ou une finition qu'il ne
 * tient pas.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Catalog
 */
class AHNS_Catalog {

	const COLORS_SLUG   = 'ahns-colors';
	const SUPPORTS_SLUG = 'ahns-supports';
	const COLORS_OPTION = 'ahns_colors';
	const SUPPORTS_OPTION = 'ahns_supports';

	/** Palette de tube livrée avec le plugin (hex => libellé). */
	const PALETTE = array(
		'#fff6e0' => 'Warm white',
		'#ffffff' => 'Cool white',
		'#ff2d95' => 'Pink',
		'#ff5aa7' => 'Light pink',
		'#ff1f1f' => 'Red',
		'#ff7a1a' => 'Orange',
		'#ffd60a' => 'Yellow',
		'#b4ff39' => 'Lime green',
		'#2dff6e' => 'Green',
		'#19e6c1' => 'Turquoise',
		'#33d1ff' => 'Ice blue',
		'#2979ff' => 'Blue',
		'#7b5bff' => 'Purple',
		'#c05bff' => 'Lilac',
		'#ff9ad5' => 'Pastel pink',
	);

	/** Types de découpe (clé => libellé). */
	const SUPPORT_TYPES = array(
		'contour'       => 'Cut around (follows the artwork)',
		'rectangle'     => 'Rectangle',
		'cut-to-letter' => 'Cut to letter',
		'box'           => 'Box',
		'stand'         => 'Free-standing base',
		'none'          => 'Direct mount (no backing plate)',
	);

	/** Finitions (clé => libellé). */
	const SUPPORT_FINISHES = array(
		'clear'      => 'Clear',
		'black'      => 'Black',
		'white'      => 'White',
		'colored'    => 'Coloured',
		'mirror'     => 'Mirror',
		'printed-uv' => 'UV printed',
	);

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 13 );
		add_action( 'admin_post_ahns_save_colors', array( $this, 'handle_save_colors' ) );
		add_action( 'admin_post_ahns_save_supports', array( $this, 'handle_save_supports' ) );
	}

	public function add_menu() {
		add_submenu_page( AHNS_Dashboard::PAGE_SLUG, __( 'Colours - Ahime Neon', 'ahime-neon-sign-configurator' ), __( 'Colours', 'ahime-neon-sign-configurator' ), 'manage_woocommerce', self::COLORS_SLUG, array( $this, 'render_colors' ) );
		add_submenu_page( AHNS_Dashboard::PAGE_SLUG, __( 'Backings - Ahime Neon', 'ahime-neon-sign-configurator' ), __( 'Backings', 'ahime-neon-sign-configurator' ), 'manage_woocommerce', self::SUPPORTS_SLUG, array( $this, 'render_supports' ) );
	}

	// -----------------------------------------------------------------------
	// Couleurs
	// -----------------------------------------------------------------------

	/** Palette complète : celle du plugin + les couleurs maison du marchand. */
	public static function all_colors() {
		$saved  = (array) get_option( self::COLORS_OPTION, array() );
		$colors = self::PALETTE;
		foreach ( (array) ( $saved['custom'] ?? array() ) as $c ) {
			$hex = isset( $c['hex'] ) ? sanitize_hex_color( (string) $c['hex'] ) : '';
			if ( $hex ) {
				$colors[ strtolower( $hex ) ] = isset( $c['label'] ) ? (string) $c['label'] : $hex;
			}
		}
		return $colors;
	}

	/** Couleurs proposées au client (défaut : toutes). */
	public static function enabled_colors() {
		$saved = (array) get_option( self::COLORS_OPTION, array() );
		$all   = self::all_colors();
		if ( ! isset( $saved['enabled'] ) ) {
			return $all;
		}
		$out = array();
		foreach ( (array) $saved['enabled'] as $hex ) {
			$hex = strtolower( (string) $hex );
			if ( isset( $all[ $hex ] ) ) {
				$out[ $hex ] = $all[ $hex ];
			}
		}
		return $out ? $out : $all; // jamais de palette vide.
	}

	/** Couleur par défaut (celle du premier néon composé). */
	public static function default_color() {
		$saved   = (array) get_option( self::COLORS_OPTION, array() );
		$enabled = self::enabled_colors();
		$hex     = isset( $saved['default'] ) ? strtolower( (string) $saved['default'] ) : '';
		if ( isset( $enabled[ $hex ] ) ) {
			return $hex;
		}
		return (string) array_key_first( $enabled );
	}

	/** Couleurs transmises au widget. */
	public static function colors_for_widget() {
		$out = array();
		foreach ( self::enabled_colors() as $hex => $label ) {
			$out[] = array( 'hex' => $hex, 'label' => $label );
		}
		return $out;
	}

	public function handle_save_colors() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_save_colors' );

		$custom = array();
		$hexes  = isset( $_POST['custom_hex'] ) ? map_deep( (array) wp_unslash( $_POST['custom_hex'] ), 'sanitize_text_field' ) : array();
		$labels = isset( $_POST['custom_label'] ) ? map_deep( (array) wp_unslash( $_POST['custom_label'] ), 'sanitize_text_field' ) : array();
		foreach ( $hexes as $i => $hex ) {
			$hex   = sanitize_hex_color( (string) $hex );
			$label = isset( $labels[ $i ] ) ? sanitize_text_field( (string) $labels[ $i ] ) : '';
			if ( $hex && '' !== $label ) {
				$custom[] = array( 'hex' => strtolower( $hex ), 'label' => mb_substr( $label, 0, 30 ) );
			}
		}

		$enabled = array();
		foreach ( isset( $_POST['colors'] ) ? map_deep( (array) wp_unslash( $_POST['colors'] ), 'sanitize_text_field' ) : array() as $hex ) {
			$hex = sanitize_hex_color( (string) $hex );
			if ( $hex ) {
				$enabled[] = strtolower( $hex );
			}
		}

		update_option(
			self::COLORS_OPTION,
			array(
				'custom'  => $custom,
				'enabled' => $enabled,
				'default' => isset( $_POST['default_color'] ) ? strtolower( (string) sanitize_hex_color( wp_unslash( $_POST['default_color'] ) ) ) : '',
			)
		);
		wp_safe_redirect( add_query_arg( array( 'page' => self::COLORS_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function render_colors() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$all     = AHNS_I18n::t_map( self::all_colors() );
		$enabled = self::enabled_colors();
		$default = self::default_color();
		$saved   = (array) get_option( self::COLORS_OPTION, array() );

		AHNS_Admin_UI::open( __( 'Colours', 'ahime-neon-sign-configurator' ), __( 'The tube palette you offer. Every colour is shown lit and unlit, just like the finished product.', 'ahime-neon-sign-configurator' ) );
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Palette saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_colors" />';
		wp_nonce_field( 'ahns_save_colors' );

		AHNS_Admin_UI::card_open( __( 'Palette on offer', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Untick a colour and it disappears from the configurator. It is refused at cart time too.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<div class="ahns-colors">';
		foreach ( $all as $hex => $label ) {
			$on = isset( $enabled[ $hex ] );
			printf(
				'<label class="ahns-color%1$s"><input type="checkbox" name="colors[]" value="%2$s"%3$s />'
				. '<span class="ahns-color__lit" style="background:%2$s;box-shadow:0 0 14px %2$s,0 0 30px %2$s;"></span>'
				. '<span class="ahns-color__off" style="background:%2$s;"></span>'
				. '<span class="ahns-color__name">%4$s</span>'
				. '<span class="ahns-color__def"><input type="radio" name="default_color" value="%2$s"%5$s /> ' . esc_html__( 'default', 'ahime-neon-sign-configurator' ) . '</span></label>',
				$on ? ' on' : '',
				esc_attr( $hex ),
				checked( $on, true, false ),
				esc_html( $label ),
				checked( $default, $hex, false )
			);
		}
		echo '</div>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Your own colours', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Add a shade you keep in stock that is not in the bundled palette.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="widefat striped" style="max-width:520px;"><thead><tr><th style="width:120px;">' . esc_html__( 'Colour', 'ahime-neon-sign-configurator' ) . '</th><th>Nom</th></tr></thead><tbody>';
		$rows = array_merge( (array) ( $saved['custom'] ?? array() ), array( array( 'hex' => '#ff2d95', 'label' => '' ), array( 'hex' => '#ff2d95', 'label' => '' ) ) );
		foreach ( $rows as $row ) {
			printf(
				'<tr><td><input type="color" name="custom_hex[]" value="%s" /></td><td><input type="text" name="custom_label[]" value="%s" placeholder="Ex. Corail maison" class="regular-text" /></td></tr>',
				esc_attr( (string) $row['hex'] ),
				esc_attr( (string) $row['label'] )
			);
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint">' . esc_html__( 'A row with no name is ignored: clear the name to remove a colour.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::inline_css(
			'ahns-colors',
			'.ahns-colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;}'
			. '.ahns-color{display:grid;grid-template-columns:auto auto auto 1fr;grid-template-rows:auto auto;gap:6px 8px;align-items:center;'
			. 'border:1.5px solid #dcdcde;border-radius:10px;padding:10px 12px;background:#fff;cursor:pointer;}'
			. '.ahns-color.on{border-color:var(--ahns-accent);background:#fdf2f8;}'
			. '.ahns-color__lit,.ahns-color__off{width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.12);}'
			. '.ahns-color__off{filter:grayscale(.65) brightness(1.25);opacity:.85;}'
			. '.ahns-color__name{font-size:12.5px;font-weight:600;}'
			. '.ahns-color__def{grid-column:1/-1;font-size:11px;color:#6b7280;}'
		);
		AHNS_Admin_UI::inline_js( 'ahns-colors', 'document.addEventListener("change",function(e){var c=e.target.closest(".ahns-color");if(c&&e.target.type==="checkbox"){c.classList.toggle("on",e.target.checked);}});' );

		submit_button( __( 'Save palette', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
		AHNS_Admin_UI::close();
	}

	// -----------------------------------------------------------------------
	// Supports
	// -----------------------------------------------------------------------

	/** Types de découpe proposés (défaut : tous sauf « pose directe »). */
	public static function enabled_support_types() {
		$saved = (array) get_option( self::SUPPORTS_OPTION, array() );
		if ( ! isset( $saved['types'] ) ) {
			$all = self::SUPPORT_TYPES;
			unset( $all['none'] ); // pose directe : métier « pro », proposée à la demande.
			return $all;
		}
		$out = array();
		foreach ( (array) $saved['types'] as $key ) {
			if ( isset( self::SUPPORT_TYPES[ $key ] ) ) {
				$out[ $key ] = self::SUPPORT_TYPES[ $key ];
			}
		}
		return $out ? $out : self::SUPPORT_TYPES;
	}

	/** Finitions proposées (défaut : toutes). */
	public static function enabled_finishes() {
		$saved = (array) get_option( self::SUPPORTS_OPTION, array() );
		if ( ! isset( $saved['finishes'] ) ) {
			return self::SUPPORT_FINISHES;
		}
		$out = array();
		foreach ( (array) $saved['finishes'] as $key ) {
			if ( isset( self::SUPPORT_FINISHES[ $key ] ) ) {
				$out[ $key ] = self::SUPPORT_FINISHES[ $key ];
			}
		}
		return $out ? $out : self::SUPPORT_FINISHES;
	}

	/** Profondeur de caisson par défaut (cm). */
	public static function box_depth_cm() {
		$saved = (array) get_option( self::SUPPORTS_OPTION, array() );
		$depth = isset( $saved['box_depth_cm'] ) ? (float) $saved['box_depth_cm'] : 8.0;
		return max( 3.0, min( 30.0, $depth ) );
	}

	public function handle_save_supports() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_save_supports' );

		$types = array();
		foreach ( isset( $_POST['types'] ) ? map_deep( (array) wp_unslash( $_POST['types'] ), 'sanitize_text_field' ) : array() as $key ) {
			$key = sanitize_text_field( (string) $key );
			if ( isset( self::SUPPORT_TYPES[ $key ] ) ) {
				$types[] = $key;
			}
		}
		$finishes = array();
		foreach ( isset( $_POST['finishes'] ) ? map_deep( (array) wp_unslash( $_POST['finishes'] ), 'sanitize_text_field' ) : array() as $key ) {
			$key = sanitize_text_field( (string) $key );
			if ( isset( self::SUPPORT_FINISHES[ $key ] ) ) {
				$finishes[] = $key;
			}
		}

		update_option(
			self::SUPPORTS_OPTION,
			array(
				'types'        => $types,
				'finishes'     => $finishes,
				'box_depth_cm' => isset( $_POST['box_depth_cm'] ) ? (float) str_replace( ',', '.', sanitize_text_field( wp_unslash( $_POST['box_depth_cm'] ) ) ) : 8.0,
			)
		);
		wp_safe_redirect( add_query_arg( array( 'page' => self::SUPPORTS_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function render_supports() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$types    = self::enabled_support_types();
		$finishes = self::enabled_finishes();

		AHNS_Admin_UI::open( __( 'Backings', 'ahime-neon-sign-configurator' ), __( 'The cuts and finishes your workshop can actually make.', 'ahime-neon-sign-configurator' ) );
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Backings saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_supports" />';
		wp_nonce_field( 'ahns_save_supports' );

		AHNS_Admin_UI::card_open( __( 'Cut types', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Anything unticked disappears from the configurator. An outdoor neon always forces the box.', 'ahime-neon-sign-configurator' ) . '</p>';
		foreach ( AHNS_I18n::t_map( self::SUPPORT_TYPES ) as $key => $label ) {
			printf(
				'<p style="margin:8px 0;"><label><input type="checkbox" name="types[]" value="%s"%s /> %s</label></p>',
				esc_attr( $key ),
				checked( isset( $types[ $key ] ), true, false ),
				esc_html( $label )
			);
		}
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Finishes', 'ahime-neon-sign-configurator' ) );
		foreach ( AHNS_I18n::t_map( self::SUPPORT_FINISHES ) as $key => $label ) {
			printf(
				'<label style="display:inline-flex;align-items:center;gap:6px;margin:0 18px 10px 0;"><input type="checkbox" name="finishes[]" value="%s"%s /> %s</label>',
				esc_attr( $key ),
				checked( isset( $finishes[ $key ] ), true, false ),
				esc_html( $label )
			);
		}
		printf(
			'<p style="margin-top:14px;"><label>' . esc_html__( 'Default light box depth:', 'ahime-neon-sign-configurator' ) . ' <input type="number" step="0.5" min="3" max="30" name="box_depth_cm" value="%s" class="small-text" /> cm</label></p>',
			esc_attr( (string) self::box_depth_cm() )
		);
		AHNS_Admin_UI::card_close();

		submit_button( __( 'Save backings', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
		AHNS_Admin_UI::close();
	}
}
