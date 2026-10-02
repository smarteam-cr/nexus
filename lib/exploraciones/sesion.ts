/**
 * lib/exploraciones/sesion.ts — el guion de las dos reuniones de una exploración. PURO.
 *
 * Decisión de Elías (2026-09-30): DOS reuniones.
 *   1. La revisión del diagnóstico (30 min). La agenda el prospecto desde el test, que le promete
 *      «una sesión de trabajo, no una llamada de ventas: te llevas el plan aunque no trabajemos
 *      juntos». Por eso no hay producto en esta: se valida el test, se sacan las metas y se le
 *      muestra qué va primero.
 *   2. La exploración a fondo (45 a 60 min), con el portal abierto y con quien decide.
 *
 * El portal va en la segunda, con la meta ya dicha: así se mira con un propósito. El producto,
 * cinco minutos como máximo y solo para un reto que el cliente ya nombró (el caso que originó esto
 * gastó quince en una demo de funciones y terminó en una propuesta sin cifras del negocio).
 *
 * Las preguntas de cada DIMENSIÓN no están acá: salen de la escala de la industria (fuente única).
 * Acá viven las preguntas del marco, en lenguaje llano, y el orden y los tiempos.
 */
import type { ClaveDeCasilla } from "./casillas";

export type IdDeReunion = "revision" | "fondo";

/** Qué parte del lienzo llena un paso: casillas, el nivel de las dimensiones o lo que pide Funcional. */
export type LoQueLlena = ClaveDeCasilla | "nivel" | "areas" | "aExplorar" | "falta" | "plan";

export interface PasoDelGuion {
  /** Estable: es la clave de la nota rápida del paso. */
  id: string;
  titulo: string;
  minutos: number;
  /** Qué se busca, en una línea. */
  objetivo: string;
  /** Preguntas sugeridas (las de las dimensiones las agrega la pantalla desde la escala). */
  preguntas: string[];
  /** Una advertencia del paso, cuando hay una que el caso real enseñó. */
  ojo?: string;
  llena: LoQueLlena[];
  /** El paso usa las dimensiones: todas las del área (validar el test) o las elegidas para profundizar. */
  dimensiones?: "todas" | "elegidas" | "sumadas";
  opcional?: boolean;
}

export interface Reunion {
  id: IdDeReunion;
  titulo: string;
  /** Duración de referencia, en minutos. */
  duracion: number;
  /** Lo que hay que saber antes de entrar. */
  promesa: string;
  pasos: PasoDelGuion[];
}

