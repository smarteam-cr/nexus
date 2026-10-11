/**
 * scripts/sondeo-de-hechos.ts — EL SONDEO DE HECHOS (memoria de la cuenta, etapa 5). NO SE DESPLIEGA.
 *
 * Antes de construir la lectura de hechos (etapa 6), mide sobre reuniones REALES qué hechos salen, a dónde irían, cuántas
 * citas se descartan y cuánto cuesta cada forma de pedirlos. Usa los MISMOS módulos puros que va a usar la etapa 6
 * (lib/seguimiento/hechos: el pedido, la verificación de las citas y el texto de la reunión; y el enrutador con el
 * registro de destinos, en seco), así que lo que mide es lo que se despliega. Con los números, Elías decide la variante
 * y el modelo (docs/DECISIONS.md «Hechos, enrutador y novedades»).
 *
 * ── LAS VARIANTES ────────────────────────────────────────────────────────────────────────────
 *   A · llamada aparte, sin caché, Sonnet 4.6, en todas.
 *   B · llamada aparte con la caché compartida con la lectura, en las primeras --b: primero una llamada que solo escribe
 *       la caché (la lectura de hoy todavía no comparte el prefijo) y después la de los hechos. Se anota cuánto leyó de
 *       la caché.
 *   C · la lectura y los hechos en UNA sola llamada, en las primeras --c: se anota cuántas se cortan.
 *   Haiku · la variante B con Haiku 4.5, en las primeras --haiku (⚠ el mínimo cacheable de Haiku son 4.096 tokens).
 * Y en memoria, sin escribir: lo que hoy propone el Haiku de la ficha sobre la misma reunión, la lectura de procesos
 * guardada (los hechos de «hoy»), y la etapa sugerida y el avance que salieron de esa reunión.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Nada en la base, salvo la telemetría de `LlmCall`, que la anota el cliente único de Anthropic (lib/anthropic.ts),
 *     a nombre de quien lo corre (--por). Las reuniones se eligen con una conexión de SOLO LECTURA.
 *   · El reporte en backups/<fecha>-sondeo-de-hechos/ (gitignoreado): un .md por reunión con cada hecho, su cita y su
 *     destino, un resumen.md y un sondeo.json. ⚠ Lleva citas de reuniones de clientes: no sale de la PC.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: con los valores por defecto, unos US$3,5. Lo corre Elías desde su PC, nunca el servidor.
 *
 *   npx tsx scripts/sondeo-de-hechos.ts --por egonzalez@smarteamcr.com                 # el sondeo
 *   npx tsx scripts/sondeo-de-hechos.ts --por egonzalez@smarteamcr.com --solo-elegir   # solo la lista (no llama a Claude)
 *
 * Opciones: --max 30 (reuniones de clientes con transcripción) · --notas 0 (de clientes con solo notas) ·
 * --prospectos 0 · --dias 30 · --b 10 · --c 10 · --haiku 10 · --sin-ficha · --sesion <id> (una sola reunión).
 * Wherex queda fuera siempre (hizo churn y es el cliente de prueba de Nexus). Como mucho 3 reuniones por cliente.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { createScriptPool } from "./lib/db";
import { describirDestino } from "./lib/guard";

// El pool de la app (lo usan el chokepoint y el medidor) con tope chico: el pooler se comparte con producción (RUNBOOK #3).
process.env.DB_POOL_MAX ??= "2";

/* ── Los argumentos ──────────────────────────────────────────────────────────────────────── */

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const bandera = (nombre: string) => process.argv.includes(nombre);
const numero = (nombre: string, porDefecto: number) => {
  const v = arg(nombre);
  const n = v === null ? porDefecto : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : porDefecto;
};

const POR = (arg("--por") ?? "").trim().toLowerCase();
const OPCIONES = {
  max: numero("--max", 30),
  notas: numero("--notas", 0),
  prospectos: numero("--prospectos", 0),
  dias: numero("--dias", 30),
  b: numero("--b", 10),
  c: numero("--c", 10),
  haiku: numero("--haiku", 10),
  sinFicha: bandera("--sin-ficha"),
  soloElegir: bandera("--solo-elegir"),
  sesion: arg("--sesion"),
};

/** Unas 417 reuniones con cliente por mes (medido para el plan de la memoria de la cuenta). */
const REUNIONES_POR_MES = 417;
const POR_CLIENTE = 3;
const EXCLUIDOS_POR_NOMBRE = /wherex/i;

/* ── Lo que se guarda de cada reunión ────────────────────────────────────────────────────── */

interface Candidata {
  id: string;
  title: string;
  date: Date;
  participants: string[];
  organizerEmail: string | null;
  largoTranscripcion: number;
  largoNotas: number;
  clientId: string;
  cliente: string;
  kind: string;
  industry: string | null;
  conMinuta: boolean;
  conProcesos: boolean;
}

interface Uso {
  llamadas: number;
  entrada: number;
  salida: number;
  cacheLeida: number;
  cacheEscrita: number;
  usd: number;
}
const usoVacio = (): Uso => ({ llamadas: 0, entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, usd: 0 });

type Variante = "A" | "B" | "C" | "Haiku" | "Ficha" | "Calentamiento B" | "Calentamiento Haiku";

interface ResultadoDeVariante {
  hechos: number;
  porTipo: Record<string, number>;
  descartados: number;
  cortada: boolean;
  llamoLaHerramienta: boolean;
  /** Solo en C: si también llamó a la herramienta de la lectura. */
  llamoLaLectura?: boolean;
  usd: number;
  cacheLeida: number;
  error?: string;
}

