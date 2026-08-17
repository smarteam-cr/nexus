import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PIECES } from "@/lib/pieces/registry";

/**
 * lib/canvas/handoff-al-cliente.test.ts — EL HANDOFF ES INTERNO Y NO TODOS LOS LECTORES LO SON.
 *
 * ── QUÉ ES EL PROBLEMA ───────────────────────────────────────────────────────
 * El canvas Handoff está escrito para que Smarteam se entienda a sí misma: incluye los riesgos y
 * banderas rojas SOBRE el cliente, por qué nos eligieron, los acuerdos comerciales y el estado
 * interno al momento del traspaso. Algunos documentos que lo leen los abre el CLIENTE.
 *
 * La defensa NO es el prompt. `loadHandoffContext` acepta un `includeKeys` justamente porque la
 * regla del repo es **filtrar datos, no rogarle al modelo**: lo que no entra al contexto no puede
 * salir, ni por una instrucción ambigua ni por una regeneración con una instrucción del CSE.
 *
 * ── LAS DOS FUGAS QUE ESTE ARCHIVO CIERRA (2026-08-16) ───────────────────────
 *  1. **El regen por bloque del kickoff.** La generación COMPLETA filtraba; regenerar UN bloque
 *     leía el handoff entero. O sea que el mismo documento salía distinto según por dónde se
 *     hubiera generado, y el camino corto se saltaba el gate del camino largo.
 *  2. **La Entrega.** Misma clase, y ésta no estaba en el plan: se comparte al cliente con
 *     enlace y contraseña igual que el kickoff, y leía el handoff sin filtro.
 *
 * ── POR QUÉ UN CENSO Y NO UN TEST POR RUTA ──────────────────────────────────
 * El modo de falla es de OMISIÓN: nadie rompe esto: alguien escribe un lector NUEVO y no se
 * acuerda. Un test por ruta protege lo que ya existe y deja pasar justamente al próximo, que es
 * el que va a fallar. Acá el censo tiene que estar COMPLETO: un lector sin declarar pone el
 * archivo en rojo hasta que alguien escriba a qué documento alimenta y si ese documento se
 * entrega.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * Cuánto se acerca al cliente lo que ese lector produce.
 *
 *  · `directo`      — el texto del modelo se pinta en un documento que el cliente abre. EXIGE
 *                     allowlist: entre el modelo y el cliente no hay ningún humano.
 *  · `por_curacion` — el modelo produce algo ESTRUCTURADO (tareas, estados) que un humano
 *                     confirma antes de que se publique. No exige allowlist, pero se declara.
 *  · `interno`      — el resultado no sale de Smarteam.
 */
type Exposicion = "directo" | "por_curacion" | "interno";

interface Lector {
  archivo: string;
  /**
   * Literal que identifica ESTA llamada dentro del archivo. Solo hace falta cuando el archivo
   * tiene MÁS DE UN lector; con uno solo, el archivo ya la identifica.
   *
   * ⚠ El censo es por LLAMADA y no por archivo justamente por `analyze/route.ts`: ahí conviven
   * el kickoff (que el cliente abre) y una rama dormida de planificación (interna). Con un censo
   * por archivo, sumarle una segunda llamada a un archivo ya declarado entraba sin que nadie la
   * mirara — el mismo agujero de omisión que esto vino a tapar.
   *
   * ⛔ EL ANCLA NUNCA ES LO QUE SE VERIFICA. Anclar en `KICKOFF_HANDOFF_KEYS` parecía natural y
   * estaba mal: al sacar la allowlist, la llamada dejaba de emparejar y el rojo salía por «no
   * está en el censo» en vez de por «se llevó la allowlist». Sigue siendo rojo, pero manda a la
   * persona a agregar una línea al censo — que es exactamente lo contrario de lo que hay que
   * hacer. Lo cazó romper la guarda a propósito.
   */
  ancla?: string;
  /** Qué documento alimenta. `null` cuando no es una pieza del registro. */
  pieza: string | null;
  exposicion: Exposicion;
  porque: string;
}

