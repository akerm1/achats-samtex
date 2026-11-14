/* ------------------------------------------------------------------ */
/* Utilitaires — point d'entrée unique                                  */
/*                                                                     */
/* Le code applicatif importe d'ici ; l'implémentation est répartie     */
/* par domaine : dom.js, format.js, math.js, ids.js.                   */
/* ------------------------------------------------------------------ */

export { $, $$, esc, escAttr, debounce, downloadBlob, downloadText, copyText, slug, isTyping } from './dom.js'
export {
  NO_VALUE,
  toNumber,
  formatMoney,
  formatNumber,
  formatDA,
  toDate,
  formatDate,
  formatDateLong,
  formatTime,
  formatRelative,
  plural,
  percent,
  readableBytes,
} from './format.js'
export { clamp, round2 } from './math.js'
export { uid } from './ids.js'
