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
  computeCajaNeta,
  computeRiesgoPago,
  diffDays,
  proyectarCostos,
  proyectarGastos,
  proyectarIngresos,
  semaforoCuenta,
  sumaPlanExpandido,
  type CajaNeta,
  type CarteraEngineInput,
  type CobroProyeccionInput,
  type CostoProyeccionInput,
  type GastoProyeccionInput,
  type MetricasCartera,
  type ProyeccionIngresos,
  type RiesgoPagoItem,
  type Semaforo,
  type TotalesMoneda,
} from "./engine";
import { Prisma } from "@prisma/client";

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
  referenciaExterna: string | null;
  promesaPago: string | null; // ISO date — fecha en que el cliente prometió pagar
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
  correoCobro: string | null;
  razonSocial: string | null;
  cedulaJuridica: string | null;
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
  tieneProyectoReal: boolean; // false = empresa creada/importada en Cobranza sin proyecto en Nexus
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
  posponerHasta: string | null; // snooze vigente = la alerta no aparece en el feed
}

// ── Serializadores (Decimal → number, Date → ISO) ───────────────────────────────

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const isoDay = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
const dayUTC = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
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
  referenciaExterna: string | null;
  promesaPago: Date | null;
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
    referenciaExterna: c.referenciaExterna,
    promesaPago: isoDay(c.promesaPago),
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

/**
 * Universo del panel de Cobranza: clientes con proyecto REAL ∪ clientes con
 * CuentaFinanciera (empresas creadas a mano o importadas — pueden no tener
 * proyecto en Nexus). Lo consumen loadCartera Y buildCarteraEngineInput: si se
 * cambia el criterio, cambia en AMBAS o el panel y el digest divergen.
 */
async function universoCobranza(): Promise<Map<string, { name: string; tieneProyectoReal: boolean }>> {
  const conProyecto = await clientIdsConProyectoReal();
  const conCuenta = await prisma.cuentaFinanciera.findMany({
    select: { clientId: true, client: { select: { name: true } } },
  });
  const map = new Map<string, { name: string; tieneProyectoReal: boolean }>();
  for (const [clientId, { name }] of conProyecto) {
    map.set(clientId, { name, tieneProyectoReal: true });
  }
  for (const c of conCuenta) {
    if (!map.has(c.clientId)) map.set(c.clientId, { name: c.client.name, tieneProyectoReal: false });
  }
  return map;
}

// ── Panel de cartera ────────────────────────────────────────────────────────────

