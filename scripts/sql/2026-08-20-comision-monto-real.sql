-- 2026-08-20 · El monto de una comisión deja de ser un número solo.
--
-- POR QUÉ. La tabla guarda UN monto y ese número cambia de significado según el
-- momento, sin decirlo. Mirando el año 2026 se ve al ojo:
--
--     15-feb  COBRADO      $38.756,61   ← medido
--     15-may  COBRADO      $45.921,72   ← medido
--     15-ago  POR_COBRAR   $51.000,00   ← tecleado
--     15-nov  POR_COBRAR   $51.000,00   ← tecleado
--
-- Los dos primeros son mediciones. Los dos últimos dicen "$51.000 exactos, dos veces":
-- es una proyección que alguien escribió en el Excel, no plata que se contó. Lo que de
-- verdad entró en agosto fueron ~$50.847 MENOS la retención del procesador (entre 0,5%
-- y 5%), que solo se conoce después del hecho. Hoy nada en el sistema distingue una
-- cosa de la otra, así que el panel muestra las cuatro con el mismo peso.
--
-- QUÉ ENTRA. Dos columnas, las dos aditivas:
--
--   · montoEsProyeccion — "nadie confirmó este número". Es el dato que faltaba para
--     poder rotular en pantalla qué parte del total es una estimación.
--
--   · montoBruto — lo que el aliado reporta ANTES de la retención. Nullable porque no
--     siempre se sabe: la decisión de negocio (Elías, 2026-08-20) es que el NETO es
--     obligatorio —es la plata que entró al banco— y el bruto, opcional.
--
--     ⚠ LA RETENCIÓN NO SE GUARDA: se DERIVA (montoBruto − monto) y se declara cuando
--     falta el bruto. Un tercer número guardado puede contradecir a los otros dos, y
--     entonces hay que decidir a cuál creerle — que es exactamente el problema que
--     esta migración viene a cerrar, no a repetir.
--
-- ADITIVO: 2 columnas (una nullable, otra con default) + un backfill. Nada se dropea ni
-- se renombra. El código viejo, que no conoce estas columnas, sigue leyendo y
-- escribiendo igual durante la ventana de deploy: una comisión creada por él nace con
-- montoEsProyeccion=false, que es lo conservador (afirma menos, no más).
--
-- ⚠ SIN deny-all RESTRICTIVE, igual que su hermana del 2026-08-17: `ComisionPartner` es
-- un INGRESO y su superficie es la de ADMIN, como `IngresoVariable`. Eso no cambia acá.
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-20-comision-monto-real.sql
--   npx prisma generate   ·   npm run check:invariants  (INV20 debe seguir verde)

ALTER TABLE "ComisionPartner"
    ADD COLUMN IF NOT EXISTS "montoBruto" DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS "montoEsProyeccion" BOOLEAN NOT NULL DEFAULT false;

-- ── Backfill: qué montos NO están confirmados ───────────────────────────────────
-- La regla es literal, no una heurística: una comisión COBRADA tiene `confirmadoPor`
-- —alguien firmó que esa plata entró, INV20 lo exige— y una POR_COBRAR no. O sea que
-- el monto de toda POR_COBRAR es, por definición, un número que nadie confirmó.
--
-- No se intenta adivinar cuáles de esas son "estimaciones redondas" y cuáles son una
-- factura ya recibida sin pagar (el caso de Cooby, $938,22): esa distinción la hace una
-- persona desde la pantalla, no un UPDATE. Marcar de más acá sería inventar en la
-- dirección contraria.
UPDATE "ComisionPartner"
   SET "montoEsProyeccion" = true
 WHERE "estado" = 'POR_COBRAR';
