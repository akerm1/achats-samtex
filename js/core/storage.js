/* ------------------------------------------------------------------ */
/* Stockage — accès sûr à localStorage (navigation privée, quota)      */
/* ------------------------------------------------------------------ */

const memory = new Map()

function available() {
  try {
    const probe = '__purchase_gros_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

let usable = typeof window !== 'undefined' && 'localStorage' in window ? available() : false

export const storage = {
  /** Lit une valeur JSON, `fallback` si absente ou illisible. */
  get(key, fallback = null) {
    if (usable) {
      try {
        const raw = window.localStorage.getItem(key)
        return raw === null ? fallback : JSON.parse(raw)
      } catch {
        /* valeur corrompue : on passe au repli mémoire */
      }
    }
    return memory.has(key) ? memory.get(key) : fallback
  },

  set(key, value) {
    if (usable) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
        return true
      } catch {
        /* quota dépassé : repli mémoire */
      }
    }
    memory.set(key, value)
    return false
  },

  remove(key) {
    memory.delete(key)
    if (!usable) return
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* silencieux */
    }
  },

  isPersistent() {
    return usable
  },
}
