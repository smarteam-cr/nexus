/**
 * lib/exploraciones/ajustes-de-la-guia.ts — lo que el vendedor decide sobre la guía de UNA sesión. PURO.
 *
 * Validaciones 69, 71 y 73 del roadmap (Elías, 2026-10-18, con Distribuidora Larce): la guía la escribe el agente, pero
 * el vendedor tiene que poder cambiar una pregunta, sumar las suyas y pedirle al asistente «más de presupuesto» sin
 * rearmarla entera. Lo que decide vive en la SESIÓN (`SesionPlaneada.ajustesDeLaGuia`, en `contenido`, la mitad de las
 * personas), no en la guía (`propuesta`, la mitad del agente):
 *
 *   · `propias`: las preguntas que agregó a mano («tuya») o con el asistente («asistente»);
 *   · `cambios`: una pregunta de la guía reescrita (a mano, regenerada o por el asistente), por su clave;
 *   · `quitadas`: las preguntas de la guía que sacó.
 *
 * Por estar en `contenido`, sobreviven a «Actualizar la guía» (el agente escribe solo `propuesta`). Una pregunta cambiada
 * se devuelve a la de la guía con «restaurar». `aplicarAjustes` es lo único que los junta con la guía: la pantalla, el
 * panel, «En vivo», lo que cubre la guía y el asistente leen las mismas preguntas.
 */
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import type { PreguntaParaMostrar } from "./guia";
import { esTarjeta } from "./marco";

/** Un error de un cambio a la guía, con su estado HTTP y un mensaje para la persona (lo reconoce la capa de operaciones). */
export class ErrorDeLaGuia extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Quién hizo un ajuste: el vendedor a mano, el asistente (con su clic) o «Regenerar» de esa pregunta. */
export const ORIGENES_DEL_AJUSTE = ["tuya", "asistente", "regenerada"] as const;
export type OrigenDelAjuste = (typeof ORIGENES_DEL_AJUSTE)[number];

/** Una pregunta que el vendedor sumó a la guía de su sesión. `para` = el tema (una tarjeta o una dimensión), si lo tiene. */
export interface PreguntaPropia {
  id: string;
  pregunta: string;
  repreguntas: string[];
  para?: string;
  origen: Exclude<OrigenDelAjuste, "regenerada">;
  /**
   * Quién la cambió después, si no fue quien la sumó: «Regenerar» o el asistente sobre una tuya, tú sobre una del
   * asistente (prueba 104, 2026-10-19: regenerar una del asistente seguía diciendo «Del asistente»).
   */
  cambio?: OrigenDelAjuste;
}

/** Una pregunta de la guía reescrita: lo que cambió (la pregunta, sus repreguntas o las dos) y quién. */
export interface CambioDePregunta {
  pregunta?: string;
  repreguntas?: string[];
  origen: OrigenDelAjuste;
}

export interface AjustesDeLaGuia {
  propias?: PreguntaPropia[];
  cambios?: Record<string, CambioDePregunta>;
  quitadas?: string[];
}

export const MAX_PREGUNTAS_PROPIAS = 8;
/** El tope cuenta las sumadas por ti y por el asistente: decir «tuyas» confundía (2026-10-19). */
export const AVISO_DEL_TOPE_DE_SUMADAS = `La guía ya tiene ${MAX_PREGUNTAS_PROPIAS} preguntas sumadas (tuyas o del asistente): quita una antes de sumar otra.`;
export const MAX_CAMBIOS_DE_LA_GUIA = 20;
export const LARGO_DE_UNA_PREGUNTA = 400;
export const LARGO_DE_UNA_REPREGUNTA = 300;
export const MAX_REPREGUNTAS = 3;
/** Lo que mide la clave de una pregunta: el tema (hasta 40) y su paso. */
export const LARGO_DE_UNA_CLAVE = 60;

/** El prefijo del `para` de una pregunta propia: `propia:<id>` (con él se guardan su casilla «hecha» y su nota). */
export const PREFIJO_PROPIA = "propia:";

/** El id de una pregunta propia nueva: `p` y letras y números. */
export const nuevoIdDePropia = (): string => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * La clave de una pregunta de la guía: su tema y su paso (`1.7:impacto`), o solo su tema si no tiene paso (las de un
 * proyecto, las de antes del plan). El paso va en la clave para que un cambio hecho al impacto no se aplique a la
 * pregunta de la solución cuando el plan avanza.
 */
export function claveDePregunta(p: Pick<PreguntaParaMostrar, "para" | "paso">): string {
  return p.paso ? `${p.para}:${p.paso}` : p.para;
}

