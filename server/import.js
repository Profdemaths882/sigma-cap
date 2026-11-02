// Sigma Cap — déménagement des données depuis Google (Apps Script + Google Sheet + Drive) vers ce serveur.
// Usage : sudo -u sigma node /opt/sigma-cap/server/import.js   (le code admin est demandé, il n'est jamais affiché)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');
const DATA = process.env.SIGMA_DATA || '/var/lib/sigma-cap';
const SITE = path.join(__dirname, '..');
const DB = path.join(DATA, 'db'), FILES = path.join(DATA, 'files');
[DB, path.join(FILES, 'docs'), path.join(FILES, 'rendus')].forEach(d => fs.mkdirSync(d, { recursive: true }));

const gas = process.env.SIGMA_SOURCE || (fs.readFileSync(path.join(SITE, 'config.js'), 'utf8').match(/https:\/\/script\.google\.com\/macros\/s\/[^"']+\/exec/) || [])[0];
if (!gas) { console.error("Adresse du serveur Google introuvable dans config.js."); process.exit(1); }

function ask(q) {
  return new Promise(ok => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    if (process.stdin.isTTY) rl._writeToOutput = s => { if (s.startsWith(q)) process.stdout.write(s); else process.stdout.write('*'); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); ok(a.trim()); });
  });
}
async function call(body) {
  const r = await fetch(gas, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  const j = JSON.parse(await r.text());
  if (!j.ok) throw new Error(j.error || 'Erreur du serveur Google');
  return j.data;
}
const write = (k, v) => fs.writeFileSync(path.join(DB, k + '.json'), JSON.stringify(v));
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

(async () => {
  console.log('Déménagement de Sigma Cap depuis Google vers ce serveur.');
  const code = await ask('Code secret du compte « admin » : ');
  const { token } = await call({ action: 'login', login: 'admin', password: code });
  console.log('Connexion à Google réussie. Lecture des données…');
  const ex = await call({ action: 'exportAll', token });
  let nf = 0;
  // fiches et évaluations PDF (Google Drive) → files/docs
  for (const d of ex.docs || []) {
    if (!d.fileId) continue;
    try {
      const { data } = await call({ action: 'exportFile', token, id: d.fileId });
      const id = crypto.randomUUID().replace(/-/g, '');
      fs.writeFileSync(path.join(FILES, 'docs', id + '.pdf'), Buffer.from(data, 'base64'));
      d.fileId = id; d.url = 'files/docs/' + id + '.pdf'; nf++;
    } catch (e) { console.log('  ! document « ' + d.titre + ' » non copié : ' + e.message); }
  }
  // copies des élèves (photos, annotations) → files/rendus
  for (const r of ex.rendus || []) {
    let fl = []; try { fl = JSON.parse(r.fichiers || '[]'); } catch (e) { }
    for (const f of fl) {
      for (const key of ['id', 'annot']) {
        if (!f[key]) continue;
        try {
          const { data } = await call({ action: 'exportFile', token, id: f[key] });
          const id = crypto.randomUUID().replace(/-/g, ''), mime = key === 'annot' ? 'image/jpeg' : f.mime;
          fs.writeFileSync(path.join(FILES, 'rendus', id + (EXT[mime] || '.bin')), Buffer.from(data, 'base64'));
          f[key] = id; nf++;
        } catch (e) { console.log('  ! photo d\'une copie de ' + r.eleve + ' non copiée : ' + e.message); }
      }
    }
    r.fichiers = JSON.stringify(fl);
  }
  ['students', 'payments', 'expenses', 'sessions', 'teachers', 'docs', 'rendus'].forEach(k => write(k, ex[k] || []));
  write('settings', ex.settings || null);
  write('counter', +ex.counter || 0);
  const cf = path.join(DATA, 'config.json');
  let old = {}; try { old = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (e) { }
  fs.writeFileSync(cf, JSON.stringify(Object.assign(old, { masterCode: code, evalKeys: ex.evalKeys || {}, importeLe: new Date().toISOString() }), null, 1), { mode: 0o600 });
  console.log('Terminé : ' + (ex.students || []).length + ' élèves, ' + (ex.payments || []).length + ' paiements, ' + (ex.teachers || []).length + ' profs, '
    + (ex.docs || []).length + ' documents, ' + (ex.rendus || []).length + ' copies, ' + nf + ' fichiers copiés.');
  console.log('Le code admin reste le même. Redémarrage du serveur : sudo systemctl restart sigma-cap');
})().catch(e => { console.error('Échec : ' + e.message); process.exit(1); });
