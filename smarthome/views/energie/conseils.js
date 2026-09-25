// =============================================
// CONSEILS.JS — Alertes et conseils énergie
// =============================================
// Règles simples, calculées à partir des mesures déjà affichées par la vue.
// Chaque règle ne se déclenche que si les données nécessaires existent :
// sans capteur, pas de conseil inventé.
//
// Entrée (valeurs nulles si inconnues) :
//   eauJourMois, eauJourReference   m³/jour : mois en cours, moyenne des mois précédents
//   elecAujourdhui, elecMoyenne     kWh : aujourd'hui et moyenne des jours précédents,
//                                   à la même heure de la journée
//   partHC                          0..1 : part des heures creuses ce mois-ci
//   temperature, consigne           °C : moyenne intérieure, consigne recommandée
// Sortie : [{ niveau: 'alerte' | 'info' | 'conseil', icone, titre, texte }]

export const SEUILS = {
  hausseEau: 0.15,            // +15 % par rapport à la moyenne des mois précédents
  hausseElec: 0.30,           // +30 % par rapport à la moyenne des derniers jours
  partHCMinimum: 0.40,        // moins de 40 % en heures creuses
  ecartTemperature: 1,        // 1 °C au-dessus de la consigne
  economieParDegre: 7,        // % d'énergie de chauffage économisé par °C en moins (ADEME)
};

const pourcent = (x) => Math.round(x * 100);

export function calculerConseils(m) {
  const conseils = [];

  if (m.eauJourMois != null && m.eauJourReference > 0) {
    const hausse = m.eauJourMois / m.eauJourReference - 1;
    if (hausse > SEUILS.hausseEau) {
      conseils.push({
        niveau: 'alerte',
        icone: 'alerte.svg',
        titre: `Consommation d'eau anormale (+${pourcent(hausse)} %)`,
        texte: 'Hausse inexpliquée ce mois-ci. Vérifiez les fuites sur les robinets et la chasse d\'eau.',
      });
    }
  }

  if (m.elecAujourdhui != null && m.elecMoyenne > 0) {
    const hausse = m.elecAujourdhui / m.elecMoyenne - 1;
    if (hausse > SEUILS.hausseElec) {
      conseils.push({
        niveau: 'alerte',
        icone: 'alerte.svg',
        titre: `Électricité en hausse aujourd'hui (+${pourcent(hausse)} %)`,
        texte: 'Un appareil est peut-être resté allumé. Vérifiez chauffage d\'appoint, four et chauffe-eau.',
      });
    }
  }

  // Comparaison sur le pourcentage affiché, pour ne pas écrire « 40 % » sous un seuil de 40 %
  if (m.partHC != null && pourcent(m.partHC) < pourcent(SEUILS.partHCMinimum)) {
    conseils.push({
      niveau: 'info',
      icone: 'info.svg',
      titre: `Heures creuses sous-utilisées (${pourcent(m.partHC)} %)`,
      texte: 'Programmez le lave-linge, le lave-vaisselle et le chauffe-eau pendant les heures creuses.',
    });
  }

  if (m.temperature != null && m.consigne != null
      && m.temperature - m.consigne >= SEUILS.ecartTemperature) {
    const ecart = Math.round(m.temperature - m.consigne);
    conseils.push({
      niveau: 'conseil',
      icone: 'thermometre.svg',
      titre: 'Chauffage au-dessus de la consigne',
      texte: `Température moyenne de ${m.temperature.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} °C `
        + `(cible : ${m.consigne} °C). `
        + `Baisser de ${ecart} °C économise environ ${ecart * SEUILS.economieParDegre} % sur le chauffage.`,
    });
  }

  return conseils;
}
