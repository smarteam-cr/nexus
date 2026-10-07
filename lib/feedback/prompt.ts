/**
 * lib/feedback/prompt.ts — el prompt para Claude Code de un reporte o de un tema. PURO (client-safe).
 *
 * Elías, 2026-10-05: «que cada cosa por hacer o mejora por hacer tenga un botón de generar prompt… un
 * prompt sencillo para aplicar la optimización en Claude Code, tomando en cuenta que ya va a tener todo el
 * proyecto de Nexus en el contexto».
 *
 * Por eso el prompt NO explica Nexus ni dónde está cada archivo: dice qué hay que hacer, con las palabras
 * de quien lo pidió, y dónde se ve (la pantalla y su ruta). Lo arma una plantilla, no un agente: sale al
 * instante, no cuesta, y quien interpreta es el propio Claude Code.
 *
 * Lo que NO lleva, a propósito:
 *   · nombres ni correos de nadie: alcanza con el rol (contexto de quién lo vio) y «Dirección» en la
 *     conversación. El prompt se pega fuera de Nexus;
 *   · la captura: su enlace firmado vence en una hora. Si hace falta, el prompt dice que se pida;
 *   · los ids de la ruta: `/clients/cm9…` se escribe `/clients/[id]`, que es como se llama la carpeta.
 */
import type { DetalleDeEscala, FilaDelManual } from "./escala";
import { COLUMNA, numeroDeReporte, TIPO, type Columna, type TipoDeFeedback } from "./reglas";

/** Lo que sabe el prompt de un reporte de la escala. */
export interface EscalaParaPrompt {
  ancla: string;
  /** «Ventas · Procesos y Rutinas · Funcional» (null si ya no existe en la escala de hoy). */
  donde: string | null;
  textoAnclado: string;
  /** Lo que dice hoy; null si no se sabe o ya no existe. */
  textoDeHoy: string | null;
  version: string;
  /** El nombre de la edición con que se leía (null = la escala general). */
  edicion: string | null;
  cambio: FilaDelManual | null;
}

export interface ReporteParaPrompt {
  numero: number;
  tipo: TipoDeFeedback;
  cuerpo: string;
  meFrena: boolean;
  pantalla: string;
  ruta: string;
  /** El rol de quien lo mandó («CSE», «Sales»…). */
  rol: string | null;
  marcas: { n: number; descripcion: string }[];
  errores: { mensaje: string; hace: string }[];
  /** La conversación, en orden: quién habló (quien lo reportó o dirección) y qué dijo. */
  mensajes: { deQuienReporto: boolean; cuerpo: string }[];
  tieneCaptura: boolean;
  escala: EscalaParaPrompt | null;
}

export interface TemaParaPrompt {
  titulo: string;
  detalle: string | null;
  pantalla: string | null;
  columna: Columna;
  /** Los reportes del tema, del más viejo al más nuevo. */
  reportes: ReporteParaPrompt[];
  /** A cuántas personas distintas les pasa. */
  personas: number;
}

/** Cuántos reportes entran enteros en el prompt de un tema; del resto se dice cuántos son. */
export const MAX_REPORTES_EN_EL_PROMPT = 12;
/** Cuántos mensajes de la conversación de un reporte van (los últimos). */
export const MAX_MENSAJES_EN_EL_PROMPT = 4;
const MAX_MENSAJE = 600;

// ── La ruta, como se llama en el código ─────────────────────────────────────

/**
 * Un segmento que es un id (cuid, uuid, hexadecimal largo o un número de HubSpot), no un nombre de carpeta.
 * Un número corto no: `?anio=2026` es un dato de la pantalla, no un id.
 */
function esId(segmento: string): boolean {
  return (
    /^c[a-z0-9]{20,32}$/.test(segmento) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento) ||
    /^[0-9a-f]{16,}$/i.test(segmento) ||
    /^\d{6,}$/.test(segmento)
  );
}

