import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  accionFuera,
  accionNueva,
  accionesFueraDelAlcance,
  esDeAntesDelEnfoqueCorto,
  CAMPOS_DEL_DETALLE,
  CLAVE_DE_LA_FORMA,
  FORMA_DEL_ENFOQUE,
  dejarElEnfoqueCorto,
  seVeCorta,
  tieneDetalle,
} from "./acciones-del-enfoque";
import { DIAGNOSTICO_DEF_BY_KEY, DIAGNOSTICO_ESENCIAL_TEMPLATE, ACCIONES_SCHEMA } from "@/components/landing/configs/diagnostico.defs";
import {
  ACCIONES_EN_DETALLE_KEY,
  PLANIFICACION_DEF_BY_KEY,
  PLANIFICACION_ESENCIAL_TEMPLATE,
} from "@/components/landing/configs/planificacion.defs";
import { PLANIFICACION_SECTION_COMPONENTS } from "@/components/landing/configs/planificacion";
import { DIAGNOSTICO_SECTION_COMPONENTS } from "@/components/landing/configs/diagnostico";
import { PLANIFICACION_CANVAS } from "@/lib/canvas/canvas-defs";
import { isBlank } from "@/lib/landing/is-blank";
import { AccionesEjecucionSection } from "@/components/landing/sections-ejecucion";
import { ctxDelDiagnostico } from "@/components/canvas/diagnostico-landing-adapter";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { BRIEF_DE_LAS_ACCIONES_CON_DETALLE } from "@/components/landing/configs/diagnostico.defs";
import { SKIP_KEYS } from "@/lib/canvas/print-vocab";
import type { LandingContext } from "@/components/landing/types";
import type { AccionesEjecucionData } from "@/components/landing/sections-ejecucion";

const tabla = (data: unknown, editable = false) =>
  renderToStaticMarkup(
    createElement(AccionesEjecucionSection, { data: data as AccionesEjecucionData, ctx: { pdfMode: false } as unknown as LandingContext, editable, onChange: () => {} }),
  );

/* Un diagnóstico generado ANTES del 2026-10-28, como los cuatro que había en producción ese día: todas sus acciones
   con grupo, hub, quick win y alcance, y sin la marca. */
const viejo = {
  intro: "",
  acciones: [
    { id: "AC-01", accion: "Captación conectada", detalle: "Cada lead entra con su campaña", grupo: "Configuración", ataca: "F1", mueve: "OBJ-01", hub: "Marketing Hub", quickWin: "si", alcance: "dentro" },
    { id: "AC-02", accion: "Reportería de matrícula", detalle: "Saber qué pauta genera matrículas", grupo: "Reportería", ataca: "F2", mueve: "OBJ-02", hub: "Smart CRM", quickWin: "no", alcance: "fuera" },
  ],
};

/* Lo que devuelve el agente desde el 2026-10-28: tres acciones de una línea. Le pusimos un hub a una para probar que el
   runner lo saca aunque el modelo no obedezca. */
const generadas = [
  { key: "objetivos", data: { objetivos: [] } },
  {
    key: "acciones",
    data: {
      intro: "",
      acciones: [
        { id: "AC-01", accion: "Conectar la captación al CRM", detalle: "Saber qué pauta trae matrículas", ataca: "F1, F2", mueve: "OBJ-01" },
        { id: "AC-02", accion: "Un solo seguimiento por lead", detalle: "Ningún lead se queda sin respuesta", ataca: "F3", mueve: "OBJ-02", hub: "Sales Hub", grupo: "" },
        { id: "AC-03", accion: "Medir desde el primer mes", detalle: "Decidir la inversión con datos", ataca: "F4", mueve: "OBJ-03" },
      ],
    },
  },
];

