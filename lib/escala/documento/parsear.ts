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
 *
 * La etiqueta de cada criterio se lee con la MISMA expresión que `docs/escala/pruebas_escala.py`.
 */
import {
  ErrorDeFormato,
  LETRAS,
  LETRAS_CON_RESULTADO,
  VERIFICACIONES,
  type Area,
  type CapaDeLaEscala,
  type ClaveDeCapa,
  type Criterio,
  type Dimension,
  type Escala,
  type Letra,
  type MarcaDePerfil,
  type Nivel,
  type NivelDeLaEscala,
  type Verificacion,
} from "./tipos";

/** La etiqueta de un criterio. Espejo exacto de `PAT` en `pruebas_escala.py`. */
export const ETIQUETA_DE_CRITERIO =
  /^- (.*) `\[(\d+\.\d+\.[DIFEO]\d+) · (\w+)((?: · riesgo)?)((?: · hábito)?)((?: · venta con equipo| · cliente recurrente| · relación continua)?)\]`$/;

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
function seccion(lineas: string[], encabezado: RegExp): string[] {
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
function parrafos(lineas: string[]): string[] {
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
      `la tabla «Niveles» de la Parte 4 tiene que traer los cinco niveles en orden (${LETRAS.join(", ")}); trae «${letras || "nada"}».`,
    );
  }
  return { niveles, nivelPorNombre: new Map(niveles.map((n) => [n.nombre, n])) };
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leerMatriz(lineas: string[], ctx: Contexto): { areas: Area[]; nombresDeCapa: string[] } {
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
            ? `la etiqueta de este criterio no sigue la forma «[id · verificación · riesgo · hábito · perfil]»: ${linea.slice(0, 120)}`
            : `un punto de la lista sin etiqueta: ${linea.slice(0, 120)}`,
          n,
        );
      }
      const [, texto, id, verif, riesgo, habito, perfil] = m;
      if (!(VERIFICACIONES as readonly string[]).includes(verif)) {
        throw new ErrorDeFormato(`«${verif}» no es una forma de verificación (${VERIFICACIONES.join(", ")}).`, n);
      }
      if (!id.startsWith(`${nivel.id}`) || !/^\d+$/.test(id.slice(nivel.id.length))) {
        throw new ErrorDeFormato(`el criterio ${id} está en ${nivel.id}.`, n);
      }
      const criterio: Criterio = {
        id,
        texto: texto.trim(),
        verificacion: verif as Verificacion,
        riesgo: !!riesgo,
        habito: !!habito,
        perfil: (perfil.replace(/^ · /, "") || null) as MarcaDePerfil | null,
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

// ── La entrada ────────────────────────────────────────────────────────────────

/**
 * Lee el documento entero. Lanza `ErrorDeFormato` si la matriz tiene algo que no entiende o si
 * falta lo que la escala no puede no tener (la versión, la tabla de niveles, la matriz).
 */
export function parsearEscala(texto: string): Escala {
  const lineas = lineasDe(texto);
  const cabecera = leerEncabezado(texto);
  const version = cabecera.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new ErrorDeFormato("el encabezado no dice la versión (`version: 7.0.0`).");
  }
  const ctx = leerNiveles(lineas);
  const { areas, nombresDeCapa } = leerMatriz(lineas, ctx);
  leerPanoramicas(lineas, areas, ctx);
  leerGenericas(lineas, areas);
  const evaluar = seccion(lineas, /^## Cómo se evalúa cada dimensión\s*$/);
  const perfil = parrafos(seccion(lineas, /^## El perfil de negocio\s*$/));

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
      riesgo: bloqueEnNegrita(evaluar, "Criterios de riesgo"),
      habito: bloqueEnNegrita(evaluar, "Niveles por confirmar"),
      perfil: perfil.length ? perfil.join("\n\n") : null,
    },
    dependencias: leerDependencias(lineas),
    historial: leerHistorial(lineas),
  };
}

/** Los identificadores retirados, leídos de la especificación del cálculo (no se escriben acá). */
export function leerRetirados(especificacion: string): string[] {
  const linea = lineasDe(especificacion).find((l) => /Identificadores retirados/.test(l));
  if (!linea) return [];
  return [...linea.matchAll(/`(\d+\.\d+\.[A-Z]\d+)`/g)].map((m) => m[1]);
}

// ── Recorridos ────────────────────────────────────────────────────────────────

/** Todos los criterios, en el orden de la matriz. */
export function todosLosCriterios(escala: Escala): Criterio[] {
  return escala.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios)));
}

/** Todas las dimensiones, en el orden de la matriz. */
export function todasLasDimensiones(escala: Escala): Dimension[] {
  return escala.areas.flatMap((a) => a.dimensiones);
}

export function nombreDeNivel(escala: Pick<Escala, "niveles">, letra: Letra): string {
  return escala.niveles.find((n) => n.letra === letra)?.nombre ?? letra;
}
