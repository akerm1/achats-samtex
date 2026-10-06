# Mes achats — Sashes & Tissus (`purchase gros`)

Documentation complète du projet : objectif, fonctionnement, architecture, chaque fichier,
chaque fonction.

---

## 1. Objectif

Une **PWA statique gratuite, sans build** (vanilla ES modules, aucun framework) pour suivre
les achats en gros (ceintures, tissus, tulle, rubans, fils, dentelles…) avec photos, noms de
couleurs français + RGB, quantités, fournisseurs et prix. **Une seule liste partagée**, la même
sur le téléphone et sur l'ordinateur, synchronisée automatiquement entre appareils. On ajoute
ses articles, on les coche à l'achat, on les supprime quand ils sont livrés. Deux écrans
principaux (Liste, Réglages) plus un écran Factures, aucune donnée de démonstration,
hébergeable sur **GitHub Pages**.

**Contraintes qui façonnent tout le reste :** pas de framework, pas d'étape de compilation,
pas de serveur propre (sauf le Worker Cloudflare optionnel), tout lisible en fichiers plats,
vérifiable en une commande : `node tools/check.mjs`.

---

## 2. Fonctionnement général (de bout en bout)

### Séquence de démarrage
1. `index.html` charge 5 feuilles de style, les polices (DM Sans + Fraunces), puis
   `js/main.js` (module ES).
2. Un **watchdog en ligne (script non-module)** dans `index.html` protège le démarrage : si
   `#view` affiche encore « Chargement de la liste… » après 8 s, ou si une erreur JS survient,
   il force la mise à jour du service worker puis recharge (2 tentatives max, cooldown 60 s).
3. `main.js init()` : thème → routeur → délegation globale `data-action` → raccourcis clavier →
   enregistrement du service worker → invite d'installation → `renderChrome()` → abonnement au
   store → montage de la route du hash → vérification de mise à jour en arrière-plan.
4. `store.js load()` (exécuté à l'import) : lit la liste + factures du localStorage, réinjecte
   les photos depuis IndexedDB, puis effectue **une seule** lecture distante (dépôt public par
   défaut pour un appareil neuf, sinon le fournisseur configuré).

### Flux de données à chaque mutation
`action → store.addProduct/toggle/delete… → touch()` (écriture localStorage sérialisée +
écriture photo IndexedDB) `→ emit()` (redessine la coquille + la vue) `→ push()` (publie chez
le fournisseur si configuré ; en cas d'échec le drapeau `dirty` est conservé — jamais de perte
de modification locale).

### Synchronisation (deux fournisseurs, une seule interface `js/data/sync.js`)
| | GitHub | Cloudflare « lien privé » |
|---|---|---|
| Point d'entrée | `api.github.com/.../contents/products.json` | `https://…workers.dev/<clé de 32 caractères>` |
| Authentification | aucune en lecture (dépôt public), jeton fine-grained en écriture | l'URL **est** le mot de passe |
| Accès | lecture seule par défaut, lecture+écriture avec jeton valide | lecture + écriture |
| Document | v3 `{version, updatedAt, settings, products}` | v4 `{…, rev, products, bills}` |
| Factures | **non synchronisées** | synchronisées, photos de tickets comprises |
| Conflits | relecture d'un `sha` frais + nouvel essai ; local `dirty` gagne | en-tête `X-Rev` → 409 → fusion côté client par `id` + un nouvel essai |

Pas d'arrière-plan ni de scrutation : **un rafraîchissement = une lecture distante** (rechargement
de page, clic sur la pastille, ou « Synchroniser »).

### Mécanisme de mise à jour
`version.json` (racine) est le seul repère de version publié. `js/core/update.js` le lit avec
`cache:no-store` et le compare à `APP_VERSION` de `js/core/app.js` ; l'installation n'a lieu
qu'au clic explicite (vidage de tous les caches → rafraîchissement du SW → rechargement avec
empreinte `?v=`). `sw.js` **ne met jamais le code en cache** — réseau d'abord uniquement, le cache
ne servant qu'en repli hors-ligne → impossible d'avoir un mélange de versions.

---

## 3. Structure du projet

