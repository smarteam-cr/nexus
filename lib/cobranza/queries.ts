/**
 * lib/cobranza/queries.ts
 *
 * Lecturas Prisma del módulo Cobranza (server-only). REGLA DE ORO: Prisma.Decimal
 * NO cruza esta frontera — los serializadores de acá abajo lo convierten a number
 * (y las Date a ISO) antes de que nada llegue a un Client Component. Es la única
 * defensa sistemática contra el bug silencioso de "Decimal no es serializable".
 */
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere, proyectoFacturableWhere } from "@/lib/projects/scope";
import {
  computeCajaNeta,
  computeRiesgoPago,
  DEFAULT_CREDITO_DIAS,
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
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import {
  calcularTarjeta,
  cargadoMensualDe,
  cicloDeTarjeta,
  mensualizado,
  type CicloTarjeta,
  type MonedaTarjeta,
} from "./tarjetas";
import { coberturaDe, periodoDe, periodosDeAguinaldo, quincenasDistintas } from "./planilla";
import {
  detectarInconsistencias,
  type EstadoParaAuditar,
  type Inconsistencia,
} from "@/lib/finanzas/inconsistencias";
import { clasificarVentas } from "@/lib/ventas/clasificar-huecos";
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/sync-ganadas";
import {
  calcularEquilibrio,
  type CostoVigente,
  type EgresoDeMes,
  type IngresoDeMes,
  type MonedaEq,
  type ReporteEquilibrio,
  type TasaDeMes,
  type VentanaEquilibrio,
} from "@/lib/finanzas/equilibrio";
import { normalizePartner } from "./schema";
import {
  agruparPorCadencia,
  bucketDeCadencia,
  bucketSiguiente,
  labelDeFrecuencia,
  type PagoDeAliado,
  type TotalDeBucket,
} from "./partners";
import { calcularAguinaldo, type AguinaldoResultado } from "@/lib/finanzas/aguinaldo";
import {
  devengarComisiones,
  POLITICA_PAGO_COMISION,
  POLITICA_PAGO_COMISION_LABEL,
  type ComisionDevengada,
  type DevengoResultado,
  type VentaSinComisionar,
  type ReglaComision,
} from "./comisiones";

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
  facturadoPor: string | null;
  facturadoEn: string | null;
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
  diaCobroAncla: number | null;
  creditoDias: number | null;
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
  facturadoPor: string | null;
  facturadoEn: Date | null;
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
    facturadoPor: c.facturadoPor,
    facturadoEn: iso(c.facturadoEn),
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
 * Devuelve los clientId de clientes con al menos un proyecto FACTURABLE.
 *
 * El criterio ya no está copiado de lib/portfolio/load.ts: los dos importan el mismo
 * fragmento de lib/projects/scope.ts. `CS_CLIENT_WHERE` se suma acá y NO se mete en el
 * fragmento porque es una regla del CLIENTE (qué empresa cuenta como cartera), no del
 * proyecto — y el fragmento tiene que servir también donde el cliente ya viene filtrado.
 *
 * Qué deja afuera además de lo de siempre: los proyectos marcados internos y los
 * desarrollos/sitios que son HERMANOS de una implementación (ahí cobra el hermano, no
 * ellos). Los que van solos —el caso Judesur— siguen entrando igual.
 */
async function clientIdsConProyectoReal(): Promise<Map<string, { name: string }>> {
  const projects = await prisma.project.findMany({
    where: proyectoFacturableWhere({ client: { ...CS_CLIENT_WHERE } }),
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
      creditoDias: true,
      servicios: { select: { tipoServicio: true, estado: true } },
      cobros: {
        select: {
          estado: true,
          fechaProgramada: true,
          fechaCobro: true,
          fechaEmision: true,
          promesaPago: true,
          monto: true,
        },
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
        cuenta.cobros.map((c) => ({
          estado: c.estado,
          fechaProgramadaISO: isoDay(c.fechaProgramada)!,
          fechaEmisionISO: isoDay(c.fechaEmision),
          promesaPagoISO: isoDay(c.promesaPago),
        })),
        todayISO,
        cuenta.creditoDias ?? undefined,
      ),
    });
  }

  // Orden: cuentas CONFIGURADAS primero (peor semáforo arriba, como el Sheet);
  // las "sin configurar" son backlog de setup y van al final. (Las cuentas sin
  // cobros son GRIS — vacío ≠ al día — y ordenan junto a las programadas.)
  const peso: Record<Semaforo, number> = { rojo: 0, amarillo: 1, azul: 2, gris: 3, verde: 4 };
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

  /* Proyectos del cliente para el select de ServicioForm. Usa el criterio ANCHO
     (clasificable), no el facturable del panel: es a propósito. Acá una persona está
     eligiendo a mano a qué proyecto colgarle un servicio, y angostar la lista le sacaría
     opciones sin explicarle por qué. Si mañana se quiere que el picker avise "este es
     hermano de una implementación, cobra el otro", eso es un aviso en la UI, no un filtro
     silencioso — y es tema de la tanda de cobranza. */
  const proyectos = await prisma.project.findMany({
    where: proyectoClasificableWhere({ clientId: cuenta.clientId }),
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
    creditoDias: cuenta.creditoDias,
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
 * graficar directo; default un año de cortes quincenales.
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
      creditoDias: true,
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
          fechaEmision: true,
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
      creditoDias: cuenta.creditoDias,
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
        fechaEmisionISO: isoDay(c.fechaEmision),
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
      fechaEmision: true,
      monto: true,
      moneda: true,
      cuenta: { select: { creditoDias: true, client: { select: { name: true } } } },
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
    // Criterio único de vencido (2026-07-24): sin estos dos, la proyección volvía
    // a clasificar por fecha sola y contradecía a la cola de cobros.
    fechaEmisionISO: isoDay(c.fechaEmision),
    creditoDias: c.cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS,
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
  fechaEmision: string | null;
  /** Resuelto (cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS) — nunca null acá,
   *  para que el recálculo cliente-side del semáforo (ColaCobros.tsx) sea
   *  consistente con el servidor sin tener que importar el default. */
  creditoDias: number;
  /**
   * NACIONAL | INTERNACIONAL — de qué lado se factura la cuenta. Viaja en la fila
   * porque la plataforma de facturación depende de él (Odoo lo nacional, Mercury lo
   * internacional) y la cola es donde se decide qué se procesa en cada pasada; sin
   * esto hay que abrir cuenta por cuenta para saberlo.
   */
  tipoCuenta: string;
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
      fechaEmision: true,
      servicio: { select: { tipoServicio: true, descripcion: true } },
      cuenta: {
        select: { clientId: true, creditoDias: true, tipo: true, client: { select: { name: true } } },
      },
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
      fechaEmision: isoDay(c.fechaEmision),
      creditoDias: c.cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS,
      tipoCuenta: c.cuenta.tipo,
    };
  });
}

// ── Ingresos variables ──────────────────────────────────────────────────────────
// "Entradas de dinero que NO son el flujo constante de cobranza quincenal": un
// trabajo puntual fuera de plan, o una cuenta rescatada — el proyecto trabado que
// se destraba, la deuda vieja que finalmente entra.
//
// Es una VISTA DERIVADA de los cobros que ya existen, sin tabla propia: así el
// número no puede discrepar del de Cobranza, y registrar uno sigue siendo el
// mismo "Registrar pago" de siempre (cero caminos de escritura nuevos).

/**
 * Días de atraso a partir de los cuales un cobro que finalmente entró cuenta como
 * RESCATE y no como "pagó tarde". 60 días ≈ dos ciclos de cobro completos: a esa
 * altura la plata ya se había dado por difícil.
 */
