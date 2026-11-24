/**
 * UNA SOLA CONVERSACIÓN en el chat «Nexus» de la preventa (Elías, 24 nov): lo que la persona cuenta, lo que pregunta y lo
 * que le pide de la cuenta (una tarea, el siguiente paso, la guía) viven en el mismo hilo. Sin base ni IA:
 *   · qué se lee como pedido de la cuenta (y qué NO, para no perder lo que se cuenta);
 *   · que lo de antes sigue igual: contar, preguntar, la cortesía y los botones;
 *   · en qué queda cada lista (viva, aplicada, reemplazada), qué queda pendiente y qué historia ve la mano de la cuenta;
 *   · que la conversación guardada trae lo pedido y cada lista con su estado, junto a lo contado y lo preguntado.
 */
import { describe, expect, it } from "vitest";
import {
  comoSeLee,
  esPedidoDeLaCuenta,
  leerElTurno,
  loQueConto,
  MARCAS_DEL_MENSAJE,
  notaDeLaConversacion,
  paraContarComoNota,
  TOPES,
  pedidoDelTurno,
  rondasDePreguntas,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
} from "./conversacion";
import { LISTA_SIN_ACCESO, leerLaSalida, reconstruirLaConversacion, sinLasReuniones, type MensajeGuardado, type SalidaDeLaVuelta } from "./guardada";
import {
  conLaListaAplicada,
  conLaListaNueva,
  emparejarListas,
  estadosDeLasListas,
  mueveALasDeAntes,
  seGuardaComoNota,
  hablaDeLaGuia,
  leerListaGuardada,
  listaPendiente,
  ventanaParaLaCuenta,
  type ListaEnLaConversacion,
  type ListaGuardada,
} from "./lista";

const persona = (texto: string, es?: MensajeDeLaConversacion["es"]): MensajeDeLaConversacion => ({ de: "persona", texto, ...(es ? { es } : {}) });
const nexus = (texto: string, es?: MensajeDeLaConversacion["es"]): MensajeDeLaConversacion => ({ de: "nexus", texto, ...(es ? { es } : {}) });

describe("qué es un pedido de la cuenta", () => {
  it.each([
    "Crea una tarea para llamar a Ana el viernes",
    "créame una tarea: mandarle la propuesta a Andrés",
    "¿Me puedes crear una tarea para revisar el contrato?",
    "Por favor, agrega una tarea para el lunes",
    "Quiero que agregues dos preguntas a la guía sobre la cobranza",
    "Agrega a la guía una pregunta sobre el ERP",
    "Cambia el siguiente paso: la demo es el jueves",
    "Fija el próximo paso de Ventas para la otra semana",
    "Mueve la T-12 a la próxima semana",
    "Marca la T-7 como hecha",
    "Quítale a la guía la tercera pregunta",
    "Genera el kickoff",
    "Recuérdame llamar a Ana el lunes",
    "Oye Nexus, crea una tarea para escribirle a Juan",
  ])("«%s» es un pedido seguro", (t) => {
    expect(esPedidoDeLaCuenta(t)).toBe(true);
  });

  it.each([
    // El presente de quien cuenta cómo trabaja el cliente se escribe igual que la orden: sin artículo no es seguro.
    "Crea tareas a mano en HubSpot el gerente",
    "Anota que el gerente pidió una tarea por cada cotización",
    "Recuérdame qué dijo Ana del ERP",
    "¿Qué tareas tiene esta cuenta?",
    "La guía de ventas del cliente está desactualizada",
    "Cambian de proveedor cada año",
    "Es importante: crea una tarea por cada lead que entra",
    // «Pasa que…» cuenta lo que pasa (revisión del 24 nov: 7 de 7 salían como pedido).
    "Pasa que el gerente no usa la guía de ventas",
    "Pasa que tienen una tarea pendiente con el banco desde marzo",
    "Cambia que la guía de ventas la arma el gerente",
    "Marca que el siguiente paso lo decide el directorio",
    // «La guía» sola es también la del cliente: solo «a la guía», «de la guía», «preguntas a la guía».
    "Arma la guía de ventas del cliente cada trimestre",
    "Pon la guía de onboarding en el portal, nos pidieron",
    "Pierden unos 40 mil dólares al mes en cartera vencida",
  ])("«%s» no es un pedido seguro", (t) => {
    expect(esPedidoDeLaCuenta(t)).toBe(false);
  });
});

