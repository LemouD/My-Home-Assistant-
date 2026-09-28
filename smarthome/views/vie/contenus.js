// =============================================
// CONTENUS.JS — Textes de la section Bien-être & spiritualité
// =============================================
// Invocations : UmmahAPI ne les propose pas en français, elles sont donc
// conservées ici (arabe, translittération, traduction, source).
// Versets : seules les références sont stockées ; le texte arabe et la
// traduction française viennent d'UmmahAPI (voir js/spiritualite.js).
// Chaque liste est parcourue au fil des jours : même contenu toute la journée.

export const MOMENTS = {
  matin: {
    libelle: 'Matin',
    salutation: 'Bonjour',
    accroche: 'Un matin paisible commence ici',
    versets: ['93:5', '94:5', '65:3', '2:152', '3:139'],
    invocations: ['matin', 'reveil', 'afiya'],
    bienEtre: [
      { titre: 'Hydratation', texte: 'Un verre d\'eau pour réveiller doucement le corps.' },
      { titre: 'Lumière du jour', texte: 'Ouvrez les volets : la lumière naturelle aide à bien démarrer.' },
      { titre: 'Étirements', texte: 'Deux minutes pour étirer le dos et les épaules.' },
    ],
    activites: [
      { icone: 'livre', titre: 'Lecture du Coran', texte: '5 minutes au calme' },
      { icone: 'respiration', titre: 'Commencer en douceur', texte: 'Respiration · 2 min' },
    ],
  },
  apresMidi: {
    libelle: 'Après-midi',
    salutation: 'Votre journée',
    accroche: 'Retrouver son rythme, simplement',
    versets: ['94:5', '2:186', '13:28', '39:53', '40:60'],
    invocations: ['afiya', 'soucis', 'tasbih'],
    bienEtre: [
      { titre: 'Pause mentale', texte: 'Posez votre regard au loin et relâchez les épaules.' },
      { titre: 'Hydratation', texte: 'Faites une pause pour boire un verre d\'eau.' },
      { titre: 'Marche', texte: 'Quelques minutes de marche après le repas.' },
    ],
    activites: [
      { icone: 'pause', titre: 'Pause mentale', texte: 'Silence · 3 min' },
      { icone: 'goutte', titre: 'Hydratation', texte: 'Faire une pause maintenant' },
    ],
  },
  soir: {
    libelle: 'Soir',
    salutation: 'Bonne soirée',
    accroche: 'Clore la journée avec intention',
    versets: ['2:286', '13:28', '2:152', '65:3', '39:53'],
    invocations: ['soir', 'sommeil', 'afiya'],
    bienEtre: [
      { titre: 'Prenez 2 minutes pour respirer', texte: 'Inspirez lentement, puis expirez sans effort.' },
      { titre: 'Écrans en pause', texte: 'Posez le téléphone une heure avant de dormir.' },
      { titre: 'Lumière douce', texte: 'Tamisez les lumières pour préparer le sommeil.' },
    ],
    activites: [
      { icone: 'livre', titre: 'Lecture du Coran', texte: 'Reprendre votre lecture' },
      { icone: 'lune', titre: 'Préparation au sommeil', texte: 'Ralentir · 10 min' },
    ],
  },
};

// Moment de la journée : matin avant 12 h, après-midi jusqu'à 18 h, soir ensuite
export function momentDe(date = new Date()) {
  const h = date.getHours();
  if (h >= 4 && h < 12) return 'matin';
  if (h >= 12 && h < 18) return 'apresMidi';
  return 'soir';
}

// Index stable pour la journée : même choix du matin au soir, un autre le lendemain
export function choixDuJour(liste, date = new Date()) {
  const jour = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
  return liste[jour % liste.length];
}

// ---- INVOCATIONS (à valider par le foyer) ----
export const INVOCATIONS = {
  matin: {
    arabe: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
    translitteration: 'Allâhoumma bika asbahnâ, wa bika amsaynâ, wa bika nahyâ, wa bika namoûtou, wa ilayka an-noushoûr.',
    traduction: 'Ô Allah, c\'est par Toi que nous atteignons le matin et par Toi que nous atteignons le soir, par Toi nous vivons, par Toi nous mourons, et vers Toi est la résurrection.',
    source: 'Tirmidhî',
    contexte: 'Commencer la journée dans le rappel et la sérénité.',
  },
  soir: {
    arabe: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
    translitteration: 'Allâhoumma bika amsaynâ, wa bika asbahnâ, wa bika nahyâ, wa bika namoûtou, wa ilayka al-masîr.',
    traduction: 'Ô Allah, c\'est par Toi que nous atteignons le soir et par Toi que nous atteignons le matin, par Toi nous vivons, par Toi nous mourons, et vers Toi est le retour.',
    source: 'Tirmidhî',
    contexte: 'Se placer sous la protection d\'Allah avant la nuit.',
  },
  afiya: {
    arabe: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ',
    translitteration: 'Allâhoumma innî as\'alouka al-\'âfiyah.',
    traduction: 'Ô Allah, je Te demande le bien-être et la préservation.',
    source: 'Abû Dâwûd, Ibn Mâjah',
    contexte: 'Une courte invocation pour revenir à l\'essentiel.',
  },
  reveil: {
    arabe: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
    translitteration: 'Al-hamdou lillâhi-lladhî ahyânâ ba\'da mâ amâtanâ wa ilayhi an-noushoûr.',
    traduction: 'Louange à Allah qui nous a rendu la vie après nous avoir fait mourir, et vers Lui est la résurrection.',
    source: 'Boukhârî',
    contexte: 'Remercier au réveil.',
  },
  soucis: {
    arabe: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ',
    translitteration: 'Allâhoumma innî a\'oûdhou bika mina al-hammi wa al-hazan.',
    traduction: 'Ô Allah, je cherche refuge auprès de Toi contre les soucis et la tristesse.',
    source: 'Boukhârî',
    contexte: 'Déposer ce qui pèse.',
  },
  tasbih: {
    arabe: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    translitteration: 'Soubhâna-llâhi wa bi-hamdih.',
    traduction: 'Gloire et louange à Allah.',
    source: 'Boukhârî, Mouslim',
    contexte: 'Un rappel léger au fil de la journée.',
  },
  sommeil: {
    arabe: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
    translitteration: 'Bismika-llâhoumma amoûtou wa ahyâ.',
    traduction: 'C\'est en Ton nom, ô Allah, que je meurs et que je vis.',
    source: 'Boukhârî',
    contexte: 'Avant de s\'endormir.',
  },
};

// ---- CITATIONS DE SECOURS (si l'API de citations est indisponible) ----
export const CITATIONS_SECOURS = [
  { texte: 'La patience est amère, mais son fruit est doux.', auteur: 'Jean-Jacques Rousseau' },
  { texte: 'Le bonheur est parfois caché dans l\'inconnu.', auteur: 'Victor Hugo' },
  { texte: 'Rien ne sert de courir ; il faut partir à point.', auteur: 'Jean de La Fontaine' },
  { texte: 'Il faut cultiver notre jardin.', auteur: 'Voltaire' },
];
