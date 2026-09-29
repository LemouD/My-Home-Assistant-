// =============================================
// CONFIGURATIONS.JS — Vue Réglages de la tablette
// =============================================
// Foyer (nom, membres) : commandes maison/foyer/* avec le jeton du Budget (même code).
// Affichage et notifications : sans code. Appareils et abonnements : lecture seule, depuis hass.
// Mot de passe, 2FA, Zigbee, générateur, code du Budget : jamais ici (PC uniquement).
// Le jeton reste en mémoire et la session est refermée en quittant la page.

import { ajouterStyle, chargerGabarit, el, remplacer } from '../../js/dom.js';
import {
  aChange, budgetDeverrouiller, budgetEtat, budgetVerrouiller, foyerAffichage, foyerAjouterMembre, foyerLire,
  foyerModifierMembre, foyerNom, foyerNotifications, foyerRetirerMembre,
} from '../../js/ha.js';

// Pastilles proposées : nom (classe CSS) → couleur envoyée au serveur (#RRGGBB)
const COULEURS = {
  bleu: '#60A5FA', rose: '#F472B6', ambre: '#FBBF24', vert: '#34D399',
  violet: '#A78BFA', cyan: '#22D3EE', corail: '#FB7185', lavande: '#C7B8F2',
};
const NOM_COULEUR = Object.fromEntries(Object.entries(COULEURS).map(([n, hex]) => [hex, n]));
// Couleur hors palette (enregistrée par un autre client) : initiale en blanc si la teinte est sombre
const estSombre = (hex) => {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * v + 0.114 * b < 140;
};
const INACTIVITE_MS = 10 * 60 * 1000;   // comme la session côté serveur
const CONFIRMATION_MS = 5000;
const APPAREILS_MAX = 40;

const ERREURS = {
  prenom_pris: 'Ce prénom est déjà utilisé dans le foyer.',
  membres_max: 'Le foyer compte déjà 12 membres.',
  membre_absent: 'Ce membre a déjà été retiré.',
  donnees_invalides: 'Vérifiez le prénom : lettres, espaces, - et \' uniquement.',
  non_configure: 'Réglages indisponibles : l\'intégration Maison n\'est pas configurée.',
};
const message = (e) => ERREURS[e?.code] ?? 'Enregistrement impossible : Home Assistant injoignable.';

