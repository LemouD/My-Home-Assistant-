// =============================================
// WEATHER.JS — Météo via Open-Meteo (gratuit)
// =============================================

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

const JOURS_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

async function chargerMeteo() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.LATITUDE}&longitude=${CONFIG.LONGITUDE}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&timezone=Europe/Paris&forecast_days=5`;

    const res  = await fetch(url);
    const data = await res.json();

    const curr = data.current;
    const daily = data.daily;

    // Météo actuelle
    const wCode = curr.weather_code;
    const info  = METEO_ICONES[wCode] || { icone: '🌡', desc: 'Inconnu' };

    document.getElementById('meteo-icon').textContent     = info.icone;
    document.getElementById('meteo-temp').textContent     = Math.round(curr.temperature_2m);
    document.getElementById('meteo-desc').textContent     = info.desc;
    document.getElementById('meteo-humidite').textContent = `${curr.relative_humidity_2m}%`;
    document.getElementById('meteo-vent').textContent     = `${Math.round(curr.wind_speed_10m)} km/h`;
    document.getElementById('meteo-ressenti').textContent = `${Math.round(curr.apparent_temperature)}°C`;

    // Prévisions 5 jours
    const prevEl = document.getElementById('meteo-previsions');
    prevEl.innerHTML = '';
    const today = new Date().getDay();

    for (let i = 0; i < 5; i++) {
      const code  = daily.weather_code[i];
      const inf   = METEO_ICONES[code] || { icone: '🌡', desc: '' };
      const dayIdx = (today + i) % 7;
      const label = i === 0 ? 'Auj.' : JOURS_COURT[dayIdx];
      const max   = Math.round(daily.temperature_2m_max[i]);

      prevEl.innerHTML += `
        <div class="prev-jour ${i === 0 ? 'today' : ''}">
          <span class="jour-nom">${label}</span>
          <span class="jour-icon">${inf.icone}</span>
          <span class="jour-temp">${max}°</span>
        </div>`;
    }

  } catch (e) {
    console.warn('Météo indisponible:', e.message);
    document.getElementById('meteo-desc').textContent = 'Météo indisponible';
    document.getElementById('meteo-icon').textContent = '❓';
  }
}

// Charger au démarrage puis toutes les 15 min
document.addEventListener('DOMContentLoaded', () => {
  chargerMeteo();
  setInterval(chargerMeteo, CONFIG.REFRESH_METEO);
});
