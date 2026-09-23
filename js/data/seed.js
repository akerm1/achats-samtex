/* ------------------------------------------------------------------ */
/* Données de démonstration (premier lancement, sans GitHub)           */
/* ------------------------------------------------------------------ */

const demoPhoto = (base, accent) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
      '<defs><pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">' +
      `<rect width="26" height="26" fill="${base}"/>` +
      `<circle cx="13" cy="13" r="4" fill="${accent}" opacity=".5"/></pattern></defs>` +
      '<rect width="400" height="300" fill="url(#p)"/></svg>',
  )

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

/** Liste d'exemple, utile pour découvrir l'application. */
export function buildSeedDb() {
  return [
    {
      id: 'demo-1',
      name: 'Ceinture satin ivoire',
      photo: demoPhoto('#efe3d3', '#c9a37a'),
      note: 'mariage, finition brillant',
      type: 'ceinture',
      color: 'ivoire',
      colorRgb: { r: 239, g: 227, b: 211 },
      supplier: 'Marché Saint-Pierre',
      qty: 25,
      unit: 'piece',
      price: 1.5,
      priority: 'haute',
      status: 'todo',
      boughtAt: null,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      id: 'demo-2',
      name: 'Tissu mousseline',
      photo: demoPhoto('#f3dcdf', '#d19aa6'),
      note: 'tissage fin, 140 cm de large',
      type: 'tissu',
      color: 'rose poudré',
      colorRgb: { r: 243, g: 220, b: 223 },
      supplier: 'Tissus Duval',
      qty: 40,
      unit: 'metre',
      price: 3.2,
      priority: 'normale',
      status: 'todo',
      boughtAt: null,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
    {
      id: 'demo-3',
      name: 'Ceinture velours',
      photo: demoPhoto('#2f3a52', '#7f8db3'),
      note: 'finition mate, surprise mariage',
      type: 'ceinture',
      color: 'nuit',
      colorRgb: { r: 47, g: 58, b: 82 },
      supplier: 'Marché Saint-Pierre',
      qty: 15,
      unit: 'piece',
      price: 2.1,
      priority: 'normale',
      status: 'todo',
      boughtAt: null,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
    {
      id: 'demo-4',
      name: 'Tulle souple',
      photo: demoPhoto('#e8eef0', '#b9c8cc'),
      note: 'largeur 2,50 m, tulle de précision',
      type: 'tulle',
      color: 'blanc mat',
      colorRgb: { r: 232, g: 238, b: 240 },
      supplier: 'Grossiste Nord',
      qty: 8,
      unit: 'rouleau',
      price: 6,
      priority: 'basse',
      status: 'todo',
      boughtAt: null,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(8),
    },
    {
      id: 'demo-5',
      name: 'Ruban organza',
      photo: demoPhoto('#efe0cd', '#cbb08d'),
      note: 'bolt de 20 m',
      type: 'ruban',
      color: 'champagne',
      colorRgb: { r: 239, g: 224, b: 205 },
      supplier: 'Grossiste Nord',
      qty: 5,
      unit: 'rouleau',
      price: 1.2,
      priority: 'normale',
      status: 'bought',
      boughtAt: daysAgo(6),
      createdAt: daysAgo(12),
      updatedAt: daysAgo(6),
    },
    {
      id: 'demo-6',
      name: 'Fil de polyester',
      photo: '',
      note: 'bobine 5000 m, crochet 120',
      type: 'fil',
      color: 'assorti',
      supplier: 'Mercerie Léa',
      qty: 12,
      unit: 'piece',
      price: 0.8,
      priority: 'normale',
      status: 'bought',
      boughtAt: daysAgo(40),
      createdAt: daysAgo(60),
      updatedAt: daysAgo(40),
    },
    {
      id: 'demo-7',
      name: '',
      photo: demoPhoto('#d9b08c', '#8a5a33'),
      note: 'lot assorti, sans nom — la photo parle pour elle-même',
      type: 'autre',
      color: '',
      colorRgb: { r: 217, g: 176, b: 140 },
      supplier: '',
      qty: 1,
      unit: 'piece',
      price: null,
      priority: 'normale',
      status: 'todo',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  ]
}