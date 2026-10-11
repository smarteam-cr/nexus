/**
 * Recorridos de Clientes: el listado, la ficha del cliente y sus piezas.
 *
 * La ficha y sus piezas comparten dirección (`/clients/[id]`): el de la ficha vale cuando no hay
 * pieza abierta (el Resumen del proyecto) y los de las piezas son `porPantalla` (los declara la
 * pieza abierta con `usePantallaDelRecorrido`).
 */
import type { AccionDelRecorrido, Recorrido } from "../tipos";

const RUTA_DE_LA_FICHA = /^\/clients\/[^/]+\/?$/;
const EJEMPLO_DE_FICHA = "/clients/cmtum4orn00bd07lg0if1q51q";

/** La ficha del cliente (rediseño del 2026-10-04): riel, etapa, resumen y «Qué sigue». */
export const FICHA_DEL_CLIENTE: Recorrido = {
  id: "ficha-cliente",
  // 3 (2026-10-10): los pendientes del proyecto son tareas (memoria de la cuenta, etapa 2).
  // 4 (2026-10-10): las novedades de las reuniones en el riel y arriba de cada documento (etapa 6).
  version: 4,
  titulo: "Ficha del cliente",
  descripcion: "Los proyectos y sus piezas, la etapa y lo que te toca",
  rotulo: "Recorrido · Ficha del cliente",
  invitacion: {
    titulo: "¿Te muestro cómo se usa la ficha?",
    texto: "Dónde están los proyectos, qué propone la IA y qué te toca. Menos de un minuto.",
  },
  ruta: RUTA_DE_LA_FICHA,
  ejemplo: EJEMPLO_DE_FICHA,
  irA: { href: "/clients", aviso: "Abre la ficha de cualquier cliente y el recorrido arranca solo." },
  grupo: "clientes",
  roles: "todos",
  pasos: [
    {
      ancla: "ficha.riel",
      titulo: "Los proyectos y sus piezas",
      texto: "A la izquierda está cada proyecto de la empresa con sus piezas. El punto dice cómo está cada una sin abrirla: verde, generada; gris, vacía.",
      lado: "right-start",
    },
    {
      ancla: "ficha.propuesta",
      titulo: "Lo que propone la IA va en azul",
      texto: "La chispa marca algo que dejó un agente; en este caso, cambios en el cronograma. Nada se aplica solo: entras, lo revisas y decides.",
      lado: "right",
    },
    {
      ancla: "ficha.novedades",
      titulo: "Lo que una reunión cambia en un documento",
      texto: "El número con la chispa dice cuántas novedades dejaron las reuniones. Arriba del documento las ves: cámbialo con el chat, márcala lista o «No aplica».",
      lado: "right",
    },
    {
      ancla: "ficha.etapa",
      titulo: "En qué etapa va el proyecto",
      texto: "Sale de HubSpot. «Cambiar etapa» la escribe allá. Si una reunión muestra que avanzó, Nexus te lo sugiere y nada se mueve hasta que respondas.",
      lado: "bottom-start",
    },
    {
      ancla: "ficha.resumen",
      titulo: "El resumen lo escribe la IA",
      texto: "Se arma con las reuniones, el handoff y HubSpot, y cada hallazgo dice de dónde salió. Si algo cambió, «Regenerar».",
      lado: "right-start",
    },
    {
      ancla: "ficha.pendientes",
      titulo: "Los pendientes ahora son tareas",
      texto: "Los ves acá y los decides en Mis tareas. Lo que se acordó en una reunión llega como propuesta: nada entra solo.",
      lado: "left-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Lo próximo que te toca",
      texto: "Siempre arriba a la derecha, con un solo botón azul. Cuando lo resuelves, cambia solo por lo siguiente.",
      lado: "left-start",
    },
    {
      ancla: "recorrido.boton",
      titulo: "Vuélvelo a ver cuando quieras",
      texto: "Cada pantalla tiene su recorrido en este botón. Todos los tuyos están en tu menú, en «Recorridos».",
      lado: "bottom-end",
    },
  ],
};

