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
  frentesDeProyecto({ hubspotPipelineId: pid, interno, tieneHermanoCs: hermano }).map((f) => f.label);

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

describe("las ranuras de almacenamiento no cambian", () => {
  it("el frente de entrega SIEMPRE guarda en la ranura «cs»", () => {
    /* Renombrar la columna `csNextSessionDate` sería una migración para decir lo que ya
       decía: esa ranura siempre fue la del frente de ENTREGA. Lo que cambia es el rótulo.
       Si esto se rompe, un override manual de un desarrollo se escribe en otra columna y
       desaparece de la pantalla. */
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const hermano of [true, false]) {
        const fs_ = frentesDeProyecto({ hubspotPipelineId: pid, interno: false, tieneHermanoCs: hermano });
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
