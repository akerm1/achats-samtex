/* ------------------------------------------------------------------ */
/* Client GitHub — lecture / écriture de products.json via l'API REST  */
/*                                                                     */
/* Le jeton n'est PAS obligatoire :                                   */
/*   - un dépôt public se lit sans jeton (lecture seule) ;             */
/*   - le jeton ne sert qu'à publier les modifications ;               */
/*   - un jeton expiré ne casse donc plus la lecture : il est ignoré  */
/*     et l'application bascule en lecture seule.                      */
/* ------------------------------------------------------------------ */

const API = 'https://api.github.com'
export const DATA_PATH = 'products.json'

export const READ_ONLY_MESSAGE =
  'Lecture seule : un jeton GitHub valide est nécessaire pour publier vos modifications.'

export function normalizeConfig(input) {
  if (!input) return null
  const token = String(input.token || '').trim()
  const owner = String(input.owner || '').trim()
  const repo = String(input.repo || '').trim()
  const branch = String(input.branch || 'main').trim() || 'main'
  /* Sans jeton, la configuration reste valable : dépôt public = lecture seule. */
  if (!owner || !repo) return null
  return { token, owner, repo, branch, tokenRejected: input.tokenRejected === true }
}

/** Le jeton n'est envoyé que s'il est encore accepté par GitHub. */
export function canWrite(config) {
  return Boolean(config?.token) && !config?.tokenRejected
}

function apiHeaders(config) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (canWrite(config)) headers.Authorization = `token ${config.token}`
  return headers
}

function decodeBase64(encoded) {
  const binary = atob(String(encoded || '').replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function repoUrl(config) {
  return `${API}/repos/${config.owner}/${config.repo}`
}

function contentsUrl(config) {
  return `${repoUrl(config)}/contents/${DATA_PATH}`
}

/** GitHub répond 403 « quota » quand le jeton (ou l'IP) a dépassé la limite. */
function isRateLimited(response) {
  return response.headers.get('x-ratelimit-remaining') === '0'
}

/** Traduit un statut HTTP en message compréhensible pour l'utilisateur. */
function failureMessage(response) {
  const status = response.status
  if (status === 401) return 'Jeton refusé par GitHub'
  if (status === 429 || (status === 403 && isRateLimited(response))) {
    return 'Limite de requêtes GitHub atteinte — réessayez dans quelques minutes.'
  }
  if (status === 403) {
    return 'Jeton refusé par GitHub — activez « Contents: Read and write » sur ce dépôt.'
  }
  return `GitHub ${status} ${response.statusText || ''}`.trim()
}

/**
 * Un 404 sur le fichier ne suffit pas à conclure : il peut signifier « fichier
 * absent » (dépot accessible) comme « dépôt invisible pour ce jeton » — GitHub
 * répond 404 à un dépôt privé non autorisé, ou à un nom mal orthographié.
 * @returns {Promise<boolean|null>} `null` si GitHub est injoignable.
 */
async function repoReachable(config) {
  try {
    const response = await fetch(repoUrl(config), { headers: apiHeaders(config), cache: 'no-store' })
    return response.status !== 404
  } catch {
    return null
  }
}

/** Extrait la liste, les réglages et le SHA d'une réponse `contents` valide. */
async function readContents(response) {
  const data = await response.json()
  let parsed = null
  try {
    parsed = JSON.parse(decodeBase64(data.content))
  } catch {
    return null
  }
  return {
    list: Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [],
    settings: parsed && typeof parsed === 'object' && parsed.settings ? parsed.settings : null,
    sha: data.sha,
  }
}

/**
 * Lit la liste distante (liste + réglages partagés).
 *
 * Si GitHub refuse le jeton (401 « Bad credentials », cas d'un jeton expiré),
 * on réessaie une seule fois en anonyme : si le dépôt est public, la lecture
 * reste possible et l'application continue de fonctionner.
 * @returns {Promise<{ok:boolean, list:Array|null, settings:object|null, sha:string|null, status:string, message?:string, tokenRejected?:boolean}>}
 */
export async function fetchRemoteList(config) {
  if (!config) return { ok: false, list: null, sha: null, status: 'config' }
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`
  let response
  try {
    response = await fetch(url, { headers: apiHeaders(config), cache: 'no-store' })
  } catch (error) {
    return {
      ok: false,
      list: null,
      sha: null,
      status: 'offline',
      message: `Impossible de joindre GitHub (${String(error?.message || error)})`,
    }
  }

  if (response.status === 404) {
    const reachable = await repoReachable(config)
    if (reachable === false) {
      return {
        ok: false,
        list: null,
        sha: null,
        status: 'config',
        message: `Dépôt « ${config.owner}/${config.repo} » introuvable ou inaccessible — vérifiez le nom et l'accès du jeton.`,
      }
    }
    if (reachable === null) {
      return { ok: false, list: null, sha: null, status: 'offline', message: 'Impossible de joindre GitHub.' }
    }
    return { ok: true, list: null, sha: null, status: 'ok', readOnly: !canWrite(config) }
  }

  if (response.status === 401 && canWrite(config)) {
    /* Jeton expiré ou révoqué : on tente la lecture anonyme. */
    const anonymous = await fetch(url, { headers: apiHeaders({ ...config, tokenRejected: true }), cache: 'no-store' }).catch(
      () => null,
    )
    if (anonymous?.ok) {
      const contents = await readContents(anonymous)
      if (contents) return { ...contents, ok: true, status: 'ok', readOnly: true, tokenRejected: true }
    }
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return {
      ok: false,
      list: null,
      sha: null,
      status: 'config',
      tokenRejected: response.status === 401 && Boolean(config.token),
      message: failureMessage(response),
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      list: null,
      sha: null,
      status: 'error',
      message: `GitHub ${response.status} ${response.statusText || ''}`.trim(),
    }
  }

  const contents = await readContents(response)
  if (!contents) {
    return { ok: false, list: null, sha: null, status: 'error', message: 'products.json illisible' }
  }
  return { ...contents, ok: true, status: 'ok', readOnly: !canWrite(config) }
}

