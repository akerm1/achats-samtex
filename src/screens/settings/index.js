/* ------------------------------------------------------------------ */
/* Vue Réglages — thème, partage entre appareils, données, à propos    */
/*                                                                      */
/* Refonte 8.4 : les réglages ne sont plus une liste de définitions    */
/* (`libellé à gauche, contrôle à droite`), mais des **tuiles         */
/* regroupées par thème**. Sur téléphone, un contrôle aligné à droite  */
/* d'un libellé long est hors de portée du pouce : le libellé se replie */
/* sur plusieurs lignes et le contrôle passe tout seul sur sa ligne.    */
/*                                                                      */
/*   .tilegroup — un groupe, avec son sur-titre                        */
/*     .setting         une ligne de réglage                            */
/*       .setting-copy     libellé + aide                             */
/*       .setting-control  le contrôle                                */
/* ------------------------------------------------------------------ */

import { $, esc, formatDate, formatRelative, readableBytes } from '../../core/utils.js'
import { THEMES, getThemePreference } from '../../core/theme.js'
import { isPersisted, storage } from '../../core/storage.js'
import { toast } from '../../core/feedback.js'
import { exportCSV, exportJSON, parseBackup } from '../../data/backup.js'
import { EXPORT_FORMATS, formatOf } from '../../data/exporter.js'
import { EXPORT_SCOPES } from '../../data/export-tables.js'
import { EXPORT_PERIODS, getAutoExport, isDue, nextRunAt, supportsDestination } from '../../app/autoexport.js'
import { importAnalysis } from '../../data/analysis-store.js'
import { getExpenses, importExpenses } from '../../data/expenses-store.js'
import { LINK_PLACEHOLDER, fetchDefaultConfig, normalizeConfig, testConnection } from '../../data/sync.js'
import { CARD_LAYOUTS } from '../../data/products-model.js'
import {
  getBills,
  getConfig,
  getLastSyncAt,
  getProducts,
  getState,
  getPrefs,
  importBills,
  importFromGithub,
  importProducts,
  isLoaded,
  saveConfig,
  setPrefs,
  setSyncMessage,
} from '../../data/store.js'
import { checkForUpdate, getUpdateState, installUpdate } from '../../core/update.js'
import { APP_RELEASE, APP_VERSION } from '../../core/app.js'
import { isInstalled } from '../../ui/shell.js'
import { icon } from '../../ui/icons.js'
import { deferWhileEditing, loadingBlock } from '../../ui/dialog.js'

export { APP_VERSION }

let host = null
/* Empreinte de ce qui est affiché : évite de redessiner (et donc d'effacer
   une saisie en cours) quand seul le message de connexion a changé. */
let signature = null

const STATUS_CLASS = {
  ready: 'badge--teal',
  local: '',
  connecting: 'badge--blue',
  saving: 'badge--blue',
  offline: 'badge--orange',
  error: 'badge--orange',
}

/**
 * Une ligne de réglage. `wide` empile le contrôle sous le libellé : c'est
 * le cas de tout ce qui dépasse deux ou trois mots (un formulaire, une
 * range de boutons, une série d'actions).
 */
function tile(title, help, control, { wide = false, iconName = '' } = {}) {
  return `
    <div class="setting${wide ? ' setting--wide' : ''}">
      <div class="setting-copy">
        <strong>${iconName ? icon(iconName, 15) : ''}${esc(title)}</strong>
        ${help ? `<p>${help}</p>` : ''}
      </div>
      <div class="setting-control">${control}</div>
    </div>`
}

/** Un groupe de réglages : un sur-titre, puis une ou plusieurs tuiles. */
function group(title, body) {
  return `
    <section class="tilegroup">
      <h2 class="tilegroup-title">${esc(title)}</h2>
      <div class="tilegroup-body">${body}</div>
    </section>`
}

function themeTile() {
  const preference = getThemePreference()
  return tile(
    'Apparence',
    'Thème clair, sombre, ou aligné sur les réglages de votre appareil. Partagé entre vos appareils.',
    `<div class="segmented" role="group" aria-label="Thème">
      ${THEMES.map(
        (item) => `
        <button type="button" data-theme-choice="${item.value}" class="${item.value === preference ? 'is-active' : ''}">
          ${icon(item.icon, 15)} ${esc(item.label)}
        </button>`,
      ).join('')}
    </div>`,
    { iconName: 'sun' },
  )
}

