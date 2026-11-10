/* ------------------------------------------------------------------ */
/* Helper de vue — évite de détruire un champ en cours de saisie       */
/* ------------------------------------------------------------------ */

/**
 * Si l'utilisateur est en train de taper dans la vue, on reporte le
 * redessin à la perte de focus (la synchro ne doit pas voler le curseur).
 * @returns {boolean} `true` quand le rendu a été reporté.
 */
export function deferWhileEditing(host, paint) {
  const active = document.activeElement
  const editing =
    host &&
    active &&
    host.contains(active) &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
  if (!editing) return false
  active.addEventListener('blur', () => paint(), { once: true })
  return true
}

/** Bloc « chargement » commun. */
export const loadingBlock = (text = 'Chargement de la liste…') => `<p class="skeleton">${text}</p>`

/** Ouvre un dialogue natif déjà construit, en le montant au besoin. */
export function openDialog(dialog) {
  if (!dialog) return null
  if (!dialog.isConnected) document.body.appendChild(dialog)
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal()
  return dialog
}

/** Ferme un dialogue natif ; son écouteur `close` le retire du document. */
export function closeDialog(dialog) {
  if (!dialog) return
  if (typeof dialog.close === 'function' && dialog.open) dialog.close()
  else dialog.remove()
}
