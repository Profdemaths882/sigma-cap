// Sigma Cap — serveur autonome (remplace Google Apps Script).
// Même logique que l'appli (core.js) ; les données sont des fichiers JSON dans DATA (par défaut /var/lib/sigma-cap).
// Démarrage : node server.js   (port 3010, écoute seulement en local : Caddy s'occupe du https)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const DATA = process.env.SIGMA_DATA || '/var/lib/sigma-cap';
const PORT = +process.env.SIGMA_PORT || 3010;
const SITE = process.env.SIGMA_SITE || path.join(__dirname, '..');
const DB = path.join(DATA, 'db'), FILES = path.join(DATA, 'files'), TRASH = path.join(DATA, 'corbeille');
[DATA, DB, path.join(FILES, 'docs'), path.join(FILES, 'rendus'), TRASH].forEach(d => fs.mkdirSync(d, { recursive: true }));

/* ---------- configuration privée (code admin, clés des corrections) ---------- */
const CONF_FILE = path.join(DATA, 'config.json');
function conf() { try { return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch (e) { return {}; } }

/* ---------- logique partagée ---------- */
function loadCore() { return new Function(fs.readFileSync(path.join(SITE, 'core.js'), 'utf8') + '\n;return SigmaCore;')(); }

/* ---------- petite base de données en fichiers JSON ---------- */
const mem = {};
function file(k) { return path.join(DB, k + '.json'); }
function load(k, def) { if (!(k in mem)) { try { mem[k] = JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch (e) { mem[k] = def; } } return mem[k]; }
function save(k) { const f = file(k), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(mem[k])); fs.renameSync(tmp, f); }
const clone = o => JSON.parse(JSON.stringify(o));

const cache = load('cache', {});
let cacheTimer = null;
function saveCacheSoon() { if (!cacheTimer) cacheTimer = setTimeout(() => { cacheTimer = null; const now = Date.now(); for (const k in cache) if (cache[k].exp < now) delete cache[k]; save('cache'); }, 2000); }

function fileOf(id) {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '');
  for (const dir of ['docs', 'rendus']) {
    const f = fs.readdirSync(path.join(FILES, dir)).find(n => n.startsWith(safe + '.'));
    if (safe && f) return path.join(FILES, dir, f);
  }
  return null;
}
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const STORE = {
  read: k => clone(load(k, [])),
  upsert(k, item) { const l = load(k, []); const i = l.findIndex(x => x.id === item.id); if (i >= 0) l[i] = clone(item); else l.push(clone(item)); save(k); },
  remove(k, id) { mem[k] = load(k, []).filter(x => x.id !== id); save(k); },
  replace(k, items) { mem[k] = clone(items || []); save(k); },
  getSettings: () => { const s = load('settings', null); return s ? clone(s) : null; },
  setSettings(s) { mem.settings = clone(s); save('settings'); },
  cacheGet: k => { const c = cache[k]; return c && c.exp > Date.now() ? c.v : null; },
  cachePut(k, v, ttl) { cache[k] = { v, exp: Date.now() + Math.min(21600, ttl || 21600) * 1000 }; saveCacheSoon(); },
  cacheDel(k) { delete cache[k]; saveCacheSoon(); },
  nextCounter() {
    let c = +load('counter', 0) || 0;
    if (!c) c = load('students', []).reduce((m, s) => Math.max(m, Number(String(s.num).split('-')[1]) || 0), 0);
    mem.counter = c + 1; save('counter'); return mem.counter;
  },
  getCounter: () => +load('counter', 0) || 0,
  today: () => new Date().toISOString().slice(0, 10),
  uuid: () => crypto.randomUUID(),
  sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  sheetUrl: () => '',
  saveFile(name, b64, mime, kind) {
    const id = crypto.randomUUID().replace(/-/g, ''), dir = kind === 'rendus' ? 'rendus' : 'docs', ext = EXT[mime || 'application/pdf'] || '.bin';
    fs.writeFileSync(path.join(FILES, dir, id + ext), Buffer.from(b64, 'base64'));
    // les fiches et évaluations sont publiques (lien), les copies des élèves restent privées
    return { id, url: dir === 'docs' ? 'files/docs/' + id + ext : '' };
  },
  readFile(id) { const f = fileOf(id); if (!f) throw new Error('Fichier introuvable.'); return fs.readFileSync(f).toString('base64'); },
  deleteFile(id) { const f = fileOf(id); if (f) fs.renameSync(f, path.join(TRASH, path.basename(f))); }
};
Object.defineProperty(STORE, 'masterCode', { get: () => conf().masterCode || '' });
Object.defineProperty(STORE, 'evalKeys', { get: () => conf().evalKeys || {} });
Object.defineProperty(STORE, 'defaultListeVac', { get: () => conf().listeVac || null });
Object.defineProperty(STORE, 'defaultTarifsVac', { get: () => conf().tarifsVac || null });

let handler = null, coreStamp = 0;
function run(req) {
  const st = fs.statSync(path.join(SITE, 'core.js')).mtimeMs;
  if (!handler || st !== coreStamp) { handler = loadCore().make(STORE); coreStamp = st; } // mise à jour automatique avec le site
  return handler(req);
}

/* ---------- HTTP ---------- */
const MAX = 40 * 1024 * 1024;
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET' }); return res.end(); }
  if (req.method === 'GET' && req.url.startsWith('/api')) return send(200, { ok: true, data: 'Sigma Cap en ligne' });
  if (req.method !== 'POST' || !req.url.startsWith('/api')) return send(404, { ok: false, error: 'Introuvable' });
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > MAX) { send(413, { ok: false, error: 'Envoi trop lourd.' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return send(200, { ok: false, error: 'Requête illisible' }); }
    try { send(200, { ok: true, data: run(body) }); }
    catch (x) { send(200, { ok: false, error: String((x && x.message) || x) }); }
  });
}).listen(PORT, '127.0.0.1', () => console.log('Sigma Cap : serveur prêt sur le port ' + PORT + ', données dans ' + DATA));
