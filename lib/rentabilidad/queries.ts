/**
 * lib/rentabilidad/queries.ts — el margen de cada cuenta en un período. SERVER-ONLY y SOLO DIRECCIÓN (SUPER_ADMIN,
 * lib/rentabilidad/acceso.ts: la CSL la veía del 2026-10-06 al 2026-10-07).
 *
 * Junta la planilla (lo pagado en el libro y, si no hay, el salario registrado), las horas con clientes (las mismas
 * lecturas que la carga de CS) y lo cobrado o facturado a cada cuenta. Todo en dólares, con la tasa del BCCR de cada
 * mes (`convertir`, lib/finanzas/equilibrio.ts): un monto sin tasa no se adivina, se avisa.
 *
 * ⛔ Lleva montos de planilla y el costo de la hora de cada persona (decisión de Elías del 2026-10-07: el costo directo
 * es el de cada persona, y se puede ver por equipo). Solo lo leen las pantallas de dirección (`veRentabilidad`,
 * lib/rentabilidad/acceso.ts). El salario mensual de nadie aparece: solo su costo por hora.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { familiaDe, familiaPorClave } from "@/lib/tiempos/familias";
import { ETIQUETA_DE_TIPO } from "@/lib/carga/config";
import type { FactorExplicado } from "@/lib/carga/complejidad";
import { convertir, tipoIngresoDeCobro, type MonedaEq, type TasaDeMes } from "@/lib/finanzas/equilibrio";
import { cargarTasasDelAnio } from "@/lib/finanzas/tipo-cambio-server";
import { tasaDelDia } from "@/lib/finanzas/tipo-cambio";
import { leerTratosAbiertos } from "@/lib/hubspot/tratos-abiertos";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import type { TratoParaProyectar } from "@/lib/carga/contratacion";
import { entregaEstimada, planDelPeriodo } from "@/lib/carga/entrega";
import {
  aCronogramas,
  cargarConfigCarga,
  cseDeLaCuenta,
  factoresDeComplejidad,
  factoresDeLasCuentas,
  leerCronogramasDeCartera,
  leerCuentasDeCartera,
  leerEquipo,
  leerReuniones,
  leerTiemposDeclarados,
  nivelesDeEscala,
  ultimaReunionPorCliente,
} from "@/lib/carga/queries";
import { tiempoEnReuniones } from "@/lib/carga/reuniones";
import { lunesDe } from "@/lib/carga/semana";
import {
  conAguinaldo,
  costoDeLaHora,
  costoDelMes,
  EQUIPO_DEL_ROL,
  filaDeMargen,
  horasPagadas,
  rangoDelMes,
  rangoDelPeriodo,
  type FilaDeMargen,
  type ModoDeCosto,
  type CostoDeLaHora,
  type RangoDelPeriodo,
  type CuentaParaMargen,
  type FuenteDelCosto,
  type Periodo,
  type TotalesDelPeriodo,
} from "./margen";

export interface CostoDeUnaPersona {
  id: string;
  email: string;
  nombre: string;
  equipo: string;
  /** Planilla de la persona en el período, en dólares, con la reserva de aguinaldo. */
  planilla: number;
  horasPagadas: number;
  /** planilla ÷ horas pagadas. null sin planilla ni salario en el período. */
  costoHora: number | null;
  horasConClientes: number;
  fuente: FuenteDelCosto | null;
}

export interface CostoDeUnEquipo {
  equipo: string;
  personas: number;
  planilla: number;
  horasPagadas: number;
  costoHora: number | null;
  horasConClientes: number;
  /** horas con clientes ÷ horas pagadas, de 0 a 1. */
  parteConClientes: number | null;
}

export interface HorasPorOrigen {
  /** Reuniones del calendario (lo agendado, hasta tener la asistencia de Meet). */
  calendario: number;
  /** Entrega respondida en «¿cuánto te tomó?». */
  declaradas: number;
  /** Preparación y entrega sin respuesta. */
  estimadas: number;
}

