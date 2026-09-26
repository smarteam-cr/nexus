/**
 * lib/timeline/cola-de-casillas.test.ts — LA COLA DE LAS CASILLAS de la propuesta (E3 P3, 2026-09-25).
 *
 * Correr: `npx vitest run lib/timeline/cola-de-casillas.test.ts --project unit`.
 *
 * Desde E3 lo desmarcado se guarda en el servidor y lo ve cualquier computadora. Lo que se cuida acá:
 *   · la AGRUPACIÓN: los clics de 250 ms salen en UN POST, y por clave gana el último;
 *   · el ORDEN: un POST a la vez, en el orden de los clics (dos en paralelo se pisarían la versión);
 *   · la REVERSIÓN: si un POST no entra, lo que no subió vuelve a lo del servidor;
 *   · ⭐ lo que ves es lo que queda: lo pendiente superpuesto a lo del servidor da lo mismo que el
 *     servidor calcula con el lote;
 *   · la migración única: solo con `excluidos` AUSENTE, y la que no entró sale al esperar (revisión de E3).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { aplicarCasillas, superponerCasillas, type OperacionDeCasillas } from "./borrador";
import {
  casillasAMigrar,
  COLA_VACIA,
  confirmar,
  crearColaDeCasillas,
  despachar,
  encolar,
  ESPERA_DE_LA_COLA_MS,
  hayPendientes,
  juntarCasillas,
  MOTIVO_SIN_GUARDAR,
  pendientesDeLaCola,
  revertir,
  type ResultadoDeGuardarCasillas,
} from "./cola-de-casillas";

// ── Un reloj falso y un «servidor» que responde cuando el test quiere ─────────────────────────
function relojFalso() {
  let siguiente = 1;
  const pendientes = new Map<number, () => void>();
  return {
    poner: (fn: () => void) => {
      const id = siguiente++;
      pendientes.set(id, fn);
      return id;
    },
    quitar: (id: unknown) => void pendientes.delete(id as number),
    /** Dispara lo que esté programado (los 250 ms se cumplieron). */
    vencer: () => {
      const fns = [...pendientes.values()];
      pendientes.clear();
      for (const fn of fns) fn();
    },
    cuantos: () => pendientes.size,
  };
}

function servidorFalso() {
  const pedidos: Array<{ ops: OperacionDeCasillas[]; responder: (r: ResultadoDeGuardarCasillas) => void }> = [];
  return {
    pedidos,
    guardar: (ops: OperacionDeCasillas[]) =>
      new Promise<ResultadoDeGuardarCasillas>((responder) => {
        pedidos.push({ ops, responder });
      }),
  };
}

