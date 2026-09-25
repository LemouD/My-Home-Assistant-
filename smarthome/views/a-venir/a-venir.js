// =============================================
// A-VENIR.JS — Vue provisoire des pages non développées
// =============================================

import { el } from '../../js/dom.js';

export async function monter({ titre }) {
  return {
    racine: el('div', { id: 'page-content' },
      el('div', { class: 'card a-venir' },
        el('div', { class: 'card-title' }, titre),
        el('p', { class: 'text-secondary' }, 'Cette page arrive bientôt.'),
      ),
    ),
  };
}