/** ¿Es una clave (o un `para`) de una pregunta propia? */
export function esPropia(clave: string): boolean {
  return clave.startsWith(PREFIJO_PROPIA);
}

/**
 * Las preguntas de la guía con lo que decidió el vendedor: lo cambiado reemplaza el texto (y queda marcado), lo quitado
 * no se ve, y las propias van al final con su marca. `apuntaA` dice si el tema de una propia es una tarjeta o una
 * dimensión que se puede preguntar (sin tema, o con uno que ya no existe, va suelta).
 */
export function aplicarAjustes(
  preguntas: readonly PreguntaParaMostrar[],
  ajustes: AjustesDeLaGuia | undefined,
  apuntaA: (para: string) => PreguntaParaMostrar["apunta"] = () => undefined,
): PreguntaParaMostrar[] {
  if (!ajustes) return [...preguntas];
  const quitadas = new Set(ajustes.quitadas ?? []);
  const cambios = ajustes.cambios ?? {};
  const out: PreguntaParaMostrar[] = [];
  for (const p of preguntas) {
    const clave = claveDePregunta(p);
    if (quitadas.has(clave)) continue;
    const c = cambios[clave];
    out.push(
      c
        ? { ...p, pregunta: c.pregunta ?? p.pregunta, repreguntas: c.repreguntas ?? p.repreguntas, marca: c.origen, cambiada: true }
        : p,
    );
  }
  for (const pr of ajustes.propias ?? []) {
    const apunta = pr.para ? apuntaA(pr.para) : undefined;
    out.push({
      para: `${PREFIJO_PROPIA}${pr.id}`,
      tipo: "propia",
      pregunta: pr.pregunta,
      repreguntas: pr.repreguntas,
      marca: pr.cambio ?? pr.origen,
      ...(pr.cambio ? { cambiada: true } : {}),
      ...(apunta ? { apunta } : {}),
    });
  }
  return out;
}

/** A qué apunta el tema de una propia: una tarjeta del marco o una dimensión de la escala (otra cosa, a nada). */
export function apuntaDelTema(escala: Pick<EscalaDelLienzo, "areas">): (para: string) => PreguntaParaMostrar["apunta"] {
  return (para) => {
    if (esTarjeta(para)) return { tipo: "tarjeta", para };
    return escala.areas.some((a) => a.dimensiones.some((d) => d.id === para)) ? { tipo: "dimension", para } : undefined;
  };
}

/** Lo que se puede hacer con la guía de una sesión: la pantalla, «Regenerar» y el asistente mandan esto. */
export type CambioDeLaGuia =
  | { tipo: "agregar"; pregunta: PreguntaPropia }
  /** Cambiar una pregunta: de la guía (por su clave) o una propia (`propia:<id>`). Lo que no se manda, no cambia. */
  | { tipo: "cambiar"; clave: string; pregunta?: string; repreguntas?: string[]; origen: OrigenDelAjuste; para?: string | null }
  /** Quitar una pregunta: de la guía (deja de verse) o una propia (se borra). */
  | { tipo: "quitar"; clave: string }
  /** Volver a la pregunta de la guía: deshace un cambio o devuelve una quitada. */
  | { tipo: "restaurar"; clave: string };

export type ResultadoDelAjuste = { ok: true; ajustes: AjustesDeLaGuia } | { ok: false; error: string };

const limpio = (t: string, max: number) => t.trim().replace(/\s+/g, " ").slice(0, max);
const limpias = (rs: readonly string[]) =>
  rs
    .map((r) => limpio(r, LARGO_DE_UNA_REPREGUNTA))
    .filter(Boolean)
    .slice(0, MAX_REPREGUNTAS);

/** Sin listas ni registros vacíos: lo que no tiene nada no se guarda. */
function compacto(a: AjustesDeLaGuia): AjustesDeLaGuia {
  return {
    ...(a.propias?.length ? { propias: a.propias } : {}),
    ...(a.cambios && Object.keys(a.cambios).length ? { cambios: a.cambios } : {}),
    ...(a.quitadas?.length ? { quitadas: a.quitadas } : {}),
  };
}

/** ¿Quedó algo? (un ajuste vacío no se guarda en la sesión) */
export function hayAjustes(a: AjustesDeLaGuia | undefined): boolean {
  return !!a && (!!a.propias?.length || !!(a.cambios && Object.keys(a.cambios).length) || !!a.quitadas?.length);
}

