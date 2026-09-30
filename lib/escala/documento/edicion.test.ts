/**
 * lib/escala/documento/edicion.test.ts — la escala vista por una edición de industria.
 *
 * Una edición no es otra escala: `aplicarEdicion` arma otra `Escala` del mismo tipo, con los
 * mismos identificadores. Acá se fija qué cambia, qué no, y que la escala general no se toca.
 */
import { describe, expect, it } from "vitest";
import { resolverAncla, textosPorAncla } from "./anclas";
import { leerArchivoDeLaEscala } from "./archivos";
import { aplicarEdicion, edicionPorSlug, resumenDeLaEdicion } from "./edicion";
import { MINI_ESCALA, MINI_ESCALA_CON_EDICION } from "./mini-escala.fixture";
import { criteriosPropios, parsearEscala, todosLosCriterios } from "./parsear";
import { aplica, dimensionAplica } from "./perfil";
import { PERFILES_COMPLETOS } from "./validar";
import type { Escala } from "./tipos";

/** Congela un objeto entero: si `aplicarEdicion` escribe sobre la escala general, el test revienta. */
function congelar<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) congelar(v);
  }
  return x;
}

describe("una edición de juguete", () => {
  const general = congelar(parsearEscala(MINI_ESCALA_CON_EDICION));
  const e = aplicarEdicion(general, "tiendas");
  const [base, produccion] = e.areas[0].dimensiones;

  it("se lee con su clave, su perfil habitual, su bloque y sus palabras", () => {
    expect(general.ediciones).toHaveLength(1);
    expect(general.ediciones[0]).toMatchObject({
      slug: "tiendas",
      nombre: "Tiendas de juguete",
      descripcion: "Para quien vende en una tienda, sin vendedores.",
      perfilHabitual: { cierre: "transaccional", despues: "recompra" },
      bloque: 101,
      palabras: [
        { general: "Negocio", edicion: "Pedido o carrito" },
        { general: "Hábito", edicion: "Rutina de la tienda" },
      ],
    });
    expect(general.edicionesIntro).toBe("Una edición es la misma escala dicha para una industria.");
    expect(general.edicion).toBeNull();
  });

  it("sin edición, o con una que la escala no tiene, devuelve la MISMA escala general", () => {
    expect(aplicarEdicion(general, null)).toBe(general);
    expect(aplicarEdicion(general, "")).toBe(general);
    expect(aplicarEdicion(general, "no-existe")).toBe(general);
    expect(edicionPorSlug(general, "no-existe")).toBeNull();
  });

  it("no toca la escala general (está congelada entera) y se arma una sola vez", () => {
    expect(aplicarEdicion(general, "tiendas")).toBe(e);
    expect(general.areas[0].dimensiones[1].nombre).toBe("Tracción del Deal");
  });

  it("dice con qué edición se está viendo", () => {
    expect(e.edicion).toMatchObject({ slug: "tiendas", nombre: "Tiendas de juguete" });
  });

  it("cambia el área sin cambiarle la dirección", () => {
    expect(e.areas[0]).toMatchObject({ id: "1", nombre: "Ventas", slug: "ventas", descripcion: "Mide la venta de la tienda." });
    expect(e.areas[0].nombreGeneral).toBeUndefined();
    // Lo que la edición dice, reemplaza; lo que no, queda como en la escala general.
    expect(e.areas[0].panoramica).toEqual({ D: "Caos.", I: "Algo.", F: "La tienda vende sola.", E: "Método.", O: "Sistema." });
  });

  it("la dimensión que no toca queda igual (el mismo objeto)", () => {
    expect(base).toBe(general.areas[0].dimensiones[0]);
  });

  it("renombra la dimensión de producción y recuerda cómo se llama en la general", () => {
    expect(produccion).toMatchObject({
      id: "1.2",
      nombre: "Carrito y recompra",
      nombreGeneral: "Tracción del Deal",
      pregunta: "¿Qué pasa con quien no terminó de comprar?",
      descripcion: "Si la tienda recupera los carritos.",
      costoDeQuedarse: "Los carritos se pierden.",
      generica: { nombre: "Alcance" },
    });
  });

  it("un nivel sin texto conserva la descripción general; con texto, la cambia", () => {
    const [d, , f, ef] = produccion.niveles;
    expect(d.descripcion).toBe("Vendedor solo.");
    expect(f.descripcion).toBe("Ningún carrito se pierde en silencio.");
    expect(f.resultado).toBe("Los carritos se recuperan.");
    expect(ef.descripcion).toBe("Multicanal.");
    expect(ef.resultado).toBe("Esfuerzo coordinado.");
  });

  it("reescribe con el mismo id y las mismas marcas, y guarda el texto general", () => {
    const f1 = produccion.niveles[2].criterios[0];
    expect(f1).toEqual({
      id: "1.2.F1",
      texto: "Cada venta de la tienda entra sola al sistema.",
      textoGeneral: "Las ventas sin vendedor entran solas al sistema.",
      verificacion: "comprobable",
      riesgo: false,
      habito: false,
      perfil: "venta sin vendedor",
    });
    // El que la edición deja como está es el MISMO objeto de la escala general.
    expect(produccion.niveles[2].criterios[1]).toBe(general.areas[0].dimensiones[1].niveles[2].criterios[1]);
  });

  it("suma los criterios propios al final de su nivel", () => {
    expect(produccion.niveles[2].criterios.map((c) => c.id)).toEqual(["1.2.F1", "1.2.F2", "1.2.F101"]);
    expect(produccion.niveles[2].criterios[2]).toMatchObject({ propio: true, habito: true, perfil: null });
    expect(produccion.niveles[3].criterios.map((c) => c.id)).toEqual(["1.2.E1", "1.2.E2", "1.2.E101"]);
    expect(produccion.niveles[3].criterios[2]).toMatchObject({ propio: true, perfil: "recompra" });
  });

  it("saca los que no aplican, y los deja a mano para mostrarlos", () => {
    const inicial = produccion.niveles[1];
    expect(inicial.criterios).toEqual([]);
    expect(inicial.noAplican?.map((c) => c.id)).toEqual(["1.2.I1"]);
    expect(produccion.niveles[0].noAplican).toBeUndefined();
  });

  it("el resumen cuenta lo que la edición cambió", () => {
    expect(resumenDeLaEdicion(e.areas[0].dimensiones)).toEqual({ propios: 2, reescritos: 2, noAplican: 1, renombradas: 1 });
    expect(resumenDeLaEdicion(general.areas[0].dimensiones)).toEqual({ propios: 0, reescritos: 0, noAplican: 0, renombradas: 0 });
  });

  it("el perfil sigue decidiendo qué aplica dentro de la edición", () => {
    const eficiente = produccion.niveles[3].criterios;
    expect(eficiente.filter((c) => aplica(c, { cierre: "transaccional", despues: "recompra" })).map((c) => c.id)).toContain("1.2.E101");
    expect(eficiente.filter((c) => aplica(c, { cierre: "transaccional", despues: "única" })).map((c) => c.id)).not.toContain("1.2.E101");
    for (const p of PERFILES_COMPLETOS) expect(dimensionAplica(produccion, p)).toBe(true);
  });

  it("los comentarios apuntan a lo mismo: el ancla se resuelve con el texto de la edición", () => {
    expect(resolverAncla(e, "1.2.F1")?.texto).toBe("Cada venta de la tienda entra sola al sistema.");
    expect(resolverAncla(general, "1.2.F1")?.texto).toBe("Las ventas sin vendedor entran solas al sistema.");
    expect(resolverAncla(e, "1.2")?.ruta).toBe("Ventas · Carrito y recompra");
    // Un criterio propio existe en la edición y no en la escala general.
    expect(resolverAncla(e, "1.2.F101")?.texto).toBe("El carrito abandonado recibe un recordatorio.");
    expect(resolverAncla(general, "1.2.F101")).toBeNull();
    // Y el que la edición sacó, al revés.
    expect(resolverAncla(e, "1.2.I1")).toBeNull();
    expect(textosPorAncla(e).size).toBe(textosPorAncla(general).size + 2 - 1);
  });

  it("los criterios propios se pueden listar sin aplicar la edición", () => {
    expect(criteriosPropios(general).map((p) => `${p.edicion.slug}:${p.criterio.id}`)).toEqual(["tiendas:1.2.F101", "tiendas:1.2.E101"]);
    expect(todosLosCriterios(general).some((c) => c.id === "1.2.F101")).toBe(false);
  });

  it("una escala sin ediciones se lee como siempre", () => {
    const sin = parsearEscala(MINI_ESCALA);
    expect(sin.ediciones).toEqual([]);
    expect(sin.edicionesIntro).toBeNull();
    expect(sin.areas).toEqual(general.areas);
  });
});

