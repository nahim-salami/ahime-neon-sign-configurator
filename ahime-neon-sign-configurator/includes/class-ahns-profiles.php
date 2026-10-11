<?php
/**
 * Configurateurs — plusieurs, indépendants.
 *
 * IL N'Y A PAS « UN » CONFIGURATEUR QUI PROPOSERAIT TOUT.
 *
 * Un atelier vend du néon ; il ouvre peut-être un jour une activité panneaux
 * PVC. Ce sont deux métiers, deux clientèles, souvent deux pages du site.
 * Empiler les trois familles dans une même interface obligerait le client à
 * trier ce qui ne le concerne pas, et le marchand à proposer ce qu'il ne
 * fabrique pas.
 *
 * Chaque configurateur a donc son NOM, sa PAGE, ses FAMILLES et ses OPTIONS.
 * Le marchand en crée autant qu'il a d'offres.
 *
 * PAR DÉFAUT : UN SEUL, ET IL NE FAIT QUE DU NÉON. On n'ajoute rien à son
 * insu — c'est lui qui décide d'ouvrir les panneaux ou les caissons, le jour
 * où il les fabrique.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Profiles
 */
class AHNS_Profiles {

	const OPTION    = 'ahns_profiles';
	const PAGE_SLUG = 'ahns-profiles';
	const META      = '_ahns_profile';

