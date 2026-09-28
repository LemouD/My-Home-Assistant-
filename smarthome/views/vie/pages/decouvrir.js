// =============================================
// DECOUVRIR.JS — Parcours guidé : respiration, prières, verset, invocation
// =============================================

import { el, remplacer } from '../../../js/dom.js';
import { horairesPriere, prochainePriere } from '../../../js/prayer.js';
import { creerRespiration } from '../../../js/respiration.js';
import { audioVerset, verset } from '../../../js/spiritualite.js';
import { choixDuJour, INVOCATIONS, momentDe, MOMENTS } from '../contenus.js';

const icone = (fichier) => new URL(`../../../assets/icons/vie/${fichier}`, import.meta.url).href;
const image = (fichier) => new URL(`../../../assets/images/vie/${fichier}`, import.meta.url).href;

// Fonds fournis avec le panneau (voir assets/images/CREDITS.md) ; config.VIE.fonds peut les remplacer
const FONDS = { decouvrirSpiritualite: image('spiritualite.webp'), decouvrirMotif: image('motif.webp') };
const img = (fichier, taille) => el('img', { src: icone(`${fichier}.svg`), width: taille, height: taille, alt: '' });

export async function monter({ config }) {
  const vie = config.VIE ?? {};
  const fonds = { ...FONDS, ...vie.fonds };
  const moment = MOMENTS[momentDe()];
  const referenceVerset = choixDuJour(moment.versets);
  const invocation = INVOCATIONS[choixDuJour(moment.invocations)];

  let hass = null;
  let minuteur = null;
  let lecteur = null;   // audio du verset en cours

  const respiration = creerRespiration({
    icone: icone('souffle.svg'),
    ondes: ['onde-exterieure', 'onde-mediane', 'onde-interieure'].map((o) => icone(`${o}.svg`)),
    surChangement: (enCours) => {
      boutonRespiration.replaceChildren(img('lecture-blanche', 16), enCours ? 'Arrêter' : 'Commencer');
    },
  });
  const boutonRespiration = el('button', { class: 'vie-bouton vie-bouton-plein', 'data-action': 'respiration' },
    img('lecture-blanche', 16), 'Commencer');

  const zoneProchaine = el('div', { class: 'vie-spirit-prochaine' });
  const zoneHoraires = el('div', { class: 'vie-spirit-horaires' });
  const zoneReference = el('span', { class: 'vie-section-texte' }, `Verset ${referenceVerset}`);
  const zoneVerset = el('p', { class: 'vie-verset-texte' }, 'Chargement…');
  const boutonEcouter = el('button', { class: 'vie-bouton-discret', 'data-action': 'ecouter', disabled: true },
    img('ecouter', 16), 'Écouter');

  const racine = el('div', { class: 'vie vie-decouvrir' },
    el('div', { class: 'vie-entete' },
      el('a', { class: 'vie-bouton-discret', 'data-vue': 'vie/bien-etre' }, img('retour-gris', 15), 'Bien-être & spiritualité'),
      el('div', { class: 'vie-pastille' }, img('foyer', 16), el('span', { class: 'vie-foyer' }, 'Notre Foyer'))),
    el('div', {},
      el('h1', { class: 'vie-titre' }, 'Découvrir'),
      el('p', { class: 'vie-sous-titre' }, 'Un parcours guidé pour apaiser le corps, nourrir le cœur et préparer une soirée sereine.')),

    // Pause respiration
    el('section', { class: 'vie-respiration-carte' },
      el('img', { class: 'vie-halo-ambiant', src: icone('halo-ambiant.svg'), width: 470, height: 470, alt: '' }),
      el('img', { class: 'vie-lueur-chaude', src: icone('lueur-chaude.svg'), width: 260, height: 260, alt: '' }),
      el('div', { class: 'vie-respiration-intro' },
        el('span', { class: 'vie-repere vie-repere-or' }, el('span', { class: 'vie-point vie-point-or' }), 'Expérience guidée'),
        el('h2', { class: 'vie-respiration-titre' }, 'Pause respiration — 2 minutes'),
        el('p', { class: 'vie-respiration-texte' },
          'Laissez le souffle ralentir. Inspirez pendant quatre temps, retenez doucement, puis expirez sans effort.'),
        boutonRespiration),
      respiration.element),

    // Prières du jour
    el('section', { class: 'vie-spiritualite' },
      fonds.decouvrirSpiritualite && el('img', { class: 'vie-rituel-fond vie-fond-spiritualite', src: fonds.decouvrirSpiritualite, alt: '' }),
      el('span', { class: 'vie-rituel-voile vie-voile-spiritualite' }),
      el('div', { class: 'vie-repere-ligne' },
        el('div', { class: 'vie-section-entete' },
          el('span', { class: 'vie-icone vie-icone-grand vie-icone-menthe' }, img('etincelles-grandes', 20)),
          el('div', {},
            el('h2', { class: 'vie-section-titre' }, 'Spiritualité'),
            el('p', { class: 'vie-section-texte' }, ['Aujourd\'hui', config.VILLE?.split(',')[0]].filter(Boolean).join(' · ')))),
        el('span', { class: 'vie-repere vie-repere-lavande' }, el('span', { class: 'vie-point vie-point-lavande' }), 'Prochaine prière')),
      zoneProchaine,
      el('span', { class: 'vie-trait' }),
      zoneHoraires),

    // Verset et invocation
    el('section', { class: 'vie-reperes-jour' },
      fonds.decouvrirMotif && el('img', { class: 'vie-rituel-fond vie-fond-motif', src: fonds.decouvrirMotif, alt: '' }),
      el('span', { class: 'vie-rituel-voile vie-voile-motif' }),
      el('div', { class: 'vie-repere-jour' },
        el('div', { class: 'vie-repere-ligne' },
          el('div', { class: 'vie-section-entete' },
            el('span', { class: 'vie-icone vie-icone-grand' }, img('livre-grand', 20)),
            el('span', { class: 'vie-repere vie-repere-lavande' }, el('span', { class: 'vie-point vie-point-lavande' }), 'Verset du jour')),
          zoneReference),
        zoneVerset,
        el('div', { class: 'vie-actions' }, boutonEcouter)),
      el('div', { class: 'vie-repere-jour vie-repere-invocation' },
        el('div', { class: 'vie-repere-ligne' },
          el('div', { class: 'vie-section-entete' },
            el('span', { class: 'vie-icone vie-icone-grand vie-icone-menthe' }, img('etincelles-grandes', 20)),
            el('span', { class: 'vie-repere vie-repere-menthe' }, el('span', { class: 'vie-point vie-point-menthe' }), 'Invocation du jour')),
          el('span', { class: 'vie-section-texte' }, invocation.source)),
        el('p', { class: 'vie-arabe', dir: 'rtl', lang: 'ar' }, invocation.arabe),
        el('div', {},
          el('p', { class: 'vie-translitteration' }, invocation.translitteration),
          el('p', { class: 'vie-essentiel-texte' }, invocation.traduction)))),

    // Rituel du soir
    el('section', { class: 'vie-rituel-apercu' },
      el('div', { class: 'vie-rituel-intro' },
        el('span', { class: 'vie-repere vie-repere-or' }, el('span', { class: 'vie-point vie-point-or' }), 'Ce soir'),
        el('b', { class: 'vie-section-titre' }, 'Un rituel simple pour ralentir'),
        el('span', { class: 'vie-section-texte' }, 'Environ 10 minutes, à votre rythme.')),
      el('span', { class: 'vie-separateur-vertical' }),
      ...[
        ['etape-lire', '1. Lire', 'Quelques versets en silence'],
        ['etape-invoquer', '2. Invoquer', 'Confier la journée à Allah'],
        ['etape-preparer', '3. Se préparer', 'Tamiser, respirer, puis dormir'],
      ].map(([fichier, titre, texte]) => el('div', { class: 'vie-activite' },
        el('span', { class: 'vie-icone vie-icone-grand vie-activite-icone' }, img(fichier, 18)),
        el('span', { class: 'vie-details' }, el('b', {}, titre), el('span', {}, texte)))),
      el('a', { class: 'vie-bouton vie-bouton-plein', 'data-vue': 'vie/rituel' }, img('fleche-droite-rituel', 16), 'Voir le rituel')),
  );

  // ---- DONNÉES ----

  async function chargerVerset() {
    try {
      const v = await verset(referenceVerset);
      zoneReference.textContent = `Sourate ${v.sourate} · ${v.reference}`;
      zoneVerset.textContent = v.traduction ? `« ${v.traduction} »` : v.arabe;
      boutonEcouter.disabled = false;
    } catch (e) {
      zoneVerset.textContent = 'Verset indisponible pour le moment.';
      console.warn('Vie, verset :', e.message);
    }
  }

  async function rendrePrieres() {
    try {
      const { latitude, longitude } = hass.config;
      const horaires = await horairesPriere({ latitude, longitude, methode: config.METHODE_PRIERE });
      const { priere } = prochainePriere(horaires);
      remplacer(zoneProchaine, el('span', {}, `${priere.nom} —`), el('b', {}, priere.heure));
      remplacer(zoneHoraires, ...horaires.map((p) => el('div', { class: p === priere ? 'vie-spirit-horaire actif' : 'vie-spirit-horaire' },
        el('span', {}, p.nom), el('b', {}, p.heure))));
    } catch (e) {
      remplacer(zoneProchaine, el('span', { class: 'vie-vide' }, 'Horaires indisponibles'));
      console.warn('Vie, prières :', e.message);
    }
  }

  async function ecouter() {
    if (lecteur && !lecteur.paused) {
      lecteur.pause();
      return;
    }
    try {
      boutonEcouter.disabled = true;
      lecteur ??= new Audio(await audioVerset(referenceVerset, vie.recitateur ?? 1));
      lecteur.onplay = () => boutonEcouter.replaceChildren(img('ecouter', 16), 'Pause');
      lecteur.onpause = lecteur.onended = () => boutonEcouter.replaceChildren(img('ecouter', 16), 'Écouter');
      await lecteur.play();
    } catch (e) {
      console.warn('Vie, audio du verset :', e.message);
    } finally {
      boutonEcouter.disabled = false;
    }
  }

  racine.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'respiration') {
      if (respiration.enCours()) respiration.arreter();
      else respiration.demarrer();
    } else if (action === 'ecouter') {
      ecouter();
    }
  });

  chargerVerset();

  return {
    racine,
    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) {
        racine.querySelector('.vie-foyer').textContent = hass.config.location_name || 'Notre Foyer';
        rendrePrieres();
        minuteur = setInterval(rendrePrieres, 60_000);
      }
    },
    detruire() {
      clearInterval(minuteur);
      respiration.arreter();
      lecteur?.pause();
    },
  };
}
