-- =============================================================================
-- HUAV — Extracción de donantes para recordatorio_hemocentro
-- =============================================================================
-- Objetivo: una fila por donante con su ÚLTIMA donación, incluyendo:
--   documentId, name, gender, bloodType, donationType, lastDonationDate,
--   phone, email, accepted
--
-- Ajuste nombres de tablas/columnas según el sistema del cliente (MySQL / MariaDB).
-- El Excel "Info Donates 2026" (hoja RegisteredOffers) equivale aproximadamente a:
--   Num, Nombre Donante, Móvil, e-mail, Fecha Donacion, Donación (tipo), Donación_1 (cédula),
--   Grupo, Aceptado, Bolsa
--
-- Códigos tipo donación (columna Donación del export HUAV):
--   A        → aferesis  (recordatorio mensual, sin importar género)
--   N,VRE,H  → total     (intervalo según sexo: F=4 meses, M=3 meses por defecto)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Plantilla MySQL — maestro de donantes + última donación
--    Reemplace: donantes, donaciones, id_donante, documento, sexo, etc.
-- -----------------------------------------------------------------------------
SELECT
    d.documento                                          AS documentId,
    d.nombre_completo                                    AS name,
    CASE
        WHEN UPPER(TRIM(d.sexo)) IN ('F', 'FEMENINO', 'FEM', 'MUJER') THEN 'F'
        WHEN UPPER(TRIM(d.sexo)) IN ('M', 'MASCULINO', 'MASC', 'HOMBRE') THEN 'M'
        ELSE NULL
    END                                                  AS gender,
    ult.grupo_sanguineo                                  AS bloodType,
    CASE
        WHEN UPPER(TRIM(ult.codigo_tipo_donacion)) IN ('A', 'AFERESIS', 'AFÉRESIS') THEN 'aferesis'
        ELSE 'total'
    END                                                  AS donationType,
    DATE(ult.fecha_donacion)                             AS lastDonationDate,
    NULLIF(TRIM(d.telefono_movil), '')                   AS phone,
    NULLIF(TRIM(d.correo), '')                           AS email,
    CASE
        WHEN UPPER(TRIM(ult.aceptado)) IN ('SI', 'SÍ', 'S', '1', 'TRUE', 'YES') THEN 1
        ELSE 0
    END                                                  AS accepted
FROM donantes d
INNER JOIN (
    SELECT
        dn.id_donante,
        dn.fecha_donacion,
        dn.codigo_tipo_donacion,
        dn.grupo_sanguineo,
        dn.aceptado,
        ROW_NUMBER() OVER (
            PARTITION BY dn.id_donante
            ORDER BY dn.fecha_donacion DESC, dn.id DESC
        ) AS rn
    FROM donaciones dn
    WHERE dn.fecha_donacion IS NOT NULL
) ult ON ult.id_donante = d.id AND ult.rn = 1
WHERE d.activo = 1;


-- -----------------------------------------------------------------------------
-- 2) Variante sin ROW_NUMBER (MySQL 5.7) — última donación por MAX(fecha)
-- -----------------------------------------------------------------------------
SELECT
    d.documento                                          AS documentId,
    d.nombre_completo                                    AS name,
    CASE
        WHEN UPPER(TRIM(d.sexo)) IN ('F', 'FEMENINO', 'MUJER') THEN 'F'
        WHEN UPPER(TRIM(d.sexo)) IN ('M', 'MASCULINO', 'HOMBRE') THEN 'M'
        ELSE NULL
    END                                                  AS gender,
    ult.grupo_sanguineo                                  AS bloodType,
    CASE
        WHEN UPPER(TRIM(ult.codigo_tipo_donacion)) = 'A' THEN 'aferesis'
        ELSE 'total'
    END                                                  AS donationType,
    DATE(ult.fecha_donacion)                             AS lastDonationDate,
    NULLIF(TRIM(d.telefono_movil), '')                   AS phone,
    NULLIF(TRIM(d.correo), '')                           AS email,
    CASE
        WHEN UPPER(TRIM(ult.aceptado)) IN ('SI', 'SÍ', 'S', '1') THEN 1
        ELSE 0
    END                                                  AS accepted
FROM donantes d
INNER JOIN donaciones ult
    ON ult.id_donante = d.id
INNER JOIN (
    SELECT id_donante, MAX(fecha_donacion) AS max_fecha
    FROM donaciones
    GROUP BY id_donante
) mx ON mx.id_donante = ult.id_donante AND mx.max_fecha = ult.fecha_donacion;


-- -----------------------------------------------------------------------------
-- 3) Si solo dispone del export tipo Excel (tabla staging importada)
--    Una fila por donante = última Fecha Donacion
-- -----------------------------------------------------------------------------
SELECT
    COALESCE(NULLIF(TRIM(CAST(donacion_doc AS CHAR)), ''), CONCAT('TEL-', movil)) AS documentId,
    nombre_donante                                       AS name,
    CASE
        WHEN UPPER(TRIM(sexo)) IN ('F', 'FEMENINO', 'MUJER') THEN 'F'
        WHEN UPPER(TRIM(sexo)) IN ('M', 'MASCULINO', 'HOMBRE') THEN 'M'
        ELSE NULL
    END                                                  AS gender,
    grupo                                                AS bloodType,
    CASE
        WHEN UPPER(TRIM(codigo_donacion)) = 'A' THEN 'aferesis'
        ELSE 'total'
    END                                                  AS donationType,
    DATE(fecha_donacion)                                 AS lastDonationDate,
    NULLIF(TRIM(movil), '')                              AS phone,
    NULLIF(TRIM(email), '')                              AS email,
    CASE
        WHEN UPPER(TRIM(aceptado)) IN ('SI', 'SÍ', 'S', '1') THEN 1
        ELSE 0
    END                                                  AS accepted
FROM (
    SELECT
        r.*,
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(TRIM(CAST(donacion_doc AS CHAR)), ''), movil, nombre_donante)
            ORDER BY fecha_donacion DESC
        ) AS rn
    FROM staging_registered_offers r
) t
WHERE t.rn = 1;


-- -----------------------------------------------------------------------------
-- 4) Exportar a CSV (desde cliente mysql CLI)
-- -----------------------------------------------------------------------------
-- mysql -h HOST -u USER -p BASE_DATOS -e "SOURCE extraccion-donantes-cliente.sql" \
--   | sed 's/\t/,/g' > donantes_export.csv

-- Columnas esperadas por la app (import CSV / Excel):
-- documentId | name | gender | bloodType | donationType | lastDonationDate | phone | email | accepted
-- gender: F o M (vacío = usa intervalo de respaldo en días)
-- donationType: total | aferesis
