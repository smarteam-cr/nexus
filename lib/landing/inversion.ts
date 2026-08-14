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
import {
  aplicarDescuento,
  formatRango,
  monedaDeTexto,
  parseCantidad,
  parseDescuento,
  parseMonto,
  sumaRangos,
  type Descuento,
  type Rango,
} from "./money";
import { labelForTag, normalizeTag } from "@/lib/tags/catalog";

/** Las keys del shape VIEJO de HubSpot. Se LEEN para decidir la rama legacy y nunca se
 *  escriben. Están acá y no sueltas en el componente por el mismo motivo que
 *  `SOLUCION_LEGACY_KEYS`: quien las toque tiene que ver la regla al lado. */
export const INVERSION_LEGACY_KEYS = ["licenciasHubspot", "implementacion"] as const;

export interface LineaInversion {
  concepto?: string;
  monto?: string;
  detalle?: string;
  /** Slug del Hub de HubSpot que esta línea factura ("sales_hub"), cuando la línea ES un Hub.
   *  La escribe la SIEMBRA (generate) o el asistente del editor, NUNCA el agente: la sección
   *  es `agentGenerated:false` y su `schema.properties` está vacío, así que `coerceToSchema`
   *  ni la ve.
   *
   *  ⚠ IDENTIDAD, no derivación del texto. El ícono sale de acá y no de adivinar el
   *  `concepto` por tres motivos: Ventas renombra la línea ("Marketing Hub Pro · 5 usuarios")
   *  y el ícono tiene que sobrevivir; una licencia de un tercero no puede ganar un ícono por
   *  parecerse a un Hub; y una línea SIN esta key —todas las de lo ya publicado— renderiza
   *  exactamente el mismo DOM que antes de existir esta feature.
   *
   *  Ausente = licencia de un tercero o línea libre: sin ícono, fuera del alcance de la
   *  siembra y del aviso de desajuste. */
  hub?: string;

  // ── La línea como renglón de cotización (2026-08-13) ──────────────────────
  // Todo string: `coerceToSchema` aplana cualquier hoja que no lo sea. Todo OPCIONAL y
  // ausente en lo ya publicado, así que una línea vieja recorre exactamente el mismo camino
  // que antes: sin `precioUnitario` el importe sale de `monto`, como siempre.

  /** Cuántas unidades ("3"). Vacío o ilegible = 1 — nunca 0: una línea que no se cobra se
   *  apaga con `activa`, no se multiplica por cero. */
  cantidad?: string;
  /** Precio de LISTA por unidad, antes del descuento ("$1,500"). Es lo que convierte a la
   *  línea en calculada: con esto, `monto` deja de leerse. */
  precioUnitario?: string;
  /** Precio de lista por unidad cuando el contrato es ANUAL. Vacío = el mensual × 12 (sin
   *  descuento extra): así una tabla que solo llenó el mensual sigue dando un número honesto
   *  al cambiar el switch, en vez de vaciarse. */
  precioAnual?: string;
  /** Descuento de ESTA línea: "15%" o "$200". Por línea y no global porque los de HubSpot
   *  varían mucho entre Hubs — uno global no describe ninguna negociación real. */
  descuento?: string;
  /** "mensual" = se cobra todos los meses · ausente/"unica" = cobro único (setup,
   *  implementación). Ausente es el default A PROPÓSITO: lo publicado no declara ninguna, y
   *  con default "única" su cierre sigue siendo el gran total de siempre. PRESENTACIÓN
   *  (`NO_CONTENIDO`): clasifica la línea, no dice nada que el cliente lea por sí solo. */
  recurrencia?: string;
  /** "no" = línea apagada. En el EDITOR persiste (es curaduría de Ventas); en la propuesta
   *  publicada el check es EFÍMERO y arranca de acá. PRESENTACIÓN (`NO_CONTENIDO`): una
   *  línea cuyo concepto y monto quedaron vacíos no puede mantener viva a la sección solo
   *  porque alguien la apagó. */
  activa?: string;
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
  /** "anual" = las líneas recurrentes se cotizan por año. PRESENTACIÓN (`NO_CONTENIDO`): el
   *  switch lo escribe apenas alguien lo toca, y una sección donde SOLO se eligió el plazo no
   *  tiene nada que decirle a nadie. Ausente = "mensual". */
  contrato?: string;
  // Shape viejo de HubSpot — solo lectura, para la rama legacy.
  licenciasHubspot?: { monto?: string; detalle?: string };
  implementacion?: { monto?: string; detalle?: string };
}

