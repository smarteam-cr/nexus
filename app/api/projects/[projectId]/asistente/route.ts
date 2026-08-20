/**
 * /api/projects/[projectId]/asistente — LA CONVERSACIÓN SOBRE UN DOCUMENTO.
 *
 *   GET  ?pieza=timeline          → el hilo vivo de esta persona sobre esa pieza (o vacío)
 *   POST { pieza, mensaje }       → un turno: el CSE dice algo, el asistente contesta
 *   POST { pieza, empezarDeCero } → abre un hilo nuevo (el viejo queda como historia)
 *
 * ⛔ ESTA RUTA NO ESCRIBE EL DOCUMENTO, y es la decisión de fondo del chat. Cuando hay acuerdo,
 * el modelo emite una instrucción y esta ruta la devuelve — aplicarla es OTRO acto, por el
 * endpoint del editor de siempre (`/timeline/assist`, `/canvas-assist`), con su propia celda de
 * permiso, su vista previa y su aceptación por ítem. El permiso vive en el botón, no en la
 * conversación: un catálogo de herramientas que escriben sería el modo de falla de
 * `artifact-gate` multiplicado.
 *
 * RBAC: acceso al proyecto + la celda `asistente.read`. ⚠ NO alcanza con el acceso al proyecto:
 * conversar consume modelo, así que es una capacidad y no un permiso implícito de lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { abrirHilo, agregarTurno, empezarDeCero, hiloVivo, type HiloConTurnos } from "@/lib/asistente/hilo";
import { correrTurno, MODELO_DEL_ASISTENTE, leerAcuerdo } from "@/lib/asistente/turno";

type Params = Promise<{ projectId: string }>;

const piezaSchema = z.string().trim().min(1).max(60);

const bodySchema = z.union([
  z.object({ pieza: piezaSchema, mensaje: z.string().trim().min(1).max(4000) }),
  z.object({ pieza: piezaSchema, empezarDeCero: z.literal(true) }),
  /* El DESENLACE de un acuerdo: qué pasó cuando el CSE apretó «Aplicar». Ver el porqué en
     `anotarDesenlace`, abajo. */
  z.object({
    pieza: piezaSchema,
    desenlace: z.object({ ok: z.boolean(), detalle: z.string().max(2000) }),
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
      turnos: hilo.turnos.map((t) => {
        const { texto, acuerdo } = leerAcuerdo(t.contenido);
        return { id: t.id, rol: t.rol, texto, acuerdo, createdAt: t.createdAt };
      }),
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;

  const pieza = piezaSchema.safeParse(req.nextUrl.searchParams.get("pieza") ?? "");
  if (!pieza.success) return NextResponse.json({ error: "pieza requerida" }, { status: 400 });

  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const hilo = await hiloVivo({ projectId, pieza: pieza.data, usuarioEmail });
  return NextResponse.json(aVista(hilo));
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;

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
    projectId,
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
    const { ok, detalle } = parsed.data.desenlace;
    await agregarTurno(hilo.id, {
      rol: "ASISTENTE",
      /* ⚠ En TUTEO neutro: estos turnos son la VOZ DEL ASISTENTE, aunque los escriba la app.
         Mezclarlos con el voseo de la interfaz haría que el asistente cambie de registro solo.

         ⛔ Y el «se aplicó» a secas MENTÍA. El 2026-08-20: Elías pidió borrar una fase, el chat
         dijo ✅, y la fase seguía ahí — el editor la había RESCATADO porque tenía 2 tareas con
         progreso, que es lo que debe hacer. El desenlace sabía que la llamada anduvo, no que el
         cambio hubiera pasado. Ahora los avisos del editor van en el mismo turno. */
      contenido: ok
        ? detalle
          ? `⚠ Se aplicó, pero el editor hizo algo distinto con una parte:

${detalle}

Revisa la vista previa antes de aceptar.`
          : "✅ Se aplicó. Revisa la vista previa en el documento y acepta los cambios que quieras conservar."
        : `⛔ No se pudo aplicar: ${detalle || "el editor rechazó el cambio"}. La instrucción quedó arriba por si quieres ajustarla, o dime qué probamos.`,
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
