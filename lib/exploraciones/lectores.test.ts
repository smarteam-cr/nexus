/**
 * lib/exploraciones/lectores.test.ts — QUIÉN lee una exploración de venta, y para qué.
 * Correr: `npx vitest run lib/exploraciones/lectores.test.ts --project unit`.
 *
 * La exploración tiene cosas que el cliente nunca puede ver (hipótesis, presupuesto, quién decide,
 * lo que nadie exploró, la apertura a la asesoría). La defensa no es el prompt: es que cada lector
 * use la puerta que corresponde a su destino.
 *   · La PROPUESTA (la ve el cliente) solo por `paraLaPropuesta`, que devuelve el bloque sin lo
 *     interno ni ids de la escala y la posición desde el chequeo: nunca el estado.
 *   · El HANDOFF con `exploracionParaElHandoff`, SIN lo interno: ese agente escribe también lo que
 *     leen los documentos del cliente. Lo interno solo llega a la columna del contexto (pantalla).
 *   · Ningún documento del cliente (kickoff, entrega, diagnóstico…) la lee directo: le llega, si
 *     acaso, por el handoff y con sus listas de siempre.
 *
 * El modo de falla es de OMISIÓN: alguien suma un lector nuevo y no se acuerda. Por eso es un
 * censo: un archivo que importa de lib/exploraciones o toca la tabla y no está declarado acá pone
 * esto en rojo hasta que alguien escriba para qué la lee y por qué puerta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

type Destino =
  | "ventas"
  | "propuesta-al-cliente"
  | "handoff-interno"
  | "disparo"
  | "cuestionario-al-cliente"
  | "guia-interna"
  /** La exploración de un PROYECTO (2026-10-07, lib/exploraciones/marco.ts): la pieza de la ficha y lo que leen sus documentos. */
  | "exploracion-del-proyecto"
  /** El correo de seguimiento de una reunión (2026-10-07): lo lee el cliente, lo revisa y lo manda una persona. */
  | "correo-al-cliente"
  /**
   * El agente vigía de Éxito del cliente (2026-10-09): lee los CORREOS de la empresa en HubSpot con el lector de la
   * exploración (`correosDeLaEmpresa`), nunca una exploración. Sus alertas son internas (la CSL).
   */
  | "vigia-interno"
  /**
   * La memoria INTERNA de la cuenta (2026-10-09, lib/memoria, etapa 3): lo aprendido en la preventa —con lo interno
   * rotulado— para los agentes internos (implementación, avance, resumen del proyecto, exploración del proyecto). Nunca
   * llega al alcance del cliente ni al handoff: lo corta el armador (lib/memoria/armar.ts) y lo prueba frontera.test.ts.
   */
  | "memoria-interna"
  /**
   * Las SUGERENCIAS del panel de los documentos del proyecto (etapa 7 de la memoria de la cuenta, 2026-10-10): qué
   * reunión es la de cada sesión de la exploración del proyecto, para sugerirla en el diagnóstico. Pantalla interna; solo
   * las sesiones y su número, nunca lo que se confirmó ni lo que leyó el agente. Nada llega a un documento hasta que una
   * persona toca «Usar».
   */
  | "sugerencias-del-documento"
  /**
   * La escala de la EMPRESA (La cuenta › La escala, 2026-10-12) y el panel del Resumen de un servicio recurrente: los
   * niveles CONFIRMADOS de cada exploración (de la preventa y de cada proyecto) y las reuniones agendadas con la empresa.
   * Pantallas internas; nada llega a un documento ni al cliente.
   */
  | "escala-de-la-empresa"
  /**
   * La agenda de hoy de «Para ti» (etapa 4c de docs/mi-dia-plan.md, 2026-10-16): usa los ayudantes del calendario de
   * la exploración (los invitados de un evento, sus fechas, los dominios genéricos) para saber con qué empresa es cada
   * reunión. No lee ninguna exploración.
   */
  | "agenda-interna"
  /**
   * La investigación web de la EMPRESA (R5, 2026-10-24, lib/clients/investigacion): usa los ayudantes de la radiografía
   * (los enlaces de las búsquedas, la empresa en HubSpot, la fecha de Costa Rica). No lee ninguna exploración; lo que
   * encuentra queda en la empresa como propuestas que decide una persona, nunca en un documento del cliente.
   */
  | "investigacion-de-la-empresa"
  /** INV56 (2026-10-26): solo de qué empresa es la preventa de la que salió una investigación. Nada de su contenido. */
  | "invariante-de-la-empresa"
  /**
   * El EQUIPO DEL CLIENTE de una reunión del proyecto (L5 etapa 2, 2026-10-25): el catálogo de los seis equipos
   * (lib/exploraciones/equipos.ts › EQUIPOS) para elegirlo en el Contexto del diagnóstico y guardarlo en el vínculo de la
   * reunión con el proyecto. No lee ninguna exploración.
   */
  | "equipos-del-cliente"
  /**
   * El ANALIZADOR DE REUNIONES DE VENTA (S3, 2026-10-25, lib/analizador-venta): lee la guía que la preventa llevó a UNA
   * reunión y las dimensiones de la escala del área, de la preventa de la MISMA empresa dueña de la reunión, para juzgar
   * qué tan consultiva fue. Interno (coaching para Ventas): nunca llega a un documento del cliente.
   */
  | "analizador-de-venta";

