import { describe, expect, it } from "vitest";
import {
  aColumna,
  leerEstado,
  lineaDelDocumento,
  notaDeAprobacion,
  revisarParaPresentar,
  validarAprobacion,
} from "./estado-del-documento";
import type { CaboSuelto } from "./revisar-hilo";

const POLITICA_REVISADA = { intro: "¿En qué debemos enfocarnos?", items: [{ title: "HubSpot como única fuente", detail: "…" }], revisadaAt: "2026-10-02T10:00:00.000Z" };
const roto: CaboSuelto = { seccion: "acciones", texto: "La causa F2 no tiene ninguna acción que la ataque.", bloquea: true };
const aviso: CaboSuelto = { seccion: "objetivos", texto: "El objetivo OBJ-03 no lo mueve ninguna acción.", bloquea: false };

describe("estado del documento: borrador, presentado y aprobado", () => {
  it("la columna guarda null para el borrador y cualquier valor raro se lee como borrador", () => {
    expect(leerEstado(null)).toBe("borrador");
    expect(leerEstado("cualquiera")).toBe("borrador");
    expect(leerEstado("aprobado")).toBe("aprobado");
    expect(aColumna("borrador")).toBeNull();
    expect(aColumna("presentado")).toBe("presentado");
  });

  it("se presenta con el hilo cerrado y la política revisada (los avisos no frenan)", () => {
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [aviso], politica: POLITICA_REVISADA })).toEqual({ ok: true, motivos: [] });
  });

  it("no se presenta con un cabo suelto, con la política sin revisar, ni sin política: junta TODOS los motivos", () => {
    const r = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [roto], politica: { ...POLITICA_REVISADA, revisadaAt: "" } });
    expect(r.ok).toBe(false);
    expect(r.motivos).toHaveLength(2);
    expect(r.motivos[0]).toContain("La causa F2 no tiene ninguna acción");
    expect(r.motivos[1]).toContain("sugerencia de la IA");
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: undefined }).motivos[0]).toContain("Falta la política rectora");
  });

  it("aprobado no se presenta (está cerrado), y sin contenido no hay nada que presentar", () => {
    expect(revisarParaPresentar({ estado: "aprobado", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA }).motivos[0]).toContain("reábrelo");
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: false, cabos: [], politica: POLITICA_REVISADA }).motivos[0]).toContain("genera el diagnóstico");
  });

  it("la aprobación pide quién, cuándo (no futuro) y la evidencia", () => {
    const hoy = new Date("2026-10-02T15:00:00.000Z");
    const base = { nombre: "Pablo Olivas", email: "pablo@cliente.cr", fecha: "2026-10-02", evidencia: "Aprobado, sigamos." };
    expect(validarAprobacion(base, hoy).ok).toBe(true);
    expect(validarAprobacion({ ...base, nombre: " " }, hoy)).toEqual({ ok: false, error: "Falta quién aprobó del lado del cliente." });
    expect(validarAprobacion({ ...base, email: "no-es-correo" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, fecha: "2026-12-01" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, evidencia: "" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, evidencia: "", evidenciaDocumentoId: "doc1" }, hoy).ok).toBe(true);
  });

  it("la línea de la portada sigue a FUNDAUNA", () => {
    const l = lineaDelDocumento({ cliente: "FUNDAUNA", fecha: new Date("2026-09-24T18:00:00.000Z"), version: 1, estado: "borrador" });
    expect(l).toBe("Cliente: FUNDAUNA · Fecha: 24 de septiembre de 2026 · Versión: v1 · Estado: Borrador");
  });

  it("la nota de HubSpot escapa el HTML de la evidencia", () => {
    const n = notaDeAprobacion({
      documento: "Diagnóstico",
      version: 2,
      nombre: "Pablo",
      email: "",
      fecha: new Date("2026-10-02T12:00:00.000Z"),
      evidencia: "<script>x</script>\nOK",
      registradoPor: "cse@smarteamcr.com",
    });
    expect(n).toContain("Diagnóstico v2 aprobado por el cliente.");
    expect(n).toContain("&lt;script&gt;");
    expect(n).not.toContain("<script>");
  });
});
