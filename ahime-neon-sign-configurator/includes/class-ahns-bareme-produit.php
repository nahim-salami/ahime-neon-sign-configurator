<?php
/**
 * LE BARÈME D'UN PRODUIT — quand celui de la boutique ne convient pas.
 *
 * Un atelier a UN prix de revient : une mise en route, un mètre de tube, une
 * alimentation. C'est pourquoi le barème vit dans les Réglages, et non dans
 * chaque configurateur — deux configurateurs ne changent pas le coût du tube.
 *
 * Un PRODUIT, lui, peut s'en écarter : une gamme premium, une série à prix
 * cassé, une collaboration. Et il le fait EN ENTIER.
 *
 * PAS DE PANACHAGE LIGNE À LIGNE, et c'est la seule décision qui compte ici.
 * Un barème à moitié hérité est impossible à vérifier le jour où un prix paraît
 * faux — et c'est toujours ce jour-là qu'on le regarde. « D'où sort ce
 * 214 € ? » n'a pas de réponse courte quand trois lignes viennent de la
 * boutique et deux du produit. Ici la réponse tient en un coup d'œil : ce
 * produit suit la boutique, ou il a le sien.
 *
 * LES VALEURS DE DÉPART SONT CELLES DE LA BOUTIQUE. Au moment où le marchand
 * bascule un produit sur son propre barème, on recopie l'existant : il corrige
 * deux lignes au lieu d'en ressaisir huit, et le prix ne bouge pas tant qu'il
 * n'a rien changé.
 *
 * CE QUI RESTE GLOBAL. Les matières de panneau ont leur propre écran et leur
 * propre logique (une épaisseur, un prix au mètre carré) : elles ne font pas
 * partie de ce barème-ci, et l'écran le dit.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Bareme_Produit
 */
class AHNS_Bareme_Produit {

	/** La méta : le barème complet du produit. Absente = celui de la boutique. */
	const META = '_ahns_bareme';

	const NONCE = 'ahns_bareme_produit';

	/** Ce que l'écran montre, dans l'ordre où on le lit. */
	const LIGNES = array(
		'baseCents'         => array( 'Getting started', 'The production flat fee, whatever the size.', 'euros' ),
		'tubePerMeterCents' => array( 'Metre of LED tube', 'The price of one metre of installed tube.', 'euros' ),
		'dimmerRemoteCents' => array( 'Remote + dimmer', 'Added when the customer takes the option.', 'euros' ),
		'nightTimerCents'   => array( 'Night timer', 'BOUGHT-IN part: the default is not sourced, enter your supplier\'s price.', 'euros' ),
		'warrantyIndoorMonths'  => array( 'Commercial warranty, indoor (months)', 'ADDS to the legal guarantee, does not replace it. Under 24 months, it is not shown to consumers.', 'nombre' ),
		'warrantyOutdoorMonths' => array( 'Commercial warranty, outdoor (months)', 'Same. This setting is mostly used between businesses.', 'nombre' ),
		'parcelMaxLengthCm'     => array( 'Parcel: max length (cm)', 'Beyond that, the piece ships in panels. A SHIPPING rule, not a material one.', 'nombre' ),
		'parcelMaxWidthCm'      => array( 'Parcel: max width (cm)', 'Same. The defaults come from market practice, not from a data sheet.', 'nombre' ),
		'rgbFlatCents'      => array( 'RGB: flat fee', 'Added when the customer chooses colour-changing.', 'euros' ),
		'outdoorMultiplier' => array( 'Outdoor: multiplier', 'Multiplies the total for outdoor installation (1 = no effect).', 'coef' ),
		'expressMultiplier' => array( 'Express: multiplier', 'Multiplies the total for rush production.', 'coef' ),
		// LE DÉLAI N'ENTRE DANS AUCUN PRIX. Il est ici parce qu'il se règle par
		// produit comme le reste, et parce que le widget doit l'AFFICHER dans le
		// configurateur au lieu de le laisser aux CGV.
		'leadTimeMinDays'        => array( 'Standard lead time: minimum', 'Working days shown to the customer.', 'days' ),
		'leadTimeMaxDays'        => array( 'Standard lead time: maximum', 'Working days shown to the customer.', 'days' ),
		'leadTimeExpressMinDays' => array( 'Express lead time: minimum', 'Working days when the customer takes the option.', 'days' ),
		'leadTimeExpressMaxDays' => array( 'Express lead time: maximum', 'Working days when the customer takes the option.', 'days' ),
	);

