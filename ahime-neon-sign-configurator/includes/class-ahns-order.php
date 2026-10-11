<?php
/**
 * Commandes : affichage du design sur la fiche commande admin + détail dans
 * les e-mails natifs WooCommerce (client ET admin) — capture fidèle, détail
 * du prix ligne à ligne, spécification de fabrication.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Order
 */
class AHNS_Order {

	/** Adresse atelier réglée dans l'écran Apparence ('' = aucun envoi). */
	public static function production_email() {
		return class_exists( 'AHNS_Appearance' ) ? (string) AHNS_Appearance::settings()['production_email'] : '';
	}

	public function hooks() {
		// Bloc admin sous chaque ligne de commande personnalisée.
		add_action( 'woocommerce_after_order_itemmeta', array( $this, 'render_admin_block' ), 10, 2 );
		// Détail dans les e-mails HTML natifs (client + admin).
		add_action( 'woocommerce_email_order_details', array( $this, 'render_email_details' ), 20, 4 );
		// Masque les métas techniques (_ahns_…) de l'affichage standard.
		add_filter( 'woocommerce_hidden_order_itemmeta', array( $this, 'hide_technical_meta' ) );
		// Pages CLIENT (commande reçue + espace compte) : vignette du design,
		// zoom au survol, boutons Aperçu et Télécharger — docs/06 §5.
		add_action( 'woocommerce_order_item_meta_end', array( $this, 'render_customer_block' ), 10, 3 );
		add_action( 'wp_footer', array( $this, 'render_customer_assets' ) );
	}

	/**
	 * @param string[] $hidden Métas masquées.
	 * @return string[]
	 */
	public function hide_technical_meta( $hidden ) {
		return array_merge( $hidden, array( '_ahns_config', '_ahns_price_cents', '_ahns_price_lines', '_ahns_summary', '_ahns_preview', '_ahns_preview_off', '_ahns_preview_3d', '_ahns_mass_kg', '_ahns_logo_svg', '_ahns_geometry' ) );
	}

	/**
	 * SPÉCIFICATION NORMALISÉE d'une ligne — source unique pour l'écran admin,
	 * la fiche de production, l'export CSV et les e-mails. Évite que quatre
	 * rendus divergent sur ce qui part à l'atelier.
	 *
	 * @param WC_Order_Item $item Ligne de commande.
	 * @return array<string,mixed>
	 */
	public static function spec( $item ) {
		$config  = json_decode( (string) $item->get_meta( '_ahns_config' ), true );
		$summary = json_decode( (string) $item->get_meta( '_ahns_summary' ), true );
		$config  = is_array( $config ) ? $config : array();
		$summary = is_array( $summary ) ? $summary : array();

		$lines = array();
		foreach ( (array) ( $config['lines'] ?? array() ) as $i => $l ) {
			$lines[] = array(
				'n'     => (int) $i + 1,
				'text'  => (string) ( $l['text'] ?? '' ),
				'font'  => (string) ( $l['fontId'] ?? '' ),
				'color' => (string) ( $l['colorHex'] ?? '' ),
			);
		}

		$options = array();
		if ( 'rgb' === ( $config['colorMode'] ?? '' ) ) {
			$options[] = __( 'RGB', 'ahime-neon-sign-configurator' );
		}
		if ( 'outdoor' === ( $config['environment'] ?? '' ) ) {
			$options[] = __( 'Outdoor (drained box, IP67 tube and driver)', 'ahime-neon-sign-configurator' );
		}
		if ( ! empty( $config['options']['dimmerRemote'] ) ) {
			$options[] = __( 'Dimmer', 'ahime-neon-sign-configurator' );
		}
		if ( ! empty( $config['options']['express'] ) ) {
			$options[] = __( 'EXPRESS', 'ahime-neon-sign-configurator' );
		}

		$kind = (string) ( $config['kind'] ?? 'text' );

		return array(
			'kind'        => $kind,
			'text'        => (string) ( $summary['text'] ?? '' ),
			'lines'       => $lines,
			'letter_cm'   => (float) ( $config['letterHeightCm'] ?? 0 ),
			'width_cm'    => (float) ( $summary['width_cm'] ?? 0 ),
			'height_cm'   => (float) ( $summary['height_cm'] ?? 0 ),
			'tube_m'      => (float) ( $summary['tube_m'] ?? 0 ),
			'support'     => (string) ( $config['support']['type'] ?? '' ),
			'finish'      => (string) ( $config['support']['finish'] ?? '' ),
			'environment' => (string) ( $config['environment'] ?? 'indoor' ),
			'options'     => $options,
			'price_cents' => (int) $item->get_meta( '_ahns_price_cents' ),
			'preview'     => (string) $item->get_meta( '_ahns_preview' ),
			// La même pièce, tube ÉTEINT (écart E03). Absente des commandes
			// passées avant le 2 septembre 2026 et des logos : tout ce qui la
			// lit doit donc supporter la chaîne vide.
			'preview_off' => (string) $item->get_meta( '_ahns_preview_off' ),
			'preview_3d'  => (string) $item->get_meta( '_ahns_preview_3d' ),
			// Masse calculée par le navigateur (`masseEnseigne`). Absente des
			// commandes antérieures : tout ce qui la lit doit tolérer zéro.
			'mass_kg'     => (float) $item->get_meta( '_ahns_mass_kg' ),
			'logo_svg'    => (string) $item->get_meta( '_ahns_logo_svg' ),
			// PANNEAUX ET CAISSONS — sans ces lignes, la fiche de production
			// d'une plaque ne porte ni matière, ni épaisseur, ni découpe :
			// elle n'est pas fabricable.
			'plaque'      => self::plaque( $kind, $config ),
			// ÉLECTRICITÉ — ce que l'atelier doit sortir du magasin et câbler.
			'elec'        => self::elec( $config, $summary ),
		);
	}