/**
 * La ruta con los ids cambiados por `[id]`: `/clients/cm9x…/x?pieza=resumen` → `/clients/[id]/x?pieza=resumen`.
 * Así se llama la carpeta de `app/`, y el prompt no lleva el id de ningún cliente.
 */
export function rutaParaElCodigo(ruta: string): string {
  const [camino, consulta] = ruta.split("?", 2);
  const caminoLimpio = camino
    .split("/")
    .map((s) => (s && esId(s) ? "[id]" : s))
    .join("/");
  if (!consulta) return caminoLimpio;
  const partes = consulta
    .split("&")
    .filter(Boolean)
    .map((p) => {
      const [k, v] = p.split("=", 2);
      if (v === undefined) return k;
      let valor = v;
      try {
        valor = decodeURIComponent(v);
      } catch {
        /* se queda como venía */
      }
      return `${k}=${esId(valor) ? "[id]" : valor}`;
    });
  return partes.length ? `${caminoLimpio}?${partes.join("&")}` : caminoLimpio;
}

// ── Las piezas del texto ─────────────────────────────────────────────────────

function corto(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+\n/g, "\n");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Una cita en una línea (los saltos de línea se vuelven espacios). */
function enLinea(texto: string, max: number): string {
  return corto(texto.replace(/\s*\n+\s*/g, " "), max);
}

function quien(rol: string | null): string {
  return rol ? `quien lo reportó (${rol})` : "quien lo reportó";
}

function lineasDeMarcas(r: ReporteParaPrompt): string[] {
  if (!r.marcas.length) return [];
  return ["Lo que señaló en la pantalla:", ...r.marcas.map((m) => `${m.n}. ${m.descripcion}`)];
}

function lineasDeErrores(r: ReporteParaPrompt): string[] {
  if (!r.errores.length) return [];
  return ["Errores de la consola de esa pantalla en ese momento:", ...r.errores.map((e) => `- «${enLinea(e.mensaje, 300)}» (${e.hace})`)];
}

function lineasDeConversacion(r: ReporteParaPrompt): string[] {
  if (!r.mensajes.length) return [];
  const ultimos = r.mensajes.slice(-MAX_MENSAJES_EN_EL_PROMPT);
  const antes = r.mensajes.length - ultimos.length;
  return [
    antes > 0 ? `Lo que se habló después (los últimos ${ultimos.length} mensajes):` : "Lo que se habló después:",
    ...ultimos.map((m) => `- ${m.deQuienReporto ? "Quien lo reportó" : "Dirección"}: ${enLinea(m.cuerpo, MAX_MENSAJE)}`),
  ];
}

function lineasDeEscala(e: EscalaParaPrompt): string[] {
  const sobre = [e.donde ? `${e.ancla} (${e.donde})` : e.ancla, e.edicion ? `edición «${e.edicion}»` : "escala general", `versión ${e.version}`];
  const lineas = [`Sobre: ${sobre.join(", ")}.`, `Lo que decía cuando lo leyó: «${enLinea(e.textoAnclado, 1200)}»`];
  if (e.textoDeHoy && e.textoDeHoy !== e.textoAnclado) lineas.push(`Lo que dice hoy: «${enLinea(e.textoDeHoy, 1200)}»`);
  if (e.cambio) {
    lineas.push("La fila del manual que se decidió:", `- Qué cambiaría: ${enLinea(e.cambio.que, 1200)}`);
    if (e.cambio.caso.trim()) lineas.push(`- Caso que lo originó: ${enLinea(e.cambio.caso, 1200)}`);
    lineas.push(`- Qué decisión con el cliente cambiaría: ${enLinea(e.cambio.decision, 1200)}`);
  }
  return lineas;
}

const CIERRE_DE_LA_ESCALA =
  "La escala vive en docs/escala/. Propón el cambio como una versión nueva, siguiendo su especificación, su historial y sus pruebas. No la publiques: muéstrame el cambio primero.";

