/**
 * Annonces — bandeaux, popups et comptes à rebours du plugin.
 *
 * CE SCRIPT NE CRÉE RIEN : le PHP a déjà posé le balisage. Il anime les
 * compteurs, ferme ce qu'on ferme, retient la fermeture pour la session, et
 * décide du moment d'ouvrir une popup.
 *
 * LE COMPTEUR EST CELUI DU PACK LE DIRECT, repris tel quel : une date de fin
 * RÉELLE lue dans `data-fin`, un `setTimeout` recalé sur la seconde pleine
 * (un `setInterval` de 1000 ms dérive et finit par sauter des secondes
 * visibles), et à zéro l'annonce ENTIÈRE est retirée — un décompte à zéro à
 * côté d'une promesse est pire que rien.
 *
 * SANS SCRIPT, RIEN NE CASSE : le bandeau reste affiché (sans décompte ni
 * croix), la popup ne s'ouvre simplement pas.
 */
(function () {
	'use strict';

	var CLE = 'ahns-annonce-fermee-';

	function fermee(id) {
		try {
			return '1' === sessionStorage.getItem(CLE + id);
		} catch (e) {
			return false;
		}
	}

	function retenir(id) {
		try {
			sessionStorage.setItem(CLE + id, '1');
		} catch (e) { /* navigation privée : la fermeture ne vaut que pour la page. */ }
	}

	function deux(n) {
		return (n < 10 ? '0' : '') + n;
	}

	function compteur(annonce) {
		var bloc = annonce.querySelector('.ahns-compteur[data-fin]');
		if (!bloc) {
			return;
		}
		var fin = Date.parse(bloc.getAttribute('data-fin'));
		if (isNaN(fin)) {
			return; /* date illisible : on laisse le balisage tel quel. */
		}
		var champs = {};
		bloc.querySelectorAll('[data-unite]').forEach(function (e) {
			champs[e.getAttribute('data-unite')] = e;
		});
		function battre() {
			var reste = fin - Date.now();
			if (reste <= 0) {
				annonce.remove();
				return;
			}
			var s = Math.floor(reste / 1000);
			if (champs.jours) { champs.jours.textContent = deux(Math.floor(s / 86400)); }
			if (champs.heures) { champs.heures.textContent = deux(Math.floor(s % 86400 / 3600)); }
			if (champs.minutes) { champs.minutes.textContent = deux(Math.floor(s % 3600 / 60)); }
			if (champs.secondes) { champs.secondes.textContent = deux(s % 60); }
			setTimeout(battre, 1000 - (Date.now() % 1000));
		}
		battre();
	}

	/* ------------------------------------------------------------------ */
	/*  Les bandeaux                                                       */
	/* ------------------------------------------------------------------ */
	document.querySelectorAll('.ahns-annonce--bandeau').forEach(function (bandeau) {
		var id = bandeau.getAttribute('data-ahns-annonce') || '';
		if (fermee(id)) {
			bandeau.remove();
			return;
		}
		bandeau.hidden = false;
		compteur(bandeau);
		var croix = bandeau.querySelector('[data-ahns-fermer]');
		if (croix) {
			croix.addEventListener('click', function () {
				retenir(id);
				bandeau.remove();
			});
		}
	});

	/* ------------------------------------------------------------------ */
	/*  Les popups                                                         */
	/* ------------------------------------------------------------------ */
	document.querySelectorAll('.ahns-annonce--popup').forEach(function (popup) {
		var id = popup.getAttribute('data-ahns-annonce') || '';
		if (fermee(id)) {
			popup.remove();
			return;
		}

		var ouverte = false;
		var declencheur = popup.getAttribute('data-ahns-declencheur') || 'immediat';

		function fermer() {
			retenir(id);
			popup.remove();
			document.removeEventListener('keydown', surTouche);
		}

		function surTouche(ev) {
			if ('Escape' === ev.key) {
				fermer();
			}
		}

		function ouvrir() {
			if (ouverte || fermee(id)) {
				return;
			}
			ouverte = true;
			popup.hidden = false;
			compteur(popup);
			document.addEventListener('keydown', surTouche);
			var croix = popup.querySelector('[data-ahns-fermer]');
			if (croix) {
				croix.addEventListener('click', fermer);
				croix.focus();
			}
			popup.addEventListener('click', function (ev) {
				if (ev.target === popup) {
					fermer(); /* clic sur le voile, hors de la carte. */
				}
			});
		}

		if ('intention_sortie' === declencheur) {
			/* La souris qui file vers la barre d'adresse. Au tactile il n'y a
			   pas de souris : on se rabat sur un délai, long exprès — trente
			   secondes de lecture avant d'oser interrompre. */
			document.addEventListener('mouseout', function (ev) {
				if (!ev.relatedTarget && ev.clientY <= 0) {
					ouvrir();
				}
			});
			if ('ontouchstart' in window) {
				setTimeout(ouvrir, 30000);
			}
		} else {
			/* « Immédiat » attend tout de même deux secondes : une popup qui
			   devance le premier écran se ferme avant d'être lue. */
			setTimeout(ouvrir, 2000);
		}
	});
})();
