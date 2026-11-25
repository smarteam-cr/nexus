/**
 * La llamada con tope (24 nov, el Resumen de TEC · AE que colgó 904 s): una llamada sin señal se corta en minutos y se
 * intenta una vez más; lo pasajero se reintenta y lo de la cuenta no. Con el reloj simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esPasajero, LlamadaSinRespuesta, llamarConTope, type LlamadaVigilable } from "./llamada-con-tope";

/** Una llamada de mentira: se controla cuándo da señal, cuándo termina y si se cortó. */
function llamada() {
  let alEvento: () => void = () => {};
  let resolver: (m: string) => void = () => {};
  let rechazar: (e: unknown) => void = () => {};
  const estado = { cortada: false };
  const final = new Promise<string>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  const l: LlamadaVigilable<string> = {
    on: (_e, cb) => {
      alEvento = cb;
    },
    abort: () => {
      estado.cortada = true;
      rechazar(new Error("Request was aborted."));
    },
    finalMessage: () => final,
  };
  return { l, senal: () => alEvento(), terminar: (m: string) => resolver(m), fallar: (e: unknown) => rechazar(e), estado };
}

const TOPES = { sinSenalMs: 1000, totalMs: 5000, intentos: 2 };

describe("llamarConTope", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("devuelve lo que responde la IA y avisa una sola vez cuándo empezó a escribir", async () => {
    const a = llamada();
    const empezo = vi.fn();
    const p = llamarConTope(() => a.l, TOPES, { alPrimeraSenal: empezo });
    a.senal();
    a.senal();
    a.terminar("listo");
    await expect(p).resolves.toBe("listo");
    expect(empezo).toHaveBeenCalledTimes(1);
  });

  it("⛔ colgada (sin ninguna señal): se corta en `sinSenalMs`, no en 15 minutos, y se intenta una vez más", async () => {
    const primera = llamada();
    const segunda = llamada();
    const llamadas = [primera, segunda];
    const otraVez = vi.fn();
    const p = llamarConTope(() => llamadas.shift()!.l, TOPES, { alReintentar: otraVez });
    await vi.advanceTimersByTimeAsync(999);
    expect(primera.estado.cortada).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(primera.estado.cortada).toBe(true);
    expect(otraVez).toHaveBeenCalledTimes(1);
    segunda.senal();
    segunda.terminar("a la segunda");
    await expect(p).resolves.toBe("a la segunda");
  });

  it("las señales mantienen viva la llamada; lo que gotea para siempre se corta en `totalMs`", async () => {
    const a = llamada();
    const p = llamarConTope(() => a.l, { ...TOPES, intentos: 1 });
    const fallo = p.catch((e: unknown) => e);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(900);
      a.senal();
    }
    // 4,5 s con señal cada 0,9 s: viva. A los 5 s (el total) se corta, aunque la última señal fue hace medio segundo.
    expect(a.estado.cortada).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    const e = await fallo;
    expect(e).toBeInstanceOf(LlamadaSinRespuesta);
    expect((e as LlamadaSinRespuesta).por).toBe("total");
    expect(a.estado.cortada).toBe(true);
  });

  it("colgada las dos veces: lanza LlamadaSinRespuesta (la corrida lo dice en palabras simples)", async () => {
    const p = llamarConTope(() => llamada().l, TOPES);
    const fallo = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    const e = await fallo;
    expect(e).toBeInstanceOf(LlamadaSinRespuesta);
    expect((e as LlamadaSinRespuesta).por).toBe("sin-senal");
  });

  it("lo que se corta a mitad del stream se intenta otra vez; lo de la cuenta (sin créditos, la key) no", async () => {
    const sobrecargada = llamada();
    const bien = llamada();
    const cola = [sobrecargada, bien];
    const p = llamarConTope(() => cola.shift()!.l, TOPES);
    // La sobrecarga que llega como evento del stream no trae código HTTP: el SDK no la reintenta.
    sobrecargada.fallar(new Error('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'));
    await vi.advanceTimersByTimeAsync(0);
    bien.terminar("ok");
    await expect(p).resolves.toBe("ok");

    const sinKey = llamada();
    const abrir = vi.fn(() => sinKey.l);
    const q = llamarConTope(abrir, TOPES);
    sinKey.fallar(Object.assign(new Error("invalid x-api-key"), { status: 401 }));
    await expect(q).rejects.toThrow("invalid x-api-key");
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("⛔ qué se repite acá: lo colgado y lo cortado a mitad del stream; lo que trae código HTTP ya lo reintentó el SDK", () => {
    expect(esPasajero(new LlamadaSinRespuesta("sin-senal", 150))).toBe(true);
    expect(esPasajero(new Error("socket hang up"))).toBe(true);
    expect(esPasajero(new Error("terminated"))).toBe(true);
    // Los dos cortes que manda Anthropic como evento del stream, sin código HTTP.
    expect(esPasajero(new Error('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'))).toBe(true);
    expect(esPasajero(new Error('{"type":"error","error":{"type":"api_error","message":"Internal server error"}}'))).toBe(true);
    // Un 529 o un 5xx al abrir: el SDK ya lo intentó con su espera (`maxRetries`). Repetirlo acá multiplicaba los pedidos.
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504, 529]) expect(esPasajero(Object.assign(new Error("overloaded"), { status }))).toBe(false);
    expect(esPasajero(new Error("credit balance is too low"))).toBe(false);
  });
});
