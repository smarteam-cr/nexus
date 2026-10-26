/**
 * lib/canvas/diagnostico-generate.ts
 *
 * Runner del canvas "Diagnóstico" (informe PARA EL CLIENTE). Self-contained, calcado de
 * `exploracion-generate.ts`: asegura el canvas, arma el input desde las fuentes, corre el agente
 * tipado y persiste 1 CARD por sección EN EL LUGAR.
 *
 * ── LAS FUENTES (2026-09-28, «el agente escucha») ────────────────────────────────
 * El diagnóstico se escribe DESPUÉS de las encuestas y de las sesiones de exploración, así que lee:
 *   1. Las REUNIONES de su «Contexto» (lib/contexto/material-del-documento.ts): desde la etapa 7 de
 *      la memoria de la cuenta, SOLO las que eligió el equipo, leídas enteras (antes arrancaba con
 *      toda reunión del proyecto con el cliente). Lo que el panel dice que alimenta es exactamente lo
 *      que se lee. Sin elegidas, el mensaje lo dice y la memoria lleva el peso.
 *   2. Las NOTAS que el CSE pegó en ese mismo Contexto, y la MEMORIA de la cuenta y del proyecto
 *      (lib/memoria, recortada para el cliente). Todo lo arma `fuentesDelDiagnostico`.
 *   3. Las respuestas a la ENCUESTA previa (lib/cuestionario/contexto.ts).
 *   4. La FICHA del cliente CONFIRMADA, sin sus campos internos (`fichaParaPrompt` con
 *      `paraDocumentoDelCliente`): apertura a la asesoría, motivación y oportunidades no entran.
 *   5. El HANDOFF con allowlist RESTRICTIVA (cliente-safe), ahora con «Resultados que el cliente
 *      necesita alcanzar»: de ahí salen los objetivos.
 *   6. La EXPLORACIÓN completa (interna), con la regla dura de que lo «sin verificar» no se afirma.
 *   7. Los PROCESOS REALES del cliente (dolores marcados ⚠).
 *   8. El CRONOGRAMA, solo lectura: el punto de partida del proyecto (qué dura y qué entrega).
 *
 * ── EL CONTRATO (2026-10-02) ─────────────────────────────────────────────────────────────────
 * Escribe el informe con las secciones y el orden de FUNDAUNA (diagnostico.defs.ts): la parte
 * teórica, con las acciones, las herramientas, la política rectora y cómo va a operar, y sin detalle
 * de configuración ni escala. Al regenerar, OCULTA las secciones que salieron
 * (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO) sin borrar sus datos — la Entrega lee de ahí la Escala —,
 * lleva el documento al orden del contrato (lib/canvas/diagnostico-contrato.ts), y antes guarda una
 * versión del documento entero (lib/canvas/versiones.ts).
 *
 * Lo dispara el botón del header (CANVAS_PRIMARY_AGENT, async) vía POST /analyze.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  DIAGNOSTICO_CANVAS,
  DIAGNOSTICO_CIERRE_DEFAULT,
  ROTULOS_RENOMBRADOS,
  diagnosticoSectionSequence,
  type CanvasDefinition,
} from "@/lib/canvas/canvas-defs";
import { parseSectionEntries, patchSectionEntry } from "@/lib/business-cases/section-briefs";
import {
  createOnDemandCanvas,
  reconcileOnDemandCanvasSections,
} from "@/lib/canvas/default-canvases";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { bloqueDeInstruccionesDelPedido, entradasSegunLaPlantilla } from "@/lib/entregables/registro";
import {
  DIAGNOSTICO_TEMPLATE,
  POLITICA_RECTORA_KEY,
  SECCIONES_RETIRADAS_DEL_DIAGNOSTICO,
} from "@/components/landing/configs/diagnostico.defs";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { ordenarObjetivosDelDiagnostico } from "@/lib/canvas/diagnostico-hilo";
import { fuentesDelDiagnostico } from "@/lib/canvas/diagnostico-fuentes";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { ocultarSeccionesRetiradas } from "@/lib/canvas/retirar-secciones";
import { cierreAlDia, ordenDelContrato } from "@/lib/canvas/diagnostico-contrato";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { leerOProponerResultados } from "@/lib/handoff/proponer-resultados";
import { DESAFIO_KEY, marcadaRevisada } from "@/lib/canvas/estado-del-documento";
import {
  documentoAprobado,
  escribirLoRegenerado,
  MENSAJE_APROBADO,
  MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA,
} from "@/lib/canvas/estado-del-documento-servidor";

/**
 * Asegura el canvas "Diagnóstico" del proyecto + reconcilia sus secciones. Idempotente. Con `plantilla`, reconcilia
 * SOLO a las secciones de esa plantilla (2026-10-23): el diagnóstico esencial no gana las del completo.
 */
