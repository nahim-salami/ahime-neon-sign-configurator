<?php
/**
 * Tarification & mesures — PORTAGE 1:1 de @neon/core (pricing.ts + metrics.ts).
 *
 * RÈGLE : toute modification ici DOIT être faite en miroir dans
 * packages/core/src/pricing.ts, et vice-versa. La parité est vérifiée par
 * scripts/parity-check.mjs (mêmes configurations → mêmes centimes, à
 * l'identique). Les montants sont en CENTIMES.
 *
 * @package NeonLightConfigurator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class AHNS_Pricing
 */
class AHNS_Pricing {

	/** Coefficients par défaut — miroir de coefficients.ts. */
	const COEFF = array(
		'baseCents'         => 3900,
		'tubePerMeterCents' => 10184,
		'complexity'        => array( 'singleLine' => 1.0, 'multiLine' => 1.15, 'logo' => 1.3 ),
		'supportPerM2Cents' => array(
			'clear'      => 9000,
			'black'      => 9000,
			'white'      => 9000,
			'colored'    => 11000,
			'mirror'     => 16000,
			'printed-uv' => 18000,
		),
		'supportMarginCm'   => 3,
		'wattsPerMeter'     => 12,
		'powerTiers'        => array( array( 60, 2500 ), array( 120, 3900 ) ),
		'powerMaxCents'     => 5900,
		'dimmerRemoteCents' => 1900,
		'nightTimerCents'   => 1900,
		'warrantyIndoorMonths'  => 24,
		'warrantyOutdoorMonths' => 12,
		'parcelMaxLengthCm'     => 234,
		'parcelMaxWidthCm'      => 119,
		'rgbFlatCents'      => 4900,
		'rgbTubeMultiplier' => 1.25,
		'mountingCents'     => array( 'screws' => 0, 'chains' => 1500, 'ceiling' => 1500, 'stand' => 2900 ),
		'boxPerM2Cents'     => 12000,
		'boxAssemblyCents'  => 4900,
		'boxDepthCm'        => 8,
		'outdoorMultiplier' => 1.7,
		'expressMultiplier' => 1.25,
		// DÉLAI DE FABRICATION ANNONCÉ (jours ouvrés) — docs/02 §Production.
		// Il n'entre dans AUCUN calcul de prix : il n'est ici que pour être
		// transmis au widget, qui doit l'afficher dans le configurateur et non
		// le laisser aux CGV (`parcours-configurateur-ux` §5).
		'leadTimeMinDays'        => 10,
		'leadTimeMaxDays'        => 15,
		'leadTimeExpressMinDays' => 5,
		'leadTimeExpressMaxDays' => 7,
		'marketingRounding' => true,
		// Flux linéique à partir duquel une bobine est dite « vitrine » (lm/m) —
		// miroir de vitrineLumensPerMeter. Frontière COMMERCIALE, pas constante
		// physique : le néon flex documenté va de 110 à 1 476 lm/m (docs/43 §18),
		// et le « ≥ 5 000 » qu'annonçait le besoin B18 n'existe nulle part.
		'vitrineLumensPerMeter' => 800,
		// Paliers de prix par taille (réglage marchand) — miroir de SizeTier.
		'sizeTiers'         => array(),
		// Catalogue de tubes du marchand (écart E02) — vide par défaut, et
		// tant qu'il l'est le prix emprunte exactement le chemin d'avant.
		'tubes'             => array(),
		// Catalogue d'alimentations du marchand (chantier A1) — vide par defaut,
		// et pour la meme raison que les tubes : un bloc est une piece ACHETEE.
		// Vide, `powerTiers` decide, exactement comme avant.
		'psus'              => array(),
		// Programmateurs du marchand (chantier A2). Vide, `nightTimerCents`
		// s'applique — c'est-a-dire le defaut NON SOURCE de docs/04 s5.9.
		'timers'            => array(),
		// Transporteur du marchand (chantier A4). Vide, les deux coefficients de
		// colis s'appliquent. Ne touche aucun prix : la scission avertit.
		'transporteur'      => array(),
		// Grille de prix PAR LETTRE ET PAR HAUTEUR (chantier A5). Vide, le calcul
		// a la surface s'applique — c'est-a-dire le calcul d'aujourd'hui.
		'grilleLettres'     => array(),
		'limits'            => array(
			'minLetterHeightBlockCm'  => 8,
			'minLetterHeightScriptCm' => 10,
			'maxWidthCm'              => 250,
			'maxTubeM'                => 25,
			'maxLines'                => 3,
			'maxCharsPerLine'         => 40,
			// Limite du TRANSPORTEUR, pas une constante : au-delà, la pièce part
			// en plusieurs panneaux. Défaut relevé chez Custom Neon (docs/38 §4).
			// Profondeur minimale d'un caisson (cm) — 3 et non 6 : la gamme
			// BrightLine couvre 30 mm avec un entraxe resserré (docs/43 §21).
			'boxMinDepthCm'           => 3,
			'maxPanelWidthCm'         => 234,
			// Convention d'atelier (docs/39 §2.2) : au-delà, le fil qui saute d'un
			// mot au suivant doit être gainé et fixé.
			'maxJumperCm'             => 15,
		),
		// LE TUBE DU CATALOGUE — miroir de TubeSpec (electrical.ts). N'entre
		// dans AUCUN calcul de prix : ces valeurs décrivent l'objet, pas son
		// tarif. Elles pilotent la cote affichée, le refus de fabricabilité et
		// le plan de câblage.
		'tube'              => array(
			'diameterMm'     => 10,
			'bendRadiusMm'   => 30,
			'voltage'        => 12,
			'maxBranchM'     => 5,
			'psuLoadFactor'  => 0.8,
			'minStrokeRatio' => 0.5,
			// Le câble livré entre le tube et le bloc. RÉGLAGES DU MARCHAND :
			// ce qui est livré dépend de ce qui est acheté, et la section n'est
			// sourcée par aucune fiche du fonds.
			// PAS DE COUPE (mm) et sens de cintrage — miroir de TubeSpec.
			// Réglages du marchand : le pas dépend de la bobine achetée. Relevé
			// dans le fonds de 25 mm (Flexfire 12 V) à 102 mm (Magiclite), 50 mm
			// étant le plus répandu — CIP « Cut Length: 50 mm ».
			'cutPitchMm'     => 50,
			'bendDirection'  => 'lateral',
			'cableLengthM'   => 2,
			'cableSectionMm2' => 0.5,
			'maxDropRatio'   => 0.03,
		),
	);

	/**
	 * Résistivité du cuivre recuit à 20 °C (Ω·mm²/m) — miroir de RHO_CUIVRE.
	 *
	 * Constante de MATÉRIAU, pas de composant acheté : 1/58, conductivité de
	 * référence du cuivre recuit. Le cuivre chauffe (+0,4 %/°C) et un câble du
	 * commerce a une section réelle inférieure à sa section nominale : le
	 * calcul est donc OPTIMISTE, la chute réelle est un peu plus forte.
	 */
	const RHO_CUIVRE = 0.0172;

	/**
	 * Calibres d'alimentation — miroir de PSU_RATINGS_W.
	 *
	 * ÉCHELLE PAR DÉFAUT, PAS UNE VÉRITÉ : un calibre est un composant acheté,
	 * donc pas une constante du code. Les douze blocs documentés dans
	 * ressources/alimentations/ sortent à 36, 60, 75,6, 81,6, 100,8, 102, 150 et
	 * 151,2 W — cinq de ces huit valeurs manquent ici.
	 */
	const PSU_RATINGS_W = array( 12, 20, 25, 30, 36, 40, 50, 60, 75, 100, 120, 150, 200, 240, 300, 350, 400 );

	/** Clés de coefficients que le marchand peut surcharger (SCALAIRES uniquement
	 *  — la fusion superficielle doit rester identique côté widget JS). */
	const OVERRIDABLE = array(
		'baseCents'         => 'int',
		'tubePerMeterCents' => 'int',
		'dimmerRemoteCents' => 'int',
		'nightTimerCents'   => 'int',
		'warrantyIndoorMonths'  => 'int',
		'warrantyOutdoorMonths' => 'int',
		'parcelMaxLengthCm'     => 'int',
		'parcelMaxWidthCm'      => 'int',
		'rgbFlatCents'      => 'int',
		'outdoorMultiplier' => 'float',
		'expressMultiplier' => 'float',
		'leadTimeMinDays'        => 'int',
		'leadTimeMaxDays'        => 'int',
		'leadTimeExpressMinDays' => 'int',
		'leadTimeExpressMaxDays' => 'int',
		'marketingRounding' => 'bool',
	);

	/**
	 * Manifestes de métriques des polices (générés par le pipeline de build).
	 *
	 * @var array<string,array>
	 */
	private $manifests;

	/**
	 * Coefficients EFFECTIFS : défauts + surcharges marchand (option WP
	 * `ahns_settings`). Hors WordPress (contrôle de parité en CLI), défauts purs.
	 *
	 * @var array
	 */
	private $coeff;

	/**
	 * @param array $overrides Surcharges explicites (contrôle de parité,
	 *                         simulateur). Par défaut : l'option `ahns_settings`.
	 */
	/**
	 * Matières, découpes et finitions — miroir de packages/core/src/panels.ts.
	 *
	 * Le prix d'une plaque n'est pas proportionnel à son épaisseur : une part
	 * fixe au m² (manutention, chutes, façonnage) et une part qui suit
	 * l'épaisseur. Un modèle proportionnel sous-facture les plaques fines.
	 */
	const PANEL_DEFAULTS = array(
		'materials' => array(
			'pvc'       => array( 'label' => 'Expanded PVC', 'thicknessesMm' => array( 3, 5, 10, 19 ), 'perM2PerMmCents' => 420, 'baseM2Cents' => 1800, 'outdoorReady' => true ),
			'dibond'    => array( 'label' => 'Dibond (aluminium composite)', 'thicknessesMm' => array( 2, 3, 4 ), 'perM2PerMmCents' => 1400, 'baseM2Cents' => 3200, 'outdoorReady' => true ),
			'aluminium' => array( 'label' => 'Aluminium', 'thicknessesMm' => array( 1, 2, 3 ), 'perM2PerMmCents' => 2600, 'baseM2Cents' => 4500, 'outdoorReady' => true ),
			'plexi'     => array( 'label' => 'Plexiglas', 'thicknessesMm' => array( 3, 5, 8, 10 ), 'perM2PerMmCents' => 1900, 'baseM2Cents' => 3800, 'outdoorReady' => true ),
			'bois'      => array( 'label' => 'Wood (poplar)', 'thicknessesMm' => array( 5, 10, 18 ), 'perM2PerMmCents' => 550, 'baseM2Cents' => 2200, 'outdoorReady' => false ),
		),
		'cutPerMeterCents'  => array( 'rect' => 350, 'rounded' => 700, 'shape' => 1600 ),
		'finishPerM2Cents'  => array( 'raw' => 0, 'printed' => 4200, 'printed-lam' => 6800, 'letters' => 14500, 'engraved' => 9500 ),
		'fixingCents'       => 1200,
		'diffuserPerM2Cents' => 8800,
		'boxBuildCents'     => 6500,
		// 0 = suivre la courbe de profondeur (watts_par_m2_selon_profondeur).
		// Ce champ valait 90 W/m², plat, quelle que soit la profondeur : juste
		// pour un caisson de 30 mm, deux à trois fois trop haut au-delà.
		'wattsPerM2'        => 0,
		'ledPerM2Cents'     => 7400,
	);

