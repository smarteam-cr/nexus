/**
 * lib/timeline/apertura-del-chat.test.ts — EL CHAT SE ABRE SOLO CON UNA PROPUESTA NUEVA, UNA VEZ (E3 P5).
 *
 * Correr: `npx vitest run lib/timeline/apertura-del-chat.test.ts --project unit`.
 *
 * La tabla completa de `debeAbrirseElChat`, y lo que recuerda el navegador. Una vez por persona y por
 * propuesta (D14): la marca del servidor gana aunque el navegador no recuerde nada.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  abiertoTrasTocarElChat,
  accionesDeLaApertura,
  anotarEnLaEspera,
  claveDeLaApertura,
  debeAbrirseElChat,
  esCampoDeEscritura,
  ESPERA_DE_UN_CAMPO,
  faltaParaQueTermineElGesto,
  faltaParaReintentarPorElCampo,
  gestoEnCurso,
  leerApertura,
  motivoParaPosponer,
  recordarApertura,
  avisoDelChat,
  divisoriaDelChat,
  dondeEmpiezaLaPropuesta,
  EJEMPLO_APLICAR_LA_PROPUESTA,
  ejemplosDelResumen,
  EJEMPLOS_SIN_PROPUESTA,
  estadoParaElChat,
  textoDeLaDivisoria,
  seVuelveADecidir,
  VENTANA_DEL_GESTO_MS,
  type AlmacenDeLaApertura,
  type AvisoDelChat,
  type DecisionDeApertura,
  type EntradaDeLaApertura,
  type EntradaDelChat,
  type EstadoParaElChat,
  type EventoDeLaEspera,
  type MotivoDePosposicion,
} from "./apertura-del-chat";
import { BLOQUEO_VERSION_NUEVA, LINEA_DEL_CLIENTE } from "./borrador";
import { motivoParaElAcuerdo, MOTIVOS_DEL_CHAT, type LaPropuestaEnPantalla } from "../asistente/textos-del-acuerdo";

const BASE: EntradaDeLaApertura = {
  puedeEditar: true,
  puedeConversar: true,
  hayBorrador: true,
  token: "run-4",
  editable: true,
  soloFase: false,
  conCambios: true,
  nadaQueDecidir: false,
  tareasArmando: false,
  recalculando: false,
  ocupado: false,
  conOtraCapa: false,
  chatAbierto: false,
  anchoSuficiente: true,
  escribiendo: false,
  gestoEnCurso: false,
  punteroEnElGantt: false,
  pospuesta: false,
  reintento: false,
  abiertoEnElServidor: false,
  recordadoLocal: false,
};
const con = (cambio: Partial<EntradaDeLaApertura>) => debeAbrirseElChat({ ...BASE, ...cambio });

describe("⭐ cuándo se abre solo", () => {
  it("con una propuesta nueva, en una pantalla ancha y sin nada encima: se abre", () => {
    expect(con({})).toBe("abrir");
  });

  it("⛔ sin permiso, sin propuesta guardada, o sin nada que decidir: nada", () => {
    /* La edición que la pone en rojo: abrirlo a quien no puede editar o no puede conversar (la ruta del chat
       le respondería 403), o sobre una propuesta que se descarta sola. Se retiró «Pedir cambio con IA» (E4): ya no
       hay vista previa del modificador, y su fila (`deAssist`) salió con ella. */
    for (const c of [
      { puedeEditar: false },
      { puedeConversar: false },
      { hayBorrador: false },
      { token: null },
      { conCambios: false },
      { nadaQueDecidir: true },
    ]) {
      expect(con(c), JSON.stringify(c)).toBe("nada");
    }
  });

  it("⭐ ya se abrió para esta persona (en cualquier computadora): nada, aunque el navegador no lo recuerde", () => {
    /* La edición que la pone en rojo: mirar solo `localStorage` (Elías lo vería abrirse en sus dos PCs). */
    expect(con({ abiertoEnElServidor: true })).toBe("nada");
    expect(con({ abiertoEnElServidor: true, recordadoLocal: false, chatAbierto: false })).toBe("nada");
  });

  it("este navegador lo recuerda pero el servidor no: se vuelve a marcar, sin abrir", () => {
    expect(con({ recordadoLocal: true })).toBe("solo-marcar");
  });

  it("⛔ mientras la IA arma o recalcula, o con el cronograma ocupado: se espera (todavía no está lista)", () => {
    /* La edición que la pone en rojo: abrirlo mientras la propuesta todavía no se puede editar.
       ⚠ ACTUALIZADA en la revisión de E3 (#17), con esta razón: «otra capa encima» ya no espera. Esperar la
       dejaba en «nada» y el chat se abría después con cualquier cosa (el primer clic en una casilla), corriendo
       el Gantt bajo el cursor; ahora se pospone (fila de abajo). */
    for (const c of [{ tareasArmando: true }, { recalculando: true }, { ocupado: true }]) {
      expect(con(c), JSON.stringify(c)).toBe("nada");
    }
  });

  it("ya abierto a mano: solo se marca, también en una pantalla angosta o con otra capa encima", () => {
    /* La edición que la pone en rojo: mirar el ancho (o la capa) ANTES que el cajón abierto (mutación AP1 de la
       revisión de E3, #26: con el orden invertido, el chat abierto a mano en una pantalla angosta no se marcaba
       y la tabla seguía en verde). */
    expect(con({ chatAbierto: true })).toBe("solo-marcar");
    expect(con({ chatAbierto: true, anchoSuficiente: false }), "chat abierto + pantalla angosta").toBe("solo-marcar");
    expect(con({ chatAbierto: true, conOtraCapa: true }), "chat abierto + otra capa").toBe("solo-marcar");
  });

  it("⛔ revisión de E3 (#17) · si la persona está en otra cosa al llegar la propuesta, se pospone: no se abre después", () => {
    /* Se decide UNA vez, cuando la propuesta queda lista. La edición que la pone en rojo: abrirlo con otra capa,
       en una pantalla angosta, mientras se escribe en un campo o en medio de un gesto en el Gantt (el cajón corre
       400 px lo que se está tocando); o esperar («nada») y abrirlo después con cualquier cambio.
       ⚠ ACTUALIZADA en la revisión de los arreglos, con esta razón: el puntero QUIETO sobre el Gantt ya no pospone
       (su fila, abajo); lo que pospone es el gesto en curso (`gestoEnCurso`). */
    for (const c of [{ conOtraCapa: true }, { anchoSuficiente: false }, { escribiendo: true }, { gestoEnCurso: true }]) {
      expect(con(c), JSON.stringify(c)).toBe("posponer");
    }
    // Pospuesta en esta pantalla: aunque ya no haya nada en el medio, no se abre sola (antes: el primer clic
    // en una casilla la abría). Si la persona lo abre a mano, se marca.
    expect(con({ pospuesta: true }), "se abrió después, en un momento cualquiera").toBe("nada");
    expect(con({ pospuesta: true, chatAbierto: true })).toBe("solo-marcar");
    // Lo que manda el servidor o el navegador gana igual.
    expect(con({ pospuesta: true, abiertoEnElServidor: true })).toBe("nada");
  });

  it("⭐ revisión de los arreglos · con el puntero QUIETO sobre la barra o el Gantt, sin gesto, se abre", () => {
    /* `#cronograma-gantt` envuelve la barra de la propuesta, la línea de las tareas y el Gantt: casi toda la
       pantalla. Quien mira la barra mientras espera «Regenerar todo» (o entra por «Revisar» del cartel, que salta
       a ese id) es justo a quien se le abre. La edición que la pone en rojo: volver a contar el hover como «estar
       en otra cosa» (el chat casi nunca se abría solo y quedaba solo el punto). */
    expect(con({ punteroEnElGantt: true }), "puntero quieto sobre la barra o el Gantt, sin gesto").toBe("abrir");
    expect(motivoParaPosponer({ ...BASE, punteroEnElGantt: true }), "el hover volvió a ser un motivo").toBeNull();
    // Con un gesto de verdad (el botón apretado, un clic o una tecla recién), sí se pospone.
    expect(con({ punteroEnElGantt: true, gestoEnCurso: true })).toBe("posponer");
  });

  it("⭐ revisión de los arreglos · se pospuso por algo pasajero que ya terminó: se vuelve a decidir UNA vez", () => {
    /* Antes, «posponer» valía para siempre en esa pantalla: la regla respondía «nada» mientras el chat no se
       abriera a mano. La edición que la pone en rojo: ignorar el reintento (queda «nada» para siempre) o dejar que
       cualquier cosa lo abra después (sin reintento, sigue «nada»). */
    expect(con({ pospuesta: true, reintento: true }), "se pospuso por un gesto que terminó").toBe("abrir");
    expect(con({ pospuesta: true, reintento: false }), "sin reintento se abrió en un momento cualquiera").toBe("nada");
    // El reintento DECIDE de nuevo: si ahora hay otra cosa en el medio, se vuelve a posponer; si ya está abierto, se marca.
    expect(con({ pospuesta: true, reintento: true, escribiendo: true })).toBe("posponer");
    expect(con({ pospuesta: true, reintento: true, chatAbierto: true })).toBe("solo-marcar");
    // Y no pasa por encima de lo que manda el servidor ni de una propuesta que todavía no está lista.
    expect(con({ pospuesta: true, reintento: true, abiertoEnElServidor: true })).toBe("nada");
    expect(con({ pospuesta: true, reintento: true, recalculando: true })).toBe("nada");
  });

  it("⭐ revisión de los arreglos · qué pospone, y qué se vuelve a decidir cuando termina", () => {
    /* La edición que la pone en rojo: reintentar con la pantalla angosta (el cajón se abriría al agrandar la
       ventana, en un momento cualquiera) o no reintentar lo pasajero (quedaría solo el punto para siempre). */
    const tabla: Array<[Partial<EntradaDeLaApertura>, MotivoDePosposicion | null]> = [
      [{}, null],
      [{ punteroEnElGantt: true }, null],
      [{ conOtraCapa: true }, "capa"],
      [{ anchoSuficiente: false }, "angosta"],
      [{ escribiendo: true }, "escribiendo"],
      [{ gestoEnCurso: true }, "gesto"],
    ];
    for (const [c, motivo] of tabla) expect(motivoParaPosponer({ ...BASE, ...c }), JSON.stringify(c)).toBe(motivo);
    const reintenta: Record<MotivoDePosposicion, boolean> = { gesto: true, escribiendo: true, capa: true, angosta: false };
    for (const [m, esperado] of Object.entries(reintenta)) {
      expect(seVuelveADecidir(m as MotivoDePosposicion), m).toBe(esperado);
    }
  });

  it("⭐ revisión de los arreglos · el gesto en el Gantt: el botón apretado o actividad en los últimos 2 s", () => {
    /* La edición que la pone en rojo: tratar el gesto como terminado con el botón todavía apretado (un arrastre
       largo), o no esperar la ventana después de un clic o una tecla. */
    const T = 1_000_000;
    expect(VENTANA_DEL_GESTO_MS).toBe(2000);
    expect(gestoEnCurso({ apretado: false, ultimaActividad: null }, T), "sin actividad nunca").toBe(false);
    expect(gestoEnCurso({ apretado: true, ultimaActividad: T - 60_000 }, T), "un arrastre largo sigue en curso").toBe(true);
    expect(gestoEnCurso({ apretado: false, ultimaActividad: T - 1999 }, T)).toBe(true);
    expect(gestoEnCurso({ apretado: false, ultimaActividad: T - 2000 }, T)).toBe(false);
    expect(faltaParaQueTermineElGesto({ apretado: true, ultimaActividad: T }, T), "apretado: lo despierta el soltar").toBeNull();
    expect(faltaParaQueTermineElGesto({ apretado: false, ultimaActividad: null }, T)).toBe(0);
    expect(faltaParaQueTermineElGesto({ apretado: false, ultimaActividad: T - 500 }, T)).toBe(1500);
    expect(faltaParaQueTermineElGesto({ apretado: false, ultimaActividad: T - 5000 }, T)).toBe(0);
    // Cuando falta 0, ya no hay gesto: el reintento decide sin posponer por lo mismo.
    const g = { apretado: false, ultimaActividad: T - 2000 };
    expect(faltaParaQueTermineElGesto(g, T)).toBe(0);
    expect(gestoEnCurso(g, T)).toBe(false);
  });

  it("⛔ revisión antes del push · se pospuso por escribir: el reintento espera a que termine el clic que sacó el foco", () => {
    /* El `focusout` llega en el pointerdown del clic que saca el foco, ANTES del click. Reintentar ahí abría el cajón
       a mitad del clic: si el clic era en «💬 Asistente», su click lo volvía a cerrar (y la apertura ya constaba como
       hecha). La edición que la pone en rojo: reintentar con el foco afuera sin mirar el gesto del documento (el
       botón todavía apretado, o la ventana después de soltarlo), o no volver a esperar con otro pointerdown. */
    const T = 1_000_000;
    const tras = (pasos: Array<[EventoDeLaEspera, number]>) =>
      pasos.reduce((e, [evento, t]) => anotarEnLaEspera(e, evento, t), ESPERA_DE_UN_CAMPO);
    const clicQueSacaElFoco: Array<[EventoDeLaEspera, number]> = [
      ["apretar", T],
      ["foco-afuera", T],
    ];
    const filas: Array<[string, Array<[EventoDeLaEspera, number]>, number, number | null]> = [
      ["el campo sigue con el foco", [], T + 60_000, null],
      ["un clic que no le saca el foco al campo", [["apretar", T], ["soltar", T + 50]], T + 60_000, null],
      ["el foco salió con un clic y el botón sigue apretado (el pointerdown del 💬): esperar", clicQueSacaElFoco, T + 60_000, null],
      ["se soltó: faltan los 2 s", [...clicQueSacaElFoco, ["soltar", T + 100]], T + 100, VENTANA_DEL_GESTO_MS],
      ["se soltó hace 1,9 s: todavía no", [...clicQueSacaElFoco, ["soltar", T + 100]], T + 2000, 100],
      ["se soltó hace 2 s: se vuelve a decidir", [...clicQueSacaElFoco, ["soltar", T + 100]], T + 2100, 0],
      ["otro pointerdown en la ventana: vuelve a esperar a que se suelte", [...clicQueSacaElFoco, ["soltar", T + 100], ["apretar", T + 1500]], T + 2100, null],
      ["y al soltarlo, 2 s desde ahí", [...clicQueSacaElFoco, ["soltar", T + 100], ["apretar", T + 1500], ["soltar", T + 1600]], T + 2100, 1500],
      ["el foco salió con el teclado: 2 s sin pointerdown", [["foco-afuera", T]], T + 1999, 1],
      ["el foco salió con el teclado y pasaron los 2 s", [["foco-afuera", T]], T + 2000, 0],
    ];
    for (const [nombre, pasos, ahora, falta] of filas) {
      expect(faltaParaReintentarPorElCampo(tras(pasos), ahora), nombre).toBe(falta);
    }
    // Cuando termina, el reintento decide como si la propuesta acabara de quedar lista: sin campo ni gesto, abre.
    expect(con({ pospuesta: true, reintento: true })).toBe("abrir");
  });

  it("⛔ revisión antes del push · «💬 Asistente» no cierra un cajón que se abrió solo en ese mismo clic", () => {
    /* La apertura automática podía llegar entre el pointerdown del 💬 y su click (el botón va por portal, fuera del
       Gantt): el click alternaba y lo cerraba. La edición que la pone en rojo: volver a alternar siempre, o dejarlo
       abierto también cuando se abrió solo ANTES del clic (el 💬 tiene que poder cerrarlo), o con el teclado. */
    const T = 1_000_000;
    const filas: Array<[string, Parameters<typeof abiertoTrasTocarElChat>[0], boolean]> = [
      ["cerrado: lo abre", { abierto: false, apretadoEn: T, abiertoSoloEn: null }, true],
      ["cerrado, con el teclado: lo abre", { abierto: false, apretadoEn: null, abiertoSoloEn: T - 5000 }, true],
      ["abierto a mano: lo cierra", { abierto: true, apretadoEn: T, abiertoSoloEn: null }, false],
      ["se abrió solo ANTES del clic: lo cierra", { abierto: true, apretadoEn: T, abiertoSoloEn: T - 1 }, false],
      ["se abrió solo en medio de ESTE clic: queda abierto", { abierto: true, apretadoEn: T, abiertoSoloEn: T + 3 }, true],
      ["en el mismo milisegundo del pointerdown: queda abierto", { abierto: true, apretadoEn: T, abiertoSoloEn: T }, true],
      ["con el teclado (sin pointerdown): lo cierra", { abierto: true, apretadoEn: null, abiertoSoloEn: T }, false],
    ];
    for (const [nombre, e, abierto] of filas) expect(abiertoTrasTocarElChat(e), nombre).toBe(abierto);
  });

  it("⛔ revisión de E3 (#17, #12) · ni con «Regenerar» de una sola fase ni sobre una propuesta que el chat no puede editar", () => {
    /* Las ediciones que la ponen en rojo: abrirlo con cada fase regenerada (cada una trae un token nuevo), o
       sobre una propuesta que trae cambios que esta versión no sabe leer (el chat ofrecía «Aplica la propuesta»
       y todo terminaba en «no registré cambios»). */
    expect(con({ soloFase: true })).toBe("nada");
    expect(con({ soloFase: true, chatAbierto: true }), "tampoco se marca").toBe("nada");
    expect(con({ editable: false })).toBe("nada");
    expect(con({ editable: false, chatAbierto: true })).toBe("nada");
  });
});

