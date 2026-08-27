-- 2026-08-21 · El selector de versiones dice "Propuesta N", no "Caso de uso N"
--
-- El nombre de cada versión se GUARDA al crearla (`lib/canvas/default-canvases.ts` escribe
-- `${caseLabel} ${version}`), así que cambiar el `caseLabel` de la plantilla solo arregla las
-- que nazcan de ahora en adelante. Esto renombra las que ya existen.
--
-- Por qué el cambio: "Caso de uso N" chocaba de frente con el CATÁLOGO DE CASOS DE USO del
-- checklist del vendedor —los servicios pre-cotizados—, que es otra cosa. Son versiones de la
-- propuesta; se llaman propuestas.
--
-- ⚠ Solo canvases de PROPUESTA (`businessCaseId IS NOT NULL`). Los canvases de PROYECTO
-- (kickoff, cronograma, entrega…) tienen sus propios rótulos y no se tocan.
-- Inocuo y re-corrible: es un rótulo de pantalla, nadie lo usa como clave.

UPDATE "ProjectCanvas"
   SET "name" = REPLACE("name", 'Caso de uso ', 'Propuesta ')
 WHERE "businessCaseId" IS NOT NULL
   AND "name" LIKE 'Caso de uso %';
