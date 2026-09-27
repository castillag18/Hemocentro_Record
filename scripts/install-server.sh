#!/usr/bin/env bash
# =============================================================================
# HUAV — Instalación en servidor Linux (VM con Docker)
#
# Qué hace:
#   1. Verifica Node.js, npm y Docker
#   2. Crea .env si no existe
#   3. Levanta MySQL con Docker (modo --docker) O usa MySQL externo (.env)
#   4. Crea la base de datos si no existe
#   5. Instala dependencias, sincroniza esquema Prisma y seed
#   6. Compila y arranca la aplicación
#
# Uso:
#   chmod +x scripts/install-server.sh
#   ./scripts/install-server.sh              # usa DATABASE_URL del .env
#   ./scripts/install-server.sh --docker     # MySQL en Docker (hemocentro)
#   ./scripts/install-server.sh --dev        # arranca en modo desarrollo
#   ./scripts/install-server.sh --no-start   # solo instala, no arranca
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

USE_DOCKER_MYSQL=0
START_MODE="production"
DO_START=1

for arg in "$@"; do
  case "$arg" in
    --docker) USE_DOCKER_MYSQL=1 ;;
    --dev) START_MODE="development" ;;
    --no-start) DO_START=0 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "Opción desconocida: $arg (use --help)"
      exit 1
      ;;
  esac
done

log() { echo ""; echo "▶ $*"; }
ok() { echo "✓ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

echo "═══════════════════════════════════════════════════════════════"
echo " HUAV — Instalación en servidor Linux"
echo "═══════════════════════════════════════════════════════════════"

# --- Requisitos ---
command -v node >/dev/null 2>&1 || fail "Instale Node.js 20+ (https://nodejs.org/)"
command -v npm >/dev/null 2>&1 || fail "npm no encontrado"
NODE_MAJOR="$(node -p "process.version.slice(1).split('.')[0]")"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "Se requiere Node.js 18+ (detectado: $(node -v))"

if [[ "$USE_DOCKER_MYSQL" -eq 1 ]]; then
  command -v docker >/dev/null 2>&1 || fail "Docker no encontrado. Instálelo o omita --docker."
  docker compose version >/dev/null 2>&1 || fail "docker compose no disponible"
fi

ok "Node.js $(node -v)"

# --- .env ---
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    ok ".env creado desde .env.example — edítelo antes de producción"
  else
    fail "No existe .env ni .env.example"
  fi
else
  ok "Archivo .env encontrado"
fi

# --- MySQL Docker (opcional) ---
if [[ "$USE_DOCKER_MYSQL" -eq 1 ]]; then
  log "Levantando MySQL con Docker..."
  docker compose up -d mysql

  log "Esperando MySQL..."
  for i in $(seq 1 30); do
    if docker exec hemocentro-mysql mysqladmin ping -h 127.0.0.1 -uroot -ppassword --silent 2>/dev/null; then
      ok "MySQL Docker listo"
      break
    fi
    sleep 2
    [[ "$i" -eq 30 ]] && fail "MySQL Docker no respondió a tiempo"
  done

  docker exec hemocentro-mysql mysql -uroot -ppassword -e \
    "CREATE DATABASE IF NOT EXISTS hemocentro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true

  # Ajustar .env para Docker local si aún apunta a huav remoto
  if grep -q 'DATABASE_URL=.*192\.168\.' .env 2>/dev/null || ! grep -q '^DATABASE_URL=' .env; then
    if grep -q '^DATABASE_URL=' .env; then
      sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="mysql://root:password@localhost:3306/hemocentro"|' .env
    else
      echo 'DATABASE_URL="mysql://root:password@localhost:3306/hemocentro"' >> .env
    fi
    ok 'DATABASE_URL ajustado a mysql://root:password@localhost:3306/hemocentro'
  fi
fi

# --- Crear BD si no existe (Docker o externa según .env) ---
log "Verificando / creando base de datos..."
node scripts/ensure-mysql-database.cjs

# --- Dependencias ---
log "Instalando dependencias npm..."
npm install

# --- Esquema Prisma ---
log "Sincronizando esquema y datos iniciales..."
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts

log "Verificando conexión..."
node scripts/check-db.cjs

# --- Build producción ---
if [[ "$START_MODE" == "production" ]]; then
  log "Compilando aplicación..."
  npm run build
fi

# --- Variables útiles ---
SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
APP_PORT="${PORT:-3000}"
if grep -q '^NEXT_PUBLIC_APP_URL=' .env; then
  APP_URL="$(grep '^NEXT_PUBLIC_APP_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
else
  APP_URL="http://${SERVER_IP:-localhost}:${APP_PORT}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " Instalación completada"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  URL:     ${APP_URL}/login"
echo "  Usuario: admin@hemocentro.local"
echo "  Clave:   Admin123!  (cámbiela en producción)"
echo ""
echo "  Próximos pasos:"
echo "    1. Configuración → WhatsApp → Generar QR"
echo "    2. npm run openwa:register-webhook"
echo "    3. npm run import:donors:huav   (donantes desde BD huav)"
echo ""
echo "  OpenWA webhook en Linux (ajuste .env si OpenWA está en Docker):"
echo "    OPENWA_WEBHOOK_URL=\"http://172.17.0.1:${APP_PORT}/api/webhooks/openwa\""
echo "    (o la IP del host accesible desde el contenedor OpenWA)"
echo ""

if [[ "$DO_START" -eq 0 ]]; then
  echo "  Modo --no-start: ejecute manualmente:"
  echo "    npm run start     # producción"
  echo "    npm run dev:fresh # desarrollo"
  exit 0
fi

log "Iniciando aplicación (${START_MODE})..."
if [[ "$START_MODE" == "development" ]]; then
  exec npm run dev:fresh
else
  exec npm run start
fi
