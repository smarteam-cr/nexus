/**
 * lib/cobranza/import-core.test.ts
 *
 * Tests de los helpers PUROS del importador CSV (lib/cobranza/import-core.ts —
 * sin DB ni red). Casos:
 *   A) normalizarDominio: email→dominio, protocolo+www+path, inválido→null, mayúsculas.
 *   B) parseMontoLocal: formato CR "₡1.500.000,00", US "$1,200.50", "1.200,50",
 *      entero pelado, miles repetidos sin decimal, basura→null, number pasa-through.
 *   C) parseFechaLocal: ISO, "15/03/2026" día-primero, inválida→null.
 *   D) normalizarEnumLocal: sinónimos y acentos ("Anticipado", "dólares", "colones").
 *   E) slugNombre: acentos/espacios/puntuación → slug estable.
 *   F) esDominioCompartido: genéricos sí, dominio de empresa no.
 *   G) nombreEnSkipList: internos de Smarteam, "Hub ID:", totales, n/a → true;
 *      empresa real → false.
 *   H) sugerirMapeo: headers conocidos → campos canónicos (header ORIGINAL);
 *      header desconocido no mapea.
 *   I) aplicarMapeo: fila cruda completa → canónico normalizado; celdas vacías →
 *      null; idExterno default = slug del nombre.
 *   J) clampInicioCicloCorriente: fecha vieja → mismo día del mes actual
 *      (clampeada:true); mes actual/futura → intacta; día 31 → fin de mes corto.
 *   K) warningsFila: skip-list, sin dominio, dominio compartido; fila limpia → [].
 *
 * Correr: `npx vitest run lib/cobranza/import-core.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  normalizarDominio,
  parseMontoLocal,
  parseFechaLocal,
  normalizarEnumLocal,
  parseDiaAncla,
  slugNombre,
  esDominioCompartido,
  nombreEnSkipList,
  sugerirMapeo,
  aplicarMapeo,
  clampInicioCicloCorriente,
  warningsFila,
} from "./import-core";

// ── A) normalizarDominio ─────────────────────────────────────────────────────────

test("A1 normalizarDominio: un email se reduce a su dominio", () => {
  expect(normalizarDominio("pagos@Empresa.com")).toBe("empresa.com");
});

test("A2 normalizarDominio: protocolo + www + path se limpian", () => {
  expect(normalizarDominio("https://www.Empresa.com/contacto?x=1")).toBe("empresa.com");
});

test("A3 normalizarDominio: mayúsculas y espacios alrededor", () => {
  expect(normalizarDominio("  EMPRESA.COM  ")).toBe("empresa.com");
});

test("A4 normalizarDominio: basura / vacío / null → null", () => {
  expect(normalizarDominio("no es un dominio")).toBeNull();
  expect(normalizarDominio("")).toBeNull();
  expect(normalizarDominio(null)).toBeNull();
  expect(normalizarDominio(undefined)).toBeNull();
});

// ── B) parseMontoLocal ───────────────────────────────────────────────────────────

test("B1 parseMontoLocal: formato CR con símbolo, miles con punto y decimal con coma", () => {
  expect(parseMontoLocal("₡1.500.000,00")).toBe(1500000);
});

test("B2 parseMontoLocal: formato US con miles con coma y decimal con punto", () => {
  expect(parseMontoLocal("$1,200.50")).toBe(1200.5);
});

test("B3 parseMontoLocal: miles con punto + decimal con coma sin símbolo", () => {
  expect(parseMontoLocal("1.200,50")).toBe(1200.5);
});

test("B4 parseMontoLocal: entero pelado", () => {
  expect(parseMontoLocal("1200")).toBe(1200);
});

test("B5 parseMontoLocal: separador de miles repetido sin decimal NO es decimal", () => {
  expect(parseMontoLocal("1.500.000")).toBe(1500000);
});

test("B6 parseMontoLocal: basura → null; number pasa-through; NaN → null", () => {
  expect(parseMontoLocal("sin dato")).toBeNull();
  expect(parseMontoLocal(null)).toBeNull();
  expect(parseMontoLocal(1234.567)).toBe(1234.57); // redondeo a 2 decimales
  expect(parseMontoLocal(Number.NaN)).toBeNull();
});

// ── C) parseFechaLocal ───────────────────────────────────────────────────────────

test("C1 parseFechaLocal: ISO pasa (con padding de mes/día)", () => {
  expect(parseFechaLocal("2026-03-15")).toBe("2026-03-15");
  expect(parseFechaLocal("2026-3-5")).toBe("2026-03-05");
});

test("C2 parseFechaLocal: formato local día-primero", () => {
  expect(parseFechaLocal("15/03/2026")).toBe("2026-03-15");
  expect(parseFechaLocal("15-3-2026")).toBe("2026-03-15");
});

test("C3 parseFechaLocal: inválida → null", () => {
  expect(parseFechaLocal("no es fecha")).toBeNull();
  expect(parseFechaLocal("40/03/2026")).toBeNull(); // día imposible
  expect(parseFechaLocal(null)).toBeNull();
});

// ── D) normalizarEnumLocal ───────────────────────────────────────────────────────

test("D1 normalizarEnumLocal: sinónimos con mayúsculas y acentos", () => {
  expect(normalizarEnumLocal("terminosPago", "Anticipado")).toBe("ANTICIPADO");
  expect(normalizarEnumLocal("terminosPago", "Mes Vencido")).toBe("VENCIDO");
  expect(normalizarEnumLocal("moneda", "dólares")).toBe("USD");
  expect(normalizarEnumLocal("moneda", "colones")).toBe("CRC");
  expect(normalizarEnumLocal("tipo", "Nacional")).toBe("NACIONAL");
  expect(normalizarEnumLocal("viaCobro", "Mercury")).toBe("MERCURY");
});

test("D2 normalizarEnumLocal: valor desconocido / vacío → null", () => {
  expect(normalizarEnumLocal("moneda", "euros")).toBeNull();
  expect(normalizarEnumLocal("tipo", "")).toBeNull();
  expect(normalizarEnumLocal("viaCobro", null)).toBeNull();
});

// ── E) slugNombre ────────────────────────────────────────────────────────────────

test("E1 slugNombre: acentos, espacios y puntuación → slug estable", () => {
  expect(slugNombre("Ferretería Noelitto S.A.")).toBe("ferreteria-noelitto-s-a");
  expect(slugNombre("  Almacén  Ñandú  ")).toBe("almacen-nandu");
});

// ── F) esDominioCompartido ───────────────────────────────────────────────────────

test("F1 esDominioCompartido: genéricos sí, empresa no", () => {
  expect(esDominioCompartido("gmail.com")).toBe(true);
  expect(esDominioCompartido("Hotmail.com")).toBe(true); // case-insensitive
  expect(esDominioCompartido("empresa.com")).toBe(false);
});

// ── G) nombreEnSkipList ──────────────────────────────────────────────────────────

test("G1 nombreEnSkipList: internos de Smarteam y basura de sheet → true", () => {
  expect(nombreEnSkipList("Smarteam")).toBe(true);
  expect(nombreEnSkipList("smarteam_devs")).toBe(true);
  expect(nombreEnSkipList("Hub ID: 123")).toBe(true);
  expect(nombreEnSkipList("TOTAL")).toBe(true);
  expect(nombreEnSkipList("n/a")).toBe(true);
});

test("G2 nombreEnSkipList: empresa real → false", () => {
  expect(nombreEnSkipList("Ferretería Noelitto")).toBe(false);
});

// ── H) sugerirMapeo ──────────────────────────────────────────────────────────────

test("H1 sugerirMapeo: headers conocidos mapean al campo canónico con el header ORIGINAL", () => {
  const mapeo = sugerirMapeo(["Cliente", "Monto Mensual", "Correo"]);
  expect(mapeo.clienteNombre).toBe("Cliente");
  expect(mapeo.suscripcionMonto).toBe("Monto Mensual");
  expect(mapeo.correoCobro).toBe("Correo");
});

test("H2 sugerirMapeo: header desconocido no mapea a nada", () => {
  const mapeo = sugerirMapeo(["Columna Rarísima", "Cliente"]);
  expect(Object.values(mapeo)).not.toContain("Columna Rarísima");
  expect(mapeo.clienteNombre).toBe("Cliente");
});

// ── I) aplicarMapeo ──────────────────────────────────────────────────────────────

const MAPEO_FULL = {
  clienteNombre: "Cliente",
  dominio: "Sitio",
  correoCobro: "Correo",
  tipo: "Tipo",
  viaCobro: "Vía",
  moneda: "Moneda",
  terminosPago: "Términos",
  diaCobroAncla: "Día",
  suscripcionMonto: "Monto Mensual",
  suscripcionInicio: "Inicio",
  notas: "Notas",
} as const;

test("I1 aplicarMapeo: fila cruda completa → canónico normalizado", () => {
  const canonico = aplicarMapeo(
    {
      Cliente: "Ferretería Noelitto",
      Sitio: "https://www.Noelitto.cr/tienda",
      Correo: "Pagos@Noelitto.cr",
      Tipo: "nacional",
      Vía: "Odoo",
      Moneda: "colones",
      Términos: "Mes Anticipado",
      Día: "15",
      "Monto Mensual": "₡1.500.000,00",
      Inicio: "15/03/2026",
      Notas: "cliente antiguo",
    },
    MAPEO_FULL,
  );
  expect(canonico).toEqual({
    clienteNombre: "Ferretería Noelitto",
    dominio: "noelitto.cr",
    correoCobro: "pagos@noelitto.cr",
    razonSocial: null,
    cedulaJuridica: null,
    idExterno: "ferreteria-noelitto", // default = slug del nombre (sin columna id)
    tipo: "NACIONAL",
    viaCobro: "ODOO",
    moneda: "CRC",
    terminosPago: "ANTICIPADO",
    diaCobroAncla: 15,
    suscripcionMonto: 1500000,
    suscripcionMoneda: null,
    suscripcionInicio: "2026-03-15",
    notas: "cliente antiguo",
  });
});

test("I2 aplicarMapeo: celdas vacías o sin columna mapeada → null", () => {
  const canonico = aplicarMapeo(
    { Cliente: "Acme", Sitio: "", Correo: "   " },
    { clienteNombre: "Cliente", dominio: "Sitio", correoCobro: "Correo" },
  );
  expect(canonico.clienteNombre).toBe("Acme");
  expect(canonico.dominio).toBeNull();
  expect(canonico.correoCobro).toBeNull();
  expect(canonico.suscripcionMonto).toBeNull(); // campo sin columna mapeada
  expect(canonico.notas).toBeNull();
});

test("I3 aplicarMapeo: la columna id explícita gana sobre el slug", () => {
  const canonico = aplicarMapeo(
    { Cliente: "Acme", ID: "row-42" },
    { clienteNombre: "Cliente", idExterno: "ID" },
  );
  expect(canonico.idExterno).toBe("row-42");
});

test("I4 parseDiaAncla: entero 1-31; fuera de rango o basura → null", () => {
  expect(parseDiaAncla("15")).toBe(15);
  expect(parseDiaAncla("0")).toBeNull();
  expect(parseDiaAncla("32")).toBeNull();
  expect(parseDiaAncla("quince")).toBeNull();
});

// ── J) clampInicioCicloCorriente ─────────────────────────────────────────────────

test("J1 clamp: fecha de un mes pasado se corre al mismo día del mes actual", () => {
  expect(clampInicioCicloCorriente("2026-03-15", "2026-07-10")).toEqual({
    fechaISO: "2026-07-15",
    clampeada: true,
  });
});

test("J2 clamp: fecha del mes actual o futura queda intacta", () => {
  expect(clampInicioCicloCorriente("2026-07-01", "2026-07-10")).toEqual({
    fechaISO: "2026-07-01",
    clampeada: false,
  });
  expect(clampInicioCicloCorriente("2026-09-01", "2026-07-10")).toEqual({
    fechaISO: "2026-09-01",
    clampeada: false,
  });
});

test("J3 clamp: día 31 aterrizando en mes corto se clampea al fin de mes", () => {
  expect(clampInicioCicloCorriente("2025-01-31", "2026-02-10")).toEqual({
    fechaISO: "2026-02-28",
    clampeada: true,
  });
});

// ── K) warningsFila ──────────────────────────────────────────────────────────────

test("K1 warningsFila: nombre en skip-list y sin dominio → ambos warnings", () => {
  const w = warningsFila({ clienteNombre: "Smarteam", dominio: null });
  expect(w.some((x) => x.includes("lista de exclusión"))).toBe(true);
  expect(w.some((x) => x.includes("Sin dominio"))).toBe(true);
});

test("K2 warningsFila: dominio compartido avisa que no se registrará", () => {
  const w = warningsFila({ clienteNombre: "Acme", dominio: "gmail.com" });
  expect(w).toHaveLength(1);
  expect(w[0]).toContain("gmail.com");
});

test("K3 warningsFila: fila limpia → sin warnings", () => {
  expect(warningsFila({ clienteNombre: "Acme", dominio: "acme.com" })).toEqual([]);
});
