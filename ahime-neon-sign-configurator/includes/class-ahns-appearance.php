<?php
/**
 * Écran « Apparence » (docs/07 §2.8) : couleur de marque, libellés des boutons,
 * en-tête du configurateur (nom du site ou logo), langue de l'administration et
 * e-mail atelier.
 *
 * La couleur de marque pilote TOUT : boutons du configurateur, boutons du
 * panier et des commandes, et les accents de cette administration.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Appearance
 */
class AHNS_Appearance {

	const PAGE_SLUG = 'ahns-appearance';
	const OPTION    = 'ahns_appearance';
	const NONCE     = 'ahns_appearance_save';

	/** Dispositions de l'en-tête du configurateur. */
	const LAYOUTS = array(
		'text'        => 'Site name only',
		'logo'        => 'Logo only',
		'logo-left'   => 'Logo left of the name',
		'logo-right'  => 'Logo right of the name',
		'logo-top'    => 'Logo above the name',
		'logo-bottom' => 'Logo below the name',
	);

	/**
	 * Thèmes d'interface du configurateur : identifiant => [nom, description].
	 *
	 * Miroir du registre du widget (packages/widget/src/themes.ts) — les deux
	 * listes doivent rester alignées : ici la barrière de SAISIE (une valeur
	 * hors liste n'est jamais enregistrée), là-bas la barrière d'AFFICHAGE
	 * (un identifiant inconnu retombe sur le défaut).
	 *
	 * La liste grandit au rythme du plan docs/10-integration-themes.md.
	 */
	const THEMES = array(
		'clair-boutique' => array( 'Bright shop', 'The original theme: white background, your brand colour, scrolling panel.' ),
	);

	/**
	 * Les peaux DESSINÉES qui attendent leur intégration (docs/10).
	 *
	 * Elles ne sont pas dans THEMES, et c'est délibéré : cette constante-là est
	 * la barrière de saisie, et rien de ce qui s'y trouve ne doit pouvoir être
	 * enregistré. Le widget n'a aucune règle pour ces peaux — les rendre
	 * choisissables ferait retomber la boutique sur le thème par défaut sans un
	 * mot d'explication, ce qui est la pire des réponses : le marchand croit
	 * avoir changé d'habillage et ne voit rien changer.
	 *
	 * Elles sont MONTRÉES quand même, avec leur maquette et la mention qui va
	 * avec. Cacher la moitié de la gamme jusqu'au jour de sa livraison priverait
	 * le marchand de ce qui l'aide le plus à choisir : voir où va le produit.
	 *
	 * Miroir : PEAUX_A_VENIR dans packages/dashboard/api/_lib/themes.mjs, et
	 * MAQUETTES_A_VENIR dans scripts/build-site.py.
	 */
	const THEMES_A_VENIR = array(
	);

	/** Libellés personnalisables : clé => [libellé du champ, valeur par défaut]. */
	const LABELS = array(
		'title'      => array( 'Configurator title', '' ),
		'addToCart'  => array( '"Add to cart" button', 'Add to cart' ),
		'checkout'   => array( '"Checkout" button', 'Checkout' ),
		'another'    => array( '"Make another" button', 'Make another' ),
	);

	/**
	 * Langues proposées pour le CONFIGURATEUR — les quatorze du dictionnaire.
	 *
	 * Elle est plus longue que celle de l'administration, et c'est normal : le
	 * plugin n'est traduit que dans une poignée de langues, quand le widget en
	 * parle quatorze. Les confondre priverait un marchand de dix langues que
	 * son configurateur sait déjà servir.
	 */
	const WIDGET_LANGUAGES = array(
		''      => 'Follow the site language',
		'fr_FR' => 'Français',
		'en_US' => 'English',
		'es_ES' => 'Español',
		'pt_BR' => 'Português',
		'de_DE' => 'Deutsch',
		'it_IT' => 'Italiano',
		'nl_NL' => 'Nederlands',
		'id_ID' => 'Bahasa Indonesia',
		'ru_RU' => 'Русский',
		'zh_CN' => '中文',
		'ja'    => '日本語',
		'hi_IN' => 'हिन्दी',
		'bn_BD' => 'বাংলা',
		'ar'    => 'العربية',
		'ur'    => 'اردو',
	);

