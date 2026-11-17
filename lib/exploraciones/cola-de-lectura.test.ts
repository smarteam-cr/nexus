import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { aNombreDe, colaDeLaCorrida, heredarDeLaColgada, MAX_EN_LA_COLA, partirElPedido, siguienteDeLaCola, sumarALaCola, type EnCola } from "./cola-de-lectura";
import { crearSeguimiento, type CorridaEnCurso } from "./seguimiento-de-corrida";

const de = (id: string, por: string | null = "ana@smarteam.cr"): EnCola => ({ id, por });

describe("la cola de lectura (2026-11-17): varias sesiones se leen en bloque, una por corrida", () => {
  it("lee de una corrida la reunión en curso, las que esperan con quién las pidió, y si ya se tomó", () => {
    expect(colaDeLaCorrida({ exploracionId: "e", modo: "leer", sesionId: "m1", cola: [de("m2"), de("m3", null)] })).toEqual({
      sesionId: "m1",
      cola: [de("m2"), de("m3", null)],
      tomada: false,
    });
    expect(colaDeLaCorrida({ cola: [de("m2")], colaTomada: true }).tomada).toBe(true);
    expect(colaDeLaCorrida({ exploracionId: "e", modo: "preparar" })).toEqual({ sesionId: null, cola: [], tomada: false });
    expect(colaDeLaCorrida(null)).toEqual({ sesionId: null, cola: [], tomada: false });
    // Lo que no tiene forma se descarta; un id suelto cuenta como pedido del sistema.
    expect(colaDeLaCorrida({ cola: ["m2", 4, "", null, { id: "" }, { id: "m5", por: 7 }] }).cola).toEqual([de("m2", null), de("m5", null)]);
  });

  it("pedir otra mientras el agente lee la suma al final, sin repetir la que se lee ni las que ya esperan", () => {
    expect(sumarALaCola({ sesionId: "m1", cola: [de("m2")] }, [de("m1"), de("m2", "otro@smarteam.cr"), de("m3")])).toEqual([de("m2"), de("m3")]);
    expect(sumarALaCola({ sesionId: null, cola: [] }, [de("m4"), de("m4")])).toEqual([de("m4")]);
  });

  it("la cola admite tantas como sesiones tiene una preventa", () => {
    const muchas = Array.from({ length: MAX_EN_LA_COLA + 5 }, (_, i) => de(`m${i}`));
    expect(sumarALaCola({ sesionId: null, cola: [] }, muchas)).toHaveLength(MAX_EN_LA_COLA);
  });

  it("un pedido de varias: la primera arranca y el resto espera, en el orden pedido", () => {
    expect(partirElPedido([de("m1"), de("m2"), de("m3")])).toEqual({ primera: de("m1"), resto: [de("m2"), de("m3")] });
    expect(partirElPedido([de("m1"), de("m1"), de("m2")])).toEqual({ primera: de("m1"), resto: [de("m2")] });
    expect(partirElPedido([])).toBeNull();
  });
});

describe("qué hace el servidor con la cola (las decisiones que usa agente.ts)", () => {
  it("una corrida que murió con un reinicio le deja a la nueva la reunión que leía (a nombre de quien la lanzó) y las que esperaban", () => {
    expect(heredarDeLaColgada({ sesionId: "m1", cola: [de("m2", null)] }, "ana@smarteam.cr")).toEqual([de("m1"), de("m2", null)]);
    expect(heredarDeLaColgada({ modo: "preparar" }, "ana@smarteam.cr")).toEqual([]);
  });

  it("al tomar la cola se saltan las ya leídas, con transcripción o solo con notas", () => {
    expect(siguienteDeLaCola([de("m1"), de("m2"), de("m3")], new Set(["m1", "m2"]))).toEqual({ primera: de("m3"), resto: [] });
    expect(siguienteDeLaCola([de("m1")], new Set(["m1"]))).toBeNull();
  });

  it("cada una se lanza a nombre de quien la pidió; la del sistema, con el presupuesto automático", () => {
    expect(aNombreDe(de("m1", "ana@smarteam.cr"))).toEqual({ triggeredByEmail: "ana@smarteam.cr" });
    expect(aNombreDe(de("m1", null))).toEqual({ triggeredByEmail: null, automatica: true });
  });
});