describe("el orden de dependencias con los nombres de la edición", () => {
  const conOrden = MINI_ESCALA_CON_EDICION.replace(
    "| Base operativa | Ventas | Procesos y Rutinas → Datos | Porque sí. |",
    "| Base operativa | Ventas | Procesos y Rutinas → Datos | Porque sí. |\n| Producción | Ventas | Tracción del Deal | Porque también. |",
  ).replace("### Área 1 — Ventas\n\nMide la venta de la tienda.", "### Área 1 — Tienda\n\nMide la venta de la tienda.");
  const general = parsearEscala(conOrden);
  const e = aplicarEdicion(general, "tiendas");

  it("traduce los pasos y el «cuándo», para que la pantalla los siga encontrando", () => {
    expect(general.dependencias[1]).toMatchObject({ cuando: "Ventas", orden: ["Tracción del Deal"] });
    expect(e.dependencias[1]).toMatchObject({ cuando: "Tienda", orden: ["Carrito y recompra"] });
    expect(e.dependencias[0]).toMatchObject({ cuando: "Tienda", orden: ["Procesos y Rutinas", "Datos"] });
  });

  it("un área renombrada conserva su dirección y recuerda su nombre general", () => {
    expect(e.areas[0]).toMatchObject({ nombre: "Tienda", nombreGeneral: "Ventas", slug: "ventas" });
  });
});

