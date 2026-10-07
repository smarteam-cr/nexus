import { describe, expect, it } from "vitest";
import {
  COLUMNA,
  COLUMNAS,
  describirNavegador,
  esRevisorDeFeedback,
  esUrgente,
  estadoParaElAutor,
  lineaDeIdeas,
  numeroDeReporte,
  pedidoAplica,
  TIPO,
  TIPOS_DE_FEEDBACK,
} from "./reglas";
import { huella, temaMasParecido } from "./parecidos";
import { formasDeVoseo } from "@/lib/ui/voseo";

describe("los tipos y las columnas", () => {
  it("cada tipo tiene su pregunta, su ejemplo y su botón con objeto (nada de «Enviar»)", () => {
    for (const t of TIPOS_DE_FEEDBACK) {
      expect(TIPO[t].etiqueta.trim()).not.toBe("");
      expect(TIPO[t].ejemplo.startsWith("Por ejemplo:")).toBe(true);
      expect(TIPO[t].boton).toMatch(/^Mandar (el|la) /);
    }
  });

  it("la hoja de ruta tiene cuatro columnas en orden, y la de entrada es «Por decidir»", () => {
    expect([...COLUMNAS]).toEqual(["decidir", "planeado", "curso", "listo"]);
    expect(COLUMNA.decidir.nombre).toBe("Por decidir");
  });

  it("tuteo en todo lo que lee el equipo (el detector por FORMA de lib/ui/voseo.ts, no una lista cerrada)", () => {
    const textos = [
      ...TIPOS_DE_FEEDBACK.flatMap((t) => [TIPO[t].nombre, TIPO[t].etiqueta, TIPO[t].ejemplo, TIPO[t].boton]),
      ...COLUMNAS.flatMap((c) => [COLUMNA[c].nombre, COLUMNA[c].ayuda]),
    ];
    expect(textos.length, "no pasa en vacío").toBe(TIPOS_DE_FEEDBACK.length * 4 + COLUMNAS.length * 2);
    const conVoseo = textos.flatMap((t) => formasDeVoseo(t).map((w) => `«${w}» en «${t}»`));
    expect(conVoseo).toEqual([]);
  });
});

describe("quién revisa y qué es urgente", () => {
  it("revisa el feedback solo Super Admin", () => {
    expect(esRevisorDeFeedback("SUPER_ADMIN")).toBe(true);
    for (const r of ["CSE", "CSL", "VENTAS", "MARKETING", "DEV", "ADMIN", null, undefined]) expect(esRevisorDeFeedback(r)).toBe(false);
  });

  it("es urgente solo una falla que le frena el trabajo", () => {
    expect(esUrgente({ tipo: "falla", meFrena: true })).toBe(true);
    expect(esUrgente({ tipo: "falla", meFrena: false })).toBe(false);
    expect(esUrgente({ tipo: "mejora", meFrena: true })).toBe(false);
  });

  it("el número que se cita", () => {
    expect(numeroDeReporte(128)).toBe("F-128");
  });
});

describe("el estado que ve quien reportó sigue al tema", () => {
  it("sin decidir es «Recibido»", () => {
    expect(estadoParaElAutor({ estado: "sin_revisar" }).texto).toBe("Recibido");
  });

  it("en la hoja de ruta, manda la columna del tema", () => {
    expect(estadoParaElAutor({ estado: "en_hoja", tema: { columna: "decidir" } }).texto).toBe("En la hoja de ruta");
    expect(estadoParaElAutor({ estado: "en_hoja", tema: { columna: "planeado" } }).texto).toBe("Planeado");
    expect(estadoParaElAutor({ estado: "en_hoja", tema: { columna: "curso" } }).texto).toBe("En curso");
    const listo = estadoParaElAutor({ estado: "en_hoja", tema: { columna: "listo" } });
    expect(listo.texto).toBe("Listo");
    expect(listo.verde).toBe(true);
  });

  it("respondido es verde; no se hará no lo es", () => {
    expect(estadoParaElAutor({ estado: "respondido" }).verde).toBe(true);
    expect(estadoParaElAutor({ estado: "no_se_hara" })).toMatchObject({ texto: "No se hará", verde: false, marca: "✕" });
  });
});

describe("el navegador, en palabras", () => {
  it("Chrome, Edge, Safari y Firefox, con su sistema", () => {
    expect(
      describirNavegador("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"),
    ).toBe("Chrome 129 · Windows");
    expect(
      describirNavegador(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      ),
    ).toBe("Edge 128 · Windows");
    expect(
      describirNavegador("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"),
    ).toBe("Safari 18 · macOS");
    expect(describirNavegador("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox 131 · Linux");
  });
});

describe("dónde aparece un pedido de opinión", () => {
  const hoy = new Date("2026-10-04T12:00:00");
  it("en su pantalla y en las de adentro, nunca en una que solo empieza igual", () => {
    const p = { estado: "abierto", ruta: "/clients", hasta: null };
    expect(pedidoAplica(p, "/clients", hoy)).toBe(true);
    expect(pedidoAplica(p, "/clients/abc", hoy)).toBe(true);
    expect(pedidoAplica(p, "/clients?pertenencia=mine", hoy)).toBe(true);
    expect(pedidoAplica(p, "/clientes-viejos", hoy)).toBe(false);
  });

  it("vale hasta el final del día elegido, y no si ya se respondió", () => {
    expect(pedidoAplica({ estado: "abierto", ruta: "/clients", hasta: "2026-10-04T12:00:00" }, "/clients", new Date("2026-10-04T22:00:00"))).toBe(true);
    expect(pedidoAplica({ estado: "abierto", ruta: "/clients", hasta: "2026-10-03T12:00:00" }, "/clients", hoy)).toBe(false);
    expect(pedidoAplica({ estado: "respondido", ruta: "/clients", hasta: null }, "/clients", hoy)).toBe(false);
  });
});

describe("el festejo no nombra a nadie y cuenta bien", () => {
  it("primera, cuarta y muchas", () => {
    expect(lineaDeIdeas(1)).toBe("Es tu primera idea en 30 días.");
    expect(lineaDeIdeas(4)).toBe("Es tu cuarta idea en 30 días.");
    expect(lineaDeIdeas(14)).toBe("Llevas 14 ideas en 30 días.");
  });
});

describe("a qué tema se parece un reporte (sin IA)", () => {
  const temas = [
    { id: "etapa", titulo: "Cambiar la etapa del proyecto desde la ficha", textos: ["La etapa queda atrás de lo que pasó"] },
    { id: "cobros", titulo: "Exportar la cola de cobros a Excel", textos: ["Necesito bajar los cobros a Excel"] },
  ];

  it("encuentra el tema que pide lo mismo y dice qué palabras comparten", () => {
    const p = temaMasParecido("La etapa de Ferretería El Pino quedó atrás: no la puedo cambiar desde la ficha", temas);
    expect(p?.temaId).toBe("etapa");
    expect(p?.enComun.length).toBeGreaterThanOrEqual(2);
  });

  it("no inventa un parecido con una sola palabra en común", () => {
    expect(temaMasParecido("El botón de exportar no hace nada en Marketing", temas)).toBeNull();
  });

  it("la huella ignora conectores, tildes y plurales", () => {
    expect(huella("Los clientes y el cliente")).toEqual(["clien"]);
  });
});
