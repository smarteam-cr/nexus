/**
 * lib/cobranza/quien-debe.ts — «Quién nos debe»: cuánto debe cada cliente, desde cuándo, qué se le prometió y cuándo se
 * habló por última vez. PURO: sin Prisma, sin red y sin reloj (hoy entra por parámetro).
 *
 * ── POR QUÉ EXISTE (2026-10-16) ─────────────────────────────────────────────────
 * En la sesión con Alex: «lo que Marco va a preguntar es quiénes deben». La cola de cobros sirve para trabajar cuota
 * por cuota («está bien para ir haciendo check, pero no para análisis») y las tarjetas de vencido no abrían el detalle.
 * Esta vista junta la misma cola por cliente.
 *
 * ── LAS REGLAS (las mismas de la cola, no otras) ────────────────────────────────
 * - Cada cuota cae donde la pone `clasificarCobro`, la regla de la cola y de los reportes:
 *     · vencida (un cubo de antigüedad) → VENCIDO: facturada y con el crédito consumido;
 *     · en quincena o más adelante, con factura → POR VENCER: el cliente todavía está en plazo;
 *     · atrasada y sin factura → FALTA FACTURAR: es trabajo de Smarteam, no deuda del cliente, y se muestra aparte;
 *     · por delante y sin factura → no se debe todavía; solo cuenta para «próximo cobro».
 * - ⛔ Nunca se suman monedas ni se convierten: cada cliente lleva sus montos por moneda.
 * - La promesa es la marca de la cola (`marcaPromesa`): vigente o incumplida, solo sobre lo facturado.
 */
import { clasificarCobro, BUCKETS_ORDEN, type CobroClasificable } from "./antiguedad";
import { marcaPromesa } from "./engine";

/** Lo que hace falta de cada cuota de la cola (un subconjunto de `ColaCobroRow`). */
export interface CuotaQueSeDebe extends CobroClasificable {
  id: string;
  cuentaId: string;
  clientId: string;
  clienteNombre: string;
  tipoCuenta: string;
  servicioDescripcion: string | null;
  periodo: string;
  numeroFactura: string | null;
  promesaPago: string | null;
  monto: number;
  moneda: string;
}

export interface MontosDeMoneda {
  vencido: number;
  porVencer: number;
  faltaFacturar: number;
}

export type Situacion = "vencido" | "porVencer" | "faltaFacturar" | "programado";

export interface CuotaDelCliente {
  id: string;
  situacion: Situacion;
  periodo: string;
  fechaProgramada: string;
  fechaEmision: string | null;
  numeroFactura: string | null;
  servicio: string | null;
  monto: number;
  moneda: string;
  /** Días desde la fecha programada; positivo = ya pasó. */
  dias: number;
  promesa: { fecha: string; incumplida: boolean } | null;
}

export interface ContactoDeCuenta {
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** LLAMADA · CORREO. */
  tipo: string;
  quien: string;
}

export interface FilaQuienDebe {
  cuentaId: string;
  clientId: string;
  cliente: string;
  tipoCuenta: string;
  /** Por moneda, nunca sumadas entre sí. */
  montos: Record<string, MontosDeMoneda>;
  /** La fecha programada de la cuota vencida más vieja. null = no tiene nada vencido. */
  debeDesde: string | null;
  /** Días de la cuota vencida más vieja. */
  diasMasViejo: number;
  /** La promesa que importa: la incumplida más vieja; si no hay, la vigente más cercana. */
  promesa: { fecha: string; incumplida: boolean } | null;
  /** La próxima cuota que todavía no llega, facturada o no. */
  proximo: { fecha: string; monto: number; moneda: string } | null;
  ultimoContacto: ContactoDeCuenta | null;
  cuotas: CuotaDelCliente[];
}

export interface QuienNosDebe {
  filas: FilaQuienDebe[];
  /** Totales por moneda, con cuántos clientes tienen algo vencido. */
  totales: Record<string, MontosDeMoneda & { clientesConVencido: number }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DIA = 86_400_000;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / DIA);
const ceros = (): MontosDeMoneda => ({ vencido: 0, porVencer: 0, faltaFacturar: 0 });

function situacionDe(c: CuotaQueSeDebe, hoyISO: string): Situacion {
  const grupo = clasificarCobro(c, hoyISO);
  if (grupo === "sinFacturar") return "faltaFacturar";
  if ((BUCKETS_ORDEN as readonly string[]).includes(grupo)) return "vencido";
  return c.fechaEmision ? "porVencer" : "programado";
}

