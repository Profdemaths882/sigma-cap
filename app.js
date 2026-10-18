/* Sigma Cap — application : page publique + espaces élève, prof et gestionnaire */
(function () {
  'use strict';

  const C = window.SigmaCore;
  const CFG = window.SIGMA_CONFIG || {};
  const DEF = window.SIGMA_DEFAULTS;
  const IMG = Object.assign({
    logo: 'img/logo-full.jpg', mark: 'img/mark.png', thiam: 'img/thiam.jpg', faye: 'img/faye.jpg', sene: 'img/sene.jpg', seneP: 'img/sene-p.jpg', thiamP: 'img/thiam-p.jpg', fayeP: 'img/faye-p.jpg', pdm: 'img/profdemaths.jpg'
  }, window.SIGMA_IMG || {});
  // Hébergé par Google Apps Script (un seul fichier) ou site séparé qui appelle l'URL /exec ; sinon mode démo
  const GAS = !!(window.google && google.script && google.script.run);
  const LIVE = GAS || !!(CFG.API_URL && /^https:\/\//.test(CFG.API_URL));
  const pubLink = () => window.SIGMA_URL || location.href.split('#')[0].split('?')[0];
  const DEMO_MASTER = 'sigma2026';

  const MATIERES = C.MATIERES;
  const MAT_LABEL = { Maths: 'Mathématiques', PC: 'Physique-Chimie', SVT: 'SVT' };
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MODES_ADMIN = ['Espèces', 'Wave', 'Orange Money', 'Free Money', 'Virement'];
  const MODES_ELEVE = ['Wave', 'Orange Money', 'Espèces'];
  // Parcours : inscription → paiement déclaré → validé par l'admin → code remis → l'élève saisit le code → confirmé
  const STATUTS = { attente: ['Paiement attendu', 'warn'], code: ['Payé · code à saisir', 'neutral'], actif: ['Confirmé', 'ok'], abandon: ['Abandon', 'bad'] };
  const PAY_ST = { valide: ['Validé', 'ok'], a_valider: ['À valider', 'warn'], rejete: ['Rejeté', 'bad'] };
  const PROF_STATUTS = { 'actif': 'ok', 'à confirmer': 'warn', 'poste à pourvoir': 'bad' };
  const isActive = C.isActive, payOk = C.payOk;

  /* ---------------- utilitaires ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fcfa = n => Math.round(+n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' F';
  const fcfaLong = n => fcfa(n) + 'CFA';
  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);
  const mk = C.mk;
  const monthLabel = k => { if (!k) return ''; const [y, m] = k.split('-'); return MOIS[+m - 1] + ' ' + y; };
  const dateLabel = d => { if (!d) return ''; const [y, m, j] = d.split('-'); return +j + ' ' + MOIS[+m - 1] + ' ' + y; };
  const dayName = d => { const t = new Date(d + 'T12:00:00Z'); return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][t.getUTCDay()]; };
  const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const hfmt = t => { const [h, m] = String(t).split(':'); return +h + 'h' + (m && m !== '00' ? m : ''); };
  const maxMonth = (a, b) => (a > b ? a : b);
  const monthsRange = C.monthsRange;
  const asList = C.asList;
  const digits = C.digits;
  const waNum = s => { let d = digits(s); if (d.length === 9) d = '221' + d; return d; };
  const fullName = s => ((s.prenom || '') + ' ' + (s.nom || '')).trim();
  const clone = o => JSON.parse(JSON.stringify(o));
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  /* Frais d'inscription : même montant que la mensualité, payés à l'entrée.
     Ils sont repérés par la mention « [Inscription] » au début de la note du paiement (colonne déjà présente côté serveur). */
  const INSC_TAG = '[Inscription]';
  const isInsc = p => p.type === 'inscription' || String(p.note || '').indexOf(INSC_TAG) === 0;
  const payNote = p => isInsc(p) ? String(p.note || '').slice(INSC_TAG.length).trim() : (p.note || '');
  const payLabel = p => isInsc(p) ? "Frais d'inscription" : monthLabel(p.mois);
  /* Messages (rappels / avertissements) de l'admin, rangés en JSON dans la colonne « avis » de l'élève */
  /* ---------- suivi des notes ---------- */
  const TYPES_NOTE = ['Devoir', 'Composition', 'Interrogation', 'Examen blanc', 'Autre'];
  const TEND = { hausse: '↗ En hausse', baisse: '↘ En baisse', stable: '→ Stable', debut: '• Première note' };
  const GROUPES = { A: ['Groupe A · Avancé', 'ok'], B: ['Groupe B · Intermédiaire', 'neutral'], C: ['Groupe C · Renforcement', 'bad'] };
  const suiviOf = s => { let o = null; try { o = s && s.suivi ? (typeof s.suivi === 'string' ? JSON.parse(s.suivi) : s.suivi) : null; } catch (_) { o = null; } o = o || {}; return { notes: Array.isArray(o.notes) ? o.notes : [], coms: Array.isArray(o.coms) ? o.coms : [] }; };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const n1 = x => x == null ? '—' : String(Math.round(x * 10) / 10).replace('.', ',');
  function serie(s, mat) {
    const pts = []; const init = s['notes' + mat];
    if (init !== '' && init != null && !isNaN(parseFloat(init))) pts.push({ id: 'init', val: parseFloat(init), date: s.createdAt || '', type: "Note d'entrée", lib: '' });
    suiviOf(s).notes.filter(n => n.mat === mat).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''))
      .forEach(n => pts.push(Object.assign({}, n, { val: +n.val })));
    return pts;
  }
  /* Groupe : moyenne des 3 dernières notes (A ≥ 14, B de 10 à 14, C < 10).
     Tendance : dernière note comparée à la moyenne des 3 précédentes (±1 point). */
  function analyse(pts) {
    if (!pts.length) return null;
    const vals = pts.map(p => p.val), L = vals.length, last = vals[L - 1];
    const recent = avg(vals.slice(-3)), moy = avg(vals);
    const prev = L > 1 ? avg(vals.slice(-4, -1)) : null;
    const delta = prev == null ? null : last - prev;
    const tend = delta == null ? 'debut' : delta >= 1 ? 'hausse' : delta <= -1 ? 'baisse' : 'stable';
    const groupe = recent >= 14 ? 'A' : recent >= 10 ? 'B' : 'C';
    const alertes = [];
    if (last < 10) alertes.push(['Sous la moyenne', 'bad']);
    if (delta != null && delta <= -2) alertes.push(['Forte baisse (' + n1(delta) + ' pt)', 'bad']);
    else if (L >= 3 && vals[L - 1] < vals[L - 2] && vals[L - 2] < vals[L - 3]) alertes.push(['2 baisses de suite', 'warn']);
    if (delta != null && delta >= 2) alertes.push(['Belle progression (+' + n1(delta) + ' pt)', 'ok']);
    const d = pts[L - 1].date, days = d ? Math.round((Date.parse(today()) - Date.parse(d)) / 864e5) : 0;
    if (days > 30) alertes.push(['Aucune note depuis ' + days + ' jours', 'warn']);
    let auto;
    if (tend === 'debut') auto = 'Première note enregistrée : ajoute les suivantes pour voir la progression.';
    else if (tend === 'hausse') auto = `En progrès : ${n1(last)}/20, soit ${n1(delta)} point(s) de plus que la moyenne des notes précédentes. Continue comme ça !`;
    else if (tend === 'baisse') auto = `En baisse : ${n1(last)}/20, soit ${n1(-delta)} point(s) de moins que les notes précédentes. Revoir les dernières leçons et poser ses questions au prof.`;
    else auto = `Résultats stables autour de ${n1(recent)}/20.`;
    if (last < 10 && tend !== 'hausse') auto += ' Objectif : repasser au-dessus de 10.';
    return { last, moy, recent, delta, tend, groupe, alertes, auto, nb: L };
  }
  function spark(pts, w = 120, h = 32) {
    if (pts.length < 2) return '';
    const xs = i => 3 + i * (w - 6) / (pts.length - 1), ys = v => h - 3 - v / 20 * (h - 6);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(p.val).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Évolution des notes"><line class="mid" x1="0" x2="${w}" y1="${ys(10).toFixed(1)}" y2="${ys(10).toFixed(1)}"/><path d="${d}"/>${pts.map((p, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(p.val).toFixed(1)}" r="2.4"/>`).join('')}</svg>`;
  }
  const numsHTML = (a, pts) => `<div class="nc-nums"><div><span class="l">Dernière note</span><b>${n1(a.last)}</b><small>/20</small></div><div><span class="l">Moyenne</span><b>${n1(a.moy)}</b><small>/20</small></div><div><span class="l">Tendance</span><b class="tend ${a.tend}">${TEND[a.tend]}</b></div>${spark(pts)}</div>`;
  const avisOf = s => { let a = s && s.avis; if (typeof a === 'string') { try { a = a ? JSON.parse(a) : []; } catch (_) { a = []; } } return Array.isArray(a) ? a : []; };
  const prix = C.prix;
  function formule(classe, mats, tarifs) {
    const t = tarifs && tarifs[classe]; mats = asList(mats);
    if (!mats.length) return '—';
    const key = a => a.slice().sort().join('+');
    if (t && t.pack && key(t.pack.matieres) === key(mats)) return 'Pack ' + t.pack.matieres.join(' + ');
    if (mats.length === 1) return mats[0] + ' seule';
    return mats.join(' + ') + ' (à la carte)';
  }
  const matsOf = classe => { const t = S.settings.tarifs[classe]; return t ? MATIERES.filter(m => t.seules[m] != null) : []; };
  const notesTxt = s => ['Maths', 'PC', 'SVT'].map(m => s['notes' + m] !== '' && s['notes' + m] != null ? `${m} ${String(s['notes' + m]).replace('.', ',')}` : '').filter(Boolean).join(' · ') || '—';

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copié'); } catch (_) { toast('Sélectionnez et copiez le texte'); }
      ta.remove();
    }
  }
  function downloadCSV(name, rows) {
    const csv = rows.map(r => r.map(c => { const v = String(c == null ? '' : c); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- état ---------------- */
  const S = {
    settings: clone(DEF.settings), sessions: clone(DEF.sessions), teachers: clone(DEF.teachers),
    students: [], payments: [], expenses: [], finance: null, byMonth: [], alerts: [],
    role: null, me: null, token: '', sheetUrl: '', updatedAt: null,
    tab: 'dash', ptab: 'finances', suiviFilter: { classe: '', mat: '' }, pubClass: '2nde S', payMonth: null, depMonth: null, finMonth: '',
    filter: { q: '', classe: '', statut: '' }, justRegistered: null
  };
  function mergeSettings(s) {
    const base = clone(DEF.settings);
    if (!s) return base;
    const out = Object.assign(base, s);
    out.tarifs = Object.assign(clone(DEF.settings.tarifs), s.tarifs || {});
    out.seuils = Object.assign(clone(DEF.settings.seuils), s.seuils || {});
    return out;
  }
  const normSession = s => Object.assign({}, s, { classes: asList(s.classes) });
  function normStudent(s) { const m = asList(s.matieres); return Object.assign({ matieres: [], statut: 'attente', source: 'en_ligne', notes: '' }, s, { matieres: m, tarif: +s.tarif || prix(s.classe, m, S.settings.tarifs) }); }
  const normPay = p => Object.assign({}, p, { montant: +p.montant || 0, statut: p.statut || 'valide' });
  function applyData(d) {
    if (!d) return;
    if ('settings' in d) S.settings = mergeSettings(d.settings);
    if (d.sessions && d.sessions.length) S.sessions = d.sessions.map(normSession);
    if (d.teachers && d.teachers.length) S.teachers = d.teachers;
    if (d.role) { S.role = d.role; S.me = d.me; }
    if (d.students) S.students = d.students.map(normStudent);
    if (d.payments) S.payments = d.payments.map(normPay);
    if (d.expenses) S.expenses = d.expenses.map(e => Object.assign({}, e, { montant: +e.montant || 0 }));
    if (d.finance) S.finance = d.finance;
    if (d.byMonth) S.byMonth = d.byMonth;
    if (d.alerts) S.alerts = d.alerts;
    if (d.sheetUrl) S.sheetUrl = d.sheetUrl;
    if (d.role === 'eleve' && d.me) S.me = normStudent(d.me);
    S.updatedAt = new Date();
  }

  /* ---------- mode démo : le « serveur » tourne dans ce navigateur ---------- */
  const DEMO_KEY = 'sigma-cap-demo-v2';
  let demoDB = null, demoHandle = null;
  function demoSeed() {
    const st = clone(DEF.settings);
    const hash = p => C.sha256('demo|' + p);
    const teachers = clone(DEF.teachers).map(t => Object.assign(t, { salt: 'demo', pwd: hash('sigma') }));
    const ex = [
      ['Aminata', 'Ndiaye', 'F', 'Terminale S2', ['Maths', 'PC', 'SVT'], 'actif', '14,5', '13', '15'],
      ['Moussa', 'Diallo', 'M', 'Terminale S1', ['Maths', 'PC'], 'actif', '12', '11,5', ''],
      ['Fatou', 'Sarr', 'F', '1ère S2', ['Maths'], 'actif', '9,5', '10', ''],
      ['Ibrahima', 'Fall', 'M', '2nde S', ['Maths', 'PC'], 'actif', '11', '12', ''],
      ['Awa', 'Ba', 'F', '1ère S1', ['Maths', 'PC'], 'code', '16', '14', ''],
      ['Cheikh', 'Gueye', 'M', '2nde S', ['PC'], 'attente', '10', '8,5', '']
    ];
    const students = ex.map((e, i) => ({
      id: 'ex-' + i, num: 'SC26-' + String(i + 1).padStart(4, '0'), createdAt: '2026-10-0' + (i + 1), prenom: e[0], nom: e[1], sexe: e[2], classe: e[3],
      etablissement: 'Lycée (exemple)', telEleve: '', parentNom: 'Parent de ' + e[0], telParent: '77 000 00 0' + i, matieres: e[4],
      notesMaths: e[6].replace(',', '.'), notesPC: e[7].replace(',', '.'), notesSVT: e[8].replace(',', '.'),
      tarif: prix(e[3], e[4], st.tarifs), moisDebut: '2026-10', statut: e[5], source: i % 2 ? 'manuel' : 'en_ligne', notes: 'Exemple — à supprimer', exemple: true,
      codeConf: e[5] === 'attente' ? '' : 'EX' + (4000 + i * 137), confirmeLe: e[5] === 'actif' ? '2026-10-1' + i : '', essais: 0, salt: 'demo', pwd: hash('1234')
    }));
    const pay = (i, id, montant, mode, date, statut, ref) => ({ id: 'exp-' + id, studentId: 'ex-' + i, mois: '2026-10', montant, mode, date, ref: ref || '', note: 'Exemple', statut, declarePar: statut === 'a_valider' ? 'eleve' : 'admin', validePar: statut === 'valide' ? 'M. Racine Thiam' : '', valideLe: statut === 'valide' ? date : '' });
    const payments = [pay(0, 0, students[0].tarif, 'Espèces', '2026-10-10', 'valide'), pay(1, 1, students[1].tarif, 'Wave', '2026-10-11', 'valide', 'WV-58213'),
      pay(2, 2, students[2].tarif, 'Espèces', '2026-10-12', 'valide'), pay(4, 4, students[4].tarif, 'Orange Money', '2026-10-12', 'valide', 'OM-77120'),
      pay(3, 9, 10000, 'Orange Money', '2026-10-11', 'valide', 'OM-11902'), pay(3, 10, 5000, 'Wave', '2026-10-12', 'a_valider', 'WV-60341')];
    return {
      settings: st, sessions: clone(DEF.sessions), teachers, students, payments,
      expenses: [{ id: 'exd-1', date: '2026-10-10', libelle: 'Photocopies fiches de rentrée (exemple)', categorie: 'Photocopies / fiches', montant: 7500, profId: '', note: '' }],
      counter: students.length, cache: {}
    };
  }
  function demoDb() {
    if (demoDB) return demoDB;
    try { demoDB = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { demoDB = null; }
    if (!demoDB) demoDB = demoSeed();
    return demoDB;
  }
  function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoDB)); } catch (e) { /* stockage indisponible : reste en mémoire */ } }
  function demoStore() {
    const db = demoDb();
    return {
      read: k => clone(db[k] || []),
      upsert(k, item) { const l = db[k]; const i = l.findIndex(x => x.id === item.id); if (i >= 0) l[i] = clone(item); else l.push(clone(item)); demoSave(); },
      remove(k, id) { db[k] = db[k].filter(x => x.id !== id); demoSave(); },
      replace(k, items) { db[k] = clone(items); demoSave(); },
      getSettings: () => (db.settings ? clone(db.settings) : null),
      setSettings(s) { db.settings = clone(s); demoSave(); },
      cacheGet: k => { const c = db.cache[k]; return c && c.exp > Date.now() ? c.v : null; },
      cachePut(k, v, ttl) { db.cache[k] = { v, exp: Date.now() + (ttl || 21600) * 1000 }; demoSave(); },
      cacheDel(k) { delete db.cache[k]; demoSave(); },
      nextCounter() { db.counter = (db.counter || 0) + 1; demoSave(); return db.counter; },
      today, uuid: () => Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-'),
      masterCode: DEMO_MASTER, sheetUrl: () => ''
    };
  }
  function demoCall(body) { if (!demoHandle) demoHandle = C.make(demoStore()); return demoHandle(body); }

  /* ---------- appel serveur ---------- */
  async function call(action, payload) {
    const body = Object.assign({ action, token: S.token }, payload || {});
    if (!LIVE) { await new Promise(r => setTimeout(r, 120)); return clone(demoCall(body)); }
    if (GAS) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(txt => { let j; try { j = JSON.parse(txt); } catch (e) { return reject(new Error('Réponse illisible du serveur.')); } j.ok ? resolve(j.data) : reject(new Error(j.error || 'Erreur serveur')); })
          .withFailureHandler(e => reject(new Error((e && e.message) || 'Pas de connexion au serveur. Vérifiez internet puis réessayez.')))
          .api(JSON.stringify(body));
      });
    }
    let res;
    try { res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('Pas de connexion au serveur. Vérifiez internet puis réessayez.'); }
    let j; try { j = await res.json(); } catch (e) { throw new Error('Réponse illisible du serveur.'); }
    if (!j.ok) throw new Error(j.error || 'Erreur serveur');
    return j.data;
  }
  async function mutate(action, payload, msg) {
    try {
      const r = await call(action, payload);
      if (r && r.data) applyData(r.data);
      if (msg) toast(msg);
      return r || {};
    } catch (x) { if (/Session expirée/.test(x.message)) return expired(); toast(x.message); return null; }
  }
  function expired() { logout(true); toast('Session expirée : reconnecte-toi.'); return null; }
  const SKEY = 'sigma-session';
  function keepSession() { try { localStorage.setItem(SKEY, S.token); } catch (_) { } }
  function logout(silent) {
    if (!silent && S.token) call('logout').catch(() => { });
    S.token = ''; S.role = null; S.me = null; S.students = []; S.payments = []; S.expenses = [];
    try { localStorage.removeItem(SKEY); } catch (_) { }
    closeModal(); location.hash = '#espace'; route();
  }

  /* ---------------- calculs ---------------- */
  const curMonth = () => mk(today());
  const startMonth = () => mk(S.settings.debut);
  const schoolMonths = () => monthsRange(startMonth(), S.settings.finMois || '2027-07');
  const paysOf = (sid, pays) => (pays || S.payments).filter(p => p.studentId === sid);
  const paidFor = (sid, mois, pays) => paysOf(sid, pays).filter(p => payOk(p) && !isInsc(p) && p.mois === mois).reduce((s, p) => s + p.montant, 0);
  const pendingFor = (sid, mois, pays) => paysOf(sid, pays).filter(p => p.statut === 'a_valider' && !isInsc(p) && p.mois === mois).reduce((s, p) => s + p.montant, 0);
  const inscPaid = (sid, pays) => paysOf(sid, pays).filter(p => payOk(p) && isInsc(p)).reduce((s, p) => s + p.montant, 0);
  const inscPending = (sid, pays) => paysOf(sid, pays).filter(p => p.statut === 'a_valider' && isInsc(p)).reduce((s, p) => s + p.montant, 0);
  /* Échéance : la mensualité du mois M se paie à la fin du mois, au plus tard le J du mois suivant (J = 5 par défaut, réglable).
     Montant du premier mois : voir C.planInscription (mois entier, moitié ou départ le mois suivant). */
  const limitDay = () => Math.min(28, Math.max(1, +S.settings.jourLimite || 5));
  const dueFor = C.dueFor;
  function deadline(st, mois) { return C.nextMonth(mois) + '-' + ('0' + limitDay()).slice(-2); }
  function dueMonths(st) {
    if (!isActive(st)) return [];
    const from = maxMonth(st.moisDebut || startMonth(), startMonth());
    const fin = S.settings.finMois || '2027-07';
    const last = C.prevMonth(curMonth()); // le mois en cours n'est pas encore dû : il se paie à la fin du mois
    return monthsRange(from, last < fin ? last : fin);
  }
  function balance(st, pays) {
    const months = dueMonths(st); const inscDu = st.statut === 'abandon' ? 0 : st.tarif;
    const du = months.reduce((x, m) => x + dueFor(st, m), 0);
    const paye = paysOf(st.id, pays).filter(p => payOk(p) && !isInsc(p)).reduce((s, p) => s + p.montant, 0);
    const t = today();
    return { du, paye, reste: Math.max(0, du - paye), inscReste: Math.max(0, inscDu - inscPaid(st.id, pays)),
      late: months.filter(m => t > deadline(st, m) && paidFor(st.id, m, pays) + pendingFor(st.id, m, pays) < dueFor(st, m)) };
  }
  function monthState(st, mois, pays) {
    const p = paidFor(st.id, mois, pays), q = pendingFor(st.id, mois, pays), d = dueFor(st, mois);
    if (p >= d && d > 0) return ['Payé', 'ok', p];
    if (q > 0) return ['En validation', 'warn', p];
    if (mois >= curMonth()) return [p > 0 ? 'Partiel · à venir' : 'À venir', 'neutral', p]; // mois pas encore terminé
    const lim = deadline(st, mois);
    if (today() > lim) return [p > 0 ? 'Partiel · en retard' : 'En retard', 'bad', p];
    return [(p > 0 ? 'Partiel · ' : '') + 'À payer avant le ' + dateLabel(lim), 'warn', p];
  }
  function inscState(st, pays) {
    const p = inscPaid(st.id, pays);
    if (p >= st.tarif && st.tarif > 0) return ['Payé', 'ok', p];
    if (inscPending(st.id, pays) > 0) return ['En validation', 'warn', p];
    return [p > 0 ? 'Partiel' : 'À payer à l\'entrée', 'bad', p];
  }
  function conflicts() {
    const out = []; const ss = S.sessions;
    for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) {
      const a = ss[i], b = ss[j]; if (a.jour !== b.jour) continue;
      if (!(mins(a.debut) < mins(b.fin) && mins(b.debut) < mins(a.fin))) continue;
      if (a.prof && a.prof === b.prof) out.push({ a, b, why: a.prof + ' a deux cours en même temps' });
      const common = a.classes.filter(c => b.classes.includes(c));
      if (common.length) out.push({ a, b, why: common.join(', ') + ' a deux cours en même temps' });
    }
    return out;
  }
  const hoursOf = nom => S.sessions.filter(s => s.prof === nom).reduce((h, s) => h + (mins(s.fin) - mins(s.debut)) / 60, 0);
  const finData = () => ({ payments: S.payments, expenses: S.expenses, teachers: S.teachers, students: S.students, settings: S.settings, sessions: S.sessions });

  /* =========================================================
     PAGE PUBLIQUE
     ========================================================= */
  /* ---------- partage : inviter des élèves (places limitées) ---------- */
  const shareLink = () => 'https://profdemaths882.github.io/sigma-cap/';
  const shareMsg = () => `🎓 Sigma Cap — Vers la réussite\nCours de renforcement Maths · PC · SVT au ${S.settings.lieu || 'CEM Kennedy'} (2nde S à Terminale S).\n⚠️ Les places sont limitées : inscris-toi vite en ligne 👇\n${shareLink()}`;
  const shareWa = () => 'https://wa.me/?text=' + encodeURIComponent(shareMsg());
  function shareModal() {
    const msg = shareMsg();
    openModal('Partager Sigma Cap', `<p>Invite tes camarades et leurs parents : <b>les places sont limitées</b> dans chaque classe.</p>
      <label class="f">Message <span class="h">modifiable avant l'envoi</span><textarea id="sh-txt" rows="6">${esc(msg)}</textarea></label>
      <div class="share-grid">
        <a class="btn go" id="sh-wa" target="_blank" rel="noopener" href="${shareWa()}">WhatsApp</a>
        <a class="btn" id="sh-fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink())}">Facebook</a>
        <a class="btn" id="sh-sms" href="sms:?&body=${encodeURIComponent(msg)}">SMS</a>
        ${navigator.share ? '<button type="button" class="btn" id="sh-native">Autres applis…</button>' : ''}
        <button type="button" class="btn" id="sh-copy">Copier le message</button>
      </div>`, `<button class="btn primary" data-act="close">Fermer</button>`);
    const sync = () => { const t = $('#sh-txt').value; $('#sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent(t); $('#sh-sms').href = 'sms:?&body=' + encodeURIComponent(t); };
    $('#sh-txt').addEventListener('input', sync);
    $('#sh-copy').addEventListener('click', () => copy($('#sh-txt').value));
    const nb = $('#sh-native'); if (nb) nb.addEventListener('click', async () => { try { await navigator.share({ title: 'Sigma Cap — Vers la réussite', text: $('#sh-txt').value.replace(shareLink(), '').trim(), url: shareLink() }); } catch (_) { } });
  }
  function payTabsHTML() {
    const tel = (S.settings.contacts[0] && S.settings.contacts[0].tel) || '';
    const qui = (S.settings.contacts || []).map(c => c.nom).join(' ou ');
    const k = S.payTab || 'wave';
    const LOGO = { wave: 'img/pay/wave.png', om: 'img/pay/orange-money.png', cash: 'img/pay/especes.svg' };
    const T = {
      wave: ['Wave', `Envoie le montant avec <b>Wave</b> au <b class="num">${esc(tel)}</b> (${esc((S.settings.contacts[0] || {}).nom || '')}). Garde le SMS : tu indiqueras sa <b>référence</b> en déclarant le paiement.`],
      om: ['Orange Money', `Envoie le montant avec <b>Orange Money</b> au <b class="num">${esc(tel)}</b> (${esc((S.settings.contacts[0] || {}).nom || '')}). Garde le SMS : tu indiqueras sa <b>référence</b> en déclarant le paiement.`],
      cash: ['Espèces', `Remets le montant en <b>espèces</b> à ${esc(qui)}. Demande ton reçu, puis déclare le paiement en choisissant « Espèces ».`]
    };
    return `<div class="paytabs"><div class="pt-head" role="tablist" aria-label="Moyen de paiement">${Object.entries(T).map(([key, [lab]]) => `<button type="button" role="tab" class="pt-${key}" data-act="paytab" data-v="${key}" aria-selected="${k === key}"><img src="${LOGO[key]}" alt=""><span>${lab}</span></button>`).join('')}</div>
      <div class="pt-body pt-${k}" role="tabpanel"><img class="pt-logo" src="${LOGO[k]}" alt="${T[k][0]}"><p>${T[k][1]}</p></div></div>`;
  }
  function renderPublic() {
    const st = S.settings;
    const thiam = S.teachers.find(t => t.id === 't-thiam') || { nom: 'M. Racine Thiam', tel: st.contacts[0] && st.contacts[0].tel };
    const faye = S.teachers.find(t => t.id === 't-faye') || { nom: 'M. Faye', tel: st.contacts[1] && st.contacts[1].tel };
    const sene = S.teachers.find(t => t.id === 't-sene') || { nom: 'M. Sène', tel: '' };
    const others = S.teachers.filter(t => !['t-thiam', 't-faye', 't-sene'].includes(t.id) && t.statut === 'actif');
    const byMat = MATIERES.map(m => [m, others.filter(t => t.matiere === m).map(t => t.nom)]).filter(x => x[1].length);
    const debutTxt = st.debut ? dayName(st.debut) + ' ' + dateLabel(st.debut) : 'à préciser';

    $('#app').innerHTML = `
    <header class="topbar"><div class="wrap">
      <a class="brand" href="#" data-scroll="top"><img class="mk" src="${IMG.mark}" alt=""><span><b>SIGMA CAP</b><small>Vers la réussite</small></span></a>
      <nav class="topnav" aria-label="Sections">
        <a class="opt" href="#" data-scroll="tarifs">Tarifs</a>
        <a class="opt" href="#" data-scroll="horaires">Horaires</a>
        <a class="opt" href="#" data-scroll="equipe">Équipe</a>
        <button type="button" class="btn sm share-ic" data-act="share" aria-label="Partager Sigma Cap"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span class="opt">Partager</span></button>
        <a class="btn sm" href="#espace">Mon espace</a>
        <a class="btn primary sm" href="#" data-scroll="inscription">S'inscrire</a>
      </nav>
    </div></header>

    <section class="hero" id="top"><div class="wrap hero-grid">
      <div class="hero-brand">
        <img class="hero-logo" src="${IMG.logo}" alt="Logo Sigma Cap — Vers la réussite">
        <p class="eyebrow">Cours de renforcement · ${esc(st.annee)} · En présentiel</p>
      </div>
      <div class="duo" aria-label="Les fondateurs">
        <figure><img src="${IMG.thiamP}" alt="Photo de ${esc(thiam.nom)}"><figcaption>${esc(thiam.nom)}<span>Professeur de mathématiques</span></figcaption></figure>
        <figure><img src="${IMG.fayeP}" alt="Photo de ${esc(faye.nom)}"><figcaption>${esc(faye.nom)}<span>Professeur de mathématiques</span></figcaption></figure>
        <figure><img src="${IMG.seneP}" alt="Photo de ${esc(sene.nom)}"><figcaption>${esc(sene.nom)}<span>Professeur de physique-chimie</span></figcaption></figure>
        <div class="medal"><strong>${esc(st.resultats.titre)}</strong><span>${st.resultats.details.map(esc).join(' · ')} · Bac ${esc(st.resultats.annee.split('-')[1] || '')}</span></div>
      </div>
      <div class="hero-text">
        <h1>Des bases solides pour <em>réussir</em> le Bac.</h1>
        <p class="lead">Mathématiques, Physique-Chimie et SVT, de la Seconde S à la Terminale. Groupes en effectif réduit, fiches et évaluations régulières.</p>
        <div class="cta">
          <a class="btn go" href="#" data-scroll="inscription">${st.inscriptionsOuvertes ? "S'inscrire en ligne" : 'Inscriptions fermées'}</a>
          <a class="btn line" href="#espace">Mon espace</a>
        </div>
        <dl class="facts">
          <div><dt>Début des cours</dt><dd>${esc(debutTxt)}</dd></div>
          <div><dt>Lieu</dt><dd>${esc(st.lieu)}</dd></div>
          <div><dt>Jours</dt><dd>${esc(st.jours)}</dd></div>
        </dl>
      </div>
    </div></section>

    <section class="blk" id="tarifs"><div class="wrap">
      <div class="blk-head"><div><p class="eyebrow">Grille tarifaire</p><h2 style="margin-top:8px">Tarifs mensuels</h2><p>Choisissez votre classe. Le pack regroupe toutes les matières de la classe à prix réduit.</p></div>
        <div class="seg" role="group" aria-label="Classe">${st.classes.map(c => `<button type="button" data-act="pubclass" data-v="${esc(c)}" aria-pressed="${c === S.pubClass}">${esc(c)}</button>`).join('')}</div>
      </div>
      <div class="prices">${priceCards(S.pubClass)}</div>
    </div></section>

    <section class="blk" id="horaires"><div class="wrap">
      <div class="blk-head"><div><p class="eyebrow">Emploi du temps</p><h2 style="margin-top:8px">Horaires · ${esc(S.pubClass)}</h2><p>Trois jours par semaine. Les classes de Première et de Terminale sont regroupées pour certains cours.</p></div></div>
      <div class="week">${weekHTML(S.sessions.filter(s => s.classes.includes(S.pubClass)), false)}</div>
    </div></section>

    <section class="blk" id="equipe"><div class="wrap">
      <div class="blk-head"><div><p class="eyebrow">L'équipe</p><h2 style="margin-top:8px">Vos professeurs</h2></div></div>
      <div class="team">
        <article class="person"><img src="${IMG.thiam}" alt="Photo de ${esc(thiam.nom)}"><div><h3>${esc(thiam.nom)}</h3><p class="role">Professeur de mathématiques · fondateur de ProfDeMaths 2.0</p><p class="tel">${esc(thiam.tel)}</p></div></article>
        <article class="person"><img src="${IMG.faye}" alt="Photo de ${esc(faye.nom)}"><div><h3>${esc(faye.nom)}</h3><p class="role">Professeur de mathématiques · Lycée Kennedy</p><p class="tel">${esc(faye.tel)}</p></div></article>
        <article class="person"><img src="${IMG.sene}" alt="Photo de ${esc(sene.nom)}"><div><h3>${esc(sene.nom)}</h3><p class="role">Professeur de physique-chimie · Cours privé Machallah, Yalla Surren</p>${sene.tel ? `<p class="tel">${esc(sene.tel)}</p>` : ''}</div></article>
      </div>
      ${byMat.length ? `<div class="others">${byMat.map(([m, ns]) => `<span><b>${MAT_LABEL[m]} :</b> ${ns.map(esc).join(', ')}</span>`).join('')}</div>` : ''}
    </div></section>

    <section class="blk" id="inscription"><div class="wrap" style="max-width:780px">
      <div class="blk-head"><div><p class="eyebrow">Inscription en ligne</p><h2 style="margin-top:8px">Inscris-toi en 3 étapes</h2></div></div>
      <ol class="steps">
        <li><div><b>Inscris-toi en ligne</b><p>Remplis le formulaire et crée ton mot de passe : tu obtiens ton espace élève et ton N° d'inscription.</p></div></li>
        <li><div><b>Paie les frais d'inscription</b><p>Même montant que ta mensualité. Choisis ton moyen de paiement ci-dessous, puis déclare le paiement dans ton espace.</p></div></li>
        <li><div><b>Saisis ton code de confirmation</b><p>Après validation de ton paiement, l'admin te remet un code : saisis-le dans ton espace et ta place est réservée.</p></div></li>
      </ol>
      ${payTabsHTML()}
      <p class="small muted" style="margin:-8px 0 22px">Ensuite, chaque mensualité se paie à la fin du mois, au plus tard le ${limitDay()} du mois suivant. Pour octobre : inscrit avant le 15, tu paies le mois entier ; du 15 au 20, la moitié ; après le 20, tu commences en novembre.</p>
      <div id="reg-zone">${st.inscriptionsOuvertes ? regFormHTML() : '<div class="infobox">Les inscriptions en ligne sont fermées pour le moment. Contactez-nous par téléphone.</div>'}</div>
      <div class="infobox" style="margin-top:18px">Déjà inscrit ? <a href="#espace"><b>Connecte-toi à ton espace</b></a>. Une question ? Appelez ${st.contacts.map(c => `<b>${esc(c.nom)}</b> au <b class="num">${esc(c.tel)}</b>`).join(' ou ')}.</div>
    </div></section>

    <section class="blk" id="partager"><div class="wrap">
      <div class="qr-share">
        <img src="img/qrcode.png" alt="QR code du site Sigma Cap" width="220" height="220">
        <div>
          <p class="eyebrow">Partager Sigma Cap</p>
          <h2 style="margin-top:8px">Invite tes camarades : les places sont limitées</h2>
          <p>Envoie le lien à un camarade ou à un parent, ou montre-lui ce QR code : il ouvre directement cette page sur son téléphone.</p>
          <p class="small muted num">profdemaths882.github.io/sigma-cap</p>
          <div class="share-row">
            <a class="btn go" target="_blank" rel="noopener" href="${shareWa()}">Partager sur WhatsApp</a>
            <button type="button" class="btn" data-act="share"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg> Autres partages</button>
            <a href="img/qrcode-affiche.png" download="QR-code-Sigma-Cap.png" class="btn sm ghost">Télécharger le QR code</a>
          </div>
        </div>
      </div>
    </div></section>

    <footer class="site"><div class="wrap">
      <div class="pdm"><img src="${IMG.pdm}" alt="Logo ProfDeMaths 2.0"><span>Sigma Cap — Vers la réussite · ${esc(st.lieu)}<br><span class="small">Ensemble vers l'excellence</span></span></div>
      <a href="#espace" class="btn sm ghost">Espace élèves, profs et gestion</a>
    </div></footer>`;
    if (st.inscriptionsOuvertes) bindRegForm();
  }

  function priceCards(classe) {
    const t = S.settings.tarifs[classe]; if (!t) return '';
    const cards = [];
    if (t.pack) {
      const sum = t.pack.matieres.reduce((s, m) => s + (+t.seules[m] || 0), 0);
      const save = sum - t.pack.prix;
      cards.push(`<div class="price best"><span class="pill ok tag">Pack · ${save > 0 ? fcfa(save) + ' économisés' : 'toutes les matières'}</span><h3>${t.pack.matieres.map(m => MAT_LABEL[m]).join(' + ')}</h3><div class="amt">${fcfa(t.pack.prix)}<small>CFA / mois</small></div></div>`);
    }
    MATIERES.filter(m => t.seules[m] != null).forEach(m => cards.push(`<div class="price"><span class="pill ${m} tag">${m}</span><h3>${MAT_LABEL[m]} seule</h3><div class="amt">${fcfa(t.seules[m])}<small>CFA / mois</small></div></div>`));
    return cards.join('');
  }

  function weekHTML(sessions, editable, highlight) {
    const days = JOURS.filter(j => ['Mercredi', 'Vendredi', 'Samedi'].includes(j) || sessions.some(s => s.jour === j));
    return days.map(j => {
      const list = sessions.filter(s => s.jour === j).sort((a, b) => mins(a.debut) - mins(b.debut) || a.matiere.localeCompare(b.matiere));
      return `<div class="day"><h3>${j}</h3><ul>${list.length ? list.map(s => `
        <li class="slot ${esc(s.matiere)}${highlight && s.prof === highlight ? ' mine' : ''}">
          <span class="t">${hfmt(s.debut)} – ${hfmt(s.fin)}</span>
          <span class="m">${MAT_LABEL[s.matiere] || esc(s.matiere)} · ${s.classes.map(esc).join(' + ')}</span>
          <span class="p">${esc(s.prof || 'Prof à désigner')}${s.salle ? ' · ' + esc(s.salle) : ''}</span>
          ${editable ? `<span class="row-actions" style="justify-content:flex-start;margin-top:4px"><button class="btn sm" data-act="edit-session" data-id="${esc(s.id)}">Modifier</button></span>` : ''}
        </li>`).join('') : '<li class="empty">Pas de cours</li>'}</ul></div>`;
    }).join('');
  }

  function regFormHTML() {
    return `<form class="form-card" id="reg" novalidate>
      <fieldset><legend>Qui remplit ce formulaire ?</legend>
        <div class="chips"><label class="chk"><input type="radio" name="who" value="eleve" checked> Je suis l'élève</label><label class="chk"><input type="radio" name="who" value="parent"> Je suis le parent ou tuteur</label></div>
      </fieldset>
      <fieldset><legend>L'élève</legend>
        <div class="grid2">
          <label class="f">Prénom<input id="r-prenom" autocomplete="given-name"></label>
          <label class="f">Nom<input id="r-nom" autocomplete="family-name"></label>
          <p class="vacnote" id="r-vac1" hidden style="grid-column:1/-1"></p>
          <label class="f">Sexe<select id="r-sexe"><option value="F">Fille</option><option value="M">Garçon</option></select></label>
          <label class="f">Classe<select id="r-classe"><option value="">Choisir…</option>${S.settings.classes.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="f">École d'origine<input id="r-etab" placeholder="Ex. Lycée Kennedy"></label>
          <label class="f">Téléphone de l'élève <span class="h">facultatif · peut servir d'identifiant</span><input id="r-tel" inputmode="tel" placeholder="77 000 00 00"></label>
        </div>
      </fieldset>
      <fieldset><legend>Mes dernières notes <span class="h" style="font:400 .85rem var(--body);color:var(--muted)">moyenne du dernier trimestre ou semestre, sur 20</span></legend>
        <div class="grid3">
          <label class="f">Maths<input id="r-nM" inputmode="decimal" placeholder="12,5"></label>
          <label class="f">Physique-Chimie<input id="r-nP" inputmode="decimal" placeholder="11"></label>
          <label class="f">SVT <span class="h">si suivie</span><input id="r-nS" inputmode="decimal" placeholder="—"></label>
        </div>
      </fieldset>
      <fieldset><legend id="r-leg-par">Le parent ou tuteur</legend>
        <div class="grid2">
          <label class="f">Nom du parent<input id="r-pnom"></label>
          <label class="f">Téléphone du parent<input id="r-ptel" inputmode="tel" placeholder="77 000 00 00"></label>
        </div>
      </fieldset>
      <fieldset><legend>La formule</legend>
        <div class="chips" id="r-mats"><span class="muted">Choisis d'abord ta classe.</span></div>
        <div class="quote"><span id="r-form" class="muted">Aucune matière choisie</span><span class="amt" id="r-prix">0 F</span></div>
        <p class="vacnote" id="r-vac" hidden></p>
      </fieldset>
      <fieldset><legend id="r-leg-sp">Mon espace élève</legend>
        <div class="grid2">
          <label class="f">Mot de passe <span class="h">4 caractères minimum</span><input id="r-pw" type="password" autocomplete="new-password"></label>
          <label class="f">Confirmer le mot de passe<input id="r-pw2" type="password" autocomplete="new-password"></label>
        </div>
        <p class="small muted" id="r-sp-help">Pour te connecter : ton N° d'inscription (donné juste après) ou ton téléphone, avec ce mot de passe.</p>
      </fieldset>
      <div class="hp" aria-hidden="true"><label>Ne pas remplir<input id="r-site" tabindex="-1" autocomplete="off"></label></div>
      <label class="chk" style="border-radius:10px;align-items:flex-start"><input type="checkbox" id="r-ok"> <span style="font-weight:500">J'accepte que Sigma Cap utilise ces informations pour gérer l'inscription et contacter la famille.</span></label>
      <p class="err" id="r-err" hidden></p>
      <div><button class="btn go" type="submit" id="r-send" style="padding:1rem 1.4rem;font-size:1.02rem">Créer mon inscription</button></div>
    </form>`;
  }
  function bindRegForm() {
    const f = $('#reg'); if (!f) return;
    const upd = () => {
      const par = (f.querySelector('input[name=who]:checked') || {}).value === 'parent';
      $('#r-leg-par').textContent = par ? 'Vous, le parent ou tuteur' : 'Le parent ou tuteur';
      $('#r-leg-sp').textContent = par ? 'Votre espace de suivi' : 'Mon espace élève';
      $('#r-sp-help').textContent = par ? "Pour vous connecter : le N° d'inscription de l'enfant ou votre téléphone, avec ce mot de passe. Pour plusieurs enfants, utilisez le N° de chacun." : "Pour te connecter : ton N° d'inscription (donné juste après) ou ton téléphone, avec ce mot de passe.";
      const c = $('#r-classe').value; const box = $('#r-mats');
      const prev = $$('input[name=mat]:checked', box).map(i => i.value);
      if (box.dataset.cls !== c) {
        box.dataset.cls = c;
        const ms = c ? matsOf(c) : [];
        const pack = c && S.settings.tarifs[c].pack ? S.settings.tarifs[c].pack.matieres : ms;
        box.innerHTML = ms.length ? ms.map(m => `<label class="chk"><input type="checkbox" name="mat" value="${m}" ${(prev.length ? prev.includes(m) : pack.includes(m)) ? 'checked' : ''}> ${MAT_LABEL[m]}</label>`).join('') : '<span class="muted">Choisis d\'abord ta classe.</span>';
      }
      const mats = $$('input[name=mat]:checked', box).map(i => i.value);
      const vp = vac.eligible && vac.key === vacKey() ? vac.prix : 0, normal = prix(c, mats, S.settings.tarifs);
      $('#r-prix').innerHTML = vp && vp < normal ? `<s class="muted" style="font-size:.6em">${fcfa(normal)}</s> ${fcfa(vp)}CFA / mois` : fcfa(normal) + 'CFA / mois';
      $('#r-form').textContent = mats.length ? formule(c, mats, S.settings.tarifs) + (vp ? ' · tarif cours de vacances' : '') : 'Aucune matière choisie';
      const msg = vac.eligible && vac.key === vacKey() ? (vp && vp < normal
        ? `🎉 ${esc(v1('#r-prenom'))}, tu as suivi nos cours de vacances : tu bénéficies d'une réduction. Ta mensualité passe de <b>${fcfa(normal)}</b> à <b>${fcfa(vp)}</b>.`
        : `🎉 ${esc(v1('#r-prenom'))}, tu as suivi nos cours de vacances : tu as droit au tarif réduit${c ? ' (choisis le pack de ta classe pour en profiter)' : ' (choisis ta classe pour voir le montant)'}.`) : '';
      ['#r-vac1', '#r-vac'].forEach(id => { $(id).innerHTML = msg; $(id).hidden = !msg; });
    };
    // Réduction « cours de vacances » : le serveur dit si le nom tapé est sur la liste (la liste n'est jamais envoyée au navigateur)
    const v1 = id => $(id).value.trim();
    const vacKey = () => [v1('#r-prenom'), v1('#r-nom'), $('#r-classe').value, $$('input[name=mat]:checked', f).map(i => i.value).join('+')].join('|').toLowerCase();
    const vac = { key: '', eligible: false, prix: 0 }; let vacT = null;
    const checkVac = () => {
      clearTimeout(vacT);
      vacT = setTimeout(async () => {
        if (!f.isConnected) return; // la page a changé entre-temps
        const k = vacKey(); if (k === vac.key) return;
        if (v1('#r-prenom').length < 2 || v1('#r-nom').length < 2) { Object.assign(vac, { key: k, eligible: false, prix: 0 }); upd(); return; }
        try { const r = await call('checkVac', { prenom: v1('#r-prenom'), nom: v1('#r-nom'), classe: $('#r-classe').value, matieres: $$('input[name=mat]:checked', f).map(i => i.value) }); if (f.isConnected && k === vacKey()) { Object.assign(vac, { key: k, eligible: !!(r && r.eligible), prix: (r && r.prix) || 0 }); upd(); } }
        catch (_) { /* serveur ancien ou hors ligne : pas de message */ }
      }, 450);
    };
    f.addEventListener('change', () => { upd(); checkVac(); }); upd();
    ['#r-prenom', '#r-nom'].forEach(id => $(id).addEventListener('input', checkVac));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('#r-err'); err.hidden = true;
      const v = id => $(id).value.trim();
      const mats = $$('input[name=mat]:checked', f).map(i => i.value);
      const s = { prenom: v('#r-prenom'), nom: v('#r-nom'), sexe: v('#r-sexe'), classe: v('#r-classe'), etablissement: v('#r-etab'), telEleve: v('#r-tel'), parentNom: v('#r-pnom'), telParent: v('#r-ptel'),
        matieres: mats, notesMaths: v('#r-nM'), notesPC: v('#r-nP'), notesSVT: v('#r-nS'), tarif: prix(v('#r-classe'), mats, S.settings.tarifs),
        inscritPar: (f.querySelector('input[name=who]:checked') || {}).value === 'parent' ? 'parent' : 'eleve' };
      const pb = [];
      if (!s.prenom || !s.nom) pb.push('le prénom et le nom');
      if (!s.classe) pb.push('la classe');
      if (!s.etablissement) pb.push("l'école d'origine");
      if (!mats.length) pb.push('au moins une matière');
      if (digits(s.telParent).length < 9) pb.push('un numéro de parent valide (9 chiffres)');
      if (v('#r-pw').length < 4) pb.push('un mot de passe de 4 caractères minimum');
      else if (v('#r-pw') !== v('#r-pw2')) pb.push('deux mots de passe identiques');
      if (!$('#r-ok').checked) pb.push("l'accord en bas du formulaire");
      if (pb.length) { err.textContent = 'Il manque ' + pb.join(', ') + '.'; err.hidden = false; return; }
      if ($('#r-site').value) return; // robot
      const btn = $('#r-send'); btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        const r = await call('register', { student: s, password: v('#r-pw') });
        S.token = r.token; keepSession(); applyData(r.data); S.justRegistered = r.num;
        try { history.pushState(null, '', '#espace'); } catch (_) { location.hash = '#espace'; }
        route(); window.scrollTo(0, 0);
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Créer mon inscription'; }
    });
  }

  /* =========================================================
     CONNEXION
     ========================================================= */
  function renderLogin(msg) {
    $('#app').innerHTML = `<div class="login"><form class="panel" id="login" novalidate>
      <img class="mk" src="${IMG.mark}" alt="">
      <div style="text-align:center"><h2 style="font-size:1.5rem">Mon espace Sigma Cap</h2><p class="muted small" style="margin-top:6px">Élèves, professeurs et gestionnaires</p></div>
      <label class="f">Identifiant<input id="l-id" autocomplete="username" autocapitalize="none" placeholder="N° SC26-…, téléphone ou identifiant"></label>
      <label class="f">Mot de passe<input id="l-pw" type="password" autocomplete="current-password"></label>
      <p class="small muted">Élève ou parent : N° d'inscription, téléphone de l'élève ou téléphone du parent. Prof ou gestionnaire : identifiant (ex. thiam). Mot de passe oublié : le gestionnaire peut le réinitialiser.</p>
      ${LIVE ? '' : `<div class="infobox small"><b>Démo</b> · élève ou parent : <b>SC26-0001</b> ou <b>77 000 00 00</b> / <b>1234</b> · prof : <b>sene</b> / <b>sigma</b> · admin : <b>thiam</b> / <b>sigma</b> (ou <b>admin</b> / <b>${DEMO_MASTER}</b>)</div>`}
      <p class="err" id="l-err" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
      <button class="btn primary" type="submit" style="justify-content:center">Se connecter</button>
      <a href="#" class="btn ghost sm" style="justify-content:center" data-act="to-public">Retour à l'accueil</a>
    </form></div>`;
    $('#login').addEventListener('submit', async e => {
      e.preventDefault();
      let login = $('#l-id').value.trim(); const password = $('#l-pw').value;
      // N° d'inscription tapé avec espaces, sans tiret ou en minuscules (ex. « sc26 0007 ») → « SC26-0007 »
      const mNum = login.replace(/[\s\-_.]/g, '').match(/^sc26(\d{1,4})$/i);
      if (mNum) login = 'SC26-' + mNum[1].padStart(4, '0');
      if (!login || !password) { renderLogin('Saisis ton identifiant et ton mot de passe.'); return; }
      const b = $('#login button[type=submit]'); b.disabled = true; b.textContent = 'Connexion…';
      try {
        const r = await call('login', { login, password });
        S.token = r.token; keepSession(); applyData(r.data);
        if (S.role === 'admin') await ensureInit(r.data);
        S.tab = 'dash'; S.ptab = 'finances'; route(); window.scrollTo(0, 0);
      } catch (x) { renderLogin(x.message); }
    });
  }
  async function ensureInit(d) {
    // Première connexion sur un Google Sheet vide : on y dépose l'emploi du temps, les profs et les tarifs de départ.
    let did = false;
    if (!d.settings) { await mutate('saveSettings', { settings: S.settings }); did = true; }
    if (!d.sessions || !d.sessions.length) { await mutate('bulk', { kind: 'sessions', items: clone(DEF.sessions) }); did = true; }
    if (!d.teachers || !d.teachers.length) { await mutate('bulk', { kind: 'teachers', items: clone(DEF.teachers) }); did = true; }
    if (did) toast("Base initialisée : tarifs, emploi du temps et profs. Pensez à donner un mot de passe à chaque prof.");
  }

  function spaceTop(title, sub) {
    return `<header class="admin-top"><div class="wrap">
      <a class="brand" href="#" data-act="to-public"><img class="mk" src="${IMG.mark}" alt=""><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></a>
      <div class="sp">${LIVE ? '' : '<span class="mode">Démo</span>'}<button class="btn sm" data-act="refresh">Actualiser</button>${S.me && S.me.id !== 'master' ? '<button class="btn sm" data-act="pwd">Mot de passe</button>' : ''}<button class="btn sm" data-act="logout">Quitter</button></div>
    </div></header>`;
  }
  const updatedTxt = () => S.updatedAt ? 'Mis à jour à ' + S.updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  /* =========================================================
     ESPACE ÉLÈVE
     ========================================================= */
  function renderEleve() {
    const me = S.me; const st = S.settings;
    const months = monthsRange(maxMonth(me.moisDebut || startMonth(), startMonth()), st.finMois || '2027-07');
    const [sl, sc] = STATUTS[me.statut] || ['?', 'neutral'];
    const hist = S.payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const bal = balance(Object.assign({}, me, { statut: isActive(me) ? me.statut : 'actif' }));
    // messages de l'admin + alertes de paiement automatiques
    const avisHTML = avisOf(me).slice().reverse().slice(0, 3).map(a => `<div class="panel callout ${a.type === 'avertissement' ? 'bad' : 'warn'}"><h3>${a.type === 'avertissement' ? '⚠ Avertissement' : '🔔 Rappel'} de Sigma Cap <span class="small muted" style="font-weight:500">· ${esc(dateLabel(a.date))}</span></h3><p>${esc(a.texte).replace(/\n/g, '<br>')}</p></div>`).join('');
    let alertes = '';
    if (isActive(me)) {
      const cm = curMonth(), pm = C.prevMonth(cm);
      if (bal.late.length) alertes += `<div class="panel callout bad"><h3>⚠ Retard de paiement</h3><p>${bal.late.map(m => `La mensualité de <b>${monthLabel(m)}</b> devait être payée au plus tard le <b>${dateLabel(deadline(me, m))}</b>.`).join('<br>')}</p><p>Reste à payer : <b>${fcfaLong(bal.reste)}</b>. Règle au plus vite, puis déclare ton paiement.</p><div><button class="btn primary" data-act="declare">Déclarer un paiement</button></div></div>`;
      else if (months.includes(pm) && today() <= deadline(me, pm) && paidFor(me.id, pm) + pendingFor(me.id, pm) < dueFor(me, pm)) alertes += `<div class="panel callout"><h3>Mensualité de ${monthLabel(pm)}</h3><p>Le mois est terminé : à payer au plus tard le <b>${dateLabel(deadline(me, pm))}</b> : ${fcfaLong(dueFor(me, pm) - paidFor(me.id, pm))}${me.moitie === 'oui' && pm === me.moisDebut ? ' (moitié du mois)' : ''}.</p><div><button class="btn sm primary" data-act="declare">Déclarer un paiement</button></div></div>`;
      if (bal.inscReste > 0 && !inscPending(me.id)) alertes += `<div class="panel callout warn"><h3>Frais d'inscription</h3><p>Il reste <b>${fcfaLong(bal.inscReste)}</b> à régler pour tes frais d'inscription.</p></div>`;
    }
    let action = '';
    if (me.statut === 'attente') action = inscPending(me.id) ? `<div class="panel callout warn"><h3>Étape 2 · Frais d'inscription déclarés</h3><p>Ta déclaration est en attente de validation par l'admin. Il te remettra ensuite ton code de confirmation.</p></div>`
      : `<div class="panel callout warn"><h3>Étape 2 · Paie tes frais d'inscription</h3><p>Montant : <b>${fcfaLong(me.tarif)}</b> (le même montant que ta mensualité). ${esc(st.paiement)}</p><p>Ta première mensualité : <b>${monthLabel(me.moisDebut)}</b>, ${fcfaLong(dueFor(me, me.moisDebut))}${me.moitie === 'oui' ? ' (moitié du mois)' : ''}, à payer au plus tard le <b>${dateLabel(deadline(me, me.moisDebut))}</b>.</p><p>Ensuite, clique sur « Déclarer un paiement », choisis « Frais d'inscription » et indique la référence reçue par SMS. L'admin valide, puis te remet ton code de confirmation.</p><div><button class="btn primary" data-act="declare">Déclarer un paiement</button></div></div>`;
    else if (me.statut === 'code') action = `<form class="panel callout" id="cf" novalidate><h3>Étape 3 · Saisis ton code de confirmation</h3><p>Ton paiement est validé. Saisis le code que l'admin t'a remis (6 caractères).</p>
        <div class="toolbar"><input id="cf-code" class="grow" maxlength="8" autocapitalize="characters" autocomplete="one-time-code" placeholder="Ex. K7P4QM" style="letter-spacing:.15em;font-weight:700;text-transform:uppercase"><button class="btn primary" type="submit">Confirmer</button></div><p class="err" id="cf-err" hidden></p></form>`;
    else if (me.statut === 'actif') action = `<div class="panel callout ok"><h3>Inscription confirmée</h3><p>Ta place est réservée. Rendez-vous ${esc(dayName(st.debut) + ' ' + dateLabel(st.debut))} · ${esc(st.lieu)}.</p></div>`;
    $('#app').innerHTML = `<div class="admin-shell">${spaceTop(me.inscritPar === 'parent' ? 'Espace parent' : 'Espace élève', fullName(me) + ' · ' + me.num)}
      <main class="wrap admin-main">
        ${S.justRegistered ? `<div class="receipt"><span class="pill ok" style="justify-self:start">Inscription créée</span><div><p class="muted small">Ton N° d'inscription (c'est aussi ton identifiant)</p><p class="no">${esc(S.justRegistered)}</p></div><p class="small muted">Fais une capture d'écran : tu te connecteras avec ce numéro et ton mot de passe.</p></div>` : ''}
        <div class="kpis">
          <div class="kpi"><span class="l">Classe</span><span class="v" style="font-size:1.3rem">${esc(me.classe)}</span><span class="s">${esc(formule(me.classe, me.matieres, st.tarifs))}</span></div>
          <div class="kpi"><span class="l">Mensualité</span><span class="v">${fcfa(me.tarif)}</span><span class="s">par mois</span></div>
          <div class="kpi ${bal.reste ? 'alert' : ''}"><span class="l">Reste à payer à ce jour</span><span class="v">${fcfa(bal.reste)}</span><span class="s">${bal.late.length ? bal.late.length + ' mois en retard' : 'À jour'}${bal.inscReste ? ' · frais d\'inscription : ' + fcfa(bal.inscReste) : ''}</span></div>
          <div class="kpi"><span class="l">Statut</span><span class="v" style="font-size:1.1rem"><span class="pill ${sc}">${sl}</span></span><span class="s">N° ${esc(me.num)}</span></div>
        </div>
        ${avisHTML}${alertes}${action}
        ${suiviEleveHTML(me)}
        <div class="panel"><div class="toolbar"><h3 class="grow">Mes mensualités</h3><button class="btn primary sm" data-act="declare">Déclarer un paiement</button></div>
          <div class="tbl-wrap"><table><thead><tr><th>Échéance</th><th class="n">Payé</th><th>État</th></tr></thead><tbody>
          ${(() => { const [l, c, p] = inscState(me); return `<tr><td><b>Frais d'inscription</b></td><td class="n">${fcfa(p)}<span class="sub">sur ${fcfa(me.tarif)}</span></td><td><span class="pill ${c}">${l}</span></td></tr>`; })()}
          ${months.map(m => { const [l, c, p] = monthState(me, m); return `<tr><td>${monthLabel(m)}</td><td class="n">${fcfa(p)}<span class="sub">sur ${fcfa(dueFor(me, m))}${me.moitie === 'oui' && m === me.moisDebut ? ' · ½ mois' : ''}</span></td><td><span class="pill ${c}">${l}</span></td></tr>`; }).join('')}
          </tbody></table></div></div>
        <div class="panel"><h3>Mes paiements déclarés</h3>${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>Objet</th><th>Mode</th><th class="n">Montant</th><th>État</th></tr></thead><tbody>${hist.map(p => { const [l, c] = PAY_ST[p.statut] || PAY_ST.valide; return `<tr><td>${payLabel(p)}<span class="sub">le ${esc(dateLabel(p.date))}</span></td><td>${esc(p.mode)}${p.ref ? `<span class="sub num">${esc(p.ref)}</span>` : ''}</td><td class="n">${fcfa(p.montant)}</td><td><span class="pill ${c}">${l}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Aucun paiement pour l\'instant.</p>'}</div>
        <div class="panel"><h3>Mon emploi du temps · ${esc(me.classe)}</h3><div class="week">${weekHTML(S.sessions.filter(s => s.classes.includes(me.classe) && me.matieres.includes(s.matiere)), false)}</div></div>
        <div class="panel callout"><div class="toolbar"><div class="grow"><h3>Invite tes camarades</h3><p class="small muted" style="margin:4px 0 0">Les places sont limitées : partage Sigma Cap avec un ami ou ses parents.</p></div><button class="btn primary sm" data-act="share">Partager</button></div></div>
        <div class="panel"><h3>Mes informations</h3><dl class="kv">
          <dt>École d'origine</dt><dd>${esc(me.etablissement) || '—'}</dd><dt>Dernières notes</dt><dd>${esc(notesTxt(me))}</dd>
          <dt>Parent</dt><dd>${esc(me.parentNom) || '—'} · <span class="num">${esc(me.telParent)}</span></dd><dt>Téléphone</dt><dd class="num">${esc(me.telEleve) || '—'}</dd></dl>
          <p class="small muted">Une erreur ? Contacte ${S.settings.contacts.map(c => esc(c.nom) + ' (' + esc(c.tel) + ')').join(' ou ')}.</p></div>
        <p class="muted small">${updatedTxt()}</p>
      </main></div>`;
    S.justRegistered = null;
    const f = $('#cf');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault(); const code = $('#cf-code').value.trim();
      if (code.length < 4) { const x = $('#cf-err'); x.textContent = 'Saisis le code reçu.'; x.hidden = false; return; }
      try { applyData(await call('confirm', { codeConf: code })); toast('Inscription confirmée !'); renderEleve(); }
      catch (x) { const er = $('#cf-err'); er.textContent = x.message; er.hidden = false; }
    });
  }
  function suiviEleveHTML(me) {
    const su = suiviOf(me);
    const cards = asList(me.matieres).map(m => {
      const pts = serie(me, m), a = analyse(pts), coms = su.coms.filter(c => c.mat === m).slice().reverse();
      return `<div class="note-card"><div class="nc-head"><span class="pill ${esc(m)}">${MAT_LABEL[m] || esc(m)}</span>${a ? `<span class="pill ${GROUPES[a.groupe][1]}">${GROUPES[a.groupe][0]}</span>` : ''}</div>
        ${a ? `${numsHTML(a, pts)}${a.alertes.length ? `<div class="chips">${a.alertes.map(([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`).join('')}</div>` : ''}<p class="small">${esc(a.auto)}</p>` : '<p class="muted small">Aucune note pour l\'instant.</p>'}
        ${coms.slice(0, 3).map(c => `<div class="com"><b>${esc(c.par)}</b> <span class="muted small">· ${esc(dateLabel(c.date))}</span><p>${esc(c.texte)}</p></div>`).join('')}
        ${pts.length ? `<details><summary class="small">Toutes mes notes (${pts.length})</summary><table class="mini"><tbody>${pts.slice().reverse().map(p => `<tr><td>${esc(dateLabel(p.date))}</td><td>${esc(p.type)}${p.lib ? ' · ' + esc(p.lib) : ''}</td><td class="n"><b>${n1(p.val)}</b></td><td>${p.id !== 'init' ? `<button class="btn sm ghost" data-act="del-note" data-id="${esc(p.id)}" aria-label="Supprimer cette note">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
      </div>`;
    }).join('');
    return `<div class="panel"><div class="toolbar"><h3 class="grow">Mes notes et ma progression</h3><button class="btn primary sm" data-act="add-note">+ Ajouter une note</button></div>
      <p class="small muted">Ajoute chaque nouvelle note (devoir, composition…). Tu es placé automatiquement dans un groupe selon tes 3 dernières notes, et ton prof suit ton évolution.</p>
      <div class="note-grid">${cards}</div></div>`;
  }
  function addNoteModal() {
    const me = S.me;
    openModal('Ajouter une note', `<form class="grid2" novalidate>
      <label class="f">Matière<select id="n-mat">${asList(me.matieres).map(m => `<option value="${esc(m)}">${MAT_LABEL[m] || esc(m)}</option>`).join('')}</select></label>
      <label class="f">Note sur 20<input id="n-val" inputmode="decimal" placeholder="ex. 12,5"></label>
      <label class="f">Type<select id="n-type">${TYPES_NOTE.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label class="f">Date<input id="n-date" type="date" value="${today()}" max="${today()}"></label>
      <label class="f" style="grid-column:1/-1">Précision <span class="h">facultatif · ex. « Devoir n°2 – fonctions »</span><input id="n-lib" maxlength="60"></label>
    </form><p class="err" id="n-err" hidden></p>`, `<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="n-save">Enregistrer la note</button>`);
    $('#n-save').addEventListener('click', async () => {
      const val = parseFloat($('#n-val').value.replace(',', '.')); const er = $('#n-err');
      if (isNaN(val) || val < 0 || val > 20) { er.textContent = 'Indique une note entre 0 et 20.'; er.hidden = false; return; }
      $('#n-save').disabled = true;
      try { applyData(await call('addNote', { note: { mat: $('#n-mat').value, val, type: $('#n-type').value, date: $('#n-date').value, lib: $('#n-lib').value.trim() } })); closeModal(); toast('Note enregistrée'); renderEleve(); }
      catch (x) { if (/Session expirée/.test(x.message)) return expired(); er.textContent = /Accès refusé/.test(x.message) ? "Le serveur n'est pas encore à jour pour les notes : préviens l'admin." : x.message; er.hidden = false; $('#n-save').disabled = false; }
    });
  }

  /* suivi des notes côté prof et gestionnaire */
  function suiviPane(students, matsFor) {
    const rows = []; students.forEach(s => matsFor(s).forEach(m => { const pts = serie(s, m); rows.push({ s, m, pts, a: analyse(pts) }); }));
    const f = S.suiviFilter;
    const classes = [...new Set(rows.map(r => r.s.classe))].sort(), mats = [...new Set(rows.map(r => r.m))];
    const vis = rows.filter(r => (!f.classe || r.s.classe === f.classe) && (!f.mat || r.m === f.mat));
    const enDiff = vis.filter(r => r.a && r.a.alertes.some(x => x[1] === 'bad')).length;
    const sansNote = vis.filter(r => !r.a).length;
    const head = `<thead><tr><th>Élève</th><th>Matière</th><th class="n">Dernière</th><th class="n">Moyenne</th><th>Tendance</th><th>Évolution</th><th>Alertes</th><th></th></tr></thead>`;
    const line = r => { const nc = suiviOf(r.s).coms.filter(c => c.mat === r.m).length; return `<tr><td><b>${esc(fullName(r.s))}</b><span class="sub num">${esc(r.s.num)}</span></td><td><span class="pill ${esc(r.m)}">${esc(r.m)}</span></td>
      <td class="n">${r.a ? '<b>' + n1(r.a.last) + '</b>' : '—'}</td><td class="n">${r.a ? n1(r.a.moy) : '—'}</td><td>${r.a ? `<span class="tend ${r.a.tend}">${TEND[r.a.tend]}</span>` : ''}</td><td>${spark(r.pts, 100, 28)}</td>
      <td>${r.a ? r.a.alertes.map(([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`).join(' ') : '<span class="muted small">pas encore de note</span>'}${nc ? `<span class="sub">${nc} commentaire${nc > 1 ? 's' : ''}</span>` : ''}</td>
      <td><button class="btn sm" data-act="suivi" data-id="${esc(r.s.id)}" data-v="${esc(r.m)}">Suivre</button></td></tr>`; };
    const blocks = classes.filter(c => !f.classe || c === f.classe).map(c => {
      const rc = vis.filter(r => r.s.classe === c); if (!rc.length) return '';
      return `<div class="panel"><h3>${esc(c)} · ${new Set(rc.map(r => r.s.id)).size} élève(s)</h3>${['A', 'B', 'C', 'Z'].map(k => {
        const l = rc.filter(r => (r.a ? r.a.groupe : 'Z') === k); if (!l.length) return '';
        const t = k === 'Z' ? ['Sans note saisie', 'neutral'] : GROUPES[k];
        return `<h4 class="grp"><span class="pill ${t[1]}">${t[0]}</span> <span class="muted small">${l.length}</span></h4><div class="tbl-wrap"><table>${head}<tbody>${l.sort((x, y) => x.s.nom.localeCompare(y.s.nom)).map(line).join('')}</tbody></table></div>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="toolbar"><select data-act="sf-classe" aria-label="Classe"><option value="">Toutes les classes</option>${classes.map(c => `<option ${f.classe === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-act="sf-mat" aria-label="Matière"><option value="">Toutes les matières</option>${mats.map(m => `<option value="${esc(m)}" ${f.mat === m ? 'selected' : ''}>${MAT_LABEL[m] || esc(m)}</option>`).join('')}</select>
        <span class="grow muted small">Groupes calculés sur les 3 dernières notes : A ≥ 14 · B de 10 à 14 · C sous 10</span></div>
      <div class="kpis"><div class="kpi"><span class="l">Élèves suivis</span><span class="v">${new Set(vis.map(r => r.s.id)).size}</span></div>
        <div class="kpi ${enDiff ? 'alert' : ''}"><span class="l">Sous 10 ou en forte baisse</span><span class="v">${enDiff}</span></div>
        <div class="kpi"><span class="l">Sans note saisie</span><span class="v">${sansNote}</span></div></div>
      ${blocks || '<div class="tbl-wrap"><p class="empty-state">Aucun élève à suivre pour l\'instant.</p></div>'}`;
  }
  const profMats = s => [...new Set(S.sessions.filter(x => x.prof === S.me.nom && x.classes.includes(s.classe) && asList(s.matieres).includes(x.matiere)).map(x => x.matiere))];
  const rerender = () => (S.role === 'prof' ? renderProf() : S.role === 'eleve' ? renderEleve() : renderPane());
  function suiviModal(id, mat) {
    const s = S.students.find(x => x.id === id); if (!s) return;
    const pts = serie(s, mat), a = analyse(pts), coms = suiviOf(s).coms.filter(c => c.mat === mat).slice().reverse();
    const QUICK = ['Bon travail, continue !', 'Des progrès : persévère.', 'Attention à la baisse : revois les dernières leçons.', 'Viens me voir après le cours.'];
    openModal(fullName(s) + ' · ' + (MAT_LABEL[mat] || mat), `
      ${a ? `<div class="chips"><span class="pill ${GROUPES[a.groupe][1]}">${GROUPES[a.groupe][0]}</span>${a.alertes.map(([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`).join('')}</div>${numsHTML(a, pts)}<p class="small">${esc(a.auto)}</p>` : '<p class="muted">Aucune note saisie pour cette matière.</p>'}
      ${pts.length ? `<div class="tbl-wrap"><table><tbody>${pts.slice().reverse().map(p => `<tr><td>${esc(dateLabel(p.date))}</td><td>${esc(p.type)}${p.lib ? ' · ' + esc(p.lib) : ''}</td><td class="n"><b>${n1(p.val)}</b>/20</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h4 style="margin:6px 0 0">Commentaires</h4>
      ${coms.length ? coms.map(c => `<div class="com"><b>${esc(c.par)}</b> <span class="muted small">· ${esc(dateLabel(c.date))}</span>${S.role === 'admin' || c.par === S.me.nom ? ` <button class="btn sm ghost" data-act="del-com" data-id="${esc(s.id)}" data-v="${esc(c.id)}" data-m="${esc(mat)}">Retirer</button>` : ''}<p>${esc(c.texte)}</p></div>`).join('') : '<p class="muted small">Aucun commentaire pour l\'instant.</p>'}
      <div class="chips">${QUICK.map(q => `<button type="button" class="btn sm" data-act="quick-com" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <label class="f">Nouveau commentaire <span class="h">visible par l'élève et ses parents</span><textarea id="c-txt" rows="3"></textarea></label><p class="err" id="c-err" hidden></p>`,
      `<button class="btn" data-act="close">Fermer</button><button class="btn primary" id="c-save">Publier le commentaire</button>`);
    $('#c-save').addEventListener('click', async () => {
      const texte = $('#c-txt').value.trim(), er = $('#c-err');
      if (texte.length < 2) { er.textContent = 'Écrivez le commentaire.'; er.hidden = false; return; }
      $('#c-save').disabled = true;
      try { applyData(await call('comment', { studentId: id, mat, texte })); toast('Commentaire publié'); rerender(); suiviModal(id, mat); }
      catch (x) { if (/Session expirée/.test(x.message)) return expired(); er.textContent = /Table inconnue|Accès refusé/.test(x.message) ? "Le serveur n'est pas encore à jour pour les commentaires (voir la mise à jour du script Google)." : x.message; er.hidden = false; $('#c-save').disabled = false; }
    });
  }
  function declareModal() {
    const me = S.me;
    const months = monthsRange(maxMonth(me.moisDebut || startMonth(), startMonth()), S.settings.finMois || '2027-07');
    const inscLeft = Math.max(0, me.tarif - inscPaid(me.id) - inscPending(me.id));
    const first = inscLeft > 0 ? 'insc' : (months.find(m => paidFor(me.id, m) + pendingFor(me.id, m) < dueFor(me, m)) || months[0]);
    const leftFor = v => v === 'insc' ? inscLeft : Math.max(0, dueFor(me, v) - paidFor(me.id, v) - pendingFor(me.id, v));
    openModal('Déclarer un paiement', `<form class="grid2" novalidate>
      <label class="f">Objet du paiement<select id="d-mois">${inscLeft > 0 ? `<option value="insc" ${first === 'insc' ? 'selected' : ''}>Frais d'inscription</option>` : ''}${months.map(m => `<option value="${m}" ${m === first ? 'selected' : ''}>Mensualité · ${monthLabel(m)}</option>`).join('')}</select></label>
      <label class="f">Montant (FCFA)<input id="d-mt" type="number" min="0" step="500" value="${leftFor(first) || me.tarif}"></label>
      <label class="f">Mode<select id="d-mode">${MODES_ELEVE.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="f" id="d-refw">Référence de la transaction <span class="h">dans le SMS Wave / Orange Money</span><input id="d-ref" autocapitalize="characters"></label>
      <label class="f" style="grid-column:1/-1">Note <span class="h">facultatif · ex. « remis à M. Faye »</span><input id="d-note"></label>
    </form><p class="infobox small">${esc(S.settings.paiement)} Ton paiement apparaîtra « À valider » jusqu'à la vérification par l'admin.</p><p class="err" id="d-err" hidden></p>`,
      `<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="d-save">Envoyer la déclaration</button>`);
    const sync = () => { $('#d-refw').hidden = $('#d-mode').value === 'Espèces'; };
    $('#d-mode').addEventListener('change', sync); sync();
    $('#d-mois').addEventListener('change', () => { $('#d-mt').value = leftFor($('#d-mois').value) || me.tarif; });
    $('#d-save').addEventListener('click', async () => {
      const obj = $('#d-mois').value, insc = obj === 'insc', note = $('#d-note').value.trim();
      const p = { mois: insc ? months[0] : obj, montant: +$('#d-mt').value || 0, mode: $('#d-mode').value, ref: $('#d-ref').value.trim(), note: insc ? (INSC_TAG + ' ' + note).trim() : note };
      const er = $('#d-err');
      if (p.montant <= 0) { er.textContent = 'Indique le montant payé.'; er.hidden = false; return; }
      if (p.mode !== 'Espèces' && p.ref.length < 4) { er.textContent = 'Indique la référence de la transaction (dans le SMS de confirmation).'; er.hidden = false; return; }
      $('#d-save').disabled = true;
      try { applyData(await call('declarePay', { payment: p })); closeModal(); toast('Paiement déclaré : il sera validé par l\'admin.'); renderEleve(); }
      catch (x) { if (/Session expirée/.test(x.message)) return expired(); er.textContent = x.message; er.hidden = false; $('#d-save').disabled = false; }
    });
  }

  /* =========================================================
     ESPACE PROF
     ========================================================= */
  function finView(f, highlightId, monthSel) {
    const months = (S.byMonth || []).map(x => x.mois);
    return `<div class="toolbar"><select data-act="fin-month" aria-label="Période"><option value="">Toute l'année</option>${months.map(m => `<option value="${m}" ${m === monthSel ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
        <span class="grow muted small">${updatedTxt()} · actualisé automatiquement</span></div>
      <div class="kpis">
        <div class="kpi"><span class="l">Encaissé (validé)</span><span class="v">${fcfa(f.encaisse)}</span>${f.aValider.n ? `<span class="s">+ ${fcfa(f.aValider.montant)} en attente de validation</span>` : '<span class="s">tous paiements validés</span>'}</div>
        <div class="kpi"><span class="l">Frais de fonctionnement</span><span class="v">${fcfa(f.depenses)}</span><span class="s">salle, photocopies…</span></div>
        <div class="kpi"><span class="l">Net à partager</span><span class="v">${fcfa(f.net)}</span><span class="s">${String(f.totalParts).replace('.', ',')} parts au total</span></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>Intervenant</th><th>Matière</th><th class="n">Parts</th><th class="n">Sa part</th><th class="n">Déjà versé</th><th class="n">Reste à verser</th></tr></thead><tbody>
        ${f.rows.length ? f.rows.map(r => `<tr${r.id === highlightId ? ' class="me"' : ''}><td><b>${esc(r.nom)}</b>${r.id === highlightId ? ' <span class="pill ok">moi</span>' : ''}</td><td><span class="pill ${esc(r.matiere)}">${esc(r.matiere)}</span></td><td class="n">${String(r.parts).replace('.', ',')}</td><td class="n"><b>${fcfa(r.share)}</b></td><td class="n">${fcfa(r.verse)}</td><td class="n">${fcfa(r.reste)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Aucun intervenant actif.</td></tr>'}
      </tbody></table></div>
      <p class="small muted">Règle : net à partager × parts de chacun ÷ total des parts. Le prof de SVT a ½ part, soit la moitié de la part des autres. Seuls les paiements validés comptent.</p>`;
  }
  function renderProf() {
    const me = S.me;
    const all = S.finance || C.finance({});
    const f = S.finMonth ? (S.byMonth.find(x => x.mois === S.finMonth) || all) : all;
    const myRow = f.rows.find(r => r.id === me.id) || { share: 0, verse: 0, reste: 0 };
    const mine = S.sessions.filter(s => s.prof === me.nom);
    const byClass = {};
    S.students.forEach(s => { (byClass[s.classe] = byClass[s.classe] || []).push(s); });
    const tabs = [['finances', 'Finances & ma part'], ['cours', 'Mes cours'], ['suivi', 'Suivi des notes'], ['eleves', `Mes élèves (${S.students.length})`]];
    let body = '';
    if (S.ptab === 'finances') body = `<div class="kpis">
          <div class="kpi"><span class="l">Ma part ${S.finMonth ? '· ' + monthLabel(S.finMonth) : 'depuis la rentrée'}</span><span class="v">${fcfa(myRow.share)}</span><span class="s">${String(me.parts).replace('.', ',')} part${me.parts > 1 ? 's' : ''}</span></div>
          <div class="kpi"><span class="l">Déjà reçu</span><span class="v">${fcfa(myRow.verse)}</span></div>
          <div class="kpi ${myRow.reste > 0 ? '' : ''}"><span class="l">Reste à recevoir</span><span class="v">${fcfa(myRow.reste)}</span></div>
        </div>
        <div class="panel"><h3>État des finances partagé</h3>${finView(f, me.id, S.finMonth)}</div>`;
    else if (S.ptab === 'cours') body = `<div class="panel"><h3>Mes cours · ${hoursOf(me.nom)} h par semaine</h3>
          ${mine.length ? `<div class="tbl-wrap"><table><tbody>${mine.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || mins(a.debut) - mins(b.debut)).map(s => `<tr><td><b>${s.jour}</b></td><td class="num">${hfmt(s.debut)} – ${hfmt(s.fin)}</td><td><span class="pill ${esc(s.matiere)}">${esc(s.matiere)}</span></td><td>${s.classes.map(esc).join(' + ')}</td><td class="muted">${esc(s.salle)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun cours attribué pour l\'instant.</p>'}</div>
        <div class="panel"><h3>Emploi du temps complet</h3><div class="week">${weekHTML(S.sessions, false, me.nom)}</div></div>`;
    else if (S.ptab === 'suivi') body = suiviPane(S.students.filter(s => s.statut !== 'abandon'), profMats);
    else body = `${(S.alerts || []).filter(a => a.type === 'groupe').map(a => `<div class="warnbox">${esc(a.msg)}</div>`).join('')}
        ${Object.keys(byClass).length ? Object.keys(byClass).sort().map(c => `<div class="panel"><h3>${esc(c)} · ${byClass[c].length} élève${byClass[c].length > 1 ? 's' : ''}</h3><div class="tbl-wrap"><table><thead><tr><th>Élève</th><th>École d'origine</th><th class="n">Maths</th><th class="n">PC</th><th class="n">SVT</th><th>Statut</th></tr></thead><tbody>
          ${byClass[c].sort((a, b) => a.nom.localeCompare(b.nom)).map(s => { const [l, k] = STATUTS[s.statut] || ['?', 'neutral']; return `<tr><td><b>${esc(fullName(s))}</b><span class="sub num">${esc(s.num)}</span></td><td>${esc(s.etablissement) || '—'}</td><td class="n">${esc(String(s.notesMaths || '—').replace('.', ','))}</td><td class="n">${esc(String(s.notesPC || '—').replace('.', ','))}</td><td class="n">${esc(String(s.notesSVT || '—').replace('.', ','))}</td><td><span class="pill ${k}">${l}</span></td></tr>`; }).join('')}
          </tbody></table></div></div>`).join('') : '<div class="tbl-wrap"><p class="empty-state">Aucun élève inscrit dans vos cours pour l\'instant.</p></div>'}`;
    $('#app').innerHTML = `<div class="admin-shell">${spaceTop('Espace prof', me.nom + ' · ' + (MAT_LABEL[me.matiere] || me.matiere))}
      <nav class="tabs"><div class="wrap" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="ptab" data-v="${k}" aria-selected="${S.ptab === k}">${l}</button>`).join('')}</div></nav>
      <main class="wrap admin-main">${body}</main></div>`;
  }

  /* =========================================================
     ESPACE GESTIONNAIRE
     ========================================================= */
  const TABS = [['dash', 'Tableau de bord'], ['eleves', 'Élèves'], ['suivi', 'Suivi des notes'], ['paiements', 'Paiements'], ['depenses', 'Dépenses'], ['repartition', 'Répartition'], ['edt', 'Emploi du temps'], ['profs', 'Profs & accès'], ['params', 'Paramètres']];
  function renderAdmin() {
    const pending = S.students.filter(s => s.statut === 'attente').length;
    const toVal = S.payments.filter(p => p.statut === 'a_valider').length;
    $('#app').innerHTML = `<div class="admin-shell">${spaceTop('Gestion Sigma Cap', (S.me ? S.me.nom : '') + ' · ' + S.settings.annee)}
      <nav class="tabs"><div class="wrap" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-act="tab" data-v="${k}" aria-selected="${S.tab === k}">${l}${k === 'eleves' && pending ? `<span class="count">${pending}</span>` : ''}${k === 'paiements' && toVal ? `<span class="count">${toVal}</span>` : ''}</button>`).join('')}</div></nav>
      <main class="wrap admin-main" id="pane"></main>
    </div>`;
    renderPane();
  }
  function renderPane() {
    const p = $('#pane'); if (!p) return;
    const fn = { dash: paneDash, eleves: paneEleves, suivi: () => suiviPane(S.students.filter(s => s.statut !== 'abandon'), s => asList(s.matieres)), paiements: panePaiements, depenses: paneDepenses, repartition: paneRepartition, edt: paneEdt, profs: paneProfs, params: paneParams }[S.tab];
    p.innerHTML = fn();
    if (S.tab === 'eleves') bindStudentFilters();
    if (S.tab === 'params') bindParams();
  }

  /* ---------- tableau de bord ---------- */
  function paneDash() {
    const act = S.students.filter(isActive);
    const pend = S.students.filter(s => s.statut === 'attente');
    const codeWait = S.students.filter(s => s.statut === 'code');
    const toVal = S.payments.filter(p => p.statut === 'a_valider');
    const m = curMonth() < startMonth() ? startMonth() : curMonth();
    const attendu = act.filter(s => (s.moisDebut || startMonth()) <= m).reduce((a, s) => a + dueFor(s, m), 0);
    const encMois = S.payments.filter(p => payOk(p) && p.mois === m).reduce((a, p) => a + p.montant, 0);
    const bal = act.map(s => [s, balance(s)]);
    const impayes = bal.reduce((a, [, b]) => a + b.reste, 0);
    const fin = C.finance(finData());
    const al = C.alerts(finData());
    const conf = conflicts();
    const seuils = S.settings.seuils || {};
    const byClass = S.settings.classes.map(c => [c, S.students.filter(s => s.classe === c && s.statut !== 'abandon').length, +(seuils[c] || 6)]);
    const maxC = Math.max(1, ...byClass.map(x => Math.max(x[1], x[2])));
    const late = bal.filter(([, b]) => b.late.length || b.inscReste).sort((a, b) => b[1].late.length - a[1].late.length || b[1].reste - a[1].reste).slice(0, 8);
    const hasEx = S.students.some(s => s.exemple);
    return `
      ${hasEx ? `<div class="warnbox">Les élèves marqués « exemple » servent à montrer l'application. Supprimez-les depuis l'onglet Élèves avant de démarrer.</div>` : ''}
      <div class="kpis">
        <div class="kpi"><span class="l">Élèves inscrits (payé)</span><span class="v">${act.length}</span><span class="s">${pend.length} sans paiement · ${codeWait.length} code non saisi</span></div>
        <div class="kpi ${toVal.length ? 'alert' : ''}"><span class="l">Paiements à valider</span><span class="v">${toVal.length}</span><span class="s">${fcfa(toVal.reduce((a, p) => a + p.montant, 0))} déclarés par les élèves</span></div>
        <div class="kpi"><span class="l">Encaissé · ${monthLabel(m)}</span><span class="v">${fcfa(encMois)}</span><span class="s">sur ${fcfa(attendu)} attendus</span></div>
        <div class="kpi ${impayes ? 'alert' : ''}"><span class="l">Impayés cumulés</span><span class="v">${fcfa(impayes)}</span><span class="s">${bal.filter(([, b]) => b.late.length).length} élève(s) en retard après le ${limitDay()}</span></div>
      </div>
      ${toVal.length ? `<div class="warnbox">${toVal.length} paiement${toVal.length > 1 ? 's' : ''} déclaré${toVal.length > 1 ? 's' : ''} par les élèves attend${toVal.length > 1 ? 'ent' : ''} votre validation. <button class="btn sm" data-act="tab" data-v="paiements">Valider</button></div>` : ''}
      ${al.map(a => `<div class="warnbox">${a.type === 'groupe' ? 'Nouveau prof à prévoir · ' : 'Poste à pourvoir · '}${esc(a.msg)}</div>`).join('')}
      ${conf.length ? `<div class="warnbox">Conflit d'emploi du temps : ${conf.map(c => esc(c.why) + ' le ' + c.a.jour.toLowerCase()).join(' ; ')}.</div>` : ''}
      <div class="panels">
        <div class="panel"><h3>Élèves par classe et seuil</h3>${byClass.map(([c, n, max]) => `<div class="bar" style="grid-template-columns:110px 1fr 70px"><span>${esc(c)}</span><span class="tr"><i class="${n > max ? 'bad' : ''}" style="width:${n / maxC * 100}%"></i><u style="left:${max / maxC * 100}%"></u></span><b>${n} / ${max}</b></div>`).join('')}
          <p class="muted small">Le trait marque le seuil au-delà duquel l'appli propose de trouver un nouveau prof (réglable dans Paramètres).</p></div>
        <div class="panel"><h3>Répartition · depuis la rentrée</h3><p class="small muted">Net à partager ${fcfa(fin.net)} · ${String(fin.totalParts).replace('.', ',')} parts</p>
          <div class="tbl-wrap" style="border:0"><table><tbody>${fin.rows.map(r => `<tr><td>${esc(r.nom)}</td><td class="n">${String(r.parts).replace('.', ',')} part</td><td class="n"><b>${fcfa(r.share)}</b></td></tr>`).join('')}</tbody></table></div>
          <div><button class="btn sm" data-act="tab" data-v="repartition">Voir le détail</button></div></div>
        <div class="panel"><h3>À relancer · échéance le ${limitDay()} du mois</h3>${late.length ? `<div class="tbl-wrap" style="border:0"><table><tbody>${late.map(([s, b]) => `<tr><td>${esc(fullName(s))}<span class="sub">${esc(s.classe)} · ${[b.late.length ? b.late.length + ' mois en retard' : '', b.inscReste ? 'inscription non réglée' : ''].filter(Boolean).join(' · ')}</span></td><td class="n">${fcfa(b.reste)}</td><td class="n"><div class="row-actions">${waLink(s, b.late[b.late.length - 1] || m, b.reste)}<button class="btn sm" data-act="avis" data-id="${esc(s.id)}">Message</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Tout le monde est à jour.</p>'}</div>
        <div class="panel"><h3>Inscrits sans paiement</h3>${pend.length ? `<div class="tbl-wrap" style="border:0"><table><tbody>${pend.slice(0, 6).map(s => `<tr><td>${esc(fullName(s))}<span class="sub">${esc(s.num)} · ${esc(s.classe)} · ${fcfa(s.tarif)}CFA · ${esc(s.telParent)}</span></td><td class="n"><button class="btn sm primary" data-act="pay" data-id="${esc(s.id)}">Encaisser</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun.</p>'}
          <p class="muted small">Le premier paiement validé crée le code de confirmation à remettre à l'élève.</p></div>
      </div>`;
  }
  function waLink(s, mois, reste) {
    const tel = waNum(s.telParent || s.telEleve); if (!tel) return '';
    const msg = (S.settings.relance || '').replace('{mois}', monthLabel(mois)).replace('{eleve}', fullName(s)).replace('{classe}', s.classe).replace('{reste}', fcfaLong(reste));
    return `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}">Relancer</a>`;
  }

  /* ---------- élèves ---------- */
  function filteredStudents() {
    const f = S.filter; const q = f.q.toLowerCase();
    return S.students.filter(s => (!f.classe || s.classe === f.classe) && (!f.statut || s.statut === f.statut) &&
      (!q || [s.prenom, s.nom, s.num, s.telParent, s.telEleve, s.parentNom, s.etablissement].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (a.statut === 'attente' ? -1 : 0) - (b.statut === 'attente' ? -1 : 0) || a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom));
  }
  function paneEleves() {
    return `<div class="toolbar">
        <input class="grow" id="f-q" type="search" placeholder="Rechercher un nom, un numéro, une école…" value="${esc(S.filter.q)}">
        <select id="f-classe"><option value="">Toutes les classes</option>${S.settings.classes.map(c => `<option ${S.filter.classe === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="f-statut"><option value="">Tous les statuts</option>${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${S.filter.statut === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
        <button class="btn primary" data-act="new-student">+ Inscrire un élève</button>
        <button class="btn" data-act="csv-students">Exporter</button>
      </div>
      <div id="st-table">${studentTable()}</div>`;
  }
  function studentTable() {
    const list = filteredStudents();
    if (!list.length) return `<div class="tbl-wrap"><p class="empty-state">${S.students.length ? 'Aucun élève ne correspond à la recherche.' : 'Aucun élève pour l\'instant. Les inscriptions en ligne arriveront ici, ou utilisez « Inscrire un élève ».'}</p></div>`;
    return `<p class="muted small">${list.length} élève${list.length > 1 ? 's' : ''}</p><div class="tbl-wrap"><table>
      <thead><tr><th>N°</th><th>Élève</th><th>Classe</th><th>Formule</th><th>Notes</th><th class="n">Mensualité</th><th class="n">Reste dû</th><th>Statut</th></tr></thead>
      <tbody>${list.map(s => { const b = balance(s); const [l, c] = STATUTS[s.statut] || ['?', 'neutral']; return `<tr class="click" data-act="edit-student" data-id="${esc(s.id)}">
        <td class="num" style="white-space:nowrap">${esc(s.num)}</td>
        <td><b>${esc(fullName(s))}</b>${s.exemple ? ' <span class="pill neutral">exemple</span>' : ''}<span class="sub">${esc(s.etablissement) || '—'} · ${esc(s.telParent)}${s.inscritPar === 'parent' ? ' · inscrit par le parent' : ''}</span></td>
        <td>${esc(s.classe)}</td>
        <td>${s.matieres.map(m => `<span class="pill ${m}">${m}</span>`).join(' ')}</td>
        <td class="small">${esc(notesTxt(s))}</td>
        <td class="n">${fcfa(s.tarif)}</td>
        <td class="n">${b.reste ? `<b style="color:var(--bad)">${fcfa(b.reste)}</b>` : '<span class="muted">—</span>'}</td>
        <td><span class="pill ${c}">${l}</span>${s.statut === 'code' ? `<span class="sub">code <b class="num">${esc(s.codeConf)}</b></span>` : ''}${s.hasPwd === false ? '<span class="sub">sans mot de passe</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function bindStudentFilters() {
    const up = () => { S.filter.q = $('#f-q').value; S.filter.classe = $('#f-classe').value; S.filter.statut = $('#f-statut').value; $('#st-table').innerHTML = studentTable(); };
    $('#f-q').addEventListener('input', up); $('#f-classe').addEventListener('change', up); $('#f-statut').addEventListener('change', up);
  }

  function studentModal(id) {
    const s = id ? clone(S.students.find(x => x.id === id)) : { id: uid('el'), prenom: '', nom: '', sexe: 'F', classe: S.settings.classes[0], etablissement: '', telEleve: '', parentNom: '', telParent: '', matieres: [], notesMaths: '', notesPC: '', notesSVT: '', statut: 'attente', source: 'manuel', notes: '', codeConf: '', createdAt: today() };
    if (!id) Object.assign(s, C.planInscription(today(), S.settings));
    if (!id) { const t = S.settings.tarifs[s.classe]; s.matieres = t && t.pack ? t.pack.matieres.slice() : []; }
    const isNew = !id;
    const b = isNew ? null : balance(s);
    const hist = isNew ? [] : S.payments.filter(p => p.studentId === s.id).sort((a, c) => a.mois.localeCompare(c.mois));
    openModal(isNew ? 'Inscrire un élève' : fullName(s) + ' · ' + s.num, `
      <form id="sf" class="grid2" novalidate>
        <label class="f">Prénom<input id="s-prenom" value="${esc(s.prenom)}"></label>
        <label class="f">Nom<input id="s-nom" value="${esc(s.nom)}"></label>
        <label class="f">Sexe<select id="s-sexe"><option value="F" ${s.sexe === 'F' ? 'selected' : ''}>Fille</option><option value="M" ${s.sexe === 'M' ? 'selected' : ''}>Garçon</option></select></label>
        <label class="f">Classe<select id="s-classe">${S.settings.classes.map(c => `<option ${c === s.classe ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="f">École d'origine<input id="s-etab" value="${esc(s.etablissement)}"></label>
        <label class="f">Tél. élève<input id="s-tel" value="${esc(s.telEleve)}" inputmode="tel"></label>
        <label class="f">Parent / tuteur<input id="s-pnom" value="${esc(s.parentNom)}"></label>
        <label class="f">Tél. parent<input id="s-ptel" value="${esc(s.telParent)}" inputmode="tel"></label>
        <div class="grid3" style="grid-column:1/-1"><label class="f">Note Maths<input id="s-nM" inputmode="decimal" value="${esc(String(s.notesMaths || '').replace('.', ','))}"></label><label class="f">Note PC<input id="s-nP" inputmode="decimal" value="${esc(String(s.notesPC || '').replace('.', ','))}"></label><label class="f">Note SVT<input id="s-nS" inputmode="decimal" value="${esc(String(s.notesSVT || '').replace('.', ','))}"></label></div>
        <div style="grid-column:1/-1;display:grid;gap:8px"><span style="font-weight:600;font-size:.9rem">Matières</span><div class="chips" id="s-mats"></div></div>
        <label class="f">Mensualité (FCFA) <span class="h">calculée selon la grille, modifiable</span><input id="s-tarif" type="number" min="0" step="500" value="${s.tarif || 0}"></label>
        <label class="f">Premier mois facturé<select id="s-mois">${schoolMonths().map(m => `<option value="${m}" ${m === (s.moisDebut || startMonth()) ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
        <label class="f">Premier mois<select id="s-moitie"><option value="">Mensualité entière</option><option value="oui" ${s.moitie === 'oui' ? 'selected' : ''}>Moitié (arrivé entre le 15 et le 20)</option></select></label>
        <label class="f">Statut<select id="s-statut">${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${s.statut === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="f">${isNew ? 'Mot de passe de son espace' : 'Nouveau mot de passe'} <span class="h">${isNew ? 'obligatoire · à lui communiquer' : (s.hasPwd ? 'laisser vide pour garder l\'actuel' : 'aucun mot de passe pour l\'instant')}</span><input id="s-pw" autocomplete="new-password" placeholder="${isNew ? 'ex. ses 4 derniers chiffres' : ''}"></label>
        <label class="f" style="grid-column:1/-1">Notes internes<textarea id="s-notes" rows="2">${esc(s.notes)}</textarea></label>
      </form>
      ${isNew ? '<p class="infobox small">Après « Inscrire », la fenêtre d\'encaissement s\'ouvre pour les frais d\'inscription (même montant que la mensualité) : le premier paiement validé crée le code de confirmation.</p>' : codeBox(s)}
      ${isNew ? '' : `<div class="panel" style="padding:12px"><h3 style="font-size:1rem">Paiements</h3>
        <p class="small muted">Mensualités dues (mois terminés) ${fcfa(b.du)} · validé ${fcfa(b.paye)} · <b style="color:${b.reste ? 'var(--bad)' : 'var(--ok)'}">reste ${fcfa(b.reste)}</b>${b.inscReste ? ' · frais d\'inscription restants ' + fcfa(b.inscReste) : ''}${b.late.length ? ` · <b style="color:var(--bad)">${b.late.length} mois en retard</b>` : ''}${b.inscReste ? ' · inscription non réglée' : ''}</p>
        ${hist.length ? `<div class="tbl-wrap"><table><tbody>${hist.map(p => { const [l, c] = PAY_ST[p.statut] || PAY_ST.valide; return `<tr><td>${payLabel(p)}</td><td>${esc(p.mode)}${p.ref ? ' · ' + esc(p.ref) : ''}</td><td class="n">${fcfa(p.montant)}</td><td><span class="pill ${c}">${l}</span></td><td>${!isInsc(p) && b.inscReste ? `<button class="btn sm" data-act="mark-insc" data-id="${esc(p.id)}" title="Ce paiement correspond aux frais d'inscription">→ inscription</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="small muted">Aucun paiement enregistré.</p>'}
      </div>
      ${avisOf(s).length ? `<div class="panel" style="padding:12px"><h3 style="font-size:1rem">Messages affichés dans son espace</h3><div class="tbl-wrap"><table><tbody>${avisOf(s).slice().reverse().map(a => `<tr><td><span class="pill ${a.type === 'avertissement' ? 'bad' : 'warn'}">${a.type === 'avertissement' ? 'Avertissement' : 'Rappel'}</span><span class="sub">${esc(dateLabel(a.date))}${a.par ? ' · ' + esc(a.par) : ''}</span></td><td class="small">${esc(a.texte)}</td><td><button class="btn sm danger" data-act="del-avis" data-id="${esc(s.id)}" data-v="${esc(a.id)}">Retirer</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`}
      <p class="err" id="s-err" hidden></p>`,
      `${isNew ? '' : `<button class="btn danger left" data-act="del-student" data-id="${esc(s.id)}">Supprimer</button><button class="btn" data-act="avis" data-id="${esc(s.id)}">Message</button><button class="btn" data-act="creds" data-kind="students" data-id="${esc(s.id)}" ${isActive(s) ? '' : 'disabled title="Disponible après validation du premier paiement"'}>Identifiants</button><button class="btn" data-act="pay" data-id="${esc(s.id)}">Encaisser</button>`}
       <button class="btn" data-act="close">Annuler</button><button class="btn primary" id="s-save">${isNew ? 'Inscrire' : 'Enregistrer'}</button>`);
    let tarifTouched = !isNew && s.tarif !== prix(s.classe, s.matieres, S.settings.tarifs);
    let initDone = false;
    const drawMats = () => {
      const c = $('#s-classe').value; const cur = $$('#s-mats input:checked').map(i => i.value);
      const sel = initDone ? cur : s.matieres; initDone = true;
      $('#s-mats').innerHTML = matsOf(c).map(m => `<label class="chk"><input type="checkbox" value="${m}" ${sel.includes(m) ? 'checked' : ''}> ${MAT_LABEL[m]}</label>`).join('');
    };
    const reprice = () => { if (!tarifTouched) $('#s-tarif').value = prix($('#s-classe').value, $$('#s-mats input:checked').map(i => i.value), S.settings.tarifs); };
    drawMats(); if (isNew) reprice();
    $('#s-classe').addEventListener('change', () => { drawMats(); reprice(); });
    $('#s-mats').addEventListener('change', reprice);
    $('#s-tarif').addEventListener('input', () => { tarifTouched = true; });
    $('#s-save').addEventListener('click', async () => {
      const v = i => $(i).value.trim();
      const n = x => x.replace(',', '.');
      Object.assign(s, { prenom: v('#s-prenom'), nom: v('#s-nom'), sexe: v('#s-sexe'), classe: v('#s-classe'), etablissement: v('#s-etab'), telEleve: v('#s-tel'), parentNom: v('#s-pnom'), telParent: v('#s-ptel'),
        notesMaths: n(v('#s-nM')), notesPC: n(v('#s-nP')), notesSVT: n(v('#s-nS')), matieres: $$('#s-mats input:checked').map(i => i.value), tarif: +v('#s-tarif') || 0, moisDebut: v('#s-mois'), moitie: $('#s-moitie').value, statut: v('#s-statut'), notes: v('#s-notes') });
      const pw = v('#s-pw'); const er = $('#s-err');
      if (!s.prenom || !s.nom || !s.matieres.length) { er.textContent = 'Indiquez le prénom, le nom et au moins une matière.'; er.hidden = false; return; }
      if (isNew && !pw) { er.textContent = "Donnez un mot de passe à l'élève : sans mot de passe, il ne peut pas se connecter."; er.hidden = false; return; }
      if (pw && pw.length < 4) { er.textContent = 'Mot de passe : 4 caractères minimum.'; er.hidden = false; return; }
      const item = clone(s); delete item.hasPwd; delete item.suivi; delete item.avis; if (pw) item._pwd = pw;
      item.essais = 0; // enregistrer la fiche débloque la saisie du code
      const r = await mutate('save', { kind: 'students', item }, isNew ? 'Élève inscrit · encaissez le paiement' : 'Fiche enregistrée');
      if (!r) return;
      closeModal(); renderAdmin();
      if (isNew) payModal(s.id);
    });
  }
  function codeBox(s) {
    if (s.statut === 'attente') return `<div class="warnbox">Aucun paiement validé. Le code de confirmation sera créé au premier paiement validé.</div>`;
    if (!s.codeConf) return '';
    return `<div class="infobox" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
      <div><span class="small muted">Code de confirmation</span><div style="font:900 1.5rem/1.1 var(--display);letter-spacing:.12em;color:var(--ink)">${esc(s.codeConf)}</div>
      ${(+s.essais || 0) >= 8 && s.statut !== 'actif' ? '<span class="pill bad">Bloqué après 8 essais · cliquez « Enregistrer » pour débloquer</span><br>' : ''}<span class="small ${s.statut === 'actif' ? '' : 'muted'}">${s.statut === 'actif' ? 'Saisi par l\'élève' + (s.confirmeLe ? ' le ' + esc(dateLabel(s.confirmeLe)) : '') + ' · inscription confirmée' : 'Pas encore saisi par l\'élève'}</span></div>
      ${s.statut === 'actif' ? '' : `<div class="row-actions">${codeWa(s)}<button class="btn sm" data-act="copy-code" data-v="${esc(codeMsg(s))}">Copier le message</button></div>`}
    </div>`;
  }
  const codeMsg = s => `Sigma Cap : paiement validé pour ${fullName(s)} (${s.classe}). Connecte-toi à ton espace sur ${pubLink()} (identifiant ${s.num}) et saisis ton code de confirmation : ${s.codeConf}`;
  function codeWa(s) {
    const tel = waNum(s.telEleve || s.telParent); if (!tel) return '';
    return `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(codeMsg(s))}">Envoyer par WhatsApp</a>`;
  }
  function codeModalIfNew(studentId, before) {
    const s = S.students.find(x => x.id === studentId);
    if (s && before === 'attente' && s.statut === 'code') openModal('Paiement validé · code créé', `<p>Remettez ce code à <b>${esc(fullName(s))}</b> pour qu'il confirme son inscription dans son espace.</p>${codeBox(s)}<p class="small muted">Vous pouvez aussi lui envoyer d'un coup son identifiant, un mot de passe et ce code.</p>`, `<button class="btn" data-act="creds" data-kind="students" data-id="${esc(s.id)}">Envoyer les identifiants</button><button class="btn primary" data-act="close">Fermer</button>`);
  }

  /* ---------- paiements ---------- */
  function panePaiements() {
    const months = schoolMonths();
    const m = S.payMonth || (months.includes(curMonth()) ? curMonth() : months[0]);
    S.payMonth = m;
    const toVal = S.payments.filter(p => p.statut === 'a_valider').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const list = S.students.filter(s => isActive(s) && (s.moisDebut || startMonth()) <= m).sort((a, b) => a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom));
    const rows = list.map(s => [s, monthState(s, m)]);
    const att = list.reduce((a, s) => a + dueFor(s, m), 0), enc = rows.reduce((a, [, x]) => a + x[2], 0);
    const journal = S.payments.filter(p => p.mois === m).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const nbPaid = rows.filter(([, x]) => x[1] === 'ok').length;
    const name = id => { const s = S.students.find(x => x.id === id); return s ? fullName(s) + ' · ' + s.classe : 'élève supprimé'; };
    return `${toVal.length ? `<div class="panel" style="border-color:var(--warn)"><h3>À valider · déclarés par les élèves</h3>
        <p class="small muted">Vérifiez la référence dans votre historique Wave / Orange Money, ou que vous avez bien reçu les espèces.</p>
        <div class="tbl-wrap"><table><thead><tr><th>Déclaré le</th><th>Élève</th><th>Objet</th><th>Mode</th><th>Référence</th><th class="n">Montant</th><th></th></tr></thead><tbody>
        ${toVal.map(p => `<tr><td>${esc(dateLabel(p.date))}</td><td><b>${esc(name(p.studentId))}</b>${payNote(p) ? `<span class="sub">${esc(payNote(p))}</span>` : ''}</td><td>${payLabel(p)}</td><td>${esc(p.mode)}</td><td class="num"><b>${esc(p.ref) || '—'}</b></td><td class="n">${fcfa(p.montant)}</td>
          <td><div class="row-actions"><button class="btn sm go" data-act="val-pay" data-id="${esc(p.id)}">Valider</button><button class="btn sm danger" data-act="rej-pay" data-id="${esc(p.id)}">Rejeter</button></div></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <div class="toolbar">
        <select id="p-month" data-act="pay-month">${months.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${monthLabel(x)}</option>`).join('')}</select>
        <span class="grow"></span>
        <button class="btn primary" data-act="pay">+ Encaisser (espèces…)</button>
        <button class="btn" data-act="csv-payments">Exporter</button>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="l">Attendu</span><span class="v">${fcfa(att)}</span><span class="s">${list.length} élèves inscrits</span></div>
        <div class="kpi"><span class="l">Encaissé (validé)</span><span class="v">${fcfa(enc)}</span><span class="s">${nbPaid} élève(s) à jour</span></div>
        <div class="kpi ${att - enc > 0 ? 'alert' : ''}"><span class="l">Reste à encaisser</span><span class="v">${fcfa(Math.max(0, att - enc))}</span><span class="s">${rows.length - nbPaid} élève(s)</span></div>
      </div>
      ${rows.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th class="n">Mensualité</th><th class="n">Payé</th><th class="n">Reste</th><th>État</th><th></th></tr></thead>
        <tbody>${rows.map(([s, [l, c, p]]) => `<tr>
          <td><b>${esc(fullName(s))}</b><span class="sub num">${esc(s.telParent)}</span></td><td>${esc(s.classe)}</td>
          <td class="n">${fcfa(dueFor(s, m))}${dueFor(s, m) !== s.tarif ? '<span class="sub">½ mois</span>' : ''}</td><td class="n">${fcfa(p)}</td><td class="n">${fcfa(Math.max(0, dueFor(s, m) - p))}</td>
          <td><span class="pill ${c}">${l}</span>${inscPaid(s.id) < s.tarif ? '<span class="sub">inscription non réglée</span>' : ''}</td>
          <td><div class="row-actions">${c !== 'ok' ? `<button class="btn sm primary" data-act="pay" data-id="${esc(s.id)}">Encaisser</button>${waLink(s, m, dueFor(s, m) - p)}<button class="btn sm" data-act="avis" data-id="${esc(s.id)}">Message</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="tbl-wrap"><p class="empty-state">Aucun élève inscrit pour ce mois.</p></div>'}
      <div class="panel"><h3>Journal · ${monthLabel(m)}</h3>
        ${journal.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Élève</th><th>Mode</th><th class="n">Montant</th><th>État</th><th></th></tr></thead><tbody>${journal.map(p => { const [l, c] = PAY_ST[p.statut] || PAY_ST.valide; return `<tr><td>${esc(dateLabel(p.date))}</td><td>${esc(name(p.studentId))}${isInsc(p) ? '<span class="sub"><b>Frais d\'inscription</b></span>' : ''}${p.ref ? `<span class="sub">réf. ${esc(p.ref)}</span>` : ''}</td><td>${esc(p.mode)}</td><td class="n">${fcfa(p.montant)}</td><td><span class="pill ${c}">${l}</span>${p.validePar ? `<span class="sub">${p.statut === 'rejete' ? 'rejeté' : 'validé'} par ${esc(p.validePar)}</span>` : ''}</td><td><div class="row-actions">${payOk(p) ? `<button class="btn sm" data-act="receipt" data-id="${esc(p.id)}">Reçu</button>` : ''}<button class="btn sm danger" data-act="del-payment" data-id="${esc(p.id)}">Supprimer</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Aucun paiement ce mois-ci.</p>'}
      </div>`;
  }
  function payModal(studentId) {
    const opts = S.students.filter(s => s.statut !== 'abandon').sort((a, b) => a.nom.localeCompare(b.nom));
    if (!opts.length) { toast('Inscrivez d\'abord un élève'); return; }
    const st = (studentId && S.students.find(s => s.id === studentId)) || opts[0];
    const firstUnpaid = s => { if (inscPaid(s.id) < s.tarif) return 'insc'; const ms = monthsRange(maxMonth(s.moisDebut || startMonth(), startMonth()), S.settings.finMois); return ms.find(m => paidFor(s.id, m) < dueFor(s, m)) || S.payMonth || ms[0]; };
    openModal('Encaisser un paiement', `<form class="grid2" novalidate>
        <label class="f" style="grid-column:1/-1">Élève<select id="p-st">${opts.map(s => `<option value="${esc(s.id)}" ${s.id === st.id ? 'selected' : ''}>${esc(s.nom.toUpperCase() + ' ' + s.prenom)} · ${esc(s.classe)}${s.statut === 'attente' ? ' (sans paiement)' : ''}</option>`).join('')}</select></label>
        <label class="f">Objet<select id="p-mois"><option value="insc">Frais d'inscription</option>${schoolMonths().map(m => `<option value="${m}">Mensualité · ${monthLabel(m)}</option>`).join('')}</select></label>
        <label class="f">Montant (FCFA)<input id="p-montant" type="number" min="0" step="500"></label>
        <label class="f">Mode de paiement<select id="p-mode">${MODES_ADMIN.map(m => `<option>${m}</option>`).join('')}</select></label>
        <label class="f">Date<input id="p-date" type="date" value="${today()}"></label>
        <label class="f" style="grid-column:1/-1">Référence ou note <span class="h">facultatif</span><input id="p-note"></label>
      </form><p class="small muted" id="p-info"></p><p class="err" id="p-err" hidden></p>`,
      `<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="p-save">Enregistrer · paiement validé</button>`);
    const fillAmt = () => {
      const s = S.students.find(x => x.id === $('#p-st').value); const m = $('#p-mois').value;
      if (m === 'insc') { $('#p-montant').value = Math.max(0, s.tarif - inscPaid(s.id)) || s.tarif; $('#p-info').textContent = `Frais d'inscription ${fcfaLong(s.tarif)} (même montant que la mensualité) · déjà validé : ${fcfaLong(inscPaid(s.id))}`; return; }
      $('#p-montant').value = Math.max(0, dueFor(s, m) - paidFor(s.id, m)) || dueFor(s, m);
      $('#p-info').textContent = `Mensualité ${fcfaLong(dueFor(s, m))}${dueFor(s, m) !== s.tarif ? ' (moitié du mois)' : ''} · à payer avant le ${dateLabel(deadline(s, m))} · déjà validé pour ${monthLabel(m)} : ${fcfaLong(paidFor(s.id, m))}`;
    };
    const fill = () => { const s = S.students.find(x => x.id === $('#p-st').value); $('#p-mois').value = firstUnpaid(s); fillAmt(); };
    $('#p-st').addEventListener('change', fill); $('#p-mois').addEventListener('change', fillAmt); fill();
    $('#p-save').addEventListener('click', async () => {
      const s = S.students.find(x => x.id === $('#p-st').value); const before = s.statut;
      const note = $('#p-note').value.trim(), insc = $('#p-mois').value === 'insc';
      const p = { id: uid('pay'), studentId: s.id, mois: insc ? maxMonth(s.moisDebut || startMonth(), startMonth()) : $('#p-mois').value, montant: +$('#p-montant').value || 0, mode: $('#p-mode').value, date: $('#p-date').value || today(), ref: $('#p-mode').value === 'Espèces' ? '' : note, note: insc ? (INSC_TAG + ' ' + note).trim() : note, statut: 'valide', declarePar: 'admin', createdAt: today() };
      if (p.montant <= 0) { const e = $('#p-err'); e.textContent = 'Indiquez un montant supérieur à 0.'; e.hidden = false; return; }
      $('#p-save').disabled = true;
      const r = await mutate('save', { kind: 'payments', item: p }, 'Paiement enregistré');
      if (!r) { $('#p-save').disabled = false; return; }
      closeModal(); renderAdmin();
      const after = S.students.find(x => x.id === s.id);
      if (before === 'attente' && after && after.statut === 'code') codeModalIfNew(s.id, before); else receiptModal(p.id);
    });
  }
  function receiptText(p) {
    const s = S.students.find(x => x.id === p.studentId) || { prenom: '', nom: '?', classe: '', num: '' };
    return `SIGMA CAP — Vers la réussite\nReçu de paiement\n\nÉlève : ${fullName(s)} (${s.num})\nClasse : ${s.classe}\nObjet : ${isInsc(p) ? "Frais d'inscription" : 'Mensualité de ' + monthLabel(p.mois)}\nMontant : ${fcfaLong(p.montant)}\nMode : ${p.mode}${p.ref ? ' · réf. ' + p.ref : ''}\nDate : ${dateLabel(p.date)}\nValidé par : ${p.validePar || ''}\n\nMerci de votre confiance.`;
  }
  function receiptModal(pid) {
    const p = S.payments.find(x => x.id === pid); if (!p) return;
    const s = S.students.find(x => x.id === p.studentId);
    const txt = receiptText(p); const tel = s ? waNum(s.telParent || s.telEleve) : '';
    openModal('Reçu de paiement', `${s && s.codeConf && s.statut === 'code' ? codeBox(s) : ''}<pre id="rc-text" style="white-space:pre-wrap;font:500 .95rem/1.5 var(--body);background:var(--surface-2);padding:14px;border-radius:8px;margin:0">${esc(txt)}</pre>`,
      `${tel ? `<a class="btn left" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(txt)}">Envoyer par WhatsApp</a>` : ''}<button class="btn" data-act="copy-receipt">Copier</button><button class="btn primary" data-act="close">Fermer</button>`);
  }

  /* ---------- dépenses et versements ---------- */
  function paneDepenses() {
    const months = ['tout'].concat(monthsRange(startMonth() < curMonth() ? startMonth() : curMonth(), S.settings.finMois));
    const m = S.depMonth || 'tout';
    const list = S.expenses.filter(e => m === 'tout' || mk(e.date) === m).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const f = C.finance(finData(), m === 'tout' ? '' : m);
    const byCat = C.CATS.map(c => [c, list.filter(e => e.categorie === c).reduce((a, e) => a + e.montant, 0)]).filter(x => x[1]);
    const mx = Math.max(1, ...byCat.map(x => x[1]));
    const prof = id => { const t = S.teachers.find(x => x.id === id); return t ? t.nom : ''; };
    return `<div class="toolbar">
        <select id="d-month" data-act="dep-month">${months.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${x === 'tout' ? 'Toute l\'année' : monthLabel(x)}</option>`).join('')}</select>
        <span class="grow"></span><button class="btn" data-act="new-versement">+ Versement à un prof</button><button class="btn primary" data-act="new-expense">+ Dépense</button>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="l">Encaissé (validé)</span><span class="v">${fcfa(f.encaisse)}</span></div>
        <div class="kpi"><span class="l">Frais de fonctionnement</span><span class="v">${fcfa(f.depenses)}</span></div>
        <div class="kpi"><span class="l">Versé aux profs</span><span class="v">${fcfa(f.verse)}</span></div>
        <div class="kpi ${f.encaisse - f.depenses - f.verse < 0 ? 'alert' : ''}"><span class="l">En caisse</span><span class="v">${fcfa(f.encaisse - f.depenses - f.verse)}</span></div>
      </div>
      ${byCat.length ? `<div class="panel"><h3>Par catégorie</h3>${byCat.map(([c, v]) => `<div class="bar" style="grid-template-columns:150px 1fr 90px"><span>${esc(c)}</span><span class="tr"><i style="width:${v / mx * 100}%"></i></span><b>${fcfa(v)}</b></div>`).join('')}</div>` : ''}
      ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th class="n">Montant</th><th></th></tr></thead><tbody>${list.map(e => `<tr class="click" data-act="edit-expense" data-id="${esc(e.id)}"><td>${esc(dateLabel(e.date))}</td><td>${esc(e.libelle)}${e.profId ? `<span class="sub">${esc(prof(e.profId))}</span>` : ''}${e.note ? `<span class="sub">${esc(e.note)}</span>` : ''}</td><td>${esc(e.categorie)}</td><td class="n">${fcfa(e.montant)}</td><td class="n muted">Modifier</td></tr>`).join('')}</tbody></table></div>` : '<div class="tbl-wrap"><p class="empty-state">Aucune dépense sur cette période. Ajoutez la location de salle, les photocopies, et chaque versement fait à un prof.</p></div>'}`;
  }
  function expenseModal(id, preset) {
    const e = id ? clone(S.expenses.find(x => x.id === id)) : Object.assign({ id: uid('dep'), date: today(), libelle: '', categorie: 'Location salle', montant: 0, profId: '', note: '' }, preset || {});
    const team = S.teachers.filter(t => t.statut !== 'poste à pourvoir');
    openModal(id ? 'Modifier' : (e.categorie === 'Versement prof' ? 'Versement à un prof' : 'Nouvelle dépense'), `<form class="grid2" novalidate>
      <label class="f">Catégorie<select id="e-cat">${C.CATS.map(c => `<option ${c === e.categorie ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="f" id="e-profw">Professeur<select id="e-prof">${team.map(t => `<option value="${esc(t.id)}" ${t.id === e.profId ? 'selected' : ''}>${esc(t.nom)}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:1/-1">Libellé<input id="e-lib" value="${esc(e.libelle)}" placeholder="Ex. Location salle · octobre"></label>
      <label class="f">Montant (FCFA)<input id="e-mt" type="number" min="0" step="500" value="${e.montant || ''}"></label>
      <label class="f">Date<input id="e-date" type="date" value="${esc(e.date)}"></label>
      <label class="f" style="grid-column:1/-1">Note<input id="e-note" value="${esc(e.note)}"></label>
    </form><p class="small muted" id="e-hint"></p><p class="err" id="e-err" hidden></p>`,
      `${id ? `<button class="btn danger left" data-act="del-expense" data-id="${esc(e.id)}">Supprimer</button>` : ''}<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="e-save">Enregistrer</button>`);
    const sync = () => {
      const v = $('#e-cat').value === 'Versement prof'; $('#e-profw').hidden = !v;
      if (v) { const r = C.finance(finData()).rows.find(x => x.id === $('#e-prof').value); $('#e-hint').textContent = r ? `${r.nom} : part ${fcfaLong(r.share)}, déjà versé ${fcfaLong(r.verse)}, reste ${fcfaLong(r.reste)}.` : ''; if (!$('#e-lib').value || /^Versement · /.test($('#e-lib').value)) $('#e-lib').value = 'Versement · ' + (team.find(t => t.id === $('#e-prof').value) || {}).nom; }
      else $('#e-hint').textContent = '';
    };
    $('#e-cat').addEventListener('change', sync); $('#e-prof').addEventListener('change', sync); sync();
    $('#e-save').addEventListener('click', async () => {
      const isV = $('#e-cat').value === 'Versement prof';
      Object.assign(e, { libelle: $('#e-lib').value.trim(), categorie: $('#e-cat').value, montant: +$('#e-mt').value || 0, date: $('#e-date').value || today(), note: $('#e-note').value.trim(), profId: isV ? $('#e-prof').value : '' });
      if (!e.libelle || e.montant <= 0) { const x = $('#e-err'); x.textContent = 'Indiquez un libellé et un montant.'; x.hidden = false; return; }
      if (await mutate('save', { kind: 'expenses', item: e }, isV ? 'Versement enregistré' : 'Dépense enregistrée')) { closeModal(); renderAdmin(); }
    });
  }

  /* ---------- répartition ---------- */
  function paneRepartition() {
    const d = finData();
    S.byMonth = C.financeByMonth(d);
    const f = C.finance(d, S.finMonth || '');
    const hist = S.byMonth;
    return `<div class="infobox small">Ce tableau est visible en temps réel par chaque prof dans son espace. Modifiez les parts dans « Profs & accès » (SVT : 0,5 part).</div>
      <div class="panel"><div class="toolbar"><h3 class="grow">Répartition entre intervenants</h3><button class="btn primary sm" data-act="new-versement">+ Versement à un prof</button></div>${finView(f, '', S.finMonth)}</div>
      <div class="panel"><h3>Mois par mois</h3>${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>Mois</th><th class="n">Encaissé</th><th class="n">Frais</th><th class="n">Net</th>${f.rows.map(r => `<th class="n">${esc(r.nom.replace(/^M\. (Racine )?/, ''))}</th>`).join('')}</tr></thead><tbody>
        ${hist.map(h => `<tr><td>${monthLabel(h.mois)}</td><td class="n">${fcfa(h.encaisse)}</td><td class="n">${fcfa(h.depenses)}</td><td class="n"><b>${fcfa(h.net)}</b></td>${f.rows.map(r => { const x = h.rows.find(y => y.id === r.id); return `<td class="n">${fcfa(x ? x.share : 0)}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Pas encore de paiement validé.</p>'}</div>`;
  }

  /* ---------- emploi du temps ---------- */
  function paneEdt() {
    const conf = conflicts();
    const vol = S.settings.classes.map(c => [c, MATIERES.map(m => [m, S.sessions.filter(s => s.classes.includes(c) && s.matiere === m).reduce((h, s) => h + (mins(s.fin) - mins(s.debut)) / 60, 0)]).filter(x => x[1])]);
    return `<div class="toolbar"><span class="grow muted small">Les modifications apparaissent tout de suite sur la page publique et dans les espaces.</span><button class="btn primary" data-act="new-session">+ Ajouter un cours</button></div>
      ${conf.length ? `<div class="warnbox">${conf.map(c => `${esc(c.why)} le ${c.a.jour.toLowerCase()} (${hfmt(c.a.debut)}–${hfmt(c.a.fin)} et ${hfmt(c.b.debut)}–${hfmt(c.b.fin)}).`).join('<br>')}</div>` : '<div class="infobox">Aucun conflit : aucun prof n\'a deux cours en même temps, aucune classe n\'a deux matières à la même heure.</div>'}
      <div class="week">${weekHTML(S.sessions, true)}</div>
      <div class="panel"><h3>Volume horaire hebdomadaire par classe</h3><div class="tbl-wrap" style="border:0"><table><tbody>${vol.map(([c, ms]) => `<tr><td><b>${esc(c)}</b></td><td>${ms.length ? ms.map(([m, h]) => `<span class="pill ${m}">${m} ${h} h</span>`).join(' ') : '<span class="muted">aucun cours</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function sessionModal(id) {
    const s = id ? clone(S.sessions.find(x => x.id === id)) : { id: uid('se'), jour: 'Mercredi', debut: '15:00', fin: '17:00', matiere: 'Maths', classes: [], prof: '', salle: '' };
    openModal(id ? 'Modifier le cours' : 'Nouveau cours', `<form class="grid2" novalidate>
      <label class="f">Jour<select id="c-jour">${JOURS.map(j => `<option ${j === s.jour ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
      <label class="f">Matière<select id="c-mat">${MATIERES.map(m => `<option value="${m}" ${m === s.matiere ? 'selected' : ''}>${MAT_LABEL[m]}</option>`).join('')}</select></label>
      <label class="f">Début<input id="c-deb" type="time" step="900" value="${esc(s.debut)}"></label>
      <label class="f">Fin<input id="c-fin" type="time" step="900" value="${esc(s.fin)}"></label>
      <div style="grid-column:1/-1;display:grid;gap:8px"><span style="font-weight:600;font-size:.9rem">Classes concernées</span><div class="chips" id="c-cls">${S.settings.classes.map(c => `<label class="chk"><input type="checkbox" value="${esc(c)}" ${s.classes.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div></div>
      <label class="f">Professeur<select id="c-prof"><option value="">À désigner</option>${S.teachers.map(t => `<option ${t.nom === s.prof ? 'selected' : ''}>${esc(t.nom)}</option>`).join('')}</select></label>
      <label class="f">Salle <span class="h">facultatif</span><input id="c-salle" value="${esc(s.salle)}"></label>
    </form><p class="err" id="c-err" hidden></p>`,
      `${id ? `<button class="btn danger left" data-act="del-session" data-id="${esc(s.id)}">Supprimer</button>` : ''}<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="c-save">Enregistrer</button>`);
    $('#c-save').addEventListener('click', async () => {
      Object.assign(s, { jour: $('#c-jour').value, matiere: $('#c-mat').value, debut: $('#c-deb').value, fin: $('#c-fin').value, classes: $$('#c-cls input:checked').map(i => i.value), prof: $('#c-prof').value, salle: $('#c-salle').value.trim() });
      const er = $('#c-err');
      if (!s.classes.length || !s.debut || !s.fin || mins(s.fin) <= mins(s.debut)) { er.textContent = 'Choisissez au moins une classe et une heure de fin après le début.'; er.hidden = false; return; }
      if (await mutate('save', { kind: 'sessions', item: s }, 'Cours enregistré')) { closeModal(); renderAdmin(); }
    });
  }

  /* ---------- profs et accès ---------- */
  function paneProfs() {
    const al = C.alerts(finData());
    const noPwd = S.teachers.filter(t => t.statut === 'actif' && !t.hasPwd);
    return `<div class="toolbar"><span class="grow"></span><button class="btn primary" data-act="new-teacher">+ Ajouter un prof</button></div>
      ${al.map(a => `<div class="warnbox">${esc(a.msg)}</div>`).join('')}
      ${noPwd.length ? `<div class="infobox">Sans mot de passe, ces profs ne peuvent pas ouvrir leur espace : ${noPwd.map(t => esc(t.nom)).join(', ')}. Cliquez sur leur ligne pour en définir un.</div>` : ''}
      <div class="tbl-wrap"><table><thead><tr><th>Professeur</th><th>Matière</th><th>Rôle</th><th class="n">Parts</th><th>Identifiant</th><th>Accès</th><th class="n">Heures</th><th>Statut</th></tr></thead>
      <tbody>${S.teachers.map(t => `<tr class="click" data-act="edit-teacher" data-id="${esc(t.id)}">
        <td><b>${esc(t.nom)}</b>${t.tel ? `<span class="sub num">${esc(t.tel)}</span>` : ''}${t.note ? `<span class="sub">${esc(t.note)}</span>` : ''}</td><td><span class="pill ${esc(t.matiere)}">${esc(t.matiere)}</span></td>
        <td>${t.role === 'admin' ? '<span class="pill ok">Admin</span>' : 'Prof'}</td><td class="n">${String(C.partsOf(t)).replace('.', ',')}</td>
        <td class="num">${esc(t.login) || '<span class="muted">—</span>'}</td><td>${t.hasPwd ? '<span class="pill ok">Mot de passe défini</span>' : '<span class="pill neutral">Pas de mot de passe</span>'}${t.login && t.statut !== 'poste à pourvoir' ? `<div style="margin-top:6px"><button class="btn sm" data-act="creds" data-kind="teachers" data-id="${esc(t.id)}">Envoyer les identifiants</button></div>` : ''}</td>
        <td class="n">${hoursOf(t.nom)} h</td><td><span class="pill ${PROF_STATUTS[t.statut] || 'neutral'}">${esc(t.statut)}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Les admins (rôle Admin) ont accès à toute la gestion. Les profs voient leurs cours, leurs élèves, l'état des finances et leur part.</p>`;
  }
  function teacherModal(id) {
    const t = id ? clone(S.teachers.find(x => x.id === id)) : { id: uid('t'), nom: 'M. ', matiere: 'PC', tel: '', statut: 'actif', parts: 1, role: 'prof', login: '', note: '' };
    const oldName = t.nom;
    openModal(id ? 'Modifier le prof' : 'Nouveau prof', `<form class="grid2" novalidate>
      <label class="f">Nom<input id="t-nom" value="${esc(t.nom)}"></label>
      <label class="f">Matière<select id="t-mat">${MATIERES.map(m => `<option value="${m}" ${m === t.matiere ? 'selected' : ''}>${MAT_LABEL[m]}</option>`).join('')}</select></label>
      <label class="f">Téléphone<input id="t-tel" value="${esc(t.tel)}" inputmode="tel"></label>
      <label class="f">Statut<select id="t-st">${Object.keys(PROF_STATUTS).map(k => `<option ${k === t.statut ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="f">Parts dans la répartition <span class="h">1 = part entière · 0,5 = moitié</span><input id="t-parts" type="number" min="0" step="0.25" value="${C.partsOf(t)}"></label>
      <label class="f">Rôle<select id="t-role"><option value="prof" ${t.role !== 'admin' ? 'selected' : ''}>Prof</option><option value="admin" ${t.role === 'admin' ? 'selected' : ''}>Admin (gestion complète)</option></select></label>
      <label class="f">Identifiant de connexion<input id="t-login" value="${esc(t.login)}" autocapitalize="none" placeholder="ex. sene"></label>
      <label class="f">${t.hasPwd ? 'Nouveau mot de passe' : 'Mot de passe'} <span class="h">${t.hasPwd ? 'laisser vide pour garder l\'actuel' : '4 caractères minimum'}</span><input id="t-pw" autocomplete="new-password"></label>
      <label class="f" style="grid-column:1/-1">Note<input id="t-note" value="${esc(t.note)}"></label>
    </form><p class="err" id="t-err" hidden></p>`,
      `${id ? `<button class="btn danger left" data-act="del-teacher" data-id="${esc(t.id)}">Supprimer</button>${t.login ? `<button class="btn" data-act="creds" data-kind="teachers" data-id="${esc(t.id)}">Envoyer les identifiants</button>` : ''}` : ''}<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="t-save">Enregistrer</button>`);
    $('#t-save').addEventListener('click', async () => {
      Object.assign(t, { nom: $('#t-nom').value.trim(), matiere: $('#t-mat').value, tel: $('#t-tel').value.trim(), statut: $('#t-st').value, parts: +$('#t-parts').value || 0, role: $('#t-role').value, login: $('#t-login').value.trim().toLowerCase().replace(/\s+/g, ''), note: $('#t-note').value.trim() });
      const pw = $('#t-pw').value.trim(); const er = $('#t-err');
      if (!t.nom || t.nom === 'M.') { er.textContent = 'Indiquez le nom.'; er.hidden = false; return; }
      if (pw && !t.login) { er.textContent = 'Choisissez un identifiant pour ce mot de passe.'; er.hidden = false; return; }
      if (pw && pw.length < 4) { er.textContent = 'Mot de passe : 4 caractères minimum.'; er.hidden = false; return; }
      const item = clone(t); delete item.hasPwd; if (pw) item._pwd = pw;
      if (!(await mutate('save', { kind: 'teachers', item }, 'Prof enregistré'))) return;
      if (id && oldName !== t.nom) { for (const s of S.sessions.filter(s => s.prof === oldName)) { s.prof = t.nom; await mutate('save', { kind: 'sessions', item: s }); } }
      closeModal(); renderAdmin();
    });
  }

  /* ---------- paramètres ---------- */
  function paneParams() {
    const st = S.settings;
    return `<div class="panel"><h3>Lien public</h3>
        <p class="muted small">À partager sur WhatsApp, Facebook ou dans les classes. Sur téléphone, « Ajouter à l'écran d'accueil » installe l'application.</p>
        <div class="toolbar"><input class="grow" readonly value="${esc(pubLink())}" id="pub-link"><button class="btn" data-act="copy-link">Copier</button></div>
        <p class="muted small">Élèves, profs et admins se connectent avec le bouton « Mon espace ».</p>
        ${S.sheetUrl ? `<p class="small"><a href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">Ouvrir le Google Sheet des données</a></p>` : ''}</div>
      <form class="panel" id="prm" novalidate><h3>Informations générales</h3>
        <div class="grid2">
          <label class="f">Année scolaire<input id="g-annee" value="${esc(st.annee)}"></label>
          <label class="f">Début des cours<input id="g-debut" type="date" value="${esc(st.debut)}"></label>
          <label class="f">Dernier mois facturé<input id="g-fin" type="month" value="${esc(st.finMois)}"></label>
          <label class="f">Lieu<input id="g-lieu" value="${esc(st.lieu)}"></label>
          <label class="f">Jours (affichage)<input id="g-jours" value="${esc(st.jours)}"></label>
          <label class="f">Date limite de paiement <span class="h">jour du mois (la mensualité du mois se paie au plus tard ce jour-là)</span><input id="g-jl" type="number" min="1" max="28" value="${limitDay()}"></label>
          <label class="f">Inscriptions en ligne<select id="g-open"><option value="1" ${st.inscriptionsOuvertes ? 'selected' : ''}>Ouvertes</option><option value="0" ${st.inscriptionsOuvertes ? '' : 'selected'}>Fermées</option></select></label>
          ${st.contacts.map((c, i) => `<label class="f">Contact ${i + 1}<input id="g-cn${i}" value="${esc(c.nom)}"></label><label class="f">Téléphone ${i + 1}<input id="g-ct${i}" value="${esc(c.tel)}"></label>`).join('')}
        </div>
        <h3 style="margin-top:8px">Tarifs (FCFA / mois) et seuils</h3>
        <div class="tbl-wrap"><table><thead><tr><th>Classe</th><th class="n">Maths</th><th class="n">PC</th><th class="n">SVT</th><th class="n">Prix du pack</th><th>Matières du pack</th><th class="n">Seuil élèves</th></tr></thead><tbody>
          ${st.classes.map((c, i) => { const t = st.tarifs[c]; return `<tr><td><b>${esc(c)}</b></td>${MATIERES.map(m => `<td class="n"><input style="width:96px;text-align:right" type="number" step="500" min="0" id="tf-${i}-${m}" value="${t.seules[m] != null ? t.seules[m] : ''}" placeholder="—"></td>`).join('')}
            <td class="n"><input style="width:104px;text-align:right" type="number" step="500" min="0" id="tp-${i}" value="${t.pack ? t.pack.prix : ''}"></td>
            <td class="small">${t.pack ? t.pack.matieres.join(' + ') : '—'}</td>
            <td class="n"><input style="width:72px;text-align:right" type="number" min="1" step="1" id="ts-${i}" value="${(st.seuils || {})[c] || 6}"></td></tr>`; }).join('')}
        </tbody></table></div>
        <p class="muted small">Seuil élèves : au-delà, l'appli propose de trouver un nouveau prof ou d'ouvrir un 2e groupe. Une case de tarif vide = matière non proposée. Les nouveaux tarifs valent pour les nouvelles inscriptions.</p>
        <label class="f">Comment payer (affiché aux élèves)<textarea id="g-pay" rows="2">${esc(st.paiement)}</textarea></label>
        <label class="f">Message de relance WhatsApp <span class="h">{eleve}, {classe}, {mois} et {reste} sont remplacés automatiquement</span><textarea id="g-rel" rows="3">${esc(st.relance)}</textarea></label>
        <div><button class="btn primary" type="submit">Enregistrer les paramètres</button></div>
      </form>
      <div class="panel"><h3>Exports</h3><div class="toolbar"><button class="btn" data-act="csv-students">Liste des élèves (CSV)</button><button class="btn" data-act="csv-payments">Paiements (CSV)</button></div>
        ${LIVE ? '<p class="muted small">Toutes les données sont aussi visibles directement dans le Google Sheet.</p>' : `<p class="muted small">Mode démo : rien n'est envoyé en ligne.</p><div><button class="btn danger" data-act="reset-demo">Réinitialiser la démo</button></div>`}
      </div>`;
  }
  function bindParams() {
    $('#prm').addEventListener('submit', async e => {
      e.preventDefault();
      const st = clone(S.settings); const v = i => $(i).value.trim();
      Object.assign(st, { annee: v('#g-annee'), debut: v('#g-debut'), finMois: v('#g-fin'), lieu: v('#g-lieu'), jours: v('#g-jours'), inscriptionsOuvertes: v('#g-open') === '1', jourLimite: Math.min(28, Math.max(1, +v('#g-jl') || 5)), relance: $('#g-rel').value, paiement: $('#g-pay').value.trim() });
      st.contacts = st.contacts.map((c, i) => ({ nom: v('#g-cn' + i), tel: v('#g-ct' + i) }));
      st.seuils = st.seuils || {};
      st.classes.forEach((c, i) => {
        const t = st.tarifs[c]; const seules = {};
        MATIERES.forEach(m => { const x = $('#tf-' + i + '-' + m).value; if (x !== '') seules[m] = +x; });
        t.seules = seules; const pp = $('#tp-' + i).value;
        t.pack = pp === '' ? null : { matieres: (t.pack && t.pack.matieres.length ? t.pack.matieres : Object.keys(seules)).filter(m => seules[m] != null), prix: +pp };
        st.seuils[c] = Math.max(1, +$('#ts-' + i).value || 6);
      });
      if (await mutate('saveSettings', { settings: st }, 'Paramètres enregistrés')) renderPane();
    });
  }

  /* ---------- envoi des identifiants (prof, élève ou parent) ---------- */
  const newPwd = () => { const A = 'abcdefghjkmnpqrstuvwxyz', D = '23456789'; let p = ''; for (let i = 0; i < 4; i++) p += A[Math.floor(Math.random() * A.length)]; for (let i = 0; i < 3; i++) p += D[Math.floor(Math.random() * D.length)]; return p; };
  function credText(kind, o, pw, dest) {
    const link = pubLink() + '#espace';
    if (kind === 'teachers') return `Sigma Cap — votre accès professeur\n\nBonjour ${o.nom},\nSite : ${link}\nIdentifiant : ${o.login}\nMot de passe : ${pw}\n\nDans votre espace : vos cours, le suivi des notes de vos élèves et votre part. Pensez à changer le mot de passe à la première connexion (bouton « Mot de passe »).`;
    const code = o.statut === 'code' && o.codeConf ? `\nCode de confirmation : ${o.codeConf} (à saisir une seule fois dans l'espace)` : '';
    const hello = dest === 'parent' ? `Bonjour${o.parentNom ? ' ' + o.parentNom : ''}, voici l'accès à l'espace Sigma Cap de ${fullName(o)} (${o.classe}).` : `Bonjour ${o.prenom}, voici ton accès à ton espace Sigma Cap (${o.classe}).`;
    return `Sigma Cap — identifiants\n\n${hello}\nSite : ${link}\nIdentifiant : ${o.num}\nMot de passe : ${pw}${code}\n\nDans l'espace : paiements, emploi du temps, notes et progression. ${dest === 'parent' ? 'Pensez' : 'Pense'} à changer le mot de passe à la première connexion (bouton « Mot de passe »).`;
  }
  function credModal(kind, id) {
    const o = (kind === 'teachers' ? S.teachers : S.students).find(x => x.id === id); if (!o) return;
    if (kind === 'students' && !isActive(o)) { toast('Disponible après validation du premier paiement'); return; }
    if (kind === 'teachers' && !o.login) { toast("Donnez d'abord un identifiant à ce prof"); return; }
    const dests = kind === 'teachers' ? [['prof', o.tel, o.nom]] : [['eleve', o.telEleve, "l'élève"], ['parent', o.telParent, 'le parent' + (o.parentNom ? ' (' + o.parentNom + ')' : '')]];
    const firstDest = (dests.find(d => waNum(d[1])) || dests[0])[0];
    const pw0 = newPwd();
    openModal('Envoyer les identifiants · ' + (kind === 'teachers' ? o.nom : fullName(o)), `<form class="grid2" novalidate>
        <label class="f">Destinataire<select id="k-dest">${dests.map(([k, tel, lab]) => `<option value="${k}" ${k === firstDest ? 'selected' : ''} ${waNum(tel) ? '' : 'disabled'}>${esc(lab)} · ${tel ? esc(tel) : 'pas de numéro'}</option>`).join('')}</select></label>
        <label class="f">Nouveau mot de passe <span class="h">généré, modifiable (4 caractères min.)</span><input id="k-pw" value="${pw0}" autocomplete="off"></label>
        <label class="f" style="grid-column:1/-1">Message<textarea id="k-txt" rows="9"></textarea></label>
      </form>
      <p class="infobox small">Les mots de passe sont enregistrés chiffrés : on ne peut pas renvoyer l'ancien. L'envoi <b>remplace</b> donc le mot de passe actuel par celui-ci${kind === 'students' ? ' (le même sert à l\'élève et au parent)' : ''}.</p><p class="err" id="k-err" hidden></p>`,
      `<span class="left" id="k-links"></span><button class="btn" data-act="close">Annuler</button><button class="btn primary" id="k-save">Enregistrer et préparer l'envoi</button>`);
    const fill = () => { $('#k-txt').value = credText(kind, o, $('#k-pw').value.trim(), $('#k-dest').value); };
    $('#k-dest').addEventListener('change', fill); $('#k-pw').addEventListener('input', fill); fill();
    $('#k-save').addEventListener('click', async () => {
      const pw = $('#k-pw').value.trim(), er = $('#k-err');
      if (pw.length < 4) { er.textContent = 'Mot de passe : 4 caractères minimum.'; er.hidden = false; return; }
      const d = dests.find(x => x[0] === $('#k-dest').value); const tel = waNum(d && d[1]);
      if (!tel) { er.textContent = 'Pas de numéro de téléphone pour ce destinataire : ajoutez-le dans la fiche.'; er.hidden = false; return; }
      $('#k-save').disabled = true;
      const r = await mutate('save', { kind, item: { id: o.id, _pwd: pw } }, 'Mot de passe enregistré');
      if (!r) { $('#k-save').disabled = false; return; }
      const txt = $('#k-txt').value;
      $('#k-save').style.display = 'none'; er.hidden = true;
      $('#k-links').innerHTML = `<a class="btn go" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(txt)}">Envoyer par WhatsApp</a> <a class="btn" href="sms:+${tel}?&body=${encodeURIComponent(txt)}">Par SMS</a> <button class="btn" type="button" data-act="copy-code" data-v="${esc(txt)}">Copier</button>`;
      if (S.role === 'admin') renderPane();
    });
  }

  /* ---------- rappels et avertissements ---------- */
  function avisText(s, type) {
    const b = balance(s);
    const de = m => (/^[aeiouéèh]/i.test(monthLabel(m)) ? "d'" : 'de ') + monthLabel(m);
    const mens = b.late.length === 1 ? 'la mensualité ' + de(b.late[0]) : b.late.length > 1 ? 'les mensualités ' + b.late.map(de).join(', ').replace(/, ([^,]*)$/, ' et $1') : '';
    const quoi = [mens, b.inscReste ? "les frais d'inscription" : ''].filter(Boolean).join(' ainsi que ') || 'la mensualité ' + de(curMonth());
    if (type === 'avertissement') return `Avertissement : malgré nos rappels, il reste toujours à régler pour ${fullName(s)} (${s.classe}) ${quoi}, soit ${fcfaLong(b.reste)}. Merci de régulariser sans délai ou de nous contacter.`;
    return `Rappel : il reste à régler pour ${fullName(s)} (${s.classe}) ${quoi}, soit ${fcfaLong(b.reste)}. La mensualité se paie au plus tard le ${limitDay()} de chaque mois. Merci de régulariser rapidement.`;
  }
  function avisModal(id) {
    const s = S.students.find(x => x.id === id); if (!s) return;
    const b = balance(s); const tel = waNum(s.telParent || s.telEleve);
    openModal('Message à ' + fullName(s), `<form class="grid2" novalidate>
        <label class="f">Type<select id="a-type"><option value="rappel">Rappel</option><option value="avertissement" ${b.late.length > 1 ? 'selected' : ''}>Avertissement</option></select></label>
        <div class="f"><span class="small muted">${b.late.length ? b.late.length + ' mois en retard' : 'Pas de mois en retard'}${b.inscReste ? ' · inscription non réglée' : ''} · reste ${fcfaLong(b.reste)}</span></div>
        <label class="f" style="grid-column:1/-1">Message <span class="h">modifiable</span><textarea id="a-txt" rows="5"></textarea></label>
      </form><p class="small muted">Le message s'affiche en haut de l'espace de l'élève (et du parent). Vous pouvez aussi l'envoyer par WhatsApp${tel ? ' au ' + esc(s.telParent || s.telEleve) : ''}.</p><p class="err" id="a-err" hidden></p>`,
      `${tel ? '<a class="btn left" id="a-wa" target="_blank" rel="noopener" href="#">Envoyer aussi par WhatsApp</a>' : ''}<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="a-save">Afficher dans son espace</button>`);
    const syncWa = () => { const a = $('#a-wa'); if (a) a.href = `https://wa.me/${tel}?text=${encodeURIComponent('Sigma Cap — ' + $('#a-txt').value)}`; };
    const fillTxt = () => { $('#a-txt').value = avisText(s, $('#a-type').value); syncWa(); };
    $('#a-type').addEventListener('change', fillTxt); $('#a-txt').addEventListener('input', syncWa); fillTxt();
    $('#a-save').addEventListener('click', async () => {
      const texte = $('#a-txt').value.trim(); const er = $('#a-err');
      if (texte.length < 5) { er.textContent = 'Écrivez le message.'; er.hidden = false; return; }
      const a = { id: uid('avis'), type: $('#a-type').value, texte, date: today(), par: S.me ? S.me.nom : '' };
      const list = avisOf(s).concat(a).slice(-10);
      $('#a-save').disabled = true;
      const r = await mutate('save', { kind: 'students', item: { id: s.id, avis: JSON.stringify(list) } });
      if (!r) { $('#a-save').disabled = false; return; }
      const after = S.students.find(x => x.id === s.id);
      if (LIVE && !avisOf(after).some(x => x.id === a.id)) { er.innerHTML = "Le serveur n'a pas gardé le message : il faut d'abord ajouter la colonne « avis » dans le script Google (voir les instructions de mise à jour)."; er.hidden = false; $('#a-save').disabled = false; return; }
      closeModal(); renderAdmin(); toast('Message affiché dans son espace');
    });
  }

  function pwdModal() {
    openModal('Changer mon mot de passe', `<form class="grid2" novalidate>
      <label class="f">Mot de passe actuel<input id="w-old" type="password" autocomplete="current-password"></label>
      <label class="f">Nouveau mot de passe<input id="w-new" type="password" autocomplete="new-password"></label>
    </form><p class="err" id="w-err" hidden></p>`, `<button class="btn" data-act="close">Annuler</button><button class="btn primary" id="w-save">Changer</button>`);
    $('#w-save').addEventListener('click', async () => {
      try { await call('changePwd', { old: $('#w-old').value, password: $('#w-new').value }); closeModal(); toast('Mot de passe changé'); }
      catch (x) { const e = $('#w-err'); e.textContent = x.message; e.hidden = false; }
    });
  }

  /* ---------- modale et confirmation ---------- */
  function openModal(title, body, foot) {
    $('#modal-root').innerHTML = `<div class="overlay" data-act="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h3>${esc(title)}</h3><button class="btn sm ghost" data-act="close" aria-label="Fermer">✕</button></header>${body}<footer>${foot}</footer></div></div>`;
    const first = $('#modal-root input:not([readonly]), #modal-root select'); if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  function confirmThen(btn, label, fn) {
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 4000);
  }
  async function removeItem(kind, id, msg) { if (await mutate('remove', { kind, id }, msg)) { closeModal(); renderAdmin(); } }

  /* ---------- actions (délégation) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act], [data-scroll]'); if (!el) return;
    if (el.dataset.scroll) { e.preventDefault(); const t = document.getElementById(el.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const a = el.dataset.act, id = el.dataset.id;
    if (a === 'overlay') { if (e.target === el) closeModal(); return; }
    if (el.tagName === 'A' && !el.getAttribute('target')) e.preventDefault();
    switch (a) {
      case 'pubclass': S.pubClass = el.dataset.v; { const y = window.scrollY; renderPublic(); window.scrollTo(0, y); } break;
      case 'to-public': try { history.pushState('', document.title, location.pathname + location.search); } catch (_) { location.hash = ''; } route(); window.scrollTo(0, 0); break;
      case 'tab': closeModal(); S.tab = el.dataset.v; renderAdmin(); window.scrollTo(0, 0); break;
      case 'ptab': S.ptab = el.dataset.v; renderProf(); break;
      case 'logout': logout(); break;
      case 'refresh': await refresh(true); break;
      case 'pwd': pwdModal(); break;
      case 'close': closeModal(); break;
      case 'declare': declareModal(); break;
      case 'new-student': studentModal(); break;
      case 'edit-student': studentModal(id); break;
      case 'del-student': confirmThen(el, 'Confirmer la suppression', () => removeItem('students', id, 'Élève supprimé')); break;
      case 'pay': closeModal(); payModal(id); break;
      case 'val-pay': case 'rej-pay': {
        const p = S.payments.find(x => x.id === id); const s = p && S.students.find(x => x.id === p.studentId); const before = s && s.statut;
        el.disabled = true;
        if (await mutate('validatePay', { id, ok: a === 'val-pay' }, a === 'val-pay' ? 'Paiement validé' : 'Paiement rejeté')) { renderAdmin(); if (a === 'val-pay' && s) codeModalIfNew(s.id, before); }
        else el.disabled = false;
        break;
      }
      case 'receipt': receiptModal(id); break;
      case 'paytab': { S.payTab = el.dataset.v; const w = el.closest('.paytabs'); if (w) w.outerHTML = payTabsHTML(); break; }
      case 'share': closeModal(); shareModal(); break;
      case 'avis': closeModal(); avisModal(id); break;
      case 'creds': closeModal(); credModal(el.dataset.kind, id); break;
      case 'add-note': addNoteModal(); break;
      case 'del-note': confirmThen(el, 'Supprimer ?', async () => {
        try { applyData(await call('delNote', { id })); toast('Note supprimée'); renderEleve(); } catch (x) { if (/Session expirée/.test(x.message)) return expired(); toast(x.message); }
      }); break;
      case 'suivi': suiviModal(id, el.dataset.v); break;
      case 'quick-com': { const t = $('#c-txt'); if (t) { t.value = (t.value ? t.value.trim() + ' ' : '') + el.dataset.v; t.focus(); } break; }
      case 'del-com': confirmThen(el, 'Confirmer', async () => {
        try { applyData(await call('delComment', { studentId: id, id: el.dataset.v })); toast('Commentaire retiré'); rerender(); suiviModal(id, el.dataset.m); } catch (x) { if (/Session expirée/.test(x.message)) return expired(); toast(x.message); }
      }); break;
      case 'del-avis': confirmThen(el, 'Confirmer', async () => {
        const s = S.students.find(x => x.id === id); if (!s) return;
        if (await mutate('save', { kind: 'students', item: { id, avis: JSON.stringify(avisOf(s).filter(a => a.id !== el.dataset.v)) } }, 'Message retiré')) { closeModal(); renderAdmin(); studentModal(id); }
      }); break;
      case 'mark-insc': {
        const p = S.payments.find(x => x.id === id); if (!p) break;
        if (await mutate('save', { kind: 'payments', item: { id, note: (INSC_TAG + ' ' + (p.note || '')).trim() } }, 'Paiement compté comme frais d\'inscription')) { closeModal(); renderAdmin(); studentModal(p.studentId); }
        break;
      }
      case 'copy-receipt': copy($('#rc-text').textContent); break;
      case 'del-payment': confirmThen(el, 'Confirmer', () => removeItem('payments', id, 'Paiement supprimé')); break;
      case 'new-expense': expenseModal(); break;
      case 'new-versement': expenseModal(null, { categorie: 'Versement prof', profId: (S.teachers.find(t => t.statut === 'actif') || {}).id || '' }); break;
      case 'edit-expense': expenseModal(id); break;
      case 'del-expense': confirmThen(el, 'Confirmer la suppression', () => removeItem('expenses', id, 'Supprimé')); break;
      case 'new-session': sessionModal(); break;
      case 'edit-session': sessionModal(id); break;
      case 'del-session': confirmThen(el, 'Confirmer la suppression', () => removeItem('sessions', id, 'Cours supprimé')); break;
      case 'new-teacher': teacherModal(); break;
      case 'edit-teacher': teacherModal(id); break;
      case 'del-teacher': confirmThen(el, 'Confirmer la suppression', () => removeItem('teachers', id, 'Prof supprimé')); break;
      case 'copy-link': copy($('#pub-link').value); break;
      case 'copy-code': copy(el.dataset.v); break;
      case 'csv-students': downloadCSV('sigma-eleves.csv', [['N°', 'Prénom', 'Nom', 'Sexe', 'Classe', 'École', 'Tél. élève', 'Parent', 'Tél. parent', 'Matières', 'Note Maths', 'Note PC', 'Note SVT', 'Mensualité', 'Statut', 'Inscrit le', 'Reste dû']].concat(S.students.map(s => [s.num, s.prenom, s.nom, s.sexe, s.classe, s.etablissement, s.telEleve, s.parentNom, s.telParent, s.matieres.join(' + '), s.notesMaths, s.notesPC, s.notesSVT, s.tarif, (STATUTS[s.statut] || [''])[0], s.createdAt, balance(s).reste]))); toast('Export lancé'); break;
      case 'csv-payments': downloadCSV('sigma-paiements.csv', [['Date', 'N°', 'Élève', 'Classe', 'Mois', 'Montant', 'Mode', 'Référence', 'État', 'Validé par']].concat(S.payments.map(p => { const s = S.students.find(x => x.id === p.studentId) || {}; return [p.date, s.num, s.prenom ? fullName(s) : '', s.classe, p.mois, p.montant, p.mode, p.ref, (PAY_ST[p.statut] || [''])[0], p.validePar]; }))); toast('Export lancé'); break;
      case 'reset-demo': confirmThen(el, 'Confirmer : tout effacer', () => { try { localStorage.removeItem(DEMO_KEY); } catch (_) { } demoDB = null; demoHandle = null; logout(true); toast('Démo réinitialisée'); }); break;
    }
  });
  document.addEventListener('change', e => {
    const a = e.target.dataset && e.target.dataset.act;
    if (a === 'pay-month') { S.payMonth = e.target.value; renderPane(); }
    if (a === 'dep-month') { S.depMonth = e.target.value; renderPane(); }
    if (a === 'sf-classe' || a === 'sf-mat') { S.suiviFilter[a === 'sf-classe' ? 'classe' : 'mat'] = e.target.value; rerender(); }
    if (a === 'fin-month') { S.finMonth = e.target.value; S.role === 'prof' ? renderProf() : renderPane(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ---------- temps réel : actualisation automatique ---------- */
  async function refresh(manual) {
    if (!S.token) return;
    try {
      applyData(await call('data'));
      const y = window.scrollY; renderSpace(); window.scrollTo(0, y);
      if (manual) toast('Données à jour');
    } catch (x) { if (/Session expirée/.test(x.message)) expired(); else if (manual) toast(x.message); }
  }
  setInterval(() => {
    const busy = $('#modal-root').innerHTML || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
    if (S.role && location.hash === '#espace' && document.visibilityState === 'visible' && !busy) refresh(false);
  }, 45000);

  /* ---------------- routage & démarrage ---------------- */
  function renderSpace() {
    if (S.role === 'admin') renderAdmin();
    else if (S.role === 'prof') renderProf();
    else if (S.role === 'eleve') renderEleve();
    else renderLogin();
  }
  function route() {
    closeModal();
    if (location.hash === '#admin') { try { history.replaceState(null, '', '#espace'); } catch (_) { } }
    if (location.hash === '#espace' || location.hash === '#admin') renderSpace();
    else renderPublic();
  }
  window.addEventListener('hashchange', route);

  async function boot() {
    if (window.SIGMA_PAGE && location.hash !== '#espace') { try { history.replaceState(null, '', '#espace'); } catch (_) { location.hash = '#espace'; } }
    route();
    try { applyData(await call('config')); } catch (e) { /* hors ligne : valeurs par défaut */ }
    let tok = ''; try { tok = localStorage.getItem(SKEY) || ''; } catch (_) { }
    if (tok) { S.token = tok; try { applyData(await call('data')); } catch (_) { S.token = ''; try { localStorage.removeItem(SKEY); } catch (__) { } } }
    const reg = $('#reg'); const typing = reg && document.activeElement && reg.contains(document.activeElement);
    if (location.hash === '#espace') route();
    else if (!typing) { const y = window.scrollY; renderPublic(); window.scrollTo(0, y); }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
    try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (_) { }
  }
  boot();
})();
