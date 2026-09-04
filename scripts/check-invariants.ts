import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $Enums } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { detectarFusionesEnLote } from "@/lib/hubspot/empresa-fusionada";
import { GRUPOS_RESUELTOS_POR_TIPO } from "@/lib/agents/resolver";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { escribeSqlCrudo } from "@/lib/db/escritura-sql-cruda";
import {
  INV1, INV3, INV5, INV8, INV8c, INV10, INV11, INV14, INV18, INV20, INV21, INV22, INV23, INV24, INV25, INV26, INV27, INV28,
  type Invariante,
} from "@/lib/invariantes";

/**
 * Imprime un invariante extraído a `lib/invariantes/` exactamente como se imprimía acá adentro
 * (B-07, 2026-09-04): ✓ a stdout, ✗ y su detalle a stderr. Devuelve 1 si viola.
 */
async function reportar(inv: Invariante, db: typeof prisma): Promise<number> {
  const r = await inv.correr(db, new Date());
  for (const linea of r.lineas) (r.ok ? console.log : console.error)(linea);
  return r.ok ? 0 : 1;
}

/**
 * scripts/check-invariants.ts — BLINDAJE DURO de los invariantes medulares de Nexus.
 * Exit ≠0 si alguno se viola. Lo invoca la skill /ship antes de commitear, y se puede
 * correr a mano: `npx tsx scripts/check-invariants.ts` (o `npm run check:invariants`).
 *
 * ⚠ B-07 (2026-09-04): los invariantes que solo miran la base viven en `lib/invariantes/` y acá
 * se IMPRIMEN (`reportar`), para que un job y /api/health también los corran. Los demás siguen acá.
 *
 * Invariantes:
 *   1. Ningún `SessionProject` cruza cliente: la sesión (resolvedClientId/manualClientId)
 *      pertenece al cliente del proyecto. Es EL invariante del leak cross-empresa de
 *      handoffs — la red dura aunque el chokepoint ya filtre en runtime.
 *   2. Materialización fresca: `resolveAllSessions({dryRun}).changed === 0`. Si != 0,
 *      alguien editó clientes/categorías (o el resolver) y no re-resolvió → resolvedClientId
 *      quedó desactualizado y los reads por resolvedClientId mienten.
 *   3. Ningún Cobro COBRADO sin confirmadoPor (Cobranza: el humano confirma lo que
 *      mueve dinero; chokepoint único lib/cobranza/mutations.ts#cambiarEstadoCobro).
 *   4. Enums del CLIENTE GENERADO ⊆ enums de Postgres. Atrapa el bug de las "migraciones
 *      silenciosas" (BlockSource.MODIFIED, post-mortem en ARCHITECTURE.md): si el código
 *      conoce un valor que la DB no tiene, el próximo write con ese valor revienta. Se
 *      compara `$Enums` de @prisma/client (lo que el código EJECUTA — el dmmf del client
 *      de este setup viene vacío) contra pg_enum (lo que la DB acepta). Los valores que
 *      la DB tiene DE MÁS no violan (drift de la otra PC aún sin mergear: solo warning).
 *   5. Ningún Cobro con fechaEmision sin facturadoPor (Cobranza, espejo de INV3 — Tanda B,
 *      2026-07): "Marcar facturado" es auditable igual que COBRADO; mismo chokepoint
 *      lib/cobranza/mutations.ts#cambiarEstadoCobro.
 *   6. Ningún `new Pool(` sin `max:` (post-mortem EMAXCONNSESSION jul-2026).
 *   7. COLUMNAS del schema ⊆ columnas de Postgres — hermano de INV4 y MÁS grave: con una
 *      columna que el cliente conoce y la DB no, Prisma revienta TODA lectura del modelo
 *      (no solo los writes), con un mensaje que ni siquiera la nombra ("The column
 *      `(not available)` does not exist"). Se cae una sección entera de la app. Nació el
 *      2026-07-27, cuando `Client.logoDarkUrl`/`logoScale` quedaron sin aplicar y /clients
 *      dejó de cargar sin que nada lo hubiera avisado.
 *   8. El HERMANO de un proyecto está sano: no cruza cliente, no es él mismo, y no queda
 *      un vínculo declarado sin resolver cuando el proyecto apuntado SÍ existe en Nexus.
 *      Un hermano decide FACTURACIÓN (un desarrollo colgado de una implementación no se
 *      cobra aparte), así que un vínculo mal resuelto es plata mal contada.
 *   9. El fragmento SQL y el predicado en memoria de lib/projects/scope.ts devuelven el
 *      MISMO conjunto sobre los datos reales. `scope.test.ts` ya prueba la lógica contra
 *      1.080 filas sintéticas; esto la prueba contra la base, que es donde viven los casos
 *      que a nadie se le ocurrió inventar.
 *  10. Ningún proyecto sincronizado se quedó SIN CLASE. Un `hubspotServiceId` con
 *      `hubspotPipelineId` en NULL por más de un día significa que el sync lo escribió y no
 *      le puso su pipeline — el defecto que tuvo la rama de creación, visto desde los datos
 *      en vez de desde el código. Mientras dura, ese proyecto se comporta como Customer
 *      Success: entra a la cartera, al vigilante y a cobranza.
 *  11. Toda etapa materializada activa está declarada en `PROJECT_PIPELINES` — si HubSpot
 *      ganó etapas nuevas y nadie las transcribió, hay proyectos clasificados a ciegas.
 *  12. GUARD ANTI-PROD: todo script de `scripts/` que maneje `--apply` importa el guard
 *      (`scripts/lib/guard.ts` → resolverApply/assertProdWriteAllowed), `prisma.config.ts`
 *      llama a `guardPrismaCli` (el chokepoint del CLI de Prisma — en v7 `db execute` y
 *      `migrate *` NO aceptan URL por flag, la leen SOLO del config), los seeds de
 *      `prisma/` corren el guard incondicional, y `scripts/lib/db.ts` imprime el destino.
 *  13. Ninguna empresa de HubSpot que Nexus guarda quedó FUSIONADA. Al fusionar dos empresas,
 *      la perdedora sigue respondiendo por su id —devuelve los datos del sobreviviente— pero
 *      sus ASOCIACIONES se mudaron. Nexus, que descubre los proyectos preguntando "¿qué cuelga
 *      de esta empresa?", pregunta sobre una lápida y recibe cero: el síntoma es "creé un
 *      proyecto en HubSpot y no aparece", con una causa que no se parece en nada al efecto.
 *      Es lo que convierte "correr un --apply por reflejo" en una decisión explícita
 *      (ALLOW_PROD_WRITE=1) contra la base que es PRODUCCIÓN.
 *  14. Ningún alta de proyecto lleva días a medio hacer. Un alta trabada es un proyecto que
 *      existe, se abre y se ve normal, pero NO cobra y no suma a la cartera de nadie.
 *  15. Cada (agentGroup, pipelineKey) resuelve a UN SOLO agente, en los grupos que se eligen por
 *      grupo (`GRUPOS_RESUELTOS_POR_TIPO`, hoy solo `handoff`). Con dos filas iguales, cuál corre
 *      lo decide el orden que devuelva Postgres: una Implementación de HubSpot se generaría con
 *      el prompt de Sitios web, sin error y sin log. Y un `pipelineKey` inválido —o puesto en un
 *      grupo que nadie resuelve por grupo— es un prompt que no usa nadie.
 *  16. El enriquecimiento de Meet no miente: ninguna sesión enriquecida antes de ocurrir,
 *      ningún transcript basura (<200 chars) contando como éxito, y ningún reintento muerto
 *      hace más de 7 días. (a) y (c) nacen en rojo a propósito hasta que el rescate drene.
 */