const conTexto = (s: unknown) => typeof s === "string" && s.trim() !== "";
const conContenido = (ls: LineaInversion[] | undefined) =>
  (ls ?? []).some(
    (l) =>
      conTexto(l?.concepto) ||
      conTexto(l?.monto) ||
      conTexto(l?.detalle) ||
      // Una línea calculada puede no tener `monto` NUNCA y aun así ser la cotización entera.
      conTexto(l?.precioUnitario) ||
      conTexto(l?.precioAnual),
  );

// ── La línea como renglón de cotización ──────────────────────────────────────

/** Una línea apagada no suma, no cuenta como pendiente y no aparece en el PDF. */
export function esLineaActiva(l: LineaInversion | null | undefined): boolean {
  return (l?.activa ?? "").trim().toLowerCase() !== "no";
}

/** ¿Se cobra todos los períodos? Lo escrito manda; ausente cae al default de su GRUPO. */
export function esRecurrente(l: LineaInversion | null | undefined): boolean {
  return (l?.recurrencia ?? "").trim().toLowerCase() === "mensual";
}

/**
 * El default de recurrencia POR GRUPO (2026-08-14, pedido de Elías: "cada licencia debe ser
 * mensual por defecto").
 *
 * Una licencia de HubSpot es una suscripción: cobrarla como pago único es la excepción, no la
 * regla. Un servicio de Smarteam es al revés — una implementación se cobra una vez.
 *
 * ⚠ Es un DEFAULT, no una imposición: `recurrencia` escrita gana siempre, así que Ventas puede
 * poner un setup de HubSpot como cobro único con un clic. Y como toca a lo ya publicado
 * —`configForSnapshot` resuelve por KEY contra la config viva—, el efecto se midió antes de
 * elegirlo: de las propuestas publicadas con líneas de licencia, sus montos son texto libre
 * ("A definir en propuesta formal") ⇒ no suman ⇒ el cierre gana el rótulo "Pago único" pero
 * ningún número nuevo.
 */
export const RECURRENCIA_POR_DEFECTO: Record<"lineas" | "licencias", "unica" | "mensual"> = {
  lineas: "unica",
  licencias: "mensual",
};

/**
 * Rellena `recurrencia` con el default del grupo en las líneas que no la declaran. Se aplica
 * en UN solo lugar (`gruposDeInversion`) y el componente consume las líneas YA normalizadas,
 * así que el `<select>` de la fila, el subtotal y el cierre no pueden contar historias
 * distintas. Al editar cualquier campo de esa fila, el default se persiste explícito —
 * misma doctrina que `adoptarShapeNuevo`.
 */
export function conRecurrenciaPorDefecto(
  clave: "lineas" | "licencias",
  ls: LineaInversion[] | undefined,
): LineaInversion[] {
  const def = RECURRENCIA_POR_DEFECTO[clave];
  return (ls ?? []).map((l) =>
    (l?.recurrencia ?? "").trim() ? l : { ...l, recurrencia: def },
  );
}

export type Contrato = "mensual" | "anual";
export function contratoDe(data: InversionData | null | undefined): Contrato {
  return (data?.contrato ?? "").trim().toLowerCase() === "anual" ? "anual" : "mensual";
}

/** Meses que cubre un período del contrato. Lo usa el ×12 del precio anual derivado. */
export const MESES_POR_CONTRATO: Record<Contrato, number> = { mensual: 1, anual: 12 };

export interface MontoLinea {
  /** El importe de la línea, o null si no hay nada legible. */
  rango: Rango | null;
  /** Hay algo escrito que NO se pudo leer (monto libre, descuento ilegible, otra moneda). */
  sucio: boolean;
  /** true = salió de cantidad × precio − descuento; false = del `monto` de texto libre. */
  calculada: boolean;
  /** El precio unitario efectivo ya resuelto (con el ×12 del anual aplicado), para pintarlo. */
  unitario: Rango | null;
  /** Cuántas unidades se multiplicaron (1 si no se declaró). */
  cantidad: number;
  /** El importe ANTES del descuento (`cantidad × unitario`). Solo cuando hay descuento
   *  aplicado: es el número que se muestra TACHADO al lado del neto, para que el cliente vea
   *  qué se le rebajó. Sin descuento es null — tachar un precio que no cambió es teatro. */
  bruto: Rango | null;
  /** El descuento leído, para pintar su tag ("−15%" / "−$200"). null = no hay o es ilegible
   *  (ilegible ⇒ `sucio`, y ahí la línea no muestra ni tag ni tachado: no se afirma una
   *  rebaja que no se pudo leer). */
  descuento: Descuento | null;
}

