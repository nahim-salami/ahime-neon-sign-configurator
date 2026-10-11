<?php
/**
 * Catalogue de polices — le marchand choisit celles qu'il propose à ses clients.
 *
 * Le pack complet (polices Google sélectionnées, licences OFL/Apache) est livré
 * AVEC le plugin : fichiers WOFF2 dans `assets/fonts/` et métriques dans
 * `assets/font-metrics.json`. Le widget n'embarque qu'un petit jeu par défaut ;
 * les polices activées ici lui sont transmises par le contexte, avec leur URL
 * et leurs métriques.
 *
 * RAPPEL : les métriques (longueur de tracé par glyphe) déterminent le PRIX.
 * Une police sans métriques ne peut donc pas être proposée.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Fonts
 */
class AHNS_Fonts {

	const PAGE_SLUG = 'ahns-fonts';
	const OPTION    = 'ahns_fonts';
	const NONCE     = 'ahns_fonts_save';

	/** Polices proposées par défaut si le marchand n'a rien choisi. */
	const DEFAULTS = array( 'pacifico', 'great-vibes', 'lobster', 'poppins-bold', 'bebas-neue' );

	/** Libellés lisibles (le manifeste ne porte que des identifiants). */
	const LABELS = array(
		'pacifico'           => 'Pacifico',
		'great-vibes'        => 'Great Vibes',
		'sacramento'         => 'Sacramento',
		'yellowtail'         => 'Yellowtail',
		'satisfy'            => 'Satisfy',
		'courgette'          => 'Courgette',
		'lobster'            => 'Lobster',
		'dancing-script'     => 'Dancing Script',
		'caveat'             => 'Caveat',
		'kaushan-script'     => 'Kaushan Script',
		'allura'             => 'Allura',
		'parisienne'         => 'Parisienne',
		'cookie'             => 'Cookie',
		'alex-brush'         => 'Alex Brush',
		'grand-hotel'        => 'Grand Hotel',
		'norican'            => 'Norican',
		'permanent-marker'   => 'Permanent Marker',
		'amatic-sc'          => 'Amatic SC',
		'shadows-into-light' => 'Shadows Into Light',
		'poppins-bold'       => 'Poppins',
		'bebas-neue'         => 'Bebas Neue',
		'righteous'          => 'Righteous',
		'monoton'            => 'Monoton',
		'archivo-black'      => 'Archivo Black',
		'anton'              => 'Anton',
		'bungee'             => 'Bungee',
		'audiowide'          => 'Audiowide',
		'orbitron'           => 'Orbitron',
		'alfa-slab-one'      => 'Alfa Slab One',
		'titan-one'          => 'Titan One',
		'luckiest-guy'       => 'Luckiest Guy',
		'staatliches'        => 'Staatliches',
		'fredoka'            => 'Fredoka',
		'rubik-mono-one'     => 'Rubik Mono One',
	);

	/**
	 * @var array<string,array>|null Manifeste complet (cache de requête).
	 */
	private static $manifest = null;

