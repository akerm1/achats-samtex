<#
  Mise en service du lien privé — à lancer UNE fois depuis ce dossier :

      cd "C:\Users\aker\Desktop\purchase gros\worker"
      .\setup.ps1

  Le script fait tout, dans l'ordre :
    1. connexion à votre compte Cloudflare (une page s'ouvre, vous cliquez « Autoriser ») ;
    2. réutilisation ou création du namespace KV nommé LIST ;
    3. génération d'une clé secrète de 32 caractères (jamais écrite dans le dépôt) ;
    4. publication de cette clé comme secret LIST_KEY ;
    5. déploiement du Worker ;
    6. vérification que le lien répond vraiment ;
    7. affichage du lien privé, à coller dans l'application.

  Réexécutable sans danger : la clé est lue dans LIEN-PRIVE.txt si le fichier
  existe déjà, et le namespace KV existant est réutilisé. Ne supprimez pas ce
  fichier, sinon les liens déjà copiés sur vos autres appareils cessent de
  fonctionner.

  Prérequis : Node.js 18 ou plus.
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Version figée : c'est celle qui a été vérifiée, et la 4 exige Node 22.
$WRANGLER_VERSION = '3.114.17'
$WRANGLER = @('--yes', "wrangler@$WRANGLER_VERSION")
$CONFIG = 'wrangler.toml'
$SECRET_FILE = 'LIEN-PRIVE.txt'
$NAMESPACE_BINDING = 'LIST'
$NAMESPACE_TITLE = "liste-achats-$NAMESPACE_BINDING"
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
function Write-Utf8NoBom($path, $text) {
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $path), $text, (New-Object System.Text.UTF8Encoding($false)))
}
function Read-File($path) {
  [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $path))
}

<#
  Appel d'un programme externe (npx) en capturant sa sortie.

  Indispensable : npx écrit ses avertissements sur la sortie d'erreur
  (« ▲ [WARNING] … », « npm warn deprecated … »). Avec
  $ErrorActionPreference = 'Stop', PowerShell transforme ce simple avertissement
  en erreur bloquante et le script s'interrompt alors que tout allait bien.
  On neutralise donc la préférence autour de l'appel, et c'est le code de
  retour qui décide — pas la présence d'un avertissement.
