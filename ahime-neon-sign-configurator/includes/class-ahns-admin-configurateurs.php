<?php
/**
 * L'ÉCRAN DES CONFIGURATEURS — la liste, puis la fiche de chacun.
 *
 * Il prend la place de l'ancien écran « Configurateur » (même adresse, pour ne
 * casser aucun lien ni aucun signet) : ce qui était UN réglage de boutique
 * devient UNE fiche parmi d'autres.
 *
 * Maquette : prototypes/admin-configurateurs.html
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Admin_Configurateurs
 */
class AHNS_Admin_Configurateurs {

	/** La MÊME adresse que l'ancien écran. */
	const PAGE_SLUG = 'ahns-configurator';

	const NONCE = 'ahns_configurateurs';

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 11 );
		add_action( 'admin_post_ahns_conf_save', array( $this, 'enregistrer' ) );
		add_action( 'admin_post_ahns_conf_action', array( $this, 'agir' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Configurators - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Configurators', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** L'adresse d'un écran de cet ensemble. */
	private static function url( $args = array() ) {
		return add_query_arg( array_merge( array( 'page' => self::PAGE_SLUG ), $args ), admin_url( 'admin.php' ) );
	}

	// -----------------------------------------------------------------------
	// Écriture
	// -----------------------------------------------------------------------

	/** Enregistre la fiche d'un configurateur. */
	public function enregistrer() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		// Cases à cocher : assainies dès la réception, lues ensuite comme des booléens.
		$coches_options = isset( $_POST['features'] ) ? map_deep( wp_unslash( $_POST['features'] ), 'sanitize_key' ) : array();
		$coches_fonds   = isset( $_POST['backgrounds'] ) ? map_deep( wp_unslash( $_POST['backgrounds'] ), 'sanitize_key' ) : array();
		$options        = array();
		foreach ( array_keys( AHNS_Configurator::FEATURES ) as $key ) {
			$options[ $key ] = ! empty( $coches_options[ $key ] );
		}
		$peau = isset( $_POST['peau'] ) ? sanitize_key( wp_unslash( $_POST['peau'] ) ) : 'clair-boutique';
		$fonds  = array();
		$connus = class_exists( 'AHNS_Fonds' ) ? array_keys( AHNS_Fonds::tous() ) : array_keys( AHNS_Configurator::BACKGROUNDS );
		foreach ( $connus as $key ) {
			// Les fonds LIVRÉS suivent automatiquement la peau. Les fonds ajoutés
			// par le marchand restent des choix explicites de ce configurateur.
			if ( class_exists( 'AHNS_Fonds' ) && isset( AHNS_Fonds::LIVRES[ $key ] ) ) {
				$domaine = isset( AHNS_Fonds::DOMAINES[ $peau ] )
					? AHNS_Fonds::DOMAINES[ $peau ]
					: AHNS_Fonds::DOMAINES['clair-boutique'];
				$fonds[ $key ] = in_array( $key, $domaine, true );
			} else {
				$fonds[ $key ] = ! empty( $coches_fonds[ $key ] );
			}
		}

		$id = AHNS_Configurateurs::enregistrer(
			array(
				'id'          => isset( $_POST['conf'] ) ? sanitize_key( wp_unslash( $_POST['conf'] ) ) : '',
				'nom'         => isset( $_POST['nom'] ) ? sanitize_text_field( wp_unslash( $_POST['nom'] ) ) : '',
				'peau'        => $peau,
				'mode'        => isset( $_POST['mode'] ) ? sanitize_text_field( wp_unslash( $_POST['mode'] ) ) : 'inline',
				'product_id'  => isset( $_POST['product_id'] ) ? absint( wp_unslash( $_POST['product_id'] ) ) : 0,
				'max_lines'   => isset( $_POST['max_lines'] ) ? absint( wp_unslash( $_POST['max_lines'] ) ) : 3,
				'features'    => $options,
				'backgrounds' => $fonds,
				'defaut'      => ! empty( $_POST['defaut'] ),
			)
		);

		// LA PAGE DÉDIÉE se crée depuis ici : c'est l'écran vers lequel le tableau
		// de bord envoie pour la réclamer.
		if ( ! empty( $_POST['create_page'] ) && current_user_can( 'publish_pages' ) && class_exists( 'AHNS_Page' ) ) {
			AHNS_Page::ensure_page( isset( $_POST['product_id'] ) ? absint( wp_unslash( $_POST['product_id'] ) ) : 0 );
		}

		wp_safe_redirect( self::url( array( 'conf' => $id, 'saved' => 1 ) ) );
		exit;
	}

	/** Créer, dupliquer, supprimer. */
	public function agir() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$quoi = isset( $_REQUEST['quoi'] ) ? sanitize_key( wp_unslash( $_REQUEST['quoi'] ) ) : '';
		$id   = isset( $_REQUEST['conf'] ) ? sanitize_key( wp_unslash( $_REQUEST['conf'] ) ) : '';

		if ( 'creer' === $quoi ) {
			$neuf = AHNS_Configurateurs::enregistrer(
				array( 'nom' => __( 'New configurator', 'ahime-neon-sign-configurator' ) )
			);
			wp_safe_redirect( self::url( array( 'conf' => $neuf ) ) );
			exit;
		}
		if ( 'dupliquer' === $quoi ) {
			$copie = AHNS_Configurateurs::dupliquer( $id );
			wp_safe_redirect( $copie ? self::url( array( 'conf' => $copie ) ) : self::url() );
			exit;
		}
		if ( 'supprimer' === $quoi ) {
			$fait = AHNS_Configurateurs::supprimer( $id );
			wp_safe_redirect( self::url( array( 'supprime' => $fait ? 1 : 0 ) ) );
			exit;
		}
		wp_safe_redirect( self::url() );
		exit;
	}

	// -----------------------------------------------------------------------
	// Lecture
	// -----------------------------------------------------------------------

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- simple navigation.
		$id = isset( $_GET['conf'] ) ? sanitize_key( wp_unslash( $_GET['conf'] ) ) : '';
		if ( '' !== $id && AHNS_Configurateurs::un( $id ) ) {
			$this->fiche( AHNS_Configurateurs::un( $id ) );
			return;
		}
		$this->liste();
	}

	/** Un lien d'action, signé. */
	private static function lien( $quoi, $id = '' ) {
		return wp_nonce_url(
			add_query_arg(
				array(
					'action' => 'ahns_conf_action',
					'quoi'   => $quoi,
					'conf'   => $id,
				),
				admin_url( 'admin-post.php' )
			),
			self::NONCE
		);
	}

	/**
	 * LA LISTE. Chaque ligne dit ce qui compte pour décider : l'interface,
	 * l'affichage, et COMBIEN DE PRODUITS en dépendent — le nombre qu'il faut
	 * connaître avant de cliquer sur « Supprimer ».
	 */
	private function liste() {
		$confs = AHNS_Configurateurs::tous();

		AHNS_Admin_UI::open(
			__( 'Configurators', 'ahime-neon-sign-configurator' ),
			__( 'Each configurator has its own interface, options and display. Your products name the one they use.', 'ahime-neon-sign-configurator' ),
			AHNS_Admin_UI::button( __( 'New configurator', 'ahime-neon-sign-configurator' ), self::lien( 'creer' ), 'on-accent' )
		);

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['supprime'] ) ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$ok = '1' === sanitize_key( wp_unslash( $_GET['supprime'] ) );
			printf(
				'<div class="notice notice-%s"><p>%s</p></div>',
				$ok ? 'success' : 'warning',
				esc_html(
					$ok
						? __( 'Configurator deleted. The products that used it now show as ordinary product pages.', 'ahime-neon-sign-configurator' )
						: __( 'Cannot delete: at least one configurator must remain.', 'ahime-neon-sign-configurator' )
				)
			);
		}

		AHNS_Admin_UI::card_open();
		echo '<table class="widefat striped"><thead><tr>';
		echo '<th>' . esc_html__( 'Name', 'ahime-neon-sign-configurator' ) . '</th>';
		echo '<th>' . esc_html__( 'Interface', 'ahime-neon-sign-configurator' ) . '</th>';
		echo '<th>' . esc_html__( 'Display', 'ahime-neon-sign-configurator' ) . '</th>';
		echo '<th>' . esc_html__( 'Products', 'ahime-neon-sign-configurator' ) . '</th>';
		echo '<th></th></tr></thead><tbody>';

		$modes  = AHNS_I18n::t_map( AHNS_Product::MODES );
		$unique = count( $confs ) <= 1;

		foreach ( $confs as $conf ) {
			$peau    = isset( AHNS_Appearance::THEMES[ $conf['peau'] ] ) ? AHNS_I18n::t( AHNS_Appearance::THEMES[ $conf['peau'] ][0] ) : $conf['peau'];
			$combien = AHNS_Configurateurs::compter_produits( $conf['id'] );

			echo '<tr>';
			printf(
				'<td><strong><a href="%s">%s</a></strong>%s</td>',
				esc_url( self::url( array( 'conf' => $conf['id'] ) ) ),
				esc_html( $conf['nom'] ),
				$conf['defaut'] ? ' ' . AHNS_Admin_UI::badge( __( 'default', 'ahime-neon-sign-configurator' ), 'ok' ) : '' // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			);
			printf( '<td>%s</td>', esc_html( $peau ) );
			printf( '<td>%s</td>', esc_html( isset( $modes[ $conf['mode'] ] ) ? $modes[ $conf['mode'] ] : $conf['mode'] ) );
			printf(
				'<td>%s</td>',
				esc_html(
					$conf['defaut']
						/* translators: %d: number of products that name this configurator explicitly. */
						? sprintf( __( '%d + those naming none', 'ahime-neon-sign-configurator' ), $combien )
						: (string) $combien
				)
			);

			// LA SUPPRESSION SE PRÉSENTE AVEC SON PRIX. Le nombre de fiches qui
			// vont redevenir ordinaires est écrit dans la question ; sans lui,
			// le marchand apprend la nouvelle par un client.
			$question = $combien > 0
				/* translators: 1: configurator name, 2: number of products. */
				? sprintf( __( 'Delete “%1$s”? %2$d products will become ordinary product pages: they stay on sale, but can no longer be customised.', 'ahime-neon-sign-configurator' ), $conf['nom'], $combien )
				/* translators: %s: configurator name. */
				: sprintf( __( 'Delete “%s”? No product uses it.', 'ahime-neon-sign-configurator' ), $conf['nom'] );

			printf(
				'<td style="text-align:right;white-space:nowrap;"><a href="%s">%s</a> &nbsp; <a href="%s">%s</a>%s</td>',
				esc_url( self::url( array( 'conf' => $conf['id'] ) ) ),
				esc_html__( 'Edit', 'ahime-neon-sign-configurator' ),
				esc_url( self::lien( 'dupliquer', $conf['id'] ) ),
				esc_html__( 'Duplicate', 'ahime-neon-sign-configurator' ),
				$unique
					? ''
					: sprintf(
						' &nbsp; <a href="%s" style="color:#d63638;" onclick="return confirm(%s);">%s</a>',
						esc_url( self::lien( 'supprimer', $conf['id'] ) ),
						esc_attr( wp_json_encode( $question ) ),
						esc_html__( 'Delete', 'ahime-neon-sign-configurator' )
					)
			);
			echo '</tr>';
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint" style="margin-top:12px;">' . esc_html__( 'A product naming no configurator takes the one marked “default”. The price scale stays the shop’s - it is set in Pricing.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::close();
	}

	/**
	 * LA FICHE d'un configurateur.
	 *
	 * @param array<string, mixed> $conf Le configurateur.
	 */
	private function fiche( $conf ) {
		$page_id = class_exists( 'AHNS_Page' ) ? (int) get_option( AHNS_Page::OPTION, 0 ) : 0;
		$page_ok = $page_id > 0 && 'publish' === get_post_status( $page_id );

		AHNS_Admin_UI::open(
			$conf['nom'],
			__( 'Its interface, what it offers, and how it sits on a product page.', 'ahime-neon-sign-configurator' ),
			AHNS_Admin_UI::button( __( '← All configurators', 'ahime-neon-sign-configurator' ), self::url(), 'on-accent' )
		);

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['saved'] ) ) {
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Configurator saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_conf_save" />';
		printf( '<input type="hidden" name="conf" value="%s" />', esc_attr( $conf['id'] ) );
		wp_nonce_field( self::NONCE );

		// --- Le nom -----------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Name', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'It is not shown on the shop: this is the name you will see in the list and on your product pages.', 'ahime-neon-sign-configurator' ) . '</p>';
		printf(
			'<p><input type="text" name="nom" value="%s" class="regular-text" style="max-width:420px;" /></p>',
			esc_attr( $conf['nom'] )
		);
		printf(
			'<p><label><input type="checkbox" name="defaut" value="1"%s%s /> %s</label></p>',
			checked( $conf['defaut'], true, false ),
			$conf['defaut'] ? ' disabled' : '',
			esc_html__( 'This is the default configurator - the one used by products naming none.', 'ahime-neon-sign-configurator' )
		);
		if ( $conf['defaut'] ) {
			// Décocher « par défaut » ici laisserait la boutique sans défaut du
			// tout : on l'attribue en le donnant à un autre, jamais en le retirant.
			printf( '<input type="hidden" name="defaut" value="1" />' );
			echo '<p class="ahns-hint">' . esc_html__( 'To change the default, tick the box on the one you want: it will take this one’s place.', 'ahime-neon-sign-configurator' ) . '</p>';
		}
		AHNS_Admin_UI::card_close();

		// --- L'interface -------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'The interface', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'The skin your customers see: same engine, same prices, same settings - only the presentation changes. Each preview below is the mock-up itself, live.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Appearance::galerie_des_peaux( $conf['peau'], 'peau' );
		AHNS_Admin_UI::card_close();

		// --- Le produit facturé -------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Billed product', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'The WooCommerce product used when this configurator sits outside a product page (dedicated page, shortcode). On a product page, it is always that page’s product.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<select name="product_id" style="min-width:340px;">';
		echo '<option value="0">' . esc_html__( '- None (demo mode, no cart) -', 'ahime-neon-sign-configurator' ) . '</option>';
		foreach ( (array) wc_get_products( array( 'limit' => 100, 'orderby' => 'title', 'order' => 'ASC', 'status' => 'publish' ) ) as $produit ) {
			printf(
				'<option value="%d"%s>%s</option>',
				(int) $produit->get_id(),
				selected( $conf['product_id'], $produit->get_id(), false ),
				esc_html( $produit->get_name() )
			);
		}
		echo '</select>';
		// LA PAGE DÉDIÉE. Une page « toile vierge », sans l'habillage du thème :
		// aucun conflit possible. Elle est unique à la boutique — la carte est
		// donc la même sur chaque fiche, et dit la même chose.
		if ( $page_ok ) {
			printf(
				'<p class="ahns-hint" style="margin-top:10px;">%s <a href="%s" target="_blank" rel="noopener">%s</a> · <a href="%s">%s</a></p>',
				esc_html__( 'Dedicated page:', 'ahime-neon-sign-configurator' ),
				esc_url( (string) get_permalink( $page_id ) ),
				esc_html( (string) get_permalink( $page_id ) ),
				esc_url( (string) get_edit_post_link( $page_id ) ),
				esc_html__( 'edit it', 'ahime-neon-sign-configurator' )
			);
		} else {
			printf(
				'<p style="margin-top:10px;"><label><input type="checkbox" name="create_page" value="1" checked /> %s</label></p>',
				esc_html__( 'Create the dedicated page on save', 'ahime-neon-sign-configurator' )
			);
		}
		AHNS_Admin_UI::card_close();

		// --- L'affichage --------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Display on a product page', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'The mode used by products with this configurator. Each product may then override it.', 'ahime-neon-sign-configurator' ) . '</p>';
		foreach ( AHNS_I18n::t_map( AHNS_Product::MODES ) as $value => $label ) {
			printf(
				'<p><label><input type="radio" name="mode" value="%s"%s /> %s</label></p>',
				esc_attr( $value ),
				checked( $conf['mode'], $value, false ),
				esc_html( $label )
			);
		}
		AHNS_Admin_UI::card_close();

		// --- Ce qu'il propose ----------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'What this configurator offers', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p class="ahns-hint">%s</p>',
			wp_kses(
				__( 'An unticked option <strong>disappears</strong> from this configurator and is refused at add-to-cart - you will never receive an order you cannot make.', 'ahime-neon-sign-configurator' ),
				array( 'strong' => array() )
			)
		);
		foreach ( AHNS_I18n::t_map( AHNS_Configurator::FEATURES ) as $key => $def ) {
			printf(
				'<p style="margin:10px 0;"><label><input type="checkbox" name="features[%s]" value="1"%s /> <strong>%s</strong></label><br /><span class="ahns-hint" style="margin-left:24px;">%s</span></p>',
				esc_attr( $key ),
				checked( ! empty( $conf['features'][ $key ] ), true, false ),
				esc_html( $def[0] ),
				esc_html( $def[1] )
			);
		}
		printf(
			'<p style="margin-top:16px;"><label>%s <select name="max_lines">%s</select></label></p>',
			esc_html__( 'Maximum number of text lines:', 'ahime-neon-sign-configurator' ),
			wp_kses(
				implode(
					'',
					array_map(
						static function ( $n ) use ( $conf ) {
							return sprintf( '<option value="%1$d"%2$s>%1$d</option>', $n, selected( $conf['max_lines'], $n, false ) );
						},
						array( 1, 2, 3 )
					)
				),
				array( 'option' => array( 'value' => true, 'selected' => true ) )
			)
		);
		AHNS_Admin_UI::card_close();

		// --- Les fonds d'aperçu ---------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Preview backgrounds', 'ahime-neon-sign-configurator' ) );
		if ( class_exists( 'AHNS_Fonds' ) ) {
			printf(
				'<p class="ahns-hint">%s <a href="%s">%s</a></p>',
				esc_html__( 'The scenes your customer sees their sign in - one click switches between them. Tick the ones THIS configurator offers.', 'ahime-neon-sign-configurator' ),
				esc_url( admin_url( 'admin.php?page=' . AHNS_Fonds::PAGE_SLUG ) ),
				esc_html__( 'Add your own scenes', 'ahime-neon-sign-configurator' )
			);
			echo '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;">';
			foreach ( AHNS_Fonds::tous() as $key => $fond ) {
				printf(
					'<label style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid #dcdcde;border-radius:8px;">'
					. '<input type="checkbox" name="backgrounds[%1$s]" value="1"%2$s data-fond-livre="%5$s" />'
					. '<span style="width:52px;height:34px;border-radius:6px;flex:none;border:1px solid #dcdcde;'
					. 'background:%3$s;background-size:cover;background-position:center;"></span>'
					. '<span>%4$s</span></label>',
					esc_attr( $key ),
					checked( ! empty( $conf['backgrounds'][ $key ] ), true, false ),
					'' !== $fond['image'] ? 'url(' . esc_url( $fond['image'] ) . ')' : '#e8e8ec',
					esc_html( $fond['nom'] ),
					! empty( $fond['livre'] ) ? '1' : '0'
				);
			}
			echo '</div>';

			// LE CHOIX DE L'APPARENCE CHOISIT AUSSI SES TROIS LIEUX. Le retour
			// visuel est immédiat ; la même règle est rejouée dans enregistrer(),
			// donc elle tient aussi si le navigateur bloque JavaScript.
			printf(
				'<script>(function(){var domaines=%s;function appliquer(peau){var ids=domaines[peau]||domaines["clair-boutique"]||[];document.querySelectorAll("input[name^=backgrounds][data-fond-livre=\"1\"]").forEach(function(c){c.checked=ids.indexOf(c.name.slice(12,-1))!==-1;});}document.addEventListener("change",function(e){if(e.target&&e.target.matches("input[name=peau]"))appliquer(e.target.value);});})();</script>',
				wp_json_encode( AHNS_Fonds::DOMAINES )
			);
		}
		AHNS_Admin_UI::card_close();

		// --- Le prix ---------------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Pricing', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p class="ahns-hint">%s <a href="%s">%s</a></p>',
			esc_html__( 'The scale is the shop’s - setup, tube metre, backing, power supply, options. A workshop has one cost price, not one per configurator.', 'ahime-neon-sign-configurator' ),
			esc_url( admin_url( 'admin.php?page=' . AHNS_Settings::PAGE_SLUG ) ),
			esc_html__( 'Edit the price scale', 'ahime-neon-sign-configurator' )
		);
		AHNS_Admin_UI::card_close();

		printf(
			'<p style="margin-top:20px;"><button type="submit" class="button button-primary button-hero">%s</button></p>',
			esc_html__( 'Save', 'ahime-neon-sign-configurator' )
		);
		echo '</form>';

		AHNS_Admin_UI::close();
	}
}
