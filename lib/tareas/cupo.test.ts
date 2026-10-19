/**
 * El tope de 5 por persona por reunión y lo que deja fuera (2026-10-19). El caso es el de la reunión del sprint de
 * marketing del lun 19 oct: 16 líneas, 9 de Alejandra y 6 de Lidia; el tope cortó 4 de Alejandra y 1 de Lidia, y
 * nadie podía ver cuáles.
 */
import { describe, expect, it } from "vitest";
import { cupoPorPersona, lasQueQuedaronFuera, textoFueraDelTope } from "./cupo";
import { huellaDeTexto } from "./texto";

const ALE = "aortega@smarteamcr.com";
const LIDIA = "lflores@smarteamcr.com";

function linea(lineaId: string, titulo: string, responsableEmail: string | null) {
  return { lineaId, titulo, responsableEmail, porAsignar: !responsableEmail };
}

// En el orden de las notas de Gemini.
const LINEAS = [
  linea("L1", "Configurar Pixel Meta", ALE),
  linea("L2", "Montar Campaña SAP", ALE),
  linea("L3", "Montar Agente Prospección", ALE),
  linea("L4", "Extraer Lista Apolo", ALE),
  linea("L5", "Conectar WhatsApp Demo", ALE),
  linea("L6", "Confirmar Campaña Escalonada", LIDIA),
  linea("L7", "Elaborar Reportes SAP", ALE),
  linea("L8", "Montar Google Search", ALE),
  linea("L9", "Entregar Casos Éxito", ALE),
  linea("L10", "Diseñar Landing Smarting", LIDIA),
  linea("L11", "Agendar Sesión Corina", LIDIA),
  linea("L12", "Solicitar Apoyo Ailin", LIDIA),
  linea("L13", "Enviar Copies Videos", ALE),
  linea("L14", "Seguimiento Discord", LIDIA),
  linea("L15", "Reunión Estrategia Videos", null),
  linea("L16", "Revisar Nexus", LIDIA),
];

/** Lo que escribió la lectura: el cupo, en el orden de las líneas. */
function escritas() {
  const cupo = cupoPorPersona(new Map());
  const ids = new Set<string>();
  for (const l of LINEAS) if (l.porAsignar || cupo.tomar(l.responsableEmail!)) ids.add(l.lineaId);
  return { ids, sinLugar: cupo.sinLugar() };
}

describe("el tope de 5 por persona en la reunión del sprint de marketing (19 oct)", () => {
  it("corta 4 de Alejandra y 1 de Lidia, como dijo la lectura (sinLugar 5)", () => {
    const { ids, sinLugar } = escritas();
    expect(ids.size).toBe(11); // 10 propuestas + 1 por asignar
    expect(sinLugar.get(ALE)).toBe(4);
    expect(sinLugar.get(LIDIA)).toBe(1);
  });

  it("lo que quedó fuera es lo de cada persona sin tarea escrita, en el orden de las notas", () => {
    const { ids } = escritas();
    expect(lasQueQuedaronFuera(LINEAS, ALE, ids, new Set()).map((p) => p.titulo)).toEqual(["Elaborar Reportes SAP", "Montar Google Search", "Entregar Casos Éxito", "Enviar Copies Videos"]);
    expect(lasQueQuedaronFuera(LINEAS, LIDIA, ids, new Set()).map((p) => p.titulo)).toEqual(["Revisar Nexus"]);
  });

  it("nunca muestra lo de otra persona ni «Por asignar»", () => {
    const { ids } = escritas();
    const otra = lasQueQuedaronFuera(LINEAS, "otra@smarteamcr.com", ids, new Set());
    expect(otra).toEqual([]);
    expect(lasQueQuedaronFuera(LINEAS, LIDIA.toUpperCase(), ids, new Set()).every((p) => p.responsableEmail === LIDIA)).toBe(true);
  });

  it("una línea igual a una propuesta tuya que ya existe se sumó, no se cortó", () => {
    const { ids } = escritas();
    const fuera = lasQueQuedaronFuera(LINEAS, ALE, ids, new Set([huellaDeTexto("Montar Google Search")]));
    expect(fuera.map((p) => p.titulo)).not.toContain("Montar Google Search");
  });

  it("después de «Proponérmelas» ya no queda nada fuera", () => {
    const { ids } = escritas();
    for (const p of lasQueQuedaronFuera(LINEAS, ALE, ids, new Set())) ids.add(p.lineaId);
    expect(lasQueQuedaronFuera(LINEAS, ALE, ids, new Set())).toEqual([]);
  });

  it("dice cuántas, en singular y en plural", () => {
    expect(textoFueraDelTope(1)).toBe("1 tarea tuya quedó sin proponer: cada reunión propone como mucho 5 por persona.");
    expect(textoFueraDelTope(4)).toMatch(/^4 tareas tuyas quedaron sin proponer/);
  });
});
