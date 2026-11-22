/**
 * lib/exploraciones/orden-de-las-listas.test.ts — «la IA propone, tú ordenas» (22 nov, noche): lo que sugiere Nexus para
 * una lista se comprueba (ninguna cifra inventada ni al revés, ningún punto en dos grupos, solo subir lo que está fuera
 * de los 4 primeros) y se aplica sobre la lista de la persona, por el texto de cada punto y no por su posición.
 */
import { describe, expect, it } from "vitest";
import { aplicarSugerenciaDeOrden, leerSugerenciasDeOrden, mensajeParaOrdenar, puntosParaOrdenar, sePuedenJuntar, type SugerenciaDeOrden } from "./orden-de-las-listas";
import type { Meta, Reto } from "./casillas";

const PLANES = [
  "Contratar HubSpot para el e-commerce",
  "Crédito y cobro: llamar a los morosos cada quincena",
  "Replicar lo de Costa Rica",
  "Cobranza: asignar la cartera a mano cada 15 días",
  "Migrar a Shopify a finales de 2026",
  "Integrar los datos por APIs primero",
];

describe("leerSugerenciasDeOrden: solo lo que se puede usar", () => {
  const puntos = puntosParaOrdenar("planes", PLANES);

  it("un grupo de puntos que existen, con un texto sin cifras nuevas, pasa con las claves de esos puntos", () => {
    const s = leerSugerenciasDeOrden("planes", { juntar: [{ puntos: [2, 4], texto: "Crédito y cobro: llamar a morosos y asignar cartera cada 15 días", porque: "mismo flujo" }] }, puntos);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: "juntar", textos: [PLANES[1], PLANES[3]] });
  });

  it("un texto que inventa una cifra, o un grupo de un solo punto, o un punto que ya está en otro grupo, se descarta", () => {
    const s = leerSugerenciasDeOrden(
      "planes",
      {
        juntar: [
          { puntos: [2, 4], texto: "Crédito y cobro: cartera cada 30 días", porque: "x" },
          { puntos: [1], texto: "Solo", porque: "x" },
          { puntos: [1, 3], texto: "HubSpot y Costa Rica", porque: "x" },
          { puntos: [3, 6], texto: "Repetido", porque: "x" },
          { puntos: [9, 10], texto: "No existen", porque: "x" },
        ],
      },
      puntos,
    );
    expect(s.map((x) => x.id)).toEqual(["juntar:0-2"]);
  });

  it("subir: solo puntos del 5 en adelante que no estén en un grupo", () => {
    const s = leerSugerenciasDeOrden("planes", { subir: [{ punto: 2, porque: "ya está arriba" }, { punto: 6, porque: "primero los datos" }, { punto: 40, porque: "no existe" }] }, puntos);
    expect(s).toEqual([{ id: "subir:5", tipo: "subir", clave: puntos[5].clave, textoDelPunto: PLANES[5], porque: "primero los datos" }]);
  });

  it("dos metas con cifras distintas no se juntan: se perdería una", () => {
    const metas: Meta[] = [
      { que: "Subir la conversión", actual: "2 %", objetivo: "5 %" },
      { que: "Más conversión online", actual: "0,17 %", objetivo: "1 %" },
      { que: "Personalizar los envíos" },
    ];
    const p = puntosParaOrdenar("metas", metas);
    expect(leerSugerenciasDeOrden("metas", { juntar: [{ puntos: [1, 2], texto: "Subir la conversión", porque: "x" }] }, p)).toEqual([]);
    // Una con cifras y otra sin: sí, y las cifras de la que las tenía no cuentan como inventadas.
    expect(leerSugerenciasDeOrden("metas", { juntar: [{ puntos: [1, 3], texto: "Conversión y envíos personalizados", porque: "x" }] }, p)).toHaveLength(1);
  });

  it("el mensaje numera los puntos en el orden guardado y dice la empresa", () => {
    const m = mensajeParaOrdenar("Cemaco · Ecuador", "planes", puntos);
    expect(m).toContain("Empresa: Cemaco · Ecuador");
    expect(m).toContain(`6. ${PLANES[5]}`);
  });
});