function layoutTile() {
  const prefs = getPrefs()
  const current = CARD_LAYOUTS.find((item) => item.value === prefs.layout) || CARD_LAYOUTS[0]
  return tile(
    'Présentation de la liste',
    esc(current.hint),
    `<div class="segmented" role="group" aria-label="Présentation de la liste">
      ${CARD_LAYOUTS.map(
        (item) => `
        <button type="button" data-layout-choice="${item.value}" class="${item.value === current.value ? 'is-active' : ''}">
          ${icon(item.icon, 15)} ${esc(item.label)}
        </button>`,
      ).join('')}
    </div>`,
    { iconName: 'grid' },
  )
}

/* Saisies en cours, conservées d'un redessin à l'autre. */
let draft = {}
/* Dépôt GitHub annoncé par l'application, lu une fois : il pré-remplit le
   formulaire pour qu'un premier réglage ne demande pas de retenir un nom. */
let defaults = null

/** Fournisseur affiché : celui de la saisie, sinon celui de la config. */
function selectedProvider(config = getConfig()) {
  return draft.provider || (config?.provider === 'worker' ? 'worker' : 'github')
}

function providerSwitch(selected) {
  return `<div class="provider-picker">
    <p class="provider-label">Enregistrer les données dans…</p>
    <div class="provider-choice" role="radiogroup" aria-label="Mode de partage">
      <button type="button" role="radio" aria-checked="${selected === 'github'}" data-provider-choice="github"
              class="provider-card ${selected === 'github' ? 'is-active' : ''}">
        <span class="provider-card-title">${icon('cloud', 15)} GitHub</span>
        <span class="provider-card-sub">Dépôt + jeton</span>
      </button>
      <button type="button" role="radio" aria-checked="${selected === 'worker'}" data-provider-choice="worker"
              class="provider-card ${selected === 'worker' ? 'is-active' : ''}">
        <span class="provider-card-title">${icon('link', 15)} Lien privé</span>
        <span class="provider-card-sub">Une seule adresse</span>
      </button>
    </div>
  </div>`
}

function githubFields(config) {
  const owner = draft.owner ?? config?.owner ?? defaults?.owner ?? ''
  const repo = draft.repo ?? config?.repo ?? defaults?.repo ?? ''
  const branch = draft.branch ?? config?.branch ?? defaults?.branch ?? 'main'
  const token = draft.token ?? config?.token ?? ''
  return `
      <div class="field">
        <label for="setting-owner">Compte GitHub</label>
        <input class="input" id="setting-owner" autocomplete="off" spellcheck="false"
               autocapitalize="off" autocorrect="off" placeholder="votre-compte"
               value="${esc(owner)}">
      </div>
      <div class="field">
        <label for="setting-repo">Dépôt</label>
        <input class="input" id="setting-repo" autocomplete="off" spellcheck="false"
               autocapitalize="off" autocorrect="off" placeholder="achats-test"
               value="${esc(repo)}">
      </div>
      <div class="field">
        <label for="setting-branch">Branche</label>
        <input class="input" id="setting-branch" autocomplete="off" spellcheck="false"
               autocapitalize="off" autocorrect="off" placeholder="main"
               value="${esc(branch)}">
      </div>
      <div class="field">
        <label for="setting-token">Jeton GitHub — collez-le ici</label>
        <input class="input" id="setting-token" type="password" autocomplete="off" spellcheck="false"
               autocapitalize="off" autocorrect="off" placeholder="github_pat_…"
               value="${esc(token)}">
      </div>
      <p class="field-hint">
        <strong>Où le trouver :</strong> GitHub → Settings → Developer settings → Fine-grained
        tokens → Generate new token. Choisissez le dépôt <code>${esc(repo || 'achats-test')}</code> et le droit
        <strong>Contents : Read and write</strong>, puis collez le jeton ci-dessus.
        Il reste sur cet appareil et n'est jamais publié. Sans jeton, un dépôt public reste lisible,
        mais rien ne peut être publié.
      </p>`
}

function workerFields(config) {
  return `
      <div class="field">
        <label for="setting-endpoint">Votre lien privé</label>
          <input class="input" id="setting-endpoint" autocomplete="off" spellcheck="false"
                 autocapitalize="off" autocorrect="off" inputmode="url"
                 placeholder="${esc(LINK_PLACEHOLDER)}" value="${esc(draft.endpoint ?? config?.endpoint ?? '')}">
      </div>
      <p class="field-hint">
        Un lien privé est une adresse qui contient elle-même votre clé, par exemple
        <code>https://liste-achats.mon-sous-domaine.workers.dev/x7k2…</code>. Il n'y a <strong>ni jeton,
        ni expiration, ni droit à cocher</strong> : vous collez le lien une fois par appareil et vous
        pouvez lire comme écrire partout.
        <br />        Ce lien <em>est</em> votre mot de passe : ne le publiez pas et ne le collez pas dans un
        chat. Le réglage du Worker est expliqué dans le <code>README.md</code> du dépôt de
        l'application.
      </p>`
}

