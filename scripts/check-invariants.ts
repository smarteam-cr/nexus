import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $Enums } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

/**
 * scripts/check-invariants.ts — BLINDAJE DURO de los invariantes medulares de Nexus.
 * Exit ≠0 si alguno se viola. Lo invoca la skill /ship antes de commitear, y se puede
 * correr a mano: `npx tsx scripts/check-invariants.ts` (o `npm run check:invariants`).
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
 */
async function main(): Promise<number> {
  let violations = 0;

  // ── Inv 1: ningún SessionProject cruza cliente ──
  const links = await prisma.sessionProject.findMany({
    select: {
      project: { select: { clientId: true } },
      session: { select: { id: true, title: true, resolvedClientId: true, manualClientId: true } },
    },
  });
  const cross = links.filter((l) => {
    const pc = l.project.clientId;
    const { resolvedClientId: r, manualClientId: m } = l.session;
    return r !== null && pc !== r && pc !== m;
  });
  if (cross.length > 0) {
    violations++;
    console.error(`✗ INV1 VIOLADO: ${cross.length} SessionProject cruzan cliente (contexto de un cliente alimentaría a otro).`);
    console.error("  Corré: npx tsx scripts/cleanup-cross-client-session-projects.ts --apply");
    for (const l of cross.slice(0, 10)) console.error(`    - "${l.session.title}" (${l.session.id})`);
  } else {
    console.log("✓ INV1: ningún SessionProject cruza cliente.");
  }

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

  // ── Inv 3: ningún Cobro COBRADO sin confirmadoPor (Cobranza — el humano confirma
  //    lo que mueve dinero; chokepoint: lib/cobranza/mutations.ts#cambiarEstadoCobro) ──
  const cobradosSinConfirmar = await prisma.cobro.count({
    where: { estado: "COBRADO", confirmadoPor: null },
  });
  if (cobradosSinConfirmar > 0) {
    violations++;
    console.error(
      `✗ INV3 VIOLADO: ${cobradosSinConfirmar} Cobro(s) en estado COBRADO sin confirmadoPor (¿alguien escribió estado sin pasar por el chokepoint?).`,
    );
  } else {
    console.log("✓ INV3: todo Cobro COBRADO tiene confirmadoPor.");
  }

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
    console.error('  Corré `npm run db:sync` (¡nunca `db push` solo!) y reiniciá el server. Ver ARCHITECTURE.md ("migraciones silenciosas").');
  } else {
    console.log(`✓ INV4: los ${Object.keys($Enums).length} enums del cliente generado existen completos en la DB.`);
  }
  if (extra.length > 0) {
    console.warn(`⚠ INV4 (no bloquea): la DB tiene ${extra.length} valor(es) de enum que este cliente no conoce (¿drift de la otra PC sin mergear?): ${extra.slice(0, 8).join(", ")}`);
  }

  // ── Inv 5: ningún Cobro con fechaEmision sin facturadoPor (espejo de INV3 — Tanda B) ──
  const facturadosSinAutoria = await prisma.cobro.count({
    where: { fechaEmision: { not: null }, facturadoPor: null },
  });
  if (facturadosSinAutoria > 0) {
    violations++;
    console.error(
      `✗ INV5 VIOLADO: ${facturadosSinAutoria} Cobro(s) con fechaEmision sin facturadoPor (¿alguien escribió fechaEmision sin pasar por el chokepoint?).`,
    );
  } else {
    console.log("✓ INV5: todo Cobro con fechaEmision tiene facturadoPor.");
  }

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
      modelos.get(m[1])!.columnas.push(`${campo} ${tipo} ${resto}`);
    }
  }
  // Segunda pasada: recién ahora se conocen TODOS los modelos, así que se puede decidir
  // si el tipo de un campo es un modelo (relación) o un escalar/enum (columna).
  const esperadas = new Map<string, Set<string>>();
  for (const info of modelos.values()) {
    const cols = new Set<string>();
    for (const raw of info.columnas) {
      const [campo, tipo, resto] = raw.split(" ");
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
