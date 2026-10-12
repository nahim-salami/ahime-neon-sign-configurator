<?php
/**
 * LE CATALOGUE D'UN PRODUIT — ce que CE néon-là propose.
 *
 * La boutique tient un catalogue : ses couleurs, ses découpes, ses finitions,
 * ses écritures, ses matières, ses tailles. Tous les produits n'en vendent pas
 * autant. Une gamme « pastel » ne propose pas les seize teintes de l'atelier ;
 * une enseigne de bar ne se fait pas en dix centimètres de haut.
 *
 * DEUX RÈGLES, ET LA DEUXIÈME EXPLIQUE LA PREMIÈRE.
 *
 *   1. UN PRODUIT RESTREINT, IL N'AJOUTE JAMAIS. Ce qu'il propose est
 *      toujours un sous-ensemble de ce que la boutique propose. Le jour où
 *      l'atelier cesse de tenir une couleur, il la retire une fois — et
 *      aucune fiche ne continue de la vendre dans son coin.
 *
 *   2. NE RIEN DIRE, C'EST TOUT PROPOSER. Une famille dont le produit ne dit
 *      rien hérite du catalogue de la boutique. Sans cela, une boutique de
 *      cinquante produits demanderait cinquante catalogues saisis à la main,
 *      et le premier oubli donnerait un produit sans couleurs.
 *
 * Le catalogue s'applique aux DEUX bouts, comme partout ici : ce qui n'est pas
 * proposé n'apparaît pas dans le configurateur, ET est refusé au panier. Une
 * seule des deux barrières suffirait à recevoir une commande impossible.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Catalogue_Produit
 */
class AHNS_Catalogue_Produit {

	/** La méta du produit : famille => liste d'identifiants retenus. */
	const META = '_ahns_catalogue';

	const NONCE = 'ahns_catalogue_produit';

	public function hooks() {
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_product', array( $this, 'save_meta' ), 10, 2 );
	}

