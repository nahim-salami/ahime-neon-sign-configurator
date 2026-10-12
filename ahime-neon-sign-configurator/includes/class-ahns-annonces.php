<?php
/**
 * Annonces — bandeaux, popups et comptes à rebours, quel que soit le thème.
 *
 * CE MODULE GÉNÉRALISE L'« OFFRE EN COURS » DU PACK LE DIRECT. Le pack n° 13
 * avait le seul bandeau à compte à rebours du dépôt, écrit dans son en-tête
 * et réglé par un écran à part ; le pack Maison avait un bandeau promotionnel
 * codé en dur dans sa composition. Ni l'un ni l'autre ne servait aux dix
 * autres packs — ni à un thème tiers. Ici, le marchand crée ses annonces
 * dans un écran du plugin, et le rendu passe par les crochets du thème
 * (`wp_body_open`, `wp_footer`) : n'importe quel thème de blocs les affiche.
 *
 * LA DOCTRINE EST CELLE DU DIRECT, REPRISE MOT POUR MOT : éteint par défaut,
 * aucune date = pas de compteur, date passée = annonce retirée — côté PHP au
 * rendu, et côté JS à la seconde près. JAMAIS de temps calculé en PHP dans
 * la page : un cache de page servirait un décompte figé ; seul `data-fin`
 * (ISO, fuseau du site) part dans le balisage, le navigateur fait le reste.
 *
 * LE BANDEAU SE POSE SOUS L'EN-TÊTE FIXE, PAS DERRIÈRE. Les packs Le Direct
 * et La Cité ont un en-tête `position: fixed` qui publie sa hauteur mesurée
 * dans `--entete-h` ; un bandeau posé en haut du flux serait recouvert. D'où
 * `margin-top: var(--entete-h, 0px)` : sous ces packs il glisse juste sous
 * la barre, ailleurs la variable n'existe pas et il colle en haut.
 *
 * MIGRATION : à l'ouverture de l'écran, si aucune annonce n'existe et que
 * `neon_light_direct_mot_offre` est renseignée, l'offre du Direct est
 * importée en bandeau à compte à rebours. Les options du thème ne sont PAS
 * effacées — le thème doit marcher sans le plugin. Le pattern du Direct
 * s'efface derrière `ahns_annonces_prend_la_main()` pour éviter le double
 * bandeau (garde `function_exists` côté thème).
 *
 * HORS PÉRIMÈTRE, ET C'EST ÉCRIT DANS L'ÉCRAN : le bandeau de consentement
 * aux cookies (le consentement est un sujet juridique, pas une annonce) et
 * la popup « ajouté au panier » avec ventes croisées (docs/13, version
 * suivante).
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Une annonce du plugin prend-elle la main sur le bandeau d'offre du thème ?
 *
 * Le pattern d'en-tête du pack Le Direct appelle cette fonction (gardée par
 * `function_exists`) avant de dessiner son propre bandeau : un bandeau du
 * plugin actif = le thème s'efface, sinon il garde le sien.
 *
 * @return bool
 */
function ahns_annonces_prend_la_main() {
	return class_exists( 'AHNS_Annonces' ) && count( AHNS_Annonces::actives( 'bandeau' ) ) > 0;
}

/**
 * Class AHNS_Annonces
 */
class AHNS_Annonces {

