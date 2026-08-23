/**
 * lib/asistente/emision-del-turno.test.ts — QUE EL CHAT NO PROMETA UN CAMBIO Y NO LO REGISTRE.
 *
 * ⚠ La guarda que FALTABA, y que habría cazado la clase entera: no había ni un test que ejerciera
 * «el modelo contesta con prosa y sin herramienta». `turno.test.ts` tiene 656 líneas y ninguna
 * cubre ese turno, porque el loop vive dentro de una función que llama a Anthropic y lo único que
 * se podía afirmar eran escaneos de fuente — que sobreviven a cualquier reescritura que conserve
 * la cadena de texto. Estas dos decisiones son puras, así que se prueban de verdad.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  decidirReintento,
  avisoDeTurnoSinAcuerdo,
  reclamoDeOmision,
  reclamoDeImitacion,
  terminaEnPregunta,
} from "./emision-del-turno";

const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const TURNO = leer("lib/asistente/turno.ts");
const RAMA = TURNO.slice(
  TURNO.indexOf("if (!esCronograma) {"),
  TURNO.indexOf("} else {", TURNO.indexOf("if (!esCronograma) {")),
);

const turno = (o: Partial<Parameters<typeof decidirReintento>[0]> = {}) => ({
  rechazadas: 0,
  huboTool: true,
  opsUtilizables: 0,
  preguntaAbierta: false,
  /* ⚠ El default es «no imitó»: si fuera true, todos los casos de abajo cambiarían de significado
     sin que nadie los relea. */
  imitoElMarcador: false,
  ...o,
});

describe("⭐ el reintento deja de ser ciego a la OMISIÓN", () => {
  it("el caso de Elías: llamó la herramienta, no emitió nada, y no preguntó nada", () => {
    /* «Agrego dos objetivos nuevos: la transición desde Pardot y la capacitación del equipo» — y
       ninguna operación. Antes de este arreglo el turno cerraba acá, mudo. */
    expect(decidirReintento(turno())).toBe("por-omision");
  });

  it("y también cuando NI SIQUIERA llamó la herramienta: prosa pura", () => {
    /* Los dos caminos son indistinguibles desde el código y producen la misma pantalla, así que
       los dos tienen que disparar. */
    expect(decidirReintento(turno({ huboTool: false }))).toBe("por-omision");
  });

  it("el error de NOMBRES sigue teniendo prioridad: corregirlos salva más turnos", () => {
    expect(decidirReintento(turno({ rechazadas: 2, opsUtilizables: 0 }))).toBe("por-rechazo");
  });

  it("con operaciones aceptadas no se reintenta nada", () => {
    expect(decidirReintento(turno({ opsUtilizables: 2 }))).toBe("no");
  });

  it("⛔ NO se reintenta cuando el modelo dejó una PREGUNTA abierta", () => {
    /* Preguntar con cero operaciones es legítimo: el pedido era ambiguo y el prompt le pide
       preguntar. Empujarlo ahí sería empujarlo a INVENTAR justo donde tuvo razón en no hacerlo —
       el mismo motivo por el que `tool_choice` está descartado. */
    expect(decidirReintento(turno({ preguntaAbierta: true }))).toBe("no");
    expect(decidirReintento(turno({ preguntaAbierta: true, huboTool: false }))).toBe("no");
  });

  it("⛔ tampoco cuando el turno YA tiene algo que ofrecer del libro de pendientes", () => {
    /* Si algo sigue acordado y sin aplicar, la cajita se va a pintar igual: el turno no está mudo,
       y gastar una llamada para agregarle un renglón no es lo que este arreglo persigue. */
    expect(decidirReintento(turno({ opsUtilizables: 1 }))).toBe("no");
  });

  it("el reclamo le deja la SALIDA de no emitir, en los dos textos", () => {
    /* Sin esa salida el reintento es `tool_choice` con otro nombre: forzaría la herramienta en los
       tres casos donde el prompt le prohíbe emitirla. */
    for (const huboTool of [true, false]) {
      const r = reclamoDeOmision(huboTool);
      expect(r.length).toBeGreaterThan(120);
      expect(r, `el reclamo con huboTool=${huboTool} no deja salir sin emitir`).toMatch(
        /no corresponde|contesta en texto|contesta igual en texto/,
      );
    }
    /* Y son textos DISTINTOS: llamar la herramienta vacía es una contradicción con su propia
       llamada; no llamarla puede ser correcto. */
    expect(reclamoDeOmision(true)).not.toBe(reclamoDeOmision(false));
  });
});

