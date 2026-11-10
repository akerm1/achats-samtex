/* ------------------------------------------------------------------ */
/* Identifiants — un seul endroit qui fabrique les `id` de l'app       */
/* ------------------------------------------------------------------ */

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