function shareTile() {
  const config = getConfig()
  const { status, statusLabel, message, messageKind, readOnly } = getState()
  const lastSyncAt = getLastSyncAt()
  const selected = selectedProvider(config)
  const expenses = getExpenses().expenses.length
  const description =
    selected === 'worker'
      ? 'La liste, les factures, l\'analyse et les dépenses sont enregistrées dans votre <strong>lien privé</strong> : les mêmes données s\'affichent sur tous vos appareils, au rafraîchissement de la page ou d\'un clic sur « Synchroniser ».'
      : 'La liste, les factures, l\'analyse et les dépenses sont enregistrées dans le fichier <code>products.json</code> d\'un <strong>dépôt GitHub</strong> : les mêmes données s\'affichent sur tous vos appareils, au rafraîchissement de la page ou d\'un clic sur « Synchroniser ».'
  const connection =
    config?.provider === 'worker'
      ? 'Connecté à votre lien privé.'
      : config?.owner
        ? `Connecté au dépôt <strong>${esc(config.owner)}/${esc(config.repo)}</strong>${readOnly ? ' — lecture seule, ajoutez un jeton pour publier.' : ' — lecture et écriture.'}`
        : 'Aucun partage connecté : tout reste sur cet appareil.'
  return `
    <div class="setting setting--wide">
      <div class="setting-copy">
        <strong>${icon('cloud', 15)} Partage entre appareils</strong>
        <p>${description} ${connection}</p>
      </div>

      <div class="setting-control">
        <form id="share-form" class="u-stack share-form">
          ${providerSwitch(selected)}
          ${selected === 'worker' ? workerFields(config) : githubFields(config)}
          <div class="u-row u-wrap">
            <span class="form-message${messageKind ? ` is-${messageKind}` : ''}" data-role="github-status">${message ? esc(message) : ''}</span>
            ${
              config?.provider === 'worker'
                ? `<button type="button" class="btn btn--secondary btn--sm" data-action="import-from-github">${icon('download', 13)} Importer depuis GitHub</button>`
                : ''
            }
            <button type="button" class="btn btn--ghost btn--sm" data-action="test-share">${icon('link', 13)} Tester la connexion</button>
            <button type="submit" class="btn btn--primary btn--sm">${icon('save', 13)} Enregistrer</button>
            ${
              config
                ? `<button type="button" class="btn btn--ghost btn--sm" data-action="sync-now">${icon('refresh', 13)} Synchroniser</button>
                   <button type="button" class="btn btn--danger btn--sm" data-action="disconnect-github">${icon('x', 13)} Déconnecter</button>`
                : ''
            }
          </div>
        </form>

        <div class="kv">
          <div class="kv-item">
            <small>État</small>
            <strong><span class="badge ${STATUS_CLASS[status] || ''}" data-role="github-state">${esc(statusLabel)}</span></strong>
          </div>
          <div class="kv-item">
            <small>Dernière synchro</small>
            <strong>${lastSyncAt ? esc(formatRelative(lastSyncAt)) : '—'}</strong>
          </div>
          <div class="kv-item">
            <small>Produits</small>
            <strong>${getProducts().length}</strong>
          </div>
          <div class="kv-item">
            <small>Factures</small>
            <strong>${getBills().length}</strong>
          </div>
          <div class="kv-item">
            <small>Dépenses</small>
            <strong>${expenses}</strong>
          </div>
          <div class="kv-item">
            <small>${config?.provider === 'worker' ? 'Lien privé' : 'Accès GitHub'}</small>
            <strong><span class="badge ${readOnly ? 'badge--orange' : 'badge--teal'}" data-role="github-access">${
              readOnly ? 'Lecture seule' : 'Lecture + écriture'
            }</span></strong>
          </div>
        </div>
      </div>
    </div>`
}