	const OPTION    = 'ahns_annonces';
	const PAGE_SLUG = 'ahns-annonces';

	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 15 );
		add_action( 'admin_post_ahns_annonces_enregistrer', array( $this, 'handle_save' ) );
		add_action( 'admin_post_ahns_annonces_action', array( $this, 'handle_action' ) );
		add_action( 'wp_body_open', array( $this, 'render_bandeaux' ) );
		add_action( 'wp_footer', array( $this, 'render_popups' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_front' ) );
	}

	/* ------------------------------------------------------------------ */
	/*  Données                                                            */
	/* ------------------------------------------------------------------ */

	/**
	 * Le gabarit d'une annonce : chaque champ existe toujours.
	 *
	 * @return array<string,mixed>
	 */
	public static function defauts() {
		return array(
			'id'               => '',
			'type'             => 'bandeau',
			'message'          => '',
			'lien'             => '',
			'libelle_lien'     => '',
			'date_fin'         => '',
			'compte_a_rebours' => false,
			'declencheur'      => 'immediat',
			'pages'            => 'toutes',
			'etat'             => 'eteint',
		);
	}

	/**
	 * Toutes les annonces enregistrées, normalisées.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function items() {
		$brut = get_option( self::OPTION, array() );
		if ( ! is_array( $brut ) ) {
			return array();
		}
		$items = array();
		foreach ( $brut as $item ) {
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$items[] = wp_parse_args( $item, self::defauts() );
			}
		}
		return $items;
	}

	/**
	 * Les annonces à afficher MAINTENANT, d'un type donné.
	 *
	 * Allumées, non échues, et — au front — visées sur la page courante.
	 * L'échéance est jugée dans le fuseau du site : une fin « 23 h 59 »
	 * veut dire 23 h 59 chez le marchand, pas à Greenwich.
	 *
	 * @param string $type bandeau|popup.
	 * @return array<int,array<string,mixed>>
	 */
	public static function actives( $type ) {
		$vivantes = array();
		foreach ( self::items() as $item ) {
			if ( $item['type'] !== $type || 'allume' !== $item['etat'] ) {
				continue;
			}
			if ( self::echue( $item['date_fin'] ) ) {
				continue;
			}
			$vivantes[] = $item;
		}
		return $vivantes;
	}

	/**
	 * La date de fin est-elle passée ? Vide = jamais.
	 *
	 * @param string $date Date locale « Y-m-d\TH:i:s » (fuseau du site).
	 * @return bool
	 */
	private static function echue( $date ) {
		if ( '' === (string) $date ) {
			return false;
		}
		try {
			$fin = new DateTimeImmutable( $date, wp_timezone() );
		} catch ( Exception $e ) {
			return true; // Une date illisible n'annonce rien.
		}
		return $fin->getTimestamp() <= time();
	}

	/**
	 * La date de fin en ISO 8601 avec décalage, pour `data-fin`.
	 *
	 * @param string $date Date locale.
	 * @return string
	 */
	private static function fin_iso( $date ) {
		if ( '' === (string) $date ) {
			return '';
		}
		try {
			$fin = new DateTimeImmutable( $date, wp_timezone() );
		} catch ( Exception $e ) {
			return '';
		}
		return $fin->format( 'c' );
	}

	/**
	 * L'annonce est-elle visée sur la page courante ?
	 *
	 * @param array $item Annonce.
	 * @return bool
	 */
	private static function visible_ici( $item ) {
		switch ( $item['pages'] ) {
			case 'accueil':
				return is_front_page();
			case 'boutique':
				return function_exists( 'is_woocommerce' ) && ( is_woocommerce() || is_cart() || is_checkout() );
			default:
				return true;
		}
	}

	/**
	 * Le message, borné à ce qu'un bandeau sait porter.
	 *
	 * @param string $brut Saisie du marchand.
	 * @return string
	 */
	private static function message_propre( $brut ) {
		return trim( wp_kses( (string) $brut, self::BALISES_MESSAGE ) );
	}

	/** Les seules balises qu'un message d'annonce peut porter. */
	const BALISES_MESSAGE = array(
		'b'      => array(),
		'strong' => array(),
		'em'     => array(),
		'br'     => array(),
	);

	/**
	 * Normalise une date de `datetime-local` — même contrat que le Direct :
	 * illisible = vide = pas de compteur.
	 *
	 * @param string $valeur Saisie.
	 * @return string
	 */
	private static function date_propre( $valeur ) {
		$valeur = trim( (string) $valeur );
		if ( '' === $valeur ) {
			return '';
		}
		try {
			$d = new DateTimeImmutable( $valeur, wp_timezone() );
		} catch ( Exception $e ) {
			return '';
		}
		return $d->format( 'Y-m-d\TH:i:s' );
	}

	/**
	 * Importe l'« Offre en cours » du pack Le Direct, une seule fois.
	 *
	 * Ne se déclenche que si AUCUNE annonce n'existe encore : on n'écrase
	 * jamais ce que le marchand a déjà composé ici. Les options du thème
	 * restent en place — le thème doit marcher sans le plugin.
	 */
	private static function migrer_direct() {
		if ( false !== get_option( self::OPTION, false ) ) {
			return;
		}
		$mot = (string) get_option( 'neon_light_direct_mot_offre', '' );
		$fin = (string) get_option( 'neon_light_direct_fin_offre', '' );
		if ( '' === trim( $mot ) ) {
			update_option( self::OPTION, array() );
			return;
		}
		update_option( self::OPTION, array(
			wp_parse_args( array(
				'id'               => self::nouvel_id(),
				'type'             => 'bandeau',
				'message'          => sanitize_text_field( $mot ),
				'date_fin'         => self::date_propre( $fin ),
				'compte_a_rebours' => '' !== $fin,
				'etat'             => self::echue( self::date_propre( $fin ) ) ? 'eteint' : 'allume',
			), self::defauts() ),
		) );
	}

	/** @return string Un identifiant court et stable. */
	private static function nouvel_id() {
		return substr( md5( uniqid( 'ahns', true ) ), 0, 8 );
	}

	/* ------------------------------------------------------------------ */
	/*  Écran                                                              */
	/* ------------------------------------------------------------------ */

	/**
	 * L'entrée de menu — sous le PACK quand il y en a un, sinon chez nous.
	 *
	 * Voir `AHNS_Admin_UI::site_sous_le_pack()`. Le bandeau et la popup sont
	 * du SITE, pas de la boutique : le marchand les cherche du côté de son
	 * thème. Ce qui déménage est l'entrée de menu, rien d'autre — le rendu
	 * continue de passer par `wp_body_open` et `wp_footer`, et l'écran reste
	 * dans le plugin pour rester disponible sous un thème de blocs tiers.
	 *
	 * LA CAPACITÉ RESTE `manage_woocommerce`, PLUS LARGE QUE CELLE DU PACK
	 * (`edit_theme_options`). WordPress s'en arrange : quand un utilisateur
	 * n'a que la nôtre, il garde le menu du pack et fait pointer son titre
	 * vers le premier écran qu'il a le droit d'ouvrir. Personne ne se retrouve
	 * devant une entrée qui refuse de s'ouvrir, ni devant un écran devenu
	 * introuvable.
	 */
	public function add_menu() {
		add_submenu_page(
			AHNS_Admin_UI::parent_du_site(),
			__( 'Announcements - Ahime Neon', 'ahime-neon-sign-configurator' ),
			__( 'Announcements', 'ahime-neon-sign-configurator' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		self::migrer_direct();

		$items = self::items();

		// L'annonce en cours de modification, s'il y en a une.
		$modifier = isset( $_GET['modifier'] ) ? sanitize_key( wp_unslash( $_GET['modifier'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
		$en_cours = self::defauts();
		foreach ( $items as $item ) {
			if ( $item['id'] === $modifier ) {
				$en_cours = $item;
				break;
			}
		}

		AHNS_Admin_UI::open(
			__( 'Announcements', 'ahime-neon-sign-configurator' ),
			__( 'Banners, popups and countdowns - on your shop, whatever the theme.', 'ahime-neon-sign-configurator' )
		);

		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- lecture d'un paramètre d'affichage ou de navigation, aucune écriture.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Announcement saved.', 'ahime-neon-sign-configurator' ) . '</p></div>';
		}

		// ---- La liste -------------------------------------------------
		AHNS_Admin_UI::card_open( __( 'Your announcements', 'ahime-neon-sign-configurator' ) );
		if ( ! $items ) {
			echo '<p>' . esc_html__( 'No announcement yet. Compose the first one just below - it stays off until you switch it on.', 'ahime-neon-sign-configurator' ) . '</p>';
		} else {
			echo '<table class="widefat striped"><thead><tr>';
			echo '<th>' . esc_html__( 'Message', 'ahime-neon-sign-configurator' ) . '</th>';
			echo '<th>' . esc_html__( 'Type', 'ahime-neon-sign-configurator' ) . '</th>';
			echo '<th>' . esc_html__( 'End', 'ahime-neon-sign-configurator' ) . '</th>';
			echo '<th>' . esc_html__( 'Status', 'ahime-neon-sign-configurator' ) . '</th>';
			echo '<th></th>';
			echo '</tr></thead><tbody>';
			foreach ( $items as $item ) {
				$echue = self::echue( $item['date_fin'] );
				echo '<tr>';
				echo '<td>' . esc_html( wp_strip_all_tags( $item['message'] ) ) . '</td>';
				echo '<td>' . esc_html( 'popup' === $item['type'] ? __( 'Popup', 'ahime-neon-sign-configurator' ) : __( 'Banner', 'ahime-neon-sign-configurator' ) ) . '</td>';
				echo '<td>' . esc_html( '' === $item['date_fin'] ? __( 'No end date', 'ahime-neon-sign-configurator' ) : wp_date( 'j F Y · H\hi', ( new DateTimeImmutable( $item['date_fin'], wp_timezone() ) )->getTimestamp() ) ) . '</td>';
				echo '<td>';
				if ( $echue ) {
					echo wp_kses( AHNS_Admin_UI::badge( __( 'Expired', 'ahime-neon-sign-configurator' ), 'locked' ), AHNS_Admin_UI::allowed_html() );
				} elseif ( 'allume' === $item['etat'] ) {
					echo wp_kses( AHNS_Admin_UI::badge( __( 'On', 'ahime-neon-sign-configurator' ), 'ok' ), AHNS_Admin_UI::allowed_html() );
				} else {
					echo wp_kses( AHNS_Admin_UI::badge( __( 'Off', 'ahime-neon-sign-configurator' ), 'todo' ), AHNS_Admin_UI::allowed_html() );
				}
				echo '</td>';
				echo '<td style="text-align:right;white-space:nowrap">';
				$basculer = wp_nonce_url(
					admin_url( 'admin-post.php?action=ahns_annonces_action&faire=' . ( 'allume' === $item['etat'] ? 'eteindre' : 'allumer' ) . '&annonce=' . rawurlencode( $item['id'] ) ),
					'ahns_annonces_action'
				);
				$supprimer = wp_nonce_url(
					admin_url( 'admin-post.php?action=ahns_annonces_action&faire=supprimer&annonce=' . rawurlencode( $item['id'] ) ),
					'ahns_annonces_action'
				);
				printf(
					'<a href="%s">%s</a> · <a href="%s">%s</a> · <a href="%s" onclick="return confirm(%s)">%s</a>',
					esc_url( $basculer ),
					esc_html( 'allume' === $item['etat'] ? __( 'Switch off', 'ahime-neon-sign-configurator' ) : __( 'Switch on', 'ahime-neon-sign-configurator' ) ),
					esc_url( add_query_arg( array( 'page' => self::PAGE_SLUG, 'modifier' => $item['id'] ), admin_url( 'admin.php' ) ) ),
					esc_html__( 'Edit', 'ahime-neon-sign-configurator' ),
					esc_url( $supprimer ),
					esc_attr( wp_json_encode( __( 'Delete this announcement?', 'ahime-neon-sign-configurator' ) ) ),
					esc_html__( 'Delete', 'ahime-neon-sign-configurator' )
				);
				echo '</td></tr>';
			}
			echo '</tbody></table>';
		}
		AHNS_Admin_UI::card_close();

		// ---- Le formulaire -------------------------------------------
		AHNS_Admin_UI::card_open(
			'' !== $en_cours['id']
				? __( 'Edit the announcement', 'ahime-neon-sign-configurator' )
				: __( 'New announcement', 'ahime-neon-sign-configurator' )
		);
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<?php wp_nonce_field( 'ahns_annonces_enregistrer' ); ?>
			<input type="hidden" name="action" value="ahns_annonces_enregistrer" />
			<input type="hidden" name="annonce_id" value="<?php echo esc_attr( $en_cours['id'] ); ?>" />

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Type', 'ahime-neon-sign-configurator' ); ?></th>
					<td>
						<label><input type="radio" name="annonce_type" value="bandeau" <?php checked( 'bandeau', $en_cours['type'] ); ?> /> <?php esc_html_e( 'Banner - one line at the top of the page', 'ahime-neon-sign-configurator' ); ?></label><br />
						<label><input type="radio" name="annonce_type" value="popup" <?php checked( 'popup', $en_cours['type'] ); ?> /> <?php esc_html_e( 'Popup - a card over the page', 'ahime-neon-sign-configurator' ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="annonce_message"><?php esc_html_e( 'Message', 'ahime-neon-sign-configurator' ); ?></label></th>
					<td>
						<textarea id="annonce_message" name="annonce_message" rows="2" class="large-text"><?php echo esc_textarea( $en_cours['message'] ); ?></textarea>
						<p class="description"><?php esc_html_e( 'Bold and italics allowed (<b>, <em>). Everything else is stripped.', 'ahime-neon-sign-configurator' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="annonce_lien"><?php esc_html_e( 'Link (optional)', 'ahime-neon-sign-configurator' ); ?></label></th>
					<td>
						<input type="url" id="annonce_lien" name="annonce_lien" value="<?php echo esc_attr( $en_cours['lien'] ); ?>" class="regular-text" placeholder="https://" />
						<input type="text" name="annonce_libelle_lien" value="<?php echo esc_attr( $en_cours['libelle_lien'] ); ?>" class="regular-text" placeholder="<?php esc_attr_e( 'Link label - “Count me in”', 'ahime-neon-sign-configurator' ); ?>" />
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="annonce_date_fin"><?php esc_html_e( 'End of the announcement', 'ahime-neon-sign-configurator' ); ?></label></th>
					<td>
						<input type="datetime-local" id="annonce_date_fin" name="annonce_date_fin" value="<?php echo esc_attr( $en_cours['date_fin'] ); ?>" />
						<label style="margin-inline-start:12px"><input type="checkbox" name="annonce_compte_a_rebours" value="1" <?php checked( true, (bool) $en_cours['compte_a_rebours'] ); ?> /> <?php esc_html_e( 'Show the countdown', 'ahime-neon-sign-configurator' ); ?></label>
						<p class="description"><?php esc_html_e( 'Your shop’s local time. No date: the announcement never ends, and the countdown has nothing to count. Past date: the announcement removes itself.', 'ahime-neon-sign-configurator' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="annonce_declencheur"><?php esc_html_e( 'Opening (popup)', 'ahime-neon-sign-configurator' ); ?></label></th>
					<td>
						<select id="annonce_declencheur" name="annonce_declencheur">
							<option value="immediat" <?php selected( 'immediat', $en_cours['declencheur'] ); ?>><?php esc_html_e( 'When the page loads', 'ahime-neon-sign-configurator' ); ?></option>
							<option value="intention_sortie" <?php selected( 'intention_sortie', $en_cours['declencheur'] ); ?>><?php esc_html_e( 'On exit intent (on touch screens: after 30 s)', 'ahime-neon-sign-configurator' ); ?></option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="annonce_pages"><?php esc_html_e( 'On which pages', 'ahime-neon-sign-configurator' ); ?></label></th>
					<td>
						<select id="annonce_pages" name="annonce_pages">
							<option value="toutes" <?php selected( 'toutes', $en_cours['pages'] ); ?>><?php esc_html_e( 'The whole site', 'ahime-neon-sign-configurator' ); ?></option>
							<option value="accueil" <?php selected( 'accueil', $en_cours['pages'] ); ?>><?php esc_html_e( 'The home page', 'ahime-neon-sign-configurator' ); ?></option>
							<option value="boutique" <?php selected( 'boutique', $en_cours['pages'] ); ?>><?php esc_html_e( 'The shop (catalogue, product pages, cart)', 'ahime-neon-sign-configurator' ); ?></option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Status', 'ahime-neon-sign-configurator' ); ?></th>
					<td>
						<label><input type="checkbox" name="annonce_etat" value="1" <?php checked( 'allume', $en_cours['etat'] ); ?> /> <?php esc_html_e( 'On - visible on the shop', 'ahime-neon-sign-configurator' ); ?></label>
						<p class="description"><?php esc_html_e( 'Off by default: nothing reaches the storefront without a deliberate action.', 'ahime-neon-sign-configurator' ); ?></p>
					</td>
				</tr>
			</table>
			<p>
				<button type="submit" class="button button-primary"><?php echo esc_html( '' !== $en_cours['id'] ? __( 'Save changes', 'ahime-neon-sign-configurator' ) : __( 'Create the announcement', 'ahime-neon-sign-configurator' ) ); ?></button>
				<?php if ( '' !== $en_cours['id'] ) : ?>
					<a class="button" href="<?php echo esc_url( add_query_arg( 'page', self::PAGE_SLUG, admin_url( 'admin.php' ) ) ); ?>"><?php esc_html_e( 'Cancel', 'ahime-neon-sign-configurator' ); ?></a>
				<?php endif; ?>
			</p>
		</form>
		<?php
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::card_open( __( 'What this screen does not do', 'ahime-neon-sign-configurator' ) );
		echo '<p>' . esc_html__( 'The cookie consent banner is not an announcement: it is a legal matter, handled separately. The “added to cart” popup with suggestions will come in a later version.', 'ahime-neon-sign-configurator' ) . '</p>';
		AHNS_Admin_UI::card_close();

		AHNS_Admin_UI::close();
	}

	/* ------------------------------------------------------------------ */
	/*  Enregistrement                                                     */
	/* ------------------------------------------------------------------ */

	public function handle_save() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_annonces_enregistrer' );

		$id    = isset( $_POST['annonce_id'] ) ? sanitize_key( wp_unslash( $_POST['annonce_id'] ) ) : '';
		$type  = ( isset( $_POST['annonce_type'] ) && 'popup' === sanitize_key( wp_unslash( $_POST['annonce_type'] ) ) ) ? 'popup' : 'bandeau';
		// Chaque champ est assaini à la réception, puis réduit à ses valeurs permises.
		$declencheur = isset( $_POST['annonce_declencheur'] ) ? sanitize_key( wp_unslash( $_POST['annonce_declencheur'] ) ) : '';
		$pages       = isset( $_POST['annonce_pages'] ) ? sanitize_key( wp_unslash( $_POST['annonce_pages'] ) ) : '';
		$item  = wp_parse_args( array(
			'id'               => '' !== $id ? $id : self::nouvel_id(),
			'type'             => $type,
			'message'          => isset( $_POST['annonce_message'] ) ? self::message_propre( wp_kses( wp_unslash( $_POST['annonce_message'] ), self::BALISES_MESSAGE ) ) : '',
			'lien'             => isset( $_POST['annonce_lien'] ) ? esc_url_raw( wp_unslash( $_POST['annonce_lien'] ) ) : '',
			'libelle_lien'     => isset( $_POST['annonce_libelle_lien'] ) ? sanitize_text_field( wp_unslash( $_POST['annonce_libelle_lien'] ) ) : '',
			'date_fin'         => isset( $_POST['annonce_date_fin'] ) ? self::date_propre( sanitize_text_field( wp_unslash( $_POST['annonce_date_fin'] ) ) ) : '',
			'compte_a_rebours' => ! empty( $_POST['annonce_compte_a_rebours'] ),
			'declencheur'      => 'intention_sortie' === $declencheur ? 'intention_sortie' : 'immediat',
			'pages'            => in_array( $pages, array( 'accueil', 'boutique' ), true ) ? $pages : 'toutes',
			'etat'             => empty( $_POST['annonce_etat'] ) ? 'eteint' : 'allume',
		), self::defauts() );

		$items  = self::items();
		$trouve = false;
		foreach ( $items as $i => $existant ) {
			if ( $existant['id'] === $item['id'] ) {
				$items[ $i ] = $item;
				$trouve      = true;
				break;
			}
		}
		if ( ! $trouve ) {
			$items[] = $item;
		}
		update_option( self::OPTION, array_values( $items ) );

		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE_SLUG, 'saved' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function handle_action() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'ahime-neon-sign-configurator' ) );
		}
		check_admin_referer( 'ahns_annonces_action' );

		$id    = isset( $_GET['annonce'] ) ? sanitize_key( wp_unslash( $_GET['annonce'] ) ) : '';
		$faire = isset( $_GET['faire'] ) ? sanitize_key( wp_unslash( $_GET['faire'] ) ) : '';
		$items = self::items();

		foreach ( $items as $i => $item ) {
			if ( $item['id'] !== $id ) {
				continue;
			}
			if ( 'supprimer' === $faire ) {
				unset( $items[ $i ] );
			} elseif ( 'allumer' === $faire ) {
				$items[ $i ]['etat'] = 'allume';
			} elseif ( 'eteindre' === $faire ) {
				$items[ $i ]['etat'] = 'eteint';
			}
			break;
		}
		update_option( self::OPTION, array_values( $items ) );

		wp_safe_redirect( add_query_arg( 'page', self::PAGE_SLUG, admin_url( 'admin.php' ) ) );
		exit;
	}

	/* ------------------------------------------------------------------ */
	/*  Rendu public                                                       */
	/* ------------------------------------------------------------------ */

	/** Y a-t-il quelque chose à montrer sur cette page ? */
	private static function a_montrer() {
		foreach ( array( 'bandeau', 'popup' ) as $type ) {
			foreach ( self::actives( $type ) as $item ) {
				if ( self::visible_ici( $item ) ) {
					return true;
				}
			}
		}
		return false;
	}

	public function enqueue_front() {
		if ( is_admin() || ! self::a_montrer() ) {
			return;
		}
		wp_enqueue_script( 'ahns-annonces', AHNS_PLUGIN_URL . 'assets/annonces.js', array(), AHNS_VERSION, true );
		$this->print_styles();
	}

	/**
	 * La feuille du module, mise en file (wp_add_inline_style) seulement quand une annonce s'affiche.
	 *
	 * Les couleurs LISENT LES PRESETS DU PACK avec un repli neutre : un pack
	 * qui déclare « marque » et « sur-marque » habille l'annonce sans une
	 * ligne de CSS ; un thème tiers reçoit du sombre sur clair, lisible
	 * partout.
	 */
	public function print_styles() {
		if ( ! self::a_montrer() ) {
			return;
		}
		AHNS_Admin_UI::inline_css(
			'ahns-annonces',
			'.ahns-annonce--bandeau{margin-top:var(--entete-h,0px);background:var(--wp--preset--color--marque,#171923);color:var(--wp--preset--color--sur-marque,#fff);font-size:14px;line-height:1.45;position:relative;z-index:35}'
			. '.ahns-annonce--bandeau .ahns-annonce__ligne{max-width:1116px;margin-inline:auto;padding:10px 44px 10px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 18px;text-align:center}'
			. '.ahns-annonce--bandeau a{color:inherit;font-weight:700;text-decoration:underline}'
			. '.ahns-annonce__fermer{position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:0;border-radius:999px;background:none;color:inherit;opacity:.7;cursor:pointer;font-size:14px}'
			. '.ahns-annonce__fermer:hover,.ahns-annonce__fermer:focus-visible{opacity:1;background:rgba(255,255,255,.16)}'
			. '.ahns-compteur{display:inline-flex;gap:10px;font-variant-numeric:tabular-nums}'
			. '.ahns-compteur__bloc{display:inline-grid;justify-items:center;line-height:1.1}'
			. '.ahns-compteur__bloc b{font-size:15px}'
			. '.ahns-compteur__bloc span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}'
			. '.ahns-annonce--popup{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,10,16,.55)}'
			. '.ahns-annonce--popup[hidden]{display:none}'
			. '.ahns-annonce__carte{position:relative;max-width:420px;width:100%;background:var(--wp--preset--color--carte,#fff);color:var(--wp--preset--color--encre,#171923);border-radius:16px;padding:34px 28px 28px;box-shadow:0 30px 80px rgba(10,10,16,.35);text-align:center}'
			. '.ahns-annonce__carte .ahns-annonce__message{display:block;font-size:17px;font-weight:600;line-height:1.4}'
			. '.ahns-annonce__carte .ahns-compteur{margin-top:16px}'
			. '.ahns-annonce__carte .ahns-annonce__lien{display:inline-block;margin-top:18px;padding:11px 24px;border-radius:999px;background:var(--wp--preset--color--marque,#171923);color:var(--wp--preset--color--sur-marque,#fff);font-weight:700;text-decoration:none}'
			. '.ahns-annonce__carte .ahns-annonce__fermer{inset-inline-end:8px;top:8px;transform:none;color:inherit}'
			. '.ahns-annonce__carte .ahns-annonce__fermer:hover,.ahns-annonce__carte .ahns-annonce__fermer:focus-visible{background:rgba(10,10,16,.08)}'
			. '@media (prefers-reduced-motion: no-preference){.ahns-annonce__carte{animation:ahns-annonce-entree .25s ease-out}@keyframes ahns-annonce-entree{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}}'
		);
	}

	/**
	 * Le compteur — le balisage du pack Le Direct, sous des classes du plugin.
	 *
	 * @param array $item Annonce.
	 * @return string
	 */
	private static function compteur_html( $item ) {
		if ( empty( $item['compte_a_rebours'] ) || '' === $item['date_fin'] ) {
			return '';
		}
		$iso = self::fin_iso( $item['date_fin'] );
		if ( '' === $iso ) {
			return '';
		}
		$unites = array(
			'jours'    => __( 'days', 'ahime-neon-sign-configurator' ),
			'heures'   => __( 'hours', 'ahime-neon-sign-configurator' ),
			'minutes'  => __( 'minutes', 'ahime-neon-sign-configurator' ),
			'secondes' => __( 'seconds', 'ahime-neon-sign-configurator' ),
		);
		$html = '<span class="ahns-compteur" data-fin="' . esc_attr( $iso ) . '" role="timer" aria-label="' . esc_attr__( 'End of the offer', 'ahime-neon-sign-configurator' ) . '">';
		foreach ( $unites as $unite => $libelle ) {
			$html .= '<span class="ahns-compteur__bloc"><b data-unite="' . esc_attr( $unite ) . '">--</b><span>' . esc_html( $libelle ) . '</span></span>';
		}
		return $html . '</span>';
	}

	/** Les bandeaux, en tout début de corps de page. */
	public function render_bandeaux() {
		foreach ( self::actives( 'bandeau' ) as $item ) {
			if ( ! self::visible_ici( $item ) ) {
				continue;
			}
			echo '<div class="ahns-annonce ahns-annonce--bandeau" data-ahns-annonce="' . esc_attr( $item['id'] ) . '">';
			echo '<div class="ahns-annonce__ligne">';
			echo '<span class="ahns-annonce__message">' . wp_kses_post( $item['message'] ) . '</span>';
			echo wp_kses( self::compteur_html( $item ), AHNS_Admin_UI::allowed_html() );
			if ( '' !== $item['lien'] ) {
				echo '<a class="ahns-annonce__lien" href="' . esc_url( $item['lien'] ) . '">' . esc_html( '' !== $item['libelle_lien'] ? $item['libelle_lien'] : __( 'Count me in', 'ahime-neon-sign-configurator' ) ) . '</a>';
			}
			echo '<button type="button" class="ahns-annonce__fermer" data-ahns-fermer aria-label="' . esc_attr__( 'Close the banner', 'ahime-neon-sign-configurator' ) . '">✕</button>';
			echo '</div></div>';
		}
	}

	/** Les popups, en fin de page, fermées tant que le script ne décide rien. */
	public function render_popups() {
		if ( is_admin() ) {
			return;
		}
		foreach ( self::actives( 'popup' ) as $item ) {
			if ( ! self::visible_ici( $item ) ) {
				continue;
			}
			echo '<div class="ahns-annonce ahns-annonce--popup" data-ahns-annonce="' . esc_attr( $item['id'] ) . '" data-ahns-declencheur="' . esc_attr( $item['declencheur'] ) . '" role="dialog" aria-modal="true" aria-label="' . esc_attr( wp_strip_all_tags( $item['message'] ) ) . '" hidden>';
			echo '<div class="ahns-annonce__carte">';
			echo '<button type="button" class="ahns-annonce__fermer" data-ahns-fermer aria-label="' . esc_attr__( 'Close', 'ahime-neon-sign-configurator' ) . '">✕</button>';
			echo '<span class="ahns-annonce__message">' . wp_kses_post( $item['message'] ) . '</span>';
			echo wp_kses( self::compteur_html( $item ), AHNS_Admin_UI::allowed_html() );
			if ( '' !== $item['lien'] ) {
				echo '<a class="ahns-annonce__lien" href="' . esc_url( $item['lien'] ) . '">' . esc_html( '' !== $item['libelle_lien'] ? $item['libelle_lien'] : __( 'Count me in', 'ahime-neon-sign-configurator' ) ) . '</a>';
			}
			echo '</div></div>';
		}
	}
}