#>
function Invoke-Native {
  param(
    [string]$Exe,
    [string[]]$CmdArgs,
    [string]$StdInText
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($PSBoundParameters.ContainsKey('StdInText')) {
      $brut = $StdInText | & $Exe @CmdArgs 2>&1 | Out-String
    } else {
      $brut = & $Exe @CmdArgs 2>&1 | Out-String
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }

  # Un avertissement sur stderr devient un enregistrement d'erreur que
  # PowerShell rend très bavardement (« npx.cmd : … », « At … char:17 »,
  # « CategoryInfo », « FullyQualifiedErrorId »). On retire ce habillage pour
  # ne garder que le texte, sinon la sortie est à la fois illisible et
  # impossible à analyser : le « [] » de « :String) [], RemoteException » passait
  # même pour un tableau JSON valide et vide.
  $gardees = @()
  foreach ($ligne in ($brut -split "`r?`n")) {
    if ($ligne -match '^\s*At\s+\S+:\d+\s+char:\d+') { continue }
    if ($ligne -match '^\s*\+\s') { continue }
    if ($ligne -match '^\s*CategoryInfo\s*:') { continue }
    if ($ligne -match '^\s*FullyQualifiedErrorId\s*:') { continue }
    $ligne = $ligne -replace '^[A-Za-z0-9_.-]+\.(cmd|exe|ps1)\s*:\s*', ''
    $gardees += $ligne
  }

  return [pscustomobject]@{ Output = ($gardees -join [Environment]::NewLine); ExitCode = $code }
}

# Retrouve l'identifiant d'un namespace KV dans la liste du compte.
#
# On lit cet identifiant UNIQUEMENT dans la sortie de « kv namespace list », et
# jamais dans celle de « kv namespace create » : cette dernière peut mentionner
# l'identifiant de compte, qui est lui aussi 32 caractères hexadécimaux. Le
# prendre au hasard revenait à écrire l'identifiant du compte dans
# wrangler.toml, et Cloudflare refusait alors le déploiement avec
# « KV namespace not found » (code 10041).
function Get-KvNamespaceId($title) {
  $listing = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('kv', 'namespace', 'list'))
  if ($listing.ExitCode -ne 0) { return '' }

  # Wrangler 3 répond du JSON : [ { "id": "…", "title": "…" } ].
  # La sortie est mêlée aux avertissements de npx (« ▲ [WARNING] … »), dont le
  # crochet opening ferait échouer l'analyse : on isole donc le premier crochet
  # qui donne un JSON valide.
  $texte = $listing.Output
  for ($p = 0; $p -lt $texte.Length; $p++) {
    if ($texte[$p] -ne '[') { continue }
    $fin = $texte.IndexOf(']', $p)
    if ($fin -lt 0) { break }
    $json = $null
    try {
      $json = $texte.Substring($p, $fin - $p + 1) | ConvertFrom-Json -ErrorAction Stop
    } catch {
      continue
    }
    foreach ($entry in @($json)) {
      if ($entry.title -eq $title -and $entry.id) { return $entry.id }
    }
  }

  # Repli pour un éventuel affichage tableau : l'identifiant peut se trouver
  # sur la ligne voisine de celle qui porte le titre.
  $lines = @($listing.Output -split "`r?`n")
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -notlike "*$title*") { continue }
    foreach ($j in @(($i), ($i - 1), ($i + 1))) {
      if ($j -lt 0 -or $j -ge $lines.Count) { continue }
      $found = [regex]::Match($lines[$j], '\b[0-9a-fA-F]{32}\b')
      if ($found.Success) { return $found.Value }
    }
  }
  return ''
}

Write-Host ''
Write-Host "Liste d'achats — mise en service du lien privé (wrangler $WRANGLER_VERSION)" -ForegroundColor Green
Write-Host 'Un lien privé remplace le jeton GitHub : ni jeton, ni expiration.'

# --- 1. Connexion ---------------------------------------------------------
Step 1 'Connexion à Cloudflare'
# « whoami » échoue si la session n'est pas valide : inutile dans ce cas
# d'ouvrir le navigateur, et le script reste donc rejouable sans clic.
$whoami = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('whoami'))
if ($whoami.ExitCode -eq 0) {
  Write-Host '    Session Cloudflare déjà valide, reconnexion inutile.' -ForegroundColor DarkGray
} else {
  Write-Host "Une page va s'ouvrir dans votre navigateur : cliquez « Autoriser »."
  $login = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('login'))
  if ($login.ExitCode -ne 0) {
    Write-Host $login.Output
    Stop_With 'Connexion Cloudflare refusée ou annulée.'
  }
}

# --- 2. Namespace KV ------------------------------------------------------
# Un namespace déjà créé lors d'une exécution interrompée doit être réutilisé,
# pas dupliqué.
Step 2 "Namespace KV « $NAMESPACE_TITLE »"
$namespaceId = Get-KvNamespaceId $NAMESPACE_TITLE
if ($namespaceId) {
  Write-Host "    Namespace déjà présent, réutilisé : $namespaceId" -ForegroundColor DarkGray
} else {
  Write-Host '    Création du namespace…' -ForegroundColor DarkGray
  $created = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('kv', 'namespace', 'create', $NAMESPACE_BINDING))
  if ($created.ExitCode -ne 0) {
    # Création refusée, souvent parce que le namespace existe déjà : on
    # relit la liste, qui fait foi.
    Write-Host $created.Output
  }
  $namespaceId = ''
  for ($essai = 1; $essai -le 5 -and -not $namespaceId; $essai++) {
    if ($essai -gt 1) { Start-Sleep -Seconds 5 }
    $namespaceId = Get-KvNamespaceId $NAMESPACE_TITLE
  }
  if (-not $namespaceId) {
    Stop_With "Namespace introuvable après création. Exécutez « npx wrangler kv namespace list » pour vérifier, puis relancez."
  }
  Write-Host "    Namespace créé : $namespaceId" -ForegroundColor DarkGray
}

