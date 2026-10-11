/**
 * lib/seguimiento/hechos/salida.ts — LEER Y VERIFICAR lo que devolvió el modelo en `registrar_hechos`. PURO.
 *
 * «El código verifica las citas y descarta lo que no aparece» (plan de la memoria de la cuenta, §4, paso 4):
 *   · Cada cita se busca TAL CUAL en lo que se le mandó al modelo, con la misma regla que el resto de Nexus
 *     (`citaEstaEnLasFuentes`, lib/timeline/limites.ts: sin tildes, comillas ni espacios dobles, 12 caracteres útiles o
 *     más). Lo que no aparece se descarta con su motivo: un hecho con una cita inventada haría cambiar un documento por
 *     algo que nadie dijo.
 *   · En la transcripción, la cita tiene que estar dentro de UN turno: una frase que junta lo que dijeron dos personas
 *     no es de nadie. Y el turno dice QUIÉN la dijo: eso manda sobre lo que escribió el modelo.
 *   · Una persona del equipo de Smarteam no es gente del cliente (`sinGenteDeSmarteam`, lib/clients/ficha-pedido.ts).
 *   · Una frase con voseo se descarta: llega a una novedad que lee el equipo.
 *   · Un P# que no está en la lista pasa a «cuenta».
 *   · Si la respuesta se cortó (`stop_reason: "max_tokens"`), se queda con los ítems completos y avisa con `cortada`.
 *
 * `huellaDeHecho` deja agrupar el mismo hecho dicho en dos reuniones sin volver a mandarlo a ningún lado.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { sinGenteDeSmarteam } from "@/lib/clients/ficha-pedido";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { HERRAMIENTA_DE_HECHOS, SIN_GRAVEDAD, SIN_TEMA } from "./pedido";
import type { TextoDeLaReunion } from "./texto";
import {
  LARGO_CITA,
  MAX_HECHOS_POR_REUNION,
  esAmbito,
  esGravedad,
  esTemaDeAcuerdo,
  esTipoDeLaLista,
  type AmbitoDeHecho,
  type FuenteDelTexto,
  type HechoLeido,
  type HechoVerificado,
  type MotivoDeDescarte,
  type QuienDijo,
  type TipoDeHecho,
} from "./tipos";

/* ── La huella ─────────────────────────────────────────────────────────────────────────── */

/** Las palabras que no dicen de qué se trata un hecho. Solo conectores: nunca un nombre propio ni un sustantivo. */
const PALABRAS_VACIAS = new Set([
  "para", "como", "pero", "porque", "sobre", "entre", "cuando", "donde", "desde", "hasta", "tambien", "todos", "todas",
  "este", "esta", "esto", "estos", "estas", "otro", "otra", "otros", "otras", "cada", "solo", "mismo", "misma", "unos",
  "unas", "ellos", "ellas", "hacer", "tiene", "tienen", "estan", "sera", "seria", "puede", "pueden", "debe",
  "deben", "quiere", "quieren", "antes", "despues", "luego", "ahora", "menos", "bien", "hace",
]);

/** Las palabras con contenido de una frase: sin tildes, en minúsculas, de 4 letras o más, sin repetir y en orden. */
export function palabrasConContenido(frase: string): string[] {
  const palabras = frase
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-zñ0-9]+/)
    .filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p));
  return [...new Set(palabras)].sort();
}

/** El tipo, el tema y las palabras con contenido de la frase: igual para el mismo hecho dicho con otras mayúsculas o tildes. */
export function huellaDeHecho(tipo: TipoDeHecho, tema: string | null | undefined, frase: string): string {
  return `${tipo}${tema ? `:${tema}` : ""}|${palabrasConContenido(frase).join(" ")}`;
}

/* ── El texto contra el que se verifica ────────────────────────────────────────────────── */

export interface TextoParaVerificar {
  /** Cada parte de lo que se mandó, normalizada una sola vez. */
  partes: { fuente: FuenteDelTexto; normalizado: string }[];
  /** Los turnos de la conversación, normalizados: para saber si la cita es de un solo hablante y quién es. */
  turnos: { hablante: string; normalizado: string }[];
  /** Los nombres de quienes hablaron, normalizados: para sacar un «Nombre:» que el modelo copió de más. */
  hablantes: Set<string>;
  /** Lo dicho seguido, sin números ni nombres: para reconocer una cita que pega el final de un turno con el siguiente. */
  dichoSeguido: string;
}

