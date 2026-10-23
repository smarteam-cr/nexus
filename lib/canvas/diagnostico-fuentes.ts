/**
 * lib/canvas/diagnostico-fuentes.ts — TODO lo que lee el agente del diagnóstico, armado en un solo
 * lugar (2026-09-28).
 *
 * Lo usan la GENERACIÓN (lib/canvas/diagnostico-generate.ts) y «Mejorar el diagnóstico con IA»
 * (canvas-assist). Antes el assist leía solo una parte del handoff: proponía cambios contra un
 * contexto mucho más pobre del que había escrito el documento, y no podía anclar nada a una reunión
 * que nunca vio. Una sola función = los dos leen lo mismo. Una diferencia, desde la etapa 7: el assist
 * lee las reuniones elegidas EN RESUMEN (`paraElAssist`), no enteras, y sin búsqueda web.
 *
 * Las fuentes y sus reglas:
 *   · las reuniones ELEGIDAS por el equipo en su «Contexto adicional», leídas enteras (etapa 7: sin
 *     elegidas no entra ninguna, y la línea lo dice), y las notas del CSE (material-del-documento),
 *   · desde el 2026-10-23, también las reuniones de las SESIONES DE LA EXPLORACIÓN, enteras y sin que nadie las
 *     elija en el Contexto: una persona ya las unió a una sesión (`reunionesDeLaExploracionDelDiagnostico`). Antes
 *     eran solo una sugerencia, y CEMACO llegaba al diagnóstico sin una sola transcripción de sus cinco sesiones,
 *   · lo que Nexus PROPUSO y nadie confirmó (la ficha y la exploración), rotulado como supuesto (2026-10-23),
 *   · la memoria de la cuenta y del proyecto (lib/memoria, alcance del cliente): lo que dejaron las
 *     demás reuniones (acuerdos y decisiones de las minutas revisadas), la historia con Smarteam y las
 *     desviaciones que el cliente ve. Sin la ficha, los procesos ni los resultados: ya los lee abajo,
 *   · la encuesta previa,
 *   · la ficha del cliente CONFIRMADA, sin sus campos internos (el informe lo lee el cliente),
 *   · el handoff con allowlist cliente-safe (DIAGNOSTICO_HANDOFF_KEYS),
 *   · la exploración (con la regla de «sin verificar»), los procesos y el cronograma de solo lectura.
 */
import { prisma } from "@/lib/db/prisma";
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { DIAGNOSTICO_HANDOFF_KEYS } from "@/components/landing/configs/diagnostico.defs";
import { tagLabels } from "@/lib/tags/catalog";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { fichaParaPrompt, leerFicha, propuestaDeLaFichaParaElDocumento } from "@/lib/clients/ficha";
import { cargarMaterialDelDocumento, encuadreDeLasElegidas } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { fronteraDeLaPieza } from "@/lib/contexto/frontera-de-los-documentos";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { resultadosParaPrompt } from "@/lib/handoff/resultados-medibles";
import { memoriaDelDocumento } from "@/lib/memoria";
import { reunionesDeLaExploracionDelDiagnostico } from "@/lib/contexto/sugerencias-del-documento-server";

/**
 * El equipo de Smarteam del proyecto, para la fila «Smarteam» de «Equipos involucrados y licencias»
 * (2026-10-02). Sale de la sección «El equipo del proyecto» del Kickoff, que CURA el CSE con el
 * directorio: es la única lista de quién de Smarteam está en el proyecto que alguien ya revisó.
 * Sin kickoff curado, el agente lo dice («Por validar») en vez de adivinar nombres.
 */
async function equipoDeSmarteam(projectId: string): Promise<string[]> {
  const bloque = await prisma.canvasBlock.findFirst({
    where: { blockType: "CARD", section: { key: "equipo", canvas: canvasOfNested("kickoff", { projectId }) } },
    select: { data: true },
  });
  const members = (bloque?.data as { members?: Array<{ name?: unknown; role?: unknown }> } | null)?.members;
  if (!Array.isArray(members)) return [];
  return members
    .map((m) => {
      const nombre = typeof m?.name === "string" ? m.name.trim() : "";
      const rol = typeof m?.role === "string" ? m.role.trim() : "";
      return nombre ? (rol ? `${nombre} (${rol})` : nombre) : "";
    })
    .filter(Boolean);
}

/**
 * El cuerpo del mensaje con todas las fuentes (sin la instrucción final, que pone cada llamador).
 *
 * `paraElAssist`: «Mejorar con IA» (canvas-assist) lee las elegidas EN RESUMEN, no enteras: manda el contexto entero en
 * cada pedido, y 160.000 caracteres de transcripción por pedido no se justifican para mejorar una sección.
 */
