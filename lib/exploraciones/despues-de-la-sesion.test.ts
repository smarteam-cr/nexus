/**
 * La sesión que ya pasó en tres bloques (2026-11-07, Elías: «el usuario no rellena forms: valida o modifica
 * sugerencias»): si se cumplió el objetivo, lo que queda para la próxima en UNA lista que se desmarca, el objetivo de la
 * siguiente sin otra IA, y cada sugerencia en un solo lugar (la sesión o el Resumen).
 */
import { describe, expect, it } from "vitest";
import type { ItemPropuesto, LecturaDeReunion } from "./contenido";
import { desafioDeLaFichaGuardada, desafioEnElDolor, dolorConElDesafio, faltaPedirLaPropuesta } from "./contexto-de-la-exploracion";
import { fichaVacia, fusionarPropuesta } from "@/lib/clients/ficha";
import {
  claveDePendiente,
  cumplimientoSugerido,
  dondeQuedo,
  esDeLaReunion,
  esDeUnaSesion,
  loQueQuedaParaLaProxima,
  objetivoSugeridoDeLaSiguiente,
  PENDIENTE_DEL_RESULTADO,
  retomarParaLaGuia,
  ultimaReunionLeida,
} from "./despues-de-la-sesion";
import { leerPropuesta, SesionPlaneadaSchema } from "./esquemas";
import { propuestaVacia } from "./contenido";

const lectura = (o: Partial<LecturaDeReunion> = {}): LecturaDeReunion => ({
  etiqueta: "Reunión del 5 nov: Diagnóstico con Centauro",
  resumen: "Hablaron del seguimiento comercial.",
  cobertura: [],
  en: "2026-11-05T18:00:00.000Z",
  corridaId: "c1",
  ...o,
});

describe("si se cumplió el objetivo", () => {
  it("manda lo que dijo la lectura", () => {
    expect(cumplimientoSugerido(lectura({ cumplido: "en_parte" }))).toBe("en_parte");
  });
  it("una lectura de antes lo deduce de las preguntas planeadas que se respondieron", () => {
    const c = (respondida: boolean, para: string) => ({ para, pregunta: para, respondida });
    expect(cumplimientoSugerido(lectura({ cobertura: [c(true, "metas"), c(true, "retos")] }))).toBe("si");
    expect(cumplimientoSugerido(lectura({ cobertura: [c(true, "metas"), c(false, "retos")] }))).toBe("en_parte");
    expect(cumplimientoSugerido(lectura({ cobertura: [c(false, "metas")] }))).toBe("no");
  });
  it("sin objetivo ni preguntas no hay contra qué medir", () => {
    expect(cumplimientoSugerido(lectura())).toBeNull();
    expect(cumplimientoSugerido(null)).toBeNull();
  });
});

