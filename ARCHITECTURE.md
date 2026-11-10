# Architecture

Cette page répond à une seule question : **« je veux changer X, j'ouvre quel
fichier ? »**. Tout le code applicatif est sous `src/`, sans build, sans
dépendance : des modules ES natifs chargés directement par le navigateur.

## Carte des dossiers

```
index.html            la coque HTML (barre du haut, #view, barre du bas)
sw.js                 service worker : réseau d'abord, aucun cache de code
manifest.webmanifest  installation PWA
version.json          version publiée (comparée à src/core/app.js)

src/main.js           démarrage : thème → routes → actions → raccourcis → PWA

src/app/              la plomberie de l'application
  routes.js             quels écrans existent, laquelle s'affiche (hash)
  actions.js           table `data-action="…"` → fonction (clic délégué)
  handlers.js          suppressions / vidages, avec confirmation + annulation
  shortcuts.js         N, /, S, 1…5
  pwa.js               service worker, installation, mises à jour

src/core/             briques sans métier, réutilisables partout
  dom.js                $, $$, esc, copie, téléchargement, debounce
  format.js             montants, dates, pourcentages, tailles
  math.js               clamp, round2
  ids.js                uid()
  utils.js              BARREL : tout le reste importe d'ici
  router.js             lecture du hash + navigation
  storage.js            localStorage sûr (quota, nav privée)
  feedback.js           toast + boîte de confirmation
  theme.js              clair / sombre
  photo.js              compression des photos avant stockage
  update.js             comparaison avec version.json
  app.js                APP_VERSION / APP_RELEASE

src/data/             l'état et la persistance
  store.js              produits + factures + synchro (gros module assumé)
  products-model.js     modèle Produit : catégories, unités, tri, totaux
  bills-model.js        modèle Facture : statuts, tri, totaux
  analysis-model.js     calculs Analyse (ventes, exercices, comparaisons)
  expenses-model.js     calculs Dépenses (catégories, transferts, recettes)
  analysis-store.js     état Analyse + sauvegarde locale
  expenses-store.js     état Dépenses + sauvegarde locale
  sync.js               fournisseur de synchro (GitHub / Cloudflare)
  github.js             client GitHub
  worker-api.js         client du worker Cloudflare
  backup.js             export / import JSON, CSV
  photo-store.js        photos en IndexedDB
  colors.js             nom de couleur → teinte

src/screens/          un dossier par écran, un fichier par morceau
  list/                 Liste       : index.js, card.js, form.js
  bills/                Factures    : index.js, form.js
  analysis/index.js     Analyse     (feuille unique, volontairement d'un bloc)
  expenses/             Dépenses    : index.js, state.js, header.js,
                        filters.js, cards.js, expenses-tab.js,
                        categories-tab.js, investments-tab.js,
                        revenues-tab.js, forms/*.js
  settings/index.js     Réglages    (volontairement d'un bloc)

src/ui/               ce qui n'appartient à aucun écran
  shell.js              barre du haut, navigation du bas, bandeaux
  dialog.js             deferWhileEditing, openDialog/closeDialog, skeleton
  preview.js            aperçu agrandi couleur / photo
  icons.js              toutes les icônes SVG

src/styles/           tokens.css, base.css, layout.css, components.css, views.css
tools/                bancs de vérification (voir « Vérifier » ci-dessous)
icons/                icônes PWA et favicon (servies telles quelles)
worker/               worker Cloudflare (synchro privée)
```

## Où changer quoi

| Je veux… | Fichier |
| --- | --- |
| Renommer un écran, changer son icône, son ordre dans la barre | `src/ui/shell.js` (`NAV_ITEMS`) puis `src/app/routes.js` (`VIEWS`) |
| Ajouter un écran | créer `src/screens/<nom>/index.js` exportant un objet `{ id, route, label, icon, mount, update }`, puis l'ajouter à `VIEWS` |
| Changer l'écran affiché par défaut | `src/app/routes.js` (`DEFAULT_ROUTE`) |
| Brancher un nouveau bouton | `data-action="mon-action"` dans le HTML + une entrée dans `src/app/actions.js` |
| Changer un texte, une carte, un filtre d'écran | le fichier de l'écran concerné, sous `src/screens/` |
| Ajouter un champ à un formulaire | `src/screens/list/form.js`, `src/screens/bills/form.js` ou `src/screens/expenses/forms/*.js` |
| Changer une règle de calcul (TVA, totaux, tri) | le `*-model.js` correspondant dans `src/data/` |
| Changer la façon dont les données sont enregistrées / synchronisées | `src/data/store.js` |
| Changer un format (montant, date, nombre) | `src/core/format.js` |
| Changer un espacement, une couleur, une ombre | `src/styles/tokens.css` d'abord, puis le fichier CSS concerné |
| Changer un raccourci clavier | `src/app/shortcuts.js` |

## Trois règles de lecture

1. **Un écran = un dossier.** `src/screens/<écran>/index.js` est le point
   d'entrée ; les autres fichiers du dossier ne sont appelés que par lui.
2. **Le métier ne touche pas au DOM, l'écran ne calcule pas.** Un `*-model.js`
   est fait de fonctions pures ; un écran assemble du HTML et délègue les
   calculs au modèle, les écritures au store.
3. **`src/core/utils.js` est un barrel.** On importe `esc`, `formatMoney`,
   `toNumber`… depuis `utils.js` ; l'implémentation est répartie dans `dom.js`,
   `format.js`, `math.js`, `ids.js`. Si un symbole manque, c'est ce barrel
   qu'il faut compléter.

## Deux modules volontairement non découpés

- `src/data/store.js` (~1070 lignes) : produits, factures, préférences,
  brouillon local et moteur de synchronisation partagent le même état mutable.
  Le découper demanderait de le transformer en classes ou en injections de
  dépendances — plus de code, pas moins de lecture.
- `src/screens/analysis/index.js` (~700 lignes) et
  `src/screens/settings/index.js` (~560 lignes) : ce sont des feuilles
  uniques, très denses en HTML, qu'un découpage rendrait plus difficiles à
  suivre (il faudrait sauter de fichier en fichier pour lire un seul rendu).

## Vérifier

Aucun build, aucun `npm install`.

```
node tools/check.mjs                  rendu des composants (rapide)
node tools/check.mjs --e2e            + l'application réelle dans un iframe
node tools/check.mjs --only bills     parcours factures
node tools/check.mjs --only analysis  calculs + parcours analyse
```

Pour ouvrir l'application en local, n'importe quel serveur statique fait
l'affaire (les modules ES ne se chargent pas en `file://`) :

```
npx serve .        # ou : python -m http.server
```

Après une mise à jour du code, forcer un rechargement complet
(`Ctrl+Shift+R`) ou rouvrir la PWA installée : le service worker ne met pas le
code en cache, mais le navigateur peut garder l'ancienne coque quelques
minutes.
