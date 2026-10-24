/**
 * scripts/recuperar-transcripts-meet.ts — EL RESCATE de las sesiones que el pipeline viejo
 * quemó como definitivas.
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────
 * Clasifica las sesiones de Google Meet con el criterio PURO de
 * `lib/google/recuperacion-criterio.ts` (buckets A/B/C, ver ahí el porqué de cada uno) y
 * las RESETEA al estado «nunca intentada» (enrichedAt/attempts/error en cero; el bucket C
 * además limpia el transcript basura). **No lee nada de Google**: el drenaje real lo hacen
 * las pasadas normales y el job `google-enrich-retry`, con su batch chico y su backoff —
 * que un script suelto vuelva a pegarle a la API en masa es la mecánica exacta de la quema
 * del 17-may.
 *
 * ── PRERREQUISITO DURO: CORRE DESPUÉS DEL DEPLOY ────────────────────────────
 * Aborta si las columnas de R2 no existen en la base. ⚠ PERO LAS COLUMNAS YA ESTÁN EN PROD
 * (la migración se aplica antes del deploy), así que ese check NO detecta el peligro real:
 * correr el rescate con el CÓDIGO viejo aún deployado — el auto-sync de prod tomaría lo
 * reseteado y lo re-quemaría byte a byte (catch mudo + sellado incondicional + batch de 10
 * sin backoff). Como el script no puede leer qué código corre el VPS, `--apply` exige
 * ADEMÁS `--deploy-confirmado`: la persona afirma que verificó el deploy (curl
 * https://<host>/api/health → el sha tiene que ser el de esta tanda, no "dev" ni uno viejo).
 *
 * ── IDEMPOTENTE POR CONSTRUCCIÓN ────────────────────────────────────────────
 * Una fila ya reseteada (enrichedAt null, transcript null) no cae en ningún bucket, así que
 * correrlo dos veces no hace nada la segunda. `summary` y minutas no se tocan JAMÁS.
 *
 * Uso:
 *   npx tsx scripts/recuperar-transcripts-meet.ts                     # dry-run con conteos
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/recuperar-transcripts-meet.ts --apply --deploy-confirmado --limit 50
 *   … --solo-futuras --limit 300        # solo las reuniones que todavía no ocurrieron (INV16 a)
 *   … --solo-antes-de-terminar --limit 300   # solo el bucket D: selladas vacías antes de que terminara la reunión
 *   … --dias 90 --solo-clientes-y-prospectos   # recortes: las de los últimos N días, y solo las de una empresa
 *                                              # que es cliente o prospecto (no las de puertas adentro)
 *
 * ── EL RESCATE DE U1: «las 177 que se leyeron antes de terminar» (2026-10-25) ────────
 * docs/integracion-google-plan.md › U1. Medido el 2026-10-24 en producción: el bucket D tiene 950 filas en toda la
 * historia (dailies internos incluidos); las 177 del plan son las de los últimos 90 días con clientes y prospectos.
 * Se corre DESPUÉS del deploy de U1 (con el SQL 2026-10-25 aplicado: las canceladas no se rescatan) y con el job
 * `google-meet-sync` corriendo, que es el que drena lo reseteado cada 10 minutos:
 *   1. simulacro:  npx tsx scripts/recuperar-transcripts-meet.ts --solo-antes-de-terminar --dias 90 --solo-clientes-y-prospectos
 *      (tiene que decir unas 177; un orden de magnitud distinto se investiga antes del --apply)
 *   2. aplicar:    ALLOW_PROD_WRITE=1 npx tsx scripts/recuperar-transcripts-meet.ts --solo-antes-de-terminar --dias 90 --solo-clientes-y-prospectos --apply --deploy-confirmado --limit 200
 *   3. medir: el simulacro del paso 1 baja a 0 cuando la pasada las volvió a leer (las que Google sí tenía quedan con
 *      texto; las que no, selladas de nuevo DESPUÉS del fin, ya fuera del bucket).
 * ⚠ Recupera el TEXTO, no lo lee: la lectura (minuta, hechos) de las de más de 14 días va por el modo de recuperación de
 * T2 (`scripts/encolar-lecturas-pendientes.ts --recuperacion`, docs/reuniones-pieza-angular-plan.md › «Cómo se trae lo
 * que ya existe»), por lotes y con su tope. Las de menos de 14 días entran a la cola normal al recuperar su texto.
 *
 * ── --solo-futuras (2026-10-16) ─────────────────────────────────────────────
 * INV16(a) cuenta las reuniones selladas ANTES de ocurrir. Las del pipeline viejo (mayo–julio) nunca
 * se van a leer cuando ocurran: la pasada solo toma `enrichedAt: null`. Resetearlas no le pega a
 * Google —la pasada no toca una fila hasta que su fecha pasó— y les devuelve la lectura. Por eso con
 * esta opción el tope puede ser alto. Sin ella, el rescate entero sigue siendo el de agosto: ⚠ el
 * bucket A pasó de 1.494 a 1.901 filas (2026-10-16) porque también cuenta reuniones legítimas con
 * solo notas de Gemini; no se corre entero sin revisar ese criterio.
 *
 * Conteos del dry-run REAL (2026-08-08, contra producción): 1.494 en A (todas las selladas
 * sin transcript con doc — superset de las corridas quemadas del 17-may/7-jul y de las
 * ~464 de pestaña renombrada), 792 en B (487 selladas antes de ocurrir + organizador
 * inimpersonable con interno invitado), 66 en C. Un orden de magnitud distinto en una
 * corrida futura se INVESTIGA antes del --apply.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { bucketDe, datosDeReset, type BucketDeRescate } from "@/lib/google/recuperacion-criterio";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";

const APPLY = resolverApply();
const DEPLOY_CONFIRMADO = process.argv.includes("--deploy-confirmado");
const SOLO_FUTURAS = process.argv.includes("--solo-futuras");
/* Bucket D (2026-10-17): las que la pasada vieja buscó antes de que terminara la reunión. Como B, no le pega a Google
   en masa: las drenan las pasadas con su batch chico. */
