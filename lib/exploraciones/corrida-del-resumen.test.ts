/**
 * La corrida del Resumen como la sigue la pantalla (24 nov, TEC · AE): el POST arranca y responde, la pantalla consulta
 * hasta que termina, ve la fase real, retoma la que ya corría y dice por qué falló. Con la red y el reloj simulados.
 */
import { describe, expect, it, vi } from "vitest";
import { MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import {
  corridaDesdeLaFila,
  crearSeguimientoDelResumen,
  cuantoLleva,
  ERROR_DETENIDA,
  ERROR_SIN_SABER,
  FASES_DEL_RESUMEN,
  MINUTOS_SIN_LATIDO,
  queDiceElAviso,
  TOPES_DEL_RESUMEN,
  type CorridaDelResumen,
  type RespuestaDeLaRuta,
} from "./corrida-del-resumen";

const AHORA = new Date("2026-11-24T22:00:00.000Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const fila = (o: Partial<{ status: string; currentPhase: string | null; createdAt: Date; updatedAt: Date; output: string | null }> = {}) => ({
  id: "r1",
  status: "RUNNING",
  currentPhase: FASES_DEL_RESUMEN.escribiendo,
  createdAt: hace(2),
  updatedAt: hace(1),
  output: null,
  ...o,
});

describe("la fila de la corrida, como la ve la pantalla", () => {
  it("corriendo: con la fase que escribió el servidor", () => {
    const c = corridaDesdeLaFila(fila(), AHORA);
    expect(c).toMatchObject({ id: "r1", estado: "RUNNING", fase: "Escribiendo el Resumen…", termino: null, error: null });
    expect(c.detenida).toBeUndefined();
  });

  it("⛔ mira el LATIDO, no cuándo empezó: una corrida de 40 minutos que latió hace 1 sigue viva", () => {
    expect(corridaDesdeLaFila(fila({ createdAt: hace(40), updatedAt: hace(1) }), AHORA)).toMatchObject({ estado: "RUNNING" });
    expect(corridaDesdeLaFila(fila({ createdAt: hace(40), updatedAt: hace(1) }), AHORA).detenida).toBeUndefined();
  });

  it("⛔ sin latido hace más de MINUTOS_SIN_LATIDO está DETENIDA (se puede arrancar otra); a los 30, murió (la regla de Nexus)", () => {
    expect(corridaDesdeLaFila(fila({ createdAt: hace(12), updatedAt: hace(MINUTOS_SIN_LATIDO + 1) }), AHORA)).toMatchObject({ estado: "RUNNING", detenida: true });
    const muerta = corridaDesdeLaFila(fila({ createdAt: hace(40), updatedAt: hace(31) }), AHORA);
    expect(muerta).toMatchObject({ estado: "ERROR", error: MOTIVO_COLGADA, fase: null });
  });

  it("⛔ una llamada a la IA nunca dura más que lo que se espera el latido: una corrida viva no se da por detenida", () => {
    const masLarga = Math.max(...Object.values(TOPES_DEL_RESUMEN).map((t) => t.totalMs));
    expect(MINUTOS_SIN_LATIDO * 60_000).toBeGreaterThan(masLarga);
  });

  it("terminada: lo descartado y cuánto tardó; con error, el motivo en palabras simples", () => {
    const bien = corridaDesdeLaFila(fila({ status: "DONE", createdAt: hace(4), updatedAt: hace(1), output: JSON.stringify({ resumen: { v: 2 }, descartados: ["una cifra sin cita"], uso: {} }) }), AHORA);
    expect(bien).toMatchObject({ estado: "DONE", descartados: ["una cifra sin cita"], segundos: 180, error: null, fase: null });
    const mal = corridaDesdeLaFila(fila({ status: "ERROR", output: JSON.stringify({ error: "La IA está sobrecargada en este momento." }) }), AHORA);
    expect(mal).toMatchObject({ estado: "ERROR", error: "La IA está sobrecargada en este momento." });
    // Sin una salida legible, igual dice algo que se entiende.
    expect(corridaDesdeLaFila(fila({ status: "ERROR", output: "{roto" }), AHORA).error).toMatch(/No se pudo armar el Resumen/);
  });

  it("las fases dicen lo que lee, en singular y plural", () => {
    expect(FASES_DEL_RESUMEN.leyendo(4, 2)).toBe("Leyendo 4 reuniones y 2 notas del equipo…");
    expect(FASES_DEL_RESUMEN.leyendo(1, 0)).toBe("Leyendo 1 reunión…");
    expect(FASES_DEL_RESUMEN.leyendo(2, 1)).toBe("Leyendo 2 reuniones y 1 nota del equipo…");
  });

  it("cuánto lleva", () => {
    const desde = "2026-11-24T22:00:00.000Z";
    expect(cuantoLleva(desde, Date.parse(desde) + 45_000)).toBe("45 s");
    expect(cuantoLleva(desde, Date.parse(desde) + 80_000)).toBe("1 min 20 s");
    expect(cuantoLleva(desde, Date.parse(desde) + 180_000)).toBe("3 min");
  });
});

