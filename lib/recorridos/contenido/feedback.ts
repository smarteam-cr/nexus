/**
 * El recorrido de Feedback (`/feedback`), para dirección: pasa por las cuatro pestañas en orden —Bandeja, Hoja de
 * ruta, Personas y Encuestas— y dice cómo se usa cada una.
 *
 * Cada paso pide su pestaña (`feedback.pestana`, lo escucha `PestanasDeFeedback`; si ya está en ella, no hace nada).
 * Las pestañas viven en `?vista=` y cambiar de una a otra vuelve a pedir la página: por eso el primer y el último paso
 * de cada pestaña —los que se alcanzan cambiando de pestaña, con «Siguiente» o con «Anterior»— esperan más
 * (`ESPERA_AL_CAMBIAR`). En la Hoja de ruta, el último paso abre el primer tema y los demás lo cierran
 * (`feedback.tema`, lo escucha `HojaDeRuta`); en Encuestas, cada paso pide su clase (`feedback.encuestas`, lo escucha
 * `EncuestasDeFeedback`). Así «Anterior» deja la pantalla igual que la primera vez.
 *
 * Pedido de Elías (2026-10-07): un solo recorrido para las cuatro pestañas, como el de la preventa.
 */
import type { AccionDelRecorrido, PasoDelRecorrido, Recorrido } from "../tipos";

type Pestana = "bandeja" | "hoja" | "personas" | "encuestas";
type PasoSinAccion = Omit<PasoDelRecorrido, "accion" | "espera">;

/** Volver a pedir la página tarda más que cambiar algo que ya está. */
const ESPERA_AL_CAMBIAR = 8000;

const tema = (valor: "" | "primero"): AccionDelRecorrido => ({ evento: "feedback.tema", valor });
const clase = (valor: "preguntas" | "automaticas"): AccionDelRecorrido => ({ evento: "feedback.encuestas", valor });