export const REUNIONES: readonly Reunion[] = [
  {
    id: "revision",
    titulo: "Reunión 1 — La revisión del diagnóstico",
    duracion: 30,
    promesa:
      "El test le prometió una sesión de trabajo, no una llamada de ventas, y que se lleva su plan aunque no trabajemos juntos. Nada de producto en esta reunión.",
    pasos: [
      {
        id: "r1-apertura",
        titulo: "Apertura",
        minutos: 3,
        objetivo: "Recordar la promesa y saber quién está.",
        preguntas: [
          "Esta es una sesión de trabajo: te vas a llevar tu plan aunque no trabajemos juntos. ¿Te parece?",
          "¿Quién más está en la llamada y qué papel tiene en esto?",
        ],
        llena: ["autoridad"],
      },
      {
        id: "r1-test",
        titulo: "El test, en vivo",
        minutos: 10,
        objetivo: "Validar o rehacer el resultado del test, empezando por las dimensiones más bajas.",
        preguntas: [
          "¿Qué tan real sentiste el resultado del test?",
          "De lo que contestaste, ¿qué no estabas seguro de cómo responder?",
          "Muéstrame el último caso real de esto: ¿cómo pasó?",
        ],
        ojo: "Si dice que el test no le parece real, no es «no pasa nada»: es la señal de rehacerlo ahí mismo, con la pregunta de cada dimensión. Si aparece otra área (algo que paga sin usar, algo que menciona), se suma.",
        llena: ["nivel", "areas"],
        dimensiones: "todas",
      },
      {
        id: "r1-metas",
        titulo: "Metas y consecuencias",
        minutos: 10,
        objetivo: "Adónde quiere llegar, en cifras, y qué pasa si no llega.",
        preguntas: [
          "¿Qué quieres lograr este año? ¿De cuánto a cuánto, y para cuándo?",
          "¿Qué han intentado para llegar?",
          "¿Qué los frena hoy?",
          "Si esto sigue igual seis meses más, ¿qué pasa? ¿Cuánto les cuesta?",
          "Si lo logran, ¿qué cambia para el negocio?",
        ],
        ojo: "Sin al menos una meta en cifras, la propuesta solo se puede comparar contra el precio de otra herramienta.",
        llena: ["metas", "planes", "retos", "tiempos", "consecuencias", "implicaciones"],
      },
      {
        id: "r1-plan",
        titulo: "Su plan",
        minutos: 4,
        objetivo: "Mostrarle qué va primero y por qué, como lo dice la escala. Es lo que se lleva.",
        preguntas: ["Con lo que me contaste, lo primero que yo trabajaría es esto, y te digo por qué."],
        llena: ["plan"],
      },
      {
        id: "r1-cierre",
        titulo: "Cierre",
        minutos: 3,
        objetivo: "Agendar ahí mismo la segunda reunión, con su portal abierto y con quien decide.",
        preguntas: [
          "Para aterrizar esto necesito ver tu portal contigo. ¿Lo vemos el día…? ¿Quién más debería estar?",
        ],
        llena: ["siguientePaso"],
      },
    ],
  },
  {
    id: "fondo",
    titulo: "Reunión 2 — La exploración a fondo",
    duracion: 55,
    promesa:
      "Con la meta ya dicha y el portal abierto. Solo las dimensiones elegidas; lo demás lo verifica el CSE en su diagnóstico.",
    pasos: [
      {
        id: "r2-apertura",
        titulo: "Apertura",
        minutos: 5,
        objetivo: "Repasar la meta y el plan de la primera; confirmar quién está.",
        preguntas: [
          "La última vez me dijiste que tu meta es… ¿Sigue siendo así?",
          "¿Quién más tiene que estar de acuerdo para avanzar? ¿A quién más le cambia el día a día?",
        ],
        llena: ["autoridad"],
      },
      {
        id: "r2-areas",
        titulo: "Las áreas que se sumaron",
        minutos: 10,
        objetivo: "Estimar las 8 dimensiones de cada área que se sumó, con la pregunta de cada una.",
        preguntas: [],
        llena: ["nivel"],
        dimensiones: "sumadas",
      },
      {
        id: "r2-profundizar",
        titulo: "Profundizar, con el portal abierto",
        minutos: 20,
        objetivo: "Solo las dimensiones elegidas: qué les falta para Funcional, y mirarlo en el portal.",
        preguntas: [
          "Muéstrame el último caso real: ¿dónde quedó registrado?",
          "¿Quién configuró esto? ¿Está documentado en algún lado?",
        ],
        ojo: "Lo que pide Funcional es una guía de conversación para saber qué falta: no se cuenta y no cambia el nivel estimado.",
        llena: ["falta", "portal", "noExplorado"],
        dimensiones: "elegidas",
      },
      {
        id: "r2-producto",
        titulo: "Producto",
        minutos: 5,
        objetivo: "Opcional. Solo para mostrar cómo se resuelve un reto que el cliente ya nombró.",
        preguntas: ["Me dijiste que te frena… Déjame mostrarte en dos minutos cómo se ve resuelto."],
        ojo: "Si no hay una meta clara, no se muestra producto: se vuelve a las metas.",
        llena: ["producto"],
        opcional: true,
      },
      {
        id: "r2-decision",
        titulo: "Presupuesto y decisión",
        minutos: 10,
        objetivo: "Rango de inversión, quién aprueba, a quién más afecta, cómo y cuándo deciden.",
        preguntas: [
          "¿Tienen un rango de inversión pensado para esto, o contra qué lo van a comparar?",
          "¿Quién da el visto bueno final? ¿Cómo deciden y para cuándo?",
          "Además de ti, ¿a quién le cambia el trabajo si esto sale?",
          "¿Quieres que te acompañemos a crecer después, o te alcanza con una buena implementación?",
        ],
        llena: ["presupuesto", "autoridad", "tiempos", "apertura"],
      },
      {
        id: "r2-cierre",
        titulo: "Cierre",
        minutos: 5,
        objetivo: "Resumir lo entendido y agendar la presentación de la propuesta.",
        preguntas: ["Te resumo lo que entendí… ¿Me falta algo? ¿Te presento la propuesta el día…?"],
        llena: ["siguientePaso"],
      },
    ],
  },
];

/**
 * Los minutos de cada paso para una reunión de otra duración: se ajustan en la misma proporción,
 * redondeados al minuto y nunca en cero. La suma puede correrse un minuto por el redondeo.
 */
export function minutosPara(reunion: Reunion, duracion: number): number[] {
  const factor = duracion / reunion.duracion;
  return reunion.pasos.map((p) => Math.max(1, Math.round(p.minutos * factor)));
}

export function reunionPorId(id: IdDeReunion): Reunion {
  const r = REUNIONES.find((x) => x.id === id);
  if (!r) throw new Error(`Reunión desconocida: ${id}`);
  return r;
}
