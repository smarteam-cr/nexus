/**
 * lib/escala/vista.test.ts — las reglas que la pantalla aplica sobre lo que dice la escala.
 *
 * Qué orden de dependencias vale para cada capa, qué palabras se subrayan, qué nota acompaña a un
 * cierre y qué definición lleva cada respuesta del perfil. Contra la escala de juguete (cada regla)
 * y contra el archivo real (que la versión vigente las tenga todas).
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { MINI_ESCALA } from "./documento/mini-escala.fixture";
import { parsearEscala } from "./documento/parsear";
import { CIERRES, DESPUES } from "./documento/perfil";
import { datosDeLaVista, definicionDeOpcion, notaDelCierre, ordenDeDependencias, partirPorPalabras } from "./vista";

const mini = parsearEscala(MINI_ESCALA);
const real = parsearEscala(leerArchivoDeLaEscala("escala"));

describe("partirPorPalabras", () => {
  const palabras = [
    { termino: "La mayoría", significado: "al menos 80%" },
    { termino: "A tiempo", significado: "dentro del plazo" },
  ];

  it("marca cada palabra con su valor, sin distinguir mayúsculas", () => {
    expect(partirPorPalabras("Se registran a tiempo en la mayoría de los casos.", palabras)).toEqual([
      { texto: "Se registran ", palabra: null },
      { texto: "a tiempo", palabra: palabras[1] },
      { texto: " en ", palabra: null },
      { texto: "la mayoría", palabra: palabras[0] },
      { texto: " de los casos.", palabra: null },
    ]);
  });

  it("solo palabras enteras: «a tiempos» o «Casa tiempo» no se marcan", () => {
    expect(partirPorPalabras("Llegan a tiempos distintos.", palabras)).toEqual([{ texto: "Llegan a tiempos distintos.", palabra: null }]);
    expect(partirPorPalabras("Casa tiempo.", palabras)).toEqual([{ texto: "Casa tiempo.", palabra: null }]);
  });

  it("al principio y al final del texto", () => {
    const t = partirPorPalabras("A tiempo", palabras);
    expect(t).toEqual([{ texto: "A tiempo", palabra: palabras[1] }]);
  });

  it("sin palabras, el texto va entero", () => {
    expect(partirPorPalabras("Cualquier cosa.", [])).toEqual([{ texto: "Cualquier cosa.", palabra: null }]);
  });

  it("un término con signos de expresión regular no rompe el patrón", () => {
    const raras = [{ termino: "(sí)", significado: "x" }];
    expect(partirPorPalabras("Dice (sí) a todo.", raras).map((t) => t.texto)).toEqual(["Dice ", "(sí)", " a todo."]);
  });

  it("en el archivo real, alguna palabra se marca en algún criterio", () => {
    const textos = real.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.map((c) => c.texto))));
    const marcados = textos.filter((t) => partirPorPalabras(t, real.palabrasConValorFijo).some((x) => x.palabra));
    expect(marcados.length).toBeGreaterThan(0);
  });
});

describe("ordenDeDependencias", () => {
  it("la base de Ventas depende del cierre: sin cierre, todas sus filas; con cierre, la suya", () => {
    const sin = ordenDeDependencias(real.dependencias, "Ventas", "Base operativa", null);
    expect(sin.length).toBeGreaterThan(1);
    for (const c of CIERRES) {
      const con = ordenDeDependencias(real.dependencias, "Ventas", "Base operativa", c);
      expect(con, c).toHaveLength(1);
      expect(con[0].orden.length, c).toBe(4);
    }
    // Cada cierre tiene su propio orden (si dos coincidieran, el filtro no estaría eligiendo).
    const ordenes = new Set(CIERRES.map((c) => ordenDeDependencias(real.dependencias, "Ventas", "Base operativa", c)[0].orden.join(">")));
    expect(ordenes.size).toBe(CIERRES.length);
  });

  it("cada capa de cada área tiene su orden, y nombra las cuatro dimensiones de esa capa", () => {
    for (const a of real.areas) {
      for (const capa of real.capas) {
        const filas = ordenDeDependencias(real.dependencias, a.nombre, capa.nombre, "con equipo");
        expect(filas, `${a.nombre} · ${capa.nombre}`).toHaveLength(1);
        const nombres = a.dimensiones.filter((d) => d.capa === capa.clave).map((d) => d.generica?.nombre ?? d.nombre);
        const deLaCapa = a.dimensiones.filter((d) => d.capa === capa.clave).map((d) => d.nombre);
        for (const paso of filas[0].orden) {
          expect(nombres.includes(paso) || deLaCapa.includes(paso), `${a.nombre} · ${capa.nombre}: ${paso}`).toBe(true);
        }
      }
    }
  });

  it("sin tildes ni mayúsculas en la comparación", () => {
    expect(ordenDeDependencias(mini.dependencias, "VENTAS", "base operativa", null)).toEqual(mini.dependencias);
    expect(ordenDeDependencias(mini.dependencias, "Marketing", "Base operativa", null)).toEqual([]);
  });
});

describe("notaDelCierre", () => {
  it("el párrafo que empieza «En la venta transaccional», o la oración que empieza «En la venta mixta»", () => {
    expect(notaDelCierre(mini.perfilDeNegocio, "transaccional")).toBe("En la venta transaccional el negocio es el pedido. Y el vendedor es el canal.");
    expect(notaDelCierre(mini.perfilDeNegocio, "mixta")).toBe("En la venta mixta aplican todos.");
    expect(notaDelCierre(mini.perfilDeNegocio, "con equipo")).toBeNull();
    expect(notaDelCierre(mini.perfilDeNegocio, null)).toBeNull();
    expect(notaDelCierre({ notas: [] }, "transaccional")).toBeNull();
  });

  it("en el archivo real hay nota para la venta transaccional y para la mixta", () => {
    expect(notaDelCierre(real.perfilDeNegocio, "transaccional")).toMatch(/^En la venta transaccional/);
    expect(notaDelCierre(real.perfilDeNegocio, "mixta")).toMatch(/^En la venta mixta/);
  });
});

describe("definicionDeOpcion", () => {
  it("cada respuesta del filtro encuentra su definición en el archivo real", () => {
    for (const c of CIERRES) expect(definicionDeOpcion(real.perfilDeNegocio.cierre, c), c).toMatch(/^cuando /);
    for (const d of DESPUES) expect(definicionDeOpcion(real.perfilDeNegocio.despues, d), d).toMatch(/^cuando /);
  });

  it("la escala dice «Relación única» y el filtro «única»: se encuentra igual, sin tildes", () => {
    expect(definicionDeOpcion(mini.perfilDeNegocio.despues, "única")).toBe("cuando compra una vez");
    expect(definicionDeOpcion(mini.perfilDeNegocio.despues, "continua")).toBe("cuando hay contrato");
    expect(definicionDeOpcion(null, "recompra")).toBeNull();
  });
});

describe("datosDeLaVista", () => {
  const base = { publicadaEn: new Date("2030-01-01T00:00:00Z"), aviso: null, versiones: [{ documento: "escala", version: real.version }] };

  it("solo baja las reglas de asignación que tocan el área que se mira", () => {
    for (const a of real.areas) {
      const d = datosDeLaVista({ escala: real, area: a, ...base });
      expect(d.asignacion.length, a.nombre).toBeGreaterThan(0);
      for (const r of d.asignacion) expect(r.dimensiones.some((id) => id.startsWith(`${a.id}.`)), r.texto.slice(0, 40)).toBe(true);
    }
  });

  it("las novedades son la entrada del historial de ESTA versión; sin manual, sin congelamiento", () => {
    const d = datosDeLaVista({ escala: real, area: real.areas[0], ...base });
    expect(d.novedades?.version).toBe(real.version);
    expect(d.congelamiento).toBeNull();
    expect(d.documentos.find((x) => x.clave === "escala")?.version).toBe(real.version);
    expect(d.documentos.find((x) => x.clave === "manual")?.version).toBeNull();
  });
});