/**
 * El importe de UNA línea, en el plazo pedido.
 *
 * Orden de resolución, y el orden importa:
 *  1. Si hay precio unitario → CALCULADA: `cantidad × precio − descuento`. El `monto` de
 *     texto libre deja de leerse (si conviven, el número manda: es el que el cliente puede
 *     recalcular a mano mirando la fila).
 *  2. Si no → el `monto` de siempre. Es el camino de TODO lo publicado, byte por byte.
 *
 * En contrato ANUAL el unitario es `precioAnual` si está escrito, y si no el mensual × 12. Se
 * deriva en vez de vaciarse porque una tabla a medio llenar tiene que seguir dando un número
 * honesto al mover el switch — y el ×12 sin descuento es el peor caso, no una promesa.
 *
 * Un descuento ilegible ensucia la línea ENTERA: se excluye del total y se cuenta como
 * pendiente. Sumarla sin el descuento mostraría un precio que nadie acordó.
 */
export function montoDeLinea(
  l: LineaInversion | null | undefined,
  moneda?: string | null,
  contrato: Contrato = "mensual",
): MontoLinea {
  const vacio: MontoLinea = {
    rango: null, sucio: false, calculada: false, unitario: null, cantidad: 1,
    bruto: null, descuento: null,
  };
  if (!l) return vacio;

  const cantidad = parseCantidad(l.cantidad) ?? 1;
  /* ⚠ El plazo SOLO mueve lo RECURRENTE. Una implementación de $12.000 es la misma plata en
     un contrato anual que en uno mensual: multiplicarla por 12 fue el primer error que cazó
     el test de esta tanda, y habría puesto $144.000 en la propuesta de un cliente. */
  const anual = contrato === "anual" && esRecurrente(l);
  const textoPrecio = anual && conTexto(l.precioAnual) ? l.precioAnual : l.precioUnitario;
  const precio = parseMonto(textoPrecio, moneda);

  if (precio === null) {
    // Sin precio unitario: el camino histórico.
    const m = parseMonto(l.monto, moneda);
    if (m === null) return vacio;
    if (m === "sucio") return { ...vacio, sucio: true };
    /* ⚠ El plazo TAMBIÉN mueve un monto de texto libre cuando la línea es recurrente
       (2026-08-14). Sin esto el ×12 vivía solo en la rama calculada, y como casi todas las
       líneas escritas a mano tienen `monto` y no `precioUnitario`, mover el switch a "Anual"
       no cambiaba un solo número: el control se veía roto. Si Ventas escribió el precio anual,
       ése manda; si no, ×12 — el peor caso, no una promesa de descuento. */
    if (!anual) return { ...vacio, rango: m };
    const escritoAnual = parseMonto(l.precioAnual, moneda);
    if (escritoAnual && escritoAnual !== "sucio") return { ...vacio, rango: escritoAnual };
    return {
      ...vacio,
      rango: { min: m.min * MESES_POR_CONTRATO.anual, max: m.max * MESES_POR_CONTRATO.anual },
    };
  }
  if (precio === "sucio") return { ...vacio, sucio: true, calculada: true };

  // El ×12 solo cuando el anual NO está escrito: si Ventas lo escribió, ése es el precio.
  const factor = anual && !conTexto(l.precioAnual) ? MESES_POR_CONTRATO.anual : 1;
  const unitario: Rango = { min: precio.min * factor, max: precio.max * factor };

  const desc = parseDescuento(l.descuento);
  if (desc === "sucio") {
    return { ...vacio, sucio: true, calculada: true, unitario, cantidad };
  }
  const bruto: Rango = { min: unitario.min * cantidad, max: unitario.max * cantidad };
  return {
    rango: { min: aplicarDescuento(bruto.min, desc), max: aplicarDescuento(bruto.max, desc) },
    sucio: false,
    calculada: true,
    unitario,
    cantidad,
    // Solo con descuento REAL: sin él, `bruto` y `rango` son el mismo número y mostrarlo
    // tachado al lado de sí mismo no dice nada.
    bruto: desc ? bruto : null,
    descuento: desc,
  };
}

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
/**
 * El camino INVERSO de `montoDeLinea`: del importe final al precio de lista por unidad.
 *
 * Existe porque los dos campos de la fila —"1 × precio de lista" y el monto de la derecha—
 * son DOS VISTAS DEL MISMO NÚMERO, no dos datos: escribir en cualquiera de los dos tiene que
 * mover al otro. Sin esto, quien escribía el monto veía "1 × precio de lista" en gris para
 * siempre, y quien escribía el precio no podía volver a corregir por el monto.
 *
 * Deshace la cuenta en el mismo orden: primero el descuento (porcentual o fijo), después la
 * cantidad. Un descuento del 100% no se puede invertir —cualquier precio da el mismo neto— y
 * devuelve null: no se adivina.
 */
