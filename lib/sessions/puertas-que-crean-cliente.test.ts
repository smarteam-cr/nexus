/**
 * lib/sessions/puertas-que-crean-cliente.test.ts
 *
 * Un cliente que nace tiene que quedarse con las reuniones que ya eran suyas.
 *
 * ── EL DEFECTO QUE ESTA GUARDA CIERRA (2026-08-18) ───────────────────────────
 * El alta única crea el `Client` cuando la empresa de HubSpot todavía no tiene uno, y un segundo
 * y medio después dispara la reclasificación que le cuelga las reuniones al proyecto recién
 * nacido. Esa reclasificación consulta las sesiones DEL CLIENTE — y no encontraba ninguna,
 * porque nadie se las había atribuido todavía. El sello `altaReclasificadoAt` se pone en la
 * misma escritura que marca el alta «listo», así que no volvía a correr NUNCA.
 *
 * Resultado medido en producción: «Discover Puerto Rico» — cliente creado 2 segundos antes de
 * reclasificar, 2 reuniones suyas atribuibles por título, 0 vínculos. El CSE abre el proyecto y
 * no tiene ninguna reunión, sin error y sin forma de que se arregle solo.
 *
 * ⚠ ESTE ARCHIVO YA SE GANÓ EL SUELDO: la primera versión daba por sentado que había DOS puertas
 * que crean clientes. El escaneo encontró SEIS. Dos de las cuatro que faltaban crean o adjuntan
 * un proyecto en el mismo request —o sea que tienen exactamente la misma carrera— y una es un
 * bucle masivo donde correr la atribución por cliente sería un desastre de rendimiento. Ese es
 * el punto de un censo: la pregunta se contesta una vez por puerta, con el motivo escrito.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const CREA_CLIENTE = /prisma\.client\.create\(/;
/** Cualquiera de los dos caminos vale: la pasada masiva, o el de una sesión puntual. */
const ATRIBUYE = /resolveAllSessions\(|reResolveSession\(/;

type Veredicto =
  /** Crea un cliente de a uno, en un request → tiene que atribuirle sus sesiones. */
  | "atribuye"
  /** Atribuye, pero en otro archivo (por latencia o por orden). `delegaEn` dice cuál. */
  | "delega"
  /** Crea clientes en BUCLE → atribuir por cliente sería N pasadas sobre el corpus. */
  | "masiva-exenta";

const PUERTAS: Record<string, { veredicto: Veredicto; motivo: string; delegaEn?: string }> = {
  "app/api/clients/route.ts": {
    veredicto: "atribuye",
    motivo: "El alta de cliente a mano. Siempre atribuyó — es el precedente del que sale esta regla.",
  },
  "app/api/projects/route.ts": {
    veredicto: "delega",
    delegaEn: "lib/projects/alta-runner.ts",
    motivo:
      "El alta única. La atribución NO va en la ruta a propósito: awaitarla acá le costaría a la " +
      "respuesta una pasada entera sobre el corpus. Va en el bloque de fondo de alta-runner, donde " +
      "además se puede garantizar lo único que importa — que corra ANTES de la reclasificación. " +
      "Es el caso «Discover Puerto Rico».",
  },
  "app/api/handoffs/route.ts": {
    veredicto: "atribuye",
    motivo:
      "El asistente viejo de handoff: crea el cliente Y el proyecto, y ya disparaba la reclasificación. " +
      "Misma carrera exacta que el alta única.",
  },
  "app/api/handoffs/import-project/route.ts": {
    veredicto: "atribuye",
    motivo: "Trae un proyecto que ya existe en HubSpot y le crea el cliente si falta. Mismo efecto.",
  },
  "app/api/business-cases/create-from-company/route.ts": {
    veredicto: "atribuye",
    motivo:
      "Crea el cliente para un business case sobre una empresa que puede no serlo todavía. No hay " +
      "proyecto, así que no hay carrera con la reclasificación — pero el cliente igual puede matchear " +
      "reuniones que ya están, y el feeding del BC las va a buscar.",
  },
  "app/api/clients/connect/route.ts": {
    veredicto: "atribuye",
    motivo: "Conecta una empresa de HubSpot como cliente. Ya atribuía.",
  },
  "app/api/system/hubspot/import/route.ts": {
    veredicto: "atribuye",
    motivo:
      "Importa clientes desde HubSpot en lote — pero corre UNA sola pasada de atribución al final, " +
      "que es exactamente la forma correcta para un bucle. Es el molde de lo que le falta a partner-sync.",
  },
  "lib/cs/partner-sync.ts": {
    veredicto: "masiva-exenta",
    motivo:
      "⛔ Crea clientes EN BUCLE, uno por cuenta del book de partner. Una atribución por cliente serían " +
      "N pasadas sobre las ~7.000 sesiones. Y acá el resolver es delicado a propósito: el comentario de " +
      ":187 registra que crear estos clientes ya rompió una vez la atribución (dos «Smarteam» = token " +
      "ambiguo). Lo correcto es UNA pasada al terminar el sync, no una por fila.",
  },
};

function archivosDeCodigo(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) archivosDeCodigo(full, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

describe("las puertas que crean un Client", () => {
  const creadores = [join(RAIZ, "app"), join(RAIZ, "lib")]
    .flatMap((d) => archivosDeCodigo(d))
    .filter((f) => CREA_CLIENTE.test(readFileSync(f, "utf8")))
    .map((f) => relative(RAIZ, f).split(sep).join("/"))
    .sort();

  it("están todas censadas — una puerta nueva es una decisión, no un descubrimiento", () => {
    const sinCensar = creadores.filter((f) => !(f in PUERTAS));
    expect(
      sinCensar,
      `Puerta(s) que crean un Client y no están en el censo:\n` +
        sinCensar.map((f) => `  · ${f}`).join("\n") +
        `\n\nContestá: ¿crea clientes de a UNO en un request (→ "atribuye": tiene que correr la ` +
        `atribución, o el proyecto nace sin ninguna reunión) o EN BUCLE (→ "masiva-exenta": una ` +
        `sola pasada al final, nunca una por fila)?`,
    ).toEqual([]);

    const fantasmas = Object.keys(PUERTAS).filter((f) => !creadores.includes(f));
    expect(fantasmas, `Entradas del censo que ya no crean clientes — borralas:\n${fantasmas.join("\n")}`).toEqual([]);
  });

  it("las de a uno atribuyen las sesiones que ya existen", () => {
    // Una puerta que delega cumple si el archivo al que delega atribuye — así el que mira el
    // censo no tiene que adivinar dónde quedó la llamada.
    const deben = Object.entries(PUERTAS)
      .filter(([, v]) => v.veredicto === "atribuye" || v.veredicto === "delega")
      .map(([f, v]) => v.delegaEn ?? f);
    const mudas = [...new Set(deben)].filter((f) => !ATRIBUYE.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(
      mudas,
      `Estas crean un Client y NO le atribuyen las sesiones que ya existen:\n` +
        mudas.map((f) => `  · ${f}`).join("\n") +
        `\n\nNo falla acá: falla una pantalla más adelante, cuando el proyecto recién creado aparece ` +
        `sin ninguna reunión y el sello de la reclasificación ya está puesto. En producción lo caza ` +
        `INV21 — pero para entonces ya lo vio un CSE.`,
    ).toEqual([]);
  });

  it("en el alta, atribuir va ANTES de reclasificar — el orden ES el arreglo", () => {
    const src = readFileSync(join(RAIZ, "lib/projects/alta-runner.ts"), "utf8");
    const atribuye = src.indexOf("resolveAllSessions");
    const reclasifica = src.indexOf("reclassifyClientSessions(clientId");
    expect(atribuye, "alta-runner dejó de atribuir antes de reclasificar").toBeGreaterThan(-1);
    expect(reclasifica, "no se encontró la reclasificación del alta").toBeGreaterThan(-1);
    expect(
      atribuye,
      "La atribución quedó DESPUÉS de la reclasificación. Ese es exactamente el bug de «Discover " +
        "Puerto Rico»: la reclasificación no encuentra ninguna sesión del cliente y el sello la deja " +
        "impaga para siempre.",
    ).toBeLessThan(reclasifica);
  });

  it("y se AWAITEA dentro del bloque de fondo — un fire-and-forget reabre la carrera", () => {
    const src = readFileSync(join(RAIZ, "lib/projects/alta-runner.ts"), "utf8");
    expect(
      /await resolveAllSessions\(/.test(src),
      "En el alta la atribución tiene que ser `await`: encadenada con `void` vuelve a competir contra " +
        "la reclasificación que corre justo después.",
    ).toBe(true);
  });

  it("la reclasificación del alta mira TODO el historial, no los 90 días del default", () => {
    const src = readFileSync(join(RAIZ, "lib/projects/alta-runner.ts"), "utf8");
    expect(
      /reclassifyClientSessions\(clientId,\s*\{\s*sinceDays:/.test(src),
      "El alta volvió al default de 90 días. Es el PRIMER y ÚNICO disparo del proyecto (el sello lo " +
        "garantiza), así que 90 días deja afuera a todo cliente con historia más vieja — medido en " +
        "«kamalio»: 3 reuniones de 2025, alta de agosto 2026, proyecto sin ninguna.",
    ).toBe(true);
  });
});