	/** Les familles de produit, et ce qu'elles proposent. */
	const FAMILIES = array(
		'neon'    => array( 'Neon', 'Text or logo in LED tube, on a cut backing.' ),
		'panel'   => array( 'Panel', 'Cut and printed panel · PVC, dibond, aluminium, acrylic, wood.' ),
		'boxSign' => array( 'Light box', 'Box lit from the inside, single or double-sided.' ),
	);

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 10 );
		add_action( 'admin_post_ahns_save_profile', array( $this, 'handle_save' ) );
		add_action( 'admin_post_ahns_delete_profile', array( $this, 'handle_delete' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Trades - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Trades', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	// -----------------------------------------------------------------------
	// Modèle
	// -----------------------------------------------------------------------

	/**
	 * Tous les configurateurs.
	 *
	 * Le premier est créé à la volée à partir des réglages historiques : une
	 * boutique qui tournait avant cet écran ne doit rien perdre ni rien voir
	 * changer.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function all() {
		$saved = (array) get_option( self::OPTION, array() );
		if ( empty( $saved ) ) {
			$legacy = AHNS_Configurator::settings();
			return array(
				'neon' => self::normalize(
					array(
						'name'        => __( 'Neon builder', 'ahime-neon-sign-configurator' ),
						// SEULEMENT le néon : on n'ajoute rien à l'insu du marchand.
						'families'    => array( 'neon' ),
						'features'    => $legacy['features'],
						'backgrounds' => $legacy['backgrounds'],
						'max_lines'   => $legacy['max_lines'],
						'product_id'  => $legacy['product_id'],
						'page_id'     => (int) get_option( AHNS_Page::OPTION, 0 ),
					)
				),
			);
		}
		$out = array();
		foreach ( $saved as $slug => $p ) {
			$out[ sanitize_key( $slug ) ] = self::normalize( (array) $p );
		}
		return $out;
	}

	/** Complète un configurateur avec des valeurs sûres. */
	private static function normalize( array $p ) {
		// `sanitize_key()` MET EN MINUSCULES : « boxSign » y devenait « boxsign »,
		// ne correspondait plus à la clé attendue, et la case « Caisson lumineux »
		// ne s'enregistrait jamais. Le néon et le panneau, eux, survivaient —
		// ils sont déjà en minuscules, ce qui rendait le défaut discret.
		//
		// La liste blanche EST l'assainissement : on ramène chaque valeur reçue à
		// la clé officielle, quelle que soit sa casse, et on jette le reste.
		$connues = array();
		foreach ( array_keys( self::FAMILIES ) as $cle ) {
			$connues[ strtolower( $cle ) ] = $cle;
		}
		$familles = array();
		foreach ( (array) ( $p['families'] ?? array() ) as $recue ) {
			$k = strtolower( trim( (string) $recue ) );
			if ( isset( $connues[ $k ] ) && ! in_array( $connues[ $k ], $familles, true ) ) {
				$familles[] = $connues[ $k ];
			}
		}
		// Un configurateur sans famille ne configure rien.
		if ( ! $familles ) {
			$familles = array( 'neon' );
		}
		$features = array();
		foreach ( array_keys( AHNS_Configurator::FEATURES ) as $k ) {
			$features[ $k ] = isset( $p['features'][ $k ] ) ? (bool) $p['features'][ $k ] : true;
		}
		$fonds = array();
		foreach ( array_keys( AHNS_Configurator::BACKGROUNDS ) as $k ) {
			$fonds[ $k ] = isset( $p['backgrounds'][ $k ] ) ? (bool) $p['backgrounds'][ $k ] : true;
		}
		if ( ! in_array( true, $fonds, true ) ) {
			$fonds['dark'] = true;
		}
		return array(
			'name'        => isset( $p['name'] ) ? sanitize_text_field( (string) $p['name'] ) : __( 'Configurator', 'ahime-neon-sign-configurator' ),
			'families'    => $familles,
			'features'    => $features,
			'backgrounds' => $fonds,
			'max_lines'   => isset( $p['max_lines'] ) ? max( 1, min( 3, (int) $p['max_lines'] ) ) : 3,
			'product_id'  => isset( $p['product_id'] ) ? (int) $p['product_id'] : 0,
			'page_id'     => isset( $p['page_id'] ) ? (int) $p['page_id'] : 0,
			'neon_style'  => isset( $p['neon_style'] ) && 'outline' === $p['neon_style'] ? 'outline' : 'tube',
		);
	}

	/** Un configurateur par son identifiant, ou le premier. */
	public static function get( $slug = '' ) {
		$tous = self::all();
		$slug = sanitize_key( (string) $slug );
		if ( $slug && isset( $tous[ $slug ] ) ) {
			return $tous[ $slug ];
		}
		return $tous ? reset( $tous ) : self::normalize( array() );
	}

	/**
	 * Quel configurateur pour la page courante ?
	 *
	 * L'identifiant est posé sur la page à sa création. Une page qui n'en porte
	 * pas prend le premier — le comportement d'avant, inchangé.
	 */
	public static function current_slug() {
		if ( function_exists( 'get_the_ID' ) ) {
			$id = get_the_ID();
			if ( $id ) {
				$slug = (string) get_post_meta( $id, self::META, true );
				if ( $slug && isset( self::all()[ $slug ] ) ) {
					return $slug;
				}
			}
		}
		$tous = self::all();
		return $tous ? (string) array_key_first( $tous ) : 'neon';
	}

	// -----------------------------------------------------------------------
	// Enregistrement
	// -----------------------------------------------------------------------

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'Access denied.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_save_profile' );

		$tous = self::all();
		$nom  = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
		$slug = isset( $_POST['slug'] ) ? sanitize_key( wp_unslash( $_POST['slug'] ) ) : '';
		if ( '' === $slug ) {
			$slug = sanitize_key( $nom ? $nom : 'configurateur' );
			// Deux configurateurs peuvent porter le même nom ; pas le même
			// identifiant, sinon l'un écraserait l'autre.
			$base = $slug;
			$n    = 2;
			while ( isset( $tous[ $slug ] ) ) {
				$slug = $base . '-' . $n++;
			}
		}

		$features = array();
		foreach ( array_keys( AHNS_Configurator::FEATURES ) as $k ) {
			$features[ $k ] = ! empty( $_POST['features'][ $k ] );
		}
		$fonds = array();
		foreach ( array_keys( AHNS_Configurator::BACKGROUNDS ) as $k ) {
			$fonds[ $k ] = ! empty( $_POST['backgrounds'][ $k ] );
		}

		$tous[ $slug ] = self::normalize(
			array(
				'name'        => $nom,
				'families'    => isset( $_POST['families'] ) ? map_deep( (array) wp_unslash( $_POST['families'] ), 'sanitize_text_field' ) : array(),
				'features'    => $features,
				'backgrounds' => $fonds,
				'max_lines'   => isset( $_POST['max_lines'] ) ? (int) sanitize_text_field( wp_unslash( $_POST['max_lines'] ) ) : 3,
				'product_id'  => isset( $_POST['product_id'] ) ? (int) sanitize_text_field( wp_unslash( $_POST['product_id'] ) ) : 0,
				'page_id'     => isset( $tous[ $slug ]['page_id'] ) ? (int) $tous[ $slug ]['page_id'] : 0,
				'neon_style'  => isset( $_POST['neon_style'] ) && 'outline' === sanitize_key( wp_unslash( $_POST['neon_style'] ) ) ? 'outline' : 'tube',
			)
		);

		// Sa page, créée à la demande et portant son identifiant.
		if ( ! empty( $_POST['create_page'] ) && ! $tous[ $slug ]['page_id'] ) {
			$page = wp_insert_post(
				array(
					'post_title'   => $nom ? $nom : __( 'Configurator', 'ahime-neon-sign-configurator' ),
					'post_content' => '[ahns_configurator profile="' . $slug . '"]',
					'post_status'  => 'publish',
					'post_type'    => 'page',
				),
				true
			);
			if ( ! is_wp_error( $page ) && $page ) {
				update_post_meta( $page, self::META, $slug );
				$tous[ $slug ]['page_id'] = (int) $page;
			}
		}

		update_option( self::OPTION, $tous, false );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE_SLUG . '&saved=' . $slug ) );
		exit;
	}

	public function handle_delete() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'Access denied.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_delete_profile' );
		$slug = isset( $_POST['slug'] ) ? sanitize_key( wp_unslash( $_POST['slug'] ) ) : '';
		$tous = self::all();
		// On ne supprime jamais le dernier : la boutique n'aurait plus rien à
		// afficher, et la page resterait avec un raccourci sans destination.
		if ( $slug && isset( $tous[ $slug ] ) && count( $tous ) > 1 ) {
			unset( $tous[ $slug ] );
			update_option( self::OPTION, $tous, false );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) );
		exit;
	}

	// -----------------------------------------------------------------------
	// Écran
	// -----------------------------------------------------------------------

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$tous    = self::all();
		$edite   = isset( $_GET['edit'] ) ? sanitize_key( wp_unslash( $_GET['edit'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$nouveau = isset( $_GET['new'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		AHNS_Admin_UI::open(
			__( 'Trades', 'ahime-neon-sign-configurator' ),
			__( 'What your workshop makes, and on which page. Signs and panels are two trades: piling them into one interface would force your customers to sort through what does not concern them. Skin, options and billed product are set in Configurators.', 'ahime-neon-sign-configurator' ),
			$edite || $nouveau ? '' : AHNS_Admin_UI::button( __( 'New trade', 'ahime-neon-sign-configurator' ), admin_url( 'admin.php?page=' . self::PAGE_SLUG . '&new=1' ), 'on-accent' )
		);

		if ( $edite || $nouveau ) {
			$this->render_form( $edite, $tous );
			AHNS_Admin_UI::close();
			return;
		}

		AHNS_Admin_UI::card_open();
		echo '<table class="widefat striped"><thead><tr>';
		foreach ( array(
			__( 'Configurator', 'ahime-neon-sign-configurator' ),
			__( 'Offers', 'ahime-neon-sign-configurator' ),
			__( 'Page', 'ahime-neon-sign-configurator' ),
			__( 'Shortcode', 'ahime-neon-sign-configurator' ),
			'',
		) as $th ) {
			echo '<th>' . esc_html( $th ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $tous as $slug => $p ) {
			$familles = array();
			foreach ( $p['families'] as $f ) {
				$familles[] = AHNS_I18n::t( self::FAMILIES[ $f ][0] );
			}
			$url = $p['page_id'] ? get_permalink( $p['page_id'] ) : '';
			echo '<tr>';
			printf( '<td><strong>%s</strong><br /><span style="color:#6b7280;">%s</span></td>', esc_html( $p['name'] ), esc_html( $slug ) );
			printf( '<td>%s</td>', esc_html( implode( ' · ', $familles ) ) );
			printf(
				'<td>%s</td>',
				$url ? '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html__( 'view', 'ahime-neon-sign-configurator' ) . '</a>' : '<span style="color:#9ca3af;">-</span>'
			);
			printf( '<td><code>[ahns_configurator profile="%s"]</code></td>', esc_attr( $slug ) );
			echo '<td style="text-align:right;white-space:nowrap;">';
			echo AHNS_Admin_UI::button( __( 'Edit', 'ahime-neon-sign-configurator' ), admin_url( 'admin.php?page=' . self::PAGE_SLUG . '&edit=' . $slug ), 'primary' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			if ( count( $tous ) > 1 ) {
				printf(
					' <form method="post" action="%s" style="display:inline;" onsubmit="return confirm(%s);">%s<input type="hidden" name="action" value="ahns_delete_profile" /><input type="hidden" name="slug" value="%s" /><button type="submit" class="ahns-btn ahns-btn--ghost">%s</button></form>',
					esc_url( admin_url( 'admin-post.php' ) ),
					esc_attr( wp_json_encode( __( 'Delete this configurator? Its page stays online but will show nothing.', 'ahime-neon-sign-configurator' ) ) ),
					wp_kses( wp_nonce_field( 'ahns_delete_profile', '_wpnonce', true, false ), array( 'input' => array( 'type' => true, 'id' => true, 'name' => true, 'value' => true ) ) ),
					esc_attr( $slug ),
					esc_html__( 'Delete', 'ahime-neon-sign-configurator' )
				);
			}
			echo '</td></tr>';
		}
		echo '</tbody></table>';
		AHNS_Admin_UI::card_close();
		AHNS_Admin_UI::close();
	}

	private function render_form( $slug, array $tous ) {
		$p = $slug && isset( $tous[ $slug ] ) ? $tous[ $slug ] : self::normalize( array( 'name' => '' ) );

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'ahns_save_profile' );
		echo '<input type="hidden" name="action" value="ahns_save_profile" />';
		printf( '<input type="hidden" name="slug" value="%s" />', esc_attr( $slug ) );

		AHNS_Admin_UI::card_open( __( 'Name', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p><input type="text" name="name" value="%s" style="width:100%%;max-width:420px;" placeholder="%s" /></p>',
			esc_attr( $p['name'] ),
			esc_attr__( 'Sign maker, PVC panels, Light boxes…', 'ahime-neon-sign-configurator' )
		);
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'What it offers', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Tick only what you make. A customer shown three families when you produce one hesitates instead of buying.', 'ahime-neon-sign-configurator' ) . '</p>';
		foreach ( AHNS_I18n::t_map( self::FAMILIES ) as $id => $f ) {
			printf(
				'<p><label style="display:flex;gap:10px;align-items:flex-start;"><input type="checkbox" name="families[]" value="%s"%s style="margin-top:3px;" /><span><strong>%s</strong><br /><span style="color:#6b7280;font-size:12.5px;">%s</span></span></label></p>',
				esc_attr( $id ),
				checked( in_array( $id, $p['families'], true ), true, false ),
				esc_html( $f[0] ),
				esc_html( $f[1] )
			);
		}
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Sign lighting style', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Sets the visual construction offered to customers for this configurator.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<p><label><input type="radio" name="neon_style" value="tube"' . checked( 'tube', $p['neon_style'], false ) . ' /> <strong>' . esc_html__( 'Inner tube', 'ahime-neon-sign-configurator' ) . '</strong><br /><span style="display:block;margin-left:24px;color:#6b7280;">' . esc_html__( 'A continuous tube follows the centre of the letters, like a real bent sign.', 'ahime-neon-sign-configurator' ) . '</span></label></p>';
		echo '<p><label><input type="radio" name="neon_style" value="outline"' . checked( 'outline', $p['neon_style'], false ) . ' /> <strong>' . esc_html__( 'Lit outline', 'ahime-neon-sign-configurator' ) . '</strong><br /><span style="display:block;margin-left:24px;color:#6b7280;">' . esc_html__( 'The lit tube traces the outer edge of the letters.', 'ahime-neon-sign-configurator' ) . '</span></label></p>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Options', 'ahime-neon-sign-configurator' ) );
		foreach ( AHNS_Configurator::FEATURES as $id => $f ) {
			printf(
				'<p><label><input type="checkbox" name="features[%s]" value="1"%s /> <strong>%s</strong> · <span style="color:#6b7280;">%s</span></label></p>',
				esc_attr( $id ),
				checked( ! empty( $p['features'][ $id ] ), true, false ),
				esc_html( $f[0] ),
				esc_html( $f[1] )
			);
		}
		printf(
			'<p><label>%s <input type="number" name="max_lines" min="1" max="3" value="%d" style="width:70px;" /></label></p>',
			esc_html__( 'Text lines at most', 'ahime-neon-sign-configurator' ),
			(int) $p['max_lines']
		);
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Preview scenes', 'ahime-neon-sign-configurator' ) );
		foreach ( AHNS_Configurator::BACKGROUNDS as $id => $label ) {
			printf(
				'<p><label><input type="checkbox" name="backgrounds[%s]" value="1"%s /> %s</label></p>',
				esc_attr( $id ),
				checked( ! empty( $p['backgrounds'][ $id ] ), true, false ),
				esc_html( $label )
			);
		}
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'Where it lives', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p><label>%s<br /><select name="product_id"><option value="0">%s</option>',
			esc_html__( 'Billed product', 'ahime-neon-sign-configurator' ),
			esc_html__( '- None (demonstration, no cart) -', 'ahime-neon-sign-configurator' )
		);
		if ( function_exists( 'wc_get_products' ) ) {
			foreach ( (array) wc_get_products( array( 'limit' => 80, 'status' => 'publish' ) ) as $prod ) {
				printf(
					'<option value="%d"%s>%s</option>',
					(int) $prod->get_id(),
					selected( (int) $p['product_id'], (int) $prod->get_id(), false ),
					esc_html( $prod->get_name() )
				);
			}
		}
		echo '</select></label></p>';
		if ( $p['page_id'] ) {
			printf(
				'<p class="ahns-hint">%s <a href="%s" target="_blank" rel="noopener">%s</a></p>',
				esc_html__( 'Its page:', 'ahime-neon-sign-configurator' ),
				esc_url( (string) get_permalink( $p['page_id'] ) ),
				esc_html( (string) get_permalink( $p['page_id'] ) )
			);
		} else {
			printf(
				'<p><label><input type="checkbox" name="create_page" value="1" checked /> %s</label></p>',
				esc_html__( 'Create its dedicated page', 'ahime-neon-sign-configurator' )
			);
		}
		echo '<p class="ahns-hint">' . esc_html__( 'You can also place it anywhere with its shortcode.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		printf(
			'<p>%s <a class="ahns-btn ahns-btn--ghost" href="%s">%s</a></p>',
			'<button type="submit" class="ahns-btn ahns-btn--primary">' . esc_html__( 'Save', 'ahime-neon-sign-configurator' ) . '</button>',
			esc_url( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) ),
			esc_html__( 'Cancel', 'ahime-neon-sign-configurator' )
		);
		echo '</form>';
	}
}