	/** Nombre lisible, sans décimale inutile. */
	private static function num_o( $value ) {
		$v = (float) $value;
		return rtrim( rtrim( number_format( $v, 2, ',', ' ' ), '0' ), ',' );
	}

	/**
	 * PLAN ÉLECTRIQUE de la ligne — figé à la commande (`_ahns_summary`).
	 *
	 * Repli pour les commandes antérieures à cette version : recalcul avec les
	 * coefficients d'aujourd'hui, signalé comme tel, plutôt qu'une case vide
	 * sur la fiche d'atelier.
	 *
	 * @param array $config  Configuration.
	 * @param array $summary Résumé enregistré.
	 * @return array<string,mixed>|null
	 */
	private static function elec( array $config, array $summary ) {
		if ( isset( $summary['elec'] ) && is_array( $summary['elec'] ) ) {
			return $summary['elec'];
		}
		// Un panneau imprimé n'a pas de tube : pas de plan électrique à donner.
		$tube = (float) ( $summary['tube_m'] ?? 0 );
		if ( $tube <= 0 || ! class_exists( 'AHNS_Pricing' ) ) {
			return null;
		}
		$plan             = ( new AHNS_Pricing() )->plan_electrique( $tube );
		$plan['recalcul'] = true;
		return $plan;
	}

	/**
	 * Libellés d'une matière de plaque, tels que réglés par le marchand.
	 *
	 * @param string $id Identifiant de matière.
	 * @return string
	 */
	private static function materiau_label( $id ) {
		if ( '' === $id ) {
			return '';
		}
		if ( class_exists( 'AHNS_Materials' ) ) {
			$mats = AHNS_Materials::settings()['materials'];
			if ( isset( $mats[ $id ]['label'] ) ) {
				return (string) $mats[ $id ]['label'];
			}
		}
		return $id;
	}

