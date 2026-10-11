/**
 * lib/seguimiento/novedades.test.ts — las novedades se CALCULAN (DECISIONS «Hechos, enrutador y novedades»): solo en
 * documentos con contenido, sin vencidos, una por huella, como mucho 5 por documento, y lo decidido no vuelve.
 */
import { describe, expect, it } from "vitest";
import {
  TOPE_DE_NOVEDADES_POR_PIEZA,
  conteoDeNovedades,
  novedadesEnPalabras,
  novedadesPorPieza,
  pideDecisionDeNovedad,
  reunionesConProcesoHoy,
  type HechoParaNovedades,
} from "./novedades";

const AHORA = new Date("2026-10-10T15:00:00.000Z");
const DIA = 86_400_000;

function hecho(o: Partial<HechoParaNovedades> = {}): HechoParaNovedades {
  return {
    id: "h1",
    tipo: "acuerdo",
    tema: "pipeline",
    frase: "El pipeline de ventas queda con seis etapas.",
    cita: "dejemos el pipeline en seis etapas",
    huella: "acuerdo|pipeline|pipeline-ventas-seis-etapas",
    estado: "pendiente",
    createdAt: new Date(+AHORA - 2 * DIA),
    fechaDeLaReunion: new Date(+AHORA - 2 * DIA),
    destinos: [{ clave: "planning.pipelines", estado: "pendiente" }],
    projectId: "p1",
    sessionId: "s1",
    reunionTitulo: "Seguimiento semanal",
    ...o,
  };
}

describe("pideDecisionDeNovedad («Para ti» cuenta lo mismo que la tarjeta)", () => {
  const conPlanning = () => new Set(["planning"]);
  const decide = new Set(["planning"]);

  it("una novedad pendiente, en un documento con contenido que quien mira puede generar", () => {
    expect(pideDecisionDeNovedad(hecho(), decide, conPlanning, AHORA)).toBe(true);
  });

  it("⛔ sin permiso, sin contenido, vencida, decidida o delegada, no pide decisión", () => {
    expect(pideDecisionDeNovedad(hecho(), new Set(), conPlanning, AHORA)).toBe(false);
    expect(pideDecisionDeNovedad(hecho(), decide, () => new Set(), AHORA)).toBe(false);
    expect(pideDecisionDeNovedad(hecho({ createdAt: new Date(+AHORA - 40 * DIA) }), decide, conPlanning, AHORA)).toBe(false);
    expect(pideDecisionDeNovedad(hecho({ destinos: [{ clave: "planning.pipelines", estado: "usado" }] }), decide, conPlanning, AHORA)).toBe(false);
    expect(pideDecisionDeNovedad(hecho({ tipo: "cuenta", destinos: [{ clave: "ficha", estado: "delegado" }] }), decide, conPlanning, AHORA)).toBe(false);
    expect(pideDecisionDeNovedad(hecho({ projectId: null }), decide, conPlanning, AHORA)).toBe(false);
  });
});