async function main(): Promise<number> {
  let violations = 0;

  // ── Inv 1 → lib/invariantes/sesiones.ts (B-07) ──
  violations += await reportar(INV1, prisma);

  // ── Inv 2: materialización fresca (resolvedClientId == categorize en vivo) ──
  try {
    const { changed } = await resolveAllSessions({ dryRun: true });
    if (changed !== 0) {
      violations++;
      console.error(`✗ INV2 VIOLADO: re-resolve cambiaría ${changed} sesiones (resolvedClientId desactualizado).`);
      console.error("  Corré: npx tsx scripts/backfill-resolved-client.ts --apply");
    } else {
      console.log("✓ INV2: resolvedClientId está fresco (dry-run changed=0).");
    }
  } catch (e) {
    // No es violación dura (puede ser HubSpot/DB caído): se reporta y se sigue.
    console.error("⚠ INV2 no verificable (¿HubSpot/DB caído?):", e instanceof Error ? e.message : e);
  }

  // ── Inv 3 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV3, prisma);

  // ── Inv 4: enums del cliente generado ⊆ enums de Postgres ──
  const dbEnums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'`;
  const dbByEnum = new Map<string, Set<string>>();
  for (const r of dbEnums) {
    if (!dbByEnum.has(r.typname)) dbByEnum.set(r.typname, new Set());
    dbByEnum.get(r.typname)!.add(r.enumlabel);
  }
  const missing: string[] = []; // el código conoce un valor que la DB no tiene → write reventaría
  const extra: string[] = []; // la DB tiene de más (drift de la otra PC sin mergear) → warning
  for (const [enumName, values] of Object.entries($Enums)) {
    const dbValues = dbByEnum.get(enumName);
    if (!dbValues) {
      missing.push(`${enumName} (enum entero ausente en la DB)`);
      continue;
    }
    for (const v of Object.values(values as Record<string, string>)) {
      if (!dbValues.has(v)) missing.push(`${enumName}.${v}`);
    }
    for (const v of dbValues) {
      if (!Object.values(values as Record<string, string>).includes(v)) extra.push(`${enumName}.${v}`);
    }
  }
  if (missing.length > 0) {
    violations++;
    console.error(`✗ INV4 VIOLADO: el cliente Prisma conoce ${missing.length} valor(es) de enum que la DB NO tiene — un write con ellos falla:`);
    for (const m of missing.slice(0, 15)) console.error(`    - ${m}`);
    console.error("  Aplicá el .sql pendiente de scripts/sql/ (o escribilo: DDL ADITIVO a mano, nunca db push),");
    console.error("  después `npx prisma generate` y reiniciá el dev server. Ver ARCHITECTURE.md Parte 0 · cap. D.");
  } else {
    console.log(`✓ INV4: los ${Object.keys($Enums).length} enums del cliente generado existen completos en la DB.`);
  }
  if (extra.length > 0) {
    console.warn(`⚠ INV4 (no bloquea): la DB tiene ${extra.length} valor(es) de enum que este cliente no conoce (¿drift de la otra PC sin mergear?): ${extra.slice(0, 8).join(", ")}`);
  }

  // ── Inv 5 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV5, prisma);

  // ── Inv 6: ningún `new Pool(` sin `max:` (post-mortem EMAXCONNSESSION jul-2026:
  //    el default de pg es max:10 y el pooler de Supabase da ~15 slots COMPARTIDOS
  //    entre prod + 2 PCs + scripts — un pool sin presupuesto tumba producción).
  //    DURO en lib/ y app/ (runtime: el único pool legítimo es lib/db/prisma.ts);
  //    ADVERTENCIA en scripts/ (los one-off legacy quedan; los nuevos deben usar
  //    scripts/lib/db.ts → createScriptDb/createScriptPool). ──
  const scanPoolWithoutMax = (dir: string): string[] => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(d, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|mts)$/.test(name)) continue;
        const src = readFileSync(full, "utf8");
        let idx = src.indexOf("new Pool(");
        while (idx !== -1) {
          // `max:` debe aparecer dentro de la config del Pool (ventana de 400 chars).
          if (!src.slice(idx, idx + 400).includes("max:")) { hits.push(full); break; }
          idx = src.indexOf("new Pool(", idx + 1);
        }
      }
    };
    walk(dir);
    return hits;
  };
  // ── Inv 7: COLUMNAS del schema ⊆ columnas de Postgres (hermano de INV4) ──────────
  //
  // INV4 cubre los enums; esto cubre las columnas, que es la MISMA clase de deriva y
  // pega más fuerte: con una columna que el cliente conoce y la DB no, Prisma revienta
  // TODA lectura del modelo —no solo los writes— con un mensaje que ni siquiera nombra
  // la columna ("The column `(not available)` does not exist"). Una sección entera de la
  // app se cae. Pasó el 2026-07-27 con `Client.logoDarkUrl`/`logoScale`: el SQL quedó sin
  // aplicar y /clients dejó de cargar; nada lo había avisado.
  //
  // Se parsea `prisma/schema.prisma` y no el dmmf porque el dmmf de este setup viene
  // VACÍO (ver la nota de INV4). El texto del schema es exactamente lo que `generate`
  // convierte en el cliente, así que sirve igual.
  const schemaSrc = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const modelos = new Map<string, { tabla: string; columnas: string[] }>();
  for (const m of schemaSrc.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    modelos.set(m[1], { tabla: m[1], columnas: [] });
    const cuerpo = m[2];
    const mapTabla = cuerpo.match(/@@map\("([^"]+)"\)/);
    if (mapTabla) modelos.get(m[1])!.tabla = mapTabla[1];
    for (const linea of cuerpo.split("\n")) {
      const f = linea.trim().match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      // Atributos de bloque (@@index, @@unique…) y líneas sueltas no son campos.
      if (!f || linea.trim().startsWith("@@") || linea.trim().startsWith("//")) continue;
      const [, campo, tipo, esLista, , resto] = f;
      // Las RELACIONES no son columnas: su tipo es otro modelo, o traen @relation.
      if (resto.includes("@relation") || (esLista && !resto.includes("@"))) continue;
      modelos.get(m[1])!.columnas.push(`${campo}\u0000${tipo}\u0000${resto}`);
    }
  }
  // Segunda pasada: recién ahora se conocen TODOS los modelos, así que se puede decidir
  // si el tipo de un campo es un modelo (relación) o un escalar/enum (columna).
  const esperadas = new Map<string, Set<string>>();
  for (const info of modelos.values()) {
    const cols = new Set<string>();
    for (const raw of info.columnas) {
      const [campo, tipo, resto] = raw.split("\u0000");
      if (modelos.has(tipo)) continue; // relación
      const map = resto.match(/@map\("([^"]+)"\)/);
      cols.add(map ? map[1] : campo);
    }
    if (cols.size > 0) esperadas.set(info.tabla, cols);
  }
  const colsDb = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
  const dbPorTabla = new Map<string, Set<string>>();
  for (const r of colsDb) {
    if (!dbPorTabla.has(r.table_name)) dbPorTabla.set(r.table_name, new Set());
    dbPorTabla.get(r.table_name)!.add(r.column_name);
  }
  const colsFaltantes: string[] = [];
  for (const [tabla, cols] of esperadas) {
    const enDb = dbPorTabla.get(tabla);
    if (!enDb) { colsFaltantes.push(`${tabla} (tabla entera ausente)`); continue; }
    for (const c of cols) if (!enDb.has(c)) colsFaltantes.push(`${tabla}.${c}`);
  }
  if (colsFaltantes.length > 0) {
    violations++;
    console.error(`✗ INV7 VIOLADO: el schema declara ${colsFaltantes.length} columna(s) que la DB NO tiene — CUALQUIER lectura de ese modelo revienta:`);
    for (const c of colsFaltantes.slice(0, 15)) console.error(`    - ${c}`);
    console.error("  Aplicá el SQL pendiente de scripts/sql/ (`npx prisma db execute --file <archivo>`) y `npx prisma generate`. NUNCA `db push`.");
  } else {
    console.log(`✓ INV7: las columnas de los ${esperadas.size} modelos del schema existen todas en la DB.`);
  }

  const runtimePools = [...scanPoolWithoutMax(join(process.cwd(), "lib")), ...scanPoolWithoutMax(join(process.cwd(), "app"))];
  const scriptPools = scanPoolWithoutMax(join(process.cwd(), "scripts")).filter(
    (f) => !f.replace(/\\/g, "/").endsWith("scripts/lib/db.ts"),
  );
  if (runtimePools.length > 0) {
    violations++;
    console.error(`✗ INV6 VIOLADO: ${runtimePools.length} archivo(s) de RUNTIME crean new Pool( sin max: (default 10 → agota el pooler compartido):`);
    for (const f of runtimePools) console.error(`    - ${f}`);
    console.error("  El único pool de runtime legítimo es lib/db/prisma.ts (POOL_MAX por entorno).");
  } else {
    console.log("✓ INV6: ningún pool de runtime sin presupuesto (max:).");
  }
  if (scriptPools.length > 0) {
    console.warn(
      `⚠ INV6 (no bloquea): ${scriptPools.length} script(s) con new Pool( sin max: — legacy one-off tolerado; scripts NUEVOS deben usar scripts/lib/db.ts (createScriptDb, max:2).`,
    );
  }

  // ── Inv 8 (a/b) y 8c → lib/invariantes/proyectos.ts (B-07) ──
  violations += await reportar(INV8, prisma);
  violations += await reportar(INV8c, prisma);

  // ── Inv 9: el fragmento SQL y el predicado en memoria coinciden SOBRE LOS DATOS REALES ──
  // scope.test.ts prueba la LÓGICA con filas sintéticas; esto la prueba con las filas que
  // de verdad hay, que es donde aparecen las combinaciones que nadie inventó.
  {
    const { esProyectoDeCartera, esProyectoFacturable, esProyectoNavegable, esProyectoClasificable,
      PROYECTO_DE_CARTERA_WHERE, PROYECTO_FACTURABLE_WHERE, PROYECTO_NAVEGABLE_WHERE,
      PROYECTO_CLASIFICABLE_WHERE } = await import("@/lib/projects/scope");

    const todos = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        serviceType: true,
        hubspotServiceId: true,
        hubspotPipelineId: true,
        proyectoInterno: true,
        hermanoCsProjectId: true,
        altaEstado: true,
        client: { select: { name: true, hubspotCompanyId: true, hubspotAccount: { select: { id: true } } } },
      },
    });

    const casos = [
      { nombre: "navegable", where: PROYECTO_NAVEGABLE_WHERE, pred: esProyectoNavegable },
      { nombre: "cartera", where: PROYECTO_DE_CARTERA_WHERE, pred: esProyectoDeCartera },
      { nombre: "facturable", where: PROYECTO_FACTURABLE_WHERE, pred: esProyectoFacturable },
      {
        nombre: "clasificable",
        where: PROYECTO_CLASIFICABLE_WHERE,
        pred: (p: Parameters<typeof esProyectoClasificable>[0]) => esProyectoClasificable(p),
      },
    ];

    let drift = 0;
    for (const caso of casos) {
      const porSql = new Set(
        (await prisma.project.findMany({ where: caso.where, select: { id: true } })).map((p) => p.id),
      );
      const porMemoria = new Set(
        todos
          .filter((p) =>
            caso.pred(p, {
              hubspotCompanyId: p.client.hubspotCompanyId,
              tieneHubspotAccount: !!p.client.hubspotAccount,
            }),
          )
          .map((p) => p.id),
      );
      const soloSql = [...porSql].filter((id) => !porMemoria.has(id));
      const soloMem = [...porMemoria].filter((id) => !porSql.has(id));
      if (soloSql.length || soloMem.length) {
        drift++;
        console.error(
          `✗ INV9 (${caso.nombre}): SQL=${porSql.size} memoria=${porMemoria.size} — ` +
            `${soloSql.length} solo en SQL, ${soloMem.length} solo en memoria`,
        );
        for (const id of [...soloSql, ...soloMem].slice(0, 5)) {
          const p = todos.find((x) => x.id === id);
          console.error(`    - ${p?.client.name} · "${p?.name}"`);
        }
      }
    }
    if (drift > 0) {
      violations++;
      console.error(
        "  El filtro de proyectos dice una cosa en SQL y otra en memoria. En SQL un predicado " +
          "NULL descarta la fila; en JavaScript no. Escribí la condición en POSITIVO (lib/projects/scope.ts).",
      );
    } else {
      console.log("✓ INV9: los 4 criterios de alcance coinciden en SQL y en memoria.");
    }
  }

  // ── Inv 10 → lib/invariantes/proyectos.ts (B-07) ──
  violations += await reportar(INV10, prisma);

  // ── Inv 11 → lib/invariantes/proyectos.ts (B-07) ──
  violations += await reportar(INV11, prisma);

  // ── Inv 12: el guard anti-prod está cableado en TODOS los caminos de escritura ─────
  //
  // La base es PRODUCCIÓN (invariante #3 de CLAUDE.md): un `--apply` corrido por reflejo
  // escribe sobre datos reales. Este invariante es DURO desde el día 1 (deuda inicial 0:
  // el sweep de la misma tanda migró los 60 scripts) y verifica cuatro cosas:
  //   (a) todo scripts/**/*.ts que maneje `--apply` —o escriba SQL crudo con verbo de