	/**
	 * Spécification d'une plaque (panneau) ou d'un caisson — vide pour un néon.
	 *
	 * @param string $kind   Type de produit.
	 * @param array  $config Configuration.
	 * @return array<string,mixed>|null
	 */
	private static function plaque( $kind, array $config ) {
		if ( 'panel' !== $kind && 'box-sign' !== $kind ) {
			return null;
		}
		$taille = isset( $config['sizeCm'] ) && is_array( $config['sizeCm'] ) ? $config['sizeCm'] : array();
		$out    = array(
			'famille'   => 'panel' === $kind ? __( 'Panel', 'ahime-neon-sign-configurator' ) : __( 'Light box', 'ahime-neon-sign-configurator' ),
			'width_cm'  => (float) ( $taille['widthCm'] ?? 0 ),
			'height_cm' => (float) ( $taille['heightCm'] ?? 0 ),
		);

		$decoupes  = array(
			'rect'    => __( 'straight cut', 'ahime-neon-sign-configurator' ),
			'rounded' => __( 'rounded corners', 'ahime-neon-sign-configurator' ),
			'shape'   => __( 'free shape (path following)', 'ahime-neon-sign-configurator' ),
		);
		$finitions = array(
			'raw'         => __( 'bare', 'ahime-neon-sign-configurator' ),
			'printed'     => __( 'digital printing', 'ahime-neon-sign-configurator' ),
			'printed-lam' => __( 'printing + anti-UV lamination', 'ahime-neon-sign-configurator' ),
			'letters'     => __( 'raised cut-out letters', 'ahime-neon-sign-configurator' ),
			'engraved'    => __( 'engraving', 'ahime-neon-sign-configurator' ),
		);

		if ( 'panel' === $kind ) {
			$p                 = isset( $config['panel'] ) && is_array( $config['panel'] ) ? $config['panel'] : array();
			$out['materiau']   = self::materiau_label( (string) ( $p['material'] ?? '' ) );
			$out['epaisseur']  = (float) ( $p['thicknessMm'] ?? 0 );
			$out['finition']   = $finitions[ $p['finish'] ?? '' ] ?? (string) ( $p['finish'] ?? '' );
			$out['decoupe']    = $decoupes[ $p['cut'] ?? '' ] ?? (string) ( $p['cut'] ?? '' );
			$out['double_face'] = ! empty( $p['doubleSided'] );
			if ( ! empty( $p['channelLetters'] ) && is_array( $p['channelLetters'] ) ) {
				$cl                = $p['channelLetters'];
				$eclairages        = array(
					'none'       => __( 'unlit', 'ahime-neon-sign-configurator' ),
					'front'      => __( 'front lighting', 'ahime-neon-sign-configurator' ),
					'back'       => __( 'back lighting', 'ahime-neon-sign-configurator' ),
					'front-back' => __( 'front + back lighting', 'ahime-neon-sign-configurator' ),
				);
				$out['lettres'] = array(
					'materiau'  => (string) ( $cl['material'] ?? '' ),
					'profondeur' => (float) ( $cl['depthMm'] ?? 0 ),
					'face'      => (string) ( $cl['faceColor'] ?? '' ),
					'chant'     => (string) ( $cl['sideColor'] ?? '' ),
					'eclairage' => $eclairages[ $cl['lighting'] ?? '' ] ?? (string) ( $cl['lighting'] ?? '' ),
					'couches'   => count( (array) ( $cl['backboardLayers'] ?? array() ) ),
				);
			}
		} else {
			$b                  = isset( $config['boxSign'] ) && is_array( $config['boxSign'] ) ? $config['boxSign'] : array();
			$out['materiau']    = self::materiau_label( (string) ( $b['material'] ?? '' ) );
			$out['profondeur']  = (float) ( $b['depthCm'] ?? 0 );
			$out['faces']       = 2 === (int) ( $b['faces'] ?? 1 ) ? 2 : 1;
			$out['face_imprimee'] = ! empty( $b['printedFace'] );
		}
		return $out;
	}

	/**
	 * Vrai si la ligne porte une personnalisation néon (public : réutilisé par
	 * l'écran Commandes et le garde-fou).
	 *
	 * @param WC_Order_Item $item Ligne.
	 * @return bool
	 */
	public static function is_neon_item( $item ) {
		return self::is_custom_item( $item );
	}

	/**
	 * Vrai si la ligne porte une personnalisation néon.
	 *
	 * @param WC_Order_Item $item Ligne.
	 * @return bool
	 */
	private static function is_custom_item( $item ) {
		return $item instanceof WC_Order_Item_Product && '' !== (string) $item->get_meta( '_ahns_config' );
	}

	/**
	 * Bloc admin : capture + spécification + détail du prix.
	 *
	 * @param int           $item_id Id de ligne.
	 * @param WC_Order_Item $item    Ligne.
	 */
	public function render_admin_block( $item_id, $item ) {
		if ( ! is_admin() || ! self::is_custom_item( $item ) ) {
			return;
		}
		$config  = json_decode( (string) $item->get_meta( '_ahns_config' ), true );
		$summary = json_decode( (string) $item->get_meta( '_ahns_summary' ), true );
		$lines   = json_decode( (string) $item->get_meta( '_ahns_price_lines' ), true );
		$preview = (string) $item->get_meta( '_ahns_preview' );

		echo '<div style="margin:8px 0;padding:10px;border:1px solid #e2e2e2;border-radius:8px;max-width:640px;">';
		echo '<strong>' . esc_html__( 'Custom neon sign: workshop specification', 'ahime-neon-sign-configurator' ) . '</strong>';

		if ( preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) ) {
			printf( '<img src="%s" alt="' . esc_attr__( 'Neon preview', 'ahime-neon-sign-configurator' ) . '" style="display:block;max-width:280px;height:auto;margin:8px 0;border-radius:6px;align-self:flex-start;object-fit:contain;" />', esc_attr( $preview ) );
		}

