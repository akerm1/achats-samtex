/* ------------------------------------------------------------------ */
/* Liste d'achats partagée — Cloudflare Worker + KV                     */
/*                                                                     */
/* À coller dans Cloudflare Dashboard → Workers → votre Worker →       */
/* « Edit code ». Aucune dépendance, aucun build.                      */
/*                                                                     */
/* Principe : le lien privé EST la clé.                                */
/*   https://<worker>.workers.dev/<32 caractères aléatoires>          */
/* Ce chemin est comparé à la variable secrète LIST_KEY : un lien faux */
/* répond 404, ce qui est le comportement attendu.                     */
/*                                                                     */
/* Liaison requise : un namespace KV nommé LIST.                       */
/* CORS ouvert (`*`) : l'application est servie depuis une autre       */
/* origine (GitHub Pages). Qui possède le lien peut écrire — c'est le */
/* compromis « aucun mot de passe », assumé et documenté.               */
/*                                                                     */
/* Le document échangé porte `products`, `bills` (factures, photo      */
/* du ticket comprise) et `expenses` (catégories, dépenses,            */
/* investissements, recettes). `analysis` n'est plus accepté ni gardé : */
/* l'analyse a été retirée de l'application en 10.3.0, et un appareil   */
/* resté sur une version antérieure ne doit pas la réinstaller.        */
/*                                                                   */
/* v6 ajoute `expenses`. Un Worker v5 le recevait puis l'ignorait :   */
/* l'application envoyait les dépenses, le serveur ne les gardait     */
/* pas, et elles restaient sur l'appareil qui les avait saisies.      */
/*                                                                   */
/* v7 ajoute `deleted` : les pierres tombales des suppressions. Sans  */
/* elles, un produit supprimé revenait dès qu'un autre appareil      */
/* publiait sa liste (la fusion ne savait pas distinguer « jamais vu »*/
/* de « supprimé »).                                                 */
/*                                                                   */
/* v8 ajoute `cashflow` : personnes et transferts de la caisse, pour  */
/* que la section Caisse soit partagée comme les autres. Un Worker    */
/* v7 reçoit le champ puis le jette — l'appareil le repère grâce au   */
/* numéro de version et garde sa caisse locale.                       */
/* ------------------------------------------------------------------ */

const DOC_VERSION = 8

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rev',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
}

/* Garde-fou : KV accepte 25 Mo par valeur, on reste large en dessous. */
const MAX_BODY_BYTES = 20 * 1024 * 1024
const DOC_KEY = 'doc'

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  })
}

/** Le lien privé : chemin exact, sans slash superflu. */
function pathKey(url) {
  return url.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
}

/** `expenses` : objet = les dépenses voyagent ; `null` = document antérieur. */
function expensesOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** `cashflow` : objet = la caisse voyage ; `null` = document antérieur. */
function cashflowOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/**
 * `deleted` : pierres tombales `collection|id -> date (ms)`.
 * Un document antérieur à la v7 n'en a pas : `null`, et l'appareil garde
 * alors les siennes (il ne peut pas conclure « rien n'a été supprimé »).
 */
function deletedOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const clean = {}
  for (const [key, at] of Object.entries(value)) {
    const stamp = Number(at)
    if (Number.isFinite(stamp) && stamp > 0) clean[key] = stamp
  }
  return clean
}

/** Union de deux registres de suppressions : la date la plus récente gagne. */
function mergeDeleted(current, incoming) {
  const out = { ...(deletedOf(current) || {}) }
  for (const [key, at] of Object.entries(deletedOf(incoming) || {})) {
    if (!(out[key] >= at)) out[key] = at
  }
  return out
}

/* --- Sauvegarde Telegram -------------------------------------------- */
/*                                                                     */
/* Chaque jour, le cron du Worker relit le document publié et l'envoie  */
/* en JSON à un bot Telegram (sendDocument). C'est le seul envoi qui    */
/* part vraiment tous les jours : un navigateur ne tourne pas quand     */
/* l'application est fermée, un Worker Cloudflare si.                   */
/*                                                                     */
/* Secrets facultatifs : TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID.        */
/* Sans eux, le cron ne fait rien — aucune erreur, aucun message.       */

const TELEGRAM_API = 'https://api.telegram.org'

/* Le partage vit soit dans le KV du Worker (lien privé), soit dans
   `products.json` d'un dépôt GitHub. L'application peut changer de
   fournisseur : la sauvegarde Telegram prend donc le document le plus
   récent des deux, au lieu de risquer d'envoyer une copie périmée. */
const GITHUB_DEFAULTS = { owner: 'akerm1', repo: 'achats-test', branch: 'main' }