export const RESCATE_UMBRAL_DIAS = 60;

export interface IngresoVariableRow {
  id: string;
  /** null = ingreso general, sin cliente (solo posible en los REGISTRADOS). */
  clientId: string | null;
  clienteNombre: string | null;
  concepto: string;
  fechaCobro: string; // ISO — cuándo entró la plata
  /** Solo los derivados de un cobro la tienen. */
  fechaProgramada: string | null;
  /** Días entre lo programado y lo cobrado. null en los registrados a mano. */
  diasAtraso: number | null;
  monto: number;
  moneda: string;
  /**
   * REGISTRADO = fila propia de IngresoVariable (se carga desde esta pantalla).
   * MANUAL / RESCATE = DERIVADOS de un Cobro ya existente (solo lectura acá).
   */
  tipo: "REGISTRADO" | "MANUAL" | "RESCATE";
  notas: string | null;
  /** Solo en REGISTRADO: quién lo cargó. */
  registradoPor: string | null;
}

/**
 * TODO lo que entró fuera del ciclo quincenal, de DOS orígenes que no se solapan:
 *
 *  1. `IngresoVariable` (REGISTRADO) — filas propias, cargadas desde la pantalla.
 *     Es la única vía para un ingreso SIN servicio contratado detrás, o sin
 *     cliente. No pueden ser un `Cobro`: ese exige servicioId + cuentaId.
 *  2. `Cobro` ya COBRADO que entró fuera de ritmo (solo lectura acá):
 *     - `origen = MANUAL`: pago fuera de plan sobre un servicio existente.
 *     - atraso > RESCATE_UMBRAL_DIAS: salió de un plan pero entró muchísimo después.
 *
 * ⚠ NO hay doble conteo por construcción: un `IngresoVariable` nunca es un `Cobro`
 * y viceversa. La regla para la persona (dicha en la UI): si la plata vino de un
 * servicio contratado, se registra en Cobranza; acá van las que no.
 */
export async function loadIngresosVariables(todayISO: string): Promise<IngresoVariableRow[]> {
  void todayISO; // la ventana la define fechaCobro de cada fila, no el día de hoy

  const registrados = await prisma.ingresoVariable.findMany({
    select: {
      id: true,
      concepto: true,
      monto: true,
      moneda: true,
      fecha: true,
      notas: true,
      registradoPor: true,
      clientId: true,
      client: { select: { name: true } },
    },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  });

  const cobros = await prisma.cobro.findMany({
    where: { estado: "COBRADO", fechaCobro: { not: null }, cuenta: { excluidaOperacion: false } },
    select: {
      id: true,
      origen: true,
      fechaCobro: true,
      fechaProgramada: true,
      monto: true,
      moneda: true,
      notas: true,
      servicio: { select: { tipoServicio: true, descripcion: true } },
      cuenta: { select: { clientId: true, client: { select: { name: true } } } },
    },
    orderBy: { fechaCobro: "desc" },
  });

  const filas: IngresoVariableRow[] = registrados.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clienteNombre: r.client?.name ?? null,
    concepto: r.concepto,
    fechaCobro: isoDay(r.fecha)!,
    fechaProgramada: null,
    diasAtraso: null,
    monto: num(r.monto)!,
    moneda: r.moneda,
    tipo: "REGISTRADO",
    notas: r.notas,
    registradoPor: r.registradoPor,
  }));

  for (const c of cobros) {
    const cobro = isoDay(c.fechaCobro)!;
    const programada = isoDay(c.fechaProgramada)!;
    const atraso = diffDays(programada, cobro);
    const esManual = c.origen === "MANUAL";
    const esRescate = atraso > RESCATE_UMBRAL_DIAS;
    if (!esManual && !esRescate) continue;
    filas.push({
      id: c.id,
      clientId: c.cuenta.clientId,
      clienteNombre: c.cuenta.client.name,
      concepto: c.servicio.descripcion ?? c.servicio.tipoServicio,
      fechaCobro: cobro,
      fechaProgramada: programada,
      diasAtraso: atraso,
      monto: num(c.monto)!,
      moneda: c.moneda,
      // Un cobro manual con mucho atraso cuenta como MANUAL: su origen es el
      // hecho más fuerte (nunca estuvo en el ciclo).
      tipo: esManual ? "MANUAL" : "RESCATE",
      notas: c.notas,
      registradoPor: null,
    });
  }

  // Orden único por fecha de entrada, mezclando ambos orígenes.
  filas.sort((a, b) => (a.fechaCobro < b.fechaCobro ? 1 : a.fechaCobro > b.fechaCobro ? -1 : 0));
  return filas;
}

// ── Comisiones de PARTNER (ingreso — superficie ADMIN, gate cobranza.read) ──────
// NO lleva los guards de costos: es plata que ENTRA, igual que IngresoVariable.
// ⚠ Este loader JAMÁS devuelve comisiones de VENDEDOR. Un `loadComisiones()` que
// trajera las dos metería montos de remuneración en el payload RSC del ADMIN
// aunque la UI no los pintara.

export interface ComisionPartnerDTO {
  id: string;
  partner: string;
  /** El aliado configurado, si ya existe. null = pago sin aliado dado de alta. */
  partnerId: string | null;
  concepto: string | null;
  monto: number;
  moneda: string;
  fecha: string;
  clientId: string | null;
  clienteNombre: string | null;
  notas: string | null;
  registradoPor: string;
  createdAt: string;
}

export interface PartnerComercialDTO {
  id: string;
  nombre: string;
  clave: string;
  frecuenciaMeses: number;
  frecuenciaLabel: string;
  activo: boolean;
  notas: string | null;
  cuantasComisiones: number;
}

/**
 * El historial de UN aliado, agrupado a SU cadencia (no mes a mes: estos pagos
 * llegan cada N meses y una grilla mensual sale llena de huecos).
 */
export interface HistorialPartnerDTO {
  partnerId: string | null;
  nombre: string;
  /** null = el aliado no está configurado todavía; se cae a mensual para agrupar. */
  frecuenciaMeses: number | null;
  frecuenciaLabel: string;
  periodos: TotalDeBucket[];
  /**
   * Dónde cae el próximo período según la cadencia. NO dice cuánto: eso nadie lo
   * sabe y ponerle un número sería fabricar.
   */
  proximo: { clave: string; etiqueta: string } | null;
}

export interface ComisionesPartnerDTO {
  comisiones: ComisionPartnerDTO[];
  /** Totales por partner y moneda SEPARADA — "lo que ganamos con cada uno". */
  porPartner: Array<{ partner: string; moneda: string; total: number; cuantas: number }>;
  /** Totales generales, también por moneda. CRC y USD nunca se suman. */
  totales: Record<string, number>;
  /** Los aliados configurados, para el bloque de administración. */
  partners: PartnerComercialDTO[];
  /** El historial por aliado, a la cadencia de cada uno. */
  historial: HistorialPartnerDTO[];
}

