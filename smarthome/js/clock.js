// =============================================
// CLOCK.JS — Horloge temps réel
// =============================================

function salutation(heure) {
  if (heure >= 5  && heure < 12) return 'Bonne matinée';
  if (heure >= 12 && heure < 14) return 'Bon appétit';
  if (heure >= 14 && heure < 18) return 'Bon après-midi';
  if (heure >= 18 && heure < 21) return 'Bonne soirée';
  return 'Bonne nuit';
}

// Met à jour les éléments d'horloge présents sous `racine`.
// Renvoie une fonction qui arrête l'horloge.
export function demarrerHorloge(racine) {
  const ecrire = (id, texte) => {
    const noeud = racine.getElementById(id);
    if (noeud) noeud.textContent = texte;
  };

  const maj = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');

    ecrire('clock-time', `${h}:${m}`);
    ecrire('clock-date', now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    ecrire('header-sub', `${salutation(now.getHours())}, ravi de vous revoir.`);
    ecrire('cal-date', `Aujourd'hui, ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
  };

  maj();
  const timer = setInterval(maj, 1000);
  return () => clearInterval(timer);
}
