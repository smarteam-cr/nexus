/**
 * lib/escala/vista.ts — lo que la pantalla de la escala recibe del servidor. PURO.
 *
 * El servidor parsea la versión publicada y baja SOLO el área que se mira (más lo poco que es de
 * toda la escala: niveles, capas, definiciones, reglas). Así una página no carga las tres áreas.
 */
import { sinTildes } from "./documento/parsear";
import type { Cierre, Despues } from "./documento/perfil";
import type { ComoCambiaLaEscala } from "./documento/manual";
import { DOCUMENTOS_DE_LA_ESCALA, type DocumentoDeLaEscala } from "./documento/documentos";
import type {
  Area,
  CapaDeLaEscala,
  EntradaDelHistorial,
  Escala,
  NivelDeLaEscala,
  OrdenDeDependencias,
  PalabraConValorFijo,
  PreguntaDelPerfil,
  Verificacion,
} from "./documento/tipos";

export interface DocumentoParaDescargar {
  clave: DocumentoDeLaEscala;
  titulo: string;
  archivo: string;
  paraQuien: string;
  /** La versión publicada, o null si ese documento todavía no se publicó. */
  version: string | null;
}

export interface DatosDeLaVista {
  version: string;
  fecha: string | null;
  estado: string | null;
  /** ISO. */
  publicadaEn: string;
  /** La última publicada no se pudo leer y se muestra la anterior. */
  aviso: string | null;
  niveles: NivelDeLaEscala[];
  capas: CapaDeLaEscala[];
  areas: { id: string; nombre: string; slug: string }[];
  area: Area;
  /** Id de criterio de riesgo de ESTA área → el mensaje que ve el cliente. */
  riesgos: Record<string, string>;
  verificacion: Partial<Record<Verificacion, string>>;
  explicaciones: Escala["explicaciones"];
  glosario: Escala["glosario"];
  documentos: DocumentoParaDescargar[];
  palabrasConValorFijo: PalabraConValorFijo[];
  /** Lo que se subraya en los textos: las palabras con valor fijo y los términos del glosario. */
  terminos: TerminoSubrayado[];
  casosDeLectura: Escala["casosDeLectura"];
  perfilDeNegocio: Escala["perfilDeNegocio"];
  automatizacion: Escala["automatizacion"];
  /** Las reglas de asignación que tocan alguna dimensión de ESTA área. */
  asignacion: Escala["asignacion"];
  dependencias: OrdenDeDependencias[];
  /** Qué cambió en esta versión (su entrada del historial). */
  novedades: EntradaDelHistorial | null;
  /** Cómo cambia la escala y quién decide (del manual publicado). */
  comoCambia: ComoCambiaLaEscala | null;
}

export function datosDeLaVista(args: {
  escala: Escala;
  area: Area;
  publicadaEn: Date;
  aviso: string | null;
  versiones: { documento: string; version: string }[];
  comoCambia?: ComoCambiaLaEscala | null;
}): DatosDeLaVista {
  const { escala, area } = args;
  const prefijo = `${area.id}.`;
  return {
    version: escala.version,
    fecha: escala.fecha,
    estado: escala.estado,
    publicadaEn: args.publicadaEn.toISOString(),
    aviso: args.aviso,
    niveles: escala.niveles,
    capas: escala.capas,
    areas: escala.areas.map((a) => ({ id: a.id, nombre: a.nombre, slug: a.slug })),
    area,
    riesgos: Object.fromEntries(Object.entries(escala.riesgos).filter(([id]) => id.startsWith(prefijo))),
    verificacion: escala.verificacion,
    explicaciones: escala.explicaciones,
    glosario: escala.glosario,
    documentos: DOCUMENTOS_DE_LA_ESCALA.map((d) => ({
      clave: d.clave,
      titulo: d.titulo,
      archivo: d.archivo,
      paraQuien: d.paraQuien,
      // `versiones` viene ordenada de la más nueva a la más vieja.
      version: args.versiones.find((v) => v.documento === d.clave)?.version ?? null,
    })),
    palabrasConValorFijo: escala.palabrasConValorFijo,
    terminos: terminosParaSubrayar(escala),
    casosDeLectura: escala.casosDeLectura,
    perfilDeNegocio: escala.perfilDeNegocio,
    automatizacion: escala.automatizacion,
    asignacion: escala.asignacion.filter((r) => r.dimensiones.some((id) => id.startsWith(prefijo))),
    dependencias: escala.dependencias,
    novedades: escala.historial.find((h) => h.version === escala.version) ?? null,
    comoCambia: args.comoCambia ?? null,
  };
}

// ── Reglas que la pantalla aplica ─────────────────────────────────────────────

/**
 * El orden de dependencias que vale para una capa de un área («Qué se trabaja primero»). En la
 * base de Ventas depende de cómo se cierra la venta: con el cierre elegido vale una fila; sin él,
 * se devuelven las tres (la pantalla las muestra con su «cuándo»).
 */
export function ordenDeDependencias(
  dependencias: OrdenDeDependencias[],
  areaNombre: string,
  capaNombre: string,
  cierre: Cierre | null,
): OrdenDeDependencias[] {
  const norm = (s: string) => sinTildes(s).toLowerCase();
  const delArea = dependencias.filter((d) => norm(d.capa) === norm(capaNombre) && norm(d.cuando).includes(norm(areaNombre)));
  if (delArea.length <= 1 || !cierre) return delArea;
  const conCierre = delArea.filter((d) => norm(d.cuando).includes(norm(cierre)));
  return conCierre.length ? conCierre : delArea;
}

