/**
 * scripts/encolar-lecturas-pendientes.ts — deja en la cola de la LECTURA DE SEGUIMIENTO las reuniones que se quedaron
 * afuera (memoria de la cuenta, etapa 2; docs/RUNBOOK.md «La lectura de cada reunión»). Solo encola: lee el job
 * `seguimiento-reuniones`, de a 2 por tick y contra el presupuesto automático.
 *
 * Para qué sirve:
 *   · el día del deploy: las reuniones frescas que se enriquecieron ANTES de que existiera la cola no tienen fila, e
 *     INV44 las reclama (medido el 2026-10-10: 6 de 92 sin minuta). Sin esto, INV44 nace en rojo;
 *   · después: una reunión puntual que quedó afuera (`--sesion <id>`, sin el corte de 14 días), o las que quedaron en
 *     `error` tras tres intentos (`--tambien-errores`).
 * La regla de qué entra es la de la cola (lib/lecturas/reglas.ts, `motivoParaNoEncolar`): de un cliente o un
 * prospecto, no de puertas adentro, ya ocurrida, fresca (salvo `--sesion`) y con transcripción.
 *
 * En seco por defecto (la conexión nace de solo lectura): lista lo que encolaría y por qué no encola el resto. Para
 * escribir, `--apply` con ALLOW_PROD_WRITE=1 (el guard respalda LecturaDeReunion antes).
 *
 * Uso:
 *   npx tsx scripts/encolar-lecturas-pendientes.ts                         # en seco: las de los últimos 14 días
 *   npx tsx scripts/encolar-lecturas-pendientes.ts --tambien-errores
 *   npx tsx scripts/encolar-lecturas-pendientes.ts --sesion <id>          # una reunión puntual (sin el corte de 14 días)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptDb } from "./lib/db";
import { describirDestino, resolverApply } from "./lib/guard";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const apply = process.argv.includes("--apply");
if (!apply) {
  /* ⛔ En seco ni por error: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
}

const ESTADOS_EN_CURSO = ["en_espera", "leyendo"];

async function main() {
  const escribir = resolverApply({ tablas: ["LecturaDeReunion"] });
  const sola = arg("--sesion");
  const conErrores = process.argv.includes("--tambien-errores");
  const max = Math.max(1, Number(arg("--max") ?? 100));
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco, solo lectura"})\n`);

  const { prisma: db, close } = createScriptDb();
  try {
    const { DIAS_DE_FRESCURA, ESTADOS_QUE_CUENTAN, motivoParaNoEncolar } = await import("@/lib/lecturas/reglas");
    const { buildInternalDomainsSet } = await import("@/lib/sessions/categorize");
    const { esReunionDePuertasAdentro } = await import("@/lib/sessions/candidatas-internas");
    const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");
    const ahora = new Date();

    const filas = await db.firefliesSession.findMany({
      where: sola
        ? { id: sola }
        : {
            date: { gte: new Date(+ahora - DIAS_DE_FRESCURA * 86_400_000), lte: ahora },
            enrichedAt: { not: null },
            transcript: { not: null },
            OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
          },
      select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
    });
    if (!filas.length) {
      console.log(sola ? `No existe la reunión ${sola}.` : "No hay reuniones recientes con transcripción y dueño.");
      return;
    }
    const ids = filas.map((f) => f.id);
    const duenos = [...new Set(filas.map((f) => duenoDeLaSesion(f)).filter((x): x is string => !!x))];
    const [clientes, categorias, minutas] = await Promise.all([
      db.client.findMany({ where: { id: { in: duenos } }, select: { id: true, name: true, kind: true } }),
      db.sessionCategory.findMany({ select: { domains: true, kind: true } }),
      db.sessionMinute.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true } }),
    ]);
    const cliente = new Map(clientes.map((c) => [c.id, c]));
    const dominios = buildInternalDomainsSet(categorias);
    const conMinuta = new Set(minutas.map((m) => m.sessionId));
    let estados = new Map<string, string | null>();
    try {
      const lecturas = await db.lecturaDeReunion.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true, seguimientoEstado: true } });
      estados = new Map(lecturas.filter((l) => !!l.sessionId).map((l) => [l.sessionId!, l.seguimientoEstado]));
    } catch (e) {
      console.error(`⚠ No se pudo leer la cola (¿falta scripts/sql/2026-10-10-lectura-de-seguimiento.sql?): ${e instanceof Error ? e.message : e}`);
      if (escribir) throw new Error("Sin las columnas de la cola no se puede encolar.");
    }

    // Lo que ya tiene su lectura (o se está leyendo) no se toca; una en error, solo con --tambien-errores.
    const pendientes = filas.filter((f) => {
      if (conMinuta.has(f.id) && !sola) return false;
      const estado = estados.get(f.id) ?? null;
      if (estado && ESTADOS_EN_CURSO.includes(estado)) return false;
      if (estado === "error") return conErrores || !!sola;
      if (estado && (ESTADOS_QUE_CUENTAN as readonly string[]).includes(estado)) return !!sola && estado !== "lista" && estado !== "copia";
      return true;
    });

    // El largo de la transcripción, solo de las que quedan, de a 50 (no se trae el texto de todo).
    const largos = new Map<string, number>();
    for (let i = 0; i < pendientes.length; i += 50) {
      const tanda = pendientes.slice(i, i + 50).map((f) => f.id);
      for (const t of await db.firefliesSession.findMany({ where: { id: { in: tanda } }, select: { id: true, transcript: true } })) largos.set(t.id, (t.transcript ?? "").trim().length);
    }

    const aEncolar: typeof pendientes = [];
    const porMotivo = new Map<string, number>();
    for (const f of pendientes) {
      const dueno = duenoDeLaSesion(f);
      const motivo = motivoParaNoEncolar(
        {
          kind: dueno ? (cliente.get(dueno)?.kind ?? null) : null,
          puertasAdentro: esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios),
          fecha: f.date,
          largoTranscript: largos.get(f.id) ?? 0,
          ahora,
        },
        { sinCorteDeFrescura: !!sola },
      );
      if (motivo) porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
      else aEncolar.push(f);
    }

    console.log(`${filas.length} reunión(es) mirada(s); ${pendientes.length} sin su lectura; ${aEncolar.length} para encolar.`);
    if (porMotivo.size) console.log(`No entran: ${[...porMotivo].map(([m, n]) => `${n} ${m}`).join(", ")}.`);
    for (const f of aEncolar.slice(0, max)) {
      const dueno = duenoDeLaSesion(f);
      const estado = estados.get(f.id) ?? "sin fila";
      console.log(`  · ${f.date.toISOString().slice(0, 10)} «${f.title}» (${f.id}) · ${cliente.get(dueno ?? "")?.name ?? "?"} · ${estado}`);
    }
    if (aEncolar.length > max) console.log(`  · y ${aEncolar.length - max} más (--max para ver o encolar más)`);

    if (!escribir) {
      console.log("\nEn seco: no se escribió nada. Para encolarlas: ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --apply");
      return;
    }
    const { encolarSeguimiento } = await import("@/lib/lecturas/cola");
    let encoladas = 0;
    for (const f of aEncolar.slice(0, max)) {
      const r = await encolarSeguimiento(f.id, new Date(), 0, { sinCorteDeFrescura: !!sola });
      if (r.encolada) encoladas++;
      else console.log(`  · ${f.id} no entró: ${r.motivo}`);
    }
    console.log(`\n✓ ${encoladas} reunión(es) en la cola. El job «La lectura de cada reunión» las lee de a 2 por minuto, con presupuesto automático.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
