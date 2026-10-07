/**
 * lib/finanzas/gastos-mercury-server.ts — lee lo que necesita el cruce de gastos contra Mercury (2026-10-06).
 * Server-only. Las reglas viven en gastos-mercury.ts; esto solo lee la copia de Mercury y los gastos de Nexus.
 *
 * ⛔ Solo los cargos de TARJETA y la suscripción de Mercury: las transferencias (planilla, proveedores) ni se leen. Lo
 * ve quien tiene `gastos.read` (la página lo verifica antes de llamar).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EGRESOS_DESDE_NEXUS } from "./gastos";
import { cargoDeTarjeta, gastosContraMercury, type CargoDeTarjeta, type GastosContraMercury } from "./gastos-mercury";

const TIPOS_DE_CARGO = ["creditCardTransaction", "debitCardTransaction", "billingEngineSubscriptionFee"];

export async function cargarGastosContraMercury(hoyISO: string): Promise<GastosContraMercury> {
  // Cuatro meses atrás alcanzan para «dos de los últimos tres» y para los 60 días sin cargo.
  const [y, m] = hoyISO.slice(0, 7).split("-").map(Number) as [number, number];
  const desdeLectura = new Date(Date.UTC(y, m - 1 - 4, 1));
  const [movs, recurrentes, gastos] = await Promise.all([
    prisma.movimientoMercury.findMany({
      where: {
        estadoEspejo: "VIGENTE",
        monto: { lt: 0 },
        tipo: { in: TIPOS_DE_CARGO },
        OR: [{ posteadoEn: { gte: desdeLectura } }, { posteadoEn: null, creadoEnMercury: { gte: desdeLectura } }],
      },
      select: { id: true, monto: true, estado: true, tipo: true, contraparteNombre: true, posteadoEn: true, creadoEnMercury: true },
    }),
    prisma.costoRecurrente.findMany({
      where: { categoria: { in: ["HERRAMIENTA", "FIJO_OPERACION"] }, activo: true, finalizadoEl: null },
      select: { id: true, nombre: true, categoria: true, monto: true, moneda: true, frecuencia: true },
    }),
    prisma.gastoPuntual.findMany({
      where: { fecha: { gte: new Date(`${EGRESOS_DESDE_NEXUS}-01T00:00:00Z`) } },
      select: { id: true, nombre: true, monto: true, moneda: true, fecha: true },
    }),
  ]);

  const cargos = movs
    .map((x) =>
      cargoDeTarjeta({
        id: x.id,
        monto: Number(x.monto),
        estado: x.estado,
        tipo: x.tipo,
        contraparteNombre: x.contraparteNombre,
        fechaISO: (x.posteadoEn ?? x.creadoEnMercury).toISOString().slice(0, 10),
      }),
    )
    .filter((c): c is CargoDeTarjeta => c !== null);

  return gastosContraMercury({
    cargos,
    recurrentes: recurrentes.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      monto: Number(r.monto),
      moneda: r.moneda,
      frecuencia: r.frecuencia === "ANUAL" ? "ANUAL" : "MENSUAL",
    })),
    gastos: gastos.map((g) => ({ id: g.id, nombre: g.nombre, monto: Number(g.monto), moneda: g.moneda, fechaISO: g.fecha.toISOString().slice(0, 10) })),
    hoyISO,
    desde: EGRESOS_DESDE_NEXUS,
  });
}
