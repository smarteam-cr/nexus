import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { etiquetarAmbiguos, nombreYaUsado, ordenarPorAntiguedad } from "./lista-de-empresa";

/**
 * lib/projects/lista-de-empresa.test.ts — EL ORDEN Y LOS RÓTULOS de la lista de proyectos.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Encontrada EN VIVO el 2026-08-01, no en revisión: la lista viene de las asociaciones de la
 * empresa en HubSpot, y HubSpot devuelve esas asociaciones en orden distinto entre llamadas.
 * Medido: leí el orden por script, le dije al usuario "elegí la segunda opción", y el proyecto
 * quedó colgado de la PRIMERA.
 *
 * Esa lista alimenta el desplegable "¿de qué implementación cuelga?", y colgar decide
 * facturación: un desarrollo que cuelga no se factura aparte, cobra la implementación. O sea que
 * un orden inestable es un error de plata que no da error, no loguea nada, y se descubre semanas
 * después mirando HubSpot con atención.
 */

const p = (hubspotProjectId: string, name: string, createdAt: string | null) => ({
  hubspotProjectId,
  name,
  createdAt,
});

describe("el orden es determinista", () => {
  const LISTA = [
    p("300", "Sitio web", "2026-03-10T00:00:00.000Z"),
    p("100", "Implementación", "2025-12-30T21:32:10.645Z"),
    p("200", "Desarrollo", "2026-08-01T04:03:20.145Z"),
  ];

  it("del más viejo al más nuevo", () => {
    expect(ordenarPorAntiguedad(LISTA).map((x) => x.hubspotProjectId)).toEqual(["100", "300", "200"]);
  });

  it("LA MISMA LISTA AL REVÉS SALE IGUAL — el corazón de la guarda", () => {
    /* Es el assert que reproduce el bug. HubSpot devolvió los mismos proyectos en dos órdenes
       distintos; si el ordenamiento desaparece o se "simplifica", este assert es el que avisa. */
    const alDerecho = ordenarPorAntiguedad(LISTA).map((x) => x.hubspotProjectId);
    const alReves = ordenarPorAntiguedad([...LISTA].reverse()).map((x) => x.hubspotProjectId);
    expect(alReves).toEqual(alDerecho);
  });

  it("dos creados en el mismo instante desempatan por id, no por lo que trajo HubSpot", () => {
    /* Sin desempate, dos fechas iguales dejan el orden "como venía" — que es exactamente el
       orden en el que no se puede confiar. Con desempate, la función es determinista SIEMPRE. */
    const mismoInstante = [
      p("b", "Uno", "2026-01-01T00:00:00.000Z"),
      p("a", "Otro", "2026-01-01T00:00:00.000Z"),
    ];
    expect(ordenarPorAntiguedad(mismoInstante).map((x) => x.hubspotProjectId)).toEqual(["a", "b"]);
    expect(ordenarPorAntiguedad([...mismoInstante].reverse()).map((x) => x.hubspotProjectId)).toEqual(
      ["a", "b"],
    );
  });

  it("los que no tienen fecha van al final, ordenados entre sí", () => {
    // Ponerlos primero fingiría que son los más viejos; ponerlos al final solo dice "no sé".
    const conHuecos = [
      p("z", "Sin fecha", null),
      p("m", "Con fecha", "2026-05-05T00:00:00.000Z"),
      p("a", "Fecha ilegible", "no-es-una-fecha"),
    ];
    expect(ordenarPorAntiguedad(conHuecos).map((x) => x.hubspotProjectId)).toEqual(["m", "a", "z"]);
  });

  it("no muta la lista que recibe", () => {
    const original = [...LISTA];
    ordenarPorAntiguedad(LISTA);
    expect(LISTA).toEqual(original);
  });
});

