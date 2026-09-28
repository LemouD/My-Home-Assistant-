// =============================================
// RESPIRATION.JS — Exercice de respiration guidée
// =============================================
// Cycle : inspirer 4 s, retenir 2 s, expirer 6 s (12 s), répété pendant la durée
// choisie. Les ondes grandissent et rétrécissent par une transition CSS sur
// `transform` : rien n'est animé en dehors de l'exercice.

import { el } from './dom.js';

const PHASES = [
  { libelle: 'Inspirez', secondes: 4, echelle: 1.18 },
  { libelle: 'Retenez',  secondes: 2, echelle: 1.18 },
  { libelle: 'Expirez',  secondes: 6, echelle: 0.86 },
];

// icone : URL de l'icône centrale. surChangement(enCours, termine) : termine vaut
// true quand l'exercice est allé au bout. Renvoie { element, demarrer, arreter, enCours }.
export function creerRespiration({ icone, ondes, dureeSecondes = 120, surChangement = () => {} }) {
  const libelle = el('b', { class: 'respiration-libelle' }, 'Inspirez');
  const detail = el('span', { class: 'respiration-detail' }, `${Math.round(dureeSecondes / 60)} min`);
  const cercles = el('div', { class: 'respiration-ondes' },
    ...ondes.map((url, i) => el('img', { class: `respiration-onde respiration-onde-${i + 1}`, src: url, alt: '' })));
  const element = el('div', { class: 'respiration', role: 'timer', 'aria-live': 'polite' },
    cercles,
    el('div', { class: 'respiration-centre' },
      el('img', { src: icone, width: 24, height: 24, alt: '' }),
      libelle,
      detail));

  let minuteur = null;
  let fin = 0;

  function appliquer(phase) {
    libelle.textContent = phase.libelle;
    cercles.style.transitionDuration = `${phase.secondes}s`;
    cercles.style.transform = `scale(${phase.echelle})`;
  }

  function etape(index) {
    const restant = Math.max(0, Math.round((fin - Date.now()) / 1000));
    if (restant <= 0) {
      arreter(true);
      return;
    }
    const phase = PHASES[index % PHASES.length];
    appliquer(phase);
    detail.textContent = `${Math.floor(restant / 60)}:${String(restant % 60).padStart(2, '0')}`;
    minuteur = setTimeout(() => etape(index + 1), phase.secondes * 1000);
  }

  function demarrer() {
    arreter();
    fin = Date.now() + dureeSecondes * 1000;
    element.classList.add('en-cours');
    surChangement(true);
    etape(0);
  }

  function arreter(termine = false) {
    clearTimeout(minuteur);
    minuteur = null;
    element.classList.remove('en-cours');
    cercles.style.transitionDuration = '0.6s';
    cercles.style.transform = 'scale(1)';
    libelle.textContent = termine ? 'Terminé' : 'Inspirez';
    detail.textContent = termine ? 'Bravo' : `${Math.round(dureeSecondes / 60)} min`;
    surChangement(false, termine);
  }

  return { element, demarrer, arreter: () => arreter(), enCours: () => minuteur !== null };
}
