// =============================================
// BUDGET.JS — Vue Budget & Factures
// =============================================
// Trois états :
//   - verrouillé : pavé numérique, le code est vérifié par Home Assistant ;
//   - lecture    : données du mois, champs non modifiables ;
//   - édition    : « Modifier le mois », puis Enregistrer ou Annuler.
// Le jeton de session reste en mémoire (jamais dans le stockage du navigateur) et la vue
// se reverrouille quand on la quitte ou après INACTIVITE_MS sans interaction.

import { ajouterStyle, chargerGabarit, el, remplacer, svg } from '../../js/dom.js';
import {
  budgetDeverrouiller, budgetEnregistrer, budgetEtat, budgetLire, budgetVerrouiller,
} from '../../js/ha.js';

const LONGUEUR_CODE = 6;
const INACTIVITE_MS = 5 * 60 * 1000;
const PAS_AJUSTEMENT = 10;   // € ajoutés ou retirés par les boutons − / +

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurosCentimes = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });
const dateLongue = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUTS = {
  'a-payer': { libelle: 'À payer',   icone: 'statut-a-payer.svg' },
  paye:      { libelle: 'Payé',      icone: 'statut-paye.svg' },
  retard:    { libelle: 'En retard', icone: 'statut-retard.svg' },
};

const icone = (fichier) => new URL(`../../assets/icons/budget/${fichier}`, import.meta.url).href;
const pourcent = (valeur, total) => (total > 0 ? Math.min(100, Math.round((valeur / total) * 100)) : 0);
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);
const somme = (liste, cle) => liste.reduce((total, e) => total + e[cle], 0);
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');   // AAAA-MM-JJ en heure locale
const dateDe = (iso) => new Date(`${iso}T12:00:00`);                // midi : pas de décalage de fuseau
const nomDuMois = (aaaaMm, format = 'long') => {
  const [annee, mois] = aaaaMm.split('-').map(Number);
  return new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', format === 'long'
    ? { month: 'long', year: 'numeric' }
    : { month: format });
};

// Éléments ajoutés par le bouton « + Ajouter » de chaque liste
const NOUVEL_ELEMENT = {
  'epargne.comptes': () => ({ nom: 'Nouveau compte', montant: 0 }),
  imprevus:          () => ({ libelle: 'Nouvel imprévu', montant: 0 }),
  facturesAVenir:    () => ({ fournisseur: 'Nouvelle facture', echeance: aujourdhui(), montant: 0 }),
  factures:          () => ({ fournisseur: 'Nouvelle facture', echeance: aujourdhui(), montant: 0, statut: 'a-payer' }),
};

// Accès à un champ par chemin : "categories.2.budget"
const lire = (objet, chemin) => chemin.split('.').reduce((o, cle) => o[cle], objet);
function ecrire(objet, chemin, valeur) {
  const cles = chemin.split('.');
  const derniere = cles.pop();
  const parent = cles.length ? lire(objet, cles.join('.')) : objet;
  parent[derniere] = valeur;
}

