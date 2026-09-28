// =============================================
// MOCK-COMPARATEUR.JS — Commandes maison/courses/* simulées pour le mode dev
// =============================================
// Même contrat que l'intégration « maison » : magasins, passages, derniers prix, comparateur.
// Magasins et passages fictifs, dates relatives ; le total n'est renvoyé qu'avec un jeton Budget.

import { normaliserNom } from '../js/courses.js';

const BASE = { g: ['kg', 0.001], kg: ['kg', 1], ml: ['l', 0.001], cl: ['l', 0.01], l: ['l', 1] };
const versBase = (quantite, unite) => {
  const [u, f] = BASE[unite] ?? [unite, 1];
  return [quantite * f, u];
};
const jourRelatif = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE');
};

export function creerComparateurSimule({ erreur, jetonValide }) {
  const magasins = [{ id: 'magasin-a', nom: 'Magasin A' }, { id: 'magasin-b', nom: 'Magasin B' }, { id: 'autre', nom: 'Autre' }];
  const passages = [];

  // Historique de départ : les mêmes articles dans les deux magasins, B un peu plus cher
  const panier = [['Tomates', 1, 'kg', 2.9], ['Lait', 1, 'l', 1.05], ['Pâtes', 500, 'g', 0.95], ['Yaourts nature', 12, 'piece', 2.4], ['Baguette', 2, 'piece', 2.2]];
  [[40, 'magasin-a', 1], [26, 'magasin-b', 1.08], [12, 'magasin-a', 1.02], [5, 'magasin-b', 1.1]].forEach(([jours, magasin, facteur], i) => {
    passages.push({
      id: `p${i + 1}`, magasin, date: jourRelatif(jours), total: 48 + i * 6,
      articles: panier.map(([nom, quantite, unite, prix]) => ({ nom, quantite, unite, prix: Math.round(prix * facteur * 100) / 100 })),
    });
  });

  function ajouter(passage) {
    const date = passage?.date;
    const aujourdhui = new Date().toLocaleDateString('sv-SE');
    if (!magasins.some((m) => m.id === passage?.magasin) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || date > aujourdhui
      || !Array.isArray(passage.articles) || !passage.articles.length || passage.articles.length > 150) {
      throw erreur('passage_invalide', 'Passage invalide');
    }
    const id = `p${passages.length + 1}`;
    passages.push({ id, magasin: passage.magasin, date, total: passage.total ?? null, articles: structuredClone(passage.articles) });
    console.info('[mock] passage enregistré :', passage.magasin, date, passage.articles.length, 'articles');
    return { id, articles: passage.articles.length };
  }

  function historique({ limite = 10, jeton }) {
    const avecTotal = jetonValide(jeton);
    return [...passages].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limite).map((p) => ({
      id: p.id, magasin: p.magasin, nom_magasin: magasins.find((m) => m.id === p.magasin)?.nom ?? 'Magasin retiré',
      date: p.date, articles: p.articles.length, ...(avecTotal && p.total != null ? { total: p.total } : {}),
    }));
  }

  function prix({ magasin, noms }) {
    const resultat = {};
    for (const nom of noms ?? []) {
      const cle = normaliserNom(nom);
      const trouve = [...passages].sort((a, b) => b.date.localeCompare(a.date))
        .filter((p) => p.magasin === magasin)
        .flatMap((p) => p.articles.map((a) => ({ ...a, date: p.date })))
        .find((a) => a.prix != null && normaliserNom(a.nom) === cle);
      if (trouve) resultat[nom] = { prix: trouve.prix, quantite: trouve.quantite, unite: trouve.unite, date: trouve.date };
    }
    return resultat;
  }

  function comparer() {
    const limite = jourRelatif(90);
    const recents = passages.filter((p) => p.date >= limite);
    // Panier : articles achetés au moins 2 fois (clé = nom normalisé + unité de base)
    const achats = new Map();
    for (const p of recents) {
      for (const a of p.articles) {
        const [q, u] = versBase(a.quantite, a.unite);
        const cle = `${normaliserNom(a.nom)}|${u}`;
        const infos = achats.get(cle) ?? { fois: 0, quantite: 0 };
        achats.set(cle, { fois: infos.fois + 1, quantite: infos.quantite + q });
      }
    }
    const cles = [...achats].filter(([, v]) => v.fois >= 2).map(([k]) => k);
    // Dernier prix unitaire par magasin et par article
    const prixUnitaire = {};
    for (const p of [...recents].sort((a, b) => a.date.localeCompare(b.date))) {
      if (p.magasin === 'autre') continue;
      for (const a of p.articles) {
        const [q, u] = versBase(a.quantite, a.unite);
        if (a.prix == null || !q) continue;
        (prixUnitaire[p.magasin] ??= {})[`${normaliserNom(a.nom)}|${u}`] = a.prix / q;
      }
    }
    const idsMagasins = Object.keys(prixUnitaire);
    const liste = idsMagasins.map((id) => {
      const rapports = cles.filter((k) => prixUnitaire[id][k] != null && idsMagasins.filter((m) => prixUnitaire[m][k] != null).length >= 2)
        .map((k) => {
          const valeurs = idsMagasins.map((m) => prixUnitaire[m][k]).filter((v) => v != null);
          return prixUnitaire[id][k] / (valeurs.reduce((s, v) => s + v, 0) / valeurs.length);
        });
      const indice = rapports.length ? Math.exp(rapports.reduce((s, r) => s + Math.log(r), 0) / rapports.length) : null;
      return { id, nom: magasins.find((m) => m.id === id)?.nom ?? 'Magasin retiré', indice: indice && Math.round(indice * 1000) / 1000, articles_comparables: rapports.length };
    }).filter((m) => m.indice != null).sort((a, b) => a.indice - b.indice);
    const eligibles = liste.filter((m) => m.articles_comparables >= 3);
    if (eligibles.length < 2) {
      return { panier: cles.length, magasins: liste, meilleur: null, second: null, comparables: 0, economie_pct: null, economie_euros: null, couverture: null };
    }
    const [meilleur, second] = eligibles;
    const communs = cles.filter((k) => prixUnitaire[meilleur.id][k] != null && prixUnitaire[second.id][k] != null);
    let coutMeilleur = 0;
    let coutSecond = 0;
    for (const k of communs) {
      const q = achats.get(k).quantite / achats.get(k).fois;   // quantité habituelle par achat
      coutMeilleur += prixUnitaire[meilleur.id][k] * q;
      coutSecond += prixUnitaire[second.id][k] * q;
    }
    return {
      panier: cles.length, magasins: liste, meilleur: meilleur.id, second: second.id, comparables: communs.length,
      economie_pct: Math.round((1 - coutMeilleur / coutSecond) * 1000) / 10,
      economie_euros: Math.round((coutSecond - coutMeilleur) * 100) / 100,
      couverture: cles.length ? Math.round((communs.length / cles.length) * 100) / 100 : null,
    };
  }

  async function commande(message) {
    switch (message.type) {
      case 'maison/courses/magasins': return structuredClone(magasins);
      case 'maison/courses/passage/ajouter': return ajouter(message.passage);
      case 'maison/courses/historique': return historique(message);
      case 'maison/courses/prix': return prix(message);
      case 'maison/courses/comparer': return comparer();
      default: throw erreur('unknown_command', message.type);
    }
  }

  return { commande, passages };
}
