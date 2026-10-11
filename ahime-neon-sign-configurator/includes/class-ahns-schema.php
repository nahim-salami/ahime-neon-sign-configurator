<?php
/**
 * Les données structurées de la fiche produit.
 *
 * CE QUE CETTE CLASSE NE FAIT PAS : écrire un bloc JSON-LD.
 *
 * WooCommerce en écrit déjà un (WC_Structured_Data). Ajouter le nôtre à côté
 * donnerait DEUX `Product` sur la même page — et deux Product valent zéro
 * résultat enrichi, pas deux. On corrige donc le sien, par son filtre.
 *
 * CE QU'IL Y AVAIT À CORRIGER. Relevé sur le site de vérification, fiche
 * « Néon personnalisé » :
 *
 *     "offers": [{ "@type": "Offer",
 *                  "priceSpecification": [{ "price": "0", … }] }]
 *
 * Zéro. Et c'est logique : un produit configurable n'a pas de prix dans
 * WooCommerce, il en a un par configuration. WooCommerce lit le champ vide et
 * annonce gratuit. Un moteur qui lit ça affiche « 0,00 € » sous la fiche, ou
 * — plus souvent — écarte la fiche des résultats marchands.
 *
 * Manquaient aussi `image` (que Google EXIGE pour un résultat produit) et
 * `brand`, et le `sku` sortait en entier alors que schema.org attend du texte.
 *
 * D'OÙ VIENT LE PRIX ANNONCÉ.
 *
 * De AHNS_Pricing, jamais d'une constante. Le barème vit à un seul endroit,
 * et sa parité avec @neon/core est verrouillée par scripts/parity-check.mjs :
 * un prix recopié ici dériverait en silence le jour où un coefficient bouge.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Corrige le balisage produit de WooCommerce pour un produit configurable.
 */
class AHNS_Schema {

	/** Préfixe du transitoire qui garde la fourchette calculée. */
	const TRANSITOIRE = 'ahns_schema_prix_';

	/** Douze heures : un barème ne change pas plus souvent qu'un tarif. */
	const DUREE = 12 * HOUR_IN_SECONDS;

	/**
	 * Le mot servant de référence pour le HAUT de la fourchette.
	 *
	 * Le bas, lui, ne se choisit pas : c'est le minimum réellement commandable
	 * (voir fourchette_cents()). Le haut demande une convention, parce qu'un
	 * plafond calculé sur les limites absolues du barème — trois lignes de
	 * vingt lettres en deux mètres de haut — donnerait un nombre vrai et
	 * inutile, sans rapport avec ce que les clients commandent.
	 *
	 * Cinq lettres au plus grand palier de taille : c'est une commande
	 * courante, et le marchand qui vend surtout du petit format abaisse le
	 * plafond par le filtre `ahns_schema_fourchette`.
	 */
	const MOT_REFERENCE = 'NEON';

	/**
	 * Crochets.
	 */
	public function hooks() {
		add_filter( 'woocommerce_structured_data_product', array( $this, 'produit' ), 10, 2 );

		// Un barème ou un catalogue qui bouge invalide la fourchette gardée.
		add_action( 'update_option_' . AHNS_Settings::OPTION, array( __CLASS__, 'oublier' ) );
		add_action( 'updated_post_meta', array( __CLASS__, 'oublier_si_produit' ), 10, 3 );
	}

	/**
	 * Réécrit le `Product` de WooCommerce pour un produit configurable.
	 *
	 * @param array       $markup  Balisage produit de WooCommerce.
	 * @param WC_Product|null $product Produit courant.
	 * @return array
	 */
	public function produit( $markup, $product = null ) {
		if ( ! $product instanceof WC_Product || ! is_array( $markup ) ) {
			return $markup;
		}

		$id = (int) $product->get_id();

		/*
		 * UN PRODUIT ORDINAIRE GARDE SON BALISAGE. Une boutique peut vendre
		 * des néons configurables ET des articles à prix fixe ; ceux-là ont un
		 * vrai prix dans WooCommerce, et le balisage de WooCommerce est juste.
		 */
		if ( ! class_exists( 'AHNS_Product' ) || ! AHNS_Product::is_enabled( $id ) ) {
			return $markup;
		}

		$markup = $this->corriger_offres( $markup, $product, $id );
		$markup = $this->ajouter_images( $markup, $product );
		$markup = $this->ajouter_identite( $markup, $product );

		/**
		 * Le balisage produit final, après correction.
		 *
		 * @param array      $markup  Balisage.
		 * @param WC_Product $product Produit.
		 */
		return (array) apply_filters( 'ahns_schema_produit', $markup, $product );
	}