export async function fuentesDelDiagnostico(projectId: string, opts: { paraElAssist?: boolean } = {}): Promise<string> {
  const doc = documentoConContexto("diagnosis")!;
  /* Las reuniones de las sesiones de la exploración entran solas, como elegidas (2026-10-23): una persona ya las unió a
     una sesión. Si falla, el diagnóstico sale con las elegidas de siempre: nunca lo frena. */
  const deLaExploracion = await reunionesDeLaExploracionDelDiagnostico(projectId).catch((e: unknown) => {
    console.warn("[diagnostico-fuentes] las reuniones de la exploración no se pudieron leer:", e instanceof Error ? e.message : e);
    return [] as string[];
  });
  const [handoffCtx, exploracionCtx, timelineCtx, encuestaCtx, material, smarteam, resultados, project] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: DIAGNOSTICO_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
    loadTimelineContext(projectId),
    loadCuestionarioContext(projectId).catch(() => ""),
    cargarMaterialDelDocumento(projectId, doc, { elegidasEnResumen: opts.paraElAssist === true, sumarReuniones: deLaExploracion }),
    equipoDeSmarteam(projectId).catch(() => [] as string[]),
    resultadosDelProyecto(projectId).catch(() => null),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        tags: true,
        clientId: true,
        client: { select: { name: true, company: true, industry: true, ficha: true } },
      },
    }),
  ]);

  const procesosCtx = project?.clientId
    ? await serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false })
    : "";
  // ⛔ Sin los campos internos: este informe lo lee el cliente (lib/clients/ficha.ts).
  const ficha = leerFicha(project?.client?.ficha);
  const fichaCtx = fichaParaPrompt(ficha, { paraDocumentoDelCliente: true });
  /* Lo que Nexus propuso de la ficha y nadie confirmó (2026-10-23): entra como SUPUESTO. Sin esto, con la ficha sin
     confirmar —CEMACO el 23 oct: 9 campos propuestos— al diagnóstico no le llegaba nada de la ficha. */
  const fichaPropuesta = propuestaDeLaFichaParaElDocumento(ficha);
  /* La memoria de la cuenta y del proyecto (lib/memoria), con el alcance del CLIENTE: el informe lo lee el cliente.
     Suma lo que dejaron las reuniones que su material NO lee (`yaLeidas`: solo los acuerdos y las decisiones de las
     minutas revisadas), la historia y las desviaciones que el cliente ve. Desde la etapa 7 es lo que lleva el peso
     cuando nadie eligió reuniones: sin ella, el diagnóstico saldría solo con el handoff y la exploración. */
  const memoria = await memoriaDelDocumento(projectId, {
    lector: "diagnosis",
    clientId: project?.clientId ?? null,
    yaLeidas: material.sesionesUsadas,
  });

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);
  const encuadreDeReuniones = encuadreDeLasElegidas(material.resumen);

  return [
    // Las «Instrucciones adicionales» del diagnóstico (2026-10-07): primero, porque mandan sobre todo.
    material.instrucciones,
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/áreas del proyecto (dirigen QUÉ frentes cubre el informe): ${hubs.join(", ")}` : "",
    "",
    material.reuniones
      ? `=== ${deLaExploracion.length ? "LAS REUNIONES DE LAS SESIONES DE LA EXPLORACIÓN Y LAS ELEGIDAS POR EL EQUIPO" : "LAS REUNIONES ELEGIDAS POR EL EQUIPO"} ===\n${encuadreDeReuniones}\nCada reunión trae su sala: lo dicho [PUERTAS ADENTRO] es de Smarteam y NUNCA se le atribuye al cliente.\n${material.reuniones}`
      : material.avisoSinReuniones,
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA ESTE DIAGNÓSTICO (pesan como una fuente más; si contradicen una reunión, gana la más reciente) ===\n${material.notas}` : "",
    memoria.texto ? `\n${memoria.texto}` : "",
    encuestaCtx ? `\n=== RESPUESTAS DEL CLIENTE A LA ENCUESTA PREVIA ===\n${encuestaCtx}` : "",
    fichaCtx ? `\n${fichaCtx}` : "",
    fichaPropuesta
      ? `\n=== LO QUE NEXUS PROPUSO DE LA FICHA DEL CLIENTE Y NADIE CONFIRMÓ (SUPUESTOS: orientan, nunca se afirman como hechos; si contradicen algo confirmado, vale lo confirmado) ===\n${fichaPropuesta}`
      : "",
    "\n=== LO QUE SE CONVERSÓ AL VENDER EL PROYECTO (solo lo apto para el cliente) ===",
    handoffCtx || "(Sin handoff generado.)",
    resultados?.resultados.length
      ? `\n=== RESULTADOS MEDIBLES DEL HANDOFF (los objetivos cuantitativos son ESTOS: uno por R, con su código en \`resultado\`; la línea base y la meta las muestra Nexus, no las escribas) ===\n${resultadosParaPrompt(resultados.resultados)}`
      : "",
    // La frontera también acá: la exploración trae lo que salió de cada sesión y citas de lo que se dijo.
    exploracionCtx
      ? `\n=== EXPLORACIÓN (interna — lo confirmado y lo supuesto) ===\n${fronteraDeLaPieza("diagnosis")}\nREGLA DURA: lo que esta fuente marque como supuesto o "sin verificar" NUNCA se afirma como hecho en el informe.\n${exploracionCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    timelineCtx ? `\n=== EL PROYECTO CONTRATADO (solo para el punto de partida: qué dura y qué entrega) ===\n${timelineCtx}` : "",
    smarteam.length
      ? `\n=== EL EQUIPO DE SMARTEAM EN EL PROYECTO (para la fila «Smarteam» de equipos y licencias) ===\n${smarteam.join(", ")}`
      : "\n=== EL EQUIPO DE SMARTEAM EN EL PROYECTO ===\n(No está cargado: en la fila «Smarteam», `personas` = 'Por validar'. No inventes nombres.)",
    // La regla otra vez, al final (justo antes de la instrucción de cada llamador): el bloque de reuniones puede ser largo.
    material.cierreDeFrontera ? `\n${material.cierreDeFrontera}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}
