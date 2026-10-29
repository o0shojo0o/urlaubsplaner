#!/bin/sh
set -eu

if [ "$(id -u)" = '0' ]; then
  mkdir -p /app/data
  # Include existing databases, SQLite sidecar files and backup directories.
  # Do not follow symlinks outside the mounted data directory.
  find /app/data -xdev \( ! -user node -o ! -group node \) -exec chown -h node:node {} +
  exec gosu node sh "$0" "$@"
fi

# Repair owner access after dropping privileges; no extra chmod capability is needed.
find /app/data -xdev -type d ! -perm -0700 -exec chmod u+rwx {} \;
find /app/data -xdev -type f ! -perm -0600 -exec chmod u+rw {} +
exec "$@"
