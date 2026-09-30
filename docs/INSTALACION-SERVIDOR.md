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

### Instalar Node.js 20 (Ubuntu / Debian)

Si `./scripts/install-server.sh` muestra *«Instale Node.js 20+»*:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v    # debe mostrar v20.x.x
npm -v
```

Alternativa con **nvm** (sin sudo para Node):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

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
git clone https://github.com/castillag18/Hemocentro_Record.git
cd /opt/Hemocentro_Record   # ⚠ Siempre ejecute npm desde aquí, NO desde /home/hemoc

# Opción B — Copiar carpeta comprimida
# scp, SFTP o carpeta compartida de la VM
```

---

## 3. Configurar variables de entorno

```bash
# Si existe la plantilla del servidor:
cp .env.server.example .env

# Si no existe (repo antiguo en GitHub), use la general:
cp .env.example .env

nano .env
```

### Arquitectura HUAV — VM Linux + MySQL en Windows Server

| Equipo | IP | Rol |
|---|---|---|
| VM Linux | `192.168.1.112` | App Next.js + Docker (OpenWA) |
| Windows Server | `192.168.1.4` | MySQL base de datos `huav` |

**Importante:** En la VM **no use `localhost`** para MySQL. La BD está en el Windows Server.

> ⚠ **NUNCA** use la base corporativa `huav` en `DATABASE_URL`. Prisma (`db push`) puede **borrar tablas del sistema HUAV**. Use una base separada `hemocentro_app`. Ver [RECUPERACION-BD-HUAV.md](./RECUPERACION-BD-HUAV.md) si ya ocurrió el daño.

```env
HUAV_DB_HOST="192.168.1.4"
HUAV_DB_PORT="3306"
HUAV_DB_NAME="huav"
HUAV_DB_USER="He_mo_center"
HUAV_DB_PASSWORD="H*3M0eNt3R"
APP_DB_NAME="hemocentro_app"
DATABASE_URL="mysql://He_mo_center:H%2A3M0eNt3R@192.168.1.4:3306/hemocentro_app"

NEXT_PUBLIC_APP_URL="http://192.168.1.112:3000"
NODE_ENV="production"
# Google OAuth NO acepta 192.168.x.x — ver sección 10
GOOGLE_REDIRECT_URI="https://SU-TUNEL.ngrok-free.app/api/auth/google/callback"

WHATSAPP_OPENWA_API_KEY="owa_k1_..."
OPENWA_WEBHOOK_SECRET="secreto-minimo-16-caracteres"
OPENWA_WEBHOOK_URL="http://172.17.0.1:3000/api/webhooks/openwa"
```

> Codifique `*` en la contraseña como `%2A` dentro de `DATABASE_URL`.

### MySQL en el mismo servidor Linux (solo si BD y app están juntas)

Use `localhost` solo cuando MySQL corre **en la misma VM**:

```env
HUAV_DB_HOST="localhost"
DATABASE_URL="mysql://He_mo_center:pass@localhost:3306/huav"
```

### Permitir conexión remota desde la VM (Windows Server)

En el **Windows Server** (`192.168.1.4`):

1. MySQL debe escuchar en todas las interfaces (`bind-address = 0.0.0.0` en `my.ini`).
2. **Firewall Windows:** regla de entrada TCP **3306** desde `192.168.1.112`.
3. Usuario MySQL con acceso remoto, por ejemplo:
   ```sql
   GRANT ALL ON huav.* TO 'He_mo_center'@'192.168.1.112' IDENTIFIED BY 'H*3M0eNt3R';
   FLUSH PRIVILEGES;
   ```
   (O `'He_mo_center'@'%'` en la red interna.)

Desde la **VM Linux**, verifique:

```bash
nc -zv 192.168.1.4 3306
mysql -h 192.168.1.4 -u He_mo_center -p huav -e "SELECT 1;"
```

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
http://192.168.1.112:3000/login
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

# Respuestas «Sí» → fechas de cita (obligatorio si el webhook no llega)
mkdir -p logs
npm run openwa:install-cron

# Alternativa con PM2 (24/7 sin depender de cron):
# pm2 start scripts/openwa-poll-loop.cjs --name openwa-poll
# pm2 save

# Diagnóstico completo (BD app, HUAV, OpenWA, tsx)
npm run server:diagnose

# Verificar OpenWA
curl http://localhost:2785/api/health
```

En la interfaz: **Configuración → Canales → Generar código QR** y escanee con WhatsApp.

---

## 7. Mantener la app corriendo (PM2)

Para que la app sobreviva al cerrar la terminal:

```bash
npm install -g pm2
cd /opt/Hemocentro_Record   # ⚠ Siempre ejecute npm desde aquí, NO desde /home/hemoc
npm run build          # requiere ~4 GB RAM o swap (ver sección 8)
pm2 start npm --name "huav" -- start
pm2 save
pm2 startup
```

Si el build falla con `heap out of memory`, use:

```bash
export NODE_OPTIONS=--max-old-space-size=4096
npm run build
pm2 start npm --name "huav" -- start
pm2 save
```

---

## 8. VM con poca RAM (error heap out of memory)

Si `npm run build` falla con `JavaScript heap out of memory`:

```bash
# Opción A — más memoria para Node
export NODE_OPTIONS=--max-old-space-size=4096
npm run build:server

