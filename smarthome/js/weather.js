// =============================================
// WEATHER.JS — Météo via Open-Meteo (gratuit)
// =============================================

import { el, remplacer } from './dom.js';

// Icônes de la maquette (assets/icons/accueil/meteo-*.svg) : soleil, eclaircies, nuage, pluie
const METEO_ICONES = {
  0:  { icone: 'soleil',     desc: 'Ciel dégagé' },
  1:  { icone: 'soleil',     desc: 'Principalement dégagé' },
  2:  { icone: 'eclaircies', desc: 'Partiellement nuageux' },
  3:  { icone: 'nuage',      desc: 'Couvert' },
  45: { icone: 'nuage',      desc: 'Brouillard' },
  48: { icone: 'nuage',      desc: 'Brouillard givrant' },
  51: { icone: 'pluie',      desc: 'Bruine légère' },
  53: { icone: 'pluie',      desc: 'Bruine modérée' },
  61: { icone: 'pluie',      desc: 'Pluie légère' },
  63: { icone: 'pluie',      desc: 'Pluie modérée' },
  65: { icone: 'pluie',      desc: 'Pluie forte' },
  71: { icone: 'nuage',      desc: 'Neige légère' },
  73: { icone: 'nuage',      desc: 'Neige modérée' },
  80: { icone: 'pluie',      desc: 'Averses légères' },
  81: { icone: 'pluie',      desc: 'Averses modérées' },
  95: { icone: 'pluie',      desc: 'Orage' },
};

const INCONNU = { icone: 'nuage', desc: 'Inconnu' };
const urlIcone = (nom) => new URL(`../assets/icons/accueil/meteo-${nom}.svg`, import.meta.url).href;

// Icône principale : le nuage garde sa taille et sa position de la maquette,
// les icônes de 16 px sont agrandies à 48 px dans le cadre de 64 px
function afficherIcone(img, nom) {
  const nuage = nom === 'nuage';
  img.src = urlIcone(nom);
  img.width = nuage ? 44.7989 : 48;
  img.height = nuage ? 32 : 48;
  img.toggleAttribute('data-cale', nuage);
}
const JOURS_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// Charge la météo pour la position de la maison (hass.config) et l'affiche sous `racine`.
// Renvoie une fonction qui arrête le rafraîchissement.
export function demarrerMeteo(racine, { latitude, longitude, fuseau }, intervalle) {
  const $ = (id) => racine.querySelector(`#${id}`);

  const charger = async () => {
    try {
      // Position arrondie à ~1 km : l'adresse exacte n'est pas envoyée à l'API
      const params = new URLSearchParams({
        latitude: latitude.toFixed(2),
        longitude: longitude.toFixed(2),
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: fuseau,
        forecast_days: 5,
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { current: curr, daily } = await res.json();

      // Météo actuelle
      const info = METEO_ICONES[curr.weather_code] ?? INCONNU;
      afficherIcone($('meteo-icon'), info.icone);
      $('meteo-temp').textContent     = Math.round(curr.temperature_2m);
      $('meteo-desc').textContent     = info.desc;
      $('meteo-humidite').textContent = `${curr.relative_humidity_2m}%`;
      $('meteo-vent').textContent     = `${Math.round(curr.wind_speed_10m)} km/h`;

      // Prévisions 5 jours
      const aujourdhui = new Date().getDay();
      remplacer($('meteo-previsions'), ...daily.weather_code.slice(0, 5).map((code, i) =>
        el('div', { class: 'prev-jour' },
          el('span', { class: 'jour-nom' }, i === 0 ? 'Auj.' : JOURS_COURT[(aujourdhui + i) % 7]),
          el('img', { class: 'jour-icon', src: urlIcone((METEO_ICONES[code] ?? INCONNU).icone), width: 16, height: 16, alt: '' }),
          el('span', { class: 'jour-temp' }, `${Math.round(daily.temperature_2m_max[i])}°`),
        )));
    } catch (e) {
      console.warn('Météo indisponible :', e.message);
      $('meteo-desc').textContent = 'Météo indisponible';
      afficherIcone($('meteo-icon'), INCONNU.icone);
    }
  };

  charger();
  const timer = setInterval(charger, intervalle);
  return () => clearInterval(timer);
}
