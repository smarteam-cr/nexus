import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RUTAS_DEL_ALTA } from "@/components/projects/NuevoProyectoStepper";
import { PROJECT_PIPELINES } from "./kind";

/**
 * lib/projects/alta-boton.test.ts — EL BOTÓN ÚNICO: que sus puertas existan, que dejen pasar
 * a quien lo ve, y que el asistente viejo esté escondido y no borrado.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un formulario que llama a una ruta que no existe, o que existe pero rechaza al rol que ve
 * el botón, falla EN VIVO y en la primera pantalla. No lo detecta `tsc` (las URLs son
 * strings), no lo detecta el build, y el que se lo come es quien confió en el botón.
 *
 * Es exactamente el riesgo que el plan marcó para los líderes de CS: las tres puertas de
 * lectura del asistente exigían la capacidad de handoff, que CSL no tiene.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const BOTON = "components/projects/NuevoProyectoStepper.tsx";
const INDICE = "app/(shell)/clients/ClientsGrid.tsx";
const VIEJO = "components/handoffs/HandoffStepper.tsx";

/** `/api/handoffs/lookup` → `app/api/handoffs/lookup/route.ts` */
const archivoDeRuta = (ruta: string) => `app${ruta}/route.ts`;

describe("cada ruta que el botón llama existe", () => {
  it("la lista no está vacía (si no, este archivo no prueba nada)", () => {
    expect(Object.keys(RUTAS_DEL_ALTA).length).toBeGreaterThanOrEqual(3);
  });

  for (const [nombre, ruta] of Object.entries(RUTAS_DEL_ALTA)) {
    it(`${nombre} → ${ruta}`, () => {
      const rel = archivoDeRuta(ruta);
      expect(
        fs.existsSync(path.join(RAIZ, rel)),
        `${BOTON} llama a ${ruta} y no existe ${rel}. Si la ruta se movió, movela también en ` +
          "RUTAS_DEL_ALTA — es la constante desde la que este test lee.",
      ).toBe(true);
    });
  }

  it("el botón no llama NINGUNA ruta fuera de la lista", () => {
    /* La constante existe para que este test pueda enumerarlas. Si el componente escribe una
       URL suelta, la lista deja de ser la verdad y la guarda pasa en verde sobre una ruta que
       nadie verificó. */
    const src = leer(BOTON);
    const declaradas = new Set<string>(Object.values(RUTAS_DEL_ALTA));
    const sueltas = [...src.matchAll(/["'`](\/api\/[a-zA-Z0-9/_\-[\]]*)/g)]
      .map((m) => m[1])
      .filter((u) => !declaradas.has(u));
    expect(sueltas, `URLs escritas a mano en ${BOTON}: ${sueltas.join(", ")}`).toEqual([]);
  });
});

describe("quien ve el botón puede atravesar sus puertas", () => {
  it("el botón se muestra por la celda `proyectos.create`", () => {
    /* Si se gateara por `createHandoff` (lo que hacía el asistente viejo), los líderes de CS
       no verían el botón — que es justo el rol que la tanda vino a habilitar. */
    const src = leer(BOTON);
    expect(src).toContain("permissions.sections.proyectos?.create");
    expect(src, "el botón todavía se gatea por la capacidad de handoff").not.toContain(
      "createHandoff",
    );
  });

  const PUERTAS_DE_LECTURA = [
    "app/api/handoffs/lookup/route.ts",
    "app/api/handoffs/projects-of-company/route.ts",
    "app/api/handoffs/import-project/route.ts",
  ];

  for (const puerta of PUERTAS_DE_LECTURA) {
    it(`${puerta} deja pasar a los dos caminos`, () => {
      /* `guardLecturaParaArrancar` = "¿esta persona puede arrancar un proyecto O un handoff?".
         Con `createHandoff` a secas, la líder de CS ve el botón y come un 403 en la primera
         pantalla. Se resuelve así y NO ampliando `handoff.create`, que le daría de paso la
         capacidad de redactar handoffs y obligaría a mover las tablas congeladas de roles. */
      const src = leer(puerta);
      expect(src).toContain("guardLecturaParaArrancar()");
      expect(src, `${puerta} volvió a exigir solo la capacidad de handoff`).not.toContain(
        'guardCapability("createHandoff")',
      );
    });
  }

  it("el guard mira LAS DOS celdas, no una", () => {
    const src = leer("lib/auth/api-guards.ts");
    const i = src.indexOf("export async function guardLecturaParaArrancar");
    expect(i, "desapareció guardLecturaParaArrancar").toBeGreaterThan(0);
    const cuerpo = src.slice(i, i + 1400);
    expect(cuerpo).toContain('"proyectos", "create"');
    expect(cuerpo).toContain('"handoff", "create"');
  });
});

describe("el formulario no copia la regla del trato", () => {
  it("la deriva de la misma función que el servidor", () => {
    /* Copiada, un día la pantalla pediría trato donde el servidor no lo pide (formulario
       trabado sin motivo visible) o al revés (el servidor rechaza lo que la pantalla dejó
       pasar). Las dos versiones son molestas de diagnosticar porque nadie sospecha de una
       condición duplicada. */
    const src = leer(BOTON);
    expect(src).toContain("exigeTratoGanado(");
  });

  it("el desplegable de hermanos ofrece SOLO implementaciones de Customer Success", () => {
    /* Encontrado en vivo: el desplegable listaba todo proyecto del cliente que estuviera en
       Nexus, incluidos desarrollos y sitios web. Elegir uno de ésos como "padre" es un rechazo
       del servidor —correcto, pero tardío: llega recién al enviar, con el formulario ya lleno.
       La pantalla filtra por la MISMA tabla contra la que el servidor rechaza. */
    const src = leer(BOTON);
    expect(src).toContain('resolvePipeline(p.nexusPipelineId)?.key === "customer-success"');
  });

  it("las opciones que la persona elige pasan por el desambiguador", () => {
    /* Dos proyectos homónimos en el desplegable son dos filas idénticas: con el orden ya fijo
       no es peligroso, pero sigue siendo imposible saber cuál es cuál. */
    const src = leer(BOTON);
    expect(src).toContain("etiquetarAmbiguos(");
    expect(src, "el desplegable volvió a pintar el nombre crudo").not.toContain("Cuelga de {p.name}");
  });

  it("los tipos salen de la tabla, y ningún id de pipeline se escribe en la pantalla", () => {
    const src = leer(BOTON);
    expect(src, "la lista de tipos dejó de salir de lib/projects/kind.ts").toContain(
      "PROJECT_PIPELINES",
    );
    /* Los ids de HubSpot viven en la tabla y en ningún otro lado. Uno pegado en una pantalla
       sobrevive a que el pipeline se rehaga en el portal —cosa que ya pasó el 2026-07-30— y
       el síntoma es un proyecto que nace en el pipeline equivocado, sin error. */
    for (const p of PROJECT_PIPELINES) {
      expect(src, `${BOTON} hardcodea el id ${p.hubspotPipelineId} (${p.label})`).not.toContain(
        p.hubspotPipelineId,
      );
    }
  });
});

describe("el asistente viejo se esconde, no se borra", () => {
  it("el índice de clientes ya no lo monta", () => {
    expect(leer(INDICE)).not.toContain("<HandoffStepper");
  });

  it("el índice monta el botón nuevo", () => {
    expect(leer(INDICE)).toContain("<NuevoProyectoStepper");
  });

  it("el archivo del asistente sigue entero", () => {
    /* Volver atrás tiene que ser una línea, no un revert. El archivo se retira de verdad en
       el tramo que cierra las puertas viejas, DESPUÉS de la prueba en vivo. */
    expect(fs.existsSync(path.join(RAIZ, VIEJO)), `${VIEJO} se borró antes de tiempo`).toBe(true);
    expect(leer(VIEJO)).toContain("export default function HandoffStepper");
  });
});

describe("la casilla de interno vive en el PASO 1, y completa el dominio", () => {
  /* Quien va a crear un proyecto interno no tiene por qué tipear el dominio de su propia empresa
     para recién después catalogarlo: marcar la casilla es lo primero que se sabe, y el dominio
     sale de ahí. Editable, porque un interno puede ser para otra empresa (el caso SmartAgro). */

  it("está adentro del formulario del dominio, no del de tipo y nombre", () => {
    /* Si vuelve al paso 2, el autocompletado deja de tener sentido (el dominio ya se tipeó) y el
       cambio se apaga sin que ningún otro test se caiga. */
    const src = leer(BOTON);
    const form = src.indexOf('id="alta-dominio"');
    const finDelForm = src.indexOf("</form>", form);
    expect(form, "desapareció el formulario del paso 1").toBeGreaterThan(0);
    const paso1 = src.slice(form, finDelForm);
    expect(paso1, "la casilla de interno no está en el paso 1").toContain(
      "Proyecto interno de Smarteam",
    );
  });

  it("marcarla completa el dominio propio, y NO lo pisa si ya hay algo escrito", () => {
    const src = leer(BOTON);
    expect(src).toContain("setDominio(DOMINIO_PROPIO)");
    /* La condición es la mitad del punto: pisar o borrar lo que alguien tipeó es peor que dejar
       un valor visible que puede corregir. */
    expect(src).toContain("if (marcado && !dominio.trim())");
  });

  it("el dominio propio NO está pegado en la pantalla", () => {
    /* Un literal acá sobrevive a que se cambie el dominio en la categoría interna, y el síntoma
       es "No existe esa empresa en HubSpot" sobre un dominio que sí existe. Mismo criterio que
       los ids de pipeline, que tampoco pueden escribirse en una pantalla. */
    expect(leer(BOTON), "el dominio se hardcodeó en vez de importarse").not.toContain(
      '"smarteamcr.com"',
    );
  });

  it("buscar() suelta la selección de la empresa anterior", () => {
    /* Con la casilla en el paso 1, volver atrás y buscar otra empresa pasa a ser el camino normal.
       Sin este reset, la pantalla dice "Traer el proyecto" y CREA uno nuevo, porque el id elegido
       ya no está en la lista de la empresa nueva. */
    const src = leer(BOTON);
    const i = src.indexOf('setPaso("proyecto")');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, i - 500), i), "buscar() ya no resetea la selección").toContain(
      'setSeleccion("nuevo")',
    );
  });
});

