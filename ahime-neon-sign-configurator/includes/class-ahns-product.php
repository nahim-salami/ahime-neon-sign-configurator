<?php
/**
 * Intégration sur la FICHE PRODUIT — le configurateur remplace le formulaire
 * d'achat natif (y compris le sélecteur de variations, qui n'a plus lieu
 * d'être : la personnalisation remplace les variantes couleur/taille).
 *
 * Trois modes (docs/06 §3) :
 *   - inline   : le configurateur s'affiche à la place du formulaire ;
 *   - modal    : un bouton « Personnaliser » ouvre le configurateur en fenêtre ;
 *   - redirect : le bouton renvoie vers la page dédiée.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Product
 */
class AHNS_Product {

	const META_ENABLED = '_ahns_enabled';
	const META_MODE    = '_ahns_display_mode';
	const NONCE        = 'ahns_product_meta';

	/** Modes d'affichage autorisés. */
	const MODES = array(
		'inline'   => 'Embedded in the product page',
		'modal'    => 'Button + modal',
		'redirect' => 'Button + dedicated page',
	);

	/**
	 * LES BLOCS QUE LE CONFIGURATEUR REMPLACE sur la fiche d'un thème à blocs.
	 * Le formulaire d'achat (deux noms selon la version de WooCommerce), le prix
	 * de base et la galerie, que le mode intégré retire comme en thème classique.
	 */
	const BLOCS_ACHAT   = array( 'woocommerce/add-to-cart-form', 'woocommerce/add-to-cart-with-options' );
	const BLOCS_PRIX    = array( 'woocommerce/product-price' );
	const BLOCS_GALERIE = array( 'woocommerce/product-image-gallery', 'woocommerce/product-gallery' );

	/**
	 * @var AHNS_Embed
	 */
	private $embed;

	/** Le produit dont la fiche est en cours de rendu (thème à blocs). */
	private $produit_fiche = 0;

	/** Le configurateur est déjà posé sur cette fiche : un seul, même si le gabarit répète le bloc. */
	private $configurateur_pose = false;

	public function __construct( AHNS_Embed $embed ) {
		$this->embed = $embed;
	}

	public function hooks() {
		// --- Admin : encadré dans la fiche produit.
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_product', array( $this, 'save_meta' ), 10, 2 );
		// --- Front : remplace le formulaire d'achat natif.
		// Priorité tardive : les thèmes/extensions ont fini d'accrocher leurs actions.
		add_action( 'wp', array( $this, 'takeover_product_form' ), 20 );
		// --- Boutique : un produit personnalisable ne s'ajoute pas au panier sans
		// passer par le configurateur. Le bouton des listes (thème classique comme
		// bloc « Bouton du produit ») mène à la fiche, et un ajout direct (lien
		// ?add-to-cart=, formulaire natif, « Commander à nouveau ») est refusé : il
		// mettrait au panier une enseigne sans dessin, au prix de base du produit.
		add_filter( 'woocommerce_product_add_to_cart_url', array( $this, 'lien_liste' ), 10, 2 );
		add_filter( 'woocommerce_product_add_to_cart_text', array( $this, 'texte_liste' ), 10, 2 );
		add_filter( 'woocommerce_product_supports', array( $this, 'sans_ajout_direct' ), 10, 3 );
		add_filter( 'woocommerce_add_to_cart_validation', array( $this, 'refuser_ajout_direct' ), 10, 2 );
	}

	/**
	 * Vrai si ce produit (ou le parent de cette variation) se vend par le configurateur.
	 *
	 * @param WC_Product|int $product Produit ou identifiant.
	 * @return bool
	 */
	public static function personnalisable( $product ) {
		if ( $product instanceof WC_Product ) {
			$product = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
		}
		$product = (int) $product;
		return $product > 0 && self::is_enabled( $product ) && null !== self::configurateur( $product );
	}

	/**
	 * Le bouton d'une liste de produits mène à la fiche, où vit le configurateur.
	 *
	 * @param string     $url     Adresse proposée par WooCommerce.
	 * @param WC_Product $product Produit.
	 * @return string
	 */
	public function lien_liste( $url, $product = null ) {
		return $product && self::personnalisable( $product ) ? (string) get_permalink( $product->get_id() ) : $url;
	}

	/**
	 * Le texte de ce bouton dit ce qui attend le client.
	 *
	 * @param string     $text    Texte proposé par WooCommerce.
	 * @param WC_Product $product Produit.
	 * @return string
	 */
	public function texte_liste( $text, $product = null ) {
		return $product && self::personnalisable( $product ) ? __( 'Customise this neon', 'ahime-neon-sign-configurator' ) : $text;
	}

