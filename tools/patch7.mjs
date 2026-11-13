import fs from 'node:fs'

const p = 'tools/expenses.html'
let lines = fs.readFileSync(p, 'utf8').split('\n')

// The check is actually passing the test (it returns the string 'onglet dans le rail' as detail)
// But the label says "l'onglet dépenses existe" and it should check it's NOT the revenue tab.
// Let's reword it properly - the expenses tab exists in the dock, but when we're on Recettes,
// we need to verify that Recettes is the active dock tab, not Dépenses.
lines[393] = `  check('défaut : le dock marque Recettes (pas Dépenses)', /recettes/i.test(rail?.getAttribute('href') || ''), rail?.getAttribute('href') || 'aucun lien actif')`

fs.writeFileSync(p, lines.join('\n'))
console.log('ok')