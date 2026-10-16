/**
 * lib/finanzas/modelo-comisiones/cargar.ts — lo que necesita la simulación de comisiones. SERVER-ONLY, SOLO SUPER ADMIN
 * (la página corta con `isCostosRole` antes de llamar acá: lo vigila lib/cobranza/costos-privacy.test.ts).
 *
 * Por cada persona con meta de ventas en HubSpot del año: su meta tramo por tramo (lib/ventas/metas.ts, el único lector
 * de metas), sus negocios ganados del año (`VentaGanada.vendedorId`) con la primera venta de cada cliente, y lo que se le
 * pagó de comisiones ese año con el esquema de hoy. El cálculo lo hace el navegador con lib/finanzas/modelo-comisiones/reglas.ts.
 *
 * Solo lee: nada de acá se paga ni se guarda.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { metasPorPersona } from "@/lib/ventas/metas";
import { PIPELINES } from "@/lib/ventas/pipelines";
import type { TramoDeMeta, VentaParaSimular } from "./reglas";

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

export interface DatosDeLaSimulacion {
  anio: number;
  /** El mes de hoy en Costa Rica (1–12). */
  mesActual: number;
  /** «YYYY-MM-DD» de la última copia de las metas de HubSpot, o null si nunca se copiaron. */
  metasAl: string | null;
  vendedores: VendedorParaSimular[];
  /** El equipo de ventas que lidera quien gana el bono. Marco vende pero no está: es dirección. */
  equipoDeVentas: PersonaDelEquipo[];
}

const SHARED_SELLING = PIPELINES.find((p) => p.label === "HubSpot Shared Selling")?.id ?? "";
const enCostaRica = (d: Date) => new Date(+d - 6 * 3_600_000);
const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function cargarSimulacionDeComisiones(ahora: Date = new Date()): Promise<DatosDeLaSimulacion> {
  const hoy = enCostaRica(ahora);
  const anio = hoy.getUTCFullYear();
  const mesActual = hoy.getUTCMonth() + 1;
  // Solo la moneda de la casa: una meta en otra moneda no se compara con ventas en dólares.
  const metas = (await metasPorPersona(anio)).filter((m) => m.moneda === "USD");
  // El equipo de ventas: quien tiene el rol de Ventas en Nexus y sigue en el equipo (hoy, Andrés y Liz). Marco vende
  // con sus relaciones y es dirección: tiene su comisión, pero sus ventas no cuentan para el bono de nadie.
  const equipo = await prisma.teamMember.findMany({
    where: { roleEnum: "VENTAS", deactivatedAt: null },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const conMeta = new Set(metas.map((m) => m.teamMemberId));
  const equipoDeVentas: PersonaDelEquipo[] = equipo.map((p) => ({ id: p.id, nombre: p.name, tieneMeta: conMeta.has(p.id) }));
  if (metas.length === 0) return { anio, mesActual, metasAl: null, vendedores: [], equipoDeVentas };

  const ids = metas.map((m) => m.teamMemberId);
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));
  const [personas, ventas, pagado] = await Promise.all([
    prisma.teamMember.findMany({ where: { id: { in: ids } }, select: { id: true, roleEnum: true, area: true } }),
    prisma.ventaGanada.findMany({
      where: { estado: "GANADA", excluida: false, vendedorId: { in: ids }, fechaCierre: { gte: desde, lt: hasta } },
      select: { id: true, nombre: true, fechaCierre: true, monto: true, moneda: true, pipelineId: true, vendedorId: true, clientId: true, client: { select: { name: true } } },
      orderBy: { fechaCierre: "asc" },
    }),
    prisma.cuotaComisionVendedor.groupBy({
      by: ["teamMemberId"],
      where: { teamMemberId: { in: ids }, estado: "PAGADA", moneda: "USD", periodo: { startsWith: `${anio}-` } },
      _sum: { monto: true },
    }),
  ]);

  // La primera venta de cada cliente, de cualquier vendedor y de cualquier año: desde ahí corren los 6 meses de Ventas.
  const clientes = [...new Set(ventas.map((v) => v.clientId).filter((c): c is string => !!c))];
  const primeras = clientes.length
    ? await prisma.ventaGanada.groupBy({ by: ["clientId"], where: { clientId: { in: clientes }, estado: "GANADA", excluida: false }, _min: { fechaCierre: true } })
    : [];
  const primeraDe = new Map(primeras.map((p) => [p.clientId, p._min.fechaCierre ? dia(p._min.fechaCierre) : null]));
  const persona = new Map(personas.map((p) => [p.id, p]));
  const pagadoDe = new Map(pagado.map((p) => [p.teamMemberId, Number(p._sum.monto ?? 0)]));

  // Lidera el equipo quien lleva más tiempo en él (la propuesta se lo da a Andrés; Liz entró el 15 oct de 2026).
  const lider = equipo[0]?.id ?? null;

  const vendedores: VendedorParaSimular[] = metas.map((m) => {
    const p = persona.get(m.teamMemberId);
    return {
      id: m.teamMemberId,
      nombre: m.nombrePersona,
      rol: p?.area ?? (p?.roleEnum === "VENTAS" ? "Ventas" : "Dirección"),
      lidera: m.teamMemberId === lider,
      moneda: m.moneda,
      metaDelAnio: m.monto,
      avance: m.avance,
      tramos: m.detalle,
      pagadoEnElAnio: Math.round((pagadoDe.get(m.teamMemberId) ?? 0) * 100) / 100,
      ventas: ventas
        .filter((v) => v.vendedorId === m.teamMemberId)
        .map((v) => ({
          id: v.id,
          fecha: dia(v.fechaCierre),
          nombre: v.nombre.replace(/\s+/g, " ").trim(),
          cliente: v.client?.name ?? null,
          monto: v.monto == null ? null : Number(v.monto),
          moneda: v.moneda,
          refiereHubspot: v.pipelineId === SHARED_SELLING,
          primeraVenta: v.clientId ? (primeraDe.get(v.clientId) ?? null) : null,
        })),
    };
  });

  const ultima = metas.reduce<Date | null>((a, m) => (m.sincronizadoEn && (!a || m.sincronizadoEn > a) ? m.sincronizadoEn : a), null);
  return {
    anio,
    mesActual,
    metasAl: ultima ? dia(enCostaRica(ultima)) : null,
    vendedores: vendedores.sort((a, b) => Number(b.lidera) - Number(a.lidera) || a.nombre.localeCompare(b.nombre)),
    equipoDeVentas,
  };
}
