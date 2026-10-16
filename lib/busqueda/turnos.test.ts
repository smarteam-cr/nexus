import { describe, expect, it } from "vitest";
import { huellaDeTranscripcion, normalizarParaBuscar, palabrasDelTitulo, partesResaltadas, partirEntreOraciones, turnosParaIndexar } from "./turnos";

describe("partir la transcripción en turnos", () => {
  it("un turno por persona, numerados, sin marcas de tiempo", () => {
    const t = ["Reunión - Transcripción", "00:00:12", "Ana Pérez: Hola, ¿cómo están?", "Luis: Bien. Queremos ver la integración.", "Luis: Y el CRM."].join("\n");
    expect(turnosParaIndexar(t)).toEqual([
      { orden: 1, hablante: "Ana Pérez", texto: "Hola, ¿cómo están?" },
      { orden: 2, hablante: "Luis", texto: "Bien. Queremos ver la integración. Y el CRM." },
    ]);
  });

  it("un monólogo largo se parte entre oraciones, sin pasar del tope", () => {
    const oracion = "Esta es una oración de prueba bastante larga para el monólogo.";
    const largo = Array.from({ length: 30 }, () => oracion).join(" ");
    const partes = partirEntreOraciones(largo, 200);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 200)).toBe(true);
    expect(partes.join(" ")).toBe(largo);
  });
});

describe("la huella", () => {
  it("cambia si cambia el texto", () => {
    expect(huellaDeTranscripcion("hola")).toBe(huellaDeTranscripcion("hola"));
    expect(huellaDeTranscripcion("hola")).not.toBe(huellaDeTranscripcion("holA"));
  });
});

describe("buscar sin tildes", () => {
  it("normaliza igual que la base y conserva la ñ", () => {
    expect(normalizarParaBuscar("Integración Ñandú")).toBe("integracion ñandu");
  });

  it("las palabras del título, sin las vacías ni el nombre de la empresa", () => {
    expect(palabrasDelTitulo("Seguimiento semanal Acme | Integración ERP y migración", "Acme Corp")).toEqual(["integracion", "migracion"]);
    expect(palabrasDelTitulo("Reunión Acme", "Acme")).toEqual([]);
  });

  it("resalta las palabras buscadas aunque el texto tenga tildes", () => {
    const partes = partesResaltadas("La integración con SAP", "integracion");
    expect(partes).toEqual([
      { texto: "La ", marca: false },
      { texto: "integración", marca: true },
      { texto: " con SAP", marca: false },
    ]);
  });
});
