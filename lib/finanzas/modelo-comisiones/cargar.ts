/**
 * lib/finanzas/modelo-comisiones/cargar.ts — lo que necesita la simulación de comisiones. SERVER-ONLY.
 *
 * Carga SOLO lo de quien mira (`AlcanceDeComisiones`, ./quien-ve.ts): lo que vende y gana cada persona es privado, como
 * un salario, y el filtro es de este archivo, nunca de la pantalla. Super Admin ve a todos, el área de Customer Success
 * y los techos. Quien lidera Ventas ve también lo que vendieron las personas que lidera (su bono sale de ahí); quien
 * lidera Customer Success, lo del área.
 *
 * Por cada persona con meta de ventas en HubSpot del año: su meta tramo por tramo (lib/ventas/metas.ts, el único lector
 * de metas), sus negocios ganados del año (los suyos y los que comparte) con la primera venta de cada cliente, y lo que
 * se le pagó de comisiones ese año con el esquema de hoy. Por cada persona de Customer Success, sus ventas. Y las
 * renovaciones: los tratos marcados renovación y los servicios mensuales sin fin de Cobranza, con el CSE de la cuenta.
 *
 * De cada venta con una propuesta en el mismo trato de HubSpot: qué es único, qué es al mes y lo descontado contra la
 * primera propuesta del trato (lib/business-cases/descuento.ts). Si falta una tabla, la simulación sigue sin ellas.
 * Una venta que dejó de estar ganada en HubSpot viene con la fecha en que Nexus lo vio: si fue en sus primeros 90
 * días, se cayó (./reglas.ts).
 *
 * El cálculo lo hace el navegador con ./reglas.ts. Solo lee: nada de acá se paga ni se guarda.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { metasPorPersona } from "@/lib/ventas/metas";
import { PIPELINES } from "@/lib/ventas/pipelines";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cargarPropuestasGanadas } from "@/lib/finanzas/lo-vendido-server";
import { aprobacionesDe, descuentoContraLaPrimera, estadoDeLaAprobacion } from "@/lib/business-cases/descuento";
import { primerasPropuestasDeTratos } from "@/lib/business-cases/primera-propuesta-server";
import { encargadosDeLasCuentas } from "@/lib/cuentas/encargado-server";
import { ROLES_DE_CUSTOMER_SUCCESS, type AlcanceDeComisiones } from "./quien-ve";
import { pareceLicencia, type PropuestaDeLaVenta, type ServicioMensualSinFin, type TipoDeNegocio, type TramoDeMeta, type VentaParaSimular } from "./reglas";

export interface VendedorParaSimular {
  id: string;
  nombre: string;
  /** Su área o su rol, para decir quién es en la pantalla. */
  rol: string;
  /** Lidera el equipo de ventas: le corresponde el bono trimestral. */
  lidera: boolean;
  moneda: string;
  metaDelAnio: number;
  /** Lo que HubSpot dice que lleva del año. */
  avance: number | null;
  tramos: TramoDeMeta[];
  ventas: VentaParaSimular[];
  /** Lo que se le pagó de comisiones en el año con el esquema de hoy (cuotas pagadas, en dólares). */
  pagadoEnElAnio: number;
}

/** Una persona del equipo de ventas (rol Ventas en Nexus). */
export interface PersonaDelEquipo {
  id: string;
  nombre: string;
  /** Tiene meta de ventas en HubSpot este año: sin meta no suma a la del equipo. */
  tieneMeta: boolean;
}

/** Una persona de Customer Success (CSE o CSL) con sus ventas: las suyas y las que comparte. */
export interface PersonaDeCustomerSuccess {
  id: string;
  nombre: string;
  rol: string;
  ventas: VentaParaSimular[];
}

export interface DatosDeCustomerSuccess {
  personas: PersonaDeCustomerSuccess[];
  /** Todas las ventas del área, cada una una vez: el bono de quien lidera. null si quien mira no lo ve. */
  area: VentaParaSimular[] | null;
  /** Las renovaciones que ve quien mira: las de sus cuentas, o todas para Super Admin. */
  renovaciones: { tratos: VentaParaSimular[]; mensuales: ServicioMensualSinFin[] };
}

