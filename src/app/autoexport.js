/* ------------------------------------------------------------------ */
/* Export automatique — ce qu'un navigateur autorise vraiment          */
/*                                                                     */
/* Une page web ne peut pas écrire dans le dossier « Téléchargements »  */
/* toute seule : chaque téléchargement doit partir d'un geste. La seule */
/* exception est la File System Access API : l'utilisateur désigne UN    */
/* fichier une fois, et l'application a le droit de le réécrire ensuite */
/* sans rien demander — même sans geste, tant que l'onglet est ouvert.  */
/*                                                                     */
/* D'où deux modes, et un seul honnête :                                */
/*   1. fichier désigné → l'export part tout seul au rythme choisi ;     */
/*   2. pas de fichier → l'application le signale et enregistre au       */
/*      premier geste de l'utilisateur (bandeau, un appui).             */
/*                                                                     */
/* Dans les deux cas, la fenêtre doit être ouverte : aucun navigateur    */
/* n'exécute une PWA en arrière-plan pour écrire un fichier.            */
/* ------------------------------------------------------------------ */

import { getState, setPrefs } from '../data/store.js'
import { downloadExport, exportFilename, formatOf, writeExportToHandle } from '../data/exporter.js'
import { clearHandle, loadHandle, saveHandle } from '../data/export-handle.js'
import { toast } from '../core/feedback.js'

export const EXPORT_PERIODS = [
  { value: 'off', label: 'Jamais', ms: 0 },
  { value: 'day', label: 'Chaque jour', ms: 24 * 60 * 60 * 1000 },
  /* Un « mois » de 30 jours : le 14 janvier puis le 13 février vaut mieux
     qu'un 31 qui saute février. */
  { value: 'week', label: 'Chaque semaine', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: 'month', label: 'Chaque mois', ms: 30 * 24 * 60 * 60 * 1000 },
]

const DEFAULTS = { period: 'off', scope: 'all', format: 'xlsx', lastAt: '', name: '' }

const periodOf = (value) => EXPORT_PERIODS.find((item) => item.value === value) || EXPORT_PERIODS[0]

let handleCache = null
let handleLoaded = false
let lastError = ''

/** Réglages d'export, relus à chaque appel (jamais de copie périmée). */
export function getAutoExport() {
  const stored = getState().prefs?.autoExport
  return { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) }
}

export function setAutoExport(patch = {}) {
  const next = { ...getAutoExport(), ...patch }
  setPrefs({ autoExport: next })
  return next
}

/** Prochaine échéance, ou `null` quand l'automatisme est coupé. */
export function nextRunAt(config = getAutoExport(), now = Date.now()) {
  const period = periodOf(config.period)
  if (!period.ms) return null
  const last = Date.parse(config.lastAt || '')
  if (!Number.isFinite(last)) return new Date(now)
  return new Date(last + period.ms)
}

export function isDue(config = getAutoExport(), now = Date.now()) {
  const period = periodOf(config.period)
  if (!period.ms) return false
  const last = Date.parse(config.lastAt || '')
  if (!Number.isFinite(last)) return true
  return now - last >= period.ms
}

/** Le navigateur sait-il garder un fichier d'un lancement à l'autre ? */
export const supportsDestination = () =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

export const periodLabel = (value) => periodOf(value).label
export const getLastError = () => lastError

/* --- Destination -------------------------------------------------- */

async function destination() {
  if (!handleLoaded) {
    handleCache = await loadHandle()
    handleLoaded = true
  }
  return handleCache
}

/** Autorise l'écriture sur le fichier choisi, si un geste le permet. */
async function ensurePermission(handle, { ask }) {
  if (typeof handle.queryPermission !== 'function') return true
  const options = { mode: 'readwrite' }
  try {
    let state = await handle.queryPermission(options)
    if (state === 'granted') return true
    if (state === 'prompt' && ask) {
      state = await handle.requestPermission(options)
    }
    return state === 'granted'
  } catch {
    return false
  }
}

/** Le fichier choisi convient-il au format courant ? */
const destinationMatches = (handle, format) =>
  Boolean(handle?.name) && handle.name.toLowerCase().endsWith('.' + formatOf(format).extension)

const pickerTypes = (format) => {
  const spec = formatOf(format)
  if (spec.extension === 'csv') {
    return [{ description: 'Fichier CSV', accept: { 'text/csv': ['.csv'] } }]
  }
  return [
    {
      description: 'Classeur Excel',
      accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    },
  ]
}

/**
 * L'utilisateur désigne le fichier qui sera réécrit à chaque échéance.
 * @returns {Promise<{ok: boolean, name?: string, message?: string}>}
 */