/** El listado de clientes: la tabla a la izquierda, lo que pide atención a la derecha. */
export const CLIENTES_LISTADO: Recorrido = {
  id: "clientes-listado",
  version: 1,
  titulo: "Clientes",
  descripcion: "La cartera, lo que pide atención y lo que falta traer de HubSpot",
  rotulo: "Recorrido · Clientes",
  invitacion: {
    titulo: "¿Te muestro cómo leer tus clientes?",
    texto: "Cómo encontrar una empresa, qué te toca hoy y qué falta traer de HubSpot. Menos de un minuto.",
  },
  ruta: /^\/clients\/?$/,
  ejemplo: "/clients",
  irA: { href: "/clients" },
  grupo: "clientes",
  roles: "todos",
  pasos: [
    {
      ancla: "clientes.agregar",
      titulo: "Agregar un proyecto",
      texto: "Crea uno nuevo o trae uno que ya existe en HubSpot. Es el único botón azul de la pantalla.",
      lado: "bottom-end",
    },
    {
      ancla: "clientes.categorias",
      titulo: "Clientes, prospectos y aliados",
      texto: "Las pestañas separan la cartera de lo que todavía no es cliente, y llevan a los proyectos internos.",
      lado: "bottom-start",
    },
    {
      ancla: "clientes.filtros",
      titulo: "Filtra y busca",
      texto: "De quién es la cuenta, qué tiene y la búsqueda por empresa o proyecto.",
      lado: "bottom-start",
    },
    {
      ancla: "clientes.empresa",
      titulo: "Cada empresa",
      texto: "Un clic abre su ficha. Debajo del nombre van sus proyectos abiertos; al lado, la etapa, el CSE y la próxima reunión.",
      lado: "right-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Lo más importante de hoy",
      texto: "Lo que conviene atender primero en tu cartera, con el enlace para hacerlo.",
      lado: "left-start",
    },
    {
      ancla: "clientes.atencion",
      titulo: "Necesitan atención",
      texto: "Propuestas de cronograma sin decidir, altas a medio hacer y reuniones sin revisar, sin entrar a cada ficha.",
      lado: "left-start",
    },
    {
      ancla: "clientes.hubspot",
      titulo: "Lo que falta traer de HubSpot",
      texto: "Empresas que ya tienen un proyecto en HubSpot y todavía no están en Nexus. Se traen de a una; si ya existe una ficha parecida, Nexus pregunta antes de duplicarla.",
      lado: "left-start",
    },
    {
      ancla: "recorrido.boton",
      titulo: "Vuélvelo a ver cuando quieras",
      texto: "Cada pantalla tiene su recorrido en este botón. Todos los tuyos están en tu menú, en «Recorridos».",
      lado: "bottom-end",
    },
  ],
};

