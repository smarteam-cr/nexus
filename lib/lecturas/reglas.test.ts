/**
 * lib/lecturas/reglas.test.ts — LAS REGLAS DE LA LECTURA DE SEGUIMIENTO (memoria de la cuenta, etapa 2).
 *
 * Una sola regla para el job, la cola, el enriquecimiento, los requisitos e INV44: si dos tuvieran su copia, el job
 * podría tomar una reunión que INV44 no espera, o al revés.
 *
 * Correr: `npx vitest run lib/lecturas/reglas.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DIAS_DE_FRESCURA,
  ESTADOS_DE_SEGUIMIENTO,
  ESTADOS_QUE_CUENTAN,
  ESTADOS_QUE_SE_ENCOLAN,
  MAX_INTENTOS,
  MINUTOS_COLGADA,
  SEGUNDOS_DE_GRACIA,
  SEGUNDOS_POR_LECTURA,
  TOPE_DE_TOKENS,
  TOPE_SIN_STREAMING,
  debeEncolar,
  esperaDelIntento,
  finDeLaLectura,
  motivoParaNoEncolar,
  rutaDeLaLectura,
  seguimientoPrendido,
} from "./reglas";

const AHORA = new Date("2026-10-10T15:00:00Z");
const hace = (dias: number) => new Date(+AHORA - dias * 86_400_000);

describe("qué se lee según la empresa", () => {
  it("de un cliente, todo; de un prospecto, la minuta y los compromisos; de un aliado, de Smarteam o sin dueño, nada", () => {
    expect(rutaDeLaLectura("CLIENTE")).toBe("completa");
    expect(rutaDeLaLectura("PROSPECTO")).toBe("prospecto");
    expect(rutaDeLaLectura("ALIADO")).toBeNull();
    expect(rutaDeLaLectura("INTERNO")).toBeNull();
    expect(rutaDeLaLectura(null)).toBeNull();
  });
});

describe("qué se encola", () => {
  const base = { kind: "CLIENTE", puertasAdentro: false, fecha: hace(2), largoTranscript: 5_000, ahora: AHORA };

  it("una reunión fresca de un cliente o un prospecto, con transcripción, se encola", () => {
    expect(debeEncolar(base)).toBe(true);
    expect(debeEncolar({ ...base, kind: "PROSPECTO" })).toBe(true);
  });

  it(`la frescura: ${DIAS_DE_FRESCURA} días o menos (lo rescatado de hace meses no se lee solo)`, () => {
    expect(debeEncolar({ ...base, fecha: hace(DIAS_DE_FRESCURA - 0.1) })).toBe(true);
    expect(motivoParaNoEncolar({ ...base, fecha: hace(DIAS_DE_FRESCURA + 0.1) })).toBe("vieja");
  });

  it("la transcripción mínima (la del enriquecimiento: 200 caracteres)", () => {
    expect(motivoParaNoEncolar({ ...base, largoTranscript: 199 })).toBe("sin_texto");
    expect(debeEncolar({ ...base, largoTranscript: 200 })).toBe(true);
  });

  it("ni una agendada, ni una de un aliado, ni una sin dueño", () => {
    expect(motivoParaNoEncolar({ ...base, fecha: new Date(+AHORA + 60_000) })).toBe("futura");
    expect(motivoParaNoEncolar({ ...base, kind: "ALIADO" })).toBe("no_es_cliente");
    expect(motivoParaNoEncolar({ ...base, kind: null })).toBe("sin_duenio");
  });

  it("⭐ una de puertas adentro (solo estuvo el equipo) no, aunque la cascada le haya puesto un cliente por el título", () => {
    expect(motivoParaNoEncolar({ ...base, puertasAdentro: true })).toBe("puertas_adentro");
    expect(debeEncolar({ ...base, puertasAdentro: true })).toBe(false);
  });

  it("una persona que pide una reunión puntual salta el corte de 14 días, nada más", () => {
    const vieja = { ...base, fecha: hace(DIAS_DE_FRESCURA + 30) };
    expect(motivoParaNoEncolar(vieja, { sinCorteDeFrescura: true })).toBeNull();
    expect(motivoParaNoEncolar({ ...vieja, puertasAdentro: true }, { sinCorteDeFrescura: true })).toBe("puertas_adentro");
    expect(motivoParaNoEncolar({ ...vieja, largoTranscript: 10 }, { sinCorteDeFrescura: true })).toBe("sin_texto");
  });

  it("⭐ etapa 6: con la lectura de hechos prendida, una reunión con solo notas (400 o más) también entra; sin la bandera, no", () => {
    const soloNotas = { ...base, largoTranscript: 0, largoNotas: 600 };
    expect(motivoParaNoEncolar(soloNotas)).toBe("sin_texto");
    expect(motivoParaNoEncolar(soloNotas, { leerSoloNotas: true })).toBeNull();
    expect(motivoParaNoEncolar({ ...soloNotas, largoNotas: 399 }, { leerSoloNotas: true })).toBe("sin_texto");
    // Lo demás se sigue mirando igual.
    expect(motivoParaNoEncolar({ ...soloNotas, puertasAdentro: true }, { leerSoloNotas: true })).toBe("puertas_adentro");
    expect(motivoParaNoEncolar({ ...soloNotas, fecha: hace(DIAS_DE_FRESCURA + 1) }, { leerSoloNotas: true })).toBe("vieja");
    // La cola pasa la bandera y el largo de las notas.
    const cola = fs.readFileSync(path.join(process.cwd(), "lib/lecturas/cola.ts"), "utf8");
    expect(cola).toContain("leerSoloNotas: hechosPrendidos(process.env)");
    expect(cola).toContain("largoNotas:");
  });
});

describe("la cola: reintentos, colgadas y estados", () => {
  it("se reintenta a los 5 y a los 30 minutos; a la tercera, queda en error", () => {
    expect(MAX_INTENTOS).toBe(3);
    expect(esperaDelIntento(1)).toBe(5 * 60_000);
    expect(esperaDelIntento(2)).toBe(30 * 60_000);
    expect(esperaDelIntento(3)).toBeNull();
  });

  it(`una lectura con más de ${MINUTOS_COLGADA} minutos leyendo se da por colgada`, () => {
    expect(MINUTOS_COLGADA).toBe(15);
  });

  it("INV44 cuenta lista, sin texto, copia y error (no lo que espera ni lo que se está leyendo)", () => {
    expect([...ESTADOS_QUE_CUENTAN].sort()).toEqual(["copia", "error", "lista", "sin_texto"]);
    expect(ESTADOS_QUE_CUENTAN).not.toContain("en_espera");
    expect(ESTADOS_QUE_CUENTAN).not.toContain("leyendo");
  });

  it("nunca se vuelve a encolar una lista, una copia ni una que se está leyendo", () => {
    for (const e of ["lista", "copia", "leyendo", "en_espera"]) expect(ESTADOS_QUE_SE_ENCOLAN).not.toContain(e);
  });

  it("lo que devolvió la lectura → cómo termina la fila (ya tenía minuta es lo mismo que leída)", () => {
    expect(finDeLaLectura({ status: "ok" })).toEqual({ estado: "lista" });
    expect(finDeLaLectura({ status: "skipped" })).toEqual({ estado: "lista" });
    expect(finDeLaLectura({ status: "sin_texto" })).toEqual({ estado: "sin_texto" });
    expect(finDeLaLectura({ status: "omitida" })).toEqual({ estado: "omitida" });
    expect(finDeLaLectura({ status: "error", reason: "Claude: 529" })).toEqual({ estado: "error", error: "Claude: 529" });
  });

  it("⭐ el SQL permite exactamente los estados de la regla (el CHECK y la lista no pueden divergir)", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "scripts/sql/2026-10-10-lectura-de-seguimiento.sql"), "utf8");
    const check = sql.match(/"seguimientoEstado" IN \(([^)]*)\)/)?.[1] ?? "";
    expect(check.split(",").map((s) => s.trim().replace(/'/g, "")).sort()).toEqual([...ESTADOS_DE_SEGUIMIENTO].sort());
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});

describe("la bandera y el tope", () => {
  it("solo «0» apaga; sin la variable (o vacía), prendida", () => {
    expect(seguimientoPrendido({})).toBe(true);
    expect(seguimientoPrendido({ SEGUIMIENTO_REUNIONES_ENABLED: "" })).toBe(true);
    expect(seguimientoPrendido({ SEGUIMIENTO_REUNIONES_ENABLED: "1" })).toBe(true);
    expect(seguimientoPrendido({ SEGUIMIENTO_REUNIONES_ENABLED: "0" })).toBe(false);
  });

  it("⭐ el tope de la lectura alcanza para lo que el código permite, y una lectura viva nunca se da por colgada", () => {
    // Clasificador + 6.000 + 12.000 tokens de Sonnet: con 120 s toda lectura que se cortaba vencía el tope.
    expect(SEGUNDOS_POR_LECTURA).toBeGreaterThanOrEqual(300);
    expect(MINUTOS_COLGADA * 60).toBeGreaterThan(SEGUNDOS_POR_LECTURA + SEGUNDOS_DE_GRACIA);
  });

  it("el tope de tokens nunca pasa 21.333 (sin streaming, una llamada más grande lanza)", () => {
    expect(TOPE_SIN_STREAMING).toBe(21_333);
    for (const t of TOPE_DE_TOKENS) expect(t).toBeLessThanOrEqual(TOPE_SIN_STREAMING);
    expect(TOPE_DE_TOKENS[1]).toBeGreaterThan(TOPE_DE_TOKENS[0]);
  });
});

describe("las piezas de la cola respetan su frontera", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el enriquecimiento solo encola (y con la bandera apagada, el post-proceso viejo)", () => {
    const src = leer("lib/google/meet-enrichment.ts");
    expect(src).toContain("encolarSeguimiento(s.id)");
    expect(src).toContain("postProcessSessionViejo(s.id)");
    expect(src).not.toMatch(/postProcessSession\(s\.id\)/);
    expect(src).toContain("DIAS_DE_FRESCURA");
  });

  it("⭐ el tope CORTA la lectura (no solo la espera), y pasado el corte la fila no vuelve a la cola mientras la lectura vive", () => {
    const leerSrc = leer("lib/lecturas/leer.ts");
    expect(leerSrc).toContain("new AbortController()");
    expect(leerSrc).toContain("signal: corte.signal");
    expect(leerSrc, "una lectura que no terminó se queda «leyendo»").toContain('estado: "leyendo"');
    expect(leerSrc, "ya no hay un Promise.race que suelta la lectura").not.toContain("conTope(");
    const pp = leer("lib/sessions/post-process.ts");
    expect(pp).toContain("opts.signal ? { signal: opts.signal } : undefined");
    expect(pp, "el clasificador también se corta").toContain("classifySessionToProjects(sessionId, client.id, { signal: opts.signal })");
  });

  it("toda llamada de la lectura queda atribuida a su reunión (el costo por reunión, sin SQL)", () => {
    expect(leer("lib/sessions/post-process.ts")).toContain("conLaReunion(sessionId, () => leer(sessionId, opts))");
    expect(leer("lib/sessions/vincular-al-llegar.ts")).toContain("conLaReunion(f.id, () => classifySessionToProjects(f.id, dueno))");
    expect(leer("lib/ai/medidor.ts")).toContain("origen: origenDeLaFila(ctx)");
  });
});
