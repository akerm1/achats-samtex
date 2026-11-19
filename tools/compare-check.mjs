#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Contrôle de la comparaison de recettes : une ligne par année,       */
/* pour un jour (MM-JJ) ou un mois (MM).                               */
/* Usage : node tools/compare-check.mjs                                */
/* ------------------------------------------------------------------ */

import fs from 'node:fs'
import { revenuePeriods } from '../src/data/expenses-model.js'
import { periodLabel } from '../src/core/format.js'
import { toolbarHtml } from '../src/ui/toolbar.js'

const { sales } = JSON.parse(fs.readFileSync('analysis.json', 'utf8'))
const revenues = sales.map((sale) => ({ date: sale.date, amount: sale.amount || 0 }))
const money = (n) => new Intl.NumberFormat('fr-FR').format(n)

let failed = 0
function expect(label, actual, wanted) {
  const ok = actual === wanted
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'NON '} ${label} : ${actual}${ok ? '' : ` (attendu ${wanted})`}`)
}

/* Avril 2025 et avril 2026 sont tous deux couverts : deux lignes. */
const april = revenuePeriods(revenues, [{ unit: 'month', key: '04' }])
expect('avril -> lignes', april.length, 2)
expect('avril 2025', money(april[0]?.total), money(704000))
expect('avril 2026', money(april[1]?.total), money(720000))
expect('avril 2026 jours', april[1]?.days, 30)

/* Novembre 2026 sort des données (fin octobre 2026) : une seule ligne. */
const november = revenuePeriods(revenues, [{ unit: 'month', key: '11' }])
expect('novembre -> lignes', november.length, 1)
expect('novembre 2025', money(november[0]?.total), money(383000))

/* Le 13 novembre n'existe qu'en 2025 ; le 1er janvier qu'en 2026. */
const nov13 = revenuePeriods(revenues, [{ unit: 'day', key: '11-13' }])
expect('13 nov. -> lignes', nov13.length, 1)
expect('13 nov. 2025', money(nov13[0]?.total), money(15000))

const jan1 = revenuePeriods(revenues, [{ unit: 'day', key: '01-01' }])
expect('1er janv. -> lignes', jan1.length, 1)
expect('1er janv. 2026', jan1[0]?.year, '2026')

expect('libellé jour', periodLabel('day', '11-13'), '13 nov.')
expect('libellé mois', periodLabel('month', '11'), 'novembre')

/* Le sélecteur suit l'unité : un mois propose des mois, pas des jours. */
const toolbar = toolbarHtml({
  id: 'x',
  prefix: 'set-revenues',
  sort: 'recent',
  sortOptions: [{ value: 'recent', label: 'Récentes' }],
  layout: 'days',
  layouts: [{ value: 'days', label: 'Par jour', icon: 'calendar' }],
  compareUnits: [
    { value: 'day', label: 'Jour' },
    { value: 'month', label: 'Mois' },
  ],
  compareMode: true,
  compareUnit: 'month',
  comparePeriods: [{ unit: 'month', key: '04' }],
})
expect('sélecteur de mois', toolbar.includes('type="month"'), true)
expect('puce « avril »', toolbar.includes('avril'), true)
expect('pas de semaine', toolbar.includes('Semaine'), false)

if (failed) {
  console.log(`\n${failed} écart(s).`)
  process.exit(1)
}
console.log('\nComparaison OK.')
