/**
 * lib/db/guard-de-escritura.test.ts — TRINQUETE: LOS SCRIPTS QUE ESCRIBEN EN PRODUCCION SIN AVISAR.
 *
 * Correr: `npx vitest run lib/db/guard-de-escritura.test.ts --project unit`.
 *
 * ── EL AGUJERO QUE INV12 NO VE ───────────────────────────────────────────────────────────────
 * `scripts/lib/guard.ts` existe para que ninguna escritura llegue a la base de los clientes sin
 * que alguien lo pida a proposito (`ALLOW_PROD_WRITE=1`). INV12 lo hace cumplir, pero solo mira
 * DOS cosas: los scripts que mencionan `--apply`, y los seeds de `prisma/`.
 *
 * O sea que un script bajo `scripts/` que escribe SIEMPRE —sin `--apply`, como todos los seeds de
 * agentes— pasa de largo. Medido el 2026-08-19: **50 scripts** escriben en produccion sin ningun
 * guard, e INV12 daba VERDE con los 50 abiertos.
 *
 * No es teorico. Esa misma noche `seed-post-session-agent.ts` reescribio el prompt vivo del agente
 * de post-sesion en produccion sin pedir absolutamente nada: un `npx tsx` y listo.
 *
 * ── POR QUE UN TRINQUETE Y NO UNA REGLA DURA ─────────────────────────────────────────────────
 * Exigirselo a los 50 dejaria la guarda roja desde el dia uno, y una guarda que nace roja se
 * apaga. Igual que `lib/agents/seed-no-pisa.test.ts`: la lista solo puede ENCOGER. Sumar un script
 * nuevo que escribe sin guard falla; arreglar uno tambien falla, para que la lista se actualice y
 * no se quede mintiendo.
 *
 * El arreglo de cada entrada son tres lineas — el molde esta en `scripts/seed-handoff-agent.ts`:
 *
 *     import { assertProdWriteAllowed } from "./lib/guard";
 *     import { createScriptPool } from "./lib/db";
 *     assertProdWriteAllowed("scripts/lo-que-sea.ts");
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Lo que cuenta como ESCRIBIR en la base. */
const ESCRIBE =
  /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/;

/** Las tres formas legitimas de pedir permiso antes de escribir. */
const TIENE_GUARD = /resolverApply|assertProdWriteAllowed|assertLocalWriteOnly/;

/**
 * DEUDA CONOCIDA — censo del 2026-08-19: 50 scripts que escriben sin guard.
 * La lista SOLO ENCOGE. Al arreglar uno, sacalo de aca (el fallo imprime cual sobra).
 */
const SIN_GUARD: string[] = [
  "scripts/cleanup-zombie-run.ts",
  "scripts/create-cobranza-borrador-agent.ts",
  "scripts/create-cs-account-brief-agent.ts",
  "scripts/create-cs-watchdog-agent.ts",
  "scripts/create-diagnostico-agent.ts",
  "scripts/create-finanzas-reporter-agent.ts",
  "scripts/create-funnel-agent.ts",
  "scripts/create-interview-prep-agent.ts",
  "scripts/create-project-brief-agent.ts",
  "scripts/create-session-agent.ts",
  "scripts/discover-partner-clients.ts",
  "scripts/fix-agent-descriptions.ts",
  "scripts/inspect-hubspot-client-assoc.ts",
  "scripts/inspect-hubspot-projects.ts",
  "scripts/inspect-project-associations.ts",
  "scripts/inspect-project-pipelines.ts",
  "scripts/migrate-agent-groups.ts",
  "scripts/migrate-dinterweb-to-smarteam.ts",
  "scripts/migrate-orphan-flowcharts.ts",
  "scripts/pin-escala-rendimiento.ts",
  "scripts/probe-detected-facts.ts",
  "scripts/seed-analysis-agents.ts",
  "scripts/seed-breeze-knowledge.ts",
  "scripts/seed-caminos-opuestos.ts",
  "scripts/seed-canvas-agents.ts",
  "scripts/seed-demo.ts",
  "scripts/seed-desarrollo-agent.ts",
  "scripts/seed-diagnostico-agent.ts",
  "scripts/seed-entrega-agent.ts",
  "scripts/seed-escala-criterios.ts",
  "scripts/seed-escala-rendimiento.ts",
  "scripts/seed-exploracion-agent.ts",
  "scripts/seed-implementacion-agent.ts",
  "scripts/seed-kickoff-agent.ts",
  "scripts/seed-marketing-module.ts",
  "scripts/seed-participants-analyzer.ts",
  "scripts/seed-planificacion-agent.ts",
  "scripts/seed-roles-assist-agent.ts",
  "scripts/seed-session-categories.ts",
  "scripts/seed-session-project-classifier.ts",
  "scripts/seed-timeline-detail-agent.ts",
  "scripts/seed-timeline-progress-agent.ts",
  "scripts/spike-hubspot-social.ts",
  "scripts/split-kickoff-agent.ts",
  "scripts/test-generation-awaited.ts",
  "scripts/update-agent-canvas-sections.ts",
  "scripts/update-mapeo-agent.ts",
  "scripts/verify-access-password.ts",
  "scripts/verify-logos-l2.ts",
  "scripts/verify-timeline-progress.ts",
];

/** El fuente sin comentarios: mencionar `prisma.x.update` en prosa no es escribir. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

function escribenSinGuard(): string[] {
  const encontrados: string[] = [];
  const caminar = (dir: string) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        caminar(rel);
        continue;
      }
      if (!e.name.endsWith(".ts")) continue;
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
      if (ESCRIBE.test(src) && !TIENE_GUARD.test(src)) encontrados.push(rel);
    }
  };
  caminar("scripts");
  return encontrados.sort();
}

describe("ningun script escribe en produccion sin pedir permiso", () => {
  const actuales = escribenSinGuard();
  const conocidos = new Set(SIN_GUARD);

  it("no aparece uno nuevo", () => {
    /* La edicion que la pone en rojo: escribir un script que llame a `prisma.algo.upsert()` sin
       importar el guard — que es exactamente como nacieron los 50. */
    const nuevos = actuales.filter((f) => !conocidos.has(f));
    expect(
      nuevos,
      "Estos scripts escriben en la base de los clientes sin exigir ALLOW_PROD_WRITE=1. " +
        "Molde: scripts/seed-handoff-agent.ts (assertProdWriteAllowed incondicional al importar).",
    ).toEqual([]);
  });

  it("y la lista solo encoge (si arreglaste uno, sacalo)", () => {
    /* Sin este lado, la lista se queda con entradas de scripts ya arreglados o borrados y deja de
       describir la deuda real — el trinquete se afloja solo. */
    const actualesSet = new Set(actuales);
    const sobran = SIN_GUARD.filter((f) => !actualesSet.has(f));
    expect(
      sobran,
      `Estos ya NO escriben sin guard (o ya no existen): sacalos de SIN_GUARD.`,
    ).toEqual([]);
  });

  it("el escaneo encuentra algo (si no, pasa por vacio)", () => {
    // Sin el piso, romper el patron de deteccion deja el test en verde sin mirar nada.
    expect(actuales.length, "el escaneo de scripts/ dejo de encontrar escrituras").toBeGreaterThan(30);
  });
});
