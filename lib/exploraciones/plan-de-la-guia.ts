/**
 * lib/exploraciones/plan-de-la-guia.ts — qué pregunta la guía de la preventa y en qué paso. PURO.
 *
 * Iniciativa A del roadmap (2026-10-18). Antes, la guía preguntaba las casillas vacías del marco y las dimensiones sin
 * evidencia: 8 preguntas, y la primera en Distribuidora Larce fue «¿Qué pasa cuando un deal se queda quieto?», cuando
 * el cliente ya había escrito en el diagnóstico que los deals que se enfrían mueren sin que nadie reaccione. Ahora el
 * CÓDIGO decide cada pregunta: un tema (una tarjeta o una dimensión) y un PASO de la siguiente pregunta lógica:
 *
 *   situación → impacto (cuánto le afecta y le cuesta) → solución (cómo lo quiere resolver, qué intentó)
 *             → cuándo → con qué (quién firma, presupuesto)
 *
 * Un dolor que el cliente ya contó arranca en impacto, nunca en situación; una tarjeta con dato no se pregunta. El
 * agente solo escribe la pregunta del paso que le toca, y `repiteLoSabido` descarta la que igual vuelve a preguntar lo
 * dicho (en su lugar va `preguntaDeRespaldo`, con las palabras del cliente). Solo la preventa: la exploración de un
 * proyecto (Customer Success) sigue con su foco (guia.ts › `focoDeLaGuia`).
 */
import { LETRAS } from "@/lib/escala/documento/tipos";
import { metaEnCifras, type ClaveDeCasilla, type Meta, type Persona } from "./casillas";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import type { ContextoDelPlan, GuiaDeLaSesion, PosicionParaLaGuia, SesionPlaneada } from "./guia";
import { fuentesDistintas, loQueYaSabemos, type DatoDelCliente, type EntradaDelSaber, type SaberDelCliente } from "./lo-que-ya-sabemos";

export const PASOS_DE_LA_PREGUNTA = ["situacion", "impacto", "solucion", "cuando", "conQue"] as const;
export type PasoDeLaPregunta = (typeof PASOS_DE_LA_PREGUNTA)[number];

/** Qué busca cada paso, para el pedido al agente y para la pantalla. */
export const QUE_BUSCA_CADA_PASO: Record<PasoDeLaPregunta, string> = {
  situacion: "cómo pasa hoy",
  impacto: "cuánto le afecta y cuánto le cuesta",
  solucion: "cómo lo quiere resolver y qué ya intentó",
  cuando: "para cuándo lo necesita",
  conQue: "con qué: quién decide y con qué presupuesto",
};

/** Cuántas preguntas tiene la guía de una sesión de la preventa, contando lo que viene de antes. */
export const MAX_PREGUNTAS_DE_LA_GUIA = 5;
/** Cuántos dolores ya dichos se profundizan antes de lo que falta para proponer. */
export const MAX_DOLORES = 2;
/** Lo mínimo que se pregunta aunque haya mucho que viene de antes. */
const MIN_PREGUNTAS_PROPIAS = 2;

/** El paso de cada tarjeta: lo que pregunta cuando falta. */
const PASO_DE_LA_TARJETA: Partial<Record<ClaveDeCasilla, PasoDeLaPregunta>> = {
  retos: "situacion",
  obstaculos: "situacion",
  metas: "impacto",
  consecuencias: "impacto",
  implicaciones: "solucion",
  planes: "solucion",
  tiempos: "cuando",
  autoridad: "conQue",
  presupuesto: "conQue",
};

export interface PreguntaPlaneada {
  para: string;
  tipo: "tarjeta" | "dimension";
  paso: PasoDeLaPregunta;
  /** Lo que ya dijo el cliente de este tema y de donde parte la pregunta. null = no dijo nada todavía. */
  motivo: DatoDelCliente | null;
}

export interface EntradaDelPlan {
  saber: SaberDelCliente;
  casillas: Partial<Record<ClaveDeCasilla, unknown>>;
  escala: Pick<EscalaDelLienzo, "areas">;
  areas: readonly string[];
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>;
  aExplorar: Readonly<Record<string, unknown>>;
  /** Los pasos que ya se preguntaron en una sesión anterior (y se marcaron hechos), por tema. */
  yaPreguntado?: ReadonlyMap<string, ReadonlySet<PasoDeLaPregunta>>;
  /** Cuántos puntos se llevó el vendedor de una sesión anterior: van primero y ocupan lugar. */
  llevados?: number;
  /** A qué apuntaba lo que una sesión cortada tenía preparado: va primero, si todavía falta. */
  pasaron?: readonly string[];
  max?: number;
}

