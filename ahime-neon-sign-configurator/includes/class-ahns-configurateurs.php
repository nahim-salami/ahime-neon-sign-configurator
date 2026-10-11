<?php
/**
 * LE REGISTRE DES CONFIGURATEURS.
 *
 * Jusqu'ici la boutique n'en avait qu'un : une interface pour tout le monde,
 * un jeu d'options, un produit facturé. Un atelier qui vend des enseignes de
 * bar ET des néons de chambre n'a pourtant pas la même vitrine pour les deux.
 *
 * LE MODÈLE (maquette : prototypes/admin-configurateurs.html) :
 *
 *   UN CONFIGURATEUR dit COMMENT — son interface parmi les douze, ses options
 *   activables, son mode d'affichage par défaut, son produit facturé. C'est
 *   l'unité qu'on crée, qu'on duplique et qu'on supprime.
 *
 *   UN PRODUIT dit QUOI — il désigne UN configurateur. (Le catalogue par
 *   produit et le barème surchargeable viennent aux tranches suivantes.)
 *
 * CE QUI ARRIVE AUX BOUTIQUES DÉJÀ INSTALLÉES. Rien, tant qu'elles n'ouvrent
 * pas l'écran. Le réglage unique d'avant — `ahns_configurator` pour les options,
 * `ahns_appearance['theme']` pour l'interface — est recopié à la première
 * lecture dans un configurateur nommé « Par défaut », et tous les produits y
 * pointent puisqu'un produit sans configurateur désigné prend le défaut.
 *
 * LA MIGRATION EST PARESSEUSE, ET C'EST VOULU : elle se fait à la première
 * lecture, pas à l'activation. Une extension mise à jour par FTP, par WP-CLI ou
 * par le dépôt ne repasse pas toujours par le crochet d'activation — et une
 * migration qui ne s'est pas jouée laisse une boutique sans configurateur du
 * tout. Ici, le premier appel suffit, quel que soit le chemin de mise à jour.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Configurateurs
 */
class AHNS_Configurateurs {

	/** Où vit la liste. */
	const OPTION = 'ahns_configurateurs';

	/** La méta du produit qui désigne son configurateur. */
	const META = '_ahns_configurateur';

	/** Les modes d'affichage possibles. */
	const MODES = array( 'inline', 'modal', 'redirect' );

	/**
	 * Tous les configurateurs, migrés au besoin.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function tous() {
		$liste = get_option( self::OPTION, null );
		if ( ! is_array( $liste ) ) {
			$liste = self::migrer();
		}
		return array_values( array_map( array( __CLASS__, 'normaliser' ), $liste ) );
	}

	/**
	 * Un configurateur par son identifiant.
	 *
	 * @param string $id Identifiant.
	 * @return array<string, mixed>|null
	 */
	public static function un( $id ) {
		foreach ( self::tous() as $conf ) {
			if ( $conf['id'] === (string) $id ) {
				return $conf;
			}
		}
		return null;
	}

	/**
	 * Le configurateur par défaut — celui que prend un produit qui n'en
	 * désigne aucun. Il y en a toujours un : sans cela, un produit oublié
	 * n'aurait plus de quoi se vendre.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaut() {
		$tous = self::tous();
		foreach ( $tous as $conf ) {
			if ( ! empty( $conf['defaut'] ) ) {
				return $conf;
			}
		}
		// Aucun n'est marqué : le premier fait l'affaire, et vaut mieux que rien.
		return $tous ? $tous[0] : self::normaliser( array() );
	}

	/**
	 * LE CONFIGURATEUR D'UN PRODUIT — la question que pose chaque affichage.
	 *
	 * Trois cas, et le troisième est le plus important :
	 *   - le produit en désigne un qui existe : celui-là ;
	 *   - il n'en désigne aucun : le défaut, pour qu'un produit créé avant
	 *     cette tranche continue de se vendre ;
	 *   - il en désigne un SUPPRIMÉ : aucun. La fiche redevient ordinaire —
	 *     le bouton d'achat de WooCommerce, sans personnalisation. C'est ce
	 *     qui a été décidé pour la suppression, et c'est ici qu'il faut le
	 *     lire : le produit reste en vente, il ne se compose plus.
	 *
	 * @param int $product_id Produit.
	 * @return array<string, mixed>|null
	 */
	public static function pour_produit( $product_id ) {
		$product_id = (int) $product_id;
		if ( $product_id <= 0 ) {
			return self::defaut();
		}
		$choisi = (string) get_post_meta( $product_id, self::META, true );
		if ( '' === $choisi ) {
			return self::defaut();
		}
		return self::un( $choisi );
	}

