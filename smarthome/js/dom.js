// =============================================
// DOM.JS — Construction du DOM sans innerHTML
// =============================================

// Crée un élément. Les enfants de type texte deviennent des nœuds texte,
// donc aucune donnée venant de Home Assistant ou d'une API n'est interprétée comme du HTML.
export function el(tag, attributs = {}, ...enfants) {
  return remplir(document.createElement(tag), attributs, enfants);
}

// Même principe pour les éléments SVG (graphiques calculés à partir des données)
export function svg(tag, attributs = {}, ...enfants) {
  return remplir(document.createElementNS('http://www.w3.org/2000/svg', tag), attributs, enfants);
}

// Remplace le contenu d'un nœud. Contrairement à replaceChildren natif,
// ignore false / null / undefined (enfants conditionnels : `cond && el(...)`).
export function remplacer(noeud, ...enfants) {
  noeud.replaceChildren(...filtrerEnfants(enfants));
}

const filtrerEnfants = (enfants) => enfants.flat().filter((e) => e != null && e !== false);

function remplir(noeud, attributs, enfants) {
  for (const [cle, valeur] of Object.entries(attributs)) {
    // Gestionnaires d'événements en attribut interdits : utiliser addEventListener
    if (/^on/i.test(cle)) throw new Error(`Attribut interdit : ${cle}`);
    if (valeur === false || valeur == null) continue;
    if (cle === 'class') noeud.setAttribute('class', valeur);
    else noeud.setAttribute(cle, valeur === true ? '' : valeur);
  }
  noeud.append(...filtrerEnfants(enfants));
  return noeud;
}

// Charge un gabarit HTML statique du projet et le renvoie sous forme de fragment.
// DOMParser n'exécute pas les <script> contenus dans le gabarit.
export async function chargerGabarit(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gabarit ${url} : HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

  // Les `src` relatifs du gabarit (images de assets/) sont résolus depuis le gabarit,
  // pas depuis l'URL de la page Home Assistant
  doc.querySelectorAll('[src]').forEach((n) => {
    n.setAttribute('src', new URL(n.getAttribute('src'), url).href);
  });

  const fragment = document.createDocumentFragment();
  fragment.append(...doc.body.childNodes);
  return fragment;
}

// Feuille de style propre à une vue, ajoutée dans sa racine.
// Le navigateur ne la charge qu'une fois la vue insérée dans la page :
// la racine reste invisible jusque-là, pour éviter un affichage sans mise en forme.
export function ajouterStyle(racine, url) {
  const lien = el('link', { rel: 'stylesheet', href: new URL(url).href });
  const afficher = () => { racine.style.visibility = ''; };
  lien.addEventListener('load', afficher, { once: true });
  lien.addEventListener('error', afficher, { once: true });
  racine.style.visibility = 'hidden';
  racine.prepend(lien);
}
