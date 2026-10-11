<?php
/**
 * Traduction du plugin (docs/07, lot E).
 *
 * Deux choses, seulement :
 *
 * 1. Charger le catalogue de traductions du plugin.
 * 2. Faire que la LANGUE CHOISIE PAR LE MARCHAND l'emporte sur celle du site.
 *    Une boutique française tenue par une équipe anglophone doit pouvoir avoir
 *    une administration en anglais sans que la vitrine change de langue.
 *
 * Version gratuite : le texte source est l'anglais ; le français est une traduction
 * livrée dans languages/. (Le paragraphe suivant vaut pour la version complète.)
 * Version complète : le texte source est en français ; sans fichier de traduction, tout s'affiche
 * en français. C'est le comportement voulu — le français n'est pas une
 * traduction, c'est l'original.
 *
 * ### Libellés rangés dans des constantes
 *
 * PHP interdit les appels de fonction dans une constante : `const PALETTE`
 * ne peut pas contenir `__( 'Blanc chaud' )`. Ces libellés-là passent par
 * `AHNS_I18n::t()` au moment de l'affichage, et le générateur de catalogue
 * (`scripts/build-pot.py`) va les chercher directement dans les constantes.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_I18n
 */
class AHNS_I18n {

	const DOMAIN = 'ahime-neon-sign-configurator';

	public function hooks() {
		// Priorité 0 : avant que le moindre écran ne s'affiche.
		add_action( 'init', array( __CLASS__, 'load' ), 0 );
		/*
		 * ET AU MOMENT OU LE MENU SE CONSTRUIT.
		 *
		 * Sonde posee sur une vraie requete, langue reglee sur l'anglais :
		 * le catalogue est anglais a `init 1`, francais a `init 999`, et
		 * encore francais a `admin_menu` — ou WordPress fige les libelles du
		 * menu lateral. Il redevient anglais a `admin_init`, qui court APRES.
		 * L'ecran affichait donc un contenu anglais dans un menu francais.
		 *
		 * Priorite 0 : avant nos propres `add_menu_page` (9) et
		 * `add_submenu_page` (10 et plus). `load()` verifie l'etat reel du
		 * catalogue avant d'agir, donc l'appel ne coute rien s'il est deja bon.
		 */
		add_action( 'admin_menu', array( __CLASS__, 'load' ), 0 );
		add_action( 'admin_init', array( __CLASS__, 'load' ), 0 );
		add_filter( 'plugin_locale', array( __CLASS__, 'locale' ), 10, 2 );
		/*
		 * ET LE FICHIER LUI-MEME, parce que le filtre precedent ne suffisait
		 * pas. WordPress charge un domaine « juste a temps », au premier
		 * `__()` venu : ce chargement-la passait en fr_FR et ECRASAIT le
		 * catalogue anglais que `load()` venait de poser. Le drapeau interne,
		 * lui, affirmait toujours « en_US » — donc `load()` refusait de
		 * reparer, et l'ecran restait francais alors que le .mo etait bon.
		 * Mesure : « Annonces » rendait « Annonces » avec un catalogue qui
		 * traduit pourtant « Announcements ».
		 *
		 * Celui-ci se pose sur le CHEMIN du fichier : par quelque route que
		 * le domaine soit charge, c'est la langue choisie qui arrive.
		 */
		add_filter( 'load_textdomain_mofile', array( __CLASS__, 'fichier' ), 10, 2 );
	}

