<#
  Mise en service du lien privé — à lancer UNE fois depuis ce dossier :

      cd "C:\Users\aker\Desktop\purchase gros\worker"
      .\setup.ps1

  Le script fait tout, dans l'ordre :
    1. connexion à votre compte Cloudflare (une page s'ouvre, vous cliquez « Autoriser ») ;
    2. création du namespace KV nommé LIST ;
    3. génération d'une clé secrète de 32 caractères (jamais écrite dans le dépôt) ;
    4. publication de cette clé comme secret LIST_KEY ;
    5. déploiement du Worker ;
    6. vérification que le lien répond vraiment ;
    7. affichage du lien privé, à coller dans l'application.

  Réexécutable sans danger : la clé est lue dans LIEN-PRIVE.txt si le fichier
  existe déjà. Ne le supprimez pas, sinon les liens déjà copiés sur vos autres
  appareils cessent de fonctionner.

  Prérequis : Node.js 18 ou plus (vérifié : aucune installation supplémentaire).
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Wrangler 3 est volontairement figé : la version 4 exige Node 22.
$WRANGLER = @('--yes', 'wrangler@3')
$CONFIG = 'wrangler.toml'
$SECRET_FILE = 'LIEN-PRIVE.txt'
$ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'

function Step($number, $message) {
  Write-Host ''
  Write-Host "[$number] $message" -ForegroundColor Cyan
}
function Stop_With($message) {
  Write-Host ''
  Write-Host "ÉCHEC : $message" -ForegroundColor Red
  exit 1
}

# Sans BOM : PowerShell 5.1 en ajouterait un et le fichier deviendrait illisible.
function Write-Utf8NoBom($path, $text) {
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $path), $text, (New-Object System.Text.UTF8Encoding($false)))
}
function Read-File($path) {
  [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $path))
}

Write-Host ''
Write-Host 'Liste d''achats — mise en service du lien privé' -ForegroundColor Green
Write-Host 'Un lien privé remplace le jeton GitHub : ni jeton, ni expiration.'

# --- 1. Connexion ---------------------------------------------------------
Step 1 'Connexion à Cloudflare'
Write-Host 'Une page va s''ouvrir dans votre navigateur : cliquez « Autoriser ».'
& npx @WRANGLER login
if ($LASTEXITCODE -ne 0) { Stop_With 'Connexion Cloudflare refusée ou annulée.' }

# --- 2. Namespace KV ------------------------------------------------------
$namespaceId = ''
if (Test-Path -LiteralPath $CONFIG) {
  $namespaceId = ([regex]::Match((Read-File $CONFIG), 'id\s*=\s*"([0-9a-fA-F]{16,})"')).Groups[1].Value
}

if ($namespaceId -and $namespaceId -ne 'COLLE-LE-IDENTIFIANT-ICI') {
  Step 2 "Namespace KV déjà configuré ($namespaceId)"
} else {
  Step 2 'Création du namespace KV « LIST »'
  $out = (& npx @WRANGLER kv namespace create LIST 2>&1 | Out-String)
  $namespaceId = ([regex]::Match($out, 'id\s*=\s*"([0-9a-fA-F]{16,})"')).Groups[1].Value
  if (-not $namespaceId) { $namespaceId = ([regex]::Match($out, '\b[0-9a-fA-F]{32}\b')).Value }
  if (-not $namespaceId) {
    Write-Host $out
    Stop_With "Impossible de lire l'identifiant du namespace créé. Copiez le bloc [[kv_namespaces]] ci-dessus dans $CONFIG puis relancez."
  }

  $toml = (Read-File $CONFIG) -replace 'id\s*=\s*"[^"]*"', "id = `"$namespaceId`""
  Write-Utf8NoBom $CONFIG $toml
  Write-Host "    Namespace créé : $namespaceId" -ForegroundColor DarkGray
}

# --- 3. Clé secrète -------------------------------------------------------
# Réutilisée si le lien existe déjà : la faire tourner à nouveau ne doit
# jamais casser les appareils déjà configurés.
if (Test-Path -LiteralPath $SECRET_FILE) {
  $key = (Read-File $SECRET_FILE).Trim().Split('/')[-1]
  Step 3 'Clé secrète reprise depuis LIEN-PRIVE.txt'
} else {
  $key = -join (1..32 | ForEach-Object { $ALPHABET[(Get-Random -Maximum $ALPHABET.Length)] })
  Step 3 'Nouvelle clé secrète générée (32 caractères)'
}
Write-Host "    (elle n'apparaît ni dans le dépôt Git ni dans ce journal)" -ForegroundColor DarkGray

# --- 4. Secret Cloudflare -------------------------------------------------
Step 4 'Enregistrement du secret LIST_KEY'
$key | & npx @WRANGLER secret put LIST_KEY
if ($LASTEXITCODE -ne 0) { Stop_With "Échec de l'enregistrement du secret (clé : $key)." }

# --- 5. Déploiement -------------------------------------------------------
Step 5 'Déploiement du Worker'
$out = (& npx @WRANGLER deploy 2>&1 | Out-String)
$workerUrl = ([regex]::Match($out, 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev')).Value
if (-not $workerUrl) {
  Write-Host $out
  Stop_With 'Déploiement non confirmé : aucune adresse workers.dev dans la sortie.'
}

# --- 6. Vérification du lien ---------------------------------------------
$link = "$workerUrl/$key"
Step 6 'Vérification que le lien répond'
try {
  $answer = Invoke-RestMethod -Uri $link -Method Get -TimeoutSec 30
  if ($null -eq $answer) { Stop_With 'Le lien a répondu vide : la liaison KV « LIST » est peut-être absente.' }
  Write-Host "    Réponse OK (révision $($answer.rev), liste vide : $($answer.empty))" -ForegroundColor DarkGray
} catch {
  Stop_With "Le lien ne répond pas encore : $($_.Exception.Message). Le Worker met parfois quelques secondes à s'activer — relancez le script dans une minute."
}

Write-Utf8NoBom $SECRET_FILE $link

# --- 7. Résultat ----------------------------------------------------------
Write-Host ''
Write-Host 'TERMINE — le lien privé est prêt.' -ForegroundColor Green
Write-Host ''
Write-Host '  1. Ouvrez l''application : Réglages → Partage entre appareils'
Write-Host '  2. Onglet « Lien privé (sans jeton) »'
Write-Host '  3. Collez ce lien, puis « Tester la connexion » puis « Enregistrer » :'
Write-Host ''
Write-Host "     $link" -ForegroundColor Yellow
Write-Host ''
Write-Host '  4. Cliquez « Importer depuis GitHub » pour reprendre votre liste actuelle.'
Write-Host ''
Write-Host '  Collez ce lien sur CHAQUE appareil (téléphone, ordinateur) : c''est lui'
Write-Host '  qui donne accès, donc traitez-le comme un mot de passe.'
Write-Host ''
Write-Host "  Lien également enregistré dans : $SECRET_FILE" -ForegroundColor DarkGray
Write-Host '  Ne committez jamais ce fichier (il est ignoré par Git).' -ForegroundColor DarkGray
Write-Host ''