export function quienNosDebe(
  cuotas: readonly CuotaQueSeDebe[],
  hoyISO: string,
  contactos: ReadonlyMap<string, ContactoDeCuenta> = new Map(),
): QuienNosDebe {
  const porCuenta = new Map<string, FilaQuienDebe>();
  for (const c of cuotas) {
    if (c.estado === "COBRADO") continue;
    const fila =
      porCuenta.get(c.cuentaId) ??
      ({
        cuentaId: c.cuentaId,
        clientId: c.clientId,
        cliente: c.clienteNombre,
        tipoCuenta: c.tipoCuenta,
        montos: {},
        debeDesde: null,
        diasMasViejo: 0,
        promesa: null,
        proximo: null,
        ultimoContacto: contactos.get(c.cuentaId) ?? null,
        cuotas: [],
      } satisfies FilaQuienDebe);
    porCuenta.set(c.cuentaId, fila);

    const situacion = situacionDe(c, hoyISO);
    const marca = marcaPromesa({ estado: c.estado, fechaEmisionISO: c.fechaEmision, promesaPagoISO: c.promesaPago }, hoyISO);
    const promesa = marca && c.promesaPago ? { fecha: c.promesaPago.slice(0, 10), incumplida: marca === "incumplida" } : null;
    const d = dias(c.fechaProgramada, hoyISO);
    fila.cuotas.push({
      id: c.id,
      situacion,
      periodo: c.periodo,
      fechaProgramada: c.fechaProgramada.slice(0, 10),
      fechaEmision: c.fechaEmision ? c.fechaEmision.slice(0, 10) : null,
      numeroFactura: c.numeroFactura,
      servicio: c.servicioDescripcion,
      monto: c.monto,
      moneda: c.moneda,
      dias: d,
      promesa,
    });

    if (situacion !== "programado") {
      const m = (fila.montos[c.moneda] ??= ceros());
      m[situacion] = round2(m[situacion] + c.monto);
    }
    if (situacion === "vencido" && (fila.debeDesde === null || c.fechaProgramada.slice(0, 10) < fila.debeDesde)) {
      fila.debeDesde = c.fechaProgramada.slice(0, 10);
      fila.diasMasViejo = d;
    }
    if (promesa) {
      const p = fila.promesa;
      const mejor =
        !p ||
        (promesa.incumplida && !p.incumplida) ||
        (promesa.incumplida === p.incumplida && promesa.fecha < p.fecha);
      if (mejor) fila.promesa = promesa;
    }
    if (d <= 0 && (fila.proximo === null || c.fechaProgramada.slice(0, 10) < fila.proximo.fecha)) {
      fila.proximo = { fecha: c.fechaProgramada.slice(0, 10), monto: c.monto, moneda: c.moneda };
    }
  }

  /* Solo los que deben algo, o a quienes les falta una factura: un cliente con todo por delante no está en esta lista. */
  const filas = [...porCuenta.values()].filter((f) => Object.values(f.montos).some((m) => m.vencido > 0 || m.porVencer > 0 || m.faltaFacturar > 0));
  for (const f of filas) f.cuotas.sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
  /* Primero lo vencido, lo más viejo arriba; después lo que está en plazo; al final lo que falta facturar. */
  const rango = (f: FilaQuienDebe) => {
    const ms = Object.values(f.montos);
    return ms.some((m) => m.vencido > 0) ? 0 : ms.some((m) => m.porVencer > 0) ? 1 : 2;
  };
  filas.sort((a, b) => rango(a) - rango(b) || b.diasMasViejo - a.diasMasViejo || a.cliente.localeCompare(b.cliente));

  const totales: QuienNosDebe["totales"] = {};
  for (const f of filas) {
    for (const [moneda, m] of Object.entries(f.montos)) {
      const t = (totales[moneda] ??= { ...ceros(), clientesConVencido: 0 });
      t.vencido = round2(t.vencido + m.vencido);
      t.porVencer = round2(t.porVencer + m.porVencer);
      t.faltaFacturar = round2(t.faltaFacturar + m.faltaFacturar);
      if (m.vencido > 0) t.clientesConVencido++;
    }
  }
  return { filas, totales };
}
