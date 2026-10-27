/**
 * lib/tests-diagnostico/nucleo.test.ts — el test del diagnóstico de rendimiento: el banco, el cálculo, la dirección del
 * resultado y la nota de HubSpot (área O del roadmap, 2026-10-26). Con la mini-escala de los tests del lector.
 */
import { describe, expect, it } from "vitest";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA, MINI_ESCALA_CON_EDICION } from "@/lib/escala/documento/mini-escala.fixture";
import { leerResultadoDelTest } from "@/lib/exploraciones/test-de-marketing";
import { leerNotaDelTest } from "@/lib/exploraciones/llegadas";
import { borradorDesdeLaEscala, borradoresDeLaEscala, codigoDeLaEscala, planDeLosBancos, problemasDelBanco, type BancoParaElPlan } from "./banco";
import { resultadoDelTest } from "./resultado";
import { urlDelResultado } from "./enlace";
import { notaDelTestSinTerminar, notaDelTestTerminado } from "./nota";
import { leerPreguntasDelBanco, NO_LO_SE } from "./tipos";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];

describe("el borrador sale de la escala y se revisa antes de aprobar", () => {
  const web = borradorDesdeLaEscala(escala, area.id, "web");

  it("la web pregunta todas las dimensiones, cada una con sus cinco niveles", () => {
    expect(web.map((p) => p.dimensionId)).toEqual(area.dimensiones.map((d) => d.id));
    for (const p of web) expect(p.opciones.map((o) => o.nivel)).toEqual(["D", "I", "F", "E", "O"]);
    expect(problemasDelBanco(escala, area.id, "web", web)).toEqual([]);
  });

  it("la de Marketing sale de la capa base", () => {
    const mk = borradorDesdeLaEscala(escala, area.id, "marketing");
    const base = area.dimensiones.filter((d) => d.capa === "base").map((d) => d.id);
    expect(mk.map((p) => p.dimensionId)).toEqual(base);
  });

  it("nunca se veta un nivel: una pregunta sin Funcional no se puede aprobar", () => {
    const sinF = web.map((p, i) => (i === 0 ? { ...p, opciones: p.opciones.filter((o) => o.nivel !== "F") } : p));
    expect(problemasDelBanco(escala, area.id, "web", sinF).join(" ")).toMatch(/no deja elegir todos los niveles/);
  });

  it("ningún texto nombra un nivel, ni falta una dimensión, ni se repite", () => {
    const nombra = web.map((p, i) => (i === 0 ? { ...p, texto: "¿Ya están en nivel Funcional?" } : p));
    expect(problemasDelBanco(escala, area.id, "web", nombra).join(" ")).toMatch(/nombra un nivel/);
    expect(problemasDelBanco(escala, area.id, "web", web.slice(0, 1)).join(" ")).toMatch(/Falta preguntar/);
    expect(problemasDelBanco(escala, area.id, "web", [web[0], web[0]]).join(" ")).toMatch(/repite una dimensión/);
  });

  it("ningún texto muestra un código de la escala; un número suelto sí se puede", () => {
    const conCodigo = web.map((p, i) => (i === 0 ? { ...p, opciones: p.opciones.map((o, k) => (k === 0 ? { ...o, texto: "Cumple 1.2.F1 a medias" } : o)) } : p));
    expect(problemasDelBanco(escala, area.id, "web", conCodigo).join(" ")).toMatch(/muestra un código de la escala \(«1\.2\.F1»\)/);
    expect(codigoDeLaEscala("Lo que pide la dimensión (1.3)")).toBe("(1.3)");
    expect(codigoDeLaEscala("El nivel 2.4.E")).toBe("2.4.E");
    expect(codigoDeLaEscala("Facturan 2.5 millones al año")).toBeNull();
    expect(codigoDeLaEscala("La versión 1.2.0 del sistema")).toBeNull();
    // Al final de una oración, con su punto, también.
    expect(codigoDeLaEscala("Lo que pide la dimensión (1.3).")).toBe("(1.3)");
    expect(codigoDeLaEscala("Cumple 1.2.F1.")).toBe("1.2.F1");
  });

  it("los borradores de toda la escala: cada área × versión, para la general y cada edición, sin bancos vacíos", () => {
    const conEdicion = parsearEscala(MINI_ESCALA_CON_EDICION);
    const slug = conEdicion.ediciones[0].slug;
    const todos = borradoresDeLaEscala(conEdicion);
    expect(new Set(todos.map((b) => b.edicion))).toEqual(new Set(["general", slug]));
    expect(todos.every((b) => b.preguntas.length > 0)).toBe(true);
    const claves = todos.map((b) => `${b.area}:${b.version}:${b.edicion}`);
    expect(new Set(claves).size).toBe(claves.length);
    expect(todos.find((b) => b.area === area.id && b.version === "web" && b.edicion === "general")?.preguntas).toEqual(web);
    // La de la edición se arma con la escala vista por ella (sus palabras), no con la general.
    const deLaEdicion = todos.find((b) => b.area === area.id && b.version === "web" && b.edicion === slug)!;
    expect(deLaEdicion.preguntas).toEqual(borradorDesdeLaEscala(aplicarEdicion(conEdicion, slug), area.id, "web"));
    expect(deLaEdicion.preguntas).not.toEqual(web);
  });

  describe("el plan del script que genera y aprueba los bancos de una vez", () => {
    const POR = "scripts/tests-preguntas.ts";
    const borradores = borradoresDeLaEscala(escala).map((b) => ({ ...b, preguntas: leerPreguntasDelBanco(b.preguntas) }));
    const b0 = borradores.find((b) => b.version === "web")!;
    const guardado = (o: Partial<BancoParaElPlan>): BancoParaElPlan => ({
      area: b0.area,
      version: b0.version,
      edicion: b0.edicion,
      escalaVersion: escala.version,
      preguntas: b0.preguntas,
      aprobadas: null,
      editadoPor: POR,
      ...o,
    });
    const accionDe = (bancos: BancoParaElPlan[]) => planDeLosBancos(escala, [b0], bancos, POR)[0].accion;
    const editado = b0.preguntas.map((p, i) => (i === 0 ? { ...p, texto: "Una pregunta escrita por Elías" } : p));

    it("lo que falta se crea; lo que ya está aprobado igual y con esta escala no se toca", () => {
      expect(accionDe([])).toEqual({ tipo: "crear" });
      expect(accionDe([guardado({ aprobadas: b0.preguntas })])).toEqual({ tipo: "al-dia" });
    });

    it("un borrador igual al generado se aprueba, lo haya generado quien sea", () => {
      expect(accionDe([guardado({})])).toEqual({ tipo: "aprobar" });
      expect(accionDe([guardado({ editadoPor: "elias@smarteamcr.com" })])).toEqual({ tipo: "aprobar" });
      expect(accionDe([guardado({ aprobadas: b0.preguntas, escalaVersion: "0.1.0" })])).toEqual({ tipo: "aprobar" });
    });

    it("⛔ lo que editó una persona no se toca, aprobado o no", () => {
      expect(accionDe([guardado({ preguntas: editado, editadoPor: "elias@smarteamcr.com" })])).toEqual({ tipo: "de-una-persona", aprobado: false });
      expect(accionDe([guardado({ preguntas: editado, aprobadas: editado, editadoPor: "elias@smarteamcr.com" })])).toEqual({ tipo: "de-una-persona", aprobado: true });
    });

    it("lo que armó el script con otra escala se rearma", () => {
      expect(accionDe([guardado({ preguntas: editado, escalaVersion: "0.1.0" })])).toEqual({ tipo: "rearmar", desde: "0.1.0" });
    });

    it("⛔ con problemas no se aprueba (el plan los trae)", () => {
      const malo = { ...b0, preguntas: b0.preguntas.slice(0, 1) };
      expect(planDeLosBancos(escala, [malo], [], POR)[0].problemas.join(" ")).toMatch(/Falta preguntar/);
    });
  });

  it("el banco guardado se lee tolerante", () => {
    expect(leerPreguntasDelBanco(web)).toEqual(web);
    expect(leerPreguntasDelBanco([{ id: "x" }, null, "basura"])).toEqual([]);
  });
});

