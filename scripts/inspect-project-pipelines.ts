/**
 * scripts/inspect-project-pipelines.ts  (SOLO LECTURA — Tanda A, paso A0)
 *
 * Los cinco datos que el repo NO tiene y que el plan de tres pipelines necesita antes de
 * escribir una sola columna. No escribe nada, ni en Nexus ni en HubSpot.
 *
 *   1. Los IDs de pipeline de "Development" y "Sitios web" (el de Customer Success ya se
 *      conoce: 826270797). Con TODAS sus etapas, para poder confirmar el gate.
 *   2. La propiedad `proyecto_interno`: nombre interno real, tipo y fieldType.
 *   3. El typeId de la asociación proyecto↔proyecto (el "hermano").
 *   4. EL CENSO: por cada proyecto de HubSpot, qué decide la regla de HOY (por el estado
 *      crudo) y qué decidiría la regla NUEVA (por la etapa). La lista de FLIPS es el gate
 *      humano de A2 — sin esa lista aprobada, A2 no se deploya.
 *   5. Cuántos proyectos tienen `proyecto_interno` vacío. Decide si la columna nace
 *      NOT NULL DEFAULT false o nullable: una vez aplicado el default, "false" y "nunca
 *      leído" son indistinguibles para siempre.
 *
 * ── EL GATE ──────────────────────────────────────────────────────────────────
 * Las tres etapas de cierre que dio Elías tienen que aparecer CADA UNA dentro de SU
 * pipeline. Si una no calza, el dato está mal y A2 rompería el cierre de Customer Success
 * —que hoy funciona— a cambio de arreglar dos pipelines que todavía no existen.
 *
 * Uso: npx tsx scripts/inspect-project-pipelines.ts
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";

// Pool ACOTADO (max: 2). El pooler de Supabase da ~15 slots compartidos entre prod,
// las dos PCs de dev y cualquier script suelto — ver scripts/lib/db.ts.
const { prisma, close } = createScriptDb();

/**
 * Lo que la tabla DECLARA, para verificarlo contra el portal. Sale de `PROJECT_PIPELINES` en
 * vez de estar escrito a mano acá: era una segunda copia de los mismos ids y envejecía sola.
 *
 * ── SE COMPARA CONTRA EL ID, NO CONTRA EL NOMBRE ─────────────────────────────
 * Antes el gate exigía que el label del pipeline calzara con una regex (`/customer\s*success/i`).
 * El 2026-07-30 el pipeline se renombró a "HubSpot" en el portal y el gate empezó a reportar
 * NO PASA para siempre — por una razón falsa, con las etapas de cierre intactas. Un gate que
 * grita en falso deja de leerse, y éste es el que avisa si una etapa de cierre se mudó de
 * pipeline (lo único que de verdad rompería el cierre de proyectos). El id no lo puede
 * cambiar nadie desde la UI de HubSpot; el nombre sí.
 */
const ETAPAS_DE_CIERRE_ESPERADAS: Record<string, { pipelineId: string; stageId: string }> =
  Object.fromEntries(
    PROJECT_PIPELINES.flatMap((p) =>
      p.closedStageIds.map((stageId, i) => [
        p.closedStageIds.length > 1 ? `${p.label} [${i + 1}]` : p.label,
        { pipelineId: p.hubspotPipelineId, stageId },
      ]),
    ),
  );

const PIPELINE_CS_CONOCIDO = "826270797";

// ── Token del sistema (mismo patrón que inspect-hubspot-projects.ts) ──────────
async function systemToken(): Promise<string> {
  const acc = await prisma.hubspotAccount.findFirst({ where: { isSystem: true } });
  if (!acc) throw new Error("No hay cuenta HubSpot del sistema");
  if (new Date(acc.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) return acc.accessToken;
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: acc.refreshToken,
    }),
  });
  if (!res.ok) throw new Error("refresh falló: " + (await res.text()));
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  await prisma.hubspotAccount.update({
    where: { id: acc.id },
    data: {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    },
  });
  return j.access_token;
}

