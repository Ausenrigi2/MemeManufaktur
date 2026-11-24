#!/bin/sh
set -e

# Bind-Mounts werden von Docker oft root-owned angelegt. Der Container startet
# kurz als root, repariert nur die Datenrechte und gibt dann an node ab.
mkdir -p /app/data/uploads
chown node:node /app/data /app/data/uploads
for f in /app/data/library.json /app/data/users.json; do
  [ -e "$f" ] && chown node:node "$f"
done

exec su-exec node "$@"
