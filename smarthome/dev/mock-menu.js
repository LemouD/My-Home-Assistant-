// =============================================
// MOCK-MENU.JS — Commandes maison/menu/* simulées pour le mode dev
// =============================================
// Même contrat que custom_components/maison (websocket_menu.py) : quota, créneaux rejetés,
// erreurs. Recettes fictives et halal ; aucun appel réseau.
// Depuis la console : mock.menu.indisponible = true (erreur du générateur), mock.menu.vider().

const DELAI_GENERATION_MS = 1500;

const RECETTES = {
  jus: [
    { nom: 'Orange et carotte', duree_min: 10, tags: ['vitaminé'], ingredients: [['Oranges', 4, 'piece', 'fruits-legumes'], ['Carottes', 3, 'piece', 'fruits-legumes']] },
    { nom: 'Pomme et gingembre', duree_min: 10, tags: ['tonique'], ingredients: [['Pommes', 4, 'piece', 'fruits-legumes'], ['Gingembre frais', 20, 'g', 'fruits-legumes']] },
    { nom: 'Concombre et menthe', duree_min: 10, tags: ['léger'], ingredients: [['Concombre', 1, 'piece', 'fruits-legumes'], ['Menthe', 1, 'botte', 'fruits-legumes'], ['Citron', 1, 'piece', 'fruits-legumes']] },
  ],
  diner: [
    { nom: 'Poulet yassa', duree_min: 45, tags: ['familial', 'sénégalais'], ingredients: [['Cuisses de poulet halal', 4, 'piece', 'boucherie'], ['Oignons', 4, 'piece', 'fruits-legumes'], ['Citrons', 3, 'piece', 'fruits-legumes'], ['Moutarde', 45, 'g', 'epicerie'], ['Riz', 280, 'g', 'epicerie']] },
    { nom: 'Soupe de lentilles corail', duree_min: 35, tags: ['végétarien'], ingredients: [['Lentilles corail', 250, 'g', 'epicerie'], ['Carottes', 2, 'piece', 'fruits-legumes'], ['Lait de coco', 20, 'cl', 'epicerie'], ['Oignons', 1, 'piece', 'fruits-legumes']] },
    { nom: 'Tajine de légumes', duree_min: 50, tags: ['économique'], ingredients: [['Courgettes', 2, 'piece', 'fruits-legumes'], ['Pois chiches', 1, 'boite', 'epicerie'], ['Tomates', 500, 'g', 'fruits-legumes'], ['Ras el hanout', 1, 'cas', 'epicerie']] },
    { nom: 'Saumon au four et riz', duree_min: 30, tags: ['poisson'], ingredients: [['Pavés de saumon', 4, 'piece', 'poissonnerie'], ['Riz', 300, 'g', 'epicerie'], ['Citron', 1, 'piece', 'fruits-legumes'], ['Crème fraîche', 20, 'cl', 'cremerie']] },
    { nom: 'Pâtes à la tomate', duree_min: 25, tags: ['rapide', 'enfants'], ingredients: [['Pâtes', 500, 'g', 'epicerie'], ['Tomates', 800, 'g', 'fruits-legumes'], ['Ail', 2, 'piece', 'fruits-legumes'], ['Parmesan', 60, 'g', 'cremerie']] },
  ],
};
const ETAPES = [
  'Préparer et laver les ingrédients.',
  'Cuire à feu moyen en remuant régulièrement.',
  'Rectifier l\'assaisonnement et servir chaud.',
];

// Même règle que menu.normaliser_nom côté serveur
function normaliserNom(texte) {
  return texte.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean)
    .map((m) => (m.length > 3 && /[sx]$/.test(m) && !m.endsWith('ss') ? m.slice(0, -1) : m))
    .join(' ');
}

const LIBELLES_UNITES = { piece: 'pièce', cas: 'c. à s.', cac: 'c. à c.', pincee: 'pincée', botte: 'botte', tranche: 'tranche', boite: 'boîte' };
const resume = (nom, qte, unite) => {
  if (!qte) return nom;
  const libelle = unite === 'autre' ? '' : (LIBELLES_UNITES[unite] ?? unite);
  const s = LIBELLES_UNITES[unite] && !['cas', 'cac'].includes(unite) && qte > 1 ? 's' : '';
  return `${nom} — ${qte}${libelle ? ` ${libelle}${s}` : ''}`;
};

