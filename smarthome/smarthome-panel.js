// =============================================
// SMARTHOME-PANEL.JS — Point d'entrée du panneau Home Assistant
// =============================================
// Chargé par `panel_custom` (voir README). Home Assistant fournit :
//   - hass   : états + appels de service, avec la session de l'utilisateur connecté
//   - route  : { prefix, path } pour la navigation entre vues
//   - narrow : true sur écran étroit (menu HA masqué)
// Aucun token n'est stocké côté client.

import { chargerGabarit, el } from './js/dom.js';
import { aChange, estPresent, nom } from './js/ha.js';
import { demarrerHorloge } from './js/clock.js';

// ---- VUES ----
// La clé correspond au premier segment d'URL après le préfixe du panneau.
const VUES = {
  '':         { titre: 'Tableau de bord', charger: () => import('./views/dashboard/dashboard.js') },
  budget:     { titre: 'Budget & Factures', charger: () => import('./views/budget/budget.js') },
  energie:    { titre: 'Énergie & Fluides', charger: () => import('./views/energie/energie.js') },
  calendrier: { titre: 'Calendrier famille' },
  courses:    { titre: 'Liste de courses' },
};
const VUE_A_VENIR = () => import('./views/a-venir/a-venir.js');

const STYLES = ['css/main.css', 'css/sidebar.css', 'css/cards.css'];

class SmarthomePanel extends HTMLElement {
  #hass = null;
  #hassShell = null;   // dernier hass utilisé pour le header
  #route = null;
  #narrow = false;
  #config = null;
  #init = null;        // promesse d'initialisation (une seule fois)
  #cleVue = null;
  #vue = null;
  #arretHorloge = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ---- PROPRIÉTÉS FOURNIES PAR HOME ASSISTANT ----

  set hass(hass) {
    this.#hass = hass;
    this.#init ??= this.#initialiser();
    this.#init.then((ok) => ok && this.#majHass());
  }

  set route(route) {
    this.#route = route;
    this.#init?.then((ok) => ok && this.#afficherVue());
  }

  set narrow(narrow) {
    this.#narrow = narrow;
    this.shadowRoot.getElementById('app')?.classList.toggle('narrow', narrow);
  }

