<?php
/**
 * Panier WooCommerce : ajout AJAX d'un néon configuré.
 *
 * SÉCURITÉ : nonce, assainissement de toute la configuration (whitelists), et
 * surtout PRIX RECALCULÉ EN PHP (AHNS_Pricing) — le prix envoyé par le
 * navigateur ne sert qu'au contrôle d'écart (journalisé, jamais facturé).
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Cart
 */
class AHNS_Cart {

	const NONCE_ACTION = 'ahns_nonce';
	const CART_KEY     = 'ahns_data';

	/** Une configuration de néon tient en quelques kilooctets ; au-delà, c'est un abus. */
	const MAX_CONFIG_OCTETS = 65536;

	/**
	 * Les seules balises et attributs qu'un logo SVG garde : du dessin, rien
	 * d'exécutable (ni script, ni lien, ni style, ni objet étranger).
	 */
	const SVG_PERMIS = array(
		'svg'            => array( 'xmlns' => true, 'version' => true, 'viewbox' => true, 'width' => true, 'height' => true, 'x' => true, 'y' => true, 'preserveaspectratio' => true, 'fill' => true, 'stroke' => true ),
		'g'              => array( 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'opacity' => true, 'fill-rule' => true, 'clip-path' => true ),
		'path'           => array( 'd' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'stroke-linecap' => true, 'stroke-linejoin' => true, 'stroke-miterlimit' => true, 'fill-rule' => true, 'clip-rule' => true, 'opacity' => true, 'fill-opacity' => true, 'stroke-opacity' => true ),
		'rect'           => array( 'x' => true, 'y' => true, 'width' => true, 'height' => true, 'rx' => true, 'ry' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'opacity' => true ),
		'circle'         => array( 'cx' => true, 'cy' => true, 'r' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'opacity' => true ),
		'ellipse'        => array( 'cx' => true, 'cy' => true, 'rx' => true, 'ry' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'opacity' => true ),
		'line'           => array( 'x1' => true, 'y1' => true, 'x2' => true, 'y2' => true, 'transform' => true, 'stroke' => true, 'stroke-width' => true, 'stroke-linecap' => true, 'opacity' => true ),
		'polyline'       => array( 'points' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'stroke-linecap' => true, 'stroke-linejoin' => true, 'opacity' => true ),
		'polygon'        => array( 'points' => true, 'transform' => true, 'fill' => true, 'stroke' => true, 'stroke-width' => true, 'fill-rule' => true, 'opacity' => true ),
		'defs'           => array(),
		'clippath'       => array( 'id' => true, 'clippathunits' => true ),
		'lineargradient' => array( 'id' => true, 'x1' => true, 'y1' => true, 'x2' => true, 'y2' => true, 'gradientunits' => true, 'gradienttransform' => true ),
		'radialgradient' => array( 'id' => true, 'cx' => true, 'cy' => true, 'r' => true, 'fx' => true, 'fy' => true, 'gradientunits' => true, 'gradienttransform' => true ),
		'stop'           => array( 'offset' => true, 'stop-color' => true, 'stop-opacity' => true ),
		'title'          => array(),
		'desc'           => array(),
	);

	/**
	 * Le SVG d'un logo, réduit au dessin, ou la chaîne vide.
	 *
	 * @param mixed $brut Valeur reçue.
	 * @return string
	 */
	public static function svg_propre( $brut ) {
		if ( ! is_string( $brut ) || '' === $brut || strlen( $brut ) > 500000 ) {
			return '';
		}
		if ( preg_match( '#<script|javascript:|\son[a-z]+\s*=#i', $brut ) || false === stripos( $brut, '<svg' ) ) {
			return '';
		}
		$propre = trim( wp_kses( $brut, self::SVG_PERMIS, array() ) );
		return false !== stripos( $propre, '<svg' ) ? $propre : '';
	}

	/**
	 * @var AHNS_Pricing
	 */
	private $pricing;

	public function __construct( AHNS_Pricing $pricing ) {
		$this->pricing = $pricing;
	}