function dataTile() {
  return tile(
    'Sauvegarde & export',
    'Enregistrez la liste dans un fichier, à ouvrir ensuite dans Excel (CSV) ou à réimporter dans l\'application (JSON). L\'import en mode « fusion » met à jour les produits existants et ajoute les nouveaux.',
    `<div class="u-row u-wrap">
      <button type="button" class="btn btn--secondary btn--sm" data-action="export-json">${icon('save', 13)} Sauvegarde JSON</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="export-csv">${icon('download', 13)} Export CSV</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="import-json">${icon('upload', 13)} Importer</button>
      <select class="select" data-role="import-mode" aria-label="Mode d'import">
        <option value="merge">Fusionner avec la liste</option>
        <option value="replace">Remplacer toute la liste</option>
      </select>
      <input type="file" accept=".json,application/json" data-role="import-file" hidden>
    </div>`,
    { wide: true, iconName: 'download' },
  )
}

/**
 * Export Excel / CSV, à la demande ou au rythme choisi.
 *
 * Une page web ne peut pas déposer un fichier dans « Téléchargements »
 * sans un geste. Le seul moyens de faire vraiment « tout seul » est de
 * désigner UN fichier une fois (File System Access) : l'application le
 * réécrit ensuite à chaque échéance. Sans fichier désigné, elle le
 * signale et enregistre au premier appui.
 */
function exportTile() {
  const config = getAutoExport()
  const due = isDue(config)
  const next = nextRunAt(config)
  const supported = supportsDestination()
  const options = (list, current) =>
    list
      .map((item) => `<option value="${item.value}"${item.value === current ? ' selected' : ''}>${esc(item.label)}</option>`)
      .join('')

  const state = config.lastAt
    ? `Dernier export ${formatRelative(config.lastAt)}`
    : 'Aucun export pour le moment'
  const nextLine =
    config.period === 'off'
      ? ''
      : next
        ? ` · prochain ${formatDate(next.toISOString())}`
        : ''
  const dueLine = due
    ? `<span class="badge badge--orange" data-role="export-due">Export dû</span>`
    : ''
  const extension = formatOf(config.format).extension
  const matches = config.name.toLowerCase().endsWith('.' + extension)
  const fileLine = config.name
    ? matches
      ? `Fichier : <strong>${esc(config.name)}</strong> — réécrit à chaque échéance tant que l'application est ouverte.`
      : `Fichier : <strong>${esc(config.name)}</strong> — il ne correspond pas au format choisi. Reprenez « Choisir un fichier » pour qu'il soit écrit, sinon l'export repassera par un téléchargement.`
    : supported
      ? "Choisissez un fichier une fois : il sera alors mis à jour tout seul, sans nouvelle boîte de dialogue."
      : "Ce navigateur ne sait pas réécrire un fichier seul : l'application vous rappellera de l'enregistrer."

  return tile(
    'Export Excel & CSV',
    `Un fichier pour le tableur, avec une feuille par table (produits, dépenses, recettes,
     investissements, catégories, factures) et un résumé des chiffres. Le CSV suit la
     convention française : point-virgule et virgule décimale.`,
    `<div class="export-panel">
      <div class="export-grid">
        <label class="export-field">
          <span>Contenu</span>
          <select class="select" data-action="set-export-scope" aria-label="Contenu de l'export">
            ${options(EXPORT_SCOPES, config.scope)}
          </select>
        </label>
        <label class="export-field">
          <span>Format</span>
          <select class="select" data-action="set-export-format" aria-label="Format de l'export">
            ${options(EXPORT_FORMATS, config.format)}
          </select>
        </label>
        <label class="export-field">
          <span>Rythme</span>
          <select class="select" data-action="set-export-period" aria-label="Rythme de l'export automatique">
            ${options(EXPORT_PERIODS, config.period)}
          </select>
        </label>
      </div>
      <div class="u-row u-wrap">
        <button type="button" class="btn btn--primary btn--sm" data-action="export-now">
          ${icon('download', 13)} Télécharger maintenant
        </button>
        ${
          supported
            ? `<button type="button" class="btn btn--secondary btn--sm" data-action="pick-export-file">
                 ${icon('save', 13)} ${config.name ? 'Changer de fichier' : 'Choisir un fichier'}
               </button>`
            : ''
        }
        ${
          due
            ? `<button type="button" class="btn btn--secondary btn--sm" data-action="export-due-now">
                 ${icon('refresh', 13)} Enregistrer l'export dû
               </button>`
            : ''
        }
      </div>
      <p class="export-state">${dueLine} ${state}${nextLine}</p>
      <p class="setting-sub">${fileLine}</p>
    </div>`,
    { wide: true, iconName: 'download' },
  )
}

