import { describe, it, expect } from "vitest";
import {
  aMb,
  AVISO_CADA_MS,
  iniciarMedidor,
  leerProceso,
  lineaDeAviso,
  motivosDeAviso,
  nsAMs,
  tocaAvisar,
  type LecturaDelProceso,
} from "./medidor-proceso";

/**
 * lib/observability/medidor-proceso.test.ts — el medidor que faltó el 2026-09-21.
 *
 * Producción se congeló 15–25 s durante horas y terminó en 821 % de CPU con 1,13 GiB sin que
 * nada lo avisara. Estas pruebas fijan cuándo avisa (atraso > 2 s o heap > 80 % del tope), que
 * avise como mucho una vez por minuto y que la línea lleve fecha; y que el medidor exista una
 * sola vez por proceso.
 */

function lectura(extra: Partial<LecturaDelProceso> = {}): LecturaDelProceso {
  return { rssMb: 300, heapUsedMb: 150, heapLimitMb: 2096, atrasoMs: { p50: 10, p99: 40, max: 80 }, ...extra };
}

describe("motivosDeAviso — cuándo avisar", () => {
  it("todo sano: ningún motivo", () => {
    expect(motivosDeAviso(lectura())).toEqual([]);
  });

  it("LA guarda: el hilo atrasado más de 2 s avisa", () => {
    /* La edición que la pone en rojo: mirar el p50 o el p99 en vez del máximo. Un congelamiento
       de 20 s en una ventana de 10 s casi no mueve el p99. */
    expect(motivosDeAviso(lectura({ atrasoMs: { p50: 10, p99: 30, max: 2_001 } }))).toEqual(["hilo atrasado 2001 ms"]);
    expect(motivosDeAviso(lectura({ atrasoMs: { p50: 10, p99: 30, max: 2_000 } }))).toEqual([]);
  });

  it("el heap por encima del 80 % del tope avisa", () => {
    expect(motivosDeAviso(lectura({ heapUsedMb: 1_700, heapLimitMb: 2_048 }))).toEqual(["heap al 83 % del tope"]);
    expect(motivosDeAviso(lectura({ heapUsedMb: 1_600, heapLimitMb: 2_048 }))).toEqual([]);
  });

  it("los dos a la vez", () => {
    const l = lectura({ heapUsedMb: 1_900, heapLimitMb: 2_048, atrasoMs: { p50: 900, p99: 15_000, max: 22_000 } });
    expect(motivosDeAviso(l)).toEqual(["hilo atrasado 22000 ms", "heap al 93 % del tope"]);
  });

  it("sin tope conocido no divide por cero", () => {
    expect(motivosDeAviso(lectura({ heapLimitMb: 0 }))).toEqual([]);
  });
});

describe("tocaAvisar — como mucho una vez por minuto", () => {
  it("la primera vez sí; dentro del minuto no; al minuto sí", () => {
    expect(tocaAvisar(1_000, null)).toBe(true);
    expect(tocaAvisar(1_000 + AVISO_CADA_MS - 1, 1_000)).toBe(false);
    expect(tocaAvisar(1_000 + AVISO_CADA_MS, 1_000)).toBe(true);
  });
});

describe("lineaDeAviso — una línea, con fecha, grepeable", () => {
  it("lleva [medidor], la fecha ISO, los motivos y los números", () => {
    const l = lectura({ heapUsedMb: 1_900, atrasoMs: { p50: 5, p99: 1_200, max: 2_500 } });
    const linea = lineaDeAviso(new Date("2026-09-21T21:58:00Z"), l, motivosDeAviso(l));
    expect(linea.startsWith("[medidor] 2026-09-21T21:58:00.000Z ⚠ hilo atrasado 2500 ms")).toBe(true);
    expect(linea).toContain("heap 1900/2096 MB");
    expect(linea).toContain("rss 300 MB");
    expect(linea).not.toContain("\n");
  });
});

describe("conversiones", () => {
  it("bytes a MB y ns a ms, con lo vacío o basura como 0", () => {
    expect(aMb(1_048_576 * 3)).toBe(3);
    expect(nsAMs(2_500_000_000)).toBe(2_500);
    expect(nsAMs(Number.NaN)).toBe(0);
    expect(nsAMs(0)).toBe(0);
  });
});

describe("el medidor del proceso", () => {
  it("existe UNA vez por proceso, aunque se lo inicie varias veces", () => {
    /* La edición que la pone en rojo: guardar el estado en una variable del módulo — Next arma
       bundles separados para instrumentation.ts y las rutas, y habría dos histogramas. */
    const a = iniciarMedidor();
    const b = iniciarMedidor();
    expect(a).toBe(b);
    expect(globalThis.__nexusMedidorDeProceso).toBe(a);
  });

  it("leerProceso devuelve números reales de este proceso", () => {
    const l = leerProceso();
    expect(l.rssMb).toBeGreaterThan(0);
    expect(l.heapUsedMb).toBeGreaterThan(0);
    expect(l.heapLimitMb).toBeGreaterThan(l.heapUsedMb);
    expect(l.atrasoMs.max).toBeGreaterThanOrEqual(0);
  });
});
