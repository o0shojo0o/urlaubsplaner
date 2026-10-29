#!/bin/sh
set -eu

if [ "$(id -u)" = '0' ]; then
  mkdir -p /app/data
  # Include existing databases, SQLite sidecar files and backup directories.
  # Do not follow symlinks outside the mounted data directory.
  find /app/data -xdev \( ! -user node -o ! -group node \) -exec chown -h node:node {} +
  exec gosu node "$@"
fi

exec "$@"