describe("«nosotros» se escribe en un solo lugar", () => {
  /* Estaba en seis archivos con cuatro nombres distintos. Cada copia es una que se queda vieja
     sin que nada avise. */
  const EXENTOS = new Set([
    "lib/sessions/dominio-propio.ts", // la fuente
    // El gate de LOGIN va aparte a propósito: es seguridad, y un cambio pensado para sesiones o
    // para el alta no puede abrir la puerta de entrada al sistema.
    "app/auth/callback/route.ts",
    "app/auth/google/route.ts",
  ]);

  it("ningún archivo de producción pega el literal", () => {
    const encontrados: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          recorrer(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
        if (EXENTOS.has(rel)) continue;
        const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
        /* Solo entre comillas: un `@smarteamcr.com` dentro de un comentario o de un texto de
           pantalla no es una fuente de verdad que se pueda quedar vieja. */
        if (/["'`]smarteamcr\.com["'`]/.test(src)) encontrados.push(rel);
      }
    };
    for (const raiz of ["lib", "app", "components"]) recorrer(raiz);
    expect(
      encontrados,
      `Pegaron el dominio propio en vez de importar DOMINIO_PROPIO:\n${encontrados.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * ── TRAER UN PROYECTO DE HUBSPOT ─────────────────────────────────────────────
 *
 * "Traer un proyecto que ya existe en HubSpot" es una capacidad que existe hace tiempo y que
 * nadie encontraba, porque las tres puertas que llevan a ella se llamaban «Nuevo proyecto»,
 * «Actualizar» e «Importar clientes (Nexus = true)». Estas guardas cuidan las dos mitades del
 * arreglo: que el camino FUNCIONE (los dos bugs de servidor de abajo) y que se SIGA LLAMANDO
 * como se llama ahora.
 */

/** El fuente sin comentarios: la prosa que explica cada bug nombra el símbolo vigilado. */
function sinComentarios(rel: string): string {
  return leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

describe("traer un proyecto de HubSpot no pide un trato ganado", () => {
  const RUTA = "app/api/projects/route.ts";

  /**
   * LA guarda del tramo. La regla del trato protege al proyecto que se CREA facturable sin
   * ancla comercial; traer uno que ya existe en HubSpot no crea nada que cobre allá. Y la
   * pantalla YA apaga el bloque del trato cuando se adjunta, así que si el servidor la vuelve
   * a exigir, con 0 o con 2+ tratos ganados —el cliente recurrente, justo el que uno viene a
   * buscar— el alta muere en un 400 que **no tiene ningún campo en pantalla donde contestarse**.
   *
   * La edición que la pone en rojo: borrar `!adjuntar && ` de la condición, o devolver
   * `const adjuntar = …` a su lugar viejo (después de la validación). Verificado rompiéndola.
   */
  it("LA guarda: la validación del trato se saltea al adjuntar", () => {
    const src = sinComentarios(RUTA);
    const i = src.indexOf("exigeTratoGanado({");
    expect(i, "se movió la validación del trato; revisar esta guarda").toBeGreaterThan(0);
    expect(
      src.slice(Math.max(0, i - 120), i),
      "volvió a exigirse el trato al traer un proyecto: la pantalla no tiene dónde contestarlo",
    ).toContain("!adjuntar &&");
    expect(
      src.indexOf("const adjuntar ="),
      "`adjuntar` se calcula DESPUÉS de la validación, así que la condición lee undefined",
    ).toBeLessThan(i);
  });

  it("y la excepción deja rastro en vez de ser invisible", () => {
    /* Un proyecto facturable sin trato es indistinguible de uno al que alguien decidió no
       ponerle. Cobranza le auto-asigna el trato ganado más reciente de la empresa, que para un
       cliente recurrente puede ser el equivocado. Al menos queda auditable. */
    expect(sinComentarios(RUTA)).toContain("Traído de HubSpot sin trato elegido");
  });
});

describe("el proyecto ya tomado dice adónde ir", () => {
  /**
   * La pantalla ofrece "abrir el que ya existe" solo si el 409 trae los DOS ids (la URL del
   * proyecto los necesita). Mandando uno solo, esa rama es código muerto y la persona ve un
   * error crudo en vez de un lugar adonde ir. Invisible para `tsc` y para el build: los dos
   * extremos compilan y la cadena está cortada en el medio — el mismo modo de falla que ya nos
   * comimos con el cartel de los proyectos suprimidos.
   *
   * La edición que la pone en rojo: sacar `clientId` del cuerpo del 409 o de su `select`.
   */
  it("LA guarda: el 409 trae projectId Y clientId, y la pantalla los usa", () => {
    const src = sinComentarios("app/api/projects/route.ts");
    const i = src.indexOf("ya existe en Nexus como");
    expect(i, "se movió el 409 de proyecto tomado; revisar esta guarda").toBeGreaterThan(0);
    expect(
      src.slice(i, i + 220),
      "el 409 dejó de decir de qué cliente es: la pantalla no puede ofrecer abrirlo",
    ).toContain("clientId");
    expect(
      sinComentarios("components/projects/NuevoProyectoStepper.tsx"),
      "la pantalla dejó de rescatar el caso «ese proyecto ya está en Nexus»",
    ).toContain("res.status === 409 && data.projectId && data.clientId");
  });
});

describe("las tres puertas dicen lo que hacen", () => {
  /**
   * El problema que este trabajo resuelve es de VOCABULARIO, y el vocabulario se degrada de a
   * un botón por vez: son tres rótulos en tres archivos que nadie relaciona entre sí. Lo que se
   * congela no es el estilo, es que ninguno vuelva a nombrar la plomería de HubSpot ni a decir
   * «importar», que es la palabra que hacía que nadie entendiera cuál apretar.
   */
  const ROTULOS: Record<string, string> = {
    "app/(shell)/integrations/HubspotSystemCard.tsx": "Buscar empresas nuevas en HubSpot",
    "components/projects/NuevoProyectoStepper.tsx": "Agregar proyecto",
    "app/(shell)/clients/[id]/WorkspaceClient.tsx": "Traer de HubSpot",
  };

  it("LA guarda: cada puerta conserva su rótulo, sin jerga de CRM", () => {
    for (const [archivo, rotulo] of Object.entries(ROTULOS)) {
      const src = leer(archivo);
      expect(src, `${archivo} perdió su rótulo «${rotulo}»`).toContain(rotulo);
      expect(
        sinComentarios(archivo),
        `${archivo} volvió a nombrar la propiedad de HubSpot en pantalla`,
      ).not.toMatch(/Nexus\s*=\s*true/);
      expect(
        sinComentarios(archivo),
        `${archivo} volvió a decir «importar», que es la palabra que nadie entendía`,
      ).not.toMatch(/[Ii]mportar (clientes|proyectos|de HubSpot)/);
    }
  });

  it("y el botón del índice explica que también sirve para traer", () => {
    /* Sin esto, «Agregar proyecto» es más neutro que «Nuevo proyecto» pero igual de mudo: la
       persona sigue sin saber, ANTES de apretar, si esto le va a duplicar el proyecto que ya
       tiene en el CRM. La respuesta tiene que estar afuera del modal. */
    expect(
      sinComentarios("components/projects/NuevoProyectoStepper.tsx"),
      "el botón dejó de decir que también trae uno que ya existe",
    ).toContain("traé uno que ya existe en HubSpot");
  });

  it("y el importador masivo no se le ofrece a quien va a comer un 403", () => {
    /* La página entra con `configuracion.read` pero el endpoint exige `manage`. Con el nombre
       viejo la jerga funcionaba de barrera accidental; con uno amable, un control muerto se
       vuelve una trampa. */
    const src = sinComentarios("app/(shell)/integrations/HubspotSystemCard.tsx");
    expect(src, "el botón de importar dejó de gatearse por permiso").toContain(
      "configuracion?.manage",
    );
  });
});
