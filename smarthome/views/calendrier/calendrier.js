// =============================================
// CALENDRIER.JS — Vue Calendrier familial
// =============================================
// Événements : entités calendar.*, une par catégorie (couleur choisie dans config.js).
// Tâches : une entité todo.*. Lecture à l'ouverture, toutes les 5 minutes et à chaque
// changement de mois ; ajout d'événements à date fixe ou répétitifs (anniversaires…).

import { ajouterStyle, chargerGabarit, el, remplacer } from '../../js/dom.js';
import { aChange, calendrierCreer, nom, tachesLire, tacheStatut } from '../../js/ha.js';
import {
  ajouterJours, couleurDe, debutDuJour, heure, heureCourte, libelleEcheance, lireEvenements,
  normaliserTaches, ordreDuJour, preparerEvenement, texteDate, toucheJour,
} from '../../js/calendrier.js';

const RAFRAICHISSEMENT_MS = 5 * 60_000;
const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];   // indexé par getDay()
const MAX_POINTS = 4;
const MAX_SEMAINE = 4;
const MAX_TACHES = 6;

const majuscule = (texte) => `${texte.charAt(0).toUpperCase()}${texte.slice(1)}`;
const recurrent = () => el('span', { class: 'cal-recurrent', 'aria-label': 'Répétitif' }, '↻');
// « Marie Dupont » → « MD », « Membre 1 » → « M1 »
const initiales = (texte) => texte.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m.charAt(0).toUpperCase()).join('');