# Opción B — swap temporal (2 GB)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
npm run build:server

# Opción C — pruebas sin build de producción
npm run db:push:retry
npm run db:seed
npm run dev:fresh
```

`dev:fresh` no requiere `next build` y sirve para validar la app en el servidor.

### MySQL remoto intermitente (P1001)

```bash
nc -zv 192.168.1.4 3306
npm run db:push:retry
```

---

## 9. Error 403 en `/_next/static/chunks` (modo desarrollo)

Al abrir la app por IP (`http://192.168.1.112:3000`), Next.js 16 bloquea recursos dev por seguridad.

**Solución:** `next.config.ts` incluye `allowedDevOrigins` con la IP de la VM. Tras actualizar el código:

```bash
# Reinicie el servidor dev (Ctrl+C y de nuevo)
npm run dev:fresh
```

Si usa otra IP, agregue en `.env`:

```env
ALLOWED_DEV_ORIGINS="192.168.1.112"
```

En **producción** (`npm run build` + `npm run start`) este bloqueo no aplica.

---

## 10. Google Calendar en red LAN (sin dominio público)

**Google Cloud no permite** registrar `http://192.168.1.112:3000` en un cliente OAuth tipo *Aplicación web*. Solo acepta:

| Entorno | Origen / redirect en Google Console |
|---|---|
| Desarrollo en la misma PC | `http://localhost:3000` |
| Servidor LAN + túnel | `https://xxx.ngrok-free.app` (o Cloudflare Tunnel) |
| Producción | `https://su-dominio.org` |

El personal **sigue usando** `http://192.168.1.112:3000` en la red interna. Solo la **conexión OAuth** necesita URL permitida por Google.

### Opción A — Túnel HTTPS (recomendada en la VM)

```bash
# En la VM, con ngrok instalado:
ngrok http 3000
```

1. Copie la URL `https://....ngrok-free.app`
2. En Google Cloud → Orígenes JS: `https://....ngrok-free.app`
3. URI redirect: `https://....ngrok-free.app/api/auth/google/callback`
4. En `.env` del servidor:

```env
NEXT_PUBLIC_APP_URL="http://192.168.1.112:3000"
GOOGLE_REDIRECT_URI="https://....ngrok-free.app/api/auth/google/callback"
```

5. Reinicie la app → Configuración → **Conectar Google Calendar**

> Mantenga ngrok activo mientras conecta Calendar. Tras guardar el refresh token, el túnel ya no es necesario para crear eventos.

### Opción B — Script CLI con localhost

Si puede abrir Google OAuth desde la VM (navegador o SSH con reenvío de puertos):

1. En Google Console registre solo `http://localhost:3000`
2. En `.env`: `GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"`
3. Ejecute: `npm run google:connect-calendar`

### Opción C — Cuenta de servicio (sin OAuth web)

1. Google Cloud → **Cuenta de servicio** → descargue JSON
2. Comparta el calendario del hemocentro con el email de la cuenta de servicio (permiso * hacer cambios*)
3. Configuración → **Configuración avanzada** → pegue el JSON en *Credenciales JSON Google*
4. Indique el **ID del calendario** compartido

No requiere redirect URI ni túnel.

---

## 11. Permisos MySQL — `Access denied` al importar HUAV

Si `npm run db:check:huav` muestra:

```text
Access denied for user 'He_mo_center'@'192.168.1.112' (using password: YES)
```

la VM **sí llega** a MySQL, pero falta permiso sobre la base **`huav`**. Los comandos deben ejecutarse en **MySQL Workbench conectado al servidor `192.168.1.4`**, no en la VM.

### Paso 1 — Conectar Workbench

| Campo | Valor |
|---|---|
| Host | `192.168.1.4` (o `localhost` si Workbench está en ese Windows) |
| Puerto | `3306` |
| Usuario | `root` o un DBA con permiso `GRANT` |

### Paso 2 — Diagnosticar (pegar y ejecutar)

```sql
SELECT user, host FROM mysql.user WHERE user = 'He_mo_center';
SHOW GRANTS FOR 'He_mo_center'@'192.168.1.112';
```

Revise la salida:

- Si **no existe** `'He_mo_center'@'192.168.1.112'`, hay que crearlo (paso 3).
- Si existe pero **no aparece** `GRANT SELECT ON \`huav\`.*`, hay que otorgarlo (paso 3).
- Si el `GRANT` está en `'He_mo_center'@'%'` pero también existe `'He_mo_center'@'192.168.1.112'` **sin** permiso en `huav`, MySQL usa la cuenta más específica (`192.168.1.112`) y sigue fallando — otorgue en **esa** cuenta.

