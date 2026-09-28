/* ------------------------------------------------------------------ */
/* Stockage — accès sûr à localStorage (navigation privée, quota)      */
/* ------------------------------------------------------------------ */

const memory = new Map()

/* Raison du dernier échec d'écriture, pour ne plus l'avaler en silence :
   '' (aucun), 'quota' (plus de place), 'write' (autre), 'unavailable'. */
let lastFailure = ''

/** Safari et Chrome nomment l'erreur ; Firefox et les anciens moteurs non. */
function isQuotaError(error) {
  if (!error) return false
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

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

/**
 * Écrit une valeur. `text` est sa forme sérialisée, fournie pour éviter de
 * sérialiser deux fois (les photos rendent ces listes très grosses).
 * @returns {boolean} false si l'écriture a échoué, sans jamais lever.
 */
function write(key, value, text) {
  if (usable) {
    try {
      window.localStorage.setItem(key, text)
      lastFailure = ''
      return true
    } catch (error) {
      lastFailure = isQuotaError(error) ? 'quota' : 'write'
    }
  } else {
    lastFailure = 'unavailable'
  }
  /* Repli mémoire : la session continue, mais rien ne survit au rechargement.
     C'est précisément ce que l'appelant doit apprendre. */
  memory.set(key, value)
  return false
}

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
    return write(key, value, JSON.stringify(value))
  },

  /** Comme `set`, mais avec la forme déjà sérialisée. */
  setRaw(key, value, text) {
    return write(key, value, text)
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

  /** Raison du dernier échec : '', 'quota', 'write' ou 'unavailable'. */
  failureReason() {
    return lastFailure
  },

  /** Vrai si la dernière écriture a buté sur le quota du navigateur. */
  isFull() {
    return lastFailure === 'quota'
  },
}