export async function ensureDiagnosticoCanvas(projectId: string, plantilla?: BcTemplateDef): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(DIAGNOSTICO_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const def = definicionDeLaPlantilla(plantilla);
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, def));
  await reconcileOnDemandCanvasSections(canvasId, def, diagnosticoSectionSequence);
  return canvasId;
}

/** El canvas del diagnóstico con solo las secciones de la plantilla (todas, sin plantilla o con la completa). */
function definicionDeLaPlantilla(plantilla?: BcTemplateDef): CanvasDefinition {
  if (!plantilla) return DIAGNOSTICO_CANVAS;
  const keys = new Set(plantilla.sections.map((d) => d.key));
  return { ...DIAGNOSTICO_CANVAS, sections: DIAGNOSTICO_CANVAS.sections.filter((s) => keys.has(s.key)) };
}

/**
 * Genera (o regenera) el informe de diagnóstico con IA. `agentRunId` se atribuye a los
 * bloques (trazabilidad). Devuelve canvasId + secciones escritas.
 */
export async function runDiagnosticoGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
  /** La plantilla con que se genera (lib/entregables/plantillas.ts). Sin ella, la de siempre. */
  plantilla?: BcTemplateDef;
  /** Lo que pidió quien genera, para esta corrida (el chat de Nexus). Sin ellas, el mensaje es el de siempre. */
  instrucciones?: string | null;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;
  const plantilla = opts.plantilla ?? DIAGNOSTICO_TEMPLATE;
  /* Los objetivos cuantitativos apuntan a los resultados medibles del handoff (2026-10-02). Un
     handoff de antes de esa lista todavía no la tiene: se lee primero. Si no sale, el diagnóstico se
     genera igual (los cuantitativos quedan sin resultado y «Por validar»). */
  if (!(await resultadosDelProyecto(projectId).catch(() => null))) {
    await leerOProponerResultados(projectId, { origen: "diagnostico" });
  }
  const [canvasId, fuentes] = await Promise.all([
    opts.canvasId ?? ensureDiagnosticoCanvas(projectId, plantilla),
    fuentesDelDiagnostico(projectId),
  ]);
  // Aprobado por el cliente = cerrado (lib/canvas/estado-del-documento.ts): no se regenera sin reabrirlo.
  if (await documentoAprobado(canvasId).catch(() => false)) throw new Error(MENSAJE_APROBADO);
  // Las MISMAS fuentes que lee «Mejorar el diagnóstico con IA» (lib/canvas/diagnostico-fuentes.ts).
  const userMessage = [
    `${bloqueDeInstruccionesDelPedido(opts.instrucciones)}${fuentes}`,
    "",
    "Escribe el informe siguiendo tus instrucciones, solo con las secciones de tu formato: el hilo con sus códigos (S, F, OBJ, AC) — toda causa con al menos una acción, toda acción con causas y objetivos —, el enfoque de la solución como sugerencia, sin detalle de configuración y sin escala de madurez. Las intros, de una frase corta.",
  ].join("\n");

  // Carry-forward: sin la data previa, `coerceToSchema` descartaría lo curado fuera de
  // schema (portada del hero, marcas) al regenerar.
  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  /* La política rectora que el ejecutivo YA REVISÓ no se vuelve a pedir (2026-10-02): es la versión
     ajustada a mano de una sugerencia, y regenerar —por ejemplo, después de que el cliente agregó
     algo en la presentación— no puede devolverla a la sugerencia de la IA. */
  /* Igual el DESAFÍO PRINCIPAL revisado (L2 etapa 2, 2026-10-24): desde que presentar lo exige, regenerar no puede
     devolverlo a lo que propuso la IA. */
  const revisadas = [POLITICA_RECTORA_KEY, DESAFIO_KEY].filter((k) => estaRevisada(prevDataByKey[k]));
  const generado = await generateSectionsForTemplate(
    plantilla,
    userMessage,
    undefined,
    revisadas.length ? new Set(revisadas) : undefined,
    prevDataByKey,
  );
  // Los OBJ en orden (cuantitativos primero, seguidos) y sus menciones reescritas: no se le pide al
  // modelo, se ordena acá (lib/canvas/diagnostico-hilo.ts).
  const gen = { ...generado, sections: ordenarObjetivosDelDiagnostico(generado.sections) };

  /* ⛔ Volver a mirar ANTES de escribir (2026-10-05): la IA tarda minutos y el cliente pudo aprobar
     mientras tanto. Aprobado = no se escribe nada y la corrida queda con el error a la vista. Esta
     mirada evita la foto de más; la que manda es la toma de `escribirLoRegenerado`, en la misma
     transacción que la escritura (lib/canvas/estado-del-documento-servidor.ts). */
  if (await documentoAprobado(canvasId)) throw new Error(MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA);

  // La foto ANTES de tocar nada (lib/canvas/versiones.ts): la IA ya respondió bien, y lo que había
  // queda consultable, se puede traer por sección o restaurar entero.
  await guardarVersionDelDocumento(canvasId, { origen: "Antes de regenerar" });

  // Persistir 1 CARD/sección EN EL LUGAR. Las solo-lectura y el `cierre` (agentGenerated:false)
  // no vienen en gen.sections → sus bloques quedan intactos hasta el retiro de abajo.
  // Todo en UNA transacción que primero toma el documento; si estaba presentado, ahí mismo pasa a la
  // versión siguiente en borrador (la presentada queda intacta en el historial).
  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  const escritura = await escribirLoRegenerado(canvasId, async (tx) => {
    let escritas = 0;
    for (const s of gen.sections) {
      const sectionId = sectionMap.get(s.key);
      if (!sectionId) continue;
      await tx.canvasBlock.deleteMany({ where: { sectionId } });
      await tx.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: (s.data ?? {}) as Prisma.InputJsonValue,
          order: 0,
          source: "AGENT",
          status: "CONFIRMED",
          ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
        },
      });
      escritas++;
    }
    return escritas;
  });
  if (!escritura.tomado) throw new Error(MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA);
  const sectionCount = escritura.escritas;

  /* El retiro: un diagnóstico regenerado con la estructura nueva no puede seguir MOSTRANDO la escala,
     las causas sueltas o las recomendaciones de la versión anterior — se contradicen con el hilo.
     ⛔ Pero se OCULTAN, no se borran (Elías, 2026-09-28): la Entrega lee de la sección `escala` el
     punto de partida del cliente, y borrarla lo dejaba sin él. Ocultas no salen al cliente ni al PDF,
     y sus datos siguen ahí. Solo si la generación escribió algo. Y el documento queda en el ORDEN del
     contrato de FUNDAUNA (lib/canvas/diagnostico-contrato.ts). */
  if (sectionCount > 0) {
    await ocultarSeccionesRetiradas(canvasId, prevSecs.map((s) => s.key), SECCIONES_RETIRADAS_DEL_DIAGNOSTICO);
    await ajustarALaPlantilla(canvasId, definicionDeLaPlantilla(plantilla));
    await llevarAlOrdenDelContrato(canvasId);
    await ponerAlDiaElCierre(canvasId);
    await ponerAlDiaLosRotulos(canvasId);
  }
  return { canvasId, sectionCount };
}

