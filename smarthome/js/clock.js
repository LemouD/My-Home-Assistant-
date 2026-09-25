// =============================================
// CLOCK.JS — Horloge temps réel
// =============================================

function initClock() {
  const updateClock = () => {
    const now = new Date();

    // Heure
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const clockEl = document.getElementById('clock-time');
    if (clockEl) clockEl.textContent = `${h}:${m}`;

    // Date en français
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = now.toLocaleDateString('fr-FR', options);
    const dateEl = document.getElementById('clock-date');
    if (dateEl) dateEl.textContent = dateStr;

    // Sous-titre header (salutation selon heure)
    const heure = now.getHours();
    let salut = 'Bienvenue chez vous';
    if (heure >= 5  && heure < 12) salut = 'Bonne matinée ☀️';
    if (heure >= 12 && heure < 14) salut = 'Bon appétit 🍽️';
    if (heure >= 14 && heure < 18) salut = 'Bon après-midi 🌤';
    if (heure >= 18 && heure < 21) salut = 'Bonne soirée 🌆';
    if (heure >= 21 || heure < 5)  salut = 'Bonne nuit 🌙';

    const subEl = document.getElementById('header-sub');
    if (subEl) subEl.textContent = salut;

    // Date calendrier
    const calDateEl = document.getElementById('cal-date');
    if (calDateEl) {
      const calOpts = { weekday: 'long', day: 'numeric', month: 'long' };
      calDateEl.textContent = 'Aujourd\'hui, ' + now.toLocaleDateString('fr-FR', calOpts);
    }
  };

  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', initClock);