describe("cómo se lee lo último (lo de antes sigue igual)", () => {
  it("un pedido seguro va a la mano de la cuenta, sin la llamada que clasifica", () => {
    expect(comoSeLee([persona("Crea una tarea para llamar a Ana el viernes")])).toBe("pedido");
    // Un pedido seguro gana aunque Nexus haya preguntado algo de lo que se contaba (revisión del 24 nov: iba a la nota).
    expect(comoSeLee([persona("Algo raro"), nexus("¿De qué mes?"), persona("Mueve la T-12 a la próxima semana")])).toBe("pedido");
    // Lo que contesta la pregunta sigue siendo contar.
    expect(comoSeLee([persona("Algo raro"), nexus("¿De qué mes?"), persona("De octubre, creo")])).toBe("contar");
  });

  it("«Hazlo» (pedir) gana, y «Guardarlo como nota» y «¿Era una pregunta?» siguen ganando", () => {
    expect(comoSeLee([persona("Pierden 40 mil al mes")], { pedir: true })).toBe("pedido");
    expect(comoSeLee([persona("Crea una tarea para Ana")], { contar: true })).toBe("contar");
    expect(comoSeLee([persona("Crea una tarea para Ana")], { preguntar: true })).toBe("pregunta");
  });

  it("contar, preguntar y la cortesía, como antes", () => {
    expect(comoSeLee([persona("Es importante: tienen 3 marcas")])).toBe("contar");
    expect(comoSeLee([persona("¿Qué dijo Ana del ERP?")])).toBe("pregunta");
    expect(comoSeLee([persona("gracias")])).toBe("cortesia");
    expect(comoSeLee([persona("Tienen 40 cuentas por gestor")])).toBe("duda");
  });

  it("después de una lista, lo que sigue lo decide el modelo (puede seguir con el pedido), salvo lo seguro", () => {
    const tras = (t: string) => [persona("Crea una tarea para Ana"), nexus("¿Para qué día?", "lista"), persona(t)];
    expect(comoSeLee(tras("el viernes"))).toBe("duda");
    expect(comoSeLee(tras("¿y la de Juan también?"))).toBe("duda");
    expect(comoSeLee(tras("Es importante: tienen 3 marcas"))).toBe("contar");
    expect(comoSeLee(tras("Crea otra tarea para Juan"))).toBe("pedido");
  });
});

describe("el modelo que clasifica", () => {
  const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "Centauro", contexto: "", destinos: [] };
  const lee = (json: unknown, laPregunta: string | null) =>
    leerElTurno({ content: [{ type: "text", text: JSON.stringify(json), citations: null }] }, { destinos: new Set(), valorValido: () => null, loQueDijo: [], puedePreguntar: true, laPregunta });

  it("«pedido» con las palabras de la persona, solo si lo último PUEDE ser un pedido", () => {
    expect(lee({ tipo: "pedido" }, "y otra para el viernes")).toEqual({ tipo: "pedido", pedido: "y otra para el viernes" });
    expect(lee({ tipo: "pedido" }, null)).toMatchObject({ tipo: "listo", cambios: [] });
  });

  it("el pedido de la vuelta ofrece «pedido» y la conversación marca lo pedido y lo de la cuenta", () => {
    const p = pedidoDelTurno(ctx, [persona("Crea una tarea", "pedido"), nexus("Te la dejo en la lista.", "lista"), persona("y otra")], "duda");
    expect(p.system).toContain('{"tipo":"pedido"}');
    const texto = JSON.stringify(p.messages);
    expect(texto).toContain("PERSONA (pidió algo de la cuenta)");
    expect(texto).toContain("NEXUS (sobre la cuenta)");
  });

  it("lo pedido no va a la nota, y lo que contesta la cuenta no es una ronda de preguntas", () => {
    const m = [persona("Pierden 40 mil al mes"), persona("Crea una tarea para Ana", "pedido"), nexus("¿Para cuándo?", "lista")];
    expect(loQueConto(m)).toEqual(["Pierden 40 mil al mes"]);
    expect(notaDeLaConversacion(m)).toBe("Pierden 40 mil al mes");
    expect(rondasDePreguntas(m)).toBe(0);
    expect(MARCAS_DEL_MENSAJE).toEqual(expect.arrayContaining(["pedido", "lista"]));
  });
});