	/**
	 * Pas d'ajout au panier en un clic depuis une liste (ni AJAX classique, ni
	 * API du panier des blocs) : le bouton devient un simple lien.
	 *
	 * @param bool       $supports Réponse proposée.
	 * @param string     $feature  Fonction demandée.
	 * @param WC_Product $product  Produit.
	 * @return bool
	 */
	public function sans_ajout_direct( $supports, $feature, $product = null ) {
		return 'ajax_add_to_cart' === $feature && $product && self::personnalisable( $product ) ? false : $supports;
	}

	/**
	 * Refuse un ajout au panier qui ne vient pas du configurateur. Celui-ci passe
	 * par WC()->cart->add_to_cart(), qui ne déclenche pas ce filtre.
	 *
	 * @param bool $passed     Validation en cours.
	 * @param int  $product_id Produit ajouté.
	 * @return bool
	 */
	public function refuser_ajout_direct( $passed, $product_id = 0 ) {
		if ( ! $passed || ! self::personnalisable( (int) $product_id ) ) {
			return $passed;
		}
		wc_add_notice( __( 'This product is made to order: design your sign in the configurator on its product page.', 'ahime-neon-sign-configurator' ), 'error' );
		return false;
	}

	/**
	 * Le produit est-il personnalisable ?
	 *
	 * @param int $product_id Produit.
	 * @return bool
	 */
	public static function is_enabled( $product_id ) {
		return 'yes' === get_post_meta( (int) $product_id, self::META_ENABLED, true );
	}

	/**
	 * Mode d'affichage retenu (défaut : intégré).
	 *
	 * @param int $product_id Produit.
	 * @return string
	 */
	public static function display_mode( $product_id ) {
		$mode = (string) get_post_meta( (int) $product_id, self::META_MODE, true );
		if ( isset( self::MODES[ $mode ] ) ) {
			return $mode;
		}
		// Jamais réglé sur ce produit → celui de SON configurateur, et non plus
		// un réglage unique de boutique : deux configurateurs peuvent vouloir
		// deux mises en place (intégré pour l'un, fenêtre pour l'autre).
		$conf = class_exists( 'AHNS_Configurateurs' ) ? AHNS_Configurateurs::pour_produit( $product_id ) : null;
		return $conf ? $conf['mode'] : 'inline';
	}

	/**
	 * LE CONFIGURATEUR DE CE PRODUIT — ou null s'il n'en a plus.
	 *
	 * @param int $product_id Produit.
	 * @return array<string, mixed>|null
	 */
	public static function configurateur( $product_id ) {
		return class_exists( 'AHNS_Configurateurs' ) ? AHNS_Configurateurs::pour_produit( $product_id ) : null;
	}

	// -----------------------------------------------------------------------
	// Admin
	// -----------------------------------------------------------------------

	public function add_meta_box() {
		add_meta_box(
			'ahns-product',
			__( 'Custom neon sign', 'ahime-neon-sign-configurator' ),
			array( $this, 'render_meta_box' ),
			'product',
			'side',
			'high'
		);
	}

