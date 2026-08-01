import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { exigeTratoGanado, pipelineByKey, projectCapabilities, type ProjectPipelineKey } from "./kind";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

/**
 * lib/projects/exige-trato.test.ts — CUÁNDO el alta pide trato ganado, y quién puede dar de alta.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * "Pedir trato ganado salvo internos y salvo hermanos" escrito como lista de excepciones es una
 * COPIA de la tabla de decisiones. El día que una fila cambie de opinión sobre si cobra, la
 * copia se queda vieja — y el síntoma es o facturar sin nada firmado, o bloquear un alta
 * legítima. Por eso la regla se deriva de `cobranza`, y este archivo lo ata.
 */

const CASOS: Array<{
  caso: string;
  pipeline: ProjectPipelineKey;
  interno: boolean;
  hermano: boolean;
  exige: boolean;
}> = [
  // Implementaciones: siempre cobran (Customer Success no puede ser hermano de nadie).
  { caso: "Implementación normal", pipeline: "customer-success", interno: false, hermano: false, exige: true },
  { caso: "Implementación con «hermano» — CS no puede colgar de nadie, así que cobra igual", pipeline: "customer-success", interno: false, hermano: true, exige: true },
  { caso: "Implementación INTERNA de Smarteam", pipeline: "customer-success", interno: true, hermano: false, exige: false },

  // Desarrollo: cobra si va solo; si cuelga de una implementación, cobra el principal.
  { caso: "Desarrollo que va solo", pipeline: "development", interno: false, hermano: false, exige: true },
  { caso: "Desarrollo que cuelga de una implementación", pipeline: "development", interno: false, hermano: true, exige: false },
  { caso: "Desarrollo INTERNO", pipeline: "development", interno: true, hermano: false, exige: false },
  { caso: "Desarrollo interno Y colgado", pipeline: "development", interno: true, hermano: true, exige: false },

  // Sitios web: mismo trato que Desarrollo.
  { caso: "Sitio web que va solo", pipeline: "web", interno: false, hermano: false, exige: true },
  { caso: "Sitio web que cuelga de una implementación", pipeline: "web", interno: false, hermano: true, exige: false },
  { caso: "Sitio web INTERNO", pipeline: "web", interno: true, hermano: false, exige: false },
];

describe("cuándo el alta exige trato ganado — tabla transcrita", () => {
  for (const c of CASOS) {
    it(`${c.caso} → ${c.exige ? "exige trato" : "puede ir sin trato"}`, () => {
      expect(
        exigeTratoGanado({
          pipeline: pipelineByKey(c.pipeline),
          interno: c.interno,
          tieneHermano: c.hermano,
        }),
      ).toBe(c.exige);
    });
  }

  it("es EXACTAMENTE `cobranza`, no una segunda opinión", () => {
    /* Escrito aparte de la tabla de arriba a propósito: si alguien "arregla" una fila de allá,
       este assert la enfrenta contra la tabla de decisiones y nombra a los dos archivos. */
    for (const c of CASOS) {
      const caps = projectCapabilities({
        hubspotPipelineId: pipelineByKey(c.pipeline).hubspotPipelineId,
        interno: c.interno,
        tieneHermanoCs: c.hermano,
        altaEnCurso: false,
      });
      expect(
        exigeTratoGanado({ pipeline: pipelineByKey(c.pipeline), interno: c.interno, tieneHermano: c.hermano }),
        `«${c.caso}»: la regla del trato y \`cobranza\` de lib/projects/kind.ts dejaron de coincidir`,
      ).toBe(caps.cobranza);
    }
  });

  it("cubre las tres filas de la tabla, no dos", () => {
    expect(new Set(CASOS.map((c) => c.pipeline))).toEqual(
      new Set(["customer-success", "development", "web"]),
    );
  });
});

describe("quién puede dar de alta un proyecto", () => {
  /**
   * La única ampliación real de la tanda es CSL. Hasta ahora un líder de CS podía editar,
   * generar y regenerar un handoff pero no arrancar el proyecto que lo contiene — una asimetría
   * que existía solo porque el botón de alta vivía dentro del asistente de Ventas.
   */
  const puede = (rol: keyof typeof DEFAULT_MATRIX) =>
    DEFAULT_MATRIX[rol].sections.proyectos?.create === true;

  it("Ventas, Desarrollo y los líderes de CS sí", () => {
    expect(puede("VENTAS")).toBe(true);
    expect(puede("DEV")).toBe(true);
    expect(puede("CSL")).toBe(true);
  });

  it("el CSE no: dar de alta mueve datos que después deciden facturación", () => {
    expect(puede("CSE")).toBe(false);
  });

  it("SUPER_ADMIN por su all-true, no por una entrada suelta", () => {
    expect(puede("SUPER_ADMIN")).toBe(true);
  });

  it("NO se tocó la capacidad de handoff: son dos permisos distintos", () => {
    /* Dar de alta un proyecto y redactar su documento son cosas distintas. Mezclarlas obligaría
       a romper las dos tablas congeladas de roles para resolver un pedido que no es el de ellas. */
    expect(DEFAULT_MATRIX.CSL.sections.handoff?.create ?? false).toBe(false);
    expect(DEFAULT_MATRIX.VENTAS.sections.handoff?.create).toBe(true);
  });
});

