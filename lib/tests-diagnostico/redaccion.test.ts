/**
 * lib/tests-diagnostico/redaccion.test.ts — lo que la IA redacta del resultado del test: el pedido lleva los datos del
 * cálculo (nunca un puntaje), lo que vuelve se revisa (sin cifras, sin niveles ajenos, dentro de su tope) y sin IA el
 * resumen sale de los datos con el nivel, las capas, lo que más frena y la industria.
 */
import { describe, expect, it } from "vitest";
import { nombreDeNivel, parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { parseObject } from "@/lib/ai/section-schema";
import { borradorDesdeLaEscala } from "./banco";
import { leerLaRedaccion, MODELO_DE_LA_REDACCION, nivelesDeLaDimension, nivelesDelResumen, pedidosDeLaRedaccion, resumenDelResultado, resumenSinIa, TOPES } from "./redaccion";
import { resultadoDelTest, type ResultadoDelTest } from "./resultado";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];
const web = borradorDesdeLaEscala(escala, area.id, "web");
const elegir = (letras: string[]) => Object.fromEntries(web.map((p, i) => [p.id, { opcion: p.opciones.find((o) => o.nivel === letras[i])!.id }]));
const respuestas = elegir(["I", "F"]);
const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas })!;
const n = (l: "D" | "I" | "F" | "E" | "O") => nombreDeNivel(escala, l);
const ahora = new Date("2026-10-29T12:00:00.000Z");
const responde = (o: unknown) => ({ content: [{ type: "text" as const, text: `Aquí va:\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``, citations: null }] });
const leer = (...o: unknown[]) => leerLaRedaccion(o.map(responde), { escala, r, parse: parseObject, ahora });

describe("los pedidos a la IA", () => {
  const pedidos = pedidosDeLaRedaccion({ escala, r, industria: "Turismo", preguntas: web, respuestas });
  const datos = pedidos.map((x) => String(x.pedido.messages[0].content)).join("\n");

  it("el resumen y cada capa preguntada por separado, a Haiku, con las reglas: sin números, sin mover niveles, en tuteo", () => {
    const capas = [...new Set(r.dimensiones.filter((d) => d.preguntada && d.nivel).map((d) => d.capa))];
    expect(pedidos.map((x) => x.parte)).toEqual(["resumen", ...capas]);
    for (const { pedido } of pedidos) {
      expect(pedido.model).toBe(MODELO_DE_LA_REDACCION);
      expect(String(pedido.system)).toMatch(/números/);
      expect(String(pedido.system)).toMatch(/tuteo/);
    }
    // Cada capa con SUS dimensiones, nunca las de la otra.
    for (const x of pedidos.filter((y) => y.parte !== "resumen")) {
      const ids = (JSON.parse(String(x.pedido.messages[0].content).replace(/^[^{]*/, "")) as { dimensiones: { id: string }[] }).dimensiones.map((d) => d.id);
      expect(ids).toEqual(r.dimensiones.filter((d) => d.capa === x.parte && d.preguntada && d.nivel).map((d) => d.id));
    }
  });

  it("lleva el nivel, las capas, lo que más frena, la industria y lo que respondió en cada dimensión", () => {
    expect(datos).toContain('"industria": "Turismo"');
    expect(datos).toContain(`"nivelDelArea": "${r.nivelNombre}"`);
    for (const c of r.capas) expect(datos).toContain(c.nombre);
    if (r.recomendacion?.tipo === "trabajar") expect(datos).toContain(r.recomendacion.dimensionNombre);
    // Lo que eligió, con un texto que NO es el de la escala (si no, también llegaría por la descripción del nivel).
    const propias = web.map((p) => ({ ...p, opciones: p.opciones.map((o) => ({ ...o, texto: `Así lo hacemos en ${p.dimensionId} (${o.nivel})` })) }));
    const conPropias = pedidosDeLaRedaccion({ escala, r, industria: null, preguntas: propias, respuestas })
      .map((x) => String(x.pedido.messages[0].content))
      .join("\n");
    expect(conPropias).toContain(`"respondio": "Así lo hacemos en ${area.dimensiones[0].id} (I)"`);
    expect(conPropias).toContain(`"respondio": "Así lo hacemos en ${area.dimensiones[1].id} (F)"`);
  });

  it("⛔ no le pasa ningún puntaje (la IA no ve ni puede mover un número)", () => {
    expect(datos).not.toMatch(/puntaje/i);
    expect(datos).not.toContain(`: ${r.puntaje}`);
  });
});

describe("lo que vuelve de la IA", () => {
  const d0 = area.dimensiones[0].id;
  const d1 = area.dimensiones[1].id;

  it("se queda lo que pasa las reglas, con el modelo y la hora", () => {
    const x = leer({ resumen: "El área opera a medias.", dimensiones: [{ id: d0, lectura: "Hay etapas.", prioridad: "Escribe el proceso." }] });
    expect(x).toEqual({ modelo: MODELO_DE_LA_REDACCION, at: ahora.toISOString(), resumen: "El área opera a medias.", dimensiones: { [d0]: { lectura: "Hay etapas.", prioridad: "Escribe el proceso." } } });
  });

  it("⛔ un texto con cifras o cantidades en letras se descarta (la IA no inventa números)", () => {
    const x = leer({ resumen: "Tienes un 40 % del camino.", dimensiones: [{ id: d0, lectura: "Hay 3 etapas.", prioridad: "Escribe el proceso." }] });
    expect(x?.resumen).toBeNull();
    expect(x?.dimensiones[d0]).toEqual({ lectura: null, prioridad: "Escribe el proceso." });
    const y = leer({ resumen: "Revisa de cuatro a seis métricas.", dimensiones: [{ id: d0, lectura: "Mira las dos capas.", prioridad: "Cada diez días." }] });
    expect(y?.resumen).toBeNull();
    expect(y?.dimensiones[d0]).toEqual({ lectura: "Mira las dos capas.", prioridad: null });
    // Los que la revisión del 29 oct vio pasar.
    for (const t of ["Revísalo cada catorce días.", "Hazlo en dos semanas.", "Suma a la mitad de tus vendedores.", "Prioriza veinticinco cuentas.", "Llama a setenta prospectos.", "Hazlo en un mes.", "Revisa doscientos negocios."]) {
      expect(leer({ resumen: t, dimensiones: [] }), t).toBeNull();
    }
  });

  it("las partes se juntan: el resumen de una y las dimensiones de las otras; una que falló no se lleva las demás", () => {
    const x = leerLaRedaccion([responde({ resumen: "El área opera a medias." }), null, responde({ dimensiones: [{ id: d1, lectura: "Bien.", prioridad: "Sostén." }] })], { escala, r, parse: parseObject, ahora });
    expect(x?.resumen).toBe("El área opera a medias.");
    expect(Object.keys(x!.dimensiones)).toEqual([d1]);
  });

  it("⛔ cada texto nombra solo los niveles de lo suyo: uno que es de OTRA parte del resultado se descarta", () => {
    // d0 está en Inicial (puede nombrar Inicial y Funcional); d1, en Funcional (Funcional y Eficiente).
    expect([...nivelesDeLaDimension("I")]).toEqual(["I", "F"]);
    const delResumen = nivelesDelResumen(r);
    // Eficiente es de d1 (su siguiente), no del área: con una sola lista para todo, «el área está en Eficiente» pasaba.
    expect(delResumen.has("E")).toBe(false);
    const x = leer({
      resumen: `El área está en ${n("E")}.`,
      dimensiones: [
        { id: d0, lectura: `Ya está en ${n("E")}.`, prioridad: `Llévala a ${n("F")}.` },
        { id: d1, lectura: `Está en ${n("I")}.`, prioridad: `Llévala a ${n("E")}.` },
      ],
    });
    expect(x?.resumen).toBeNull();
    expect(x?.dimensiones[d0]).toEqual({ lectura: null, prioridad: `Llévala a ${n("F")}.` });
    expect(x?.dimensiones[d1]).toEqual({ lectura: null, prioridad: `Llévala a ${n("E")}.` });
    // Los del área y sus capas, sí.
    expect(leer({ resumen: `El área está en ${n(r.nivel!)}.`, dimensiones: [] })?.resumen).toBe(`El área está en ${n(r.nivel!)}.`);
  });

  it("en el nivel más alto no se guarda «qué priorizar» (la página dice que lo que sigue es sostenerlo)", () => {
    const arriba = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas: elegir(["I", "O"]) })!;
    const x = leerLaRedaccion([responde({ dimensiones: [{ id: d1, lectura: "Lo tiene resuelto.", prioridad: "Sostén lo que tienes." }] })], { escala, r: arriba, parse: parseObject, ahora });
    expect(x?.dimensiones[d1]).toEqual({ lectura: "Lo tiene resuelto.", prioridad: null });
  });

  it("un texto más largo que su tope, una dimensión que no existe o repetida, fuera", () => {
    const x = leer({
      resumen: "a".repeat(TOPES.resumen + 1),
      dimensiones: [
        { id: "9.9", lectura: "No existe.", prioridad: "Nada." },
        { id: d1, lectura: "Primera.", prioridad: "Primera." },
        { id: d1, lectura: "Repetida.", prioridad: "Repetida." },
      ],
    });
    expect(x?.resumen).toBeNull();
    expect(Object.keys(x!.dimensiones)).toEqual([d1]);
    expect(x?.dimensiones[d1].lectura).toBe("Primera.");
  });

  it("nada usable (o un texto que no es JSON) = null, y la página usa los datos", () => {
    expect(leer({ resumen: "Con 2 cifras.", dimensiones: [] })).toBeNull();
    expect(leerLaRedaccion([{ content: [{ type: "text", text: "no sé", citations: null }] }, null], { escala, r, parse: parseObject, ahora })).toBeNull();
  });
});

describe("el resumen sin IA", () => {
  const base: ResultadoDelTest = {
    ...r,
    areaNombre: "Ventas",
    nivelNombre: "Deficiente",
    capas: [
      { clave: "base", nombre: "Base operativa", nivel: "I", nivelNombre: "Inicial", puntaje: 32 },
      { clave: "produccion", nombre: "Producción", nivel: "D", nivelNombre: "Deficiente", puntaje: 12 },
    ],
    recomendacion: { tipo: "trabajar", dimensionId: "1.6", dimensionNombre: "Priorización de interesados", objetivo: "F", objetivoNombre: "Funcional", razon: "", costoDeQuedarse: "" },
  };

  it("dice el nivel, las dos capas, lo que más frena y el sector", () => {
    expect(resumenSinIa(base, "Maquinaria y equipo pesado")).toBe(
      "En el sector de maquinaria y equipo pesado, el área de Ventas está hoy en Deficiente: la base operativa está en Inicial y la producción en Deficiente. Lo que más la frena es «Priorización de interesados»: llevar esa parte a Funcional es el primer paso.",
    );
    // Las dos capas en el nivel del área se dicen juntas.
    const parejas = { ...base, capas: base.capas.map((c) => ({ ...c, nivel: "D" as const, nivelNombre: "Deficiente" })) };
    expect(resumenSinIa(parejas, null).startsWith("El área de Ventas está hoy en Deficiente, tanto en la base operativa como en la producción.")).toBe(true);
  });

  it("«Otra» o sin industria no nombra el sector; con una capa sin medir, solo la otra", () => {
    const corto = { ...base, capas: [base.capas[0], { ...base.capas[1], nivel: null, nivelNombre: null }] };
    expect(resumenSinIa(corto, "Otra")).toBe(
      "El área de Ventas está hoy en Deficiente: la base operativa está en Inicial. Lo que más la frena es «Priorización de interesados»: llevar esa parte a Funcional es el primer paso.",
    );
    expect(resumenSinIa(base, null).startsWith("El área de Ventas")).toBe(true);
  });

  it("sin nivel, lo dice; ya en el objetivo, sostener", () => {
    expect(resumenSinIa({ ...base, nivelNombre: null }, null)).toBe("Con lo que respondiste todavía no alcanza para ubicar el área de Ventas: en una sesión lo completamos juntos.");
    expect(resumenSinIa({ ...base, recomendacion: { tipo: "sostener", razon: "" } }, null)).toMatch(/lo que sigue es sostenerlo/);
  });

  it("la página usa el de la IA si lo hay, y si no, el de los datos", () => {
    expect(resumenDelResultado({ ...base, redaccion: { modelo: "m", at: "", resumen: "El de la IA.", dimensiones: {} } }, null)).toBe("El de la IA.");
    expect(resumenDelResultado({ ...base, redaccion: { modelo: "m", at: "", resumen: null, dimensiones: {} } }, null)).toBe(resumenSinIa(base, null));
    expect(resumenDelResultado(base, null)).toBe(resumenSinIa(base, null));
  });
});