/**
 * EL DOCUMENTO QUEDA CON LAS SECCIONES DE SU PLANTILLA (2026-10-23). Las del canon que la plantilla no tiene: vacías, se
 * borran (la fila y su entrada del Json, así no aparecen en el índice del panel); con algo escrito, se OCULTAN con la
 * marca `ocultaPorLaPlantilla` —nada se pierde—. Al volver a una plantilla que las tiene (de la esencial a la completa),
 * las que ocultó la plantilla se vuelven a mostrar; las que ocultó una persona, no (su ojo borra la marca). Las creadas
 * por una persona (`custom:*`) y las retiradas no se tocan.
 */
export async function ajustarALaPlantilla(canvasId: string, def: CanvasDefinition, canon: CanvasDefinition = DIAGNOSTICO_CANVAS): Promise<void> {
  const deLaPlantilla = new Set(def.sections.map((s) => s.key));
  const queNoTiene = canon.sections.map((s) => s.key).filter((k) => !deLaPlantilla.has(k));
  const c0 = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
  const hayQueMostrar = parseSectionEntries(c0?.sections).some((e) => deLaPlantilla.has(e.key) && e.ocultaPorLaPlantilla === true);
  const fuera = queNoTiene.length
    ? await prisma.canvasSection.findMany({
        where: { canvasId, key: { in: queNoTiene } },
        select: { id: true, key: true, _count: { select: { blocks: true } } },
      })
    : [];
  if (!fuera.length && !hayQueMostrar) return; // la completa sobre un documento que nunca fue esencial: nada que ajustar
  const vacias = fuera.filter((s) => s._count.blocks === 0);
  const conAlgo = fuera.filter((s) => s._count.blocks > 0).map((s) => s.key);
  await prisma.$transaction(async (tx) => {
    if (vacias.length) await tx.canvasSection.deleteMany({ where: { id: { in: vacias.map((s) => s.id) } } });
    await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
    const c = await tx.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
    const borradas = new Set(vacias.map((s) => s.key));
    const sinLasBorradas = parseSectionEntries(c?.sections).filter((e) => !borradas.has(e.key));
    // Ocultar lo de afuera con texto y volver a mostrar lo que ocultó otra plantilla: regla pura en lib/entregables/registro.ts.
    const { entradas } = entradasSegunLaPlantilla(sinLasBorradas, { deLaPlantilla, conTextoFuera: conAlgo });
    await tx.projectCanvas.update({ where: { id: canvasId }, data: { sections: entradas as unknown as Prisma.InputJsonValue } });
  });
}

