// =============================================
// RITUEL.JS — Rituel du soir en quatre étapes
// =============================================
// Se recentrer (respiration 2 min), lire un verset, invoquer, se préparer à dormir.
// L'étape active est mise en avant ; la respiration terminée fait passer à la
// suivante. « Lumière douce » active la scène configurée dans config.VIE.

import { el, remplacer } from '../../../js/dom.js';
import { activer, etat } from '../../../js/ha.js';
import { creerRespiration } from '../../../js/respiration.js';
import { audioVerset, verset } from '../../../js/spiritualite.js';
import { choixDuJour, INVOCATIONS, MOMENTS } from '../contenus.js';

const icone = (fichier) => new URL(`../../../assets/icons/vie/${fichier}`, import.meta.url).href;
const img = (fichier, taille) => el('img', { src: icone(`${fichier}.svg`), width: taille, height: taille, alt: '' });

const ETAPES = [
  { icone: 'souffle', nom: 'Se recentrer', duree: '2 min · respiration', couleur: 'or',
    titre: 'Revenir doucement au souffle',
    texte: 'Posez les épaules. Inspirez pendant quatre temps, gardez un court silence, puis expirez lentement sans forcer.' },
  { icone: 'etape-lire', nom: 'Lire', duree: '3 min · verset', couleur: 'lavande',
    titre: 'Lire quelques versets en silence',
    texte: 'Prenez le temps de lire le verset du soir, puis de l\'écouter une fois, sans vous presser.' },
  { icone: 'etape-invoquer', nom: 'Invoquer', duree: '2 min · invocation', couleur: 'menthe',
    titre: 'Confier la journée à Allah',
    texte: 'Récitez l\'invocation à voix basse, en pensant à ceux que vous aimez.' },
  { icone: 'etape-preparer', nom: 'Se préparer', duree: '3 min · retour au calme', couleur: 'or',
    titre: 'Préparer une nuit sereine',
    texte: 'Tamisez la lumière, posez les écrans et accueillez la nuit avec une intention de repos.' },
];

