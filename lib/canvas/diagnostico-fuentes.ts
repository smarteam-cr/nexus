/**
 * lib/canvas/diagnostico-fuentes.ts — TODO lo que lee el agente del diagnóstico, armado en un solo
 * lugar (2026-09-28).
 *
 * Lo usan la GENERACIÓN (lib/canvas/diagnostico-generate.ts) y «Mejorar el diagnóstico con IA»
 * (canvas-assist). Antes el assist leía solo una parte del handoff: proponía cambios contra un
 * contexto mucho más pobre del que había escrito el documento, y no podía anclar nada a una reunión
 * que nunca vio. Una sola función = los dos leen lo mismo.
 *
 * Las fuentes y sus reglas:
 *   · las reuniones del «Contexto del diagnóstico» y las notas del CSE (material-del-documento),
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
import { fichaParaPrompt, leerFicha } from "@/lib/clients/ficha";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";

function fechaCorta(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
}

/** El cuerpo del mensaje con todas las fuentes (sin la instrucción final, que pone cada llamador). */
export async function fuentesDelDiagnostico(projectId: string): Promise<string> {
  const doc = documentoConContexto("diagnosis")!;
  const [handoffCtx, exploracionCtx, timelineCtx, encuestaCtx, material, project] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: DIAGNOSTICO_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
    loadTimelineContext(projectId),
    loadCuestionarioContext(projectId).catch(() => ""),
    cargarMaterialDelDocumento(projectId, doc),
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
  const fichaCtx = fichaParaPrompt(leerFicha(project?.client?.ficha), { paraDocumentoDelCliente: true });

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);
  const r = material.resumen;
  const encuadreDeReuniones = r.leidas
    ? `Se leyeron ${r.leidas} reuniones${r.desde && r.hasta ? `, entre el ${fechaCorta(r.desde)} y el ${fechaCorta(r.hasta)}` : ""}.`
    : "No hay reuniones con contenido en el contexto de este diagnóstico.";

  return [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/áreas del proyecto (dirigen QUÉ frentes cubre el informe): ${hubs.join(", ")}` : "",
    "",
    `=== LAS SESIONES CON EL CLIENTE (la fuente principal) ===\n${encuadreDeReuniones}\nCada reunión trae su sala: lo dicho [PUERTAS ADENTRO] es de Smarteam y NUNCA se le atribuye al cliente.`,
    material.reuniones,
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA ESTE DIAGNÓSTICO (pesan como una fuente más; si contradicen una reunión, gana la más reciente) ===\n${material.notas}` : "",
    encuestaCtx ? `\n=== RESPUESTAS DEL CLIENTE A LA ENCUESTA PREVIA ===\n${encuestaCtx}` : "",
    fichaCtx ? `\n${fichaCtx}` : "",
    "\n=== LO QUE SE CONVERSÓ AL VENDER EL PROYECTO (solo lo apto para el cliente) ===",
    handoffCtx || "(Sin handoff generado.)",
    exploracionCtx
      ? `\n=== EXPLORACIÓN (interna — lo confirmado y lo supuesto) ===\nREGLA DURA: lo que esta fuente marque como supuesto o "sin verificar" NUNCA se afirma como hecho en el informe.\n${exploracionCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    timelineCtx ? `\n=== EL PROYECTO CONTRATADO (solo para el punto de partida: qué dura y qué entrega) ===\n${timelineCtx}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}
