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
    return sum(mats, function (m) { return t.seules[m]; });
  }
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
    return { encaisse: encaisse, depenses: depenses, verse: sum(vers, function (e) { return e.montant; }), net: net, totalParts: totalParts, rows: rows,
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
    function nextNum() { return 'SC26-' + ('000' + st.nextCounter()).slice(-4); }
    function settings() { return st.getSettings(); }
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
          payments: d.payments, expenses: d.expenses, sheetUrl: st.sheetUrl ? st.sheetUrl() : '' };
      }
      if (sess.role === 'prof') {
        var me = d.teachers.filter(function (t) { return t.id === sess.id; })[0];
        if (!me) throw new Error('Compte introuvable.');
        var mine = d.sessions.filter(function (x) { return x.prof === me.nom; });
        var studs = d.students.filter(function (s) {
          return s.statut !== 'abandon' && mine.some(function (x) { return asList(x.classes).indexOf(s.classe) >= 0 && asList(s.matieres).indexOf(x.matiere) >= 0; });
        }).map(function (s) { return { id: s.id, num: s.num, prenom: s.prenom, nom: s.nom, classe: s.classe, etablissement: s.etablissement, notesMaths: s.notesMaths, notesPC: s.notesPC, notesSVT: s.notesSVT, matieres: s.matieres, statut: s.statut }; });
        return { role: 'prof', me: pubTeacher(me), settings: d.settings, sessions: d.sessions, teachers: d.teachers.map(pubTeacher), students: studs,
          finance: finance(d), byMonth: financeByMonth(d), alerts: alerts(d) };
      }
      var s = d.students.filter(function (x) { return x.id === sess.id; })[0];
      if (!s) throw new Error('Compte introuvable.');
      var meS = strip('students', s); delete meS.codeConf; delete meS.essais;
      return { role: 'eleve', me: meS, settings: d.settings, sessions: d.sessions.filter(function (x) { return asList(x.classes).indexOf(s.classe) >= 0; }),
        teachers: d.teachers.map(pubTeacher), payments: d.payments.filter(function (p) { return p.studentId === s.id; }) };
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
          return { settings: settings(), sessions: st.read('sessions'), teachers: st.read('teachers').map(pubTeacher) };

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
          var debut = mk(cfg.debut || today()), m0 = mk(today());
          rec.id = 'el-' + st.uuid().replace(/-/g, '').slice(0, 10); rec.num = nextNum(); rec.createdAt = today();
          rec.tarif = cfg.tarifs ? prix(rec.classe, rec.matieres, cfg.tarifs) : Math.max(0, Math.min(100000, +s.tarif || 0));
          rec.moisDebut = m0 > debut ? m0 : debut; rec.statut = 'attente'; rec.source = 'en_ligne'; rec.notes = ''; rec.codeConf = ''; rec.confirmeLe = ''; rec.essais = 0;
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
        case 'saveSettings': st.setSettings(req.settings); return { data: dataFor(sess) };
      }
      throw new Error('Action inconnue.');
    };
  }

  return { make: make, prix: prix, finance: finance, financeByMonth: financeByMonth, alerts: alerts, sha256: sha256, monthsRange: monthsRange,
    isActive: isActive, payOk: payOk, partsOf: partsOf, MATIERES: MATIERES, CATS: CATS, mk: mk, asList: asList, digits: digits };
})();
if (typeof module !== 'undefined') module.exports = SigmaCore;
