import { describe, expect, it } from "vitest";
import { estadoDeLaPropuesta, fechaDeVentas, ultimoHecho, type HechosDeLaPropuesta } from "./estado-de-la-propuesta";

const AHORA = new Date("2026-10-05T18:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() - n * 24 * 60 * 60 * 1000);

const base: HechosDeLaPropuesta = { publishedAt: null, approvedAt: null, acceso: null };
const subida = (o: Partial<HechosDeLaPropuesta["acceso"]> = {}, publicada = dias(3)): HechosDeLaPropuesta => ({
  ...base,
  publishedAt: publicada,
  acceso: { revokedAt: null, expiresAt: null, lastUsedAt: null, ...o },
});

describe("estadoDeLaPropuesta", () => {
  it("sin subir está en armado y el cliente no la ve", () => {
    const e = estadoDeLaPropuesta(base, AHORA);
    expect(e.clave).toBe("armado");
    expect(e.nota).toBe("Sin compartir");
    expect(e.cliente).toBe("—");
  });

  it("subida con el link revocado vuelve a estar en armado", () => {
    const e = estadoDeLaPropuesta(subida({ revokedAt: dias(1) }), AHORA);
    expect(e.clave).toBe("armado");
    expect(e.nota).toBe("Link revocado");
  });

  it("compartida: dice cuándo vence, o que no vence", () => {
    expect(estadoDeLaPropuesta(subida(), AHORA).nota).toBe("El link no vence");
    expect(estadoDeLaPropuesta(subida({ expiresAt: new Date("2026-10-31T18:00:00Z") }), AHORA).nota).toBe("El link vence el 31 oct");
    const vencido = estadoDeLaPropuesta(subida({ expiresAt: dias(1) }), AHORA);
    expect(vencido.nota).toBe("El link venció el 4 oct");
    expect(vencido.notaAtencion).toBe(true);
  });

  it("el cliente: abierta hace poco es normal; sin abrirla hace más de una semana, ámbar", () => {
    const reciente = estadoDeLaPropuesta(subida({ lastUsedAt: dias(1) }), AHORA);
    expect(reciente.cliente).toBe("La abrió el 4 oct");
    expect(reciente.clienteAtencion).toBe(false);
    const vieja = estadoDeLaPropuesta(subida({ lastUsedAt: dias(12) }), AHORA);
    expect(vieja.cliente).toBe("No la abre desde el 23 sept");
    expect(vieja.clienteAtencion).toBe(true);
  });

  it("nunca abierta: recién subida no alarma; a los días, sí", () => {
    expect(estadoDeLaPropuesta(subida({}, dias(1)), AHORA).clienteAtencion).toBe(false);
    const olvidada = estadoDeLaPropuesta(subida({}, dias(4)), AHORA);
    expect(olvidada.cliente).toBe("Todavía no la abre · subida el 1 oct");
    expect(olvidada.clienteAtencion).toBe(true);
  });

  it("aprobada gana sobre compartida, con quién la aprobó", () => {
    const e = estadoDeLaPropuesta({ ...subida({ lastUsedAt: dias(20) }), approvedAt: dias(2), approvedByName: "Ana Mora" }, AHORA);
    expect(e.clave).toBe("aprobada");
    expect(e.nota).toBe("El 3 oct, por Ana Mora");
    // Ya aprobó: que no la abra hace rato no pide nada.
    expect(e.clienteAtencion).toBe(false);
  });

  it("aprobó otra versión: se volvió a subir después de aprobar", () => {
    const e = estadoDeLaPropuesta({ ...subida({}, dias(1)), approvedAt: dias(5), approvedSnapshotAt: dias(6) }, AHORA);
    expect(e.aproboOtraVersion).toBe(true);
    expect(e.nota).toBe("Aprobó otra versión");
    expect(e.notaAtencion).toBe(true);
  });
});

describe("fechaDeVentas", () => {
  it("usa la hora de Costa Rica: las 11 de la noche del 4 son del 4, no del 5", () => {
    expect(fechaDeVentas(new Date("2026-10-05T05:00:00Z"), AHORA)).toBe("4 oct");
  });
  it("de otro año, con el año", () => {
    expect(fechaDeVentas(new Date("2025-03-10T18:00:00Z"), AHORA)).toBe("10 mar 2025");
  });
});

describe("ultimoHecho", () => {
  it("una apertura del cliente sube la propuesta sobre su última edición", () => {
    const h = subida({ lastUsedAt: dias(0) }, dias(10));
    expect(ultimoHecho(dias(5), h)).toBe(dias(0).getTime());
  });
});
