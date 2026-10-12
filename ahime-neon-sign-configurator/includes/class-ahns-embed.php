<?php
/**
 * Intégration du widget : shortcode [ahns_configurator] + enqueue du bundle
 * unique + injection du contexte hôte (window.__AHNS_CONTEXT__).
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Embed
 */
class AHNS_Embed {

	const HANDLE = 'ahns-widget';

	/** Ce que render() produit : l'élément du configurateur et ses attributs, rien d'autre (échappement tardif). */
	const BALISES = array(
		'ahns-config' => array(
			'data-peau' => true,
			'data-vue'  => true,
			'style'     => true,
		),
	);

	/**
	 * @var AHNS_Pricing
	 */
	private $pricing;

	public function __construct( AHNS_Pricing $pricing ) {
		$this->pricing = $pricing;
	}

	public function hooks() {
		add_shortcode( 'ahns_configurator', array( $this, 'render_shortcode' ) );
	}

	/**
	 * Locale du widget — celle que le CLIENT verra.
	 *
	 * ─────────────────────────────────────────────────────────────────────────
	 * DEUX LANGUES DIFFÉRENTES, ET C'EST VOULU
	 *
	 * `Apparence → Langue` règle l'ADMINISTRATION : ce que le marchand lit. Le
	 * configurateur, lui, parle au client, et il suit la langue du SITE — un
	 * marchand francophone qui vend à des Allemands n'a pas à choisir entre
	 * travailler en allemand et servir ses clients en français.
	 *
	 * Un marchand qui veut forcer la langue du configurateur le peut désormais
	 * dans le même écran, avec un réglage à part. Vide, on suit le site : c'est
	 * le comportement qui convient à un site multilingue, où la page décide.
	 *
	 * ─────────────────────────────────────────────────────────────────────────
	 * LE DÉFAUT CORRIGÉ LE 4 SEPTEMBRE 2026
	 *
	 * Cette table n'avait que DIX entrées quand le dictionnaire du widget en
	 * parle QUATORZE. Il manquait `de`, `it`, `nl` et `ja` : un site WordPress
	 * en allemand, en italien, en néerlandais ou en japonais recevait un
	 * configurateur en FRANÇAIS, alors que les 270 entrées du dictionnaire sont
	 * traduites dans ces langues.
	 *
	 * Rien ne le signalait — `t()` retombe sur la clé française sans erreur.
	 *
	 * @return string
	 */
	private static function widget_locale() {
		// Un forçage marchand l'emporte sur la langue du site : c'est tout
		// l'objet du réglage.
		if ( class_exists( 'AHNS_Appearance' ) ) {
			$force = AHNS_Appearance::settings()['widget_language'];
			if ( '' !== $force ) {
				return 'fr_FR' === $force ? '' : $force;
			}
		}
		$lang = strtolower( substr( (string) get_locale(), 0, 2 ) );
		$map  = array(
			'en' => 'en_US',
			'es' => 'es_ES',
			'pt' => 'pt_BR',
			'id' => 'id_ID',
			'ru' => 'ru_RU',
			'zh' => 'zh_CN',
			'hi' => 'hi_IN',
			'ar' => 'ar',
			'bn' => 'bn_BD',
			'ur' => 'ur',
			// Les quatre oubliées. Le dictionnaire les connaît depuis toujours ;
			// c'est cette table qui ne les lui transmettait pas.
			'de' => 'de_DE',
			'it' => 'it_IT',
			'nl' => 'nl_NL',
			'ja' => 'ja',
		);
		return isset( $map[ $lang ] ) ? $map[ $lang ] : '';
	}