/**
 * La respuesta de HubSpot, sin `any`. Un objeto de claves desconocidas describe la forma
 * real —no sabemos qué manda el portal— y a diferencia de `any` obliga a pasar cada valor
 * por `str()` o `leerLista()` antes de usarlo, que es exactamente lo que hay que hacer con
 * datos que vienen de afuera.
 */
type JsonHubspot = Record<string, unknown>;

/** Un valor desconocido → string legible. Nunca "[object Object]" ni "undefined". */
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Un valor desconocido → objeto indexable. Lo que no es objeto es un objeto vacío. */
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Un valor desconocido → lista de objetos. Lo que no es lista es una lista vacía. */
function leerLista(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "object" && x !== null) as Array<Record<string, unknown>>) : [];
}

async function getJson(token: string, path: string): Promise<{ status: number; body: JsonHubspot }> {
  const r = await fetch("https://api.hubapi.com" + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: obj(await r.json().catch(() => null)) };
}

/**
 * LA REGLA DE HOY, copiada literal de lib/hubspot/sync-projects.ts (el `continue` de
 * "terminados" y el veredicto de verifyProjectInHubspot, que son la misma condición
 * escrita dos veces). Si allá cambia, acá miente — por eso está anotada.
 */
function cerradoHoy(rawStatus: string): boolean {
  const raw = rawStatus.toLowerCase().trim();
  if (!raw) return false;
  return (
    raw === "completed" ||
    raw === "cancelled" ||
    raw.includes("completado") ||
    raw.includes("cancelado") ||
    raw.includes("cerrado")
  );
}

interface Etapa {
  id: string;
  label: string;
}
interface Pipeline {
  id: string;
  label: string;
  stages: Etapa[];
}

