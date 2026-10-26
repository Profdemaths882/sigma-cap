/* Sigma Cap — logique partagée.
   Le même code tourne côté serveur (Google Apps Script) et dans le navigateur en mode démo.
   Il ne touche jamais directement au stockage : on lui donne un « store ». */
var SigmaCore = (function () {
  'use strict';
  var MATIERES = ['Maths', 'PC', 'SVT'];
  var CATS = ['Versement prof', 'Location salle', 'Photocopies / fiches', 'Communication', 'Matériel', 'Autre'];
  var TTL = 21600; // 6 h, prolongées à chaque action
  var CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /* ---------- SHA-256 (mots de passe) ---------- */
  var K = [], H0 = [];
  (function () {
    var n = 2, found = 0;
    function prime(x) { for (var i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; }
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) >>> 0; }
    while (found < 64) { if (prime(n)) { if (found < 8) H0[found] = frac(Math.pow(n, 1 / 2)); K[found] = frac(Math.pow(n, 1 / 3)); found++; } n++; }
  })();
  function sha256(msg) {
    var s = unescape(encodeURIComponent(String(msg))), l = s.length, w = [], i, j;
    for (i = 0; i < l; i++) w[i >> 2] |= (s.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    var nb = (((l + 8) >> 6) + 1) * 16; for (i = 0; i < nb; i++) w[i] = w[i] | 0;
    w[nb - 1] = l * 8;
    var h = H0.slice(), W = new Array(64);
    function r(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < nb; i += 16) {
      for (j = 0; j < 64; j++) {
        if (j < 16) W[j] = w[i + j];
        else { var a = W[j - 15], b = W[j - 2]; W[j] = (W[j - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + W[j - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
      }
      var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], HH = h[7];
      for (j = 0; j < 64; j++) {
        var t1 = (HH + (r(E, 6) ^ r(E, 11) ^ r(E, 25)) + ((E & F) ^ (~E & G)) + K[j] + W[j]) | 0;
        var t2 = ((r(A, 2) ^ r(A, 13) ^ r(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
        HH = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
      h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + HH) | 0;
    }
    return h.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  /* ---------- utilitaires ---------- */
  function mk(d) { return String(d || '').slice(0, 7); }
  function asList(v) { return Array.isArray(v) ? v : String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (+f(x) || 0); }, 0); }
  function clean(v, n) { return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n || 80); }
  function note(v) { var x = String(v == null ? '' : v).replace(',', '.').trim(); if (x === '') return ''; var f = parseFloat(x); return isNaN(f) ? '' : String(Math.max(0, Math.min(20, f))); }
  function monthsRange(a, b) {
    var out = []; if (!a || !b) return out;
    var y = +a.slice(0, 4), m = +a.slice(5, 7), by = +b.slice(0, 4), bm = +b.slice(5, 7);
    while (y < by || (y === by && m <= bm)) { out.push(y + '-' + ('0' + m).slice(-2)); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  function prix(classe, mats, tarifs) {
    var t = tarifs && tarifs[classe]; mats = asList(mats);
    if (!t || !mats.length) return 0;
    var key = function (a) { return a.slice().sort().join('+'); };
    if (t.pack && t.pack.matieres && key(t.pack.matieres) === key(mats)) return +t.pack.prix || 0;
    // Pack + matière en option (ex. 1ère S1/S2 : pack Maths + PC + SVT en option à 5 000 F) = prix du pack + prix de l'option
    var pk = t.pack && t.pack.matieres ? asList(t.pack.matieres) : [];
    if (pk.length && pk.every(function (m) { return mats.indexOf(m) >= 0; }))
      return (+t.pack.prix || 0) + sum(mats.filter(function (m) { return pk.indexOf(m) < 0; }), function (m) { return t.seules[m]; });
    return sum(mats, function (m) { return t.seules[m]; });
  }
  /* ---------- règle du premier mois (inscription en cours d'année) ----------
     Mois de la rentrée (octobre) : inscrit avant le 15 → mois entier ; du 15 au 20 → moitié du mois ; après le 20 → rien ce mois-ci, on commence le mois suivant.
     Mois suivants : inscrit jusqu'au 20 → mois entier ; après le 20 → on commence le mois suivant.
     Chaque mois se paie au plus tard le 5 du mois suivant (réglage « jourLimite » de l'appli). */
  function nextMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } return y + '-' + ('0' + mo).slice(-2); }
  function prevMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1; if (mo < 1) { mo = 12; y--; } return y + '-' + ('0' + mo).slice(-2); }
  function planInscription(dateIso, cfg) {
    cfg = cfg || {}; var m = mk(dateIso), debut = mk(cfg.debut || dateIso), day = +String(dateIso).slice(8, 10) || 1;
    var jm = +(cfg.jourMoitie || 15), jr = +(cfg.jourReport || 20);
    if (m < debut) return { moisDebut: debut, moitie: '' };
    if (day > jr) return { moisDebut: nextMonth(m), moitie: '' };
    if (m === debut && day >= jm) return { moisDebut: m, moitie: 'oui' };
    return { moisDebut: m, moitie: '' };
  }
  function dueFor(s, mois) { var t = +s.tarif || 0; return (s.moitie === 'oui' && mois === s.moisDebut) ? Math.round(t / 2) : t; }

  /* ---------- réduction « anciens élèves des cours de vacances » ---------- */
  function vacPrix(classe, mats, settings) {
    var v = settings && settings.tarifsVac && settings.tarifsVac[classe]; mats = asList(mats);
    if (!v || !mats.length) return 0;
    var t = settings.tarifs && settings.tarifs[classe];
    var key = function (a) { return a.slice().sort().join('+'); };
    if (t && t.pack && t.pack.matieres && key(t.pack.matieres) === key(mats) && +v.pack > 0) return +v.pack;
    var total = 0;
    for (var i = 0; i < mats.length; i++) { var p = +((v.seules || {})[mats[i]]); if (!(p > 0)) return 0; total += p; }
    return total;
  }
  function normTokens(x) {
    return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(function (t) { return t.length > 1; });
  }
  // Reconnaît un nom de la liste malgré accents, majuscules, initiales (« Yaye F Thiam ») ou prénoms en plus / en moins.
  function onVacList(prenom, nom, list) {
    var mine = normTokens(prenom + ' ' + nom), last = normTokens(nom).pop();
    if (mine.length < 2 || !last) return '';
    return (list || []).filter(function (n) {
      var ref = normTokens(n); if (ref.length < 2 || ref.indexOf(last) < 0) return false;
      return ref.every(function (t) { return mine.indexOf(t) >= 0; }) || mine.every(function (t) { return ref.indexOf(t) >= 0; });
    })[0] || '';
  }
  function pubSettings(s) { if (!s) return s; var c = {}; for (var k in s) if (k !== 'listeVac') c[k] = s[k]; return c; }

  function isActive(s) { return s.statut === 'actif' || s.statut === 'code'; }
  function payOk(p) { return !p.statut || p.statut === 'valide'; }
  function partsOf(t) { return t.parts === '' || t.parts == null ? 1 : +t.parts || 0; }

  /* ---------- finances et répartition ----------
     Net = paiements validés − frais de fonctionnement (les versements aux profs ne sont pas des frais).
     Chaque intervenant actif reçoit Net × ses parts ÷ total des parts (SVT : 0,5 part = moitié des autres). */
  function finance(d, mois) {
    var pays = (d.payments || []).filter(function (p) { return payOk(p) && (!mois || p.mois === mois); });
    var deps = (d.expenses || []).filter(function (e) { return !mois || mk(e.date) === mois; });
    var frais = deps.filter(function (e) { return e.categorie !== 'Versement prof'; });
    var vers = deps.filter(function (e) { return e.categorie === 'Versement prof'; });
    var encaisse = sum(pays, function (p) { return p.montant; });
    var inscriptions = sum(pays.filter(function (p) { return String(p.note || '').indexOf('[Inscription]') === 0; }), function (p) { return p.montant; });
    var depenses = sum(frais, function (e) { return e.montant; });
    var net = encaisse - depenses;
    var team = (d.teachers || []).filter(function (t) { return t.statut === 'actif' && partsOf(t) > 0; });
    var totalParts = sum(team, partsOf);
    var rows = team.map(function (t) {
      var share = totalParts ? Math.round(net * partsOf(t) / totalParts) : 0;
      var verse = sum(vers.filter(function (e) { return e.profId === t.id; }), function (e) { return e.montant; });
      return { id: t.id, nom: t.nom, matiere: t.matiere, parts: partsOf(t), share: share, verse: verse, reste: share - verse };
    });
    var pend = (d.payments || []).filter(function (p) { return p.statut === 'a_valider' && (!mois || p.mois === mois); });
    return { encaisse: encaisse, inscriptions: inscriptions, mensualites: encaisse - inscriptions, depenses: depenses, verse: sum(vers, function (e) { return e.montant; }), net: net, totalParts: totalParts, rows: rows,
      aValider: { n: pend.length, montant: sum(pend, function (p) { return p.montant; }) } };
  }
  function financeByMonth(d) {
    var ms = {};
    (d.payments || []).forEach(function (p) { if (p.mois) ms[p.mois] = 1; });
    (d.expenses || []).forEach(function (e) { if (e.date) ms[mk(e.date)] = 1; });
    return Object.keys(ms).sort().map(function (m) { var f = finance(d, m); f.mois = m; return f; });
  }

  /* ---------- alertes : groupes trop chargés, postes à pourvoir ---------- */
  function alerts(d) {
    var st = d.settings || {}, out = [];
    var seuils = st.seuils || {};
    (st.classes || []).forEach(function (c) {
      var n = (d.students || []).filter(function (s) { return s.classe === c && s.statut !== 'abandon'; }).length;
      var max = +(seuils[c] || 6);
      if (n > max) out.push({ type: 'groupe', classe: c, n: n, max: max, msg: c + ' : ' + n + ' élèves (seuil ' + max + '). Pensez à trouver un nouveau prof ou à ouvrir un 2e groupe.' });
    });
    var act = function (m) { return (d.teachers || []).filter(function (t) { return t.matiere === m && t.statut === 'actif'; }).length; };
    if (act('PC') < 2) out.push({ type: 'prof', msg: 'Physique-Chimie : ' + act('PC') + ' prof actif sur 2 prévus.' });
    if (act('SVT') < 1) out.push({ type: 'prof', msg: 'SVT : aucun prof actif pour la Terminale S2.' });
    var orphan = (d.sessions || []).filter(function (x) { return !x.prof; });
    if (orphan.length) out.push({ type: 'prof', msg: orphan.length + ' cours sans prof : ' + orphan.map(function (x) { return x.matiere + ' ' + asList(x.classes).join('+') + ' (' + x.jour.toLowerCase() + ')'; }).join(', ') + '.' });
    return out;
  }

  /* =========================================================
     Serveur : make(store) renvoie handle(requête)
     ========================================================= */
  function make(st) {
    var KINDS = ['students', 'payments', 'expenses', 'sessions', 'teachers'];
    function find(kind, id) { return st.read(kind).filter(function (x) { return x.id === id; })[0] || null; }
    function strip(kind, o) {
      var c = {}; for (var k in o) c[k] = o[k];
      delete c.pwd; delete c.salt;
      if (kind === 'students' || kind === 'teachers') c.hasPwd = !!o.pwd;
      return c;
    }
    function setPwd(o, pwd) { o.salt = st.uuid().replace(/-/g, '').slice(0, 12); o.pwd = sha256(o.salt + '|' + pwd); }
    function okPwd(o, pwd) { return !!o.pwd && sha256(o.salt + '|' + pwd) === o.pwd; }
    function newCode() { var h = st.uuid().replace(/-/g, ''), c = ''; for (var i = 0; i < 6; i++) c += CODE_ABC[parseInt(h.substr(i * 2, 2), 16) % CODE_ABC.length]; return c; }
    // Suivi des notes : { notes: [{id, mat, val, date, type, lib, at}], coms: [{id, mat, texte, date, par, role}] } rangé en JSON dans la colonne « suivi »
    function suiviOf(s) {
      var o = null; try { o = s.suivi ? (typeof s.suivi === 'string' ? JSON.parse(s.suivi) : s.suivi) : null; } catch (e) { o = null; }
      o = o || {}; if (!Array.isArray(o.notes)) o.notes = []; if (!Array.isArray(o.coms)) o.coms = []; return o;
    }
    function teaches(sess, s, mat) {
      if (sess.role === 'admin') return true;
      var me = find('teachers', sess.id); if (!me) return false;
      return st.read('sessions').some(function (x) { return x.prof === me.nom && asList(x.classes).indexOf(s.classe) >= 0 && (!mat || x.matiere === mat) && asList(s.matieres).indexOf(x.matiere) >= 0; });
    }
    // Fiches d'exercices et évaluations (PDF) : fichier rangé par le store (Google Drive), fiche dans la table « docs »
    var DOC_TYPES = ['Fiche d\'exercices', 'Devoir à rendre', 'Évaluation', 'Corrigé', 'Cours'];
    function docsFor(sess, d) {
      var docs = st.read('docs').sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)); });
      if (sess.role === 'admin' || sess.role === 'prof') return docs;
      var s = d.students.filter(function (x) { return x.id === sess.id; })[0];
      if (!s || !isActive(s)) return [];
      return docs.filter(function (x) { return asList(x.classes).indexOf(s.classe) >= 0 && (!x.matiere || asList(s.matieres).indexOf(x.matiere) >= 0); });
    }
    // Devoirs rendus en photos par les élèves : chacun voit les siens ; le prof, ceux de ses élèves dans sa matière
    function rendusFor(sess, d) {
      var rs = st.read('rendus'); if (sess.role === 'admin') return rs;
      if (sess.role === 'eleve') return rs.filter(function (r) { return r.studentId === sess.id; });
      var docs = st.read('docs');
      return rs.filter(function (r) {
        var s = d.students.filter(function (x) { return x.id === r.studentId; })[0], dc = docs.filter(function (x) { return x.id === r.docId; })[0];
        return s && ((dc && dc.parId === sess.id) || teaches(sess, s, r.matiere));
      });
    }
    function canRendu(sess, id) {
      var r = find('rendus', id); if (!r) throw new Error('Copie introuvable.');
      if (sess.role === 'admin') return r;
      if (sess.role === 'eleve') { if (r.studentId !== sess.id) throw new Error('Accès refusé.'); return r; }
      var s = find('students', r.studentId), dc = find('docs', r.docId);
      if (!s || !((dc && dc.parId === sess.id) || teaches(sess, s, r.matiere))) throw new Error("Vous n'enseignez pas cette matière à cet élève.");
      return r;
    }
    var RENDU_MIME = { '/9j/': ['image/jpeg', '.jpg'], 'iVBOR': ['image/png', '.png'], 'UklGR': ['image/webp', '.webp'], 'JVBER': ['application/pdf', '.pdf'] };
    // Évaluations en ligne : la correction est chiffrée dans le site ; la clé n'est donnée qu'après déblocage par l'admin
    function clesFor(sess, d, s) {
      var all = st.evalKeys || {}, out = {}, k;
      if (sess.role === 'admin' || sess.role === 'prof') { for (k in all) out[k] = all[k]; return out; }
      if (!s || !isActive(s)) return out;
      var deb = (d.settings && Array.isArray(d.settings.debloques)) ? d.settings.debloques : [];
      deb.forEach(function (id) { if (all[id]) out[id] = all[id]; });
      return out;
    }
    function nextNum() { return 'SC26-' + ('000' + st.nextCounter()).slice(-4); }
    function settings() {
      var s = st.getSettings();
      if (s) {
        // Liste des anciens élèves des vacances et tarifs réduits : valeurs du serveur tant que les Paramètres n'en ont pas
        if (!Array.isArray(s.listeVac) && st.defaultListeVac) s.listeVac = st.defaultListeVac.slice();
        if (st.defaultTarifsVac) { s.tarifsVac = s.tarifsVac || {}; for (var c in st.defaultTarifsVac) if (!s.tarifsVac[c]) s.tarifsVac[c] = JSON.parse(JSON.stringify(st.defaultTarifsVac[c])); }
      }
      return s;
    }
    function today() { return st.today(); }

    function session(req) {
      if (!req.token) return null;
      var raw = st.cacheGet('t:' + req.token); if (!raw) return null;
      st.cachePut('t:' + req.token, raw, TTL);
      return JSON.parse(raw);
    }
    function need(sess, roles) {
      if (!sess) throw new Error('Session expirée : reconnecte-toi.');
      if (roles.indexOf(sess.role) < 0) throw new Error('Accès refusé.');
    }
    function open(sess) { var t = st.uuid().replace(/-/g, '') + st.uuid().replace(/-/g, '').slice(0, 8); st.cachePut('t:' + t, JSON.stringify(sess), TTL); return t; }

    function all() {
      return { settings: settings(), sessions: st.read('sessions'), teachers: st.read('teachers'), students: st.read('students'), payments: st.read('payments'), expenses: st.read('expenses') };
    }
    function pubTeacher(t) { return { id: t.id, nom: t.nom, matiere: t.matiere, statut: t.statut, tel: t.tel, parts: partsOf(t) }; }

    function dataFor(sess) {
      var d = all();
      if (sess.role === 'admin') {
        return { role: 'admin', me: { id: sess.id, nom: sess.nom }, settings: d.settings, sessions: d.sessions,
          teachers: d.teachers.map(function (t) { return strip('teachers', t); }), students: d.students.map(function (s) { return strip('students', s); }),
          payments: d.payments, expenses: d.expenses, docs: docsFor(sess, d), rendus: rendusFor(sess, d), cles: clesFor(sess, d), sheetUrl: st.sheetUrl ? st.sheetUrl() : '' };
      }
      if (sess.role === 'prof') {
        var me = d.teachers.filter(function (t) { return t.id === sess.id; })[0];
        if (!me) throw new Error('Compte introuvable.');
        var mine = d.sessions.filter(function (x) { return x.prof === me.nom; });
        var studs = d.students.filter(function (s) {
          return s.statut !== 'abandon' && mine.some(function (x) { return asList(x.classes).indexOf(s.classe) >= 0 && asList(s.matieres).indexOf(x.matiere) >= 0; });
        }).map(function (s) { return { id: s.id, num: s.num, prenom: s.prenom, nom: s.nom, classe: s.classe, etablissement: s.etablissement, notesMaths: s.notesMaths, notesPC: s.notesPC, notesSVT: s.notesSVT, matieres: s.matieres, statut: s.statut, createdAt: s.createdAt, suivi: s.suivi || '' }; });
        return { role: 'prof', me: pubTeacher(me), settings: pubSettings(d.settings), sessions: d.sessions, teachers: d.teachers.map(pubTeacher), students: studs,
          finance: finance(d), byMonth: financeByMonth(d), alerts: alerts(d), docs: docsFor(sess, d), rendus: rendusFor(sess, d), cles: clesFor(sess, d) };
      }
      var s = d.students.filter(function (x) { return x.id === sess.id; })[0];
      if (!s) throw new Error('Compte introuvable.');
      var meS = strip('students', s); delete meS.codeConf; delete meS.essais;
      return { role: 'eleve', me: meS, settings: pubSettings(d.settings), sessions: d.sessions.filter(function (x) { return asList(x.classes).indexOf(s.classe) >= 0; }),
        teachers: d.teachers.map(pubTeacher), payments: d.payments.filter(function (p) { return p.studentId === s.id; }), docs: docsFor(sess, d), rendus: rendusFor(sess, d), cles: clesFor(sess, d, s) };
    }

    function onValidated(studentId) {
      var s = find('students', studentId);
      if (s && s.statut === 'attente') { s.statut = 'code'; if (!s.codeConf) s.codeConf = newCode(); st.upsert('students', s); }
    }
    function confirmStudent(s, code) {
      if (s.statut === 'actif') return true;
      if (!s.codeConf) throw new Error("Ton paiement n'est pas encore validé. Après validation, l'admin te remet ton code.");
      if ((+s.essais || 0) >= 8) throw new Error("Trop d'essais. Contacte le gestionnaire.");
      if (String(code || '').trim().toUpperCase().replace(/\s/g, '') !== String(s.codeConf).toUpperCase()) {
        s.essais = (+s.essais || 0) + 1; st.upsert('students', s); throw new Error('Code incorrect. Vérifie les lettres et les chiffres.');
      }
      s.statut = 'actif'; s.confirmeLe = today(); s.essais = 0; st.upsert('students', s);
      return true;
    }

    return function handle(req) {
      var a = req.action, sess = session(req), cfg = settings() || {};
      switch (a) {
        /* ----- public ----- */
        case 'config':
          return { settings: pubSettings(settings()), sessions: st.read('sessions'), teachers: st.read('teachers').map(pubTeacher) };

        case 'checkVac': {
          // Dit seulement si le nom tapé est sur la liste (la liste elle-même n'est jamais envoyée).
          var hitV = onVacList(clean(req.prenom, 40), clean(req.nom, 40), cfg.listeVac);
          var cv = clean(req.classe, 20), mv = asList(req.matieres);
          return { eligible: !!hitV, prix: hitV && cv ? vacPrix(cv, mv, cfg) : 0, normal: cv && cfg.tarifs ? prix(cv, mv, cfg.tarifs) : 0 };
        }

        case 'register': {
          if (cfg.inscriptionsOuvertes === false) throw new Error('Les inscriptions en ligne sont fermées.');
          var s = req.student || {};
          var rec = {
            prenom: clean(s.prenom, 40), nom: clean(s.nom, 40), sexe: s.sexe === 'M' ? 'M' : 'F', classe: clean(s.classe, 20), etablissement: clean(s.etablissement, 80),
            telEleve: clean(s.telEleve, 20), parentNom: clean(s.parentNom, 60), telParent: clean(s.telParent, 20),
            matieres: asList(s.matieres).filter(function (m) { return MATIERES.indexOf(m) >= 0; }),
            notesMaths: note(s.notesMaths), notesPC: note(s.notesPC), notesSVT: note(s.notesSVT),
            inscritPar: s.inscritPar === 'parent' ? 'parent' : 'eleve'
          };
          var pw = String(req.password || '');
          if (!rec.prenom || !rec.nom || !rec.classe || !rec.etablissement || !rec.matieres.length || digits(rec.telParent).length < 9) throw new Error('Formulaire incomplet.');
          if (pw.length < 4) throw new Error('Le mot de passe doit avoir au moins 4 caractères.');
          var studs = st.read('students');
          var low = function (x) { return String(x || '').toLowerCase().trim(); };
          // Deux homonymes peuvent être dans la même classe : on ne bloque que si le même parent inscrit deux fois le même enfant.
          var tp = digits(rec.telParent).slice(-9);
          if (studs.some(function (x) { return low(x.nom) === low(rec.nom) && low(x.prenom) === low(rec.prenom) && x.classe === rec.classe && digits(x.telParent).slice(-9) === tp; }))
            throw new Error('Cet élève est déjà inscrit avec ce numéro de parent. Connectez-vous à votre espace, ou contactez le gestionnaire si le mot de passe est oublié.');
          var te = digits(rec.telEleve).slice(-9);
          if (te.length === 9 && studs.some(function (x) { return digits(x.telEleve).slice(-9) === te; }))
            throw new Error("Ce numéro de téléphone d'élève est déjà utilisé. Connecte-toi à ton espace.");
          if (studs.filter(function (x) { return x.createdAt === today() && x.source === 'en_ligne'; }).length > 300) throw new Error("Trop d'inscriptions aujourd'hui, réessaie demain.");
          var plan = planInscription(today(), cfg);
          var listed = onVacList(rec.prenom, rec.nom, cfg.listeVac);
          var vp = listed ? vacPrix(rec.classe, rec.matieres, cfg) : 0;
          rec.vacances = vp > 0 ? 'oui' : '';
          rec.id = 'el-' + st.uuid().replace(/-/g, '').slice(0, 10); rec.num = nextNum(); rec.createdAt = today();
          rec.tarif = vp > 0 ? vp : cfg.tarifs ? prix(rec.classe, rec.matieres, cfg.tarifs) : Math.max(0, Math.min(100000, +s.tarif || 0));
          rec.moisDebut = plan.moisDebut; rec.moitie = plan.moitie; rec.statut = 'attente'; rec.source = 'en_ligne'; rec.notes = ''; rec.codeConf = ''; rec.confirmeLe = ''; rec.essais = 0;
          setPwd(rec, pw); st.upsert('students', rec);
          var ses = { role: 'eleve', id: rec.id, nom: rec.prenom };
          return { num: rec.num, token: open(ses), data: dataFor(ses) };
        }

        case 'login': {
          var L = String(req.login || '').trim(), P = String(req.password || ''), key = 'f:' + L.toLowerCase();
          var fails = +(st.cacheGet(key) || 0);
          if (fails >= 10) throw new Error("Trop d'essais. Réessaie dans 15 minutes.");
          var who = null;
          if (L.toLowerCase() === 'admin' && st.masterCode && P === st.masterCode) who = { role: 'admin', id: 'master', nom: 'Administrateur' };
          if (!who) {
            var t = st.read('teachers').filter(function (x) { return x.login && String(x.login).toLowerCase() === L.toLowerCase(); })[0];
            if (t && t.statut !== 'poste à pourvoir' && okPwd(t, P)) who = { role: t.role === 'admin' ? 'admin' : 'prof', id: t.id, nom: t.nom };
          }
          if (!who) {
            // Élève ou parent : N° d'inscription, téléphone de l'élève ou téléphone du parent
            var dg = digits(L).slice(-9);
            var good = st.read('students').filter(function (x) {
              var hit = String(x.num).toUpperCase() === L.toUpperCase() || (dg.length === 9 && (digits(x.telEleve).slice(-9) === dg || digits(x.telParent).slice(-9) === dg));
              return hit && x.statut !== 'abandon' && okPwd(x, P);
            });
            if (good.length > 1) throw new Error("Plusieurs élèves sont inscrits avec ce numéro : connectez-vous avec le N° d'inscription de l'enfant (ex. SC26-0007).");
            if (good.length === 1) who = { role: 'eleve', id: good[0].id, nom: good[0].prenom };
          }
          if (!who) { st.cachePut(key, String(fails + 1), 900); if (st.sleep) st.sleep(500); throw new Error('Identifiant ou mot de passe incorrect.'); }
          return { token: open(who), data: dataFor(who) };
        }
        case 'logout': if (req.token) st.cacheDel('t:' + req.token); return true;
        case 'data': need(sess, ['admin', 'prof', 'eleve']); return dataFor(sess);

        case 'changePwd': {
          need(sess, ['admin', 'prof', 'eleve']);
          if (sess.id === 'master') throw new Error("Le compte « admin » se change dans le fichier du serveur.");
          var kind = sess.role === 'eleve' ? 'students' : 'teachers', o = find(kind, sess.id);
          if (!okPwd(o, String(req.old || ''))) throw new Error('Ancien mot de passe incorrect.');
          if (String(req.password || '').length < 4) throw new Error('Le nouveau mot de passe doit avoir au moins 4 caractères.');
          setPwd(o, String(req.password)); st.upsert(kind, o); return true;
        }

        /* ----- élève ----- */
        case 'confirm': {
          var stu = sess && sess.role === 'eleve' ? find('students', sess.id) : st.read('students').filter(function (x) { return String(x.num).toUpperCase() === String(req.num || '').trim().toUpperCase(); })[0];
          if (!stu) throw new Error("Numéro d'inscription introuvable.");
          confirmStudent(stu, req.codeConf);
          return sess ? dataFor(sess) : { ok: true, prenom: stu.prenom };
        }
        case 'declarePay': {
          need(sess, ['eleve']);
          var me = find('students', sess.id), p = req.payment || {};
          var mois = String(p.mois || ''), months = monthsRange(mk(cfg.debut || today()), cfg.finMois || '2027-07');
          if (months.indexOf(mois) < 0) throw new Error('Mois invalide.');
          var mt = Math.round(+p.montant || 0);
          if (mt <= 0 || mt > 200000) throw new Error('Montant invalide.');
          if (['Wave', 'Orange Money', 'Espèces'].indexOf(p.mode) < 0) throw new Error('Mode de paiement invalide.');
          if (p.mode !== 'Espèces' && clean(p.ref, 40).length < 4) throw new Error('Indique la référence de la transaction (reçue par SMS).');
          if (st.read('payments').filter(function (x) { return x.studentId === me.id && x.statut === 'a_valider'; }).length >= 5) throw new Error('Tu as déjà 5 paiements en attente de validation.');
          st.upsert('payments', { id: 'pay-' + st.uuid().replace(/-/g, '').slice(0, 10), studentId: me.id, mois: mois, montant: mt, mode: p.mode, date: today(), ref: clean(p.ref, 40),
            note: clean(p.note, 120), statut: 'a_valider', declarePar: 'eleve', validePar: '', valideLe: '', createdAt: today() });
          return dataFor(sess);
        }
        case 'addNote': {
          need(sess, ['eleve']);
          var se = find('students', sess.id), n = req.note || {}, nm = String(n.mat || '');
          if (asList(se.matieres).indexOf(nm) < 0) throw new Error('Choisis une de tes matières.');
          var v = parseFloat(String(n.val == null ? '' : n.val).replace(',', '.'));
          if (isNaN(v) || v < 0 || v > 20) throw new Error('La note doit être comprise entre 0 et 20.');
          var nd = /^\d{4}-\d{2}-\d{2}$/.test(String(n.date || '')) && n.date <= today() ? n.date : today();
          var su = suiviOf(se);
          if (su.notes.length >= 200) throw new Error('Nombre maximum de notes atteint.');
          su.notes.push({ id: 'n-' + st.uuid().replace(/-/g, '').slice(0, 8), mat: nm, val: Math.round(v * 100) / 100, date: nd, type: clean(n.type, 30) || 'Devoir', lib: clean(n.lib, 60), at: today() });
          se.suivi = JSON.stringify(su); st.upsert('students', se);
          return dataFor(sess);
        }
        case 'delNote': {
          need(sess, ['eleve']);
          var sd = find('students', sess.id), sud = suiviOf(sd);
          sud.notes = sud.notes.filter(function (x) { return x.id !== req.id; });
          sd.suivi = JSON.stringify(sud); st.upsert('students', sd);
          return dataFor(sess);
        }
        case 'comment': {
          need(sess, ['prof', 'admin']);
          var sc = find('students', req.studentId), cm = String(req.mat || '');
          if (!sc) throw new Error('Élève introuvable.');
          if (!teaches(sess, sc, cm)) throw new Error("Vous n'enseignez pas cette matière à cet élève.");
          var tx = clean(req.texte, 400); if (tx.length < 2) throw new Error('Écrivez le commentaire.');
          var suc = suiviOf(sc);
          suc.coms.push({ id: 'c-' + st.uuid().replace(/-/g, '').slice(0, 8), mat: cm, texte: tx, date: today(), par: sess.nom, role: sess.role });
          if (suc.coms.length > 50) suc.coms = suc.coms.slice(-50); // une cellule Google Sheet contient au plus 50 000 caractères
          sc.suivi = JSON.stringify(suc); st.upsert('students', sc);
          return dataFor(sess);
        }
        case 'addDoc': {
          need(sess, ['prof', 'admin']);
          if (!st.saveFile) throw new Error("Le serveur n'est pas à jour : collez le nouveau Code.gs puis déployez une nouvelle version.");
          var dc = req.doc || {}, f = req.file || {};
          var ti = clean(dc.titre, 90); if (ti.length < 3) throw new Error('Donnez un titre au document.');
          var ty = DOC_TYPES.indexOf(dc.type) >= 0 ? dc.type : DOC_TYPES[0];
          var cls = asList(dc.classes).filter(function (c) { return (cfg.classes || []).indexOf(c) >= 0; });
          if (!cls.length) throw new Error('Choisissez au moins une classe.');
          var mt2 = MATIERES.indexOf(dc.matiere) >= 0 ? dc.matiere : '';
          if (!mt2) throw new Error('Choisissez la matière.');
          if (sess.role === 'prof') {
            var meT = find('teachers', sess.id); if (!meT) throw new Error('Compte introuvable.');
            var ok = st.read('sessions').some(function (x) { return x.prof === meT.nom && x.matiere === mt2 && cls.some(function (c) { return asList(x.classes).indexOf(c) >= 0; }); });
            if (!ok && meT.matiere !== mt2) throw new Error("Vous ne pouvez publier que dans votre matière.");
          }
          var b64 = String(f.data || '').replace(/^data:[^,]*,/, '');
          if (!b64) throw new Error('Choisissez le fichier PDF.');
          if (b64.length > 11 * 1024 * 1024) throw new Error('Fichier trop lourd (8 Mo maximum).');
          if (b64.slice(0, 6) !== 'JVBERi') throw new Error('Le fichier doit être un PDF.');
          var nom = clean(f.name, 80).replace(/[\\/:*?"<>|]+/g, '-') || (ti + '.pdf'); if (!/\.pdf$/i.test(nom)) nom += '.pdf';
          var lim = /^\d{4}-\d{2}-\d{2}$/.test(String(dc.limite || '')) ? String(dc.limite) : '';
          var saved = st.saveFile(nom, b64, 'application/pdf');
          var rec2 = { id: 'doc-' + st.uuid().replace(/-/g, '').slice(0, 10), titre: ti, type: ty, matiere: mt2, classes: cls, date: today(),
            fichier: nom, fileId: saved.id, url: saved.url, taille: Math.round(b64.length * 0.75), par: sess.nom, parId: sess.id, note: clean(dc.note, 200),
            aRendre: ty === 'Devoir à rendre' ? 'oui' : '', limite: ty === 'Devoir à rendre' ? lim : '' };
          st.upsert('docs', rec2);
          return dataFor(sess);
        }
        case 'delDoc': {
          need(sess, ['prof', 'admin']);
          var dd = find('docs', req.id); if (!dd) throw new Error('Document introuvable.');
          if (sess.role !== 'admin' && dd.parId !== sess.id) throw new Error('Seul celui qui a publié ce document peut le retirer.');
          if (st.deleteFile && dd.fileId) { try { st.deleteFile(dd.fileId); } catch (e) { /* déjà supprimé */ } }
          st.remove('docs', dd.id);
          return dataFor(sess);
        }
        case 'rendre': {
          need(sess, ['eleve']);
          if (!st.saveFile) throw new Error("Le serveur n'est pas à jour.");
          var sr = find('students', sess.id); if (!sr || !isActive(sr)) throw new Error('Ton inscription doit être confirmée pour rendre un devoir.');
          var dv, ex = req.exo;
          if (ex) {
            // rédaction d'un exercice du cours en ligne, envoyée au prof de maths de la classe
            var xid = String(ex.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); if (!xid) throw new Error('Exercice inconnu.');
            if (asList(sr.matieres).indexOf('Maths') < 0) throw new Error("Tu n'es pas inscrit(e) en maths.");
            dv = { id: 'exo:' + sr.classe + ':' + xid, titre: ('Exercice en ligne · ' + clean(ex.titre, 90)).slice(0, 110), matiere: 'Maths', limite: '' };
            if (st.read('rendus').filter(function (x) { return x.studentId === sr.id && x.statut === 'rendu' && String(x.docId).indexOf('exo:') === 0; }).length >= 40)
              throw new Error("Tu as déjà 40 rédactions en attente de correction : attends que ton professeur en corrige quelques-unes.");
          } else {
            dv = find('docs', req.docId); if (!dv || dv.aRendre !== 'oui') throw new Error('Devoir introuvable.');
            if (asList(dv.classes).indexOf(sr.classe) < 0 || asList(sr.matieres).indexOf(dv.matiere) < 0) throw new Error("Ce devoir n'est pas pour ta classe.");
          }
          var txt = String(req.texte == null ? '' : req.texte).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 5000);
          var old = st.read('rendus').filter(function (x) { return x.docId === dv.id && x.studentId === sr.id; })[0];
          if (old && old.statut !== 'rendu') throw new Error('Ton devoir est déjà corrigé : tu ne peux plus le modifier.');
          var fl = Array.isArray(req.files) ? req.files : [];
          if (!fl.length && txt.length < 3) throw new Error(ex ? 'Écris ta rédaction ou ajoute une photo de ton cahier.' : 'Ajoute au moins une photo de ta copie.');
          if (fl.length > 8) throw new Error('8 photos au maximum.');
          var tot = 0, parts = fl.map(function (x) {
            var b = String((x && x.data) || '').replace(/^data:[^,]*,/, ''), mm = RENDU_MIME[b.slice(0, 5)] || RENDU_MIME[b.slice(0, 4)];
            if (!mm) throw new Error('Envoie des photos (JPG, PNG) ou un PDF.');
            tot += b.length; return { b: b, mm: mm };
          });
          if (tot > 14 * 1024 * 1024) throw new Error('Photos trop lourdes (10 Mo au total maximum).');
          var base = (sr.num + '-' + sr.prenom + '-' + sr.nom + '-' + dv.titre).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90);
          var files = parts.map(function (p, i) { var sv = st.saveFile(base + '-' + (i + 1) + p.mm[1], p.b, p.mm[0], 'rendus'); return { id: sv.id, url: sv.url, mime: p.mm[0] }; });
          if (old && st.deleteFile) { try { JSON.parse(old.fichiers || '[]').forEach(function (f) { try { st.deleteFile(f.id); } catch (e) { } }); } catch (e) { } }
          st.upsert('rendus', { id: old ? old.id : 'ren-' + st.uuid().replace(/-/g, '').slice(0, 10), docId: dv.id, studentId: sr.id, eleve: sr.prenom + ' ' + sr.nom, classe: sr.classe, matiere: dv.matiere,
            titre: dv.titre, date: today(), retard: dv.limite && today() > dv.limite ? 'oui' : '', fichiers: JSON.stringify(files), texte: txt, commentaire: clean(req.commentaire, 300),
            statut: 'rendu', note: '', appreciation: '', corrigePar: '', corrigeLe: '' });
          return dataFor(sess);
        }
        case 'corrigerRendu': {
          need(sess, ['prof', 'admin']);
          var rr = canRendu(sess, req.id);
          var nv = note(req.note), ap = clean(req.appreciation, 400);
          if (nv === '' && ap.length < 2) throw new Error('Mettez une note ou une appréciation.');
          rr.note = nv; rr.appreciation = ap; rr.statut = 'corrige'; rr.corrigePar = sess.nom; rr.corrigeLe = today();
          st.upsert('rendus', rr);
          return dataFor(sess);
        }
        case 'fichierRendu': {
          // les copies ne sont pas publiques sur Drive : on les envoie seulement à l'élève et à ses profs
          need(sess, ['eleve', 'prof', 'admin']);
          var rf = canRendu(sess, req.id), lf = JSON.parse(rf.fichiers || '[]'), ff = lf[+req.i || 0];
          if (!ff) throw new Error('Photo introuvable.');
          var fid = req.annot && ff.annot ? ff.annot : ff.id;
          return { data: st.readFile(fid), mime: req.annot && ff.annot ? 'image/jpeg' : ff.mime };
        }
        case 'annoterRendu': {
          need(sess, ['prof', 'admin']);
          var ra = canRendu(sess, req.id), la = JSON.parse(ra.fichiers || '[]'), ia = +req.i || 0;
          if (!la[ia]) throw new Error('Photo introuvable.');
          var ba = String(req.data || '').replace(/^data:[^,]*,/, '');
          if (ba.slice(0, 4) !== '/9j/') throw new Error('Image annotée invalide.');
          if (ba.length > 6 * 1024 * 1024) throw new Error('Image annotée trop lourde.');
          var sa = st.saveFile((ra.eleve + '-' + ra.titre).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + '-' + (ia + 1) + '-annote.jpg', ba, 'image/jpeg', 'rendus');
          if (la[ia].annot && st.deleteFile) { try { st.deleteFile(la[ia].annot); } catch (e) { } }
          la[ia].annot = sa.id; ra.fichiers = JSON.stringify(la);
          if (ra.statut !== 'corrige') { ra.statut = 'annote'; }
          st.upsert('rendus', ra);
          return dataFor(sess);
        }
        case 'delComment': {
          need(sess, ['prof', 'admin']);
          var sx = find('students', req.studentId); if (!sx) throw new Error('Élève introuvable.');
          var sux = suiviOf(sx);
          sux.coms = sux.coms.filter(function (x) { return x.id !== req.id || (sess.role !== 'admin' && x.par !== sess.nom); });
          sx.suivi = JSON.stringify(sux); st.upsert('students', sx);
          return dataFor(sess);
        }
      }

      /* ----- gestionnaires ----- */
      need(sess, ['admin']);
      switch (a) {
        case 'save': {
          if (KINDS.indexOf(req.kind) < 0) throw new Error('Table inconnue.');
          var item = req.item || {}; if (!item.id) throw new Error('Élément sans identifiant.');
          var newPwd = item._pwd; delete item._pwd; delete item.pwd; delete item.salt; delete item.hasPwd;
          var cur = find(req.kind, item.id) || {}, merged = {}, k;
          for (k in cur) merged[k] = cur[k];
          for (k in item) merged[k] = item[k];
          if (req.kind === 'students') { if (!merged.num) merged.num = nextNum(); if (!merged.createdAt) merged.createdAt = today(); }
          if (req.kind === 'teachers' && merged.login) {
            var dupL = st.read('teachers').some(function (x) { return x.id !== merged.id && x.login && String(x.login).toLowerCase() === String(merged.login).toLowerCase(); });
            if (dupL || String(merged.login).toLowerCase() === 'admin') throw new Error('Cet identifiant est déjà pris.');
          }
          if (req.kind === 'payments') {
            if (!merged.statut) merged.statut = 'valide';
            if (merged.statut === 'valide' && !merged.validePar) { merged.validePar = sess.nom; merged.valideLe = today(); }
            if (!merged.declarePar) merged.declarePar = 'admin';
          }
          if (newPwd) { if (String(newPwd).length < 4) throw new Error('Mot de passe trop court (4 caractères minimum).'); setPwd(merged, String(newPwd)); }
          st.upsert(req.kind, merged);
          if (req.kind === 'payments' && merged.statut === 'valide') onValidated(merged.studentId);
          return { saved: strip(req.kind, find(req.kind, merged.id)), data: dataFor(sess) };
        }
        case 'validatePay': {
          var pay = find('payments', req.id); if (!pay) throw new Error('Paiement introuvable.');
          pay.statut = req.ok ? 'valide' : 'rejete'; pay.validePar = sess.nom; pay.valideLe = today();
          if (req.ok && req.montant) pay.montant = Math.round(+req.montant) || pay.montant;
          st.upsert('payments', pay); if (req.ok) onValidated(pay.studentId);
          return { saved: pay, data: dataFor(sess) };
        }
        case 'remove':
          if (KINDS.indexOf(req.kind) < 0) throw new Error('Table inconnue.');
          st.remove(req.kind, req.id);
          if (req.kind === 'students') st.replace('payments', st.read('payments').filter(function (p) { return p.studentId !== req.id; }));
          return { data: dataFor(sess) };
        case 'bulk':
          if (KINDS.indexOf(req.kind) < 0) throw new Error('Table inconnue.');
          st.replace(req.kind, req.items || []); return { data: dataFor(sess) };
        case 'saveSettings': {
          var ns = req.settings || {}, os = settings() || {};
          if (!('debloques' in ns) && os.debloques) ns.debloques = os.debloques; // ne pas perdre les déblocages
          st.setSettings(ns); return { data: dataFor(sess) };
        }
        case 'unlockEval': {
          var cs = settings() || {}, list = Array.isArray(cs.debloques) ? cs.debloques.slice() : [], eid = String(req.id || '').slice(0, 40);
          if (!eid) throw new Error('Évaluation inconnue.');
          list = list.filter(function (x) { return x !== eid; }); if (req.on) list.push(eid);
          cs.debloques = list; st.setSettings(cs); return { data: dataFor(sess) };
        }
      }
      throw new Error('Action inconnue.');
    };
  }

  return { make: make, planInscription: planInscription, dueFor: dueFor, nextMonth: nextMonth, prevMonth: prevMonth, vacPrix: vacPrix, onVacList: onVacList, pubSettings: pubSettings, prix: prix, finance: finance, financeByMonth: financeByMonth, alerts: alerts, sha256: sha256, monthsRange: monthsRange,
    isActive: isActive, payOk: payOk, partsOf: partsOf, MATIERES: MATIERES, CATS: CATS, mk: mk, asList: asList, digits: digits };
})();
if (typeof module !== 'undefined') module.exports = SigmaCore;
