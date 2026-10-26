/* Sigma Cap — « Apprendre » : cours complets, quiz, exercices corrigés automatiquement et évaluations type.
   Le contenu de chaque classe est dans contenu/<classe>.js (window.SIGMA_CONTENU[classe]).
   Les corrections des évaluations y sont chiffrées (AES-GCM) : la clé n'arrive du serveur qu'après déblocage par l'admin. */
window.SigmaLearn = (function () {
  'use strict';
  const DISPO = ['2nde S'];                       // classes dont le contenu est prêt
  const VERSION = '202610262019';
  let ctx = null;
  const L = { classe: '', chap: 0, tab: 'cours', evalOpen: {}, evalShow: {}, plain: {} };

  const slug = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const has = c => DISPO.includes(c);
  const data = c => (window.SIGMA_CONTENU || {})[c];

  /* ---------- chargements ---------- */
  function script(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Chargement impossible : vérifie ta connexion.')); document.head.appendChild(s); }); }
  function load(c) { if (data(c)) return Promise.resolve(data(c)); return script('contenu/' + slug(c) + '.js?v=' + VERSION).then(() => data(c)); }
  let katexP = null;
  function katex() {
    if (katexP) return katexP;
    const base = 'vendor/katex/';
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'katex.min.css'; document.head.appendChild(l);
    katexP = script(base + 'katex.min.js').then(() => script(base + 'contrib/auto-render.min.js')).catch(() => null);
    return katexP;
  }
  function maths(el) {
    if (!el) return;
    katex().then(() => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false }); });
  }

  /* ---------- progression (propre à ce navigateur) ---------- */
  const PKEY = c => 'sigma-learn-' + slug(c);
  function prog(c) { try { return JSON.parse(localStorage.getItem(PKEY(c)) || '{}') || {}; } catch (_) { return {}; } }
  function saveProg(c, p) { try { localStorage.setItem(PKEY(c), JSON.stringify(p)); } catch (_) { } }

  /* ---------- correction automatique ---------- */
  function num(str) {
    let t = String(str == null ? '' : str).trim().toLowerCase();
    if (!t) return NaN;
    t = t.replace(/\s+/g, '').replace(/,/g, '.').replace(/[×x·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
      .replace(/sqrt|racine|√/g, 'R').replace(/π|pi/g, '(P)');
    t = t.replace(/R(\d+(?:\.\d+)?)/g, 'R($1)');
    t = t.replace(/(\d|\)|P)(?=[(R])/g, '$1*').replace(/\)(?=\d)/g, ')*');
    if (!/^[0-9.+\-*/^()RP]+$/.test(t)) return NaN;
    t = t.replace(/\^/g, '**').replace(/R/g, 'Math.sqrt').replace(/P/g, 'Math.PI');
    try { const v = Function('"use strict";return (' + t + ');')(); return typeof v === 'number' && isFinite(v) ? v : NaN; } catch (_) { return NaN; }
  }
  const same = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  function list(str) {
    const t = String(str || '').replace(/[{}]/g, '').trim();
    if (/^(∅|vide|aucune?|ø|\{\})$/i.test(t) || t === '') return [];
    return t.split(/[;|]/).map(num);
  }
  function check(q, val) {
    if (q.type === 'qcm') return +val === +q.rep;
    if (q.type === 'ensemble') {
      const a = list(val), b = (q.rep || []).map(num);
      if (a.some(isNaN) || a.length !== b.length) return false;
      const sa = a.slice().sort((x, y) => x - y), sb = b.slice().sort((x, y) => x - y);
      return sa.every((x, i) => same(x, sb[i]));
    }
    const v = num(val); if (isNaN(v)) return null;
    const reps = Array.isArray(q.rep) ? q.rep : [q.rep];
    return reps.some(r => same(v, num(r)));
  }

  /* ---------- déchiffrement ---------- */
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decrypt(enc, key) {
    const k = await crypto.subtle.importKey('raw', b64(key), 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, k, b64(enc.ct));
    return new TextDecoder().decode(pt);
  }
  const keyOf = id => (ctx.S.cles || {})[id];
  const unlocked = id => ((ctx.S.settings || {}).debloques || []).includes(id);

  /* ---------- vues ---------- */
  function shell(c, inner) {
    const who = ctx.S.role === 'eleve' ? (ctx.S.me.prenom || '') : (ctx.S.me ? ctx.S.me.nom : '');
    return `<div class="admin-shell learn"><header class="admin-top"><div class="wrap">
      <a class="brand" href="#espace"><img class="mk" src="img/mark.png" alt=""><span><b>Mon cours en ligne</b><small>${esc(c)}${who ? ' · ' + esc(who) : ''}</small></span></a>
      <div class="sp">${ctx.S.role !== 'eleve' ? `<select id="lr-classe" aria-label="Classe">${DISPO.map(x => `<option ${x === c ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}<a class="btn sm" href="#espace">← Mon espace</a></div>
    </div></header><main class="wrap admin-main" id="lr-main">${inner}</main></div>`;
  }

  async function render() {
    const S = ctx.S, app = $('#app');
    if (!S.role) { location.hash = '#espace'; return; }
    const c = S.role === 'eleve' ? S.me.classe : (L.classe && has(L.classe) ? L.classe : DISPO[0]);
    L.classe = c;
    L.evalOpen = {}; L.evalShow = {};
    if (!has(c)) { app.innerHTML = shell(c, `<div class="panel"><h3>Bientôt disponible</h3><p>Le cours en ligne de la classe ${esc(c)} est en préparation. Reviens très vite~!</p></div>`.replace('~', '')); return; }
    if (S.role === 'eleve' && !ctx.isActive(S.me)) { app.innerHTML = shell(c, `<div class="panel callout warn"><h3>Encore une étape</h3><p>Les cours, quiz, exercices et évaluations en ligne s'ouvrent dès que ton inscription est confirmée (paiement validé).</p></div>`); return; }
    app.innerHTML = shell(c, `<div class="panel"><p class="muted">Chargement du cours…</p></div>`);
    let d; try { d = await load(c); } catch (e) { $('#lr-main').innerHTML = `<div class="panel callout bad"><p>${esc(e.message)}</p></div>`; return; }
    if (!d) { $('#lr-main').innerHTML = `<div class="panel"><p>Contenu introuvable.</p></div>`; return; }
    draw(d);
    const sel = $('#lr-classe'); if (sel) sel.addEventListener('change', () => { L.classe = sel.value; L.chap = 0; render(); });
  }

  function draw(d) {
    const main = $('#lr-main'); if (!main) return;
    const p = prog(L.classe);
    const ch = d.chapitres[L.chap] || d.chapitres[0];
    const nav = `<nav class="lr-chaps" aria-label="Chapitres">
      ${d.chapitres.map((x, i) => { const pq = p['q-' + x.id], pe = p['e-' + x.id] || {}; const ne = Object.keys(pe).length;
        return `<button type="button" data-lr="chap" data-v="${i}" aria-pressed="${L.tab !== 'evals' && i === L.chap}"><span class="n">${i + 1}</span><span class="t">${esc(x.titre)}</span><span class="s">${pq != null ? `Quiz ${pq}/${x.quiz.length}` : ''}${ne ? ` · ${ne}/${x.exos.length} exos` : ''}</span></button>`; }).join('')}
      <button type="button" class="lr-ev" data-lr="tab" data-v="evals" aria-pressed="${L.tab === 'evals'}"><span class="n">★</span><span class="t">Évaluations type · 1er semestre</span><span class="s">${d.evals.length} sujets corrigés</span></button>
    </nav>`;
    let body;
    if (L.tab === 'evals') body = evalsHTML(d);
    else body = `<div class="lr-head"><p class="eyebrow">Chapitre ${L.chap + 1}</p><h2>${esc(ch.titre)}</h2>${ch.resume ? `<p class="muted">${esc(ch.resume)}</p>` : ''}
        <div class="seg lr-tabs" role="tablist">${[['cours', '📘 Cours'], ['quiz', '❓ Quiz'], ['exos', '✏️ Exercices']].map(([k, l]) => `<button type="button" role="tab" data-lr="tab" data-v="${k}" aria-pressed="${L.tab === k}">${l}</button>`).join('')}</div></div>
      <div id="lr-body">${L.tab === 'quiz' ? quizHTML(ch) : L.tab === 'exos' ? exosHTML(ch) : `<article class="panel lr-cours">${ch.cours}</article>`}</div>`;
    main.innerHTML = `<div class="lr-grid">${nav}<section class="lr-content">${body}</section></div>`;
    maths(main);
    bind(d, ch);
  }

  /* quiz */
  function quizHTML(ch) {
    return `<div class="panel"><p class="small muted" style="margin:0 0 10px">Clique sur une réponse : la correction s'affiche aussitôt. Score sauvegardé sur ce téléphone.</p>
      <ol class="lr-quiz">${ch.quiz.map((q, i) => `<li data-qi="${i}"><div class="lr-q">${q.q}</div>
        <div class="lr-choix">${q.choix.map((c, j) => `<button type="button" class="btn" data-lr="qrep" data-q="${i}" data-v="${j}">${c}</button>`).join('')}</div>
        <div class="lr-expl" hidden></div></li>`).join('')}</ol>
      <div class="lr-score" id="lr-score" hidden></div>
      <div class="toolbar" style="margin-top:10px"><button type="button" class="btn" data-lr="qreset">Recommencer le quiz</button></div></div>`;
  }

  /* exercices */
  function exosHTML(ch) {
    const done = prog(L.classe)['e-' + ch.id] || {};
    const f = L.exoFiltre || 'tous';
    const keep = e => f === 'tous' || (f === 'demo' ? e.demo : (!e.demo && e.niveau === +f));
    const nb = { tous: ch.exos.length, demo: ch.exos.filter(e => e.demo).length, 1: 0, 2: 0, 3: 0 };
    ch.exos.forEach(e => { if (!e.demo) nb[e.niveau] = (nb[e.niveau] || 0) + 1; });
    const ok = Object.keys(done).length;
    const bar = `<div class="panel lr-exbar"><div class="toolbar"><div class="grow"><b>Série de ${ch.exos.length} exercices</b><span class="small muted"> · ${ok} réussi${ok > 1 ? 's' : ''}</span>
        <div class="lr-prog"><i style="width:${Math.round(ok / ch.exos.length * 100)}%"></i></div></div></div>
      <div class="seg" role="group" aria-label="Filtrer">${[['tous', 'Tous'], ['1', '★ Application'], ['2', '★★ Entraînement'], ['3', '★★★ Approfondissement'], ['demo', '✍️ Démonstrations']].map(([k, l]) => `<button type="button" data-lr="efilt" data-v="${k}" aria-pressed="${f === k}">${l} (${nb[k] || 0})</button>`).join('')}</div></div>`;
    return bar + ch.exos.map((e, i) => keep(e) ? `<article class="panel lr-exo${e.demo ? ' lr-demo' : ''}" data-ei="${i}">
      <div class="toolbar"><h3 class="grow">Exercice ${i + 1}${e.titre ? ' · ' + esc(e.titre) : ''}</h3>${e.demo ? '<span class="pill lr-dp">DÉMONSTRATION</span>' : ''}${e.niveau ? `<span class="lr-niv">${'★'.repeat(e.niveau)}</span>` : ''}${done[e.id] ? '<span class="pill ok">Réussi</span>' : ''}</div>
      <div class="lr-enonce">${e.enonce}</div>
      ${(e.questions || []).map((q, k) => `<div class="lr-qq" data-k="${k}"><div class="lr-ql">${q.label}</div>
        ${q.type === 'qcm' ? `<div class="lr-choix">${q.choix.map((c, j) => `<label class="chk"><input type="radio" name="r-${i}-${k}" value="${j}"> <span>${c}</span></label>`).join('')}</div>`
          : `<div class="lr-in"><input type="text" inputmode="${q.type === 'ensemble' ? 'text' : 'decimal'}" autocomplete="off" placeholder="${q.type === 'ensemble' ? 'ex. -2 ; 3   (∅ si aucune)' : (q.ph || 'ta réponse')}" aria-label="Réponse"></div>`}
        <div class="lr-fb" aria-live="polite"></div>
        ${q.indice ? `<details class="lr-ind"><summary>Indice</summary><div>${q.indice}</div></details>` : ''}</div>`).join('')}
      ${e.pistes ? `<details class="lr-ind"><summary>Pistes pour démarrer</summary><div>${e.pistes}</div></details>` : ''}
      <div class="toolbar">${(e.questions || []).length ? `<button type="button" class="btn primary sm" data-lr="check" data-v="${i}">Vérifier mes réponses</button>` : ''}<button type="button" class="btn sm" data-lr="sol" data-v="${i}">${e.demo ? 'Voir la démonstration rédigée' : 'Voir la solution'}</button>${!(e.questions || []).length && !done[e.id] ? `<button type="button" class="btn sm go" data-lr="selfok" data-v="${i}">J'ai réussi seul(e)</button>` : ''}</div>
      <div class="lr-sol" hidden>${e.solution || ''}</div>
      ${redHTML(e)}
    </article>` : '').join('') + `<p class="small muted">Écris les fractions avec « / » (ex. 3/4), les racines avec « √ » ou « racine » (ex. 2√3), π avec « π » ou « pi », les décimaux avec une virgule. Pour un ensemble de solutions, sépare par « ; ». Pour une démonstration : rédige-la (ici ou sur ton cahier), compare avec la démonstration rédigée, et envoie-la à ton professeur avec « Ma rédaction ».</p>`;
  }

  /* « Ma rédaction » : l'élève écrit et/ou photographie sa solution et l'envoie à son prof */
  const RKEY = id => 'sigma-red-' + L.classe + '-' + id;
  const draftGet = id => { try { return localStorage.getItem(RKEY(id)) || ''; } catch (_) { return ''; } };
  const draftSet = (id, v) => { try { v ? localStorage.setItem(RKEY(id), v) : localStorage.removeItem(RKEY(id)); } catch (_) { } };
  const renduOf = e => (ctx.S.rendus || []).find(r => r.docId === 'exo:' + L.classe + ':' + e.id);
  const R_ST = { rendu: ['Envoyée · en attente de correction', 'warn'], annote: ['Annotée par ton prof', 'neutral'], corrige: ['Corrigée', 'ok'] };
  const SYM = ['√', '²', '³', 'π', '≤', '≥', '≠', '∈', '∉', '∞', '⇒', '⇔', '∪', '∩', '∅', '→', '×', '÷', '±', '|x|', '≈', '°'];
  if (!L.photos) L.photos = {};
  function redHTML(e) {
    if (ctx.S.role !== 'eleve') return `<details class="lr-red"><summary>✍️ Ma rédaction <span class="pill neutral">aperçu professeur</span></summary>
      <p class="small muted" style="margin:0">Ici, l'élève écrit sa solution (avec les touches √ ² π ≤ ⇒ ⇔…) et/ou photographie son cahier, puis clique sur « Envoyer à mon prof ». Vous retrouvez les envois dans votre espace : onglet « Cours en ligne » → « Rédactions des élèves », pour annoter, noter et commenter.</p>
      <div class="lr-sym">${SYM.slice(0, 12).map(x => `<button type="button" class="btn sm" disabled>${esc(x)}</button>`).join('')}</div>
      <textarea class="lr-txt" rows="3" disabled placeholder="Zone de rédaction de l'élève…"></textarea>
      <div class="toolbar"><button type="button" class="btn sm" disabled>📷 Photographier mon cahier</button><button type="button" class="btn sm primary" disabled>Envoyer à mon prof</button></div></details>`;
    const r = renduOf(e), st = r && (R_ST[r.statut] || R_ST.rendu), open = L.redOpen === e.id, ph = L.photos[e.id] || [];
    const locked = r && r.statut !== 'rendu';
    return `<details class="lr-red" data-x="${esc(e.id)}" ${open ? 'open' : ''}><summary>✍️ Ma rédaction${st ? ` <span class="pill ${st[1]}">${st[0]}</span>${r.note !== '' && r.statut === 'corrige' ? ` <b>${esc(String(r.note).replace('.', ','))}/20</b>` : ''}` : ''}</summary>
      ${r ? `<div class="toolbar"><span class="small muted grow">Envoyée le ${esc(r.date.split('-').reverse().join('/'))}${r.fichiers.length ? ' · ' + r.fichiers.length + ' photo' + (r.fichiers.length > 1 ? 's' : '') : ''}</span><button type="button" class="btn sm ${r.statut === 'rendu' ? '' : 'primary'}" data-lr="rvoir" data-v="${esc(r.id)}">${r.statut === 'rendu' ? 'Voir ce que j\'ai envoyé' : 'Voir la correction de mon prof'}</button></div>` : ''}
      ${locked ? '<p class="small muted">Ton professeur a commencé à corriger cette rédaction : elle ne peut plus être modifiée.</p>' : `
      <p class="small muted" style="margin:0">Écris ta solution comme sur ta copie (phrases, « donc », « or »…), et/ou prends ton cahier en photo. Ton brouillon reste gardé sur ce téléphone.</p>
      <div class="lr-sym" role="group" aria-label="Symboles">${SYM.map(x => `<button type="button" class="btn sm" data-lr="sym" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <textarea class="lr-txt" rows="7" maxlength="5000" placeholder="Ma rédaction…">${esc(draftGet(e.id))}</textarea>
      <div class="rendu-prev">${ph.map((u, j) => `<figure><img src="${u}" alt="Photo ${j + 1}"><button type="button" class="btn sm ghost" data-lr="phrm" data-v="${j}" aria-label="Retirer la photo ${j + 1}">✕</button><figcaption>Photo ${j + 1}</figcaption></figure>`).join('')}</div>
      <div class="toolbar"><label class="btn sm">📷 Photographier mon cahier<input type="file" accept="image/*" multiple hidden class="lr-file"></label>
        <button type="button" class="btn sm primary" data-lr="rsend">${r ? 'Renvoyer à mon prof (remplace)' : 'Envoyer à mon prof'}</button><span class="small lr-rmsg" aria-live="polite"></span></div>`}
    </details>`;
  }

  /* évaluations */
  function evalsHTML(d) {
    const role = ctx.S.role;
    return `<div class="lr-head"><p class="eyebrow">Préparation des devoirs et de la composition</p><h2>Évaluations type · 1er semestre</h2>
      <p class="muted">Cinq sujets progressifs, du plus accessible au plus corsé. Entraîne-toi dans les conditions du devoir (durée indiquée, sans calculatrice sauf mention), puis compare avec la correction quand ton professeur l'aura débloquée.</p></div>
      ${d.evals.map((e, i) => { const key = keyOf(e.id), op = L.evalOpen[e.id], sh = L.evalShow[e.id];
        const lock = role === 'eleve' ? (key ? '<span class="pill ok">Correction disponible</span>' : '<span class="pill neutral">🔒 Correction verrouillée</span>')
          : (unlocked(e.id) ? '<span class="pill ok">Débloquée pour les élèves</span>' : '<span class="pill neutral">🔒 Verrouillée pour les élèves</span>');
        return `<article class="panel lr-eval">
        <div class="toolbar"><div class="grow"><h3>${esc(e.titre)}</h3><p class="small muted" style="margin:4px 0 0">Niveau ${'★'.repeat(e.niveau || i + 1)}${'☆'.repeat(5 - (e.niveau || i + 1))} · Durée ${esc(e.duree)} · ${esc(e.chapitres)}</p></div>${lock}</div>
        <div class="toolbar"><button type="button" class="btn sm ${op ? 'primary' : ''}" data-lr="esujet" data-v="${esc(e.id)}">${op ? 'Masquer le sujet' : 'Voir le sujet'}</button>
          ${key ? `<button type="button" class="btn sm ${sh ? 'primary' : ''}" data-lr="ecorr" data-v="${esc(e.id)}">${sh ? 'Masquer la correction' : 'Voir la correction détaillée'}</button>` : (role === 'eleve' ? '<span class="small muted">Ton professeur débloquera la correction après le devoir.</span>' : '')}
          ${role === 'admin' ? `<button type="button" class="btn sm ${unlocked(e.id) ? '' : 'go'}" data-lr="unlock" data-v="${esc(e.id)}" data-on="${unlocked(e.id) ? '' : '1'}">${unlocked(e.id) ? 'Reverrouiller' : 'Débloquer la correction'}</button>` : ''}</div>
        ${op ? `<div class="lr-sujet">${e.sujet}</div>` : ''}
        ${sh ? `<div class="lr-corr" id="corr-${esc(e.id)}">${L.plain[e.id] || '<p class="muted">Déchiffrement…</p>'}</div>` : ''}
      </article>`; }).join('')}`;
  }

  function redraw(d) { const y = window.scrollY; draw(d); window.scrollTo(0, y); }
  function bind(d, ch) {
    const main = $('#lr-main');
    main.oninput = ev => { const ta = ev.target.closest('.lr-txt'); if (ta) draftSet(ta.closest('.lr-red').dataset.x, ta.value); };
    main.onchange = async ev => {
      const fi = ev.target.closest('.lr-file'); if (!fi) return;
      const box = fi.closest('.lr-red'), id = box.dataset.x, msg = $('.lr-rmsg', box), arr = L.photos[id] = L.photos[id] || [];
      try { for (const f of fi.files) { if (arr.length >= 6) { msg.textContent = '6 photos au maximum.'; break; } arr.push(await ctx.shrink(f)); } } catch (x) { msg.textContent = x.message; }
      L.redOpen = id; redraw(d);
    };
    if (!main._tg) { main._tg = 1; main.addEventListener('toggle', ev => { const dt = ev.target; if (dt.classList && dt.classList.contains('lr-red')) L.redOpen = dt.open ? dt.dataset.x : (L.redOpen === dt.dataset.x ? null : L.redOpen); }, true); }
    main.onclick = async ev => {
      const el = ev.target.closest('[data-lr]'); if (!el) return;
      const a = el.dataset.lr, v = el.dataset.v;
      if (a === 'chap') { L.chap = +v; if (L.tab === 'evals') L.tab = 'cours'; draw(d); window.scrollTo(0, 0); }
      else if (a === 'tab') { L.tab = v; draw(d); }
      else if (a === 'qrep') {
        const li = el.closest('li'); if (li.dataset.done) return; li.dataset.done = '1';
        const q = ch.quiz[+el.dataset.q], ok = +v === q.bonne;
        $$('button', li).forEach((b, j) => { b.disabled = true; if (j === q.bonne) b.classList.add('lr-ok'); });
        if (!ok) el.classList.add('lr-ko');
        const ex = $('.lr-expl', li); ex.hidden = false; ex.innerHTML = `<b>${ok ? '✅ Bravo !' : '❌ Pas tout à fait.'}</b> ${q.expl || ''}`; maths(ex);
        li.dataset.ok = ok ? '1' : '0';
        const all = $$('.lr-quiz > li', main), fin = all.filter(x => x.dataset.done);
        if (fin.length === all.length) {
          const sc = all.filter(x => x.dataset.ok === '1').length, p = prog(L.classe), k = 'q-' + ch.id;
          p[k] = Math.max(p[k] || 0, sc); saveProg(L.classe, p);
          const s = $('#lr-score'); s.hidden = false;
          s.innerHTML = `<b>Score : ${sc} / ${all.length}</b> — ${sc === all.length ? 'parfait, tu maîtrises ce chapitre !' : sc >= all.length * 0.7 ? 'très bien, revois les questions ratées.' : 'relis le cours puis recommence le quiz.'}`;
        }
      }
      else if (a === 'qreset') draw(d);
      else if (a === 'check') {
        const i = +v, e = ch.exos[i], card = main.querySelector(`.lr-exo[data-ei="${i}"]`); let good = 0;
        (e.questions || []).forEach((q, k) => {
          const box = card.querySelector(`.lr-qq[data-k="${k}"]`), fb = $('.lr-fb', box);
          let val = '';
          if (q.type === 'qcm') { const r = box.querySelector('input:checked'); val = r ? r.value : ''; } else val = $('input', box).value;
          if (val === '') { fb.className = 'lr-fb'; fb.textContent = 'Réponds d\'abord.'; return; }
          const r = check(q, val);
          if (r === null) { fb.className = 'lr-fb warn'; fb.textContent = 'Écriture non reconnue : utilise des nombres, « / », « √ », « π ».'; return; }
          fb.className = 'lr-fb ' + (r ? 'ok' : 'bad'); fb.textContent = r ? '✅ Juste !' : '❌ Ce n\'est pas ça. Regarde l\'indice puis réessaie.';
          if (r) good++;
        });
        if (good === (e.questions || []).length) { const p = prog(L.classe), k = 'e-' + ch.id; p[k] = p[k] || {}; p[k][e.id] = 1; saveProg(L.classe, p); }
      }
      else if (a === 'efilt') { L.exoFiltre = v; draw(d); }
      else if (a === 'selfok') { const p = prog(L.classe), k = 'e-' + ch.id; p[k] = p[k] || {}; p[k][ch.exos[+v].id] = 1; saveProg(L.classe, p); redraw(d); }
      else if (a === 'rvoir') ctx.openRendu(v);
      else if (a === 'sym') { const ta = $('.lr-txt', el.closest('.lr-red')); const s0 = ta.selectionStart, s1 = ta.selectionEnd; ta.value = ta.value.slice(0, s0) + v + ta.value.slice(s1); ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + v.length; draftSet(el.closest('.lr-red').dataset.x, ta.value); }
      else if (a === 'phrm') { const id = el.closest('.lr-red').dataset.x; (L.photos[id] || []).splice(+v, 1); L.redOpen = id; redraw(d); }
      else if (a === 'rsend') {
        const box = el.closest('.lr-red'), id = box.dataset.x, e = ch.exos.find(x => x.id === id), txt = $('.lr-txt', box).value.trim(), ph = L.photos[id] || [], msg = $('.lr-rmsg', box);
        if (txt.length < 3 && !ph.length) { msg.textContent = 'Écris ta rédaction ou ajoute une photo.'; return; }
        el.disabled = true; msg.textContent = 'Envoi en cours…';
        try {
          ctx.applyData(await ctx.call('rendre', { exo: { id, titre: (ch.titre + ' · ' + (e.titre || id)).slice(0, 90) }, texte: txt, files: ph.map(data => ({ data })) }));
          draftSet(id, ''); delete L.photos[id]; L.redOpen = id; ctx.toast('Rédaction envoyée à ton professeur'); redraw(d);
        } catch (x) { if (/Session expirée/.test(x.message)) return ctx.expired(); msg.textContent = /Action inconnue|Devoir introuvable/.test(x.message) ? 'Le serveur n\'est pas encore à jour : réessaie plus tard.' : x.message; el.disabled = false; }
      }
      else if (a === 'sol') { const card = main.querySelector(`.lr-exo[data-ei="${v}"]`), s = $('.lr-sol', card); s.hidden = !s.hidden; if (!s.hidden) maths(s); }
      else if (a === 'esujet') { L.evalOpen[v] = !L.evalOpen[v]; draw(d); }
      else if (a === 'ecorr') {
        L.evalShow[v] = !L.evalShow[v]; draw(d);
        if (L.evalShow[v] && !L.plain[v]) {
          const e = d.evals.find(x => x.id === v);
          try { L.plain[v] = await decrypt(e.correction, keyOf(v)); } catch (_) { L.plain[v] = '<p class="err">Impossible d\'ouvrir la correction. Actualise la page.</p>'; }
          const box = $('#corr-' + v); if (box) { box.innerHTML = L.plain[v]; maths(box); }
        }
      }
      else if (a === 'unlock') {
        el.disabled = true;
        const r = await ctx.mutate('unlockEval', { id: v, on: !!el.dataset.on }, el.dataset.on ? 'Correction débloquée pour les élèves' : 'Correction reverrouillée');
        if (r) draw(d); else el.disabled = false;
      }
    };
  }

  /* panneau pour l'espace élève */
  function cardHTML(me) {
    if (!has(me.classe)) return '';
    return `<div class="panel callout lr-card"><div class="toolbar"><div class="grow"><h3>📚 Mon cours en ligne · ${esc(me.classe)}</h3>
      <p class="small muted" style="margin:4px 0 0">Cours complets du 1er semestre, quiz, exercices corrigés automatiquement et 5 évaluations type.</p></div>
      <a class="btn primary" href="#apprendre">Ouvrir</a></div></div>`;
  }

  return { init(c) { ctx = c; }, render, cardHTML, has, DISPO, _num: num, _check: check };
})();
