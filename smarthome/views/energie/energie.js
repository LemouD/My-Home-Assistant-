// =============================================
// ENERGIE.JS — Vue Énergie & Fluides
// =============================================
// Consommations lues dans les statistiques longue durée de Home Assistant
// (capteurs à state_class total_increasing), rafraîchies toutes les 15 minutes.
// Pas de gaz dans ce foyer : les cartes gaz de la maquette ne sont pas reprises.

import { ajouterStyle, chargerGabarit, el, remplacer, svg } from '../../js/dom.js';
import { definirNombre, statistiques, valeurNumerique } from '../../js/ha.js';
import { calculerConseils } from './conseils.js';

const RAFRAICHISSEMENT_MS = 15 * 60 * 1000;
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const nombre = (valeur, decimales = 1) =>
  valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const euros = (valeur) => valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);
const somme = (valeurs) => valeurs.reduce((total, v) => total + v, 0);
const moyenne = (valeurs) => (valeurs.length ? somme(valeurs) / valeurs.length : null);
const icone = (fichier) => new URL(`../../assets/icons/energie/${fichier}`, import.meta.url).href;
const joursDansLeMois = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const cleJour = (date) => date.toLocaleDateString('sv-SE');                          // AAAA-MM-JJ
const cleMois = (date) => `${date.getFullYear()}-${date.getMonth()}`;
const fractionDuJour = () => {
  const maintenant = new Date();
  return Math.max(1, maintenant.getHours() * 60 + maintenant.getMinutes()) / 1440;
};