	/**
	 * Le mode d'affichage effectif d'un produit : le sien s'il en force un,
	 * sinon celui de son configurateur.
	 *
	 * @param int                       $product_id Produit.
	 * @param array<string, mixed>|null $conf       Son configurateur, si déjà connu.
	 * @return string
	 */
	public static function mode_pour_produit( $product_id, $conf = null ) {
		// La méta du produit est celle qui existait déjà : on ne renomme pas
		// une clé que des boutiques ont déjà remplie.
		$force = (string) get_post_meta( (int) $product_id, AHNS_Product::META_MODE, true );
		if ( in_array( $force, self::MODES, true ) ) {
			return $force;
		}
		$conf = null === $conf ? self::pour_produit( $product_id ) : $conf;
		return $conf ? $conf['mode'] : 'inline';
	}

	/** Combien de produits utilisent ce configurateur. */
	public static function compter_produits( $id ) {
		$q = new WP_Query(
			array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'no_found_rows'  => false,
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					array(
						'key'   => self::META,
						'value' => (string) $id,
					),
				),
			)
		);
		return (int) $q->found_posts;
	}

	/**
	 * Enregistre un configurateur (création ou mise à jour).
	 *
	 * @param array<string, mixed> $conf Le configurateur.
	 * @return string L'identifiant retenu.
	 */
	public static function enregistrer( $conf ) {
		$conf  = self::normaliser( $conf );
		$liste = self::tous();
		$vu    = false;
		foreach ( $liste as $i => $existant ) {
			if ( $existant['id'] === $conf['id'] ) {
				$liste[ $i ] = $conf;
				$vu          = true;
			} elseif ( ! empty( $conf['defaut'] ) ) {
				// Un seul défaut à la fois, sinon « le » défaut n'existe plus.
				$liste[ $i ]['defaut'] = false;
			}
		}
		if ( ! $vu ) {
			$liste[] = $conf;
		}
		update_option( self::OPTION, array_values( $liste ) );
		return $conf['id'];
	}

	/**
	 * Supprime un configurateur.
	 *
	 * Les produits qui le désignaient gardent leur méta : `pour_produit()`
	 * renverra null, et leur fiche redeviendra ordinaire. On ne nettoie pas
	 * les métas — un marchand qui supprime par erreur et recrée l'entrée
	 * retrouve ses produits, ce qu'un nettoyage lui interdirait.
	 *
	 * @param string $id Identifiant.
	 * @return bool
	 */
	public static function supprimer( $id ) {
		$liste = self::tous();
		if ( count( $liste ) <= 1 ) {
			return false; // Jamais zéro : la boutique doit garder de quoi vendre.
		}
		$reste = array_values( array_filter( $liste, static fn( $c ) => $c['id'] !== (string) $id ) );
		if ( count( $reste ) === count( $liste ) ) {
			return false;
		}
		// Si on vient de supprimer le défaut, le premier le devient.
		$a_defaut = false;
		foreach ( $reste as $c ) {
			$a_defaut = $a_defaut || ! empty( $c['defaut'] );
		}
		if ( ! $a_defaut ) {
			$reste[0]['defaut'] = true;
		}
		update_option( self::OPTION, $reste );
		return true;
	}

	/**
	 * Duplique un configurateur. L'interface et les options suivent, pas les
	 * produits — ils continuent de pointer vers l'original.
	 *
	 * @param string $id Identifiant.
	 * @return string|null Le nouvel identifiant.
	 */
	public static function dupliquer( $id ) {
		$source = self::un( $id );
		if ( ! $source ) {
			return null;
		}
		$copie           = $source;
		$copie['id']     = self::nouvel_id();
		$copie['defaut'] = false;
		/* translators: %s : nom du configurateur d'origine. */
		$copie['nom'] = sprintf( __( '%s (copy)', 'ahime-neon-sign-configurator' ), $source['nom'] );
		return self::enregistrer( $copie );
	}

	/** Un identifiant qui ne ressemble à rien d'autre. */
	public static function nouvel_id() {
		return 'c' . substr( md5( uniqid( '', true ) ), 0, 10 );
	}

	/**
	 * Complète un configurateur avec ses valeurs par défaut.
	 *
	 * TOUT EST ACTIVÉ PAR DÉFAUT, comme dans l'écran d'avant : une boutique
	 * qui n'a jamais ouvert le réglage garde le configurateur entier. Une
	 * option absente qui vaudrait « éteint » retirerait des fonctions à une
	 * boutique qui ne les a jamais désactivées.
	 *
	 * @param array<string, mixed> $c Le configurateur, éventuellement partiel.
	 * @return array<string, mixed>
	 */
	public static function normaliser( $c ) {
		$c = is_array( $c ) ? $c : array();

		$features = array();
		foreach ( array_keys( AHNS_Configurator::FEATURES ) as $k ) {
			$features[ $k ] = isset( $c['features'][ $k ] ) ? (bool) $c['features'][ $k ] : true;
		}
		// LES FONDS NE SONT PLUS UNE LISTE FERMÉE : la boutique en ajoute les
		// siens (écran « Fonds de scène »). On parcourt donc la bibliothèque,
		// pas les trois livrés — sinon un fond ajouté par le marchand serait
		// effacé du configurateur au premier enregistrement.
		$fonds = array();
		$connus = class_exists( 'AHNS_Fonds' )
			? array_keys( AHNS_Fonds::tous() )
			: array_keys( AHNS_Configurator::BACKGROUNDS );
		foreach ( $connus as $k ) {
			$fonds[ $k ] = isset( $c['backgrounds'][ $k ] ) ? (bool) $c['backgrounds'][ $k ] : true;
		}
		if ( ! in_array( true, $fonds, true ) ) {
			$fonds['dark'] = true; // Un aperçu sans décor n'est pas un aperçu.
		}

		// L'interface passe par la liste blanche du plugin : une valeur venue
		// d'une version plus récente ne doit jamais atterrir telle quelle.
		$peau = isset( $c['peau'] ) ? sanitize_key( (string) $c['peau'] ) : 'clair-boutique';
		if ( ! isset( AHNS_Appearance::THEMES[ $peau ] ) ) {
			$peau = 'clair-boutique';
		}

		$mode = isset( $c['mode'] ) ? (string) $c['mode'] : 'inline';
		if ( ! in_array( $mode, self::MODES, true ) ) {
			$mode = 'inline';
		}

		return array(
			'id'          => isset( $c['id'] ) && '' !== $c['id'] ? sanitize_key( (string) $c['id'] ) : self::nouvel_id(),
			'nom'         => isset( $c['nom'] ) && '' !== trim( (string) $c['nom'] )
				? mb_substr( sanitize_text_field( (string) $c['nom'] ), 0, 80 )
				: __( 'Untitled', 'ahime-neon-sign-configurator' ),
			'peau'        => $peau,
			'mode'        => $mode,
			'product_id'  => isset( $c['product_id'] ) ? (int) $c['product_id'] : 0,
			'max_lines'   => isset( $c['max_lines'] ) ? max( 1, min( 3, (int) $c['max_lines'] ) ) : 3,
			'features'    => $features,
			'backgrounds' => $fonds,
			'defaut'      => ! empty( $c['defaut'] ),
		);
	}

	/**
	 * LA MIGRATION — le réglage unique devient « Par défaut ».
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private static function migrer() {
		$ancien    = AHNS_Configurator::settings();
		$apparence = AHNS_Appearance::settings();

		$conf = self::normaliser(
			array(
				'id'          => 'defaut',
				'nom'         => __( 'Default', 'ahime-neon-sign-configurator' ),
				'peau'        => isset( $apparence['theme'] ) ? $apparence['theme'] : 'clair-boutique',
				'mode'        => $ancien['default_mode'],
				'product_id'  => $ancien['product_id'],
				'max_lines'   => $ancien['max_lines'],
				'features'    => $ancien['features'],
				'backgrounds' => $ancien['backgrounds'],
				'defaut'      => true,
			)
		);

		$liste = array( $conf );
		update_option( self::OPTION, $liste );
		return $liste;
	}
}