describe("el resultado lo calcula Nexus con el chequeo", () => {
  const web = borradorDesdeLaEscala(escala, area.id, "web");
  const elegir = (letras: string[]) =>
    Object.fromEntries(web.map((p, i) => [p.id, { opcion: letras[i] === "?" ? NO_LO_SE : p.opciones.find((o) => o.nivel === letras[i])!.id }]));

  it("ubica el área, recomienda una sola dimensión con su razón y su costo, y lo marca estimado", () => {
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas: elegir(["F", "I"]) })!;
    expect(r.nivel).toBe("I");
    expect(r.recomendacion?.tipo).toBe("trabajar");
    if (r.recomendacion?.tipo === "trabajar") {
      expect(r.recomendacion.dimensionId).toBe(area.dimensiones[1].id);
      expect(r.recomendacion.razon.length).toBeGreaterThan(10);
    }
    expect(r.sintesis).toMatch(/estimado/);
    expect(r.preguntadas).toBe(area.dimensiones.length);
  });

  it("«No lo sé» cuenta como el nivel más bajo", () => {
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas: elegir(["?", "O"]) })!;
    expect(r.dimensiones[0]).toMatchObject({ nivel: "D", noLoSe: true });
  });

  it("la de Marketing no cuenta lo que no preguntó, y lo dice", () => {
    const mk = borradorDesdeLaEscala(escala, area.id, "marketing");
    const r = resultadoDelTest({ escala, areaId: area.id, version: "marketing", preguntas: mk, respuestas: { [mk[0].id]: { opcion: mk[0].opciones[2].id } } })!;
    expect(r.preguntadas).toBe(mk.length);
    expect(r.dimensiones.filter((d) => !d.preguntada).every((d) => d.nivel === null)).toBe(true);
    if (r.preguntadas < r.total) expect(r.sintesis).toMatch(/de las \d+ dimensiones/);
  });
});