export async function monter({ config }) {
  const conf = config.CALENDRIER ?? {};
  const calendriers = (conf.calendriers ?? []).map((c) => ({ ...c, couleur: couleurDe(c.couleur) }));
  const membres = conf.membres ?? [];
  const idTaches = conf.taches ?? null;

  const racine = el('div', { class: 'vue-calendrier' });
  racine.append(await chargerGabarit(new URL('./calendrier.html', import.meta.url)));
  ajouterStyle(racine, new URL('./calendrier.css', import.meta.url));
  const $ = (id) => racine.querySelector(`#${id}`);
  const formulaire = $('cal-formulaire');

  let hass = null;
  let moisAffiche = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let grille = { evenements: [], erreurs: 0 };
  let proches = { evenements: [], erreurs: 0 };
  let taches = [];
  let chargement = 0;       // ignore une réponse arrivée après un changement de mois
  let minuteur = null;
  const membresMasques = new Set();

  // Catégories masquées : celles des membres dont l'interrupteur est coupé
  const visible = (evenement) =>
    !membres.some((m, i) => membresMasques.has(i) && (m.calendriers ?? []).includes(evenement.calendrier));

  // Semaines complètes, du lundi au dimanche, couvrant le mois affiché
  function plageGrille() {
    const decalage = (moisAffiche.getDay() + 6) % 7;
    const debut = ajouterJours(moisAffiche, -decalage);
    const joursDansMois = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0).getDate();
    return { debut, fin: ajouterJours(debut, Math.ceil((decalage + joursDansMois) / 7) * 7) };
  }

  // ---- RENDU ----

  // Membres : le nom vient de l'entité person.* de HA (jamais de prénom dans config.js, fichier public)
  function rendreMembres() {
    if (!membres.length) {
      remplacer($('cal-membres'), el('p', { class: 'cal-aide' }, 'Aucun membre configuré.'));
      return;
    }
    remplacer($('cal-membres'), ...membres.map((m, i) => {
      const nomAffiche = nom(hass, m.personne, `Membre ${i + 1}`);
      return el('button', {
        class: 'cal-membre', 'data-action': 'filtrer-membre', 'data-index': i, 'aria-pressed': String(!membresMasques.has(i)),
      },
      el('span', { class: `cal-avatar cal-couleur-${couleurDe(m.couleur)}` }, initiales(nomAffiche)),
      el('span', { class: 'cal-membre-texte' }, el('b', {}, nomAffiche), m.role && el('span', {}, m.role)),
      el('span', { class: 'cal-interrupteur' }));
    }));
  }

  // Légende et catégories du formulaire : tirées de la config
  function rendreFixe() {
    remplacer($('cal-legende'), ...calendriers.map((c) =>
      el('li', {}, el('span', { class: `cal-point cal-couleur-${c.couleur}` }), c.nom)));

    remplacer(racine.querySelector('.cal-choix-calendrier'), ...calendriers.map((c, i) =>
      el('label', { class: `cal-couleur-${c.couleur}` },
        el('input', { type: 'radio', name: 'calendrier', value: c.id, checked: i === 0 }),
        el('span', { class: 'cal-point' }), c.nom)));
  }

  function rendreGrille() {
    const { debut, fin } = plageGrille();
    const aujourdhui = debutDuJour(new Date());
    const evenements = grille.evenements.filter(visible);
    $('cal-periode').textContent = majuscule(moisAffiche.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));

    const cases = [];
    for (let jour = debut; jour < fin; jour = ajouterJours(jour, 1)) {
      const duJour = evenements.filter((e) => toucheJour(e, jour)).sort(ordreDuJour);
      const estAujourdhui = jour.getTime() === aujourdhui.getTime();
      const classes = ['cal-case'];
      if (jour.getMonth() !== moisAffiche.getMonth()) classes.push('cal-case-hors-mois');
      if (estAujourdhui) classes.push('cal-case-aujourdhui');

      // Un événement : en toutes lettres ; plusieurs : un point par catégorie
      let contenu = null;
      if (duJour.length === 1) {
        const [e] = duJour;
        contenu = el('span', { class: `cal-evenement cal-couleur-${e.couleur}` },
          e.repetition && recurrent(), e.journee ? e.titre : `${heureCourte(e.debut)} ${e.titre}`);
      } else if (duJour.length > 1) {
        const couleurs = [...new Set(duJour.map((e) => e.couleur))].slice(0, MAX_POINTS);
        contenu = el('span', { class: 'cal-points', 'aria-label': `${duJour.length} événements` },
          ...couleurs.map((c) => el('span', { class: `cal-point cal-couleur-${c}` })));
      }
      cases.push(el('div', { class: classes.join(' '), 'aria-current': estAujourdhui ? 'date' : null },
        el('span', { class: 'cal-numero' }, String(jour.getDate())), contenu));
    }
    remplacer($('cal-grille'), ...cases);
  }

  const messageVide = (liste, texte) => el('p', { class: 'cal-aide' },
    liste.erreurs ? 'Calendrier indisponible pour le moment.' : texte);

  function rendreAujourdhui() {
    const aujourdhui = new Date();
    $('cal-jour').textContent = aujourdhui.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const evenements = proches.evenements.filter((e) => visible(e) && toucheJour(e, aujourdhui)).sort(ordreDuJour);
    if (!evenements.length) {
      remplacer($('cal-aujourdhui'), messageVide(proches, 'Rien de prévu aujourd\'hui.'));
      return;
    }
    remplacer($('cal-aujourdhui'), ...evenements.map((e) =>
      el('div', { class: `cal-horaire cal-couleur-${e.couleur}` },
        el('b', { class: 'cal-heure' }, e.journee ? 'Journée' : heure(e.debut)),
        el('span', { class: 'cal-horaire-texte' },
          el('b', {}, e.repetition && recurrent(), e.titre),
          el('span', {}, [e.nomCalendrier, e.repetition].filter(Boolean).join(' · '))))));
  }

  function rendreSemaine() {
    const demain = ajouterJours(debutDuJour(new Date()), 1);
    const limite = ajouterJours(demain, 7);
    // Un événement répétitif n'apparaît qu'une fois (sa prochaine occurrence)
    const series = new Set();
    const evenements = proches.evenements
      .filter((e) => visible(e) && e.debut >= demain && e.debut < limite)
      .filter((e) => {
        if (!e.repetition || !e.uid) return true;
        const cle = `${e.calendrier}|${e.uid}`;
        if (series.has(cle)) return false;
        series.add(cle);
        return true;
      })
      .slice(0, MAX_SEMAINE);
    if (!evenements.length) {
      remplacer($('cal-a-venir'), messageVide(proches, 'Rien de prévu cette semaine.'));
      return;
    }
    remplacer($('cal-a-venir'), ...evenements.map((e) =>
      el('div', { class: 'cal-a-venir' },
        el('span', { class: `cal-date cal-couleur-${e.couleur}` }, `${JOURS_COURTS[e.debut.getDay()]} ${e.debut.getDate()}`),
        el('span', { class: 'cal-horaire-texte' },
          el('b', {}, e.repetition && recurrent(), e.titre),
          el('span', {}, [e.journee ? 'Journée' : heure(e.debut), e.repetition].filter(Boolean).join(' · '))))));
  }

  function rendreTaches() {
    if (!idTaches) {
      remplacer($('cal-taches'), el('p', { class: 'cal-aide' }, 'Aucune liste de tâches configurée.'));
      return;
    }
    if (!taches.length) {
      remplacer($('cal-taches'), el('p', { class: 'cal-aide' }, 'Aucune tâche en cours.'));
      return;
    }
    const coche = new URL('../../assets/icons/calendrier/coche.svg', import.meta.url).href;
    remplacer($('cal-taches'), ...taches.slice(0, MAX_TACHES).map((t) =>
      el('button', {
        class: t.urgente ? 'cal-tache cal-tache-urgente' : 'cal-tache',
        role: 'checkbox', 'aria-checked': String(t.terminee), 'data-action': 'cocher-tache', 'data-uid': t.uid,
      },
      el('span', { class: 'cal-case-a-cocher' }, t.terminee && el('img', { src: coche, width: 12, height: 12, alt: '' })),
      el('span', { class: 'cal-horaire-texte' }, el('b', {}, t.titre), el('span', {}, libelleEcheance(t))))));
  }

  const rendreEvenements = () => {
    rendreGrille();
    rendreAujourdhui();
    rendreSemaine();
  };

  // ---- DONNÉES ----

  async function chargerEvenements() {
    if (!hass || !calendriers.length) {
      rendreEvenements();
      return;
    }
    const jeton = ++chargement;
    const { debut, fin } = plageGrille();
    const aujourdhui = debutDuJour(new Date());
    try {
      const [g, p] = await Promise.all([
        lireEvenements(hass, calendriers, debut, fin),
        lireEvenements(hass, calendriers, aujourdhui, ajouterJours(aujourdhui, 8)),
      ]);
      if (jeton !== chargement) return;
      grille = g;
      proches = p;
    } catch (e) {
      console.warn('Calendrier :', e.message);
    }
    rendreEvenements();
  }

  async function chargerTaches() {
    if (!hass || !idTaches) {
      rendreTaches();
      return;
    }
    try {
      taches = normaliserTaches(await tachesLire(hass, idTaches));
    } catch (e) {
      console.warn('Tâches illisibles :', idTaches, e.message);
    }
    rendreTaches();
  }

  async function cocherTache(bouton) {
    const tache = taches.find((t) => t.uid === bouton.dataset.uid);
    if (!tache) return;
    tache.terminee = !tache.terminee;   // affichage immédiat, confirmé par la relecture
    rendreTaches();
    try {
      await tacheStatut(hass, idTaches, tache.uid, tache.terminee);
    } catch (e) {
      tache.terminee = !tache.terminee;
      console.warn('Tâche non modifiée :', e.message);
    }
    chargerTaches();
  }

  // ---- FORMULAIRE D'AJOUT ----

  function afficherFormulaire(ouvert) {
    $('cal-voile').hidden = !ouvert;
    if (!ouvert) return;
    formulaire.reset();
    const premier = formulaire.querySelector('input[name="calendrier"]');
    if (premier) premier.checked = true;
    formulaire.elements.date.value = texteDate(new Date());
    $('cal-formulaire-message').textContent = calendriers.length ? '' : 'Aucun calendrier configuré.';
    majRepetition();
    formulaire.elements.titre.focus();
  }

  // Jours et date de fin : seulement pour un événement répétitif.
  // « Chaque année » sert surtout aux anniversaires : journée entière cochée par défaut.
  // « Chaque semaine » : le jour de la date est coché si aucun ne l'est.
  function majRepetition(changement = false) {
    const repetition = formulaire.elements.repetition.value;
    $('cal-repetition-details').hidden = repetition === 'aucune';
    $('cal-jours-repetition').hidden = repetition !== 'semaine';
    if (!changement) return;
    if (repetition === 'annee') formulaire.elements.journee.checked = true;
    if (repetition === 'semaine' && !formulaire.querySelector('input[name="jour"]:checked')) {
      const date = formulaire.elements.date.value;
      const jour = (date ? new Date(`${date}T12:00`) : new Date()).getDay();
      const caseJour = formulaire.querySelector(`input[name="jour"][value="${JOURS_RRULE[jour]}"]`);
      if (caseJour) caseJour.checked = true;
    }
  }

  async function enregistrer() {
    const message = $('cal-formulaire-message');
    const champs = formulaire.elements;
    // La catégorie doit être l'une de la config : jamais une entité venue du formulaire
    const calendrier = calendriers.find((c) => c.id === champs.calendrier?.value);
    let evenement;
    try {
      if (!calendrier) throw new Error('Choisissez une catégorie.');
      evenement = preparerEvenement({
        titre: champs.titre.value,
        date: champs.date.value,
        debut: champs.debut.value,
        fin: champs.fin.value,
        journee: champs.journee.checked,
        repetition: champs.repetition.value,
        jours: [...formulaire.querySelectorAll('input[name="jour"]:checked')].map((c) => c.value),
        jusquau: champs.jusquau.value,
      });
    } catch (e) {
      message.textContent = e.message;
      return;
    }
    const bouton = formulaire.querySelector('button[type="submit"]');
    bouton.disabled = true;
    message.textContent = 'Enregistrement…';
    try {
      await calendrierCreer(hass, calendrier.id, evenement);
      afficherFormulaire(false);
      chargerEvenements();
    } catch (e) {
      message.textContent = 'Enregistrement impossible. Réessayez.';
      console.warn('Événement non créé :', calendrier.id, e.message ?? e.code ?? '');
    } finally {
      bouton.disabled = false;
    }
  }

  formulaire.addEventListener('change', (e) => {
    if (e.target.name === 'repetition') majRepetition(true);
  });

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    enregistrer();
  });

  // ---- ÉVÉNEMENTS ----

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    switch (cible?.dataset.action) {
      case 'ouvrir-formulaire': afficherFormulaire(true); break;
      case 'fermer-formulaire': afficherFormulaire(false); break;
      case 'mois-precedent':
      case 'mois-suivant': {
        const sens = cible.dataset.action === 'mois-suivant' ? 1 : -1;
        moisAffiche = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + sens, 1);
        grille = { evenements: [], erreurs: 0 };
        rendreGrille();   // grille du nouveau mois tout de suite, remplie à l'arrivée des données
        chargerEvenements();
        break;
      }
      case 'filtrer-membre': {
        const index = Number(cible.dataset.index);
        if (membresMasques.has(index)) membresMasques.delete(index);
        else membresMasques.add(index);
        cible.setAttribute('aria-pressed', String(!membresMasques.has(index)));
        rendreEvenements();
        break;
      }
      case 'cocher-tache': cocherTache(cible); break;
      default:
        if (e.target === $('cal-voile')) afficherFormulaire(false);   // toucher le fond ferme la fenêtre
    }
  });

  rendreFixe();
  rendreMembres();
  rendreEvenements();
  rendreTaches();

  return {
    racine,
    maj(nouveau) {
      const precedent = hass;
      hass = nouveau;
      if (aChange(precedent, hass, membres.map((m) => m.personne).filter(Boolean))) rendreMembres();
      if (!precedent) {
        chargerEvenements();
        chargerTaches();
        minuteur = setInterval(() => {
          chargerEvenements();
          chargerTaches();
        }, RAFRAICHISSEMENT_MS);
        return;
      }
      // L'état d'une entité todo est son nombre de tâches à faire : il change à chaque modification
      if (idTaches && aChange(precedent, hass, [idTaches])) chargerTaches();
    },
    detruire() {
      clearInterval(minuteur);
    },
  };
}
