import { describe, expect, it } from "vitest";
import { armarCorreoDeLaManana, cosasDelCorreo, MAX_COSAS } from "./correo";
import type { Pendiente } from "@/lib/para-ti/tipos";

const p = (clave: string, extra: Partial<Pendiente> = {}): Pendiente => ({
  clave,
  fuente: clave.split(":")[0],
  cuando: "hoy",
  delAgente: false,
  titulo: `Título ${clave}`,
  detalle: "",
  meta: "Cronograma · Acme",
  accion: "Abrir",
  href: `/clients/x?${clave}`,
  ...extra,
});

describe("el correo de la mañana", () => {
  it("las mismas cinco de «Lo que importa hoy»: por peso, sin Finanzas ni plata y sin repetir", () => {
    const { cosas, mas } = cosasDelCorreo({
      agente: [p("cronograma-propuesta:1", { delAgente: true }), p("cronograma-propuesta:1", { delAgente: true })],
      hoy: [p("finanzas-registrar:a"), p("tareas:1", { plata: "US$500" }), p("tareas:2"), p("tareas:3"), p("tareas:4"), p("tareas:5"), p("tareas:6")],
    });
    expect(cosas.map((c) => c.clave)).toEqual(["cronograma-propuesta:1", "tareas:2", "tareas:3", "tareas:4", "tareas:5"]);
    expect(cosas).toHaveLength(MAX_COSAS);
    expect(mas).toBe(1);
  });

  it("una sola cosa por cuenta: lo demás de esa cuenta no ocupa lugar", () => {
    const wherex = "/clients/cmr0000000000000000wherex";
    const { cosas } = cosasDelCorreo({
      agente: [],
      hoy: [p("cs-vigia:1", { href: wherex }), p("tareas:1", { href: wherex }), p("tareas:2")],
    });
    expect(cosas.map((c) => c.clave)).toEqual(["cs-vigia:1", "tareas:2"]);
    expect(cosas[0].otrosEnLaCuenta?.map((c) => c.clave)).toEqual(["tareas:1"]);
  });

  it("las reuniones de hoy con «Preparar» y cada línea a Nexus", () => {
    const c = armarCorreoDeLaManana({
      nombre: "Ana Pérez",
      fechaLarga: "Jueves 16 de octubre",
      base: "https://nexus.smarteamcr.com/",
      paraTi: { agente: [], hoy: [p("tareas:1")] },
      reuniones: [
        { id: "ev1", titulo: "Seguimiento", inicio: "2026-10-16T15:00:00Z", fin: null, conMeet: true, meetUrl: null, calendarUrl: null, empresas: ["c1"], externos: 1, internos: 1, nombres: { c1: "Acme" } },
      ],
    });
    expect(c.asunto).toBe("Tu día: 1 reunión y 1 cosa para hoy");
    expect(c.saludo).toBe("Buenos días, Ana. Jueves 16 de octubre.");
    expect(c.reuniones[0]).toMatchObject({ hora: "09:00", detalle: "Acme", href: "https://nexus.smarteamcr.com/para-ti/reunion/ev1?cliente=c1" });
    expect(c.cosas[0].href).toBe("https://nexus.smarteamcr.com/clients/x?tareas:1");
    expect(c.texto).toContain("- 09:00 · Seguimiento (Acme)");
  });

  it("sin reuniones ni cosas, lo dice", () => {
    const c = armarCorreoDeLaManana({ nombre: "Luis", fechaLarga: "Hoy", base: "http://x", paraTi: { agente: [], hoy: [] }, reuniones: [] });
    expect(c.asunto).toBe("Tu día: sin reuniones");
    expect(c.texto).toContain("No tienes reuniones hoy.");
    expect(c.texto).toContain("Nada urgente.");
  });
});
