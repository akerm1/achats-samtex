/* ------------------------------------------------------------------ */
/* Vue Réglages — thème, synchronisation GitHub, données, à propos     */
/* ------------------------------------------------------------------ */

import { $, esc, formatRelative } from '../../core/utils.js'
import { THEMES, getThemePreference } from '../../core/theme.js'
import { storage } from '../../core/storage.js'
import { toast } from '../../core/feedback.js'
import { exportCSV, exportJSON, parseBackup } from '../../data/backup.js'
import { testConnection } from '../../data/github.js'
import {
  clearAll,
  clearConfig,
  getConfig,
  getLastSyncAt,
  getSyncMessage,
  getProducts,
  getState,
  importProducts,
  isLoaded,
  saveConfig,
  setPrefs,
  syncNow,
} from '../../data/store.js'
import { isInstalled } from '../shell.js'
import { icon } from '../icons.js'
import { deferWhileEditing, loadingBlock } from '../view.js'

export const APP_VERSION = '6.3.2'

let host = null

const STATUS_CLASS = {
  live: 'badge--teal',
  config: '',
  syncing: 'badge--blue',
  pending: 'badge--blue',
  offline: 'badge--orange',
}

function themeBlock() {
  const preference = getThemePreference()
  return `
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Apparence</strong>
        <p>Thème clair, sombre, ou aligné sur les réglages de votre appareil. Le thème est partagé entre tous vos appareils via GitHub.</p>
      </div>
      <div class="setting-side">
        <div class="segmented" role="group" aria-label="Thème">
          ${THEMES.map(
            (item) => `
            <button type="button" data-theme-choice="${item.value}" class="${item.value === preference ? 'is-active' : ''}">
              ${icon(item.icon, 14)} ${esc(item.label)}
            </button>`,
          ).join('')}
        </div>
      </div>
    </div>`
}

function githubBlock() {
  const config = getConfig()
  const { status } = getState()
  const message = getSyncMessage()
  const lastSyncAt = getLastSyncAt()
  return `
    <div class="setting-block" style="display:block">
      <div class="setting-copy" style="max-width:none">
        <strong>Partage entre appareils (GitHub)</strong>
        <p>
          La liste est enregistrée dans <code>products.json</code> sur votre dépôt GitHub. Tous les appareils qui ouvrent
          la même page se synchronisent automatiquement toutes les 6 secondes. Le thème, le tri et les filtres sont
          également partagés.
          ${config ? `Connecté à <strong>${esc(config.owner)}/${esc(config.repo)}</strong> (branche ${esc(config.branch)}).` : 'Aucun dépôt connecté : la liste reste locale.'}
        </p>
      </div>

      <form id="github-form" class="u-stack" style="margin-top:16px">
        <div class="settings-grid">
          <div class="field">
            <label for="setting-token">Jeton d'accès GitHub</label>
            <input class="input" id="setting-token" type="password" autocomplete="off"
                   placeholder="ghp_… ou github_pat_…" value="${esc(config?.token || '')}">
          </div>
          <div class="field">
            <label for="setting-owner">Propriétaire du dépôt</label>
            <input class="input" id="setting-owner" autocomplete="off" placeholder="votre-nom-github" value="${esc(config?.owner || '')}">
          </div>
          <div class="field">
            <label for="setting-repo">Nom du dépôt</label>
            <input class="input" id="setting-repo" autocomplete="off" placeholder="purchase-gros" value="${esc(config?.repo || '')}">
          </div>
          <div class="field">
            <label for="setting-branch">Branche</label>
            <input class="input" id="setting-branch" autocomplete="off" placeholder="main" value="${esc(config?.branch || 'main')}">
          </div>
        </div>
        <p class="field-hint">
          Créez un jeton « fine-grained » sur GitHub → Settings → Developer settings → Personal access tokens,
          avec la permission <strong>Contents : Read and write</strong> sur ce seul dépôt.
        </p>
        <div class="u-row u-wrap">
          <span class="form-message" data-role="github-status">${
            message ? esc(message) : ''
          }</span>
          <button type="button" class="btn btn--secondary btn--sm" data-action="auto-config">${icon('sparkles', 13)} Configurer automatiquement</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="test-github">${icon('link', 13)} Tester la connexion</button>
          <button type="submit" class="btn btn--primary btn--sm">${icon('save', 13)} Enregistrer</button>
          ${
            config
              ? `<button type="button" class="btn btn--ghost btn--sm" data-action="sync-now">${icon('refresh', 13)} Synchroniser</button>
                 <button type="button" class="btn btn--danger btn--sm" data-action="disconnect-github">${icon('x', 13)} Déconnecter</button>`
              : ''
          }
        </div>
      </form>

      <div class="kv" style="margin-top:16px">
        <div class="kv-item">
          <small>État</small>
          <strong><span class="badge ${STATUS_CLASS[status] || ''}">${esc(getState().statusLabel)}</span></strong>
        </div>
        <div class="kv-item">
          <small>Dernière synchro</small>
          <strong>${lastSyncAt ? esc(formatRelative(lastSyncAt)) : '—'}</strong>
        </div>
        <div class="kv-item">
          <small>Produits partagés</small>
          <strong>${getProducts().length}</strong>
        </div>
      </div>
    </div>`
}

