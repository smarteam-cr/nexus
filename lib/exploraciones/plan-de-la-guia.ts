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
 * dicho (en su lugar va `preguntaDeRespaldo`, con las palabras del cliente).
 *
 * La exploración de un PROYECTO (Customer Success, `marco: "cs"`) usa el mismo plan desde el 2026-10-19, con su
 * estrategia: los retos del negocio (situación), los dolores que el cliente ya contó del proyecto (impacto), los
 * resultados que persigue en cifras (impacto) y lo que le impide llegar (situación). Sin «cuándo» ni «con qué»: el
 * cliente ya compró. Lo que dijo sale del proyecto (lo-que-ya-sabemos.ts), nunca del test. Una guía de un proyecto
 * armada ANTES del plan (sus preguntas no tienen paso) se sigue mostrando como se armó hasta que alguien toque
 * «Actualizar la guía» (`guiaDeAntesDelPlan`).
 *
 * Una sesión con un EQUIPO del cliente (2026-10-23, equipos.ts) tiene su propio plan (`planDelEquipo`): cómo está armado
 * el equipo, cómo lo miden, cómo funciona, con qué sistemas y datos, y dónde duele (con la dimensión de su área si el
 * cliente ya contó un dolor). Sin quién firma ni presupuesto, salvo con Dirección en la preventa. Lo que el equipo ya
 * respondió en otra sesión no se vuelve a preguntar.
 *
 * Qué entra y en qué orden se pregunta son dos cosas (2026-10-23): la guía elige por prioridad (lo que viene de antes,
 * los dolores, lo que falta para proponer) y después lo ordena como una conversación: la meta primero, después cómo pasa,
 * cuánto cuesta, cómo lo resolvería, para cuándo y con qué, y el presupuesto al final. Lo que una lectura marcó
 * respondido cuenta como preguntado (`pasosRespondidos`), igual que lo marcado hecho en «En vivo».
 */
import { LETRAS } from "@/lib/escala/documento/tipos";
import { metaEnCifras, type ClaveDeCasilla, type Meta, type Persona } from "./casillas";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import type { ClaveDeMarco } from "./marco";
import type { ContextoDelPlan, GuiaDeLaSesion, PosicionParaLaGuia, SesionPlaneada } from "./guia";
import type { EstadoDeExploracion, LecturaDeReunion } from "./contenido";
import { conAlgoQueSirve } from "./estado-de-las-tarjetas";
import { sesionDeLaLectura } from "./sesion-de-la-lectura";
import { EQUIPOS, equiposQueNombra, leerTemaDeEquipo, TEMA_DE_SISTEMAS_DE_LA_EMPRESA, temaDeEquipo, type ClaveDeEquipo } from "./equipos";
import { abreLaPuerta, PREGUNTAS_DE_ABRIR_LA_PUERTA } from "./como-llego";
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
  /** `equipo`: un tema de un equipo del cliente (`marketing.medicion`) o la pregunta de sistemas de la empresa. */
  tipo: "tarjeta" | "dimension" | "equipo";
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
  /** «cs» = la exploración de un proyecto: el plan de la estrategia. Sin él, la preventa. */
  marco?: ClaveDeMarco;
  /** El equipo del cliente de la sesión: su plan (`planDelEquipo`). Sin él, la empresa entera. */
  equipo?: ClaveDeEquipo | null;
  /** La conversación se puso técnica (o el objetivo habla de sistemas): la empresa suma una pregunta de sistemas y datos. */
  tecnica?: boolean;
  /**
   * K2 (2026-10-27): la primera sesión de un prospecto que llegó en frío o referido. No trae el plan de diagnóstico: unas
   * pocas preguntas abiertas para el final (qué le pasa, adónde quiere llegar), después de presentar y de escuchar.
   */
  abrirLaPuerta?: boolean;
}

const vacia = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * ¿Falta esta tarjeta? La meta, sin cifras; quién decide, sin quien firma; las demás, vacías o con texto que solo dice
 * que no se sabe («Sin fecha límite explícita»: 2026-10-23, estado-de-las-tarjetas.ts).
 */
