/**
 * lib/canvas/revisar-hilo.ts — lo que quedó SUELTO en el hilo del diagnóstico (2026-09-28; las
 * acciones, 2026-10-02).
 *
 * El diagnóstico une sus secciones con códigos: cada causa (F) explica síntomas (S), cada
 * consecuencia sale de causas, cada ACCIÓN (AC) ataca causas y mueve objetivos (OBJ), cada pregunta
 * la responde un objetivo. Una edición a mano o del chat puede dejar un cabo suelto sin que nada lo
 * note: borrar la F3 deja a una acción atacando algo que ya no existe; agregar una causa sin acción
 * deja un problema sin resolver.
 *
 * Esto los encuentra, en dos pesos:
 *   · `bloquea: true` — el hilo está roto: no se presenta así (lo pidió Elías, 2026-10-02: «revisa
 *     que no haya acciones sin problema ni objetivo, ni problemas sin acción»). Lo hace cumplir el
 *     botón «Presentar» (lib/canvas/estado-del-documento.ts) en el servidor.
 *   · `bloquea: false` — un aviso: algo que conviene mirar pero no rompe el hilo (un objetivo que
 *     ninguna acción mueve, una acción «dentro» que no aparece en el alcance).
 *
 * Puro: lo usan la pantalla (el aviso sobre el documento), el chat (para que sepa qué arreglar
 * cuando se lo piden) y la presentación. NO corrige nada: decide la persona.
 */

export type SeccionDelHilo =
  | "objetivos"
  | "problema"
  | "preguntas"
  | "acciones"
  | "herramientas"
  | "alcance_acordado";

export interface CaboSuelto {
  /** La sección donde se arregla. */
  seccion: SeccionDelHilo;
  texto: string;
  /** true = impide presentar el diagnóstico; false = aviso. */
  bloquea: boolean;
}

type Datos = Record<string, unknown> | undefined;

const lista = (d: Datos, k: string): Array<Record<string, unknown>> => {
  const v = d?.[k];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>) : [];
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Prefijo = "S" | "F" | "OBJ" | "AC";

/** Normaliza un código para comparar: «obj-1», «OBJ 01» y «OBJ-01» son el mismo; «AC-01» y «ac1» también. */
export function normalizarCodigo(c: string): string {
  const m = /^\s*(OBJ|AC|S|F)\s*-?\s*0*(\d+)\s*$/i.exec(c);
  return m ? `${m[1].toUpperCase()}${m[2]}` : c.trim().toUpperCase();
}

/** Los códigos citados en un texto como «S1, S3», «OBJ-01 y OBJ-04» o «AC-02». */
export function codigosCitados(texto: string, prefijo: Prefijo): string[] {
  const re =
    prefijo === "OBJ"
      ? /\bOBJ\s*-?\s*\d+\b/gi
      : prefijo === "AC"
        ? /\bAC\s*-?\s*\d+\b/gi
        : new RegExp(`\\b${prefijo}\\s*-?\\s*\\d+\\b`, "gi");
  return [...new Set((texto.match(re) ?? []).map(normalizarCodigo))];
}

/** Las secciones que se revisan, por su key en el documento. */
export interface SeccionesDelHilo {
  objetivos?: Datos;
  problema?: Datos;
  preguntas?: Datos;
  acciones?: Datos;
  herramientas?: Datos;
  alcance_acordado?: Datos;
}

/** Las keys que `revisarHilo` lee — para armar `SeccionesDelHilo` desde las filas de un documento. */
export const SECCIONES_DEL_HILO: readonly SeccionDelHilo[] = [
  "objetivos",
  "problema",
  "preguntas",
  "acciones",
  "herramientas",
  "alcance_acordado",
];

/** Arma las secciones del hilo con un lector de `data` por key (la pantalla, el chat y el servidor
 *  leen los bloques distinto; esto evita que cada uno arme su propia lista y se olvide de una). */
export function seccionesDelHilo(dataDe: (key: SeccionDelHilo) => Datos): SeccionesDelHilo {
  return Object.fromEntries(SECCIONES_DEL_HILO.map((k) => [k, dataDe(k)])) as SeccionesDelHilo;
}