export async function monter({ config }) {
  const racine = el('div', { class: 'vue-energie' });
  racine.append(await chargerGabarit(new URL('./energie.html', import.meta.url)));
  ajouterStyle(racine, new URL('./energie.css', import.meta.url));
  const $ = (id) => racine.querySelector(`#${id}`);

  const reglages = config.ENERGIE ?? {};
  const elec = reglages.electricite ?? {};
  const eau = reglages.eau ?? {};
  const postes = reglages.postes ?? [];
  const idsElec = [elec.hc, elec.hp].filter(Boolean);

  let hass = null;
  let minuteur = null;
  let mesures = null;   // dernières statistiques calculées (voir charger)

  $('energie-mois').textContent = majuscule(new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));

  // ================= CHARGEMENT =================

  async function charger() {
    const maintenant = new Date();
    const aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const il7jours = new Date(aujourdhui.getTime() - 6 * 86400000);
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const il6mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 5, 1);

    const idsMois = [...idsElec, eau.index, ...postes.map((p) => p.capteur)].filter(Boolean);
    try {
      const [parJour, parMois] = await Promise.all([
        idsElec.length ? statistiques(hass, idsElec, il7jours, maintenant, 'day') : {},
        idsMois.length ? statistiques(hass, idsMois, il6mois, maintenant, 'month') : {},
      ]);

      // Électricité : 7 derniers jours (HC + HP additionnés), le dernier étant aujourd'hui
      const jours = Array.from({ length: 7 }, (_, i) => new Date(il7jours.getTime() + i * 86400000));
      const kwhParJour = jours.map((jour) => somme(idsElec.map((id) =>
        somme((parJour[id] ?? []).filter((p) => cleJour(p.debut) === cleJour(jour)).map((p) => p.variation)))));

      // Mois : 6 derniers mois, le dernier étant le mois en cours
      const mois = Array.from({ length: 6 }, (_, i) => new Date(il6mois.getFullYear(), il6mois.getMonth() + i, 1));
      const parMoisDe = (id) => mois.map((m) =>
        somme((parMois[id] ?? []).filter((p) => cleMois(p.debut) === cleMois(m)).map((p) => p.variation)));
      const moisCourant = (id) => (id ? parMoisDe(id)[5] : 0);

      // Eau : moyenne quotidienne de chaque mois (le mois en cours sur les jours écoulés)
      const eauParMois = eau.index ? parMoisDe(eau.index) : [];
      const eauJourParMois = eauParMois.map((m3, i) =>
        m3 / (i === 5 ? maintenant.getDate() : joursDansLeMois(mois[i])));

      mesures = {
        jours,
        kwhParJour,
        hc: moisCourant(elec.hc),
        hp: moisCourant(elec.hp),
        mois,
        eauJourParMois,
        eauMois: eau.index ? eauParMois[5] : 0,
        postes: postes.map((p) => ({ ...p, kwh: moisCourant(p.capteur) })),
        debutMois,
      };
      rendreTout();
    } catch (e) {
      console.warn('Énergie, statistiques :', e.message ?? e);
      remplacer($('energie-elec-courbe'), el('p', { class: 'energie-vide' }, 'Statistiques indisponibles.'));
    }
  }

  // ================= RENDU =================

  function tendance(id, actuel, reference) {
    const badge = $(id);
    if (actuel == null || !(reference > 0)) {
      badge.hidden = true;
      return;
    }
    const ecart = Math.round((actuel / reference - 1) * 100);
    badge.textContent = `${ecart > 0 ? '↑' : '↓'} ${Math.abs(ecart)} %`;
    badge.hidden = false;
  }

  function rendreElectricite() {
    if (!idsElec.length) {
      remplacer($('energie-elec-courbe'), el('p', { class: 'energie-vide' }, 'Compteur électrique non configuré.'));
      return;
    }
    const { jours, kwhParJour, hc, hp } = mesures;
    const aujourdhui = kwhParJour[6];
    const moyennePrecedents = moyenne(kwhParJour.slice(0, 6).filter((v) => v > 0));

    $('energie-elec-jour').textContent = nombre(aujourdhui);
    // La journée est en cours : comparaison à la même heure des jours précédents
    tendance('energie-elec-tendance', aujourdhui,
      moyennePrecedents != null ? moyennePrecedents * fractionDuJour() : null);
    $('energie-elec-moyenne').textContent = moyennePrecedents != null
      ? `Moyenne : ${nombre(moyennePrecedents)} kWh / jour` : '';

    // Courbe des 7 derniers jours
    const L = 540, H = 110, marge = 14;
    const max = Math.max(...kwhParJour, 1);
    const x = (i) => marge + (i * (L - 2 * marge)) / 6;
    const y = (v) => 18 + (1 - v / max) * (H - 30);
    const bulleX = Math.min(x(6) - 34, L - 70);
    remplacer($('energie-elec-courbe'),
      svg('svg', { viewBox: `0 0 ${L} ${H}`, class: 'energie-courbe-svg', 'aria-hidden': 'true' },
        ...[10, 40, 70, 100].map((ligne) => svg('line', { x1: 0, x2: L, y1: ligne + 0.5, y2: ligne + 0.5, class: 'energie-grille' })),
        svg('polyline', { points: kwhParJour.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'energie-courbe-ligne' }),
        ...kwhParJour.map((v, i) => svg('circle', { cx: x(i), cy: y(v), r: i === 6 ? 4 : 2.5, class: 'energie-courbe-point' })),
        svg('rect', { x: bulleX, y: y(aujourdhui) - 30, width: 68, height: 18, rx: 4, class: 'energie-bulle' }),
        svg('text', { x: bulleX + 34, y: y(aujourdhui) - 17, class: 'energie-bulle-texte' }, `${nombre(aujourdhui)} kWh`)));
    remplacer($('energie-elec-jours'), ...jours.map((jour, i) => (i === 6
      ? el('b', {}, `${JOURS[jour.getDay()]} (Auj)`)
      : el('span', {}, JOURS[jour.getDay()]))));

    $('energie-hc').textContent = elec.hc ? `${nombre(hc, 0)} kWh` : '—';
    $('energie-hp').textContent = elec.hp ? `${nombre(hp, 0)} kWh` : '—';
    $('energie-tarif-hc').textContent = elec.tarifHC != null ? `Tarif : ${nombre(elec.tarifHC, 2)} € / kWh` : '';
    $('energie-tarif-hp').textContent = elec.tarifHP != null ? `Tarif : ${nombre(elec.tarifHP, 2)} € / kWh` : '';
  }

  function rendreEau() {
    $('energie-saisir').hidden = !eau.saisie;
    if (!eau.index) {
      remplacer($('energie-eau-barres'), el('p', { class: 'energie-vide' }, 'Compteur d\'eau non configuré.'));
      return;
    }
    const { mois, eauJourParMois } = mesures;
    const actuel = eauJourParMois[5];
    const reference = moyenne(eauJourParMois.slice(0, 5).filter((v) => v > 0));

    tendance('energie-eau-tendance', actuel, reference);
    $('energie-eau-jour').textContent = `${nombre(actuel, 2)} m³ / jour`;

    const max = Math.max(...eauJourParMois, 0.001);
    remplacer($('energie-eau-barres'), ...eauJourParMois.map((valeur, i) => {
      const courant = i === 5;
      return el('div', { class: courant ? 'energie-barre energie-barre-courante' : 'energie-barre' },
        el('span', { class: 'energie-barre-valeur' }, `${nombre(valeur, 2)} m³`),
        el('span', { class: 'energie-barre-colonne', style: `height: ${Math.max(4, (valeur / max) * 60)}px` }),
        el('span', { class: 'energie-barre-mois' },
          majuscule(mois[i].toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''))));
    }));
  }

  function rendreCouts() {
    const lignes = [];
    if (elec.hc && elec.tarifHC != null) {
      lignes.push(['Électricité heures creuses', `${nombre(mesures.hc, 0)} kWh`, `${nombre(elec.tarifHC, 2)} € / kWh`, mesures.hc * elec.tarifHC]);
    }
    if (elec.hp && elec.tarifHP != null) {
      lignes.push(['Électricité heures pleines', `${nombre(mesures.hp, 0)} kWh`, `${nombre(elec.tarifHP, 2)} € / kWh`, mesures.hp * elec.tarifHP]);
    }
    if (eau.index && eau.prixM3 != null) {
      lignes.push(['Eau', `${nombre(mesures.eauMois, 2)} m³`, `${nombre(eau.prixM3, 2)} € / m³`, mesures.eauMois * eau.prixM3]);
    }

    const total = somme(lignes.map((l) => l[3]));
    remplacer($('energie-couts'), ...lignes.map(([poste, conso, tarif, montant]) =>
      el('tr', {},
        el('td', { class: 'energie-gras' }, poste),
        el('td', { class: 'energie-attenue' }, conso),
        el('td', { class: 'energie-attenue' }, tarif),
        el('td', { class: 'energie-droite energie-gras' }, euros(montant)))));
    if (!lignes.length) {
      remplacer($('energie-couts'), el('tr', {}, el('td', { colspan: 4, class: 'energie-vide' }, 'Aucun compteur configuré.')));
    }

    $('energie-cout-total').textContent = euros(total);
    $('energie-cout-mois').textContent = lignes.length ? euros(total) : '--';
  }

  function rendreRepartition() {
    const totalElec = mesures.hc + mesures.hp;
    const suivis = mesures.postes.filter((p) => p.kwh > 0);
    if (!suivis.length || totalElec <= 0) {
      remplacer($('energie-segments'));
      remplacer($('energie-postes'), el('p', { class: 'energie-vide' },
        'Ajoutez des prises connectées avec mesure d\'énergie (config ENERGIE.postes) pour voir la répartition.'));
      return;
    }
    const prixMoyen = totalElec > 0
      ? ((mesures.hc * (elec.tarifHC ?? 0)) + (mesures.hp * (elec.tarifHP ?? 0))) / totalElec : 0;
    const autres = Math.max(0, totalElec - somme(suivis.map((p) => p.kwh)));
    const elements = [...suivis, { nom: 'Autres', kwh: autres, couleur: 'gris' }].filter((p) => p.kwh > 0);

    remplacer($('energie-segments'), ...elements.map((p) =>
      el('span', { class: `energie-couleur-${p.couleur}`, style: `width: ${(p.kwh / totalElec) * 100}%` })));
    remplacer($('energie-postes'), ...elements.map((p) =>
      el('div', { class: 'energie-ligne-texte' },
        el('span', { class: 'energie-poste-nom' }, el('span', { class: `energie-pastille energie-couleur-${p.couleur}` }), p.nom),
        el('span', {},
          el('b', {}, `${Math.round((p.kwh / totalElec) * 100)} %`),
          el('span', { class: 'energie-attenue' }, ` ${euros(p.kwh * prixMoyen)}`)))));
  }

  function rendreConseils() {
    const temperatures = (reglages.temperatures ?? []).map((id) => valeurNumerique(hass, id)).filter((v) => v != null);
    const totalElec = mesures.hc + mesures.hp;
    const conseils = calculerConseils({
      eauJourMois: eau.index ? mesures.eauJourParMois[5] : null,
      eauJourReference: eau.index ? moyenne(mesures.eauJourParMois.slice(0, 5).filter((v) => v > 0)) : null,
      elecAujourdhui: idsElec.length ? mesures.kwhParJour[6] : null,
      elecMoyenne: idsElec.length
        ? (moyenne(mesures.kwhParJour.slice(0, 6).filter((v) => v > 0)) ?? 0) * fractionDuJour() : null,
      partHC: elec.hc && elec.hp && totalElec > 0 ? mesures.hc / totalElec : null,
      temperature: moyenne(temperatures),
      consigne: reglages.consigne ?? null,
    });

    $('energie-nb-conseils').textContent = conseils.length
      ? `${conseils.length} recommandation${conseils.length > 1 ? 's' : ''}` : 'Tout va bien';
    remplacer($('energie-conseils'),
      ...conseils.map((c) => el('div', { class: `energie-conseil energie-conseil-${c.niveau}` },
        el('img', { src: icone(c.icone), width: 14, height: 14, alt: '' }),
        el('div', {}, el('b', {}, c.titre), el('p', {}, c.texte)))),
      !conseils.length && el('p', { class: 'energie-vide' }, 'Aucune anomalie détectée sur les mesures disponibles.'));
  }

  function rendreEtats() {
    const index = eau.index ? valeurNumerique(hass, eau.index) : null;
    $('energie-eau-index').textContent = index != null ? index.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '--';
  }

  function rendreTout() {
    rendreEtats();
    if (!mesures) return;
    rendreElectricite();
    rendreEau();
    rendreCouts();
    rendreRepartition();
    rendreConseils();
  }

  // ================= SAISIE DE L'INDEX D'EAU =================

  const messageSaisie = (texte) => { $('energie-saisie-message').textContent = texte; };

  function afficherSaisie(visible) {
    $('energie-saisie').hidden = !visible;
    $('energie-saisir').hidden = visible || !eau.saisie;
    if (visible) {
      $('energie-saisie-valeur').value = valeurNumerique(hass, eau.saisie) ?? '';
      $('energie-saisie-valeur').focus();
    }
  }

  racine.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'saisir-index') {
      messageSaisie('');
      afficherSaisie(true);
    } else if (action === 'annuler-index') {
      afficherSaisie(false);
    }
  });

  $('energie-saisie').addEventListener('submit', async (e) => {
    e.preventDefault();
    const valeur = Number.parseFloat($('energie-saisie-valeur').value);
    const precedent = valeurNumerique(hass, eau.saisie);
    if (!Number.isFinite(valeur) || valeur < 0) {
      messageSaisie('Index invalide.');
      return;
    }
    // Un compteur ne recule pas : un index plus bas est presque toujours une faute de frappe
    if (precedent != null && valeur < precedent) {
      messageSaisie(`L'index ne peut pas être inférieur au précédent (${nombre(precedent, 3)} m³).`);
      return;
    }
    try {
      await definirNombre(hass, eau.saisie, valeur);
      afficherSaisie(false);
      messageSaisie('Index enregistré.');
      charger();
    } catch (err) {
      messageSaisie('Enregistrement impossible : Home Assistant injoignable.');
      console.warn('Énergie, index eau :', err.message ?? err);
    }
  });

  // ================= CYCLE DE VIE =================

  return {
    racine,

    maj(nouveau) {
      const premier = !hass;
      hass = nouveau;
      if (premier) {
        charger();
        minuteur = setInterval(charger, RAFRAICHISSEMENT_MS);
      }
      rendreEtats();
    },

    detruire() {
      clearInterval(minuteur);
    },
  };
}
