/**
 * lib/planificacion/brief-importado.test.ts — el Brief de implementación traído a la Planificación (2026-10-29), la
 * plantilla sugerida (pregunta 44) y lo puro del lote.
 */
import { describe, expect, it } from "vitest";
import {
  BRIEF_IMPORTADO_KEY,
  TOPE_DE_CELDA,
  TOPE_DE_COLUMNAS,
  TOPE_DE_FILAS,
  TOPE_DE_PESTANAS,
  adoptarBrief,
  briefDesdeLibro,
  briefImportadoVacio,
  briefParaElPrompt,
  filasConAlgo,
  pestanaDesdeCeldas,
} from "./brief-importado";
import { filaDelArchivoDeBriefs, hojaNombraAlCliente, proyectoParaLaHoja } from "./brief-en-lote";
import { EQUIPO_CHICO, PLANTILLA_COMPLETA, PLANTILLA_ESENCIAL, plantillaSugeridaDeLaPlanificacion, totalDeAsientos } from "./plantilla-sugerida";
import { hiddenKeysFrom, SECCIONES_SOLO_INTERNAS } from "@/lib/business-cases/section-briefs";
import { PLANIFICACION_DEF_BY_KEY, PLANIFICACION_ESENCIAL_TEMPLATE, PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";

const META = { importadoEn: "2026-10-29T12:00:00.000Z", importadoPor: "ana@smarteamcr.com" };

describe("la pestaña que se guarda", () => {
  it("recorta las filas y columnas vacías de los bordes; las del medio separan bloques y se quedan", () => {
    const p = pestanaDesdeCeldas("Usuarios", [["", "", ""], ["Nombre", "Correo", ""], ["", "", ""], ["Ana", "ana@x.test", ""], ["", "", ""]])!;
    expect(p.filas).toEqual([["Nombre", "Correo"], ["", ""], ["Ana", "ana@x.test"]]);
    expect(p.recortada).toBeUndefined();
  });

  it("una pestaña sin nada no se guarda", () => {
    expect(pestanaDesdeCeldas("Vacía", [["", " "], []])).toBeNull();
  });

  it("los topes se respetan y la pestaña dice que se cortó", () => {
    const alta = Array.from({ length: TOPE_DE_FILAS + 3 }, (_, i) => [`f${i}`]);
    expect(pestanaDesdeCeldas("Alta", alta)!.filas).toHaveLength(TOPE_DE_FILAS);
    expect(pestanaDesdeCeldas("Alta", alta)!.recortada).toBe(true);
    const ancha = pestanaDesdeCeldas("Ancha", [Array.from({ length: TOPE_DE_COLUMNAS + 3 }, () => "x")])!;
    expect(ancha.filas[0]).toHaveLength(TOPE_DE_COLUMNAS);
    expect(ancha.recortada).toBe(true);
    const larga = pestanaDesdeCeldas("Larga", [["x".repeat(TOPE_DE_CELDA + 10)]])!;
    expect(larga.filas[0][0].length).toBe(TOPE_DE_CELDA);
  });

  it("el libro saca las vacías y tiene tope de pestañas", () => {
    const pestanas = Array.from({ length: TOPE_DE_PESTANAS + 2 }, (_, i) => ({ nombre: `P${i}`, celdas: [["a"]] }));
    const b = briefDesdeLibro({ titulo: "Brief", url: "https://x", pestanas: [{ nombre: "Vacía", celdas: [[""]] }, ...pestanas] }, META);
    expect(b.pestanas).toHaveLength(TOPE_DE_PESTANAS);
    expect(b.pestanas[0].nombre).toBe("P0");
    expect(b.importadoPor).toBe(META.importadoPor);
  });
});

describe("lo guardado", () => {
  const brief = briefDesdeLibro({ titulo: "Brief ACME", url: "https://x", pestanas: [{ nombre: "Usuarios", celdas: [["Ana", "Ventas"], ["", ""], ["Luis", ""]] }] }, META);

  it("vacío se reconoce; una data rota no rompe", () => {
    expect(briefImportadoVacio(null)).toBe(true);
    expect(briefImportadoVacio({ pestanas: [{ nombre: "x", filas: [["", ""]] }] })).toBe(true);
    expect(briefImportadoVacio(brief)).toBe(false);
    expect(adoptarBrief({ pestanas: "no", titulo: 3 }).pestanas).toEqual([]);
    expect(adoptarBrief({ pestanas: [null, { filas: [["a", 1]] }] }).pestanas).toEqual([{ nombre: "Sin nombre", filas: [["a", ""]] }]);
  });

  it("cuenta las filas con algo", () => {
    expect(filasConAlgo(brief)).toBe(2);
  });

  it("para el agente: por pestaña y sin celdas vacías; sin Brief, nada", () => {
    expect(briefParaElPrompt(brief)).toBe("## Usuarios\nAna | Ventas\nLuis");
    expect(briefParaElPrompt(null)).toBe("");
  });

  it("para el agente una celda vacía del medio se marca: los valores no se corren de columna", () => {
    const b = briefDesdeLibro({ titulo: "B", url: "", pestanas: [{ nombre: "Etapas", celdas: [["Etapa", "Probabilidad", "Dueño"], ["Calificado", "", "Ana"]] }] }, META);
    expect(briefParaElPrompt(b)).toBe("## Etapas\nEtapa | Probabilidad | Dueño\nCalificado | — | Ana");
  });

  it("para el agente tiene tope, y lo dice", () => {
    const grande = briefDesdeLibro(
      { titulo: "G", url: "", pestanas: Array.from({ length: 6 }, (_, i) => ({ nombre: `P${i}`, celdas: Array.from({ length: 100 }, () => ["x".repeat(100)]) })) },
      META,
    );
    const t = briefParaElPrompt(grande, 15_000);
    expect(t.length).toBeLessThan(15_100);
    expect(t).toContain("no entró entero");
  });
});

describe("⛔ el Brief es solo del equipo", () => {
  it("cuenta como oculta aunque el Json diga otra cosa: el enlace del cliente, el PDF y publicar leen de ahí", () => {
    expect(SECCIONES_SOLO_INTERNAS.has(BRIEF_IMPORTADO_KEY)).toBe(true);
    expect(hiddenKeysFrom([{ key: BRIEF_IMPORTADO_KEY, label: "x", hidden: false }]).has(BRIEF_IMPORTADO_KEY)).toBe(true);
    expect(hiddenKeysFrom(null).has(BRIEF_IMPORTADO_KEY)).toBe(true);
  });

  it("la definición la marca solo interna y curada; va en las dos plantillas", () => {
    const def = PLANIFICACION_DEF_BY_KEY[BRIEF_IMPORTADO_KEY];
    expect(def.soloInterna).toBe(true);
    expect(def.agentGenerated).toBe(false);
    for (const t of [PLANIFICACION_TEMPLATE, PLANIFICACION_ESENCIAL_TEMPLATE]) {
      expect(t.sections.map((s) => s.key), t.id).toContain(BRIEF_IMPORTADO_KEY);
    }
  });

  it("el título y las fechas solas no son contenido", () => {
    expect(briefImportadoVacio({ titulo: "Brief", url: "https://x", importadoEn: "hoy", pestanas: [] })).toBe(true);
  });
});

describe("la plantilla sugerida", () => {
  const base = { etiquetas: [] as string[], asientos: null, adopcion: null, tieneBrief: false };

  it("por pilotos manda, aunque sea un hub y traiga el Brief", () => {
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub"], adopcion: "por_pilotos", tieneBrief: true }).plantilla).toBe(PLANTILLA_COMPLETA);
  });

  it("el desarrollo a medida pide la arquitectura", () => {
    const r = plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub", "custom_dev"], tieneBrief: true });
    expect(r.plantilla).toBe(PLANTILLA_COMPLETA);
    expect(r.razon).toMatch(/arquitectura/);
  });

  it("tres hubs, o dos con un equipo grande: completa", () => {
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub", "marketing_hub", "service_hub"] }).plantilla).toBe(PLANTILLA_COMPLETA);
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub", "marketing_hub"], asientos: EQUIPO_CHICO + 1 }).plantilla).toBe(PLANTILLA_COMPLETA);
  });

  it("con el Brief traído, la esencial, aunque sean dos hubs", () => {
    const r = plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub", "marketing_hub"], tieneBrief: true });
    expect(r.plantilla).toBe(PLANTILLA_ESENCIAL);
    expect(r.razon).toMatch(/Brief/);
  });

  it("un hub con un equipo chico o sin datos: esencial, y la razón dice cuántos", () => {
    const r = plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub"], asientos: 1 });
    expect(r.plantilla).toBe(PLANTILLA_ESENCIAL);
    expect(r.razon).toContain("1 hub y un equipo de 1 usuario");
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub"], asientos: 15 }).razon).toMatch(/^Proyecto con 1 hub y un equipo de 15 usuarios:/);
    expect(plantillaSugeridaDeLaPlanificacion(base).plantilla).toBe(PLANTILLA_ESENCIAL);
  });

  it("un hub con un equipo grande, o dos sin datos: completa", () => {
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub"], asientos: EQUIPO_CHICO + 1 }).plantilla).toBe(PLANTILLA_COMPLETA);
    expect(plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["sales_hub", "marketing_hub"] }).plantilla).toBe(PLANTILLA_COMPLETA);
  });

  it("un nombre muerto de hub cuenta como su hub (Operations → Data)", () => {
    const r = plantillaSugeridaDeLaPlanificacion({ ...base, etiquetas: ["operations_hub", "data_hub", "sales_hub"] });
    expect(r.razon).toContain("2 hubs");
  });

  it("los asientos de la copia de Partner se suman", () => {
    expect(totalDeAsientos({ core: { limit: 3 }, sales: { limit: 2 }, service: null })).toBe(5);
    expect(totalDeAsientos(null)).toBeNull();
    expect(totalDeAsientos({ core: { limit: 0 } })).toBeNull();
    expect(totalDeAsientos({ core: { limit: -1 }, sales: { limit: 2 } })).toBe(2);
  });
});