describe("el archivo real (docs/escala/escala_rendimiento_smarteam.md)", () => {
  const general: Escala = parsearEscala(leerArchivoDeLaEscala("escala"));

  it("cada edición se puede aplicar y dice cuál es; sin edición, es la general", () => {
    for (const ed of general.ediciones) expect(aplicarEdicion(general, ed.slug).edicion?.slug).toBe(ed.slug);
    expect(aplicarEdicion(general, null)).toBe(general);
  });

  it.each(general.ediciones.map((ed) => [ed.nombre, ed] as const))("«%s»: cada dimensión renombrada recuerda su nombre general", (_, ed) => {
    const e = aplicarEdicion(general, ed.slug);
    const generales = new Map(general.areas.flatMap((a) => a.dimensiones.map((d) => [d.id, d.nombre] as const)));
    for (const d of e.areas.flatMap((a) => a.dimensiones)) {
      if (d.nombre !== generales.get(d.id)) expect(d.nombreGeneral, d.id).toBe(generales.get(d.id));
      else expect(d.nombreGeneral, d.id).toBeUndefined();
    }
  });

  it.each(general.ediciones.map((ed) => [ed.nombre, ed] as const))("«%s»: los mismos identificadores de dimensión y de nivel que la general", (_, ed) => {
    const e = aplicarEdicion(general, ed.slug);
    const ids = (x: Escala) => x.areas.flatMap((a) => a.dimensiones.flatMap((d) => [d.id, ...d.niveles.map((n) => n.id)]));
    expect(ids(e)).toEqual(ids(general));
  });
});