### Paso 3 — Script completo (recomendado)

En el repo: `scripts/mysql-grants-huav.sql`. En Workbench: **File → Open SQL Script** → ejecutar todo.

O pegue manualmente:

```sql
CREATE USER IF NOT EXISTS 'He_mo_center'@'192.168.1.112'
  IDENTIFIED BY 'H*3M0eNt3R';

GRANT ALL PRIVILEGES ON hemocentro_app.* TO 'He_mo_center'@'192.168.1.112';
GRANT SELECT ON huav.* TO 'He_mo_center'@'192.168.1.112';

FLUSH PRIVILEGES;

SHOW GRANTS FOR 'He_mo_center'@'192.168.1.112';
```

La última consulta **debe** listar `GRANT SELECT ON \`huav\`.*`.

### Paso 4 — Probar desde la VM Linux

```bash
cd /opt/Hemocentro_Record   # ⚠ Siempre ejecute npm desde aquí, NO desde /home/hemoc
npm run db:check:huav
npm run import:donors:huav
```

### Errores frecuentes en Workbench

| Error | Causa |
|---|---|
| Ejecutó el GRANT pero la VM sigue igual | `FLUSH PRIVILEGES` omitido, o GRANT en `@'%'` pero existe `@'192.168.1.112'` sin permiso |
| `Access denied` solo en `huav` | Falta `GRANT SELECT ON huav.*` (hemocentro_app ya funciona) |
| Workbench conectado a otro servidor | Debe ser el MySQL de `192.168.1.4`, no una réplica ni Docker local |
| Contraseña incorrecta | `ALTER USER 'He_mo_center'@'192.168.1.112' IDENTIFIED BY '...';` y actualizar `.env` |

---

## 12. Solución de problemas

| Problema | Solución |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | BD no está en la VM: use `192.168.1.4` en `.env`, no `localhost` |
| `Can't reach database server` | Desde VM: `nc -zv 192.168.1.4 3306` — firewall/MySQL remoto en Windows |
| `Access denied` al importar HUAV | `hemocentro_app` conecta pero falta `GRANT SELECT ON huav.* TO 'He_mo_center'@'192.168.1.112'` en MySQL Windows |
| Importación HUAV falla en la web | `npm run db:check:huav` — debe devolver filas de `donantes_info.sql` |
| WhatsApp «Sí» sin fechas | `npm run openwa:diagnose` (¿donante identificado?) + `npm run openwa:poll-inbox` |
| Cron poll no corre | Log muestra `/usr/bin/npm: not found` → use ruta completa a npm (`which npm`) o `bash -lc` en crontab |
| `Access denied` con GRANT OK | `HUAV_DB_PASSWORD` debe ser `H*3M0eNt3R`, **no** `H%2A3M0eNt3R` (%2A solo en `DATABASE_URL`) |
| Donante no encontrado en WhatsApp | Importe donantes HUAV primero; solo hay ~6 de prueba si no importó |
| Sin permiso `CREATE DATABASE` | Normal en BD `huav` corporativa; la BD ya debe existir |
| OpenWA: session not found | Configuración → nombre sesión `default` → Generar QR |
| Webhook no llega | Use sondeo cron (`openwa:poll-inbox`); webhook es opcional en Docker/LAN |
| Sesión `ready` → `failed` | Revise MySQL estable (`Can't reach 192.168.1.4` en poll); una vez `npm run openwa:restart-session` + QR; no `docker restart` en bucle |
| OpenWA inestable | Contenedor con `--shm-size=2g` y volumen persistente para datos de sesión; PM2 `openwa-poll` ya hace backoff si no está `ready` |
| Webhook URL en Linux | Preferir `OPENWA_WEBHOOK_URL=http://172.17.0.1:3000/api/webhooks/openwa` (no `host.docker.internal` salvo Docker Desktop) |
| Puerto 3000 ocupado | `PORT=3001` en `.env` y reinicie |
| Google OAuth: IP no válida | Use túnel HTTPS, localhost o cuenta de servicio (sección 10) |
| Calendar conectado pero sin eventos | `npm run google:test-calendar` o cuenta de servicio + calendario compartido |

---

## 13. Referencia rápida

```bash
npm run db:ensure          # Solo crear/verificar BD
npm run db:check           # Probar conexión Prisma (hemocentro_app)
npm run db:check:huav      # Probar lectura BD corporativa huav
npm run server:diagnose    # Diagnóstico completo en servidor
npm run import:donors:huav # Importar donantes desde huav
npm run openwa:diagnose    # Mensajes WhatsApp + identificación donante
npm run openwa:poll-inbox  # Procesar respuestas «Sí» manualmente
npm run db:sync            # Re-sincronizar esquema
npm run start              # Producción
npm run dev:fresh          # Desarrollo
```

Documentación general: [INSTALACION.md](./INSTALACION.md)