	public function __construct( array $overrides = array() ) {
		// Le fichier du plugin ; hors de WordPress (contrôle de parité), le dossier parent de ce fichier.
		$json            = file_get_contents( ( function_exists( 'plugin_dir_path' ) ? plugin_dir_path( __DIR__ ) : dirname( __DIR__ ) . '/' ) . 'assets/font-metrics.json' );
		$this->manifests = is_string( $json ) ? (array) json_decode( $json, true ) : array();
		// Les polices TÉLÉVERSÉES par le marchand doivent être tarifables comme
		// celles du pack : leurs métriques rejoignent le manifeste. (Absent hors
		// WordPress — le contrôle de parité n'utilise que le pack.)
		if ( class_exists( 'AHNS_Fonts' ) && function_exists( 'get_option' ) ) {
			$this->manifests = array_merge( $this->manifests, AHNS_Fonts::custom_manifests() );
		}
		$this->coeff     = self::COEFF;
		// Les coefficients des panneaux vivent à part pour rester lisibles ;
		// ils rejoignent le jeu principal, comme en TypeScript.
		// Les tarifs du marchand priment sur les valeurs livrées. Hors
		// WordPress (contrôle de parité), on garde les défauts.
		$this->coeff['panels'] = class_exists( 'AHNS_Materials' ) && function_exists( 'get_option' )
			? AHNS_Materials::for_pricing()
			: self::PANEL_DEFAULTS;
		if ( ! empty( $overrides ) ) {
			$this->coeff = array_merge( $this->coeff, self::sanitize_overrides( $overrides ) );
		} elseif ( function_exists( 'get_option' ) ) {
			$this->coeff = array_merge( $this->coeff, self::sanitize_overrides( (array) get_option( 'ahns_settings', array() ) ) );
		}
	}

	/**
	 * LE TARIFICATEUR D'UN PRODUIT.
	 *
	 * Celui de la boutique, sauf si ce produit a son propre barème — auquel
	 * cas il s'applique EN ENTIER, sans rien hériter. Un barème à moitié
	 * hérité est impossible à vérifier le jour où un prix paraît faux.
	 *
	 * @param int $product_id Produit.
	 * @return AHNS_Pricing
	 */
	public static function pour_produit( $product_id ) {
		if ( class_exists( 'AHNS_Bareme_Produit' ) ) {
			$propre = AHNS_Bareme_Produit::pour( $product_id );
			if ( $propre ) {
				return new self( $propre );
			}
		}
		return new self();
	}

	/**
	 * Filtre des surcharges : clés autorisées + typage strict.
	 *
	 * @param array $raw Option brute.
	 * @return array
	 */
	public static function sanitize_overrides( array $raw ) {
		$out = array();
		// Paliers de taille : structure validée à part (les autres surcharges
		// sont scalaires — voir OVERRIDABLE).
		if ( isset( $raw['sizeTiers'] ) && is_array( $raw['sizeTiers'] ) ) {
			$tiers = array();
			foreach ( $raw['sizeTiers'] as $tier ) {
				if ( ! is_array( $tier ) ) {
					continue;
				}
				$width = (float) ( $tier['maxWidthCm'] ?? 0 );
				$cents = (int) ( $tier['cents'] ?? 0 );
				$mode  = ( 'floor' === ( $tier['mode'] ?? '' ) ) ? 'floor' : 'surcharge';
				if ( $width <= 0 || $width > 1000 || $cents < 0 || $cents > 1000000 ) {
					continue;
				}
				$tiers[] = array( 'maxWidthCm' => $width, 'mode' => $mode, 'cents' => $cents );
			}
			$out['sizeTiers'] = $tiers;
		}
		// Catalogue de tubes (écart E02) : structure validée à part elle aussi.
		// Un hex mal formé ou un prix aberrant vaut « champ absent », jamais
		// zéro — un tube à zéro centime, ce serait un néon offert.
		if ( isset( $raw['tubes'] ) && is_array( $raw['tubes'] ) ) {
			$tubes = array();
			foreach ( $raw['tubes'] as $t ) {
				if ( ! is_array( $t ) || empty( $t['sku'] ) || empty( $t['litHex'] ) ) {
					continue;
				}
				$hex = static function ( $v ) {
					$v = trim( (string) $v );
					return preg_match( '/^#?[0-9a-fA-F]{6}$/', $v ) ? $v : '';
				};
				$lit = $hex( $t['litHex'] );
				if ( '' === $lit ) {
					continue;
				}
				$entree = array(
					'sku'    => substr( (string) $t['sku'], 0, 64 ),
					'litHex' => $lit,
				);
				if ( ! empty( $t['label'] ) ) {
					$entree['label'] = substr( (string) $t['label'], 0, 80 );
				}
				$off = isset( $t['offHex'] ) ? $hex( $t['offHex'] ) : '';
				if ( '' !== $off ) {
					$entree['offHex'] = $off;
				}
				if ( isset( $t['tubePerMeterCents'] ) ) {
					$c = (int) $t['tubePerMeterCents'];
					if ( $c > 0 && $c <= 10_000_00 ) {
						$entree['tubePerMeterCents'] = $c;
					}
				}
				foreach ( array( 'wattsPerMeter', 'lumensPerMeter', 'cct' ) as $num ) {
					if ( isset( $t[ $num ] ) && (float) $t[ $num ] > 0 ) {
						$entree[ $num ] = (float) $t[ $num ];
					}
				}
				foreach ( array( 'profile', 'ip' ) as $txt ) {
					if ( ! empty( $t[ $txt ] ) ) {
						$entree[ $txt ] = substr( (string) $t[ $txt ], 0, 32 );
					}
				}
				if ( isset( $t['voltage'] ) && in_array( (int) $t['voltage'], array( 12, 24 ), true ) ) {
					$entree['voltage'] = (int) $t['voltage'];
				}
				if ( isset( $t['uvResistant'] ) ) {
					$entree['uvResistant'] = (bool) $t['uvResistant'];
				}
				// Ce que la bobine sait faire. Une valeur inconnue vaut « absent »,
				// donc « on ne sait pas » — et non « solid », qui ferait REFUSER
				// une commande RGB par excès de zèle.
				if ( isset( $t['mode'] ) && in_array( (string) $t['mode'], array( 'solid', 'rgb', 'spi' ), true ) ) {
					$entree['mode'] = (string) $t['mode'];
				}
				if ( isset( $t['controllerCents'] ) ) {
					$ctrl = (int) $t['controllerCents'];
					if ( $ctrl > 0 && $ctrl <= 10_000_00 ) {
						$entree['controllerCents'] = $ctrl;
					}
				}
				$tubes[] = $entree;
			}
			$out['tubes'] = $tubes;
		}

		// Catalogue d'ALIMENTATIONS (chantier A1). Meme discipline que les tubes :
		// un champ douteux vaut « absent », jamais zero — un bloc a zero centime
		// serait une alimentation offerte, et un bloc a zero watt tiendrait tout.
		if ( isset( $raw['psus'] ) && is_array( $raw['psus'] ) ) {
			$psus = array();
			foreach ( $raw['psus'] as $a ) {
				if ( ! is_array( $a ) || empty( $a['sku'] ) ) {
					continue;
				}
				$w = isset( $a['wattsNominal'] ) ? (float) $a['wattsNominal'] : 0;
				$v = isset( $a['voltage'] ) ? (int) $a['voltage'] : 0;
				// La puissance et la tension ne sont PAS facultatives : sans elles on
				// ne peut ni choisir le bloc ni verifier qu'il va sur ce tube. Une
				// entree incomplete est ignoree plutot que completee au jugé.
				if ( $w <= 0 || ( 12 !== $v && 24 !== $v ) ) {
					continue;
				}
				$entree = array(
					'sku'          => substr( (string) $a['sku'], 0, 64 ),
					'wattsNominal' => $w,
					'voltage'      => $v,
				);
				if ( ! empty( $a['label'] ) ) {
					$entree['label'] = substr( (string) $a['label'], 0, 80 );
				}
				if ( ! empty( $a['ip'] ) && preg_match( '/^IP\d\d$/i', trim( (string) $a['ip'] ) ) ) {
					$entree['ip'] = strtoupper( trim( (string) $a['ip'] ) );
				}
				if ( isset( $a['priceCents'] ) ) {
					$c = (int) $a['priceCents'];
					if ( $c > 0 && $c <= 10_000_00 ) {
						$entree['priceCents'] = $c;
					}
				}
				if ( isset( $a['dimmable'] ) ) {
					$entree['dimmable'] = (bool) $a['dimmable'];
				}
				$psus[] = $entree;
			}
			$out['psus'] = $psus;
		}

		// Catalogue de PROGRAMMATEURS (chantier A2).
		if ( isset( $raw['timers'] ) && is_array( $raw['timers'] ) ) {
			$timers = array();
			foreach ( $raw['timers'] as $t ) {
				if ( ! is_array( $t ) || empty( $t['sku'] ) ) {
					continue;
				}
				$entree = array( 'sku' => substr( (string) $t['sku'], 0, 64 ) );
				if ( ! empty( $t['label'] ) ) {
					$entree['label'] = substr( (string) $t['label'], 0, 80 );
				}
				if ( isset( $t['priceCents'] ) ) {
					$c = (int) $t['priceCents'];
					if ( $c > 0 && $c <= 10_000_00 ) {
						$entree['priceCents'] = $c;
					}
				}
				if ( isset( $t['voltage'] ) && in_array( (int) $t['voltage'], array( 12, 24, 230 ), true ) ) {
					$entree['voltage'] = (int) $t['voltage'];
				}
				if ( isset( $t['astronomique'] ) ) {
					$entree['astronomique'] = (bool) $t['astronomique'];
				}
				$timers[] = $entree;
			}
			$out['timers'] = $timers;
		}

		// TRANSPORTEUR (chantier A4) — une seule fiche, pas un catalogue : un
		// atelier expedie chez un transporteur a la fois.
		if ( isset( $raw['transporteur'] ) && is_array( $raw['transporteur'] ) ) {
			$tr = $raw['transporteur'];
			$lo = isset( $tr['maxLongueurCm'] ) ? (float) $tr['maxLongueurCm'] : 0;
			$la = isset( $tr['maxLargeurCm'] ) ? (float) $tr['maxLargeurCm'] : 0;
			// Les deux limites sont obligatoires : une seule ne borne rien, et
			// zero laisserait passer une piece de dix metres.
			if ( $lo > 0 && $la > 0 ) {
				$fiche = array( 'maxLongueurCm' => $lo, 'maxLargeurCm' => $la );
				if ( ! empty( $tr['nom'] ) ) {
					$fiche['nom'] = substr( (string) $tr['nom'], 0, 80 );
				}
				if ( isset( $tr['maxPoidsKg'] ) && (float) $tr['maxPoidsKg'] > 0 ) {
					$fiche['maxPoidsKg'] = (float) $tr['maxPoidsKg'];
				}
				$out['transporteur'] = $fiche;
			}
		}

		// GRILLE PAR LETTRE (chantier A5). Un palier sans hauteur ou sans prix ne
		// borne rien : il est ignore plutot que complete au jugé.
		if ( isset( $raw['grilleLettres'] ) && is_array( $raw['grilleLettres'] ) ) {
			$grille = array();
			foreach ( $raw['grilleLettres'] as $g ) {
				if ( ! is_array( $g ) ) {
					continue;
				}
				$h = isset( $g['maxHauteurCm'] ) ? (float) $g['maxHauteurCm'] : 0;
				$c = isset( $g['cents'] ) ? (int) $g['cents'] : -1;
				if ( $h <= 0 || $c < 0 || $c > 100_000_00 ) {
					continue;
				}
				$palier = array( 'maxHauteurCm' => $h, 'cents' => $c );
				if ( isset( $g['construction'] ) && in_array( $g['construction'], array( 'channel', 'solid', 'flat' ), true ) ) {
					$palier['construction'] = $g['construction'];
				}
				$grille[] = $palier;
			}
			$out['grilleLettres'] = $grille;
		}
		foreach ( self::OVERRIDABLE as $key => $type ) {
			if ( ! array_key_exists( $key, $raw ) ) {
				continue;
			}
			if ( 'int' === $type ) {
				$v = (int) $raw[ $key ];
				if ( $v >= 0 && $v <= 10_000_00 ) {
					$out[ $key ] = $v;
				}
			} elseif ( 'float' === $type ) {
				$v = (float) $raw[ $key ];
				if ( $v >= 1.0 && $v <= 5.0 ) {
					$out[ $key ] = $v;
				}
			} else {
				$out[ $key ] = (bool) $raw[ $key ];
			}
		}
		return $out;
	}