describe("la etiqueta desambigua solo cuando hace falta", () => {
  it("nombres únicos → el nombre pelado, sin fecha", () => {
    /* Poner la fecha siempre sería más fácil de escribir y peor de leer: en el 99% de los
       clientes los nombres ya son únicos y la fecha ahí solo empuja al nombre. */
    const r = etiquetarAmbiguos([
      p("1", "Implementación", "2025-12-30T21:32:10.645Z"),
      p("2", "Sitio web", "2026-03-10T00:00:00.000Z"),
    ]);
    expect(r.map((x) => x.etiqueta)).toEqual(["Implementación", "Sitio web"]);
  });

  it("nombres repetidos → LOS DOS llevan su fecha", () => {
    // Etiquetar solo uno no resuelve nada: hay que poder comparar.
    const r = etiquetarAmbiguos([
      p("1", "Smarteam", "2025-12-30T21:32:10.645Z"),
      p("2", "Smarteam", "2026-08-01T04:03:20.145Z"),
    ]);
    expect(r[0].etiqueta).toContain("2025");
    expect(r[1].etiqueta).toContain("2026");
    expect(r[0].etiqueta).not.toBe(r[1].etiqueta);
  });

  it("«Smarteam» y «smarteam » son el mismo nombre para quien mira la pantalla", () => {
    const r = etiquetarAmbiguos([
      p("1", "Smarteam", "2025-12-30T00:00:00.000Z"),
      p("2", "smarteam ", "2026-08-01T00:00:00.000Z"),
    ]);
    expect(r[0].etiqueta).not.toBe(r[0].name);
    expect(r[1].etiqueta).not.toBe(r[1].name);
  });

  it("MISMO NOMBRE Y MISMO DÍA → escala a la hora", () => {
    /* Encontrado verificando el arreglo contra HubSpot: los dos proyectos de prueba se crearon
       el mismo día, así que la fecha sola los dejaba con la etiqueta IDÉNTICA. O sea que la
       desambiguación fallaba justo en el caso más probable — alguien dando de alta dos cosas en
       la misma sesión de trabajo. */
    const r = etiquetarAmbiguos([
      p("1", "Smarteam", "2026-07-31T14:03:20.000Z"),
      p("2", "Smarteam", "2026-07-31T22:19:00.000Z"),
    ]);
    expect(r[0].etiqueta).not.toBe(r[1].etiqueta);
    expect(r[0].etiqueta).toMatch(/\d{2}:\d{2}/);
  });

  it("MISMO NOMBRE Y MISMO MINUTO → escala al id, que es único por definición", () => {
    const r = etiquetarAmbiguos([
      p("575988892500", "Smarteam", "2026-07-31T22:19:10.000Z"),
      p("576011867452", "Smarteam", "2026-07-31T22:19:40.000Z"),
    ]);
    expect(r[0].etiqueta).not.toBe(r[1].etiqueta);
    expect(r[0].etiqueta).toContain("#");
  });

  it("el escalado se paga SOLO en las filas que chocan", () => {
    /* Dos homónimos del mismo día y un tercero distinto: el tercero no puede terminar con hora
       encima solo porque otros dos se pisaban. Cada escalón es más feo que el anterior. */
    const r = etiquetarAmbiguos([
      p("1", "Smarteam", "2026-07-31T14:00:00.000Z"),
      p("2", "Smarteam", "2026-07-31T22:00:00.000Z"),
      p("3", "Otro proyecto", "2026-07-31T18:00:00.000Z"),
    ]);
    expect(r[2].etiqueta).toBe("Otro proyecto");
    expect(r[0].etiqueta).toMatch(/\d{2}:\d{2}/);
  });

  it("tres homónimos: dos del mismo día suben, el de otro día se queda con la fecha", () => {
    // El caso REAL de Smarteam: un original de 2025 y dos pruebas del mismo día de 2026.
    const r = etiquetarAmbiguos([
      p("515775670329", "Smarteam", "2025-12-30T21:32:10.645Z"),
      p("576011867452", "Smarteam", "2026-07-31T04:03:20.145Z"),
      p("575989137521", "Smarteam", "2026-07-31T22:19:00.000Z"),
    ]);
    expect(new Set(r.map((x) => x.etiqueta)).size).toBe(3);
    // El de 2025 no choca con nadie a nivel día: no necesita hora.
    expect(r[0].etiqueta).not.toMatch(/\d{2}:\d{2}/);
    expect(r[0].etiqueta).toContain("2025");
  });

  it("repetidos SIN fecha → cae al id, feo pero distinguible", () => {
    /* Nunca se inventa un "(sin fecha)": no distingue nada y sugiere que falta un dato por error.
       Pero tampoco se deja dos filas idénticas, que es el problema entero. El id es feo y es lo
       único que siempre existe. */
    const r = etiquetarAmbiguos([p("111111", "Igual", null), p("222222", "Igual", null)]);
    expect(r[0].etiqueta).not.toBe(r[1].etiqueta);
    expect(r.every((x) => !x.etiqueta.includes("creado"))).toBe(true);
  });

  it("un solo elemento nunca se etiqueta", () => {
    expect(etiquetarAmbiguos([p("1", "Solo", "2026-01-01T00:00:00.000Z")])[0].etiqueta).toBe("Solo");
  });
});

describe("el aviso de nombre repetido", () => {
  const EXISTENTES = [{ name: "Smarteam" }, { name: "Onboarding CRM" }];

  it("detecta el choque sin importar mayúsculas ni espacios", () => {
    expect(nombreYaUsado("  smarteam ", EXISTENTES)).toBe("Smarteam");
  });

  it("devuelve el nombre GUARDADO, no el que se tipeó", () => {
    // Para que el aviso muestre cómo se llama de verdad el otro proyecto.
    expect(nombreYaUsado("SMARTEAM", EXISTENTES)).toBe("Smarteam");
  });

  it("un nombre libre no avisa", () => {
    expect(nombreYaUsado("Prueba alta 2", EXISTENTES)).toBeNull();
  });

  it("el campo vacío no avisa", () => {
    // Mientras se escribe, el campo pasa por vacío: avisar ahí sería ruido en cada tecla.
    expect(nombreYaUsado("   ", EXISTENTES)).toBeNull();
  });
});

describe("la ruta no vuelve a confiar en el orden de HubSpot", () => {
  const RUTA = "app/api/handoffs/projects-of-company/route.ts";

  it("ordena antes de responder", () => {
    /* Sin esto, alguien "simplifica" la ruta devolviendo `projects` directo y el bug vuelve
       entero: los tests de arriba seguirían verdes porque la función pura sigue estando bien. */
    const src = fs.readFileSync(path.join(process.cwd(), RUTA), "utf8");
    expect(src, `${RUTA} dejó de importar el ordenamiento`).toContain("ordenarPorAntiguedad");
    expect(src).toContain("ordenarPorAntiguedad(projects)");
  });
});
