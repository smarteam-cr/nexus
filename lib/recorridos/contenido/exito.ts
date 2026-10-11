/**
 * Recorridos de Éxito del cliente (solo CSL y dirección: `ROLES_DE_EXITO_DEL_CLIENTE`).
 * Pantallas del rediseño del 2026-10-04: el listado de la cartera y el single de una cuenta.
 */
import type { Recorrido } from "../tipos";

const ROLES = ["CSL", "SUPER_ADMIN"] as const;

export const EXITO_LISTADO: Recorrido = {
  id: "exito-listado",
  // v2 (2026-10-07): cada cuenta tiene su color, y las alertas se resuelven en la fila.
  // v3 (2026-10-07): la pestaña «Cartera», con la clasificación de cada cuenta.
  // v4 (2026-10-09): vistas y filtros de la cartera, la relación con HubSpot y la pestaña Equipo.
  version: 4,
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
  alArrancar: [{ evento: "cs.pestana", valor: "llamar" }],
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
      texto: "Cada botón cuenta las cuentas con un proyecto bloqueado, atrasado o con una alerta alta del agente vigía, y filtra «A quién llamar» para mostrar exactamente esas. «Sin CSE» cuenta proyectos y abre la pestaña Equipo.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.preguntas",
      titulo: "Una pestaña por pregunta",
      texto: "A quién llamar, la cartera, qué renueva, uso y licencias, crecimiento, equipo y nivel de partner. En «Cartera» confirmas el tipo de relación, el momento y el potencial que propone Nexus para cada cuenta.",
      lado: "bottom-start",
    },
    {
      ancla: "cs.llamar",
      titulo: "A quién llamar",
      texto: "Rojo es riesgo alto, amarillo señales de riesgo, la pausa es «en espera del cliente» y verde va bien: pasa el mouse por el color para ver por qué. En «Alertas» resuelves o descartas las de todas las cuentas.",
      lado: "top-start",
      accion: { evento: "cs.pestana", valor: "llamar" },
    },
    {
      ancla: "cs.vistas",
      titulo: "Las vistas de la cartera",
      texto: "Cada vista es un filtro guardado: las de arranque y las que guarden la CSL o dirección. Los filtros quedan en la dirección, así una vista también es un enlace.",
      lado: "bottom-start",
      accion: { evento: "cs.pestana", valor: "cartera" },
    },
    {
      ancla: "cs.filtros",
      titulo: "Filtra con varios valores",
      texto: "Color, relación con HubSpot, tipo de relación, momento, potencial, CSE y renovación. Abajo, en la columna «Color», corriges el color con una razón o ves por qué está en espera.",
      lado: "bottom-start",
      accion: { evento: "cs.pestana", valor: "cartera" },
    },
    {
      ancla: "cs.equipo",
      titulo: "Cada CSE, para la 1:1",
      texto: "Sus cuentas, las recurrentes contra la meta, las que están en riesgo, en espera o sin contacto, y las que pierden la relación con HubSpot. Cada número abre esas cuentas en «Cartera».",
      lado: "top-start",
      accion: { evento: "cs.pestana", valor: "equipo" },
    },
    {
      ancla: "cs.relacion-indice",
      titulo: "La relación con HubSpot",
      texto: "HubSpot comparte el uso de una cuenta solo mientras alguien de Smarteam trabaja en su portal: cada cosa que se crea o edita cuenta 60 días. Acá ves cuántas vencen o ya terminaron.",
      lado: "left-start",
      accion: { evento: "cs.pestana", valor: "llamar" },
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
  // v3 (2026-10-07): las alertas se cierran con una nota y vuelven solo con una señal nueva.
  // v4 (2026-10-07): la clasificación de la cuenta en el panel.
  // v5 (2026-10-09): el color (corregirlo, «en espera») y la relación con HubSpot en el panel.
  version: 5,
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
      ancla: "cs.color",
      titulo: "El color, y corregirlo",
      texto: "Por qué tiene ese color. Si sabes algo que Nexus no, corrígelo con una razón: vale 30 días o hasta que aparezca algo rojo nuevo. Si el cliente frenó el trabajo, márcala «en espera del cliente».",
      lado: "left-start",
    },
    {
      ancla: "cs.relacion",
      titulo: "La relación con HubSpot",
      texto: "Si Smarteam gestiona la cuenta en HubSpot, cuándo vence y qué hacer para que no se pierda: sin ella, HubSpot deja de compartir el uso.",
      lado: "left-start",
    },
    {
      ancla: "cs.clasificacion",
      titulo: "La clasificación",
      texto: "El tipo de relación, el momento y el potencial. En azul, lo que propone Nexus con lo que sabe de la cuenta: elígelo para confirmarlo o elige otro valor.",
      lado: "left-start",
    },
    {
      ancla: "cs.alertas",
      titulo: "Las alertas de la cuenta",
      texto: "Las que siguen abiertas, con su razón y lo que sugieren. Resuélvelas o descártalas con una nota corta: vuelven solo con una señal nueva.",
      lado: "left-start",
    },
  ],
};