export async function loadCartera(todayISO: string): Promise<CarteraRow[]> {
  const clientes = await universoCobranza();

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
  for (const [clientId, { name, tieneProyectoReal }] of clientes) {
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
        tieneProyectoReal,
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
      tieneProyectoReal,
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
  // las "sin configurar" son backlog de setup y van al final. (Las cuentas sin
  // cobros son GRIS — vacío ≠ al día — y ordenan junto a las programadas.)
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
    correoCobro: cuenta.correoCobro,
    razonSocial: cuenta.razonSocial,
    cedulaJuridica: cuenta.cedulaJuridica,
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
      // Snooze: pospuesta a futuro = fuera del feed hasta que la fecha llegue.
      // upsertAlertas NO toca posponerHasta en el merge → el snooze sobrevive
      // a los cortes; la alerta vuelve sola sin cambiar de estado.
      OR: [{ posponerHasta: null }, { posponerHasta: { lte: new Date() } }],
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
    posponerHasta: iso(a.posponerHasta),
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

export interface SnapshotSerieDTO {
  id: string;
  capturedAt: string;
  metricas: MetricasCartera;
}

/**
 * Serie histórica para las vistas de tendencia: solo snapshots CON métricas
 * (los pre-fase-3 tienen metricas null y no son comparables — sin backfill,
 * la historia arranca del primer corte que las capturó). Ascendente para
 * graficar directo; default un año de cortes semanales.
 */
export async function loadSnapshotSeries(limit = 52): Promise<SnapshotSerieDTO[]> {
  const snaps = await prisma.snapshotCartera.findMany({
    where: { metricas: { not: Prisma.DbNull } },
    orderBy: { capturedAt: "desc" },
    take: limit,
    select: { id: true, capturedAt: true, metricas: true },
  });
  return snaps.reverse().map((s) => ({
    id: s.id,
    capturedAt: iso(s.capturedAt)!,
    metricas: s.metricas as unknown as MetricasCartera,
  }));
}

/**
 * Riesgo de pago en vivo (no depende de cortes): MISMA fuente que el digest y
 * el reporter — buildCarteraEngineInput → computeRiesgoPago (regla V1).
 */
export async function loadRiesgo(todayISO: string): Promise<RiesgoPagoItem[]> {
  const cartera = await buildCarteraEngineInput();
  return computeRiesgoPago(cartera, { todayISO });
}

// ── Input del engine (lo comparten el digest y cualquier recomputación) ─────────

/**
 * Arma el CarteraEngineInput para computeAlertSet. Clientes SIN cuenta usan un
 * cuentaId sustituto `client:{clientId}`: sus alertas CUENTA_SIN_DATOS viajan al
 * snapshot/digest pero NO se persisten como AlertaCobro (no hay FK destino) —
 * upsertAlertas las salta; el panel ya las muestra como fila "sin configurar".
 */
export async function buildCarteraEngineInput(): Promise<CarteraEngineInput> {
  const clientes = await universoCobranza(); // MISMO universo que loadCartera (panel y digest no divergen)
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: { clientId: { in: [...clientes.keys()] } },
    select: {
      id: true,
      clientId: true,
      excluidaOperacion: true,
      estadoCuenta: true,
      servicios: {
        select: {
          id: true,
          descripcion: true,
          estado: true,
          fechaInicioFacturacion: true,
          montoTotal: true,
          duracionMeses: true,
          project: { select: { timeline: { select: { anchorStartDate: true } } } },
          planes: {
            where: { activo: true },
            take: 1,
            select: {
              template: true,
              numCuotas: true,
              cuotas: {
                orderBy: { orden: "asc" },
                select: { orden: true, base: true, valor: true, offsetMeses: true, descripcion: true },
              },
            },
          },
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
          moneda: true,
          fechaCobro: true,
          promesaPago: true,
        },
      },
    },
  });
  const cuentaByClient = new Map(cuentas.map((c) => [c.clientId, c]));

  const input: CarteraEngineInput = { cuentas: [] };
  for (const [clientId, { name, tieneProyectoReal }] of clientes) {
    const cuenta = cuentaByClient.get(clientId);
    if (!cuenta) {
      input.cuentas.push({
        cuentaId: `client:${clientId}`,
        clienteNombre: name,
        excluidaOperacion: false,
        tieneCuenta: false,
        tieneProyectoReal,
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
      tieneProyectoReal,
      estadoCuenta: cuenta.estadoCuenta,
      servicios: cuenta.servicios.map((s) => {
        const plan = s.planes[0] ?? null;
        const montoTotal = num(s.montoTotal);
        // Suma de la expansión del plan activo (alerta MONTOS_DESCUADRADOS).
        const sumaPlan =
          plan && montoTotal != null
            ? sumaPlanExpandido(
                { montoTotal, duracionMeses: s.duracionMeses },
                {
                  template: plan.template as "PAREJO" | "ENTRADA_Y_RESTO" | "SUSCRIPCION" | "PERSONALIZADO",
                  numCuotas: plan.numCuotas,
                  cuotas: plan.cuotas.map((q) => ({
                    orden: q.orden,
                    base: q.base as "PORCENTAJE" | "MONTO_FIJO",
                    valor: num(q.valor)!,
                    offsetMeses: q.offsetMeses,
                    descripcion: q.descripcion,
                  })),
                },
              )
            : null;
        return {
          servicioId: s.id,
          descripcion: s.descripcion,
          estado: s.estado,
          fechaInicioFacturacion: isoDay(s.fechaInicioFacturacion),
          anchorActualISO: isoDay(s.project?.timeline?.anchorStartDate ?? null),
          montoTotal,
          planTemplate: plan?.template ?? null,
          sumaPlan,
        };
      }),
      cobros: cuenta.cobros.map((c) => ({
        cobroId: c.id,
        servicioId: c.servicioId,
        estado: c.estado,
        origen: c.origen,
        fechaProgramadaISO: isoDay(c.fechaProgramada)!,
        monto: num(c.monto)!,
        moneda: c.moneda,
        fechaCobroISO: isoDay(c.fechaCobro),
        promesaPagoISO: isoDay(c.promesaPago),
      })),
    });
  }
  return input;
}

// ── Proyección de ingresos ──────────────────────────────────────────────────────

/**
 * Proyección "plata que viene": todos los cobros NO cobrados de cuentas dentro
 * de la operación → proyectarIngresos (vencidos en riesgo APARTE + buckets por
 * quincena/mes con CRC y USD separados). Decimal/Date se serializan ACÁ (regla
 * de oro del archivo) — el engine recibe tipos planos.
 */
export async function loadProyeccion(todayISO: string): Promise<ProyeccionIngresos> {
  const cobros = await prisma.cobro.findMany({
    where: { estado: { not: "COBRADO" }, cuenta: { excluidaOperacion: false } },
    select: {
      id: true,
      cuentaId: true,
      estado: true,
      fechaProgramada: true,
      monto: true,
      moneda: true,
      cuenta: { select: { client: { select: { name: true } } } },
    },
  });
  const input: CobroProyeccionInput[] = cobros.map((c) => ({
    cobroId: c.id,
    cuentaId: c.cuentaId,
    clienteNombre: c.cuenta.client.name,
    estado: c.estado,
    fechaProgramadaISO: isoDay(c.fechaProgramada)!,
    monto: num(c.monto)!,
    moneda: c.moneda,
  }));
  return proyectarIngresos(input, { todayISO });
}

// ── Cola de cobros (landing del módulo) ─────────────────────────────────────────

/** Una fila accionable de la cola: un cobro pendiente con su contexto plano.
 *  `id` (no `cobroId`) a propósito: satisface estructuralmente los props mínimos
 *  de los diálogos compartidos (RegistrarPago/Promesa/Borrador) igual que CobroDTO. */
export interface ColaCobroRow {
  id: string;
  servicioId: string;
  cuentaId: string;
  clientId: string;
  clienteNombre: string;
  servicioTipo: string;
  servicioDescripcion: string | null;
  numCuota: number | null;
  periodo: string;
  fechaProgramada: string; // ISO date
  diasAtraso: number; // diffDays(fechaProgramada, hoy) — positivo = ya pasó
  monto: number;
  moneda: string;
  estado: string; // PROGRAMADO | POR_COBRAR | SIN_DATO (COBRADO excluido)
  origen: string; // PLAN | CATCH_UP | MANUAL
  promesaPago: string | null;
}

/**
 * Todos los cobros PENDIENTES de cuentas dentro de la operación, planos y listos
 * para accionar (la cola agrupa/ordena client-side con las reglas del engine).
 * El `where` es ESPEJO de loadProyeccion — si cambia el universo de uno, cambia
 * el del otro o la cola y la proyección divergen.
 */
export async function loadColaCobros(todayISO: string): Promise<ColaCobroRow[]> {
  const cobros = await prisma.cobro.findMany({
    where: { estado: { not: "COBRADO" }, cuenta: { excluidaOperacion: false } },
    select: {
      id: true,
      servicioId: true,
      cuentaId: true,
      numCuota: true,
      periodo: true,
      fechaProgramada: true,
      monto: true,
      moneda: true,
      estado: true,
      origen: true,
      promesaPago: true,
      servicio: { select: { tipoServicio: true, descripcion: true } },
      cuenta: { select: { clientId: true, client: { select: { name: true } } } },
    },
    orderBy: { fechaProgramada: "asc" },
  });
  return cobros.map((c) => {
    const fecha = isoDay(c.fechaProgramada)!;
    return {
      id: c.id,
      servicioId: c.servicioId,
      cuentaId: c.cuentaId,
      clientId: c.cuenta.clientId,
      clienteNombre: c.cuenta.client.name,
      servicioTipo: c.servicio.tipoServicio,
      servicioDescripcion: c.servicio.descripcion,
      numCuota: c.numCuota,
      periodo: c.periodo,
      fechaProgramada: fecha,
      diasAtraso: diffDays(fecha, todayISO),
      monto: num(c.monto)!,
      moneda: c.moneda,
      estado: c.estado,
      origen: c.origen,
      promesaPago: isoDay(c.promesaPago),
    };
  });
}

// ── Costos recurrentes + caja neta (fase 4 — SUPER_ADMIN-only) ──────────────────
// ⚠ PRIVACIDAD: estos DTOs llevan salarios estimados. Consumidos SOLO por routes
// con `guardCostosAccess` y por el branch condicional de app/cobranza/page.tsx
// (isCostosRole). JAMÁS importarlos desde un panel/endpoint visible para ADMIN.

export interface CostoRecurrenteDTO {
  id: string;
  categoria: string;
  nombre: string;
  monto: number; // all-in estimado canónico
  moneda: string;
  frecuencia: string;
  teamMemberId: string | null;
  teamMemberName: string | null; // join solo para mostrar
  montoBase: number | null;
  factorCargas: number | null;
  activo: boolean;
  finalizadoEl: string | null; // baja definitiva (≠ pausa); null = vigente
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function loadCostos(): Promise<CostoRecurrenteDTO[]> {
  const filas = await prisma.costoRecurrente.findMany({
    include: { teamMember: { select: { name: true } } },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });
  return filas.map((c) => ({
    id: c.id,
    categoria: c.categoria,
    nombre: c.nombre,
    monto: num(c.monto)!,
    moneda: c.moneda,
    frecuencia: c.frecuencia,
    teamMemberId: c.teamMemberId,
    teamMemberName: c.teamMember?.name ?? null,
    montoBase: num(c.montoBase),
    factorCargas: num(c.factorCargas),
    activo: c.activo,
    finalizadoEl: isoDay(c.finalizadoEl),
    notas: c.notas,
    createdAt: iso(c.createdAt)!,
    updatedAt: iso(c.updatedAt)!,
  }));
}

// ── Gastos puntuales + movimientos de costos ────────────────────────────────────

export interface GastoPuntualDTO {
  id: string;
  nombre: string;
  monto: number;
  moneda: string;
  fecha: string; // YYYY-MM-DD
  tags: string[];
  notas: string | null;
  createdAt: string;
}

export async function loadGastos(): Promise<GastoPuntualDTO[]> {
  const filas = await prisma.gastoPuntual.findMany({ orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] });
  return filas.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    monto: num(g.monto)!,
    moneda: g.moneda,
    fecha: isoDay(g.fecha)!,
    tags: g.tags,
    notas: g.notas,
    createdAt: iso(g.createdAt)!,
  }));
}

