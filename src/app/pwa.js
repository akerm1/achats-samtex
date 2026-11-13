/* ------------------------------------------------------------------ */
/* PWA — installation, repli hors-ligne, détection des mises à jour     */
/*                                                                     */
/* Le service worker ne sert qu'au repli hors-ligne : les fichiers ne   */
/* sont jamais mis en cache, donc le code affiché est toujours celui    */
/* publié. Une version plus récente s'installe d'elle-même, une fois par */
/* session (voir `checkUpdateInBackground`) ; les Réglages gardent le     */
/* bouton pour le cas où l'installation n'a pas pu se faire.              */
/* ------------------------------------------------------------------ */

import { toast } from '../core/feedback.js'
import { checkForUpdate, installUpdate } from '../core/update.js'
import { getState, refresh } from '../data/store.js'
import { dismissInstall, setInstallEvent, setOfflineReady, setUpdateAvailable } from '../ui/shell.js'

/* Une seule tentative d'installation automatique par session : un
   `version.json` publié en avance sur le dépôt ferait sinon boucler le
   rechargement. `sessionStorage` survit au rechargement, pas à la fermeture. */
const AUTO_UPDATE_KEY = 'purchase-gros-auto-update'

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

/** Vérifie la version publiée ; si elle est plus récente, l'installe seule. */
export async function checkUpdateInBackground() {
  const result = await checkForUpdate()
  if (!result.available) return
  setUpdateAvailable(true)
  /* L'application n'a qu'un utilisateur : une mise à jour ne doit pas rester
     en attente d'un clic qu'on oublie — c'est ainsi qu'un téléphone continuait
     de publier avec du code d'il y a plusieurs versions, dépenses exclues. */
  try {
    if (sessionStorage.getItem(AUTO_UPDATE_KEY)) return
    sessionStorage.setItem(AUTO_UPDATE_KEY, result.published || 'oui')
  } catch {
    /* Stockage de session refusé (navigation privée stricte) : on se tait,
       le bouton des Réglages reste disponible. */
    return
  }
  installUpdate()
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
