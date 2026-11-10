/* ------------------------------------------------------------------ */
/* PWA — installation, repli hors-ligne, détection des mises à jour     */
/*                                                                     */
/* Le service worker ne sert qu'au repli hors-ligne : les fichiers ne   */
/* sont jamais mis en cache, donc le code affiché est toujours celui    */
/* publié. Une mise à jour n'est jamais installée automatiquement :     */
/* elle est proposée dans les Réglages (voir `version.json`).          */
/* ------------------------------------------------------------------ */

import { toast } from '../core/feedback.js'
import { checkForUpdate } from '../core/update.js'
import { getState, refresh } from '../data/store.js'
import { dismissInstall, setInstallEvent, setOfflineReady, setUpdateAvailable } from '../ui/shell.js'

export function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker non enregistré :', error)
    })
    navigator.serviceWorker.ready.then(() => {
      if (!navigator.serviceWorker.controller) setOfflineReady(true)
    })
  })
}

/** Vérifie la version publiée sans rien installer : le bouton change d'état. */
export async function checkUpdateInBackground() {
  const result = await checkForUpdate()
  if (result.available) setUpdateAvailable(true)
}

export function initInstallFlow() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    setInstallEvent(event)
  })
  window.addEventListener('appinstalled', () => {
    dismissInstall()
    /* Après installation, la liste est relue une fois depuis GitHub. */
    refresh().then((result) => {
      if (!result.ok) return
      const { status } = getState()
      toast(
        status === 'local'
          ? 'Application installée — connectez GitHub dans Réglages pour tout partager.'
          : 'Application installée — liste actualisée.',
        { type: status === 'local' ? 'info' : 'ok' },
      )
    })
  })
}