const vacia = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** ¿Falta esta tarjeta? La meta, sin cifras; quién decide, sin quien firma; las demás, vacías. */
export function faltaLaTarjeta(clave: ClaveDeCasilla, casillas: Partial<Record<ClaveDeCasilla, unknown>>): boolean {
  const v = casillas[clave];
  if (clave === "metas") return !((v as Meta[] | undefined) ?? []).some(metaEnCifras);
  if (clave === "autoridad") return !((v as Persona[] | undefined) ?? []).some((p) => p?.rol === "firma");
  return vacia(v);
}

/** Los pasos que ya se preguntaron: de cada sesión, las preguntas de su guía (con su paso) que se marcaron hechas. */
export function pasosYaPreguntados(
  sesiones: readonly Pick<SesionPlaneada, "id" | "hechas">[],
  guias: Readonly<Record<string, Pick<GuiaDeLaSesion, "preguntas">>>,
): Map<string, Set<PasoDeLaPregunta>> {
  const out = new Map<string, Set<PasoDeLaPregunta>>();
  for (const s of sesiones) {
    const hechas = new Set(s.hechas ?? []);
    for (const p of guias[s.id]?.preguntas ?? []) {
      if (!p.paso || !hechas.has(p.para)) continue;
      out.set(p.para, new Set([...(out.get(p.para) ?? []), p.paso]));
    }
  }
  return out;
}

/**
 * Lo que necesita el plan de la guía de una sesión, desde lo guardado: lo que ya sabemos, lo que ya se preguntó, lo
 * que el vendedor se llevó a ESA sesión y lo que pasó de una sesión cortada. Lo usan la pantalla y el pedido al agente,
 * así las dos dicen lo mismo.
 */
export function contextoDelPlan(o: EntradaDelSaber & { sesionId: string | null }): ContextoDelPlan {
  const sesiones = o.estado.contenido.sesiones;
  return {
    saber: loQueYaSabemos(o),
    yaPreguntado: pasosYaPreguntados(sesiones, o.estado.propuesta.guias),
    llevados: (sesiones.find((s) => s.id === o.sesionId)?.explorar ?? []).length,
    pasaron: [...new Set(sesiones.filter((s) => s.resultado === "cortada").flatMap((s) => s.pasaron ?? []))],
  };
}

/**
 * Las preguntas de la próxima sesión de la preventa, en orden. Lo que viene de antes primero; después los dolores que
 * el cliente ya contó (el nivel más bajo y con más fuentes), en impacto; después lo que falta para proponer (la meta
 * en cifras, para cuándo, quién firma) y el presupuesto al final. Sin ningún dolor dicho, se arranca por los retos y
 * la escala. Nunca más de `max` en total, contando lo llevado.
 */