describe("⭐ el modelo IMITA el marcador en vez de llamar la herramienta", () => {
  it("⭐ EL CASO DE ELÍAS: imitó, y el libro de pendientes tenía operaciones", () => {
    /* Con el libro cargado, `opsUtilizables` era 2 y el reintento por omisión no disparaba. La
       premisa —«si hay pendientes el turno no está mudo»— era cierta y era IRRELEVANTE: el turno
       no estaba mudo, estaba DICIENDO OTRA COSA. La persona leyó «sumo dos objetivos» y la cajita
       le ofreció aplicar dos borrados que no pidió.
       La edición que la pone en rojo: mover el chequeo de imitación DESPUÉS del de opsUtilizables. */
    expect(decidirReintento(turno({ huboTool: false, imitoElMarcador: true, opsUtilizables: 2 }))).toBe(
      "por-imitacion",
    );
  });

  it("⭐ y el ORDEN importa: sin pendientes, gana el reclamo que NOMBRA el marcador", () => {
    /* Los dos caminos reintentan, así que la diferencia no es «si» sino QUÉ se le dice. Con el
       chequeo de imitación después del de omisión, el modelo recibe «no emitiste nada» —cierto y
       poco útil— en vez de «escribiste el marcador, eso no registra nada», que es lo que le explica
       QUÉ hizo mal. La edición que la pone en rojo: mover el chequeo de imitación una línea abajo. */
    expect(decidirReintento(turno({ huboTool: false, imitoElMarcador: true, opsUtilizables: 0 }))).toBe(
      "por-imitacion",
    );
  });

  it("⛔ pero NO si dejó una pregunta abierta", () => {
    /* Mismo criterio que veta `tool_choice`: empujarlo ahí sería empujarlo a inventar justo donde
       tuvo razón en no hacerlo. */
    expect(
      decidirReintento(turno({ imitoElMarcador: true, preguntaAbierta: true, opsUtilizables: 0 })),
    ).toBe("no");
  });

  it("corregir NOMBRES sigue teniendo prioridad sobre la imitación", () => {
    /* Si hay rechazos, el modelo SÍ emitió: corregirle el nombre salva más turnos que retarlo. */
    expect(decidirReintento(turno({ rechazadas: 2, imitoElMarcador: true }))).toBe("por-rechazo");
  });

  it("el reclamo NOMBRA el marcador y dice que lo pone la app", () => {
    /* El modelo lo veía crudo en su historial: sin decirle qué es, no tiene forma de saber por qué
       está mal escribirlo. */
    const r = reclamoDeImitacion();
    expect(r).toContain("<<<ACUERDO>>>");
    expect(r).toContain("lo pone la app");
    expect(r).toMatch(/contesta en texto/);
  });
});

describe("⭐ un turno mudo deja de ser mudo", () => {
  it("llamó la herramienta y no quedó nada: se dice", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: true, seLeReclamo: false, preguntaAbierta: false });
    expect(a).toContain("No dejé registrado ningún cambio");
  });

  it("se le reclamó por omisión y siguió sin emitir: se dice", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: false, seLeReclamo: true, preguntaAbierta: false });
    expect(a).toBeTruthy();
  });

  it("⛔ pero se CALLA en un turno legítimo sin herramienta ni reclamo", () => {
    /* «eso no se toca desde acá», «esto es lo que puedo hacer». Meterle un ⚠ a cada uno enseñaría
       a ignorar el ⚠, que es exactamente cómo muere una alerta. */
    expect(avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: false, seLeReclamo: false, preguntaAbierta: false })).toBeNull();
  });

  it("⛔ y se calla cuando el modelo dejó una PREGUNTA abierta", () => {
    /* Elías lo vio en el diagnóstico: el chat preguntaba «¿a cuál de los tres te referís?» y
       debajo aparecía «no dejé registrado ningún cambio». Es obvio y suena a error — y un aviso que
       sobra enseña a ignorar los avisos.
       La edición que la pone en rojo: sacar el corte por `preguntaAbierta`. */
    expect(
      avisoDeTurnoSinAcuerdo({
        hayAcuerdo: false,
        huboTool: true,
        seLeReclamo: false,
        preguntaAbierta: true,
      }),
    ).toBeNull();
  });

  it("y se calla siempre que HAY acuerdo", () => {
    expect(avisoDeTurnoSinAcuerdo({ hayAcuerdo: true, huboTool: true, seLeReclamo: true, preguntaAbierta: false })).toBeNull();
  });

  it("⚠ el aviso está en tuteo neutro: se persiste en el hilo y el modelo lo relee", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: true, seLeReclamo: false, preguntaAbierta: false }) ?? "";
    expect(a).not.toMatch(/\b(pedime|decime|podés|tenés|querés|dale)\b/i);
  });
});

