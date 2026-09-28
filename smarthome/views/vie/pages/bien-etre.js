// =============================================
// BIEN-ETRE.JS — Bien-être & spiritualité
// =============================================
// Une seule page, trois ambiances (matin, après-midi, soir) choisies selon l'heure :
// textes, fond, icône et suggestions changent ; la mise en page reste la même.

import { el, remplacer } from '../../../js/dom.js';
import { horairesPriere, NOM_METHODE, prochainePriere } from '../../../js/prayer.js';
import { verset } from '../../../js/spiritualite.js';
import { choixDuJour, INVOCATIONS, momentDe, MOMENTS } from '../contenus.js';

const icone = (fichier) => new URL(`../../../assets/icons/vie/${fichier}`, import.meta.url).href;
const image = (fichier) => new URL(`../../../assets/images/vie/${fichier}`, import.meta.url).href;

// Fonds libres de droits fournis avec le panneau (voir assets/images/CREDITS.md) ;
// config.VIE.fonds peut les remplacer
const FONDS = { matin: image('matin.webp'), apresMidi: image('apres-midi.webp'), soir: image('soir.webp') };
const img = (fichier, taille) => el('img', { src: icone(`${fichier}.svg`), width: taille, height: taille, alt: '' });

const AMBIANCES = { matin: 'ambiance-matin', apresMidi: 'ambiance-apres-midi', soir: 'ambiance-soir' };
const ACTIVITES = { livre: 'activite-livre', respiration: 'activite-respiration', pause: 'activite-pause', goutte: 'activite-goutte', lune: 'activite-lune' };

