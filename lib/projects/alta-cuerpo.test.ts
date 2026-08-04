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

describe("al ADJUNTAR manda HubSpot, no la casilla — es de plata", () => {
  /* Adjuntar no crea nada en HubSpot, y `crearProjectRecord` es el ÚNICO escritor de
     `proyecto_interno`. Si la casilla ganara, quedaría guardada como declaración, HubSpot no se
     enteraría, el espejo traería vacío y el proyecto **cobraría** creyendo la persona que es
     interno. El camino es alcanzable sin hacer nada raro: la casilla se desmonta al elegir un
     adjuntable, pero el estado sobrevive. */
  const REC = (interno: boolean, pipeline: string | null = "development") => ({
    hubspotProjectId: "hs-777",
    name: "Proyecto que ya existe",
    interno,
    pipeline,
  });

  it("HubSpot dice NO + casilla marcada → gana HubSpot", () => {
    // El caso que facturaba: la persona creía haber creado un interno y el proyecto cobraba.
    const c = armarCuerpoDelAlta({ ...BASE, interno: true, adjuntar: REC(false) });
    expect(c.interno).toBe(false);
  });

  it("HubSpot dice SÍ + casilla sin marcar → gana HubSpot", () => {
    /* La dirección contraria, y no es simétrica de adorno: acá `interno: true` es lo que hace que
       `exigeTratoGanado` NO pida el trato ganado. Sin esto, adjuntar un proyecto que en HubSpot sí
       es interno devuelve un 400 pidiendo un trato que ese proyecto no tiene por qué tener. */
    const c = armarCuerpoDelAlta({ ...BASE, interno: false, adjuntar: REC(true) });
    expect(c.interno).toBe(true);
  });

  it("el TIPO también lo dicta HubSpot, y es el mismo caso", () => {
    /* Idéntico modo de falla que `interno`, y peor de arreglar después: el motor compara el tipo
       que volvió del espejo contra el que se eligió en el formulario, y si no coinciden **deja el
       alta en «pendiente_espejo» para siempre**. El proyecto existe, se abre, se ve normal — y
       nunca entra a cobranza. No hay error, no hay reintento que sirva. */
    const c = armarCuerpoDelAlta({ ...BASE, pipeline: "web", adjuntar: REC(false, "development") });
    expect(c.pipeline).toBe("development");
  });

  it("si HubSpot lo tiene en un pipeline que Nexus no conoce, cae al elegido", () => {
    /* Es una salida de emergencia, no un camino: la pantalla BLOQUEA el alta en ese caso (ver la
       guarda de abajo). El fallback existe para que la función pura no tenga que devolver
       `undefined` en un campo obligatorio, no para que alguien lo use. */
    const c = armarCuerpoDelAlta({ ...BASE, pipeline: "web", adjuntar: REC(false, null) });
    expect(c.pipeline).toBe("web");
  });

  it("al adjuntar, el HERMANO no viaja aunque se haya elegido", () => {
    /* El tercer campo con el mismo modo de falla. Adjuntar no crea nada en HubSpot, así que la
       hermandad no se establecería allá — y el motor exige que el hermano quede resuelto para dar
       el alta por terminada. Mandarlo es garantizar un alta trabada. */
    const c = armarCuerpoDelAlta({ ...BASE, hermanoHsId: "hs-999", adjuntar: REC(false) });
    expect("hermanoHsId" in c).toBe(false);
  });

  it("sin adjuntar, la casilla sigue mandando", () => {
    // La regla es del camino de adjuntar, no un apagón general.
    expect(armarCuerpoDelAlta({ ...BASE, interno: true }).interno).toBe(true);
    expect(armarCuerpoDelAlta({ ...BASE, interno: false }).interno).toBe(false);
  });

  it("la clave viaja siempre — no se omite", () => {
    /* A diferencia del hermano: el endpoint lee `body.interno === true`, así que omitirla y
       mandarla en false dan lo mismo hoy. Se manda explícita para que el cuerpo diga la verdad
       completa y no dependa de cómo el servidor trata lo ausente. */
    expect("interno" in armarCuerpoDelAlta({ ...BASE, adjuntar: REC(false) })).toBe(true);
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
      adjuntar: { hubspotProjectId: "hs-1", name: "Como se llama allá", interno: false, pipeline: null },
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

  it("el picker PIDE «proyecto_interno», o el dato llega vacío y nadie se entera", () => {
    /* LA guarda del tramo, y la única que puede atajar esto: el nombre de la propiedad es un
       string suelto adentro de un array. Si alguien lo saca, TypeScript no dice nada,
       `parseCheckbox(undefined)` devuelve `false`, y TODOS los proyectos que se adjunten van a
       parecer "no internos" — vuelve el 400 pidiendo trato ganado sobre proyectos que son
       internos de verdad, y la casilla en gris pasa a mentir en silencio. */
    const ruta = leer("app/api/handoffs/projects-of-company/route.ts");
    expect(ruta, "el batch/read dejó de pedir la propiedad").toContain('"proyecto_interno"');
    expect(ruta, "la propiedad se pide pero no viaja en el DTO").toContain("parseCheckbox(");
  });

  it("buscar otra empresa SUELTA el trato de la anterior", () => {
    /* El más caro de los tres que `buscar()` tiene que soltar, y el único que no se ve: el trato
       solo se pisaba cuando la empresa nueva tenía EXACTAMENTE un ganado, así que con 0 o con 2+
       sobrevivía el de la empresa anterior. Y no queda en un campo cualquiera — el alta lo escribe
       en `hubspotDealId` y el creador lo manda dentro de las ASOCIACIONES del POST, o sea que en
       HubSpot queda un proyecto de la empresa B colgado del trato ganado de la empresa A. Con la
       casilla de interno en el paso 1, volver atrás y buscar otra empresa dejó de ser un borde
       raro y pasó a ser el camino normal. */
    const src = leer("components/projects/NuevoProyectoStepper.tsx");
    expect(src, "el trato volvió a pisarse solo cuando hay exactamente un ganado").toContain(
      'setTratoId(ganados.length === 1 ? ganados[0].id : "")',
    );
    expect(src, "`if (ganados.length === 1) setTratoId(...)` deja vivo el trato anterior").not.toMatch(
      /if\s*\(ganados\.length === 1\)\s*setTratoId/,
    );
  });

  it("un pipeline que Nexus no conoce BLOQUEA el alta, no la avisa", () => {
    /* Si se dejara crear, el motor no podría cerrar el alta nunca: compara el tipo del espejo
       contra el elegido y al no coincidir la deja en «pendiente_espejo» para siempre. Un aviso
       sería fabricar ese estado a sabiendas. */
    const src = leer("components/projects/NuevoProyectoStepper.tsx");
    expect(src, "se calcula pero no se usa para nada").toContain("!adjuntadoSinTipoConocido");
    const i = src.indexOf("const listoParaCrear");
    expect(
      src.slice(i, i + 700),
      "el bloqueo no está en la condición del botón de crear",
    ).toContain("adjuntadoSinTipoConocido");
  });

  it("al adjuntar, la casilla es de solo lectura", () => {
    /* Editable prometería algo que Nexus no puede cumplir: en ese camino no crea nada en HubSpot,
       así que la marca no se aplicaría. Se muestra deshabilitada con lo que dice el record. */
    const src = leer("components/projects/NuevoProyectoStepper.tsx");
    expect(src).toContain("adjuntado?.interno");
    const i = src.indexOf("adjuntado?.interno");
    expect(src.slice(Math.max(0, i - 200), i + 200), "la casilla del adjuntar quedó editable")
      .toContain("disabled");
  });
});