export function revisarHilo(porKey: SeccionesDelHilo): CaboSuelto[] {
  const cabos: CaboSuelto[] = [];
  const roto = (seccion: SeccionDelHilo, texto: string) => cabos.push({ seccion, texto, bloquea: true });
  const aviso = (seccion: SeccionDelHilo, texto: string) => cabos.push({ seccion, texto, bloquea: false });

  const sintomas = lista(porKey.problema, "sintomas");
  const causas = lista(porKey.problema, "causas");
  const consecuencias = lista(porKey.problema, "consecuencias");
  const objetivos = lista(porKey.objetivos, "objetivos");
  const preguntas = lista(porKey.preguntas, "preguntas");
  const acciones = lista(porKey.acciones, "acciones");
  const herramientas = lista(porKey.herramientas, "herramientas");
  const grupos = lista(porKey.alcance_acordado, "grupos");
  const fuera = lista(porKey.alcance_acordado, "fuera");

  const repetidos = (items: Array<Record<string, unknown>>, seccion: SeccionDelHilo) => {
    const vistos = new Map<string, number>();
    for (const it of items) {
      const c = str(it.id);
      if (c) vistos.set(normalizarCodigo(c), (vistos.get(normalizarCodigo(c)) ?? 0) + 1);
    }
    for (const [c, n] of vistos) if (n > 1) roto(seccion, `El código ${c} está repetido ${n} veces.`);
  };
  repetidos(sintomas, "problema");
  repetidos(causas, "problema");
  repetidos(objetivos, "objetivos");
  repetidos(acciones, "acciones");

  const idsS = new Set(sintomas.map((s) => normalizarCodigo(str(s.id))).filter(Boolean));
  const idsF = new Set(causas.map((f) => normalizarCodigo(str(f.id))).filter(Boolean));
  const idsO = new Set(objetivos.map((o) => normalizarCodigo(str(o.id))).filter(Boolean));
  const idsAC = new Set(acciones.map((a) => normalizarCodigo(str(a.id))).filter(Boolean));
  const nombre = (it: Record<string, unknown>) =>
    str(it.id) || `«${str(it.titulo) || str(it.accion) || str(it.pregunta) || str(it.herramienta) || "sin título"}»`;

  // Causas: cada una explica al menos un síntoma, y solo síntomas que existen.
  const sintomasExplicados = new Set<string>();
  for (const f of causas) {
    const citados = codigosCitados(str(f.explica), "S");
    if (!citados.length) roto("problema", `La causa ${nombre(f)} no dice qué síntoma explica.`);
    for (const s of citados) {
      if (idsS.has(s)) sintomasExplicados.add(s);
      else roto("problema", `La causa ${nombre(f)} cita ${s}, que no existe.`);
    }
  }
  for (const s of sintomas) {
    const id = normalizarCodigo(str(s.id));
    if (id && !sintomasExplicados.has(id)) roto("problema", `El síntoma ${nombre(s)} no lo explica ninguna causa.`);
  }

  // Consecuencias: cada una sale de al menos una causa que existe.
  for (const k of consecuencias) {
    const citadas = codigosCitados(str(k.por), "F");
    if (!citadas.length) roto("problema", `La consecuencia ${nombre(k)} no dice de qué causa sale.`);
    for (const f of citadas) {
      if (!idsF.has(f)) roto("problema", `La consecuencia ${nombre(k)} cita ${f}, que no existe.`);
    }
  }

  // Acciones: cada una ataca causas que existen y mueve objetivos que existen…
  const causasAtacadas = new Set<string>();
  const objetivosMovidos = new Set<string>();
  for (const a of acciones) {
    const atacadas = codigosCitados(str(a.ataca), "F");
    if (!atacadas.length) roto("acciones", `La acción ${nombre(a)} no dice qué causa ataca.`);
    for (const f of atacadas) {
      if (idsF.has(f)) causasAtacadas.add(f);
      else roto("acciones", `La acción ${nombre(a)} ataca ${f}, que no existe.`);
    }
    const movidos = codigosCitados(str(a.mueve), "OBJ");
    if (!movidos.length) roto("acciones", `La acción ${nombre(a)} no dice qué objetivo mueve.`);
    for (const o of movidos) {
      if (idsO.has(o)) objetivosMovidos.add(o);
      else roto("acciones", `La acción ${nombre(a)} mueve ${o}, que no existe.`);
    }
  }
  // …y toda causa tiene al menos una acción: un problema sin acción es un problema sin resolver.
  for (const f of causas) {
    const id = normalizarCodigo(str(f.id));
    if (id && !causasAtacadas.has(id)) roto("acciones", `La causa ${nombre(f)} no tiene ninguna acción que la ataque.`);
  }
  if (acciones.length) {
    for (const o of objetivos) {
      const id = normalizarCodigo(str(o.id));
      if (id && !objetivosMovidos.has(id)) aviso("objetivos", `El objetivo ${nombre(o)} no lo mueve ninguna acción.`);
    }
  }

  // Preguntas: cada una apunta a objetivos que existen; y cada objetivo tiene alguna pregunta.
  const objetivosConPregunta = new Set<string>();
  for (const p of preguntas) {
    const citados = codigosCitados(str(p.objetivos), "OBJ");
    if (!citados.length) roto("preguntas", `La pregunta ${nombre(p)} no dice qué objetivo la responde.`);
    for (const o of citados) {
      if (idsO.has(o)) objetivosConPregunta.add(o);
      else roto("preguntas", `La pregunta ${nombre(p)} cita ${o}, que no existe.`);
    }
  }
  if (preguntas.length) {
    for (const o of objetivos) {
      const id = normalizarCodigo(str(o.id));
      if (id && !objetivosConPregunta.has(id)) aviso("objetivos", `El objetivo ${nombre(o)} no tiene ninguna pregunta de negocio.`);
    }
  }

  // Herramientas: solo citan acciones que existen.
  for (const h of herramientas) {
    for (const ac of codigosCitados(str(h.acciones), "AC")) {
      if (!idsAC.has(ac)) aviso("herramientas", `La herramienta ${nombre(h)} cita ${ac}, que no existe.`);
    }
  }

  // Alcance: toda acción «dentro» aparece en algún ítem incluido, y lo citado existe.
  if (grupos.length || fuera.length) {
    const enAlcance = new Set<string>();
    const items = [...grupos.flatMap((g) => lista(g, "items")), ...fuera];
    for (const it of items) {
      for (const ac of codigosCitados(str(it.acciones), "AC")) {
        if (idsAC.has(ac)) enAlcance.add(ac);
        else aviso("alcance_acordado", `El alcance cita ${ac}, que no existe.`);
      }
    }
    for (const a of acciones) {
      const id = normalizarCodigo(str(a.id));
      const esFuera = /fuera/i.test(str(a.alcance));
      if (id && !esFuera && !enAlcance.has(id)) aviso("alcance_acordado", `La acción ${nombre(a)} está dentro del alcance pero no aparece en «Alcance acordado».`);
    }
  }
  return cabos;
}

/** ¿El hilo está cerrado? (Ningún cabo que bloquee.) */
export function hiloCerrado(cabos: readonly CaboSuelto[]): boolean {
  return !cabos.some((c) => c.bloquea);
}

/** El resumen para el chat: una línea por cabo, o "" si el hilo está completo. */
export function cabosParaElChat(cabos: readonly CaboSuelto[]): string {
  if (!cabos.length) return "";
  const rotos = cabos.filter((c) => c.bloquea).length;
  return (
    `HILO DEL DIAGNÓSTICO — ${cabos.length} ${cabos.length === 1 ? "cabo suelto" : "cabos sueltos"}` +
    `${rotos ? ` (${rotos} impiden presentarlo)` : ""} (no los arregles si no te lo piden; si te lo piden, mantén los códigos coherentes):\n` +
    cabos.map((c) => `- ${c.texto}${c.bloquea ? "" : " (aviso)"}`).join("\n")
  );
}
