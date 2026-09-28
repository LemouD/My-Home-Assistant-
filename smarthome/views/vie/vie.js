// =============================================
// VIE.JS — Onglet Vie : maison et bien-être
// =============================================
// Sous-pages (chemin après « vie/ ») :
//   ''              vue principale
//   piece/<id>      détail d'une pièce (lumières)
//   bien-etre       bien-être & spiritualité (matin, après-midi ou soir selon l'heure)
//   decouvrir       parcours guidé
//   rituel          rituel du soir
// Chaque page est un module qui exporte monter({ config, parametre, naviguer }).

import { ajouterStyle, el, remplacer } from '../../js/dom.js';

const PAGES = {
  '':          () => import('./pages/accueil.js'),
  piece:       () => import('./pages/piece.js'),
  'bien-etre': () => import('./pages/bien-etre.js'),
  decouvrir:   () => import('./pages/decouvrir.js'),
  rituel:      () => import('./pages/rituel.js'),
};

export async function monter({ config, sousChemin, naviguer }) {
  const racine = el('div', { class: 'vue-vie' });
  const conteneur = el('div', { class: 'vie-page', id: 'page-content' });
  racine.append(conteneur);
  ajouterStyle(racine, new URL('./vie.css', import.meta.url));

  let hass = null;
  let page = null;
  let demande = 0;   // ignore une page arrivée après une navigation plus récente

  async function afficher(chemin) {
    const numero = ++demande;
    const [cle, ...reste] = (chemin ?? '').split('/');
    page?.detruire?.();
    page = null;

    try {
      const module = await (PAGES[cle] ?? PAGES[''])();
      const nouvelle = await module.monter({ config, parametre: reste.join('/'), naviguer });
      if (numero !== demande) {
        nouvelle.detruire?.();
        return;
      }
      page = nouvelle;
      remplacer(conteneur, page.racine);
      conteneur.scrollTop = 0;
      if (hass) page.maj?.(hass);
    } catch (e) {
      console.error(`Vie, page « ${chemin} » :`, e);
      if (numero === demande) remplacer(conteneur, el('p', { class: 'vie-vide' }, 'Page indisponible.'));
    }
  }

  await afficher(sousChemin);

  return {
    racine,
    maj(nouveau) {
      hass = nouveau;
      page?.maj?.(hass);
    },
    changerSousPage: afficher,
    detruire() {
      demande++;
      page?.detruire?.();
    },
  };
}
