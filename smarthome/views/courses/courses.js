// =============================================
// COURSES.JS — Vue Liste de courses
// =============================================
// Liste : une entité todo.* (config COURSES.liste), partagée avec l'application HA et le Menu.
// Articles au format commun (js/courses.js) : un article ajouté ici et le même ingrédient
// envoyé par le Menu s'additionnent. Affichage en nœuds texte ; aucun stockage navigateur.
// Dernières courses et comparateur : commandes maison/courses/* de l'intégration. Tant qu'elles
// n'existent pas (intégration pas encore à jour), leurs cartes et « Terminer les courses » restent masqués.

import { ajouterStyle, chargerGabarit, el, remplacer } from '../../js/dom.js';
import {
  aChange, coursesAjouter, coursesAjouterPassage, coursesComparer, coursesHistorique, coursesMagasins, coursesModifier,
  coursesPrix, coursesRetirerArticles, coursesRetirerCoches, menuLire, menuVersCourses, tachesLire, tacheStatut,
} from '../../js/ha.js';
import {
  descriptionArticle, lireArticles, nettoyerNom, QUANTITE_MAX, quantiteAffichee, RAYONS, titreArticle, trouverDoublon, UNITES,
} from '../../js/courses.js';

const QUANTITE_MIN = 1;
const QUANTITE_SAISIE_MAX = 9999;   // grammes et millilitres compris
const CONFIRMATION_MS = 5000;
const JOURS_REPAS = 5;
const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
// Repas affiché par jour dans la carte : le plus consistant disponible
const PRIORITE_REPAS = ['diner', 'dejeuner', 'petit_dej'];   // les jus ne remplacent pas un repas

const PRIX_MAX = 9999;
const HISTORIQUE = 5;

const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
const ilYA = (jours) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toLocaleDateString('sv-SE');
};
const euros = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
// Montant saisi : nombre de 0 à max (virgule acceptée), sinon null
const lireMontant = (texte, max) => {
  const n = Number(String(texte).replace(',', '.'));
  return texte !== '' && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};