const corrida = (o: Partial<CorridaDelResumen> = {}): CorridaDelResumen => ({
  id: "r1",
  estado: "RUNNING",
  fase: FASES_DEL_RESUMEN.leyendo(4, 0),
  empezo: AHORA.toISOString(),
  termino: null,
  error: null,
  descartados: [],
  segundos: null,
  ...o,
});
const hecha = (o: Partial<CorridaDelResumen> = {}) => corrida({ estado: "DONE", fase: null, termino: AHORA.toISOString(), segundos: 170, ...o });

describe("qué dice el aviso de arriba del Resumen", () => {
  const base = { resumenEn: null as string | null, corrida: null as CorridaDelResumen | null, lanzando: false, sinSaber: false, nuevas: null as string | null, cerrado: null as string | null };

  it("sin Resumen: «falta armarlo»; con el último fallo, lo dice", () => {
    expect(queDiceElAviso(base)).toEqual({ tipo: "falta", fallo: null });
    expect(queDiceElAviso({ ...base, corrida: corrida({ estado: "ERROR", error: "La IA no respondió…", termino: AHORA.toISOString() }) })).toEqual({ tipo: "falta", fallo: "La IA no respondió…" });
  });

  it("corriendo: la fase y desde cuándo; mientras arranca, la de la foto es la de antes y no da ni fase ni reloj", () => {
    expect(queDiceElAviso({ ...base, corrida: corrida({ fase: "Escribiendo el Resumen…" }) })).toEqual({ tipo: "corriendo", fase: "Escribiendo el Resumen…", desde: AHORA.toISOString() });
    expect(queDiceElAviso({ ...base, lanzando: true, corrida: hecha({ empezo: "2026-11-20T10:00:00.000Z" }) })).toEqual({ tipo: "corriendo", fase: "Empezando…", desde: null });
  });

  it("sin saber en qué va, o detenida: nunca el reloj que sigue para siempre", () => {
    expect(queDiceElAviso({ ...base, sinSaber: true, corrida: corrida() })).toEqual({ tipo: "sin-saber" });
    expect(queDiceElAviso({ ...base, corrida: corrida({ detenida: true }) })).toEqual({ tipo: "detenida" });
  });

  it("⛔ con Resumen, un fallo sale solo si es de DESPUÉS de ese Resumen y nadie lo cerró", () => {
    const resumenEn = "2026-11-24T21:00:00.000Z";
    const nuevo = corrida({ id: "f1", estado: "ERROR", error: "La IA no respondió…", termino: "2026-11-24T21:30:00.000Z" });
    expect(queDiceElAviso({ ...base, resumenEn, corrida: nuevo })).toEqual({ tipo: "fallo", id: "f1", error: "La IA no respondió…" });
    // Uno de hace días, rehecho después: no queda pegado arriba.
    expect(queDiceElAviso({ ...base, resumenEn, corrida: { ...nuevo, termino: "2026-11-20T10:00:00.000Z" } })).toBeNull();
    expect(queDiceElAviso({ ...base, resumenEn, corrida: nuevo, cerrado: "f1" })).toBeNull();
  });

  it("con Resumen y notas que no leyó: «Hay N respuestas nuevas»; sin nada, no hay aviso", () => {
    expect(queDiceElAviso({ ...base, resumenEn: "2026-11-24T21:00:00.000Z", corrida: hecha(), nuevas: "Hay 2 respuestas nuevas" })).toEqual({ tipo: "nuevas", titulo: "Hay 2 respuestas nuevas" });
    expect(queDiceElAviso({ ...base, resumenEn: "2026-11-24T21:00:00.000Z", corrida: hecha() })).toBeNull();
  });
});