async function main() {
  const token = await systemToken();

  // Resolver el slug del objeto Proyectos una sola vez.
  let slug = "";
  for (const cand of ["0-970", "projects", "PROJECT"]) {
    const r = await getJson(token, `/crm/v3/pipelines/${cand}`);
    if (r.status === 200) {
      slug = cand;
      break;
    }
  }
  if (!slug) {
    console.log("⛔ No se pudo resolver el objeto Proyectos por ningún slug. Parar.");
    return;
  }
  console.log(`Objeto Proyectos: slug "${slug}"\n`);

  // ── PASO 1 · pipelines + etapas ────────────────────────────────────────────
  console.log("═══ PASO 1 · PIPELINES DEL OBJETO PROYECTOS ═══\n");
  const pipesRes = await getJson(token, `/crm/v3/pipelines/${slug}`);
  if (pipesRes.status !== 200) {
    console.log(`⛔ /crm/v3/pipelines/${slug} → HTTP ${pipesRes.status}. Parar.`);
    return;
  }
  const pipelines: Pipeline[] = leerLista(pipesRes.body?.results).map((p) => ({
    id: str(p.id),
    label: str(p.label),
    stages: leerLista(p.stages).map((s) => ({ id: str(s.id), label: str(s.label) })),
  }));

  for (const p of pipelines) {
    const esCS = p.id === PIPELINE_CS_CONOCIDO ? "   ← el CS conocido" : "";
    console.log(`pipeline ${p.id}  "${p.label}"${esCS}`);
    for (const st of p.stages) {
      const cierre = Object.entries(ETAPAS_DE_CIERRE_ESPERADAS).find(([, v]) => v.stageId === st.id);
      console.log(`    stage ${st.id}  "${st.label}"${cierre ? `   ← etapa de CIERRE de "${cierre[0]}"` : ""}`);
    }
    console.log("");
  }

  // ── EL GATE ────────────────────────────────────────────────────────────────
  console.log("═══ GATE · cada etapa de cierre dentro de SU pipeline ═══\n");
  let gateOk = true;
  const idsResueltos: Record<string, string> = {};
  for (const [nombre, esperado] of Object.entries(ETAPAS_DE_CIERRE_ESPERADAS)) {
    const dueño = pipelines.find((p) => p.stages.some((s) => s.id === esperado.stageId));
    if (!dueño) {
      console.log(`  ✗ ${nombre}: la etapa ${esperado.stageId} NO existe en ningún pipeline.`);
      gateOk = false;
      continue;
    }
    const calza = dueño.id === esperado.pipelineId;
    idsResueltos[nombre] = dueño.id;
    const etiqueta = dueño.stages.find((s) => s.id === esperado.stageId)!.label;
    console.log(
      `  ${calza ? "✓" : "✗"} ${nombre}: etapa ${esperado.stageId} ("${etiqueta}") vive en el ` +
        `pipeline ${dueño.id} "${dueño.label}"`,
    );
    if (!calza) {
      console.log(
        `      ⚠ la tabla la declara en el pipeline ${esperado.pipelineId} y el portal la tiene ` +
          `en ${dueño.id}. Una etapa de cierre que se mudó de pipeline ROMPE el cierre de ` +
          `proyectos — parar y confirmar a mano.`,
      );
      gateOk = false;
    }
  }
  console.log(
    `\n  → GATE ${gateOk ? "PASA" : "NO PASA"}. IDs resueltos: ${JSON.stringify(idsResueltos)}\n`,
  );

  // ── PASO 2 · la propiedad proyecto_interno ─────────────────────────────────
  console.log("═══ PASO 2 · propiedad `proyecto_interno` ═══\n");
  const prop = await getJson(token, `/crm/v3/properties/${slug}/proyecto_interno`);
  if (prop.status === 200) {
    console.log("  ✓ EXISTE:", {
      name: str(prop.body.name),
      label: str(prop.body.label),
      type: str(prop.body.type),
      fieldType: str(prop.body.fieldType),
    });
    if (prop.body.type !== "bool" || prop.body.fieldType !== "booleancheckbox") {
      console.log("  ⚠ NO es booleancheckbox — el parseo de A1 tiene que contemplar este tipo.");
    }
  } else {
    console.log(`  ✗ NO existe con el nombre interno 'proyecto_interno' (HTTP ${prop.status}).`);
    const todas = await getJson(token, `/crm/v3/properties/${slug}`);
    if (todas.status === 200) {
      console.log("  Candidatas booleanas del objeto Proyectos:");
      leerLista(todas.body.results)
        .filter((pr) => pr.type === "bool" || pr.fieldType === "booleancheckbox")
        .forEach((pr) => console.log(`    - ${str(pr.name)}  (${str(pr.label)})`));
    }
  }

  // ── PASO 3 · asociación proyecto ↔ proyecto ────────────────────────────────
  console.log("\n═══ PASO 3 · asociación proyecto ↔ proyecto (el hermano) ═══\n");
  const assoc = await getJson(token, `/crm/v4/associations/${slug}/${slug}/labels`);
  if (assoc.status === 200) {
    const rs = leerLista(assoc.body.results);
    if (!rs.length) console.log("  (sin etiquetas — usar la asociación por defecto)");
    for (const a of rs) {
      console.log(`  typeId ${str(a.typeId)}  label="${a.label === null || a.label === undefined ? "(default)" : str(a.label)}"  category=${str(a.category)}`);
    }
  } else {
    console.log(`  HTTP ${assoc.status}: ${JSON.stringify(assoc.body).slice(0, 250)}`);
  }

  // ── PASO 4+5 · censo, flips y vacíos ───────────────────────────────────────
  console.log("\n═══ PASO 4 · CENSO de todos los proyectos del portal ═══\n");
  const propsPedidas = [
    "hs_name",
    "nombre_del_proyecto",
    "hs_status",
    "estatus_del_proyecto",
    "hs_pipeline",
    "hs_pipeline_stage",
    "proyecto_interno",
  ].join(",");

  interface Crudo {
    id: string;
    nombre: string;
    pipeline: string | null;
    stage: string | null;
    rawStatus: string;
    interno: string | null;
  }
  const crudos: Crudo[] = [];
  let after: string | null = null;
  let paginas = 0;
  do {
    const url =
      `/crm/v3/objects/${slug}?limit=100&properties=${propsPedidas}` +
      (after ? `&after=${encodeURIComponent(after)}` : "");
    const page = await getJson(token, url);
    if (page.status !== 200) {
      console.log(`  ⚠ corte de paginación en HTTP ${page.status} tras ${crudos.length} proyectos.`);
      break;
    }
    for (const r of leerLista(page.body.results)) {
      const p = obj(r.properties);
      crudos.push({
        id: str(r.id),
        nombre: str(p.nombre_del_proyecto) || str(p.hs_name) || `(sin nombre) ${str(r.id)}`,
        pipeline: str(p.hs_pipeline).trim() || null,
        stage: str(p.hs_pipeline_stage).trim() || null,
        rawStatus: (str(p.hs_status) || str(p.estatus_del_proyecto)).trim(),
        interno: p.proyecto_interno === undefined ? null : str(p.proyecto_interno),
      });
    }
    const sigue = obj(obj(page.body.paging).next).after;
    after = sigue === undefined ? null : str(sigue);
    paginas++;
  } while (after && paginas < 60);

  const etiquetaPipeline = new Map(pipelines.map((p) => [p.id, p.label]));
  /* TODAS las etapas de cierre de cada pipeline, no una. Development y Sitios web tienen dos
     (Finalizado y Cancelado): con un solo valor por pipeline, el censo de abajo daba por
     "abierto" a todo lo que estuviera en la que se hubiera pisado. */
  const cierrePorPipeline = new Map<string, Set<string>>();
  for (const def of PROJECT_PIPELINES) {
    cierrePorPipeline.set(def.hubspotPipelineId, new Set(def.closedStageIds));
  }

  console.log(`  Total de proyectos en el portal: ${crudos.length}\n`);
  console.log("  Por pipeline:");
  const porPipeline = new Map<string, number>();
  for (const c of crudos) {
    const k = c.pipeline ?? "(sin pipeline)";
    porPipeline.set(k, (porPipeline.get(k) ?? 0) + 1);
  }
  for (const [pid, n] of [...porPipeline].sort((a, b) => b[1] - a[1])) {
    const conocido = cierrePorPipeline.has(pid) ? " ✓ en la tabla" : " ⚠ NO está en la tabla";
    console.log(`    ${pid}  "${etiquetaPipeline.get(pid) ?? "?"}"  → ${n}${conocido}`);
  }

  /* Distribución por ETAPA: es lo que da contexto al gate. Si "Finalizado" acumula
     una porción grande, la regla nueva no está descubriendo un dato oculto — está
     descubriendo que la etapa se usa distinto de lo que el plan supone. */
  const etiquetaEtapa = new Map<string, string>();
  for (const p of pipelines) for (const s of p.stages) etiquetaEtapa.set(`${p.id}:${s.id}`, s.label);
  console.log("\n  Por etapa (solo pipelines de la tabla):");
  const porEtapa = new Map<string, number>();
  for (const c of crudos) {
    if (!c.pipeline || !cierrePorPipeline.has(c.pipeline)) continue;
    const k = `${c.pipeline}:${c.stage ?? "(sin etapa)"}`;
    porEtapa.set(k, (porEtapa.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...porEtapa].sort((a, b) => b[1] - a[1])) {
    const [pid] = k.split(":");
    console.log(`    ${(etiquetaEtapa.get(k) ?? "(sin etapa)").padEnd(26)} ${String(n).padStart(3)}   [${etiquetaPipeline.get(pid)}]`);
  }

  // ── PASO 5 · `proyecto_interno` vacío (decide NOT NULL vs nullable) ────────
  const vacios = crudos.filter((c) => c.interno === null || c.interno === "").length;
  const marcados = crudos.filter((c) => c.interno === "true").length;
  console.log(`\n═══ PASO 5 · \`proyecto_interno\` ═══\n`);
  console.log(`  marcados (true): ${marcados}`);
  console.log(`  en false explícito: ${crudos.length - vacios - marcados}`);
  console.log(`  VACÍOS (nunca tocados): ${vacios} de ${crudos.length}`);
  console.log(
    vacios > 0
      ? `  → Un checkbox sin marcar en HubSpot llega vacío, no "false". Si la columna nace\n` +
          `    NOT NULL DEFAULT false, esos ${vacios} quedan indistinguibles de un "no" deliberado.\n` +
          `    Es aceptable SOLO porque el default de negocio también es "no interno".`
      : `  → Todos tienen valor explícito: NOT NULL DEFAULT false no pierde nada.`,
  );

  // ── LOS FLIPS · el gate humano de A2 ───────────────────────────────────────
  console.log("\n═══ PASO 4b · FLIPS (regla de hoy vs. regla nueva) ═══\n");
  const enNexus = await prisma.project.findMany({
    where: { hubspotServiceId: { not: null } },
    select: {
      id: true,
      name: true,
      status: true,
      hubspotServiceId: true,
      client: { select: { name: true } },
    },
  });
  const nexusPorHsId = new Map(enNexus.map((p) => [p.hubspotServiceId!, p]));

  const flips: Array<{
    c: Crudo;
    hoy: boolean;
    nuevo: boolean;
    enNexus: (typeof enNexus)[number] | undefined;
  }> = [];
  let sinCambio = 0;
  let fueraDeTabla = 0;

  for (const c of crudos) {
    const etapasDeCierre = c.pipeline ? cierrePorPipeline.get(c.pipeline) : undefined;
    if (!etapasDeCierre) {
      fueraDeTabla++;
      continue; // pipeline desconocido → la regla nueva ES la de hoy, no puede haber flip
    }
    const hoy = cerradoHoy(c.rawStatus);
    // Cualquiera de las etapas terminales cierra — igual que `decidirCierre`.
    const nuevo = !!c.stage && etapasDeCierre.has(c.stage);
    if (hoy === nuevo) {
      sinCambio++;
      continue;
    }
    flips.push({ c, hoy, nuevo, enNexus: nexusPorHsId.get(c.id) });
  }

  console.log(`  Sin cambio: ${sinCambio}   ·   Pipeline fuera de la tabla (cae a la regla de hoy): ${fueraDeTabla}`);
  console.log(`  FLIPS: ${flips.length}\n`);

  const aCerrar = flips.filter((f) => !f.hoy && f.nuevo);
  const aAbrir = flips.filter((f) => f.hoy && !f.nuevo);

  console.log(`  ── ${aCerrar.length} pasarían de ABIERTO a CERRADO (se ocultarían en Nexus) ──`);
  console.log(`     Todos están parados en la etapa de cierre de su pipeline, con un estado`);
  console.log(`     crudo que dice otra cosa. La pregunta del gate es cuál de los dos miente.\n`);
  for (const f of aCerrar) {
    const n = f.enNexus;
    const etapa = etiquetaEtapa.get(`${f.c.pipeline}:${f.c.stage}`) ?? f.c.stage;
    console.log(
      `    ${f.c.id}  "${f.c.nombre}"\n` +
        `        Nexus: ${n ? `${n.client.name} · ${n.status}` : "no está en Nexus"}` +
        `   ·   etapa: "${etapa}"   ·   estado crudo: "${f.c.rawStatus || "(vacío)"}"`,
    );
  }

  console.log(`\n  ── ${aAbrir.length} pasarían de CERRADO a ABIERTO ──`);
  console.log(
    `     ⚠ OJO: hoy la rama de update escribe status:"active" siempre. Si uno de estos\n` +
      `     ya está inactive en Nexus, el sync lo RESUCITARÍA. A2 tiene que impedirlo:\n` +
      `     el cierre es de una sola vía.`,
  );
  for (const f of aAbrir) {
    const n = f.enNexus;
    const peligro = n && n.status !== "active" ? "  ← RESUCITARÍA" : "";
    console.log(
      `    ${f.c.id}  "${f.c.nombre}"  [${n ? `${n.client.name} · ${n.status}` : "no está en Nexus"}]` +
        `  estado="${f.c.rawStatus}"  etapa=${f.c.stage ?? "(ninguna)"}${peligro}`,
    );
  }

  const resucitarian = aAbrir.filter((f) => f.enNexus && f.enNexus.status !== "active").length;
  console.log(
    `\n  → RESUMEN PARA EL GATE: ${aCerrar.length} se ocultan, ${aAbrir.length} se reabren ` +
      `(${resucitarian} de ellos resucitarían si A2 no lo impide).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(close);
