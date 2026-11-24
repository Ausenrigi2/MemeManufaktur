#!/usr/bin/env bash
# Daily backup of the MemeManufaktur data volume (uploads, library.json, users.json).
# Docker Compose only: run this on the host, not inside the app container.
# Env: MEME_CONTAINER (default mememanufaktur), MEME_BACKUP_DIR, MEME_BACKUP_KEEP.
set -euo pipefail

CONTAINER="${MEME_CONTAINER:-mememanufaktur}"
BACKUP_DIR="${MEME_BACKUP_DIR:-/var/backups/mememanufaktur}"
KEEP="${MEME_BACKUP_KEEP:-7}"
ARCHIVE_NAME="mememanufaktur-$(date +%F).tgz"
ARCHIVE="$BACKUP_DIR/$ARCHIVE_NAME"

# Backups contain password hashes and private images: keep them owner-only.
umask 077
mkdir -p "$BACKUP_DIR"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "backup: container '$CONTAINER' not found (is the stack running?)" >&2
  exit 1
fi

# Tar runs in a throwaway container so the host needs no access to Docker's volume path.
docker run --rm --volumes-from "$CONTAINER" \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/$ARCHIVE_NAME" -C /app/data .

if [ ! -s "$ARCHIVE" ]; then
  echo "backup: archive is empty: $ARCHIVE" >&2
  exit 1
fi

# Keep only the newest $KEEP daily archives.
ls -1t "$BACKUP_DIR"/mememanufaktur-*.tgz | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup: $ARCHIVE"