export function faltaLaTarjeta(clave: ClaveDeCasilla, casillas: Partial<Record<ClaveDeCasilla, unknown>>): boolean {
  const v = casillas[clave];
  if (clave === "metas") return !((v as Meta[] | undefined) ?? []).some(metaEnCifras);
  if (clave === "autoridad") return !((v as Persona[] | undefined) ?? []).some((p) => p?.rol === "firma");
  return vacia(v) || !conAlgoQueSirve(v);
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
 * El paso que pregunta una pregunta, por su texto: para lo respondido en una reunión cuya guía ya no está (se volvió a
 * armar en la misma corrida que la leyó, como CEMACO el 21 oct). «¿Cuántas campañas se quedan sin salir…?» y «¿cuánto
 * tiempo tarda armarlo?» son impacto; «¿con qué criterio decide…?» y «¿Cuántas personas tiene el equipo?», situación: un
 * «cuántos» solo no dice que algo cuesta. Las palabras van enteras («cost» no es «acostumbran»).
 */
export function pasoQuePregunta(texto: string): PasoDeLaPregunta {
  const t = texto.toLowerCase();
  if (/\bpresupuesto|\binversi[oó]n\b|\bvisto bueno\b|\bqui[eé]n (firma|aprueba)\b/.test(t)) return "conQue";
  if (/\bpara cu[aá]ndo\b|\bqu[eé] fecha\b/.test(t)) return "cuando";
  if (/\bresolver\b|\bsoluci[oó]n\b|\bte gustar[ií]a\b|\bideal\b|\bintentaron\b|\bprobaron\b/.test(t)) return "solucion";
  if (/\bcu[aá]nto tiempo\b|\btarda\b|\bcost(o|os|ar|ado|ar[ií]a)\b|\bcostó|\bcuesta(n)?\b|\bpierd|\bperdi|\bhoras?\b|\btasa\b|\bplata\b|\bdinero\b|\bmargen\b|\bse quedan sin\b|\bsin seguimiento\b/.test(t)) {
    return "impacto";
  }
  return "situacion";
}

/** Qué lecturas cuentan para lo ya respondido. */
export interface LecturasQueCuentan {
  /** Las sesiones: de cuál es cada lectura y con qué guía se planeó su reunión. */
  sesiones?: readonly SesionPlaneada[];
  /** «Fuera de la exploración» (`contenido.fuera`): lo que se leyó de esas reuniones no cuenta. */
  fuera?: readonly string[];
  /**
   * Un prospecto: cada reunión con la empresa es sesión. Con `false` (un cliente o un proyecto) solo cuentan las lecturas
   * de una sesión y lo sumado a mano. Sin el dato, no se mira (como `lecturasDeLaExploracion`).
   */
  automaticas?: boolean;
  /** Solo las lecturas hechas hasta esta fecha (ISO): una guía ya armada no cambia sola por una lectura posterior. */
  hasta?: string | null;
  /** Solo las lecturas hechas después de esta fecha (ISO): lo que una guía ya armada todavía no sabe. */
  desde?: string | null;
}

type PropuestaParaLoRespondido = {
  lecturas?: Readonly<Record<string, Pick<LecturaDeReunion, "cobertura" | "en" | "fecha">>>;
  guias: Readonly<Record<string, Pick<GuiaDeLaSesion, "preguntas" | "en">>>;
  guia?: Pick<GuiaDeLaSesion, "preguntas" | "en"> | null;
};

/**
 * Los pasos que ya se respondieron según la lectura de cada reunión (CEMACO, 20 oct: la lectura marcó respondidas 1.2,
 * 1.3 y 1.6 y nadie las marcó «hecha»; la guía siguiente las volvía a preguntar igual). Cada tema respondido suma el paso
 * con que lo planeó la guía de ESA reunión (la de su sesión o la viva, armada antes de la reunión: el mismo criterio de
 * agente.ts › `planDeLaLectura`); si esa guía ya no está, el paso que pregunta su texto (`pasoQuePregunta`); un tema de
 * un equipo, el paso de su tema. Lo sumado a mano, lo vendido y lo llevado no tienen paso. Las reuniones «fuera de la
 * exploración» no cuentan.
 */
export function pasosRespondidos(propuesta: PropuestaParaLoRespondido, o: LecturasQueCuentan = {}): Map<string, Set<PasoDeLaPregunta>> {
  const out = new Map<string, Set<PasoDeLaPregunta>>();
  const sumar = (para: string, paso: PasoDeLaPregunta) => out.set(para, new Set([...(out.get(para) ?? []), paso]));
  const fuera = new Set(o.fuera ?? []);
  for (const [clave, l] of Object.entries(propuesta.lecturas ?? {})) {
    if (fuera.has(clave)) continue;
    if (o.hasta && !(l.en <= o.hasta)) continue;
    if (o.desde && !(l.en > o.desde)) continue;
    const sesion = o.sesiones ? sesionDeLaLectura(clave, l, o.sesiones) : null;
    if (o.automaticas === false && !sesion && !clave.startsWith("documento:")) continue;
    const cuando = l.fecha ?? l.en;
    const deLaSesion = sesion ? propuesta.guias[sesion.id] : undefined;
    const planeada = deLaSesion && deLaSesion.en < cuando ? deLaSesion : propuesta.guia && propuesta.guia.en < cuando ? propuesta.guia : null;
    for (const c of l.cobertura ?? []) {
      if (!c.respondida) continue;
      const delEquipo = leerTemaDeEquipo(c.para);
      if (delEquipo) {
        sumar(c.para, delEquipo.definicion.paso);
        continue;
      }
      if (/^(propia|vendido|abierto):/.test(c.para)) continue;
      const paso = planeada?.preguntas.find((p) => p.para === c.para && p.paso)?.paso;
      sumar(c.para, paso ?? pasoQuePregunta(c.pregunta));
    }
  }
  return out;
}

/**
 * Los temas de una guía ya armada (`temas`, los de las preguntas que se ven) que una reunión leída DESPUÉS de armarla dio
 * por respondidos: el estado de la guía los avisa, porque la guía no se mueve sola (ver `contextoDelPlan` › `hasta`).
 */
export function respondidoDespuesDeLaGuia(
  estado: Pick<EstadoDeExploracion, "contenido" | "propuesta">,
  guiaEn: string,
  temas: Iterable<string>,
  automaticas?: boolean,
): string[] {
  const despues = pasosRespondidos(estado.propuesta, {
    sesiones: estado.contenido.sesiones,
    fuera: estado.contenido.fuera,
    desde: guiaEn,
    ...(automaticas !== undefined ? { automaticas } : {}),
  });
  return [...new Set(temas)].filter((t) => despues.has(t));
}

function juntarPasos(...mapas: ReadonlyMap<string, ReadonlySet<PasoDeLaPregunta>>[]): Map<string, Set<PasoDeLaPregunta>> {
  const out = new Map<string, Set<PasoDeLaPregunta>>();
  for (const m of mapas) for (const [para, pasos] of m) out.set(para, new Set([...(out.get(para) ?? []), ...pasos]));
  return out;
}

/**
 * Lo que ya se preguntó en la exploración, por tema: lo marcado hecho en «En vivo» y lo que la lectura dio por respondido
 * (sin las reuniones de fuera; `o.hasta` deja afuera lo leído después de una guía ya armada).
 */
export function yaPreguntadoEnLaExploracion(
  estado: Pick<EstadoDeExploracion, "contenido" | "propuesta">,
  o: Pick<LecturasQueCuentan, "automaticas" | "hasta"> = {},
): Map<string, Set<PasoDeLaPregunta>> {
  return juntarPasos(
    pasosYaPreguntados(estado.contenido.sesiones, estado.propuesta.guias),
    pasosRespondidos(estado.propuesta, { sesiones: estado.contenido.sesiones, fuera: estado.contenido.fuera, ...o }),
  );
}

/**
 * Lo que necesita el plan de la guía de una sesión, desde lo guardado: lo que ya sabemos, lo que ya se preguntó (lo
 * marcado hecho y lo que la lectura dio por respondido), lo que el vendedor se llevó a ESA sesión, lo que pasó de una
 * sesión cortada, su equipo y si la conversación se puso técnica. Lo usan la pantalla y el pedido al agente, así las dos
 * dicen lo mismo.
 *
 * `hasta` (la fecha de la guía que se está MOSTRANDO): lo leído después no mueve su plan. Si moviera el paso de un tema,
 * los retoques del vendedor (guardados por «tema:paso») y la pregunta del agente dejarían de aplicarse sin aviso; lo
 * nuevo se avisa («Actualizar la guía») y entra al rearmarla. Al ARMAR una guía no se pasa: cuenta todo.
 */
export function contextoDelPlan(o: EntradaDelSaber & { sesionId: string | null; hasta?: string | null; automaticas?: boolean }): ContextoDelPlan {
  const sesiones = o.estado.contenido.sesiones;
  const sesion = sesiones.find((s) => s.id === o.sesionId);
  const equipo = sesion?.equipo ?? null;
  // La última reunión se puso técnica y nadie cerró el aviso, o el objetivo habla de sistemas.
  const alerta = o.estado.propuesta.alertaTecnica;
  const tecnica = (!!alerta && !alerta.vista) || (!!sesion?.objetivo && equiposQueNombra(sesion.objetivo).includes("tecnologia"));
  const abrirLaPuerta = abreLaPuerta(o.estado, o.sesionId, { marco: o.marco });
  return {
    saber: loQueYaSabemos(o),
    yaPreguntado: yaPreguntadoEnLaExploracion(o.estado, { hasta: o.hasta ?? null, ...(o.automaticas !== undefined ? { automaticas: o.automaticas } : {}) }),
    llevados: (sesion?.explorar ?? []).length,
    pasaron: [...new Set(sesiones.filter((s) => s.resultado === "cortada").flatMap((s) => s.pasaron ?? []))],
    ...(o.marco ? { marco: o.marco } : {}),
    ...(equipo ? { equipo } : {}),
    ...(tecnica ? { tecnica } : {}),
    ...(abrirLaPuerta ? { abrirLaPuerta } : {}),
  };
}

/**
 * ¿La guía de un PROYECTO se armó antes del plan? Sus preguntas no tienen paso. Esa guía se muestra como se armó (las
 * tarjetas que faltan y las dimensiones sin evidencia, sin el plan) hasta que alguien toque «Actualizar la guía»: lo ya
 * generado de una exploración no se reescribe solo. En la preventa no aplica: ahí la guía vieja ya se muestra con el plan
 * desde el 2026-10-18. Una guía sin preguntas (solo lo vendido) no cuenta como vieja.
 */
export function guiaDeAntesDelPlan(guia: Pick<GuiaDeLaSesion, "preguntas"> | null | undefined, marco: ClaveDeMarco): boolean {
  if (marco !== "cs" || !guia || !guia.preguntas.length) return false;
  return !guia.preguntas.some((p) => !!p.paso);
}

/**
 * Las preguntas de la próxima sesión, en el orden de la conversación. ENTRAN, por prioridad: lo que viene de antes; los
 * dolores que el cliente ya contó (el nivel más bajo y con más fuentes), en impacto; lo que falta para proponer (la meta
 * en cifras, para cuándo, quién firma) y el presupuesto. Sin ningún dolor dicho, se arranca por los retos y la escala.
 * Nunca más de `max` en total, contando lo llevado. Después se ORDENAN como se conversa (`enOrdenDeConversacion`). Con
 * un equipo del cliente, el plan del equipo (`planDelEquipo`).
 */
export function planDeLaGuia(o: EntradaDelPlan): PreguntaPlaneada[] {
  const cs = o.marco === "cs";
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
    // Un tema de un equipo pasa a una sesión del MISMO equipo, si todavía no se respondió.
    const delEquipo = leerTemaDeEquipo(para);
    if (delEquipo) return delEquipo.equipo === (o.equipo ?? null) && !(ya.get(para)?.size ?? 0) ? [{ para, tipo: "equipo" as const, paso: delEquipo.definicion.paso, motivo: null }] : [];
    return [...dolores, ...sinDato].filter((p) => p.para === para);
  });

  // K2: abrir la puerta. Solo unas preguntas abiertas para el final, sin dimensiones, sin quién firma ni presupuesto.
  if (o.abrirLaPuerta && !cs) {
    const abiertas = (["retos", "metas", "consecuencias", "tiempos"] as const).filter(falta).map(tarjeta);
    return enOrdenDeConversacion(elegir(abiertas, PREGUNTAS_DE_ABRIR_LA_PUERTA), new Set());
  }
  if (o.equipo) return planDelEquipo(o.equipo, { ...o, lugar, ya, dolores, falta, tarjeta, pasaron });

  const sinDolores = dolores.length === 0;
  // La conversación se puso técnica: una pregunta de sistemas y datos (fuentes, campos, integraciones), si no se respondió.
  const sistemas: PreguntaPlaneada[] =
    o.tecnica && !(ya.get(TEMA_DE_SISTEMAS_DE_LA_EMPRESA)?.size ?? 0) ? [{ para: TEMA_DE_SISTEMAS_DE_LA_EMPRESA, tipo: "equipo", paso: "situacion", motivo: null }] : [];
  /* En un proyecto, la estrategia: los retos del negocio, los dolores que ya contó, los resultados en cifras y lo que le
     impide llegar. Sin «cuándo» ni «con qué»: el cliente ya compró (quién firma y el presupuesto son de la venta). */
  const necesariasDelProyecto: PreguntaPlaneada[] = [
    ...pasaron,
    ...(falta("retos") ? [tarjeta("retos")] : []),
    ...dolores.slice(0, MAX_DOLORES),
    ...(falta("metas") ? [tarjeta("metas")] : []),
    ...(falta("obstaculos") ? [tarjeta("obstaculos")] : []),
    ...(sinDolores ? sinDato.slice(0, 1) : []),
  ];
  const necesarias: PreguntaPlaneada[] = cs ? necesariasDelProyecto : [
    ...pasaron,
    ...dolores.slice(0, MAX_DOLORES),
    ...(sinDolores && falta("retos") ? [tarjeta("retos")] : []),
    ...(falta("metas") ? [tarjeta("metas")] : []),
    // Con un dolor en impacto, «qué pasa si no actúa» sale de ahí: no se pregunta aparte.
    ...(sinDolores && falta("consecuencias") ? [tarjeta("consecuencias")] : []),
    ...(sinDolores ? sinDato.slice(0, 1) : []),
    ...sistemas,
    ...(falta("tiempos") ? [tarjeta("tiempos")] : []),
    ...(falta("autoridad") ? [tarjeta("autoridad")] : []),
    ...(falta("presupuesto") ? [tarjeta("presupuesto")] : []),
  ];
  const relleno: PreguntaPlaneada[] = cs ? [...sistemas, ...dolores.slice(MAX_DOLORES), ...sinDato] : [
    ...dolores.slice(MAX_DOLORES),
    ...(falta("planes") ? [tarjeta("planes")] : []),
    ...(falta("implicaciones") ? [tarjeta("implicaciones")] : []),
    ...sinDato,
  ];

  return enOrdenDeConversacion(elegir([...necesarias, ...relleno], lugar), new Set(pasaron.map((p) => p.para)));
}

