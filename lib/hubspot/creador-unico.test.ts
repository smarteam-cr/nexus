import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { crearProjectRecord } from "./project-record";
import { PROJECT_PIPELINES, pipelineByKey } from "@/lib/projects/kind";

/**
 * lib/hubspot/creador-unico.test.ts — UN SOLO LUGAR crea un proyecto en HubSpot.
 *
 * ── LA FALLA QUE ATACA, Y QUE YA PASÓ ────────────────────────────────────────
 * Hubo un incidente de proyectos DUPLICADOS en el CRM que obligó a escribir
 * `scripts/cleanup-handoff-dup-projects.ts`. Con dos lugares capaces de crear el record vuelve
 * a pasar: alguien arregla uno, el otro queda igual, y el síntoma —dos proyectos con el mismo
 * nombre en la misma empresa— aparece semanas después, cuando ya nadie recuerda el cambio.
 *
 * El segundo candado es sobre los IDS DE PIPELINE. Estaban escritos dos veces (en la tabla y en
 * `handoff-sync.ts`) y envejecían por separado. Un id viejo no da error: crea el proyecto en el
 * pipeline equivocado, y de ahí sale su tipo — o sea, si se factura y con qué documentos nace.
 */

const RAIZ = process.cwd();

/** El código SIN las líneas de `import` (ver `lib/projects/publicable.test.ts`). */
function sinImports(src: string): string {
  return src.replace(/^import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm, "");
}

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return out;
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  recorrer(abs);
  return out;
}

const PRODUCCION = [...archivosDe("lib"), ...archivosDe("app"), ...archivosDe("components")];

const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, "/");

/** Sin comentarios: un ejemplo escrito en un bloque de texto no es una llamada. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Los argumentos de cada `apiRequest({ … })`, con las LLAVES BALANCEADAS.
 *
 * ⚠ La primera versión de esta guarda era una regex que exigía que `method: "POST"` y la ruta
 * aparecieran en cierto orden y a cierta distancia. **Pasó en verde con la violación puesta**
 * —lo descubrí rompiéndola a propósito—: el código real tenía el método primero y la ruta sin
 * interpolar, y ninguna de las tres alternativas calzaba. Una guarda que no muerde es peor que
 * no tenerla, porque se lee como un control que existe.
 *
 * Recortar el bloque entero y mirar adentro no depende del orden, ni del formato, ni de si la
 * ruta viene interpolada o literal. Es la misma técnica que `bloquesData` en
 * `lib/projects/scope-coverage.test.ts`.
 */
function bloquesApiRequest(codigo: string): string[] {
  const bloques: string[] = [];
  const re = /\bapiRequest\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    let i = m.index + m[0].length - 1; // sobre la `{`
    const desde = i;
    let nivel = 0;
    for (; i < codigo.length; i++) {
      if (codigo[i] === "{") nivel++;
      else if (codigo[i] === "}") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    bloques.push(codigo.slice(desde, i + 1));
  }
  return bloques;
}

/**
 * ¿Este bloque CREA un proyecto? Tiene que ser POST **y** apuntar al objeto de proyectos.
 *
 * El id del objeto aparece legítimamente en lecturas (batch/read de asociaciones, search), así
 * que "menciona 0-970" no alcanza; y hay muchos POST a otros objetos, así que "es POST" tampoco.
 */
