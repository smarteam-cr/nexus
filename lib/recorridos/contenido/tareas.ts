/**
 * Los recorridos de Tareas internas (docs/tareas-plan.md §9.1): Mis tareas y la Semana del equipo, para todo el equipo
 * (la página no tiene gate: cualquiera entra desde un aviso o desde «Para ti»). Un paso cuyo elemento no está a la
 * vista no sale: sin semanas sin revisar o sin nada por decidir, el recorrido se los salta.
 */
import type { Recorrido } from "../tipos";

export const TAREAS: Recorrido = {
  id: "tareas",
  // 2 (2026-10-10): los compromisos de las reuniones con clientes llegan como tareas (memoria de la cuenta, etapa 2).
  version: 2,
  titulo: "Mis tareas",
  descripcion: "De dónde salen tus tareas, cómo se deciden, se anotan y se revisan cada semana",
  rotulo: "Recorrido · Mis tareas",
  invitacion: {
    titulo: "¿Te muestro cómo funcionan tus tareas?",
    texto: "Qué propone Nexus desde tus reuniones, cómo anotas lo tuyo y cómo cierras la semana. Un minuto.",
  },
  ruta: /^\/tareas\/?$/,
  ejemplo: "/tareas",
  irA: { href: "/tareas" },
  grupo: "empieza",
  roles: "todos",
  pasos: [
    {
      ancla: "tareas.leer",
      titulo: "Empieza por la reunión de tu equipo",
      texto: "Elige el planning o la retro y Nexus lee los «Próximos pasos» de las notas. Propone las tareas de cada persona; nada entra solo.",
      lado: "bottom-end",
    },
    {
      ancla: "tareas.sin-revisar",
      titulo: "Las semanas que no revisaste",
      texto: "Mientras una semana pasada tenga tareas sin marcar, aparece acá. Lo que sigue salta a la semana de hoy, nunca al pasado.",
      lado: "bottom-start",
    },
    {
      ancla: "tareas.por-decidir",
      titulo: "Lo que espera tu decisión",
      texto: "Lo que propuso Nexus desde una reunión y lo que te pidieron. Úsala, déjala para más adelante, pásasela a quien corresponde o descártala.",
      lado: "bottom-start",
    },
    {
      ancla: "tareas.por-decidir",
      titulo: "Lo que se acordó con tus clientes",
      texto: "De cada reunión con un cliente llega lo que te comprometiste y el seguimiento de lo que prometió el cliente. Nada entra solo: lo decides acá.",
      roles: ["CSE", "CSL"],
      lado: "bottom-start",
    },
    {
      ancla: "tareas.agregar",
      titulo: "Anota lo que no salió en la reunión",
      texto: "Escribe y presiona Enter. Con «Para…» se la sugieres a otra persona: le llega como propuesta. Si se parece a una tuya, te pregunta «¿Es T-12?».",
      lado: "bottom-start",
    },
    {
      ancla: "tareas.filtro",
      titulo: "Busca y filtra",
      texto: "Por texto o por número (T-12), y por para quién es: un cliente, algo interno, un prospecto o lo que todavía no se clasificó.",
      lado: "bottom-start",
    },
    {
      ancla: "tareas.filtro",
      titulo: "Filtra por cliente",
      texto: "En «Para quién», elige «Cliente» para ver solo lo de tus cuentas: lo que te comprometiste y los seguimientos de cada una.",
      roles: ["CSE", "CSL"],
      lado: "bottom-start",
    },
    {
      ancla: "tareas.esta-semana",
      titulo: "Tu semana",
      texto: "Lo que haces esta semana, por prioridad. Ábrela para elegir cliente, proyecto u horas, y agéndala para que tenga su bloque en tu calendario.",
      lado: "top",
    },
    {
      ancla: "tareas.vistas",
      titulo: "Lista, tablero o calendario",
      texto: "La misma semana de tres maneras: la lista, un tablero por estado (arrastrar cambia el estado) o el calendario con los bloques de cada tarea.",
      lado: "bottom-end",
    },
    {
      ancla: "que-sigue",
      titulo: "Qué sigue",
      texto: "Una sola cosa por vez: revisar una semana, decidir lo que te propusieron o agendar lo que no tiene bloque.",
      lado: "left-start",
    },
    {
      ancla: "tareas.horas",
      titulo: "Tu semana en horas",
      texto: "Lo que ocupan tus tareas contra las horas que tienes. Las que no tienen horas se cuentan aparte.",
      lado: "left-start",
    },
    {
      ancla: "tareas.espacios",
      titulo: "Tus espacios",
      texto: "Para un trabajo que junta a varios equipos, como un evento: sus proyectos, sus miembros y un tablero por sección.",
      lado: "left-start",
    },
    {
      ancla: "tareas.nueva",
      titulo: "Anota desde cualquier pantalla",
      texto: "«Nueva tarea», al pie del menú, abre la misma línea sin salir de lo que estás mirando.",
      lado: "right-end",
    },
  ],
};

export const TAREAS_EQUIPO: Recorrido = {
  id: "tareas-equipo",
  version: 1,
  titulo: "Semana del equipo",
  descripcion: "La semana de cada persona del sprint, lo que falta asignar y lo pedido a otros equipos",
  rotulo: "Recorrido · Semana del equipo",
  invitacion: {
    titulo: "¿Te muestro la semana de tu equipo?",
    texto: "Quién tiene qué, quién revisó su semana y lo que falta asignar. Un minuto.",
  },
  ruta: /^\/tareas\/equipo\/?$/,
  ejemplo: "/tareas/equipo",
  irA: { href: "/tareas/equipo" },
  grupo: "empieza",
  roles: "todos",
  pasos: [
    {
      ancla: "equipo.filtros",
      titulo: "El equipo y la semana",
      texto: "Elige el sprint y la semana. A la derecha: Personas, un tablero por estado o las métricas (cuánto se terminó y cómo entraron).",
      lado: "bottom-start",
    },
    {
      ancla: "equipo.revisaron",
      titulo: "Quién revisó su semana",
      texto: "Cada persona marca qué terminó y qué sigue. Acá ves quién ya lo hizo y a quién le faltan tareas por marcar.",
      lado: "bottom-start",
    },
    {
      ancla: "equipo.revisar",
      titulo: "Revisar con el equipo",
      texto: "En la retro, si lideras el sprint: una pestaña por persona y lo que dijo la retro en azul. A cada una le llega un aviso; agendar lo hace ella.",
      lado: "bottom-end",
    },
    {
      ancla: "equipo.personas",
      titulo: "Una columna por persona",
      texto: "Sus tareas de la semana y sus horas contra las que tiene. Lo privado se ve como una fila sin título.",
      lado: "top",
    },
    {
      ancla: "equipo.por-asignar",
      titulo: "Por asignar",
      texto: "Lo que salió de una reunión sin dueño claro. Quien lidera el sprint la abre y se la asigna a alguien.",
      lado: "left-start",
    },
    {
      ancla: "equipo.pedido",
      titulo: "Lo pedido a otros equipos",
      texto: "Lo que tu equipo le pidió a otro y qué decidieron: si todavía no lo deciden, si lo aceptaron o si ya está hecho.",
      lado: "left-start",
    },
    {
      ancla: "tareas.leer",
      titulo: "Lee la reunión de tu equipo",
      texto: "El planning propone las tareas de la semana; la retro dice cómo le fue a cada una. Lo decide cada persona.",
      lado: "bottom-end",
    },
  ],
};