/**
 * ⚠ EL CENSO. Toda llamada a `loadHandoffContext` de producción vive acá, con su decisión escrita.
 * Agregar un lector sin agregarlo a esta tabla pone el archivo en rojo — es el punto.
 */
const LECTORES: Lector[] = [
  {
    archivo: "app/api/clients/[id]/analyze/route.ts",
    ancla: "loadTimelineContext(bodyProjectId)",
    pieza: "kickoff",
    exposicion: "directo",
    porque: "la generación completa del kickoff, que el cliente abre con enlace y contraseña",
  },
  {
    archivo: "app/api/clients/[id]/analyze/route.ts",
    ancla: "isPlanificacionGroupLegacy",
    pieza: "planning",
    exposicion: "interno",
    porque:
      "rama LEGACY del grupo planificación, para agentes dormidos: el agente vivo ya no pasa " +
      "por acá (short-circuit por id al runner del motor). La planificación es guía interna, " +
      "así que no exige allowlist — pero queda declarada, no omitida",
  },
  {
    archivo: "app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/regenerate/route.ts",
    pieza: "kickoff",
    exposicion: "directo",
    porque:
      "regenerar UN bloque del kickoff con una instrucción: el mismo documento por otra puerta",
  },
  {
    archivo: "app/api/projects/[projectId]/canvas-assist/route.ts",
    pieza: "kickoff",
    exposicion: "directo",
    porque: "asistente de edición sobre el kickoff y el requerimiento técnico, los dos externos",
  },
  {
    archivo: "lib/canvas/entrega-generate.ts",
    pieza: "delivery",
    exposicion: "directo",
    porque: "el documento de cierre: se comparte al cliente igual que el kickoff",
  },
  {
    archivo: "lib/canvas/diagnostico-generate.ts",
    pieza: "diagnosis",
    exposicion: "directo",
    porque: "el diagnóstico se le presenta al cliente",
  },
  {
    archivo: "lib/canvas/desarrollo-generate.ts",
    pieza: "tech-requirements",
    exposicion: "directo",
    porque: "el requerimiento técnico tiene vista externa para el dev del cliente",
  },
  {
    archivo: "lib/canvas/exploracion-generate.ts",
    pieza: "exploration",
    exposicion: "interno",
    porque: "documento de descubrimiento, no se entrega — igual lleva allowlist por prolijidad",
  },
  {
    archivo: "lib/canvas/planificacion-generate.ts",
    pieza: "planning",
    exposicion: "interno",
    porque: "guía de trabajo interna — igual lleva allowlist",
  },
  {
    archivo: "lib/canvas/implementacion-generate.ts",
    pieza: "implementation",
    exposicion: "interno",
    porque: "es la guía de trabajo del CSE, no un entregable",
  },
  {
    archivo: "lib/contexto/cargar.ts",
    pieza: "timeline",
    exposicion: "por_curacion",
    porque:
      "el agente de detalle emite TÍTULOS DE TAREA, no prosa, y el CSE los cura antes de que " +
      "el cronograma se publique. ⚠ Revisar en la Tanda 8: hoy la PRIMERA generación todavía " +
      "escribe sin pasar por curación, y ahí esta declaración deja de ser cierta",
  },
  {
    archivo: "lib/timeline/regenerate-progress.ts",
    pieza: "timeline",
    exposicion: "por_curacion",
    porque: "el agente de avance solo propone un borrador de estados que el CSE confirma",
  },
  {
    archivo: "lib/projects/project-brief.ts",
    pieza: null,
    exposicion: "interno",
    porque: "el resumen «cómo va este proyecto» es del equipo; nunca sale de Nexus",
  },
];

/**
 * Una llamada real al embudo.
 *
 * ⚠ Dos ventanas, y la diferencia importa:
 *  · `opciones` mira SOLO hacia adelante — ahí vive el objeto que puede traer `includeKeys`.
 *    Ensancharla haría que un `includeKeys` de la llamada de al lado apruebe a ésta.
 *  · `contexto` mira también hacia atrás, porque un ancla puede ser lo que gobierna la rama
 *    (`if (isPlanificacionGroupLegacy …)`) y eso está ARRIBA de la llamada, no adentro.
 */