export async function loadComisionesPartner(): Promise<ComisionesPartnerDTO> {
  const [filas, partnersRaw] = await Promise.all([
    prisma.comisionPartner.findMany({
      include: { client: { select: { name: true } } },
      orderBy: [{ fecha: "desc" }, { partner: "asc" }],
    }),
    prisma.partnerComercial.findMany({ orderBy: [{ nombre: "asc" }] }),
  ]);

  const comisiones: ComisionPartnerDTO[] = filas.map((c) => ({
    id: c.id,
    partner: c.partner,
    partnerId: c.partnerId,
    concepto: c.concepto,
    monto: num(c.monto)!,
    moneda: c.moneda,
    fecha: isoDay(c.fecha)!,
    clientId: c.clientId,
    clienteNombre: c.client?.name ?? null,
    notas: c.notas,
    registradoPor: c.registradoPor,
    createdAt: iso(c.createdAt)!,
  }));

  // Agrupa por (partner normalizado, moneda): "HubSpot" y "hubspot" son el mismo,
  // pero USD y CRC del mismo partner son dos líneas, nunca una convertida.
  const acc = new Map<string, { partner: string; moneda: string; total: number; cuantas: number }>();
  for (const c of comisiones) {
    const k = `${normalizePartner(c.partner)}::${c.moneda}`;
    const prev = acc.get(k);
    if (prev) {
      prev.total = Math.round((prev.total + c.monto) * 100) / 100;
      prev.cuantas += 1;
    } else {
      acc.set(k, { partner: c.partner, moneda: c.moneda, total: c.monto, cuantas: 1 });
    }
  }
  const porPartner = [...acc.values()].sort(
    (a, b) => b.total - a.total || a.partner.localeCompare(b.partner),
  );

  const totales: Record<string, number> = {};
  for (const p of porPartner) {
    totales[p.moneda] = Math.round(((totales[p.moneda] ?? 0) + p.total) * 100) / 100;
  }

  const partners: PartnerComercialDTO[] = partnersRaw.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    clave: p.clave,
    frecuenciaMeses: p.frecuenciaMeses,
    frecuenciaLabel: labelDeFrecuencia(p.frecuenciaMeses),
    activo: p.activo,
    notas: p.notas,
    cuantasComisiones: comisiones.filter((c) => c.partnerId === p.id).length,
  }));

  return { comisiones, porPartner, totales, partners, historial: armarHistorial(comisiones, partnersRaw) };
}

/**
 * El historial por aliado, cada uno a SU cadencia.
 *
 * ⚠ Agrupa por `partnerId` CUANDO EXISTE y cae a la clave normalizada solo si el
 * pago todavía no está ligado. Al revés —agrupando siempre por el string, como
 * estaba— renombrar un aliado le huerfanizaba TODO el historial: las filas
 * seguían con el nombre viejo, la config no matcheaba, la cadencia se perdía y
 * la pantalla ofrecía «configurar» con el nombre viejo, creando un duplicado.
 * Lo cazó la revisión adversarial de G3.
 *
 * Un aliado SIN configurar cae a cadencia mensual para poder agrupar algo, y el
 * DTO lo dice (`frecuenciaMeses: null`) en vez de aparentar que alguien la eligió.
 */
