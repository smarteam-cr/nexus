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
 * Aborta si las columnas de R2 no existen en la base. Y aunque existan: correrlo con el
 * CÓDIGO viejo aún deployado repetiría la quema byte a byte (catch mudo + sellado
 * incondicional + batch de 10 sin backoff). El orden es: deploy de R1+R2+R3 → este script.
 *
 * ── IDEMPOTENTE POR CONSTRUCCIÓN ────────────────────────────────────────────
 * Una fila ya reseteada (enrichedAt null, transcript null) no cae en ningún bucket, así que
 * correrlo dos veces no hace nada la segunda. `summary` y minutas no se tocan JAMÁS.
 *
 * Uso:
 *   npx tsx scripts/recuperar-transcripts-meet.ts                     # dry-run con conteos
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/recuperar-transcripts-meet.ts --apply --limit 50
 *
 * Conteos del dry-run REAL (2026-08-08, contra producción): 1.494 en A (todas las selladas
 * sin transcript con doc — superset de las corridas quemadas del 17-may/7-jul y de las
 * ~464 de pestaña renombrada), 792 en B (487 selladas antes de ocurrir + organizador
 * inimpersonable con interno invitado), 66 en C. Un orden de magnitud distinto en una
 * corrida futura se INVESTIGA antes del --apply.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { bucketDe, datosDeReset, type BucketDeRescate } from "@/lib/google/recuperacion-criterio";

const APPLY = resolverApply();
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

  const ahora = new Date();
  const filas = await prisma.firefliesSession.findMany({
    where: { source: "google_meet" },
    select: {
      id: true,
      title: true,
      date: true,
      enrichedAt: true,
      transcript: true,
      googleDocId: true,
      organizerEmail: true,
      participants: true,
    },
  });

  const porBucket = new Map<BucketDeRescate, typeof filas>();
  for (const f of filas) {
    const b = bucketDe(f, ahora);
    if (b) porBucket.set(b, [...(porBucket.get(b) ?? []), f]);
  }

  console.log(`Sesiones de Meet examinadas: ${filas.length}`);
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

  if (!APPLY) {
    console.log(
      `\nDRY-RUN. Con --apply se resetean hasta ${LIMIT} filas por corrida (el drenaje real lo\n` +
        "hacen las pasadas + el job con backoff, no este script). Volvé a correrlo hasta drenar.",
    );
    return;
  }

  // ── APPLY: hasta LIMIT filas por corrida, priorizando C (miente hoy) > A > B ──
  const orden: BucketDeRescate[] = ["C_transcript_basura", "A_sellada_con_doc", "B_sin_doc"];
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