function dangerTile() {
  const products = getProducts().length
  const bills = getBills().length
  const what = [`${products} produit${products > 1 ? 's' : ''}`, `${bills} facture${bills > 1 ? 's' : ''}`].join(' et ')
  return tile(
    'Vider la liste',
    `Supprime ${what} de cet appareil${getConfig() ? ' et du fichier de partage' : ''}. Pensez à exporter une sauvegarde avant.`,
    `<button type="button" class="btn btn--danger btn--sm" data-action="clear-all">${icon('trash', 13)} Tout supprimer</button>`,
    { iconName: 'trash' },
  )
}

function installTile() {
  if (isInstalled()) return ''
  return tile(
    'Installer sur le téléphone',
    "Téléchargez l'application sur votre écran d'accueil : icône dédiée, démarrage sans navigateur et utilisation hors-ligne.",
    `<button type="button" class="btn btn--primary btn--sm" data-action="install-app">${icon('download', 14)} Installer</button>`,
    { iconName: 'download' },
  )
}

/**
 * Bouton de mise à jour : toujours présent, jamais caché.
 * Un clic cherche sur GitHub ; si une version plus récente existe, le bouton
 * devient « Installer la mise à jour » et c'est le second clic qui installe.
 */
function updateTile() {
  const { current, published, available, checking, installing, offline } = getUpdateState()
  const busy = checking || installing
  const label = installing
    ? 'Installation…'
    : checking
      ? 'Recherche…'
      : available
        ? `Installer la mise à jour ${esc(published)}`
        : 'Rechercher une mise à jour'
  return tile(
    'Mise à jour de l\'application',
    `Version installée <strong>${current}</strong>${
      published ? ` · version publiée <strong>${esc(published)}</strong>` : ''
    } (${APP_RELEASE}). ${
      available
        ? 'Nouvelle version disponible : cliquez pour l\'installer et recharger l\'application.'
        : 'Cliquez pour interroger GitHub : si une version plus récente est publiée, elle s\'installe aussitôt.'
    } ${offline ? ' Vérification impossible hors ligne.' : ''}`,
    `<button type="button" class="btn btn--${available ? 'primary' : 'secondary'} btn--sm" data-action="check-update" ${busy ? 'disabled' : ''}>
      ${icon('refresh', 14)} ${label}
    </button>`,
    { iconName: 'refresh' },
  )
}

function aboutTile() {
  const persistent = storage.isPersistent()
  const state = getState()
  const { bytes = 0, photos = 0, photoBytes = 0, separated = false } = state.usage || {}
  /* Les tickets de facture sont déjà comptés dans `photos` (le store mesure
     les deux collections) : les compter une fois de plus ferait annoncer un
     stockage plus lourd qu'il ne l'est. */
  const products = state.products?.length || 0
  const bills = state.bills?.length || 0
  const full = Boolean(state.storageFull)
  const hasPhotos = photos > 0
  /* Les navigateurs tiennent autour de 5 à 10 Mo d'origine. Le texte seul
     n'en approche jamais la moitié, donc la marge affichée reste indicative ;
     ce qui compte, c'est que l'écriture ne soit plus refusée en silence. */
  const ceiling = full ? 0 : Math.max(0, Math.round(80 - (bytes / (10 * 1024 * 1024)) * 100))
  const photoShare = separated && bytes ? Math.round((photoBytes / bytes) * 100) : 0
  return `
    ${
      full
        ? `<div class="form-message is-error" data-role="storage-warning">
             <strong>Stockage du navigateur plein.</strong> Vos photos ne sont plus enregistrées sur cet appareil :
             la liste s'affiche encore, mais elle sera perdue à la fermeture.
             Exportez une sauvegarde JSON, puis retirez des photos.
           </div>`
        : ''
    }
    ${tile(
      'Application',
      `Version <strong>${APP_VERSION}</strong> · PWA statique, sans dépendance ni build.
       ${isInstalled() ? 'Installée sur cet appareil.' : 'Ouvrez-la dans le navigateur du téléphone pour l’installer.'}`,
      `<div class="u-row u-wrap">
        <span class="badge ${isInstalled() ? 'badge--teal' : ''}">${isInstalled() ? 'Installée' : 'Navigateur'}</span>
        <span class="badge ${full ? 'badge--orange' : persistent ? 'badge--teal' : 'badge--orange'}">
          ${full ? 'Stockage plein' : persistent ? 'Stockage local actif' : 'Stockage limité'}
        </span>
      </div>`,
      { iconName: 'shield' },
    )}

    ${tile(
      'Stockage sur cet appareil',
      `<span data-role="storage-usage">
         ${products} produit${products > 1 ? 's' : ''}${bills ? ` · ${bills} facture${bills > 1 ? 's' : ''}` : ''}
         · ${photos} photo${photos > 1 ? 's' : ''}
         ${hasPhotos ? ` (${separated ? readableBytes(photoBytes) + ' hors de la liste' : `${photoShare} % du poids`})` : ''}
       </span>
       <span class="setting-sub" data-role="storage-quota">Espace accordé par le navigateur : mesure en cours…</span>
       <span class="setting-sub" data-role="storage-detail">
         ${
           separated
             ? `Liste : ${readableBytes(bytes)}${hasPhotos ? ` · photos : ${readableBytes(photoBytes)} stockées à part, hors de la limite du navigateur.` : ''}`
             : `Liste : ${readableBytes(bytes)} sur cet appareil${hasPhotos ? `, photos comprises.` : '.'} ${
                 full ? '' : `Environ ${ceiling} % de marge restante.`
               }`
         }
       </span>`,
      '',
      { iconName: 'chart' },
    )}

    ${tile(
      'Raccourcis clavier',
      `<code>N</code> nouveau produit · <code>/</code> rechercher · <code>Échap</code> fermer une fenêtre ·
       <code>1</code><code>2</code><code>3</code><code>4</code> changer de vue · <code>S</code> synchroniser.`,
      '',
      { wide: true, iconName: 'sparkles' },
    )}`
}