	public function hooks() {
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_product', array( $this, 'save_meta' ), 10, 2 );
	}

	/**
	 * LE BARÈME DE CE PRODUIT, ou null s'il suit la boutique.
	 *
	 * @param int $product_id Produit.
	 * @return array<string, mixed>|null
	 */
	public static function pour( $product_id ) {
		$brut = get_post_meta( (int) $product_id, self::META, true );
		if ( ! is_array( $brut ) || ! $brut ) {
			return null;
		}
		return AHNS_Pricing::sanitize_overrides( $brut );
	}

	/** Ce produit a-t-il son propre barème ? */
	public static function propre( $product_id ) {
		return null !== self::pour( $product_id );
	}

	/** Le barème de la boutique, tel qu'il est enregistré. */
	public static function boutique() {
		return AHNS_Pricing::sanitize_overrides( (array) get_option( AHNS_Settings::OPTION, array() ) );
	}

	/**
	 * LES VALEURS EFFECTIVES d'un produit : les siennes, ou celles de la
	 * boutique complétées par les valeurs livrées. C'est ce que l'écran montre
	 * dans ses champs, et ce depuis quoi part une bascule.
	 *
	 * @param int $product_id Produit.
	 * @return array<string, mixed>
	 */
	public static function effectif( $product_id ) {
		$propre = self::pour( $product_id );
		$base   = array_merge( AHNS_Pricing::COEFF, self::boutique() );
		return null === $propre ? $base : array_merge( $base, $propre );
	}

	// -----------------------------------------------------------------------
	// Admin
	// -----------------------------------------------------------------------

	public function add_meta_box() {
		add_meta_box(
			'ahns-bareme',
			__( 'This sign’s price', 'ahime-neon-sign-configurator' ),
			array( $this, 'render_meta_box' ),
			'product',
			'normal',
			'default'
		);
	}

