/**
 * lib/impacto/impacto.ts — EL AGENTE DE IMPACTO: ¿esta nota del equipo cambia un entregable? (Elías, 21 nov). PURO.
 *
 * Cuando una persona del equipo agrega contexto, una llamada corta a Claude (Haiku) recibe la nota y el estado del
 * entregable (sus piezas principales y si está publicado, presentado o aceptado) y responde si lo cambia, con una frase
 * de por qué y qué partes toca. Si lo cambia, la pantalla muestra la cuenta regresiva (./cuenta-regresiva.ts) y al llegar
 * a 0 rehace el entregable como BORRADOR: nunca publica.
 *
 * Es una pieza para enchufar: hoy la usa La escala de la empresa (lib/exploraciones/impacto-en-la-escala-server.ts);
 * mañana el kickoff, el handoff, la entrega, las sesiones de consenso y la puerta «hablar con Nexus». Cada entregable da
 * su `EntregableParaElImpacto`; el pedido, la lectura y las reglas son las mismas.
 *
 * El código decide antes y después de la IA (`antesDeLlamar`, `leerElImpacto`): sin entregable armado no hay nada que
 * rehacer y no se llama; una nota vacía o de dos palabras no cambia nada; «contradice lo aceptado» solo vale si el cliente
 * aceptó algo, y la fecha la pone el registro, no el modelo; las partes son solo las que el entregable tiene.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { parseObject } from "@/lib/ai/section-schema";
import { escaleraParaElAgente } from "./escalera";
import { diaEnCostaRica, type EstadoConElCliente } from "./respuesta-del-cliente";

/** El modelo: es una decisión corta, sí o no con una frase. */
export const MODELO_DEL_IMPACTO = "claude-haiku-4-5";
export const MAX_TOKENS_DEL_IMPACTO = 400;
/** Con menos palabras, una nota no dice nada que cambie un entregable («ok», «ver esto»). */
export const MIN_PALABRAS_DE_LA_NOTA = 4;
/** Lo que lee de la nota y de cada pieza (un pedido corto: la nota cabe entera). */
const TOPE_DE_LA_NOTA = 3000;
const TOPE_DE_UNA_PIEZA = 400;
const MAX_PIEZAS = 30;
/** La frase de por qué. */
export const TOPE_DEL_PORQUE_DEL_IMPACTO = 220;

/** Una nota del equipo: lo que escribió, quién y cuándo. */
export interface NotaDelEquipo {
  texto: string;
  /** Su nombre (o su correo si no se sabe). */
  por: string | null;
  /** ISO. */
  en: string;
}

/** Una parte del entregable, con lo que dice hoy. */
export interface PiezaDelEntregable {
  /** La parte a la que pertenece («Titular», «Puntos clave», «Ventas»): son las que el agente puede nombrar. */
  parte: string;
  texto: string;
}

/** Lo que el agente sabe del entregable. */
export interface EntregableParaElImpacto {
  /** Cómo lo nombra el aviso: «la página de La escala». */
  nombre: string;
  /** false: todavía no se armó (no hay nada que rehacer). */
  armado: boolean;
  piezas: PiezaDelEntregable[];
  /** El cliente ya tiene una versión publicada. */
  publicado: boolean;
  cliente: EstadoConElCliente;
  /** Lo aceptado, en un bloque (`bloqueDeLoAceptado`), o "". */
  loAceptado: string;
}

export interface ImpactoDeLaNota {
  cambia: boolean;
  /** Una frase de por qué (solo si cambia). */
  porque: string | null;
  /** Las partes que toca (de las del entregable). */
  partes: string[];
  /** La nota contradice lo que el cliente aceptó: el día en que lo aceptó (AAAA-MM-DD). */
  contradiceLoAceptado: string | null;
}

export const SIN_IMPACTO: ImpactoDeLaNota = { cambia: false, porque: null, partes: [], contradiceLoAceptado: null };

/** Por qué no se llama a la IA (null: se llama). */
export function antesDeLlamar(nota: Pick<NotaDelEquipo, "texto">, e: Pick<EntregableParaElImpacto, "armado" | "piezas">): "sin-entregable" | "nota-corta" | null {
  if (!e.armado || !e.piezas.length) return "sin-entregable";
  if (nota.texto.trim().split(/\s+/).filter(Boolean).length < MIN_PALABRAS_DE_LA_NOTA) return "nota-corta";
  return null;
}