describe("novedadesPorPieza", () => {
  it("una novedad en la sección del documento, con su reunión", () => {
    const r = novedadesPorPieza([hecho()], ["planning"], AHORA);
    expect(Object.keys(r)).toEqual(["planning"]);
    const n = r.planning.items[0];
    expect(n).toMatchObject({ hechoId: "h1", pieza: "planning", frase: "El pipeline de ventas queda con seis etapas.", publicaEnVivo: false });
    expect(n.secciones).toEqual([{ clave: "planning.pipelines", seccion: "pipelines", rotulo: "Planificación › Pipelines" }]);
    expect(n.reunion).toEqual({ id: "s1", titulo: "Seguimiento semanal", fecha: "2026-10-08" });
    expect(r.planning.mas).toBe(0);
  });

  it("⛔ una pieza sin contenido no tiene novedades: se genera, no se le propone un cambio", () => {
    expect(novedadesPorPieza([hecho()], [], AHORA)).toEqual({});
    expect(novedadesPorPieza([hecho()], ["kickoff"], AHORA)).toEqual({});
  });

  it("⛔ como mucho 5 por documento, las más recientes primero", () => {
    const hechos = Array.from({ length: TOPE_DE_NOVEDADES_POR_PIEZA + 3 }, (_, i) =>
      hecho({ id: `h${i}`, huella: `huella-${i}`, fechaDeLaReunion: new Date(+AHORA - (i + 1) * DIA), createdAt: new Date(+AHORA - (i + 1) * DIA) }),
    );
    const r = novedadesPorPieza(hechos, ["planning"], AHORA);
    expect(r.planning.items).toHaveLength(TOPE_DE_NOVEDADES_POR_PIEZA);
    expect(r.planning.mas).toBe(3);
    expect(r.planning.items.map((n) => n.hechoId)).toEqual(["h0", "h1", "h2", "h3", "h4"]);
    expect(conteoDeNovedades(r)).toEqual({ planning: TOPE_DE_NOVEDADES_POR_PIEZA });
  });

  it("el mismo hecho dicho en dos reuniones (la misma huella) es una novedad, con la reunión más reciente", () => {
    const vieja = hecho({ id: "viejo", sessionId: "s-vieja", fechaDeLaReunion: new Date(+AHORA - 9 * DIA), createdAt: new Date(+AHORA - 9 * DIA) });
    const nueva = hecho({ id: "nuevo", sessionId: "s-nueva", fechaDeLaReunion: new Date(+AHORA - DIA), createdAt: new Date(+AHORA - DIA) });
    const r = novedadesPorPieza([vieja, nueva], ["planning"], AHORA);
    expect(r.planning.items).toHaveLength(1);
    expect(r.planning.items[0]).toMatchObject({ hechoId: "nuevo", mismos: ["viejo"] });
    expect(r.planning.items[0].reunion.id).toBe("s-nueva");
  });

  it("⛔ vence a los 30 días: el día 31 ya no se muestra", () => {
    const dia29 = hecho({ createdAt: new Date(+AHORA - 29 * DIA) });
    const dia31 = hecho({ createdAt: new Date(+AHORA - 31 * DIA) });
    expect(novedadesPorPieza([dia29], ["planning"], AHORA).planning?.items).toHaveLength(1);
    expect(novedadesPorPieza([dia31], ["planning"], AHORA)).toEqual({});
  });

  it("⛔ un destino desestimado o usado no vuelve, y uno delegado no es una novedad", () => {
    for (const estado of ["desestimado", "usado", "delegado"]) {
      expect(novedadesPorPieza([hecho({ destinos: [{ clave: "planning.pipelines", estado }] })], ["planning"], AHORA), estado).toEqual({});
    }
    // El hecho cerrado en general tampoco, aunque su JSON dijera otra cosa.
    expect(novedadesPorPieza([hecho({ estado: "desestimado" })], ["planning"], AHORA)).toEqual({});
  });

  it("los destinos que no son novedades (la ficha, la alerta, el avance, Procesos) no aparecen", () => {
    const h = hecho({
      destinos: [
        { clave: "ficha", estado: "pendiente" },
        { clave: "alerta.queja", estado: "pendiente" },
        { clave: "cronograma.avance", estado: "pendiente" },
        { clave: "procesos", estado: "pendiente" },
      ],
    });
    expect(novedadesPorPieza([h], ["planning", "kickoff", "client-info", "timeline"], AHORA)).toEqual({});
  });

  it("un acuerdo con dos secciones del mismo documento es UNA novedad; Integraciones dice que publica en vivo", () => {
    const h = hecho({
      tema: "integracion",
      destinos: [
        { clave: "tech-requirements.requerimiento", estado: "pendiente" },
        { clave: "tech-requirements.comunicacion", estado: "pendiente" },
        { clave: "planning.arquitectura_solucion", estado: "pendiente" },
      ],
    });
    const r = novedadesPorPieza([h], ["tech-requirements", "planning"], AHORA);
    expect(r["tech-requirements"].items).toHaveLength(1);
    expect(r["tech-requirements"].items[0].secciones.map((s) => s.seccion)).toEqual(["requerimiento", "comunicacion"]);
    expect(r["tech-requirements"].items[0].publicaEnVivo).toBe(true);
    expect(r.planning.items[0].publicaEnVivo).toBe(false);
  });

  it("habla en palabras", () => {
    expect(novedadesEnPalabras(1)).toBe("1 novedad de una reunión");
    expect(novedadesEnPalabras(3)).toBe("3 novedades de reuniones");
  });
});

describe("reunionesConProcesoHoy (Procesos: «Volver a mapear»)", () => {
  const proceso = (o: Partial<HechoParaNovedades> = {}) =>
    hecho({ tipo: "proceso_hoy", tema: null, destinos: [{ clave: "procesos", estado: "pendiente" }], ...o });

  it("cuenta reuniones, no hechos, y solo lo escrito después del último mapeo", () => {
    const desde = new Date(+AHORA - 5 * DIA);
    const hechos = [
      proceso({ id: "a", sessionId: "s1", createdAt: new Date(+AHORA - DIA) }),
      proceso({ id: "b", sessionId: "s1", createdAt: new Date(+AHORA - DIA) }),
      proceso({ id: "c", sessionId: "s2", createdAt: new Date(+AHORA - 2 * DIA) }),
      proceso({ id: "d", sessionId: "s3", createdAt: new Date(+AHORA - 8 * DIA) }),
    ];
    expect(reunionesConProcesoHoy(hechos, desde, AHORA)).toBe(2);
    expect(reunionesConProcesoHoy(hechos, null, AHORA)).toBe(3);
  });

  it("lo usado, lo desestimado, lo vencido y lo que no es de cómo trabajan hoy no cuenta", () => {
    expect(reunionesConProcesoHoy([proceso({ destinos: [{ clave: "procesos", estado: "usado" }] })], null, AHORA)).toBe(0);
    expect(reunionesConProcesoHoy([proceso({ estado: "desestimado" })], null, AHORA)).toBe(0);
    expect(reunionesConProcesoHoy([proceso({ createdAt: new Date(+AHORA - 31 * DIA) })], null, AHORA)).toBe(0);
    expect(reunionesConProcesoHoy([hecho()], null, AHORA)).toBe(0);
  });

  it("solo cuentan las reuniones con transcripción: el mapeo no lee las de solo notas ni un texto sumado", () => {
    expect(reunionesConProcesoHoy([proceso({ citaFuente: "notas" })], null, AHORA)).toBe(0);
    expect(reunionesConProcesoHoy([proceso({ citaFuente: "texto" })], null, AHORA)).toBe(0);
    expect(reunionesConProcesoHoy([proceso({ citaFuente: "transcripcion" })], null, AHORA)).toBe(1);
  });
});
