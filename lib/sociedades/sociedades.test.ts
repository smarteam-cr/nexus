import { describe, expect, it } from "vitest";
import {
  claveDelFiltro,
  coincidenciaDeAlias,
  contarPorSociedad,
  filtrarPorSociedad,
  normalizarTexto,
  opcionesDelFiltro,
  sociedadDeLaCuenta,
  sociedadPorCompany,
  sociedadPorTexto,
  type SociedadPropiaDTO,
} from "./sociedades";

const base = { razonSocial: null, pais: "CR", activa: true };
/** Las cuatro del SQL del 2026-11-13. */
const SOCIEDADES: SociedadPropiaDTO[] = [
  { ...base, id: "cr", clave: "cr-smarteam", nombre: "CR Smarteam", plataforma: "ODOO", odooCompanyId: 1, alias: ["cr smarteam", "smarteam sociedad anonima"], principal: true, orden: 1 },
  { ...base, id: "llc", clave: "smarteam-llc", nombre: "Smarteam Consultora LLC", plataforma: "MERCURY", odooCompanyId: null, alias: ["smarteam consult", "smarteam consultora", "smarteam consultoria"], principal: false, orden: 2 },
  { ...base, id: "agro", clave: "smartagro", nombre: "Smart Agro", plataforma: "NINGUNA", odooCompanyId: null, alias: ["smartagro", "smart agro", "smarteam agropecuario"], principal: false, orden: 3 },
  { ...base, id: "fly", clave: "flywheel", nombre: "Flywheel", plataforma: "NINGUNA", odooCompanyId: null, alias: ["flywheel"], principal: false, orden: 4 },
];

describe("reconocer una sociedad por su nombre (lo que escribe Odoo y el banco)", () => {
  it("sin tildes, sin mayúsculas y por palabras enteras", () => {
    expect(normalizarTexto("  Cuentas por Cobrar FLYWHEEL Centroamérica S.A ")).toBe("cuentas por cobrar flywheel centroamerica s a");
    expect(coincidenciaDeAlias("Cuentas por Cobrar Flywheel Centroamerica S.A", ["flywheel"])).toBe(8);
    expect(coincidenciaDeAlias("Flywheels Inc", ["flywheel"])).toBe(0);
  });

  it("✓ lo que se midió en Odoo el 2026-11-13", () => {
    expect(sociedadPorTexto(["Cuenta por cobrar SmartAgro"], SOCIEDADES)?.id).toBe("agro");
    expect(sociedadPorTexto(["Smarteam Agropecuario"], SOCIEDADES)?.id).toBe("agro");
    expect(sociedadPorTexto(["W/T-S50080 SMARTEAM CONSULT"], SOCIEDADES)?.id).toBe("llc");
    expect(sociedadPorTexto(["Smarteam Consultoria LLC "], SOCIEDADES)?.id).toBe("llc");
    expect(sociedadPorTexto(["CR SMARTEAM SOCIEDAD ANONIMA"], SOCIEDADES)?.id).toBe("cr");
    expect(sociedadPorTexto(["FLYWHEEL CENTRO AMERICA"], SOCIEDADES)?.id).toBe("fly");
  });

  it("✗ «Smarteam» solo no es de nadie: no se le atribuye una deuda a quien no es", () => {
    expect(sociedadPorTexto(["Smarteam"], SOCIEDADES)).toBeNull();
    expect(sociedadPorTexto(["TEF DE: 966330763"], SOCIEDADES)).toBeNull();
  });

  it("excluye a la sociedad de los libros: el contacto «CR SMARTEAM» en sus propios libros no es contraparte", () => {
    expect(sociedadPorTexto(["CR SMARTEAM SOCIEDAD ANONIMA"], SOCIEDADES, "cr")).toBeNull();
  });

  it("con dos nombradas por igual, nadie", () => {
    const dos = [
      { id: "a", alias: ["grupo uno"] },
      { id: "b", alias: ["grupo dos"] },
    ];
    expect(sociedadPorTexto(["grupo uno y grupo dos"], dos)).toBeNull();
  });

  it("la compañía de Odoo dice de quién son los libros", () => {
    expect(sociedadPorCompany(1, SOCIEDADES)?.id).toBe("cr");
    expect(sociedadPorCompany(2, SOCIEDADES)).toBeNull();
    expect(sociedadPorCompany(null, SOCIEDADES)).toBeNull();
  });
});

describe("de qué sociedad es una cuenta de cobranza", () => {
  it("sin la suya puesta, la de su vía: Odoo → CR Smarteam, Mercury → la LLC", () => {
    expect(sociedadDeLaCuenta({ sociedadPropiaId: null, viaCobro: "ODOO" }, SOCIEDADES)?.id).toBe("cr");
    expect(sociedadDeLaCuenta({ sociedadPropiaId: null, viaCobro: "MERCURY" }, SOCIEDADES)?.id).toBe("llc");
  });

  it("una vía que ninguna usa cae en la principal", () => {
    expect(sociedadDeLaCuenta({ sociedadPropiaId: null, viaCobro: "OTRA" }, SOCIEDADES)?.id).toBe("cr");
  });

  it("⭐ una cuenta de Smart Agro, con el mismo flujo de la principal (vía Odoo)", () => {
    expect(sociedadDeLaCuenta({ sociedadPropiaId: "agro", viaCobro: "ODOO" }, SOCIEDADES)?.id).toBe("agro");
  });

  it("una sociedad puesta que se desactivó vuelve a la de su vía", () => {
    const sinAgro = SOCIEDADES.map((s) => (s.id === "agro" ? { ...s, activa: false } : s));
    expect(sociedadDeLaCuenta({ sociedadPropiaId: "agro", viaCobro: "ODOO" }, sinAgro)?.id).toBe("cr");
  });
});

describe("el filtro por sociedad", () => {
  const filas = [
    { id: 1, cuenta: "a" },
    { id: 2, cuenta: "b" },
    { id: 3, cuenta: null },
  ];
  const claveDe = (f: { cuenta: string | null }) => (f.cuenta === "a" ? "cr-smarteam" : f.cuenta === "b" ? "smartagro" : null);

  it("«todas» deja la lista igual; una sociedad deja solo las suyas (sin sociedad no es de ninguna)", () => {
    expect(filtrarPorSociedad(filas, null, claveDe).map((f) => f.id)).toEqual([1, 2, 3]);
    expect(filtrarPorSociedad(filas, "smartagro", claveDe).map((f) => f.id)).toEqual([2]);
  });

  it("un `?sociedad=` que no existe no filtra", () => {
    expect(claveDelFiltro("flywheel", SOCIEDADES)).toBe("flywheel");
    expect(claveDelFiltro("no-existe", SOCIEDADES)).toBeNull();
    expect(claveDelFiltro("todas", SOCIEDADES)).toBeNull();
    expect(claveDelFiltro(undefined, SOCIEDADES)).toBeNull();
  });

  it("las opciones: «Todas» y las que tienen filas (Flywheel no cobra: no aparece), salvo la elegida", () => {
    const conteo = contarPorSociedad(filas, claveDe);
    expect(opcionesDelFiltro(SOCIEDADES, conteo, null).map((o) => o.clave)).toEqual(["todas", "cr-smarteam", "smartagro"]);
    expect(opcionesDelFiltro(SOCIEDADES, conteo, "flywheel").map((o) => o.clave)).toEqual(["todas", "cr-smarteam", "smartagro", "flywheel"]);
    expect(opcionesDelFiltro(SOCIEDADES, conteo, null)[0]!.cuenta).toBe(2);
  });
});
