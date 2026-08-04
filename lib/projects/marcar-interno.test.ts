import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import { sectionByKey } from "@/lib/auth/permissions/registry";

/**
 * lib/projects/marcar-interno.test.ts — EL INTERRUPTOR QUE SACA UN PROYECTO DEL DINERO.
 *
 * Marcar interno apaga cobranza, cartera, publicación y vigilante sobre un proyecto que ya está
 * andando. Las dos formas de que esto salga mal son silenciosas:
 *  · escribir la columna en Nexus → el espejo la revierte en diez minutos y el interruptor "no
 *    guarda", sin ningún error;
 *  · dejar la celda de permiso abierta → cualquiera saca algo de facturación.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const RUTA = "app/api/projects/[projectId]/interno/route.ts";

/** Todo lo que va adentro de un `data: {…}`, con llaves balanceadas. Escribir, no leer. */
function bloquesData(src: string): string {
  const out: string[] = [];
  const re = /data:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let nivel = 1;
    const desde = i;
    while (i < src.length && nivel > 0) {
      if (src[i] === "{") nivel++;
      else if (src[i] === "}") nivel--;
      i++;
    }
    out.push(src.slice(desde, i));
  }
  return out.join("\n");
}

describe("el interruptor escribe en HubSpot, NUNCA en Nexus", () => {
  it("la ruta manda el cambio a HubSpot", () => {
    expect(leer(RUTA)).toContain("actualizarProyectoInterno(");
  });

  it("LA guarda: la ruta NO escribe la columna en la base", () => {
    /* `Project.proyectoInterno` tiene un solo escritor —el espejo— y si esta ruta lo escribiera,
       el sync lo revertiría sobre un campo que decide facturación. El síntoma sería un
       interruptor que parece funcionar y a los diez minutos vuelve solo. */
    const src = leer(RUTA);
    /* Se miran SOLO los bloques `data: {…}` — con llaves balanceadas, no con una regex. La ruta
       LEE `proyectoInterno` en un `select` para saber si hay algo que cambiar, y eso es
       legítimo: un escaneo que no distinga leer de escribir se cae con el código correcto y
       termina borrándose por molesto. */
    expect(bloquesData(src), "la ruta escribe proyectoInterno en Nexus").not.toContain(
      "proyectoInterno",
    );
    expect(src, "la ruta hace update/upsert sobre Project").not.toMatch(
      /prisma\.project\.(update|upsert|updateMany)/,
    );
  });

  it("después de escribir allá, trae el espejo", () => {
    /* Sin esto la pantalla se recarga con el valor viejo y la persona aprieta de nuevo pensando
       que no funcionó — hasta que el sync pase, diez minutos después. */
    expect(leer(RUTA)).toContain("espejarProyectoRecienCreado(");
  });

  it("sin registro en HubSpot, lo dice en vez de reventar", () => {
    const src = leer(RUTA);
    expect(src).toContain("hubspotServiceId");
    expect(src).toContain("409");
  });
});

describe("quién puede sacar un proyecto de la facturación", () => {
  const seccion = sectionByKey("proyectos");

  it("la celda existe y está exigida de verdad", () => {
    const accion = seccion?.actions.find((a) => a.key === "marcarInterno");
    expect(accion, "desapareció la celda proyectos.marcarInterno").toBeDefined();
    expect(accion?.enforced, "la celda quedó decorativa").toBe(true);
  });

  it("la ruta la exige", () => {
    expect(leer(RUTA)).toContain('guardPermission("proyectos", "marcarInterno")');
  });

  it("por default la tiene el liderazgo de CS, y NO todo el que puede crear", () => {
    /* Dar de alta es una decisión de arranque; esto cambia la plata de algo en marcha. Que
       coincidan sería cómodo y es justo lo que no se quiere. */
    const tiene = (rol: string) => {
      const m = (DEFAULT_MATRIX as unknown as Record<string, { sections?: Record<string, Record<string, boolean>> }>)[rol];
      const celdas = m?.sections?.proyectos ?? {};
      return Object.entries(celdas)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
    };
    expect(tiene("CSL")).toContain("marcarInterno");
    expect(tiene("VENTAS"), "Ventas puede crear, no sacar de cobranza").not.toContain("marcarInterno");
    expect(tiene("DEV")).not.toContain("marcarInterno");
    expect(tiene("CSE")).not.toContain("marcarInterno");
  });
});

describe("la pantalla dice qué va a pasar", () => {
  const UI = "components/clients/MarcarInternoToggle.tsx";

  it("pide confirmación y la confirmación nombra la consecuencia", () => {
    /* Un "¿estás seguro?" no informa nada. Lo que importa es que salga de Cobranza. */
    const src = leer(UI);
    expect(src).toContain("ConfirmDialog");
    expect(src).toContain("Cobranza");
  });

  it("muestra lo que VOLVIÓ de HubSpot, no lo que se pidió", () => {
    // Si HubSpot rechazara el cambio, el interruptor no se puede mover igual.
    expect(leer(UI)).toContain("r.interno");
  });
});
