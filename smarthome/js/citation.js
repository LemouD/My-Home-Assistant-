// =============================================
// CITATION.JS — Citation du jour (citation.lecog.fr, en français)
// =============================================
// API gratuite, sans clé, limitée à 100 requêtes / heure : un seul appel par jour,
// mémorisé dans le navigateur. Seuls les thèmes apaisants sont retenus ;
// en cas d'échec, une citation de secours est choisie localement.

const API = 'https://citation.lecog.fr/public/api';
const CATEGORIES = [19, 16, 3, 5];          // bonheur, morale, nature, poésie
const CLE_STOCKAGE = 'vie-citation-du-jour-v2';
const LONGUEUR_MAX = 220;                   // une citation, pas un poème entier
const ESSAIS = 3;

const aujourdhui = () => new Date().toLocaleDateString('sv-SE');

function lireCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? 'null');
    return cache?.jour === aujourdhui() ? cache.citation : null;
  } catch {
    return null;
  }
}

function ecrireCache(citation) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ jour: aujourdhui(), citation }));
  } catch { /* stockage indisponible : la citation sera simplement redemandée */ }
}

// L'API renvoie parfois du HTML (<br />, entités) : converti en texte brut.
// DOMParser n'exécute aucun script, et le résultat est affiché en textContent.
function texteBrut(html) {
  const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, ' '), 'text/html');
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}

const versCitation = (d) => ({
  texte: texteBrut(d.text),
  auteur: texteBrut([d.author?.forename, d.author?.name].filter(Boolean).join(' ')),
});

let enCours = null;

// Renvoie { texte, auteur } ; `secours` : liste locale utilisée si l'API échoue
export function citationDuJour(secours) {
  const cache = lireCache();
  if (cache) return Promise.resolve(cache);

  enCours ??= (async () => {
    try {
      for (let essai = 0; essai < ESSAIS; essai++) {
        const categorie = CATEGORIES[(new Date().getDate() + essai) % CATEGORIES.length];
        const res = await fetch(`${API}/random-quote.php?category=${categorie}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { success, data } = await res.json();
        if (!success || !data?.text) continue;
        const citation = versCitation(data);
        if (citation.texte && citation.texte.length <= LONGUEUR_MAX) {
          ecrireCache(citation);
          return citation;
        }
      }
      throw new Error('aucune citation courte trouvée');
    } catch (e) {
      console.warn('Citation du jour indisponible :', e.message);
      return secours[new Date().getDate() % secours.length];
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}