function esCreacionDeProyecto(bloque: string): boolean {
  const esPost = /method\s*:\s*["'`]POST["'`]/.test(bloque);
  const alObjeto = /0-970|OBJETO_PROYECTOS/.test(bloque);
  return esPost && alObjeto;
}

describe("nadie más crea un proyecto en HubSpot", () => {
  it("encontré los archivos de producción (si esto falla, el escaneo no está mirando nada)", () => {
    expect(PRODUCCION.length).toBeGreaterThan(300);
  });

  it("solo `project-record.ts` hace POST al objeto 0-970", () => {
    const culpables: string[] = [];
    for (const f of PRODUCCION) {
      const r = rel(f);
      if (r === "lib/hubspot/project-record.ts") continue;
      const codigo = sinComentarios(sinImports(fs.readFileSync(f, "utf8")));
      if (bloquesApiRequest(codigo).some(esCreacionDeProyecto)) culpables.push(r);
    }
    expect(
      culpables,
      `Estos archivos crean un proyecto en HubSpot por su cuenta: ${culpables.join(", ")}.\n` +
        "Tiene que pasar por lib/hubspot/project-record.ts — con DOS lugares capaces de crear " +
        "el record vuelven los duplicados que obligaron a escribir " +
        "scripts/cleanup-handoff-dup-projects.ts.",
    ).toEqual([]);
  });

  it("ningún archivo de producción escribe los ids de pipeline fuera de la tabla", () => {
    /* El escaneo EXCLUYE tests y scripts/ a propósito: los transcriben para verificar contra el
       portal, que es justamente lo que hay que poder hacer. La regla es sobre el código que
       CORRE en producción. */
    const ids = PROJECT_PIPELINES.map((p) => p.hubspotPipelineId);
    const culpables: string[] = [];
    for (const f of PRODUCCION) {
      const r = rel(f);
      if (r === "lib/projects/kind.ts") continue;
      const codigo = fs.readFileSync(f, "utf8");
      if (ids.some((id) => codigo.includes(id))) culpables.push(r);
    }
    expect(
      culpables,
      `Estos archivos escriben un id de pipeline a mano: ${culpables.join(", ")}. ` +
        "Tienen que salir de PROJECT_PIPELINES: un id copiado envejece solo, y un id viejo no " +
        "da error — crea el proyecto en el pipeline equivocado, y de ahí sale si se factura.",
    ).toEqual([]);
  });
});

// ── Lo que MANDA el POST, transcrito ─────────────────────────────────────────

interface PostCapturado {
  path: string;
  method: string;
  body: {
    properties: Record<string, string>;
    associations?: Array<{
      to: { id: string };
      types: Array<{ associationCategory: string; associationTypeId: number }>;
    }>;
  };
}

/** Un cliente de HubSpot de mentira que captura la llamada en vez de hacerla. */
function hsFalso(respuesta: { ok?: boolean; status?: number; sinId?: boolean } = {}) {
  const llamadas: PostCapturado[] = [];
  const hs = {
    apiRequest: async (req: PostCapturado) => {
      llamadas.push(req);
      return {
        ok: respuesta.ok ?? true,
        status: respuesta.status ?? 201,
        // `sinId` es un flag y no `id: undefined` a propósito: con un `?? "hs-123"` de por
        // medio, pasar undefined caía al default y el test "no devuelve id" pasaba en verde
        // sin probar nada. Pasó de verdad al escribirlo.
        json: async () => (respuesta.sinId ? {} : { id: "hs-123" }),
        text: async () => "boom",
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { hs, llamadas };
}

describe("el cuerpo del POST, para los tres pipelines", () => {
  for (const def of PROJECT_PIPELINES) {
    it(`${def.label}: su pipeline y SU etapa inicial, tomados de la fila`, async () => {
      const { hs, llamadas } = hsFalso();
      await crearProjectRecord(hs, { nombre: "Proyecto X", pipeline: def, empresaId: "co1" });
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0].body.properties.hs_pipeline).toBe(def.hubspotPipelineId);
      expect(llamadas[0].body.properties.hs_pipeline_stage).toBe(def.initialStageId);
      expect(llamadas[0].method).toBe("POST");
    });
  }

  it("las TRES asociaciones van DENTRO del mismo POST — no en llamadas aparte", async () => {
    /* Es la razón de ser de este módulo. Con las asociaciones después, un timeout en el medio
       deja un record sin empresa: el espejo lo descubre por las asociaciones de la company, así
       que un proyecto sin ella no vuelve NUNCA a Nexus y no hay cómo recuperarlo desde la app. */
    const { hs, llamadas } = hsFalso();
    await crearProjectRecord(hs, {
      nombre: "Con todo",
      pipeline: pipelineByKey("development"),
      empresaId: "co1",
      tratoId: "deal1",
      hermanoHsId: "hs-hermano",
    });
    expect(llamadas).toHaveLength(1);
    const asocs = llamadas[0].body.associations ?? [];
    expect(asocs.map((a) => a.to.id)).toEqual(["co1", "deal1", "hs-hermano"]);
    expect(asocs.map((a) => a.types[0].associationTypeId)).toEqual([1236, 1238, 1254]);
  });

  it("`csl_encargado` NUNCA se escribe al crear", () => {
    /* El espejo lo prioriza sobre el owner para resolver QUÉ CSE ve el proyecto. Escribir ahí a
       quien apretó el botón le secuestraría el acceso al CSE que va a llevar el proyecto — y en
       silencio, porque el creador sí lo vería. */
    const codigo = fs.readFileSync(path.join(RAIZ, "lib/hubspot/project-record.ts"), "utf8");
    const enCodigo = sinImports(codigo).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(enCodigo).not.toContain("csl_encargado");
  });

  it("un proyecto que NO es interno no manda la propiedad en blanco", async () => {
    // Un checkbox sin marcar llega VACÍO desde HubSpot, no "false": escribir "false" agregaría
    // una distinción que el espejo no distingue.
    const { hs, llamadas } = hsFalso();
    await crearProjectRecord(hs, {
      nombre: "Normal",
      pipeline: pipelineByKey("customer-success"),
      empresaId: "co1",
    });
    expect(llamadas[0].body.properties).not.toHaveProperty("proyecto_interno");

    const interno = hsFalso();
    await crearProjectRecord(interno.hs, {
      nombre: "Interno",
      pipeline: pipelineByKey("customer-success"),
      empresaId: "co1",
      interno: true,
    });
    expect(interno.llamadas[0].body.properties.proyecto_interno).toBe("true");
  });

  it("si HubSpot no devuelve id, TIRA — no devuelve algo inservible", async () => {
    /* Sin id no se puede escribir `Project.hubspotServiceId`, y sin eso el record queda huérfano
       en el CRM y el proyecto invisible en Nexus. Hay que gritarlo para que el motor lo marque
       fallido y lo reintente. */
    const { hs } = hsFalso({ sinId: true });
    await expect(
      crearProjectRecord(hs, { nombre: "Sin id", pipeline: pipelineByKey("web"), empresaId: "co1" }),
    ).rejects.toThrow(/no devolvió su id/);
  });

  it("un nombre vacío se rechaza ANTES de llamar a HubSpot", async () => {
    const { hs, llamadas } = hsFalso();
    await expect(
      crearProjectRecord(hs, { nombre: "   ", pipeline: pipelineByKey("web"), empresaId: "co1" }),
    ).rejects.toThrow(/necesita un nombre/);
    expect(llamadas).toHaveLength(0);
  });
});
