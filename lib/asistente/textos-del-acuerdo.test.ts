/**
 * lib/asistente/textos-del-acuerdo.test.ts — LO QUE DICEN EL BOTÓN, LA ESPERA Y EL DESENLACE DE UN
 * ACUERDO SOBRE LA PROPUESTA (E3 P5).
 *
 * Correr: `npx vitest run lib/asistente/textos-del-acuerdo.test.ts --project unit`.
 *
 * Con una propuesta abierta, lo acordado va a la PROPUESTA (o la aplica entera, o la descarta): «Aplicar
 * al cronograma» y «el cronograma ya quedó actualizado» mentirían. Sin propuesta, todo sigue como antes.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  ACUERDO_DE_OTRA_VERSION,
  claseDeAcuerdo,
  destinoDelAcuerdo,
  llevaCasillas,
  loQueSeManda,
  motivoParaElAcuerdo,
  MOTIVOS_DEL_CHAT,
  NOTA_AVANCE_REEVALUANDOSE,
  rotuloDelAcuerdoAplicado,
  textoDelAcuerdoAplicado,
  textoDelBoton,
  textoDeLosRechazos,
  textoDelDesenlace,
  textoDelDesenlaceDeLaPropuesta,
  textoMientrasAplica,
  type LaPropuestaEnPantalla,
} from "./textos-del-acuerdo";

const pasar = { borrador: "run-4", operaciones: [{ op: "propuesta.dejar-como-estaba", claves: ["n:1"] }, { op: "fase.duracion" }] };
const aplicar = { borrador: "run-4", operaciones: [{ op: "propuesta.aplicar", version: 3, huella: "h" }] };
const descartar = { borrador: "run-4", operaciones: [{ op: "propuesta.descartar-entera" }] };
const deHoy = { borrador: null, operaciones: [{ op: "fase.duracion" }] };
const viejo = { operaciones: [{ op: "fase.duracion" }] };

describe("⭐ qué hace el botón", () => {
  it("por el acuerdo: pasar, aplicar o descartar; sin propuesta, ninguno de los tres", () => {
    /* La edición que la pone en rojo: tratar un acuerdo sin `borrador` (o con null) como de la propuesta,
       o tomar «aplicar» mezclado como «aplicar». */
    expect(claseDeAcuerdo(pasar)).toBe("pasar");
    expect(claseDeAcuerdo(aplicar)).toBe("aplicar");
    expect(claseDeAcuerdo(descartar)).toBe("descartar");
    expect(claseDeAcuerdo(deHoy)).toBeNull();
    expect(claseDeAcuerdo(viejo)).toBeNull();
    expect(claseDeAcuerdo({ borrador: "run-4", operaciones: [...aplicar.operaciones, { op: "fase.duracion" }] })).toBe("pasar");
  });

  it("los textos, cortos y en tuteo; sin propuesta, null (el cajón usa los de siempre)", () => {
    /* ⚠ ACTUALIZADA en la revisión de E3 (#21), con esta razón: el «(N)» sale solo si se desmarcó algo (como
       el botón de siempre), así que `textoDelBoton` recibe cuántas se desmarcaron. Con todo marcado, sin número. */
    expect(textoDelBoton(pasar, 2, 0)).toBe("Pasar a la propuesta");
    expect(textoDelBoton(pasar, 2, 1)).toBe("Pasar a la propuesta (2)");
    expect(textoDelBoton(aplicar, 1, 0)).toBe("Aplicar la propuesta al cronograma");
    expect(textoDelBoton(descartar, 1, 0)).toBe("Descartar la propuesta");
    expect(textoMientrasAplica(pasar)).toBe("Pasando a la propuesta…");
    expect(textoMientrasAplica(aplicar)).toBe("Aplicando la propuesta…");
    expect(textoMientrasAplica(descartar)).toBe("Descartando la propuesta…");
    expect(textoDelAcuerdoAplicado(pasar)).toBe("Pasado a la propuesta. ¿Algo más, o la aplicas?");
    expect(textoDelAcuerdoAplicado(aplicar)).toBe("Propuesta aplicada al cronograma.");
    expect(textoDelAcuerdoAplicado(descartar)).toBe("Propuesta descartada.");
    for (const a of [deHoy, viejo]) {
      expect(textoDelBoton(a, 1, 0)).toBeNull();
      expect(textoMientrasAplica(a)).toBeNull();
      expect(textoDelAcuerdoAplicado(a)).toBeNull();
      expect(rotuloDelAcuerdoAplicado(a)).toBeNull();
      expect(destinoDelAcuerdo(a)).toBeNull();
    }
    expect([destinoDelAcuerdo(pasar), destinoDelAcuerdo(aplicar), destinoDelAcuerdo(descartar)]).toEqual([
      "propuesta",
      "cronograma",
      "descarte",
    ]);
  });
});