function dataBlock() {
  return `
    <div class="setting-block" style="display:block">
      <div class="setting-copy" style="max-width:none">
        <strong>Sauvegarde &amp; export</strong>
        <p>
          Enregistrez la liste dans un fichier, à ouvrir ensuite dans Excel (CSV) ou à réimporter dans l'application (JSON).
          L'import en mode « fusion » met à jour les produits existants et ajoute les nouveaux.
        </p>
      </div>
      <div class="u-row u-wrap" style="margin-top:14px">
        <button type="button" class="btn btn--secondary btn--sm" data-action="export-json">${icon('save', 13)} Sauvegarde JSON</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="export-csv">${icon('download', 13)} Export CSV</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="import-json">${icon('upload', 13)} Importer</button>
        <select class="select" data-role="import-mode" style="max-width:230px" aria-label="Mode d'import">
          <option value="merge">Fusionner avec la liste</option>
          <option value="replace">Remplacer toute la liste</option>
        </select>
        <input type="file" accept=".json,application/json" data-role="import-file" hidden>
      </div>
    </div>`
}

function dangerBlock() {
  const total = getProducts().length
  return `
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Vider la liste</strong>
        <p>Supprime les ${total} produits de cet appareil ${getConfig() ? 'et du fichier GitHub' : ''}. Pensez à exporter une sauvegarde avant.</p>
      </div>
      <div class="setting-side">
        <button type="button" class="btn btn--danger btn--sm" data-action="clear-all">${icon('trash', 13)} Tout supprimer</button>
      </div>
    </div>`
}

function installBlock() {
  if (isInstalled()) return ''
  return `
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Installer sur le téléphone</strong>
        <p>Téléchargez l'application sur votre écran d'accueil : icône dédiée, démarrage sans navigateur et utilisation hors-ligne.</p>
      </div>
      <div class="setting-side">
        <button type="button" class="btn btn--primary btn--sm" data-action="install-app">${icon('download', 14)} Installer l'application</button>
      </div>
    </div>`
}

function aboutBlock() {
  const persistent = storage.isPersistent()
  return `
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Application</strong>
        <p>
          Version <strong>${APP_VERSION}</strong> · PWA statique, sans dépendance ni build.
          ${isInstalled() ? 'Installée sur cet appareil.' : 'Ouvrez-la dans le navigateur du téléphone pour l’installer.'}
        </p>
      </div>
      <div class="setting-side">
        <span class="badge ${isInstalled() ? 'badge--teal' : ''}">${isInstalled() ? 'Installée' : 'Navigateur'}</span>
        <span class="badge ${persistent ? 'badge--teal' : 'badge--orange'}">
          ${persistent ? 'Stockage local actif' : 'Stockage limité'}
        </span>
      </div>
    </div>

    <div class="setting-block" style="display:block">
      <div class="setting-copy" style="max-width:none">
        <strong>Raccourcis clavier</strong>
        <p>
          <code>N</code> nouveau produit · <code>/</code> rechercher · <code>Échap</code> fermer une fenêtre ·
          <code>1</code><code>2</code> changer de vue · <code>S</code> synchroniser.
        </p>
      </div>
    </div>`
}

function setStatus(text, kind = '') {
  const node = host?.querySelector('[data-role="github-status"]')
  if (!node) return
  node.textContent = text || ''
  node.className = `form-message${kind ? ` is-${kind}` : ''}`
}

