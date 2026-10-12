<?php
/**
 * Réglages marchand : coefficients de prix éditables + SIMULATEUR — trois
 * designs-témoins re-tarifés en direct avec les coefficients effectifs, pour
 * voir l'impact d'un changement avant qu'un client ne le voie.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Settings
 */
class AHNS_Settings {

	const PAGE_SLUG = 'ahns-settings';
	const OPTION    = 'ahns_settings';
	const NONCE     = 'ahns_settings_save';

	/** Champs éditables : clé coefficient => [libellé, unité, facteur d'affichage]. */
	const FIELDS = array(
		'baseCents'         => array( 'Setup fee', '€', 100 ),
		'tubePerMeterCents' => array( 'LED tube', '€/m', 100 ),
		'dimmerRemoteCents' => array( 'Remote + dimmer', '€', 100 ),
		'nightTimerCents'   => array( 'Night timer', '€', 100 ),
		'warrantyIndoorMonths'  => array( 'Commercial warranty, indoor', 'months', 1 ),
		'warrantyOutdoorMonths' => array( 'Commercial warranty, outdoor', 'months', 1 ),
		'parcelMaxLengthCm'     => array( 'Parcel: max length', 'cm', 1 ),
		'parcelMaxWidthCm'      => array( 'Parcel: max width', 'cm', 1 ),
		'rgbFlatCents'      => array( 'RGB option', '€', 100 ),
		'outdoorMultiplier' => array( 'Outdoor IP67 multiplier', '×', 1 ),
		'expressMultiplier' => array( 'Rush multiplier', '×', 1 ),
		'leadTimeMinDays'        => array( 'Standard lead time: min', 'd', 1 ),
		'leadTimeMaxDays'        => array( 'Standard lead time: max', 'd', 1 ),
		'leadTimeExpressMinDays' => array( 'Express lead time: min', 'd', 1 ),
		'leadTimeExpressMaxDays' => array( 'Express lead time: max', 'd', 1 ),
	);

	/** Designs-témoins du simulateur (les mêmes familles que les tests du core). */
	const WITNESSES = array(
		array(
			'label'  => 'Script first name “Léa” (20 cm, clear contour)',
			'config' => array(
				'kind'           => 'text',
				'lines'          => array( array( 'text' => 'Léa', 'fontId' => 'pacifico', 'colorHex' => '#ff5aa7' ) ),
				'letterHeightCm' => 20,
				'colorMode'      => 'solid',
				'support'        => array( 'type' => 'contour', 'finish' => 'clear' ),
				'environment'    => 'indoor',
				'powerRegion'    => 'EU',
				'mounting'       => 'screws',
				'options'        => array( 'dimmerRemote' => false, 'express' => false ),
			),
		),
		array(
			'label'  => '“Open / 24-7”, 2 RGB lines (25 cm, black rectangle)',
			'config' => array(
				'kind'           => 'text',
				'lines'          => array(
					array( 'text' => 'Open', 'fontId' => 'poppins-bold', 'colorHex' => '#ffffff' ),
					array( 'text' => '24/7', 'fontId' => 'poppins-bold', 'colorHex' => '#ffffff' ),
				),
				'letterHeightCm' => 25,
				'colorMode'      => 'rgb',
				'support'        => array( 'type' => 'rectangle', 'finish' => 'black' ),
				'environment'    => 'indoor',
				'powerRegion'    => 'EU',
				'mounting'       => 'screws',
				'options'        => array( 'dimmerRemote' => true, 'express' => false ),
			),
		),
		array(
			'label'  => '“PIZZA NAPOLI” outdoor sign, express (30 cm, light box)',
			'config' => array(
				'kind'           => 'text',
				'lines'          => array( array( 'text' => 'PIZZA NAPOLI', 'fontId' => 'poppins-bold', 'colorHex' => '#ffd60a' ) ),
				'letterHeightCm' => 30,
				'colorMode'      => 'solid',
				'support'        => array( 'type' => 'box', 'finish' => 'clear' ),
				'environment'    => 'outdoor',
				'powerRegion'    => 'EU',
				'mounting'       => 'screws',
				'options'        => array( 'dimmerRemote' => false, 'express' => true ),
			),
		),
	);

	/** Presets de tailles réglés par le marchand (défaut : S/M/L/XL). */
	public static function size_presets() {
		$opt = (array) get_option( self::OPTION, array() );
		$out = array();
		foreach ( (array) ( $opt['sizePresets'] ?? array() ) as $p ) {
			if ( ! empty( $p['label'] ) && ! empty( $p['letterHeightCm'] ) ) {
				$out[] = array( 'label' => (string) $p['label'], 'letterHeightCm' => (float) $p['letterHeightCm'] );
			}
		}
		if ( $out ) {
			return $out;
		}
		return array(
			array( 'label' => 'S', 'letterHeightCm' => 12 ),
			array( 'label' => 'M', 'letterHeightCm' => 18 ),
			array( 'label' => 'L', 'letterHeightCm' => 25 ),
			array( 'label' => 'XL', 'letterHeightCm' => 35 ),
		);
	}

	/** Bornes du curseur libre (cm). */
	public static function size_bounds() {
		$opt = (array) get_option( self::OPTION, array() );
		$b   = (array) ( $opt['sizeBounds'] ?? array() );
		$min = isset( $b['minCm'] ) ? (float) $b['minCm'] : 8;
		$max = isset( $b['maxCm'] ) ? (float) $b['maxCm'] : 60;
		return array( 'minCm' => $min, 'maxCm' => max( $min + 1, $max ) );
	}

	/** Paliers de prix enregistrés (bruts, pour le formulaire). */
	public static function size_tiers() {
		$opt = (array) get_option( self::OPTION, array() );
		return array_values( (array) ( $opt['sizeTiers'] ?? array() ) );
	}

	/**
	 * EST-CE PRÊT À VENDRE ? (chantier A6) — miroir de `etatDuParc`.
	 *
	 * Un intégrateur installe l'extension, passe l'assistant, ouvre sa boutique
	 * — et vend un programmateur à 19 €, un prix que personne n'a vérifié et qui
	 * vient de nous. Les fiches de composants ne servent à rien s'il ne sait pas
	 * lesquelles il lui manque.
	 *
	 * ON AVERTIT, ON NE CASSE PAS. Masquer une option vendue depuis six mois
	 * casserait la boutique d'un client au lieu de l'aider : cet état est
	 * affiché, il ne bloque rien.
	 *
	 * L'ordre va de l'urgent au tolérable — ce que le dépôt ne peut pas
	 * défendre d'abord.
	 *
	 * @return array[] Postes : cle, libelle, origine, raison.
	 */
	public static function etat_du_parc() {
		$opt          = (array) get_option( self::OPTION, array() );
		$timers       = (array) ( $opt['timers'] ?? array() );
		$transporteur = (array) ( $opt['transporteur'] ?? array() );
		$psus         = (array) ( $opt['psus'] ?? array() );
		$tubes        = (array) ( $opt['tubes'] ?? array() );

		$a_un_prix = static function ( $liste ) {
			foreach ( $liste as $e ) {
				if ( isset( $e['priceCents'] ) ) {
					return true;
				}
			}
			return false;
		};

		$postes = array();
		$ok     = $a_un_prix( $timers );
		$postes[] = array(
			'cle'     => 'programmateur',
			'libelle' => __( 'Night timer', 'ahime-neon-sign-configurator' ),
			'origine' => $ok ? 'declare' : 'defaut-non-source',
			'raison'  => $ok ? '' : __( 'The default price has no source, and a night switch-off can be a legal requirement: this is the worst place in the price list for a figure nobody has checked.', 'ahime-neon-sign-configurator' ),
		);
		$ok = ! empty( $transporteur['maxLongueurCm'] ) && ! empty( $transporteur['maxLargeurCm'] );
		$postes[] = array(
			'cle'     => 'transporteur',
			'libelle' => __( 'Carrier', 'ahime-neon-sign-configurator' ),
			'origine' => $ok ? 'declare' : 'defaut-non-source',
			'raison'  => $ok ? '' : __( 'The default parcel limits come from a competitor, taken from their site. A pallet and a parcel service do not have the same limits.', 'ahime-neon-sign-configurator' ),
		);
		$ok = $a_un_prix( $psus );
		$postes[] = array(
			'cle'     => 'alimentation',
			'libelle' => __( 'Power supply', 'ahime-neon-sign-configurator' ),
			'origine' => $ok ? 'declare' : 'defaut-source',
			'raison'  => $ok ? '' : __( 'The power brackets hold up, but they don’t follow what you actually buy, and nothing checks that a 24 V driver isn’t shipped with a 12 V tube.', 'ahime-neon-sign-configurator' ),
		);
		$ok = ! empty( $tubes );
		$postes[] = array(
			'cle'     => 'tube',
			'libelle' => __( 'Tube spools', 'ahime-neon-sign-configurator' ),
			'origine' => $ok ? 'declare' : 'defaut-source',
			'raison'  => $ok ? '' : __( 'The general setting applies to every colour. A pink and a warm white have neither the same efficiency nor the same purchase price.', 'ahime-neon-sign-configurator' ),
		);
		return $postes;
	}

	/** Catalogue de programmateurs enregistré (brut, pour le formulaire). */
	public static function timers() {
		$opt = (array) get_option( self::OPTION, array() );
		return array_values( (array) ( $opt['timers'] ?? array() ) );
	}

	/** Grille de prix par lettre enregistrée (brute, pour le formulaire). */
	public static function grille_lettres() {
		$opt = (array) get_option( self::OPTION, array() );
		return array_values( (array) ( $opt['grilleLettres'] ?? array() ) );
	}

	/** Fiche du transporteur enregistrée (brute, pour le formulaire). */
	public static function transporteur() {
		$opt = (array) get_option( self::OPTION, array() );
		return (array) ( $opt['transporteur'] ?? array() );
	}

	/** Catalogue d'alimentations enregistré (brut, pour le formulaire). */
	public static function psus() {
		$opt = (array) get_option( self::OPTION, array() );
		return array_values( (array) ( $opt['psus'] ?? array() ) );
	}

