// =============================================
// WEATHER.JS — Météo via Open-Meteo (gratuit)
// =============================================

import { el } from './dom.js';

const METEO_ICONES = {
  0:  { icone: '☀️',  desc: 'Ciel dégagé' },
  1:  { icone: '🌤',  desc: 'Principalement dégagé' },
  2:  { icone: '⛅',  desc: 'Partiellement nuageux' },
  3:  { icone: '☁️',  desc: 'Couvert' },
  45: { icone: '🌫',  desc: 'Brouillard' },
  48: { icone: '🌫',  desc: 'Brouillard givrant' },
  51: { icone: '🌦',  desc: 'Bruine légère' },
  53: { icone: '🌦',  desc: 'Bruine modérée' },
  61: { icone: '🌧',  desc: 'Pluie légère' },
  63: { icone: '🌧',  desc: 'Pluie modérée' },
  65: { icone: '🌧',  desc: 'Pluie forte' },
  71: { icone: '🌨',  desc: 'Neige légère' },
  73: { icone: '❄️',  desc: 'Neige modérée' },
  80: { icone: '🌦',  desc: 'Averses légères' },
  81: { icone: '🌧',  desc: 'Averses modérées' },
  95: { icone: '⛈️',  desc: 'Orage' },
};

const INCONNU = { icone: '🌡', desc: 'Inconnu' };
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
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: fuseau,
        forecast_days: 5,
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { current: curr, daily } = await res.json();

      // Météo actuelle
      const info = METEO_ICONES[curr.weather_code] ?? INCONNU;
      $('meteo-icon').textContent     = info.icone;
      $('meteo-temp').textContent     = Math.round(curr.temperature_2m);
      $('meteo-desc').textContent     = info.desc;
      $('meteo-humidite').textContent = `${curr.relative_humidity_2m}%`;
      $('meteo-vent').textContent     = `${Math.round(curr.wind_speed_10m)} km/h`;
      $('meteo-ressenti').textContent = `${Math.round(curr.apparent_temperature)}°C`;

      // Prévisions 5 jours
      const aujourdhui = new Date().getDay();
      $('meteo-previsions').replaceChildren(...daily.weather_code.slice(0, 5).map((code, i) =>
        el('div', { class: i === 0 ? 'prev-jour today' : 'prev-jour' },
          el('span', { class: 'jour-nom' }, i === 0 ? 'Auj.' : JOURS_COURT[(aujourdhui + i) % 7]),
          el('span', { class: 'jour-icon' }, (METEO_ICONES[code] ?? INCONNU).icone),
          el('span', { class: 'jour-temp' }, `${Math.round(daily.temperature_2m_max[i])}°`),
        )));
    } catch (e) {
      console.warn('Météo indisponible :', e.message);
      $('meteo-desc').textContent = 'Météo indisponible';
      $('meteo-icon').textContent = '❓';
    }
  };

  charger();
  const timer = setInterval(charger, intervalle);
  return () => clearInterval(timer);
}