describe("⭐ el desenlace dice a dónde fue", () => {
  it("a la propuesta, con o sin detalle; el descarte; y el cronograma queda como antes", () => {
    /* La edición que la pone en rojo: escribir «el cronograma ya quedó actualizado» sobre algo que pasó a
       la propuesta (el CSE lo repetiría al cliente). */
    expect(textoDelDesenlaceDeLaPropuesta("propuesta", "")).toBe(
      "✅ Listo, quedó en la propuesta (arriba del Gantt). El cronograma no cambia hasta que la apliques.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("propuesta", "Dejé lo que editaste a mano")).toBe(
      "⚠ Pasó a la propuesta, pero con una parte hice algo distinto:\n\nDejé lo que editaste a mano\n\nRevísala arriba del Gantt.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("descarte", "")).toBe(
      "✅ Listo, se descartó la propuesta: el cronograma queda como estaba.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("cronograma", "")).toBeNull();
    expect(textoDelDesenlaceDeLaPropuesta(undefined, "")).toBeNull();
  });

  it("⛔ el manejador acepta `destino`, lo usa, y sin él deduce como antes", () => {
    /* La edición que la pone en rojo: no aceptar el campo (el zod lo rechaza y el desenlace no se escribe),
       o dejar la vista previa en true con un destino (mandaría a «aceptar los cambios» que no existen).
       ⚠ ACTUALIZADA en la revisión de E3 (#10, #11, #15), con esta razón: el texto del desenlace salió del
       manejador a `textoDelDesenlace` (puro: sus casos se CORREN abajo). Lo que se sigue pidiendo acá es el
       cableado: el manejador acepta `destino` y `notas` y le pasa todo a la función pura. Normalizado: no
       depende del fin de línea. */
    const handler = fs.readFileSync(path.join(RAIZ, "lib/asistente/handler.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(handler).toContain('destino: z.enum(["cronograma", "propuesta", "descarte"]).optional(),');
    expect(handler).toContain("notas: z.array(z.string().max(300)).max(5).optional(),");
    expect(handler).toContain("const vistaPrevia = destino ? false : (parsed.data.desenlace.vistaPrevia ?? true);");
    expect(handler).toContain("const { ok, detalle, destino, notas } = parsed.data.desenlace;");
    expect(handler).toContain(
      'contenido: marcaDeDesenlace({ ok }) + "\\n\\n" + textoDelDesenlace({ ok, detalle, destino, vistaPrevia, elDocumento, notas }),',
    );
    expect(handler, "el manejador volvió a armar el texto por su cuenta").not.toContain("hizo algo distinto");
  });
});

/**
 * ── REVISIÓN DE E3 (#10, #11, #15): EL TEXTO DEL DESENLACE, CORRIDO ──────────────────────────────────
 * Vivía adentro del manejador y nada lo corría: el «avance re-evaluado» quedaba en el hilo como «⚠ el editor
 * hizo algo distinto», y un fallo que pedía pedirlo de nuevo sumaba «puedes aplicarlos de nuevo».
 */
describe("⭐ el texto del desenlace (textoDelDesenlace)", () => {
  const base = { ok: true, detalle: "", vistaPrevia: false, elDocumento: "el cronograma" } as const;

  it("⛔ una nota (el avance que se vuelve a evaluar) va APARTE, con ✅: no es «algo distinto»", () => {
    /* La edición que la pone en rojo: volver a meter la nota en el detalle (el hilo diría «⚠ Se aplicó, pero
       el editor hizo algo distinto…» y el modelo lo relee como un desvío que no hubo). */
    const t = textoDelDesenlace({ ...base, destino: "cronograma", notas: [NOTA_AVANCE_REEVALUANDOSE] });
    expect(t, "la nota se leyó como un desvío del editor").not.toContain("hizo algo distinto");
    expect(t).toBe(`✅ Listo, el cronograma ya quedó actualizado. Si algo no está como esperabas, dímelo y lo ajustamos.\n\n${NOTA_AVANCE_REEVALUANDOSE}`);
    // Con un aviso de verdad (tareas que se corrieron), el aviso sigue siendo ⚠ y la nota va después.
    const conAviso = textoDelDesenlace({ ...base, destino: "cronograma", detalle: "2 tareas pasaron a la última semana", notas: [NOTA_AVANCE_REEVALUANDOSE] });
    expect(conAviso.startsWith("⚠ Se aplicó, pero el editor hizo algo distinto con una parte:\n\n2 tareas pasaron a la última semana")).toBe(true);
    expect(conAviso.endsWith(`revísalo.\n\n${NOTA_AVANCE_REEVALUANDOSE}`)).toBe(true);
    // Sin notas, lo de siempre (y las vacías no suman renglones).
    expect(textoDelDesenlace({ ...base, destino: "cronograma", notas: [" ", ""] })).toBe(
      "✅ Listo, el cronograma ya quedó actualizado. Si algo no está como esperabas, dímelo y lo ajustamos.",
    );
    expect(NOTA_AVANCE_REEVALUANDOSE).not.toMatch(/\b(pod[eé]s|ten[eé]s|quer[eé]s|fijate|mirá|confirmá|revisá)\b/i);
  });

  it("⛔ un fallo que pide pedirlo de nuevo no dice «puedes aplicarlos de nuevo» (el botón ya no sirve)", () => {
    /* La edición que la pone en rojo: sumar siempre «Los cambios siguen pendientes: puedes aplicarlos de nuevo»
       (el hilo se contradice y el modelo lo relee). */
    for (const motivo of [
      "La propuesta cambió desde que lo acordamos: pídemelo de nuevo.",
      "El cronograma cambió desde que lo acordamos: pídemelo de nuevo.",
      "Llegó otra propuesta del cronograma: revísala.",
      ACUERDO_DE_OTRA_VERSION,
    ]) {
      const t = textoDelDesenlace({ ...base, ok: false, detalle: motivo, destino: "cronograma" });
      expect(t, motivo).not.toContain("puedes aplicarlos de nuevo");
      expect(t, motivo).toBe(`⛔ No se pudo aplicar: ${motivo.replace(/[\s.]+$/, "")}.`);
    }
    // Un fallo que sí se puede reintentar lo sigue diciendo.
    expect(textoDelDesenlace({ ...base, ok: false, detalle: "No se pudo descartar la propuesta: vuelve a intentar." })).toBe(
      "⛔ No se pudo aplicar: No se pudo descartar la propuesta: vuelve a intentar. Los cambios siguen pendientes: puedes aplicarlos de nuevo, o dime qué ajustamos.",
    );
    expect(textoDelDesenlace({ ...base, ok: false, detalle: "" })).toContain("el editor rechazó el cambio. Los cambios siguen pendientes");
  });

  it("los de siempre no cambian: la propuesta, el descarte y la vista previa del editor de un documento", () => {
    expect(textoDelDesenlace({ ...base, destino: "propuesta" })).toBe(textoDelDesenlaceDeLaPropuesta("propuesta", ""));
    expect(textoDelDesenlace({ ...base, destino: "descarte" })).toBe(textoDelDesenlaceDeLaPropuesta("descarte", ""));
    expect(textoDelDesenlace({ ...base, vistaPrevia: true, elDocumento: "el documento" })).toBe(
      "✅ Se aplicó. Revisa la vista previa en el documento y acepta los cambios que quieras conservar.",
    );
    expect(textoDelDesenlace({ ...base, vistaPrevia: true, detalle: "x", elDocumento: "el documento" })).toBe(
      "⚠ Se aplicó, pero el editor hizo algo distinto con una parte:\n\nx\n\nRevisa la vista previa antes de aceptar.",
    );
  });
});

/**
 * ── REVISIÓN DE E3 (#24, #11): POR QUÉ EL BOTÓN DE UN ACUERDO NO APLICA AHORA, CORRIDO ─────────────────
 * Era `motivoDelChat`, adentro del cronograma: sin la comparación del token, el «Descartar la propuesta»
 * acordado para la propuesta A quedaba vivo cuando llegaba otra B y la borraba (mutación CV1: la suite entera
 * en verde). Y «aplícala» con la versión vencida seguía con botón: cada clic fallaba.
 */
describe("⛔ el motivo del botón (motivoParaElAcuerdo)", () => {
  const enPantalla: LaPropuestaEnPantalla = {
    hayBorrador: true,
    ilegible: false,
    token: "run-4",
    version: 3,
    conDesconocidos: false,
    tareasArmando: false,
    bloqueada: false,
  };
  const con = (p: Partial<LaPropuestaEnPantalla>) => ({ ...enPantalla, ...p });

  it("⭐ acordado para OTRA propuesta: «cambio» en las tres clases (pasar, aplicar y descartar)", () => {
    /* La edición que la pone en rojo: dejar de comparar el token del acuerdo con el de la pantalla (el
       «Descartar» de la A borraba la B, una propuesta ya pagada que nadie leyó). */
    for (const a of [pasar, aplicar, descartar]) {
      expect(motivoParaElAcuerdo(a, con({ token: "run-5" })), JSON.stringify(a.operaciones)).toBe(MOTIVOS_DEL_CHAT.cambio);
      expect(motivoParaElAcuerdo(a, con({ hayBorrador: false, token: null })), "sin propuesta en pantalla").toBe(MOTIVOS_DEL_CHAT.cambio);
      expect(motivoParaElAcuerdo(a, enPantalla), "la misma propuesta: se puede").toBeNull();
    }
  });

  it("⛔ «aplícala» con la pantalla DESPUÉS de la versión acordada: «cambio»; atrás o igual, se puede", () => {
    /* La edición que la pone en rojo: no mirar la versión (el botón seguía vivo y cada clic fallaba con
       «La propuesta cambió desde que lo acordamos»), o frenar también cuando la pantalla va atrás (aplicar
       trae la guardada y compara: frenarlo trababa un acuerdo bueno). */
    expect(motivoParaElAcuerdo(aplicar, con({ version: 4 }))).toBe(MOTIVOS_DEL_CHAT.cambio);
    expect(motivoParaElAcuerdo(aplicar, con({ version: 3 }))).toBeNull();
    expect(motivoParaElAcuerdo(aplicar, con({ version: 2 }))).toBeNull();
    expect(motivoParaElAcuerdo({ borrador: "run-4", operaciones: [{ op: "propuesta.aplicar" }] }, enPantalla), "sin versión acordada").toBe(
      MOTIVOS_DEL_CHAT.cambio,
    );
    // Pasar y descartar no dependen de la versión (pasar opera sobre la de ahora; descartar, entera).
    expect(motivoParaElAcuerdo(pasar, con({ version: 9 }))).toBeNull();
    expect(motivoParaElAcuerdo(descartar, con({ version: 9 }))).toBeNull();
  });

  it("los demás frenos, en su orden: versión nueva, tareas armando, recálculo pendiente (solo aplicar)", () => {
    expect(motivoParaElAcuerdo(aplicar, con({ conDesconocidos: true }))).toBe(MOTIVOS_DEL_CHAT.enSuBarra);
    expect(motivoParaElAcuerdo(pasar, con({ tareasArmando: true }))).toBe(MOTIVOS_DEL_CHAT.armando);
    expect(motivoParaElAcuerdo(aplicar, con({ bloqueada: true }))).toBe(MOTIVOS_DEL_CHAT.recalcular);
    expect(motivoParaElAcuerdo(pasar, con({ bloqueada: true }))).toBeNull();
  });

  it("sin propuesta en el acuerdo: el PUT de siempre, salvo que haya una propuesta en pantalla", () => {
    const sinNada = con({ hayBorrador: false, token: null, version: null });
    expect(motivoParaElAcuerdo(deHoy, sinNada)).toBeNull();
    expect(motivoParaElAcuerdo(deHoy, con({ hayBorrador: false, ilegible: true, token: null }))).toBe(MOTIVOS_DEL_CHAT.enSuBarra);
    expect(motivoParaElAcuerdo(deHoy, con({ conDesconocidos: true }))).toBe(MOTIVOS_DEL_CHAT.enSuBarra);
    expect(motivoParaElAcuerdo(deHoy, con({ tareasArmando: true }))).toBe(MOTIVOS_DEL_CHAT.armando);
    expect(motivoParaElAcuerdo(deHoy, enPantalla)).toBe(MOTIVOS_DEL_CHAT.hayPropuesta);
    // Sin operaciones (E4): es de una versión anterior, antes que cualquier otra cosa.
    expect(motivoParaElAcuerdo({ borrador: "run-4" }, enPantalla)).toBe(ACUERDO_DE_OTRA_VERSION);
    expect(motivoParaElAcuerdo({ borrador: null }, sinNada)).toBe(ACUERDO_DE_OTRA_VERSION);
  });

  it("⭐ los motivos entran en el botón (≤ 60 caracteres) y van en tuteo", () => {
    const motivos = Object.values(MOTIVOS_DEL_CHAT);
    // E4: 6 → 5 (sale «Descarta la vista previa de «Pedir cambio con IA»»: se retiró).
    expect(motivos.length).toBe(5);
    for (const m of motivos) {
      expect(m.length, m).toBeLessThanOrEqual(60);
      expect(m, m).not.toMatch(/\b(pod[eé]s|ten[eé]s|quer[eé]s|fijate|mirá|pedímelo|resolvé|esperá)\b/i);
    }
  });
});

/**
 * ── REVISIÓN DE E3 (#19, #20, #21): LA CAJITA Y SU BOTÓN DICEN LO QUE PASA ──────────────────────────────
 */
describe("⭐ revisión de E3 · la cajita del acuerdo", () => {
  it("⛔ #21 · «Pasar a la propuesta» lleva «(N)» solo con algo desmarcado", () => {
    /* La edición que la pone en rojo: volver a poner el número siempre («Pasar a la propuesta (1)» con un solo
       cambio y nada desmarcado: texto de más y distinto del botón de siempre). */
    expect(textoDelBoton(pasar, 2, 0), "el número salió sin nada desmarcado").toBe("Pasar a la propuesta");
    expect(textoDelBoton(pasar, 1, 1), "con algo desmarcado, el número dice cuántos se pasan").toBe("Pasar a la propuesta (1)");
  });

  it("⛔ #21 · «aplícala» y «descártala» van sin casilla (una sola línea: desmarcarla solo servía para equivocarse)", () => {
    /* La edición que la pone en rojo: darles casilla (el botón pasaba a «No queda nada marcado»), o quitársela a
       lo que se pasa a la propuesta o a lo de siempre (ahí sí se elige qué va). */
    expect(llevaCasillas(aplicar), "«aplícala» con casilla").toBe(false);
    expect(llevaCasillas(descartar), "«descártala» con casilla").toBe(false);
    for (const a of [pasar, deHoy, viejo]) expect(llevaCasillas(a), JSON.stringify(a)).toBe(true);
  });

  it("⛔ #19 · el rechazo cita la LÍNEA de la cajita, también con una desmarcada antes", () => {
    /* La cajita numera TODAS las líneas (también las tachadas); el servidor numera entre lo mandado. Con la 2
       desmarcada y la 3 rechazada, el error decía «#2»: la que se tachó. Las ediciones que la ponen en rojo:
       mandar las operaciones recortadas con todas las líneas (`loQueSeManda` sin recortar `lineas`), o volver a
       armar el error con el número. */
    const acuerdo = {
      borrador: "run-4",
      operaciones: [{ op: "a" }, { op: "b" }, { op: "c" }],
      lineas: ["Mover «Kickoff» a S2", "Quitar «Demo»", "Renombrar «Piloto» a «Pruebas»"],
    };
    const mandado = loQueSeManda(acuerdo, new Set([1]));
    expect(mandado.operaciones).toEqual([{ op: "a" }, { op: "c" }]);
    expect(mandado.lineas, "las líneas no quedaron alineadas con lo mandado").toEqual(["Mover «Kickoff» a S2", "Renombrar «Piloto» a «Pruebas»"]);
    // El servidor rechaza la segunda de lo MANDADO (índice 1): es la 3 de la cajita.
    const texto = textoDeLosRechazos([{ indice: 1, motivo: "esa fase no está en la propuesta" }], mandado.lineas);
    expect(texto, "el error señala otra línea").toBe("«Renombrar «Piloto» a «Pruebas»»: esa fase no está en la propuesta");
    expect(texto).not.toContain("#");
    // El acuerdo de antes queda entero (la nota de lo descartado lo necesita) y sin nada desmarcado no cambia.
    expect(acuerdo.lineas).toHaveLength(3);
    expect(loQueSeManda(acuerdo)).toEqual(acuerdo);
    // Un acuerdo de texto (sin operaciones) va tal cual.
    const deTexto = { instruccion: "x", lineas: ["uno"] };
    expect(loQueSeManda(deTexto, new Set([0]))).toBe(deTexto);
    // Una línea larga se recorta; sin su línea, el número de lo mandado.
    const larga = "x".repeat(120);
    expect(textoDeLosRechazos([{ indice: 0, motivo: "m" }], [larga])).toBe(`«${"x".repeat(69)}…»: m`);
    expect(textoDeLosRechazos([{ indice: 4, motivo: "m" }, { indice: 0, motivo: "n" }], ["a"])).toBe("#5: m · «a»: n");
  });

  it("⛔ #20 · «Falta recalcular tareas» (no «Faltan»: el sujeto es el infinitivo)", () => {
    /* La edición que la pone en rojo: volver a «Faltan recalcular tareas: mira la barra». */
    expect(MOTIVOS_DEL_CHAT.recalcular).toBe("Falta recalcular tareas: mira la barra");
  });
});