const CENSO: Record<string, { destino: Destino; motivo: string }> = {
  "lib/analizador-venta/analizar-server.ts": { destino: "analizador-de-venta", motivo: "Qué empresa tiene una preventa de venta abierta (solo el clientId), para decidir si una reunión es de venta." },
  "lib/analizador-venta/guia-de-la-reunion-server.ts": {
    destino: "analizador-de-venta",
    motivo: "La guía que se llevó a la reunión (la de antes de la reunión, como la lectura de la preventa) y las dimensiones de la escala, de la preventa de la empresa dueña de la reunión.",
  },
  "lib/clients/investigacion/pedido.ts": { destino: "investigacion-de-la-empresa", motivo: "Reusa los enlaces de las búsquedas de la radiografía." },
  "lib/clients/investigacion/servidor.ts": { destino: "investigacion-de-la-empresa", motivo: "Lee la empresa en HubSpot con el lector de la exploración y la fecha de Costa Rica." },
  "lib/clients/lo-que-le-falta-comprar-server.ts": {
    destino: "escala-de-la-empresa",
    motivo: "Lo que le falta comprar (R12): lee solo los niveles de la foto más reciente (escalaParaLaPropuesta), interno, para la ficha y el siguiente caso en HubSpot.",
  },
  "lib/invariantes/empresa.ts": {
    destino: "invariante-de-la-empresa",
    motivo: "INV56 (2026-10-26): compara de qué empresa es cada investigación y la preventa de la que salió. No lee su contenido.",
  },
  "lib/clients/personas-de-la-empresa.ts": {
    destino: "agenda-interna",
    motivo: "Una persona del cliente (R6): usa solo la lista de dominios genéricos del calendario. No lee ninguna exploración.",
  },
  "app/(shell)/sales/exploraciones/page.tsx": { destino: "ventas", motivo: "La lista de exploraciones." },
  "app/(shell)/sales/exploraciones/[id]/page.tsx": { destino: "ventas", motivo: "El lienzo." },
  "app/api/sales/exploraciones/route.ts": { destino: "ventas", motivo: "Abrir una exploración." },
  "app/api/sales/exploraciones/[id]/route.ts": { destino: "ventas", motivo: "Leer y cambiar el lienzo." },
  "app/api/sales/exploraciones/[id]/agente/route.ts": { destino: "ventas", motivo: "Lanzar y seguir al agente." },
  "app/api/sales/exploraciones/[id]/propuesta/route.ts": { destino: "ventas", motivo: "Armar la propuesta desde el lienzo." },
  "app/api/sales/exploraciones/[id]/documentos/route.ts": { destino: "ventas", motivo: "Sumar a mano una sesión o un documento, y listarlos." },
  "app/api/sales/exploraciones/[id]/documentos/[documentoId]/route.ts": { destino: "ventas", motivo: "Quitar lo que se sumó a mano." },
  "app/api/sales/exploraciones/[id]/preparacion/route.ts": { destino: "ventas", motivo: "Los hechos de HubSpot de la pieza Preparación." },
  "app/api/sales/exploraciones/[id]/reuniones/route.ts": {
    destino: "ventas",
    motivo: "El buscador del selector de «Agregar sesión»: las reuniones de la empresa y del calendario. El POST (elegir una suelta) responde 410 desde el 2026-10-10.",
  },
  "app/api/sales/exploraciones/empresas/route.ts": { destino: "ventas", motivo: "Buscar la empresa." },
  "app/api/sales/exploraciones/[id]/hubspot/route.ts": {
    destino: "ventas",
    motivo: "Al abrir la preventa, sumar las reuniones que se grabaron con HubSpot (y que el agente lea las nuevas).",
  },
  "app/api/sales/exploraciones/[id]/agendadas/route.ts": {
    destino: "ventas",
    motivo: "«Agendadas · próximas 6 semanas» del selector de «Agregar sesión» (etapa A): lee el calendario y dice si ya es una sesión.",
  },
  "app/api/sales/exploraciones/[id]/sesiones/route.ts": {
    destino: "ventas",
    motivo: "«+ Agregar sesión» (etapa A): agrega una sesión agendada, una que ya pasó (adopta la sin dueño) o una sin reunión.",
  },
  "app/api/sales/exploraciones/[id]/calendario/route.ts": {
    destino: "ventas",
    motivo: "Al abrir la exploración, mirar si las reuniones agendadas de las sesiones se movieron o se cancelaron (etapa A).",
  },
  "app/api/sales/exploraciones/[id]/correo/route.ts": {
    destino: "correo-al-cliente",
    motivo:
      "Armar el correo de seguimiento de una reunión. Lo que lee el agente lo decide `insumosDelCorreo` (sin lo interno). " +
      "Desde la etapa 3 de la memoria suma la minuta y los compromisos de esa reunión (sin la cita) y la memoria de la cuenta " +
      "con el alcance del cliente (lector «correo» en lib/memoria/consumidores.ts). Nunca Tareas.",
  },
  "lib/seguimiento/reunion/correo-server.ts": {
    destino: "correo-al-cliente",
    motivo:
      "El correo de seguimiento de una reunión con un cliente, desde su página (ficha G, 2026-10-17). Reúsa el correo de las " +
      "exploraciones por su puerta (`escribirElCorreoDeSeguimiento`, más los ayudantes puros): nunca una exploración, ni " +
      "Tareas, ni hechos. Lo de la reunión sale del chokepoint; la memoria, con el alcance del cliente.",
  },
  "app/api/sales/exploraciones/sugerencias/route.ts": { destino: "ventas", motivo: "«Llegaron por el test»." },
  "app/api/business-cases/[id]/preventa/route.ts": {
    destino: "ventas",
    motivo: "La columna «Preventa» del contexto de la propuesta (pantalla interna) y usar una preventa de la misma empresa.",
  },
  "app/api/business-cases/preventas/route.ts": { destino: "ventas", motivo: "Ofrecer las preventas de la empresa al crear una propuesta." },
  "app/api/business-cases/[id]/generate/route.ts": { destino: "propuesta-al-cliente", motivo: "La exploración como fuente de la propuesta y su posición en la escala." },
  "app/api/business-cases/[id]/canvas-sections/[sectionId]/blocks/regenerate/route.ts": {
    destino: "propuesta-al-cliente",
    motivo: "Regenerar la sección de la escala desde el chequeo.",
  },
  "app/api/clients/[id]/analyze/route.ts": { destino: "handoff-interno", motivo: "El bloque de la exploración en el handoff de Customer Success." },
  "app/api/projects/[projectId]/exploracion-de-venta/route.ts": { destino: "handoff-interno", motivo: "La cuarta columna del contexto del handoff." },
  "app/api/sales/exploraciones/[id]/guia/pregunta/route.ts": {
    destino: "ventas",
    motivo: "«Regenerar» una pregunta de la guía de la próxima sesión (validación 69): pantalla interna del vendedor.",
  },
  "app/api/sales/exploraciones/[id]/guia/objetivo/route.ts": {
    destino: "ventas",
    motivo: "Las preguntas que propone Nexus al guardar el objetivo de la próxima sesión (CEMACO, 2026-10-20): pantalla interna; quedan como propuestas en la sesión.",
  },
  "components/nexus-chat/ChatDeNexus.tsx": {
    destino: "ventas",
    motivo: "Al aplicar una lista que toca la guía avisa a la exploración abierta que se vuelva a leer (aviso-de-la-guia.ts). No lee ninguna exploración.",
  },
  "lib/operaciones/guia-server.ts": {
    destino: "ventas",
    motivo: "El asistente de la guía (validación 71): leer la guía de la próxima sesión y proponer cambios. Chat interno; nada llega al cliente.",
  },
  "lib/operaciones/contexto-server.ts": {
    destino: "ventas",
    motivo: "Reconoce el error de un cambio a la guía (ErrorDeLaGuia) para darle su mensaje a la persona. No lee ninguna exploración.",
  },
  "lib/nexus-chat/turno-server.ts": {
    destino: "ventas",
    motivo: "El chat de la cuenta abierto desde la guía: suma la guía de la próxima sesión al mensaje de ese turno. Chat interno.",
  },
  "lib/sessions/post-process.ts": { destino: "disparo", motivo: "Lanza la lectura automática de una reunión; no lee contenido." },
  "lib/sessions/post-process-viejo.ts": {
    destino: "disparo",
    motivo: "La copia congelada del post-proceso (el retroceso de SEGUIMIENTO_REUNIONES_ENABLED=0): lanza lo mismo; no lee contenido.",
  },
  "lib/lecturas/recuperacion.ts": {
    destino: "ventas",
    motivo: "El modo de recuperación de las lecturas (T2): una empresa con una preventa viva cuenta como activa. Solo pregunta si existe, nada de su contenido.",
  },
  "lib/lecturas/personas.ts": {
    destino: "ventas",
    motivo: "La lectura de seguimiento (memoria de la cuenta, etapa 2): a quién va el seguimiento de lo que prometió un prospecto. Solo el responsable de la preventa viva, nada de su contenido.",
  },
  "lib/auth/access.ts": {
    destino: "ventas",
    motivo: "Acceso a la empresa de una preventa viva (un prospecto) para quien trabaja las preventas. Solo cuenta filas.",
  },
  "lib/para-ti/fuentes/preventa.ts": {
    destino: "ventas",
    motivo: "«Para ti» (interno): cuántas sugerencias esperan y la próxima reunión de las preventas que lleva cada persona.",
  },
  "lib/business-cases/pais-del-cliente-server.ts": {
    destino: "ventas",
    motivo: "La propuesta (interna, el editor de la Inversión): el país que anotó la preventa, para ofrecer el IVA de Costa Rica. Solo lee el país.",
  },
  "lib/business-cases/mutations.ts": {
    destino: "ventas",
    motivo: "«Para ti»: avisarle a quien lleva la preventa que el cliente aprobó la propuesta. Solo lee el responsable.",
  },
  "lib/guia-exploracion/servidor.ts": {
    destino: "guia-interna",
    motivo: "La guía de exploración del CSE (interna) muestra dónde quedó el cliente en el preliminar. Solo niveles.",
  },
  "lib/guia-exploracion/agente.ts": {
    destino: "guia-interna",
    motivo: "El agente de la guía lee los niveles del preliminar como punto de partida (interno, nunca al cliente).",
  },
  "app/api/projects/[projectId]/exploracion/route.ts": {
    destino: "exploracion-del-proyecto",
    motivo: "Abrir y leer la exploración del proyecto en su ficha (pantalla interna del CSE).",
  },
  "lib/canvas/load-canvas-context.ts": {
    destino: "exploracion-del-proyecto",
    motivo:
      "Diagnóstico y Planificación leen lo confirmado de la exploración del proyecto (la estrategia, la escala con evidencia): " +
      "lo dijo el cliente con su CSE, en el proyecto. Nunca una preventa ni la libreta del CSE. Desde el 2026-10-23 también " +
      "cuánto hay confirmado y propuesto (solo números) para «Antes de generar» del diagnóstico.",
  },
  "lib/tareas/clientes.ts": {
    destino: "ventas",
    motivo:
      "Tareas internas: qué empresas puede elegir una persona en una tarea. Es el paso de la preventa de " +
      "requireAccessToClient (un prospecto con una preventa viva). Solo cuenta filas, con DE_LA_PREVENTA.",
  },
  "lib/tareas/mutaciones.ts": {
    destino: "ventas",
    motivo: "Tareas internas: vincular una preventa a una tarea. Solo su id y el nombre de la empresa, con DE_LA_PREVENTA.",
  },
  "lib/tareas/consultas.ts": {
    destino: "ventas",
    motivo: "Tareas internas: buscar una preventa para vincularla (nombre de la empresa) y el enlace del vínculo. Con DE_LA_PREVENTA.",
  },
  "lib/comunicaciones/copia-server.ts": {
    destino: "ventas",
    motivo:
      "U8 (2026-10-25): si la preventa de la empresa se trabajó en Nexus en los últimos 90 días, para decidir si la IA lee " +
      "sus correos. Solo la fecha de la última, con DE_LA_PREVENTA; no lee su contenido.",
  },
  "lib/cs/cartera.ts": {
    destino: "ventas",
    motivo: "La clasificación de la cartera (Éxito del cliente, interno): si la empresa tiene una preventa abierta. Solo cuenta filas, con DE_LA_PREVENTA.",
  },
  "app/api/clients/[id]/escala/route.ts": {
    destino: "escala-de-la-empresa",
    motivo:
      "La cuenta › La escala: los niveles confirmados de las exploraciones de la empresa, con la fecha y sus versiones; " +
      "guardar una versión, regenerar con el agente y activarlo en un proyecto (ficha B). Pantalla interna.",
  },
  "app/api/projects/[projectId]/estado-del-documento/route.ts": {
    destino: "escala-de-la-empresa",
    motivo: "Presentar el diagnóstico deja la foto de la escala de la exploración del proyecto (ficha B). No lee contenido: lo escribe versiones-de-la-escala.ts.",
  },
  "components/clients/EscalaDeLaCuenta.tsx": {
    destino: "escala-de-la-empresa",
    motivo: "La pantalla de La escala de la cuenta (solo los tipos de escalaDeLaEmpresa).",
  },
  "lib/servicios/recurrencia-server.ts": {
    destino: "escala-de-la-empresa",
    motivo:
      "El porqué de recomendar SmartLoop en el «Qué sigue» (pantalla interna): los niveles confirmados de la escala de la " +
      "empresa (escalaParaLaPropuesta, sin frases ni porqué) para el camino de crecimiento. No lee la propuesta ni lo interno.",
  },
  "lib/servicios/panel-del-servicio-server.ts": {
    destino: "escala-de-la-empresa",
    motivo: "Las sesiones fijas del Resumen de un servicio recurrente: las reuniones de una serie con la empresa en el calendario. No lee ninguna exploración.",
  },
  "lib/cs/watchdog-cuenta.ts": {
    destino: "vigia-interno",
    motivo: "Los correos del cliente con la empresa en HubSpot, para ver quejas y retrasos. No lee ninguna exploración.",
  },
  "lib/memoria/cargar.ts": {
    destino: "memoria-interna",
    motivo:
      "La memoria de la cuenta: lo aprendido en la preventa, solo en el alcance interno (queCargar). Por la puerta " +
      "loAprendidoEnLaPreventa (la escala estimada y lo que dijo el cliente, más lo interno rotulado), nunca la fila.",
  },
  "lib/contexto/sugerencias-del-documento.ts": {
    destino: "sugerencias-del-documento",
    motivo: "La regla pura de las sugerencias: qué reunión es de qué sesión (sesionUnidaALaReunion) y su número (pestanasDeSesiones).",
  },
  "lib/contexto/sugerencias-del-documento-server.ts": {
    destino: "sugerencias-del-documento",
    motivo: "Arma las sugerencias del panel: las sesiones de la exploración del proyecto por su puerta (sesionesDeLaExploracionDelProyecto).",
  },
  "lib/rentabilidad/horas-del-calendario.ts": {
    destino: "agenda-interna",
    motivo: "Las horas de Rentabilidad que salen del calendario (iniciativa C): los ayudantes del calendario (invitados, fechas). No lee exploraciones.",
  },
  "lib/mi-dia/agenda.ts": {
    destino: "agenda-interna",
    motivo: "La agenda de hoy de «Para ti»: los ayudantes del calendario (invitados, fechas, dominios genéricos). No lee exploraciones.",
  },
  "lib/servicios/arranque-del-ciclo-server.ts": {
    destino: "exploracion-del-proyecto",
    motivo: "M2 (2026-10-25): si el ciclo de un SmartLoop ya exploró antes del diagnóstico. Solo las FECHAS de lo que leyó la exploración del proyecto (fechasDeLasLecturasDelProyecto), nunca lo que dice.",
  },
  "app/api/projects/[projectId]/contexto/[pieza]/equipo/route.ts": {
    destino: "equipos-del-cliente",
    motivo: "Valida que el equipo sea uno de los seis (EQUIPOS_DEL_CLIENTE) al guardarlo en el vínculo de la reunión con el proyecto.",
  },
  "components/clients/SessionSelectionReview.tsx": {
    destino: "equipos-del-cliente",
    motivo: "El selector «Equipo del cliente» de cada reunión que entra sola al diagnóstico: los nombres de los seis equipos (EQUIPOS).",
  },
  "lib/sessions/equipo-de-la-reunion-server.ts": {
    destino: "equipos-del-cliente",
    motivo: "Lee y escribe el equipo de la reunión en el proyecto; valida la clave con esEquipo.",
  },
  "lib/cuestionario/escala.ts": {
    destino: "cuestionario-al-cliente",
    motivo: "El cuestionario de escala llega con el nivel ya ubicado marcado, para que la persona lo confirme. Solo niveles.",
  },
};