export interface CostoMovimientoDTO {
  id: string;
  costoId: string | null; // null = el costo se borró (la historia sobrevive)
  tipo: string;
  nombre: string;
  categoria: string;
  moneda: string;
  frecuencia: string;
  monto: number;
  montoAnterior: number | null;
  fechaEfectiva: string; // YYYY-MM-DD
  usuarioEmail: string | null;
  notas: string | null;
  createdAt: string;
}

export async function loadMovimientosCostos(): Promise<CostoMovimientoDTO[]> {
  const filas = await prisma.costoMovimiento.findMany({
    orderBy: [{ fechaEfectiva: "desc" }, { createdAt: "desc" }],
  });
  return filas.map((m) => ({
    id: m.id,
    costoId: m.costoId,
    tipo: m.tipo,
    nombre: m.nombre,
    categoria: m.categoria,
    moneda: m.moneda,
    frecuencia: m.frecuencia,
    monto: num(m.monto)!,
    montoAnterior: num(m.montoAnterior),
    fechaEfectiva: isoDay(m.fechaEfectiva)!,
    usuarioEmail: m.usuarioEmail,
    notas: m.notas,
    createdAt: iso(m.createdAt)!,
  }));
}

export interface CajaNetaDTO extends CajaNeta {
  /** Burn mensual estimado de los costos activos — lo consumen ambos paneles. */
  totalMensualCostos: TotalesMoneda;
  /** Gastos puntuales FUTUROS que caen dentro del horizonte (ya incluidos en el
   *  lado sale de los buckets) — para el banner de honestidad del panel. */
  gastosPlanificados: { count: number; totales: TotalesMoneda };
}