	/**
	 * Surcharges effectives ≠ défauts — injectées dans le contexte du widget
	 * pour qu'il AFFICHE ce que le serveur FACTURE.
	 *
	 * @return array
	 */
	public function overrides_for_widget() {
		$diff = array();
		foreach ( self::OVERRIDABLE as $key => $type ) {
			if ( $this->coeff[ $key ] !== self::COEFF[ $key ] ) {
				$diff[ $key ] = $this->coeff[ $key ];
			}
		}
		// Matières : transmises TOUJOURS. Si le navigateur calculait avec les
		// tarifs livrés pendant que le serveur facture ceux du marchand, le
		// client verrait un prix et paierait l'autre.
		$diff['panels'] = $this->coeff['panels'];

		// Paliers de taille : transmis dès qu'il y en a (le widget doit AFFICHER
		// ce que le serveur FACTURERA).
		if ( ! empty( $this->coeff['sizeTiers'] ) ) {
			$diff['sizeTiers'] = array_values( (array) $this->coeff['sizeTiers'] );
		}

		// Catalogue de tubes : transmis dès qu'il y en a, et pour la MÊME raison
		// que les matières. Il porte le prix au mètre, la puissance et l'aspect
		// éteint : sans lui, le navigateur afficherait un prix, une alimentation
		// et une couleur de silicone que le serveur ne confirmerait pas.
		if ( ! empty( $this->coeff['tubes'] ) ) {
			$diff['tubes'] = array_values( (array) $this->coeff['tubes'] );
		}
		return $diff;
	}

	/**
	 * Identifiants de polices disponibles.
	 *
	 * @return string[]
	 */
	public function font_ids() {
		return array_keys( $this->manifests );
	}

	/**
	 * LES CLÉS DE CHAQUE TABLE DE PRIX — le domaine des valeurs qu'une
	 * configuration peut employer comme index.
	 *
	 * La barrière d'entrée (AHNS_Cart::sanitize_config) refuse toute valeur
	 * absente de ces listes : un index inconnu ne doit jamais retomber sur un
	 * coefficient manquant, c'est-à-dire sur une ligne de prix à zéro.
	 *
	 * @return array<string,string[]>
	 */
	public function cles_tarifees() {
		$pc = isset( $this->coeff['panels'] ) && is_array( $this->coeff['panels'] ) ? $this->coeff['panels'] : self::PANEL_DEFAULTS;
		return array(
			'fonts'            => array_map( 'strval', $this->font_ids() ),
			'support_finishes' => array_map( 'strval', array_keys( (array) $this->coeff['supportPerM2Cents'] ) ),
			'mountings'        => array_map( 'strval', array_keys( (array) $this->coeff['mountingCents'] ) ),
			'materials'        => array_map( 'strval', array_keys( (array) $pc['materials'] ) ),
			'panel_cuts'       => array_map( 'strval', array_keys( (array) $pc['cutPerMeterCents'] ) ),
			'panel_finishes'   => array_map( 'strval', array_keys( (array) $pc['finishPerM2Cents'] ) ),
		);
	}

	/** Arrondi à 2 décimales — miroir de round2 (metrics.ts). */
	private static function round2( $x ) {
		return round( $x * 100 ) / 100;
	}

	/**
	 * Mesures (m de tube, L×H cm) — miroir de measureConfiguration (metrics.ts).
	 *
	 * @param array $config Configuration validée.
	 * @return array{tubeLengthM:float,widthCm:float,heightCm:float}
	 */
	public function measure( array $config ) {
		// Panneaux et caissons : les DEUX dimensions sont saisies. Aucun tube à
		// mesurer — zéro est la vérité, pas une valeur manquante (miroir JS).
		$kind = $config['kind'] ?? 'text';
		if ( ( 'panel' === $kind || 'box-sign' === $kind ) && ! empty( $config['sizeCm'] ) ) {
			return array(
				'tubeLengthM' => 0.0,
				'widthCm'     => self::round2( (float) $config['sizeCm']['widthCm'] ),
				'heightCm'    => self::round2( (float) $config['sizeCm']['heightCm'] ),
			);
		}
		// Logo SEUL : mesures portées par la configuration (mesure client, bornée
		// par validate() ; l'admin marque la commande « à vérifier ») — miroir JS.
		//
		// Avec du TEXTE à côté, on ne sort pas ici : la composition se mesure
		// après la boucle des lignes, comme dans metrics.ts.
		$logo         = ( 'logo-svg' === $kind && ! empty( $config['logo'] ) ) ? $config['logo'] : null;
		$lignes_ecrites = array();
		foreach ( ( $config['lines'] ?? array() ) as $l ) {
			if ( '' !== trim( (string) ( $l['text'] ?? '' ) ) ) {
				$lignes_ecrites[] = $l;
			}
		}
		if ( $logo && 0 === count( $lignes_ecrites ) ) {
			return array(
				'tubeLengthM' => (float) $logo['tubeLengthMm'] / 1000,
				'widthCm'     => (float) $logo['widthCm'],
				'heightCm'    => (float) $logo['heightCm'],
			);
		}
		$h      = (float) $config['letterHeightCm'];
		$tube_m      = 0.0;
		$line_tube_m = array();
		$word_tube_m = array();
		$width  = 0.0;
		foreach ( $config['lines'] as $line ) {
			$manifest = isset( $this->manifests[ $line['fontId'] ] ) ? $this->manifests[ $line['fontId'] ] : null;
			if ( ! $manifest ) {
				continue; // refusé par validate() en amont.
			}
			$scale         = $h / (float) $manifest['capHeight'];
			$tube_units    = 0.0;
			$advance_units = 0.0;
			// mb_str_split gère l'UTF-8 (accents) comme le for…of JS.
			foreach ( mb_str_split( (string) $line['text'] ) as $ch ) {
				if ( isset( $manifest['glyphs'][ $ch ] ) ) {
					// La ligne médiane fait foi ; `pathLen` n'est là que pour les
					// manifestes antérieurs (miroir exact de metrics.ts).
					$tube_units    += (float) ( $manifest['glyphs'][ $ch ]['medianLen'] ?? $manifest['glyphs'][ $ch ]['pathLen'] );
					$advance_units += (float) $manifest['glyphs'][ $ch ]['advance'];
				} elseif ( preg_match( '/^\s$/u', $ch ) ) {
					$advance_units += (float) $manifest['unitsPerEm'] * 0.3;
				}
			}
			$ligne_m      = ( $tube_units * $scale ) / 100;
			$tube_m      += $ligne_m;
			$line_tube_m[] = $ligne_m;
			$width        = max( $width, $advance_units * $scale );
			// LE TUBE MOT PAR MOT — miroir de `motsDeLigne` + `measureLine`.
			// Une espace n'a pas de tube : la somme des mots vaut la ligne.
			$par_mot = array();
			foreach ( self::mots_de_ligne( (string) $line['text'] ) as $mot ) {
				$u = 0.0;
				foreach ( mb_str_split( $mot ) as $ch ) {
					if ( isset( $manifest['glyphs'][ $ch ] ) ) {
						$u += (float) ( $manifest['glyphs'][ $ch ]['medianLen'] ?? $manifest['glyphs'][ $ch ]['pathLen'] );
					}
				}
				$par_mot[] = ( $u * $scale ) / 100;
			}
			$word_tube_m[] = $par_mot;
		}
		// TEXTE + LOGO — miroir exact de metrics.ts : le tube s'ajoute, la
		// largeur est la plus grande des deux, la hauteur les empile avec le
		// même interligne que deux lignes de texte. Le placement manuel n'entre
		// dans aucune des trois : déplacer une pièce ne change ni le tube ni la
		// matière.
		if ( $logo ) {
			$n_texte       = count( $lignes_ecrites );
			$hauteur_texte = $n_texte * $h + ( $n_texte - 1 ) * $h * 0.35;
			return array(
				'tubeLengthM' => self::round2( $tube_m + (float) $logo['tubeLengthMm'] / 1000 ),
				'widthCm'     => self::round2( max( $width, (float) $logo['widthCm'] ) ),
				'heightCm'    => self::round2( $hauteur_texte + $h * 0.35 + (float) $logo['heightCm'] ),
				'lineTubeM'   => $line_tube_m,
				'wordTubeM'   => $word_tube_m,
			);
		}
		$n      = max( 1, count( $config['lines'] ) );
		$height = $n * $h + ( $n - 1 ) * $h * 0.35;
		return array(
			'tubeLengthM' => self::round2( $tube_m ),
			'widthCm'     => self::round2( $width ),
			'heightCm'    => self::round2( $height ),
			// Détail par ligne — miroir de lineTubeM. Non arrondi, contrairement
			// au total : la somme peut en différer d'un centième, et c'est le
			// total qui fait foi.
			'lineTubeM'   => $line_tube_m,
			'wordTubeM'   => $word_tube_m,
		);
	}

	/**
	 * Les MOTS d'une ligne — miroir exact de `motsDeLigne` (metrics.ts).
	 *
	 * Deux découpages du même texte finiraient par ne plus rendre le même
	 * nombre de mots, et le tableau des couleurs ne tomberait plus en face du
	 * bon mot — donc la mauvaise bobine, au mauvais prix.
	 */
	private static function mots_de_ligne( $text ) {
		$t = trim( (string) $text );
		return '' === $t ? array() : preg_split( '/\s+/u', $t );
	}

	/** Nombre court : 12.5 → « 12,5 », 13.0 → « 13 ». */
	private static function num_courte( $v ) {
		$s = number_format( (float) $v, 1, ',', '' );
		return rtrim( rtrim( $s, '0' ), ',' );
	}

