/**
 * scripts/inspect-liberar-facturas.ts
 *
 * Chequeo previo de la Fase 0 de «Cambiar el acuerdo de pago y cuadrar el cronograma».
 * **SOLO LECTURA.** No escribe una sola fila. Correr antes de tocar código:
 *
 *   npx tsx scripts/inspect-liberar-facturas.ts
 *
 * ── QUÉ MIDE Y POR QUÉ CADA COSA ────────────────────────────────────────────────
 * A · Quién se quedaría afuera al hacer que `cobranza.write` se exija de verdad. Hoy la celda
 *     existe pero ningún guard la consulta (`enforced: false`), así que nadie la nota. Debería
 *     dar vacío —ADMIN y SUPER_ADMIN la tienen por default— pero una plantilla en la base o un
 *     override por persona pueden pisarlo. **Se mide, no se supone.**
 *
 * B · Cuántas alertas apuntan a cobros que ya no existen, con el volcado de los pares. Es la
 *     ÚNICA copia de a qué apuntaban: una vez que se limpien, ese dato no vuelve.
 *
 * C · Cuántos cobros facturados tiene su plan activo sin pedirlos. Es el universo real del
 *     feature. Wherex puede no ser el único, y si son 80 en vez de 3 el diálogo tiene que
 *     poder con una lista larga.
 *
 * D · Cobros con fecha de emisión pero sin quién los facturó — víctimas del revert que hoy
 *     DESTRUYE la autoría en vez de archivarla. Hay que contarlas antes de prometer que el
 *     invariante nuevo nace en verde.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { materializeCobros, type PlanEngineInput, type ServicioEngineInput } from "@/lib/cobranza/engine";
import { crDateParts } from "@/lib/jobs/time";

const ROLES = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"] as const;
const titulo = (s: string) => console.log(`\n━━ ${s} ${"━".repeat(Math.max(0, 72 - s.length))}`);

async function main() {
  const todayISO = crDateParts(new Date()).dateKey;

  /* ── A · quién pierde acceso al exigir cobranza.write ───────────────────────── */
  titulo("A · roles y personas con acceso a Cobranza pero sin permiso de editar");

  const enRiesgo: string[] = [];
  for (const rol of ROLES) {
    const eff = await getEffectivePermissions({ roleEnum: rol });
    const read = eff.sections.cobranza?.read === true;
    const write = eff.sections.cobranza?.write === true;
    if (read) console.log(`  ${rol.padEnd(12)} read=${read} write=${write}${read && !write ? "  ⚠ SE QUEDARÍA AFUERA" : ""}`);
    if (read && !write) enRiesgo.push(`rol ${rol}`);
  }

  /* Los overrides por persona pisan la plantilla, así que hay que mirarlos uno por uno. */
  const miembros = await prisma.teamMember.findMany({
    where: { permissionOverrides: { not: Prisma.JsonNull } },
    select: { email: true, roleEnum: true, permissionOverrides: true },
  });
  for (const m of miembros) {
    const eff = await getEffectivePermissions({ roleEnum: m.roleEnum, permissionOverrides: m.permissionOverrides });
    const read = eff.sections.cobranza?.read === true;
    const write = eff.sections.cobranza?.write === true;
    if (read && !write) {
      console.log(`  ⚠ ${m.email} (${m.roleEnum}) tiene acceso pero NO editar`);
      enRiesgo.push(m.email);
    }
  }
  console.log(
    enRiesgo.length === 0
      ? "  ✓ Nadie se queda afuera: se puede exigir `cobranza.write` sin conceder nada primero."
      : `  ⛔ ${enRiesgo.length} quedarían sin acceso. Hay que concederles write EN LA MISMA migración.`,
  );

  /* ── B · alertas que apuntan a cobros que ya no existen ─────────────────────── */
  titulo("B · alertas huérfanas");

  const conCobro = await prisma.alertaCobro.findMany({
    where: { cobroId: { not: null } },
    select: { id: true, cobroId: true, tipo: true, estado: true, mensaje: true },
  });
  const vivos = new Set(
    (await prisma.cobro.findMany({ where: { id: { in: conCobro.map((a) => a.cobroId!) } }, select: { id: true } })).map(
      (c) => c.id,
    ),
  );
  const huerfanas = conCobro.filter((a) => !vivos.has(a.cobroId!));
  console.log(`  alertas con cobroId: ${conCobro.length} · ⚠ huérfanas: ${huerfanas.length}`);
  for (const h of huerfanas.slice(0, 10)) console.log(`     ${h.estado.padEnd(9)} ${h.tipo.padEnd(22)} → ${h.cobroId}`);

  if (huerfanas.length) {
    /* El volcado es la única copia de a qué apuntaban. Sin esto el arreglo pierde el dato. */
    const destino = join(process.cwd(), "scripts", "sql", "_respaldo-alertas-huerfanas.json");
    writeFileSync(destino, JSON.stringify(huerfanas, null, 2), "utf8");
    console.log(`  → respaldo en ${destino}`);
  }

  /* ── C · el universo real: cobros facturados que el plan ya no pide ─────────── */
  titulo("C · cobros facturados que su plan activo ya no pide");

  const servicios = await prisma.servicioContratado.findMany({
    where: { cobros: { some: { fechaEmision: { not: null } } } },
    select: {
      id: true,
      montoTotal: true,
      moneda: true,
      duracionMeses: true,
      fechaInicioFacturacion: true,
      descripcion: true,
      cuenta: { select: { diaCobroAncla: true, client: { select: { name: true } } } },
      planes: {
        where: { activo: true },
        select: { template: true, numCuotas: true, cuotas: { select: { orden: true, base: true, valor: true, offsetMeses: true } } },
      },
      cobros: { select: { numCuota: true, monto: true, estado: true, fechaEmision: true, origen: true } },
    },
  });

  let afectados = 0;
  const filas: string[] = [];
  for (const s of servicios) {
    const plan = s.planes[0];
    if (!plan || !s.fechaInicioFacturacion) continue;

    /* Los DRAFTS del motor, no las cuotas crudas: es la corrección que el plan pide, y acá
       ya importa — con las crudas, PAREJO y SUSCRIPCION darían falsos positivos. */
    let drafts;
    try {
      /* ⚠ SIN `as unknown as`. La primera versión de este script casteaba, escribió mal el
         nombre del campo de la fecha, y el motor devolvió CERO drafts para todos: cada cobro
         parecía «fuera del plan». El cast tapó justo el error que hacía falta ver. */
      const servicioInput: ServicioEngineInput = {
        id: s.id,
        montoTotal: Number(s.montoTotal),
        moneda: s.moneda as "CRC" | "USD",
        duracionMeses: s.duracionMeses,
        fechaInicioFacturacion: s.fechaInicioFacturacion.toISOString().slice(0, 10),
        diaCobroAncla: s.cuenta.diaCobroAncla,
      };
      const planInput: PlanEngineInput = {
        template: plan.template as PlanEngineInput["template"],
        numCuotas: plan.numCuotas,
        cuotas: plan.cuotas.map((q) => ({
          orden: q.orden,
          base: q.base as "PORCENTAJE" | "MONTO_FIJO",
          valor: Number(q.valor),
          offsetMeses: q.offsetMeses,
        })),
      };
      drafts = materializeCobros(servicioInput, planInput, { todayISO });
    } catch {
      continue; // un plan que el motor no puede materializar no es asunto de este feature
    }

    const pedido = new Map(drafts.map((d) => [d.numCuota, d.monto]));
    const conflictivos = s.cobros.filter((c) => {
      if (c.fechaEmision === null || c.numCuota === null) return false;
      const segunPlan = pedido.get(c.numCuota);
      return segunPlan === undefined || Math.abs(segunPlan - Number(c.monto)) > 0.01;
    });
    if (!conflictivos.length) continue;
    afectados++;
    filas.push(
      `  ${s.cuenta.client.name.padEnd(26)} ${conflictivos.length} cobro(s) · plan ${plan.template} · ` +
        conflictivos.map((c) => `#${c.numCuota} ${c.monto}${pedido.has(c.numCuota!) ? "≠" : " (fuera del plan)"}`).join(" · "),
    );
  }
  console.log(`  servicios con al menos un cobro facturado: ${servicios.length}`);
  console.log(`  ⚠ servicios donde el plan contradice una factura: ${afectados}`);
  for (const f of filas.slice(0, 25)) console.log(f);
  if (filas.length > 25) console.log(`     … y ${filas.length - 25} más`);

  /* ── D · autoría de facturación ya perdida ──────────────────────────────────── */
  titulo("D · facturas sin autoría (víctimas del revert destructivo actual)");

  const sinAutor = await prisma.cobro.count({ where: { fechaEmision: { not: null }, facturadoPor: null } });
  const conAutor = await prisma.cobro.count({ where: { fechaEmision: { not: null }, facturadoPor: { not: null } } });
  const alReves = await prisma.cobro.count({ where: { fechaEmision: null, facturadoPor: { not: null } } });
  console.log(`  facturados con autor: ${conAutor} · ⚠ sin autor: ${sinAutor} · ⛔ autor sin fecha: ${alReves}`);
  console.log(
    sinAutor + alReves === 0
      ? "  ✓ El invariante de autoría nace en VERDE."
      : "  ⚠ El invariante de autoría NACE EN ROJO. Hay que decirlo al agregarlo (hay precedente: INV16).",
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
