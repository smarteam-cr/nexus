/**
 * lib/planificacion/importar.ts — pegar una plantilla de propiedades en la Planificación (2026-10-25).
 *
 * El equipo ya tiene las propiedades de cada cliente en hojas de cálculo: las plantillas de Caroline y la
 * pestaña «PROPIEDADES DE …» del Brief de implementación. Copiar de Excel o de Google Sheets pega texto
 * separado por tabuladores; esto lo lee en las dos formas que circulan:
 *
 *   · VERTICAL — una fila de títulos (Propiedad, Nombre interno, Tipo, Opciones…) y una propiedad por
 *     fila. Las columnas sin campo propio van a `extra`: no se pierde nada.
 *   · LA DEL BRIEF — horizontal: una fila «NOMBRE DE PROPIEDAD» con una propiedad por columna, arriba
 *     la fila de grupos («TARJETA DE VISUALIZACIÓN») y la de tipos, y debajo «CONTENIDO DE LA PROPIEDAD»
 *     con las opciones en columna. «N/A» como tipo quiere decir que la trae HubSpot.
 *
 * Puro: lo usan la sección de propiedades y las pruebas. Las filas salen con `autor: "plantilla"`, así
 * regenerar no las reemplaza (`fusionarFilas`).
 */
import {
  claveDeFila,
  normalizarObjeto,
  nuevoIdDeFila,
  agregarGrupo,
  TIPOS_DE_PROPIEDAD,
  type FilaPropiedad,
  type PropiedadesData,
} from "./propiedades";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s: unknown) => (typeof s === "string" ? sinTildes(s).trim().toLowerCase().replace(/\s+/g, " ") : "");

/**
 * Texto pegado → filas de celdas. Tabuladores (lo que pega Excel o Sheets); si no hay ninguno, `;` o `,`.
 *
 * Una celda con varios renglones (las opciones del Brief suelen ir así, una por renglón) llega ENTRE COMILLAS, con las
 * comillas de adentro dobladas. Cortar por renglón la partía en propiedades falsas («En contacto», «Descartado»), y como
 * venían de una plantilla regenerar nunca las quitaba (2026-10-25, la revisión). Se lee carácter por carácter.
 */