export async function monter({ config }) {
  const vie = config.VIE ?? {};
  const soir = MOMENTS.soir;
  const referenceVerset = choixDuJour(soir.versets);
  const invocation = INVOCATIONS[choixDuJour(soir.invocations)];

  let hass = null;
  let active = 0;
  let lecteur = null;

  const respiration = creerRespiration({
    icone: icone('souffle.svg'),
    ondes: ['onde-exterieure', 'onde-mediane', 'onde-interieure'].map((o) => icone(`${o}.svg`)),
    // Respiration allée au bout : on passe à la lecture
    surChangement: (enCours, termine) => {
      if (termine && active === 0) choisir(1);
      else rendreAction();
    },
  });

  // ---- ZONES DYNAMIQUES ----

  const zoneCompteur = el('span', { class: 'vie-section-texte vie-texte-violet' });
  const zoneChemin = el('div', { class: 'vie-chemin-etapes' });
  const zoneListe = el('div', { class: 'vie-rituel-liste' });
  const zoneActive = el('div', { class: 'vie-rituel-active-texte' });
  const zoneAction = el('div', { class: 'vie-actions' });
  const zoneReference = el('span', { class: 'vie-section-texte' }, referenceVerset);
  const zoneVerset = el('p', { class: 'vie-verset-texte' }, 'Chargement…');
  const boutonEcouter = el('button', { class: 'vie-bouton-discret', 'data-action': 'ecouter', disabled: true },
    img('ecouter', 16), 'Écouter');
  const boutonLumiere = el('button', { class: 'vie-preparer-item', 'data-action': 'lumiere' },
    img('ampoule', 18), el('span', { class: 'vie-details' }, el('b', {}, 'Lumière douce'), el('span', { class: 'vie-lumiere-etat' }, 'Tamiser la pièce')));

  const colonne = (index, ...contenu) => el('div', { class: 'vie-rituel-colonne', 'data-etape': index },
    el('div', { class: 'vie-section-entete' },
      el('span', { class: `vie-icone vie-icone-grand vie-rituel-icone-${ETAPES[index].couleur}` }, img(ETAPES[index].icone, 20)),
      el('div', {},
        el('span', { class: `vie-repere vie-repere-${ETAPES[index].couleur}` },
          el('span', { class: `vie-point vie-point-${ETAPES[index].couleur}` }),
          `0${index + 1} · ${ETAPES[index].nom}`),
        index === 1 && zoneReference)),
    ...contenu);

  const racine = el('div', { class: 'vie vie-rituel' },
    el('div', { class: 'vie-entete' },
      el('a', { class: 'vie-bouton-discret', 'data-vue': 'vie/decouvrir' }, img('retour-gris', 15), 'Découvrir'),
      el('div', { class: 'vie-pastille' }, img('foyer', 16), el('span', { class: 'vie-foyer' }, 'Notre Foyer'))),
    el('div', { class: 'vie-entete vie-entete-bas' },
      el('div', {},
        el('h1', { class: 'vie-titre' }, 'Rituel du soir'),
        el('p', { class: 'vie-sous-titre' }, 'Ralentir, nourrir le cœur et préparer une nuit sereine.')),
      el('span', { class: 'vie-date vie-duree' }, img('horloge', 16), 'Environ 10 minutes · à votre rythme')),

    // Chemin : les quatre étapes
    el('section', { class: 'vie-chemin' },
      el('div', { class: 'vie-repere-ligne' }, el('b', { class: 'vie-chemin-titre' }, 'Votre chemin ce soir'), zoneCompteur),
      zoneChemin),

    el('section', { class: 'vie-rituel-carte' },
      el('aside', { class: 'vie-rituel-cote' },
        el('div', { class: 'vie-rituel-intro' },
          el('span', { class: 'vie-repere vie-repere-or' }, el('span', { class: 'vie-point vie-point-or' }), 'Ce soir'),
          el('h2', { class: 'vie-rituel-cote-titre' }, 'Un rituel simple pour ralentir'),
          el('p', { class: 'vie-section-texte' }, 'Suivez les quatre étapes dans l\'ordre, sans objectif de performance.')),
        zoneListe,
        el('p', { class: 'vie-section-texte vie-rituel-pause' }, 'Vous pouvez faire une pause à tout moment.')),

      el('div', { class: 'vie-rituel-principal' },
        el('div', { class: 'vie-rituel-active' }, zoneActive, respiration.element),
        el('div', { class: 'vie-rituel-colonnes' },
          colonne(1, zoneVerset, el('div', { class: 'vie-actions' }, boutonEcouter)),
          colonne(2,
            el('p', { class: 'vie-arabe', dir: 'rtl', lang: 'ar' }, invocation.arabe),
            el('p', { class: 'vie-translitteration' }, invocation.translitteration),
            el('p', { class: 'vie-essentiel-texte' }, invocation.traduction),
            el('p', { class: 'vie-section-texte' }, invocation.source)),
          colonne(3,
            el('p', { class: 'vie-essentiel-texte' }, 'Une courte séquence pour signaler doucement au corps qu\'il peut se relâcher.'),
            el('div', { class: 'vie-preparer' },
              vie.sceneLumiereDouce ? boutonLumiere : null,
              el('div', { class: 'vie-preparer-item' }, img('activite-pause', 18),
                el('span', { class: 'vie-details' }, el('b', {}, 'Écran posé'), el('span', {}, 'Laisser le téléphone'))),
              el('div', { class: 'vie-preparer-item' }, img('lune', 18),
                el('span', { class: 'vie-details' }, el('b', {}, 'Intention de repos'), el('span', {}, 'Accueillir la nuit')))),
            el('p', { class: 'vie-section-texte vie-texte-ambre' }, '3 minutes · sans se presser')))),
    ),
  );

  // ---- RENDU DE L'ÉTAPE ACTIVE ----

  function etapeResume(etape, index, classe) {
    return el('button', { class: index === active ? `${classe} actif` : classe, 'data-action': 'etape', 'data-index': index },
      el('span', { class: `vie-icone vie-rituel-icone-${etape.couleur}` }, img(etape.icone, 18)),
      el('span', { class: 'vie-details' }, el('b', {}, `0${index + 1} · ${etape.nom}`), el('span', {}, etape.duree)));
  }

  function rendreAction() {
    const derniere = active === ETAPES.length - 1;
    if (active === 0) {
      remplacer(zoneAction, el('button', { class: 'vie-bouton vie-bouton-plein', 'data-action': 'respiration' },
        img('lecture-blanche', 16), respiration.enCours() ? 'Arrêter la respiration' : 'Commencer le rituel'),
      el('button', { class: 'vie-bouton-discret', 'data-action': 'suivante' }, 'Passer'));
    } else {
      remplacer(zoneAction,
        el('button', { class: 'vie-bouton-discret', 'data-action': 'precedente' }, img('retour-gris', 15), 'Précédente'),
        el('button', { class: 'vie-bouton vie-bouton-plein', 'data-action': derniere ? 'terminer' : 'suivante' },
          derniere ? 'Terminer le rituel' : 'Étape suivante', img('fleche-droite-blanche', 16)));
    }
  }

  function choisir(index) {
    if (index !== 0 && respiration.enCours()) respiration.arreter();
    active = index;
    const etape = ETAPES[index];
    zoneCompteur.textContent = `Étape ${index + 1} sur ${ETAPES.length}`;
    remplacer(zoneChemin, ...ETAPES.map((e, i) => etapeResume(e, i, i < index ? 'vie-chemin-etape faite' : 'vie-chemin-etape')));
    remplacer(zoneListe, ...ETAPES.map((e, i) => etapeResume(e, i, 'vie-rituel-item')));
    remplacer(zoneActive,
      el('span', { class: 'vie-repere vie-repere-or vie-rituel-badge' },
        el('b', { class: 'vie-rituel-numero' }, `0${index + 1}`),
        el('span', { class: 'vie-point vie-point-or' }), `Étape active · ${etape.nom}`),
      el('h2', { class: 'vie-rituel-active-titre' }, etape.titre),
      el('p', { class: 'vie-respiration-texte' }, etape.texte),
      zoneAction);
    respiration.element.hidden = index !== 0;
    for (const c of racine.querySelectorAll('.vie-rituel-colonne')) {
      c.classList.toggle('actif', Number(c.dataset.etape) === index);
    }
    rendreAction();
  }

  function terminer() {
    remplacer(zoneActive,
      el('span', { class: 'vie-repere vie-repere-menthe' }, el('span', { class: 'vie-point vie-point-menthe' }), 'Rituel terminé'),
      el('h2', { class: 'vie-rituel-active-titre' }, 'Bonne nuit'),
      el('p', { class: 'vie-respiration-texte' }, 'Que votre repos soit paisible. Vous pouvez recommencer le rituel quand vous le souhaitez.'),
      el('div', { class: 'vie-actions' },
        el('button', { class: 'vie-bouton-discret', 'data-action': 'recommencer' }, 'Recommencer'),
        el('a', { class: 'vie-bouton vie-bouton-plein', 'data-vue': 'vie' }, 'Retour à Vie')));
    respiration.element.hidden = true;
  }

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

  async function lumiereDouce() {
    if (!hass) return;
    const libelle = boutonLumiere.querySelector('.vie-lumiere-etat');
    boutonLumiere.disabled = true;
    try {
      await activer(hass, vie.sceneLumiereDouce);
      libelle.textContent = 'Lumière tamisée';
      boutonLumiere.classList.add('actif');
    } catch (e) {
      libelle.textContent = 'Scène indisponible';
      console.warn('Vie, lumière douce :', e.message);
    } finally {
      boutonLumiere.disabled = false;
    }
  }

  // ---- ÉVÉNEMENTS ----

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    switch (cible?.dataset.action) {
      case 'etape':       choisir(Number(cible.dataset.index)); break;
      case 'suivante':    choisir(Math.min(active + 1, ETAPES.length - 1)); break;
      case 'precedente':  choisir(Math.max(active - 1, 0)); break;
      case 'terminer':    terminer(); break;
      case 'recommencer': choisir(0); break;
      case 'ecouter':     ecouter(); break;
      case 'lumiere':     lumiereDouce(); break;
      case 'respiration':
        if (respiration.enCours()) respiration.arreter();
        else respiration.demarrer();
        break;
      default:
    }
  });

  choisir(0);
  chargerVerset();

  return {
    racine,
    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) racine.querySelector('.vie-foyer').textContent = hass.config.location_name || 'Notre Foyer';
      // Scène absente de Home Assistant : le bouton est désactivé plutôt que d'échouer au clic
      if (vie.sceneLumiereDouce) boutonLumiere.disabled = !etat(hass, vie.sceneLumiereDouce);
    },
    detruire() {
      respiration.arreter();
      lecteur?.pause();
    },
  };
}
