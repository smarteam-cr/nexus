import { describe, expect, it } from "vitest";
import { armarQuienEstuvo, conElLadoDe, inicialesDe, pareceSesionInterna, sinNadieDelCliente, textoDeLaRespuesta, type EntradaDeQuienEstuvo, type FilaDeQuienEstuvo } from "./quien-estuvo";

const equipo = new Map([
  ["liz@smarteamcr.com", "Liz Navarro"],
  ["eli@smarteamcr.com", "Elías González"],
]);

function fila(correo: string, extra: Partial<FilaDeQuienEstuvo> = {}): FilaDeQuienEstuvo {
  return { correo, esDelEquipo: correo.endsWith("@smarteamcr.com"), respuesta: "ACEPTO", entro: null, minutos: null, nombre: null, ...extra };
}

function entrada(extra: Partial<EntradaDeQuienEstuvo> = {}): EntradaDeQuienEstuvo {
  return {
    filas: [],
    participantes: [],
    organizador: null,
    plataforma: null,
    estadoDeConferencia: null,
    equipo,
    contactos: new Map(),
    dominiosDelEquipo: new Set(["smarteamcr.com"]),
    dominiosDelCliente: new Set(["lineashospitalarias.com"]),
    ...extra,
  };
}

describe("armarQuienEstuvo — Meet con asistencia", () => {
  it("el sync del 11 nov: Liz y alguien de HubSpot entraron, nadie del cliente", () => {
    const q = armarQuienEstuvo(
      entrada({
        estadoDeConferencia: "OCURRIO",
        organizador: "liz@smarteamcr.com",
        filas: [
          fila("liz@smarteamcr.com", { entro: new Date(), minutos: 12 }),
          fila("nferrero@hubspot.com", { entro: new Date(), minutos: 10 }),
          fila("eli@smarteamcr.com", { respuesta: "SIN_RESPONDER" }),
        ],
      }),
    );
    expect(q.resumen).toBe("Estuvieron 2 de 3 · nadie del cliente");
    expect(q.nadieDelCliente).toBe(true);
    expect(q.conAsistencia).toBe(true);
    expect(q.nota).toBeNull();
    const nico = q.personas.find((p) => p.correo === "nferrero@hubspot.com");
    expect(nico).toMatchObject({ lado: "otro", dominio: "hubspot.com", entro: true, minutos: 10 });
    expect(q.personas.find((p) => p.correo === "eli@smarteamcr.com")).toMatchObject({ entro: false, nombre: "Elías González" });
    expect(q.personas[0].organizo).toBe(true);
  });

  it("quien entró sin correo (meet:users/…) cuenta con su nombre", () => {
    const q = armarQuienEstuvo(
      entrada({
        estadoDeConferencia: "OCURRIO",
        filas: [fila("dir.saludencasa@lineashospitalarias.com", { entro: new Date(), minutos: 40 }), fila("meet:users/123", { esDelEquipo: false, respuesta: null, entro: new Date(), minutos: 35, nombre: "Ana del celular" })],
      }),
    );
    expect(q.resumen).toBe("Estuvieron 2 de 2 · 1 del cliente");
    expect(q.personas.find((p) => p.correo === null)).toMatchObject({ nombre: "Ana del celular", entro: true, minutos: 35 });
  });
});

describe("armarQuienEstuvo — sin asistencia", () => {
  it("Zoom: solo invitados, y lo dice", () => {
    const q = armarQuienEstuvo(
      entrada({
        plataforma: "ZOOM",
        estadoDeConferencia: null,
        filas: [fila("nferrero@hubspot.com"), fila("dir.saludencasa@lineashospitalarias.com"), fila("eli@smarteamcr.com")],
      }),
    );
    expect(q.resumen).toBe("3 invitados · 1 del cliente");
    expect(q.conAsistencia).toBe(false);
    expect(q.nota).toBe("Fue por Zoom: solo sabemos a quién se invitó, no quién entró.");
    expect(q.personas.every((p) => p.entro === null && p.minutos === null)).toBe(true);
  });

  it("un Zoom con estadoDeConferencia (no debería) no inventa asistencia", () => {
    const q = armarQuienEstuvo(entrada({ plataforma: "TEAMS", estadoDeConferencia: "OCURRIO", filas: [fila("x@ice.go.cr", { entro: new Date(), minutos: 5 })] }));
    expect(q.conAsistencia).toBe(false);
    expect(q.personas[0].entro).toBeNull();
  });

  it("Meet sin mirar todavía: invitados y el aviso", () => {
    const q = armarQuienEstuvo(entrada({ filas: [fila("eli@smarteamcr.com")] }));
    expect(q.resumen).toBe("1 invitado · nadie del cliente");
    expect(q.nota).toMatch(/todavía no dice/);
  });

  it("agregada a mano: los participantes, también uno sin correo", () => {
    const q = armarQuienEstuvo(entrada({ participantes: ["eli@smarteamcr.com", "dir.saludencasa@lineashospitalarias.com", "Don Carlos"] }));
    expect(q.resumen).toBe("3 invitados · 1 del cliente");
    expect(q.personas.find((p) => p.nombre === "Don Carlos")?.lado).toBe("otro");
  });

  it("sin dominios del dueño ni contactos (sin dueño) no afirma «nadie del cliente»", () => {
    const q = armarQuienEstuvo(entrada({ dominiosDelCliente: new Set(), filas: [fila("eli@smarteamcr.com"), fila("ana@empresa.com")] }));
    expect(q.resumen).toBe("2 invitados");
    expect(q.nadieDelCliente).toBe(false);
  });

  it("un contacto de HubSpot del dueño es del cliente aunque use otro dominio", () => {
    const q = armarQuienEstuvo(entrada({ filas: [fila("gerente@gmail.com")], contactos: new Map([["gerente@gmail.com", { nombre: "Gerente", cargo: "Director" }]]) }));
    expect(q.personas[0]).toMatchObject({ lado: "cliente", nombre: "Gerente", cargo: "Director" });
    expect(q.nadieDelCliente).toBe(false);
  });
});

