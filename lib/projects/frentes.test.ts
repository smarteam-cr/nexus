/**
 * lib/projects/frentes.test.ts — qué frentes muestra el widget de sesiones.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. El rótulo "CSE" sobre las sesiones de un proyecto de Desarrollo. El dato ya era el
 *    correcto —el frente de entrega es `deliveryEmails = CSE ∪ Development`, así que las
 *    sesiones técnicas SIEMPRE estuvieron ahí— pero se mostraban mezcladas con las del CSE
 *    y bajo el nombre equivocado.
 * 2. Un frente "Ventas" vacío en un desarrollo que cuelga de una implementación. Esa
 *    conversación se dio con el hermano; pedirle al equipo que agende algo que no existe es
 *    ruido con forma de tarea.
 * 3. Que el widget vuelva a llevar la lista de frentes hardcodeada. El día que eso pasa, el
 *    cuarto pipeline se agrega en cinco lugares en vez de en una fila de la tabla.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_PIPELINES, frentesDeProyecto, pipelineByKey } from "./kind";

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;
const WEB = pipelineByKey("web").hubspotPipelineId;
const DESCONOCIDO = "default-onboarding-pipeline";

/** Lo que se ve en pantalla, en orden. */
const rotulos = (pid: string | null, interno = false, hermano = false) =>
  frentesDeProyecto({ hubspotPipelineId: pid, interno, tieneHermanoCs: hermano, altaEnCurso: false }).map((f) => f.label);

describe("LOS FRENTES — (pipeline × hermano) → qué se pinta, transcrito", () => {
  it("Customer Success → Ventas · CSE", () => {
    expect(rotulos(CS)).toEqual(["Ventas", "CSE"]);
  });

  it("Sitios web → Ventas · CSE (igual que hoy: lo acompaña un CSE)", () => {
    expect(rotulos(WEB)).toEqual(["Ventas", "CSE"]);
  });

  it("pipeline desconocido y SIN pipeline → Ventas · CSE (comportamiento legacy)", () => {
    expect(rotulos(DESCONOCIDO)).toEqual(["Ventas", "CSE"]);
    expect(rotulos(null)).toEqual(["Ventas", "CSE"]);
  });

  it("Desarrollo APARTE (el caso Judesur) → Ventas · Desarrollo", () => {
    expect(rotulos(DEV)).toEqual(["Ventas", "Desarrollo"]);
  });

  it("Desarrollo HERMANO → solo Desarrollo", () => {
    /* Ventas y CS viven en la implementación hermana, y la ficha ya enlaza allá. */
    expect(rotulos(DEV, false, true)).toEqual(["Desarrollo"]);
  });

  it("Sitios web HERMANO → solo su frente de entrega, por el mismo motivo", () => {
    /* La tabla del plan solo enumeraba el caso de Desarrollo, pero el motivo —la
       conversación comercial vive en el hermano— no depende del pipeline. Se aplica el
       motivo, no la lista abreviada. */
    expect(rotulos(WEB, false, true)).toEqual(["CSE"]);
  });

  it("un Customer Success con hermano NO pierde Ventas: un CS no es hermano de nadie", () => {
    expect(rotulos(CS, false, true)).toEqual(["Ventas", "CSE"]);
  });

  it("INTERNO no cambia los frentes: el equipo se sigue reuniendo", () => {
    /* El overlay de interno apaga plata, cartera y publicación — no la agenda. */
    expect(rotulos(CS, true)).toEqual(["Ventas", "CSE"]);
    expect(rotulos(DEV, true)).toEqual(["Ventas", "Desarrollo"]);
  });
});

