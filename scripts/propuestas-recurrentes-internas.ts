/**
 * scripts/propuestas-recurrentes-internas.ts — arma la PROPUESTA RECURRENTE INTERNA de FACO, Colby, Cayalá y Grupo Inve
 * (roadmap «La siguiente serie», iniciativa 3, paso 7). La regla es pura: lib/servicios/propuesta-interna.ts.
 *
 * Por cada cliente: busca su propuesta aprobada o publicada más reciente (solo la LEE), su proyecto recurrente, y arma una
 * propuesta nueva con la plantilla recurrente que refleja lo vendido — los casos de uso y la inversión de la firmada, y la
 * cadencia, el ciclo y el nivel de servicio del catálogo. Nunca se publica. Si el proyecto recurrente no tiene servicio,
 * queda con éste y con esta propuesta.
 *
 *   npx tsx scripts/propuestas-recurrentes-internas.ts                                   # simulacro: solo lee
 *   npx tsx scripts/propuestas-recurrentes-internas.ts --servicio "Colby=soporte-hubspot" # otro servicio para un cliente
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-recurrentes-internas.ts --apply --firma <tu correo>
 *
 * ⛔ No toca la propuesta firmada ni escribe en HubSpot. ⛔ Nunca Wherex. Un nombre que coincide con más de un cliente
 * frena ese cliente y muestra los candidatos: se corrige con `--cliente "FACO=<id>"`.
 * Correrlo dos veces no duplica: un cliente que ya tiene su propuesta interna se salta.
 * Deshacer: las propuestas se llaman «… · interna» (createdByEmail = la firma); el proyecto guarda `servicioPropuestaId`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCase } from "@/lib/business-cases/mutations";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { RECURRENTE_TEMPLATE_ID, SERVICIO_RECURRENTE_TYPE_ID, seedTagsFor, resolveBcType } from "@/lib/business-cases/case-types";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { pipelineByKey } from "@/lib/projects/kind";
import { ETAPA_CONTINUIDAD } from "@/lib/servicios/recurrencia";
import { servicioDelCatalogo } from "@/lib/servicios/catalogo";
import { esClienteVedado, planDeLaPropuestaInterna, type FirmadaParaLeer } from "@/lib/servicios/propuesta-interna";

const APPLY = resolverApply({ tablas: ["BusinessCase", "ProjectCanvas", "CanvasSection", "CanvasBlock", "Project"] });

/** Los cuatro clientes y el servicio que se les vendió (a confirmar Colby). */
const CLIENTES: ReadonlyArray<{ nombre: string; servicio: string }> = [
  { nombre: "FACO", servicio: "smartloop" },
  { nombre: "Colby", servicio: "smartloop" },
  { nombre: "Cayalá", servicio: "smartloop" },
  { nombre: "Grupo Inve", servicio: "smartloop" },
];

function args(nombre: string): string[] {
  const fuera: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === nombre && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) fuera.push(process.argv[i + 1]);
  });
  return fuera;
}
const pares = (nombre: string) => new Map(args(nombre).map((x) => [x.split("=")[0].trim().toLowerCase(), x.split("=").slice(1).join("=").trim()]));

async function datosDeLaSeccion(canvasId: string | undefined, key: string): Promise<unknown> {
  if (!canvasId) return null;
  const s = await prisma.canvasSection.findFirst({ where: { canvasId, key }, select: { blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } } });
  return s?.blocks[0]?.data ?? null;
}

