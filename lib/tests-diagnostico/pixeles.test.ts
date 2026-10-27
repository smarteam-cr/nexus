/**
 * lib/tests-diagnostico/pixeles.test.ts — los píxeles de la página del test (O6 etapa 2): apagados sin su variable, y lo
 * que no tiene la forma de un id no entra a un `<script>`. Que el resultado no los cargue lo cuida el escaneo de abajo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pixelesDelTest } from "./pixeles";

describe("los píxeles del test", () => {
  it("sin variables, ninguno: hasta el corte Nexus no le habla a nadie", () => {
    expect(pixelesDelTest({})).toEqual({ googleAds: null, conversionGoogleAds: null, meta: null, hubspot: null });
  });

  it("con los valores de la página vieja, los cuatro", () => {
    expect(
      pixelesDelTest({
        TESTS_PIXEL_GOOGLE_ADS: " AW-18355922702 ",
        TESTS_PIXEL_GOOGLE_ADS_CONVERSION: "AW-18355922702/9SvvCKjmp9kcEI7O5LBE",
        TESTS_PIXEL_META: "1206241703610274",
        TESTS_PIXEL_HUBSPOT: "6553628",
      }),
    ).toEqual({ googleAds: "AW-18355922702", conversionGoogleAds: "AW-18355922702/9SvvCKjmp9kcEI7O5LBE", meta: "1206241703610274", hubspot: "6553628" });
  });

  it("⛔ lo que no tiene la forma de un id no se carga (va dentro de un <script>)", () => {
    const p = pixelesDelTest({
      TESTS_PIXEL_GOOGLE_ADS: "AW-1');alert(1);//",
      TESTS_PIXEL_META: "123'};",
      TESTS_PIXEL_HUBSPOT: "6553628.js?x",
    });
    expect(p).toEqual({ googleAds: null, conversionGoogleAds: null, meta: null, hubspot: null });
  });

  it("la conversión solo va con su etiqueta, y de la misma cuenta", () => {
    expect(pixelesDelTest({ TESTS_PIXEL_GOOGLE_ADS_CONVERSION: "AW-18355922702/9SvvCKjmp9kcEI7O5LBE" }).conversionGoogleAds).toBeNull();
    expect(
      pixelesDelTest({ TESTS_PIXEL_GOOGLE_ADS: "AW-111111", TESTS_PIXEL_GOOGLE_ADS_CONVERSION: "AW-222222/abcd" }).conversionGoogleAds,
    ).toBeNull();
  });

  it("⛔ el resultado (su dirección lleva el token) no carga los píxeles", () => {
    const raiz = process.cwd();
    const conToken = fs.readFileSync(path.join(raiz, "app/external/test/resultado/[token]/page.tsx"), "utf8");
    const anterior = fs.readFileSync(path.join(raiz, "app/external/test/resultado/anterior/page.tsx"), "utf8");
    for (const f of [conToken, anterior]) expect(f).not.toMatch(/PixelesDelTest|pixelesDelTest/);
    const test = fs.readFileSync(path.join(raiz, "app/external/test/[area]/page.tsx"), "utf8");
    expect(test).toMatch(/<PixelesDelTest/);
  });
});