function armarHistorial(
  comisiones: ComisionPartnerDTO[],
  partners: Array<{ id: string; nombre: string; clave: string; frecuenciaMeses: number }>,
): HistorialPartnerDTO[] {
  const porClave = new Map(partners.map((p) => [p.clave, p]));
  const porId = new Map(partners.map((p) => [p.id, p]));

  const grupos = new Map<string, { nombre: string; pagos: PagoDeAliado[] }>();
  for (const c of comisiones) {
    // El vínculo duro manda; el nombre es el fallback de lo no ligado.
    const cfg = (c.partnerId ? porId.get(c.partnerId) : null) ?? porClave.get(normalizePartner(c.partner)) ?? null;
    const clave = cfg?.clave ?? normalizePartner(c.partner);
    let g = grupos.get(clave);
    if (!g) {
      g = { nombre: cfg?.nombre ?? c.partner, pagos: [] };
      grupos.set(clave, g);
    }
    g.pagos.push({ fecha: c.fecha, monto: c.monto, moneda: c.moneda });
  }

  const out: HistorialPartnerDTO[] = [];
  for (const [clave, g] of grupos) {
    const cfg = porClave.get(clave) ?? null;
    const frecuencia = cfg?.frecuenciaMeses ?? null;
    const periodos = agruparPorCadencia(g.pagos, frecuencia ?? 1);
    // El próximo se calcula desde el bucket MÁS NUEVO con pago. Sin cadencia
    // configurada no se dice nada: adivinar el ritmo desde 1-2 pagos sería
    // exactamente la fabricación que este módulo evita.
    const ultimaFecha = g.pagos.map((p) => p.fecha).sort().at(-1);
    const proximo =
      frecuencia && ultimaFecha
        ? (() => {
            const sig = bucketSiguiente(bucketDeCadencia(ultimaFecha, frecuencia), frecuencia);
            return { clave: sig.clave, etiqueta: sig.etiqueta };
          })()
        : null;
    out.push({
      partnerId: cfg?.id ?? null,
      nombre: g.nombre,
      frecuenciaMeses: frecuencia,
      frecuenciaLabel: frecuencia ? labelDeFrecuencia(frecuencia) : "Sin frecuencia configurada",
      periodos,
      proximo,
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
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

// ── Tarjetas de crédito (SUPER_ADMIN-only) ──────────────────────────────────────
// ⚠ PRIVACIDAD: el DTO trae los costos asignados a cada tarjeta, y un costo
// asignado puede ser un SALARIO (con su nombre y su monto). Se consume SOLO
// desde la ruta con `guardCostosAccess` y desde la página con `isCostosRole`.

/** Un costo asignado a la tarjeta, en la forma mínima que pinta el panel. */
export interface TarjetaCostoDTO {
  id: string;
  nombre: string;
  categoria: string;
  monto: number;
  moneda: string;
  frecuencia: string;
  activo: boolean;
  finalizadoEl: string | null;
  /** Ya mensualizado (un ANUAL va /12) — lo que suma para el cargo del mes. */
  montoMensual: number;
}

export interface TarjetaDTO {
  id: string;
  alias: string;
  emisor: string | null;
  /** SOLO los últimos 4. El número completo no existe en esta base. */
  ultimos4: string | null;
  moneda: string;
  limite: number | null;
  titularTeamMemberId: string | null;
  titularNombre: string | null;
  diaCorte: number | null;
  diaPago: number | null;
  saldoUsado: number | null;
  saldoAlDia: string | null;
  saldoPorEmail: string | null;
  activa: boolean;
  notas: string | null;

  // ── Derivados. UNA sola definición, en lib/cobranza/tarjetas.ts ──
  /** Suma mensualizada de los costos asignados EN LA MONEDA DE LA TARJETA. */
  cargadoMensual: number;
  /** Cuántos costos quedaron afuera de esa suma por estar en otra moneda. */
  cargadoEnOtraMoneda: number;
  /** límite − saldo. null = falta un dato; jamás se aproxima con los cargos. */
  disponible: number | null;
  usoPorcentaje: number | null;
  noCabeElProximoMes: boolean;
  faltaDato: "limite" | "saldo" | "ambos" | null;
  /**
   * Cuándo corta, cuándo vence el pago y cuántos días faltan. null = falta
   * `diaCorte` o `diaPago`, y la pantalla lo DICE — jamás se asume un día.
   * La fecha de pago va rotulada como ESTIMACIÓN (ver `CicloTarjeta.estimado`).
   */
  ciclo: CicloTarjeta | null;

  costos: TarjetaCostoDTO[];
  createdAt: string;
  updatedAt: string;
}

/** `hoyISO` entra por parámetro (fecha de Costa Rica, la resuelve el llamador):
 *  el motor de tarjetas no puede leer el reloj — ver lib/cobranza/tarjetas.ts. */
export async function loadTarjetas(hoyISO: string): Promise<TarjetaDTO[]> {
  const filas = await prisma.tarjetaCredito.findMany({
    include: {
      titular: { select: { name: true } },
      costos: {
        include: {
          costo: {
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
          },
        },
      },
    },
    orderBy: [{ activa: "desc" }, { alias: "asc" }],
  });

  return filas.map((t) => {
    const moneda = t.moneda as MonedaTarjeta;
    const costos: TarjetaCostoDTO[] = t.costos.map((p) => ({
      id: p.costo.id,
      nombre: p.costo.nombre,
      categoria: p.costo.categoria,
      monto: num(p.costo.monto)!,
      moneda: p.costo.moneda,
      frecuencia: p.costo.frecuencia,
      activo: p.costo.activo,
      finalizadoEl: isoDay(p.costo.finalizadoEl),
      montoMensual: mensualizado(num(p.costo.monto)!, p.costo.frecuencia),
    }));

    const cargado = cargadoMensualDe(costos, moneda);
    const limite = num(t.limite);
    const saldoUsado = num(t.saldoUsado);
    const calc = calcularTarjeta({ limite, saldoUsado, cargadoMensual: cargado.total });

    return {
      id: t.id,
      alias: t.alias,
      emisor: t.emisor,
      ultimos4: t.ultimos4,
      moneda: t.moneda,
      limite,
      titularTeamMemberId: t.titularTeamMemberId,
      titularNombre: t.titular?.name ?? null,
      diaCorte: t.diaCorte,
      diaPago: t.diaPago,
      saldoUsado,
      saldoAlDia: isoDay(t.saldoAlDia),
      saldoPorEmail: t.saldoPorEmail,
      activa: t.activa,
      notas: t.notas,
      cargadoMensual: cargado.total,
      cargadoEnOtraMoneda: cargado.enOtraMoneda,
      disponible: calc.disponible,
      usoPorcentaje: calc.usoPorcentaje,
      noCabeElProximoMes: calc.noCabeElProximoMes,
      faltaDato: calc.faltaDato,
      ciclo: cicloDeTarjeta(hoyISO, t.diaCorte, t.diaPago),
      costos,
      createdAt: iso(t.createdAt)!,
      updatedAt: iso(t.updatedAt)!,
    };
  });
}

// ── Libro de planilla (SUPER_ADMIN-only) ────────────────────────────────────────
// ⚠ PRIVACIDAD: esto es lo que se le PAGÓ a cada persona. Pesa lo mismo que un
// salario de CostoRecurrente — se consume SOLO desde la ruta con
// `guardCostosAccess` y desde la página con `isCostosRole`.

/** Una comisión liquidada JUNTO a esta quincena (la escribe F3 al liquidar). */
export interface PagoComisionDTO {
  id: string;
  monto: number;
  moneda: string;
  base: number;
  porcentaje: number;
  /** Snapshot por cobro: de qué cliente y de qué cobro salió cada colón. */
  detalle: unknown;
}

export interface PagoPlanillaDTO {
  id: string;
  sujetoTeamMemberId: string | null;
  /** Snapshot: la fila se lee sola aunque la persona se dé de baja. */
  sujetoNombre: string;
  periodo: string;
  quincena: number;
  fechaProgramada: string;
  /** Congelado al crear la fila. NO se deriva del costo (ver el modelo). */
  monto: number;
  moneda: string;
  estado: string;
  fechaPago: string | null;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  notas: string | null;
  comisiones: PagoComisionDTO[];
  /** base + comisiones: lo que efectivamente recibió esa quincena. */
  totalConComisiones: number;
  createdAt: string;
}

export interface LibroPlanillaDTO {
  pagos: PagoPlanillaDTO[];
  /** "N de M quincenas registradas" — se declara, no se rellena. */
  cobertura: { registradas: number; posibles: number; texto: string };
  /** Los períodos que abarca el libro hoy, del más viejo al más nuevo. */
  periodos: string[];
}

/**
 * El libro completo. Sin paginar a propósito: son ~17 personas × 24 quincenas al
 * año, y agrupar por mes en el cliente es más simple que un cursor que después
 * hay que mantener sincronizado con la vista agrupada.
 */
export async function loadLibroPlanilla(): Promise<LibroPlanillaDTO> {
  const filas = await prisma.pagoPlanilla.findMany({
    include: {
      comisiones: {
        select: { id: true, monto: true, moneda: true, base: true, porcentaje: true, detalle: true },
      },
    },
    orderBy: [{ periodo: "desc" }, { quincena: "asc" }, { sujetoNombre: "asc" }],
  });

  const pagos: PagoPlanillaDTO[] = filas.map((p) => {
    const comisiones: PagoComisionDTO[] = p.comisiones.map((c) => ({
      id: c.id,
      monto: num(c.monto)!,
      moneda: c.moneda,
      base: num(c.base)!,
      porcentaje: num(c.porcentaje)!,
      detalle: c.detalle,
    }));
    const monto = num(p.monto)!;
    // Solo suman las comisiones de la MISMA moneda que el pago: CRC y USD no se
    // mezclan ni acá ni en ningún lado (regla transversal del módulo).
    const extra = comisiones
      .filter((c) => c.moneda === p.moneda)
      .reduce((a, c) => a + c.monto, 0);
    return {
      id: p.id,
      sujetoTeamMemberId: p.sujetoTeamMemberId,
      sujetoNombre: p.sujetoNombre,
      periodo: p.periodo,
      quincena: p.quincena,
      fechaProgramada: isoDay(p.fechaProgramada)!,
      monto,
      moneda: p.moneda,
      estado: p.estado,
      fechaPago: isoDay(p.fechaPago),
      confirmadoPor: p.confirmadoPor,
      confirmadoEn: iso(p.confirmadoEn),
      notas: p.notas,
      comisiones,
      totalConComisiones: Math.round((monto + extra) * 100) / 100,
      createdAt: iso(p.createdAt)!,
    };
  });

  const periodos = [...new Set(pagos.map((p) => p.periodo))].sort();
  // ⚠ El numerador son QUINCENAS DISTINTAS, no filas (una fila es persona ×
  // quincena). El porqué y el bug que esto cierra están en `quincenasDistintas`.
  return {
    pagos,
    cobertura: coberturaDe(quincenasDistintas(pagos), periodos),
    periodos,
  };
}

/**
 * El aguinaldo de cada persona para `anio`, DERIVADO del libro. No hay tabla de
 * aguinaldos: es una vista, y se recalcula sola cuando el libro cambia.
 *
 * ⚠ PRIVACIDAD: son remuneraciones. Misma superficie SUPER_ADMIN que el libro.
 */
export async function loadAguinaldo(anio: number, hoyISO: string): Promise<AguinaldoResultado> {
  const periodos = periodosDeAguinaldo(anio);
  const [filas, salarios] = await Promise.all([
    prisma.pagoPlanilla.findMany({
      where: { estado: "PAGADO", periodo: { in: periodos } },
      include: { comisiones: { select: { monto: true, moneda: true } } },
    }),
    // ⚠ Solo para DECIR quién no aparece. Hoy una persona con salario activo y
    // sin ninguna quincena en el libro simplemente no se pinta — no sale en cero
    // ni con aviso: desaparece, y el total se lee como si estuviera completo.
    // El monto del costo NO se usa para estimarle un aguinaldo: sin libro no hay
    // nada observado que dividir, y ponerle un número sería fabricarlo.
    prisma.costoRecurrente.findMany({
      where: { categoria: "SALARIO", activo: true, finalizadoEl: null },
      select: { teamMemberId: true, nombre: true, moneda: true },
    }),
  ]);

  return calcularAguinaldo(
    filas.map((p) => ({
      sujetoTeamMemberId: p.sujetoTeamMemberId,
      sujetoNombre: p.sujetoNombre,
      periodo: p.periodo,
      fechaProgramada: isoDay(p.fechaProgramada)!,
      estado: p.estado,
      monto: num(p.monto)!,
      moneda: p.moneda,
      // Solo las comisiones de la MISMA moneda que la quincena: convertirlas
      // exigiría un tipo de cambio que este sistema no tiene.
      comisiones: p.comisiones
        .filter((c) => c.moneda === p.moneda)
        .reduce((a, c) => a + num(c.monto)!, 0),
    })),
    anio,
    hoyISO,
    salarios.map((s) => ({
      teamMemberId: s.teamMemberId,
      nombre: s.nombre,
      moneda: s.moneda,
    })),
  );
}

// ── Comisiones de VENDEDOR (remuneración — SUPER_ADMIN-only) ────────────────────
// ⚠ PRIVACIDAD: lo que se le paga a una persona por vender. MISMA superficie que
// los salarios: solo `guardCostosAccess`. Es el otro lado de la línea que separa
// esto de `loadComisionesPartner` — el ingreso lo ve ADMIN, la remuneración no.

export interface ReglaComisionDTO {
  id: string;
  teamMemberId: string;
  vendedorNombre: string;
  clientId: string | null;
  clienteNombre: string | null;
  /** El eje MÁS específico: esta regla es de ESE deal. null = no lo es. */
  servicioId: string | null;
  servicioNombre: string | null;
  porcentaje: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
  notas: string | null;
}

export interface ComisionLiquidadaDTO {
  id: string;
  teamMemberId: string | null;
  vendedorNombre: string;
  periodo: string;
  base: number;
  porcentaje: number;
  monto: number;
  moneda: string;
  cobroIds: string[];
  pagoPlanillaId: string | null;
  liquidadoPor: string;
  liquidadoEn: string;
  notas: string | null;
}

/**
 * Una comisión devengada más la quincena en la que la POLÍTICA dice que se paga.
 *
 * La sugerencia se resuelve acá y no en el panel para que la pantalla, el body
 * que manda y lo que se persiste sean el MISMO valor: si el panel la calculara
 * por su cuenta, la comisión terminaría enganchada a la quincena que dijo el
 * navegador. `quincenaSugerida` es null cuando esa quincena todavía no existe en
 * el libro, y entonces `motivoSinQuincena` lo DICE en vez de callarlo.
 */
export interface DevengadaConQuincena extends ComisionDevengada {
  quincenaSugerida: {
    id: string;
    periodo: string;
    quincena: number;
    fechaProgramada: string;
    estado: string;
  } | null;
  motivoSinQuincena: string | null;
}

export interface ComisionesVendedorDTO {
  reglas: ReglaComisionDTO[];
  /** Lo DEVENGADO: derivado de los cobros COBRADO, se recalcula solo. */
  devengadas: DevengadaConQuincena[];
  /** Lo LIQUIDADO: filas congeladas, con su snapshot. */
  liquidadas: ComisionLiquidadaDTO[];
  /** Totales de lo devengado por moneda. CRC y USD nunca se suman. */
  totalesDevengado: Record<string, number>;
  /** Qué política resolvió las sugerencias, para poder decirlo en pantalla. */
  politicaPago: { clave: string; label: string };
  /**
   * Las ventas COBRADAS que no están produciendo comisión, con su motivo.
   * ⚠ Obligatorio en pantalla, no decorativo: con la atribución vacía el
   * devengado da cero, y un cero mudo se lee como «no se le debe nada a nadie»
   * cuando la verdad es «falta decir quién vendió».
   */
  sinComisionar: VentaSinComisionar[];
}

/**
 * Trae las reglas, devenga sobre los cobros COBRADO y lista lo ya liquidado.
 *
 * El universo de cobros es TODO lo COBRADO con `fechaCobro`: sin ese dato no se
 * sabe en qué período cae ni qué regla estaba vigente, así que un cobro sin
 * fecha de pago simplemente no devenga (no se aproxima con la programada).
 */
export async function loadComisionesVendedor(): Promise<ComisionesVendedorDTO> {
  const [reglasRaw, liquidadasRaw] = await Promise.all([
    prisma.reglaComisionVendedor.findMany({
      include: {
        vendedor: { select: { name: true } },
        client: { select: { name: true } },
        servicio: { select: { tipoServicio: true, descripcion: true } },
      },
      orderBy: [{ vigenteDesde: "desc" }],
    }),
    prisma.comisionVendedor.findMany({ orderBy: [{ periodo: "desc" }, { liquidadoEn: "desc" }] }),
  ]);

  const reglas: ReglaComisionDTO[] = reglasRaw.map((r) => ({
    id: r.id,
    teamMemberId: r.teamMemberId,
    vendedorNombre: r.vendedor.name,
    clientId: r.clientId,
    servicioId: r.servicioId,
    servicioNombre: r.servicio ? (r.servicio.descripcion?.trim() || r.servicio.tipoServicio) : null,
    clienteNombre: r.client?.name ?? null,
    porcentaje: num(r.porcentaje)!,
    vigenteDesde: isoDay(r.vigenteDesde)!,
    vigenteHasta: isoDay(r.vigenteHasta),
    notas: r.notas,
  }));

  const liquidadas: ComisionLiquidadaDTO[] = liquidadasRaw.map((c) => ({
    id: c.id,
    teamMemberId: c.teamMemberId,
    vendedorNombre: c.vendedorNombre,
    periodo: c.periodo,
    base: num(c.base)!,
    porcentaje: num(c.porcentaje)!,
    monto: num(c.monto)!,
    moneda: c.moneda,
    cobroIds: c.cobroIds,
    pagoPlanillaId: c.pagoPlanillaId,
    liquidadoPor: c.liquidadoPor,
    liquidadoEn: iso(c.liquidadoEn)!,
    notas: c.notas,
  }));

  const politicaPago = {
    clave: POLITICA_PAGO_COMISION,
    label: POLITICA_PAGO_COMISION_LABEL[POLITICA_PAGO_COMISION],
  };

  // ⚠ Sin reglas ya NO se corta acá. Antes se devolvía vacío y listo; con la
  // atribución por venta, «hay cobros y no hay nada configurado» es EL estado
  // inicial, y ese cero mudo es justo lo que hay que explicar. Se traen igual los
  // cobros para poder decir cuántas ventas quedan sin atribuir y por cuánta plata.
  const { devengadas: crudas, sinComisionar } = await devengarDesdeCobros(reglas, liquidadas);
  const devengadas = await conQuincenaSugerida(crudas);

  const totalesDevengado: Record<string, number> = {};
  for (const d of devengadas) {
    totalesDevengado[d.moneda] = Math.round(((totalesDevengado[d.moneda] ?? 0) + d.monto) * 100) / 100;
  }

  return { reglas, devengadas, liquidadas, totalesDevengado, politicaPago, sinComisionar };
}

/**
 * Cuelga de cada devengada la quincena en la que la política dice que se paga.
 *
 * Una sola query para todas: se resuelven los pares (período, quincena) que la
 * política pide y se buscan juntos. La moneda tiene que coincidir — pagarle a
 * alguien una comisión en USD junto a una quincena en colones sería convertir,
 * y este módulo no convierte.
 */
async function conQuincenaSugerida(
  devengadas: ComisionDevengada[],
): Promise<DevengadaConQuincena[]> {
  if (devengadas.length === 0) return [];

  // El objetivo YA lo decidió `devengarComisiones`: el grupo ES el pago (persona
  // × quincena × moneda), así que acá no se vuelve a aplicar la política — si se
  // aplicara dos veces, un cambio de política dejaría al grupo y a su quincena
  // apuntando a meses distintos.
  const objetivos = devengadas.map((d) => ({
    d,
    objetivo: { periodo: d.periodo, quincena: d.quincena },
  }));

  const candidatas = await prisma.pagoPlanilla.findMany({
    where: {
      OR: objetivos.map(({ d, objetivo }) => ({
        sujetoTeamMemberId: d.teamMemberId,
        periodo: objetivo.periodo,
        quincena: objetivo.quincena,
      })),
    },
    select: {
      id: true,
      sujetoTeamMemberId: true,
      periodo: true,
      quincena: true,
      fechaProgramada: true,
      moneda: true,
      estado: true,
    },
  });

  const porClave = new Map(
    candidatas.map((q) => [`${q.sujetoTeamMemberId}::${q.periodo}::${q.quincena}`, q]),
  );

  return objetivos.map(({ d, objetivo }) => {
    const fila = porClave.get(`${d.teamMemberId}::${objetivo.periodo}::${objetivo.quincena}`);
    if (!fila) {
      return {
        ...d,
        quincenaSugerida: null,
        motivoSinQuincena: `La quincena de ${objetivo.periodo} (Q${objetivo.quincena}) todavía no está generada en el historial de planilla.`,
      };
    }
    if (fila.moneda !== d.moneda) {
      return {
        ...d,
        quincenaSugerida: null,
        motivoSinQuincena: `Esa quincena está en ${fila.moneda} y la comisión en ${d.moneda}. Nexus no convierte monedas.`,
      };
    }
    // ⚠ Una quincena PAGADA es plata que ya salió: colgarle una comisión después
    // haría que el historial de planilla afirme que ese monto salió con ese pago
    // y que el aguinaldo lo cuente. Ni se sugiere (y la mutación además lo frena).
    if (fila.estado === "PAGADO") {
      return {
        ...d,
        quincenaSugerida: null,
        motivoSinQuincena: `La quincena de ${objetivo.periodo} (Q${objetivo.quincena}) ya se pagó: no se le puede colgar una comisión después.`,
      };
    }
    return {
      ...d,
      quincenaSugerida: {
        id: fila.id,
        periodo: fila.periodo,
        quincena: fila.quincena,
        fechaProgramada: isoDay(fila.fechaProgramada)!,
        estado: fila.estado,
      },
      motivoSinQuincena: null,
    };
  });
}

/** Los cobros COBRADO cruzados con las reglas, menos lo ya liquidado. */
async function devengarDesdeCobros(
  reglas: ReglaComision[],
  liquidadas: ComisionLiquidadaDTO[],
): Promise<DevengoResultado> {
  const cobros = await prisma.cobro.findMany({
    where: { estado: "COBRADO", fechaCobro: { not: null } },
    select: {
      id: true,
      fechaCobro: true,
      monto: true,
      moneda: true,
      cuenta: { select: { clientId: true, client: { select: { name: true } } } },
      // ⚠ El puente al DEAL ya existía y estaba desperdiciado: `servicioId` es FK
      // OBLIGATORIA de Cobro, o sea que cada peso que entra YA sabe de qué venta
      // viene. Lo único que faltaba era saber quién ganó esa venta.
      servicioId: true,
      servicio: {
        select: {
          tipoServicio: true,
          descripcion: true,
          atribucion: {
            select: {
              comisiona: true,
              teamMemberId: true,
              vendedor: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const yaLiquidados = new Set(liquidadas.flatMap((c) => c.cobroIds));

  return devengarComisiones(
    cobros.map((c) => ({
      id: c.id,
      clientId: c.cuenta.clientId,
      clienteNombre: c.cuenta.client?.name ?? "(sin nombre)",
      fechaCobro: isoDay(c.fechaCobro)!,
      monto: num(c.monto)!,
      moneda: c.moneda,
      servicioId: c.servicioId,
      servicioNombre: c.servicio.descripcion?.trim() || c.servicio.tipoServicio,
      vendedorTeamMemberId: c.servicio.atribucion?.teamMemberId ?? null,
      vendedorNombre: c.servicio.atribucion?.vendedor?.name ?? null,
      // Sin fila de atribución `comisiona` da true, pero eso NO habilita nada por
      // accidente: el motor exige además un vendedor, y ahí no hay ninguno.
      comisiona: c.servicio.atribucion?.comisiona ?? true,
    })),
    reglas,
    yaLiquidados,
  );
}

// ── Reporte anual de equilibrio (SUPER_ADMIN) ───────────────────────────────────
// ⚠ PRIVACIDAD: mezcla ingresos con planilla y estructura de costos, así que toma la
// sensibilidad MÁXIMA de lo que junta: se consume SOLO desde rutas con
// `guardCostosAccess` y desde la página con `isCostosRole`. Consecuencia asumida y
// escrita en DECISIONS: un ADMIN no lo ve, aunque sea quien registra las facturaciones.

/** Cómo se imputó cada plata a su mes. Viaja con el reporte para poder rotularlo. */
export interface ImputacionReporte {
  /**
   * Cobros COBRADO sin `fechaCobro`, imputados por su período de facturación.
   * Si este número es alto, la curva de "cobrado" NO es una curva de caja y la
   * pantalla tiene que decirlo — por eso viaja, en vez de resolverse en silencio.
   */
  cobradosSinFechaDeCobro: number;
  /** Cuántos cobros COBRADO hay en el año (el denominador del anterior). */
  cobradosTotales: number;
  /** Meses del libro de planilla con una sola quincena registrada. */
  mesesPlanillaIncompleta: string[];
}

export interface ReporteAnualDTO extends ReporteEquilibrio {
  imputacion: ImputacionReporte;
  /** Todo lo que no cuadra, en una sola lista y ordenado por la plata que mueve. */
  inconsistencias: Inconsistencia[];
}

/**
 * El reporte anual de equilibrio, armado desde la base.
 *
 * Este loader NO calcula: lee, serializa a los tipos del módulo puro y delega en
 * `calcularEquilibrio`. Toda la aritmética —incluida la única conversión de moneda del
 * sistema— vive en `lib/finanzas/equilibrio.ts`, que se puede testear sin base.
 *
 * De dónde sale cada rubro del egreso:
 *  · PLANILLA          `PagoPlanilla`, la ÚNICA serie mensual real que ya existía.
 *                      Va por QUINCENA (dos "conceptos" por mes) para que un mes con
 *                      una sola quincena salga PARCIAL en vez de parecer barato.
 *  · RESERVA_AGUINALDO derivada del aguinaldo proyectado ÷ 12, repartida en los doce
 *                      meses. Siempre ESTIMADO: es un devengo, no plata que se movió.
 *  · el resto          `EgresoMensual`, el libro que siembra el Excel.
 */
export async function loadReporteAnual(
  anio: number,
  hoyISO: string,
  opciones?: {
    monedaPresentacion?: MonedaEq;
    ventana?: VentanaEquilibrio;
    divisorAguinaldo?: number;
  },
): Promise<ReporteAnualDTO> {
  const periodos = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
  const desde = dayUTC(`${anio}-01-01`);
  const hasta = dayUTC(`${anio}-12-31`);

  const [filasEgreso, filasPlanilla, filasCobro, filasComision, filasTasa, aguinaldo, costosActivos] =
    await Promise.all([
    prisma.egresoMensual.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, categoria: true, concepto: true, conceptoClave: true, monto: true, moneda: true, monedaInferida: true },
    }),
    prisma.pagoPlanilla.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, quincena: true, monto: true, moneda: true },
    }),
    prisma.cobro.findMany({
      where: { periodo: { in: periodos } },
      select: {
        periodo: true,
        monto: true,
        moneda: true,
        estado: true,
        fechaCobro: true,
        servicio: { select: { tipoServicio: true } },
      },
    }),
    prisma.comisionPartner.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      select: { fecha: true, monto: true, moneda: true, estado: true },
    }),
    prisma.tipoCambioMes.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, crcPorUsd: true, fuente: true },
    }),
    loadAguinaldo(anio, hoyISO),
    // Los costos VIGENTES hoy: la fuente del piso vigente, que es el titular del
    // reporte. Es el catálogo que una persona mantiene al día — a diferencia del libro
    // de pagos, que va detrás de la realidad (ver DECISIONS §El piso de hoy).
    prisma.costoRecurrente.findMany({
      where: { activo: true, finalizadoEl: null },
      select: { nombre: true, categoria: true, monto: true, moneda: true, frecuencia: true },
    }),
  ]);

  const periodoHoy = periodoDe(hoyISO);
  /** Un mes que todavía no ocurrió trae dato de PLAN, no medido. */
  const calidadDe = (periodo: string) => (periodo > periodoHoy ? ("PLANIFICADO" as const) : ("MEDIDO" as const));

  const egresos: EgresoDeMes[] = filasEgreso.map((f) => ({
    periodo: f.periodo,
    rubro: f.categoria as EgresoDeMes["rubro"],
    concepto: f.concepto,
    conceptoClave: f.conceptoClave,
    monto: num(f.monto)!,
    moneda: f.moneda as MonedaEq,
    calidad: calidadDe(f.periodo),
    monedaInferida: f.monedaInferida,
  }));

  // Planilla: una línea por (mes, quincena, moneda). La quincena es parte de la clave
  // del concepto justamente para que falte visiblemente cuando falta.
  const planillaAcc = new Map<string, { periodo: string; quincena: number; moneda: string; monto: number }>();
  for (const p of filasPlanilla) {
    const k = `${p.periodo}|${p.quincena}|${p.moneda}`;
    const prev = planillaAcc.get(k);
    if (prev) prev.monto = Math.round((prev.monto + num(p.monto)!) * 100) / 100;
    else planillaAcc.set(k, { periodo: p.periodo, quincena: p.quincena, moneda: p.moneda, monto: num(p.monto)! });
  }
  for (const p of planillaAcc.values()) {
    egresos.push({
      periodo: p.periodo,
      rubro: "PLANILLA",
      concepto: `Planilla ${p.quincena}ª quincena`,
      conceptoClave: `planilla-q${p.quincena}`,
      monto: p.monto,
      moneda: p.moneda as MonedaEq,
      calidad: calidadDe(p.periodo),
    });
  }

  // Reserva de aguinaldo: el proyectado del año ÷ 12, en cada mes. Por moneda separada
  // (el aguinaldo nunca se convierte en su propio módulo; acá la conversión, si hace
  // falta, la hace el reporte con la tasa del mes).
  const divisor = opciones?.divisorAguinaldo ?? 12;
  for (const [moneda, total] of Object.entries(aguinaldo.totalesProyectado)) {
    if (!total) continue;
    const mensual = Math.round((total / divisor) * 100) / 100;
    for (const periodo of periodos) {
      egresos.push({
        periodo,
        rubro: "RESERVA_AGUINALDO",
        concepto: "Reserva de aguinaldo",
        conceptoClave: "reserva-aguinaldo",
        monto: mensual,
        moneda: moneda as MonedaEq,
        calidad: "ESTIMADO",
      });
    }
  }

  // ── Ingresos ────────────────────────────────────────────────────────────────
  const ingresos: IngresoDeMes[] = [];
  let cobradosSinFecha = 0;
  let cobradosTotales = 0;
  for (const c of filasCobro) {
    const monto = num(c.monto)!;
    const base = { monto, moneda: c.moneda as MonedaEq, tipoServicio: c.servicio.tipoServicio };
    if (c.estado === "COBRADO") {
      cobradosTotales++;
      // El reloj del dinero es `fechaCobro`. Cuando falta se imputa por el período de
      // facturación —que es lo único que hay— y se CUENTA, para poder rotularlo.
      const iso = isoDay(c.fechaCobro);
      if (!iso) cobradosSinFecha++;
      ingresos.push({ ...base, periodo: iso ? periodoDe(iso) : c.periodo, tipo: "COBRADO" });
      continue;
    }
    if (c.estado === "POR_COBRAR") {
      ingresos.push({ ...base, periodo: c.periodo, tipo: "POR_COBRAR" });
      continue;
    }
    // PROGRAMADO y SIN_DATO: ni siquiera se facturó. No es ingreso, es backlog.
    ingresos.push({ ...base, periodo: c.periodo, tipo: "PROGRAMADO" });
  }

  for (const c of filasComision) {
    const iso = isoDay(c.fecha)!;
    ingresos.push({
      periodo: periodoDe(iso),
      tipo: "COMISION_PARTNER",
      monto: num(c.monto)!,
      moneda: c.moneda as MonedaEq,
      tipoServicio: null,
      // Una comisión prometida SUMA a los ingresos del mes (es plata devengada, igual
      // que una factura sin cobrar), pero solo la COBRADA cuenta como caja. Las dos
      // cifras viajan separadas para que nadie lea una promesa como plata en el banco.
      cobrada: c.estado === "COBRADO",
    });
  }

  const tasas: TasaDeMes[] = filasTasa.map((t) => ({
    periodo: t.periodo,
    crcPorUsd: num(t.crcPorUsd)!,
    fuente: t.fuente,
  }));

  const mesesPlanillaIncompleta = periodos.filter((p) => {
    const quincenas = new Set([...planillaAcc.values()].filter((x) => x.periodo === p).map((x) => x.quincena));
    return quincenas.size === 1;
  });

  // ── Los costos vigentes: la fuente del piso de HOY ──────────────────────────
  const RUBRO_DE_CATEGORIA = {
    SALARIO: "PLANILLA",
    HERRAMIENTA: "HERRAMIENTA",
    FIJO_OPERACION: "FIJO_OPERACION",
  } as const;
  const costosVigentes: CostoVigente[] = costosActivos.map((c) => ({
    rubro: RUBRO_DE_CATEGORIA[c.categoria],
    concepto: c.nombre,
    // Un ANUAL entra dividido: el piso es un costo MENSUAL.
    monto: mensualizado(num(c.monto)!, c.frecuencia),
    moneda: c.moneda as MonedaEq,
  }));
  // La tarjeta no es un CostoRecurrente (no hay tarjetas cargadas): su cargo vive en el
  // libro de egresos. Se toma el ÚLTIMO mes que lo tenga, que es el vigente.
  const ultimoTarjeta = filasEgreso
    .filter((f) => f.categoria === "TARJETA" && f.periodo <= periodoDe(hoyISO))
    .sort((a, b) => b.periodo.localeCompare(a.periodo))[0]?.periodo;
  if (ultimoTarjeta) {
    for (const f of filasEgreso.filter((x) => x.categoria === "TARJETA" && x.periodo === ultimoTarjeta)) {
      costosVigentes.push({
        rubro: "TARJETA",
        concepto: f.concepto,
        monto: num(f.monto)!,
        moneda: f.moneda as MonedaEq,
      });
    }
  }

  const reporte = calcularEquilibrio(egresos, ingresos, {
    anio,
    hoyISO,
    monedaPresentacion: opciones?.monedaPresentacion ?? "USD",
    ventana: opciones?.ventana ?? "SOLO_MEDIDOS",
    tasas,
    divisorAguinaldo: divisor,
    costosVigentes,
  });

  // ── La lista para sentarse con el CFO ───────────────────────────────────────
  // Se arma acá y no en el motor puro porque mira cosas que el reporte no toca: ventas,
  // vínculos con HubSpot, servicios sin plan de cobro. El motor sigue contestando "cuánto
  // cuesta y cuánto entra"; esto contesta "qué falta arreglar".
  const inconsistencias = detectarInconsistencias(
    await armarEstadoParaAuditar(anio, hoyISO, reporte, cobradosSinFecha, cobradosTotales, divisor),
  );

  return {
    ...reporte,
    imputacion: {
      cobradosSinFechaDeCobro: cobradosSinFecha,
      cobradosTotales,
      mesesPlanillaIncompleta,
    },
    inconsistencias,
  };
}