export interface DatosDeLaSimulacion {
  anio: number;
  /** El mes de hoy en Costa Rica (1–12). */
  mesActual: number;
  /** «YYYY-MM-DD» de la última copia de las metas de HubSpot, o null si nunca se copiaron. */
  metasAl: string | null;
  /** Super Admin ve todo; una persona, solo lo suyo. */
  todo: boolean;
  /** Quien mira. */
  quienMira: string;
  vendedores: VendedorParaSimular[];
  /** El equipo de ventas que lidera quien gana el bono. Marco vende pero no está: es dirección. */
  equipoDeVentas: PersonaDelEquipo[];
  customerSuccess: DatosDeCustomerSuccess;
  /** Solo Super Admin: los servicios vendidos en cada trimestre del año, sin licencias (el piso de los techos). */
  serviciosPorTrimestre: number[] | null;
}

const SHARED_SELLING = PIPELINES.find((p) => p.label === "HubSpot Shared Selling")?.id ?? "";
const enCostaRica = (d: Date) => new Date(+d - 6 * 3_600_000);
const dia = (d: Date) => d.toISOString().slice(0, 10);
const TIPO: Record<string, TipoDeNegocio> = { NUEVO: "nuevo", EXPANSION: "expansion", RENOVACION: "renovacion" };

const SELECT_VENTA = {
  id: true,
  nombre: true,
  fechaCierre: true,
  monto: true,
  moneda: true,
  pipelineId: true,
  vendedorId: true,
  clientId: true,
  hubspotDealId: true,
  estado: true,
  tipoDeNegocio: true,
  compartidaConId: true,
  compartidaDespuesDeLaFirma: true,
  compartidaCon: { select: { name: true } },
  client: { select: { name: true } },
} satisfies Prisma.VentaGanadaSelect;
type FilaDeVenta = Prisma.VentaGanadaGetPayload<{ select: typeof SELECT_VENTA }>;