export function creerMenuSimule({ erreur, courses }) {
  const etat = {
    repasActives: ['jus', 'diner'],
    quota: { utilise: 1, max: 3 },
    enCours: false,
    indisponible: false,
    menu: null,
    tirage: 0,
  };

  let compteur = 0;
  function recette(repas, personnes) {
    const liste = RECETTES[repas] ?? RECETTES.diner;
    const modele = liste[etat.tirage++ % liste.length];
    compteur += 1;
    return {
      id: `r${compteur}`,
      nom: modele.nom,
      portions: personnes,
      duree_min: modele.duree_min,
      tags: modele.tags,
      etapes: ETAPES,
      ingredients: modele.ingredients.map(([nom, quantite, unite, rayon]) => ({ nom, quantite, unite, rayon })),
    };
  }

  function construire(parametres) {
    const repas = etat.repasActives.filter((r) => parametres.repas.includes(r));
    if (!repas.length) throw erreur('parametres_invalides', 'Aucun repas activé');
    const recettes = {};
    const debut = new Date();
    const jours = Array.from({ length: parametres.jours }, (_, i) => {
      const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
      const creneaux = {};
      repas.forEach((r, j) => {
        // Un créneau rejeté pour montrer « Plat non conforme retiré »
        if (i === 2 && j === repas.length - 1) {
          creneaux[r] = { rejete: true, motif: 'allergie' };
          return;
        }
        const nouvelle = recette(r, parametres.personnes);
        recettes[nouvelle.id] = nouvelle;
        creneaux[r] = { recette: nouvelle.id };
      });
      return { date: d.toLocaleDateString('sv-SE'), repas: creneaux };
    });
    return { id: `m${Date.now()}`, cree: new Date().toISOString(), parametres: { ...parametres, repas }, jours, recettes };
  }

  function consommerQuota() {
    if (etat.quota.utilise >= etat.quota.max) throw erreur('quota_atteint', 'Quota atteint');
    if (etat.enCours) throw erreur('generation_en_cours', 'Génération en cours');
    etat.quota.utilise += 1;   // compté avant l'appel, comme le serveur
  }

  async function generer(parametres) {
    consommerQuota();
    etat.enCours = true;
    try {
      await new Promise((r) => setTimeout(r, DELAI_GENERATION_MS));
      if (etat.indisponible) throw erreur('generation_indisponible', 'Générateur injoignable');
      etat.menu = construire(parametres);
      return structuredClone(etat.menu);
    } finally {
      etat.enCours = false;
    }
  }

  async function remplacerPlat(date, repas) {
    const jour = etat.menu?.jours.find((j) => j.date === date);
    if (!etat.menu) throw erreur('menu_absent', 'Aucun menu');
    if (!jour || !(repas in jour.repas)) throw erreur('parametres_invalides', 'Créneau inconnu');
    consommerQuota();
    await new Promise((r) => setTimeout(r, DELAI_GENERATION_MS / 2));
    if (etat.indisponible) throw erreur('generation_indisponible', 'Générateur injoignable');
    const nouvelle = recette(repas, etat.menu.parametres.personnes);
    etat.menu.recettes[nouvelle.id] = nouvelle;
    jour.repas[repas] = { recette: nouvelle.id };
    return structuredClone(etat.menu);
  }

  // Ingrédients → articles todo au format commun ; quantités additionnées sur un article non coché
  function versCourses(ids) {
    if (!etat.menu) throw erreur('menu_absent', 'Aucun menu');
    const choisies = Object.values(etat.menu.recettes).filter((r) => !ids || ids.includes(r.id));
    let ajoutes = 0;
    let fusionnes = 0;
    for (const ing of choisies.flatMap((r) => r.ingredients)) {
      const cle = `${normaliserNom(ing.nom)}|${ing.unite}`;
      const existant = courses.find((a) => a.status === 'needs_action' && a.cle === cle);
      if (existant) {
        existant.qte = Math.round((existant.qte + ing.quantite) * 1000) / 1000;
        existant.summary = resume(existant.nom, existant.qte, ing.unite);
        existant.description = `qte=${existant.qte};unite=${ing.unite};rayon=${ing.rayon};source=menu`;
        fusionnes += 1;
      } else {
        courses.push({
          uid: `c${courses.length + 1}-${Date.now()}`,
          nom: ing.nom,
          qte: ing.quantite,
          cle,
          status: 'needs_action',
          summary: resume(ing.nom, ing.quantite, ing.unite),
          description: `qte=${ing.quantite};unite=${ing.unite};rayon=${ing.rayon};source=menu`,
        });
        ajoutes += 1;
      }
    }
    return { ajoutes, fusionnes, ignores: 0 };
  }

  // Menu de départ pour que la vue ne soit pas vide en dev
  etat.menu = construire({ jours: 5, repas: ['jus', 'diner'], personnes: 4, preferences: [], allergies: ['arachide'], note: '' });

  async function commande(message) {
    switch (message.type) {
      case 'maison/menu/etat':
        return { configure: true, repas: [...etat.repasActives], quota: { ...etat.quota }, enCours: etat.enCours };
      case 'maison/menu/lire':
        return etat.menu ? structuredClone(etat.menu) : null;
      case 'maison/menu/generer':
        return generer(message.parametres);
      case 'maison/menu/remplacer':
        return remplacerPlat(message.date, message.repas);
      case 'maison/menu/vers_courses':
        return versCourses(message.recettes);
      default:
        throw erreur('unknown_command', message.type);
    }
  }

  return {
    commande,
    etat,
    vider: () => { etat.menu = null; },
  };
}
