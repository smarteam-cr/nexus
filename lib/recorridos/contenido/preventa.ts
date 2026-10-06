/**
 * Recorridos de la Preventa (`/sales/exploraciones/[id]`), una por pieza del lienzo.
 *
 * El del Resumen es el de la cabecera (la pieza de entrada, sin `?pieza=`); los de Preparación,
 * Exploración y La escala son `porPantalla`: los declara `LienzoDeExploracion` según la pieza
 * abierta. Los ve el área de Ventas (`SALES_AREA_ROLES`).
 */
import type { Recorrido } from "../tipos";

const ROLES = ["VENTAS", "DEV", "CSL", "SUPER_ADMIN"] as const;
const RUTA = /^\/sales\/exploraciones\/[^/]+\/?$/;
const EJEMPLO = "/sales/exploraciones/cmtum4orn00bd07lg0if1q51q";
const LISTADO = "/sales/exploraciones";

const PASO_QUE_SIGUE = {
  ancla: "que-sigue",
  titulo: "Lo próximo que te toca",
  texto: "Siempre arriba a la derecha, con un botón que te lleva a la pieza donde se hace.",
  lado: "left-start",
} as const;

export const PREVENTA_RESUMEN: Recorrido = {
  id: "preventa-resumen",
  version: 1,
  titulo: "Preventa · Resumen",
  descripcion: "Las piezas, el marco de la venta y lo que sugiere el agente",
  rotulo: "Recorrido · Preventa",
  invitacion: {
    titulo: "¿Te muestro cómo se usa la preventa?",
    texto: "Las piezas, lo que hay que saber para proponer y lo que sugiere el agente. Menos de un minuto.",
  },
  ruta: RUTA,
  ejemplo: EJEMPLO,
  irA: { href: LISTADO, aviso: "Abre cualquier preventa y el recorrido arranca solo." },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    {
      ancla: "preventa.riel",
      titulo: "Las piezas de la preventa",
      texto: "En orden, de la preparación a la propuesta. El punto dice cómo va cada una: verde con contenido, ámbar con algo que hacer, azul con sugerencias del agente.",
      lado: "right-start",
    },
    {
      ancla: "preventa.resumen.sugerencias",
      titulo: "Lo que sugirió el agente",
      texto: "Cuántas cosas dejó para estas tarjetas. Revísalas una por una o úsalas todas: nada se confirma solo.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.resumen.marco",
      titulo: "Lo que hay que saber para proponer",
      texto: "Metas, planes, retos, tiempos, presupuesto, quién decide y qué pasa si no actúa. Una tarjeta vacía es algo que falta preguntar; tócala para completarla.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.resumen.casillas",
      titulo: "Objeciones y particularidades",
      texto: "Lo que el cliente dijo que lo frena y lo propio de la cuenta. El agente lo propone al leer cada reunión.",
      lado: "top-start",
    },
    PASO_QUE_SIGUE,
    {
      ancla: "preventa.panel.marco",
      titulo: "El marco, desde cualquier pieza",
      texto: "Las ocho tarjetas en miniatura: verde confirmada, azul sugerida, punteada la que falta.",
      lado: "left-start",
    },
    {
      ancla: "recorrido.boton",
      titulo: "Un recorrido por pieza",
      texto: "Al abrir Preparación, Exploración o La escala, este botón ofrece el recorrido de esa pieza.",
      lado: "bottom-end",
    },
  ],
};

export const PREVENTA_PREPARACION: Recorrido = {
  id: "preventa-preparacion",
  version: 1,
  titulo: "Preventa · Preparación",
  descripcion: "Qué investigó el agente, con quién hablas y cómo abrir la conversación",
  rotulo: "Recorrido · Preparación",
  invitacion: {
    titulo: "¿Te muestro cómo preparar la reunión?",
    texto: "Lo que investigó el agente, con quién vas a hablar y cómo abrir la conversación. Menos de un minuto.",
  },
  ruta: RUTA,
  porPantalla: true,
  ejemplo: EJEMPLO,
  irA: { href: LISTADO, aviso: "Abre una preventa y entra a «Preparación»: el recorrido arranca solo." },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    {
      ancla: "preventa.preparacion.agente",
      titulo: "El agente prepara la reunión",
      texto: "Investiga la empresa en internet, lee HubSpot y el diagnóstico, y te deja propuestos el «por qué ahora», la radiografía y cómo conectar.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.preparacion.resumen",
      titulo: "Lo que escribió la IA",
      texto: "Por qué ahora, cómo está su HubSpot y la radiografía de la empresa, una sola vez y arriba. Lo usas, lo cambias o lo descartas.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.sugerencia",
      titulo: "Una sugerencia en azul",
      texto: "Trae de dónde salió. «Usar» la confirma; «Descartar» la quita.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.preparacion.contacto",
      titulo: "Con quién vas a hablar",
      texto: "Su cargo, correo, teléfono y WhatsApp, y si hizo el diagnóstico.",
      lado: "right-start",
    },
    {
      ancla: "preventa.preparacion.conexion",
      titulo: "Cómo abrir la conversación",
      texto: "Qué le duele, qué le ofrecemos y cómo conectar. Si ya agendó, la estrategia de conexión queda plegada.",
      lado: "left-start",
    },
    PASO_QUE_SIGUE,
  ],
};

