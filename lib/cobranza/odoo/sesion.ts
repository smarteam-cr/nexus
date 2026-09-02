/**
 * lib/cobranza/odoo/sesion.ts
 *
 * Cuándo se puede autenticar contra Odoo, y cuándo hay que esperar. Módulo PURO: el reloj y la
 * función de autenticar entran como argumentos, así que se puede probar sin red.
 *
 * ── EL INCIDENTE QUE ESTE ARCHIVO EXISTE PARA QUE NO SE REPITA ──────────────────
 * El 2026-09-02 el sync corrió bien a las 07:17 UTC y media hora después Odoo empezó a
 * rechazar el usuario. La sonda midió **8 ms de sobrecosto sobre la red** en el rechazo — o
 * sea que el ERP **ni evaluó la contraseña**, que es lo que cuesta cientos de milisegundos de
 * PBKDF2. Fue un cortocircuito, compatible con su bloqueo por volumen de logins.
 *
 * Las dos causas estaban en nuestro código:
 *
 *  1. **Cada operación autenticaba de cero.** No había sesión compartida: abrir la pantalla,
 *     apretar un botón y correr el sync eran logins nuevos cada vez.
 *  2. **`uid ??= await autenticar()` no serializa.** Dos lecturas en paralelo con el uid en
 *     null disparan DOS autenticaciones simultáneas. Con el doble render de React en
 *     desarrollo, cuatro.
 *
 * ⛔ Y la parte que convierte un problema chico en uno largo: **reintentar es lo que
 * profundiza el bloqueo**. Sin freno, cada recarga de la pantalla sumaba intentos y el corte
 * no expiraba nunca.
 */

export interface GuardiaDeSesion {
  /** El uid, autenticando solo si hace falta. Tira si estamos en período de espera. */
  uid(): Promise<number>;
  /** Cuánto falta para poder reintentar, en ms. 0 = ya se puede. */
  esperaRestanteMs(): number;
  /** Borra la sesión y el freno. Para las pruebas y para cuando alguien arregla la contraseña. */
  olvidar(): void;
}

export interface OpcionesDeSesion {
  /** La autenticación de verdad. Devuelve el uid o tira. */
  autenticar: () => Promise<number>;
  /** El reloj, inyectado: sin esto el módulo no se puede probar contra un instante fijo. */
  ahora: () => number;
  /** Cuánto vale una sesión. El uid no caduca en Odoo —la contraseña viaja en cada llamada—,
   *  así que esto solo acota cuánto se arrastra un usuario que dejó de existir. */
  sesionMs?: number;
  /** La escalera de espera tras cada fallo seguido, en minutos. */
  esperasMin?: readonly number[];
  /** El mensaje que se le muestra a la persona mientras hay que esperar. */
  mensajeEspera?: (minutosRestantes: number) => string;
  /**
   * Cómo se construye el error del freno.
   *
   * ⚠ Existe porque el freno tiraba un `Error` pelado, y aguas arriba eso se clasificaba como
   * fallo de PROTOCOLO — no de AUTENTICACIÓN. El cron entonces retenía su turno del día, así
   * que **un bloqueo de un minuto le costaba la corrida entera**. El tipo del error decide si
   * se reintenta; no puede quedar librado a un `new Error`.
   */
  errorDeEspera?: (mensaje: string) => Error;
}

export const SESION_MS_DEFAULT = 30 * 60_000;

/**
 * Sube rápido a propósito. Un backoff tímido —reintentar cada 10 segundos— es peor que no
 * tener ninguno: mantiene vivo el contador de fallos del ERP y el corte no expira nunca.
 */
export const ESPERAS_MIN_DEFAULT = [1, 5, 15, 30] as const;

export function crearGuardiaDeSesion(opts: OpcionesDeSesion): GuardiaDeSesion {
  const sesionMs = opts.sesionMs ?? SESION_MS_DEFAULT;
  const esperas = opts.esperasMin ?? ESPERAS_MIN_DEFAULT;
  const mensaje =
    opts.mensajeEspera ??
    ((m: number) =>
      `Odoo rechazó el usuario y se está esperando antes de reintentar (faltan ${m} min). Reintentar ahora solo alarga el bloqueo.`);

  let uidVigente: number | null = null;
  let expiraEn = 0;
  let enVuelo: Promise<number> | null = null;
  let bloqueadoHasta = 0;
  let fallosSeguidos = 0;

  return {
    esperaRestanteMs: () => Math.max(0, bloqueadoHasta - opts.ahora()),

    olvidar() {
      uidVigente = null;
      expiraEn = 0;
      enVuelo = null;
      bloqueadoHasta = 0;
      fallosSeguidos = 0;
    },

    async uid() {
      const t = opts.ahora();

      /* ⛔ El freno va PRIMERO. Si fuera al final, una ráfaga concurrente ya habría mandado
         sus logins antes de llegar acá — que es exactamente el modo en que esto falló. */
      const falta = Math.max(0, bloqueadoHasta - t);
      if (falta > 0) {
        const texto = mensaje(Math.ceil(falta / 60_000));
        throw opts.errorDeEspera ? opts.errorDeEspera(texto) : new Error(texto);
      }

      if (uidVigente !== null && expiraEn > t) return uidVigente;

      /* Las llamadas concurrentes comparten ESTA promesa. Sin esto, N llamadas son N logins. */
      if (enVuelo) return enVuelo;

      enVuelo = opts
        .autenticar()
        .then((u) => {
          uidVigente = u;
          expiraEn = opts.ahora() + sesionMs;
          fallosSeguidos = 0;
          return u;
        })
        .catch((e: unknown) => {
          const min = esperas[Math.min(fallosSeguidos, esperas.length - 1)]!;
          fallosSeguidos++;
          bloqueadoHasta = opts.ahora() + min * 60_000;
          uidVigente = null;
          expiraEn = 0;
          throw e;
        })
        .finally(() => {
          enVuelo = null;
        });
      return enVuelo;
    },
  };
}
