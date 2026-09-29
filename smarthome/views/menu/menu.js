// =============================================
// MENU.JS — Section Menu (semaine, générer, recette)
// =============================================
// Tout passe par l'intégration « maison » (maison/menu/*) : le panneau ne contacte jamais
// le générateur. Sous-pages : « menu » (semaine), « menu/generer », « menu/recette/<date>/<repas> »,
// « menu/jus » (catalogue du jour), « menu/jus/<id> », « menu/plat » (un plat seul) et « menu/plat/<id> ».
// Affichage en nœuds texte uniquement ; aucun stockage navigateur.

import { ajouterStyle, chargerGabarit, el, remplacer } from '../../js/dom.js';
import {
  jusCatalogue, jusRegenerer, menuEtat, menuGenerer, menuLire, menuPlat, menuPlats, menuRemplacer, menuVersCourses,
} from '../../js/ha.js';

const PERSONNES_MIN = 1;
const PERSONNES_MAX = 12;
const SUIVI_MS = 15_000;          // relecture pendant une génération (lancée ici ou ailleurs)
const PHOTOS_MS = 25_000;         // les photos arrivent en arrière-plan après une génération
const SIGNATURES_MS = 6 * 3600_000;   // les adresses signées des photos expirent après 24 h

const REPAS = { petit_dej: 'Petit-déjeuner', jus: 'Jus', dejeuner: 'Déjeuner', diner: 'Dîner' };
const REPAS_COURTS = { petit_dej: 'Matin', jus: 'Jus', dejeuner: 'Midi', diner: 'Soir' };
// Plat principal d'une journée (jamais le jus), puis les autres repas
const PRIORITE_PLATS = ['diner', 'dejeuner', 'petit_dej'];
const REPAS_PLAT_SEUL = ['petit_dej', 'dejeuner', 'diner'];
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
const OBJECTIFS = { fraicheur: 'Fraîcheur', vitalite: 'Vitalité', immunite: 'Immunité', antioxydant: 'Antioxydant', digestif: 'Digestif' };
const MOMENTS = { matin: 'Matin', midi: 'Midi', 'apres-effort': 'Après l\'effort', gouter: 'Goûter', soiree: 'Soirée' };
const CONDITIONS = {
  sunny: 'Ciel dégagé', 'clear-night': 'Nuit claire', partlycloudy: 'Éclaircies', cloudy: 'Nuageux', fog: 'Brouillard',
  rainy: 'Pluie', pouring: 'Forte pluie', snowy: 'Neige', 'snowy-rainy': 'Neige et pluie', hail: 'Grêle',
  lightning: 'Orage', 'lightning-rainy': 'Orage', windy: 'Venteux', 'windy-variant': 'Venteux', exceptional: 'Conditions exceptionnelles',
};
const CONSEILS = { fraicheur: 'la fraîcheur', vitalite: 'la vitalité', immunite: 'l\'immunité', antioxydant: 'les antioxydants', digestif: 'la digestion' };
const objectifDe = (recette) => (OBJECTIFS[recette?.jus?.objectif] ? recette.jus.objectif : 'fraicheur');

// Photo servie par l'intégration : seul un chemin relatif signé est accepté, sinon le dégradé reste
const PHOTO_SIGNEE = /^\/api\/maison\/photo\/[0-9a-f]{16}\.webp\?authSig=[A-Za-z0-9._-]+$/;
const photoValide = (photo) => typeof photo?.url === 'string' && PHOTO_SIGNEE.test(photo.url);

// Segment d'URL tapé à la main : un « % » mal formé ne doit pas casser la vue
const decoder = (texte) => {
  try {
    return decodeURIComponent(texte);
  } catch {
    return '';
  }
};