/** Los primeros `lugar` sin repetir tema: lo que entra, por prioridad. */
function elegir(candidatas: readonly PreguntaPlaneada[], lugar: number): PreguntaPlaneada[] {
  const plan: PreguntaPlaneada[] = [];
  const usados = new Set<string>();
  for (const p of candidatas) {
    if (plan.length >= lugar) break;
    if (usados.has(p.para)) continue;
    usados.add(p.para);
    plan.push(p);
  }
  return plan;
}

/** En qué momento de la conversación va cada paso: la meta primero, después cómo pasa, cuánto cuesta, cómo, cuándo y con qué. */
const MOMENTO_DEL_PASO: Record<PasoDeLaPregunta, number> = { situacion: 1, impacto: 2, solucion: 3, cuando: 4, conQue: 5 };

/**
 * Lo elegido, en el orden de una conversación (Marco, 22 oct: «la pregunta que propone Nexus no es la siguiente lógica en
 * la conversación»; antes la sesión abría con el costo de un dolor y la meta iba tercera). Lo que viene de antes va
 * primero; después adónde quiere llegar (la meta), cómo pasa hoy, cuánto le cuesta, cómo lo resolvería, para cuándo y
 * con qué. El presupuesto, al final: hablar de plata antes de la meta es vender antes de diagnosticar.
 */
