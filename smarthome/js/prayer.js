// =============================================
// PRAYER.JS — Horaires de prière (Aladhan API)
// =============================================

import { el } from './dom.js';

const PRIERES_DEF = [
  { key: 'Fajr',    nom: 'Fajr',    icone: '🌙' },
  { key: 'Dhuhr',   nom: 'Dhuhr',   icone: '☀️' },
  { key: 'Asr',     nom: 'Asr',     icone: '🌤' },
  { key: 'Maghrib', nom: 'Maghrib', icone: '🌅' },
  { key: 'Isha',    nom: 'Isha',    icone: '⭐' },
];

const dateApi = (d) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

const enMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Les horaires ne changent qu'une fois par jour : un seul appel à l'API par jour,
// le calcul de la prochaine prière se fait localement chaque minute.
// Renvoie une fonction qui arrête la mise à jour.
export function demarrerPrieres(racine, { latitude, longitude, methode }) {
  const liste = racine.querySelector('#prieres-list');
  if (!liste) return () => {};

  let jour = null;      // date des horaires en cache (JJ-MM-AAAA)
  let horaires = null;  // [{ ...PRIERES_DEF, heure: 'HH:MM', minutes }]

  const charger = async (date) => {
    const params = new URLSearchParams({ latitude, longitude, method: methode });
    const res = await fetch(`https://api.aladhan.com/v1/timings/${date}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== 200) throw new Error('API Aladhan erreur');

    return PRIERES_DEF.map((p) => {
      const heure = data.data.timings[p.key].substring(0, 5); // HH:MM
      return { ...p, heure, minutes: enMinutes(heure) };
    });
  };

  const afficher = (now) => {
    const minutes = now.getHours() * 60 + now.getMinutes();
    // Après Isha, la prochaine prière est Fajr du lendemain
    const prochaine = horaires.find((p) => p.minutes > minutes) ?? horaires[0];

    liste.replaceChildren(...horaires.map((p) => {
      const estProchaine = p === prochaine;
      return el('div', { class: estProchaine ? 'priere-item active' : 'priere-item' },
        el('div', { class: 'priere-gauche' },
          el('span', { class: 'priere-icon' }, p.icone),
          el('span', { class: 'priere-nom' }, p.nom),
          estProchaine && el('span', { class: 'priere-badge-next' },
            p.minutes > minutes ? 'Prochaine' : 'Demain'),
        ),
        el('span', { class: 'priere-heure' }, p.heure),
      );
    }));
  };

  const maj = async () => {
    const now = new Date();
    const date = dateApi(now);
    try {
      if (date !== jour) {
        horaires = await charger(date);
        jour = date;
      }
      afficher(now);
    } catch (e) {
      console.warn('Prières indisponibles :', e.message);
      // En cas d'échec, `jour` n'est pas mis à jour : nouvel essai à la minute suivante
      if (!horaires) {
        liste.replaceChildren(el('div', { class: 'cal-empty' },
          'Horaires indisponibles', el('br'), 'Vérifiez la connexion internet'));
      }
    }
  };

  maj();
  const timer = setInterval(maj, 60000);
  return () => clearInterval(timer);
}