interface Llamada {
  archivo: string;
  opciones: string;
  contexto: string;
}

/**
 * Recorre el código de producción juntando las LLAMADAS al embudo.
 *
 * ⚠ Llamadas, no menciones: partir por el nombre pelado contaba el import de cada archivo como
 * si fuera una llamada sin opciones, y seis rutas correctas salían rojas. Lo cazó correr la
 * guarda por primera vez.
 */
function llamadasQueLeenElHandoff(): Llamada[] {
  const out: Llamada[] = [];
  const rec = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        rec(p);
        continue;
      }
      if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
      if (e.name.includes(".test.")) continue;
      const rel = path.relative(RAIZ, p).split(path.sep).join("/");
      // El módulo del embudo DEFINE la función; no es un lector.
      if (rel === "lib/canvas/load-canvas-context.ts") continue;
      const src = fs
        .readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      const re = /loadHandoffContext\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        out.push({
          archivo: rel,
          // ~320 chars cubren el objeto de opciones en cualquiera de las formas que existen.
          opciones: src.slice(m.index, m.index + 320),
          contexto: src.slice(Math.max(0, m.index - 260), m.index + 320),
        });
      }
    }
  };
  for (const d of ["lib", "app", "components", "scripts"]) rec(path.join(RAIZ, d));
  return out.sort((a, b) => a.archivo.localeCompare(b.archivo));
}

/** Empareja cada llamada real con su entrada del censo, por archivo + ancla. */
function emparejar() {
  const llamadas = llamadasQueLeenElHandoff();
  const usados = new Set<number>();
  const huerfanas: Llamada[] = [];
  const emparejadas: Array<{ lector: Lector; opciones: string }> = [];
  for (const ll of llamadas) {
    const i = LECTORES.findIndex(
      (l, idx) =>
        !usados.has(idx) &&
        l.archivo === ll.archivo &&
        (l.ancla === undefined || ll.contexto.includes(l.ancla)),
    );
    if (i === -1) huerfanas.push(ll);
    else {
      usados.add(i);
      emparejadas.push({ lector: LECTORES[i], opciones: ll.opciones });
    }
  }
  const sinLlamada = LECTORES.filter((_, i) => !usados.has(i));
  return { emparejadas, huerfanas, sinLlamada };
}

describe("⭐ el censo está completo", () => {
  it("toda llamada al handoff está declarada, y toda declaración tiene su llamada", () => {
    /* Las dos direcciones importan. Sin la primera, un lector nuevo entra sin que nadie decida si
       su documento se entrega. Sin la segunda, la tabla se pudre: queda declarando llamadas que
       ya no existen y da una sensación de cobertura que no hay. */
    const { huerfanas, sinLlamada } = emparejar();
    expect(
      huerfanas.map((h) => `${h.archivo} :: ${h.opciones.slice(0, 90)}`),
      "Estas llamadas leen el handoff y no están en el censo. Agregalas a LECTORES diciendo a " +
        "qué documento alimentan y si ese documento se entrega al cliente.",
    ).toEqual([]);
    expect(
      sinLlamada.map((l) => `${l.archivo}${l.ancla ? ` (ancla: ${l.ancla})` : ""}`),
      "El censo declara llamadas que ya no existen, o cuya ancla dejó de matchear.",
    ).toEqual([]);
  });

  it("⛔ ningún ancla es lo que la guarda verifica", () => {
    /* Ver el docblock de `ancla`. Si un ancla vuelve a ser el nombre de una allowlist, sacar esa
       allowlist desemparejaría la llamada y el rojo saldría por el motivo equivocado. */
    const malas = LECTORES.filter((l) => l.ancla?.includes("HANDOFF_KEYS")).map((l) => l.archivo);
    expect(
      malas,
      "Estas entradas anclan en la propia allowlist: si alguien la saca, el fallo va a decir " +
        `«no está en el censo» en vez de «se llevó la allowlist»:\n${malas.join("\n")}`,
    ).toEqual([]);
  });

  it("la pieza declarada existe en el registro", () => {
    const slugs = new Set(PIECES.map((p) => p.slug));
    const raras = LECTORES.filter((l) => l.pieza !== null && !slugs.has(l.pieza)).map((l) => l.pieza);
    expect(raras, `Piezas inventadas en el censo: ${raras.join(", ")}`).toEqual([]);
  });

  it("⚠ y `directo` coincide con lo que dice el registro de piezas", () => {
    /* La trampa: declarar `interno` un documento que el registro marca de cara al cliente, y
       ahorrarse la allowlist con una línea de prosa. La verdad de si un documento se entrega no
       la decide este archivo — la decide `clientFacing` en el registro. */
    const facing = new Map(PIECES.map((p) => [p.slug, p.clientFacing]));
    const mentirosos = LECTORES.filter(
      (l) => l.pieza !== null && facing.get(l.pieza) === true && l.exposicion === "interno",
    ).map((l) => `${l.archivo} → ${l.pieza}`);
    expect(
      mentirosos,
      "El censo declara INTERNO un documento que el registro marca de cara al cliente:\n" +
        mentirosos.join("\n"),
    ).toEqual([]);
  });
});