describe("lo que queda para la próxima: una sola lista, todo marcado", () => {
  const l = lectura({
    paraLaProxima: ["Cuántos interesados se enfrían por semana", "Quién aprueba el presupuesto"],
    cobertura: [
      { para: "metas", pregunta: "¿Qué número quieren mover este año?", respondida: false },
      { para: "retos", pregunta: "¿Dónde se pierden los interesados?", respondida: true },
    ],
  });

  it("junta lo pendiente de la lectura, lo que no se preguntó, lo que nadie siguió y lo escrito a mano, sin repetir", () => {
    const p = loQueQuedaParaLaProxima({
      sesion: {
        desafio: { texto: "El seguimiento depende de cada vendedor", falta: ["quién aprueba el presupuesto"] },
        retomar: [{ tema: "Cómo miden servicio", donde: "con la jefa de servicio" }],
      },
      lectura: l,
      noSeSiguio: [{ texto: "Mencionó que usan WhatsApp. Qué preguntar: ¿quién responde los mensajes?", itemId: "it-1" }],
      resultadoSinMarcar: true,
    });
    expect(p.map((x) => x.de)).toEqual(["resultado", "quedoPendiente", "quedoPendiente", "noSePregunto", "noSeSiguio", "retomar"]);
    expect(p[0].texto).toBe(PENDIENTE_DEL_RESULTADO);
    // «quién aprueba el presupuesto» ya estaba (en otra caja): no se repite.
    expect(p.filter((x) => x.texto.toLowerCase() === "quién aprueba el presupuesto")).toHaveLength(1);
    expect(p.find((x) => x.de === "noSePregunto")).toMatchObject({ para: "metas" });
    expect(p.find((x) => x.de === "noSeSiguio")).toMatchObject({ itemId: "it-1" });
    expect(p.find((x) => x.de === "retomar")).toMatchObject({ detalle: "con la jefa de servicio" });
    expect(p.every((x) => x.marcado)).toBe(true);
  });

  it("lo que la persona desmarcó queda desmarcado (por su huella, sin mayúsculas ni espacios de más)", () => {
    const p = loQueQuedaParaLaProxima({ sesion: { noLlevar: [claveDePendiente("  cuántos interesados se ENFRÍAN   por semana ")] }, lectura: l });
    expect(p.find((x) => x.texto.startsWith("Cuántos"))?.marcado).toBe(false);
    expect(p.find((x) => x.texto.startsWith("Quién"))?.marcado).toBe(true);
  });

  it("la siguiente guía recibe lo marcado de la última reunión, no lo desmarcado ni lo ya llevado (con el formato de antes)", () => {
    const conTres = lectura({ paraLaProxima: ["Cuántos interesados se enfrían por semana", "Quién aprueba el presupuesto", "Qué CRM usan hoy"] });
    const sesiones = [
      { id: "s-a1", noLlevar: [claveDePendiente("Quién aprueba el presupuesto")] },
      // «Quedó abierto» guardaba así lo llevado, hasta el 2026-11-07.
      { id: "s-a2", explorar: ["No se preguntó. Qué preguntar: Qué CRM usan hoy"] },
    ];
    const lineas = retomarParaLaGuia(sesiones, "s-a2", { lectura: conTres, sesion: sesiones[0] }).retomar ?? [];
    expect(lineas.some((x) => x.includes("Cuántos interesados se enfrían por semana"))).toBe(true);
    expect(lineas.some((x) => x.includes("Quién aprueba el presupuesto"))).toBe(false);
    expect(lineas.some((x) => x.includes("Qué CRM usan hoy"))).toBe(false);
    // Lo que no se preguntó llega por la historia de las sesiones y el resultado por su bloque fijo: no se repiten.
    expect(lineas.some((x) => x.includes("¿Qué número quieren mover este año?") || x.includes(PENDIENTE_DEL_RESULTADO))).toBe(false);
  });

  it("una reunión que entró sola (sin sesión) también deja lo suyo a la guía; una sesión posterior a la próxima no", () => {
    expect((retomarParaLaGuia([{ id: "s-a2" }], "s-a2", { lectura: l, sesion: null }).retomar ?? []).some((x) => x.includes("Cuántos interesados"))).toBe(true);
    expect(retomarParaLaGuia([{ id: "s-a1" }, { id: "s-a2" }], "s-a1", { lectura: l, sesion: { id: "s-a2" } })).toEqual({});
  });

  it("la última reunión leída es la más reciente, con la sesión que le corresponde", () => {
    const u = ultimaReunionLeida({ "meet:m1": lectura({ fecha: "2026-11-01" }), "hubspot:h2": lectura({ fecha: "2026-11-05" }) }, (r) => (r.id === "h2" ? { id: "s-a2" } : null));
    expect(u?.lectura.fecha).toBe("2026-11-05");
    expect(u?.sesion?.id).toBe("s-a2");
    expect(ultimaReunionLeida({}, () => null)).toBeNull();
  });

  it("dónde quedó muestra lo marcado de la última sesión que pasó", () => {
    const d = dondeQuedo(
      [
        { numero: 1, hecha: true, sesion: { id: "s-a1", noLlevar: [claveDePendiente("Quién aprueba el presupuesto")] }, reunion: { origen: "meet", id: "m1" } },
        { numero: 2, hecha: false, sesion: { id: "s-a2" } },
      ],
      {},
      { "meet:m1": l },
    );
    expect(d.queda.map((x) => x.texto)).toEqual(["Cuántos interesados se enfrían por semana", "¿Qué número quieren mover este año?"]);
  });
});

describe("el objetivo de la siguiente sesión, sin otra IA", () => {
  const pendientes = loQueQuedaParaLaProxima({ sesion: null, lectura: lectura({ paraLaProxima: ["Cuántos se enfrían", "Quién aprueba"] }) });

  it("usa el que sugirió la lectura si nadie desmarcó nada", () => {
    expect(objetivoSugeridoDeLaSiguiente({ pendientes, objetivoSiguiente: "Medir cuántos interesados se pierden y quién decide" })).toBe(
      "Medir cuántos interesados se pierden y quién decide",
    );
  });

  it("si se desmarcó algo, lo arma con lo que sigue marcado y lo que la exploración no sabe", () => {
    const uno = pendientes.map((p, i) => (i === 1 ? { ...p, marcado: false } : p));
    expect(objetivoSugeridoDeLaSiguiente({ pendientes: uno, objetivoSiguiente: "Algo que ya no vale", porAveriguar: ["Presupuesto", "Quién decide"] })).toBe(
      "Retomar «Cuántos se enfrían» y averiguar presupuesto y quién decide.",
    );
  });

  it("sin nada pendiente ni por averiguar, no sugiere", () => {
    expect(objetivoSugeridoDeLaSiguiente({ pendientes: [] })).toBeNull();
  });
});