$toml = (Read-File $CONFIG) -replace 'id\s*=\s*"[^"]*"', "id = `"$namespaceId`""
Write-Utf8NoBom $CONFIG $toml

# --- 3. Clé secrète -------------------------------------------------------
# Réutilisée si le lien existe déjà : relancer le script ne doit jamais
# casser les appareils déjà configurés.
if (Test-Path -LiteralPath $SECRET_FILE) {
  $key = (Read-File $SECRET_FILE).Trim().Split('/')[-1]
  Step 3 'Clé secrète reprise depuis LIEN-PRIVE.txt'
} else {
  $key = -join (1..32 | ForEach-Object { $ALPHABET[(Get-Random -Maximum $ALPHABET.Length)] })
  Step 3 'Nouvelle clé secrète générée (32 caractères)'
}
Write-Host '    (elle n''apparaît ni dans le dépôt Git ni dans ce journal)' -ForegroundColor DarkGray

# --- 4. Secret Cloudflare -------------------------------------------------
Step 4 'Enregistrement du secret LIST_KEY'
$secret = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('secret', 'put', 'LIST_KEY')) -StdInText $key
if ($secret.ExitCode -ne 0) {
  Write-Host $secret.Output
  Stop_With "Échec de l'enregistrement du secret (clé : $key)."
}

# --- 5. Déploiement -------------------------------------------------------
Step 5 'Déploiement du Worker'
$deploy = Invoke-Native -Exe 'npx' -CmdArgs ($WRANGLER + @('deploy'))
$workerUrl = ([regex]::Match($deploy.Output, 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev')).Value
if ($deploy.ExitCode -ne 0 -or -not $workerUrl) {
  Write-Host $deploy.Output
  if ($deploy.Output -match '10041') {
    Stop_With "Cloudflare refuse l'identifiant de namespace configuré. Relancez le script : il relira l'identifiant correct dans la liste du compte."
  }
  Stop_With 'Déploiement non confirmé : aucune adresse workers.dev dans la sortie.'
}

# --- 6. Vérification du lien ---------------------------------------------
$link = "$workerUrl/$key"
Step 6 'Vérification que le lien répond'
$answer = $null
try {
  $answer = Invoke-RestMethod -Uri $link -Method Get -TimeoutSec 30
} catch {
  Stop_With "Le lien ne répond pas encore : $($_.Exception.Message). Le Worker met parfois quelques secondes à s'activer — relancez le script dans une minute."
}
if ($null -eq $answer) {
  Stop_With 'Le lien a répondu vide : la liaison KV « LIST » est peut-être absente du Worker.'
}
Write-Host "    Réponse OK (révision $($answer.rev), liste vide : $($answer.empty))" -ForegroundColor DarkGray

Write-Utf8NoBom $SECRET_FILE $link

# --- 7. Résultat ----------------------------------------------------------
Write-Host ''
Write-Host 'TERMINE — le lien privé est prêt.' -ForegroundColor Green
Write-Host ''
Write-Host '  1. Sur le TÉLÉPHONE : Réglages → Partage entre appareils'
Write-Host '  2. Collez ce lien, « Tester la connexion », « Enregistrer »'
Write-Host '     (votre liste devient la liste partagée)'
Write-Host ''
Write-Host "     $link" -ForegroundColor Yellow
Write-Host ''
Write-Host '  4. Sur l''ORDINATEUR : même écran, même lien, « Enregistrer ».'
Write-Host ''
Write-Host '  N''utilisez pas « Importer depuis GitHub » sur le téléphone : cette'
Write-Host '  bouton remplacerait la liste partagée par l''ancienne version GitHub.'
Write-Host ''
Write-Host "  Lien également enregistré dans : $SECRET_FILE (ignoré par Git)." -ForegroundColor DarkGray
Write-Host '  Collez ce lien sur chaque appareil : c''est lui qui donne accès.' -ForegroundColor DarkGray
Write-Host ''