export function celdasDe(texto: string): string[][] {
  const t = texto.replace(/\r\n?/g, "\n");
  const sep = t.includes("\t") ? "\t" : t.includes(";") ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let i = 0;
  while (i < t.length) {
    if (celda === "" && t[i] === '"') {
      // Celda entre comillas: hasta la comilla que cierra (una doble `""` es una comilla de adentro).
      i++;
      while (i < t.length) {
        if (t[i] === '"' && t[i + 1] === '"') {
          celda += '"';
          i += 2;
        } else if (t[i] === '"') {
          i++;
          break;
        } else celda += t[i++];
      }
      // Lo que quede hasta el separador (no debería haber nada) se suma tal cual.
      while (i < t.length && t[i] !== sep && t[i] !== "\n") celda += t[i++];
      continue;
    }
    const c = t[i++];
    if (c === sep) {
      fila.push(celda.trim());
      celda = "";
    } else if (c === "\n") {
      fila.push(celda.trim());
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  fila.push(celda.trim());
  filas.push(fila);
  return filas;
}

/** Las opciones de una celda: una por renglón, unidas con «·» como las escribe la tabla. */
const opcionesDeCelda = (v: string) =>
  v.includes("\n") ? v.split("\n").map((x) => x.trim()).filter(Boolean).join(" · ") : v;

/** El tipo como lo escribe una plantilla (en español o en inglés, como lo muestra HubSpot) → nuestro valor. */
export function tipoDesdeTexto(v: unknown): string {
  const t = norm(v);
  if (!t) return "";
  if ((TIPOS_DE_PROPIEDAD as readonly { value: string }[]).some((o) => o.value === t)) return t;
  if (/^n\/?a$/.test(t)) return "";
  if (/varias lineas|multi-?line|parrafo/.test(t)) return "texto_largo";
  if (/fecha y hora|date and time|datetime/.test(t)) return "fecha_hora";
  if (/fecha|date/.test(t)) return "fecha";
  if (/moneda|currency/.test(t)) return "moneda";
  if (/numer|number/.test(t)) return "numero";
  if (/seleccion multiple|casillas|multiple checkbox|multi ?select/.test(t)) return "casillas";
  if (/casilla unica|single checkbox|booleano|boolean|si\/no/.test(t)) return "casilla";
  if (/boton|radio/.test(t)) return "opcion_unica";
  if (/desplegable|dropdown|seleccion|lista|enumer/.test(t)) return "desplegable";
  if (/telefono|phone/.test(t)) return "telefono";
  if (/archivo|file/.test(t)) return "archivo";
  if (/usuario|propietario|owner|user/.test(t)) return "usuario";
  if (/calculo|calculation|formula/.test(t)) return "calculo";
  if (/texto|text|linea|cadena|string/.test(t)) return "texto";
  return "";
}

type Campo = "objeto" | "grupo" | "etiqueta" | "campo" | "tipo" | "opciones" | "obligatoria" | "uso" | "estado";

/** Los títulos de columna que se reconocen, del más específico al más general (gana el primero que calza). */
const TITULOS: Array<[Campo, RegExp]> = [
  ["campo", /^(nombre interno|internal name|campo|nombre del campo|api)/],
  ["grupo", /^(grupo|group|tarjeta)/],
  ["objeto", /^(objeto|object)$/],
  ["tipo", /^(tipo|type|field type)/],
  ["opciones", /^(opciones|options|valores|values|contenido)/],
  ["obligatoria", /^(obligatori|requerid|required)/],
  ["uso", /^(para que|uso|descripcion|description|proposito)/],
  ["estado", /^(estado|status)$/],
  ["etiqueta", /^(propiedad|nombre de (la )?propiedad|etiqueta|label|nombre|property)/],
];

const fila = (p: Partial<FilaPropiedad> & { objeto: string; etiqueta: string }): FilaPropiedad => ({
  id: nuevoIdDeFila(),
  autor: "plantilla",
  campo: "",
  tipo: "",
  grupo: "",
  opciones: "",
  obligatoria: "no",
  estado: "nueva",
  uso: "",
  origen: "",
  fuente: "",
  ...p,
});

const esSi = (v: unknown) => /^(si|yes|x|true|obligatorio|obligatoria|requerido|requerida)$/.test(norm(v));

/** Forma VERTICAL: la primera fila que reconoce al menos una propiedad es la de títulos. */
function leerVertical(celdas: string[][], objetoPorDefecto: string): FilaPropiedad[] | null {
  const iTitulos = celdas.findIndex((r) => {
    const campos = r.map((c) => TITULOS.find(([, re]) => re.test(norm(c)))?.[0]);
    return campos.includes("etiqueta") || campos.includes("campo");
  });
  if (iTitulos < 0) return null;
  const titulos = celdas[iTitulos];
  const mapa = titulos.map((c) => TITULOS.find(([, re]) => re.test(norm(c)))?.[0] ?? null);
  // Una columna por campo: la segunda que diga «nombre» no pisa a la primera.
  const vistos = new Set<Campo>();
  const columnas = mapa.map((c) => (c && !vistos.has(c) ? (vistos.add(c), c) : null));
  const out: FilaPropiedad[] = [];
  for (const r of celdas.slice(iTitulos + 1)) {
    if (!r.some((c) => c)) continue;
    const v: Partial<Record<Campo, string>> = {};
    const extra: Record<string, string> = {};
    r.forEach((c, j) => {
      if (!c) return;
      const campo = columnas[j];
      if (campo) v[campo] = c;
      else if (titulos[j]) extra[titulos[j]] = c;
    });
    const etiqueta = v.etiqueta ?? "";
    if (!etiqueta && !v.campo) continue;
    const tipoCrudo = v.tipo ?? "";
    out.push(
      fila({
        objeto: normalizarObjeto(v.objeto) || objetoPorDefecto,
        etiqueta,
        campo: v.campo ?? "",
        grupo: v.grupo ?? "",
        tipo: tipoDesdeTexto(tipoCrudo),
        opciones: opcionesDeCelda(v.opciones ?? ""),
        obligatoria: v.obligatoria ? (esSi(v.obligatoria) ? "si" : "no") : "no",
        estado: /^n\/?a$/.test(norm(tipoCrudo)) ? "hubspot" : v.estado ? norm(v.estado) : "nueva",
        uso: v.uso ?? "",
        ...(Object.keys(extra).length ? { extra } : {}),
      }),
    );
  }
  return out;
}

/** La primera celda con texto de una fila, y su columna. */
function rotuloDe(r: string[]): { texto: string; col: number } {
  const col = r.findIndex((c) => c);
  return { texto: col < 0 ? "" : norm(r[col]), col };
}

/** Forma DEL BRIEF: una propiedad por columna, con los grupos arriba y las opciones debajo. */
function leerDelBrief(celdas: string[][], objeto: string): FilaPropiedad[] | null {
  const iNombres = celdas.findIndex((r) => rotuloDe(r).texto.startsWith("nombre de propiedad"));
  if (iNombres < 0) return null;
  const { col } = rotuloDe(celdas[iNombres]);
  const buscar = (re: RegExp) => celdas.findIndex((r, i) => i < iNombres + 2 && re.test(rotuloDe(r).texto));
  const iTipos = buscar(/^tipo de propiedad/);
  const iGrupos = buscar(/^tarjeta de visualizacion|^grupo/);
  const iContenido = celdas.findIndex((r, i) => i > iNombres && rotuloDe(r).texto.startsWith("contenido"));

  const nombres = celdas[iNombres];
  let grupo = "";
  const out: FilaPropiedad[] = [];
  for (let j = col + 1; j < nombres.length; j++) {
    const g = iGrupos >= 0 ? (celdas[iGrupos][j] ?? "") : "";
    if (g) grupo = g;
    const etiqueta = nombres[j] ?? "";
    if (!etiqueta) continue;
    const tipoCrudo = iTipos >= 0 ? (celdas[iTipos][j] ?? "") : "";
    const opciones: string[] = [];
    if (iContenido >= 0) {
      for (let i = iContenido; i < celdas.length; i++) {
        const c = celdas[i][j] ?? "";
        if (c) opciones.push(opcionesDeCelda(c));
      }
    }
    out.push(
      fila({
        objeto,
        etiqueta,
        grupo,
        tipo: tipoDesdeTexto(tipoCrudo),
        opciones: opciones.join(" · "),
        estado: /^n\/?a$/.test(norm(tipoCrudo)) ? "hubspot" : "nueva",
      }),
    );
  }
  return out;
}

export interface ResultadoDeImportar {
  filas: FilaPropiedad[];
  /** Qué forma se reconoció, para decirlo en pantalla. */
  forma: "brief" | "vertical" | null;
}

/** Lee lo pegado. `objeto` es la pestaña abierta: vale para la forma del Brief y para una tabla sin columna de objeto. */
export function leerPlantilla(texto: string, objeto: string): ResultadoDeImportar {
  const celdas = celdasDe(texto);
  const brief = leerDelBrief(celdas, objeto);
  if (brief?.length) return { filas: brief, forma: "brief" };
  const vertical = leerVertical(celdas, objeto);
  if (vertical?.length) return { filas: vertical, forma: "vertical" };
  return { filas: [], forma: null };
}

/**
 * Suma lo importado a la tabla. Una propiedad que ya escribió una persona se queda como está; una que
 * escribió la IA la reemplaza la de la plantilla (en su lugar). Los grupos nuevos se suman en el orden
 * en que vinieron.
 */
export function sumarImportadas(
  data: PropiedadesData,
  importadas: readonly FilaPropiedad[],
): { data: PropiedadesData; sumadas: number; repetidas: number } {
  const filas = [...(data.filas ?? [])];
  let sumadas = 0;
  let repetidas = 0;
  for (const n of importadas) {
    const i = filas.findIndex((f) => claveDeFila(f) === claveDeFila(n));
    if (i >= 0 && filas[i].autor !== "ia" && filas[i].autor !== undefined) {
      repetidas++;
      continue;
    }
    if (i >= 0) filas[i] = { ...n, id: filas[i].id ?? n.id };
    else filas.push(n);
    sumadas++;
  }
  let out: PropiedadesData = { ...data, filas };
  for (const n of importadas) if (n.grupo) out = agregarGrupo(out, normalizarObjeto(n.objeto), n.grupo);
  return { data: out, sumadas, repetidas };
}