	/** Catalogue de tubes enregistré (brut, pour le formulaire). */
	public static function tubes() {
		$opt = (array) get_option( self::OPTION, array() );
		return array_values( (array) ( $opt['tubes'] ?? array() ) );
	}

	public function hooks() {
		// 14 : apres Supports (13), avant Apparence (15).
		add_action( 'admin_menu', array( $this, 'add_menu' ), 14 );
		add_action( 'admin_post_ahns_save_settings', array( $this, 'handle_save' ) );
	}

	public function add_menu() {
		// Le menu de premier niveau appartient désormais au tableau de bord
		// (AHNS_Dashboard) ; les tarifs sont un écran parmi les autres.
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Pricing - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Pricing', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$saved = array();
		foreach ( self::FIELDS as $key => $def ) {
			if ( ! isset( $_POST[ $key ] ) || '' === trim( sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) ) ) {
				continue; // vide = valeur par défaut.
			}
			$value = (float) str_replace( ',', '.', sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) );
			$saved[ $key ] = 100 === $def[2] ? (int) round( $value * 100 ) : $value;
		}
		$saved['marketingRounding'] = ! empty( $_POST['marketingRounding'] );

		// --- Presets de tailles (libellé + hauteur de lettre) ---------------
		$presets = array();
		$labels  = isset( $_POST['preset_label'] ) ? map_deep( (array) wp_unslash( $_POST['preset_label'] ), 'sanitize_text_field' ) : array();
		$heights = isset( $_POST['preset_cm'] ) ? map_deep( (array) wp_unslash( $_POST['preset_cm'] ), 'sanitize_text_field' ) : array();
		foreach ( $labels as $i => $label ) {
			$label = sanitize_text_field( (string) $label );
			$cm    = isset( $heights[ $i ] ) ? (float) str_replace( ',', '.', (string) $heights[ $i ] ) : 0;
			if ( '' === $label || $cm <= 0 || $cm > 300 ) {
				continue;
			}
			$presets[] = array( 'label' => mb_substr( $label, 0, 12 ), 'letterHeightCm' => $cm );
		}

		// --- Bornes du curseur libre ---------------------------------------
		$min = isset( $_POST['size_min'] ) ? (float) str_replace( ',', '.', sanitize_text_field( wp_unslash( $_POST['size_min'] ) ) ) : 8;
		$max = isset( $_POST['size_max'] ) ? (float) str_replace( ',', '.', sanitize_text_field( wp_unslash( $_POST['size_max'] ) ) ) : 60;
		$min = max( 5, min( 100, $min ) );
		$max = max( $min + 1, min( 300, $max ) );

		// --- Paliers de prix par taille -------------------------------------
		$tiers  = array();
		$widths = isset( $_POST['tier_width'] ) ? map_deep( (array) wp_unslash( $_POST['tier_width'] ), 'sanitize_text_field' ) : array();
		$modes  = isset( $_POST['tier_mode'] ) ? map_deep( (array) wp_unslash( $_POST['tier_mode'] ), 'sanitize_text_field' ) : array();
		$amts   = isset( $_POST['tier_amount'] ) ? map_deep( (array) wp_unslash( $_POST['tier_amount'] ), 'sanitize_text_field' ) : array();
		foreach ( $widths as $i => $w ) {
			$w   = (float) str_replace( ',', '.', (string) $w );
			$amt = isset( $amts[ $i ] ) ? (float) str_replace( ',', '.', (string) $amts[ $i ] ) : 0;
			if ( $w <= 0 || $amt <= 0 ) {
				continue;
			}
			$tiers[] = array(
				'maxWidthCm' => $w,
				'mode'       => ( isset( $modes[ $i ] ) && 'floor' === $modes[ $i ] ) ? 'floor' : 'surcharge',
				'cents'      => (int) round( $amt * 100 ),
			);
		}
		$saved['sizeTiers'] = $tiers;

		// --- Catalogue de tubes (écart E02) ----------------------------------
		//
		// Une couleur n'est pas un hexadécimal, c'est une bobine : elle a un
		// prix d'achat, une puissance, un aspect éteint. Les champs laissés
		// vides valent « comme le réglage général » — JAMAIS zéro. Un tube à
		// zéro centime, ce serait un néon offert ; un tube à zéro watt, une
		// alimentation sous-dimensionnée.
		$tubes    = array();
		$t_sku    = isset( $_POST['tube_sku'] ) ? map_deep( (array) wp_unslash( $_POST['tube_sku'] ), 'sanitize_text_field' ) : array();
		$t_label  = isset( $_POST['tube_label'] ) ? map_deep( (array) wp_unslash( $_POST['tube_label'] ), 'sanitize_text_field' ) : array();
		$t_lit    = isset( $_POST['tube_lit'] ) ? map_deep( (array) wp_unslash( $_POST['tube_lit'] ), 'sanitize_text_field' ) : array();
		$t_off    = isset( $_POST['tube_off'] ) ? map_deep( (array) wp_unslash( $_POST['tube_off'] ), 'sanitize_text_field' ) : array();
		$t_prix   = isset( $_POST['tube_prix'] ) ? map_deep( (array) wp_unslash( $_POST['tube_prix'] ), 'sanitize_text_field' ) : array();
		$t_watts  = isset( $_POST['tube_watts'] ) ? map_deep( (array) wp_unslash( $_POST['tube_watts'] ), 'sanitize_text_field' ) : array();
		$t_profil = isset( $_POST['tube_profil'] ) ? map_deep( (array) wp_unslash( $_POST['tube_profil'] ), 'sanitize_text_field' ) : array();
		$t_lm     = isset( $_POST['tube_lm'] ) ? map_deep( (array) wp_unslash( $_POST['tube_lm'] ), 'sanitize_text_field' ) : array();
		$t_mode   = isset( $_POST['tube_mode'] ) ? map_deep( (array) wp_unslash( $_POST['tube_mode'] ), 'sanitize_text_field' ) : array();
		$t_diam   = isset( $_POST['tube_diam'] ) ? map_deep( (array) wp_unslash( $_POST['tube_diam'] ), 'sanitize_text_field' ) : array();
		$t_ctrl   = isset( $_POST['tube_ctrl'] ) ? map_deep( (array) wp_unslash( $_POST['tube_ctrl'] ), 'sanitize_text_field' ) : array();
		$nombre   = static function ( $v ) {
			return ( '' === trim( (string) $v ) ) ? null : (float) str_replace( ',', '.', (string) $v );
		};
		foreach ( $t_sku as $i => $sku ) {
			$sku = sanitize_text_field( (string) $sku );
			$lit = isset( $t_lit[ $i ] ) ? trim( (string) $t_lit[ $i ] ) : '';
			// Une ligne sans référence ou sans couleur allumée n'est pas une
			// bobine : c'est une ligne vide du formulaire, on l'ignore.
			if ( '' === $sku || ! preg_match( '/^#?[0-9a-fA-F]{6}$/', $lit ) ) {
				continue;
			}
			$entree = array( 'sku' => mb_substr( $sku, 0, 64 ), 'litHex' => $lit );
			if ( isset( $t_label[ $i ] ) && '' !== trim( (string) $t_label[ $i ] ) ) {
				$entree['label'] = mb_substr( sanitize_text_field( (string) $t_label[ $i ] ), 0, 80 );
			}
			$off = isset( $t_off[ $i ] ) ? trim( (string) $t_off[ $i ] ) : '';
			if ( preg_match( '/^#?[0-9a-fA-F]{6}$/', $off ) ) {
				$entree['offHex'] = $off;
			}
			$prix = isset( $t_prix[ $i ] ) ? $nombre( $t_prix[ $i ] ) : null;
			if ( null !== $prix && $prix > 0 ) {
				$entree['tubePerMeterCents'] = (int) round( $prix * 100 );
			}
			$watts = isset( $t_watts[ $i ] ) ? $nombre( $t_watts[ $i ] ) : null;
			if ( null !== $watts && $watts > 0 ) {
				$entree['wattsPerMeter'] = $watts;
			}
			if ( isset( $t_profil[ $i ] ) && '' !== trim( (string) $t_profil[ $i ] ) ) {
				$entree['profile'] = mb_substr( sanitize_text_field( (string) $t_profil[ $i ] ), 0, 32 );
			}
			// Le flux décide de l'étiquette « vitrine » (besoin B18). Vide, la
			// bobine n'en reçoit PAS : on ne promet pas une luminosité qu'on
			// n'a pas mesurée.
			$lm = isset( $t_lm[ $i ] ) ? $nombre( $t_lm[ $i ] ) : null;
			if ( null !== $lm && $lm > 0 ) {
				$entree['lumensPerMeter'] = $lm;
			}
			// Ce que la bobine sait faire. « — » signifie « non renseigné », ce
			// qui n'est PAS « une seule couleur » : une bobine muette ne doit
			// pas faire refuser une commande RGB par excès de zèle.
			if ( isset( $t_mode[ $i ] ) && in_array( (string) $t_mode[ $i ], array( 'solid', 'rgb', 'spi' ), true ) ) {
				$entree['mode'] = (string) $t_mode[ $i ];
			}
			$ctrl = isset( $t_ctrl[ $i ] ) ? $nombre( $t_ctrl[ $i ] ) : null;
			if ( null !== $ctrl && $ctrl > 0 ) {
				$entree['controllerCents'] = (int) round( $ctrl * 100 );
			}
			/*
			 * LE DIAMETRE DE LA BOBINE (ecart E28).
			 *
			 * docs/02 §2 vend « tube LED 8 mm (fin), 10 mm (standard) — choix
			 * marchand par catalogue », et le catalogue n'avait aucun champ pour
			 * le dire. Vide, la bobine prend le Ø de la boutique : c'est le cas
			 * de toutes les references deja saisies, qui ne doivent pas bouger.
			 *
			 * Borne a 30 mm : au-dela ce n'est plus du neon flex, c'est une
			 * saisie fausse — et un diametre absurde ne fait pas une erreur
			 * visible, il fait une hauteur minimale absurde.
			 */
			$diam = isset( $t_diam[ $i ] ) ? $nombre( $t_diam[ $i ] ) : null;
			if ( null !== $diam && $diam > 0 && $diam <= 30 ) {
				$entree['diameterMm'] = $diam;
			}
			$tubes[] = $entree;
		}
		$saved['tubes'] = $tubes;

		// --- Catalogue d'ALIMENTATIONS (chantier A1) -------------------------
		//
		// Meme discipline que les tubes : une ligne sans reference est ignoree,
		// et un champ vide vaut « comme le reglage general », jamais zero.
		//
		// La PUISSANCE et la TENSION sont les deux seuls champs obligatoires.
		// Sans eux on ne peut ni choisir le bloc ni verifier qu'il va sur ce
		// tube — et c'est cette verification qui remplace un oeil humain a
		// chaque commande.
		$psus     = array();
		$psu_sku  = ( isset( $_POST['psu_sku'] ) ? map_deep( (array) wp_unslash( $_POST['psu_sku'] ), 'sanitize_text_field' ) : array() );
		$psu_lib  = ( isset( $_POST['psu_label'] ) ? map_deep( (array) wp_unslash( $_POST['psu_label'] ), 'sanitize_text_field' ) : array() );
		$psu_w    = ( isset( $_POST['psu_watts'] ) ? map_deep( (array) wp_unslash( $_POST['psu_watts'] ), 'sanitize_text_field' ) : array() );
		$psu_v    = ( isset( $_POST['psu_volt'] ) ? map_deep( (array) wp_unslash( $_POST['psu_volt'] ), 'sanitize_text_field' ) : array() );
		$psu_ip   = ( isset( $_POST['psu_ip'] ) ? map_deep( (array) wp_unslash( $_POST['psu_ip'] ), 'sanitize_text_field' ) : array() );
		$psu_prix = ( isset( $_POST['psu_prix'] ) ? map_deep( (array) wp_unslash( $_POST['psu_prix'] ), 'sanitize_text_field' ) : array() );
		$psu_dim  = ( isset( $_POST['psu_dim'] ) ? map_deep( (array) wp_unslash( $_POST['psu_dim'] ), 'sanitize_text_field' ) : array() );
		foreach ( $psu_sku as $i => $sku ) {
			$sku = sanitize_text_field( wp_unslash( (string) $sku ) );
			$w   = (float) ( $psu_w[ $i ] ?? 0 );
			$v   = (int) ( $psu_v[ $i ] ?? 0 );
			if ( '' === $sku || $w <= 0 || ( 12 !== $v && 24 !== $v ) ) {
				continue;
			}
			$entree = array(
				'sku'          => substr( $sku, 0, 64 ),
				'wattsNominal' => $w,
				'voltage'      => $v,
			);
			$lib = sanitize_text_field( wp_unslash( (string) ( $psu_lib[ $i ] ?? '' ) ) );
			if ( '' !== $lib ) {
				$entree['label'] = substr( $lib, 0, 80 );
			}
			$ip = strtoupper( trim( (string) ( $psu_ip[ $i ] ?? '' ) ) );
			if ( preg_match( '/^IP\d\d$/', $ip ) ) {
				$entree['ip'] = $ip;
			}
			$prix = (float) ( $psu_prix[ $i ] ?? 0 );
			if ( $prix > 0 ) {
				$entree['priceCents'] = (int) round( $prix * 100 );
			}
			// La case decoche NE VAUT PAS « non variable » : elle vaut « je n'ai
			// rien dit ». Ecarter les blocs muets viderait le catalogue d'un
			// marchand qui a seulement nomme ses references.
			if ( ! empty( $psu_dim[ $i ] ) ) {
				$entree['dimmable'] = true;
			}
			$psus[] = $entree;
		}
		$saved['psus'] = $psus;

		/*
		 * REMPLIR SANS ECRASER. On cherche les lignes dont la reference est
		 * vide ; s'il n'y en a plus assez, on s'arrete et on le dit. Ajouter
		 * des lignes au vol demanderait de recopier ici le gabarit du tableau
		 * — deux gabarits qui divergeraient au premier changement de colonne.
		 */
		AHNS_Admin_UI::inline_js(
			'ahns-psu-depart',
			'		(function () {
			var b = document.getElementById(\'ahns-psu-depart\');
			if (!b) { return; }
			b.addEventListener(\'click\', function () {
				var liste = JSON.parse(b.dataset.psu || \'[]\');
				var refs = document.querySelectorAll(\'input[name="psu_sku[]"]\');
				var pose = 0;
				for (var i = 0; i < refs.length && pose < liste.length; i++) {
					if (\'\' !== refs[i].value.trim()) { continue; }
					var tr = refs[i].closest(\'tr\');
					var a = liste[pose];
					refs[i].value = a.sku;
					var champ = function (n) { return tr.querySelector(\'[name="\' + n + \'[]"]\'); };
					if (champ(\'psu_label\')) { champ(\'psu_label\').value = a.label; }
					if (champ(\'psu_watts\')) { champ(\'psu_watts\').value = a.wattsNominal; }
					if (champ(\'psu_volt\')) { champ(\'psu_volt\').value = String(a.voltage); }
					if (champ(\'psu_ip\')) { champ(\'psu_ip\').value = a.ip; }
					pose++;
				}
				b.disabled = true;
				b.textContent = pose < liste.length
					? '
			. wp_json_encode( __( 'Rows filled in: add more, then click again for the rest', 'ahime-neon-sign-configurator' ) )
			. '
					: '
			. wp_json_encode( __( 'Part numbers loaded: read them over, add your prices, then save', 'ahime-neon-sign-configurator' ) )
			. ';
			});
		}());'
		);

		// --- Programmateurs d'extinction (chantier A2) -----------------------
		//
		// Le defaut de 19 EUR n'est PAS source (docs/04 s5.9), et l'extinction
		// nocturne peut etre une obligation legale : c'est le pire endroit du
		// bareme pour un chiffre invente.
		$timers     = array();
		$t_sku      = ( isset( $_POST['timer_sku'] ) ? map_deep( (array) wp_unslash( $_POST['timer_sku'] ), 'sanitize_text_field' ) : array() );
		$t_lib      = ( isset( $_POST['timer_label'] ) ? map_deep( (array) wp_unslash( $_POST['timer_label'] ), 'sanitize_text_field' ) : array() );
		$t_prix     = ( isset( $_POST['timer_prix'] ) ? map_deep( (array) wp_unslash( $_POST['timer_prix'] ), 'sanitize_text_field' ) : array() );
		$t_volt     = ( isset( $_POST['timer_volt'] ) ? map_deep( (array) wp_unslash( $_POST['timer_volt'] ), 'sanitize_text_field' ) : array() );
		$t_astro    = ( isset( $_POST['timer_astro'] ) ? map_deep( (array) wp_unslash( $_POST['timer_astro'] ), 'sanitize_text_field' ) : array() );
		foreach ( $t_sku as $i => $sku ) {
			$sku = sanitize_text_field( wp_unslash( (string) $sku ) );
			if ( '' === $sku ) {
				continue;
			}
			$entree = array( 'sku' => substr( $sku, 0, 64 ) );
			$lib = sanitize_text_field( wp_unslash( (string) ( $t_lib[ $i ] ?? '' ) ) );
			if ( '' !== $lib ) {
				$entree['label'] = substr( $lib, 0, 80 );
			}
			$prix = (float) ( $t_prix[ $i ] ?? 0 );
			if ( $prix > 0 ) {
				$entree['priceCents'] = (int) round( $prix * 100 );
			}
			$v = (int) ( $t_volt[ $i ] ?? 0 );
			if ( in_array( $v, array( 12, 24, 230 ), true ) ) {
				$entree['voltage'] = $v;
			}
			if ( ! empty( $t_astro[ $i ] ) ) {
				$entree['astronomique'] = true;
			}
			$timers[] = $entree;
		}
		$saved['timers'] = $timers;

		// --- Grille de prix PAR LETTRE (chantier A5) -------------------------
		//
		// `lettres-boitiers` s5 : « Ne jamais tarifer une lettre lumineuse au m2 :
		// le marche, l'atelier et le client comptent en lettres et en centimetres
		// de haut. » Aucune fiche fournisseur ne donne un prix de VENTE : c'est
		// une grille que l'integrateur declare.
		$grille  = array();
		$g_haut  = ( isset( $_POST['lettre_hauteur'] ) ? map_deep( (array) wp_unslash( $_POST['lettre_hauteur'] ), 'sanitize_text_field' ) : array() );
		$g_prix  = ( isset( $_POST['lettre_prix'] ) ? map_deep( (array) wp_unslash( $_POST['lettre_prix'] ), 'sanitize_text_field' ) : array() );
		$g_const = ( isset( $_POST['lettre_construction'] ) ? map_deep( (array) wp_unslash( $_POST['lettre_construction'] ), 'sanitize_text_field' ) : array() );
		foreach ( $g_haut as $i => $h ) {
			$h = (float) $h;
			$c = (float) ( $g_prix[ $i ] ?? 0 );
			// Un palier sans hauteur ou sans prix ne borne rien.
			if ( $h <= 0 || $c <= 0 ) {
				continue;
			}
			$palier = array( 'maxHauteurCm' => $h, 'cents' => (int) round( $c * 100 ) );
			$cst    = (string) ( $g_const[ $i ] ?? '' );
			if ( in_array( $cst, array( 'channel', 'solid', 'flat' ), true ) ) {
				$palier['construction'] = $cst;
			}
			$grille[] = $palier;
		}
		$saved['grilleLettres'] = $grille;

		// --- Transporteur (chantier A4) --------------------------------------
		//
		// Les defauts de colis viennent d'un CONCURRENT, releves sur son site.
		// Un marchand qui livre en palette n'a pas les memes limites qu'un autre
		// qui expedie en Colissimo. Ce reglage ne touche AUCUN prix.
		$tr_lo = ( isset( $_POST['transp_long'] ) ? (float) sanitize_text_field( wp_unslash( $_POST['transp_long'] ) ) : 0.0 );
		$tr_la = ( isset( $_POST['transp_larg'] ) ? (float) sanitize_text_field( wp_unslash( $_POST['transp_larg'] ) ) : 0.0 );
		if ( $tr_lo > 0 && $tr_la > 0 ) {
			$fiche = array( 'maxLongueurCm' => $tr_lo, 'maxLargeurCm' => $tr_la );
			$nom   = isset( $_POST['transp_nom'] ) ? sanitize_text_field( wp_unslash( $_POST['transp_nom'] ) ) : '';
			if ( '' !== $nom ) {
				$fiche['nom'] = substr( $nom, 0, 80 );
			}
			$poids = ( isset( $_POST['transp_poids'] ) ? (float) sanitize_text_field( wp_unslash( $_POST['transp_poids'] ) ) : 0.0 );
			if ( $poids > 0 ) {
				$fiche['maxPoidsKg'] = $poids;
			}
			$saved['transporteur'] = $fiche;
		} else {
			// Vider les deux champs REVIENT AUX DEFAUTS, et c'est la seule facon
			// de revenir en arriere sans devoir se souvenir des anciens chiffres.
			$saved['transporteur'] = array();
		}

		$option = AHNS_Pricing::sanitize_overrides( $saved )
			+ array(
				'marketingRounding' => $saved['marketingRounding'],
				'sizePresets'       => $presets,
				'sizeBounds'        => array( 'minCm' => $min, 'maxCm' => $max ),
			);
		update_option( self::OPTION, $option );
		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * L'alerte « votre barème repose sur des valeurs que nous n'avons pas
	 * vérifiées » — extraite ici pour être posée AILLEURS QUE DANS CET ÉCRAN.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * POURQUOI ELLE SORT DE L'ÉCRAN DE CONFIGURATION
	 *
	 * Elle n'y était visible que par un marchand qui l'ouvrait. Or c'est
	 * exactement celui qui n'en a pas besoin : celui qui configure sait qu'il
	 * configure. Le marchand qui vend depuis trois mois sur un prix que
	 * personne n'a choisi, lui, n'ouvre jamais cet écran.
	 *
	 * Elle remonte donc au tableau de bord et à la mise en route, les deux
	 * endroits par où tout le monde passe.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * CE QU'ELLE NE FAIT PAS : EMPÊCHER DE VENDRE
	 *
	 * Le défaut du programmateur — 19 €, non sourcé (docs/04 §5.9) — pourrait
	 * justifier de retirer l'option tant qu'elle n'est pas tarifée. On ne le
	 * fait pas : l'extinction nocturne est une OBLIGATION LÉGALE pour le client
	 * final (R581-59, contravention de 5ᵉ classe), et priver un marchand
	 * distrait de l'option la plus utile à ses clients le punirait deux fois.
	 *
	 * On dit fort, on ne bloque pas.
	 *
	 * @param bool $ici Vrai dans l'écran de configuration — le texte y renvoie
	 *                  aux tableaux du dessous plutôt qu'à un lien.
	 */
	/**
	 * UN CATALOGUE DE DEPART POUR LES ALIMENTATIONS — releve fiche par fiche.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * CE QU'IL PORTE, ET CE QU'IL NE PORTERA JAMAIS
	 *
	 * Il porte la TECHNIQUE : reference commandable, puissance reelle, tension,
	 * indice IP. Chacune de ces valeurs est lue dans la fiche du fabricant,
	 * deposee au fonds (`ressources/alimentations/`).
	 *
	 * Il ne porte AUCUN PRIX, et ce n'est pas un oubli. Une fiche Mean Well ne
	 * donne pas de prix — c'est un fabricant, pas un distributeur — et le prix
	 * depend du revendeur, du volume et du pays. L'inventer serait exactement
	 * ce que la regle 2 du depot interdit. Sans prix, les paliers de puissance
	 * de la boutique s'appliquent : le marchand gagne une reference juste sans
	 * qu'un seul centime bouge.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * POURQUOI CE TABLEAU EXISTE : LE NOM DE LA SERIE MENT
	 *
	 * Un HLG-80H ne fait pas 80 W en 12 V, il en fait SOIXANTE — 5 A sous 12 V,
	 * lu sur la fiche. Un ELG-150 en 12 V donne 120 W, pas 150. Un LPV-100 en
	 * 12 V en donne 102, et 100,8 en 24 V.
	 *
	 * Un marchand qui saisirait « 80 » pour un HLG-80H-12 dimensionnerait ses
	 * alimentations un tiers au-dessus de la realite, et le calcul choisirait
	 * un bloc trop petit. C'est la faute que ce tableau evite — pas une
	 * economie de frappe.
	 *
	 * L'APV-35 n'a pas d'indice IP ici parce que sa fiche n'en annonce pas sur
	 * les deux premieres pages : on ne devine pas un IP, `sanitizeCatalog` le
	 * refuse d'ailleurs.
	 *
	 * @return array
	 */
	public static function catalogue_de_depart_psu() {
		return array(
			// Serie HLG — metal, exterieur, la plus courante en enseigne.
			array( 'sku' => 'HLG-80H-12',  'label' => 'Mean Well HLG-80H 12 V',  'wattsNominal' => 60,  'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'HLG-80H-24',  'label' => 'Mean Well HLG-80H 24 V',  'wattsNominal' => 81,  'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'HLG-150H-12', 'label' => 'Mean Well HLG-150H 12 V', 'wattsNominal' => 150, 'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'HLG-150H-24', 'label' => 'Mean Well HLG-150H 24 V', 'wattsNominal' => 151, 'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'HLG-240H-12', 'label' => 'Mean Well HLG-240H 12 V', 'wattsNominal' => 192, 'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'HLG-240H-24', 'label' => 'Mean Well HLG-240H 24 V', 'wattsNominal' => 240, 'voltage' => 24, 'ip' => 'IP67' ),
			// Serie ELG — plus compacte. Pas de 12 V en 240 W : la fiche ne le
			// propose pas, et on n'ajoute pas une ligne qui n'existe pas.
			array( 'sku' => 'ELG-75-12',   'label' => 'Mean Well ELG-75 12 V',   'wattsNominal' => 60,  'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'ELG-75-24',   'label' => 'Mean Well ELG-75 24 V',   'wattsNominal' => 75,  'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'ELG-150-12',  'label' => 'Mean Well ELG-150 12 V',  'wattsNominal' => 120, 'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'ELG-150-24',  'label' => 'Mean Well ELG-150 24 V',  'wattsNominal' => 150, 'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'ELG-240-24',  'label' => 'Mean Well ELG-240 24 V',  'wattsNominal' => 240, 'voltage' => 24, 'ip' => 'IP67' ),
			// Serie LPV — tension constante pure, IP67, interieur et abrite.
			array( 'sku' => 'LPV-35-12',   'label' => 'Mean Well LPV-35 12 V',   'wattsNominal' => 36,  'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'LPV-35-24',   'label' => 'Mean Well LPV-35 24 V',   'wattsNominal' => 36,  'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'LPV-60-12',   'label' => 'Mean Well LPV-60 12 V',   'wattsNominal' => 60,  'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'LPV-60-24',   'label' => 'Mean Well LPV-60 24 V',   'wattsNominal' => 60,  'voltage' => 24, 'ip' => 'IP67' ),
			array( 'sku' => 'LPV-100-12',  'label' => 'Mean Well LPV-100 12 V',  'wattsNominal' => 102, 'voltage' => 12, 'ip' => 'IP67' ),
			array( 'sku' => 'LPV-100-24',  'label' => 'Mean Well LPV-100 24 V',  'wattsNominal' => 100, 'voltage' => 24, 'ip' => 'IP67' ),
			// APV — sans IP annonce sur la fiche : on ne l'invente pas.
			array( 'sku' => 'APV-35-12',   'label' => 'Mean Well APV-35 12 V',   'wattsNominal' => 36,  'voltage' => 12, 'ip' => '' ),
			array( 'sku' => 'APV-35-24',   'label' => 'Mean Well APV-35 24 V',   'wattsNominal' => 36,  'voltage' => 24, 'ip' => '' ),
		);
	}

	/**
	 * LES ONGLETS DE L'ECRAN DES TARIFS.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * POURQUOI, ET CE QUI A ETE MESURE
	 *
	 * Mesure au navigateur le 4 septembre 2026, sur le site d'essai :
	 * **4 847 pixels de haut, 114 champs, neuf sections**. Le bouton
	 * « Enregistrer les tarifs » etait a 4 400 px du haut — pour sauver une
	 * correction faite sur la premiere ligne, il fallait traverser quatre
	 * hauteurs d'ecran et esperer n'avoir rien touche en chemin.
	 *
	 * Et l'ordre melangeait les metiers : les cotes de colis vivaient en haut,
	 * parmi les prix, quand le transporteur qui les justifie etait tout en bas.
	 *
	 * ─────────────────────────────────────────────────────────────────────
	 * UN SEUL FORMULAIRE, ET C'EST LA CONTRAINTE QUI COMMANDE
	 *
	 * Les onglets MASQUENT, ils ne separent pas : tous les champs restent dans
	 * le meme `<form>` et partent ensemble a l'enregistrement. Un decoupage en
	 * plusieurs formulaires aurait paru plus propre et aurait fait perdre, au
	 * premier enregistrement, tout ce qui n'etait pas dans l'onglet ouvert.
	 *
	 * L'onglet courant est retenu dans l'adresse (`#ahns-onglet-…`) : apres
	 * enregistrement, WordPress revient sur la page et le marchand retrouve
	 * l'onglet ou il travaillait, pas le premier.
	 */
	private static function onglets() {
		return array(
			'prix'      => __( 'Base prices', 'ahime-neon-sign-configurator' ),
			'tailles'   => __( 'Sizes and brackets', 'ahime-neon-sign-configurator' ),
			'parc'      => __( 'Component inventory', 'ahime-neon-sign-configurator' ),
			'lettres'   => __( 'Channel letters', 'ahime-neon-sign-configurator' ),
			'livraison' => __( 'Delivery', 'ahime-neon-sign-configurator' ),
		);
	}

	/**
	 * Ouvre un panneau d'onglet — dans une CARTE, comme partout ailleurs.
	 *
	 * Mesure comparative au navigateur, le 4 septembre 2026 :
	 *
	 *   Tarifs           2 cartes,  9 tableaux bruts, champs a 65 px
	 *   Apparence        5 cartes,             champs a 350 px de mediane
	 *   Tableau de bord 13 cartes,  aucun tableau brut
	 *
	 * L'ecran des tarifs etait le seul a parler la langue de WordPress plutot
	 * que celle de l'extension : des `table.form-table` nues sur fond gris, la
	 * ou le reste pose des cartes blanches arrondies. « Trop froid » n'etait
	 * pas une impression, c'etait une mesure.
	 */
	private static function panneau_ouvrir( $cle ) {
		printf( '<div class="ahns-panneau ahns-card" data-onglet="%s">', esc_attr( $cle ) );
	}

	private static function panneau_fermer() {
		echo '</div>';
	}

	public static function rendre_alerte_parc( $ici = false ) {
		$parc    = self::etat_du_parc();
		$manque  = array_values( array_filter( $parc, static function ( $p ) { return 'declare' !== $p['origine']; } ) );
		$douteux = array_values( array_filter( $parc, static function ( $p ) { return 'defaut-non-source' === $p['origine']; } ) );
		if ( empty( $manque ) ) {
			// On ne felicite pas un marchand d'avoir rempli ses fiches : un
			// bandeau qui s'affiche toujours cesse d'etre lu, et le jour ou il
			// compte vraiment, plus personne ne le voit.
			return false;
		}
		$urgent = ! empty( $douteux );
		printf(
			'<div class="ahns-alerte-parc ahns-alerte-parc--%1$s" style="margin:12px 0 18px;padding:12px 14px;background:#fff;border:1px solid #c3c4c7;border-left:4px solid #dba617;"><p style="margin:0 0 8px;"><strong>%2$s</strong></p><ul style="margin:0 0 4px 18px;list-style:disc;">',
			$urgent ? 'warning' : 'info',
			esc_html(
				$urgent
					? sprintf(
						/* translators: %d: number of items. */
						_n( '%d price in your scale comes from a value we could not verify.', '%d prices in your scale come from values we could not verify.', count( $douteux ), 'ahime-neon-sign-configurator' ),
						count( $douteux )
					)
					: sprintf(
						/* translators: %d: number of items. */
						_n( '%d item still follows the general settings rather than your purchases.', '%d items still follow the general settings rather than your purchases.', count( $manque ), 'ahime-neon-sign-configurator' ),
						count( $manque )
					)
			)
		);
		foreach ( $manque as $poste ) {
			printf(
				'<li><strong>%1$s</strong> · %2$s</li>',
				esc_html( $poste['libelle'] ),
				esc_html( $poste['raison'] )
			);
		}
		echo '</ul><p style="margin:8px 0 0;color:#666;">';
		if ( $ici ) {
			echo esc_html__( 'These defaults come from the plugin, not from your suppliers. Enter the parts you actually buy below: nothing changes until you have declared something.', 'ahime-neon-sign-configurator' );
		} else {
			/*
			 * AILLEURS, IL FAUT UN CHEMIN. Une alerte qui nomme un problème
			 * sans dire où le régler se lit une fois, puis se contourne.
			 */
			echo esc_html__( 'These defaults come from the plugin, not from your suppliers. Nothing changes until you have declared something.', 'ahime-neon-sign-configurator' )
				. ' <a href="' . esc_url( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) ) . '">'
				. esc_html__( 'Enter my parts', 'ahime-neon-sign-configurator' ) . '</a>';
		}
		echo '</p></div>';
		return true;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$pricing  = new AHNS_Pricing(); // coefficients EFFECTIFS (défauts + option).
		$saved    = (array) get_option( self::OPTION, array() );
		$defaults = AHNS_Pricing::COEFF;

		AHNS_Admin_UI::open(
			__( 'Pricing', 'ahime-neon-sign-configurator' ),
			__( 'Your coefficients, your sizes and your price tiers. The configurator shows the customer EXACTLY what the server will charge.', 'ahime-neon-sign-configurator' )
		);
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Settings saved - the simulator below reflects the new pricing.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}
		AHNS_Admin_UI::card_open( '', 'padding:0 20px 4px;' );
		echo '<p class="ahns-hint" style="margin:14px 0 0;">' . esc_html__( 'A field left empty falls back to the default, calibrated against the market.', 'ahime-neon-sign-configurator' ) . '</p>';

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_settings" />';

		// La barre d'onglets. Des liens d'ancre : sans JavaScript, ils sautent
		// simplement a la section, et rien n'est perdu.
		echo '<h2 class="nav-tab-wrapper ahns-onglets">';
		foreach ( self::onglets() as $cle => $libelle ) {
			printf(
				'<a href="#ahns-onglet-%1$s" class="nav-tab" data-onglet="%1$s">%2$s</a>',
				esc_attr( $cle ),
				esc_html( $libelle )
			);
		}
		echo '</h2>';

		self::panneau_ouvrir( 'prix' );
		wp_nonce_field( self::NONCE );
		echo '<table class="form-table">';
		foreach ( AHNS_I18n::t_map( self::FIELDS ) as $key => $def ) {
			list( $label, $unit, $factor ) = $def;
			$current     = isset( $saved[ $key ] ) ? $saved[ $key ] / $factor : '';
			$placeholder = $defaults[ $key ] / $factor;
			printf(
				'<tr><th scope="row"><label for="%1$s">%2$s</label></th><td><input type="number" step="0.01" min="0" id="%1$s" name="%1$s" value="%3$s" placeholder="%4$s" class="small-text" /> %5$s</td></tr>',
				esc_attr( $key ),
				esc_html( $label ),
				esc_attr( '' === $current ? '' : (string) $current ),
				esc_attr( (string) $placeholder ),
				esc_html( $unit )
			);
		}
		$rounding = isset( $saved['marketingRounding'] ) ? (bool) $saved['marketingRounding'] : true;
		printf(
			'<tr><th scope="row">' . esc_html__( 'Marketing rounding', 'ahime-neon-sign-configurator' ) . '</th><td><label><input type="checkbox" name="marketingRounding" value="1" %s /> ' . esc_html__( 'Round the displayed price up to the next amount ending in 9', 'ahime-neon-sign-configurator' ) . '</label></td></tr>',
			checked( $rounding, true, false )
		);
		echo '</table>';
		// --- Tailles proposées au client -------------------------------------
		$presets_ui = self::size_presets();
		$bounds     = self::size_bounds();
		self::panneau_fermer();
		self::panneau_ouvrir( 'tailles' );
		echo '<h2>' . esc_html__( 'Sizes on offer', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">' . esc_html__( 'The configurator\'s size buttons (letter height) and the bounds of the free slider.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="widefat striped" style="max-width:520px;"><thead><tr><th>' . esc_html__( 'Label', 'ahime-neon-sign-configurator' ) . '</th><th style="width:170px;">' . esc_html__( 'Letter height', 'ahime-neon-sign-configurator' ) . '</th></tr></thead><tbody>';
		$rows = array_merge( $presets_ui, array( array( 'label' => '', 'letterHeightCm' => '' ), array( 'label' => '', 'letterHeightCm' => '' ) ) );
		foreach ( $rows as $preset ) {
			printf(
				'<tr><td><input type="text" name="preset_label[]" value="%s" placeholder="S, M, L…" /></td>'
				. '<td><input type="number" step="0.5" min="1" max="300" name="preset_cm[]" value="%s" class="small-text" /> cm</td></tr>',
				esc_attr( (string) $preset['label'] ),
				esc_attr( (string) $preset['letterHeightCm'] )
			);
		}
		echo '</tbody></table>';
		echo '<p style="color:#666;">' . esc_html__( 'An empty row is ignored: clear the label to remove a size.', 'ahime-neon-sign-configurator' ) . '</p>';
		printf(
			'<p><label>' . esc_html__( 'Free slider: from', 'ahime-neon-sign-configurator' ) . ' <input type="number" step="1" min="5" max="100" name="size_min" value="%s" class="small-text" /> cm '
			. esc_html__( 'to', 'ahime-neon-sign-configurator' ) . ' <input type="number" step="1" min="6" max="300" name="size_max" value="%s" class="small-text" /> cm</label></p>',
			esc_attr( (string) $bounds['minCm'] ),
			esc_attr( (string) $bounds['maxCm'] )
		);

		// --- Paliers de prix par taille --------------------------------------
		echo '<h2>' . esc_html__( 'Price tiers by size', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">' . esc_html__( 'IN ADDITION to per-metre tube pricing. The first band that covers the design width applies.', 'ahime-neon-sign-configurator' ) . '<br />'
			. '<strong>' . esc_html__( 'Minimum price', 'ahime-neon-sign-configurator' ) . '</strong> : ' . esc_html__( 'the total does not go below this amount.', 'ahime-neon-sign-configurator' ) . ' <strong>' . esc_html__( 'Surcharge', 'ahime-neon-sign-configurator' ) . '</strong> : ' . esc_html__( 'this amount is added.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<table class="widefat striped" style="max-width:620px;"><thead><tr><th style="width:170px;">' . esc_html__( 'Maximum width', 'ahime-neon-sign-configurator' ) . '</th><th style="width:200px;">' . esc_html__( 'Effect', 'ahime-neon-sign-configurator' ) . '</th><th>' . esc_html__( 'Amount', 'ahime-neon-sign-configurator' ) . '</th></tr></thead><tbody>';
		$saved_tiers = self::size_tiers();
		$tier_rows   = array_merge( $saved_tiers, array( array( 'maxWidthCm' => '', 'mode' => 'floor', 'cents' => '' ), array( 'maxWidthCm' => '', 'mode' => 'floor', 'cents' => '' ) ) );
		foreach ( $tier_rows as $tier ) {
			$amount = ( '' === $tier['cents'] ) ? '' : number_format( ( (int) $tier['cents'] ) / 100, 2, '.', '' );
			printf(
				'<tr><td><input type="number" step="1" min="1" max="1000" name="tier_width[]" value="%s" class="small-text" /> cm</td>'
				. '<td><select name="tier_mode[]"><option value="floor"%s>' . esc_html__( 'Minimum price', 'ahime-neon-sign-configurator' ) . '</option><option value="surcharge"%s>' . esc_html__( 'Surcharge', 'ahime-neon-sign-configurator' ) . '</option></select></td>'
				. '<td><input type="number" step="0.01" min="0" name="tier_amount[]" value="%s" class="small-text" /> EUR</td></tr>',
				esc_attr( (string) $tier['maxWidthCm'] ),
				selected( $tier['mode'], 'floor', false ),
				selected( $tier['mode'], 'surcharge', false ),
				esc_attr( $amount )
			);
		}
		echo '</tbody></table>';

		// --- Prêt à vendre ? (chantier A6) -----------------------------------
		//
		// EN TÊTE, et pas en bas : c'est la première chose qu'un intégrateur
		// doit lire avant de toucher un chiffre. Placé après les tableaux, il
		// aurait été lu par ceux qui savaient déjà.
		self::rendre_alerte_parc( true );

		// --- Catalogue de tubes ----------------------------------------------
		self::panneau_fermer();
		self::panneau_ouvrir( 'parc' );
		echo '<h2>' . esc_html__( 'Tube catalogue', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">'
			. esc_html__( 'A colour is not a hex code: it is a spool, with its purchase price, its power draw and its unlit appearance. This table is OPTIONAL: as long as it is empty, or as long as a column stays empty, the general setting applies and no price moves.', 'ahime-neon-sign-configurator' )
			. '<br /><strong>' . esc_html__( 'Unlit colour', 'ahime-neon-sign-configurator' ) . '</strong> : '
			. esc_html__( 'to be taken from a photo of the unlit spool. Left empty, it is worked out by washing out the lit colour, which is fair but less faithful than your own silicone.', 'ahime-neon-sign-configurator' )
			. '</p>';
		/*
		 * DES FICHES, PAS UN TABLEAU DE ONZE COLONNES.
		 *
		 * Mesure au navigateur : onze champs sur une ligne, ecrases a 65 px
		 * chacun, et les deux dernieres colonnes — controleur et profil —
		 * carrement hors ecran. Un marchand qui remplit une bobine devait
		 * deviner la colonne ou il ecrivait, l'en-tete etant a huit champs de
		 * distance.
		 *
		 * Chaque bobine devient donc un bloc, et chaque champ porte SON
		 * etiquette a cote de lui. Les `name=` ne bougent pas d'un caractere :
		 * l'enregistrement ne voit aucune difference.
		 */
		echo '<div class="ahns-fiches">';
		$vide       = array( 'sku' => '', 'label' => '', 'litHex' => '', 'offHex' => '', 'tubePerMeterCents' => '', 'wattsPerMeter' => '', 'diameterMm' => '', 'lumensPerMeter' => '', 'mode' => '', 'controllerCents' => '', 'profile' => '' );
		$tube_rows  = array_merge( self::tubes(), array( $vide, $vide, $vide ) );
		foreach ( $tube_rows as $t ) {
			$t     = array_merge( $vide, (array) $t );
			$prix  = ( '' === $t['tubePerMeterCents'] ) ? '' : number_format( ( (int) $t['tubePerMeterCents'] ) / 100, 2, '.', '' );
			printf(
				'<div class="ahns-fiche">'
				. '<label class="ahns-fiche__champ ahns-fiche__champ--large"><span>' . esc_html__( 'Part number', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="tube_sku[]" value="%1$s" placeholder="ROSE-6x12" /></label>'
				. '<label class="ahns-fiche__champ ahns-fiche__champ--large"><span>' . esc_html__( 'Customer-facing name', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="tube_label[]" value="%2$s" placeholder="Rose" /></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'On', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="tube_lit[]" value="%3$s" placeholder="#ff2d95" /></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Off', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="tube_off[]" value="%4$s" placeholder="#f6d9e6" /></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Price per metre', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="0.01" min="0" name="tube_prix[]" value="%5$s" /><em>EUR</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Power', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="0.1" min="0" name="tube_watts[]" value="%6$s" /><em>W/m</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Diameter', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="0.1" min="0" max="30" name="tube_diam[]" value="%13$s" placeholder="10" /><em>mm</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Luminous flux', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="1" min="0" name="tube_lm[]" value="%8$s" /><em>lm/m</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Can do', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<select name="tube_mode[]">'
				. '<option value="">-</option>'
				. '<option value="solid"%9$s>' . esc_html__( 'Single colour', 'ahime-neon-sign-configurator' ) . '</option>'
				. '<option value="rgb"%10$s>RGB</option>'
				. '<option value="spi"%11$s>' . esc_html__( 'Pixel (SPI)', 'ahime-neon-sign-configurator' ) . '</option>'
				. '</select></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Controller', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="0.01" min="0" name="tube_ctrl[]" value="%12$s" /><em>EUR</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Profile', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="tube_profil[]" value="%7$s" placeholder="6x12" /></label>'
				. '</div>',
				esc_attr( (string) $t['sku'] ),
				esc_attr( (string) $t['label'] ),
				esc_attr( (string) $t['litHex'] ),
				esc_attr( (string) $t['offHex'] ),
				esc_attr( $prix ),
				esc_attr( (string) $t['wattsPerMeter'] ),
				esc_attr( (string) $t['profile'] ),
				esc_attr( (string) $t['lumensPerMeter'] ),
				selected( $t['mode'], 'solid', false ),
				selected( $t['mode'], 'rgb', false ),
				selected( $t['mode'], 'spi', false ),
				esc_attr( ( '' === $t['controllerCents'] ) ? '' : number_format( ( (int) $t['controllerCents'] ) / 100, 2, '.', '' ) ),
				esc_attr( (string) $t['diameterMm'] )
			);
		}
		echo '</div>';
		echo '<p class="ahns-hint" style="margin:6px 0 0;">'
			. esc_html__( 'A row with no part number or no lit colour is ignored: clear both fields to remove a spool.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'CAN DO: a “single colour” spool makes an RGB order be REFUSED; better said here than on the phone three days later. Left on “-”, nothing is refused. The CONTROLLER replaces the flat RGB fee for this spool: an addressable pixel controller does not cost the same as a three-channel RGB one.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. sprintf(
				/* translators: %d: threshold in lumens per metre. */
				esc_html__( 'LUMINOUS FLUX decides the “shop window” label: from %d lm/m up, the spool holds its own behind a sunlit window. Left empty, no label: we don’t promise a brightness we haven’t measured. For reference: a common 6 × 12 runs between 145 and 360 lm/m, the brightest on the market around 1,500.', 'ahime-neon-sign-configurator' ),
				(int) AHNS_Pricing::COEFF['vitrineLumensPerMeter']
			)
			. '</p>';

		// --- Catalogue d'alimentations (chantier A1) -------------------------
		echo '<h2>' . esc_html__( 'Driver catalogue', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">'
			. esc_html__( 'A driver is a part YOU buy: its part number, its power, its voltage and its price are yours. This table is OPTIONAL: as long as it is empty, the power brackets above apply and no price moves.', 'ahime-neon-sign-configurator' )
			. '<br /><strong>' . esc_html__( 'The voltage is checked', 'ahime-neon-sign-configurator' ) . '</strong> : '
			. esc_html__( 'a 24 V driver will never ship with a 12 V tube. Until now it was up to you to check that on every sheet.', 'ahime-neon-sign-configurator' )
			. '</p>';
		/*
		 * LE CATALOGUE DE DEPART — une aide a la saisie, pas une verite.
		 *
		 * Il ne remplit que les lignes VIDES : un marchand qui a deja saisi ses
		 * blocs ne doit pas les voir disparaitre parce qu'il a clique. Et il
		 * n'ecrit AUCUN PRIX — voir `catalogue_de_depart_psu()` pour la raison.
		 *
		 * Le bouton n'enregistre rien : il remplit le formulaire, le marchand
		 * relit, ajuste ses prix, puis enregistre lui-meme. Un catalogue pose
		 * sans relecture serait un catalogue que personne n'a choisi — c'est
		 * exactement le defaut qu'on corrige.
		 */
		printf(
			'<p><button type="button" class="button" id="ahns-psu-depart" data-psu="%s">%s</button> <span class="ahns-hint">%s</span></p>',
			esc_attr( wp_json_encode( self::catalogue_de_depart_psu() ) ),
			esc_html__( 'Load the common Mean Well part numbers', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Power ratings taken from the manufacturer’s datasheets. Without prices: those depend on your distributor.', 'ahime-neon-sign-configurator' )
		);
		echo '<div class="ahns-fiches">';
		$psu_vide = array( 'sku' => '', 'label' => '', 'wattsNominal' => '', 'voltage' => '', 'ip' => '', 'priceCents' => '', 'dimmable' => false );
		$psu_rows = array_merge( self::psus(), array( $psu_vide, $psu_vide, $psu_vide ) );
		foreach ( $psu_rows as $a ) {
			$a    = array_merge( $psu_vide, (array) $a );
			$prix = ( '' === $a['priceCents'] ) ? '' : number_format( ( (int) $a['priceCents'] ) / 100, 2, '.', '' );
			printf(
				'<div class="ahns-fiche">'
				. '<label class="ahns-fiche__champ ahns-fiche__champ--large"><span>' . esc_html__( 'Part number', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="psu_sku[]" value="%1$s" placeholder="LPV-60-12" /></label>'
				. '<label class="ahns-fiche__champ ahns-fiche__champ--large"><span>' . esc_html__( 'Workshop name', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="psu_label[]" value="%2$s" placeholder="Mean Well LPV-60" /></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Power', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="1" min="0" name="psu_watts[]" value="%3$s" /><em>W</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Voltage', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<select name="psu_volt[]">'
				. '<option value="">-</option>'
				. '<option value="12"%4$s>12 V</option>'
				. '<option value="24"%5$s>24 V</option>'
				. '</select></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'IP rating', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="text" name="psu_ip[]" value="%6$s" placeholder="IP67" /></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Price', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="number" step="0.01" min="0" name="psu_prix[]" value="%7$s" /><em>EUR</em></label>'
				. '<label class="ahns-fiche__champ"><span>' . esc_html__( 'Dimmable', 'ahime-neon-sign-configurator' ) . '</span>'
				. '<input type="checkbox" name="psu_dim[]" value="1"%8$s /></label>'
				. '</div>',
				esc_attr( (string) $a['sku'] ),
				esc_attr( (string) $a['label'] ),
				esc_attr( (string) $a['wattsNominal'] ),
				selected( (string) $a['voltage'], '12', false ),
				selected( (string) $a['voltage'], '24', false ),
				esc_attr( (string) $a['ip'] ),
				esc_attr( $prix ),
				checked( ! empty( $a['dimmable'] ), true, false )
			);
		}
		echo '</div>';
		echo '<p class="ahns-hint" style="margin:6px 0 0;">'
			. esc_html__( 'A row with no part number, no power or no voltage is ignored: clear the part number to remove a driver.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'The PRICE replaces the power bracket for this driver. Left empty, the part number only serves the bill of materials and the voltage check, and the price does not move.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'The IP RATING decides what goes outdoors: IP65 as a minimum. A missing rating is not a sufficient rating; a silent datasheet does not say “weatherproof”, it says nothing.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'DIMMABLE left unticked means “I said nothing”, not “not dimmable”: the driver can still be offered with a dimmer.', 'ahime-neon-sign-configurator' )
			. '</p>';

		// --- Programmateurs d'extinction (chantier A2) -----------------------
		echo '<h2>' . esc_html__( 'Night timers', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">'
			. esc_html__( 'The default price for this option has NO source: there is no timer datasheet in the reference library, and it was aligned with the dimmer price for want of anything better. Yet a night switch-off can be a legal requirement, and this is the worst place in the price list for an invented figure.', 'ahime-neon-sign-configurator' )
			. '</p>';
		echo '<table class="widefat striped" style="max-width:820px;"><thead><tr>'
			. '<th style="width:180px;">' . esc_html__( 'Part number', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th style="width:200px;">' . esc_html__( 'Workshop name', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th style="width:120px;">' . esc_html__( 'Price', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th style="width:110px;">' . esc_html__( 'Voltage', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th>' . esc_html__( 'Astronomical', 'ahime-neon-sign-configurator' ) . '</th>'
			. '</tr></thead><tbody>';
		$t_vide = array( 'sku' => '', 'label' => '', 'priceCents' => '', 'voltage' => '', 'astronomique' => false );
		$t_rows = array_merge( self::timers(), array( $t_vide, $t_vide ) );
		foreach ( $t_rows as $t ) {
			$t    = array_merge( $t_vide, (array) $t );
			$prix = ( '' === $t['priceCents'] ) ? '' : number_format( ( (int) $t['priceCents'] ) / 100, 2, '.', '' );
			printf(
				'<tr>'
				. '<td><input type="text" name="timer_sku[]" value="%1$s" style="width:100%%;" placeholder="SUL181h" /></td>'
				. '<td><input type="text" name="timer_label[]" value="%2$s" style="width:100%%;" placeholder="Theben SUL 181 h" /></td>'
				. '<td><input type="number" step="0.01" min="0" name="timer_prix[]" value="%3$s" class="small-text" /> EUR</td>'
				. '<td><select name="timer_volt[]">'
				. '<option value="">-</option>'
				. '<option value="12"%4$s>12 V</option>'
				. '<option value="24"%5$s>24 V</option>'
				. '<option value="230"%6$s>230 V</option>'
				. '</select></td>'
				. '<td><label><input type="checkbox" name="timer_astro[]" value="1"%7$s /> ' . esc_html__( 'follows the sun', 'ahime-neon-sign-configurator' ) . '</label></td>'
				. '</tr>',
				esc_attr( (string) $t['sku'] ),
				esc_attr( (string) $t['label'] ),
				esc_attr( $prix ),
				selected( (string) $t['voltage'], '12', false ),
				selected( (string) $t['voltage'], '24', false ),
				selected( (string) $t['voltage'], '230', false ),
				checked( ! empty( $t['astronomique'] ), true, false )
			);
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint" style="margin:6px 0 0;">'
			. esc_html__( 'The first part number carrying a PRICE sets the rate. Naming a part without its price serves the bill of materials and moves nothing.', 'ahime-neon-sign-configurator' )
			. '</p>';

		// --- Grille de prix par lettre (chantier A5) -------------------------
		self::panneau_fermer();
		self::panneau_ouvrir( 'lettres' );
		echo '<h2>' . esc_html__( 'Channel letters: price per letter', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">'
			. esc_html__( 'The market, the workshop and the customer all count in LETTERS and centimetres of height, not in square metres: two 50 cm “I”s and one 50 cm “M” cover very different areas, but the workshop bends three returns and fits three trim caps either way.', 'ahime-neon-sign-configurator' )
			. '<br />' . esc_html__( 'This table is OPTIONAL: as long as it is empty, the area-based calculation applies and no price moves.', 'ahime-neon-sign-configurator' )
			. '</p>';
		echo '<table class="widefat striped" style="max-width:700px;"><thead><tr>'
			. '<th style="width:180px;">' . esc_html__( 'Up to (height)', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th style="width:160px;">' . esc_html__( 'Price per letter', 'ahime-neon-sign-configurator' ) . '</th>'
			. '<th>' . esc_html__( 'Construction', 'ahime-neon-sign-configurator' ) . '</th>'
			. '</tr></thead><tbody>';
		$g_vide = array( 'maxHauteurCm' => '', 'cents' => '', 'construction' => '' );
		$g_rows = array_merge( self::grille_lettres(), array( $g_vide, $g_vide, $g_vide ) );
		foreach ( $g_rows as $g ) {
			$g    = array_merge( $g_vide, (array) $g );
			$prix = ( '' === $g['cents'] ) ? '' : number_format( ( (int) $g['cents'] ) / 100, 2, '.', '' );
			printf(
				'<tr>'
				. '<td><input type="number" step="1" min="0" name="lettre_hauteur[]" value="%1$s" class="small-text" /> cm</td>'
				. '<td><input type="number" step="0.01" min="0" name="lettre_prix[]" value="%2$s" class="small-text" /> EUR</td>'
				. '<td><select name="lettre_construction[]">'
				. '<option value=""%3$s>' . esc_html__( 'all', 'ahime-neon-sign-configurator' ) . '</option>'
				. '<option value="channel"%4$s>' . esc_html__( 'channel (illuminated)', 'ahime-neon-sign-configurator' ) . '</option>'
				. '<option value="solid"%5$s>' . esc_html__( 'solid (non-illuminated)', 'ahime-neon-sign-configurator' ) . '</option>'
				. '<option value="flat"%6$s>' . esc_html__( 'flat (cut-out)', 'ahime-neon-sign-configurator' ) . '</option>'
				. '</select></td>'
				. '</tr>',
				esc_attr( (string) $g['maxHauteurCm'] ),
				esc_attr( $prix ),
				selected( (string) $g['construction'], '', false ),
				selected( (string) $g['construction'], 'channel', false ),
				selected( (string) $g['construction'], 'solid', false ),
				selected( (string) $g['construction'], 'flat', false )
			);
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint" style="margin:6px 0 0;">'
			. esc_html__( 'The first bracket that covers the requested height wins, whatever order you typed them in. BEYOND the last bracket the grid does not apply: better to fall back on area than to extrapolate onto a two-metre sign, which is a different trade.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'CONSTRUCTION “all” covers all three: start with a single grid, refine later. A non-illuminated letter is treated as “solid”.', 'ahime-neon-sign-configurator' )
			. '</p>';

		// --- Transporteur (chantier A4) --------------------------------------
		$tr = self::transporteur();
		self::panneau_fermer();
		self::panneau_ouvrir( 'livraison' );
		echo '<h2>' . esc_html__( 'Carrier', 'ahime-neon-sign-configurator' ) . '</h2>';
		echo '<p style="color:#666;">'
			. esc_html__( 'Beyond these limits, a piece ships as several panels. The defaults come from a COMPETITOR, taken from their site: they do not describe your contract. A pallet shipment and a parcel service do not have the same limits.', 'ahime-neon-sign-configurator' )
			. '<br />' . esc_html__( 'This setting touches no price: the split warns, it does not charge.', 'ahime-neon-sign-configurator' )
			. '</p>';
		printf(
			'<table class="form-table" style="max-width:720px;"><tbody>'
			. '<tr><th scope="row">%1$s</th><td><input type="text" name="transp_nom" value="%5$s" class="regular-text" placeholder="Colissimo, DPD, palette…" /></td></tr>'
			. '<tr><th scope="row">%2$s</th><td><input type="number" step="1" min="0" name="transp_long" value="%6$s" class="small-text" /> cm</td></tr>'
			. '<tr><th scope="row">%3$s</th><td><input type="number" step="1" min="0" name="transp_larg" value="%7$s" class="small-text" /> cm</td></tr>'
			. '<tr><th scope="row">%4$s</th><td><input type="number" step="0.1" min="0" name="transp_poids" value="%8$s" class="small-text" /> kg</td></tr>'
			. '</tbody></table>',
			esc_html__( 'Name', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Max length', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Max width', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Max weight', 'ahime-neon-sign-configurator' ),
			esc_attr( (string) ( $tr['nom'] ?? '' ) ),
			esc_attr( (string) ( $tr['maxLongueurCm'] ?? '' ) ),
			esc_attr( (string) ( $tr['maxLargeurCm'] ?? '' ) ),
			esc_attr( (string) ( $tr['maxPoidsKg'] ?? '' ) )
		);
		echo '<p class="ahns-hint" style="margin:6px 0 0;">'
			. esc_html__( 'Length AND width are both needed: one alone bounds nothing. Clear both to go back to the defaults.', 'ahime-neon-sign-configurator' )
			. '<br />'
			. esc_html__( 'Max WEIGHT is optional, and left empty it is not checked at all: inventing a ceiling would split pieces that ship perfectly well.', 'ahime-neon-sign-configurator' )
			. '</p>';

		self::panneau_fermer();

		/*
		 * LE BOUTON RESTE VISIBLE, quel que soit l'onglet et quel que soit le
		 * defilement. Il etait a 4 400 px du haut : une correction faite sur la
		 * premiere ligne demandait quatre ecrans de defilement pour etre
		 * sauvee, et c'est exactement la que les modifications se perdent.
		 */
		echo '<div class="ahns-barre-enregistrer">';
		submit_button( __( 'Save pricing', 'ahime-neon-sign-configurator' ), 'primary', 'submit', false );
		echo '</div>';
		echo '</form>';

		/*
		 * LE STYLE ET LE COMPORTEMENT DES ONGLETS.
		 *
		 * En ligne dans la page plutot que dans une feuille a part : c'est le
		 * seul ecran qui s'en sert, et une feuille chargee partout pour un
		 * ecran serait payee par tous les autres.
		 *
		 * SANS JAVASCRIPT, RIEN NE DISPARAIT. Les panneaux ne sont caches que
		 * par la classe `js` que le script pose lui-meme : un marchand dont le
		 * script ne s'execute pas voit la page d'avant — longue, mais entiere
		 * et enregistrable. C'est le meme garde-fou que pour la coque de
		 * l'espace marchand.
		 */
		AHNS_Admin_UI::inline_css(
			'ahns-onglets',
			'		.ahns-onglets { margin: 18px 0 0; border-bottom: 0; }
		.ahns-onglets .nav-tab { border-radius: 10px 10px 0 0; font-weight: 600; }

		/*
		 * DES CHAMPS QU\'ON PEUT LIRE.
		 *
		 * Ils faisaient 65 px de large — cinq fois moins que les 350 px de
		 * l\'ecran Apparence — parce que `small-text` de WordPress vise des
		 * codes postaux, pas des prix a quatre chiffres. Un prix de 1 250,50
		 * n\'y tenait pas : le marchand voyait « 1 250 » et devait deviner la
		 * fin.
		 */
		.ahns-panneau input[type="number"],
		.ahns-panneau input[type="text"] { min-width: 92px; }
		.ahns-panneau .form-table input[type="number"],
		.ahns-panneau .form-table input[type="text"] { min-width: 140px; }
		.ahns-panneau .form-table th { width: 260px; font-weight: 600; }
		.ahns-panneau .form-table td { padding: 12px 10px; }

		/*
		 * LES GRANDS TABLEAUX RESPIRENT, ET DEFILENT PLUTOT QUE DE SE TASSER.
		 *
		 * Le catalogue de tubes porte ONZE champs sur une ligne. Les faire
		 * tenir dans la largeur ecrasait chacun a 65 px ; on leur rend une
		 * largeur utile et on laisse le tableau defiler lateralement, ce qui
		 * est le comportement que tout le monde connait d\'un tableur.
		 */
		.ahns-panneau .widefat { display: block; overflow-x: auto; max-width: 100%; }
		.ahns-panneau .widefat input,
		.ahns-panneau .widefat select { min-width: 88px; }
		.ahns-panneau .widefat th { font-weight: 600; white-space: nowrap; }
		.ahns-panneau .widefat td { padding: 10px 8px; vertical-align: middle; }

		/*
		 * LES FICHES : une bobine par bloc, chaque champ avec son etiquette.
		 *
		 * La grille se replie toute seule selon la largeur — quatre champs par
		 * ligne sur un grand ecran, deux sur un portable. Personne n a plus a
		 * faire defiler lateralement pour atteindre la derniere colonne.
		 */
		.ahns-fiches { display: flex; flex-direction: column; gap: 12px; margin: 10px 0 6px; }
		.ahns-fiche {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
			gap: 10px 14px;
			padding: 14px 16px;
			background: #fbfbfc;
			border: 1px solid #e2e4e9;
			border-radius: 12px;
		}
		.ahns-fiche__champ { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
		.ahns-fiche__champ > span { color: #6b7280; font-weight: 600; }
		.ahns-fiche__champ input,
		.ahns-fiche__champ select { width: 100%; }
		.ahns-fiche__champ em { font-style: normal; color: #8b8f98; font-size: 11.5px; }
		.ahns-fiche__champ--large { grid-column: span 2; }
		@media (max-width: 900px) { .ahns-fiche__champ--large { grid-column: auto; } }

		/* Le titre de section reprend celui des cartes, pas le gris de WordPress. */
		.ahns-panneau h2 { margin: 22px 0 6px; font-size: 15px; font-weight: 700; }
		.ahns-panneau h2:first-child { margin-top: 0; }
		.ahns-panneau > p { color: #6b7280; font-size: 12.5px; }

		.ahns-onglets .nav-tab { cursor: pointer; }
		.ahns-barre-enregistrer {
			position: sticky;
			bottom: 0;
			z-index: 20;
			margin: 18px -20px 0;
			padding: 12px 20px;
			background: #fff;
			border-top: 1px solid #dcdcde;
			box-shadow: 0 -3px 10px rgba(0, 0, 0, .06);
		}
		/* La barre collante recouvre ce qui passe dessous : sans cette reserve,
		   le dernier champ de chaque onglet disparait derriere elle. Constate
		   sur « Colis — longueur maxi », qui n etait plus visible du tout. */
		.ahns-panneau { padding-bottom: 76px; }
		.js .ahns-panneau { display: none; }
		.js .ahns-panneau.est-ouvert { display: block; }'
		);
		AHNS_Admin_UI::inline_js(
			'ahns-onglets',
			'		(function () {
			var racine = document.querySelector(\'.ahns-onglets\');
			if (!racine) { return; }
			// La classe `js` n\'est posee QUE si le script tourne : sans elle,
			// aucun panneau n\'est cache.
			document.body.classList.add(\'js\');

			var onglets = Array.prototype.slice.call(racine.querySelectorAll(\'.nav-tab\'));
			var panneaux = Array.prototype.slice.call(document.querySelectorAll(\'.ahns-panneau\'));

			function montrer(cle) {
				var connu = false;
				panneaux.forEach(function (pan) {
					var ok = pan.dataset.onglet === cle;
					pan.classList.toggle(\'est-ouvert\', ok);
					if (ok) { connu = true; }
				});
				onglets.forEach(function (o) {
					o.classList.toggle(\'nav-tab-active\', o.dataset.onglet === cle);
				});
				return connu;
			}

			onglets.forEach(function (o) {
				o.addEventListener(\'click\', function (ev) {
					ev.preventDefault();
					montrer(o.dataset.onglet);
					// L\'onglet courant vit dans l\'adresse : apres
					// enregistrement, WordPress revient ici et le marchand
					// retrouve l\'onglet ou il travaillait.
					try { history.replaceState(null, \'\', \'#ahns-onglet-\' + o.dataset.onglet); } catch (e) {}
					// ET DANS LE STOCKAGE LOCAL, parce que le fragment ne
					// survit PAS a l enregistrement : WordPress repond par une
					// redirection qui le laisse tomber. Mesure : on repartait
					// toujours sur le premier onglet apres avoir enregistre,
					// alors que le commentaire d en haut promettait l inverse.
					try { localStorage.setItem(\'ahns_onglet_tarifs\', o.dataset.onglet); } catch (e) {}
				});
			});

			var memoire = \'\';
			try { memoire = localStorage.getItem(\'ahns_onglet_tarifs\') || \'\'; } catch (e) {}
			var depuisUrl = (location.hash || \'\').replace(\'#ahns-onglet-\', \'\');
			// L adresse d abord — un lien partage doit mener ou il dit —, la
			// memoire ensuite, le premier onglet en dernier recours.
			if (!(depuisUrl && montrer(depuisUrl)) && !(memoire && montrer(memoire))) {
				montrer(onglets[0].dataset.onglet);
			}

			/*
			 * UN CHAMP INVALIDE PEUT ETRE DANS UN ONGLET FERME.
			 *
			 * Le navigateur refuse alors d\'envoyer le formulaire et tente de
			 * pointer un champ que personne ne voit : l\'ecran ne bouge pas, et
			 * rien n\'explique pourquoi. On ouvre donc l\'onglet qui le contient.
			 */
			var form = racine.closest(\'form\');
			if (form) {
				form.addEventListener(\'invalid\', function (ev) {
					var pan = ev.target.closest(\'.ahns-panneau\');
					if (pan) { montrer(pan.dataset.onglet); }
				}, true);
			}
		}());'
		);

		// --- Page dédiée ------------------------------------------------------
		if ( current_user_can( 'publish_pages' ) ) {
			$page_id = AHNS_Page::ensure_page();
			if ( $page_id ) {
				echo '<h2>' . esc_html__( 'Dedicated configurator page', 'ahime-neon-sign-configurator' ) . '</h2>';
				echo '<p>' . esc_html__( 'A “blank canvas” page, without the theme\'s header and footer (no conflict possible): the configurator header takes your customers back to the home page:', 'ahime-neon-sign-configurator' ) . ' ';
				echo '<a href="' . esc_url( (string) get_permalink( $page_id ) ) . '" target="_blank" rel="noopener">' . esc_html( (string) get_permalink( $page_id ) ) . '</a></p>';
			}
		}

		AHNS_Admin_UI::card_close();

		// --- Simulateur ------------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Simulator - reference designs at current pricing', 'ahime-neon-sign-configurator' ) );
		echo '<table class="widefat striped" style="max-width:760px;">';
		echo '<thead><tr><th>' . esc_html__( 'Design', 'ahime-neon-sign-configurator' ) . '</th><th>' . esc_html__( 'Tube', 'ahime-neon-sign-configurator' ) . '</th><th>' . esc_html__( 'Dimensions', 'ahime-neon-sign-configurator' ) . '</th><th style="text-align:right;">' . esc_html__( 'Customer price', 'ahime-neon-sign-configurator' ) . '</th></tr></thead><tbody>';
		foreach ( self::WITNESSES as $w ) {
			$m = $pricing->measure( $w['config'] );
			$p = $pricing->price( $w['config'], $m );
			printf(
				'<tr><td>%s</td><td>%s m</td><td>%s × %s cm</td><td style="text-align:right;"><b>%s €</b></td></tr>',
				esc_html( $w['label'] ),
				esc_html( number_format( $m['tubeLengthM'], 2, ',', ' ' ) ),
				esc_html( (string) round( $m['widthCm'] ) ),
				esc_html( (string) round( $m['heightCm'] ) ),
				esc_html( number_format( $p['displayTotalCents'] / 100, 0, ',', ' ' ) )
			);
		}
		echo '</tbody></table>';
		echo '<p class="ahns-hint" style="margin:10px 0 0;">' . esc_html__( 'Typical market ranges: small size $80-250, medium RGB $250-1,500, outdoor $500-3,000+.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();
		AHNS_Admin_UI::close();
	}
}