export function enOrdenDeConversacion(plan: readonly PreguntaPlaneada[], deAntes: ReadonlySet<string> = new Set()): PreguntaPlaneada[] {
  const momento = (p: PreguntaPlaneada) => (deAntes.has(p.para) ? -1 : p.para === "metas" ? 0 : p.para === "presupuesto" ? 9 : MOMENTO_DEL_PASO[p.paso]);
  return plan
    .map((p, i) => ({ p, i }))
    .sort((a, b) => momento(a.p) - momento(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * El plan de una sesión con un equipo del cliente (2026-10-23): sus temas (equipos.ts), en el orden de su conversación,
 * con lo que viene de antes primero. Su «dónde duele» es la dimensión de su área con lo que el cliente ya contó, si hay
 * una debajo de Funcional (con su nivel y su evidencia); si no, el tema del equipo. Lo que el equipo ya respondió en otra
 * sesión no entra. Con Dirección en la preventa, después de sus temas va lo que falta para proponer (para cuándo, quién
 * firma y el presupuesto): es con quien se habla de eso. Sin lugar para todo, entra por la prioridad del equipo, y
 * dentro de ella (K1 etapa 3, 2026-10-26) un tema cuyas dimensiones del área ya tienen todas evidencia baja detrás de los
 * que todavía ubican alguna: la guía pregunta primero lo que ubica al cliente en la escala, sin desordenar la prioridad
 * del equipo entre los que ubican. Los temas sin dimensiones (el dolor) se quedan en su lugar. Con Dirección en la
 * preventa, la inversión no entra: la cubre el presupuesto, que va con ella.
 */
function planDelEquipo(
  equipo: ClaveDeEquipo,
  o: Pick<EntradaDelPlan, "escala" | "marco" | "posiciones"> & {
    lugar: number;
    ya: ReadonlyMap<string, ReadonlySet<PasoDeLaPregunta>>;
    dolores: readonly PreguntaPlaneada[];
    falta: (clave: ClaveDeCasilla) => boolean;
    tarjeta: (clave: ClaveDeCasilla) => PreguntaPlaneada;
    pasaron: readonly PreguntaPlaneada[];
  },
): PreguntaPlaneada[] {
  const def = EQUIPOS[equipo];
  const respondido = (para: string) => (o.ya.get(para)?.size ?? 0) > 0;
  const delArea = new Set(def.area ? (o.escala.areas.find((a) => a.id === def.area)?.dimensiones.map((d) => d.id) ?? []) : []);
  const dolorDelArea = o.dolores.find((d) => delArea.has(d.para)) ?? null;

  // Cada tema del equipo, en el orden de su conversación; el de «dónde duele», con la dimensión del área si la hay.
  const temas: PreguntaPlaneada[] = def.temas.flatMap((t): PreguntaPlaneada[] => {
    const para = temaDeEquipo(equipo, t.tema);
    if (t.tema === "dolor" && dolorDelArea) return [dolorDelArea];
    if (respondido(para)) return [];
    return [{ para, tipo: "equipo", paso: t.paso, motivo: null }];
  });
  const conQue: PreguntaPlaneada[] =
    equipo === "direccion" && o.marco !== "cs" ? (["tiempos", "autoridad", "presupuesto"] as const).filter(o.falta).map(o.tarjeta) : [];

  const porTema = new Map(temas.map((p) => [p.para, p] as const));
  const sinEvidencia = new Set([...delArea].filter((d) => o.posiciones[d]?.clase !== "evidencia"));
  // Ubica si alguna de sus dimensiones (de las que trae la escala) todavía no tiene evidencia. Un tema sin ninguna de sus
  // dimensiones en esta escala no entra al reorden: se queda donde está.
  const suyas = (t: (typeof def.prioridad)[number]) => (def.temas.find((x) => x.tema === t)?.dimensiones ?? []).filter((d) => delArea.has(d));
  const ubica = (t: (typeof def.prioridad)[number]) => (suyas(t).some((d) => sinEvidencia.has(d)) ? 1 : 0);
  const conDimensiones = def.prioridad.filter((t) => suyas(t).length > 0);
  const porLoQueUbican = [...conDimensiones].sort((a, b) => ubica(b) - ubica(a) || conDimensiones.indexOf(a) - conDimensiones.indexOf(b));
  let siguiente = 0;
  const conPresupuesto = equipo === "direccion" && o.marco !== "cs";
  const ordenDelEquipo = def.prioridad
    .map((t) => (conDimensiones.includes(t) ? porLoQueUbican[siguiente++] : t))
    .filter((t) => !(conPresupuesto && t === "inversion"));
  const prioridad = ordenDelEquipo.flatMap((t) => {
    const para = t === "dolor" && dolorDelArea ? dolorDelArea.para : temaDeEquipo(equipo, t);
    const p = porTema.get(para);
    return p ? [p] : [];
  });
  const elegidas = new Set(elegir([...o.pasaron, ...prioridad, ...conQue], o.lugar).map((p) => p.para));
  // El orden: lo que viene de antes, los temas del equipo como se conversan, y lo de la venta al final (el presupuesto, último).
  return [...o.pasaron, ...temas, ...conQue].filter((p, i, todos) => elegidas.has(p.para) && todos.findIndex((x) => x.para === p.para) === i);
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
 * Las repreguntas de la pregunta de respaldo, por paso (validación 104, 2026-10-18). Antes la de respaldo iba sin
 * repreguntas: en Distribuidora Larce la 2 (1.1, Procesos y Rutinas) tenía 0 porque el agente no había escrito una del
 * paso que tocaba, y el asistente no podía mejorar «sus repreguntas». Cada una baja un paso más, hacia un número.
 */
export const REPREGUNTAS_DEL_PASO: Record<PasoDeLaPregunta, readonly string[]> = {
  situacion: ["¿Me cuentas la última vez que pasó?", "¿Por qué crees que pasa?", "¿Cuántas veces al mes pasa, más o menos?"],
  impacto: ["¿Cuántos negocios o clientes se perdieron por esto?", "¿Cuántas horas a la semana se van en eso?", "¿Cuánto representa en plata, más o menos?"],
  solucion: ["¿Qué tendría que pasar para decir que quedó resuelto?", "¿Qué intentaron y por qué no funcionó?", "¿Quién más tiene que estar de acuerdo con eso?"],
  cuando: ["¿Qué pasa si no está para esa fecha?", "¿Hay algo que marque esa fecha?", "¿Qué tendría que estar listo antes?"],
  conQue: ["¿Quién más participa en la decisión?", "¿Contra qué lo van a comparar?", "¿Hay un monto que ya tengan en mente?"],
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
/** La de una sesión de la exploración de un proyecto: el cliente ya compró, se cierra hacia sus resultados. */
export const PREGUNTA_DE_CIERRE_DEL_PROYECTO = "¿Hay algo que no hayamos hablado y que deba saber para que el proyecto llegue a esos resultados?";

/** La pregunta de cierre del marco. */
export function preguntaDeCierre(marco: ClaveDeMarco): string {
  return marco === "cs" ? PREGUNTA_DE_CIERRE_DEL_PROYECTO : PREGUNTA_DE_CIERRE;
}

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