describe("las acciones del diagnóstico: el viejo se ve igual, el nuevo corto (decisión 16)", () => {
  it("un diagnóstico viejo no tiene la marca y se ve con la tabla de siempre", () => {
    expect(tieneDetalle(viejo.acciones)).toBe(true);
    expect(seVeCorta(viejo)).toBe(false);
  });

  it("el runner marca la sección y le saca a cada acción el detalle, aunque el modelo lo haya escrito", () => {
    const [objetivos, acciones] = dejarElEnfoqueCorto(generadas);
    expect(objetivos).toBe(generadas[0]); // las demás secciones no se tocan
    const data = acciones.data as Record<string, unknown> & { acciones: Record<string, unknown>[] };
    expect(data[CLAVE_DE_LA_FORMA]).toBe(FORMA_DEL_ENFOQUE);
    expect(data.acciones).toHaveLength(3);
    for (const a of data.acciones) for (const k of CAMPOS_DEL_DETALLE) expect(a).not.toHaveProperty(k);
    expect(data.acciones[1]).toEqual({ id: "AC-02", accion: "Un solo seguimiento por lead", detalle: "Ningún lead se queda sin respuesta", ataca: "F3", mueve: "OBJ-02" });
    expect(seVeCorta(data)).toBe(true);
    // No muta lo que recibe.
    const original = generadas[1]!.data as { acciones: Record<string, unknown>[] };
    expect(original.acciones[1]!.hub).toBe("Sales Hub");
  });

  it("un diagnóstico nuevo al que alguien le escribe detalle lo muestra en vez de esconderlo", () => {
    const [, acciones] = dejarElEnfoqueCorto(generadas);
    const data = acciones.data as { acciones: Record<string, unknown>[] };
    const conHub = { ...data, acciones: [{ ...data.acciones[0], hub: "Marketing Hub" }, ...data.acciones.slice(1)] };
    expect(seVeCorta(conHub)).toBe(false);
  });

  it("la marca sola no es contenido: una sección sin acciones sigue vacía", () => {
    expect(isBlank({ intro: "", acciones: [], [CLAVE_DE_LA_FORMA]: FORMA_DEL_ENFOQUE })).toBe(true);
  });

  it("el runner del diagnóstico lo aplica a lo que genera (sin esto, el agente volvería a dejar la tabla larga)", () => {
    const runner = readFileSync(join(process.cwd(), "lib/canvas/diagnostico-generate.ts"), "utf-8");
    expect(runner).toMatch(/sections: dejarElEnfoqueCorto\(ordenarObjetivosDelDiagnostico\(generado\.sections\)\)/);
  });

  it("sin la sección de acciones, el runner devuelve lo mismo", () => {
    const solo = [{ key: "problema", data: { sintomas: [] } }];
    expect(dejarElEnfoqueCorto(solo)).toEqual(solo);
  });

  it("el agente del diagnóstico pide tres o cuatro acciones y el detalle vacío; el esquema es el de siempre", () => {
    const def = DIAGNOSTICO_DEF_BY_KEY.acciones;
    expect(def.brief).toMatch(/`acciones` \(3-4\)/);
    expect(def.brief).toMatch(/Deja VACÍOS `grupo`, `hub`, `quickWin` y `alcance`/);
    // Un renderer, un contrato: el diagnóstico viejo, la Planificación y la Ejecución usan el mismo esquema.
    expect(def.schema).toBe(ACCIONES_SCHEMA);
    expect(DIAGNOSTICO_ESENCIAL_TEMPLATE.agentIntro).toMatch(/acciones 3-4\./);
    expect(DIAGNOSTICO_SECTION_COMPONENTS.ejecucion_acciones).toBeDefined();
  });
});

describe("el detalle pasa a la Planificación", () => {
  it("«Las acciones, en detalle» la genera el agente, con la misma tabla y el mismo esquema, en las dos plantillas", () => {
    const def = PLANIFICACION_DEF_BY_KEY[ACCIONES_EN_DETALLE_KEY];
    expect(def.agentGenerated).toBe(true);
    expect(def.sectionType).toBe("ejecucion_acciones");
    expect(def.schema).toBe(ACCIONES_SCHEMA);
    expect(PLANIFICACION_SECTION_COMPONENTS.ejecucion_acciones).toBe(DIAGNOSTICO_SECTION_COMPONENTS.ejecucion_acciones);
    expect(PLANIFICACION_CANVAS.sections.map((s) => s.key)).toContain(ACCIONES_EN_DETALLE_KEY);
    expect(PLANIFICACION_ESENCIAL_TEMPLATE.sections.map((s) => s.key)).toContain(ACCIONES_EN_DETALLE_KEY);
    // Pide el detalle que el diagnóstico dejó de escribir, con los códigos del diagnóstico.
    for (const campo of ["`grupo`", "`hub`", "`quickWin`", "`alcance`"]) expect(def.brief).toContain(campo);
    expect(def.brief).toMatch(/MISMO código/);
  });

  it("sin la marca, la tabla de la Planificación se ve entera aunque todavía no tenga detalle", () => {
    expect(seVeCorta({ intro: "", acciones: [] })).toBe(false);
    expect(seVeCorta({ acciones: [{ id: "AC-01", accion: "x" }] })).toBe(false);
  });
});

