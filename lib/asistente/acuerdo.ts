/**
 * lib/asistente/acuerdo.ts — LO QUE SE ACORDÓ Y CÓMO SE SABE SI ENTRÓ.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── POR QUÉ ESTÁ EN SU PROPIO ARCHIVO ────────────────────────────────────────────────────────
 * Vivía adentro de `turno.ts`, que además arma el prompt, declara la herramienta y llama al
 * modelo. Cuando el libro de pendientes (`acuerdo-vivo.ts`) necesitó LEER los marcadores para
 * caminar el hilo, `turno.ts` habría pasado a depender de él y él de `turno.ts`: un ciclo.
 * Separar la capa de marcadores lo corta y deja lo que de verdad es puro donde se puede probar.
 *
 * `turno.ts` re-exporta todo, así que sus consumidores no cambian.
 *
 * ── LOS DOS MARCADORES, Y POR QUÉ NO SON UNA TABLA ───────────────────────────────────────────
 * El acuerdo y su desenlace se guardan DENTRO del texto del turno, no en columnas. No es
 * minimalismo: el modelo LEE el hilo crudo, así que lo que vive en el texto le enseña algo y lo
 * que vive en una columna no. Y una segunda tabla puede quedar desincronizada del texto que la
 * explica; el marcador, por construcción, no.
 */

export interface CambioAcordado {
  resumen: string;
  /** El camino rápido: se ejecutan en milisegundos, sin volver a llamar a un modelo. */
  operaciones?: unknown[];
  /**
   * Las operaciones ya traducidas a castellano, calculadas EN EL SERVIDOR contra el cronograma
   * tal como estaba al acordar.
   *
   * ⭐ Es lo que vuelve hermética la cajita: lo que la persona LEE sale del mismo objeto que se
   * va a ejecutar, no de una prosa que el modelo escribe aparte y puede divergir.
   */
  lineas?: string[];
  /**
   * ⭐ CUÁLES DE ESTAS OPERACIONES VIENEN DE ANTES — los índices dentro de `operaciones`.
   *
   * El acuerdo acumula lo que se acordó y no se aplicó, así que una cajita puede mezclar lo que
   * la persona acaba de pedir con lo que pidió hace tres turnos. Sin esta marca el arrastre es
   * invisible: la persona lee tres cambios y cree que los tres salieron de su último mensaje.
   */
  arrastradas?: number[];
  /**
   * Lo que se descartó al componer, ya traducido. Un descarte tiene que ser tan legible como una
   * operación: si el modelo se equivoca al soltar algo, la persona tiene que poder verlo.
   */
  descartadas?: string[];
  /**
   * ⚠ LEGACY. Los hilos anteriores al 2026-08-20 guardaron una instrucción en castellano que un
   * segundo modelo releía. Se conserva para que esas conversaciones sigan pintándose — no para
   * emitirla de nuevo.
   */
  instruccion?: string;
}

export const MARCA_DE_ACUERDO = "<<<ACUERDO>>>";

export function marcaDeAcuerdo(a: CambioAcordado): string {
  return `${MARCA_DE_ACUERDO}${JSON.stringify(a)}`;
}

