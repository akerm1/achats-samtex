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
5. [Synchronisation via GitHub](#synchronisation-via-github)
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
sync-defaults.json          valeurs par défaut pour le bouton « Configurer automatiquement »
sw.js                       service worker : hors-ligne + cache des polices
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
  data/
    model.js                catégories, unités, priorités, couleurs RGB, normalisation, statistiques
    colors.js               ~160 noms de couleurs français (+ palette et détection automatique)
    github.js               client API GitHub (lecture, écriture, test, conflits)
    store.js                état global, synchronisation, actions métier, préférences
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

## Synchronisation via GitHub

La liste **et les réglages partagés** (thème, tri, filtres) sont stockés dans `products.json`
à la racine d'un dépôt GitHub ; les appareils qui ouvrent la même page se synchronisent toutes
les 6 secondes (et au retour sur l'onglet). Le réglage le plus récent gagne côté préférences.

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
La **pastille** de la barre du haut indique l'état (En direct / Local seul / Hors ligne) et
la dernière synchronisation ; un clic déclenche une synchronisation manuelle.

Règle de résolution de conflit : **les modifications locales non encore envoyées gagnent**,
sinon la version distante remplace la liste locale.

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