export async function chooseDestination() {
  if (!supportsDestination()) {
    return { ok: false, message: "Ce navigateur ne sait pas réécrire un fichier tout seul : utilisez « Télécharger maintenant »." }
  }
  const config = getAutoExport()
  let handle
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: exportFilename(config.scope, config.format),
      types: pickerTypes(config.format),
      excludeAcceptAllOption: false,
    })
  } catch (error) {
    /* L'utilisateur a fermé la boîte : ce n'est pas une erreur à signaler. */
    if (error?.name === 'AbortError') return { ok: false, cancelled: true }
    return { ok: false, message: "Le navigateur a refusé d'ouvrir la boîte de choix du fichier." }
  }

  const saved = await saveHandle(handle)
  handleCache = handle
  handleLoaded = true
  setAutoExport({ name: handle.name })

  /* On écrit tout de suite : l'utilisateur voit que le lien fonctionne,
     et la première échéance part d'un fichier déjà à jour. */
  try {
    await writeExportToHandle(handle, config.scope, config.format)
    setAutoExport({ lastAt: new Date().toISOString() })
    return { ok: true, name: handle.name, written: true, persisted: saved }
  } catch {
    return { ok: true, name: handle.name, written: false, persisted: saved }
  }
}

/** Oublie le fichier choisi (retour au téléchargement manuel). */
export async function forgetDestination() {
  handleCache = null
  handleLoaded = true
  await clearHandle()
  setAutoExport({ name: '' })
}

/* --- Exécution ---------------------------------------------------- */

/** Téléchargement à la demande, toujours disponible. */
export function downloadNow(scope = getAutoExport().scope, format = getAutoExport().format) {
  const filename = downloadExport(scope, format)
  return filename
}

/**
 * Échéance atteinte, sur un geste de l'utilisateur : on écrit dans le
 * fichier désigné si possible, sinon on télécharge. Les deux marchent.
 */
export async function runDueNow() {
  const config = getAutoExport()
  const handle = await destination()
  if (handle && !destinationMatches(handle, config.format)) {
    toast(`Le fichier « ${handle.name} » n'est pas au format ${formatOf(config.format).label} : téléchargement.`, { type: 'info' })
  } else if (handle && (await ensurePermission(handle, { ask: true }))) {
    try {
      await writeExportToHandle(handle, config.scope, config.format)
      setAutoExport({ lastAt: new Date().toISOString(), name: handle.name })
      toast(`Export écrit dans « ${handle.name} ».`, { type: 'ok' })
      return { ok: true, mode: 'file', name: handle.name }
    } catch (error) {
      lastError = String(error?.message || 'écriture refusée')
      /* Le fichier a pu être déplacé ou supprimé : on repasse au
         téléchargement plutôt que de laisser l'échéance bloquée. */
      handleCache = null
      handleLoaded = true
    }
  }
  const filename = downloadNow(config.scope, config.format)
  setAutoExport({ lastAt: new Date().toISOString() })
  toast(`Export enregistré : ${filename}`, { type: 'ok' })
  return { ok: true, mode: 'download', name: filename }
}

/**
 * Passage automatique (minuterie, retour sur l'onglet). N'écrit que si le
 * fichier est déjà autorisé ; ne télécharge jamais sans geste.
 */
async function runScheduled() {
  const config = getAutoExport()
  if (!config.period || config.period === 'off') return { ok: false, reason: 'off' }
  if (!isDue(config)) return { ok: false, reason: 'not-due' }
  const handle = await destination()
  if (!handle) return { ok: false, reason: 'no-destination' }
  if (!destinationMatches(handle, config.format)) return { ok: false, reason: 'format' }
  if (!(await ensurePermission(handle, { ask: false }))) return { ok: false, reason: 'permission' }
  try {
    await writeExportToHandle(handle, config.scope, config.format)
    setAutoExport({ lastAt: new Date().toISOString(), name: handle.name })
    toast(`Export automatique écrit dans « ${handle.name} ».`, { type: 'ok' })
    return { ok: true, mode: 'file', name: handle.name }
  } catch (error) {
    lastError = String(error?.message || 'écriture refusée')
    return { ok: false, reason: 'write' }
  }
}

const CHECK_EVERY_MS = 5 * 60 * 1000

/** Démarre la surveillance : au lancement, puis toutes les cinq minutes. */
export function initAutoExport() {
  /* Le fichier choisi se recharge en arrière-plan : le nom affiché vient
     des réglages, l'écran n'attend donc rien pour se dessiner. */
  destination().catch(() => undefined)

  const tick = () => {
    runScheduled().catch(() => undefined)
  }
  setTimeout(tick, 5000)
  setInterval(tick, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick()
  })
}
