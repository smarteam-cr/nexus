/**
 * lib/contexto/frontera-de-los-documentos.ts — LA FRONTERA LLEGA A LOS DOCUMENTOS. Puro, client-safe.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────
 * El kickoff, el diagnóstico, la planificación, integraciones y la entrega los lee el CLIENTE. Lo
 * que leen sus agentes del «Contexto adicional» —las reuniones y las notas del CSE— es INTERNO:
 * ahí se habla de precios, de descuentos, de lo que opina el equipo de una persona. Dos defensas,
 * como en el cronograma:
 *
 *  1. LA REGLA (`FRONTERA_DE_LOS_DOCUMENTOS`): viaja DENTRO del bloque de reuniones y del de notas
 *     (lib/contexto/material-del-documento.ts), así ninguno de los siete lectores la puede olvidar
 *     y nadie tiene que repetirla. Los documentos internos (ejecución, exploración) reciben solo la
 *     de puertas adentro (`FRONTERA_INTERNA`): ahí un precio no llega al cliente.
 *  2. LA RED (`lineasConFronteraDeDocumento`): el chat de un documento marca con «⚠ revisa» la
 *     línea del acuerdo que dice de dónde salió o trae un monto. Solo AVISA: el CSE decide.
 *
 * ── POR QUÉ NO ES EL DETECTOR DEL CRONOGRAMA ─────────────────────────────────
 * Usa sus mismas piezas (`diceDeDondeSalio`, `traeUnMonto`, `copiaEn`: una sola normalización),
 * pero marca otra cosa:
 *  · la CITA de una reunión, una nota, la minuta o el kickoff («según la reunión del lunes»,
 *    «confirmado en el kickoff») se marca siempre, en las cinco piezas y también al lado de una
 *    cifra del cliente. Nombrar a una persona como fuente («según Ronald») no la marca: eso lo
 *    cuida solo la regla;
 *  · los MONTOS solo en el kickoff, la planificación e integraciones. En el diagnóstico y la entrega
 *    las cifras del negocio del cliente son contenido legítimo («US$360.000 al año en leads
 *    perdidos»), sin su fuente: marcarlas haría que se aprenda a ignorar el aviso;
 *  · NUNCA fechas ni plazos: en un kickoff o un diagnóstico son contenido. En un título de tarea
 *    no, por eso el cronograma sí los marca;
 *  · la COPIA de una frase del material, solo con huellas. Hoy el chat de documentos no lee
 *    reuniones (lib/asistente/contexto.ts), así que no hay huellas y la copia no corre; queda lista
 *    para cuando entre material al turno.
 *
 * La propuesta comercial y los perfiles de puesto quedan FUERA: ahí los precios los escribe Ventas a
 * mano (Inversión) y su chat no lee reuniones. Su regla de dinero es otra
 * (lib/business-cases/money-brief.ts).
 */
import { pieceBySlug } from "@/lib/pieces/registry";
import {
  MOTIVOS_DE_FUGA,
  avisoDeFronteraEnLaLinea,
  copiaEn,
  diceDeDondeSalio,
  traeUnMonto,
  type CampoDeFrontera,
  type HuellasDeFrontera,
} from "./frontera-del-cronograma";

/**
 * LA REGLA de un documento que lee el cliente. Va delante del bloque de reuniones y del de notas.
 * Redactada PARA EL MODELO, en tuteo.
 *
 * ⛔ En un documento que lee el cliente NUNCA se dice de dónde salió una cosa, tampoco una cifra del
 * negocio del cliente: la cifra va donde la sección la pide, sin nombrar la fuente. La propuesta
 * comercial no pasa por acá: ahí la regla de dinero es otra (lib/business-cases/money-brief.ts).
 */
export const FRONTERA_DE_LOS_DOCUMENTOS =
  "⛔ Este documento lo lee el cliente. De estas reuniones y notas NUNCA pases al documento precios, " +
  "montos, descuentos ni condiciones de lo que cobra Smarteam (aunque se hayan dicho), opiniones " +
  "internas sobre personas, ni de dónde salió cada cosa («según la reunión del lunes»). Lo dicho " +
  "[PUERTAS ADENTRO] es de Smarteam y nunca se le atribuye al cliente. Las cifras del negocio del " +
  "cliente solo van donde la sección las pide, y sin decir de dónde salieron.";

/** La regla de un documento INTERNO (ejecución, exploración): solo la de puertas adentro. */
export const FRONTERA_INTERNA = "⛔ Lo dicho [PUERTAS ADENTRO] es de Smarteam y nunca se le atribuye al cliente.";

/**
 * La regla que corresponde a la pieza. Una pieza que no está en el registro recibe la regla
 * completa: equivocarse por el lado estricto no le muestra nada a nadie.
 */
export function fronteraDeLaPieza(pieza: string): string {
  return pieceBySlug(pieza)?.clientFacing === false ? FRONTERA_INTERNA : FRONTERA_DE_LOS_DOCUMENTOS;
}

/**
 * Las piezas donde el CHAT pasa por la frontera, y si ahí se marcan los montos. Las que no están no
 * aplican: la ejecución y la exploración son internas, y en la propuesta comercial y en un perfil de
 * puesto los precios son de Ventas.
 */
export const REGLAS_DE_FRONTERA_POR_PIEZA: Readonly<Record<string, { montos: boolean }>> = {
  kickoff: { montos: true },
  planning: { montos: true },
  "tech-requirements": { montos: true },
  /* Las cifras del negocio del cliente son contenido legítimo acá: el impacto del diagnóstico, los
     logros de la entrega. */
  diagnosis: { montos: false },
  delivery: { montos: false },
};

