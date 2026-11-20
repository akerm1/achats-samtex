# Relevés de recettes — données de contrôle

`recettes-2025-04_2026-10.tsv` est le relevé de recettes collé depuis le
classeur (colonnes : `Date`, `Mois`, `Jour`, `Recette (DA)`, `Statut / Note`,
`Onglet Source`).

Il n'est plus importé dans l'application : l'écran Analyse a été retiré en
10.3.0. Le fichier sert de jeu de données réel au contrôle
`node tools/compare-check.mjs`, qui vérifie la comparaison de recettes
(avril 2025 = 704 000 DA, avril 2026 = 720 000 DA, novembre 2025 = 383 000 DA).
