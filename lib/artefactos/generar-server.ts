/**
 * lib/artefactos/generar-server.ts — GENERAR UNA COPIA con IA, por id (etapa V3 de docs/artefactos-plan.md). SERVIDOR.
 *
 * El documento de siempre de cada tipo sigue con su runner (lib/canvas/*-generate.ts, por /analyze), que lo busca por
 * `slug`: no sabe escribir en otro. Una copia (y los tipos nuevos, que solo tienen copias) se genera acá, con lo mismo
 * que lee un documento de su tipo:
 *   · el handoff, con la allowlist del tipo (lo que el cliente puede leer);
 *   · su «Contexto adicional»: las reuniones elegidas y las notas de ESTA copia, por el chokepoint. Sin elegidas, las del
 *     «Contexto adicional» de su tipo y las del proyecto con texto que nadie sacó de ahí: una copia recién creada no puede
 *     salir en blanco teniendo reuniones (validación del deploy, 2026-10-31). Con elegidas, solo esas: elegirlas es decidir
 *     el foco de esa copia. Y las instrucciones de ESTA copia (su `__doc.brief`);
 *   · el cronograma y los cuestionarios, solo donde los lee su documento de siempre (`LEE_EL_CRONOGRAMA`, `LEE_LOS_CUESTIONARIOS`);
 *   · la memoria de la cuenta y del proyecto;
 *   · los documentos de los tipos que lo alimentan (el diagnóstico para la planificación…), con todas sus copias
 *     (`loadCanvasContext`);
 *   · el template de su plantilla, recortado a las secciones que la copia tiene.
 * Escribe un bloque CARD por sección en el lugar (como el requerimiento técnico), con la foto de antes
 * (`guardarVersionDelDocumento`). Lo curado (el cierre) no se toca: el agente no lo escribe.
 *
 * Respeta las reglas de su tipo que viven en los runners de siempre: en el diagnóstico, lo que el ejecutivo marcó revisado
 * no se reescribe y las acciones quedan en el enfoque corto; en el kickoff, el trato «Sin Escala» no lleva escala.
 */
import { anotarPorQueDeLaCurada, modalidadDeAdopcion } from "@/lib/canvas/planificacion-generate";
import { TIPO_CUESTIONARIOS, TIPO_PLAN_DE_ADOPCION } from "./tipos";
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { bloqueDeInstruccionesDeDoc, docBriefFrom } from "@/lib/business-cases/section-briefs";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { reunionesDeUnaCopiaSinElegidas } from "@/lib/contexto/sugerencias-del-documento-server";
import { POR_QUE_DE_LAS_CURADAS } from "@/lib/planificacion/por-que-vacia";
import { conPorQueVacia } from "@/lib/landing/por-que-vacia";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { bloqueDeInstruccionesDelPedido } from "@/lib/entregables/registro";
import { memoriaDelDocumento, type LectorDeMemoria } from "@/lib/memoria";
import type { ClaveDeParte } from "@/lib/memoria/tipos";
import { relacionToDiagram, specToDiagram } from "@/lib/flowchart/spec-to-diagram";
import { fronteraDeLaPieza } from "@/lib/contexto/frontera-de-los-documentos";
import { estaRevisada } from "@/lib/canvas/diagnostico-generate";
import { ordenarObjetivosDelDiagnostico } from "@/lib/canvas/diagnostico-hilo";
import { dejarElEnfoqueCorto } from "@/lib/canvas/acciones-del-enfoque";
import { DESAFIO_KEY } from "@/lib/canvas/estado-del-documento";
import { POLITICA_RECTORA_KEY, SECCIONES_RETIRADAS_DEL_DIAGNOSTICO } from "@/components/landing/configs/diagnostico.defs";
import { SECCIONES_RETIRADAS_DE_PLANIFICACION } from "@/components/landing/configs/planificacion.defs";
import { ocultarSeccionesRetiradas } from "@/lib/canvas/retirar-secciones";
import { fusionarFilas, type FilaPropiedad } from "@/lib/planificacion/propiedades";
import { escalaParaPosicionar, posicionDeLaPropuesta, SECCION_DE_ESCALA } from "@/lib/escala/contexto";
import { tagLabels } from "@/lib/tags/catalog";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { resultadosParaPrompt } from "@/lib/handoff/resultados-medibles";
import { resolvePipeline } from "@/lib/projects/kind";
import { servicioDelProyecto, servicioParaElKickoff } from "@/lib/servicios/catalogo";
import { piezaDeLasNotas, reunionesDeLaCopia, seccionesQuitadas } from "./contexto-de-la-copia";
import { plantillaGuardadaDelTipo, tipoDeArtefacto, type TipoDeArtefacto } from "./tipos";
import { nombreDelArtefacto, tipoDelDocumento } from "./copias";
import { defsDelTipo, handoffKeysDelTipo, seccionesDeUnaCopia, templateDelTipo } from "./catalogo";
import { seccionesAgregadas, templateConLasAgregadas } from "@/lib/canvas/secciones-agregadas";
import { ErrorDelArtefacto } from "./copias-server";
import { fuenteConTope, mensajeDeLaCopia, TIPOS_QUE_LO_ALIMENTAN } from "./mensaje";

