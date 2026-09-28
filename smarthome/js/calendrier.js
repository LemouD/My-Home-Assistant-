// =============================================
// CALENDRIER.JS — Événements et tâches de la famille
// =============================================
// Logique partagée par la vue Calendrier et la carte de l'accueil :
// lecture des entités calendar.*, mise en forme, construction d'un nouvel événement.
// Aucun stockage navigateur : tout est relu dans Home Assistant.

import { calendrierEvenements } from './ha.js';

export const COULEURS = ['bleu', 'vert', 'rouge', 'ambre', 'cyan'];
export const couleurDe = (couleur) => (COULEURS.includes(couleur) ? couleur : 'bleu');

const JOURS_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQUENCES = { semaine: 'WEEKLY', mois: 'MONTHLY', annee: 'YEARLY' };
const LIMITE_PLAGE_JOURS = 93;   // lecture bornée à environ 3 mois
const TITRE_MAX = 80;

// ---- DATES ----

export const debutDuJour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Ajout de jours calendaires (juste aussi aux changements d'heure)
export const ajouterJours = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const deux = (n) => String(n).padStart(2, '0');

// 'AAAA-MM-JJ' ↔ Date locale à minuit
const dateLocale = (texte) => {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
};
export const texteDate = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

// Date du formulaire existante ? (« 2026-02-31 » est refusée au lieu de glisser au 3 mars)
const dateValide = (texte) => /^\d{4}-\d{2}-\d{2}$/.test(texte ?? '') && texteDate(dateLocale(texte)) === texte;

export const heure = (d) => `${deux(d.getHours())}:${deux(d.getMinutes())}`;
// « 14h » ou « 14h30 », pour les cases de la grille
export const heureCourte = (d) => `${d.getHours()}h${d.getMinutes() ? deux(d.getMinutes()) : ''}`;

// Date avec le décalage horaire de la tablette : 2026-09-28T14:00:00+02:00
function isoLocal(d) {
  const decalage = -d.getTimezoneOffset();
  const abs = Math.abs(decalage);
  return `${texteDate(d)}T${heure(d)}:00${decalage >= 0 ? '+' : '-'}${deux(Math.floor(abs / 60))}:${deux(abs % 60)}`;
}

// L'événement occupe-t-il une partie de ce jour ?
export function toucheJour(evenement, jour) {
  const debut = debutDuJour(jour);
  const fin = ajouterJours(debut, 1);
  if (evenement.fin > evenement.debut) return evenement.debut < fin && evenement.fin > debut;
  return evenement.debut >= debut && evenement.debut < fin;
}

// Journée entière d'abord, puis par heure de début
export const ordreDuJour = (a, b) => (b.journee - a.journee) || (a.debut - b.debut);

// ---- LECTURE ----

const texte = (valeur, max) => (typeof valeur === 'string' ? valeur.trim().slice(0, max) : '');

// Règle de répétition lue dans HA → libellé en clair (null si l'événement ne se répète pas)
export function libelleRepetition(rrule) {
  if (typeof rrule !== 'string' || !rrule) return null;
  const parties = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  switch (parties.FREQ) {
    case 'DAILY': return 'chaque jour';
    case 'WEEKLY': return parties.BYDAY === 'MO,TU,WE,TH,FR' ? 'du lundi au vendredi' : 'chaque semaine';
    case 'MONTHLY': return 'chaque mois';
    case 'YEARLY': return 'chaque année';
    default: return 'répétitif';
  }
}

// Occurrence renvoyée par HA → objet affichable.
// Calendrier « discret » : seulement « Occupé » et l'horaire, ni titre ni détail.
function normaliser(brut, calendrier) {
  const journee = Boolean(brut?.start?.date);
  const debut = journee ? dateLocale(brut.start.date) : new Date(brut?.start?.dateTime);
  let fin = journee ? dateLocale(brut.end?.date ?? brut.start.date) : new Date(brut.end?.dateTime ?? brut.start.dateTime);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return null;
  if (journee && fin <= debut) fin = ajouterJours(debut, 1);   // fin exclusive en journée entière
  return {
    uid: texte(brut.uid, 200),
    calendrier: calendrier.id,
    couleur: couleurDe(calendrier.couleur),
    nomCalendrier: calendrier.nom,
    titre: calendrier.discret ? 'Occupé' : (texte(brut.summary, TITRE_MAX) || 'Sans titre'),
    journee,
    debut,
    fin,
    repetition: libelleRepetition(brut.rrule),
  };
}

// Lit tous les calendriers sur la plage : un calendrier en erreur ne bloque pas les autres.
// Renvoie { evenements, erreurs } ; erreurs = nombre de calendriers illisibles.
export async function lireEvenements(hass, calendriers, debut, fin) {
  const limite = ajouterJours(debut, LIMITE_PLAGE_JOURS);
  const finBornee = fin > limite ? limite : fin;
  const resultats = await Promise.allSettled(calendriers.map((c) => calendrierEvenements(hass, c.id, debut, finBornee)));
  const evenements = [];
  let erreurs = 0;
  resultats.forEach((r, i) => {
    if (r.status === 'rejected' || !Array.isArray(r.value)) {
      erreurs += 1;
      // Jamais le contenu d'un événement dans la console : seulement l'entité
      console.warn('Calendrier illisible :', calendriers[i].id, r.reason?.message ?? '');
      return;
    }
    for (const brut of r.value) {
      const evenement = normaliser(brut, calendriers[i]);
      if (evenement) evenements.push(evenement);
    }
  });
  evenements.sort((a, b) => a.debut - b.debut);
  return { evenements, erreurs };
}

// Pour la carte de l'accueil : les événements d'un jour, dans l'ordre d'affichage
export async function evenementsDuJour(hass, calendriers, date = new Date()) {
  const jour = debutDuJour(date);
  const { evenements, erreurs } = await lireEvenements(hass, calendriers, jour, ajouterJours(jour, 1));
  return { evenements: evenements.filter((e) => toucheJour(e, jour)).sort(ordreDuJour), erreurs };
}

// ---- CRÉATION ----

// Règle de répétition construite uniquement à partir de valeurs connues :
// aucun texte saisi n'y entre. Renvoie null pour un événement à date fixe.
export function regleRepetition({ repetition, jours = [], jusquau = '', journee }) {
  if (repetition === 'aucune') return null;
  const frequence = FREQUENCES[repetition];
  if (!frequence) throw new Error('Répétition inconnue.');
  const parties = [`FREQ=${frequence}`];
  if (frequence === 'WEEKLY') {
    const choisis = JOURS_RRULE.filter((j) => jours.includes(j));
    if (!choisis.length) throw new Error('Choisissez au moins un jour.');
    parties.push(`BYDAY=${choisis.join(',')}`);
  }
  if (jusquau) {
    if (!dateValide(jusquau)) throw new Error('Date de fin de répétition invalide.');
    if (journee) {
      parties.push(`UNTIL=${jusquau.replaceAll('-', '')}`);
    } else {
      // Fin de la journée choisie, exprimée en UTC comme l'exige la norme
      const fin = dateLocale(jusquau);
      fin.setHours(23, 59, 59);
      parties.push(`UNTIL=${fin.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    }
  }
  return parties.join(';');
}

// Valeurs du formulaire → événement pour le calendrier local de HA.
// Lève une Error dont le message s'affiche tel quel dans le formulaire.
export function preparerEvenement({ titre, date, debut, fin, journee, repetition, jours, jusquau }) {
  const resume = texte(titre, TITRE_MAX);
  if (!resume) throw new Error('Indiquez un titre.');
  if (!dateValide(date)) throw new Error('Indiquez une date valide.');
  if (jusquau && jusquau < date) throw new Error('« Jusqu\'au » doit être après la date de l\'événement.');

  const evenement = { summary: resume };
  if (journee) {
    evenement.dtstart = date;
    evenement.dtend = texteDate(ajouterJours(dateLocale(date), 1));   // fin exclusive
  } else {
    if (!/^\d{2}:\d{2}$/.test(debut ?? '') || !/^\d{2}:\d{2}$/.test(fin ?? '')) throw new Error('Indiquez les heures.');
    const [hd, md] = debut.split(':').map(Number);
    const [hf, mf] = fin.split(':').map(Number);
    const jour = dateLocale(date);
    const dateDebut = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), hd, md);
    const dateFin = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), hf, mf);
    if (dateFin <= dateDebut) throw new Error('La fin doit être après le début.');
    evenement.dtstart = isoLocal(dateDebut);
    evenement.dtend = isoLocal(dateFin);
  }
  const rrule = regleRepetition({ repetition, jours, jusquau, journee });
  if (rrule) evenement.rrule = rrule;
  return evenement;
}

// ---- TÂCHES ----

const MS_48H = 48 * 3600 * 1000;

// Réponse de todo/item/list → tâches à faire d'abord, puis les terminées
export function normaliserTaches(reponse, maintenant = new Date()) {
  const items = Array.isArray(reponse?.items) ? reponse.items : [];
  return items
    .filter((t) => typeof t.uid === 'string')
    .map((t) => {
      const due = typeof t.due === 'string' ? t.due : '';
      const echeance = due.length === 10 ? ajouterJours(dateLocale(due), 1) : (due ? new Date(due) : null);
      const terminee = t.status === 'completed';
      const valide = echeance && !Number.isNaN(echeance.getTime());
      return {
        uid: t.uid,
        titre: texte(t.summary, TITRE_MAX) || 'Sans titre',
        terminee,
        echeance: valide ? echeance : null,
        journee: due.length === 10,
        urgente: Boolean(valide && !terminee && echeance - maintenant < MS_48H),
      };
    })
    .sort((a, b) => (a.terminee - b.terminee) || ((a.echeance ?? Infinity) - (b.echeance ?? Infinity)));
}

// « Aujourd'hui », « Demain », « Jeudi », « 12 oct. », « En retard »
export function libelleEcheance(tache, maintenant = new Date()) {
  if (!tache.echeance) return '';
  // Pour une échéance à la journée, echeance est le lendemain à minuit (fin de journée)
  const jour = tache.journee ? ajouterJours(tache.echeance, -1) : tache.echeance;
  if (!tache.terminee && tache.echeance < maintenant) return 'En retard';
  const ecart = Math.round((debutDuJour(jour) - debutDuJour(maintenant)) / 86400000);
  const suffixe = tache.journee ? '' : ` · ${heure(jour)}`;
  if (ecart === 0) return `Aujourd'hui${suffixe}`;
  if (ecart === 1) return `Demain${suffixe}`;
  if (ecart > 1 && ecart < 7) {
    const nom = jour.toLocaleDateString('fr-FR', { weekday: 'long' });
    return `${nom.charAt(0).toUpperCase()}${nom.slice(1)}${suffixe}`;
  }
  return jour.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
