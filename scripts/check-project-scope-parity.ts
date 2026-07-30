/**
 * scripts/check-project-scope-parity.ts  (SOLO LECTURA)
 *
 * ¿Los criterios nuevos de `lib/projects/scope.ts` devuelven EXACTAMENTE los mismos
 * proyectos que los filtros copiados que reemplazan?
 *
 * Extraer un filtro que estaba copiado en cuatro lugares es el paso con más riesgo
 * silencioso de toda la tanda: si una de las copias tenía una diferencia sutil —y TENÍA,
 * ver el bug de los NULL en el encabezado de scope.ts— el refactor cambia el universo de
 * la cartera o de cobranza sin que falle un solo test ni un solo build.
 *
 * Este script corre las DOS versiones contra la base de verdad y compara los conjuntos de
 * ids. Sirve para dos cosas distintas:
 *
 *   · ANTES de migrar los consumidores: mide qué tan lejos está cada copia del criterio
 *     canónico. Todo delta que aparezca acá es un bug preexistente, no algo que rompí.
 *   · DESPUÉS: el delta esperado es cero, salvo el que quede documentado abajo.
 *
 * Uso: npx tsx scripts/check-project-scope-parity.ts
 * Sale con código 1 si aparece un delta que no está en la lista de esperados.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import {
  PROYECTO_NAVEGABLE_WHERE,
  PROYECTO_DE_CARTERA_WHERE,
  PROYECTO_FACTURABLE_WHERE,
  PROYECTO_CLASIFICABLE_WHERE,
} from "@/lib/projects/scope";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/**
 * Deltas ACEPTADOS, con su motivo. Un delta que no esté acá hace fallar el script.
 *
 * El único que hay es el arreglo del bug de los NULL: `serviceType: { not: SENTINEL }` en
 * SQL descarta las filas con `serviceType` NULL —que no son el sentinel—, y la forma nueva
 * las conserva. Toca a UN proyecto: "Proyecto de pruebas" de "Empresa para pruebas".
 * En el rail y en la cartera no cambia nada (la regla de HubSpot ya lo dejaba afuera, porque
 * ese cliente tiene portal y el proyecto no tiene `hubspotServiceId`); solo aparece como
 * destino posible al clasificar una sesión, que es lo correcto.
 */
const DELTAS_ESPERADOS: Record<string, { motivo: string; nombres: string[] }> = {
  clasificable: {
    motivo: "arreglo del bug de NULL en el filtro del sentinel (el proyecto no es el sentinel)",
    nombres: ["Proyecto de pruebas"],
  },
};

type Conjunto = Map<string, string>; // id → etiqueta legible

async function idsDe(where: object): Promise<Conjunto> {
  const rows = await prisma.project.findMany({
    where,
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  return new Map(rows.map((r) => [r.id, `${r.client.name} · ${r.name}`]));
}

function diff(viejo: Conjunto, nuevo: Conjunto) {
  const soloViejo = [...viejo].filter(([id]) => !nuevo.has(id));
  const soloNuevo = [...nuevo].filter(([id]) => !viejo.has(id));
  return { soloViejo, soloNuevo };
}

async function main() {
  let fallas = 0;

  // ── 1. NAVEGABLE — el rail de proyectos / la pestaña inicial ───────────────
  // Copia vieja: app/(shell)/clients/[id]/layout.tsx. Ojo que ahí la regla de HubSpot se
  // resolvía en JS con el cliente ya cargado; acá se escribe con la relación, que es lo
  // que permite que sea UN solo criterio para las dos pantallas.
  await comparar(
    "navegable",
    {
      status: "active",
      serviceType: { not: SENTINEL_SERVICE_TYPE },
      OR: [
        { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
        { hubspotServiceId: { not: null } },
      ],
    },
    PROYECTO_NAVEGABLE_WHERE,
  );

  // ── 2. DE CARTERA — lib/portfolio/load.ts (el panel, CS360 y el watchdog) ──
  await comparar(
    "cartera",
    {
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
      AND: [
        {
          OR: [
            { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
            { hubspotServiceId: { not: null } },
          ],
        },
      ],
    },
    PROYECTO_DE_CARTERA_WHERE,
  );

  // ── 3. FACTURABLE — lib/cobranza/queries.ts ────────────────────────────────
  // El filtro viejo llevaba además `client: CS_CLIENT_WHERE`. Eso NO se muda al criterio de
  // proyecto (es una regla del cliente, y el fragmento tiene que servir también donde el
  // cliente ya viene filtrado), así que se le suma acá para comparar peras con peras.
  await comparar(
    "facturable",
    {
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
      AND: [
        {
          OR: [
            { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
            { hubspotServiceId: { not: null } },
          ],
        },
        { client: { ...CS_CLIENT_WHERE } },
      ],
    },
    { AND: [PROYECTO_FACTURABLE_WHERE, { client: { ...CS_CLIENT_WHERE } }] },
  );

  // ── 4. CLASIFICABLE — sesiones y contexto de agentes ───────────────────────
  await comparar(
    "clasificable",
    { status: "active", serviceType: { not: SENTINEL_SERVICE_TYPE } },
    PROYECTO_CLASIFICABLE_WHERE,
  );

  console.log(
    fallas === 0
      ? "\n✓ PARIDAD OK — ningún delta fuera de los esperados."
      : `\n✗ ${fallas} criterio(s) con deltas NO esperados. Ver arriba.`,
  );
  if (fallas > 0) process.exitCode = 1;

  async function comparar(nombre: string, whereViejo: object, whereNuevo: object) {
    const [viejo, nuevo] = await Promise.all([idsDe(whereViejo), idsDe(whereNuevo)]);
    const { soloViejo, soloNuevo } = diff(viejo, nuevo);
    const total = soloViejo.length + soloNuevo.length;

    console.log(`\n── ${nombre} ──  viejo: ${viejo.size}   nuevo: ${nuevo.size}   delta: ${total}`);
    if (total === 0) {
      console.log("   ✓ conjuntos idénticos");
      return;
    }

    const esperado = DELTAS_ESPERADOS[nombre];
    const nombresDelta = [...soloViejo, ...soloNuevo].map(([, etiqueta]) => etiqueta);
    for (const [, etiqueta] of soloViejo) console.log(`   − solo en el VIEJO: ${etiqueta}`);
    for (const [, etiqueta] of soloNuevo) console.log(`   + solo en el NUEVO: ${etiqueta}`);

    const todosEsperados =
      esperado && nombresDelta.every((n) => esperado.nombres.some((e) => n.includes(e)));
    if (todosEsperados) {
      console.log(`   ✓ esperado: ${esperado.motivo}`);
    } else {
      console.log("   ✗ DELTA NO ESPERADO — revisar antes de seguir.");
      fallas++;
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
