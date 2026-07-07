/**
 * POST /api/business-cases/[id]/generate
 *
 * Llena el canvas del business case con el agente (datos ESTRUCTURADOS por sección):
 *   1. Junta el contexto (transcripts pegados/subidos + transcripts de las
 *      sesiones incluidas).
 *   2. Crea SIEMPRE un caso de uso nuevo (v1, v2, …); el agente lee las guías de la
 *      Plantilla (v0), que nunca se llena.
 *   3. El agente produce `data` por sección → se escribe YA ACEPTADO (CONFIRMED) en el
 *      bloque de cada sección. El vendedor edita/borra (no hay paso de "confirmar").
 *
 * Exige ≥1 fuente de contexto. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { generateCanvasSections } from "@/lib/business-cases/canvas-agent";
import { loadBcFeeding } from "@/lib/business-cases/feeding";
import { briefsByKeyFrom, parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { templateById, templateDefsByKey } from "@/components/landing/configs/templates.defs";
import {
  loadSelectedUseCases,
  useCasesSectionData,
  USE_CASES_SECTION_KEY,
} from "@/lib/business-cases/use-cases";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimeline } from "@/lib/hubspot/company-timeline";

// Timeout envolvente del LLM: el SDK de Anthropic tiene su propio timeout (10min)
// + 2 reintentos — sin envoltura, un cuelgue de la API puede dejar esta request
// abierta ~30 min saturando un worker de Next. 3 min cubre con margen una
// generación real de 8-12 secciones; al vencer, el catch de abajo marca el
// AgentRun como ERROR y responde un mensaje humano.
const GEN_TIMEOUT_MS = 180_000;
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      hubspotCompanyId: true,
      caseType: true,
      caseSubtype: true,
      client: { select: { notes: true } },
    },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  // ── Contexto: transcripts manuales + transcripts de las sesiones que ALIMENTAN
  //    el caso (regla de Ventas + overrides; mismo criterio que el panel) ─────────
  const feeding = await loadBcFeeding(id);
  const feedingIds = feeding?.feedingIds ?? [];
  const [transcripts, sessions] = await Promise.all([
    prisma.businessCaseTranscript.findMany({
      where: { businessCaseId: id },
      select: { rawText: true, fileName: true },
    }),
    feedingIds.length
      ? prisma.firefliesSession.findMany({
          where: { id: { in: feedingIds } },
          select: { title: true, date: true, transcript: true },
        })
      : Promise.resolve([] as { title: string; date: Date; transcript: string | null }[]),
  ]);

  const parts: string[] = [];
  for (const t of transcripts) {
    if (t.rawText.trim()) parts.push(`# Nota/transcript${t.fileName ? ` (${t.fileName})` : ""}\n${t.rawText.trim()}`);
  }
  let sessionsWithoutTranscript = 0;
  for (const s of sessions) {
    if (s.transcript?.trim()) parts.push(`# Sesión: ${s.title}\n${s.transcript.trim()}`);
    else sessionsWithoutTranscript++;
  }

  // Notas internas de la empresa (Nexus) + timeline de HubSpot (notas + llamadas/reuniones).
  // Clave para prospectos por HubSpot cuyas reuniones (Zoom) no están en el sync de Meet.
  if (bc.client.notes?.trim()) {
    parts.push(`# Notas internas de la empresa\n${bc.client.notes.trim()}`);
  }
  if (bc.hubspotCompanyId) {
    try {
      const hs = await getSystemHubspotClient();
      const timeline = await fetchCompanyTimeline(hs, bc.hubspotCompanyId);
      if (timeline.trim()) parts.push(`# Timeline de HubSpot (notas + llamadas/reuniones)\n${timeline}`);
    } catch {
      /* sin cuenta HubSpot del sistema / sin scope concedido → seguimos sin el timeline */
    }
  }

  const context = parts.join("\n\n---\n\n");
  if (!context.trim()) {
    // Mensaje claro: distinguir "no hay fuentes" de "las sesiones no tienen transcripción aún".
    const error =
      sessionsWithoutTranscript > 0
        ? "Las sesiones del prospecto todavía no tienen transcripción. Pegá un transcript a mano en “Fuentes manuales” (o esperá a que se transcriba la reunión)."
        : "Agregá una sesión del prospecto con transcripción o pegá un transcript a mano antes de generar.";
    return NextResponse.json({ error }, { status: 400 });
  }

  // ── Guías del agente: SIEMPRE desde la Plantilla (v0). Fallback al activo (BC legacy). ──
  const template =
    (await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, version: 0 },
      select: { sections: true },
    })) ??
    (await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, isActive: true },
      select: { sections: true },
    }));

  // Tipo/template del caso: columna → __meta del v0 → default hubspot (BCs legacy: no-op).
  const resolved = resolveCaseTypeFor(bc, template?.sections);

  // Casos de uso seleccionados en el checklist. NO cuentan como fuente (el guard de
  // arriba ya corrió — son input de materialización, no contexto del prospecto);
  // entran al prompt para que el hero/solución/inversión los referencien SIN
  // inventar otros ni alterar precios. Con cero seleccionados: contexto byte-idéntico.
  // Template con checklist APAGADO (website): se ignoran pivotes aunque existan —
  // no hay sección de materialización, y sin ella los precios se tejerían en texto libre.
  const checklistOn = templateById(resolved.templateId).features?.useCaseChecklist !== false;
  const selectedUseCases = checklistOn ? await loadSelectedUseCases(id) : [];

  const preamble: string[] = [];
  if (resolved.caseType) {
    preamble.push(
      `# Tipo de caso: ${resolved.typeDef.label}${
        resolved.caseSubtype
          ? ` (${resolved.typeDef.subtypes?.find((s) => s.id === resolved.caseSubtype)?.label ?? resolved.caseSubtype})`
          : ""
      }`,
    );
  }
  if (selectedUseCases.length) {
    preamble.push(
      `# Casos de uso seleccionados por el vendedor (catálogo Smarteam)\nEl vendedor marcó estos casos de uso para incluir en la propuesta. Tenelos en cuenta al redactar (mencionalos donde aporten, NO inventes otros casos de uso del catálogo NI alteres sus precios — la sección de casos de uso se arma aparte con los datos exactos):\n${selectedUseCases
        .map((u) => `- ${u.title}${u.price ? ` — ${u.price}` : ""}\n  ${u.description}`)
        .join("\n")}`,
    );
  }
  const contextForAgent = preamble.length ? `${preamble.join("\n\n")}\n\n---\n\n${context}` : context;

  // Guard anti-doble-generación: si ya hay una corrida en curso para este BC (otra
  // pestaña, retry de red), no arrancamos otra — evita dos casos con la misma versión.
  // Ventana acotada (para que una corrida colgada no bloquee para siempre) y DERIVADA
  // del template: website genera 12k tokens (~4-6 min) → 5 min quedaba corto y un
  // retry del vendedor durante una corrida lenta pasaba el guard. Nota: el SDK exige
  // streaming si estima >10 min de salida — cualquier bump futuro de maxTokens choca ahí.
  const guardMinutes = (templateById(resolved.templateId).maxTokens ?? 8000) > 8000 ? 10 : 5;
  const inFlight = await prisma.agentRun.findFirst({
    where: {
      businessCaseId: id,
      agentSlug: "business-case",
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - guardMinutes * 60 * 1000) },
    },
    select: { id: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: "Ya hay una generación en curso para este caso. Esperá a que termine." },
      { status: 409 },
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      clientId: bc.clientId,
      businessCaseId: id,
      status: "RUNNING",
      agentSlug: "business-case",
      stepLabel: "Generación",
      currentPhase: "Leyendo el contexto…",
    },
    select: { id: true },
  });
  // Fase visible para el polling del workspace (F5.2) — fire-and-forget: si el
  // update de fase falla, la generación sigue (es solo feedback).
  const setPhase = (phase: string) =>
    prisma.agentRun.update({ where: { id: run.id }, data: { currentPhase: phase } }).catch(() => {});

  try {
    // Guía efectiva por sección: el override del CSE en la Plantilla gana; si no, el
    // agente cae al brief por defecto de la config (BC_DEF_BY_KEY.brief).
    const briefsByKey = briefsByKeyFrom(template?.sections);

    // Carry-forward desde el canvas ACTIVO previo — el v0 (Plantilla) INCLUIDO: en el
    // primer "Generar" el activo ES la Plantilla, y una portada subida ahí debe
    // heredarse al caso. Se lee ANTES de que la transacción lo desactive:
    //  (a) keys NO-schema por sección (brands, coverImageUrl, buttonUrl) —
    //      coerceToSchema las descarta → sin esto se pierden al (re)generar;
    //  (b) decisiones hidden EXPLÍCITAS — si el CSE mostró una sección defaultHidden,
    //      el caso nuevo no debe volver a esconderla.
    const prevCanvas = await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, isActive: true },
      select: { sections: true },
    });
    const prevHiddenByKey: Record<string, boolean> = {};
    for (const e of parseSectionEntries(prevCanvas?.sections)) {
      if (typeof e.hidden === "boolean") prevHiddenByKey[e.key] = e.hidden;
    }

    // Las secciones que quedarán OCULTAS en el caso nuevo NO se generan (tokens y
    // latencia por contenido que el cliente no ve). Al mostrarlas y regenerar, entran.
    const skipKeys = new Set(
      templateById(resolved.templateId)
        .sections.filter((d) => (prevHiddenByKey[d.key] ?? d.defaultHidden) === true)
        .map((d) => d.key),
    );

    await setPhase("Generando las secciones con IA…");
    const gen = await withTimeout(
      generateCanvasSections(contextForAgent, briefsByKey, resolved.templateId, skipKeys), // LLM, FUERA de la tx
      GEN_TIMEOUT_MS,
      "La generación con IA superó los 3 minutos — reintentá.",
    );
    await setPhase("Guardando el caso…");
    const generated = gen.sections;

    // Carry-forward (a): keys NO-schema de CADA sección — coerceToSchema las descarta
    // al generar → sin esto se pierden al regenerar la portada del hero (coverImageUrl),
    // la brand-row (brands) y la URL del botón del CTA (buttonUrl), todas configuradas
    // por el CSE, no por el agente. Incluye el v0 (primer Generar: activo = Plantilla).
    const prevBlocks = await prisma.canvasSection.findMany({
      where: { canvas: { businessCaseId: id, isActive: true } },
      orderBy: { order: "asc" }, // el ORDEN previo (drag & drop) también se hereda
      select: { key: true, blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } },
    });
    const prevDataByKey = new Map(prevBlocks.map((s) => [s.key, s.blocks[0]?.data]));
    const defsByKey = templateDefsByKey(resolved.templateId);
    // Shapes v1 de secciones migradas (ver components/landing/types.ts) — NUNCA se
    // cargan hacia adelante junto con el resto de keys no-schema: si el campo nuevo
    // viene vacío en esta corrida (el LLM no lo llenó; el schema no valida "required"),
    // el fallback legacy de los componentes "resucitaría" contenido viejo en vez de
    // mostrar la sección tal como el agente la generó esta vez.
    const LEGACY_CARRY_EXCLUDE = new Set(["nodos", "flujos", "porQuePlataforma", "bloques"]);
    for (const gs of generated) {
      const prev = prevDataByKey.get(gs.key);
      const def = defsByKey[gs.key];
      if (!def || !prev || typeof prev !== "object" || Array.isArray(prev)) continue;
      const schemaKeys = new Set(
        Object.keys((def.schema as { properties?: Record<string, unknown> }).properties ?? {}),
      );
      const merged = { ...(gs.data as Record<string, unknown>) };
      for (const k of Object.keys(prev as Record<string, unknown>)) {
        if (!schemaKeys.has(k) && !LEGACY_CARRY_EXCLUDE.has(k)) merged[k] = (prev as Record<string, unknown>)[k];
      }
      gs.data = merged;
    }
    // Secciones OCULTAS (skipKeys) no se regeneran (tokens/latencia) — pero "ocultar"
    // no es "borrar": sin esto, el bloque quedaba reseteado al `empty` sembrado por
    // createBusinessCaseCanvas y el CSE perdía el contenido al volver a mostrarlas.
    // Se cargan tal cual (mismo objeto, sin pasar por el merge de arriba — no hay
    // campo "nuevo" que resucitar contra, es el mismo dato de siempre).
    for (const key of skipKeys) {
      if (generated.some((g) => g.key === key)) continue;
      const prev = prevDataByKey.get(key);
      if (prev != null) generated.push({ key, data: prev });
    }
    // Idioma de ESTA corrida (`__lang`, key no-schema del hero): SIEMPRE se re-escribe
    // — nunca por carry-forward, que arrastraría el idioma de la versión anterior.
    const heroGen = generated.find((g) => g.key === "hero");
    if (heroGen && heroGen.data && typeof heroGen.data === "object") {
      const heroData = heroGen.data as Record<string, unknown>;
      if (gen.lang) heroData.__lang = gen.lang;
      else delete heroData.__lang;
    }

    // Cada "Generar" crea un CASO NUEVO (v1, v2, …). La Plantilla (v0) nunca se llena.
    const last = await prisma.projectCanvas.aggregate({
      where: { businessCaseId: id },
      _max: { version: true },
    });
    const version = (last._max.version ?? 0) + 1;

    // Atómico: crear el caso (+ desactivar el previo) y llenar los bloques con el data
    // generado, YA ACEPTADO (CONFIRMED), TODO o NADA. Si algo falla, no queda un caso
    // vacío activo ni se desactiva el caso bueno anterior.
    const canvasId = await prisma.$transaction(async (tx) => {
      const cid = await createBusinessCaseCanvas(id, version, tx, resolved.templateId, {
        caseType: resolved.caseType,
        caseSubtype: resolved.caseSubtype,
        hiddenByKey: prevHiddenByKey,
        orderedKeys: prevBlocks.map((s) => s.key),
      });
      // Idioma de esta corrida: fuente de verdad persistente en el caso — no atada
      // al hero (que puede perder `__lang` en una edición manual o regeneración parcial).
      await tx.businessCase.update({ where: { id }, data: { language: gen.lang || "es" } });

      const sections = await tx.canvasSection.findMany({
        where: { canvasId: cid },
        select: { id: true, key: true, blocks: { select: { id: true }, orderBy: { order: "asc" }, take: 1 } },
      });
      const sectionByKey = new Map(sections.map((s) => [s.key, s]));
      const writeSection = async (key: string, data: Prisma.InputJsonValue) => {
        const section = sectionByKey.get(key);
        if (!section) return;
        const blockId = section.blocks[0]?.id;
        if (blockId) {
          await tx.canvasBlock.update({
            where: { id: blockId },
            data: { data, content: null, source: "AGENT", status: "CONFIRMED", agentRunId: run.id },
          });
        } else {
          await tx.canvasBlock.create({
            data: { sectionId: section.id, blockType: "CARD", content: null, data, order: 0, source: "AGENT", status: "CONFIRMED", agentRunId: run.id },
          });
        }
      };
      for (const gs of generated) {
        await writeSection(gs.key, gs.data as Prisma.InputJsonValue);
      }
      // Sección `casos_de_uso` (agentGenerated:false): SIEMPRE determinística — con
      // seleccionados escribe los datos EXACTOS del catálogo; sin seleccionados,
      // {items:[]} explícito (blank → invisible). Cinturón y tiradores contra
      // cualquier fuga del LLM: nunca queda contenido generado en esta sección.
      await writeSection(
        USE_CASES_SECTION_KEY,
        useCasesSectionData(selectedUseCases) as unknown as Prisma.InputJsonValue,
      );
      // Idioma ≠ español: el agente tradujo los títulos/eyebrows de sección →
      // se aplican como overrides de cara al cliente (editables después como siempre).
      const overrideKeys = new Set([
        ...Object.keys(gen.titleOverrides),
        ...Object.keys(gen.eyebrowOverrides),
      ]);
      for (const key of overrideKeys) {
        await tx.canvasSection.updateMany({
          where: { canvasId: cid, key },
          data: {
            ...(gen.titleOverrides[key] ? { titleOverride: gen.titleOverrides[key] } : {}),
            ...(gen.eyebrowOverrides[key] ? { eyebrowOverride: gen.eyebrowOverrides[key] } : {}),
          },
        });
      }
      return cid;
    });

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
    return NextResponse.json({ canvasId, version });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error desconocido";
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: message } });
    return NextResponse.json({ error: "La generación falló: " + message }, { status: 500 });
  }
}