/**
 * Aplica un cambio a los ajustes de la sesión. Valida los topes y que lo que se nombra exista (una propia por su id).
 * Una pregunta de la guía no se verifica acá (la guía cambia con lo que se sabe): una clave que ya no aparece no hace nada.
 */
export function aplicarCambioDeLaGuia(antes: AjustesDeLaGuia | undefined, cambio: CambioDeLaGuia): ResultadoDelAjuste {
  const a: AjustesDeLaGuia = { propias: [...(antes?.propias ?? [])], cambios: { ...(antes?.cambios ?? {}) }, quitadas: [...(antes?.quitadas ?? [])] };
  switch (cambio.tipo) {
    case "agregar": {
      const pregunta = limpio(cambio.pregunta.pregunta, LARGO_DE_UNA_PREGUNTA);
      if (!pregunta) return { ok: false, error: "Escribe la pregunta." };
      if (a.propias!.length >= MAX_PREGUNTAS_PROPIAS) return { ok: false, error: AVISO_DEL_TOPE_DE_SUMADAS };
      if (a.propias!.some((p) => p.id === cambio.pregunta.id)) return { ok: false, error: "Esa pregunta ya está." };
      a.propias!.push({ ...cambio.pregunta, pregunta, repreguntas: limpias(cambio.pregunta.repreguntas) });
      return { ok: true, ajustes: compacto(a) };
    }
    case "cambiar": {
      const pregunta = cambio.pregunta !== undefined ? limpio(cambio.pregunta, LARGO_DE_UNA_PREGUNTA) : undefined;
      if (pregunta === "") return { ok: false, error: "La pregunta no puede quedar vacía." };
      const repreguntas = cambio.repreguntas ? limpias(cambio.repreguntas) : undefined;
      if (esPropia(cambio.clave)) {
        const id = cambio.clave.slice(PREFIJO_PROPIA.length);
        const i = a.propias!.findIndex((p) => p.id === id);
        if (i < 0) return { ok: false, error: "Esa pregunta ya no está en la guía." };
        const p = a.propias![i];
        const { para: _para, cambio: _cambio, ...sinTema } = p;
        void _para;
        void _cambio;
        const tema = cambio.para === undefined ? p.para : cambio.para;
        // Quién la cambió queda marcado solo si no fue quien la sumó (una tuya editada por ti sigue siendo «Tuya»).
        const quien = cambio.origen === p.origen ? undefined : cambio.origen;
        a.propias![i] = {
          ...sinTema,
          ...(tema ? { para: tema } : {}),
          ...(pregunta ? { pregunta } : {}),
          ...(repreguntas ? { repreguntas } : {}),
          ...(quien ? { cambio: quien } : {}),
        };
        return { ok: true, ajustes: compacto(a) };
      }
      if (!pregunta && !repreguntas) return { ok: false, error: "No hay nada que cambiar." };
      if (!(cambio.clave in a.cambios!) && Object.keys(a.cambios!).length >= MAX_CAMBIOS_DE_LA_GUIA) {
        return { ok: false, error: "Ya cambiaste muchas preguntas de esta guía: actualízala o devuelve alguna a la de la guía." };
      }
      const previo = a.cambios![cambio.clave];
      a.cambios![cambio.clave] = {
        ...(pregunta ? { pregunta } : previo?.pregunta ? { pregunta: previo.pregunta } : {}),
        ...(repreguntas ? { repreguntas } : previo?.repreguntas ? { repreguntas: previo.repreguntas } : {}),
        origen: cambio.origen,
      };
      a.quitadas = a.quitadas!.filter((k) => k !== cambio.clave);
      return { ok: true, ajustes: compacto(a) };
    }
    case "quitar": {
      if (esPropia(cambio.clave)) {
        const id = cambio.clave.slice(PREFIJO_PROPIA.length);
        if (!a.propias!.some((p) => p.id === id)) return { ok: false, error: "Esa pregunta ya no está en la guía." };
        a.propias = a.propias!.filter((p) => p.id !== id);
        return { ok: true, ajustes: compacto(a) };
      }
      if (!a.quitadas!.includes(cambio.clave)) {
        if (a.quitadas!.length >= MAX_CAMBIOS_DE_LA_GUIA) return { ok: false, error: "Ya quitaste muchas preguntas de esta guía: actualízala." };
        a.quitadas!.push(cambio.clave);
      }
      delete a.cambios![cambio.clave];
      return { ok: true, ajustes: compacto(a) };
    }
    case "restaurar": {
      delete a.cambios![cambio.clave];
      a.quitadas = a.quitadas!.filter((k) => k !== cambio.clave);
      return { ok: true, ajustes: compacto(a) };
    }
  }
}

