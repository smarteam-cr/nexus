/**
 * scripts/inspect-project-associations.ts  (SOLO LECTURA — Tanda C, paso C0)
 *
 * Los dos datos que la Tanda C necesita antes de que Nexus cree un proyecto en HubSpot, y
 * que el repo NO tiene escritos. No escribe nada, ni en Nexus ni en HubSpot.
 *
 *   1. ¿El token del sistema puede CREAR proyectos? (`crm.objects.projects.write`). Sin eso,
 *      el botón único le devuelve error a las tres áreas y C10 —cerrar las puertas viejas—
 *      dejaría a Nexus sin NINGUNA forma de dar de alta un proyecto.
 *   2. Los `associationTypeId` con los que se une un proyecto (0-970) a su EMPRESA, a su
 *      TRATO y a su HERMANO.
 *
 * ── POR QUÉ HACEN FALTA LOS typeId, SI EL SYNC YA LEE HERMANOS SIN ELLOS ─────
 * Son dos operaciones distintas. LEER no necesita el typeId: `leerProyectosAsociados`
 * (lib/hubspot/sync-projects.ts) hace un batch/read y mapea `to[].toObjectId` sin mirar la
 * etiqueta. CREAR sí: el bloque `associations` inline del POST exige el typeId, y uno
 * equivocado hace que HubSpot rechace la creación o que cree una asociación de OTRA etiqueta.
 * En ese segundo caso el desarrollo queda sin colgar de su implementación —y eso es
 * exactamente lo que dice "no me factures aparte: cobra el hermano"—, así que el proyecto
 * entra a Cobranza por su cuenta. Sin error y sin que nadie lo note.
 *
 * El de hermano (proyecto↔proyecto) ya está confirmado en 1254 por
 * `scripts/inspect-project-pipelines.ts`; este script lo RE-confirma en la misma corrida para
 * que las tres entradas de la tabla congelada tengan una sola procedencia y una sola fecha.
 *
 * ── EL GATE ──────────────────────────────────────────────────────────────────
 * PASA si (a) el token tiene el scope de escritura y (b) las tres asociaciones existen con
 * una etiqueta por DEFECTO (`HUBSPOT_DEFINED`). Si no pasa, la tabla no se transcribe: se
 * arregla el permiso primero.
 *
 * Uso: npx tsx scripts/inspect-project-associations.ts
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";

// Pool ACOTADO (max: 2). El pooler de Supabase da ~15 slots compartidos entre prod, las dos
// PCs de dev y cualquier script suelto — ver scripts/lib/db.ts.
const { prisma, close } = createScriptDb();

const OBJETO_PROYECTOS = "0-970";
const SCOPE_REQUERIDO = "crm.objects.projects.write";

/** Las tres asociaciones que el alta necesita, con para qué sirve cada una. */
const NECESARIAS: Array<{ hacia: string; rotulo: string; paraQue: string }> = [
  { hacia: "companies", rotulo: "empresa", paraQue: "sin esto el record es huérfano: el espejo lo descubre por las asociaciones de la empresa, así que un proyecto sin empresa NO vuelve nunca a Nexus" },
  { hacia: "deals", rotulo: "trato", paraQue: "el trato ganado es el alcance vendido; el handoff lo lee de ahí" },
  { hacia: OBJETO_PROYECTOS, rotulo: "hermano", paraQue: "un desarrollo colgado de una implementación NO se factura aparte: cobra el hermano" },
];

// ── Token del sistema (mismo patrón que inspect-project-pipelines.ts) ─────────
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

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