const lista = (id: string, o: Partial<{ ops: number; aplicada: boolean; fallo: boolean; cierre: boolean; texto: string }> = {}): ListaGuardada => {
  const ops = Array.from({ length: o.ops ?? 1 }, (_, k) => ({ nombre: "tarea.crear", entrada: { titulo: `T${id}-${k}`, clientId: "c1" } }));
  return {
    lista: { id, texto: o.texto ?? `Lista ${id}`, lineas: ops.map((x) => `Crear «${(x.entrada as { titulo: string }).titulo}»`), ...(o.cierre ? { cierre: true as const } : {}) },
    operaciones: o.cierre ? [] : ops,
    ...(o.aplicada ? { desenlace: { ok: true, texto: "Listo: 1 tarea creada.", aplicadas: 1 } } : o.fallo ? { desenlace: { ok: false, texto: "No se pudo.", aplicadas: 0 } } : {}),
  };
};

describe("las listas de la conversación", () => {
  it("viva, aplicada, reemplazada o sin cambios, derivado de las vueltas", () => {
    const e = estadosDeLasListas([lista("a"), lista("b", { aplicada: true }), lista("c", { ops: 0 }), lista("d", { fallo: true })]);
    expect(Object.fromEntries(e)).toEqual({ a: "reemplazada", b: "aplicada", c: "sin-cambios", d: "viva" });
    // Una que solo contestó no reemplaza a la anterior; un cierre (soltó lo pendiente) sí.
    expect(estadosDeLasListas([lista("a"), lista("b", { ops: 0 })]).get("a")).toBe("viva");
    expect(estadosDeLasListas([lista("a"), lista("b", { ops: 0, cierre: true })]).get("a")).toBe("soltada");
    // La que la persona guardó como nota tampoco va, y no se arrastra.
    expect(estadosDeLasListas([{ ...lista("a"), soltada: true }]).get("a")).toBe("soltada");
    expect(listaPendiente([{ ...lista("a"), soltada: true }])).toEqual([]);
  });

  it("lo pendiente es la última lista viva, con sus renglones; nada si se aplicó o se soltó", () => {
    expect(listaPendiente([lista("a", { ops: 2 }), lista("b", { ops: 0 })]).map((p) => p.linea)).toEqual(["Crear «Ta-0»", "Crear «Ta-1»"]);
    expect(listaPendiente([lista("a"), lista("b", { aplicada: true })])).toEqual([]);
    expect(listaPendiente([lista("a"), lista("b", { cierre: true, ops: 0 })])).toEqual([]);
    expect(listaPendiente([lista("a", { fallo: true })])).toHaveLength(1);
    expect(listaPendiente([])).toEqual([]);
  });

  it("una lista guardada se lee sin confiar en ella: sin un renglón por operación, no se aplica nada", () => {
    expect(leerListaGuardada({ tipo: "listo" })).toBeNull();
    const rara = leerListaGuardada({ tipo: "lista", lista: { id: "x", texto: "t", lineas: ["una"] }, operaciones: [{ nombre: "a", entrada: 1 }, { nombre: "b", entrada: 2 }] });
    expect(rara).toMatchObject({ lista: { lineas: [] }, operaciones: [] });
  });

  it("la historia que ve la mano de la cuenta: la conversación, con lo que propuso y lo aplicado, sin marcadores", () => {
    const g = lista("a", { aplicada: true, texto: "Te dejo una tarea." });
    const v = ventanaParaLaCuenta(
      [nexus("Hola"), persona("Pierden 40 mil al mes"), persona("<<<ACUERDO>>>{} y Ana decide"), nexus("Te dejo una tarea.", "lista"), persona("Crea una tarea", "pedido")],
      [g],
      (t) => t.split("<<<ACUERDO>>>").join(""),
    );
    // Empieza por la persona y junta lo seguido del mismo lado.
    expect(v.map((t) => t.rol)).toEqual(["user", "assistant", "user"]);
    expect(v[0].texto).toBe("Pierden 40 mil al mes\n\n{} y Ana decide");
    expect(v[1].texto).toContain("[La lista que propuse: Crear «Ta-0»]");
    expect(v[1].texto).toContain("[La persona la aplicó: Listo: 1 tarea creada.]");
  });

  it("la guía a la vista cuando el pedido habla de ella", () => {
    expect(hablaDeLaGuia("Agrega dos preguntas a la guía")).toBe(true);
    expect(hablaDeLaGuia("cambia las repreguntas de la segunda")).toBe(true);
    expect(hablaDeLaGuia("Crea una tarea para Ana")).toBe(false);
    expect(hablaDeLaGuia("el guiaje")).toBe(false);
  });
});