	/** Langues proposées pour l'administration du plugin. */
	const LANGUAGES = array(
		''      => 'Follow the site language',
		'fr_FR' => 'Français',
		'en_US' => 'English',
		'es_ES' => 'Español',
		'pt_BR' => 'Português',
		'de_DE' => 'Deutsch',
		'it_IT' => 'Italiano',
		'nl_NL' => 'Nederlands',
		'ar'    => 'العربية',
	);

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 15 );
		add_action( 'admin_post_ahns_save_appearance', array( $this, 'handle_save' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_media' ) );
		// La couleur de marque pilote panier, commandes et administration.
		add_filter( 'ahns_accent_color', array( __CLASS__, 'accent' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Appearance - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Appearance', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Médiathèque WordPress sur cet écran (choix du logo). */
	public function enqueue_media( $hook ) {
		if ( false !== strpos( (string) $hook, self::PAGE_SLUG ) ) {
			wp_enqueue_media();
		}
	}

	/** Réglages effectifs. */
	public static function settings() {
		$saved  = (array) get_option( self::OPTION, array() );
		$labels = array();
		foreach ( self::LABELS as $key => $def ) {
			$labels[ $key ] = isset( $saved['labels'][ $key ] ) ? (string) $saved['labels'][ $key ] : '';
		}
		$layout = isset( $saved['header_layout'] ) && isset( self::LAYOUTS[ $saved['header_layout'] ] ) ? $saved['header_layout'] : 'text';
		return array(
			'accent'           => isset( $saved['accent'] ) && sanitize_hex_color( (string) $saved['accent'] ) ? (string) $saved['accent'] : '#ec4899',
			'labels'           => $labels,
			'logo_url'         => isset( $saved['logo_url'] ) ? esc_url_raw( (string) $saved['logo_url'] ) : '',
			'header_layout'    => $layout,
			'theme'            => isset( $saved['theme'] ) && isset( self::THEMES[ $saved['theme'] ] ) ? (string) $saved['theme'] : 'clair-boutique',
			'language'         => isset( $saved['language'] ) && isset( self::LANGUAGES[ $saved['language'] ] ) ? (string) $saved['language'] : '',
			'widget_language'  => isset( $saved['widget_language'] ) && isset( self::WIDGET_LANGUAGES[ $saved['widget_language'] ] ) ? (string) $saved['widget_language'] : '',
			'production_email' => isset( $saved['production_email'] ) ? (string) $saved['production_email'] : '',
		);
	}

	/**
	 * Change QUELQUES champs sans toucher aux autres.
	 *
	 * L'assistant ne règle que la couleur, le logo et l'e-mail atelier : il ne
	 * doit pas effacer au passage des libellés ou une langue déjà choisis.
	 *
	 * @param array $patch Champs à changer.
	 * @return void
	 */
	public static function merge( array $patch ) {
		update_option( self::OPTION, array_merge( self::settings(), $patch ) );
	}

	/** Couleur de marque (branchée sur le filtre `ahns_accent_color`). */
	public static function accent( $default = '#ec4899' ) {
		$accent = self::settings()['accent'];
		return $accent ? $accent : $default;
	}

	/** Libellés et en-tête transmis au widget (les vides retombent au défaut). */
	public static function for_widget() {
		$s      = self::settings();
		$labels = array_filter( $s['labels'], static fn( $v ) => '' !== $v );
		return array(
			'accent'       => $s['accent'],
			'labels'       => (object) $labels,
			'logoUrl'      => $s['logo_url'],
			'headerLayout' => '' !== $s['logo_url'] ? $s['header_layout'] : 'text',
			'theme'        => $s['theme'],
		);
	}

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$labels = array();
		foreach ( array_keys( self::LABELS ) as $key ) {
			$labels[ $key ] = isset( $_POST['labels'][ $key ] )
				? mb_substr( sanitize_text_field( wp_unslash( $_POST['labels'][ $key ] ) ), 0, 60 )
				: '';
		}
		$email = isset( $_POST['production_email'] ) ? sanitize_email( wp_unslash( $_POST['production_email'] ) ) : '';

		// LE THÈME N'EST PLUS SUR CET ÉCRAN : il appartient au configurateur.
		// On garde la valeur EN BASE telle quelle — c'est elle qui a servi à
		// fabriquer le configurateur « Par défaut » lors de la migration, et
		// l'écraser par un formulaire qui ne porte plus le champ reviendrait à
		// réécrire l'histoire d'une boutique à chaque enregistrement.
		$theme = isset( $_POST['theme'] ) ? sanitize_key( wp_unslash( $_POST['theme'] ) ) : self::settings()['theme'];

		update_option(
			self::OPTION,
			array(
				'accent'           => isset( $_POST['accent'] ) ? (string) sanitize_hex_color( wp_unslash( $_POST['accent'] ) ) : '#ec4899',
				'labels'           => $labels,
				'logo_url'         => isset( $_POST['logo_url'] ) ? esc_url_raw( wp_unslash( $_POST['logo_url'] ) ) : '',
				'header_layout'    => isset( $_POST['header_layout'] ) ? sanitize_text_field( wp_unslash( $_POST['header_layout'] ) ) : 'text',
				'theme'            => isset( self::THEMES[ $theme ] ) ? $theme : 'clair-boutique',
				'language'         => isset( $_POST['language'] ) ? sanitize_text_field( wp_unslash( $_POST['language'] ) ) : '',
				'widget_language'  => isset( $_POST['widget_language'] ) ? sanitize_text_field( wp_unslash( $_POST['widget_language'] ) ) : '',
				'production_email' => is_email( $email ) ? $email : '',
			)
		);
		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * LA GALERIE DES INTERFACES, affichée telle quelle.
	 *
	 * Deux écrans la montrent : l'Apparence (l'interface de la boutique) et les
	 * Configurateurs (celle de CE configurateur). Elle est écrite une fois —
	 * deux galeries à tenir à jour finiraient par diverger, et le marchand
	 * verrait deux listes d'interfaces qui ne se ressemblent pas.
	 *
	 * @param string $choisie L'identifiant coché.
	 * @param string $champ   Le nom du bouton radio.
	 * @return void
	 */
	public static function galerie_des_peaux( $choisie, $champ = 'theme' ) {
		echo '<fieldset class="ahns-peaux">';
		foreach ( self::THEMES as $id => $def ) {
			echo wp_kses( self::carte_de_peau( $id, $def, $choisie === $id, true, $champ ), AHNS_Admin_UI::allowed_html() );
		}
		foreach ( self::THEMES_A_VENIR as $id => $def ) {
			echo wp_kses( self::carte_de_peau( $id, $def, false, false, $champ ), AHNS_Admin_UI::allowed_html() );
		}
		echo '</fieldset>';

		// Deux choses que le CSS seul ne sait pas faire.
		//
		// 1. LA MISE À L'ÉCHELLE. Une maquette est dessinée pour un écran de
		//    bureau ; la carte fait trois cents pixels. La rétrécir par CSS
		//    demanderait de diviser une largeur par une autre, ce que « calc »
		//    ne permet pas. Deux lignes de script suffisent, et elles se
		//    rejouent au redimensionnement.
		//    Sans elles, l'aperçu montrerait la version TÉLÉPHONE de la
		//    maquette — les cartes empilées — au lieu du dessin qu'on vend.
		// 2. LA BORDURE DU CHOIX. Sans elle, on coche une interface et c'est
		//    l'ANCIENNE qui reste encadrée jusqu'à l'enregistrement : de quoi
		//    croire que le clic n'a pas pris.
		AHNS_Admin_UI::inline_js(
			'ahns-appearance-peaux',
			'(function(){'
			. 'var f=document.querySelector(".ahns-peaux");if(!f)return;'
			. 'var LARGE=1280;'
			. 'function poser(){f.querySelectorAll(".ahns-peau__vue").forEach(function(v){'
			. 'v.style.setProperty("--ahns-echelle",(v.clientWidth/LARGE).toFixed(4));});}'
			. 'poser();addEventListener("resize",poser);'
			. 'f.addEventListener("change",function(e){'
			. 'if(!e.target.classList.contains("ahns-peau__radio"))return;'
			. 'f.querySelectorAll(".ahns-peau").forEach(function(l){'
			. 'l.classList.toggle("is-active",l.contains(e.target));});});'
			. '})();'
		);
	}

	/**
	 * Une carte de la galerie des peaux.
	 *
	 * @param string $id        Identifiant de la peau.
	 * @param array  $def       [nom, description].
	 * @param bool   $choisie   Est-ce la peau active ?
	 * @param bool   $livree    Peut-elle être choisie ?
	 * @param string $champ     Le nom du bouton radio. L'écran des configurateurs
	 *                          montre la MÊME galerie sous un autre nom : deux
	 *                          galeries à tenir à jour finiraient par diverger,
	 *                          et le marchand verrait deux listes d'interfaces.
	 * @return string Balisage échappé.
	 */
	public static function carte_de_peau( $id, $def, $choisie, $livree, $champ = 'theme' ) {
		$nom      = AHNS_I18n::t( $def[0] );
		$maquette = 'assets/maquettes/' . $id . '.html';

		if ( file_exists( AHNS_PLUGIN_DIR . $maquette ) ) {
			// « loading=lazy » : onze maquettes en même temps, ce sont onze
			// pages qui s'ouvrent. Elles n'arrivent qu'en approchant.
			// « tabindex=-1 » et « pointer-events:none » (feuille) : l'aperçu
			// ne prend ni le clavier ni le clic — c'est la CARTE qu'on choisit.
			$vue = sprintf(
				'<iframe class="ahns-peau__cadre" src="%s" title="%s" loading="lazy" tabindex="-1" scrolling="no"></iframe>',
				esc_url( AHNS_PLUGIN_URL . $maquette ),
				/* translators: %s: interface (skin) name. */
				esc_attr( sprintf( __( 'Mock-up of the %s theme', 'ahime-neon-sign-configurator' ), $nom ) )
			);
		} else {
			$vue = sprintf(
				'<img class="ahns-peau__image" src="%s" alt="%s" loading="lazy" decoding="async" width="1200" height="800" />',
				esc_url( AHNS_PLUGIN_URL . 'assets/apercus/' . $id . '.jpg' ),
				esc_attr( $nom )
			);
		}

		// Une peau à venir n'a pas de bouton : rien à cocher, donc rien qui
		// laisse croire qu'on pourrait la choisir aujourd'hui.
		$commande = $livree
			? sprintf(
				'<input type="radio" name="%s" value="%s"%s class="ahns-peau__radio" />',
				esc_attr( $champ ),
				esc_attr( $id ),
				checked( $choisie, true, false )
			)
			: '<span class="ahns-peau__bientot">' . esc_html__( 'Soon', 'ahime-neon-sign-configurator' ) . '</span>';

		return sprintf(
			'<label class="ahns-peau%1$s%2$s">%3$s'
			. '<span class="ahns-peau__vue">%4$s</span>'
			. '<span class="ahns-peau__texte"><strong>%5$s</strong>'
			. '<span class="ahns-hint">%6$s</span></span>'
			. '</label>',
			$choisie ? ' is-active' : '',
			$livree ? '' : ' ahns-peau--a-venir',
			$commande,
			$vue,
			esc_html( $nom ),
			esc_html( AHNS_I18n::t( $def[1] ) )
		);
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$s = self::settings();

		AHNS_Admin_UI::open( __( 'Appearance', 'ahime-neon-sign-configurator' ), __( 'Your colour, your words, your logo - and the language of this admin.', 'ahime-neon-sign-configurator' ) );
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Appearance saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_appearance" />';
		wp_nonce_field( self::NONCE );

		// --- OÙ SE CHOISIT L'INTERFACE ------------------------------------------
		//
		// PLUS DE SÉLECTEUR ICI, ET C'EST VOULU.
		//
		// L'interface appartient désormais au CONFIGURATEUR : une boutique peut
		// en tenir plusieurs, chacun avec la sienne, et chaque produit désigne
		// celui qu'il utilise. Le sélecteur qui vivait sur cet écran ne
		// commandait donc plus rien — on le cochait, on enregistrait, et la
		// boutique ne changeait pas. Un réglage muet est pire qu'un réglage
		// absent : il fait douter de tout l'écran.
		//
		// Le laisser en le branchant sur le configurateur par défaut aurait
		// donné DEUX écrans pour un même réglage, et deux écrans pour un même
		// réglage finissent toujours par ne plus dire la même chose.
		AHNS_Admin_UI::card_open( __( 'The configurator interface', 'ahime-neon-sign-configurator' ) );
		if ( class_exists( 'AHNS_Configurateurs' ) && class_exists( 'AHNS_Admin_Configurateurs' ) ) {
			$confs = AHNS_Configurateurs::tous();
			$liste = array();
			foreach ( $confs as $conf ) {
				$nom_peau = isset( self::THEMES[ $conf['peau'] ] )
					? AHNS_I18n::t( self::THEMES[ $conf['peau'] ][0] )
					: $conf['peau'];
				/* translators: 1: configurator name, 2: interface (skin) name. */
				$liste[] = sprintf( __( '%1$s: %2$s', 'ahime-neon-sign-configurator' ), $conf['nom'], $nom_peau );
			}
			echo '<p class="ahns-hint">' . esc_html__( 'The skin your customers see is chosen PER CONFIGURATOR: each has its own, and each product names the one it uses.', 'ahime-neon-sign-configurator' ) . '</p>';
			printf( '<p>%s</p>', esc_html( implode( ' · ', $liste ) ) );
			$bouton = AHNS_Admin_UI::button(
				__( 'Choose the interfaces', 'ahime-neon-sign-configurator' ),
				admin_url( 'admin.php?page=' . AHNS_Admin_Configurateurs::PAGE_SLUG ),
				'primary'
			);
			printf( '<p>%s</p>', wp_kses( $bouton, AHNS_Admin_UI::allowed_html() ) );
		}
		AHNS_Admin_UI::card_close();

		// --- Couleur de marque -----------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Brand colour', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'It colours the configurator buttons, the cart and order buttons, and the accents of this admin.', 'ahime-neon-sign-configurator' ) . '</p>';
		printf(
			'<p><input type="color" name="accent" value="%s" style="width:56px;height:38px;vertical-align:middle;" /> <code>%s</code></p>',
			esc_attr( $s['accent'] ),
			esc_html( $s['accent'] )
		);
		AHNS_Admin_UI::card_close();

		// --- En-tête du configurateur ------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Configurator header', 'ahime-neon-sign-configurator' ) );
		printf(
			'<p class="ahns-hint">' . /* translators: %s: site name. */ esc_html__( 'At the top of the configurator your site name ("%s") is shown and takes customers back to the home page. Add your logo and choose where it sits.', 'ahime-neon-sign-configurator' ) . '</p>',
			esc_html( get_bloginfo( 'name' ) )
		);
		printf(
			'<p><img id="ahns-logo-preview" src="%1$s" alt="" style="%2$s height:44px;max-width:180px;object-fit:contain;border:1px dashed #d1d5db;border-radius:8px;padding:4px;vertical-align:middle;" />'
			. ' <input type="hidden" id="ahns-logo-url" name="logo_url" value="%1$s" />'
			. ' <button type="button" class="button" id="ahns-logo-pick">' . esc_html__( 'Choose a logo', 'ahime-neon-sign-configurator' ) . '</button>'
			. ' <button type="button" class="button-link" id="ahns-logo-clear" style="%3$s">' . esc_html__( 'Remove', 'ahime-neon-sign-configurator' ) . '</button></p>',
			esc_attr( $s['logo_url'] ),
			'' === $s['logo_url'] ? 'display:none;' : '',
			'' === $s['logo_url'] ? 'display:none;' : ''
		);
		echo '<p><label>Disposition <select name="header_layout">';
		foreach ( AHNS_I18n::t_map( self::LAYOUTS ) as $value => $label ) {
			printf( '<option value="%s"%s>%s</option>', esc_attr( $value ), selected( $s['header_layout'], $value, false ), esc_html( $label ) );
		}
		echo '</select></label></p>';
		echo '<p class="ahns-hint">' . esc_html__( 'With no logo, the site name is shown on its own.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		// --- Libellés -----------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Button wording', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'An empty field falls back to the default wording, translated into the visitor\'s language.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="form-table">';
		foreach ( AHNS_I18n::t_map( self::LABELS ) as $key => $def ) {
			printf(
				'<tr><th scope="row"><label for="lbl-%1$s">%2$s</label></th><td><input type="text" id="lbl-%1$s" name="labels[%1$s]" value="%3$s" placeholder="%4$s" class="regular-text" /></td></tr>',
				esc_attr( $key ),
				esc_html( $def[0] ),
				esc_attr( $s['labels'][ $key ] ),
				esc_attr( '' !== $def[1] ? $def[1] : get_bloginfo( 'name' ) )
			);
		}
		echo '</table>';
		AHNS_Admin_UI::card_close();

		// --- Langue et atelier ---------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Language and notifications', 'ahime-neon-sign-configurator' ) );
		echo '<table class="form-table">';
		/*
		 * LA LANGUE DU CONFIGURATEUR — celle que le CLIENT lit.
		 *
		 * Deux réglages plutôt qu'un, parce que ce sont deux publics. Un
		 * marchand francophone qui vend à des Allemands n'a pas à choisir entre
		 * travailler dans sa langue et servir ses clients dans la leur.
		 *
		 * Par défaut on suit le site : c'est ce qui convient à une boutique
		 * multilingue, où c'est la page visitée qui décide. Le forçage sert au
		 * cas inverse — un site en français qui vend à l'international.
		 */
		echo '<tr><th scope="row"><label for="ahns-widget-language">' . esc_html__( 'Configurator language', 'ahime-neon-sign-configurator' ) . '</label></th><td><select id="ahns-widget-language" name="widget_language">';
		foreach ( self::WIDGET_LANGUAGES as $code => $label ) {
			printf( '<option value="%s"%s>%s</option>', esc_attr( $code ), selected( $s['widget_language'], $code, false ), esc_html( '' === $code ? __( 'Follow the site language', 'ahime-neon-sign-configurator' ) : $label ) );
		}
		echo '</select><p class="ahns-hint" style="margin:6px 0 0;">' . esc_html__( 'What your CUSTOMERS read in the configurator. “Follow the site language” suits a multilingual shop: the page being visited decides. Force a language if your site is in one language and your customers speak another.', 'ahime-neon-sign-configurator' ) . '</p></td></tr>';
		printf(
			'<tr><th scope="row"><label for="ahns-email">' . esc_html__( 'Workshop e-mail', 'ahime-neon-sign-configurator' ) . '</label></th><td><input type="email" id="ahns-email" name="production_email" value="%s" placeholder="workshop@your-shop.com" class="regular-text" />'
			. '<p class="ahns-hint" style="margin:6px 0 0;">' . esc_html__( 'Receives the full specification with every order. Empty = nothing is sent.', 'ahime-neon-sign-configurator' ) . '</p></td></tr>',
			esc_attr( $s['production_email'] )
		);
		echo '</table>';
		AHNS_Admin_UI::card_close();

		submit_button( __( 'Save appearance', 'ahime-neon-sign-configurator' ) );
		echo '</form>';

		// Sélecteur de logo (médiathèque WordPress).
		AHNS_Admin_UI::inline_js(
			'ahns-appearance-logo',
			'		(function(){
			var pick = document.getElementById(\'ahns-logo-pick\');
			var clear = document.getElementById(\'ahns-logo-clear\');
			var url = document.getElementById(\'ahns-logo-url\');
			var preview = document.getElementById(\'ahns-logo-preview\');
			if (!pick || !url) { return; }
			function sync() {
				var has = url.value !== \'\';
				preview.src = url.value;
				preview.style.display = has ? \'\' : \'none\';
				clear.style.display = has ? \'\' : \'none\';
			}
			var frame = null;
			pick.addEventListener(\'click\', function () {
				if (!window.wp || !wp.media) { return; }
				if (!frame) {
					frame = wp.media({ title: '
			. wp_json_encode( __( 'Choose the logo', 'ahime-neon-sign-configurator' ) )
			. ', button: { text: '
			. wp_json_encode( __( 'Use this logo', 'ahime-neon-sign-configurator' ) )
			. ' }, library: { type: \'image\' }, multiple: false });
					frame.on(\'select\', function () {
						url.value = frame.state().get(\'selection\').first().toJSON().url || \'\';
						sync();
					});
				}
				frame.open();
			});
			clear.addEventListener(\'click\', function () { url.value = \'\'; sync(); });
		}());'
		);
		AHNS_Admin_UI::close();
	}
}
