/**
 * lib/escala/documento/parsear.ts — el archivo de la Escala de Rendimiento → datos. PURO.
 *
 * Es el ÚNICO lector de la escala en Nexus: lo usan la sección de la escala, el script que la
 * publica y los tests, y está pensado para que la rúbrica del Diagnóstico y el documento de los
 * agentes salgan de acá cuando dejen de estar escritos a mano. Ningún criterio, nivel ni pregunta
 * se escribe en código: todo sale del texto (lo vigila `fuente-unica.test.ts`).
 *
 * ── ESTRICTO CON LA MATRIZ, TOLERANTE CON LA PROSA ───────────────────────────
 * · La matriz (Parte 3) se lee línea por línea, y una línea que el lector no reconoce es un ERROR
 *   con su número. Es a propósito: el lector de Python salta en silencio la línea que no calza con
 *   su expresión, y un criterio con una marca nueva desaparecería sin que nadie lo note. Acá el
 *   formato nuevo se descubre al publicar, no en una pantalla con criterios de menos.
 * · La prosa que acompaña (panorámicas, definiciones, glosario, historial) es opcional: si una
 *   versión la reescribe, esa parte queda vacía y la pantalla sigue. Los tests del archivo real
 *   dicen si falta algo que la versión vigente sí tiene.
 * · Las EDICIONES por industria (desde la 8.0.0, al final del documento) se leen con la misma
 *   gramática y la misma exigencia que la matriz (`leerEdiciones`). La escala general es todo lo
 *   que va antes de ellas: se lee exactamente igual con ediciones que sin ellas. Cómo se ve la
 *   escala con una edición lo arma `edicion.ts` (`aplicarEdicion`).
 *
 * La etiqueta de cada criterio se lee con la MISMA expresión que `docs/escala/pruebas_escala.py`.
 */
import {
  CIERRES,
  DESPUES,
  ErrorDeFormato,
  LETRAS,
  LETRAS_CON_RESULTADO,
  VERIFICACIONES,
  type Area,
  type BloqueDeTexto,
  type CapaDeLaEscala,
  type ClaveDeCapa,
  type Criterio,
  type Dimension,
  type Edicion,
  type EdicionDeArea,
  type EdicionDeDimension,
  type EdicionDeNivel,
  type Escala,
  type Letra,
  type MarcaDePerfil,
  type Nivel,
  type NivelDeLaEscala,
  type Verificacion,
} from "./tipos";

/**
 * La etiqueta de un criterio. Espejo exacto de `PAT` en `pruebas_escala.py`. Lo último, desde la
 * 8.3.0, son los criterios que requiere: `· requiere 1.5.F1, 1.6.F2`.
 */
export const ETIQUETA_DE_CRITERIO =
  /^- (.*) `\[(\d+\.\d+\.[DIFEO]\d+) · (\w+)((?: · riesgo)?)((?: · hábito)?)((?: · venta con equipo| · venta sin vendedor| · cliente recurrente| · recompra| · relación continua)?)((?: · requiere \d+\.\d+\.[DIFEO]\d+(?:, \d+\.\d+\.[DIFEO]\d+)*)?)\]`$/;

/** «· requiere 1.5.F1, 1.6.F2» → los ids, en el orden en que están escritos. Sin requeridos, nada. */
function requeridosDeLaEtiqueta(grupo: string): { requiere?: string[] } {
  const ids = [...grupo.matchAll(/\d+\.\d+\.[DIFEO]\d+/g)].map((m) => m[0]);
  return ids.length ? { requiere: ids } : {};
}

/** Una línea que PARECE un criterio: se reconoce por la etiqueta al final, bien formada o no. */
const PARECE_CRITERIO = /`\[[^\]]*\]`\s*$/;

// ── Utilidades de texto ───────────────────────────────────────────────────────

/** Sin CRLF, partido en líneas. Los archivos de la escala llegan con CRLF desde Windows. */
export function lineasDe(texto: string): string[] {
  return texto.replace(/\r\n?/g, "\n").split("\n");
}

