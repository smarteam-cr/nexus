import { describe, expect, it } from "vitest";
import { PREGUNTAS_SOBRE_LA_CUENTA, preguntaDe } from "./preguntas";
import { csvDeEventos, decidirSiPreguntar, resultadosDe, type EventoGuardado, type RespuestaParaResultados } from "./reglas";

const p = preguntaDe("apertura-asesoria")!;
const AHORA = new Date("2026-10-13T15:00:00Z");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000);
const ev = (evento: string, valor: string | null, dias: number, version = p.version): EventoGuardado => ({
  evento,
  valor,
  preguntaVersion: version,
  createdAt: haceDias(dias),
});

describe("el registro", () => {
  it("las claves son únicas y cada pregunta trae Sí, No y No sé", () => {
    const claves = PREGUNTAS_SOBRE_LA_CUENTA.map((x) => x.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const x of PREGUNTAS_SOBRE_LA_CUENTA) {
      expect(x.respuestas.map((r) => r.valor)).toEqual(["si", "no", "no_se"]);
      expect(x.version).toBeGreaterThan(0);
    }
  });

  it("la de apertura a la asesoría es para Customer Success, vuelve a los 7 días con «No sé» y nace activa", () => {
    expect(p.roles).toEqual(["CSE", "CSL"]);
    expect(p.diasParaVolverConNoSe).toBe(7);
    expect(p.activaPorDefecto).toBe(true);
  });
});

describe("decidirSiPreguntar", () => {
  it("sin nada guardado, pregunta", () => {
    expect(decidirSiPreguntar(p, [], AHORA)).toEqual({ preguntar: true, motivo: "nunca" });
  });

  it("«mostrada» sola no decide nada", () => {
    expect(decidirSiPreguntar(p, [ev("mostrada", null, 0)], AHORA).preguntar).toBe(true);
  });

  it("con Sí o No no vuelve a preguntar, aunque pase el tiempo", () => {
    expect(decidirSiPreguntar(p, [ev("respondida", "si", 0)], AHORA)).toEqual({ preguntar: false, motivo: "respondio" });
    expect(decidirSiPreguntar(p, [ev("respondida", "no", 400)], AHORA).preguntar).toBe(false);
  });

  it("con «No sé» espera una semana y la primera vez que entra después vuelve a preguntar", () => {
    expect(decidirSiPreguntar(p, [ev("respondida", "no_se", 6.9)], AHORA)).toEqual({ preguntar: false, motivo: "espera-no-se" });
    expect(decidirSiPreguntar(p, [ev("respondida", "no_se", 7)], AHORA)).toEqual({ preguntar: true, motivo: "no-sabia" });
  });

  it("con «Ahora no» vuelve al día siguiente", () => {
    expect(decidirSiPreguntar(p, [ev("ahora_no", null, 0.5)], AHORA).preguntar).toBe(false);
    expect(decidirSiPreguntar(p, [ev("ahora_no", null, 1)], AHORA)).toEqual({ preguntar: true, motivo: "despues" });
  });

  it("manda lo último: un Sí después de un «No sé» cierra la pregunta", () => {
    expect(decidirSiPreguntar(p, [ev("respondida", "no_se", 10), ev("respondida", "si", 2)], AHORA).preguntar).toBe(false);
    // y el orden en que llegan no importa
    expect(decidirSiPreguntar(p, [ev("respondida", "si", 2), ev("respondida", "no_se", 10)], AHORA).preguntar).toBe(false);
  });

  it("lo respondido con una versión anterior no cuenta: la pregunta cambió", () => {
    const nueva = { ...p, version: p.version + 1 };
    expect(decidirSiPreguntar(nueva, [ev("respondida", "si", 1, p.version)], AHORA)).toEqual({ preguntar: true, motivo: "version-nueva" });
  });
});

