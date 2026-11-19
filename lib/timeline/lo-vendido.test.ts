import { describe, expect, it } from "vitest";
import { revisarLimites, type LimitesDelCronograma } from "./limites";
import {
  bloqueDeLoVendidoParaElDetalle,
  bloqueDeLoVendidoParaLaEstructura,
  horasDeLosCasos,
  hayLoVendido,
  loVendidoDe,
  SIN_LO_VENDIDO,
  titulosDeLosCasosDeLaPropuesta,
  type CasoVendido,
} from "./lo-vendido";
import { leerHorasDeTarea } from "./compute-detail-tasks";
import { tareasFijasDeSemanaCero } from "./semana-cero-tareas";

/* RC Inmobiliaria · DocuSign (2026-11-18): 4 semanas confirmadas, ≈ 40 horas del Acuerdo Macro. */
const LIMITES_RC: LimitesDelCronograma = {
  fechaLimite: "2026-12-11",
  duracionVendidaSemanas: 4,
  horasVendidas: 40,
  confirmacion: {},
  propuestos: null,
  conSemanaCero: false,
};
const CASOS: CasoVendido[] = [
  {
    titulo: "Firma digital desde HubSpot",
    actividades: [
      { nombre: "Conectar DocuSign con HubSpot", veces: 1, conElCliente: 1, internas: 3 },
      { nombre: "Configurar una plantilla", veces: 9, conElCliente: 4.5, internas: 13.5 },
      { nombre: "Capacitar al equipo", veces: 2, conElCliente: 2, internas: 1 },
    ],
  },
];
const ANCLA = "2026-11-17T00:00:00.000Z";
const OCHO_SEMANAS = [
  { name: "Plantillas bloque 1", durationWeeks: 4 },
  { name: "Plantillas bloque 2", durationWeeks: 4 },
];

describe("loVendidoDe — los límites vigentes + la propuesta", () => {
  it("toma lo confirmado; sin nada, no hay lo vendido (y los bloques no suman ni un carácter)", () => {
    const lv = loVendidoDe({ limites: LIMITES_RC, propuesta: { id: "bc1", nombre: "Acuerdo Macro", publicada: true }, casos: CASOS });
    expect(lv.semanas).toEqual({ valor: 4, origen: "confirmado" });
    expect(lv.horas).toEqual({ valor: 40, origen: "confirmado" });
    expect(lv.fecha).toEqual({ valor: "2026-12-11", origen: "confirmado" });
    expect(hayLoVendido(lv)).toBe(true);
    expect(hayLoVendido(SIN_LO_VENDIDO)).toBe(false);
    expect(bloqueDeLoVendidoParaElDetalle(SIN_LO_VENDIDO)).toBeNull();
    expect(bloqueDeLoVendidoParaLaEstructura({ loVendido: SIN_LO_VENDIDO, revision: null, ajustar: false })).toBeNull();
  });

  it("suma las horas de las actividades: con el cliente e internas", () => {
    expect(horasDeLosCasos(CASOS)).toEqual({ conElCliente: 7.5, internas: 17.5 });
  });
});

describe("los casos salen de la PROPUESTA PUBLICADA, nunca de la preventa", () => {
  it("lee los títulos de la sección «Casos de uso», sin repetir", () => {
    const foto = {
      sections: [
        { key: "hero", blocks: [{ data: { headline: "x" } }] },
        { key: "casos_de_uso", blocks: [{ data: { items: [{ title: "Firmar contratos desde HubSpot", detail: "", price: "" }, { title: " Firmar contratos desde HubSpot " }, { title: "" }] } }] },
      ],
    };
    expect(titulosDeLosCasosDeLaPropuesta(foto)).toEqual(["Firmar contratos desde HubSpot"]);
    expect(titulosDeLosCasosDeLaPropuesta(null)).toEqual([]);
    expect(titulosDeLosCasosDeLaPropuesta({ sections: [{ key: "hero", blocks: [] }] })).toEqual([]);
  });
});

