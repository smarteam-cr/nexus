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
 * FASE 2 (puertos + proyección + borrador):
 *   F) EMPRESA SIN PROYECTO — "Suscripciones Demo SA" vía AccountSource manual
 *                 (fuente=manual, idExterno demo-*): entra al panel con chip
 *                 "sin proyecto" + suscripción USD → alimenta la proyección.
 *   G) CONTEXTO DE BORRADOR — al escenario B se le agrega correoCobro + una
 *                 entrada de bitácora CORREO (hilo pegado) → el botón ✉ Borrador
 *                 genera con contexto real y el mailto tiene destino.
 *   H) DESCUADRE — servicio PERSONALIZADO en el escenario A cuyas cuotas NO
 *                 suman el montoTotal → alerta MONTOS_DESCUADRADOS en el corte.
 *   Además el primer COBRADO del escenario A lleva referenciaExterna (Mercury).
 *
 * Idempotente: salta clientes que ya tienen cuenta. Marca notas "[demo cobranza]"
 * y los Clients demo llevan sourceExternalId "demo-*". DRY-RUN por default;
 * escribe SOLO con --apply (local == PROD — el usuario revisa y aprueba).
 * LIMPIEZA: scripts/cleanup-cobranza-demo.ts (dry-run-first).
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
  addBitacora,
  updateCuenta,
} from "@/lib/cobranza/mutations";
import { ingestCuentasEntrantes } from "@/lib/cobranza/ingest";
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
  const creadas: Array<{ key: string; cuentaId: string }> = [];

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
    creadas.push({ key: esc.key, cuentaId: cuenta.id });

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
        await cambiarEstadoCobro(
          cobros[k].id,
          {
            estado: "COBRADO",
            // El primer COBRADO del escenario A lleva referencia externa (demo
            // del ReconciliationPort manual: id de transacción Mercury).
            ...(k === 0 && esc.key === "A-VERDE"
              ? { referenciaExterna: "MERCURY-TX-2026-0147-DEMO" }
              : {}),
          },
          SEED_EMAIL,
        );
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

  // ── FASE 2: empresa sin proyecto + contexto de borrador + descuadre ──────────
  console.log(`\n■ F-SIN-PROYECTO → empresa "Suscripciones Demo SA" (AccountSource manual, fuente=manual + idExterno demo-*)`);
  console.log(`   suscripción USD 450 mensual · correo de cobro · chip "sin proyecto" en el panel · alimenta la proyección`);
  console.log(`■ G-CONTEXTO → correoCobro + hilo de CORREO en la bitácora del escenario B (el botón ✉ Borrador genera con contexto real)`);
  console.log(`■ H-DESCUADRE → servicio PERSONALIZADO en el escenario A: vale $5.000 pero las cuotas suman $2.000 → alerta MONTOS_DESCUADRADOS en el corte`);

  if (APPLY) {
    // F — empresa sin proyecto vía el puerto (idempotente por fuente + idExterno).
    // Sin dominio a propósito: no toca el resolver de sesiones.
    const [f] = await ingestCuentasEntrantes(
      [
        {
          fuenteRef: { fuente: "manual", idExterno: "demo-cobranza-sin-proyecto" },
          clienteNombre: "Suscripciones Demo SA",
          dominio: null,
          correoCobro: "pagos@suscripcionesdemo.test",
          tipo: "INTERNACIONAL",
          viaCobro: "MERCURY",
          moneda: "USD",
          terminosPago: "ANTICIPADO",
          diaCobroAncla: 5,
          notas: MARK,
          suscripcion: { montoMensual: 450, moneda: "USD", fechaInicio: mesesDesdeHoy(-1) },
        },
      ],
      { byEmail: SEED_EMAIL, todayISO },
    );
    if (f.error) {
      console.log(`   ⤫ F falló: ${f.error}`);
    } else {
      const servF = await prisma.servicioContratado.findFirst({
        where: { cuentaId: f.cuentaId, tipoServicio: "SUSCRIPCION", estado: "ACTIVO" },
        select: { id: true },
      });
      if (servF) {
        const gen = await generateCobros(servF.id, SEED_EMAIL, todayISO);
        console.log(`   → F: empresa ${f.clientCreado ? "creada" : "ya existía (vinculada)"} · ${gen.created} cobros de suscripción generados`);
      }
    }

    // G — contexto de borrador sobre el escenario B.
    const b = creadas.find((c) => c.key === "B-AMARILLO");
    if (b) {
      await updateCuenta(b.cuentaId, { correoCobro: "facturacion@clinicademo.test" }, SEED_EMAIL);
      await addBitacora(
        b.cuentaId,
        {
          tipo: "CORREO",
          contenido: `${MARK} Hilo pegado a mano — Cliente (7 jul): "Buenas, ¿nos pueden mover el cobro de este mes para después del 20? Estamos cerrando el cambio de cuenta bancaria." Alex (7 jul): "Claro, lo coordinamos para el 22 sin recargo. Quedamos atentos."`,
        },
        SEED_EMAIL,
      );
      console.log("   → G: correoCobro + hilo de bitácora agregados al escenario B");
    } else {
      console.log("   ⤫ G salteado (el escenario B no se creó en esta corrida)");
    }

    // H — servicio descuadrado sobre el escenario A.
    const a = creadas.find((c) => c.key === "A-VERDE");
    if (a) {
      const servH = await createServicio(a.cuentaId, {
        tipoServicio: "SOPORTE",
        modalidad: "PROYECTO",
        montoTotal: 5000,
        moneda: "USD",
        fechaInicioFacturacion: mesesDesdeHoy(0),
        duracionMeses: null,
        projectId: null,
        descripcion: `${MARK} H-DESCUADRE soporte anual`,
      });
      await setPlanActivo(servH.id, {
        template: "PERSONALIZADO",
        numCuotas: null,
        cuotas: [
          { orden: 1, base: "MONTO_FIJO", valor: 1000, offsetMeses: 0 },
          { orden: 2, base: "MONTO_FIJO", valor: 1000, offsetMeses: 1 },
        ],
        notas: MARK,
      });
      // FASE 3: el guardarraíl de montos FRENA la materialización de planes
      // descuadrados (409) — ese ES el demo: apretar "Generar cobros" y ver el
      // error claro. El servicio queda sin cobros a propósito.
      try {
        await generateCobros(servH.id, SEED_EMAIL, todayISO);
        console.log("   ⚠ H: generateCobros NO frenó el plan descuadrado — revisá el guardarraíl.");
      } catch (e) {
        console.log(
          `   → H: servicio descuadrado creado (suma $2.000 de $5.000); guardarraíl activo: "${e instanceof Error ? e.message : e}"`,
        );
      }
    } else {
      console.log("   ⤫ H salteado (el escenario A no se creó en esta corrida)");
    }
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado" : "Dry-run"}: ${Math.min(candidatos.length, escenarios.length)} escenario(s) base + fase 2.${APPLY ? " Corré el corte (botón del tab Digest) para ver las alertas, y mirá el tab Proyección." : " Corré con --apply para escribir."}\nLimpieza posterior: npx tsx scripts/cleanup-cobranza-demo.ts (dry-run) → --apply`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
