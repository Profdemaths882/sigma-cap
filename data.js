// Valeurs de départ : affiche « Grille tarifaire 2026-2027 » + emploi du temps proposé.
// Tout est modifiable ensuite depuis l'espace gestionnaire (onglet Paramètres).
window.SIGMA_DEFAULTS = {
  settings: {
    nom: "Sigma Cap — Vers la réussite",
    annee: "2026-2027",
    debut: "2026-10-14",
    finMois: "2027-07",
    lieu: "CEM Kennedy",
    jours: "Mercredi · Vendredi · Samedi",
    inscriptionsOuvertes: true,
    contacts: [
      { nom: "M. Thiam", tel: "78 12 89 833" },
      { nom: "M. Faye", tel: "77 421 05 26" }
    ],
    resultats: { titre: "100 % de mention en S1", details: ["2 mentions Bien", "5 mentions Assez Bien"], annee: "2025-2026" },
    classes: ["2nde S", "1ère S1", "1ère S2", "Terminale S1", "Terminale S2"],
    tarifs: {
      "2nde S":       { seules: { Maths: 10000, PC: 10000 },            pack: { matieres: ["Maths", "PC"], prix: 15000 } },
      "1ère S1":      { seules: { Maths: 12000, PC: 12000, SVT: 5000 },            pack: { matieres: ["Maths", "PC"], prix: 20000 } },
      "1ère S2":      { seules: { Maths: 10000, PC: 10000, SVT: 5000 },            pack: { matieres: ["Maths", "PC"], prix: 18000 } },
      "Terminale S1": { seules: { Maths: 15000, PC: 15000 },            pack: { matieres: ["Maths", "PC"], prix: 30000 } },
      "Terminale S2": { seules: { Maths: 10000, PC: 10000, SVT: 10000 }, pack: { matieres: ["Maths", "PC", "SVT"], prix: 25000 } }
    },
    seuils: { "2nde S": 6, "1ère S1": 6, "1ère S2": 6, "Terminale S1": 6, "Terminale S2": 6 },
    paiement: "Wave ou Orange Money au 78 12 89 833 (M. Thiam), ou en espèces auprès de M. Thiam ou de M. Faye.",
    relance:"Bonjour, ici Sigma Cap. La mensualité de {mois} pour {eleve} ({classe}) reste à régler : {reste}. Merci !"
  },
  // Documents intégrés au site (dossier docs/) : visibles par les élèves inscrits de la classe et de la matière
  docs: [
    { id: "st-2s-0", titre: "Fiche de TD n°1 Sigma Cap – Calcul dans ℝ", type: "Fiche d'exercices", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/sigma-cap-td1-calcul-dans-R.pdf", taille: 398021, par: "M. Racine Thiam", note: "20 exercices sur 4 pages · puissances, fractions, identités remarquables (carrés et cubes), radicaux emboîtés, valeur absolue, encadrements, démonstrations", fixe: true },
    { id: "st-2s-1", titre: "Cours – Calcul dans ℝ", type: "Cours", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/cours-calcul-dans-R.pdf", taille: 207440, par: "Sigma Cap", note: "M. I.H. Diallo · puissances, identités remarquables, radicaux, valeur absolue, équations et inéquations", fixe: true },
    { id: "st-2s-2", titre: "Cours et exercices de mathématiques – Seconde", type: "Cours", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/cours-et-exercices-seconde.pdf", taille: 1430672, par: "Sigma Cap", note: "65 pages · programme français : vecteurs, fonctions, statistiques, probabilités, trigonométrie", fixe: true },
    { id: "st-2s-3", titre: "Recueil d'exercices 2nde S – tous les chapitres", type: "Fiche d'exercices", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/recueil-exercices-2nde-S.pdf", taille: 3597185, par: "Sigma Cap", note: "55 pages · calcul dans ℝ, polynômes, vecteurs, barycentre, angles et trigonométrie…", fixe: true },
    { id: "st-2s-4", titre: "TD n°6 – Repérage cartésien", type: "Fiche d'exercices", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/td6-reperage-cartesien.pdf", taille: 350654, par: "Sigma Cap", note: "M. Sow · Lycée ex-CEM Missirah Wadène", fixe: true },
    { id: "st-2s-5", titre: "TD n°7 – Polynômes et fractions rationnelles", type: "Fiche d'exercices", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/td7-polynomes-fractions-rationnelles.pdf", taille: 293749, par: "Sigma Cap", note: "M. Sow · Lycée ex-CEM Missirah Wadène", fixe: true },
    { id: "st-2s-6", titre: "Série n°2 – Calcul vectoriel et barycentre", type: "Fiche d'exercices", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/serie2-calcul-vectoriel-barycentre.pdf", taille: 253355, par: "Sigma Cap", note: "Lycée d'excellence Birago Diop", fixe: true },
    { id: "st-2s-7", titre: "Devoir n°1 du 1er semestre (3 h)", type: "Évaluation", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/devoir1-semestre1-bambey.pdf", taille: 142391, par: "Sigma Cap", note: "Lycée de Bambey Sérère · équations et inéquations", fixe: true },
    { id: "st-2s-8", titre: "Devoir n°1 du 2nd semestre (4 h)", type: "Évaluation", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/devoir1-semestre2-lao.pdf", taille: 640446, par: "Sigma Cap", note: "Lycée Aéré Lao · équations, inéquations, systèmes", fixe: true },
    { id: "st-2s-9", titre: "Composition du 2nd semestre (3 h)", type: "Évaluation", matiere: "Maths", classes: ["2nde S"], date: "2026-10-20", url: "docs/2nde-S/composition-semestre2-jules-sagna.pdf", taille: 109645, par: "Sigma Cap", note: "Lycée Jules Sagna · polynômes, droites", fixe: true }
  ],
  teachers: [
    { id: "t-thiam", nom: "M. Racine Thiam", matiere: "Maths", tel: "78 12 89 833", statut: "actif", parts: 1, role: "admin", login: "thiam", note: "Associé · ProfDeMaths 2.0" },
    { id: "t-faye", nom: "M. Faye", matiere: "Maths", tel: "77 421 05 26", statut: "actif", parts: 1, role: "admin", login: "faye", note: "Associé · Lycée Kennedy" },
    { id: "t-sene", nom: "M. Sène", matiere: "PC", tel: "", statut: "actif", parts: 1, role: "prof", login: "sene", note: "" }
  ],
  sessions: [
    { id: "s1",  jour: "Mercredi", debut: "15:00", fin: "18:00", matiere: "Maths", classes: ["2nde S"], prof: "M. Racine Thiam", salle: "" },
    { id: "s2",  jour: "Mercredi", debut: "15:00", fin: "18:00", matiere: "PC",    classes: ["1ère S1", "1ère S2"], prof: "M. Sène", salle: "" },
    { id: "s3",  jour: "Mercredi", debut: "15:00", fin: "18:00", matiere: "Maths", classes: ["Terminale S1", "Terminale S2"], prof: "M. Faye", salle: "" },
    { id: "s4",  jour: "Vendredi", debut: "15:00", fin: "17:00", matiere: "PC",    classes: ["2nde S"], prof: "", salle: "" },
    { id: "s5",  jour: "Vendredi", debut: "15:00", fin: "18:00", matiere: "SVT",   classes: ["Terminale S2"], prof: "", salle: "" },
    { id: "s6",  jour: "Samedi",   debut: "13:00", fin: "15:00", matiere: "PC",    classes: ["2nde S"], prof: "M. Sène", salle: "" },
    { id: "s7",  jour: "Samedi",   debut: "13:00", fin: "15:00", matiere: "Maths", classes: ["Terminale S1", "Terminale S2"], prof: "M. Faye", salle: "" },
    { id: "s8",  jour: "Samedi",   debut: "13:00", fin: "16:30", matiere: "Maths", classes: ["1ère S1", "1ère S2"], prof: "M. Racine Thiam", salle: "" },
    { id: "s9",  jour: "Samedi",   debut: "15:00", fin: "17:00", matiere: "Maths", classes: ["2nde S"], prof: "M. Faye", salle: "" },
    { id: "s10", jour: "Samedi",   debut: "15:00", fin: "18:00", matiere: "PC",    classes: ["Terminale S1", "Terminale S2"], prof: "", salle: "" },
    { id: "s11", jour: "Samedi",   debut: "16:30", fin: "18:30", matiere: "SVT",   classes: ["1ère S1", "1ère S2"], prof: "", salle: "" }
  ]
};