```
index.html               coquille de l'app + script watchdog en ligne
manifest.webmanifest     manifeste PWA (raccourcis : Ajouter, Liste)
version.json              8.3.0 / 2026-09-29 — repère de mise à jour
sync-defaults.json       dépôt GitHub par défaut (akerm1/achats-test/main)
products.json            liste publiée (v3) dans le dépôt public
sw.js                    service worker : repli hors-ligne uniquement
css/  tokens · base · layout · components · views
js/
  main.js                démarrage, routeur, 34 actions globales, raccourcis
  core/  utils storage router theme feedback photo app update
   data/  store model colors github worker sync backup photo-store analysis analysis-store
   ui/    shell view icons preview product-card product-form bill-form
          views/{list,bills,settings,analysis}.js
worker/  share-list-worker.mjs · wrangler.toml · setup.ps1 · LIEN-PRIVE.txt(git-ignoré)
tools/   check.mjs · check-page.html · e2e.html · bills.html · analysis.html · preview.html
icons/   icônes PWA (64/192/512, maskable, apple-touch, favicon, svg)
```

---

## 4. Chaque fichier, chaque fonction

### `js/main.js` (point d'entrée, 471 lignes)
| Fonction | Rôle |
|---|---|
| `showRoute(route)` | résout redirection/inconnu → `liste`, scroll haut, monte la vue dans `#view` |
| `initRouting()` | démarre le routeur par hash ; intercepte le raccourci PWA `#/ajouter` → ouvre le formulaire produit |
| `productById(id)` | recherche linéaire |
| `shareList()` | `navigator.share` ou presse-papiers + toast |
| `handleDelete(id)` | confirmation → suppression → toast « Annuler » (`restoreProduct`) |
| `handleClearBought()` / `handleClearAll()` | confirmation → vidage → toast d'annulation |
| `initActions()` | délegation document click/keydown pour `[data-action]` et `[data-role="card-body"]` |
| `isTyping(target)` | vrai dans input/textarea/select/contenteditable |
| `initShortcuts()` | `N` nouveau · `/` recherche · `S` sync · `1 2 3` vues (bloqué en saisie/dialogue ouvert) |
| `initServiceWorker()` / `checkUpdateInBackground()` / `initInstallFlow()` | enregistrement SW, vérification silencieuse (bandeau seulement), `beforeinstallprompt`/`appinstalled` |
| `init()` | ordre de démarrage complet ; `handleDisconnect()` confirmation → `clearConfig()` |

Registre `ACTIONS` (34) : `open-form, open-bill-form, edit, edit-bill, preview-color,
preview-photo, preview-receipt, preview-bill-photo, add-receipt, toggle, toggle-paid, delete,
delete-bill, clear-bought, clear-all, reset-filters, reset-bill-filters, set-bill-status,
clear-bills-search, set-filter, set-category, clear-search, share-list, go-settings, sync-now,
disconnect-github, export-json, export-csv, install-update, install-app, hide-install,
hide-offline, hide-sync-error` — chacun enveloppé dans try/catch → toast d'erreur.

### `js/core/*`
| Fichier | Exports (une ligne chacun) |
|---|---|
| **utils.js** | `$`, `$$` raccourcis DOM · `esc`/`escAttr` échappement HTML · `debounce` · `clamp` · `round2` · `toNumber` (`"1,50"`→1.5) · `uid(prefix)` générateur d'id · `NO_VALUE` (`—`) · `formatMoney` (EUR fr-FR) · `formatNumber` · `formatDate`/`formatDateLong`/`formatTime`/`formatRelative` (français) · `toDate` · `plural` · `percent` · `downloadText` (Blob+`<a>` temporaire) · `copyText` (clipboard + repli textarea) · `slug` · `readableBytes` (o/Ko/Mo) |
| **storage.js** | enveloppe sûre de `localStorage` : `get/set/setRaw/remove/isPersistent/failureReason/isFull` ; repli sur une Map mémoire en navigation privée ; ne lève jamais d'erreur ; détecte le quota sur tous les moteurs |
| **router.js** | `currentRoute()` (hash moins `#/` et `?query`), `currentParams()`, `navigate(route,{replace})`, `onRouteChange`, `startRouter` ; erreurs d'écouteur isolées |
| **theme.js** | `THEMES` (Clair/Sombre/Système), `resolveTheme`, `getThemePreference`, `applyTheme` (pose `data-theme` + réécrit les deux `<meta theme-color>`), `setTheme`, `initTheme` (suit `prefers-color-scheme` seulement en mode Système) ; clé `purchase-gros-theme-v1` |
| **feedback.js** | `toast(msg,{type,actionLabel,onAction,duration})` — max 3, 4,5 s, bouton d'action (servi pour l'annulation) · `confirmAction({title,message,danger})` → `Promise<boolean>` sur `<dialog>` natif, repli `window.confirm` |
| **photo.js** | `isImageFile`, `compressPhoto(file,maxSide=900,quality=0.72)` → canvas → JPEG (fond blanc), `readableSize`, `fileToDataUrl` (ne rejette jamais, messages en français) |
| **app.js** | `APP_VERSION='8.3.0'`, `APP_RELEASE='2026-09-29'` — doit égaler `version.json` |
| **update.js** | `VERSION_FILE`, `subscribe`, `compareVersions`, `isUpdateAvailable`, `getUpdateState`, `checkForUpdate` (fetch no-store, garde anti-réentrance, indicateur hors-ligne), `installUpdate` (vide les caches → `registration.update()` → SKIP_WAITING → `location.replace('?v=…')`, chien de garde 15 s) |

