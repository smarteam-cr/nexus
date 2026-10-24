/**
 * scripts/auditar-analisis-de-preventas.ts — ¿cada sesión de cada preventa tiene su «Análisis»? SOLO LEE.
 *
 * Elías, 2026-10-08, tras CreditForce: la Sesión 1 no mostraba nada porque el agente leyó la invitación de
 * una reunión grabada con HubSpot. Este reporte recorre las preventas vivas y dice, sesión por sesión, qué
 * muestra la pestaña «Análisis» y por qué:
 *   · con análisis (y si el análisis dice que la reunión no tuvo conversación);
 *   · sin leer · leída antes del rediseño, sin resumen · sin conversación (pregunta qué pasó) · sin reunión.
 * Con `--hubspot` mira además las reuniones grabadas en HubSpot de cada empresa (su resumen de IA) y avisa las
 * que la preventa no tiene o leyó sin la grabación. HubSpot: solo lectura, con el token del sistema SI TODAVÍA
 * ES VÁLIDO (no lo renueva).
 *
 * Uso (En tu PC):
 *   npx tsx scripts/auditar-analisis-de-preventas.ts
 *   npx tsx scripts/auditar-analisis-de-preventas.ts --hubspot
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { leerContenido, leerPropuesta } from "@/lib/exploraciones/esquemas";
import { reunionesDeLaExploracion } from "@/lib/exploraciones/fuentes";
import { opcionesDeLasPestanas, pestanasDeSesiones, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { cuentaEnLaPreventa, DIAS_ANTES_DEL_ALTA, mismaReunion, reunionQueNoOcurrio, type CorteDeLaPreventa } from "@/lib/exploraciones/lectura";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import { pedirConToken, tokenDeCuenta } from "@/lib/hubspot/client";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { claveDeLaReunion } from "@/lib/exploraciones/contenido";

const SIN_CONVERSACION = /invitaci[oó]n|no contiene conversaci[oó]n|sin conversaci[oó]n|no hubo conversaci[oó]n|casi no tuvo conversaci[oó]n/i;

type Estado = "con-analisis" | "analisis-sin-conversacion" | "sin-leer" | "leida-sin-resumen" | "sin-conversacion" | "respondida" | "sin-reunion" | "futura";

const ROTULO: Record<Estado, string> = {
  "con-analisis": "✓ con análisis",
  "analisis-sin-conversacion": "⚠ con análisis, pero dice que no hubo conversación",
  "sin-leer": "⚠ sin leer",
  "leida-sin-resumen": "⚠ leída antes del rediseño: sin resumen",
  "sin-conversacion": "· sin conversación: pregunta qué pasó",
  respondida: "· sin conversación, ya dijeron qué pasó",
  "sin-reunion": "· sin reunión ligada",
  futura: "· todavía no pasa",
};

function estadoDe(p: PestanaDeSesion, lecturas: ReturnType<typeof leerPropuesta>["lecturas"], hoy: string): { estado: Estado; resumen?: string } {
  if (p.fecha && p.fecha.slice(0, 10) > hoy) return { estado: "futura" };
  const r = p.reunion;
  const lectura = r ? (lecturas[claveDeLaReunion(r)] ?? null) : null;
  if (p.sesion?.resultado) return { estado: "respondida" };
  if (!r) return { estado: "sin-reunion" };
  if (r.corta && !lectura) return { estado: "sin-conversacion" };
  if (lectura) return { estado: SIN_CONVERSACION.test(lectura.resumen) ? "analisis-sin-conversacion" : "con-analisis", resumen: lectura.resumen };
  return { estado: r.leida ? "leida-sin-resumen" : "sin-leer" };
}

/**
 * El correo de cada usuario de HubSpot (id → correo), activos y archivados. Solo lectura.
 *
 * Los pedidos de este script van con `pedirConToken` (el transporte, con el token suelto): espera ante un 429 pero NO
 * renueva ante un 401, porque renovar escribe el token nuevo en la base y este reporte solo lee.
 */
