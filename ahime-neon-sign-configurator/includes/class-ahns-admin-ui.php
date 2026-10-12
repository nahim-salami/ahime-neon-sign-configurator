<?php
/**
 * Système de design de l'administration — briques communes à tous les écrans
 * du plugin : bandeau d'en-tête, barre latérale persistante, cartes, boutons,
 * badges, liste de contrôle (docs/07 §4).
 *
 * Repris du projet de référence (attache-tétine) : le marchand retrouve les
 * mêmes repères. Tout est préfixé `ahns-` et chargé UNIQUEMENT sur nos écrans —
 * aucun style ne fuit dans le reste de l'administration.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Admin_UI
 */
class AHNS_Admin_UI {

	public function hooks() {
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/** Nos écrans partagent le préfixe de slug `ahns-`. */
	private static function is_our_screen( $hook ) {
		return false !== strpos( (string) $hook, 'ahns-' );
	}

	/**
	 * Feuille de style, injectée seulement sur nos écrans.
	 *
	 * @param string $hook Écran courant.
	 * @return void
	 */
	public static function enqueue( $hook ) {
		if ( ! self::is_our_screen( $hook ) ) {
			return;
		}
		wp_register_style( 'ahns-admin', false, array(), AHNS_VERSION );
		wp_enqueue_style( 'ahns-admin' );
		wp_add_inline_style( 'ahns-admin', self::css() );
	}

	/**
	 * Une feuille de style en ligne, PAR LA FILE DE WORDPRESS.
	 *
	 * Aucune balise style écrite à la main (règle de l'annuaire « Use
	 * wp_enqueue commands ») : une poignée sans fichier, puis
	 * wp_add_inline_style(). Appelée pendant l'affichage d'un écran, la
	 * feuille part avec les styles tardifs du pied de page ; appelée sur
	 * `wp_enqueue_scripts` / `admin_enqueue_scripts`, dans l'en-tête.
	 *
	 * @param string $handle Poignée (préfixée).
	 * @param string $css    Règles CSS, écrites par le plugin.
	 * @return void
	 */
	public static function inline_css( $handle, $css ) {
		if ( ! wp_style_is( $handle, 'registered' ) ) {
			wp_register_style( $handle, false, array(), AHNS_VERSION );
		}
		wp_enqueue_style( $handle );
		wp_add_inline_style( $handle, $css );
	}

	/**
	 * Un script en ligne, par la file de WordPress, en pied de page.
	 *
	 * @param string $handle Poignée (préfixée).
	 * @param string $js     Code, écrit par le plugin ; les données y entrent par wp_json_encode().
	 * @param array  $deps   Dépendances.
	 * @return void
	 */
	public static function inline_js( $handle, $js, $deps = array() ) {
		if ( ! wp_script_is( $handle, 'registered' ) ) {
			wp_register_script( $handle, false, $deps, AHNS_VERSION, true );
		}
		wp_enqueue_script( $handle );
		wp_add_inline_script( $handle, $js );
	}

	/**
	 * Les éléments et attributs que nos briques d'administration produisent,
	 * pour wp_kses() : boutons, pastilles, icônes SVG, cartes, champs de
	 * formulaire, vignettes. Une seule liste, employée à chaque sortie d'un
	 * fragment construit ailleurs (échappement tardif).
	 *
	 * @return array<string, array<string, bool>>
	 */
	public static function allowed_html() {
		static $permis = null;
		if ( null !== $permis ) {
			return $permis;
		}
		$communs = array(
			'class'         => true,
			'id'            => true,
			'style'         => true,
			'title'         => true,
			'role'          => true,
			'tabindex'      => true,
			'aria-hidden'   => true,
			'aria-label'    => true,
			'aria-current'  => true,
			'aria-expanded' => true,
			'aria-controls' => true,
			'aria-modal'    => true,
			'aria-pressed'  => true,
			'hidden'        => true,
			'lang'          => true,
			'dir'           => true,
			'data-*'        => true,
		);
		$svg     = array(
			'fill'            => true,
			'stroke'          => true,
			'stroke-width'    => true,
			'stroke-linecap'  => true,
			'stroke-linejoin' => true,
			'opacity'         => true,
			'transform'       => true,
		);
		$permis = array(
			'a'        => $communs + array( 'href' => true, 'target' => true, 'rel' => true, 'download' => true ),
			'span'     => $communs,
			'strong'   => $communs,
			'em'       => $communs,
			'b'        => $communs,
			'i'        => $communs,
			'small'    => $communs,
			'code'     => $communs,
			'br'       => array(),
			'p'        => $communs,
			'div'      => $communs,
			'ul'       => $communs,
			'ol'       => $communs,
			'li'       => $communs,
			'h2'       => $communs,
			'h3'       => $communs,
			'h4'       => $communs,
			'img'      => $communs + array( 'src' => true, 'alt' => true, 'width' => true, 'height' => true, 'loading' => true, 'decoding' => true ),
			'iframe'   => $communs + array( 'src' => true, 'loading' => true, 'scrolling' => true, 'width' => true, 'height' => true ),
			'label'    => $communs + array( 'for' => true ),
			'input'    => $communs + array( 'type' => true, 'name' => true, 'value' => true, 'checked' => true, 'disabled' => true, 'min' => true, 'max' => true, 'step' => true, 'placeholder' => true, 'size' => true, 'readonly' => true, 'required' => true, 'maxlength' => true, 'pattern' => true, 'inputmode' => true, 'autocomplete' => true ),
			'select'   => $communs + array( 'name' => true, 'disabled' => true, 'multiple' => true ),
			'option'   => array( 'value' => true, 'selected' => true, 'disabled' => true ),
			'textarea' => $communs + array( 'name' => true, 'rows' => true, 'cols' => true, 'placeholder' => true ),
			'button'   => $communs + array( 'type' => true, 'name' => true, 'value' => true, 'disabled' => true ),
			'table'    => $communs,
			'thead'    => $communs,
			'tbody'    => $communs,
			'tr'       => $communs,
			'th'       => $communs + array( 'scope' => true, 'colspan' => true ),
			'td'       => $communs + array( 'colspan' => true ),
			'details'  => $communs + array( 'open' => true ),
			'summary'  => $communs,
			'svg'      => $communs + $svg + array( 'viewbox' => true, 'xmlns' => true, 'width' => true, 'height' => true, 'focusable' => true ),
			'g'        => $svg,
			'path'     => $svg + array( 'd' => true ),
			'circle'   => $svg + array( 'cx' => true, 'cy' => true, 'r' => true ),
			'rect'     => $svg + array( 'x' => true, 'y' => true, 'width' => true, 'height' => true, 'rx' => true, 'ry' => true ),
			'line'     => $svg + array( 'x1' => true, 'y1' => true, 'x2' => true, 'y2' => true ),
			'polyline' => $svg + array( 'points' => true ),
			'polygon'  => $svg + array( 'points' => true ),
		);
		return $permis;
	}

	/** Couleur de marque du marchand (une seule variable pilote les accents). */
	private static function accent() {
		return class_exists( 'AHNS_Cart' ) ? AHNS_Cart::accent_color() : '#ec4899';
	}

	/** L'administration du plugin doit-elle s'écrire de droite à gauche ? */
	public static function is_rtl() {
		return function_exists( 'is_rtl' ) && is_rtl();
	}

	/**
	 * Nos écrans du SITE se rangent-ils sous le menu du pack ?
	 *
	 * DEUX DE NOS ÉCRANS NE PARLENT PAS DE LA BOUTIQUE, MAIS DU SITE : les
	 * en-têtes et pieds de page, et les annonces. Le marchand qui veut changer
	 * son bandeau ne pense pas « configurateur » — il pense « mon site », et
	 * son site c'est le pack. Les trouver sous « Neon Light », entre les
	 * matières et les tarifs, c'est les chercher là où ils ne sont pas.
	 *
	 * Ils DÉMÉNAGENT donc sous le menu du pack quand un pack est actif. Le
	 * code, lui, ne bouge pas d'un pouce : c'est le plugin qui les porte, et
	 * c'est délibéré — ces deux écrans passent par les crochets standards de
	 * WordPress (`wp_body_open`, `wp_template_part`) et doivent continuer de
	 * marcher sous n'importe quel thème de blocs. Seule l'ENTRÉE DE MENU
	 * change de parent.
	 *
	 * SANS PACK, RIEN NE CHANGE : la constante n'existe pas — elle est posée
	 * par `inc/admin.php` du socle, donc uniquement quand le socle ou l'un de
	 * ses packs est le thème actif — et les deux écrans restent chez nous.
	 * Un menu déclaré sous un parent absent ne s'afficherait nulle part.
	 *
	 * @return bool
	 */
	public static function site_sous_le_pack() {
		return defined( 'NEON_LIGHT_MENU' );
	}

	/**
	 * Le menu qui accueille les écrans du site.
	 *
	 * @return string Slug du menu parent.
	 */
	public static function parent_du_site() {
		return self::site_sous_le_pack() ? NEON_LIGHT_MENU : AHNS_Dashboard::PAGE_SLUG;
	}

	// -----------------------------------------------------------------------
	// Structure d'un écran
	// -----------------------------------------------------------------------

	/**
	 * Ouvre un écran : bandeau + barre latérale + zone de contenu.
	 * À refermer par `close()`.
	 *
	 * @param string $title    Titre.
	 * @param string $subtitle Sous-titre.
	 * @param string $actions  Boutons du bandeau (HTML déjà échappé).
	 * @return void
	 */
	public static function open( $title, $subtitle = '', $actions = '' ) {
		printf( '<div class="wrap ahns-page%s">', self::is_rtl() ? ' ahns-rtl' : '' );
		/*
		 * L'ANCRE DES BANDEAUX — et ce n'est pas une question de goût.
		 *
		 * WordPress imprime ses bandeaux (`admin_notices`) tout en haut du
		 * corps de page, puis son script les DÉPLACE juste après le premier
		 * `h1` ou `h2` trouvé dans `.wrap`. Tant que ce premier titre était
		 * celui du bandeau sombre, tous les bandeaux atterrissaient DEDANS —
		 * et y héritaient de son `color:#fff`. Résultat lisible sur n'importe
		 * quelle capture : du texte blanc sur un fond jaune pâle ou bleu pâle,
		 * c'est-à-dire un avertissement invisible. Le plus ironique était que
		 * celui qui annonçait l'abonnement fermé faisait partie du lot.
		 *
		 * On pose donc une ancre AVANT le bandeau : un `h1` réel, qui porte le
		 * titre pour les lecteurs d'écran, et que l'œil ne voit pas. Les
		 * bandeaux se rangent après elle, en pleine largeur, sur le fond clair
		 * de l'administration. Le titre visible, lui, devient un paragraphe
		 * mis en scène et masqué à l'oralisation : un seul `h1` dans la page,
		 * annoncé une seule fois.
		 */
		printf( '<h1 class="ahns-ancre">%s</h1>', esc_html( $title ) );
		self::hero( $title, $subtitle, $actions );
		echo '<div class="ahns-shell">';
		self::nav();
		echo '<div class="ahns-shell__content">';
	}

	/** Referme l'écran ouvert par `open()`. */
	public static function close() {
		echo '</div></div></div>';
	}

	/**
	 * Bandeau d'en-tête.
	 *
	 * @param string $title    Titre.
	 * @param string $subtitle Sous-titre.
	 * @param string $actions  Boutons (HTML déjà échappé).
	 * @return void
	 */
	public static function hero( $title, $subtitle = '', $actions = '' ) {
		echo '<div class="ahns-hero">';
		echo '<div class="ahns-hero__text">';
		// Le titre VU. Le titre LU est l'ancre posée par `open()`, juste avant.
		echo '<p class="ahns-hero__titre" aria-hidden="true">' . esc_html( $title ) . '</p>';
		if ( '' !== $subtitle ) {
			echo '<p>' . esc_html( $subtitle ) . '</p>';
		}
		echo '</div>';
		if ( '' !== $actions ) {
			echo '<div class="ahns-hero__actions">' . wp_kses( $actions, self::allowed_html() ) . '</div>';
		}
		echo '</div>';
	}

	/**
	 * Entrées de la barre latérale : slug => [icône, libellé, capacité].
	 * Les écrans à venir (docs/07) s'ajouteront ici au fil des lots.
	 *
	 * LA CAPACITÉ EST LA TROISIÈME VALEUR, ET ELLE N'EST PAS DÉCORATIVE.
	 * Presque tous nos écrans demandent `manage_woocommerce` — d'où le défaut —
	 * mais deux sortent du lot : « En-têtes & pieds » est de l'édition de thème
	 * (`edit_theme_options`) et « Thèmes » installe des fichiers
	 * (`install_themes`). Un gestionnaire de boutique n'a ni l'une ni l'autre.
	 * Sans ce filtre, la barre lui proposerait deux entrées qui répondent
	 * « Désolé, vous n'avez pas l'autorisation » : un menu qui ment.
	 *
	 * @return array<string,array{0:string,1:string,2:string}>
	 */
	private static function nav_items() {
		$items = array();
		if ( class_exists( 'AHNS_Dashboard' ) ) {
			$items[ AHNS_Dashboard::PAGE_SLUG ] = array( 'dashboard', __( 'Dashboard', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Configurator' ) ) {
			$items[ AHNS_Admin_Configurateurs::PAGE_SLUG ] = array( 'bolt', __( 'Configurators', 'ahime-neon-sign-configurator' ) );
		}
		// « Métiers », ET NON « CONFIGURATEURS ».
		// Cet écran-ci décide de ce que l'atelier FABRIQUE — du néon, des
		// panneaux, des caissons — et de la page où chaque offre est posée.
		// L'écran « Configurateurs », lui, décide de l'INTERFACE, des options et
		// du produit facturé. Les deux s'appelaient « Configurateurs », et le
		// menu montrait la même entrée deux fois de suite, impossible à
		// départager. Deux libellés identiques ne désignent jamais deux choses.
		if ( class_exists( 'AHNS_Profiles' ) ) {
			$items[ AHNS_Profiles::PAGE_SLUG ] = array( 'dashboard', __( 'Trades', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Fonts' ) ) {
			$items[ AHNS_Fonts::PAGE_SLUG ] = array( 'type', __( 'Fonts', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Catalog' ) ) {
			$items[ AHNS_Catalog::COLORS_SLUG ]   = array( 'palette', __( 'Colours', 'ahime-neon-sign-configurator' ) );
			$items[ AHNS_Catalog::SUPPORTS_SLUG ] = array( 'box', __( 'Backings', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Materials' ) ) {
			$items[ AHNS_Materials::PAGE_SLUG ] = array( 'box', __( 'Materials', 'ahime-neon-sign-configurator' ) );
		}
		// LES FONDS SONT UN CATALOGUE, ils se rangent avec les autres. Le menu
		// de WordPress les montrait, celui du plugin non : un écran qu'on ne
		// peut atteindre que par la barre latérale est un écran à moitié posé.
		if ( class_exists( 'AHNS_Fonds' ) ) {
			$items[ AHNS_Fonds::PAGE_SLUG ] = array( 'palette', __( 'Scenes', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Settings' ) ) {
			$items[ AHNS_Settings::PAGE_SLUG ] = array( 'tag', __( 'Pricing', 'ahime-neon-sign-configurator' ) );
		}
		if ( class_exists( 'AHNS_Appearance' ) ) {
			$items[ AHNS_Appearance::PAGE_SLUG ] = array( 'gear', __( 'Appearance', 'ahime-neon-sign-configurator' ) );
		}
		// LES DEUX ÉCRANS DU SITE NE FIGURENT ICI QUE S'ILS SONT ENCORE CHEZ
		// NOUS. Sous un pack, leur entrée de menu est passée sous « Pack … » ;
		// les laisser dans cette barre-ci les montrerait à deux endroits, dont
		// un où elles ne sont plus — et c'est très exactement le reproche qui
		// a lancé cette correction : une barre latérale qui ne dit pas la même
		// chose que le menu de WordPress ne se lit plus, elle se devine.
		if ( ! self::site_sous_le_pack() ) {
			if ( class_exists( 'AHNS_Annonces' ) ) {
				$items[ AHNS_Annonces::PAGE_SLUG ] = array( 'bolt', __( 'Announcements', 'ahime-neon-sign-configurator' ) );
			}
		}
		// LES THÈMES MANQUAIENT ICI, ET SEULEMENT ICI. L'écran est bien déclaré
		// (class-ahns-themes.php), le menu de WordPress le montrait — mais la
		// barre latérale de nos propres pages ne le listait pas. Le marchand qui
		// entre par le tableau de bord et navigue de carte en carte ne pouvait
		// donc plus retrouver le catalogue des thèmes : un écran qu'on n'atteint
		// que par le menu gris de WordPress est un écran à moitié posé, exactement
		// comme les fonds de scène l'ont été avant lui.
		// Il se range avec ce qui touche à l'allure du site, juste avant la
		// plateforme — d'où il tient son catalogue.
		if ( class_exists( 'AHNS_Help' ) ) {
			$items[ AHNS_Help::PAGE_SLUG ] = array( 'help', __( 'Help', 'ahime-neon-sign-configurator' ) );
		}
		return $items;
	}

	/**
	 * Barre latérale persistante, entrée courante mise en évidence.
	 *
	 * UNE BARRE QUI NE SAIT PAS OÙ ELLE EST NE S'AFFICHE PAS. Les deux écrans
	 * du site sont passés sous le menu du pack ; ils gardent notre dessin —
	 * ils restent nos écrans — mais dresser à côté d'eux la liste des écrans
	 * du plugin, sans qu'aucun ne soit allumé, poserait la question à laquelle
	 * une barre est censée répondre : « où suis-je ? ». Le marchand est sous
	 * « Pack Maison », le menu de WordPress le lui dit, et la page s'étend
	 * alors sur toute la largeur.
	 *
	 * La règle est générale, et non une exception écrite pour ces deux-là :
	 * une entrée hors de la barre — parce qu'elle a déménagé, ou parce que
	 * l'utilisateur n'a pas la capacité qu'elle demande — n'affiche pas la
	 * barre. Elle vaudra pour le prochain écran qui sortira du menu.
	 */
	public static function nav() {
		$current = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.

		$visibles = array();
		foreach ( self::nav_items() as $slug => $item ) {
			$cap = isset( $item[2] ) ? $item[2] : 'manage_woocommerce';
			if ( current_user_can( $cap ) ) {
				$visibles[ $slug ] = $item;
			}
		}

		if ( '' !== $current && ! isset( $visibles[ $current ] ) ) {
			return;
		}

		echo '<nav class="ahns-nav" aria-label="' . esc_attr__( 'Ahime Neon navigation', 'ahime-neon-sign-configurator' ) . '">';
		foreach ( $visibles as $slug => $item ) {
			$class = 'ahns-nav__item' . ( $current === $slug ? ' is-active' : '' );
			printf(
				'<a class="%s" href="%s"%s>%s<span>%s</span></a>',
				esc_attr( $class ),
				esc_url( admin_url( 'admin.php?page=' . $slug ) ),
				$current === $slug ? ' aria-current="page"' : '',
				wp_kses( self::icon( $item[0] ), self::allowed_html() ),
				esc_html( $item[1] )
			);
		}
		echo '</nav>';
	}

	// -----------------------------------------------------------------------
	// Briques
	// -----------------------------------------------------------------------

	/**
	 * Ouvre une carte. À refermer par `card_close()`.
	 *
	 * @param string $title Titre facultatif.
	 * @param string $style Styles en ligne facultatifs.
	 * @return void
	 */
	public static function card_open( $title = '', $style = '' ) {
		printf( '<div class="ahns-card"%s>', '' !== $style ? ' style="' . esc_attr( $style ) . '"' : '' );
		if ( '' !== $title ) {
			echo '<h2>' . esc_html( $title ) . '</h2>';
		}
	}

	/** Referme une carte. */
	public static function card_close() {
		echo '</div>';
	}

	/**
	 * Bouton pilule.
	 *
	 * @param string $label   Libellé.
	 * @param string $url     Destination.
	 * @param string $variant primary | ghost | on-accent.
	 * @param array  $attrs   Attributs supplémentaires (target…).
	 * @return string
	 */
	public static function button( $label, $url, $variant = 'primary', $attrs = array() ) {
		$extra = '';
		foreach ( $attrs as $key => $value ) {
			$extra .= sprintf( ' %s="%s"', esc_attr( $key ), esc_attr( $value ) );
		}
		// Une CHAÎNE rendue, jamais affichée ici : l'appelant la sort par wp_kses( …, allowed_html() ).
		return '<a class="ahns-btn ahns-btn--' . esc_attr( $variant ) . '" href="' . esc_url( $url ) . '"' . $extra . '>' . esc_html( $label ) . '</a>';
	}

	/**
	 * Pastille d'état.
	 *
	 * @param string $label Libellé.
	 * @param string $kind  ok | todo | locked.
	 * @return string
	 */
	public static function badge( $label, $kind = 'ok' ) {
		return sprintf( '<span class="ahns-badge ahns-badge--%s">%s</span>', esc_attr( $kind ), esc_html( $label ) );
	}

	/**
	 * Icône SVG au trait (24×24, hérite de `currentColor`).
	 *
	 * @param string $name Nom de l'icône.
	 * @return string
	 */
	public static function icon( $name ) {
		$paths = array(
			'cart'      => '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L21 8H6.6"/>',
			'type'      => '<path d="M5 7V5h14v2M12 5v14M9.5 19h5"/>',
			'tag'       => '<path d="M3.5 11.4V4.5A1 1 0 0 1 4.5 3.5h6.9a1 1 0 0 1 .7.3l8.1 8.1a1 1 0 0 1 0 1.4l-6.9 6.9a1 1 0 0 1-1.4 0L3.8 12.1a1 1 0 0 1-.3-.7Z"/><circle cx="8" cy="8" r="1.3"/>',
			'gear'      => '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z"/>',
			'palette'   => '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-3.9-4-7-9-7Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.8" r="1.2"/>',
			'box'       => '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z"/><path d="M3.5 7.5 12 11.6l8.5-4.1M12 11.6v8.9"/>',
			'cloud'     => '<path d="M7 18.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1.3A3.8 3.8 0 0 1 17.5 18.5Z"/><path d="M12 10.5v5M9.8 13.3 12 15.5l2.2-2.2"/>',
			'help'      => '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.6"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
			'bolt'      => '<path d="M13.5 3 5.8 13.2h5.1L10.5 21l7.7-10.2h-5.1L13.5 3Z"/>',
			'check'     => '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
			'dashboard' => '<rect x="3.5" y="3.5" width="7" height="8" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/>',
			// Une fenêtre de navigateur, et non une palette : « Couleurs » et
			// « Fonds de scène » portent déjà la palette, et trois entrées de la
			// même barre avec le même dessin ne se distinguent plus au coup d'œil.
			// Un thème, c'est une page entière — barre du haut comprise.
			'theme'     => '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18M6.6 6.8h.01M9.4 6.8h.01"/>',
		);
		$path = isset( $paths[ $name ] ) ? $paths[ $name ] : $paths['gear'];
		return '<svg class="ahns-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $path . '</svg>';
	}

	// -----------------------------------------------------------------------
	// Styles
	// -----------------------------------------------------------------------

	private static function css() {
		$accent = self::accent();
		return "
:root{--ahns-accent:{$accent};}
.ahns-page{margin-right:20px;}
.ahns-page .ahns-icon{width:20px;height:20px;flex:none;}

/* Bandeau */
.ahns-hero{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:16px 0 18px;padding:22px 24px;border-radius:16px;
	background:linear-gradient(120deg,#14161c 0%,#1e2230 55%,var(--ahns-accent) 260%);color:#fff;box-shadow:0 10px 30px rgba(20,22,28,.18);}
.ahns-hero__text{flex:1;min-width:240px;}
.ahns-hero h1,.ahns-hero p.ahns-hero__titre{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#fff;padding:0;line-height:1.3;}

/* Le titre visible est un `p` : il doit passer devant `.ahns-hero p`, sinon il
   hérite du sous-titre - plus petit, à demi transparent. */

/* L'ancre des bandeaux : lue, jamais vue. Voir la note de `open()`. */
.ahns-ancre{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;}
/* Les bandeaux se rangent après elle, en pleine largeur, sur fond clair. */
.ahns-page>.notice,.ahns-page>div.updated,.ahns-page>div.error{margin:16px 0 0;}
/* FILET DE SÉCURITÉ. Si un bandeau finit malgré tout dans le fond sombre —
   script absent, greffon qui le replace ailleurs - il doit rester lisible :
   on ne compte pas sur le placement pour garantir un contraste. */
.ahns-hero .notice,.ahns-hero div.updated,.ahns-hero div.error{color:#1d2327;}
.ahns-hero .notice p,.ahns-hero .notice strong,.ahns-hero .notice li,.ahns-hero .notice h2{color:#1d2327;}
.ahns-hero .notice a{color:#2271b1;}
.ahns-hero p{margin:5px 0 0;font-size:13.5px;color:rgba(255,255,255,.78);max-width:70ch;}
.ahns-hero__actions{display:flex;gap:8px;flex-wrap:wrap;}

/* Coque : barre latérale + contenu */
.ahns-shell{display:flex;gap:18px;align-items:flex-start;}
.ahns-nav{flex:0 0 208px;display:flex;flex-direction:column;gap:2px;padding:8px;background:#fff;border:1px solid #e2e4e9;border-radius:14px;position:sticky;top:46px;}
.ahns-nav__item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;text-decoration:none;color:#3c434a;font-weight:600;font-size:13.5px;}
.ahns-nav__item:hover{background:#f4f5f7;color:#111;}
.ahns-nav__item.is-active{background:var(--ahns-accent);color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.12);}
.ahns-nav__item.is-active:hover{color:#fff;}
.ahns-shell__content{flex:1;min-width:0;}

/* Cartes */
.ahns-card{background:#fff;border:1px solid #e2e4e9;border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 2px rgba(20,22,28,.04);}
.ahns-card h2{margin:0 0 12px;font-size:15px;font-weight:700;}
.ahns-card p.ahns-hint{color:#6b7280;font-size:12.5px;margin:-6px 0 12px;}
.ahns-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:16px;}
.ahns-card--link{display:block;text-decoration:none;color:inherit;transition:transform .12s,box-shadow .12s;}
.ahns-card--link:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(20,22,28,.10);color:inherit;}
.ahns-card__icon{width:38px;height:38px;border-radius:11px;background:#f4f5f7;color:var(--ahns-accent);display:flex;align-items:center;justify-content:center;margin-bottom:10px;}

/* Galerie des peaux du configurateur (ecran Apparence).
   Chaque vignette est une VRAIE capture du configurateur : le marchand voit
   ce qu'il installe avant de l'installer. La carte entiere est cliquable -
   viser un rond de 16 px quand une image de 300 px dit la meme chose serait
   une cible inutilement petite. */
.ahns-peaux{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:14px;margin:4px 0 14px;}
.ahns-peau{position:relative;display:block;border:2px solid #e2e4e9;border-radius:14px;padding:0;overflow:hidden;background:#fff;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s;}
.ahns-peau:hover{border-color:#c3c7cf;transform:translateY(-2px);box-shadow:0 8px 22px rgba(20,22,28,.10);}
.ahns-peau.is-active{border-color:var(--ahns-accent);box-shadow:0 8px 24px rgba(20,22,28,.14);}
/* Le rond reste la : il porte le nom accessible et l'etat pour le clavier et
   les lecteurs d'ecran. Le masquer par « display:none » le retirerait de
   l'ordre de tabulation - on le pose donc dans un coin, visible et net. */
.ahns-peau__radio{position:absolute;top:10px;left:10px;z-index:2;margin:0;
  box-shadow:0 0 0 3px rgba(255,255,255,.9);border-radius:50%;}
/* La fenetre de l'apercu : le rapport du dessin de bureau, quoi qu'il arrive. */
.ahns-peau__vue{position:relative;display:block;overflow:hidden;aspect-ratio:1280/860;background:#0f1116;line-height:0;}
/* La maquette est dessinee pour un ecran de bureau et rendue a sa VRAIE
   taille, puis reduite : c'est la seule facon de montrer le dessin qu'on vend.
   Rendue directement a 300 px, elle basculerait dans sa propre version
   telephone - des cartes empilees, qui ne ressemblent a rien de ce que le
   marchand installe. L'echelle est posee par le script de l'ecran ; le quart
   ecrit ici n'est qu'un filet de securite si ce script ne tourne pas. */
.ahns-peau__cadre{position:absolute;top:0;left:0;width:1280px;height:860px;border:0;
  transform:scale(var(--ahns-echelle,.25));transform-origin:0 0;pointer-events:none;}
.ahns-peau__image{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;}
.ahns-peau__texte{display:block;padding:11px 13px 13px;}
.ahns-peau__texte strong{display:block;font-size:13.5px;margin-bottom:3px;}
.ahns-peau__texte .ahns-hint{display:block;margin:0;font-size:12px;line-height:1.5;}
.ahns-peau.is-active .ahns-peau__texte strong{color:var(--ahns-accent);}
/* LES PEAUX DESSINEES QUI N'ONT PAS ENCORE ETE INTEGREES. On les montre —
   cacher la moitie de la gamme priverait le marchand de ce qui l'aide le plus
   a choisir : voir ou va le produit. Mais rien ne doit laisser croire qu'on
   peut les prendre aujourd'hui : pas de bouton, pas de survol qui souleve, un
   voile leger sur l'apercu et la mention en toutes lettres. */
.ahns-peau--a-venir{cursor:default;border-style:dashed;}
.ahns-peau--a-venir:hover{transform:none;box-shadow:none;border-color:#e2e4e9;}
.ahns-peau--a-venir .ahns-peau__vue{opacity:.62;filter:saturate(.85);}
.ahns-peau--a-venir .ahns-peau__texte strong{color:#6b7280;}
.ahns-peau__bientot{position:absolute;top:9px;left:9px;z-index:2;
  padding:3px 9px;border-radius:999px;background:rgba(20,22,28,.82);color:#fff;
  font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
  box-shadow:0 2px 8px rgba(0,0,0,.25);}

/* Boutons */
.ahns-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;border:1.5px solid transparent;line-height:1.2;}
.ahns-btn--primary{background:var(--ahns-accent);color:#fff;border-color:var(--ahns-accent);}
.ahns-btn--primary:hover{filter:brightness(.94);color:#fff;}
.ahns-btn--ghost{background:transparent;color:#3c434a;border-color:#d3d6dc;}
.ahns-btn--ghost:hover{border-color:#9ba1a9;color:#111;}
.ahns-btn--on-accent{background:#fff;color:#14161c;border-color:#fff;}
.ahns-btn--on-accent:hover{color:#14161c;filter:brightness(.94);}
/* Sur le bandeau sombre, un bouton fantome doit s'ecrire en clair : le gris
   de l'administration y devient illisible. */
.ahns-hero .ahns-btn--ghost{color:#fff;border-color:rgba(255,255,255,.5);}
.ahns-hero .ahns-btn--ghost:hover{color:#fff;border-color:#fff;background:rgba(255,255,255,.14);}

/* Badges et liste de contrôle */
.ahns-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:700;}
.ahns-badge--ok{background:#e4f4eb;color:#0b6b45;}
.ahns-badge--todo{background:#fdf3d7;color:#8a6100;}
.ahns-badge--locked{background:#fde8e8;color:#a12525;}
.ahns-checklist{list-style:none;margin:0;padding:0;}
.ahns-checklist li{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #f0f1f3;}
.ahns-checklist li:last-child{border-bottom:0;}
.ahns-check-ico{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none;}
.ahns-check-ico--done{background:#e4f4eb;color:#0b6b45;}
.ahns-check-ico--todo{background:#f1f2f4;color:#6b7280;}
.ahns-check-body{flex:1;display:flex;flex-direction:column;}
.ahns-check-body strong{font-size:13.5px;}
.ahns-check-body span{font-size:12.5px;color:#6b7280;}

/* Droite à gauche */
.ahns-rtl{direction:rtl;}
.ahns-rtl .ahns-page,.ahns-rtl .ahns-hero,.ahns-rtl .ahns-nav__item{text-align:right;}

@media (max-width:960px){
	.ahns-shell{flex-direction:column;}
	.ahns-nav{position:static;flex-direction:row;flex-wrap:wrap;width:100%;flex-basis:auto;}
}
";
	}
}
