/**
 * GET /api/health — el smoke check del deploy. PÚBLICO (está en PUBLIC_PATHS del
 * middleware): lo consume `scripts/deploy.sh` con curl sin sesión, y el
 * healthcheck del docker-compose.
 *
 * Qué verifica y POR QUÉ cada check existe:
 *  - `sha`: el commit HORNEADO en la imagen (ENV GIT_SHA del Dockerfile, nunca
 *    del .env del VPS). deploy.sh lo compara contra el HEAD del checkout — si
 *    difieren, el contenedor sirve una imagen VIEJA (deploy mixto: el modo de
 *    falla que generó la ola de errores de julio 2026).
 *  - `db`: SELECT 1 — ¿Postgres responde?
 *  - `prismaClient`: `roleProfile.count()` — el CANARIO del cliente Prisma
 *    stale. RoleProfile es un modelo reciente (2026-07-17): si la imagen mezcla
 *    código nuevo con un cliente generado antes, esto truena acá (503 en el
 *    deploy) y no en la cara del usuario (fueron 558 eventos en Sentry).
 *    Al agregar un modelo nuevo al schema se puede rotar el canario.
 *  - `esquema` (2026-09-30): ¿la base tiene todas las tablas, columnas y valores de enum que el
 *    cliente Prisma de ESTA imagen espera? Es el atraso contrario al del canario, y el más común:
 *    código nuevo desplegado sin correr antes su SQL de `scripts/sql/`. Hasta ese día la salud
 *    daba `ok: true`, deploy.sh imprimía «DEPLOY OK» y las pantallas que leían la columna que
 *    faltaba reventaban con P2022. Ahora responde 503 con lo que falta y deploy.sh revierte solo.
 *    UNA consulta al catálogo, con tope de 3 s: en verde queda guardada para todo el proceso, y
 *    atrasada se relee cada 30 s (lib/db/salud-del-esquema.ts). ⚠ SÍ participa del `ok`, pero
 *    solo con prueba: si el catálogo no se pudo leer o tardó, dice «sin verificar» y no apaga
 *    nada. Lo que la base tiene de más (la columna `embedding`, índices) no cuenta.
 *    `ESQUEMA_NO_BLOQUEA=1` lo deja en aviso (docs/RUNBOOK.md › Esquema atrasado).
 *  - `pool`: estado del pool de pg — `waiting` sostenido > 0 = presión de
 *    conexiones (la antesala del "Connection terminated").
 *  - `invariantesOk` (B-09): UN booleano —true/false/null— con lo que dijo la última
 *    corrida del job `invariants-daily` (B-08). Nada más: ni cuáles ni el texto (el
 *    endpoint es público; el detalle vive en el semáforo de Integraciones). ⚠ NO
 *    participa del `ok`: un invariante violado es un dato mal escrito, no un
 *    contenedor caído — si tumbara el healthcheck, Docker reiniciaría la app en bucle.
 *  - `memoriaMb` y `atrasoHiloMs` (2026-09-21): rss, heapUsed y el tope del heap, y el atraso del
 *    hilo de JS (p50/p99/máx de la última ventana de 10 s). El incidente de ese día (821 % de CPU,
 *    1,13 GiB, 15–25 s congelado durante horas) no se vio venir porque nada medía esto. Solo
 *    números (lib/observability/medidor-proceso.ts). ⚠ NO participan del `ok`: un heap alto no es
 *    un contenedor caído; el aviso va a los logs.
 *
 * No expone secretos: el SHA es público en el repo y los stats son números.
 */
import { prisma, poolStats } from "@/lib/db/prisma";
import {
  crearVerificadorDeEsquema,
  esperadoDeEsteCliente,
  leerEsquemaDeLaBase,
  textoDeLaSalud,
} from "@/lib/db/salud-del-esquema";
import { leerInvariantesOk } from "@/lib/invariantes/salud";
import { storageAcepta } from "@/lib/storage/public-assets";
import { leerProceso } from "@/lib/observability/medidor-proceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* UNO por proceso, creado al cargar la ruta: es el que guarda el verde para que el healthcheck
   (cada 15 s) no vuelva a consultar el catálogo. Crearlo no consulta nada. */
const saludDelEsquema = crearVerificadorDeEsquema({
  esperado: esperadoDeEsteCliente,
  leer: () => leerEsquemaDeLaBase(prisma),
});

export async function GET(req: Request) {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (e) {
    ok = false;
    checks.db = e instanceof Error ? e.message.slice(0, 200) : "fail";
  }

  try {
    await prisma.roleProfile.count();
    checks.prismaClient = "ok";
  } catch (e) {
    ok = false;
    checks.prismaClient = e instanceof Error ? e.message.slice(0, 200) : "fail";
  }

  /* ── ¿La base tiene todo lo que este código espera? (2026-09-30) ──────────────────────────
     Con la base caída no se pregunta: el check `db` ya lo dijo. `saludDelEsquema()` nunca lanza
     y no consulta nada una vez que dio verde. El `ok` se apaga SOLO con el atraso probado: «sin
     verificar» (el catálogo no se pudo leer, o tardó) no revierte un deploy ni marca el
     contenedor. El endpoint es público: el texto nombra pocos faltantes; la lista entera y el
     error crudo de la base quedan en los logs, con `[esquema]`. */
  if (checks.db === "ok") {
    const esquema = await saludDelEsquema();
    checks.esquema = textoDeLaSalud(esquema);
    if (esquema.estado === "atrasado") {
      if (process.env.ESQUEMA_NO_BLOQUEA === "1") checks.esquema += " (no bloquea: ESQUEMA_NO_BLOQUEA=1)";
      else ok = false;
    }
  } else {
    checks.esquema = "sin verificar: la base no responde";
  }

  // Best-effort y aparte del `ok`: nunca cae ni tumba el health (ver lib/invariantes/salud.ts).
  const invariantesOk = await leerInvariantesOk();

  /* ── ¿El almacenamiento acepta las credenciales del servidor? (2026-09-07) ────────────────
     SOLO con `?storage=1`, nunca en el healthcheck del compose: es una llamada de red a
     Supabase y este endpoint lo golpea cada 15 s. Sirve para responder en un curl la pregunta
     que hoy exige que alguien intente subir una foto y falle: «¿la clave del servidor sirve?».
     Un booleano y nada más — el endpoint es PÚBLICO (mismo criterio que `invariantesOk`, B-09),
     así que el detalle del error queda en los logs del servidor, no acá.
     ⛔ NO participa del `ok`: el storage caído no es el contenedor caído, y si tumbara el
     healthcheck Docker reiniciaría en bucle por algo que se arregla en el `.env`. */
  let storageOk: boolean | null = null;
  if (new URL(req.url).searchParams.get("storage") === "1") {
    storageOk = await storageAcepta().catch(() => false);
  }

  const proceso = leerProceso();

  return Response.json(
    {
      ok,
      sha: process.env.GIT_SHA ?? "unknown",
      uptimeSec: Math.round(process.uptime()),
      pool: poolStats(),
      memoriaMb: { rss: proceso.rssMb, heapUsed: proceso.heapUsedMb, heapLimit: proceso.heapLimitMb },
      atrasoHiloMs: proceso.atrasoMs,
      checks,
      invariantesOk,
      storageOk,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
