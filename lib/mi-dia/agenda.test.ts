import { describe, expect, it } from "vitest";
import { agendaDelDia, cuentaDelEvento, empresasDeLaReunion, limitesDelDiaCR } from "./agenda";
import { indiceDeClientes } from "@/lib/sessions/clientes-por-texto";

const internos = new Set(["smarteamcr.com"]);
const porDominio = new Map([
  ["cliente.com", ["c1"]],
  ["otra.com", ["c2"]],
]);
const porCorreo = new Map([
  ["ana@hubspot.com", ["c1", "c2", "c3"]], // alguien de HubSpot: contacto de tres empresas
  ["luis@gmail.com", ["c2"]],
]);

const evento = (id: string, invitados: string[], extra: Record<string, unknown> = {}) => ({
  id,
  summary: `Reunión ${id}`,
  start: { dateTime: "2026-10-16T15:00:00Z" },
  end: { dateTime: "2026-10-16T16:00:00Z" },
  attendees: invitados.map((email) => ({ email, self: email === "yo@smarteamcr.com" })),
  conferenceData: { conferenceSolution: { key: { type: "hangoutsMeet" } } },
  ...extra,
});

describe("la empresa de una reunión", () => {
  it("por el dominio, y alguien de varias empresas no decide si hay otro invitado de una sola", () => {
    expect(empresasDeLaReunion(["x@cliente.com", "ana@hubspot.com"], porCorreo, porDominio)).toEqual(["c1"]);
  });
  it("solo alguien de varias empresas: quedan todas (se elige al preparar)", () => {
    expect(empresasDeLaReunion(["ana@hubspot.com"], porCorreo, porDominio)).toEqual(["c1", "c2", "c3"]);
  });
  it("un correo personal cuenta solo si es un contacto", () => {
    expect(empresasDeLaReunion(["luis@gmail.com"], porCorreo, porDominio)).toEqual(["c2"]);
    expect(empresasDeLaReunion(["otro@gmail.com"], porCorreo, porDominio)).toEqual([]);
  });
});

describe("dos fichas que comparten dominio (el TEC)", () => {
  const indice = indiceDeClientes([
    { id: "tae", name: "TEC · TAE", company: "tec.ac.cr", siglas: ["TAE"] },
    { id: "ae", name: "TEC · AE", company: null, siglas: ["AE"] },
    { id: "wherex", name: "Wherex", company: null, siglas: [] },
  ]);
  const entidades = { grupoDe: new Map([["tae", "tae"], ["ae", "tae"]]), indice };
  /* Así los arma lib/mi-dia/empresas-server.ts: un invitado del dominio es de las dos. */
  const porDominio = new Map([["itcr.ac.cr", ["tae", "ae"]], ["wherex.com", ["wherex"]]]);
  const de = (titulo: string, externos = ["ivania@itcr.ac.cr"]) =>
    cuentaDelEvento({ empresas: empresasDeLaReunion(externos, new Map(), porDominio, { titulo, entidades }) });

  it("la reunión es de la que nombra el título", () => {
    expect(de("AE | Reportes de Ventas")).toBe("ae");
    expect(de("TEC TAE | Workflows")).toBe("tae");
  });

  it("sin nombre, o con los dos, no cuenta para ninguna: nunca para la dueña por defecto", () => {
    expect(de("Seguimiento")).toBeNull();
    expect(de("AE y TAE | Planificación")).toBeNull();
  });

  it("el título no decide entre empresas que no son del mismo grupo", () => {
    const empresas = empresasDeLaReunion(["a@itcr.ac.cr", "b@wherex.com"], new Map(), new Map([["itcr.ac.cr", ["tae", "wherex"]], ["wherex.com", ["tae", "wherex"]]]), { titulo: "Wherex", entidades });
    expect(empresas).toEqual(["tae", "wherex"]);
  });
});

describe("la agenda del día", () => {
  it("deja afuera lo cancelado, lo rechazado, lo de todo el día y lo que no tiene a nadie más", () => {
    const r = agendaDelDia(
      [
        evento("1", ["yo@smarteamcr.com", "x@cliente.com"]),
        evento("2", ["yo@smarteamcr.com", "x@cliente.com"], { status: "cancelled" }),
        evento("3", ["yo@smarteamcr.com"]),
        evento("4", ["yo@smarteamcr.com", "x@cliente.com"], { start: { date: "2026-10-16" } }),
        {
          ...evento("5", ["yo@smarteamcr.com", "x@cliente.com"]),
          attendees: [
            { email: "yo@smarteamcr.com", self: true, responseStatus: "declined" },
            { email: "x@cliente.com" },
          ],
        },
        evento("6", ["yo@smarteamcr.com", "eli@smarteamcr.com"]),
      ],
      { porCorreo, porDominio, internos },
    );
    expect(r.map((x) => x.id)).toEqual(["1", "6"]);
    expect(r[0]).toMatchObject({ empresas: ["c1"], externos: 1, internos: 1, conMeet: true });
    expect(r[1]).toMatchObject({ empresas: [], externos: 0, internos: 2 });
  });
});

describe("el día en Costa Rica", () => {
  it("a las 23:00 de Costa Rica sigue siendo ese día", () => {
    const l = limitesDelDiaCR(new Date("2026-10-17T05:00:00Z"));
    expect(l.dia).toBe("2026-10-16");
    expect(l.desde.toISOString()).toBe("2026-10-16T06:00:00.000Z");
    expect(l.hasta.toISOString()).toBe("2026-10-17T06:00:00.000Z");
  });
});
