/**
 * lib/asistente/handler.ts — EL MANEJADOR DE LA CONVERSACIÓN, UNO SOLO PARA LOS TRES DUEÑOS.
 *
 * ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE UNA RUTA ────────────────────────────────────────────────
 * El chat nació sobre documentos de PROYECTO, con toda su lógica dentro de esa ruta. Al sumar la
 * propuesta comercial y los documentos de Roles había dos caminos: copiar la ruta dos veces, o
 * sacarle el cuerpo. Copiarla es el modo de falla que este repo ya pagó varias veces — tres
 * copias de la misma regla divergen, y la que se olvida no falla: contesta distinto.
 *
 * Lo único que cambia entre las tres rutas es QUIÉN es el dueño y QUÉ guard lo protege. Todo lo
 * demás —los tres verbos del POST, la derivación del estado de cada acuerdo, la limpieza de los
 * marcadores— es idéntico, y por eso vive una sola vez.
 *
 * ⛔ ESTO NO ESCRIBE EL DOCUMENTO. Cuando hay acuerdo, el modelo emite operaciones y esto las
 * devuelve — aplicarlas es OTRO acto, por el editor, con su propia celda de permiso y su lista
 * numerada con casillas. El permiso vive en el botón, no en la conversación.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import {
  abrirHilo,
  agregarTurno,
  empezarDeCero,
  hiloVivo,
  type Dueno,
  type HiloConTurnos,
} from "./hilo";
import { correrTurno, MODELO_DEL_ASISTENTE } from "./turno";
import { leerAcuerdo, marcaDeDesenlace, textoVisible } from "./acuerdo";
import { estadosDeAcuerdo } from "./acuerdo-vivo";

const piezaSchema = z.string().trim().min(1).max(60);

const bodySchema = z.union([
  z.object({ pieza: piezaSchema, mensaje: z.string().trim().min(1).max(4000) }),
  z.object({ pieza: piezaSchema, empezarDeCero: z.literal(true) }),
  /* El DESENLACE de un acuerdo: qué pasó cuando el CSE apretó «Aplicar». Ver el porqué en
     `anotarDesenlace`, abajo. */
  z.object({
    pieza: piezaSchema,
    desenlace: z.object({
      ok: z.boolean(),
      detalle: z.string().max(2000),
      /* ⚠ Qué carril aplicó. Por defecto `true` para no romper un cliente viejo: el carril lento
         —la instrucción en prosa que un segundo modelo relee— era el único que existía. */
      vistaPrevia: z.boolean().optional(),
    }),
  }),
]);

/** El hilo tal como lo pinta el panel: el acuerdo sale del texto, no de una columna aparte. */
function aVista(hilo: HiloConTurnos | null) {
  if (!hilo) return { hilo: null };
  return {
    hilo: {
      id: hilo.id,
      pieza: hilo.pieza,
      modelo: hilo.modelo,
      /**
       * ⭐ EL ESTADO DE CADA ACUERDO SE DERIVA ACÁ, con la misma función pura que decide qué
       * sigue pendiente. Así la pantalla no tiene que reimplementar la regla —y no puede
       * discrepar con el servidor sobre cuál acuerdo lleva el botón.
       */
      turnos: (() => {
        const estados = estadosDeAcuerdo(hilo.turnos);
        return hilo.turnos.map((t, i) => ({
          id: t.id,
          rol: t.rol,
          /* ⚠ Se limpian LOS DOS marcadores. Antes solo se sacaba el del acuerdo, así que el JSON
             del desenlace se pintaba crudo al pie del mensaje. No rompe nada y se ve pésimo. */
          texto: textoVisible(t.contenido),
          acuerdo: leerAcuerdo(t.contenido).acuerdo,
          estado: estados[i],
          createdAt: t.createdAt,
        }));
      })(),
    },
  };
}


/**
 * GET — el hilo vivo de esta persona sobre esa pieza, o vacío.
 *
 * ⚠ El guard lo hace la RUTA, antes de llamar acá: cada dueño tiene el suyo (acceso al proyecto,
 * acceso de ventas, admin de roles) y meterlos en un `switch` acá los volvería una lista que hay
 * que acordarse de mantener. Lo que este módulo garantiza es que, ya autorizado, los tres se
 * comporten igual.
 */
export async function manejarGetDelAsistente(req: NextRequest, dueno: Dueno) {
  const pieza = piezaSchema.safeParse(req.nextUrl.searchParams.get("pieza") ?? "");
  if (!pieza.success) return NextResponse.json({ error: "pieza requerida" }, { status: 400 });

  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const hilo = await hiloVivo({ dueno, pieza: pieza.data, usuarioEmail });
  return NextResponse.json(aVista(hilo));
}

