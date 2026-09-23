/* ------------------------------------------------------------------ */
/* Couleurs nommées en français — table « comme les couleurs CSS »     */
/* Saisie libre du libellé + pastille automatique via la table.        */
/* ------------------------------------------------------------------ */

const FRENCH_COLORS = {
  /* Rouges */
  rouge: '#c93a3a',
  'rouge vif': '#e63946',
  'rouge vermillon': '#d93a3a',
  'rouge cerise': '#c8102e',
  'rouge tomate': '#d94f3a',
  'rouge framboise': '#b1264f',
  'rouge brique': '#a13d2f',
  ecarlate: '#cd3b34',
  carmin: '#b3244f',
  coquelicot: '#d84437',
  grenat: '#7a1f2b',
  bordeaux: '#6a1b2a',
  'bordeaux fonce': '#571224',
  bourgogne: '#7b2d3a',
  framboise: '#b2386b',

  /* Roses */
  rose: '#f29ab3',
  'rose bebe': '#ffd7de',
  'rose bonbon': '#f78fb3',
  'rose dragée': '#f0c4d8',
  'rose pastel': '#f6cdd9',
  'rose poudre': '#f3dcdf',
  'rose thé': '#e8b4a0',
  'rose indien': '#e0a4a0',
  'rose saumon': '#ef9a8c',
  'rose vif': '#ec4f8e',
  fuchsia: '#d62486',
  magenta: '#c2185b',
  cyclamen: '#c45a8a',

  /* Oranges / abricots */
  orange: '#f57c33',
  'orange brûlé': '#c85a24',
  'orange sanguine': '#c7442a',
  peche: '#f8d3b1',
  'peche fonce': '#e8a06a',
  abricot: '#f9c99a',
  corail: '#f2766a',
  saumon: '#ed9b87',
  terracotta: '#c96f4a',
  caramel: '#af6f4e',
  cuivre: '#b87333',
  bronze: '#a8723a',
  rouille: '#a54b2a',
  cannelle: '#a05a36',

  /* Jaunes & ors */
  jaune: '#f5d13d',
  'jaune citron': '#f4e04d',
  'jaune paille': '#f4e8a0',
  'jaune poussin': '#f7d95f',
  'jaune mais': '#f2c94c',
  moutarde: '#d4a538',
  'jaune dore': '#e8b94a',
  ambre: '#d8902a',
  miel: '#d9a441',
  topaze: '#d9b45b',
  or: '#c9921e',
  dore: '#c99a2e',
  laiton: '#b59248',
  champagne: '#f1e0c8',

  /* Violets / lavandes */
  violet: '#7d4f9b',
  'violet clair': '#b78fda',
  'violet fonce': '#5a2d82',
  'violet prune': '#6b2d5c',
  prune: '#5e244b',
  aubergine: '#3d2242',
  cassis: '#4a2340',
  mauve: '#a582b0',
  lilas: '#c3aad6',
  lavande: '#b8a7d4',
  parme: '#c6b5e0',
  orchidée: '#c77fd6',
  amethyste: '#9969c7',
  pourpre: '#7d3b8a',
  indigo: '#3d2b6b',
  'indigo nuit': '#31235f',

  /* Bleus */
  bleu: '#2a6ad6',
  'bleu clair': '#9bc3e0',
  'bleu ciel': '#7ec3e8',
  'bleu glacier': '#a8d8e8',
  'bleu roi': '#2a52be',
  'bleu marine': '#1c3a6b',
  'bleu nuit': '#0f2b4c',
  azur: '#4a90d9',
  cobalt: '#0f52ba',
  outremer: '#1e3a8a',
  'bleu acier': '#4a6fa5',
  'bleu ardoise': '#6a7b8d',
  'bleu denim': '#4c6e9c',
  pervenche: '#8fa8d8',
  'bleu pervenche': '#7f9fd6',
  'bleu lavande': '#b5c6e0',
  'bleu electrique': '#2f64d8',
  'bleu paon': '#0c6f78',
  'bleu petrole': '#1c4b50',
  'bleu canard': '#00626b',
  ocean: '#1f6f8b',
  turquoise: '#26c6b3',
  sarcelle: '#0f9688',

  /* Verts */
  vert: '#3d9958',
  'vert clair': '#9fd89c',
  'vert pomme': '#b0d93b',
  'vert anis': '#c9e265',
  'vert menthe': '#7fd9b0',
  menthe: '#bce8d4',
  'vert d eau': '#a0e6d8',
  'vert emeraude': '#2f8f68',
  'vert jade': '#4aa87a',
  'vert prairie': '#6fbf4a',
  'vert foret': '#275f2f',
  'vert sapin': '#1b5e42',
  'vert bouteille': '#14594a',
  'vert mousse': '#8a9a5b',
  'vert absinthe': '#7fbf6a',
  'vert tilleul': '#b6ce5f',
  eucalyptus: '#6fae86',
  basilic: '#3a6b46',
  olive: '#8a9a3f',
  kaki: '#7c7d3d',

  /* Bruns / neutres */
  marron: '#7a4a2a',
  brun: '#6a4228',
  'brun clair': '#8a6a4a',
  cacao: '#6f4a3a',
  cafe: '#4a3628',
  chatai: '#6f4a32',
  sephia: '#7a4a2a',
  noisette: '#a3835a',
  amande: '#d9d2a3',
  taupe: '#8b8378',
  'gris taupe': '#7d7468',
  mastic: '#d6d0c0',
  lin: '#e9dcc8',
  sable: '#c7b299',
  'beige sable': '#c7b299',
  beige: '#d3b795',
  ecru: '#f5efdc',
  creme: '#fdf6e5',
  ivoire: '#efe3d3',
  vanille: '#f3ead0',
  blanc: '#ffffff',
  'blanc casse': '#f5f2ec',
  'blanc mat': '#f0f0f0',
  naturel: '#f1e8d6',
  ecossais: '#d8c9a8',

  /* Gris */
  gris: '#9e9e9e',
  'gris clair': '#cfcfcf',
  'gris fonce': '#555555',
  'gris argente': '#a9adb4',
  'gris ardoise': '#5b6b73',
  'gris bleute': '#8aa0b0',
  'gris souris': '#9a9a94',
  'gris tourterelle': '#b8b0a4',
  'gris anthracite': '#363636',
  ardoise: '#708090',
  'gris perle': '#c5c9cc',
  nuit: '#2f3a52',
  argent: '#c0c0c0',
  perle: '#dcd9d3',

  /* Extras */
  noir: '#232323',
  chocolat: '#5a3a22',
  cyan: '#00bcd4',
  pistache: '#c1e0a1',
  marine: '#14284b',
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

/** Liste `{ label, hex }` triée, pour la palette d'aide à la saisie. */
export function colorList() {
  return Object.entries(FRENCH_COLORS)
    .map(([label, hex]) => ({ label, hex }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }))
}