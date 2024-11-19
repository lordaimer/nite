# Create the new data directory if it doesn't exist
$newDataDir = "src/data"
if (-not (Test-Path $newDataDir)) {
    New-Item -ItemType Directory -Path $newDataDir -Force
}

# Move files from src/services/data
$servicesDataFiles = @(
    "src/services/data/bugs.json",
    "src/services/data/subscriptions.json"
)

foreach ($file in $servicesDataFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "$newDataDir/" -Force
    }
}

# Move files from src/commands/data
$commandsDataFiles = @(
    "src/commands/data/bugs.json",
    "src/commands/data/memeSubreddits.json",
    "src/commands/data/memeVideoSubreddits.json",
    "src/commands/data/stopwords.json",
    "src/commands/data/timezones.json",
    "src/commands/data/botState.json"
)

foreach ($file in $commandsDataFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "$newDataDir/" -Force
    }
}

# Remove empty data directories
if ((Get-ChildItem "src/services/data" -Force | Measure-Object).Count -eq 0) {
    Remove-Item "src/services/data" -Force
}

if ((Get-ChildItem "src/commands/data" -Force | Measure-Object).Count -eq 0) {
    Remove-Item "src/commands/data" -Force
}

Write-Host "Data files have been moved to $newDataDir"
