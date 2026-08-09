import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/timeline/fin-solo-equipo.test.ts — LAS DOS FRONTERAS DEL CIERRE PROYECTADO.
 *
 * ── FRONTERA 1: no cruza al cliente (decisión de Elías, 2026-08-08) ─────────
 * El cierre proyectado se muestra SOLO en superficies que no se pueden entregar: el Gantt
 * interno, la cartera, el contexto del watchdog. Nunca en un documento del motor de landings,
 * porque esos se rinden IDÉNTICOS para el cliente y para el papel:
 *   · la portada del Kickoff se renderiza en components/external/KickoffClientView.tsx
 *   · la del Cronograma viaja al PDF que el CSE le manda al cliente
 * Al cliente se le sigue mostrando la fecha de cierre solo cuando hay atraso registrado, que es
 * exactamente lo que ya hacía TimelineSection antes de esta tanda.
 *
 * Sin esta guarda, el próximo HeroStat «porque queda lindo en la portada» rompe la decisión sin
 * que nadie lo note hasta que un cliente lea una fecha que nunca le prometimos.
 *
 * ⚠ ES UNA FRONTERA EDITORIAL, NO DE SEGURIDAD: el ancla y las duraciones YA cruzan al cliente
 * en el snapshot externo, así que su navegador podría calcular el fin. Lo que se controla es
 * qué AFIRMAMOS, no qué se puede deducir. Por eso la guarda correcta es un escaneo de las
 * superficies y no un chokepoint de datos.
 *
 * ── FRONTERA 2: no toca la plata ────────────────────────────────────────────
 * Cobranza factura con `fechaInicioFacturacion` + `duracionMeses` (un número contractual). El
 * cierre es una estimación que se mueve sola cada vez que alguien edita una duración:
 * convertirlo en input de facturación volvería una suposición en una factura — la misma regla
 * que lib/projects/exige-trato.test.ts hace cumplir para el alta.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Solo CÓDIGO: los comentarios de estos archivos nombran el helper para explicar la prohibición. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** Las superficies que se ENTREGAN: se renderizan para el cliente o viajan al PDF. */
const SUPERFICIES_ENTREGABLES = [
  "components/canvas/kickoff-sections/KickoffSections.tsx",
  "components/canvas/cronograma-sections/CronogramaSections.tsx",
];

/** Los dos archivos donde una fecha se vuelve una factura. */
const ARCHIVOS_DE_PLATA = ["lib/cobranza/engine.ts", "lib/cobranza/mutations.ts"];

describe("el cierre proyectado no cruza al cliente", () => {
  for (const archivo of SUPERFICIES_ENTREGABLES) {
    it(`${archivo} no calcula el cierre proyectado (se entrega al cliente)`, () => {
      const src = leer(archivo);
      expect(src.length, `${archivo} está vacío o se movió; revisar esta guarda`).toBeGreaterThan(500);
      expect(
        sinComentarios(src),
        `${archivo} muestra el cierre proyectado, y esa superficie la ve el cliente`,
      ).not.toContain("projectedEnd");
    });
  }

  it("la vista del cliente sigue mostrando el cierre SOLO con atraso", () => {
    /* TimelineSection sí usa projectedEnd —se recableó a la fórmula única— pero su `closingDate`
       solo se pinta dentro de `attributionSentence`, que devuelve null sin particularidades con
       impacto. La edición que la pone en rojo: pintar `closingDate` fuera de esa frase. */
    const src = sinComentarios(leer("components/canvas/TimelineSection.tsx"));
    expect(src, "TimelineSection dejó de usar la fórmula única").toContain("projectedEnd(");
    const usos = src.match(/closingDate/g) ?? [];
    expect(usos.length, "closingDate se pinta en más de un lugar: revisar si cruzó al cliente").toBe(2);
    expect(src, "el cierre del cliente dejó de estar atado a la frase de atraso").toContain(
      "closingDate }",
    );
  });
});

describe("el cierre proyectado no toca la plata", () => {
  for (const archivo of ARCHIVOS_DE_PLATA) {
    it(`${archivo} no nombra el cierre proyectado`, () => {
      const src = leer(archivo);
      expect(src.length, `${archivo} está vacío o se movió; revisar esta guarda`).toBeGreaterThan(500);
      expect(
        sinComentarios(src),
        `${archivo} usa el cierre proyectado: una estimación que se mueve sola no puede facturar`,
      ).not.toContain("projectedEnd");
    });
  }

  it("el helper deja escrito el límite con cobranza", () => {
    /* Si alguien borra la explicación, el próximo que lo lea no sabe por qué no puede usarlo
       para facturar. El comentario ES parte de la guarda. */
    const src = leer("lib/timeline/weeks.ts");
    expect(src, "el docblock de projectedEnd perdió el límite con la plata").toContain(
      "NUNCA es input de cobranza",
    );
    expect(src).toContain("fechaInicioFacturacion");
  });

  it("el escaneo mira código, no comentarios (si no, no prueba nada)", () => {
    /* weeks.ts nombra fechaInicioFacturacion a propósito, para prohibirla. Este assert fija que
       los de arriba se apoyan en el filtro y no pasan por casualidad. */
    const conComentarios = leer("lib/timeline/weeks.ts");
    expect(conComentarios).toContain("fechaInicioFacturacion");
    expect(sinComentarios(conComentarios)).not.toContain("fechaInicioFacturacion");
  });
});

describe("el cierre SÍ llega a las superficies internas", () => {
  /* La otra mitad de la frontera: si el cierre desaparece de donde el equipo lo necesita, la
     tanda entera queda en nada y ninguna guarda de «no cruza» lo detectaría. */
  const INTERNAS: Array<[string, string]> = [
    ["components/canvas/TimelineGantt.tsx", "Cierre proyectado"],
    ["lib/cs/watchdog-context.ts", "Cierre proyectado"],
    ["lib/portfolio/summary.ts", "projectedISO"],
  ];
  for (const [archivo, marca] of INTERNAS) {
    it(`${archivo} muestra el cierre al equipo`, () => {
      expect(sinComentarios(leer(archivo)), `${archivo} dejó de exponer el cierre`).toContain(marca);
    });
  }
});