const REGLAS = `Decides si una nota nueva que escribió una persona del equipo de Smarteam (una consultora de HubSpot) cambia un entregable que se le presenta a un cliente. Responde SOLO este JSON:
{"cambia":true|false,"porque":"una frase de hasta 25 palabras, en tuteo, que diga qué cambia y por qué","partes":["<nombre exacto de una parte del entregable>"],"contradiceLoAceptado":true|false}

Cambia SOLO si la nota trae un HECHO nuevo sobre el cliente que el entregable no dice o dice distinto: una cifra (cuánto pierden, cuántos son), un problema o una prioridad, quién decide, algo que ya no aplica o una corrección de lo que dice. NO cambia si repite lo que ya dice, si es una tarea o un recordatorio interno («llamar el lunes», «mandar la propuesta»), si es una opinión sin hecho, o si habla de otra empresa. Ante la duda, no cambia: rehacer cuesta y el vendedor tiene que revisarlo.

El peso de cada cosa (lo de más arriba manda; lo nuevo de más abajo no lo pisa en silencio):
${"{ESCALERA}"}
Una nota del equipo está en el escalón 3: manda sobre lo dicho en una reunión y lo deducido. Si lo que dice choca con lo que el cliente ACEPTÓ, igual puede cambiar, pero marca «contradiceLoAceptado»: true.

«partes»: solo nombres de la lista de partes que te damos, las que tocaría. «porque»: sin nombres de personas, sin markdown.`;

/** El pedido para Claude. */
export function pedidoDelImpacto(nota: NotaDelEquipo, e: EntregableParaElImpacto): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const partes = [...new Set(e.piezas.map((p) => p.parte))];
  const piezas = e.piezas.slice(0, MAX_PIEZAS).map((p) => `- [${p.parte}] ${p.texto.replace(/\s+/g, " ").slice(0, TOPE_DE_UNA_PIEZA)}`);
  const estado = [
    e.publicado ? "Está publicado: el cliente ya ve una versión." : "Todavía no se publicó.",
    e.cliente.presentadaEl ? `Se le presentó al cliente el ${e.cliente.presentadaEl}.` : "Todavía no se le presentó.",
    e.cliente.respuesta?.tipo === "pidio-ajustes" ? `El cliente pidió ajustes: ${e.cliente.respuesta.nota ?? ""}` : "",
  ].filter(Boolean);
  const contenido = [
    `El entregable: ${e.nombre}.`,
    estado.join(" "),
    `Sus partes: ${partes.join(" · ")}`,
    `Lo que dice hoy:\n${piezas.join("\n")}`,
    e.loAceptado,
    `La nota nueva (la escribió ${nota.por ?? "alguien del equipo"} el ${nota.en.slice(0, 10)}):\n${nota.texto.trim().slice(0, TOPE_DE_LA_NOTA)}`,
  ].filter(Boolean);
  return {
    model: MODELO_DEL_IMPACTO,
    max_tokens: MAX_TOKENS_DEL_IMPACTO,
    system: REGLAS.replace("{ESCALERA}", escaleraParaElAgente()),
    messages: [{ role: "user", content: contenido.join("\n\n") }],
  };
}

/**
 * Lee la respuesta con las reglas del código: sin «porque» no cambia; las partes, solo las del entregable (sin ninguna
 * reconocida, «Todo el entregable»); «contradice lo aceptado» solo si el cliente aceptó algo, con SU fecha.
 */
export function leerElImpacto(respuesta: Pick<Anthropic.Messages.Message, "content">, e: Pick<EntregableParaElImpacto, "piezas" | "cliente">): ImpactoDeLaNota {
  const texto = respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const x = parseObject(texto);
  if (!x || x.cambia !== true) return SIN_IMPACTO;
  const porque = typeof x.porque === "string" ? x.porque.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_PORQUE_DEL_IMPACTO) : "";
  if (porque.split(" ").filter(Boolean).length < 3) return SIN_IMPACTO;
  const conocidas = new Map(e.piezas.map((p) => [p.parte.toLowerCase(), p.parte]));
  const partes = [
    ...new Set(
      (Array.isArray(x.partes) ? x.partes : [])
        .filter((p): p is string => typeof p === "string")
        .map((p) => conocidas.get(p.trim().toLowerCase()))
        .filter((p): p is string => !!p),
    ),
  ];
  const aceptado = e.cliente.aceptado;
  return {
    cambia: true,
    porque: porque.replace(/[.\s]+$/, ""),
    partes,
    contradiceLoAceptado: x.contradiceLoAceptado === true && aceptado ? diaEnCostaRica(aceptado.en) : null,
  };
}

/** El aviso de la pantalla: «Esto cambia la página de La escala: <por qué>.» (con la contradicción delante, si la hay). */
export function textoDelAviso(i: ImpactoDeLaNota, nombre: string, diaCorto: (iso: string) => string = (d) => d): string {
  if (!i.cambia || !i.porque) return "";
  const contra = i.contradiceLoAceptado ? `Esto contradice lo que el cliente aceptó el ${diaCorto(i.contradiceLoAceptado)}. ` : "";
  const porque = i.porque.charAt(0).toLowerCase() + i.porque.slice(1);
  return `${contra}Esto cambia ${nombre}: ${porque}.`;
}