/** Que corran las promesas pendientes (la cadena encadena con `.then`). */
const dejarCorrer = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("las reglas de la cola (puras)", () => {
  it("un clic se encola; sin claves, la misma cola", () => {
    const c = encolar(COLA_VACIA, ["a"], false);
    expect(pendientesDeLaCola(c)).toEqual([{ op: "excluir", claves: ["a"] }]);
    expect(encolar(c, [], true), "un clic sin claves cambia la cola").toBe(c);
    expect(hayPendientes(COLA_VACIA)).toBe(false);
    expect(hayPendientes(c)).toBe(true);
  });

  it("⭐ juntar: por clave gana el ÚLTIMO clic, y quedan a lo sumo dos operaciones", () => {
    /* La edición que la pone en rojo: juntar por orden de llegada sin mirar el último clic (desmarcar y
       volver a marcar mandaría «excluir»), o mandar un POST por clic. */
    const lote = juntarCasillas([
      { op: "excluir", claves: ["a", "b"] },
      { op: "incluir", claves: ["a"] },
      { op: "excluir", claves: ["c"] },
      { op: "incluir", claves: ["b"] },
      { op: "excluir", claves: ["b"] },
    ]);
    expect(lote).toEqual([
      { op: "excluir", claves: ["c", "b"] },
      { op: "incluir", claves: ["a"] },
    ]);
    expect(juntarCasillas([]), "sin clics no sale nada").toEqual([]);
    // Más de 2000 claves (el techo de la ruta) van en varias operaciones, nunca recortadas.
    const muchas = Array.from({ length: 2500 }, (_, i) => `t:${i}`);
    const partido = juntarCasillas([{ op: "excluir", claves: muchas }]);
    expect(partido.map((o) => o.claves.length)).toEqual([2000, 500]);
  });

  it("despachar: lo encolado pasa a «en vuelo»; con uno en vuelo no sale otro (van encadenados)", () => {
    const c = encolar(encolar(COLA_VACIA, ["a"], false), ["b"], false);
    const salida = despachar(c)!;
    expect(salida.lote).toEqual([{ op: "excluir", claves: ["a", "b"] }]);
    expect(salida.cola.encoladas).toEqual([]);
    const otra = encolar(salida.cola, ["c"], true);
    expect(despachar(otra), "salió un segundo POST con otro en vuelo").toBeNull();
    expect(despachar(COLA_VACIA)).toBeNull();
    // Confirmado el primero, lo encolado después sigue esperando su turno.
    expect(confirmar(otra)).toEqual({ enVuelo: [], encoladas: [{ op: "incluir", claves: ["c"] }] });
  });

  it("⭐ revertir: el lote que no entró cae con lo que se clicó encima de él", () => {
    /* La edición que la pone en rojo: dejar lo encolado después de un POST que falló (se marcó sobre una
       lista que ya no es la del servidor), o no revertir nada (la pantalla mostraría lo que el servidor no
       tiene). */
    const enVuelo = despachar(encolar(COLA_VACIA, ["a"], false))!.cola;
    const conOtro = encolar(enVuelo, ["b"], false);
    expect(revertir(conOtro)).toEqual(COLA_VACIA);
    expect(revertir(COLA_VACIA)).toBe(COLA_VACIA);
  });

  it("⭐ lo que ves es lo que queda: superponer lo pendiente da lo mismo que el servidor con el lote", () => {
    /* La pantalla pinta `superponerCasillas(servidor, pendientes)`; el servidor guarda
       `aplicarCasillas(servidor, lote)`. Si no dieran lo mismo, la casilla saltaría al confirmar. La
       edición que la pone en rojo: juntar mal los clics (el primero gana, o se pierde una clave). */
    const claves = ["a", "b", "c", "d"];
    const borrador = { cambios: claves.map((clave) => ({ clave })) } as unknown as Parameters<typeof aplicarCasillas>[0];
    let semilla = 7;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let caso = 0; caso < 200; caso++) {
      const servidor = claves.filter(() => azar() < 0.4);
      const clics: OperacionDeCasillas[] = Array.from(
        { length: 1 + Math.floor(azar() * 6) },
        (): OperacionDeCasillas => ({ op: azar() < 0.5 ? "excluir" : "incluir", claves: claves.filter(() => azar() < 0.4) }),
      ).filter((o) => o.claves.length > 0);
      const seVe = [...superponerCasillas(servidor, clics)].sort();
      const queda = [...aplicarCasillas(borrador, servidor, juntarCasillas(clics))].sort();
      expect(queda, `caso ${caso}: ${JSON.stringify({ servidor, clics })}`).toEqual(seVe);
    }
  });

  it("⭐ la migración única: solo con `excluidos` AUSENTE (null); presente, aunque vacío, manda el servidor", () => {
    /* La edición que la pone en rojo: migrar también con `excluidos: []` (otra computadora ya marcó todo y
       lo recordado acá volvería a desmarcar), o no migrar nunca (lo desmarcado antes de E3 se perdería). */
    expect(casillasAMigrar(null, new Set(["a", "b"]))).toEqual({ op: "excluir", claves: ["a", "b"] });
    expect(casillasAMigrar([], new Set(["a"])), "con `excluidos` presente y vacío se migró igual").toBeNull();
    expect(casillasAMigrar(["x"], ["a"])).toBeNull();
    expect(casillasAMigrar(null, []), "sin nada recordado no hay nada que subir").toBeNull();
  });
});