function template() {
  return `
    <section class="view">
      <div class="view-head">
        <div>
          <h1>Réglages</h1>
          <p>Apparence, partage entre appareils, sauvegardes et informations sur l'application.</p>
        </div>
      </div>

      <div class="panel">${themeBlock()}</div>
      <div class="panel">${githubBlock()}</div>
      <div class="panel">${dataBlock()}${dangerBlock()}</div>
      <div class="panel">${installBlock()}${aboutBlock()}</div>
    </section>`
}

async function handleTest() {
  const token = host.querySelector('#setting-token')?.value.trim() || ''
  const owner = host.querySelector('#setting-owner')?.value.trim() || ''
  const repo = host.querySelector('#setting-repo')?.value.trim() || ''
  const branch = host.querySelector('#setting-branch')?.value.trim() || 'main'
  if (!token || !owner || !repo) {
    setStatus('Renseignez le jeton, le propriétaire et le nom du dépôt.', 'error')
    return
  }
  setStatus('Connexion en cours…')
  const result = await testConnection({ token, owner, repo, branch })
  setStatus(result.message, result.ok ? 'ok' : 'error')
}

/** Valeurs de repli si `sync-defaults.json` est indisponible (hors-ligne…). */
const FALLBACK_DEFAULTS = { owner: 'akerm1', repo: 'achats-test', branch: 'main' }
let syncDefaults = null

/** Pré-remplit automatiquement propriétaire / dépôt / branche. */
async function handleAutoConfig() {
  setStatus('Préparation de la configuration…')
  if (!syncDefaults) {
    try {
      const response = await fetch('./sync-defaults.json', { cache: 'no-cache' })
      if (response.ok) syncDefaults = await response.json()
    } catch {
      syncDefaults = null
    }
  }
  const d = syncDefaults && typeof syncDefaults === 'object' ? syncDefaults : FALLBACK_DEFAULTS
  host.querySelector('#setting-owner').value = d.owner || ''
  host.querySelector('#setting-repo').value = d.repo || ''
  host.querySelector('#setting-branch').value = d.branch || 'main'
  const hasToken = Boolean(host.querySelector('#setting-token')?.value.trim())
  setStatus(
    hasToken
      ? `Pré-rempli : ${d.owner}/${d.repo} — cliquez Enregistrer.`
      : `Pré-rempli : ${d.owner}/${d.repo} — collez votre jeton puis Enregistrer.`,
    'ok',
  )
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
  toast(
    mode === 'replace'
      ? `Liste remplacée par ${parsed.products.length} produit(s).`
      : `${result.added} produit(s) ajouté(s), ${result.updated} mis à jour.`,
    { type: 'ok' },
  )
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

  host.querySelector('#github-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const token = $('#setting-token', host)?.value.trim() || ''
    const owner = $('#setting-owner', host)?.value.trim() || ''
    const repo = $('#setting-repo', host)?.value.trim() || ''
    const branch = $('#setting-branch', host)?.value.trim() || 'main'
    if (!token || !owner || !repo) {
      setStatus('Renseignez au minimum le jeton, le propriétaire et le nom du dépôt.', 'error')
      return
    }
    saveConfig({ token, owner, repo, branch })
    toast('Liste connectée à GitHub — synchronisation en cours.', { type: 'ok' })
  })

  host.querySelector('[data-action="test-github"]')?.addEventListener('click', handleTest)
  host.querySelector('[data-action="auto-config"]')?.addEventListener('click', handleAutoConfig)
  host.querySelector('[data-action="import-json"]')?.addEventListener('click', () =>
    host.querySelector('[data-role="import-file"]')?.click(),
  )
  host.querySelector('[data-role="import-file"]')?.addEventListener('change', handleImport)
}

function paint() {
  host.innerHTML = isLoaded() ? template() : loadingBlock()
  bind()
}

export const settingsView = {
  id: 'settings',
  route: 'reglages',
  label: 'Réglages',
  icon: 'sliders',
  mount(element) {
    host = element
    paint()
  },
  update() {
    if (!host) return
    /* Les champs GitHub ne doivent jamais être écrasés pendant la saisie. */
    if (deferWhileEditing(host, paint)) return
    paint()
  },
  repaint() {
    if (host) paint()
  },
}