/**
 * EMPEZAR EN BLANCO (2026-10-23, revisión de la rama): el documento con las secciones de la plantilla elegida, sin
 * generar, para quien prefiere escribirlo a mano. La plantilla la anota quien llama (lib/entregables/generar-server.ts).
 * Aprobado = cerrado: no se toca.
 */
export async function prepararDiagnosticoEnBlanco(projectId: string, plantilla: BcTemplateDef): Promise<string> {
  const canvasId = await ensureDiagnosticoCanvas(projectId, plantilla);
  if (await documentoAprobado(canvasId).catch(() => false)) throw new Error(MENSAJE_APROBADO);
  await ajustarALaPlantilla(canvasId, definicionDeLaPlantilla(plantilla));
  await llevarAlOrdenDelContrato(canvasId);
  return canvasId;
}

/**
 * Los rótulos guardados que cambiaron de nombre (2026-10-23: «Política rectora» → «Enfoque de la solución»). La fila y su
 * entrada del Json guardan el rótulo con que nacieron; solo se cambia el que sigue igual al viejo (uno que alguien
 * renombró a mano se respeta). El título del documento ya sale de la definición.
 */
async function ponerAlDiaLosRotulos(canvasId: string): Promise<void> {
  const renombrados = ROTULOS_RENOMBRADOS.diagnosis;
  for (const [key, { viejos, nuevo }] of Object.entries(renombrados)) {
    await prisma.canvasSection.updateMany({ where: { canvasId, key, label: { in: [...viejos] } }, data: { label: nuevo } });
  }
  const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
  const entradas = parseSectionEntries(c?.sections);
  const cambian = entradas.filter((e) => (renombrados[e.key]?.viejos ?? []).includes(e.label));
  if (!cambian.length) return;
  let nuevas: unknown = entradas;
  for (const e of cambian) nuevas = patchSectionEntry(nuevas, e.key, { label: renombrados[e.key]?.nuevo ?? e.label });
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { sections: nuevas as Prisma.InputJsonValue } });
}

/** ¿La sección guardada ya la revisó el ejecutivo? (`revisadaAt`, fuera del esquema). La MISMA regla que presentar. */
export function estaRevisada(data: unknown): boolean {
  return marcadaRevisada(data);
}

/** El cierre con el texto de fábrica viejo (hablaba de la escala) pasa al de hoy (ver `cierreAlDia`). */
async function ponerAlDiaElCierre(canvasId: string): Promise<void> {
  const bloque = await prisma.canvasBlock.findFirst({
    where: { blockType: "CARD", section: { canvasId, key: "cierre" } },
    select: { id: true, data: true },
  });
  const nueva = bloque ? cierreAlDia(bloque.data, DIAGNOSTICO_CIERRE_DEFAULT.subhead) : null;
  if (!bloque || !nueva) return;
  await prisma.canvasBlock.update({ where: { id: bloque.id }, data: { data: nueva as Prisma.InputJsonValue } });
}

/** Reordena las secciones del canvas al orden del contrato. Solo escribe las que cambian de lugar. */
async function llevarAlOrdenDelContrato(canvasId: string): Promise<void> {
  const filas = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: { id: true, key: true, order: true },
  });
  const orden = ordenDelContrato(
    filas.map((f) => f.key),
    DIAGNOSTICO_CANVAS.sections.map((s) => s.key),
  );
  const porKey = new Map(filas.map((f) => [f.key, f]));
  const cambios = orden
    .map((key, i) => ({ fila: porKey.get(key), i }))
    .filter((x): x is { fila: { id: string; key: string; order: number }; i: number } => !!x.fila && x.fila.order !== x.i);
  if (!cambios.length) return;
  await prisma.$transaction(cambios.map(({ fila, i }) => prisma.canvasSection.update({ where: { id: fila.id }, data: { order: i } })));
}