/**
 * Junta de la base todo lo que hace falta para auditar. Es una función aparte porque son
 * seis lecturas que no tienen nada que ver con el equilibrio: mezclarlas en el loader
 * haría creer que el reporte depende de ellas, y no — si esto fallara, el reporte sigue.
 */
async function armarEstadoParaAuditar(
  anio: number,
  hoyISO: string,
  reporte: ReporteEquilibrio,
  cobradosSinFecha: number,
  cobradosTotales: number,
  divisorAguinaldo: number,
): Promise<EstadoParaAuditar> {
  const desde = dayUTC(`${anio}-01-01`);
  const hasta = dayUTC(`${anio}-12-31`);

  const [ventas, comisiones, serviciosSinCobros, cuentasSinEmpresa, cobrosPorCuenta, cuentas] = await Promise.all([
    prisma.ventaGanada.findMany({
      where: { estado: "GANADA", fechaCierre: { gte: desde, lte: hasta } },
      select: {
        nombre: true, monto: true, moneda: true, montoConvertidoHubspot: true,
        pipelineId: true, clientId: true, clienteVia: true, excluida: true,
      },
    }),
    prisma.comisionPartner.findMany({
      where: { estado: "POR_COBRAR", fecha: { gte: desde, lte: hasta } },
      select: { partner: true, monto: true, fecha: true },
    }),
    prisma.servicioContratado.findMany({
      where: { cobros: { none: {} }, estado: "ACTIVO" },
      select: { montoTotal: true, moneda: true, cuenta: { select: { client: { select: { name: true } } } } },
    }),
    prisma.client.findMany({
      where: { cuentaFinanciera: { isNot: null }, hubspotCompanyId: null },
      select: { name: true },
    }),
    prisma.cobro.groupBy({
      by: ["cuentaId"],
      where: { periodo: { startsWith: String(anio) }, estado: { in: ["COBRADO", "POR_COBRAR"] } },
      _sum: { monto: true },
    }),
    prisma.cuentaFinanciera.findMany({ select: { id: true, clientId: true } }),
  ]);

  // Lo facturado por cliente, para poder medir el hueco por MONTO y no por un sí/no.
  const clienteDeCuenta = new Map(cuentas.map((c) => [c.id, c.clientId]));
  const facturadoPorCliente = new Map<string, number>();
  for (const c of cobrosPorCuenta) {
    const cli = clienteDeCuenta.get(c.cuentaId);
    if (!cli) continue;
    facturadoPorCliente.set(cli, (facturadoPorCliente.get(cli) ?? 0) + Number(c._sum.monto ?? 0));
  }

  const resumen = clasificarVentas(
    ventas.map((v) => ({
      hubspotDealId: "",
      nombre: v.nombre,
      fechaCierre: `${anio}-01-01`, // la fecha exacta no importa para el hueco
      monto: v.montoConvertidoHubspot !== null ? num(v.montoConvertidoHubspot) : num(v.monto),
      pipelineId: v.pipelineId,
      clientId: v.clientId,
      excluida: v.excluida,
      sospechaPrueba: false,
    })),
    [...facturadoPorCliente.entries()].map(([clientId, facturado]) => ({ clientId, facturado })),
    { anio, pipelinesQueCuentan: [...PIPELINES_VENTA_PROPIA] },
  );

  const descubiertas = resumen.ventas
    .filter((v) => v.descubierto > 0)
    .sort((a, b) => b.descubierto - a.descubierto)
    .slice(0, 8)
    .map((v) => `${v.nombre} · ${v.descubierto.toLocaleString("es-CR", { style: "currency", currency: "USD" })}`);

  // El desvío de cambio solo se puede medir donde HubSpot ya convirtió y la moneda no es
  // la de presentación: ahí conviven dos tasas y conviene que se vea.
  const tasaDelAnio = reporte.fx.tasas[0]?.crcPorUsd ?? null;
  const desvios = ventas
    .filter((v) => v.moneda !== reporte.monedaPresentacion && v.monto !== null && v.montoConvertidoHubspot !== null)
    .map((v) => ({
      concepto: v.nombre,
      segunNexus: tasaDelAnio ? Math.round((num(v.monto)! / tasaDelAnio) * 100) / 100 : 0,
      segunHubspot: num(v.montoConvertidoHubspot)!,
    }))
    .filter((d) => d.segunNexus > 0 && Math.abs(d.segunHubspot - d.segunNexus) > 1);

  const avisoTarjeta = reporte.calidad.avisos.find((a) => a.codigo === "TARJETA_SOLAPA_HERRAMIENTAS");
  const avisoMoneda = reporte.calidad.avisos.find((a) => a.codigo === "MONEDA_INFERIDA");
  const reservaNexus = reporte.equilibrio.reservaAguinaldoMensual;

  return {
    anio,
    hoyISO,
    facturadoTotal: reporte.indicadores.facturadoTotal,
    mesesParciales: reporte.meses
      .filter((m) => m.estado === "PARCIAL" && m.faltantes.length > 0)
      .map((m) => ({ periodo: m.periodo, faltantes: m.faltantes })),
    ventas: {
      vendido: resumen.vendido,
      sinCobranza: { cuantas: resumen.porClase.SIN_COBRANZA.cuantas, monto: resumen.porClase.SIN_COBRANZA.descubierto },
      parcial: { cuantas: resumen.porClase.PARCIAL.cuantas, monto: resumen.porClase.PARCIAL.descubierto },
      sinCliente: { cuantas: resumen.porClase.SIN_CLIENTE.cuantas, monto: resumen.porClase.SIN_CLIENTE.descubierto },
      sinMonto: {
        cuantas: ventas.filter((v) => v.monto === null).length,
        items: ventas.filter((v) => v.monto === null).map((v) => v.nombre).slice(0, 15),
      },
      resueltasPorNombre: {
        cuantas: ventas.filter((v) => v.clienteVia === "nombre").length,
        items: ventas.filter((v) => v.clienteVia === "nombre").map((v) => v.nombre),
      },
      fueraDePipeline: resumen.fueraDePipeline,
      peoresDescubiertas: descubiertas,
    },
    comisionesVencidas: comisiones.map((c) => ({
      partner: c.partner,
      monto: num(c.monto)!,
      fecha: isoDay(c.fecha)!,
    })),
    serviciosSinCobros: {
      cuantas: serviciosSinCobros.length,
      monto: serviciosSinCobros.reduce((n, s) => n + num(s.montoTotal)!, 0),
      items: serviciosSinCobros.map((s) => `${s.cuenta.client?.name ?? "(sin cliente)"} · ${num(s.montoTotal)}`),
    },
    cuentasSinEmpresa: { cuantas: cuentasSinEmpresa.length, items: cuentasSinEmpresa.map((c) => c.name) },
    cobradosSinFecha: { cuantas: cobradosSinFecha, total: cobradosTotales },
    periodosSinTasa: reporte.fx.periodosSinTasa,
    monedaInferida: avisoMoneda?.conceptos ?? [],
    desviosDeCambio: desvios,
    tarjetaYHerramientas: { hay: !!avisoTarjeta, periodos: avisoTarjeta?.periodos ?? [] },
    // El criterio del Excel es dividir entre 10 en vez de 12: se reconstruye desde el de
    // Nexus para poder mostrar los dos sin volver a leer la hoja.
    aguinaldo:
      reservaNexus > 0
        ? { segunNexus: reservaNexus, segunExcel: Math.round(((reservaNexus * divisorAguinaldo) / 10) * 100) / 100 }
        : null,
  };
}