	/* -------------------------------------------------------------- */
	/*  Les offres                                                     */
	/* -------------------------------------------------------------- */

	/**
	 * Remplace l'`Offer` à zéro par un `AggregateOffer` avec de vraies bornes.
	 *
	 * `AggregateOffer` et non `Offer` : le produit n'a pas UN prix, il en a une
	 * plage. C'est le type que schema.org prévoit exactement pour ça, et celui
	 * que Google attend d'une fiche configurable — sans quoi il compare un prix
	 * unique annoncé à un prix affiché qui n'est jamais le même, et finit par
	 * ne plus faire confiance à la fiche.
	 *
	 * @param array      $markup  Balisage.
	 * @param WC_Product $product Produit.
	 * @param int        $id      Identifiant produit.
	 * @return array
	 */
	private function corriger_offres( $markup, $product, $id ) {
		$fourchette = self::fourchette_cents( $id );

		if ( ! $fourchette ) {
			/*
			 * Le calcul n'a rien donné (polices absentes, barème illisible).
			 * On RETIRE les offres plutôt que de laisser passer le zéro : une
			 * fiche sans prix est incomplète, une fiche à zéro est fausse. Et
			 * une donnée fausse coûte plus cher qu'une donnée manquante.
			 */
			unset( $markup['offers'] );
			return $markup;
		}

		list( $bas, $haut ) = $fourchette;

		$offre = array(
			'@type'           => 'AggregateOffer',
			'lowPrice'        => self::montant( $bas ),
			'highPrice'       => self::montant( $haut ),
			'priceCurrency'   => get_woocommerce_currency(),
			'offerCount'      => 1,
			'availability'    => 'https://schema.org/InStock',
			'itemCondition'   => 'https://schema.org/NewCondition',
			'url'             => $product->get_permalink(),
			'priceValidUntil' => gmdate( 'Y-m-d', time() + YEAR_IN_SECONDS ),
			'seller'          => array(
				'@type' => 'Organization',
				'name'  => get_bloginfo( 'name' ),
				'url'   => home_url( '/' ),
			),
		);

		/*
		 * NI `shippingDetails` NI `hasMerchantReturnPolicy`.
		 *
		 * Les deux amélioreraient l'affichage dans Google Shopping, et les
		 * deux sont des ENGAGEMENTS : des frais de port et un délai de
		 * rétractation annoncés au moteur sont opposables au marchand. Ils ne
		 * s'inventent pas depuis un thème — ils viendront des réglages de
		 * livraison le jour où l'écran existera.
		 */

		$markup['offers'] = array( $offre );

		return $markup;
	}

	/**
	 * La fourchette de prix du produit, en centimes, gardée en transitoire.
	 *
	 * @param int $id Produit.
	 * @return array{0:int,1:int}|null
	 */
	public static function fourchette_cents( $id ) {
		$cle    = self::TRANSITOIRE . $id . '_' . get_woocommerce_currency();
		$garde = get_transient( $cle );

		if ( is_array( $garde ) && 2 === count( $garde ) ) {
			return array( (int) $garde[0], (int) $garde[1] );
		}

		$fourchette = self::calculer( $id );

		/**
		 * La fourchette annoncée aux moteurs, en centimes.
		 *
		 * Le point de reprise du marchand : une boutique qui ne vend que du
		 * petit format abaisse son plafond ici, sans toucher au barème.
		 *
		 * @param array{0:int,1:int}|null $fourchette Bas et haut, en centimes.
		 * @param int                     $id         Produit.
		 */
		$fourchette = apply_filters( 'ahns_schema_fourchette', $fourchette, $id );

		if ( ! is_array( $fourchette ) || 2 !== count( $fourchette ) ) {
			return null;
		}

		$bas  = (int) $fourchette[0];
		$haut = max( (int) $fourchette[1], $bas );

		if ( $bas <= 0 ) {
			return null;
		}

		set_transient( $cle, array( $bas, $haut ), self::DUREE );

		return array( $bas, $haut );
	}

