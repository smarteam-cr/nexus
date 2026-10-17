/**
 * lib/seguimiento/reunion/reunion.test.ts — cada reunión con su página (ficha G, 2026-10-17): la agenda, los avisos, la
 * próxima reunión sugerida con su enlace a Google Calendar, y las guardas (quién escribe, qué lee el correo).
 * Correr: `npx vitest run lib/seguimiento/reunion --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { armarAgenda, diaCortoCR } from "./agenda";
import { avisoLlevaALaReunion, avisosDeLaReunion, type EntradaDeLosAvisos } from "./avisos";
import {
  aHoraLocalCR,
  deHoraLocalCR,
  duracionSugerida,
  enlaceParaAgendar,
  inicioSugerido,
  invitadosDeLaProxima,
  proximaAgendadaParaElCorreo,
  proximaDelAgente,
  sugerirProxima,
} from "./proxima";
import { leerCorreoGuardado } from "./correo";
import { pedidoDelCorreo, type ContextoDelCorreo } from "@/lib/exploraciones/correo-de-seguimiento-pedido";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("la agenda de una reunión", () => {
  it("lo escrito a mano va primero; la invitación y lo planeado, después, cada uno con de dónde sale", () => {
    const a = armarAgenda({
      escrita: { texto: "Revisar la integración", porNombre: "Ana", en: "2026-10-15T16:00:00.000Z" },
      invitacion: "1. Pipeline\n2. Reportes",
      planeada: { reunionId: "s0", reunionTitulo: "Kickoff", reunionFecha: "2026-10-08T15:00:00.000Z", titulo: "Seguimiento", objetivo: "Ver el avance del pipeline" },
    });
    expect(a.partes.map((p) => p.fuente)).toEqual(["escrita", "invitacion", "planeada"]);
    expect(a.partes[0].deDonde).toBe("La escribió Ana el 15 oct");
    expect(a.partes[2]).toMatchObject({ texto: "Seguimiento: Ver el avance del pipeline", reunion: { id: "s0" } });
    expect(a.escrita).toBe("Revisar la integración");
  });

  it("no repite lo que ya dice otra parte, y sin nada queda vacía", () => {
    const a = armarAgenda({ escrita: { texto: "Pipeline y reportes. Y algo más", porNombre: null, en: null }, invitacion: "pipeline y reportes", planeada: null });
    expect(a.partes).toHaveLength(1);
    expect(armarAgenda({ escrita: null, invitacion: null, planeada: null }).partes).toEqual([]);
  });

  it("las fechas en hora de Costa Rica (UTC-6): las 3 de la mañana UTC todavía son el día anterior", () => {
    expect(diaCortoCR("2026-10-16T03:00:00.000Z")).toBe("15 oct");
  });
});

const base: EntradaDeLosAvisos = {
  ahora: new Date("2026-10-17T18:00:00.000Z"),
  fecha: "2026-10-16T15:00:00.000Z",
  duracionMin: 60,
  dueno: { id: "c1", nombre: "ACME", kind: "CLIENTE" },
  puertasAdentro: false,
  tieneTexto: true,
  enriquecida: true,
  lectura: { estado: "lista", error: null },
  proyectosDelCliente: 2,
  proyectosVinculados: 1,
  personales: [],
};

describe("los avisos de una reunión", () => {
  it("una reunión sana con un cliente no tiene avisos", () => {
    expect(avisosDeLaReunion(base)).toEqual([]);
  });

  it("sin transcripción: espera dos días y después pide agregar lo que pasó", () => {
    expect(avisosDeLaReunion({ ...base, tieneTexto: false }).map((a) => a.clave)).toEqual(["esperando-texto"]);
    const viejo = avisosDeLaReunion({ ...base, tieneTexto: false, ahora: new Date("2026-10-20T18:00:00.000Z") });
    expect(viejo.map((a) => a.clave)).toEqual(["sin-texto"]);
    expect(viejo[0].accion?.tipo).toBe("agregar-reunion");
  });

  it("sin cliente, de un aliado, de puertas adentro, sin proyecto, la lectura con error", () => {
    expect(avisosDeLaReunion({ ...base, dueno: null, proyectosDelCliente: 0 }).map((a) => a.clave)).toEqual(["sin-cliente"]);
    expect(avisosDeLaReunion({ ...base, dueno: { id: "c2", nombre: "4am", kind: "ALIADO" } }).map((a) => a.clave)).toEqual(["sin-tarjeta"]);
    expect(avisosDeLaReunion({ ...base, puertasAdentro: true }).map((a) => a.clave)).toEqual(["puertas-adentro"]);
    expect(avisosDeLaReunion({ ...base, proyectosVinculados: 0 }).map((a) => a.clave)).toEqual(["sin-proyecto"]);
    expect(avisosDeLaReunion({ ...base, lectura: { estado: "error", error: "Se cortó" } })[0].texto).toContain("Se cortó");
  });

  it("una reunión que todavía no ocurre lo dice y no pide la transcripción", () => {
    expect(avisosDeLaReunion({ ...base, fecha: "2026-10-18T15:00:00.000Z", tieneTexto: false }).map((a) => a.clave)).toEqual(["futura"]);
  });

  it("los avisos de «Para ti» de quien mira: lo no leído primero", () => {
    const a = avisosDeLaReunion({
      ...base,
      personales: [
        { id: "a1", titulo: "Viejo", detalle: null, creadoAt: "2026-10-10T15:00:00.000Z", leidoAt: "2026-10-11T15:00:00.000Z" },
        { id: "a2", titulo: "El texto de la reunión cambió.", detalle: "Revisa la minuta.", creadoAt: "2026-10-09T15:00:00.000Z", leidoAt: null },
      ],
    });
    expect(a.map((x) => x.clave)).toEqual(["aviso:a2", "aviso:a1"]);
    expect(a[0]).toMatchObject({ tono: "atencion", texto: "El texto de la reunión cambió. Revisa la minuta.", llego: { leido: false } });
  });

  it("un aviso lleva a ESTA reunión solo con su id entero (no a otra que empieza igual)", () => {
    expect(avisoLlevaALaReunion("/sessions/gmeet_ab#lo-que-dejo", "gmeet_ab")).toBe(true);
    expect(avisoLlevaALaReunion("/sessions/gmeet_abc", "gmeet_ab")).toBe(false);
  });
});

describe("la próxima reunión sugerida", () => {
  const reunion = { titulo: "Seguimiento ACME", fecha: "2026-10-16T15:00:00.000Z", duracionMin: 50, participantes: ["Ana@acme.com", "eli@smarteamcr.com", "sala@resource.calendar.google.com", "noreply@acme.com", "ana@acme.com"] };
  const ahora = new Date("2026-10-17T18:00:00.000Z");

  it("una semana después a la misma hora, con lo que duró y los que estuvieron (sin salas ni sistemas)", () => {
    const p = sugerirProxima({ reunion, empresa: "ACME", guardado: null, ahora });
    expect(p.inicio).toBe("2026-10-23T15:00:00.000Z");
    expect(p.duracionMin).toBe(45);
    expect(p.invitados).toEqual(["ana@acme.com", "eli@smarteamcr.com"]);
    expect(p).toMatchObject({ deDonde: "nexus", estado: "pendiente", titulo: "Seguimiento · ACME" });
    expect(p.objetivo).toContain("16 oct");
  });

  it("nunca en fin de semana, y nunca en el pasado (una reunión vieja va a mañana)", () => {
    // Viernes 16 oct + 7 = viernes 23: hábil. Sábado 17 a las 9 CR + 7 = sábado 24 → lunes 26.
    expect(inicioSugerido("2026-10-17T15:00:00.000Z", ahora)).toBe("2026-10-26T15:00:00.000Z");
    // Una reunión de agosto: mañana (domingo 18) → lunes 19, a la hora de la reunión.
    expect(inicioSugerido("2026-08-03T16:30:00.000Z", ahora)).toBe("2026-10-19T16:30:00.000Z");
  });

  it("lo que cambió una persona manda sobre lo del agente, y lo del agente sobre lo de Nexus", () => {
    const delAgente = sugerirProxima({
      reunion,
      empresa: "ACME",
      guardado: { titulo: "Revisión del pipeline", objetivo: "Validar las etapas", inicio: null, duracionMin: null, estado: null, porEmail: null, porNombre: null, en: null },
      ahora,
    });
    expect(delAgente).toMatchObject({ deDonde: "agente", titulo: "Revisión del pipeline", objetivo: "Validar las etapas" });
    const dePersona = sugerirProxima({
      reunion,
      empresa: "ACME",
      guardado: { titulo: "X", objetivo: "Y", inicio: "2026-10-22T20:00:00.000Z", duracionMin: 90, estado: "agendada", porEmail: "eli@smarteamcr.com", porNombre: "Elías", en: "2026-10-17T18:00:00.000Z" },
      ahora,
    });
    expect(dePersona).toMatchObject({ deDonde: "persona", estado: "agendada", inicio: "2026-10-22T20:00:00.000Z", duracionMin: 90, decidida: { porNombre: "Elías" } });
  });

  it("el enlace de Google Calendar lleva todo lleno, con la zona de Costa Rica", () => {
    const u = new URL(enlaceParaAgendar({ titulo: "Seguimiento", objetivo: "Revisar", inicio: "2026-10-23T15:00:00.000Z", duracionMin: 45, invitados: ["ana@acme.com", "no es correo"] }));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261023T150000Z/20261023T154500Z");
    expect(u.searchParams.get("details")).toBe("Revisar");
    expect(u.searchParams.get("add")).toBe("ana@acme.com");
    expect(u.searchParams.get("ctz")).toBe("America/Costa_Rica");
  });

  it("la hora local de Costa Rica va y vuelve", () => {
    expect(aHoraLocalCR("2026-10-23T15:00:00.000Z")).toBe("2026-10-23T09:00");
    expect(deHoraLocalCR("2026-10-23T09:00")).toBe("2026-10-23T15:00:00.000Z");
    expect(deHoraLocalCR("mañana")).toBeNull();
  });

  it("duración, invitados y lo que devolvió el agente, saneados", () => {
    expect([0, 20, 40, 55, 75, 200].map(duracionSugerida)).toEqual([45, 30, 45, 60, 60, 90]);
    expect(invitadosDeLaProxima(["a@b.com", "notetaker@read.ai", "x@group.calendar.google.com"])).toEqual(["a@b.com"]);
    expect(proximaDelAgente({ proximaReunion: { titulo: "T", objetivo: "  O  " } })).toEqual({ titulo: "T", objetivo: "O" });
    expect(proximaDelAgente({ proximaReunion: { titulo: "T", objetivo: "" } })).toBeNull();
    expect(proximaDelAgente(null)).toBeNull();
  });

  it("el correo confirma la próxima solo si se agendó y su día no pasó", () => {
    const g = { titulo: "T", objetivo: "O", inicio: "2026-10-23T15:00:00.000Z", duracionMin: 45, estado: "agendada", porEmail: "e", porNombre: null, en: null };
    expect(proximaAgendadaParaElCorreo(g, "2026-10-17")).toEqual({ titulo: "T", fecha: "2026-10-23T15:00:00.000Z" });
    expect(proximaAgendadaParaElCorreo({ ...g, estado: null }, "2026-10-17")).toBeNull();
    expect(proximaAgendadaParaElCorreo(g, "2026-10-24")).toBeNull();
  });
});

describe("el correo de la reunión es el de las exploraciones", () => {
  const ctx = (o: Partial<ContextoDelCorreo>): ContextoDelCorreo => ({
    marco: "reunion",
    empresa: "ACME",
    reunion: { titulo: "Seguimiento", fecha: "2026-10-16T15:00:00.000Z" },
    firma: "Ana",
    equipo: [],
    para: [],
    hoy: "2026-10-17",
    insumos: { resumen: null, minuta: null, compromisos: [], cuenta: "", respuestas: [], preguntasAbiertas: [], siguientePaso: null, proxima: null },
    reunionTexto: "Ana: hola",
    ...o,
  });
  const propiedades = (c: ContextoDelCorreo) => Object.keys((pedidoDelCorreo(c).tools?.[0] as { input_schema: { properties: object } }).input_schema.properties);

  it("pide la próxima reunión solo cuando la página de la reunión la pide: la exploración queda igual", () => {
    expect(propiedades(ctx({ pedirProxima: true }))).toContain("proximaReunion");
    expect(propiedades(ctx({ marco: "cs" }))).not.toContain("proximaReunion");
  });

  it("una reunión de trabajo con un cliente se presenta como tal", () => {
    expect(String(pedidoDelCorreo(ctx({})).system)).toContain("una reunión de trabajo con un cliente que ya compró");
  });

  it("el correo guardado se lee con tolerancia: uno a medias no se muestra", () => {
    expect(leerCorreoGuardado({ asunto: "A", cuerpo: "B", en: "x", corridaId: "r", para: ["a@b.com", 3] })).toEqual({ asunto: "A", cuerpo: "B", en: "x", corridaId: "r", para: ["a@b.com"] });
    expect(leerCorreoGuardado({ asunto: "A" })).toBeNull();
  });
});

describe("⛔ las guardas de la página de una reunión", () => {
  const archivos = (dir: string): string[] => {
    const abs = path.join(RAIZ, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "node_modules" ? [] : archivos(rel);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
    });
  };
  const TODO = ["app", "lib", "components", "scripts"].flatMap((d) => archivos(d));

  it("solo guardado-server.ts escribe SeguimientoDeReunion", () => {
    const escritores = TODO.filter((r) => /\.seguimientoDeReunion\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(soloCodigo(leer(r))));
    expect(escritores).toEqual(["lib/seguimiento/reunion/guardado-server.ts"]);
  });

  it("el correo nunca lee Tareas ni los hechos de las reuniones (lo lee el cliente)", () => {
    const src = soloCodigo(leer("lib/seguimiento/reunion/correo-server.ts"));
    expect(src).not.toMatch(/@\/lib\/tareas\/|\.tarea\.|hechoDeReunion|@\/lib\/seguimiento\/hechos|compromisos-server/);
    expect(src, "la memoria con el alcance del cliente").toContain('lector: "correo"');
    expect(src, "el mismo correo que las exploraciones").toContain("escribirElCorreoDeSeguimiento(");
    expect(src, "la reunión por el chokepoint").toContain("reunionParaElCorreo(");
  });

  it("las rutas nuevas piden acceso al cliente de la reunión", () => {
    for (const r of ["app/api/sessions/[id]/seguimiento/route.ts", "app/api/sessions/[id]/correo/route.ts"]) {
      expect(soloCodigo(leer(r)), r).toContain("guardAccesoALaReunion(");
    }
  });

  it("nada de la página escribe en el calendario ni manda correos", () => {
    const deLaPagina = TODO.filter((r) => r.startsWith("lib/seguimiento/reunion/") || r.startsWith("components/sessions/reunion/"));
    expect(deLaPagina.length).toBeGreaterThan(5);
    for (const r of deLaPagina) {
      expect(soloCodigo(leer(r)), r).not.toMatch(/events\.insert|events\.patch|gmail|sendMail|nodemailer|getAgendaWriteAuth/);
    }
  });
});