export async function monter({ config } = {}) {
  const racine = el('div', { class: 'vue-configurations' });
  racine.append(await chargerGabarit(new URL('./configurations.html', import.meta.url)));
  ajouterStyle(racine, new URL('./configurations.css', import.meta.url));
  const $ = (id) => racine.querySelector(`#${id}`);
  const foyerCarte = $('cfg-foyer');
  const formMembre = $('cfg-membre-formulaire');
  const formCode = $('cfg-code-formulaire');
  const modeles = {
    membre: $('cfg-modele-membre').content.firstElementChild,
    appareil: $('cfg-modele-appareil').content.firstElementChild,
    abonnement: $('cfg-modele-abonnement').content.firstElementChild,
  };

  let hass = null;
  let etat = null;            // réponse de maison/foyer/lire
  let jeton = null;
  let membreEdite = null;     // null : ajout ; sinon id du membre modifié
  let minuteurInactivite = null;
  let confirmation = null;    // { id, minuteur } : « Retirer » attend un second appui
  let occupe = false;

  // ---- MESSAGES ----

  function annoncer(noeud, texte, ok = false) {
    noeud.textContent = texte;
    noeud.hidden = !texte;
    noeud.classList.toggle('cfg-message-ok', ok);
    noeud.classList.toggle('cfg-message-erreur', !ok);
  }
  const annoncerPage = (texte, ok = false) => annoncer($('cfg-message'), texte, ok);

  // ---- FOYER ----

  function ligneMembre(membre) {
    const li = modeles.membre.cloneNode(true);
    const pastille = li.querySelector('.cfg-pastille');
    pastille.className = 'cfg-pastille';
    // Format #RRGGBB garanti par le serveur : utilisable tel quel en CSS
    pastille.style.setProperty('--cfg-couleur', membre.couleur);
    if (!NOM_COULEUR[membre.couleur] && estSombre(membre.couleur)) pastille.style.color = '#FFFFFF';
    pastille.textContent = membre.prenom.charAt(0).toUpperCase();
    li.querySelector('b').textContent = membre.prenom;

    const etiquette = li.querySelector('.cfg-etiquette');
    etiquette.className = `cfg-etiquette cfg-etiquette-${membre.role === 'parent' ? 'parent' : 'enfant'}`;
    etiquette.textContent = membre.role === 'parent' ? 'Parent' : 'Enfant';

    const lien = li.querySelector('.cfg-membre-lien');
    const personne = membre.personne && hass?.states[membre.personne];
    if (personne) lien.textContent = `Lié à ${personne.attributes.friendly_name ?? membre.personne} (Home Assistant)`;
    else lien.remove();

    const retirer = li.querySelector('[data-action="retirer-membre"]');
    li.querySelectorAll('[data-id]').forEach((b) => { b.dataset.id = membre.id; });
    const enConfirmation = confirmation?.id === membre.id;
    retirer.classList.toggle('cfg-confirmer', enConfirmation);
    retirer.textContent = enConfirmation ? 'Confirmer ?' : 'Retirer';
    return li;
  }

  function rendreFoyer() {
    foyerCarte.dataset.etat = jeton ? 'ouvert' : 'verrouille';
    $('cfg-foyer-nom').textContent = etat?.nom ?? '';
    const champNom = $('cfg-foyer-form').elements.nom_foyer;
    if (racine.getRootNode().activeElement !== champNom) champNom.value = etat?.nom ?? '';

    const membres = etat?.membres ?? [];
    $('cfg-membres-nombre').textContent = String(membres.length);
    remplacer($('cfg-membres'), membres.map(ligneMembre));
    $('cfg-membres-vide').hidden = membres.length > 0 || !etat;
    racine.querySelector('[data-action="ajouter-membre"]').disabled = membres.length >= (etat?.membresMax ?? 12);
  }

  // ---- AFFICHAGE ET NOTIFICATIONS ----

  function rendreReglages() {
    racine.querySelectorAll('[data-cle]').forEach((b) => {
      b.setAttribute('aria-pressed', String(String(etat?.affichage?.[b.dataset.cle]) === b.dataset.valeur));
      b.disabled = !etat;
    });
    racine.querySelectorAll('[data-notif]').forEach((c) => {
      c.checked = Boolean(etat?.notifications?.[c.dataset.notif]);
      c.disabled = !etat;
    });
  }

  function rendre() {
    rendreFoyer();
    rendreReglages();
  }

  async function charger() {
    try {
      etat = await foyerLire(hass);
    } catch (e) {
      etat = null;
      annoncerPage(e?.code === 'non_configure' ? ERREURS.non_configure
        : 'Réglages indisponibles : mettez à jour l\'intégration Maison.');
      console.warn('Réglages : lecture impossible', e?.code ?? '');
    }
    rendre();
  }

  // Réglage sans code : l'interface suit tout de suite, puis l'état renvoyé par le serveur
  async function enregistrerSansCode(envoi) {
    try {
      etat = await envoi();
      annoncerPage('');
    } catch (e) {
      annoncerPage(message(e));
    }
    rendreReglages();
  }

  // ---- SESSION (code du Budget) ----

  function armerInactivite() {
    clearTimeout(minuteurInactivite);
    if (jeton) minuteurInactivite = setTimeout(() => verrouiller('Foyer verrouillé après inactivité.', true), INACTIVITE_MS);
  }

  function verrouiller(texte = '', ok = false) {
    if (jeton) budgetVerrouiller(hass, jeton).catch(() => {});
    jeton = null;
    clearTimeout(minuteurInactivite);
    fermerMembre();
    annoncerPage(texte, ok);
    rendreFoyer();
  }

  // Commande avec jeton : session expirée → retour au code, sinon message dans la page ou la fenêtre
  async function avecJeton(envoi, zoneMessage = $('cfg-message')) {
    if (occupe) return false;
    occupe = true;
    try {
      etat = await envoi(jeton);
      armerInactivite();
      annoncerPage('');
      rendre();
      return true;
    } catch (e) {
      if (e?.code === 'session_invalide') {
        verrouiller('Session expirée : saisissez à nouveau le code.');
      } else {
        annoncer(zoneMessage, message(e));
        if (e?.code === 'membre_absent') await charger();
      }
      return false;
    } finally {
      occupe = false;
    }
  }

  async function ouvrirCode() {
    formCode.reset();
    annoncer($('cfg-code-message'), '');
    $('cfg-voile-code').hidden = false;
    formCode.elements.code.focus();
    try {
      const { attente } = await budgetEtat(hass);
      if (attente > 0) annoncer($('cfg-code-message'), `Trop d'essais : réessayez dans ${attente} s.`);
    } catch {
      // État illisible : le déverrouillage renverra l'erreur
    }
  }

  const fermerCode = () => { $('cfg-voile-code').hidden = true; };

  async function validerCode() {
    const code = formCode.elements.code.value.trim();
    if (!/^\d{6}$/.test(code)) {
      annoncer($('cfg-code-message'), 'Le code comporte 6 chiffres.');
      return;
    }
    formCode.elements.code.value = '';
    try {
      jeton = (await budgetDeverrouiller(hass, code)).jeton;
      fermerCode();
      armerInactivite();
      annoncerPage('');
      rendreFoyer();
    } catch (e) {
      let texte = 'Déverrouillage impossible.';
      if (e?.code === 'code_invalide' || e?.code === 'bloque') {
        const etatCode = await budgetEtat(hass).catch(() => null);
        texte = etatCode?.attente > 0 ? `Trop d'essais : réessayez dans ${etatCode.attente} s.`
          : `Code incorrect. ${etatCode?.essaisRestants ?? ''} essai(s) restant(s).`.replace('  ', ' ');
      } else if (e?.code === 'non_configure') {
        texte = ERREURS.non_configure;
      }
      annoncer($('cfg-code-message'), texte);
    }
  }

  // ---- FORMULAIRE MEMBRE ----

  function remplirPersonnes(choisie) {
    const personnes = Object.values(hass?.states ?? {})
      .filter((s) => s.entity_id.startsWith('person.'))
      .sort((a, b) => (a.attributes.friendly_name ?? '').localeCompare(b.attributes.friendly_name ?? '', 'fr'));
    remplacer($('cfg-personne'),
      el('option', { value: '' }, 'Aucune'),
      personnes.map((p) => el('option', { value: p.entity_id }, p.attributes.friendly_name ?? p.entity_id)));
    $('cfg-personne').value = personnes.some((p) => p.entity_id === choisie) ? choisie : '';
  }

  function ouvrirMembre(id = null) {
    const membre = etat?.membres.find((m) => m.id === id) ?? null;
    membreEdite = membre?.id ?? null;
    formMembre.reset();
    $('cfg-membre-titre').textContent = membre ? `Modifier ${membre.prenom}` : 'Ajouter un membre';
    formMembre.elements.prenom.value = membre?.prenom ?? '';
    formMembre.elements.couleur.value = NOM_COULEUR[membre?.couleur] ?? 'bleu';
    formMembre.elements.role.value = membre?.role ?? 'enfant';
    remplirPersonnes(membre?.personne ?? '');
    annoncer($('cfg-membre-message'), '');
    $('cfg-voile').hidden = false;
    formMembre.elements.prenom.focus();
  }

  function fermerMembre() {
    $('cfg-voile').hidden = true;
    membreEdite = null;
  }

  async function enregistrerMembre() {
    const champs = formMembre.elements;
    const prenom = champs.prenom.value.replace(/\s+/g, ' ').trim();
    if (!prenom) {
      annoncer($('cfg-membre-message'), 'Indiquez un prénom.');
      return;
    }
    const membre = {
      prenom,
      couleur: COULEURS[champs.couleur.value] ?? COULEURS.bleu,
      role: champs.role.value === 'parent' ? 'parent' : 'enfant',
      personne: champs.personne.value || null,
    };
    const ok = await avecJeton((j) => (membreEdite
      ? foyerModifierMembre(hass, j, membreEdite, membre)
      : foyerAjouterMembre(hass, j, membre)), $('cfg-membre-message'));
    if (ok) fermerMembre();
  }

  // « Retirer » : premier appui = confirmation, second appui dans les 5 s = retrait
  async function retirerMembre(id) {
    if (confirmation?.id !== id) {
      clearTimeout(confirmation?.minuteur);
      confirmation = { id, minuteur: setTimeout(() => { confirmation = null; rendreFoyer(); }, CONFIRMATION_MS) };
      rendreFoyer();
      return;
    }
    clearTimeout(confirmation.minuteur);
    confirmation = null;
    if (await avecJeton((j) => foyerRetirerMembre(hass, j, id))) annoncerPage('Membre retiré.', true);
  }

  // ---- APPAREILS ET ABONNEMENTS (lecture seule) ----

  // Appareil « connecté » si au moins une de ses entités n'est pas indisponible
  function rendreAppareils() {
    const entitesParAppareil = {};
    for (const [id, entite] of Object.entries(hass.entities ?? {})) {
      if (entite.device_id && hass.states[id]) (entitesParAppareil[entite.device_id] ??= []).push(hass.states[id]);
    }
    const appareils = Object.values(hass.devices ?? {})
      .filter((d) => d.entry_type !== 'service' && !d.disabled_by && entitesParAppareil[d.id])
      .map((d) => ({
        nom: d.name_by_user || d.name || 'Appareil',
        piece: hass.areas?.[d.area_id]?.name ?? 'Sans pièce',
        connecte: entitesParAppareil[d.id].some((s) => s.state !== 'unavailable'),
      }))
      .sort((a, b) => a.piece.localeCompare(b.piece, 'fr') || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, APPAREILS_MAX);

    remplacer($('cfg-appareils'), appareils.map((a) => {
      const li = modeles.appareil.cloneNode(true);
      li.querySelector('b').textContent = a.nom;
      li.querySelector('.cfg-ligne-texte > span').textContent = a.piece;
      const etatAppareil = li.querySelector('.cfg-etat');
      etatAppareil.className = `cfg-etat ${a.connecte ? 'cfg-etat-ok' : 'cfg-etat-ko'}`;
      etatAppareil.textContent = a.connecte ? 'Connecté' : 'Hors ligne';
      return li;
    }));
    $('cfg-appareils-vide').hidden = appareils.length > 0;
  }

  // Abonnements : entités déclarées dans config.js (CONFIGURATIONS.abonnements)
  function detailAbonnement(s) {
    const classe = s.attributes.device_class;
    if (classe === 'date' || classe === 'timestamp') {
      const date = new Date(s.state);
      return Number.isNaN(date.getTime()) ? ['', ''] : [`Renouvellement le ${date.toLocaleDateString('fr-FR')}`, ''];
    }
    const unite = s.attributes.unit_of_measurement ?? '';
    const nombre = Number(s.state);
    if (classe === 'monetary' && Number.isFinite(nombre)) {
      return ['', `${nombre.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unite}`.trim()];
    }
    return [`${s.state} ${unite}`.trim(), ''];
  }

  function rendreAbonnements() {
    const ids = config?.CONFIGURATIONS?.abonnements ?? [];
    const lignes = ids.map((id) => hass.states[id]).filter((s) => s && s.state !== 'unavailable').map((s) => {
      const li = modeles.abonnement.cloneNode(true);
      const [detail, valeur] = detailAbonnement(s);
      li.querySelector('b').textContent = s.attributes.friendly_name ?? s.entity_id;
      li.querySelector('.cfg-ligne-texte > span').textContent = detail;
      const zoneValeur = li.querySelector('.cfg-valeur');
      if (valeur) zoneValeur.textContent = valeur;
      else zoneValeur.remove();
      return li;
    });
    remplacer($('cfg-abonnements'), lignes);
    $('cfg-abonnements-vide').hidden = lignes.length > 0;
  }

  // ---- ÉVÉNEMENTS ----

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action], [data-cle]');
    if (!cible || cible.disabled) return;
    if (jeton) armerInactivite();

    if (cible.dataset.cle) {
      const valeur = cible.dataset.cle === 'rafraichissement' ? Number(cible.dataset.valeur) : cible.dataset.valeur;
      if (String(etat?.affichage?.[cible.dataset.cle]) === cible.dataset.valeur) return;
      racine.querySelectorAll(`[data-cle="${cible.dataset.cle}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b === cible)));
      enregistrerSansCode(() => foyerAffichage(hass, { [cible.dataset.cle]: valeur }));
      return;
    }

    switch (cible.dataset.action) {
      case 'deverrouiller': ouvrirCode(); break;
      case 'verrouiller': verrouiller('Foyer verrouillé.', true); break;
      case 'fermer-code': fermerCode(); break;
      case 'ajouter-membre': ouvrirMembre(); break;
      case 'modifier-membre': ouvrirMembre(cible.dataset.id); break;
      case 'retirer-membre': retirerMembre(cible.dataset.id); break;
      case 'fermer-membre': fermerMembre(); break;
      default: break;
    }
  });

  racine.addEventListener('change', (e) => {
    const interrupteur = e.target.closest('[data-notif]');
    if (!interrupteur) return;
    enregistrerSansCode(() => foyerNotifications(hass, { [interrupteur.dataset.notif]: interrupteur.checked }));
  });

  $('cfg-foyer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = e.target.elements.nom_foyer.value.replace(/\s+/g, ' ').trim();
    if (!nom) {
      annoncerPage('Indiquez un nom de foyer.');
      return;
    }
    if (nom === etat?.nom) return;
    if (await avecJeton((j) => foyerNom(hass, j, nom))) {
      e.target.elements.nom_foyer.blur();
      annoncerPage('Nom du foyer enregistré.', true);
    }
  });

  formMembre.addEventListener('submit', (e) => {
    e.preventDefault();
    enregistrerMembre();
  });

  formCode.addEventListener('submit', (e) => {
    e.preventDefault();
    validerCode();
  });

  // ---- CYCLE DE VIE ----

  rendre();

  return {
    racine,
    maj(nouveau) {
      const avant = hass;
      hass = nouveau;
      if (!avant) charger();
      // Personnes, abonnements et registres d'appareils : seuls éléments de hass lus par la vue
      const suivis = [...Object.keys(nouveau.states).filter((id) => id.startsWith('person.')),
        ...(config?.CONFIGURATIONS?.abonnements ?? [])];
      if (avant && !aChange(avant, nouveau, suivis) && avant.devices === nouveau.devices
        && avant.entities === nouveau.entities && avant.areas === nouveau.areas) return;
      rendreAppareils();
      rendreAbonnements();
      if (etat) rendreFoyer();
    },
    detruire() {
      clearTimeout(minuteurInactivite);
      clearTimeout(confirmation?.minuteur);
      if (jeton) budgetVerrouiller(hass, jeton).catch(() => {});
      jeton = null;
    },
  };
}