	/**
	 * FABRICABILITÉ d'un texte — miroir de fabricationMetrics (metrics.ts).
	 *
	 * Rend la hauteur de lettre minimale sous laquelle le tube est plus large
	 * que le trait le plus fin du texte, et le nombre d'ANGLES du dessin (donc
	 * de coupes, d'embouts et de soudures) pour la fiche d'atelier.
	 *
	 * @param array $config Configuration.
	 * @return array{minLetterHeightCm:float,narrowestChar:string,corners:int}
	 */
	public function fabrication_metrics( array $config ) {
		$tube    = self::COEFF['tube'];
		$diam_cm = $tube['diameterMm'] / 10;
		$ratio   = $tube['minStrokeRatio'];
		$hmin    = 0.0;
		$car     = '';
		// LE DIAMETRE DU TUBE COUPABLE, en mm — miroir de FabricationMetrics
		// (ecart E28). A defaut, celui de la boutique.
		$diam_mm = $tube['diameterMm'];
		$coins   = 0;
		$mesure  = false;
		$tubes   = isset( $this->coeff['tubes'] ) && is_array( $this->coeff['tubes'] ) ? $this->coeff['tubes'] : array();
		foreach ( (array) ( $config['lines'] ?? array() ) as $line ) {
			/*
			 * CHAQUE LIGNE AVEC SON PROPRE TUBE (ecart E28).
			 *
			 * Le catalogue declare desormais un diametre par reference. Sans
			 * ce resolveur, le navigateur acceptait un Ø 8 et le SERVEUR le
			 * refusait au motif du Ø 10 de la boutique : la pire divergence
			 * possible, un design qui passe l'apercu et tombe au panier.
			 */
			$d_ligne = self::diametre_de_la_ligne( (array) $line, $tubes );
			$manifest = isset( $this->manifests[ $line['fontId'] ] ) ? $this->manifests[ $line['fontId'] ] : null;
			if ( ! $manifest || empty( $manifest['capHeight'] ) ) {
				continue;
			}
			foreach ( mb_str_split( (string) ( $line['text'] ?? '' ) ) as $ch ) {
				if ( ! isset( $manifest['glyphs'][ $ch ] ) ) {
					continue;
				}
				$g = $manifest['glyphs'][ $ch ];
				if ( ! empty( $g['corners'] ) ) {
					$coins += (int) $g['corners'];
				}
				if ( empty( $g['strokeW'] ) || (float) $g['strokeW'] <= 0 ) {
					continue;
				}
				$mesure = true;
				$h      = ( $ratio * ( $d_ligne / 10 ) * (float) $manifest['capHeight'] ) / (float) $g['strokeW'];
				if ( $h > $hmin ) {
					$hmin    = $h;
					$car     = $ch;
					// Le diametre CITE est celui du tube coupable : citer celui
					// de la boutique enverrait changer la mauvaise chose.
					$diam_mm = $d_ligne;
				}
			}
		}
		return array(
			'minLetterHeightCm' => $mesure ? ceil( $hmin * 10 ) / 10 : 0.0,
			'narrowestChar'     => $car,
			'tubeDiameterMm'    => $diam_mm,
			'corners'           => $coins,
		);
	}

	/**
	 * La référence de tube d'une ligne, ou null — miroir de ligneVersTube.
	 *
	 * Deux chemins, dans cet ordre : le tubeSku de la ligne s'il existe au
	 * catalogue, sinon la référence dont le hex allumé correspond à colorHex.
	 * Le second sert aux configurations enregistrées avant l'arrivée du
	 * catalogue, qui ne portent qu'une couleur.
	 *
	 * @param array $line  Ligne de configuration.
	 * @param array $tubes Catalogue du marchand.
	 * @return array|null
	 */
	/**
	 * LE DIAMETRE DU TUBE D'UNE LIGNE, en millimetres — miroir de
	 * `diametreTubeMm` (ecart E28).
	 *
	 * La bobine choisie d'abord, la valeur de boutique ensuite. Sans ce
	 * resolveur, le serveur refusait au Ø 10 de la boutique un design que le
	 * navigateur avait accepte au Ø 8 de la bobine — un panier qui tombe sur
	 * une piece parfaitement fabricable.
	 *
	 * @param array $line  Ligne de configuration.
	 * @param array $tubes Catalogue du marchand.
	 * @return float
	 */
	private static function diametre_de_la_ligne( array $line, array $tubes ) {
		$t = self::tube_de_la_ligne( $line, $tubes );
		if ( is_array( $t ) && isset( $t['diameterMm'] ) && (float) $t['diameterMm'] > 0 ) {
			return (float) $t['diameterMm'];
		}
		return (float) self::COEFF['tube']['diameterMm'];
	}

	private static function tube_de_la_ligne( array $line, array $tubes ) {
		if ( empty( $tubes ) ) {
			return null;
		}
		$sku = isset( $line['tubeSku'] ) ? (string) $line['tubeSku'] : '';
		if ( '' !== $sku ) {
			foreach ( $tubes as $t ) {
				if ( isset( $t['sku'] ) && $t['sku'] === $sku ) {
					return $t;
				}
			}
		}
		$hex = isset( $line['colorHex'] ) ? (string) $line['colorHex'] : '';
		if ( '' === $hex ) {
			return null;
		}
		// Casse et dièse tolérés : ces valeurs viennent tantôt d'un champ de
		// couleur de navigateur, tantôt d'un back-office saisi à la main.
		$cible = strtolower( ltrim( trim( $hex ), '#' ) );
		foreach ( $tubes as $t ) {
			if ( isset( $t['litHex'] ) && strtolower( ltrim( trim( (string) $t['litHex'] ), '#' ) ) === $cible ) {
				return $t;
			}
		}
		return null;
	}

	/**
	 * La puissance appelée par un design (W), bobine par bobine — miroir de
	 * wattsDemandes.
	 *
	 * Même bascule franche que pour le prix du tube : tant qu'aucune référence
	 * ne déclare sa puissance linéique, on rend tubeLengthM × wattsPerMeter, la
	 * longueur TOTALE arrondie, comme avant. Dès qu'une seule la déclare, on
	 * somme ligne par ligne.
	 *
	 * @param array $config Configuration.
	 * @param array $m      Mesures, dont lineTubeM.
	 * @return float
	 */
	public function watts_demandes_public( array $config, array $m ) {
		return $this->watts_demandes( $config, $m );
	}

	private function watts_demandes( array $config, array $m ) {
		$total = (float) ( $m['tubeLengthM'] ?? 0 );
		$tubes = isset( $this->coeff['tubes'] ) && is_array( $this->coeff['tubes'] ) ? $this->coeff['tubes'] : array();
		$lignes = isset( $config['lines'] ) && is_array( $config['lines'] ) ? $config['lines'] : array();
		$detail = isset( $m['lineTubeM'] ) && is_array( $m['lineTubeM'] ) ? $m['lineTubeM'] : array();
		// LA PUISSANCE SUIT LE MOT — miroir de `wattsDemandes` (coefficients.ts).
		//
		// Deux bobines n'appellent pas les mêmes watts au mètre. Compter toute
		// la ligne au tarif de la première sous-dimensionnerait l'alimentation,
		// ou la surdimensionnerait — ce qui se paie aussi.
		$mots = isset( $m['wordTubeM'] ) && is_array( $m['wordTubeM'] ) ? $m['wordTubeM'] : array();
		$par_mot = false;
		if ( ! empty( $tubes ) && count( $mots ) === count( $lignes ) && count( $lignes ) > 0 ) {
			foreach ( $lignes as $i => $line ) {
				foreach ( (array) ( $line['wordColors'] ?? array() ) as $j => $mot ) {
					if ( empty( $mot['colorHex'] ) && empty( $mot['tubeSku'] ) ) { continue; }
					$t = self::tube_de_la_ligne( (array) $mot, $tubes );
					if ( $t && isset( $t['wattsPerMeter'] ) && isset( $mots[ $i ][ $j ] ) ) {
						$par_mot = true;
						break 2;
					}
				}
			}
		}
		if ( $par_mot ) {
			$w = 0.0;
			foreach ( $lignes as $i => $line ) {
				$tl = self::tube_de_la_ligne( (array) $line, $tubes );
				$par_defaut = ( $tl && isset( $tl['wattsPerMeter'] ) ) ? (float) $tl['wattsPerMeter'] : (float) $this->coeff['wattsPerMeter'];
				foreach ( (array) ( $mots[ $i ] ?? array() ) as $j => $longueur ) {
					$mot = ( $line['wordColors'] ?? array() )[ $j ] ?? null;
					$wpm = $par_defaut;
					if ( $mot && ( ! empty( $mot['colorHex'] ) || ! empty( $mot['tubeSku'] ) ) ) {
						$tm = self::tube_de_la_ligne( (array) $mot, $tubes );
						if ( $tm && isset( $tm['wattsPerMeter'] ) ) { $wpm = (float) $tm['wattsPerMeter']; }
					}
					$w += (float) $longueur * $wpm;
				}
			}
			return $w;
		}
		$par_ligne = false;
		if ( ! empty( $tubes ) && count( $detail ) === count( $lignes ) && count( $lignes ) > 0 ) {
			foreach ( $lignes as $line ) {
				$t = self::tube_de_la_ligne( (array) $line, $tubes );
				if ( $t && isset( $t['wattsPerMeter'] ) ) {
					$par_ligne = true;
					break;
				}
			}
		}
		if ( ! $par_ligne ) {
			return $total * (float) $this->coeff['wattsPerMeter'];
		}
		$w = 0.0;
		foreach ( $lignes as $i => $line ) {
			$t         = self::tube_de_la_ligne( (array) $line, $tubes );
			$par_metre = ( $t && isset( $t['wattsPerMeter'] ) ) ? (float) $t['wattsPerMeter'] : (float) $this->coeff['wattsPerMeter'];
			$w        += ( isset( $detail[ $i ] ) ? (float) $detail[ $i ] : 0.0 ) * $par_metre;
		}
		return $w;
	}

	/**
	 * Puissance d'éclairage d'un caisson (W/m² de face) selon sa profondeur —
	 * miroir de wattsPerM2ForDepth.
	 *
	 * Un caisson s'éclaire par RANGÉES, et l'espacement des rangées dépend de la
	 * profondeur. La fiche SloanLED BrightLine 2 tabule 30/40/50/60 mm →
	 * 75/100/125/150 mm d'entraxe, et la bande fait 6,26 W par mètre. Au-delà de
	 * 12,2 cm on passe au SignBOX II : rangées à 305 mm, 8,86 W/m de rangée.
	 * Détail et contre-épreuve : docs/43 §20.
	 *
	 * @param float $profondeur_cm Profondeur hors-tout (cm).
	 * @return float
	 */
	public static function watts_par_m2_selon_profondeur( $profondeur_cm ) {
		$mm = max( 0.0, (float) $profondeur_cm ) * 10;
		if ( $mm <= 0 ) {
			return 0.0;
		}
		$entraxe  = ( $mm >= 122 ) ? 305.0 : min( 150.0, 2.5 * $mm );
		$lineique = ( $mm >= 122 ) ? 8.86 : 6.26;
		return round( $lineique / ( $entraxe / 1000 ), 1 );
	}

	/** La surcharge marchand si elle existe, la courbe sinon. */
	public static function watts_par_m2_effectif( $profondeur_cm, array $pc ) {
		return ( isset( $pc['wattsPerM2'] ) && $pc['wattsPerM2'] > 0 )
			? (float) $pc['wattsPerM2']
			: self::watts_par_m2_selon_profondeur( $profondeur_cm );
	}

	/**
	 * Longueur de tube réellement consommée (m) — miroir de longueurCoupeeM.
	 *
	 * Chaque BRIN se coupe au repère suivant : la perte est proportionnelle au
	 * nombre de brins, pas à la longueur. Visible sur un texte à trente lettres,
	 * négligeable sur un mot d'un seul tenant.
	 *
	 * @param float $longueur_m Longueur utile (m).
	 * @param int   $brins      Nombre de brins séparés.
	 * @return float
	 */
	public static function longueur_coupee_m( $longueur_m, $brins = 1 ) {
		$pas = (float) self::COEFF['tube']['cutPitchMm'];
		$n   = max( 1, (int) round( $brins ) );
		$l   = max( 0.0, (float) $longueur_m );
		if ( $l <= 0 || $pas <= 0 ) {
			return 0.0;
		}
		$par_brin_mm = ( $l * 1000 ) / $n;
		return round( ( $n * ceil( $par_brin_mm / $pas ) * $pas ) / 1000, 3 );
	}

