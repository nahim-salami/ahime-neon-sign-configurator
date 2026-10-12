<?php
/**
 * Tableau de bord — page d'accueil du plugin (docs/07 §2.1) : où en est la
 * configuration, où aller ensuite, et les dernières commandes.
 *
 * C'est aussi cette classe qui crée le MENU DE PREMIER NIVEAU ; tous les autres
 * écrans s'y rattachent (`AHNS_Dashboard::PAGE_SLUG`).
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Dashboard
 */
class AHNS_Dashboard {

	const PAGE_SLUG = 'ahns-dashboard';

	public function hooks() {
		// Priorité 9 : le menu parent doit exister avant que les écrans s'y accrochent.
		add_action( 'admin_menu', array( $this, 'add_menu' ), 9 );
	}

	public function add_menu() {
		add_menu_page(
			__( 'Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Ahime Neon', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' ),
			'dashicons-lightbulb',
			57
		);
		// Renomme le doublon automatique du premier sous-menu.
		add_submenu_page(
			self::PAGE_SLUG,
			__( 'Dashboard - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Dashboard', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
		// Alias sous WooCommerce, où beaucoup de marchands cherchent.
		add_submenu_page(
			'woocommerce',
			__( 'Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Ahime Neon', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Étapes de mise en route : chacune sait si elle est faite et où aller.
	 *
	 * @return array<int,array{done:bool,title:string,hint:string,url:string,cta:string}>
	 */
	public static function checklist() {
		$page_id  = (int) get_option( AHNS_Page::OPTION, 0 );
		$page_ok  = $page_id > 0 && 'publish' === get_post_status( $page_id );
		$product  = AHNS_Configurator::default_product_id();
		$fonts    = class_exists( 'AHNS_Fonts' ) ? count( AHNS_Fonts::enabled_ids() ) : 0;
		$colors   = class_exists( 'AHNS_Catalog' ) ? count( AHNS_Catalog::enabled_colors() ) : 0;
		$prices   = (array) get_option( AHNS_Settings::OPTION, array() );
		$email    = class_exists( 'AHNS_Order' ) ? AHNS_Order::production_email() : '';

		return array(
			array(
				'done'  => $page_ok,
				'title' => __( 'Configurator page', 'ahime-neon-sign-configurator' ),
				'hint'  => $page_ok ? __( 'Your dedicated page is live.', 'ahime-neon-sign-configurator' ) : __( 'Create the page where your customers will design their neon.', 'ahime-neon-sign-configurator' ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Configurator::PAGE_SLUG ),
				'cta'   => __( 'Create the page', 'ahime-neon-sign-configurator' ),
			),
			array(
				'done'  => $product > 0,
				'title' => __( 'Billed product', 'ahime-neon-sign-configurator' ),
				'hint'  => $product > 0 ? sprintf( /* translators: %s: product name. */ __( 'Neons go into the cart as "%s".', 'ahime-neon-sign-configurator' ), get_the_title( $product ) ) : __( 'With no product linked, the configurator runs in demo mode: nothing can be added to the cart.', 'ahime-neon-sign-configurator' ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Configurator::PAGE_SLUG ),
				'cta'   => __( 'Choose the product', 'ahime-neon-sign-configurator' ),
			),
			array(
				'done'  => $fonts > 0,
				'title' => __( 'Fonts', 'ahime-neon-sign-configurator' ),
				'hint'  => sprintf( /* translators: %d: number of fonts. */ __( '%d font(s) offered to your customers.', 'ahime-neon-sign-configurator' ), $fonts ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Fonts::PAGE_SLUG ),
				'cta'   => __( 'Choose the fonts', 'ahime-neon-sign-configurator' ),
			),
			array(
				'done'  => $colors > 0,
				'title' => __( 'Colours', 'ahime-neon-sign-configurator' ),
				'hint'  => sprintf( /* translators: %d: number of colours. */ __( '%d tube colour(s) on offer.', 'ahime-neon-sign-configurator' ), $colors ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Catalog::COLORS_SLUG ),
				'cta'   => __( 'Choose the colours', 'ahime-neon-sign-configurator' ),
			),
			array(
				'done'  => ! empty( $prices ),
				'title' => __( 'Pricing checked', 'ahime-neon-sign-configurator' ),
				'hint'  => ! empty( $prices ) ? __( 'Your coefficients are saved.', 'ahime-neon-sign-configurator' ) : __( 'Open the simulator and confirm your pricing before you open the shop.', 'ahime-neon-sign-configurator' ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Settings::PAGE_SLUG ),
				'cta'   => __( 'Check the pricing', 'ahime-neon-sign-configurator' ),
			),
			array(
				'done'  => '' !== $email,
				'title' => __( 'Workshop e-mail', 'ahime-neon-sign-configurator' ),
				'hint'  => '' !== $email ? sprintf( /* translators: %s: e-mail address. */ __( 'The specification is sent to %s.', 'ahime-neon-sign-configurator' ), $email ) : __( 'With no address, nobody receives the manufacturing specification.', 'ahime-neon-sign-configurator' ),
				'url'   => admin_url( 'admin.php?page=' . AHNS_Appearance::PAGE_SLUG ),
				'cta'   => __( 'Set the address', 'ahime-neon-sign-configurator' ),
			),
		);
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$steps   = self::checklist();
		$done    = count( array_filter( $steps, static fn( $s ) => $s['done'] ) );
		$total   = count( $steps );
		$page_id = (int) get_option( AHNS_Page::OPTION, 0 );

		$actions = '';
		if ( class_exists( 'AHNS_Onboarding' ) ) {
			$actions .= AHNS_Admin_UI::button( __( 'Run the wizard', 'ahime-neon-sign-configurator' ), AHNS_Onboarding::url(), 'on-accent' );
		}
		if ( $page_id > 0 && 'publish' === get_post_status( $page_id ) ) {
			$actions .= ' ' . AHNS_Admin_UI::button( __( 'View the configurator', 'ahime-neon-sign-configurator' ), (string) get_permalink( $page_id ), 'ghost', array( 'target' => '_blank', 'rel' => 'noopener' ) );
		}

		AHNS_Admin_UI::open(
			__( 'Dashboard', 'ahime-neon-sign-configurator' ),
			$done === $total
				? __( 'Your configurator is ready to sell.', 'ahime-neon-sign-configurator' )
				: sprintf( /* translators: 1: steps done, 2: total steps, 3: steps left. */ __( 'Setup: %1$d step(s) out of %2$d. %3$d item(s) still to sort out.', 'ahime-neon-sign-configurator' ), $done, $total, $total - $done ),
			$actions
		);

		/*
		 * --- LE PARC, AVANT TOUT LE RESTE (chantier A6) ----------------------
		 *
		 * Cette alerte ne vivait que dans l'ecran de configuration, ou seul la
		 * voyait le marchand qui l'ouvrait — c'est-a-dire celui qui n'en a pas
		 * besoin. Celui qui vend depuis trois mois sur un prix que personne n'a
		 * choisi, lui, n'y va jamais.
		 *
		 * Elle passe donc ici, sur l'ecran par ou tout le monde entre, et AVANT
		 * l'abonnement : savoir que son bareme repose sur des valeurs non
		 * verifiees compte plus que de savoir que sa licence est a jour.
		 *
		 * Elle ne s'affiche que s'il y a quelque chose a dire — un bandeau
		 * permanent cesse d'etre lu.
		 */
		if ( class_exists( 'AHNS_Settings' ) && method_exists( 'AHNS_Settings', 'rendre_alerte_parc' ) ) {
			AHNS_Settings::rendre_alerte_parc();
		}

		// --- Liste de contrôle -------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Getting started', 'ahime-neon-sign-configurator' ) );
		echo '<ul class="ahns-checklist">';
		foreach ( $steps as $i => $step ) {
			echo '<li>';
			printf(
				'<span class="ahns-check-ico ahns-check-ico--%s">%s</span>',
				$step['done'] ? 'done' : 'todo',
				$step['done'] ? '&#10003;' : (int) ( $i + 1 )
			);
			printf(
				'<span class="ahns-check-body"><strong>%s</strong><span>%s</span></span>',
				esc_html( $step['title'] ),
				esc_html( $step['hint'] )
			);
			if ( $step['done'] ) {
				echo wp_kses( AHNS_Admin_UI::badge( 'OK', 'ok' ), AHNS_Admin_UI::allowed_html() );
			} else {
				echo wp_kses( AHNS_Admin_UI::button( $step['cta'], $step['url'], 'primary' ), AHNS_Admin_UI::allowed_html() );
			}
			echo '</li>';
		}
		echo '</ul>';
		AHNS_Admin_UI::card_close();

		// --- Accès rapides -----------------------------------------------------
		$cards = array(
			array( 'bolt', __( 'Configurators', 'ahime-neon-sign-configurator' ), __( 'One interface, one set of options and one billed product per configurator.', 'ahime-neon-sign-configurator' ), AHNS_Admin_Configurateurs::PAGE_SLUG ),
			array( 'type', __( 'Fonts', 'ahime-neon-sign-configurator' ), __( 'The five bundled fonts.', 'ahime-neon-sign-configurator' ), AHNS_Fonts::PAGE_SLUG ),
			array( 'palette', __( 'Colours', 'ahime-neon-sign-configurator' ), __( 'The tube palette you offer.', 'ahime-neon-sign-configurator' ), AHNS_Catalog::COLORS_SLUG ),
			array( 'tag', __( 'Pricing', 'ahime-neon-sign-configurator' ), __( 'Coefficients, sizes, tiers and simulator.', 'ahime-neon-sign-configurator' ), AHNS_Settings::PAGE_SLUG ),
			array( 'gear', __( 'Appearance', 'ahime-neon-sign-configurator' ), __( 'Brand colour, wording, logo and language.', 'ahime-neon-sign-configurator' ), AHNS_Appearance::PAGE_SLUG ),
			array( 'bolt', __( 'Announcements', 'ahime-neon-sign-configurator' ), __( 'Banners, popups and countdowns on your shop.', 'ahime-neon-sign-configurator' ), AHNS_Annonces::PAGE_SLUG ),
		);
		echo '<div class="ahns-grid">';
		foreach ( $cards as $card ) {
			printf(
				'<a class="ahns-card ahns-card--link" href="%s"><span class="ahns-card__icon">%s</span><h2>%s</h2><p class="ahns-hint" style="margin:0;">%s</p></a>',
				esc_url( admin_url( 'admin.php?page=' . $card[3] ) ),
				wp_kses( AHNS_Admin_UI::icon( $card[0] ), AHNS_Admin_UI::allowed_html() ),
				esc_html( $card[1] ),
				esc_html( $card[2] )
			);
		}
		echo '</div>';

		// --- Dernières commandes -----------------------------------------------
		$recent = self::recent_orders( 5 );
		AHNS_Admin_UI::card_open( __( 'Latest custom orders', 'ahime-neon-sign-configurator' ) );
		if ( empty( $recent ) ) {
			echo '<p class="ahns-hint" style="margin:0;">' . esc_html__( 'No orders yet. The first neon you sell will show up here.', 'ahime-neon-sign-configurator' ) . '</p>';
		} else {
			echo '<table class="widefat striped"><tbody>';
			foreach ( $recent as $row ) {
				echo '<tr>';
				printf( '<td style="width:120px;">%s</td>', wp_kses( $row['thumb'], AHNS_Admin_UI::allowed_html() ) );
				printf(
					'<td><a href="%s"><strong>#%s</strong></a> · %s<br /><span style="color:#6b7280;">%s</span></td>',
					esc_url( $row['url'] ),
					esc_html( $row['number'] ),
					esc_html( $row['date'] ),
					esc_html( $row['text'] )
				);
				printf( '<td style="width:120px;text-align:right;">%s</td>', esc_html( $row['status'] ) );
				echo '</tr>';
			}
			echo '</tbody></table>';
		}
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::close();
	}

	/**
	 * Dernières commandes contenant un néon.
	 *
	 * @param int $limit Nombre de lignes.
	 * @return array<int,array<string,string>>
	 */
	private static function recent_orders( $limit = 5 ) {
		if ( ! function_exists( 'wc_get_orders' ) ) {
			return array();
		}
		$rows = array();
		foreach ( (array) wc_get_orders( array( 'limit' => 60, 'orderby' => 'date', 'order' => 'DESC', 'type' => 'shop_order' ) ) as $order ) {
			if ( ! $order instanceof WC_Order ) {
				continue;
			}
			foreach ( $order->get_items() as $item ) {
				if ( ! AHNS_Order::is_neon_item( $item ) ) {
					continue;
				}
				$spec    = AHNS_Order::spec( $item );
				$thumb   = preg_match( '#^data:image/(png|jpeg);base64,#', $spec['preview'] )
					? sprintf( '<img src="%s" alt="" style="width:110px;height:auto;border-radius:6px;background:#101216;padding:3px;" />', esc_attr( $spec['preview'] ) )
					: '<span style="color:#9ca3af;">-</span>';
				$rows[] = array(
					'thumb'  => $thumb,
					'url'    => (string) $order->get_edit_order_url(),
					'number' => $order->get_order_number(),
					'date'   => $order->get_date_created() ? $order->get_date_created()->date_i18n( 'j M Y' ) : '',
					'text'   => '' !== $spec['text'] ? $spec['text'] : __( 'Custom logo', 'ahime-neon-sign-configurator' ),
					'status' => wc_get_order_status_name( $order->get_status() ),
				);
				break; // une ligne par commande suffit ici.
			}
			if ( count( $rows ) >= $limit ) {
				break;
			}
		}
		return $rows;
	}
}
