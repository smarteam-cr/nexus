/**
 * lib/tareas/inicio.ts — el texto del inicio de Tareas en cuatro pasos (R1, docs/tareas-plan.md §9.1). CLIENT-SAFE.
 *
 * Honesto hasta 1C: la lectura la pide alguien, así que el paso 1 dice cómo pedirla y el 2 no promete «sola». Cuando
 * exista la lectura automática, cambia este texto (y la prueba de tuteo lo vigila igual).
 */

export const TITULAR_DEL_INICIO = "Lo que acuerdan en la reunión, en tu semana y en tu agenda.";

export const PASOS_DEL_INICIO = [
  {
    titulo: "Ten tus reuniones con tu equipo",
    texto: "El planning del lunes y la retro del viernes, como siempre, con las notas de Gemini encendidas. Después, pide que Nexus la lea con «Leer una reunión».",
  },
  {
    titulo: "Nexus propone las tareas y tú las aceptas",
    texto: "Nexus lee la reunión y te propone lo tuyo: Usar · Más adelante · Descartar · ¿Es esta? Nada entra solo.",
  },
  {
    titulo: "Agrégalas a tu calendario",
    texto: "Cada tarea en su propio bloque de Google Calendar. Nexus te propone el horario.",
  },
  {
    titulo: "Realiza las tareas en la semana y repite el ciclo",
    texto: "El viernes revisas tu semana: lo que no terminaste pasa a la siguiente, sin duplicarse.",
  },
] as const;

export const LINEA_DEL_INICIO = "¿Algo que no salió en la reunión? Anótalo en la línea de arriba o sugiéreselo a otra persona.";
export const PIE_DEL_INICIO = "La IA propone; tú decides. Nada entra solo.";
