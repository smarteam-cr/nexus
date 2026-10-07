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
import {
  aplicarOperacion,
  aplicarOperaciones,
  citasNuevas,
  claveDeCita,
  completarCitas,
  ErrorDeOperacion,
  TOPES,
  type OperacionDelMapa,
} from "./operaciones";
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
  it("un cambio de estado, las operaciones del editor o un mapa del formato anterior", () => {
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "validado" }).success).toBe(true);
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "publicado" }).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse({ accion: "estado", estado: "revisado", extra: 1 }).success).toBe(false);
    const ops = {
      accion: "operaciones",
      version: 3,
      operaciones: [
        { tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { texto: "x", origen: "supuesto" } },
        { tipo: "paso.agregar", version: "despues", paso: { id: "p-abc123", carril: "hubspot", texto: "Nuevo", tipo: "paso" }, despuesDe: "d2" },
        { tipo: "carril.editar", version: "hoy", carrilId: "proyecto", tipoDeCarril: "sistema" },
      ],
    };
    expect(cambioDeMapaSchema.safeParse(ops).success).toBe(true);
    // Un id nuevo con caracteres raros, un origen inventado o un campo de más: no entran.
    const conOp = (op: unknown) => ({ ...ops, operaciones: [op] });
    expect(cambioDeMapaSchema.safeParse(conOp({ tipo: "paso.agregar", version: "hoy", paso: { id: "p 1", carril: "x", texto: "y", tipo: "paso" } })).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse(conOp({ tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { origen: "inventado" } })).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse(conOp({ tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { posicion: 1 } })).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse({ ...ops, operaciones: [] }).success).toBe(false);
    // El id de un paso que ya existe puede traer espacios o tildes (los del agente).
    expect(cambioDeMapaSchema.safeParse(conOp({ tipo: "paso.quitar", version: "hoy", pasoId: "Paso con tilde á" })).success).toBe(true);
    expect(cambioDeMapaSchema.safeParse({ accion: "paso", version: "hoy", pasoId: "h2" }).success).toBe(false);
    expect(cambioDeMapaSchema.safeParse({ accion: "anterior", data: { nodes: [{ id: "a", type: "process" }], edges: [] } }).success).toBe(true);
  });
});