/**
 * Ce que le navigateur accorde vraiment à l'origine, et ce qu'on en utilise.
 *
 * Une estimation à la main (« 5 à 10 Mo ») donnait un pourcentage inventé :
 * la seule réponse honnête vient de `navigator.storage.estimate()`.
 */
async function paintQuota() {
  const node = host?.querySelector('[data-role="storage-quota"]')
  if (!node) return
  if (!navigator.storage?.estimate) {
    node.remove()
    return
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persisted = await isPersisted()
    if (!quota) {
      node.remove()
      return
    }
    const share = Math.max(0, Math.round((usage / quota) * 100))
    node.textContent =
      `Espace accordé par le navigateur : ${readableBytes(quota)} · utilisé ${readableBytes(usage)} (${share} %).` +
      (persisted ? ' Le navigateur s’est engagé à conserver ces données.' : '')
  } catch {
    node.remove()
  }
}

/** Met à jour la ligne d'état et le badge sans redessiner la vue entière. */
function paintStatus() {
  if (!host) return
  const { message, messageKind, status, statusLabel } = getState()
  const line = host.querySelector('[data-role="github-status"]')
  if (line) {
    line.textContent = message || ''
    line.className = `form-message${messageKind ? ` is-${messageKind}` : ''}`
  }
  const badge = host.querySelector('[data-role="github-state"]')
  if (badge) {
    badge.className = `badge ${STATUS_CLASS[status] || ''}`
    badge.textContent = statusLabel
  }
}

function template() {
  return `
    <section class="view view--settings">
      <header class="screen-head">
        <div class="screen-head-main">
          <span class="screen-eyebrow">Préférences</span>
          <h1 class="screen-title">Réglages</h1>
          <p class="screen-sub">Apparence, partage entre appareils, sauvegardes et informations.</p>
        </div>
      </header>

      ${group('Affichage', themeTile() + layoutTile())}
      ${group('Partage', shareTile())}
      ${group('Données', dataTile() + exportTile() + dangerTile())}
      ${group('Application', installTile() + updateTile() + aboutTile())}

    </section>`
}

/* Champs du formulaire de partage : identifiant DOM -> clé de `draft`. */
const DRAFT_FIELDS = {
  'setting-endpoint': 'endpoint',
  'setting-owner': 'owner',
  'setting-repo': 'repo',
  'setting-branch': 'branch',
  'setting-token': 'token',
}

/**
 * Saisies en cours, à conserver avant tout redessin.
 * Seuls les champs présents dans le DOM sont relus : changer de fournisseur
 * ne doit pas effacer les valeurs de l'autre formulaire.
 */
function readDraft() {
  for (const [id, key] of Object.entries(DRAFT_FIELDS)) {
    const field = host?.querySelector(`#${id}`)
    if (field) draft[key] = field.value
  }
}