	/**
	 * @param WP_Post $post Produit édité.
	 */
	public function render_meta_box( $post ) {
		wp_nonce_field( self::NONCE, self::NONCE );
		$enabled = self::is_enabled( $post->ID );
		$mode    = self::display_mode( $post->ID );

		echo '<p><label><input type="checkbox" name="ahns_enabled" value="yes" ' . checked( $enabled, true, false ) . ' /> <strong>' . esc_html__( 'Sell this product through the configurator', 'ahime-neon-sign-configurator' ) . '</strong></label></p>';
		echo '<p style="color:#666;font-size:12px;margin-top:-6px;">' . esc_html__( 'The native purchase form (and the variation selector) is replaced by the configurator. The price shown to the customer is the one calculated by the configurator.', 'ahime-neon-sign-configurator' ) . '</p>';

		// QUEL CONFIGURATEUR. La liste ne s'affiche qu'à partir de deux : avec un
		// seul, le choix n'en est pas un et n'encombre pas l'encadré.
		if ( class_exists( 'AHNS_Configurateurs' ) ) {
			$confs = AHNS_Configurateurs::tous();
			if ( count( $confs ) > 1 ) {
				$choisi = (string) get_post_meta( $post->ID, AHNS_Configurateurs::META, true );
				echo '<p><label for="ahns_configurateur"><strong>' . esc_html__( 'Configurator', 'ahime-neon-sign-configurator' ) . '</strong></label><br />';
				echo '<select name="ahns_configurateur" id="ahns_configurateur" style="width:100%;">';
				foreach ( $confs as $conf ) {
					printf(
						'<option value="%s"%s>%s</option>',
						esc_attr( $conf['id'] ),
						selected( $choisi, $conf['id'], false ),
						esc_html( $conf['nom'] . ( $conf['defaut'] ? ' · ' . __( 'default', 'ahime-neon-sign-configurator' ) : '' ) )
					);
				}
				echo '</select></p>';
			}
			// Le configurateur désigné n'existe plus : le dire ici, sur la fiche
			// concernée, plutôt que de laisser le marchand découvrir en boutique
			// que son produit ne se personnalise plus.
			if ( $enabled && ! self::configurateur( $post->ID ) ) {
				echo '<p style="padding:8px 10px;border-left:3px solid #d63638;background:#fdf6f6;font-size:12px;">';
				echo esc_html__( 'This product’s configurator was deleted: the page shows as an ordinary one. Choose another above.', 'ahime-neon-sign-configurator' );
				echo '</p>';
			}
		}

		echo '<p><label for="ahns_display_mode"><strong>' . esc_html__( 'Display', 'ahime-neon-sign-configurator' ) . '</strong></label><br />';
		echo '<select name="ahns_display_mode" id="ahns_display_mode" style="width:100%;">';
		foreach ( AHNS_I18n::t_map( self::MODES ) as $value => $label ) {
			printf( '<option value="%s"%s>%s</option>', esc_attr( $value ), selected( $mode, $value, false ), esc_html( $label ) );
		}
		echo '</select></p>';

		if ( class_exists( 'AHNS_Page' ) ) {
			$page_id = (int) get_option( AHNS_Page::OPTION, 0 );
			if ( $page_id > 0 ) {
				echo '<p style="color:#666;font-size:12px;">' . esc_html__( 'Dedicated page:', 'ahime-neon-sign-configurator' ) . ' <a href="' . esc_url( (string) get_permalink( $page_id ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'view', 'ahime-neon-sign-configurator' ) . '</a></p>';
			}
		}
	}

	/**
	 * @param int     $post_id Produit.
	 * @param WP_Post $post    Objet.
	 */
	public function save_meta( $post_id, $post ) {
		unset( $post );
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		$nonce = isset( $_POST[ self::NONCE ] ) ? sanitize_text_field( wp_unslash( $_POST[ self::NONCE ] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, self::NONCE ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		update_post_meta( $post_id, self::META_ENABLED, isset( $_POST['ahns_enabled'] ) ? 'yes' : 'no' );
		if ( isset( $_POST['ahns_configurateur'] ) && class_exists( 'AHNS_Configurateurs' ) ) {
			$conf = sanitize_key( wp_unslash( $_POST['ahns_configurateur'] ) );
			// On n'enregistre qu'un identifiant qui existe : une valeur trafiquée
			// ferait passer la fiche pour « configurateur supprimé ».
			if ( AHNS_Configurateurs::un( $conf ) ) {
				update_post_meta( $post_id, AHNS_Configurateurs::META, $conf );
			}
		}
		$mode = isset( $_POST['ahns_display_mode'] ) ? sanitize_text_field( wp_unslash( $_POST['ahns_display_mode'] ) ) : 'inline';
		update_post_meta( $post_id, self::META_MODE, isset( self::MODES[ $mode ] ) ? $mode : 'inline' );
	}

	// -----------------------------------------------------------------------
	// Front
	// -----------------------------------------------------------------------

	/**
	 * Sur une fiche produit personnalisable : retire le formulaire d'achat natif
	 * (quel que soit le type de produit — simple, variable…) et pose le
	 * configurateur à sa place.
	 *
	 * @return void
	 */
	public function takeover_product_form() {
		if ( is_admin() || ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}
		$product_id = get_queried_object_id();
		if ( ! $product_id || ! self::is_enabled( $product_id ) ) {
			return;
		}

		/*
		 * LE CONFIGURATEUR A ÉTÉ SUPPRIMÉ.
		 *
		 * On ne touche à rien : la fiche garde son formulaire d'achat, son prix
		 * et sa galerie — elle redevient une fiche WooCommerce ordinaire. Le
		 * produit reste en vente, il ne se personnalise plus. C'est le contraire
		 * qu'il faut éviter : une fiche amputée de son bouton d'achat et sans
		 * configurateur pour le remplacer ne vend plus du tout.
		 */
		if ( ! self::configurateur( $product_id ) ) {
			return;
		}

		// `woocommerce_template_single_add_to_cart` aiguille vers le formulaire du
		// type de produit (dont `variable`) : le retirer les supprime tous.
		remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_add_to_cart', 30 );
		// Le prix natif n'a plus de sens : le configurateur affiche le prix calculé.
		remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 10 );

		// MODE INTÉGRÉ : la galerie produit fait doublon avec l'aperçu en direct
		// (le client voit SA création) et mange la moitié de la largeur. On la
		// retire et on rend le résumé pleine largeur. En mode fenêtre ou
		// redirection, la fiche garde son image : le configurateur n'y est pas.
		if ( 'inline' === self::display_mode( $product_id ) ) {
			remove_action( 'woocommerce_before_single_product_summary', 'woocommerce_show_product_images', 20 );
			add_action( 'wp_enqueue_scripts', array( $this, 'print_fullwidth_css' ) );
		}
		// Fenêtre : sa feuille et son script partent dans la file AVANT le contenu.
		if ( 'modal' === self::display_mode( $product_id ) ) {
			add_action( 'wp_enqueue_scripts', array( $this, 'print_modal_assets' ) );
		}

		/*
		 * THÈME À BLOCS (Twenty Twenty-Five et les autres). La fiche n'y passe pas
		 * par les crochets classiques : le prix, le formulaire d'achat et la
		 * galerie sont des BLOCS. WooCommerce rejoue bien les crochets du résumé
		 * pour la compatibilité, mais le bloc « Ajouter au panier » resterait
		 * affiché à côté du configurateur, avec le prix de base : on remplace ces
		 * blocs-là, pour CE produit seulement (les produits apparentés gardent les
		 * leurs).
		 */
		if ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) {
			$this->produit_fiche = (int) $product_id;
			add_filter( 'render_block', array( $this, 'remplacer_bloc' ), 10, 3 );
			return;
		}

		add_action( 'woocommerce_single_product_summary', array( $this, 'render' ), 30 );
	}

	/**
	 * Thème à blocs : le formulaire d'achat de la fiche devient le configurateur,
	 * le prix de base disparaît, la galerie aussi en mode intégré.
	 *
	 * @param string        $content  Rendu du bloc.
	 * @param array         $block    Bloc analysé.
	 * @param WP_Block|null $instance Instance, qui porte le produit en contexte.
	 * @return string
	 */
	public function remplacer_bloc( $content, $block, $instance = null ) {
		$nom = isset( $block['blockName'] ) ? (string) $block['blockName'] : '';
		$tous = array_merge( self::BLOCS_ACHAT, self::BLOCS_PRIX, self::BLOCS_GALERIE );
		if ( '' === $nom || ! in_array( $nom, $tous, true ) ) {
			return $content;
		}
		$id = ( $instance instanceof WP_Block && isset( $instance->context['postId'] ) )
			? (int) $instance->context['postId']
			: (int) get_the_ID();
		if ( $id !== $this->produit_fiche ) {
			return $content;
		}
		if ( in_array( $nom, self::BLOCS_PRIX, true ) ) {
			return '';
		}
		if ( in_array( $nom, self::BLOCS_GALERIE, true ) ) {
			return 'inline' === self::display_mode( $id ) ? '' : $content;
		}
		if ( $this->configurateur_pose ) {
			return '';
		}
		$this->configurateur_pose = true;
		ob_start();
		$this->render();
		return (string) ob_get_clean();
	}

	/**
	 * Rendu selon le mode choisi.
	 *
	 * @return void
	 */
	public function render() {
		$product_id = get_queried_object_id();
		$mode       = self::display_mode( $product_id );

		if ( 'redirect' === $mode ) {
			$url = class_exists( 'AHNS_Page' ) ? AHNS_Page::url( $product_id ) : '';
			if ( '' !== $url ) {
				printf(
					'<p><a class="button alt ahns-configure-link" href="%s">%s</a></p>',
					esc_url( $url ),
					esc_html__( 'Customise this neon', 'ahime-neon-sign-configurator' )
				);
				return;
			}
			$mode = 'modal'; // pas de page dédiée → repli sur la fenêtre.
		}

		if ( 'modal' === $mode ) {
			$this->embed->enqueue( $product_id );
			printf(
				'<p><button type="button" class="button alt ahns-open-modal" data-ahns-modal="1">%s</button></p>',
				esc_html__( 'Customise this neon', 'ahime-neon-sign-configurator' )
			);
			// L'interface est celle du configurateur DE CE PRODUIT, comme
			// partout ailleurs. La fenêtre garde sa hauteur : elle EST
			// l'écran le temps qu'elle est ouverte, il n'y a rien derrière
			// elle à faire défiler.
			printf(
				'<div class="ahns-modal" id="ahns-modal" aria-hidden="true"><div class="ahns-modal__dialog" role="dialog" aria-modal="true">'
				. '<button type="button" class="ahns-modal__close" aria-label="%1$s">&times;</button>'
				. '<ahns-config data-peau="%2$s" style="display:block;height:82vh;min-height:520px;"></ahns-config>'
				. '</div></div>',
				esc_attr__( 'Close', 'ahime-neon-sign-configurator' ),
				esc_attr( AHNS_Embed::configurateur( $product_id )['peau'] )
			);
			$this->print_modal_assets();
			return;
		}

		// Intégré : le configurateur EST le formulaire d'achat.
		// LA COLONNE DE DROITE N'EST PLUS LIMITÉE. Une boîte de 78 % de l'écran
		// posait un deuxième ascenseur à l'intérieur de celui de la page : le
		// client attrapait le mauvais, et sur téléphone le geste devenait une
		// loterie. Ici le configurateur se déroule et la page s'allonge.
		echo '<div class="ahns-inline">' . wp_kses( $this->embed->render( $product_id, 'auto', 'fiche' ), AHNS_Embed::BALISES ) . '</div>';
	}

	/**
	 * Mode intégré : masque la galerie produit (au cas où le thème la rende par
	 * son propre hook ou un bloc) et rend le résumé pleine largeur, pour que le
	 * configurateur dispose de toute la page.
	 *
	 * @return void
	 */
	public function print_fullwidth_css() {
		AHNS_Admin_UI::inline_css(
			'ahns-fullwidth',
			'.woocommerce div.product div.images,.woocommerce div.product .woocommerce-product-gallery,'
			. '.wp-block-woocommerce-product-image-gallery{display:none !important;}'
			. '.woocommerce div.product div.summary,.woocommerce div.product .entry-summary{'
			. 'float:none !important;width:100% !important;max-width:100% !important;margin:0 !important;clear:both;}'
			. '.ahns-inline{width:100%;margin-top:12px;}'
			// Thème à blocs : la colonne vidée de sa galerie s'efface, celle du
			// configurateur prend toute la largeur.
			. '.wp-block-columns:has(.ahns-inline)>.wp-block-column:not(:has(.ahns-inline)){display:none !important;}'
			. '.wp-block-columns:has(.ahns-inline)>.wp-block-column:has(.ahns-inline){flex-basis:100% !important;max-width:100% !important;}'
		);
	}

	/**
	 * Styles + comportement de la fenêtre (autonomes, sans dépendance).
	 *
	 * @return void
	 */
	public function print_modal_assets() {
		static $done = false;
		if ( $done ) {
			return;
		}
		$done = true;
		AHNS_Admin_UI::inline_css(
			'ahns-modal',
			'			.ahns-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(12,14,18,.72);padding:16px}
			.ahns-modal.is-open{display:flex}
			.ahns-modal__dialog{position:relative;width:min(1180px,96vw);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35)}
			.ahns-modal__close{position:absolute;right:10px;top:10px;z-index:2;box-sizing:border-box;width:36px;height:36px;min-width:36px;padding:0;margin:0;border:0;outline:0;box-shadow:none;border-radius:999px;background:#111827;color:#fff;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
			.ahns-modal__close:hover{background:#000;color:#fff}
			.ahns-modal__close:focus,.ahns-modal__close:focus-visible{outline:0;box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(17,24,39,.4)}'
		);
		AHNS_Admin_UI::inline_js(
			'ahns-modal',
			'		(function(){
			var modal = document.getElementById(\'ahns-modal\');
			if (!modal) return;
			var closeBtn = modal.querySelector(\'.ahns-modal__close\');
			function open(){ modal.classList.add(\'is-open\'); modal.setAttribute(\'aria-hidden\',\'false\'); closeBtn.focus(); }
			function close(){ modal.classList.remove(\'is-open\'); modal.setAttribute(\'aria-hidden\',\'true\'); }
			document.addEventListener(\'click\', function(e){
				if (e.target.closest && e.target.closest(\'[data-ahns-modal]\')) { e.preventDefault(); open(); return; }
				if (e.target === modal || e.target === closeBtn) { e.preventDefault(); close(); }
			});
			document.addEventListener(\'keydown\', function(e){ if (e.key === \'Escape\') close(); });
		}());'
		);
	}
}