	const CUSTOM_OPTION = 'ahns_custom_fonts';
	const UPLOAD_NONCE  = 'ahns_upload_font';

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 12 );
		add_action( 'admin_post_ahns_save_fonts', array( $this, 'handle_save' ) );
	}

	/**
	 * Analyse de police DANS LE NAVIGATEUR : opentype.js + le module de mesure
	 * PARTAGÉ avec le pipeline. Chargés uniquement sur l'écran Polices.
	 *
	 * @param string $hook Écran courant.
	 * @return void
	 */
	public static function custom_dir() {
		$up = wp_upload_dir();
		return array(
			'path' => trailingslashit( $up['basedir'] ) . 'ahns-fonts/',
			'url'  => trailingslashit( $up['baseurl'] ) . 'ahns-fonts/',
		);
	}

	/**
	 * Polices téléversées par le marchand : identifiant => {label, class, file, metrics}.
	 *
	 * @return array<string,array>
	 */
	public static function custom_fonts() {
		return array(); // Les polices du marchand font partie de la version complète.
	}

	/** Métriques des polices du marchand (fusionnées au manifeste pour le PRIX). */
	public static function custom_manifests() {
		$out = array();
		foreach ( self::custom_fonts() as $id => $font ) {
			if ( ! empty( $font['metrics']['glyphs'] ) ) {
				$out[ $id ] = $font['metrics'];
			}
		}
		return $out;
	}

	/**
	 * Réception d'une police téléversée : le FICHIER et son MANIFESTE, mesuré
	 * dans le navigateur par le même code que le pipeline (assets/vendor/
	 * measure-font.js). Le manifeste conditionnant le prix, il est revalidé ici.
	 *
	 * @return void
	 */
	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Fonts - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Fonts', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Manifeste complet du pack (identifiant → métriques). */
	public static function manifest() {
		if ( null === self::$manifest ) {
			$json           = @file_get_contents( AHNS_PLUGIN_DIR . 'assets/font-metrics.json' ); // phpcs:ignore
			$pack           = is_string( $json ) ? (array) json_decode( $json, true ) : array();
			// Les polices du marchand rejoignent le manifeste : le PRIX doit
			// pouvoir être calculé pour elles aussi.
			self::$manifest = array_merge( $pack, self::custom_manifests() );
		}
		return self::$manifest;
	}

	/** Identifiants disponibles dans le pack (ceux qui ont un WOFF2 ET des métriques). */
	public static function available() {
		$out = array();
		foreach ( self::manifest() as $id => $m ) {
			if ( file_exists( AHNS_PLUGIN_DIR . 'assets/fonts/' . $id . '.woff2' ) ) {
				$out[ $id ] = $m;
			}
		}
		// Polices téléversées par le marchand — mesurées dans le navigateur par
		// le même code que le pack, donc tarifables de la même façon.
		$dir = self::custom_dir();
		foreach ( self::custom_fonts() as $id => $font ) {
			if ( ! empty( $font['file'] ) && file_exists( $dir['path'] . $font['file'] ) && ! empty( $font['metrics']['glyphs'] ) ) {
				$out[ $id ] = $font['metrics'];
			}
		}
		return $out;
	}

	/** URL du fichier d'une police (pack ou téléversée). */
	public static function font_url( $id ) {
		$custom = self::custom_fonts();
		if ( isset( $custom[ $id ]['file'] ) ) {
			$dir = self::custom_dir();
			return $dir['url'] . $custom[ $id ]['file'];
		}
		return AHNS_PLUGIN_URL . 'assets/fonts/' . $id . '.woff2';
	}

	/** Libellé lisible d'une police (pack ou téléversée). */
	public static function font_label( $id ) {
		$custom = self::custom_fonts();
		if ( isset( $custom[ $id ]['label'] ) ) {
			return (string) $custom[ $id ]['label'];
		}
		return self::LABELS[ $id ] ?? $id;
	}

	/** Identifiants activés par le marchand (défaut : self::DEFAULTS). */
	public static function enabled_ids() {
		$saved     = (array) get_option( self::OPTION, array() );
		$available = self::available();
		$ids       = array();
		foreach ( (array) ( $saved['enabled'] ?? array() ) as $id ) {
			if ( isset( $available[ $id ] ) ) {
				$ids[] = (string) $id;
			}
		}
		if ( $ids ) {
			return $ids;
		}
		// Rien d'enregistré → jeu par défaut, borné à ce qui est réellement présent.
		return array_values( array_filter( self::DEFAULTS, static fn( $id ) => isset( $available[ $id ] ) ) );
	}

	/**
	 * Polices transmises au widget : identifiant, libellé, classe, URL du WOFF2
	 * et métriques. C'est ce qui permet au configurateur d'afficher — et de
	 * tarifer — exactement ce que le marchand a activé.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function for_widget() {
		$manifest = self::manifest();
		$out      = array();
		foreach ( self::enabled_ids() as $id ) {
			if ( empty( $manifest[ $id ] ) ) {
				continue;
			}
			$out[] = array(
				'id'      => $id,
				'label'   => self::font_label( $id ),
				'class'   => (string) ( $manifest[ $id ]['class'] ?? 'block' ),
				'url'     => self::font_url( $id ),
				'metrics' => self::alleger( $manifest[ $id ] ),
			);
		}
		return $out;
	}

	/**
	 * Retire du manifeste ce que le navigateur ne lira jamais.
	 *
	 * `pathLen` EST UN REPLI, PAS UNE DONNÉE.
	 *
	 * Les deux moteurs de mesure le disent de la même façon —
	 * `packages/core/src/metrics.ts:76` : `tubeUnits += g.medianLen ?? g.pathLen`,
	 * et son miroir PHP dans AHNS_Pricing::measure(). La ligne médiane fait foi ;
	 * `pathLen` ne sert qu'aux manifestes d'avant son introduction. Un glyphe
	 * qui a `medianLen` n'a donc aucune raison d'emporter `pathLen` jusqu'au
	 * navigateur.
	 *
	 * CE QUE ÇA PÈSE. Relevé sur la fiche produit du site de vérification :
	 * `window.__AHNS_CONTEXT__` faisait 232 Ko de JSON EN LIGNE dans le HTML,
	 * dont l'essentiel en métriques de police (33 polices × ~150 glyphes × 3
	 * nombres). En ligne, donc ni mis en cache ni partagé d'une page à l'autre :
	 * chaque visite d'une fiche le retéléchargeait en entier, et l'analyseur
	 * HTML s'arrêtait le temps de le lire.
	 *
	 * On ne touche PAS au manifeste stocké : il garde `pathLen`, et un manifeste
	 * ancien — sans `medianLen` — passe ici sans être amputé. C'est la charge
	 * envoyée au navigateur qui maigrit, pas la source.
	 *
	 * @param array $metrics Manifeste d'une police.
	 * @return array
	 */
	private static function alleger( array $metrics ) {
		if ( empty( $metrics['glyphs'] ) || ! is_array( $metrics['glyphs'] ) ) {
			return $metrics;
		}

		foreach ( $metrics['glyphs'] as $caractere => $glyphe ) {
			if ( ! is_array( $glyphe ) ) {
				continue;
			}
			if ( isset( $glyphe['medianLen'], $glyphe['pathLen'] ) ) {
				unset( $metrics['glyphs'][ $caractere ]['pathLen'] );
			}
			// `corners` NE SERT QU'À L'ATELIER : c'est le nombre d'angles du
			// tracé, donc de coupes et de soudures. Il part sur la fiche de
			// production, calculé côté serveur — le navigateur du visiteur n'en
			// fait rien. Même raisonnement que pour `pathLen`, et même
			// traitement que dans le manifeste embarqué du widget
			// (packages/core/scripts/build-fonts.mjs).
			//
			// `strokeW` reste, lui : c'est avec lui que le configurateur refuse
			// en direct une police trop fine pour le tube, pendant que le
			// client compose.
			unset( $metrics['glyphs'][ $caractere ]['corners'] );
		}

		return $metrics;
	}

	// -----------------------------------------------------------------------
	// Écran d'administration
	// -----------------------------------------------------------------------

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$available = self::available();
		$enabled   = array();
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- chaque entrée est filtrée ci-dessous.
		foreach ( ( isset( $_POST['fonts'] ) ? map_deep( (array) wp_unslash( $_POST['fonts'] ), 'sanitize_text_field' ) : array() ) as $id ) {
			$id = sanitize_text_field( (string) $id );
			if ( isset( $available[ $id ] ) ) {
				$enabled[] = $id;
			}
		}
		$sample = isset( $_POST['sample'] ) ? sanitize_text_field( wp_unslash( $_POST['sample'] ) ) : '';

		update_option(
			self::OPTION,
			array(
				'enabled' => $enabled,
				'sample'  => mb_substr( $sample, 0, 24 ),
			)
		);
		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$available = self::available();
		$enabled   = array_flip( self::enabled_ids() );
		$saved     = (array) get_option( self::OPTION, array() );
		$sample    = '' !== ( $saved['sample'] ?? '' ) ? (string) $saved['sample'] : get_bloginfo( 'name' );

		AHNS_Admin_UI::open(
			__( 'Fonts', 'ahime-neon-sign-configurator' ),
			sprintf(
				/* translators: %d: number of fonts. */ __( '%d fonts available (SIL Open Font License, bundled with the plugin). Tick the ones you want to offer to your customers.', 'ahime-neon-sign-configurator' ),
				count( $available )
			)
		);
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Selection saved - the configurator now offers these fonts only.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}
		if ( isset( $_GET['deleted'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Font deleted.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}
		AHNS_Admin_UI::card_open();
		/*
		 * LA PHRASE ENTIERE EST TRADUISIBLE, pas seulement le mot en gras.
		 * Elle etait ecrite en dur autour d un `esc_html__( 'mesuree' )` : sur
		 * une administration reglee en anglais, il restait donc une phrase
		 * francaise entiere au milieu de l ecran. Le gras devient un repere de
		 * format, ce qui laisse au traducteur le droit de le deplacer.
		 */
		printf(
			'<p class="ahns-hint" style="margin:0 0 12px;">%s</p>',
			wp_kses(
				sprintf(
					/* translators: %s : le mot « mesurée », mis en gras. */
					__( 'Every font is %s: it is the outline length of its letters that gives the metres of tube, and therefore the price. An unmeasured font cannot be offered.', 'ahime-neon-sign-configurator' ),
					'<strong>' . esc_html__( 'measured', 'ahime-neon-sign-configurator' ) . '</strong>'
				),
				array( 'strong' => array() )
			)
		);

		// Aperçus : les polices du pack, servies par le plugin.
		echo '<style>';
		foreach ( $available as $id => $m ) {
			printf(
				"@font-face{font-family:'AHNSPrev_%s';src:url('%s') format('woff2');font-display:swap;}",
				esc_attr( str_replace( '-', '_', $id ) ),
				esc_url( AHNS_PLUGIN_URL . 'assets/fonts/' . $id . '.woff2' )
			);
		}
		echo '.ahnsf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin:16px 0;max-width:1100px;}'
			. '.ahnsf-card{border:1.5px solid #dcdcde;border-radius:10px;padding:12px 14px;background:#fff;}'
			. '.ahnsf-card.on{border-color:#ec4899;background:#fdf2f8;}'
			. '.ahnsf-prev{display:block;font-size:26px;line-height:1.3;color:#111;margin:6px 0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
			. '.ahnsf-meta{font-size:11.5px;color:#666;}'
			. '.ahnsf-head{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;}'
			. '</style>';

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_fonts" />';
		wp_nonce_field( self::NONCE );

		printf(
			'<p><label>' . esc_html__( 'Preview text:', 'ahime-neon-sign-configurator' ) . ' <input type="text" name="sample" value="%s" class="regular-text" /></label></p>',
			esc_attr( $sample )
		);

		echo '<div class="ahnsf-grid">';
		foreach ( $available as $id => $m ) {
			$on    = isset( $enabled[ $id ] );
			$label = self::LABELS[ $id ] ?? $id;
			printf(
				'<label class="ahnsf-card%1$s"><span class="ahnsf-head"><input type="checkbox" name="fonts[]" value="%2$s"%3$s /> %4$s</span>'
				. '<span class="ahnsf-prev" style="font-family:\'AHNSPrev_%5$s\';">%6$s</span>'
				. '<span class="ahnsf-meta">' . /* translators: 7: font style (script or block), 8: number of measured characters. Placeholders 1 to 6 are used by the surrounding markup. */ esc_html__( '%7$s · %8$d glyphs measured', 'ahime-neon-sign-configurator' ) . '</span></label>',
				$on ? ' on' : '',
				esc_attr( $id ),
				checked( $on, true, false ),
				esc_html( $label ),
				esc_attr( str_replace( '-', '_', $id ) ),
				esc_html( $sample ),
				'script' === ( $m['class'] ?? '' ) ? esc_html__( 'Script', 'ahime-neon-sign-configurator' ) : esc_html__( 'Sans', 'ahime-neon-sign-configurator' ),
				count( (array) ( $m['glyphs'] ?? array() ) )
			);
		}
		echo '</div>';

		echo '<p style="color:#666;">' . esc_html__( 'If you tick nothing, the configurator falls back to a default set - it is never left without a font.', 'ahime-neon-sign-configurator' ) . '</p>';
		submit_button( __( 'Save fonts', 'ahime-neon-sign-configurator' ) );
		echo '</form>';

		echo '<script>document.addEventListener("change",function(e){var c=e.target.closest(".ahnsf-card");if(c&&e.target.type==="checkbox"){c.classList.toggle("on",e.target.checked);}});</script>';

		AHNS_Admin_UI::card_close();
		AHNS_Admin_UI::close();
		echo '</div>';
	}
}