/** Un hecho verificado, como queda en el reporte. */
interface HechoDelReporte {
  tipo: string;
  tema: string | null;
  /** «cuenta» o «P1 · Nombre del proyecto». */
  ambito: string;
  /** El P# (o «cuenta»), para cruzarlo con los proyectos. */
  ref: string;
  quien: string | null;
  hablante: string | null;
  gravedad: string | null;
  fuenteDeLaCita: string;
  frase: string;
  cita: string;
  huella: string;
  destinos: string[];
}

interface ReunionDelSondeo {
  n: number;
  sessionId: string;
  titulo: string;
  fecha: string;
  cliente: string;
  kind: string;
  fuente: string | null;
  caracteres: number;
  recortada: boolean;
  proyectos: { ref: string; id: string; nombre: string; alimentaElAvance: boolean }[];
  omitida?: string;
  hechos: HechoDelReporte[];
  descartados: Array<{ motivo: string; frase?: string; cita?: string }>;
  variantes: Partial<Record<"A" | "B" | "C" | "Haiku", ResultadoDeVariante>>;
  ficha?: { campos: { clave: string; valor: string }[]; error?: string };
  procesos?: { hechosDeHoy: number; ejemplos: string[] } | null;
  etapaYAvance: { proyecto: string; etapaDeEstaReunion: boolean; avanceDeEstaReunion: boolean; senalesDeEtapa: number; senalesDeCronograma: number }[];
}

/* ── El destino en seco ──────────────────────────────────────────────────────────────────── */

/** Lo que imprime el reporte cuando un hecho no tiene destino: queda solo en la tarjeta de la reunión. */
const SOLO_LA_TARJETA = "solo la tarjeta de la reunión";

/* ── Utilidades ──────────────────────────────────────────────────────────────────────────── */

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "reunion";
const sumar = (a: Record<string, number>, k: string, n = 1) => (a[k] = (a[k] ?? 0) + n);
const pct = (n: number, de: number) => (de ? `${((100 * n) / de).toFixed(0)} %` : "—");
const usd = (n: number) => `US$${n.toFixed(n < 1 ? 3 : 2)}`;
const una = (s: string, max = 200) => s.replace(/\s+/g, " ").trim().slice(0, max);

