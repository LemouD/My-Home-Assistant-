// =============================================
// MOCK-FOYER.JS — Commandes maison/foyer/* simulées pour le mode dev
// =============================================
// Même contrat que l'intégration « maison » : nom du foyer, membres, affichage, notifications.
// Nom, membres et changement de nom demandent un jeton Budget ; affichage et notifications non.
// Prénoms fictifs.

const LISTES = {
  theme: ['sombre', 'clair'],
  format_date: ['JJ/MM/AAAA', 'AAAA-MM-JJ'],
  temperature: ['celsius', 'fahrenheit'],
  rafraichissement: [5, 30, 60],
};
const NOTIFICATIONS = ['energie', 'factures', 'budget', 'calendrier', 'courses', 'securite', 'silencieux'];
const ROLES = ['parent', 'enfant'];
const MEMBRES_MAX = 12;

// Comme le serveur : espaces réduits, ’ changé en ', lettres/espaces/-/' avec au moins une lettre
const nettoyer = (valeur) => (typeof valeur === 'string' ? valeur.replace(/\s+/g, ' ').trim().normalize('NFC').replaceAll('’', "'") : '');
const texteValide = (valeur, max) => valeur.length >= 1 && valeur.length <= max && /^[\p{L} '-]+$/u.test(valeur) && /\p{L}/u.test(valeur);
const COULEUR = /^#[0-9A-Fa-f]{6}$/;
const PERSONNE = /^person\.[a-z0-9_]{1,60}$/;

// Comparaison des prénoms insensible à la casse et aux accents
const cle = (texte) => texte.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[\s'-]+/g, ' ').trim().toLowerCase();
const nouvelId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((o) => o.toString(16).padStart(2, '0')).join('');

export function creerFoyerSimule({ erreur, jetonValide }) {
  const etat = {
    nom: 'Foyer démo',
    membres: [
      { id: nouvelId(), prenom: 'Membre un', couleur: '#4A9EFF', role: 'parent', personne: 'person.membre_1' },
      { id: nouvelId(), prenom: 'Membre deux', couleur: '#F39C12', role: 'parent', personne: 'person.membre_2' },
      { id: nouvelId(), prenom: 'Enfant', couleur: '#2ECC71', role: 'enfant', personne: null },
    ],
    affichage: { theme: 'sombre', format_date: 'JJ/MM/AAAA', temperature: 'celsius', rafraichissement: 30 },
    notifications: { energie: true, factures: true, budget: false, calendrier: true, courses: true, securite: true, silencieux: false },
  };

  const invalide = () => erreur('donnees_invalides', 'Données invalides');
  const lire = () => ({ ...structuredClone(etat), membresMax: MEMBRES_MAX });
  const verifierJeton = (jeton) => {
    if (!jetonValide(jeton)) throw erreur('session_invalide', 'Session invalide');
  };

  // Valide un membre complet (après fusion) ; renvoie la version normalisée
  function valider(membre, idIgnore = null) {
    const prenom = nettoyer(membre.prenom);
    if (!texteValide(prenom, 30) || !COULEUR.test(membre.couleur ?? '') || !ROLES.includes(membre.role)) throw invalide();
    const personne = membre.personne || null;
    if (personne && !PERSONNE.test(personne)) throw invalide();
    if (etat.membres.some((m) => m.id !== idIgnore && cle(m.prenom) === cle(prenom))) {
      throw erreur('prenom_pris', 'Prénom déjà utilisé');
    }
    return { prenom, couleur: membre.couleur.toUpperCase(), role: membre.role, personne };
  }

  function trouver(id) {
    const membre = etat.membres.find((m) => m.id === id);
    if (!membre) throw erreur('membre_absent', 'Membre introuvable');
    return membre;
  }

  // Mise à jour partielle d'une section à listes fermées ou booléens
  function fusionner(section, partiel, accepte) {
    if (!partiel || typeof partiel !== 'object' || !Object.keys(partiel).length) throw invalide();
    for (const [c, v] of Object.entries(partiel)) {
      if (!accepte(c, v)) throw invalide();
    }
    Object.assign(etat[section], partiel);
    return lire();
  }

  function commande(message) {
    switch (message.type) {
      case 'maison/foyer/lire':
        return lire();
      case 'maison/foyer/affichage':
        return fusionner('affichage', message.affichage, (c, v) => LISTES[c]?.includes(v));
      case 'maison/foyer/notifications':
        return fusionner('notifications', message.notifications, (c, v) => NOTIFICATIONS.includes(c) && typeof v === 'boolean');
      case 'maison/foyer/nom': {
        verifierJeton(message.jeton);
        const nom = nettoyer(message.nom);
        if (!texteValide(nom, 40)) throw invalide();
        etat.nom = nom;
        return lire();
      }
      case 'maison/foyer/membre/ajouter': {
        verifierJeton(message.jeton);
        if (etat.membres.length >= MEMBRES_MAX) throw erreur('membres_max', 'Nombre maximal de membres atteint');
        const membre = valider({ role: 'enfant', ...message.membre });
        etat.membres.push({ id: nouvelId(), ...membre });
        return lire();
      }
      case 'maison/foyer/membre/modifier': {
        verifierJeton(message.jeton);
        const membre = trouver(message.membre_id);
        const modification = message.modification ?? {};
        if (Object.keys(modification).some((c) => !['prenom', 'couleur', 'role', 'personne'].includes(c))) throw invalide();
        Object.assign(membre, valider({ ...membre, ...modification }, membre.id));
        return lire();
      }
      case 'maison/foyer/membre/retirer': {
        verifierJeton(message.jeton);
        trouver(message.membre_id);
        etat.membres = etat.membres.filter((m) => m.id !== message.membre_id);
        return lire();
      }
      default:
        throw erreur('unknown_command', message.type);
    }
  }

  return { etat, commande };
}
