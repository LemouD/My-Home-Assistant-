// =============================================
// PRAYER.JS — Horaires de prière (Aladhan API)
// =============================================

import { el, remplacer } from './dom.js';

const PRIERES_DEF = [
  { key: 'Fajr',    nom: 'Fajr' },
  { key: 'Dhuhr',   nom: 'Dhuhr' },
  { key: 'Asr',     nom: 'Asr' },
  { key: 'Maghrib', nom: 'Maghrib' },
  { key: 'Isha',    nom: 'Isha' },
];

// Noms courts des méthodes de calcul Aladhan (affichés sous la liste)
const METHODES = { 1: 'Karachi', 2: 'ISNA', 3: 'MWL', 4: 'Umm al-Qura', 5: 'Égypte', 12: 'UOIF', 15: 'Moonsighting' };

// « dans 2 h 10 min » : délai avant la prochaine prière (passe minuit si besoin)
const delai = (minutes) => {
  const total = (minutes + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `dans ${h > 0 ? `${h} h ` : ''}${m} min`;
};

const dateApi = (d) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

const enMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Les horaires ne changent qu'une fois par jour : un seul appel à l'API par jour,
// le calcul de la prochaine prière se fait localement chaque minute.
// Renvoie une fonction qui arrête la mise à jour.
export function demarrerPrieres(racine, { latitude, longitude, methode, ville }) {
  const liste = racine.querySelector('#prieres-list');
  if (!liste) return () => {};

  const pied = racine.querySelector('#prieres-pied');
  if (pied) pied.textContent = [ville, `Méthode ${METHODES[methode] ?? methode}`].filter(Boolean).join(' · ');

  let jour = null;      // date des horaires en cache (JJ-MM-AAAA)
  let horaires = null;  // [{ ...PRIERES_DEF, heure: 'HH:MM', minutes }]

  const charger = async (date) => {
    // Position arrondie à ~1 km : l'adresse exacte n'est pas envoyée à l'API
    const params = new URLSearchParams({
      latitude: latitude.toFixed(2),
      longitude: longitude.toFixed(2),
      method: methode,
    });
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

    remplacer(liste, ...horaires.map((p) => {
      const estProchaine = p === prochaine;
      const classes = ['priere-item', `priere-${p.key.toLowerCase()}`, estProchaine && 'active'].filter(Boolean).join(' ');
      return el('div', { class: classes },
        el('div', { class: 'priere-ligne' },
          el('span', { class: 'priere-point' }),
          el('span', { class: 'priere-nom' }, p.nom),
          estProchaine && el('span', { class: 'priere-badge-next' }, 'Prochaine'),
          el('span', { class: 'priere-heure' }, p.heure),
        ),
        estProchaine && el('span', { class: 'priere-compte' }, delai(p.minutes - minutes)),
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
        remplacer(liste, el('div', { class: 'cal-empty' },
          'Horaires indisponibles', el('br'), 'Vérifiez la connexion internet'));
      }
    }
  };

  maj();
  const timer = setInterval(maj, 60000);
  return () => clearInterval(timer);
}