const CIERRE: Record<TipoDeFeedback, string> = {
  falla: "Busca la causa en el código de esa pantalla antes de cambiar nada. Al terminar, dime en una frase qué estaba mal y qué cambiaste.",
  mejora:
    "Revisa cómo está hecha esa pantalla y aplica el cambio con el estilo que ya tiene. Si choca con una decisión de docs/DECISIONS.md, avísame antes de cambiarla. Al terminar, dime en pocas líneas qué cambiaste.",
  duda: "Busca qué texto, rótulo o ayuda de esa pantalla haría que se entienda sin explicarlo, y cámbialo. Al terminar, dime qué cambiaste.",
};

const ENCABEZADO: Record<TipoDeFeedback, string> = {
  falla: "Arregla esta falla de Nexus",
  mejora: "Aplica esta mejora en Nexus",
  duda: "Alguien no entendió esta parte de Nexus: hazla más clara",
};

// ── El prompt de un reporte ──────────────────────────────────────────────────

/** El prompt de un reporte de la bandeja. */
export function promptDeReporte(r: ReporteParaPrompt): string {
  const numero = numeroDeReporte(r.numero);
  const bloques: string[][] = [];

  if (r.escala) {
    bloques.push([`Cambio pedido a la Escala de Rendimiento (${numero}, desde Feedback · ${TIPO[r.tipo].nombre}).`]);
    bloques.push(lineasDeEscala(r.escala));
    bloques.push([`Lo que escribió ${quien(r.rol)}:`, `«${corto(r.cuerpo, 4000)}»`]);
  } else {
    bloques.push([`${ENCABEZADO[r.tipo]} (${numero}, reportado desde Feedback).`]);
    const dicho = [`Lo que escribió ${quien(r.rol)}:`, `«${corto(r.cuerpo, 4000)}»`];
    if (r.tipo === "falla" && r.meFrena) dicho.push("Le frena el trabajo: es urgente.");
    bloques.push(dicho);
    bloques.push([`Dónde: «${r.pantalla}» (ruta ${rutaParaElCodigo(r.ruta)}).`]);
  }

  const marcas = lineasDeMarcas(r);
  if (marcas.length) bloques.push(marcas);
  const errores = lineasDeErrores(r);
  if (errores.length) bloques.push(errores);
  const conversacion = lineasDeConversacion(r);
  if (conversacion.length) bloques.push(conversacion);

  const cierre = [r.escala ? CIERRE_DE_LA_ESCALA : CIERRE[r.tipo]];
  if (r.tieneCaptura) cierre.push(`Si necesitas ver la pantalla, pídeme la captura del ${numero}.`);
  bloques.push(cierre);

  return bloques.map((b) => b.join("\n")).join("\n\n");
}

// ── El prompt de un tema ─────────────────────────────────────────────────────

function bloqueDeReporteEnElTema(r: ReporteParaPrompt): string[] {
  const donde = r.escala ? `Escala · ${r.escala.ancla}` : `«${r.pantalla}» (ruta ${rutaParaElCodigo(r.ruta)})`;
  const cabeza = [numeroDeReporte(r.numero), TIPO[r.tipo].nombre, r.rol, donde].filter(Boolean).join(" · ");
  const lineas = [cabeza, `«${corto(r.cuerpo, 2000)}»`];
  if (r.tipo === "falla" && r.meFrena) lineas.push("Le frena el trabajo.");
  if (r.escala) lineas.push(...lineasDeEscala(r.escala));
  lineas.push(...lineasDeMarcas(r), ...lineasDeErrores(r), ...lineasDeConversacion(r));
  return lineas;
}

