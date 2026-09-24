#!/usr/bin/env bash
# bootstrap.sh — provisions ce que la plateforme ne provisionne pas pour team09 :
# sa base Postgres + l'extension pgvector.
#
# Dérivé de app-builder-guidances/templates/bootstrap.sh. On n'a repris QUE la
# partie Postgres : ni S3 (le bucket, les clés scopées) ni Temporal ne sont
# utilisés par US-01/US-02 — à réactiver depuis le template le jour où l'app en
# a réellement besoin (le LLM vkey, lui, est déjà géré côté plateforme par
# `core-platform/onboard-app.sh team09`, pas par ce script).
#
# La ligne CREATE EXTENSION vector n'existe PAS dans le template générique —
# elle est ajoutée ici volontairement, en root Postgres, jamais dans une
# migration applicative (CCOE-RULES.md §12, règle R-12-15 : pgvector n'est pas
# une extension "trusted" sous Postgres 17 vanilla, ça plante le boot de l'API
# si on essaie de la créer avec le rôle applicatif restreint).
#
# Usage : ./bootstrap.sh   (APP est fixé à team09, pas un paramètre ici)

set -euo pipefail

APP="team09"

BAO_ADDR="${BAO_ADDR:-${VAULT_ADDR:-http://localhost:8200}}"
BAO_TOKEN="${BAO_TOKEN:-${VAULT_TOKEN:-root-dev-token}}"
BAO_CONTAINER="${BAO_CONTAINER:-openbao.internal}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-postgres.internal}"
POSTGRES_ROOT_USER="${POSTGRES_ROOT_USER:-postgres}"
POSTGRES_ROOT_PASSWORD="${POSTGRES_ROOT_PASSWORD:-postgres-dev-password}"
export BAO_ADDR BAO_TOKEN

for bin in podman openssl; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "[bootstrap] ERROR: '$bin' introuvable dans le PATH" >&2
    exit 1
  }
done

# --8<-- [start:bao] — copié verbatim depuis core-platform/lib/secrets.sh /
# app-builder-guidances/templates/bootstrap.sh. Ne pas modifier isolément :
# les deux traits documentés (récursion sur `command -v bao`, shim `vault`
# obsolète sur le PATH) sont évités par `type -P` + un probe réel, pas une
# simple détection de présence.
_BAO_MODE=""
_bao_probe() {
  case "$1" in
    host:*)
      BAO_ADDR="$BAO_ADDR" BAO_TOKEN="$BAO_TOKEN" \
      VAULT_ADDR="$BAO_ADDR" VAULT_TOKEN="$BAO_TOKEN" \
        "${1#host:}" status >/dev/null 2>&1
      ;;
    exec)
      podman container exists "$BAO_CONTAINER" 2>/dev/null \
        && podman exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$BAO_TOKEN" \
             "$BAO_CONTAINER" bao status >/dev/null 2>&1
      ;;
  esac
}
_bao_resolve() {
  [ -n "$_BAO_MODE" ] && return 0
  local candidates=() bin
  for name in bao vault; do
    bin="$(type -P "$name" 2>/dev/null || true)"
    [ -n "$bin" ] && candidates+=("host:$bin")
  done
  candidates+=("exec")
  local c
  for c in "${candidates[@]}"; do
    if _bao_probe "$c"; then _BAO_MODE="$c"; return 0; fi
  done
  echo "[secrets] ✗ aucun CLI de secrets ne répond sur $BAO_ADDR." >&2
  echo "          Démarre le socle : (cd core-platform/core-platform && gitlab-ci-local --force-shell-executor)" >&2
  return 1
}
bao() {
  _bao_resolve || return 1
  case "$_BAO_MODE" in
    host:*)
      BAO_ADDR="$BAO_ADDR" BAO_TOKEN="$BAO_TOKEN" \
      VAULT_ADDR="$BAO_ADDR" VAULT_TOKEN="$BAO_TOKEN" \
        "${_BAO_MODE#host:}" "$@"
      ;;
    exec)
      podman exec \
        -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$BAO_TOKEN" \
        -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$BAO_TOKEN" \
        "$BAO_CONTAINER" bao "$@"
      ;;
  esac
}
# --8<-- [end:bao]

psql_root() {
  podman exec -e PGPASSWORD="$POSTGRES_ROOT_PASSWORD" \
    "$POSTGRES_CONTAINER" psql -U "$POSTGRES_ROOT_USER" "$@"
}

echo "[bootstrap] app=$APP — DB Postgres + extension vector"

if bao kv get -field=password "secret/$APP/postgres" >/dev/null 2>&1; then
  echo "  ✓ la DB Postgres de $APP est déjà provisionnée (secret/$APP/postgres)"
else
  echo "  → création de la DB $APP + de l'utilisateur $APP + mot de passe aléatoire"
  pg_password="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)"

  if ! psql_root -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$APP'" | grep -q 1; then
    psql_root -d postgres -c "CREATE DATABASE \"$APP\"" >/dev/null
  fi
  if ! psql_root -d postgres -tAc "SELECT 1 FROM pg_user WHERE usename = '$APP'" | grep -q 1; then
    psql_root -d postgres -c "CREATE USER \"$APP\" WITH PASSWORD '$pg_password'" >/dev/null
  else
    psql_root -d postgres -c "ALTER USER \"$APP\" WITH PASSWORD '$pg_password'" >/dev/null
  fi
  psql_root -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"$APP\" TO \"$APP\"" >/dev/null
  psql_root -d "$APP" -c "GRANT ALL ON SCHEMA public TO \"$APP\"" >/dev/null

  bao kv put "secret/$APP/postgres" \
    host=postgres.internal \
    port=5432 \
    database="$APP" \
    user="$APP" \
    password="$pg_password" >/dev/null
fi

# R-12-15 : pgvector doit être créée par le rôle root, jamais par le rôle
# applicatif restreint ni dans une migration exécutée au boot de l'API.
echo "  → activation de l'extension pgvector (rôle root)"
psql_root -d "$APP" -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null

echo
echo "[bootstrap] terminé."
echo "  Postgres (depuis un conteneur) : postgres.internal:5432, db=$APP, user=$APP"
echo "  Depuis l'hôte (scripts dev)    : localhost:5432 (port publié par core-platform)"
echo "  Secret Postgres                : secret/$APP/postgres"
