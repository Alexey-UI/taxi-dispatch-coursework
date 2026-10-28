#!/usr/bin/env sh
set -eu
umask 077
mkdir -p artifacts/backups
backup="artifacts/backups/taxi-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres pg_dump -U taxi -d taxi -Fc > "$backup"
test -s "$backup"
printf 'Backup saved: %s\n' "$backup"