describe("la cola en marcha: el reloj de 250 ms y la cadena", () => {
  const armar = (extra: Partial<Parameters<typeof crearColaDeCasillas>[0]> = {}) => {
    const reloj = relojFalso();
    const servidor = servidorFalso();
    const vistos: OperacionDeCasillas[][] = [];
    let confirmados = 0;
    const cola = crearColaDeCasillas({
      guardar: servidor.guardar,
      alCambiar: (p) => vistos.push(p),
      alConfirmar: () => void confirmados++,
      reloj,
      ...extra,
    });
    return { cola, reloj, servidor, vistos, confirmados: () => confirmados };
  };

  it("⭐ la agrupación: los clics se ven al instante y salen en UN POST cuando vencen los 250 ms", async () => {
    /* La edición que la pone en rojo: un POST por clic, o mandar sin esperar el reloj. */
    expect(ESPERA_DE_LA_COLA_MS).toBe(250);
    const { cola, reloj, servidor, vistos } = armar();
    cola.clic(["a"], false);
    cola.clic(["b", "c"], false);
    cola.clic(["a"], true);
    expect(vistos.at(-1), "el clic no se ve al instante").toEqual([
      { op: "excluir", claves: ["a"] },
      { op: "excluir", claves: ["b", "c"] },
      { op: "incluir", claves: ["a"] },
    ]);
    expect(reloj.cuantos(), "cada clic deja su propio reloj").toBe(1);
    await dejarCorrer();
    expect(servidor.pedidos, "salió antes de los 250 ms").toHaveLength(0);
    reloj.vencer();
    await dejarCorrer();
    expect(servidor.pedidos).toHaveLength(1);
    expect(servidor.pedidos[0].ops).toEqual([
      { op: "excluir", claves: ["b", "c"] },
      { op: "incluir", claves: ["a"] },
    ]);
  });

  it("⭐ el orden: un POST a la vez, en el orden de los clics", async () => {
    /* La edición que la pone en rojo: mandar el segundo lote sin esperar la respuesta del primero (dos
       escrituras sobre la misma versión: una vuelve a leer y los clics pueden llegar al revés). */
    const { cola, reloj, servidor, confirmados } = armar();
    cola.clic(["a"], false);
    reloj.vencer();
    await dejarCorrer();
    cola.clic(["b"], false);
    reloj.vencer();
    await dejarCorrer();
    expect(servidor.pedidos, "salió el segundo con el primero en vuelo").toHaveLength(1);
    expect(cola.pendientes(), "lo encolado detrás del primero se dejó de ver").toEqual([
      { op: "excluir", claves: ["a"] },
      { op: "excluir", claves: ["b"] },
    ]);
    servidor.pedidos[0].responder({ ok: true });
    await dejarCorrer();
    expect(servidor.pedidos).toHaveLength(2);
    expect(servidor.pedidos[1].ops).toEqual([{ op: "excluir", claves: ["b"] }]);
    expect(confirmados()).toBe(1);
    expect(cola.pendientes()).toEqual([{ op: "excluir", claves: ["b"] }]);
    servidor.pedidos[1].responder({ ok: true });
    await dejarCorrer();
    expect(cola.pendientes()).toEqual([]);
    expect(confirmados()).toBe(2);
  });

  it("⭐ la reversión: un POST que no entra vuelve a lo del servidor, y quien espera recibe el motivo", async () => {
    /* La edición que la pone en rojo: dejar lo pendiente después de una falla (la pantalla mostraría lo que
       el servidor no tiene y aplicar mandaría otro `sin`), o que `esperar` diga «todo guardado». */
    const { cola, reloj, servidor, vistos, confirmados } = armar();
    cola.clic(["a"], false);
    reloj.vencer();
    await dejarCorrer();
    cola.clic(["b"], false);
    const espera = cola.esperar();
    await dejarCorrer();
    servidor.pedidos[0].responder({ ok: false, motivo: "La propuesta cambió." });
    await dejarCorrer();
    // Se mira ANTES de soltar la espera: con la cola rota, lo que siguiera saliendo la dejaría colgada.
    expect(cola.pendientes(), "lo que no subió sigue pendiente").toEqual([]);
    expect(vistos.at(-1), "la pantalla sigue mostrando lo que no subió").toEqual([]);
    expect(servidor.pedidos, "lo clicado sobre el lote que falló salió igual").toHaveLength(1);
    expect(confirmados()).toBe(0);
    for (const p of servidor.pedidos.slice(1)) p.responder({ ok: true });
    expect(await espera).toEqual({ motivo: "La propuesta cambió.", mando: true });
    // Un guardar que tira cuenta como falla, con el motivo de siempre.
    const otra = armar({ guardar: () => Promise.reject(new Error("red")) });
    otra.cola.clic(["a"], false);
    expect(await otra.cola.esperar()).toEqual({ motivo: MOTIVO_SIN_GUARDAR, mando: true });
    expect(otra.cola.pendientes()).toEqual([]);
  });

  it("esperar: manda YA (sin esperar el reloj); sin nada pendiente no manda nada", async () => {
    /* La edición que la pone en rojo: que `esperar` espere los 250 ms (aplicar se demoraría), o que diga
       «mandó» sin haber mandado (la pantalla esperaría de más). */
    const { cola, reloj, servidor } = armar();
    expect(await cola.esperar()).toEqual({ motivo: null, mando: false });
    cola.clic(["a"], false);
    const espera = cola.esperar();
    await dejarCorrer();
    expect(servidor.pedidos, "esperar no mandó lo encolado").toHaveLength(1);
    expect(reloj.cuantos(), "el reloj sigue armado después de mandar").toBe(0);
    servidor.pedidos[0].responder({ ok: true });
    expect(await espera).toEqual({ motivo: null, mando: true });
    // Una falla de ANTES de esperar no corta a quien espera después (ya se revirtió y se dijo).
    cola.clic(["b"], false);
    reloj.vencer();
    await dejarCorrer();
    servidor.pedidos[1].responder({ ok: false, motivo: "no" });
    await dejarCorrer();
    expect(await cola.esperar()).toEqual({ motivo: null, mando: false });
  });

  it("la migración sube delante de cada lote mientras el servidor no guardó nada", async () => {
    /* La edición que la pone en rojo: no subir lo recordado (lo desmarcado antes de E3 se perdería al
       primer clic), o subirlo DETRÁS del lote (pisaría el último clic del CSE). */
    let migrar: OperacionDeCasillas | null = { op: "excluir", claves: ["viejo", "a"] };
    const { cola, reloj, servidor } = armar({ migracion: () => migrar });
    cola.clic(["a"], true);
    reloj.vencer();
    await dejarCorrer();
    expect(servidor.pedidos[0].ops, "lo recordado no sube, o pisa el clic").toEqual([
      { op: "excluir", claves: ["viejo"] },
      { op: "incluir", claves: ["a"] },
    ]);
    servidor.pedidos[0].responder({ ok: true });
    await dejarCorrer();
    migrar = null; // ya manda el servidor
    cola.clic(["b"], false);
    reloj.vencer();
    await dejarCorrer();
    expect(servidor.pedidos[1].ops).toEqual([{ op: "excluir", claves: ["b"] }]);
  });

  it("⛔ la migración que no entró sale al esperar (antes de aplicar), aunque no haya clics", async () => {
    /* Revisión de E3 (#5). Si el POST de la migración falló al montar, la barra muestra desmarcado lo que
       el servidor no tiene, y el chat (que lee lo del servidor) lo cuenta marcado: cada «aplícala» chocaba
       con PLAN_CAMBIO. La edición que la pone en rojo: que `esperar` mande solo lo encolado (sin clics, la
       migración no se reintentaba hasta el próximo clic o una recarga). */
    let migrar: OperacionDeCasillas | null = { op: "excluir", claves: ["viejo"] };
    const { cola, servidor } = armar({ migracion: () => migrar });
    const espera = cola.esperar();
    await dejarCorrer();
    expect(servidor.pedidos, "esperar no reintentó la migración").toHaveLength(1);
    expect(servidor.pedidos[0].ops).toEqual([{ op: "excluir", claves: ["viejo"] }]);
    servidor.pedidos[0].responder({ ok: true });
    expect(await espera).toEqual({ motivo: null, mando: true });
    // Ya manda el servidor: esperar no vuelve a mandar nada.
    migrar = null;
    expect(await cola.esperar()).toEqual({ motivo: null, mando: false });
    expect(servidor.pedidos).toHaveLength(1);
  });

  it("soltar (llegó otra propuesta): lo encolado no sale y lo que vuelve del POST en vuelo no toca nada", async () => {
    /* La edición que la pone en rojo: que un clic de la propuesta vieja caiga sobre la nueva (claves como
       `fase:X:durationWeeks` se repiten entre propuestas). */
    const { cola, reloj, servidor, vistos } = armar();
    cola.clic(["a"], false);
    reloj.vencer();
    await dejarCorrer();
    cola.clic(["b"], false);
    const antes = vistos.length;
    cola.soltar();
    expect(reloj.cuantos()).toBe(0);
    servidor.pedidos[0].responder({ ok: true });
    await dejarCorrer();
    expect(servidor.pedidos, "salió lo encolado de una propuesta soltada").toHaveLength(1);
    expect(vistos.length, "una propuesta soltada volvió a pintar").toBe(antes);
    cola.clic(["c"], false);
    expect(cola.pendientes()).toEqual([]);
  });
});