/**
 * Écrit la liste distante (crée le fichier au besoin, retente en cas de conflit).
 * `settings` (réglages partagés) est inclus dans le même fichier quand fourni.
 * @returns {Promise<{ok:boolean, sha:string|null, status:string, message?:string}>}
 */
export async function putRemoteList(config, list, sha, settings) {
  if (!config) return { ok: false, sha: null, status: 'config' }
  /* Sans jeton (ou jeton refusé), GitHub refusera l'écriture : inutile
     d'envoyer la requête, et l'utilisateur garde sa liste locale intacte. */
  if (!canWrite(config)) {
    return {
      ok: false,
      sha,
      status: 'config',
      tokenRejected: Boolean(config.token),
      message: config.token
        ? `${READ_ONLY_MESSAGE} (le jeton enregistré a été refusé par GitHub.)`
        : READ_ONLY_MESSAGE,
    }
  }
  const url = contentsUrl(config)
  const payload = JSON.stringify(
    {
      version: 3,
      updatedAt: new Date().toISOString(),
      settings: settings || null,
      products: list,
    },
    null,
    2,
  )
  const buildBody = (ref) => {
    const body = {
      message: "Mise à jour de la liste d'achats",
      content: encodeBase64(payload),
      branch: config.branch,
    }
    if (ref) body.sha = ref
    return body
  }

  const send = (ref) =>
    fetch(url, {
      method: 'PUT',
      headers: { ...apiHeaders(config), 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(ref)),
    })

  let response
  try {
    response = await send(sha)
  } catch (error) {
    return {
      ok: false,
      sha,
      status: 'offline',
      message: `Impossible de joindre GitHub (${String(error?.message || error)})`,
    }
  }

  if (response.ok) {
    const data = await response.json()
    return { ok: true, sha: data.content?.sha || sha, status: 'ok' }
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { ok: false, sha, status: 'config', message: failureMessage(response) }
  }

  /* Fichier ou branche absent : on retente sans SHA. */
  if (response.status === 404) {
    const retry = await send(null)
    if (retry.ok) {
      const data = await retry.json()
      return { ok: true, sha: data.content?.sha || null, status: 'ok' }
    }
    if (retry.status === 401 || retry.status === 403 || retry.status === 429) {
      return { ok: false, sha, status: 'config', message: failureMessage(retry) }
    }
    if (retry.status === 404) {
      const reachable = await repoReachable(config)
      if (reachable === false) {
        return {
          ok: false,
          sha,
          status: 'config',
          message: `Dépôt « ${config.owner}/${config.repo} » introuvable ou inaccessible — vérifiez le nom et l'accès du jeton.`,
        }
      }
    }
    return { ok: false, sha, status: 'error', message: failureMessage(retry) }
  }

  /* Conflit d'écriture : on relit la version fraîche puis on retente. */
  if (response.status === 409 || response.status === 422) {
    const fresh = await fetchRemoteList(config)
    if (!fresh.ok || fresh.list === null) {
      return {
        ok: false,
        sha,
        status: fresh.status === 'config' ? 'config' : 'error',
        message: fresh.message || 'products.json introuvable sur GitHub',
      }
    }
    const retry = await send(fresh.sha)
    if (retry.ok) {
      const data = await retry.json()
      return { ok: true, sha: data.content?.sha || fresh.sha, status: 'ok' }
    }
    return {
      ok: false,
      sha: fresh.sha,
      status: 'error',
      message: `GitHub ${retry.status} ${retry.statusText || ''}`.trim(),
    }
  }

  return {
    ok: false,
    sha,
    status: 'error',
    message: failureMessage(response),
  }
}