	/**
	 * Calcule les deux bornes avec le barème du produit.
	 *
	 * LE BAS NE SE CHOISIT PAS. C'est une lettre, à la plus petite hauteur que
	 * la boutique autorise, avec le support le moins cher qu'elle propose —
	 * donc le minimum qu'un client peut réellement payer. On essaie CHAQUE
	 * support activé et on garde le moins cher, plutôt que d'en désigner un :
	 * l'ordre des supports dans le catalogue n'a rien à voir avec leur prix,
	 * et un marchand qui désactive le moins cher ferait mentir une constante.
	 *
	 * @param int $id Produit.
	 * @return array{0:int,1:int}|null
	 */
	private static function calculer( $id ) {
		if ( ! class_exists( 'AHNS_Pricing' ) || ! class_exists( 'AHNS_Catalog' ) ) {
			return null;
		}

		try {
			$bareme = AHNS_Pricing::pour_produit( $id );
			$polices = $bareme->font_ids();

			if ( ! $polices ) {
				return null; // Aucune police servie : rien de mesurable.
			}

			$police  = (string) reset( $polices );
			$couleur = (string) AHNS_Catalog::default_color();
			$bornes  = class_exists( 'AHNS_Settings' ) ? AHNS_Settings::size_bounds() : array( 'minCm' => 8, 'maxCm' => 60 );

			$supports  = array_keys( AHNS_Catalog::enabled_support_types() );
			$finitions = array_keys( AHNS_Catalog::enabled_finishes() );

			if ( ! $supports ) {
				$supports = array( 'none' );
			}
			if ( ! $finitions ) {
				$finitions = array( 'clear' );
			}

			$finition = (string) reset( $finitions );

			// Le plus grand palier de taille, ou la borne haute à défaut.
			$hauteur_haute = (float) $bornes['maxCm'];
			if ( class_exists( 'AHNS_Settings' ) ) {
				$paliers = AHNS_Settings::size_presets();
				if ( $paliers ) {
					$hauteur_haute = max( array_map( function ( $p ) {
						return (float) $p['letterHeightCm'];
					}, $paliers ) );
				}
			}

			/*
			 * LA BORNE BASSE DES RÉGLAGES N'EST PAS TOUJOURS COMMANDABLE.
			 *
			 * Relevé sur le site de vérification : le curseur de la boutique
			 * descend à 8 cm, mais validate() refuse — « hauteur de lettre
			 * minimale : 10 cm pour cette police ». Le minimum ne dépend pas
			 * que de la boutique : une police cursive (`script`) exige plus
			 * qu'une police bâton, parce qu'en dessous le tube ne se plie pas.
			 *
			 * On ne recopie donc PAS la règle ici — elle vit dans validate(),
			 * et une copie dériverait. On monte d'un centimètre jusqu'à ce que
			 * la configuration passe. Ce que le tunnel accepte fait foi, et
			 * rien d'autre.
			 */
			$bas  = null;
			$haut = null;

			// Quelques polices, pas les trente-trois : la première suffit
			// presque toujours, et l'on veut une page servie, pas un calcul.
			foreach ( array_slice( $polices, 0, 5 ) as $candidate ) {
				$candidate = (string) $candidate;
				$hauteur   = self::hauteur_minimale( $bareme, $candidate, $couleur, $bornes );

				if ( null === $hauteur ) {
					continue; // Cette police ne sait pas écrire le texte de référence.
				}

				foreach ( $supports as $support ) {
					$prix_bas = self::prix_de(
						$bareme,
						self::configuration( 'A', $candidate, $couleur, $hauteur, (string) $support, $finition )
					);
					$prix_haut = self::prix_de(
						$bareme,
						self::configuration( self::MOT_REFERENCE, $candidate, $couleur, max( $hauteur_haute, $hauteur ), (string) $support, $finition )
					);

					if ( null !== $prix_bas ) {
						$bas = ( null === $bas ) ? $prix_bas : min( $bas, $prix_bas );
					}
					if ( null !== $prix_haut ) {
						$haut = ( null === $haut ) ? $prix_haut : max( $haut, $prix_haut );
					}
				}

				if ( null !== $bas && null !== $haut ) {
					break;
				}
			}

			if ( null === $bas || null === $haut ) {
				return null;
			}

			return array( (int) $bas, (int) max( $haut, $bas ) );
		} catch ( Exception $e ) {
			/*
			 * Le balisage n'est jamais une raison de casser une fiche produit.
			 * Si le barème lève, on renonce au prix et la page reste servie.
			 */
			return null;
		}
	}