//       escritura (A-09)— usa el guard (resolverApply /
  //       assertProdWriteAllowed) — allowlist para los 2 reporters read-only que solo
  //       IMPRIMEN comandos de remediación con --apply;
  //   (b) prisma.config.ts llama a guardPrismaCli (chokepoint del CLI de Prisma);
  //   (c) scripts/lib/db.ts imprime el destino (imprimirDestino);
  //   (d) los seeds de prisma/ corren assertProdWriteAllowed incondicional.
  const norm = (p: string) => p.replace(/\\/g, "/");
  const ALLOWLIST_INV12 = new Set([
    "scripts/check-invariants.ts", // este archivo: menciona --apply solo en mensajes
    "scripts/verify-rls-anon.ts", // read-only: imprime la remediación con --apply
    "scripts/lib/guard.ts", // el guard mismo
    // Manager de la base LOCAL: el "--apply" que contiene es el argv que le PASA a los
    // seeds del catálogo (F3), y toda URL que construye es urlDe() = localhost:5433 —
    // jamás lee DATABASE_URL para escribir. Los seeds que lanza sí corren su guard.
    "scripts/local-db.ts",
    // Copia contexto real de prod a la base local (F3+): el "--apply" controla si
    // ESCRIBE en el DESTINO, que es un literal hardcodeado (localhost:5433/nexus_local,
    // nunca DATABASE_URL) gateado por assertLocalWriteOnly — mismo candado que
    // seed-fixture.ts, solo que además referenciado por nombre distinto (createScriptDbFor)
    // porque habla con DOS bases a la vez. La LECTURA de prod no está gateada (leer no es
    // peligroso — doctrina del guard), y el script exige por su cuenta que la fuente SEA prod.
    "scripts/local-pull-context.ts",
  ]);
  const USA_GUARD = /resolverApply|assertProdWriteAllowed/;
  const sinGuard: string[] = [];
  const walkGuard = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walkGuard(full);
        continue;
      }
      if (!/\.(ts|mts)$/.test(name)) continue;
      const rel = norm(full).replace(norm(process.cwd()) + "/", "");
      if (ALLOWLIST_INV12.has(rel)) continue;
      const src = readFileSync(full, "utf8");
      // A-09 (auditoría 2026-09-03): también el SQL crudo con verbo de escritura (pool/client.query
      // con INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE), tenga o no `--apply`. Los tres scripts
      // de la migración de roles hacían ALTER/UPDATE sin guard y sin `--apply`: INV12 no los veía.
      // El verbo decide: un script de solo SELECT (inspect-delivery-sessions.ts) no cuenta.
      if ((src.includes("--apply") || escribeSqlCrudo(src)) && !USA_GUARD.test(src)) sinGuard.push(rel);
    }
  };
  walkGuard(join(process.cwd(), "scripts"));

  const configSrc = readFileSync(join(process.cwd(), "prisma.config.ts"), "utf8");
  const dbSrc = readFileSync(join(process.cwd(), "scripts", "lib", "db.ts"), "utf8");
  const seedsSinGuard = readdirSync(join(process.cwd(), "prisma"))
    .filter((f) => /^seed.*\.ts$/.test(f))
    .filter((f) => !USA_GUARD.test(readFileSync(join(process.cwd(), "prisma", f), "utf8")));

  const problemasInv12: string[] = [];
  if (sinGuard.length > 0)
    problemasInv12.push(
      `${sinGuard.length} script(s) con --apply SIN el guard: ${sinGuard.slice(0, 10).join(", ")}${sinGuard.length > 10 ? " …" : ""}`,
    );
  if (!configSrc.includes("guardPrismaCli"))
    problemasInv12.push("prisma.config.ts no llama a guardPrismaCli (el CLI de Prisma quedó sin chokepoint)");
  if (!dbSrc.includes("imprimirDestino"))
    problemasInv12.push("scripts/lib/db.ts no imprime el destino (imprimirDestino)");
  if (seedsSinGuard.length > 0)
    problemasInv12.push(`seed(s) de prisma/ sin guard incondicional: ${seedsSinGuard.join(", ")}`);

  if (problemasInv12.length > 0) {
    violations++;
    console.error("✗ INV12 VIOLADO: el guard anti-prod tiene huecos:");
    for (const p of problemasInv12) console.error(`    - ${p}`);
    console.error("  Importá scripts/lib/guard.ts: `const APPLY = resolverApply()` en scripts con --apply,");
    console.error("  `assertProdWriteAllowed()` en seeds que escriben siempre.");
  } else {
    console.log("✓ INV12: el guard anti-prod cubre scripts --apply, el SQL crudo de escritura, el CLI de Prisma y los seeds.");
  }

  // ── Inv 13: ninguna empresa guardada quedó fusionada en HubSpot ─────────────
  //
  // El ÚNICO invariante que hace llamadas HTTP explícitas a HubSpot, y por eso se hace en
  // LOTE: `batch/read` acepta 100 ids, así que los ~158 clientes se revisan en 2 llamadas en
  // vez de 158 (medido contra producción). Sin el lote esto sumaría un minuto a un comando
  // que corre antes de cada commit, y un gate que tarda es un gate que se saltea.
  //
  // Molde de INV2: TODO envuelto en try/catch, y una caída de HubSpot imprime "no verificable"
  // SIN contar violación. Un portal caído no puede pintar el gate en rojo.
  try {
    /* Los DOS lugares donde vive un id de empresa. `BusinessCase.hubspotCompanyId` es una copia
       denormalizada que se estampa al crear el BC y que nadie cascadea: mirar solo `Client`
       dejaría el invariante EN VERDE con una lápida viva en la otra tabla. */
    const [clientes, bcs] = await Promise.all([
      prisma.client.findMany({
        where: { hubspotCompanyId: { not: null } },
        select: { name: true, hubspotCompanyId: true },
      }),
      prisma.businessCase.findMany({
        where: { hubspotCompanyId: { not: null } },
        select: { name: true, hubspotCompanyId: true },
      }),
    ]);
    const conEmpresa = [
      ...clientes.map((c) => ({ name: c.name, hubspotCompanyId: c.hubspotCompanyId })),
      ...bcs.map((b) => ({ name: `BC «${b.name}»`, hubspotCompanyId: b.hubspotCompanyId })),
    ];
    if (conEmpresa.length === 0) {
      console.log("✓ INV13: no hay clientes con empresa de HubSpot que revisar.");
    } else {
      const hs = await getSystemHubspotClient();
      const veredictos = await detectarFusionesEnLote(
        hs,
        conEmpresa.map((c) => c.hubspotCompanyId!),
      );
      const fusionadas = conEmpresa
        .map((c) => ({ c, v: veredictos.get(c.hubspotCompanyId!) }))
        .filter((x) => x.v?.estado === "fusionada");
      const ilegibles = [...veredictos.values()].filter((v) => v.estado === "ilegible").length;

      if (fusionadas.length > 0) {
        violations++;
        console.error(
          `✗ INV13 VIOLADO: ${fusionadas.length} cliente(s) apuntan a una empresa FUSIONADA ` +
            `(sus proyectos viven en el sobreviviente y Nexus no los ve).`,
        );
        for (const { c, v } of fusionadas.slice(0, 10)) {
          const dest = v?.estado === "fusionada" ? v.idSobreviviente : "?";
          console.error(`    - ${c.name}: guarda ${c.hubspotCompanyId} → sobreviviente ${dest}`);
        }
        if (fusionadas.length > 10) console.error(`    … y ${fusionadas.length - 10} más`);
        console.error("  Corré: npx tsx scripts/reapuntar-empresa-fusionada.ts --apply");
      } else {
        console.log(
          `✓ INV13: las empresas guardadas siguen vigentes ` +
            `(${clientes.length} cliente(s) + ${bcs.length} business case(s), ` +
            `${new Set(conEmpresa.map((x) => x.hubspotCompanyId)).size} empresa(s) distintas).`,
        );
      }
      // Se REPORTA aparte y no cuenta: un id ilegible puede ser de otro portal o un 429, y
      // ninguno de los dos es una fusión. Pero callarlo dejaría al invariante ciego sin avisar.
      if (ilegibles > 0) {
        console.warn(`⚠ INV13 (no bloquea): ${ilegibles} empresa(s) no se pudieron verificar.`);
      }
    }
  } catch (e) {
    console.error("⚠ INV13 no verificable (¿HubSpot caído o sin cuenta del sistema?):", e instanceof Error ? e.message : e);
  }

  // ── Inv 14 → lib/invariantes/proyectos.ts (B-07) ──
  violations += await reportar(INV14, prisma);

  // ── Inv 15: un solo agente por (grupo, tipo de proyecto) ──
  /**
   * ── POR QUÉ, Y QUÉ ACCIDENTE IMPIDE ─────────────────────────────────────────
   * Un `agentGroup` puede tener varias filas: una genérica (`pipelineKey: null`) y una por tipo
   * de proyecto. `elegirAgente` (lib/agents/resolver.ts) prefiere la específica y CAE a la
   * genérica — y ese fallback es lo que garantiza que una Implementación de HubSpot siga
   * resolviendo exactamente el mismo agente de siempre.
   *
   * Ese diseño se rompe en silencio de tres maneras, y las tres las caza este invariante:
   *
   *  · DOS filas con el MISMO (grupo, pipelineKey) → cuál gana depende del orden que devuelva
   *    Postgres. Es el accidente exacto que el resolver vino a matar: antes había un
   *    `findFirst` sin `orderBy` que era determinista solo porque existía UNA fila.
   *  · Un `pipelineKey` que NO es una key declarada en `PROJECT_PIPELINES` (un typo, un pipeline
   *    que se renombró) → el resolver lo ignora y ese agente NUNCA se usa. No falla, no loguea:
   *    simplemente el trabajo de escribir su prompt no sirve para nada.
   *  · Un `pipelineKey` en un grupo que NADIE resuelve por grupo → mismo desenlace: el prompt
   *    existe, alguien lo escribió, y el navegador sigue disparando el agente por su id.
   *
   * ⚠ EL ALCANCE ES UNA LISTA (`GRUPOS_RESUELTOS_POR_TIPO`), NO «TODOS LOS GRUPOS», Y ES LO QUE
   * HACE QUE ESTE INVARIANTE SIRVA. Medido el 2026-08-07: `cobranza`, `cronograma`, `cs-watchdog`,
   * `diagnostico` y `preparacion` tienen 2 o 3 agentes ACTIVE **correctos** —el navegador los
   * dispara por id, no por grupo—. Un invariante que exigiera «uno por grupo» habría nacido rojo
   * sobre datos sanos, y un invariante que nace rojo se apaga.
   *
   * ⚠ NO se exige que exista la fila genérica de cada grupo: un grupo con un solo agente específico
   * es válido. Lo que no puede haber es ambigüedad.
   */
  const agentesConGrupo = await prisma.agent.findMany({
    where: { agentGroup: { not: null }, status: "ACTIVE" },
    select: { id: true, name: true, agentGroup: true, pipelineKey: true },
    orderBy: [{ agentGroup: "asc" }, { name: "asc" }],
  });
  const KEYS_VALIDAS = new Set<string>(PROJECT_PIPELINES.map((p) => p.key));
  const RESUELTOS = new Set<string>(GRUPOS_RESUELTOS_POR_TIPO);
  const ambiguos = new Map<string, typeof agentesConGrupo>();
  const keysInvalidas: typeof agentesConGrupo = [];
  const tipoEnGrupoQueNadieResuelve: typeof agentesConGrupo = [];
  for (const a of agentesConGrupo) {
    if (a.pipelineKey !== null && !KEYS_VALIDAS.has(a.pipelineKey)) keysInvalidas.push(a);
    if (a.pipelineKey !== null && !RESUELTOS.has(a.agentGroup!)) tipoEnGrupoQueNadieResuelve.push(a);
    if (!RESUELTOS.has(a.agentGroup!)) continue;
    const par = `${a.agentGroup} / ${a.pipelineKey ?? "(todos)"}`;
    ambiguos.set(par, [...(ambiguos.get(par) ?? []), a]);
  }
  const duplicados = [...ambiguos.entries()].filter(([, xs]) => xs.length > 1);

  if (duplicados.length > 0 || keysInvalidas.length > 0 || tipoEnGrupoQueNadieResuelve.length > 0) {
    violations++;
    if (duplicados.length > 0) {
      console.error(
        `✗ INV15 VIOLADO: ${duplicados.length} par(es) (grupo, tipo) con MÁS DE UN agente activo. ` +
          `Cuál corre depende del orden que devuelva Postgres.`,
      );
      for (const [par, xs] of duplicados.slice(0, 10)) {
        console.error(`    - ${par}: ${xs.map((x) => `"${x.name}"`).join(" · ")}`);
      }
    }
    if (keysInvalidas.length > 0) {
      console.error(
        `✗ INV15 VIOLADO: ${keysInvalidas.length} agente(s) con un pipelineKey que no existe en ` +
          `PROJECT_PIPELINES. El resolver los ignora: su prompt no lo usa nadie.`,
      );
      for (const a of keysInvalidas.slice(0, 10)) {
        console.error(`    - "${a.name}" (${a.agentGroup}): pipelineKey="${a.pipelineKey}"`);
      }
      console.error(`  Válidas: ${[...KEYS_VALIDAS].join(" · ")} o NULL (sirve para todos).`);
    }
    if (tipoEnGrupoQueNadieResuelve.length > 0) {
      console.error(
        `✗ INV15 VIOLADO: ${tipoEnGrupoQueNadieResuelve.length} agente(s) con pipelineKey en un ` +
          `grupo que NADIE resuelve por grupo. Ese prompt es trabajo muerto.`,
      );
      for (const a of tipoEnGrupoQueNadieResuelve.slice(0, 10)) {
        console.error(`    - "${a.name}" (${a.agentGroup}): pipelineKey="${a.pipelineKey}"`);
      }
      console.error(
        `  Grupos resueltos por tipo: ${GRUPOS_RESUELTOS_POR_TIPO.join(" · ")} ` +
          `(lib/agents/resolver.ts). Si el grupo se cableó al resolver, sumalo a esa lista.`,
      );
    }
  } else {
    const enAlcance = agentesConGrupo.filter((a) => RESUELTOS.has(a.agentGroup!));
    const conTipo = enAlcance.filter((a) => a.pipelineKey !== null).length;
    console.log(
      `✓ INV15: cada (grupo, tipo) resuelve a un solo agente ` +
        `(${enAlcance.length} activos en los ${RESUELTOS.size} grupo(s) resueltos por tipo, ` +
        `${conTipo} con tipo propio; ${agentesConGrupo.length} activos con grupo en total).`,
    );
  }

  // ── Inv 16: el enriquecimiento de Meet no miente ──
  /**
   * ── POR QUÉ, Y QUÉ INCIDENTE RECUERDA ───────────────────────────────────────
   * El pipeline de Google Meet sellaba TODO como definitivo: un fallo de lectura se tragaba
   * en un catch mudo y la fila quedaba `enrichedAt` para siempre (corridas quemadas del
   * 17-may: 528/1100, y 7-jul: 47/73). Desde el 2026-08-08 el fallo queda pendiente con su
   * error en `enrichError` y lo drena el job `google-enrich-retry`. Este invariante vigila
   * las tres formas en que ese diseño se pudre:
   *
   *  (a) Una sesión enriquecida ANTES de ocurrir → el filtro de fecha se cayó (o es una fila
   *      legacy que el rescate todavía no tocó).
   *  (c) Un transcript no-nulo de menos de 200 chars → la plantilla vacía volvió a contar
   *      como éxito.
   *  (b) Un reintento con más de 7 días sin moverse → el job murió y nadie lo notó.
   *
   * ⚠ (a) y (c) NACEN EN ROJO A PROPÓSITO: cuentan la basura legacy que el script de rescate
   * (`scripts/recuperar-transcripts-meet.ts`) va a drenar. Que se pongan en verde ES el
   * marcador de que la recuperación terminó — no los silencies antes de eso.
   */
  const [antesDeOcurrir, transcriptsBasura] = await Promise.all([
    prisma.firefliesSession.count({
      where: { source: "google_meet", enrichedAt: { not: null }, date: { gt: new Date() } },
    }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM "FirefliesSession"
      WHERE transcript IS NOT NULL AND length(transcript) < 200
    `.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  const reintentos = await prisma.firefliesSession.findMany({
    where: { enrichedAt: null, enrichAttempts: { gte: 1 } },
    select: { id: true, enrichAttempts: true, enrichError: true },
  });
  const SIETE_DIAS_MS = 7 * 24 * 3_600_000;
  const reintentosMuertos = reintentos.filter((r) => {
    try {
      const at = Date.parse((JSON.parse(r.enrichError ?? "{}") as { at?: string }).at ?? "");
      return Number.isNaN(at) || Date.now() - at > SIETE_DIAS_MS;
    } catch {
      return true;
    }
  });

  if (antesDeOcurrir > 0 || transcriptsBasura > 0 || reintentosMuertos.length > 0) {
    violations++;
    if (antesDeOcurrir > 0) {
      console.error(
        `✗ INV16(a) VIOLADO: ${antesDeOcurrir} sesión(es) de Meet enriquecidas ANTES de ocurrir. ` +
          `Legacy → scripts/recuperar-transcripts-meet.ts; nuevas → se cayó el filtro de fecha.`,
      );
    }
    if (transcriptsBasura > 0) {
      console.error(
        `✗ INV16(c) VIOLADO: ${transcriptsBasura} transcript(s) de menos de 200 chars — plantilla ` +
          `contando como éxito. Rojo esperado hasta drenar el bucket C del rescate.`,
      );
    }
    if (reintentosMuertos.length > 0) {
      console.error(
        `✗ INV16(b) VIOLADO: ${reintentosMuertos.length} reintento(s) sin moverse hace más de 7 días ` +
          `(de ${reintentos.length} en cola) — ¿el job google-enrich-retry está corriendo?`,
      );
    }
  } else {
    console.log(
      `✓ INV16: enriquecimiento de Meet sano (0 antes de ocurrir, 0 transcripts basura, ` +
        `${reintentos.length} en cola de reintento, ninguno muerto).`,
    );
  }

  /* ── INV17 · Todo CTA «Generar» apunta a un agente que EXISTE y está ACTIVE ──────
     El botón se dibuja desde un mapa ESTÁTICO (lib/agents/canvas-agents.ts): existe apenas
     se deploya el código. La fila del agente, en cambio, la crea un seed que alguien tiene que
     correr. Entre las dos cosas hay una ventana en la que el botón se ve, se aprieta y **no
     hace nada** — y hasta hoy encima decía «Listo».
     Pasó con Entrega el 2026-08-13. El mismo agujero se lo comieron antes los dos agentes de
     handoff por tipo, que quedaron en DRAFT en producción hasta que alguien los activó a mano.
     Este chequeo lo convierte en una línea roja del gate post-deploy, que es donde se mira. */
  const idsDeCta = [...new Set(Object.values(CANVAS_PRIMARY_AGENT).map((d) => d.agentId))];
  const filasDeCta = await prisma.agent.findMany({
    where: { id: { in: idsDeCta } },
    select: { id: true, status: true },
  });
  const estadoDelCta = new Map(filasDeCta.map((a) => [a.id, a.status as string]));
  const rotos = idsDeCta
    .map((id) => ({ id, status: estadoDelCta.get(id) }))
    .filter((x) => x.status !== "ACTIVE");

  if (rotos.length > 0) {
    violations++;
    console.error(
      `✗ INV17 VIOLADO: ${rotos.length} botón(es) «Generar» apuntan a un agente que no puede correr. ` +
        `El CTA se ve igual y no hace nada.`,
    );
    for (const r of rotos) {
      console.error(`    - ${r.id}: ${r.status ? `está en ${r.status}` : "NO EXISTE en la base"}`);
      console.error(`      Corré su seed: npx tsx scripts/seed-${r.id.replace(/^agent-|-canvas$/g, "")}-agent.ts`);
    }
  } else {
    console.log(`✓ INV17: los ${idsDeCta.length} botones «Generar» apuntan a agentes activos.`);
  }

  // ── Inv 18 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV18, prisma);

  // ── Inv 20 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV20, prisma);

  // ── Inv 21 → lib/invariantes/sesiones.ts (B-07) ──
  violations += await reportar(INV21, prisma);

  // ── Inv 22 → lib/invariantes/cronograma.ts (B-07) ──
  violations += await reportar(INV22, prisma);

  // ── Inv 23 → lib/invariantes/odoo.ts (B-07) ──
  violations += await reportar(INV23, prisma);

  // ── Inv 24 → lib/invariantes/odoo.ts (B-07) ──
  violations += await reportar(INV24, prisma);

  // ── Inv 25 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV25, prisma);

  // ── Inv 26 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV26, prisma);

  // ── Inv 27 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV27, prisma);

  // ── Inv 28 → lib/invariantes/cobranza.ts (B-07) ──
  violations += await reportar(INV28, prisma);

  return violations;
}

main()
  .then(async (v) => {
    console.log(v === 0 ? "\n✅ Invariantes OK." : `\n❌ ${v} invariante(s) violado(s).`);
    await prisma.$disconnect();
    process.exit(v === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