export const PREVENTA_EXPLORACION: Recorrido = {
  id: "preventa-exploracion",
  version: 1,
  titulo: "Preventa · Exploración",
  descripcion: "Las sesiones, la guía de antes y lo que salió después",
  rotulo: "Recorrido · Exploración",
  invitacion: {
    titulo: "¿Te muestro cómo llevar las sesiones?",
    texto: "La guía para preparar cada reunión y qué hacer con lo que salió. Menos de un minuto.",
  },
  ruta: RUTA,
  porPantalla: true,
  ejemplo: EJEMPLO,
  irA: { href: LISTADO, aviso: "Abre una preventa y entra a «Exploración»: el recorrido arranca solo." },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    {
      ancla: "preventa.sesiones",
      titulo: "Las sesiones",
      texto: "Cada reunión con el cliente es una sesión: ✓ hecha, ● abierta, y en ámbar si el agente no leyó su reunión. «+ Agregar sesión» planea otra.",
      lado: "right-start",
    },
    {
      ancla: "preventa.sesion.cabecera",
      titulo: "La sesión que miras",
      texto: "Su fecha, su tema o la reunión ligada, y si el agente ya la leyó.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.sesion.momento",
      titulo: "Antes y después",
      texto: "Antes: la guía para preparar la reunión. Después: lo que salió y lo que queda para la próxima.",
      lado: "bottom-end",
    },
    {
      ancla: "preventa.sesion.preguntas",
      titulo: "Las preguntas de la guía",
      texto: "A la izquierda, lo que falta del marco de la venta; a la derecha, lo que falta confirmar de la escala, cada una con sus repreguntas.",
      lado: "top-start",
    },
    {
      ancla: "preventa.sesion.salio",
      titulo: "Lo que salió de la reunión",
      texto: "Lo que el agente sacó, con la frase del cliente, para usar o descartar, y lo que se dijo sin explorar, para llevarlo a la próxima.",
      lado: "top-start",
    },
    {
      ancla: "preventa.sesion.siguiente",
      titulo: "La próxima sesión",
      texto: "El siguiente paso acordado y el botón que crea la próxima sesión con su guía.",
      lado: "top-start",
    },
    {
      ancla: "preventa.objeciones",
      titulo: "Cómo manejar objeciones",
      texto: "A mano en plena reunión: el método, las objeciones de esta empresa y qué hacer si no te deja explorar.",
      lado: "right-end",
    },
  ],
};

export const PREVENTA_ESCALA: Recorrido = {
  id: "preventa-escala",
  version: 2,
  titulo: "Preventa · La escala",
  descripcion: "Dónde parece estar cada equipo y qué conviene trabajar primero",
  rotulo: "Recorrido · La escala",
  invitacion: {
    titulo: "¿Te muestro cómo leer la escala?",
    texto: "Con qué escala se mide, dónde parece estar cada equipo y qué va primero. Menos de un minuto.",
  },
  ruta: RUTA,
  porPantalla: true,
  ejemplo: EJEMPLO,
  irA: { href: LISTADO, aviso: "Abre una preventa y entra a «La escala»: el recorrido arranca solo." },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    {
      ancla: "preventa.escala.edicion",
      titulo: "Con qué se mide",
      texto: "La industria y cómo vende la empresa se eligen solas. Si no calzan, las cambias. Abajo, país y tamaño para comparar después.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.escala.areas",
      titulo: "Las áreas, como pestañas",
      texto: "Cada área con su nivel. La que no está en juego se suma desde su pestaña, y la que está se saca igual de fácil.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.escala.leyenda",
      titulo: "Cómo leer la rueda",
      texto: "Cada porción se pinta hasta su nivel. ✓ es evidencia, ? es hipótesis (en un tono más claro) y el punto azul es algo nuevo del agente.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.escala.mapa",
      titulo: "El área abierta",
      texto: "Dónde parece estar el equipo y por qué está ahí: lo que lo frena.",
      lado: "top-start",
    },
    {
      ancla: "preventa.escala.dimensiones",
      titulo: "Cada dimensión",
      texto: "Pasa el cursor por una celda para ver qué dice la escala de ese nivel. Tócala para ver qué preguntar y elegir el nivel con un clic.",
      lado: "top-start",
    },
    {
      ancla: "preventa.escala.primero",
      titulo: "Qué va primero",
      texto: "Lo que conviene trabajar primero y por qué. Es lo que el prospecto se lleva de la reunión.",
      lado: "top-start",
    },
  ],
};