describe("⭐ revisión de E3 (#26) · lo que hace el cronograma con cada decisión", () => {
  it("abrir → sin tomar el foco y recordado; solo-marcar → no abre; posponer → punto, sin recordar", () => {
    /* Las ediciones que la ponen en rojo (mutaciones CV2, CV3 y CV4 de la revisión, antes en verde): abrirlo
       sin marcarlo automático (tomaría el foco mientras la persona escribe en el Gantt), abrirlo también al
       «solo-marcar», no recordarlo, o recordar una apertura que no pasó. */
    const tabla: Record<DecisionDeApertura, ReturnType<typeof accionesDeLaApertura>> = {
      abrir: { abrir: true, automatica: true, recordar: true, decidida: true, posponer: false },
      "solo-marcar": { abrir: false, automatica: false, recordar: true, decidida: true, posponer: false },
      posponer: { abrir: false, automatica: false, recordar: false, decidida: false, posponer: true },
      nada: { abrir: false, automatica: false, recordar: false, decidida: false, posponer: false },
    };
    for (const [d, esperado] of Object.entries(tabla)) {
      expect(accionesDeLaApertura(d as DecisionDeApertura), d).toEqual(esperado);
    }
  });

  it("escribiendo = un campo donde se escribe (no un botón ni una casilla)", () => {
    for (const el of [
      { tagName: "INPUT" },
      { tagName: "input", type: "text" },
      { tagName: "INPUT", type: "number" },
      { tagName: "INPUT", type: "date" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(esCampoDeEscritura(el), JSON.stringify(el)).toBe(true);
    }
    for (const el of [null, undefined, { tagName: "BUTTON" }, { tagName: "INPUT", type: "checkbox" }, { tagName: "INPUT", type: "radio" }, { tagName: "BODY" }]) {
      expect(esCampoDeEscritura(el), JSON.stringify(el)).toBe(false);
    }
  });

  /* ⚠ REESCRITA en L1 (2026-09-26), con esta razón: «la referencia del cajón (y sus ejemplos), solo con una
     propuesta que el chat puede editar» (revisión de E3, #12) era `referenciaDelChat`, que solo existía con una
     propuesta editable y callaba en todo lo demás. Pasó a ser un AVISO por estado (`estadoParaElChat` +
     `avisoDelChat`); la regla de E3 (#12) sigue: «Aplica la propuesta» solo con una propuesta editable. Sus
     filas, en el bloque de L1 de abajo. */
});

/* ── L1 · EL CHAT DICE QUÉ EDITA ─────────────────────────────────────────────────────────────────────────── */

const ENTRADA_DEL_CHAT: EntradaDelChat = {
  puedeEditar: true,
  hayBorrador: true,
  ilegible: false,
  conDesconocidos: false,
  vacioFallido: false,
  tareasArmando: false,
  recalculando: false,
  desde: "desde «Regenerar todo»",
  ejemplos: { numero: 11, faseConNuevas: "Sales Hub" },
};
const entradaDelChat = (c: Partial<EntradaDelChat>): EntradaDelChat => ({ ...ENTRADA_DEL_CHAT, ...c });
/** El `hoy` fijo de los tests (con zona): 26 sep en Costa Rica. */
const CUANDO = "2026-09-26T12:00:00-06:00";
/** Una entrada por variante: las 8. */
const VARIANTES: Record<EstadoParaElChat["que"], EntradaDelChat> = {
  editable: ENTRADA_DEL_CHAT,
  armando: entradaDelChat({ tareasArmando: true }),
  recalculando: entradaDelChat({ recalculando: true }),
  "solo-lectura": entradaDelChat({ puedeEditar: false }),
  "version-nueva": entradaDelChat({ conDesconocidos: true }),
  ilegible: entradaDelChat({ hayBorrador: false, ilegible: true }),
  "vacia-fallida": entradaDelChat({ vacioFallido: true }),
  "sin-propuesta": entradaDelChat({ hayBorrador: false }),
};
const avisoPara = (e: EntradaDelChat): AvisoDelChat => avisoDelChat(estadoParaElChat(e));
const VOSEO = /(?<!\p{L})(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)(?!\p{L})/iu;
/** Los nombres entre «» de los ejemplos (las fases que nombran). */
const fasesDe = (ejemplos: string[]) => ejemplos.flatMap((e) => [...e.matchAll(/«([^»]+)»/g)].map((m) => m[1]));

describe("⭐ L1 · qué dice el chat con lo que hay en pantalla", () => {
  it("⭐ la tabla de las 8 variantes: subtítulo, tono y ayuda del campo", () => {
    /* La edición que la pone en rojo: cambiar de qué habla una variante (el subtítulo), su tono (el warn es para
       lo que hay que resolver) o pedir cambios en el campo de una variante que no los acepta. */
    const tabla: Record<EstadoParaElChat["que"], [string, AvisoDelChat["tono"], string]> = {
      editable: ["Propuesta desde «Regenerar todo»", "info", "Pide un cambio a la propuesta…"],
      armando: ["Propuesta desde «Regenerar todo» · armándose", "info", "Pregunta sobre la propuesta…"],
      recalculando: ["Propuesta desde «Regenerar todo»", "info", "Pregunta sobre la propuesta…"],
      "solo-lectura": ["Propuesta desde «Regenerar todo»", "neutro", "Escribe tu pregunta…"],
      "version-nueva": ["Hay una propuesta sin resolver", "warn", "Pregunta sobre la propuesta…"],
      ilegible: ["Hay una propuesta sin resolver", "warn", "Escribe tu pregunta…"],
      "vacia-fallida": ["Hay una propuesta sin resolver", "warn", "Escribe tu pregunta…"],
      "sin-propuesta": ["Sobre el cronograma vigente", "neutro", "Escribe qué quieres cambiar del cronograma…"],
    };
    for (const [que, [subtitulo, tono, placeholder]] of Object.entries(tabla)) {
      const a = avisoPara(VARIANTES[que as EstadoParaElChat["que"]]);
      expect(a.variante, que).toBe(que);
      expect([a.subtitulo, a.tono, a.placeholder], que).toEqual([subtitulo, tono, placeholder]);
    }
  });

  it("⛔ «Aplica la propuesta» solo en editable; «cambia la propuesta» una sola vez; tuteo y ≤ 140 caracteres", () => {
    /* Las ediciones que la ponen en rojo: ofrecer ejemplos sin permiso o sobre una propuesta que el chat no
       resuelve (revisión de E3, #12: todo terminaba en «no registré cambios»), repetir la idea «cambia la
       propuesta» en el subtítulo, la divisoria o la bienvenida (Elías pidió menos texto), o escribir en voseo. */
    for (const [que, e] of Object.entries(VARIANTES)) {
      const estado = estadoParaElChat(e);
      const a = avisoDelChat(estado);
      const divisoria = divisoriaDelChat(estado, CUANDO)?.texto ?? "";
      const textos = [a.subtitulo, a.aviso, a.placeholder, a.bienvenida ?? "", divisoria, ...a.ejemplos];
      for (const t of textos) {
        expect(t, `${que}: ${t}`).not.toMatch(VOSEO);
        expect(t.length, `${que}: ${t}`).toBeLessThanOrEqual(140);
      }
      expect(textos.some((t) => t.includes(EJEMPLO_APLICAR_LA_PROPUESTA)), `${que} ofrece «Aplica la propuesta»`).toBe(que === "editable");
      const juntos = [a.subtitulo, divisoria, a.bienvenida ?? "", a.aviso].join(" | ");
      expect(juntos.split("cambia la propuesta").length - 1, `${que}: ${juntos}`).toBe(que === "editable" ? 1 : 0);
      // La bienvenida, solo editable.
      expect(a.bienvenida !== null, que).toBe(que === "editable");
    }
  });

  it("⛔ sin permiso de editar no se ofrece ningún pedido de cambio, con o sin propuesta", () => {
    /* La edición que la pone en rojo: darle ejemplos o bienvenida a quien no puede editar (la ruta le
       respondería 403 a cada cambio). */
    for (const e of [VARIANTES["solo-lectura"], entradaDelChat({ puedeEditar: false, hayBorrador: false })]) {
      const a = avisoPara(e);
      expect(a.variante).toBe("solo-lectura");
      expect(a.ejemplos, "ofrece ejemplos sin permiso").toEqual([]);
      expect(a.bienvenida).toBeNull();
      expect(a.aviso).toBe("Puedes preguntar. Cambiar el cronograma o la propuesta lo hace quien lo edita.");
    }
    expect(avisoPara(entradaDelChat({ puedeEditar: false, hayBorrador: false })).subtitulo).toBe("Sobre el cronograma vigente");
  });

  it("sin propuesta: cambia el cronograma vigente y el cliente no ve nada hasta subirlo; versión nueva: recargar", () => {
    /* Las ediciones que la ponen en rojo: decir que lo aplicado ya lo ve el cliente (aplicar no publica: se ve lo
       que se sube), ofrecer «Aplica la propuesta» sin propuesta, o mandar a un botón apagado con una propuesta de
       una versión más nueva (el verbo es el de `BLOQUEO_VERSION_NUEVA`: recargar). */
    const sin = avisoPara(VARIANTES["sin-propuesta"]);
    expect(sin.aviso).toContain("cambia el cronograma vigente");
    expect(sin.aviso).toContain(LINEA_DEL_CLIENTE);
    expect(sin.ejemplos).toEqual([...EJEMPLOS_SIN_PROPUESTA]);
    expect(sin.bienvenida).toBeNull();
    expect(BLOQUEO_VERSION_NUEVA).toContain("recarga la página");
    expect(avisoPara(VARIANTES["version-nueva"]).aviso).toContain("recarga la página");
    expect(avisoPara(VARIANTES["vacia-fallida"]).aviso).toContain("descártala");
    expect(avisoPara(VARIANTES.ilegible).aviso).toContain("descártala arriba del Gantt");
  });

  it("⛔ los ejemplos salen de la propuesta: ninguno nombra una fase que no esté en la entrada", () => {
    /* La edición que la pone en rojo: volver a un nombre fijo («Quita las tareas nuevas de Integraciones»), que no
       existe en casi ningún cronograma. */
    for (const fase of ["Sales Hub", "Integración Circle", "Reportería y Data"]) {
      const a = avisoPara(entradaDelChat({ ejemplos: { numero: 3, faseConNuevas: fase } }));
      expect(fasesDe(a.ejemplos), fase).toEqual([fase]);
      expect(a.ejemplos).toEqual(["Deja el 3 como estaba", `Quita las tareas nuevas de «${fase}»`, EJEMPLO_APLICAR_LA_PROPUESTA]);
    }
    // Sin fase con nuevas, ese ejemplo no va; sin número, «el 1».
    const sinNada = avisoPara(entradaDelChat({ ejemplos: null }));
    expect(sinNada.ejemplos).toEqual(["Deja el 1 como estaba", EJEMPLO_APLICAR_LA_PROPUESTA]);
    expect(fasesDe(sinNada.ejemplos)).toEqual([]);
    // Un nombre larguísimo se corta: el ejemplo entra igual.
    const larga = "Integración con el ERP de la casa matriz y sus sucursales regionales";
    const conLarga = avisoPara(entradaDelChat({ ejemplos: { numero: 2, faseConNuevas: larga } }));
    for (const t of conLarga.ejemplos) expect(t.length, t).toBeLessThanOrEqual(140);
    expect(larga.startsWith(fasesDe(conLarga.ejemplos)[0].replace(/…$/, ""))).toBe(true);
  });

  it("los ejemplos, del resumen de la barra: el primer número que no está ya así y la fase con más nuevas", () => {
    /* La edición que la pone en rojo: ofrecer «Deja el N como estaba» sobre lo que ya está así, o tomar la fase
       equivocada. */
    const resumen = {
      items: [
        { numero: 1, estado: "ya-esta" },
        { numero: 2, estado: "aplica" },
        { numero: 3, estado: "excluido" },
      ],
      grupos: [
        { nombre: "Fase A", nuevas: 2 },
        { nombre: "Fase B", nuevas: 5 },
        { nombre: "Fase C", nuevas: 5 },
      ],
    };
    expect(ejemplosDelResumen(resumen)).toEqual({ numero: 2, faseConNuevas: "Fase B" });
    expect(ejemplosDelResumen({ items: [], grupos: [{ nombre: "Fase A", nuevas: 0 }] })).toEqual({ numero: null, faseConNuevas: null });
    expect(ejemplosDelResumen(null)).toBeNull();
  });

  it("⛔ el orden: sin permiso gana a todo; ilegible a sin borrador; versión nueva a vacío y a armando", () => {
    /* La edición que la pone en rojo: mirar `tareasArmando` (o el vacío) antes que `conDesconocidos` (el chat
       diría «armándose» de una propuesta que solo se resuelve recargando), o mirar lo ilegible después de «sin
       borrador» (diría que no hay propuesta con una guardada). */
    const todo = { ilegible: true, conDesconocidos: true, vacioFallido: true, tareasArmando: true, recalculando: true };
    expect(estadoParaElChat(entradaDelChat({ puedeEditar: false, ...todo })).que).toBe("solo-lectura");
    expect(estadoParaElChat(entradaDelChat({ hayBorrador: false, ilegible: true })).que).toBe("ilegible");
    expect(estadoParaElChat(entradaDelChat({ conDesconocidos: true, vacioFallido: true })).que).toBe("version-nueva");
    expect(estadoParaElChat(entradaDelChat({ conDesconocidos: true, tareasArmando: true })).que).toBe("version-nueva");
    expect(estadoParaElChat(entradaDelChat({ vacioFallido: true, tareasArmando: true })).que).toBe("vacia-fallida");
    expect(estadoParaElChat(entradaDelChat({ tareasArmando: true, recalculando: true })).que).toBe("armando");
    expect(estadoParaElChat(ENTRADA_DEL_CHAT)).toEqual({ que: "editable", desde: "desde «Regenerar todo»", ejemplos: { numero: 11, faseConNuevas: "Sales Hub" } });
  });

  it("⛔ el aviso y el botón dicen lo mismo: solo en editable el acuerdo pasa a la propuesta", () => {
    /* Se arma, por variante, lo que el cronograma le pasa al botón (`LaPropuestaEnPantalla`, como en
       CronogramaCanvas.tsx: las tareas «armando» incluyen el recálculo). La edición que la pone en rojo: no sumar
       `vacioFallido` al motivo del botón (el cajón diría «descártala» y el botón seguiría ofreciendo un clic que
       el servidor rechaza con 409). */
    const pantalla = (e: EntradaDelChat): LaPropuestaEnPantalla => ({
      hayBorrador: e.hayBorrador,
      ilegible: e.ilegible,
      token: e.hayBorrador ? "run-4" : null,
      version: e.hayBorrador ? 3 : null,
      conDesconocidos: e.conDesconocidos,
      vacioFallido: e.vacioFallido,
      tareasArmando: e.tareasArmando || e.recalculando,
      bloqueada: false,
    });
    const pasar = { borrador: "run-4", operaciones: [{ op: "fase.duracion" }] };
    expect(motivoParaElAcuerdo(pasar, pantalla(VARIANTES.editable)), "editable").toBeNull();
    for (const que of ["armando", "recalculando", "version-nueva", "ilegible", "vacia-fallida"] as const) {
      expect(motivoParaElAcuerdo(pasar, pantalla(VARIANTES[que])), que).not.toBeNull();
    }
    expect(motivoParaElAcuerdo(pasar, pantalla(VARIANTES["vacia-fallida"]))).toBe(MOTIVOS_DEL_CHAT.vacioFallido);
    expect(motivoParaElAcuerdo(pasar, pantalla(VARIANTES["version-nueva"]))).toBe(MOTIVOS_DEL_CHAT.enSuBarra);
    expect(motivoParaElAcuerdo(pasar, pantalla(VARIANTES.ilegible))).toBe(MOTIVOS_DEL_CHAT.ilegible);
  });

  it("⛔ dónde empieza la propuesta en la conversación (y un turno del mismo segundo ya es de ella)", () => {
    /* La edición que la pone en rojo: comparar con `>` (el turno del mismo segundo quedaría arriba de la
       divisoria), tratar al optimista (sin fecha) como viejo, o poner una divisoria sin saber cuándo empezó. */
    const antes = { createdAt: "2026-09-26T17:59:59.000Z" };
    const despues = { createdAt: "2026-09-26T18:05:00.000Z" };
    expect(dondeEmpiezaLaPropuesta([antes, despues], null), "sin cuándo").toBeNull();
    expect(dondeEmpiezaLaPropuesta([antes], "no es una fecha")).toBeNull();
    expect(dondeEmpiezaLaPropuesta([], CUANDO), "sin turnos").toBe(0);
    expect(dondeEmpiezaLaPropuesta([antes, antes], CUANDO), "todos anteriores: al final").toBe(2);
    expect(dondeEmpiezaLaPropuesta([antes, despues, despues], CUANDO)).toBe(1);
    expect(dondeEmpiezaLaPropuesta([antes, {}], CUANDO), "el optimista, sin fecha, es nuevo").toBe(1);
    expect(dondeEmpiezaLaPropuesta([antes, { createdAt: "2026-09-26T18:00:00.000Z" }], CUANDO), "iguales").toBe(1);
    expect(
      dondeEmpiezaLaPropuesta([antes, { createdAt: "2026-09-26T18:00:00.200Z" }], "2026-09-26T18:00:00.900Z"),
      "iguales al segundo",
    ).toBe(1);
    // Llega otra propuesta con el cajón abierto: la divisoria se mueve sola.
    expect(dondeEmpiezaLaPropuesta([antes, despues], "2026-09-26T18:10:00.000Z")).toBe(2);
  });

  it("la divisoria: con una propuesta que se lee y sabiendo cuándo empezó", () => {
    /* La edición que la pone en rojo: pintarla sin propuesta o con una que no se lee (no hay «desde»), o sin fecha. */
    expect(textoDeLaDivisoria("desde «Regenerar todo»", CUANDO)).toBe("Propuesta desde «Regenerar todo» · 26 sep");
    const con: Array<EstadoParaElChat["que"]> = ["editable", "armando", "recalculando", "solo-lectura"];
    for (const [que, e] of Object.entries(VARIANTES)) {
      const d = divisoriaDelChat(estadoParaElChat(e), CUANDO);
      expect(d?.texto ?? null, que).toBe(con.includes(que as EstadoParaElChat["que"]) ? "Propuesta desde «Regenerar todo» · 26 sep" : null);
      expect(divisoriaDelChat(estadoParaElChat(e), null), `${que} sin fecha`).toBeNull();
    }
    expect(divisoriaDelChat(estadoParaElChat(entradaDelChat({ puedeEditar: false, hayBorrador: false })), CUANDO)).toBeNull();
    expect(divisoriaDelChat(estadoParaElChat(ENTRADA_DEL_CHAT), CUANDO)?.cuando).toBe(CUANDO);
  });
});

describe("lo que recuerda el navegador", () => {
  const almacen = (): AlmacenDeLaApertura & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it("una entrada por proyecto, con el token de la propuesta", () => {
    const a = almacen();
    expect(leerApertura("p1", "run-4", a)).toBe(false);
    recordarApertura("p1", "run-4", a);
    expect(a.m.get(claveDeLaApertura("p1"))).toBe("run-4");
    expect(leerApertura("p1", "run-4", a)).toBe(true);
    expect(leerApertura("p1", "run-5", a), "otra propuesta hereda la marca de la anterior").toBe(false);
  });

  it("⛔ sin almacén, o si el navegador no deja leer ni escribir, no tira", () => {
    const roto: AlmacenDeLaApertura = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(leerApertura("p1", "run-4", roto)).toBe(false);
    expect(() => recordarApertura("p1", "run-4", roto)).not.toThrow();
    expect(leerApertura("p1", "run-4", null)).toBe(false);
  });
});