describe("el alta no puede tocar la plata", () => {
  const RAIZ = process.cwd();
  const ENDPOINT = "app/api/projects/route.ts";
  const MOTOR = "lib/projects/alta-runner.ts";

  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  /** Solo CÓDIGO: los comentarios de estos archivos nombran las columnas para prohibirlas. */
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  /**
   * Los bloques `data: { … }` de Prisma — o sea, las ESCRITURAS. Se extraen por llaves
   * balanceadas y no por regex: un `data:` puede tener objetos anidados adentro, y una regex
   * cortaría en la primera llave que cierra. Es el mismo método que usa la guarda del creador
   * único, por la misma razón.
   */
  const bloquesDeEscritura = (src: string): string[] => {
    const out: string[] = [];
    const limpio = sinComentarios(src);
    let i = limpio.indexOf("data: {");
    while (i >= 0) {
      let profundidad = 0;
      let j = limpio.indexOf("{", i);
      const desde = j;
      for (; j < limpio.length; j++) {
        if (limpio[j] === "{") profundidad++;
        else if (limpio[j] === "}" && --profundidad === 0) break;
      }
      out.push(limpio.slice(desde, j + 1));
      i = limpio.indexOf("data: {", j);
    }
    return out;
  };

  /**
   * Las dos columnas con las que Cobranza factura. `anchorStartDate` vive en el cronograma y su
   * copia congelada en el servicio contratado: si el alta escribiera una fecha estimada en
   * cualquiera de las dos, una suposición se volvería una factura.
   */
  for (const archivo of [ENDPOINT, MOTOR]) {
    it(`${archivo} no nombra ninguna de las dos columnas de plata`, () => {
      const codigo = sinComentarios(leer(archivo));
      expect(codigo, `${archivo} nombra anchorStartDate`).not.toContain("anchorStartDate");
      expect(codigo, `${archivo} nombra fechaInicioFacturacion`).not.toContain("fechaInicioFacturacion");
    });
  }

  it("el escaneo mira código, no comentarios (si no, no prueba nada)", () => {
    /* El endpoint DOCUMENTA las dos columnas en su encabezado, a propósito. Si el escaneo mirara
       el archivo crudo saldría en rojo por la prohibición misma — y el arreglo obvio sería borrar
       la explicación. Este assert fija que el de arriba se apoya en el filtro. */
    expect(leer(ENDPOINT)).toContain("anchorStartDate");
    expect(sinComentarios(leer(ENDPOINT))).not.toContain("anchorStartDate");
  });

  it("el endpoint DERIVA la regla del trato en vez de escribirla a mano", () => {
    /* Si alguien reemplaza la llamada por un `if (pipeline.key !== "customer-success" || interno)`,
       vuelve la copia que este archivo entero existe para impedir. */
    expect(sinComentarios(leer(ENDPOINT))).toContain("exigeTratoGanado(");
  });

  it("el endpoint NO escribe la clase del proyecto: eso lo materializa el espejo", () => {
    /* Las cuatro columnas de clase tienen un escritor único (scope-coverage.test.ts). El alta
       guarda el RECIBO (`altaPipelineElegido`), que no decide nada. LEERLAS sí es legítimo —
       el paso del hermano lee `hubspotPipelineId` para confirmar que es una implementación—,
       así que se miran solo los bloques de escritura. */
    const escrituras = bloquesDeEscritura(leer(ENDPOINT));
    expect(escrituras.length, "no se encontró ninguna escritura: el extractor se quedó viejo").toBeGreaterThan(0);
    for (const bloque of escrituras) {
      for (const col of ["hubspotPipelineId:", "proyectoInterno:", "hermanoCsProjectId:", "hermanoCsHsId:"]) {
        expect(bloque, `el endpoint escribe ${col}`).not.toContain(col);
      }
    }
    expect(escrituras.join("\n")).toContain("altaPipelineElegido");
  });
});