/** Los pasos, con su pestaña y lo que piden adentro de ella. */
const PASOS: readonly { pestana: Pestana; paso: PasoSinAccion; tambien?: AccionDelRecorrido }[] = [
  // ── Bandeja ──
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.boton",
      titulo: "Así llega el feedback",
      texto: "Cualquier persona del equipo reporta desde este botón, en la pantalla en la que está: algo que falla, una mejora o algo que no se entiende, con la captura de lo que ve.",
      lado: "right-end",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.pestanas",
      titulo: "Cuatro pestañas",
      texto: "La Bandeja, para decidir lo que llega; la Hoja de ruta, con lo que se va a hacer; Personas, quién reporta; y Encuestas, lo que le preguntas al equipo. El número es lo que espera por ti.",
      lado: "bottom-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "que-sigue",
      titulo: "Qué sigue",
      texto: "Arriba del panel, lo único que conviene hacer ahora: en la Bandeja, el reporte más viejo sin revisar. Cada pestaña tiene el suyo.",
      lado: "left-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.bandeja.filtros",
      titulo: "Lo que espera una decisión",
      texto: "«Sin revisar» es lo nuevo y «Te respondieron», lo cerrado en lo que la persona volvió a escribir. «Cerrados» queda para buscarlo o deshacerlo.",
      lado: "bottom-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.bandeja.lista",
      titulo: "Los reportes, como un correo",
      texto: "Lo más nuevo arriba; el punto azul es lo que todavía no abriste. Al decidir, el reporte sale de esta lista.",
      lado: "right-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.bandeja.reporte",
      titulo: "El reporte entero",
      texto: "Lo que escribió la persona, la pantalla con lo que marcó, lo que se mandó con ella (la dirección, el navegador, los errores) y la conversación, donde le contestas.",
      lado: "left-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.bandeja.salidas",
      titulo: "Tres salidas",
      texto: "Llevarlo a la hoja de ruta, en un tema nuevo o en uno que ya existe; responder y cerrar; o «No se hará», con un motivo que la persona ve. Le llega en «Para ti».",
      lado: "left-start",
    },
  },
  {
    pestana: "bandeja",
    paso: {
      ancla: "feedback.bandeja.prompt",
      titulo: "Para aplicarlo con Claude Code",
      texto: "«Generar prompt» arma lo que se pidió, dónde se ve y lo que se habló, sin nombres. Lo copias y lo pegas en Claude Code con el proyecto abierto.",
      lado: "left-start",
    },
  },

  // ── Hoja de ruta ──
  {
    pestana: "hoja",
    tambien: tema(""),
    paso: {
      ancla: "feedback.hoja.tablero",
      titulo: "La hoja de ruta",
      texto: "Cada tema junta los reportes que piden lo mismo, en cuatro columnas: Por decidir, Planeado, En curso y Listo. Arriba en cada columna, lo que pidieron más personas.",
      lado: "top",
    },
  },
  {
    pestana: "hoja",
    tambien: tema(""),
    paso: {
      ancla: "feedback.hoja.tarjeta",
      titulo: "Arrastra un tema para cambiarlo de columna",
      texto: "Al pasarlo a «En curso» o a «Listo», a quien lo pidió le llega el aviso. Pasarlo a «Listo» pide confirmación.",
      lado: "right-start",
    },
  },
  {
    pestana: "hoja",
    tambien: tema(""),
    paso: {
      ancla: "feedback.hoja.nuevo",
      titulo: "Un tema sin reporte",
      texto: "Lo que alguien dijo en una reunión también entra: «Nuevo tema» lo crea en la columna que elijas.",
      lado: "bottom-end",
    },
  },
  {
    pestana: "hoja",
    tambien: tema("primero"),
    paso: {
      ancla: "feedback.hoja.tema",
      titulo: "El tema abierto",
      texto: "Qué pide, dónde se nota, sus reportes con la conversación y su columna. «Generar prompt» arma el pedido para Claude Code con todo lo que juntó.",
      lado: "left-start",
    },
  },

  // ── Personas ──
  {
    pestana: "personas",
    paso: {
      ancla: "feedback.personas.numeros",
      titulo: "Cómo va el feedback",
      texto: "Cuántos reportes llegaron, cuántas personas reportaron, cuánto tarda la primera respuesta y cuántos quedaron resueltos, en el período que elijas arriba.",
      lado: "bottom",
    },
  },
  {
    pestana: "personas",
    paso: {
      ancla: "feedback.personas.tabla",
      titulo: "Quién reporta más",
      texto: "Por persona: fallas, mejoras y dudas, y cuántas quedaron resueltas. Debajo, las pantallas que más reportes reciben.",
      lado: "top",
    },
  },
  {
    pestana: "personas",
    paso: {
      ancla: "feedback.personas.callados",
      titulo: "Quién no reporta",
      texto: "Marca a quién preguntarle: el botón te lleva a Encuestas con esas personas ya elegidas.",
      lado: "left-start",
    },
  },

  // ── Encuestas ──
  {
    pestana: "encuestas",
    tambien: clase("preguntas"),
    paso: {
      ancla: "feedback.encuestas.clases",
      titulo: "Dos clases de encuestas",
      texto: "«Tus preguntas» las escribes tú, para quien elijas. «Automáticas» se hacen solas cuando alguien termina algo: «¿cuánto te tomó?».",
      lado: "bottom-start",
    },
  },
  {
    pestana: "encuestas",
    tambien: clase("preguntas"),
    paso: {
      ancla: "feedback.encuestas.nueva",
      titulo: "Nueva pregunta",
      texto: "Escribes qué quieres saber, sobre qué pantalla, a quién y hasta cuándo, y ves la burbuja tal como le aparece a cada persona antes de mandarla.",
      lado: "bottom-end",
    },
  },
  {
    pestana: "encuestas",
    tambien: clase("preguntas"),
    paso: {
      ancla: "feedback.encuestas.preguntas",
      titulo: "Tus preguntas",
      texto: "Cada pregunta es una tarjeta: cuántos contestaron, a quién se le espera y lo que dijo cada uno, que se decide en la Bandeja. Sin preguntas, acá está el paso a paso.",
      lado: "top",
    },
  },
  {
    pestana: "encuestas",
    tambien: clase("preguntas"),
    paso: {
      ancla: "feedback.encuestas.callados",
      titulo: "A quién preguntarle",
      texto: "Quienes no mandaron nada en 30 días. «Preguntarle» abre la pregunta con esa persona ya elegida.",
      lado: "left-start",
    },
  },
  {
    pestana: "encuestas",
    tambien: clase("automaticas"),
    paso: {
      ancla: "feedback.encuestas.automaticas",
      titulo: "Las automáticas",
      texto: "Una por momento, con su interruptor. Nacen pausadas: antes de activarlas, cuéntale al equipo para qué sirven. «Ajustar» dice a quién y cada cuánto.",
      lado: "bottom",
    },
  },
  {
    pestana: "encuestas",
    tambien: clase("automaticas"),
    paso: {
      ancla: "feedback.encuestas.respuestas",
      titulo: "Lo que dicen las respuestas",
      texto: "Con 20 respuestas de un tipo de fase, la carga deja de usar las horas supuestas y usa lo que anotó el equipo. Nunca se muestra por persona.",
      lado: "top",
    },
  },
];

export const FEEDBACK: Recorrido = {
  id: "feedback",
  version: 1,
  titulo: "Feedback",
  descripcion: "Las cuatro pestañas: decidir lo que llega, la hoja de ruta, quién reporta y lo que le preguntas al equipo",
  rotulo: "Recorrido · Feedback",
  invitacion: {
    titulo: "¿Te muestro cómo se usa Feedback?",
    texto: "Las cuatro pestañas: decidir lo que llega, armar la hoja de ruta, ver quién reporta y preguntarle al equipo. Unos dos minutos.",
  },
  ruta: /^\/feedback\/?$/,
  ejemplo: "/feedback",
  irA: { href: "/feedback" },
  grupo: "direccion",
  roles: ["SUPER_ADMIN"],
  pasos: PASOS.map(({ pestana, paso, tambien }, i) => {
    const cambia = PASOS[i - 1]?.pestana !== pestana || PASOS[i + 1]?.pestana !== pestana;
    const accion: AccionDelRecorrido[] = [{ evento: "feedback.pestana", valor: pestana }, ...(tambien ? [tambien] : [])];
    return { ...paso, accion, ...(cambia ? { espera: ESPERA_AL_CAMBIAR } : {}) };
  }),
};