  // HA peut détacher puis rattacher le panneau quand on change de page
  connectedCallback() {
    this.#init?.then((ok) => {
      if (!ok) return;
      this.#arretHorloge ??= demarrerHorloge(this.shadowRoot);
      this.#afficherVue();
    });
  }

  disconnectedCallback() {
    this.#arretHorloge?.();
    this.#arretHorloge = null;
    this.#vue?.detruire?.();
    this.#vue = null;
    this.#cleVue = null;
  }

  // ---- INITIALISATION ----

  async #initialiser() {
    try {
      const [config, shell] = await Promise.all([
        import('./js/config.js')
          .then((m) => m.default)
          .catch(() => { throw new Error('js/config.js introuvable — copier js/config.example.js'); }),
        chargerGabarit(new URL('./shell.html', import.meta.url)),
      ]);
      this.#config = config;

      // Styles chargés avant d'afficher le cadre, pour éviter un flash sans mise en forme
      const styles = STYLES.map((f) => el('link', { rel: 'stylesheet', href: new URL(f, import.meta.url).href }));
      const stylesCharges = styles.map((lien) => new Promise((ok) => {
        lien.addEventListener('load', ok, { once: true });
        lien.addEventListener('error', ok, { once: true });
      }));
      this.shadowRoot.replaceChildren(...styles);
      await Promise.all(stylesCharges);
      this.shadowRoot.append(shell);
      this.shadowRoot.getElementById('app').classList.toggle('narrow', this.#narrow);
      this.shadowRoot.addEventListener('click', (e) => this.#surClic(e));

      if (this.isConnected) this.#arretHorloge = demarrerHorloge(this.shadowRoot);
      this.#afficherVue();
      return true;
    } catch (e) {
      console.error('Panneau Maison :', e);
      this.shadowRoot.replaceChildren(el('p', { style: 'padding:24px; color:#E74C3C; font-family:sans-serif' },
        `Impossible de charger le panneau : ${e.message}`));
      return false;
    }
  }

  // ---- NAVIGATION ----

  #cleCourante() {
    return (this.#route?.path ?? '').split('/')[1] ?? '';
  }

  #naviguer(cle) {
    const prefixe = this.#route?.prefix ?? '';
    history.pushState(null, '', cle ? `${prefixe}/${cle}` : prefixe);
    // Événement écouté par Home Assistant, qui renverra une nouvelle `route`
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    this.#route = { prefix: prefixe, path: cle ? `/${cle}` : '' };
    this.#afficherVue();
  }

  #surClic(e) {
    const lien = e.target.closest('[data-vue]');
    if (lien) {
      e.preventDefault();
      this.#naviguer(lien.dataset.vue);
      return;
    }
    if (e.target.closest('[data-action="menu-ha"]')) {
      // Demande à Home Assistant d'ouvrir son menu latéral
      this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }));
    }
  }

  async #afficherVue() {
    const cle = this.#cleCourante();
    if (cle === this.#cleVue || !this.isConnected) return;
    this.#cleVue = cle;

    this.#vue?.detruire?.();
    this.#vue = null;

    const prefixe = this.#route?.prefix ?? '';
    this.shadowRoot.querySelectorAll('#sidebar [data-vue]').forEach((lien) => {
      lien.classList.toggle('active', lien.dataset.vue === cle);
      lien.setAttribute('href', lien.dataset.vue ? `${prefixe}/${lien.dataset.vue}` : prefixe || '/');
    });

    const conteneur = this.shadowRoot.getElementById('vue');
    const def = VUES[cle] ?? { titre: 'Page introuvable' };

    try {
      const module = await (def.charger ?? VUE_A_VENIR)();
      const vue = await module.monter({ config: this.#config, titre: def.titre });

      // L'utilisateur a pu changer de vue pendant le chargement
      if (this.#cleVue !== cle) {
        vue.detruire?.();
        return;
      }
      this.#vue = vue;
      conteneur.replaceChildren(vue.racine);
      if (this.#hass) vue.maj?.(this.#hass);
    } catch (e) {
      console.error(`Vue "${cle}" :`, e);
      if (this.#cleVue === cle) conteneur.replaceChildren(el('p', { class: 'cal-empty' }, 'Vue indisponible.'));
    }
  }

  // ---- MISE À JOUR DES ÉTATS ----

  #majHass() {
    const hass = this.#hass;
    const racine = this.shadowRoot;

    const indicateur = racine.getElementById('ha-indicator');
    indicateur.classList.toggle('offline', !hass.connected);
    indicateur.title = hass.connected ? 'Home Assistant connecté' : 'Home Assistant hors ligne';

    // Nom de la maison défini dans HA (Paramètres → Système → Général)
    racine.getElementById('greeting-name').textContent = hass.config.location_name;

    const idsPresences = this.#config.PRESENCES.map((p) => p.id);
    if (aChange(this.#hassShell, hass, idsPresences)) {
      racine.getElementById('presence-chips').replaceChildren(...this.#config.PRESENCES.map((p) => {
        const present = estPresent(hass, p.id);
        return el('div', { class: present ? 'chip chip-green' : 'chip chip-red' },
          el('span', { class: present ? 'dot dot-green' : 'dot dot-red' }),
          `${nom(hass, p.id, p.nom)} — ${present ? 'À la maison' : 'Absent'}`);
      }));
    }
    this.#hassShell = hass;

    this.#vue?.maj?.(hass);
  }
}

if (!customElements.get('smarthome-panel')) {
  customElements.define('smarthome-panel', SmarthomePanel);
}
