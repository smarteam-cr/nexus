/**
 * Recorridos de la Preventa: el del listado (`/sales/exploraciones`) y el de una preventa
 * (`/sales/exploraciones/[id]`), que pasa por TODAS sus piezas en orden: Resumen, Preparación,
 * Exploración (con los tres momentos de la sesión), La escala, Casos de uso y Propuesta.
 *
 * Cada paso pide su pieza (`preventa.pieza`, lo escucha `LienzoDeExploracion`) y, en Exploración, el
 * momento de la sesión (`preventa.momento`, lo escucha `SesionesDeExploracion`). Así «Anterior» deja
 * la pantalla igual que la primera vez. Los pasos del riel y del panel no piden nada: se ven en
 * cualquier pieza. Mientras corre el recorrido, abrir Preparación o Casos de uso no despierta al
 * agente (se abrieron para mostrarlas, no para trabajarlas).
 *
 * Hasta el 2026-10-06 eran cuatro recorridos, uno por pieza (`preventa-resumen`, `-preparacion`,
 * `-exploracion` y `-escala`): Elías pidió uno solo con todas las piezas. Los ve el área de Ventas
 * (`SALES_AREA_ROLES`).
 */
import type { AccionDelRecorrido, Recorrido } from "../tipos";

// CSE desde el 2026-10-06: todo Customer Success trabaja las preventas (permiso `preventa`).
const ROLES = ["VENTAS", "DEV", "CSL", "CSE", "SUPER_ADMIN"] as const;
const RUTA = /^\/sales\/exploraciones\/[^/]+\/?$/;
const EJEMPLO = "/sales/exploraciones/cmtum4orn00bd07lg0if1q51q";
const LISTADO = "/sales/exploraciones";

type Pieza = "resumen" | "preparacion" | "exploracion" | "escala" | "casos" | "propuesta";
const pieza = (valor: Pieza): AccionDelRecorrido => ({ evento: "preventa.pieza", valor });
const momento = (valor: "antes" | "durante" | "despues"): readonly AccionDelRecorrido[] => [pieza("exploracion"), { evento: "preventa.momento", valor }];
/** Preparación tiene dos pestañas desde el 2026-10-06 (la escucha PasoPreparacion). */
const preparacion = (valor: "identificacion" | "conexion"): readonly AccionDelRecorrido[] => [pieza("preparacion"), { evento: "preventa.preparacion", valor }];

