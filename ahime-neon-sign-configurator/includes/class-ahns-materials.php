<?php
/**
 * Matières, découpes et finitions — les tarifs des panneaux et caissons.
 *
 * Un atelier n'achète pas son dibond au même prix qu'un autre, et ne facture
 * pas sa découpe pareil. Livrer des valeurs figées reviendrait à décider de la
 * marge du marchand à sa place.
 *
 * CE QUI EST RÉGLÉ ICI PART DES DEUX CÔTÉS. Le navigateur affiche et le serveur
 * facture : s'ils ne recevaient pas les mêmes coefficients, le client verrait
 * un prix et paierait l'autre. C'est la règle de tout ce projet, et elle vaut
 * pour les matières comme pour le tube.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Materials
 */
class AHNS_Materials {

	const OPTION    = 'ahns_materials';
	const PAGE_SLUG = 'ahns-materials';

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 13 );
		add_action( 'admin_post_ahns_save_materials', array( $this, 'handle_save' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Materials - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Materials', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Réglages du marchand, complétés par les valeurs livrées. */
	public static function settings() {
		$saved   = (array) get_option( self::OPTION, array() );
		$defauts = AHNS_Pricing::PANEL_DEFAULTS;

		$mats = array();
		foreach ( $defauts['materials'] as $id => $spec ) {
			$s = isset( $saved['materials'][ $id ] ) ? (array) $saved['materials'][ $id ] : array();
			$mats[ $id ] = array(
				'label'           => $spec['label'],
				'thicknessesMm'   => isset( $s['thicknessesMm'] ) ? array_values( array_filter( array_map( 'floatval', (array) $s['thicknessesMm'] ) ) ) : $spec['thicknessesMm'],
				'perM2PerMmCents' => isset( $s['perM2PerMmCents'] ) ? (int) $s['perM2PerMmCents'] : $spec['perM2PerMmCents'],
				'baseM2Cents'     => isset( $s['baseM2Cents'] ) ? (int) $s['baseM2Cents'] : $spec['baseM2Cents'],
				'outdoorReady'    => isset( $s['outdoorReady'] ) ? (bool) $s['outdoorReady'] : $spec['outdoorReady'],
				'enabled'         => ! isset( $s['enabled'] ) || (bool) $s['enabled'],
			);
			if ( empty( $mats[ $id ]['thicknessesMm'] ) ) {
				$mats[ $id ]['thicknessesMm'] = $spec['thicknessesMm'];
			}
		}

		$nombre = static function ( $cle, $defaut ) use ( $saved ) {
			return isset( $saved[ $cle ] ) ? max( 0, (int) $saved[ $cle ] ) : $defaut;
		};

		return array(
			'materials'          => $mats,
			'cutPerMeterCents'   => array(
				'rect'    => isset( $saved['cut']['rect'] ) ? (int) $saved['cut']['rect'] : $defauts['cutPerMeterCents']['rect'],
				'rounded' => isset( $saved['cut']['rounded'] ) ? (int) $saved['cut']['rounded'] : $defauts['cutPerMeterCents']['rounded'],
				'shape'   => isset( $saved['cut']['shape'] ) ? (int) $saved['cut']['shape'] : $defauts['cutPerMeterCents']['shape'],
			),
			'finishPerM2Cents'   => array(
				'raw'         => 0,
				'printed'     => isset( $saved['finish']['printed'] ) ? (int) $saved['finish']['printed'] : $defauts['finishPerM2Cents']['printed'],
				'printed-lam' => isset( $saved['finish']['printed-lam'] ) ? (int) $saved['finish']['printed-lam'] : $defauts['finishPerM2Cents']['printed-lam'],
				'letters'     => isset( $saved['finish']['letters'] ) ? (int) $saved['finish']['letters'] : $defauts['finishPerM2Cents']['letters'],
				'engraved'    => isset( $saved['finish']['engraved'] ) ? (int) $saved['finish']['engraved'] : $defauts['finishPerM2Cents']['engraved'],
			),
			'fixingCents'        => $nombre( 'fixing', $defauts['fixingCents'] ),
			'diffuserPerM2Cents' => $nombre( 'diffuser', $defauts['diffuserPerM2Cents'] ),
			'boxBuildCents'      => $nombre( 'boxBuild', $defauts['boxBuildCents'] ),
			'wattsPerM2'         => $nombre( 'wattsPerM2', $defauts['wattsPerM2'] ),
			'ledPerM2Cents'      => $nombre( 'ledPerM2', $defauts['ledPerM2Cents'] ),
		);
	}

	/** Coefficients pour le moteur de prix (les matières désactivées restent tarifées). */
	public static function for_pricing() {
		$s = self::settings();
		$m = array();
		foreach ( $s['materials'] as $id => $spec ) {
			unset( $spec['enabled'] );
			$m[ $id ] = $spec;
		}
		$s['materials'] = $m;
		return $s;
	}

	/** Matières réellement proposées au client. */
	public static function enabled_ids() {
		$out = array();
		foreach ( self::settings()['materials'] as $id => $spec ) {
			if ( ! empty( $spec['enabled'] ) ) {
				$out[] = $id;
			}
		}
		return $out ? $out : array_keys( self::settings()['materials'] );
	}

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'Access denied.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_save_materials' );

		$euros = static function ( $v ) {
			// Le marchand saisit des euros ; on stocke des centimes. Passer par
			// une seule conversion évite les écarts d'arrondi d'un écran à l'autre.
			return (int) round( (float) str_replace( ',', '.', (string) $v ) * 100 );
		};

		$mats = array();
		foreach ( array_keys( AHNS_Pricing::PANEL_DEFAULTS['materials'] ) as $id ) {
			$ep = isset( $_POST['thick'][ $id ] ) ? sanitize_text_field( wp_unslash( $_POST['thick'][ $id ] ) ) : '';
			$liste = array_values( array_filter( array_map(
				static function ( $x ) {
					return (float) str_replace( ',', '.', trim( $x ) );
				},
				explode( ',', $ep )
			) ) );
			$mats[ $id ] = array(
				'thicknessesMm'   => $liste,
				'perM2PerMmCents' => isset( $_POST['permm'][ $id ] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['permm'][ $id ] ) ) ) : 0,
				'baseM2Cents'     => isset( $_POST['base'][ $id ] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['base'][ $id ] ) ) ) : 0,
				'outdoorReady'    => ! empty( $_POST['outdoor'][ $id ] ),
				'enabled'         => ! empty( $_POST['on'][ $id ] ),
			);
		}

		update_option(
			self::OPTION,
			array(
				'materials'  => $mats,
				'cut'        => array(
					'rect'    => isset( $_POST['cut_rect'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['cut_rect'] ) ) ) : 0,
					'rounded' => isset( $_POST['cut_rounded'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['cut_rounded'] ) ) ) : 0,
					'shape'   => isset( $_POST['cut_shape'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['cut_shape'] ) ) ) : 0,
				),
				'finish'     => array(
					'printed'     => isset( $_POST['f_printed'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['f_printed'] ) ) ) : 0,
					'printed-lam' => isset( $_POST['f_lam'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['f_lam'] ) ) ) : 0,
					'letters'     => isset( $_POST['f_letters'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['f_letters'] ) ) ) : 0,
					'engraved'    => isset( $_POST['f_engraved'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['f_engraved'] ) ) ) : 0,
				),
				'fixing'     => isset( $_POST['fixing'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['fixing'] ) ) ) : 0,
				'diffuser'   => isset( $_POST['diffuser'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['diffuser'] ) ) ) : 0,
				'boxBuild'   => isset( $_POST['boxbuild'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['boxbuild'] ) ) ) : 0,
				// 0 (ou vide) = suivre la courbe de profondeur. Le plancher était
				// à 1, ce qui rendait « automatique » inatteignable.
				'wattsPerM2' => isset( $_POST['watts'] ) ? max( 0, (int) sanitize_text_field( wp_unslash( $_POST['watts'] ) ) ) : 0,
				'ledPerM2'   => isset( $_POST['led'] ) ? $euros( sanitize_text_field( wp_unslash( $_POST['led'] ) ) ) : 0,
			),
			false
		);
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE_SLUG . '&saved=1' ) );
		exit;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$s = self::settings();
		$e = static function ( $cents ) {
			return number_format( $cents / 100, 2, '.', '' );
		};

		AHNS_Admin_UI::open(
			__( 'Materials', 'ahime-neon-sign-configurator' ),
			__( 'The prices of your panels and light boxes. What you set here is shown to the customer AND billed by your server - never one without the other.', 'ahime-neon-sign-configurator' )
		);

		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success" style="margin:0 0 14px;"><p>' . esc_html__( 'Prices saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'ahns_save_materials' );
		echo '<input type="hidden" name="action" value="ahns_save_materials" />';

		// --- Matières ---------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Materials', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'A sheet’s price is not proportional to its thickness: a fixed part per m² (handling, offcuts, shaping) and a part that follows thickness. A purely proportional model under-charges thin sheets.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="widefat striped"><thead><tr>';
		foreach ( array(
			__( 'Offered', 'ahime-neon-sign-configurator' ),
			__( 'Material', 'ahime-neon-sign-configurator' ),
			__( 'Thicknesses (mm)', 'ahime-neon-sign-configurator' ),
			__( 'Fixed part / m²', 'ahime-neon-sign-configurator' ),
			__( 'Per mm / m²', 'ahime-neon-sign-configurator' ),
			__( 'Outdoor', 'ahime-neon-sign-configurator' ),
		) as $th ) {
			echo '<th>' . esc_html( $th ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $s['materials'] as $id => $m ) {
			printf(
				'<tr>
					<td><input type="checkbox" name="on[%1$s]" value="1"%2$s /></td>
					<td><strong>%3$s</strong></td>
					<td><input type="text" name="thick[%1$s]" value="%4$s" style="width:130px;" /></td>
					<td><input type="number" step="0.01" min="0" name="base[%1$s]" value="%5$s" style="width:100px;" /> €</td>
					<td><input type="number" step="0.01" min="0" name="permm[%1$s]" value="%6$s" style="width:100px;" /> €</td>
					<td><label><input type="checkbox" name="outdoor[%1$s]" value="1"%7$s /> %8$s</label></td>
				</tr>',
				esc_attr( $id ),
				checked( $m['enabled'], true, false ),
				esc_html( $m['label'] ),
				esc_attr( implode( ', ', $m['thicknessesMm'] ) ),
				esc_attr( $e( $m['baseM2Cents'] ) ),
				esc_attr( $e( $m['perM2PerMmCents'] ) ),
				checked( $m['outdoorReady'], true, false ),
				esc_html__( 'suitable', 'ahime-neon-sign-configurator' )
			);
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint">' . esc_html__( 'Unticking “Outdoor” makes this material REFUSED for outdoor fitting - that is the mistake that comes back as after-sales six months later.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		// --- Découpes et finitions -------------------------------------------
		$champ = static function ( $nom, $libelle, $valeur, $unite ) {
			printf(
				'<p><label style="display:flex;align-items:center;gap:10px;"><span style="min-width:230px;">%s</span><input type="number" step="0.01" min="0" name="%s" value="%s" style="width:120px;" /> %s</label></p>',
				esc_html( $libelle ),
				esc_attr( $nom ),
				esc_attr( $valeur ),
				esc_html( $unite )
			);
		};

		AHNS_Admin_UI::card_open( __( 'Cut', 'ahime-neon-sign-configurator' ) );
		$champ( 'cut_rect', __( 'Straight cut', 'ahime-neon-sign-configurator' ), $e( $s['cutPerMeterCents']['rect'] ), '€ / ml' );
		$champ( 'cut_rounded', __( 'Rounded corners', 'ahime-neon-sign-configurator' ), $e( $s['cutPerMeterCents']['rounded'] ), '€ / ml' );
		$champ( 'cut_shape', __( 'Free shape', 'ahime-neon-sign-configurator' ), $e( $s['cutPerMeterCents']['shape'] ), '€ / ml' );
		echo '<p class="ahns-hint">' . esc_html__( 'A free shape is not cut along the rectangle’s perimeter: the path winds, and the calculation adds 40 % for it.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Finishes', 'ahime-neon-sign-configurator' ) );
		$champ( 'f_printed', __( 'Printing', 'ahime-neon-sign-configurator' ), $e( $s['finishPerM2Cents']['printed'] ), '€ / m²' );
		$champ( 'f_lam', __( 'Printing + varnish (outdoor)', 'ahime-neon-sign-configurator' ), $e( $s['finishPerM2Cents']['printed-lam'] ), '€ / m²' );
		$champ( 'f_letters', __( 'Raised cut-out letters', 'ahime-neon-sign-configurator' ), $e( $s['finishPerM2Cents']['letters'] ), '€ / m²' );
		$champ( 'f_engraved', __( 'Engraving', 'ahime-neon-sign-configurator' ), $e( $s['finishPerM2Cents']['engraved'] ), '€ / m²' );
		$champ( 'fixing', __( 'Drilling and fixings', 'ahime-neon-sign-configurator' ), $e( $s['fixingCents'] ), '€' );
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Light boxes', 'ahime-neon-sign-configurator' ) );
		$champ( 'diffuser', __( 'Diffusing face', 'ahime-neon-sign-configurator' ), $e( $s['diffuserPerM2Cents'] ), '€ / m²' );
		$champ( 'led', __( 'Internal lighting', 'ahime-neon-sign-configurator' ), $e( $s['ledPerM2Cents'] ), '€ / m²' );
		$champ( 'boxbuild', __( 'Assembly', 'ahime-neon-sign-configurator' ), $e( $s['boxBuildCents'] ), '€' );
		printf(
			'<p><label style="display:flex;align-items:center;gap:10px;"><span style="min-width:230px;">%s</span><input type="number" step="1" min="0" name="watts" value="%s" placeholder="auto" style="width:120px;" /> W / m²</label></p>',
			esc_html__( 'Power to light', 'ahime-neon-sign-configurator' ),
			esc_attr( ( (int) $s['wattsPerM2'] > 0 ) ? (string) (int) $s['wattsPerM2'] : '' )
		);
		echo '<p class="ahns-hint">' . esc_html__( 'Leave EMPTY: the power draw is calculated from the box depth, which is how the product actually behaves: module rows spread further apart as they move away from the face, so a deep box needs FEWER watts per m². From 41.7 W/m² at 6 cm down to 29.1 W/m² beyond 12 cm, from the SloanLED datasheets. A value here replaces that calculation, for a merchant whose modules differ.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<p class="ahns-hint">' . esc_html__( 'It then goes through the same driver brackets as a neon sign: it is the same hardware.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		printf( '<p><button type="submit" class="ahns-btn ahns-btn--primary">%s</button></p>', esc_html__( 'Save pricing', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
		AHNS_Admin_UI::close();
	}
}