/** Lo que cada destino puede importar de lib/exploraciones (además de tipos). */
const PUERTAS: Record<Exclude<Destino, "ventas">, { permitidas: RegExp; prohibidas: RegExp }> = {
  "propuesta-al-cliente": {
    permitidas: /\bparaLaPropuesta\b/,
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\.estado\b/,
  },
  "handoff-interno": {
    permitidas: /exploracionParaElHandoff|exploracionDelProyecto|exploracionParaLaPropuesta/,
    prohibidas: /\.exploracionDeVenta\b/,
  },
  "guia-interna": {
    permitidas: /\bubicacionPreviaDelProyecto\b/,
    prohibidas: /\.exploracionDeVenta\b/,
  },
  "cuestionario-al-cliente": {
    permitidas: /\bubicacionPreviaDelProyecto\b/,
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\.estado\b/,
  },
  "exploracion-del-proyecto": {
    permitidas: /\btextoDeLaExploracionDelProyecto\b|\basegurarExploracionDelProyecto\b|\bcuantoHayEnLaExploracionDelProyecto\b|\bfechasDeLasLecturasDelProyecto\b/,
    // Nunca lo de la preventa: ni la propuesta, ni el handoff, ni lo interno.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff/,
  },
  "correo-al-cliente": {
    permitidas: /\barmarCorreoDeSeguimiento\b|\bescribirElCorreoDeSeguimiento\b/,
    // Ni los hechos de las reuniones (memoria de la cuenta, etapa 6): traen citas internas y nadie los revisó.
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\.estado\b|hechoDeReunion|HechoDeReunion|@\/lib\/seguimiento\/hechos/,
  },
  "vigia-interno": {
    permitidas: /\bcorreosDeLaEmpresa\b/,
    // Sin `.estado`: el vigía lee el estado de los cobros de la cuenta, que no es el de una exploración.
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b/,
  },
  disparo: {
    permitidas: /leerReunionNueva/,
    prohibidas: /exploracionParaElHandoff|bloqueParaLaPropuesta|\.exploracionDeVenta\b/,
  },
  "sugerencias-del-documento": {
    permitidas: /\bsesionesDeLaExploracionDelProyecto\b|\bsesionUnidaALaReunion\b/,
    // Solo qué reunión es de qué sesión: ni la propuesta, ni el handoff, ni lo interno, ni lo confirmado.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|textoDeLaExploracionDelProyecto/,
  },
  "escala-de-la-empresa": {
    permitidas: /\bescalaDeLaEmpresa\b|EscalaDeLaEmpresa\b|\bagendadasConLaEmpresa\b|\bguardarVersionDelDiagnostico\b|\bescalaParaLaPropuesta\b|\bdiaDelMomento\b/,
    // Solo los niveles confirmados y las reuniones agendadas: ni la propuesta, ni el handoff, ni lo interno de la preventa.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b/,
  },
  "agenda-interna": {
    permitidas: /\binvitadosDelEvento\b|\bisoDelEvento\b|\bDOMINIOS_GENERICOS\b/,
    // Solo el calendario: ninguna exploración, ni la propuesta, ni el handoff, ni lo interno.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\bexploracionesDeVenta\b/,
  },
  "investigacion-de-la-empresa": {
    permitidas: /\benlacesDeLasBusquedas\b|\burlComparable\b|\bleerEmpresa\b|\bhoyEnCostaRica\b/,
    // Ninguna exploración: ni lo confirmado, ni la propuesta, ni el handoff, ni lo interno de la preventa.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\bexploracionesDeVenta\b/,
  },
  "invariante-de-la-empresa": {
    // Solo de qué empresa es la preventa: `exploracion: { select: { clientId: true } }`.
    permitidas: /\bexploracion\s*:\s*\{\s*select\s*:\s*\{\s*clientId\s*:\s*true\s*\}\s*\}/,
    prohibidas: /@\/lib\/exploraciones\/|\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\bexploracionesDeVenta\b|contenido\s*:\s*true/,
  },
  "analizador-de-venta": {
    // La guía de antes de la reunión y la escala (las mismas piezas que la lectura de la preventa), o solo saber si hay preventa.
    permitidas: /guiaDeAntesDeLaReunion|\.exploracionDeVenta\b/,
    // Nada que vaya al cliente ni al handoff: el análisis es interno.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|bloqueParaElHandoff|internoParaElCse/,
  },
  "equipos-del-cliente": {
    permitidas: /\bEQUIPOS\b|\bEQUIPOS_DEL_CLIENTE\b|\besEquipo\b/,
    // Solo el catálogo de los equipos: ninguna exploración, ni la propuesta, ni el handoff, ni lo interno.
    prohibidas: /\bparaLaPropuesta\b|bloqueParaLaPropuesta|exploracionParaElHandoff|internoParaElCse|bloqueParaElHandoff|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\bexploracionesDeVenta\b/,
  },
  "memoria-interna": {
    permitidas: /\bloAprendidoEnLaPreventa\b/,
    prohibidas: /bloqueParaLaPropuesta|\bparaLaPropuesta\b|leerExploracion\b|\.exploracionDeVenta\b/,
  },
};

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