/** El prompt de un tema de la hoja de ruta: lo que pide y cada reporte que lo pidió. */
export function promptDeTema(t: TemaParaPrompt): string {
  const bloques: string[][] = [];
  bloques.push([`Implementa esto en Nexus: «${t.titulo}» (tema de la hoja de ruta de Feedback · ${COLUMNA[t.columna].nombre}).`]);

  const contexto: string[] = [];
  if (t.detalle?.trim()) contexto.push(corto(t.detalle, 1200));
  if (t.pantalla?.trim()) contexto.push(`Dónde se nota: ${t.pantalla.trim()}.`);
  if (contexto.length) bloques.push(contexto);

  if (t.reportes.length === 0) {
    bloques.push(["Lo cargó dirección a mano: no hay reportes con más detalle."]);
  } else {
    const frena = t.reportes.filter((r) => r.tipo === "falla" && r.meFrena).length;
    const personas = t.personas === 1 ? "1 persona" : `${t.personas} personas`;
    const reportes = t.reportes.length === 1 ? "1 reporte" : `${t.reportes.length} reportes`;
    const aQuien = frena === 0 ? "" : frena === 1 ? "; a 1 le frena el trabajo" : `; a ${frena} les frena el trabajo`;
    bloques.push([`Lo pidieron ${personas} en ${reportes}${aQuien}:`]);
    for (const r of t.reportes.slice(0, MAX_REPORTES_EN_EL_PROMPT)) bloques.push(bloqueDeReporteEnElTema(r));
    const resto = t.reportes.length - MAX_REPORTES_EN_EL_PROMPT;
    if (resto > 0) bloques.push([`Y ${resto} ${resto === 1 ? "reporte más" : "reportes más"}, en Nexus › Feedback.`]);
  }

  const deLaEscala = t.reportes.some((r) => r.escala);
  const fueraDeLaEscala = t.reportes.length === 0 || t.reportes.some((r) => !r.escala);
  const cierre: string[] = [];
  if (fueraDeLaEscala) {
    cierre.push(
      "Revisa el código de esas pantallas y aplica el cambio con el estilo que ya tienen. Si choca con una decisión de docs/DECISIONS.md, avísame antes de cambiarla. Al terminar, dime en pocas líneas qué cambiaste.",
    );
  }
  if (deLaEscala) cierre.push(CIERRE_DE_LA_ESCALA);
  if (t.reportes.some((r) => r.tieneCaptura)) cierre.push("Si necesitas ver una pantalla, pídeme la captura de ese reporte.");
  bloques.push(cierre);

  return bloques.map((b) => b.join("\n")).join("\n\n");
}

// ── Desde lo que ya tiene la bandeja ─────────────────────────────────────────

/** El reporte que la bandeja ya cargó (`ReporteDetalle`), como lo lee el prompt. */
export function reporteParaPromptDesdeElDetalle(d: {
  numero: number;
  tipo: TipoDeFeedback;
  cuerpo: string;
  meFrena: boolean;
  pantalla: string;
  ruta: string;
  autor: { rol: string };
  marcas: { n: number; descripcion: string }[];
  errores: { mensaje: string; hace: string }[];
  mensajes: { deQuienReporto: boolean; cuerpo: string }[];
  capturaUrl: string | null;
  escala: DetalleDeEscala | null;
}): ReporteParaPrompt {
  return {
    numero: d.numero,
    tipo: d.tipo,
    cuerpo: d.cuerpo,
    meFrena: d.meFrena,
    pantalla: d.pantalla,
    ruta: d.ruta,
    rol: d.autor.rol && d.autor.rol !== "Miembro" ? d.autor.rol : null,
    marcas: d.marcas,
    errores: d.errores,
    mensajes: d.mensajes.map((m) => ({ deQuienReporto: m.deQuienReporto, cuerpo: m.cuerpo })),
    tieneCaptura: !!d.capturaUrl,
    escala: d.escala ? escalaParaPrompt(d.escala) : null,
  };
}

/** Lo de la escala que ya armó `detalleDeEscala` (lib/feedback/escala-server.ts). */
export function escalaParaPrompt(e: DetalleDeEscala): EscalaParaPrompt {
  return {
    ancla: e.ancla,
    donde: e.ruta,
    textoAnclado: e.textoAnclado,
    textoDeHoy: e.textoDeHoy,
    version: e.version,
    edicion: e.edicion,
    cambio: e.cambio,
  };
}
