/* ------------------------------------------------------------------ */
/* Vue Réglages — thème, partage entre appareils, données, à propos    */
/* ------------------------------------------------------------------ */

import { $, esc, formatRelative, readableBytes } from '../../core/utils.js'
import { THEMES, getThemePreference } from '../../core/theme.js'
import { storage } from '../../core/storage.js'
import { toast } from '../../core/feedback.js'
import { exportCSV, exportJSON, parseBackup } from '../../data/backup.js'
import { LINK_PLACEHOLDER, normalizeConfig, testConnection } from '../../data/sync.js'
import {
  getConfig,
  getLastSyncAt,
  getProducts,
  getState,
  importFromGithub,
  importProducts,
  isLoaded,
  saveConfig,
  setPrefs,
  setSyncMessage,
} from '../../data/store.js'
import { checkForUpdate, getUpdateState, installUpdate } from '../../core/update.js'
import { APP_RELEASE, APP_VERSION } from '../../core/app.js'
import { isInstalled } from '../shell.js'
import { icon } from '../icons.js'
import { deferWhileEditing, loadingBlock } from '../view.js'

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

/* Onglet d'édition affiché (le plus souvent celui de la config enregistrée). */
let shareTab = null
/* Saisies en cours, conservées d'un onglet à l'autre et d'un redessin à l'autre. */
let draft = {}

const SHARE_TABS = [
  { value: 'github', label: 'GitHub' },
  { value: 'worker', label: 'Lien privé (sans jeton)' },
]

function tabValue(config) {
  if (shareTab) return shareTab
  shareTab = config?.provider === 'worker' ? 'worker' : 'github'
  return shareTab
}

