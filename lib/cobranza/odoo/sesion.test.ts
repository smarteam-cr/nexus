/**
 * lib/cobranza/odoo/sesion.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * ── EL INCIDENTE QUE ESTAS GUARDAS EXISTEN PARA QUE NO SE REPITA ────────────────
 * El 2026-09-02, media hora después de una corrida exitosa, Odoo empezó a rechazar el usuario
 * `direct`. La sonda midió **8 ms de sobrecosto sobre la red** en el rechazo: el ERP ni evaluó
 * la contraseña —eso cuesta cientos de milisegundos de PBKDF2— o sea que fue un cortocircuito,
 * compatible con su bloqueo por volumen de logins.
 *
 * Las dos causas estaban en nuestro código, y las dos se prueban acá.
 */
import { describe, it, expect, vi } from "vitest";
import { crearGuardiaDeSesion } from "./sesion";

/** Un reloj de mentira: el módulo lo recibe inyectado justo para poder hacer esto. */
function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzarMin: (m: number) => (t += m * 60_000) };
}

describe("una sola autenticación para muchas llamadas", () => {
  it("⭐ N llamadas concurrentes producen UN solo login, no N", () => {
    /* Ésta es la causa #1 del incidente. `uid ??= await autenticar()` NO serializa: dos
       lecturas en paralelo con el uid en null disparan dos autenticaciones simultáneas. La
       pantalla hacía dos lecturas en Promise.all, y React en desarrollo monta dos veces: una
       apertura costaba cuatro logins. */
    const r = reloj();
    let logins = 0;
    const g = crearGuardiaDeSesion({
      ahora: r.ahora,
      autenticar: async () => {
        logins++;
        return 33;
      },
    });
    return Promise.all([g.uid(), g.uid(), g.uid(), g.uid()]).then((uids) => {
      expect(uids).toEqual([33, 33, 33, 33]);
      expect(logins, "cada llamada concurrente autenticó por su cuenta").toBe(1);
    });
  });

  it("⭐ y las llamadas siguientes reusan la sesión sin volver a autenticar", async () => {
    /* Causa #2: cada operación autenticaba de cero. Abrir la pantalla, apretar un botón y
       correr el sync eran logins nuevos cada vez. */
    const r = reloj();
    let logins = 0;
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar: async () => (logins++, 33) });
    await g.uid();
    await g.uid();
    await g.uid();
    expect(logins).toBe(1);
  });

  it("vuelve a autenticar cuando la sesión caduca", async () => {
    const r = reloj();
    let logins = 0;
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar: async () => (logins++, 33), sesionMs: 10 * 60_000 });
    await g.uid();
    r.avanzarMin(11);
    await g.uid();
    expect(logins).toBe(2);
  });
});

describe("el freno tras un fallo", () => {
  const queFalla = () => Promise.reject(new Error("Odoo rechazó al usuario"));

  it("⛔ tras un fallo NO se vuelve a intentar enseguida", async () => {
    /* Ésta es la parte que convierte un corte de un minuto en uno de media hora: sin freno,
       cada recarga de la pantalla sumaba intentos y el contador del ERP nunca expiraba. */
    const r = reloj();
    let logins = 0;
    const g = crearGuardiaDeSesion({
      ahora: r.ahora,
      autenticar: () => {
        logins++;
        return queFalla();
      },
    });
    await expect(g.uid()).rejects.toThrow(/rechazó/);
    expect(logins).toBe(1);

    /* El segundo intento ni sale a la red: lo corta el freno. */
    await expect(g.uid()).rejects.toThrow(/esperando antes de reintentar/i);
    expect(logins, "el freno dejó pasar un intento que no debía salir").toBe(1);
  });

  it("el mensaje dice cuántos minutos faltan, no «error»", async () => {
    /* Quien mira la pantalla necesita saber si esperar o llamar a alguien. */
    const r = reloj();
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar: queFalla, esperasMin: [15] });
    await expect(g.uid()).rejects.toThrow();
    await expect(g.uid()).rejects.toThrow(/faltan 15 min/);
  });

  it("⚠ la espera CRECE con cada fallo seguido", async () => {
    /* Un backoff plano —reintentar cada minuto para siempre— mantiene vivo el contador de
       fallos del ERP. Tiene que subir hasta dejarlo enfriar de verdad. */
    const r = reloj();
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar: queFalla, esperasMin: [1, 5, 15] });

    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(60_000);

    r.avanzarMin(2);
    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(5 * 60_000);

    r.avanzarMin(6);
    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(15 * 60_000);
  });

  it("la espera se topa en el último escalón y no crece sin fin", async () => {
    const r = reloj();
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar: queFalla, esperasMin: [1, 5] });
    for (let i = 0; i < 5; i++) {
      await expect(g.uid()).rejects.toThrow();
      r.avanzarMin(10);
    }
    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(5 * 60_000);
  });

  it("⭐ un login exitoso borra el freno: el problema era transitorio", async () => {
    const r = reloj();
    const autenticar = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("bloqueado"))
      .mockResolvedValue(33);
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar, esperasMin: [1, 5] });

    await expect(g.uid()).rejects.toThrow();
    r.avanzarMin(2);
    expect(await g.uid()).toBe(33);

    /* Y el contador vuelve a cero: el próximo fallo espera 1 minuto, no 5. */
    r.avanzarMin(60);
    autenticar.mockRejectedValueOnce(new Error("otra vez"));
    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(60_000);
  });

  it("⛔ una ráfaga concurrente tras un fallo no dispara N logins", async () => {
    /* El peor caso real: el ERP nos bloquea, la persona recarga tres veces, y cada recarga
       manda otro intento que profundiza el bloqueo. */
    const r = reloj();
    let logins = 0;
    const g = crearGuardiaDeSesion({
      ahora: r.ahora,
      autenticar: () => {
        logins++;
        return queFalla();
      },
    });
    const resultados = await Promise.allSettled([g.uid(), g.uid(), g.uid(), g.uid(), g.uid()]);
    expect(resultados.every((x) => x.status === "rejected")).toBe(true);
    expect(logins, "la ráfaga concurrente mandó más de un login").toBe(1);
  });

  it("olvidar() destraba a mano, para cuando alguien arregla la contraseña", async () => {
    const r = reloj();
    const autenticar = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error("mala")).mockResolvedValue(33);
    const g = crearGuardiaDeSesion({ ahora: r.ahora, autenticar, esperasMin: [30] });
    await expect(g.uid()).rejects.toThrow();
    expect(g.esperaRestanteMs()).toBe(30 * 60_000);
    g.olvidar();
    expect(g.esperaRestanteMs()).toBe(0);
    expect(await g.uid()).toBe(33);
  });
});
