/**
 * scripts/lib/trivia-de-ejemplo.ts — las trivias de ejemplo, como datos puros.
 *
 * Las siembra scripts/seed-trivia-ejemplo.ts (en la base local o, con el guard, en producción).
 * lib/trivias/schema.test.ts las pasa por el mismo schema que la pantalla (TriviaInput) y exige 10 preguntas con una sola
 * correcta cada una: si el módulo cambia sus reglas, un ejemplo no se queda roto en silencio.
 *
 * Las tres mezclan opción múltiple y verdadero o falso, con dificultad variada (el tiempo crece con la dificultad).
 * · «Implementación de HubSpot»: lo que HubSpot hace hoy, sin depender de la edición (Starter, Pro, Enterprise).
 * · «Good Strategy / Bad Strategy»: conceptos del libro de Richard Rumelt, con palabras propias (sin citas).
 * · «Cómo funciona Nexus»: verdad en el código al 2026-11-20 (lib/flow/stage-pieces.ts, lib/escala/fuente.ts,
 *   components/asistente/ChatDelAsistente.tsx, app/page.tsx, el módulo de Trivias). Si Nexus cambia, se corrige acá.
 */
import type { TipoDePregunta } from "@/lib/trivias/tipos";

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

export interface TriviaDeEjemplo {
  titulo: string;
  preguntas: PreguntaDeEjemplo[];
}

const VERDADERO = [0];
const FALSO = [1];

// ── Implementación de HubSpot ───────────────────────────────────────────────

const HUBSPOT: TriviaDeEjemplo = {
  titulo: "Ejemplo · Implementación de HubSpot",
  preguntas: [
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
      correctas: FALSO, // también empresas, negocios, tickets y objetos personalizados
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
      correctas: VERDADERO, // monto × probabilidad de la etapa
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
      correctas: VERDADERO, // la sincronización puede ser de una vía o bidireccional
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
  ],
};

// ── Good Strategy / Bad Strategy (Richard Rumelt) ───────────────────────────