/** «Óptimo» → «optimo». Para comparar y para las URLs. */
export function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** «Ventas» → «ventas», «Servicio al cliente» → «servicio-al-cliente». */
export function slugDe(nombre: string): string {
  return sinTildes(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** El encabezado `--- clave: valor ---` del principio del documento. */
export function leerEncabezado(texto: string): Record<string, string> {
  const lineas = lineasDe(texto);
  const out: Record<string, string> = {};
  if (lineas[0]?.trim() !== "---") return out;
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i].trim() === "---") break;
    const m = /^([\w-]+):\s*(.*)$/.exec(lineas[i]);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Las líneas de una sección: desde su encabezado hasta el siguiente del mismo nivel o más alto. */
export function seccion(lineas: string[], encabezado: RegExp): string[] {
  const i = lineas.findIndex((l) => encabezado.test(l));
  if (i === -1) return [];
  const nivel = /^(#+)/.exec(lineas[i])?.[1].length ?? 2;
  const fin = lineas.findIndex((l, j) => {
    if (j <= i) return false;
    const m = /^(#+)\s/.exec(l);
    return !!m && m[1].length <= nivel;
  });
  return lineas.slice(i + 1, fin === -1 ? undefined : fin);
}

/** Los párrafos de un bloque de líneas (separados por líneas en blanco). */
export function parrafos(lineas: string[]): string[] {
  const out: string[] = [];
  let actual: string[] = [];
  for (const l of lineas) {
    if (!l.trim()) {
      if (actual.length) out.push(actual.join(" "));
      actual = [];
    } else {
      actual.push(l.trim());
    }
  }
  if (actual.length) out.push(actual.join(" "));
  return out;
}

/**
 * Los párrafos y los puntos de lista de un bloque de líneas, en orden (sin encabezados, tablas ni
 * `---`). Una línea pegada a un punto, sin línea en blanco en medio, lo continúa.
 */
export function bloquesDe(lineas: string[]): BloqueDeTexto[] {
  const out: BloqueDeTexto[] = [];
  let actual: string[] = [];
  let enPunto = false;
  const cerrar = () => {
    if (actual.length) out.push({ tipo: "parrafo", texto: actual.join(" ") });
    actual = [];
  };
  for (const l of lineas) {
    const t = l.trim();
    const punto = /^- (.+)$/.exec(t);
    if (!t || t.startsWith("#") || t.startsWith("|") || /^-{3,}$/.test(t)) {
      cerrar();
      enPunto = false;
    } else if (punto) {
      cerrar();
      out.push({ tipo: "punto", texto: punto[1].trim() });
      enPunto = true;
    } else if (enPunto) {
      out[out.length - 1].texto += ` ${t}`;
    } else {
      actual.push(t);
    }
  }
  cerrar();
  return out;
}

/** Las filas de las tablas de un bloque, sin la de encabezado ni la de separadores. */
function filasDeTabla(lineas: string[]): string[][] {
  const out: string[][] = [];
  let enTabla = false;
  for (const l of lineas) {
    const t = l.trim();
    if (!t.startsWith("|")) {
      enTabla = false;
      continue;
    }
    const celdas = t
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (!enTabla) {
      enTabla = true; // la primera fila es el encabezado
      continue;
    }
    if (celdas.every((c) => /^:?-+:?$/.test(c))) continue;
    out.push(celdas);
  }
  return out;
}

/** Un párrafo que abre en negrita (`**Criterios de riesgo.** …`) y los que lo siguen hasta el próximo. */
function bloqueEnNegrita(lineas: string[], titulo: string): string | null {
  const ps = parrafos(lineas);
  const i = ps.findIndex((p) => p.startsWith(`**${titulo}.**`));
  if (i === -1) return null;
  const out = [ps[i].replace(`**${titulo}.**`, "").trim()];
  for (let j = i + 1; j < ps.length && !ps[j].startsWith("**") && !ps[j].startsWith("#"); j++) out.push(ps[j]);
  return out.join("\n\n");
}

// ── La matriz ─────────────────────────────────────────────────────────────────

interface Contexto {
  niveles: NivelDeLaEscala[];
  nivelPorNombre: Map<string, NivelDeLaEscala>;
}

function leerNiveles(lineas: string[]): Contexto {
  const filas = filasDeTabla(seccion(lineas, /^## Niveles\s*$/));
  const niveles: NivelDeLaEscala[] = [];
  for (const [codigo, nombre] of filas) {
    if (!/^\d+$/.test(codigo ?? "") || !nombre) continue;
    const letra = sinTildes(nombre).charAt(0).toUpperCase() as Letra;
    niveles.push({ letra, codigo: Number(codigo), nombre });
  }
  const letras = niveles.map((n) => n.letra).join("");
  if (letras !== LETRAS.join("")) {
    throw new ErrorDeFormato(
      `la tabla «Niveles» de la Referencia tiene que traer los cinco niveles en orden (${LETRAS.join(", ")}); trae «${letras || "nada"}».`,
    );
  }
  return { niveles, nivelPorNombre: new Map(niveles.map((n) => [n.nombre, n])) };
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 7.6.1 < 7.7.0: por números, no por texto. */
function esAnteriorA(version: string, otra: string): boolean {
  const a = version.split(".").map(Number);
  const b = otra.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

function leerMatriz(lineas: string[], ctx: Contexto, version: string): { areas: Area[]; nombresDeCapa: string[] } {
  // Hasta la 7.6.1, «vende sin vendedor» era una regla de TEXTO: el criterio que traía esa frase no
  // contaba en la venta con equipo. Desde la 7.7.0 es la marca «venta sin vendedor». Una versión
  // vieja se sigue leyendo igual que cuando se publicó: la frase se lee como la marca.
  const reglaDeTexto = esAnteriorA(version, "7.7.0");
  const inicio = lineas.findIndex((l) => /^## Área \d+ — /.test(l));
  if (inicio === -1) throw new ErrorDeFormato("no encontré la matriz: falta «## Área 1 — …».");
  const finRel = lineas.slice(inicio + 1).findIndex((l) => /^# /.test(l));
  const fin = finRel === -1 ? lineas.length : inicio + 1 + finRel;

  const encabezadoDeNivel = new RegExp(
    `^\\*\\*(${ctx.niveles.map((n) => escaparRegex(n.nombre)).join("|")})\\.\\*\\* (.+)$`,
  );

  const areas: Area[] = [];
  const nombresDeCapa: string[] = [];
  let area: Area | null = null;
  let capasDelArea = 0;
  let capa: ClaveDeCapa | null = null;
  let dim: Dimension | null = null;
  let nivel: Nivel | null = null;
  /** El párrafo que se está escribiendo, para pegarle una línea de continuación. */
  let parrafo: ((linea: string) => void) | null = null;
  let anteriorEnBlanco = true;

  const cerrarDimension = (n: number) => {
    if (!dim) return;
    if (!dim.pregunta) throw new ErrorDeFormato(`la dimensión ${dim.id} no tiene pregunta.`, n);
    if (!dim.costoDeQuedarse) throw new ErrorDeFormato(`la dimensión ${dim.id} no tiene «Costo de quedarse».`, n);
    const letras = dim.niveles.map((x) => x.letra).join("");
    if (letras !== LETRAS.join("")) {
      throw new ErrorDeFormato(`la dimensión ${dim.id} tiene los niveles «${letras}»; van los cinco, en orden.`, n);
    }
  };

  for (let i = inicio; i < fin; i++) {
    const n = i + 1;
    const linea = lineas[i].trimEnd();
    const enBlanco = !linea.trim() || linea.trim() === "---";
    if (enBlanco) {
      parrafo = null;
      anteriorEnBlanco = true;
      continue;
    }
    const continuacion = !anteriorEnBlanco && parrafo !== null;
    anteriorEnBlanco = false;

    let m: RegExpExecArray | null;
    if ((m = /^## Área (\d+) — (.+)$/.exec(linea))) {
      cerrarDimension(n);
      area = { id: m[1], nombre: m[2].trim(), slug: slugDe(m[2]), descripcion: "", panoramica: {}, dimensiones: [] };
      areas.push(area);
      capasDelArea = 0;
      capa = null;
      dim = null;
      nivel = null;
      parrafo = (l) => {
        area!.descripcion = area!.descripcion ? `${area!.descripcion} ${l}` : l;
      };
      continue;
    }
    if (!area) throw new ErrorDeFormato("hay texto antes de la primera área.", n);

    if ((m = /^### (.+)$/.exec(linea))) {
      cerrarDimension(n);
      const nombre = m[1].trim();
      if (capasDelArea >= 2) throw new ErrorDeFormato(`el área ${area.id} tiene una tercera capa («${nombre}»).`, n);
      capa = capasDelArea === 0 ? "base" : "produccion";
      const esperado = nombresDeCapa[capasDelArea];
      if (esperado && esperado !== nombre) {
        throw new ErrorDeFormato(`la capa se llama «${nombre}» acá y «${esperado}» en otra área.`, n);
      }
      nombresDeCapa[capasDelArea] = nombre;
      capasDelArea++;
      dim = null;
      nivel = null;
      parrafo = null;
      continue;
    }

    if ((m = /^#### (\d+)\.(\d+) (.+)$/.exec(linea))) {
      cerrarDimension(n);
      if (!capa) throw new ErrorDeFormato(`la dimensión ${m[1]}.${m[2]} está fuera de una capa.`, n);
      if (m[1] !== area.id) throw new ErrorDeFormato(`la dimensión ${m[1]}.${m[2]} está en el área ${area.id}.`, n);
      const id = `${m[1]}.${m[2]}`;
      if (areas.some((a) => a.dimensiones.some((d) => d.id === id))) {
        throw new ErrorDeFormato(`la dimensión ${id} aparece dos veces.`, n);
      }
      dim = {
        id,
        area: area.id,
        nombre: m[3].trim(),
        capa,
        pregunta: "",
        descripcion: null,
        costoDeQuedarse: "",
        generica: null,
        niveles: [],
      };
      area.dimensiones.push(dim);
      nivel = null;
      parrafo = (l) => {
        dim!.pregunta = dim!.pregunta ? `${dim!.pregunta} ${l}` : l;
      };
      // La primera línea de texto después del título es la pregunta: se abre el párrafo vacío.
      anteriorEnBlanco = true;
      continue;
    }

    // La descripción de la dimensión (7.6.1+). «Qué mide» es como se llamó en la 7.6.0: se sigue leyendo.
    if ((m = /^\*(?:Descripción|Qué mide):\* (.+)$/.exec(linea))) {
      if (!dim || nivel) throw new ErrorDeFormato("la descripción de la dimensión está fuera de lugar: va antes de los niveles.", n);
      dim.descripcion = m[1].trim();
      parrafo = (l) => {
        dim!.descripcion += ` ${l}`;
      };
      continue;
    }

    if ((m = /^\*Costo de quedarse:\* (.+)$/.exec(linea))) {
      if (!dim || nivel) throw new ErrorDeFormato("«Costo de quedarse» fuera de lugar: va antes de los niveles.", n);
      dim.costoDeQuedarse = m[1].trim();
      parrafo = (l) => {
        dim!.costoDeQuedarse += ` ${l}`;
      };
      continue;
    }

    if ((m = encabezadoDeNivel.exec(linea))) {
      if (!dim) throw new ErrorDeFormato(`el nivel «${m[1]}» está fuera de una dimensión.`, n);
      const letra = ctx.nivelPorNombre.get(m[1])!.letra;
      nivel = { id: `${dim.id}.${letra}`, letra, descripcion: m[2].trim(), resultado: null, criterios: [] };
      dim.niveles.push(nivel);
      parrafo = (l) => {
        nivel!.descripcion += ` ${l}`;
      };
      continue;
    }

    if ((m = /^\*Resultado:\* (.+)$/.exec(linea))) {
      if (!nivel) throw new ErrorDeFormato("«Resultado» fuera de un nivel.", n);
      if (!LETRAS_CON_RESULTADO.includes(nivel.letra)) {
        throw new ErrorDeFormato(`el nivel ${nivel.id} tiene «Resultado», y la escala los pone desde Funcional.`, n);
      }
      nivel.resultado = m[1].trim();
      parrafo = (l) => {
        nivel!.resultado += ` ${l}`;
      };
      continue;
    }

    if (linea.startsWith("- ")) {
      if (!nivel || !dim) throw new ErrorDeFormato("un criterio fuera de un nivel.", n);
      m = ETIQUETA_DE_CRITERIO.exec(linea);
      if (!m) {
        throw new ErrorDeFormato(
          PARECE_CRITERIO.test(linea)
            ? `la etiqueta de este criterio no sigue la forma «[id · verificación · riesgo · hábito · perfil · requiere ids]»: ${linea.slice(0, 120)}`
            : `un punto de la lista sin etiqueta: ${linea.slice(0, 120)}`,
          n,
        );
      }
      const [, texto, id, verif, riesgo, habito, perfil, requiere] = m;
      if (!(VERIFICACIONES as readonly string[]).includes(verif)) {
        throw new ErrorDeFormato(`«${verif}» no es una forma de verificación (${VERIFICACIONES.join(", ")}).`, n);
      }
      if (!id.startsWith(`${nivel.id}`) || !/^\d+$/.test(id.slice(nivel.id.length))) {
        throw new ErrorDeFormato(`el criterio ${id} está en ${nivel.id}.`, n);
      }
      const marca = (perfil.replace(/^ · /, "") || null) as MarcaDePerfil | null;
      const criterio: Criterio = {
        id,
        texto: texto.trim(),
        verificacion: verif as Verificacion,
        riesgo: !!riesgo,
        habito: !!habito,
        perfil: marca ?? (reglaDeTexto && texto.includes("vende sin vendedor") ? "venta sin vendedor" : null),
        ...requeridosDeLaEtiqueta(requiere),
      };
      nivel.criterios.push(criterio);
      parrafo = null;
      continue;
    }

    if (/^(#|>|\||\d+\. |\* )/.test(linea)) {
      throw new ErrorDeFormato(`la matriz no admite esta línea: ${linea.slice(0, 120)}`, n);
    }

    // Texto corrido: continúa el párrafo abierto, o es la pregunta de una dimensión recién abierta,
    // o la descripción del área antes de su primera capa.
    if (continuacion && parrafo) {
      parrafo(linea.trim());
      continue;
    }
    if (dim && !nivel && !dim.pregunta && !dim.costoDeQuedarse) {
      dim.pregunta = linea.trim();
      parrafo = (l) => {
        dim!.pregunta += ` ${l}`;
      };
      continue;
    }
    if (!capa && !area.descripcion) {
      area.descripcion = linea.trim();
      parrafo = (l) => {
        area!.descripcion += ` ${l}`;
      };
      continue;
    }
    throw new ErrorDeFormato(`no sé qué es esta línea de la matriz: ${linea.slice(0, 120)}`, n);
  }
  cerrarDimension(fin);

  if (areas.length === 0) throw new ErrorDeFormato("la matriz no tiene áreas.");
  return { areas, nombresDeCapa };
}

// ── Las ediciones por industria ───────────────────────────────────────────────
// Se leen con la MISMA gramática de la matriz y con la misma exigencia: una línea que el lector no
// reconoce es un error con su número. Todo lo que una edición no dice vale como está en la matriz,
// así que acá todo es opcional; lo que se exige es que lo que nombra EXISTA (un área, una dimensión,
// el criterio que reescribe o que saca) y que un criterio propio no pise un identificador.

/** El título de la parte de las ediciones, lleve el número que lleve: «# Parte 5 — Ediciones por industria». */
const ES_LA_PARTE_DE_EDICIONES = /^# Parte \d+ — Ediciones/;

/** `[1.7.F1]`: un criterio de la escala general dicho con las palabras de la edición (solo el id). */
const ETIQUETA_DE_REESCRITO = /^- (.*) `\[(\d+\.\d+\.[DIFEO]\d+)\]`$/;

/** La «Clave» de una edición: `ecommerce-retail` (minúsculas, números y guiones). */
export const FORMA_DE_EDICION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Los criterios propios de una edición se numeran en un bloque de cien: si empieza en 101, van del
 * 101 al 199. La matriz usa los números de abajo de 100.
 */
export const PRIMER_NUMERO_DE_EDICION = 100;
export const TAMANO_DEL_BLOQUE = 99;

/** Los ids que nombra una línea como «*No aplican:* `1.7.D1`, `1.7.I2`.». */
function idsDeLaLinea(texto: string): string[] {
  return [...texto.matchAll(/`(\d+\.\d+\.[DIFEO]\d+)`/g)].map((x) => x[1]);
}

/** «transaccional · recompra.» → el perfil con que arranca quien elige la edición. */
function leerPerfilHabitual(texto: string, n: number): NonNullable<Edicion["perfilHabitual"]> {
  const norm = (s: string) => sinTildes(s).toLowerCase().replace(/\.$/, "").trim();
  const partes = texto.split("·").map(norm);
  const cierre = CIERRES.find((c) => partes.includes(norm(c)));
  const despues = DESPUES.find((d) => partes.some((p) => p === norm(d) || p === `relacion ${norm(d)}`));
  if (!cierre || !despues || partes.length !== 2) {
    throw new ErrorDeFormato(
      `«Perfil habitual» tiene que decir cómo se cierra la venta y qué pasa después («transaccional · recompra»); dice «${texto}».`,
      n,
    );
  }
  return { cierre, despues };
}

function leerEdiciones(lineas: string[], areas: Area[], ctx: Contexto): { ediciones: Edicion[]; intro: string | null } {
  const inicio = lineas.findIndex((l) => ES_LA_PARTE_DE_EDICIONES.test(l));
  if (inicio === -1) return { ediciones: [], intro: null };
  // Las ediciones van al FINAL del documento: la escala general es todo lo de antes, entero.
  const finRel = lineas.slice(inicio + 1).findIndex((l) => /^# /.test(l));
  if (finRel !== -1) {
    throw new ErrorDeFormato("las ediciones por industria van al final del documento: después de ellas no puede venir otra parte.", inicio + 2 + finRel);
  }
  const fin = lineas.length;
  const primeraRel = lineas.slice(inicio + 1, fin).findIndex((l) => /^## Edición — /.test(l));
  const primera = primeraRel === -1 ? fin : inicio + 1 + primeraRel;
  // Antes de la primera edición va la prosa que dice qué es una edición: su primer párrafo.
  const intro = parrafos(lineas.slice(inicio + 1, primera).map((l) => (l.startsWith("#") ? "" : l)))[0] ?? null;

  const encabezadoDeNivel = new RegExp(`^\\*\\*(${ctx.niveles.map((n) => escaparRegex(n.nombre)).join("|")})\\.\\*\\*(?: (.+))?$`);
  const generales = new Map(areas.flatMap((a) => a.dimensiones.map((d) => [d.id, d] as const)));
  const idsGenerales = new Set(areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((x) => x.criterios.map((c) => c.id)))));
  /** Id de un criterio propio → la edición que lo trae (no se repite entre ediciones). */
  const propiosVistos = new Map<string, string>();

  const ediciones: Edicion[] = [];
  let ed: Edicion | null = null;
  let area: EdicionDeArea | null = null;
  let dim: EdicionDeDimension | null = null;
  let letra: Letra | null = null;
  let enPalabras = false;
  let tablaDePalabras: string[] = [];
  let parrafo: ((linea: string) => void) | null = null;
  let anteriorEnBlanco = true;

  const cerrarPalabras = () => {
    if (ed && tablaDePalabras.length) {
      ed.palabras = filasDeTabla(tablaDePalabras)
        .filter((c) => c[0] && c[1])
        .map(([general, edicion]) => ({ general, edicion }));
    }
    tablaDePalabras = [];
    enPalabras = false;
  };
  /** Al terminar una edición: sin «Clave» no tiene identidad (la URL y los comentarios la usan). */
  let lineaDeLaEdicion = 0;
  const cerrarEdicion = () => {
    cerrarPalabras();
    if (ed && !ed.slug) throw new ErrorDeFormato(`la edición «${ed.nombre}» no dice su «Clave» («*Clave:* ecommerce-retail»).`, lineaDeLaEdicion);
  };

  for (let i = primera; i < fin; i++) {
    const n = i + 1;
    const linea = lineas[i].trimEnd();
    if (!linea.trim() || linea.trim() === "---") {
      parrafo = null;
      anteriorEnBlanco = true;
      continue;
    }
    const continuacion = !anteriorEnBlanco && parrafo !== null;
    anteriorEnBlanco = false;

    let m: RegExpExecArray | null;
    if ((m = /^## Edición — (.+)$/.exec(linea))) {
      cerrarEdicion();
      const nombre = m[1].trim();
      if (ediciones.some((e) => e.nombre === nombre)) throw new ErrorDeFormato(`la edición «${nombre}» aparece dos veces.`, n);
      ed = { slug: "", nombre, descripcion: null, perfilHabitual: null, bloque: null, palabras: [], areas: [] };
      lineaDeLaEdicion = n;
      ediciones.push(ed);
      area = null;
      dim = null;
      letra = null;
      parrafo = null;
      anteriorEnBlanco = true;
      continue;
    }
    if (!ed) throw new ErrorDeFormato("hay texto antes de la primera edición.", n);
    if (/^## /.test(linea)) {
      throw new ErrorDeFormato(`después de una edición solo puede venir otra edición («## Edición — …»): ${linea.slice(0, 80)}`, n);
    }

    if (/^### Palabras de esta edición\s*$/.test(linea)) {
      cerrarPalabras();
      enPalabras = true;
      area = null;
      dim = null;
      letra = null;
      parrafo = null;
      continue;
    }
    if ((m = /^### Área (\d+) — (.+)$/.exec(linea))) {
      cerrarPalabras();
      if (!areas.some((a) => a.id === m![1])) throw new ErrorDeFormato(`la escala no tiene un área ${m[1]}.`, n);
      if (ed.areas.some((a) => a.id === m![1])) throw new ErrorDeFormato(`el área ${m[1]} aparece dos veces en la edición «${ed.nombre}».`, n);
      area = { id: m[1], nombre: m[2].trim(), descripcion: null, panoramica: {}, dimensiones: [] };
      ed.areas.push(area);
      dim = null;
      letra = null;
      parrafo = null;
      anteriorEnBlanco = true;
      continue;
    }
    if (/^### /.test(linea)) {
      throw new ErrorDeFormato(`una edición se divide en «### Palabras de esta edición» y «### Área N — Nombre»: ${linea.slice(0, 80)}`, n);
    }

    if ((m = /^#### (\d+)\.(\d+) (.+)$/.exec(linea))) {
      const id = `${m[1]}.${m[2]}`;
      if (!area) throw new ErrorDeFormato(`la dimensión ${id} está fuera de un área.`, n);
      if (m[1] !== area.id) throw new ErrorDeFormato(`la dimensión ${id} está en el área ${area.id}.`, n);
      if (!generales.has(id)) throw new ErrorDeFormato(`la escala no tiene una dimensión ${id}.`, n);
      if (area.dimensiones.some((d) => d.id === id)) throw new ErrorDeFormato(`la dimensión ${id} aparece dos veces en la edición «${ed.nombre}».`, n);
      dim = {
        id,
        nombre: m[3].trim(),
        pregunta: null,
        descripcion: null,
        costoDeQuedarse: null,
        niveles: {},
        textos: {},
        propios: [],
        noAplican: [],
        seLeenIgual: [],
      };
      area.dimensiones.push(dim);
      letra = null;
      parrafo = null;
      anteriorEnBlanco = true;
      continue;
    }

    if (enPalabras) {
      if (!linea.startsWith("|")) throw new ErrorDeFormato(`«Palabras de esta edición» es una tabla: ${linea.slice(0, 80)}`, n);
      tablaDePalabras.push(linea);
      continue;
    }

    if ((m = /^\*Clave:\* (.+)$/.exec(linea))) {
      if (area) throw new ErrorDeFormato("«Clave» va al principio de la edición, antes de sus áreas.", n);
      const clave = m[1].trim().replace(/\.$/, "");
      if (!FORMA_DE_EDICION.test(clave)) {
        throw new ErrorDeFormato(`la «Clave» de una edición va en minúsculas, con números y guiones («ecommerce-retail»); dice «${clave}».`, n);
      }
      if (ediciones.some((e) => e !== ed && e.slug === clave)) throw new ErrorDeFormato(`dos ediciones tienen la clave «${clave}».`, n);
      ed.slug = clave;
      parrafo = null;
      continue;
    }

    if ((m = /^\*Perfil habitual:\* (.+)$/.exec(linea))) {
      if (area) throw new ErrorDeFormato("«Perfil habitual» va al principio de la edición, antes de sus áreas.", n);
      ed.perfilHabitual = leerPerfilHabitual(m[1], n);
      parrafo = null;
      continue;
    }

    if ((m = /^\*Criterios propios:\* (.+)$/.exec(linea))) {
      if (area) throw new ErrorDeFormato("«Criterios propios» va al principio de la edición, antes de sus áreas.", n);
      const desde = Number(/\d+/.exec(m[1])?.[0]);
      if (!Number.isInteger(desde) || desde <= PRIMER_NUMERO_DE_EDICION || desde % 100 !== 1) {
        throw new ErrorDeFormato(`«Criterios propios» dice desde qué número van los de la edición, en bloques de cien («desde el 101»); dice «${m[1]}».`, n);
      }
      ed.bloque = desde;
      parrafo = null;
      continue;
    }

    if ((m = /^\*Descripción:\* (.+)$/.exec(linea))) {
      if (!dim || letra) throw new ErrorDeFormato("la descripción de la dimensión está fuera de lugar: va antes de los niveles.", n);
      dim.descripcion = m[1].trim();
      parrafo = (l) => {
        dim!.descripcion += ` ${l}`;
      };
      continue;
    }

    if ((m = /^\*Costo de quedarse:\* (.+)$/.exec(linea))) {
      if (!dim || letra) throw new ErrorDeFormato("«Costo de quedarse» fuera de lugar: va antes de los niveles.", n);
      dim.costoDeQuedarse = m[1].trim();
      parrafo = (l) => {
        dim!.costoDeQuedarse += ` ${l}`;
      };
      continue;
    }

    // «No aplican» (los de la matriz que la edición saca) y «Se leen igual» (los que deja como están).
    if ((m = /^\*(No aplican|Se leen igual):\* (.+)$/.exec(linea))) {
      const marca = m[1];
      if (!dim) throw new ErrorDeFormato(`«${marca}» va dentro de una dimensión.`, n);
      const ids = idsDeLaLinea(m[2]);
      if (ids.length === 0) throw new ErrorDeFormato(`«${marca}» no nombra ningún criterio (van entre comillas invertidas).`, n);
      const general = generales.get(dim.id)!;
      const lista = marca === "No aplican" ? dim.noAplican : dim.seLeenIgual;
      for (const id of ids) {
        if (!general.niveles.some((x) => x.criterios.some((c) => c.id === id))) {
          throw new ErrorDeFormato(`«${marca}» nombra ${id}, que no es un criterio de ${dim.id} en la escala general.`, n);
        }
        if (lista.includes(id)) throw new ErrorDeFormato(`«${marca}» nombra ${id} dos veces.`, n);
        lista.push(id);
      }
      parrafo = null;
      continue;
    }

    if ((m = encabezadoDeNivel.exec(linea))) {
      const nivel = ctx.nivelPorNombre.get(m[1])!.letra;
      const texto = m[2]?.trim() ?? null;
      if (dim) {
        if (dim.niveles[nivel]) throw new ErrorDeFormato(`el nivel «${m[1]}» aparece dos veces en ${dim.id}.`, n);
        const x: EdicionDeNivel = { descripcion: texto, resultado: null };
        dim.niveles[nivel] = x;
        letra = nivel;
        parrafo = texto
          ? (l) => {
              x.descripcion += ` ${l}`;
            }
          : null;
        continue;
      }
      if (area) {
        if (!texto) throw new ErrorDeFormato(`el vistazo de «${m[1]}» no dice nada.`, n);
        area.panoramica[nivel] = texto;
        const a = area;
        parrafo = (l) => {
          a.panoramica[nivel] += ` ${l}`;
        };
        continue;
      }
      throw new ErrorDeFormato(`el nivel «${m[1]}» está fuera de un área.`, n);
    }

    if ((m = /^\*Resultado:\* (.+)$/.exec(linea))) {
      if (!dim || !letra) throw new ErrorDeFormato("«Resultado» fuera de un nivel.", n);
      if (!LETRAS_CON_RESULTADO.includes(letra)) {
        throw new ErrorDeFormato(`el nivel ${dim.id}.${letra} tiene «Resultado», y la escala los pone desde Funcional.`, n);
      }
      const x = dim.niveles[letra]!;
      x.resultado = m[1].trim();
      parrafo = (l) => {
        x.resultado += ` ${l}`;
      };
      continue;
    }

    if (linea.startsWith("- ")) {
      if (!dim || !letra) throw new ErrorDeFormato("un criterio fuera de un nivel.", n);
      const nivelId = `${dim.id}.${letra}`;
      if ((m = ETIQUETA_DE_CRITERIO.exec(linea))) {
        const [, texto, id, verif, riesgo, habito, perfil, requiere] = m;
        if (!(VERIFICACIONES as readonly string[]).includes(verif)) {
          throw new ErrorDeFormato(`«${verif}» no es una forma de verificación (${VERIFICACIONES.join(", ")}).`, n);
        }
        if (!id.startsWith(nivelId) || !/^\d+$/.test(id.slice(nivelId.length))) throw new ErrorDeFormato(`el criterio ${id} está en ${nivelId}.`, n);
        if (idsGenerales.has(id)) {
          throw new ErrorDeFormato(`${id} ya es un criterio de la escala general: para decirlo con otras palabras, la etiqueta lleva solo el id («[${id}]»).`, n);
        }
        const otra = propiosVistos.get(id);
        if (otra) throw new ErrorDeFormato(`${id} ya es un criterio propio de la edición «${otra}».`, n);
        const numero = Number(id.slice(nivelId.length));
        if (ed.bloque === null) {
          throw new ErrorDeFormato(`la edición «${ed.nombre}» trae un criterio propio (${id}) sin haber dicho desde qué número van («*Criterios propios:* desde el 101»).`, n);
        }
        if (numero < ed.bloque || numero >= ed.bloque + TAMANO_DEL_BLOQUE) {
          throw new ErrorDeFormato(
            `${id} es un criterio propio de «${ed.nombre}», que los numera del ${ed.bloque} al ${ed.bloque + TAMANO_DEL_BLOQUE - 1}.`,
            n,
          );
        }
        propiosVistos.set(id, ed.nombre);
        dim.propios.push({
          id,
          texto: texto.trim(),
          verificacion: verif as Verificacion,
          riesgo: !!riesgo,
          habito: !!habito,
          perfil: (perfil.replace(/^ · /, "") || null) as MarcaDePerfil | null,
          ...requeridosDeLaEtiqueta(requiere),
        });
      } else if ((m = ETIQUETA_DE_REESCRITO.exec(linea))) {
        const [, texto, id] = m;
        const general = generales.get(dim.id)!.niveles.find((x) => x.letra === letra);
        if (!general?.criterios.some((c) => c.id === id)) {
          throw new ErrorDeFormato(`${id} no es un criterio de ${nivelId} en la escala general: un criterio propio lleva la etiqueta completa.`, n);
        }
        if (dim.textos[id]) throw new ErrorDeFormato(`${id} está reescrito dos veces en la edición «${ed.nombre}».`, n);
        dim.textos[id] = texto.trim();
      } else {
        throw new ErrorDeFormato(
          PARECE_CRITERIO.test(linea)
            ? `la etiqueta de este criterio no sigue la forma «[id]» (reescrito) ni «[id · verificación · riesgo · hábito · perfil · requiere ids]» (propio): ${linea.slice(0, 120)}`
            : `un punto de la lista sin etiqueta: ${linea.slice(0, 120)}`,
          n,
        );
      }
      parrafo = null;
      continue;
    }

    // Todo lo que empieza como una marca y no es ninguna de las de arriba es un error: «*Perfil
    // habitual :*» mal escrito no puede terminar, en silencio, como parte de una descripción.
    if (/^(#|>|\||\d+\. |\*)/.test(linea)) {
      throw new ErrorDeFormato(`una edición no admite esta línea: ${linea.slice(0, 120)}`, n);
    }

    // Texto corrido: continúa el párrafo abierto, o es la pregunta de una dimensión recién abierta,
    // la descripción de un área antes de su primera dimensión, o para quién es la edición.
    if (continuacion && parrafo) {
      parrafo(linea.trim());
      continue;
    }
    if (dim) {
      if (letra || dim.pregunta !== null || dim.descripcion !== null || dim.costoDeQuedarse !== null) {
        throw new ErrorDeFormato(`no sé qué es esta línea de la edición: ${linea.slice(0, 120)}`, n);
      }
      dim.pregunta = linea.trim();
      parrafo = (l) => {
        dim!.pregunta += ` ${l}`;
      };
      continue;
    }
    if (area) {
      if (area.descripcion !== null || Object.keys(area.panoramica).length) {
        throw new ErrorDeFormato(`no sé qué es esta línea de la edición: ${linea.slice(0, 120)}`, n);
      }
      area.descripcion = linea.trim();
      const a = area;
      parrafo = (l) => {
        a.descripcion += ` ${l}`;
      };
      continue;
    }
    if (ed.descripcion !== null || ed.perfilHabitual) {
      throw new ErrorDeFormato(`no sé qué es esta línea de la edición: ${linea.slice(0, 120)}`, n);
    }
    ed.descripcion = linea.trim();
    const e = ed;
    parrafo = (l) => {
      e.descripcion += ` ${l}`;
    };
  }
  cerrarEdicion();
  return { ediciones, intro };
}

// ── La prosa (opcional) ───────────────────────────────────────────────────────

function leerPanoramicas(lineas: string[], areas: Area[], ctx: Contexto): void {
  const bloque = seccion(lineas, /^## Los cinco niveles de un vistazo\s*$/);
  let letra: Letra | null = null;
  for (const l of bloque) {
    const t = /^### (.+)$/.exec(l);
    if (t) {
      letra = ctx.nivelPorNombre.get(t[1].trim())?.letra ?? null;
      continue;
    }
    const m = /^\*\*(.+?)\.\*\* (.+)$/.exec(l.trim());
    if (m && letra) {
      const area = areas.find((a) => a.nombre === m[1]);
      if (area) area.panoramica[letra] = m[2].trim();
    }
  }
}

function leerCapas(lineas: string[], nombres: string[]): CapaDeLaEscala[] {
  const claves: ClaveDeCapa[] = ["base", "produccion"];
  return nombres.map((nombre, i) => {
    let descripcion: string | null = null;
    for (const l of lineas) {
      const m = /^\*\*(.+?) — (.+?)\.\*\*/.exec(l.trim());
      if (m && m[1] === nombre) {
        descripcion = m[2].trim();
        break;
      }
    }
    return { clave: claves[i], nombre, descripcion };
  });
}

/** El nombre genérico de cada dimensión (tablas `| x.5 | Presentación | …`) y su frase de la Parte 1. */
function leerGenericas(lineas: string[], areas: Area[]): void {
  const nombres = new Map<string, string>();
  for (const l of lineas) {
    const m = /^\|\s*x\.(\d+)\s*\|\s*([^|]+?)\s*\|/.exec(l.trim());
    if (m) nombres.set(m[1], m[2]);
  }
  const frases = new Map<string, string>();
  for (const l of seccion(lineas, /^## Las ocho dimensiones\s*$/)) {
    const m = /^- \*\*(.+?)\*\* — (.+)$/.exec(l.trim());
    if (m) frases.set(m[1], m[2].trim());
  }
  for (const a of areas) {
    for (const d of a.dimensiones) {
      const nombre = nombres.get(d.id.split(".")[1]);
      if (nombre) d.generica = { nombre, descripcion: frases.get(nombre) ?? null };
    }
  }
}

function leerRiesgos(lineas: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const celdas of filasDeTabla(seccion(lineas, /^## Riesgos\s*$/))) {
    const [ids, , mensaje] = celdas;
    if (!ids || !mensaje) continue;
    for (const m of ids.matchAll(/`([^`]+)`/g)) out[m[1]] = mensaje;
  }
  return out;
}

function leerGlosario(lineas: string[]): { termino: string; significado: string }[] {
  return filasDeTabla(seccion(lineas, /^## Glosario\s*$/))
    .filter((c) => c[0] && c[1])
    .map(([termino, significado]) => ({ termino, significado }));
}

function leerVerificacion(lineas: string[]): Partial<Record<Verificacion, string>> {
  const out: Partial<Record<Verificacion, string>> = {};
  for (const p of parrafos(seccion(lineas, /^## Cómo se verifica cada criterio\s*$/))) {
    const m = /^\*\*(\S+)\.\*\* (.+)$/.exec(p);
    if (!m) continue;
    const clave = sinTildes(m[1]).toLowerCase() as Verificacion;
    if ((VERIFICACIONES as readonly string[]).includes(clave)) out[clave] = m[2].trim();
  }
  return out;
}

function leerDependencias(lineas: string[]): Escala["dependencias"] {
  return filasDeTabla(seccion(lineas, /^## Qué se trabaja primero\s*$/))
    .filter((c) => c.length >= 4)
    .map(([capa, cuando, orden, porQue]) => ({
      capa,
      cuando,
      orden: orden.split("→").map((s) => s.trim()).filter(Boolean),
      porQue,
    }));
}

function leerHistorial(lineas: string[]): Escala["historial"] {
  const out: Escala["historial"] = [];
  for (const p of parrafos(seccion(lineas, /^## Historial de versiones\s*$/))) {
    const m = /^\*\*(\d+\.\d+\.\d+) \(([\d-]+)\)\.\*\* (.+)$/.exec(p);
    if (m) out.push({ version: m[1], fecha: m[2], texto: m[3].trim() });
  }
  return out;
}

/**
 * «Cómo se leen los criterios»: el párrafo de las palabras con valor fijo. Cada oración que trae
 * términos entre «» los define: «X» quiere decir …; «X» y «Y» quieren decir …; Y «X», … .
 */
function leerPalabrasConValorFijo(lineas: string[]): Escala["palabrasConValorFijo"] {
  const p = parrafos(seccion(lineas, /^## Cómo se leen los criterios\s*$/)).find((x) => x.includes("«"));
  if (!p) return [];
  const out: Escala["palabrasConValorFijo"] = [];
  for (const oracion of p.split(/(?<=\.)\s+/)) {
    const terminos = [...oracion.matchAll(/«([^»]+)»/g)].map((m) => m[1].trim());
    if (terminos.length === 0) continue;
    let significado: string | null = null;
    const m = /\bquieren? decir (.+?)\.?$/.exec(oracion);
    if (m) significado = m[1];
    else {
      const i = oracion.lastIndexOf("», ");
      if (i !== -1) significado = oracion.slice(i + 3).replace(/\.$/, "");
    }
    if (!significado) continue;
    for (const termino of terminos) out.push({ termino, significado: significado.trim() });
  }
  return out;
}

/** Una pregunta del perfil: `**Cómo se cierra la venta.** Con equipo, cuando …; transaccional, cuando …; o mixta, cuando …`. */
function leerPreguntaDelPerfil(parrafo: string | undefined): Escala["perfilDeNegocio"]["cierre"] {
  const m = parrafo ? /^\*\*(.+?)\.\*\* (.+)$/.exec(parrafo) : null;
  if (!m) return null;
  const opciones = m[2]
    .replace(/\.$/, "")
    .split(/;\s+/)
    .map((c) => c.replace(/^o\s+/, "").trim())
    .map((c) => {
      const i = c.indexOf(", ");
      return i === -1 ? null : { nombre: c.slice(0, i).trim(), definicion: c.slice(i + 2).trim() };
    })
    .filter((x): x is { nombre: string; definicion: string } => !!x);
  return opciones.length ? { pregunta: m[1].trim(), opciones } : null;
}

function leerPerfilDeNegocio(lineas: string[]): Escala["perfilDeNegocio"] {
  const ps = parrafos(seccion(lineas, /^## El perfil de negocio\s*$/));
  const introduccion = ps[0] && !ps[0].startsWith("**") ? ps[0] : null;
  const cierre = ps.find((p) => p.startsWith("**Cómo se cierra la venta.**"));
  const despues = ps.find((p) => p.startsWith("**Qué pasa después de la venta.**"));
  return {
    introduccion,
    cierre: leerPreguntaDelPerfil(cierre),
    despues: leerPreguntaDelPerfil(despues),
    notas: ps.filter((p) => p !== introduccion && p !== cierre && p !== despues),
  };
}

/**
 * «Cómo se leen los criterios», lo que no son las palabras con valor fijo: los casos que se leen
 * distinto, cada uno con su título en negrita («**Departamentos de una o dos personas.** …»).
 */
function leerCasosDeLectura(lineas: string[]): Escala["casosDeLectura"] {
  return bloquesDe(seccion(lineas, /^## Cómo se leen los criterios\s*$/)).filter((b) => b.texto.startsWith("**"));
}

/**
 * «Regla de asignación»: cada caso dudoso y a qué dimensiones toca. Toca a las que nombra por id
 * («Datos de Ventas (1.3)», «(1.2, 2.2 o 3.2)») y, además, a las de base que nombra en negrita por
 * su nombre genérico («**Equipo y Gobierno**», «**Tecnología**»), en las tres áreas.
 */
function leerAsignacion(lineas: string[], areas: Area[]): Escala["asignacion"] {
  const bloque = seccion(lineas, /^## Regla de asignación\s*$/);
  const todas = areas.flatMap((a) => a.dimensiones);
  const ids = new Set(todas.map((d) => d.id));
  const out: Escala["asignacion"] = [];
  for (const l of bloque) {
    const m = /^- (.+)$/.exec(l.trim());
    if (!m) continue;
    const texto = m[1].trim();
    const dims = new Set<string>();
    for (const x of texto.matchAll(/\b(\d+\.\d+)\b/g)) if (ids.has(x[1])) dims.add(x[1]);
    // El nombre genérico vale en las áreas que la regla nombra; si no nombra ninguna, en las tres
    // («la frontera Marketing ↔ Ventas» no es de Servicio).
    const areasNombradas = new Set([...dims].map((id) => id.split(".")[0]));
    for (const negrita of texto.matchAll(/\*\*([^*]+)\*\*/g)) {
      const b = negrita[1].trim();
      for (const d of todas) {
        const g = d.generica?.nombre;
        const enArea = areasNombradas.size === 0 || areasNombradas.has(d.area);
        if (d.capa === "base" && g && enArea && (g === b || g.startsWith(`${b} `))) dims.add(d.id);
      }
    }
    out.push({ texto, dimensiones: [...dims].sort((a, b) => a.localeCompare(b, "es", { numeric: true })) });
  }
  return out;
}

// ── La entrada ────────────────────────────────────────────────────────────────

/**
 * Lee el documento entero. Lanza `ErrorDeFormato` si la matriz tiene algo que no entiende o si
 * falta lo que la escala no puede no tener (la versión, la tabla de niveles, la matriz).
 */
export function parsearEscala(texto: string): Escala {
  const todas = lineasDe(texto);
  // Las ediciones por industria van al final. La escala general es todo lo de antes: la matriz y la
  // prosa se leen solo de ahí (los números de línea no cambian: es el principio del documento).
  const corte = todas.findIndex((l) => ES_LA_PARTE_DE_EDICIONES.test(l));
  const lineas = corte === -1 ? todas : todas.slice(0, corte);
  const cabecera = leerEncabezado(texto);
  const version = cabecera.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new ErrorDeFormato("el encabezado no dice la versión (`version: 7.0.0`).");
  }
  const ctx = leerNiveles(lineas);
  const { areas, nombresDeCapa } = leerMatriz(lineas, ctx, version);
  const { ediciones, intro: edicionesIntro } = leerEdiciones(todas, areas, ctx);
  leerPanoramicas(lineas, areas, ctx);
  leerGenericas(lineas, areas);
  const evaluar = seccion(lineas, /^## Cómo se evalúa cada dimensión\s*$/);
  // Lo que va antes de la primera negrita («**Criterios de riesgo.**»): la regla de evaluación.
  const regla = parrafos(evaluar);
  const hastaNegrita = regla.findIndex((p) => p.startsWith("**"));
  const evaluacion = hastaNegrita === -1 ? regla : regla.slice(0, hastaNegrita);
  const perfil = parrafos(seccion(lineas, /^## El perfil de negocio\s*$/));
  const requeridos = parrafos(seccion(lineas, /^## Criterios requeridos\s*$/));

  return {
    version,
    fecha: cabecera.fecha ?? null,
    estado: cabecera.estado ?? null,
    niveles: ctx.niveles,
    capas: leerCapas(lineas, nombresDeCapa),
    areas,
    riesgos: leerRiesgos(lineas),
    glosario: leerGlosario(lineas),
    verificacion: leerVerificacion(lineas),
    explicaciones: {
      evaluacion: evaluacion.length ? evaluacion.join("\n\n") : null,
      riesgo: bloqueEnNegrita(evaluar, "Criterios de riesgo"),
      habito: bloqueEnNegrita(evaluar, "Niveles por confirmar"),
      perfil: perfil.length ? perfil.join("\n\n") : null,
      requeridos: requeridos.length ? requeridos.join("\n\n") : null,
    },
    dependencias: leerDependencias(lineas),
    historial: leerHistorial(lineas),
    palabrasConValorFijo: leerPalabrasConValorFijo(lineas),
    casosDeLectura: leerCasosDeLectura(lineas),
    perfilDeNegocio: leerPerfilDeNegocio(lineas),
    automatizacion: bloquesDe(seccion(lineas, /^## Regla de automatización\s*$/)),
    asignacion: leerAsignacion(lineas, areas),
    ediciones,
    edicionesIntro,
    edicion: null,
  };
}

/** Los identificadores retirados, leídos de la especificación del cálculo (no se escriben acá). */
export function leerRetirados(especificacion: string): string[] {
  const linea = lineasDe(especificacion).find((l) => /Identificadores retirados/.test(l));
  if (!linea) return [];
  return [...linea.matchAll(/`(\d+\.\d+\.[A-Z]\d+)`/g)].map((m) => m[1]);
}

// ── Recorridos ────────────────────────────────────────────────────────────────

/**
 * Todos los criterios, en el orden de la matriz. En la escala general son los de la matriz; en una
 * escala vista por una edición (`aplicarEdicion`), los que valen en esa edición.
 */
export function todosLosCriterios(escala: Pick<Escala, "areas">): Criterio[] {
  return escala.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios)));
}

/** Los criterios que solo existen en alguna edición, con la edición que los trae. */
export function criteriosPropios(escala: Pick<Escala, "ediciones">): { edicion: Edicion; criterio: Criterio }[] {
  return escala.ediciones.flatMap((edicion) =>
    edicion.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.propios.map((criterio) => ({ edicion, criterio })))),
  );
}

/** Todas las dimensiones, en el orden de la matriz. */
export function todasLasDimensiones(escala: Escala): Dimension[] {
  return escala.areas.flatMap((a) => a.dimensiones);
}

export function nombreDeNivel(escala: Pick<Escala, "niveles">, letra: Letra): string {
  return escala.niveles.find((n) => n.letra === letra)?.nombre ?? letra;
}
