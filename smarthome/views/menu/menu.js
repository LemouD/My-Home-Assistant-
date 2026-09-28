// =============================================
// MENU.JS — Section Menu (semaine, générer, recette)
// =============================================
// Tout passe par l'intégration « maison » (maison/menu/*) : le panneau ne contacte jamais
// le générateur. Sous-pages : « menu » (semaine), « menu/generer », « menu/recette/<date>/<repas> ».
// Affichage en nœuds texte uniquement ; aucun stockage navigateur.

import { ajouterStyle, chargerGabarit, el, remplacer } from '../../js/dom.js';
import { menuEtat, menuGenerer, menuLire, menuRemplacer, menuVersCourses } from '../../js/ha.js';

const PERSONNES_MIN = 1;
const PERSONNES_MAX = 12;
const SUIVI_MS = 15_000;          // relecture pendant une génération (lancée ici ou ailleurs)

const REPAS = { petit_dej: 'Petit-déjeuner', jus: 'Jus', dejeuner: 'Déjeuner', diner: 'Dîner' };
// Heure à partir de laquelle un repas du jour n'est plus « à venir » (recette mise en avant)
const FIN_REPAS = { petit_dej: 10, jus: 17, dejeuner: 14, diner: 24 };
const ALLERGIES = {
  gluten: 'Gluten', lactose: 'Lactose', arachide: 'Arachide', 'fruits-a-coque': 'Fruits à coque', oeuf: 'Œuf',
  poisson: 'Poisson', crustaces: 'Crustacés', soja: 'Soja', sesame: 'Sésame',
};
const RAYONS = {
  'fruits-legumes': 'Fruits & légumes', boucherie: 'Boucherie', poissonnerie: 'Poissonnerie', cremerie: 'Crèmerie',
  boulangerie: 'Boulangerie', epicerie: 'Épicerie', surgeles: 'Surgelés', boissons: 'Boissons',
  entretien: 'Entretien', hygiene: 'Hygiène', autre: 'Autre',
};
const UNITES = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', piece: 'pièce', cas: 'c. à s.', cac: 'c. à c.',
  pincee: 'pincée', botte: 'botte', tranche: 'tranche', boite: 'boîte', autre: '',
};
const UNITES_PLURIEL = ['piece', 'pincee', 'botte', 'tranche', 'boite'];
const MOTIFS = {
  halal: 'Ne respectait pas le halal',
  allergie: 'Contenait un allergène exclu',
  invalide: 'Recette incomplète',
};
const ERREURS = {
  non_configure: ['Générateur non configuré', 'À régler dans Home Assistant : Maison → Configurer → Générateur de menu.'],
  quota_atteint: ['Plus de génération disponible aujourd\'hui', 'Le quota se renouvelle demain.'],
  generation_en_cours: ['Génération déjà en cours', 'Le menu s\'affichera ici dès qu\'il sera prêt.'],
  generation_indisponible: ['Générateur indisponible', 'Réessayez dans quelques minutes.'],
  generation_invalide: ['Menu refusé', 'Trop de plats non conformes ou incomplets. Réessayez.'],
  menu_absent: ['Aucun menu', 'Générez d\'abord un menu.'],
  courses_non_configure: ['Liste de courses non configurée', 'À régler dans Home Assistant : Maison → Configurer → Générateur de menu.'],
  parametres_invalides: ['Choix invalides', 'Vérifiez les jours, les repas et le nombre de personnes.'],
};
const texteErreur = (e) => ERREURS[e?.code] ?? ['Erreur', 'L\'action n\'a pas abouti. Réessayez.'];

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const majuscule = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
const dateLocale = (texte) => {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
};
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');   // AAAA-MM-JJ, heure locale

// « 500 g », « 2 pièces », « 1 c. à s. » ; quantité 0 : « selon le goût »
function quantite(ingredient) {
  if (!ingredient.quantite) return 'selon le goût';
  const nombre = String(Number(ingredient.quantite.toFixed(2))).replace('.', ',');
  const unite = UNITES[ingredient.unite] ?? '';
  if (!unite) return nombre;
  const s = UNITES_PLURIEL.includes(ingredient.unite) && ingredient.quantite > 1 ? 's' : '';
  return `${nombre} ${unite}${s}`;
}