/** La pieza Cronograma de la ficha. */
export const FICHA_CRONOGRAMA: Recorrido = {
  id: "ficha-cronograma",
  version: 1,
  titulo: "Cronograma",
  descripcion: "El Gantt, la propuesta de la IA y subirlo al cliente",
  rotulo: "Recorrido · Cronograma",
  invitacion: {
    titulo: "¿Te muestro cómo se trabaja el cronograma?",
    texto: "Cómo pedirle cambios a la IA, revisar lo que propone y subirlo al cliente. Menos de un minuto.",
  },
  ruta: RUTA_DE_LA_FICHA,
  porPantalla: true,
  ejemplo: EJEMPLO_DE_FICHA,
  irA: { href: "/clients", aviso: "Abre un cliente y entra a su «Cronograma» desde el riel: el recorrido arranca solo." },
  grupo: "clientes",
  roles: "todos",
  pasos: [
    {
      ancla: "cronograma.asistente",
      titulo: "Pídele cambios al asistente",
      texto: "Escríbele lo que quieres cambiar: te dice qué fecha mueve cada cambio, y nada se aplica hasta que lo aceptas.",
      lado: "bottom-end",
    },
    {
      ancla: "cronograma.generar",
      titulo: "Generar o regenerar con IA",
      texto: "Propone fases, tiempos y tareas con lo que elegiste. Deja una sola propuesta para revisar y no pisa nada.",
      lado: "bottom-end",
    },
    {
      ancla: "publicar",
      titulo: "Subir al cliente",
      texto: "Lo que editas se guarda solo, pero el cliente no lo ve hasta que lo subes.",
      lado: "bottom-start",
    },
    {
      ancla: "cronograma.contexto",
      titulo: "Qué lee la IA",
      texto: "Eliges las reuniones y notas que lee, y le dejas instrucciones antes de generar o regenerar.",
      lado: "bottom-start",
    },
    {
      ancla: "cronograma.propuesta",
      titulo: "La propuesta de la IA",
      texto: "Alterna entre la propuesta y cómo estaba antes, marca cada fila y aplica o descarta. Nada cambia hasta que aplicas.",
      lado: "bottom-start",
    },
    {
      ancla: "cronograma.limites",
      titulo: "Lo acordado con el cliente",
      texto: "La fecha límite y la duración vendida, quién las confirmó y un aviso si el plan se pasa.",
      lado: "bottom-start",
    },
    {
      ancla: "cronograma.gantt",
      titulo: "El Gantt",
      texto: "Fases y tareas por semana. Abre una fase para editarla, marcar avance o pedirle cambios a la IA.",
      lado: "top-start",
    },
  ],
};

/** La página de inicio de la exploración y la próxima sesión (las escucha LienzoDeExploracion). */
const INICIO: readonly AccionDelRecorrido[] = [{ evento: "preventa.sesion", valor: "inicio" }];
const PROXIMA: readonly AccionDelRecorrido[] = [{ evento: "preventa.sesion", valor: "proxima" }];

/** La pieza Exploración de la ficha: el lienzo de la preventa con las preguntas de Customer Success. */
export const FICHA_EXPLORACION: Recorrido = {
  id: "ficha-exploracion",
  // v2 (2026-10-05): la guía se retiró. La exploración son Sesiones y Cuestionarios, y lo que se
  // averigua va como sugerencia a Información del cliente.
  // v3 (2026-10-05): una pestaña por sesión, como en la preventa.
  // v4 (2026-10-07): el MISMO lienzo de la preventa (sesiones en el riel, Preparación / En vivo /
  // Análisis), con la estrategia del cliente (retos, resultados, obstáculos) en vez de la venta.
  // v5 (2026-10-09): abre en su página de inicio (las sesiones, cada una con su reunión; «+ Agregar
  // sesión»): el «Contexto adicional» de la exploración se retiró.
  version: 5,
  titulo: "Exploración del proyecto",
  descripcion: "Las sesiones, la guía de cada una y adónde va lo que averiguas",
  rotulo: "Recorrido · Exploración",
  invitacion: {
    titulo: "¿Te muestro cómo se usa la exploración?",
    texto: "Las sesiones, la guía de cada una y adónde va lo que averiguas. Menos de un minuto.",
  },
  ruta: RUTA_DE_LA_FICHA,
  porPantalla: true,
  ejemplo: EJEMPLO_DE_FICHA,
  irA: { href: "/clients", aviso: "Abre un cliente y entra a su «Exploración» desde el riel: el recorrido arranca solo." },
  grupo: "clientes",
  roles: "todos",
  pasos: [
    {
      ancla: "preventa.inicio",
      titulo: "Tus sesiones",
      texto: "Cada sesión con su reunión y en qué está. Agrega una agendada, una que ya pasó o una sin reunión: nada entra solo.",
      lado: "top",
      accion: INICIO,
    },
    {
      ancla: "preventa.sesiones",
      titulo: "También en el riel",
      texto: "Cuelgan de «Exploración»: la próxima dice cuándo. Debajo, los cuestionarios y el informe anterior. Toca «Exploración» para volver al inicio.",
      lado: "right-start",
    },
    {
      ancla: "preventa.sesion.momento",
      titulo: "Preparación, En vivo y Análisis",
      texto: "Antes, la guía; durante, marcas lo preguntado y anotas; después, el agente lee la reunión y te dice qué salió.",
      lado: "bottom-start",
      accion: PROXIMA,
    },
    {
      ancla: "preventa.sesion.preguntas",
      accion: [...PROXIMA, { evento: "preventa.momento", valor: "antes" }],
      titulo: "La guía",
      texto: "Pregunta por la estrategia del cliente —sus retos, los resultados que persigue y qué se lo impide— y por la escala.",
      lado: "top-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Lo próximo que te toca",
      texto: "Leer una sesión, revisar lo que sugirió el agente o hacer la próxima sesión. Un solo botón azul.",
      lado: "left-start",
    },
    {
      ancla: "preventa.panel.marco",
      titulo: "La estrategia del cliente",
      texto: "Verde lo confirmado, azul lo que sugirió el agente. Lo que confirmas va como sugerencia a Información del cliente.",
      lado: "left-start",
    },
  ],
};

