/**
 * scripts/lib/trivia-de-ejemplo.ts — la trivia de ejemplo «Ejemplo · Implementación de HubSpot», como datos puros.
 *
 * La siembra scripts/seed-trivia-ejemplo.ts en la base local. lib/trivias/schema.test.ts la pasa por el mismo schema
 * que la pantalla (TriviaInput) y exige una sola correcta por pregunta: si el módulo cambia sus reglas, el ejemplo no
 * se queda roto en silencio.
 *
 * Diez preguntas, una por tema de una implementación (segmentos, workflows, propiedades, pipelines, importación,
 * permisos, reportes, integraciones, ciclo de vida y adopción), con opción múltiple y verdadero o falso, de dificultad
 * variada (el tiempo crece con la dificultad). Las respuestas siguen lo que HubSpot hace hoy; ninguna pregunta depende
 * de la edición (Starter, Pro, Enterprise).
 */
import type { TipoDePregunta } from "@/lib/trivias/tipos";

export const TITULO_DE_EJEMPLO = "Ejemplo · Implementación de HubSpot";

export interface PreguntaDeEjemplo {
  tema: string;
  dificultad: "fácil" | "media" | "difícil";
  tipo: TipoDePregunta;
  texto: string;
  /** En verdadero o falso las pone el schema: «Verdadero» (0) y «Falso» (1). */
  opciones: string[];
  correctas: number[];
  segundos: number;
}

export const PREGUNTAS_DE_EJEMPLO: PreguntaDeEjemplo[] = [
  {
    tema: "Listas y segmentos",
    dificultad: "fácil",
    tipo: "OPCION_MULTIPLE",
    texto: "¿Qué diferencia a un segmento activo (antes, «lista activa») de uno estático en HubSpot?",
    opciones: [
      "El activo solo admite contactos; el estático, cualquier objeto",
      "El estático se borra solo a los 90 días",
      "El activo se actualiza solo con sus filtros; el estático cambia solo si lo editas",
      "El activo no se puede usar en un workflow",
    ],
    correctas: [2],
    segundos: 20,
  },
  {
    tema: "Workflows",
    dificultad: "fácil",
    tipo: "VERDADERO_FALSO",
    texto: "En HubSpot, un workflow solo puede inscribir contactos.",
    opciones: [],
    correctas: [1], // Falso: también empresas, negocios, tickets y objetos personalizados.
    segundos: 15,
  },
  {
    tema: "Propiedades y objetos",
    dificultad: "media",
    tipo: "OPCION_MULTIPLE",
    texto:
      "Quieres guardar en cada contacto su tipo de membresía, con valores fijos (Básica, Pro o Empresarial), para filtrar y hacer reportes. ¿Qué tipo de propiedad creas?",
    opciones: ["Texto de una sola línea", "Selección desplegable", "Número", "Casilla de verificación única"],
    correctas: [1],
    segundos: 25,
  },
  {
    tema: "Pipelines y etapas",
    dificultad: "media",
    tipo: "VERDADERO_FALSO",
    texto:
      "En un pipeline de negocios, cada etapa tiene una probabilidad de cierre que HubSpot usa para calcular el monto ponderado del pronóstico.",
    opciones: [],
    correctas: [0], // Verdadero: monto × probabilidad de la etapa.
    segundos: 15,
  },
  {
    tema: "Importación y deduplicación",
    dificultad: "media",
    tipo: "OPCION_MULTIPLE",
    texto:
      "Al importar empresas, ¿con qué propiedad reconoce HubSpot las que ya existen para actualizarlas en vez de duplicarlas?",
    opciones: ["El nombre de dominio de la empresa", "El nombre de la empresa", "El número de teléfono", "La ciudad"],
    correctas: [0],
    segundos: 20,
  },
  {
    tema: "Permisos y equipos",
    dificultad: "media",
    tipo: "OPCION_MULTIPLE",
    texto: "Quieres que cada vendedor vea solo los negocios que tiene asignados. ¿Qué configuras?",
    opciones: [
      "Un pipeline distinto para cada vendedor",
      "En sus permisos de usuario, ver solo los registros que le pertenecen",
      "Un segmento estático por vendedor",
      "Un workflow que borre los negocios de los demás",
    ],
    correctas: [1],
    segundos: 25,
  },
  {
    tema: "Reportes y dashboards",
    dificultad: "media",
    tipo: "OPCION_MULTIPLE",
    texto:
      "Necesitas un reporte que cruce contactos con sus negocios: por ejemplo, negocios ganados según la fuente original del contacto. ¿Qué usas?",
    opciones: [
      "Una vista guardada de negocios",
      "Un segmento estático",
      "Un workflow con notificación",
      "El creador de reportes personalizados",
    ],
    correctas: [3],
    segundos: 25,
  },
  {
    tema: "Integraciones",
    dificultad: "difícil",
    tipo: "VERDADERO_FALSO",
    texto:
      "La sincronización de datos de HubSpot (Data Sync) puede mantener los registros al día en ambos sentidos entre HubSpot y otra aplicación.",
    opciones: [],
    correctas: [0], // Verdadero: la sincronización puede ser de una vía o bidireccional.
    segundos: 20,
  },
  {
    tema: "Ciclo de vida del contacto",
    dificultad: "difícil",
    tipo: "OPCION_MULTIPLE",
    texto:
      "En las etapas del ciclo de vida que trae HubSpot por defecto, ¿cuál va justo después de «Lead calificado para marketing (MQL)»?",
    opciones: ["Suscriptor", "Oportunidad", "Cliente", "Lead calificado para ventas (SQL)"],
    correctas: [3],
    segundos: 30,
  },
  {
    tema: "Adopción",
    dificultad: "fácil",
    tipo: "OPCION_MULTIPLE",
    texto: "Terminó la implementación. ¿Qué ayuda más a que el equipo comercial adopte HubSpot?",
    opciones: [
      "Seguir pidiendo los avances en una hoja de Excel aparte",
      "Dar acceso a todas las herramientas el primer día, sin capacitación",
      "Que los líderes revisen el pipeline en HubSpot en las reuniones del equipo",
      "Esperar a que cada persona descubra el CRM por su cuenta",
    ],
    correctas: [2],
    segundos: 20,
  },
];

/** La trivia tal como la manda la pantalla (POST /api/trivia): título y preguntas, sin los datos de catálogo. */
export function triviaDeEjemplo() {
  return {
    titulo: TITULO_DE_EJEMPLO,
    preguntas: PREGUNTAS_DE_EJEMPLO.map(({ tipo, texto, opciones, correctas, segundos }) => ({
      tipo,
      texto,
      opciones,
      correctas,
      segundos,
    })),
  };
}