async function get(token: string, path: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

interface Etiqueta {
  typeId: number;
  /** Vacío = la asociación POR DEFECTO. Ver `esLaPorDefecto`. */
  label: string;
  category: string;
}

/**
 * Cuál de las etiquetas es la que sirve para el bloque `associations` inline del POST.
 *
 * ⚠ NO alcanza con `category === "HUBSPOT_DEFINED"`, y esto casi se cuela: hacia `deals` el
 * portal devuelve DOS definidas por HubSpot —1383 "Deal Plan" y 1238 sin etiqueta— y "Deal
 * Plan" viene PRIMERA. Tomar la primera definida elegía 1383, que es una etiqueta con nombre
 * propio, no la relación por defecto: el trato quedaría colgado del proyecto bajo otro
 * rótulo. La por defecto es la que NO tiene etiqueta —ese vacío es el dato—, y es la misma
 * que resuelve el endpoint `/associations/default/…` que ya usa `handoff-sync.ts`.
 */
const esLaPorDefecto = (e: { label: string; category: string }) =>
  e.category === "HUBSPOT_DEFINED" && !e.label;

/** Las etiquetas de asociación de 0-970 hacia `hacia`. Devuelve `null` si no se pudo leer. */
async function leerEtiquetas(token: string, hacia: string): Promise<Etiqueta[] | null> {
  const r = await get(token, `/crm/v4/associations/${OBJETO_PROYECTOS}/${hacia}/labels`);
  if (!r.ok) {
    console.log(`   ⚠ no se pudo leer (HTTP ${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
    return null;
  }
  const data = r.json as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((e) => ({
    typeId: Number(e.typeId),
    // Una asociación por defecto NO trae label (viene null): ese vacío ES el dato, así que se
    // conserva vacío y el rótulo bonito se arma al imprimir. Rellenarlo acá rompía
    // `esLaPorDefecto`.
    label: str(e.label),
    category: str(e.category),
  }));
}

async function main() {
  const token = await systemToken();

  console.log("═".repeat(78));
  console.log("C0 · PREFLIGHT DEL ALTA ÚNICA — solo lectura");
  console.log("═".repeat(78));

  // ── 1. Los scopes del token ────────────────────────────────────────────────
  console.log("\n1. PERMISOS DEL TOKEN DEL SISTEMA\n");
  const info = await get(token, "/oauth/v1/access-tokens/" + token);
  const scopes = ((info.json as { scopes?: string[] })?.scopes ?? []).slice().sort();
  const deProyectos = scopes.filter((s) => s.includes("projects"));
  console.log(`   scopes totales: ${scopes.length}`);
  console.log(`   sobre proyectos: ${deProyectos.length ? deProyectos.join(" · ") : "(ninguno)"}`);
  const puedeEscribir = scopes.includes(SCOPE_REQUERIDO);
  console.log(`   ${puedeEscribir ? "✅" : "❌"} ${SCOPE_REQUERIDO}`);

  // ── 2. Las etiquetas de asociación ─────────────────────────────────────────
  console.log("\n2. ASOCIACIONES DEL OBJETO PROYECTOS (0-970)\n");
  const resueltas: Array<{ rotulo: string; hacia: string; typeId: number; category: string; label: string }> = [];
  let faltantes = 0;

  for (const n of NECESARIAS) {
    console.log(`   ${n.rotulo.toUpperCase()}  (0-970 → ${n.hacia})`);
    const etiquetas = await leerEtiquetas(token, n.hacia);
    if (etiquetas === null) {
      faltantes++;
      console.log("");
      continue;
    }
    for (const e of etiquetas) {
      console.log(
        `      typeId=${e.typeId}  category=${e.category}  ${e.label || "(sin etiqueta — la de por defecto)"}`,
      );
    }
    const candidatas = etiquetas.filter(esLaPorDefecto);
    // Más de una sin etiqueta sería ambiguo: elegir "la primera" es justo el error que este
    // filtro vino a evitar, y acá no hay forma de saber cuál quiso el portal.
    if (candidatas.length > 1) {
      faltantes++;
      console.log(`      ❌ ${candidatas.length} asociaciones sin etiqueta — ambiguo, no se transcribe`);
      console.log("");
      continue;
    }
    const porDefecto = candidatas[0];
    if (!porDefecto) {
      faltantes++;
      console.log(`      ❌ sin asociación por defecto (HUBSPOT_DEFINED sin etiqueta) — el POST inline no puede armarse`);
    } else {
      resueltas.push({ rotulo: n.rotulo, hacia: n.hacia, ...porDefecto });
      console.log(`      → para el alta: typeId ${porDefecto.typeId}`);
    }
    console.log(`      ${n.paraQue}`);
    console.log("");
  }

  // ── 3. El gate ─────────────────────────────────────────────────────────────
  console.log("─".repeat(78));
  const pasa = puedeEscribir && faltantes === 0 && resueltas.length === NECESARIAS.length;
  console.log(pasa ? "✅ PASA — se puede transcribir la tabla congelada" : "❌ NO PASA");
  if (!puedeEscribir) {
    console.log(`   · falta el scope ${SCOPE_REQUERIDO}: hay que re-autorizar la app en HubSpot`);
  }
  if (faltantes > 0) {
    console.log(`   · ${faltantes} asociación(es) sin resolver`);
  }
  if (pasa) {
    console.log("\n   Para transcribir a lib/hubspot/asociaciones-proyecto.ts:\n");
    for (const r of resueltas) {
      console.log(`      ${r.rotulo.padEnd(8)} → typeId ${r.typeId}  (${r.category})`);
    }
    console.log(`\n   Procedencia: este script, ${new Date().toISOString()}`);
  }
  console.log("─".repeat(78));
}

main()
  .catch((e) => {
    console.error("ERROR:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(close);
