/**
 * GET   /api/sales/exploraciones/[id]   → la exploración, como la pinta el lienzo
 * PATCH /api/sales/exploraciones/[id]   body: { version, operaciones: [...] }
 *
 * Las operaciones (lib/exploraciones/contenido.ts) cambian lo CONFIRMADO o usan y descartan lo que
 * propuso el agente. Se aplican todas o ninguna, con la fila bloqueada. Si otra persona cambió lo
 * confirmado entretanto, 409 con la exploración actual: la pantalla la recarga en vez de pisar.
 * Si cambia quién la lleva, a la persona nueva le llega un aviso y el «Para ti» de las dos se vuelve
 * a medir (la preventa sale de uno y entra al otro). Solo la lleva alguien del equipo con acceso a
 * Ventas: otro correo es un 400 (lib/exploraciones/responsable.ts).
 * Mirar pide `preventa.read` en una preventa y el acceso al proyecto en la exploración de un proyecto;
 * cambiar, `preventa.write` o la celda de generar la exploración (lib/exploraciones/guardia.ts). En un
 * proyecto, lo que se confirma de la estrategia va como sugerencia a Información del cliente; en la preventa, lo que
 * se confirma en las casillas que tienen campo en la ficha (lib/exploraciones/a-la-ficha.ts).
 */
import { anotarVersionDelCambio } from "@/lib/exploraciones/versiones-de-la-escala";
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { CambiosSchema } from "@/lib/exploraciones/esquemas";
import {
  aplicarCambios,
  escalaParaExplorar,
  estadoDesdeFila,
  leerExploracion,
  paraLaPantalla,
  SQL_DE_EXPLORACIONES,
} from "@/lib/exploraciones/servidor";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";
import { loNuevoDeLaEstrategia } from "@/lib/exploraciones/avance-del-proyecto";
import { proponerALaFichaSinIA, proponerFichaDesdeLoAveriguado } from "@/lib/clients/ficha-propuesta";
import { loNuevoParaLaFicha, ORIGEN_DE_LA_PREVENTA, propuestaParaLaFicha } from "@/lib/exploraciones/a-la-ficha";
import { errorDelResponsable } from "@/lib/exploraciones/responsable";
import { avisar } from "@/lib/para-ti/avisos-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado === "sin-tablas") {
    return NextResponse.json({ error: `Falta aplicar ${SQL_DE_EXPLORACIONES} y reiniciar.` }, { status: 503 });
  }
  if (lectura.estado === "no-existe") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  return NextResponse.json({ exploracion: await paraLaPantallaCompleta(lectura.fila) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = CambiosSchema.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") {
    return NextResponse.json({ error: "La escala no está publicada en Nexus: sin ella no se puede validar el cambio." }, { status: 503 });
  }

  // ⛔ Una preventa solo la lleva alguien con acceso a Preventa (Elías, 2026-10-05): lo mismo que filtra la lista.
  const sinAcceso = await errorDelResponsable(cuerpo.data.operaciones as Operacion[]);
  if (sinAcceso) return NextResponse.json({ error: sinAcceso }, { status: 400 });

  // El evento del calendario de una sesión no lo fija la pantalla (contenido.ts › `operacionesDeLaPantalla`).
  const r = await aplicarCambios(id, cuerpo.data.version, cuerpo.data.operaciones as Operacion[], escala.general, { quienPide: guard.email });
  switch (r.estado) {
    case "no-existe":
      return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
    case "invalido":
      return NextResponse.json({ error: r.error }, { status: 400 });
    case "conflicto":
      return NextResponse.json(
        { error: "La preventa cambió mientras la editabas (otra persona, o el agente al preparar). Se cargó lo último.", exploracion: paraLaPantalla(r.fila) },
        { status: 409 },
      );
    case "ok": {
      // Ficha B (2026-10-17): un nivel confirmado deja la versión del día de la escala de la empresa (nunca frena).
      if (r.confirmado) anotarVersionDelCambio(id, guard.email);
      /* Lo que se confirma va como sugerencia a Información del cliente: ahí lo leen los agentes, y al confirmarla se
         escribe en la empresa de HubSpot.
         · En la exploración de un PROYECTO (desde el 2026-10-07), la estrategia (retos, resultados que persigue y
           obstáculos), por la misma puerta que «lo que averiguaste» (con IA).
         · En la PREVENTA (desde el 2026-10-10, memoria de la cuenta, etapa 3), las casillas que tienen campo en la ficha
           (la radiografía, su CRM, los retos y las metas, las consecuencias, quién decide, la apertura y el porqué ahora),
           sin IA y con origen «Preventa» (lib/exploraciones/a-la-ficha.ts). */
      if (r.fila.projectId) {
        const nuevo = loNuevoDeLaEstrategia(r.antes, estadoDesdeFila(r.fila));
        if (nuevo.length) {
          void proponerFichaDesdeLoAveriguado({
            clientId: r.fila.clientId,
            projectId: r.fila.projectId,
            sesiones: [{ titulo: "La estrategia del cliente", preguntas: nuevo }],
            triggeredByEmail: guard.email,
          }).catch((e) => console.error("[exploraciones] no se pudo llevar la estrategia a la ficha", e));
        }
      } else {
        const aportes = loNuevoParaLaFicha(r.antes, estadoDesdeFila(r.fila));
        if (aportes.length) {
          void proponerALaFichaSinIA({ clientId: r.fila.clientId, origen: ORIGEN_DE_LA_PREVENTA, armar: (f) => propuestaParaLaFicha(f, aportes) })
            .then((x) => {
              if (x.status === "error") console.error(`[exploraciones] lo confirmado no llegó a la ficha: ${x.error}`);
            })
            .catch((e) => console.error("[exploraciones] lo confirmado no llegó a la ficha", e));
        }
      }
      const antes = r.responsableAntes?.toLowerCase() ?? null;
      const ahora = r.fila.responsableEmail?.toLowerCase() ?? null;
      if (antes !== ahora) {
        if (antes) olvidarMedicion(antes);
        if (ahora) {
          olvidarMedicion(ahora);
          await avisar({
            para: ahora,
            tipo: "preventa.responsable",
            titulo: `Te asignaron la preventa de ${r.fila.client.name}`,
            detalle: "Sus pendientes ya están en tu «Para ti».",
            href: `/sales/exploraciones/${encodeURIComponent(id)}`,
            actorEmail: guard.email,
            dedupeKey: `preventa.responsable:${id}:${ahora}:${new Date().toISOString().slice(0, 10)}`,
          });
        }
      }
      return NextResponse.json({ exploracion: paraLaPantalla(r.fila) });
    }
  }
}
