import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalisisGuardado, Hallazgo } from "../foto";
import type { HechosDelPortal } from "./hechos";
import type { DefDeReporte } from "../reportes";
import { esquemaDelAnalisis, MODELO_DEL_ANALISIS, pedidoDelAnalisis } from "./prompt";
import { decidirHallazgos, leerAnalisis, MAX_HALLAZGOS, unirConLoConfirmado } from "./validar";

/**
 * lib/auditoria-portal/analisis/validar.test.ts — LO QUE DEVUELVE EL MODELO NO PASA SIN COMPROBAR.
 * Un hallazgo con una cifra que no está en los datos se cae: es la única forma de que el informe no
 * le muestre al cliente un número inventado con cara de dato.
 */

const HECHOS: HechosDelPortal = {
  hechos: [
    { clave: "portal.totales", seccion: "portal", etiqueta: "Totales del portal", texto: "Contactos 1.000, empresas 200, negocios 120, tickets 40" },
    { clave: "ciclo.contactos", seccion: "ciclo_de_vida", etiqueta: "Contactos por etapa", texto: "Lead 700 (70,0 %), MQL 5 (0,5 %), Cliente 120 (12,0 %)" },
  ],
  detalle: "- Califica leads | encendido",
  cliente: "[Planificación · Implementación] El ciclo tiene 4 etapas.",
};

const REPORTES: DefDeReporte[] = [
  { id: "ciclo.contactos", seccion: "ciclo", titulo: "Contactos por etapa", queMuestra: "…" },
  { id: "pipeline.p1", seccion: "pipelines", titulo: "«Ventas»", queMuestra: "…" },
];

const hallazgo = (extra: Record<string, unknown> = {}) => ({
  seccion: "ciclo_de_vida",
  severidad: "atencion",
  titulo: "El MQL casi no se usa",
  hallazgo: "Solo 5 contactos están en MQL contra 700 en Lead.",
  porQueImporta: "Marketing no puede medir qué le pasa a Ventas.",
  recomendacion: "Define cuándo un lead pasa a MQL.",
  decision: "corregir",
  evidencia: ["ciclo.contactos", "clave.inventada"],
  pregunta: "",
  ...extra,
});

const leer = (r: unknown) => leerAnalisis(JSON.stringify(r), HECHOS);

describe("leerAnalisis", () => {
  it("lee un análisis válido, filtra la evidencia a claves que existen y numera", () => {
    const a = leer({ resumen: "El portal tiene 1.000 contactos. Casi todos están en Lead.", hallazgos: [hallazgo()], preguntas: ["¿Quién define un MQL?"] })!;
    expect(a.resumen).toBe("El portal tiene 1.000 contactos. Casi todos están en Lead.");
    expect(a.hallazgos).toHaveLength(1);
    expect(a.hallazgos[0]).toMatchObject({ id: "h1", estado: "sugerido", evidencia: ["ciclo.contactos"], pregunta: null });
    expect(a.descartadosPorCifras).toBe(0);
  });

  it("tira el hallazgo con una cifra que no sale de los datos, y lo cuenta", () => {
    const a = leer({
      resumen: "Hay mucho por ordenar.",
      hallazgos: [hallazgo({ hallazgo: "Hay 3.400 contactos duplicados." }), hallazgo({ titulo: "Otro" })],
      preguntas: [],
    })!;
    expect(a.hallazgos.map((h) => h.titulo)).toEqual(["Otro"]);
    expect(a.hallazgos[0]!.id).toBe("h1");
    expect(a.descartadosPorCifras).toBe(1);
  });

  it("del resumen saca solo la frase con la cifra inventada", () => {
    const a = leer({ resumen: "El portal tiene 1.000 contactos. El 85 % no sirve. Hay que ordenar el ciclo.", hallazgos: [hallazgo()], preguntas: [] })!;
    expect(a.resumen).toBe("El portal tiene 1.000 contactos. Hay que ordenar el ciclo.");
  });

  it("descarta lo que no respeta los valores cerrados", () => {
    const a = leer({ resumen: "Resumen.", hallazgos: [hallazgo({ severidad: "grave" }), hallazgo({ decision: "borrar" }), hallazgo({ seccion: "otra" })], preguntas: [] })!;
    expect(a.hallazgos).toEqual([]);
  });

  it("topes: hallazgos y preguntas", () => {
    const muchos = Array.from({ length: 15 }, (_, i) => hallazgo({ titulo: `Hallazgo ${String.fromCharCode(65 + i)}` }));
    const a = leer({ resumen: "Resumen.", hallazgos: muchos, preguntas: Array.from({ length: 9 }, (_, i) => `¿Pregunta ${i}?`) })!;
    expect(a.hallazgos).toHaveLength(MAX_HALLAZGOS);
    expect(a.preguntas).toHaveLength(6);
  });

  it("lo que no es un análisis no pasa", () => {
    expect(leerAnalisis("no es json", HECHOS)).toBeNull();
    expect(leer({ resumen: "", hallazgos: [], preguntas: [] })).toBeNull();
  });
});

