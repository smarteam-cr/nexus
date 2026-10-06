/**
 * lib/procesos — el mapa de un proceso del cliente (hoy y después), en carriles.
 *
 * Cubre lo que no depende de la base ni del modelo: leer lo que devuelve el modelo sin inventar nada,
 * que la cita la verifique el código, el acomodo por carriles, la traducción al visor viejo del
 * kickoff y el texto que leen los agentes. Ver docs/DECISIONS.md «Procesos: un mapa de hoy y uno de
 * después, en carriles».
 */
import { describe, expect, it } from "vitest";
import { citaAparece, normalizarTexto, prepararReunion, ubicarCita, verificarPasos } from "./citas";
import { acomodarPorCarriles, ladoDelDetalle, MEDIDAS } from "./layout";
import { mapaALegado } from "./legado";
import {
  cuentasDelMapa,
  esIndiceDeProcesos,
  esMapaAnterior,
  esMapaDeCarriles,
  slugDeProceso,
  tieneContenidoDeProceso,
} from "./mapa";
import { normalizarRespuesta, respuestaDelMapaSchema } from "./respuesta";
import { cambioDeMapaSchema } from "./schema";
import { serializarMapa } from "./serializar";
import { mapaDePrueba } from "./__fixtures__/mapa";

describe("reconocer qué hay en un bloque", () => {
  it("distingue el mapa nuevo, el índice y el mapa del formato anterior", () => {
    const m = mapaDePrueba();
    expect(esMapaDeCarriles(m)).toBe(true);
    expect(esIndiceDeProcesos(m)).toBe(false);
    expect(esIndiceDeProcesos({ formato: "procesos-indice-v1", resumen: "", porLevantar: [], sesiones: [], generadoEn: "" })).toBe(true);
    expect(esMapaAnterior({ nodes: [{ id: "a" }], edges: [] })).toBe(true);
    expect(esMapaAnterior({ nodes: [] })).toBe(false);
    expect(esMapaAnterior(null)).toBe(false);
  });

  it("«el cliente tiene procesos» cuenta los mapas nuevos con pasos, no solo `nodes`", () => {
    expect(tieneContenidoDeProceso(mapaDePrueba())).toBe(true);
    const vacio = { ...mapaDePrueba(), hoy: { carriles: [], pasos: [], flechas: [] }, despues: { carriles: [], pasos: [], flechas: [], seVa: [] } };
    expect(tieneContenidoDeProceso(vacio)).toBe(false);
    expect(tieneContenidoDeProceso({ nodes: [{ id: "x" }] })).toBe(true);
    expect(tieneContenidoDeProceso({ formato: "procesos-indice-v1" })).toBe(false);
  });
});

