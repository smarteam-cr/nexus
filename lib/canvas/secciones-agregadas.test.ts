/**
 * lib/canvas/secciones-agregadas.test.ts — «+ Agregar sección» y «Duplicar» en los documentos del proyecto (2026-11-12).
 *
 * Correr: `npx vitest run lib/canvas/secciones-agregadas.test.ts --project unit`.
 *
 * Lo que protege, en palabras de Elías: una sección del catálogo que una persona agregó a un documento (una del
 * «Diagnóstico completo» en un «Diagnóstico esencial») sobrevive a generar o regenerar y la IA la llena; una copia hecha
 * con «Duplicar» se pinta como su original, va justo debajo y la IA no la pisa.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  conLasAgregadas,
  lugarDeLaNueva,
  motivoParaNoDuplicar,
  sePuedeBorrar,
  seccionesAgregables,
  seccionesAgregadas,
  sinMarcaLasDeLaPlantilla,
  templateConLasAgregadas,
  TOPE_DE_TOKENS_SIN_STREAMING,
} from "./secciones-agregadas";
import { entradasSegunLaPlantilla } from "@/lib/entregables/registro";
import { ordenDelContrato } from "./diagnostico-contrato";
import { catalogoDelTipo, defsDelTipo } from "@/lib/artefactos/catalogo";
import { seccionesQueSalenPorElEnlace } from "@/lib/artefactos/secciones-del-enlace";
import { TIPO_REQUERIMIENTO_TECNICO } from "@/lib/artefactos/tipos";
import { DIAGNOSTICO_ESENCIAL_TEMPLATE, DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import {
  defDeLaCopia,
  esCustomKey,
  keyParaDuplicar,
  nombreDeLaCopia,
  nuevaKeyDeCopia,
  originalDeLaCopia,
  tipoDeCustomKey,
  TOPE_DEL_NOMBRE_DE_SECCION,
} from "@/lib/landing/custom-sections";
import { buildLandingConfigFromOrder } from "@/components/landing/build-landing";
import type { SectionDef } from "@/components/landing/types";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Una del completo que el esencial no trae. */
const DEL_COMPLETO = "fortalezas";

describe("la marca de «agregada por una persona»", () => {
  it("se lee de las entries del Json, sin las reservadas", () => {
    const json = [
      { key: "objetivos", label: "Objetivos" },
      { key: DEL_COMPLETO, label: "Fortalezas", agregadaPorPersona: true },
      { key: "__plantilla", label: "__plantilla", agregadaPorPersona: true },
      "basura",
    ];
    expect(seccionesAgregadas(json)).toEqual([DEL_COMPLETO]);
    expect(seccionesAgregadas(null)).toEqual([]);
  });

  it("⭐ el ajuste a la plantilla la cuenta como de la plantilla: una con texto no se oculta, una oculta por la plantilla vuelve", () => {
    const deLaPlantilla = DIAGNOSTICO_ESENCIAL_TEMPLATE.sections.map((s) => s.key);
    const json = [{ key: DEL_COMPLETO, label: "Fortalezas", hidden: true, ocultaPorLaPlantilla: true, agregadaPorPersona: true }];
    const set = conLasAgregadas(deLaPlantilla, json);
    expect(set.has(DEL_COMPLETO)).toBe(true);
    // Lo que hace `ajustarALaPlantilla` con ese set: lo de afuera con texto se oculta; lo de adentro oculto por la plantilla, vuelve.
    const queNoTiene = DIAGNOSTICO_TEMPLATE.sections.map((s) => s.key).filter((k) => !set.has(k));
    expect(queNoTiene).not.toContain(DEL_COMPLETO);
    const { entradas } = entradasSegunLaPlantilla(json, { deLaPlantilla: set, conTextoFuera: [] });
    expect(entradas.find((e) => e.key === DEL_COMPLETO)).toMatchObject({ hidden: false, ocultaPorLaPlantilla: false, agregadaPorPersona: true });
  });

  it("sin la marca, la del completo sigue fuera del esencial (lo de siempre)", () => {
    const set = conLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE.sections.map((s) => s.key), [{ key: DEL_COMPLETO, label: "Fortalezas" }]);
    expect(set.has(DEL_COMPLETO)).toBe(false);
  });

  it("⛔ los tres ajustes a la plantilla la respetan (el del diagnóstico y la planificación, y el del kickoff)", () => {
    const diag = leer("lib/canvas/diagnostico-generate.ts");
    const ajuste = diag.slice(diag.indexOf("async function ajustarALaPlantilla"), diag.indexOf("async function prepararDiagnosticoEnBlanco"));
    expect(ajuste).toContain("conLasAgregadas(");
    const kick = leer("lib/canvas/kickoff-generate.ts");
    const ajusteK = kick.slice(kick.indexOf("async function ajustarElKickoffALaPlantilla"), kick.indexOf("async function asegurarEtiquetaDelServicio"));
    expect(ajusteK).toContain("conLasAgregadas(");
  });
});

