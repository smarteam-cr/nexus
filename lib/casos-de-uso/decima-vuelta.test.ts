/**
 * Casos de uso, décima vuelta (2026-11-08, Elías con Centauro Solutions): títulos claros, una sola lista en el orden que
 * sugiere el agente, el reparto de horas de cada actividad y «Mejorar con IA» de las actividades.
 * lib/casos-de-uso/orden.ts, mejorar.ts y armado.ts › repartoDeLaActividad; lib/exploraciones/orden-pedido.ts y
 * mejorar-pedido.ts.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import datos from "./actividades-de-los-casos.json";
import { leerActividades } from "./actividades";
import { bibliotecaLigera, horasDeLaActividad, repartoDeLaActividad, repartoDelCaso, type ActividadDelCaso } from "./armado";
import { casosParaLasAreas } from "./en-la-preventa";
import { aplicarMejora, diferenciaDeActividades, leerPropuestaDeMejora, MAX_SUGERIDAS, resumenDeLaMejora } from "./mejorar";
import { enElOrden, REGLAS_DEL_TITULO, tituloSoloDelCaso, validarOrdenDelAgente, type CandidatoAlOrden } from "./orden";
import { pedidoDeCasos, type ContextoDeCasos } from "@/lib/exploraciones/agente-pedido";
import { candidatosAlOrden } from "@/lib/exploraciones/casos-de-uso";
import { idDelItem, type CasoDeUsoElegido, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { ESCALA_DE_PRUEBA, estadoDePrueba, todasEn } from "@/lib/exploraciones/escala-de-prueba.test-helpers";
import { leerPropuesta } from "@/lib/exploraciones/esquemas";
import { leerLaMejora, pedidoDeMejorar, type ContextoDeMejorar } from "@/lib/exploraciones/mejorar-pedido";
import { leerElOrden, pedidoDelOrden, type ContextoDelOrden } from "@/lib/exploraciones/orden-pedido";

const TODO = leerActividades(datos);
const BIBLIOTECA = bibliotecaLigera(TODO.biblioteca);
const POR_ID = new Map(BIBLIOTECA.map((a) => [a.id, a]));
const AHORA = new Date("2026-11-08T15:00:00.000Z");
const respuesta = (name: string, input: unknown) => ({ content: [{ type: "tool_use", id: "t", name, input }] }) as unknown as Anthropic.Messages.Message;
const act = (actividadId: string, veces = 1, extra: Partial<ActividadDelCaso> = {}): ActividadDelCaso => ({ actividadId, nombre: POR_ID.get(actividadId)?.nombre ?? actividadId, veces, ...extra });
const UNA_QUE_SE_REPITE = BIBLIOTECA.find((a) => a.seRepite && !a.horasPendientes && a.comparte === "no")!;
const UNA_QUE_NO = BIBLIOTECA.find((a) => !a.seRepite && !a.horasPendientes && a.id !== "kickoff")!;

describe("1 · títulos claros", () => {
  it("las reglas del título traen ejemplos buenos y malos, con los dos de Centauro que no se entendían", () => {
    expect(REGLAS_DEL_TITULO).toContain("Buenos:");
    expect(REGLAS_DEL_TITULO).toContain("Malos");
    expect(REGLAS_DEL_TITULO).toContain("«Vende con el mismo guion y un seguimiento que no se olvida»");
    expect(REGLAS_DEL_TITULO).toContain("«Integra WhatsApp y unifica tus conversaciones en HubSpot»");
  });

  it("el agente que sugiere las lee, y ya no se queda con el título del catálogo si no las cumple", () => {
    const ctx: ContextoDeCasos = {
      empresa: "Centauro",
      edicion: "escala general",
      areas: [{ id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", nombre: "Proceso" }] }],
      exploracion: "",
      yaEstan: [],
      descartados: [],
      catalogo: casosParaLasAreas(["1"]),
    };
    const p = pedidoDeCasos(ctx);
    expect(p.system).toContain(REGLAS_DEL_TITULO);
    expect(p.system).toContain("solo si ya cumple las reglas del TÍTULO");
  });
});

describe("2 · una sola lista, en el orden del agente", () => {
  const candidatos: CandidatoAlOrden[] = [
    { id: "cat-a", titulo: "A", origen: "elegido", area: "Ventas", queResuelve: "" },
    { id: "ia-b", titulo: "B", origen: "agente", area: "Ventas", queResuelve: "" },
    { id: "cat-c", titulo: "Reactiva el HubSpot que ya pagas", origen: "escala", area: "Ventas", queResuelve: "" },
  ];

  it("se queda con los ids de la lista, sin repetir; el título claro solo en los de la escala; los que no ordenó van al final", () => {
    const o = validarOrdenDelAgente(
      [
        { id: "cat-c", porQue: "Lo que más la frena.", titulo: "El equipo vuelve a usar el HubSpot que ya paga" },
        { id: "inventado", porQue: "x" },
        { id: "ia-b", porQue: "Después de la base.", titulo: "No debería quedar" },
        { id: "cat-c", porQue: "repetido" },
      ],
      candidatos,
      "run1",
      AHORA,
    )!;
    expect(o.casos.map((c) => c.id)).toEqual(["cat-c", "ia-b", "cat-a"]);
    expect(o.casos[0].titulo).toBe("El equipo vuelve a usar el HubSpot que ya paga");
    expect(o.casos[1].titulo).toBeUndefined();
    expect(o.casos[2].porQue).toBe("");
    expect(o.corridaId).toBe("run1");
    expect(validarOrdenDelAgente([{ id: "nada" }], candidatos, "r")).toBeNull();
    expect(validarOrdenDelAgente("no es lista", candidatos, "r")).toBeNull();
  });

  it("⛔ el título claro de un caso de la escala lo puede ver el cliente: sin cifras ni nombres que no estén en el caso", () => {
    const c = candidatos[2];
    expect(tituloSoloDelCaso("El equipo vuelve a usar el HubSpot que ya paga", c)).toBe(true);
    expect(tituloSoloDelCaso("Llegar a las 50 reuniones semanales", c)).toBe(false);
    expect(tituloSoloDelCaso("El HubSpot que Fernando pidió reactivar", c)).toBe(false);
    const o = validarOrdenDelAgente([{ id: "cat-c", porQue: "x", titulo: "Lo que pide Emiley: reactivar HubSpot" }], candidatos, "r")!;
    expect(o.casos[0].titulo).toBeUndefined();
    const pedido = pedidoDelOrden({ empresa: "E", objetivo: "", exploracion: "", interno: "", reuniones: "", instrucciones: "", candidatos });
    expect(pedido.system).toContain("Ese título SÍ lo puede ver el cliente");
  });

  it("ordena las filas por su lugar y deja al final, en su orden, lo que llegó después", () => {
    const filas = ["x", "cat-a", "y", "ia-b", "cat-c"];
    expect(enElOrden(filas, (f) => f, { casos: [{ id: "cat-c", porQue: "" }, { id: "cat-a", porQue: "" }] })).toEqual(["cat-c", "cat-a", "x", "y", "ia-b"]);
    expect(enElOrden(filas, (f) => f, null)).toEqual(filas);
  });

  it("los candidatos son los elegidos, los sugeridos y los de la escala, sin repetir un caso del catálogo", () => {
    const estado = estadoDePrueba(todasEn("D"));
    const deLaEscala = candidatosAlOrden(estado, ESCALA_DE_PRUEBA, [], []).filter((c) => c.origen === "escala");
    expect(deLaEscala.length).toBeGreaterThan(0);
    const elegido = deLaEscala[0].id;
    const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId: "ia-nuevo" };
    const valor: CasoDeUsoElegido = { titulo: "Nuevo", areaId: "1", razon: "Porque sí" };
    const sugerido: ItemPropuesto = { id: idDelItem(destino, valor), destino, valor, fuentes: [], corridaId: "r", en: AHORA.toISOString() };
    const con = estadoDePrueba(todasEn("D"), { contenido: { ...estado.contenido, casosDeUso: { [elegido]: { titulo: "Elegido", areaId: "1" } } } });
    const lista = candidatosAlOrden(con, ESCALA_DE_PRUEBA, [], [sugerido]);
    expect(lista.filter((c) => c.id === elegido)).toEqual([expect.objectContaining({ origen: "elegido" })]);
    expect(lista.find((c) => c.id === "ia-nuevo")?.origen).toBe("agente");
    expect(new Set(lista.map((c) => c.id)).size).toBe(lista.length);
  });

  it("el agente que ordena lee el objetivo, lo interno y las minutas, titula solo los de la biblioteca, y su respuesta se valida", () => {
    const ctx: ContextoDelOrden = {
      empresa: "Centauro",
      objetivo: "Llevar a la empresa hacia el diagnóstico.",
      exploracion: "Ventas en Deficiente.",
      interno: "Meta de 50 reuniones semanales.",
      reuniones: "- Reunión del 6 nov: hablan de WhatsApp.",
      instrucciones: "",
      candidatos,
    };
    const p = pedidoDelOrden(ctx);
    const cuerpo = JSON.stringify(p.messages);
    for (const t of ["EL OBJETIVO DE LA EXPLORACIÓN", "Meta de 50 reuniones", "hablan de WhatsApp", "[cat-c] «Reactiva el HubSpot que ya pagas» (biblioteca"]) expect(cuerpo).toContain(t);
    expect(p.system).toContain(REGLAS_DEL_TITULO);
    const o = leerElOrden(respuesta("ordenar_casos", { orden: [{ id: "ia-b", porQue: "Lo pidió en la reunión." }] }), ctx, "run", AHORA);
    expect(o?.casos.map((c) => c.id)).toEqual(["ia-b", "cat-a", "cat-c"]);
  });

  it("el orden se guarda en la propuesta y se lee de vuelta; uno roto no rompe la lectura", () => {
    const orden = { en: AHORA.toISOString(), corridaId: "run", casos: [{ id: "cat-a", porQue: "Primero la base." }] };
    expect(leerPropuesta({ ordenDeLosCasos: orden }).ordenDeLosCasos).toEqual(orden);
    expect(leerPropuesta({ ordenDeLosCasos: { casos: "roto" } }).ordenDeLosCasos).toBeUndefined();
  });
});

describe("3 · el reparto de horas de cada actividad", () => {
  it("el kickoff se reparte en su hora con el cliente y su hora interna", () => {
    const kickoff = POR_ID.get("kickoff")!;
    const r = repartoDeLaActividad(act("kickoff"), kickoff);
    expect(r.conElCliente).toBe(1);
    expect(r.internas).toBe(1);
    expect(r.partes.map((p) => p.nombre)).toEqual(["preparar el plan y el cronograma", "sesión de arranque"]);
  });

  it("las veces multiplican cada parte, y el reparto suma las horas de la actividad", () => {
    const a = act(UNA_QUE_SE_REPITE.id, 3);
    const r = repartoDeLaActividad(a, UNA_QUE_SE_REPITE);
    expect(r.conElCliente + r.internas).toBeCloseTo(horasDeLaActividad(a, UNA_QUE_SE_REPITE));
    const caso = repartoDelCaso([act("kickoff"), a, act("no-existe")], POR_ID);
    expect(caso.conElCliente + caso.internas).toBeCloseTo(2 + horasDeLaActividad(a, UNA_QUE_SE_REPITE));
  });
});

describe("3b · el reparto suma siempre las horas de la actividad", () => {
  it("en toda la biblioteca, con una y con tres veces", () => {
    for (const lib of BIBLIOTECA) {
      for (const veces of [1, 3]) {
        const a = act(lib.id, veces);
        const r = repartoDeLaActividad(a, lib);
        expect(r.conElCliente + r.internas, lib.id).toBeCloseTo(horasDeLaActividad(a, lib));
      }
    }
  });
});

describe("4 · «Mejorar con IA» de las actividades", () => {
  const actuales = [act("kickoff"), act(UNA_QUE_NO.id), act(UNA_QUE_SE_REPITE.id, 2)];

  it("se queda con las actividades de la biblioteca; si no mandó ninguna válida, quedan las de hoy; una lista vacía a propósito, vacía", () => {
    const p = leerPropuestaDeMejora({ actividades: [{ actividadId: "kickoff", nombre: "Kickoff", veces: 1 }, { actividadId: "inventada", nombre: "X", veces: 1 }] }, POR_ID, actuales);
    expect(p.actividades.map((a) => a.actividadId)).toEqual(["kickoff"]);
    expect(leerPropuestaDeMejora({ actividades: [{ actividadId: "inventada" }] }, POR_ID, actuales).actividades).toEqual(actuales);
    expect(leerPropuestaDeMejora({ actividades: [] }, POR_ID, actuales).actividades).toEqual([]);
  });

  it("las sugeridas: sin repetir lo que ya está (si no se repite), una «nueva» con nombre de la biblioteca cuenta como de la biblioteca, y con tope", () => {
    const p = leerPropuestaDeMejora(
      {
        actividades: actuales,
        sugeridas: [
          { actividadId: UNA_QUE_NO.id, nombre: "Ya está", porQue: "x" },
          { actividadId: "", nombre: "Integrar con el ERP", porQue: "No hay actividad para eso." },
          { actividadId: "", nombre: POR_ID.get("kickoff")!.nombre.toUpperCase(), porQue: "Repetida por nombre, y el kickoff ya está." },
          ...Array.from({ length: 6 }, (_, i) => ({ actividadId: "", nombre: `Otra ${i}`, porQue: "y" })),
        ],
      },
      POR_ID,
      actuales,
    );
    expect(p.sugeridas[0]).toEqual({ actividadId: null, nombre: "Integrar con el ERP", porQue: "No hay actividad para eso." });
    expect(p.sugeridas.some((s) => s.actividadId === UNA_QUE_NO.id || s.actividadId === "kickoff")).toBe(false);
    expect(p.sugeridas.length).toBe(MAX_SUGERIDAS);
  });

  it("lo que la instrucción quitó no vuelve como sugerida", () => {
    const p = leerPropuestaDeMejora(
      { actividades: [act("kickoff"), act(UNA_QUE_SE_REPITE.id, 2)], sugeridas: [{ actividadId: UNA_QUE_NO.id, nombre: "Volver a ponerla", porQue: "x" }] },
      POR_ID,
      actuales,
    );
    expect(p.sugeridas).toEqual([]);
  });

  it("la diferencia dice qué entra, qué sale y qué cambia, en el orden de lo propuesto y con lo que sale al final", () => {
    const despues = [act(UNA_QUE_SE_REPITE.id, 3), act("kickoff"), act("entregar")];
    const filas = diferenciaDeActividades(actuales, despues);
    expect(filas.map((f) => [f.actividad.actividadId, f.estado])).toEqual([
      [UNA_QUE_SE_REPITE.id, "cambiada"],
      ["kickoff", "igual"],
      ["entregar", "nueva"],
      [UNA_QUE_NO.id, "quitada"],
    ]);
    expect(filas[0].antes?.veces).toBe(2);
    expect(resumenDeLaMejora(filas)).toEqual({ nuevas: 1, quitadas: 1, cambiadas: 1 });
  });

  it("aplicar: la lista propuesta, más las sugeridas marcadas (las de la biblioteca como actividad con su nombre; las nuevas, a «Falta en la biblioteca»)", () => {
    const caso: CasoDeUsoElegido = { titulo: "Caso", areaId: "1", actividades: actuales, sinActividad: "La migración desde Pipedrive" };
    const propuesta = {
      actividades: [act("kickoff")],
      sugeridas: [
        { actividadId: UNA_QUE_NO.id, nombre: "Hacerlo para WhatsApp", porQue: "x" },
        { actividadId: null, nombre: "Integrar con el ERP", porQue: "y" },
        { actividadId: null, nombre: "No marcada", porQue: "z" },
      ],
    };
    const nuevo = aplicarMejora(caso, propuesta, new Set([0, 1]), POR_ID);
    expect(nuevo.actividades?.map((a) => [a.actividadId, a.nombre])).toEqual([
      ["kickoff", POR_ID.get("kickoff")!.nombre],
      [UNA_QUE_NO.id, "Hacerlo para WhatsApp"],
    ]);
    expect(nuevo.sinActividad).toBe("La migración desde Pipedrive; Integrar con el ERP");
    expect(nuevo.aMano).toBe(true);
    expect(nuevo.titulo).toBe("Caso");
    expect(aplicarMejora(caso, propuesta, new Set(), POR_ID).sinActividad).toBe("La migración desde Pipedrive");
  });

  it("el pedido pone la instrucción primero y como la que manda; la respuesta pasa los ids de los textos a nombres", () => {
    const ctx: ContextoDeMejorar = {
      empresa: "Centauro",
      caso: { useCaseId: "cat-x", titulo: "Caso", descripcion: "", porQue: "", area: "Ventas" },
      ficha: null,
      actuales,
      instruccion: "quita la capacitación, suma integración con WhatsApp",
      biblioteca: BIBLIOTECA,
      exploracion: "",
      interno: "",
      reuniones: "",
      instrucciones: "",
    };
    const p = pedidoDeMejorar(ctx);
    const cuerpo = (p.messages[0].content as string).split("\n");
    expect(cuerpo[2]).toBe("=== LA INSTRUCCIÓN DEL VENDEDOR (manda) ===");
    expect(cuerpo[3]).toBe(ctx.instruccion);
    expect(p.system).toContain("La instrucción del vendedor MANDA");
    const m = leerLaMejora(respuesta("mejorar_actividades", { actividades: [{ actividadId: "kickoff", nombre: "Kickoff", veces: 1 }], cambios: ["Quité sesion-de-seguimiento."], sugeridas: [] }), ctx);
    expect(m.actividades).toHaveLength(1);
    expect(m.cambios).toEqual([`Quité «${POR_ID.get("sesion-de-seguimiento")!.nombre}».`]);
  });
});
