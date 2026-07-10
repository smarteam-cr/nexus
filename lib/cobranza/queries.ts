/**
 * lib/cobranza/queries.ts
 *
 * Lecturas Prisma del módulo Cobranza (server-only). REGLA DE ORO: Prisma.Decimal
 * NO cruza esta frontera — los serializadores de acá abajo lo convierten a number
 * (y las Date a ISO) antes de que nada llegue a un Client Component. Es la única
 * defensa sistemática contra el bug silencioso de "Decimal no es serializable".
 */
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";
import {
  semaforoCuenta,
  type CarteraEngineInput,
  type Semaforo,
} from "./engine";
import type { Prisma } from "@prisma/client";

// ── DTOs serializables (lo ÚNICO que sale de este módulo hacia la UI) ───────────

export interface CobroDTO {
  id: string;
  servicioId: string;
  numCuota: number | null;
  periodo: string;
  fechaProgramada: string; // ISO date
  monto: number;
  moneda: string;
  estado: string;
  origen: string;
  fechaEmision: string | null;
  fechaCobro: string | null;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  notas: string | null;
}

export interface CuotaPlanDTO {
  orden: number;
  base: string;
  valor: number;
  offsetMeses: number;
  descripcion: string | null;
}

export interface PlanDTO {
  id: string;
  template: string;
  origen: string;
  numCuotas: number | null;
  notas: string | null;
  cuotas: CuotaPlanDTO[];
}

export interface ServicioDTO {
  id: string;
  tipoServicio: string;
  modalidad: string;
  montoTotal: number;
  moneda: string;
  fechaInicioFacturacion: string | null;
  duracionMeses: number | null;
  projectId: string | null;
  projectName: string | null;
  anchorActual: string | null; // anchorStartDate ACTUAL del project (para badge de divergencia)
  estado: string;
  descripcion: string | null;
  planActivo: PlanDTO | null;
  cobros: CobroDTO[];
}

export interface BitacoraDTO {
  id: string;
  tipo: string;
  contenido: string;
  usuarioEmail: string | null;
  createdAt: string;
}

export interface CuentaDetailDTO {
  id: string;
  clientId: string;
  clienteNombre: string;
  tipo: string;
  viaCobro: string;
  moneda: string;
  terminosPago: string;
  diaCobroAncla: number | null;
  estadoCuenta: string;
  excluidaOperacion: boolean;
  responsableCobroTerceros: string | null;
  notas: string | null;
  estadoActualizadoPor: string | null;
  estadoActualizadoEn: string | null;
  servicios: ServicioDTO[];
  bitacora: BitacoraDTO[];
  /** Proyectos activos reales del cliente (para el select de ServicioForm). */
  proyectos: Array<{ id: string; name: string; anchorStartDate: string | null }>;
}

export interface CarteraRow {
  clientId: string;
  clienteNombre: string;
  cuentaId: string | null; // null = cliente con proyecto activo SIN cuenta ("sin configurar")
  tipo: string | null;
  moneda: string | null;
  estadoCuenta: string | null;
  excluidaOperacion: boolean;
  tiposServicio: string[];
  ultimoCobro: string | null; // max fechaCobro
  proximoCobro: string | null; // min fechaProgramada no cobrada
  proximoMonto: number | null;
  semaforo: Semaforo;
}

export interface AlertaDTO {
  id: string;
  cuentaId: string;
  clienteNombre: string;
  cobroId: string | null;
  tipo: string;
  urgencia: string;
  mensaje: string;
  evidencia: unknown;
  occurrences: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  estado: string;
  vistaPor: string | null;
  resueltaPor: string | null;
}

// ── Serializadores (Decimal → number, Date → ISO) ───────────────────────────────

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const isoDay = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
const num = (d: Prisma.Decimal | null | undefined): number | null =>
  d == null ? null : Number(d);

type CobroRow = {
  id: string;
  servicioId: string;
  numCuota: number | null;
  periodo: string;
  fechaProgramada: Date;
  monto: Prisma.Decimal;
  moneda: string;
  estado: string;
  origen: string;
  fechaEmision: Date | null;
  fechaCobro: Date | null;
  confirmadoPor: string | null;
  confirmadoEn: Date | null;
  notas: string | null;
};