export async function monter() {
  const racine = el('div', { class: 'vue-budget' });
  racine.append(await chargerGabarit(new URL('./budget.html', import.meta.url)));
  ajouterStyle(racine, new URL('./budget.css', import.meta.url));

  const $ = (id) => racine.querySelector(`#${id}`);

  let hass = null;
  let jeton = null;
  let donnees = null;     // dernière version enregistrée dans HA
  let brouillon = null;   // copie modifiée en mode édition (null sinon)
  let code = '';
  let minuteurInactivite = null;
  let minuteurBlocage = null;

  const courant = () => brouillon ?? donnees;
  const enEdition = () => brouillon !== null;

  // ================= VERROU =================

  function construireClavier() {
    const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'effacer'];
    remplacer($('budget-clavier'), ...touches.map((t) => {
      if (t === null) return el('span');
      return t === 'effacer'
        ? el('button', { class: 'budget-touche', 'data-action': 'effacer', 'aria-label': 'Effacer' }, '⌫')
        : el('button', { class: 'budget-touche', 'data-action': 'touche', 'data-touche': t }, t);
    }));
  }

  function rendrePoints() {
    remplacer($('budget-code-points'), ...Array.from({ length: LONGUEUR_CODE }, (_, i) =>
      el('span', { class: i < code.length ? 'budget-code-point rempli' : 'budget-code-point' })));
  }

  const message = (texte) => { $('budget-code-message').textContent = texte; };

  function activerClavier(actif) {
    racine.querySelectorAll('.budget-touche').forEach((b) => { b.disabled = !actif; });
  }

  // Compte à rebours local après trop d'essais (le blocage réel est appliqué par HA)
  function decompter(secondes) {
    clearTimeout(minuteurBlocage);
    activerClavier(false);
    const fin = Date.now() + secondes * 1000;
    const tick = () => {
      const reste = Math.ceil((fin - Date.now()) / 1000);
      if (reste <= 0) {
        message('');
        activerClavier(true);
        return;
      }
      message(`Trop d'essais. Réessayez dans ${reste} s.`);
      minuteurBlocage = setTimeout(tick, 1000);
    };
    tick();
  }

  async function verifierEtat() {
    try {
      const etat = await budgetEtat(hass);
      if (!etat.configure) {
        activerClavier(false);
        message('Budget non configuré : ajoutez l\'intégration « Maison » dans Home Assistant.');
        return null;
      }
      if (etat.attente > 0) decompter(etat.attente);
      return etat;
    } catch (e) {
      activerClavier(false);
      message('Home Assistant injoignable.');
      console.warn('Budget, état :', e.message ?? e);
      return null;
    }
  }

  function afficherVerrou(texte = '') {
    clearTimeout(minuteurInactivite);
    jeton = null;
    donnees = null;
    brouillon = null;
    code = '';
    $('budget-contenu').hidden = true;
    $('budget-verrou').hidden = false;
    $('budget-mois').textContent = majuscule(new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
    rendreActions();
    rendrePoints();
    activerClavier(true);
    message(texte);
    verifierEtat();
  }

  async function validerCode() {
    activerClavier(false);
    const saisi = code;
    code = '';
    try {
      jeton = (await budgetDeverrouiller(hass, saisi)).jeton;
      donnees = await budgetLire(hass, jeton);
      afficherContenu();
    } catch (e) {
      jeton = null;
      rendrePoints();
      const etat = await verifierEtat();
      if (!etat || etat.attente > 0) return;
      message(e.code === 'code_invalide'
        ? `Code incorrect. ${etat.essaisRestants} essai(s) restant(s).`
        : 'Déverrouillage impossible.');
      activerClavier(true);
      if (e.code !== 'code_invalide') console.warn('Budget, déverrouillage :', e.message ?? e);
    }
  }

  function verrouiller(texte = 'Budget verrouillé.') {
    if (jeton) budgetVerrouiller(hass, jeton).catch(() => {});
    afficherVerrou(texte);
  }

  function armerInactivite() {
    clearTimeout(minuteurInactivite);
    if (jeton) minuteurInactivite = setTimeout(() => verrouiller('Verrouillé après inactivité.'), INACTIVITE_MS);
  }

  // "session_invalide" ramène au code ; les autres erreurs s'affichent dans la vue
  function gererErreur(e, contexte) {
    if (e.code === 'session_invalide') {
      afficherVerrou('Session expirée : saisissez à nouveau le code.');
      return;
    }
    $('budget-erreur').textContent = e.code === 'donnees_invalides'
      ? 'Enregistrement refusé : vérifiez que chaque libellé est rempli et que les montants sont positifs.'
      : 'Enregistrement impossible : Home Assistant injoignable.';
    $('budget-erreur').hidden = false;
    console.warn(`Budget, ${contexte} :`, e.message ?? e);
  }

  // ================= CONTENU =================

  function afficherContenu() {
    $('budget-verrou').hidden = true;
    $('budget-contenu').hidden = false;
    $('budget-erreur').hidden = true;
    rendreTout();
    armerInactivite();
  }

  function rendreActions() {
    const bouton = (action, texte, principal = false) =>
      el('button', { class: principal ? 'budget-bouton budget-bouton-principal' : 'budget-bouton', 'data-action': action }, texte);

    let boutons = [];
    if (jeton && enEdition()) boutons = [bouton('annuler', 'Annuler'), bouton('enregistrer', 'Enregistrer', true)];
    else if (jeton) boutons = [bouton('modifier', '✏️ Modifier le mois', true), bouton('verrouiller', '🔒 Verrouiller')];
    remplacer($('budget-actions'), ...boutons);
  }

  // ---- Champs (non modifiables hors édition) ----

  const champMontant = (valeur, chemin, court = true) =>
    el('span', { class: court ? 'budget-champ budget-champ-court' : 'budget-champ' },
      el('span', { class: 'budget-devise' }, '€'),
      el('input', {
        type: 'number', inputmode: 'decimal', min: 0, step: PAS_AJUSTEMENT, value: valeur,
        'data-chemin': chemin, 'data-type': 'montant', readonly: !enEdition(),
      }));

  const champTexte = (valeur, chemin, libelle) =>
    el('span', { class: 'budget-champ budget-champ-texte' },
      el('input', { type: 'text', maxlength: 60, value: valeur, 'data-chemin': chemin, 'aria-label': libelle }));

  const champDate = (valeur, chemin) =>
    el('span', { class: 'budget-champ budget-champ-date' },
      el('input', { type: 'date', value: valeur, 'data-chemin': chemin, 'aria-label': 'Échéance' }));

  const choixStatut = (valeur, chemin) =>
    el('select', { class: 'budget-select', 'data-chemin': chemin, 'aria-label': 'Statut' },
      ...Object.entries(STATUTS).map(([cle, s]) => el('option', { value: cle, selected: cle === valeur }, s.libelle)));

  const boutonSupprimer = (liste, index, libelle) =>
    el('button', {
      class: 'budget-bouton-pas', 'data-action': 'supprimer', 'data-liste': liste, 'data-index': index,
      'aria-label': `Supprimer ${libelle}`,
    }, '✕');

  const boutonAjouter = (liste, texte) => enEdition()
    && el('button', { class: 'budget-ajouter', 'data-action': 'ajouter', 'data-liste': liste }, `+ ${texte}`);

  const vide = (texte) => el('p', { class: 'budget-vide' }, texte);

  const badge = (statut) => el('span', { class: `budget-statut budget-statut-${statut}` },
    el('img', { src: icone(STATUTS[statut].icone), width: 5, height: 5, alt: '' }),
    STATUTS[statut].libelle);

  // ---- Sections ----

  function rendreApercu() {
    const d = courant();
    const lignes = [['Revenus', 'revenus'], ['Dépenses fixes', 'depensesFixes'], ['Dépenses variables', 'depensesVariables']];
    remplacer($('budget-chiffres'), 
      ...lignes.flatMap(([libelle, cle]) => [
        el('dt', { class: 'budget-libelle' }, libelle),
        el('dd', { class: 'budget-montant' }, enEdition() ? champMontant(d[cle], cle, false) : euros.format(d[cle])),
      ]),
      el('dt', { class: 'budget-libelle' }, 'Reste disponible'),
      el('dd', { class: 'budget-montant', id: 'budget-reste' }),
    );
  }

  function rendreEpargne() {
    const { epargne } = courant();
    for (const [id, cle] of [['budget-epargne-objectif', 'objectif'], ['budget-epargne-mois', 'ceMois']]) {
      $(id).value = epargne[cle];
      $(id).readOnly = !enEdition();
    }
    remplacer($('budget-comptes'), 
      ...epargne.comptes.map((c, i) => (enEdition()
        ? el('div', { class: 'budget-ligne-edition' },
          champTexte(c.nom, `epargne.comptes.${i}.nom`, 'Nom du compte'),
          champMontant(c.montant, `epargne.comptes.${i}.montant`),
          boutonSupprimer('epargne.comptes', i, c.nom))
        : el('div', { class: 'budget-ligne-texte' },
          el('span', { class: 'budget-libelle' }, c.nom),
          el('b', {}, euros.format(c.montant))))),
      !epargne.comptes.length && !enEdition() && vide('Aucun compte d\'épargne.'),
      boutonAjouter('epargne.comptes', 'Ajouter un compte'),
    );
  }

  function rendreCategories() {
    remplacer($('budget-categories'), ...courant().categories.map((c, i) =>
      el('div', { class: 'budget-categorie' },
        el('div', { class: 'budget-ligne-texte' },
          el('span', { class: c.alerte ? 'budget-libelle budget-texte-rose' : 'budget-libelle' }, c.nom),
          champMontant(c.budget, `categories.${i}.budget`)),
        el('div', { class: 'budget-jauge' },
          el('div', { class: `budget-jauge-remplie budget-couleur-${c.couleur}`, 'data-jauge': i })),
        enEdition()
          ? el('div', { class: 'budget-ajuster' },
            el('button', { class: 'budget-bouton-pas', 'data-action': 'moins', 'data-index': i, 'aria-label': `Réduire ${c.nom}` }, '−'),
            el('span', { class: 'budget-libelle' }, 'Ajuster'),
            el('button', { class: 'budget-bouton-pas', 'data-action': 'plus', 'data-index': i, 'aria-label': `Augmenter ${c.nom}` }, '+'),
            el('span', { class: 'budget-libelle budget-depense-libelle' }, 'Dépensé'),
            champMontant(c.depense, `categories.${i}.depense`))
          : el('span', { class: 'budget-libelle' }, `Dépensé : ${euros.format(c.depense)}`),
      )));
  }

  function rendreImprevus() {
    const d = courant();
    remplacer($('budget-imprevus'), 
      ...d.imprevus.map((x, i) => (enEdition()
        ? el('div', { class: 'budget-ligne-edition' },
          champTexte(x.libelle, `imprevus.${i}.libelle`, 'Libellé'),
          champMontant(x.montant, `imprevus.${i}.montant`),
          boutonSupprimer('imprevus', i, x.libelle))
        : el('div', { class: 'budget-ligne-texte budget-imprevu' },
          el('span', {}, x.libelle),
          champMontant(x.montant, `imprevus.${i}.montant`)))),
      !d.imprevus.length && !enEdition() && vide('Aucun imprévu ce mois-ci.'),
      boutonAjouter('imprevus', 'Ajouter un imprévu'),
    );
    remplacer($('budget-fonds-urgence'), 
      el('b', {}, 'Fonds d\'urgence'),
      enEdition()
        ? champMontant(d.fondsUrgence, 'fondsUrgence')
        : el('b', { class: 'budget-total-valeur budget-texte-emeraude' }, `${euros.format(d.fondsUrgence)} disponibles`),
    );
  }

  function rendreFactures() {
    const d = courant();

    remplacer($('budget-a-venir'), 
      ...d.facturesAVenir.map((f, i) => (enEdition()
        ? el('div', { class: 'budget-facture' },
          champTexte(f.fournisseur, `facturesAVenir.${i}.fournisseur`, 'Fournisseur'),
          el('div', { class: 'budget-ligne-edition' },
            champDate(f.echeance, `facturesAVenir.${i}.echeance`),
            champMontant(f.montant, `facturesAVenir.${i}.montant`),
            boutonSupprimer('facturesAVenir', i, f.fournisseur)))
        : el('div', { class: 'budget-facture' },
          el('div', { class: 'budget-ligne-texte' },
            el('b', {}, f.fournisseur),
            el('span', { class: 'budget-libelle' }, majuscule(dateCourte.format(dateDe(f.echeance))))),
          el('div', { class: 'budget-ligne-texte' },
            el('b', { class: 'budget-facture-montant' }, eurosCentimes.format(f.montant)),
            badge('a-payer'))))),
      !d.facturesAVenir.length && !enEdition() && vide('Aucune facture à venir.'),
      boutonAjouter('facturesAVenir', 'Ajouter une facture'),
    );

    remplacer($('budget-factures'), ...d.factures.map((f, i) => (enEdition()
      ? el('tr', {},
        el('td', {}, champTexte(f.fournisseur, `factures.${i}.fournisseur`, 'Fournisseur')),
        el('td', {}, champDate(f.echeance, `factures.${i}.echeance`)),
        el('td', { class: 'budget-droite' }, champMontant(f.montant, `factures.${i}.montant`)),
        el('td', { class: 'budget-droite' },
          el('span', { class: 'budget-ligne-edition budget-fin' },
            choixStatut(f.statut, `factures.${i}.statut`),
            boutonSupprimer('factures', i, f.fournisseur))))
      : el('tr', {},
        el('td', { class: 'budget-fournisseur' }, f.fournisseur),
        el('td', { class: 'budget-libelle' }, dateLongue.format(dateDe(f.echeance))),
        el('td', { class: 'budget-droite budget-gras' }, eurosCentimes.format(f.montant)),
        el('td', { class: 'budget-droite' }, badge(f.statut))))));
    remplacer($('budget-factures-ajout'), 
      !d.factures.length && !enEdition() && vide('Aucune facture enregistrée.'),
      boutonAjouter('factures', 'Ajouter une facture'),
    );
  }

  // ---- Valeurs calculées (mises à jour à chaque saisie, sans reconstruire les champs) ----

  function rendreCalculs() {
    const d = courant();
    const depenses = d.depensesFixes + d.depensesVariables;
    const reste = d.revenus - depenses;
    // Arrondi à l'inférieur : on n'affiche pas 100 % tant que tout n'est pas dépensé
    const utilise = d.revenus > 0 ? Math.min(100, Math.floor((depenses / d.revenus) * 100)) : 0;

    const rayon = 52;
    const circonference = 2 * Math.PI * rayon;
    remplacer($('budget-donut'), 
      svg('svg', { viewBox: '0 0 120 120', width: 120, height: 120, 'aria-hidden': 'true' },
        svg('circle', { cx: 60, cy: 60, r: rayon, class: 'budget-donut-fond' }),
        utilise > 0 && svg('circle', {
          cx: 60, cy: 60, r: rayon, class: 'budget-donut-arc',
          'stroke-dasharray': `${(circonference * utilise) / 100} ${circonference}`,
          transform: 'rotate(-90 60 60)',
        })),
      el('div', { class: 'budget-donut-texte' }, el('b', {}, `${utilise}%`), el('span', {}, 'Utilisé')),
    );

    const resteEl = $('budget-reste');
    resteEl.textContent = euros.format(reste);
    resteEl.className = `budget-montant ${reste >= 0 ? 'budget-texte-emeraude' : 'budget-texte-rose'}`;

    const { objectif, ceMois, comptes } = d.epargne;
    const pctEpargne = pourcent(ceMois, objectif);
    $('budget-epargne-pct').textContent = `${pctEpargne}%`;
    $('budget-epargne-jauge').style.width = `${pctEpargne}%`;
    $('budget-epargne-total').textContent = euros.format(somme(comptes, 'montant'));

    d.categories.forEach((c, i) => {
      racine.querySelector(`[data-jauge="${i}"]`).style.width = `${pourcent(c.depense, c.budget)}%`;
    });
    $('budget-total-ajuste').textContent = euros.format(somme(d.categories, 'budget'));
    $('budget-imprevus-total').textContent = euros.format(somme(d.imprevus, 'montant'));

    rendreEvolution(depenses);
  }

  // Mois clôturés (historique) + mois en cours
  function rendreEvolution(totalCourant) {
    const d = courant();
    const points = [...d.historique.slice(-5), { mois: d.mois, total: totalCourant }];
    const valeurs = points.map((p) => p.total);
    const L = 400, H = 110, marge = 12;
    const min = Math.min(...valeurs), max = Math.max(...valeurs);
    const dernier = points.length - 1;
    const x = (i) => (dernier === 0 ? L / 2 : marge + (i * (L - 2 * marge)) / dernier);
    const y = (v) => 20 + ((max - v) / (max - min || 1)) * (H - 40);
    const bulleX = Math.max(0, Math.min(x(dernier) - 30, L - 62));

    remplacer($('budget-courbe'), 
      svg('svg', { viewBox: `0 0 ${L} ${H}`, class: 'budget-courbe-svg', 'aria-hidden': 'true' },
        ...[0, 30, 60, 90].map((ligne) => svg('line', { x1: 0, x2: L, y1: ligne + 0.5, y2: ligne + 0.5, class: 'budget-courbe-grille' })),
        dernier > 0 && svg('polyline', { points: valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'budget-courbe-ligne' }),
        ...valeurs.map((v, i) => svg('circle', {
          cx: x(i), cy: y(v), r: i === dernier ? 4 : 2.5,
          class: i === dernier ? 'budget-courbe-point budget-courbe-actuel' : 'budget-courbe-point',
        })),
        svg('rect', { x: bulleX, y: y(valeurs[dernier]) - 30, width: 60, height: 18, rx: 4, class: 'budget-courbe-bulle' }),
        svg('text', { x: bulleX + 30, y: y(valeurs[dernier]) - 17, class: 'budget-courbe-bulle-texte' }, euros.format(valeurs[dernier])),
      ),
    );

    remplacer($('budget-courbe-mois'), ...points.map((p, i) => (i === dernier
      ? el('span', { class: 'budget-mois-actuel' }, `${majuscule(nomDuMois(p.mois, 'short'))} (Auj)`)
      : el('span', {}, majuscule(nomDuMois(p.mois, 'long').split(' ')[0])))));
  }

  function rendreTout() {
    racine.classList.toggle('budget-en-edition', enEdition());
    $('budget-mois').textContent = majuscule(nomDuMois(donnees.mois));
    rendreActions();
    rendreApercu();
    rendreEpargne();
    rendreCategories();
    rendreImprevus();
    rendreFactures();
    rendreCalculs();
  }

  // ================= ACTIONS =================

  async function enregistrer(bouton) {
    bouton.disabled = true;
    $('budget-erreur').hidden = true;
    try {
      donnees = await budgetEnregistrer(hass, jeton, brouillon);
      brouillon = null;
      rendreTout();
    } catch (e) {
      bouton.disabled = false;
      gererErreur(e, 'enregistrement');
    }
  }

  const lireMontant = (champ) => Math.max(0, Number.parseFloat(champ.value) || 0);

  racine.addEventListener('input', (e) => {
    const champ = e.target.closest('[data-chemin]');
    if (!champ || !enEdition()) return;
    ecrire(brouillon, champ.dataset.chemin, champ.dataset.type === 'montant' ? lireMontant(champ) : champ.value);
    rendreCalculs();
  });

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible || !hass) return;

    switch (cible.dataset.action) {
      case 'touche':
        if (code.length < LONGUEUR_CODE) code += cible.dataset.touche;
        rendrePoints();
        if (code.length === LONGUEUR_CODE) validerCode();
        break;
      case 'effacer':
        code = code.slice(0, -1);
        rendrePoints();
        break;
      case 'modifier':
        brouillon = structuredClone(donnees);
        rendreTout();
        break;
      case 'annuler':
        brouillon = null;
        $('budget-erreur').hidden = true;
        rendreTout();
        break;
      case 'enregistrer':
        enregistrer(cible);
        break;
      case 'verrouiller':
        verrouiller();
        break;
      case 'plus':
      case 'moins': {
        const i = Number(cible.dataset.index);
        const c = brouillon.categories[i];
        c.budget = Math.max(0, c.budget + (cible.dataset.action === 'plus' ? PAS_AJUSTEMENT : -PAS_AJUSTEMENT));
        racine.querySelector(`[data-chemin="categories.${i}.budget"]`).value = c.budget;
        rendreCalculs();
        break;
      }
      case 'ajouter':
        lire(brouillon, cible.dataset.liste).push(NOUVEL_ELEMENT[cible.dataset.liste]());
        rendreTout();
        break;
      case 'supprimer':
        lire(brouillon, cible.dataset.liste).splice(Number(cible.dataset.index), 1);
        rendreTout();
        break;
    }
  });

  // Toute interaction repousse le verrouillage automatique
  for (const evenement of ['pointerdown', 'keydown', 'input']) {
    racine.addEventListener(evenement, armerInactivite);
  }

  construireClavier();

  // ================= CYCLE DE VIE =================

  return {
    racine,

    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) afficherVerrou();
    },

    detruire() {
      clearTimeout(minuteurInactivite);
      clearTimeout(minuteurBlocage);
      if (jeton) budgetVerrouiller(hass, jeton).catch(() => {});
      jeton = null;
    },
  };
}
