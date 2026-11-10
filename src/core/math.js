/* ------------------------------------------------------------------ */
/* Maths — arrondis et bornes, sans dépendance au DOM                  */
/* ------------------------------------------------------------------ */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function round2(value) {
  return Math.round(Number(value) * 100) / 100
}
