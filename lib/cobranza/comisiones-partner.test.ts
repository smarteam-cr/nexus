/**
 * lib/cobranza/comisiones-partner.test.ts
 *
 * El «Total acumulado» del panel de aliados mezclaba plata que entró con plata que
 * todavía se espera, y lo mostraba como un número solo. La proyección de noviembre
 * —$51.000 que nadie cobró— sumaba ahí adentro sin decirlo.
 *
 * Estos casos existen para que el corte no se pueda volver a perder.
 */
import { describe, expect, it } from "vitest";
import {
  retencionDe,
  sugerenciaParaLaProxima,
  totalesPorMoneda,
  totalesPorPartner,
  type ComisionParaSumar,
} from "./comisiones-partner";

const c = (
  partner: string,
  monto: number,
  estado: string,
  moneda = "USD",
): ComisionParaSumar => ({ partner, monto, moneda, estado });

/** El año 2026 real, tal como está en la base al 2026-08-20. */
const REAL: ComisionParaSumar[] = [
  c("HubSpot", 38_756.61, "COBRADO"),
  c("Atom Chat", 2_796.75, "COBRADO"),
  c("HubSpot", 45_921.72, "COBRADO"),
  c("Atom Chat", 2_849.25, "COBRADO"),
  c("Cooby", 938.22, "POR_COBRAR"),
  c("Atom Chat", 2_849.25, "POR_COBRAR"),
  c("HubSpot", 51_000, "POR_COBRAR"),
  c("Atom Chat", 2_849.25, "POR_COBRAR"),
  c("HubSpot", 51_000, "POR_COBRAR"),
];

describe("el corte que faltaba: lo que entró contra lo que se espera", () => {
  it("EL CASO QUE MOTIVA EL ARCHIVO: el total del año se parte en dos y los dos cierran", () => {
    const [usd] = totalesPorMoneda(REAL);
    expect(usd!.cobrado).toBe(90_324.33);
    expect(usd!.esperado).toBe(108_636.72);
    // El total de antes sigue siendo el mismo número — lo que cambia es que ahora se
    // puede ver de qué está hecho.
    expect(usd!.total).toBe(198_961.05);
  });

  it("cuenta cuántas hay de cada lado, no solo cuánto", () => {
    const [usd] = totalesPorMoneda(REAL);
    expect(usd!.cuantasCobradas).toBe(4);
    expect(usd!.cuantasEsperadas).toBe(5);
  });

  it("solo COBRADO cuenta como entrado: cualquier otro estado espera", () => {
    // El estado llega como string desde el DTO. Si mañana aparece un tercer estado,
    // la regla segura es que NO cuente como caja hasta que alguien lo decida.
    const t = totalesPorMoneda([c("X", 100, "COBRADO"), c("X", 50, "POR_COBRAR"), c("X", 25, "LO_QUE_SEA")]);
    expect(t[0]!.cobrado).toBe(100);
    expect(t[0]!.esperado).toBe(75);
  });
});

describe("por aliado", () => {
  it("agrupa sin importar mayúsculas ni espacios", () => {
    const t = totalesPorPartner([c("HubSpot", 10, "COBRADO"), c(" hubspot ", 5, "COBRADO")]);
    expect(t).toHaveLength(1);
    expect(t[0]!.cobrado).toBe(15);
  });

  it("⚠ CRC y USD del mismo aliado son DOS líneas, nunca una convertida", () => {
    const t = totalesPorPartner([c("HubSpot", 100, "COBRADO", "USD"), c("HubSpot", 50_000, "COBRADO", "CRC")]);
    expect(t).toHaveLength(2);
    expect(t.map((x) => x.moneda).sort()).toEqual(["CRC", "USD"]);
  });

  it("ordena por plata, y el nombre desempata para que el orden no dependa del Map", () => {
    const t = totalesPorPartner([c("Zeta", 100, "COBRADO"), c("Alfa", 100, "COBRADO"), c("Medio", 500, "COBRADO")]);
    expect(t.map((x) => x.partner)).toEqual(["Medio", "Alfa", "Zeta"]);
  });

  it("un aliado que solo tiene proyección aparece, con cobrado en cero", () => {
    // Es justo el caso de Cooby: si se filtrara por cobrado desaparecería de la
    // pantalla, y lo que hay que ver es precisamente que todavía no pagó.
    const t = totalesPorPartner([c("Cooby", 938.22, "POR_COBRAR")]);
    expect(t[0]!.cobrado).toBe(0);
    expect(t[0]!.esperado).toBe(938.22);
  });
});

