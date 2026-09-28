// =============================================
// SPIRITUALITE.JS — Versets, calendrier hégirien, rappels
// =============================================
// Versets : UmmahAPI (texte arabe + traduction française), un appel par verset
// et par jour au plus. Calendrier hégirien : calculé localement par le navigateur
// (calendrier Umm al-Qura) — pas d'appel réseau. Les dates peuvent différer d'un
// jour de l'observation locale de la lune : elles sont affichées comme estimées.

const API = 'https://ummahapi.com/api/quran';
const CALENDRIER = 'fr-FR-u-ca-islamic-umalqura';
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MS_JOUR = 86400000;

// ---- VERSETS ----

const cacheVersets = new Map();

// Champ texte d'une réponse externe : chaîne attendue, longueur bornée
const texteApi = (valeur, max = 2000) => {
  if (typeof valeur !== 'string') throw new Error('UmmahAPI : réponse inattendue');
  return valeur.trim().slice(0, max);
};

// reference : « 13:28 ». Renvoie { reference, sourate, arabe, traduction }.
export function verset(reference) {
  if (!cacheVersets.has(reference)) {
    const [sourate, ayah] = reference.split(':').map(Number);
    const promesse = (async () => {
      const res = await fetch(`${API}/surah/${sourate}/ayah/${ayah}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { success, data } = await res.json();
      if (!success) throw new Error('UmmahAPI : verset introuvable');
      return {
        reference,
        sourate: texteApi(data?.surah?.name_english, 100),
        arabe: texteApi(data?.verse?.arabic),
        traduction: texteApi(data?.verse?.translations?.french ?? ''),
      };
    })();
    promesse.catch(() => cacheVersets.delete(reference));
    cacheVersets.set(reference, promesse);
  }
  return cacheVersets.get(reference);
}

// URL du MP3 d'un verset pour un récitateur (1 = Mishary Alafasy).
// L'audio est hébergé par everyayah.com, référencé par UmmahAPI.
export async function audioVerset(reference, recitateur = 1) {
  const [sourate, ayah] = reference.split(':').map(Number);
  const res = await fetch(`${API}/audio/${sourate}/${ayah}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { success, data } = await res.json();
  const choix = data?.reciters?.find((r) => r.id === recitateur) ?? data?.reciters?.[0];
  // Seul l'hébergeur audio attendu est accepté : l'URL vient d'une API externe
  const url = new URL(choix?.audio_url ?? '', 'https://invalide.local');
  if (!success || url.protocol !== 'https:' || url.hostname !== 'everyayah.com') throw new Error('audio indisponible');
  return url.href;
}

// ---- CALENDRIER HÉGIRIEN ----

const partiesHegiriennes = new Intl.DateTimeFormat(CALENDRIER, { day: 'numeric', month: 'numeric', year: 'numeric' });
const libelleHegirien = new Intl.DateTimeFormat(CALENDRIER, { day: 'numeric', month: 'long', year: 'numeric' });

// { jour, mois, annee } dans le calendrier hégirien (mois 9 = Ramadan)
export function dateHegirienne(date = new Date()) {
  const parties = Object.fromEntries(partiesHegiriennes.formatToParts(date)
    .filter((p) => p.type !== 'literal')
    .map((p) => [p.type, Number.parseInt(p.value, 10)]));
  return { jour: parties.day, mois: parties.month, annee: parties.year };
}

export const texteHegirien = (date = new Date()) => libelleHegirien.format(date);

const debutDuJour = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// Jours avant le 1er Ramadan (0 pendant le Ramadan) ; `jourRamadan` si on y est déjà
export function compteRamadan(date = new Date()) {
  const aujourdhui = debutDuJour(date);
  const h = dateHegirienne(aujourdhui);
  if (h.mois === 9) return { jours: 0, jourRamadan: h.jour };
  for (let i = 1; i <= 400; i++) {
    const jour = new Date(aujourdhui.getTime() + i * MS_JOUR);
    const hj = dateHegirienne(jour);
    if (hj.mois === 9 && hj.jour === 1) return { jours: i, jourRamadan: null };
  }
  return null;
}

// ---- RAPPEL DU JOUR ----
// Jeûnes surérogatoires (lundi, jeudi, jours blancs 13-15), vendredi, Ramadan.
// Renvoie { titre, texte } ou null s'il n'y a rien à rappeler.
export function rappelDuJour(date = new Date()) {
  const aujourdhui = debutDuJour(date);
  const demain = new Date(aujourdhui.getTime() + MS_JOUR);
  const hAujourdhui = dateHegirienne(aujourdhui);
  const hDemain = dateHegirienne(demain);

  if (hAujourdhui.mois === 9) {
    return { titre: `Ramadan — jour ${hAujourdhui.jour}`, texte: 'Que ce mois soit une source de paix et de patience pour le foyer.' };
  }
  if (hDemain.mois !== 9 && hDemain.jour >= 13 && hDemain.jour <= 15) {
    return { titre: 'Demain — jours blancs', texte: 'Jeûne recommandé les 13, 14 et 15 du mois hégirien.' };
  }
  if (demain.getDay() === 1 || demain.getDay() === 4) {
    return {
      titre: `Demain, ${JOURS[demain.getDay()]} — jeûne recommandé`,
      texte: 'Si possible, profitez de cette journée pour jeûner et renforcer votre intention.',
    };
  }
  if (aujourdhui.getDay() === 5) {
    return { titre: 'Vendredi', texte: 'Jour de la prière du vendredi. La lecture de la sourate Al-Kahf est recommandée.' };
  }
  return null;
}