	public function hooks() {
		add_action( 'wp_ajax_ahns_add_to_cart', array( $this, 'handle_add_to_cart' ) );
		add_action( 'wp_ajax_nopriv_ahns_add_to_cart', array( $this, 'handle_add_to_cart' ) );
		add_filter( 'woocommerce_get_cart_item_from_session', array( $this, 'restore_from_session' ), 10, 2 );
		add_action( 'woocommerce_before_calculate_totals', array( $this, 'apply_calculated_price' ), 20 );
		add_filter( 'woocommerce_get_item_data', array( $this, 'display_item_data' ), 10, 2 );
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'save_order_item_meta' ), 10, 3 );
		// Vignette du panier = la CAPTURE du design (classique + panier blocs).
		// Servie par un ENDPOINT (jamais en data-URI : la Store API passe les
		// src par esc_url, qui rejette le protocole data:).
		add_filter( 'woocommerce_cart_item_thumbnail', array( $this, 'cart_thumbnail' ), 10, 3 );
		add_filter( 'woocommerce_store_api_cart_item_images', array( $this, 'store_api_cart_item_images' ), 10, 3 );
		add_action( 'template_redirect', array( $this, 'serve_preview_image' ) );
		// Zoom au survol de la vignette (souris uniquement) — pattern validé.
		add_action( 'wp_footer', array( $this, 'render_hover_zoom_assets' ) );
	}

	/**
	 * Assainit la configuration reçue (whitelists strictes).
	 *
	 * @param array $raw        Configuration brute décodée.
	 * @param int   $product_id Produit visé — c'est LUI qui dit quelles options
	 *                          sont permises, via son configurateur. 0 = celles
	 *                          du configurateur par défaut.
	 * @return array|null null si structure invalide.
	 */
	/**
	 * Rendue publique et statique : le devis passe par le MÊME assainissement
	 * que le panier. Deux règles pour une même donnée finiraient par diverger,
	 * et la plus laxiste des deux deviendrait la porte d'entrée.
	 */
	/**
	 * Une capture data-URL acceptable, ou la chaîne vide.
	 *
	 * Deux barrières, et aucune n'est décorative : la taille, parce que ces
	 * images voyagent en POST et se rangent en méta de commande ; et le format,
	 * parce qu'une data-URL non filtrée se rend ensuite dans un attribut `src`
	 * de l'administration. Le motif n'accepte que du base64 de PNG ou de JPEG.
	 *
	 * @param string $brut Valeur reçue.
	 * @return string
	 */
	private static function capture_valide( $brut ) {
		if ( ! is_string( $brut ) || '' === $brut ) {
			return '';
		}
		if ( strlen( $brut ) > 400000 ) {
			return '';
		}
		return preg_match( '#^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$#', $brut ) ? $brut : '';
	}

	public static function sanitize_config( $raw, $product_id = 0 ) {
		if ( ! is_array( $raw ) || ! isset( $raw['lines'] ) || ! is_array( $raw['lines'] ) ) {
			return null;
		}
		/*
		 * DEUX BARRIÈRES, DANS CET ORDRE.
		 *
		 * 1. LE DOMAINE. Toute valeur qui sert d'index à une table de prix ou de
		 *    coefficient (police, finition, découpe, matière, fixation…) doit
		 *    exister dans CETTE table. Une valeur inconnue fait REFUSER toute la
		 *    configuration (null) : elle ne retombe jamais sur un coefficient
		 *    absent, donc jamais sur un prix à zéro.
		 * 2. L'OFFRE. Une valeur connue mais que ce produit ne propose pas est
		 *    ramenée à la première qu'il propose (le widget envoie ses valeurs
		 *    par défaut même quand le marchand a restreint la liste). Les listes
		 *    proposées sont elles-mêmes croisées avec le domaine : la valeur de
		 *    repli est toujours tarifée.
		 */
		$refus  = false;
		$tarif  = new AHNS_Pricing();
		$tables = $tarif->cles_tarifees();
		$choix  = static function ( $valeur, array $domaine, array $offerts, $defaut ) use ( &$refus ) {
			$offerts = array_values( array_intersect( $offerts, $domaine ) );
			if ( null !== $valeur && ! in_array( $valeur, $domaine, true ) ) {
				$refus = true;
				return $defaut;
			}
			if ( null !== $valeur && ( ! $offerts || in_array( $valeur, $offerts, true ) ) ) {
				return $valeur;
			}
			if ( in_array( $defaut, $offerts, true ) || ( ! $offerts && in_array( $defaut, $domaine, true ) ) ) {
				return $defaut;
			}
			if ( $offerts ) {
				return $offerts[0];
			}
			$refus = true;
			return $defaut;
		};
		// Une valeur absente vaut null (le défaut s'applique) ; une valeur
		// présente mais non scalaire (objet, liste) fait refuser.
		$lire   = static function ( $tableau, $cle ) use ( &$refus ) {
			if ( ! is_array( $tableau ) || ! isset( $tableau[ $cle ] ) ) {
				return null;
			}
			if ( ! is_scalar( $tableau[ $cle ] ) ) {
				$refus = true;
				return null;
			}
			return $tableau[ $cle ];
		};
		$nombre = static function ( $tableau, $cle, $defaut, $min, $max ) use ( $lire ) {
			$v = $lire( $tableau, $cle );
			$v = ( null === $v || ! is_numeric( $v ) ) ? $defaut : (float) $v;
			return max( $min, min( $max, $v ) );
		};
		$hex    = static function ( $tableau, $cle, $defaut ) use ( $lire, &$refus ) {
			$v = $lire( $tableau, $cle );
			if ( null === $v || '' === $v ) {
				return $defaut;
			}
			$propre = sanitize_hex_color( (string) $v );
			if ( ! $propre ) {
				$refus = true;
				return $defaut;
			}
			return strtolower( $propre );
		};

		// LE CATALOGUE DE CE PRODUIT est la barrière d'offre. Ce que la fiche ne
		// propose pas n'est pas facturé tel quel : une couleur retirée d'un
		// produit doit l'être des deux côtés.
		$permis = static function ( $famille, array $repli ) use ( $product_id ) {
			if ( ! class_exists( 'AHNS_Catalogue_Produit' ) ) {
				return $repli;
			}
			$ids = AHNS_Catalogue_Produit::ids( $product_id, $famille );
			return $ids ? $ids : $repli;
		};

		// Statique : le devis appelle cette méthode sans instance de panier.
		// Les polices sont croisées avec celles que ce produit propose : le
		// tarificateur en connaît plus que la fiche n'en vend.
		$polices_offertes = array_values( array_intersect( $tables['fonts'], $permis( 'fonts', $tables['fonts'] ) ) );
		$couleurs         = $permis( 'colors', class_exists( 'AHNS_Catalog' ) ? array_keys( AHNS_Catalog::enabled_colors() ) : array() );
		$lines            = array();
		foreach ( array_slice( $raw['lines'], 0, 3 ) as $line ) {
			if ( ! is_array( $line ) ) {
				$refus = true;
				continue;
			}
			$teinte = $hex( $line, 'colorHex', '' );
			// Couleur non proposée par CE PRODUIT → la première qu'il propose.
			// Le marchand ne doit pas recevoir une teinte qu'il ne tient pas,
			// ni une teinte qu'il ne vend pas sur cette fiche-là.
			if ( $couleurs && ! in_array( $teinte, $couleurs, true ) ) {
				$defaut = class_exists( 'AHNS_Catalog' ) ? AHNS_Catalog::default_color() : '';
				$teinte = in_array( $defaut, $couleurs, true ) ? $defaut : (string) reset( $couleurs );
			}
			$texte   = $lire( $line, 'text' );
			$lines[] = array(
				'text'     => mb_substr( wp_strip_all_tags( null === $texte ? '' : (string) $texte ), 0, 40 ),
				'fontId'   => (string) $choix( $lire( $line, 'fontId' ), $tables['fonts'], $polices_offertes, $polices_offertes ? $polices_offertes[0] : ( $tables['fonts'][0] ?? '' ) ),
				'colorHex' => $teinte ? $teinte : '#ff2d95',
			);
		}
		// OPTIONS DÉSACTIVÉES PAR LE MARCHAND : on ne fait jamais confiance au
		// navigateur. Une option éteinte est ramenée à sa valeur neutre — la
		// boutique ne peut pas recevoir une commande qu'elle ne sait pas produire.
		// LES OPTIONS PERMISES SONT CELLES DU CONFIGURATEUR DU PRODUIT. Deux
		// configurateurs peuvent proposer deux jeux d'options ; la barrière
		// d'entrée doit demander à CELUI de ce produit, sinon une option éteinte
		// dans l'un passerait parce qu'elle est allumée dans l'autre.
		$options = class_exists( 'AHNS_Embed' )
			? AHNS_Embed::configurateur( $product_id )['features']
			: array();
		$allowed = static function ( $key ) use ( $options ) {
			return ! isset( $options[ $key ] ) || ! empty( $options[ $key ] );
		};
		$types_connus = array( 'cut-to-letter', 'contour', 'rectangle', 'stand', 'box', 'none' );
		$decoupes     = $permis( 'support_types', class_exists( 'AHNS_Catalog' ) ? array_keys( AHNS_Catalog::enabled_support_types() ) : $types_connus );
		$finitions    = $permis( 'support_finishes', class_exists( 'AHNS_Catalog' ) ? array_keys( AHNS_Catalog::enabled_finishes() ) : $tables['support_finishes'] );
		$matieres     = $permis( 'materials', $tables['materials'] );
		$support      = isset( $raw['support'] ) && is_array( $raw['support'] ) ? $raw['support'] : array();
		$opts         = isset( $raw['options'] ) && is_array( $raw['options'] ) ? $raw['options'] : array();

		$kinds = array( 'text', 'logo-svg', 'panel', 'box-sign' );
		$kind  = $choix( $lire( $raw, 'kind' ), $kinds, $allowed( 'logo' ) ? $kinds : array( 'text', 'panel', 'box-sign' ), 'text' );
		$mode  = $choix( $lire( $raw, 'colorMode' ), array( 'solid', 'rgb' ), $allowed( 'rgb' ) ? array( 'solid', 'rgb' ) : array( 'solid' ), 'solid' );
		$env   = $choix( $lire( $raw, 'environment' ), array( 'indoor', 'outdoor' ), $allowed( 'outdoor' ) ? array( 'indoor', 'outdoor' ) : array( 'indoor' ), 'indoor' );
		$out   = array(
			'kind'           => $kind,
			'lines'          => 'logo-svg' === $kind ? array() : $lines,
			'letterHeightCm' => $nombre( $raw, 'letterHeightCm', 18, 5, 80 ),
			'colorMode'      => $mode,
			'support'        => array(
				// Découpes et finitions : bornées à ce que la boutique propose,
				// et chaque finition proposée existe dans la table des prix.
				'type'   => $choix( $lire( $support, 'type' ), $types_connus, $decoupes, (string) reset( $decoupes ) ),
				'finish' => $choix( $lire( $support, 'finish' ), $tables['support_finishes'], $finitions, (string) reset( $finitions ) ),
			),
			'environment'    => $env,
			'powerRegion'    => $choix( $lire( $raw, 'powerRegion' ), array( 'EU', 'UK', 'US', 'AU' ), array( 'EU', 'UK', 'US', 'AU' ), 'EU' ),
			'mounting'       => $choix( $lire( $raw, 'mounting' ), $tables['mountings'], $tables['mountings'], 'screws' ),
			'options'        => array(
				'dimmerRemote' => $allowed( 'dimmer' ) && ! empty( $opts['dimmerRemote'] ),
				'express'      => $allowed( 'express' ) && ! empty( $opts['express'] ),
			),
		);
		// Mesures du logo (client, bornées — l'admin marque « à vérifier »).
		if ( 'logo-svg' === $kind && isset( $raw['logo'] ) && is_array( $raw['logo'] ) ) {
			$out['logo'] = array(
				'tubeLengthMm' => $nombre( $raw['logo'], 'tubeLengthMm', 0, 0, 25000 ),
				'widthCm'      => $nombre( $raw['logo'], 'widthCm', 0, 0, 300 ),
				'heightCm'     => $nombre( $raw['logo'], 'heightCm', 0, 0, 300 ),
			);
		}
		if ( in_array( $kind, array( 'panel', 'box-sign' ), true ) ) {
			$taille        = isset( $raw['sizeCm'] ) && is_array( $raw['sizeCm'] ) ? $raw['sizeCm'] : array();
			$out['sizeCm'] = array(
				'widthCm'  => $nombre( $taille, 'widthCm', 100, 10, 250 ),
				'heightCm' => $nombre( $taille, 'heightCm', 50, 10, 250 ),
			);
		}
		$lettres = array( 'acrylic', 'wood', 'metal' );
		if ( 'panel' === $kind && ! empty( $raw['panel'] ) && is_array( $raw['panel'] ) ) {
			$p = $raw['panel'];
			$out['panel'] = array(
				'material'    => $choix( $lire( $p, 'material' ), $tables['materials'], $matieres, 'dibond' ),
				'thicknessMm' => $nombre( $p, 'thicknessMm', 3, 1, 25 ),
				'finish'      => $choix( $lire( $p, 'finish' ), $tables['panel_finishes'], $tables['panel_finishes'], 'raw' ),
				'cut'         => $choix( $lire( $p, 'cut' ), $tables['panel_cuts'], $tables['panel_cuts'], 'rect' ),
				'doubleSided' => ! empty( $p['doubleSided'] ),
			);
			if ( 'letters' === $out['panel']['finish'] && ! empty( $p['channelLetters'] ) && is_array( $p['channelLetters'] ) ) {
				$cl     = $p['channelLetters'];
				$layers = array();
				foreach ( array_slice( isset( $cl['backboardLayers'] ) && is_array( $cl['backboardLayers'] ) ? $cl['backboardLayers'] : array(), 0, 4 ) as $layer ) {
					if ( ! is_array( $layer ) ) {
						$refus = true;
						continue;
					}
					$layers[] = array(
						'material'    => $choix( $lire( $layer, 'material' ), $lettres, $lettres, 'acrylic' ),
						'color'       => $hex( $layer, 'color', '#ffffff' ),
						'thicknessMm' => $nombre( $layer, 'thicknessMm', 3, 1, 20 ),
						'extensionCm' => $nombre( $layer, 'extensionCm', 1, 0.4, 8 ),
					);
				}
				$eclairages = array( 'none', 'front', 'back', 'front-back' );
				$out['panel']['channelLetters'] = array(
					'material'        => $choix( $lire( $cl, 'material' ), $lettres, $lettres, 'acrylic' ),
					'depthMm'         => $nombre( $cl, 'depthMm', 30, 5, 100 ),
					'faceColor'       => $hex( $cl, 'faceColor', '#ffffff' ),
					'sideColor'       => $hex( $cl, 'sideColor', '#cccccc' ),
					'lighting'        => $choix( $lire( $cl, 'lighting' ), $eclairages, $eclairages, 'none' ),
					'glowColor'       => $hex( $cl, 'glowColor', '#ffffff' ),
					'backboardLayers' => 'shape' === $out['panel']['cut'] ? $layers : array(),
				);
			}
		}
		if ( 'box-sign' === $kind && ! empty( $raw['boxSign'] ) && is_array( $raw['boxSign'] ) ) {
			$b = $raw['boxSign'];
			$out['boxSign'] = array(
				'material'    => $choix( $lire( $b, 'material' ), $tables['materials'], $tables['materials'], 'dibond' ),
				'depthCm'     => $nombre( $b, 'depthCm', 12, 6, 40 ),
				'faces'       => 2 === (int) $lire( $b, 'faces' ) ? 2 : 1,
				'printedFace' => ! empty( $b['printedFace'] ),
			);
		}
		return $refus ? null : $out;
	}

	/**
	 * Géométrie atelier : uniquement des tableaux de coordonnées entières en
	 * dixièmes de millimètre. Aucun libellé client n'entre dans cette donnée.
	 */
	private static function sanitize_geometry( $raw ) {
		$version = (int) ( $raw['version'] ?? 0 );
		if ( ! is_array( $raw ) || ! in_array( $version, array( 1, 2 ), true ) || '0.1mm' !== ( $raw['unit'] ?? '' ) ) {
			return null;
		}
		$out = array( 'version' => $version, 'unit' => '0.1mm' );

		// LES COTES DE FABRICATION (version 2, écart E11).
		//
		// Sans elles, l'export de l'administration fabrique avec le tube du
		// catalogue COURANT, des mois après la commande. Elles sont filtrées
		// comme le reste : cinq nombres bornés, rien d'autre. Une cote absurde
		// vaut « absente » — l'export retombe alors sur le catalogue et le dit,
		// ce qui vaut mieux qu'un tube de trois mètres de diamètre.
		if ( 2 === $version && isset( $raw['modele'] ) && is_array( $raw['modele'] ) ) {
			$modele = array();
			foreach ( array( 'tubeMm', 'plaqueMm', 'margeMm', 'caissonMm', 'coupeMm' ) as $cote ) {
				if ( ! isset( $raw['modele'][ $cote ] ) || ! is_numeric( $raw['modele'][ $cote ] ) ) {
					continue;
				}
				$v = (float) $raw['modele'][ $cote ];
				// 0 est licite pour un caisson absent ; 500 mm est déjà
				// au-delà de tout ce que ce métier fabrique.
				if ( $v >= 0 && $v <= 500 ) {
					$modele[ $cote ] = round( $v, 1 );
				}
			}
			if ( ! empty( $modele ) ) {
				$out['modele'] = $modele;
			}
		}
		$total = 0;
		foreach ( array( 'strokes', 'contourOutline', 'letterOutlines' ) as $name ) {
			if ( ! isset( $raw[ $name ] ) || ! is_array( $raw[ $name ] ) || count( $raw[ $name ] ) > 600 ) {
				return null;
			}
			$out[ $name ] = array();
			foreach ( $raw[ $name ] as $path ) {
				if ( ! is_array( $path ) || count( $path ) < 2 || count( $path ) > 5000 ) {
					return null;
				}
				$clean = array();
				foreach ( $path as $point ) {
					if ( ! is_array( $point ) || 2 !== count( $point ) || ! is_numeric( $point[0] ) || ! is_numeric( $point[1] ) ) {
						return null;
					}
					$x = (int) $point[0];
					$y = (int) $point[1];
					if ( abs( $x ) > 1000000 || abs( $y ) > 1000000 ) {
						return null;
					}
					$clean[] = array( $x, $y );
					$total++;
					if ( $total > 100000 ) {
						return null;
					}
				}
				$out[ $name ][] = $clean;
			}
		}
		return $out;
	}

	/**
	 * Handler AJAX d'ajout au panier.
	 */
	public function handle_add_to_cart() {
		if ( ! check_ajax_referer( self::NONCE_ACTION, 'nonce', false ) ) {
			wp_send_json_error( __( 'Invalid security token. Reload the page.', 'ahime-neon-sign-configurator' ), 403 );
		}
		// Le configurateur et la commande client restent disponibles sans
		// abonnement. Le droit d'usage verrouille ensuite la production dans le
		// back-office, via le mu-plugin autonome.
		$product_id = isset( $_POST['productId'] ) ? absint( wp_unslash( $_POST['productId'] ) ) : 0;
		$product    = $product_id ? wc_get_product( $product_id ) : null;
		if ( ! $product || ! $product->is_purchasable() ) {
			wp_send_json_error( __( 'Product unavailable.', 'ahime-neon-sign-configurator' ), 400 );
		}

		// LA CONFIGURATION ARRIVE EN JSON. On ne l'assainit pas comme un texte
		// (ce serait corrompre les libellés du client) : elle est décodée puis
		// RECONSTRUITE clé par clé par sanitize_config(), qui ne garde que des
		// clés connues et des valeurs typées, et refuse toute valeur hors liste.
		$json   = isset( $_POST['config'] ) ? wp_unslash( $_POST['config'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- reconstruit par sanitize_config().
		$raw    = is_string( $json ) && strlen( $json ) <= self::MAX_CONFIG_OCTETS ? json_decode( $json, true ) : null;
		$config = self::sanitize_config( $raw, $product_id );
		if ( null === $config ) {
			wp_send_json_error( __( 'Invalid configuration.', 'ahime-neon-sign-configurator' ), 400 );
		}

		// Le tarificateur DE CE PRODUIT : c'est lui qui a le dernier mot sur le
		// prix, et il doit être le même que celui qu'a vu le client.
		$tarif   = AHNS_Pricing::pour_produit( $product_id );
		$measure = $tarif->measure( $config );
		$errors  = $tarif->validate( $config, $measure );
		if ( ! empty( $errors ) ) {
			wp_send_json_error( implode( ' ', $errors ), 409 );
		}

		// PRIX SERVEUR (fait foi). L'écart avec le prix client est journalisé.
		$price        = $tarif->price( $config, $measure );
		$client_cents = isset( $_POST['priceCents'] ) ? absint( wp_unslash( $_POST['priceCents'] ) ) : 0;
		// Journalisé seulement quand le site est en mode débogage.
		if ( $client_cents && abs( $client_cents - $price['displayTotalCents'] ) > 1 && defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
			error_log( sprintf( '[AHNS] Client/server price mismatch: %d vs %d', $client_cents, $price['displayTotalCents'] ) ); // phpcs:ignore
		}

		// Captures du design (fidèles à l'aperçu) — optionnelles, bornées à
		// ~400 Ko chacune. La seconde montre le tube ÉTEINT : un néon passe le
		// plus clair de sa vie ainsi, et ne l'avoir jamais montré est la
		// déception la plus courante du métier (écart E03).
		// capture_valide() n'accepte qu'une data-URL PNG ou JPEG en base64 strict : c'est l'assainissement.
		$preview     = isset( $_POST['preview'] ) ? self::capture_valide( wp_unslash( $_POST['preview'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$preview_off = isset( $_POST['previewOff'] ) ? self::capture_valide( wp_unslash( $_POST['previewOff'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		// La vue 3D sur son décor, quand le client l'a ouverte. Elle n'est JAMAIS
		// construite pour la capture : voir `capture3d` côté widget. Elle est donc
		// absente pour une bonne part des commandes, et c'est voulu.
		// LA MASSE VIENT DU NAVIGATEUR, qui l'a calculée avec `masseEnseigne`.
		// La recalculer ici demanderait de réécrire la fonction et sa table de
		// masses volumiques — deux implémentations à faire diverger. Bornée à
		// 500 kg : au-delà ce n'est plus une enseigne, c'est une saisie fausse.
		$masse_kg = isset( $_POST['massKg'] ) ? (float) sanitize_text_field( wp_unslash( $_POST['massKg'] ) ) : 0.0;
		if ( ! is_finite( $masse_kg ) || $masse_kg <= 0 || $masse_kg > 500 ) {
			$masse_kg = 0.0;
		}
		$preview_3d  = isset( $_POST['preview3d'] ) ? self::capture_valide( wp_unslash( $_POST['preview3d'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized

		// SVG source du logo — vérification atelier avant fabrication. Refusé si
		// suspect (script, javascript:, gestionnaire d'évènement) ou trop lourd,
		// puis réduit aux seules balises et attributs de dessin (svg_propre).
		$logo_svg = isset( $_POST['logoSvg'] ) ? self::svg_propre( wp_unslash( $_POST['logoSvg'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- filtré par svg_propre().

		$geometry = null;
		if ( isset( $_POST['geometry'] ) ) {
			// Reconstruite nombre par nombre par sanitize_geometry() : rien d'autre n'en sort.
			$geometry_json = wp_unslash( $_POST['geometry'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			if ( is_string( $geometry_json ) && strlen( $geometry_json ) <= 800000 ) {
				$geometry = self::sanitize_geometry( json_decode( $geometry_json, true ) );
			}
		}

		$texts   = array_filter( array_map( static fn( $l ) => $l['text'], $config['lines'] ) );
		$etiquettes = array(
			'panel'    => __( 'Panel', 'ahime-neon-sign-configurator' ),
			'box-sign' => __( 'Light box', 'ahime-neon-sign-configurator' ),
			'logo-svg' => __( 'Custom logo', 'ahime-neon-sign-configurator' ),
		);
		$summary = array(
			'text'      => isset( $etiquettes[ $config['kind'] ] ) ? $etiquettes[ $config['kind'] ] : implode( ' / ', $texts ),
			'width_cm'  => $measure['widthCm'],
			'height_cm' => $measure['heightCm'],
			'tube_m'    => $measure['tubeLengthM'],
		);
		// PLAN ÉLECTRIQUE ET FABRICABILITÉ, figés À LA COMMANDE — comme le
		// prix. Un coefficient changé le mois prochain ne doit pas réécrire la
		// fiche d'atelier d'une commande déjà passée.
		$summary['elec'] = $tarif->plan_electrique( $measure['tubeLengthM'] );
		if ( 'text' === $config['kind'] ) {
			$summary['elec']['corners'] = $tarif->fabrication_metrics( $config )['corners'];
		}

		// PRODUIT VARIABLE : WooCommerce refuse d'ajouter le parent sans
		// variation (« Please choose product options »). Le configurateur
		// REMPLACE le choix de variations : on en résout une côté serveur, de
		// façon déterministe, et ses attributs sont masqués au client (il ne
		// les a jamais choisis). Le prix reste celui calculé par AHNS_Pricing.
		$variation_id = 0;
		$variation    = array();
		if ( $product->is_type( 'variable' ) ) {
			foreach ( $product->get_children() as $child_id ) {
				$child = wc_get_product( $child_id );
				if ( $child && $child->is_purchasable() && $child->is_in_stock() ) {
					$variation_id = (int) $child_id;
					$variation    = (array) $child->get_variation_attributes();
					break;
				}
			}
			if ( ! $variation_id ) {
				wp_send_json_error( __( 'Product unavailable.', 'ahime-neon-sign-configurator' ), 400 );
			}
		}

		$added = WC()->cart->add_to_cart(
			$product_id,
			1,
			$variation_id,
			$variation,
			array(
				self::CART_KEY => array(
					'config'      => $config,
					'price_cents' => $price['displayTotalCents'],
					'price_lines' => $price['lines'],
					'summary'     => $summary,
					'preview'     => $preview,
					'preview_off' => $preview_off,
					'preview_3d'  => $preview_3d,
					'mass_kg'     => $masse_kg,
					'logo_svg'    => $logo_svg,
					'geometry'    => $geometry,
					'uid'         => wp_generate_uuid4(),
				),
			)
		);
		if ( ! $added ) {
			wp_send_json_error( __( 'Could not add to cart.', 'ahime-neon-sign-configurator' ), 500 );
		}

		// ÉDITION : la nouvelle ligne est en place → on retire l'ancienne.
		// L'ordre (ajouter PUIS retirer) évite de vider le panier si l'ajout
		// échoue. La clé vient de la session du visiteur : elle ne peut désigner
		// que sa propre ligne.
		$edit_key = isset( $_POST['editCartItemKey'] ) ? sanitize_text_field( wp_unslash( $_POST['editCartItemKey'] ) ) : '';
		$replaced = false;
		if ( '' !== $edit_key && $edit_key !== $added && WC()->cart->get_cart_item( $edit_key ) ) {
			WC()->cart->remove_cart_item( $edit_key );
			$replaced = true;
		}
		wp_send_json_success(
			array(
				'cart_item_key' => $added,
				'price_cents'   => $price['displayTotalCents'],
				'replaced'      => $replaced,
				'cart_url'      => wc_get_cart_url(),
				'checkout_url'  => wc_get_checkout_url(),
			)
		);
	}

	/**
	 * Restaure les données depuis la session WC.
	 */
	public function restore_from_session( $cart_item, $session_data ) {
		if ( isset( $session_data[ self::CART_KEY ] ) ) {
			$cart_item[ self::CART_KEY ] = $session_data[ self::CART_KEY ];
			// Produit variable : WooCommerce réinjecte les attributs de la
			// variation résolue en interne. Le client n'a rien choisi de tel
			// (le configurateur remplace les variations) — on les efface pour
			// qu'ils n'apparaissent ni au panier blocs, ni sur la commande.
			// `variation_id` est conservé : c'est lui qui identifie l'article.
			$cart_item['variation'] = array();
		}
		return $cart_item;
	}

	/**
	 * Applique le prix CALCULÉ (serveur) à la ligne de panier.
	 *
	 * @param WC_Cart $cart Panier.
	 */
	public function apply_calculated_price( $cart ) {
		if ( ! $cart instanceof WC_Cart ) {
			return;
		}
		foreach ( $cart->get_cart() as $item ) {
			if ( isset( $item[ self::CART_KEY ]['price_cents'], $item['data'] ) ) {
				$item['data']->set_price( ( (int) $item[ self::CART_KEY ]['price_cents'] ) / 100 );
			}
		}
	}

	/**
	 * Détail lisible sous la ligne de panier (un détail par ligne, cm — leçons
	 * du projet de référence).
	 */
	public function display_item_data( $item_data, $cart_item ) {
		if ( empty( $cart_item[ self::CART_KEY ]['summary'] ) ) {
			return $item_data;
		}
		$s      = $cart_item[ self::CART_KEY ]['summary'];
		$config = $cart_item[ self::CART_KEY ]['config'];

		// On repart d'une liste VIDE : sur un produit variable, WooCommerce a
		// déjà empilé les attributs de la variation résolue en interne
		// (« Couleur : Rose »), que le client n'a jamais choisis — les afficher
		// serait trompeur.
		$item_data = array();

		$item_data[] = array( 'key' => __( 'Text', 'ahime-neon-sign-configurator' ), 'value' => esc_html( $s['text'] ), 'display' => '' );
		$item_data[] = array(
			'key'     => __( 'Dimensions', 'ahime-neon-sign-configurator' ),
			'value'   => esc_html( sprintf( '%s × %s cm', self::cm( $s['width_cm'] ), self::cm( $s['height_cm'] ) ) ),
			'display' => '',
		);
		$item_data[] = array(
			'key'     => __( 'Backing', 'ahime-neon-sign-configurator' ),
			'value'   => esc_html( $config['support']['type'] . ' · ' . $config['support']['finish'] ),
			'display' => '',
		);
		$opts = array();
		if ( 'rgb' === $config['colorMode'] ) {
			$opts[] = __( 'RGB', 'ahime-neon-sign-configurator' );
		}
		if ( 'outdoor' === $config['environment'] ) {
			// « Extérieur IP67 » tout court sur-annonçait : c'est le tube et le
			// bloc qui sont IP67, le caisson est DRAINÉ, donc IP65. Un caisson
			// scellé enferme de l'air humide et condense (docs/02 §1.4).
			$opts[] = __( 'Outdoor (drained IP65 box, IP67 tube and driver)', 'ahime-neon-sign-configurator' );
		}
		if ( ! empty( $config['options']['dimmerRemote'] ) ) {
			$opts[] = __( 'Dimmer', 'ahime-neon-sign-configurator' );
		}
		if ( ! empty( $config['options']['express'] ) ) {
			$opts[] = __( 'Express', 'ahime-neon-sign-configurator' );
		}
		if ( $opts ) {
			$item_data[] = array( 'key' => __( 'Options', 'ahime-neon-sign-configurator' ), 'value' => esc_html( implode( ', ', $opts ) ), 'display' => '' );
		}

		// ACTIONS sur leur propre ligne, sous les détails : de VRAIS boutons
		// (pas des liens), à la couleur de marque — docs/06 §5.
		$key         = isset( $cart_item['key'] ) ? (string) $cart_item['key'] : '';
		$actions     = array();
		$preview_url = $key ? $this->preview_url( $cart_item, $key ) : '';
		if ( '' !== $preview_url ) {
			$actions[] = sprintf(
				'<a class="ahns-cart-preview" href="%s" data-ahns-preview="%s">%s</a>',
				esc_url( $preview_url ),
				esc_url( $preview_url ),
				esc_html__( 'Preview', 'ahime-neon-sign-configurator' )
			);
		}
		$edit_url = $key ? $this->edit_url( $cart_item, $key ) : '';
		if ( '' !== $edit_url ) {
			$actions[] = sprintf(
				'<a class="ahns-cart-edit" href="%s">%s</a>',
				esc_url( $edit_url ),
				esc_html__( 'Edit design', 'ahime-neon-sign-configurator' )
			);
		}
		if ( ! empty( $actions ) ) {
			$item_data[] = array(
				'key'     => '',
				'value'   => '',
				'display' => '<span class="ahns-cart-actions">' . implode( '', $actions ) . '</span>',
			);
		}
		return $item_data;
	}

	/**
	 * URL rouvrant le configurateur sur CETTE ligne de panier pour la modifier.
	 * Cible : la fiche produit si elle porte le configurateur, sinon la page
	 * dédiée. `ahns_edit` porte la clé de ligne ; le widget charge la
	 * configuration et l'enregistrement REMPLACE la ligne (docs/06 §5).
	 *
	 * @param array  $cart_item     Ligne de panier.
	 * @param string $cart_item_key Clé de ligne.
	 * @return string
	 */
	private function edit_url( $cart_item, $cart_item_key ) {
		$product_id = isset( $cart_item['product_id'] ) ? (int) $cart_item['product_id'] : 0;
		$url        = '';
		if ( $product_id > 0 && class_exists( 'AHNS_Product' ) && AHNS_Product::is_enabled( $product_id ) ) {
			$mode = AHNS_Product::display_mode( $product_id );
			// En mode « redirection », la fiche n'affiche qu'un bouton : on
			// renvoie directement vers la page dédiée, qui porte le configurateur.
			$url = 'redirect' === $mode ? '' : (string) get_permalink( $product_id );
		}
		if ( '' === $url && class_exists( 'AHNS_Page' ) ) {
			$url = AHNS_Page::url( $product_id );
		}
		if ( '' === $url ) {
			return '';
		}
		return add_query_arg( 'ahns_edit', rawurlencode( $cart_item_key ), $url );
	}

	/**
	 * Persiste la configuration + le détail de prix sur la ligne de commande.
	 */
	public function save_order_item_meta( $item, $cart_item_key, $values ) {
		if ( empty( $values[ self::CART_KEY ] ) ) {
			return;
		}
		$data = $values[ self::CART_KEY ];
		$item->add_meta_data( '_ahns_config', wp_json_encode( $data['config'] ) );
		$item->add_meta_data( '_ahns_price_cents', (int) $data['price_cents'] );
		$item->add_meta_data( '_ahns_price_lines', wp_json_encode( $data['price_lines'] ) );
		$item->add_meta_data( '_ahns_summary', wp_json_encode( $data['summary'] ) );
		if ( ! empty( $data['preview'] ) ) {
			$item->add_meta_data( '_ahns_preview', $data['preview'] );
		}
		if ( ! empty( $data['mass_kg'] ) ) {
			$item->add_meta_data( '_ahns_mass_kg', $data['mass_kg'] );
		}
		if ( ! empty( $data['preview_3d'] ) ) {
			$item->add_meta_data( '_ahns_preview_3d', $data['preview_3d'] );
		}
		if ( ! empty( $data['preview_off'] ) ) {
			$item->add_meta_data( '_ahns_preview_off', $data['preview_off'] );
		}
		if ( ! empty( $data['logo_svg'] ) ) {
			$item->add_meta_data( '_ahns_logo_svg', $data['logo_svg'] );
		}
		if ( ! empty( $data['geometry'] ) ) {
			$item->add_meta_data( '_ahns_geometry', wp_json_encode( $data['geometry'] ) );
		}
		$item->add_meta_data( __( 'Text', 'ahime-neon-sign-configurator' ), $data['summary']['text'] );
		$item->add_meta_data( __( 'Dimensions', 'ahime-neon-sign-configurator' ), sprintf( '%s × %s cm', self::cm( $data['summary']['width_cm'] ), self::cm( $data['summary']['height_cm'] ) ) );
	}

	/**
	 * URL de l'endpoint servant la capture d'une ligne de panier (nonce signé).
	 */
	private function preview_url( $cart_item, $cart_item_key ) {
		$preview = isset( $cart_item[ self::CART_KEY ]['preview'] ) ? (string) $cart_item[ self::CART_KEY ]['preview'] : '';
		if ( '' === $preview ) {
			return '';
		}
		return add_query_arg(
			array(
				'ahns_preview_key' => rawurlencode( (string) $cart_item_key ),
				'ahns_preview_sig' => wp_create_nonce( 'ahns_preview_' . (string) $cart_item_key ),
			),
			home_url( '/' )
		);
	}

	/**
	 * Sert l'image de capture depuis la session panier (endpoint signé).
	 */
	public function serve_preview_image() {
		if ( empty( $_GET['ahns_preview_key'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return;
		}
		$key = sanitize_text_field( wp_unslash( $_GET['ahns_preview_key'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$sig = isset( $_GET['ahns_preview_sig'] ) ? sanitize_text_field( wp_unslash( $_GET['ahns_preview_sig'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! $key || ! wp_verify_nonce( $sig, 'ahns_preview_' . $key ) ) {
			status_header( 403 );
			exit;
		}
		if ( function_exists( 'wc_load_cart' ) && function_exists( 'WC' ) && ! WC()->cart ) {
			wc_load_cart();
		}
		$cart_item = function_exists( 'WC' ) && WC()->cart ? WC()->cart->get_cart_item( $key ) : null;
		$preview   = isset( $cart_item[ self::CART_KEY ]['preview'] ) ? (string) $cart_item[ self::CART_KEY ]['preview'] : '';
		if ( ! preg_match( '#^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$#', $preview, $m ) ) {
			status_header( 404 );
			exit;
		}
		$binary = base64_decode( $m[2], true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $binary ) {
			status_header( 404 );
			exit;
		}
		header( 'Content-Type: image/' . ( 'jpeg' === $m[1] ? 'jpeg' : 'png' ) );
		header( 'Cache-Control: private, max-age=300' );
		echo $binary; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	/**
	 * Vignette du panier CLASSIQUE = capture du design.
	 */
	public function cart_thumbnail( $thumbnail, $cart_item, $cart_item_key ) {
		$url = $this->preview_url( $cart_item, (string) $cart_item_key );
		if ( '' === $url ) {
			return $thumbnail;
		}
		return sprintf(
			'<img src="%s" alt="%s" style="width:72px;height:auto;border-radius:8px;" />',
			esc_url( $url ),
			esc_attr__( 'Neon preview', 'ahime-neon-sign-configurator' )
		);
	}

	/**
	 * Vignette du panier BLOCS (Store API).
	 */
	public function store_api_cart_item_images( $images, $cart_item, $cart_item_key ) {
		$url = $this->preview_url( $cart_item, (string) $cart_item_key );
		if ( '' === $url ) {
			return $images;
		}
		return array(
			(object) array(
				'id'        => -1,
				'src'       => $url,
				'thumbnail' => $url,
				'srcset'    => '',
				'sizes'     => '',
				'name'      => __( 'Neon preview', 'ahime-neon-sign-configurator' ),
				'alt'       => __( 'Neon preview', 'ahime-neon-sign-configurator' ),
			),
		);
	}

	/**
	 * Zoom au survol des vignettes de design (panier + commande) : carte
	 * flottante près du curseur avec l'image en grand, qui bascule de côté aux
	 * bords de la fenêtre. Souris uniquement (au tactile, la vignette suffit).
	 */
	public function render_hover_zoom_assets() {
		if ( function_exists( 'is_cart' ) && ! is_cart() && function_exists( 'is_checkout' ) && ! is_checkout() ) {
			return;
		}
		$accent = self::accent_color();
		?>
		<style id="ahns-cart-actions-css">
			/* Un détail par ligne (les blocs WooCommerce les mettent en enfilade). */
			.wc-block-components-product-details>span{display:block;margin:0 0 2px;}
			.wc-block-components-product-details>span>span[aria-hidden="true"]{display:none;}
			.wc-block-components-product-details>span:has(.ahns-cart-actions){display:block;margin-top:10px;}
			/* Actions : de VRAIS boutons, à la couleur de marque. */
			.ahns-cart-actions{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;}
			.ahns-cart-actions a{white-space:nowrap;display:inline-flex;align-items:center;padding:7px 16px;border-radius:999px;font-size:12.5px;font-weight:600;line-height:1.2;text-decoration:none;box-shadow:none;transition:filter .15s ease;}
			.ahns-cart-actions a.ahns-cart-preview{background:#fff;color:<?php echo esc_attr( $accent ); ?>;border:1.5px solid <?php echo esc_attr( $accent ); ?>;}
			.ahns-cart-actions a.ahns-cart-edit{background:<?php echo esc_attr( $accent ); ?>;color:#fff;border:1.5px solid <?php echo esc_attr( $accent ); ?>;}
			.ahns-cart-actions a:hover{filter:brightness(.94);}
			.ahns-cart-actions a.ahns-cart-preview:hover{color:<?php echo esc_attr( $accent ); ?>;}
			.ahns-cart-actions a.ahns-cart-edit:hover{color:#fff;}
			/* Fenêtre « Aperçu ». */
			.ahns-preview-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(12,14,18,.72);padding:24px}
			.ahns-preview-modal.is-open{display:flex}
			.ahns-preview-modal__dialog{position:relative;max-width:min(900px,94vw);max-height:90vh;border-radius:14px;background:#101216;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.4)}
			.ahns-preview-modal__close{position:absolute;right:10px;top:10px;box-sizing:border-box;width:36px;height:36px;min-width:36px;padding:0;margin:0;border:0;outline:0;box-shadow:none;border-radius:999px;background:#fff;color:#111827;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
			.ahns-preview-modal__close:focus,.ahns-preview-modal__close:focus-visible{outline:0;box-shadow:0 0 0 3px rgba(255,255,255,.35)}
			.ahns-preview-modal__title{margin:0 44px 12px 0;font-size:15px;font-weight:700;color:#fff}
			.ahns-preview-modal__image{display:block;max-width:100%;max-height:72vh;border-radius:8px;object-fit:contain}
		</style>
		<div class="ahns-preview-modal" id="ahns-preview-modal" aria-hidden="true">
			<div class="ahns-preview-modal__dialog" role="dialog" aria-modal="true">
				<button type="button" class="ahns-preview-modal__close" aria-label="<?php echo esc_attr__( 'Close', 'ahime-neon-sign-configurator' ); ?>">&times;</button>
				<p class="ahns-preview-modal__title"><?php echo esc_html__( 'Preview of your neon', 'ahime-neon-sign-configurator' ); ?></p>
				<img class="ahns-preview-modal__image" alt="<?php echo esc_attr__( 'Preview of your neon', 'ahime-neon-sign-configurator' ); ?>" />
			</div>
		</div>
		<script id="ahns-preview-modal-js">
		(function(){
			var modal=document.getElementById('ahns-preview-modal');
			if(!modal){return;}
			var img=modal.querySelector('.ahns-preview-modal__image');
			var close=modal.querySelector('.ahns-preview-modal__close');
			function open(url){img.src=url;modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');close.focus();}
			function shut(){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');img.removeAttribute('src');}
			document.addEventListener('click',function(e){
				var trigger=e.target.closest&&e.target.closest('.ahns-cart-preview');
				if(trigger){e.preventDefault();open(trigger.getAttribute('data-ahns-preview')||trigger.href);return;}
				if(e.target===modal||e.target===close){e.preventDefault();shut();}
			});
			document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('is-open')){shut();}});
		}());
		</script>
		<style id="ahns-hover-zoom-css">
			img[src*="ahns_preview_key"]{cursor:zoom-in}
			.ahns-hover-zoom{position:fixed;left:0;top:0;z-index:100000;display:none;pointer-events:none;background:#101216;border-radius:12px;padding:8px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
			.ahns-hover-zoom.is-visible{display:block}
			.ahns-hover-zoom img{display:block;width:min(440px,60vw);height:auto;border-radius:8px}
		</style>
		<div class="ahns-hover-zoom" id="ahns-hover-zoom" aria-hidden="true"><img alt="" /></div>
		<script>
		(function(){
			if(!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches){return;}
			var zoomEl=document.getElementById('ahns-hover-zoom');
			if(!zoomEl){return;}
			var zoomImg=zoomEl.querySelector('img');
			var OFFSET=18;
			function targetImg(node){
				var img=node && node.closest ? node.closest('img[src*="ahns_preview_key"]') : null;
				return img && !img.closest('.ahns-hover-zoom') ? img : null;
			}
			function hide(){zoomEl.classList.remove('is-visible');zoomImg.removeAttribute('src');}
			function place(event){
				var w=zoomEl.offsetWidth,h=zoomEl.offsetHeight;
				var x=event.clientX+OFFSET,y=event.clientY+OFFSET;
				if(x+w>window.innerWidth-8){x=event.clientX-w-OFFSET;}
				if(y+h>window.innerHeight-8){y=event.clientY-h-OFFSET;}
				zoomEl.style.left=Math.max(8,x)+'px';
				zoomEl.style.top=Math.max(8,y)+'px';
			}
			document.addEventListener('mouseover',function(event){
				var img=targetImg(event.target);
				if(!img){return;}
				zoomImg.src=img.src;
				zoomEl.classList.add('is-visible');
				place(event);
			});
			document.addEventListener('mousemove',function(event){
				if(!zoomEl.classList.contains('is-visible')){return;}
				if(!targetImg(event.target)){return;}
				place(event);
			});
			document.addEventListener('mouseout',function(event){
				if(targetImg(event.target) && !targetImg(event.relatedTarget)){hide();}
			});
			document.addEventListener('click',hide);
		})();
		</script>
		<?php
	}

	/**
	 * Couleur de marque des boutons (filtrable par le thème / une extension,
	 * en attendant la page « Apparence » du back-office).
	 *
	 * @return string
	 */
	public static function accent_color() {
		$accent = apply_filters( 'ahns_accent_color', '#ec4899' );
		$accent = sanitize_hex_color( (string) $accent );
		return $accent ? $accent : '#ec4899';
	}

	/** Formate un nombre de cm sans décimale inutile. */
	private static function cm( $value ) {
		$v = (float) $value;
		return rtrim( rtrim( number_format( $v, 1, ',', ' ' ), '0' ), ',' );
	}
}