function githubFields(config) {
  return `
      <div class="settings-grid">
        <div class="field">
          <label for="setting-token">Jeton d'accès GitHub</label>
          <input class="input" id="setting-token" type="password" autocomplete="off"
                 placeholder="ghp_… ou github_pat_…" value="${esc(draft.token ?? config?.token ?? '')}">
        </div>
        <div class="field">
          <label for="setting-owner">Propriétaire du dépôt</label>
          <input class="input" id="setting-owner" autocomplete="off" placeholder="votre-nom-github" value="${esc(draft.owner ?? config?.owner ?? '')}">
        </div>
        <div class="field">
          <label for="setting-repo">Nom du dépôt</label>
          <input class="input" id="setting-repo" autocomplete="off" placeholder="achats-test" value="${esc(draft.repo ?? config?.repo ?? '')}">
        </div>
        <div class="field">
          <label for="setting-branch">Branche</label>
          <input class="input" id="setting-branch" autocomplete="off" placeholder="main" value="${esc(draft.branch ?? config?.branch ?? 'main')}">
        </div>
      </div>
      <p class="field-hint">
        <strong>Le jeton n'est pas obligatoire pour lire la liste</strong> : un dépôt public
        s'ouvre sans jeton. Il sert uniquement à <em>publier</em> vos modifications sur GitHub.
        Un jeton refusé ou expiré ne casse plus la lecture : l'application repasse en lecture
        seule et vous dit quoi faire.
        ${
          readOnlyNote(config)
            ? `<br /><span class="form-message is-ok">${readOnlyNote(config)}</span>`
            : ''
        }
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

/** Note de lecture seule, uniquement pertinente pour GitHub. */
function readOnlyNote(config) {
  if (!config || config.provider === 'worker' || config.token) return ''
  return "Lecture seule : vous voyez la liste publiée sur GitHub, mais vos modifications restent sur cet appareil tant qu'un jeton valide n'est pas enregistré."
}

function shareBlock() {
  const config = getConfig()
  const { status, message, messageKind, readOnly } = getState()
  const lastSyncAt = getLastSyncAt()
  const tab = tabValue(config)
  const isWorker = tab === 'worker'
  return `
    <div class="setting-block" style="display:block">
      <div class="setting-copy" style="max-width:none">
        <strong>Partage entre appareils</strong>
        <p>
          Choisissez où la liste est enregistrée. Les deux options affichent la même liste sur tous vos
          appareils : au rafraîchissement de la page, ou d'un clic sur « Synchroniser » — jamais tout seuls
          en arrière-plan. Le thème, le tri et les filtres sont partagés.
          ${
            config?.provider === 'worker'
              ? `Connecté à votre <strong>lien privé</strong>.`
              : config?.owner
                ? `Connecté à <strong>${esc(config.owner)}/${esc(config.repo)}</strong> (branche ${esc(config.branch)}).`
                : "Aucun partage connecté : la liste reste sur cet appareil."
          }
        </p>
      </div>

      <div class="segmented" role="group" aria-label="Emplacement de la liste" style="margin-top:16px">
        ${SHARE_TABS.map(
          (item) => `
            <button type="button" data-share-tab="${item.value}" class="${item.value === tab ? 'is-active' : ''}">
              ${item.label}
            </button>`,
        ).join('')}
      </div>

      <form id="share-form" class="u-stack" style="margin-top:16px">
        ${isWorker ? workerFields(config) : githubFields(config)}
        <div class="u-row u-wrap">
          <span class="form-message${messageKind ? ` is-${messageKind}` : ''}" data-role="github-status">${message ? esc(message) : ''}</span>
          ${
            isWorker
              ? `<button type="button" class="btn btn--secondary btn--sm" data-action="import-from-github">${icon('download', 13)} Importer depuis GitHub</button>`
              : `<button type="button" class="btn btn--secondary btn--sm" data-action="auto-config">${icon('sparkles', 13)} Configurer automatiquement</button>`
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

      <div class="kv" style="margin-top:16px">
        <div class="kv-item">
          <small>État</small>
          <strong><span class="badge ${STATUS_CLASS[status] || ''}" data-role="github-state">${esc(getState().statusLabel)}</span></strong>
        </div>
        <div class="kv-item">
          <small>Dernière synchro</small>
          <strong>${lastSyncAt ? esc(formatRelative(lastSyncAt)) : '—'}</strong>
        </div>
        <div class="kv-item">
          <small>Produits partagés</small>
          <strong>${getProducts().length}</strong>
        </div>
        <div class="kv-item">
          <small>${config?.provider === 'worker' ? 'Lien privé' : 'Accès GitHub'}</small>
          <strong><span class="badge ${readOnly ? 'badge--orange' : 'badge--teal'}" data-role="github-access">${
            readOnly ? 'Lecture seule' : 'Lecture + écriture'
          }</span></strong>
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

/**
 * Bouton de mise à jour : toujours présent, jamais caché.
 * Un clic cherche sur GitHub ; si une version plus récente existe, le bouton
 * devient « Installer la mise à jour » et c'est le second clic qui installe.
 */
function updateBlock() {
  const { current, published, available, checking, installing, offline } = getUpdateState()
  const busy = checking || installing
  const label = installing
    ? 'Installation…'
    : checking
      ? 'Recherche…'
      : available
        ? `Installer la mise à jour ${esc(published)}`
        : 'Rechercher une mise à jour'
  return `
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Mise à jour de l'application</strong>
        <p>
          Version installée <strong>${current}</strong>${
            published ? ` · version publiée <strong>${esc(published)}</strong>` : ''
          }
          (${APP_RELEASE}).
          ${
            available
              ? 'Nouvelle version disponible : cliquez pour l\'installer et recharger l\'application.'
              : 'Cliquez pour interroger GitHub ; si une version plus récente est publiée, le bouton devient « Installer la mise à jour ».'
          }
          ${offline ? ' Vérification impossible hors ligne.' : ''}
        </p>
      </div>
      <div class="setting-side">
        <button type="button" class="btn btn--${available ? 'primary' : 'secondary'} btn--sm" data-action="check-update" ${busy ? 'disabled' : ''}>
          ${icon('refresh', 14)} ${label}
        </button>
      </div>
    </div>`
}

function aboutBlock() {
  const persistent = storage.isPersistent()
  const state = getState()
  const { bytes = 0, photos = 0, photoBytes = 0, separated = false } = state.usage || {}
  const total = state.products?.length || 0
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
        ? `<div class="form-message is-error" data-role="storage-warning" style="margin-bottom:12px">
             <strong>Stockage du navigateur plein.</strong> Vos photos ne sont plus enregistrées sur cet appareil :
             la liste s'affiche encore, mais elle sera perdue à la fermeture.
             Exportez une sauvegarde JSON, puis retirez des photos.
           </div>`
        : ''
    }
    <div class="setting-block">
      <div class="setting-copy">
        <strong>Application</strong>
        <p>
          Version <strong>${APP_VERSION}</strong> · PWA statique, sans dépendance ni build.
          ${isInstalled() ? 'Installée sur cet appareil.' : 'Ouvrez-la dans le navigateur du téléphone pour l’installer.'}
        </p>
        <p data-role="storage-usage">
          ${total} produit${total > 1 ? 's' : ''} · ${photos} photo${photos > 1 ? 's' : ''}
          ${hasPhotos ? ` (${separated ? readableBytes(photoBytes) + ' hors de la liste' : `${photoShare} % du poids`})` : ''}
        </p>
        <p data-role="storage-detail">
          ${
            separated
              ? `Liste : ${readableBytes(bytes)}${hasPhotos ? ` · photos : ${readableBytes(photoBytes)} stockées à part, hors de la limite du navigateur.` : ''}`
              : `Liste : ${readableBytes(bytes)} sur cet appareil${hasPhotos ? `, photos comprises.` : '.'} ${
                  full ? '' : `Environ ${ceiling} % de marge restante.`
                }`
          }
        </p>
      </div>
      <div class="setting-side">
        <span class="badge ${isInstalled() ? 'badge--teal' : ''}">${isInstalled() ? 'Installée' : 'Navigateur'}</span>
        <span class="badge ${full ? 'badge--orange' : persistent ? 'badge--teal' : 'badge--orange'}">
          ${full ? 'Stockage plein' : persistent ? 'Stockage local actif' : 'Stockage limité'}
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
    <section class="view">
      <div class="view-head">
        <div>
          <h1>Réglages</h1>
          <p>Apparence, partage entre appareils, sauvegardes et informations sur l'application.</p>
        </div>
      </div>

      <div class="panel">${themeBlock()}</div>
      <div class="panel">${shareBlock()}</div>
      <div class="panel">${dataBlock()}${dangerBlock()}</div>
      <div class="panel">${installBlock()}${updateBlock()}${aboutBlock()}</div>
    </section>`
}

/**
 * Saisies en cours, à conserver avant tout redessin (changement d'onglet).
 * Seuls les champs présents dans le DOM sont relus : passer de GitHub au
 * lien privé ne doit pas effacer ce qui est tapé dans l'autre onglet.
 */
function readDraft() {
  const pick = (selector, key) => {
    const field = host?.querySelector(selector)
    if (field) draft[key] = field.value
  }
  pick('#setting-token', 'token')
  pick('#setting-owner', 'owner')
  pick('#setting-repo', 'repo')
  pick('#setting-branch', 'branch')
  pick('#setting-endpoint', 'endpoint')
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
  const fields = {
    '#setting-token': 'token',
    '#setting-owner': 'owner',
    '#setting-repo': 'repo',
    '#setting-branch': 'branch',
    '#setting-endpoint': 'endpoint',
  }
  form.addEventListener('input', (event) => {
    const key = fields[event.target?.id ? `#${event.target.id}` : '']
    if (key) draft[key] = event.target.value
  })
}

