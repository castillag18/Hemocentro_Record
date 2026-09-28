# Recuperación de la base de datos HUAV (empresa)

## Qué ocurrió

Si `DATABASE_URL` apuntaba a la misma base `huav` que el sistema corporativo, el comando **`prisma db push --accept-data-loss`** pudo **eliminar tablas** del sistema HUAV (`person`, `donation`, etc.) y dejar solo las tablas de esta aplicación (`Donor`, `Settings`, `AdminUser`, …).

**Detenga de inmediato** cualquier `npm run db:push`, `db:sync` o instalador en el servidor hasta separar las bases de datos.

---

## Paso 1 — Detener más daños (VM Linux)

En la VM donde corre la app:

```bash
# Detener la app (Ctrl+C o pm2 stop huav)

# Editar .env — base SEPARADA para la app:
APP_DB_NAME="hemocentro_app"
DATABASE_URL="mysql://He_mo_center:H%2A3M0eNt3R@192.168.1.4:3306/hemocentro_app"

# HUAV corporativo — SOLO lectura para importar donantes:
HUAV_DB_NAME="huav"
HUAV_DB_HOST="192.168.1.4"
```

Crear la base de la app (no toca `huav`):

```bash
node scripts/ensure-mysql-database.cjs
npm run db:push:retry
npm run db:seed
```

A partir de ahora el guard `scripts/guard-app-database.cjs` bloquea `db push` si `DATABASE_URL` = `huav`.

---

## Paso 2 — Recuperar datos HUAV (Windows Server 192.168.1.4)

Ejecute **en el servidor Windows** donde está MySQL, con ayuda del administrador de sistemas / TI.

### A) Copias de seguridad MySQL (prioridad)

Busque dumps recientes:

- Tareas programadas `mysqldump`
- Carpetas `Backup`, `backups`, `C:\Backup`
- Herramientas del hospital (Acronis, Veeam, Windows Server Backup)

Si encuentra un `.sql` o `.bak` **anterior a la instalación de la app**:

```powershell
mysql -u root -p huav < ruta\al\backup_huav_YYYYMMDD.sql
```

### B) Instantáneas de volumen (Shadow Copy)

En PowerShell **como administrador**:

```powershell
vssadmin list shadows
```

Si hay una sombra anterior al incidente, restaure la carpeta de datos MySQL (`datadir`) con ayuda de TI.  
Ubicación típica del datadir:

```sql
-- Conectado a MySQL:
SHOW VARIABLES LIKE 'datadir';
```

### C) Binary logs (recuperación punto en el tiempo)

Si `log_bin` estaba activo:

```sql
SHOW VARIABLES LIKE 'log_bin';
SHOW BINARY LOGS;
```

Un DBA puede hacer **point-in-time recovery** hasta minutos antes del `db push`. Requiere backup base + binlogs.

### D) Copia del directorio de datos (último recurso)

1. **Detener el servicio MySQL** en Windows.
2. Copiar `%ProgramData%\MySQL\...` o el `datadir` completo a otro disco.
3. Consultar a un especialista MySQL antes de reiniciar.

---

## Paso 3 — Verificar qué quedó en `huav`

```sql
USE huav;
SHOW TABLES;
```

Tablas esperadas del **sistema HUAV** (ejemplos): `person`, `donation`, `nationality`, …  
Tablas de **esta app** (Prisma): `Donor`, `Settings`, `AdminUser`, `Appointment`, …

Si solo aparecen tablas Prisma, la recuperación **debe** venir de backup externo; `donantes_info.sql` en este repo es solo una **consulta de exportación**, no un backup completo del sistema.

---

## Paso 4 — Contactos recomendados

1. Administrador de MySQL / TI del hospital  
2. Proveedor del software HUAV (pueden tener scripts de reinstalación de esquema)  
3. No ejecute más scripts de instalación de esta app sobre `huav`

---

## Prevención (ya incluida en el proyecto)

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Base **solo de la app** (`hemocentro_app`) |
| `HUAV_DB_*` | Base **corporativa** (`huav`) — lectura para importar donantes |
| `guard-app-database.cjs` | Bloquea `db push` si ambas coinciden |

Ver también: [INSTALACION-SERVIDOR.md](./INSTALACION-SERVIDOR.md)