describe("las dos decisiones están CABLEADAS, no solo escritas", () => {
  it("la rama de documentos usa las dos funciones puras", () => {
    expect(RAMA.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(RAMA, "el reintento dejó de consultar la decisión pura").toContain("decidirReintento({");
    expect(RAMA, "el turno mudo volvió a no decir nada").toContain("avisoDeTurnoSinAcuerdo({");
  });

  it("⛔ sigue habiendo UN SOLO reintento: lo que se ensanchó es el disparador", () => {
    /* Un loop sin corte no falla: encadena llamadas que nadie ve hasta que aparecen en la factura.
       La edición que la pone en rojo: un segundo `preguntarleAlModelo` para el caso nuevo. */
    expect((RAMA.match(/await preguntarleAlModelo\(/g) ?? []).length).toBe(1);
  });

  it("⭐ el acuerdo lo deciden las OPERACIONES, no el texto que las acompaña", () => {
    /* El gate exigía `resumenDelModelo` además de las operaciones: un turno con operaciones
       VÁLIDAS y el resumen vacío las tiraba en silencio. El cronograma ya tenía el paracaídas. */
    expect(RAMA, "volvió a exigir el resumen para armar el acuerdo").not.toContain(
      "if (resumenDelModelo && opsDeDoc.length > 0)",
    );
    expect(RAMA).toContain("resumen: resumenDelModelo || RESUMEN_DE_ARRASTRE");
  });

  it("⛔ el modelo deja de VER el marcador en su propio historial", () => {
    /* Era un ejemplo involuntario: N turnos mostrándole un formato que «funciona» y que él nunca
       escribió. `acuerdo.ts` ya lo tenía anotado como riesgo y por eso el parseo usa
       `lastIndexOf`; faltaba cerrar la otra mitad — no enseñárselo.
       La edición que la pone en rojo: volver a `content: t.contenido`. */
    const bloque = TURNO.slice(TURNO.indexOf("const messages:"), TURNO.indexOf("role: \"user\" as const"));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    expect(bloque, "el historial volvió a viajar crudo").toContain("textoVisible(t.contenido)");
  });

  it("⛔ y si igual lo imita, el JSON no se VE", () => {
    /* Dos cortes distintos: el ÚLTIMO marcador para parsear (no se toca: cambiarlo hizo desaparecer
       la cajita entera una vez) y el PRIMERO para mostrar. */
    const acu = leer("lib/asistente/acuerdo.ts");
    expect(acu, "el parseo dejó de tomar el último").toContain("contenido.lastIndexOf(MARCA_DE_ACUERDO)");
    expect(acu, "el texto visible volvió a cortarse por el último").toContain(
      "contenido.slice(0, contenido.indexOf(MARCA_DE_ACUERDO))",
    );
  });

  it("⛔ la imitación queda registrada AUNQUE el turno termine con acuerdo", () => {
    /* Es el caso que era doblemente silencioso —sin ⚠ y sin log— y el único dato que dice si esto
       está haciendo efecto en producción. */
    expect(RAMA).toContain("el modelo imitó el marcador");
  });

  it("⛔ el turno mudo deja RASTRO en el servidor", () => {
    /* Sin log, «el modelo no emitió» es infalsificable: se discute con hipótesis en vez de con el
       dato. Pasó exactamente eso el 2026-08-23. */
    expect(RAMA).toMatch(/console\.warn\(/);
    expect(RAMA).toContain("turno sin acuerdo");
  });

  it("lo que se cayó solo VIAJA también en el acuerdo de documentos", () => {
    /* La rama de documentos lo calculaba y lo tiraba, mientras la cajita vieja seguía rotulada
       «sigue abajo, en la propuesta vigente» sobre cambios que ya no viajaban. */
    expect(RAMA).toContain("descartadas: soltadas");
  });

  it("⛔ `leerElTurno` no deja estado del intento anterior", () => {
    /* Reseteaba solo `respuesta` e `idDeLaHerramienta`: el intento 2 heredaba el resumen y las
       operaciones del 1, así que un segundo intento en texto armaba un acuerdo con las
       operaciones VIEJAS. Con el reintento por omisión eso pasaría a ser el camino normal. */
    const leer = TURNO.slice(TURNO.indexOf("const leerElTurno ="), TURNO.indexOf("leerElTurno(msg);"));
    expect(leer.length).toBeGreaterThan(300);
    for (const campo of ["resumenDelModelo", "opsNuevas", "descartar", "preguntaAbierta", "instruccionDelModelo"]) {
      expect(leer, `\`${campo}\` sobrevive al reintento`).toMatch(
        new RegExp(`${campo} = (""|\\[\\]|false);`),
      );
    }
  });
});

describe("⛔ preguntar SIN llamar la herramienta no es un turno mudo", () => {
  /**
   * El docblock de `decidirReintento` decía «no se reintenta cuando el modelo dejó una pregunta
   * abierta»… y ese estado era INALCANZABLE en el caso que importa: `preguntaAbierta` viaja DENTRO
   * de la herramienta, y el prompt le pide explícitamente NO llamarla cuando pregunta.
   *
   * Consecuencia medida: un turno de desambiguación legítimo caía en `por-omision`, gastaba el
   * único reintento —empujándolo a inventar justo donde tuvo razón en no hacerlo— y se llevaba
   * encima un «⚠ no registré nada» falso. Lo encontró la revisión adversarial del rango.
   */
  it("⭐ el turno que TERMINA preguntando no dispara el reintento", () => {
    expect(
      decidirReintento({
        rechazadas: 0,
        huboTool: false,
        opsUtilizables: 0,
        preguntaAbierta: false,
        imitoElMarcador: false,
        preguntaEnElTexto: true,
      }),
    ).toBe("no");
  });

  it("…y sin la pregunta, el mismo turno SÍ lo dispara", () => {
    expect(
      decidirReintento({
        rechazadas: 0,
        huboTool: false,
        opsUtilizables: 0,
        preguntaAbierta: false,
        imitoElMarcador: false,
        preguntaEnElTexto: false,
      }),
    ).toBe("por-omision");
  });

  it("la señal es MECÁNICA: el texto termina en «?», no «hay un ? por ahí»", () => {
    /* El modelo cita preguntas del CSE a mitad de una respuesta que sí cierra con un cambio. Lo
       que define un turno de desambiguación es que TERMINA preguntando. */
    expect(terminaEnPregunta("¿Querés que lo resuma o que lo acorte?")).toBe(true);
    expect(terminaEnPregunta("¿Lo acorto?  "+String.fromCharCode(10))).toBe(true);
    expect(terminaEnPregunta("**¿Cuál de las dos?**")).toBe(true);
    expect(
      terminaEnPregunta("Preguntaste «¿se puede ocultar?». Sí: lo dejo listo."),
      "una pregunta CITADA a mitad de un turno que sí propone no es una pregunta suya",
    ).toBe(false);
    expect(terminaEnPregunta("Listo, lo apliqué.")).toBe(false);
  });

  it("⭐ y el turno lo CABLEA solo cuando no hubo herramienta", () => {
    /* Con herramienta, el canal declarado es `preguntaAbierta`: mirar el texto además abriría una
       segunda fuente para lo mismo, que es como divergen. */
    expect(leer("lib/asistente/turno.ts")).toContain(
      "preguntaEnElTexto: !idDeLaHerramienta && terminaEnPregunta(respuesta)",
    );
  });
});

