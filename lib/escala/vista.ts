/**
 * lib/escala/vista.ts — lo que la pantalla de la escala recibe del servidor. PURO.
 *
 * El servidor parsea la versión publicada y baja SOLO el área que se mira (más lo poco que es de
 * toda la escala: niveles, capas, definiciones, reglas). Así una página no carga las tres áreas.
 */
import { resumenDeLaEdicion, type ResumenDeLaEdicion } from "./documento/edicion";
import { sinTildes } from "./documento/parsear";
import { perfilParaUrl, type Cierre, type Despues, type Perfil } from "./documento/perfil";
import { enlacesQueAplican, requeridosDe, type EnlaceDeCriterio } from "./documento/requeridos";
import type { ComoCambiaLaEscala } from "./documento/manual";
import { DOCUMENTOS_DE_LA_ESCALA, type DocumentoDeLaEscala } from "./documento/documentos";
import { herramientasDeLaVista, type HerramientasDeLaVista } from "./herramientas/vista";
import type { MapaDeHerramientas } from "./herramientas/tipos";
import type {
  Area,
  CapaDeLaEscala,
  Edicion,
  EdicionAplicada,
  EntradaDelHistorial,
  Escala,
  NivelDeLaEscala,
  OrdenDeDependencias,
  PalabraConValorFijo,
  PreguntaDelPerfil,
  Verificacion,
} from "./documento/tipos";

/** Una edición por industria, para elegirla en el filtro. */
export type EdicionParaElegir = Pick<Edicion, "slug" | "nombre" | "descripcion" | "perfilHabitual">;

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
  /** Las ediciones por industria que trae la escala (el filtro «Industria»). */
  ediciones: EdicionParaElegir[];
  /** Qué es una edición, con las palabras de la escala. */
  edicionesIntro: string | null;
  /**
   * La edición con que se está viendo (null = la escala general) y cuánto cambió de ESTA área.
   * `adaptaElArea`: una edición se escribe por áreas, y puede no decir nada de esta todavía (ahí se
   * lee entera con la escala general).
   */
  edicion: (EdicionAplicada & { resumen: ResumenDeLaEdicion; adaptaElArea: boolean }) | null;
  /** Los requeridos de los criterios de ESTA área, en los dos sentidos (el otro lado puede ser de otra área). */
  requeridos: RequeridosDelArea;
  /**
   * Los criterios de ESTA área que existen en otra lectura de la escala y no en la que se ve
   * (`anclasDeOtraLectura`). El panel de un nivel lista los comentarios de sus criterios retirados;
   * con esto sabe cuáles no lo son: son de otra edición, o los sacó esta.
   */
  anclasDeOtraLectura: string[];
  /**
   * El mapa de herramientas publicado, reducido a esta área (null si no hay uno publicado): dónde
   * ayuda cada herramienta. Interno, como toda la sección; la escala misma no nombra herramientas.
   */
  herramientas: HerramientasDeLaVista | null;
}

/** Por id de criterio: lo que requiere y quiénes lo requieren. Sin enlaces, el id no está. */
export interface RequeridosDelArea {
  requiere: Record<string, EnlaceDeCriterio[]>;
  loRequieren: Record<string, EnlaceDeCriterio[]>;
}

/** Los requeridos de un área, como objetos planos (viajan del servidor al navegador). */
export function requeridosDelArea(escala: Pick<Escala, "areas">, area: Pick<Area, "id">): RequeridosDelArea {
  const { necesita, loNecesitan } = requeridosDe(escala);
  const delArea = (m: Map<string, EnlaceDeCriterio[]>) => Object.fromEntries([...m].filter(([id]) => id.startsWith(`${area.id}.`)));
  return { requiere: delArea(necesita), loRequieren: delArea(loNecesitan) };
}

/**
 * Con qué criterios se relaciona uno, para marcarlos en la pantalla: los que requiere y los que lo
 * requieren a él, de los que aplican al perfil elegido. Sin enlaces, los dos conjuntos van vacíos.
 */
export function relacionadosCon(id: string | null, requeridos: RequeridosDelArea, perfil: Perfil): { requiere: Set<string>; loRequieren: Set<string> } {
  if (!id) return { requiere: new Set(), loRequieren: new Set() };
  return {
    requiere: new Set(enlacesQueAplican(requeridos.requiere[id], perfil).map((e) => e.id)),
    loRequieren: new Set(enlacesQueAplican(requeridos.loRequieren[id], perfil).map((e) => e.id)),
  };
}

/**
 * `escala` es la que se MUESTRA: la general, o la que devuelve `aplicarEdicion` cuando se eligió una
 * industria (y `area`, la suya). Todo lo que sigue la trata igual.
 */
export function datosDeLaVista(args: {
  escala: Escala;
  area: Area;
  publicadaEn: Date;
  aviso: string | null;
  versiones: { documento: string; version: string }[];
  comoCambia?: ComoCambiaLaEscala | null;
  /** El mapa de herramientas publicado (o null): baja solo lo de esta área. */
  mapa?: MapaDeHerramientas | null;
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
    ediciones: escala.ediciones.map((e) => ({ slug: e.slug, nombre: e.nombre, descripcion: e.descripcion, perfilHabitual: e.perfilHabitual })),
    edicionesIntro: escala.edicionesIntro,
    edicion: escala.edicion
      ? {
          ...escala.edicion,
          resumen: resumenDeLaEdicion(area.dimensiones),
          adaptaElArea: !!escala.ediciones.find((e) => e.slug === escala.edicion?.slug)?.areas.some((a) => a.id === area.id && a.dimensiones.length > 0),
        }
      : null,
    requeridos: requeridosDelArea(escala, area),
    anclasDeOtraLectura: anclasDeOtraLectura(escala, area),
    herramientas: herramientasDeLaVista(args.mapa ?? null, area),
  };
}