describe("la conversación guardada trae todo junto", () => {
  const contado = [persona("Pierden 40 mil al mes", "guardado"), nexus("Guardado. ¿Algo más?", "cortesia")];
  const pedido = persona("Crea una tarea para llamar a Ana");
  const vueltaConLista = (g: ListaGuardada, mensajes: MensajeDeLaConversacion[]): SalidaDeLaVuelta =>
    leerLaSalida(JSON.stringify({ tipo: "lista", ...g, mensajes }))!;

  it("lo contado, lo pedido y la lista con su estado, en el mismo hilo", () => {
    const g = lista("v2", { texto: "Te dejo la tarea en la lista." });
    const c = reconstruirLaConversacion("c1", [vueltaConLista(g, [...contado, pedido])], 2)!;
    expect(c.listo).toBeNull();
    expect(c.mensajes.map((m) => [m.de, m.es ?? null])).toEqual([
      ["persona", "guardado"],
      ["nexus", "cortesia"],
      ["persona", "pedido"],
      ["nexus", "lista"],
    ]);
    expect(c.mensajes[3].lista).toEqual({ id: "v2", texto: "Te dejo la tarea en la lista.", lineas: ["Crear «Tv2-0»"], estado: "viva" });
    // Las operaciones nunca salen al navegador.
    expect(JSON.stringify(c)).not.toContain("tarea.crear");
  });

  it("una lista anterior vuelve con su estado (aplicada con lo que dejó; reemplazada si otra la lleva)", () => {
    const a = lista("v1", { texto: "Primera lista.", aplicada: true });
    const b = lista("v2", { texto: "Segunda lista." });
    const c3 = lista("v3", { texto: "Tercera lista." });
    const m1 = [pedido];
    const m2 = [...m1, nexus("Primera lista.", "lista"), persona("Crea otra tarea para Juan", "pedido")];
    const m3 = [...m2, nexus("Segunda lista.", "lista"), persona("Y una para Pedro")];
    const c = reconstruirLaConversacion("c1", [vueltaConLista(a, m1), vueltaConLista(b, m2), vueltaConLista(c3, m3)], 3)!;
    const listas = c.mensajes.filter((m) => m.lista).map((m) => [m.lista!.id, m.lista!.estado, m.lista!.desenlace ?? null]);
    expect(listas).toEqual([
      ["v1", "aplicada", "Listo: 1 tarea creada."],
      ["v2", "reemplazada", null],
      ["v3", "viva", null],
    ]);
  });

  it("para quien hoy no tiene acceso a la cuenta, lo que preparó la mano de la cuenta no vuelve", () => {
    const g = lista("v2", { texto: "Ana dijo en la reunión del martes que…" });
    const c = sinLasReuniones(reconstruirLaConversacion("c1", [vueltaConLista(g, [pedido])], 1)!);
    // Sin el texto ni los renglones, pero con su vuelta: cada mensaje sigue con su lista al volver.
    expect(c.mensajes[1]).toEqual({ de: "nexus", es: "lista", texto: LISTA_SIN_ACCESO, vuelta: "v2" });
  });
});

