<?php
/**
 * Hébergement des modèles de réalité augmentée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER DOIT EXISTER
 *
 * AR Quick Look suit un `<a rel="ar" href=…>` et Scene Viewer une intention
 * `?file=…`. Dans les deux cas ce n'est pas la page qui ouvre le modèle : c'est
 * le SYSTÈME D'EXPLOITATION, hors du navigateur. Un `blob:` fabriqué dans la
 * page lui est donc inaccessible, et aucune astuce côté client n'y changera
 * rien. **Il n'y a pas de réalité augmentée sans une adresse publique.**
 *
 * Le widget sait construire l'USDZ et le GLB tout seul (`@neon/core`). Ce qui
 * lui manque est un endroit où les poser le temps d'un clic. C'est tout le
 * travail de ce fichier — et c'est déjà bien assez, parce qu'il ouvre un dépôt
 * de fichiers SANS AUTHENTIFICATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON A REFUSÉ DE FAIRE
 *
 * `wp_handle_upload` aurait été plus court. On ne s'en sert pas : il verse dans
 * la médiathèque, où le fichier reste, se retrouve dans les sauvegardes, et
 * apparaît au marchand comme un document qu'il a voulu. Un modèle de RA vit
 * quelques minutes ; il n'a rien à faire dans une bibliothèque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE VERROUS
 *
 * 1. **Nonce**, le même que le panier : le dépôt ne s'ouvre que depuis une page
 *    du site qui porte réellement le configurateur.
 * 2. **Taille bornée** à 8 Mio. Un néon de 25 m de tube pèse quelques centaines
 *    de kilooctets ; le plafond est là pour l'abus, pas pour le produit.
 * 3. **Signature vérifiée** — `PK` pour l'USDZ (un zip), `glTF` pour le GLB. Le
 *    nom du fichier est décidé ICI, à partir du type reconnu, jamais repris de
 *    ce que le client envoie.
 * 4. **Durée de vie d'une heure**, purgée à chaque dépôt et par une tâche
 *    quotidienne. Un dépôt sans expiration devient un hébergeur gratuit.
 */

defined( 'ABSPATH' ) || exit;

class AHNS_Ar {

	/** Sous-dossier des dépôts, dans `uploads`. */
	const DOSSIER = 'ahns-ar';

	/** Huit mébioctets : cent fois un modèle courant, et rien de plus. */
	const MAX_OCTETS = 8388608;

	/** Une heure. Le temps d'un clic, pas celui d'un hébergement. */
	const DUREE_S = 3600;

	/** Rendez-vous de la purge quotidienne. */
	const CRON = 'ahns_ar_purge';

