/**
 * lib/canvas/revisar-hilo.ts — lo que quedó SUELTO en el hilo del diagnóstico (2026-09-28).
 *
 * El diagnóstico une sus secciones con códigos: cada causa (F) explica síntomas (S), cada
 * consecuencia sale de causas, cada pregunta la responde un objetivo (OBJ). Una edición a mano o del
 * chat puede dejar un cabo suelto sin que nada lo note: borrar la F3 deja a una consecuencia citando
 * algo que ya no existe; agregar un S5 sin causa deja un síntoma sin explicar.
 *
 * Esto los encuentra. Puro: lo usan la pantalla (el aviso sobre el documento) y el chat (para que
 * sepa qué arreglar cuando se lo piden). NO corrige nada: decide la persona.
 */

export interface CaboSuelto {
  /** La sección donde se arregla. */
  seccion: "objetivos" | "problema" | "preguntas";
  texto: string;
}

type Datos = Record<string, unknown> | undefined;

const lista = (d: Datos, k: string): Array<Record<string, unknown>> => {
  const v = d?.[k];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>) : [];
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Normaliza un código para comparar: «obj-1», «OBJ 01» y «OBJ-01» son el mismo. */
export function normalizarCodigo(c: string): string {
  const m = /^\s*(OBJ|S|F)\s*-?\s*0*(\d+)\s*$/i.exec(c);
  return m ? `${m[1].toUpperCase()}${m[2]}` : c.trim().toUpperCase();
}

/** Los códigos citados en un texto como «S1, S3» o «OBJ-01 y OBJ-04». */
export function codigosCitados(texto: string, prefijo: "S" | "F" | "OBJ"): string[] {
  const re = prefijo === "OBJ" ? /\bOBJ\s*-?\s*\d+\b/gi : new RegExp(`\\b${prefijo}\\s*-?\\s*\\d+\\b`, "gi");
  return [...new Set((texto.match(re) ?? []).map(normalizarCodigo))];
}

export function revisarHilo(porKey: { objetivos?: Datos; problema?: Datos; preguntas?: Datos }): CaboSuelto[] {
  const cabos: CaboSuelto[] = [];
  const sintomas = lista(porKey.problema, "sintomas");
  const causas = lista(porKey.problema, "causas");
  const consecuencias = lista(porKey.problema, "consecuencias");
  const objetivos = lista(porKey.objetivos, "objetivos");
  const preguntas = lista(porKey.preguntas, "preguntas");

  const repetidos = (items: Array<Record<string, unknown>>, seccion: CaboSuelto["seccion"]) => {
    const vistos = new Map<string, number>();
    for (const it of items) {
      const c = str(it.id);
      if (c) vistos.set(normalizarCodigo(c), (vistos.get(normalizarCodigo(c)) ?? 0) + 1);
    }
    for (const [c, n] of vistos) if (n > 1) cabos.push({ seccion, texto: `El código ${c} está repetido ${n} veces.` });
  };
  repetidos(sintomas, "problema");
  repetidos(causas, "problema");
  repetidos(objetivos, "objetivos");

  const idsS = new Set(sintomas.map((s) => normalizarCodigo(str(s.id))).filter(Boolean));
  const idsF = new Set(causas.map((f) => normalizarCodigo(str(f.id))).filter(Boolean));
  const idsO = new Set(objetivos.map((o) => normalizarCodigo(str(o.id))).filter(Boolean));
  const nombre = (it: Record<string, unknown>) => str(it.id) || `«${str(it.titulo) || str(it.pregunta) || "sin título"}»`;

  // Causas: cada una explica al menos un síntoma, y solo síntomas que existen.
  const sintomasExplicados = new Set<string>();
  for (const f of causas) {
    const citados = codigosCitados(str(f.explica), "S");
    if (!citados.length) cabos.push({ seccion: "problema", texto: `La causa ${nombre(f)} no dice qué síntoma explica.` });
    for (const s of citados) {
      if (idsS.has(s)) sintomasExplicados.add(s);
      else cabos.push({ seccion: "problema", texto: `La causa ${nombre(f)} cita ${s}, que no existe.` });
    }
  }
  for (const s of sintomas) {
    const id = normalizarCodigo(str(s.id));
    if (id && !sintomasExplicados.has(id)) cabos.push({ seccion: "problema", texto: `El síntoma ${nombre(s)} no lo explica ninguna causa.` });
  }

  // Consecuencias: cada una sale de al menos una causa que existe.
  const causasConConsecuencia = new Set<string>();
  for (const k of consecuencias) {
    const citadas = codigosCitados(str(k.por), "F");
    if (!citadas.length) cabos.push({ seccion: "problema", texto: `La consecuencia ${nombre(k)} no dice de qué causa sale.` });
    for (const f of citadas) {
      if (idsF.has(f)) causasConConsecuencia.add(f);
      else cabos.push({ seccion: "problema", texto: `La consecuencia ${nombre(k)} cita ${f}, que no existe.` });
    }
  }

  // Preguntas: cada una apunta a objetivos que existen; y cada objetivo tiene alguna pregunta.
  const objetivosConPregunta = new Set<string>();
  for (const p of preguntas) {
    const citados = codigosCitados(str(p.objetivos), "OBJ");
    if (!citados.length) cabos.push({ seccion: "preguntas", texto: `La pregunta ${nombre(p)} no dice qué objetivo la responde.` });
    for (const o of citados) {
      if (idsO.has(o)) objetivosConPregunta.add(o);
      else cabos.push({ seccion: "preguntas", texto: `La pregunta ${nombre(p)} cita ${o}, que no existe.` });
    }
  }
  if (preguntas.length) {
    for (const o of objetivos) {
      const id = normalizarCodigo(str(o.id));
      if (id && !objetivosConPregunta.has(id)) cabos.push({ seccion: "objetivos", texto: `El objetivo ${nombre(o)} no tiene ninguna pregunta de negocio.` });
    }
  }
  return cabos;
}

/** El resumen para el chat: una línea por cabo, o "" si el hilo está completo. */
export function cabosParaElChat(cabos: readonly CaboSuelto[]): string {
  if (!cabos.length) return "";
  return `HILO DEL DIAGNÓSTICO — ${cabos.length} ${cabos.length === 1 ? "cabo suelto" : "cabos sueltos"} (no los arregles si no te lo piden; si te lo piden, mantén los códigos coherentes):\n${cabos.map((c) => `- ${c.texto}`).join("\n")}`;
}
