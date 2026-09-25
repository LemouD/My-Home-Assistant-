// =============================================
// BUDGET-EXEMPLE.JS — Données fictives du budget (mode dev uniquement)
// =============================================
// Valeurs de démonstration reprises de la maquette, servies par mock-hass.js.
// En production, les données viennent de l'intégration « maison » de Home Assistant.

export default {
  revenus: 3200,
  depensesFixes: 1850,
  depensesVariables: 600,

  // Mois clôturés (le mois en cours est ajouté par le mock)
  historique: [
    { mois: '2026-04', total: 2280 },
    { mois: '2026-05', total: 2020 },
    { mois: '2026-06', total: 2600 },
    { mois: '2026-07', total: 2150 },
    { mois: '2026-08', total: 2320 },
  ],

  epargne: {
    objectif: 300,
    ceMois: 200,
    comptes: [
      { nom: 'Livret A',      montant: 3200 },
      { nom: 'Assurance vie', montant: 1650 },
    ],
  },

  // `depense` : déjà dépensé ce mois ; la jauge montre depense / budget
  categories: [
    { nom: 'Alimentation',       budget: 800,  depense: 345, couleur: 'bleu' },
    { nom: 'Transport',          budget: 300,  depense: 96,  couleur: 'bleu' },
    { nom: 'Logement & Énergie', budget: 1200, depense: 640, couleur: 'rose', alerte: true },
    { nom: 'Loisirs & Sorties',  budget: 450,  depense: 149, couleur: 'ambre' },
    { nom: 'Santé',              budget: 450,  depense: 77,  couleur: 'emeraude' },
  ],

  imprevus: [
    { libelle: 'Réparation voiture',          montant: 380 },
    { libelle: 'Cadeau anniversaire',         montant: 65 },
    { libelle: 'Frais vétérinaire',           montant: 120 },
    { libelle: 'Remplacement électroménager', montant: 250 },
  ],

  fondsUrgence: 1200,

  facturesAVenir: [
    { fournisseur: 'Assurance maladie',       echeance: '2026-09-28', montant: 72.5 },
    { fournisseur: 'Abonnement musique',      echeance: '2026-10-01', montant: 17.99 },
    { fournisseur: 'Remboursement prêt auto', echeance: '2026-10-05', montant: 250 },
  ],

  // statut : 'a-payer' | 'paye' | 'retard'
  factures: [
    { fournisseur: 'Électricité',          echeance: '2026-10-15', montant: 89,    statut: 'a-payer' },
    { fournisseur: 'Internet',             echeance: '2026-09-28', montant: 29.99, statut: 'paye' },
    { fournisseur: 'Assurance habitation', echeance: '2026-09-15', montant: 45,    statut: 'paye' },
    { fournisseur: 'Streaming vidéo',      echeance: '2026-09-05', montant: 13.49, statut: 'retard' },
  ],
};
