/* ------------------------------------------------------------------ */
/* Reprise réseau — ne plus rester « hors ligne » après une coupure     */
/*                                                                      */
/* L'application ne scrute jamais le réseau : une lecture au démarrage,  */
/* puis les publications. Une coupure passagère (métro, wifi qui        */
/* bascule, téléphone en veille) laissait donc la pastille rouge        */
/* jusqu'à ce que l'utilisateur pense à cliquer dessus — d'où            */
/* l'impression qu'elle « se déconnecte ». Ces trois signaux suffisent  */
/* à la réveiller sans transformer l'application en sondage permanent : */
/*   - le navigateur annonce le retour du réseau (`online`) ;            */
/*   - l'onglet redevient visible (PWA rouverte, téléphone déverrouillé);*/
/*   - la fenêtre reprend le focus.                                     */
/* ------------------------------------------------------------------ */

import { getState, wakeUp } from '../data/store.js'

const MIN_GAP_MS = 4000
const FRESH_MS = 15000
let lastWake = 0

function worthRetrying(force) {
  if (!navigator.onLine) return false
  if (force) return true
  const { isConfigured, status, lastSyncAt } = getState()
  if (!isConfigured) return false
  /* Un état d'échec mérite toujours une reprise ; un état sain seulement si
     la dernière lecture date un peu. */
  if (status === 'offline' || status === 'error') return true
  return !lastSyncAt || Date.now() - lastSyncAt > FRESH_MS
}

function wake(force = false) {
  if (!worthRetrying(force)) return
  const now = Date.now()
  if (!force && now - lastWake < MIN_GAP_MS) return
  lastWake = now
  wakeUp()
}

export function initNetworkWatch() {
  window.addEventListener('online', () => wake(true))
  window.addEventListener('focus', () => wake(false))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake(false)
  })
}
