/**
 * lib/feedback/encuestas.ts — cómo se leen las preguntas que dirección le hace al equipo (2026-10-06). CLIENT-SAFE y puras.
 *
 * Una pregunta se manda a varias personas a la vez y cada una queda como un pedido propio (`FeedbackPedido`). La
 * pestaña Encuestas las muestra juntas: una tarjeta por pregunta, con quién contestó, a quién se le espera y lo que
 * dijo cada uno (diseño «Feedback · Encuestas (v2)»). Acá vive la regla que las junta y lo que se dice de cada una.
 */
import type { PedidoVisible, PersonaParaPreguntar } from "./queries";
import { fechaCorta, pedidoAplica } from "./reglas";

/** Qué pasa con la pregunta para una persona. */
export type EstadoDeLaPersona = "contesto" | "espera" | "ahora_no" | "vencio";

export interface PersonaDeLaPregunta {
  pedidoId: string;
  nombre: string;
  primerNombre: string;
  iniciales: string;
  estado: EstadoDeLaPersona;
  vistoVeces: number;
}

export interface RespuestaDeLaPregunta {
  reporteId: string;
  numero: number;
  cuerpo: string;
  /** Si ya se llevó a la hoja de ruta, se abre en su tema. */
  enTema: boolean;
  nombre: string;
  iniciales: string;
  fecha: string | null;
}

