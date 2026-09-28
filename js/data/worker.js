/* ------------------------------------------------------------------ */
/* Client « lien privé » — un Cloudflare Worker personnel au lieu de     */
/* GitHub.                                                              */
/*                                                                      */
/* Aucun jeton, aucune expiration, aucun droit à cocher : une seule     */
/* chose à coller, l'adresse du Worker, qui contient la clé secrète.    */
/*                                                                      */
/* Le document échangé est volontairement identique à `products.json`   */
/* (`{version, updatedAt, settings, products}`) : la migration depuis  */
/* GitHub se fait alors par simple relecture.                           */
/*                                                                      */
/* En plus du numéro de révision, on renvoie `rev` en nombre : c'est   */
/* ce qui permet à l'application d'ignorer une lecture plus ancienne    */
/* que ce qu'elle a déjà publié (KV est cohérent à terme).             */
/* ------------------------------------------------------------------ */

import { mergeProducts } from './backup.js'

export const LINK_PLACEHOLDER = 'https://liste-achats.<votre-sous-domaine>.workers.dev/<clé-secrète>'

export function normalizeConfig(input) {
  if (!input) return null
  /* Coller sur un téléphone abîme parfois le texte : espaces parasites,
     guillemets, retour à la ligne au milieu, et surtout « Https » avec une
     majuscule (autocapitalisation du clavier). On nettoie, et on ne touche
     qu'au schéma : la clé est dans le chemin, donc sensible à la casse. */
  let endpoint = String(input.endpoint || '')
    .replace(/[\u201c\u201d\u2018\u2019"'\u00ab\u00bb`]/g, '')
    .replace(/\s+/g, '')
  endpoint = endpoint.replace(/^HTTPS:\/\//i, 'https://').replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/?#]+\.[^\s/?#]+\/\S+$/.test(endpoint)) return null
  /* Le texte d'exemple ne doit jamais être accepté : il passerait la forme
     du lien puis échouerait en 404. */
  if (endpoint.includes('votre-sous-domaine') || endpoint.includes('clé-secrète')) return null
  return { provider: 'worker', endpoint }
}

/** Un lien privé bien formé donne toujours la lecture et l'écriture. */
export function canWrite(config) {
  return config?.provider === 'worker' && Boolean(config?.endpoint)
}

/** Un 404 signifie « mauvais lien » : le Worker répond 404 hors clé exacte. */
function notFoundMessage() {
  return "Lien privé introuvable (404) — le lien est-il complet, clé comprise ?"
}

function failureMessage(response) {
  const status = response.status
  if (status === 413) return "Liste trop volumineuse pour le lien privé (limite 20 Mo)."
  if (status === 400 || status === 405) return `Lien privé : requête refusée (${status}).`
  if (status === 500) return "Lien privé : erreur du Worker — vérifiez la liaison KV « LIST »."
  return `Lien privé ${status} ${response.statusText || ''}`.trim()
}

function parseDocument(payload) {
  const settings =
    payload && typeof payload === 'object' && payload.settings && typeof payload.settings === 'object'
      ? payload.settings
      : null
  const rev = Number(payload?.rev)
  return {
    list: Array.isArray(payload?.products) ? payload.products : [],
    settings,
    sha: String(payload?.rev ?? 0),
    rev: Number.isFinite(rev) ? rev : 0,
    updatedAt: payload?.updatedAt || null,
  }
}

/**
 * Lit la liste publiée. Une liste absente est signalée par `list: null`
 * (comme un `products.json` inexistant sur GitHub) pour que l'application
 * publie sa liste locale au lieu d'effacer l'écran.
 */
export async function fetchRemoteList(config) {
  if (!config) return { ok: false, list: null, sha: null, status: 'config' }
  let response
  try {
    response = await fetch(config.endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch (error) {
    return {
      ok: false,
      list: null,
      sha: null,
      status: 'offline',
      message: `Impossible de joindre le lien privé (${String(error?.message || error)})`,
    }
  }

  if (response.status === 404) {
    return { ok: false, list: null, sha: null, status: 'config', message: notFoundMessage() }
  }
  if (!response.ok) {
    return { ok: false, list: null, sha: null, status: 'error', message: failureMessage(response) }
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    return { ok: false, list: null, sha: null, status: 'error', message: 'Réponse du lien privé illisible' }
  }
  /* `empty: true` = aucun document publié pour l'instant. */
  if (payload.empty === true) {
    return { ok: true, list: null, sha: '0', rev: 0, settings: null, status: 'ok', readOnly: false }
  }

  const contents = parseDocument(payload)
  return { ok: true, ...contents, status: 'ok', readOnly: false }
}

function buildBody(list, settings) {
  return JSON.stringify({
    version: 3,
    updatedAt: new Date().toISOString(),
    settings: settings || null,
    products: list,
  })
}

/**
 * Publie la liste. En cas de conflit (révision plus récente que celle
 * que l'appareil a lue), on fusionne avec l'état distant puis on retente —
 * aucune modification n'est donc écrasée en silence.
 * @returns {Promise<{ok:boolean, sha:string|null, rev:number|null, list:Array|null, status:string, message?:string}>}
 */
export async function putRemoteList(config, list, sha, settings) {
  if (!config) return { ok: false, sha: null, status: 'config' }
  if (!canWrite(config)) {
    return { ok: false, sha, status: 'config', message: 'Lien privé incomplet.' }
  }

  const send = (payload, rev) =>
    fetch(config.endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(rev === null || rev === undefined || rev === '' ? {} : { 'X-Rev': String(rev) }),
      },
      body: buildBody(payload, settings),
    })

  let out = list
  let outRev = sha
  let response
  try {
    response = await send(out, outRev)
  } catch (error) {
    return {
      ok: false,
      sha,
      status: 'offline',
      message: `Impossible de joindre le lien privé (${String(error?.message || error)})`,
    }
  }

  if (response.status === 409) {
    const current = await response.json().catch(() => null)
    if (!current || !Array.isArray(current.products)) {
      return { ok: false, sha, status: 'error', message: 'Conflit de publication illisible.' }
    }
    const merged = mergeProducts(out, current.products)
    out = merged.list
    outRev = String(current.rev ?? 0)
    try {
      response = await send(out, outRev)
    } catch (error) {
      return {
        ok: false,
        sha,
        status: 'offline',
        message: `Impossible de joindre le lien privé (${String(error?.message || error)})`,
      }
    }
  }

  if (response.status === 404) {
    return { ok: false, sha, status: 'config', message: notFoundMessage() }
  }
  if (!response.ok) {
    return { ok: false, sha, status: 'error', message: failureMessage(response) }
  }

  const data = await response.json().catch(() => null)
  const rev = Number(data?.rev)
  return {
    ok: true,
    sha: data?.rev === undefined ? sha : String(data.rev),
    rev: Number.isFinite(rev) ? rev : null,
    /* La fusion d'un conflit est proposée à l'appelant pour qu'il l'adopte. */
    list: out === list ? null : out,
    status: 'ok',
  }
}

/** Vérifie le lien sans rien écrire. */
export async function testConnection(config) {
  if (!config) return { ok: false, message: 'Lien incomplet.' }
  let response
  try {
    response = await fetch(config.endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  } catch {
    return { ok: false, message: 'Impossible de joindre le lien privé — vérifiez votre connexion internet.' }
  }

  if (response.status === 404) return { ok: false, message: notFoundMessage() }
  if (response.status === 500) {
    return { ok: false, message: failureMessage(response) }
  }
  if (!response.ok) return { ok: false, message: failureMessage(response) }

  const payload = await response.json().catch(() => null)
  if (!payload) return { ok: false, message: 'Réponse du lien privé illisible.' }
  if (payload.empty === true) {
    return {
      ok: true,
      writable: true,
      message: 'Lien privé accessible (lecture et écriture) — aucune liste publiée pour l’instant, la vôtre sera envoyée.',
    }
  }
  const count = Array.isArray(payload.products) ? payload.products.length : 0
  return {
    ok: true,
    writable: true,
    message: `Lien privé accessible (lecture et écriture) — ${count} produit(s), révision ${payload.rev ?? 1}.`,
  }
}