export function precioDesdeMonto(
  neto: Rango,
  cantidad: number,
  desc: Descuento | null,
): Rango | null {
  const unidades = cantidad > 0 ? cantidad : 1;
  const invertir = (n: number): number | null => {
    if (!desc) return n / unidades;
    if (desc.tipo === "monto") return (n + desc.valor) / unidades;
    if (desc.valor >= 100) return null;
    return n / (1 - desc.valor / 100) / unidades;
  };
  const min = invertir(neto.min);
  const max = invertir(neto.max);
  if (min === null || max === null) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { min: r2(min), max: r2(max) };
}

/**
 * El tag del descuento, tal como se pinta al lado del monto: "−15%" o "−$200". Sale del
 * descuento YA LEÍDO (no del texto crudo) para que el tag no pueda decir una cosa y la resta
 * otra: si el parser no lo entendió, no hay tag — hay ⚠ "no suma".
 */
export function textoDescuento(d: Descuento, moneda?: string | null): string {
  return d.tipo === "pct"
    ? `−${d.valor}%`
    : `−${formatRango({ min: d.valor, max: d.valor }, moneda ?? "")}`;
}

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

/**
 * El card «Recurrente mensual» se retiró (2026-08-14, pedido de Elías: abajo de la tabla solo
 * quedan los extras opcionales). Lo que vivía ahí NO se pierde: cada fila baja a la tabla como
 * una línea de LICENCIAS marcada `mensual`, que es exactamente lo que era — el placeholder del
 * card decía "Licencia / mantenimiento…" y 4 de las 6 filas guardadas son licencias de
 * plataforma.
 *
 * Se decidió con los datos a la vista: 9 secciones tenían contenido ahí y 4 son propuestas
 * PUBLICADAS (Prodex, REMPRO, AVELEC). Borrar el card sin más les sacaba esas líneas de la
 * vista del cliente; proyectarlas las conserva. La contrapartida, aceptada explícitamente por
 * Elías: en Prodex la única fila con monto legible ("$450 USD") ahora SÍ entra en la
 * aritmética, así que su cierre pasa a decir "Pago único" + "Por mes" en vez de un total solo.
 *
 * Corre en el RENDER (no persiste por su cuenta) y se fija con el primer guardado humano —
 * misma mecánica que `adoptarShapeNuevo`. Idempotente: sin `recurrentes` devuelve lo mismo.
 */