describe("cada sugerencia en un solo lugar", () => {
  const item = (etiqueta: string) => ({ fuentes: [{ id: "S1", etiqueta }] }) as unknown as ItemPropuesto;
  const l = lectura();

  it("lo que sale de la lectura de una sesión se revisa en esa sesión, no en el Resumen", () => {
    expect(esDeUnaSesion(item(l.etiqueta), { "meet:m1": l })).toBe(true);
    expect(esDeLaReunion(item(l.etiqueta), l, null)).toBe(true);
  });

  it("lo que sale de otra fuente (el test, HubSpot) sigue en el Resumen", () => {
    expect(esDeUnaSesion(item("El test de la escala"), { "meet:m1": l })).toBe(false);
  });
});

describe("la propuesta del contexto se pide una sola vez", () => {
  it("se pide si nunca se pidió o si es de antes del resultado del negocio; null cuenta como pedido", () => {
    expect(faltaPedirLaPropuesta(null)).toBe(true);
    expect(faltaPedirLaPropuesta({ tarjetas: {}, objetivo: "x", en: "x" })).toBe(true);
    expect(faltaPedirLaPropuesta({ tarjetas: {}, objetivo: null, desafio: null, resultado: null, en: "x" })).toBe(false);
  });
});

describe("el desafío principal en la ficha de la empresa («Dolor principal»)", () => {
  const preventa = ["- Si no actúa: siguen perdiendo interesados", "- Si lo logra: duplican los cierres"].join("\n");

  it("se lee sin las líneas de la preventa, y validarlo las conserva", () => {
    expect(desafioEnElDolor(preventa)).toBe("");
    expect(desafioEnElDolor(`Nadie ve qué interesados se enfrían
${preventa}`)).toBe("Nadie ve qué interesados se enfrían");
    expect(dolorConElDesafio(`Viejo
${preventa}`, "Nuevo")).toBe(`Nuevo
${preventa}`);
  });

  it("con solo las líneas de la preventa, la ficha no tiene desafío (Nexus lo propone)", () => {
    const f = fichaVacia();
    f.valores.dolorPrincipal = preventa;
    expect(desafioDeLaFichaGuardada(f)).toBeNull();
  });

  it("una corrección propuesta se ve en vez de lo confirmado, esperando que Customer Success la confirme", () => {
    const f = fichaVacia();
    f.valores.dolorPrincipal = "A";
    expect(desafioDeLaFichaGuardada(f)).toEqual({ texto: "A", confirmado: true });
    const { ficha } = fusionarPropuesta(f, [{ clave: "dolorPrincipal", valor: dolorConElDesafio("A", "B"), fuentes: ["Preventa · Desafío principal validado en la exploración"] }], "Preventa");
    expect(desafioDeLaFichaGuardada(ficha)).toEqual({ texto: "B", confirmado: false });
    // Va como propuesta: lo confirmado no cambia hasta que alguien lo confirme.
    expect(ficha.valores.dolorPrincipal).toBe("A");
  });
});

describe("los campos nuevos se guardan y se leen", () => {
  it("la sesión guarda si se cumplió y lo desmarcado", () => {
    expect(SesionPlaneadaSchema.safeParse({ id: "s-a1", cumplido: "en_parte", noLlevar: [claveDePendiente("x")] }).success).toBe(true);
    expect(SesionPlaneadaSchema.safeParse({ id: "s-a1", cumplido: "quizas" }).success).toBe(false);
  });

  it("la lectura guarda lo que dijo de la reunión más reciente", () => {
    const l = lectura({ cumplido: "si", paraLaProxima: ["a"], objetivoSiguiente: "b" });
    expect(leerPropuesta({ ...propuestaVacia(), lecturas: { "meet:m1": l } }).lecturas["meet:m1"]).toEqual(l);
  });

  it("lo que Nexus propuso para el contexto guarda el objetivo y el desafío (null = se pidió y no había)", () => {
    const p = leerPropuesta({ ...propuestaVacia(), contextoPropuesto: { tarjetas: {}, objetivo: null, desafio: "Pierden interesados", en: "2026-11-07T12:00:00.000Z" } });
    expect(p.contextoPropuesto).toEqual({ tarjetas: {}, objetivo: null, desafio: "Pierden interesados", en: "2026-11-07T12:00:00.000Z" });
  });
});
