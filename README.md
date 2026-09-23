# Mes achats — Sashes & Tissus

**La liste des produits à acheter en gros (ceintures, tissus, tulle, rubans…) avec photos,
couleurs (noms français + RGB), mode marché et synchronisation automatique entre appareils via GitHub.**

L'atelier prépare la liste (photo, couleur, quantité, prix) ; le mode marché permet de cocher
ce qu'on prend pendant les achats, sur n'importe quel appareil. Aucune dépendance, aucun build :
des fichiers statiques HTML/CSS/JS, une PWA installable, hébergeable gratuitement sur **GitHub Pages**.

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
La liste démarre avec des produits de démonstration pour découvrir l'application.

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
| Édition de couleur par valeurs R/V/B | **Boîte de couleur à côté du nom + grande boîte d'aperçu en dessous** (sélecteur natif) |
| Thème clair par défaut, sombre optionnel | **Thème sombre moderne par défaut** (clair toujours disponible dans Réglages) |

Raison du changement : comme la liste est partagée et synchronisée automatiquement toutes les
6 secondes entre tous les appareils, l'option « envoyer à l'acheteur » n'apportait plus rien :
tout le monde voit la même liste, prête à être cochée.

### Version 6.2 — pensé pour le téléphone

- **Ajout central** : l'ajout se fait par le gros bouton **+ au centre de la barre du bas**
  (toujours sous le pouce) ; le bouton flottant est supprimé.
- **Liste en une colonne sur téléphone** : une carte = une ligne pleine largeur, les boutons
  (Acheté, Modifier, Dupliquer, Supprimer) restent toujours visibles et tactiles.
- **Marché modifiable** : chaque ligne a un crayon ✎ pour modifier le produit sans quitter le marché.
- **Barre du haut allégée** : la pastille de synchronisation devient un point sur les petits écrans ;
  plus rien ne déborde ni ne disparaît. Statistiques de l'accueil en grille 2×2, thème et priorité
  en pleine largeur, dialogue du formulaire en plein écran.

## Écrans & fonctionnalités

| Vue | Ce qu'elle contient |
|---|---|
| **Accueil** | Anneau de progression, 4 indicateurs (à acheter, cochés, dépensé, sans prix), répartition par catégorie, derniers ajouts |
| **Liste** | Barre d'outils (recherche, tri, statut, catégories), produits groupés par catégorie avec sous-totaux, pastille de couleur, partage texte, vidage des achetés |
| **Marché** | Grandes lignes tactiles à cocher, priorités en tête, panier en direct (nombre + montant), bilan « Terminer » |
| **Réglages** | Thème (sombre/clair/système), configuration GitHub, export/import, vidage complet, informations et raccourcis |

Formulaire produit (ajout **et** modification) : photo (caméra ou galerie, compressée en
JPEG ≤ 900 px), **nom facultatif**, catégorie (l'unité suit la catégorie), **couleur avec
boîte de couleur à côté du nom + grande boîte d'aperçu en dessous**, fournisseur
(autocomplétion), quantité avec curseur, unité, prix unitaire, priorité, détails.

La saisie du libellé de couleur est assistée : tapez « rose bébé », « bleu roi »,
« ivoire »… et la boîte de couleur et l'aperçu se remplissent automatiquement
grâce à une table intégrée de ~64 noms de couleurs français (voir `js/data/colors.js`).
Un nom reconnu affiche aussi une pastille dans les cartes, même sans valeur RGB enregistrée.

## Structure du projet

```
index.html                  coquille de l'application (barre, navigation, conteneurs)
manifest.webmanifest        manifeste PWA (Ajouter, Liste, Marché)
sw.js                       service worker : hors-ligne + cache des polices
css/
  tokens.css                variables de design (palette sombre moderne, thème clair optionnel)
  base.css                  réinitialisation, typographie, utilitaires
  layout.css                barre du haut, navigations, toasts, responsive
  components.css            boutons, champs, cartes, pastilles de couleur, dialogues, toasts
  views.css                 styles propres aux 4 vues
js/
  main.js                   démarrage, routeur, actions globales, raccourcis, PWA
  core/
    utils.js                DOM, formatage (€, dates, quantités), échappement, presse-papiers
    storage.js              localStorage sûr (navigation privée, quota)
    router.js               routeur par hash (#/accueil, #/liste, #/marche…)
    theme.js                thème clair/sombre/système
    feedback.js             toasts et dialogues de confirmation
    photo.js                compression des photos côté navigateur
  data/
    model.js                catégories, unités, priorités, couleurs RGB, normalisation, statistiques
    colors.js               table des noms de couleurs français (+ détection automatique)
    github.js               client API GitHub (lecture, écriture, test, conflits)
    store.js                état global, synchronisation, actions métier, préférences
    backup.js               export/import JSON et CSV, fusion
    seed.js                 données de démonstration
  ui/
    icons.js                icônes SVG inline
    shell.js                barre du haut, navigations, bandeaux, pastille de sync
    view.js                 helpers de vue (ne pas casser une saisie en cours)
    product-card.js         carte produit, ligne marché, lignes de répartition
    product-form.js         formulaire produit (ajout / modification)
    views/
      home.js  list.js  market.js  settings.js
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
ajouter un produit, ouvrir la liste, passer en mode marché. Après installation, les mises à
jour se téléchargent en arrière-plan (bandeau « Recharger »).

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
| `1` … `4` | Accueil · Liste · Marché · Réglages |
| `Échap` | Fermer la fenêtre active |