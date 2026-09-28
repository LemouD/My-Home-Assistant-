// =============================================
// COURSES.JS — Format commun des articles de la liste de courses
// =============================================
// Mêmes règles que le serveur (custom_components/maison/menu.py) : un article ajouté à la main
// et le même ingrédient envoyé par le Menu se reconnaissent et leurs quantités s'additionnent.
//   titre       : « Tomates — 500 g »
//   description : « qte=500;unite=g;rayon=fruits-legumes;source=manuel »

export const UNITES = ['g', 'kg', 'ml', 'cl', 'l', 'piece', 'cas', 'cac', 'pincee', 'botte', 'tranche', 'boite', 'autre'];

// Ordre d'affichage des rayons dans la liste
export const RAYONS = {
  'fruits-legumes': 'Fruits & légumes', boucherie: 'Boucherie', poissonnerie: 'Poissonnerie', cremerie: 'Crèmerie',
  boulangerie: 'Boulangerie', epicerie: 'Épicerie', surgeles: 'Surgelés', boissons: 'Boissons',
  entretien: 'Entretien', hygiene: 'Hygiène', autre: 'Autre',
};

const LIBELLES_UNITES = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l',
  piece: 'pièce(s)', cas: 'c. à s.', cac: 'c. à c.', pincee: 'pincée(s)',
  botte: 'botte(s)', tranche: 'tranche(s)', boite: 'boîte(s)', autre: '',
};

const FORMAT_DESCRIPTION = new RegExp(
  `^qte=(\\d{1,5}(?:\\.\\d{1,3})?);unite=(${UNITES.join('|')});rayon=(${Object.keys(RAYONS).join('|')});source=(menu|manuel)$`,
);

export const QUANTITE_MAX = 10_000;
const NOM_MAX = 60;

// « Pommes de terre » → « pomme de terre » ; « Œufs » → « oeuf » (identique à normaliser_nom)
export function normaliserNom(texte) {
  return texte.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean)
    .map((m) => (m.length > 3 && /[sx]$/.test(m) && !m.endsWith('ss') ? m.slice(0, -1) : m))
    .join(' ');
}

// 500 → « 500 » ; 1.25 → « 1.25 » (3 décimales au plus)
export const texteQuantite = (q) => String(Number(q.toFixed(3)));

export const descriptionArticle = (quantite, unite, rayon, source = 'manuel') =>
  `qte=${texteQuantite(quantite)};unite=${unite};rayon=${rayon};source=${source}`;

export function titreArticle(nom, quantite, unite) {
  if (quantite <= 0) return nom;
  const libelle = LIBELLES_UNITES[unite] ?? '';
  return `${nom} — ${texteQuantite(quantite)}${libelle ? ` ${libelle}` : ''}`;
}

export const nomArticle = (titre) => titre.split(' — ', 1)[0].trim();

// Nom saisi : une ligne, sans caractère de contrôle, borné
export const nettoyerNom = (texte) => texte.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);

// Quantité affichée dans la liste : « x6 », « 500 g », « 2 c. à s. » ; rien si inconnue
export function quantiteAffichee(article) {
  if (!article.quantite) return '';
  const q = texteQuantite(article.quantite).replace('.', ',');
  if (article.unite === 'piece' || article.unite === 'autre') return `x${q}`;
  return `${q} ${(LIBELLES_UNITES[article.unite] ?? '').replace('(s)', article.quantite > 1 ? 's' : '')}`.trim();
}

// Réponse de todo/item/list → articles. Un article ajouté ailleurs (application HA, sans
// description conforme) reste affiché tel quel, rangé dans « Autre ».
export function lireArticles(reponse) {
  const items = Array.isArray(reponse?.items) ? reponse.items : [];
  return items
    .filter((i) => typeof i.uid === 'string' && typeof i.summary === 'string')
    .map((i) => {
      const titre = i.summary.slice(0, 200);
      const m = typeof i.description === 'string' ? FORMAT_DESCRIPTION.exec(i.description.trim()) : null;
      return {
        uid: i.uid,
        titre,
        nom: m ? nomArticle(titre) : titre,
        terminee: i.status === 'completed',
        conforme: Boolean(m),
        quantite: m ? Number(m[1]) : 0,
        unite: m ? m[2] : 'autre',
        rayon: m ? m[3] : 'autre',
        source: m ? m[4] : null,
      };
    });
}

// Article à acheter déjà présent (même nom normalisé, même unité) : on additionnera les quantités
export function trouverDoublon(articles, nom, unite) {
  const cle = normaliserNom(nom);
  return articles.find((a) => !a.terminee && a.conforme && a.unite === unite && normaliserNom(a.nom) === cle) ?? null;
}