describe("leerAnalisis · el estado y las lecturas", () => {
  const conLecturas = (extra: Record<string, unknown>) =>
    leerAnalisis(JSON.stringify({ estado: { titular: "El portal registra, pero no ordena", parrafo: "Tiene 1.000 contactos." }, secciones: [], reportes: [], hallazgos: [], preguntas: [], ...extra }), HECHOS, REPORTES.map((r) => r.id))!;

  it("lee el estado y lo guarda también como resumen", () => {
    const a = conLecturas({});
    expect(a.estado).toEqual({ titular: "El portal registra, pero no ordena", parrafo: "Tiene 1.000 contactos." });
    expect(a.resumen).toBe("Tiene 1.000 contactos.");
  });

  it("el titular con una cifra inventada se vacía; del párrafo se cae la frase", () => {
    const a = conLecturas({ estado: { titular: "El 85 % del portal no sirve", parrafo: "Tiene 1.000 contactos. Hay 9.999 duplicados." } });
    expect(a.estado).toEqual({ titular: "", parrafo: "Tiene 1.000 contactos." });
  });

  it("una lectura por sección, solo de las secciones conocidas", () => {
    const a = conLecturas({ secciones: [{ seccion: "ciclo", lectura: "Casi todo está en Lead." }, { seccion: "otra", lectura: "No." }, { seccion: "ciclo", lectura: "Repetida." }] });
    expect(a.lecturasDeSeccion).toEqual({ ciclo: "Casi todo está en Lead." });
  });

  it("las lecturas de reporte: solo ids de la pantalla y sin cifras inventadas (se caen enteras)", () => {
    const a = conLecturas({
      reportes: [
        { reporte: "ciclo.contactos", lectura: "700 de 1.000 contactos siguen en Lead: el embudo no avanza." },
        { reporte: "pipeline.p1", lectura: "El 77 % de los negocios abiertos no se mueve." },
        { reporte: "reporte.inventado", lectura: "Algo." },
      ],
    });
    expect(a.lecturasDeReporte).toEqual({ "ciclo.contactos": "700 de 1.000 contactos siguen en Lead: el embudo no avanza." });
  });

  it("las cifras del cliente también cuentan como respaldo", () => {
    const a = conLecturas({ secciones: [{ seccion: "ciclo", lectura: "La Planificación define 4 etapas." }] });
    expect(a.lecturasDeSeccion.ciclo).toBe("La Planificación define 4 etapas.");
  });

  it("el dato del hallazgo entra en el control de cifras", () => {
    const a = conLecturas({ hallazgos: [hallazgo({ dato: "4.321 contactos" }), hallazgo({ titulo: "Con dato", dato: "700 en Lead" })] });
    expect(a.hallazgos.map((h) => [h.titulo, h.dato])).toEqual([["Con dato", "700 en Lead"]]);
    expect(a.descartadosPorCifras).toBe(1);
  });

  it("sin la lista de reportes no acepta ninguna lectura de reporte", () => {
    const a = leerAnalisis(JSON.stringify({ estado: { titular: "Algo", parrafo: "" }, reportes: [{ reporte: "ciclo.contactos", lectura: "Bien." }], hallazgos: [], preguntas: [] }), HECHOS)!;
    expect(a.lecturasDeReporte).toEqual({});
  });
});

describe("unirConLoConfirmado", () => {
  const h = (titulo: string, estado: Hallazgo["estado"]): Hallazgo => ({
    id: "x",
    seccion: "workflows",
    severidad: "atencion",
    titulo,
    hallazgo: "…",
    porQueImporta: "",
    recomendacion: "",
    decision: "investigar",
    evidencia: [],
    pregunta: null,
    estado,
    ...(estado === "confirmado" ? { decididoPor: "Persona del equipo", decididoEn: "2026-10-04T12:00:00.000Z" } : {}),
  });

  it("al volver a generar, lo confirmado se queda con quién lo confirmó; lo demás se reemplaza", () => {
    const antes = [h("Etapas sin usar", "confirmado"), h("Sugerido viejo", "sugerido"), h("Descartado viejo", "descartado")];
    const nuevos = [h("Etapas  sin úsar", "sugerido"), h("Nuevo", "sugerido")];
    const unidos = unirConLoConfirmado(antes, nuevos);
    expect(unidos.map((x) => [x.id, x.titulo, x.estado])).toEqual([
      ["h1", "Etapas sin usar", "confirmado"],
      ["h2", "Nuevo", "sugerido"],
    ]);
    expect(unidos[0]!.decididoPor).toBe("Persona del equipo");
  });

  it("sin análisis anterior son los nuevos tal cual", () => {
    expect(unirConLoConfirmado(undefined, [h("A", "sugerido")]).map((x) => x.titulo)).toEqual(["A"]);
  });
});

