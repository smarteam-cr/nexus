import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $Enums } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { buscarEtapa, resolvePipeline } from "@/lib/projects/kind";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { detectarFusionesEnLote } from "@/lib/hubspot/empresa-fusionada";

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
    console.error("  Aplicá el .sql pendiente de scripts/sql/ (o escribilo: DDL ADITIVO a mano, nunca db push),");
    console.error("  después `npx prisma generate` y reiniciá el dev server. Ver ARCHITECTURE.md Parte 0 · cap. D.");
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

  // ── Inv 8: el hermano de un proyecto está sano ──
  // Decide facturación, así que un vínculo torcido es plata mal contada.
  const conVinculo = await prisma.project.findMany({
    where: {
      OR: [{ hermanoCsProjectId: { not: null } }, { hubspotRelatedProjectIds: { isEmpty: false } }],
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      hubspotServiceId: true,
      hubspotPipelineId: true,
      hubspotRelatedProjectIds: true,
      hermanoCsProjectId: true,
      updatedAt: true,
      client: { select: { name: true } },
    },
  });
  const porId = new Map(conVinculo.map((p) => [p.id, p]));

  // 8a. Cruzar cliente. El resolvedor solo mira dentro del mismo cliente, así que esto solo
  // puede aparecer por un dato viejo o escrito a mano.
  const hermanosCruzados: string[] = [];
  // 8b. Hermano de sí mismo.
  const hermanosDeSiMismo: string[] = [];
  for (const p of conVinculo) {
    if (!p.hermanoCsProjectId) continue;
    if (p.hermanoCsProjectId === p.id) {
      hermanosDeSiMismo.push(`${p.client.name} · "${p.name}"`);
      continue;
    }
    const otro = porId.get(p.hermanoCsProjectId);
    // Si el hermano no está en este conjunto hay que traerlo aparte para saber su cliente.
    const clienteDelOtro =
      otro?.clientId ??
      (await prisma.project.findUnique({
        where: { id: p.hermanoCsProjectId },
        select: { clientId: true },
      }))?.clientId ??
      null;
    if (clienteDelOtro === null) {
      /* ⚠ Apunta a un proyecto que ya no existe. Acá decía que eso "degrada a aparte (se
         factura), que es el lado seguro" — y es FALSO, corregido el 2026-08-05: el criterio de
         cobranza `NO_ES_HERMANO_DE_CS` exige `hermanoCsProjectId === null`, y un puntero muerto
         NO es null. O sea que el proyecto **deja de facturar en silencio** hasta que el próximo
         sync recalcule los hermanos. Es lo contrario del lado seguro, y el operador que leía este
         mensaje se quedaba tranquilo. */
      hermanosCruzados.push(`${p.client.name} · "${p.name}" → apunta a un proyecto BORRADO`);
    } else if (clienteDelOtro !== p.clientId) {
      hermanosCruzados.push(`${p.client.name} · "${p.name}" → hermano de OTRO cliente`);
    }
  }
  if (hermanosCruzados.length > 0 || hermanosDeSiMismo.length > 0) {
    violations++;
    console.error(`✗ INV8: ${hermanosCruzados.length + hermanosDeSiMismo.length} hermano(s) mal resuelto(s):`);
    for (const s of [...hermanosCruzados, ...hermanosDeSiMismo]) console.error(`    - ${s}`);
    console.error("  Un hermano decide si el proyecto se factura. Revisar la asociación en HubSpot.");
  } else {
    console.log("✓ INV8a/b: ningún hermano cruza cliente ni es hermano de sí mismo.");
  }

  // 8c. Vínculos declarados que siguen sin resolver aunque el proyecto apuntado YA existe en
  // Nexus. Uno pendiente es normal (el hermano todavía no entró); uno pendiente con el
  // objetivo presente significa que `resolverHermanos` no corrió o falló.
  const idsHsPresentes = new Set(
    (
      await prisma.project.findMany({
        where: { hubspotServiceId: { not: null } },
        select: { hubspotServiceId: true, clientId: true, hubspotPipelineId: true },
      })
    )
      .filter((p) => p.hubspotPipelineId === "826270797")
      .map((p) => `${p.clientId}:${p.hubspotServiceId}`),
  );
  const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
  const pendientesResolubles = conVinculo.filter(
    (p) =>
      p.hermanoCsProjectId === null &&
      p.hubspotRelatedProjectIds.some((r) => idsHsPresentes.has(`${p.clientId}:${r}`)) &&
      Date.now() - p.updatedAt.getTime() > SIETE_DIAS,
  );
  if (pendientesResolubles.length > 0) {
    violations++;
    console.error(
      `✗ INV8c: ${pendientesResolubles.length} proyecto(s) con un vínculo declarado hace más de 7 días cuyo hermano SÍ existe en Nexus:`,
    );
    for (const p of pendientesResolubles) console.error(`    - ${p.client.name} · "${p.name}"`);
    console.error("  resolverHermanos() (lib/hubspot/sync-projects.ts) no está corriendo o falla.");
  } else {
    console.log("✓ INV8c: no hay hermanos resolubles sin resolver.");
  }

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

  // ── Inv 10: ningún proyecto sincronizado ACTIVO se quedó sin clase ──
  // Un proyecto con hubspotServiceId y sin hubspotPipelineId es uno que el sync escribió sin
  // decirle de qué pipeline viene. Mientras dura, se comporta como Customer Success.
  //
  // Se mira SOLO los activos, y no es para que el invariante pase: los cuatro criterios de
  // alcance (lib/projects/scope.ts) exigen `status: "active"`, así que un proyecto inactivo
  // no entra a cartera, ni a cobranza, ni al vigilante. La justificación de este invariante
  // no le aplica. Hoy eso deja afuera a 18 fantasmas de un portal de cliente al que ya no
  // tenemos acceso, que van a quedar en NULL para siempre y no molestan a nadie.
  //
  // El día de gracia cubre la ventana normal entre aplicar el SQL y correr el backfill.
  const UN_DIA = 24 * 60 * 60 * 1000;
  const sinClase = await prisma.project.findMany({
    where: {
      status: "active",
      hubspotServiceId: { not: null },
      hubspotPipelineId: null,
      updatedAt: { lt: new Date(Date.now() - UN_DIA) },
    },
    select: { name: true, status: true, client: { select: { name: true } } },
  });
  if (sinClase.length > 0) {
    violations++;
    console.error(
      `✗ INV10 VIOLADO: ${sinClase.length} proyecto(s) sincronizado(s) sin pipeline resuelto ` +
        `(se comportan como Customer Success: cartera, vigilante y cobranza).`,
    );
    for (const p of sinClase.slice(0, 10)) {
      console.error(`    - ${p.client.name} · "${p.name}" (${p.status})`);
    }
    if (sinClase.length > 10) console.error(`    … y ${sinClase.length - 10} más`);
    console.error("  Corré: npx tsx scripts/backfill-project-pipeline.ts --apply");
    console.error(
      "  Si el backfill los reporta como «no está en ese portal», el objeto de HubSpot ya no\n" +
        "  existe: el proyecto está de más en Nexus y va por la Zona de peligro de la ficha,\n" +
        "  no por el backfill.",
    );
  } else {
    console.log("✓ INV10: todo proyecto sincronizado tiene su pipeline resuelto.");
  }

  // ── Inv 11: ninguna etapa materializada ACTIVA quedó fuera de la tabla ──
  //
  // `PROJECT_PIPELINES[].stages` está TRANSCRITO a mano del portal. HubSpot deja agregar y
  // renombrar etapas desde la UI, y eso pasó: el 2026-07-30 aparecieron 4 etapas nuevas en el
  // pipeline de Customer Success y la tabla siguió verde todo el día con la versión vieja —
  // ningún test la miraba contra la realidad.
  //
  // Esta invariante cierra el lazo por el único lado que puede: si alguien MUEVE un proyecto a
  // una etapa que la tabla no declara, se ve. No detecta una etapa nueva que nadie usó todavía
  // (para eso está `scripts/inspect-project-pipelines.ts`), pero sí el momento en que empieza
  // a importar.
  //
  // Solo ACTIVOS y solo con pipeline RESUELTO: un `hubspotPipelineId` nulo es la fila legacy
  // (ya la cubre INV10) y un proyecto inactivo no entra a ninguno de los cuatro alcances.
  const conEtapa = await prisma.project.findMany({
    where: { status: "active", hubspotPipelineId: { not: null }, hubspotPipelineStageId: { not: null } },
    select: {
      name: true,
      hubspotPipelineId: true,
      hubspotPipelineStageId: true,
      hubspotPipelineStageLabel: true,
      client: { select: { name: true } },
    },
  });
  const etapasHuerfanas = conEtapa.filter((p) => {
    const def = resolvePipeline(p.hubspotPipelineId);
    // Pipeline no declarado → fila legacy, no es asunto de esta invariante.
    return def ? !buscarEtapa(def, p.hubspotPipelineStageId) : false;
  });
  if (etapasHuerfanas.length > 0) {
    violations++;
    console.error(
      `✗ INV11 VIOLADO: ${etapasHuerfanas.length} proyecto(s) activo(s) están en una etapa que ` +
        `lib/projects/kind.ts no declara.`,
    );
    for (const p of etapasHuerfanas.slice(0, 10)) {
      console.error(
        `    - ${p.client.name} · "${p.name}" → etapa ${p.hubspotPipelineStageId} ` +
          `("${p.hubspotPipelineStageLabel ?? "sin rótulo"}") del pipeline ${p.hubspotPipelineId}`,
      );
    }
    if (etapasHuerfanas.length > 10) console.error(`    … y ${etapasHuerfanas.length - 10} más`);
    console.error(
      "  Alguien agregó o renombró etapas en HubSpot. Corré\n" +
        "  `npx tsx scripts/inspect-project-pipelines.ts` y transcribí las etapas nuevas a\n" +
        "  `PROJECT_PIPELINES[].stages`. ⚠ Revisá también `closedStageIds`: si una etapa de\n" +
        "  cierre cambió de id, hay proyectos que se cierran o se abren mal.",
    );
  } else {
    console.log("✓ INV11: toda etapa materializada activa está declarada en la tabla.");
  }

  // ── Inv 12: el guard anti-prod está cableado en TODOS los caminos de escritura ─────
  //
  // La base es PRODUCCIÓN (invariante #3 de CLAUDE.md): un `--apply` corrido por reflejo
  // escribe sobre datos reales. Este invariante es DURO desde el día 1 (deuda inicial 0:
  // el sweep de la misma tanda migró los 60 scripts) y verifica cuatro cosas:
  //   (a) todo scripts/**/*.ts que maneje `--apply` usa el guard (resolverApply /
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
      if (src.includes("--apply") && !USA_GUARD.test(src)) sinGuard.push(rel);
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
    console.log("✓ INV12: el guard anti-prod cubre scripts --apply, el CLI de Prisma y los seeds.");
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