### `js/data/*`
| Fichier | Contenu |
|---|---|
| **store.js** (1140 lignes, le cœur) | **État :** `products, bills, config, prefs, sha, remoteRev, state{loaded,status,message,messageKind,lastSyncAt,pending,dirty}`, `usage`, `storageProblem`, `writeChain` (écritures sérialisées). **Exports :** `DEFAULT_PREFS`, `subscribe`, `statusLabel` (À jour/Connexion…/Envoi…/Hors ligne/Erreur/Local seul), `getState` (ajoute `provider, readOnly, unpublished, pendingCount, storageFull, usage…`), `isStorageFull`, `arePhotosSeparated`, `getProducts/getBills`, `isLoaded/getStatus/getSyncMessage/getConfig/getLastSyncAt/getPrefs/isPending`, `setPrefs` (prefs partagées poussées), `saveConfig`, `setSyncMessage`, `clearConfig` (drapeau d'opt-out), `load`, `refresh` (la seule lecture distante), `push({force})` (publie produits+réglages+factures), `importFromGithub` (migration GitHub → Worker en un clic), **CRUD produit** `addProduct/updateProduct/toggleBought/setBought/deleteProduct/restoreProduct/clearBought/restoreMany/clearAll/importProducts/replaceAll`, **CRUD facture** `addBill/updateBill/toggleBillPaid/deleteBill/restoreBill/importBills`. **Internes :** `persistLocal/persistBills` (photos séparées dans IndexedDB, rapport de quota), `writePhotos` (nettoie les orphelins avec produits ∪ factures), `syncWithRemote` (garde anti-version-ancienne, `dirty` → push sinon adoption du distant), `markTokenRejected`, `readOnlyNote`, `settingsSnapshot/applyRemoteSettings`, `connectDefault`, `notify` (cooldown 8 s). |
| **model.js** (420) | Enums : `STATUS`, `CATEGORIES` (8 catégories avec unité par défaut), `UNITS` (piece/metre/rouleau), `PRIORITIES`, `SORTS` (recent/name/price/qty/priority), `CARD_LAYOUTS` (card/mosaic/row), `BILL_STATUS`. Fonctions : `colorCss/colorHex`, `displayName`, `categoryLabel`, `unitLabel/unitShort`, `priorityMeta`, `defaultUnitFor`, `normalizeProduct`/`normalizeList` (tolérant, conserve les champs inconnus), `productView`, `describeQty`, `matchesQuery` (AND de jetons, insensible accents), `sortProducts` (achetés toujours en bas), `filterProducts`, `groupByCategory`, `sumTotal`, `computeStats`, `knownSuppliers`, `listSummaryText` (texte à partager), `normalizeBill`/`normalizeBillList`, `billView`, `sortBills`, `filterBills`, `sumBills` (total/payé/à venir), `knownBillSuppliers`. |
| **colors.js** (350) | ~157 couleurs françaises → hex ; `normalize`, `colorFromText` (exact puis sous-chaîne la plus longue), `colorList`, `hexToRgb`, `rgbToHex`, `hslToHex`, `rgbToHsl`, `searchColors(text,limit=8)` (exact→préfixe→mot→sous-chaîne), `nearestColor(hex)` (distance HSL pondérée — nomme les couleurs choisies à la roue). |
| **github.js** (394) | `normalizeConfig` (jeton/owner/repo/branche), `canWrite` (jeton && !tokenRejected), `fetchDefaultConfig` (lit `sync-defaults.json`), `fetchRemoteList` (GET contents ; 404→sondage du dépôt ; **401→un nouvel essai anonyme** → lecture seule ; 403/429→messages distincts ; hors-ligne), `putRemoteList` (PUT base64 ; ignoré en lecture seule ; 404→création sans sha ; 409/422→sha frais + un nouvel essai), `testConnection`, `READ_ONLY_MESSAGE`. |
| **worker.js** (248) | `normalizeConfig` (nettoie le lien collé, valide `https://hôte/chemin`, rejette le gabarit), `canWrite` (lien présent), `fetchRemoteList` (`GET`, `empty:true` → « publiez la vôtre »), `putRemoteList(config,list,sha,settings,bills)` (`PUT` avec `X-Rev` ; **409 → fusion produits+factures, un nouvel essai**), `testConnection` (rapporte nombre + révision), `LINK_PLACEHOLDER`. |
| **sync.js** (66) | Bascule de fournisseur : `PROVIDER_GITHUB/PROVIDER_WORKER`, `providerOf`, `normalizeConfig`, `canWrite`, `fetchRemoteList`, `putRemoteList` (**écarte les factures pour GitHub**), `testConnection`, `fetchDefaultConfig`. |
| **backup.js** (137) | `BACKUP_VERSION=2`, `buildBackup(products,bills)`, `toJSON`, `backupFilename`, `toCSV` (`;`+BOM+CRLF, 13 colonnes, sans photos), `parseBackup` (accepte les tableaux nus v1), `mergeProducts`/`mergeBills` (par `id`, **l'entrant gagne**, `updatedAt=now`), `exportJSON`, `exportCSV`. |
| **photo-store.js** (236) | IndexedDB `purchase-gros-photos` / store `photos` / keyPath `id`, enregistrements `{id, photo, receipt}`. `failureReason`, `isAvailable`, `ensureReady`, `put(id,dataUrl,type)` (une valeur vide **supprime ce champ**, évite la résurrection d'une photo), `get`, `getAllWithReceipts` (une lecture → deux Maps), `remove`, `prune(validIds)` (nettoyage des orphelins), `clear`. |
| **products.json** | Document v3 publié avec 2 produits de démonstration ; photos en base64 en ligne ; ne contient jamais de factures. |

### `js/ui/*`
| Fichier | Contenu |
|---|---|
| **shell.js** (339) | `NAV_ITEMS` (Liste/Factures/Réglages), `setActiveRoute`, `renderSyncPill` (6 états), `setInstallEvent`, `setUpdateAvailable`, `setOfflineReady`, `dismissInstall`, `promptInstall`, `isInstalled`, `canPromptInstall`, `isMobile`, `showInstallHelp` (dialogue par plateforme), `renderBanners` (priorité : non publié → erreur sync → mise à jour → hors-ligne → installation), `hideOfflineNotice`, `dismissSyncError`, `renderChrome` ; internes `tabItems` (bouton `+` central), `renderNav` (titre, nav haute, onglets bas + badge d'attente). |
| **view.js** | `deferWhileEditing(host,paint)` (ne vole jamais le curseur en cours de saisie), `loadingBlock()`. |
| **icons.js** | `icons` (~70 SVG inline 24px), `icon(name,size=14)`. |
| **preview.js** | `openColorPreview` (aplat + nom + Hex + RVB), `openPhotoPreview`, `openReceiptPreview` ; `<dialog>` unique, fermeture ✕/Esc/fond. |
| **product-card.js** (273) | `renderProductCard(item,layout)` → `renderCard` (visuel photo/couleur + corps + actions), `renderMosaic` (case carrée + barre + coche ronde), `renderRow` (vignette 56px) ; aides `heroBlock, compactVisual, priceBlock, metaBlock, toggleButton, editButton, priorityTag, boughtTag, shortPrice, articleClass`. |
| **product-form.js** (624) | `openProductForm(product?,{onSaved})`, `isProductFormOpen`. Photo (caméra/galerie, compression, garde quota), nom, catégorie→unité auto, **combobox couleur** (suggestions `searchColors`, flèches/Entrée/Échap, fermeture différée au blur), **roue de couleur HSL** (glisser pointeur, clavier flèches/Shift×10/Home/End, nom de couleur le plus proche), fournisseur (datalist), priorité segmentée, quantité (stepper), unité, prix, détails. |
| **bill-form.js** (204) | `openBillForm(bill?,{onSaved})`, `isBillFormOpen` ; fournisseur obligatoire, montant, note, statut segmenté (En attente/Payée), photo caméra/galerie + retirer. |
| **views/list.js** (322) | `listView` : `mount/update/resetFilters/clearSearch/focusSearch` ; internes `counts, header (compteur + total €), filterbar (recherche + onglets statut + puces catégorie), results (groupées par catégorie, à plat si tri priorité), emptyState (CTA contextuel + carte d'installation/erreur GitHub), sectionHtml, paint/refresh* (différés si saisie en cours)`. |
| **views/bills.js** (276) | `billsView` : `mount/update/resetFilters/clearSearch/focusSearch/setStatus` ; `syncNote` prévient que les factures ne synchronisent qu'avec le lien privé ; cartes de facture avec photo, montant, statut, bascule payée, modifier/supprimer. |
| **views/settings.js** (~640) | `settingsView` : `mount/update/repaint`. Tuiles : **Affichage** (thème, présentation) · **Partage** (lien privé : endpoint ; Tester, Enregistrer, Synchroniser, Importer depuis GitHub, Déconnecter ; bloc d'état : état, dernière synchro, produits/factures partagés, accès — **l'onglet GitHub lecture seule a été retiré**) · **Données** (export JSON/CSV, import fusion/remplacement, Vider la liste) · **Application** (installation, vérification→installation, à propos : version, stockage y compris photos de factures, raccourcis). |

### `worker/*` (backend optionnel)
| Fichier | Contenu |
|---|---|
| **share-list-worker.mjs** | Routes : `OPTIONS`→204 CORS, chemin≠`LIST_KEY`→**404 indistinguable**, absence de binding KV→500, `GET`→document (`{version:4, rev, settings, products, bills}`, ou `empty:true` au premier usage), `PUT`→ garde 20 Mo→413, JSON invalide→400, `products` non tableau→400, **`X-Rev` < `rev` courant → 409 avec le document courant factures comprises** (pour que le client fusionne), sinon écriture `rev+1` → `{rev, updatedAt, count}` ; autres méthodes→405. |
| **wrangler.toml** | nom `liste-achats`, binding KV `LIST`, `workers_dev=true`. |
| **setup.ps1** (261) | Script relançable en une exécution : `wrangler login` → création/réutilisation du namespace KV → génération/réutilisation d'une clé de 32 caractères → `secret put LIST_KEY` → `deploy` → vérification GET → écriture du lien dans `LIEN-PRIVE.txt` (git-ignoré) → instructions d'installation. |
| **LIEN-PRIVE.txt** | Le lien secret lui-même (git-ignoré, jamais commité). |

### `tools/*` (vérification — `node tools/check.mjs`)
| Passe | Ce qu'elle fait |
|---|---|
| **Sur disque** | `version.json` ≡ `APP_VERSION`/`APP_RELEASE` ; `.gitignore` protège le lien privé ; `node --check` sur chaque module `js/**` + scripts en ligne des bancs. |
| **Rendu (navigateur)** | Edge/Chrome sans interface charge `check-page.html`, importe les **vrais** modules, renvoie ~140 mesures : 20 jetons × 2 thèmes, contraste WCAG (encre 16,8:1…), comportement cartes/aperçus/clavier, les 3 présentations, carré de la mosaïque + part photo %, densité de la ligne, débordements de la coquille, titres serif, zéro erreur JS. |
| **`--e2e`** | lance la vraie application dans une iframe : seed 3 produits, rend chaque présentation, clique sur Réglages → change la présentation → vérifie que la liste **se repeint** (prouve que le réglage arrive à l'écran). |
| **`--only bills`** | profil séparé : pilote le module Worker sur un KV en mémoire (contrat de fusion 409), aller-retour backup, écran factures, et les deux régressions photo (prune ne doit pas supprimer les tickets ; vider une photo ne doit pas la faire réapparaître). |
| Options | `--width 430`, `--theme dark`, `--shot x.png`, `--keep`, `BROWSER=…`. **Code de sortie 0 = tout passe, 1 = au moins un échec.** |

`tools/preview.html?layout=card|mosaic|row&theme=dark&diag=1` rend une présentation à la main
(`diag` renvoie les mesures au lieu d'une image).

### Système de design CSS
- **tokens.css** — base claire + surcharge `[data-theme='dark']` : surfaces, encre, filets,
  marque (`--teal` émeraude), rayons (8–26), échelle typo (plancher 16 px), espaces 4/8/12/16/24,
  ombres, `--font-head` Fraunces / `--font-body` DM Sans, `--statusbar-h 64` `--tabbar-h 68`
  `--page-max 960`, jetons de mouvement.
- **base.css** — reset, titres serif, anneau de focus (3 px teal), utilitaires (`.sr-only`,
  `.u-*`), keyframes, bloc d'impression.
- **layout.css** — statusbar collante en verre, marque, états de la pastille de sync, page/vue,
  barre d'onglets avec disque `+` surélevé, toasts ; points de rupture **480 / 720 / 821 px**,
  `prefers-reduced-motion`.
- **components.css** — boutons (`btn--primary/soft/secondary/ghost/danger/icon`), champs/stepper/
  range, puces/labels, pastilles de couleur, dialogue d'aperçu, cartes/panneaux/progression,
  bandeaux, toasts, dialogues, états vides ; mobile force des champs à 16 px (pas de zoom iOS)
  et ≥48 px de hauteur tactile.
- **views.css** — en-tête de liste, barre de filtres, groupes, trois grilles (`grid--card`
  auto-fill 320px, `grid--mosaic` 3→4 colonnes, `grid--row` liste réglée), intérieurs
  carte/mosaïque/ligne, tuiles de réglages, formulaire produit, roue de couleur, responsive ;
  vue **Analyse** (mobile d'abord) : onglets collants sous la barre de statut, sélecteur
  d'exercice et de mois, fiche mensuelle (jour courant accentué, week-end teinté, pied
   total/total÷n/écart/moyenne collant au bord bas), feuille de comparaison, grille de
   cartes-sommaire (une carte = une section, les deux autres onglets compris, un appui
   y conduit) et panneaux de l'onglet Générale.

---

## 5. Modèle de données

**Produit :** `id, name, photo, receipt, note, type(8 catégories), color, colorRgb{0-255},
supplier, qty≥1, unit(piece/metre/rouleau), price, priority(haute/normale/basse),
status(todo/bought), boughtAt, receiptAt, createdAt, updatedAt` (+ champs inconnus conservés).
**Facture :** `id, supplier(obligatoire), amount, photo(ticket), note, status(pending/paid),
paidAt, createdAt, updatedAt`.
**Documents :** GitHub v3 (produits+réglages) · Worker v4 (+`rev`, +`bills` ; `null`≠`[]`) ·
Sauvegarde v2 (+factures) · localStorage `purchase-gros-{list-v2, bills-v1, github-v1,
prefs-v1, dirty-v1, github-optout-v1, theme-v1}` · IndexedDB `purchase-gros-photos` · le jeton
et le drapeau d'installation restent locaux, jamais synchronisés.

---

## 6. Écrans & fonctionnalités

| Écran | Contenu |
|---|---|
| **Liste** `#/liste` | compteur + total estimé, recherche, onglets statut (À acheter/Achetés/Tous), puces catégorie, grille groupée dans la présentation choisie (Fiche/Mosaïque/Liste), cocher/modifier/supprimer/annuler, clic couleur/photo → zoom, clic corps → formulaire |
| **Factures** `#/factures` | recherche, onglets statut (Toutes/En attente/Payées), cartes avec photo du ticket, montant, bascule payée, modifier/supprimer ; note en mode GitHub (factures non synchronisées) |
| **Réglages** `#/reglages` | thème, présentation de la liste, onglets de partage GitHub ↔ lien privé, tester/enregistrer/synchroniser/déconnecter/importer depuis GitHub, export JSON/CSV, import fusion/remplacement, tout vider, installation PWA, vérification→installation, stockage, raccourcis |
| **Formulaire produit** | photo (JPEG ≤ 900 px), nom, catégorie (l'unité suit), couleur (texte + palette ~160 noms + roue HSL), fournisseur (autocomplétion), quantité (stepper), unité, prix, priorité, détails |
| **Raccourcis clavier** | `N` nouveau · `/` recherche · `S` sync · `1 2 3` vues · `Échap` fermer |

---

## 7. Réserve connues (constatées lors de l'analyse)

1. Le champ **ticket** produit existe (modèle/carte/aperçu) mais `product-form.js` n'affiche
   jamais ses champs de ticket — ce chemin est inerte ; on n'attache un ticket que sur les
   factures.
2. Le préférence de **tri** existe dans le modèle (`recent/name/price/qty/priority`) mais aucun
   contrôle visible ; seul le retour à `recent` existe, et le tri `priority` désactive le
   groupement par catégorie.
3. Les actions `share-list`, `clear-bought`, `install-update` sont câblées mais sans déclencheur
   DOM.
4. **Les factures ne synchronisent qu'via le lien privé Cloudflare** — GitHub reste limité aux
   produits (volontaire, affiché dans l'interface).
5. Le déploiement du Worker est **manuel par conception** : recoller le
   `share-list-worker.mjs` mis à jour dans le tableau de bord Cloudflare quand il change.
