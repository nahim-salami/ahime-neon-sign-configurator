<?php
/**
 * Aide & assistant (docs/07 §2.9) — relancer l'assistant, la mise en route en
 * quatre étapes, et un diagnostic qui répond à « pourquoi ça ne marche pas ? »
 * sans avoir à ouvrir un fichier de journal.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Help
 */
class AHNS_Help {

	const PAGE_SLUG = 'ahns-help';

	/** Le support de la version gratuite : le forum de l'extension sur WordPress.org. */
	const SUPPORT_URL = 'https://wordpress.org/support/plugin/ahime-neon-sign-configurator/';

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 16 );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Help - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Help', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Le dossier est-il RÉELLEMENT accessible en écriture ?
	 *
	 * `is_writable()` ment sur OneDrive et sur certains partages Windows : il
	 * répond « non » là où l'écriture passe. On tranche donc en écrivant pour de
	 * bon un fichier témoin, aussitôt supprimé.
	 *
	 * @param string $dir Dossier à tester (créé au besoin).
	 * @return bool
	 */
	private static function really_writable( $dir ) {
		if ( ! file_exists( $dir ) && ! wp_mkdir_p( $dir ) ) {
			return false;
		}
		if ( ! wp_is_writable( $dir ) ) {
			return false;
		}
		$probe = trailingslashit( $dir ) . '.ahns-write-test';
		$ok    = false !== file_put_contents( $probe, 'ok' ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- sonde d'une écriture réelle, effacée aussitôt.
		if ( $ok ) {
			wp_delete_file( $probe );
		}
		return $ok;
	}

	/**
	 * Points de contrôle : libellé, verdict, détail.
	 *
	 * @return array<int,array{label:string,ok:bool,detail:string}>
	 */
	public static function diagnostics() {
		$page_id   = (int) get_option( AHNS_Page::OPTION, 0 );
		$page_ok   = $page_id > 0 && 'publish' === get_post_status( $page_id );
		$product   = AHNS_Configurator::default_product_id();
		$enabled   = count( AHNS_Fonts::enabled_ids() );
		$fonts_dir = AHNS_Fonts::custom_dir()['path'];

		return array(
			array(
				'label'  => __( 'Plugin version', 'ahime-neon-sign-configurator' ),
				'ok'     => true,
				'detail' => AHNS_VERSION . ' · WooCommerce ' . ( defined( 'WC_VERSION' ) ? WC_VERSION : 'absent' ) . ', PHP ' . PHP_VERSION,
			),
			array(
				'label'  => __( 'Fonts', 'ahime-neon-sign-configurator' ),
				'ok'     => $enabled > 0,
				'detail' => sprintf( /* translators: %d: number of fonts. */ __( '%d font(s) offered to customers.', 'ahime-neon-sign-configurator' ), $enabled ),
			),
			array(
				'label'  => __( 'Fonts folder', 'ahime-neon-sign-configurator' ),
				'ok'     => self::really_writable( $fonts_dir ),
				'detail' => $fonts_dir,
			),
			array(
				'label'  => __( 'Configurator page', 'ahime-neon-sign-configurator' ),
				'ok'     => $page_ok,
				'detail' => $page_ok ? (string) get_permalink( $page_id ) : __( 'No page published.', 'ahime-neon-sign-configurator' ),
			),
			array(
				'label'  => __( 'Billed product', 'ahime-neon-sign-configurator' ),
				'ok'     => $product > 0,
				'detail' => $product > 0 ? sprintf( '#%d · %s', $product, get_the_title( $product ) ) : __( 'None: the configurator is running in demo mode.', 'ahime-neon-sign-configurator' ),
			),
			array(
				'label'  => __( 'Workshop e-mail', 'ahime-neon-sign-configurator' ),
				'ok'     => '' !== AHNS_Order::production_email(),
				'detail' => '' !== AHNS_Order::production_email() ? AHNS_Order::production_email() : __( 'Not set: nobody receives the manufacturing specification.', 'ahime-neon-sign-configurator' ),
			),
		);
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$checks  = self::diagnostics();
		$ko      = count( array_filter( $checks, static fn( $c ) => ! $c['ok'] ) );
		$actions = class_exists( 'AHNS_Onboarding' )
			? AHNS_Admin_UI::button( __( 'Run the wizard again', 'ahime-neon-sign-configurator' ), AHNS_Onboarding::url(), 'on-accent' )
			: '';

		AHNS_Admin_UI::open(
			__( 'Help & setup wizard', 'ahime-neon-sign-configurator' ),
			0 === $ko ? __( 'Every check is green.', 'ahime-neon-sign-configurator' ) : sprintf( /* translators: %d: number of checks to fix. */ __( '%d item(s) need your attention.', 'ahime-neon-sign-configurator' ), $ko ),
			$actions
		);

		// --- Mise en route -----------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Getting started in four steps', 'ahime-neon-sign-configurator' ) );
		$steps = array(
			array( __( 'Create the configurator page', 'ahime-neon-sign-configurator' ), __( 'Configurator screen: one button creates and publishes it for you.', 'ahime-neon-sign-configurator' ) ),
			array( __( 'Link the billed product', 'ahime-neon-sign-configurator' ), __( 'It is the one that carries the calculated price when the neon is added to the cart.', 'ahime-neon-sign-configurator' ) ),
			array( __( 'Choose fonts, colours and backings', 'ahime-neon-sign-configurator' ), __( 'The customer only sees what you offer - and the server refuses the rest.', 'ahime-neon-sign-configurator' ) ),
			array( __( 'Check your pricing', 'ahime-neon-sign-configurator' ), __( 'The simulator breaks the calculation down: tube, material, power supply, options.', 'ahime-neon-sign-configurator' ) ),
		);
		echo '<ul class="ahns-checklist">';
		foreach ( $steps as $i => $step ) {
			printf(
				'<li><span class="ahns-check-ico ahns-check-ico--todo">%d</span><span class="ahns-check-body"><strong>%s</strong><span>%s</span></span></li>',
				(int) ( $i + 1 ),
				esc_html( $step[0] ),
				esc_html( $step[1] )
			);
		}
		echo '</ul>';
		printf(
			'<p style="margin:14px 0 0;">%s %s</p>',
			wp_kses( AHNS_Admin_UI::button( __( 'Go to the dashboard', 'ahime-neon-sign-configurator' ), admin_url( 'admin.php?page=' . AHNS_Dashboard::PAGE_SLUG ), 'primary' ), AHNS_Admin_UI::allowed_html() ),
			wp_kses( AHNS_Admin_UI::button( __( 'Contact support', 'ahime-neon-sign-configurator' ), self::SUPPORT_URL, 'ghost', array( 'target' => '_blank', 'rel' => 'noopener' ) ), AHNS_Admin_UI::allowed_html() )
		);
		AHNS_Admin_UI::card_close();

		// --- Conformité (chantier E) ------------------------------------------
		//
		// CE QUE CETTE CARTE DIT, ET POURQUOI ELLE EXISTE.
		//
		// La fiche technique sort deja trois lignes « A FAIRE TRANCHER » — c'est
		// leur bonne reponse, et une valeur inventee sur un document de conformite
		// serait pire qu'un vide.
		//
		// Mais s'arreter la REPORTE LE PROBLEME sur quelqu'un qui ne sait pas
		// qu'il l'a : en installant cette extension, le marchand devient le
		// FABRICANT au sens de la reglementation. C'est lui qui signe, lui qui
		// conserve dix ans, lui qui repond a un controle — et il l'apprend
		// rarement en lisant une fiche produit.
		AHNS_Admin_UI::card_open( __( 'Compliance: what falls to you', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">'
			. esc_html__( 'By selling under your own name you are the MANUFACTURER in the regulatory sense: you affix the CE marking, you sign the EU declaration of conformity, and you keep a technical file for ten years. This plugin gives you the production parts and the dimensions; it does not sign on your behalf.', 'ahime-neon-sign-configurator' )
			. '</p>';
		$conformite = array(
			array(
				__( 'Declare your components', 'ahime-neon-sign-configurator' ),
				__( 'Spools, drivers, timers: without identified part numbers, no declaration holds up.', 'ahime-neon-sign-configurator' ),
			),
			array(
				__( 'Gather your suppliers’ datasheets', 'ahime-neon-sign-configurator' ),
				__( 'Including the photobiological risk group (EN 62471): it is read off their documentation, it cannot be inferred.', 'ahime-neon-sign-configurator' ),
			),
			array(
				__( 'Write your risk assessment', 'ahime-neon-sign-configurator' ),
				__( 'Electrical, thermal, mechanical, photobiological: this is what an inspection asks for first.', 'ahime-neon-sign-configurator' ),
			),
			array(
				__( 'Buy the standards at the right time', 'ahime-neon-sign-configurator' ),
				__( 'Nine standards, none of them free to download. There is no rush until you open the declaration; at that point, five are unavoidable.', 'ahime-neon-sign-configurator' ),
			),
			array(
				__( 'Get the three open points settled', 'ahime-neon-sign-configurator' ),
				__( 'EPREL labelling, photobiological risk group, EU declaration: they come out of the datasheet marked “TO BE SETTLED”, and that is the right answer for them.', 'ahime-neon-sign-configurator' ),
			),
			array(
				__( 'Don’t forget French law', 'ahime-neon-sign-configurator' ),
				__( 'Mayoral authorisation, night switch-off (1 a.m. to 6 a.m.), local outdoor advertising tax, two-year statutory warranty.', 'ahime-neon-sign-configurator' ),
			),
		);
		echo '<ul class="ahns-checklist">';
		foreach ( $conformite as $i => $point ) {
			printf(
				'<li><span class="ahns-check-ico ahns-check-ico--todo">%d</span><span class="ahns-check-body"><strong>%s</strong><span>%s</span></span></li>',
				(int) ( $i + 1 ),
				esc_html( $point[0] ),
				esc_html( $point[1] )
			);
		}
		echo '</ul>';
		echo '<p class="ahns-hint" style="margin-top:12px;">'
			. esc_html__( 'This is not legal advice: it is what the source documents allow us to state, and what they do not. The three open points need a certification body, not a careful re-read.', 'ahime-neon-sign-configurator' )
			. '</p>';
		AHNS_Admin_UI::card_close();

		// --- Diagnostic --------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Diagnostics', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Copy this table if you write to us: it holds everything needed to understand your setup.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="widefat striped"><tbody>';
		foreach ( $checks as $check ) {
			printf(
				'<tr><td style="width:210px;"><strong>%s</strong></td><td style="width:90px;">%s</td><td style="word-break:break-all;color:#4b5563;">%s</td></tr>',
				esc_html( $check['label'] ),
				wp_kses( AHNS_Admin_UI::badge( $check['ok'] ? 'OK' : __( 'Check', 'ahime-neon-sign-configurator' ), $check['ok'] ? 'ok' : 'todo' ), AHNS_Admin_UI::allowed_html() ),
				esc_html( $check['detail'] )
			);
		}
		echo '</tbody></table>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::close();
	}
}