/** Configuration affichée dans l'onglet courant, telle que saisie. */
function currentConfig() {
  if (shareTab === 'worker') return { provider: 'worker', endpoint: draft.endpoint }
  return {
    token: draft.token,
    owner: draft.owner,
    repo: draft.repo,
    branch: draft.branch || 'main',
  }
}

  async function handleTest() {
    /* Sans cette lecture, `draft` est encore vide : le bouton « Tester » ne
       lisait jamais le champ, et un lien parfaitement collé était rejeté
       comme « incomplet ». */
    readDraft()
    const config = normalizeConfig(currentConfig())
    if (!config) {
    setSyncMessage(
      shareTab === 'worker'
        ? 'Lien privé incomplet ou modifié. Collez la ligne entière du fichier worker\LIEN-PRIVE.txt, sans guillemets ni espace : le clavier du téléphone peut ajouter une majuscule ou couper le texte.'
        : 'Renseignez le propriétaire et le nom du dépôt.',
      'error',
    )
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

/** Valeurs de repli si `sync-defaults.json` est indisponible (hors-ligne…). */
const FALLBACK_DEFAULTS = { owner: 'akerm1', repo: 'achats-test', branch: 'main' }
let syncDefaults = null

/** Pré-remplit automatiquement propriétaire / dépôt / branche. */
async function handleAutoConfig() {
  setSyncMessage('Préparation de la configuration…')
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
  readDraft()
  const hasToken = Boolean(draft.token)
  setSyncMessage(
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

/**
 * Deux temps, volontairement : un clic cherche, un second clic installe.
 * L'application ne se remplace jamais toute seule.
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
    setSyncMessage(`Version ${result.published} en ligne — cliquez sur « Installer la mise à jour ».`, 'ok')
    toast(`Version ${result.published} disponible : le bouton est prêt.`, { type: 'ok' })
    return
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

  /* Changement d'onglet : les saisies de part et d'autre sont conservées. */
  host.querySelectorAll('[data-share-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      readDraft()
      shareTab = button.dataset.shareTab
      paint()
    })
  })

  host.querySelector('#share-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    /* Idem : « Enregistrer » ne lisait pas les champs non plus. */
    readDraft()
    const config = normalizeConfig(currentConfig())
    if (!config) {
      setSyncMessage(
        shareTab === 'worker'
          ? 'Le lien privé doit ressembler à https://…workers.dev/une-clé.'
          : 'Renseignez au minimum le propriétaire et le nom du dépôt.',
        'error',
      )
      return
    }
    draft = {}
    const state = await saveConfig(config)
    /* En cas d'échec, le store a déjà affiché et notifié le message exact. */
    if (state.messageKind === 'error') return
    if (state.readOnly) {
      setSyncMessage(state.message || 'Lecture seule depuis la source connectée.', 'ok')
      toast('Dépôt public connecté en lecture seule.', { type: 'info' })
      return
    }
    setSyncMessage(
      state.provider === 'worker' ? 'Connecté à votre lien privé.' : `Connecté à ${config.owner}/${config.repo}.`,
      'ok',
    )
    toast(state.provider === 'worker' ? 'Liste connectée au lien privé.' : 'Liste connectée à GitHub.', { type: 'ok' })
  })

  host.querySelector('[data-action="test-share"]')?.addEventListener('click', handleTest)
  host.querySelector('[data-action="import-from-github"]')?.addEventListener('click', handleImportFromGithub)
  host.querySelector('[data-action="auto-config"]')?.addEventListener('click', handleAutoConfig)
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
    state.isConfigured,
    update.published,
    update.available,
    update.checking,
    state.provider,
    shareTab,
    state.config?.owner || '',
    state.config?.repo || '',
    state.config?.branch || '',
    state.config?.token || '',
    state.config?.endpoint || '',
    /* Le poids affiché et l'avertissement de quota doivent suivre les
       enregistrements, pas seulement le nombre de produits. */
    state.storageProblem || '',
    state.usage?.bytes || 0,
    state.usage?.photos || 0,
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
  },
  update() {
    if (!host) return
    /* Les champs GitHub ne doivent jamais être écrasés pendant la saisie. */
    paintStatus()
    if (dataSignature() === signature) return
    if (deferWhileEditing(host, paint)) return
    paint()
  },
  repaint() {
    if (host) paint()
  },
}