/**
 * Le `draft` doit suivre la saisie, sinon un bouton peut valider une valeur
 * vieille de plusieurs secondes — c'est-à-dire une valeur absente. Un seul
 * écouteur sur le formulaire suffit : il couvre frappe, collage et
 * corrections, sans dupliquer la liste des champs.
 */
function watchDraft() {
  const form = host?.querySelector('#share-form')
  if (!form) return
  form.addEventListener('input', (event) => {
    const key = DRAFT_FIELDS[event.target?.id]
    if (key) draft[key] = event.target.value
  })
}

/** Configuration telle que saisie : GitHub (compte, dépôt, jeton) ou lien privé. */
function currentConfig() {
  if (selectedProvider() === 'worker') return { provider: 'worker', endpoint: draft.endpoint }
  return {
    owner: draft.owner,
    repo: draft.repo,
    branch: draft.branch,
    token: draft.token,
  }
}

/** Message d'erreur adapté au formulaire affiché. */
function incompleteMessage() {
  if (selectedProvider() === 'worker') {
    return 'Lien privé incomplet ou modifié. Collez la ligne entière du fichier worker\\LIEN-PRIVE.txt, sans guillemets ni espace : le clavier du téléphone peut ajouter une majuscule ou couper le texte.'
  }
  return 'Compte et dépôt GitHub nécessaires (par exemple akerm1 et achats-test). Sans jeton, le dépôt public reste lisible en lecture seule.'
}

async function handleTest() {
  /* Sans cette lecture, `draft` est encore vide : le bouton « Tester » ne
     lisait jamais le champ, et un lien parfaitement collé était rejeté
     comme « incomplet ». */
  readDraft()
  const config = normalizeConfig(currentConfig())
  if (!config) {
    setSyncMessage(incompleteMessage(), 'error')
    return
  }
  setSyncMessage('Connexion en cours…')
  const result = await testConnection(config)
  setSyncMessage(result.message, result.ok ? 'ok' : 'error')
}

/** Migration en un clic : la liste GitHub (publique) vers le lien privé. */
async function handleImportFromGithub() {
  setSyncMessage('Copie de la liste publiée sur GitHub…')
  const result = await importFromGithub()
  setSyncMessage(result.message, result.ok ? 'ok' : 'error')
  if (result.ok) toast(`${result.count} produit(s) copiés vers le lien privé.`, { type: 'ok' })
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  let text = ''
  try {
    text = await file.text()
  } catch {
    toast('Impossible de lire ce fichier.', { type: 'error' })
    return
  }
  const parsed = parseBackup(text)
  if (!parsed.ok) {
    toast(parsed.message || 'Fichier invalide.', { type: 'error' })
    return
  }
  const mode = host.querySelector('[data-role="import-mode"]')?.value || 'merge'
  const result = importProducts(parsed.products, { mode })
  const billResult = importBills(parsed.bills, { mode })
  const analysisResult = importAnalysis(parsed.analysis, { mode })
  const expensesResult = importExpenses(parsed.expenses, { mode })
  const details = [
    mode === 'replace'
      ? `${parsed.products.length} produit(s)`
      : `${result.added} produit(s) ajouté(s), ${result.updated} mis à jour`,
    parsed.bills.length ? `${billResult.added + billResult.updated} facture(s)` : '',
    parsed.analysis ? `${analysisResult.added + analysisResult.updated} ligne(s) d'analyse` : '',
    parsed.expenses ? `${expensesResult.added + expensesResult.updated} dépense(s)/investissement(s)/recette(s)` : '',
  ].filter(Boolean)
  toast(`${details.join(' · ')}.`, { type: 'ok' })
}

/**
 * Un seul geste : chercher, et installer si une version plus récente est en
 * ligne. Le « deux temps » d'avant laissait le bouton afficher « Installer la
 * mise à jour » sans que rien ne se passe au clic suivant — un appareil
 * pouvait donc rester des versions en arrière sans que personne ne s'en
 * aperçoive.
 */
async function handleCheckUpdate() {
  const { available, published } = getUpdateState()
  if (available) return installUpdate()

  setSyncMessage('Recherche d\'une mise à jour…')
  const result = await checkForUpdate()
  settingsView.update()

  if (result.offline) {
    setSyncMessage(result.error, 'error')
    return
  }
  if (result.available) {
    setSyncMessage(`Version ${result.published} en ligne — installation…`, 'ok')
    return installUpdate()
  }
  setSyncMessage(`Déjà à jour (version ${published || result.current}).`, 'ok')
  toast('Aucune mise à jour disponible.', { type: 'info' })
}

