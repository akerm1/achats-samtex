#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Vérifications de l'application — un seul commande, aucun build       */
/*                                                                     */
/*   node tools/check.mjs                 tout                        */
/*   node tools/check.mjs --shot out.png  + capture d'écran            */
/*   node tools/check.mjs --width 430     largeur donnée (défaut 1200) */
/*   node tools/check.mjs --theme dark    force le thème (défaut light)*/
/*   node tools/check.mjs --keep          laisse le serveur ouvert     */
/*   node tools/check.mjs --e2e            + l'application réelle       */
/*   BROWSER=/chemin/vers/chrome node tools/check.mjs                 */
/*                                                                     */
/* Deux passes :                                                        */
/*                                                                     */
/*   1. Sur disque — chaque module `src/` est analysé, et `version.json`  */
/*      est comparé à `APP_VERSION` (le repère de mise à jour).         */
/*   2. Dans un vrai navigateur — `tools/check-page.html` importe les    */
/*      modules de l'application, rend les cartes, clique, et renvoie   */
/*      les mesures de mise en page. Les mesures comptent : on ne peut  */
/*      pas juger une largeur « pleine » à l'œil reliably.             */
/*                                                                     */
/*   3. Avec `--e2e`, `tools/e2e.html` va plus loin : il lance l'appli-  */
  /*      cation elle-même dans un iframe, règle une présentation, et lit */
  /*      son DOM. Une passe qui rend juste les composants ne prouve pas   */
  /*      que le réglage atteint l'écran.                                 */
  /*                                                                     */
  /*   4. `--only bills` lance `tools/bills.html`, dans une passe et un  */
  /*      profil à part : le banc des factures partage le disque avec    */
  /*      l'application qu'il pilote, et deux vues en mémoire du même    */
  /*      stockage s'effacent l'une l'autre à chaque écriture.           */
  /*   5. `--only expenses` lance `tools/expenses.html` : le formulaire   */
  /*      de dépense (catégories en cases, montant, date) et la règle     */
  /*      qu'une dépense ordinaire ne touche jamais un investissement.    */
  /*      Profil à part, pour les mêmes raisons.                          */
  /*   6. `--only export` lance `tools/export-check.html` : il construit  */
  /*      le classeur et le CSV avec les vraies données, puis vérifie que */
  /*      l'écran des Réglages mène bien au fichier.                      */
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
const THEME = flag('theme') === 'dark' ? 'dark' : 'light'
const SHOT = flag('shot')
const KEEP = argv.includes('--keep')
const E2E = argv.includes('--e2e') || flag('only') === 'e2e'
const ONLY = flag('only')

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
  const app = fs.readFileSync(path.join(ROOT, 'src/core/app.js'), 'utf8')
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

  /* Un appareil resté sur du vieux code publie une liste sans les dépenses :
     la version publiée doit donc s'installer d'elle-même, une fois par
     session, sans dépendre d'un clic. */
  const pwa = fs.readFileSync(path.join(ROOT, 'src/app/pwa.js'), 'utf8')
  results.push({
    name: 'pwa.js installe la mise à jour publiée',
    pass: /installUpdate\s*\(/.test(pwa) && /sessionStorage/.test(pwa),
    detail: /installUpdate\s*\(/.test(pwa) ? 'installation automatique' : 'mise à jour laissée au clic',
  })
  /* Le bouton des Réglages doit installer dès qu'il trouve une version :
     « le bouton est prêt » demandait un second clic que personne ne faisait. */
  const settings = fs.readFileSync(path.join(ROOT, 'src/screens/settings/index.js'), 'utf8')
  results.push({
    name: 'Réglages : un clic cherche et installe',
    pass: /if \(result\.available\) \{[\s\S]{0,160}installUpdate\(\)/.test(settings),
    detail: /le bouton est prêt/.test(settings) ? 'second clic encore exigé' : 'installation en un geste',
  })
  /* Un appareil déjà réglé sur le lien privé n'affichait que ce champ : le
     jeton GitHub restait introuvable. Le choix doit être deux cartes visibles
     et le champ du jeton nommé sans ambiguïté. */
  results.push({
    name: 'Réglages : le choix GitHub et le champ du jeton sont visibles',
    pass:
      /class="provider-choice"/.test(settings) &&
      /data-provider-choice="github"/.test(settings) &&
      /Jeton GitHub/.test(settings),
    detail: /provider-card/.test(settings) ? 'deux cartes + champ nommé' : 'choix encore discret',
  })

  /* L'aiguillage du partage doit transmettre TOUTES les collections. Il n'en
     transmettait que six sur sept : les dépenses étaient perdues entre le
     store et le Worker, sans erreur et sans trace. La signature est donc
     vérifiée ici, en plus du banc de bout en bout. */
  const sync = fs.readFileSync(path.join(ROOT, 'src/data/sync.js'), 'utf8')
  const router = sync.match(/export function putRemoteList\(([^)]*)\)/)
  const params = router ? router[1].split(',').map((p) => p.trim()) : []
  results.push({
    name: 'aiguillage : les dépenses sont transmises aux deux fournisseurs',
    pass:
      params.length === 7 &&
      /worker\.putRemoteList\([^)]*\bexpenses\b[^)]*\)/.test(sync) &&
      /github\.putRemoteList\([^)]*\bexpenses\b[^)]*\)/.test(sync),
    detail:
      params.length === 7
        ? 'sept arguments transmis au lien privé et à GitHub'
        : `${params.length} argument(s) — « expenses » perdu`,
  })

  /* GitHub porte maintenant le document complet. Une signature à quatre
     paramètres écrivait un fichier valide mais sans factures, analyse ni
     dépenses — la même perte silencieuse que la sauvegarde. */
  const githubSource = fs.readFileSync(path.join(ROOT, 'src/data/github.js'), 'utf8')
  const writer = githubSource.match(/export async function putRemoteList\(([^)]*)\)/)
  const writerParams = writer ? writer[1].split(',').map((p) => p.trim()) : []
  results.push({
    name: 'github : le fichier porte les quatre collections',
    pass:
      writerParams.length === 7 &&
      /version:\s*DOC_VERSION/.test(githubSource) &&
      /\bproducts:\s*outList/.test(githubSource) &&
      /\bbills:\s*outBills/.test(githubSource) &&
      /\banalysis:\s*outAnalysis/.test(githubSource) &&
      /\bexpenses:\s*outExpenses/.test(githubSource),
    detail:
      writerParams.length === 7
        ? 'liste, factures, analyse, dépenses'
        : `${writerParams.length} argument(s) — collections perdues`,
  })

  /* Même piège à la sauvegarde : un `exportJSON` à trois paramètres écrit un
     fichier valide mais sans les dépenses, et personne ne le voit avant d'en
     avoir besoin. */
  const backup = fs.readFileSync(path.join(ROOT, 'src/data/backup.js'), 'utf8')
  const exporter = backup.match(/export function exportJSON\(([^)]*)\)/)
  const exportParams = exporter ? exporter[1].split(',').map((p) => p.trim()) : []
  results.push({
    name: 'sauvegarde : les dépenses sortent dans le fichier JSON',
    pass: exportParams.length === 4 && /toJSON\([^)]*\bexpenses\b[^)]*\)/.test(backup),
    detail: exportParams.length === 4 ? 'produits, factures, analyse, dépenses' : `${exportParams.length} argument(s) — « expenses » perdu`,
  })

  results.push(...(await Promise.all(jsFiles(path.join(ROOT, 'src')).map(checkSyntax))))

  /* Les bancs du navigateur sont du JavaScript Living dans du HTML : rien ne
     les vérifie, et une simple accolade en trop les laisse muets jusqu'à
     l'expiration du délai. On les analyse donc ici, avant le navigateur. */
  for (const page of ['check-page.html', 'e2e.html', 'preview.html', 'bills.html', 'expenses.html', 'export-check.html']) {
    const file = path.join(ROOT, 'tools', page)
    if (!fs.existsSync(file)) continue
    const html = fs.readFileSync(file, 'utf8')
    const modules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1])
    if (!modules.length) {
      results.push({ name: `syntaxe tools/${page}`, pass: false, detail: 'aucun module à analyser' })
      continue
    }
    for (const [i, code] of modules.entries()) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'check-html-'))
      fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"module"}')
      fs.writeFileSync(path.join(sandbox, 'module.js'), code)
      const child = spawn(process.execPath, ['--check', 'module.js'], { cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', (chunk) => (stderr += chunk))
      const codeOut = await new Promise((resolve) => child.on('close', resolve))
      fs.rmSync(sandbox, { recursive: true, force: true })
      const message = stderr.split('\n').find((line) => line.includes('Error')) || ''
      results.push({
        name: `syntaxe tools/${page} (module ${i + 1})`,
        pass: codeOut === 0,
        detail: message,
      })
    }
  }

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
      if (req.method === 'POST' && req.url === '/__check/log') {
        /* Filet de débogage : la page peut signaler où elle en est. Sans lui,
           un banc qui n'aboutit pas ne dit rien de plus que « rien reçu ». */
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          console.log(dim(`  · ${body}`))
          res.writeHead(200).end('ok')
        })
        return
      }
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

