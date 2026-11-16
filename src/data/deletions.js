/* ------------------------------------------------------------------ */
/* Effacements — la mémoire des suppressions                            */
/*                                                                      */
/* Le partage fusionne les documents par `id` : c'est ce qui évite de    */
/* perdre une modification faite sur un autre appareil, mais un `id`     */
/* absent ne dit RIEN. « Je ne l'ai pas » et « je l'ai supprimé » se     */
/* ressemblent, donc la fusion les traitait pareil : le produit          */
/* supprimé revenait à la première lecture, et une deuxième publication  */
/* le réinstallait partout.                                              */
/*                                                                      */
/* D'où ce registre : chaque suppression y laisse une pierre tombale     */
/* `collection|id -> date (ms)`. Elle voyage avec le document, et une    */
/* fusion écarte tout élément dont la pierre tombale est plus récente    */
/* que lui. Une modification faite APRÈS la suppression gagne, elle      */
/* (l'horodatage de l'élément est alors plus récent).                    */
/*                                                                      */
/* Les pierres sont gardées six mois : assez pour qu'un appareil resté   */
/* longtemps hors ligne ne ressuscite rien, assez peu pour que le        */
/* registre reste négligeable (une entrée ≈ 40 octets).                 */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'

const KEY = 'purchase-gros-deletions-v1'
const KEEP_MS = 180 * 24 * 60 * 60 * 1000

/* Un espace de noms par collection partagée. Produits et factures sont à
   la racine du document ; dépenses et analyse sont imbriquées, d'où le
   préfixe — sans lui, deux `investments` (dépenses et analyse) se
   confondraient. */
export const DELETED = {
  products: 'products',
  bills: 'bills',
  categories: 'exp.categories',
  expenses: 'exp.expenses',
  expenseInvestments: 'exp.investments',
  revenues: 'exp.revenues',
  sales: 'ana.sales',
  purchases: 'ana.purchases',
  analysisInvestments: 'ana.investments',
  holdings: 'ana.holdings',
  places: 'ana.places',
}

const keyOf = (collection, id) => `${collection}|${id}`

function read() {
  const raw = storage.get(KEY, null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const clean = {}
  for (const [key, value] of Object.entries(raw)) {
    const at = Number(value)
    if (Number.isFinite(at) && at > 0) clean[key] = at
  }
  return clean
}

let entries = read()

function write() {
  storage.set(KEY, entries)
}

/** Date d'un élément, 0 quand le document est trop ancien pour en porter une. */
function stampOf(item) {
  const at = Date.parse(item?.updatedAt || item?.createdAt || '')
  return Number.isFinite(at) ? at : 0
}

/** Copie du registre, débarrassée des pierres trop vieilles. */
export function snapshot() {
  const floor = Date.now() - KEEP_MS
  let pruned = false
  const out = {}
  for (const [key, at] of Object.entries(entries)) {
    if (at < floor) {
      pruned = true
      continue
    }
    out[key] = at
  }
  if (pruned) {
    entries = out
    write()
  }
  return { ...out }
}

/**
 * Date de la pierre tombale : jamais antérieure à l'élément qu'elle supprime.
 *
 * `Date.now()` suffit pour un appareil dont l'horloge est juste. Mais un
 * appareil en avance (ou une ligne arrivée d'un autre appareil en avance)
 * porte un `updatedAt` postérieur au moment de la suppression : la pierre
 * tombait alors « avant » l'élément, et la ligne revenait à la première
 * lecture. En datant la pierre APRÈS l'élément, la suppression gagne toujours
 * sur l'appareil qui la fait, quelle que soit l'horloge.
 */
export function stampFor(items, now = Date.now()) {
  let at = now
  const list = Array.isArray(items) ? items : [items]
  for (const item of list) {
    const stamp = stampOf(item)
    if (stamp >= at) at = stamp + 1
  }
  return at
}

/** Marque des identifiants comme supprimés (au moment présent). */
export function mark(collection, ids, at = Date.now()) {
  const list = Array.isArray(ids) ? ids : [ids]
  let changed = false
  for (const id of list) {
    if (!id) continue
    const key = keyOf(collection, id)
    if (!(entries[key] >= at)) {
      entries[key] = at
      changed = true
    }
  }
  if (changed) write()
  return changed
}

/** Retire la pierre d'un identifiant (annulation d'une suppression). */
export function unmark(collection, ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  let changed = false
  for (const id of list) {
    const key = keyOf(collection, id)
    if (key in entries) {
      delete entries[key]
      changed = true
    }
  }
  if (changed) write()
  return changed
}

/** Marque tout ce que `list` contient. Rend le nombre d'entrées ajoutées. */
export function markList(collection, list, at = Date.now()) {
  return mark(collection, (list || []).map((item) => item?.id).filter(Boolean), at) ? (list || []).length : 0
}

/** Fusion pure de deux registres : la date la plus récente gagne. */
export function mergeMaps(a, b) {
  const out = { ...(a || {}) }
  for (const [key, value] of Object.entries(b || {})) {
    const at = Number(value)
    if (!Number.isFinite(at) || at <= 0) continue
    if (!(out[key] >= at)) out[key] = at
  }
  return out
}

/**
 * Intègre les pierres reçues du distant (lecture ou conflit 409).
 * @returns {boolean} vrai si le registre local a changé.
 */
export function absorb(remote) {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return false
  const merged = mergeMaps(entries, remote)
  if (JSON.stringify(merged) === JSON.stringify(entries)) return false
  entries = merged
  write()
  return true
}

/** Vrai si cet élément a été supprimé après sa dernière modification. */
export function wasDeleted(map, collection, item) {
  if (!map || !item?.id) return false
  const at = Number(map[keyOf(collection, item.id)])
  if (!Number.isFinite(at) || at <= 0) return false
  return at >= stampOf(item)
}

/** Écarte les éléments dont la pierre tombale est plus récente. */
export function without(map, collection, list) {
  if (!map || !Array.isArray(list)) return list || []
  return list.filter((item) => !wasDeleted(map, collection, item))
}

/** Vrai si la liste a dû être raccourcie (pour savoir s'il faut persister). */
export function differsAfterFilter(map, collection, list) {
  return without(map, collection, list).length !== (list || []).length
}

/**
 * Oublie tout le registre local. Réservé à un changement de partage : le
 * document distant, lui, garde ses pierres et les rendra à la lecture.
 */
export function clear() {
  entries = {}
  write()
}