	/**
	 * Charge le catalogue dans la langue voulue par le marchand.
	 *
	 * On ne passe PAS par `load_plugin_textdomain()` seul : depuis que
	 * WordPress charge les traductions « juste à temps », le catalogue peut
	 * déjà être en mémoire dans la langue du site quand notre code s'exécute,
	 * et le filtre `plugin_locale` n'est alors jamais consulté. On décharge
	 * donc explicitement avant de recharger dans la bonne langue.
	 *
	 * @return void
	 */
	public static function load() {
		$wanted = self::locale( determine_locale(), self::DOMAIN );
		/*
		 * ON NE SE FIE PLUS AU DRAPEAU SEUL. Il disait « en_US » pendant que
		 * le catalogue effectivement charge etait le francais, recharge par
		 * WordPress apres nous : le court-circuit rendait alors la reparation
		 * impossible. On verifie donc l'etat REEL — une chaine temoin dont on
		 * sait qu'elle differe d'une langue a l'autre.
		 */
		if ( $wanted === self::$loaded && self::catalogue_conforme( $wanted ) ) {
			return; // déjà dans la bonne langue, et vérifié.
		}
		unload_textdomain( self::DOMAIN );
		// Le texte source ÉTANT le français, l'absence de fichier est le
		// comportement normal pour fr_FR : rien à charger, rien à traduire.
		$mofile = AHNS_PLUGIN_DIR . 'languages/' . self::DOMAIN . '-' . $wanted . '.mo';
		if ( file_exists( $mofile ) ) {
			load_textdomain( self::DOMAIN, $mofile, $wanted );
			/*
			 * ET SOUS LA LANGUE DU SITE, avec le meme fichier.
			 *
			 * Depuis WordPress 6.7, une traduction se cherche dans un index
			 * tenu PAR LANGUE, et la langue interrogee est celle du site —
			 * pas celle que nous venons de charger. Tant que l'objet de
			 * traduction restait en memoire, la lecture marchait ; des qu'un
			 * tiers faisait rebatir l'index, la recherche se faisait dans la
			 * langue du site, ne trouvait rien, et rendait la chaine source.
			 *
			 * Le symptome tenait en une capture : un ecran anglais dans un
			 * menu francais, la meme requete ayant traduit le contenu et pas
			 * le menu — celui-ci se fige a `admin_menu`, ou l'index venait
			 * d'etre rebati, celui-la s'imprime plus tard.
			 */
			$site = determine_locale();
			if ( $site !== $wanted ) {
				load_textdomain( self::DOMAIN, $mofile, $site );
			}
		}
		self::$loaded = $wanted;
	}

	/** Langue actuellement en mémoire, pour ne pas recharger pour rien. */
	private static $loaded = null;

	/**
	 * Langue effective de NOTRE catalogue.
	 *
	 * @param string $locale Langue que WordPress s'apprêtait à utiliser.
	 * @param string $domain Domaine demandé.
	 * @return string
	 */
	public static function locale( $locale, $domain ) {
		if ( self::DOMAIN !== $domain || ! is_admin() ) {
			return $locale;
		}
		if ( ! class_exists( 'AHNS_Appearance' ) ) {
			return $locale;
		}
		$chosen = AHNS_Appearance::settings()['language'];
		return '' !== $chosen ? $chosen : $locale;
	}

	/**
	 * Le fichier de catalogue a charger pour notre domaine.
	 *
	 * @param string $mofile Chemin propose par WordPress.
	 * @param string $domain Domaine charge.
	 * @return string
	 */
	public static function fichier( $mofile, $domain ) {
		if ( self::DOMAIN !== $domain || ! is_admin() ) {
			return $mofile;
		}
		$wanted = self::locale( determine_locale(), $domain );
		$notre  = AHNS_PLUGIN_DIR . 'languages/' . $domain . '-' . $wanted . '.mo';
		return file_exists( $notre ) ? $notre : $mofile;
	}

	/**
	 * Le catalogue charge est-il vraiment celui de cette langue ?
	 *
	 * On traduit une chaine temoin plutot que de croire un drapeau. « Annonces »
	 * ne se traduit pas par elle-meme en anglais : si elle revient telle quelle
	 * alors qu'on attend l'anglais, c'est qu'un autre catalogue a pris la place.
	 *
	 * @param string $wanted Locale attendue.
	 * @return bool
	 */
	private static function catalogue_conforme( $wanted ) {
		if ( '' === $wanted || 0 === strpos( $wanted, 'en' ) || ! file_exists( AHNS_PLUGIN_DIR . 'languages/' . self::DOMAIN . '-' . $wanted . '.mo' ) ) {
			return true; // le texte source EST le francais : rien a verifier.
		}
		return 'Announcements' !== __( 'Announcements', 'ahime-neon-sign-configurator' );
	}

	/**
	 * Traduit un libellé venu d'une constante.
	 *
	 * @param string $text Texte source (français).
	 * @return string
	 */
	public static function t( $text ) {
		// Deux gardes indispensables : traduire la chaîne vide renverrait
		// l'en-tête du catalogue, et un nombre n'est pas du texte (les
		// constantes de réglages mêlent libellés et facteurs).
		if ( ! is_string( $text ) || '' === $text ) {
			return $text;
		}
		// translate() et non __() : le texte n'est pas un littéral ici, il vient
		// d'une constante. Les outils d'extraction le récupèrent via build-pot.
		return translate( $text, self::DOMAIN ); // phpcs:ignore WordPress.WP.I18n -- libellés tirés de constantes, extraits par scripts/build-pot.py.
	}

	/**
	 * Traduit les valeurs d'un tableau de libellés (clé => libellé).
	 *
	 * @param array $map Tableau à traduire.
	 * @return array
	 */
	public static function t_map( array $map ) {
		$out = array();
		foreach ( $map as $key => $value ) {
			$out[ $key ] = is_array( $value ) ? array_map( array( __CLASS__, 't' ), $value ) : self::t( $value );
		}
		return $out;
	}
}
