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
/* Le document échangé porte `products`, `bills` (factures, photo    */
/* du ticket comprise) et `analysis` (recettes, achats, possession). */
/* C'est ici, et seulement ici, que factures et analyse se           */
/* synchronisent : la voie GitHub reste produits seule.              */
/* ------------------------------------------------------------------ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rev',
  'Access-Control-Max-Age': '86400',
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

/** `analysis` : objet = l'analyse voyage ; `null` = document antérieur. */
function analysisOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

async function handleGet(env) {
  const raw = await env.LIST.get(DOC_KEY, 'json')
  /* Pas encore de liste : on répond 200 avec une révision 0 et `empty`,
     ce qui demande à l'application de publier sa liste locale. */
  if (!raw) {
    return json({ version: 5, rev: 0, empty: true, updatedAt: null, settings: null, products: null, bills: null, analysis: null })
  }
  return json({
    version: raw.version || 5,
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
    /* Même contrat pour `analysis` : `null` = document écrit avant
       l'analyse (Worker v4), l'appareil garde alors la sienne. */
    analysis: analysisOf(raw.analysis),
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
        version: 5,
        rev: currentRev,
        updatedAt: current?.updatedAt || null,
        settings: current?.settings || null,
        products: Array.isArray(current?.products) ? current.products : [],
        /* Les factures voyagent avec le conflit : sans elles, l'appareil ne
           pourrait pas fusionner et repartirait avec une liste de factures
           vide — la fusion doit porter sur les deux collections. */
        bills: Array.isArray(current?.bills) ? current.bills : null,
        /* Idem pour l'analyse : c'est ce document que le client fusionne
           par `id` avant de retenter l'écriture. */
        analysis: analysisOf(current?.analysis),
      },
      { status: 409 },
    )
  }

  const rev = currentRev + 1
  const updatedAt = new Date().toISOString()
  const document = {
    version: 5,
    rev,
    updatedAt,
    settings: payload.settings || null,
    products: payload.products,
    /* Un tableau vide est conservé tel quel : c'est « aucune facture », pas
       « ce document ignore les factures ». */
    bills: Array.isArray(payload.bills) ? payload.bills : null,
    /* Idem pour l'analyse : objet publié, `null` = envoyée sans elle. */
    analysis: analysisOf(payload.analysis),
  }

  try {
    await env.LIST.put(DOC_KEY, JSON.stringify(document))
  } catch (error) {
    return json({ error: `Écriture KV impossible : ${String(error?.message || error)}` }, { status: 500 })
  }
  return json({ rev, updatedAt, count: payload.products.length })
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
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...CORS_HEADERS, Allow: 'GET, PUT, OPTIONS' },
    })
  },
}
