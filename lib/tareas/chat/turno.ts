/**
 * lib/tareas/chat/turno.ts — UN TURNO del chat de tareas (docs/tareas-plan.md §6). SERVIDOR.
 *
 * Es el MISMO chat de Nexus (el hilo, el acuerdo con su marcador, el libro de pendientes, la herramienta única, la
 * prueba en seco con un reintento, las líneas calculadas en el servidor), con su propio turno. ⚠ No es un tercer carril
 * dentro de lib/asistente/turno.ts: ese archivo lo vigilan unas 40 pruebas que leen su texto, y los pedidos del
 * cronograma y de los documentos tienen que quedar byte a byte iguales (sus cachés y sus pruebas). Lo genérico se
 * reusa de lib/asistente; lo propio de tareas vive acá (docs/DECISIONS.md › Tareas internas).
 *
 * ⛔ NO ESCRIBE TAREAS. Cuando hay acuerdo, devuelve operaciones ya normalizadas a ids, con su línea en castellano,
 * sus dependencias y sus rótulos. Aplicarlas es `POST /api/tareas/operaciones`, todo o nada, por mutaciones.ts.
 *
 * Lo que cambia respecto del chat de documentos:
 *   - el dueño del hilo es la PERSONA (un hilo por persona, en todas las pantallas);
 *   - al modelo le llega una VENTANA (desde el último acuerdo aplicado, como mucho 12 turnos) con su breakpoint de
 *     caché: el hilo es para siempre y sin ventana cada turno costaría más que el anterior;
 *   - el descarte de un pendiente arrastra lo que depende de él (descartar el proyecto se lleva sus tareas).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { agregarTurno, huellaDeContexto, type HiloConTurnos } from "@/lib/asistente/hilo";
import { marcaDeAcuerdo, textoVisible, MARCA_DE_ACUERDO, type CambioAcordado } from "@/lib/asistente/acuerdo";
import { acuerdoPendienteDelHilo, bloqueDePendientes, indiceDeEtiqueta } from "@/lib/asistente/acuerdo-vivo";
import { decidirReintento, reclamoDeImitacion, terminaEnPregunta } from "@/lib/asistente/emision-del-turno";
import { RESUMEN_DEL_CIERRE, avisoDeCierre } from "@/lib/asistente/propuesta-del-chat";
import type { ClientesQueVes } from "../clientes";
import type { ContextoDeTareas } from "../servidor";
import { contextoDelChatDeTareas, sumarTareasNombradas, type ChipDeTareas } from "./contexto";
import { describirOperacionesDeTareas, rotulosDeOperaciones } from "./lineas";
import {
  dependenciasDeOperacionesDeTareas,
  fusionarOperacionesDeTareas,
  MAX_OPERACIONES_DEL_CHAT,
  numerosNombrados,
  OPERACIONES_DE_TAREAS,
  podarOperacionesDeTareas,
  prepararOperacionesDeTareas,
  referenciasDeOperaciones,
  type OperacionDeTareas,
  type PreparadasDeTareas,
  type RefsConocidas,
} from "./operaciones";
import { NOMBRE_DE_LA_HERRAMIENTA, PROMPT_DE_TAREAS, TOOL_ACUERDO_DE_TAREAS } from "./prompt";
import { ultimoDesenlaceAplicado, ventanaDeTareas } from "./ventana";
import {
  anunciaUnCambio,
  sinMarcadores,
  AVISO_SIN_ACUERDO_DE_TAREAS,
  avisoDeRechazosDeTareas,
  avisoDelTopeDeOperaciones,
  reclamoDeOmisionDeTareas,
  reclamoDeRechazoDeTareas,
} from "./textos";

/** El agente, para verlo aparte en /integrations/gasto-ia. ⚠ No empieza con «tareas-»: ese prefijo es el cupo de la lectura automática. */
export const SLUG_DEL_CHAT_DE_TAREAS = "asistente-tareas";
/** Los mensajes de una persona por día (§6.7). */
export const MAX_TURNOS_DE_TAREAS_POR_DIA = 30;
/** El presupuesto de salida entero (el razonamiento sale de acá): el mismo del chat de documentos. */
const MAX_TOKENS_DE_RESPUESTA = 8_000;
const RESUMEN_DE_ARRASTRE = "Esto sigue acordado y sin aplicar.";

export interface ResultadoDelTurnoDeTareas {
  respuesta: string;
  acuerdo: CambioAcordado | null;
}


/** Lo pendiente del hilo, ya normalizado: lo que no tiene forma de operación de tareas no se arrastra. Solo los acuerdos
 *  del ASISTENTE (un turno de la persona nunca trae uno). */