/**
 * El lector de la memoria de cada tipo (lib/memoria/consumidores.ts): el mismo que el documento de siempre de ese tipo,
 * así una copia de un documento que lee el cliente recibe la memoria recortada como él. Escrito como `{ lector: "…" }` a
 * propósito: lib/memoria/consumidores.test.ts busca esa forma en cada archivo declarado. `tambienLeer`: lo que ese lector
 * excluye porque su documento de siempre lo lee por otro lado (una copia no tiene esa vía).
 */
const LECTOR: Record<NonNullable<TipoDeArtefacto["contextoDe"]>, { lector: LectorDeMemoria; tambienLeer?: readonly ClaveDeParte[] }> = {
  diagnosis: { lector: "diagnosis", tambienLeer: ["ficha", "procesos"] },
  planning: { lector: "planning", tambienLeer: ["ficha", "procesos"] },
  kickoff: { lector: "kickoff" },
  exploration: { lector: "exploracion-del-proyecto" },
  "tech-requirements": { lector: "tech-requirements" },
  delivery: { lector: "delivery" },
};

/**
 * Con qué reglas lee cada tipo el cronograma y los cuestionarios: las de su documento de siempre. La Entrega y su informe no
 * lo leen a propósito (sus desviaciones internas no pueden llegar a lo que lee el cliente), y los cuestionarios traen los
 * niveles de la escala: solo el diagnóstico y la planificación saben qué hacer con ellos.
 */
const LEE_EL_CRONOGRAMA: ReadonlySet<TipoDeArtefacto["contextoDe"]> = new Set(["diagnosis", "planning", "kickoff"]);
const LEE_LOS_CUESTIONARIOS: ReadonlySet<TipoDeArtefacto["contextoDe"]> = new Set(["diagnosis", "planning"]);

/** La copia que se va a generar, o el motivo por el que no se puede. */
export async function copiaParaGenerar(projectId: string, canvasId: string) {
  const c = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, projectId, disabledAt: null },
    select: {
      id: true,
      slug: true,
      tipoArtefacto: true,
      name: true,
      titulo: true,
      sections: true,
      canvasSections: { select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true, source: true }, take: 1 } } },
    },
  });
  if (!c) throw new ErrorDelArtefacto(404, "Ese documento no es de este proyecto.");
  // El documento de siempre se genera con su runner (por /analyze): acá solo las copias.
  if (c.slug || !c.tipoArtefacto) throw new ErrorDelArtefacto(400, "Ese documento se genera con su botón de siempre.");
  const tipo = tipoDeArtefacto(tipoDelDocumento(c));
  if (!tipo) throw new ErrorDelArtefacto(400, "Ese documento no es de un tipo que se genere.");
  const yaTieneDeLaIa = c.canvasSections.some((s) => s.blocks[0]?.source === "AGENT");
  return { canvas: c, tipo, yaTieneDeLaIa };
}