	/**
	 * LES FAMILLES, et ce que la boutique propose dans chacune.
	 *
	 * Chaque entrée porte de quoi dessiner l'écran ET de quoi filtrer : le
	 * libellé, l'aide, et la liste `identifiant => nom` du niveau boutique.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function familles() {
		$familles = array();

		if ( class_exists( 'AHNS_Catalog' ) ) {
			$familles['colors'] = array(
				'label' => __( 'Colours', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'The tube colours offered for this product.', 'ahime-neon-sign-configurator' ),
				'tous'  => AHNS_Catalog::enabled_colors(),
				'pastille' => true, // On montre la couleur, pas seulement son nom.
			);
			$familles['support_types'] = array(
				'label' => __( 'Backing cuts', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'The shape of the plate carrying the tube.', 'ahime-neon-sign-configurator' ),
				'tous'  => AHNS_I18n::t_map( AHNS_Catalog::enabled_support_types() ),
			);
			$familles['support_finishes'] = array(
				'label' => __( 'Backing finishes', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'The look of that plate.', 'ahime-neon-sign-configurator' ),
				'tous'  => AHNS_I18n::t_map( AHNS_Catalog::enabled_finishes() ),
			);
		}

		if ( class_exists( 'AHNS_Fonts' ) ) {
			$polices = array();
			foreach ( AHNS_Fonts::for_widget() as $police ) {
				$polices[ (string) $police['id'] ] = (string) $police['label'];
			}
			$familles['fonts'] = array(
				'label' => __( 'Typefaces', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'The fonts offered for the text.', 'ahime-neon-sign-configurator' ),
				'tous'  => $polices,
			);
		}

		if ( class_exists( 'AHNS_Materials' ) ) {
			$matieres = array();
			foreach ( AHNS_Materials::enabled_ids() as $id ) {
				$spec               = AHNS_Materials::settings()['materials'][ $id ];
				$matieres[ $id ] = (string) $spec['label'];
			}
			$familles['materials'] = array(
				'label' => __( 'Panel materials', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'For panel or light-box products.', 'ahime-neon-sign-configurator' ),
				'tous'  => $matieres,
			);
		}

		if ( class_exists( 'AHNS_Settings' ) ) {
			$tailles = array();
			foreach ( AHNS_Settings::size_presets() as $taille ) {
				// LE LIBELLÉ SERT DE CLÉ, et non le rang dans la liste : le
				// marchand réordonne ses tailles sans s'apercevoir qu'il vient
				// de changer ce que chaque produit propose.
				$tailles[ (string) $taille['label'] ] = sprintf(
					/* translators: 1: size name, 2: letter height in centimetres. */
					__( '%1$s - %2$s cm', 'ahime-neon-sign-configurator' ),
					$taille['label'],
					rtrim( rtrim( number_format( (float) $taille['letterHeightCm'], 1, ',', ' ' ), '0' ), ',' )
				);
			}
			$familles['sizes'] = array(
				'label' => __( 'Sizes on offer', 'ahime-neon-sign-configurator' ),
				'aide'  => __( 'The height shortcuts. The slider stays free between the shop’s bounds.', 'ahime-neon-sign-configurator' ),
				'tous'  => $tailles,
			);
		}

		return $familles;
	}

	/**
	 * CE QUE CE PRODUIT PROPOSE dans une famille.
	 *
	 * @param int    $product_id Produit.
	 * @param string $famille    Clé de famille.
	 * @return array<string, string> identifiant => nom.
	 */
	public static function retenus( $product_id, $famille ) {
		$familles = self::familles();
		if ( ! isset( $familles[ $famille ] ) ) {
			return array();
		}
		$tous = $familles[ $famille ]['tous'];

		$choix = self::choix( $product_id );
		if ( ! isset( $choix[ $famille ] ) ) {
			return $tous; // Ne rien dire, c'est tout proposer.
		}

		$out = array();
		foreach ( (array) $choix[ $famille ] as $id ) {
			$id = (string) $id;
			if ( isset( $tous[ $id ] ) ) {
				$out[ $id ] = $tous[ $id ];
			}
		}
		// JAMAIS DE FAMILLE VIDE. Le produit a peut-être été restreint à des
		// couleurs que la boutique ne tient plus : mieux vaut tout proposer
		// qu'un configurateur sans une seule teinte à choisir.
		return $out ? $out : $tous;
	}

	/** Les identifiants seuls — ce dont l'aperçu et le panier ont besoin. */
	public static function ids( $product_id, $famille ) {
		return array_keys( self::retenus( $product_id, $famille ) );
	}

	/** Ce produit restreint-il cette famille ? (pour le compteur « n sur N ») */
	public static function restreint( $product_id, $famille ) {
		$familles = self::familles();
		if ( ! isset( $familles[ $famille ] ) ) {
			return false;
		}
		return count( self::retenus( $product_id, $famille ) ) < count( $familles[ $famille ]['tous'] );
	}

	/** Ce que le produit a enregistré, tel quel. */
	private static function choix( $product_id ) {
		$brut = get_post_meta( (int) $product_id, self::META, true );
		return is_array( $brut ) ? $brut : array();
	}

	// -----------------------------------------------------------------------
	// Admin
	// -----------------------------------------------------------------------

	public function add_meta_box() {
		add_meta_box(
			'ahns-catalogue',
			__( 'What this sign offers', 'ahime-neon-sign-configurator' ),
			array( $this, 'render_meta_box' ),
			'product',
			'normal',
			'default'
		);
	}

	/**
	 * L'ÉCRAN. Une famille par bloc, avec son compteur « n sur N » : c'est la
	 * seule chose qui se lit d'un coup d'œil quand on rouvre une fiche six mois
	 * plus tard pour comprendre pourquoi une couleur n'apparaît pas.
	 *
	 * @param WP_Post $post Produit édité.
	 */
	public function render_meta_box( $post ) {
		wp_nonce_field( self::NONCE, self::NONCE );

		// LE PRODUIT N'EST PAS VENDU VIA LE CONFIGURATEUR. L'encadré reste
		// affiché — le réglage se fait dans la colonne de droite, et une boîte
		// qui apparaît et disparaît au rechargement déroute plus qu'elle n'aide.
		if ( class_exists( 'AHNS_Product' ) && ! AHNS_Product::is_enabled( $post->ID ) ) {
			printf(
				'<p class="ahns-hint" style="margin:0;">%s</p>',
				esc_html__( 'This product is not sold through the configurator yet. Tick “Sell this product through the configurator” in the right-hand column, save, and this catalogue takes effect.', 'ahime-neon-sign-configurator' )
			);
			return;
		}

		$conf = class_exists( 'AHNS_Product' ) ? AHNS_Product::configurateur( $post->ID ) : null;
		printf(
			'<p class="ahns-hint" style="margin-top:0;">%s</p>',
			esc_html(
				$conf
					/* translators: %s: configurator name. */
					? sprintf( __( 'This product is composed with “%s”. Below is what it offers from the shop catalogue - untick what you do not want to sell on THIS product.', 'ahime-neon-sign-configurator' ), $conf['nom'] )
					: __( 'This product no longer has a configurator: its page shows as an ordinary one, and this catalogue serves no purpose for now.', 'ahime-neon-sign-configurator' )
			)
		);

		echo '<div class="ahns-familles" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;">';
		foreach ( self::familles() as $cle => $famille ) {
			$retenus  = self::retenus( $post->ID, $cle );
			$tous     = $famille['tous'];
			$restreint = count( $retenus ) < count( $tous );

			echo '<fieldset style="border:1px solid #dcdcde;border-radius:8px;padding:12px 14px;margin:0;">';
			printf(
				'<legend style="font-weight:700;padding:0 6px;">%s <span style="font-weight:400;color:%s;">%s</span></legend>',
				esc_html( $famille['label'] ),
				$restreint ? '#8a6d00' : '#646970',
				esc_html(
					$restreint
						/* translators: 1: number selected, 2: total number. */
						? sprintf( __( '%1$d of %2$d', 'ahime-neon-sign-configurator' ), count( $retenus ), count( $tous ) )
						: __( 'the whole catalogue', 'ahime-neon-sign-configurator' )
				)
			);
			printf( '<p class="ahns-hint" style="margin:0 0 8px;">%s</p>', esc_html( $famille['aide'] ) );

			if ( ! $tous ) {
				printf( '<p class="ahns-hint" style="margin:0;">%s</p>', esc_html__( 'The shop offers none for now.', 'ahime-neon-sign-configurator' ) );
				echo '</fieldset>';
				continue;
			}

			foreach ( $tous as $id => $nom ) {
				$pastille = ! empty( $famille['pastille'] )
					? sprintf(
						'<span style="display:inline-block;width:13px;height:13px;border-radius:50%%;border:1px solid rgba(0,0,0,.25);background:%s;vertical-align:-2px;margin-right:6px;"></span>',
						esc_attr( $id )
					)
					: '';
				printf(
					'<label style="display:block;margin:4px 0;"><input type="checkbox" name="ahns_catalogue[%s][]" value="%s"%s /> %s%s</label>',
					esc_attr( $cle ),
					esc_attr( $id ),
					checked( isset( $retenus[ $id ] ), true, false ),
					wp_kses( $pastille, AHNS_Admin_UI::allowed_html() ),
					esc_html( $nom )
				);
			}
			// La famille doit être présente dans la requête même si tout est
			// décoché : sans ce témoin, « rien de coché » et « la case n'a
			// jamais été affichée » arriveraient identiques, et un catalogue
			// vidé se relirait comme un catalogue hérité.
			printf( '<input type="hidden" name="ahns_catalogue_vu[]" value="%s" />', esc_attr( $cle ) );
			echo '</fieldset>';
		}
		echo '</div>';

		printf(
			'<p class="ahns-hint" style="margin-bottom:0;">%s</p>',
			esc_html__( 'Unticking everything means offering everything: a product without a single colour would not sell. To remove a colour from the WHOLE shop, use the Colours screen.', 'ahime-neon-sign-configurator' )
		);
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

		$vues     = isset( $_POST['ahns_catalogue_vu'] ) ? map_deep( (array) wp_unslash( $_POST['ahns_catalogue_vu'] ), 'sanitize_key' ) : array();
		// Les cases cochées, assainies dès la réception ; chacune est ensuite
		// confrontée à la liste de sa famille.
		$recus    = isset( $_POST['ahns_catalogue'] ) ? map_deep( (array) wp_unslash( $_POST['ahns_catalogue'] ), 'sanitize_text_field' ) : array();
		$familles = self::familles();
		$choix    = self::choix( $post_id );

		foreach ( $vues as $cle ) {
			if ( ! isset( $familles[ $cle ] ) ) {
				continue;
			}
			$tous   = $familles[ $cle ]['tous'];
			$coches = array();
			foreach ( isset( $recus[ $cle ] ) ? (array) $recus[ $cle ] : array() as $id ) {
				$id = (string) $id;
				if ( isset( $tous[ $id ] ) ) {
					$coches[] = $id;
				}
			}
			// TOUT COCHÉ = RIEN DE DIT. On n'enregistre pas une copie du
			// catalogue de la boutique : elle se figerait le jour où le
			// marchand ajoute une couleur, et ce produit serait le seul à ne
			// pas la proposer, sans que rien ne l'explique.
			if ( ! $coches || count( $coches ) === count( $tous ) ) {
				unset( $choix[ $cle ] );
			} else {
				$choix[ $cle ] = $coches;
			}
		}

		if ( $choix ) {
			update_post_meta( $post_id, self::META, $choix );
		} else {
			delete_post_meta( $post_id, self::META );
		}
	}
}
