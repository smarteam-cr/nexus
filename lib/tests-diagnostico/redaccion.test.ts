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
import { leerLaRedaccion, MODELO_DE_LA_REDACCION, nivelesDeLaDimension, nombraLaIndustria, pedidosDeLaRedaccion, resumenDelResultado, resumenSinIa, TOPES } from "./redaccion";
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
    const x = leer({ resumen: "El área opera a medias.", dimensiones: [{ id: d0, impacto: "Hay etapas.", prioridad: "Escribe el proceso." }] });
    expect(x).toEqual({ v: 2, modelo: MODELO_DE_LA_REDACCION, at: ahora.toISOString(), resumen: "El área opera a medias.", dimensiones: { [d0]: { impacto: "Hay etapas.", prioridad: "Escribe el proceso." } } });
  });

  it("⛔ un texto con cifras o cantidades en letras se descarta (la IA no inventa números)", () => {
    const x = leer({ resumen: "Tienes un 40 % del camino.", dimensiones: [{ id: d0, impacto: "Hay 3 etapas.", prioridad: "Escribe el proceso." }] });
    expect(x?.resumen).toBeNull();
    expect(x?.dimensiones[d0]).toEqual({ impacto: null, prioridad: "Escribe el proceso." });
    const y = leer({ resumen: "Revisa de cuatro a seis métricas.", dimensiones: [{ id: d0, impacto: "Mira las dos capas.", prioridad: "Cada diez días." }] });
    expect(y?.resumen).toBeNull();
    expect(y?.dimensiones[d0]).toEqual({ impacto: "Mira las dos capas.", prioridad: null });
    // Los que la revisión del 29 oct vio pasar.
    for (const t of ["Revísalo cada catorce días.", "Hazlo en dos semanas.", "Suma a la mitad de tus vendedores.", "Prioriza veinticinco cuentas.", "Llama a setenta prospectos.", "Hazlo en un mes.", "Revisa doscientos negocios."]) {
      expect(leer({ resumen: t, dimensiones: [] }), t).toBeNull();
    }
  });

  it("las partes se juntan: el resumen de una y las dimensiones de las otras; una que falló no se lleva las demás", () => {
    const x = leerLaRedaccion([responde({ resumen: "El área opera a medias." }), null, responde({ dimensiones: [{ id: d1, impacto: "Bien.", prioridad: "Sostén." }] })], { escala, r, parse: parseObject, ahora });
    expect(x?.resumen).toBe("El área opera a medias.");
    expect(Object.keys(x!.dimensiones)).toEqual([d1]);
  });

  it("⛔ cada texto nombra solo los niveles de lo suyo: uno que es de OTRA parte del resultado se descarta", () => {
    // d0 está en Inicial (puede nombrar Inicial y Funcional); d1, en Funcional (Funcional y Eficiente).
    expect([...nivelesDeLaDimension("I")]).toEqual(["I", "F"]);
    const x = leer({
      resumen: `El área está en ${n("E")}.`,
      dimensiones: [
        { id: d0, impacto: `Ya está en ${n("E")}.`, prioridad: `Llévala a ${n("F")}.` },
        { id: d1, impacto: `Está en ${n("I")}.`, prioridad: `Llévala a ${n("E")}.` },
      ],
    });
    expect(x?.resumen).toBeNull();
    expect(x?.dimensiones[d0]).toEqual({ impacto: null, prioridad: `Llévala a ${n("F")}.` });
    expect(x?.dimensiones[d1]).toEqual({ impacto: null, prioridad: `Llévala a ${n("E")}.` });
  });

  it("⛔ el resumen no repite el nivel (está en grande encima) ni nombra la industria (va en el chip)", () => {
    // Ningún nivel, ni el del área: el resumen interpreta, no describe (Elías, 29 oct).
    expect(leer({ resumen: `Tu área está en ${n(r.nivel!)}.`, dimensiones: [] })).toBeNull();
    const conIndustria = (resumen: string) =>
      leerLaRedaccion([responde({ resumen })], { escala, r, parse: parseObject, ahora, industria: "Maquinaria y equipo pesado" })?.resumen ?? null;
    expect(conIndustria("En maquinaria y equipo pesado, cada negocio depende de quien lo lleva.")).toBeNull();
    expect(conIndustria("Cada negocio depende de quien lo lleva.")).toBe("Cada negocio depende de quien lo lleva.");
    // La estimación la agrega la página: si la IA también la dice, se leería dos veces. El verbo «estimar», sí.
    expect(conIndustria("Cada negocio depende de quien lo lleva; es una estimación con pocas preguntas.")).toBeNull();
    expect(conIndustria("Sin registro de tus negocios, no puedes estimar cuánto vas a vender.")).toBe("Sin registro de tus negocios, no puedes estimar cuánto vas a vender.");
    // «Otra» no es una industria que se nombre: no frena nada.
    expect(leerLaRedaccion([responde({ resumen: "Otra forma de verlo: depende de cada quien." })], { escala, r, parse: parseObject, ahora, industria: "Otra" })?.resumen).toBe("Otra forma de verlo: depende de cada quien.");
  });

  it("en el nivel más alto no se guarda «qué priorizar» (la página dice que lo que sigue es sostenerlo)", () => {
    const arriba = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas: elegir(["I", "O"]) })!;
    const x = leerLaRedaccion([responde({ dimensiones: [{ id: d1, impacto: "Lo tiene resuelto.", prioridad: "Sostén lo que tienes." }] })], { escala, r: arriba, parse: parseObject, ahora });
    expect(x?.dimensiones[d1]).toEqual({ impacto: "Lo tiene resuelto.", prioridad: null });
  });

  it("un texto más largo que su tope, una dimensión que no existe o repetida, fuera", () => {
    const x = leer({
      resumen: "a".repeat(TOPES.resumen + 1),
      dimensiones: [
        { id: "9.9", impacto: "No existe.", prioridad: "Nada." },
        { id: d1, impacto: "Primera.", prioridad: "Primera." },
        { id: d1, impacto: "Repetida.", prioridad: "Repetida." },
      ],
    });
    expect(x?.resumen).toBeNull();
    expect(Object.keys(x!.dimensiones)).toEqual([d1]);
    expect(x?.dimensiones[d1].impacto).toBe("Primera.");
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
    nivel: "D",
    nivelNombre: "Deficiente",
    preguntadas: 8,
    capas: [
      { clave: "base", nombre: "Base operativa", nivel: "I", nivelNombre: "Inicial", puntaje: 32 },
      { clave: "produccion", nombre: "Producción", nivel: "D", nivelNombre: "Deficiente", puntaje: 12 },
    ],
    recomendacion: { tipo: "trabajar", dimensionId: "1.6", dimensionNombre: "Priorización de interesados", objetivo: "F", objetivoNombre: "Funcional", razon: "", costoDeQuedarse: "" },
  };
  const capas = (b: "D" | "F", p: "D" | "F" | null) => [
    { ...base.capas[0], nivel: b },
    { ...base.capas[1], nivel: p },
  ];

  it("interpreta qué significa operar así, dice lo que más frena y que es una estimación con pocas preguntas", () => {
    expect(resumenSinIa(base)).toBe(
      "Por lo que respondiste, tu área depende más del esfuerzo de cada persona que de un sistema, y eso se nota en lo que entrega hacia afuera. Lo que más la frena es «Priorización de interesados». Es una estimación con solo 8 preguntas: hay vacíos de información que conviene explorar para afinarla.",
    );
  });

  it("⛔ no repite el nivel ni nombra la industria", () => {
    for (const c of [capas("D", "D"), capas("D", "F"), capas("F", "D"), capas("F", "F"), capas("D", null)]) {
      const t = resumenSinIa({ ...base, capas: c });
      for (const nivel of ["Deficiente", "Inicial", "Funcional", "Eficiente", "Óptimo"]) expect(t).not.toContain(nivel);
      expect(t).toMatch(/Es una estimación con solo 8 preguntas/);
    }
  });

  it("cada combinación de capas dice lo suyo (y no la de otra)", () => {
    const de = (b: "D" | "F", p: "D" | "F" | null) => resumenSinIa({ ...base, capas: capas(b, p), recomendacion: null });
    expect(de("D", "D")).toMatch(/^Por lo que respondiste, tu área depende más del esfuerzo de cada persona que de un sistema, y eso se nota en lo que entrega/);
    expect(de("D", "F")).toMatch(/^Por lo que respondiste, tu área entrega hacia afuera, pero se sostiene en el esfuerzo de cada persona/);
    expect(de("F", "D")).toMatch(/^Por lo que respondiste, tu área tiene su base montada, pero todavía no se traduce en lo que entrega/);
    expect(de("F", "F")).toMatch(/^Por lo que respondiste, tu área tiene su base montada y entrega bien hacia afuera/);
    expect(de("D", null)).toMatch(/^Por lo que respondiste, tu área depende más del esfuerzo de cada persona que de un sistema\./);
    expect(de("F", null)).toMatch(/^Por lo que respondiste, tu área tiene su base montada\./);
  });

  it("⛔ la industria se reconoce por las palabras que la distinguen, no solo por el nombre entero", () => {
    expect(nombraLaIndustria("Para una empresa de banca, cada cliente pesa.", "Banca y servicios financieros")).toBe(true);
    expect(nombraLaIndustria("En la banca, cada cliente pesa.", "Banca y servicios financieros")).toBe(true);
    expect(nombraLaIndustria("Los servicios financieros exigen orden.", "Banca y servicios financieros")).toBe(true);
    // El español de todos los días no la delata (revisión del 29 oct).
    expect(nombraLaIndustria("A pesar de tener clientes, cada uno pesa igual.", "Maquinaria y equipo pesado")).toBe(false);
    expect(nombraLaIndustria("Nadie alimenta el CRM.", "Alimentos y bebidas")).toBe(false);
    expect(nombraLaIndustria("Tu operación no es saludable.", "Salud")).toBe(false);
    expect(nombraLaIndustria("En salud, cada paciente cuenta.", "Salud")).toBe(true);
    expect(nombraLaIndustria("En maquinaria, cada cotización cuenta.", "Maquinaria y equipo pesado")).toBe(true);
    expect(nombraLaIndustria("En logística, cada entrega cuenta.", "Logística y transporte")).toBe(true);
    // Palabras comunes que no la delatan: «tu equipo», «los servicios», «Tecnología y Automatización».
    expect(nombraLaIndustria("Tu equipo vende cada uno a su manera.", "Maquinaria y equipo pesado")).toBe(false);
    expect(nombraLaIndustria("Tus clientes no reciben los servicios a tiempo.", "Servicios")).toBe(false);
    expect(nombraLaIndustria("Cualquier cosa.", "Otra")).toBe(false);
    expect(nombraLaIndustria("Cualquier cosa.", null)).toBe(false);
  });

  it("sin nivel, lo dice", () => {
    expect(resumenSinIa({ ...base, nivel: null })).toBe("Con lo que respondiste todavía no alcanza para ubicar tu área de Ventas: en una sesión lo completamos juntos.");
  });

  it("la página usa la interpretación de la IA si la hay, y si no, la de los datos; la estimación va siempre", () => {
    // Una redacción de antes de la tercera vuelta (sin `v`) describía el resultado: no se muestra.
    expect(resumenDelResultado({ ...base, redaccion: { modelo: "m", at: "", resumen: "El área de Ventas está en Deficiente.", dimensiones: {} } })).toBe(resumenSinIa(base));
    expect(resumenDelResultado({ ...base, redaccion: { v: 2, modelo: "m", at: "", resumen: "El de la IA.", dimensiones: {} } })).toBe(
      "El de la IA. Es una estimación con solo 8 preguntas: hay vacíos de información que conviene explorar para afinarla.",
    );
    expect(resumenDelResultado({ ...base, redaccion: { modelo: "m", at: "", resumen: null, dimensiones: {} } })).toBe(resumenSinIa(base));
    expect(resumenDelResultado(base)).toBe(resumenSinIa(base));
  });
});