const dateLocale = (texte) => {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
};
// Comparaison de recherche : sans accents ni casse
const simplifier = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export async function monter({ config, naviguer } = {}) {
  const entite = config.COURSES?.liste ?? 'todo.courses';

  const racine = el('div', { class: 'vue-courses' });
  racine.append(await chargerGabarit(new URL('./courses.html', import.meta.url)));
  ajouterStyle(racine, new URL('./courses.css', import.meta.url));
  const $ = (id) => racine.querySelector(`#${id}`);
  const formulaire = $('crs-formulaire');
  const coche = new URL('../../assets/icons/courses/coche.svg', import.meta.url).href;

  // Messages sous « Retirer du panier » et « Ajouter les ingrédients »
  const bilanListe = el('p', { class: 'crs-message', role: 'status' });
  racine.querySelector('.crs-carte-entete').after(bilanListe);
  const bilanRepas = el('p', { class: 'crs-message', role: 'status' });
  racine.querySelector('[data-action="generer-depuis-repas"]').after(bilanRepas);

  let hass = null;
  let articles = [];
  let menu = null;
  let charge = false;
  let erreurListe = false;
  let magasins = null;       // null : commandes maison/courses/* indisponibles
  let historique = [];
  let comparaison = null;
  let cochesTerminer = [];   // articles cochés au moment d'ouvrir « Terminer les courses »
  const confirmations = {};   // action → minuteur du second appui
  const enCours = new Set();  // uid en attente de réponse de HA

  // ---- LISTE ----

  function rendreListe() {
    const recherche = simplifier($('crs-recherche').value.trim());
    const visibles = articles.filter((a) => !recherche || simplifier(a.nom).includes(recherche));
    const aAcheter = articles.filter((a) => !a.terminee).length;
    const panier = articles.length - aAcheter;
    remplacer($('crs-compteur'), el('b', {}, String(aAcheter)), ` à acheter · ${panier} dans le panier`);
    racine.querySelector('[data-action="retirer-coches"]').disabled = panier === 0;
    $('crs-bouton-terminer').hidden = !magasins || panier === 0;

    if (!visibles.length) {
      let texte = 'La liste est vide.';
      if (!charge) texte = 'Chargement…';
      else if (erreurListe) texte = 'Liste de courses indisponible. Vérifiez COURSES.liste dans la config.';
      else if (recherche) texte = 'Aucun article ne correspond.';
      remplacer($('crs-rayons'), el('p', { class: 'crs-message' }, texte));
      return;
    }

    // Un bloc par rayon, dans l'ordre des rayons ; à acheter d'abord, puis dans le panier
    const blocs = Object.entries(RAYONS).map(([rayon, libelle]) => {
      const duRayon = visibles.filter((a) => a.rayon === rayon)
        .sort((a, b) => (a.terminee - b.terminee) || a.nom.localeCompare(b.nom, 'fr'));
      if (!duRayon.length) return null;
      return el('div', { class: 'crs-rayon' },
        el('h3', { class: 'crs-rayon-titre' },
          el('span', {}, libelle),
          el('span', { class: 'crs-rayon-nombre' }, String(duRayon.filter((a) => !a.terminee).length))),
        ...duRayon.map((a) => el('button', {
          class: 'crs-article', role: 'checkbox', 'aria-checked': String(a.terminee),
          'data-action': 'cocher', 'data-uid': a.uid, disabled: enCours.has(a.uid),
        },
        el('span', { class: 'crs-case' }, a.terminee && el('img', { src: coche, width: 10, height: 10, alt: '' })),
        el('span', { class: 'crs-article-nom' }, a.nom),
        quantiteAffichee(a) && el('span', { class: 'crs-quantite' }, quantiteAffichee(a)))));
    });
    remplacer($('crs-rayons'), ...blocs);
  }

  async function chargerListe() {
    if (!hass) return;
    try {
      articles = lireArticles(await tachesLire(hass, entite));
      erreurListe = false;
    } catch (e) {
      erreurListe = true;
      console.warn('Courses : liste illisible', entite, e?.message ?? '');
    }
    charge = true;
    rendreListe();
    majDoublon();
  }

  async function cocher(bouton) {
    const article = articles.find((a) => a.uid === bouton.dataset.uid);
    if (!article || enCours.has(article.uid)) return;
    enCours.add(article.uid);
    article.terminee = !article.terminee;   // affichage immédiat, confirmé par la relecture
    rendreListe();
    try {
      await tacheStatut(hass, entite, article.uid, article.terminee);
    } catch (e) {
      article.terminee = !article.terminee;
      console.warn('Courses : article non modifié', e?.message ?? '');
    } finally {
      enCours.delete(article.uid);
      chargerListe();
    }
  }

  // Actions groupées : un premier appui demande confirmation sur place (pas de fenêtre du navigateur)
  function confirmer(action, zone, question, executer) {
    if (confirmations[action]) {
      clearTimeout(confirmations[action]);
      delete confirmations[action];
      executer();
      return;
    }
    zone.textContent = question;
    confirmations[action] = setTimeout(() => {
      delete confirmations[action];
      zone.textContent = '';
    }, CONFIRMATION_MS);
  }

  async function retirerCoches(bouton) {
    bouton.disabled = true;
    try {
      await coursesRetirerCoches(hass, entite);
      bilanListe.textContent = 'Articles du panier retirés.';
    } catch (e) {
      bilanListe.textContent = 'Impossible de retirer les articles. Réessayez.';
      console.warn('Courses : retrait refusé', e?.message ?? '');
    } finally {
      chargerListe();
    }
  }

  // ---- IMPRESSION / PDF ----
  // Les articles à acheter, par rayon, dans un cadre invisible construit nœud par nœud,
  // puis la fenêtre d'impression de la tablette (qui propose « Enregistrer en PDF »).
  function imprimer() {
    const aAcheter = articles.filter((a) => !a.terminee);
    if (!aAcheter.length) {
      bilanListe.textContent = 'Rien à imprimer : tout est déjà dans le panier.';
      return;
    }
    racine.querySelector('.crs-impression')?.remove();
    const cadre = el('iframe', {
      class: 'crs-impression', title: 'Liste à imprimer', 'aria-hidden': 'true', tabindex: '-1',
      style: 'position:fixed; width:0; height:0; border:0;',
    });
    racine.append(cadre);
    const doc = cadre.contentDocument;
    const noeud = (tag, texte, classe) => {
      const n = doc.createElement(tag);
      if (texte) n.textContent = texte;
      if (classe) n.className = classe;
      return n;
    };
    doc.title = 'Liste de courses';
    const style = noeud('style', `
      body { margin: 14mm; font: 14px/1.5 sans-serif; color: #000; }
      h1 { margin: 0 0 2px; font-size: 20px; }
      p { margin: 0 0 10px; color: #444; }
      h2 { margin: 14px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #999; font-size: 15px; }
      ul { margin: 0; padding: 0; list-style: none; columns: 2; }
      li { padding: 2px 0; break-inside: avoid; }
      li::before { content: "±0  "; }
      .q { color: #555; }`);
    doc.head.append(style);
    const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    doc.body.append(noeud('h1', 'Liste de courses'),
      noeud('p', `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${aAcheter.length} article${aAcheter.length > 1 ? 's' : ''}`));
    for (const [rayon, libelle] of Object.entries(RAYONS)) {
      const duRayon = aAcheter.filter((a) => a.rayon === rayon).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      if (!duRayon.length) continue;
      const liste = noeud('ul');
      for (const a of duRayon) {
        const ligne = noeud('li', a.nom);
        if (quantiteAffichee(a)) ligne.append(noeud('span', ` — ${quantiteAffichee(a)}`, 'q'));
        liste.append(ligne);
      }
      doc.body.append(noeud('h2', libelle), liste);
    }
    cadre.contentWindow.focus();
    cadre.contentWindow.print();
  }

  // ---- DERNIÈRES COURSES ET COMPARATEUR ----

  async function chargerComparateur() {
    if (!hass) return;
    try {
      magasins = await coursesMagasins(hass);
      [historique, comparaison] = await Promise.all([coursesHistorique(hass, HISTORIQUE), coursesComparer(hass)]);
    } catch (e) {
      // Intégration sans ces commandes (ou non configurée) : les cartes restent masquées
      magasins = null;
      console.warn('Courses : comparateur indisponible', e?.code ?? '');
    }
    rendreComparateur();
    rendreHistorique();
    rendreListe();
  }

  const nomMagasin = (id) => magasins?.find((m) => m.id === id)?.nom ?? 'Magasin retiré';

  function rendreComparateur() {
    $('crs-carte-comparateur').hidden = !magasins;
    if (!magasins) return;
    const c = comparaison;
    const pret = Boolean(c?.meilleur && c.magasins?.length);
    $('crs-comparateur').hidden = !pret;
    $('crs-comparateur-vide').hidden = pret;
    if (!pret) return;
    $('crs-gagnant-nom').textContent = nomMagasin(c.meilleur);
    $('crs-gagnant-ecart').textContent = [
      Number.isFinite(c.economie_pct) ? `${euros(c.economie_pct)} % moins cher` : '',
      Number.isFinite(c.economie_euros) && c.economie_euros > 0 ? `environ ${euros(c.economie_euros)} € d'économie par passage` : '',
    ].filter(Boolean).join(', ');
    // Indice affiché : 100 = le moins cher ; la barre = 100 / indice
    const minimum = Math.min(...c.magasins.map((m) => m.indice).filter((i) => i > 0));
    remplacer($('crs-classement'), ...c.magasins.filter((m) => m.indice > 0).map((m) => {
      const indice = Math.round((m.indice / minimum) * 100);
      return el('li', { class: m.id === c.meilleur ? 'crs-premier' : null },
        el('span', { class: 'crs-classement-nom' }, nomMagasin(m.id)),
        el('span', { class: 'crs-indice-barre' }, el('span', { style: `width: ${Math.round(10000 / indice)}%` })),
        el('b', {}, String(indice)),
        el('span', { class: 'crs-classement-nb' }, `${m.articles_comparables} art.`));
    }));
    $('crs-couverture').textContent = Number.isFinite(c.couverture)
      ? `Comparé sur ${c.comparables} article${c.comparables > 1 ? 's' : ''}, ${Math.round(c.couverture * 100)} % du panier.`
      : '';
  }

  // Sans montant : les totaux ne se lisent qu'avec le code, dans la page Budget
  function rendreHistorique() {
    $('crs-carte-historique').hidden = !magasins;
    if (!magasins) return;
    $('crs-historique-vide').hidden = historique.length > 0;
    remplacer($('crs-historique'), ...historique.map((p) => {
      const date = dateLocale(p.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return el('div', { class: 'crs-passage' },
        el('span', { class: 'crs-passage-texte' },
          el('b', {}, typeof p.nom_magasin === 'string' ? p.nom_magasin : nomMagasin(p.magasin)),
          el('span', {}, `${date.charAt(0).toUpperCase()}${date.slice(1)}`)),
        el('span', { class: 'crs-passage-nb' }, `${p.articles} article${p.articles > 1 ? 's' : ''}`));
    }));
  }

  // ---- TERMINER LES COURSES ----

  const formTerminer = $('crs-terminer');

  function ouvrirTerminer() {
    cochesTerminer = articles.filter((a) => a.terminee);
    if (!magasins || !cochesTerminer.length) return;
    formTerminer.reset();
    remplacer($('crs-terminer-magasins'), ...magasins.map((m, i) =>
      el('label', {}, el('input', { type: 'radio', name: 'magasin', value: m.id, checked: i === 0 }), el('span', {}, m.nom))));
    const champDate = formTerminer.elements.date;
    champDate.value = aujourdhui();
    champDate.max = aujourdhui();
    champDate.min = ilYA(365);
    const n = cochesTerminer.length;
    $('crs-terminer-nombre').textContent = `${n} article${n > 1 ? 's' : ''}`;
    remplacer($('crs-terminer-articles'), ...cochesTerminer.map((a) =>
      el('label', { class: 'crs-ligne-prix' },
        el('span', { class: 'crs-ligne-prix-nom' }, el('b', {}, a.nom), el('span', {}, quantiteAffichee(a))),
        el('span', { class: 'crs-saisie-euros' },
          el('input', {
            type: 'number', name: 'prix', 'data-uid': a.uid, inputmode: 'decimal', min: 0, max: PRIX_MAX, step: '0.01',
            placeholder: '0,00', 'aria-label': `Prix de ${a.nom}`,
          }),
          el('span', {}, '€')))));
    $('crs-terminer-message').textContent = '';
    $('crs-terminer-actions').hidden = false;
    $('crs-terminer-fin').hidden = true;
    $('crs-terminer-voile').hidden = false;
    preremplirPrix();
  }

  // Derniers prix connus dans le magasin choisi : proposés en gris, remplacés à la première saisie
  async function preremplirPrix() {
    const magasin = formTerminer.querySelector('input[name="magasin"]:checked')?.value;
    formTerminer.querySelectorAll('.crs-prix-connu').forEach((ligne) => {
      ligne.classList.remove('crs-prix-connu');
      ligne.querySelector('input').value = '';
    });
    if (!magasin || magasin === 'autre') return;
    try {
      const connus = await coursesPrix(hass, magasin, cochesTerminer.map((a) => a.nom));
      for (const a of cochesTerminer) {
        const prix = connus?.[a.nom]?.prix;
        const champ = formTerminer.querySelector(`input[name="prix"][data-uid="${CSS.escape(a.uid)}"]`);
        if (!champ || champ.value !== '' || !Number.isFinite(prix)) continue;
        champ.value = String(prix);
        champ.closest('.crs-ligne-prix').classList.add('crs-prix-connu');
      }
    } catch (e) {
      console.warn('Courses : derniers prix indisponibles', e?.code ?? '');
    }
  }

  async function enregistrerPassage() {
    const message = $('crs-terminer-message');
    const magasin = formTerminer.querySelector('input[name="magasin"]:checked')?.value;
    const date = formTerminer.elements.date.value;
    if (!magasins.some((m) => m.id === magasin)) {
      message.textContent = 'Choisissez un magasin.';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhui() || date < ilYA(365)) {
      message.textContent = 'Date invalide : dans l\'année écoulée, pas dans le futur.';
      return;
    }
    const passage = {
      magasin,
      date,
      total: lireMontant(formTerminer.elements.total.value, PRIX_MAX),
      articles: cochesTerminer.map((a) => ({
        nom: a.nom.slice(0, 60),
        quantite: Math.min(QUANTITE_MAX, a.quantite),
        unite: a.unite,
        prix: lireMontant(formTerminer.querySelector(`input[name="prix"][data-uid="${CSS.escape(a.uid)}"]`)?.value ?? '', PRIX_MAX),
      })),
    };
    const bouton = formTerminer.querySelector('button[type="submit"]');
    bouton.disabled = true;
    message.textContent = 'Enregistrement…';
    try {
      await coursesAjouterPassage(hass, passage);
      message.textContent = '';
      $('crs-terminer-actions').hidden = true;
      const n = cochesTerminer.length;
      remplacer($('crs-terminer-fin').querySelector('p'), el('b', {}, 'Courses enregistrées.'),
        n > 1 ? ` Retirer les ${n} articles cochés de la liste ?` : ' Retirer l\'article coché de la liste ?');
      $('crs-terminer-fin').hidden = false;
      chargerComparateur();
    } catch (e) {
      message.textContent = e?.code === 'passage_invalide'
        ? 'Passage refusé : vérifiez le magasin, la date et les montants.'
        : 'Enregistrement impossible. Réessayez.';
      console.warn('Courses : passage refusé', e?.code ?? '');
    } finally {
      bouton.disabled = false;
    }
  }

  async function retirerApresTerminer(bouton) {
    bouton.disabled = true;
    try {
      await coursesRetirerArticles(hass, entite, cochesTerminer.map((a) => a.uid));
    } catch (e) {
      console.warn('Courses : retrait refusé', e?.message ?? '');
    } finally {
      bouton.disabled = false;
      fermerTerminer();
      chargerListe();
    }
  }

  function fermerTerminer() {
    $('crs-terminer-voile').hidden = true;
    cochesTerminer = [];
  }

  formTerminer.addEventListener('change', (e) => {
    if (e.target.name === 'magasin') preremplirPrix();
  });
  formTerminer.addEventListener('input', (e) => {
    if (e.target.name === 'prix') e.target.closest('.crs-ligne-prix')?.classList.remove('crs-prix-connu');
  });
  formTerminer.addEventListener('submit', (e) => {
    e.preventDefault();
    enregistrerPassage();
  });

  // ---- AJOUT D'UN ARTICLE ----

  const choix = (nom, liste, defaut) => {
    const valeur = formulaire.querySelector(`input[name="${nom}"]:checked`)?.value;
    return liste.includes(valeur) ? valeur : defaut;
  };

  function lireFormulaire() {
    const quantite = Number.parseInt(formulaire.elements.quantite.value, 10);
    return {
      nom: nettoyerNom(formulaire.elements.nom.value),
      quantite: Math.min(QUANTITE_SAISIE_MAX, Math.max(QUANTITE_MIN, Number.isFinite(quantite) ? quantite : QUANTITE_MIN)),
      unite: choix('unite', UNITES, 'piece'),
      rayon: choix('rayon', Object.keys(RAYONS), 'autre'),
    };
  }

  // « Déjà sur la liste » : la quantité sera ajoutée à l'article existant
  function majDoublon() {
    if ($('crs-voile').hidden) return;
    const { nom, unite } = lireFormulaire();
    const doublon = nom ? trouverDoublon(articles, nom, unite) : null;
    $('crs-doublon').hidden = !doublon;
    if (doublon) $('crs-doublon').querySelector('b').textContent = doublon.titre;
  }

  function afficherFormulaire(visible) {
    $('crs-voile').hidden = !visible;
    if (!visible) return;
    formulaire.reset();
    $('crs-doublon').hidden = true;
    $('crs-formulaire-message').textContent = '';
    formulaire.elements.nom.focus();
  }

  function changerQuantite(pas) {
    const champ = formulaire.elements.quantite;
    const valeur = Number.parseInt(champ.value, 10) || QUANTITE_MIN;
    champ.value = Math.min(QUANTITE_SAISIE_MAX, Math.max(QUANTITE_MIN, valeur + pas));
  }

  async function ajouter() {
    const { nom, quantite, unite, rayon } = lireFormulaire();
    const message = $('crs-formulaire-message');
    if (!nom) {
      message.textContent = 'Indiquez un article.';
      return;
    }
    const bouton = formulaire.querySelector('button[type="submit"]');
    bouton.disabled = true;
    message.textContent = 'Ajout…';
    try {
      const doublon = trouverDoublon(articles, nom, unite);
      if (doublon) {
        // Même article déjà à acheter : quantités additionnées, rayon et origine conservés
        const total = Math.min(QUANTITE_MAX, doublon.quantite + quantite);
        await coursesModifier(hass, entite, doublon.uid, titreArticle(doublon.nom, total, unite),
          descriptionArticle(total, unite, doublon.rayon, doublon.source ?? 'manuel'));
      } else {
        await coursesAjouter(hass, entite, titreArticle(nom, quantite, unite), descriptionArticle(quantite, unite, rayon));
      }
      afficherFormulaire(false);
      chargerListe();
    } catch (e) {
      message.textContent = 'Ajout impossible. Réessayez.';
      console.warn('Courses : ajout refusé', e?.message ?? '');
    } finally {
      bouton.disabled = false;
    }
  }

  // ---- REPAS À VENIR (section Menu) ----

  function rendreRepas() {
    const jourJ = aujourdhui();
    const jours = (menu?.jours ?? []).filter((j) => j.date >= jourJ).slice(0, JOURS_REPAS);
    const lignes = jours.map((jour) => {
      const repas = PRIORITE_REPAS.find((r) => menu.recettes[jour.repas[r]?.recette]);
      if (!repas) return null;
      return el('div', { class: 'crs-repas-jour' },
        el('span', {}, JOURS_COURTS[dateLocale(jour.date).getDay()]),
        el('b', {}, menu.recettes[jour.repas[repas].recette].nom));
    }).filter(Boolean);
    racine.querySelector('[data-action="generer-depuis-repas"]').disabled = !lignes.length;
    if (lignes.length) remplacer($('crs-repas'), ...lignes);
    else {
      remplacer($('crs-repas'),
        el('p', { class: 'crs-message' }, 'Pas de menu à venir.'),
        el('button', { class: 'crs-bouton', 'data-action': 'aller-menu' }, 'Préparer le menu'));
    }
  }

  async function chargerMenu() {
    if (!hass) return;
    try {
      menu = await menuLire(hass);
    } catch (e) {
      menu = null;   // intégration non configurée : la carte propose d'aller au Menu
      console.warn('Courses : menu illisible', e?.code ?? '');
    }
    rendreRepas();
  }

  async function ajouterIngredients(bouton) {
    bouton.disabled = true;
    bilanRepas.textContent = 'Ajout en cours…';
    try {
      const { ajoutes, fusionnes } = await menuVersCourses(hass);
      const s = ajoutes > 1 ? 's' : '';
      bilanRepas.textContent = `${[`${ajoutes} article${s} ajouté${s}`, fusionnes && `${fusionnes} déjà sur la liste (quantité mise à jour)`]
        .filter(Boolean).join(', ')}.`;
    } catch (e) {
      bilanRepas.textContent = e?.code === 'courses_non_configure'
        ? 'Liste de courses non configurée dans le générateur de menu.'
        : 'Ajout impossible. Réessayez.';
      console.warn('Courses : ingrédients du menu refusés', e?.code ?? '');
    } finally {
      bouton.disabled = false;
      chargerListe();
    }
  }

  // ---- ÉVÉNEMENTS ----

  $('crs-recherche').addEventListener('input', rendreListe);
  formulaire.addEventListener('input', majDoublon);
  formulaire.addEventListener('change', majDoublon);
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    ajouter();
  });

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (cible?.disabled) return;
    switch (cible?.dataset.action) {
      case 'ouvrir-ajout': afficherFormulaire(true); break;
      case 'fermer-ajout': afficherFormulaire(false); break;
      case 'quantite-moins': changerQuantite(-1); majDoublon(); break;
      case 'quantite-plus': changerQuantite(1); majDoublon(); break;
      case 'cocher': cocher(cible); break;
      case 'imprimer': imprimer(); break;
      case 'retirer-coches': {
        const n = articles.filter((a) => a.terminee).length;
        confirmer('retirer', bilanListe, `Appuyez encore pour retirer ${n} article${n > 1 ? 's' : ''} du panier.`, () => retirerCoches(cible));
        break;
      }
      case 'generer-depuis-repas':
        confirmer('repas', bilanRepas, 'Appuyez encore pour ajouter les ingrédients du menu à la liste.', () => ajouterIngredients(cible));
        break;
      case 'aller-menu': naviguer?.('menu'); break;
      case 'deverrouiller-budget': naviguer?.('budget'); break;
      case 'ouvrir-terminer': ouvrirTerminer(); break;
      case 'fermer-terminer': fermerTerminer(); break;
      case 'terminer-retirer': retirerApresTerminer(cible); break;
      default:
        if (e.target === $('crs-voile')) afficherFormulaire(false);   // toucher le fond ferme la fenêtre
        else if (e.target === $('crs-terminer-voile')) fermerTerminer();
    }
  });

  rendreListe();
  rendreRepas();

  return {
    racine,
    maj(nouveau) {
      const precedent = hass;
      hass = nouveau;
      if (!precedent) {
        chargerListe();
        chargerMenu();
        chargerComparateur();
        return;
      }
      // L'état d'une entité todo change à chaque modification (ici, dans l'appli HA ou par le Menu)
      if (aChange(precedent, hass, [entite])) chargerListe();
    },
    detruire() {
      Object.values(confirmations).forEach(clearTimeout);
      racine.querySelector('.crs-impression')?.remove();
    },
  };
}