async function main() {
  imprimirDestino();
  const firma = args("--firma")[0]?.trim().toLowerCase() ?? null;
  if (APPLY && (!firma || !firma.includes("@"))) {
    console.error("Con --apply hace falta --firma <tu correo>: queda como quien creó cada propuesta.");
    process.exit(1);
  }
  const servicios = pares("--servicio");
  const ids = pares("--cliente");
  const smartloop = pipelineByKey("smartloop");
  const cs = pipelineByKey("customer-success");

  console.log(`${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"}\n`);
  for (const c of CLIENTES) {
    const claveServicio = servicios.get(c.nombre.toLowerCase()) ?? c.servicio;
    const servicio = servicioDelCatalogo(claveServicio);
    console.log(`━━ ${c.nombre} · ${servicio?.nombre ?? claveServicio}`);
    if (!servicio) {
      console.log(`   ⛔ «${claveServicio}» no está en el catálogo de servicios.`);
      continue;
    }
    const porId = ids.get(c.nombre.toLowerCase());
    const candidatos = await prisma.client.findMany({
      where: porId ? { id: porId } : { name: { contains: c.nombre, mode: "insensitive" }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
      select: { id: true, name: true, kind: true },
    });
    const validos = candidatos.filter((x) => !esClienteVedado(x.name));
    if (validos.length !== 1) {
      console.log(validos.length ? `   ⛔ Más de un cliente coincide: ${validos.map((x) => `${x.name} (${x.id})`).join(" · ")}. Usa --cliente "${c.nombre}=<id>".` : "   ⛔ Ningún cliente coincide.");
      continue;
    }
    const cliente = validos[0];
    const yaInterna = await prisma.businessCase.findFirst({
      where: { clientId: cliente.id, caseType: SERVICIO_RECURRENTE_TYPE_ID, name: { endsWith: "· interna" } },
      select: { id: true, name: true },
    });
    if (yaInterna) {
      console.log(`   ✓ Ya tiene su propuesta interna: «${yaInterna.name}» (${yaInterna.id}). Se salta.`);
      continue;
    }

    const firmadaBc = await prisma.businessCase.findFirst({
      where: { clientId: cliente.id, OR: [{ approvedAt: { not: null } }, { publishedAt: { not: null } }] },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }],
      select: { id: true, name: true, approvedAt: true, canvases: { where: { isActive: true, version: { gt: 0 } }, orderBy: { version: "desc" }, take: 1, select: { id: true } } },
    });
    let firmada: FirmadaParaLeer | null = null;
    if (firmadaBc) {
      const canvasId = firmadaBc.canvases[0]?.id;
      const personalizadas = canvasId
        ? (await prisma.canvasSection.findMany({ where: { canvasId }, select: { key: true, label: true, titleOverride: true } }))
            .filter((s) => esCustomKey(s.key))
            .map((s) => s.titleOverride || s.label)
        : [];
      firmada = {
        id: firmadaBc.id,
        nombre: firmadaBc.name,
        aprobadaEl: firmadaBc.approvedAt ? firmadaBc.approvedAt.toISOString().slice(0, 10) : null,
        casosData: await datosDeLaSeccion(canvasId, "casos_de_uso"),
        inversionData: await datosDeLaSeccion(canvasId, "inversion"),
        personalizadas,
      };
    }
    const proyecto = await prisma.project.findFirst({
      where: {
        clientId: cliente.id,
        esPrueba: false,
        status: { not: "completed" },
        OR: [{ hubspotPipelineId: smartloop.hubspotPipelineId }, { hubspotPipelineId: cs.hubspotPipelineId, hubspotPipelineStageId: ETAPA_CONTINUIDAD ?? "" }, { servicioRecurrente: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, servicioRecurrente: true },
    });

    const plan = planDeLaPropuestaInterna({
      cliente: cliente.name,
      servicio,
      firmada,
      proyecto: proyecto ? { id: proyecto.id, nombre: proyecto.name, servicioRecurrente: proyecto.servicioRecurrente } : null,
    });
    console.log(`   Cliente:     ${cliente.name} (${cliente.id}${cliente.kind === "PROSPECTO" ? ", prospecto" : ""})`);
    console.log(`   Firmada:     ${firmada ? `«${firmada.nombre}» (${firmada.id})${firmada.aprobadaEl ? `, aprobada el ${firmada.aprobadaEl}` : ", publicada"} · solo se lee` : "ninguna"}`);
    console.log(`   Nueva:       «${plan.nombre}» · plantilla recurrente · nunca se publica`);
    console.log(`   Secciones:   ${Object.keys(plan.secciones).join(", ")}`);
    console.log(`   Proyecto:    ${plan.proyecto ? `«${plan.proyecto.nombre}» queda con ${servicio.nombre} y esta propuesta` : "no se toca"}`);
    for (const a of plan.avisos) console.log(`   ⚠ ${a}`);

    if (!APPLY) continue;
    const tipo = resolveBcType(SERVICIO_RECURRENTE_TYPE_ID);
    await prisma.$transaction(async (tx) => {
      const bc = await createBusinessCase(
        { clientId: cliente.id, name: plan.nombre, createdByEmail: firma, caseType: SERVICIO_RECURRENTE_TYPE_ID, caseSubtype: servicio.clave, tags: seedTagsFor(tipo, servicio.clave) },
        tx,
      );
      await createBusinessCaseCanvas(bc.id, 0, tx, RECURRENTE_TEMPLATE_ID, { caseType: SERVICIO_RECURRENTE_TYPE_ID, caseSubtype: servicio.clave });
      const cid = await createBusinessCaseCanvas(bc.id, 1, tx, RECURRENTE_TEMPLATE_ID, { caseType: SERVICIO_RECURRENTE_TYPE_ID, caseSubtype: servicio.clave });
      const secciones = await tx.canvasSection.findMany({ where: { canvasId: cid }, select: { id: true, key: true, blocks: { orderBy: { order: "asc" }, take: 1, select: { id: true } } } });
      for (const s of secciones) {
        const data = plan.secciones[s.key];
        if (data === undefined) continue;
        const json = JSON.parse(JSON.stringify(data));
        if (s.blocks[0]) await tx.canvasBlock.update({ where: { id: s.blocks[0].id }, data: { data: json, content: null, source: "HUMAN", status: "CONFIRMED" } });
        else await tx.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", content: null, data: json, order: 0, source: "HUMAN", status: "CONFIRMED" } });
      }
      if (plan.proyecto) {
        await tx.project.updateMany({
          where: { id: plan.proyecto.id, servicioRecurrente: null },
          data: { servicioRecurrente: servicio.clave, servicioDesde: firmada?.aprobadaEl ? new Date(`${firmada.aprobadaEl}T12:00:00.000Z`) : new Date(), servicioPropuestaId: bc.id },
        });
      }
      console.log(`   ✓ Creada «${plan.nombre}» (${bc.id}).`);
    });
  }
  if (!APPLY) console.log("\nPara crearlas: el mismo comando con --apply --firma <tu correo> y ALLOW_PROD_WRITE=1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