describe("decidirHallazgos", () => {
  const h = (id: string, titulo: string): Hallazgo => ({
    id,
    seccion: "workflows",
    severidad: "atencion",
    titulo,
    hallazgo: "…",
    porQueImporta: "",
    recomendacion: "",
    decision: "investigar",
    evidencia: [],
    pregunta: null,
    estado: "sugerido",
  });
  const analisis = (generadoEn: string, hallazgos: Hallazgo[]): AnalisisGuardado => ({
    generadoEn,
    modelo: "modelo",
    agentRunId: null,
    resumen: "",
    hallazgos,
    preguntas: [],
    descartadosPorCifras: 0,
    etiquetas: {},
  });
  const pedido = { ids: ["h2"], estado: "confirmado" as const, quien: "Persona del equipo", en: "2026-10-05T12:00:00.000Z" };

  it("si mientras tanto se generó otro análisis, 409 y no toca nada: «h2» ya es otro hallazgo", () => {
    /* La persona veía el análisis de las 10:00 (h2 = «Etapas sin usar»); al volver a generarlo, h2 pasó a
       ser «Workflows sin dueño». Lo que lo pone en rojo: aplicar los ids sin comparar el `generadoEn`. */
    const nuevo = analisis("2026-10-05T11:00:00.000Z", [h("h1", "Confirmado de antes"), h("h2", "Workflows sin dueño")]);
    const r = decidirHallazgos(nuevo, { ...pedido, generadoEn: "2026-10-05T10:00:00.000Z" });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(nuevo.hallazgos.every((x) => x.estado === "sugerido")).toBe(true);
    // La ruta decide con esto, sobre la foto leída con la fila bloqueada (no sobre la del guard).
    const ruta = readFileSync(join(process.cwd(), "app/api/audits/[id]/hallazgos/route.ts"), "utf8");
    expect(ruta).toMatch(/actualizarFoto\(id, \(f\) => \{\s*const r = decidirHallazgos\(f\.analisis, pedido\)/);
  });

  it("con el mismo análisis, decide sobre esos ids con quién y cuándo", () => {
    const visto = analisis("2026-10-05T10:00:00.000Z", [h("h1", "Uno"), h("h2", "Etapas sin usar")]);
    const r = decidirHallazgos(visto, { ...pedido, generadoEn: "2026-10-05T10:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analisis.hallazgos.map((x) => [x.id, x.estado, x.decididoPor ?? null])).toEqual([
      ["h1", "sugerido", null],
      ["h2", "confirmado", "Persona del equipo"],
    ]);
  });
});

describe("pedidoDelAnalisis", () => {
  it("pide salida estructurada con el modelo vigente, pensamiento adaptativo y sin forzar herramientas", () => {
    const p = pedidoDelAnalisis({ hechos: HECHOS, reportes: REPORTES, criterios: [{ titulo: "Criterio", contenido: "Texto" }] });
    expect(p.model).toBe(MODELO_DEL_ANALISIS);
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.tool_choice).toBeUndefined();
    expect(p.output_config?.format).toMatchObject({ type: "json_schema" });
    const texto = JSON.stringify(p.messages);
    expect(texto).toContain("[portal.totales]");
    expect(texto).toContain("CRITERIOS DE SMARTEAM");
    expect(texto).toContain("[pipeline.p1]");
    expect(texto).toContain("LO QUE NEXUS SABE DEL CLIENTE");
  });

  it("el esquema obliga a todas las claves de un hallazgo (sin opcionales ni extras)", () => {
    const item = esquemaDelAnalisis(REPORTES).properties.hallazgos.items;
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
    expect(item.additionalProperties).toBe(false);
  });

  it("los reportes del esquema son exactamente los de la pantalla", () => {
    expect(esquemaDelAnalisis(REPORTES).properties.reportes.items.properties.reporte.enum).toEqual(["ciclo.contactos", "pipeline.p1"]);
    expect(esquemaDelAnalisis([]).properties.reportes.items.properties.reporte.enum).toEqual(["ninguno"]);
  });
});