describe("⛔ lo que llega al cliente sin humano en el medio va FILTRADO", () => {
  const directos = emparejar().emparejadas.filter((e) => e.lector.exposicion === "directo");

  it("hay al menos uno (si no, el test se aprueba solo)", () => {
    expect(directos.length).toBeGreaterThan(3);
  });

  it.each(directos.map((e) => [`${e.lector.archivo} -> ${e.lector.pieza}`, e.opciones] as const))(
    "%s pasa una allowlist",
    (etiqueta, opciones) => {
      /* `includeKeys` es el gate real: lo que no entra al contexto no puede salir del modelo. El
         prompt también se lo prohíbe, pero una instrucción del CSE puede empujarlo, y una
         regeneración parcial ni siquiera arrastra el prompt completo. */
      expect(
        opciones,
        `${etiqueta}: esta llamada lee el handoff ENTERO y su texto llega al cliente sin que ` +
          "ningún humano lo mire en el medio",
      ).toContain("includeKeys");
    },
  );
});

describe("⚠ lo que el kickoff y la Entrega NO pueden ver", () => {
  /* Las cuatro secciones internas, transcritas. Si alguien agrega una a cualquiera de las dos
     allowlists «porque hace falta», este test lo obliga a venir acá y borrarla de la lista —
     que es una decisión en castellano, no un diff de una línea que pasa desapercibido. */
  const PROHIBIDAS = [
    "riesgos_banderas",
    "motivacion_decision",
    "acuerdos_promesas",
    "estado_en_flight",
  ];

  it.each([
    ["kickoff", "components/landing/configs/kickoff.defs.ts", "KICKOFF_HANDOFF_KEYS"],
    ["Entrega", "components/landing/configs/entrega.defs.ts", "ENTREGA_HANDOFF_KEYS"],
  ])("la allowlist de %s no contiene ninguna sección interna", (_doc, archivo, constante) => {
    const src = leer(archivo);
    const i = src.indexOf(`export const ${constante}`);
    expect(i, `no encontré ${constante}`).toBeGreaterThan(-1);
    const lista = src.slice(i, src.indexOf("as const", i));
    for (const k of PROHIBIDAS) {
      expect(lista, `${constante} dejó entrar «${k}», que es interna`).not.toContain(`"${k}"`);
    }
  });

  it("y las dos tienen algo adentro (una allowlist vacía apaga el documento)", () => {
    for (const [archivo, constante] of [
      ["components/landing/configs/kickoff.defs.ts", "KICKOFF_HANDOFF_KEYS"],
      ["components/landing/configs/entrega.defs.ts", "ENTREGA_HANDOFF_KEYS"],
    ] as const) {
      const src = leer(archivo);
      const i = src.indexOf(`export const ${constante}`);
      const lista = src.slice(i, src.indexOf("as const", i));
      expect((lista.match(/"/g) ?? []).length / 2, `${constante} quedó vacía`).toBeGreaterThan(2);
    }
  });
});