	public function hooks() {
		add_action( 'wp_ajax_ahns_ar_model', array( $this, 'handle_depot' ) );
		add_action( 'wp_ajax_nopriv_ahns_ar_model', array( $this, 'handle_depot' ) );
		add_action( self::CRON, array( __CLASS__, 'purger' ) );
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
		}
	}

	/** Le dossier de dépôt, créé au besoin. `array( chemin, url )`. */
	private static function dossier() {
		$up = wp_upload_dir();
		if ( ! empty( $up['error'] ) ) {
			return null;
		}
		$dir = trailingslashit( $up['basedir'] ) . self::DOSSIER;
		if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
			return null;
		}
		// Pas d'index de dossier : la liste des modèles déposés dirait qui
		// configure quoi, en ce moment, sur cette boutique.
		if ( ! file_exists( $dir . '/index.html' ) ) {
			self::ecrire( $dir . '/index.html', '' );
		}
		return array( $dir, trailingslashit( $up['baseurl'] ) . self::DOSSIER );
	}

	/**
	 * Le type reconnu D'APRÈS LE CONTENU, ou `null`.
	 *
	 * C'est ici que se décide l'extension du fichier écrit. Reprendre celle que
	 * le client annonce reviendrait à le laisser choisir ce que le serveur
	 * publie — et un serveur mal configuré exécute ce qu'on lui donne à publier.
	 */
	private static function type_reconnu( $octets ) {
		if ( strlen( $octets ) < 8 ) {
			return null;
		}
		// USDZ : un zip, donc l'en-tête local « PK\x03\x04 ».
		if ( "PK\x03\x04" === substr( $octets, 0, 4 ) ) {
			return array( 'usdz', 'model/vnd.usdz+zip' );
		}
		// GLB : le magique « glTF » du conteneur binaire.
		if ( 'glTF' === substr( $octets, 0, 4 ) ) {
			return array( 'glb', 'model/gltf-binary' );
		}
		return null;
	}

	/**
	 * Une chaîne base64 stricte, ou la chaîne vide.
	 *
	 * @param mixed $brut Valeur reçue.
	 * @return string
	 */
	private static function base64_strict( $brut ) {
		if ( ! is_string( $brut ) ) {
			return '';
		}
		return 1 === preg_match( '#^[A-Za-z0-9+/]+={0,2}$#', $brut ) ? $brut : '';
	}

	/** Dépôt d'un modèle. Répond `{ url, expire }`. */
	public function handle_depot() {
		if ( ! check_ajax_referer( AHNS_Cart::NONCE_ACTION, 'nonce', false ) ) {
			wp_send_json_error( __( 'Invalid security token. Reload the page.', 'ahime-neon-sign-configurator' ), 403 );
		}

		// Le corps arrive en base64 dans un champ POST plutôt qu'en `multipart`.
		// Le widget n'a pas de formulaire : il a un `Uint8Array` en mémoire, et
		// un `FormData` obligerait à fabriquer un `File` pour rien.
		// Assaini à la réception : seul l'alphabet base64 passe, tout autre octet
		// fait refuser le dépôt entier (on ne « nettoie » pas un binaire).
		$b64 = isset( $_POST['modele'] ) ? self::base64_strict( wp_unslash( $_POST['modele'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- validé par base64_strict().
		// On borne AVANT de décoder : refuser après aurait déjà coûté la
		// mémoire qu'on refuse.
		if ( '' === $b64 || strlen( $b64 ) > (int) ( self::MAX_OCTETS * 1.4 ) ) {
			wp_send_json_error( __( 'Model missing or too large.', 'ahime-neon-sign-configurator' ), 413 );
		}
		$octets = base64_decode( $b64, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- modèle 3D envoyé par le widget, vérifié par sa signature binaire.
		if ( false === $octets || strlen( $octets ) > self::MAX_OCTETS ) {
			wp_send_json_error( __( 'Model missing or too large.', 'ahime-neon-sign-configurator' ), 413 );
		}

		$type = self::type_reconnu( $octets );
		if ( null === $type ) {
			wp_send_json_error( __( 'Unrecognised model format.', 'ahime-neon-sign-configurator' ), 415 );
		}

		$d = self::dossier();
		if ( null === $d ) {
			wp_send_json_error( __( 'The upload folder is not accessible.', 'ahime-neon-sign-configurator' ), 500 );
		}
		list( $dir, $url ) = $d;

		// Chaque dépôt purge : la tâche quotidienne est un filet, pas le
		// mécanisme. Une boutique dont le cron ne tourne pas — c'est courant,
		// WP-Cron dépend du trafic — ne doit pas accumuler pour autant.
		self::purger();

		// Le nom ne vient PAS du client : 32 caractères aléatoires, et
		// l'extension décidée d'après le contenu reconnu plus haut.
		$nom     = wp_generate_password( 32, false, false ) . '.' . $type[0];
		$chemin  = $dir . '/' . $nom;
		$ecrit   = self::ecrire( $chemin, $octets );
		if ( ! $ecrit ) {
			wp_send_json_error( __( 'The model could not be saved.', 'ahime-neon-sign-configurator' ), 500 );
		}

		wp_send_json_success(
			array(
				'url'    => $url . '/' . $nom,
				'expire' => time() + self::DUREE_S,
			)
		);
	}

	/**
	 * Écrit un fichier du dossier de dépôt par l'API de fichiers de WordPress.
	 *
	 * @param string $chemin  Fichier, dans le dossier de dépôt (uploads).
	 * @param string $contenu Octets.
	 * @return bool
	 */
	private static function ecrire( $chemin, $contenu ) {
		global $wp_filesystem;
		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}
		return $wp_filesystem ? (bool) $wp_filesystem->put_contents( $chemin, $contenu, FS_CHMOD_FILE ) : false;
	}

	/** Efface les dépôts dépassés. Silencieux : rien ici ne doit casser une page. */
	public static function purger() {
		$d = self::dossier();
		if ( null === $d ) {
			return;
		}
		$limite = time() - self::DUREE_S;
		foreach ( (array) glob( $d[0] . '/*.{usdz,glb}', GLOB_BRACE ) as $f ) {
			if ( is_file( $f ) && filemtime( $f ) < $limite ) {
				wp_delete_file( $f );
			}
		}
	}

	/** À la désactivation : le rendez-vous s'annule avec le greffon. */
	public static function desactiver() {
		$t = wp_next_scheduled( self::CRON );
		if ( $t ) {
			wp_unschedule_event( $t, self::CRON );
		}
	}
}