	/**
	 * La plus petite hauteur de lettre que le tunnel accepte pour cette police.
	 *
	 * On monte d'un centimètre à la fois depuis la borne basse de la boutique.
	 * La règle exacte (police bâton ou cursive, limites du barème) reste chez
	 * validate() : on l'interroge, on ne la reproduit pas.
	 *
	 * @param AHNS_Pricing $bareme  Barème.
	 * @param string      $police  Police.
	 * @param string      $couleur Hex du tube.
	 * @param array       $bornes  Bornes du curseur de la boutique.
	 * @return float|null
	 */
	private static function hauteur_minimale( $bareme, $police, $couleur, array $bornes ) {
		$hauteur = (float) $bornes['minCm'];
		$plafond = (float) $bornes['maxCm'];

		// Garde-fou : une boutique aux bornes larges ne doit pas faire tourner
		// cette boucle indéfiniment si aucune hauteur ne passe jamais.
		for ( $essai = 0; $essai < 60 && $hauteur <= $plafond; $essai++ ) {
			$config  = self::configuration( 'A', $police, $couleur, $hauteur, 'none', 'clear' );
			$mesures = $bareme->measure( $config );

			if ( ! $bareme->validate( $config, $mesures ) ) {
				return $hauteur;
			}

			$hauteur += 1.0;
		}

		return null;
	}

	/**
	 * Le prix d'une configuration, en centimes, ou null si elle est refusée.
	 *
	 * On passe par validate() : une configuration que le tunnel refuserait ne
	 * doit pas servir à annoncer un prix. C'est la même garde que le panier,
	 * pour la même raison — on n'annonce que ce qu'on sait vendre.
	 *
	 * @param AHNS_Pricing $bareme Barème.
	 * @param array       $config Configuration.
	 * @return int|null
	 */
	private static function prix_de( $bareme, array $config ) {
		$mesures = $bareme->measure( $config );

		if ( $bareme->validate( $config, $mesures ) ) {
			return null;
		}

		$prix = $bareme->price( $config, $mesures );

		$cents = isset( $prix['displayTotalCents'] ) ? (int) $prix['displayTotalCents'] : (int) ( $prix['totalCents'] ?? 0 );

		return $cents > 0 ? $cents : null;
	}

	/**
	 * Une configuration de référence, minimale et valide.
	 *
	 * @param string $texte    Texte d'une ligne.
	 * @param string $police   Identifiant de police.
	 * @param string $couleur  Hex du tube.
	 * @param float  $hauteur  Hauteur de lettre (cm).
	 * @param string $support  Type de support.
	 * @param string $finition Finition du support.
	 * @return array
	 */
	private static function configuration( $texte, $police, $couleur, $hauteur, $support, $finition ) {
		return array(
			'kind'           => 'text',
			'lines'          => array(
				array(
					'text'     => $texte,
					'fontId'   => $police,
					'colorHex' => $couleur,
				),
			),
			'letterHeightCm' => (float) $hauteur,
			'colorMode'      => 'solid',
			'support'        => array(
				'type'   => $support,
				'finish' => $finition,
			),
			'environment'    => 'indoor',
			'powerRegion'    => 'EU',
			'mounting'       => 'screws',
			'options'        => array(
				'dimmerRemote' => false,
				'express'      => false,
			),
		);
	}