async function browserChecks(page = 'check-page.html', label = 'rendu') {
  const browser = findBrowser()
  const reportFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'check-')), 'report.json')
  const server = await serve(reportFile)
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/tools/${page}?theme=${THEME}`
  const shot = SHOT ? path.resolve(SHOT) : null

  console.log(dim(`\n${path.basename(browser)} — ${WIDTH}px, thème ${THEME}, passe « ${label} »${shot ? ' + capture' : ''}`))

/* Les bancs qui lancent la vraie application : ils ont besoin de minuteries
   réelles et d'un budget plus large que le rendu de composants. */
const REAL_APP_PAGES = ['e2e.html', 'bills.html', 'expenses.html', 'export-check.html']

const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    /* Sans cela, la page du banc passe pour être en arrière-plan et le
       navigateur ramène ses minuteries à une par seconde : la sonde de
       démarrage, qui attend cinq secondes, en prendrait une minute. */
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--window-size=${WIDTH},${HEIGHT}`,
    /* Ces bancs attendent le vrai démarrage de l'application : le budget de
       temps virtuel avancerait l'horloge de la page et ferait boucler la
       sonde avant que la liste ne soit rendue. On lui laisse des minuteries
       réelles, et c'est le délai du rapport qui borne l'attente. */
    ...(REAL_APP_PAGES.includes(page) ? [] : ['--virtual-time-budget=15000']),
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'check-profile-'))}`,
  ]
  if (shot && !REAL_APP_PAGES.includes(page)) args.push(`--screenshot=${shot}`)
  args.push(url)

  const child = spawn(browser, args, { stdio: 'ignore' })
  /* L'application réelle démarre lentement (IndexedDB, lecture distante) :
      quatre écrans à la suite demands plus de temps qu'un rendu de composants. */
  const budget = REAL_APP_PAGES.includes(page) ? 150_000 : TIMEOUT_MS
  const deadline = Date.now() + budget
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
    console.log(red(`  NON  le navigateur n'a rien renvoyé (${budget / 1000}s)`))
  } else {
    if (payload.fatal) {
      failures += 1
      console.log(red(`  NON  ${label} : ${payload.fatal.message}`))
      if (payload.fatal.stack) console.log(red(`        ${String(payload.fatal.stack).split('\n')[0].slice(0, 300)}`))
    }
    report(`Dans le navigateur — ${label} (${WIDTH}px, thème ${payload.theme || THEME})`, payload.results)
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
if (ONLY === 'bills') {
  const answered = await browserChecks('bills.html', 'factures')
  if (!answered) {
    console.log(red('\nImpossible de vérifier les factures.'))
  }
} else if (ONLY === 'expenses') {
  const answered = await browserChecks('expenses.html', 'dépenses')
  if (!answered) {
    console.log(red('\nImpossible de vérifier les dépenses.'))
  }
} else if (ONLY === 'export') {
  const answered = await browserChecks('export-check.html', 'export tableur')
  if (!answered) {
    console.log(red("\nImpossible de vérifier l'export."))
  }
} else {
  const answered = await browserChecks()
  if (!answered) {
    console.log(red('\nImpossible de vérifier le rendu.'))
  }
  if (E2E && ONLY !== 'render') await browserChecks('e2e.html', 'application réelle')
}
console.log(failures === 0 ? `\n${green('Tout passe.')}\n` : `\n${red(`${failures} échec(s).`)}\n`)
process.exit(failures === 0 ? 0 : 1)