function githubUrl(env) {
  const owner = String(env.GITHUB_OWNER || GITHUB_DEFAULTS.owner)
  const repo = String(env.GITHUB_REPO || GITHUB_DEFAULTS.repo)
  const branch = String(env.GITHUB_BRANCH || GITHUB_DEFAULTS.branch)
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/products.json`
}

async function readSharedDocument(env) {
  const local = await env.LIST.get(DOC_KEY, 'json')
  let remote = null
  try {
    const response = await fetch(`${githubUrl(env)}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (response.ok) remote = await response.json().catch(() => null)
  } catch {
    /* GitHub injoignable : le KV reste la source. */
  }
  const localAt = Date.parse(local?.updatedAt || '') || 0
  const remoteAt = Date.parse(remote?.updatedAt || '') || 0
  if (remote && remoteAt > localAt) return { raw: remote, source: 'GitHub' }
  return { raw: local, source: 'lien privé' }
}

/** Le document envoyé : les mêmes collections qu'une sauvegarde JSON. */
function backupOf(raw) {
  return {
    app: 'mes-achats',
    version: DOC_VERSION,
    exportedAt: new Date().toISOString(),
    settings: raw?.settings || null,
    products: Array.isArray(raw?.products) ? raw.products : [],
    bills: Array.isArray(raw?.bills) ? raw.bills : [],
    expenses: expensesOf(raw?.expenses),
    cashflow: cashflowOf(raw?.cashflow),
    deleted: deletedOf(raw?.deleted),
  }
}

async function sendTelegramBackup(env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim()
  if (!token || !chatId) {
    return { ok: false, skipped: true, message: 'Telegram non configuré (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID absents).' }
  }

  const { raw, source } = await readSharedDocument(env)
  if (!raw) {
    return { ok: false, skipped: true, message: 'Aucune donnée publiée (ni lien privé, ni GitHub) pour l’instant.' }
  }

  /* Compact : le document peut porter les photos des tickets, et Telegram
     refuse au-delà de 50 Mo. */
  const json = JSON.stringify(backupOf(raw))
  const stamp = new Date().toISOString().slice(0, 10)
  const form = new FormData()
  form.set('chat_id', chatId)
  form.set('caption', `Sauvegarde mes-achats — ${stamp} (${source})`)
  form.set('document', new Blob([json], { type: 'application/json' }), `mes-achats-${stamp}.json`)

  let response
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, { method: 'POST', body: form })
  } catch (error) {
    return { ok: false, message: `Telegram injoignable : ${String(error?.message || error)}` }
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok === false) {
    return {
      ok: false,
      message: `Telegram a refusé l'envoi (${response.status}) : ${result?.description || 'réponse illisible'}`,
    }
  }
  return { ok: true, message: `Sauvegarde envoyée à Telegram (${Math.round(json.length / 1024)} Ko).` }
}

async function handleGet(env) {
  const raw = await env.LIST.get(DOC_KEY, 'json')
  /* Pas encore de liste : on répond 200 avec une révision 0 et `empty`,
     ce qui demande à l'application de publier sa liste locale. */
  if (!raw) {
    return json({ version: DOC_VERSION, rev: 0, empty: true, updatedAt: null, settings: null, products: null, bills: null, analysis: null, expenses: null, cashflow: null, deleted: null, client: null })
  }
  return json({
    /* `version` = version du Worker qui répond, pas celle du document
       stocké : c'est ce que le client lit pour savoir si `expenses` voyage.
       Un document écrit par une version antérieure reste lisible (il est
       réécrit à la prochaine publication) et signale son âge par
       `expenses: null`, pas par ce numéro. */
    version: DOC_VERSION,
    rev: raw.rev || 1,
    updatedAt: raw.updatedAt || null,
    settings: raw.settings || null,
    products: Array.isArray(raw.products) ? raw.products : [],
    /* `null` et `[]` ne veulent pas dire la même chose : `null` signale un
       document écrit avant l'existence des factures (« n'en ai aucune »),
       `[]` que l'utilisateur les a toutes supprimées. Le client s'appuie
       sur cette différence pour ne pas effacer les factures locales quand
       ce Worker n'a pas encore été redéployé. */
    bills: Array.isArray(raw.bills) ? raw.bills : null,
    /* L'analyse a été retirée de l'application : `null` pour toujours. */
    analysis: null,
    /* Idem pour `expenses` : `null` = document écrit avant la v6, et
       l'appareil garde alors ses dépenses locales. */
    expenses: expensesOf(raw.expenses),
    /* `null` = document écrit avant la v8 : l'appareil garde sa caisse. */
    cashflow: cashflowOf(raw.cashflow),
    /* `null` = document écrit avant la v7 : l'appareil garde ses pierres
       tombales locales et les publiera à sa prochaine écriture. */
    deleted: deletedOf(raw.deleted),
    /* Version de l'application du dernier appareil qui a publié : c'est
       elle qui dit si un appareil écrit encore sans les dépenses. */
    client: typeof raw.client === 'string' ? raw.client : null,
  })
}