/* Por import, por la tabla en Prisma (también por sus relaciones: `client.exploracionesDeVenta`,
   `businessCase.exploracion`) y por SQL crudo. */
const LEE = /@\/lib\/exploraciones\/|\.exploracionDeVenta\b|\bexploracionesDeVenta\b|\bexploracion\s*:\s*\{|"ExploracionDeVenta"/;

describe("⛔ quién lee una exploración de venta", () => {
  const lectores = ["app", "lib", "components"]
    .flatMap(archivos)
    .filter((f) => !f.startsWith("lib/exploraciones/") && !f.startsWith("components/exploraciones/"))
    .filter((f) => LEE.test(fs.readFileSync(path.join(RAIZ, f), "utf8")))
    .sort();

  it("cada lector está en el censo, con su destino", () => {
    const sinDeclarar = lectores.filter((f) => !(f in CENSO));
    expect(
      sinDeclarar,
      "Lector(es) de la exploración sin declarar en lib/exploraciones/lectores.test.ts. Escribe a qué documento alimenta y por qué puerta: " +
        "lo que ve el cliente solo con bloqueParaLaPropuesta / posicionDesdeElChequeo; el handoff con exploracionParaElHandoff.",
    ).toEqual([]);
  });

  it("no quedan entradas muertas en el censo", () => {
    const muertas = Object.keys(CENSO).filter((f) => !lectores.includes(f));
    expect(muertas, "Estas entradas ya no leen la exploración: bórralas").toEqual([]);
  });

  it("cada lector usa la puerta de su destino, y ninguna otra", () => {
    const mal: string[] = [];
    for (const f of lectores) {
      const d = CENSO[f]?.destino;
      if (!d || d === "ventas") continue;
      const fuente = fs.readFileSync(path.join(RAIZ, f), "utf8");
      const { permitidas, prohibidas } = PUERTAS[d];
      if (!permitidas.test(fuente)) mal.push(`${f}: no usa ninguna puerta de «${d}»`);
      if (prohibidas.test(fuente)) mal.push(`${f}: usa algo que «${d}» no puede leer (${fuente.match(prohibidas)?.[0]})`);
    }
    expect(mal).toEqual([]);
  });

  it("ningún documento del cliente la lee directo (kickoff, entrega, diagnóstico, cronograma)", () => {
    const deDocumentos = lectores.filter((f) => /kickoff|entrega|diagnostic|timeline|cronograma|external/i.test(f));
    expect(deDocumentos).toEqual([]);
  });
});

describe("⛔ la lectura que alimenta el correo al cliente no recibe la memoria interna", () => {
  /* El resumen de la LECTURA de una reunión es lo que el correo de seguimiento usa como «lo que se leyó» (alcance
     cliente). En un proyecto, la memoria interna (F0) trae los hechos de otras reuniones sin revisar: al leer, no entra.
     La edición que pone esto en rojo: volver a llamar `fuentesDelProyecto` sin `conMemoria` al leer. */
  it("fuentes.ts pide las fuentes del proyecto sin la memoria cuando lee una reunión", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/exploraciones/fuentes.ts"), "utf8");
    expect(fuente).toContain('fuentesDelProyecto(opts.projectId, opts.clientId, { conMemoria: opts.modo !== "leer" })');
  });
  it("y fuentes-del-proyecto.ts no lee la memoria con `conMemoria: false`", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/exploraciones/fuentes-del-proyecto.ts"), "utf8");
    expect(fuente).toMatch(/conMemoria\s*\?\s*memoriaDeLaCuenta\(/);
  });
});