const SOLO_ANTES_DE_TERMINAR = process.argv.includes("--solo-antes-de-terminar");
const SOLO_CLIENTES_Y_PROSPECTOS = process.argv.includes("--solo-clientes-y-prospectos");
/* `--dias N` o `--dias=N`. Mal escrito ABORTA: perderlo en silencio rescataba toda la historia (950 filas) en vez de 177. */
const DIAS = (() => {
  const conIgual = process.argv.find((a) => a.startsWith("--dias="));
  const i = process.argv.indexOf("--dias");
  if (!conIgual && i < 0) return null;
  const crudo = conIgual ? conIgual.slice("--dias=".length) : (process.argv[i + 1] ?? "");
  const n = Number(crudo);
  if (!/^\d+$/.test(crudo) || !Number.isSafeInteger(n) || n <= 0) {
    console.error(`✗ ABORTADO: --dias necesita un número de días mayor que cero (llegó «${crudo}»).`);
    process.exit(1);
  }
  return n;
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  const n = i >= 0 ? parseInt(process.argv[i + 1] ?? "", 10) : 50;
  return Number.isFinite(n) && n > 0 ? n : 50;
})();

async function columnasDeR2Existen(): Promise<boolean> {
  const r = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'FirefliesSession' AND column_name IN ('enrichAttempts', 'enrichError')
  `;
  return r.length === 2;
}

/** ¿Ya está el SQL de U1 (2026-10-25)? Sin él no se sabe qué reuniones se cancelaron. */
async function columnaDeCanceladasExiste(): Promise<boolean> {
  const r = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'FirefliesSession' AND column_name = 'canceladaEn'
  `;
  return r.length === 1;
}

