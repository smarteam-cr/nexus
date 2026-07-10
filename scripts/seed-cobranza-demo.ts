/**
 * scripts/seed-cobranza-demo.ts
 *
 * Siembra data de DEMO para el módulo Cobranza sobre clientes REALES con proyecto
 * activo (los primeros 4 sin cuenta configurada). Produce los 4 colores del
 * semáforo + 1 catch-up + 1 divergencia de arranque — lo que el demo necesita y
 * el UI no debería facilitar crear (fechas retrodatadas).
 *
 * Escenarios:
 *   A) VERDE    — implementación PAREJO 3 cuotas, arranque hace 3 meses; se generan
 *                 los cobros y se confirman los 2 primeros como COBRADO (vía el
 *                 chokepoint cambiarEstadoCobro → INV3 satisfecho).
 *   B) AMARILLO — suscripción mensual, arranque hace 1 mes; el cobro del período
 *                 actual queda POR_COBRAR.
 *   C) ROJO + CATCH-UP — implementación PAREJO 4 cuotas, arranque hace 2 meses
 *                 (caso Teamnet): el generador crea catch-ups vencidos + alerta.
 *   D) GRIS     — implementación ENTRADA_Y_RESTO con arranque el mes que viene.
 *   E) DIVERGENCIA — si el proyecto del escenario A tiene anchorStartDate, la
 *                 fechaInicioFacturacion del servicio se corre 1 mes → alerta
 *                 ARRANQUE_CAMBIADO en el próximo corte. (No toca el cronograma.)
 *
 * Idempotente: salta clientes que ya tienen cuenta. Marca notas "[demo cobranza]"
 * para limpieza posterior. DRY-RUN por default; escribe SOLO con --apply
 * (invariante 3: local == PROD — el usuario revisa y aprueba).
 *
 * Uso:
 *   npx tsx scripts/seed-cobranza-demo.ts            # dry-run
 *   npx tsx scripts/seed-cobranza-demo.ts --apply    # aplica
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";
import {
  createCuenta,
  createServicio,
  setPlanActivo,
  generateCobros,
  cambiarEstadoCobro,
} from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";

const APPLY = process.argv.includes("--apply");
const SEED_EMAIL = "seed-cobranza-demo";
const MARK = "[demo cobranza]";

/** ISO (YYYY-MM-DD) de hoy CR desplazado en meses (día clampeado por Date.UTC). */
function mesesDesdeHoy(delta: number): string {
  const { dateKey } = crDateParts(new Date());
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, Math.min(d, 28)));
  return target.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}\n`);

  // Clientes con proyecto REAL (filtro canónico) y SIN cuenta configurada.
  const projects = await prisma.project.findMany({
    where: {
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
      AND: [
        {
          OR: [
            { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
            { hubspotServiceId: { not: null } },
          ],
        },
        { client: { isProspect: false, cuentaFinanciera: { is: null } } },
      ],
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      client: { select: { name: true } },
      timeline: { select: { anchorStartDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const porCliente = new Map<string, (typeof projects)[number]>();
  for (const p of projects) if (!porCliente.has(p.clientId)) porCliente.set(p.clientId, p);
  const candidatos = [...porCliente.values()].slice(0, 4);

  if (candidatos.length < 4) {
    console.log(`⚠ Solo ${candidatos.length} cliente(s) sin cuenta disponibles — se siembran los que haya.`);
  }

  const escenarios = [
    { key: "A-VERDE", tipo: "IMPLEMENTACION" as const, moneda: "USD" as const, monto: 6000, inicio: mesesDesdeHoy(-3), plan: "PAREJO" as const, numCuotas: 3, cobrar: 2, divergencia: true },
    { key: "B-AMARILLO", tipo: "SUSCRIPCION" as const, moneda: "USD" as const, monto: 800, inicio: mesesDesdeHoy(-1), plan: "SUSCRIPCION" as const, numCuotas: null, cobrar: 1, porCobrar: 1, divergencia: false },
    { key: "C-ROJO+CATCHUP", tipo: "IMPLEMENTACION" as const, moneda: "CRC" as const, monto: 2_400_000, inicio: mesesDesdeHoy(-2), plan: "PAREJO" as const, numCuotas: 4, cobrar: 0, divergencia: false },
    { key: "D-GRIS", tipo: "WEB" as const, moneda: "USD" as const, monto: 3000, inicio: mesesDesdeHoy(1), plan: "ENTRADA_Y_RESTO" as const, numCuotas: 2, cobrar: 0, divergencia: false },
  ];

  const todayISO = crDateParts(new Date()).dateKey;

  for (let i = 0; i < candidatos.length; i++) {
    const cliente = candidatos[i];
    const esc = escenarios[i];
    if (!esc) break;

    console.log(`\n■ ${esc.key} → cliente "${cliente.client.name}" (proyecto "${cliente.name}")`);
    console.log(
      `   servicio ${esc.tipo} · ${esc.moneda} ${esc.monto.toLocaleString("es-CR")} · plan ${esc.plan}${esc.numCuotas ? ` x${esc.numCuotas}` : ""} · arranque ${esc.inicio}${esc.cobrar ? ` · ${esc.cobrar} cuota(s) a COBRADO` : ""}${esc.divergencia && cliente.timeline?.anchorStartDate ? " · fechaInicio divergida del anchor (+1 mes)" : ""}`,
    );
    if (!APPLY) continue;

    const { cuenta, created } = await createCuenta({
      clientId: cliente.clientId,
      tipo: esc.moneda === "USD" ? "INTERNACIONAL" : "NACIONAL",
      viaCobro: esc.moneda === "USD" ? "MERCURY" : "ODOO",
      moneda: esc.moneda,
      terminosPago: "ANTICIPADO",
      diaCobroAncla: null,
      notas: MARK,
    });
    if (!created) {
      // createCuenta es get-or-create: si la cuenta apareció entre el query de
      // candidatos y acá, NO se le siembra data demo encima (guard duro).
      console.log("   ⤫ el cliente ganó una cuenta en el medio — escenario salteado.");
      continue;
    }

    // Divergencia (escenario A): si el proyecto tiene anchor, la facturación se
    // configura 1 mes DESPUÉS → el corte emite ARRANQUE_CAMBIADO. Sin tocar el cronograma.
    const inicio = esc.divergencia && cliente.timeline?.anchorStartDate ? mesesDesdeHoy(-2) : esc.inicio;

    const servicio = await createServicio(cuenta.id, {
      tipoServicio: esc.tipo,
      modalidad: esc.plan === "SUSCRIPCION" ? "RECURRENTE" : "PROYECTO",
      montoTotal: esc.monto,
      moneda: esc.moneda,
      fechaInicioFacturacion: inicio,
      duracionMeses: esc.numCuotas,
      projectId: esc.divergencia ? cliente.id : null,
      descripcion: `${MARK} ${esc.key}`,
    });

    await setPlanActivo(servicio.id, {
      template: esc.plan,
      numCuotas: esc.numCuotas,
      cuotas:
        esc.plan === "ENTRADA_Y_RESTO"
          ? [{ orden: 1, base: "PORCENTAJE", valor: 50, offsetMeses: 0, descripcion: "Entrada 50%" }]
          : [],
      notas: MARK,
    });

    const gen = await generateCobros(servicio.id, SEED_EMAIL, todayISO);
    console.log(`   → generados: ${gen.created} (${gen.catchUp} catch-up)`);

    // Confirmar cuotas como COBRADO vía el chokepoint (INV3: confirmadoPor queda seteado).
    if (esc.cobrar > 0) {
      const cobros = await prisma.cobro.findMany({
        where: { servicioId: servicio.id },
        orderBy: { numCuota: "asc" },
        take: esc.cobrar + (esc.porCobrar ?? 0),
      });
      for (let k = 0; k < esc.cobrar && k < cobros.length; k++) {
        await cambiarEstadoCobro(cobros[k].id, { estado: "COBRADO" }, SEED_EMAIL);
      }
      if (esc.porCobrar) {
        const siguiente = cobros[esc.cobrar];
        if (siguiente) await cambiarEstadoCobro(siguiente.id, { estado: "POR_COBRAR" }, SEED_EMAIL);
      }
      console.log(`   → ${esc.cobrar} COBRADO${esc.porCobrar ? ` + ${esc.porCobrar} POR_COBRAR` : ""}`);
    }

    await prisma.cuentaFinanciera.update({
      where: { id: cuenta.id },
      data: { estadoCuenta: "ACTIVA" },
    });
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado" : "Dry-run"}: ${Math.min(candidatos.length, escenarios.length)} escenario(s).${APPLY ? " Corré el corte (POST /api/cobranza/digest o el botón) para ver las alertas." : " Corré con --apply para escribir."}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
