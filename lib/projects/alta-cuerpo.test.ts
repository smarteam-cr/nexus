import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { armarCuerpoDelAlta } from "./alta";
import { PROJECT_PIPELINES } from "./kind";

/**
 * lib/projects/alta-cuerpo.test.ts — LO QUE EL FORMULARIO MANDA, no lo que enseña.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Esconder un campo NO es lo mismo que limpiarlo. Si alguien elige un hermano y DESPUÉS marca
 * "proyecto interno", el desplegable desaparece de la pantalla — pero el valor seguía viajando
 * en el envío. El proyecto nacía colgado de otro sin que nadie lo hubiera pedido y sin que nada
 * lo mostrara: ni un error, ni un aviso, ni una fila distinta. Solo se vería semanas después
 * mirando HubSpot.
 *
 * Este archivo existe porque el armado del cuerpo salió del `onClick` a una función pura. Ahí
 * adentro la regla no se podía probar; acá se puede escribir entera.
 */

const BASE = {
  nombre: "Onboarding CRM",
  pipeline: "development",
  interno: false,
  clientId: "cli-1",
};

describe("un proyecto interno no cuelga de nadie", () => {
  it("con hermano y SIN interno → el hermano viaja", () => {
    const c = armarCuerpoDelAlta({ ...BASE, hermanoHsId: "hs-999" });
    expect(c.hermanoHsId).toBe("hs-999");
  });

  it("con hermano y CON interno → el hermano NO viaja (el bug)", () => {
    /* Reproduce la secuencia exacta: elegir el hermano primero, marcar interno después. La
       pantalla ya no lo muestra; lo que importa es que tampoco lo mande. */
    const c = armarCuerpoDelAlta({ ...BASE, hermanoHsId: "hs-999", interno: true });
    expect(c.hermanoHsId).toBeUndefined();
    expect(c.interno).toBe(true);
  });

  it("interno sin hermano → igual que siempre", () => {
    const c = armarCuerpoDelAlta({ ...BASE, interno: true });
    expect(c.hermanoHsId).toBeUndefined();
  });

  it("la clave se OMITE, no se manda en null", () => {
    /* `{hermanoHsId: null}` y la ausencia de la clave no son lo mismo para el endpoint: el
       primero es "decidí que no cuelgue", el segundo "no opiné". Se omite. */
    const c = armarCuerpoDelAlta({ ...BASE, hermanoHsId: "hs-999", interno: true });
    expect("hermanoHsId" in c).toBe(false);
  });
});

describe("el resto del cuerpo", () => {
  it("cliente existente → clientId, y NADA de empresa", () => {
    const c = armarCuerpoDelAlta({ ...BASE, companyId: "hs-emp", companyName: "Acme" });
    expect(c.clientId).toBe("cli-1");
    expect("companyId" in c).toBe(false);
  });

  it("sin cliente → viaja la empresa para crearlo", () => {
    const c = armarCuerpoDelAlta({
      ...BASE,
      clientId: null,
      companyId: "hs-emp",
      companyName: "Acme",
      domain: "acme.com",
    });
    expect(c.companyId).toBe("hs-emp");
    expect(c.companyName).toBe("Acme");
    expect(c.domain).toBe("acme.com");
  });

  it("al ADJUNTAR, el nombre del record pisa al tipeado", () => {
    // El proyecto ya existe en HubSpot con su nombre; renombrarlo desde acá sería otra operación.
    const c = armarCuerpoDelAlta({
      ...BASE,
      nombre: "Lo que escribí",
      adjuntar: { hubspotProjectId: "hs-1", name: "Como se llama allá" },
    });
    expect(c.nombre).toBe("Como se llama allá");
    expect(c.hubspotServiceId).toBe("hs-1");
  });

  it("el nombre se recorta", () => {
    expect(armarCuerpoDelAlta({ ...BASE, nombre: "  Con espacios  " }).nombre).toBe("Con espacios");
  });

  it("un motivo en blanco no viaja", () => {
    // Si no, el servidor recibiría "   " y lo tomaría como justificación válida de ir sin trato.
    expect("sinTratoMotivo" in armarCuerpoDelAlta({ ...BASE, sinTratoMotivo: "   " })).toBe(false);
  });
});

describe("los nombres de los tres tipos", () => {
  /** Transcritos. Si alguien cambia uno, acá se entera de que la pantalla también cambia. */
  const NOMBRES: Record<string, string> = {
    "customer-success": "Implementación de HubSpot",
    development: "Desarrollo e integración",
    web: "Sitios web",
  };

  for (const p of PROJECT_PIPELINES) {
    it(`${p.key} se llama «${NOMBRES[p.key]}»`, () => {
      expect(p.label).toBe(NOMBRES[p.key]);
    });
  }

  it("son tres, no dos", () => {
    expect(PROJECT_PIPELINES.length).toBe(3);
  });

  it("ninguno arrastra el nombre viejo", () => {
    /* "Customer Success CRM" nombraba el ÁREA que lo lleva, no lo que el proyecto ES — y en un
       formulario donde alguien elige entre tres tipos sin conocer el vocabulario interno, eso
       obligaba a leer la descripción para entender la opción. */
    for (const p of PROJECT_PIPELINES) {
      expect(p.label).not.toContain("Customer Success CRM");
      expect(p.label).not.toBe("Development");
    }
  });
});

describe("el índice de clientes deja UN solo botón", () => {
  const RAIZ = process.cwd();
  const INDICE = "app/(shell)/clients/ClientsGrid.tsx";
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("ya no monta «Nuevo cliente»", () => {
    /* Creaba un cliente SIN exigir empresa en HubSpot, y el alta después lo rechazaba. Medido
       antes de sacarlo: 7 clientes así, 6 con cero proyectos. No es redundancia, es una trampa
       que produce fichas que el resto del sistema no puede usar. */
    expect(leer(INDICE)).not.toContain("<NewClientButton");
  });

  it("monta el alta única", () => {
    expect(leer(INDICE)).toContain("<NuevoProyectoStepper");
  });

  it("el archivo del botón viejo sigue entero", () => {
    // Volver a mostrarlo tiene que ser una línea, no un revert.
    const f = "app/(shell)/clients/NewClientButton.tsx";
    expect(fs.existsSync(path.join(RAIZ, f)), `${f} se borró`).toBe(true);
    expect(leer(f)).toContain("export default function NewClientButton");
  });

  it("el formulario esconde el hermano cuando es interno", () => {
    /* La mitad visible de la regla. La otra —que el valor no viaje— la cubren los tests de
       arriba, y es la que de verdad importa. */
    const src = leer("components/projects/NuevoProyectoStepper.tsx");
    expect(src).toContain("!interno && def.canBeSiblingOf.length > 0");
    expect(src, "el cuerpo volvió a armarse a mano en el onClick").toContain("armarCuerpoDelAlta(");
  });
});
