/**
 * lib/tests-diagnostico/pagina-del-resultado.test.ts — la página de resultado del test público y su PDF (28 oct): el
 * token no se escribe en el log ni viaja a HubSpot con la agenda, un script no se queda con el Chromium, y las barras y
 * el radar dicen lo mismo que el cálculo.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PDF_POR_DIRECCION, PDF_POR_HORA, permitirPdfDeLaDireccion, permitirPdfEnTotal, reiniciarLimites, VENTANA_DE_PDF_MIN } from "./limite";
import {
  puntajeDeLaDimension,
  rutaDeImpresion,
  rutaDelPdf,
  sinElToken,
  srcDeLaAgenda,
  TOKEN_DEL_RESULTADO,
} from "./pagina-del-resultado";

const TOKEN = "a".repeat(40) + "_-Z";

describe("el PDF del resultado", () => {
  it("⛔ el motor abre la página con el token en la CONSULTA: el log del motor escribe la ruta sin ella", () => {
    const ruta = rutaDeImpresion(TOKEN);
    expect(ruta.split("?")[0]).toBe("/external/test/resultado/imprimir");
    expect(ruta.split("?")[0]).not.toContain(TOKEN);
    expect(new URLSearchParams(ruta.split("?")[1]).get("t")).toBe(TOKEN);
    expect(rutaDelPdf(TOKEN)).toBe(`/api/external/test/${TOKEN}/pdf`);
  });

  it("⛔ solo un token con la forma exacta llega a la base", () => {
    expect(TOKEN_DEL_RESULTADO.test(TOKEN)).toBe(true);
    for (const malo of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}%`]) expect(TOKEN_DEL_RESULTADO.test(malo)).toBe(false);
  });

  it("⛔ si el motor falla, el log no lleva el token (un error de navegación trae la dirección entera)", () => {
    const err = `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3004/external/test/resultado/imprimir?t=${TOKEN}`;
    expect(sinElToken(err)).not.toContain(TOKEN);
    expect(sinElToken(err)).toContain("/external/test/resultado/imprimir?t=…");
    expect(sinElToken(`Waiting failed: /external/test/resultado/${TOKEN} "x"`)).not.toContain(TOKEN);
    expect(sinElToken("Navigation timeout of 20000 ms exceeded")).toBe("Navigation timeout of 20000 ms exceeded");
  });

  describe("un script no se queda con el Chromium del servidor", () => {
    afterEach(() => reiniciarLimites());

    it("una dirección pide unos pocos seguidos; pasada la ventana, puede de nuevo", () => {
      const t0 = 1_000_000;
      for (let k = 0; k < PDF_POR_DIRECCION; k++) expect(permitirPdfDeLaDireccion("ip-1", t0 + k)).toBe(true);
      expect(permitirPdfDeLaDireccion("ip-1", t0 + 100)).toBe(false);
      expect(permitirPdfDeLaDireccion("ip-2", t0 + 100)).toBe(true);
      expect(permitirPdfDeLaDireccion("ip-1", t0 + VENTANA_DE_PDF_MIN * 60_000 + 10)).toBe(true);
    });

    it("⛔ los pedidos con tokens inventados no gastan el tope de todos: ese solo cuenta resultados reales", () => {
      const t0 = 5_000_000;
      // Muchas direcciones con tokens inventados: la ruta las corta con el 404 antes de contar en el total.
      for (let k = 0; k < 500; k++) permitirPdfDeLaDireccion(`ip-${k}`, t0 + k);
      for (let k = 0; k < PDF_POR_HORA; k++) expect(permitirPdfEnTotal(t0 + 600 + k)).toBe(true);
      expect(permitirPdfEnTotal(t0 + 600 + PDF_POR_HORA)).toBe(false);
      expect(permitirPdfEnTotal(t0 + 600 + 3_600_001)).toBe(true);
    });
  });
});

describe("las barras y el radar dicen lo mismo que el cálculo", () => {
  it("el puntaje es el del cálculo, entre 0 y 100; sin puntaje, la mitad del tramo de su nivel", () => {
    expect(puntajeDeLaDimension("I", 28.4)).toBe(28);
    expect(puntajeDeLaDimension("O", 140)).toBe(100);
    expect(puntajeDeLaDimension("D", null)).toBe(10);
    expect(puntajeDeLaDimension("F", null)).toBe(50);
    expect(puntajeDeLaDimension(null, null)).toBe(0);
  });

  it("⛔ la agenda incrustada le dice a HubSpot la página del resultado SIN el token", () => {
    const src = new URL(
      srcDeLaAgenda("https://meetings.hubspot.com/msalas2/diagnostico?uuid=1&embed=false", {
        origen: "https://nexus.smarteamcr.com",
        utk: "0123456789abcdef0123456789abcdef",
      }),
    );
    expect(src.origin).toBe("https://meetings.hubspot.com");
    expect(src.searchParams.get("embed")).toBe("true");
    expect(src.searchParams.get("uuid")).toBe("1");
    expect(src.searchParams.get("parentPageUrl")).toBe("https://nexus.smarteamcr.com/external/test/resultado");
    expect(src.searchParams.get("parentHubspotUtk")).toBe("0123456789abcdef0123456789abcdef");
    // Una cookie con forma rara no viaja.
    expect(new URL(srcDeLaAgenda("https://meetings.hubspot.com/x", { origen: "https://a.b", utk: "x&y=1" })).searchParams.has("parentHubspotUtk")).toBe(false);
  });
});