describe("la pantalla no pierde el hilo entre una lectura de la cola y la siguiente (revisión del 2026-11-17)", () => {
  const corrida = (id: string, estado: CorridaEnCurso["estado"], cola: string[] = []): CorridaEnCurso => ({
    id,
    modo: "leer",
    estado,
    etiqueta: null,
    fase: null,
    empezo: "2026-11-17T10:00:00.000Z",
    termino: estado === "RUNNING" ? null : "2026-11-17T10:05:00.000Z",
    propuestos: 1,
    nadaNuevo: false,
    error: null,
    sesionId: id,
    cola,
  });

  it("si la primera terminó y la siguiente todavía no arrancó, sigue mirando hasta verla terminar", async () => {
    // A lee con m2 en cola; termina; en el hueco la consulta todavía ve A terminada con su cola; después arranca B.
    const respuestas = [
      corrida("A", "RUNNING", ["B"]),
      corrida("A", "RUNNING", ["B"]),
      corrida("A", "DONE", ["B"]),
      corrida("A", "DONE", ["B"]),
      corrida("B", "RUNNING"),
      corrida("B", "DONE"),
    ];
    let i = 0;
    const s = crearSeguimiento({ consultar: async () => respuestas[Math.min(i++, respuestas.length - 1)], esperar: async () => {} });
    const recargar = vi.fn(async () => {});
    const success = vi.fn();
    s.conectar({ recargar, avisos: { success, error: vi.fn() } });
    s.montar("2026-11-17T09:00:00.000Z");
    // Antes del arreglo, el seguimiento cortaba en la tercera respuesta: B nunca se veía terminar.
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    expect(s.foto().corrida?.id).toBe("B");
    expect(s.foto().corrida?.estado).toBe("DONE");
  });

  it("si la cola no pudo seguir, lo dice una vez y deja de esperar", async () => {
    const respuestas = [corrida("A", "RUNNING", ["B"]), corrida("A", "DONE", ["B"]), { ...corrida("A", "DONE"), colaError: "No se pudo seguir con las lecturas en cola." }];
    let i = 0;
    let consultas = 0;
    const s = crearSeguimiento({
      consultar: async () => {
        consultas++;
        return respuestas[Math.min(i++, respuestas.length - 1)];
      },
      esperar: async () => {},
    });
    const error = vi.fn();
    s.conectar({ recargar: async () => {}, avisos: { success: vi.fn(), error } });
    s.montar("2026-11-17T09:00:00.000Z");
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("No se pudo seguir con las lecturas en cola."));
    const hasta = consultas;
    await new Promise((r) => setTimeout(r, 20));
    expect(consultas).toBe(hasta);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("si la siguiente no arranca nunca (ya estaban leídas), deja de mirar después de un rato", async () => {
    let consultas = 0;
    const s = crearSeguimiento({
      consultar: async () => {
        consultas++;
        return corrida("A", "DONE", ["B"]);
      },
      esperar: async () => {},
    });
    s.conectar({ recargar: async () => {}, avisos: { success: vi.fn(), error: vi.fn() } });
    s.montar("2026-11-17T09:00:00.000Z");
    await vi.waitFor(() => expect(consultas).toBeGreaterThan(5));
    const hasta = consultas;
    await new Promise((r) => setTimeout(r, 20));
    expect(consultas).toBeLessThan(20);
    expect(consultas - hasta).toBeLessThan(15);
  });
});

describe("⛔ las piezas de la cola que ninguna prueba de lógica pura vigila", () => {
  const leer = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");
  const agente = leer("lib", "exploraciones", "agente.ts");
  const fuentes = leer("lib", "exploraciones", "fuentes.ts");

  it("pedir una lectura mientras el agente trabaja la ENCOLA en la corrida viva (no rebota)", () => {
    expect(agente).toMatch(/const cola = sumarALaCola\(actual, pedidas\);/);
    expect(agente).toMatch(/filters: \{ \.\.\.filtros, cola \}/);
  });

  it("al terminar cada corrida, bien o mal, arranca la siguiente de la cola, a nombre de quien la pidió", () => {
    expect(agente).toMatch(/\.finally\(\(\) => void seguirLaCola\(r\.runId, exploracionId\)/);
    const toma = agente.slice(agente.indexOf("async function seguirLaCola"));
    expect(toma).toMatch(/siguienteDeLaCola\(tomada, new Set\(\[\.\.\.leidas\.sesiones, \.\.\.\(leidas\.soloNotas \?\? \[\]\)\]\)\)/);
    expect(toma).toMatch(/lanzarCorrida\(exploracionId, "leer", \{ \.\.\.aNombreDe\(pedido\.primera\)/);
    // Si no arranca, la cola no se pierde callada: queda el motivo para la pantalla.
    expect(toma).toMatch(/colaError:/);
  });

  it("una corrida colgada le pasa su reunión y su cola a la nueva", () => {
    expect(agente).toMatch(/heredada = heredarDeLaColgada\(ultima\.filters, ultima\.triggeredByEmail \?\? null\);/);
  });

  it("la pantalla ve la cola de una corrida terminada hasta que arranca la siguiente (no la vacía al tomarla)", () => {
    const ruta = leer("app", "api", "sales", "exploraciones", "[id]", "agente", "route.ts");
    expect(ruta).toMatch(/const cola = leida\.cola\.map\(\(x\) => x\.id\);/);
  });

  it("la cola se TOMA con la fila bloqueada, el mismo candado con que se encola", () => {
    const toma = agente.slice(agente.indexOf("async function seguirLaCola"));
    expect(toma).toMatch(/await bloquearFila\(tx, exploracionId\);[\s\S]*colaTomada: true/);
  });

  it("la regla de qué entra en la corrida es UNA, la probada en minuta-de-la-sesion.test.ts (y no se aplica al releer)", () => {
    expect(fuentes).toMatch(/if \(!releer && !entraEnLaLectura\(\{ usado, reunionesDentro: reuniones, largo: n \}\)\) return false;/);
  });

  it("una reunión que no entra en la corrida no se lee NI se marca como leída", () => {
    const meet = fuentes.slice(fuentes.indexOf("conTexto.forEach("), fuentes.indexOf("── Lo que el vendedor sumó a mano"));
    expect(meet.indexOf("if (!entra(texto.length)) return;")).toBeGreaterThan(-1);
    expect(meet.indexOf("if (!entra(texto.length)) return;")).toBeLessThan(meet.indexOf("fuentes.push("));
    expect(meet.indexOf("if (!entra(texto.length)) return;")).toBeLessThan(meet.indexOf("reunionesLeidas.push("));
    const docs = fuentes.slice(fuentes.indexOf("docs.forEach("), fuentes.indexOf("── Las notas del vendedor"));
    expect(docs.indexOf("if (!entra(d.texto.length)) return;")).toBeGreaterThan(-1);
    expect(docs.indexOf("if (!entra(d.texto.length)) return;")).toBeLessThan(docs.indexOf("leidas.documentos.push("));
  });
});
