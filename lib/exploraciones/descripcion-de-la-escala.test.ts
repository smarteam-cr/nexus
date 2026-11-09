/**
 * lib/exploraciones/descripcion-de-la-escala.test.ts — la descripción de cada equipo bajo «Resultado general» de la escala
 * que ve el cliente (Elías, 8 nov): puntual, sin relleno, la misma en las dos superficies, y la guardada solo mientras los
 * niveles sean los de cuando se escribió.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { parseObject } from "@/lib/ai/section-schema";
import { aplicarOperaciones as aplicar, cambioLoConfirmado, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado, type Operacion, type Validez } from "./contenido";
import {
  areaParaLaDescripcion,
  contextoDelEquipo,
  descripcionDeRespaldo,
  descripcionDelArea,
  descripcionValida,
  firmaDelArea,
  leerLaDescripcion,
  pedidoDeLaDescripcion,
  reglasDeLaDescripcion,
  copiaTextual,
  cualesSeGuardan,
  escribirConUnReintento,
  TOPE_DE_LA_DESCRIPCION,
} from "./descripcion-de-la-escala";
import { escalaParaElLienzo } from "./escala-del-lienzo";
import { resultadosDeLaEscala } from "./escala-para-el-cliente";
import { leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
const area = lienzo.areas[0];
const queAplican = area.dimensiones.filter((d) => d.aplica);
const NIVELES = escala.niveles.map((n) => n.nombre);

const chequeoDe = (xs: Record<string, Partial<EstimadoGuardado>>) =>
  Object.fromEntries(Object.entries(xs).map(([id, e]) => [id, { nivel: "I", fuente: "reunion", ...e } as EstimadoGuardado]));
const estado = (chequeo: Record<string, Partial<EstimadoGuardado>>, extra: Partial<EstadoDeExploracion["contenido"]> = {}) => ({
  areas: [area.id],
  contenido: { ...contenidoVacio(), chequeo: chequeoDe(chequeo), ...extra },
});
const todas = (e: Partial<EstimadoGuardado> = {}) => Object.fromEntries(queAplican.map((d) => [d.id, e]));
const VALIDEZ: Validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(["1", "2", "3"]), ediciones: new Set(), escalaVersion: escala.version };
const aplicarOperaciones = (e: EstadoDeExploracion, ops: Operacion[], quien?: { por: string | null; en: string }) => aplicar(e, ops, VALIDEZ, VALIDADOR_ESTRICTO, quien);
const RELLENO = /hemos visto|hasta ahora|por explorar|confirmamos|lo que creemos|por lo conversado|de las \d+ partes|\d/;

describe("la descripción de respaldo", () => {
  it("con nivel: cómo trabaja hoy el equipo y lo que más lo frena, sin conteos ni «lo confirmamos contigo»", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, estado({ ...todas({ nivel: "I" }), [queAplican[0].id]: { nivel: "D", fuente: "hipotesis" } }));
    expect(x.descripcion.origen).toBe("respaldo");
    expect(x.resultado.sintesis).toBe(x.descripcion.texto);
    expect(x.resultado.sintesis).toMatch(new RegExp(`^Tu equipo de ${x.resultado.areaNombre}`));
    expect(x.resultado.sintesis).toContain("Lo que más lo frena es «");
    expect(x.resultado.sintesis).not.toMatch(RELLENO);
  });

  it("en medición: lo que ya se ve y, por su nombre, qué falta para darle un nivel general", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, estado(Object.fromEntries(queAplican.slice(0, -2).map((d) => [d.id, {}]))));
    expect(x.resultado.nivel).toBeNull();
    const faltan = queAplican.slice(-2).map((d) => d.nombre);
    expect(x.resultado.sintesis).toContain(`«${faltan[0]}» y «${faltan[1]}»`);
    expect(x.resultado.sintesis).not.toMatch(RELLENO);
  });

  it("sin nada todavía: lo dice sin inventar", () => {
    const r = resultadosDeLaEscala(escala, lienzo, { ...estado({}), contenido: { ...estado({}).contenido, areasAlCliente: [area.id] } })[0].resultado;
    expect(descripcionDeRespaldo(r)).toMatch(/^Todavía no conocemos/);
  });
});

describe("la guardada (del agente o a mano)", () => {
  const chequeo = todas({ nivel: "I" });
  const firma = firmaDelArea(chequeoDe(chequeo), area.id, { escalaVersion: escala.version });

  it("sale mientras los niveles sean los de cuando se escribió, en la página y en lo interno (un solo texto)", () => {
    const guardada = { texto: "Tu equipo atiende bien.", origen: "agente" as const, firma, at: "2026-11-08T00:00:00.000Z" };
    const [x] = resultadosDeLaEscala(escala, lienzo, estado(chequeo, { descripcionesDeLaEscala: { [area.id]: guardada } }));
    expect(x.descripcion).toMatchObject({ origen: "agente", vigente: true, texto: guardada.texto });
    expect(x.resultado.sintesis).toBe(guardada.texto);
  });

  it("⛔ si un nivel cambió después, deja de salir: puede nombrar otro «lo que más frena»", () => {
    const guardada = { texto: "Vieja.", origen: "mano" as const, firma, at: "2026-11-08T00:00:00.000Z" };
    const cambiado = { ...chequeo, [queAplican[3].id]: { nivel: "F" as const } };
    const [x] = resultadosDeLaEscala(escala, lienzo, estado(cambiado, { descripcionesDeLaEscala: { [area.id]: guardada } }));
    expect(x.descripcion).toMatchObject({ origen: "respaldo", vigente: false, guardada });
    expect(x.resultado.sintesis).not.toBe("Vieja.");
  });

  it("la firma cambia con el nivel, con pasar de hipótesis a evidencia y con un riesgo; no con otra área", () => {
    const base = chequeoDe({ "1.1": {}, "1.2": {} });
    expect(firmaDelArea(base, "1")).toBe("1.1:I,1.2:I||||");
    expect(firmaDelArea({ ...base, "1.2": { nivel: "I", fuente: "hipotesis" } }, "1")).not.toBe(firmaDelArea(base, "1"));
    expect(firmaDelArea({ ...base, "1.2": { nivel: "I", fuente: "reunion", riesgo: true } }, "1")).not.toBe(firmaDelArea(base, "1"));
    expect(firmaDelArea({ ...base, "2.1": { nivel: "O", fuente: "reunion" } }, "1")).toBe(firmaDelArea(base, "1"));
    expect(firmaDelArea({ ...base, "1.10": { nivel: "I", fuente: "reunion" } }, "1")).toBe("1.1:I,1.2:I,1.10:I||||");
    // Lo que cambia qué partes aplican, o el cálculo, también (revisión del 8 nov).
    expect(firmaDelArea(base, "1", { perfilCierre: "transaccional" })).not.toBe(firmaDelArea(base, "1", { perfilCierre: "con equipo" }));
    expect(firmaDelArea(base, "1", { edicion: "banca" })).not.toBe(firmaDelArea(base, "1"));
    expect(firmaDelArea(base, "1", { escalaVersion: "9.1.0" })).not.toBe(firmaDelArea(base, "1", { escalaVersion: "9.0.0" }));
  });

  it("descripcionDelArea no la usa en un área sin nada", () => {
    const r = { areaId: area.id, areaNombre: "Ventas", nivel: null, capas: [], recomendacion: null, dimensiones: [], preguntadas: 0 };
    const d = descripcionDelArea({ chequeo: {}, descripcionesDeLaEscala: { [area.id]: { texto: "x", origen: "mano", firma: "", at: "" } } }, r);
    expect(d.origen).toBe("respaldo");
  });
});

describe("escribirla a mano (la operación descripcionDeLaEscala)", () => {
  const ests = (): EstadoDeExploracion => ({
    contenido: estado(todas()).contenido,
    propuesta: propuestaVacia(),
    areas: [area.id],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
  });

  it("la guarda con la firma de hoy, no sube la versión y sobrevive a la lectura de la base", () => {
    const antes = ests();
    const r = aplicarOperaciones(antes, [{ op: "descripcionDeLaEscala", areaId: area.id, texto: "  Tu equipo   vende a mano. " }], { por: "a@b.c", en: "2026-11-08T10:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.estado.contenido.descripcionesDeLaEscala?.[area.id];
    expect(g).toEqual({ texto: "Tu equipo vende a mano.", origen: "mano", firma: firmaDelArea(antes.contenido.chequeo, area.id, { ...antes, escalaVersion: escala.version }), at: "2026-11-08T10:00:00.000Z", por: "a@b.c" });
    // La escrita a mano sale en la página con el mismo estado: las dos puntas calculan la misma firma.
    expect(resultadosDeLaEscala(escala, lienzo, r.estado)[0].descripcion).toMatchObject({ origen: "mano", vigente: true });
    expect(cambioLoConfirmado(antes, r.estado)).toBe(false);
    expect(leerContenido(JSON.parse(JSON.stringify(r.estado.contenido))).descripcionesDeLaEscala).toEqual(r.estado.contenido.descripcionesDeLaEscala);
    // null la borra: vuelve el respaldo.
    const b = aplicarOperaciones(r.estado, [{ op: "descripcionDeLaEscala", areaId: area.id, texto: null }]);
    expect(b.ok && b.estado.contenido.descripcionesDeLaEscala).toBeUndefined();
  });

  it("rechaza un área que no existe", () => {
    const r = aplicarOperaciones(ests(), [{ op: "descripcionDeLaEscala", areaId: "9", texto: "x" }]);
    expect(r.ok).toBe(false);
  });
});

describe("lo que escribe el agente pasa por las reglas", () => {
  const reglas = {
    niveles: NIVELES,
    deLaEmpresa: "atiende unos 1.800 tickets al mes por WhatsApp",
    interno: "atiende unos 1.800 tickets al mes por WhatsApp. Los leads los anota Marta en un Excel y nadie más los ve.",
    usaHubspot: false,
    equipo: ["Elías González"],
  };

  it("acepta un texto puntual con una cifra que leyó", () => {
    expect(descripcionValida("Tu equipo de Servicio atiende unos 1800 tickets al mes, y lo que entra por WhatsApp se anota a mano.", reglas)).toMatchObject({ ok: true });
  });

  it.each([
    ["relleno", "Por lo que hemos visto hasta ahora, tu equipo vende a mano."],
    ["procedencia", "Tu equipo vende a mano, como se mencionó en la reunión."],
    ["por explorar", "Tu equipo vende a mano; una parte está por explorar."],
    ["conteo", "Tu equipo vende a mano. 1 de las 8 partes está sin ver."],
    ["nivel", "Tu equipo está en un nivel inicial."],
    ["cifra ajena", "Tu equipo pierde 30 negocios al mes."],
    ["voseo", "Tu equipo vende a mano y vos tenés que revisarlo."],
    ["gente de Smarteam", "Elías vio que tu equipo vende a mano."],
    ["HubSpot que no usan", "Tu HubSpot no se usa a diario."],
    ["plata", "Tu equipo atiende unos 1.800 tickets al mes con un presupuesto chico."],
    ["copia textual", "Tu equipo de Ventas: los leads los anota Marta en un Excel."],
    ["demasiado larga", `Tu equipo ${"vende a mano ".repeat(40)}`],
  ])("descarta: %s", (_, texto) => {
    expect(descripcionValida(texto, reglas).ok).toBe(false);
  });

  it("lee el JSON con el lector compartido, valida cada área y marca la que no devolvió", () => {
    const respuesta = {
      content: [{ type: "text" as const, text: '```json\n{"descripciones":[{"area":"1","texto":"Tu equipo vende a mano."},{"area":"3","texto":"Hasta ahora todo bien."}]}\n```', citations: null }],
    };
    const r = leerLaDescripcion(respuesta, { ...reglas, areas: ["1", "2", "3"], parse: parseObject });
    expect(r.validas).toEqual({ "1": "Tu equipo vende a mano." });
    expect(Object.keys(r.descartadas).sort()).toEqual(["2", "3"]);
    expect(r.descartadas["2"]).toEqual(["no la devolvió"]);
  });

  it("el pedido lleva los niveles, lo que más frena y lo que se vio, y avisa que lo por explorar no se afirma", () => {
    const chequeo = chequeoDe({ ...todas({ nivel: "I" }), [queAplican[0].id]: { nivel: "D", fuente: "hipotesis", porQue: "Nadie anota por qué se pierde." } });
    const [x] = resultadosDeLaEscala(escala, lienzo, { areas: [area.id], contenido: { ...contenidoVacio(), chequeo } });
    const a = areaParaLaDescripcion(escala, x.resultado, chequeo, x.porExplorar);
    expect(a.loQueMasFrena).not.toBeNull();
    expect(a.dimensiones.find((d) => d.porExplorar)?.loQueSeVio).toContain("Nadie anota");
    const ctx = { empresa: "Centauro", areas: [a], reuniones: "", instrucciones: "" };
    const p = pedidoDeLaDescripcion(ctx);
    expect(String(p.system)).toMatch(/porExplorar/);
    expect(reglasDeLaDescripcion(ctx, NIVELES).interno).toContain("Nadie anota");
    expect(TOPE_DE_LA_DESCRIPCION).toBeLessThan(400);
  });
});

describe("el contexto que el CSE escribe para cada equipo", () => {
  it("se lee como texto o como { texto }, por área, y vacío no cuenta", () => {
    expect(contextoDelEquipo({ contextoDeLaEscala: { "1": "  Usan  Zoho  " } }, "1")).toBe("Usan Zoho");
    expect(contextoDelEquipo({ contextoDeLaEscala: { "3": { texto: "Soporte en dos turnos", en: "x" } } }, "3")).toBe("Soporte en dos turnos");
    expect(contextoDelEquipo({ contextoDeLaEscala: { "1": "   " } }, "1")).toBeNull();
    expect(contextoDelEquipo({}, "1")).toBeNull();
  });

  it("entra al pedido del agente (y sus cifras cuentan como leídas)", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, estado(todas({ nivel: "I" })));
    const a = areaParaLaDescripcion(escala, x.resultado, chequeoDe(todas({ nivel: "I" })), [], "Tienen 12 vendedores");
    const ctx = { empresa: "Centauro", areas: [a], reuniones: "", instrucciones: "" };
    expect(JSON.stringify(pedidoDeLaDescripcion(ctx).messages)).toContain("Tienen 12 vendedores");
    expect(descripcionValida("Con 12 vendedores, tu equipo trabaja a mano.", reglasDeLaDescripcion(ctx, NIVELES)).ok).toBe(true);
  });
});

describe("lo que se compara contra lo leído (revisión del 8 nov)", () => {
  const area = (loQueSeVio: string) => ({
    id: "1",
    nombre: "Ventas",
    nivelGeneral: null,
    capas: [],
    loQueMasFrena: null,
    contextoDelEquipo: null,
    dimensiones: [{ nombre: "x", capa: "base", nivel: "Inicial", comoEs: null, porExplorar: false, loQueSeVio }],
  });

  it("las cifras valen solo si las dijo la empresa: ni el id de un equipo ni la fecha de una minuta", () => {
    const ctx = { empresa: "E", areas: [area("Venden por teléfono.")], reuniones: "- Kickoff (3 nov 2026): Hablamos del CRM.", instrucciones: "" };
    const r = reglasDeLaDescripcion(ctx, NIVELES);
    expect(descripcionValida("Tus 3 vendedores venden por teléfono.", r).ok).toBe(false);
    expect(descripcionValida("Tu equipo vende por teléfono en 1 canal.", r).ok).toBe(false);
  });

  it("HubSpot cuenta como suyo solo si lo dice lo visto de sus partes, no una minuta donde se lo mostramos", () => {
    const enMinuta = reglasDeLaDescripcion({ empresa: "E", areas: [area("Usan Zoho.")], reuniones: "- Demo (3 nov 2026): Le mostramos HubSpot.", instrucciones: "" }, NIVELES);
    expect(enMinuta.usaHubspot).toBe(false);
    expect(reglasDeLaDescripcion({ empresa: "E", areas: [area("El HubSpot no se usa a diario.")], reuniones: "", instrucciones: "" }, NIVELES).usaHubspot).toBe(true);
  });

  it("copia textual: seis palabras seguidas iguales, sin importar tildes ni mayúsculas", () => {
    expect(copiaTextual("Hoy, los leads los anota Marta en un Excel.", "los Leads los anota Marta en un excel y nadie")).toBe("los leads los anota marta en");
    expect(copiaTextual("Tu equipo vende a mano.", "vende a mano cada día")).toBeNull();
  });
});

describe("qué se guarda de lo que escribió el agente", () => {
  const d = (texto: string, at: string, firma = "f", origen: "agente" | "mano" = "agente") => ({ texto, origen, firma, at });
  const nuevas = { "1": d("nueva", "t2") };

  it("⛔ no pisa una que alguien cambió mientras el agente escribía, y lo dice", () => {
    const r = cualesSeGuardan({ nuevas, alEmpezar: { "1": null }, ahora: { "1": d("a mano", "t1", "f", "mano") }, soloFaltantes: false, firmaDeHoy: () => "f" });
    expect(r.guardar).toEqual({});
    expect(r.saltadas[0].areaId).toBe("1");
  });

  it("regenerar a pedido pisa la de antes (también la escrita a mano)", () => {
    const r = cualesSeGuardan({ nuevas, alEmpezar: { "1": "t1" }, ahora: { "1": d("a mano", "t1", "f", "mano") }, soloFaltantes: false, firmaDeHoy: () => "f" });
    expect(r.guardar).toEqual(nuevas);
  });

  it("⛔ en segundo plano (soloFaltantes) no pisa una vigente, ni la escrita a mano; sí una vieja", () => {
    const vigente = cualesSeGuardan({ nuevas, alEmpezar: { "1": "t1" }, ahora: { "1": d("a mano", "t1", "f", "mano") }, soloFaltantes: true, firmaDeHoy: () => "f" });
    expect(vigente.guardar).toEqual({});
    const vieja = cualesSeGuardan({ nuevas, alEmpezar: { "1": "t1" }, ahora: { "1": d("a mano", "t1", "vieja", "mano") }, soloFaltantes: true, firmaDeHoy: () => "f" });
    expect(vieja.guardar).toEqual(nuevas);
  });
});

describe("el reintento", () => {
  const ctx = {
    empresa: "E",
    areas: ["1", "3"].map((id) => ({ id, nombre: id === "1" ? "Ventas" : "Servicio", nivelGeneral: null, capas: [], loQueMasFrena: null, contextoDelEquipo: null, dimensiones: [] })),
    reuniones: "",
    instrucciones: "",
  };
  const respuesta = (json: object) => ({ content: [{ type: "text" as const, text: JSON.stringify(json), citations: null }], usage: { input_tokens: 10, output_tokens: 5 } as never });

  it("pide una vez más solo lo que no pasó, con el motivo, y junta lo bueno de los dos", async () => {
    const pedidos: { id: string }[][] = [];
    const avisos: string[] = [];
    const r = await escribirConUnReintento(ctx, { ...reglasDeLaDescripcion(ctx, NIVELES), parse: parseObject }, async (p) => {
      const contenido = String(p.messages[0].content);
      avisos.push(contenido);
      pedidos.push(JSON.parse(contenido.split("Sus equipos, con lo que se sabe de cada uno:\n")[1].split("\n\n")[0]));
      return pedidos.length === 1
        ? respuesta({ descripciones: [{ area: "1", texto: "Tu equipo vende a mano." }, { area: "3", texto: "Hasta ahora atiende bien." }] })
        : respuesta({ descripciones: [{ area: "3", texto: "Tu equipo atiende a mano." }] });
    });
    expect(pedidos.map((x) => x.map((a) => a.id))).toEqual([["1", "3"], ["3"]]);
    expect(avisos[1]).toContain("se descartó");
    expect(r.validas).toEqual({ "1": "Tu equipo vende a mano.", "3": "Tu equipo atiende a mano." });
    expect(r.descartadas).toEqual({});
    expect(r.usos).toHaveLength(2);
  });

  it("sin nada descartado no vuelve a pedir", async () => {
    let veces = 0;
    await escribirConUnReintento(ctx, { ...reglasDeLaDescripcion(ctx, NIVELES), parse: parseObject }, async () => {
      veces++;
      return respuesta({ descripciones: [{ area: "1", texto: "Tu equipo vende a mano." }, { area: "3", texto: "Tu equipo atiende a mano." }] });
    });
    expect(veces).toBe(1);
  });
});