describe("el bloque del paso 1 (revisor de fases)", () => {
  it("con un límite confirmado que el plan pasa, permite juntar fases y dice cuánto se pasa", () => {
    const lv = loVendidoDe({ limites: LIMITES_RC, propuesta: null, casos: [] });
    const revision = revisarLimites({ ancla: ANCLA, fases: OCHO_SEMANAS, limites: LIMITES_RC });
    const b = bloqueDeLoVendidoParaLaEstructura({ loVendido: lv, revision, ajustar: false })!;
    expect(b).toContain("=== LO VENDIDO DE ESTE PROYECTO");
    expect(b).toContain("- Semanas vendidas: 4 — confirmado.");
    expect(b).toContain("SE PASA de lo vendido");
    expect(b).toContain("JUNTAR FASES: el plan pasa un límite CONFIRMADO");
    expect(b).not.toContain("EL CSE PIDIÓ AJUSTAR");
  });

  it("si cabe (o el límite solo lo propuso la IA), juntar NO; «Ajustar» lo pide explícito", () => {
    const propuesto = { ...LIMITES_RC, duracionVendidaSemanas: null, horasVendidas: null, fechaLimite: null,
      propuestos: { runId: null, en: "", duracionVendida: { valor: 4, cita: "son cuatro semanas en total", citaVerificada: true } } };
    const lv = loVendidoDe({ limites: propuesto, propuesta: null, casos: [] });
    const revision = revisarLimites({ ancla: ANCLA, fases: OCHO_SEMANAS, limites: propuesto });
    const b = bloqueDeLoVendidoParaLaEstructura({ loVendido: lv, revision, ajustar: true })!;
    expect(b).toContain("lo propuso la IA del handoff; sin confirmar");
    expect(b).toContain("JUNTAR FASES: NO.");
    expect(b).toContain("EL CSE PIDIÓ AJUSTAR EL PLAN A LO VENDIDO");
  });
});

describe("el bloque del paso 2 (las tareas salen de las actividades)", () => {
  it("lista las actividades con sus horas, reemplaza la regla de «2 a 5» y pone el tope de horas", () => {
    const lv = loVendidoDe({ limites: LIMITES_RC, propuesta: { id: "bc1", nombre: "Acuerdo Macro", publicada: true }, casos: CASOS });
    const b = bloqueDeLoVendidoParaElDetalle(lv)!;
    expect(b).toContain("reemplaza la de «2 a 5 tareas por semana»");
    expect(b).toContain("Propuesta: «Acuerdo Macro».");
    expect(b).toContain("· Configurar una plantilla (×9) — 4,5 h con el cliente, 13,5 h internas");
    expect(b).toContain("Las tareas SALEN DE ESTAS ACTIVIDADES");
    expect(b).toContain('agrégale "horas": las horas de Smarteam');
    expect(b).toContain('no pasa de 40.');
    expect(b).toContain("dentro de las 4 semanas vendidas");
  });

  it("con solo semanas o fecha límite (sin casos ni horas) no hay bloque: el detalle sigue con sus reglas de siempre", () => {
    const soloFecha = { ...LIMITES_RC, duracionVendidaSemanas: null, horasVendidas: null };
    expect(bloqueDeLoVendidoParaElDetalle(loVendidoDe({ limites: soloFecha, propuesta: null, casos: [] }))).toBeNull();
  });

  it("las horas ×N son el total: se reparten, no se multiplican; lo del cliente no lleva horas", () => {
    const b = bloqueDeLoVendidoParaElDetalle(loVendidoDe({ limites: LIMITES_RC, propuesta: null, casos: CASOS }))!;
    expect(b).toContain("cada una lleva 2 h (nunca 18)");
    expect(b).toContain('Una tarea que hace solo el cliente va sin "horas"');
  });

  it("sin casos de uso, el tope lo ponen las horas vendidas y no hay relleno", () => {
    const b = bloqueDeLoVendidoParaElDetalle(loVendidoDe({ limites: LIMITES_RC, propuesta: null, casos: [] }))!;
    expect(b).toContain("No hay casos de uso vendidos con actividades");
    expect(b).toContain("no pasa de 40.");
  });

  it("las horas que devuelve el modelo se leen tolerantes y redondeadas al cuarto de hora", () => {
    expect(leerHorasDeTarea(2)).toBe(2);
    expect(leerHorasDeTarea("1,5")).toBe(1.5);
    expect(leerHorasDeTarea(0.6)).toBe(0.5);
    expect(leerHorasDeTarea(0)).toBeUndefined();
    expect(leerHorasDeTarea(500)).toBeUndefined();
    expect(leerHorasDeTarea("mucho")).toBeUndefined();
  });
});

describe("las tareas fijas de la Semana 0 en Desarrollo (2026-11-18)", () => {
  const TAGS_RC = ["custom_dev", "sales_hub", "data_hub", "reimplementacion"];

  it("en un proyecto sin Semana 0 van solo el acceso al portal y la documentación", () => {
    expect(tareasFijasDeSemanaCero(TAGS_RC, [], 0, { soloAccesosYDocumentacion: true }).map((t) => t.title)).toEqual([
      "Entregar documentación de procesos involucrados",
      "Proporcionar acceso al portal de HubSpot a Smarteam",
    ]);
  });

  it("en Customer Success siguen las cinco, como antes", () => {
    expect(tareasFijasDeSemanaCero(TAGS_RC, [])).toHaveLength(5);
  });
});
