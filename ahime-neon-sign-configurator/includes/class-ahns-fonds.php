<?php
/**
 * LES FONDS DE SCÈNE — les décors sur lesquels le client voit son néon.
 *
 * L'extension en dessinait trois, en CSS : un mur sombre, un mur de brique, une
 * chambre. Ils ne coûtent rien à charger et ne se démodent pas, mais ils ne
 * ressemblent à aucune boutique en particulier. Un atelier qui vend des
 * enseignes de bar veut montrer un bar ; une boutique de décoration veut son
 * propre salon.
 *
 * LE MODÈLE, ET C'EST LE MÊME QUE POUR LE CATALOGUE :
 *
 *   LA BOUTIQUE TIENT LA BIBLIOTHÈQUE. Elle ajoute ses photos une fois, ici.
 *   CHAQUE CONFIGURATEUR CHOISIT ce qu'il propose parmi elles.
 *   LE CLIENT EN CHANGE dans la scène, d'un clic sur la barre des fonds.
 *
 * LES TROIS FONDS LIVRÉS NE SE SUPPRIMENT PAS. Ils sont dessinés par la feuille
 * de style du configurateur, pas stockés comme fichiers : ils survivent à une
 * médiathèque vidée, à une migration de serveur, à un marchand qui efface tout.
 * Une boutique doit toujours avoir de quoi montrer un néon — un configurateur
 * sans un seul fond n'est pas un configurateur.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Fonds
 */
class AHNS_Fonds {

	const OPTION    = 'ahns_fonds';
	const PAGE_SLUG = 'ahns-fonds';
	const NONCE     = 'ahns_save_fonds';

	/**
	 * Les décors livrés avec le widget, miroir de `catalog.ts` et
	 * `scene-decor.ts`.
	 *
	 * La démo du widget les exposait déjà avec `?fonds=tous`, mais l'extension
	 * WordPress ne transmettait encore que les trois historiques. Comme la clé
	 * `scenes` fournie par l'hôte est prioritaire, les vingt-huit nouveaux
	 * décors 3D devenaient alors inaccessibles chez le marchand alors qu'ils
	 * étaient bien présents dans le bundle.
	 *
	 * Les identifiants historiques ne changent pas : les boutiques installées
	 * gardent leurs choix. Les nouveaux sont absents de leurs anciens réglages,
	 * donc proposés par défaut selon la règle de `pour_widget()`.
	 */
	const LIVRES = array(
		'dark'          => 'Dark wall',
		'brick'         => 'Brick wall',
		'room'          => 'Bedroom',
		'maison'        => 'Cream wall',
		'salon'         => 'Living room',
		'bureau'        => 'Office',
		'comptoir'      => 'Counter',
		'atelier'       => 'Workshop',
		'etabli'        => 'Workbench',
		'vitrine'       => 'Shopfront',
		'lobby'         => 'Lobby',
		'nuit'          => 'Night',
		'papier'        => 'Paper',
		'barbier'       => 'Barber shop',
		'institut'      => 'Beauty salon',
		'cuisine'       => 'Kitchen',
		'bar'           => 'Bar',
		'epicerie'      => 'Grocery',
		'beton'         => 'Concrete',
		'planches'      => 'Planks',
		'calque'        => 'Tracing paper',
		'ardoise'       => 'Slate',
		'rue'           => 'Street',
		'podium'        => 'Podium',
		'reception'     => 'Reception',
		'conseil'       => 'Boardroom',
		'club'          => 'Club',
		'beton-nuit'    => 'Concrete at night',
		'gratte-ciel'   => 'Skyscraper',
		'lin'           => 'Linen',
		'platre'        => 'Plaster',
	);