/** «Información del cliente», en la cuenta: la ficha que va a HubSpot y las licencias. */
export const FICHA_INFORMACION: Recorrido = {
  id: "ficha-informacion",
  // v2 (2026-10-05): los resultados que persigue el cliente se confirman acá (antes, en el Resumen).
  version: 2,
  titulo: "Información del cliente",
  descripcion: "La ficha que se guarda en HubSpot, lo que propone la IA y las licencias",
  rotulo: "Recorrido · Información del cliente",
  invitacion: {
    titulo: "¿Te muestro cómo se completa la ficha?",
    texto: "Qué propone la IA, cómo se revisa y cuándo llega a HubSpot. Menos de un minuto.",
  },
  ruta: RUTA_DE_LA_FICHA,
  porPantalla: true,
  ejemplo: EJEMPLO_DE_FICHA,
  irA: { href: "/clients", aviso: "Abre un cliente y entra a «Información del cliente» desde el riel: el recorrido arranca solo." },
  grupo: "clientes",
  roles: "todos",
  pasos: [
    {
      ancla: "info.vistas",
      titulo: "Qué mirar de la cuenta",
      texto: "La ficha, las licencias, los documentos y la marca del cliente.",
      lado: "bottom-start",
    },
    {
      ancla: "info.sugerencias",
      titulo: "Lo que propone la IA",
      texto: "Úsalo todo, revisa campo por campo o descártalo. Nada llega a HubSpot sin que confirmes.",
      lado: "bottom-start",
    },
    {
      ancla: "info.actualizar",
      titulo: "Actualizar con IA",
      texto: "Lee los handoffs, las encuestas y las reuniones, y propone lo que falta en la ficha.",
      lado: "bottom-start",
    },
    {
      ancla: "info.grupo",
      titulo: "Los campos de la ficha",
      texto: "Cada campo dice adónde va en HubSpot. El grupo «Solo el equipo» no lo ve el cliente.",
      lado: "right-start",
    },
    {
      ancla: "info.resultados",
      titulo: "Los resultados que persigue",
      texto: "Salen del handoff de cada proyecto: completa línea base, meta y plazo, y confírmalos. El Resumen solo los muestra.",
      lado: "right-start",
    },
    {
      ancla: "info.propuesta",
      titulo: "Un campo con propuesta",
      texto: "El cuadro azul trae lo que sugiere la IA: «Usar» o «Descartar».",
      lado: "right-start",
    },
    {
      ancla: "info.guardar",
      titulo: "Confirmar y guardar en HubSpot",
      texto: "Lo que cambias en la ficha llega a HubSpot recién cuando confirmas con este botón.",
      lado: "top-start",
    },
    {
      ancla: "info.licencias",
      titulo: "Las licencias",
      texto: "Qué tiene contratado el cliente y cuándo renueva cada una.",
      lado: "left-start",
    },
  ],
};
