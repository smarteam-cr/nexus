/**
 * scripts/medir-transcripciones-faltantes.ts — CUÁNTAS reuniones de Meet no tienen transcripción, y POR QUÉ. SOLO LEE.
 *
 * Ficha C del roadmap («Que no falte ninguna reunión», 2026-10-17). Cada reunión sin transcripción cae en un motivo de
 * lib/google/por-que-falta.ts, que dice de quién es el arreglo: de Nexus (el rescate, o se arregla solo), de Google
 * Workspace (no se tomaron notas, no se transcribió, la organizó alguien de afuera) o de una persona. Mira por separado
 * las reuniones con clientes y prospectos y las de Desarrollo (alguien con el rol DEV invitado), que son las dos que
 * Elías pidió que no falten.
 *
 *   npx tsx scripts/medir-transcripciones-faltantes.ts              # los últimos 30 días
 *   npx tsx scripts/medir-transcripciones-faltantes.ts --dias 90
 *
 * Al final imprime el INDICADOR 4 del roadmap (T1, 2026-10-24): de las reuniones con un cliente o un prospecto de los
 * últimos 14 días FIJOS (sin importar --dias), ya ocurridas (6 horas de margen), que Nexus ya trató de leer y que no son
 * de puertas adentro (el criterio de «Reuniones sin grabar» de Uso de Nexus), cuántas dejaron texto: transcripción o
 * solo notas de Gemini, con el predicado único (lib/sessions/tiene-texto.ts). La meta es el 90 %.
 *
 * La conexión nace de solo lectura (`default_transaction_read_only`): no escribe nada, no llama a Google ni a la IA.
 */