async function main(): Promise<number> {
  if (!POR || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(POR)) {
    console.error(
      "Falta --por <tu correo>: las llamadas a Claude quedan en la telemetría (LlmCall) a nombre de quien corre el sondeo.\n" +
        "Uso: npx tsx scripts/sondeo-de-hechos.ts --por egonzalez@smarteamcr.com   (agrega --solo-elegir para ver la lista sin llamar a Claude)",
    );
    return 1;
  }
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (las reuniones se eligen en solo lectura)\n`);

  const { pool, close } = createScriptPool();
  const db = await pool.connect();
  try {
    // ⛔ Ninguna consulta de esta conexión puede escribir.
    await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    const { rows: equipoFilas } = await db.query<{ name: string; email: string; activo: boolean }>(
      `SELECT name, lower(email) AS email, ("deactivatedAt" IS NULL) AS activo FROM "TeamMember"`,
    );
    if (!equipoFilas.some((m) => m.email === POR)) {
      console.error(`«${POR}» no es del equipo (TeamMember). --por es el correo de quien corre el sondeo.`);
      return 1;
    }
    const equipo = equipoFilas.map((m) => m.name);
    const correosActivos = equipoFilas.filter((m) => m.activo).map((m) => m.email);

    /* ── 1. Las reuniones ──────────────────────────────────────────────────────────────── */
    const { MIN_TRANSCRIPT_CHARS } = await import("@/lib/google/doc-parse");
    const { buildInternalDomainsSet } = await import("@/lib/sessions/categorize");
    const { esReunionDePuertasAdentro } = await import("@/lib/sessions/candidatas-internas");
    const { MIN_CARACTERES_PARA_LEER } = await import("@/lib/seguimiento/hechos/texto");

    const { rows: categorias } = await db.query<{ domains: string[]; kind: string }>(`SELECT domains, kind FROM "SessionCategory"`);
    const dominiosDeLaCasa = buildInternalDomainsSet(categorias);

    const { rows: crudas } = await db.query<Candidata>(
      `SELECT s.id, s.title, s.date, s.participants, s."organizerEmail",
              length(coalesce(s.transcript, ''))::int AS "largoTranscripcion",
              length(coalesce(s.summary->>'overview', ''))::int AS "largoNotas",
              c.id AS "clientId", c.name AS cliente, c.kind::text AS kind, c.industry,
              EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s.id) AS "conMinuta",
              EXISTS (SELECT 1 FROM "AgentRun" r WHERE r."agentSlug" = 'procesos-lectura' AND r.status = 'DONE' AND s.id = ANY(r."sourceSessionIds")) AS "conProcesos"
         FROM "FirefliesSession" s
         JOIN "Client" c ON c.id = COALESCE(s."resolvedClientId", s."manualClientId")
        WHERE ${OPCIONES.sesion ? "s.id = $1" : "s.date <= now() AND s.date >= now() - make_interval(days => $1::int)"}
          AND c.kind::text IN ('CLIENTE', 'PROSPECTO')
        ORDER BY s.date DESC
        LIMIT 2000`,
      [OPCIONES.sesion ?? OPCIONES.dias],
    );

    const excluidos: string[] = [];
    const puertasAdentro: string[] = [];
    const elegibles = crudas.filter((r) => {
      if (EXCLUIDOS_POR_NOMBRE.test(r.cliente)) {
        excluidos.push(`${r.cliente} · «${r.title}»`);
        return false;
      }
      if (esReunionDePuertasAdentro({ participants: r.participants, organizerEmail: r.organizerEmail }, dominiosDeLaCasa)) {
        puertasAdentro.push(`${r.cliente} · «${r.title}»`);
        return false;
      }
      return true;
    });
    const conTranscripcion = (r: Candidata) => r.largoTranscripcion >= MIN_TRANSCRIPT_CHARS;
    const conSoloNotas = (r: Candidata) => !conTranscripcion(r) && r.largoNotas >= MIN_CARACTERES_PARA_LEER;
    // Prefiere las que ya tienen la lectura de procesos y la minuta (hay contra qué comparar); después, la más reciente.
    const puntaje = (r: Candidata) => (r.conProcesos ? 2 : 0) + (r.conMinuta ? 1 : 0);
    const ordenar = (xs: Candidata[]) => [...xs].sort((a, b) => puntaje(b) - puntaje(a) || +b.date - +a.date);

    const porCliente = new Map<string, number>();
    const tomar = (xs: Candidata[], cuantas: number): Candidata[] => {
      const out: Candidata[] = [];
      for (const r of ordenar(xs)) {
        if (out.length >= cuantas) break;
        if ((porCliente.get(r.clientId) ?? 0) >= POR_CLIENTE) continue;
        porCliente.set(r.clientId, (porCliente.get(r.clientId) ?? 0) + 1);
        out.push(r);
      }
      return out;
    };
    /* `--sesion` también pasa por las dos exclusiones (Wherex y puertas adentro): una reunión elegida a mano no se salta
       la regla, solo el muestreo. Si no pasa, se dice por qué y no se llama a Claude. */
    if (OPCIONES.sesion && crudas.length && !elegibles.length) {
      const motivo = excluidos.length ? "es de Wherex (fuera del sondeo)" : "fue de puertas adentro (solo el equipo)";
      console.log(`La reunión ${OPCIONES.sesion} no se sondea: ${motivo}.`);
    }
    const elegidas: Candidata[] = OPCIONES.sesion
      ? elegibles.slice(0, 1)
      : [
          ...tomar(elegibles.filter((r) => r.kind === "CLIENTE" && conTranscripcion(r)), OPCIONES.max),
          ...tomar(elegibles.filter((r) => r.kind === "CLIENTE" && conSoloNotas(r)), OPCIONES.notas),
          ...tomar(elegibles.filter((r) => r.kind === "PROSPECTO" && (conTranscripcion(r) || conSoloNotas(r))), OPCIONES.prospectos),
        ];

    console.log(
      `Reuniones de los últimos ${OPCIONES.dias} días: ${crudas.length} de clientes y prospectos · ${excluidos.length} de Wherex (fuera) · ` +
        `${puertasAdentro.length} de puertas adentro (fuera) · elegidas: ${elegidas.length}`,
    );
    if (excluidos.length) console.log(`  Excluidas por nombre: ${[...new Set(excluidos.map((e) => e.split(" · ")[0]))].join(", ")}`);
    for (const [i, r] of elegidas.entries()) {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${r.date.toISOString().slice(0, 10)} · ${r.cliente} (${r.kind.toLowerCase()}) · «${una(r.title, 70)}» · ` +
          `${conTranscripcion(r) ? `transcripción ${r.largoTranscripcion}` : `solo notas ${r.largoNotas}`}${r.conProcesos ? " · procesos" : ""}${r.conMinuta ? " · minuta" : ""}`,
      );
    }
    if (OPCIONES.soloElegir || !elegidas.length) {
      console.log(OPCIONES.soloElegir ? "\n--solo-elegir: no se llamó a Claude." : "\nNo hay reuniones para sondear.");
      return 0;
    }

    /* ── 2. Los módulos (después de fijar el tope del pool) ─────────────────────────────── */
    const { getAnthropic } = await import("@/lib/anthropic");
    const { conContextoDeIA } = await import("@/lib/ai/contexto-de-corrida");
    const { costoDeLlamada, precioDe } = await import("@/lib/ai/precios");
    const { textoParaHechos } = await import("@/lib/seguimiento/hechos/texto-de-la-reunion");
    const hechosPedido = await import("@/lib/seguimiento/hechos/pedido");
    const { leerSalidaDeHechos, prepararParaVerificar } = await import("@/lib/seguimiento/hechos/salida");
    const { ROTULO_DEL_MOTIVO, ROTULO_DEL_TIPO, TIPOS_DE_HECHO } = await import("@/lib/seguimiento/hechos/tipos");
    // El destino en seco: el MISMO enrutador y el MISMO registro que va a usar la etapa 6 (sin escribir nada).
    const { rutear } = await import("@/lib/seguimiento/enrutador");
    const { destinoPorClave } = await import("@/lib/seguimiento/destinos");
    const { herramientaDeLaLectura, adendaDeLaHerramienta, leerSalidaDeLaLectura } = await import("@/lib/sessions/lectura-salida");
    const { TOPE_DE_TOKENS } = await import("@/lib/lecturas/reglas");
    const { loadHandoffContext } = await import("@/lib/canvas/load-canvas-context");
    const { pedidoDeFicha, leerRespuesta, MODELO_FICHA_SESION } = await import("@/lib/clients/ficha-pedido");
    const { leerFicha } = await import("@/lib/clients/ficha");
    const { fetchTranscriptContent } = await import("@/lib/sessions/transcript");
    const { leerMotivoDeEtapa } = await import("@/lib/projects/etapa-sugerida");
    const { fechaLocalDeLaReunion } = await import("@/lib/sessions/compromisos-y-alcance");
    const { prisma } = await import("@/lib/db/prisma");

    const { rows: agente } = await db.query<{ systemPrompt: string }>(`SELECT "systemPrompt" FROM "Agent" WHERE id = 'agent-post-session'`);
    const promptDeLaLectura = agente[0]?.systemPrompt ?? "";

    const usos: Record<Variante, Uso> = {
      A: usoVacio(),
      B: usoVacio(),
      C: usoVacio(),
      Haiku: usoVacio(),
      Ficha: usoVacio(),
      "Calentamiento B": usoVacio(),
      "Calentamiento Haiku": usoVacio(),
    };
    /** Cuántas reuniones corrió cada variante (para el promedio por reunión). */
    const corridas: Record<Variante, number> = { A: 0, B: 0, C: 0, Haiku: 0, Ficha: 0, "Calentamiento B": 0, "Calentamiento Haiku": 0 };

    const fecha = fechaLocalDeLaReunion(new Date());
    let carpeta = join(process.cwd(), "backups", `${fecha}-sondeo-de-hechos`);
    if (existsSync(carpeta)) carpeta = `${carpeta}-${new Date().toISOString().slice(11, 16).replace(":", "")}`;
    mkdirSync(carpeta, { recursive: true });
    console.log(`\nEl reporte va a ${carpeta}\n`);

    const escribirReunion = (x: ReunionDelSondeo) => {
      const m: string[] = [];
      m.push(`# ${x.n}. ${x.cliente} · «${x.titulo}» · ${x.fecha}`);
      m.push("");
      m.push(`Reunión ${x.sessionId} · ${x.kind.toLowerCase()} · ${x.fuente ? `texto: ${x.fuente}, ${x.caracteres} caracteres${x.recortada ? " (recortada)" : ""}` : "sin texto"}`);
      if (x.proyectos.length) m.push(`Proyectos: ${x.proyectos.map((p) => `${p.ref} ${p.nombre}${p.alimentaElAvance ? "" : " (no alimenta el avance)"}`).join(" · ")}`);
      if (x.omitida) {
        m.push("", `Omitida: ${x.omitida}.`);
      } else {
        m.push("", `## Hechos (${x.hechos.length})`);
        for (const h of x.hechos) {
          m.push(
            "",
            `- **${ROTULO_DEL_TIPO[h.tipo as keyof typeof ROTULO_DEL_TIPO] ?? h.tipo}${h.tema ? ` · ${h.tema}` : ""}${h.gravedad ? ` · ${h.gravedad}` : ""}** · ${h.ambito} · dijo: ${h.hablante ?? h.quien ?? "no se sabe"} (${h.fuenteDeLaCita})`,
            `  ${h.frase}`,
            `  > «${h.cita}»`,
            `  → ${h.destinos.join(" · ") || "sin destino"}`,
          );
        }
        if (x.descartados.length) {
          m.push("", `## Descartados (${x.descartados.length})`);
          for (const d of x.descartados) m.push(`- ${ROTULO_DEL_MOTIVO[d.motivo as keyof typeof ROTULO_DEL_MOTIVO] ?? d.motivo}: ${d.frase ?? ""}${d.cita ? ` — «${una(d.cita, 160)}»` : ""}`);
        }
        m.push("", `## Variantes`);
        for (const [v, res] of Object.entries(x.variantes)) {
          if (!res) continue;
          const tipos = Object.entries(res.porTipo).map(([t, k]) => `${t} ${k}`).join(", ");
          m.push(
            `- ${v}: ${res.error ? `✗ ${res.error}` : `${res.hechos} hechos${tipos ? ` (${tipos})` : ""} · ${res.descartados} descartados${res.cortada ? " · se cortó" : ""}${res.llamoLaHerramienta ? "" : " · no llamó a la herramienta"}${v === "C" ? ` · lectura: ${res.llamoLaLectura ? "sí" : "no"}` : ""} · ${res.cacheLeida} tokens de la caché`} · ${usd(res.usd)}`,
          );
        }
        if (x.ficha) {
          m.push("", `## La ficha hoy (Haiku sobre la reunión)`);
          if (x.ficha.error) m.push(`✗ ${x.ficha.error}`);
          else if (!x.ficha.campos.length) m.push("No propone nada.");
          for (const c of x.ficha.campos) m.push(`- ${c.clave}: ${una(c.valor, 400)}`);
        }
        if (x.procesos !== undefined) {
          m.push("", `## Procesos (la lectura guardada)`);
          m.push(x.procesos ? `${x.procesos.hechosDeHoy} hechos de «hoy».${x.procesos.ejemplos.length ? `\n${x.procesos.ejemplos.map((e) => `- ${e}`).join("\n")}` : ""}` : "La lectura guardada no se pudo leer.");
        }
        if (x.etapaYAvance.length) {
          m.push("", `## Etapa y avance`);
          for (const e of x.etapaYAvance) {
            m.push(
              `- ${e.proyecto}: etapa sugerida desde esta reunión ${e.etapaDeEstaReunion ? "sí" : "no"} · señales de etapa ${e.senalesDeEtapa} · ` +
                `avance desde esta reunión ${e.avanceDeEstaReunion ? "sí" : "no"} · señales de cronograma ${e.senalesDeCronograma}`,
            );
          }
        }
      }
      writeFileSync(join(carpeta, `${String(x.n).padStart(2, "0")}-${slug(x.cliente)}-${x.fecha}.md`), m.join("\n") + "\n", "utf8");
    };

    const llamar = async (
      variante: Variante,
      pedido: Anthropic.Messages.MessageCreateParamsNonStreaming,
      ctx: { clientId: string; projectId: string | null; sessionId: string },
    ): Promise<{ msg: Anthropic.Messages.Message | null; error: string | null }> => {
      try {
        const msg = (await conContextoDeIA(
          { agentSlug: "sondeo-de-hechos", origen: `scripts/sondeo-de-hechos › ${variante} › ${ctx.sessionId}`, triggeredByEmail: POR, clientId: ctx.clientId, projectId: ctx.projectId },
          () => getAnthropic().messages.create(pedido),
        )) as Anthropic.Messages.Message;
        const u = msg.usage;
        const uso = usos[variante];
        uso.llamadas++;
        uso.entrada += u.input_tokens ?? 0;
        uso.salida += u.output_tokens ?? 0;
        uso.cacheLeida += u.cache_read_input_tokens ?? 0;
        uso.cacheEscrita += u.cache_creation_input_tokens ?? 0;
        uso.usd +=
          costoDeLlamada(pedido.model, {
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
          }) ?? 0;
        return { msg, error: null };
      } catch (e) {
        return { msg: null, error: e instanceof Error ? e.message : String(e) };
      }
    };

    /** El calentamiento: escribe la caché sin respuesta. Si la API no admite `max_tokens: 0`, con 1 y sin herramientas. */
    const calentar = async (variante: "Calentamiento B" | "Calentamiento Haiku", pedido: Anthropic.Messages.MessageCreateParamsNonStreaming, ctx: { clientId: string; projectId: string | null; sessionId: string }) => {
      const r = await llamar(variante, pedido, ctx);
      if (!r.error) return r;
      return llamar(variante, { ...pedido, max_tokens: 1, tool_choice: { type: "none" } }, ctx);
    };

    const costoDe = (variante: Variante, antes: number) => usos[variante].usd - antes;

    /* ── 3. Cada reunión ───────────────────────────────────────────────────────────────── */
    const resultados: ReunionDelSondeo[] = [];
    for (const [i, cand] of elegidas.entries()) {
      const n = i + 1;
      const r: ReunionDelSondeo = {
        n,
        sessionId: cand.id,
        titulo: cand.title,
        fecha: fechaLocalDeLaReunion(cand.date),
        cliente: cand.cliente,
        kind: cand.kind,
        fuente: null,
        caracteres: 0,
        recortada: false,
        proyectos: [],
        hechos: [],
        descartados: [],
        variantes: {},
        etapaYAvance: [],
      };
      resultados.push(r);
      process.stdout.write(`[${n}/${elegidas.length}] ${cand.cliente} · «${una(cand.title, 60)}» … `);
      try {
        // El texto, por el chokepoint: si la reunión no es del cliente, no se lee.
        const reunion = await textoParaHechos(cand.id, cand.clientId);
        if (!reunion || !reunion.texto) {
          r.omitida = reunion ? "no deja nada que leer" : "no es del cliente según el chokepoint";
          console.log(`omitida: ${r.omitida}`);
          escribirReunion(r);
          continue;
        }
        const texto = reunion.texto;
        r.fuente = texto.fuente;
        r.caracteres = texto.caracteres;
        r.recortada = texto.recortada;
        const proyectos = await Promise.all(
          reunion.proyectos.map(async (p, k) => ({
            ref: `P${k + 1}`,
            id: p.id,
            nombre: p.nombre,
            alimentaElAvance: p.alimentaElAvance,
            loVendido: (await loadHandoffContext(p.id, { onlyConfirmed: false, includeKeys: ["alcance_contratado"] }).catch(() => "")).slice(0, hechosPedido.TOPE_LO_VENDIDO),
          })),
        );
        r.proyectos = proyectos.map((p) => ({ ref: p.ref, id: p.id, nombre: p.nombre, alimentaElAvance: p.alimentaElAvance }));
        const proyectosPorRef = new Map(proyectos.map((p) => [p.ref, { id: p.id }]));
        const nombreDe = new Map(proyectos.map((p) => [p.ref, p.nombre]));
        const ctx = { clientId: cand.clientId, projectId: proyectos[0]?.id ?? null, sessionId: cand.id };
        const entrada = {
          cliente: { name: cand.cliente, industry: cand.industry, kind: cand.kind },
          proyectos,
          equipoSmarteam: equipo,
          reunion: { titulo: reunion.titulo, fecha: reunion.fecha, texto },
          modelo: hechosPedido.MODELO_DE_HECHOS,
        };
        const verificar = { texto: prepararParaVerificar(texto), proyectosPorRef, equipoSmarteam: equipo };
        const pideFueraDeAlcance = cand.kind === "CLIENTE" && proyectos.length > 0;
        const herramienta = herramientaDeLaLectura({ pideFueraDeAlcance, pidePresentacion: false, emailsDelEquipo: correosActivos });
        const resumir = (msg: Anthropic.Messages.Message | null, error: string | null, usd: number, cacheLeida: number): ResultadoDeVariante => {
          if (!msg) return { hechos: 0, porTipo: {}, descartados: 0, cortada: false, llamoLaHerramienta: false, usd, cacheLeida, error: error ?? "sin respuesta" };
          const s = leerSalidaDeHechos(msg, verificar);
          const porTipo: Record<string, number> = {};
          for (const h of s.hechos) sumar(porTipo, h.tipo);
          return { hechos: s.hechos.length, porTipo, descartados: s.descartados.length, cortada: s.cortada, llamoLaHerramienta: s.llamoLaHerramienta, usd, cacheLeida };
        };

        // A · aparte, sin caché, Sonnet 4.6 (la referencia: de acá salen los hechos del reporte).
        let antes = usos.A.usd;
        const a = await llamar("A", hechosPedido.pedidoDeHechos(entrada), ctx);
        if (a.msg) corridas.A++;
        r.variantes.A = resumir(a.msg, a.error, costoDe("A", antes), a.msg?.usage.cache_read_input_tokens ?? 0);
        if (a.msg) {
          const s = leerSalidaDeHechos(a.msg, verificar);
          // La preventa viva solo importa en un prospecto: ahí, la ficha la propone la preventa y no los hechos.
          const preventaViva =
            cand.kind === "PROSPECTO" &&
            (await db.query(`SELECT 1 FROM "ExploracionDeVenta" WHERE "clientId" = $1 AND "archivadaEn" IS NULL AND "projectId" IS NULL LIMIT 1`, [cand.clientId])).rows.length > 0;
          const ruteo = rutear(s.hechos, {
            kind: cand.kind,
            puertasAdentro: reunion.puertasAdentro,
            preventaViva,
            proyectosVinculados: new Set(proyectos.map((p) => p.id)),
            proyectosQueAlimentanElAvance: new Set(proyectos.filter((p) => p.alimentaElAvance).map((p) => p.id)),
            hechosAbiertosPorHuella: new Map(),
          });
          const destinosDe = (i: number): string[] => {
            const ds = ruteo.porHecho[i]?.destinos ?? [];
            return ds.length ? ds.map((d) => destinoPorClave(d.clave)?.rotulo ?? d.clave) : [SOLO_LA_TARJETA];
          };
          r.hechos = s.hechos.map((h, i) => ({
            tipo: h.tipo,
            tema: h.tema ?? null,
            ambito: h.ambito === "cuenta" ? "cuenta" : `${h.ambito} · ${nombreDe.get(h.ambito) ?? ""}`,
            ref: h.ambito,
            quien: h.quien,
            hablante: h.hablante,
            gravedad: h.gravedad ?? null,
            fuenteDeLaCita: h.fuenteDeLaCita,
            frase: h.frase,
            cita: h.cita,
            huella: h.huella,
            destinos: destinosDe(i),
          }));
          r.descartados = s.descartados.map((d) => ({ motivo: d.motivo, frase: d.hecho.frase, cita: d.hecho.cita }));
        }

        // B · aparte con la caché compartida (primero escribe la caché, después lee los hechos).
        if (n <= OPCIONES.b) {
          const conLectura = { ...entrada, lectura: { herramienta } };
          await calentar("Calentamiento B", hechosPedido.pedidoDeCalentamiento(conLectura), ctx);
          antes = usos.B.usd;
          const b = await llamar("B", hechosPedido.pedidoDeHechos(conLectura), ctx);
          if (b.msg) corridas.B++;
          r.variantes.B = resumir(b.msg, b.error, costoDe("B", antes), b.msg?.usage.cache_read_input_tokens ?? 0);
        }

        // Haiku · la variante B con Haiku 4.5 (la caché es por modelo: se vuelve a calentar).
        if (n <= OPCIONES.haiku) {
          const conHaiku = { ...entrada, modelo: hechosPedido.MODELO_DE_HECHOS_BARATO, lectura: { herramienta } };
          await calentar("Calentamiento Haiku", hechosPedido.pedidoDeCalentamiento(conHaiku), ctx);
          antes = usos.Haiku.usd;
          const h = await llamar("Haiku", hechosPedido.pedidoDeHechos(conHaiku), ctx);
          if (h.msg) corridas.Haiku++;
          r.variantes.Haiku = resumir(h.msg, h.error, costoDe("Haiku", antes), h.msg?.usage.cache_read_input_tokens ?? 0);
        }

        // C · la lectura y los hechos en una sola llamada.
        if (n <= OPCIONES.c) {
          const instrucciones = [
            promptDeLaLectura,
            adendaDeLaHerramienta({ pideFueraDeAlcance }),
            "",
            `=== EQUIPO INTERNO (correos válidos para ownerEmail) ===`,
            equipoFilas.filter((m) => m.activo).map((m) => `- ${m.name} <${m.email}>`).join("\n"),
            proyectos.length ? `\nProyecto activo: ${proyectos[0].nombre}` : "",
            pideFueraDeAlcance && proyectos[0].loVendido ? `\n=== LO QUE SE VENDIÓ ===\n${proyectos[0].loVendido}` : "",
          ].join("\n");
          antes = usos.C.usd;
          const c = await llamar(
            "C",
            hechosPedido.pedidoDeLecturaYHechos({ ...entrada, lectura: { herramienta, instrucciones }, maxTokensDeLaLectura: TOPE_DE_TOKENS[0] }),
            ctx,
          );
          if (c.msg) corridas.C++;
          const resumen = resumir(c.msg, c.error, costoDe("C", antes), c.msg?.usage.cache_read_input_tokens ?? 0);
          resumen.llamoLaLectura = !!c.msg && leerSalidaDeLaLectura(c.msg) !== null;
          r.variantes.C = resumen;
        }

        // La ficha de hoy: el Haiku que relee la reunión (lo mismo que proponerFichaDesdeSesion, sin fusionar ni escribir).
        if (!OPCIONES.sinFicha) {
          const { rows } = await db.query<{ ficha: unknown }>(`SELECT ficha FROM "Client" WHERE id = $1`, [cand.clientId]);
          const contenido = (await fetchTranscriptContent(cand.id, cand.title, { maxChars: 30_000 })) ?? "";
          const fuentes = [{ id: "S1", etiqueta: `Sesión «${cand.title}» del ${r.fecha}`, texto: contenido }];
          if (contenido.trim()) {
            const pedido = pedidoDeFicha({ cliente: { name: cand.cliente, industry: cand.industry }, ficha: leerFicha(rows[0]?.ficha), fuentes, modelo: MODELO_FICHA_SESION, equipoSmarteam: equipo });
            const f = await llamar("Ficha", pedido, ctx);
            if (f.msg) corridas.Ficha++;
            r.ficha = f.msg ? { campos: leerRespuesta(f.msg, fuentes, equipo).map((x) => ({ clave: x.clave, valor: x.valor })) } : { campos: [], error: f.error ?? "sin respuesta" };
          }
        }

        // Procesos: la lectura guardada de esta reunión (los hechos de «hoy»), en memoria.
        if (cand.conProcesos) {
          const { rows } = await db.query<{ output: string | null }>(
            `SELECT output FROM "AgentRun" WHERE "agentSlug" = 'procesos-lectura' AND status = 'DONE' AND $1 = ANY("sourceSessionIds") ORDER BY "createdAt" DESC LIMIT 1`,
            [cand.id],
          );
          try {
            const l = JSON.parse(rows[0]?.output ?? "null") as { hechos?: { momento?: string; accion?: string; proceso?: string }[] } | null;
            const deHoy = (l?.hechos ?? []).filter((h) => h.momento === "hoy");
            r.procesos = { hechosDeHoy: deHoy.length, ejemplos: deHoy.slice(0, 5).map((h) => una(`${h.proceso ?? ""}: ${h.accion ?? ""}`, 140)) };
          } catch {
            r.procesos = null;
          }
        }

        // La etapa sugerida y el avance que salieron de ESTA reunión, contra las señales.
        if (proyectos.length) {
          const ids = proyectos.map((p) => p.id);
          const [{ rows: etapas }, { rows: avances }] = await Promise.all([
            db.query<{ id: string; motivo: string | null }>(`SELECT id, "etapaPropuestaMotivo" AS motivo FROM "Project" WHERE id = ANY($1)`, [ids]),
            db.query<{ projectId: string; asOf: string | null }>(`SELECT "projectId", "pendingProgress"->>'asOfSessionId' AS "asOf" FROM "ProjectTimeline" WHERE "projectId" = ANY($1)`, [ids]),
          ]);
          r.etapaYAvance = proyectos.map((p) => ({
            proyecto: `${p.ref} · ${p.nombre}`,
            etapaDeEstaReunion: leerMotivoDeEtapa(etapas.find((e) => e.id === p.id)?.motivo)?.reunion?.id === cand.id,
            avanceDeEstaReunion: avances.find((x) => x.projectId === p.id)?.asOf === cand.id,
            senalesDeEtapa: r.hechos.filter((h) => h.tipo === "senal_etapa" && h.ref === p.ref).length,
            senalesDeCronograma: r.hechos.filter((h) => h.tipo === "senal_cronograma" && h.ref === p.ref).length,
          }));
        }

        console.log(
          `${r.hechos.length} hechos · ${r.descartados.length} descartados${r.variantes.A?.error ? ` · ✗ A: ${una(r.variantes.A.error, 80)}` : ""}` +
            `${r.variantes.C?.cortada ? " · C cortada" : ""}`,
        );
        escribirReunion(r);
      } catch (e) {
        // Una reunión que falla (la base, una respuesta rara) no tumba el sondeo: queda anotada y se sigue.
        r.omitida = `falló: ${e instanceof Error ? e.message : String(e)}`;
        console.log(r.omitida);
        escribirReunion(r);
      }
    }

    /* ── 4. El reporte ─────────────────────────────────────────────────────────────────── */
    const leidas = resultados.filter((x) => !x.omitida && x.variantes.A && !x.variantes.A.error);
    const todos = leidas.flatMap((x) => x.hechos.map((h) => ({ ...h, kind: x.kind })));
    const descartes = leidas.flatMap((x) => x.descartados);
    const porTipo: Record<string, number> = {};
    const porDestino: Record<string, Record<string, number>> = {};
    for (const h of todos) {
      sumar(porTipo, String(h.tipo));
      for (const d of h.destinos) sumar((porDestino[h.kind] ??= {}), d);
    }
    const porMotivo: Record<string, number> = {};
    for (const d of descartes) sumar(porMotivo, d.motivo);
    const cuantos = leidas.map((x) => x.hechos.length).sort((p, q) => p - q);
    const propuestos = todos.length + descartes.length;

    const lineas: string[] = [];
    const L = (s = "") => lineas.push(s);
    L(`# Sondeo de hechos · ${fecha}`);
    L();
    L(`Corrido por ${POR}. ${leidas.length} reuniones leídas de ${elegidas.length} elegidas (${resultados.filter((x) => x.omitida).length} omitidas).`);
    L(`Excluidas: Wherex (${excluidos.length}) y las de puertas adentro (${puertasAdentro.length}).`);
    L();
    L(`## Hechos por tipo (variante A)`);
    L();
    for (const t of TIPOS_DE_HECHO) L(`- ${ROTULO_DEL_TIPO[t]}: ${porTipo[t] ?? 0}`);
    L(`- Total: ${todos.length} · por reunión: promedio ${(todos.length / Math.max(1, leidas.length)).toFixed(1)}, mínimo ${cuantos[0] ?? 0}, máximo ${cuantos[cuantos.length - 1] ?? 0}`);
    L();
    L(`## A dónde irían (en seco: el enrutador y el registro de destinos de la etapa 6, sin escribir nada)`);
    for (const [kind, destinos] of Object.entries(porDestino)) {
      L();
      L(`### ${kind === "CLIENTE" ? "Clientes" : "Prospectos"}`);
      for (const [d, k] of Object.entries(destinos).sort((p, q) => q[1] - p[1])) L(`- ${d}: ${k}`);
    }
    L();
    L(`## Citas descartadas`);
    L();
    L(`${descartes.length} de ${propuestos} (${pct(descartes.length, propuestos)}).`);
    for (const [m, k] of Object.entries(porMotivo).sort((p, q) => q[1] - p[1])) L(`- ${ROTULO_DEL_MOTIVO[m as keyof typeof ROTULO_DEL_MOTIVO] ?? m}: ${k} (${pct(k, propuestos)})`);
    L();
    L(`## Las variantes`);
    L();
    const prom = (v: Variante) => (corridas[v] ? usos[v].usd / corridas[v] : 0);
    const precioSonnet = precioDe(hechosPedido.MODELO_DE_HECHOS);
    const precioHaiku = precioDe(hechosPedido.MODELO_DE_HECHOS_BARATO);
    // En producción la lectura escribe la caché de todos modos: lo que la variante B le suma es el recargo de escribirla
    // (0,25 de la entrada) más la llamada de los hechos.
    const recargoB = corridas.B && precioSonnet ? ((usos["Calentamiento B"].cacheEscrita / 1_000_000) * precioSonnet.entrada * (precioSonnet.factorEscrituraCache - 1)) / corridas.B : 0;
    const recargoH = corridas.Haiku && precioHaiku ? ((usos["Calentamiento Haiku"].cacheEscrita / 1_000_000) * precioHaiku.entrada * (precioHaiku.factorEscrituraCache - 1)) / corridas.Haiku : 0;
    const filas: Array<[string, Variante, number, string]> = [
      ["A · aparte, sin caché, Sonnet 4.6", "A", prom("A"), ""],
      ["B · aparte con caché, Sonnet 4.6", "B", prom("B") + recargoB, `lee de la caché ${usos.B.cacheLeida} tokens en ${corridas.B} reuniones; el recargo de escribirla va sumado`],
      ["Haiku 4.5 · aparte con caché", "Haiku", prom("Haiku") + recargoH, `lee de la caché ${usos.Haiku.cacheLeida} tokens (mínimo cacheable: 4.096)`],
      ["C · lectura y hechos en una llamada", "C", prom("C"), `se cortaron ${leidas.filter((x) => x.variantes.C?.cortada).length} de ${corridas.C}; llamaron a las dos herramientas ${leidas.filter((x) => x.variantes.C?.llamoLaLectura && x.variantes.C?.llamoLaHerramienta).length}`],
    ];
    for (const [rotulo, v, porReunion, nota] of filas) {
      if (!corridas[v]) continue;
      const hechosV = leidas.reduce((s, x) => s + (x.variantes[v as "A" | "B" | "C" | "Haiku"]?.hechos ?? 0), 0);
      L(`- ${rotulo}: ${corridas[v]} reuniones · ${hechosV} hechos · ${usd(porReunion)} por reunión · ≈${usd(porReunion * REUNIONES_POR_MES)} al mes (${REUNIONES_POR_MES} reuniones)${nota ? ` · ${nota}` : ""}`);
    }
    L(`- (C reemplaza a la lectura entera: su costo no se suma al de la lectura, los de A, B y Haiku sí.)`);
    L();
    L(`## Contra lo que hay hoy`);
    L();
    const conFicha = leidas.filter((x) => x.ficha && !x.ficha.error);
    L(
      `- Ficha (el Haiku que relee la reunión): propone ${conFicha.reduce((s, x) => s + x.ficha!.campos.length, 0)} campos en ${conFicha.filter((x) => x.ficha!.campos.length).length} de ${conFicha.length} reuniones; ` +
        `en esas mismas reuniones, los hechos de cuenta y persona son ${conFicha.reduce((s, x) => s + x.hechos.filter((h) => h.tipo === "cuenta" || h.tipo === "persona").length, 0)} ` +
        `(en ${conFicha.filter((x) => x.hechos.some((h) => h.tipo === "cuenta" || h.tipo === "persona")).length} reuniones). Costo de la ficha: ${usd(usos.Ficha.usd)}.`,
    );
    const conProcesos = leidas.filter((x) => x.procesos);
    L(
      `- Procesos (lecturas guardadas): ${conProcesos.reduce((s, x) => s + x.procesos!.hechosDeHoy, 0)} hechos de «hoy» en ${conProcesos.length} reuniones; ` +
        `los hechos proceso_hoy de esas mismas reuniones son ${conProcesos.reduce((s, x) => s + x.hechos.filter((h) => h.tipo === "proceso_hoy").length, 0)}.`,
    );
    const ea = leidas.flatMap((x) => x.etapaYAvance);
    L(
      `- Etapa: ${ea.filter((x) => x.etapaDeEstaReunion).length} sugerencias salieron de estas reuniones; ${ea.filter((x) => x.senalesDeEtapa > 0).length} proyectos tienen señal de etapa ` +
        `(coinciden ${ea.filter((x) => x.etapaDeEstaReunion && x.senalesDeEtapa > 0).length}).`,
    );
    L(
      `- Avance: ${ea.filter((x) => x.avanceDeEstaReunion).length} borradores de avance salieron de estas reuniones; ${ea.filter((x) => x.senalesDeCronograma > 0).length} proyectos tienen señal de cronograma ` +
        `(coinciden ${ea.filter((x) => x.avanceDeEstaReunion && x.senalesDeCronograma > 0).length}).`,
    );
    L();
    L(`## Costo total del sondeo`);
    L();
    const total = Object.values(usos).reduce((s, u) => s + u.usd, 0);
    for (const [v, u] of Object.entries(usos)) if (u.llamadas) L(`- ${v}: ${u.llamadas} llamadas · ${u.entrada} de entrada, ${u.salida} de salida, ${u.cacheLeida} leídos de la caché, ${u.cacheEscrita} escritos · ${usd(u.usd)}`);
    L(`- Total: ${usd(total)}`);
    L();
    L(`Cada reunión tiene su .md en esta carpeta, con cada hecho, su cita y su destino.`);

    const resumen = lineas.join("\n");
    writeFileSync(join(carpeta, "resumen.md"), resumen, "utf8");
    writeFileSync(join(carpeta, "sondeo.json"), JSON.stringify({ fecha, por: POR, opciones: OPCIONES, usos, corridas, reuniones: resultados }, null, 2), "utf8");
    console.log(`\n${resumen}\n`);
    console.log(`Listo: ${carpeta}`);

    // El medidor anota cada llamada en segundo plano (fire-and-forget): se le da tiempo antes de cerrar.
    await new Promise((listo) => setTimeout(listo, 3_000));
    await prisma.$disconnect().catch(() => undefined);
    return 0;
  } finally {
    db.release();
    await close();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
