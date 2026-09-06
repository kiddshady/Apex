/* ═══════════════════════════════════════════════════════════════════════════
   Publica el build que hay en dist/ como release de GitHub.

     npm run build          # primero, el instalador
     npm run release        # después, esto

   Crea el release `v<version>` (la de package.json) con los tres archivos que
   electron-updater necesita para que las apps instaladas se actualicen solas:
   el instalador, su .blockmap (para descargar solo lo que cambió) y latest.yml
   (el que dice qué versión es la última). Las notas salen de los commits desde
   el tag anterior, salvo que pases --notas "texto".

   Usa `gh`, así que hace falta estar logueado (`gh auth status`). No pide
   tokens ni los guarda en ningún lado.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const producto = pkg.build?.productName || pkg.productName || pkg.name;
const { owner, repo } = pkg.build?.publish || {};

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

const GH = process.platform === 'win32' ? 'gh.exe' : 'gh';
function gh(argumentos, { capturar = false } = {}) {
  const r = spawnSync(GH, argumentos, { stdio: capturar ? 'pipe' : 'inherit', encoding: 'utf8', cwd: RAIZ });
  if (r.error) throw new Error(`No se pudo correr gh: ${r.error.message}`);
  return r;
}
function git(argumentos) {
  const r = spawnSync('git', argumentos, { stdio: 'pipe', encoding: 'utf8', cwd: RAIZ });
  return r.status === 0 ? r.stdout.trim() : '';
}

const fallar = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };

if (!owner || !repo) fallar('package.json no tiene build.publish.owner/repo: no sé a qué repo publicar.');

/* ── Los archivos ────────────────────────────────────────────────────────── */
const dist = path.join(RAIZ, 'dist');
const archivos = [
  `${producto}-Setup-${version}.exe`,
  `${producto}-Setup-${version}.exe.blockmap`,
  'latest.yml',
].map((f) => path.join(dist, f));
const faltan = archivos.filter((f) => !fs.existsSync(f));
if (faltan.length) {
  fallar(`Faltan en dist/:\n    ${faltan.map((f) => path.basename(f)).join('\n    ')}\n  Corré \`npm run build\` primero (y fijate que la versión de package.json sea ${version}).`);
}
const yml = fs.readFileSync(archivos[2], 'utf8');
if (!yml.includes(`version: ${version}`)) fallar(`latest.yml dice otra versión que package.json (${version}). Volvé a correr \`npm run build\`.`);

/* ── El estado del repo ──────────────────────────────────────────────────── */
if (git(['status', '--porcelain']) && !flag('sucio')) {
  fallar('Hay cambios sin commitear. Commiteá (o pasá --sucio si sabés lo que hacés).');
}
const local = git(['rev-parse', 'HEAD']);
const remoto = git(['ls-remote', 'origin', 'HEAD']).split(/\s/)[0];
if (local && remoto && local !== remoto && !flag('sucio')) {
  fallar('El HEAD local no está pusheado. `git push` primero: el release tiene que apuntar a un commit que exista en GitHub.');
}

const existe = gh(['release', 'view', tag, '-R', `${owner}/${repo}`], { capturar: true }).status === 0;
if (existe && !flag('reemplazar')) {
  fallar(`El release ${tag} ya existe en ${owner}/${repo}. Subí la versión (npm version patch) o pasá --reemplazar para pisar sus archivos.`);
}

/* ── Las notas ───────────────────────────────────────────────────────────── */
let notas = valor('notas');
if (!notas) {
  const previo = git(['describe', '--tags', '--abbrev=0', 'HEAD^']) || git(['describe', '--tags', '--abbrev=0']);
  const rango = previo && previo !== tag ? `${previo}..HEAD` : 'HEAD';
  const commits = git(['log', rango, '--no-merges', '--pretty=format:- %s']);
  notas = commits || `- ${producto} ${version}`;
}
const cuerpo = `${notas}\n\nInstalador para Windows. Las apps ya instaladas se actualizan solas al abrirse.`;

/* ── Publicar ────────────────────────────────────────────────────────────── */
console.log(`\n  ${producto} ${tag} → ${owner}/${repo}`);
for (const f of archivos) console.log(`    ${path.basename(f)}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(1)} MB`);

let r;
if (existe) {
  r = gh(['release', 'upload', tag, ...archivos, '--clobber', '-R', `${owner}/${repo}`]);
} else {
  r = gh(['release', 'create', tag, ...archivos, '--title', `${producto} ${version}`, '--notes', cuerpo, '--latest', '-R', `${owner}/${repo}`]);
}
if (r.status !== 0) fallar(`gh terminó con código ${r.status}.`);

console.log(`\n  Publicado: https://github.com/${owner}/${repo}/releases/tag/${tag}\n`);