function serializeCobro(c: CobroRow): CobroDTO {
  return {
    id: c.id,
    servicioId: c.servicioId,
    numCuota: c.numCuota,
    periodo: c.periodo,
    fechaProgramada: isoDay(c.fechaProgramada)!,
    monto: num(c.monto)!,
    moneda: c.moneda,
    estado: c.estado,
    origen: c.origen,
    fechaEmision: isoDay(c.fechaEmision),
    fechaCobro: isoDay(c.fechaCobro),
    confirmadoPor: c.confirmadoPor,
    confirmadoEn: iso(c.confirmadoEn),
    notas: c.notas,
  };
}

// ── Base: clientes con proyecto REAL (filtro canónico del Portfolio) ────────────

/**
 * Devuelve los clientId de clientes con al menos un proyecto REAL y navegable —
 * criterio copiado de lib/portfolio/load.ts (status active + no-sentinel + regla
 * HubSpot) + isProspect:false. Es el universo v1 del panel de cartera.
 */
async function clientIdsConProyectoReal(): Promise<Map<string, { name: string }>> {
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
        { client: { isProspect: false } },
      ],
    },
    select: { clientId: true, client: { select: { name: true } } },
  });
  const map = new Map<string, { name: string }>();
  for (const p of projects) {
    if (!map.has(p.clientId)) map.set(p.clientId, { name: p.client.name });
  }
  return map;
}

// ── Panel de cartera ────────────────────────────────────────────────────────────

export async function loadCartera(todayISO: string): Promise<CarteraRow[]> {
  const clientes = await clientIdsConProyectoReal();

  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: { clientId: { in: [...clientes.keys()] } },
    select: {
      id: true,
      clientId: true,
      tipo: true,
      moneda: true,
      estadoCuenta: true,
      excluidaOperacion: true,
      servicios: { select: { tipoServicio: true, estado: true } },
      cobros: {
        select: { estado: true, fechaProgramada: true, fechaCobro: true, monto: true },
        orderBy: { fechaProgramada: "asc" },
      },
    },
  });
  const cuentaByClient = new Map(cuentas.map((c) => [c.clientId, c]));

  const rows: CarteraRow[] = [];
  for (const [clientId, { name }] of clientes) {
    const cuenta = cuentaByClient.get(clientId);
    if (!cuenta) {
      rows.push({
        clientId,
        clienteNombre: name,
        cuentaId: null,
        tipo: null,
        moneda: null,
        estadoCuenta: null,
        excluidaOperacion: false,
        tiposServicio: [],
        ultimoCobro: null,
        proximoCobro: null,
        proximoMonto: null,
        semaforo: "gris",
      });
      continue;
    }
    if (cuenta.excluidaOperacion) continue; // Colby: fuera del panel

    const cobrados = cuenta.cobros.filter((c) => c.estado === "COBRADO" && c.fechaCobro);
    const ultimo = cobrados.length
      ? cobrados.reduce((max, c) => (c.fechaCobro! > max ? c.fechaCobro! : max), cobrados[0].fechaCobro!)
      : null;
    const proximo = cuenta.cobros.find((c) => c.estado !== "COBRADO");

    rows.push({
      clientId,
      clienteNombre: name,
      cuentaId: cuenta.id,
      tipo: cuenta.tipo,
      moneda: cuenta.moneda,
      estadoCuenta: cuenta.estadoCuenta,
      excluidaOperacion: false,
      tiposServicio: [...new Set(cuenta.servicios.filter((s) => s.estado === "ACTIVO").map((s) => s.tipoServicio))],
      ultimoCobro: isoDay(ultimo),
      proximoCobro: proximo ? isoDay(proximo.fechaProgramada) : null,
      proximoMonto: proximo ? num(proximo.monto) : null,
      semaforo: semaforoCuenta(
        cuenta.cobros.map((c) => ({ estado: c.estado, fechaProgramadaISO: isoDay(c.fechaProgramada)! })),
        todayISO,
      ),
    });
  }

  // Orden: cuentas CONFIGURADAS primero (peor semáforo arriba, como el Sheet);
  // las "sin configurar" son backlog de setup y van al final. Sin esto, una
  // cuenta recién configurada (sin cobros aún ⇒ semáforo verde) se hundía
  // debajo de todas las filas grises "sin configurar".
  const peso: Record<Semaforo, number> = { rojo: 0, amarillo: 1, gris: 2, verde: 3 };
  rows.sort(
    (a, b) =>
      Number(a.cuentaId === null) - Number(b.cuentaId === null) ||
      peso[a.semaforo] - peso[b.semaforo] ||
      a.clienteNombre.localeCompare(b.clienteNombre),
  );
  return rows;
}