describe("la dirección del resultado la siguen leyendo la preventa y «Llegaron por el test»", () => {
  const url = urlDelResultado("https://nexus.smarteamcr.com/", "tok_123", {
    areaId: "1",
    fecha: "2026-10-26",
    dimensiones: [
      { id: "1.1", nivel: "F", respuesta: "Tenemos un proceso escrito", matiz: "solo en ventas" },
      { id: "1.2", nivel: "I", respuesta: null, matiz: null },
    ],
  });

  it("v2: la escala de hoy, sin traducir", () => {
    expect(url.startsWith("https://nexus.smarteamcr.com/external/test/resultado/tok_123#")).toBe(true);
    const r = leerResultadoDelTest(url)!;
    expect(r.areaId).toBe("1");
    expect(r.fecha).toBe("2026-10-26");
    expect(r.respuestas.map((x) => [x.dimensionId, x.nivel])).toEqual([["1.1", "F"], ["1.2", "I"]]);
    expect(r.respuestas[0].matiz).toBe("solo en ventas");
  });

  it("la nota terminada se lee como hoy, con su enlace", () => {
    const html = notaDelTestTerminado({
      areaNombre: "Ventas",
      nombre: "Ana Pérez",
      email: "ana@acme.com",
      empresa: "Acme",
      dominio: "acme.com",
      industria: "Banca",
      puesto: "Gerente",
      version: "Test web (8 preguntas)",
      nivelNombre: "Inicial",
      recomendacion: "Procesos y Rutinas",
      url,
    });
    const n = leerNotaDelTest(html)!;
    expect(n).toMatchObject({ estado: "terminado", areaId: "1", email: "ana@acme.com", dominio: "acme.com", contacto: "Ana Pérez" });
    expect(n.resultado?.respuestas).toHaveLength(2);
  });

  it("la nota a medias, también", () => {
    const html = notaDelTestSinTerminar({
      areaNombre: "Servicio",
      nombre: "Luis",
      email: "luis@x.co",
      empresa: null,
      dominio: "x.co",
      industria: null,
      puesto: null,
      version: "Test de Marketing (4 preguntas)",
      paso: 2,
      total: 4,
    });
    expect(leerNotaDelTest(html)).toMatchObject({ estado: "sinTerminar", areaId: "3", email: "luis@x.co" });
  });
});