	/** Calibre d'alimentation au-dessus d'une puissance — miroir de psuRatingFor. */
	public static function psu_rating_for( $watts ) {
		foreach ( self::PSU_RATINGS_W as $r ) {
			if ( $watts <= $r ) {
				return $r;
			}
		}
		return (int) ( ceil( $watts / 100 ) * 100 );
	}

	/**
	 * PLAN ÉLECTRIQUE — miroir de electricalPlan (electrical.ts).
	 *
	 * Deux chiffres que l'atelier n'avait pas : le CALIBRE d'alimentation à
	 * commander (la puissance appelée n'est pas celle du transformateur — une
	 * enseigne est une charge continue, on ne la fait pas tourner à 100 %), et
	 * le NOMBRE DE BRANCHES (le tube ne s'alimente pas par un seul bout au-delà
	 * de 5 m en 12 V : la tension chute).
	 *
	 * Ne touche à AUCUN prix : le tarif de l'alimentation reste piloté par les
	 * paliers `powerTiers`, calibrés sur le marché.
	 *
	 * @param float $tube_m Longueur de tube (m).
	 * @return array<string,mixed>
	 */
	public function plan_electrique( $tube_m, $demande_w = null ) {
		$tube    = self::COEFF['tube'];
		// Puissance appelée : celle calculée bobine par bobine si l'appelant l'a
		// faite, sinon le calcul d'origine. Miroir du paramètre demandeW.
		$demande = ( null !== $demande_w && $demande_w >= 0 )
			? (float) $demande_w
			: (float) $tube_m * $this->coeff['wattsPerMeter'];
		$facteur = ( $tube['psuLoadFactor'] > 0 && $tube['psuLoadFactor'] <= 1 ) ? $tube['psuLoadFactor'] : 0.8;
		$psu     = $demande > 0 ? self::psu_rating_for( $demande / $facteur ) : 0;
		$branche = $tube['maxBranchM'] > 0 ? $tube['maxBranchM'] : 5;

		$longueur = $tube['cableLengthM'];
		$section  = $tube['cableSectionMm2'];
		$cible    = $tube['maxDropRatio'];
		$courant  = $tube['voltage'] > 0 ? $demande / $tube['voltage'] : 0.0;
		$chute    = ( $section > 0 && $longueur > 0 )
			? ( 2 * self::RHO_CUIVRE * $longueur * $courant ) / $section
			: 0.0;
		$ratio    = $tube['voltage'] > 0 ? $chute / $tube['voltage'] : 0.0;
		// À chute admissible fixée, la section requise est inversement
		// proportionnelle : on y remonte directement, sans itérer.
		$section_requise = ( $ratio > $cible && $cible > 0 )
			? ( 2 * self::RHO_CUIVRE * $longueur * $courant ) / ( $cible * $tube['voltage'] )
			: $section;

		return array(
			'demandW'    => round( $demande, 1 ),
			'psuW'       => $psu,
			'branches'   => $tube_m > 0 ? max( 1, (int) ceil( $tube_m / $branche ) ) : 0,
			'voltage'    => $tube['voltage'],
			'maxBranchM' => $branche,
			'loadFactor' => $psu > 0 ? round( $demande / $psu, 2 ) : 0,
			'diameterMm' => $tube['diameterMm'],
			// CHUTE DE TENSION DANS LE CÂBLE LIVRÉ (écart E08) — miroir exact
			// de electrical.ts. ΔU = 2 · ρ · L · I / S ; le 2 est l'aller-retour,
			// et l'oublier divise le résultat par deux.
			'cableDropV' => round( $chute, 3 ),
			'cableDropRatio' => round( $ratio, 4 ),
			'cableSectionNeededMm2' => round( $section_requise, 2 ),
		);
	}

	/**
	 * Validation serveur — miroir de validate.ts (règles bloquantes uniquement).
	 *
	 * @param array $config Configuration.
	 * @param array $m      Mesures.
	 * @return string[] Messages d'erreur (vide = OK).
	 */
	public function validate( array $config, array $m ) {
		$errors = array();
		$limits = self::COEFF['limits'];
		$kind   = (string) ( $config['kind'] ?? 'text' );

		// PANNEAUX ET CAISSONS — miroir de validate.ts, et surtout branche
		// SÉPARÉE : une plaque n'a pas de texte, donc les règles de texte ne
		// s'y appliquent pas. Sans ce retour anticipé, `lines` vide tombait
		// dans la branche texte et toute commande de panneau était refusée au
		// panier par « Saisissez un texte pour votre néon ».
		if ( 'panel' === $kind || 'box-sign' === $kind ) {
			$taille = isset( $config['sizeCm'] ) && is_array( $config['sizeCm'] ) ? $config['sizeCm'] : null;
			$w      = $taille ? (float) ( $taille['widthCm'] ?? 0 ) : 0.0;
			$h      = $taille ? (float) ( $taille['heightCm'] ?? 0 ) : 0.0;
			if ( ! $taille || $w <= 0 || $h <= 0 ) {
				$errors[] = __( 'Enter the width and the height.', 'ahime-neon-sign-configurator' );
			} else {
				$max = $limits['maxWidthCm'];
				if ( $w > $max || $h > $max ) {
					$errors[] = sprintf( /* translators: %d: maximum dimension in centimetres. */ __( 'Maximum dimension %d cm: beyond that, the panel no longer fits standard shipping.', 'ahime-neon-sign-configurator' ), $max );
				}
				if ( $w < 10 || $h < 10 ) {
					$errors[] = __( 'Minimum dimensions: 10 × 10 cm.', 'ahime-neon-sign-configurator' );
				}
			}
			// Une matière qui ne tient pas dehors ne doit pas partir dehors.
			$mat  = 'panel' === $kind
				? ( $config['panel']['material'] ?? '' )
				: ( $config['boxSign']['material'] ?? '' );
			$spec = ( '' !== $mat && isset( $this->coeff['panels']['materials'][ $mat ] ) )
				? $this->coeff['panels']['materials'][ $mat ]
				: null;
			if ( 'outdoor' === ( $config['environment'] ?? 'indoor' ) && $spec && empty( $spec['outdoorReady'] ) ) {
				$errors[] = sprintf( /* translators: %s: material name. */ __( '%s is not suitable outdoors without treatment.', 'ahime-neon-sign-configurator' ), (string) $spec['label'] );
			}
			// Profondeur minimale : 3 cm et non 6 — miroir de validate.ts. Le
			// motif d'origine vaut pour des modules à entraxe large, pas pour la
			// gamme BrightLine, faite pour les caissons peu profonds (docs/43 §21).
			$mini = ( isset( $limits['boxMinDepthCm'] ) && $limits['boxMinDepthCm'] > 0 ) ? (float) $limits['boxMinDepthCm'] : 3.0;
			if ( 'box-sign' === $kind && isset( $config['boxSign']['depthCm'] ) && (float) $config['boxSign']['depthCm'] < $mini ) {
				$errors[] = sprintf( /* translators: %s: minimum depth in centimetres. */ __( 'Minimum light box depth: %s cm. Below that, no module spreads light wide enough to light the face without visible hot spots.', 'ahime-neon-sign-configurator' ), rtrim( rtrim( number_format( $mini, 1, ',', '' ), '0' ), ',' ) );
			}
			return array_values( array_unique( $errors ) );
		}

		// LES RÈGLES DU TEXTE S'APPLIQUENT DÈS QU'IL Y A DU TEXTE (miroir JS).
		//
		// Elles étaient réservées au kind « text ». Depuis qu'un logo peut se
		// composer AVEC des lignes, ce retour anticipé laissait passer sans un
		// mot une hauteur de lettre de 2 cm ou une police trop fine pour le
		// tube — au seul motif qu'un logo accompagnait le texte.
		$avec_texte = false;
		foreach ( (array) ( $config['lines'] ?? array() ) as $l ) {
			if ( '' !== trim( (string) ( $l['text'] ?? '' ) ) ) {
				$avec_texte = true;
			}
		}
		if ( 'logo-svg' === $kind ) {
			if ( empty( $config['logo'] ) || (float) $config['logo']['tubeLengthMm'] <= 0 ) {
				$errors[] = __( 'Logo without a tube measurement.', 'ahime-neon-sign-configurator' );
			}
			// Logo SEUL : ses deux bornes, et on s'arrête. Avec du texte, on
			// continue — les mêmes bornes sont reprises plus bas.
			if ( ! $avec_texte ) {
				if ( $m['widthCm'] > $limits['maxWidthCm'] ) {
					$errors[] = sprintf( /* translators: %d: maximum width in centimetres. */ __( 'Maximum width: %d cm.', 'ahime-neon-sign-configurator' ), $limits['maxWidthCm'] );
				}
				if ( $m['tubeLengthM'] > $limits['maxTubeM'] ) {
					$errors[] = sprintf( /* translators: %d: maximum tube length in metres. */ __( 'Maximum tube length: %d m.', 'ahime-neon-sign-configurator' ), $limits['maxTubeM'] );
				}
				return array_values( array_unique( $errors ) );
			}
		}

		// UNE BOBINE UNICOLORE NE FERA JAMAIS DU RGB — miroir de validate.ts.
		//
		// Le mode couleur et la référence de tube sont deux réglages séparés :
		// rien n'empêchait de commander « RGB » sur du silicone rose. À l'écran
		// c'est joli ; à l'atelier, personne ne peut le fabriquer. Refus, donc,
		// et pas avertissement.
		if ( 'rgb' === ( $config['colorMode'] ?? 'solid' ) ) {
			$cat = isset( $this->coeff['tubes'] ) && is_array( $this->coeff['tubes'] ) ? $this->coeff['tubes'] : array();
			$noms = array();
			foreach ( (array) $config['lines'] as $line ) {
				$t = self::tube_de_la_ligne( (array) $line, $cat );
				if ( $t && isset( $t['mode'] ) && 'solid' === $t['mode'] ) {
					$noms[] = isset( $t['label'] ) ? $t['label'] : $t['sku'];
				}
			}
			if ( ! empty( $noms ) ) {
				$errors[] = sprintf(
					/* translators: %s: tube names. */ __( '%s: this tube only exists in one colour. Choose an RGB tube, or go back to a fixed colour.', 'ahime-neon-sign-configurator' ),
					implode( ', ', array_unique( $noms ) )
				);
			}
		}

		$all_empty = true;
		foreach ( $config['lines'] as $line ) {
			if ( '' !== trim( (string) $line['text'] ) ) {
				$all_empty = false;
			}
			if ( mb_strlen( (string) $line['text'] ) > $limits['maxCharsPerLine'] ) {
				$errors[] = sprintf( /* translators: %d: maximum number of characters. */ __( '%d characters maximum per line.', 'ahime-neon-sign-configurator' ), $limits['maxCharsPerLine'] );
			}
			$manifest = isset( $this->manifests[ $line['fontId'] ] ) ? $this->manifests[ $line['fontId'] ] : null;
			if ( ! $manifest ) {
				$errors[] = __( 'Unknown font.', 'ahime-neon-sign-configurator' );
				continue;
			}
			$min = 'script' === $manifest['class'] ? $limits['minLetterHeightScriptCm'] : $limits['minLetterHeightBlockCm'];
			if ( (float) $config['letterHeightCm'] < $min ) {
				$errors[] = sprintf( /* translators: %d: minimum letter height in centimetres. */ __( 'Minimum letter height: %d cm for this font.', 'ahime-neon-sign-configurator' ), $min );
			}
			foreach ( mb_str_split( (string) $line['text'] ) as $ch ) {
				if ( ! isset( $manifest['glyphs'][ $ch ] ) && ! preg_match( '/^\s$/u', $ch ) ) {
					$errors[] = sprintf( /* translators: %s: the character. */ __( 'Character not available in this font: %s', 'ahime-neon-sign-configurator' ), $ch );
					break;
				}
			}
		}
		// LE TUBE TIENT-IL DANS LA LETTRE ? — miroir de validate.ts.
		// Le forfait 8 / 10 cm ci-dessus est un proxy par CLASSE de police ; le
		// vrai critère est l'ÉPAISSEUR DU TRAIT, mesurée glyphe par glyphe au
		// build. Cette règle ne mord que là où le forfait est trop permissif.
		$fab = $this->fabrication_metrics( $config );
		if ( $fab['minLetterHeightCm'] > 0 && (float) $config['letterHeightCm'] < $fab['minLetterHeightCm'] ) {
			$errors[] = sprintf(
				/* translators: 1: tube diameter in millimetres, 2: the narrowest letter, 3: minimum letter height in centimetres. */ __( 'At this size, the tube (Ø %1$s mm) is wider than the stroke of the letter “%2$s”: the counters would close up. Minimum letter height for this font: %3$s cm.', 'ahime-neon-sign-configurator' ),
				self::num_courte( $fab['tubeDiameterMm'] ),
				$fab['narrowestChar'],
				self::num_courte( $fab['minLetterHeightCm'] )
			);
		}
		if ( $all_empty ) {
			$errors[] = __( 'Type a text for your neon sign.', 'ahime-neon-sign-configurator' );
		}
		if ( count( $config['lines'] ) > $limits['maxLines'] ) {
			$errors[] = sprintf( /* translators: %d: maximum number of lines. */ __( '%d lines maximum.', 'ahime-neon-sign-configurator' ), $limits['maxLines'] );
		}
		if ( $m['widthCm'] > $limits['maxWidthCm'] ) {
			$errors[] = sprintf( /* translators: %d: maximum width in centimetres. */ __( 'Maximum width: %d cm.', 'ahime-neon-sign-configurator' ), $limits['maxWidthCm'] );
		}
		if ( $m['tubeLengthM'] > $limits['maxTubeM'] ) {
			$errors[] = sprintf( /* translators: %d: maximum tube length in metres. */ __( 'Maximum tube length: %d m.', 'ahime-neon-sign-configurator' ), $limits['maxTubeM'] );
		}
		return array_values( array_unique( $errors ) );
	}

