SELECT
    CONCAT_WS(' ', p.DES_NAME, p.DES_SURNAME) AS `Nombre Donante`,

    COALESCE(
        NULLIF(p.COD_CIVILID, ''),
        NULLIF(p.COD_DONOR, ''),
        p.COD_PERSON
    ) AS `Identificación del donante`,

    CASE
        WHEN dt.COD_DONATIONKIND = 'D' THEN 'Sangre total'
        WHEN dt.COD_DONATIONKIND = 'A' THEN 'Aféresis'
        ELSE COALESCE(dt.DES_DONATIONTYPE, 'No especificado')
    END AS `Tipo de donación`,

    n.DES_NATIONALITY AS `Nacionalidad`,
    bp.DES_BIRTHPLACE AS `Lugar de nacimiento`,
    p.DES_ADDRESS AS `Dirección`,
    p.DES_AREA AS `Barrio`,
    COALESCE(t.DES_TOWN, p.DES_TOWN) AS `Ciudad/Municipio`,
    st.DES_STATE AS `Departamento`,
    p.DES_HOMEPHONE AS `Casa`,
    p.DES_MOBILEPHONE AS `Móvil`,
    COALESCE(pr.DES_PROFESSION, p.DES_PROFESSION) AS `Trabajo`,
    p.DES_EMAIL AS `e-mail`,
    cs.DES_COLLECTSITE AS `Colecta`,
    DATE(d.DAT_DONATION) AS `Fecha Donacion`,
    d.TIM_DONATION AS `Hora Extracción`,

    CASE
        WHEN COALESCE(p.NUM_OLDDONATIONS, 0) = 0 THEN 'Sí'
        ELSE 'No'
    END AS `Nuevo`,

    d.COD_DONATION AS `Donación`,
    d.COD_DONATIONKIND AS `Donación - clase`,
    bt.DES_BAGTYPE AS `Bolsa`,
    CONCAT_WS('', p.COD_GROUP, p.COD_RH) AS `Grupo`,

    (
        SELECT GROUP_CONCAT(
            DISTINCT CONCAT_WS(': ', ph.DES_PHENOTYPE, pp.COD_RESULT)
            ORDER BY ph.DES_PHENOTYPE
            SEPARATOR ', '
        )
        FROM person_phenotype AS pp
        INNER JOIN phenotype AS ph
            ON ph.ID_PHENOTYPE = pp.ID_PHENOTYPE
        WHERE pp.ID_PERSON = p.ID_PERSON
    ) AS `Fenotipo`,

    d.COD_ACCEPTEDDONOR AS `Aceptado`,
    p.COD_GENDER AS `Genero`,
    dt.DES_DONATIONTYPE AS `tipo de donacion`,
    DATE(p.DAT_BIRTH) AS `Fecha de nacimiento`

FROM
(
    SELECT
        ID_DONATION,
        COD_DONATION,
        DAT_DONATION,
        TIM_DONATION,
        ID_DONATIONTYPE,
        ID_PERSON,
        ID_BAGTYPE,
        COD_DONATIONKIND,
        COD_ACCEPTEDDONOR
    FROM donation
    WHERE DAT_DONATION >= '2023-01-01'
      AND (
          COD_ACCEPTEDDONOR <> 'P'
          OR COD_ACCEPTEDDONOR IS NULL
      )
    ORDER BY
        DAT_DONATION DESC,
        TIM_DONATION DESC,
        ID_DONATION DESC
    LIMIT 5000
) AS d

INNER JOIN person AS p
    ON p.ID_PERSON = d.ID_PERSON

LEFT JOIN nationality AS n
    ON n.ID_NATIONALITY = p.ID_NATIONALITY

LEFT JOIN birthplace AS bp
    ON bp.ID_BIRTHPLACE = p.ID_BIRTHPLACE

LEFT JOIN town AS t
    ON t.ID_TOWN = p.ID_TOWN

LEFT JOIN state AS st
    ON st.ID_STATE = p.ID_STATE

LEFT JOIN collectsite AS cs
    ON cs.ID_COLLECTSITE = p.ID_COLLECTSITE

LEFT JOIN profession AS pr
    ON pr.ID_PROFESSION = p.ID_PROFESSION

LEFT JOIN donationtype AS dt
    ON dt.ID_DONATIONTYPE = d.ID_DONATIONTYPE

LEFT JOIN bagtype AS bt
    ON bt.ID_BAGTYPE = d.ID_BAGTYPE

ORDER BY
    d.DAT_DONATION DESC,
    d.TIM_DONATION DESC,
    d.ID_DONATION DESC;