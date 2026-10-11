import { describe, expect, it } from "vitest";
import { textoDeLasNotasDeGemini } from "@/lib/exploraciones/lectura";
import { CONVERSACION_LARGA, ENCABEZADO_DE_LA_PARTE, armarTextoDeLaReunion, notasComoTexto, textoParaElModelo } from "./texto";

const turnos = (n: number, largo = 80) =>
  Array.from({ length: n }, (_, i) => `${i % 2 ? "Elías González" : "Ana Pérez"}: ${"Hoy revisamos el pipeline y las propiedades del proyecto. ".repeat(Math.ceil(largo / 58)).trim()}`).join("\n");

const NOTAS = [
  "Resumen",
  "Se revisó el avance de la implementación con el equipo comercial y el estado de la migración de contactos.",
  "Decisiones",
  "Se aceptó el pipeline de cinco etapas para las ventas del país. Se decidió dejar las cotizaciones en HubSpot.",
  "Próximos pasos",
  "[Ana Pérez] Enviar la base de datos de contactos antes del viernes.",
  "[Elías González] Configurar las propiedades de contacto y las vistas del equipo comercial.",
  "Detalles",
  "El equipo comercial lleva hoy las cotizaciones en una hoja de cálculo compartida y quiere dejarla cuanto antes.",
].join("\n");

describe("el texto de una reunión", () => {
  it("con transcripción: lo dicho, por turno, con los turnos aparte", () => {
    const t = armarTextoDeLaReunion({ transcript: turnos(8), summary: { overview: NOTAS } })!;
    expect(t.fuente).toBe("transcripcion");
    expect(t.partes.map((p) => p.fuente)).toEqual(["transcripcion"]);
    expect(t.turnos).toHaveLength(8);
    expect(t.partes[0].texto).toMatch(/^\[1\] Ana Pérez: /);
    expect(t.recortada).toBe(false);
  });

  it("si la conversación no entra entera, le suma las notas priorizadas", () => {
    const t = armarTextoDeLaReunion({ transcript: turnos(40, 300), summary: { overview: NOTAS } }, 3_000)!;
    expect(t.recortada).toBe(true);
    expect(t.partes.map((p) => p.fuente)).toEqual(["transcripcion", "notas"]);
    expect(t.partes[1].texto).toContain("Próximos pasos");
  });

  it("y también si es larga aunque entre", () => {
    const t = armarTextoDeLaReunion({ transcript: turnos(Math.ceil(CONVERSACION_LARGA / 280) + 10, 300), summary: { overview: NOTAS } })!;
    expect(t.recortada).toBe(false);
    expect(t.partes.map((p) => p.fuente)).toEqual(["transcripcion", "notas"]);
  });

  it("sin transcripción, solo las notas", () => {
    const t = armarTextoDeLaReunion({ transcript: null, summary: { overview: NOTAS } })!;
    expect(t.fuente).toBe("notas");
    expect(t.turnos).toEqual([]);
    expect(t.partes[0].texto).toContain("Enviar la base de datos");
  });

  it("una transcripción sin la forma «Nombre: lo dicho» se lee cruda", () => {
    const cruda = "Se habló del pipeline y de las propiedades del proyecto con el equipo comercial. ".repeat(10);
    const t = armarTextoDeLaReunion({ transcript: cruda, summary: null })!;
    expect(t.partes).toEqual([{ fuente: "transcripcion", texto: cruda.trim() }]);
    expect(t.turnos).toEqual([]);
  });

  it("sin nada que leer, null", () => {
    expect(armarTextoDeLaReunion({ transcript: "Ana Pérez: Hola.", summary: { overview: "Corto." } })).toBeNull();
    expect(armarTextoDeLaReunion({ transcript: null, summary: null })).toBeNull();
  });

  it("un texto sumado a mano entra como «texto»", () => {
    const t = armarTextoDeLaReunion({ transcript: null, summary: null, textoSumado: "Minuta de la sesión con el cliente. ".repeat(20) })!;
    expect(t.fuente).toBe("texto");
  });

  it("las notas enteras: el resumen, las secciones y los próximos pasos (como las lee la preventa)", () => {
    const texto = notasComoTexto({ overview: "Resumen corto.", sections: [{ title: "Acuerdos", content: "Pipeline de cinco etapas." }], action_items: ["Enviar la base"] });
    expect(texto).toBe("Resumen corto.\n\nAcuerdos:\nPipeline de cinco etapas.\n\nPróximos pasos:\nEnviar la base");
    expect(notasComoTexto(null)).toBe("");
  });

  it("dice lo mismo que la lectura de la preventa (si cambia una, cambia la otra)", () => {
    const muestras: unknown[] = [
      { overview: NOTAS },
      { overview: ["Uno", "Dos"], action_items: "Llamar al cliente" },
      { sections: [{ title: "", content: "Sin título" }, { title: "T", content: "  " }] },
      {},
    ];
    for (const m of muestras) expect(notasComoTexto(m)).toBe(textoDeLasNotasDeGemini(m).trim());
  });

  it("lo que lee el modelo lleva el encabezado de cada parte", () => {
    const t = armarTextoDeLaReunion({ transcript: null, summary: { overview: NOTAS } })!;
    expect(textoParaElModelo(t)).toBe(`${ENCABEZADO_DE_LA_PARTE.notas}\n${t.partes[0].texto}`);
  });
});
