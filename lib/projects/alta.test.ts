import { describe, expect, it } from "vitest";
import {
  ESTADOS_DE_ALTA,
  altaEnCurso,
  altaEsRetomable,
  altaTerminada,
  parseEstadoDeAlta,
  siguientePaso,
  type EstadoDeAltaEnBase,
  type PasoDelAlta,
} from "./alta";
import { OVERLAY_ALTA_EN_CURSO, projectCapabilities } from "./kind";

/**
 * lib/projects/alta.test.ts — LA TABLA DE VERDAD DEL ALTA, CONGELADA.
 *
 * Los CUATRO valores que puede tener `Project.altaEstado` con las SEIS respuestas escritas
 * literal. No se calculan: se transcriben. Un test que derive el esperado del mismo módulo
 * que prueba no prueba nada.
 *
 * ── LA FILA QUE IMPORTA MÁS ES LA PRIMERA ────────────────────────────────────
 * `null` es el 99% de la base real: todo lo anterior a la Tanda C y todo lo que sigue
 * entrando por el espejo de HubSpot. Tiene que responder EXACTAMENTE igual que 'listo' en las
 * seis columnas. Si no, aplicar la migración saca a todos los proyectos de cobranza y de la
 * cartera al mismo tiempo — un incidente de facturación producido por un deploy que "no
 * cambiaba nada".
 */

interface Fila {
  caso: string;
  estado: EstadoDeAltaEnBase;
  enCurso: boolean;
  terminada: boolean;
  retomable: boolean;
  siguiente: PasoDelAlta | null;
  /** Las dos celdas de plata de `projectCapabilities`. */
  cobranza: boolean;
  carteraCs: boolean;
}

const FILAS: Fila[] = [
  {
    caso: "null — nació antes de la Tanda C, o lo trajo el espejo (el 99%)",
    estado: null,
    enCurso: false,
    terminada: true,
    retomable: false,
    siguiente: null,
    cobranza: true,
    carteraCs: true,
  },
  {
    caso: "pendiente_crm — la fila existe en Nexus; falta el record en HubSpot",
    estado: "pendiente_crm",
    enCurso: true,
    terminada: false,
    retomable: true,
    siguiente: "crear-en-hubspot",
    cobranza: false,
    carteraCs: false,
  },
  {
    caso: "pendiente_espejo — el record existe; falta traerlo",
    estado: "pendiente_espejo",
    enCurso: true,
    terminada: false,
    retomable: true,
    siguiente: "traer-de-hubspot",
    cobranza: false,
    carteraCs: false,
  },
  {
    caso: "listo — terminado; se comporta como cualquier proyecto de siempre",
    estado: "listo",
    enCurso: false,
    terminada: true,
    retomable: false,
    siguiente: null,
    cobranza: true,
    carteraCs: true,
  },
];

/** Una implementación de Customer Success normal: solo varía el estado del alta. */
const caps = (estado: EstadoDeAltaEnBase) =>
  projectCapabilities({
    hubspotPipelineId: "826270797",
    interno: false,
    tieneHermanoCs: false,
    altaEnCurso: altaEnCurso(estado),
  });

describe("LA TABLA — estado del alta → las seis respuestas", () => {
  for (const f of FILAS) {
    it(f.caso, () => {
      expect(altaEnCurso(f.estado), "enCurso").toBe(f.enCurso);
      expect(altaTerminada(f.estado), "terminada").toBe(f.terminada);
      expect(altaEsRetomable(f.estado), "retomable").toBe(f.retomable);
      expect(siguientePaso(f.estado), "siguientePaso").toBe(f.siguiente);
      expect(caps(f.estado).cobranza, "cobranza").toBe(f.cobranza);
      expect(caps(f.estado).carteraCs, "carteraCs").toBe(f.carteraCs);
    });
  }

  it("la tabla cubre los cuatro valores posibles, sin faltar ninguno", () => {
    expect(FILAS.map((f) => f.estado).sort()).toEqual([null, ...ESTADOS_DE_ALTA].sort());
  });
});

describe("las invariantes que salen de la tabla", () => {
  /**
   * LA invariante de la migración. Se escribe aparte y no se deduce de las filas: si alguien
   * cambia las dos filas a la vez —que es exactamente lo que haría al "arreglar" algo—, este
   * test las vuelve a enfrentar entre sí.
   */
  it("`null` y `listo` responden IDÉNTICO — es lo que hace invisible el deploy", () => {
    expect(altaEnCurso(null)).toBe(altaEnCurso("listo"));
    expect(altaTerminada(null)).toBe(altaTerminada("listo"));
    expect(altaEsRetomable(null)).toBe(altaEsRetomable("listo"));
    expect(siguientePaso(null)).toBe(siguientePaso("listo"));
    expect(caps(null)).toEqual(caps("listo"));
  });

  it("`terminada` es la negación exacta de `enCurso` — no una segunda opinión", () => {
    for (const estado of [null, ...ESTADOS_DE_ALTA] as EstadoDeAltaEnBase[]) {
      expect(altaTerminada(estado), String(estado)).toBe(!altaEnCurso(estado));
    }
  });

  it("hay un próximo paso EXACTAMENTE cuando el alta está en curso", () => {
    /* Si un estado en curso no tuviera próximo paso, "Reintentar" no sabría qué hacer y el
       proyecto quedaría trabado para siempre, visible y sin salida. */
    for (const estado of [null, ...ESTADOS_DE_ALTA] as EstadoDeAltaEnBase[]) {
      expect(siguientePaso(estado) !== null, String(estado)).toBe(altaEnCurso(estado));
    }
  });

  it("el overlay apaga la plata y respeta la pestaña", () => {
    // Lo que declara el overlay y lo que hace la función tienen que ser lo mismo.
    expect(OVERLAY_ALTA_EN_CURSO.apaga.cobranza).toBe(false);
    expect(OVERLAY_ALTA_EN_CURSO.respeta).toContain("pestana");
    expect(caps("pendiente_crm").pestana).toBe(true);
  });
});

describe("parseEstadoDeAlta (la columna es TEXT, no un enum de Postgres)", () => {
  it("acepta los tres estados y nada más", () => {
    for (const e of ESTADOS_DE_ALTA) expect(parseEstadoDeAlta(e)).toBe(e);
  });

  it("basura y null degradan a `null`, que la tabla trata como TERMINADA", () => {
    /* La dirección de la degradación es la decisión: un valor desconocido tiene que dejar al
       proyecto como estaba —cobrando— y no sacarlo de Cobranza sin que nadie lo pidiera. */
    for (const v of ["", "listo ", "LISTO", "pendiente", 3, null, undefined, {}]) {
      expect(parseEstadoDeAlta(v), JSON.stringify(v)).toBeNull();
    }
    expect(altaTerminada(parseEstadoDeAlta("cualquier-cosa"))).toBe(true);
  });
});