export interface DatosDeRentabilidad {
  rango: { periodo: Periodo; meses: string[]; etiqueta: string };
  totales: TotalesDelPeriodo;
  costoDeLaHora: CostoDeLaHora;
  cuentas: CuentaParaMargen[];
  personas: { conCosto: number; sinCosto: string[]; fuentes: Record<FuenteDelCosto, number> };
  /** El costo de la hora de cada persona y de cada equipo. ⛔ Solo dirección: esta página ya lo es. */
  costos: { personas: CostoDeUnaPersona[]; equipos: CostoDeUnEquipo[] };
  horasPorOrigen: HorasPorOrigen;
  /** Lo que no se pudo medir o convertir, dicho. */
  avisos: string[];
  preparacionMin: number;
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const periodoCr = (d: Date) => {
  const x = new Date(+d - 6 * 3_600_000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};
const diaCr = (d: Date) => new Date(+d - 6 * 3_600_000).toISOString().slice(0, 10);

export async function cargarRentabilidad(periodo: Periodo, ahora = new Date()): Promise<DatosDeRentabilidad> {
  return cargarRentabilidadDelRango(rangoDelPeriodo(periodo, ahora), ahora);
}

/**
 * El margen de las cuentas en un rango de meses cerrados. Cada cobro, factura y quincena de planilla en colones se pasa
 * a dólares con el tipo de cambio de SU DÍA (`tasaDelDia`, hasta una semana atrás); sin el del día, con el del mes. Un
 * monto sin ninguna de las dos no se adivina: se avisa.
 */
export async function cargarRentabilidadDelRango(rango: RangoDelPeriodo, ahora = new Date()): Promise<DatosDeRentabilidad> {
  const periodo = rango.periodo;
  const hoyISO = new Date(+ahora - 6 * 3_600_000).toISOString().slice(0, 10);
  const anios = [...new Set(rango.meses.map((m) => Number(m.slice(0, 4))))];

  const [configuracion, miembros, { reuniones }, cronogramasDb, cuentasDb, pagos, salarios, cobros, facturas, tasasPorAnio, declarados] = await Promise.all([
    cargarConfigCarga(),
    leerEquipo(),
    leerReuniones(rango.desde, rango.hasta),
    leerCronogramasDeCartera(),
    leerCuentasDeCartera(),
    prisma.pagoPlanilla.findMany({
      where: { periodo: { in: rango.meses }, sujetoTeamMemberId: { not: null } },
      select: { sujetoTeamMemberId: true, periodo: true, quincena: true, monto: true, moneda: true, fechaPago: true, fechaProgramada: true },
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
    leerTiemposDeclarados(),
  ]);
  const config = configuracion.config;
  const tasaDe = new Map<string, TasaDeMes>(tasasPorAnio.flatMap((t) => t.tasas).map((t) => [t.periodo, t]));
  const diarias = new Map<string, number>(tasasPorAnio.flatMap((t) => [...t.tasasDiarias.entries()]));
  /** A dólares con la tasa del día (o, sin ella, la del mes del monto). */
  const aDolares = (monto: number, moneda: string, periodoDelMonto: string, diaISO?: string | null) => {
    if (moneda === "USD") return monto;
    const delDia = diaISO ? tasaDelDia(diarias, diaISO) : null;
    const tasa: TasaDeMes | null = delDia ? { periodo: periodoDelMonto, crcPorUsd: delDia.venta, fuente: "BCCR del día" } : (tasaDe.get(periodoDelMonto) ?? null);
    return convertir(monto, moneda as MonedaEq, "USD", tasa)?.monto ?? null;
  };
  const avisos: string[] = [];
  const mesesSinTasa = rango.meses.filter((m) => !tasaDe.has(m));
  if (mesesSinTasa.length) avisos.push(`Sin tipo de cambio para ${mesesSinTasa.join(", ")}: lo que está en colones esos meses no se pudo convertir.`);

  // ── La planilla del período, en dólares, por persona ──
  const fuentes: Record<FuenteDelCosto, number> = { libro: 0, "libro-media": 0, "costo-recurrente": 0 };
  const costoPorPersona = new Map<string, number>();
  const fuenteDe = new Map<string, FuenteDelCosto>();
  let noConvertido = 0;
  for (const m of miembros) {
    const salario =
      salarios
        .filter((s) => s.teamMemberId === m.id)
        .sort((a, b) => Number(b.activo) - Number(a.activo) || +b.updatedAt - +a.updatedAt)
        .map((s) => ({ monto: Number(s.monto), moneda: s.moneda as MonedaEq, frecuencia: s.frecuencia, finalizadoEl: s.finalizadoEl }))[0] ?? null;
    let total = 0;
    for (const mes of rango.meses) {
      // Cada quincena del libro, a dólares con la tasa del día en que se pagó (o se iba a pagar).
      const delMes = pagos.filter((p) => p.sujetoTeamMemberId === m.id && p.periodo === mes);
      const enDolares = delMes.map((p) => ({ quincena: p.quincena, monto: aDolares(Number(p.monto), p.moneda, mes, diaCr(p.fechaPago ?? p.fechaProgramada)) }));
      if (enDolares.some((p) => p.monto === null)) noConvertido++;
      const c = costoDelMes({
        periodo: mes,
        pagos: enDolares.filter((p) => p.monto !== null).map((p) => ({ quincena: p.quincena, monto: p.monto as number, moneda: "USD" as const })),
        salario,
        alta: m.createdAt,
        baja: m.deactivatedAt,
      });
      if (!c) continue;
      const usd = c.moneda === "USD" ? c.monto : aDolares(c.monto, c.moneda, mes);
      if (usd === null) {
        noConvertido++;
        continue;
      }
      fuentes[c.fuente]++;
      fuenteDe.set(m.id, c.fuente);
      total += conAguinaldo(usd);
    }
    if (total > 0) costoPorPersona.set(m.id, total);
  }
  if (noConvertido) avisos.push(`${noConvertido} meses o quincenas de planilla en colones quedaron fuera por no tener tipo de cambio.`);
  const planilla = [...costoPorPersona.values()].reduce((a, x) => a + x, 0);
  const horasPagadasDe = new Map(
    miembros.map((m) => [m.id, horasPagadas(config.personas[norm(m.email)]?.horasContrato ?? config.capacidad.horasContrato, rango, m.createdAt, m.deactivatedAt)]),
  );
  const horasPagadasTotal = miembros.filter((m) => costoPorPersona.has(m.id)).reduce((a, m) => a + (horasPagadasDe.get(m.id) ?? 0), 0);
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
  const [ultimaPorCliente, niveles] = await Promise.all([
    ultimaReunionPorCliente(cuentasDb.map((c) => c.id), ahora),
    nivelesDeEscala(cuentasDb.map((c) => c.id)),
  ]);
  const factores = factoresDeComplejidad(cuentasDb, ultimaPorCliente, config, ahora, niveles);
  const factorDe = (id: string) => factores.get(id)?.factor ?? 1;
  const cronogramas = aCronogramas(cronogramasDb);
  const entrega = entregaEstimada(cronogramas, factorDe, config, ahora, declarados);
  const primerLunes = lunesDe(rango.desde);
  const ultimoLunes = lunesDe(rango.hasta);
  // Por cuenta y por persona: lo que la entrega pidió en el período, y la parte respondida.
  const entregaPorCliente = new Map<string, Map<string, { horas: number; declaradas: number }>>();
  for (const [email, semanas] of entrega.porPersona) {
    for (const [lunes, s] of semanas) {
      if (lunes < primerLunes || lunes >= ultimoLunes) continue;
      for (const [id, h] of s.porCliente) {
        const porPersona = entregaPorCliente.get(id) ?? new Map<string, { horas: number; declaradas: number }>();
        const x = porPersona.get(email) ?? { horas: 0, declaradas: 0 };
        x.horas += h;
        x.declaradas += s.declaradasPorCliente.get(id) ?? 0;
        porPersona.set(email, x);
        entregaPorCliente.set(id, porPersona);
      }
    }
  }
  const plan = planDelPeriodo(cronogramas, factorDe, config, rango.desde, rango.hasta);

  // ── El costo de la hora de cada persona y de cada equipo ──
  const miembroDe = new Map(miembros.map((m) => [norm(m.email), m]));
  const equipoDe = (email: string) => EQUIPO_DEL_ROL[miembroDe.get(email)?.roleEnum ?? ""] ?? "Otros";
  const costoHoraDe = new Map<string, number>();
  for (const m of miembros) {
    const c = costoPorPersona.get(m.id);
    const h = horasPagadasDe.get(m.id) ?? 0;
    if (c && h > 0) costoHoraDe.set(norm(m.email), c / h);
  }
  const porEquipo = new Map<string, { personas: number; planilla: number; horasPagadas: number; horasConClientes: number }>();
  for (const m of miembros) {
    if (!costoPorPersona.has(m.id)) continue;
    const e = EQUIPO_DEL_ROL[m.roleEnum] ?? "Otros";
    const x = porEquipo.get(e) ?? { personas: 0, planilla: 0, horasPagadas: 0, horasConClientes: 0 };
    x.personas++;
    x.planilla += costoPorPersona.get(m.id) ?? 0;
    x.horasPagadas += horasPagadasDe.get(m.id) ?? 0;
    porEquipo.set(e, x);
  }
  const directoPromedio = horasPagadasTotal > 0 ? planilla / horasPagadasTotal : 0;
  const costoHoraDelEquipo = (e: string) => {
    const x = porEquipo.get(e);
    return x && x.horasPagadas > 0 ? x.planilla / x.horasPagadas : directoPromedio;
  };

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
    // El día del monto: el del cobro si entró la plata; si no, el de la factura.
    const dia = c.fechaCobro && periodoCr(c.fechaCobro) === imp.periodo ? diaCr(c.fechaCobro) : c.fechaEmision ? diaCr(c.fechaEmision) : null;
    const usd = aDolares(Number(c.monto), c.moneda, imp.periodo, dia);
    if (usd === null) continue;
    ingresoCobranza.set(c.cuenta.clientId, (ingresoCobranza.get(c.cuenta.clientId) ?? 0) + usd);
    nombreDe.set(c.cuenta.clientId, c.cuenta.client.name);
  }
  const ingresoOdoo = new Map<string, number>();
  for (const f of facturas) {
    const id = f.cuenta?.clientId;
    if (!id || f.cuenta?.client.kind !== "CLIENTE" || ingresoCobranza.has(id)) continue;
    const usd = aDolares(Number(f.montoNeto), f.moneda, periodoCr(f.invoiceDate), diaCr(f.invoiceDate));
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
  // Con la entrega: una cuenta sin reuniones ni cobros en el período igual pidió trabajo, y sin ella sus horas no
  // entraban a «horas con clientes» (el costo cargado salía más alto de lo que es).
  const ids = new Set([...tiempo.porCuenta.keys(), ...ingresoCobranza.keys(), ...ingresoOdoo.keys(), ...entregaPorCliente.keys()]);
  let horasDeReunion = 0;
  let reunionesTotal = 0;
  const horasConClientesDe = new Map<string, number>();
  const sumarPersona = (email: string, h: number) => horasConClientesDe.set(email, (horasConClientesDe.get(email) ?? 0) + h);
  const origen: HorasPorOrigen = { calendario: 0, declaradas: 0, estimadas: 0 };
  const cuentas: CuentaParaMargen[] = [...ids].map((id) => {
    const vista = tiempo.porCuenta.get(id);
    let reunionesH = 0;
    let preparacion = 0;
    let costoPersona = 0;
    let costoEquipo = 0;
    const deEsta = new Map<string, number>();
    const sumarAca = (email: string, h: number) => deEsta.set(email, (deEsta.get(email) ?? 0) + h);
    for (const [email, pp] of vista?.porPersona ?? []) {
      const r = pp.minutos / 60;
      const pr = (pp.reuniones * config.preparacionMin) / 60;
      reunionesH += r;
      preparacion += pr;
      sumarPersona(email, r + pr);
      sumarAca(email, r + pr);
      costoPersona += (r + pr) * (costoHoraDe.get(email) ?? directoPromedio);
      costoEquipo += (r + pr) * costoHoraDelEquipo(equipoDe(email));
    }
    let entregaH = 0;
    let declarada = 0;
    for (const [email, x] of entregaPorCliente.get(id) ?? []) {
      entregaH += x.horas;
      declarada += x.declaradas;
      sumarPersona(email, x.horas);
      sumarAca(email, x.horas);
      costoPersona += x.horas * (costoHoraDe.get(email) ?? directoPromedio);
      costoEquipo += x.horas * costoHoraDelEquipo(equipoDe(email));
    }
    horasDeReunion += reunionesH + preparacion;
    reunionesTotal += vista?.reuniones ?? 0;
    origen.calendario += reunionesH;
    origen.declaradas += declarada;
    origen.estimadas += preparacion + entregaH - declarada;
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
      horas: { reuniones: reunionesH, preparacion, entrega: entregaH, declarada },
      reuniones: vista?.reuniones ?? 0,
      plan: p && (p.sesiones > 0 || p.horasTareas > 0) ? p : null,
      costos: { persona: costoPersona, equipo: costoEquipo },
      factor: factorDe(id),
      porPersona: [...deEsta.entries()].map(([email, horas]) => ({ email, horas })).sort((a, b) => b.horas - a.horas),
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
        ? `${sinCosto[0]} no tiene planilla ni salario registrado en el período: su costo no entra (sus horas van al costo de una hora pagada promedio).`
        : `${sinCosto.length} personas del equipo no tienen planilla ni salario registrado en el período (${sinCosto.join(", ")}): su costo no entra (sus horas van al costo de una hora pagada promedio).`,
    );
  }

  const costosPersonas: CostoDeUnaPersona[] = miembros
    .filter((m) => costoPorPersona.has(m.id) || (horasConClientesDe.get(norm(m.email)) ?? 0) > 0)
    .map((m) => {
      const e = norm(m.email);
      const planillaP = costoPorPersona.get(m.id) ?? 0;
      return {
        id: m.id,
        email: e,
        nombre: m.name,
        equipo: EQUIPO_DEL_ROL[m.roleEnum] ?? "Otros",
        planilla: planillaP,
        horasPagadas: horasPagadasDe.get(m.id) ?? 0,
        costoHora: costoHoraDe.get(e) ?? null,
        horasConClientes: horasConClientesDe.get(e) ?? 0,
        fuente: fuenteDe.get(m.id) ?? null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  for (const p of costosPersonas) {
    const x = porEquipo.get(p.equipo);
    if (x && costoPorPersona.has(p.id)) x.horasConClientes += p.horasConClientes;
  }
  const costosEquipos: CostoDeUnEquipo[] = [...porEquipo.entries()]
    .map(([equipo, x]) => ({
      equipo,
      personas: x.personas,
      planilla: x.planilla,
      horasPagadas: x.horasPagadas,
      costoHora: x.horasPagadas > 0 ? x.planilla / x.horasPagadas : null,
      horasConClientes: x.horasConClientes,
      parteConClientes: x.horasPagadas > 0 ? x.horasConClientes / x.horasPagadas : null,
    }))
    .sort((a, b) => a.equipo.localeCompare(b.equipo, "es"));

  return {
    rango: { periodo, meses: rango.meses, etiqueta: rango.etiqueta },
    totales,
    costoDeLaHora: costoDeLaHora(totales),
    cuentas,
    personas: { conCosto: costoPorPersona.size, sinCosto, fuentes },
    costos: { personas: costosPersonas, equipos: costosEquipos },
    horasPorOrigen: origen,
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

// ── Una cuenta, mes a mes ────────────────────────────────────────────────────

export interface MesDeLaCuenta {
  mes: string;
  etiqueta: string;
  /** null = la cuenta no tuvo horas ni cobros ese mes. */
  fila: FilaDeMargen | null;
}

export interface MargenDeLaCuenta {
  clienteId: string;
  nombre: string;
  etiqueta: string;
  /** El trimestre entero, con el costo de cada persona. */
  total: FilaDeMargen | null;
  /** El trimestre con el costo cargado, para comparar. */
  totalCargado: FilaDeMargen | null;
  meses: MesDeLaCuenta[];
  atendidaPor: Array<{ nombre: string; equipo: string; horas: number; costoHora: number | null; costo: number }>;
  factor: FactorExplicado | null;
  /** Lo que respondió el equipo en «¿cuánto te tomó?» para esta cuenta. Sin nombres: el rol. */
  respuestas: Array<{ fecha: string; titulo: string; tipo: string; minutos: number; estimado: number | null; rol: string | null }>;
  avisos: string[];
}

/** El margen de una cuenta en el último trimestre cerrado, mes a mes, y quién la atendió. Null si la cuenta no existe. */
export async function cargarMargenDeLaCuenta(clienteId: string, ahora = new Date()): Promise<MargenDeLaCuenta | null> {
  const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { id: true, name: true } });
  if (!cliente) return null;
  const rango = rangoDelPeriodo("trimestre", ahora);
  const [total, porMes, configuracion, respuestas] = await Promise.all([
    cargarRentabilidadDelRango(rango, ahora),
    Promise.all(rango.meses.map((m) => cargarRentabilidadDelRango(rangoDelMes(m), ahora))),
    cargarConfigCarga(),
    modeloDisponible(prisma.preguntaDeTiempo)
      ? prisma.preguntaDeTiempo.findMany({
          where: { clientId: clienteId, estado: "respondida", minutos: { not: null } },
          orderBy: { respondidaAt: "desc" },
          take: 40,
          select: { titulo: true, tipoFase: true, documento: true, minutos: true, estimadoMinutos: true, respondidaAt: true, ocurrioAt: true, rol: true },
        })
      : Promise.resolve([]),
  ]);
  const factores = await factoresDeLasCuentas([clienteId], configuracion.config, ahora);
  const fila = (d: DatosDeRentabilidad, modo: ModoDeCosto) => {
    const c = d.cuentas.find((x) => x.clienteId === clienteId);
    return c ? filaDeMargen(c, d.costoDeLaHora.cargado ?? 0, d.totales.horasPorSesion, modo) : null;
  };
  const cuenta = total.cuentas.find((x) => x.clienteId === clienteId);
  const personaDe = new Map(total.costos.personas.map((p) => [p.email, p]));
  const directo = total.costoDeLaHora.directo ?? 0;
  return {
    clienteId,
    nombre: cliente.name,
    etiqueta: total.rango.etiqueta,
    total: fila(total, "persona"),
    totalCargado: fila(total, "cargado"),
    meses: porMes.map((d, i) => ({ mes: rango.meses[i], etiqueta: d.rango.etiqueta, fila: fila(d, "persona") })),
    atendidaPor: (cuenta?.porPersona ?? []).map((x) => {
      const p = personaDe.get(x.email);
      const costoHora = p?.costoHora ?? null;
      return { nombre: p?.nombre ?? x.email, equipo: p?.equipo ?? "Otros", horas: x.horas, costoHora, costo: x.horas * (costoHora ?? directo) };
    }),
    factor: factores.get(clienteId) ?? null,
    respuestas: respuestas.map((r) => ({
      fecha: (r.respondidaAt ?? r.ocurrioAt).toISOString(),
      titulo: r.titulo,
      tipo: r.documento ? "Documento" : (familiaPorClave(familiaDe(r.titulo))?.nombre ?? ETIQUETA_DE_TIPO[(r.tipoFase ?? "SIN") as keyof typeof ETIQUETA_DE_TIPO] ?? "Tarea"),
      minutos: r.minutos ?? 0,
      estimado: r.estimadoMinutos,
      rol: r.rol,
    })),
    avisos: total.avisos,
  };
}