describe("leer lo que devuelve el modelo", () => {
  it("no inventa: descarta flechas a pasos que no existen, ids repetidos y referencias rotas", () => {
    const cruda = respuestaDelMapaSchema.parse({
      hoy: {
        carriles: [{ id: "eq", nombre: "Equipo", tipo: "equipo" }],
        pasos: [
          { id: "a", carril: "eq", texto: "Recibe", origen: "acordado", citas: [{ sesion: "S1", cita: "lo recibimos" }] },
          { id: "a", carril: "eq", texto: "Repetido" },
          { id: "b", carril: "otro", texto: "Decide", tipo: "rara", origen: "propuesto", dolor: "tarda" },
        ],
        flechas: [
          { de: "a", a: "b" },
          { de: "a", a: "zzz" },
          { de: "a", a: "b" },
          { de: "b", a: "b" },
        ],
      },
      despues: {
        pasos: [{ id: "x", carril: "hs", texto: "Lo hace HubSpot", origen: "dicho", cambio: "automatico", reemplaza: ["a", "nope"], dolor: "no va acá" }],
        seVa: [{ id: "a", porque: "Lo hace HubSpot" }, { id: "nope", porque: "x" }],
      },
      cambios: [{ texto: "Se automatiza", hoy: ["a", "nope"], despues: ["x"] }, { texto: "" }],
      preguntas: ["¿Quién decide?", "  "],
    });
    const r = normalizarRespuesta(cruda);
    expect(r.hoy.pasos.map((p) => p.id)).toEqual(["a", "b"]);
    // En HOY no hay «acordado» ni «propuesto»: son de después.
    expect(r.hoy.pasos.map((p) => p.origen)).toEqual(["dicho", "supuesto"]);
    // Un tipo desconocido es un paso; un carril que nadie declaró se crea.
    expect(r.hoy.pasos[1].tipo).toBe("paso");
    expect(r.hoy.carriles.map((c) => c.id)).toEqual(["eq", "otro"]);
    expect(r.hoy.flechas).toEqual([{ de: "a", a: "b", etiqueta: "" }]);
    // En DESPUÉS no hay «dicho» ni dolor.
    expect(r.despues.pasos[0].origen).toBe("acordado");
    expect(r.despues.pasos[0].dolor).toBe("");
    expect(r.despues.pasos[0].reemplaza).toEqual(["a"]);
    expect(r.despues.seVa).toEqual([{ id: "a", porque: "Lo hace HubSpot" }]);
    expect(r.cambios).toEqual([{ texto: "Se automatiza", hoy: ["a"], despues: ["x"] }]);
    expect(r.preguntas).toEqual(["¿Quién decide?"]);
  });

  it("una respuesta rota no tumba la lectura: queda vacía", () => {
    const r = normalizarRespuesta(respuestaDelMapaSchema.parse({ hoy: "nada", cambios: 3 }));
    expect(r.hoy.pasos).toEqual([]);
    expect(r.despues.pasos).toEqual([]);
    expect(r.cambios).toEqual([]);
  });

  it("el id de un proceso es un slug estable", () => {
    expect(slugDeProceso("Admisión y matrícula (posgrados)")).toBe("admision-y-matricula-posgrados");
    expect(slugDeProceso("¿?")).toBe("proceso");
  });
});

describe("la cita la verifica el código", () => {
  const reunion = prepararReunion({
    id: "s1",
    titulo: "Sesión con marketing",
    fecha: "2026-07-24",
    transcript: ["00:11:58", "Pablo Olivas: Bueno, abren un Excel nuevo y para la siguiente otro Excel nuevo, y se van perdiendo.", "01:02:15", "Ana: Lo revisamos el viernes."].join("\n"),
  });

  it("ignora mayúsculas, tildes y puntuación", () => {
    expect(normalizarTexto("¡Abren un EXCEL, nuevo!")).toBe("abren un excel nuevo");
    expect(citaAparece(reunion, "abren un Excel nuevo y para la siguiente otro Excel nuevo")).toBe(true);
  });

  it("tolera la primera y la última palabra cortadas, pero no una frase inventada", () => {
    expect(citaAparece(reunion, "bren un excel nuevo y para la siguiente otro excel nuev")).toBe(true);
    expect(citaAparece(reunion, "usan un CRM desde hace tres años")).toBe(false);
    expect(citaAparece(reunion, "excel")).toBe(false);
  });

  it("pone el minuto y quién la dijo", () => {
    expect(ubicarCita(reunion, "abren un excel nuevo y para la siguiente")).toEqual({ minuto: "11:58", quien: "Pablo Olivas" });
    expect(ubicarCita(reunion, "lo revisamos el viernes")).toEqual({ minuto: "1:02:15", quien: "Ana" });
  });

  it("un paso sin cita que se sostenga baja de origen: dicho → supuesto, acordado → propuesto", () => {
    const reuniones = new Map([["S1", reunion]]);
    const base = { carril: "x", tipo: "paso" as const, herramienta: "", dolor: "", cambio: "" as const, reemplaza: [], enHubspot: "" };
    const hoy = verificarPasos(
      [
        { ...base, id: "a", texto: "Anota", origen: "dicho", citas: [{ sesion: "S1", cita: "abren un excel nuevo y para la siguiente" }] },
        { ...base, id: "b", texto: "Inventado", origen: "dicho", citas: [{ sesion: "S1", cita: "esto nunca se dijo en la reunión" }] },
        { ...base, id: "c", texto: "Otra reunión", origen: "dicho", citas: [{ sesion: "S9", cita: "abren un excel nuevo y para la siguiente" }] },
      ],
      reuniones,
      "hoy",
    );
    expect(hoy.pasos.map((p) => p.origen)).toEqual(["dicho", "supuesto", "supuesto"]);
    expect(hoy.pasos[0].citas[0]).toMatchObject({ sesionId: "s1", sesionTitulo: "Sesión con marketing", fecha: "2026-07-24", minuto: "11:58", quien: "Pablo Olivas" });
    expect(hoy).toMatchObject({ citas: 3, citasOk: 1, bajados: 2 });
    const despues = verificarPasos([{ ...base, id: "d", texto: "x", origen: "acordado", citas: [] }], reuniones, "despues");
    expect(despues.pasos[0].origen).toBe("propuesto");
  });
});

