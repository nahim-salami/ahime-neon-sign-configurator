<?php
/**
 * Assistant de démarrage (docs/07 §3) — sur le modèle de celui de WooCommerce :
 * il GUIDE et il INSTALLE. Huit étapes, chacune passable, aucune qui écrase
 * quoi que ce soit sans le dire.
 *
 * Lancé tout seul à la première activation, relançable depuis l'aide.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Onboarding
 */
class AHNS_Onboarding {

	const PAGE_SLUG     = 'ahns-setup';
	const OPTION        = 'ahns_onboarding';
	const NONCE         = 'ahns_setup';
	const REDIRECT_FLAG = 'ahns_onboarding_redirect';

	/** Les huit étapes, dans l'ordre. */
	const STEPS = array(
		1 => 'Welcome',
		2 => 'Shop',
		3 => 'Product',
		4 => 'Page',
		5 => 'Catalogue',
		6 => 'Pricing',
		7 => 'Appearance',
		8 => 'Done',
	);

	/** Sélection de couleurs proposée d'emblée (les plus vendues). */
	const QUICK_COLORS = array( '#fff6e0', '#ffffff', '#ff2d95', '#ff1f1f', '#ff7a1a', '#ffd60a', '#2dff6e', '#2979ff' );

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 20 );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'admin_notices', array( $this, 'banner' ) );
		add_action( 'admin_post_ahns_setup', array( $this, 'handle' ) );
		add_action( 'admin_post_ahns_setup_dismiss', array( $this, 'handle_dismiss' ) );
	}

	// -----------------------------------------------------------------------
	// État
	// -----------------------------------------------------------------------

	/** @return array{done:bool,dismissed:bool,step:int} */
	public static function state() {
		$s = (array) get_option( self::OPTION, array() );
		return array(
			'done'      => ! empty( $s['done'] ),
			'dismissed' => ! empty( $s['dismissed'] ),
			'step'      => isset( $s['step'] ) ? max( 1, min( 8, (int) $s['step'] ) ) : 1,
		);
	}

	/**
	 * Met à jour l'état sans écraser le reste.
	 *
	 * @param array $patch Champs à changer.
	 * @return void
	 */
	private static function set_state( array $patch ) {
		update_option( self::OPTION, array_merge( self::state(), $patch ) );
	}

	/** L'assistant a-t-il été mené à son terme ? */
	public static function is_done() {
		return self::state()['done'];
	}

	/**
	 * Adresse d'une étape.
	 *
	 * @param int $step Numéro d'étape (1 à 8).
	 * @return string
	 */
	public static function url( $step = 1 ) {
		return admin_url( 'admin.php?page=' . self::PAGE_SLUG . '&step=' . max( 1, min( 8, (int) $step ) ) );
	}

	// -----------------------------------------------------------------------
	// Accroches
	// -----------------------------------------------------------------------

	public function add_menu() {
		// Parent `options.php` : la page existe et répond, mais n'apparaît dans
		// aucun menu — on n'y entre que par l'assistant ou par l'aide.
		add_submenu_page(
			'options.php',
			__( 'Setup - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Setup', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Bannière tant que la configuration n'est pas menée à son terme. */
	public function banner() {
		$state  = self::state();
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $state['done'] || $state['dismissed'] || ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		// Règle 11 de l'annuaire : seulement sur nos écrans, et pas sur l'assistant lui-même.
		if ( ! $screen || false === strpos( (string) $screen->id, 'ahns-' ) || false !== strpos( (string) $screen->id, self::PAGE_SLUG ) ) {
			return;
		}
		printf(
			'<div class="notice notice-info is-dismissible"><p><strong>%s</strong> %s</p><p>%s &nbsp; <a href="%s">%s</a></p></div>',
			esc_html__( 'Finish setting up your neon configurator.', 'ahime-neon-sign-configurator' ),
			esc_html__( 'The wizard creates the product, the page and the basic settings in two minutes.', 'ahime-neon-sign-configurator' ),
			wp_kses( AHNS_Admin_UI::button( __( 'Resume the wizard', 'ahime-neon-sign-configurator' ), self::url( $state['step'] ), 'primary' ), AHNS_Admin_UI::allowed_html() ),
			esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=ahns_setup_dismiss' ), self::NONCE ) ),
			esc_html__( 'Don\'t show this again', 'ahime-neon-sign-configurator' )
		);
	}

	public function handle_dismiss() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );
		self::set_state( array( 'dismissed' => true ) );
		wp_safe_redirect( admin_url( 'admin.php?page=' . AHNS_Dashboard::PAGE_SLUG ) );
		exit;
	}

	// -----------------------------------------------------------------------
	// Enregistrement d'une étape
	// -----------------------------------------------------------------------

	public function handle() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );
		$step = isset( $_POST['step'] ) ? absint( wp_unslash( $_POST['step'] ) ) : 1;

		switch ( $step ) {
			case 2:
				$email = isset( $_POST['production_email'] ) ? sanitize_email( wp_unslash( $_POST['production_email'] ) ) : '';
				AHNS_Appearance::merge( array( 'production_email' => is_email( $email ) ? $email : '' ) );
				break;

			case 3:
				$this->save_product();
				break;

			case 4:
				AHNS_Page::ensure_page( AHNS_Configurator::default_product_id() );
				break;

			case 5:
				$this->save_catalog();
				break;

			case 6:
				$this->save_prices();
				break;

			case 7:
				$patch = array();
				if ( isset( $_POST['accent'] ) ) {
					$hex = sanitize_hex_color( wp_unslash( $_POST['accent'] ) );
					if ( $hex ) {
						$patch['accent'] = $hex;
					}
				}
				if ( isset( $_POST['logo_url'] ) ) {
					$patch['logo_url'] = esc_url_raw( wp_unslash( $_POST['logo_url'] ) );
					if ( '' !== $patch['logo_url'] ) {
						$patch['header_layout'] = 'logo-left';
					}
				}
				if ( $patch ) {
					AHNS_Appearance::merge( $patch );
				}
				break;
		}

		$next = min( 8, $step + 1 );
		self::set_state( array( 'step' => $next ) );
		wp_safe_redirect( self::url( $next ) );
		exit;
	}

	/** Étape 3 : relier un produit existant, ou en créer un. */
	private function save_product() {
		$choice = isset( $_POST['product_choice'] ) ? sanitize_text_field( wp_unslash( $_POST['product_choice'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce vérifié par check_admin_referer() dans handle(), avant cet appel.
		$id     = 0;

		if ( 'new' === $choice && class_exists( 'WC_Product_Simple' ) ) {
			$product = new WC_Product_Simple();
			$product->set_name( __( 'Custom neon', 'ahime-neon-sign-configurator' ) );
			$product->set_status( 'publish' );
			$product->set_catalog_visibility( 'visible' );
			// Le prix réel est calculé à l'ajout au panier, à partir du design.
			$product->set_regular_price( '0' );
			$product->set_price( '0' );
			$product->set_short_description( __( 'Design your neon: text, font, colour, size and backing. The price updates live.', 'ahime-neon-sign-configurator' ) );
			$id = (int) $product->save();
			if ( $id > 0 ) {
				update_post_meta( $id, AHNS_Product::META_ENABLED, 'yes' );
			}
		} elseif ( '' !== $choice ) {
			$id = (int) $choice;
			if ( $id > 0 && 'product' === get_post_type( $id ) ) {
				update_post_meta( $id, AHNS_Product::META_ENABLED, 'yes' );
			} else {
				$id = 0;
			}
		}

		if ( $id > 0 ) {
			$conf               = (array) get_option( AHNS_Configurator::OPTION, array() );
			$conf['product_id'] = $id;
			update_option( AHNS_Configurator::OPTION, $conf );
			/*
			 * LE CONFIGURATEUR PAR DÉFAUT LIT SON PRODUIT DANS AHNS_Configurateurs.
			 *
			 * Depuis les configurateurs multiples, `default_product_id()` ne lit plus
			 * l'ancien réglage : celui-ci n'a servi qu'une fois, à la migration, faite
			 * dès le premier affichage — donc AVANT que l'assistant crée le produit. Sur
			 * une installation neuve, le configurateur restait sans produit, et chaque
			 * « Ajouter au panier » répondait « Produit indisponible ». Trouvé en
			 * installant l'extension à neuf dans WordPress Playground (7 octobre 2026).
			 */
			if ( class_exists( 'AHNS_Configurateurs' ) ) {
				$defaut               = AHNS_Configurateurs::defaut();
				$defaut['product_id'] = $id;
				AHNS_Configurateurs::enregistrer( $defaut );
			}
		}
	}

	/** Étape 5 : polices et couleurs proposées. */
	private function save_catalog() {
		$fonts = array();
		foreach ( isset( $_POST['fonts'] ) ? map_deep( (array) wp_unslash( $_POST['fonts'] ), 'sanitize_text_field' ) : array() as $id ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce vérifié par check_admin_referer() dans handle(), avant cet appel.
			$id = sanitize_key( (string) $id );
			if ( isset( AHNS_Fonts::available()[ $id ] ) ) {
				$fonts[] = $id;
			}
		}
		if ( $fonts ) {
			$saved            = (array) get_option( AHNS_Fonts::OPTION, array() );
			$saved['enabled'] = $fonts;
			update_option( AHNS_Fonts::OPTION, $saved );
		}

		$colors = array();
		foreach ( isset( $_POST['colors'] ) ? map_deep( (array) wp_unslash( $_POST['colors'] ), 'sanitize_text_field' ) : array() as $hex ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce vérifié par check_admin_referer() dans handle(), avant cet appel.
			$hex = sanitize_hex_color( (string) $hex );
			if ( $hex ) {
				$colors[] = strtolower( $hex );
			}
		}
		if ( $colors ) {
			$saved            = (array) get_option( AHNS_Catalog::COLORS_OPTION, array() );
			$saved['enabled'] = $colors;
			if ( empty( $saved['default'] ) || ! in_array( strtolower( (string) $saved['default'] ), $colors, true ) ) {
				$saved['default'] = $colors[0];
			}
			update_option( AHNS_Catalog::COLORS_OPTION, $saved );
		}
	}

	/**
	 * Étape 6 : les deux coefficients qui pèsent le plus.
	 * Les tailles, paliers et autres réglages déjà en place sont PRÉSERVÉS.
	 */
	private function save_prices() {
		$scalars = array();
		foreach ( array( 'baseCents' => 100, 'tubePerMeterCents' => 100 ) as $key => $factor ) {
			if ( ! isset( $_POST[ $key ] ) || '' === trim( sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce vérifié par check_admin_referer() dans handle(), avant cet appel.
				continue;
			}
			$value           = (float) str_replace( ',', '.', sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce vérifié par check_admin_referer() dans handle(), avant cet appel.
			$scalars[ $key ] = (int) round( $value * $factor );
		}
		if ( ! $scalars ) {
			return;
		}
		$existing = (array) get_option( AHNS_Settings::OPTION, array() );
		update_option( AHNS_Settings::OPTION, array_merge( $existing, AHNS_Pricing::sanitize_overrides( $scalars ) ) );
	}

	// -----------------------------------------------------------------------
	// Affichage
	// -----------------------------------------------------------------------

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$step = isset( $_GET['step'] ) ? max( 1, min( 8, absint( wp_unslash( $_GET['step'] ) ) ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
		if ( 8 === $step ) {
			self::set_state( array( 'done' => true, 'step' => 8 ) );
		}
		if ( 7 === $step ) {
			wp_enqueue_media(); // sélecteur de logo.
		}

		echo '<div class="ahns-setup">';

		// --- Rail des étapes ---------------------------------------------------
		echo '<ol class="ahns-setup__rail">';
		foreach ( AHNS_I18n::t_map( self::STEPS ) as $n => $label ) {
			$class = $n < $step ? 'is-past' : ( $n === $step ? 'is-current' : '' );
			printf(
				'<li class="%s"><span>%s</span>%s</li>',
				esc_attr( $class ),
				$n < $step ? '&#10003;' : (int) $n,
				esc_html( $label )
			);
		}
		echo '</ol>';

		echo '<div class="ahns-card ahns-setup__card">';
		$method = 'step_' . $step;
		$this->$method();
		echo '</div>';

		printf(
			'<p class="ahns-setup__exit"><a href="%s">%s</a></p>',
			esc_url( admin_url( 'admin.php?page=' . AHNS_Dashboard::PAGE_SLUG ) ),
			esc_html__( 'Leave the wizard', 'ahime-neon-sign-configurator' )
		);
		echo '</div>';
	}

	/**
	 * Pied de formulaire : bouton principal + « passer cette étape ».
	 *
	 * @param int    $step  Étape courante.
	 * @param string $label Libellé du bouton principal.
	 * @return void
	 */
	private function footer( $step, $label = '' ) {
		// La traduction se fait ICI : PHP interdit un appel de fonction dans
		// une valeur par defaut de parametre.
		if ( '' === $label ) {
			$label = __( 'Continue', 'ahime-neon-sign-configurator' );
		}
		echo '<div class="ahns-setup__actions">';
		printf( '<button type="submit" class="ahns-btn ahns-btn--primary">%s</button>', esc_html( $label ) );
		if ( $step < 8 ) {
			printf(
				'<a class="ahns-setup__skip" href="%s">%s</a>',
				esc_url( self::url( $step + 1 ) ),
				esc_html__( 'Skip this step', 'ahime-neon-sign-configurator' )
			);
		}
		echo '</div>';
	}

	/**
	 * Ouvre le formulaire d'une étape.
	 *
	 * @param int $step Étape.
	 * @return void
	 */
	private function form_open( $step ) {
		printf( '<form method="post" action="%s">', esc_url( admin_url( 'admin-post.php' ) ) );
		wp_nonce_field( self::NONCE );
		echo '<input type="hidden" name="action" value="ahns_setup" />';
		printf( '<input type="hidden" name="step" value="%d" />', (int) $step );
	}

	/**
	 * Titre et chapeau d'une étape.
	 *
	 * @param string $title Titre.
	 * @param string $lead  Chapeau.
	 * @return void
	 */
	private function head( $title, $lead ) {
		printf( '<h1>%s</h1><p class="ahns-setup__lead">%s</p>', esc_html( $title ), esc_html( $lead ) );
		/*
		 * L'ALERTE DU PARC SUIT L'ASSISTANT (chantier A6).
		 *
		 * C'est ici qu'un marchand decouvre son extension, et donc ici qu'il
		 * faut lui dire que certains prix reposent sur des valeurs par defaut.
		 * Le lui apprendre trois mois plus tard, au detour d'un ecran de
		 * reglages, serait le lui apprendre trop tard.
		 *
		 * Dans le `head` plutot qu'a une etape precise : les etapes changent,
		 * le titre non.
		 */
		if ( class_exists( 'AHNS_Settings' ) && method_exists( 'AHNS_Settings', 'rendre_alerte_parc' ) ) {
			AHNS_Settings::rendre_alerte_parc();
		}
	}

	// --- Étape 1 : bienvenue -----------------------------------------------

	private function step_1() {
		$this->head(
			__( 'Welcome', 'ahime-neon-sign-configurator' ),
			__( 'Two minutes to make your shop able to sell made-to-measure neons.', 'ahime-neon-sign-configurator' )
		);
		echo '<ul class="ahns-checklist">';
		$points = array(
			array( __( 'A 2D and 3D configurator', 'ahime-neon-sign-configurator' ), __( 'Your customer types their text, picks a font, a colour, a size and a backing - and sees the result.', 'ahime-neon-sign-configurator' ) ),
			array( __( 'A fair price, calculated on your own server', 'ahime-neon-sign-configurator' ), __( 'Tube length is measured on the real outline of the letters. The price is recalculated on the server: the browser decides nothing.', 'ahime-neon-sign-configurator' ) ),
			array( __( 'An order the workshop can actually use', 'ahime-neon-sign-configurator' ), __( 'Every order carries the full specification: text, font, colours, dimensions, backing, power supply.', 'ahime-neon-sign-configurator' ) ),
		);
		foreach ( $points as $i => $p ) {
			printf(
				'<li><span class="ahns-check-ico ahns-check-ico--todo">%d</span><span class="ahns-check-body"><strong>%s</strong><span>%s</span></span></li>',
				(int) ( $i + 1 ),
				esc_html( $p[0] ),
				esc_html( $p[1] )
			);
		}
		echo '</ul>';
		$this->form_open( 1 );
		$this->footer( 1, __( 'Let\'s go', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
	}

	// --- Étape 2 : boutique -------------------------------------------------

	private function step_2() {
		$this->head(
			__( 'Your shop', 'ahime-neon-sign-configurator' ),
			__( 'This information comes from WooCommerce. We only need to know where to send the production sheets.', 'ahime-neon-sign-configurator' )
		);
		$currency = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '-';
		$country  = function_exists( 'wc_get_base_location' ) ? (string) wc_get_base_location()['country'] : '';
		$email    = AHNS_Appearance::settings()['production_email'];

		echo '<table class="form-table"><tbody>';
		printf(
			'<tr><th scope="row">%s</th><td><code>%s</code> &nbsp;·&nbsp; <code>%s</code><p class="description">%s</p></td></tr>',
			esc_html__( 'Currency and country', 'ahime-neon-sign-configurator' ),
			esc_html( $currency ),
			esc_html( '' !== $country ? $country : '-' ),
			esc_html__( 'Set in WooCommerce; the configurator prices follow them.', 'ahime-neon-sign-configurator' )
		);
		$this->form_open( 2 );
		printf(
			'<tr><th scope="row"><label for="ahns-email">%s</label></th><td><input type="email" id="ahns-email" name="production_email" class="regular-text" value="%s" placeholder="%s" /><p class="description">%s</p></td></tr>',
			esc_html__( 'Workshop e-mail', 'ahime-neon-sign-configurator' ),
			esc_attr( $email ),
			esc_attr( get_option( 'admin_email' ) ),
			esc_html__( 'Recipient of the full specification with every order. Leave empty to send nothing.', 'ahime-neon-sign-configurator' )
		);
		echo '</tbody></table>';
		$this->footer( 2 );
		echo '</form>';
	}

	// --- Étape 3 : produit --------------------------------------------------

	private function step_3() {
		$current = AHNS_Configurator::default_product_id();
		$this->head(
			__( 'The billed product', 'ahime-neon-sign-configurator' ),
			__( 'It is the one that carries the calculated price when a customer adds their neon to the cart.', 'ahime-neon-sign-configurator' )
		);

		if ( ! function_exists( 'wc_get_products' ) ) {
			echo '<p class="ahns-setup__warn">' . esc_html__( 'WooCommerce is not active: a product cannot be created for now.', 'ahime-neon-sign-configurator' ) . '</p>';
			$this->form_open( 3 );
			$this->footer( 3 );
			echo '</form>';
			return;
		}

		$this->form_open( 3 );
		echo '<div class="ahns-setup__choices">';

		if ( $current > 0 ) {
			// Rien n'est écrasé sans le dire : le produit déjà relié passe en tête.
			printf(
				'<label class="ahns-setup__choice"><input type="radio" name="product_choice" value="%d" checked /><span><strong>%s</strong><em>%s</em></span></label>',
				(int) $current,
				esc_html( sprintf( /* translators: %s: product name. */ __( 'Keep "%s"', 'ahime-neon-sign-configurator' ), get_the_title( $current ) ) ),
				esc_html__( 'This product is already linked to the configurator.', 'ahime-neon-sign-configurator' )
			);
		}

		printf(
			'<label class="ahns-setup__choice"><input type="radio" name="product_choice" value="new"%s /><span><strong>%s</strong><em>%s</em></span></label>',
			$current > 0 ? '' : ' checked',
			esc_html__( 'Create a "Custom neon" product', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Published, priced at 0 - the configurator sets the amount at cart time.', 'ahime-neon-sign-configurator' )
		);

		$products = wc_get_products( array( 'limit' => 50, 'status' => 'publish', 'orderby' => 'date', 'order' => 'DESC' ) );
		if ( $products ) {
			echo '<label class="ahns-setup__choice ahns-setup__choice--select"><input type="radio" name="product_choice" value="" /><span><strong>' . esc_html__( 'Use an existing product', 'ahime-neon-sign-configurator' ) . '</strong>';
			echo '<select name="product_choice_existing" onchange="this.closest(\'label\').querySelector(\'input\').value=this.value;this.closest(\'label\').querySelector(\'input\').checked=true;">';
			printf( '<option value="">%s</option>', esc_html__( '- choose -', 'ahime-neon-sign-configurator' ) );
			foreach ( $products as $p ) {
				printf( '<option value="%d">%s</option>', (int) $p->get_id(), esc_html( $p->get_name() ) );
			}
			echo '</select></span></label>';
		}

		echo '</div>';
		$this->footer( 3 );
		echo '</form>';
	}

	// --- Étape 4 : page -----------------------------------------------------

	private function step_4() {
		$page_id = (int) get_option( AHNS_Page::OPTION, 0 );
		$exists  = $page_id > 0 && 'publish' === get_post_status( $page_id );
		$this->head(
			__( 'The configurator page', 'ahime-neon-sign-configurator' ),
			__( 'A blank-canvas page: no menu, no footer, nothing to fight the configurator.', 'ahime-neon-sign-configurator' )
		);

		if ( $exists ) {
			printf(
				'<p class="ahns-setup__ok">%s <a href="%s" target="_blank" rel="noopener">%s</a></p>',
				esc_html__( 'Your page already exists - we will not create a second one.', 'ahime-neon-sign-configurator' ),
				esc_url( (string) get_permalink( $page_id ) ),
				esc_html( (string) get_the_title( $page_id ) )
			);
		} else {
			printf(
				'<p class="ahns-setup__lead">%s</p>',
				esc_html__( 'We will publish a "Neon builder" page containing the configurator.', 'ahime-neon-sign-configurator' )
			);
		}
		echo '<p class="description">' . sprintf( /* translators: %s: the shortcode. */ esc_html__( 'You can also place the configurator anywhere with the shortcode %s.', 'ahime-neon-sign-configurator' ), '<code>[ahns_configurator]</code>' ) . '</p>';

		$this->form_open( 4 );
		$this->footer( 4, $exists ? __( 'Continue', 'ahime-neon-sign-configurator' ) : __( 'Create the page', 'ahime-neon-sign-configurator' ) );
		echo '</form>';
	}

	// --- Étape 5 : catalogue ------------------------------------------------

	private function step_5() {
		$this->head(
			__( 'Fonts and colours', 'ahime-neon-sign-configurator' ),
			__( 'What you tick here is everything your customer will be able to pick. You can refine it later.', 'ahime-neon-sign-configurator' )
		);
		$this->form_open( 5 );

		$available = AHNS_Fonts::available();
		$enabled   = AHNS_Fonts::enabled_ids();
		echo '<h2>' . esc_html__( 'Fonts', 'ahime-neon-sign-configurator' ) . '</h2><div class="ahns-setup__pills">';
		foreach ( array_keys( $available ) as $id ) {
			printf(
				'<label class="ahns-setup__pill"><input type="checkbox" name="fonts[]" value="%s"%s /><span>%s</span></label>',
				esc_attr( $id ),
				in_array( $id, $enabled, true ) ? ' checked' : '',
				esc_html( AHNS_Fonts::font_label( $id ) )
			);
		}
		echo '</div>';

		$saved_colors = (array) get_option( AHNS_Catalog::COLORS_OPTION, array() );
		$checked      = isset( $saved_colors['enabled'] ) ? array_map( 'strtolower', (array) $saved_colors['enabled'] ) : self::QUICK_COLORS;
		echo '<h2 style="margin-top:22px;">' . esc_html__( 'Tube colours', 'ahime-neon-sign-configurator' ) . '</h2><div class="ahns-setup__swatches">';
		foreach ( AHNS_I18n::t_map( AHNS_Catalog::PALETTE ) as $hex => $label ) {
			printf(
				'<label class="ahns-setup__swatch" title="%s"><input type="checkbox" name="colors[]" value="%s"%s /><span style="--c:%s"></span><em>%s</em></label>',
				esc_attr( $label ),
				esc_attr( $hex ),
				in_array( strtolower( $hex ), $checked, true ) ? ' checked' : '',
				esc_attr( $hex ),
				esc_html( $label )
			);
		}
		echo '</div>';

		$this->footer( 5 );
		echo '</form>';
	}

	// --- Étape 6 : tarifs ---------------------------------------------------

	private function step_6() {
		$this->head(
			__( 'Your pricing', 'ahime-neon-sign-configurator' ),
			__( 'Two coefficients are enough to frame your prices. The three examples below use your current values.', 'ahime-neon-sign-configurator' )
		);
		$coeff   = AHNS_Pricing::COEFF;
		$saved   = (array) get_option( AHNS_Settings::OPTION, array() );
		$base    = isset( $saved['baseCents'] ) ? (int) $saved['baseCents'] : (int) $coeff['baseCents'];
		$tube    = isset( $saved['tubePerMeterCents'] ) ? (int) $saved['tubePerMeterCents'] : (int) $coeff['tubePerMeterCents'];
		$pricing = new AHNS_Pricing();

		$this->form_open( 6 );
		echo '<table class="form-table"><tbody>';
		printf(
			'<tr><th scope="row"><label for="ahns-base">%s</label></th><td><input type="number" step="0.01" min="0" id="ahns-base" name="baseCents" value="%s" class="small-text" /> €<p class="description">%s</p></td></tr>',
			esc_html__( 'Setup fee', 'ahime-neon-sign-configurator' ),
			esc_attr( number_format( $base / 100, 2, '.', '' ) ),
			esc_html__( 'What every piece costs whatever its size: cutting, wiring, testing, packing.', 'ahime-neon-sign-configurator' )
		);
		printf(
			'<tr><th scope="row"><label for="ahns-tube">%s</label></th><td><input type="number" step="0.01" min="0" id="ahns-tube" name="tubePerMeterCents" value="%s" class="small-text" /> €/m<p class="description">%s</p></td></tr>',
			esc_html__( 'LED tube', 'ahime-neon-sign-configurator' ),
			esc_attr( number_format( $tube / 100, 2, '.', '' ) ),
			esc_html__( 'Price per metre of fitted tube. The length is measured on the real outline of the letters.', 'ahime-neon-sign-configurator' )
		);
		echo '</tbody></table>';

		echo '<h2 style="margin-top:14px;">' . esc_html__( 'Three examples', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<table class="widefat striped"><tbody>';
		foreach ( AHNS_Settings::WITNESSES as $w ) {
			$m = $pricing->measure( $w['config'] );
			$p = $pricing->price( $w['config'], $m );
			printf(
				'<tr><td>%s<br /><span class="description">' . /* translators: %s: length of LED tube in metres. */ esc_html__( '%s m of tube', 'ahime-neon-sign-configurator' ) . '</span></td><td style="text-align:right;width:120px;"><strong>%s</strong></td></tr>',
				esc_html( $w['label'] ),
				esc_html( number_format( (float) $m['tubeLengthM'], 2, ',', ' ' ) ),
				wp_kses_post( wc_price( $p['displayTotalCents'] / 100 ) )
			);
		}
		echo '</tbody></table>';
		echo '<p class="description">' . esc_html__( 'Save to watch these prices move. Sizes, tiers and options are set later on the Pricing screen.', 'ahime-neon-sign-configurator' ) . '</p>';

		$this->footer( 6 );
		echo '</form>';
	}

	// --- Étape 7 : apparence ------------------------------------------------

	private function step_7() {
		$s = AHNS_Appearance::settings();
		$this->head(
			__( 'Your brand', 'ahime-neon-sign-configurator' ),
			__( 'A single colour dresses the configurator, the cart, the orders and this admin.', 'ahime-neon-sign-configurator' )
		);
		$this->form_open( 7 );
		echo '<table class="form-table"><tbody>';
		printf(
			'<tr><th scope="row"><label for="ahns-accent">%s</label></th><td><input type="color" id="ahns-accent" name="accent" value="%s" style="width:64px;height:38px;padding:2px;vertical-align:middle;" /> <code>%s</code></td></tr>',
			esc_html__( 'Brand colour', 'ahime-neon-sign-configurator' ),
			esc_attr( $s['accent'] ),
			esc_html( $s['accent'] )
		);
		printf(
			'<tr><th scope="row">%s</th><td>
				<input type="hidden" id="ahns-logo" name="logo_url" value="%s" />
				<img id="ahns-logo-preview" src="%s" alt="" style="max-height:52px;display:%s;margin-bottom:8px;" />
				<p><button type="button" class="button" id="ahns-logo-pick">%s</button> <button type="button" class="button" id="ahns-logo-clear">%s</button></p>
				<p class="description">%s</p></td></tr>',
			esc_html__( 'Header logo', 'ahime-neon-sign-configurator' ),
			esc_attr( $s['logo_url'] ),
			esc_url( $s['logo_url'] ),
			'' !== $s['logo_url'] ? 'block' : 'none',
			esc_html__( 'Choose a logo', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Remove', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Optional. With no logo, the configurator shows the site name.', 'ahime-neon-sign-configurator' )
		);
		echo '</tbody></table>';
		$this->footer( 7 );
		echo '</form>';
		AHNS_Admin_UI::inline_js(
			'ahns-setup-logo',
			'		( function () {
			var pick = document.getElementById( \'ahns-logo-pick\' );
			var clear = document.getElementById( \'ahns-logo-clear\' );
			var field = document.getElementById( \'ahns-logo\' );
			var img = document.getElementById( \'ahns-logo-preview\' );
			var frame;
			if ( ! pick || ! window.wp || ! window.wp.media ) { return; }
			pick.addEventListener( \'click\', function () {
				frame = frame || wp.media( { title: '
			. wp_json_encode( __( 'Logo', 'ahime-neon-sign-configurator' ) )
			. ', multiple: false, library: { type: \'image\' } } );
				frame.off( \'select\' ).on( \'select\', function () {
					var a = frame.state().get( \'selection\' ).first().toJSON();
					field.value = a.url;
					img.src = a.url;
					img.style.display = \'block\';
				} );
				frame.open();
			} );
			clear.addEventListener( \'click\', function () {
				field.value = \'\';
				img.style.display = \'none\';
			} );
		}() );'
		);
	}

	// --- Étape 8 : terminé --------------------------------------------------

	private function step_8() {
		$page_id = (int) get_option( AHNS_Page::OPTION, 0 );
		$this->head(
			__( 'You\'re ready', 'ahime-neon-sign-configurator' ),
			__( 'Your shop can sell made-to-measure neons. Here is what is left, if anything.', 'ahime-neon-sign-configurator' )
		);

		echo '<ul class="ahns-checklist">';
		foreach ( AHNS_Dashboard::checklist() as $i => $step ) {
			printf(
				'<li><span class="ahns-check-ico ahns-check-ico--%s">%s</span><span class="ahns-check-body"><strong>%s</strong><span>%s</span></span>%s</li>',
				$step['done'] ? 'done' : 'todo',
				$step['done'] ? '&#10003;' : (int) ( $i + 1 ),
				esc_html( $step['title'] ),
				esc_html( $step['hint'] ),
				$step['done']
					? wp_kses( AHNS_Admin_UI::badge( 'OK', 'ok' ), AHNS_Admin_UI::allowed_html() )
					: wp_kses( AHNS_Admin_UI::button( $step['cta'], $step['url'], 'primary' ), AHNS_Admin_UI::allowed_html() )
			);
		}
		echo '</ul>';

		echo '<div class="ahns-setup__actions" style="margin-top:20px;">';
		echo wp_kses( AHNS_Admin_UI::button( __( 'Go to the dashboard', 'ahime-neon-sign-configurator' ), admin_url( 'admin.php?page=' . AHNS_Dashboard::PAGE_SLUG ), 'primary' ), AHNS_Admin_UI::allowed_html() );
		if ( $page_id > 0 && 'publish' === get_post_status( $page_id ) ) {
			echo wp_kses( ' ' . AHNS_Admin_UI::button( __( 'View the configurator', 'ahime-neon-sign-configurator' ), (string) get_permalink( $page_id ), 'ghost', array( 'target' => '_blank', 'rel' => 'noopener' ) ), AHNS_Admin_UI::allowed_html() );
			echo wp_kses( ' ' . AHNS_Admin_UI::button( __( 'Add the page to a menu', 'ahime-neon-sign-configurator' ), admin_url( 'nav-menus.php' ), 'ghost' ), AHNS_Admin_UI::allowed_html() );
		}
		echo '</div>';
	}

	// -----------------------------------------------------------------------
	// Styles
	// -----------------------------------------------------------------------

	/**
	 * La feuille de l'assistant, dans l'en-tête de SON écran seulement : elle
	 * masque l'habillage de l'administration, elle doit donc précéder le contenu.
	 *
	 * @param string $hook Écran courant.
	 * @return void
	 */
	public function enqueue( $hook ) {
		if ( false === strpos( (string) $hook, self::PAGE_SLUG ) ) {
			return;
		}
		AHNS_Admin_UI::inline_css( 'ahns-setup', self::css() );
	}

	private static function css() {
		$accent = AHNS_Appearance::accent();
		return "
/* L'assistant reste un écran de l'administration : aucune règle ne touche l'interface de WordPress. */
.ahns-setup{max-width:840px;margin:0 auto;padding:38px 20px 60px;}
.ahns-setup h1{font-size:26px;font-weight:800;margin:0 0 6px;letter-spacing:-.3px;}
.ahns-setup h2{font-size:15px;font-weight:700;margin:0 0 10px;}
.ahns-setup__lead{color:#5b616b;font-size:14px;margin:0 0 20px;max-width:65ch;}
.ahns-setup__card{padding:28px 30px;}
.ahns-setup__ok{background:#e4f4eb;color:#0b6b45;padding:10px 14px;border-radius:10px;font-weight:600;}
.ahns-setup__warn{background:#fdf3d7;color:#8a6100;padding:10px 14px;border-radius:10px;font-weight:600;}

/* Rail des étapes */
.ahns-setup__rail{display:flex;flex-wrap:wrap;gap:6px 18px;list-style:none;margin:0 0 22px;padding:0;justify-content:center;}
.ahns-setup__rail li{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#8a9099;font-weight:600;}
.ahns-setup__rail li span{width:23px;height:23px;border-radius:50%;background:#e2e4e9;color:#6b7280;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;}
.ahns-setup__rail li.is-current{color:#14161c;}
.ahns-setup__rail li.is-current span{background:{$accent};color:#fff;}
.ahns-setup__rail li.is-past span{background:#e4f4eb;color:#0b6b45;}

/* Choix */
.ahns-setup__choices{display:flex;flex-direction:column;gap:10px;margin-bottom:8px;}
.ahns-setup__choice{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1.5px solid #e2e4e9;border-radius:12px;cursor:pointer;}
.ahns-setup__choice:hover{border-color:#c3c7ce;}
.ahns-setup__choice input{margin-top:3px;}
.ahns-setup__choice span{display:flex;flex-direction:column;gap:3px;flex:1;}
.ahns-setup__choice em{font-style:normal;color:#6b7280;font-size:12.5px;}
.ahns-setup__choice select{margin-top:6px;max-width:100%;}

/* Pastilles et échantillons */
.ahns-setup__pills{display:flex;flex-wrap:wrap;gap:8px;}
.ahns-setup__pill{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border:1.5px solid #e2e4e9;border-radius:999px;cursor:pointer;font-size:13px;}
.ahns-setup__pill:has(input:checked){border-color:{$accent};background:rgba(0,0,0,.02);font-weight:600;}
.ahns-setup__swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:9px;}
.ahns-setup__swatch{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1.5px solid #e2e4e9;border-radius:10px;cursor:pointer;font-size:12px;}
.ahns-setup__swatch:has(input:checked){border-color:{$accent};}
.ahns-setup__swatch span{width:20px;height:20px;border-radius:50%;background:var(--c);box-shadow:0 0 9px 1px var(--c);flex:none;}
.ahns-setup__swatch em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* Pied */
.ahns-setup__actions{display:flex;align-items:center;gap:16px;margin-top:24px;flex-wrap:wrap;}
.ahns-setup__actions .ahns-btn{cursor:pointer;font-family:inherit;}
.ahns-setup__skip{color:#6b7280;font-size:13px;text-decoration:underline;}
.ahns-setup__exit{text-align:center;margin-top:18px;}
.ahns-setup__exit a{color:#8a9099;font-size:12.5px;}
";
	}
}