describe("la pantalla suma la lista al mismo hilo", () => {
  /** Lo que escribe la persona, como lo guarda la pantalla (puede llevar una lista). */
  const enPantalla = (texto: string): MensajeGuardado => ({ de: "persona", texto });
  const viva = (id: string, lineas: string[] = ["Crear «Llamar a Ana»"]): ListaEnLaConversacion => ({ id, texto: `Lista ${id}`, lineas, estado: lineas.length ? "viva" : "sin-cambios" });

  it("lo pedido queda marcado, la lista va al final y la viva de antes se apaga si la nueva la lleva", () => {
    const m1 = conLaListaNueva([enPantalla("Crea una tarea para Ana")], viva("v1"));
    expect(m1.map((m) => [m.de, m.es])).toEqual([
      ["persona", "pedido"],
      ["nexus", "lista"],
    ]);
    const m2 = conLaListaNueva([...m1, enPantalla("y otra para Juan")], viva("v2", ["Crear «Llamar a Ana»", "Crear «Escribirle a Juan»"]));
    expect(m2.filter((m) => m.lista).map((m) => [m.lista!.id, m.lista!.estado])).toEqual([
      ["v1", "reemplazada"],
      ["v2", "viva"],
    ]);
  });

  it("una que solo contestó no apaga la de antes; un cierre (soltó lo pendiente) sí", () => {
    const m1 = conLaListaNueva([enPantalla("Crea una tarea para Ana")], viva("v1"));
    const soloContesto = conLaListaNueva([...m1, enPantalla("¿y eso cuándo vence?")], viva("v2", []));
    expect(soloContesto.find((m) => m.lista?.id === "v1")?.lista?.estado).toBe("viva");
    const cierre = conLaListaNueva([...m1, enPantalla("ya no hace falta")], { ...viva("v2", []), cierre: true, descartadas: ["Crear «Llamar a Ana»"] });
    // La misma regla que el servidor: soltada, no «sigue abajo» (abajo no hay renglones).
    expect(cierre.find((m) => m.lista?.id === "v1")?.lista?.estado).toBe("soltada");
  });

  it("lo aplicado reemplaza solo esa lista", () => {
    const m = conLaListaNueva([enPantalla("Crea una tarea para Ana")], viva("v1"));
    const aplicada = conLaListaAplicada(m, { ...viva("v1"), estado: "aplicada", desenlace: "Listo: 1 tarea creada." });
    expect(aplicada[1].lista).toMatchObject({ estado: "aplicada", desenlace: "Listo: 1 tarea creada." });
    expect(aplicada[0]).toEqual(m[0]);
  });
});

describe("lo que encontró la revisión del 24 nov", () => {
  it("dos listas con el MISMO texto no se pisan al volver: cada mensaje con la suya, por su vuelta", () => {
    const igual = "Te dejé el cambio en la lista.";
    const ana = lista("v1", { texto: igual, aplicada: true });
    const juan = lista("v2", { texto: igual });
    ana.lista.lineas = ["Crear «Llamar a Ana»"];
    juan.lista.lineas = ["Crear «Escribirle a Juan»"];
    const m1 = [persona("Crea una tarea para llamar a Ana")];
    const m2 = [...m1, { ...nexus(igual, "lista"), vuelta: "v1" }, persona("Crea una tarea para escribirle a Juan")];
    const vuelta = (g: ListaGuardada, mensajes: MensajeDeLaConversacion[]) => leerLaSalida(JSON.stringify({ tipo: "lista", ...g, mensajes }))!;
    const c = reconstruirLaConversacion("c1", [vuelta(ana, m1), vuelta(juan, m2)], 2)!;
    const listas = c.mensajes.filter((m) => m.lista).map((m) => [m.lista!.id, m.lista!.estado, m.lista!.lineas[0]]);
    expect(listas).toEqual([
      ["v1", "aplicada", "Crear «Llamar a Ana»"],
      ["v2", "viva", "Crear «Escribirle a Juan»"],
    ]);
    // Al volver, cada mensaje lleva su vuelta: la próxima vez viaja con ella.
    expect(c.mensajes.filter((m) => m.lista).map((m) => m.vuelta)).toEqual(["v1", "v2"]);
  });

  it("sin la vuelta en el mensaje (un cajón de antes), se empareja por orden desde el final, nunca por el texto", () => {
    const igual = "Te dejé el cambio en la lista.";
    const a = lista("v1", { texto: igual });
    const b = lista("v2", { texto: igual });
    const m = [persona("x"), nexus(igual, "lista"), persona("y"), nexus(igual, "lista")];
    const e = emparejarListas(m, [a, b]);
    expect([e.get(1)?.lista.id, e.get(3)?.lista.id]).toEqual(["v1", "v2"]);
    // Y la historia de la mano de la cuenta lleva lo de cada una (la aplicada, con lo que dejó).
    const v = ventanaParaLaCuenta(m, [{ ...a, desenlace: { ok: true, texto: "Listo: 1 tarea creada.", aplicadas: 1 } }, b], (t) => t);
    expect(v[1].texto).toContain("[La persona la aplicó: Listo: 1 tarea creada.]");
    expect(v[3].texto).toContain("[La lista que propuse: Crear «Tv2-0»]");
    expect(v[3].texto).not.toContain("aplicó");
  });

  it("una vuelta que el navegador no conoce no le roba la lista a un mensaje que sí trae la suya", () => {
    const a = lista("v1", { texto: "Una." });
    const b = lista("v2", { texto: "Otra." });
    const m = [persona("x"), { ...nexus("Una.", "lista"), vuelta: "v1" }];
    expect(emparejarListas(m, [a, b]).get(1)?.lista.id).toBe("v1");
  });

  it("aplicada a medias: guarda qué renglones se aplicaron", () => {
    const g = leerListaGuardada({
      tipo: "lista",
      lista: { id: "v1", texto: "t", lineas: ["a", "b", "c"] },
      operaciones: [{ nombre: "x", entrada: 1 }, { nombre: "x", entrada: 2 }, { nombre: "x", entrada: 3 }],
      desenlace: { ok: true, texto: "Listo.", aplicadas: 2, renglones: [0, 2, 9] },
    })!;
    expect(g.desenlace?.renglones).toEqual([0, 2]);
  });

  it("«Guardarlo como nota» también debajo de lo que contestó la cuenta, si no se aplicó nada", () => {
    const m = [persona("Pasa que tienen una tarea con el banco", "pedido"), nexus("Te dejo la tarea.", "lista")];
    expect(paraContarComoNota(m, 1)).toEqual({ base: [], texto: "Pasa que tienen una tarea con el banco" });
    expect(seGuardaComoNota({ id: "v", texto: "t", lineas: ["a"], estado: "viva" })).toBe(true);
    expect(seGuardaComoNota({ id: "v", texto: "t", lineas: [], estado: "sin-cambios" })).toBe(true);
    expect(seGuardaComoNota({ id: "v", texto: "t", lineas: ["a"], estado: "aplicada" })).toBe(false);
  });

  it("la pantalla y el servidor usan la MISMA regla para mover las listas de antes", () => {
    expect(mueveALasDeAntes({ lineas: ["a"] })).toBe("reemplazada");
    expect(mueveALasDeAntes({ lineas: [], cierre: true })).toBe("soltada");
    expect(mueveALasDeAntes({ lineas: [] })).toBeNull();
    // Un cierre con renglones no existe: lo que propone, propone.
    expect(leerListaGuardada({ tipo: "lista", lista: { id: "v", texto: "t", lineas: ["a"], cierre: true }, operaciones: [{ nombre: "x", entrada: 1 }] })?.lista.cierre).toBeUndefined();
  });

  it("12 vueltas por conversación (Elías, 24 nov), y los mensajes que viajan alcanzan para todas", () => {
    expect(TOPES.turnosPorConversacion).toBe(12);
    expect(TOPES.mensajes).toBeGreaterThanOrEqual(TOPES.turnosPorConversacion * 2);
  });
});

