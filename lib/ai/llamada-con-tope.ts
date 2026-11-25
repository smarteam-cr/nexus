/**
 * lib/ai/llamada-con-tope.ts — una llamada larga a Claude que NO puede quedar colgada (24 nov, el Resumen de TEC · AE).
 * PURO de red: no conoce el SDK; recibe cómo abrir la llamada (un stream) y la vigila.
 *
 * Lo que pasó: «Armar el Resumen con IA» hizo UNA llamada sin streaming (`messages.create`, con el tope por defecto del SDK,
 * 10 minutos y dos reintentos) que no devolvió nada en 904 s. nginx corta a los 600 s y el navegador recibió un 504: la
 * pantalla pareció «cancelarse». Lo normal de esa llamada es de 125 a 205 s (13 corridas desde el 21 nov).
 *
 * Con streaming se sabe si la IA está trabajando: llega una señal por cada pedazo de la respuesta. La llamada se corta si
 * pasa `sinSenalMs` sin ninguna señal (colgada: falla en minutos, no en un cuarto de hora) o si en total pasa `totalMs`
 * (una respuesta que gotea para siempre). Cortada, o cortada a mitad de la respuesta por la IA (una sobrecarga en medio
 * del stream, la conexión que se cae), se intenta UNA vez más (`intentos`). Los errores HTTP con su código (529, 5xx, 429)
 * NO se repiten acá: los reintenta el SDK con su espera (`maxRetries`) antes de abrir el stream, y repetirlos dos veces
 * multiplicaba los pedidos (revisión del 24 nov). Lo que no se arregla solo (sin créditos, la key, un pedido mal armado)
 * tampoco. `alPrimeraSenal` avisa cuándo la IA empezó a escribir (la fase real de la corrida).
 */

/** Lo que se necesita de la llamada: el `MessageStream` del SDK lo cumple. */
export interface LlamadaVigilable<M> {
  on(evento: "streamEvent", cb: () => void): unknown;
  abort(): void;
  finalMessage(): Promise<M>;
}

export interface TopesDeLaLlamada {
  /** Sin ninguna señal de la IA por más de esto, la llamada está colgada. */
  sinSenalMs: number;
  /** Una llamada entera no dura más de esto, aunque siga llegando algo. */
  totalMs: number;
  /** Cuántas veces se intenta en total (2 = un reintento). */
  intentos: number;
}

/** La llamada se cortó porque la IA no respondía (sin señal) o tardaba demasiado en total. */
export class LlamadaSinRespuesta extends Error {
  readonly por: "sin-senal" | "total";
  readonly segundos: number;
  constructor(por: "sin-senal" | "total", segundos: number) {
    super(
      por === "sin-senal"
        ? `La IA no dio ninguna señal en ${segundos} s: la llamada se cortó (timeout).`
        : `La IA no terminó en ${segundos} s: la llamada se cortó (timeout).`,
    );
    this.name = "LlamadaSinRespuesta";
    this.por = por;
    this.segundos = segundos;
  }
}

/**
 * ¿Vale la pena intentar otra vez ACÁ? Lo colgado (nuestro corte) y lo que se cortó a mitad del stream, sí. Un error con su
 * código HTTP ya lo reintentó el SDK con su espera, y el de la conexión al abrir también: no se repite.
 */
export function esPasajero(e: unknown): boolean {
  if (e instanceof LlamadaSinRespuesta) return true;
  if (typeof (e as { status?: unknown } | null)?.status === "number") return false;
  // Sin código: un evento de error del stream (la sobrecarga o el error interno que documenta Anthropic) o la red cortada.
  const texto = e instanceof Error ? e.message : String(e ?? "");
  return /overloaded|api_error|internal server error|econnreset|etimedout|socket hang up|terminated|network/i.test(texto);
}

/** Una vez: abre la llamada y la vigila. Lo que llegue después de cortarla se ignora. */
function unIntento<M>(abrir: () => LlamadaVigilable<M>, topes: TopesDeLaLlamada, alPrimeraSenal?: () => void): Promise<M> {
  return new Promise<M>((resolve, reject) => {
    let listo = false;
    let senal = false;
    let llamada: LlamadaVigilable<M>;
    let sinSenal: ReturnType<typeof setTimeout> | undefined;
    // Se arma apenas se abre la llamada (abajo): `soltar` y `cortar` lo leen solo después.
    let total: ReturnType<typeof setTimeout> | undefined = undefined;
    const soltar = () => {
      if (sinSenal) clearTimeout(sinSenal);
      if (total) clearTimeout(total);
    };
    const cortar = (por: "sin-senal" | "total") => {
      if (listo) return;
      listo = true;
      soltar();
      try {
        llamada.abort();
      } catch {
        /* ya estaba cerrada */
      }
      reject(new LlamadaSinRespuesta(por, Math.round((por === "sin-senal" ? topes.sinSenalMs : topes.totalMs) / 1000)));
    };
    const vigilar = () => {
      if (sinSenal) clearTimeout(sinSenal);
      sinSenal = setTimeout(() => cortar("sin-senal"), topes.sinSenalMs);
    };
    try {
      llamada = abrir();
    } catch (e) {
      reject(e);
      return;
    }
    total = setTimeout(() => cortar("total"), topes.totalMs);
    vigilar();
    llamada.on("streamEvent", () => {
      if (listo) return;
      if (!senal) {
        senal = true;
        try {
          alPrimeraSenal?.();
        } catch {
          /* avisar la fase nunca rompe la llamada */
        }
      }
      vigilar();
    });
    llamada.finalMessage().then(
      (m) => {
        if (listo) return;
        listo = true;
        soltar();
        resolve(m);
      },
      (e: unknown) => {
        if (listo) return;
        listo = true;
        soltar();
        reject(e);
      },
    );
  });
}

/**
 * La llamada con sus topes y un reintento. `alReintentar`: se va a intentar otra vez (para decirlo en la fase). Lanza el
 * último error si ningún intento terminó.
 */
export async function llamarConTope<M>(
  abrir: () => LlamadaVigilable<M>,
  topes: TopesDeLaLlamada,
  o: { alPrimeraSenal?: () => void; alReintentar?: (e: unknown, intento: number) => void } = {},
): Promise<M> {
  let ultimo: unknown = null;
  const intentos = Math.max(1, topes.intentos);
  for (let i = 1; i <= intentos; i++) {
    try {
      return await unIntento(abrir, topes, o.alPrimeraSenal);
    } catch (e) {
      ultimo = e;
      if (i >= intentos || !esPasajero(e)) throw e;
      try {
        o.alReintentar?.(e, i + 1);
      } catch {
        /* avisar nunca rompe el reintento */
      }
    }
  }
  throw ultimo;
}