	/** Surface du support (m²) — miroir de supportAreaM2 (pricing.ts). */
	private static function support_area_m2( $type, $w_cm, $h_cm ) {
		$m       = self::COEFF['supportMarginCm'];
		$rect_m2 = ( ( $w_cm + 2 * $m ) * ( $h_cm + 2 * $m ) ) / 10000;
		switch ( $type ) {
			case 'rectangle':
			case 'stand':
				return $rect_m2;
			case 'contour':
				return $rect_m2 * 0.75 * 1.15;
			case 'cut-to-letter':
				return $rect_m2 * 0.45 * 1.25;
			default:
				return 0.0; // box / none.
		}
	}

	/** Faces d'un caisson (m²) — miroir de boxFacesM2. */
	private static function box_faces_m2( $w_cm, $h_cm, $d_cm ) {
		$w = $w_cm / 100;
		$h = $h_cm / 100;
		$d = $d_cm / 100;
		return 2 * ( $w * $h ) + 2 * ( $w + $h ) * $d;
	}

	/** Palier d'alimentation — miroir de powerCents. */
	/** Surface d'un panneau (m²). */
	private static function panel_area_m2( $w_cm, $h_cm ) {
		return ( $w_cm * $h_cm ) / 10000;
	}

	/**
	 * Longueur à découper (mètres linéaires).
	 *
	 * Une forme libre ne se découpe pas au périmètre du rectangle : le tracé
	 * serpente. Majoration de 40 %, comme pour le contour d'un fond de néon.
	 */
	private static function panel_cut_length_m( $w_cm, $h_cm, $cut ) {
		$perimetre = ( 2 * ( $w_cm + $h_cm ) ) / 100;
		return 'shape' === $cut ? $perimetre * 1.4 : $perimetre;
	}

	/** Surface de matière d'un caisson : fond + chant (m²). */
	private static function box_body_m2( $w_cm, $h_cm, $d_cm, $faces ) {
		$w = $w_cm / 100;
		$h = $h_cm / 100;
		$d = $d_cm / 100;
		return $w * $h + 2 * ( $w + $h ) * $d - ( 2 === (int) $faces ? $w * $h : 0 );
	}

	/** Surface lumineuse d'un caisson (m²). */
	private static function box_lit_m2( $w_cm, $h_cm, $faces ) {
		return ( (int) $faces * $w_cm * $h_cm ) / 10000;
	}

	/** Tarif d'une plaque au m², matière et épaisseur comprises (centimes). */
	private function material_m2_cents( $material, $thickness_mm ) {
		$mats = $this->coeff['panels']['materials'];
		if ( ! isset( $mats[ $material ] ) ) {
			return 0;
		}
		$spec = $mats[ $material ];
		$e    = (float) $thickness_mm;
		if ( ! in_array( $e, array_map( 'floatval', $spec['thicknessesMm'] ), true ) ) {
			// Épaisseur inexistante ramenée à la plus proche fabricable : on ne
			// facture pas une plaque qu'on ne sait pas produire.
			$best = null;
			foreach ( $spec['thicknessesMm'] as $t ) {
				if ( null === $best || abs( $t - $e ) < abs( $best - $e ) ) {
					$best = (float) $t;
				}
			}
			$e = $best;
		}
		return $spec['baseM2Cents'] + $e * $spec['perM2PerMmCents'];
	}

	/**
	 * Palier d'alimentation pour une puissance donnée.
	 *
	 * Les paliers sont ici des paires [watts, centimes] — forme historique du
	 * portage PHP. La table est la même qu'en TypeScript ; seule l'écriture
	 * diffère, et c'est le contrôle de parité qui le garantit.
	 */
	private static function watts_cents( $watts ) {
		foreach ( self::COEFF['powerTiers'] as $tier ) {
			if ( $watts <= $tier[0] ) {
				return $tier[1];
			}
		}
		return self::COEFF['powerMaxCents'];
	}

	/**
	 * Prix de l'alimentation, d'après la puissance APPELÉE.
	 *
	 * Prend des watts et non des mètres depuis le 2 septembre 2026 : le
	 * catalogue de tubes peut déclarer une puissance linéique par bobine
	 * (docs/43 §16), et le calibre décide du tarif. Miroir de powerCents.
	 *
	 * @param float $watts Puissance appelée.
	 * @return int
	 */
	private function power_cents( $watts, $besoin = array() ) {
		// LE BLOC DECLARE D'ABORD (chantier A1) — miroir de powerCents.
		//
		// Un catalogue vide, une reference qui ne convient pas, une reference
		// sans prix : les trois retombent sur les paliers. Aucune ne doit
		// EMPECHER de chiffrer — refuser un prix parce qu'un marchand n'a pas
		// fini son catalogue casserait sa boutique au lieu de l'aider.
		$psus = isset( $this->coeff['psus'] ) && is_array( $this->coeff['psus'] ) ? $this->coeff['psus'] : array();
		if ( ! empty( $psus ) ) {
			// Deratage applique ICI et une seule fois : une enseigne allumee
			// toute la journee est une charge continue, et un bloc a 100 % ne
			// tient pas. Miroir exact du facteur TypeScript.
			$facteur = 0.8;
			$choix   = self::choisir_alimentation( $watts / $facteur, $psus, $besoin );
			if ( null !== $choix && isset( $choix['priceCents'] ) ) {
				return (int) $choix['priceCents'];
			}
		}
		foreach ( self::COEFF['powerTiers'] as $tier ) {
			if ( $watts <= $tier[0] ) {
				return $tier[1];
			}
		}
		return self::COEFF['powerMaxCents'];
	}

	/**
	 * Un indice de protection tient-il dehors ? IP65 au minimum.
	 *
	 * Le second chiffre est celui de l'eau ; c'est lui qui decide dehors.
	 * Miroir de tenableDehors.
	 *
	 * @param string|null $ip Indice annonce par la fiche.
	 * @return bool
	 */
	private static function tenable_dehors( $ip ) {
		if ( empty( $ip ) || ! preg_match( '/^IP(\d)(\d)$/i', trim( (string) $ip ), $m ) ) {
			return false;
		}
		return (int) $m[2] >= 5;
	}

	/**
	 * La plus petite alimentation qui tient la charge — miroir de
	 * choisirAlimentation.
	 *
	 * L'ordre des rejets va du plus structurel au plus accessoire : un bloc a
	 * la mauvaise tension est une erreur d'achat, un bloc trop petit se
	 * remplace par le modele du dessus.
	 *
	 * @param float $watts_requis Puissance NOMINALE necessaire, deratee.
	 * @param array $catalogue    Blocs declares.
	 * @param array $besoin       voltage, exterieur, variateur.
	 * @return array|null
	 */
	private static function choisir_alimentation( $watts_requis, $catalogue, $besoin ) {
		$voltage   = isset( $besoin['voltage'] ) ? (int) $besoin['voltage'] : 0;
		$exterieur = ! empty( $besoin['exterieur'] );
		$variateur = ! empty( $besoin['variateur'] );
		$retenues  = array();
		foreach ( $catalogue as $p ) {
			if ( (int) $p['voltage'] !== $voltage ) {
				continue;
			}
			if ( $exterieur && ! self::tenable_dehors( isset( $p['ip'] ) ? $p['ip'] : null ) ) {
				continue;
			}
			// Un `dimmable` ABSENT ne l'ecarte pas : ne rien dire n'est pas
			// dire non. Ecarter les blocs muets viderait le catalogue d'un
			// marchand qui a seulement nomme ses references.
			if ( $variateur && isset( $p['dimmable'] ) && false === $p['dimmable'] ) {
				continue;
			}
			if ( (float) $p['wattsNominal'] < $watts_requis ) {
				continue;
			}
			$retenues[] = $p;
		}
		if ( empty( $retenues ) ) {
			return null;
		}
		usort(
			$retenues,
			static function ( $a, $b ) {
				return (float) $a['wattsNominal'] <=> (float) $b['wattsNominal'];
			}
		);
		return $retenues[0];
	}

	/** Arrondi marketing — miroir de marketingRoundCents. */
	public static function marketing_round_cents( $total_cents ) {
		$euros = (int) ceil( $total_cents / 100 );
		$last  = $euros % 10;
		$euros = 9 === $last ? $euros : $euros + ( ( 9 - $last + 10 ) % 10 );
		return $euros * 100;
	}

