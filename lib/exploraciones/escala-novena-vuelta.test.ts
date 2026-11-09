/**
 * lib/exploraciones/escala-novena-vuelta.test.ts — La escala de la preventa, novena vuelta (2026-11-08, Elías: «cuando se
 * selecciona Marketing hay un desplazamiento vertical aún»). Lo que cambiaba de alto al sumar un área estaba DEBAJO del
 * radar: la leyenda sumaba su renglón de colores (y podía partirse), el texto de debajo sumaba «Encima, Marketing…», y
 * «Para explorar más» sumaba la tarjeta de Marketing, a veces antes de la de Ventas. Estas pruebas cuidan que el radar
 * interno tenga la misma caja y la misma leyenda (en estructura) con una o con varias áreas, y que la pantalla no vuelva
 * a colgar de la elección lo que va debajo. La lógica de elegir y soltar (también la última) está en
 * lib/escala/areas-superpuestas.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import { fraseDelFreno } from "./equipos-de-la-escala";

const niveles = [
  { letra: "D" as const, nombre: "Deficiente" },
  { letra: "I" as const, nombre: "Inicial" },
  { letra: "F" as const, nombre: "Funcional" },
  { letra: "E" as const, nombre: "Eficiente" },
  { letra: "O" as const, nombre: "Óptimo" },
];
const capas = [
  { clave: "base" as const, nombre: "Base operativa", nivel: null, puntaje: null },
  { clave: "produccion" as const, nombre: "Producción", nivel: null, puntaje: null },
];
const dimsDe = (area: string, nombres: string[], nivel: "I" | "F", porExplorar = false) =>
  nombres.map((nombre, i) => ({
    clave: `${area}.${i + 1}`,
    nombre,
    capa: (i < 2 ? "base" : "produccion") as "base" | "produccion",
    preguntada: i !== 3,
    sinMedir: true,
    nivel: i === 3 ? null : nivel,
    porExplorar,
    puntaje: 30,
  }));

const ventas = dimsDe("1", ["Procesos", "Datos", "Propuesta", "Leads"], "I");
const marketing = dimsDe("2", ["Procesos", "Datos", "Marca de la empresa", "Canales"], "F", true);
const servicio = dimsDe("3", ["Procesos", "Datos", "Casos", "Base de conocimiento"], "F");
const todasLasAreas = [{ dimensiones: ventas }, { dimensiones: marketing }, { dimensiones: servicio }];

const radar = (otras: { area: string; color: string; dimensiones: typeof ventas }[]) =>
  renderToStaticMarkup(
    createElement(RadarDeUnaEmpresa, { area: "Ventas", dimensiones: ventas, capas, niveles, color: "#0b58d3", otras, todasLasAreas }),
  );

/** El primer `viewBox` de cada SVG del radar (el grande y el compacto). */
const cajas = (html: string) => [...html.matchAll(/class="rde-svg[^"]*"|viewBox="([^"]+)" role="img"/g)].map((m) => m[1]).filter(Boolean);
/** La leyenda del radar grande, sin el texto: solo su forma (clases y etiquetas). */
const leyenda = (html: string) => {
  const i = html.indexOf('class="rde-leyenda rde-leyenda-fija"');
  const fin = html.indexOf('class="rde-compacto"');
  return html.slice(i, fin);
};
const forma = (frag: string) => frag.replace(/>[^<]*</g, "><").replace(/ (fill|stroke|style|d|x|y|width|height|rx|points|cx|cy|r)="[^"]*"/g, "");

describe("⛔ sumar Marketing (con Ventas) no le cambia el alto al radar interno", () => {
  const sola = radar([]);
  const conMarketing = radar([{ area: "Marketing", color: "#db2777", dimensiones: marketing }]);
  const lasTres = radar([
    { area: "Marketing", color: "#db2777", dimensiones: marketing },
    { area: "Servicio", color: "#0d9488", dimensiones: servicio },
  ]);

  it("la caja del dibujo es la misma con una, dos o tres áreas", () => {
    expect(cajas(sola).length).toBeGreaterThan(0);
    expect(cajas(conMarketing)).toEqual(cajas(sola));
    expect(cajas(lasTres)).toEqual(cajas(sola));
  });

  it("la leyenda tiene siempre sus dos renglones fijos: las áreas (también una sola) y los símbolos", () => {
    for (const html of [sola, conMarketing, lasTres]) {
      const l = leyenda(html);
      expect(l).toContain('class="rde-leyenda-areas"');
      expect(l).toContain('class="rde-leyenda-simbolos"');
    }
    // Sola, el renglón nombra a Ventas; con Marketing, a las dos y de quién son los nombres.
    expect(leyenda(sola)).toContain("Ventas");
    expect(leyenda(sola)).not.toContain("Los nombres de las partes");
    expect(leyenda(conMarketing)).toContain("Los nombres de las partes son los de Ventas");
  });

  it("los símbolos dependen solo de la principal: sumar un área no los cambia", () => {
    const simbolos = (html: string) => {
      const l = leyenda(html);
      return l.slice(l.indexOf('class="rde-leyenda-simbolos"'));
    };
    expect(simbolos(conMarketing)).toBe(simbolos(sola));
    expect(simbolos(lasTres)).toBe(simbolos(sola));
  });

  it("lo que va antes del dibujo («Ver puntajes») es igual", () => {
    const arriba = (html: string) => html.slice(0, html.indexOf('class="rde-grande"'));
    expect(arriba(conMarketing)).toBe(arriba(sola));
  });

  it("⛔ la página del cliente no lleva los renglones fijos (no pasa `todasLasAreas`)", () => {
    const html = renderToStaticMarkup(createElement(RadarDeUnaEmpresa, { area: "Ventas", dimensiones: ventas, capas, niveles }));
    expect(html).not.toContain("rde-leyenda-fija");
    expect(html).not.toContain("rde-leyenda-areas");
    expect(html).not.toContain("rde-leyenda-simbolos");
    expect(forma(html)).toContain('class="rde-leyenda"');
  });
});

describe("⛔ la pantalla no vuelve a colgar de la elección lo que va debajo del radar (escaneo del texto)", () => {
  const fuente = readFileSync(join(process.cwd(), "components/exploraciones/PasoEscala.tsx"), "utf8");

  it("«Lo que más frena a cada equipo» y «Para explorar más» no reciben las áreas elegidas", () => {
    expect(fuente).toContain("<LoQueFrenaACadaEquipo />");
    expect(fuente).toContain("<ParaExplorarMas />");
    expect(fuente).not.toMatch(/<ParaExplorarMas\s+elegidas/);
  });

  it("el texto debajo del radar no depende de las otras áreas", () => {
    // Si alguien cambia el pie, la prueba falla en vez de revisar un texto vacío.
    const desde = fuente.indexOf("<figcaption");
    expect(desde).toBeGreaterThan(-1);
    const caption = fuente.slice(desde, fuente.indexOf("</figcaption>", desde));
    expect(caption).toContain("Pasa el cursor");
    expect(caption).not.toContain("otras");
    expect(caption).not.toContain("abierta");
  });

  it("se fue «De dónde sale cada nivel» y hay puente a Casos de uso; sin ninguna área, se pide un departamento", () => {
    expect(fuente).not.toContain("<Rotulo>De dónde sale cada nivel");
    expect(fuente).not.toContain("EvidenciaDelArea");
    expect(fuente).toContain('irA("casos")');
    expect(fuente).toContain("Selecciona un departamento");
  });

  it("⛔ la elección se guarda en este navegador por exploración y se lee al volver (sobrevive a recargar)", () => {
    expect(fuente).toContain("claveDeLaEleccion(lugar, exp.id)");
    expect(fuente).toMatch(/useSyncExternalStore\(suscribirseALoGuardado, \(\) => textoGuardado\(clave\)/);
    // Todo cambio de la elección pasa por `fijar`, que la guarda.
    expect(fuente).toContain("guardarLaEleccion(clave, e)");
    expect(fuente).not.toMatch(/setElegidas\(|setPrincipal\(/);
  });
});

describe("«Lo que más frena a cada equipo»: la frase", () => {
  it("con nivel: la parte que lo frena, en qué nivel y de qué capa", () => {
    expect(fraseDelFreno({ conNivel: true, frena: { nombres: ["Datos"], nivel: "Inicial", capa: "Base operativa" }, faltan: 0 })).toBe(
      "Lo frena «Datos», en Inicial: lo más débil de su base operativa.",
    );
    expect(fraseDelFreno({ conNivel: true, frena: { nombres: ["Datos", "Procesos", "Leads"], nivel: "Deficiente", capa: "Producción" }, faltan: 0 })).toBe(
      "Lo frenan «Datos», «Procesos» y «Leads», en Deficiente: lo más débil de su producción.",
    );
  });

  it("sin nivel (faltan partes), cuántas faltan; nunca «Faltan 0»", () => {
    expect(fraseDelFreno({ conNivel: false, frena: null, faltan: 3 })).toBe("Faltan 3 partes sin dato: sin todas no se sabe cuál lo frena. Pregúntalas en la reunión.");
    expect(fraseDelFreno({ conNivel: false, frena: null, faltan: 1 })).toMatch(/^Falta una parte/);
    expect(fraseDelFreno({ conNivel: true, frena: null, faltan: 0 })).toMatch(/^Falta una parte/);
  });
});

describe("⛔ con radar, un área elegida sin nada no corre lo de abajo", () => {
  const fuente = readFileSync(join(process.cwd(), "components/exploraciones/PasoEscala.tsx"), "utf8");
  it("su «Sumar…» va en el renglón de alto fijo de arriba, no debajo del radar", () => {
    expect(fuente).not.toContain("debajoDelRadar");
    expect(fuente).toContain('role="status" className="flex h-5');
    // Los dos bloques de debajo salen de UNA regla.
    expect(fuente.match(/areasDelResumen\(/g)?.length).toBe(1);
  });
});
