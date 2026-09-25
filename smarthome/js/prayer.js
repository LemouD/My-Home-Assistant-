// =============================================
// PRAYER.JS — Horaires de prière (Aladhan API)
// =============================================

const PRIERES_DEF = [
  { key: 'Fajr',    nom: 'Fajr',    icone: '🌙' },
  { key: 'Dhuhr',   nom: 'Dhuhr',   icone: '☀️' },
  { key: 'Asr',     nom: 'Asr',     icone: '🌤' },
  { key: 'Maghrib', nom: 'Maghrib', icone: '🌅' },
  { key: 'Isha',    nom: 'Isha',    icone: '⭐' },
];

async function chargerPrieres() {
  const container = document.getElementById('prieres-list');
  if (!container) return;

  try {
    const now = new Date();
    const day   = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year  = now.getFullYear();

    const url = `https://api.aladhan.com/v1/timingsByCity/${day}-${month}-${year}`
      + `?city=${encodeURIComponent(CONFIG.VILLE)}&country=${CONFIG.PAYS}&method=${CONFIG.METHODE_PRIERE}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (data.code !== 200) throw new Error('API Aladhan erreur');

    const timings = data.data.timings;

    // Trouver la prochaine prière
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let nextIndex = -1;

    const priereMinutes = PRIERES_DEF.map(p => {
      const [h, m] = timings[p.key].split(':').map(Number);
      return h * 60 + m;
    });

    for (let i = 0; i < priereMinutes.length; i++) {
      if (priereMinutes[i] > currentMinutes) {
        nextIndex = i;
        break;
      }
    }

    // Rendu
    container.innerHTML = '';
    PRIERES_DEF.forEach((p, i) => {
      const heure = timings[p.key].substring(0, 5); // HH:MM
      const isNext = i === nextIndex;

      container.innerHTML += `
        <div class="priere-item ${isNext ? 'active' : ''}">
          <div class="priere-gauche">
            <span class="priere-icon">${p.icone}</span>
            <span class="priere-nom">${p.nom}</span>
            ${isNext ? '<span class="priere-badge-next">Prochaine</span>' : ''}
          </div>
          <span class="priere-heure">${heure}</span>
        </div>`;
    });

  } catch (e) {
    console.warn('Prières indisponibles:', e.message);
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">
          Horaires indisponibles<br>Vérifiez la connexion internet
        </div>`;
    }
  }
}

// Mise à jour à chaque heure pleine
document.addEventListener('DOMContentLoaded', () => {
  chargerPrieres();
  setInterval(chargerPrieres, CONFIG.REFRESH_PRIERE);
  // Aussi recalculer quelle est la "prochaine" chaque minute
  setInterval(() => chargerPrieres(), 60000);
});