describe("el acomodo por carriles", () => {
  const m = mapaDePrueba();
  const a = acomodarPorCarriles(m.hoy, { conDolor: true });

  it("columna = el camino más largo; la vuelta atrás no ordena y se marca", () => {
    expect(a.columna).toEqual({ h1: 0, h2: 1, h3: 2, h4: 3 });
    expect([...a.retornos]).toEqual(["h3>h2"]);
    expect(a.ultimaColumna).toBe(3);
  });

  it("una fila por carril, en el orden declarado; la del dolor es más alta", () => {
    expect(a.bandas.map((b) => b.carril.id)).toEqual(["aspirante", "proyecto"]);
    expect(a.bandas[0].primero).toBe(true);
    const sinDolor = acomodarPorCarriles(m.hoy, { conDolor: false });
    expect(a.bandas[1].alto - sinDolor.bandas[1].alto).toBe(MEDIDAS.dolor + 6);
    expect(a.posicion.h2.y).toBeGreaterThanOrEqual(a.bandas[1].y);
    expect(a.posicion.h2.x).toBe(MEDIDAS.rotulo + 20 + MEDIDAS.paso.ancho + MEDIDAS.hueco.x);
  });

  it("dos pasos en el mismo carril y columna se apilan, sin pisarse", () => {
    const v = {
      carriles: [{ id: "c", nombre: "C", tipo: "equipo" as const }],
      pasos: [mapaDePrueba().hoy.pasos[0], { ...mapaDePrueba().hoy.pasos[1], id: "otro" }].map((p) => ({ ...p, carril: "c" })),
      flechas: [],
    };
    const ap = acomodarPorCarriles(v, { conDolor: false });
    expect(ap.posicion.h1.x).toBe(ap.posicion.otro.x);
    expect(ap.posicion.otro.y - ap.posicion.h1.y).toBe(MEDIDAS.paso.alto + MEDIDAS.hueco.y);
  });

  it("un paso de un carril que nadie declaró igual tiene fila", () => {
    const v = { carriles: [], pasos: [{ ...mapaDePrueba().hoy.pasos[0], carril: "suelto" }], flechas: [] };
    expect(acomodarPorCarriles(v, { conDolor: false }).bandas.map((b) => b.carril.nombre)).toEqual(["suelto"]);
  });

  it("el detalle se abre hacia el lado con espacio", () => {
    expect(ladoDelDetalle(a, { id: "h1" })).toBe("derecha");
    expect(ladoDelDetalle(a, { id: "h4" })).toBe("izquierda");
  });
});