/**
 * Lo que deshace «Borrar» de una pregunta (el ⋯ de cada pregunta, validación 104). Una propia se vuelve a agregar con su
 * mismo id (su casilla «hecha» y su nota siguen ahí); una de la guía cambiada vuelve con su cambio; una de la guía sin
 * cambiar, a la de la guía.
 */
export function deshacerElBorrado(
  p: Pick<PreguntaParaMostrar, "para" | "paso" | "tipo" | "pregunta" | "repreguntas" | "marca" | "apunta" | "cambiada">,
  propia?: PreguntaPropia,
): CambioDeLaGuia {
  if (p.tipo === "propia" && esPropia(p.para)) {
    // Con la propia guardada vuelve igual (quién la sumó y quién la cambió); sin ella, desde lo que se ve.
    if (propia) return { tipo: "agregar", pregunta: { ...propia, repreguntas: [...propia.repreguntas] } };
    const para = p.apunta?.para;
    return {
      tipo: "agregar",
      pregunta: { id: p.para.slice(PREFIJO_PROPIA.length), pregunta: p.pregunta, repreguntas: [...p.repreguntas], ...(para ? { para } : {}), origen: p.marca === "asistente" ? "asistente" : "tuya" },
    };
  }
  const clave = claveDePregunta(p);
  if (p.cambiada) return { tipo: "cambiar", clave, pregunta: p.pregunta, repreguntas: [...p.repreguntas], origen: p.marca ?? "tuya" };
  return { tipo: "restaurar", clave };
}

// ── La línea de la lista del chat ─────────────────────────────────────────────

const recortado = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * La línea que lee la persona en la lista del chat cuando el asistente cambia una pregunta: la pregunta nueva y, si
 * cambian, las repreguntas nuevas con sus palabras (validación 104: «sus repreguntas» a secas no dejaba revisar nada).
 */
export function lineaDelCambio(c: { sesion: number; numero: number; tema: string | null; pregunta?: string; repreguntas?: readonly string[] }): string {
  const cual = `la ${c.numero}${c.tema ? ` (${c.tema})` : ""}`;
  const reps = c.repreguntas?.length ? c.repreguntas.map((r) => `«${recortado(r, 70)}»`).join(" · ") : null;
  if (c.pregunta) return `Guía de la sesión ${c.sesion}: cambiar ${cual} por «${recortado(c.pregunta, 90)}»${reps ? `, con las repreguntas ${reps}` : ""}`;
  return `Guía de la sesión ${c.sesion}: en ${cual}, ${reps ? `las repreguntas ${reps}` : "sin repreguntas"}`;
}

// ── Sin la cita adelante ──────────────────────────────────────────────────────

/** Una oración que repite lo que dijo el cliente antes de preguntar («Dijiste que…», «En el diagnóstico marcaron…»). */
const ABRE_CON_LO_DICHO =
  /^\s*(en el diagn[oó]stico|en la reuni[oó]n|en la nota|en su hubspot|qued[oó] anotado|ya nos contaron|dijiste|dijeron|dices|dicen|mencionaste|mencionaron|comentaste|comentaron|contaste|contaron|marcaste|marcaron|me dijiste|nos dijiste|nos contaste|me contaste|seg[uú]n (lo que )?(dijiste|dijeron|marcaron|marcaste))\b/i;

/**
 * La pregunta sin lo que dijo el cliente adelante (Elías, 2026-10-18: «cada pregunta es solo la pregunta, concisa, sin
 * "En el diagnóstico dijeron…"»). Las guías armadas antes de esto (y la pregunta de respaldo vieja) abren con la cita o con
 * «Dijiste que…»; se corta todo lo que va antes del «¿» cuando esa parte es una oración aparte que repite lo dicho (trae
 * una cita «…» o abre con «Dijiste», «En el diagnóstico marcaron»…). Lo que no tiene esa forma queda como está. La cita
 * se muestra en el ⓘ, con su fuente.
 */
export function sinCitaAdelante(pregunta: string): string {
  const i = pregunta.indexOf("¿");
  if (i <= 0) return pregunta;
  const antes = pregunta.slice(0, i).trim();
  const terminaOracion = /[.:]$/.test(antes) || /[.:]»$/.test(antes) || /»\.?$/.test(antes);
  if (!terminaOracion) return pregunta;
  if (!antes.includes("«") && !ABRE_CON_LO_DICHO.test(antes)) return pregunta;
  const resto = pregunta.slice(i).trim();
  return resto.length >= 8 ? resto : pregunta;
}
