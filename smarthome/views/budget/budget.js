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
const HISTORIQUE_REPLIE = 3; // factures affichées tant que l'historique n'est pas déplié

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
  let historiqueDeplie = false;

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

  // Au verrouillage, les montants sont retirés du DOM (et pas seulement masqués) :
  // ils ne restent pas lisibles dans les outils de développement. rendreTout() reconstruit tout.
  function viderContenu() {
    for (const id of ['budget-chiffres', 'budget-donut', 'budget-courbe', 'budget-categories', 'budget-comptes',
      'budget-imprevus', 'budget-fonds-urgence', 'budget-a-venir', 'budget-factures', 'budget-factures-ajout',
      'budget-historique-plus']) {
      remplacer($(id));
    }
    for (const id of ['budget-reste', 'budget-reste-detail', 'budget-depense-total', 'budget-epargne-resume',
      'budget-epargne-pct', 'budget-epargne-total', 'budget-total-ajuste', 'budget-imprevus-total', 'budget-erreur']) {
      $(id).textContent = '';
    }
    $('budget-epargne-objectif').value = '';
    $('budget-epargne-mois').value = '';
    $('budget-epargne-jauge').style.width = '0%';
  }

  function afficherVerrou(texte = '') {
    clearTimeout(minuteurInactivite);
    historiqueDeplie = false;
    jeton = null;
    donnees = null;
    brouillon = null;
    code = '';
    viderContenu();
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
    else if (jeton) boutons = [bouton('modifier', 'Modifier le mois', true), bouton('verrouiller', 'Verrouiller')];
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
      ...lignes.map(([libelle, cle]) => el('div', { class: 'budget-chiffre-ligne' },
        el('dt', { class: 'budget-libelle' }, libelle),
        el('dd', { class: 'budget-gras' }, enEdition() ? champMontant(d[cle], cle) : euros.format(d[cle])),
      )),
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
          el('span', { class: c.alerte ? 'budget-categorie-nom budget-texte-rose' : 'budget-categorie-nom' }, c.nom),
          enEdition()
            ? champMontant(c.budget, `categories.${i}.budget`)
            : el('span', { class: 'budget-libelle' },
              el('b', { class: 'budget-categorie-depense' }, euros.format(c.depense)), ` / ${euros.format(c.budget)}`)),
        el('div', { class: 'budget-jauge' },
          el('div', { class: `budget-jauge-remplie budget-couleur-${c.couleur}`, 'data-jauge': i })),
        enEdition()
          ? el('div', { class: 'budget-ajuster' },
            el('button', { class: 'budget-bouton-pas', 'data-action': 'moins', 'data-index': i, 'aria-label': `Réduire ${c.nom}` }, '−'),
            el('span', { class: 'budget-libelle' }, 'Ajuster'),
            el('button', { class: 'budget-bouton-pas', 'data-action': 'plus', 'data-index': i, 'aria-label': `Augmenter ${c.nom}` }, '+'),
            el('span', { class: 'budget-libelle budget-depense-libelle' }, 'Dépensé'),
            champMontant(c.depense, `categories.${i}.depense`))
          : null,
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
          el('b', {}, euros.format(x.montant))))),
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

    const enRetard = enEdition() ? [] : d.factures.filter((f) => f.statut === 'retard');
    remplacer($('budget-a-venir'),
      ...enRetard.map((f) => el('div', { class: 'budget-facture budget-facture-retard' },
        el('div', { class: 'budget-ligne-texte' },
          el('b', {}, f.fournisseur),
          el('span', { class: 'budget-libelle' }, majuscule(dateCourte.format(dateDe(f.echeance))))),
        el('div', { class: 'budget-ligne-texte' },
          el('b', { class: 'budget-facture-montant' }, eurosCentimes.format(f.montant)),
          badge('retard')))),
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
      !d.facturesAVenir.length && !enRetard.length && !enEdition() && vide('Rien à payer pour le moment.'),
      boutonAjouter('facturesAVenir', 'Ajouter une facture'),
    );

    // Index conservé pour les chemins d'édition ; hors édition, la plus récente en premier
    const triees = d.factures.map((f, i) => ({ f, i }))
      .sort((a, b) => (enEdition() ? a.i - b.i : b.f.echeance.localeCompare(a.f.echeance)));
    const replie = !enEdition() && !historiqueDeplie && triees.length > HISTORIQUE_REPLIE;
    const visibles = replie ? triees.slice(0, HISTORIQUE_REPLIE) : triees;

    remplacer($('budget-factures'), ...visibles.map(({ f, i }) => (enEdition()
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
    remplacer($('budget-historique-plus'),
      !enEdition() && triees.length > HISTORIQUE_REPLIE && el('button', {
        class: 'budget-bouton', 'data-action': 'historique', 'aria-expanded': historiqueDeplie ? 'true' : 'false',
      }, historiqueDeplie ? 'Réduire' : `Tout afficher (${triees.length})`),
    );
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

    const rayon = 30;
    const circonference = 2 * Math.PI * rayon;
    remplacer($('budget-donut'),
      svg('svg', { viewBox: '0 0 72 72', width: 72, height: 72, 'aria-hidden': 'true' },
        svg('circle', { cx: 36, cy: 36, r: rayon, class: 'budget-donut-fond' }),
        utilise > 0 && svg('circle', {
          cx: 36, cy: 36, r: rayon, class: 'budget-donut-arc',
          'stroke-dasharray': `${(circonference * utilise) / 100} ${circonference}`,
          transform: 'rotate(-90 36 36)',
        })),
      el('b', { class: 'budget-donut-texte' }, `${utilise} %`),
    );
    $('budget-depense-total').textContent = euros.format(depenses);

    const resteEl = $('budget-reste');
    resteEl.textContent = euros.format(reste);
    resteEl.className = `budget-kpi-valeur ${reste >= 0 ? 'budget-texte-emeraude' : 'budget-texte-rose'}`;
    $('budget-reste-detail').textContent = `sur ${euros.format(d.revenus)} de revenus`;

    const { objectif, ceMois, comptes } = d.epargne;
    const pctEpargne = pourcent(ceMois, objectif);
    $('budget-epargne-resume').textContent = `${euros.format(ceMois)} / ${euros.format(objectif)}`;
    $('budget-epargne-pct').textContent = `${pctEpargne} %`;
    $('budget-epargne-jauge').style.width = `${pctEpargne}%`;
    $('budget-epargne-total').textContent = euros.format(somme(comptes, 'montant'));

    d.categories.forEach((c, i) => {
      racine.querySelector(`[data-jauge="${i}"]`).style.width = `${pourcent(c.depense, c.budget)}%`;
    });
    $('budget-total-ajuste').textContent = euros.format(somme(d.categories, 'budget'));
    $('budget-imprevus-total').textContent = euros.format(somme(d.imprevus, 'montant'));

    rendreEvolution(depenses);
  }

  // Mois clôturés (historique) + mois en cours, en barres.
  // La ligne pointillée marque le budget prévu (somme des budgets par catégorie).
  function rendreEvolution(totalCourant) {
    const d = courant();
    const points = [...d.historique.slice(-5), { mois: d.mois, total: totalCourant }];
    const prevu = somme(d.categories, 'budget');
    // 10 % de marge au-dessus de la valeur la plus haute, pour que la ligne pointillée reste lisible
    const max = Math.max(prevu, ...points.map((p) => p.total), 1) * 1.1;
    const dernier = points.length - 1;
    const hauteur = (v) => `${Math.round((v / max) * 100)}%`;

    remplacer($('budget-courbe'),
      el('div', { class: 'budget-barres-zone' },
        prevu > 0 && el('div', { class: 'budget-barres-prevu', style: `bottom: ${hauteur(prevu)}` }),
        ...points.map((p, i) => el('div', { class: 'budget-barre-colonne' },
          el('div', {
            class: [
              'budget-barre',
              i === dernier && 'budget-barre-actuelle',
              prevu > 0 && p.total > prevu && 'budget-barre-depasse',
            ].filter(Boolean).join(' '),
            style: `height: ${hauteur(p.total)}`,
          })))),
      el('div', { class: 'budget-barres-legendes' },
        ...points.map((p, i) => el('div', { class: i === dernier ? 'budget-barre-legende budget-mois-actuel' : 'budget-barre-legende' },
          el('b', {}, euros.format(p.total)),
          el('span', {}, i === dernier ? 'Ce mois' : majuscule(nomDuMois(p.mois, 'short')))))),
    );
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
      case 'historique':
        historiqueDeplie = !historiqueDeplie;
        rendreFactures();
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