describe("sinNadieDelCliente (el buscador)", () => {
  it("marca la reunión sin nadie con el dominio del cliente", () => {
    const d = new Set(["lineashospitalarias.com"]);
    expect(sinNadieDelCliente(["liz@smarteamcr.com", "nferrero@hubspot.com"], d)).toBe(true);
    expect(sinNadieDelCliente(["liz@smarteamcr.com", "Dir.SaludEnCasa@LineasHospitalarias.com"], d)).toBe(false);
  });
  it("sin dominios del cliente no afirma nada", () => {
    expect(sinNadieDelCliente(["liz@smarteamcr.com"], new Set())).toBe(false);
  });
});

describe("pareceSesionInterna — recomendar que es interna (2026-11-28, el sync del 11 nov de Líneas Hospitalarias)", () => {
  it("Smarteam y HubSpot, nadie del cliente: sí, y dice de dónde son los de afuera", () => {
    const q = armarQuienEstuvo(entrada({ filas: [fila("liz@smarteamcr.com"), fila("nferrero@hubspot.com")] }));
    expect(pareceSesionInterna(q)).toBe(true);
    expect(q.dominiosDeAfuera).toEqual(["hubspot.com"]);
  });
  it("con alguien del cliente invitado, aunque no haya entrado: no", () => {
    const q = armarQuienEstuvo(
      entrada({
        estadoDeConferencia: "OCURRIO",
        filas: [fila("liz@smarteamcr.com", { entro: new Date(), minutos: 12 }), fila("nferrero@hubspot.com", { entro: new Date() }), fila("dir@lineashospitalarias.com")],
      }),
    );
    expect(q.nadieDelCliente).toBe(true);
    expect(pareceSesionInterna(q)).toBe(false);
  });
  it("solo el equipo (de puertas adentro), o sin dominios del cliente: no se recomienda", () => {
    expect(pareceSesionInterna(armarQuienEstuvo(entrada({ filas: [fila("liz@smarteamcr.com"), fila("eli@smarteamcr.com")] })))).toBe(false);
    expect(pareceSesionInterna(armarQuienEstuvo(entrada({ dominiosDelCliente: new Set(), filas: [fila("nferrero@hubspot.com")] })))).toBe(false);
  });
});

describe("inicialesDe", () => {
  it("como en Google Calendar", () => {
    expect(inicialesDe({ nombre: "Liz Navarro", correo: "liz@smarteamcr.com" })).toBe("LN");
    expect(inicialesDe({ nombre: null, correo: "nferrero@hubspot.com" })).toBe("N");
    expect(inicialesDe({ nombre: null, correo: null })).toBe("?");
  });
});

describe("conElLadoDe — una sola regla de lado en la página", () => {
  it("alguien del dominio del cliente que no es contacto de HubSpot es «cliente» también abajo", () => {
    const q = armarQuienEstuvo(entrada({ filas: [fila("dir.saludencasa@lineashospitalarias.com")] }));
    const abajo = conElLadoDe([{ email: "Dir.SaludEnCasa@lineashospitalarias.com", nombre: null, cargo: null, lado: "otro" as const }], q);
    expect(abajo[0].lado).toBe("cliente");
  });
});

describe("textoDeLaRespuesta", () => {
  it("en palabras", () => {
    expect(textoDeLaRespuesta("ACEPTO")).toBe("Aceptó");
    expect(textoDeLaRespuesta("RECHAZO")).toBe("No va");
    expect(textoDeLaRespuesta(null)).toBeNull();
  });
});