/** Separa el texto visible del acuerdo embebido. PURO — es lo que lee el panel al recargar. */
export function leerAcuerdo(contenido: string): { texto: string; acuerdo: CambioAcordado | null } {
  /**
   * ⛔ `lastIndexOf`, NO `indexOf`, y no es una preferencia de estilo.
   *
   * El modelo VE este marcador crudo en su propio historial (`correrTurno` manda `t.contenido`
   * tal cual), y el prompt nunca se lo explica — o sea que puede imitarlo dentro de su texto. Con
   * `indexOf` el corte caía en el falso, el `JSON.parse` de abajo tiraba, el `catch` devolvía
   * `acuerdo: null` y LA CAJITA AZUL DESAPARECÍA ENTERA: el mismo síntoma que Elías reportó como
   * «el asistente contesta pero no pasa nada».
   *
   * El productor siempre lo anexa ÚLTIMO, así que el último es el verdadero por construcción.
   */
  const i = contenido.lastIndexOf(MARCA_DE_ACUERDO);
  if (i === -1) return { texto: contenido, acuerdo: null };
  const texto = contenido.slice(0, i).trim();
  try {
    const crudo = JSON.parse(contenido.slice(i + MARCA_DE_ACUERDO.length)) as Partial<CambioAcordado>;
    /* ⛔ EL LECTOR TIENE QUE ACEPTAR LO QUE EL PRODUCTOR EMITE, Y ESTO SE ROMPIÓ UNA VEZ.
       Al pasar la herramienta a operaciones (2026-08-20) esta condición siguió exigiendo
       `instruccion`, que ya no existe: el acuerdo se GUARDABA bien y se leía como `null`, así que
       la cajita azul nunca aparecía. Elías lo vio como «el asistente contesta pero no pasa nada».

       ⚠ Y los tests no lo cazaron porque su fixture era del shape VIEJO: probaban que la ida y
       vuelta funcionaba para algo que el productor ya no emitía. Por eso ahora hay un test que
       arranca del shape REAL. */
    const ops = Array.isArray(crudo?.operaciones) ? crudo.operaciones : null;
    if (crudo?.resumen && (ops?.length || crudo?.instruccion)) {
      return {
        texto,
        acuerdo: {
          resumen: crudo.resumen,
          ...(ops?.length ? { operaciones: ops } : {}),
          /**
           * ⛔ LAS LÍNEAS SE DESCARTAN SI NO HAY UNA POR OPERACIÓN, y es la red de seguridad más
           * importante de todo el mecanismo.
           *
           * Toda la garantía es «lo que se LEE es lo que se EJECUTA». Si un día alguien calcula
           * las líneas sobre un conjunto distinto del que se va a ejecutar —por ejemplo sobre las
           * operaciones que emitió el modelo en vez de sobre las fusionadas— la cajita mostraría
           * MENOS de lo que escribe, y la persona aprobaría cambios que no leyó.
           *
           * Descartarlas hace que el panel caiga a su aviso de «no se pudo armar el detalle» y
           * DESHABILITE el botón: una superficie de falla que ya existe y ya es ruidosa. Callarse
           * y pintar una lista corta sería el peor final posible.
           */
          ...(crudo.lineas?.length && (!ops?.length || crudo.lineas.length === ops.length)
            ? { lineas: crudo.lineas }
            : {}),
          ...(crudo.arrastradas?.length ? { arrastradas: crudo.arrastradas } : {}),
          ...(crudo.descartadas?.length ? { descartadas: crudo.descartadas } : {}),
          ...(crudo.instruccion ? { instruccion: crudo.instruccion } : {}),
        },
      };
    }
  } catch {
    /* Un turno viejo o truncado: se muestra el texto y se pierde el botón, nunca la conversación. */
  }
  return { texto, acuerdo: null };
}

/* ── EL DESENLACE ──────────────────────────────────────────────────────────────────────────── */

/**
 * Qué pasó cuando la persona apretó «Aplicar». Se escribe como un turno más del asistente.
 *
 * ⚠ El JSON es MÍNIMO a propósito: `ok` es lo único que el libro de pendientes necesita saber, y
 * cada campo de más es una forma nueva de que el marcador y la prosa se contradigan.
 */
export interface Desenlace {
  ok: boolean;
}

export const MARCA_DE_DESENLACE = "<<<DESENLACE>>>";

export function marcaDeDesenlace(d: Desenlace): string {
  return `${MARCA_DE_DESENLACE}${JSON.stringify(d)}`;
}

/**
 * ⭐ EL MARCADOR NO ES EL DISCRIMINADOR — es el complemento.
 *
 * Que un turno SEA un desenlace se sabe por `shaDeContexto === null` (ver `acuerdo-vivo.ts`): ese
 * dato ya está escrito en cada fila de producción desde el día uno, porque `agregarTurno` es el
 * único escritor de mensajes y la rama del desenlace nunca pasa la huella. Es retroactivo.
 *
 * Este marcador agrega lo único que la huella no puede decir: si el apply ANDUVO. Un desenlace
 * viejo no lo trae, y se lee como `ok: true` — la lectura segura: vacía el libro de pendientes en
 * vez de resucitar operaciones ya aplicadas sobre un vocabulario que no es idempotente.
 *
 * ⛔ Lo que NO se hace: olfatear la prosa («✅ Se aplicó»). Ese texto es copy, ya cambió dos veces,
 * y el día que alguien lo mejore la detección se apagaría en silencio.
 */
export function leerDesenlace(contenido: string): { texto: string; desenlace: Desenlace | null } {
  const i = contenido.lastIndexOf(MARCA_DE_DESENLACE);
  if (i === -1) return { texto: contenido, desenlace: null };
  const texto = contenido.slice(0, i).trim();
  try {
    const crudo = JSON.parse(contenido.slice(i + MARCA_DE_DESENLACE.length)) as Partial<Desenlace>;
    if (typeof crudo?.ok === "boolean") return { texto, desenlace: { ok: crudo.ok } };
  } catch {
    /* Igual que arriba: se pierde el marcador, nunca el texto. */
  }
  return { texto, desenlace: null };
}

/**
 * El texto visible de un turno, sin ninguno de los dos marcadores.
 *
 * ⚠ Existe porque `aVista` pinta lo que le devuelvan: si el JSON del desenlace no se limpia, la
 * persona lee `<<<DESENLACE>>>{"ok":true}` al pie del mensaje. No rompe nada y se ve pésimo.
 */
export function textoVisible(contenido: string): string {
  return leerDesenlace(leerAcuerdo(contenido).texto).texto;
}