async function correosDeLosUsuarios(token: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const archivados of [false, true]) {
    const r = await pedirConToken(token, { method: "GET", path: `/crm/v3/owners?limit=500&archived=${archivados}` });
    if (!r.ok) continue;
    const j = (await r.json()) as { results?: { id?: string | number; email?: string | null }[] };
    for (const o of j.results ?? []) if (o.id != null && o.email) mapa.set(String(o.id), o.email.toLowerCase());
  }
  return mapa;
}

/** Las reuniones grabadas en HubSpot de una empresa (solo lectura, con el token vigente; null si no se pudo). */
async function grabadasEnHubspot(
  token: string,
  companyId: string,
  correoDe: Map<string, string>,
): Promise<{ id: string; titulo: string; inicio: string; resumen: number; transcripcion: boolean; internos: string[] }[] | null> {
  const get = async (path: string, body?: unknown) => {
    const r = await pedirConToken(token, { method: body ? "POST" : "GET", path, ...(body ? { body } : {}) });
    return r.ok ? ((await r.json()) as unknown) : null;
  };
  const v1 = (await get(`/engagements/v1/engagements/associated/company/${companyId}/paged?limit=100`)) as {
    results?: { engagement?: { id?: number; type?: string; timestamp?: number; ownerId?: number | string | null }; associations?: { ownerIds?: (number | string)[] }; metadata?: Record<string, unknown> }[];
  } | null;
  if (!v1) return null;
  const ahora = Date.now();
  const reuniones = (v1.results ?? [])
    .filter((e) => e.engagement?.type === "MEETING")
    .map((e) => ({
      id: String(e.engagement!.id),
      titulo: String(e.metadata?.title ?? "Reunión"),
      ts: Number(e.metadata?.startTime ?? e.engagement?.timestamp ?? 0),
      resultado: typeof e.metadata?.meetingOutcome === "string" ? e.metadata.meetingOutcome.toLowerCase() : undefined,
      usuarios: [e.engagement?.ownerId, ...(e.associations?.ownerIds ?? [])].filter((x) => x != null).map(String),
    }))
    .filter((r) => r.ts && r.ts <= ahora);
  if (!reuniones.length) return [];
  const v3 = (await get("/crm/v3/objects/meetings/batch/read", {
    properties: ["hs_meeting_summary", "hs_has_meeting_transcript", "hs_meeting_outcome", "hubspot_owner_id", "hs_attendee_owner_ids"],
    inputs: reuniones.map((r) => ({ id: r.id })),
  })) as { results?: { id: string; properties?: Record<string, string | null> }[] } | null;
  const props = new Map((v3?.results ?? []).map((x) => [x.id, x.properties ?? {}]));
  return reuniones
    .map((r) => {
      const p = props.get(r.id) ?? {};
      const usuarios = [...r.usuarios, p.hubspot_owner_id ?? "", ...(p.hs_attendee_owner_ids ?? "").split(";")].map((x) => x.trim()).filter(Boolean);
      return {
        internos: [...new Set(usuarios.flatMap((u) => correoDe.get(u) ?? []))],
        id: r.id,
        titulo: r.titulo,
        inicio: new Date(r.ts).toISOString(),
        resumen: (p.hs_meeting_summary ?? "").length,
        transcripcion: p.hs_has_meeting_transcript === "true",
        noOcurrio: reunionQueNoOcurrio(p.hs_meeting_outcome?.toLowerCase() === "no_show" ? "no_se_presento" : p.hs_meeting_outcome?.toLowerCase()),
      };
    })
    .filter((r) => !r.noOcurrio && (r.resumen > 0 || r.transcripcion))
    .map((r) => ({ id: r.id, titulo: r.titulo, inicio: r.inicio, resumen: r.resumen, transcripcion: r.transcripcion, internos: r.internos }));
}