export function planDeLaGuia(o: EntradaDelPlan): PreguntaPlaneada[] {
  const max = o.max ?? MAX_PREGUNTAS_DE_LA_GUIA;
  const lugar = Math.max(MIN_PREGUNTAS_PROPIAS, max - Math.max(0, o.llevados ?? 0));
  const ya = o.yaPreguntado ?? new Map<string, ReadonlySet<PasoDeLaPregunta>>();

  const dims: { id: string; capa: string; orden: number }[] = [];
  for (const a of o.escala.areas) {
    if (!o.areas.includes(a.id)) continue;
    for (const d of a.dimensiones) if (d.aplica) dims.push({ id: d.id, capa: d.capa, orden: dims.length });
  }
  const nivel = (id: string) => {
    const p = o.posiciones[id];
    return p ? LETRAS.indexOf(p.nivel) : -1;
  };
  const marcada = (id: string) => id in o.aExplorar;
  const datos = (id: string) => o.saber.porTema.get(id) ?? [];
  const debajoDeFuncional = (id: string) => {
    const n = nivel(id);
    return n < 0 || n < LETRAS.indexOf("F");
  };

  // Los dolores: dimensiones con palabras del cliente, debajo de Funcional (o marcadas para explorar a fondo).
  const siguientePaso = (id: string): PasoDeLaPregunta | null => {
    const hechos = ya.get(id);
    return (["impacto", "solucion"] as const).find((p) => !hechos?.has(p)) ?? null;
  };
  // Un reto confirmado en el Resumen atado a la dimensión: el vendedor ya lo dio por cierto.
  const esReto = (id: string) => datos(id).some((d) => d.origen === "resumen");
  const dolores = dims
    .filter((d) => datos(d.id).length > 0 && (debajoDeFuncional(d.id) || marcada(d.id)) && siguientePaso(d.id))
    .sort((a, b) => {
      const na = nivel(a.id) < 0 ? LETRAS.length : nivel(a.id);
      const nb = nivel(b.id) < 0 ? LETRAS.length : nivel(b.id);
      return (
        Number(marcada(b.id)) - Number(marcada(a.id)) ||
        na - nb ||
        Number(esReto(b.id)) - Number(esReto(a.id)) ||
        fuentesDistintas(datos(b.id)) - fuentesDistintas(datos(a.id)) ||
        Number(a.capa !== "base") - Number(b.capa !== "base") ||
        a.orden - b.orden
      );
    })
    .map((d): PreguntaPlaneada => ({ para: d.id, tipo: "dimension", paso: siguientePaso(d.id)!, motivo: datos(d.id)[0] ?? null }));

  // Las dimensiones sin nada del cliente: se preguntan en situación (la base operativa primero).
  const sinDato = dims
    .filter((d) => datos(d.id).length === 0 && (o.posiciones[d.id]?.clase !== "evidencia" || marcada(d.id)))
    .sort(
      (a, b) =>
        Number(marcada(b.id)) - Number(marcada(a.id)) ||
        nivel(a.id) - nivel(b.id) ||
        Number(a.capa !== "base") - Number(b.capa !== "base") ||
        a.orden - b.orden,
    )
    .map((d): PreguntaPlaneada => ({ para: d.id, tipo: "dimension", paso: "situacion", motivo: null }));

  const tarjeta = (clave: ClaveDeCasilla): PreguntaPlaneada => ({ para: clave, tipo: "tarjeta", paso: PASO_DE_LA_TARJETA[clave] ?? "situacion", motivo: null });
  const falta = (clave: ClaveDeCasilla) => faltaLaTarjeta(clave, o.casillas);

  // Lo que viene de una sesión cortada, si todavía falta.
  const pasaron: PreguntaPlaneada[] = (o.pasaron ?? []).flatMap((para) => {
    if (PASO_DE_LA_TARJETA[para as ClaveDeCasilla] !== undefined) return falta(para as ClaveDeCasilla) ? [tarjeta(para as ClaveDeCasilla)] : [];
    return [...dolores, ...sinDato].filter((p) => p.para === para);
  });

  const sinDolores = dolores.length === 0;
  const necesarias: PreguntaPlaneada[] = [
    ...pasaron,
    ...dolores.slice(0, MAX_DOLORES),
    ...(sinDolores && falta("retos") ? [tarjeta("retos")] : []),
    ...(falta("metas") ? [tarjeta("metas")] : []),
    // Con un dolor en impacto, «qué pasa si no actúa» sale de ahí: no se pregunta aparte.
    ...(sinDolores && falta("consecuencias") ? [tarjeta("consecuencias")] : []),
    ...(sinDolores ? sinDato.slice(0, 1) : []),
    ...(falta("tiempos") ? [tarjeta("tiempos")] : []),
    ...(falta("autoridad") ? [tarjeta("autoridad")] : []),
    ...(falta("presupuesto") ? [tarjeta("presupuesto")] : []),
  ];
  const relleno: PreguntaPlaneada[] = [
    ...dolores.slice(MAX_DOLORES),
    ...(falta("planes") ? [tarjeta("planes")] : []),
    ...(falta("implicaciones") ? [tarjeta("implicaciones")] : []),
    ...sinDato,
  ];

  const plan: PreguntaPlaneada[] = [];
  const usados = new Set<string>();
  for (const p of [...necesarias, ...relleno]) {
    if (plan.length >= lugar) break;
    if (usados.has(p.para)) continue;
    usados.add(p.para);
    plan.push(p);
  }
  // El presupuesto, al final: hablar de plata antes de la meta es vender antes de diagnosticar.
  return [...plan.filter((p) => p.para !== "presupuesto"), ...plan.filter((p) => p.para === "presupuesto")];
}

// ── Lo que repite y su respaldo ───────────────────────────────────────────────