/**
 * ÚNICO compositor de la caja neta: entra (loadProyeccion) + sale (costos activos
 * → proyectarCostos + gastos futuros → proyectarGastos) con LOS MISMOS opts por
 * construcción (defaults del engine) → keys de bucket idénticas para
 * computeCajaNeta. Los gastos PASADOS (fecha < hoy) NO viajan a la caja neta —
 * son solo registro/reporting en el tab.
 */
export async function loadCajaNeta(todayISO: string): Promise<CajaNetaDTO> {
  const [entra, filasCostos, filasGastos] = await Promise.all([
    loadProyeccion(todayISO),
    prisma.costoRecurrente.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        categoria: true,
        monto: true,
        moneda: true,
        frecuencia: true,
        activo: true,
        finalizadoEl: true,
      },
    }),
    prisma.gastoPuntual.findMany({
      where: { fecha: { gte: dayUTC(todayISO) } }, // el pasado no entra al neto
      select: { id: true, nombre: true, monto: true, moneda: true, fecha: true },
    }),
  ]);
  const costos: CostoProyeccionInput[] = filasCostos.map((c) => ({
    costoId: c.id,
    nombre: c.nombre,
    categoria: c.categoria,
    monto: num(c.monto)!,
    moneda: c.moneda,
    frecuencia: c.frecuencia,
    activo: c.activo,
    finalizadoEl: isoDay(c.finalizadoEl),
  }));
  const gastos: GastoProyeccionInput[] = filasGastos.map((g) => ({
    gastoId: g.id,
    nombre: g.nombre,
    monto: num(g.monto)!,
    moneda: g.moneda,
    fechaISO: isoDay(g.fecha)!,
  }));
  const sale = proyectarCostos(costos, { todayISO });
  const saleGastos = proyectarGastos(gastos, { todayISO });
  const bucketizados = saleGastos.buckets.reduce((n, b) => n + b.gastos.length, 0);
  return {
    ...computeCajaNeta(entra, sale, saleGastos),
    totalMensualCostos: sale.totalMensual,
    gastosPlanificados: { count: bucketizados, totales: saleGastos.totalFuturo },
  };
}