/**
 * La línea que el chat del documento lee en TU CONTEXTO (junto a las reglas del editor), o "" si
 * la pieza no aplica. El chat tiene que conocer la regla ANTES de escribir, no enterarse por el aviso.
 */
export function reglaDeFronteraDelChat(pieza: string): string {
  const regla = REGLAS_DE_FRONTERA_POR_PIEZA[pieza];
  if (!regla) return "";
  const base =
    "- ⛔ FRONTERA: lo que escribes lo lee el cliente. No digas de dónde salió cada cosa («según la reunión del " +
    "lunes», «confirmado en el kickoff») ni escribas precios, montos, descuentos o condiciones de lo que cobra Smarteam.";
  return regla.montos
    ? `${base} Si una línea dice de dónde salió o trae un monto, la app la marca con «⚠ revisa».`
    : `${base} Las cifras del negocio del cliente sí van donde la sección las pide, sin decir de dónde salieron. ` +
        "Si una línea dice de dónde salió, la app la marca con «⚠ revisa».";
}

/**
 * El primer motivo por el que `texto` cruza la frontera de ESTE documento, o `null`. `campo` elige
 * la ventana de la copia ("titulo" para títulos y rótulos, "nota" para el resto); la copia solo
 * corre con huellas activas. `montosSiempre`: la regla de los montos corre aunque la pieza no la pida
 * (el chat trae una novedad de una reunión con un monto: un precio dicho en la reunión no puede
 * llegar sin marca a la sección que lee el cliente).
 */
export function fugaEnDocumento(
  texto: string | null | undefined,
  pieza: string,
  h: HuellasDeFrontera | null,
  campo: CampoDeFrontera = "nota",
  montosSiempre = false,
): string | null {
  const regla = REGLAS_DE_FRONTERA_POR_PIEZA[pieza];
  if (!regla || !texto || !texto.trim()) return null;
  if (diceDeDondeSalio(texto)) return MOTIVOS_DE_FUGA.cita;
  if ((regla.montos || montosSiempre) && traeUnMonto(texto)) return MOTIVOS_DE_FUGA.monto;
  if (h?.activa && copiaEn(texto, h, campo)) return MOTIVOS_DE_FUGA.copia;
  return null;
}

/** Lo que una operación del chat escribe y lee el cliente: el texto y con qué ventana se mide. */
type LecturaDelCampo = (o: Record<string, unknown>) => string | null;

const comoTexto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Las operaciones del chat de documentos cuyo texto lee el cliente. Las demás (borrar, mover,
 * ocultar, vaciar) no escriben texto.
 */
export const CAMPO_QUE_LEE_EL_CLIENTE_EN_DOCUMENTOS: Readonly<
  Record<string, { leer: LecturaDelCampo; frontera: CampoDeFrontera }>
> = {
  "seccion.campo": { leer: (o) => comoTexto(o.valor), frontera: "nota" },
  "seccion.texto": { leer: (o) => comoTexto(o.valor), frontera: "nota" },
  "seccion.item.agregar": {
    leer: (o) => {
      if (typeof o.valor === "string") return o.valor;
      if (o.valores && typeof o.valores === "object") {
        const partes = Object.values(o.valores as Record<string, unknown>).filter(
          (v): v is string => typeof v === "string",
        );
        return partes.length ? partes.join(" ") : null;
      }
      return null;
    },
    frontera: "nota",
  },
  "seccion.crear": { leer: (o) => comoTexto(o.titulo), frontera: "titulo" },
  "seccion.renombrar": { leer: (o) => comoTexto(o.titulo), frontera: "titulo" },
  "seccion.rotular": { leer: (o) => comoTexto(o.rotulo), frontera: "titulo" },
};

/**
 * LAS LÍNEAS DEL ACUERDO DEL CHAT DE UN DOCUMENTO, con el aviso de la frontera. Mismo contrato que
 * `lineasConFrontera` del cronograma:
 *
 * ⛔ Devuelve EXACTAMENTE una línea por operación, en el mismo orden: `leerAcuerdo` descarta las
 * líneas que no son una por operación y el botón queda apagado (lib/asistente/acuerdo.ts). Solo les
 * agrega el sufijo «⚠ revisa…» a las que escriben un texto que cruza la frontera. Con una pieza que
 * no aplica, o con largos distintos, las devuelve tal cual. `opts.montos`: los montos se marcan aunque
 * la pieza no lo pida (`fugaEnDocumento` › `montosSiempre`).
 */
export function lineasConFronteraDeDocumento(
  lineas: readonly string[],
  operaciones: readonly unknown[],
  pieza: string,
  h: HuellasDeFrontera | null,
  opts: { montos?: boolean } = {},
): string[] {
  if (!REGLAS_DE_FRONTERA_POR_PIEZA[pieza] || lineas.length !== operaciones.length) return [...lineas];
  return lineas.map((linea, i) => {
    const o = operaciones[i];
    if (!o || typeof o !== "object") return linea;
    const op = (o as { op?: unknown }).op;
    const entrada = typeof op === "string" ? CAMPO_QUE_LEE_EL_CLIENTE_EN_DOCUMENTOS[op] : undefined;
    if (!entrada) return linea;
    const motivo = fugaEnDocumento(entrada.leer(o as Record<string, unknown>), pieza, h, entrada.frontera, opts.montos === true);
    return motivo ? `${linea}${avisoDeFronteraEnLaLinea(motivo)}` : linea;
  });
}
