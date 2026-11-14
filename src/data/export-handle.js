/* ------------------------------------------------------------------ */
/* Destination d'export — souvenir du fichier choisi                   */
/*                                                                     */
/* Un `FileSystemFileHandle` ne se met pas dans `localStorage` : ce     */
/* n'est pas du texte, et il ne doit pas être réécrit à la main.       */
/* IndexedDB sait le cloner tel quel, et le navigateur garde alors le   */
/* lien vers le fichier d'un lancement à l'autre.                      */
/* ------------------------------------------------------------------ */

const DB_NAME = 'purchase-gros-export'
const DB_VERSION = 1
const STORE = 'handles'
const KEY = 'destination'

let available = typeof indexedDB !== 'undefined'
let dbPromise = null

function openDb() {
  if (!available) return Promise.reject(new Error('IndexedDB indisponible'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    let request
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: KEY })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB refuse'))
    request.onblocked = () => reject(new Error('IndexedDB bloqué'))
  }).catch((error) => {
    dbPromise = null
    available = false
    throw error
  })
  return dbPromise
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        let result = null
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error || new Error('Écriture refusée'))
        tx.onabort = () => reject(tx.error || new Error('Transaction annulée'))
        try {
          const request = action(tx.objectStore(STORE))
          if (request) request.onsuccess = () => (result = request.result)
        } catch (error) {
          reject(error)
        }
      }),
  )
}

/** Le fichier choisi, ou `null` (aucun, ou IndexedDB indisponible). */
export async function loadHandle() {
  try {
    const record = await run('readonly', (store) => store.get(KEY))
    const handle = record?.handle
    /* Un handle d'un autre navigateur ne sait plus rien faire : on le jette
       plutôt que d'échouer à chaque tentative d'écriture. */
    return handle && typeof handle.createWritable === 'function' ? handle : null
  } catch {
    return null
  }
}

export async function saveHandle(handle) {
  try {
    await run('readwrite', (store) => store.put({ [KEY]: KEY, handle }))
    return true
  } catch {
    return false
  }
}

export async function clearHandle() {
  try {
    await run('readwrite', (store) => store.delete(KEY))
    return true
  } catch {
    return false
  }
}
