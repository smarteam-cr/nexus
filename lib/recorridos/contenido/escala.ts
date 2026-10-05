/**
 * El recorrido de la Escala de Rendimiento (`/escala/[área]`), para todo el equipo.
 *
 * Arranca en el mapa (la vista de entrada) y lo maneja: elige la primera dimensión, el nivel
 * Funcional y la celda de esa dimensión en Funcional, para que el detalle muestre lo que el paso
 * explica. Las acciones las ejecuta `components/escala/Mapa.tsx` (evento `escala.seleccionar`).
 */
import type { Recorrido } from "../tipos";

const ELEGIR_LA_DIMENSION = { evento: "escala.seleccionar", valor: "dimension" } as const;
const ELEGIR_LA_CELDA = { evento: "escala.seleccionar", valor: "dimension.F" } as const;

export const ESCALA: Recorrido = {
  id: "escala",
  // 2: más específico (la rueda, una dimensión, Funcional y una celda con sus criterios).
  version: 2,
  titulo: "Escala de Rendimiento",
  descripcion: "La rueda, sus dimensiones, el nivel Funcional y los criterios de una celda",
  rotulo: "Recorrido · Escala de Rendimiento",
  invitacion: {
    titulo: "¿Te muestro cómo se recorre la escala?",
    texto: "Cómo leer la rueda, qué dice cada dimensión y qué pide el nivel Funcional. Un minuto.",
  },
  // `/escala/comentarios` es la bandeja, otra pantalla: no entra.
  ruta: /^\/escala\/(?!comentarios(?:\/|$))[^/]+\/?$/,
  ejemplo: "/escala/ventas",
  irA: { href: "/escala" },
  grupo: "equipo",
  roles: "todos",
  // Arranca en el mapa y sin nada elegido, venga de la vista que venga.
  alArrancar: [
    { evento: "escala.vista", valor: "mapa" },
    { evento: "escala.seleccionar", valor: "" },
  ],
  pasos: [
    {
      ancla: "escala.areas",
      titulo: "Elige el área",
      texto: "Cada pestaña es un área de la escala, con el número de comentarios que tiene.",
      lado: "bottom-start",
    },
    {
      ancla: "escala.industria",
      titulo: "La industria",
      texto: "Cada edición dice la misma escala con las palabras de una industria. «General» es la escala tal como está escrita.",
      lado: "bottom-start",
    },
    {
      ancla: "escala.perfil",
      titulo: "Se rellena solo con la industria",
      texto: "Al elegir una industria, «Cómo se cierra la venta» y «Qué pasa después de la venta» toman su perfil habitual, si lo tiene. Puedes cambiarlos: esconden los criterios que no aplican a ese perfil.",
      lado: "bottom-start",
    },
    {
      ancla: "escala.rueda",
      titulo: "Dos grandes partes: la base operativa y la producción",
      texto: "A la derecha, la base operativa; a la izquierda, la producción. Cada porción es una dimensión y cada anillo un nivel, de Deficiente al centro a Óptimo en el borde.",
      lado: "right-start",
      accion: { evento: "escala.seleccionar", valor: "" },
    },
    {
      ancla: "escala.dimension",
      titulo: "Toca cualquier dimensión",
      texto: "Su nombre está afuera de la rueda. Al tocarlo, su porción se enciende y el detalle de la derecha pasa a esa dimensión.",
      lado: "bottom",
      accion: ELEGIR_LA_DIMENSION,
    },
    {
      ancla: "escala.detalle",
      titulo: "El detalle de la dimensión",
      texto: "Su pregunta, el costo de quedarse donde está y sus cinco niveles. Toca un nivel de la lista para abrir esa celda.",
      lado: "left-start",
      accion: ELEGIR_LA_DIMENSION,
    },
    {
      ancla: "escala.nivel",
      titulo: "Funcional, la base",
      texto: "Los servicios de implementación de CRM básicos apuntan a llevar al cliente hasta aquí. Al tocar el nivel, el detalle muestra qué pide en cada dimensión.",
      lado: "bottom",
      accion: { evento: "escala.seleccionar", valor: "F" },
    },
    {
      ancla: "escala.detalle",
      titulo: "Una celda: una dimensión en un nivel",
      texto: "Al tocar una celda, el detalle dice qué pide ese nivel en esa dimensión y el resultado que se ve en el cliente cuando lo cumple.",
      lado: "left-start",
      accion: ELEGIR_LA_CELDA,
    },
    {
      ancla: "escala.criterios",
      titulo: "Los criterios de la celda",
      texto: "Cada criterio es algo que se comprueba en el cliente. Sus marcas dicen si es un hábito o un riesgo, qué requiere y qué otros lo requieren; el botón de la derecha es para comentarlo.",
      lado: "left-start",
      accion: ELEGIR_LA_CELDA,
    },
    {
      ancla: "escala.comentarios",
      titulo: "Los comentarios",
      texto: "Si un criterio no se entiende o no calza con un cliente real, coméntalo en él. En este botón están todos.",
      lado: "bottom-end",
    },
  ],
};