const RUMELT: TriviaDeEjemplo = {
  titulo: "Good Strategy / Bad Strategy",
  preguntas: [
    {
      tema: "El núcleo de la estrategia",
      dificultad: "fácil",
      tipo: "OPCION_MULTIPLE",
      texto: "Según Richard Rumelt, ¿cuáles son los tres elementos del núcleo de una buena estrategia?",
      opciones: [
        "Visión, misión y valores",
        "Diagnóstico, política guía y acciones coherentes",
        "Metas, presupuesto y plazos",
        "Análisis FODA, objetivos y KPIs",
      ],
      correctas: [1],
      segundos: 20,
    },
    {
      tema: "Confundir metas con estrategia",
      dificultad: "fácil",
      tipo: "VERDADERO_FALSO",
      texto: "Para Rumelt, anunciar una meta ambiciosa, como «crecer 20 % al año», ya es una estrategia.",
      opciones: [],
      correctas: FALSO,
      segundos: 15,
    },
    {
      tema: "La palabrería",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto: "¿Qué llama Rumelt «palabrería» (fluff) en una estrategia?",
      opciones: [
        "Un plan con demasiados indicadores",
        "Un diagnóstico hecho solo con datos financieros",
        "Frases llenas de jerga que suenan profundas pero repiten lo obvio",
        "Una estrategia pensada solo para el corto plazo",
      ],
      correctas: [2],
      segundos: 20,
    },
    {
      tema: "No enfrentar el problema",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto:
        "El problema central de una empresa es que sus clientes se van a la competencia, pero su plan estratégico ni lo menciona. ¿Qué señal de mala estrategia es?",
      opciones: ["La palabrería", "Un objetivo próximo", "No enfrentar el problema", "El apalancamiento"],
      correctas: [2],
      segundos: 25,
    },
    {
      tema: "Enfoque",
      dificultad: "media",
      tipo: "VERDADERO_FALSO",
      texto:
        "Para Rumelt, una buena estrategia concentra los recursos en pocos puntos donde pesan más, en vez de repartirlos para dejar contentos a todos.",
      opciones: [],
      correctas: VERDADERO,
      segundos: 15,
    },
    {
      tema: "Objetivos estratégicos malos",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto:
        "Un plan trae decenas de «objetivos estratégicos» que en realidad son tareas sueltas, sin prioridad ni relación entre sí. Para Rumelt, ¿qué señal de mala estrategia es?",
      opciones: [
        "Objetivos estratégicos malos",
        "La palabrería",
        "Un diagnóstico demasiado profundo",
        "Acciones coherentes",
      ],
      correctas: [0],
      segundos: 25,
    },
    {
      tema: "Objetivos próximos",
      dificultad: "difícil",
      tipo: "OPCION_MULTIPLE",
      texto: "¿Qué es un «objetivo próximo» en el libro de Rumelt?",
      opciones: [
        "La meta más ambiciosa posible, para estirar al equipo",
        "Un objetivo que se cumple siempre en menos de un año",
        "El objetivo que tiene la competencia más cercana",
        "Un objetivo lo bastante cercano y concreto como para que el equipo pueda alcanzarlo",
      ],
      correctas: [3],
      segundos: 30,
    },
    {
      tema: "Sistemas de eslabones",
      dificultad: "difícil",
      tipo: "VERDADERO_FALSO",
      texto:
        "En un sistema de «eslabones de cadena», mejorar mucho un solo eslabón sube el desempeño aunque los demás sigan débiles.",
      opciones: [],
      correctas: FALSO, // el desempeño lo limita el eslabón más débil
      segundos: 20,
    },
    {
      tema: "Apalancamiento",
      dificultad: "difícil",
      tipo: "OPCION_MULTIPLE",
      texto: "Según Rumelt, ¿de dónde sale el apalancamiento de una estrategia?",
      opciones: [
        "De endeudarse para crecer más rápido",
        "De repartir el esfuerzo en muchos frentes a la vez",
        "De tener más presupuesto que la competencia",
        "De anticipar, encontrar el punto de pivote y concentrar el esfuerzo ahí",
      ],
      correctas: [3],
      segundos: 25,
    },
    {
      tema: "Un ejemplo del libro",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto:
        "Rumelt usa el regreso de Steve Jobs a Apple en 1997 como ejemplo de buena estrategia. ¿Qué hizo Jobs?",
      opciones: [
        "Bajó los precios de toda la línea",
        "Recortó la línea a unos pocos productos y se concentró en ellos",
        "Siguió licenciando el sistema operativo a otros fabricantes",
        "Compró varias empresas de la competencia",
      ],
      correctas: [1],
      segundos: 25,
    },
  ],
};

// ── Cómo funciona Nexus ─────────────────────────────────────────────────────