export const PREVENTA: Recorrido = {
  id: "preventa",
  // 2 (2026-10-06): Preparación en dos pestañas, la investigación de la industria y las fichas.
  // 3 (2026-10-07): las sesiones rediseñadas (objetivo, guía en tramos, Durante con preguntas, lo que leyó el agente).
  // 4 (2026-10-07): las pestañas de la sesión se llaman Preparación, En vivo y Análisis; la guía dice si está al día.
  version: 4,
  titulo: "Una preventa",
  descripcion: "Todas sus piezas, de la preparación a la propuesta",
  rotulo: "Recorrido · Preventa",
  invitacion: {
    titulo: "¿Te muestro cómo se usa la preventa?",
    texto: "Todas sus piezas, de la preparación a la propuesta, con lo que hace el agente en cada una. Unos dos minutos.",
  },
  ruta: RUTA,
  // Siempre desde el principio, sin importar qué pieza esté abierta.
  alArrancar: [pieza("resumen")],
  ejemplo: EJEMPLO,
  irA: { href: LISTADO, aviso: "Abre cualquier preventa y el recorrido arranca solo." },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    // Resumen
    {
      ancla: "preventa.riel",
      titulo: "Las piezas de la preventa",
      texto: "De la preparación a la propuesta, en orden. El punto dice cómo va cada una: verde con contenido, ámbar con algo que hacer y azul con sugerencias del agente.",
      lado: "right-start",
    },
    {
      ancla: "preventa.resumen.marco",
      titulo: "Resumen: lo que hay que saber para proponer",
      texto: "Metas, planes, retos, tiempos, presupuesto, quién decide y qué pasa si no actúa. Una tarjeta vacía es algo que falta preguntar; tócala para completarla.",
      lado: "top",
      accion: pieza("resumen"),
    },
    {
      ancla: "preventa.resumen.casillas",
      titulo: "Objeciones y particularidades",
      texto: "Lo que el cliente dijo que lo frena y lo propio de la cuenta. El agente lo propone al leer cada reunión.",
      lado: "top",
      accion: pieza("resumen"),
    },
    {
      ancla: "que-sigue",
      titulo: "Lo próximo que te toca",
      texto: "A la derecha, en cualquier pieza, con un botón que te lleva a donde se hace.",
      lado: "left-start",
    },
    {
      ancla: "preventa.panel.marco",
      titulo: "El marco, de un vistazo",
      texto: "Las ocho tarjetas en miniatura: verde la confirmada, azul la sugerida y punteada la que falta.",
      lado: "left-start",
    },
    // Preparación
    {
      ancla: "preventa.preparacion.agente",
      titulo: "Preparación: el agente investiga",
      texto: "Busca la empresa en internet, lee HubSpot y el test, y te deja sugeridos el «por qué ahora», la radiografía y cómo conectar.",
      lado: "bottom-start",
      accion: pieza("preparacion"),
    },
    {
      ancla: "preventa.preparacion.resumen",
      titulo: "Lo que escribió la IA, arriba",
      texto: "Por qué ahora, su CRM, la radiografía de la empresa y su industria. Cada sugerencia dice de dónde salió: «Usar» la confirma y «Descartar» la quita.",
      lado: "top",
      accion: preparacion("identificacion"),
    },
    {
      ancla: "preventa.preparacion.contacto",
      titulo: "Con quién vas a hablar",
      texto: "La ficha de contacto: su cargo, correo, teléfono y WhatsApp, y si hizo el test. Al lado, la ficha de la empresa.",
      lado: "right-start",
      accion: preparacion("identificacion"),
    },
    {
      ancla: "preventa.preparacion.conexion",
      titulo: "Cómo abrir la conversación",
      texto: "La pestaña Conexión: lo que no se dijo arriba, la hipótesis de valor (cada idea con de dónde sale) y cómo conectar. Si ya agendó, la estrategia de conexión queda plegada.",
      lado: "top",
      accion: preparacion("conexion"),
    },
    // Exploración
    {
      ancla: "preventa.sesiones",
      titulo: "Exploración: una sesión por reunión",
      texto: "Cada reunión con el cliente es una sesión: ✓ la hecha, ● la que miras y ● en ámbar la que no dejó qué leer. «+ Agregar sesión» planea otra.",
      lado: "right-start",
      accion: pieza("exploracion"),
    },
    {
      ancla: "preventa.sesion.momento",
      titulo: "Preparación, en vivo y análisis",
      texto: "Cada sesión tiene tres pestañas: la guía para prepararla, lo que anotas mientras ocurre y lo que salió de la reunión.",
      lado: "bottom-end",
      accion: pieza("exploracion"),
    },
    {
      ancla: "preventa.sesion.preguntas",
      titulo: "Preparación: la guía de la sesión",
      texto: "Arriba dice si la guía está al día y qué cambió. Abrir, preguntar y cerrar: «En orden» sigue la conversación; «Por sección» separa la arquitectura de la venta y la escala.",
      lado: "top",
      accion: momento("antes"),
    },
    {
      ancla: "preventa.sesion.notas",
      titulo: "En vivo: tus notas",
      texto: "Marca cada pregunta hecha y anota lo que respondió; lo demás va acá. Se guarda solo, y el agente lo lee como tu nota, no como palabras del cliente.",
      lado: "top",
      accion: momento("durante"),
    },
    {
      ancla: "preventa.sesion.salio",
      titulo: "Análisis: lo que salió",
      texto: "Lo que leyó el agente: qué se habló, qué se respondió de lo planeado y lo que sugiere. Lo que quedó abierto se lleva a la próxima sesión con una casilla.",
      lado: "top",
      accion: momento("despues"),
    },
    {
      ancla: "preventa.objeciones",
      titulo: "Cómo manejar objeciones",
      texto: "A mano en plena reunión: el método, las objeciones de esta empresa y qué hacer si no te deja explorar.",
      lado: "right-end",
    },
    // La escala
    {
      ancla: "preventa.escala.edicion",
      titulo: "La escala: con qué se mide",
      texto: "La industria y cómo vende la empresa se eligen solas; si no calzan, las cambias. Abajo, el país y el tamaño.",
      lado: "bottom-start",
      accion: pieza("escala"),
    },
    {
      ancla: "preventa.escala.areas",
      titulo: "Las áreas, como pestañas",
      texto: "Cada área con su nivel. La que no está en juego se suma desde su pestaña, y la que está se saca igual de fácil.",
      lado: "bottom-start",
      accion: pieza("escala"),
    },
    {
      ancla: "preventa.escala.dimensiones",
      titulo: "Dónde está cada dimensión",
      texto: "Cada porción se pinta hasta su nivel: ✓ es evidencia y ? es hipótesis. Toca una para ver qué preguntar y elegir el nivel con un clic.",
      lado: "top",
      accion: pieza("escala"),
    },
    {
      ancla: "preventa.escala.primero",
      titulo: "Qué va primero",
      texto: "Lo que conviene trabajar primero y por qué. Es lo que el prospecto se lleva de la reunión.",
      lado: "top",
      accion: pieza("escala"),
    },
    // Casos de uso
    {
      ancla: "preventa.casos.agente",
      titulo: "Casos de uso",
      texto: "El agente propone casos según dónde está cada equipo. «Usar» los pasa a elegidos, y los elegidos entran a la propuesta.",
      lado: "bottom-start",
      accion: pieza("casos"),
    },
    // Propuesta
    {
      ancla: "preventa.propuesta.lista",
      titulo: "Lista para proponer el land",
      texto: "Los siete puntos que pide la propuesta de un primer proyecto acotado. Avisan, no bloquean.",
      lado: "top",
      accion: pieza("propuesta"),
    },
    {
      ancla: "preventa.propuesta.armar",
      titulo: "Armar la propuesta",
      texto: "Elige el negocio de HubSpot y Nexus la arma con lo confirmado. Lo interno, como el presupuesto o las objeciones, no entra.",
      lado: "top",
      accion: pieza("propuesta"),
    },
  ],
};