export async function cargarSimulacionDeComisiones(alcance: AlcanceDeComisiones, ahora: Date = new Date()): Promise<DatosDeLaSimulacion> {
  const hoy = enCostaRica(ahora);
  const anio = hoy.getUTCFullYear();
  const mesActual = hoy.getUTCMonth() + 1;
  const todo = alcance.tipo === "todo";
  const yo = alcance.tipo === "persona" ? alcance.teamMemberId : "";

  // Solo la moneda de la casa: una meta en otra moneda no se compara con ventas en dólares.
  const [todasLasMetas, equipo, deCs] = await Promise.all([
    metasPorPersona(anio).then((ms) => ms.filter((m) => m.moneda === "USD")),
    // El equipo de ventas: quien tiene el rol de Ventas en Nexus y sigue en el equipo (hoy, Andrés y Liz). Marco vende
    // con sus relaciones y es dirección: tiene su comisión, pero sus ventas no cuentan para el bono de nadie.
    prisma.teamMember.findMany({ where: { roleEnum: "VENTAS", deactivatedAt: null }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.teamMember.findMany({
      where: { roleEnum: { in: [...ROLES_DE_CUSTOMER_SUCCESS] }, deactivatedAt: null },
      select: { id: true, name: true, email: true, roleEnum: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // Lidera el equipo quien lleva más tiempo en él (la propuesta se lo da a Andrés; Liz entró el 15 oct de 2026).
  const lider = equipo[0]?.id ?? null;
  const yoLidero = !todo && yo === lider;
  const yoSoyCs = !todo && deCs.some((p) => p.id === yo);
  const yoLideroCs = !todo && deCs.some((p) => p.id === yo && p.roleEnum === "CSL");

  // A quiénes ve: todos; o yo, y las personas que lidero si lidero Ventas.
  const veA = (id: string) => todo || id === yo || (yoLidero && equipo.some((p) => p.id === id));
  const metas = todasLasMetas.filter((m) => veA(m.teamMemberId));
  const conMeta = new Set(todasLasMetas.map((m) => m.teamMemberId));
  const equipoDeVentas: PersonaDelEquipo[] = equipo.filter((p) => veA(p.id)).map((p) => ({ id: p.id, nombre: p.name, tieneMeta: conMeta.has(p.id) }));
  const personasCs = deCs.filter((p) => todo || p.id === yo);

  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));
  const delAnio = { excluida: false, fechaCierre: { gte: desde, lt: hasta } } satisfies Prisma.VentaGanadaWhereInput;
  // Las ganadas, y las que dejaron de estarlo (perdidas, reabiertas, borradas): pueden haberse caído a tiempo.
  const ids = [...new Set([...metas.map((m) => m.teamMemberId), ...personasCs.map((p) => p.id)])];
  const veElArea = todo || yoLideroCs;
  const csIds = deCs.map((p) => p.id);
  const [personas, ventas, pagado, ventasDelArea] = await Promise.all([
    prisma.teamMember.findMany({ where: { id: { in: ids } }, select: { id: true, roleEnum: true, area: true } }),
    ids.length
      ? prisma.ventaGanada.findMany({ where: { ...delAnio, OR: [{ vendedorId: { in: ids } }, { compartidaConId: { in: ids } }] }, select: SELECT_VENTA, orderBy: { fechaCierre: "asc" } })
      : Promise.resolve([] as FilaDeVenta[]),
    prisma.cuotaComisionVendedor.groupBy({
      by: ["teamMemberId"],
      // Lo que se le pagó: a cada uno solo lo suyo, aunque lidere (Super Admin, todo).
      where: { teamMemberId: { in: todo ? metas.map((m) => m.teamMemberId) : [yo] }, estado: "PAGADA", moneda: "USD", periodo: { startsWith: `${anio}-` } },
      _sum: { monto: true },
    }),
    veElArea && csIds.length
      ? prisma.ventaGanada.findMany({ where: { ...delAnio, OR: [{ vendedorId: { in: csIds } }, { compartidaConId: { in: csIds } }] }, select: SELECT_VENTA, orderBy: { fechaCierre: "asc" } })
      : Promise.resolve([] as FilaDeVenta[]),
  ]);

  // Las renovaciones: los tratos marcados renovación (de cualquiera) y los servicios mensuales sin fin.
  const [renovacionesTrato, mensuales] = await Promise.all([
    prisma.ventaGanada.findMany({ where: { ...delAnio, tipoDeNegocio: "RENOVACION" }, select: SELECT_VENTA, orderBy: { fechaCierre: "asc" } }),
    prisma.servicioContratado.findMany({
      where: { modalidad: "RECURRENTE", duracionMeses: null, estado: "ACTIVO", moneda: "USD", fechaInicioFacturacion: { not: null } },
      select: { id: true, montoTotal: true, fechaInicioFacturacion: true, tipoServicio: true, descripcion: true, cuenta: { select: { clientId: true, client: { select: { name: true } } } } },
    }),
  ]);

  const todas = [...ventas, ...ventasDelArea, ...renovacionesTrato];
  // La primera venta de cada cliente, de cualquier vendedor y de cualquier año: desde ahí corren los 6 meses de Ventas.
  const clientes = [...new Set(todas.map((v) => v.clientId).filter((c): c is string => !!c))];
  const [primeras, caidas, propuestaDe, encargados] = await Promise.all([
    clientes.length
      ? prisma.ventaGanada.groupBy({ by: ["clientId"], where: { clientId: { in: clientes }, estado: "GANADA", excluida: false }, _min: { fechaCierre: true } })
      : Promise.resolve([]),
    fechasDeCaida(todas.filter((v) => v.estado !== "GANADA").map((v) => v.id)),
    propuestasPorTrato(anio, new Set(todas.map((v) => v.hubspotDealId))),
    encargadosDeLasCuentas([...clientes, ...mensuales.map((s) => s.cuenta.clientId)]),
  ]);
  const primeraDe = new Map(primeras.map((p) => [p.clientId, p._min.fechaCierre ? dia(p._min.fechaCierre) : null]));
  const persona = new Map(personas.map((p) => [p.id, p]));
  const pagadoDe = new Map(pagado.map((p) => [p.teamMemberId, Number(p._sum.monto ?? 0)]));
  const csPorId = new Set(csIds);
  const porCorreo = new Map(deCs.map((p) => [p.email.trim().toLowerCase(), p]));
  const encargadoDe = (clientId: string | null): { id: string | null; nombre: string } | null => {
    const e = clientId ? encargados.get(clientId) : null;
    if (!e?.email) return null;
    const p = porCorreo.get(e.email.toLowerCase());
    return { id: p?.id ?? null, nombre: p?.name ?? e.nombre ?? e.email };
  };

  const aVenta = (v: FilaDeVenta): VentaParaSimular => ({
    id: v.id,
    fecha: dia(v.fechaCierre),
    nombre: v.nombre.replace(/\s+/g, " ").trim(),
    cliente: v.client?.name ?? null,
    monto: v.monto == null ? null : Number(v.monto),
    moneda: v.moneda,
    refiereHubspot: v.pipelineId === SHARED_SELLING,
    primeraVenta: v.clientId ? (primeraDe.get(v.clientId) ?? null) : null,
    propuesta: propuestaDe(v.hubspotDealId, v.moneda),
    tipoDeNegocio: v.tipoDeNegocio ? TIPO[v.tipoDeNegocio] : null,
    compartidaCon: v.compartidaConId ? { id: v.compartidaConId, nombre: v.compartidaCon?.name ?? "" } : null,
    compartidaTarde: v.compartidaDespuesDeLaFirma,
    deCustomerSuccess: !!v.vendedorId && csPorId.has(v.vendedorId),
    caida: v.estado === "GANADA" ? null : { fecha: caidas.get(v.id) ?? dia(v.fechaCierre), estado: v.estado },
    encargado: encargadoDe(v.clientId),
  });
  const deLaPersona = (id: string) => ventas.filter((v) => v.vendedorId === id || v.compartidaConId === id).map(aVenta);

  const vendedores: VendedorParaSimular[] = metas.map((m) => {
    const p = persona.get(m.teamMemberId);
    return {
      id: m.teamMemberId,
      nombre: m.nombrePersona,
      rol: p?.area ?? (p?.roleEnum === "VENTAS" ? "Ventas" : csPorId.has(m.teamMemberId) ? "Customer Success" : "Dirección"),
      lidera: m.teamMemberId === lider,
      moneda: m.moneda,
      metaDelAnio: m.monto,
      avance: m.avance,
      tramos: m.detalle,
      pagadoEnElAnio: Math.round((pagadoDe.get(m.teamMemberId) ?? 0) * 100) / 100,
      ventas: deLaPersona(m.teamMemberId),
    };
  });

  // Las renovaciones que ve quien mira: todas, o las de las cuentas que lleva.
  const veLaRenovacion = (e: { id: string | null } | null) => todo || (yoSoyCs && e?.id === yo);
  const mensualesSinFin: ServicioMensualSinFin[] = mensuales
    .map((s) => ({
      id: s.id,
      cliente: s.cuenta.client.name,
      nombre: s.descripcion?.trim() || `${s.cuenta.client.name} · ${s.tipoServicio.toLowerCase()}`,
      inicio: dia(s.fechaInicioFacturacion!),
      mensual: Number(s.montoTotal),
      moneda: "USD",
      encargado: encargadoDe(s.cuenta.clientId),
    }))
    .filter((s) => veLaRenovacion(s.encargado));

  const ultima = metas.reduce<Date | null>((a, m) => (m.sincronizadoEn && (!a || m.sincronizadoEn > a) ? m.sincronizadoEn : a), null);
  return {
    anio,
    mesActual,
    metasAl: ultima ? dia(enCostaRica(ultima)) : null,
    todo,
    quienMira: yo,
    vendedores: vendedores.sort((a, b) => Number(b.id === yo) - Number(a.id === yo) || Number(b.lidera) - Number(a.lidera) || a.nombre.localeCompare(b.nombre)),
    equipoDeVentas,
    customerSuccess: {
      personas: personasCs.map((p) => ({ id: p.id, nombre: p.name, rol: p.roleEnum === "CSL" ? "Lidera Customer Success" : "Customer Success", ventas: deLaPersona(p.id) })),
      area: veElArea ? ventasDelArea.map(aVenta) : null,
      renovaciones: { tratos: renovacionesTrato.map(aVenta).filter((v) => veLaRenovacion(v.encargado ?? null)), mensuales: mensualesSinFin },
    },
    serviciosPorTrimestre: todo ? await serviciosPorTrimestre(anio) : null,
  };
}

/** Cuándo vio Nexus que cada venta dejó de estar ganada: el último cambio de estado a perdida, reabierta o borrada. */
async function fechasDeCaida(ventaIds: string[]): Promise<Map<string, string>> {
  if (!ventaIds.length) return new Map();
  const cambios = await prisma.ventaGanadaCambio.findMany({
    where: { ventaId: { in: ventaIds }, tipo: "ESTADO", nuevo: { in: ["PERDIDA", "REABIERTA", "DESAPARECIDA"] } },
    select: { ventaId: true, detectadoEn: true },
    orderBy: { detectadoEn: "asc" },
  });
  return new Map(cambios.map((c) => [c.ventaId!, dia(enCostaRica(c.detectadoEn))]));
}

/** Los servicios vendidos en cada trimestre del año, de todos, sin licencias ni lo que dejó de estar ganado. En dólares. */
async function serviciosPorTrimestre(anio: number): Promise<number[]> {
  const filas = await prisma.ventaGanada.findMany({
    where: { estado: "GANADA", excluida: false, moneda: "USD", fechaCierre: { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) } },
    select: { nombre: true, monto: true, fechaCierre: true },
  });
  const t = [0, 0, 0, 0];
  for (const f of filas) {
    if (f.monto == null || pareceLicencia(f.nombre)) continue;
    t[Math.floor(f.fechaCierre.getUTCMonth() / 3)] += Number(f.monto);
  }
  return t.map((x) => Math.round(x * 100) / 100);
}

/**
 * Lo que dicen de sus servicios las propuestas ganadas del año, por trato de HubSpot, con lo descontado contra la
 * primera propuesta del trato. Una propuesta en otra moneda que la venta, o sin servicios legibles, no se usa: la venta
 * queda con su monto de HubSpot.
 */
async function propuestasPorTrato(anio: number, deals: Set<string>): Promise<(deal: string, moneda: string) => PropuestaDeLaVenta | null> {
  let ganadas: Awaited<ReturnType<typeof cargarPropuestasGanadas>> = [];
  let primeras: Awaited<ReturnType<typeof primerasPropuestasDeTratos>> = new Map();
  try {
    ganadas = (await cargarPropuestasGanadas({ anio })).filter((p) => deals.has(p.hubspotDealId));
    primeras = await primerasPropuestasDeTratos(ganadas.map((p) => p.hubspotDealId));
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[comisiones] no se pudieron leer las propuestas ganadas (¿falta un SQL?): la simulación sigue sin ellas");
    return () => null;
  }
  const v0 = ganadas.length
    ? await prisma.projectCanvas.findMany({ where: { businessCaseId: { in: ganadas.map((p) => p.businessCaseId) }, version: 0 }, select: { businessCaseId: true, sections: true } })
    : [];
  const aprobacionesDeLa = new Map(v0.map((c) => [c.businessCaseId, aprobacionesDe(c.sections)]));
  const porDeal = new Map(ganadas.map((p) => [p.hubspotDealId, p]));
  return (deal, moneda) => {
    const p = porDeal.get(deal);
    if (!p) return null;
    const primera = primeras.get(deal) ?? null;
    const d = descuentoContraLaPrimera(primera?.inversion ?? p.inversion, p.inversion);
    if (!d.hayServicios || (d.moneda || p.monedaDeLaVenta || moneda) !== moneda) return null;
    const estado = estadoDeLaAprobacion(d.porcentaje, aprobacionesDeLa.get(p.businessCaseId) ?? []);
    const esLaMisma = !primera || JSON.stringify(primera.inversion) === JSON.stringify(p.inversion);
    return {
      id: p.businessCaseId,
      nombre: p.nombre,
      unico: d.unico,
      mensual: d.mensual,
      descontado: d.descontado,
      porcentaje: d.porcentaje,
      incompleto: d.incompleto,
      aprobacion:
        estado.estado === "aprobado"
          ? { estado: "aprobado", porNombre: estado.aprobacion.porNombre, en: dia(enCostaRica(new Date(estado.aprobacion.en))) }
          : { estado: estado.estado },
      primera: primera && d.comparable ? { nombre: primera.nombre, version: primera.version, esLaMisma } : null,
    };
  };
}
