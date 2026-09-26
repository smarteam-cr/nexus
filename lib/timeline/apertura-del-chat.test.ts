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
  accionesDeLaApertura,
  claveDeLaApertura,
  debeAbrirseElChat,
  esCampoDeEscritura,
  faltaParaQueTermineElGesto,
  gestoEnCurso,
  leerApertura,
  motivoParaPosponer,
  recordarApertura,
  referenciaDelChat,
  seVuelveADecidir,
  VENTANA_DEL_GESTO_MS,
  type AlmacenDeLaApertura,
  type DecisionDeApertura,
  type EntradaDeLaApertura,
  type MotivoDePosposicion,
} from "./apertura-del-chat";

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

  it("⛔ revisión de E3 (#12) · la referencia del cajón (y sus ejemplos), solo con una propuesta que el chat puede editar", () => {
    /* La edición que la pone en rojo: ofrecer «Sobre la propuesta…» y «Aplica la propuesta» sobre una que solo
       se resuelve en su barra. */
    const base = { puedeEditar: true, hayBorrador: true, editable: true, conCambios: true, desde: "desde el handoff" };
    expect(referenciaDelChat(base)).toEqual({ titulo: "Sobre la propuesta desde el handoff" });
    for (const c of [{ editable: false }, { puedeEditar: false }, { hayBorrador: false }, { conCambios: false }]) {
      expect(referenciaDelChat({ ...base, ...c }), JSON.stringify(c)).toBeNull();
    }
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