const resp = (o: Partial<RespuestaParaResultados>): RespuestaParaResultados => ({
  clientId: "c1",
  clientNombre: "Cliente Uno",
  personaEmail: "ana@smarteamcr.com",
  rol: "CSE",
  motivoDeAcceso: "hubspot-owner",
  valor: "si",
  porQue: null,
  preguntaVersion: p.version,
  createdAt: haceDias(1),
  ...o,
});

describe("resultadosDe", () => {
  it("por cliente vale la última respuesta de cada persona", () => {
    const r = resultadosDe(p, [resp({ valor: "no_se", createdAt: haceDias(10) }), resp({ valor: "si", createdAt: haceDias(1), porQue: "pide ideas" })]);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].personas).toEqual([
      expect.objectContaining({ personaEmail: "ana@smarteamcr.com", valor: "si", porQue: "pide ideas", veces: 2, esEncargado: true }),
    ]);
    expect(r.conteo).toEqual({ si: 1, no: 0, no_se: 0 });
    expect(r.respuestas).toBe(2);
  });

  it("cuenta clientes, no respuestas; un Sí y un No son un desacuerdo y el cliente queda sin saber", () => {
    const r = resultadosDe(p, [
      resp({ clientId: "c1", personaEmail: "a@x", valor: "si" }),
      resp({ clientId: "c1", personaEmail: "b@x", valor: "si" }),
      resp({ clientId: "c2", clientNombre: "Dos", personaEmail: "a@x", valor: "si" }),
      resp({ clientId: "c2", clientNombre: "Dos", personaEmail: "b@x", valor: "no", motivoDeAcceso: "view-all" }),
      resp({ clientId: "c3", clientNombre: "Tres", personaEmail: "a@x", valor: "no_se" }),
    ]);
    expect(r.conteo).toEqual({ si: 1, no: 0, no_se: 2 });
    const dos = r.clientes.find((c) => c.clientId === "c2")!;
    expect(dos.desacuerdo).toBe(true);
    expect(dos.lectura).toBeNull();
    expect(r.personas).toBe(2);
  });

  it("solo la versión vigente; el nombre del cliente es el de la respuesta más reciente", () => {
    const r = resultadosDe(p, [
      resp({ preguntaVersion: p.version - 1, valor: "no" }),
      resp({ clientNombre: "Nombre viejo", createdAt: haceDias(5), personaEmail: "a@x" }),
      resp({ clientNombre: "Nombre nuevo", createdAt: haceDias(1), personaEmail: "b@x" }),
    ]);
    expect(r.respuestas).toBe(2);
    expect(r.clientes[0].clientNombre).toBe("Nombre nuevo");
  });
});

describe("csvDeEventos", () => {
  it("todos los eventos, en orden, con BOM y comillas donde hace falta", () => {
    const csv = csvDeEventos([
      {
        createdAt: haceDias(1),
        clave: p.clave,
        preguntaVersion: 1,
        preguntaTexto: p.pregunta,
        clientId: "c1",
        clientNombre: "Uno, S.A.",
        personaEmail: "a@x",
        rol: "CSE",
        motivoDeAcceso: "hubspot-owner",
        evento: "respondida",
        valor: "si",
        porQue: 'dijo "ayúdennos"',
      },
      {
        createdAt: haceDias(2),
        clave: p.clave,
        preguntaVersion: 1,
        preguntaTexto: p.pregunta,
        clientId: "c1",
        clientNombre: "Uno, S.A.",
        personaEmail: "a@x",
        rol: "CSE",
        motivoDeAcceso: null,
        evento: "mostrada",
        valor: null,
        porQue: null,
      },
    ]);
    expect(csv.startsWith("﻿fecha,")).toBe(true);
    const lineas = csv.trim().split("\r\n");
    expect(lineas).toHaveLength(3);
    expect(lineas[1]).toContain(",mostrada,");
    expect(lineas[2]).toContain('"Uno, S.A."');
    expect(lineas[2]).toContain('"dijo ""ayúdennos"""');
  });
});