	/**
	 * Rendu du shortcode [ahns_configurator product="123" height="80vh"].
	 *
	 * @param array|string $atts Attributs.
	 * @return string
	 */
	public function render_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'product' => 0,
				'height'  => '85vh',
				// Quel configurateur : le néon, les panneaux, un autre. Absent,
				// c'est celui de la page — et à défaut le premier.
				'profile' => '',
			),
			is_array( $atts ) ? $atts : array(),
			'ahns_configurator'
		);
		if ( '' !== $atts['profile'] ) {
			self::$profile_slug = sanitize_key( (string) $atts['profile'] );
		}

		return $this->render( self::resolve_product_id( absint( $atts['product'] ) ), (string) $atts['height'] );
	}

	/**
	 * Produit à facturer. La fiche produit en mode « redirection » renvoie vers
	 * la page dédiée avec `?ahns_product=<id>` : cette page doit alors facturer
	 * CE produit, pas celui figé dans son shortcode.
	 *
	 * Le paramètre d'URL n'est accepté que s'il désigne un produit publié et
	 * explicitement marqué personnalisable — sinon on ignore (un visiteur ne
	 * doit pas pouvoir se faire facturer un produit arbitraire).
	 *
	 * @param int $fallback Produit du shortcode.
	 * @return int
	 */
	/**
	 * Ligne de panier en cours d'édition (`?ahns_edit=<clé>`), si elle existe
	 * vraiment dans le panier de CE visiteur — la clé est une donnée de session,
	 * elle ne désigne rien chez quelqu'un d'autre.
	 *
	 * @return array{key:string,config:array,product_id:int}|null
	 */
	/** Notre bundle est un module ES ; les autres scripts ne changent pas. */
	public static function as_module( $tag, $handle ) {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		// Idempotent : WordPress peut filtrer plusieurs fois.
		if ( false !== strpos( $tag, " type='module'" ) || false !== strpos( $tag, ' type="module"' ) ) {
			return $tag;
		}
		// Seule la balise du fichier (celle qui porte src) devient un module ; le
		// contexte en ligne qui la précède reste un script classique, exécuté avant.
		return preg_replace( '/\ssrc=/', ' type="module" src=', $tag, 1 );
	}

	private static function edit_context() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture seule dans la session du visiteur.
		$key = isset( $_GET['ahns_edit'] ) ? sanitize_text_field( wp_unslash( $_GET['ahns_edit'] ) ) : '';
		if ( '' === $key || ! function_exists( 'WC' ) || ! WC()->cart ) {
			return null;
		}
		$item = WC()->cart->get_cart_item( $key );
		if ( ! $item || empty( $item[ AHNS_Cart::CART_KEY ]['config'] ) ) {
			return null;
		}
		return array(
			'key'        => $key,
			'config'     => (array) $item[ AHNS_Cart::CART_KEY ]['config'],
			'product_id' => isset( $item['product_id'] ) ? (int) $item['product_id'] : 0,
		);
	}

	private static function resolve_product_id( $fallback ) {
		// Aucun produit dans le shortcode → celui réglé dans l'écran Configurateur.
		if ( $fallback <= 0 && class_exists( 'AHNS_Configurator' ) ) {
			$fallback = AHNS_Configurator::default_product_id();
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- simple sélection de produit, aucune écriture.
		$requested = isset( $_GET['ahns_product'] ) ? absint( wp_unslash( $_GET['ahns_product'] ) ) : 0;
		if ( $requested <= 0 || ! class_exists( 'AHNS_Product' ) ) {
			return $fallback;
		}
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $requested ) : null;
		if ( ! $product || 'publish' !== get_post_status( $requested ) || ! AHNS_Product::is_enabled( $requested ) ) {
			return $fallback;
		}
		return $requested;
	}

	/**
	 * MOTEUR DE RENDU PARTAGÉ — utilisé par le shortcode, la page dédiée ET la
	 * fiche produit, pour que toutes les surfaces se comportent EXACTEMENT de
	 * la même façon (même bundle, même contexte, même panier).
	 *
	 * @param int    $product_id Produit hôte facturé (0 = mode démonstration).
	 * @param string $height     Hauteur CSS du montage.
	 * @return string Markup du web component.
	 */
	/** Familles proposées, sous la forme attendue par le widget. */
	private static function families_for_widget() {
		$p = self::profile();
		$actives = $p ? (array) $p['families'] : array( 'neon' );
		$out = array();
		foreach ( array( 'neon', 'panel', 'boxSign' ) as $f ) {
			$out[ $f ] = in_array( $f, $actives, true );
		}
		return $out;
	}

	/** Configurateur demandé par le raccourci ('' = celui de la page). */
	private static $profile_slug = '';

	/** Le configurateur effectif de la requête courante. */
	public static function profile() {
		if ( ! class_exists( 'AHNS_Profiles' ) ) {
			return null;
		}
		return AHNS_Profiles::get( self::$profile_slug ? self::$profile_slug : AHNS_Profiles::current_slug() );
	}

	/** Mode devis : le configurateur sert a composer, pas a acheter. */
	private static $quote_mode = false;

	public static function set_quote_mode( $on ) {
		self::$quote_mode = (bool) $on;
	}

	public static function is_quote_mode() {
		return self::$quote_mode;
	}

	/**
	 * Pose le configurateur, en annoncant SA PEAU au thème.
	 *
	 * `data-peau` ne sert pas au widget — il lit son thème dans le contexte
	 * hôte. Il sert au THÈME, qui habille la page autour et n'a aucun autre
	 * moyen de savoir quelle peau tourne dedans.
	 *
	 * Sans lui, le cadre `neon-light` appliquait à TOUTES les peaux une règle
	 * qui n'en concerne qu'une : « height: auto !important », posée parce que
	 * la peau Vitrine ne défile pas et débordait de son cadre. Les autres, qui
	 * se contiennent très bien, retombaient alors sur leur hauteur minimale —
	 * mesuré sur « Créer mon néon » : un Comptoir de 483 px au lieu des 780
	 * demandés, scène écrasée, comptoir méconnaissable.
	 */
	/**
	 * FILTRE UNE LISTE PAR LE CATALOGUE DU PRODUIT.
	 *
	 * Les listes envoyées au widget sont des tableaux d'objets (une couleur a
	 * son nom, une police a son URL et ses métriques) : on garde les objets et
	 * on ne retient que ceux dont la clé est proposée.
	 *
	 * @param int    $product_id Produit.
	 * @param string $famille    Famille du catalogue.
	 * @param array  $liste      La liste entière, telle qu'elle part au widget.
	 * @param string $cle        Le champ qui porte l'identifiant.
	 * @return array
	 */
	private static function retenus( $product_id, $famille, array $liste, $cle ) {
		if ( ! class_exists( 'AHNS_Catalogue_Produit' ) ) {
			return $liste;
		}
		$permis = AHNS_Catalogue_Produit::ids( $product_id, $famille );
		$out    = array();
		foreach ( $liste as $entree ) {
			if ( isset( $entree[ $cle ] ) && in_array( (string) $entree[ $cle ], $permis, true ) ) {
				$out[] = $entree;
			}
		}
		return $out ? $out : $liste;
	}

	/** Les raccourcis de taille retenus par ce produit. */
	private static function tailles_pour( $product_id ) {
		$toutes = array_values( AHNS_Settings::size_presets() );
		if ( ! class_exists( 'AHNS_Catalogue_Produit' ) ) {
			return $toutes;
		}
		$permis = AHNS_Catalogue_Produit::ids( $product_id, 'sizes' );
		$out    = array();
		foreach ( $toutes as $taille ) {
			if ( in_array( (string) $taille['label'], $permis, true ) ) {
				$out[] = $taille;
			}
		}
		return $out ? $out : $toutes;
	}

	/**
	 * La couleur du premier néon composé sur CE produit.
	 *
	 * Celle de la boutique si ce produit la propose ; la première des siennes
	 * sinon. Un configurateur qui s'ouvre sur une teinte absente de sa propre
	 * palette laisse le client devant un choix qu'il ne peut pas refaire.
	 */
	private static function couleur_par_defaut( $product_id ) {
		$defaut = AHNS_Catalog::default_color();
		if ( ! class_exists( 'AHNS_Catalogue_Produit' ) ) {
			return $defaut;
		}
		$permis = AHNS_Catalogue_Produit::ids( $product_id, 'colors' );
		return in_array( (string) $defaut, $permis, true ) ? $defaut : (string) reset( $permis );
	}

	/**
	 * Le configurateur qui commande cet affichage — celui du produit, ou le
	 * défaut. Jamais null ici : un aperçu doit pouvoir se dessiner même si le
	 * produit a perdu le sien (la fiche, elle, sera redevenue ordinaire).
	 *
	 * @param int $product_id Produit hôte.
	 * @return array<string, mixed>
	 */
	public static function configurateur( $product_id = 0 ) {
		if ( ! class_exists( 'AHNS_Configurateurs' ) ) {
			return array(
				'features'    => AHNS_Configurator::settings()['features'],
				'backgrounds' => AHNS_Configurator::settings()['backgrounds'],
				'max_lines'   => AHNS_Configurator::settings()['max_lines'],
				'peau'        => 'clair-boutique',
			);
		}
		$conf = AHNS_Configurateurs::pour_produit( $product_id );
		return $conf ? $conf : AHNS_Configurateurs::defaut();
	}

	/**
	 * L'apparence envoyée au widget : celle de la boutique (couleur de marque,
	 * libellés, logo), mais avec l'INTERFACE du configurateur du produit.
	 *
	 * @param int $product_id Produit hôte.
	 * @return array<string, mixed>
	 */
	private static function apparence_pour( $product_id = 0 ) {
		$apparence          = AHNS_Appearance::for_widget();
		$apparence['theme'] = self::configurateur( $product_id )['peau'];
		return $apparence;
	}

	public function render( $product_id = 0, $height = '85vh', $vue = 'pleine' ) {
		$this->enqueue( $product_id );

		// L'INTERFACE VIENT DU CONFIGURATEUR DU PRODUIT, pas d'un réglage unique
		// de boutique : c'est tout l'objet des configurateurs multiples. Le
		// widget la relit dans le contexte ; `data-peau` sert au style posé
		// avant que le module ne soit chargé.
		$peau = self::apparence_pour( $product_id )['theme'];

		// EN MODE FICHE, AUCUNE HAUTEUR N'EST IMPOSÉE. Le configurateur se
		// déroule et c'est la page qui défile : une hauteur en « vh » ici
		// remettrait l'ascenseur interne qu'on vient d'enlever.
		if ( 'fiche' === $vue ) {
			return sprintf(
				'<ahns-config data-peau="%s" data-vue="fiche" style="display:block;height:auto;"></ahns-config>',
				esc_attr( $peau )
			);
		}

		return sprintf(
			'<ahns-config data-peau="%s" style="display:block;height:%s;min-height:520px;"></ahns-config>',
			esc_attr( $peau ),
			esc_attr( $height )
		);
	}

	/**
	 * Charge le bundle et injecte le contexte hôte. Idempotent : appelable
	 * plusieurs fois dans une page sans dupliquer le script.
	 *
	 * @param int $product_id Produit hôte.
	 * @return void
	 */
	public function enqueue( $product_id = 0 ) {
		$asset   = AHNS_PLUGIN_DIR . 'assets/neon-config.js';
		$version = file_exists( $asset ) ? (string) filemtime( $asset ) : AHNS_VERSION;
		wp_register_script( self::HANDLE, AHNS_PLUGIN_URL . 'assets/neon-config.js', array(), $version, true );
		// MODULE ES, et c'est ce qui permet à la vue 3D de rester dehors : elle
		// pèse la moitié du widget, et un visiteur qui ne l'ouvre pas n'a aucune
		// raison de la télécharger. Un module résout ses imports relatifs à sa
		// propre adresse : les morceaux se trouvent seuls, sans réglage d'URL.
		add_filter( 'script_loader_tag', array( __CLASS__, 'as_module' ), 10, 2 );
		wp_enqueue_script( self::HANDLE );

		if ( self::$context_printed ) {
			return;
		}
		self::$context_printed = true;

		$context = array(
			'platform'    => 'woocommerce',
			'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
			'nonce'       => wp_create_nonce( AHNS_Cart::NONCE_ACTION ),
			'productId'   => absint( $product_id ),
			// Abonnement : le configurateur reste entier, seul l'ajout au panier
			// se ferme. Le client compose, il ne peut simplement pas commander.
			// L'abonnement protège les outils de production, pas le parcours client.
			'canAddToCart' => true,
			'cartClosedReason' => '',
			// Devis : un JPEG ou un PDF ne se mesure pas. La demande se depose
			// ICI, sur la boutique — le client n'en sort pas, et ses coordonnees
			// non plus.
			'quoteAction' => '',
			// Et l'adresse de la page dediee, pour ceux qui n'ont pas encore de
			// fichier : beaucoup de projets commencent par une question.
			'quotePageUrl' => '',
			// En mode devis, le configurateur ne vend pas : il fait DESSINER.
			// Le prix disparait — annoncer un chiffre sur une piece qu'on ne sait
			// pas encore mesurer serait un engagement qu'on ne peut pas tenir.
			'quoteMode'   => self::is_quote_mode(),
			// FAMILLES DU CONFIGURATEUR COURANT. Par défaut le néon seul : on
			// n'ajoute rien à l'insu du marchand, c'est lui qui ouvre les
			// panneaux ou les caissons le jour où il les fabrique.
			'families'    => self::families_for_widget(),
			'cartUrl'     => function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : '',
			'checkoutUrl' => function_exists( 'wc_get_checkout_url' ) ? wc_get_checkout_url() : '',
			'homeUrl'     => home_url( '/' ),
			'siteName'    => get_bloginfo( 'name' ),
			'locale'      => self::widget_locale(),
			// Surcharges de tarifs du marchand : le widget affiche EXACTEMENT
			// ce que le serveur facturera.
			// LE BARÈME DE CE PRODUIT. Si le navigateur calculait avec celui de
			// la boutique pendant que le serveur facture celui du produit, le
			// client verrait un prix et paierait l'autre.
			'pricing'     => (object) AHNS_Pricing::pour_produit( $product_id )->overrides_for_widget(),
			// Tailles proposées au client (réglage marchand).
			'sizePresets' => self::tailles_pour( $product_id ),
			'sizeBounds'  => AHNS_Settings::size_bounds(),
			// Polices activées par le marchand (URL + métriques : le widget
			// doit pouvoir les AFFICHER et les TARIFER).
			'fonts'       => self::retenus( $product_id, 'fonts', AHNS_Fonts::for_widget(), 'id' ),
			// Ce que le marchand propose : une option éteinte disparaît du
			// configurateur (et sera refusée au panier).
			'features'    => self::configurateur( $product_id )['features'],
			'backgrounds' => self::configurateur( $product_id )['backgrounds'],
			// LES SCÈNES, AVEC LEURS IMAGES. « backgrounds » ne disait que
			// oui/non sur trois décors dessinés dans la feuille de style ; la
			// boutique peut désormais ajouter les siens, et il faut bien leur
			// transmettre l'adresse de la photo. L'ancienne clé reste : une
			// boutique dont le widget n'aurait pas encore été reconstruit
			// continue de fonctionner avec les trois d'origine.
			'scenes'      => class_exists( 'AHNS_Fonds' )
				? AHNS_Fonds::pour_widget(
					self::configurateur( $product_id )['backgrounds'],
					self::apparence_pour( $product_id )['theme']
				)
				: array(),
			'maxLines'    => (int) ( self::profile()['max_lines'] ?? self::configurateur( $product_id )['max_lines'] ),
			// Catalogue proposé au client (couleurs, découpes, finitions).
			'colors'      => self::retenus( $product_id, 'colors', AHNS_Catalog::colors_for_widget(), 'hex' ),
			'defaultColor' => self::couleur_par_defaut( $product_id ),
			'supportTypes' => AHNS_Catalogue_Produit::ids( $product_id, 'support_types' ),
			'supportFinishes' => AHNS_Catalogue_Produit::ids( $product_id, 'support_finishes' ),
			'boxDepthCm'  => AHNS_Catalog::box_depth_cm(),
			'neonStyle'   => (string) ( self::profile()['neon_style'] ?? 'tube' ),
			// Matières réellement proposées — même doctrine que les couleurs :
			// ce qui n'est pas proposé ne doit pas apparaître.
			'panelMaterials' => AHNS_Catalogue_Produit::ids( $product_id, 'materials' ),
			// Apparence : couleur de marque, libellés, logo d'en-tête.
			'appearance'  => self::apparence_pour( $product_id ),
		);

		/*
		 * LE MÉTIER DU PRODUIT.
		 *
		 * Un produit est un néon, un panneau ou un caisson — jamais deux à la
		 * fois. Le widget sait déjà configurer les trois : il lit « kind » dans
		 * la configuration initiale et bascule ses contrôles en conséquence —
		 * texte et écritures pour un néon, largeur, hauteur, matière et épaisseur
		 * pour un panneau.
		 *
		 * Personne ne lui envoyait cette valeur. Tout retombait donc sur « neon »,
		 * et une fiche de PVC affichait un configurateur de lettres : un
		 * contresens, pas un défaut d'habillage.
		 *
		 * La valeur vit sur le produit, en métadonnée « _ahns_kind ». Absente, on
		 * garde « neon » : c'est le métier d'origine de la boutique, et une
		 * migration ne doit jamais changer ce que les fiches existantes montrent.
		 */
		$kind = (string) get_post_meta( (int) $product_id, '_ahns_kind', true );
		if ( in_array( $kind, array( 'panel', 'box-sign' ), true ) ) {
			$context['initialConfiguration'] = array_merge(
				isset( $context['initialConfiguration'] ) ? (array) $context['initialConfiguration'] : array(),
				array( 'kind' => $kind )
			);
		}

		// ÉDITION DEPUIS LE PANIER : `?ahns_edit=<clé>` recharge la configuration
		// de cette ligne ; l'enregistrement la REMPLACERA (docs/06 §5).
		$edit = self::edit_context();
		if ( $edit ) {
			$context['editCartItemKey']      = $edit['key'];
			$context['initialConfiguration'] = $edit['config'];
			$context['productId']            = $edit['product_id'];
		}
		wp_add_inline_script( self::HANDLE, 'window.__AHNS_CONTEXT__=' . wp_json_encode( $context ) . ';', 'before' );
	}

	/**
	 * Contexte déjà imprimé dans cette requête ?
	 *
	 * @var bool
	 */
	private static $context_printed = false;
}