/** Una pregunta que pide contar cómo pasa hoy («¿Qué pasa cuando…?», «¿Cómo manejan…?», «¿Me cuentas la última vez…?»). */
const SITUACIONAL =
  /^\s*¿?\s*(qu[eé] (pasa|sucede|hacen|hace|ocurre)\b|c[oó]mo (funciona|manejan|maneja|hacen|hace|trabajan|es|son|est[aá]n?|llevan|lleva|se|lo|la|le|les|saben|sabe|deciden)\b|cu[eé]ntame (c[oó]mo|qu[eé]|la [uú]ltima|de)|me cuentas (c[oó]mo|qu[eé]|la [uú]ltima)|de qu[eé] manera|hay alg[uú]n|qui[eé]n (se encarga|ve|revisa))/i;

/** Una pregunta que ya va un paso más hondo: cuánto cuesta, cómo lo quiere resolver, para cuándo, con qué. */
const MAS_HONDA =
  /\bcu[aá]nt[oa]s?\b|\bcost|impact|afect|pierd|perdi|\btasa\b|para cu[aá]ndo|\bcuándo|resolver|soluci|gustar[ií]a|\bideal\b|intentad|probad|presupuesto|inversi|\bfirma|decid|\bplata\b|dinero|\bhoras\b|margen|\bvale\b/i;

const PALABRAS_VACIAS = new Set(
  "que como cuando donde para pero porque esta este esto estos estas ese esa eso hay tiene tienen tener hacen hace hacer cada todo todos sobre entre desde hasta ellos ellas nosotros usted ustedes equipo cliente clientes".split(" "),
);
const raices = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !PALABRAS_VACIAS.has(w))
      .map((w) => w.slice(0, 5)),
  );

/**
 * ¿La pregunta vuelve a preguntar algo que el cliente ya contó? Solo en un tema con algo dicho y en un paso que no es
 * situación: si la pregunta pide contar cómo pasa (o comparte casi todo con lo dicho) y no va más hondo (cuánto,
 * para cuándo, cómo resolverlo…), repite.
 */
export function repiteLoSabido(pregunta: string, p: Pick<PreguntaPlaneada, "para" | "paso">, saber: SaberDelCliente): boolean {
  const dicho = saber.porTema.get(p.para) ?? [];
  if (!dicho.length || p.paso === "situacion") return false;
  if (MAS_HONDA.test(pregunta)) return false;
  if (SITUACIONAL.test(pregunta)) return true;
  const deLaPregunta = raices(pregunta);
  const comparte = dicho.some((d) => [...raices(d.texto)].filter((r) => deLaPregunta.has(r)).length >= 3);
  return comparte;
}

/**
 * La pregunta de cada paso, cuando parte de lo que dijo el cliente. Corta y sin su cita (validación 69, 2026-10-18): lo
 * que dijo va en el ⓘ de la pregunta, con su fuente, y el tema en la línea de abajo.
 */
export const PREGUNTA_DEL_PASO: Record<Exclude<PasoDeLaPregunta, "situacion">, string> = {
  impacto: "¿Cuánto les ha costado esto en los últimos meses: en negocios, en horas o en clientes?",
  solucion: "¿Cómo te gustaría que funcione, y qué han intentado hasta ahora?",
  cuando: "¿Para cuándo necesitan tenerlo resuelto?",
  conQue: "¿Con qué cuentan para resolverlo: quién decide y con qué presupuesto?",
};

/**
 * La pregunta que arma el código cuando el agente no escribió una que sirva: la del paso que toca, sin repetir lo que
 * dijo el cliente (eso va en el ⓘ). Sin nada dicho, o en situación, la pregunta de base del tema.
 */
export function preguntaDeRespaldo(p: PreguntaPlaneada, base: string): string {
  if (!p.motivo || p.paso === "situacion") return base;
  return PREGUNTA_DEL_PASO[p.paso];
}

// ── El cierre ─────────────────────────────────────────────────────────────────

/** La pregunta de cierre de toda sesión de la preventa. */
export const PREGUNTA_DE_CIERRE = "¿Hay algo que no hayamos hablado y que deba saber para proponerte el primer paso?";

/**
 * Lo que va al cerrar, además de pedir el siguiente paso: lo que falta para proponer y ninguna pregunta de la guía
 * cubre («Si no salió: quién firma, el presupuesto»). `faltan` son los nombres cortos (calidad.ts).
 */
export function siNoSalio(faltan: readonly string[]): string | null {
  if (!faltan.length) return null;
  const lista = faltan.map((f) => f.charAt(0).toLowerCase() + f.slice(1));
  const texto = lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
  return `Si no salió en la conversación, pregunta: ${texto}.`;
}