describe("lo que ve el kickoff (visor viejo)", () => {
  it("traduce HOY con posiciones, el nombre del carril como texto y el dolor bajo su paso", () => {
    const l = mapaALegado(mapaDePrueba());
    expect(l.description).toBe("Que cada aspirante quede registrado con su programa.");
    expect(l.nodes.filter((n) => n.type === "text").map((n) => n.label)).toEqual(["Aspirante", "Proyecto"]);
    expect(l.nodes.find((n) => n.id === "h1")?.type).toBe("start");
    expect(l.nodes.find((n) => n.id === "h3")?.type).toBe("decision");
    expect(l.nodes.find((n) => n.id === "h4")?.type).toBe("end");
    const dolor = l.nodes.find((n) => n.id === "dolor-h2");
    expect(dolor).toMatchObject({ type: "pain", label: "Un Excel nuevo por promoción" });
    expect(dolor!.position.y).toBe(l.nodes.find((n) => n.id === "h2")!.position.y + MEDIDAS.paso.alto + 6);
    expect(l.edges.find((e) => e.source === "h3" && e.target === "h4")?.edgeType).toBe("yes");
    expect(l.edges.find((e) => e.source === "h3" && e.target === "h2")).toMatchObject({ edgeType: "no", dashed: true });
    // Nada de DESPUÉS: el kickoff muestra cómo opera el cliente hoy.
    expect(l.nodes.some((n) => ["d1", "d2", "d3"].includes(n.id))).toBe(false);
  });
});

describe("lo que leen los agentes", () => {
  it("marca lo supuesto y lo propuesto, y dice el estado del mapa", () => {
    const t = serializarMapa(mapaDePrueba());
    expect(t).toContain("### Proceso: Admisión del aspirante (borrador del agente: el cliente todavía no lo validó)");
    expect(t).toContain("- Proyecto: ¿Cumple los requisitos? (supuesto, sin confirmar)");
    expect(t).toContain("⚠ DOLOR: Un Excel nuevo por promoción");
    expect(t).toContain("HubSpot: Crea el contacto y lo asigna · automático · en HubSpot: Workflow de asignación (propuesto por Smarteam, sin confirmar)");
    expect(t).toContain("- Se va de hoy: «Anota el lead en Excel» — HubSpot crea el registro solo.");
    expect(t).toContain("**Falta confirmar con el cliente:**");
  });

  it("puede leer una sola versión", () => {
    const hoy = serializarMapa({ ...mapaDePrueba(), estado: "validado" }, { version: "hoy" });
    expect(hoy).toContain("(validado con el cliente)");
    expect(hoy).toContain("Cómo se hace HOY");
    expect(hoy).not.toContain("DESPUÉS");
    expect(serializarMapa(mapaDePrueba(), { version: "despues" })).not.toContain("Cómo se hace HOY");
  });
});

describe("las cuentas de la tarjeta", () => {
  it("cuenta citas, supuestos, propuestos, dolores y lo que hace un sistema", () => {
    expect(cuentasDelMapa(mapaDePrueba())).toEqual({
      pasos: 7,
      conCita: 5,
      supuestos: 1,
      propuestos: 1,
      reuniones: 1,
      dolores: 1,
      responsablesHoy: 2,
      loHaceElSistema: 1,
      nuevos: 1,
    });
  });
});

describe("lo que aceptan las rutas", () => {
  it("un cambio de estado o de paso, nada más", () => {
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "validado" }).success).toBe(true);
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "publicado" }).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "revisado", extra: 1 }).success).toBe(false);
    const paso = { accion: "paso", version: "hoy", pasoId: "h2", texto: "x", carril: "proyecto", herramienta: "", dolor: "", origen: "supuesto", quitarCitas: [0] };
    expect(cambioDeMapaSchema.safeParse(paso).success).toBe(true);
    expect(cambioDeMapaSchema.safeParse({ ...paso, origen: "inventado" }).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse({ accion: "anterior", data: { nodes: [{ id: "a", type: "process" }], edges: [] } }).success).toBe(true);
  });
});
