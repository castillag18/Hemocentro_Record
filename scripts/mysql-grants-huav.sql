-- ═══════════════════════════════════════════════════════════════════════════
-- Permisos MySQL para HUAV Recordatorio
-- Ejecutar en MySQL Workbench conectado al Windows Server 192.168.1.4
-- como usuario administrador (root o DBA).
--
-- La VM Linux (app) se conecta DESDE 192.168.1.112 — el host en GRANT debe
-- ser exactamente esa IP, no localhost.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Diagnóstico: ver todas las cuentas He_mo_center
SELECT user, host FROM mysql.user WHERE user = 'He_mo_center';

-- 2) Ver permisos de la cuenta que usa la VM (ajuste host si difiere)
SHOW GRANTS FOR 'He_mo_center'@'192.168.1.112';

-- 3) Crear o actualizar usuario para la VM (cambie la contraseña si aplica)
CREATE USER IF NOT EXISTS 'He_mo_center'@'192.168.1.112'
  IDENTIFIED BY 'H*3M0eNt3R';

-- Si la contraseña ya es correcta pero faltan permisos, puede omitir ALTER.
-- ALTER USER 'He_mo_center'@'192.168.1.112' IDENTIFIED BY 'H*3M0eNt3R';

-- 4) BD de la aplicación (Prisma — lectura/escritura)
GRANT ALL PRIVILEGES ON hemocentro_app.* TO 'He_mo_center'@'192.168.1.112';

-- 5) BD corporativa HUAV — SOLO LECTURA (importar donantes)
GRANT SELECT ON huav.* TO 'He_mo_center'@'192.168.1.112';

FLUSH PRIVILEGES;

-- 6) Verificar que quedó aplicado
SHOW GRANTS FOR 'He_mo_center'@'192.168.1.112';

-- Debe incluir líneas como:
--   GRANT ALL PRIVILEGES ON `hemocentro_app`.* TO `He_mo_center`@`192.168.1.112`
--   GRANT SELECT ON `huav`.* TO `He_mo_center`@`192.168.1.112`