	/**
	 * Prix — miroir EXACT de computePrice (pricing.ts). Centimes.
	 *
	 * @param array $config Configuration.
	 * @param array $m      Mesures (measure()).
	 * @return array{totalCents:int,displayTotalCents:int,lines:array<int,array{key:string,label:string,amountCents:int}>}
	 */
	public function price( array $config, array $m ) {
		$c          = $this->coeff;
		$lines      = array();
		$tube_m     = (float) $m['tubeLengthM'];
		$is_rgb     = 'rgb' === $config['colorMode'];
		$is_outdoor = 'outdoor' === $config['environment'];
		$support    = $is_outdoor ? 'box' : $config['support']['type'];

		$lines[] = array( 'key' => 'base', 'label' => __( 'Setup fee', 'ahime-neon-sign-configurator' ), 'amountCents' => $c['baseCents'] );

		// --- PANNEAU ---------------------------------------------------
		// Une plaque se vend au m², pas au mètre de tube.
		if ( 'panel' === $config['kind'] && ! empty( $config['panel'] ) ) {
			$p     = $config['panel'];
			$pc    = $this->coeff['panels'];
			$aire  = self::panel_area_m2( (float) $m['widthCm'], (float) $m['heightCm'] );
			$faces = ! empty( $p['doubleSided'] ) ? 2 : 1;
			$label = isset( $pc['materials'][ $p['material'] ] ) ? $pc['materials'][ $p['material'] ]['label'] : $p['material'];

			$lines[] = array(
				'key'         => 'material',
				'label'       => sprintf( /* translators: 1: material name, 2: thickness in millimetres, 3: area in square metres. */ __( '%1$s %2$s mm · %3$s m²', 'ahime-neon-sign-configurator' ), $label, $p['thicknessMm'], number_format( $aire, 2, '.', '' ) ),
				'amountCents' => (int) round( $aire * $this->material_m2_cents( $p['material'], $p['thicknessMm'] ) ),
			);
			$ml      = self::panel_cut_length_m( (float) $m['widthCm'], (float) $m['heightCm'], $p['cut'] );
			$lines[] = array(
				'key'         => 'cut',
				'label'       => sprintf( /* translators: %s: cutting length in metres. */ __( 'Cutting %s linear m', 'ahime-neon-sign-configurator' ), number_format( $ml, 2, '.', '' ) ),
				'amountCents' => (int) round( $ml * $pc['cutPerMeterCents'][ $p['cut'] ] ),
			);
			if ( 'raw' !== $p['finish'] ) {
				$lines[] = array(
					'key'         => 'finish',
					'label'       => sprintf( /* translators: 1: finish name, 2: " (double-sided)" or nothing. */ __( 'Finish %1$s%2$s', 'ahime-neon-sign-configurator' ), $p['finish'], $faces > 1 ? __( ' (double-sided)', 'ahime-neon-sign-configurator' ) : '' ),
					'amountCents' => (int) round( $aire * $faces * $pc['finishPerM2Cents'][ $p['finish'] ] ),
				);
			}
			$lines[] = array( 'key' => 'fixing', 'label' => __( 'Drilling and fixings', 'ahime-neon-sign-configurator' ), 'amountCents' => $pc['fixingCents'] );
			if ( 'letters' === $p['finish'] && ! empty( $p['channelLetters'] ) ) {
				$letters = $p['channelLetters'];
				// LA GRILLE DU MARCHAND D'ABORD, LA SURFACE ENSUITE (chantier A5).
				// Miroir de chiffrerLettres : `null` — ici un palier introuvable
				// — dit de retomber sur la surface, jamais de facturer zero.
				$grille  = isset( $this->coeff['grilleLettres'] ) && is_array( $this->coeff['grilleLettres'] ) ? $this->coeff['grilleLettres'] : array();
				$palier  = null;
				$nb      = 0;
				$hauteur = isset( $config['letterHeightCm'] ) ? (float) $config['letterHeightCm'] : 0;
				if ( ! empty( $grille ) ) {
					foreach ( (array) ( $config['lines'] ?? array() ) as $l ) {
						$txt = isset( $l['text'] ) ? (string) $l['text'] : '';
						// Les espaces ne sont pas des lettres : personne ne plie
						// un retour de tole pour un espace.
						$nb += (int) preg_match_all( '/\S/u', $txt );
					}
					$construction = ( isset( $letters['lighting'] ) && 'none' === $letters['lighting'] ) ? 'solid' : 'channel';
					$applicables  = array();
					foreach ( $grille as $g ) {
						$cible = isset( $g['construction'] ) ? $g['construction'] : null;
						if ( null !== $cible && $cible !== $construction ) {
							continue;
						}
						$applicables[] = $g;
					}
					usort(
						$applicables,
						static function ( $a, $b ) {
							return (float) $a['maxHauteurCm'] <=> (float) $b['maxHauteurCm'];
						}
					);
					foreach ( $applicables as $g ) {
						if ( $hauteur <= (float) $g['maxHauteurCm'] ) {
							$palier = (int) $g['cents'];
							break;
						}
					}
				}
				if ( null !== $palier && $nb > 0 ) {
					$lines[] = array(
						'key'         => 'letters',
						'label'       => sprintf( /* translators: 1: material, 2: number of letters, 3: letter height in centimetres. */ __( '3D letters %1$s · %2$d letter(s) of %3$s cm', 'ahime-neon-sign-configurator' ), $letters['material'], $nb, $hauteur ),
						'amountCents' => $palier * $nb,
					);
				} else {
					$material_rate = 'metal' === $letters['material'] ? 24000 : ( 'wood' === $letters['material'] ? 13000 : 18000 );
					$lines[] = array( 'key' => 'letters', 'label' => sprintf( /* translators: 1: material, 2: depth in millimetres. */ __( '3D letters %1$s · %2$s mm', 'ahime-neon-sign-configurator' ), $letters['material'], $letters['depthMm'] ), 'amountCents' => (int) round( $aire * $material_rate + (float) $letters['depthMm'] * 85 ) );
				}
				if ( 'none' !== $letters['lighting'] ) {
					$lines[] = array( 'key' => 'led', 'label' => __( 'Lighting', 'ahime-neon-sign-configurator' ) . ' ' . $letters['lighting'], 'amountCents' => (int) round( $aire * ( 'front-back' === $letters['lighting'] ? 14000 : 9000 ) ) );
				}
				foreach ( (array) ( $letters['backboardLayers'] ?? array() ) as $index => $layer ) {
					$layer_area = $aire * ( 1 + (float) $layer['extensionCm'] / 10 );
					$layer_rate = 'metal' === $layer['material'] ? 15000 : ( 'wood' === $layer['material'] ? 8000 : 11000 );
					$lines[] = array( 'key' => 'material', 'label' => sprintf( /* translators: 1: layer number, 2: material, 3: thickness in millimetres. */ __( 'Backing layer %1$d · %2$s %3$s mm', 'ahime-neon-sign-configurator' ), $index + 1, $layer['material'], $layer['thicknessMm'] ), 'amountCents' => (int) round( $layer_area * $layer_rate ) );
				}
			}
			return $this->finaliser( $lines, $config, $m );
		}

		// --- CAISSON LUMINEUX ------------------------------------------
		// Sa puissance se déduit d'une SURFACE à éclairer, pas d'une longueur.
		if ( 'box-sign' === $config['kind'] && ! empty( $config['boxSign'] ) ) {
			$b        = $config['boxSign'];
			$pc       = $this->coeff['panels'];
			$corps    = self::box_body_m2( (float) $m['widthCm'], (float) $m['heightCm'], (float) $b['depthCm'], (int) $b['faces'] );
			$lumineuse = self::box_lit_m2( (float) $m['widthCm'], (float) $m['heightCm'], (int) $b['faces'] );
			$label    = isset( $pc['materials'][ $b['material'] ] ) ? $pc['materials'][ $b['material'] ]['label'] : $b['material'];

			$lines[] = array(
				'key'         => 'body',
				'label'       => sprintf( /* translators: 1: material name, 2: area in square metres. */ __( 'Body %1$s · %2$s m²', 'ahime-neon-sign-configurator' ), $label, number_format( $corps, 2, '.', '' ) ),
				'amountCents' => (int) round( $corps * $this->material_m2_cents( $b['material'], 3 ) ),
			);
			$lines[] = array(
				'key'         => 'diffuser',
				'label'       => sprintf( /* translators: 1: plural mark ("s") or nothing, 3: area in square metres. Placeholder 2 is a second plural mark for languages that need it. */ __( 'Diffusing face%1$s · %3$s m²', 'ahime-neon-sign-configurator' ), (int) $b['faces'] > 1 ? 's' : '', (int) $b['faces'] > 1 ? 's' : '', number_format( $lumineuse, 2, '.', '' ) ),
				'amountCents' => (int) round( $lumineuse * $pc['diffuserPerM2Cents'] ),
			);
			if ( ! empty( $b['printedFace'] ) ) {
				$lines[] = array(
					'key'         => 'finish',
					'label'       => __( 'Face printing', 'ahime-neon-sign-configurator' ),
					'amountCents' => (int) round( $lumineuse * $pc['finishPerM2Cents']['printed-lam'] ),
				);
			}
			$lines[] = array( 'key' => 'led', 'label' => __( 'Internal lighting', 'ahime-neon-sign-configurator' ), 'amountCents' => (int) round( $lumineuse * $pc['ledPerM2Cents'] ) );
			// La puissance d'éclairage dépend de la PROFONDEUR, pas de la seule
			// surface (docs/43 §20). Le coefficient marchand la remplace quand
			// il est donné.
			$watts   = $lumineuse * self::watts_par_m2_effectif( (float) $b['depthCm'], $pc );
			$lines[] = array(
				'key'         => 'power',
				'label'       => sprintf( /* translators: %d: power in watts. */ __( 'Power supply %d W', 'ahime-neon-sign-configurator' ), (int) round( $watts ) ),
				'amountCents' => self::watts_cents( $watts ),
			);
			$lines[] = array( 'key' => 'build', 'label' => __( 'Box assembly', 'ahime-neon-sign-configurator' ), 'amountCents' => $pc['boxBuildCents'] );
			$lines[] = array( 'key' => 'fixing', 'label' => __( 'Drilling and fixings', 'ahime-neon-sign-configurator' ), 'amountCents' => $pc['fixingCents'] );
			return $this->finaliser( $lines, $config, $m );
		}

		$complexity = ( 'logo-svg' === $config['kind'] || 'panel' === $config['kind'] )
			? $c['complexity']['logo']
			: ( count( $config['lines'] ) > 1 ? $c['complexity']['multiLine'] : $c['complexity']['singleLine'] );
		$tube_rate  = $c['tubePerMeterCents'] * ( $is_rgb ? $c['rgbTubeMultiplier'] : 1 );

		// LE PRIX PAR RÉFÉRENCE DE TUBE (écart E02) — miroir de pricing.ts.
		//
		// Tant qu'AUCUNE référence ne porte son propre tubePerMeterCents, on
		// reprend exactement le calcul d'avant, même arrondi, même total. Le
		// détail par ligne n'entre en jeu que dans le cas contraire, parce que
		// son arrondi diffère : le total est arrondi une fois, les lignes non.
		$tubes      = isset( $c['tubes'] ) && is_array( $c['tubes'] ) ? $c['tubes'] : array();
		$par_ligne  = false;
		$detail     = isset( $m['lineTubeM'] ) && is_array( $m['lineTubeM'] ) ? $m['lineTubeM'] : array();
		if ( ! empty( $tubes ) && count( $detail ) === count( $config['lines'] ) && count( $detail ) > 0 ) {
			foreach ( $config['lines'] as $line ) {
				$t = self::tube_de_la_ligne( (array) $line, $tubes );
				if ( $t && isset( $t['tubePerMeterCents'] ) ) {
					$par_ligne = true;
					break;
				}
			}
		}
		// ET LE PRIX PAR MOT — miroir de pricing.ts.
		//
		// Un mot d'une autre couleur est une autre bobine, parfois d'un autre
		// tarif au mètre. Facturer la ligne au prix du premier mot ferait payer
		// le blanc au tarif du rouge. Ce chemin ne s'ouvre que si un MOT porte
		// un tarif propre : sans catalogue tarifé, rien ne change au centime.
		$mots_detail = isset( $m['wordTubeM'] ) && is_array( $m['wordTubeM'] ) ? $m['wordTubeM'] : array();
		$par_mot_prix = false;
		if ( ! empty( $tubes ) && count( $mots_detail ) === count( $config['lines'] ) ) {
			foreach ( $config['lines'] as $i => $line ) {
				foreach ( (array) ( $line['wordColors'] ?? array() ) as $j => $mot ) {
					if ( empty( $mot['colorHex'] ) && empty( $mot['tubeSku'] ) ) { continue; }
					$t = self::tube_de_la_ligne( (array) $mot, $tubes );
					if ( $t && isset( $t['tubePerMeterCents'] ) && isset( $mots_detail[ $i ][ $j ] ) ) {
						$par_mot_prix = true;
						break 2;
					}
				}
			}
		}
		if ( $par_mot_prix ) {
			$cumul = 0.0;
			foreach ( $config['lines'] as $i => $line ) {
				$tl        = self::tube_de_la_ligne( (array) $line, $tubes );
				$par_defaut = ( $tl && isset( $tl['tubePerMeterCents'] ) ) ? (float) $tl['tubePerMeterCents'] : (float) $c['tubePerMeterCents'];
				foreach ( (array) ( $mots_detail[ $i ] ?? array() ) as $j => $longueur ) {
					$mot  = ( $line['wordColors'] ?? array() )[ $j ] ?? null;
					$base = $par_defaut;
					if ( $mot && ( ! empty( $mot['colorHex'] ) || ! empty( $mot['tubeSku'] ) ) ) {
						$tm = self::tube_de_la_ligne( (array) $mot, $tubes );
						if ( $tm && isset( $tm['tubePerMeterCents'] ) ) { $base = (float) $tm['tubePerMeterCents']; }
					}
					$cumul += (float) $longueur * $base * ( $is_rgb ? $c['rgbTubeMultiplier'] : 1 ) * $complexity;
				}
			}
			$tube_cents = (int) round( $cumul );
		} elseif ( $par_ligne ) {
			$cumul = 0.0;
			foreach ( $config['lines'] as $i => $line ) {
				$t     = self::tube_de_la_ligne( (array) $line, $tubes );
				$base  = ( $t && isset( $t['tubePerMeterCents'] ) ) ? (float) $t['tubePerMeterCents'] : (float) $c['tubePerMeterCents'];
				$taux  = $base * ( $is_rgb ? $c['rgbTubeMultiplier'] : 1 );
				$cumul += ( isset( $detail[ $i ] ) ? (float) $detail[ $i ] : 0.0 ) * $taux * $complexity;
			}
			$tube_cents = (int) round( $cumul );
		} else {
			$tube_cents = (int) round( $tube_m * $tube_rate * $complexity );
		}

		$lines[] = array(
			'key'         => 'tube',
			'label'       => sprintf( /* translators: %s: length in metres. */ __( 'LED tube %s m', 'ahime-neon-sign-configurator' ), number_format( $tube_m, 2, '.', '' ) ),
			'amountCents' => $tube_cents,
		);

		if ( 'box' === $support ) {
			$depth   = isset( $config['boxDepthCm'] ) ? (float) $config['boxDepthCm'] : $c['boxDepthCm'];
			$faces   = self::box_faces_m2( $m['widthCm'], $m['heightCm'], $depth );
			$lines[] = array(
				'key'         => 'box',
				'label'       => __( 'Box', 'ahime-neon-sign-configurator' ),
				'amountCents' => (int) round( $faces * $c['boxPerM2Cents'] ) + $c['boxAssemblyCents'],
			);
		} elseif ( 'none' !== $support ) {
			$area    = self::support_area_m2( $support, $m['widthCm'], $m['heightCm'] );
			$finish  = $config['support']['finish'];
			$lines[] = array(
				'key'         => 'support',
				'label'       => sprintf( /* translators: 1: backing type, 2: finish. */ __( 'Backing %1$s (%2$s)', 'ahime-neon-sign-configurator' ), $support, $finish ),
				'amountCents' => (int) round( $area * $c['supportPerM2Cents'][ $finish ] ),
			);
			if ( 'stand' === $support ) {
				$lines[] = array( 'key' => 'mounting', 'label' => __( 'Free-standing base', 'ahime-neon-sign-configurator' ), 'amountCents' => $c['mountingCents']['stand'] );
			}
		}

		// La puissance appelée, bobine par bobine quand le catalogue la déclare.
		// Sans catalogue, watts_demandes rend tube_m × wattsPerMeter : le calcul
		// d'avant, au watt près.
		$watts_appeles = $this->watts_demandes( $config, $m );
		// Le besoin que le bloc doit satisfaire — miroir exact du TypeScript :
		// la tension vient du tube, l'etancheite de l'environnement, la
		// variabilite de l'option.
		$tube_coeff = isset( $this->coeff['tube'] ) && is_array( $this->coeff['tube'] ) ? $this->coeff['tube'] : array();
		$besoin_psu = array(
			'voltage'   => isset( $tube_coeff['voltage'] ) ? (int) $tube_coeff['voltage'] : 12,
			'exterieur' => isset( $config['environment'] ) && 'outdoor' === $config['environment'],
			'variateur' => ! empty( $config['options']['dimmerRemote'] ),
		);
		$lines[] = array( 'key' => 'power', 'label' => __( 'Power supply', 'ahime-neon-sign-configurator' ), 'amountCents' => $this->power_cents( $watts_appeles, $besoin_psu ) );

		if ( $is_rgb ) {
			// LE CONTRÔLEUR DE LA BOBINE, quand elle en déclare un (docs/43 §19).
			// On prend le plus cher des contrôleurs déclarés : l'atelier n'en pose
			// qu'un, celui que la bobine la plus exigeante réclame. Aucune n'en
			// déclare : le forfait s'applique, au centime, comme avant.
			$controleur = 0;
			$cat_tubes  = isset( $c['tubes'] ) && is_array( $c['tubes'] ) ? $c['tubes'] : array();
			foreach ( (array) ( $config['lines'] ?? array() ) as $line ) {
				$t = self::tube_de_la_ligne( (array) $line, $cat_tubes );
				if ( $t && isset( $t['controllerCents'] ) && $t['controllerCents'] > $controleur ) {
					$controleur = (int) $t['controllerCents'];
				}
			}
			$lines[] = array( 'key' => 'rgb', 'label' => __( 'RGB colour-changing (controller included)', 'ahime-neon-sign-configurator' ), 'amountCents' => $controleur > 0 ? $controleur : $c['rgbFlatCents'] );
		} elseif ( ! empty( $config['options']['dimmerRemote'] ) ) {
			$lines[] = array( 'key' => 'dimmer', 'label' => __( 'Remote + dimmer', 'ahime-neon-sign-configurator' ), 'amountCents' => $c['dimmerRemoteCents'] );
		}

		// Le programmateur est une ligne A PART, pas une variante du variateur :
		// il coupe l'alimentation a heure fixe, il ne regle pas l'intensite. Le
		// mettre dans la chaine de `elseif` ci-dessus aurait prive de minuterie
		// toute enseigne RGB — celles qu'on vend aux professionnels (miroir de
		// pricing.ts).
		if ( ! empty( $config['options']['nightTimer'] ) ) {
			// Le programmateur DECLARE, ou le defaut non source (chantier A2).
			// Miroir de prixProgrammateur : la premiere reference qui porte un
			// prix decide ; nommer une piece ne la tarife pas.
			$prix_timer = (int) $c['nightTimerCents'];
			$timers     = isset( $this->coeff['timers'] ) && is_array( $this->coeff['timers'] ) ? $this->coeff['timers'] : array();
			foreach ( $timers as $t ) {
				if ( isset( $t['priceCents'] ) ) {
					$prix_timer = (int) $t['priceCents'];
					break;
				}
			}
			$lines[] = array( 'key' => 'night-timer', 'label' => __( 'Night timer', 'ahime-neon-sign-configurator' ), 'amountCents' => $prix_timer );
		}

		$mounting = isset( $config['mounting'] ) ? $config['mounting'] : 'screws';
		if ( 'screws' !== $mounting && 'stand' !== $mounting && 'stand' !== $support ) {
			$cents = isset( $c['mountingCents'][ $mounting ] ) ? $c['mountingCents'][ $mounting ] : 0;
			if ( $cents > 0 ) {
				$lines[] = array( 'key' => 'mounting', 'label' => __( 'Fixings', 'ahime-neon-sign-configurator' ), 'amountCents' => $cents );
			}
		}

		return $this->finaliser( $lines, $config, $m );
	}