async function main() {
  const conHubspot = process.argv.includes("--hubspot");
  const hoy = hoyEnCostaRica();
  let token: string | null = null;
  if (conHubspot) {
    // El token como está, sin renovarlo: si le quedan menos de dos minutos, se sigue sin HubSpot.
    const cuenta = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { accessToken: true, expiresAt: true } });
    if (cuenta && cuenta.expiresAt.getTime() - Date.now() > 120_000) token = tokenDeCuenta(cuenta);
    else console.log("⚠ El token de HubSpot del sistema venció: no se renueva. Va sin HubSpot.\n");
  }

  const ventas = await salesPresenceEmails();
  const correoDe = token ? await correosDeLosUsuarios(token) : new Map<string, string>();
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { archivadaEn: null, projectId: null },
    select: { id: true, clientId: true, createdAt: true, propuesta: true, contenido: true, test: true, client: { select: { name: true, hubspotCompanyId: true, kind: true } } },
    orderBy: { createdAt: "asc" },
  });

  const totales = new Map<Estado, number>();
  for (const f of filas) {
    const propuesta = leerPropuesta(f.propuesta);
    const contenido = leerContenido(f.contenido);
    // Las mismas sesiones que ve la pantalla (pantalla.ts): con las sesiones, lo sacado y, en un prospecto, las que entran solas.
    const reuniones = await reunionesDeLaExploracion({
      exploracionId: f.id,
      clientId: f.clientId,
      projectId: null,
      creadaEn: f.createdAt,
      propuesta,
      leido: leerLoLeido(f.test),
      sesiones: contenido.sesiones,
      fuera: contenido.fuera,
      elegidas: contenido.reunionesElegidas,
    });
    const pestanas = pestanasDeSesiones(contenido.sesiones, reuniones, hoy, opcionesDeLasPestanas(f.client.kind === "PROSPECTO", contenido.fuera));
    console.log(`■ ${f.client.name} · ${f.id} · ${pestanas.length} sesión(es)`);
    for (const p of pestanas) {
      const { estado, resumen } = estadoDe(p, propuesta.lecturas, hoy);
      totales.set(estado, (totales.get(estado) ?? 0) + 1);
      const r = p.reunion;
      const que = r ? `${r.fecha.slice(0, 10)} · ${r.origen} · ${r.titulo}` : p.fecha ? `${p.fecha.slice(0, 10)} · sin reunión` : "sin fecha";
      console.log(`  ${p.noSeHizo ? "No se hizo" : `Sesión ${p.numero}`} (${que}): ${ROTULO[estado]}${estado === "analisis-sin-conversacion" && resumen ? ` — «${resumen.slice(0, 110)}…»` : ""}`);
    }
    if (token && f.client.hubspotCompanyId) {
      const grabadas = await grabadasEnHubspot(token, f.client.hubspotCompanyId, correoDe);
      if (grabadas === null) console.log("  HubSpot: no se pudo leer");
      // La misma regla de la preventa (lectura.ts › cuentaEnLaPreventa): de antes del corte, solo en un prospecto y con Ventas.
      const corte: CorteDeLaPreventa = { desde: f.createdAt.getTime() - DIAS_ANTES_DEL_ALTA * 86_400_000, esProspecto: f.client.kind === "PROSPECTO", ventas };
      for (const g of grabadas ?? []) {
        if (!cuentaEnLaPreventa(Date.parse(g.inicio), g.internos, corte)) continue;
        const enLaPreventa = reuniones.find((r) => (r.origen === "hubspot" && r.id === g.id) || mismaReunion(r.fecha, g.inicio));
        const lectura = enLaPreventa ? propuesta.lecturas[claveDeLaReunion(enLaPreventa)] : undefined;
        const aviso = !enLaPreventa
          ? "⚠ no está en la preventa"
          : enLaPreventa.origen === "meet" && enLaPreventa.corta
            ? g.resumen < 400
              ? "· HubSpot tampoco tiene conversación"
              : "⚠ la preventa ve la copia de Meet sin conversación"
            : lectura && SIN_CONVERSACION.test(lectura.resumen)
              ? "⚠ su análisis se hizo sin la grabación"
              : "✓";
        console.log(`  HubSpot grabó «${g.titulo}» (${g.inicio.slice(0, 10)}, resumen de ${g.resumen} letras${g.transcripcion ? ", con transcripción" : ""}): ${aviso}`);
      }
    }
  }
  console.log("\nEn total:");
  for (const [e, n] of totales) console.log(`  ${ROTULO[e]}: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
