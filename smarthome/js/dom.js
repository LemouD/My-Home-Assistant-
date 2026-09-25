// =============================================
// DOM.JS — Construction du DOM sans innerHTML
// =============================================

// Crée un élément. Les enfants de type texte deviennent des nœuds texte,
// donc aucune donnée venant de Home Assistant ou d'une API n'est interprétée comme du HTML.
export function el(tag, attributs = {}, ...enfants) {
  const noeud = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attributs)) {
    // Gestionnaires d'événements en attribut interdits : utiliser addEventListener
    if (/^on/i.test(cle)) throw new Error(`Attribut interdit : ${cle}`);
    if (valeur === false || valeur == null) continue;
    if (cle === 'class') noeud.className = valeur;
    else noeud.setAttribute(cle, valeur === true ? '' : valeur);
  }
  noeud.append(...enfants.flat().filter((e) => e != null && e !== false));
  return noeud;
}

// Charge un gabarit HTML statique du projet et le renvoie sous forme de fragment.
// DOMParser n'exécute pas les <script> contenus dans le gabarit.
export async function chargerGabarit(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gabarit ${url} : HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const fragment = document.createDocumentFragment();
  fragment.append(...doc.body.childNodes);
  return fragment;
}
