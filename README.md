# Mes achats — Sashes & Tissus

**La liste des produits à acheter en gros (ceintures, tissus, tulle, rubans…) avec photos,
couleurs (noms français + RGB) et prix, synchronisée automatiquement entre tous les appareils via GitHub.**

Une liste, un écran : on ajoute ses articles, on les coche à l'achat, on les supprime quand ils sont
livrés. C'est la même liste sur le téléphone et sur l'ordinateur — aucun réglage d'appareil à faire,
aucune donnée de démonstration. PWA gratuite et sans build, hébergeable sur **GitHub Pages**.

## Sommaire

1. [Démarrer](#démarrer)
2. [Nouveautés de la version 6](#nouveautés-de-la-version-6)
3. [Écrans & fonctionnalités](#écrans--fonctionnalités)
4. [Structure du projet](#structure-du-projet)
5. [Synchronisation : GitHub ou lien privé](#synchronisation--github-ou-lien-privé)
6. [Installer sur le téléphone](#installer-sur-le-téléphone)
7. [Données](#données)
8. [Raccourcis clavier](#raccourcis-clavier)

## Démarrer

### Avec Live Server (VS Code)

1. Installer l'extension **Live Server**
2. Ouvrir le dossier du projet dans VS Code
3. Clic droit sur `index.html` → **Open with Live Server**
4. Ouvrir <http://127.0.0.1:5501/>

### En double-cliquant

Tous les navigateurs récents acceptent les modules ES : un double-clic sur `index.html` suffit.
La liste démarre vide (aucune donnée de démonstration) : connectez GitHub ou ajoutez vos articles.

### Héberger sur GitHub Pages

1. Pousser le code sur GitHub
2. Settings → Pages → Source : **Deploy from a branch** → Branche : **main** → Racine : **/**
3. L'adresse obtenue ressemble à `https://votre-nom.github.io/nom-du-depot/`

> Les dépôts privés nécessitent GitHub Pro pour GitHub Pages ; en gratuit, le dépôt est
> public et le contenu de `products.json` (photos en base64) est donc accessible publiquement.

## Nouveautés de la version 6

| Avant | Maintenant |
|---|---|
| Rôle par appareil (Atelier / Acheteur) | **Rôle supprimé** — tous les appareils partagent la même liste |
| Envoi à l'acheteur (bouton « Envoyer », badge « Envoyé ») | **Envoi supprimé** — la synchronisation GitHub partage déjà tout, sans action manuelle |
| Tableau de bord + mode Marché + plusieurs sections | **Une seule liste simple** : ajouter, cocher, modifier, supprimer |
| Données de démonstration au premier lancement | **Aucune donnée de démonstration** — la liste partagée affiche la même chose partout |
| Édition de couleur par valeurs R/V/B, ~64 noms | **Boîte + grande aperçu + palette de ~160 couleurs à toucher**, identique sur téléphone et ordinateur |
| Thème clair par défaut, sombre optionnel | **Thème sombre moderne par défaut** (clair toujours disponible dans Réglages) |

### Version 6.2 — pensé pour le téléphone

- **Ajout central** : l'ajout se fait par le gros bouton **+ au centre de la barre du bas**
  (toujours sous le pouce) ; le bouton flottant est supprimé.
- **Liste en une colonne sur téléphone** : une carte = une ligne pleine largeur, les boutons
  (Acheté, Modifier, Supprimer) restent toujours visibles et tactiles.
- **Barre du haut allégée** : la pastille de synchronisation devient un point sur les petits écrans ;
  plus rien ne déborde ni ne disparaît.

### Version 6.3 — une liste, un écran

- **Accueil et Marché supprimés** : la page d'accueil est la liste des articles à acheter.
- **Deux vues seulement** : **Liste** (tout) et **Réglages**.
- **Palette de couleurs** : ~160 nuances françaises proposées sous le champ Couleur, à un toucher —
  le même sélecteur sur téléphone et sur ordinateur.
- **Même information partout** : plus de produits de démonstration ; la seule source de données
  est la liste partagée GitHub (ou la saisie locale).
- Carte simplifiée : **Acheté / Modifier / Supprimer** (la duplication a été retirée).

### Version 6.3.1 — couleur & synchronisation

- **Table de couleurs** : cliquer sur la boîte de couleur (ou l'aperçu) ouvre **la même fenêtre
  de recherche et de grille de teintes** sur le téléphone et sur l'ordinateur ; une couleur
  « personnalisée » reste possible via le sélecteur natif intégré.
- **Synchronisation automatique après installation** : dès que l'application est installée, elle
  se synchronise immédiatement avec GitHub.
- **Premier lancement guidé** : si aucune connexion GitHub n'est configurée, une carte explique
  comment partager la liste (bouton direct vers Réglages).
- **Configuration en un clic** : bouton « Configurer automatiquement » dans Réglages → GitHub —
  il pré-remplit propriétaire/dépôt/branche (depuis `sync-defaults.json`) ; il ne reste qu'à coller
  le jeton et Enregistrer.

### Version 6.3.3 — pas de perte de données

- **Les modifications locales non synchronisées ne sont plus perdues** : si l'envoi vers GitHub
  échoue (jeton refusé, hors ligne…), le marqueur est conservé d'un rafraîchissement à l'autre —
  l'application garde votre liste locale et réessaie de la publier, au lieu d'écraser la liste par
  ce que contient GitHub.
- **Erreur visible** : un message tel que « Jeton refusé par GitHub » ou « GitHub 404 » s'affiche
  dès qu'une synchronisation ne passe pas (voir 6.3.5 : GitHub répond 404 à un dépôt privé hors
  « Repository access », ce message est donc détecté séparément).

### Version 6.3.4 — mise à jour forcée

- Bascule du service worker pour forcer l'application installée à détecter la nouvelle version
  (bandeau vert « Recharger » en haut de l'écran).

### Version 6.3.5 — l'erreur GitHub est enfin visible

- **Plus de faux succès** : « Synchroniser » et « Enregistrer » n'affichent plus
  « Liste enregistrée localement » ou « Liste connectée à GitHub » quand le jeton est refusé —
  l'attente est réelle et le résultat affiché est le résultat obtenu.
- **Erreur visible partout, téléphone compris** : bandeau rouge « Synchronisation impossible »
  avec le message exact et un bouton « Corriger », pastille rouge, ligne d'état rouge dans
  Réglages (6.3.3 ne l'affichait qu'en gris, et seulement dans l'infobulle de la pastille —
  impossible à lire au doigt), plus une notification automatique par erreur, sans répéter à
  chaque scrutation de 6 secondes.
- **Dépôt invisible distingué du fichier absent** : un 404 est suivi d'une vérification du dépôt
  lui-même. « Fichier pas encore créé » n'est plus confondu avec « dépôt introuvable ou
  inaccessible pour ce jeton ».
- **Limite de requêtes distincte** : un 403 « quota » n'est plus rapporté comme un jeton refusé.
- **Liste vide** : si la connexion échoue, la carte renvoie vers les réglages au lieu d'annoncer
  une liste « partagée via GitHub ».

### Version 6.3.6 — mise à jour depuis les réglages

- **Bouton de mise à jour dans Réglages → Application**, juste sous « Installer sur le téléphone »
  (les deux actions de vie de la PWA) : « Rechercher une mise à jour » interroge GitHub, installe
  la version publiée et recharge l'application ; le libellé devient « Installer la mise à jour »
  dès qu'une version est déjà téléchargée, et la ligne d'état l'annonce à ce moment-là.
- **Fin du mélange de versions** (correctif de « n'exporte pas `dismissSyncError` ») : le service
  worker servait le `main.js` nouveau avec le `shell.js` ancien, ce qui cassait le chargement des
  modules. Le code passe maintenant **réseau d'abord** (un seul jeu de fichiers, toujours cohérent),
  le cache ne servant qu'en cas de coupure ; icônes et polices restent en cache d'abord.
- Une version déjà téléchargée au démarrage est signalée sans attendre un nouveau téléchargement.

### Version 6.3.7 — l'application se répare seule

- **Prise de possession immédiate** : la nouvelle version du service worker s'active dès son
  installation au lieu d'attendre la fermeture de tous les onglets. Avant, l'ancienne version
  gardait le contrôle et continuait de servir ses fichiers périmés.
- **Démarrage surveillé** (`index.html`, hors module) : si l'application ne démarre pas — modules
  périmés, cache incohérent, déploiement interrompu — elle force la mise à jour du service worker
  puis se recharge seule (deux tentatives maximum par session, garde-fou anti-boucle). C'est ce qui
  rendait l'écran bloqué sur « Chargement de la liste… » impossible à résoudre depuis l'interface.

### Version 7.0 — tout le mécanisme refait

La version 6 empilait des pièces : scrutation toutes les 6 secondes, cache du code,
comparaison de fichiers pour détecter une mise à jour, bouton visible seulement
parfois. La 7.0 remplace le tout par une règle unique.

**1. Plus de « mode en direct ».** La scrutation automatique et l'actualisation au
retour sur l'application ont disparu. La pastille affiche un état simple et exact :

| État | Signification |
|---|---|
| `Local seul` | aucun compte GitHub connecté |
| `Connexion…` | lecture de GitHub en cours |
| `À jour` | la liste affichée vient de GitHub |
| `Envoi…` | modifications en cours d'envoi |
| `Hors ligne` | réseau coupé, la liste locale est affichée |
| `Erreur` | jeton refusé, dépôt inaccessible… (le motif est affiché) |

**2. Un rafraîchissement = une lecture de GitHub.** Recharger la page (F5, ou l'icône
de l'application) relit la liste depuis GitHub. Un clic sur la pastille ou sur
« Synchroniser » fait la même chose. Les modifications locales non poussées sont
poussées en priorité, et le drapeau « non poussé » est conservé d'un lancement à
l'autre : une coupure réseau ne peut plus faire perdre une modification.

**3. Aucun fichier périmé servi.** Le service worker ne met plus le code en cache.
Il ne sert qu'au repli hors-ligne (et pour l'écran d'attente). Conséquence directe :
plus aucun mélange de versions — le blocage « n'exporte pas `dismissSyncError` »
ne peut plus se produire.

**4. Bouton de mise à jour toujours présent.** *Réglages → Mise à jour de
l'application* affiche en permanence un bouton :

1. **Rechercher une mise à jour** interroge `version.json` (le seul repère de
   version, publié à la racine du dépôt) sans passer par un cache.
2. Si une version plus récente existe, le bouton devient **Installer la mise à
   jour 7.0.1** et attend le clic : rien ne s'installe tout seul.
3. L'installation vide le cache, revalide la coquille hors-ligne et recharge la
   page avec une empreinte dans l'URL.

Pour publier une version : modifier `version.json` **et** `APP_VERSION` dans
`js/core/app.js` (le test de fumée vérifie que les deux concordent).

### Version 7.1 — le jeton devient facultatif

Le message « Jeton refusé par GitHub » bloquait une application qui n'en avait pas besoin :
un dépôt **public** se lit très bien **sans jeton**. Le problème n'était pas le jeton, c'était
l'application qui l'envoyait systématiquement — et GitHub répond `401 Bad credentials` dès
qu'un jeton expiré accompagne la requête.

Désormais :

- **Lire ne demande aucun jeton.** Seul le propriétaire et le nom du dépôt sont requis dans
  les Réglages. La pastille affiche « À jour » et la liste se recharge normalement.
- **Un jeton expiré n'arrête plus rien.** Au premier `401`, l'application réessaie une fois en
  anonyme ; si le dépôt est public, la lecture réussit et le jeton est mis de côté
  définitivement (plus de boucle de `401`). Message affiché, non bloquant :
  « Jeton refusé par GitHub — la liste est relue en anonyme ».
- **Publier reste protégé.** Sans jeton valide, aucune requête d'écriture n'est envoyée : la
  liste locale est conservée et l'erreur explique pourquoi (« Lecture seule : un jeton
  GitHub valide est nécessaire pour publier vos modifications »). Les Réglages affichent un
  badge « Lecture seule » et le champ du jeton reste libre pour le coller.
- Les autres erreurs restent distinguées : quota de requêtes, réseau coupé, dépôt privé
  inaccessible — aucun n'est traité comme un jeton refusé.

> Le jeton ne quitte jamais l'appareil : il est stocké dans le `localStorage` et envoyé
> uniquement aux appels de l'API GitHub vers votre dépôt.

### Version 7.2 — ouvrir le lien GitHub montre enfin la bonne liste

**Constat.** Ouvrir `https://akerm1.github.io/achats-samtex/` dans un navigateur
n'affichait pas les mêmes produits que l'application du téléphone. Deux raisons,
toutes deux comprises dans cette version :

1. **Aucun navigateur neuf ne se connectait.** La configuration GitHub vit dans le
   `localStorage`, donc par navigateur et par profil. Sur un poste neuf, aucune
   configuration n'existait et l'application **ne tentait même pas** de lire GitHub :
   elle affichait une liste locale vide, marquée « Local seul ».
2. **Des modifications non publiées passaient inaperçues.** En lecture seule, l'ajout
   d'un produit reste sur l'appareil. Sans avertissement, l'application installée et
   le sitemontraient deux listes différentes, sans explication.

**Ce qui change**

- **Connexion automatique en lecture seule.** Au premier lancement, l'application lit
  `sync-defaults.json` (le dépôt public annoncé par l'application) et affiche
  directement la liste publiée — sans jeton, sans configuration, sans clic. Un simple
  rafraîchissement la relit. Le réglage partagé (thème, tri, filtres) est appliqué
  lui aussi.
- **Aucun message d'erreur sur un appareil neuf** : si le dépôt est inaccessible,
  l'application reste en mode local, silencieuse, au lieu d'afficher une panne.
- **« Modifications non publiées »** : un bandeau orange apparaît dès qu'une
  modification existe sur l'appareil alors que GitHub ne peut pas la recevoir
  (« Lecture seule : un jeton GitHub valide est nécessaire pour publier »). Les
  Réglages affichent un badge « Lecture seule » et le champ du jeton reste libre.
- **Déconnexion respectée** : le bouton « Déconnecter » inscrit un refus durable,
  l'application ne se reconnecte plus toute seule. Une configuration saisie à la main
  annule ce refus.
- Deux requêtes suffisent au premier lancement (défauts + lecture), sans jeton.

### Version 7.3 — le « lien privé » :fini les jetons GitHub

**Pourquoi.** Un jeton GitHub, ça expire, ça se révoque, et il faut cocher
« Contents : Read and write » sur le bon dépôt : quand l'écriture est refusée, on ne
savait pas dire *pourquoi*. Cette version propose une autre méthode, sans jeton.

**Ce que c'est.** Un petit **Cloudflare Worker** (gratuit) qui garde la liste dans
son stockage KV. On n'accède à la liste que par une adresse secrète :

```
https://liste-achats.mon-sous-domaine.workers.dev/<clé de 32 caractères>
```

Pas de jeton, pas d'expiration, pas de permission à cocher, pas de quota GitHub.
Une seule chose à coller, une fois par appareil, et ensuite : lecture **et**
écriture partout, téléphone compris.

**Ce qui change**

- **Deux emplacements au choix** dans Réglages → Partage entre appareils, par onglets :
  *GitHub* (lecture seule, dépôt public) ou *Lien privé* (lecture et écriture, sans jeton).
  Rien n'est cassé, on peut revenir en arrière à tout moment.
- **Plus de « Lecture seule »** avec un lien privé : le badge affiche
  *Lecture + écriture*, et le bandeau « Modifications non publiées » disparaît.
- **Migration en un clic** : « Importer depuis GitHub » recopie la liste déjà
  publiée vers le lien privé. Le dépôt étant public, cette lecture se fait **sans
  jeton** — vous ne perdez rien en changeant de méthode.
- **L'application reste lisible sans configuration** : un appareil neuf continue de
  se connecter au dépôt public par défaut, en lecture seule, exactement comme en 7.2.
- Les deux méthodes partagent le même format de document, la même fusion en cas de
  conflit et la même protection contre les écritures concurrentes.

**À savoir avant de choisir cette méthode**

- Le lien **est** le mot de passe : qui le possède peut modifier la liste. Ne le
  publiez pas (ni dans un chat, ni dans une capture d'écran).
- Changer la clé `LIST_KEY` invalide les liens déjà copiés sur vos autres appareils.
- Le KV de Cloudflare est *cohérent à terme* : une lecture peut rendre une version
  légèrement ancienne. L'application gère ce cas (révisionSuivie) et ne réécrit
  jamais votre liste locale avec une version plus vieille que ce qu'elle a publié.
- Offre gratuite : largement suffisant pour une liste, avec des limites de débit.

### Mise en service du lien privé (5 minutes, une fois)

**Méthode rapide — un seul script** (Node.js 18 ou plus requis ; c'est tout).

```powershell
cd "C:\chemin\vers\le\dossier\worker"
.\setup.ps1
```

Le script enchaîne : connexion Cloudflare (une page s'ouvre, cliquez **Autoriser**),
création du namespace KV `LIST`, génération d'une clé secrète de 32 caractères,
envoi de la clé comme secret, déploiement du Worker, **vérification que le lien
répond**, puis affichage du lien privé à coller dans l'application. Il est
réexécutable sans danger : la clé est relue dans `worker/LIEN-PRIVE.txt`, donc
relancer le script ne casse jamais un appareil déjà configuré. Ce fichier est
ignoré par Git — le lien est un secret, il ne doit jamais être versionné.

Si vous préférez la console Cloudflare, ou si PowerShell refuse d'exécuter le
script (`UnauthorizedAccessException`), les étapes manuelles sont :

1. Créez un compte gratuit sur **dashboard.cloudflare.com**.
2. **Workers & Pages → Create → Worker**, nommez-le (ex. `liste-achats`) puis *Deploy*.
3. *Edit code* → collez le contenu de **`worker/share-list-worker.mjs`** → *Deploy*.
4. **Storage & Databases → KV → Create a namespace**, nommez-le `LIST`.
5. Dans le Worker : **Settings → Bindings → Add** → variable `LIST`, type *KV Namespace*,
   sélectionnez celui-ci.
6. **Settings → Variables and Secrets → Add** → nom `LIST_KEY`, type **Secret**.
   Générez une clé aléatoire de 32 caractères, par exemple dans PowerShell :

   ```powershell
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```

   puis *Deploy*.
7. Votre lien privé = `https://liste-achats.<votre-sous-domaine>.workers.dev/<la clé>`.
8. Dans l'application : **Réglages → Lien privé**, collez le lien →
   **Tester la connexion** → **Enregistrer**. Puis **Importer depuis GitHub** pour
   récupérer la liste existante.

### Version 7.6 — la couleur prend toute la place dans la carte

- **La pastille de couleur n'est plus une petite puce** au milieu des métadonnées :
  elle occupe **toute la largeur de la carte**, juste sous le nom du produit,
  avec le nom de la couleur posé par-dessus la teinte (sur une pastille
  translucide, donc lisible sur n'importe quel fond).
- **La couleur est un critère de tri à l'achat** : la voir d'un coup d'œil, depuis
  le téléphone, sans cliquer la fiche, est tout l'intérêt du changement.
- Hauteur généreuse (84 px, 96 px sur téléphone) pour que la teinte se compare vraiment,
  y compris les teintes très claires (ivoire, écru) qui se noyaient dans une petite pastille.
- La couleur nommée sans valeur RGB reconnue retombe sur le damier « aucune teinte » :
  on voit qu'il faut préciser la couleur, sans que la ligne paraisse cassée.
- Les produits **sans couleur** ne réserve aucune place : rien ne change pour eux.

## Écrans & fonctionnalités

| Vue | Ce qu'elle contient |
|---|---|
| **Liste** | Les articles à acheter, groupés par catégorie avec sous-totaux : rechercher, filtrer (à acheter / achetés / tous, catégories), ajouter (bouton + en bas), cocher, modifier, supprimer |
| **Réglages** | Thème (sombre/clair/système), configuration GitHub, export/import, vidage complet, installation PWA, informations et raccourcis |

Formulaire produit (ajout **et** modification) : photo (caméra ou galerie, compressée en
JPEG ≤ 900 px), **nom facultatif**, catégorie (l'unité suit la catégorie), **couleur avec
boîte de couleur à côté du nom, grande boîte d'aperçu et palette de ~160 suggestions**,
fournisseur (autocomplétion), quantité avec curseur, unité, prix unitaire, priorité, détails.

La saisie du libellé de couleur est assistée : tapez « rose bébé », « bleu roi », « ivoire »… et
la boîte de couleur et l'aperçu se remplissent automatiquement. Un toucher sur une tuile de la
palette remplit le libellé et la couleur d'un coup. Un nom reconnu affiche aussi une pastille dans
les cartes, même sans valeur RGB enregistrée (voir `js/data/colors.js`).

## Structure du projet

```
index.html                  coquille de l'application (barre, navigation, conteneurs)
manifest.webmanifest        manifeste PWA (Ajouter, Liste)
version.json                version publiée de l'application (repère des mises à jour)
sync-defaults.json          valeurs par défaut pour le bouton « Configurer automatiquement »
sw.js                       service worker : repli hors-ligne uniquement (aucun cache de code)
worker/
  share-list-worker.mjs     code du Cloudflare Worker du lien privé (à coller dans le dashboard)
  wrangler.toml             configuration de déploiement (namespace KV, Workers.dev)
  setup.ps1                 mise en service en un seul lancement (connexion, KV, secret, déploiement)
css/
  tokens.css                variables de design (palette sombre moderne, thème clair optionnel)
  base.css                  réinitialisation, typographie, utilitaires
  layout.css                barre du haut, navigation, toasts, responsive
  components.css            boutons, champs, cartes, pastilles de couleur, dialogues
  views.css                 styles des vues (liste, réglages, formulaire)
js/
  main.js                   démarrage, routeur, actions globales, raccourcis, PWA
  core/
    utils.js                DOM, formatage (€, dates, quantités), échappement, presse-papiers
    storage.js              localStorage sûr (navigation privée, quota)
    router.js               routeur par hash (#/liste, #/reglages…)
    theme.js                thème clair/sombre/système
    feedback.js             toasts et dialogues de confirmation
    photo.js                compression des photos côté navigateur
    app.js                  version installée de l'application
    update.js               lecture de version.json, recherche et installation des mises à jour
  data/
    model.js                catégories, unités, priorités, couleurs RGB, normalisation, statistiques
    colors.js               ~160 noms de couleurs français (+ palette et détection automatique)
    github.js               client API GitHub (lecture, écriture, test, conflits)
    worker.js               client du lien privé Cloudflare (lecture, écriture, fusion)
    sync.js                 aiguillage GitHub / lien privé pour le store
    store.js                état global, rafraîchissement, actions métier, préférences
    backup.js               export/import JSON et CSV, fusion
  ui/
    icons.js                icônes SVG inline
    shell.js                barre du haut, navigations, bandeaux, pastille de sync
    view.js                 helpers de vue (ne pas casser une saisie en cours)
    product-card.js         carte produit
    product-form.js         formulaire produit (ajout / modification)
    views/
      list.js  settings.js
icons/                      icônes de l'application (PWA)
```

## Synchronisation : GitHub ou lien privé

La liste **et les réglages partagés** (thème, tri, filtres) sont stockés dans `products.json`
à la racine d'un dépôt GitHub. Les appareils qui ouvrent la même page relisent ce fichier
**à chaque rafraîchissement de la page** (ou d'un clic sur la pastille) — il n'y a plus de
synchronisation automatique en arrière-plan. Le réglage le plus récent gagne côté préférences.

> Restent **locaux** (jamais envoyés sur GitHub) : le jeton d'accès et le drapeau d'installation PWA.

### Configuration (une fois par appareil)

1. Créer un dépôt GitHub (ou réutiliser celui qui héberge l'application)
2. Créer un **Personal Access Token fine-grained** :
   GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   · Repository access : votre dépôt · Permissions → Contents → **Read and write**
3. Dans l'application : **Réglages → Partage entre appareils**
4. Renseigner le jeton, le propriétaire, le dépôt, la branche (`main`)
5. **Tester la connexion** puis **Enregistrer**

La configuration reste dans le navigateur (localStorage) : elle n'est envoyée qu'à GitHub.
La **pastille** de la barre du haut indique l'état (À jour / Local seul / Hors ligne / Erreur) et
la dernière synchronisation ; un clic déclenche une synchronisation manuelle.

Règle de résolution de conflit : **les modifications locales non encore envoyées gagnent**,
sinon la version distante remplace la liste locale.

### Ou le lien privé (sans jeton) — recommandé

Si les jetons GitHub vous fatiguent (expiration, permissions, « jeton refusé »), l'onglet
**Lien privé (sans jeton)** de la même section **Réglages → Partage entre appareils** utilise
un Cloudflare Worker à la place de GitHub.

- Mise en service détaillée : section [Version 7.3](#version-73--le--lien-privé--fini-les-jetons-github).
- Dans l'application : onglet **Lien privé (sans jeton)** → coller le lien → **Tester la
  connexion** → **Enregistrer** → **Importer depuis GitHub** pour reprendre la liste existante.
- Lecture **et** écriture, sans jeton ni expiration. Le lien lui-même est le secret.

Les deux méthodes restent disponibles : basculer d'un onglet à l'autre ne perd rien, et le
passage de l'une à l'autre se fait en un clic grâce à l'import.

## Installer sur le téléphone

**Le plus simple : le bouton de téléchargement intégré.** Une icône de téléchargement apparaît
dans la barre du haut (et un bouton « Installer l'application » dans **Réglages → Installer sur
le téléphone**). Sur Android et Chrome, un bouton « Installer » permet l'installation immédiate ;
sur iPhone/iPad, il ouvre la marche à suivre Safari.

| Système | Comment faire |
|---|---|
| **Android** (Chrome) | Bouton ⬇ dans la barre → **Installer maintenant**, ou menu ⋮ → **Installer l'application** |
| **iPhone** (Safari) | Bouton ⬇ → marcher « Partager → Sur l'écran d'accueil », ou **Partager** → **Sur l'écran d'accueil** |
| **Ordinateur** (Chrome) | Icône ⬇ dans la barre → **Installer** (l'app s'ouvre depuis le bureau) |

L'application fonctionne hors-ligne (service worker) et propose des raccourcis d'app :
ajouter un produit, ouvrir la liste. Après installation, les mises à jour se téléchargent
en arrière-plan (bandeau « Recharger »).

## Données

`products.json` (format v3 ; les fichiers v1 et v2 restent lisibles) :

```json
{
  "version": 3,
  "updatedAt": "2026-09-23T08:00:00.000Z",
  "settings": {
    "theme": "system",
    "filter": "todo",
    "category": "all",
    "sort": "recent"
  },
  "products": [
    {
      "id": "local-ab12cd",
      "name": "Ceinture satin ivoire",
      "photo": "data:image/jpeg;base64,…",
      "note": "mariage, finition brillant",
      "type": "ceinture",
      "color": "ivoire",
      "colorRgb": { "r": 239, "g": 227, "b": 211 },
      "supplier": "Marché Saint-Pierre",
      "qty": 25,
      "unit": "piece",
      "price": 1.5,
      "priority": "haute",
      "status": "todo",
      "boughtAt": null,
      "createdAt": "2026-09-12T09:10:00.000Z",
      "updatedAt": "2026-09-12T09:10:00.000Z"
    }
  ]
}
```

Catégories : `ceinture`, `tissu`, `tulle`, `ruban`, `fil`, `dentelle`, `accessoire`, `autre`.
Unités : `piece`, `metre`, `rouleau`. Priorités : `haute`, `normale`, `basse`.
`colorRgb` est une table 0-255.
`settings` contient les réglages partagés entre appareils (thème, tri, filtres) ; le jeton de
connexion n'y figure jamais.
Tout champ inconnu d'un ancien fichier (ex. `sent`/`sentAt`, produits en v5) est conservé tel quel.

Réglages mémorisés par appareil (dans `mes-achats-prefs` et la clé de thème) : tri/filtres et
thème servent de point de départ, puis sont remplacés par la version partagée dès la première
synchronisation.

## Raccourcis clavier

| Touche | Action |
|---|---|
| `N` | Nouveau produit |
| `/` | Rechercher dans la liste |
| `S` | Synchroniser maintenant |
| `1` `2` | Liste · Réglages |
| `Échap` | Fermer la fenêtre active |