/** POST — un turno, un hilo nuevo, o el desenlace de un acuerdo. Ver el `bodySchema`. */
export async function manejarPostDelAsistente(req: NextRequest, dueno: Dueno) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "pieza + mensaje (1 a 4000 caracteres), o pieza + empezarDeCero" },
      { status: 400 },
    );
  }

  /* ⚠ El correo sale de la SESIÓN, nunca del body: es la clave del hilo, así que aceptarlo del
     cliente dejaría leer y continuar la conversación de otra persona. */
  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const pedido = {
    dueno,
    pieza: parsed.data.pieza,
    usuarioEmail,
    modelo: MODELO_DEL_ASISTENTE,
  };

  if ("empezarDeCero" in parsed.data) {
    return NextResponse.json(aVista(await empezarDeCero(pedido)));
  }

  /* ── EL DESENLACE, Y ARREGLA UN BUG QUE ELÍAS VIO EN LA PRIMERA PRUEBA ─────────────────────
     Antes, un acuerdo quedaba en el hilo con su botón «Aplicar» para siempre: reabrir el panel
     mostraba el mismo CTA, indistinguible de «nunca se intentó». Peor cuando el apply había
     FALLADO — el CSE lo veía otra vez sin saber que ya había fallado una vez.

     Se escribe como UN TURNO MÁS del asistente, no como una columna de estado, por dos razones:
     el botón vive solo en el último turno (así que anotar el desenlace lo apaga solo), y el
     modelo LEE el hilo — o sea que en el próximo turno sabe que su instrucción no entró y puede
     proponer otra. Una columna de estado no le enseñaría nada. */
  if ("desenlace" in parsed.data) {
    const hilo = await hiloVivo(pedido);
    if (!hilo) return NextResponse.json({ hilo: null });
    const { ok, detalle, vistaPrevia = true } = parsed.data.desenlace;
    await agregarTurno(hilo.id, {
      rol: "ASISTENTE",
      /* ⚠ En TUTEO neutro: estos turnos son la VOZ DEL ASISTENTE, aunque los escriba la app.
         Mezclarlos con el voseo de la interfaz haría que el asistente cambie de registro solo.

         ⛔ Y el «se aplicó» a secas MENTÍA. El 2026-08-20: Elías pidió borrar una fase, el chat
         dijo ✅, y la fase seguía ahí — el editor la había RESCATADO porque tenía 2 tareas con
         progreso, que es lo que debe hacer. El desenlace sabía que la llamada anduvo, no que el
         cambio hubiera pasado. Ahora los avisos del editor van en el mismo turno. */
      /* ⭐ EL MARCADOR DEL DESENLACE, y lo único que dice es si el apply ANDUVO.
         Que un turno SEA un desenlace ya se sabe por `shaDeContexto === null` —ver
         `acuerdo-vivo.ts`—, que es retroactivo. Lo que la huella no puede decir es si entró: sin
         eso, un apply fallido vaciaría el libro de pendientes y la persona perdería lo que
         justamente NO se escribió. */
      contenido: marcaDeDesenlace({ ok }) + "\n\n" + (ok
        ? detalle
          ? `⚠ Se aplicó, pero el editor hizo algo distinto con una parte:

${detalle}

${vistaPrevia ? "Revisa la vista previa antes de aceptar." : "Ya quedó guardado en el cronograma: revísalo."}`
          : vistaPrevia
            ? "✅ Se aplicó. Revisa la vista previa en el documento y acepta los cambios que quieras conservar."
            : /* ⛔ EL CARRIL DE OPERACIONES NO DEJA VISTA PREVIA: escribe directo, en ~1 ms. Mandar
                 a la persona a «aceptar los cambios» la deja buscando un banner que no existe —y
                 peor, sugiere que lo que ya está guardado todavía se puede descartar. */
              "✅ Listo, el cronograma ya quedó actualizado. Si algo no está como esperabas, decímelo y lo ajustamos."
        : `⛔ No se pudo aplicar: ${detalle || "el editor rechazó el cambio"}. Los cambios siguen pendientes: puedes aplicarlos de nuevo, o dime qué ajustamos.`),
    });
    return NextResponse.json(aVista(await hiloVivo(pedido)));
  }

  const hilo = await abrirHilo(pedido);
  try {
    const { acuerdo } = await correrTurno(hilo, parsed.data.mensaje);
    /* Se relee el hilo entero en vez de devolver solo la respuesta: así el panel pinta lo que
       quedó GUARDADO, no lo que creemos que se guardó. Si el turno se persistió a medias, se ve. */
    const fresco = await hiloVivo(pedido);
    return NextResponse.json({ ...aVista(fresco), acuerdo });
  } catch (e) {
    /* El turno del CSE se pierde si el modelo falló — a propósito: guardar una pregunta que nadie
       contestó deja el hilo con un turno colgado que el próximo pedido reenvía como contexto. */
    const msg = e instanceof Error ? e.message : "el asistente no pudo contestar";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