// ── Detalle de cuenta ───────────────────────────────────────────────────────────

export async function getCuentaDetail(cuentaId: string): Promise<CuentaDetailDTO | null> {
  const cuenta = await prisma.cuentaFinanciera.findUnique({
    where: { id: cuentaId },
    include: {
      client: { select: { name: true } },
      servicios: {
        orderBy: { createdAt: "asc" },
        include: {
          project: { select: { name: true, timeline: { select: { anchorStartDate: true } } } },
          planes: { where: { activo: true }, include: { cuotas: { orderBy: { orden: "asc" } } }, take: 1 },
          cobros: { orderBy: [{ fechaProgramada: "asc" }, { numCuota: "asc" }] },
        },
      },
      bitacora: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!cuenta) return null;

  // Proyectos reales del cliente para el select de ServicioForm (mismo criterio del panel).
  const proyectos = await prisma.project.findMany({
    where: {
      clientId: cuenta.clientId,
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
    },
    select: { id: true, name: true, timeline: { select: { anchorStartDate: true } } },
    orderBy: { createdAt: "desc" },
  });

  return {
    id: cuenta.id,
    clientId: cuenta.clientId,
    clienteNombre: cuenta.client.name,
    tipo: cuenta.tipo,
    viaCobro: cuenta.viaCobro,
    moneda: cuenta.moneda,
    terminosPago: cuenta.terminosPago,
    diaCobroAncla: cuenta.diaCobroAncla,
    estadoCuenta: cuenta.estadoCuenta,
    excluidaOperacion: cuenta.excluidaOperacion,
    responsableCobroTerceros: cuenta.responsableCobroTerceros,
    notas: cuenta.notas,
    estadoActualizadoPor: cuenta.estadoActualizadoPor,
    estadoActualizadoEn: iso(cuenta.estadoActualizadoEn),
    servicios: cuenta.servicios.map((s) => ({
      id: s.id,
      tipoServicio: s.tipoServicio,
      modalidad: s.modalidad,
      montoTotal: num(s.montoTotal)!,
      moneda: s.moneda,
      fechaInicioFacturacion: isoDay(s.fechaInicioFacturacion),
      duracionMeses: s.duracionMeses,
      projectId: s.projectId,
      projectName: s.project?.name ?? null,
      anchorActual: isoDay(s.project?.timeline?.anchorStartDate ?? null),
      estado: s.estado,
      descripcion: s.descripcion,
      planActivo: s.planes[0]
        ? {
            id: s.planes[0].id,
            template: s.planes[0].template,
            origen: s.planes[0].origen,
            numCuotas: s.planes[0].numCuotas,
            notas: s.planes[0].notas,
            cuotas: s.planes[0].cuotas.map((q) => ({
              orden: q.orden,
              base: q.base,
              valor: num(q.valor)!,
              offsetMeses: q.offsetMeses,
              descripcion: q.descripcion,
            })),
          }
        : null,
      cobros: s.cobros.map(serializeCobro),
    })),
    bitacora: cuenta.bitacora.map((b) => ({
      id: b.id,
      tipo: b.tipo,
      contenido: b.contenido,
      usuarioEmail: b.usuarioEmail,
      createdAt: iso(b.createdAt)!,
    })),
    proyectos: proyectos.map((p) => ({
      id: p.id,
      name: p.name,
      anchorStartDate: isoDay(p.timeline?.anchorStartDate ?? null),
    })),
  };
}

// ── Alertas ─────────────────────────────────────────────────────────────────────

export async function loadAlertas(filters?: {
  estados?: string[];
  urgencia?: string;
  cuentaId?: string;
}): Promise<AlertaDTO[]> {
  const alertas = await prisma.alertaCobro.findMany({
    where: {
      ...(filters?.estados?.length
        ? { estado: { in: filters.estados as never } }
        : {}),
      ...(filters?.urgencia ? { urgencia: filters.urgencia as never } : {}),
      ...(filters?.cuentaId ? { cuentaId: filters.cuentaId } : {}),
    },
    orderBy: [{ urgencia: "asc" }, { lastDetectedAt: "desc" }],
    take: 200,
    include: { cuenta: { select: { client: { select: { name: true } } } } },
  });
  return alertas.map((a) => ({
    id: a.id,
    cuentaId: a.cuentaId,
    clienteNombre: a.cuenta.client.name,
    cobroId: a.cobroId,
    tipo: a.tipo,
    urgencia: a.urgencia,
    mensaje: a.mensaje,
    evidencia: a.evidencia,
    occurrences: a.occurrences,
    firstDetectedAt: iso(a.firstDetectedAt)!,
    lastDetectedAt: iso(a.lastDetectedAt)!,
    estado: a.estado,
    vistaPor: a.vistaPor,
    resueltaPor: a.resueltaPor,
  }));
}

// ── Snapshot / digest ───────────────────────────────────────────────────────────

export interface SnapshotDTO {
  id: string;
  capturedAt: string;
  resumen: unknown;
  triggeredBy: string | null;
}

export async function getLatestSnapshot(): Promise<SnapshotDTO | null> {
  const snap = await prisma.snapshotCartera.findFirst({ orderBy: { capturedAt: "desc" } });
  if (!snap) return null;
  return {
    id: snap.id,
    capturedAt: iso(snap.capturedAt)!,
    resumen: snap.resumen,
    triggeredBy: snap.triggeredBy,
  };
}

// ── Input del engine (lo comparten el digest y cualquier recomputación) ─────────

/**
 * Arma el CarteraEngineInput para computeAlertSet. Clientes SIN cuenta usan un
 * cuentaId sustituto `client:{clientId}`: sus alertas CUENTA_SIN_DATOS viajan al
 * snapshot/digest pero NO se persisten como AlertaCobro (no hay FK destino) —
 * upsertAlertas las salta; el panel ya las muestra como fila "sin configurar".
 */
export async function buildCarteraEngineInput(): Promise<CarteraEngineInput> {
  const clientes = await clientIdsConProyectoReal();
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: { clientId: { in: [...clientes.keys()] } },
    select: {
      id: true,
      clientId: true,
      excluidaOperacion: true,
      servicios: {
        select: {
          id: true,
          descripcion: true,
          estado: true,
          fechaInicioFacturacion: true,
          project: { select: { timeline: { select: { anchorStartDate: true } } } },
        },
      },
      cobros: {
        select: {
          id: true,
          servicioId: true,
          estado: true,
          origen: true,
          fechaProgramada: true,
          monto: true,
        },
      },
    },
  });
  const cuentaByClient = new Map(cuentas.map((c) => [c.clientId, c]));

  const input: CarteraEngineInput = { cuentas: [] };
  for (const [clientId, { name }] of clientes) {
    const cuenta = cuentaByClient.get(clientId);
    if (!cuenta) {
      input.cuentas.push({
        cuentaId: `client:${clientId}`,
        clienteNombre: name,
        excluidaOperacion: false,
        tieneCuenta: false,
        servicios: [],
        cobros: [],
      });
      continue;
    }
    input.cuentas.push({
      cuentaId: cuenta.id,
      clienteNombre: name,
      excluidaOperacion: cuenta.excluidaOperacion,
      tieneCuenta: true,
      servicios: cuenta.servicios.map((s) => ({
        servicioId: s.id,
        descripcion: s.descripcion,
        estado: s.estado,
        fechaInicioFacturacion: isoDay(s.fechaInicioFacturacion),
        anchorActualISO: isoDay(s.project?.timeline?.anchorStartDate ?? null),
      })),
      cobros: cuenta.cobros.map((c) => ({
        cobroId: c.id,
        servicioId: c.servicioId,
        estado: c.estado,
        origen: c.origen,
        fechaProgramadaISO: isoDay(c.fechaProgramada)!,
        monto: num(c.monto)!,
      })),
    });
  }
  return input;
}