function pendientesDelHilo(turnos: HiloConTurnos["turnos"]): OperacionDeTareas[] {
  const pend = acuerdoPendienteDelHilo(turnos.filter((t) => t.rol !== "CSE"));
  return (pend?.operaciones ?? []).filter(
    (o): o is OperacionDeTareas => !!o && typeof o === "object" && (OPERACIONES_DE_TAREAS as readonly string[]).includes(String((o as { op?: unknown }).op)),
  );
}

/** Las refs de lo pendiente, para que lo nuevo de este turno las pueda nombrar. */
function refsDe(ops: readonly OperacionDeTareas[]): RefsConocidas {
  const proyectos = new Map<string, { inicia: string | null; clientId: string | null; projectId: string | null }>();
  const tareas = new Set<string>();
  const tareasDePlan = new Set<string>();
  for (const o of ops) if (o.op === "proyecto.crear") proyectos.set(o.ref, { inicia: o.inicia ?? null, clientId: o.clientId ?? null, projectId: o.projectId ?? null });
  for (const o of ops) {
    if (o.op !== "tarea.crear" || !o.ref) continue;
    tareas.add(o.ref);
    if (o.proyecto && "ref" in o.proyecto && proyectos.has(o.proyecto.ref)) tareasDePlan.add(o.ref);
  }
  return { proyectos, tareas, tareasDePlan };
}

/**
 * El sello de cada creación nueva: aplicar dos veces el mismo acuerdo no duplica (`origenId`). Si en este turno el modelo
 * leyó una reunión (el chip), las tareas nuevas quedan atadas a ella: su contexto se ve con la regla de esa cita y no con
 * la fila, aunque el modelo haya copiado algo de la reunión.
 */
function sellar(ops: readonly OperacionDeTareas[], turno: string, sesion: string | null): OperacionDeTareas[] {
  return ops.map((o, i) => {
    if (o.op === "proyecto.crear") return { ...o, origen: o.origen ?? `c:${turno}:${i}` };
    if (o.op === "tarea.crear") return { ...o, origen: o.origen ?? `c:${turno}:${i}`, ...(sesion && !o.sesion ? { sesion } : {}) };
    return o;
  });
}

