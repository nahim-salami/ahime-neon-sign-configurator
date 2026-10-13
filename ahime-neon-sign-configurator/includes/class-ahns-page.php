<?php
/**
 * Page configurateur DÉDIÉE : servie par un gabarit « toile vierge »
 * (template_include) — AUCUN markup du thème (en-tête, menu, pied de page),
 * assets du thème retirés → zéro conflit possible. Pattern éprouvé du projet
 * de référence. L'en-tête du widget (nom du site → accueil) fait office de
 * navigation.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Page
 */
class AHNS_Page {

	const META   = '_ahns_clean_page';
	const OPTION = 'ahns_page_id';

	public function hooks() {
		add_filter( 'template_include', array( $this, 'canvas_template' ), 999 );
		add_action( 'wp_enqueue_scripts', array( $this, 'strip_theme_assets' ), PHP_INT_MAX );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_canvas_css' ) );
	}

	/**
	 * La feuille du gabarit « toile vierge » (templates/canvas.php), par la
	 * file de WordPress : le gabarit appelle wp_head(), qui l'imprime.
	 *
	 * @return void
	 */
	public function enqueue_canvas_css() {
		if ( ! $this->is_clean_page() ) {
			return;
		}
		AHNS_Admin_UI::inline_css(
			'ahns-canvas',
			'body.ahns-canvas{margin:0 !important;padding:0 !important;width:100%;min-height:100dvh;background:#fff;overflow-x:hidden;}'
			// Laisse la place à la barre d'admin quand le marchand est connecté.
			. '.ahns-canvas__main{width:100%;height:calc(100dvh - var(--wp-admin--admin-bar--height,0px));min-height:520px;}'
			. '.ahns-canvas__main ahns-config{display:block !important;width:100% !important;height:100% !important;min-height:0 !important;}'
		);
	}

	/**
	 * Vrai si la requête courante affiche une page marquée « configurateur propre ».
	 *
	 * @return bool
	 */
	private function is_clean_page() {
		if ( ! is_page() ) {
			return false;
		}
		$page_id = get_queried_object_id();
		return $page_id && 'yes' === get_post_meta( $page_id, self::META, true );
	}

	/**
	 * Sert le gabarit vierge du plugin (priorité 999 : passe après les
	 * remplacements des constructeurs de page).
	 *
	 * @param string $template Gabarit résolu par WordPress.
	 * @return string
	 */
	public function canvas_template( $template ) {
		if ( ! $this->is_clean_page() ) {
			return $template;
		}
		$canvas = AHNS_PLUGIN_DIR . 'templates/canvas.php';
		return file_exists( $canvas ) ? $canvas : $template;
	}

	/**
	 * Retire styles/scripts du thème (parent + enfant) et styles globaux : le
	 * gabarit ne rend aucun markup du thème, ses assets ne servent à rien.
	 */
	public function strip_theme_assets() {
		if ( ! $this->is_clean_page() ) {
			return;
		}
		$theme_uris = array_filter( array_unique( array( get_template_directory_uri(), get_stylesheet_directory_uri() ) ) );

		$styles = wp_styles();
		foreach ( (array) $styles->queue as $handle ) {
			$src = isset( $styles->registered[ $handle ] ) ? (string) $styles->registered[ $handle ]->src : '';
			foreach ( $theme_uris as $uri ) {
				if ( 0 === strpos( $src, $uri ) ) {
					wp_dequeue_style( $handle );
					break;
				}
			}
		}
		$scripts = wp_scripts();
		foreach ( (array) $scripts->queue as $handle ) {
			$src = isset( $scripts->registered[ $handle ] ) ? (string) $scripts->registered[ $handle ]->src : '';
			foreach ( $theme_uris as $uri ) {
				if ( 0 === strpos( $src, $uri ) ) {
					wp_dequeue_script( $handle );
					break;
				}
			}
		}
		wp_dequeue_style( 'global-styles' );
		wp_dequeue_style( 'classic-theme-styles' );
	}

	/**
	 * Garantit l'existence de la page dédiée : renvoie l'id enregistré s'il
	 * pointe une page publiée valide, sinon la crée (shortcode + meta + option).
	 *
	 * @param int $product_id Produit lié (0 = mode démo).
	 * @return int 0 si l'utilisateur ne peut pas publier de pages.
	 */
	/**
	 * URL de la page configurateur dédiée, éventuellement pour un produit donné
	 * (le produit est passé en paramètre pour que la page facture le bon article
	 * même si le shortcode de la page pointe un autre produit).
	 *
	 * @param int $product_id Produit hôte (0 = celui du shortcode de la page).
	 * @return string Vide si aucune page n'existe.
	 */
	public static function url( $product_id = 0 ) {
		$page_id = (int) get_option( self::OPTION, 0 );
		if ( $page_id <= 0 || 'publish' !== get_post_status( $page_id ) ) {
			return '';
		}
		$url = (string) get_permalink( $page_id );
		if ( '' === $url ) {
			return '';
		}
		return $product_id > 0 ? add_query_arg( 'ahns_product', absint( $product_id ), $url ) : $url;
	}

	public static function ensure_page( $product_id = 0 ) {
		$page_id = (int) get_option( self::OPTION, 0 );
		if ( $page_id > 0 ) {
			$post = get_post( $page_id );
			if ( $post && 'page' === $post->post_type && 'trash' !== $post->post_status ) {
				return $page_id;
			}
		}
		if ( ! current_user_can( 'publish_pages' ) ) {
			return 0;
		}
		$page_id = wp_insert_post(
			array(
				'post_title'   => __( 'Neon builder', 'ahime-neon-sign-configurator' ),
				'post_content' => '[ahns_configurator product="' . absint( $product_id ) . '"]',
				'post_status'  => 'publish',
				'post_type'    => 'page',
			),
			true
		);
		if ( is_wp_error( $page_id ) || ! $page_id ) {
			return 0;
		}
		update_post_meta( $page_id, self::META, 'yes' );
		update_option( self::OPTION, (int) $page_id );
		return (int) $page_id;
	}
}