export const PREVENTA_LISTADO: Recorrido = {
  id: "preventa-listado",
  version: 1,
  titulo: "Preventa · Listado",
  descripcion: "Las preventas en curso, cómo leerlas y por dónde empezar una",
  rotulo: "Recorrido · Preventa",
  invitacion: {
    titulo: "¿Te muestro cómo se usa el listado?",
    texto: "Qué sigue en cada preventa, cuánto falta para proponer y por dónde empezar una nueva. Menos de un minuto.",
  },
  ruta: /^\/sales\/exploraciones\/?$/,
  ejemplo: LISTADO,
  irA: { href: LISTADO },
  grupo: "ventas",
  roles: ROLES,
  pasos: [
    {
      ancla: "preventa.lista.filtros",
      titulo: "Las preventas en curso",
      texto: "Todas, solo las que llevas tú o las que ya están listas para proponer. El buscador filtra por empresa.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.lista.fila",
      titulo: "Una fila por empresa",
      texto: "Toca la fila para abrir su preventa. Lo más reciente va arriba.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.lista.sigue",
      titulo: "Qué sigue",
      texto: "Lo próximo que toca en esa preventa. El chip azul cuenta las sugerencias del agente que esperan que las revises.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.lista.proponer",
      titulo: "Progreso",
      texto: "Cuánto falta para proponer: un tramo por cada punto que pide la propuesta del land, verde el que está listo. Pasa el cursor por la barra para ver los siete.",
      lado: "bottom-start",
    },
    {
      ancla: "preventa.lista.lleva",
      titulo: "Quién la lleva",
      texto: "Elígela aquí mismo. A esa persona le llega un aviso y la preventa entra en su «Para ti».",
      lado: "bottom-end",
    },
    {
      ancla: "preventa.lista.planificar",
      titulo: "Empezar una preventa",
      texto: "Busca cualquier empresa de HubSpot por nombre o dominio y abre su preventa. Sin búsqueda, ves las de actividad más reciente.",
      lado: "top-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Por dónde empezar",
      texto: "Quién hizo el test y todavía no tiene reunión: prepara su preventa antes de llamarla.",
      lado: "left-start",
    },
    {
      ancla: "preventa.lista.test",
      titulo: "Llegaron por el test",
      texto: "Las empresas cuyo contacto hizo el test de marketing y todavía no tienen preventa, la más reciente arriba. «Planificar» la abre.",
      lado: "left-start",
    },
  ],
};