	/**
	 * Formate des centimes en montant décimal, comme schema.org l'attend.
	 *
	 * Une chaîne, pas un flottant : « 129.00 » et non 129.0. Les validateurs
	 * acceptent les deux, les moteurs affichent la chaîne telle quelle.
	 *
	 * @param int $cents Montant.
	 * @return string
	 */
	private static function montant( $cents ) {
		return number_format( (int) $cents / 100, 2, '.', '' );
	}

	/* -------------------------------------------------------------- */
	/*  Les images et l'identité                                       */
	/* -------------------------------------------------------------- */

	/**
	 * Ajoute les images — Google les EXIGE pour un résultat produit.
	 *
	 * WooCommerce n'en met aucune sur un produit configurable, parce que le
	 * visuel est généré par le configurateur. La fiche a pourtant bien une
	 * image mise en avant et une galerie : ce sont elles qu'on déclare.
	 *
	 * @param array      $markup  Balisage.
	 * @param WC_Product $product Produit.
	 * @return array
	 */
	private function ajouter_images( $markup, $product ) {
		$images = array();

		$principale = (int) $product->get_image_id();
		if ( $principale ) {
			$url = wp_get_attachment_image_url( $principale, 'full' );
			if ( $url ) {
				$images[] = $url;
			}
		}

		foreach ( (array) $product->get_gallery_image_ids() as $piece ) {
			$url = wp_get_attachment_image_url( (int) $piece, 'full' );
			if ( $url ) {
				$images[] = $url;
			}
		}

		$images = array_values( array_unique( array_filter( $images ) ) );

		if ( $images ) {
			$markup['image'] = 1 === count( $images ) ? $images[0] : $images;
		}

		return $markup;
	}

	/**
	 * Marque, SKU et catégorie.
	 *
	 * LE `sku` SORTAIT EN ENTIER. WooCommerce y met l'identifiant du produit
	 * quand aucune référence n'est saisie — `"sku": 63`, un nombre là où
	 * schema.org attend du texte. Les validateurs le tolèrent, Merchant Center
	 * moins. On préfère la vraie référence si elle existe, et on rend une
	 * chaîne dans tous les cas.
	 *
	 * @param array      $markup  Balisage.
	 * @param WC_Product $product Produit.
	 * @return array
	 */
	private function ajouter_identite( $markup, $product ) {
		$sku = (string) $product->get_sku();

		$markup['sku'] = '' !== $sku ? $sku : (string) $product->get_id();

		if ( empty( $markup['brand'] ) ) {
			/**
			 * La marque déclarée sur la fiche.
			 *
			 * Le nom de la boutique par défaut : un néon sur mesure est
			 * fabriqué par le marchand, il n'a pas d'autre marque.
			 *
			 * @param string     $marque  Nom de la marque.
			 * @param WC_Product $product Produit.
			 */
			$marque = (string) apply_filters( 'ahns_schema_marque', get_bloginfo( 'name' ), $product );

			if ( '' !== $marque ) {
				$markup['brand'] = array(
					'@type' => 'Brand',
					'name'  => $marque,
				);
			}
		}

		return $markup;
	}

	/* -------------------------------------------------------------- */
	/*  L'oubli                                                        */
	/* -------------------------------------------------------------- */

	/**
	 * Oublie toutes les fourchettes gardées.
	 *
	 * Sans passe-partout sur les transitoires, on balaie l'option : c'est la
	 * seule façon fiable quand un cache objet externe est en place.
	 */
	public static function oublier() {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- purge de nos propres transitoires.
		$noms = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
				$wpdb->esc_like( '_transient_' . self::TRANSITOIRE ) . '%'
			)
		);

		foreach ( (array) $noms as $nom ) {
			delete_transient( str_replace( '_transient_', '', (string) $nom ) );
		}
	}

	/**
	 * Oublie la fourchette d'un produit dont le barème propre vient de changer.
	 *
	 * @param int    $meta_id  Identifiant de la méta (ignoré).
	 * @param int    $post_id  Produit.
	 * @param string $meta_key Clé modifiée.
	 */
	public static function oublier_si_produit( $meta_id, $post_id, $meta_key ) {
		if ( 0 !== strpos( (string) $meta_key, '_ahns_' ) ) {
			return;
		}

		delete_transient( self::TRANSITOIRE . (int) $post_id . '_' . get_woocommerce_currency() );
	}
}