		if ( is_array( $summary ) ) {
			echo '<div style="font-size:12px;line-height:1.7;">';
			echo '<div><b>' . esc_html__( 'Text', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( (string) ( $summary['text'] ?? '-' ) ) . '</div>';
			echo '<div><b>' . esc_html__( 'Dimensions', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( sprintf( '%s × %s cm', $summary['width_cm'] ?? '-', $summary['height_cm'] ?? '-' ) ) . '</div>';
			echo '<div><b>' . esc_html__( 'LED tube', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( (string) ( $summary['tube_m'] ?? '-' ) ) . ' m</div>';
			if ( is_array( $config ) ) {
				echo '<div><b>' . esc_html__( 'Letter height', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( (string) $config['letterHeightCm'] ) . ' cm · <b>' . esc_html__( 'Backing', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( $config['support']['type'] . ' / ' . $config['support']['finish'] ) . ' · <b>' . esc_html__( 'Colours', 'ahime-neon-sign-configurator' ) . '</b> : ';
				$cols = array();
				foreach ( (array) $config['lines'] as $l ) {
					$cols[] = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' . esc_attr( $l['colorHex'] ) . ';border:1px solid #ccc;vertical-align:middle;"></span> <code>' . esc_html( $l['colorHex'] ) . '</code>';
				}
				echo 'rgb' === $config['colorMode'] ? esc_html__( 'RGB colour-changing', 'ahime-neon-sign-configurator' ) : wp_kses_post( implode( ' · ', $cols ) );
				echo '</div>';
				$opts = array();
				if ( 'outdoor' === $config['environment'] ) {
					$opts[] = __( 'Outdoor (drained IP65 box, IP67 tube and power supply)', 'ahime-neon-sign-configurator' );
				}
				if ( ! empty( $config['options']['dimmerRemote'] ) ) {
					$opts[] = __( 'Dimmer', 'ahime-neon-sign-configurator' );
				}
				if ( ! empty( $config['options']['express'] ) ) {
					$opts[] = __( 'EXPRESS', 'ahime-neon-sign-configurator' );
				}
				if ( $opts ) {
					echo '<div><b>' . esc_html__( 'Options', 'ahime-neon-sign-configurator' ) . '</b> : ' . esc_html( implode( ' · ', $opts ) ) . '</div>';
				}
				// Plaque et plan électrique : les deux blocs qui manquaient à
				// l'atelier. Même source que la fiche imprimable et le CSV.
				$spec = self::spec( $item );
				if ( $spec['plaque'] ) {
					$p     = $spec['plaque'];
					$bouts = array( self::num_o( $p['width_cm'] ) . ' × ' . self::num_o( $p['height_cm'] ) . ' cm' );
					foreach ( array( 'materiau', 'finition', 'decoupe' ) as $cle ) {
						if ( ! empty( $p[ $cle ] ) ) {
							$bouts[] = $p[ $cle ];
						}
					}
					if ( ! empty( $p['epaisseur'] ) ) {
						$bouts[] = self::num_o( $p['epaisseur'] ) . ' mm';
					}
					if ( isset( $p['profondeur'] ) ) {
						$bouts[] = __( 'depth', 'ahime-neon-sign-configurator' ) . ' ' . self::num_o( $p['profondeur'] ) . ' cm';
					}
					echo '<div><b>' . esc_html( $p['famille'] ) . '</b> : ' . esc_html( implode( ' · ', $bouts ) ) . '</div>';
				}
				if ( $spec['elec'] ) {
					$e = $spec['elec'];
					printf(
						'<div>' . /* translators: 1: power drawn in watts, 2: power supply rating in watts, 3: number of branches, 4: voltage. */ esc_html__( 'Electrical: %1$s W drawn → %2$s W power supply · %3$s branch(es) at %4$s V', 'ahime-neon-sign-configurator' ) . '</div>',
						esc_html( self::num_o( $e['demandW'] ) ),
						esc_html( (string) $e['psuW'] ),
						esc_html( (string) $e['branches'] ),
						esc_html( (string) $e['voltage'] )
					);
					// LA CHUTE DE TENSION DU CÂBLE LIVRÉ, quand elle sort de la
					// tolérance. En orange et non en rouge : la pièce est
					// fabricable, c'est le câble qu'il faut changer. Sans cette
					// ligne, le défaut ne se voit qu'une fois l'enseigne allumée,
					// quand le bout du tube est plus sombre que le départ — et
					// alors c'est un retour.
					if ( isset( $e['cableDropRatio'] ) && $e['cableDropRatio'] > 0.03 ) {
						printf(
							'<div style="margin-top:4px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;">' . /* translators: 1: voltage lost in volts, 2: loss as a percentage, 3: recommended cable section in mm². */ esc_html__( 'Cable: %1$s V lost in the supplied cable, i.e. %2$s %% · above the 3 %% allowed, the end of the tube gets darker. Use %3$s mm² or switch to 24 V.', 'ahime-neon-sign-configurator' ) . '</div>',
							esc_html( self::num_o( $e['cableDropV'] ) ),
							esc_html( self::num_o( round( $e['cableDropRatio'] * 100, 1 ) ) ),
							esc_html( self::num_o( $e['cableSectionNeededMm2'] ) )
						);
					}
				}
				if ( 'logo-svg' === ( $config['kind'] ?? 'text' ) ) {
					echo '<div style="margin-top:4px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;">' . esc_html__( 'Customer logo: tube length reported by the browser: CHECK it before production.', 'ahime-neon-sign-configurator' );
					$svg = (string) $item->get_meta( '_ahns_logo_svg' );
					if ( '' !== $svg ) {
						printf( ' <a href="data:image/svg+xml;base64,%s" download="logo-commande-%d.svg">' . esc_html__( 'Download the SVG', 'ahime-neon-sign-configurator' ) . '</a>', esc_attr( base64_encode( $svg ) ), (int) $item_id ); // phpcs:ignore
					}
					echo '</div>';
				}
			}
			echo '</div>';
		}

		if ( is_array( $lines ) && $lines ) {
			echo '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:12px;">' . esc_html__( 'Price breakdown', 'ahime-neon-sign-configurator' ) . '</summary><table style="font-size:12px;border-collapse:collapse;margin-top:4px;">';
			foreach ( $lines as $l ) {
				printf(
					'<tr><td style="padding:2px 14px 2px 0;">%s</td><td style="text-align:right;">%s €</td></tr>',
					esc_html( (string) $l['label'] ),
					esc_html( number_format( ( (int) $l['amountCents'] ) / 100, 2, ',', ' ' ) )
				);
			}
			echo '</table></details>';
		}
		echo '</div>';
	}

	/**
	 * Sommes-nous sur une page CLIENT de commande (merci / espace compte) ?
	 * Ce hook sert aussi aux e-mails : on ne rend le bloc que sur le site.
	 *
	 * @return bool
	 */
	private static function is_customer_order_page() {
		if ( is_admin() || ! did_action( 'wp' ) ) {
			return false;
		}
		return ( function_exists( 'is_order_received_page' ) && is_order_received_page() )
			|| ( function_exists( 'is_account_page' ) && is_account_page() );
	}

	/**
	 * Bloc client : vignette du design + boutons Aperçu / Télécharger.
	 *
	 * @param int           $item_id Id de ligne.
	 * @param WC_Order_Item $item    Ligne.
	 * @param WC_Order      $order   Commande.
	 * @return void
	 */
	public function render_customer_block( $item_id, $item, $order ) {
		unset( $order );
		if ( ! self::is_customer_order_page() || ! self::is_custom_item( $item ) ) {
			return;
		}
		$preview = (string) $item->get_meta( '_ahns_preview' );
		if ( ! preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) ) {
			return;
		}
		$accent = class_exists( 'AHNS_Cart' ) ? AHNS_Cart::accent_color() : '#ec4899';
		$alt    = esc_attr__( 'Preview of your neon', 'ahime-neon-sign-configurator' );

		echo '<div class="ahns-order-design">';
		printf(
			'<a href="#" class="ahns-order-preview" data-ahns-order-preview="%1$s" aria-label="%2$s"><img src="%1$s" alt="%2$s" /></a>',
			esc_attr( $preview ),
			$alt // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- déjà échappé.
		);
		echo '<span class="ahns-order-actions">';
		printf(
			'<a href="#" class="ahns-order-preview ahns-btn ahns-btn--ghost" data-ahns-order-preview="%s" style="color:%s;border-color:%s;">%s</a>',
			esc_attr( $preview ),
			esc_attr( $accent ),
			esc_attr( $accent ),
			esc_html__( 'Preview', 'ahime-neon-sign-configurator' )
		);
		printf(
			'<a href="%s" download="neon-%d.png" class="ahns-btn ahns-btn--solid" style="background:%s;border-color:%s;">%s</a>',
			esc_attr( $preview ),
			(int) $item_id,
			esc_attr( $accent ),
			esc_attr( $accent ),
			esc_html__( 'Download', 'ahime-neon-sign-configurator' )
		);
		echo '</span></div>';
	}

	/**
	 * Styles + zoom au survol + fenêtre d'aperçu des pages client.
	 *
	 * @return void
	 */
	public function render_customer_assets() {
		if ( ! self::is_customer_order_page() ) {
			return;
		}
		?>
		<style id="ahns-order-css">
			.ahns-order-design{margin:8px 0 2px;display:flex;flex-direction:column;align-items:flex-start;gap:8px}
			.ahns-order-design img{display:block;width:130px;max-width:100%;height:auto;border-radius:8px;border:1px solid rgba(125,125,125,.25);background:#101216;padding:4px;cursor:zoom-in}
			.ahns-order-actions{display:inline-flex;gap:8px;flex-wrap:wrap}
			.ahns-btn{display:inline-flex;align-items:center;padding:7px 16px;border-radius:999px;font-size:12.5px;font-weight:600;line-height:1.2;text-decoration:none;border-width:1.5px;border-style:solid;box-shadow:none}
			.ahns-btn--ghost{background:#fff}
			.ahns-btn--solid{color:#fff}
			.ahns-btn:hover{filter:brightness(.94)}
			.ahns-order-zoom{position:fixed;left:0;top:0;z-index:100001;display:none;pointer-events:none;background:#101216;border-radius:12px;padding:8px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
			.ahns-order-zoom.is-visible{display:block}
			.ahns-order-zoom img{display:block;width:min(440px,60vw);height:auto;border-radius:8px}
			.ahns-omodal{position:fixed;inset:0;z-index:100002;display:none;align-items:center;justify-content:center;background:rgba(12,14,18,.72);padding:24px}
			.ahns-omodal.is-open{display:flex}
			.ahns-omodal__dialog{position:relative;max-width:min(900px,94vw);border-radius:14px;background:#101216;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.4)}
			.ahns-omodal__close{position:absolute;right:10px;top:10px;box-sizing:border-box;width:36px;height:36px;min-width:36px;padding:0;margin:0;border:0;outline:0;border-radius:999px;background:#fff;color:#111827;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
			.ahns-omodal img{display:block;max-width:100%;max-height:74vh;border-radius:8px;object-fit:contain}
		</style>
		<div class="ahns-order-zoom" id="ahns-order-zoom" aria-hidden="true"><img alt="" /></div>
		<div class="ahns-omodal" id="ahns-omodal" aria-hidden="true"><div class="ahns-omodal__dialog" role="dialog" aria-modal="true">
			<button type="button" class="ahns-omodal__close" aria-label="<?php echo esc_attr__( 'Close', 'ahime-neon-sign-configurator' ); ?>">&times;</button>
			<img alt="<?php echo esc_attr__( 'Preview of your neon', 'ahime-neon-sign-configurator' ); ?>" />
		</div></div>
		<script id="ahns-order-js">
		(function(){
			var modal=document.getElementById('ahns-omodal');
			var zoom=document.getElementById('ahns-order-zoom');
			if(!modal||!zoom){return;}
			var mImg=modal.querySelector('img'), zImg=zoom.querySelector('img'), close=modal.querySelector('.ahns-omodal__close');
			function open(src){mImg.src=src;modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');close.focus();hideZoom();}
			function shut(){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');mImg.removeAttribute('src');}
			function hideZoom(){zoom.classList.remove('is-visible');zImg.removeAttribute('src');}
			document.addEventListener('click',function(e){
				var t=e.target.closest&&e.target.closest('[data-ahns-order-preview]');
				if(t){e.preventDefault();open(t.getAttribute('data-ahns-order-preview'));return;}
				if(e.target===modal||e.target===close){e.preventDefault();shut();return;}
				hideZoom();
			});
			document.addEventListener('keydown',function(e){if(e.key==='Escape'){shut();}});
			// Zoom au survol de la vignette (souris uniquement, jamais si la
			// fenêtre est ouverte).
			if(!window.matchMedia||!window.matchMedia('(hover: hover) and (pointer: fine)').matches){return;}
			function target(node){
				if(modal.classList.contains('is-open')){return null;}
				var img=node&&node.closest?node.closest('.ahns-order-design img'):null;
				return img&&!img.closest('.ahns-order-zoom')?img:null;
			}
			function place(ev){
				var w=zoom.offsetWidth,h=zoom.offsetHeight,x=ev.clientX+18,y=ev.clientY+18;
				if(x+w>window.innerWidth-8){x=ev.clientX-w-18;}
				if(y+h>window.innerHeight-8){y=ev.clientY-h-18;}
				zoom.style.left=Math.max(8,x)+'px';zoom.style.top=Math.max(8,y)+'px';
			}
			document.addEventListener('mouseover',function(e){var i=target(e.target);if(!i){return;}zImg.src=i.src;zoom.classList.add('is-visible');place(e);});
			document.addEventListener('mousemove',function(e){if(!zoom.classList.contains('is-visible')){return;}if(!target(e.target)){return;}place(e);});
			document.addEventListener('mouseout',function(e){if(target(e.target)&&!target(e.relatedTarget)){hideZoom();}});
		}());
		</script>
		<?php
	}

	/**
	 * Détail dans les e-mails HTML natifs (styles inline uniquement).
	 *
	 * @param WC_Order $order         Commande.
	 * @param bool     $sent_to_admin Destinataire admin.
	 * @param bool     $plain_text    Texte brut.
	 * @param mixed    $email         Instance WC_Email.
	 */
	public function render_email_details( $order, $sent_to_admin, $plain_text, $email ) {
		unset( $email );
		if ( $plain_text || ! ( $order instanceof WC_Order ) ) {
			return;
		}
		foreach ( $order->get_items() as $item ) {
			if ( ! self::is_custom_item( $item ) ) {
				continue;
			}
			$summary = json_decode( (string) $item->get_meta( '_ahns_summary' ), true );
			$config  = json_decode( (string) $item->get_meta( '_ahns_config' ), true );
			$preview = (string) $item->get_meta( '_ahns_preview' );
			$is_shop = (bool) $sent_to_admin; // atelier / boutique.

			echo '<div style="margin:16px 0;padding:16px;border:1px solid #e2e2e2;border-radius:8px;">';
			printf(
				'<h3 style="margin:0 0 10px;font-size:14px;">%s · %s</h3>',
				esc_html( $item->get_name() ),
				$is_shop
					? esc_html__( 'manufacturing specification', 'ahime-neon-sign-configurator' )
					: esc_html__( 'your custom neon', 'ahime-neon-sign-configurator' )
			);

			if ( preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) ) {
				printf(
					'<img src="%s" alt="%s" style="max-width:320px;height:auto;display:block;border-radius:6px;margin-bottom:10px;" />',
					esc_attr( $preview ),
					esc_attr__( 'Neon preview', 'ahime-neon-sign-configurator' )
				);
			}

			echo '<div style="font-size:13px;line-height:1.7;">';
			if ( is_array( $summary ) ) {
				echo '<div><strong>' . esc_html__( 'Text', 'ahime-neon-sign-configurator' ) . '</strong> : ' . esc_html( (string) ( $summary['text'] ?? '' ) ) . '</div>';
				echo '<div><strong>' . esc_html__( 'Dimensions', 'ahime-neon-sign-configurator' ) . '</strong> : ' . esc_html( sprintf( '%s × %s cm', $summary['width_cm'] ?? '-', $summary['height_cm'] ?? '-' ) ) . '</div>';
			}
			if ( is_array( $config ) ) {
				// Options : lisibles, utiles au client comme à l'atelier.
				$opts = array();
				if ( 'rgb' === ( $config['colorMode'] ?? '' ) ) {
					$opts[] = __( 'RGB colour-changing', 'ahime-neon-sign-configurator' );
				}
				if ( 'outdoor' === ( $config['environment'] ?? '' ) ) {
					$opts[] = __( 'Outdoor (drained box, IP67 tube and driver)', 'ahime-neon-sign-configurator' );
				}
				if ( ! empty( $config['options']['dimmerRemote'] ) ) {
					$opts[] = __( 'Remote + dimmer', 'ahime-neon-sign-configurator' );
				}
				if ( ! empty( $config['options']['express'] ) ) {
					$opts[] = __( 'Rush production', 'ahime-neon-sign-configurator' );
				}
				$spec_mail = self::spec( $item );
				if ( $spec_mail['plaque'] ) {
					$pm    = $spec_mail['plaque'];
					$bouts = array();
					foreach ( array( 'materiau', 'finition', 'decoupe' ) as $cle ) {
						if ( ! empty( $pm[ $cle ] ) ) {
							$bouts[] = $pm[ $cle ];
						}
					}
					if ( ! empty( $pm['epaisseur'] ) ) {
						$bouts[] = self::num_o( $pm['epaisseur'] ) . ' mm';
					}
					if ( isset( $pm['profondeur'] ) ) {
						$bouts[] = sprintf( /* translators: %s: depth in centimetres. */ __( '%s cm deep', 'ahime-neon-sign-configurator' ), self::num_o( $pm['profondeur'] ) );
					}
					echo '<div><strong>' . esc_html( $pm['famille'] ) . '</strong> : ' . esc_html( implode( ' · ', $bouts ) ) . '</div>';
				} else {
					echo '<div><strong>' . esc_html__( 'Backing', 'ahime-neon-sign-configurator' ) . '</strong> : '
						. esc_html( ( $config['support']['type'] ?? '-' ) . ' · ' . ( $config['support']['finish'] ?? '-' ) ) . '</div>';
				}
				if ( $opts ) {
					echo '<div><strong>' . esc_html__( 'Options', 'ahime-neon-sign-configurator' ) . '</strong> : ' . esc_html( implode( ' · ', $opts ) ) . '</div>';
				}

				// ---- ATELIER UNIQUEMENT : la spécification de fabrication ----
				if ( $is_shop ) {
					echo '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #d7d7d7;">';
					// Le Ø vient du PLAN ENREGISTRÉ à la commande, pas d'un
					// littéral : c'était la quatrième copie du « 10 mm ».
					if ( $spec_mail['tube_m'] > 0 ) {
						echo '<div><strong>' . esc_html__( 'LED tube', 'ahime-neon-sign-configurator' ) . '</strong> : '
							. esc_html( self::num_o( $spec_mail['tube_m'] ) )
							. esc_html( $spec_mail['elec'] ? sprintf( ' m · Ø %s mm · %s V', $spec_mail['elec']['diameterMm'], $spec_mail['elec']['voltage'] ) : ' m' )
							. '</div>';
					}
					if ( $spec_mail['elec'] ) {
						$e = $spec_mail['elec'];
						printf(
							'<div><strong>%s</strong> : %s</div>',
							esc_html__( 'Power supply', 'ahime-neon-sign-configurator' ),
							esc_html( sprintf(
								/* translators: 1: power drawn in watts, 2: power supply rating in watts, 3: number of branches. */
								__( '%1$s W drawn → %2$s W rating · %3$s branch(es)', 'ahime-neon-sign-configurator' ),
								self::num_o( $e['demandW'] ),
								$e['psuW'],
								$e['branches']
							) )
						);
					}
					if ( $spec_mail['lines'] ) {
						echo '<div><strong>' . esc_html__( 'Letter height', 'ahime-neon-sign-configurator' ) . '</strong> : '
							. esc_html( (string) ( $config['letterHeightCm'] ?? '-' ) ) . ' cm</div>';
					}
					if ( ! empty( $config['lines'] ) && is_array( $config['lines'] ) ) {
						echo '<div style="margin-top:6px;"><strong>' . esc_html__( 'Lines', 'ahime-neon-sign-configurator' ) . '</strong></div>';
						echo '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-top:3px;">';
						foreach ( $config['lines'] as $i => $line ) {
							$hex = isset( $line['colorHex'] ) ? (string) $line['colorHex'] : '';
							printf(
								'<tr><td style="padding:2px 10px 2px 0;">#%d</td><td style="padding:2px 10px 2px 0;">%s</td><td style="padding:2px 10px 2px 0;">%s</td><td style="padding:2px 0;">%s<code>%s</code></td></tr>',
								(int) $i + 1,
								esc_html( (string) ( $line['text'] ?? '' ) ),
								esc_html( (string) ( $line['fontId'] ?? '' ) ),
								$hex ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' . esc_attr( $hex ) . ';border:1px solid #ccc;margin-right:5px;vertical-align:middle;"></span>' : '',
								esc_html( $hex )
							);
						}
						echo '</table>';
					}
					if ( 'logo-svg' === ( $config['kind'] ?? 'text' ) ) {
						echo '<div style="margin-top:6px;color:#9a3412;">'
							. esc_html__( 'Customer logo: tube length reported by the browser - check before manufacturing.', 'ahime-neon-sign-configurator' )
							. '</div>';
					}
					echo '</div>';
				}
			}
			echo '</div></div>';
		}
	}
}
