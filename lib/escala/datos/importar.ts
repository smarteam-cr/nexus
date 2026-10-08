/**
 * lib/escala/datos/importar.ts — un `.md` de la escala → sus datos. PURO.
 *
 * Sirve para dos cosas: pasar a datos una versión que estaba escrita como archivo (la migración de
 * la 8.7.0) y entrar cambios en bloque a un borrador (se edita un `.md` exportado y se importa).
 *
 * ── LA GARANTÍA ──────────────────────────────────────────────────────────────
 * Al terminar, genera el `.md` desde los datos y lo compara con el que recibió. Si no es el mismo
 * texto, FRENA con la línea: algo del archivo no se pudo guardar como dato y se perdería en
 * silencio. Así importar y generar son inversos exactos.
 *
 * Lee la misma gramática que `lib/escala/documento/parsear.ts` (las etiquetas de los criterios, los
 * títulos de las áreas, dimensiones y ediciones), con la misma exigencia: lo que no entiende es un
 * error con su número de línea.
 */
import { ETIQUETA_DE_CRITERIO, lineasDe } from "@/lib/escala/documento/parsear";
import { ErrorDeFormato, LETRAS, VERIFICACIONES, type Letra, type MarcaDePerfil, type Verificacion } from "@/lib/escala/documento/tipos";
import { generarMarkdown, nombresDeLosNiveles } from "./generar";
import {
  FORMATO_DE_LOS_DATOS,
  type AreaDeLaEdicion,
  type AreaDeLaMatriz,
  type Bloque,
  type CampoDelEncabezado,
  type CriterioDeLaEscala,
  type DimensionDeLaEdicion,
  type DimensionDeLaMatriz,
  type EdicionDeLaEscala,
  type EscalaDatos,
  type NivelDeLaEdicion,
  type NivelDeLaMatriz,
  type Parte,
} from "./tipos";

/** Un bloque del archivo: líneas seguidas, sin líneas en blanco, con el número de su primera línea. */
interface BloqueCrudo {
  linea: number;
  lineas: string[];
}

const ETIQUETA_DE_REESCRITO = /^- (.*) `\[(\d+\.\d+\.[DIFEO]\d+)\]`$/;
const ES_LA_PARTE_DE_EDICIONES = /^Parte \d+ — Ediciones/;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Del texto a bloques ───────────────────────────────────────────────────────

function partirEnBloques(texto: string): { encabezado: CampoDelEncabezado[]; bloques: BloqueCrudo[] } {
  const lineas = lineasDe(texto);
  if (lineas[0] !== "---") throw new ErrorDeFormato("el documento tiene que empezar con su encabezado (`---`).", 1);
  const fin = lineas.indexOf("---", 1);
  if (fin === -1) throw new ErrorDeFormato("el encabezado no se cierra (`---`).", 1);
  const encabezado: CampoDelEncabezado[] = [];
  for (let i = 1; i < fin; i++) {
    const m = /^([\w-]+): (.*)$/.exec(lineas[i]);
    if (!m) throw new ErrorDeFormato(`el encabezado tiene una línea que no es «clave: valor»: ${lineas[i]}`, i + 1);
    encabezado.push({ clave: m[1], valor: m[2] });
  }
  const bloques: BloqueCrudo[] = [];
  let actual: BloqueCrudo | null = null;
  for (let i = fin + 1; i < lineas.length; i++) {
    if (lineas[i] === "") {
      actual = null;
      continue;
    }
    if (!actual) {
      actual = { linea: i + 1, lineas: [] };
      bloques.push(actual);
    }
    actual.lineas.push(lineas[i]);
  }
  return { encabezado, bloques };
}

function filaDeTabla(linea: string, n: number): string[] {
  if (!linea.startsWith("| ") || !linea.endsWith(" |")) throw new ErrorDeFormato(`una fila de tabla va como «| a | b |»: ${linea.slice(0, 80)}`, n);
  return linea.slice(2, -2).split(" | ");
}