describe("aplicarSugerenciaDeOrden: sobre la lista de la persona", () => {
  const puntos = puntosParaOrdenar("planes", PLANES);
  const juntar: SugerenciaDeOrden = { id: "j", tipo: "juntar", claves: [puntos[1].clave, puntos[3].clave], textos: [], texto: "Crédito y cobro: morosos y cartera", porque: "" };

  it("JUNTAR deja el punto nuevo donde estaba el primero y quita los demás", () => {
    expect(aplicarSugerenciaDeOrden("planes", PLANES, juntar)).toEqual([PLANES[0], "Crédito y cobro: morosos y cartera", PLANES[2], PLANES[4], PLANES[5]]);
  });

  it("SUBIR lo lleva al primer lugar", () => {
    const subir: SugerenciaDeOrden = { id: "s", tipo: "subir", clave: puntos[5].clave, textoDelPunto: PLANES[5], porque: "" };
    expect(aplicarSugerenciaDeOrden("planes", PLANES, subir)?.[0]).toBe(PLANES[5]);
  });

  it("si la persona ya cambió uno de esos puntos, la sugerencia no se aplica (null) en vez de tocar otro", () => {
    const cambiada = PLANES.map((x, i) => (i === 3 ? "Otra cosa" : x));
    expect(aplicarSugerenciaDeOrden("planes", cambiada, juntar)).toBeNull();
  });

  it("en las metas, el punto que queda conserva las cifras de la que las tenía", () => {
    const metas: Meta[] = [{ que: "Personalizar los envíos" }, { que: "Subir la conversión", actual: "2 %", objetivo: "5 %", para: "junio" }];
    const p = puntosParaOrdenar("metas", metas);
    const s: SugerenciaDeOrden = { id: "j", tipo: "juntar", claves: [p[0].clave, p[1].clave], textos: [], texto: "Convertir más con envíos personalizados", porque: "" };
    expect(aplicarSugerenciaDeOrden("metas", metas, s)).toEqual([{ que: "Convertir más con envíos personalizados", actual: "2 %", objetivo: "5 %", para: "junio" }]);
  });
});

describe("juntar no pierde nada guardado (revisión del 22 nov)", () => {
  it("dos retos con dimensiones o equipos distintos no se juntan; uno con y otro sin, sí", () => {
    expect(sePuedenJuntar("retos", [{ texto: "a", dimensionId: "1.2" }, { texto: "b", dimensionId: "1.7" }])).toBe(false);
    expect(sePuedenJuntar("retos", [{ texto: "a", equipo: "ventas" }, { texto: "b", equipo: "servicio" }])).toBe(false);
    expect(sePuedenJuntar("retos", [{ texto: "a" }, { texto: "b", dimensionId: "1.7", equipo: "ventas" }])).toBe(true);
    expect(sePuedenJuntar("planes", ["a", "b"])).toBe(true);
  });

  it("el reto que queda toma la dimensión y el equipo del que los tenía, aunque no sea el primero", () => {
    const retos: Reto[] = [{ texto: "Leads perdidos" }, { texto: "Nadie registra WhatsApp", dimensionId: "1.7", equipo: "ventas" }, { texto: "Otro" }];
    const p = puntosParaOrdenar("retos", retos);
    const s: SugerenciaDeOrden = { id: "j", tipo: "juntar", claves: [p[0].clave, p[1].clave], textos: [], texto: "Ventas: leads de WhatsApp que nadie registra", porque: "" };
    expect(aplicarSugerenciaDeOrden("retos", retos, s)).toEqual([{ texto: "Ventas: leads de WhatsApp que nadie registra", dimensionId: "1.7", equipo: "ventas" }, { texto: "Otro" }]);
  });

  it("si en la lista sin guardar la persona ya les puso cifras distintas, la sugerencia no se usa (null)", () => {
    const guardadas: Meta[] = [{ que: "Subir la conversión", actual: "2 %", objetivo: "5 %" }, { que: "Más ventas en línea" }];
    const p = puntosParaOrdenar("metas", guardadas);
    const s: SugerenciaDeOrden = { id: "j", tipo: "juntar", claves: [p[0].clave, p[1].clave], textos: [], texto: "Vender más en línea", porque: "" };
    const editadas: Meta[] = [guardadas[0], { que: "Más ventas en línea", objetivo: "1 millón" }];
    expect(aplicarSugerenciaDeOrden("metas", editadas, s)).toBeNull();
    expect(aplicarSugerenciaDeOrden("metas", guardadas, s)).not.toBeNull();
  });
});