describe("el lote de Briefs", () => {
  const P = [
    { id: "a", nombre: "Alfa CRM", cliente: "Alfa" },
    { id: "b", nombre: "Grupo Alfa Web", cliente: "Grupo Alfa" },
    { id: "c", nombre: "Beta Implementación", cliente: "Beta" },
    { id: "d", nombre: "Beta Sitio", cliente: "Beta" },
  ];

  it("propone el cliente entero en el título, sin acentos ni mayúsculas; el más largo gana", () => {
    expect(proyectoParaLaHoja("BRIEF DE IMPLEMENTACIÓN - ALFA", P)).toMatchObject({ tipo: "uno", id: "a" });
    expect(proyectoParaLaHoja("Brief Grupo Alfa", P)).toMatchObject({ tipo: "uno", id: "b" });
  });

  it("⛔ no calza por pedazos de palabra", () => {
    expect(proyectoParaLaHoja("Brief Alfabeto", P)).toEqual({ tipo: "ninguno" });
  });

  it("⛔ dos clientes distintos en el título: no propone ninguno", () => {
    const con = [...P, { id: "e", nombre: "Beta Corp CRM", cliente: "Beta Corp" }];
    expect(proyectoParaLaHoja("Brief Alfa y Beta Corp", con)).toEqual({ tipo: "varios", candidatos: ["Alfa", "Beta Corp"] });
  });

  it("varios proyectos del cliente: los deja a una persona, salvo que el título nombre uno", () => {
    expect(proyectoParaLaHoja("Brief Beta", P)).toEqual({ tipo: "varios", candidatos: ["Beta Implementación", "Beta Sitio"] });
    expect(proyectoParaLaHoja("Brief Beta Sitio", P)).toMatchObject({ tipo: "uno", id: "d" });
  });

  it("el aviso de un enlace de otra cuenta compara el nombre entero", () => {
    expect(hojaNombraAlCliente("BRIEF - SmartAgro", "SmartAgro")).toBe(true);
    expect(hojaNombraAlCliente("BRIEF - Cemaco", "SmartAgro")).toBe(false);
  });

  it("el archivo: comentarios y líneas incompletas no son filas; el correo cae al de --como", () => {
    expect(filaDelArchivoDeBriefs("# nota", "a@x")).toEqual([]);
    expect(filaDelArchivoDeBriefs(",https://x,a@x", "a@x")).toEqual([]);
    expect(filaDelArchivoDeBriefs("p1,https://x", "a@x")).toEqual([{ projectId: "p1", url: "https://x", correo: "a@x" }]);
    expect(filaDelArchivoDeBriefs("p1,https://x,b@x", "a@x")).toEqual([{ projectId: "p1", url: "https://x", correo: "b@x" }]);
  });
});
