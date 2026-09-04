#!/bin/zsh
# Nightly logical backup of the ilmsoft production database (Supabase free tier has no backups).
# Installed as a launchd user agent: ~/Library/LaunchAgents/com.ilmsoft.dbdump.plist (runs 03:00 daily,
# and on next wake if the Mac was asleep). Keeps the newest 14 backups.
set -euo pipefail
REPO="/Users/abdurrehman/Desktop/Build/ilmsoftmulti/ilmsoft"
NODE="/Users/abdurrehman/.local/bin/node"
cd "$REPO"
"$NODE" scripts/db_dump.mjs
# prune: keep the 14 newest backup folders
ls -1dt backups/*/ | tail -n +15 | xargs -I{} rm -rf "{}"
echo "$(date '+%F %T') backup ok; kept $(ls -1d backups/*/ | wc -l | tr -d ' ') folders"