function bind() {
  host.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      setPrefs({ theme: button.dataset.themeChoice })
      host.querySelectorAll('[data-theme-choice]').forEach((other) =>
        other.classList.toggle('is-active', other === button),
      )
    })
  })

  host.querySelectorAll('[data-layout-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      setPrefs({ layout: button.dataset.layoutChoice })
      host.querySelectorAll('[data-layout-choice]').forEach((other) =>
        other.classList.toggle('is-active', other === button),
      )
      /* Le texte d'aide décrit le mode choisi. On le remplace sur place :
         redessiner la vue effacerait les saisies de la section suivante. */
      const chosen = CARD_LAYOUTS.find((item) => item.value === button.dataset.layoutChoice)
      const copy = button.closest('.setting')?.querySelector('.setting-copy p')
      if (chosen && copy) copy.textContent = chosen.hint
    })
  })

  host.querySelectorAll('[data-provider-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      readDraft()
      draft.provider = button.dataset.providerChoice
      paint()
    })
  })

  host.querySelector('#share-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    /* Idem : « Enregistrer » ne lisait pas les champs non plus. */
    readDraft()
    const config = normalizeConfig(currentConfig())
    if (!config) {
      setSyncMessage(incompleteMessage(), 'error')
      return
    }
    const provider = selectedProvider()
    draft = {}
    const state = await saveConfig(config)
    /* En cas d'échec, le store a déjà affiché et notifié le message exact. */
    if (state.messageKind === 'error') return
    const label = provider === 'worker' ? 'lien privé' : 'dépôt GitHub'
    setSyncMessage(`Connecté au ${label}.`, 'ok')
    toast(`Partage connecté au ${label}.`, { type: 'ok' })
  })

  paintQuota()

  host.querySelector('[data-action="test-share"]')?.addEventListener('click', handleTest)
  host.querySelector('[data-action="import-from-github"]')?.addEventListener('click', handleImportFromGithub)
  host.querySelector('[data-action="check-update"]')?.addEventListener('click', handleCheckUpdate)
  host.querySelector('[data-action="import-json"]')?.addEventListener('click', () =>
    host.querySelector('[data-role="import-file"]')?.click(),
  )
  host.querySelector('[data-role="import-file"]')?.addEventListener('change', handleImport)

  /* Le `draft` suit la frappe : sans cela, « Tester » et « Enregistrer »
     lisaient une valeur absente. */
  watchDraft()
}

/** Ce qui, hors message, impose un vrai redessin de la vue. */
function dataSignature() {
  const state = getState()
  const update = getUpdateState()
  return JSON.stringify([
    state.loaded,
    state.status,
    state.lastSyncAt,
    state.products.length,
    state.bills.length,
    getExpenses().expenses.length,
    state.isConfigured,
    update.published,
    update.available,
    update.checking,
    state.provider,
    state.config?.owner || '',
    state.config?.repo || '',
    state.config?.branch || '',
    state.config?.endpoint || '',
    /* Le poids affiché et l'avertissement de quota doivent suivre les
       enregistrements, pas seulement le nombre de produits. */
    state.storageProblem || '',
    state.usage?.bytes || 0,
    state.usage?.photos || 0,
    /* Les réglages d'export pilotent la ligne d'état de leur tuile :
       dernier export, prochaine échéance, fichier retenu. */
    JSON.stringify(getAutoExport()),
    isDue(getAutoExport()),
  ])
}

function paint() {
  host.innerHTML = isLoaded() ? template() : loadingBlock()
  /* Les valeurs par défaut de l'onglet courant ne doivent pas écraser
     une saisie en cours déjà mémorisée. */
  if (host.querySelector('#share-form')) readDraft()
  signature = dataSignature()
  bind()
}

export const settingsView = {
  id: 'settings',
  route: 'reglages',
  label: 'Réglages',
  icon: 'sliders',
  mount(element) {
    host = element
    signature = null
    paint()
    /* Le dépôt public annoncé par l'application pré-remplit le formulaire
       GitHub : un premier réglage ne doit pas demander de retenir un nom. */
    if (!defaults) {
      fetchDefaultConfig()
        .then((value) => {
          defaults = value
          if (value && host && !getConfig()?.owner && !draft.owner) paint()
        })
        .catch(() => {})
    }
  },
  update() {
    if (!host) return
    paintStatus()
    if (dataSignature() === signature) return
    if (deferWhileEditing(host, paint)) return
    paint()
  },
  repaint() {
    if (host) paint()
  },
}