describe("lo que encontró la segunda vuelta de la revisión (24 nov)", () => {
  it("«Programa de…», «Agenda del…» son el sustantivo, no la orden; al contestar a Nexus, la orden va pegada a su objeto", () => {
    expect(esPedidoDeLaCuenta("Programa de referidos: el siguiente paso que quieren es lanzarlo en enero")).toBe(false);
    expect(esPedidoDeLaCuenta("Agenda del gerente: la tarea de limpiar la base queda para marzo")).toBe(false);
    const trasPregunta = (t: string) => comoSeLee([persona("Pierden 40 mil"), nexus("¿De qué iniciativa es esa cifra?"), persona(t)]);
    expect(trasPregunta("Programa de referidos: el siguiente paso que quieren es lanzarlo en enero")).toBe("contar");
    expect(trasPregunta("Cambia mucho, pero el siguiente paso lo define el directorio")).toBe("contar");
    expect(trasPregunta("Crea una tarea para revisarlo con Ana")).toBe("pedido");
    // Sin pregunta de Nexus delante, la ventana sigue siendo la de siempre.
    expect(esPedidoDeLaCuenta("Crea para el lunes en la mañana una tarea")).toBe(true);
  });

  it("no se ofrece guardar como nota una lista que lleva lo pendiente de otra (soltarla se lo llevaría)", () => {
    expect(seGuardaComoNota({ id: "v", texto: "t", lineas: ["a", "b"], arrastradas: [0], estado: "viva" })).toBe(false);
    expect(seGuardaComoNota({ id: "v", texto: "t", lineas: ["b"], estado: "viva" })).toBe(true);
  });
});
