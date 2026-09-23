/* ------------------------------------------------------------------ */
/* Client GitHub — lecture / écriture de products.json via l'API REST  */
/* ------------------------------------------------------------------ */

const API = 'https://api.github.com'
export const DATA_PATH = 'products.json'

export function normalizeConfig(input) {
  if (!input) return null
  const token = String(input.token || '').trim()
  const owner = String(input.owner || '').trim()
  const repo = String(input.repo || '').trim()
  const branch = String(input.branch || 'main').trim() || 'main'
  if (!token || !owner || !repo) return null
  return { token, owner, repo, branch }
}

function apiHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
  }
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

function contentsUrl(config) {
  return `${API}/repos/${config.owner}/${config.repo}/contents/${DATA_PATH}`
}

/**
 * Lit la liste distante (liste + réglages partagés).
 * @returns {Promise<{ok:boolean, list:Array|null, settings:object|null, sha:string|null, status:string, message?:string}>}
 */
export async function fetchRemoteList(config) {
  if (!config) return { ok: false, list: null, sha: null, status: 'config' }
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`
  let response
  try {
    response = await fetch(url, { headers: apiHeaders(config.token), cache: 'no-store' })
  } catch (error) {
    return { ok: false, list: null, sha: null, status: 'offline', message: String(error?.message || error) }
  }

  if (response.status === 404) return { ok: true, list: null, sha: null, status: 'live' }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, list: null, sha: null, status: 'config', message: 'Jeton refusé par GitHub' }
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

  const data = await response.json()
  let parsed = null
  try {
    parsed = JSON.parse(decodeBase64(data.content))
  } catch {
    return { ok: false, list: null, sha: null, status: 'error', message: 'products.json illisible' }
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : []
  const settings = parsed && typeof parsed === 'object' && parsed.settings ? parsed.settings : null
  return { ok: true, list, settings, sha: data.sha, status: 'live' }
}

/**
 * Écrit la liste distante (crée le fichier au besoin, retente en cas de conflit).
 * `settings` (réglages partagés) est inclus dans le même fichier quand fourni.
 * @returns {Promise<{ok:boolean, sha:string|null, status:string, message?:string}>}
 */
export async function putRemoteList(config, list, sha, settings) {
  if (!config) return { ok: false, sha: null, status: 'config' }
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
      headers: { ...apiHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(ref)),
    })

  let response
  try {
    response = await send(sha)
  } catch (error) {
    return { ok: false, sha, status: 'offline', message: String(error?.message || error) }
  }

  if (response.ok) {
    const data = await response.json()
    return { ok: true, sha: data.content?.sha || sha, status: 'live' }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, sha, status: 'config', message: 'Jeton refusé par GitHub' }
  }

  /* Fichier ou branche absent : on retente sans SHA. */
  if (response.status === 404) {
    const retry = await send(null)
    if (retry.ok) {
      const data = await retry.json()
      return { ok: true, sha: data.content?.sha || null, status: 'live' }
    }
    return { ok: false, sha, status: 'error', message: `GitHub ${retry.status} ${retry.statusText || ''}`.trim() }
  }

  /* Conflit d'écriture : on relit la version fraîche puis on retente. */
  if (response.status === 409 || response.status === 422) {
    const fresh = await fetchRemoteList(config)
    if (!fresh.ok || fresh.list === null) {
      return { ok: false, sha, status: 'error', message: 'products.json introuvable sur GitHub' }
    }
    const retry = await send(fresh.sha)
    if (retry.ok) {
      const data = await retry.json()
      return { ok: true, sha: data.content?.sha || fresh.sha, status: 'live' }
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
    message: `GitHub ${response.status} ${response.statusText || ''}`.trim(),
  }
}

/** Vérifie la configuration sans rien écrire. */
export async function testConnection(config) {
  if (!config) return { ok: false, message: 'Configuration incomplète.' }
  let response
  try {
    response = await fetch(`${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`, {
      headers: apiHeaders(config.token),
    })
  } catch {
    return { ok: false, message: 'Impossible de joindre GitHub — vérifiez votre connexion internet.' }
  }
  if (response.ok) return { ok: true, message: `Connexion réussie à « ${config.owner}/${config.repo} ».` }
  if (response.status === 404) return { ok: true, message: `${DATA_PATH} sera créé à la première modification.` }
  if (response.status === 401) return { ok: false, message: 'Jeton invalide ou expiré.' }
  if (response.status === 403) {
    return { ok: false, message: 'Jeton trop limité — activez « Contents: Read and write ».' }
  }
  return { ok: false, message: `Erreur ${response.status} — vérifiez le jeton et les noms du dépôt.` }
}
