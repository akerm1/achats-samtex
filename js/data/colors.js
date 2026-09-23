/* ------------------------------------------------------------------ */
/* Couleurs nommées en français — table « comme les couleurs CSS »     */
/* Saisie libre du libellé + pastille automatique via la table.        */
/* ------------------------------------------------------------------ */

const FRENCH_COLORS = {
  abricot: '#f9c99a',
  amande: '#d9d2a3',
  argent: '#c0c0c0',
  aubergine: '#3d2242',
  beige: '#d3b795',
  'beige sable': '#c7b299',
  blanc: '#ffffff',
  'blanc mat': '#f0f0f0',
  bleu: '#2a6ad6',
  'bleu ciel': '#7ec3e8',
  'bleu roi': '#2a52be',
  bordeaux: '#6a1b2a',
  caramel: '#af6f4e',
  champagne: '#f1e0c8',
  chocolat: '#5a3a22',
  corail: '#f2766a',
  creme: '#fdf6e5',
  cuivre: '#b87333',
  cyan: '#00bcd4',
  dore: '#c99a2e',
  ecru: '#f5efdc',
  framboise: '#b2386b',
  fuchsia: '#d62486',
  grenat: '#7a1f2b',
  gris: '#9e9e9e',
  'gris perle': '#c5c9cc',
  ardoise: '#708090',
  ivoire: '#efe3d3',
  jaune: '#f5d13d',
  kaki: '#7c7d3d',
  lavande: '#b8a7d4',
  lilas: '#c3aad6',
  lin: '#e9dcc8',
  magenta: '#c2185b',
  marine: '#14284b',
  marron: '#7a4a2a',
  mauve: '#a582b0',
  mastic: '#d6d0c0',
  menthe: '#bce8d4',
  moutarde: '#d4a538',
  naturel: '#f1e8d6',
  noir: '#232323',
  noisette: '#a3835a',
  nuit: '#2f3a52',
  olive: '#8a9a3f',
  orange: '#f57c33',
  or: '#c9921e',
  peche: '#f8d3b1',
  perle: '#dcd9d3',
  pistache: '#c1e0a1',
  prune: '#5e244b',
  rouge: '#c93a3a',
  rose: '#f29ab3',
  'rose bebe': '#ffd7de',
  'rose poudre': '#f3dcdf',
  'rose vif': '#ec4f8e',
  sable: '#c7b299',
  saumon: '#ed9b87',
  sarcelle: '#0f9688',
  taupe: '#8b8378',
  turquoise: '#26c6b3',
  vert: '#3d9958',
  'vert sapin': '#1b5e42',
  violet: '#7d4f9b',
}

const LOWER = Object.fromEntries(
  Object.entries(FRENCH_COLORS).map(([label, hex]) => [normalize(label), hex]),
)

/** « rose bébé » → « rose bebe » (minuscules, sans accents, espaces uniques). */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-]+/g, ' ')
    .trim()
}

/**
 * Retrouve une couleur hexadécimale à partir d'un nom français.
 * Correspondance exacte d'abord, puis correspondance partielle la plus longue
 * (mots d'au moins 3 lettres pour éviter les faux positifs type « or » dans « assorti »).
 * @returns {string|null} couleur CSS (ex. `#f3dcdf`) ou `null` si inconnue.
 */
export function colorFromText(text) {
  const needle = normalize(text)
  if (!needle) return null
  if (LOWER[needle]) return LOWER[needle]
  let best = null
  let bestLength = 0
  for (const [key, hex] of Object.entries(LOWER)) {
    if (key.length >= 3 && key.length > bestLength && needle.includes(key)) {
      best = hex
      bestLength = key.length
    }
  }
  return best
}

/** Noms de couleurs français, triés alphabétiquement (datalist du formulaire). */
export function colorNames() {
  return Object.keys(FRENCH_COLORS).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}