// Pose (ou retire) la photo en premier enfant du conteneur, et le crédit en texte non cliquable.
// Même photo avec une nouvelle signature : l'image affichée est gardée (pas de clignotement).
function poserPhoto(conteneur, credit, photo) {
  const valide = photoValide(photo);
  const actuelle = conteneur.querySelector(':scope > img');
  const cheminPhoto = valide ? photo.url.split('?')[0] : null;
  if (actuelle && actuelle.dataset.chemin !== cheminPhoto) actuelle.remove();
  if (valide && actuelle?.dataset.chemin !== cheminPhoto) {
    const img = el('img', { src: photo.url, alt: '', 'data-chemin': cheminPhoto, decoding: 'async' });
    img.addEventListener('error', () => img.remove());   // adresse expirée ou photo absente : dégradé
    conteneur.prepend(img);
  }
  if (credit) {
    const auteur = valide && typeof photo.credit?.auteur === 'string' ? photo.credit.auteur.slice(0, 80) : '';
    credit.hidden = !auteur;
    credit.textContent = auteur ? `Photo : ${auteur} / Pexels` : '';
  }
}

// Estimation facultative (calories_portion, 0-5000) : ajoutée à côté des portions, en texte
function poserCalories(champPortions, recette) {
  const liste = champPortions.closest('.menu-caracteristiques');
  liste?.querySelector('.menu-calories')?.remove();
  const kcal = recette.calories_portion;
  if (!liste || !Number.isInteger(kcal) || kcal <= 0 || kcal > 5000) return;
  liste.append(el('span', { class: 'menu-caracteristique menu-calories', title: 'Estimation, à vérifier' }, `≈ ${kcal} kcal / portion`));
}

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
  let catalogue = null;     // jus du jour (maison/jus/catalogue), lu à la première visite
  let chargeJus = false;
  let erreurJus = null;
  let actionJus = false;
  let relecturePhotos = null;
  let plats = [];           // derniers plats seuls (maison/menu/plats), lus à la visite de « menu/plat »
  let chargePlats = false;
  let erreurPlat = null;
  let actionPlat = false;
  // Adresses signées des photos : relecture régulière avant leur expiration
  const signatures = setInterval(() => {
    actualiser();
    if (chargeJus) chargerCatalogue();
    if (chargePlats) chargerPlats();
  }, SIGNATURES_MS);

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
    let sousPage = ['generer', 'recette', 'jus', 'plat'].includes(page) ? page : 'semaine';
    if (page === 'jus' && date) sousPage = 'jus-detail';
    if (page === 'plat' && date) sousPage = 'recette';   // un plat seul s'affiche comme une recette
    racine.querySelectorAll('[data-sous-page]').forEach((section) => {
      section.hidden = section.dataset.sousPage !== sousPage;
    });
    if (sousPage === 'generer') preparerFormulaire();
    else if (sousPage === 'recette' && page === 'plat') afficherPlat(decoder(date));
    else if (sousPage === 'recette') rendreRecette(date, repas);
    else if (sousPage === 'plat') afficherPagePlat();
    else if (sousPage === 'jus') afficherJus();
    else if (sousPage === 'jus-detail') {
      const id = decoder(date);
      if (id) afficherJus(id);
      else aller('jus');
    }
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
    // Le plat du jour est un repas : un jus n'est mis en avant que s'il n'y a rien d'autre
    const trouve = (plat) => candidats.find(([j, r]) => (r !== 'jus') === plat && recetteDe(j.repas[r]));
    return trouve(true) ?? trouve(false);
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
      poserCalories($('menu-vedette-portions'), recette);
      Object.assign($('menu-vedette-ouvrir').dataset, { date: jour.date, repas });
      poserPhoto($('menu-vedette-photo'), $('menu-vedette-credit'), recette.photo);
    }

    const recettes = jours.flatMap((j) => Object.values(j.repas).map(recetteDe)).filter(Boolean);
    $('menu-resume-repas').textContent = String(recettes.length);
    $('menu-resume-ingredients').textContent = String(recettes.reduce((n, r) => n + r.ingredients.length, 0));

    // Une carte par jour : le plat principal en grand, les autres repas dessous (le jus est en bas de page)
    const repasDuMenu = parametres.repas.filter((r) => r !== 'jus');
    remplacer($('menu-jours'), ...jours.map((jour) => carteJour(jour, repasDuMenu)));

    rendreBandeJus();
  }

  const boutonRemplacer = (date, repas) => el('button', {
    class: 'menu-bouton-rose', 'data-action': 'remplacer', 'data-date': date, 'data-repas': repas,
    disabled: restant() === 0 || action || Boolean(etat?.enCours),
  }, 'Remplacer ', el('span', { class: 'menu-quota-mini' }, texteRestant()));

  function carteJour(jour, repasDuMenu) {
    const d = dateLocale(jour.date);
    const estAujourdhui = jour.date === aujourdhui();
    const principal = PRIORITE_PLATS.find((r) => repasDuMenu.includes(r) && jour.repas[r]) ?? repasDuMenu[0];
    const nomJour = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const valeur = jour.repas[principal];
    const recette = recetteDe(valeur);

    let blocPrincipal;
    if (recette) {
      const photo = el('span', { class: 'menu-jour-photo' });
      poserPhoto(photo, null, recette.photo);
      blocPrincipal = el('button', { class: 'menu-jour-principal', 'data-action': 'ouvrir-recette', 'data-date': jour.date, 'data-repas': principal },
        photo,
        el('span', { class: 'menu-jour-legende' }, el('span', { class: 'menu-jour-nom' }, `${nomJour} ${d.getDate()}`), el('b', {}, recette.nom)));
    } else {
      blocPrincipal = el('div', { class: 'menu-jour-principal menu-jour-principal-rejete' },
        el('span', { class: 'menu-jour-nom' }, `${nomJour} ${d.getDate()}`),
        el('b', {}, valeur?.rejete ? 'Plat non conforme retiré' : 'Pas de plat'),
        el('span', {}, MOTIFS[valeur?.motif] ?? ''),
        boutonRemplacer(jour.date, principal));
    }

    const autres = repasDuMenu.filter((r) => r !== principal && jour.repas[r]).map((r) => {
      const autre = recetteDe(jour.repas[r]);
      if (autre) {
        return el('li', {}, el('button', { class: 'menu-jour-repas', 'data-action': 'ouvrir-recette', 'data-date': jour.date, 'data-repas': r },
          el('span', {}, REPAS_COURTS[r]), el('b', {}, autre.nom)));
      }
      return el('li', { class: 'menu-jour-rejete' }, el('span', {}, `${REPAS_COURTS[r]} · Plat retiré`), boutonRemplacer(jour.date, r));
    });

    return el('div', {
      class: estAujourdhui ? 'menu-jour-carte menu-jour-aujourdhui' : 'menu-jour-carte',
      'aria-current': estAujourdhui ? 'date' : null,
    },
    blocPrincipal,
    autres.length ? el('ul', { class: 'menu-jour-autres' }, ...autres) : null);
  }

  // Jus du jour : en bas de page, secondaires (catalogue généré au premier affichage de la journée)
  function rendreBandeJus() {
    if (!chargeJus && !actionJus && hass) chargerCatalogue();
    const jus = catalogue?.jus ?? [];
    $('menu-bloc-jus').hidden = chargeJus && !catalogue;
    $('menu-jus-vide').hidden = jus.length > 0 || !chargeJus;
    $('menu-jus-conseil').textContent = typeof catalogue?.conseil?.texte === 'string'
      ? catalogue.conseil.texte : 'Des suggestions fraîches pour accompagner vos repas';
    remplacer($('menu-jus-bande'), ...jus.slice(0, 6).map((r) => {
      const objectif = objectifDe(r);
      const photo = el('span', { class: 'menu-jus-photo' });
      poserPhoto(photo, null, r.photo);
      return el('button', { class: `menu-jus-mini jus-objectif-${objectif}`, 'data-action': 'ouvrir-jus', 'data-id': r.id },
        photo,
        el('span', { class: 'menu-jus-legende' }, el('span', { class: 'menu-jus-objectif' }, OBJECTIFS[objectif]), el('b', {}, r.nom)));
    }));
  }

  // ---- RECETTE ----

  function rendreRecette(date, repas) {
    const jour = menu?.jours.find((j) => j.date === date);
    const recette = recetteDe(jour?.repas[repas]);
    if (!recette) {
      if (charge) aller('');   // lien périmé (menu régénéré) : retour à la semaine
      return;
    }
    remplirRecette(recette, libelleMoment(date, repas), { date, repas });
  }

  // Détail d'une recette, du menu (remplaçable) ou d'un plat seul (non remplaçable)
  function remplirRecette(recette, contexte, creneauMenu = null) {
    $('recette-contexte').textContent = contexte;
    $('recette-tags').textContent = recette.tags.slice(0, 3).map(majuscule).join(' · ');
    $('recette-nom').textContent = recette.nom;
    poserPhoto($('recette-photo'), $('recette-credit'), recette.photo);
    $('recette-duree').textContent = `${recette.duree_min} min`;
    $('recette-portions').textContent = pluriel(recette.portions, 'personne');
    poserCalories($('recette-portions'), recette);
    $('recette-nb-ingredients').textContent = String(recette.ingredients.length);
    remplacer($('recette-ingredients'), ...recette.ingredients.map((i) =>
      el('li', {},
        el('span', { class: 'menu-ingredient-nom' }, i.nom),
        el('span', { class: 'menu-rayon' }, RAYONS[i.rayon] ?? RAYONS.autre),
        el('b', {}, quantite(i)))));
    $('recette-nb-etapes').textContent = pluriel(recette.etapes.length, 'étape');
    remplacer($('recette-etapes'), ...recette.etapes.map((e) => el('li', {}, e)));
    $('recette-resume-courses').textContent = `Ajoutez les ${pluriel(recette.ingredients.length, 'ingrédient')} à la liste de courses.`;
    $('recette-remplacer').hidden = !creneauMenu;
    if (creneauMenu) Object.assign($('recette-remplacer').dataset, creneauMenu);
    $('recette-remplacer').disabled = restant() === 0 || action || Boolean(etat?.enCours);
    $('recette-quota').textContent = texteRestant();
    // Lien construit ici (jamais fourni par le générateur) : recherche YouTube en https
    $('recette-youtube').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`recette ${recette.nom}`)}`;
    racine.querySelector('[data-action="recette-vers-courses"]').dataset.recette = recette.id;
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
      programmerPhotos();
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
    const { date, repas } = bouton.dataset;
    executer(() => menuRemplacer(hass, date, repas));
  }

  async function versCourses(bouton, recettes, zone = recettes ? $('recette-resume-courses') : bilanSemaine) {
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

  // Photos cherchées en arrière-plan : une relecture quelques secondes après la génération
  function programmerPhotos() {
    const sansPhoto = (liste) => liste.some((r) => !r.photo);
    const attente = (menu && sansPhoto(Object.values(menu.recettes))) || (catalogue && sansPhoto(catalogue.jus))
      || sansPhoto(plats);
    if (!attente || relecturePhotos) return;
    relecturePhotos = setTimeout(() => {
      relecturePhotos = null;
      actualiser();
      if (chargeJus) chargerCatalogue();
      if (chargePlats) chargerPlats();
    }, PHOTOS_MS);
  }

  // ---- UN PLAT SEUL (sans toucher au menu de la semaine) ----

  const formPlat = $('plat-formulaire');

  function afficherPagePlat() {
    if (!chargePlats && !actionPlat && hass) chargerPlats();
    rendrePagePlat();
  }

  async function chargerPlats() {
    try {
      const reponse = await menuPlats(hass);
      plats = Array.isArray(reponse) ? reponse : [];
      erreurPlat = null;
    } catch (e) {
      erreurPlat = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Plats :', erreurPlat.code);
    }
    chargePlats = true;
    programmerPhotos();
    afficher(chemin);
  }

  function rendrePagePlat() {
    // Choix du repas : proposé une seule fois, puis la sélection de l'utilisateur est gardée
    if (!$('plat-choix-repas').querySelector('input')) {
      remplacer($('plat-choix-repas'), ...REPAS_PLAT_SEUL.map((r) =>
        el('label', {}, el('input', { type: 'radio', name: 'repas', value: r, checked: r === 'diner' }), el('span', {}, REPAS[r]))));
      if (menu) formPlat.elements.personnes.value = menu.parametres.personnes;
    }
    const enCours = actionPlat || Boolean(etat?.enCours);
    $('plat-etat-encours').hidden = !enCours;
    $('plat-etat-erreur').hidden = enCours || !erreurPlat;
    if (erreurPlat) {
      const [titre, texte] = texteErreur(erreurPlat);
      $('plat-erreur-titre').textContent = titre;
      $('plat-erreur-texte').textContent = texte;
    }
    $('plat-quota').textContent = etat ? `${restant()} sur ${etat.quota.max}` : '—';
    $('plat-note-compteur').textContent = `${formPlat.elements.note.value.length} / 200`;
    formPlat.querySelector('button[type="submit"]').disabled = !etat?.configure || restant() === 0 || enCours;

    $('plat-derniers-vide').hidden = plats.length > 0 || !chargePlats;
    remplacer($('plat-derniers'), ...plats.map((r) => {
      const photo = el('span', { class: 'menu-plat-photo' });
      poserPhoto(photo, null, r.photo);
      const detail = [REPAS[r.repas] ?? '', `${r.duree_min} min`].filter(Boolean).join(' · ');
      return el('div', { class: 'menu-plat-carte' },
        el('button', { class: 'menu-plat-ouvrir', 'data-action': 'ouvrir-plat', 'data-id': r.id },
          photo, el('span', { class: 'menu-plat-texte' }, el('b', {}, r.nom), el('span', {}, detail))),
        el('button', { class: 'menu-bouton', 'data-action': 'plat-vers-courses', 'data-id': r.id }, '+ Courses'));
    }));
  }

  function afficherPlat(id) {
    const plat = plats.find((r) => r.id === id);
    if (!plat) {
      if (chargePlats) aller('plat');
      else if (hass && !actionPlat) chargerPlats();
      return;
    }
    remplirRecette(plat, `Plat seul${REPAS[plat.repas] ? ` · ${REPAS[plat.repas]}` : ''}`);
  }

  function lireParametresPlat() {
    const personnes = Number.parseInt(formPlat.elements.personnes.value, 10);
    const choisis = (nom) => [...formPlat.querySelectorAll(`input[name="${nom}"]:checked`)].map((c) => c.value);
    const repas = formPlat.querySelector('input[name="repas"]:checked')?.value;
    return {
      repas: REPAS_PLAT_SEUL.includes(repas) ? repas : 'diner',
      personnes: Math.min(PERSONNES_MAX, Math.max(PERSONNES_MIN, Number.isFinite(personnes) ? personnes : PERSONNES_MIN)),
      preferences: choisis('preference'),
      allergies: choisis('allergie'),
      note: formPlat.elements.note.value.trim().slice(0, 200),
    };
  }

  async function genererPlat() {
    actionPlat = true;
    erreurPlat = null;
    $('plat-message').textContent = '';
    rendrePagePlat();
    try {
      const plat = await menuPlat(hass, lireParametresPlat());
      plats = [plat, ...plats.filter((r) => r.id !== plat.id)].slice(0, 5);
      $('plat-message').textContent = `« ${plat.nom} » est prêt.`;
      programmerPhotos();
    } catch (e) {
      erreurPlat = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Plat seul refusé :', erreurPlat.code);
    }
    actionPlat = false;
    await actualiser();
  }

  function changerPersonnesPlat(pas) {
    const champ = formPlat.elements.personnes;
    const valeur = Number.parseInt(champ.value, 10) || PERSONNES_MIN;
    champ.value = Math.min(PERSONNES_MAX, Math.max(PERSONNES_MIN, valeur + pas));
  }

  formPlat.addEventListener('input', () => {
    $('plat-note-compteur').textContent = `${formPlat.elements.note.value.length} / 200`;
  });
  formPlat.addEventListener('submit', (e) => {
    e.preventDefault();
    genererPlat();
  });

  // ---- JUS DU JOUR ----

  // Lu à la première visite : le serveur le génère alors, une fois par jour, hors quota
  function afficherJus(id) {
    if (!chargeJus && !actionJus && hass) chargerCatalogue();
    if (id) rendreJusDetail(id);
    else rendreJus();
  }

  async function chargerCatalogue() {
    actionJus = !chargeJus;   // première lecture du jour : la préparation peut prendre un moment
    rendreJus();
    try {
      catalogue = await jusCatalogue(hass);
      erreurJus = null;
    } catch (e) {
      erreurJus = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Jus :', erreurJus.code);
    }
    actionJus = false;
    chargeJus = true;
    programmerPhotos();
    afficher(chemin);
  }

  async function regenererJus() {
    actionJus = true;
    erreurJus = null;
    rendreJus();
    try {
      catalogue = await jusRegenerer(hass);
      programmerPhotos();
    } catch (e) {
      erreurJus = e?.code ? e : { code: 'generation_indisponible' };
      console.warn('Jus, régénération refusée :', erreurJus.code);
    }
    actionJus = false;
    await actualiser();
  }

  function rendreJus() {
    const jourJ = aujourdhui();
    const conseil = catalogue?.conseil ?? null;

    $('jus-date').hidden = !catalogue || catalogue.date === jourJ;
    if (catalogue && catalogue.date !== jourJ) {
      const date = dateLocale(catalogue.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      $('jus-date').textContent = `Jus du ${date} : ceux d'aujourd'hui n'ont pas pu être préparés.`;
    }

    // Météo : masquée si non configurée, « Météo indisponible » si l'entité ne répond pas
    const meteo = etat?.meteo;
    const puce = $('jus-meteo');
    puce.hidden = !meteo || meteo.raison === 'non_configuree' || (meteo.ok && !conseil);
    if (meteo?.raison === 'indisponible') puce.textContent = 'Météo indisponible';
    else if (conseil) {
      puce.textContent = [
        Number.isFinite(conseil.temperature) ? `${Math.round(conseil.temperature)} °C` : '',
        CONDITIONS[conseil.condition],
      ].filter(Boolean).join(' · ');
    }

    const bloque = restant() === 0 || actionJus || Boolean(etat?.enCours);
    racine.querySelectorAll('[data-action="regenerer-jus"]').forEach((b) => {
      b.disabled = bloque;
      const mini = b.querySelector('.menu-quota-mini');
      if (mini) mini.textContent = texteRestant();
    });

    $('jus-conseil').hidden = !conseil;
    if (conseil) {
      const objectif = OBJECTIFS[conseil.objectif] ? conseil.objectif : 'fraicheur';
      $('jus-conseil').className = `jus-conseil jus-objectif-${objectif}`;
      $('jus-conseil-titre').textContent = `Aujourd'hui, privilégiez ${CONSEILS[objectif]}`;
      $('jus-conseil-texte').textContent = typeof conseil.texte === 'string' ? conseil.texte : '';
    }

    $('jus-etat-encours').hidden = !actionJus;
    $('jus-etat-erreur').hidden = actionJus || !erreurJus;
    if (erreurJus) {
      const [titre, texte] = texteErreur(erreurJus);
      $('jus-erreur-titre').textContent = titre;
      $('jus-erreur-texte').textContent = texte;
    }
    $('jus-vide').hidden = actionJus || !chargeJus || Boolean(catalogue);
    $('jus-filtres').hidden = !catalogue?.jus.length;

    const filtre = $('jus-filtres').querySelector('input[name="objectif"]:checked')?.value ?? '';
    const jus = (catalogue?.jus ?? []).filter((r) => !filtre || objectifDe(r) === filtre);
    remplacer($('jus-catalogue'), ...jus.map((r) => {
      const objectif = objectifDe(r);
      const photo = el('span', { class: 'jus-photo' },
        el('span', { class: 'jus-badge' }, OBJECTIFS[objectif]),
        el('span', { class: 'jus-moment' }, MOMENTS[r.jus?.moment] ?? ''));
      poserPhoto(photo, null, r.photo);
      return el('button', { class: `jus-carte jus-objectif-${objectif}`, 'data-action': 'ouvrir-jus', 'data-id': r.id },
        photo,
        el('span', { class: 'jus-carte-texte' },
          el('b', {}, r.nom),
          el('span', {}, r.ingredients.slice(0, 3).map((i) => i.nom).join(' · '))),
        el('span', { class: 'jus-carte-pied' },
          el('span', {}, `${r.duree_min} min`),
          el('span', { class: 'jus-voir' }, 'Voir la recette →')));
    }));
    $('jus-catalogue').hidden = !jus.length;
  }

  function rendreJusDetail(id) {
    const recette = catalogue?.jus.find((r) => r.id === id);
    if (!recette) {
      if (chargeJus) aller('jus');   // catalogue régénéré : retour à la liste
      return;
    }
    const objectif = objectifDe(recette);
    const conseil = catalogue.conseil;
    $('jus-detail-page').className = `menu-page jus-objectif-${objectif}`;
    $('jus-detail-objectif').textContent = OBJECTIFS[objectif];
    poserPhoto($('jus-detail-photo'), $('jus-detail-credit'), recette.photo);
    $('jus-detail-surtitre').textContent = [OBJECTIFS[objectif], MOMENTS[recette.jus?.moment]].filter(Boolean).join(' · ');
    $('jus-detail-nom').textContent = recette.nom;
    $('jus-detail-description').textContent = recette.jus?.description ?? '';
    const meteo = $('jus-detail-meteo');
    meteo.hidden = !conseil || conseil.objectif !== objectif;
    if (!meteo.hidden) {
      meteo.querySelector('b').textContent = 'Conseil du jour';
      meteo.querySelector('span').textContent = typeof conseil.texte === 'string' ? conseil.texte : '';
    }
    $('jus-detail-duree').textContent = `${recette.duree_min} min`;
    $('jus-detail-portions').textContent = pluriel(recette.portions, 'verre');
    poserCalories($('jus-detail-portions'), recette);
    remplacer($('jus-detail-ingredients'), ...recette.ingredients.map((i) =>
      el('li', {},
        el('b', {}, quantite(i)),
        el('span', { class: 'menu-ingredient-nom' }, i.nom),
        el('span', { class: 'menu-rayon' }, RAYONS[i.rayon] ?? RAYONS.autre))));
    remplacer($('jus-detail-etapes'), ...recette.etapes.map((e) => el('li', {}, e)));
    $('jus-detail-service').textContent = recette.jus?.service ?? '';
    $('jus-detail-bilan').textContent = '';
    racine.querySelector('[data-action="jus-vers-courses"]').dataset.recette = recette.id;
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
      case 'ouvrir-recette': aller(`recette/${cible.dataset.date}/${cible.dataset.repas}`); break;
      case 'aller-plat': aller('plat'); break;
      case 'ouvrir-plat': aller(`plat/${encodeURIComponent(cible.dataset.id)}`); break;
      case 'plat-personnes-moins': changerPersonnesPlat(-1); break;
      case 'plat-personnes-plus': changerPersonnesPlat(1); break;
      case 'plat-vers-courses': versCourses(cible, [cible.dataset.id], $('plat-message')); break;
      case 'personnes-moins': changerPersonnes(-1); break;
      case 'personnes-plus': changerPersonnes(1); break;
      case 'remplacer': remplacerPlat(cible); break;
      case 'vers-courses': confirmerToutAjouter(cible); break;
      case 'recette-vers-courses': versCourses(cible, [cible.dataset.recette]); break;
      case 'aller-jus': aller('jus'); break;
      case 'retour-jus': aller('jus'); break;
      case 'ouvrir-jus': aller(`jus/${encodeURIComponent(cible.dataset.id)}`); break;
      case 'regenerer-jus': regenererJus(); break;
      case 'jus-vers-courses': versCourses(cible, [cible.dataset.recette], $('jus-detail-bilan')); break;
      case 'reessayer':
        erreur = null;
        actualiser();
        break;
      default:
    }
  });

  $('jus-filtres').addEventListener('change', rendreJus);

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
      clearInterval(signatures);
      clearTimeout(confirmation);
      clearTimeout(relecturePhotos);
    },
  };
}
