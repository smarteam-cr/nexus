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
import { monedaDeTexto, sumaLineas, sumaRangos, type Rango } from "./money";

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
 * ⚠ Ya NO decide "dos tarjetas vs tabla": esa rama se retiró el 2026-08-12 y toda propuesta
 * se lee como line items de factura. Hoy decide UNA sola cosa: si el render tiene que
 * PROYECTAR el shape viejo con `adoptarShapeNuevo`.
 *
 * Lo que la doctrina anterior protegía —que a un cliente no le aparezca un número que nunca
 * vio— lo sostiene ahora el parser: los montos viejos son texto libre ("A definir en
 * propuesta formal", "A confirmar con descuento negociado") ⇒ `parseMonto` los da "sucio" ⇒
 * no hay total. Es una garantía dependiente de los DATOS, no del código, así que se
 * re-verifica antes de cada deploy con `scripts/verificar-inversion-publicada.ts`.
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

/**
 * Convierte el shape viejo al nuevo. Corre en la PROYECCIÓN de render de `InvestmentSection`
 * (no persiste nada por su cuenta) y, a través de ella, en el primer guardado humano del
 * canvas vivo — el PUT de bloques REEMPLAZA `data` y `JSON.stringify` descarta los
 * `undefined`, así que ahí las keys viejas mueren de la fila.
 *
 * `rotulos` existe porque los conceptos por defecto son españoles y traen el nombre corto: el
 * rótulo que el cliente VIO es `t(lang,"licenciasHubspot")` = "Licencias HubSpot / año", y ese
 * "/ año" es lo único que decía que ese precio es ANUAL — en una sección que ahora lo suma con
 * un CapEx único. Esta función es pura y no conoce el idioma, así que los rótulos los resuelve
 * el componente. Sin el argumento se comporta EXACTAMENTE como antes.
 *
 * Es IDEMPOTENTE: aplicarla sobre data ya convertida devuelve lo mismo.
 */
export function adoptarShapeNuevo<T extends InversionData>(
  data: T,
  rotulos?: { servicios?: string; licencias?: string },
): T {
  const linea = (v: { monto?: string; detalle?: string } | undefined, concepto: string) =>
    conTexto(v?.monto) || conTexto(v?.detalle)
      ? [{ concepto, monto: v?.monto ?? "", detalle: v?.detalle ?? "" }]
      : [];
  return {
    ...data,
    // Conserva lo que YA estuviera en el shape nuevo y le suma lo convertido. Con eso la
    // función es idempotente —la segunda pasada no encuentra nada legacy que convertir— y
    // deja de depender de que el llamador la gatee con `esInversionLegacy`.
    lineas: [...(data.lineas ?? []), ...linea(data.implementacion, rotulos?.servicios ?? "Implementación Smarteam")],
    licencias: [...(data.licencias ?? []), ...linea(data.licenciasHubspot, rotulos?.licencias ?? "Licencias HubSpot")],
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
  /** La moneda con la que se SUMÓ — y por lo tanto la única con la que se puede FORMATEAR.
   *  La declara la sección; si no la declara, la deducen las líneas (ver abajo). */
  moneda: string;
}

/** Un grupo que no se puede sumar: todo lo que tenga algo escrito queda pendiente. */
const sinSuma = (ls: LineaInversion[] | undefined) => ({
  total: null as Rango | null,
  pendientes: (ls ?? []).filter((l) => conTexto(l?.monto)).length,
});

export function gruposDeInversion(data: InversionData | null | undefined): InversionResuelta {
  const d = data ?? {};
  /* MONEDA EFECTIVA. La guarda anti-mezcla de `parseMonto` vive DENTRO de
     `if (codigoSeccion)`: sin moneda de sección está APAGADA, y ninguna de las secciones
     viejas de HubSpot declara moneda — o sea que ahí `₡1.500.000` y `USD $7.500` se sumarían
     y darían 1.507.500, el único error de esta sección que produce un número inventado.
     Regla: manda la que declara la sección; si no declara, la que declaren las líneas
     MIENTRAS COINCIDAN; si se contradicen, no hay total y todo queda pendiente. */
  const declarada = (d.moneda ?? "").trim().toUpperCase();
  const enTexto = new Set(
    [...(d.lineas ?? []), ...(d.licencias ?? [])]
      .map((l) => monedaDeTexto(l?.monto))
      .filter((c): c is string => !!c),
  );
  const conflicto = !declarada && enTexto.size > 1;
  const moneda = declarada || (enTexto.size === 1 ? [...enTexto][0] : "");

  const a = conflicto ? sinSuma(d.lineas) : sumaLineas(d.lineas, moneda);
  const b = conflicto ? sinSuma(d.licencias) : sumaLineas(d.licencias, moneda);
  const gruposConMonto = (a.total ? 1 : 0) + (b.total ? 1 : 0);
  return {
    servicios: { clave: "lineas", lineas: d.lineas ?? [], total: a.total, pendientes: a.pendientes },
    licencias: { clave: "licencias", lineas: d.licencias ?? [], total: b.total, pendientes: b.pendientes },
    granTotal: gruposConMonto === 2 ? sumaRangos(a.total, b.total) : null,
    gruposConMonto,
    pendientesTotales: a.pendientes + b.pendientes,
    // ⚠ La moneda DEDUCIDA gobierna la aritmética y el formato, NUNCA el rótulo: la barra
    // "Montos en X" sigue mostrando solo lo que la sección DECLARA. Afirmarle al cliente una
    // moneda que nadie eligió sería fabricación.
    moneda,
  };
}
