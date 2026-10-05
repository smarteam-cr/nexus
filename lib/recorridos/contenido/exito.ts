/**
 * Recorridos de Éxito del cliente (solo CSL y dirección: `ROLES_DE_EXITO_DEL_CLIENTE`).
 * Pantallas del rediseño del 2026-10-04: el listado de la cartera y el single de una cuenta.
 */
import type { Recorrido } from "../tipos";

const ROLES = ["CSL", "SUPER_ADMIN"] as const;

export const EXITO_LISTADO: Recorrido = {
  id: "exito-listado",
  version: 1,
  titulo: "Éxito del cliente",
  descripcion: "La cartera, a quién llamar y de dónde salen los datos",
  rotulo: "Recorrido · Éxito del cliente",
  invitacion: {
    titulo: "¿Te muestro cómo leer la cartera?",
    texto: "Los números de arriba, a quién llamar primero y qué tan frescos son los datos. Menos de un minuto.",
  },
  ruta: /^\/customer-success\/?$/,
  ejemplo: "/customer-success",
  irA: { href: "/customer-success" },
  grupo: "clientes",
  roles: ROLES,
  pasos: [
    {
      ancla: "cs.cartera",
      titulo: "La cartera en una línea",
      texto: "Cuánto gestiona Smarteam al mes, cuánto está en riesgo de lo que renueva en 90 días, cuántas cuentas muestran crecimiento y el uso promedio.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.entrega",
      titulo: "Lo que frena la entrega de proyectos",
      texto: "Cada botón filtra «A quién llamar»: proyectos bloqueados, atrasados o con alertas altas. «Sin CSE» abre la pestaña Equipo.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.preguntas",
      titulo: "Una pestaña por pregunta",
      texto: "A quién llamar, qué renueva, uso y licencias, crecimiento, equipo y nivel de partner. El número dice cuántas cuentas hay en cada una.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.llamar",
      titulo: "A quién llamar",
      texto: "Las cuentas ordenadas por urgencia, con el porqué. Filtra por riesgo doble, cruces o CSE, y abre la cuenta desde su fila.",
      lado: "top-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Lo próximo que te toca",
      texto: "La cuenta que conviene atender ahora, con el botón para abrirla, y las renovaciones de los próximos 30 días.",
      lado: "left-start",
    },
    {
      ancla: "cs.fuentes",
      titulo: "De dónde salen los datos",
      texto: "La fecha de cada fuente dice qué tan actual es lo que miras. Si tienes permiso, con estos botones la actualizas.",
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

export const EXITO_CUENTA: Recorrido = {
  id: "exito-cuenta",
  // v2 (2026-10-05): la ficha pasó a pestañas; dos pasos apuntan ahora a su pestaña.
  version: 2,
  titulo: "Una cuenta de Éxito del cliente",
  descripcion: "El estado de la cuenta, su adopción, sus proyectos y sus alertas",
  rotulo: "Recorrido · La cuenta",
  invitacion: {
    titulo: "¿Te muestro cómo leer una cuenta?",
    texto: "Su estado, qué tanto usa HubSpot, cómo van sus proyectos y qué alertas tiene. Menos de un minuto.",
  },
  ruta: /^\/customer-success\/[^/]+\/?$/,
  ejemplo: "/customer-success/cmtum4orn00bd07lg0if1q51q",
  irA: { href: "/customer-success", aviso: "Abre cualquier cuenta de la lista y el recorrido arranca solo." },
  grupo: "clientes",
  roles: ROLES,
  pasos: [
    {
      ancla: "cs.estado",
      titulo: "El estado de la cuenta",
      texto: "Entrega, adopción, relación y renovación, cada una con su color, el porqué y de dónde sale. Toca una para abrir su pestaña.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.atencion",
      titulo: "Por qué pide atención",
      texto: "Por qué esta cuenta está en «A quién llamar», con su prioridad y de dónde sale.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.resumen",
      titulo: "El resumen lo escribe la IA",
      texto: "Cada frase dice de dónde salió. Si los datos cambiaron desde que se escribió, te avisa para volver a redactarlo.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.pestanas",
      titulo: "Una pestaña por pregunta",
      texto: "Adopción, renovación, proyectos, resultados y conversaciones. La pestaña abierta queda en la dirección, así la puedes compartir.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.uso",
      titulo: "La adopción",
      texto: "El uso semana a semana, cuánto de lo contratado está activado y se usa, las licencias que paga sin asignar y lo que falta activar. El punto ámbar avisa que algo pide atención.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.proyectos",
      titulo: "Sus proyectos",
      texto: "Cada proyecto con su salud y su cierre, y por qué se movió el plan. Si el vigía propone cambiar la salud de uno, la confirmas o la descartas desde su fila.",
      lado: "bottom-start",
    },
    {
      ancla: "que-sigue",
      titulo: "Lo primero que hay que resolver",
      texto: "Tiene un solo botón azul: abre el portal del cliente si la relación está por vencer, o la ficha si un proyecto tiene algo pendiente.",
      lado: "left-start",
    },
    {
      ancla: "cs.alertas",
      titulo: "Las alertas de la cuenta",
      texto: "Las que siguen abiertas, con su razón y lo que sugieren. Cada una se resuelve o se descarta desde su fila.",
      lado: "left-start",
    },
  ],
};
