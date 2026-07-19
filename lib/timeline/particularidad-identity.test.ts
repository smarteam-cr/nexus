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
  summarizeDuplicates,
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

// ── El defecto que fija este bloque ──────────────────────────────────────────────
// El panel decía "2 desviaciones repetidas" y el grupo al que llevaba el botón mostraba 3 filas:
// el contador sumaba el EXCEDENTE (length-1) y el grupo mostraba el TOTAL (.flat()). Un contador
// que no coincide con el destino de su propio botón es peor que no tener contador.

const TRES_DEL_MISMO = [
  { id: "a", kind: "ATRASO", title: "La cuarta sesión de servicio se reprogramó para el 9 de julio" },
  { id: "b", kind: "ATRASO", title: "La cuarta sesión de Service se reprogramó para el 9 de julio" },
  { id: "c", kind: "ATRASO", title: "La cuarta sesión de servicio quedó reprogramada al 9 de julio" },
  { id: "z", kind: "ATRASO", title: "El go-live de Sales Hub no se completó antes de fin de junio" },
];

test("summarizeDuplicates: filas es lo que se VE, hechos es lo que se RESUELVE", () => {
  const s = summarizeDuplicates(TRES_DEL_MISMO);
  expect(s.hechos).toBe(1);
  expect(s.filas).toBe(3);
  expect(s.ids.sort()).toEqual(["a", "b", "c"]);
});

// La invariante: lo que dice el panel tiene que ser lo que muestra el grupo destino.
test("el contador del panel coincide con el tamaño del grupo destino", () => {
  const s = summarizeDuplicates(TRES_DEL_MISMO);
  const grupoDestino = TRES_DEL_MISMO.filter((p) => new Set(s.ids).has(p.id));
  expect(grupoDestino).toHaveLength(s.filas);
});

test("sin repetidas: todo en cero, y ningún id", () => {
  const s = summarizeDuplicates([
    { id: "a", kind: "ATRASO", title: "El go-live de Sales Hub no se completó antes de fin de junio" },
    { id: "b", kind: "ATRASO", title: "La migración quedó en espera hasta renovar la licencia" },
  ]);
  expect(s).toEqual({ hechos: 0, filas: 0, ids: [] });
});

test("dos hechos repetidos: los ids del mismo hecho quedan adyacentes", () => {
  const s = summarizeDuplicates([
    { id: "a1", kind: "ATRASO", title: "La cuarta sesión de servicio se reprogramó para julio" },
    { id: "b1", kind: "ATRASO", title: "La migración completa se postergó hasta vencer la licencia" },
    { id: "a2", kind: "ATRASO", title: "La cuarta sesión de Service se reprogramó para julio" },
    { id: "b2", kind: "ATRASO", title: "La migración completa de datos se postergó hasta vencer la licencia" },
  ]);
  expect(s.hechos).toBe(2);
  expect(s.filas).toBe(4);
  // Adyacentes: el destino los muestra juntos sin lógica de agrupamiento en el render.
  expect(s.ids).toEqual(["a1", "a2", "b1", "b2"]);
});