describe("aritmética", () => {
  it("no inventa centavos al acumular", () => {
    const t = totalesPorMoneda([c("X", 0.1, "COBRADO"), c("X", 0.2, "COBRADO")]);
    expect(t[0]!.cobrado).toBe(0.3);
  });

  it("sin comisiones no hay líneas — no una línea en cero", () => {
    // Una fila "USD $0,00" haría creer que el aliado existe y no pagó.
    expect(totalesPorMoneda([])).toEqual([]);
    expect(totalesPorPartner([])).toEqual([]);
  });
});

describe("la retención del procesador", () => {
  it("sale de la resta, con su porcentaje", () => {
    // El caso real: el aliado reporta ~$51.000 y al banco llegan ~$50.847.
    const r = retencionDe(50_847, 51_000)!;
    expect(r.monto).toBe(153);
    expect(r.pct).toBe(0.3);
  });

  it("sin el bruto devuelve null — «no se sabe» no es «cero»", () => {
    // Devolver 0 diría que NO hubo retención, que es una afirmación distinta y falsa.
    expect(retencionDe(50_847, null)).toBeNull();
    expect(retencionDe(50_847, undefined)).toBeNull();
  });

  it("un neto mayor que el bruto es un dato malo, no una retención negativa", () => {
    // Mostrarlo como "-2%" haría creer que el procesador devolvió plata.
    expect(retencionDe(51_000, 50_000)).toBeNull();
  });

  it("bruto igual al neto es retención cero, y eso SÍ se puede afirmar", () => {
    const r = retencionDe(1000, 1000)!;
    expect(r.monto).toBe(0);
    expect(r.pct).toBe(0);
  });

  it("el rango que reporta el procesador (0,5%–5%) sale con dos decimales", () => {
    expect(retencionDe(9500, 10_000)!.pct).toBe(5);
    expect(retencionDe(9950, 10_000)!.pct).toBe(0.5);
  });
});

describe("qué sugerir para la próxima comisión", () => {
  const h = (fecha: string, monto: number, estado: string) => ({ fecha, monto, moneda: "USD", estado });

  it("sale de la ÚLTIMA CONFIRMADA, que es un hecho", () => {
    const r = sugerenciaParaLaProxima([
      h("2026-02-15", 38_756.61, "COBRADO"),
      h("2026-05-15", 45_921.72, "COBRADO"),
    ])!;
    expect(r.monto).toBe(45_921.72);
    expect(r.desde).toBe("2026-05-15");
  });

  it("EL PUNTO DEL MÓDULO: una proyección NO sirve de base para otra", () => {
    // Copiar una estimación y presentarla como respaldada es exactamente cómo
    // aparecieron los "$51.000 exactos, dos veces".
    const r = sugerenciaParaLaProxima([
      h("2026-05-15", 45_921.72, "COBRADO"),
      h("2026-08-15", 51_000, "POR_COBRAR"),
    ])!;
    expect(r.monto).toBe(45_921.72);
  });

  it("sin ninguna confirmada no sugiere nada — ni cero, ni el registrado", () => {
    expect(sugerenciaParaLaProxima([h("2026-08-15", 51_000, "POR_COBRAR")])).toBeNull();
    expect(sugerenciaParaLaProxima([])).toBeNull();
  });

  it("no promedia: un promedio suaviza justo la señal que importa", () => {
    // La comisión sube con cuentas nuevas y baja con churn. El promedio da un número
    // que no ocurrió nunca y esconde hacia dónde se está moviendo.
    const r = sugerenciaParaLaProxima([
      h("2026-02-15", 10_000, "COBRADO"),
      h("2026-05-15", 50_000, "COBRADO"),
    ])!;
    expect(r.monto).toBe(50_000);
  });

  it("el orden de entrada no manda: manda la fecha", () => {
    const r = sugerenciaParaLaProxima([
      h("2026-05-15", 45_921.72, "COBRADO"),
      h("2026-02-15", 38_756.61, "COBRADO"),
    ])!;
    expect(r.monto).toBe(45_921.72);
  });
});