export async function monter({ sousChemin = '', naviguer } = {}) {
  const racine = el('div', { class: 'vue-menu' });
  racine.append(await chargerGabarit(new URL('./menu.html', import.meta.url)));
  ajouterStyle(racine, new URL('./menu.css', import.meta.url));
  const $ = (id) => racine.querySelector(`#${id}`);
  const formulaire = $('menu-formulaire');

  // Bilan de « Tout ajouter aux courses », sous le bouton
  const bilanSemaine = el('p', { class: 'menu-aide', role: 'status' });
  racine.querySelector('[data-action="vers-courses"]').after(bilanSemaine);

  let hass = null;
  let etat = null;          // { configure, repas, quota: { utilise, max }, enCours }
  let menu = null;
  let charge = false;       // première lecture terminée
  let erreur = null;        // dernière erreur, affichée sur la semaine
  let chemin = sousChemin;
  let suivi = null;
  let action = false;       // une action serveur lancée depuis cette tablette est en cours
  let confirmation = null;  // « Tout ajouter » : second appui attendu jusqu'à ce minuteur

  const restant = () => (etat ? Math.max(0, etat.quota.max - etat.quota.utilise) : 0);
  const texteRestant = () => `${restant()} restant${restant() > 1 ? 's' : ''}`;
  const recetteDe = (creneau) => (creneau?.recette ? menu?.recettes?.[creneau.recette] : null);

  // ---- NAVIGATION ----

  const aller = (sousPage) => {
    const cible = sousPage ? `menu/${sousPage}` : 'menu';
    if (naviguer) naviguer(cible);
    else afficher(sousPage);
  };

  function afficher(nouveauChemin = '') {
    chemin = nouveauChemin;
    const [page, date, repas] = chemin.split('/');
    const sousPage = ['generer', 'recette'].includes(page) ? page : 'semaine';
    racine.querySelectorAll('[data-sous-page]').forEach((section) => {
      section.hidden = section.dataset.sousPage !== sousPage;
    });
    if (sousPage === 'generer') preparerFormulaire();
    else if (sousPage === 'recette') rendreRecette(date, repas);
    else rendreSemaine();
  }

  // ---- SEMAINE ----

  // Recette mise en avant : le prochain repas à venir, sinon le premier plat du menu
  function vedette() {
    const ordre = menu.parametres.repas;
    const jourJ = aujourdhui();
    const heure = new Date().getHours();
    const candidats = [];
    for (const jour of menu.jours) {
      if (jour.date < jourJ) continue;
      for (const r of ordre) if (jour.date > jourJ || heure < FIN_REPAS[r]) candidats.push([jour, r]);
    }
    for (const jour of menu.jours) for (const r of ordre) candidats.push([jour, r]);
    return candidats.find(([j, r]) => recetteDe(j.repas[r]));
  }

  function libelleMoment(date, repas) {
    if (date === aujourdhui()) return repas === 'diner' ? 'Ce soir · Dîner' : `Aujourd'hui · ${REPAS[repas]}`;
    return `${majuscule(dateLocale(date).toLocaleDateString('fr-FR', { weekday: 'long' }))} · ${REPAS[repas]}`;
  }

  // Un seul état visible : en cours, erreur, ou quota épuisé
  function rendreEtats() {
    const enCours = Boolean(etat?.enCours) || action;
    $('menu-etat-encours').hidden = !enCours;
    $('menu-etat-indispo').hidden = enCours || !erreur;
    $('menu-etat-quota').hidden = enCours || Boolean(erreur) || !etat || restant() > 0;
    if (erreur) {
      const [titre, texte] = texteErreur(erreur);
      $('menu-erreur-titre').textContent = titre;
      $('menu-erreur-texte').textContent = texte;
    }
    $('menu-quota').textContent = etat ? `${restant()} sur ${etat.quota.max}` : '—';
    racine.querySelectorAll('[data-action="aller-generer"]').forEach((b) => { b.disabled = enCours; });
  }

  function rendreSemaine() {
    rendreEtats();
    $('menu-vide').hidden = Boolean(menu) || !charge;
    $('menu-contenu').hidden = !menu;
    if (!menu) {
      $('menu-periode').textContent = '';
      $('menu-personnes').textContent = '';
      return;
    }
    const { jours, parametres } = menu;
    const format = (d) => dateLocale(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('menu-periode').textContent = jours.length > 1
      ? `Du ${format(jours[0].date)} au ${format(jours.at(-1).date)}`
      : majuscule(format(jours[0].date));
    $('menu-personnes').textContent = pluriel(parametres.personnes, 'personne');

    const choix = vedette();
    racine.querySelector('.menu-vedette').hidden = !choix;
    if (choix) {
      const [jour, repas] = choix;
      const recette = recetteDe(jour.repas[repas]);
      $('menu-vedette-moment').textContent = libelleMoment(jour.date, repas);
      $('menu-vedette-tags').textContent = recette.tags.slice(0, 3).map(majuscule).join(' · ');
      $('menu-vedette-nom').textContent = recette.nom;
      $('menu-vedette-duree').textContent = `${recette.duree_min} min`;
      $('menu-vedette-portions').textContent = pluriel(recette.portions, 'personne');
      Object.assign($('menu-vedette-ouvrir').dataset, { jour: jour.date, repas });
    }

    const recettes = jours.flatMap((j) => Object.values(j.repas).map(recetteDe)).filter(Boolean);
    $('menu-resume-repas').textContent = String(recettes.length);
    $('menu-resume-ingredients').textContent = String(recettes.reduce((n, r) => n + r.ingredients.length, 0));

    // Grille : une ligne par jour, une colonne par repas du menu (1 à 4)
    remplacer($('menu-entetes-repas'), el('span'), ...parametres.repas.map((r) => el('span', {}, REPAS[r] ?? r)));
    remplacer($('menu-grille'), ...jours.map((jour) => {
      const d = dateLocale(jour.date);
      const estAujourdhui = jour.date === aujourdhui();
      return el('div', { class: estAujourdhui ? 'menu-jour menu-jour-aujourdhui' : 'menu-jour', 'aria-current': estAujourdhui ? 'date' : null },
        el('span', { class: 'menu-jour-nom' },
          `${majuscule(d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))} `, el('b', {}, String(d.getDate()))),
        ...parametres.repas.map((repas) => creneau(jour, repas)));
    }));
  }

  function creneau(jour, repas) {
    const valeur = jour.repas[repas];
    const recette = recetteDe(valeur);
    if (recette) {
      return el('button', { class: 'menu-creneau', 'data-action': 'ouvrir-recette', 'data-jour': jour.date, 'data-repas': repas },
        el('b', {}, recette.nom),
        el('span', {}, [`${recette.duree_min} min`, recette.tags[0]].filter(Boolean).join(' · ')));
    }
    // Plat retiré par le serveur (halal, allergie, recette incomplète)
    return el('div', { class: 'menu-creneau menu-creneau-rejete' },
      el('span', { class: 'menu-rejete-texte' },
        el('b', {}, valeur?.rejete ? 'Plat non conforme retiré' : 'Pas de plat'),
        el('span', {}, MOTIFS[valeur?.motif] ?? '')),
      el('button', {
        class: 'menu-bouton-rose', 'data-action': 'remplacer', 'data-jour': jour.date, 'data-repas': repas,
        disabled: restant() === 0 || action || Boolean(etat?.enCours),
      }, 'Remplacer ', el('span', { class: 'menu-quota-mini' }, texteRestant())));
  }

  // ---- RECETTE ----

  function rendreRecette(date, repas) {
    const jour = menu?.jours.find((j) => j.date === date);
    const recette = recetteDe(jour?.repas[repas]);
    if (!recette) {
      if (charge) aller('');   // lien périmé (menu régénéré) : retour à la semaine
      return;
    }
    $('recette-contexte').textContent = libelleMoment(date, repas);
    $('recette-tags').textContent = recette.tags.slice(0, 3).map(majuscule).join(' · ');
    $('recette-nom').textContent = recette.nom;
    $('recette-duree').textContent = `${recette.duree_min} min`;
    $('recette-portions').textContent = pluriel(recette.portions, 'personne');
    $('recette-nb-ingredients').textContent = String(recette.ingredients.length);
    remplacer($('recette-ingredients'), ...recette.ingredients.map((i) =>
      el('li', {},
        el('span', { class: 'menu-ingredient-nom' }, i.nom),
        el('span', { class: 'menu-rayon' }, RAYONS[i.rayon] ?? RAYONS.autre),
        el('b', {}, quantite(i)))));
    $('recette-nb-etapes').textContent = pluriel(recette.etapes.length, 'étape');
    remplacer($('recette-etapes'), ...recette.etapes.map((e) => el('li', {}, e)));
    $('recette-resume-courses').textContent = `Ajoutez les ${pluriel(recette.ingredients.length, 'ingrédient')} à la liste de courses.`;
    Object.assign($('recette-remplacer').dataset, { jour: date, repas });
    $('recette-remplacer').disabled = restant() === 0 || action || Boolean(etat?.enCours);
    $('recette-quota').textContent = texteRestant();
    // Lien construit ici (jamais fourni par le générateur) : recherche YouTube en https
    $('recette-youtube').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`recette ${recette.nom}`)}`;
    racine.querySelector('[data-action="recette-vers-courses"]').dataset.recette = jour.repas[repas].recette;
  }

  // ---- FORMULAIRE ----

  // Repas proposés : seulement ceux activés dans les options de l'intégration
  function preparerFormulaire() {
    const actives = etat?.repas ?? [];
    const precedents = new Set(menu?.parametres.repas ?? actives);
    remplacer($('menu-choix-repas'), ...actives.map((r) =>
      el('label', {}, el('input', { type: 'checkbox', name: 'repas', value: r, checked: precedents.has(r) }), el('span', {}, REPAS[r] ?? r))));
    // Reprend les choix du menu précédent (jours, personnes, préférences, allergies)
    if (menu) {
      const { jours, personnes, preferences = [], allergies = [] } = menu.parametres;
      formulaire.elements.personnes.value = personnes;
      formulaire.querySelectorAll('input[name="jours"]').forEach((c) => { c.checked = Number(c.value) === jours; });
      formulaire.querySelectorAll('input[name="preference"]').forEach((c) => { c.checked = preferences.includes(c.value); });
      formulaire.querySelectorAll('input[name="allergie"]').forEach((c) => { c.checked = allergies.includes(c.value); });
    }
    $('menu-formulaire-message').textContent = etat?.configure === false ? texteErreur({ code: 'non_configure' }).join(' ') : '';
    majResume();
  }

  const coches = (nom) => [...formulaire.querySelectorAll(`input[name="${nom}"]:checked`)].map((c) => c.value);

  function lireParametres() {
    const personnes = Number.parseInt(formulaire.elements.personnes.value, 10);
    return {
      jours: Number(formulaire.querySelector('input[name="jours"]:checked')?.value ?? 7),
      repas: coches('repas'),
      personnes: Math.min(PERSONNES_MAX, Math.max(PERSONNES_MIN, Number.isFinite(personnes) ? personnes : PERSONNES_MIN)),
      preferences: coches('preference'),
      allergies: coches('allergie'),
      note: formulaire.elements.note.value.trim().slice(0, 200),
    };
  }

  function majResume() {
    const p = lireParametres();
    $('menu-resume-jours').textContent = pluriel(p.jours, 'jour');
    $('menu-resume-types').textContent = p.repas.map((r) => REPAS[r]).join(', ') || '—';
    $('menu-resume-personnes').textContent = String(p.personnes);
    $('menu-resume-allergies').textContent = p.allergies.map((a) => ALLERGIES[a]).join(', ') || 'Aucune';
    $('menu-quota-generer').querySelector('b').textContent = etat ? `${restant()} sur ${etat.quota.max}` : '—';
    $('menu-note-compteur').textContent = `${formulaire.elements.note.value.length} / 200`;
    formulaire.querySelector('button[type="submit"]').disabled =
      !etat?.configure || restant() === 0 || Boolean(etat?.enCours) || action;
  }

  function changerPersonnes(pas) {
    const champ = formulaire.elements.personnes;
    const valeur = Number.parseInt(champ.value, 10) || PERSONNES_MIN;
    champ.value = Math.min(PERSONNES_MAX, Math.max(PERSONNES_MIN, valeur + pas));
    majResume();
  }

  // ---- ACTIONS SERVEUR ----

  async function actualiser() {
    if (!hass) return;
    try {
      [etat, menu] = await Promise.all([menuEtat(hass), menuLire(hass)]);
    } catch (e) {
      erreur = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Menu :', e?.code ?? '');
    }
    charge = true;
    suivre();
    afficher(chemin);
  }

  // Génération en cours (lancée ici ou sur un autre appareil) : relecture régulière jusqu'à la fin
  function suivre() {
    if (etat?.enCours && !suivi) suivi = setInterval(actualiser, SUIVI_MS);
    if (!etat?.enCours && suivi) {
      clearInterval(suivi);
      suivi = null;
    }
  }

  async function executer(appel) {
    action = true;
    erreur = null;
    afficher(chemin);
    try {
      menu = await appel();
    } catch (e) {
      erreur = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Menu, action refusée :', erreur.code);
    } finally {
      action = false;
      await actualiser();
    }
  }

  function generer() {
    const parametres = lireParametres();
    if (!parametres.repas.length) {
      $('menu-formulaire-message').textContent = 'Choisissez au moins un repas.';
      return;
    }
    aller('');   // la semaine affiche « Génération en cours… »
    executer(() => menuGenerer(hass, parametres));
  }

  function remplacerPlat(bouton) {
    const { jour, repas } = bouton.dataset;
    executer(() => menuRemplacer(hass, jour, repas));
  }

  async function versCourses(bouton, recettes) {
    const zone = recettes ? $('recette-resume-courses') : bilanSemaine;
    bouton.disabled = true;
    zone.textContent = 'Ajout en cours…';
    try {
      const { ajoutes, fusionnes, ignores } = await menuVersCourses(hass, recettes);
      zone.textContent = `${[
        `${ajoutes} article${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''}`,
        fusionnes && `${fusionnes} déjà sur la liste (quantité mise à jour)`,
        ignores && `${ignores} ignoré${ignores > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ')}.`;
    } catch (e) {
      zone.textContent = texteErreur(e).join('. ');
      console.warn('Menu → courses :', e?.code ?? '');
    } finally {
      bouton.disabled = false;
    }
  }

  // « Tout ajouter » ajoute d'un coup les ingrédients de la semaine : un premier appui
  // demande confirmation sur le bouton lui-même (pas de fenêtre du navigateur, bloquée en kiosque)
  function confirmerToutAjouter(bouton) {
    if (confirmation) {
      clearTimeout(confirmation);
      confirmation = null;
      versCourses(bouton);
      return;
    }
    const recettes = menu ? menu.jours.flatMap((j) => Object.values(j.repas).map(recetteDe)).filter(Boolean) : [];
    const total = recettes.reduce((n, r) => n + r.ingredients.length, 0);
    bilanSemaine.textContent = `Appuyez encore pour ajouter ${pluriel(total, 'ingrédient')} à la liste de courses.`;
    confirmation = setTimeout(() => {
      confirmation = null;
      bilanSemaine.textContent = '';
    }, 5000);
  }

  // ---- ÉVÉNEMENTS ----

  formulaire.addEventListener('input', majResume);
  formulaire.addEventListener('change', majResume);
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    generer();
  });

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible || cible.disabled) return;
    switch (cible.dataset.action) {
      case 'aller-generer': aller('generer'); break;
      case 'retour-semaine': aller(''); break;
      case 'ouvrir-recette': aller(`recette/${cible.dataset.jour}/${cible.dataset.repas}`); break;
      case 'personnes-moins': changerPersonnes(-1); break;
      case 'personnes-plus': changerPersonnes(1); break;
      case 'remplacer': remplacerPlat(cible); break;
      case 'vers-courses': confirmerToutAjouter(cible); break;
      case 'recette-vers-courses': versCourses(cible, [cible.dataset.recette]); break;
      case 'reessayer':
        erreur = null;
        actualiser();
        break;
      default:
    }
  });

  afficher(chemin);

  return {
    racine,
    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) actualiser();
    },
    changerSousPage(nouveauChemin = '') {
      afficher(nouveauChemin);
    },
    detruire() {
      clearInterval(suivi);
      clearTimeout(confirmation);
    },
  };
}