/** Una red de mentira: lo que responde el GET va saliendo de una lista; el reloj no espera. */
function red(o: { post?: RespuestaDeLaRuta; gets: (RespuestaDeLaRuta | Error)[] }) {
  const arrancar = vi.fn(async () => o.post ?? { status: 202, corrida: corrida() });
  const consultar = vi.fn(async () => {
    const r = o.gets.shift() ?? { status: 200, corrida: hecha() };
    if (r instanceof Error) throw r;
    return r;
  });
  return { arrancar, consultar, esperar: async () => undefined };
}

describe("el seguimiento del Resumen", () => {
  it("armar: el POST arranca (202) y se consulta hasta que termina; la foto pasa por la fase real", async () => {
    const r = red({ gets: [{ status: 200, corrida: corrida({ fase: FASES_DEL_RESUMEN.escribiendo }) }, { status: 200, corrida: hecha({ descartados: ["x"] }), terminada: { id: "r1", empezo: AHORA.toISOString() } }] });
    const s = crearSeguimientoDelResumen(r);
    const fases: (string | null)[] = [];
    s.suscribir(() => fases.push(s.foto().corrida?.fase ?? null));
    const fin = await s.armar();
    expect(fin).toMatchObject({ ok: true, ajena: false, corrida: { estado: "DONE", descartados: ["x"] } });
    expect(r.arrancar).toHaveBeenCalledTimes(1);
    expect(fases).toContain("Escribiendo el Resumen…");
    expect(s.foto()).toMatchObject({ lanzando: false, sinSaber: false, terminada: { id: "r1" } });
  });

  it("⛔ si ya corre una (otra pestaña, otra persona), el 409 trae la corrida: se sigue esa y se marca AJENA", async () => {
    const r = red({ post: { status: 409, error: "Nexus ya está armando el Resumen…", corrida: corrida({ id: "otra" }) }, gets: [{ status: 200, corrida: hecha({ id: "otra" }) }] });
    expect(await crearSeguimientoDelResumen(r).armar()).toMatchObject({ ok: true, ajena: true, corrida: { id: "otra" } });
  });

  it("lo que frena antes de arrancar (sin reuniones con texto) vuelve como error, sin corrida", async () => {
    const r = red({ post: { status: 409, error: "Ninguna sesión tiene transcripción todavía…" }, gets: [] });
    expect(await crearSeguimientoDelResumen(r).armar()).toEqual({ ok: false, error: "Ninguna sesión tiene transcripción todavía…" });
    expect(r.consultar).not.toHaveBeenCalled();
  });

  it("terminó mal: el motivo y la corrida (la pantalla lo muestra en su aviso)", async () => {
    const r = red({ gets: [{ status: 200, corrida: corrida({ estado: "ERROR", error: "La IA no respondió, ni al volver a intentarlo.", fase: null }) }] });
    expect(await crearSeguimientoDelResumen(r).armar()).toMatchObject({ ok: false, error: "La IA no respondió, ni al volver a intentarlo.", corrida: { estado: "ERROR" } });
  });

  it("se detuvo (no late): deja de mirar y lo dice; armar otra vez pide una nueva, no sigue la detenida", async () => {
    const r = red({ gets: [{ status: 200, corrida: corrida({ detenida: true }) }, { status: 200, corrida: hecha({ id: "r2" }) }], post: { status: 202, corrida: corrida() } });
    const s = crearSeguimientoDelResumen(r);
    expect(await s.armar()).toMatchObject({ ok: false, error: ERROR_DETENIDA, corrida: { detenida: true } });
    r.arrancar.mockResolvedValueOnce({ status: 202, corrida: corrida({ id: "r2" }) });
    expect(await s.armar()).toMatchObject({ ok: true, corrida: { id: "r2" } });
    expect(r.arrancar).toHaveBeenCalledTimes(2);
  });

  it("⛔ dos pedidos a la vez (el botón y la cuenta regresiva) esperan la misma corrida: un solo POST, y el segundo la recibe AJENA", async () => {
    const r = red({ gets: [{ status: 200, corrida: hecha() }] });
    const s = crearSeguimientoDelResumen(r);
    const [a, b] = await Promise.all([s.armar(), s.armar()]);
    expect(a).toMatchObject({ ok: true, ajena: false });
    // El segundo (la nota guardada mientras corría) no entró en esa corrida: quien lo pidió rehace una vez más.
    expect(b).toMatchObject({ ok: true, ajena: true });
    expect(r.arrancar).toHaveBeenCalledTimes(1);
  });

  it("⛔ retomada al recargar (mirar), armar SIGUE la que corre: sin otro POST, y es ajena", async () => {
    const r = red({ gets: [{ status: 200, corrida: corrida() }, { status: 200, corrida: corrida({ fase: FASES_DEL_RESUMEN.revisando }) }, { status: 200, corrida: hecha() }] });
    // Cada vuelta espera de verdad (20 ms): armar llega mientras mirar todavía la sigue.
    const s = crearSeguimientoDelResumen({ ...r, esperar: (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, 20))) });
    const mirando = s.mirar();
    await new Promise((ok) => setTimeout(ok, 5));
    expect(s.foto().corrida?.estado).toBe("RUNNING");
    const fin = await s.armar();
    await mirando;
    expect(fin).toMatchObject({ ok: true, ajena: true });
    expect(r.arrancar).not.toHaveBeenCalled();
  });

  it("sin corrida nunca: mirar deja la foto vacía y no se queda consultando", async () => {
    const r = red({ gets: [{ status: 200, corrida: null }] });
    const s = crearSeguimientoDelResumen(r);
    await s.mirar();
    expect(s.foto().corrida).toBeNull();
    expect(r.consultar).toHaveBeenCalledTimes(1);
  });

  it("⛔ la red se corta: sigue mirando un minuto; si no vuelve, la foto deja de decir «corriendo» (sinSaber) y armar pide otra", async () => {
    const r = red({ gets: [new Error("red"), new Error("red"), { status: 200, corrida: hecha() }] });
    expect((await crearSeguimientoDelResumen(r).armar()).ok).toBe(true);

    const cortada = red({ gets: Array.from({ length: 20 }, () => new Error("502")) });
    const s = crearSeguimientoDelResumen(cortada);
    expect(await s.armar()).toMatchObject({ ok: false, error: ERROR_SIN_SABER });
    expect(s.foto()).toMatchObject({ sinSaber: true, corrida: { estado: "RUNNING" } });
    expect(queDiceElAviso({ resumenEn: null, corrida: s.foto().corrida, lanzando: false, sinSaber: true, nuevas: null, cerrado: null })).toEqual({ tipo: "sin-saber" });
    // Volver a mirar con la red de vuelta lo pone al día.
    await s.mirar();
    expect(s.foto()).toMatchObject({ sinSaber: false, corrida: { estado: "DONE" } });
  });
});