const NEXUS: TriviaDeEjemplo = {
  titulo: "Cómo funciona Nexus",
  preguntas: [
    {
      tema: "Para ti",
      dificultad: "fácil",
      tipo: "OPCION_MULTIPLE",
      texto: "Cuando entras a Nexus, ¿qué pantalla ves primero?",
      opciones: [
        "La lista de todos los clientes",
        "El tablero de cobranza",
        "«Para ti»: lo que te toca, de todos los módulos",
        "Las integraciones con HubSpot y Google",
      ],
      correctas: [2],
      segundos: 20,
    },
    {
      tema: "Las reuniones",
      dificultad: "fácil",
      tipo: "OPCION_MULTIPLE",
      texto: "¿De dónde saca Nexus las reuniones con los clientes?",
      opciones: ["De Google Meet", "De Fireflies", "De Zoom", "De Microsoft Teams"],
      correctas: [0],
      segundos: 20,
    },
    {
      tema: "El recorrido de una cuenta",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto: "¿En qué orden avanza una cuenta por estas piezas de Nexus?",
      opciones: [
        "Handoff → Preventa → Cronograma → Kickoff",
        "Kickoff → Preventa → Handoff → Cronograma",
        "Preventa → Cronograma → Handoff → Kickoff",
        "Preventa → Handoff → Kickoff → Cronograma",
      ],
      correctas: [3],
      segundos: 25,
    },
    {
      tema: "El kickoff",
      dificultad: "media",
      tipo: "VERDADERO_FALSO",
      texto:
        "El cliente ve su kickoff en una página propia, con el enlace que le compartes, sin entrar al Nexus del equipo.",
      opciones: [],
      correctas: VERDADERO,
      segundos: 15,
    },
    {
      tema: "La etapa de Hand-off",
      dificultad: "difícil",
      tipo: "OPCION_MULTIPLE",
      texto: "En un proyecto, ¿con qué se cierra la etapa de Hand-off?",
      opciones: [
        "Con la firma de la propuesta comercial",
        "Al publicar (o realizar) el kickoff con el cliente",
        "Al terminar el cronograma",
        "Cuando el cliente responde los cuestionarios",
      ],
      correctas: [1],
      segundos: 25,
    },
    {
      tema: "Fuera de alcance",
      dificultad: "media",
      tipo: "OPCION_MULTIPLE",
      texto: "En una reunión, el cliente pide algo que no estaba en lo vendido. ¿Qué hace Nexus?",
      opciones: [
        "Propone una solicitud fuera de alcance, que el CSE confirma o descarta",
        "Lo suma solo al cronograma",
        "Le manda una cotización al cliente",
        "Lo borra de la minuta",
      ],
      correctas: [0],
      segundos: 25,
    },
    {
      tema: "El chat de Nexus",
      dificultad: "media",
      tipo: "VERDADERO_FALSO",
      texto: "El chat de Nexus cambia tus documentos por su cuenta, sin que tú apliques lo que propone.",
      opciones: [],
      correctas: FALSO, // propone; aplicar pasa por el editor, con vista previa
      segundos: 15,
    },
    {
      tema: "La escala",
      dificultad: "difícil",
      tipo: "OPCION_MULTIPLE",
      texto: "¿Cuál es el orden de los cinco niveles de la escala, del más bajo al más alto?",
      opciones: [
        "Inicial · Deficiente · Funcional · Óptimo · Eficiente",
        "Deficiente · Funcional · Inicial · Eficiente · Óptimo",
        "Deficiente · Inicial · Funcional · Eficiente · Óptimo",
        "Inicial · Funcional · Deficiente · Eficiente · Óptimo",
      ],
      correctas: [2],
      segundos: 30,
    },
    {
      tema: "Trivias",
      dificultad: "fácil",
      tipo: "OPCION_MULTIPLE",
      texto: "Para jugar una trivia de Nexus, ¿qué necesitas?",
      opciones: [
        "Un apodo y el código, sin iniciar sesión",
        "Abrir el enlace o el QR de la partida con tu usuario de Nexus",
        "El permiso del módulo Trivias",
        "Descargar una aplicación aparte",
      ],
      correctas: [1],
      segundos: 20,
    },
    {
      tema: "Feedback",
      dificultad: "fácil",
      tipo: "VERDADERO_FALSO",
      texto:
        "Cualquiera del equipo puede reportar en «Feedback», al pie del menú; la bandeja la revisa dirección.",
      opciones: [],
      correctas: VERDADERO,
      segundos: 15,
    },
  ],
};

export const TRIVIAS_DE_EJEMPLO: readonly TriviaDeEjemplo[] = [HUBSPOT, RUMELT, NEXUS];

/** Una trivia tal como la manda la pantalla (POST /api/trivia): título y preguntas, sin los datos de catálogo. */
export function comoLaMandaLaPantalla(t: TriviaDeEjemplo) {
  return {
    titulo: t.titulo,
    preguntas: t.preguntas.map(({ tipo, texto, opciones, correctas, segundos }) => ({
      tipo,
      texto,
      opciones,
      correctas,
      segundos,
    })),
  };
}