// « dans 1 h 18 » / « dans 24 minutes »
const delaiLisible = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `dans ${m} minute${m > 1 ? 's' : ''}`;
  return `dans ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
};

export async function monter({ config }) {
  const racine = el('div', { class: 'vie' });
  const fonds = { ...FONDS, ...config.VIE?.fonds };

  let hass = null;
  let momentAffiche = null;
  let minuteur = null;

  // Zones remplies de façon asynchrone ou chaque minute
  const zonePriere = el('div', { class: 'vie-priere-principale' });
  const zoneListe = el('div', { class: 'vie-prieres-liste' });
  const zoneVerset = el('div', { class: 'vie-essentiel-contenu' }, el('p', { class: 'vie-vide' }, 'Chargement…'));

  function essentiel(classe, fichierIcone, titre, contenu) {
    return el('div', { class: `vie-essentiel ${classe}` },
      el('div', { class: 'vie-essentiel-entete' },
        el('span', { class: 'vie-icone vie-icone-grand vie-essentiel-icone' }, img(fichierIcone, 18)),
        el('b', { class: 'vie-repere vie-essentiel-titre' }, titre)),
      contenu);
  }

  // ---- STRUCTURE (reconstruite quand le moment de la journée change) ----

  function construire(moment) {
    momentAffiche = moment;
    const m = MOMENTS[moment];
    const aujourdhui = new Date();
    const invocation = INVOCATIONS[choixDuJour(m.invocations)];
    const conseil = choixDuJour(m.bienEtre);
    const date = aujourdhui.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    remplacer(racine,
      el('div', { class: 'vie-entete' },
        el('a', { class: 'vie-bouton-discret', 'data-vue': 'vie' }, img('retour-gris', 15), 'Retour à Vie'),
        el('div', { class: 'vie-pastille' }, img('foyer', 16), el('span', { class: 'vie-foyer' }, hass?.config.location_name || 'Notre Foyer'))),

      el('div', { class: 'vie-entete vie-entete-bas' },
        el('div', {},
          el('h1', { class: 'vie-titre' }, 'Bien-être & spiritualité'),
          el('p', { class: 'vie-sous-titre' }, 'Un espace calme pour prendre soin de soi et nourrir l\'essentiel.')),
        el('b', { class: 'vie-date' }, `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${m.libelle}`)),

      el('section', { class: `vie-rituel-jour vie-moment-${moment}` },
        fonds[moment] && el('img', { class: 'vie-rituel-fond', src: fonds[moment], alt: '' }),
        el('span', { class: 'vie-rituel-voile' }),
        el('img', { class: 'vie-rituel-halo', src: icone('halo.svg'), width: 440, height: 440, alt: '' }),

        el('div', { class: 'vie-moment-accueil' },
          el('div', {},
            el('p', { class: 'vie-moment-salutation' }, m.salutation),
            el('p', { class: 'vie-section-texte' }, m.accroche)),
          el('span', { class: 'vie-ambiance' }, img(AMBIANCES[moment], 15), 'Aujourd\'hui · horaire local')),

        el('div', { class: 'vie-prochaine' },
          zonePriere,
          el('div', { class: 'vie-prieres-a-venir' },
            el('div', { class: 'vie-prieres-entete' }, el('span', {}, 'Prières du jour'), img('repere-lieu', 13)),
            zoneListe)),

        el('div', { class: 'vie-essentiels' },
          essentiel('vie-essentiel-verset', 'livre-violet', 'Verset du jour', zoneVerset),
          essentiel('vie-essentiel-invocation', 'etincelles-vertes', 'Invocation du jour',
            el('div', { class: 'vie-essentiel-contenu' },
              el('p', { class: 'vie-essentiel-valeur' }, invocation.translitteration),
              el('p', { class: 'vie-essentiel-texte' }, invocation.contexte))),
          essentiel('vie-essentiel-bien-etre', 'vent', 'Bien-être',
            el('div', { class: 'vie-essentiel-contenu' },
              el('p', { class: 'vie-essentiel-valeur' }, conseil.titre),
              el('p', { class: 'vie-essentiel-texte' }, conseil.texte)))),

        el('div', { class: 'vie-suite' },
          ...m.activites.map((a) => el('div', { class: 'vie-activite' },
            el('span', { class: 'vie-icone vie-icone-grand vie-activite-icone' }, img(ACTIVITES[a.icone] ?? 'activite-livre', 18)),
            el('span', { class: 'vie-details' }, el('b', {}, a.titre), el('span', {}, a.texte)))),
          el('a', { class: 'vie-bouton vie-bouton-plein', 'data-vue': 'vie/decouvrir' },
            'Découvrir', img('fleche-droite-blanche', 16)))),
    );

    chargerVerset(choixDuJour(m.versets));
    if (hass) rendrePrieres();
  }

  async function chargerVerset(reference) {
    try {
      const v = await verset(reference);
      remplacer(zoneVerset,
        el('p', { class: 'vie-essentiel-valeur' }, `Sourate ${v.sourate} · ${v.reference}`),
        el('p', { class: 'vie-essentiel-texte' }, v.traduction ? `« ${v.traduction} »` : v.arabe));
    } catch (e) {
      remplacer(zoneVerset, el('p', { class: 'vie-essentiel-texte' }, 'Verset indisponible pour le moment.'));
      console.warn('Vie, verset :', e.message);
    }
  }

  // ---- PRIÈRES ----

  async function rendrePrieres() {
    try {
      const { latitude, longitude } = hass.config;
      const methode = config.METHODE_PRIERE;
      const horaires = await horairesPriere({ latitude, longitude, methode });
      const { priere, dans } = prochainePriere(horaires);
      const index = horaires.indexOf(priere);
      // Les trois suivantes, en repartant de Fajr après Isha
      const suivantes = [0, 1, 2].map((i) => horaires[(index + i) % horaires.length]);

      remplacer(zonePriere,
        el('div', { class: 'vie-repere-ligne vie-repere-priere' },
          img('horloge-violette', 17), el('b', { class: 'vie-repere' }, 'Prochaine prière')),
        el('div', { class: 'vie-priere-grande' },
          el('span', { class: 'vie-priere-nom' }, priere.nom),
          el('span', { class: 'vie-separateur-vertical' }),
          el('span', { class: 'vie-priere-heure' }, priere.heure)),
        el('p', { class: 'vie-section-texte vie-priere-delai' },
          el('span', { class: 'vie-point vie-point-vert' }),
          `${delaiLisible(dans)} · méthode ${NOM_METHODE(methode)}`));

      remplacer(zoneListe, ...suivantes.map((p, i) => el('div', { class: i === 0 ? 'vie-priere-ligne actif' : 'vie-priere-ligne' },
        el('span', { class: 'vie-priere-ligne-nom' }, el('span', { class: 'vie-point' }), p.nom),
        el('b', {}, p.heure))));
    } catch (e) {
      remplacer(zonePriere, el('p', { class: 'vie-vide' }, 'Horaires de prière indisponibles.'));
      console.warn('Vie, prières :', e.message);
    }
  }

  // Chaque minute : délai de la prière, et changement d'ambiance à 12 h et 18 h
  function chaqueMinute() {
    const moment = momentDe();
    if (moment !== momentAffiche) construire(moment);
    else rendrePrieres();
  }

  construire(momentDe());

  return {
    racine,
    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) {
        racine.querySelector('.vie-foyer').textContent = hass.config.location_name || 'Notre Foyer';
        rendrePrieres();
        minuteur = setInterval(chaqueMinute, 60_000);
      }
    },
    detruire() {
      clearInterval(minuteur);
    },
  };
}
