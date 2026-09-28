/* ------------------------------------------------------------------ */
/* Photo store — les photos hors de `localStorage`                      */
/*                                                                     */
/* Les photos sont des JPEG base64 de quelques dizaines de kilo-octets, */
/* précisément le genre de contenu qui fait exploser le quota de 5 à    */
/* 10 Mo de `localStorage`. Le texte, lui, pèse quelques kilo-octets : */
/* il n'a aucune raison de partager le même plafond.                     */
/*                                                                      */
/* IndexedDB est le bon endroit : quota bien plus élevé (souvent la     */
/* moitié du disque), écritures transactionnelles, et aucun rapport     */
/* avec la sérialisation JSON.                                          */
/*                                                                      */
/* Règle non négociable : la photo reste dans `product.photo` en        */
/* mémoire. Le rendu, la fusion de conflits et l'envoi distant lisent    */
/ * tous ce champ. Cette base n'est donc qu'un détail de                */
/* persistance : on y écrit ce qu'on retirerait du JSON local, et on    */
/* le relit au chargement pour reconstituer les produits.               */
/*                                                                      */
/* Ce qui ne change pas : le format d'échange. Le document publié sur   */
/* le lien privé contient toujours les photos en base64, donc les deux  */
/* appareils voient exactement les mêmes images qu'avant.               */
/* ------------------------------------------------------------------ */

const DB_NAME = 'purchase-gros-photos'
const DB_VERSION = 1
const STORE = 'photos'
const KEY = 'id'

/** Vrai si IndexedDB est utilisable (mode privé, vieux navigateur…). */
let available = typeof indexedDB !== 'undefined'
let dbPromise = null
let lastFailure = ''

/** Rappel de la raison du dernier échec, pour l'afficher. */
export const failureReason = () => lastFailure

/** IndexedDB peut refuser pour cause de quota : c'est la même alerte. */
function isQuotaError(error) {
  if (!error) return false
  if (error.name === 'QuotaExceededError') return true
  /* Firefox et quelques vieux moteurs ne nomment pas l'erreur. */
  if (/quota/i.test(String(error.name || ''))) return true
  return error.code === 22 || error.code === 1014
}

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
    /* Un autre onglet garde une version antérieure ouverte : sans cela la
       page se met en attente indéfiniment au lieu de démarrer. */
    request.onblocked = () => reject(new Error('IndexedDB bloqué'))
  }).catch((error) => {
    /* On ne garde pas une promesse rejetée en cache : la tentative suivante
       refera une ouverture propre. */
    dbPromise = null
    available = false
    throw error
  })
  return dbPromise
}

function transact(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx
        try {
          tx = db.transaction(STORE, mode)
        } catch (error) {
          reject(error)
          return
        }
        let result
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error || new Error('Écriture refusée'))
        tx.onabort = () => reject(tx.error || new Error('Transaction annulée'))
        try {
          const request = run(tx.objectStore(STORE))
          if (request) request.onsuccess = () => {
            result = request.result
          }
        } catch (error) {
          reject(error)
        }
      }),
  )
}

export const isAvailable = () => available

/**
 * Ouvre la base sans garantie de réussite.
 *
 * Au premier lancement, ouvrir la base crée un dossier sur le disque. Si le
 * navigateur est en navigation privée stricte, ce dossier ne peut pas
 * toujours être créé : l'ouverture échoue alors *après* l'écran, à l'intérieur
 * d'un `touch()` sans `await`. Sans cette vérification préalable, l'erreur
 * remonterait en exception globale et aucune photo ne s'enregistrerait jamais,
 * sans aucun message. On tente donc d'abord, et on retombe sur l'ancien
 * stockage inline si la base est hors d'atteinte.
 */
export async function ensureReady() {
  if (!available) return false
  try {
    await openDb()
    return true
  } catch {
    return false
  }
}

/** Enregistre une photo. Renvoie true si elle est à l'abri. */
export async function put(id, dataUrl) {
  if (!id) return false
  try {
    await transact('readwrite', (store) => store.put({ id, photo: dataUrl }))
    lastFailure = ''
    return true
  } catch (error) {
    lastFailure = isQuotaError(error) ? 'quota' : 'unavailable'
    return false
  }
}

export async function get(id) {
  if (!id) return ''
  try {
    const record = await transact('readonly', (store) => store.get(id))
    return record?.photo || ''
  } catch {
    /* Une photo illisible vaut mieux absente qu'un liste qui ne charge pas. */
    return ''
  }
}

/** Supprime les photos des ids donnés (suppression de produits). */
export async function remove(ids) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (!list.length) return true
  try {
    await transact('readwrite', (store) => {
      for (const id of list) store.delete(id)
    })
    return true
  } catch (error) {
    lastFailure = isQuotaError(error) ? 'quota' : 'unavailable'
    return false
  }
}

/** Toutes les photos d'un coup, pour le rechargement de la liste. */
export async function readAll() {
  try {
    const records = await transact('readonly', (store) => store.getAll())
    const map = new Map()
    for (const record of records || []) {
      if (record?.id && typeof record.photo === 'string') map.set(record.id, record.photo)
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Ne conserve que les ids encore présents.
 *
 * Sans cela, chaque produit supprimé laisserait sa photo pour toujours, et le
 * disque se remplirait jusqu'à la limite d'IndexedDB.
 */
export async function prune(validIds) {
  const keep = new Set(validIds || [])
  const stored = await readAll()
  const orphans = [...stored.keys()].filter((id) => !keep.has(id))
  if (orphans.length) await remove(orphans)
  return orphans.length
}

/** Vide la base (tout effacer, réinitialisation). */
export async function clear() {
  try {
    await transact('readwrite', (store) => store.clear())
    return true
  } catch {
    return false
  }
}