	/**
	 * @param WP_Post $post Produit édité.
	 */
	public function render_meta_box( $post ) {
		wp_nonce_field( self::NONCE, self::NONCE );

		if ( class_exists( 'AHNS_Product' ) && ! AHNS_Product::is_enabled( $post->ID ) ) {
			printf(
				'<p class="ahns-hint" style="margin:0;">%s</p>',
				esc_html__( 'This product is not sold through the configurator yet: the WooCommerce price applies.', 'ahime-neon-sign-configurator' )
			);
			return;
		}

		$propre    = self::propre( $post->ID );
		$valeurs   = self::effectif( $post->ID );
		$reglages  = class_exists( 'AHNS_Settings' ) ? admin_url( 'admin.php?page=' . AHNS_Settings::PAGE_SLUG ) : '';

		// LE CHOIX D'ABORD, LES CHAMPS ENSUITE. Montrer huit champs grisés
		// « pour information » invite à les changer sans le vouloir.
		printf(
			'<p style="margin-top:0;"><label style="display:block;margin:6px 0;"><input type="radio" name="ahns_bareme_mode" value="boutique"%s /> <strong>%s</strong></label>'
			. '<label style="display:block;margin:6px 0;"><input type="radio" name="ahns_bareme_mode" value="propre"%s /> <strong>%s</strong></label></p>',
			checked( ! $propre, true, false ),
			esc_html__( 'Same as the shop', 'ahime-neon-sign-configurator' ),
			checked( $propre, true, false ),
			esc_html__( 'Price scale of its own', 'ahime-neon-sign-configurator' )
		);

		if ( '' !== $reglages ) {
			printf(
				'<p class="ahns-hint">%s <a href="%s">%s</a></p>',
				esc_html__( 'The shop’s price scale - setup, tube, options - is set once and for all.', 'ahime-neon-sign-configurator' ),
				esc_url( $reglages ),
				esc_html__( 'Edit it', 'ahime-neon-sign-configurator' )
			);
		}

		printf(
			'<div id="ahns-bareme-champs"%s style="margin-top:12px;padding:14px 16px;border:1px solid #dcdcde;border-radius:8px;background:#fbfbfc;">',
			$propre ? '' : ' hidden'
		);
		printf(
			'<p class="ahns-hint" style="margin-top:0;">%s</p>',
			esc_html__( 'These values start from the shop’s. What you change here applies to this product only - and the whole scale becomes this one, nothing is inherited any more.', 'ahime-neon-sign-configurator' )
		);
		echo '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">';
		foreach ( AHNS_I18n::t_map( self::LIGNES ) as $cle => $ligne ) {
			$euros = 'euros' === $ligne[2];
			printf(
				'<label style="display:block;font-size:12px;font-weight:700;color:#50575e;">%s'
				. '<input type="number" name="ahns_bareme[%s]" value="%s" step="%s" min="0" style="width:100%%;margin-top:5px;" />'
				. '<span style="display:block;font-weight:400;margin-top:3px;">%s</span></label>',
				esc_html( $ligne[0] ),
				esc_attr( $cle ),
				// Les centimes sont une affaire de stockage : le marchand saisit
				// des euros, comme sur l'écran des Réglages.
				esc_attr( $euros ? number_format( ( (int) $valeurs[ $cle ] ) / 100, 2, '.', '' ) : (string) (float) $valeurs[ $cle ] ),
				$euros ? '0.01' : '0.01',
				esc_html( $ligne[1] )
			);
		}
		echo '</div>';
		printf(
			'<p style="margin:14px 0 0;"><label><input type="checkbox" name="ahns_bareme[marketingRounding]" value="1"%s /> %s</label></p>',
			checked( ! empty( $valeurs['marketingRounding'] ), true, false ),
			esc_html__( 'Round prices (€39, €49…)', 'ahime-neon-sign-configurator' )
		);
		printf(
			'<p class="ahns-hint" style="margin-bottom:0;">%s</p>',
			esc_html__( 'Panel materials keep their own screen and stay shared across the shop: their price depends on thickness and square metre, not on the range.', 'ahime-neon-sign-configurator' )
		);
		echo '</div>';

		// Le bloc n'apparaît que si le produit s'écarte : deux lignes suffisent,
		// et elles évitent un rechargement de page pour voir ses champs.
		echo '<script>(function(){'
			. 'var b=document.getElementById("ahns-bareme");if(!b)return;'
			. 'b.addEventListener("change",function(e){'
			. 'if("ahns_bareme_mode"!==e.target.name)return;'
			. 'document.getElementById("ahns-bareme-champs").hidden="propre"!==e.target.value;});'
			. '})();</script>';
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

		$mode = isset( $_POST['ahns_bareme_mode'] ) ? sanitize_key( wp_unslash( $_POST['ahns_bareme_mode'] ) ) : 'boutique';
		if ( 'propre' !== $mode ) {
			// REVENIR À LA BOUTIQUE EFFACE LE BARÈME. Le garder « au cas où »
			// ferait resurgir des prix d'il y a six mois le jour où le marchand
			// rebascule, sans qu'il s'y attende.
			delete_post_meta( $post_id, self::META );
			return;
		}

		// Assaini à la réception (texte), puis chaque champ est converti en nombre.
		$saisi   = isset( $_POST['ahns_bareme'] ) ? map_deep( (array) wp_unslash( $_POST['ahns_bareme'] ), 'sanitize_text_field' ) : array();
		$boutique = self::effectif( $post_id );
		$bareme  = array();

		foreach ( self::LIGNES as $cle => $ligne ) {
			$valeur = isset( $saisi[ $cle ] ) ? (float) $saisi[ $cle ] : 0.0;
			$bareme[ $cle ] = 'euros' === $ligne[2] ? (int) round( $valeur * 100 ) : $valeur;
		}
		$bareme['marketingRounding'] = ! empty( $saisi['marketingRounding'] );

		// LES PALIERS DE TAILLE SUIVENT LA BOUTIQUE tant que l'écran ne les
		// propose pas : un barème « propre » qui perdrait silencieusement les
		// paliers ferait chuter le prix des grandes pièces.
		if ( ! empty( $boutique['sizeTiers'] ) ) {
			$bareme['sizeTiers'] = $boutique['sizeTiers'];
		}

		update_post_meta( $post_id, self::META, AHNS_Pricing::sanitize_overrides( $bareme ) );
	}
}
