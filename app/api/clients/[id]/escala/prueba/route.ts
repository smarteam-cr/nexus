/**
 * N2 · Probar la escala con cualquier empresa (2026-10-26). Ver lib/escala/prueba/.
 *
 *   GET  ?con=publicada|borrador&exploracion=<id> → el nivel que da la escala en cada área para esta empresa, de qué
 *        exploración sale, con qué versión, quién puede decir dónde cree que está y lo ya probado.
 *   POST { con, exploracionId, areaId, nivelQueCree, creePorEmail, nota? } → guarda una comparación. El nivel de la
 *        escala lo recalcula el servidor. Wherex responde 422: nunca entra a la prueba.
 *
 * Cualquiera del equipo con acceso a la empresa (las mismas reglas de la ficha). El borrador, solo quien ya lo ve en
 * Escala › Borrador: para los demás se prueba con la publicada.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { LETRAS_DE_LA_PRUEBA, POR_QUE_SE_EXCLUYE } from "@/lib/escala/prueba/calculo";
import { CON_QUE_ESCALA, guardarPrueba, pruebaDeLaEmpresa, SQL_DE_LAS_PRUEBAS, type Persona } from "@/lib/escala/prueba/servidor";

type Params = Promise<{ id: string }>;

function quienSoy(acceso: Exclude<Awaited<ReturnType<typeof guardAccessToClient>>, NextResponse>): Persona {
  const tm = acceso.user.teamMember;
  const email = (tm?.email ?? acceso.user.email).toLowerCase();
  return { email, nombre: tm?.name ?? email };
}

/** El borrador de la escala solo lo ve quien ya lo ve en Escala › Borrador (los super admin). */
function veElBorrador(acceso: Exclude<Awaited<ReturnType<typeof guardAccessToClient>>, NextResponse>): boolean {
  return puedeEditarLaEscala(acceso.user.teamMember?.roleEnum);
}

const Con = z.enum(CON_QUE_ESCALA);

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const sp = req.nextUrl.searchParams;
  const con = Con.safeParse(sp.get("con") ?? "publicada");
  if (!con.success) return NextResponse.json({ error: "«con» es «publicada» o «borrador»." }, { status: 400 });
  try {
    const r = await pruebaDeLaEmpresa(id, { con: con.data, exploracionId: sp.get("exploracion"), yo: quienSoy(acceso), puedeVerElBorrador: veElBorrador(acceso) });
    if (r.estado === "no-existe") return NextResponse.json({ error: "Esa empresa no existe." }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[clients/escala/prueba]", e);
    return NextResponse.json({ error: "No se pudo cargar la prueba de la escala." }, { status: 500 });
  }
}

const Id = z.string().min(1).max(64);
const Cuerpo = z.object({
  con: Con,
  exploracionId: Id,
  areaId: z.string().min(1).max(16),
  nivelQueCree: z.enum(LETRAS_DE_LA_PRUEBA as [string, ...string[]]),
  creePorEmail: z.string().email().max(200),
  nota: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;
  try {
    const r = await guardarPrueba({
      clientId: id,
      exploracionId: c.exploracionId,
      con: c.con,
      areaId: c.areaId,
      nivelQueCree: c.nivelQueCree as (typeof LETRAS_DE_LA_PRUEBA)[number],
      creePorEmail: c.creePorEmail,
      yo: quienSoy(acceso),
      puedeVerElBorrador: veElBorrador(acceso),
      nota: c.nota ?? null,
    });
    switch (r.estado) {
      case "guardada":
        return NextResponse.json({ ok: true, fila: r.fila });
      case "excluida":
        return NextResponse.json({ error: POR_QUE_SE_EXCLUYE }, { status: 422 });
      case "no-existe":
        return NextResponse.json({ error: r.que }, { status: 404 });
      case "sin-nivel":
        return NextResponse.json(
          { error: `La escala todavía no da un nivel en esta área: faltan ${r.faltan === 1 ? "una dimensión" : `${r.faltan} dimensiones`} por estimar.` },
          { status: 409 },
        );
      case "quien-no":
        return NextResponse.json({ error: "Quien cree el nivel tiene que ser quien prueba o el CSE de la cuenta." }, { status: 400 });
      case "sin-tabla":
        return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LAS_PRUEBAS} y reiniciar.` }, { status: 503 });
    }
  } catch (e) {
    console.error("[clients/escala/prueba]", e);
    return NextResponse.json({ error: "No se pudo guardar la prueba." }, { status: 500 });
  }
}
