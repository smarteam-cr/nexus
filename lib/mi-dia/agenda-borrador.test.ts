import { describe, expect, it } from "vitest";
import {
  conDuracion,
  conInvitado,
  datosDelEnlaceDeAgendar,
  detalleDelBorrador,
  duracionDelBorrador,
  enlaceDelBorrador,
  MAX_INVITADOS_DEL_BORRADOR,
  moverBorrador,
  sePisan,
  tituloDelBorrador,
  type BorradorDeEvento,
} from "./agenda-borrador";
import { enlaceParaAgendarEnCalendar } from "./calendario";
import { instante } from "./inicio";

const DIA = "2026-10-16";
const a = (h: number, m = 0) => instante(DIA, h * 60 + m);

const base: BorradorDeEvento = {
  id: "b1",
  correo: "ana@smarteamcr.com",
  inicio: a(10),
  fin: a(11),
  titulo: "",
  invitados: [],
  cuenta: null,
  origen: "agenda",
  abierto: false,
};

describe("el borrador de un evento", () => {
  it("el título: lo escrito, o «Reunión con» la cuenta", () => {
    expect(tituloDelBorrador(base)).toBe("Reunión");
    expect(tituloDelBorrador({ ...base, cuenta: { id: "c1", nombre: "Wherex" } })).toBe("Reunión con Wherex");
    expect(tituloDelBorrador({ ...base, titulo: "  Demo de Sales Hub ", cuenta: { id: "c1", nombre: "Wherex" } })).toBe("Demo de Sales Hub");
  });
  it("la descripción lleva el enlace a la cuenta en Nexus", () => {
    expect(detalleDelBorrador({ cuenta: { id: "c 1", nombre: "Wherex" } }, "https://nexus.smarteamcr.com/")).toBe(
      "La cuenta en Nexus: https://nexus.smarteamcr.com/clients/c%201\nCreado desde Nexus.",
    );
    expect(detalleDelBorrador({ cuenta: null }, "https://nexus.smarteamcr.com")).toBe("Creado desde Nexus.");
  });
  it("el enlace de Google Calendar trae todo: título, hora, invitados, descripción y la cuenta de Google", () => {
    const b: BorradorDeEvento = {
      ...base,
      titulo: "Seguimiento",
      cuenta: { id: "c1", nombre: "Wherex" },
      invitados: [{ correo: "jorge@wherex.com", nombre: "Jorge", clientId: "c1" }],
    };
    const u = new URL(enlaceDelBorrador(b, "https://nexus.smarteamcr.com"));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("Seguimiento");
    expect(u.searchParams.get("dates")).toBe("20261016T160000Z/20261016T170000Z");
    expect(u.searchParams.get("add")).toBe("jorge@wherex.com");
    expect(u.searchParams.get("details")).toContain("https://nexus.smarteamcr.com/clients/c1");
    expect(u.searchParams.get("authuser")).toBe("ana@smarteamcr.com");
  });
  it("moverlo conserva la duración; cambiar la duración mueve solo el fin", () => {
    const m = moverBorrador(base, a(14, 30));
    expect(m).toMatchObject({ inicio: a(14, 30), fin: a(15, 30) });
    expect(duracionDelBorrador(conDuracion(base, 45))).toBe(45);
  });
  it("los invitados no se repiten, se completa el nombre y hay tope", () => {
    let inv = conInvitado([], { correo: " Jorge@Wherex.com ", nombre: null, clientId: null });
    inv = conInvitado(inv, { correo: "jorge@wherex.com", nombre: "Jorge Méndez", clientId: "c1" });
    expect(inv).toEqual([{ correo: "jorge@wherex.com", nombre: "Jorge Méndez", clientId: "c1" }]);
    expect(conInvitado(inv, { correo: "no es un correo", nombre: null, clientId: null })).toHaveLength(1);
    let muchos = inv;
    for (let i = 0; i < 20; i++) muchos = conInvitado(muchos, { correo: `p${i}@x.com`, nombre: null, clientId: null });
    expect(muchos).toHaveLength(MAX_INVITADOS_DEL_BORRADOR);
  });
  it("lee el enlace de «Agendar» que arma el servidor", () => {
    const href = enlaceParaAgendarEnCalendar({ titulo: "Reunión con Wherex", detalle: "x", invitados: ["jorge@wherex.com", "ana@wherex.com"], correo: "ana@smarteamcr.com" });
    expect(datosDelEnlaceDeAgendar(href)).toEqual({
      titulo: "Reunión con Wherex",
      invitados: ["jorge@wherex.com", "ana@wherex.com"],
      correo: "ana@smarteamcr.com",
      inicio: null,
      fin: null,
    });
    // Con la hora que propone el servidor (el primer hueco libre), «Agendar» la usa en el borrador.
    const conHora = enlaceParaAgendarEnCalendar({ titulo: "Reunión con Wherex", inicio: a(10), fin: a(11), correo: "ana@smarteamcr.com" });
    expect(datosDelEnlaceDeAgendar(conHora)).toMatchObject({ inicio: a(10), fin: a(11) });
    expect(datosDelEnlaceDeAgendar("/clients/c1?tab=__tareas__")).toBeNull();
    expect(datosDelEnlaceDeAgendar("https://ejemplo.com/?add=a@b.com")).toBeNull();
  });
  it("se pisan solo si comparten tiempo", () => {
    expect(sePisan({ inicio: a(10), fin: a(11) }, { inicio: a(10, 30), fin: a(12) })).toBe(true);
    expect(sePisan({ inicio: a(10), fin: a(11) }, { inicio: a(11), fin: a(12) })).toBe(false);
  });
});