/** Normaliza el texto una vez (son hasta 60.000 caracteres, y se mira por cada cita). */
export function prepararParaVerificar(t: TextoDeLaReunion): TextoParaVerificar {
  const turnos = t.turnos.map((x) => ({ hablante: x.hablante, normalizado: normalizarParaCita(x.texto) }));
  return {
    partes: t.partes.map((p) => ({ fuente: p.fuente, normalizado: normalizarParaCita(p.texto) })),
    turnos,
    hablantes: new Set(t.turnos.map((x) => normalizarParaCita(x.hablante))),
    dichoSeguido: turnos.map((x) => x.normalizado).join(" "),
  };
}

/** Saca de la cita lo que no se dijo: «[12] » y el «Nombre:» de quien habla, si el modelo los copió. */
export function limpiarCita(cita: string, hablantes: ReadonlySet<string>): string {
  let c = cita.trim().replace(/^["“«']+|["”»']+$/g, "").trim();
  c = c.replace(/^\[\d+\]\s*/, "");
  const m = /^([^:\n]{2,60}):\s+([\s\S]+)$/.exec(c);
  if (m && hablantes.has(normalizarParaCita(m[1]))) c = m[2];
  return c.trim();
}

const normalizarNombre = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-zñ ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * ¿Quien habla es del equipo de Smarteam? true con el nombre y el apellido de alguien del equipo; false con dos
 * palabras o más que no calzan; null con un solo nombre que coincide con el de alguien del equipo (no se sabe).
 */
export function hablanteDelEquipo(hablante: string, equipo: readonly string[]): boolean | null {
  const palabras = new Set(normalizarNombre(hablante).split(" ").filter(Boolean));
  if (!palabras.size) return null;
  const personas = equipo.map((n) => normalizarNombre(n).split(" ").filter(Boolean)).filter((t) => t.length >= 1);
  if (personas.some((t) => t.length >= 2 && palabras.has(t[0]) && palabras.has(t[t.length - 1]))) return true;
  if (palabras.size === 1 && personas.some((t) => palabras.has(t[0]))) return null;
  return false;
}

/* ── Leer la respuesta ─────────────────────────────────────────────────────────────────── */

export interface HechoDescartado {
  motivo: MotivoDeDescarte;
  /** Lo que devolvió el modelo (lo que se pudo leer). */
  hecho: Partial<HechoLeido>;
}

export interface SalidaDeHechos {
  hechos: HechoVerificado[];
  descartados: HechoDescartado[];
  /** La respuesta se cortó (`max_tokens`): faltan hechos del final. */
  cortada: boolean;
  /** El modelo llamó a la herramienta. Sin eso no hay hechos, pero tampoco es «no hubo hechos». */
  llamoLaHerramienta: boolean;
}

export interface OpcionesDeLaSalida {
  texto: TextoParaVerificar;
  /** Los proyectos del pedido, por su ref (P1, P2…). */
  proyectosPorRef: ReadonlyMap<string, { id: string }>;
  /** Los nombres del equipo de Smarteam (activos y de baja). */
  equipoSmarteam: readonly string[];
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cadena = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Crudo = { tipo: TipoDeHecho | null; raw: Record<string, unknown> };

/** Un ítem crudo → HechoLeido, o null si le falta lo indispensable. Lo que leyó, también para el descarte. */
function leerItem(c: Crudo): { hecho: HechoLeido | null; parcial: Partial<HechoLeido> } {
  const r = c.raw;
  const tipo = c.tipo ?? (esTipoDeLaLista(r.tipo) ? r.tipo : null);
  const frase = cadena(r.frase);
  const cita = cadena(r.cita);
  const ambitoCrudo = cadena(r.ambito);
  const ambito: AmbitoDeHecho = esAmbito(ambitoCrudo) ? ambitoCrudo : "cuenta";
  const quien: QuienDijo = r.quien === "cliente" || r.quien === "smarteam" ? r.quien : null;
  const parcial: Partial<HechoLeido> = { ...(tipo ? { tipo } : {}), frase, cita, ambito, quien };
  if (!tipo || !frase || !cita) return { hecho: null, parcial };
  const hecho: HechoLeido = { tipo, frase, cita, ambito, quien };
  if (tipo === "acuerdo" && r.tema !== SIN_TEMA && esTemaDeAcuerdo(r.tema)) hecho.tema = r.tema;
  if (tipo === "queja" || tipo === "riesgo") hecho.gravedad = r.gravedad !== SIN_GRAVEDAD && esGravedad(r.gravedad) ? r.gravedad : "media";
  return { hecho, parcial: { ...parcial, ...hecho } };
}

/** Dónde aparece la cita: la parte, y (en la conversación) el turno. null si no aparece. */
function ubicarCita(
  cita: string,
  texto: TextoParaVerificar,
): { fuente: FuenteDelTexto; turno: { hablante: string } | null; deVariosHablantes: boolean } | null {
  for (const parte of texto.partes) {
    if (!citaEstaEnLasFuentes(cita, parte.normalizado)) continue;
    if (parte.fuente !== "transcripcion" || !texto.turnos.length) return { fuente: parte.fuente, turno: null, deVariosHablantes: false };
    const turno = texto.turnos.find((t) => citaEstaEnLasFuentes(cita, t.normalizado)) ?? null;
    return { fuente: parte.fuente, turno, deVariosHablantes: !turno };
  }
  // Pega el final de un turno con el siguiente (sin el nombre de quien habla en el medio): está en la reunión, pero no
  // la dijo una sola persona.
  if (texto.dichoSeguido && citaEstaEnLasFuentes(cita, texto.dichoSeguido)) return { fuente: "transcripcion", turno: null, deVariosHablantes: true };
  return null;
}

/**
 * Lee la respuesta del modelo y verifica cada hecho. No lanza: lo que no se puede usar va a `descartados` con su motivo.
 */
export function leerSalidaDeHechos(respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">, o: OpcionesDeLaSalida): SalidaDeHechos {
  const cortada = respuesta.stop_reason === "max_tokens";
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_HECHOS);
  if (!bloque || bloque.type !== "tool_use") return { hechos: [], descartados: [], cortada, llamoLaHerramienta: false };

  const input = objeto(bloque.input);
  // En el orden en que el modelo los escribe (el del esquema): si se cortó, lo último de la última lista con algo es lo
  // que puede haber quedado a medias.
  const listas: Crudo[][] = [
    lista(input.hechos).map((x) => ({ tipo: null, raw: objeto(x) })),
    lista(input.senal_cronograma).map((x) => ({ tipo: "senal_cronograma" as const, raw: objeto(x) })),
    lista(input.senal_etapa).map((x) => ({ tipo: "senal_etapa" as const, raw: objeto(x) })),
  ];
  const descartados: HechoDescartado[] = [];
  if (cortada) {
    const ultima = [...listas].reverse().find((l) => l.length > 0);
    const item = ultima?.pop();
    if (item) descartados.push({ motivo: "cortado", hecho: leerItem(item).parcial });
  }

  const vistos = new Set<string>();
  const hechos: HechoVerificado[] = [];
  for (const items of listas) {
    let aceptados = 0;
    for (const item of items) {
      const { hecho, parcial } = leerItem(item);
      const descartar = (motivo: MotivoDeDescarte) => descartados.push({ motivo, hecho: parcial });
      if (!hecho) {
        descartar("incompleto");
        continue;
      }
      const cita = limpiarCita(hecho.cita, o.texto.hablantes);
      const largo = normalizarParaCita(cita).replace(/[.…]+$/, "").trim().length;
      if (largo < LARGO_CITA[0]) {
        descartar("cita_corta");
        continue;
      }
      if (largo > LARGO_CITA[1]) {
        descartar("cita_larga");
        continue;
      }
      if (voseoEnProsa(hecho.frase).length) {
        descartar("voseo");
        continue;
      }
      if (hecho.tipo === "persona" && !sinGenteDeSmarteam(`- ${hecho.frase}`, o.equipoSmarteam).trim()) {
        descartar("persona_de_smarteam");
        continue;
      }
      const donde = ubicarCita(cita, o.texto);
      if (!donde) {
        descartar("cita_no_aparece");
        continue;
      }
      if (donde.deVariosHablantes) {
        descartar("cita_de_varios_hablantes");
        continue;
      }
      // El turno dice quién habló; con un solo nombre que podría ser de los dos lados, vale lo que dijo el modelo.
      const delEquipo = donde.turno ? hablanteDelEquipo(donde.turno.hablante, o.equipoSmarteam) : null;
      const quien: QuienDijo = delEquipo === true ? "smarteam" : delEquipo === false ? "cliente" : hecho.quien;
      const proyecto = hecho.ambito === "cuenta" ? undefined : o.proyectosPorRef.get(hecho.ambito);
      const ambito: AmbitoDeHecho = proyecto ? hecho.ambito : "cuenta";
      const huella = huellaDeHecho(hecho.tipo, hecho.tema, hecho.frase);
      const clave = `${ambito}|${huella}`;
      if (vistos.has(clave)) {
        descartar("repetido");
        continue;
      }
      if (aceptados >= MAX_HECHOS_POR_REUNION) {
        descartar("sobra");
        continue;
      }
      vistos.add(clave);
      aceptados++;
      hechos.push({
        ...hecho,
        cita,
        ambito,
        quien,
        projectId: proyecto?.id ?? null,
        huella,
        fuenteDeLaCita: donde.fuente,
        hablante: donde.turno?.hablante ?? null,
        quienComprobado: delEquipo !== null,
      });
    }
  }
  return { hechos, descartados, cortada, llamoLaHerramienta: true };
}