	/**
	 * Les trois lieux propres à chaque peau, miroir de `themes.ts`.
	 *
	 * La bibliothèque reste complète dans l'administration, mais le client ne
	 * change de décor qu'à l'intérieur du même univers : un Salon propose un
	 * salon, un barbier et un institut — jamais une cuisine ou un gratte-ciel.
	 */
	const DOMAINES = array(
		'clair-boutique'      => array( 'dark', 'brick', 'room' ),
	);

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 14 );
		add_action( 'admin_post_ahns_save_fonds', array( $this, 'handle_save' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_media' ) );
	}

	public function add_menu() {
		add_submenu_page(
			AHNS_Dashboard::PAGE_SLUG,
			__( 'Scenes - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Scenes', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** La médiathèque sur cet écran : c'est par elle qu'on choisit une photo. */
	public function enqueue_media( $hook ) {
		if ( false !== strpos( (string) $hook, self::PAGE_SLUG ) ) {
			wp_enqueue_media();
		}
	}

	/**
	 * TOUS LES FONDS : les trois livrés, puis ceux de la boutique.
	 *
	 * @return array<string, array<string, mixed>> id => [nom, image, livre].
	 */
	public static function tous() {
		$out = array();
		foreach ( AHNS_I18n::t_map( self::LIVRES ) as $id => $nom ) {
			$out[ $id ] = array(
				'nom'   => is_array( $nom ) ? $nom[0] : $nom,
				'image' => '',
				'livre' => true,
			);
		}
		foreach ( (array) get_option( self::OPTION, array() ) as $fond ) {
			if ( ! is_array( $fond ) || empty( $fond['id'] ) || empty( $fond['image'] ) ) {
				continue;
			}
			$id = sanitize_key( (string) $fond['id'] );
			// UN FOND DE LA BOUTIQUE NE PEUT PAS ÉCRASER UN FOND LIVRÉ : sinon
			// une photo mal nommée ferait disparaître le mur sombre de toutes
			// les boutiques, sans que personne comprenne pourquoi.
			if ( '' === $id || isset( self::LIVRES[ $id ] ) ) {
				continue;
			}
			$out[ $id ] = array(
				'nom'   => isset( $fond['nom'] ) ? (string) $fond['nom'] : $id,
				'image' => (string) $fond['image'],
				'livre' => false,
			);
		}
		return $out;
	}

	/** Les fonds ajoutés par la boutique, seuls. */
	public static function de_la_boutique() {
		return array_filter( self::tous(), static fn( $f ) => empty( $f['livre'] ) );
	}

	/**
	 * LES FONDS QU'UN CONFIGURATEUR PROPOSE, prêts pour le widget.
	 *
	 * @param array<string, bool> $choix Ce que le configurateur a coché.
	 * @param string              $peau  Univers visuel du configurateur.
	 * @return array<int, array<string, string>>
	 */
	public static function pour_widget( array $choix, $peau = 'clair-boutique' ) {
		$out = array();
		$domaine = isset( self::DOMAINES[ $peau ] )
			? self::DOMAINES[ $peau ]
			: self::DOMAINES['clair-boutique'];
		$tous = self::tous();
		// Le domaine porte aussi l'ORDRE : son premier lieu est le décor par
		// défaut de la peau. Parcourir la bibliothèque globale ferait par exemple
		// passer `room` avant `maison` uniquement parce qu'il est historique.
		$ids = array_merge( $domaine, array_keys( self::de_la_boutique() ) );
		foreach ( $ids as $id ) {
			if ( ! isset( $tous[ $id ] ) ) {
				continue;
			}
			$fond = $tous[ $id ];
			// Absent du choix = proposé. Même règle que partout : ne rien dire,
			// c'est tout proposer — une boutique qui n'a jamais ouvert l'écran
			// garde ses décors.
			if ( isset( $choix[ $id ] ) && ! $choix[ $id ] ) {
				continue;
			}
			$out[] = array(
				'id'    => $id,
				'label' => $fond['nom'],
				'image' => $fond['image'],
			);
		}
		// JAMAIS AUCUN FOND. Un aperçu sans décor n'est pas un aperçu.
		if ( ! $out ) {
			$out[] = array( 'id' => 'dark', 'label' => AHNS_I18n::t( self::LIVRES['dark'] ), 'image' => '' );
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Admin
	// -----------------------------------------------------------------------

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( self::NONCE );

		$fonds = array();
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$noms   = isset( $_POST['fond_nom'] ) ? map_deep( (array) wp_unslash( $_POST['fond_nom'] ), 'sanitize_text_field' ) : array();
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$images = isset( $_POST['fond_image'] ) ? map_deep( (array) wp_unslash( $_POST['fond_image'] ), 'esc_url_raw' ) : array();

		foreach ( $images as $rang => $url ) {
			$url = esc_url_raw( (string) $url );
			if ( '' === $url ) {
				continue; // Une ligne vidée est une ligne supprimée.
			}
			$nom = isset( $noms[ $rang ] ) ? sanitize_text_field( (string) $noms[ $rang ] ) : '';
			$nom = '' !== trim( $nom ) ? mb_substr( $nom, 0, 40 ) : __( 'Untitled', 'ahime-neon-sign-configurator' );
			$fonds[] = array(
				// L'identifiant est DÉRIVÉ DU NOM, et stable tant que le nom ne
				// change pas : c'est lui que les configurateurs retiennent.
				'id'    => self::identifiant( $nom, $fonds ),
				'nom'   => $nom,
				'image' => $url,
			);
		}

		update_option( self::OPTION, $fonds );
		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * Un identifiant stable, tiré du nom, jamais en collision.
	 *
	 * @param string $nom   Nom saisi.
	 * @param array  $deja  Les fonds déjà retenus dans cet enregistrement.
	 * @return string
	 */
	private static function identifiant( $nom, array $deja ) {
		$base = sanitize_key( remove_accents( $nom ) );
		$base = '' !== $base ? $base : 'fond';
		if ( isset( self::LIVRES[ $base ] ) ) {
			$base = 'f-' . $base;
		}
		$id = $base;
		$n  = 2;
		$pris = wp_list_pluck( $deja, 'id' );
		while ( in_array( $id, $pris, true ) ) {
			$id = $base . '-' . $n;
			$n++;
		}
		return $id;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$boutique = self::de_la_boutique();

		AHNS_Admin_UI::open(
			__( 'Scenes', 'ahime-neon-sign-configurator' ),
			__( 'The scenes your customers see their sign in. Add your own; each configurator then picks the ones it offers.', 'ahime-neon-sign-configurator' )
		);
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['saved'] ) ) {
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Scenes saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="ahns_save_fonds" />';
		wp_nonce_field( self::NONCE );

		// --- Les trois livrés ---------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'The scenes we ship', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'Drawn by the configurator itself: they weigh nothing and cannot go missing. They cannot be deleted - a shop must always have something to show a sign in.', 'ahime-neon-sign-configurator' ) . '</p>';
		echo '<p>';
		foreach ( AHNS_I18n::t_map( self::LIVRES ) as $id => $nom ) {
			printf(
				'<span class="ahns-fond-livre" data-fond="%s">%s</span> ',
				esc_attr( $id ),
				esc_html( is_array( $nom ) ? $nom[0] : $nom )
			);
		}
		echo '</p>';
		AHNS_Admin_UI::card_close();

		// --- Ceux de la boutique -------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Your scenes', 'ahime-neon-sign-configurator' ) );
		echo '<p class="ahns-hint">' . esc_html__( 'A photo of your window, your workshop, a customer’s wall. Frame wide: the sign sits in the middle, and the scene is cropped to fill the frame.', 'ahime-neon-sign-configurator' ) . '</p>';

		echo '<div id="ahns-fonds">';
		$rang = 0;
		foreach ( $boutique as $fond ) {
			echo self::ligne( $rang, $fond['nom'], $fond['image'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- assemblé et échappé dans la méthode.
			$rang++;
		}
		echo '</div>';
		printf(
			'<p><button type="button" class="button" id="ahns-fond-ajouter">%s</button></p>',
			esc_html__( '+ Add a scene', 'ahime-neon-sign-configurator' )
		);
		AHNS_Admin_UI::card_close();

		printf(
			'<p style="margin-top:20px;"><button type="submit" class="button button-primary button-hero">%s</button></p>',
			esc_html__( 'Save', 'ahime-neon-sign-configurator' )
		);
		echo '</form>';

		self::styles_et_script( $rang );
		AHNS_Admin_UI::close();
	}

	/**
	 * Une ligne de la liste : la vignette, le nom, le bouton de médiathèque.
	 *
	 * @param int    $rang  Rang dans le formulaire.
	 * @param string $nom   Nom du fond.
	 * @param string $image URL de l'image.
	 * @return string
	 */
	private static function ligne( $rang, $nom = '', $image = '' ) {
		return sprintf(
			'<div class="ahns-fond">'
			. '<span class="ahns-fond__vue" style="background-image:url(%1$s);"></span>'
			. '<input type="text" name="fond_nom[%2$d]" value="%3$s" placeholder="%4$s" class="regular-text ahns-fond__nom" />'
			. '<input type="hidden" name="fond_image[%2$d]" value="%1$s" class="ahns-fond__url" />'
			. '<button type="button" class="button ahns-fond__choisir">%5$s</button>'
			. '<button type="button" class="button-link ahns-fond__retirer">%6$s</button>'
			. '</div>',
			esc_url( $image ),
			(int) $rang,
			esc_attr( $nom ),
			esc_attr__( 'Scene name (seen by your customers)', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Choose an image', 'ahime-neon-sign-configurator' ),
			esc_html__( 'Remove', 'ahime-neon-sign-configurator' )
		);
	}

	/**
	 * L'habillage et le script de l'écran.
	 *
	 * @param int $rang Prochain rang libre.
	 */
	private static function styles_et_script( $rang ) {
		echo '<style>'
			. '.ahns-fond{display:flex;align-items:center;gap:10px;margin:10px 0;}'
			. '.ahns-fond__vue{width:88px;height:58px;border-radius:8px;border:1px solid #dcdcde;'
			. 'background-color:#f1f1f3;background-size:cover;background-position:center;flex:none;}'
			. '.ahns-fond-livre{display:inline-block;padding:5px 11px;margin-right:6px;border-radius:999px;'
			. 'border:1px solid #dcdcde;background:#f6f7f7;font-size:12.5px;font-weight:700;}'
			. '</style>';

		// « Retirer » VIDE l'URL au lieu d'enlever la ligne du formulaire :
		// l'enregistrement ignore les lignes sans image, et les rangs des autres
		// ne bougent pas — un rang qui glisse, c'est un fond qui change de nom.
		printf(
			'<script>(function(){'
			. 'var liste=document.getElementById("ahns-fonds"),rang=%d;'
			. 'function brancher(n){'
			. 'n.querySelector(".ahns-fond__choisir").addEventListener("click",function(){'
			. 'var c=wp.media({title:%s,library:{type:"image"},multiple:false});'
			. 'c.on("select",function(){var a=c.state().get("selection").first().toJSON();'
			. 'n.querySelector(".ahns-fond__url").value=a.url;'
			. 'n.querySelector(".ahns-fond__vue").style.backgroundImage="url("+a.url+")";'
			. 'if(!n.querySelector(".ahns-fond__nom").value){n.querySelector(".ahns-fond__nom").value=a.title||"";}});'
			. 'c.open();});'
			. 'n.querySelector(".ahns-fond__retirer").addEventListener("click",function(){'
			. 'n.querySelector(".ahns-fond__url").value="";'
			. 'n.querySelector(".ahns-fond__vue").style.backgroundImage="";'
			. 'n.style.opacity=".45";});}'
			. 'liste.querySelectorAll(".ahns-fond").forEach(brancher);'
			. 'document.getElementById("ahns-fond-ajouter").addEventListener("click",function(){'
			. 'var d=document.createElement("div");d.innerHTML=%s.replace(/__R__/g,rang);'
			. 'var n=d.firstChild;liste.appendChild(n);brancher(n);rang++;});'
			. '})();</script>',
			(int) $rang,
			wp_json_encode( __( 'Choose a scene', 'ahime-neon-sign-configurator' ) ),
			wp_json_encode( str_replace( array( '[0]', 'name="fond_nom[__R__]"' ), array( '[__R__]', 'name="fond_nom[__R__]"' ), self::ligne( 0 ) ) )
		);
	}
}
