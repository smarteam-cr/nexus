/**
 * Sugerir, aceptar, personalizar y revisar los casos de uso de la preventa (2026-11-08, pedidos 4, 4b, 5 y 8 de Elías;
 * lib/casos-de-uso/personalizar.ts y lib/exploraciones/personalizar-pedido.ts).
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import datos from "./actividades-de-los-casos.json";
import { leerActividades } from "./actividades";
import { actividadesPorDefecto, bibliotecaLigera } from "./armado";
import { casoDeLaPreventa, casosParaLasAreas, catalogoParaElAgente } from "./en-la-preventa";
import {
  huellaDeLoQueLee,
  laPersonalizacionSeUsaSola,
  MAX_LINEAS_DE_CAMBIOS,
  nadaCambio,
  novedadesDesde,
  novedadesEnUnaFrase,
  revisionEnUnaFrase,
  sePersonalizaAlAceptar,
  validarCambiosDelAgente,
  validarRevisionDelAgente,
  vuelveASugeridos,
} from "./personalizar";
import { pedidoDeCasos, type ContextoDeCasos } from "@/lib/exploraciones/agente-pedido";
import {
  casoPersonalizado,
  conLaVersionPersonalizada,
  idsPorNombres,
  leerLaPersonalizacion,
  leerLaRevision,
  pedidoDePersonalizar,
  type ContextoDePersonalizar,
} from "@/lib/exploraciones/personalizar-pedido";
import {
  aplicarOperaciones,
  contenidoVacio,
  idDelItem,
  propuestaVacia,
  propuestaVigente,
  type CasoDeUsoElegido,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type Validez,
} from "@/lib/exploraciones/contenido";
import { leerPropuesta, VALIDADOR_ESTRICTO } from "@/lib/exploraciones/esquemas";
import { casosElegidosParaLaPropuesta } from "@/lib/exploraciones/para-la-propuesta";

const TODO = leerActividades(datos);
const BIBLIOTECA = bibliotecaLigera(TODO.biblioteca);
const AHORA = new Date("2026-11-08T15:00:00.000Z");
const FICHA = TODO.casos.find((c) => c.id === "sistematiza-ventas")!;
const DEL_CATALOGO = casoDeLaPreventa("cat-sistematiza-ventas")!;

describe("las líneas de «qué cambió» (pedido 5: un resumen corto, no toda la justificación)", () => {
  it("hasta tres, cortas, sin repetirse y con las cifras que no salieron del cliente marcadas", () => {
    const lineas = validarCambiosDelAgente(
      ["Sin importar datos: ya usan HubSpot.", "sin importar datos: ya usan hubspot.", "Dos capacitaciones: son 2 equipos.", "Ahorra 500 horas al año.", "Una cuarta línea", 7],
      "Usan HubSpot desde hace un año.",
    );
    expect(lineas).toHaveLength(MAX_LINEAS_DE_CAMBIOS);
    expect(lineas[0]).toBe("Sin importar datos: ya usan HubSpot.");
    expect(lineas[2]).toMatch(/Ojo: hay cifras que no salieron del cliente/);
    expect(validarCambiosDelAgente(["x".repeat(400)], "")[0].length).toBeLessThanOrEqual(221);
    expect(validarCambiosDelAgente("no es lista", "")).toEqual([]);
  });
});

describe("aceptar, personalizar y quitar", () => {
  it("se personaliza solo al aceptarlo si no viene personalizado ni lo tocó el vendedor", () => {
    expect(sePersonalizaAlAceptar({})).toBe(true);
    expect(sePersonalizaAlAceptar({ personalizado: { en: AHORA.toISOString(), cambios: ["x"] } })).toBe(false);
    expect(sePersonalizaAlAceptar({ aMano: true })).toBe(false);
    expect(sePersonalizaAlAceptar({ armado: AHORA.toISOString() })).toBe(false);
    expect(laPersonalizacionSeUsaSola({})).toBe(true);
    expect(laPersonalizacionSeUsaSola({ aMano: true })).toBe(false);
    expect(laPersonalizacionSeUsaSola(undefined)).toBe(false);
  });

  it("vuelve a los sugeridos el que propuso el agente; el elegido a mano del catálogo, no", () => {
    expect(vuelveASugeridos("ia-123", {})).toBe(true);
    expect(vuelveASugeridos("cat-sistematiza-ventas", { descripcion: "Lo que consigue" })).toBe(true);
    expect(vuelveASugeridos("cat-sistematiza-ventas", { plan: { paso: 1 } })).toBe(true);
    expect(vuelveASugeridos("cat-sistematiza-ventas", {})).toBe(false);
    // Elegido a mano del catálogo y después personalizado: tampoco (la personalización le pone su «para Ventas»).
    expect(vuelveASugeridos("cat-sistematiza-ventas", { paraVentas: { porQue: "La ficha", comoSeArma: "x" } } as never)).toBe(false);
  });
});

describe("revisar: dice qué cambió, sin tocar lo elegido", () => {
  const YA = [
    { useCaseId: "cat-a", titulo: "A", elegido: true },
    { useCaseId: "ia-b", titulo: "B", elegido: false },
  ];

  it("solo casos que ya estaban, uno por caso, con veredicto y motivo", () => {
    const r = validarRevisionDelAgente(
      [
        { id: "cat-a", veredicto: "cambia", motivo: "Ahora venden también por WhatsApp." },
        { id: "cat-a", veredicto: "ya_no", motivo: "Repetido" },
        { id: "otro", veredicto: "cambia", motivo: "No estaba" },
        { id: "ia-b", veredicto: "tal vez", motivo: "Veredicto que no existe" },
        { id: "ia-b", veredicto: "ya_no", motivo: "" },
      ],
      YA,
      "",
    );
    expect(r).toEqual([{ useCaseId: "cat-a", titulo: "A", elegido: true, veredicto: "cambia", motivo: "Ahora venden también por WhatsApp." }]);
  });

  it("«nada cambió» cuando no hay nuevos ni cambios; si no, lo cuenta en una frase", () => {
    expect(nadaCambio({ nuevos: [], cambios: [] })).toBe(true);
    expect(revisionEnUnaFrase({ nuevos: [], cambios: [] })).toMatch(/^Nada cambió/);
    const frase = revisionEnUnaFrase({
      nuevos: ["X"],
      cambios: [
        { useCaseId: "cat-a", titulo: "A", elegido: true, veredicto: "cambia", motivo: "m" },
        { useCaseId: "ia-b", titulo: "B", elegido: false, veredicto: "ya_no", motivo: "m" },
      ],
    });
    expect(frase).toBe("1 caso nuevo sugerido, 1 caso cambiaría, 1 ya no parece hacer falta. Lo elegido no se tocó.");
  });

  it("el pedido de casos con «revisar» pide la revisión y manda los que ya están con su id; sin él, no", () => {
    const ctx: ContextoDeCasos = {
      empresa: "Centauro",
      edicion: "escala general",
      areas: [{ id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", nombre: "Proceso" }] }],
      exploracion: "Reciben 1.200 tickets por WhatsApp.",
      yaEstan: ["A"],
      descartados: [],
      catalogo: casosParaLasAreas(["1"]),
    };
    const sin = pedidoDeCasos(ctx);
    const props = (sin.tools![0] as Anthropic.Messages.Tool).input_schema.properties as Record<string, unknown>;
    expect(props.revision).toBeUndefined();
    // Sugerir ya no arma actividades: la personalización las arma al aceptar.
    expect(JSON.stringify(sin)).not.toContain("BIBLIOTECA DE ACTIVIDADES");
    const con = pedidoDeCasos({ ...ctx, revisar: [{ useCaseId: "cat-a", titulo: "A", elegido: true, porQue: "Porque sí" }] });
    const tool = con.tools![0] as Anthropic.Messages.Tool;
    expect((tool.input_schema.properties as Record<string, unknown>).revision).toBeDefined();
    expect(tool.input_schema.required).toContain("revision");
    const cuerpo = JSON.stringify(con.messages);
    expect(cuerpo).toContain("PARA REVISAR");
    expect(cuerpo).toContain("[cat-a] A (elegido por el vendedor)");
    expect(con.system).toContain("REVISAR");

    const respuesta = {
      content: [{ type: "tool_use", id: "t", name: "proponer_casos", input: { casos: [], revision: [{ id: "cat-a", veredicto: "ya_no", motivo: "Ya lo resolvieron con otra herramienta." }] } }],
    } as unknown as Anthropic.Messages.Message;
    expect(leerLaRevision(respuesta, { ...ctx, revisar: [{ useCaseId: "cat-a", titulo: "A", elegido: true, porQue: "" }] })).toHaveLength(1);
    expect(leerLaRevision(respuesta, ctx)).toEqual([]);
  });
});

describe("lo nuevo desde la última mirada (pedido 4b: proactivo, sin correr solo)", () => {
  const ultima = { en: "2026-11-05T12:00:00.000Z", huella: "abc" };

  it("cuenta las reuniones de después y si cambió la huella; sin nada nuevo, null", () => {
    const antes = Date.parse("2026-11-04T12:00:00.000Z");
    const despues = Date.parse("2026-11-06T12:00:00.000Z");
    expect(novedadesDesde({ ultima, huellaDeHoy: "abc", fechasDeReuniones: [antes] })).toBeNull();
    expect(novedadesDesde({ ultima, huellaDeHoy: "abc", fechasDeReuniones: [antes, despues] })).toEqual({ desde: ultima.en, reuniones: 1, cambioLoQueSeSabe: false });
    expect(novedadesDesde({ ultima, huellaDeHoy: "xyz", fechasDeReuniones: [] })).toEqual({ desde: ultima.en, reuniones: 0, cambioLoQueSeSabe: true });
    // Una mirada sin huella (de antes): solo cuentan las reuniones.
    expect(novedadesDesde({ ultima: { ...ultima, huella: "" }, huellaDeHoy: "xyz", fechasDeReuniones: [] })).toBeNull();
    // El agente nunca miró: el paso ya invita a sugerir.
    expect(novedadesDesde({ ultima: null, huellaDeHoy: "xyz", fechasDeReuniones: [despues] })).toBeNull();
    expect(novedadesEnUnaFrase({ reuniones: 2, cambioLoQueSeSabe: true })).toBe(
      "Desde la última vez que el agente miró los casos se leyeron 2 reuniones nuevas y cambió la escala o lo que se sabe del cliente.",
    );
  });

  it("la huella no depende del orden de las áreas y cambia con lo que se sabe", () => {
    expect(huellaDeLoQueLee("texto", ["1", "2"])).toBe(huellaDeLoQueLee("texto", ["2", "1"]));
    expect(huellaDeLoQueLee("texto", ["1"])).not.toBe(huellaDeLoQueLee("texto nuevo", ["1"]));
  });
});

describe("el pedido de personalizar y lo que se lee de él", () => {
  const ctx: ContextoDePersonalizar = {
    empresa: "Centauro",
    caso: { useCaseId: "cat-sistematiza-ventas", titulo: DEL_CATALOGO.titulo, descripcion: "Ven cada negocio sin preguntar.", porQue: "Hoy llevan las ventas en Excel.", area: "Ventas" },
    ficha: { texto: catalogoParaElAgente([DEL_CATALOGO]), actividades: actividadesPorDefecto(FICHA) },
    actuales: null,
    biblioteca: BIBLIOTECA,
    exploracion: "Reciben 1.200 tickets al mes.",
    interno: "## Lo que dijo cada reunión\n- Kickoff: tienen dos equipos de venta.",
    reuniones: "- Reunión de diagnóstico (5 nov 2026): usan HubSpot desde 2024.",
    instrucciones: "",
  };
  const respuesta = (input: Record<string, unknown>) =>
    ({ content: [{ type: "tool_use", id: "t", name: "personalizar_caso", input }] }) as unknown as Anthropic.Messages.Message;

  it("manda la ficha con sus actividades, la biblioteca, lo interno y las reuniones, y obliga a las de la biblioteca", () => {
    const p = pedidoDePersonalizar(ctx);
    const cuerpo = JSON.stringify(p.messages);
    expect(cuerpo).toContain("LA FICHA DEL CATÁLOGO");
    expect(cuerpo).toContain("usan HubSpot desde 2024");
    expect(cuerpo).toContain("tienen dos equipos de venta");
    expect(cuerpo).toContain(`[${BIBLIOTECA[0].id}]`);
    const tool = p.tools![0] as Anthropic.Messages.Tool;
    const acts = (tool.input_schema.properties as { actividades: { items: { properties: { actividadId: { enum: string[] } } } } }).actividades;
    expect(acts.items.properties.actividadId.enum).toEqual(BIBLIOTECA.map((a) => a.id));
    expect(tool.input_schema.required).toEqual(expect.arrayContaining(["actividades", "cambios", "argumento"]));
  });

  it("descarta lo que no es de la biblioteca, valida el valor y conserva el porqué del caso", () => {
    const primera = ctx.ficha!.actividades[0];
    const lo = leerLaPersonalizacion(
      respuesta({
        actividades: [
          { actividadId: primera.actividadId, nombre: "Configurar el pipeline de Centauro", veces: 1 },
          { actividadId: "no-existe", nombre: "Inventada", veces: 1 },
        ],
        cambios: ["Sin importar datos: ya usan HubSpot desde 2024."],
        comoSeArma: "Solo la configuración: el resto ya lo tienen.",
        palanca: "Tiempo del equipo",
        argumento: "Pierden horas buscando en Excel.",
        numeros: [{ dato: "Reciben 1.200 tickets al mes", fuente: "Metas" }, { dato: "Pierden 300 horas", fuente: "inventado" }],
        falta: ["¿Cuántas horas al mes?"],
      }),
      ctx,
      AHORA,
    );
    expect(lo.actividades.map((a) => a.actividadId)).toEqual([primera.actividadId]);
    expect(lo.personalizado).toEqual({ en: AHORA.toISOString(), cambios: ["Sin importar datos: ya usan HubSpot desde 2024."] });
    expect(lo.paraVentas?.porQue).toBe("Hoy llevan las ventas en Excel.");
    expect(lo.valorDeVenta?.numeros.map((n) => n.dato)).toEqual(["Reciben 1.200 tickets al mes"]);
    expect(lo.valorDeVenta?.falta).toContain("Confirmar con el cliente: Pierden 300 horas");
  });

  it("un id de la biblioteca que se cuela en el texto sale con su nombre (simulacro con Centauro)", () => {
    const limpiar = BIBLIOTECA.find((a) => a.id === "limpiar-los-datos")!;
    expect(idsPorNombres("Se agrega limpiar-los-datos: hay duplicados.", BIBLIOTECA)).toBe(`Se agrega «${limpiar.nombre}»: hay duplicados.`);
    expect(idsPorNombres("Sin ids aquí, ni kickoff-x", BIBLIOTECA)).toBe("Sin ids aquí, ni kickoff-x");
    const lo = leerLaPersonalizacion(respuesta({ actividades: [], cambios: ["Se agrega limpiar-los-datos."], comoSeArma: "Lleva limpiar-los-datos." }), ctx, AHORA);
    expect(lo.personalizado.cambios[0]).toBe(`Se agrega «${limpiar.nombre}».`);
    expect(lo.paraVentas?.comoSeArma).toBe(`Lleva «${limpiar.nombre}».`);
  });

  it("sin actividades válidas quedan las de la ficha, y sin líneas las calcula el código frente a ella", () => {
    const lo = leerLaPersonalizacion(respuesta({ actividades: [], cambios: [] }), ctx, AHORA);
    expect(lo.actividades).toEqual(ctx.ficha!.actividades);
    expect(lo.personalizado.cambios).toEqual(["Lleva las actividades de la ficha del catálogo, sin cambios."]);
  });

  it("el caso personalizado guarda lo que ve el cliente igual y deja de ser «a mano»", () => {
    const antes: CasoDeUsoElegido = {
      titulo: "Ordena tu venta",
      areaId: "1",
      descripcion: "Lo que consigue",
      razon: "La razón",
      plan: { paso: 2, despuesDe: "Después del orden" },
      aMano: true,
      paraVentas: { porQue: "Por qué de la sugerencia", comoSeArma: "viejo" },
    };
    const lo = leerLaPersonalizacion(respuesta({ actividades: [], cambios: ["Una línea."], comoSeArma: "Nuevo cómo." }), ctx, AHORA);
    const despues = casoPersonalizado(antes, lo);
    expect(despues).toMatchObject({ titulo: antes.titulo, descripcion: antes.descripcion, razon: antes.razon, plan: antes.plan });
    expect(despues.aMano).toBeUndefined();
    expect(despues.paraVentas).toEqual({ porQue: "Por qué de la sugerencia", comoSeArma: "Nuevo cómo." });
    expect(despues.personalizado?.cambios).toEqual(["Una línea."]);
    expect(despues.armado).toBe(AHORA.toISOString());
  });
});

describe("quitar un elegido lo devuelve a los sugeridos (pedido 4)", () => {
  const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "9" };
  const quien = { por: "vendedor@smarteam.cr", en: AHORA.toISOString() };
  const estado = (casosDeUso: Record<string, CasoDeUsoElegido>, items: ItemPropuesto[] = []): EstadoDeExploracion => ({
    contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "I", fuente: "reunion" } }, casosDeUso },
    propuesta: { ...propuestaVacia(), items },
    areas: ["1"],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
  });
  const aplicar = (e: EstadoDeExploracion, ops: Parameters<typeof aplicarOperaciones>[1]) => {
    const r = aplicarOperaciones(e, ops, VALIDEZ, VALIDADOR_ESTRICTO, quien);
    if (!r.ok) throw new Error(r.error);
    return r.estado;
  };
  const DEL_AGENTE: CasoDeUsoElegido = {
    titulo: "Ordena tu venta",
    areaId: "1",
    descripcion: "Lo que consigue",
    razon: "Hoy llevan todo en Excel",
    paraVentas: { porQue: "Hoy llevan todo en Excel", comoSeArma: "" },
    personalizado: { en: AHORA.toISOString(), cambios: ["Sin importar datos."] },
    armado: AHORA.toISOString(),
  };

  it("vuelve con su porqué y lo personalizado, y aceptarlo de nuevo no lo vuelve a personalizar", () => {
    const e = aplicar(estado({ "cat-sistematiza-ventas": DEL_AGENTE }), [{ op: "quitarCaso", useCaseId: "cat-sistematiza-ventas" }]);
    expect(e.contenido.casosDeUso).toEqual({});
    const vigentes = propuestaVigente(e).filter((it) => it.destino.tipo === "casoDeUso");
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].valor).toEqual(DEL_AGENTE);
    expect(vigentes[0].razon).toBe(DEL_AGENTE.razon);
    expect(sePersonalizaAlAceptar(vigentes[0].valor as CasoDeUsoElegido)).toBe(false);
    // Sobrevive a guardarse y leerse.
    expect(leerPropuesta(JSON.parse(JSON.stringify(e.propuesta))).items).toHaveLength(1);
    // Y se vuelve a aceptar igual que cualquier sugerencia.
    const otraVez = aplicar(e, [{ op: "usar", itemId: vigentes[0].id, valor: vigentes[0].valor }]);
    expect(otraVez.contenido.casosDeUso["cat-sistematiza-ventas"]).toEqual(DEL_AGENTE);
  });

  it("la versión nueva que había al lado se va con él", () => {
    const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId: "ia-1" };
    const nueva = { ...DEL_AGENTE, personalizado: { en: AHORA.toISOString(), cambios: ["Otra"] } };
    const it: ItemPropuesto = { id: idDelItem(destino, nueva), destino, valor: nueva, fuentes: [], corridaId: "r", en: AHORA.toISOString() };
    const e = aplicar(estado({ "ia-1": DEL_AGENTE }, [it]), [{ op: "quitarCaso", useCaseId: "ia-1" }]);
    const items = e.propuesta.items.filter((x) => x.destino.tipo === "casoDeUso");
    expect(items).toHaveLength(1);
    expect(items[0].valor).toEqual(DEL_AGENTE);
  });

  it("con «descartar» sale del todo: lápida y título descartado; el elegido a mano del catálogo no vuelve", () => {
    const e = aplicar(estado({ "ia-1": DEL_AGENTE }), [{ op: "quitarCaso", useCaseId: "ia-1", descartar: true }]);
    expect(propuestaVigente(e).filter((it) => it.destino.tipo === "casoDeUso")).toHaveLength(0);
    expect(e.contenido.casosDescartados).toContain("Ordena tu venta");
    const aMano = aplicar(estado({ "cat-sistematiza-ventas": { titulo: "Sistematiza", areaId: "1", razon: "La ficha" } }), [
      { op: "quitarCaso", useCaseId: "cat-sistematiza-ventas" },
    ]);
    expect(aMano.contenido.casosDeUso).toEqual({});
    expect(aMano.propuesta.items).toHaveLength(0);
  });

  it("«Deshacer» de «Quitar» no deja una copia escondida en sugeridos", () => {
    const quitado = aplicar(estado({ "ia-1": DEL_AGENTE }), [{ op: "quitarCaso", useCaseId: "ia-1" }]);
    const deshecho = aplicar(quitado, [{ op: "casoDeUso", useCaseId: "ia-1", valor: DEL_AGENTE }]);
    expect(deshecho.contenido.casosDeUso["ia-1"]).toEqual(DEL_AGENTE);
    expect(deshecho.propuesta.items.filter((it) => it.destino.tipo === "casoDeUso")).toHaveLength(0);
  });

  it("la versión personalizada se arma sobre el caso de AHORA, y no se guarda si se quitó o se archivó", () => {
    const armar = (c: CasoDeUsoElegido): CasoDeUsoElegido => ({ ...c, personalizado: { en: AHORA.toISOString(), cambios: ["Nueva"] }, armado: AHORA.toISOString() });
    // El vendedor cambió el título mientras el agente trabajaba: se queda.
    const e = estado({ "ia-1": { ...DEL_AGENTE, titulo: "Título cambiado", personalizado: undefined } });
    const r = conLaVersionPersonalizada(e, "ia-1", armar, "run-1", AHORA.toISOString())!;
    expect((r.item.valor as CasoDeUsoElegido).titulo).toBe("Título cambiado");
    expect(r.items.filter((it) => it.destino.tipo === "casoDeUso")).toHaveLength(1);
    expect(r.seUsaSola).toBe(true);
    expect(r.descartadas).toBeNull();
    // Con lápida del mismo id (lo descartó y lo volvió a elegir): se la lleva.
    const conLapida = { ...e, contenido: { ...e.contenido, descartadas: [r.item.id, "otra"] } };
    expect(conLaVersionPersonalizada(conLapida, "ia-1", armar, "run-1", AHORA.toISOString())!.descartadas).toEqual(["otra"]);
    // Editado a mano mientras tanto: queda al lado, no se usa sola.
    expect(conLaVersionPersonalizada(estado({ "ia-1": { ...DEL_AGENTE, aMano: true } }), "ia-1", armar, "r", AHORA.toISOString())!.seUsaSola).toBe(false);
    expect(conLaVersionPersonalizada(estado({}), "ia-1", armar, "r", AHORA.toISOString())).toBeNull();
    expect(conLaVersionPersonalizada({ ...e, archivada: true }, "ia-1", armar, "r", AHORA.toISOString())).toBeNull();
  });

  it("⛔ lo personalizado no llega a la propuesta del cliente", () => {
    const caso: CasoDeUsoElegido = { ...DEL_AGENTE, personalizado: { en: AHORA.toISOString(), cambios: ["CAMBIO_INTERNO"] } };
    const e = estado({ "cat-sistematiza-ventas": caso });
    expect(JSON.stringify(casosElegidosParaLaPropuesta(e.contenido))).not.toContain("CAMBIO_INTERNO");
  });
});