export function adoptarRecurrentes<T extends InversionData>(data: T): T {
  const viejas = (data.recurrentes ?? []).filter(
    (l) => conTexto(l?.concepto) || conTexto(l?.monto) || conTexto(l?.detalle),
  );
  if (!viejas.length) return data.recurrentes?.length ? { ...data, recurrentes: undefined } : data;
  return {
    ...data,
    licencias: [...(data.licencias ?? []), ...viejas.map((l) => ({ ...l, recurrencia: "mensual" }))],
    recurrentes: undefined,
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

  // ── El eje RECURRENCIA (2026-08-13) ───────────────────────────────────────
  // Un cobro único y una mensualidad no se suman: son plata de naturalezas distintas y
  // meterlas en un solo número es la mentira más cara que puede cometer esta sección.

  /** ¿Alguna línea ACTIVA se declara recurrente? Con `false` —o sea TODO lo publicado, que
   *  no declara recurrencia— el cierre de la sección es exactamente el de siempre. */
  hayRecurrentes: boolean;
  /** Suma de las líneas activas de cobro ÚNICO (los dos grupos). Solo con `hayRecurrentes`. */
  unico: Rango | null;
  /** Suma de las líneas activas recurrentes, en el plazo del contrato. */
  recurrente: Rango | null;
  /** El plazo con el que se cotizaron las recurrentes. */
  contrato: Contrato;
}

/** Un grupo que no se puede sumar: todo lo que tenga algo escrito queda pendiente. */
const sinSuma = (ls: LineaInversion[] | undefined) => ({
  total: null as Rango | null,
  pendientes: (ls ?? []).filter((l) => esLineaActiva(l) && (conTexto(l?.monto) || conTexto(l?.precioUnitario))).length,
});

/** Suma las líneas ACTIVAS de un grupo, con la aritmética de renglón de cotización. */
function sumarGrupo(
  ls: LineaInversion[] | undefined,
  moneda: string,
  contrato: Contrato,
  filtro?: (l: LineaInversion) => boolean,
): { total: Rango | null; pendientes: number } {
  let min = 0;
  let max = 0;
  let alguno = false;
  let pendientes = 0;
  for (const l of ls ?? []) {
    if (!esLineaActiva(l)) continue; // apagada: ni suma ni reclama
    if (filtro && !filtro(l)) continue;
    const m = montoDeLinea(l, moneda, contrato);
    if (m.sucio) {
      pendientes++;
      continue;
    }
    if (!m.rango) continue;
    alguno = true;
    min += m.rango.min;
    max += m.rango.max;
  }
  return { total: alguno ? { min, max } : null, pendientes };
}

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
  const contrato = contratoDe(d);

  /* El default de recurrencia se aplica ACÁ y una sola vez: los grupos que salen de esta
     función ya lo traen resuelto, así que la fila, el subtotal y el cierre leen lo mismo. */
  const servicios = conRecurrenciaPorDefecto("lineas", d.lineas);
  const licencias = conRecurrenciaPorDefecto("licencias", d.licencias);

  const a = conflicto ? sinSuma(servicios) : sumarGrupo(servicios, moneda, contrato);
  const b = conflicto ? sinSuma(licencias) : sumarGrupo(licencias, moneda, contrato);
  const gruposConMonto = (a.total ? 1 : 0) + (b.total ? 1 : 0);

  /* El eje recurrencia atraviesa los DOS grupos: un setup de HubSpot es único aunque esté en
     licencias, y un soporte mensual de Smarteam es recurrente aunque esté en servicios. */
  const todas = [...servicios, ...licencias];
  const hayRecurrentes = todas.some((l) => esLineaActiva(l) && esRecurrente(l));
  const unico = hayRecurrentes && !conflicto
    ? sumarGrupo(todas, moneda, contrato, (l) => !esRecurrente(l)).total
    : null;
  const recurrente = hayRecurrentes && !conflicto
    ? sumarGrupo(todas, moneda, contrato, esRecurrente).total
    : null;

  return {
    servicios: { clave: "lineas", lineas: servicios, total: a.total, pendientes: a.pendientes },
    licencias: { clave: "licencias", lineas: licencias, total: b.total, pendientes: b.pendientes },
    /* ⚠ El gran total se APAGA en cuanto hay una línea recurrente: sumar un CapEx con una
       mensualidad da un número que no existe en ningún contrato. Ahí el cierre pasa a ser
       "pago único" + "recurrente", que son dos números que sí se pueden firmar. Como lo
       publicado no declara recurrencia, su cierre no se mueve. */
    granTotal: !hayRecurrentes && gruposConMonto === 2 ? sumaRangos(a.total, b.total) : null,
    gruposConMonto,
    pendientesTotales: a.pendientes + b.pendientes,
    hayRecurrentes,
    unico,
    recurrente,
    contrato,
    // ⚠ La moneda DEDUCIDA gobierna la aritmética y el formato, NUNCA el rótulo: la barra
    // "Montos en X" sigue mostrando solo lo que la sección DECLARA. Afirmarle al cliente una
    // moneda que nadie eligió sería fabricación.
    moneda,
  };
}

// ── Las licencias por Hub ────────────────────────────────────────────────────
//
// Lo que la propuesta dice que IMPLEMENTA arriba ("Qué se implementa") es lo que tiene que
// COBRAR abajo: una línea por Hub vendido, con su ícono y su monto. La regla vive acá y no
// en el componente porque decide qué se escribe en el documento de un cliente.

/** La key de la sección en los dos templates. Existe por el mismo motivo que
 *  `USE_CASES_SECTION_KEY`: un literal suelto en una route es un typo que no falla — solo
 *  deja de sembrar, en silencio. */
export const INVERSION_SECTION_KEY = "inversion";

const slugDeLinea = (l: LineaInversion | undefined) => {
  const h = (l?.hub ?? "").trim();
  return h ? normalizeTag(h) ?? h : "";
};

