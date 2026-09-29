#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Vérifications de l'application — un seul commande, aucun build       */
/*                                                                     */
/*   node tools/check.mjs                 tout                        */
/*   node tools/check.mjs --shot out.png  + capture d'écran            */
/*   node tools/check.mjs --width 430     largeur donnée (défaut 1200) */
/*   node tools/check.mjs --keep          laisse le serveur ouvert     */
/*   BROWSER=/chemin/vers/chrome node tools/check.mjs                 */
/*                                                                     */
/* Deux passes :                                                        */
/*                                                                     */
/*   1. Sur disque — chaque module `js/` est analysé, et `version.json` */
/*      est comparé à `APP_VERSION` (le repère de mise à jour).         */
/*   2. Dans un vrai navigateur — `tools/check-page.html` importe les    */
/*      modules de l'application, rend les cartes, clique, et renvoie   */
/*      les mesures de mise en page. Les mesures comptent : on ne peut  */
/*      pas juger une largeur « pleine » à l'œil reliably.             */
/*                                                                     */
/* Code de sortie 0 si tout passe, 1 sinon.                             */
/* ------------------------------------------------------------------ */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 60_000

/* --- Options de la ligne de commande ---------------------------------- */

const argv = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : argv[at + 1]
}
const WIDTH = Number(flag('width', 1200)) || 1200
const HEIGHT = Number(flag('height', 1000)) || 1000
const SHOT = flag('shot')
const KEEP = argv.includes('--keep')

/* --- Couleurs du rapport (lisible sans dépendre du terminal) --------- */

const paint = (code) => (text) => (process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text)
const green = paint(32)
const red = paint(31)
const dim = paint(90)
const bold = paint(1)

let failures = 0
function report(section, results) {
  console.log(`\n${bold(section)}`)
  for (const item of results) {
    if (item.pass) {
      console.log(`  ${green('ok')}   ${item.name}${item.detail ? dim(`  (${item.detail})`) : ''}`)
    } else {
      failures += 1
      console.log(`  ${red('NON')} ${item.name}${item.detail ? red(`  (${item.detail})`) : ''}`)
    }
  }
}

/* --- 1. Sur disque --------------------------------------------------- */

function jsFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return jsFiles(full)
      return entry.isFile() && entry.name.endsWith('.js') ? [full] : []
    })
}

function checkSyntax(file) {
  return new Promise((resolve) => {
    /* `node --check` refuse les `import` sauf si le fichier est vu comme un
       module : on copie donc chacun dans un dossier `type: module`. */
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'check-'))
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"module"}')
    fs.copyFileSync(file, path.join(sandbox, 'module.js'))
    const child = spawn(process.execPath, ['--check', 'module.js'], { cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => {
      fs.rmSync(sandbox, { recursive: true, force: true })
      const message = stderr.split('\n').find((line) => line.includes('Error')) || stderr.trim().split('\n')[0] || ''
      resolve({ name: `syntaxe ${path.relative(ROOT, file)}`, pass: code === 0, detail: message })
    })
  })
}

async function diskChecks() {
  const results = []

  /* La mise à jour des appareils repose sur ces deux repères : s'ils
     divergent, l'application ne voit jamais la nouvelle version. */
  const app = fs.readFileSync(path.join(ROOT, 'js/core/app.js'), 'utf8')
  const appVersion = app.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] || ''
  const appRelease = app.match(/APP_RELEASE\s*=\s*'([^']+)'/)?.[1] || ''
  let published = {}
  try {
    published = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'))
  } catch (error) {
    results.push({ name: 'version.json illisible', pass: false, detail: error.message })
  }
  results.push({
    name: 'version.json === APP_VERSION',
    pass: Boolean(appVersion) && published.version === appVersion,
    detail: `${published.version} / ${appVersion}`,
  })
  results.push({
    name: 'version.json === APP_RELEASE',
    pass: Boolean(appRelease) && published.releasedAt === appRelease,
    detail: `${published.releasedAt} / ${appRelease}`,
  })

  /* Le lien privé est un secret : il ne doit jamais être versionné. */
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  results.push({
    name: 'worker/LIEN-PRIVE.txt est ignoré',
    pass: ignored.includes('worker/LIEN-PRIVE.txt'),
  })

  results.push(...(await Promise.all(jsFiles(path.join(ROOT, 'js')).map(checkSyntax))))
  report('Sur disque', results)
}

/* --- 2. Navigateur --------------------------------------------------- */

const BROWSERS = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

function findBrowser() {
  const found = BROWSERS.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    console.error(red(`Aucun navigateur trouvé. Renseignez BROWSER=/chemin/vers/le/navigateur.`))
    process.exit(1)
  }
  return found
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function serve(reportFile) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/__check/report') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          fs.writeFileSync(reportFile, body)
          res.writeHead(200).end('ok')
        })
        return
      }
      const relative = decodeURIComponent(req.url.split('?')[0])
      const file = path.join(ROOT, relative === '/' ? 'index.html' : relative)
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const waitFor = async (file, deadline) => {
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return JSON.parse(fs.readFileSync(file, 'utf8'))
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

async function browserChecks() {
  const browser = findBrowser()
  const reportFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'check-')), 'report.json')
  const server = await serve(reportFile)
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/tools/check-page.html`
  const shot = SHOT ? path.resolve(SHOT) : null

  console.log(dim(`\n${path.basename(browser)} — ${WIDTH}px${shot ? ' + capture' : ''}`))

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--virtual-time-budget=15000',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'check-profile-'))}`,
  ]
  if (shot) args.push(`--screenshot=${shot}`)
  args.push(url)

  const child = spawn(browser, args, { stdio: 'ignore' })
  const deadline = Date.now() + TIMEOUT_MS
  const payload = await waitFor(reportFile, deadline)
  const exited = new Promise((resolve) => child.on('close', resolve))
  if (!payload) {
    child.kill()
  } else if (shot) {
    /* Le rapport arrive avant la fin du rendu : on laisse le navigateur
       terminer, sinon la capture est coupée au milieu. */
    await Promise.race([exited, new Promise((r) => setTimeout(r, 20_000))])
    child.kill()
  } else {
    child.kill()
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
  }

  if (!payload) {
    failures += 1
    console.log(red(`  NON  le navigateur n'a rien renvoyé (${TIMEOUT_MS / 1000}s)`))
  } else {
    report(`Dans le navigateur (${WIDTH}px, thème ${payload.theme})`, payload.results)
  }

  if (!KEEP) {
    server.close()
  } else {
    console.log(dim(`  serveur laissé ouvert : ${url}`))
  }
  return Boolean(payload)
}

/* --- Lancement ------------------------------------------------------ */

console.log(bold('Vérifications — Mes achats'))
await diskChecks()
const answered = await browserChecks()
if (!answered) {
  console.log(red('\nImpossible de vérifier le rendu.'))
}
console.log(failures === 0 ? `\n${green('Tout passe.')}\n` : `\n${red(`${failures} échec(s).`)}\n`)
process.exit(failures === 0 ? 0 : 1)
