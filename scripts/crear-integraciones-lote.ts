/**
 * scripts/crear-integraciones-lote.ts — CREAR EL LOTE DE 17 PROYECTOS DE INTEGRACIÓN.
 *
 * Un lote puntual, pedido por Elías el 2026-08-06: 25 proyectos de una tabla externa, todos en
 * el pipeline "Development" (922785384 = "Desarrollo e integración" en Nexus). De los 25:
 *
 *   · 8 se DESCARTARON — ya existe un proyecto que cubre lo mismo (medido contra HubSpot antes
 *     de escribir nada; ver el chat). Entre ellos «Smarteam | SICOP», que es el mismo proyecto
 *     que esta sesión ya destrabó (hs=576715433570).
 *   · 5 tienen un proyecto parecido en el pipeline VIEJO ("Implementación de HubSpot") — Elías
 *     confirmó crearlas igual en Development y dejar las viejas como están.
 *   · 17 son las de este archivo.
 *
 * Reusa `crearProjectRecord` — el ÚNICO creador de proyectos en HubSpot (`creador-unico.test.ts`
 * lo hace cumplir con un fs-scan). Después de crear, un PATCH pone `aplicaciones_integradas` y,
 * si el origen decía "completo", la etapa Finalizado — dos propiedades que ese creador no cubre.
 *
 * Dry-run por default. Aplicar:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/crear-integraciones-lote.ts --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { crearProjectRecord, hasProjectsWriteScope, OBJETO_PROYECTOS } from "@/lib/hubspot/project-record";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";

const APPLY = resolverApply();

interface Fila {
  cuenta: string;
  companyId: string;
  app: string;
  appValue: string;
  completo: boolean;
  interno?: boolean;
}

// El App→valor sale directo de la propiedad `aplicaciones_integradas` (checkbox, 39 opciones).
const FILAS: Fila[] = [
  { cuenta: "Global Supply", companyId: "17025081686", app: "SW Nova", appValue: "sw_nova", completo: true },
  { cuenta: "Construtecho", companyId: "45822991199", app: "Asana", appValue: "asana", completo: true },
  { cuenta: "Multiquimica", companyId: "51633625907", app: "SAP", appValue: "sap", completo: false },
  { cuenta: "kölbi", companyId: "28524677478", app: "InfoClic", appValue: "infoclic", completo: false },
  { cuenta: "Aditec JCB", companyId: "9030734736", app: "BEST", appValue: "best", completo: false },
  { cuenta: "Grupo Inve", companyId: "28248924427", app: "Docusign", appValue: "docusign", completo: true },
  { cuenta: "ECOQUINTAS", companyId: "2529511891", app: "Workflow", appValue: "workflow", completo: true },
  { cuenta: "ALFA+ (LISJ)", companyId: "39401709362", app: "Dynamics 365", appValue: "dynamics_365", completo: true },
  { cuenta: "DISTELSA - Distribuidora de Materiales para Telecomunicaciones S.A", companyId: "34134005112", app: "SAP", appValue: "sap", completo: false },
  { cuenta: "BLUESAT", companyId: "26936443031", app: "SignNow", appValue: "signnow", completo: false },
  { cuenta: "Analisalab", companyId: "54896366149", app: "SAP", appValue: "sap", completo: false },
  { cuenta: "Cicadex", companyId: "2946340518", app: "3CX", appValue: "p_3cx", completo: false },
  { cuenta: "AMC - Atlas Mining & Construction", companyId: "52170528351", app: "SAP", appValue: "sap", completo: false },
  { cuenta: "Visual Branding", companyId: "55105163789", app: "Odoo", appValue: "odoo", completo: false },
  { cuenta: "Areyá", companyId: "53154855252", app: "EnKontrol", appValue: "enkontrol", completo: false },
  { cuenta: "Secure Title", companyId: "34306242996", app: "Secure Tittle", appValue: "secure_tittle", completo: false },
  { cuenta: "Smarteam", companyId: "2572390874", app: "Reportes web", appValue: "reportes_web", completo: false, interno: true },
];

async function main() {
  const pipeline = PROJECT_PIPELINES.find((p) => p.hubspotPipelineId === "922785384");
  if (!pipeline) throw new Error("No se encontró el pipeline Development (922785384) en PROJECT_PIPELINES");
  const finalizado = pipeline.stages.find((s) => s.label === "Finalizado");
  if (!finalizado) throw new Error("El pipeline Development no declara una etapa Finalizado");

  console.log(`${APPLY ? "⚠ APLICANDO" : "DRY-RUN"} — ${FILAS.length} proyectos en "${pipeline.label}" (${pipeline.hubspotPipelineId})\n`);

  if (APPLY) {
    const puede = await hasProjectsWriteScope();
    if (!puede) throw new Error("El token del sistema no tiene crm.objects.projects.write. Nada se crea.");
  }

  const hs = await getSystemHubspotClient();
  const resultados: Array<{ fila: Fila; ok: boolean; id?: string; error?: string }> = [];

  for (const fila of FILAS) {
    const nombre = `Integración con ${fila.app} | ${fila.cuenta}`;
    console.log(`· ${nombre}`);
    console.log(`    empresa=${fila.companyId}  etapa=${fila.completo ? "Finalizado" : pipeline.stages[0].label}  apps=${fila.appValue}${fila.interno ? "  INTERNO" : ""}`);

    if (!APPLY) continue;

    try {
      const id = await crearProjectRecord(hs, {
        nombre,
        pipeline,
        interno: fila.interno,
        empresaId: fila.companyId,
      });

      // El creador único no cubre stage-override ni checkboxes propios de este lote:
      // ambos van en un PATCH aparte, después de que el record ya existe con su empresa.
      const propsExtra: Record<string, string> = { aplicaciones_integradas: fila.appValue };
      if (fila.completo) propsExtra.hs_pipeline_stage = finalizado.id;
      const rPatch = await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${id}`,
        body: { properties: propsExtra },
      });
      if (!rPatch.ok) {
        const cuerpo = await rPatch.text().catch(() => "");
        throw new Error(`creado (${id}) pero el PATCH de propiedades falló (${rPatch.status}): ${cuerpo.slice(0, 200)}`);
      }

      console.log(`    ✓ creado ${id}`);
      resultados.push({ fila, ok: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`    ✗ ${msg}`);
      resultados.push({ fila, ok: false, error: msg });
    }
  }

  if (APPLY) {
    const ok = resultados.filter((r) => r.ok).length;
    console.log(`\n${ok}/${FILAS.length} creados.`);
    const fallidos = resultados.filter((r) => !r.ok);
    if (fallidos.length) {
      console.log("Fallaron:");
      for (const f of fallidos) console.log(`  - ${f.fila.cuenta} / ${f.fila.app}: ${f.error}`);
    }
    console.log(
      "\nNo hace falta nada más de este lado: el próximo sync de Nexus los va a descubrir " +
        "solo, por la asociación con la empresa.",
    );
  } else {
    console.log(`\nDry-run. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/crear-integraciones-lote.ts --apply`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
