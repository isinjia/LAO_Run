// Builds dist/ for the Cloudflare deploy (wrangler.jsonc runs it on Cloudflare's build machine before every deploy).
// Only the game files go out: every picture is shipped scrambled (<file>.pak, restored in memory by js/pack.js), the
// style sheet's pictures ride inside a script in the same scrambled form, and the game's own scripts are minified and
// mangled. The repository (and GitHub Pages / local runs) keep the readable source and plain pictures.
//   node tools/build_dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

// terser: installed on the fly when the build machine does not have it yet (no package.json needed)
async function loadTerser() {
  try { return await import('terser'); } catch (e) { /* not installed */ }
  execSync('npm install --no-save --no-audit --no-fund terser@5.31.0', { cwd: ROOT, stdio: 'inherit' });
  return import(pathToFileURL(path.join(ROOT, 'node_modules', 'terser', 'main.js')).href);
}

// what ships: the page and these folders (tools, labs, the self test and source art stay home)
const FILES = ['index.html'];
const DIRS = ['css', 'js', 'assets'];
const LEAVE = /^js\/selftest\.js$/;
// generated data and the already-minified three.js stay as they are
const SKIP_MINIFY = /^js\/(vendor|fx|sd)\//;
const OPTS = { ecma: 2020, compress: { passes: 2 }, mangle: true, format: { comments: false } }; // globals / property names kept

function copyTree(rel) {
  if (LEAVE.test(rel)) return;
  const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copyTree(path.posix.join(rel, f));
  } else fs.copyFileSync(src, dst);
}
const walk = (dir, out = []) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };

// ── the same self-inverse byte mask as js/pack.js ──
const K = Array.from('LAO-orca-run-pak', (c) => c.charCodeAt(0));
function mask(buf) {
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
  return u8;
}
const IMG = /\.(webp|png|jpe?g)$/i;
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function packAssets() {
  let files = 0, dropped = 0;
  // file:// copies (the same atlases / sheets as base64 inside scripts): never needed over http, and they would hand
  // the pictures out unmasked
  const sd = path.join(OUT, 'js/sd'), fx = path.join(OUT, 'js/fx');
  for (const f of fs.readdirSync(sd)) if (/\.a\d+\.js$/.test(f)) { fs.rmSync(path.join(sd, f)); dropped++; }
  for (const f of fs.readdirSync(fx)) {
    const m = /^(.+)\.js$/.exec(f);
    if (m && !f.endsWith('.m.js') && f !== '_meta.js' && fs.existsSync(path.join(fx, m[1] + '.m.js'))) { fs.rmSync(path.join(fx, f)); dropped++; }
  }
  // the favicon stays a plain picture (the browser fetches it itself)
  fs.copyFileSync(path.join(ROOT, 'assets/img/brownie.webp'), path.join(OUT, 'favicon.webp'));
  // every picture: <file> -> <file>.pak (masked bytes)
  for (const p of walk(path.join(OUT, 'assets')).concat(walk(sd), walk(fx))) {
    if (!IMG.test(p)) continue;
    fs.writeFileSync(p + '.pak', mask(fs.readFileSync(p)));
    fs.rmSync(p);
    files++;
  }
  // the style sheet: its pictures become pk:<mime>:<masked base64> and the sheet is applied by a script
  // (js/pack.js turns them into blob: URLs), so no picture URL is ever requested in the clear
  let sheet = fs.readFileSync(path.join(ROOT, 'css/game.css'), 'utf8'), inl = 0;
  sheet = sheet.replace(/url\((['"]?)\.\.\/(assets\/[^'")]+?\.(webp|png|jpe?g))\1\)/gi, (m, q, rel, ext) => {
    inl++;
    return 'url(pk:' + MIME[ext.toLowerCase()] + ':' + Buffer.from(mask(fs.readFileSync(path.join(ROOT, rel)))).toString('base64') + ')';
  });
  fs.rmSync(path.join(OUT, 'css'), { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'js/sheet.js'), "(function(){var s=document.createElement('style');s.textContent=PACKED.css(" + JSON.stringify(sheet) + ');document.head.appendChild(s);})();\n');
  // the page: the restore switched on before anything else, the sheet from the script, the favicon
  const htmlFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8');
  const swap = (a, b) => { if (!html.includes(a)) throw new Error('index.html: missing ' + a); html = html.replace(a, b); };
  swap('<head>', '<head>\n<script>window.PACK=1</script>');
  swap('<link rel="stylesheet" href="css/game.css">', '<script src="js/pack.js"></script>\n<script src="js/sheet.js"></script>');
  swap('<link rel="icon" href="assets/img/brownie.webp">', '<link rel="icon" href="favicon.webp">');
  swap('<script src="js/vendor/three.min.js"></script>', '<script src="js/vendor/three.min.js"></script>\n<script>PACKED.three()</script>'); // textures through the packed files
  fs.writeFileSync(htmlFile, html);
  console.log(`packed: ${files} pictures masked, ${inl} style-sheet pictures inlined, ${dropped} file:// copies dropped`);
}

async function main() {
  const { minify } = await loadTerser();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of FILES) copyTree(f);
  for (const d of DIRS) copyTree(d);
  packAssets();
  // minify the game's own scripts
  const scripts = fs.readdirSync(path.join(OUT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).filter((f) => !SKIP_MINIFY.test(f));
  let before = 0, after = 0;
  for (const rel of scripts) {
    const file = path.join(OUT, rel), code = fs.readFileSync(file, 'utf8');
    const out = await minify(code, OPTS);
    if (out.code == null) throw new Error('terser failed on ' + rel);
    fs.writeFileSync(file, out.code);
    before += code.length; after += out.code.length;
  }
  // the page's inline scripts too, and its HTML comments
  const htmlFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]) {
    const out = await minify(m[1], OPTS);
    if (out.code == null) throw new Error('terser failed on an inline script');
    html = html.replace(m[0], () => '<script>' + out.code + '</script>'); // a function: "$" in the code stays literal
  }
  fs.writeFileSync(htmlFile, html);
  console.log(`dist: ${scripts.length} scripts minified (${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