import "dotenv/config";
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
import { createScriptPool } from "./lib/db";
import { MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import { DE_QUIEN_ES, porQueFalta, type MotivoDeLaFalta } from "@/lib/google/por-que-falta";
import { esDeNuestroEquipo } from "@/lib/sessions/dominio-propio";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { claseDesdeLosLargos } from "@/lib/sessions/tiene-texto";

/** El indicador 4 del roadmap se mide siempre sobre 14 días (los de «Reuniones sin grabar» de Uso de Nexus). */
const DIAS_DEL_INDICADOR = 14;

const DIAS = (() => {
  const i = process.argv.indexOf("--dias");
  const n = i >= 0 ? Number(process.argv[i + 1]) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

interface Fila {
  id: string;
  title: string;
  date: Date;
  duration: number | null;
  enrichedAt: Date | null;
  enrichAttempts: number;
  enrichError: string | null;
  googleDocId: string | null;
  organizerEmail: string | null;
  participants: string[];
  largo: number;
  notas: string | null;
  kind: string | null;
  cliente: string | null;
}

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const corto = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function main() {
  const { pool, close } = createScriptPool();
  try {
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - DIAS * 86_400_000);
    const filas = (
      await pool.query<Fila>(
        `SELECT s.id, s.title, s.date, s.duration, s."enrichedAt", s."enrichAttempts", s."enrichError", s."googleDocId",
                s."organizerEmail", s.participants, coalesce(length(s.transcript), 0)::int AS largo,
                s.summary->>'overview' AS notas, c.kind::text AS kind, c.name AS cliente
           FROM "FirefliesSession" s
           LEFT JOIN "Client" c ON c.id = coalesce(s."resolvedClientId", s."manualClientId")
          WHERE s.source = 'google_meet' AND s.date >= $1 AND s.date <= $2`,
        [desde, ahora],
      )
    ).rows;
    const equipo = (await pool.query<{ email: string; name: string; rol: string }>(`SELECT lower(email) AS email, name, "roleEnum"::text AS rol FROM "TeamMember"`)).rows;
    const nombre = new Map(equipo.map((m) => [m.email, m.name]));
    const devs = new Set(equipo.filter((m) => m.rol === "DEV").map((m) => m.email));

    const conCliente = (f: Fila) => f.kind === "CLIENTE" || f.kind === "PROSPECTO";
    const deDesarrollo = (f: Fila) => [f.organizerEmail ?? "", ...f.participants].some((e) => devs.has(e.trim().toLowerCase()));

    console.log(`Reuniones de Meet de los últimos ${DIAS} días (${fecha(desde)} a ${fecha(ahora)}): ${filas.length}\n`);
    for (const [titulo, grupo] of [
      ["Con clientes y prospectos", filas.filter(conCliente)],
      ["De Desarrollo (alguien con el rol DEV invitado)", filas.filter(deDesarrollo)],
    ] as const) {
      const sin = grupo.filter((f) => f.largo < MIN_TRANSCRIPT_CHARS);
      console.log(`══ ${titulo}: ${grupo.length} · sin transcripción ${sin.length} (${grupo.length ? Math.round((100 * sin.length) / grupo.length) : 0} %)`);
      const porMotivo = new Map<MotivoDeLaFalta, Fila[]>();
      for (const f of sin) {
        const m = porQueFalta(
          { ...f, tieneNotas: !!f.notas?.trim() },
          ahora,
        );
        porMotivo.set(m, [...(porMotivo.get(m) ?? []), f]);
      }
      for (const [m, xs] of [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const d = DE_QUIEN_ES[m];
        console.log(`   ${String(xs.length).padStart(4)}  ${m}  [${d.dueno}]  ${d.texto}`);
        for (const f of xs.slice(0, 3)) {
          console.log(`         ${fecha(f.date)} «${corto(f.title)}»${f.cliente ? ` · ${f.cliente}` : ""} · organiza ${f.organizerEmail ?? "—"}`);
        }
      }
      // Lo que es de Google Workspace, por organizador del equipo: a quién hay que prenderle las notas y la transcripción.
      const workspace = [...porMotivo.entries()].filter(([m]) => DE_QUIEN_ES[m].dueno === "google_workspace").flatMap(([, xs]) => xs);
      const porOrganizador = new Map<string, number>();
      for (const f of workspace) {
        const org = (f.organizerEmail ?? "").trim().toLowerCase();
        const clave = esDeNuestroEquipo(org) ? org : "(alguien de afuera)";
        porOrganizador.set(clave, (porOrganizador.get(clave) ?? 0) + 1);
      }
      if (porOrganizador.size) {
        console.log(`   De Google Workspace, por quién organizó:`);
        for (const [org, n] of [...porOrganizador.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
          console.log(`         ${String(n).padStart(3)}  ${nombre.get(org) ?? org}`);
        }
      }
      console.log("");
    }
    // El indicador 4: 14 días fijos, con el criterio de «Reuniones sin grabar» (Uso de Nexus) y el predicado único.
    const techo = new Date(ahora.getTime() - 6 * 3_600_000);
    const delIndicador = (
      await pool.query<Fila & { notasLargo: number }>(
        `SELECT s.id, s.date, s."enrichedAt", s."organizerEmail", s.participants, coalesce(length(btrim(s.transcript)), 0)::int AS largo,
                coalesce(length(btrim(s.summary->>'overview')), 0)::int AS "notasLargo", c.kind::text AS kind
           FROM "FirefliesSession" s
           JOIN "Client" c ON c.id = coalesce(s."resolvedClientId", s."manualClientId")
          WHERE s.source = 'google_meet' AND s.date >= $1 AND s.date <= $2 AND s."enrichedAt" IS NOT NULL`,
        [new Date(ahora.getTime() - DIAS_DEL_INDICADOR * 86_400_000), techo],
      )
    ).rows;
    const dominios = buildInternalDomainsSet((await pool.query<{ domains: string[]; kind: string }>(`SELECT domains, kind FROM "SessionCategory"`)).rows);
    const conClientes = delIndicador.filter((f) => conCliente(f) && !esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios));
    const clases = conClientes.map((f) => claseDesdeLosLargos({ transcripcion: f.largo, notas: f.notasLargo }));
    const conTranscripcion = clases.filter((c) => c === "transcripcion").length;
    const soloNotas = clases.filter((c) => c === "solo_notas").length;
    const conTexto = conTranscripcion + soloNotas;
    console.log(
      `══ Indicador 4 (últimos ${DIAS_DEL_INDICADOR} días): ${conTexto} de ${conClientes.length} reuniones con clientes dejaron texto ` +
        `(${conClientes.length ? Math.round((100 * conTexto) / conClientes.length) : 0} %; meta 90 %): ${conTranscripcion} con transcripción y ${soloNotas} solo con notas.\n`,
    );
    console.log("Solo lectura: no se escribió nada.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