/**
 * Una línea de licencia por Hub. `monto` y `detalle` SIEMPRE vacíos: sembrar no puede
 * inventar un precio (los escribe Ventas) ni afirmar una periodicidad que nadie declaró — un
 * "Licencia anual" sembrado es fabricación, y encima quedaría congelado en el idioma de la
 * corrida. El concepto es el rótulo del producto (`labelForTag`), que no se traduce: la línea
 * nace correcta en español y en inglés, y el chip del grupo ya dice "Licencias y plataforma".
 *
 * Una línea sin monto es INERTE para la aritmética (`parseMonto("")` es null): no suma, no
 * cuenta como pendiente, no enciende el gran total. Sembrar no mueve un centavo.
 */
export function lineasDeLicenciaPorHub(
  slugs: readonly string[],
): Array<{ concepto: string; monto: string; detalle: string; hub: string }> {
  return slugs.map((hub) => ({ hub, concepto: labelForTag(hub), monto: "", detalle: "" }));
}

export interface ConciliacionLicencias {
  /** Vendidos que todavía no tienen línea propia. */
  faltan: string[];
  /** Slugs con línea que ya NO están vendidos. La línea NO se toca: se avisa. */
  sobran: string[];
  /** Líneas CON `hub` y sin monto — el cliente vería un "—". */
  sinMonto: number;
}

/** Qué le falta y qué le sobra al grupo de licencias respecto de lo vendido. PURA y sin
 *  efectos: quien agrega o quita es la persona, con un clic explícito. */
export function conciliarLicenciasHub(
  licencias: LineaInversion[] | undefined,
  vendidos: readonly string[],
): ConciliacionLicencias {
  const conHub = (licencias ?? []).filter((l) => !!slugDeLinea(l));
  const yaEstan = new Set(conHub.map(slugDeLinea));
  const venta = new Set(vendidos.map((v) => normalizeTag(v) ?? v));
  return {
    faltan: vendidos.filter((v) => !yaEstan.has(normalizeTag(v) ?? v)),
    sobran: [...yaEstan].filter((s) => !venta.has(s)),
    sinMonto: conHub.filter((l) => !(l.monto ?? "").trim()).length,
  };
}

/**
 * DEFAULT DE NACIMIENTO del grupo de licencias: una línea por Hub vendido, sin monto.
 * Devuelve el MISMO objeto si no hay nada que sembrar (el llamador detecta el cambio por
 * identidad). Tres frenos, cada uno cierra un modo de falla medido contra la base real:
 *
 *  1. SHAPE LEGACY → no se toca. Escribir en `licencias` vuelve `esInversionLegacy` false, y
 *     entonces `InvestmentSection` DEJA de proyectar ⇒ `implementacion` y `licenciasHubspot`
 *     quedan en el Json sin renderizarse en NINGUNA superficie, sin error y sin camino de UI
 *     para recuperarlos. Son 7 canvases activos hoy (3 publicados): tronex perdería su
 *     "USD $7.500" y CLARK y Color Solution sus condiciones de licencia. La conversión la
 *     hace el EDITOR, donde `d` ya es la proyección y `set` parte de `d`. El server no
 *     persiste proyecciones.
 *  2. GRUPO CON ALGO ESCRITO → no se toca. `inversion` se arrastra verbatim en cada
 *     "Generar" (es `agentGenerated:false`), así que "completar lo que falta" acá resucitaría
 *     en cada corrida las líneas que Ventas borró a propósito. Lo incremental lo hace el
 *     asistente del editor, con la línea genérica a la vista.
 *  3. SIN VENDIDOS → no se toca. No se adivina qué se vendió.
 */
export function sembrarLicenciasIniciales<T extends InversionData>(
  data: T,
  vendidos: readonly string[],
): T {
  if (!vendidos.length) return data;
  if (esInversionLegacy(data)) return data;
  if (conContenido(data.licencias)) return data;
  return { ...data, licencias: lineasDeLicenciaPorHub(vendidos) };
}

/** Los conceptos de las líneas de Hub que quedaron SIN monto. Lo consume el preflight de
 *  `publish`: una línea sembrada que nadie coteó vuelve la sección no-blank ⇒ se publicaría
 *  una tabla de guiones sin total. Se lee de un Json crudo, así que tolera basura. */
export function licenciasDeHubSinMonto(data: unknown): string[] {
  const ls = (data as InversionData | null)?.licencias;
  if (!Array.isArray(ls)) return [];
  return ls
    .filter((l) => !!l && typeof l === "object" && !!slugDeLinea(l) && !(l.monto ?? "").trim())
    .map((l) => (l.concepto ?? "").trim() || labelForTag(slugDeLinea(l)));
}
