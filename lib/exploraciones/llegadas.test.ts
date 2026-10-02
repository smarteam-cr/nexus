/**
 * lib/exploraciones/llegadas.test.ts — leer quién hizo el test desde la nota que deja, y dejar fuera
 * las pruebas del equipo. Las notas son copias del formato real (2026-10-01), con datos ficticios.
 */
import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { agruparLlegadas, enlaceDelResultado, esDePrueba, leerNotaDelTest, type NotaDeLlegada } from "./llegadas";

const enlace = (area: string, fecha: string) =>
  `https://dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#${compressToEncodedURIComponent(JSON.stringify({ v: 1, area, fecha, dims: { procesos: { nivel: 2 } } }))}`;

const terminada = (url: string) =>
  `<h3>📊 Diagnóstico de Rendimiento — Ventas · Nivel global: Deficiente · Herramientas sin exprimir</h3>` +
  `<p><strong>Quién:</strong> Ana Pérez, Gerente Ventas — ana@ferreteria.cr · 📱 +50688888888<br>` +
  `<strong>Empresa:</strong> — · ferreteria.cr · Comercio mayorista / Distribución<br><strong>Fecha:</strong> 30 de septiembre de 2026</p>` +
  `<p><a href="${url.replace(/&/g, "&amp;")}">🔗 Ver el resultado tal como lo vio el prospecto</a></p>`;

const aMedias =
  `<h3>⏳ Diagnóstico SIN TERMINAR — Marketing</h3><p><strong>Quién:</strong> Luis Mora, Propietario — luis@panaderia.cr · 📱 +50677777777<br>` +
  `<strong>Empresa:</strong> — · panaderia.cr · Alimentos<br><strong>Última actividad:</strong> 1 de octubre de 2026</p>`;

describe("la nota del test", () => {
  it("una terminada trae quién, la empresa y el resultado", () => {
    const n = leerNotaDelTest(terminada(enlace("ventas", "2026-09-30")));
    expect(n).toMatchObject({ estado: "terminado", areaId: "1", contacto: "Ana Pérez", email: "ana@ferreteria.cr", dominio: "ferreteria.cr" });
    expect(n?.resultado?.fecha).toBe("2026-09-30");
  });

  it("una a medias no tiene resultado; el área sale del título", () => {
    expect(leerNotaDelTest(aMedias)).toMatchObject({ estado: "sinTerminar", areaId: "2", contacto: "Luis Mora", dominio: "panaderia.cr", resultado: null });
  });

  it("otra nota que habla de un diagnóstico no es del test", () => {
    expect(leerNotaDelTest("<h2>🔍 Diagnóstico del Caso</h2><p>Industria: servicios legales.</p>")).toBeNull();
    expect(leerNotaDelTest("<p>Revisé el diagnóstico comercial que completó.</p>")).toBeNull();
  });

  it("el enlace se encuentra aunque el HTML escape el &", () => {
    expect(enlaceDelResultado(`<a href="https://x.com/resultado.html#abc&amp;d">ver</a>`)).toBe("https://x.com/resultado.html#abc&d");
    expect(enlaceDelResultado("<p>sin enlace</p>")).toBeNull();
  });
});

describe("las pruebas del equipo quedan fuera", () => {
  it.each([
    [{ email: "qa-correo-personal@ejemplo-test.com" }],
    [{ email: "elias@empresa-prueba.com" }],
    [{ email: "test@test.com" }],
    [{ email: "egonzalez@smarteamcr.com" }],
    [{ email: "lflores@cr.smarteamcr.com" }],
    [{ email: "cvalderrama@hubspot.com" }],
    [{ contacto: "QA Correo Personal (borrar)" }],
    [{ contacto: "Prueba Alejandra" }],
    [{ contacto: "Lorena Test Osorio" }],
    [{ empresa: "Empresa para pruebas" }],
    [{ dominio: "empresaprueba.com" }],
  ])("%o", (q) => expect(esDePrueba(q)).toBe(true));

  it.each([
    [{ contacto: "Adriana Zamora", email: "adriana.zamora@credit-force.com", dominio: "credit-force.com", empresa: "CreditForce" }],
    [{ contacto: "Karol Sánchez", email: "kasanchez@itcr.ac.cr", dominio: "itcr.ac.cr" }],
    [{ contacto: "Héctor Solano", email: "hsolano@oceanica.com.mx", empresa: "Clínica Oceánica" }],
    [{ contacto: "Ana Testa", email: "ana@contestar.com" }],
  ])("%o es un lead de verdad", (q) => expect(esDePrueba(q)).toBe(false));
});

describe("una llegada por empresa", () => {
  const nota = (estado: "terminado" | "sinTerminar", contacto: string) => ({
    estado,
    areaId: "1",
    contacto,
    email: null,
    dominio: null,
    resultado: null,
  });
  const n = (companyId: string, ts: number, estado: "terminado" | "sinTerminar", contacto: string): NotaDeLlegada => ({
    ts,
    companyId,
    contactoId: `c-${contacto}`,
    nota: nota(estado, contacto),
  });

  it("manda el último terminado; cuenta los intentos; lo más reciente arriba", () => {
    const r = agruparLlegadas([
      n("A", Date.parse("2026-08-01"), "terminado", "Ana"),
      n("A", Date.parse("2026-09-01"), "sinTerminar", "Beto"),
      n("B", Date.parse("2026-09-10"), "sinTerminar", "Caro"),
    ]);
    expect(r.map((l) => l.companyId)).toEqual(["B", "A"]);
    expect(r[1]).toMatchObject({ terminado: true, contacto: "Ana", intentos: 2, fecha: "2026-08-01" });
    expect(r[0]).toMatchObject({ terminado: false, contacto: "Caro", intentos: 1 });
  });
});
