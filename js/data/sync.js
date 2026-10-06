/* ------------------------------------------------------------------ */
/* Aiguillage du partage entre appareils                                 */
/*                                                                      */
/* Deux fournisseurs, une seule interface : le store ne connaît que      */
/* `fetchRemoteList` / `putRemoteList` / `canWrite` / `normalizeConfig` */
/*                                                                      */
/*   - `github`  : `products.json` dans un dépôt, jeton facultatif      */
/*                 (lecture seule anonyme, écriture avec jeton) ;        */
/*   - `worker`  : un lien privé Cloudflare, lecture + écriture,         */
/*                 sans jeton ni expiration.                             */
/*                                                                      */
/* Le dépôt par défaut d'un appareil neuf reste GitHub : il est public  */
/* et lisible sans configuration, ce qui permet d'ouvrir le lien de la  */
/* page et de voir la liste immédiatement.                               */
/* ------------------------------------------------------------------ */

import * as github from './github.js'
import * as worker from './worker.js'

export const PROVIDER_GITHUB = 'github'
export const PROVIDER_WORKER = 'worker'
export const PROVIDERS = [PROVIDER_GITHUB, PROVIDER_WORKER]

export const READ_ONLY_MESSAGE = github.READ_ONLY_MESSAGE
export const LINK_PLACEHOLDER = worker.LINK_PLACEHOLDER

/** Fournisseur d'une configuration, déduit de sa forme. */
export function providerOf(config) {
  if (!config) return null
  return config.provider === PROVIDER_WORKER ? PROVIDER_WORKER : PROVIDER_GITHUB
}

export function normalizeConfig(input) {
  if (!input) return null
  if (String(input.provider || '') === PROVIDER_WORKER) return worker.normalizeConfig(input)
  return github.normalizeConfig(input)
}

export function canWrite(config) {
  return providerOf(config) === PROVIDER_WORKER ? worker.canWrite(config) : github.canWrite(config)
}

export function fetchRemoteList(config) {
  return providerOf(config) === PROVIDER_WORKER
    ? worker.fetchRemoteList(config)
    : github.fetchRemoteList(config)
}

export function putRemoteList(config, list, sha, settings, bills, analysis) {
  /* Factures ET analyse ne voyagent que par le lien privé : `products.json`
     reste ce qu'il est, et un dépôt GitHub ne voit ni l'une ni l'autre. */
  return providerOf(config) === PROVIDER_WORKER
    ? worker.putRemoteList(config, list, sha, settings, bills, analysis)
    : github.putRemoteList(config, list, sha, settings)
}

export function testConnection(config) {
  return providerOf(config) === PROVIDER_WORKER
    ? worker.testConnection(config)
    : github.testConnection(config)
}

/** Valeurs par défaut lues dans `sync-defaults.json` (dépôt public). */
export function fetchDefaultConfig() {
  return github.fetchDefaultConfig()
}