export interface PreguntaAgrupada {
  clave: string;
  pregunta: string;
  pantalla: string;
  ruta: string;
  hasta: string | null;
  /** Cuándo se mandó (el primero de sus pedidos). */
  enviada: string;
  /** Hay alguien a quien todavía le aparece. */
  abierta: boolean;
  /** Cuándo se cerró: la última respuesta o el plazo, el que vino después. null si sigue abierta. */
  cerro: string | null;
  personas: PersonaDeLaPregunta[];
  contestaron: number;
  /** A cuántas personas todavía les aparece. */
  faltan: number;
  respuestas: RespuestaDeLaPregunta[];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function unir(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const primerNombre = (nombre: string) => nombre.split(" ")[0] || nombre;

/** La misma pregunta, mandada en el mismo envío: quién la mandó, el texto, la pantalla y el plazo. */
function claveDe(p: PedidoVisible): string {
  return [p.creadoPor, p.pregunta.trim(), p.ruta, p.hasta?.slice(0, 10) ?? ""].join("|");
}

function estadoDe(p: PedidoVisible, hoy: Date): EstadoDeLaPersona {
  if (p.estado === "respondido") return "contesto";
  if (p.estado === "descartado") return "ahora_no";
  // La misma regla que decide si a la persona le aparece la burbuja: después del plazo ya no la ve.
  return pedidoAplica({ estado: "abierto", ruta: "/", hasta: p.hasta }, "/", hoy) ? "espera" : "vencio";
}

const ORDEN_DE_ESTADO: Record<EstadoDeLaPersona, number> = { contesto: 0, espera: 1, ahora_no: 2, vencio: 3 };

/**
 * Junta los pedidos en preguntas. Abiertas primero (la más nueva arriba), después las cerradas (la que cerró más
 * tarde arriba). Una pregunta está abierta mientras a alguien todavía le aparece.
 */
export function agruparPedidos(pedidos: readonly PedidoVisible[], hoy: Date = new Date()): { abiertas: PreguntaAgrupada[]; cerradas: PreguntaAgrupada[] } {
  const grupos = new Map<string, PedidoVisible[]>();
  for (const p of pedidos) {
    const k = claveDe(p);
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }

  const todas: PreguntaAgrupada[] = [...grupos.entries()].map(([clave, ps]) => {
    const primero = [...ps].sort((a, b) => a.creado.localeCompare(b.creado))[0];
    const personas = ps
      .map((p) => ({
        pedidoId: p.id,
        nombre: p.para.nombre,
        primerNombre: primerNombre(p.para.nombre),
        iniciales: p.para.iniciales,
        estado: estadoDe(p, hoy),
        vistoVeces: p.vistoVeces,
      }))
      .sort((a, b) => ORDEN_DE_ESTADO[a.estado] - ORDEN_DE_ESTADO[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
    const respuestas = ps
      .filter((p) => p.respuesta)
      .map((p) => ({
        reporteId: p.respuesta!.id,
        numero: p.respuesta!.numero,
        cuerpo: p.respuesta!.cuerpo,
        enTema: p.respuesta!.estado === "en_hoja",
        nombre: p.para.nombre,
        iniciales: p.para.iniciales,
        fecha: p.respondidoAt,
      }))
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const faltan = personas.filter((x) => x.estado === "espera").length;
    const abierta = faltan > 0;
    const fechasDeCierre = ps.flatMap((p) => [p.respondidoAt, p.descartadoAt]).filter((f): f is string => !!f);
    if (personas.some((x) => x.estado === "vencio") && primero.hasta) fechasDeCierre.push(primero.hasta);
    return {
      clave,
      pregunta: primero.pregunta,
      pantalla: primero.pantalla,
      ruta: primero.ruta,
      hasta: primero.hasta,
      enviada: primero.creado,
      abierta,
      cerro: abierta ? null : (fechasDeCierre.sort().at(-1) ?? null),
      personas,
      contestaron: personas.filter((x) => x.estado === "contesto").length,
      faltan,
      respuestas,
    };
  });

  return {
    abiertas: todas.filter((g) => g.abierta).sort((a, b) => b.enviada.localeCompare(a.enviada)),
    cerradas: todas.filter((g) => !g.abierta).sort((a, b) => (b.cerro ?? b.enviada).localeCompare(a.cerro ?? a.enviada)),
  };
}

/** «En «Clientes» · enviada el 6 oct · hasta el 14 oct» o «… · cerró el 4 oct». */
export function metaDeLaPregunta(g: PreguntaAgrupada): string {
  const partes = [`En «${g.pantalla}»`, `enviada el ${fechaCorta(g.enviada)}`];
  if (g.abierta) {
    if (g.hasta) partes.push(`hasta el ${fechaCorta(g.hasta)}`);
  } else if (g.cerro) {
    partes.push(`cerró el ${fechaCorta(g.cerro)}`);
  }
  return partes.join(" · ");
}

/** Lo que se dice de una persona al pasar sobre su círculo. */
export function estadoEnTexto(p: PersonaDeLaPregunta): string {
  if (p.estado === "contesto") return `${p.nombre} contestó`;
  if (p.estado === "ahora_no") return `${p.nombre} dijo «Ahora no»`;
  if (p.estado === "vencio") return `${p.nombre} no contestó a tiempo`;
  return p.vistoVeces > 0 ? `${p.nombre}: la vio ${plural(p.vistoVeces, "vez", "veces")}` : `${p.nombre}: todavía no la vio`;
}

/** A quién se le espera, o qué pasó con quien no contestó. Vacío si no hay nada que decir. */
export function textoDeEspera(g: PreguntaAgrupada): string {
  const conNombres = (xs: PersonaDeLaPregunta[], max = 3) =>
    xs.length > max ? `${xs.slice(0, max).map((x) => x.primerNombre).join(", ")} y ${xs.length - max} más` : unir(xs.map((x) => x.primerNombre));
  const ahoraNo = g.personas.filter((x) => x.estado === "ahora_no");
  const vencio = g.personas.filter((x) => x.estado === "vencio");
  const partes: string[] = [];

  if (g.abierta) {
    const esperan = g.personas.filter((x) => x.estado === "espera");
    if (g.contestaron === 0 && ahoraNo.length === 0 && esperan.every((x) => x.vistoVeces === 0)) {
      return esperan.length === 1
        ? `${esperan[0].primerNombre} todavía no la vio: le aparece cuando entre a «${g.pantalla}»`
        : `Nadie la vio todavía: les aparece cuando entren a «${g.pantalla}»`;
    }
    const detalle = (x: PersonaDeLaPregunta) => `${x.primerNombre} (${x.vistoVeces > 0 ? `la vio ${plural(x.vistoVeces, "vez", "veces")}` : "todavía no la vio"})`;
    partes.push(
      esperan.length > 3
        ? `Esperando a ${esperan.slice(0, 3).map(detalle).join(", ")} y ${esperan.length - 3} más`
        : `Esperando a ${unir(esperan.map(detalle))}`,
    );
  } else if (g.contestaron === g.personas.length) {
    return g.personas.length > 1 ? "Contestaron todos" : "";
  }

  if (ahoraNo.length) partes.push(`${conNombres(ahoraNo)} ${ahoraNo.length === 1 ? "dijo" : "dijeron"} «Ahora no»`);
  if (vencio.length) partes.push(`${conNombres(vencio)} no ${vencio.length === 1 ? "contestó" : "contestaron"} a tiempo`);
  return partes.join(" · ");
}

export interface QueSigueDeEncuestas {
  texto: string;
  /** Hay respuestas sin decidir: el recuadro lleva a la Bandeja. */
  aLaBandeja: boolean;
}

/** Lo único que conviene hacer ahora con las preguntas a una persona, en una frase. */
export function queSigueDeEncuestas(
  grupos: { abiertas: readonly PreguntaAgrupada[]; cerradas: readonly PreguntaAgrupada[] },
  equipo: readonly PersonaParaPreguntar[],
  respuestasSinRevisar: number,
): QueSigueDeEncuestas {
  if (respuestasSinRevisar > 0) {
    return {
      texto: `${plural(respuestasSinRevisar, "respuesta espera", "respuestas esperan")} tu decisión en la Bandeja.`,
      aLaBandeja: true,
    };
  }
  const callados = equipo.filter((m) => m.callado).length;
  if (grupos.abiertas.length === 0 && grupos.cerradas.length === 0) {
    return {
      texto:
        callados > 0
          ? "Todavía no le preguntaste nada a nadie. Empieza por alguien que no reporta hace un mes."
          : "Todavía no le preguntaste nada a nadie. Una pregunta concreta sobre una pantalla funciona mejor que «¿algún comentario?».",
      aLaBandeja: false,
    };
  }
  let ignorada: { persona: PersonaDeLaPregunta; pantalla: string } | null = null;
  for (const g of grupos.abiertas) {
    for (const p of g.personas) {
      if (p.estado === "espera" && p.vistoVeces >= 2 && (!ignorada || p.vistoVeces > ignorada.persona.vistoVeces)) ignorada = { persona: p, pantalla: g.pantalla };
    }
  }
  if (ignorada) {
    return {
      texto: `${ignorada.persona.primerNombre} vio ${ignorada.persona.vistoVeces} veces la pregunta de «${ignorada.pantalla}» y no contestó. Si es urgente, pregúntale en persona.`,
      aLaBandeja: false,
    };
  }
  const faltan = grupos.abiertas.reduce((s, g) => s + g.faltan, 0);
  if (faltan > 0) {
    return {
      texto: `${faltan === 1 ? "Una persona todavía no contesta" : `${faltan} personas todavía no contestan`}: les aparece al entrar a la pantalla que elegiste. Nada que hacer por ahora.`,
      aLaBandeja: false,
    };
  }
  if (callados > 0) {
    return {
      texto: `${callados === 1 ? "Una persona no reporta" : `${callados} personas no reportan`} hace 30 días: pregúntale algo concreto a una.`,
      aLaBandeja: false,
    };
  }
  return { texto: "Nadie te debe una respuesta.", aLaBandeja: false };
}

/** Cuántas respuestas a preguntas todavía no se decidieron en la Bandeja. */
export function respuestasSinRevisar(pedidos: readonly PedidoVisible[]): number {
  return pedidos.filter((p) => p.respuesta?.estado === "sin_revisar").length;
}

/** Preguntas para empezar: concretas y sobre algo que la persona hace todas las semanas. */
export const IDEAS_DE_PREGUNTA: readonly { corta: string; texto: string }[] = [
  { corta: "Lo que haces fuera de Nexus", texto: "¿Qué haces todavía fuera de Nexus antes de una reunión con un cliente?" },
  { corta: "Lo que costó entender", texto: "¿Qué te costó entender la primera vez que abriste esta pantalla?" },
  { corta: "Una sola cosa que cambiarías", texto: "Si pudieras cambiar una sola cosa de esta pantalla, ¿cuál sería?" },
];
