/**
 * lib/tareas/reglas.ts — las constantes de Tareas internas (docs/tareas-plan.md §10). CLIENT-SAFE.
 *
 * Lo único que configura un equipo es qué reuniones lee Nexus (1C). Todo lo demás es una constante de este
 * archivo: cambiarla es un commit, no una pantalla.
 */

/** Las propuestas (tareas y proyectos) que nadie decidió pasan a `vencida` a los 14 días de crearse. */
export const DIAS_PARA_VENCER_UNA_PROPUESTA = 14;

/**
 * Cuántas sugerencias de las reuniones (sin decidir) puede tener una persona a la vez (2026-10-16, fase 1.4 de
 * docs/nexus-sistema-de-trabajo-plan.md). Con más, las más viejas vencen solas: quedan las más nuevas. Lo que pidió una
 * persona no cuenta ni vence por esto.
 */
export const MAX_SUGERENCIAS_POR_PERSONA = 10;

/** Un texto idéntico a una lápida (rechazada o fusionada por una persona) no se vuelve a proponer por 28 días. */
export const DIAS_DE_LAPIDA = 28;

/** Desde este número de pases que cuentan, la tarea lleva el chip ámbar «Pasó N veces». */
export const PASES_PARA_AVISAR = 3;

/** Cada persona puede corregir su propia revisión de una semana durante 7 días (o hasta revisar la siguiente). */
export const DIAS_PARA_CORREGIR_UNA_REVISION = 7;

/** El aviso de «Revisa tu semana» va del viernes a las 15:00 al lunes a las 6:00, en hora de Costa Rica. */
export const VENTANA_DE_REVISION = { desdeViernesHora: 15, hastaLunesHora: 6 } as const;

/** Una lectura de más de 7 días no avisa a nadie, salvo «Avisar igual». */
export const DIAS_PARA_AVISAR_UNA_LECTURA = 7;

/** Lecturas pedidas a mano por persona y por día. */
export const LECTURAS_POR_PERSONA_POR_DIA = 10;

/** Llamadas automáticas al modelo por día con `agentSlug` `tareas-*`. */
export const LLAMADAS_AUTOMATICAS_POR_DIA = 40;

/** Con menos de esto de transcripción no hay una conversación que leer (nivel 2). */
export const MIN_CARACTERES_DE_CONVERSACION = 1_000;

/** Una lectura con más de 10 minutos en `leyendo` se da por colgada. */
export const MINUTOS_PARA_DAR_POR_COLGADA = 10;

/** Topes de una tarea y de un proyecto. */
export const MAX_ETIQUETAS = 5;
export const MAX_SECCIONES = 12;
export const MAX_TITULO = 160;
export const MAX_NOTAS = 8_000;
export const MAX_PASOS = 20;

/** Candidatas de «¿Es esta?» que recibe el modelo por dueño, y tarjetas «¿Es T-12?» por línea. */
export const CANDIDATAS_POR_DUENO = 15;
export const PARECIDAS_POR_LINEA = 3;

/** La franja en la que Nexus propone horarios: de 8:00 a 17:00, en hora de Costa Rica. La grilla muestra hasta las 18:00. */
export const FRANJA_DE_AGENDA = { desdeHora: 8, hastaHora: 17, grillaHastaHora: 18 } as const;

/** Las duraciones que se ofrecen al agendar, en minutos (0,5 · 1 · 2 · 4 h). */
export const DURACIONES_DE_AGENDA = [30, 60, 120, 240] as const;

/** Los pasos de la agenda (al proponer y al arrastrar), en minutos. */
export const PASO_DE_AGENDA_MIN = 15;

/** Tope de una lectura de Haiku: max_tokens = 200 + 70 × líneas + 25 × tareas, con techo. */
export const MAX_TOKENS_DE_LA_LECTURA = 3_000;

/** Una línea con 3 o más que comparten raíces puede ser un proyecto (R10). */
export const LINEAS_PARA_UN_PROYECTO = 3;