async function main() {
  if (!(await columnasDeR2Existen())) {
    console.error(
      "✗ ABORTADO: faltan las columnas enrichAttempts/enrichError. Aplicá primero\n" +
        "  scripts/sql/2026-08-08-enrich-error-reintento.sql y deployá R1+R2+R3.\n" +
        "  Correr el rescate con el pipeline viejo repetiría la quema del 17-may.",
    );
    process.exitCode = 1;
    return;
  }

  /* La misma regla que la cola de Docs (lib/sessions/canceladas.ts): una cancelada SIN su Doc adjunto no se rescata
     (buscárselo por el título trae el de otra reunión); con su Doc sí, porque es el de esa reunión y pudo ocurrir y
     borrarse después. Sin el SQL de U1 el simulacro avisa y el --apply no corre. */
  const conCanceladas = await columnaDeCanceladasExiste();
  if (!conCanceladas) {
    if (APPLY) {
      console.error("✗ ABORTADO: falta scripts/sql/2026-10-25-reuniones-codigo-y-participantes.sql (U1). Sin él se rescatarían reuniones canceladas.");
      process.exitCode = 1;
      return;
    }
    console.log("⚠ Falta el SQL de U1 (2026-10-25): este simulacro cuenta también las reuniones canceladas.");
  }

  const ahora = new Date();
  const filas = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      ...(DIAS ? { date: { gte: new Date(ahora.getTime() - DIAS * 86_400_000) } } : {}),
      ...(conCanceladas ? { OR: [{ canceladaEn: null }, { googleDocId: { not: null } }] } : {}),
    },
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      enrichedAt: true,
      transcript: true,
      googleDocId: true,
      organizerEmail: true,
      participants: true,
      resolvedClientId: true,
      manualClientId: true,
    },
  });

  // Las empresas que cuentan para el recorte; la dueña de cada reunión sale de `duenoDeLaSesion`.
  const deEmpresa = new Set<string>();
  if (SOLO_CLIENTES_Y_PROSPECTOS) {
    const empresas = await prisma.client.findMany({ where: { kind: { in: ["CLIENTE", "PROSPECTO"] } }, select: { id: true } });
    for (const e of empresas) deEmpresa.add(e.id);
  }

  const porBucket = new Map<BucketDeRescate, typeof filas>();
  for (const f of filas) {
    if (SOLO_FUTURAS && f.date.getTime() <= ahora.getTime()) continue;
    if (SOLO_CLIENTES_Y_PROSPECTOS) {
      const duena = duenoDeLaSesion(f);
      if (!duena || !deEmpresa.has(duena)) continue;
    }
    const b = bucketDe(f, ahora);
    if (SOLO_ANTES_DE_TERMINAR && b !== "D_sellada_antes_de_terminar") continue;
    if (b) porBucket.set(b, [...(porBucket.get(b) ?? []), f]);
  }

  const recortes = [
    SOLO_FUTURAS ? "solo las que todavía no ocurrieron" : null,
    DIAS ? `de los últimos ${DIAS} días` : null,
    SOLO_CLIENTES_Y_PROSPECTOS ? "solo de clientes y prospectos" : null,
  ].filter(Boolean);
  console.log(`Sesiones de Meet examinadas: ${filas.length}${recortes.length ? ` (${recortes.join(", ")})` : ""}`);
  for (const [bucket, xs] of [...porBucket.entries()].sort()) {
    console.log(`\n── ${bucket}: ${xs.length} filas`);
    for (const f of xs.slice(0, 5)) {
      console.log(`   ${f.date.toISOString().slice(0, 10)}  "${f.title.slice(0, 70)}"`);
    }
    if (xs.length > 5) console.log(`   … y ${xs.length - 5} más`);
  }
  if (porBucket.size === 0) {
    console.log("\nNada que rescatar. (Idempotencia: si ya corriste --apply, esto es lo esperado.)");
    return;
  }

  if (APPLY && !DEPLOY_CONFIRMADO) {
    console.error(
      "✗ ABORTADO: --apply exige --deploy-confirmado.\n" +
        "  Las columnas ya están en prod ANTES del deploy, así que este script no puede saber\n" +
        "  qué código corre el VPS. Verificá el deploy (curl /api/health → sha de esta tanda)\n" +
        "  y volvé a correr con --deploy-confirmado. Resetear con el código viejo deployado\n" +
        "  re-quema todo: el auto-sync viejo sella en fallo y sin backoff.",
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN. Con --apply se resetean hasta ${LIMIT} filas por corrida (el drenaje real lo\n` +
        "hacen las pasadas + el job con backoff, no este script). Volvé a correrlo hasta drenar.",
    );
    return;
  }

  // ── APPLY: hasta LIMIT filas por corrida, priorizando C (miente hoy) > A > B ──
  const orden: BucketDeRescate[] = ["C_transcript_basura", "D_sellada_antes_de_terminar", "A_sellada_con_doc", "B_sin_doc"];
  let presupuesto = LIMIT;
  for (const bucket of orden) {
    const xs = (porBucket.get(bucket) ?? []).slice(0, presupuesto);
    if (xs.length === 0) continue;
    const r = await prisma.firefliesSession.updateMany({
      where: { id: { in: xs.map((f) => f.id) } },
      data: datosDeReset(bucket),
    });
    presupuesto -= r.count;
    console.log(`✓ ${bucket}: ${r.count} reseteadas`);
    if (presupuesto <= 0) break;
  }
  console.log(
    `\nListo. Las pasadas y el job google-enrich-retry van a drenar lo reseteado. ` +
      `INV16 se pone verde cuando el rescate TERMINA — re-corré este script hasta que el ` +
      `dry-run diga «nada que rescatar».`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
