import { NextRequest, NextResponse } from "next/server";
import { guardLecturaParaArrancar } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { parseCheckbox } from "@/lib/hubspot/project-properties";
import { resolveCompanyProjectIds } from "@/lib/hubspot/sync-projects";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { ordenarPorAntiguedad } from "@/lib/projects/lista-de-empresa";

/**
 * GET /api/handoffs/projects-of-company?companyId=<id>
 *
 * Paso 4 del stepper: lista los proyectos (record 0-970) que la company ya tiene en el
 * HubSpot SISTEMA, con nombre + etapa, cruzados con Nexus:
 *   - nexusProjectId: el Project de Nexus mapeado (si ya se importó) — adjuntable directo.
 *   - hasHandoff: si ese proyecto ya tiene handoff (para filtrarlo y evitar el 409).
 * Los que NO tienen nexusProjectId se importan al adjuntar (decisión: importar y adjuntar).
 * Solo lectura. El gate es `guardLecturaParaArrancar`: sirve tanto al asistente de handoff
 * como al botón de alta, que son los dos caminos legítimos que necesitan esta lista.
 */
const PROJECTS_OBJECT_TYPE = "0-970";

export async function GET(req: NextRequest) {
  const guard = await guardLecturaParaArrancar();
  if (guard instanceof NextResponse) return guard;

  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
  }

  try {
    const hs = await getSystemHubspotClient();
    const ids = await resolveCompanyProjectIds(hs, companyId);
    if (ids.length === 0) {
      /* ⚠ Acá NO se pregunta por una fusión, y es a propósito. Los dos llamadores de esta ruta
         mandan el `companyId` que salió de `/api/handoffs/lookup`, que busca POR DOMINIO — y el
         buscador de HubSpot solo devuelve fichas VIVAS. O sea que el id que llega acá es
         siempre el sobreviviente y `detectarFusion` respondería "vigente" el 100% de las veces:
         una llamada pagada en el caso más común del alta (empresa nueva, todavía sin proyectos)
         a cambio de un aviso que no puede dispararse nunca.

         La fusión SÍ se detecta donde el id viejo llega de verdad: `correrSync`, que lee el
         `hubspotCompanyId` guardado en el Client. Ver lib/hubspot/empresa-fusionada.ts. */
      return NextResponse.json({ projects: [] });
    }

    // Nombre + etapa + fecha de creación de cada record.
    const readRes = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${PROJECTS_OBJECT_TYPE}/batch/read`,
      body: {
        properties: ["hs_name", "hs_pipeline_stage", "hs_createdate", "proyecto_interno", "hs_pipeline"],
        inputs: ids.map((id) => ({ id })),
      },
    });
    const readData = (await readRes.json()) as {
      results?: { id: string; properties: Record<string, string | null> }[];
    };
    const records = readData.results ?? [];

    // Cruce con Nexus: hubspotServiceId → { nexusProjectId, hasHandoff }.
    // hasHandoff = el handoff está GENERADO (su canvas tiene bloques), no solo que
    // exista la entidad: tras un reset el contenido se borra (entidad vacía) y el
    // proyecto debe poder re-adjuntarse desde el stepper.
    const nexusProjects = await prisma.project.findMany({
      where: { hubspotServiceId: { in: ids } },
      /* `hubspotPipelineId` se LEE (no se escribe: sigue teniendo un solo escritor, ver la
         guarda en scope-coverage.test.ts). Viaja al DTO para que la pantalla pueda ofrecer como
         "padre" solo lo que el servidor va a aceptar como padre — una implementación de CS. Sin
         esto, el desplegable ofrece desarrollos y el rechazo llega recién al enviar. */
      select: { id: true, hubspotServiceId: true, hubspotPipelineId: true },
    });
    const generated = new Set<string>();
    for (const np of nexusProjects) {
      const blocks = await prisma.canvasBlock.count({
        where: { section: { canvas: canvasOfNested("handoff", { projectId: np.id }) } },
      });
      if (blocks > 0) generated.add(np.id);
    }
    const byServiceId = new Map(
      nexusProjects.map((p) => [
        p.hubspotServiceId!,
        {
          nexusProjectId: p.id,
          hasHandoff: generated.has(p.id),
          nexusPipelineId: p.hubspotPipelineId,
        },
      ]),
    );

    const projects = records.map((r) => {
      const nexus = byServiceId.get(r.id);
      return {
        hubspotProjectId: r.id,
        name: r.properties.hs_name ?? "(sin nombre)",
        stage: r.properties.hs_pipeline_stage ?? null,
        createdAt: r.properties.hs_createdate ?? null,
        nexusProjectId: nexus?.nexusProjectId ?? null,
        hasHandoff: nexus?.hasHandoff ?? false,
        /** El tipo MATERIALIZADO en Nexus. `null` = el proyecto todavía no está acá. */
        nexusPipelineId: nexus?.nexusPipelineId ?? null,
        /* Lo que HubSpot dice sobre "interno". Viaja para que el alta pueda MOSTRARLO en vez de
           preguntarlo: al adjuntar, la casilla no se aplicaría a nada —el motor solo escribe
           `proyecto_interno` cuando CREA el registro— así que ofrecerla editable prometería algo
           que Nexus no puede cumplir. Mismo criterio que `nexusPipelineId`, que se lee y no se
           escribe. */
        interno: parseCheckbox(r.properties.proyecto_interno),
        /* El pipeline que el record tiene EN HUBSPOT — distinto de `nexusPipelineId`, que es null
           mientras el proyecto no esté acá. Viaja porque al adjuntar el tipo también lo dicta
           HubSpot: mandar el del formulario deja el alta esperando para siempre a que el espejo
           devuelva un tipo que nunca va a coincidir. */
        hubspotPipelineId: r.properties.hs_pipeline ?? null,
      };
    });

    /* ⚠ EL ORDEN SE DECIDE ACÁ, no se hereda de HubSpot. `resolveCompanyProjectIds` devuelve las
       asociaciones en el orden que le da la gana la API —medido en vivo el 2026-08-01: dos
       llamadas con segundos de diferencia, distinto orden— y esta lista alimenta el desplegable
       de "¿de qué implementación cuelga?". Elegir "el segundo" mirando la pantalla y que se
       cuelgue de otro es un error de facturación silencioso. Ver lib/projects/lista-de-empresa.ts. */
    return NextResponse.json({ projects: ordenarPorAntiguedad(projects) });
  } catch (e) {
    console.error("[handoffs/projects-of-company] error:", e);
    return NextResponse.json({ error: "No se pudieron traer los proyectos." }, { status: 500 });
  }
}