describe("⭐ la IA escribe lo que agregó una persona", () => {
  it("el template del esencial gana la del completo, en el orden del canon, y la intro lo dice", () => {
    const t = templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, defsDelTipo("diagnosis") ?? [], [DEL_COMPLETO]);
    const keys = t.sections.map((s) => s.key);
    expect(keys).toContain(DEL_COMPLETO);
    const canon = (defsDelTipo("diagnosis") ?? []).map((d) => d.key);
    expect(keys).toEqual([...keys].sort((a, b) => canon.indexOf(a) - canon.indexOf(b)));
    expect(t.agentIntro).toContain("SECCIONES QUE AGREGÓ QUIEN EDITA ESTE DOCUMENTO");
    expect(t.agentIntro).toContain(`(${DEL_COMPLETO})`);
    // El resto del template no cambia: la misma identidad, la misma voz.
    expect(t.id).toBe(DIAGNOSTICO_ESENCIAL_TEMPLATE.id);
    expect(t.agentIntro?.startsWith(DIAGNOSTICO_ESENCIAL_TEMPLATE.agentIntro ?? "")).toBe(true);
  });

  it("sin agregadas nuevas devuelve EL MISMO template (generar manda exactamente lo de antes)", () => {
    expect(templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, defsDelTipo("diagnosis") ?? [], [])).toBe(DIAGNOSTICO_ESENCIAL_TEMPLATE);
    // La completa ya la trae: nada que sumar.
    expect(templateConLasAgregadas(DIAGNOSTICO_TEMPLATE, defsDelTipo("diagnosis") ?? [], [DEL_COMPLETO])).toBe(DIAGNOSTICO_TEMPLATE);
    // Una key que no es del catálogo no entra.
    expect(templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, defsDelTipo("diagnosis") ?? [], ["inventada"])).toBe(DIAGNOSTICO_ESENCIAL_TEMPLATE);
  });

  it("⭐ el tope de la respuesta crece con lo agregado, sin pasar el de una llamada sin streaming", () => {
    const canon = defsDelTipo("diagnosis") ?? [];
    const una = templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, canon, [DEL_COMPLETO]);
    expect(una.maxTokens).toBeGreaterThan(DIAGNOSTICO_ESENCIAL_TEMPLATE.maxTokens ?? 0);
    const esencial = new Set(DIAGNOSTICO_ESENCIAL_TEMPLATE.sections.map((s) => s.key));
    const todas = templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, canon, canon.map((d) => d.key).filter((k) => !esencial.has(k)));
    expect(todas.maxTokens).toBeLessThanOrEqual(TOPE_DE_TOKENS_SIN_STREAMING);
    expect(todas.maxTokens).toBeGreaterThanOrEqual(DIAGNOSTICO_TEMPLATE.maxTokens ?? 0);
  });

  it("⛔ las dos puertas de generación la usan: el documento de siempre y sus copias", () => {
    expect(leer("lib/entregables/generar-server.ts")).toMatch(/templateConLasAgregadas\(\s*templateDeLaPlantilla\(/);
    expect(leer("lib/artefactos/generar-server.ts")).toMatch(/templateConLasAgregadas\(templateDelTipo\(/);
  });
});

describe("lo que ofrece «+ Agregar sección»", () => {
  const catalogo = catalogoDelTipo("diagnosis");
  const esencial = DIAGNOSTICO_ESENCIAL_TEMPLATE.sections.map((s) => ({ key: s.key }));

  it("en un esencial, las del completo; nunca la portada, el cierre ni lo que lee el proyecto", () => {
    const ofrece = seccionesAgregables(catalogo, esencial, []).map((s) => s.key);
    expect(ofrece).toContain(DEL_COMPLETO);
    expect(ofrece).not.toContain("diagnostico");
    expect(ofrece).not.toContain("cierre");
    for (const k of esencial.map((e) => e.key)) expect(ofrece).not.toContain(k);
    const kickoff = seccionesAgregables(catalogoDelTipo("kickoff"), [{ key: "bienvenida" }], []).map((s) => s.key);
    expect(kickoff).not.toContain("cronograma");
    expect(kickoff).not.toContain("procesos");
  });

  it("una que ocultó la plantilla se ofrece (vuelve con lo que tenía); una que ocultó una persona, no", () => {
    const filas = [...esencial, { key: DEL_COMPLETO }, { key: "preguntas" }];
    const json = [
      { key: DEL_COMPLETO, label: "Fortalezas", hidden: true, ocultaPorLaPlantilla: true },
      { key: "preguntas", label: "Preguntas", hidden: true },
    ];
    const ofrece = seccionesAgregables(catalogo, filas, json);
    expect(ofrece.find((s) => s.key === DEL_COMPLETO)).toMatchObject({ ocultaPorLaPlantilla: true });
    expect(ofrece.map((s) => s.key)).not.toContain("preguntas");
  });

  it("⛔ lo solo interno (el Brief traído de la hoja) no se ofrece: se llena importando la hoja", () => {
    const planning = seccionesAgregables(catalogoDelTipo("planning"), [{ key: "planificacion" }], []).map((s) => s.key);
    expect(planning).not.toContain("brief_importado");
    expect(planning).toContain("pipelines");
  });

  it("al pasar a una plantilla que ya la trae, la marca se va (y con ella el «Borrar»)", () => {
    const json = [
      { key: "pipelines", label: "Pipelines", agregadaPorPersona: true },
      { key: DEL_COMPLETO, label: "Fortalezas", agregadaPorPersona: true },
    ];
    const { entradas, cambio } = sinMarcaLasDeLaPlantilla(json, new Set(["pipelines"]));
    expect(cambio).toBe(true);
    expect(entradas.find((e) => e.key === "pipelines")?.agregadaPorPersona).toBe(false);
    expect(entradas.find((e) => e.key === DEL_COMPLETO)?.agregadaPorPersona).toBe(true);
    expect(sinMarcaLasDeLaPlantilla(json, new Set(["otra"])).cambio).toBe(false);
  });

  it("dice si la escribe la IA", () => {
    const planning = seccionesAgregables(catalogoDelTipo("planning"), [{ key: "planificacion" }], []);
    expect(planning.find((s) => s.key === "pipelines")?.laEscribeLaIa).toBe(true);
    expect(planning.find((s) => s.key === "formularios")?.laEscribeLaIa).toBe(false);
  });

  it("entra en su lugar del canon y nunca después del cierre", () => {
    const canon = ["portada", "a", "b", "c", "cierre"];
    expect(lugarDeLaNueva(canon, ["portada", "a", "c", "cierre"], "b", "cierre")).toBe(2);
    expect(lugarDeLaNueva(canon, ["portada", "c", "cierre"], "a", "cierre")).toBe(1);
    expect(lugarDeLaNueva(canon, ["portada", "a", "cierre"], "c", "cierre")).toBe(2);
    // Una que el canon no ordena (no debería pasar): antes del cierre.
    expect(lugarDeLaNueva(canon, ["portada", "a", "cierre"], "z", "cierre")).toBe(2);
  });
});

describe("⭐ «Duplicar»: la copia de una sección", () => {
  it("la key dice de qué sección es copia, es una sección propia y no se confunde con un tipo creable", () => {
    const k = nuevaKeyDeCopia("acciones");
    expect(esCustomKey(k)).toBe(true);
    expect(originalDeLaCopia(k)).toBe("acciones");
    expect(originalDeLaCopia("custom:tabla:123e4567-e89b-12d3-a456-426614174000")).toBeNull();
    expect(originalDeLaCopia("acciones")).toBeNull();
    expect(() => nuevaKeyDeCopia("custom:tabla:x")).toThrow();
  });

  it("copiar una propia da otra propia de su mismo tipo; copiar una copia, otra copia de la original", () => {
    const tabla = "custom:tabla:123e4567-e89b-12d3-a456-426614174000";
    expect(tipoDeCustomKey(keyParaDuplicar(tabla))).toBe("tabla");
    expect(tipoDeCustomKey(keyParaDuplicar("custom:123e4567-e89b-12d3-a456-426614174000"))).toBe("html");
    const copia = nuevaKeyDeCopia("objetivos");
    const otra = keyParaDuplicar(copia);
    expect(originalDeLaCopia(otra)).toBe("objetivos");
    expect(otra).not.toBe(copia);
  });

  it("se llama como la original con «(copia)», dentro del tope", () => {
    expect(nombreDeLaCopia("Acciones coherentes")).toBe("Acciones coherentes (copia)");
    expect(nombreDeLaCopia("  ")).toBe("Sección (copia)");
    const largo = nombreDeLaCopia("x".repeat(80));
    expect(largo.length).toBeLessThanOrEqual(TOPE_DEL_NOMBRE_DE_SECCION);
    expect(largo.endsWith("(copia)")).toBe(true);
  });

  it("⛔ se pinta con la def de su original (editor, PDF y vista del cliente comparten este armado), y se puede mover", () => {
    const def = (key: string, extra: Partial<SectionDef> = {}) => ({ key, label: key, theme: "light", Component: () => null, empty: {}, ...extra }) as unknown as SectionDef;
    const allDefs = [def("portada", { pinned: true, backdrop: true }), def("acciones", { label: "Acciones coherentes" }), def("cierre", { pinned: true })];
    const copia = nuevaKeyDeCopia("acciones");
    const config = buildLandingConfigFromOrder(
      { type: "x", allDefs, heroKey: "portada", pinnedTail: ["cierre"], sintetizar: () => null },
      ["portada", "acciones", copia, nuevaKeyDeCopia("retirada"), "cierre"],
    );
    expect(config.sections.map((d) => d.key)).toEqual(["portada", "acciones", copia, "cierre"]);
    const laCopia = config.sections.find((d) => d.key === copia)!;
    expect(laCopia.label).toBe("Acciones coherentes");
    expect(laCopia.Component).toBe(allDefs[1].Component);
    expect(laCopia.pinned).toBe(false);
    expect(defDeLaCopia("objetivos", () => ({ key: "x" }))).toBeNull();
  });

  it("al regenerar, el orden del contrato la deja justo debajo de su original", () => {
    const copia = nuevaKeyDeCopia("objetivos");
    const propia = "custom:tabla:123e4567-e89b-12d3-a456-426614174000";
    expect(ordenDelContrato(["diagnostico", "problema", "objetivos", copia, propia, "cierre"], ["diagnostico", "objetivos", "problema", "cierre"])).toEqual([
      "diagnostico",
      "objetivos",
      copia,
      "problema",
      propia,
      "cierre",
    ]);
  });

  it("⛔ regenerar no la escribe: el agente solo recibe las keys de su template, y una copia nunca está ahí", () => {
    for (const d of defsDelTipo("diagnosis") ?? []) expect(esCustomKey(d.key)).toBe(false);
    const t = templateConLasAgregadas(DIAGNOSTICO_ESENCIAL_TEMPLATE, defsDelTipo("diagnosis") ?? [], [nuevaKeyDeCopia("objetivos")]);
    expect(t).toBe(DIAGNOSTICO_ESENCIAL_TEMPLATE);
  });

  it("⛔ la copia de una sección interna sigue siendo interna: no sale por el enlace del cliente", () => {
    const req = seccionesQueSalenPorElEnlace(TIPO_REQUERIMIENTO_TECNICO);
    expect(req(nuevaKeyDeCopia("estimacion"))).toBe(false);
    expect(req(nuevaKeyDeCopia("arquitectura"))).toBe(true);
    const kickoff = seccionesQueSalenPorElEnlace("kickoff");
    expect(kickoff(nuevaKeyDeCopia("cronograma"))).toBe(false);
    expect(kickoff(nuevaKeyDeCopia("objetivos"))).toBe(true);
  });

  it("⛔ qué se duplica: ni la portada, ni el cierre, ni lo que lee el proyecto, ni lo solo interno", () => {
    const diag = catalogoDelTipo("diagnosis");
    expect(motivoParaNoDuplicar("objetivos", diag)).toBeNull();
    expect(motivoParaNoDuplicar("diagnostico", diag)).toMatch(/portada/);
    expect(motivoParaNoDuplicar("cierre", diag)).toMatch(/portada/);
    expect(motivoParaNoDuplicar("inventada", diag)).not.toBeNull();
    expect(motivoParaNoDuplicar(nuevaKeyDeCopia("objetivos"), diag)).toBeNull();
    expect(motivoParaNoDuplicar("custom:tabla:123e4567-e89b-12d3-a456-426614174000", diag)).toBeNull();
    const kickoff = catalogoDelTipo("kickoff");
    expect(motivoParaNoDuplicar("cronograma", kickoff)).toMatch(/datos del proyecto/);
    expect(motivoParaNoDuplicar(nuevaKeyDeCopia("cronograma"), kickoff)).toMatch(/datos del proyecto/);
    expect(motivoParaNoDuplicar("brief_importado", catalogoDelTipo("planning"))).toMatch(/solo del equipo/);
    expect(leer("components/landing/LandingView.tsx")).toMatch(/sePuedeDuplicar = [^;]*!def\.soloInterna/);
  });

  it("⛔ qué se borra en el documento de siempre: lo de la persona; lo de la plantilla, no", () => {
    const json = [{ key: DEL_COMPLETO, label: "Fortalezas", agregadaPorPersona: true }];
    const base = { sections: json, enUnaCopia: false, estructurales: ["diagnostico", "cierre"] };
    expect(sePuedeBorrar({ ...base, key: DEL_COMPLETO })).toBe(true);
    expect(sePuedeBorrar({ ...base, key: nuevaKeyDeCopia("objetivos") })).toBe(true);
    expect(sePuedeBorrar({ ...base, key: "objetivos" })).toBe(false);
    expect(sePuedeBorrar({ ...base, key: "cierre" })).toBe(false);
    // En una copia de artefacto, también las de su plantilla, menos la portada y el cierre (Elías, 30 oct).
    expect(sePuedeBorrar({ ...base, enUnaCopia: true, key: "objetivos" })).toBe(true);
    expect(sePuedeBorrar({ ...base, enUnaCopia: true, key: "cierre" })).toBe(false);
    expect(leer("app/api/projects/[projectId]/canvas-sections/[sectionId]/route.ts")).toContain("sePuedeBorrar(");
  });

  it("⛔ la ruta de duplicar cruza la sección con el proyecto y respeta el veto del handoff; la portada y el cierre no se duplican", () => {
    const ruta = leer("app/api/projects/[projectId]/canvas-sections/[sectionId]/duplicar/route.ts");
    expect(ruta).toMatch(/canvas\.projectId\s*!==\s*projectId/);
    expect(ruta).toContain("denyHandoffCanvasEditForCse");
    expect(ruta).toContain("guardAccessToProject");
    const server = leer("lib/canvas/secciones-del-documento-server.ts");
    expect(server).toContain("motivoParaNoDuplicar(");
    expect(server).toContain("MAX_CUSTOM_SECTIONS");
  });
});