async function handlePut(request, env) {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_BODY_BYTES) {
    return json({ error: 'Liste trop volumineuse.' }, { status: 413 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Corps JSON illisible.' }, { status: 400 })
  }
  if (!payload || !Array.isArray(payload.products)) {
    return json({ error: 'Champ « products » attendu (tableau).' }, { status: 400 })
  }

  const current = await env.LIST.get(DOC_KEY, 'json')
  const currentRev = current?.rev || 0
  const sentRev = request.headers.get('X-Rev')

  /* Contrôle optimiste : si l'appareil a lu une version plus récente que
     celle qu'il renvoie, on refuse et on lui renvoie l'état courant pour
     qu'il fusionne (perte de modification évitée). */
  if (sentRev !== null && Number.isFinite(Number(sentRev)) && Number(sentRev) < currentRev) {
    return json(
      {
        version: DOC_VERSION,
        rev: currentRev,
        updatedAt: current?.updatedAt || null,
        settings: current?.settings || null,
        products: Array.isArray(current?.products) ? current.products : [],
        /* Les factures voyagent avec le conflit : sans elles, l'appareil ne
           pourrait pas fusionner et repartirait avec une liste de factures
           vide — la fusion doit porter sur les deux collections. */
        bills: Array.isArray(current?.bills) ? current.bills : null,
        /* L'analyse n'existe plus côté client : toujours `null`. */
        analysis: null,
        /* Idem pour les dépenses : sans elles, la fusion par `id` n'aurait
           rien à fusionner et l'écriture suivante les écraserait. */
        expenses: expensesOf(current?.expenses),
        /* La caisse voyage aussi avec le conflit, pour la fusion par `id`. */
        cashflow: cashflowOf(current?.cashflow),
        /* Les suppressions voyagent avec le conflit : sans elles, la fusion
           par `id` ferait revenir ce que l'autre appareil a supprimé. */
        deleted: deletedOf(current?.deleted),
        client: typeof current?.client === 'string' ? current.client : null,
      },
      { status: 409 },
    )
  }

  /* La révision ne recule jamais : une lecture KV en retard peut donner un
     `rev` plus petit que celui que l'appareil a déjà publié. */
  const rev = Math.max(currentRev, Number(sentRev) || 0) + 1
  const updatedAt = new Date().toISOString()
  const document = {
    version: DOC_VERSION,
    rev,
    updatedAt,
    settings: payload.settings || null,
    products: payload.products,
    /* Un tableau vide est conservé tel quel : c'est « aucune facture », pas
       « ce document ignore les factures ». */
    bills: Array.isArray(payload.bills) ? payload.bills : null,
    /* L'analyse a été retirée : on ne la stocke plus, même si un appareil
       resté sur une version antérieure en envoie encore. */
    analysis: null,
    /* Une écriture sans `expenses` (application antérieure à la v6) ne doit
       pas effacer celles déjà publiées : on garde alors le document courant.
       Un objet vide, lui, reste une suppression volontaire et s'applique. */
    expenses: expensesOf(payload.expenses) ?? expensesOf(current?.expenses),
    /* Une écriture sans `cashflow` (application antérieure à la v8) ne doit
       pas effacer la caisse déjà publiée : on garde alors le document
       courant. Un objet vide, lui, reste une suppression volontaire. */
    cashflow: cashflowOf(payload.cashflow) ?? cashflowOf(current?.cashflow),
    /* Les suppressions s'ADDITIONNENT : un appareil resté sur une version
       qui ne les envoie pas ne doit pas effacer celles déjà connues, sinon
       les éléments supprimés reviendraient sur les autres appareils. */
    deleted: mergeDeleted(current?.deleted, payload.deleted),
    /* L'appareil qui a écrit, pour diagnostiquer à distance. */
    client: typeof payload.client === 'string' ? payload.client : null,
  }

  try {
    await env.LIST.put(DOC_KEY, JSON.stringify(document))
  } catch (error) {
    return json({ error: `Écriture KV impossible : ${String(error?.message || error)}` }, { status: 500 })
  }
  /* `version` est renvoyée pour que l'application sache si ce Worker sait
     transporter les dépenses (`expenses: true`) ou non. */
  return json({ version: DOC_VERSION, rev, updatedAt, count: payload.products.length, expenses: true, deleted: document.deleted, client: document.client })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

    const url = new URL(request.url)
    const secret = String(env.LIST_KEY || '')

    /* Sans secret configuré, ou lien différent : 404 indistinguable. */
    if (!secret || pathKey(url) !== secret) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS })
    }
    if (!env.LIST) {
      return json({ error: 'Namespace KV « LIST » non lié à ce Worker.' }, { status: 500 })
    }

    if (request.method === 'GET') return handleGet(env)
    if (request.method === 'PUT') return handlePut(request, env)
    /* Envoi manuel depuis Réglages → « Envoyer maintenant ». Le lien privé
       fait office d'authentification, comme pour la lecture et l'écriture. */
    if (request.method === 'POST' && url.searchParams.has('telegram')) {
      return json(await sendTelegramBackup(env))
    }
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...CORS_HEADERS, Allow: 'GET, PUT, POST, OPTIONS' },
    })
  },

  /* Déclenché par le cron de wrangler.toml : une fois par jour, même si
     aucun appareil n'a l'application ouverte. */
  async scheduled(controller, env) {
    if (!env.LIST) return
    await sendTelegramBackup(env)
  },
}