/**
 * En qué lugar del orden de su capa va una dimensión (1, 2…), o null si el orden no la nombra. El
 * orden de la base nombra las dimensiones por su nombre genérico («Datos»); el de la producción,
 * por el del área («Tracción del Deal»): vale cualquiera de los dos.
 */
export function lugarEnElOrden(
  orden: Pick<OrdenDeDependencias, "orden"> | null,
  d: { nombre: string; generica: { nombre: string } | null },
): number | null {
  if (!orden) return null;
  const norm = (s: string) => sinTildes(s).toLowerCase().trim();
  const nombres = [d.nombre, d.generica?.nombre].filter((x): x is string => !!x).map(norm);
  const i = orden.orden.findIndex((paso) => nombres.includes(norm(paso)));
  return i === -1 ? null : i + 1;
}

/**
 * Cómo se lee la escala con este cierre, dicho por la propia escala: el párrafo de «El perfil de
 * negocio» que empieza «En la venta transaccional…», o la oración que empieza «En la venta
 * mixta…». Si una versión lo dice de otra forma, no hay nota (y la pantalla sigue igual).
 */
export function notaDelCierre(perfil: Pick<Escala["perfilDeNegocio"], "notas">, cierre: Cierre | null): string | null {
  if (!cierre) return null;
  const norm = (s: string) => sinTildes(s).toLowerCase();
  const inicio = norm(`En la venta ${cierre}`);
  const parrafo = perfil.notas.find((p) => norm(p).startsWith(inicio));
  if (parrafo) return parrafo;
  for (const p of perfil.notas) {
    const oracion = p.split(/(?<=\.)\s+/).find((o) => norm(o).startsWith(inicio));
    if (oracion) return oracion;
  }
  return null;
}

/**
 * La definición que da la escala de una respuesta del perfil: «transaccional» → «cuando la venta
 * se cierra sin que nadie la trabaje…». La escala las nombra con otras palabras («Relación única»
 * para `única`), así que se busca la que TERMINA en el valor, sin tildes ni mayúsculas.
 */
export function definicionDeOpcion(pregunta: PreguntaDelPerfil | null, valor: Cierre | Despues): string | null {
  const norm = (s: string) => sinTildes(s).toLowerCase().trim();
  return pregunta?.opciones.find((o) => norm(o.nombre).endsWith(norm(valor)))?.definicion ?? null;
}

/**
 * Una palabra que se subraya en los textos de la escala, con su significado al pasar el cursor: una
 * de valor fijo («la mayoría» = al menos 80%) o un término del glosario («pipeline review»).
 */
export interface TerminoSubrayado extends PalabraConValorFijo {
  tipo?: "valor" | "glosario";
}

/**
 * Las palabras que se subrayan: las de valor fijo y los términos del glosario, todo sacado de la
 * escala. Una fila del glosario que nombra varios («BANT, MEDDIC, SPIN», «Macros y snippets»)
 * cuenta como uno por nombre.
 */
export function terminosParaSubrayar(escala: Pick<Escala, "palabrasConValorFijo" | "glosario">): TerminoSubrayado[] {
  const valor = escala.palabrasConValorFijo.map((p) => ({ ...p, tipo: "valor" as const }));
  const glosario = escala.glosario.flatMap((g) =>
    g.termino
      .split(/,\s*|\s+y\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((termino) => ({ termino, significado: g.significado, tipo: "glosario" as const })),
  );
  return [...valor, ...glosario];
}

export type Trozo = { texto: string; palabra: TerminoSubrayado | null };

/**
 * Parte un texto en trozos, marcando las palabras con valor fijo («la mayoría», «a tiempo»…) y los
 * términos del glosario para mostrarlos con su significado. Sin distinguir mayúsculas, solo palabras
 * enteras, la más larga primero («pipeline review» antes que «pipeline») y, las del glosario, también
 * en plural («pipeline reviews», «deals»).
 */
export function partirPorPalabras(texto: string, palabras: TerminoSubrayado[]): Trozo[] {
  if (!palabras.length || !texto) return [{ texto, palabra: null }];
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const orden = [...palabras].sort((a, b) => b.termino.length - a.termino.length);
  const alternativa = (p: TerminoSubrayado) => escapar(p.termino) + (p.tipo === "glosario" ? "(?:es|s)?" : "");
  const patron = new RegExp(`(?<![\\p{L}\\p{N}])(${orden.map(alternativa).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const cual = (hallado: string) => {
    const h = hallado.toLowerCase();
    return (
      orden.find((p) => {
        const t = p.termino.toLowerCase();
        return h === t || (p.tipo === "glosario" && (h === `${t}s` || h === `${t}es`));
      }) ?? null
    );
  };
  const out: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(patron)) {
    const i = m.index ?? 0;
    if (i > desde) out.push({ texto: texto.slice(desde, i), palabra: null });
    out.push({ texto: m[1], palabra: cual(m[1]) });
    desde = i + m[1].length;
  }
  if (desde < texto.length) out.push({ texto: texto.slice(desde), palabra: null });
  return out;
}

// ── El estado de la pantalla en la URL ───────────────────────────────────────

export type Vista = "matriz" | "dimension" | "mapa";
export const VISTAS: readonly Vista[] = ["matriz", "dimension", "mapa"];

/** Una vista que ya no existe (`?vista=guia`, de un enlace viejo) abre la matriz. */
export function vistaDesdeUrl(v: string | null | undefined): Vista {
  return (VISTAS as readonly string[]).includes(v ?? "") ? (v as Vista) : "matriz";
}