describe("cada frente mira a SU equipo — el rótulo no alcanza", () => {
  /* EL BUG, transcrito: el frente pasó a rotularse "Desarrollo" y siguió mirando a
     `deliveryEmails` (CSE ∪ Desarrollo). En Wherex, que tiene dos proyectos, las sesiones
     recientes del CSE del hermano ganaban por fecha y el frente "Desarrollo" mostraba
     reuniones donde no participó ni un dev. El rótulo cambió; el equipo, no. */
  const equipos = (pid: string | null, hermano = false) =>
    frentesDeProyecto({ hubspotPipelineId: pid, interno: false, tieneHermanoCs: hermano, altaEnCurso: false }).map(
      (f) => [f.label, f.equipo] as const,
    );

  it("Desarrollo mira SOLO a Desarrollo", () => {
    expect(equipos(DEV)).toEqual([
      ["Ventas", "ventas"],
      ["Desarrollo", "desarrollo"],
    ]);
    expect(equipos(DEV, true)).toEqual([["Desarrollo", "desarrollo"]]);
  });

  it("Customer Success y Sitios web miran a ENTREGA (CSE ∪ Desarrollo)", () => {
    /* No se angosta a solo CSE: una integración que lleva únicamente un dev ES una sesión de
       entrega de ese proyecto, y con `cseEmails` el widget mostraba "Sin agendar" con la
       reunión ya agendada. La regla nueva es para el pipeline que tiene frente propio. */
    expect(equipos(CS)).toEqual([
      ["Ventas", "ventas"],
      ["CSE", "entrega"],
    ]);
    expect(equipos(WEB)).toEqual([
      ["Ventas", "ventas"],
      ["CSE", "entrega"],
    ]);
  });

  it("sin pipeline y pipeline desconocido: ENTREGA, como siempre", () => {
    expect(equipos(null)).toEqual([
      ["Ventas", "ventas"],
      ["CSE", "entrega"],
    ]);
    expect(equipos(DESCONOCIDO)[1][1]).toBe("entrega");
  });

  it("un frente rotulado «Desarrollo» NUNCA mira a entrega", () => {
    /* La propiedad de fondo, escrita sobre TODAS las combinaciones: si mañana otra fila
       estrena rótulo técnico, esto la obliga a declarar también su equipo. */
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const hermano of [true, false]) {
        for (const interno of [true, false]) {
          for (const f of frentesDeProyecto({ hubspotPipelineId: pid, interno, tieneHermanoCs: hermano, altaEnCurso: false })) {
            if (f.label === "Desarrollo") {
              expect(f.equipo, `pipeline=${pid}: el frente "Desarrollo" mira a ${f.equipo}`).toBe(
                "desarrollo",
              );
            }
          }
        }
      }
    }
  });

  it("toda fila declara su equipo de entrega", () => {
    for (const def of PROJECT_PIPELINES) {
      expect(["entrega", "desarrollo"], `${def.label}`).toContain(def.equipoDeEntrega);
    }
  });
});

describe("las ranuras de almacenamiento no cambian", () => {
  it("el frente de entrega SIEMPRE guarda en la ranura «cs»", () => {
    /* Renombrar la columna `csNextSessionDate` sería una migración para decir lo que ya
       decía: esa ranura siempre fue la del frente de ENTREGA. Lo que cambia es el rótulo.
       Si esto se rompe, un override manual de un desarrollo se escribe en otra columna y
       desaparece de la pantalla. */
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const hermano of [true, false]) {
        const fs_ = frentesDeProyecto({ hubspotPipelineId: pid, interno: false, tieneHermanoCs: hermano, altaEnCurso: false });
        expect(fs_[fs_.length - 1].key, `pipeline=${pid} hermano=${hermano}`).toBe("cs");
      }
    }
  });

  it("ninguna fila deja el rótulo de entrega vacío", () => {
    for (const def of PROJECT_PIPELINES) {
      expect(def.frenteDeEntrega.trim().length, `${def.label}`).toBeGreaterThan(0);
    }
  });
});

describe("candado: el widget no lleva los frentes de memoria", () => {
  const GPS = "components/clients/ProjectGPS.tsx";

  it("los frentes NO se pintan con claves literales", () => {
    /* Antes había cuatro llamadas literales — `renderLastFront("ventas", "Ventas")` y
       compañía. Mientras existan, la decisión de QUÉ frentes mostrar vive en React y no en
       la tabla, y un pipeline nuevo la deja desactualizada en silencio. */
    const src = fs.readFileSync(path.join(process.cwd(), GPS), "utf8");
    for (const fn of ["renderLastFront", "renderNextFront"]) {
      expect(
        src.includes(`${fn}("`),
        `${GPS}: ${fn} se llama con una clave literal. La lista de frentes la manda el ` +
          `servidor desde lib/projects/kind.ts.`,
      ).toBe(false);
    }
  });

  it("el endpoint del GPS deriva los frentes de la tabla", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/projects/[projectId]/gps/route.ts"),
      "utf8",
    );
    expect(src).toContain("frentesDeProyecto(");
    // Sin las dos columnas de clase, `frentesDeProyecto` recibe undefined y todos los
    // proyectos vuelven a "Ventas · CSE" sin que nada falle.
    for (const col of ["proyectoInterno: true", "hermanoCsProjectId: true"]) {
      expect(src, `el select del GPS no trae ${col}`).toContain(col);
    }
  });
});
