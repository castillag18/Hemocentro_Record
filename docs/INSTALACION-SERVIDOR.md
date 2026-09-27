# HUAV — Instalación en servidor Linux (VM + Docker)

Guía para desplegar la aplicación en una **máquina virtual Linux** (por ejemplo dentro de Windows Server) con **Docker** ya instalado.

---

## 1. Requisitos en la VM Linux

| Software | Versión | Comando de verificación |
|---|---|---|
| Node.js | 20+ LTS | `node -v` |
| npm | 10+ | `npm -v` |
| Docker | Reciente | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Git | Opcional | `git --version` |

Puertos que deben estar libres o publicados:

| Puerto | Servicio |
|---|---|
| 3000 | Aplicación HUAV (Next.js) |
| 3306 | MySQL (Docker o nativo) |
| 2785 | OpenWA (WhatsApp) |

---

## 2. Copiar el proyecto al servidor

Desde su PC o directamente en la VM:

```bash
# Opción A — Git
git clone <URL-DEL-REPO> /opt/recordatorio_hemocentro
cd /opt/recordatorio_hemocentro

# Opción B — Copiar carpeta comprimida
# scp, SFTP o carpeta compartida de la VM
```

---

## 3. Configurar variables de entorno

```bash
cp .env.server.example .env
nano .env
```

### Producción HUAV (MySQL existente `huav` en el mismo servidor)

En el servidor use **`localhost`** como host de MySQL:

```env
HUAV_DB_HOST="localhost"
HUAV_DB_PORT="3306"
HUAV_DB_NAME="huav"
HUAV_DB_USER="He_mo_center"
HUAV_DB_PASSWORD="su-contraseña"
DATABASE_URL="mysql://He_mo_center:su-contraseña@localhost:3306/huav"

NEXT_PUBLIC_APP_URL="http://192.168.1.4:3000"
NODE_ENV="production"
GOOGLE_REDIRECT_URI="http://192.168.1.4:3000/api/auth/google/callback"

WHATSAPP_OPENWA_API_KEY="owa_k1_..."
OPENWA_WEBHOOK_SECRET="secreto-minimo-16-caracteres"
OPENWA_WEBHOOK_URL="http://172.17.0.1:3000/api/webhooks/openwa"
```

> Codifique `*` en la contraseña como `%2A` dentro de `DATABASE_URL`.

### Pruebas con MySQL en Docker (sin BD huav)

Use el flag `--docker` en el instalador (ver sección 4).

---

## 4. Ejecutar el instalador

```bash
chmod +x scripts/install-server.sh
./scripts/install-server.sh
```

### Opciones del script

| Comando | Descripción |
|---|---|
| `./scripts/install-server.sh` | Usa `DATABASE_URL` del `.env` (MySQL externo / huav) |
| `./scripts/install-server.sh --docker` | Levanta MySQL en Docker y usa BD `hemocentro` |
| `./scripts/install-server.sh --dev` | Arranca en modo desarrollo (`npm run dev:fresh`) |
| `./scripts/install-server.sh --no-start` | Solo instala; no inicia la app al final |

Equivalente vía npm:

```bash
npm run install:server
```

### Qué hace el instalador

1. Verifica Node.js y Docker
2. Crea `.env` si no existe
3. (Con `--docker`) `docker compose up -d mysql` + `CREATE DATABASE IF NOT EXISTS hemocentro`
4. `node scripts/ensure-mysql-database.cjs` — crea la BD si no existe
5. `npm install`
6. `prisma db push` + seed (admin + plantillas)
7. `npm run build`
8. `npm run start` (escucha en `0.0.0.0:3000`)

---

## 5. Acceder desde la red

```
http://192.168.1.4:3000/login
```

| Campo | Valor inicial |
|---|---|
| Correo | `admin@hemocentro.local` |
| Contraseña | `Admin123!` |

Verifique salud:

```bash
curl http://localhost:3000/api/health
```

---

## 6. Post-instalación

```bash
# Importar donantes desde BD huav
npm run import:donors:huav

# Registrar webhook WhatsApp (respuestas Sí / agendamiento)
npm run openwa:register-webhook

# Verificar OpenWA
curl http://localhost:2785/api/health
```

En la interfaz: **Configuración → Canales → Generar código QR** y escanee con WhatsApp.

---

## 7. Mantener la app corriendo (PM2)

Para que la app sobreviva al cerrar la terminal:

```bash
npm install -g pm2
pm2 start npm --name "huav" -- start
pm2 save
pm2 startup
```

---

## 8. Solución de problemas

| Problema | Solución |
|---|---|
| `Can't reach database server` | Verifique MySQL activo: `systemctl status mysql` o `docker ps` |
| Sin permiso `CREATE DATABASE` | Normal en BD `huav` corporativa; la BD ya debe existir |
| OpenWA: session not found | Configuración → nombre sesión `default` → Generar QR |
| Webhook no llega | En Linux use `172.17.0.1` en `OPENWA_WEBHOOK_URL`, no `host.docker.internal` |
| Puerto 3000 ocupado | `PORT=3001` en `.env` y reinicie |

---

## 9. Referencia rápida

```bash
npm run db:ensure          # Solo crear/verificar BD
npm run db:check           # Probar conexión Prisma
npm run db:sync            # Re-sincronizar esquema
npm run start              # Producción
npm run dev:fresh          # Desarrollo
```

Documentación general: [INSTALACION.md](./INSTALACION.md)