/** Un bloque crudo como bloque de prosa. */
function bloqueDeProsa(b: BloqueCrudo): Bloque {
  const [primera] = b.lineas;
  const sola = b.lineas.length === 1;
  const titulo = /^(#{1,4}) (.+)$/.exec(primera);
  if (sola && titulo) return { tipo: "titulo", nivel: titulo[1].length as 1 | 2 | 3 | 4, texto: titulo[2] };
  if (sola && primera === "---") return { tipo: "separador" };
  if (b.lineas.every((l) => l.startsWith("- "))) return { tipo: "lista", items: b.lineas.map((l) => l.slice(2)) };
  if (b.lineas.every((l, i) => l.startsWith(`${i + 1}. `))) {
    return { tipo: "numerada", items: b.lineas.map((l, i) => l.slice(`${i + 1}. `.length)) };
  }
  if (b.lineas.every((l) => l.startsWith("|"))) {
    if (b.lineas.length < 2) throw new ErrorDeFormato("una tabla necesita al menos su encabezado y su separador.", b.linea);
    const alineacion = /^\|((?::?-+:?\|)+)$/.exec(b.lineas[1]);
    if (!alineacion) throw new ErrorDeFormato(`la segunda fila de una tabla es la de separadores («|:--|:--|»): ${b.lineas[1]}`, b.linea + 1);
    return {
      tipo: "tabla",
      columnas: filaDeTabla(b.lineas[0], b.linea),
      alineacion: alineacion[1].slice(0, -1).split("|"),
      filas: b.lineas.slice(2).map((l, i) => filaDeTabla(l, b.linea + 2 + i)),
    };
  }
  if (sola) return { tipo: "parrafo", texto: primera };
  throw new ErrorDeFormato(`este bloque no es un párrafo, una lista ni una tabla (¿falta una línea en blanco?): ${primera.slice(0, 80)}`, b.linea);
}

// ── Los criterios ─────────────────────────────────────────────────────────────

function criterioDeLaLinea(linea: string, n: number): CriterioDeLaEscala | null {
  const m = ETIQUETA_DE_CRITERIO.exec(linea);
  if (!m) return null;
  const [, texto, id, verif, riesgo, habito, perfil, requiere] = m;
  if (!(VERIFICACIONES as readonly string[]).includes(verif)) {
    throw new ErrorDeFormato(`«${verif}» no es una forma de verificación (${VERIFICACIONES.join(", ")}).`, n);
  }
  return {
    id,
    texto,
    verificacion: verif as Verificacion,
    riesgo: !!riesgo,
    habito: !!habito,
    perfil: (perfil.replace(/^ · /, "") || null) as MarcaDePerfil | null,
    requiere: [...requiere.matchAll(/\d+\.\d+\.[DIFEO]\d+/g)].map((x) => x[0]),
  };
}

function idsDeLaLinea(texto: string): string[] {
  return [...texto.matchAll(/`(\d+\.\d+\.[DIFEO]\d+)`/g)].map((x) => x[1]);
}

// ── La matriz ─────────────────────────────────────────────────────────────────

function leerMatriz(bloques: BloqueCrudo[], nivelDeLaLinea: (t: string) => { letra: Letra; frase: string | null } | null): AreaDeLaMatriz[] {
  const areas: AreaDeLaMatriz[] = [];
  let area: AreaDeLaMatriz | null = null;
  let dim: DimensionDeLaMatriz | null = null;
  let nivel: NivelDeLaMatriz | null = null;

  for (const b of bloques) {
    const n = b.linea;
    const t = b.lineas[0];
    const solo = b.lineas.length === 1;
    let m: RegExpExecArray | null;

    if (solo && (m = /^## Área (\d+) — (.+)$/.exec(t))) {
      area = { id: m[1], nombre: m[2], descripcion: "", capas: [], separadorAlFinal: false };
      areas.push(area);
      dim = null;
      nivel = null;
      continue;
    }
    if (!area) throw new ErrorDeFormato(`la matriz empieza con «## Área 1 — …»: ${t.slice(0, 80)}`, n);
    if (area.separadorAlFinal) throw new ErrorDeFormato("después del `---` de un área va la siguiente área.", n);

    if (solo && t === "---") {
      area.separadorAlFinal = true;
      continue;
    }
    if (solo && (m = /^### (.+)$/.exec(t))) {
      area.capas.push({ nombre: m[1], dimensiones: [] });
      dim = null;
      nivel = null;
      continue;
    }
    if (solo && (m = /^#### (\d+\.\d+) (.+)$/.exec(t))) {
      const capa = area.capas.at(-1);
      if (!capa) throw new ErrorDeFormato(`la dimensión ${m[1]} está fuera de una capa.`, n);
      dim = { id: m[1], nombre: m[2], pregunta: "", descripcion: null, costoDeQuedarse: "", niveles: [] };
      capa.dimensiones.push(dim);
      nivel = null;
      continue;
    }
    if (!dim) {
      if (solo && !area.descripcion && !area.capas.length && !/^[#*|-]/.test(t)) {
        area.descripcion = t;
        continue;
      }
      throw new ErrorDeFormato(`no sé qué es esta línea del área ${area.id}: ${t.slice(0, 80)}`, n);
    }

    if (solo && (m = /^\*Descripción:\* (.+)$/.exec(t))) {
      if (nivel || dim.descripcion !== null) throw new ErrorDeFormato(`la descripción de ${dim.id} está fuera de lugar.`, n);
      dim.descripcion = m[1];
      continue;
    }
    if (solo && (m = /^\*Costo de quedarse:\* (.+)$/.exec(t))) {
      if (nivel || dim.costoDeQuedarse) throw new ErrorDeFormato(`el costo de quedarse de ${dim.id} está fuera de lugar.`, n);
      dim.costoDeQuedarse = m[1];
      continue;
    }
    const encabezado = solo ? nivelDeLaLinea(t) : null;
    if (encabezado) {
      if (encabezado.frase === null) throw new ErrorDeFormato(`el nivel de ${dim.id} no tiene su frase.`, n);
      nivel = { letra: encabezado.letra, frase: encabezado.frase, resultado: null, criterios: [] };
      dim.niveles.push(nivel);
      continue;
    }
    if (solo && (m = /^\*Resultado:\* (.+)$/.exec(t))) {
      if (!nivel || nivel.resultado !== null || nivel.criterios.length) throw new ErrorDeFormato(`«Resultado» fuera de lugar en ${dim.id}.`, n);
      nivel.resultado = m[1];
      continue;
    }
    if (b.lineas.every((l) => l.startsWith("- "))) {
      if (!nivel || nivel.criterios.length) throw new ErrorDeFormato(`los criterios de ${dim.id} van en una sola lista, debajo de su nivel.`, n);
      nivel.criterios = b.lineas.map((l, i) => {
        const c = criterioDeLaLinea(l, n + i);
        if (!c) throw new ErrorDeFormato(`la etiqueta de este criterio no sigue la forma «[id · verificación · …]»: ${l.slice(0, 100)}`, n + i);
        return c;
      });
      continue;
    }
    if (solo && !dim.pregunta && dim.descripcion === null && !dim.costoDeQuedarse && !dim.niveles.length && !/^[#*|]/.test(t)) {
      dim.pregunta = t;
      continue;
    }
    throw new ErrorDeFormato(`no sé qué es esta línea de ${dim.id}: ${t.slice(0, 80)}`, n);
  }
  return areas;
}

// ── Las ediciones ─────────────────────────────────────────────────────────────

function leerEdiciones(bloques: BloqueCrudo[], nivelDeLaLinea: (t: string) => { letra: Letra; frase: string | null } | null): EdicionDeLaEscala[] {
  const ediciones: EdicionDeLaEscala[] = [];
  let ed: EdicionDeLaEscala | null = null;
  let area: AreaDeLaEdicion | null = null;
  let dim: DimensionDeLaEdicion | null = null;
  let nivel: NivelDeLaEdicion | null = null;
  let esperaPalabras = false;

  for (const b of bloques) {
    const n = b.linea;
    const t = b.lineas[0];
    const solo = b.lineas.length === 1;
    let m: RegExpExecArray | null;

    if (solo && (m = /^## Edición — (.+)$/.exec(t))) {
      ed = { nombre: m[1], descripcion: null, clave: "", perfilHabitual: null, criteriosPropios: null, palabras: null, areas: [] };
      ediciones.push(ed);
      area = null;
      dim = null;
      nivel = null;
      esperaPalabras = false;
      continue;
    }
    if (!ed) throw new ErrorDeFormato(`las ediciones empiezan con «## Edición — Nombre»: ${t.slice(0, 80)}`, n);

    if (esperaPalabras) {
      const tabla = bloqueDeProsa(b);
      if (tabla.tipo !== "tabla" || tabla.columnas.length !== 2) throw new ErrorDeFormato("«Palabras de esta edición» es una tabla de dos columnas.", n);
      ed.palabras = {
        columnas: tabla.columnas,
        alineacion: tabla.alineacion,
        filas: tabla.filas.map((f) => {
          if (f.length !== 2) throw new ErrorDeFormato("cada fila de «Palabras de esta edición» tiene dos columnas.", n);
          return { general: f[0], edicion: f[1] };
        }),
      };
      esperaPalabras = false;
      continue;
    }
    if (solo && t === "### Palabras de esta edición") {
      if (area || ed.palabras) throw new ErrorDeFormato("«Palabras de esta edición» va una vez, antes de las áreas.", n);
      esperaPalabras = true;
      continue;
    }
    if (solo && (m = /^### Área (\d+) — (.+)$/.exec(t))) {
      area = { id: m[1], nombre: m[2], descripcion: null, panoramica: [], dimensiones: [] };
      ed.areas.push(area);
      dim = null;
      nivel = null;
      continue;
    }
    if (solo && (m = /^#### (\d+\.\d+) (.+)$/.exec(t))) {
      if (!area) throw new ErrorDeFormato(`la dimensión ${m[1]} está fuera de un área.`, n);
      dim = { id: m[1], nombre: m[2], pregunta: null, descripcion: null, costoDeQuedarse: null, niveles: [], noAplican: [], seLeenIgual: [] };
      area.dimensiones.push(dim);
      nivel = null;
      continue;
    }

    if (!area) {
      // El encabezado de la edición: para quién es, su clave, su perfil habitual y su bloque.
      if (solo && (m = /^\*Clave:\* (.+)$/.exec(t))) {
        if (ed.clave || ed.perfilHabitual !== null || ed.criteriosPropios !== null) throw new ErrorDeFormato("«Clave» va una vez, antes del perfil habitual.", n);
        ed.clave = m[1];
        continue;
      }
      if (solo && (m = /^\*Perfil habitual:\* (.+)$/.exec(t))) {
        if (!ed.clave || ed.perfilHabitual !== null || ed.criteriosPropios !== null) throw new ErrorDeFormato("«Perfil habitual» va una vez, después de la clave.", n);
        ed.perfilHabitual = m[1];
        continue;
      }
      if (solo && (m = /^\*Criterios propios:\* (.+)$/.exec(t))) {
        if (!ed.clave || ed.criteriosPropios !== null) throw new ErrorDeFormato("«Criterios propios» va una vez, después de la clave.", n);
        ed.criteriosPropios = m[1];
        continue;
      }
      if (solo && ed.descripcion === null && !ed.clave && !/^[#*|-]/.test(t)) {
        ed.descripcion = t;
        continue;
      }
      throw new ErrorDeFormato(`no sé qué es esta línea de la edición «${ed.nombre}»: ${t.slice(0, 80)}`, n);
    }

    const encabezado = solo ? nivelDeLaLinea(t) : null;
    if (!dim) {
      if (encabezado) {
        if (encabezado.frase === null) throw new ErrorDeFormato(`el vistazo del área ${area.id} no dice nada.`, n);
        area.panoramica.push({ letra: encabezado.letra, texto: encabezado.frase });
        continue;
      }
      if (solo && area.descripcion === null && !area.panoramica.length && !/^[#*|-]/.test(t)) {
        area.descripcion = t;
        continue;
      }
      throw new ErrorDeFormato(`no sé qué es esta línea del área ${area.id} de «${ed.nombre}»: ${t.slice(0, 80)}`, n);
    }

    const cerrada = dim.noAplican.length > 0 || dim.seLeenIgual.length > 0;
    if (solo && (m = /^\*No aplican:\* (.+)$/.exec(t))) {
      if (cerrada) throw new ErrorDeFormato(`«No aplican» va una vez, antes de «Se leen igual», en ${dim.id}.`, n);
      dim.noAplican = idsDeLaLinea(m[1]);
      continue;
    }
    if (solo && (m = /^\*Se leen igual:\* (.+)$/.exec(t))) {
      if (dim.seLeenIgual.length) throw new ErrorDeFormato(`«Se leen igual» va una vez en ${dim.id}.`, n);
      dim.seLeenIgual = idsDeLaLinea(m[1]);
      continue;
    }
    if (cerrada) throw new ErrorDeFormato(`«No aplican» y «Se leen igual» cierran la dimensión ${dim.id}.`, n);

    if (solo && (m = /^\*Descripción:\* (.+)$/.exec(t))) {
      if (nivel || dim.descripcion !== null || dim.costoDeQuedarse !== null) throw new ErrorDeFormato(`la descripción de ${dim.id} está fuera de lugar.`, n);
      dim.descripcion = m[1];
      continue;
    }
    if (solo && (m = /^\*Costo de quedarse:\* (.+)$/.exec(t))) {
      if (nivel || dim.costoDeQuedarse !== null) throw new ErrorDeFormato(`el costo de quedarse de ${dim.id} está fuera de lugar.`, n);
      dim.costoDeQuedarse = m[1];
      continue;
    }
    if (encabezado) {
      nivel = { letra: encabezado.letra, frase: encabezado.frase, resultado: null, criterios: [] };
      dim.niveles.push(nivel);
      continue;
    }
    if (solo && (m = /^\*Resultado:\* (.+)$/.exec(t))) {
      if (!nivel || nivel.resultado !== null || nivel.criterios.length) throw new ErrorDeFormato(`«Resultado» fuera de lugar en ${dim.id}.`, n);
      nivel.resultado = m[1];
      continue;
    }
    if (b.lineas.every((l) => l.startsWith("- "))) {
      if (!nivel || nivel.criterios.length) throw new ErrorDeFormato(`los criterios de ${dim.id} van en una sola lista, debajo de su nivel.`, n);
      nivel.criterios = b.lineas.map((l, i) => {
        const propio = criterioDeLaLinea(l, n + i);
        if (propio) return { tipo: "propio" as const, ...propio };
        const r = ETIQUETA_DE_REESCRITO.exec(l);
        if (r) return { tipo: "reescrito" as const, id: r[2], texto: r[1] };
        throw new ErrorDeFormato(`la etiqueta de este criterio no es «[id]» (reescrito) ni «[id · verificación · …]» (propio): ${l.slice(0, 100)}`, n + i);
      });
      continue;
    }
    if (solo && dim.pregunta === null && dim.descripcion === null && dim.costoDeQuedarse === null && !dim.niveles.length && !/^[#*|]/.test(t)) {
      dim.pregunta = t;
      continue;
    }
    throw new ErrorDeFormato(`no sé qué es esta línea de ${dim.id} en «${ed.nombre}»: ${t.slice(0, 80)}`, n);
  }
  return ediciones;
}

// ── La entrada ────────────────────────────────────────────────────────────────

/** La primera línea en que dos textos difieren (desde 1), o null si son iguales. */
export function primeraDiferencia(a: string, b: string): { linea: number; esperada: string; generada: string } | null {
  if (a === b) return null;
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { linea: i + 1, esperada: la[i] ?? "(fin del texto)", generada: lb[i] ?? "(fin del texto)" };
  }
  return { linea: la.length, esperada: "(fin del texto)", generada: "(fin del texto)" };
}

/**
 * El `.md` de la escala → sus datos. Lanza `ErrorDeFormato` (con la línea) si el archivo trae algo
 * que no se entiende o que no se puede guardar como dato sin cambiar el texto.
 */
export function importarEscala(texto: string): EscalaDatos {
  const normal = texto.replace(/\r\n?/g, "\n");
  const { encabezado, bloques } = partirEnBloques(normal);
  if (!encabezado.some((c) => c.clave === "version")) throw new ErrorDeFormato("el encabezado no dice la versión (`version: 8.7.0`).", 1);

  // Las partes empiezan con un título de nivel 1.
  const crudas: BloqueCrudo[][] = [];
  for (const b of bloques) {
    if (b.lineas.length === 1 && /^# /.test(b.lineas[0])) crudas.push([b]);
    else if (!crudas.length) throw new ErrorDeFormato("después del encabezado va el título de la primera parte («# …»).", b.linea);
    else crudas.at(-1)!.push(b);
  }

  // Los nombres de los niveles salen de la tabla «Niveles» de la referencia: con ellos se leen las
  // frases de nivel («**Funcional.** …»), en la matriz y en las ediciones.
  const nombres = nombresDeLosNiveles({ partes: crudas.map((bs) => ({ tipo: "prosa" as const, bloques: bs.map(bloqueDeProsa) })) });
  if (LETRAS.some((l) => !nombres.has(l))) throw new ErrorDeFormato("la tabla «Niveles» de la referencia tiene que traer los cinco niveles.");
  const encabezadoDeNivel = new RegExp(`^\\*\\*(${[...nombres.values()].map(escaparRegex).join("|")})\\.\\*\\*(?: (.+))?$`);
  const letraDe = new Map([...nombres].map(([letra, nombre]) => [nombre, letra]));
  const nivelDeLaLinea = (t: string) => {
    const m = encabezadoDeNivel.exec(t);
    return m ? { letra: letraDe.get(m[1])!, frase: m[2] ?? null } : null;
  };

  const partes: Parte[] = crudas.map((bs) => {
    const titulo = bs[0].lineas[0].slice(2);
    if (ES_LA_PARTE_DE_EDICIONES.test(titulo)) {
      const i = bs.findIndex((b) => b.lineas.length === 1 && /^## Edición — /.test(b.lineas[0]));
      const corte = i === -1 ? bs.length : i;
      return { tipo: "ediciones", bloques: bs.slice(0, corte).map(bloqueDeProsa), ediciones: leerEdiciones(bs.slice(corte), nivelDeLaLinea) };
    }
    const i = bs.findIndex((b) => b.lineas.length === 1 && /^## Área \d+ — /.test(b.lineas[0]));
    if (i !== -1) return { tipo: "matriz", bloques: bs.slice(0, i).map(bloqueDeProsa), areas: leerMatriz(bs.slice(i), nivelDeLaLinea) };
    return { tipo: "prosa", bloques: bs.map(bloqueDeProsa) };
  });

  const datos: EscalaDatos = { formato: FORMATO_DE_LOS_DATOS, encabezado, partes };
  // La garantía: ida y vuelta, el mismo texto.
  const esperado = normal.endsWith("\n") ? normal : `${normal}\n`;
  const d = primeraDiferencia(esperado, generarMarkdown(datos));
  if (d) {
    throw new ErrorDeFormato(
      `esta línea no se puede guardar como dato sin cambiarla. Dice «${d.esperada.slice(0, 100)}» y se generaría «${d.generada.slice(0, 100)}».`,
      d.linea,
    );
  }
  return datos;
}
