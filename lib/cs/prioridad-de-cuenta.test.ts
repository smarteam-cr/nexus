import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { marcasConLoGuardado, motivoEnPalabras, prioridadDesdeEventos, prioridadVisible, prioridadesVisibles, rangoDePrioridad, type EventoDePrioridad, type PrioridadGuardada } from "./prioridad-de-cuenta";
import { prioridadDeCuentaSchema } from "./schema";

const evento = (o: Partial<EventoDePrioridad>): EventoDePrioridad => ({
  id: "e1",
  tipo: "marcar",
  motivo: "smartloop",
  nota: null,
  porEmail: "avanegas@smarteamcr.com",
  porNombre: "Alexander Vanegas",
  en: "2026-10-29T15:00:00Z",
  ...o,
});

describe("la marca de prioridad", () => {
  it("⭐ vale el último evento, vengan en el orden que vengan", () => {
    const marcar = evento({ id: "a", en: "2026-10-01T10:00:00Z", motivo: "ticket-grande" });
    const quitar = evento({ id: "b", tipo: "quitar", motivo: null, en: "2026-10-10T10:00:00Z" });
    const otraVez = evento({ id: "c", en: "2026-10-20T10:00:00Z", motivo: "interlocutores-dificiles" });
    expect(prioridadDesdeEventos([otraVez, marcar, quitar])?.motivo).toBe("interlocutores-dificiles");
    expect(prioridadDesdeEventos([quitar, marcar])).toBeNull();
    expect(prioridadDesdeEventos([])).toBeNull();
  });

  it("un motivo que no existe no marca (filas raras de la base)", () => {
    expect(prioridadDesdeEventos([evento({ motivo: "vip" })])).toBeNull();
  });

  it("el motivo en palabras: con «otro», la línea es el motivo", () => {
    expect(motivoEnPalabras({ motivo: "smartloop", nota: null })).toBe("SmartLoop");
    expect(motivoEnPalabras({ motivo: "ticket-grande", nota: "renueva 3 hubs" })).toBe("Ticket grande · renueva 3 hubs");
    expect(motivoEnPalabras({ motivo: "otro", nota: "el sponsor se va" })).toBe("el sponsor se va");
  });

  it("lo visible dice quién la marcó, y ordena primero", () => {
    const v = prioridadVisible(prioridadDesdeEventos([evento({})]));
    expect(v).toEqual({ motivo: "smartloop", nota: null, enPalabras: "SmartLoop", quien: "Alexander Vanegas" });
    expect(rangoDePrioridad({ prioritaria: v })).toBeLessThan(rangoDePrioridad({ prioritaria: null }));
  });

  it("la frontera: «otro» pide escribir cuál; un motivo inventado no pasa", () => {
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "smartloop" }).success).toBe(true);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "otro" }).success).toBe(false);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "otro", nota: "el sponsor se va" }).success).toBe(true);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "vip" }).success).toBe(false);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "quitar" }).success).toBe(true);
  });
});

describe("la columna «Prioritaria» de los listados", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const LISTADOS = ["cartera/Llamar", "cartera/Cartera", "cartera/Renovaciones", "cartera/UsoYLicencias", "cartera/Crecimiento", "cartera/Equipo", "cartera/NivelDePartner", "cartera/Buscar", "SeguimientoDeCuentas"];

  it("las marcas llegan por cuenta, en palabras", () => {
    const p: PrioridadGuardada = { motivo: "smartloop", nota: null, porEmail: "a@smarteam.cr", porNombre: "Alex", en: "2026-10-30T00:00:00Z" };
    expect(prioridadesVisibles(new Map([["c1", p]]))).toEqual({ c1: { motivo: "smartloop", nota: null, enPalabras: "SmartLoop", quien: "Alex" } });
  });

  it.each(LISTADOS)("%s trae la estrella", (l) => {
    expect(leer(`components/cs/${l}.tsx`)).toContain("<EstrellaDePrioridad");
  });

  it("ninguna fila con la estrella es un enlace entero: un clic en la estrella abriría la cuenta", () => {
    for (const l of LISTADOS) {
      const src = leer(`components/cs/${l}.tsx`);
      expect(src, l).not.toMatch(/<Link\b(?:(?!<\/Link>)[\s\S])*?<EstrellaDePrioridad/);
    }
  });

  it("⭐ lo guardado acá gana a la foto del servidor: marcar dos seguidas no hace parpadear la primera", () => {
    const m = (motivo: "smartloop" | "ticket-grande") => prioridadVisible({ motivo, nota: null, porEmail: "a@x", porNombre: null, en: "2026-10-30" })!;
    const delServidor = { a: m("smartloop"), c: m("smartloop") };
    expect(marcasConLoGuardado(delServidor, { b: m("ticket-grande"), c: null })).toEqual({ a: m("smartloop"), b: m("ticket-grande") });
  });

  it("la estrella va por encima del enlace de la fila: sin eso, el clic abre la cuenta", () => {
    expect(leer("components/cs/EstrellaDePrioridad.tsx").match(/relative z-\[1\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("las dos páginas ponen las marcas de verdad; en Seguimiento el CSE no marca y no se recarga", () => {
    expect(leer("app/(shell)/customer-success/page.tsx")).toContain("iniciales={data.prioritarias}");
    const seguimiento = leer("app/(shell)/customer-success/seguimiento/page.tsx");
    expect(seguimiento).toContain("iniciales={prioridadesVisibles(prioridades.porCliente)}");
    expect(seguimiento).toContain("lider ? can(");
    expect(seguimiento).toContain("ordenaLaLista={false}");
  });
});