describe("cómo se ve la tabla (lo que el cliente lee y el PDF)", () => {
  it("un diagnóstico viejo, con las ocho columnas de siempre y su detalle", () => {
    const out = tabla(viejo);
    for (const col of ["Grupo", "Hub", "Quick win", "Alcance"]) expect(out).toContain(`<th>${col}</th>`);
    expect(out).toContain("Marketing Hub");
    expect(out).toContain("Fuera");
  });

  it("uno nuevo, con ID · Acción · Ataca · Mueve, también en edición", () => {
    const [, acciones] = dejarElEnfoqueCorto(generadas);
    for (const editable of [false, true]) {
      const out = tabla(acciones.data, editable);
      expect(out).toContain("<th>Ataca</th>");
      // En edición el texto lo pone el editable al montar: el HTML del servidor solo lo trae en lectura.
      if (!editable) expect(out).toContain("Conectar la captación al CRM");
      for (const col of ["Grupo", "Hub", "Quick win", "Alcance"]) expect(out).not.toContain(`<th>${col}</th>`);
    }
  });

  it("agregar una acción a mano deja corta la tabla corta, y la larga con sus valores de siempre", () => {
    const [, acciones] = dejarElEnfoqueCorto(generadas);
    const data = acciones.data as { acciones: unknown[] };
    expect(seVeCorta({ ...data, acciones: [...data.acciones, accionNueva("AC-04", true)] })).toBe(true);
    expect(accionNueva("AC-09", false)).toMatchObject({ id: "AC-09", quickWin: "no", alcance: "dentro" });
  });
});

describe("lo que queda fuera del alcance, en «Consecuencias positivas»", () => {
  const alcance = { grupos: [], fuera: [{ texto: "Integrar el ERP", acciones: "AC-03" }] };

  it("en uno nuevo lo dice «Alcance acordado»", () => {
    const [, acciones] = dejarElEnfoqueCorto(generadas);
    const ctx = ctxDelDiagnostico([acciones, { key: "alcance_acordado", data: alcance }]);
    expect(ctx.acciones!.map((a) => [a.id, a.fuera])).toEqual([["AC-01", false], ["AC-02", false], ["AC-03", true]]);
  });

  it("en uno viejo manda el alcance de cada acción, como siempre", () => {
    const fuera = accionesFueraDelAlcance({ fuera: [{ texto: "x", acciones: "AC-01" }] });
    expect(accionFuera(viejo.acciones[0]!, fuera)).toBe(false); // dice «dentro»: no lo cambia la lista
    expect(accionFuera(viejo.acciones[1]!, new Set())).toBe(true);
    expect(ctxDelDiagnostico([{ key: "acciones", data: viejo }]).acciones!.map((a) => a.fuera)).toEqual([false, true]);
  });
});

describe("«Mejorar con IA» sobre las acciones", () => {
  const brief = DOC.diagnosis!.briefSegunLoGuardado!;

  it("en un diagnóstico viejo usa la guía de antes: no le propone vaciar el detalle", () => {
    expect(esDeAntesDelEnfoqueCorto(viejo)).toBe(true);
    expect(brief("acciones", viejo)).toBe(BRIEF_DE_LAS_ACCIONES_CON_DETALLE);
    expect(BRIEF_DE_LAS_ACCIONES_CON_DETALLE).toMatch(/`acciones` \(5-10\)/);
  });

  it("en uno nuevo, en uno vacío y en las demás secciones, la de la def", () => {
    const [, acciones] = dejarElEnfoqueCorto(generadas);
    expect(brief("acciones", acciones.data)).toBeUndefined();
    expect(brief("acciones", { intro: "", acciones: [] })).toBeUndefined();
    expect(brief("problema", viejo)).toBeUndefined();
  });

  it("la marca no sale como texto en el prompt de otros agentes ni en el PDF", () => {
    expect(SKIP_KEYS.has(CLAVE_DE_LA_FORMA)).toBe(true);
    const ctxTexto = readFileSync(join(process.cwd(), "lib/canvas/load-canvas-context.ts"), "utf-8");
    expect(ctxTexto).toMatch(/"__forma",/);
  });
});