describe("las operaciones del editor (las mismas que va a proponer el chat)", () => {
  const error = (m: ReturnType<typeof mapaDePrueba>, op: OperacionDelMapa) => {
    try {
      aplicarOperacion(m, op);
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDeOperacion);
      return (e as Error).message;
    }
    return null;
  };

  it("no muta el mapa: devuelve uno nuevo", () => {
    const m = mapaDePrueba();
    const copia = JSON.stringify(m);
    const n = aplicarOperacion(m, { tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { texto: "Lo anota en HubSpot" } });
    expect(JSON.stringify(m)).toBe(copia);
    expect(n.hoy.pasos.find((p) => p.id === "h2")?.texto).toBe("Lo anota en HubSpot");
  });

  it("un paso nuevo es supuesto hoy y propuesto (y nuevo) después; con «después de» sale una flecha", () => {
    let m = mapaDePrueba();
    m = aplicarOperacion(m, { tipo: "paso.agregar", version: "hoy", paso: { id: "p-1", carril: "proyecto", texto: "  Llama   al aspirante ", tipo: "paso" }, despuesDe: "h2" });
    const hoy = m.hoy.pasos.find((p) => p.id === "p-1");
    expect(hoy).toMatchObject({ texto: "Llama al aspirante", origen: "supuesto", cambio: "", citas: [] });
    expect(m.hoy.flechas).toContainEqual({ de: "h2", a: "p-1", etiqueta: "" });
    m = aplicarOperacion(m, { tipo: "paso.agregar", version: "despues", paso: { id: "p-2", carril: "hubspot", texto: "Envía un correo", tipo: "paso" } });
    expect(m.despues.pasos.find((p) => p.id === "p-2")).toMatchObject({ origen: "propuesto", cambio: "nuevo" });
  });

  it("frena lo que no tiene sentido, con un mensaje para la persona", () => {
    const m = mapaDePrueba();
    expect(error(m, { tipo: "paso.agregar", version: "hoy", paso: { id: "h1", carril: "proyecto", texto: "x", tipo: "paso" } })).toMatch(/identificador/);
    expect(error(m, { tipo: "paso.agregar", version: "hoy", paso: { id: "p-1", carril: "no-existe", texto: "x", tipo: "paso" } })).toMatch(/carril/);
    expect(error(m, { tipo: "paso.agregar", version: "hoy", paso: { id: "p-1", carril: "proyecto", texto: "   ", tipo: "paso" } })).toMatch(/qué pasa/);
    expect(error(m, { tipo: "paso.editar", version: "despues", pasoId: "d2", cambios: { dolor: "x" } })).toMatch(/hoy/);
    expect(error(m, { tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { enHubspot: "x" } })).toMatch(/después/);
    expect(error(m, { tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { origen: "acordado" } })).toMatch(/origen/);
    expect(error(m, { tipo: "paso.quitar", version: "hoy", pasoId: "nada" })).toMatch(/ya no está/);
    expect(error(m, { tipo: "flecha.agregar", version: "hoy", de: "h2", a: "h2" })).toMatch(/dos pasos distintos/);
    expect(error(m, { tipo: "carril.quitar", version: "hoy", carrilId: "proyecto" })).toMatch(/Mueve o quita sus pasos/);
  });

  it("«Lo dijo el cliente» pide una cita; quitar la última baja el paso a supuesto (hoy) o propuesto (después)", () => {
    let m = mapaDePrueba();
    expect(error(m, { tipo: "paso.editar", version: "hoy", pasoId: "h3", cambios: { origen: "dicho" } })).toMatch(/hace falta una cita/);
    const h2 = m.hoy.pasos.find((p) => p.id === "h2")!;
    m = aplicarOperacion(m, { tipo: "cita.quitar", version: "hoy", pasoId: "h2", sesionId: h2.citas[0].sesionId, cita: h2.citas[0].cita });
    expect(m.hoy.pasos.find((p) => p.id === "h2")).toMatchObject({ citas: [], origen: "supuesto" });
    const d1 = m.despues.pasos.find((p) => p.id === "d1")!;
    m = aplicarOperacion(m, { tipo: "cita.quitar", version: "despues", pasoId: "d1", sesionId: d1.citas[0].sesionId, cita: d1.citas[0].cita });
    expect(m.despues.pasos.find((p) => p.id === "d1")).toMatchObject({ citas: [], origen: "propuesto" });
  });

  it("una cita repetida no se suma dos veces y hay un tope por paso", () => {
    let m = mapaDePrueba();
    const c = { sesionId: "s9", sesionTitulo: "Otra sesión", fecha: "2026-08-01", cita: "lo hacemos todo a mano en excel" };
    m = aplicarOperacion(m, { tipo: "cita.agregar", version: "hoy", pasoId: "h3", cita: c });
    expect(aplicarOperacion(m, { tipo: "cita.agregar", version: "hoy", pasoId: "h3", cita: c })).toBe(m);
    for (let i = 1; i < TOPES.citasPorPaso; i++) m = aplicarOperacion(m, { tipo: "cita.agregar", version: "hoy", pasoId: "h3", cita: { ...c, cita: `${c.cita} ${i}` } });
    expect(error(m, { tipo: "cita.agregar", version: "hoy", pasoId: "h3", cita: { ...c, cita: "una cita más que no entra" } })).toMatch(/hasta/);
  });

  it("quitar un paso de hoy se lleva sus flechas, y lo saca de los cambios, de «reemplaza» y de «se va»", () => {
    const m = aplicarOperacion(mapaDePrueba(), { tipo: "paso.quitar", version: "hoy", pasoId: "h2" });
    expect(m.hoy.pasos.some((p) => p.id === "h2")).toBe(false);
    expect(m.hoy.flechas.some((f) => f.de === "h2" || f.a === "h2")).toBe(false);
    expect(m.cambios[0].hoy).toEqual([]);
    expect(m.despues.pasos.find((p) => p.id === "d2")?.reemplaza).toEqual([]);
    expect(m.despues.seVa).toEqual([]);
  });

  it("los carriles: agregar, renombrar, cambiar de tipo, mover y quitar el vacío", () => {
    let m = mapaDePrueba();
    m = aplicarOperacion(m, { tipo: "carril.agregar", version: "hoy", carril: { id: "c-1", nombre: "Call center", tipo: "equipo" } });
    m = aplicarOperacion(m, { tipo: "carril.editar", version: "hoy", carrilId: "c-1", nombre: "Centro de llamadas", tipoDeCarril: "sistema" });
    expect(m.hoy.carriles.at(-1)).toEqual({ id: "c-1", nombre: "Centro de llamadas", tipo: "sistema" });
    m = aplicarOperacion(m, { tipo: "carril.mover", version: "hoy", carrilId: "c-1", hacia: "arriba" });
    expect(m.hoy.carriles.map((c) => c.id)).toEqual(["aspirante", "c-1", "proyecto"]);
    // Mover más allá del borde no cambia nada.
    const arriba = aplicarOperacion(m, { tipo: "carril.mover", version: "hoy", carrilId: "aspirante", hacia: "arriba" });
    expect(arriba).toBe(m);
    m = aplicarOperacion(m, { tipo: "carril.quitar", version: "hoy", carrilId: "c-1" });
    expect(m.hoy.carriles.map((c) => c.id)).toEqual(["aspirante", "proyecto"]);
  });

  it("después tiene sus campos: qué cambia, dónde vive en HubSpot y a qué paso de hoy reemplaza (solo de hoy)", () => {
    const m = aplicarOperacion(mapaDePrueba(), {
      tipo: "paso.editar",
      version: "despues",
      pasoId: "d3",
      cambios: { cambio: "cambia", enHubspot: "Tarea en el pipeline", reemplaza: ["h3", "h3", "d1", "no-existe"] },
    });
    expect(m.despues.pasos.find((p) => p.id === "d3")).toMatchObject({ cambio: "cambia", enHubspot: "Tarea en el pipeline", reemplaza: ["h3"] });
  });

  it("una lista se aplica en orden y, si una falla, dice cuál", () => {
    const ops: OperacionDelMapa[] = [
      { tipo: "paso.editar", version: "hoy", pasoId: "h2", cambios: { carril: "aspirante" } },
      { tipo: "carril.quitar", version: "hoy", carrilId: "aspirante" },
    ];
    expect(() => aplicarOperaciones(mapaDePrueba(), ops)).toThrow(/^Cambio 2: /);
    const m = aplicarOperaciones(mapaDePrueba(), ops.slice(0, 1));
    expect(m.hoy.pasos.find((p) => p.id === "h2")?.carril).toBe("aspirante");
  });

  it("las citas nuevas se verifican en el servidor: la que no aparece se descarta y el paso baja de origen", () => {
    const antes = mapaDePrueba();
    const buena = { sesionId: "s2", sesionTitulo: "Sesión 2", fecha: "2026-08-01", cita: "el call center llama a cada uno" };
    const mala = { sesionId: "s2", sesionTitulo: "Sesión 2", fecha: "2026-08-01", cita: "esto no lo dijo nadie en la reunión" };
    let despues = aplicarOperaciones(antes, [
      { tipo: "cita.agregar", version: "hoy", pasoId: "h3", cita: buena },
      { tipo: "paso.editar", version: "hoy", pasoId: "h3", cambios: { origen: "dicho" } },
      { tipo: "cita.agregar", version: "despues", pasoId: "d2", cita: mala },
      { tipo: "paso.editar", version: "despues", pasoId: "d2", cambios: { origen: "acordado" } },
    ]);
    const nuevas = citasNuevas(antes, despues);
    expect(nuevas.map((n) => [n.version, n.pasoId, n.cita.cita])).toEqual([
      ["hoy", "h3", buena.cita],
      ["despues", "d2", mala.cita],
    ]);
    const verificadas = new Map([
      [claveDeCita(buena), { ...buena, minuto: "04:10", quien: "Ana" }],
      [claveDeCita(mala), null],
    ]);
    const r = completarCitas(despues, verificadas);
    despues = r.mapa;
    expect(r.descartadas).toBe(1);
    expect(despues.hoy.pasos.find((p) => p.id === "h3")).toMatchObject({ origen: "dicho", citas: [{ minuto: "04:10", quien: "Ana" }] });
    expect(despues.despues.pasos.find((p) => p.id === "d2")).toMatchObject({ origen: "propuesto", citas: [] });
    // Las citas que ya estaban no se vuelven a verificar.
    expect(citasNuevas(antes, antes)).toEqual([]);
  });
});
