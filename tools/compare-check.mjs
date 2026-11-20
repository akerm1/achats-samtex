#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Contrôle de la comparaison de recettes : une ligne par année,       */
/* pour un jour (MM-JJ) ou un mois (MM).                               */
/* Usage : node tools/compare-check.mjs                                */
/* ------------------------------------------------------------------ */

import fs from 'node:fs'
import { monthRange, revenueComparisonGap, revenuePeriods, totalRevenues } from '../src/data/expenses-model.js'
import { periodLabel } from '../src/core/format.js'
import { toolbarHtml } from '../src/ui/toolbar.js'

/* Source : le relevé de recettes collé depuis le classeur (TSV). Il reste
   des lignes à 0 DA : elles représentent les jours sans recette. */
const TSV = 'data/recettes-2025-04_2026-10.tsv'
const revenues = fs
  .readFileSync(TSV, 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => line.split('\t'))
  .filter((cells) => /^\d{4}-\d{2}-\d{2}$/.test(cells[0]))
  .map(([date, , , amount]) => ({ date, amount: Number(String(amount).replace(/[^\d.-]/g, '')) || 0 }))
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

/* Écart dernière − première année : positif en hausse, négatif en baisse. */
const aprilGap = revenueComparisonGap(april)
expect('écart avril', money(aprilGap?.gap), money(16000))
expect('écart avril : première année', money(aprilGap?.first), money(704000))
expect('écart avril : dernière année', money(aprilGap?.last), money(720000))
expect('écart avril : une période', aprilGap?.pairs, 1)
expect('une seule année : pas d’écart', revenueComparisonGap(november), null)

const falling = revenueComparisonGap([
  { unit: 'month', key: '05', year: '2025', total: 500 },
  { unit: 'month', key: '05', year: '2026', total: 300 },
])
expect('écart négatif', falling?.gap, -200)

const twoGroups = revenueComparisonGap([
  { unit: 'month', key: '04', year: '2025', total: 100 },
  { unit: 'month', key: '04', year: '2026', total: 150 },
  { unit: 'month', key: '05', year: '2025', total: 200 },
  { unit: 'month', key: '05', year: '2026', total: 180 },
])
expect('deux périodes : écart cumulé', twoGroups?.gap, 30)
expect('deux périodes : comptées', twoGroups?.pairs, 2)

/* Le mois en cours : il additionne les jours du mois, et rien des voisins. */
const june = monthRange('2026-06-17T10:00:00.000Z')
expect('mois : premier jour', june.startDate, '2026-06-01')
const juneTotal = totalRevenues(
  [
    { date: '2026-05-31', amount: 10 },
    { date: '2026-06-01', amount: 2 },
    { date: '2026-06-30', amount: 3 },
    { date: '2026-07-01', amount: 99 },
  ],
  june,
)
expect('mois : seuls les jours du mois comptent', juneTotal, 5)

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
