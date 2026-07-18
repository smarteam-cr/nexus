/**
 * lib/timeline/particularidad-identity.test.ts
 *
 * Fija la identidad del hecho. El bug que corrige: 26 corridas del agente sobre los mismos
 * transcripts cargaron el mismo atraso 4 veces con redacción distinta, y el corrimiento se contó
 * doble (13 semanas mostradas, 8 reales).
 */
import { test, expect } from "vitest";
import {
  fingerprintFromTitle,
  normalizeFingerprint,
  buildDedupeKey,
  extractFingerprint,
} from "./particularidad-identity";

test("huella desde el título: minúsculas, sin acentos, con guiones", () => {
  expect(fingerprintFromTitle("Se reprogramó la migración de datos")).toBe("se-reprogramo-la-migracion-de-datos");
});

// Lo central: dos redacciones que solo difieren en tildes/puntuación son EL MISMO hecho.
test("tildes y puntuación no generan hechos distintos", () => {
  expect(fingerprintFromTitle("La cuarta sesión de Service se reprogramó."))
    .toBe(fingerprintFromTitle("La cuarta sesion de Service se reprogramo"));
});

test("la huella del agente gana sobre el fallback", () => {
  expect(normalizeFingerprint("migracion-licencia-salesforce", "cualquier título"))
    .toBe("migracion-licencia-salesforce");
});

test("huella vacía o basura → cae al fallback del título", () => {
  expect(normalizeFingerprint("", "Se atrasó la migración")).toBe("se-atraso-la-migracion");
  expect(normalizeFingerprint(null, "Se atrasó la migración")).toBe("se-atraso-la-migracion");
  expect(normalizeFingerprint("   ", "Se atrasó la migración")).toBe("se-atraso-la-migracion");
  expect(normalizeFingerprint("!!!", "Se atrasó la migración")).toBe("se-atraso-la-migracion");
});

test("la huella del agente se sanea al mismo shape", () => {
  expect(normalizeFingerprint("Migración Datos / Salesforce!", "x")).toBe("migracion-datos-salesforce");
});

test("dedupeKey = timeline:kind:huella, y se puede volver a extraer la huella", () => {
  const key = buildDedupeKey("cmXYZ", "ATRASO", "migracion-licencia");
  expect(key).toBe("cmXYZ:ATRASO:migracion-licencia");
  expect(extractFingerprint(key)).toBe("migracion-licencia");
});

// El mismo hecho reportado como ATRASO y como COMPROMISO son cosas distintas a propósito:
// uno movió una fecha, el otro la fijó.
test("el kind es parte de la identidad", () => {
  expect(buildDedupeKey("t1", "ATRASO", "x")).not.toBe(buildDedupeKey("t1", "COMPROMISO", "x"));
});

test("el timeline scopea: el mismo hecho en otro proyecto es otra fila", () => {
  expect(buildDedupeKey("t1", "ATRASO", "x")).not.toBe(buildDedupeKey("t2", "ATRASO", "x"));
});

test("extractFingerprint tolera null y basura", () => {
  expect(extractFingerprint(null)).toBeNull();
  expect(extractFingerprint("sin-separadores")).toBeNull();
});
