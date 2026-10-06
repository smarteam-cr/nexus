/**
 * lib/escala/vista.test.ts — las reglas que la pantalla aplica sobre lo que dice la escala.
 *
 * Qué orden de dependencias vale para cada capa, qué palabras se subrayan, qué nota acompaña a un
 * cierre y qué definición lleva cada respuesta del perfil. Contra la escala de juguete (cada regla)
 * y contra el archivo real (que la versión vigente las tenga todas).
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { aplicarEdicion } from "./documento/edicion";
import { MINI_ESCALA, MINI_ESCALA_CON_EDICION } from "./documento/mini-escala.fixture";
import { parsearEscala, todosLosCriterios } from "./documento/parsear";
import { CIERRES, DESPUES } from "./documento/perfil";
import {
  anclasDeOtraLectura,
  consultaDeLaEscala,
  conteosQueSeVen,
  datosDeLaVista,
  definicionDeOpcion,
  lugarEnElOrden,
  notaDelCierre,
  ordenDeDependencias,
  partirPorPalabras,
  relacionadosCon,
  requeridosDelArea,
  terminosParaSubrayar,
  VISTAS,
  vistaDesdeUrl,
} from "./vista";

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

  it("los términos del glosario: también en plural, el más largo primero y sin partir palabras", () => {
    const terminos = terminosParaSubrayar({
      palabrasConValorFijo: [],
      glosario: [
        { termino: "Pipeline", significado: "Las etapas de un negocio." },
        { termino: "Pipeline review", significado: "Reunión que revisa el pipeline." },
        { termino: "Deal", significado: "Negocio en curso." },
        { termino: "BANT, MEDDIC, SPIN", significado: "Metodologías de venta." },
        { termino: "Macros y snippets", significado: "Respuestas guardadas." },
      ],
    });
    expect(terminos.map((t) => t.termino)).toEqual(["Pipeline", "Pipeline review", "Deal", "BANT", "MEDDIC", "SPIN", "Macros", "snippets"]);
    const t = partirPorPalabras("Las pipeline reviews miran cada deal del pipeline; no es un ideal. Usan MEDDIC.", terminos);
    expect(t.filter((x) => x.palabra).map((x) => `${x.texto} → ${x.palabra!.significado}`)).toEqual([
      "pipeline reviews → Reunión que revisa el pipeline.",
      "deal → Negocio en curso.",
      "pipeline → Las etapas de un negocio.",
      "MEDDIC → Metodologías de venta.",
    ]);
  });

  it("las de valor fijo no toman plural: «la mayorías» no es «la mayoría»", () => {
    expect(partirPorPalabras("En la mayorías.", [{ termino: "La mayoría", significado: "al menos 80%", tipo: "valor" }])).toEqual([
      { texto: "En la mayorías.", palabra: null },
    ]);
  });

  it("en el archivo real, «pipeline reviews» se marca con su significado del glosario", () => {
    const terminos = terminosParaSubrayar(real);
    const i3 = real.areas[0].dimensiones[0].niveles.find((n) => n.letra === "I")!.criterios.find((c) => /pipeline reviews/i.test(c.texto));
    expect(i3, "hay un criterio de Inicial que habla de pipeline reviews").toBeTruthy();
    const marcado = partirPorPalabras(i3!.texto, terminos).find((x) => x.palabra && /pipeline reviews/i.test(x.texto));
    expect(marcado?.palabra?.tipo).toBe("glosario");
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

describe("lugarEnElOrden", () => {
  it("cada dimensión del archivo real tiene un lugar distinto en el orden de su capa", () => {
    for (const a of real.areas) {
      for (const capa of real.capas) {
        const [orden] = ordenDeDependencias(real.dependencias, a.nombre, capa.nombre, "con equipo");
        const deLaCapa = a.dimensiones.filter((d) => d.capa === capa.clave);
        const lugares = deLaCapa.map((d) => lugarEnElOrden(orden, d));
        expect(lugares.every((l) => l !== null), `${a.nombre} · ${capa.nombre}`).toBe(true);
        expect([...lugares].sort(), `${a.nombre} · ${capa.nombre}`).toEqual(deLaCapa.map((_, j) => j + 1));
      }
    }
  });

  it("por el nombre del área o por el genérico, sin tildes ni mayúsculas; null si no está o no hay orden", () => {
    const orden = { orden: ["Tecnología y Automatización", "Datos"] };
    expect(lugarEnElOrden(orden, { nombre: "DATOS", generica: null })).toBe(2);
    expect(lugarEnElOrden(orden, { nombre: "Stack", generica: { nombre: "Tecnologia y automatizacion" } })).toBe(1);
    expect(lugarEnElOrden(orden, { nombre: "Equipo", generica: null })).toBeNull();
    expect(lugarEnElOrden(null, { nombre: "Datos", generica: null })).toBeNull();
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

describe("con una edición por industria", () => {
  const general = parsearEscala(MINI_ESCALA_CON_EDICION);
  const edicion = aplicarEdicion(general, "tiendas");
  const base = { publicadaEn: new Date("2030-01-01T00:00:00Z"), aviso: null, versiones: [] };

  it("los datos dicen qué ediciones hay, con cuál se está viendo y cuánto cambió de esta área", () => {
    const d = datosDeLaVista({ escala: edicion, area: edicion.areas[0], ...base });
    expect(d.ediciones).toEqual([
      { slug: "tiendas", nombre: "Tiendas de juguete", descripcion: "Para quien vende en una tienda, sin vendedores.", perfilHabitual: { cierre: "transaccional", despues: "recompra" } },
    ]);
    expect(d.edicion).toMatchObject({ slug: "tiendas", nombre: "Tiendas de juguete", resumen: { propios: 2, reescritos: 2, noAplican: 1, renombradas: 1 } });
    expect(d.edicionesIntro).toBe("Una edición es la misma escala dicha para una industria.");
    expect(d.area.dimensiones[1].nombre).toBe("Carrito y recompra");
    // La escala general también dice qué ediciones hay (para ofrecerlas), y que no se ve con ninguna.
    const g = datosDeLaVista({ escala: general, area: general.areas[0], ...base });
    expect(g.ediciones).toHaveLength(1);
    expect(g.edicion).toBeNull();
  });

  it("dice si la edición adapta el área que se mira: una edición se escribe por áreas", () => {
    expect(datosDeLaVista({ escala: edicion, area: edicion.areas[0], ...base }).edicion?.adaptaElArea).toBe(true);
    // En el archivo real hay ediciones que por ahora solo traen un área: las otras se leen con la general.
    for (const ed of real.ediciones) {
      const e = aplicarEdicion(real, ed.slug);
      const adaptadas = new Set(ed.areas.filter((a) => a.dimensiones.length > 0).map((a) => a.id));
      for (const a of e.areas) {
        expect(datosDeLaVista({ escala: e, area: a, ...base }).edicion?.adaptaElArea, `${ed.nombre} · ${a.nombre}`).toBe(adaptadas.has(a.id));
      }
    }
  });

  it("las palabras de la edición: una que ya está en el glosario se dice junto a su significado; una nueva, sola", () => {
    const terminos = terminosParaSubrayar(edicion);
    expect(terminos.find((t) => t.termino === "Hábito")?.significado).toBe(
      "En esta edición: rutina de la tienda. En la escala general: algo que el equipo repite.",
    );
    expect(terminos.find((t) => t.termino === "Negocio")).toEqual({ termino: "Negocio", significado: "En esta edición: pedido o carrito.", tipo: "glosario" });
    // En la escala general, el glosario de siempre.
    expect(terminosParaSubrayar(general).find((t) => t.termino === "Hábito")?.significado).toBe("Algo que el equipo repite.");
    expect(terminosParaSubrayar(general).some((t) => t.termino === "Negocio")).toBe(false);
    // Y se subraya en un texto que sigue con su redacción general, también en plural.
    const marcado = partirPorPalabras("Los negocios mueren en silencio.", terminos).find((x) => x.palabra);
    expect(marcado).toMatchObject({ texto: "negocios", palabra: { significado: "En esta edición: pedido o carrito." } });
  });

  it("el orden de dependencias se sigue encontrando con los nombres de la edición", () => {
    const [orden] = ordenDeDependencias(edicion.dependencias, edicion.areas[0].nombre, "Base operativa", null);
    expect(lugarEnElOrden(orden, edicion.areas[0].dimensiones[0])).toBe(1);
  });

  it("los contadores del feedback: lo que se ve con esa edición, y lo RETIRADO", () => {
    // 1.2.F9 no existe en ninguna lectura de la escala: es un criterio retirado.
    const conteos = { "1.2": 1, "1.2.F1": 2, "1.2.F101": 3, "1.2.I1": 4, "1.2.F": 5, "1.2.F9": 6 };
    // En la general no se cuenta el criterio propio de la edición; en la edición, el que ella sacó.
    expect(anclasDeOtraLectura(general, general.areas[0])).toEqual(["1.2.F101", "1.2.E101"]);
    expect(anclasDeOtraLectura(edicion, edicion.areas[0])).toEqual(["1.2.I1"]);
    expect(conteosQueSeVen(conteos, general, general.areas[0])).toEqual({ "1.2": 1, "1.2.F1": 2, "1.2.I1": 4, "1.2.F": 5, "1.2.F9": 6 });
    expect(conteosQueSeVen(conteos, edicion, edicion.areas[0])).toEqual({ "1.2": 1, "1.2.F1": 2, "1.2.F101": 3, "1.2.F": 5, "1.2.F9": 6 });
    // El retirado se sigue sumando a su celda, en las dos lecturas: sin el número, nada en la matriz le
    // avisaría a quien revisa que llegó feedback sobre él (se lee y se decide en /feedback).
    expect(datosDeLaVista({ escala: edicion, area: edicion.areas[0], publicadaEn: new Date(0), aviso: null, versiones: [] }).anclasDeOtraLectura).toEqual(["1.2.I1"]);
  });
});

describe("consultaDeLaEscala: lo que se mira, en la URL", () => {
  const sinPerfil = { cierre: null, despues: null };

  it("lo de siempre no va; la industria va primero y nunca se pierde", () => {
    expect(consultaDeLaEscala({ vista: "mapa", perfil: sinPerfil, industria: null })).toBe("");
    expect(consultaDeLaEscala({ vista: "mapa", perfil: sinPerfil, industria: "ecommerce-retail" })).toBe("?industria=ecommerce-retail");
    expect(consultaDeLaEscala({ vista: "mapa", perfil: { cierre: "transaccional", despues: "recompra" }, industria: "ecommerce-retail", celda: "1.7.F", ancla: "1.7.F1" })).toBe(
      "?industria=ecommerce-retail&cierre=transaccional&despues=recompra&celda=1.7.F&c=1.7.F1",
    );
    expect(consultaDeLaEscala({ vista: "matriz", perfil: sinPerfil, industria: null })).toBe("?vista=matriz");
  });

  it("el mapa es la vista de entrada: sin `?vista`, o con una que ya no existe, abre el mapa", () => {
    expect(VISTAS[0]).toBe("mapa");
    expect(vistaDesdeUrl(null)).toBe("mapa");
    expect(vistaDesdeUrl("guia")).toBe("mapa");
    expect(vistaDesdeUrl("matriz")).toBe("matriz");
  });

  it("la dimensión solo viaja en «Por dimensión» y la celda solo en el mapa", () => {
    expect(consultaDeLaEscala({ vista: "dimension", perfil: sinPerfil, industria: null, dimension: "1.7", celda: "1.7.F" })).toBe("?vista=dimension&dim=1.7");
    expect(consultaDeLaEscala({ vista: "matriz", perfil: sinPerfil, industria: null, dimension: "1.7", celda: "1.7.F" })).toBe("?vista=matriz");
  });

  it("con las ediciones del archivo real: cada dimensión sigue teniendo su lugar en el orden de su capa", () => {
    for (const ed of real.ediciones) {
      const e = aplicarEdicion(real, ed.slug);
      for (const a of e.areas) {
        for (const capa of e.capas) {
          const [orden] = ordenDeDependencias(e.dependencias, a.nombre, capa.nombre, "con equipo");
          const deLaCapa = a.dimensiones.filter((d) => d.capa === capa.clave);
          const lugares = deLaCapa.map((d) => lugarEnElOrden(orden, d));
          expect([...lugares].sort(), `${ed.nombre} · ${a.nombre} · ${capa.nombre}`).toEqual(deLaCapa.map((_, j) => j + 1));
        }
      }
    }
  });
});

describe("los requeridos, como los recibe la pantalla", () => {
  const conEnlaces = parsearEscala(
    MINI_ESCALA.replace("`[1.2.F2 · evaluado · venta con equipo]`", "`[1.2.F2 · evaluado · venta con equipo · requiere 1.1.F1]`").replace(
      "`[1.2.E1 · comprobable]`",
      "`[1.2.E1 · comprobable · requiere 1.1.F1]`",
    ),
  );
  const base = { publicadaEn: new Date("2030-01-01T00:00:00Z"), aviso: null, versiones: [] };
  const d = datosDeLaVista({ escala: conEnlaces, area: conEnlaces.areas[0], ...base });

  it("por id de criterio, en los dos sentidos; un criterio sin enlaces no está", () => {
    expect(Object.keys(d.requeridos.requiere).sort()).toEqual(["1.2.E1", "1.2.F2"]);
    expect(d.requeridos.requiere["1.2.F2"].map((e) => e.id)).toEqual(["1.1.F1"]);
    expect(d.requeridos.loRequieren).toMatchObject({ "1.1.F1": [{ id: "1.2.F2", dimensionNombre: "Tracción del Deal", letra: "F" }, { id: "1.2.E1" }] });
    expect(d.requeridos.requiere["1.1.F1"]).toBeUndefined();
    // Una escala sin requeridos baja los dos vacíos (no falta el campo).
    expect(datosDeLaVista({ escala: mini, area: mini.areas[0], ...base }).requeridos).toEqual({ requiere: {}, loRequieren: {} });
  });

  it("con qué se relaciona el criterio que se mira, según el perfil", () => {
    const todos = relacionadosCon("1.1.F1", d.requeridos, { cierre: null, despues: null });
    expect([...todos.loRequieren]).toEqual(["1.2.F2", "1.2.E1"]);
    expect([...todos.requiere]).toEqual([]);
    // En la venta transaccional, 1.2.F2 (venta con equipo) no se ve: tampoco se marca.
    expect([...relacionadosCon("1.1.F1", d.requeridos, { cierre: "transaccional", despues: null }).loRequieren]).toEqual(["1.2.E1"]);
    expect([...relacionadosCon("1.2.F2", d.requeridos, { cierre: null, despues: null }).requiere]).toEqual(["1.1.F1"]);
    // Sin nada que mirar, o mirando una dimensión o un nivel, no se marca nada.
    for (const foco of [null, "1.2", "1.2.F"]) {
      const r = relacionadosCon(foco, d.requeridos, { cierre: null, despues: null });
      expect(r.requiere.size + r.loRequieren.size, String(foco)).toBe(0);
    }
  });

  it("en el archivo real no se pierde ningún enlace: la pantalla recibe lo que dicen las etiquetas", () => {
    // `requeridosDe` salta un requerido que la escala no tiene (eso lo frena la validación). Por eso
    // no alcanza con mirar lo que devuelve: se compara contra lo que cada criterio DICE que requiere.
    let enlaces = 0;
    for (const escala of [real, ...real.ediciones.map((ed) => aplicarEdicion(real, ed.slug))]) {
      for (const a of escala.areas) {
        const r = requeridosDelArea(escala, a);
        for (const c of todosLosCriterios({ areas: [a] })) {
          expect((r.requiere[c.id] ?? []).map((e) => e.id), `${escala.edicion?.nombre ?? "general"} · ${c.id}`).toEqual(c.requiere ?? []);
          enlaces += c.requiere?.length ?? 0;
        }
        for (const id of [...Object.keys(r.requiere), ...Object.keys(r.loRequieren)]) expect(id.startsWith(`${a.id}.`), id).toBe(true);
      }
    }
    expect(enlaces).toBeGreaterThan(0);
    // Y la comparación frena de verdad: con un requerido que no existe, deja de coincidir.
    const roto = parsearEscala(MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.O9]`"));
    expect(requeridosDelArea(roto, roto.areas[0]).requiere["1.2.E1"]).toBeUndefined();
    expect(todosLosCriterios(roto).find((c) => c.id === "1.2.E1")?.requiere).toEqual(["1.1.O9"]);
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

  it("las novedades son la entrada del historial de ESTA versión; sin manual, sin «cómo cambia»", () => {
    const d = datosDeLaVista({ escala: real, area: real.areas[0], ...base });
    expect(d.novedades?.version).toBe(real.version);
    expect(d.comoCambia).toBeNull();
    expect(d.documentos.find((x) => x.clave === "escala")?.version).toBe(real.version);
    expect(d.documentos.find((x) => x.clave === "manual")?.version).toBeNull();
  });
});