export async function correrTurnoDeTareas(
  hilo: HiloConTurnos,
  mensaje: string,
  quien: { ctx: ContextoDeTareas; clientes: ClientesQueVes },
  chip?: ChipDeTareas | null,
  ahora: Date = new Date(),
): Promise<ResultadoDelTurnoDeTareas> {
  mensaje = sinMarcadores(mensaje);
  // 1. Lo pendiente, y la foto de hoy (con lo que lo pendiente nombra, aunque no entre en las listas).
  const pendientes = pendientesDelHilo(hilo.turnos);
  const contexto = await contextoDelChatDeTareas(quien.ctx, quien.clientes, { ahora, chip, nombradas: referenciasDeOperaciones(pendientes) });
  let foto = contexto.foto;
  const sha = huellaDeContexto(contexto.texto);

  // 2. El libro: lo pendiente revalidado contra hoy. Lo que cayó se nombra (antes de podar es la única forma).
  const libro = podarOperacionesDeTareas(foto, pendientes);
  const soltadas = libro.caidas.map((c) => `${describirOperacionesDeTareas(foto, [c.operacion])[0]} (${c.motivo})`);
  const lineasVivas = describirOperacionesDeTareas(foto, libro.vivas);

  // 3. El pedido: la ventana del hilo, sin marcadores, con el breakpoint en su último mensaje; después lo pendiente,
  //    el chip y lo que escribió la persona (que cambian en cada turno: nunca en `system`).
  const ventana = ventanaDeTareas(hilo.turnos);
  const historia: Anthropic.Messages.MessageParam[] = ventana.map((t, i) => {
    const texto = textoVisible(t.contenido) || t.contenido;
    const role = (t.rol === "CSE" ? "user" : "assistant") as "user" | "assistant";
    return i === ventana.length - 1 ? { role, content: [{ type: "text" as const, text: texto, cache_control: { type: "ephemeral" as const } }] } : { role, content: texto };
  });
  // Lo último que se aplicó (la ventana arranca después): «agéndalas» tiene a qué referirse.
  const aplicado = ultimoDesenlaceAplicado(hilo.turnos);
  const messages: Anthropic.Messages.MessageParam[] = [
    ...historia,
    {
      role: "user",
      content: `${aplicado ? `[Lo último que se aplicó de esta conversación: ${aplicado}]\n\n` : ""}${bloqueDePendientes(lineasVivas)}${contexto.chip ? `[${contexto.chip}]\n\n` : ""}${mensaje}`,
    },
  ];

  const preguntarleAlModelo = (msgs: Anthropic.Messages.MessageParam[]) =>
    conContextoDeIA({ agentSlug: SLUG_DEL_CHAT_DE_TAREAS, projectId: null, triggeredByEmail: hilo.usuarioEmail, origen: "tareas/chat" }, () =>
      getAnthropic().messages.create({
        model: hilo.modelo,
        max_tokens: MAX_TOKENS_DE_RESPUESTA,
        /* Dos breakpoints en `system` (el prompt, igual para todo el equipo; tu contexto, que cambia al aplicar) y uno
           en `messages` (el último de la ventana). El reintento repite el pedido: lee todo de la caché. */
        system: [
          { type: "text", text: PROMPT_DE_TAREAS, cache_control: { type: "ephemeral" } },
          { type: "text", text: `TU CONTEXTO\n\n${contexto.texto}`, cache_control: { type: "ephemeral" } },
        ],
        tools: [TOOL_ACUERDO_DE_TAREAS],
        messages: msgs,
      }),
    );

  // 4. Lo que contestó.
  let msg = await preguntarleAlModelo(messages);
  let respuesta = "";
  let resumen = "";
  let crudas: unknown[] = [];
  let descartar: unknown[] = [];
  let preguntaAbierta = false;
  let idDeLaHerramienta = "";
  const leer = (m: Anthropic.Messages.Message) => {
    respuesta = "";
    resumen = "";
    crudas = [];
    descartar = [];
    preguntaAbierta = false;
    idDeLaHerramienta = "";
    for (const b of m.content) {
      if (b.type === "text") respuesta += b.text;
      if (b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA) {
        idDeLaHerramienta = b.id;
        const input = (b.input ?? {}) as { resumen?: unknown; operaciones?: unknown; descartar?: unknown; preguntaAbierta?: unknown };
        resumen = typeof input.resumen === "string" ? input.resumen.trim() : "";
        crudas = Array.isArray(input.operaciones) ? input.operaciones : [];
        descartar = Array.isArray(input.descartar) ? input.descartar : [];
        preguntaAbierta = input.preguntaAbierta === true;
      }
    }
  };
  const preparar = async (): Promise<PreparadasDeTareas> => {
    foto = await sumarTareasNombradas(foto, quien.ctx, numerosNombrados(crudas));
    return prepararOperacionesDeTareas(foto, crudas, mensaje, refsDe(libro.vivas));
  };
  leer(msg);
  let prep = await preparar();

  // 5. Un reintento, como en el chat de documentos: por rechazo, por omisión o por imitar el marcador.
  const motivo = decidirReintento({
    rechazadas: prep.rechazadas.length,
    huboTool: !!idDeLaHerramienta,
    opsUtilizables: prep.aceptadas.length + libro.vivas.length + (descartar.length ? 1 : 0),
    preguntaAbierta,
    imitoElMarcador: respuesta.includes(MARCA_DE_ACUERDO),
    /* Sin herramienta, se reclama solo si el texto dice que hizo (o hará) un cambio: contestar una pregunta en texto es
       lo que pide el prompt, y reclamarle costaba otra llamada y terminaba en un aviso falso. */
    preguntaEnElTexto: !idDeLaHerramienta && (terminaEnPregunta(respuesta) || !anunciaUnCambio(respuesta)),
  });
  const seLeReclamo = motivo === "por-omision" || motivo === "por-imitacion";
  if (motivo !== "no") {
    const texto = motivo === "por-rechazo" ? reclamoDeRechazoDeTareas(prep.rechazadas) : motivo === "por-imitacion" ? reclamoDeImitacion() : reclamoDeOmisionDeTareas(!!idDeLaHerramienta);
    const ids = msg.content.flatMap((b) => (b.type === "tool_use" ? [b.id] : []));
    const reclamo: Anthropic.Messages.MessageParam = idDeLaHerramienta
      ? {
          role: "user",
          content: ids.map((id) => ({
            type: "tool_result" as const,
            tool_use_id: id,
            is_error: true,
            content: id === idDeLaHerramienta ? texto : "Llamaste la herramienta más de una vez y solo se leyó una. Emite TODO en una sola llamada.",
          })),
        }
      : { role: "user", content: texto };
    messages.push({ role: "assistant", content: msg.content }, reclamo);
    msg = await preguntarleAlModelo(messages);
    leer(msg);
    prep = await preparar();
  }
  if (prep.rechazadas.length) respuesta = `${respuesta.trim()}\n\n${avisoDeRechazosDeTareas(prep.rechazadas)}`;

  // 6. La composición: lo pendiente que sigue en pie + lo nuevo, descartando con cascada y sin duplicar.
  const quitar = new Set(descartar.map((raw) => indiceDeEtiqueta(raw, { exigirP: true })).filter((i): i is number => i !== null));
  const turno = randomUUID().replace(/-/g, "").slice(0, 12);
  const fusion = fusionarOperacionesDeTareas(libro.vivas, sellar(prep.aceptadas, turno, contexto.sesionDelChip), quitar);
  // Más de 40: salen las últimas, y con ellas lo que las necesita (calculado sobre el lote entero).
  const fuera = new Set<number>();
  if (fusion.operaciones.length > MAX_OPERACIONES_DEL_CHAT) {
    for (let i = MAX_OPERACIONES_DEL_CHAT; i < fusion.operaciones.length; i++) fuera.add(i);
    const deps = dependenciasDeOperacionesDeTareas(fusion.operaciones);
    for (let cambio = true; cambio; ) {
      cambio = false;
      deps.forEach((d, i) => {
        if (!fuera.has(i) && d.some((j) => fuera.has(j))) {
          fuera.add(i);
          cambio = true;
        }
      });
    }
    respuesta = `${respuesta.trim()}\n\n${avisoDelTopeDeOperaciones(fuera.size, MAX_OPERACIONES_DEL_CHAT)}`;
  }
  const quedan = fusion.operaciones.map((_, i) => i).filter((i) => !fuera.has(i));
  const operaciones = quedan.map((i) => fusion.operaciones[i]);

  let acuerdo: CambioAcordado | null = null;
  if (operaciones.length) {
    const arrastradas = quedan.flatMap((orig, i) => (fusion.arrastradas.includes(orig) ? [i] : []));
    acuerdo = {
      resumen: resumen || RESUMEN_DE_ARRASTRE,
      operaciones,
      lineas: describirOperacionesDeTareas(foto, operaciones),
      dependencias: dependenciasDeOperacionesDeTareas(operaciones),
      rotulos: rotulosDeOperaciones(foto, operaciones),
      ...(preguntaAbierta ? { enEspera: true } : {}),
      ...(soltadas.length ? { descartadas: soltadas } : {}),
      ...(arrastradas.length ? { arrastradas } : {}),
    };
  } else if (soltadas.length || fusion.descartadas.length) {
    /* El acuerdo de CIERRE: lo pendiente cayó (o la persona lo descartó entero) y no hay nada nuevo. Corta el libro
       una vez, así el acuerdo de antes deja de ofrecer su botón. */
    const descartadasPorLaPersona = fusion.descartadas.map((i) => lineasVivas[i]).filter(Boolean);
    acuerdo = { resumen: RESUMEN_DEL_CIERRE, operaciones: [], descartadas: [...soltadas, ...descartadasPorLaPersona] };
    if (soltadas.length) respuesta = `${respuesta.trim()}\n\n${avisoDeCierre(libro.caidas.map((c) => c.motivo).join(" · "))}`;
  } else if (!preguntaAbierta && (!!idDeLaHerramienta || seLeReclamo)) {
    respuesta = `${respuesta.trim()}\n\n${AVISO_SIN_ACUERDO_DE_TAREAS}`;
    console.warn("[tareas/chat] turno sin acuerdo", { hiloId: hilo.id, huboTool: !!idDeLaHerramienta, emitidas: crudas.length, rechazadas: prep.rechazadas.length, seLeReclamo, stopReason: msg.stop_reason });
  }
  if (respuesta.includes(MARCA_DE_ACUERDO)) console.warn("[tareas/chat] el modelo imitó el marcador del acuerdo", { hiloId: hilo.id });

  respuesta = sinMarcadores(respuesta);
  if (!respuesta.trim() && acuerdo) respuesta = acuerdo.resumen;
  if (msg.stop_reason === "max_tokens" && !respuesta.trim()) respuesta = "Me quedé sin espacio antes de poder contestar: el pedido tiene muchas partes. Probemos de a una — ¿por cuál empezamos?";
  if (!respuesta.trim()) respuesta = "(el asistente no devolvió texto)";

  // 7. Los dos turnos. El turno de la persona se guarda solo si el modelo contestó (un 502 no cuenta en el tope).
  await agregarTurno(hilo.id, { rol: "CSE", contenido: mensaje, shaDeContexto: sha });
  await agregarTurno(hilo.id, { rol: "ASISTENTE", contenido: acuerdo ? `${respuesta}\n\n${marcaDeAcuerdo(acuerdo)}` : respuesta, shaDeContexto: sha });
  return { respuesta, acuerdo };
}
