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
