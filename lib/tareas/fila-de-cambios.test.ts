import { describe, expect, it } from "vitest";
import { conEstadoAlInstante, crearFilaDeCambios, haciaDelCirculo } from "./fila-de-cambios";
import type { AccionesDeTarea } from "./estados";

/** Un servidor de mentira con el control de versión del escritor único: 409 si la versión no es la de la base. */
function servidor(inicial = 4) {
  let version = inicial;
  let estado = "pendiente";
  const pedidos: number[] = [];
  return {
    get version() {
      return version;
    },
    get estado() {
      return estado;
    },
    pedidos,
    async cambiar(v: number, hacia: string, demora = 5): Promise<{ version: number }> {
      pedidos.push(v);
      await new Promise((r) => setTimeout(r, demora));
      if (v !== version) throw Object.assign(new Error("Otra persona cambió esta tarea. Recarga para ver lo último."), { status: 409 });
      estado = hacia;
      version++;
      return { version };
    },
  };
}

describe("marcar hecha y deshacer (T-162, 2026-10-19)", () => {
  it("ASÍ FALLABA: deshacer con la versión que tenía pintada la pantalla choca aunque nadie más la tocó", async () => {
    const s = servidor();
    const pintada = 4; // la lista se pone al día recién con la recarga entera
    await s.cambiar(pintada, "hecha");
    await expect(s.cambiar(pintada, "pendiente")).rejects.toThrow("Otra persona cambió");
  });

  it("deshacer sale con la versión que devolvió el primer cambio", async () => {
    const s = servidor();
    const fila = crearFilaDeCambios();
    const pintada = 4;
    const marcar = (hacia: string) =>
      fila.enFila("t", async () => {
        const r = await s.cambiar(fila.version("t", pintada), hacia);
        fila.anotar("t", r.version);
        return r;
      });
    await marcar("hecha");
    await marcar("pendiente");
    expect(s.pedidos).toEqual([4, 5]);
    expect(s.estado).toBe("pendiente");
    expect(s.version).toBe(6);
  });

  it("dos clics seguidos van en fila, nunca a la vez", async () => {
    const s = servidor();
    const fila = crearFilaDeCambios();
    let simultaneos = 0;
    let maximo = 0;
    const marcar = (hacia: string) =>
      fila.enFila("t", async () => {
        simultaneos++;
        maximo = Math.max(maximo, simultaneos);
        try {
          const r = await s.cambiar(fila.version("t", 4), hacia, 20);
          fila.anotar("t", r.version);
          return r;
        } finally {
          simultaneos--;
        }
      });
    expect(fila.pendientes()).toBe(0);
    const a = marcar("hecha");
    const b = marcar("pendiente");
    const c = marcar("hecha");
    expect(fila.pendientes()).toBe(3);
    await Promise.all([a, b, c]);
    expect(maximo).toBe(1);
    expect(s.pedidos).toEqual([4, 5, 6]);
    expect(s.estado).toBe("hecha");
    expect(fila.pendientes()).toBe(0);
  });

  it("si un cambio falla, el siguiente corre igual", async () => {
    const fila = crearFilaDeCambios();
    const a = fila.enFila("t", async () => {
      throw new Error("no");
    });
    const b = fila.enFila("t", async () => "sí");
    await expect(a).rejects.toThrow("no");
    await expect(b).resolves.toBe("sí");
  });

  it("un cambio ajeno igual choca: la versión anotada no salta lo que pasó en la base después", async () => {
    const s = servidor();
    const fila = crearFilaDeCambios();
    const r = await s.cambiar(fila.version("t", 4), "hecha");
    fila.anotar("t", r.version); // 5
    await s.cambiar(5, "pendiente"); // otra persona: la base queda en 6
    await expect(s.cambiar(fila.version("t", 4), "hecha")).rejects.toThrow("Otra persona cambió");
  });

  it("la versión anotada nunca baja, y una carga más nueva gana", () => {
    const fila = crearFilaDeCambios();
    fila.anotar("t", 7);
    fila.anotar("t", 5);
    expect(fila.version("t", 3)).toBe(7);
    expect(fila.version("t", 9)).toBe(9);
    fila.olvidar("t");
    expect(fila.version("t", 3)).toBe(3);
  });
});

describe("la casilla cambia al instante", () => {
  const abierta: AccionesDeTarea = {
    decidir: false,
    retirar: false,
    editar: true,
    empezar: true,
    terminar: true,
    reabrir: false,
    noSeHara: true,
    moverDeSemana: true,
    reasignar: true,
    tomar: false,
    agendar: true,
    cambiarPrivada: true,
  };

  it("marcada hecha, se puede deshacer enseguida sin esperar la recarga", () => {
    const t = conEstadoAlInstante({ estado: "pendiente", acciones: abierta }, "hecha");
    expect(t.estado).toBe("hecha");
    expect(t.acciones.reabrir).toBe(true);
    expect(t.acciones.terminar).toBe(false);
    const otra = conEstadoAlInstante(t, haciaDelCirculo(t.estado));
    expect(otra.estado).toBe("pendiente");
    expect(otra.acciones.terminar).toBe(true);
  });

  it("quien no la podía terminar tampoco la puede reabrir", () => {
    const t = conEstadoAlInstante({ estado: "pendiente", acciones: { ...abierta, terminar: false, empezar: false } }, "hecha");
    expect(t.acciones.reabrir).toBe(false);
  });
});