export async function generarCopia(o: {
  projectId: string;
  canvasId: string;
  agentRunId: string | null;
  /** Lo que pidió quien genera, para esta corrida. */
  instrucciones?: string | null;
  alFase?: (fase: string) => void;
}): Promise<{ sectionCount: number }> {
  const { canvas, tipo } = await copiaParaGenerar(o.projectId, o.canvasId);
  const { plantilla } = plantillaGuardadaDelTipo(tipo.id, canvas.sections);
  /* Las secciones del catálogo que una persona agregó a la copia («+ Agregar sección», 2026-11-12) entran al template:
     la de una plantilla liviana no las trae, y sin esto la IA las dejaba vacías. */
  const base = templateConLasAgregadas(templateDelTipo(tipo.id, plantilla?.id ?? null), defsDelTipo(tipo.id) ?? [], seccionesAgregadas(canvas.sections));
  /* Las secciones de su plantilla que la copia no tiene (una duplicada de un documento viejo): se crean, como reconcilia el
     documento de siempre. Las nuevas van al final; el motor mantiene el cierre abajo. */
  const yaTiene = new Set(canvas.canvasSections.map((s) => s.key));
  const quitadas = seccionesQuitadas(canvas.sections);
  const faltan = seccionesDeUnaCopia(tipo.id, plantilla?.id ?? null).filter((s) => !yaTiene.has(s.key) && !quitadas.has(s.key));
  if (faltan.length) {
    await prisma.canvasSection.createMany({
      skipDuplicates: true,
      data: faltan.map((s, i) => ({ canvasId: o.canvasId, key: s.key, label: s.label, order: canvas.canvasSections.length + i })),
    });
  }
  const filas = await prisma.canvasSection.findMany({ where: { canvasId: o.canvasId }, select: { id: true, key: true } });
  const keysDeLaCopia = new Set(filas.map((s) => s.key));
  // El template, recortado a lo que la copia tiene: no se paga por escribir secciones que no se van a guardar.
  const template = { ...base, sections: base.sections.filter((s) => keysDeLaCopia.has(s.key)) };

  o.alFase?.(`Leyendo el contexto de ${tipo.conArticulo}…`);
  const doc = tipo.contextoDe ? documentoConContexto(tipo.contextoDe) : null;
  const proyecto = await prisma.project.findUnique({
    where: { id: o.projectId },
    select: {
      clientId: true,
      tags: true,
      servicioRecurrente: true,
      hubspotPipelineId: true,
      client: { select: { name: true, company: true, industry: true } },
    },
  });
  const servicio = proyecto
    ? servicioDelProyecto({
        servicioRecurrente: proyecto.servicioRecurrente,
        servicioDelPipeline: resolvePipeline(proyecto.hubspotPipelineId)?.servicioRecurrente ?? null,
      })
    : null;
  const escala =
    tipo.id === "kickoff"
      ? await escalaParaPosicionar(proyecto?.tags ?? [], {
          titulo: "EL ESTIMADO QUE DEJÓ LA PROPUESTA (un antecedente de la venta, no una medición)",
          posicion: await posicionDeLaPropuesta(o.projectId),
        })
      : null;
  /* Si las que entran solas no se pueden leer, la copia sale igual: nunca la frena (como los documentos de siempre). */
  const elegidas = reunionesDeLaCopia(canvas.sections);
  const ninguna = { todas: [] as string[], primero: [] as string[] };
  const solas =
    !doc || elegidas.length
      ? ninguna
      : await reunionesDeUnaCopiaSinElegidas(o.projectId, doc.destino).catch((e: unknown) => {
          console.warn("[artefactos] las reuniones del proyecto no se pudieron leer:", e instanceof Error ? e.message : e);
          return ninguna;
        });
  const [handoff, material, alimentan, cronograma, cuestionarios] = await Promise.all([
    // Sin allowlist solo un tipo interno (la Ejecución): `[]` dejaría al modelo con «Sin handoff».
    loadHandoffContext(o.projectId, { onlyConfirmed: false, ...(handoffKeysDelTipo(tipo.id).length || tipo.clientFacing ? { includeKeys: handoffKeysDelTipo(tipo.id) } : {}) }),
    doc
      ? cargarMaterialDelDocumento(o.projectId, doc, { deLaCopia: { reuniones: elegidas, notasDe: piezaDeLasNotas(o.canvasId) }, sumarReuniones: solas.todas, primero: solas.primero })
      : Promise.resolve(null),
    Promise.all(
      (TIPOS_QUE_LO_ALIMENTAN[tipo.id] ?? []).map(async (t) => ({
        tipo: t,
        texto: fuenteConTope(await loadCanvasContext(o.projectId, t, { onlyConfirmed: false, soloVisibles: true }).catch(() => "")),
      })),
    ),
    LEE_EL_CRONOGRAMA.has(tipo.contextoDe) ? loadTimelineContext(o.projectId).catch(() => "") : Promise.resolve(""),
    LEE_LOS_CUESTIONARIOS.has(tipo.contextoDe) ? loadCuestionarioContext(o.projectId).catch(() => "") : Promise.resolve(""),
  ]);
  const memoria = tipo.contextoDe
    ? await memoriaDelDocumento(o.projectId, {
        ...LECTOR[tipo.contextoDe],
        clientId: proyecto?.clientId ?? null,
        yaLeidas: material?.sesionesUsadas ?? [],
      })
    : null;

  // Las rutinas y el despliegue por olas dependen de la modalidad: desde el 2026-10-30 los escribe el plan de adopción.
  // La plantilla por niveles ES el despliegue por olas: elegirla ya decide la modalidad, que es solo una sugerencia por tamaño.
  const modalidad =
    tipo.id === TIPO_PLAN_DE_ADOPCION
      ? `=== MODALIDAD DE ADOPCIÓN ===\n${(await modalidadDeAdopcion(o.projectId, proyecto?.clientId ?? null)).texto}${
          plantilla?.id === "adopcion-por-niveles" ? "\nEsta plantilla es la de una organización por niveles: escribe el plan de despliegue por olas aunque la sugerencia diga otra cosa, con quién entra primero según las fuentes." : ""
        }\n\n`
      : "";

  const mensaje = mensajeDeLaCopia({
    pedido: `${modalidad}${bloqueDeInstruccionesDelPedido(o.instrucciones)}`,
    // Las instrucciones de ESTA copia: las del documento de siempre son de otro documento.
    instruccionesDeLaCopia: bloqueDeInstruccionesDeDoc(docBriefFrom(canvas.sections)),
    tipo,
    nombreDeLaCopia: nombreDelArtefacto(canvas),
    empresa: proyecto?.client?.name ?? proyecto?.client?.company ?? "el cliente",
    industria: proyecto?.client?.industry ?? null,
    alcanceEtiquetado: tagLabels(proyecto?.tags ?? []).join(", "),
    servicio: servicio?.nombre ?? "",
    delTipo:
      tipo.id === "kickoff"
        ? [servicio ? servicioParaElKickoff(servicio, null) : "", escala?.texto ?? ""].filter(Boolean).join("\n\n")
        : tipo.id === "diagnosis"
          ? // Los resultados con sus códigos, también los sin confirmar: los objetivos los citan (como el diagnóstico de siempre).
            resultadosParaPrompt((await resultadosDelProyecto(o.projectId).catch(() => null))?.resultados ?? [])
          : "",
    frontera: fronteraDeLaPieza(tipo.id),
    handoff,
    reuniones: material?.reuniones ?? "",
    avisoSinReuniones: material?.avisoSinReuniones ?? "",
    notas: material?.notas ?? "",
    memoria: memoria?.texto ?? "",
    alimentan: [...alimentan, { tipo: "timeline", texto: fuenteConTope(cronograma) }, { tipo: TIPO_CUESTIONARIOS, texto: fuenteConTope(cuestionarios) }],
    reunionesSolas: solas.todas.length > 0,
    cierreDeFrontera: material?.cierreDeFrontera ?? "",
  });

  // Carry-forward, como los runners de siempre: sin la data previa, `coerceToSchema` borraría lo que está fuera del schema.
  const prevDataByKey: Record<string, unknown> = {};
  for (const s of canvas.canvasSections) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  /* Lo que su tipo no reescribe. Diagnóstico: lo revisado por el ejecutivo (regenerar no lo devuelve a la sugerencia).
     Kickoff «Sin Escala»: la sección de la escala, que además se vacía abajo. */
  const saltar = new Set<string>();
  if (tipo.id === "diagnosis") for (const k of [POLITICA_RECTORA_KEY, DESAFIO_KEY]) if (estaRevisada(prevDataByKey[k])) saltar.add(k);
  const sinEscala = tipo.id === "kickoff" && !escala?.usa;
  if (sinEscala) saltar.add(SECCION_DE_ESCALA.kickoff);

  o.alFase?.(`Escribiendo ${tipo.conArticulo}…`);
  const generado = await generateSectionsForTemplate(template, mensaje, undefined, saltar.size ? saltar : undefined, prevDataByKey);
  const gen = tipo.id === "diagnosis" ? { ...generado, sections: dejarElEnfoqueCorto(ordenarObjetivosDelDiagnostico(generado.sections)) } : generado;
  /* Las propiedades de una persona o de una plantilla no se pisan: el agente reemplaza solo las suyas (como en la
     planificación de siempre, y por eso con el mismo `fusionarFilas`). */
  for (const s of gen.sections) {
    if (s.key !== "propiedades" || tipo.id !== "planning" || !s.data || typeof s.data !== "object") continue;
    const nuevas = (s.data as { filas?: FilaPropiedad[] }).filas ?? [];
    const previas = ((prevDataByKey.propiedades as { filas?: FilaPropiedad[] } | undefined)?.filas ?? []).filter((f) => f && typeof f === "object");
    s.data = { ...(s.data as object), filas: fusionarFilas(previas, Array.isArray(nuevas) ? nuevas : []) };
  }

  await guardarVersionDelDocumento(o.canvasId, { origen: "Antes de regenerar" });
  if (sinEscala) await prisma.canvasBlock.deleteMany({ where: { section: { canvasId: o.canvasId, key: SECCION_DE_ESCALA.kickoff } } });

  const idPorKey = new Map(filas.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = idPorKey.get(s.key);
    if (!sectionId) continue;
    // Los diagramas no los dibuja la IA: salen de la spec, como en el requerimiento técnico.
    if (s.key === "arquitectura" || s.key === "relacion_objetos") {
      const { diagram } = s.key === "arquitectura" ? specToDiagram(s.data) : relacionToDiagram(s.data);
      (s.data as Record<string, unknown>).diagram = diagram;
    }
    // Lo que el agente dejó vacío dice por qué: lo lee solo el equipo (lib/landing/por-que-vacia.ts).
    const razon = gen.porQueVacias[s.key] ?? null;
    await prisma.$transaction([
      prisma.canvasBlock.deleteMany({ where: { sectionId } }),
      prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: conPorQueVacia((s.data ?? {}) as object, razon) as Prisma.InputJsonValue,
          order: 0,
          source: "AGENT",
          status: "CONFIRMED",
          ...(o.agentRunId ? { agentRunId: o.agentRunId } : {}),
        },
      }),
    ]);
    sectionCount++;
  }
  if (sectionCount > 0) {
    // Lo retirado de una copia duplicada de un documento viejo se oculta al regenerar, como en el de siempre: se contradice.
    const retiradas = tipo.id === "diagnosis" ? SECCIONES_RETIRADAS_DEL_DIAGNOSTICO : tipo.id === "planning" ? SECCIONES_RETIRADAS_DE_PLANIFICACION : [];
    await ocultarSeccionesRetiradas(o.canvasId, [...keysDeLaCopia], retiradas);
    await prisma.projectCanvas.update({ where: { id: o.canvasId }, data: { contentUpdatedAt: new Date() } }).catch(() => {});
    // Las curadas de la planificación dicen quién las llena, como en el documento de siempre. Best-effort: ya está escrito.
    if (tipo.id === "planning") {
      for (const def of template.sections) {
        const sectionId = idPorKey.get(def.key);
        if (!sectionId || def.agentGenerated !== false || !(def.key in POR_QUE_DE_LAS_CURADAS)) continue;
        await anotarPorQueDeLaCurada(sectionId, def, { porQueDelAgente: {}, hayDiagnostico: true, leyoReuniones: true }, o.agentRunId).catch(() => {});
      }
    }
    // Qué reuniones leyó esta corrida: entran solas y nadie las eligió. Best-effort: el documento ya está escrito.
    if (o.agentRunId) await prisma.agentRun.update({ where: { id: o.agentRunId }, data: { sourceSessionIds: material?.sesionesUsadas ?? [] } }).catch(() => {});
  }
  return { sectionCount };
}
