/**
 * lib/utils/matching.test.ts
 *
 * Tests de los helpers PUROS de matching por nombre/dominio/email/tokens. Casos:
 *   A) normalize: acentos vía NFD (é→e, ñ→n) + lowercase; string vacío.
 *   B) extractTitleTerms: filtra sufijos legales y tokens <3 chars; separadores
 *      múltiples (guión, &, paréntesis, puntos); string vacío → [].
 *   C) extractDomain: URL https con www/path/slash final; dominio pelado con
 *      www/mayúsculas; texto que no es dominio → null; "https://" inválida → null.
 *   D) extractDomains: batch que ignora null/undefined/vacíos y dedupea en Set.
 *   E) tokenizeTitle: Set normalizado con mínimo 2 chars, separadores raros
 *      ([]:!?¿¡) y dedupe tras quitar acentos.
 *   F) extractEmail: "Nombre <email>" con mayúsculas; email pelado dentro de
 *      texto libre; fallback sin email → devuelve el string lowercased/trimmed
 *      tal cual (SIN quitar acentos — comportamiento real, ver comentario).
 *
 * No se modificó el código fuente (todas las funciones ya estaban exportadas).
 * Correr: `npx vitest run lib/utils/matching.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  normalize,
  extractTitleTerms,
  extractDomain,
  extractDomains,
  tokenizeTitle,
  extractEmail,
} from "./matching";

// ── normalize ────────────────────────────────────────────────────────────────

test("normalize — quita acentos (NFD), convierte ñ→n y baja a minúsculas", () => {
  expect(normalize("Álvaro Núñez")).toBe("alvaro nunez");
  expect(normalize("SESIÓN Café É")).toBe("sesion cafe e");
});

test("normalize — string vacío queda vacío", () => {
  expect(normalize("")).toBe("");
});

// ── extractTitleTerms ────────────────────────────────────────────────────────

test("extractTitleTerms — filtra sufijos legales y tokens de menos de 3 chars", () => {
  // "grupo" está en LEGAL_SUFFIXES; "s" y "a" (el split corta por los puntos)
  // quedan fuera por longitud. Sobrevive solo el nombre distintivo.
  expect(extractTitleTerms("Grupo DISTELSA S.A.")).toEqual(["distelsa"]);
});

test("extractTitleTerms — separadores múltiples (guión, &, paréntesis) y país de 2 chars fuera", () => {
  expect(extractTitleTerms("Coca-Cola & Asociados (CR)")).toEqual([
    "coca",
    "cola",
    "asociados",
  ]);
});

test("extractTitleTerms — string vacío devuelve lista vacía", () => {
  expect(extractTitleTerms("")).toEqual([]);
});

// ── extractDomain ────────────────────────────────────────────────────────────

test("extractDomain — URL con https, www, path y slash final → hostname limpio", () => {
  expect(extractDomain("https://www.Example.com/pricing/")).toBe("example.com");
});

test("extractDomain — dominio pelado con www, mayúsculas y espacios se limpia", () => {
  expect(extractDomain("  www.Acme.co.cr ")).toBe("acme.co.cr");
  expect(extractDomain("ACME.COM")).toBe("acme.com");
});

test("extractDomain — texto que no es dominio devuelve null", () => {
  expect(extractDomain("Acme Corporation")).toBeNull(); // espacio → no matchea
  expect(extractDomain("acme")).toBeNull(); // sin TLD
  expect(extractDomain("")).toBeNull();
});

test("extractDomain — prefijo https pero URL inválida devuelve null", () => {
  expect(extractDomain("https://")).toBeNull(); // new URL() lanza → catch → null
});

// ── extractDomains ───────────────────────────────────────────────────────────

test("extractDomains — batch: ignora null/undefined/vacíos/no-dominios y dedupea", () => {
  const domains = extractDomains([
    "https://www.acme.com/about", // → acme.com
    "acme.com", // duplicado → dedupeado por el Set
    null,
    undefined,
    "",
    "Acme Inc", // no es dominio → descartado
    "otro.io",
  ]);
  expect(domains).toEqual(new Set(["acme.com", "otro.io"]));
});

// ── tokenizeTitle ────────────────────────────────────────────────────────────

test("tokenizeTitle — Set normalizado, mínimo 2 chars y separadores raros", () => {
  expect(tokenizeTitle("Kickoff: Acme [Fase 1] ¡Demo! ¿Qué?")).toEqual(
    new Set(["kickoff", "acme", "fase", "demo", "que"]) // "1" queda fuera (<2)
  );
});

test("tokenizeTitle — dedupea tras normalizar acentos y mayúsculas", () => {
  expect(tokenizeTitle("Sesión sesion SESIÓN")).toEqual(new Set(["sesion"]));
});

// ── extractEmail ─────────────────────────────────────────────────────────────

test('extractEmail — formato "Nombre <email>" extrae y baja a minúsculas', () => {
  expect(extractEmail("Juan Pérez <Juan.Perez@Acme.COM>")).toBe(
    "juan.perez@acme.com"
  );
});

test("extractEmail — email pelado dentro de texto libre (con + y subdominio)", () => {
  expect(extractEmail("contacto: MARIA+ventas@sub.Acme.io (backup)")).toBe(
    "maria+ventas@sub.acme.io"
  );
});

test("extractEmail — sin email devuelve el string lowercased/trimmed (conserva acentos)", () => {
  expect(extractEmail("  Juan Pérez  ")).toBe("juan pérez");
  // ángulos sin @ adentro no cuentan como email → cae al fallback
  expect(extractEmail("Foo <bar>")).toBe("foo <bar>");
});
