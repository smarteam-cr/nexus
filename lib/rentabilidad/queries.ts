/**
 * lib/rentabilidad/queries.ts — el margen de cada cuenta en un período. SERVER-ONLY y SOLO DIRECCIÓN.
 *
 * Junta la planilla (lo pagado en el libro y, si no hay, el salario registrado), las horas con clientes (las mismas
 * lecturas que la carga de CS) y lo cobrado o facturado a cada cuenta. Todo en dólares, con la tasa del BCCR de cada
 * mes (`convertir`, lib/finanzas/equilibrio.ts): un monto sin tasa no se adivina, se avisa.
 *
 * ⛔ Lleva montos de planilla: solo lo leen pantallas con `isCostosRole` (costos-privacy, P4). Nunca muestra el
 * salario de una persona: la planilla se usa entera, para el costo de la hora.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { convertir, tipoIngresoDeCobro, type MonedaEq, type TasaDeMes } from "@/lib/finanzas/equilibrio";
import { cargarTasasDelAnio } from "@/lib/finanzas/tipo-cambio-server";
import { leerTratosAbiertos } from "@/lib/hubspot/tratos-abiertos";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import type { TratoParaProyectar } from "@/lib/carga/contratacion";
import { entregaEstimada, planDelPeriodo } from "@/lib/carga/entrega";
import {
  aCronogramas,
  cargarConfigCarga,
  cseDeLaCuenta,
  factoresDeComplejidad,
  leerCronogramasDeCartera,
  leerCuentasDeCartera,
  leerEquipo,
  leerReuniones,
  ultimaReunionPorCliente,
} from "@/lib/carga/queries";
import { tiempoEnReuniones } from "@/lib/carga/reuniones";
import { lunesDe } from "@/lib/carga/semana";
import {
  conAguinaldo,
  costoDeLaHora,
  costoDelMes,
  horasPagadas,
  rangoDelPeriodo,
  type CostoDeLaHora,
  type CuentaParaMargen,
  type FuenteDelCosto,
  type Periodo,
  type TotalesDelPeriodo,
} from "./margen";

export interface DatosDeRentabilidad {
  rango: { periodo: Periodo; meses: string[]; etiqueta: string };
  totales: TotalesDelPeriodo;
  costoDeLaHora: CostoDeLaHora;
  cuentas: CuentaParaMargen[];
  personas: { conCosto: number; sinCosto: string[]; fuentes: Record<FuenteDelCosto, number> };
  /** Lo que no se pudo medir o convertir, dicho. */
  avisos: string[];
  preparacionMin: number;
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const periodoCr = (d: Date) => {
  const x = new Date(+d - 6 * 3_600_000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function cargarRentabilidad(periodo: Periodo, ahora = new Date()): Promise<DatosDeRentabilidad> {
  const rango = rangoDelPeriodo(periodo, ahora);
  const hoyISO = new Date(+ahora - 6 * 3_600_000).toISOString().slice(0, 10);
  const anios = [...new Set(rango.meses.map((m) => Number(m.slice(0, 4))))];

  const [configuracion, miembros, { reuniones }, cronogramasDb, cuentasDb, pagos, salarios, cobros, facturas, tasasPorAnio] = await Promise.all([
    cargarConfigCarga(),
    leerEquipo(),
    leerReuniones(rango.desde, rango.hasta),
    leerCronogramasDeCartera(),
    leerCuentasDeCartera(),
    prisma.pagoPlanilla.findMany({
      where: { periodo: { in: rango.meses }, sujetoTeamMemberId: { not: null } },
      select: { sujetoTeamMemberId: true, periodo: true, quincena: true, monto: true, moneda: true },
    }),
    prisma.costoRecurrente.findMany({
      where: { categoria: "SALARIO", teamMemberId: { not: null } },
      select: { teamMemberId: true, monto: true, moneda: true, frecuencia: true, activo: true, finalizadoEl: true, updatedAt: true },
    }),
    prisma.cobro.findMany({
      where: {
        OR: [
          { fechaCobro: { gte: rango.desde, lt: rango.hasta } },
          { fechaEmision: { gte: rango.desde, lt: rango.hasta } },
          { periodo: { in: rango.meses } },
        ],
      },
      select: {
        estado: true,
        periodo: true,
        fechaProgramada: true,
        fechaEmision: true,
        fechaCobro: true,
        monto: true,
        moneda: true,
        cuenta: { select: { clientId: true, creditoDias: true, client: { select: { name: true, kind: true } } } },
      },
    }),
    prisma.facturaOdoo.findMany({
      where: { moveType: "out_invoice", state: "posted", cuentaId: { not: null }, invoiceDate: { gte: rango.desde, lt: rango.hasta } },
      select: { invoiceDate: true, montoNeto: true, moneda: true, cuenta: { select: { clientId: true, client: { select: { name: true, kind: true } } } } },
    }),
    Promise.all(anios.map((a) => cargarTasasDelAnio(a, hoyISO))),
  ]);
  const config = configuracion.config;
  const tasaDe = new Map<string, TasaDeMes>(tasasPorAnio.flatMap((t) => t.tasas).map((t) => [t.periodo, t]));
  const aDolares = (monto: number, moneda: string, periodoDelMonto: string) => convertir(monto, moneda as MonedaEq, "USD", tasaDe.get(periodoDelMonto) ?? null)?.monto ?? null;
  const avisos: string[] = [];
  const mesesSinTasa = rango.meses.filter((m) => !tasaDe.has(m));
  if (mesesSinTasa.length) avisos.push(`Sin tipo de cambio para ${mesesSinTasa.join(", ")}: lo que está en colones esos meses no se pudo convertir.`);

  // ── La planilla del período, en dólares ──
  const fuentes: Record<FuenteDelCosto, number> = { libro: 0, "libro-media": 0, "costo-recurrente": 0 };
  const costoPorPersona = new Map<string, number>();
  let noConvertido = 0;
  for (const m of miembros) {
    const salario =
      salarios
        .filter((s) => s.teamMemberId === m.id)
        .sort((a, b) => Number(b.activo) - Number(a.activo) || +b.updatedAt - +a.updatedAt)
        .map((s) => ({ monto: Number(s.monto), moneda: s.moneda as MonedaEq, frecuencia: s.frecuencia, finalizadoEl: s.finalizadoEl }))[0] ?? null;
    let total = 0;
    for (const mes of rango.meses) {
      const c = costoDelMes({
        periodo: mes,
        pagos: pagos.filter((p) => p.sujetoTeamMemberId === m.id && p.periodo === mes).map((p) => ({ quincena: p.quincena, monto: Number(p.monto), moneda: p.moneda as MonedaEq })),
        salario,
        alta: m.createdAt,
        baja: m.deactivatedAt,
      });
      if (!c) continue;
      const usd = aDolares(c.monto, c.moneda, mes);
      if (usd === null) {
        noConvertido++;
        continue;
      }
      fuentes[c.fuente]++;
      total += conAguinaldo(usd);
    }
    if (total > 0) costoPorPersona.set(m.id, total);
  }
  if (noConvertido) avisos.push(`${noConvertido} meses de planilla en colones quedaron fuera por no tener tipo de cambio.`);
  const planilla = [...costoPorPersona.values()].reduce((a, x) => a + x, 0);
  const horasPagadasTotal = miembros
    .filter((m) => costoPorPersona.has(m.id))
    .reduce((a, m) => a + horasPagadas(config.personas[norm(m.email)]?.horasContrato ?? config.capacidad.horasContrato, rango, m.createdAt, m.deactivatedAt), 0);
  const sinCosto = miembros
    .filter((m) => !costoPorPersona.has(m.id) && (!m.deactivatedAt || m.deactivatedAt > rango.desde) && m.createdAt < rango.hasta && !/\btest\b/i.test(m.name))
    .map((m) => m.name);

  // ── Las horas con clientes ──
  const csEmails = miembros.filter((m) => m.roleEnum === "CSE" || m.roleEnum === "CSL").map((m) => m.email);
  const tiempo = tiempoEnReuniones(
    reuniones,
    miembros.map((m) => ({ email: norm(m.email), nombre: m.name, baja: m.deactivatedAt })),
    csEmails,
  );
  const ultimaPorCliente = await ultimaReunionPorCliente(cuentasDb.map((c) => c.id), ahora);
  const factores = factoresDeComplejidad(cuentasDb, ultimaPorCliente, config, ahora);
  const factorDe = (id: string) => factores.get(id)?.factor ?? 1;
  const cronogramas = aCronogramas(cronogramasDb);
  const entrega = entregaEstimada(cronogramas, factorDe, config, ahora);
  const primerLunes = lunesDe(rango.desde);
  const ultimoLunes = lunesDe(rango.hasta);
  const entregaPorCliente = new Map<string, number>();
  for (const [, semanas] of entrega.porPersona) {
    for (const [lunes, s] of semanas) {
      if (lunes < primerLunes || lunes >= ultimoLunes) continue;
      for (const [id, h] of s.porCliente) entregaPorCliente.set(id, (entregaPorCliente.get(id) ?? 0) + h);
    }
  }
  const plan = planDelPeriodo(cronogramas, factorDe, config, rango.desde, rango.hasta);

  // ── Lo cobrado o facturado ──
  const ingresoCobranza = new Map<string, number>();
  const nombreDe = new Map<string, string>();
  const meses = new Set(rango.meses);
  for (const c of cobros) {
    if (c.cuenta.client.kind !== "CLIENTE") continue;
    const imp = tipoIngresoDeCobro(
      {
        estado: c.estado,
        periodo: c.periodo,
        fechaProgramadaISO: c.fechaProgramada.toISOString().slice(0, 10),
        fechaEmisionISO: c.fechaEmision ? c.fechaEmision.toISOString().slice(0, 10) : null,
        fechaCobroISO: c.fechaCobro ? c.fechaCobro.toISOString().slice(0, 10) : null,
        creditoDias: c.cuenta.creditoDias,
      },
      hoyISO,
    );
    if (imp.tipo === "PROGRAMADO" || !meses.has(imp.periodo)) continue;
    const usd = aDolares(Number(c.monto), c.moneda, imp.periodo);
    if (usd === null) continue;
    ingresoCobranza.set(c.cuenta.clientId, (ingresoCobranza.get(c.cuenta.clientId) ?? 0) + usd);
    nombreDe.set(c.cuenta.clientId, c.cuenta.client.name);
  }
  const ingresoOdoo = new Map<string, number>();
  for (const f of facturas) {
    const id = f.cuenta?.clientId;
    if (!id || f.cuenta?.client.kind !== "CLIENTE" || ingresoCobranza.has(id)) continue;
    const usd = aDolares(Number(f.montoNeto), f.moneda, periodoCr(f.invoiceDate));
    if (usd === null) continue;
    ingresoOdoo.set(id, (ingresoOdoo.get(id) ?? 0) + usd);
    nombreDe.set(id, f.cuenta.client.name);
  }
  if (ingresoOdoo.size) {
    avisos.push(
      ingresoOdoo.size === 1
        ? "1 cuenta sin cobros en Nexus en el período toma lo facturado en Odoo."
        : `${ingresoOdoo.size} cuentas sin cobros en Nexus en el período toman lo facturado en Odoo.`,
    );
  }

  // ── Las cuentas ──
  const deBaja = new Map(miembros.filter((m) => m.deactivatedAt).map((m) => [norm(m.email), m.name]));
  const cuentaDb = new Map(cuentasDb.map((c) => [c.id, c]));
  for (const c of cuentasDb) nombreDe.set(c.id, c.name);
  for (const [id, v] of tiempo.porCuenta) if (!nombreDe.has(id)) nombreDe.set(id, v.nombre);
  const ids = new Set([...tiempo.porCuenta.keys(), ...ingresoCobranza.keys(), ...ingresoOdoo.keys()]);
  let horasDeReunion = 0;
  let reunionesTotal = 0;
  const cuentas: CuentaParaMargen[] = [...ids].map((id) => {
    const vista = tiempo.porCuenta.get(id);
    let reunionesH = 0;
    let preparacion = 0;
    for (const [, pp] of vista?.porPersona ?? []) {
      reunionesH += pp.minutos / 60;
      preparacion += (pp.reuniones * config.preparacionMin) / 60;
    }
    horasDeReunion += reunionesH + preparacion;
    reunionesTotal += vista?.reuniones ?? 0;
    const db = cuentaDb.get(id);
    const cse = db ? cseDeLaCuenta(db, deBaja) : null;
    const p = plan.get(id);
    const ingreso = ingresoCobranza.get(id) ?? ingresoOdoo.get(id) ?? 0;
    return {
      clienteId: id,
      nombre: nombreDe.get(id) ?? "Cuenta",
      cse: cse?.nombre ?? (cse?.deBaja ? `Sin CSE (era de ${cse.deBaja})` : null),
      ingreso,
      fuenteDelIngreso: ingresoCobranza.has(id) ? "Cobranza" : ingresoOdoo.has(id) ? "Odoo" : null,
      horas: { reuniones: reunionesH, preparacion, entrega: entregaPorCliente.get(id) ?? 0 },
      reuniones: vista?.reuniones ?? 0,
      plan: p && (p.sesiones > 0 || p.horasTareas > 0) ? p : null,
    };
  });
  const horasConClientes = cuentas.reduce((a, c) => a + c.horas.reuniones + c.horas.preparacion + c.horas.entrega, 0);
  const totales: TotalesDelPeriodo = {
    planilla,
    horasPagadas: horasPagadasTotal,
    horasConClientes,
    ingreso: cuentas.reduce((a, c) => a + c.ingreso, 0),
    horasPorSesion: reunionesTotal > 0 ? horasDeReunion / reunionesTotal : 0,
  };
  if (sinCosto.length) {
    avisos.push(
      sinCosto.length === 1
        ? `${sinCosto[0]} no tiene planilla ni salario registrado en el período: su costo no entra.`
        : `${sinCosto.length} personas del equipo no tienen planilla ni salario registrado en el período (${sinCosto.join(", ")}): su costo no entra.`,
    );
  }

  return {
    rango: { periodo, meses: rango.meses, etiqueta: rango.etiqueta },
    totales,
    costoDeLaHora: costoDeLaHora(totales),
    cuentas,
    personas: { conCosto: costoPorPersona.size, sinCosto, fuentes },
    avisos,
    preparacionMin: config.preparacionMin,
  };
}

// ── El pipeline, para la contratación ────────────────────────────────────────

const tratosEnCache = unstable_cache(leerTratosAbiertos, ["rentabilidad-tratos-abiertos"], { revalidate: 600 });

/** Los tratos abiertos de venta propia, marcando cuáles son de una empresa que ya es cliente. Null si HubSpot falla. */
export async function cargarPipelineParaContratar(): Promise<{ tratos: TratoParaProyectar[]; error: string | null }> {
  try {
    const [tratos, clientes] = await Promise.all([
      tratosEnCache(),
      prisma.client.findMany({ where: { ...CS_CLIENT_WHERE, hubspotCompanyId: { not: null } }, select: { hubspotCompanyId: true } }),
    ]);
    const deClientes = new Set(clientes.map((c) => c.hubspotCompanyId));
    return {
      tratos: tratos.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        pipeline: t.pipelineNombre,
        probabilidad: t.probabilidad,
        cierre: t.cierre,
        esClienteActual: !!t.hubspotCompanyId && deClientes.has(t.hubspotCompanyId),
      })),
      error: null,
    };
  } catch (e) {
    console.error("[rentabilidad] no se pudo leer el pipeline de HubSpot:", e instanceof Error ? e.message : e);
    return { tratos: [], error: "No se pudo leer el pipeline de HubSpot." };
  }
}