/** Los identificadores que existen en un área, como se ve con la edición elegida. */
export function anclasDelArea(area: Area): Set<string> {
  return new Set(area.dimensiones.flatMap((d) => [d.id, ...d.niveles.flatMap((n) => [n.id, ...n.criterios.map((c) => c.id)])]));
}

/**
 * Los criterios de un área que existen en OTRA lectura de la escala y no en la que se ve: los
 * propios de las demás ediciones (viendo la general, los de todas) y los que la edición elegida
 * sacó («No aplican»). Un comentario sobre uno de esos se ve donde su criterio existe.
 *
 * Lo que no está acá ni en el área es un identificador RETIRADO: ya no existe en ninguna lectura,
 * y sus comentarios se siguen viendo en el nivel donde estaba (la evidencia no queda invisible).
 */
export function anclasDeOtraLectura(escala: Pick<Escala, "ediciones">, area: Area): string[] {
  const seVen = anclasDelArea(area);
  const deLasEdiciones = escala.ediciones.flatMap((e) =>
    e.areas.filter((a) => a.id === area.id).flatMap((a) => a.dimensiones.flatMap((d) => [...d.propios.map((c) => c.id), ...d.noAplican])),
  );
  return [...new Set(deLasEdiciones)].filter((id) => !seVen.has(id));
}

/**
 * Los contadores de comentarios de lo que SE VE. Un comentario hecho sobre un criterio propio de una
 * edición no se cuenta en la escala general (ahí ese criterio no existe), ni uno sobre un criterio
 * que la edición sacó se cuenta en ella. Los de un criterio RETIRADO sí se cuentan, en su celda: el
 * panel de ese nivel los lista, y sin el número nada en la matriz avisaría que están.
 */
export function conteosQueSeVen<T>(conteos: Record<string, T>, escala: Pick<Escala, "ediciones">, area: Area): Record<string, T> {
  const deOtraLectura = new Set(anclasDeOtraLectura(escala, area));
  return Object.fromEntries(Object.entries(conteos).filter(([ancla]) => !deOtraLectura.has(ancla)));
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
export function terminosParaSubrayar(
  escala: Pick<Escala, "palabrasConValorFijo" | "glosario"> & { edicion?: Pick<EdicionAplicada, "palabras"> | null },
): TerminoSubrayado[] {
  const valor = escala.palabrasConValorFijo.map((p) => ({ ...p, tipo: "valor" as const }));
  const glosario = escala.glosario.flatMap((g) =>
    g.termino
      .split(/,\s*|\s+y\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((termino) => ({ termino, significado: g.significado, tipo: "glosario" as const })),
  );
  const palabras = escala.edicion?.palabras ?? [];
  if (palabras.length === 0) return [...valor, ...glosario];

  // Con una edición: lo que todavía se lee con el texto general dice, al pasar el cursor, cómo se
  // llama eso en la industria («Deal» → «En esta edición: pedido o carrito»). Si el término ya está
  // en el glosario, las dos cosas van juntas en un solo subrayado.
  const norm = (s: string) => s.toLowerCase().trim();
  const enMinuscula = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`.replace(/\.$/, "");
  const usadas = new Set<string>();
  const conEdicion = glosario.map((g) => {
    const p = palabras.find((x) => norm(x.general) === norm(g.termino));
    if (!p) return g;
    usadas.add(norm(p.general));
    return { ...g, significado: `En esta edición: ${enMinuscula(p.edicion)}. En la escala general: ${enMinuscula(g.significado)}.` };
  });
  const soloDeLaEdicion = palabras
    .filter((p) => !usadas.has(norm(p.general)))
    .map((p) => ({ termino: p.general, significado: `En esta edición: ${enMinuscula(p.edicion)}.`, tipo: "glosario" as const }));
  return [...valor, ...conEdicion, ...soloDeLaEdicion];
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

export interface EstadoEnLaUrl {
  vista: Vista;
  perfil: Perfil;
  /** La clave de la edición por industria, o null para la escala general. */
  industria: string | null;
  /** Solo en «Por dimensión». */
  dimension?: string | null;
  /** Solo en el mapa: `1.7.F`, `1.7` o `F`. */
  celda?: string | null;
  /** El identificador con el panel de comentarios abierto. */
  ancla?: string | null;
  /** Las herramientas prendidas en el filtro (`?h=insider,hubspot`). */
  herramientas?: readonly string[];
}

/**
 * Lo que se mira, como consulta de la URL (`?industria=…&cierre=…`, o vacío). Un solo lugar arma la
 * dirección: si cada quien la armara a su modo, alguno se olvidaría de la industria y un refresco
 * devolvería a la escala general.
 */
export function consultaDeLaEscala(e: EstadoEnLaUrl): string {
  const p = new URLSearchParams();
  if (e.industria) p.set("industria", e.industria);
  if (e.vista !== "matriz") p.set("vista", e.vista);
  const u = perfilParaUrl(e.perfil);
  if (u.cierre) p.set("cierre", u.cierre);
  if (u.despues) p.set("despues", u.despues);
  if (e.vista === "dimension" && e.dimension) p.set("dim", e.dimension);
  if (e.vista === "mapa" && e.celda) p.set("celda", e.celda);
  if (e.herramientas?.length) p.set("h", e.herramientas.join(","));
  if (e.ancla) p.set("c", e.ancla);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