	/**
	 * Fin de calcul, commune aux trois familles (miroir de `finaliser` en TS).
	 *
	 * Palier de taille, extérieur, express, arrondi : ces règles ne dépendent
	 * pas de ce qu'on fabrique. Les dupliquer garantirait qu'un jour l'une
	 * d'elles diverge, et le client verrait deux prix pour la même majoration.
	 */
	private function finaliser( array $lines, array $config, array $m ) {
		$c          = $this->coeff;
		$is_outdoor = 'outdoor' === $config['environment'];
		$total = 0;
		foreach ( $lines as $l ) {
			$total += $l['amountCents'];
		}

		// PALIER DE TAILLE — appliqué sur le sous-total, AVANT les
		// multiplicateurs extérieur/express (miroir de pricing.ts).
		$tiers = (array) $c['sizeTiers'];
		usort(
			$tiers,
			static function ( $a, $b ) {
				return $a['maxWidthCm'] <=> $b['maxWidthCm'];
			}
		);
		foreach ( $tiers as $tier ) {
			if ( (float) $m['widthCm'] > (float) $tier['maxWidthCm'] ) {
				continue;
			}
			$extra = 'surcharge' === $tier['mode'] ? (int) $tier['cents'] : max( 0, (int) $tier['cents'] - $total );
			if ( $extra > 0 ) {
				$lines[] = array(
					'key'         => 'sizeTier',
					'label'       => 'surcharge' === $tier['mode'] ? __( 'Size surcharge', 'ahime-neon-sign-configurator' ) : __( 'Minimum price (size)', 'ahime-neon-sign-configurator' ),
					'amountCents' => $extra,
				);
				$total += $extra;
			}
			break; // première tranche couvrante uniquement.
		}

		if ( $is_outdoor ) {
			$extra   = (int) round( $total * ( $c['outdoorMultiplier'] - 1 ) );
			$lines[] = array( 'key' => 'outdoor', 'label' => __( 'Outdoor (drained box, IP67 tube and power supply, UV-proof)', 'ahime-neon-sign-configurator' ), 'amountCents' => $extra );
			$total  += $extra;
		}
		if ( ! empty( $config['options']['express'] ) ) {
			$extra   = (int) round( $total * ( $c['expressMultiplier'] - 1 ) );
			$lines[] = array( 'key' => 'express', 'label' => __( 'Rush production', 'ahime-neon-sign-configurator' ), 'amountCents' => $extra );
			$total  += $extra;
		}

		return array(
			'totalCents'        => $total,
			'displayTotalCents' => ! empty( $c['marketingRounding'] ) ? self::marketing_round_cents( $total ) : $total,
			'lines'             => $lines,
		);
	}
}