/** Vérifie la configuration sans rien écrire. */
export async function testConnection(config) {
  if (!config) return { ok: false, message: 'Configuration incomplète.' }
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`
  let response
  try {
    response = await fetch(url, { headers: apiHeaders(config), cache: 'no-store' })
  } catch {
    return { ok: false, message: 'Impossible de joindre GitHub — vérifiez votre connexion internet.' }
  }

  if (response.ok) {
    return canWrite(config)
      ? { ok: true, message: `Connexion réussie à « ${config.owner}/${config.repo} » (lecture et écriture).` }
      : {
          ok: true,
          message: `Dépôt public « ${config.owner}/${config.repo} » accessible en lecture seule. ${
            config.token ? 'Le jeton enregistré a été refusé par GitHub.' : 'Ajoutez un jeton pour publier vos modifications.'
          }`,
        }
  }

  /* Même logique que la lecture : un jeton refusé n'empêche pas de lire. */
  if (response.status === 401 && canWrite(config)) {
    const anonymous = await fetch(url, {
      headers: apiHeaders({ ...config, tokenRejected: true }),
      cache: 'no-store',
    }).catch(() => null)
    if (anonymous?.ok) {
      return {
        ok: true,
        readOnly: true,
        tokenRejected: true,
        message: `Dépôt public accessible, mais le jeton a été refusé : lecture seule. ${
          READ_ONLY_MESSAGE
        }`,
      }
    }
  }

  if (response.status === 404) {
    const reachable = await repoReachable(config)
    if (reachable === false) {
      return {
        ok: false,
        message: `Dépôt « ${config.owner}/${config.repo} » introuvable ou inaccessible — vérifiez le nom et l'accès du jeton.`,
      }
    }
    if (reachable === null) {
      return { ok: false, message: 'Impossible de joindre GitHub — vérifiez votre connexion internet.' }
    }
    return {
      ok: true,
      message: `${DATA_PATH} sera créé à la première modification.${
        canWrite(config) ? '' : ' (lecture seule : un jeton est nécessaire pour l\'écrire.)'
      }`,
    }
  }
  return { ok: false, message: failureMessage(response) }
}
