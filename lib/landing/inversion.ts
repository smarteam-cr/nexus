/**
 * lib/landing/inversion.ts — las REGLAS DE FORMA de la sección de inversión.
 *
 * Hasta ahora convivían dos secciones distintas bajo la MISMA key `inversion`: la de
 * HubSpot (dos tarjetas fijas, sin total) y la de sitio web (tabla + total autocalculado).
 * Se unifican en una sola, y todo lo que decide QUÉ se pinta vive acá y no adentro del
 * componente, por el mismo motivo que `hubs-solucion.ts`: el project `unit` de vitest solo
 * mira `lib/**`, y lo que esto decide es el número que el prospecto compara contra el
 * contrato.
 *
 * ── LO QUE ESTE ARCHIVO PROTEGE ─────────────────────────────────────────────
 * `configForSnapshot` resuelve primero por KEY contra la config VIVA, así que **toda
 * propuesta ya publicada estrena el renderer nuevo**. Las dos reglas de abajo son lo único
 * que evita que a un cliente le cambie el documento que ya vio:
 *   · `esInversionLegacy` mantiene las dos tarjetas históricas de HubSpot.
 *   · `gruposDeInversion` pinta UN SOLO total —con la píldora de siempre— mientras haya un
 *     solo grupo con montos, que es el caso de las propuestas de sitio web publicadas.
 * El gran total aparece recién cuando hay DOS grupos, o sea solo en lo que se llene de
 * ahora en adelante.
 */
import { sumaLineas, sumaRangos, type Rango } from "./money";

/** Las keys del shape VIEJO de HubSpot. Se LEEN para decidir la rama legacy y nunca se
 *  escriben. Están acá y no sueltas en el componente por el mismo motivo que
 *  `SOLUCION_LEGACY_KEYS`: quien las toque tiene que ver la regla al lado. */
export const INVERSION_LEGACY_KEYS = ["licenciasHubspot", "implementacion"] as const;

export interface LineaInversion {
  concepto?: string;
  monto?: string;
  detalle?: string;
}

/** El shape unificado. `licencias` es la ÚNICA key nueva — por eso las propuestas de sitio
 *  web publicadas siguen renderizando sin rama legacy: cae a `[]` y el resto ya coincide. */
export interface InversionData {
  moneda?: string;
  /** Servicios de Smarteam → subtotal 1. Conserva el nombre histórico a propósito:
   *  renombrarla a `servicios` obligaría a una rama legacy para lo ya publicado por puro
   *  gusto estético. */
  lineas?: LineaInversion[];
  /** Licencias y plataforma de TERCEROS (HubSpot…) → subtotal 2. */
  licencias?: LineaInversion[];
  /** Opcionales cotizados aparte: se muestran, NO suman. */
  extras?: LineaInversion[];
  /** Costos mensuales: se muestran, NO suman (un OpEx no entra a una inversión única). */
  recurrentes?: LineaInversion[];
  nota?: string;
  anchoRecurrente?: string;
  // Shape viejo de HubSpot — solo lectura, para la rama legacy.
  licenciasHubspot?: { monto?: string; detalle?: string };
  implementacion?: { monto?: string; detalle?: string };
}

const conTexto = (s: unknown) => typeof s === "string" && s.trim() !== "";
const conContenido = (ls: LineaInversion[] | undefined) =>
  (ls ?? []).some((l) => conTexto(l?.concepto) || conTexto(l?.monto) || conTexto(l?.detalle));

/**
 * ¿Esta sección todavía está en el shape viejo de HubSpot? Espejo exacto de
 * `esSolucionLegacy`: sin nada en el shape nuevo **y** con algo escrito en el viejo.
 *
 * ⚠ Por qué rama y NO conversión automática, aunque el mapeo sea 1:1 y tentador: los montos
 * viejos son texto libre ("A definir en propuesta formal", "$12k–18k/año"). Convertirlos
 * hace correr la máquina de totales sobre una propuesta YA PUBLICADA, y al cliente le
 * aparece un número que nunca vio. Ése es el peor resultado posible de toda esta tanda. La
 * adopción del shape nuevo es un botón que aprieta una persona, sobre el canvas vivo.
 */
export function esInversionLegacy(data: InversionData | null | undefined): boolean {
  const d = data ?? {};
  if (conContenido(d.lineas) || conContenido(d.licencias)) return false;
  return (
    conTexto(d.licenciasHubspot?.monto) ||
    conTexto(d.licenciasHubspot?.detalle) ||
    conTexto(d.implementacion?.monto) ||
    conTexto(d.implementacion?.detalle)
  );
}

/** Convierte el shape viejo al nuevo. Lo dispara SOLO el botón del editor — nunca un
 *  script ni el render (ver el ⚠ de `esInversionLegacy`). */
export function adoptarShapeNuevo<T extends InversionData>(data: T): T {
  const linea = (v: { monto?: string; detalle?: string } | undefined, concepto: string) =>
    conTexto(v?.monto) || conTexto(v?.detalle)
      ? [{ concepto, monto: v?.monto ?? "", detalle: v?.detalle ?? "" }]
      : [];
  return {
    ...data,
    lineas: linea(data.implementacion, "Implementación Smarteam"),
    licencias: linea(data.licenciasHubspot, "Licencias HubSpot"),
    licenciasHubspot: undefined,
    implementacion: undefined,
  };
}

export interface GrupoInversion {
  clave: "lineas" | "licencias";
  lineas: LineaInversion[];
  total: Rango | null;
  /** Líneas con algo escrito que no se pudo sumar ("A definir", "13%"…). */
  pendientes: number;
}

export interface InversionResuelta {
  servicios: GrupoInversion;
  licencias: GrupoInversion;
  /** Solo con DOS grupos sumables. Con uno, ese subtotal ES el total y se pinta con la
   *  píldora de siempre — así lo ya publicado se ve idéntico. */
  granTotal: Rango | null;
  /** Cuántos grupos aportan un monto sumable: 0 → no se pinta nada · 1 → un solo total ·
   *  2 → subtotal por grupo + gran total. */
  gruposConMonto: number;
  pendientesTotales: number;
}

export function gruposDeInversion(data: InversionData | null | undefined): InversionResuelta {
  const d = data ?? {};
  const moneda = d.moneda;
  const a = sumaLineas(d.lineas, moneda);
  const b = sumaLineas(d.licencias, moneda);
  const gruposConMonto = (a.total ? 1 : 0) + (b.total ? 1 : 0);
  return {
    servicios: { clave: "lineas", lineas: d.lineas ?? [], total: a.total, pendientes: a.pendientes },
    licencias: { clave: "licencias", lineas: d.licencias ?? [], total: b.total, pendientes: b.pendientes },
    granTotal: gruposConMonto === 2 ? sumaRangos(a.total, b.total) : null,
    gruposConMonto,
    pendientesTotales: a.pendientes + b.pendientes,
  };
}
