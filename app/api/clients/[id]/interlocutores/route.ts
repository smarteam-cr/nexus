/**
 * /api/clients/[id]/interlocutores — «Unidades e interlocutores» de Información del cliente (2026-11-25).
 *
 *   GET → { fichas, personas, otrasFichas }: las personas de la empresa de esta ficha (ella sola, o la principal con sus
 *         unidades que quien mira abre), una por correo, con en qué ficha está confirmada cada una
 *         (lib/clients/interlocutores.ts). Una ficha de otra empresa que quien mira no abre sale como «Otra ficha».
 *   PUT → { correo, nombre?, cargo?, rol?, confirmadaEn?, sugeridaEn?, otras?, simular? } (lib/clients/interlocutores-esquema.ts):
 *         lo que dice una persona del equipo. Con `simular`, no guarda: cuenta cuántas reuniones cambiarían de ficha, para
 *         el aviso antes de guardar. Sin él, guarda y re-resuelve las reuniones de esa persona (lo confirmado es lo que usa
 *         el resolver: categorize.ts, paso 3·0).
 *
 * Acceso (revisión del 25 nov): lo ve y lo edita quien abre la ficha. Las unidades de la empresa que no abre no se ven ni
 * se tocan; cada ficha de otra empresa que se suma o se quita pide acceso a esa ficha (`planDelCambio`). Y un cambio que
 * movería reuniones DE o HACIA una ficha que quien pide no abre, hoy o en las que vengan (`fichasQuePideAbrir`), se
 * rechaza entero, también el simulacro, sin nombrarla: es la regla de «Mover» una reunión
 * (lib/sessions/empresa-de-la-reunion-server.ts), por persona. Al guardar se mueve exactamente lo que mostró el aviso (la
 * huella, con de qué ficha sale y a cuál va cada reunión): si la cuenta da otra, antes de mover nada se vuelve atrás la
 * fila de la persona y se pide revisar el aviso. Las reglas del escritor (equipo,
 * categorías, la casa) frenan solo lo que se suma: quitar siempre se puede.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { accessibleClientWhere, clientesQueNoAbre } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { fichasQuePideAbrir, huellaDeMovidas, planDelCambio, resumirMovidas, type FichaDeLaEmpresa, type Interlocutor } from "@/lib/clients/interlocutores";
import { leerCambio } from "@/lib/clients/interlocutores-esquema";
import {
  fichasConfirmadasDe,
  fichasDeLaEmpresa,
  fotoDeLaPersona,
  guardarInterlocutor,
  interlocutoresDeLaEmpresa,
  motivoParaNoGuardar,
  RechazoDeInterlocutor,
  restaurarPersona,
} from "@/lib/clients/personas-de-la-empresa-server";
import { buildInternalDomainsSet, esLaCasaEn } from "@/lib/sessions/categorize";
import { fichasDelDominioDe, HubspotNoRespondio, reResolverReunionesDe, type ReunionQueCambia } from "@/lib/sessions/resolve-client";
import { esquemaDesactualizado } from "@/lib/db/esquema";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

const FALTA_EL_SQL = "Falta correr el SQL de los interlocutores (scripts/sql/2026-11-25-interlocutores-confirmados.sql).";
const MUEVE_AJENAS = "Este cambio movería reuniones de una ficha que no puedes abrir. Pídeselo a quien lleva esa cuenta.";

/** Las fichas (de esta lista) que quien pide NO abre. La de la página siempre la abre: ya pasó el guard. */
async function queNoAbre(teamMemberId: string | null, paginaId: string, ids: readonly string[]): Promise<Set<string>> {
  const otras = [...new Set(ids)].filter((x) => x !== paginaId);
  if (!otras.length) return new Set();
  if (!teamMemberId) return new Set(otras);
  return clientesQueNoAbre(teamMemberId, otras);
}

/** Lo que se devuelve de la empresa, sin las unidades que quien mira no abre ni el nombre de fichas ajenas. */
async function vistaDeLaEmpresa(id: string, teamMemberId: string | null): Promise<{ fichas: FichaDeLaEmpresa[]; personas: Interlocutor[] }> {
  const empresa = await fichasDeLaEmpresa(id);
  const noAbreDeLaEmpresa = await queNoAbre(teamMemberId, id, empresa.map((f) => f.id));
  const datos = await interlocutoresDeLaEmpresa(id, { abre: (f) => !noAbreDeLaEmpresa.has(f) });
  const deOtras = [...new Set(datos.personas.flatMap((p) => p.tambienEn.map((t) => t.id)))];
  const noAbre = await queNoAbre(teamMemberId, id, deOtras);
  return {
    fichas: datos.fichas,
    personas: datos.personas.map((p) => ({
      ...p,
      tambienEn: p.tambienEn.map((t) => (noAbre.has(t.id) ? { id: t.id, nombre: "Otra ficha", abre: false } : { ...t, abre: true })),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const teamMemberId = guard.user.teamMember?.id ?? null;
  try {
    const [datos, where, empresa] = await Promise.all([vistaDeLaEmpresa(id, teamMemberId), accessibleClientWhere(guard.user), fichasDeLaEmpresa(id)]);
    /* Para «también trabaja con…»: las fichas que quien mira puede abrir (la cartera), fuera de esta empresa y de la casa. */
    const otras = await prisma.client.findMany({
      where: { AND: [where ?? {}, { id: { notIn: empresa.map((f) => f.id) } }, { kind: { not: "INTERNO" } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 600,
    });
    return NextResponse.json(
      { ...datos, otrasFichas: otras.map((c) => ({ id: c.id, nombre: c.name })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const teamMemberId = guard.user.teamMember?.id ?? null;
  const leido = leerCambio(await req.json().catch(() => null));
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });
  const { pedido, simular } = leido;
  try {
    const empresa = (await fichasDeLaEmpresa(id)).map((f) => f.id);
    const nombradas = [...(pedido.confirmadaEn ?? []), ...(pedido.sugeridaEn ?? []), ...(pedido.otras?.sumar ?? []), ...(pedido.otras?.quitar ?? [])];
    const noAbre = await queNoAbre(teamMemberId, id, [...empresa, ...nombradas]);
    const antes = await fichasConfirmadasDe(pedido.correo);
    const plan = planDelCambio({ pedido, empresa, abre: (f) => !noAbre.has(f), antes });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

    /* Las reglas del escritor (equipo, categorías, la casa) frenan solo lo que se SUMA; quitar siempre se puede. */
    const suma = [...plan.despues.filter((f) => !antes.includes(f)), ...(pedido.sugeridaEn ?? [])];
    const motivo = suma.length ? await motivoParaNoGuardar({ correo: pedido.correo, fichas: suma }) : null;
    if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });

    /* Qué reuniones se mueven hoy, y a qué fichas tiene que tener acceso quien pide: las que pierden o ganan una reunión
       de hoy o de las que vengan (`fichasQuePideAbrir`). */
    const { cambian: movidas } = plan.cambiaLaConfirmacion
      ? await reResolverReunionesDe([pedido.correo], { hipotesis: new Map([[pedido.correo, plan.despues]]), aplicar: false, exigirHubspot: true })
      : { cambian: [] };
    const delDominio = plan.cambiaLaConfirmacion ? await fichasDelDominioDe(pedido.correo) : [];
    const acceso = await revisarAcceso(teamMemberId, id, { movidas, antes, despues: plan.despues, delDominio, cambia: plan.cambiaLaConfirmacion });
    if (!acceso.ok) return NextResponse.json({ error: MUEVE_AJENAS }, { status: 403 });
    const aviso = { reuniones: movidas.length, movidas: resumirMovidas(movidas, acceso.nombre), huella: huellaDeMovidas(movidas) };
    if (simular) return NextResponse.json(aviso);

    /* Se guarda solo si lo que se mueve es lo que la persona vio en el aviso; si no, la pantalla vuelve a pedir el aviso. */
    const REVISA = { error: "Cambió algo desde el aviso: revísalo de nuevo.", avisoNuevo: true };
    if (plan.cambiaLaConfirmacion && pedido.huella !== aviso.huella) return NextResponse.json(REVISA, { status: 409 });

    const foto = await fotoDeLaPersona(pedido.correo, plan.tocables);
    await guardarInterlocutor({ tocables: plan.tocables, cambio: plan.cambio, porEmail: guard.user.email });
    if (!plan.cambiaLaConfirmacion) {
      return NextResponse.json({ ...(await vistaDeLaEmpresa(id, teamMemberId)), reuniones: 0, movidas: [] });
    }
    /* Con la persona ya escrita y ANTES de mover nada, la cuenta tiene que dar lo mismo que el aviso. Si no (otra persona
       guardó algo en ese instante), se vuelve atrás solo su fila, sin reglas (es deshacer), y se pide revisar el aviso:
       mover y después devolver perdía los vínculos a proyectos, los hechos y el análisis de venta (revisión del 25 nov). */
    let ahora: ReunionQueCambia[];
    try {
      ahora = (await reResolverReunionesDe([pedido.correo], { aplicar: false, exigirHubspot: true })).cambian;
    } catch (e) {
      await restaurarPersona(foto, pedido.correo, plan.tocables);
      throw e;
    }
    if (huellaDeMovidas(ahora) !== aviso.huella) {
      await restaurarPersona(foto, pedido.correo, plan.tocables);
      return NextResponse.json(REVISA, { status: 409 });
    }
    const hechas = await reResolverReunionesDe([pedido.correo], {
      aplicar: true,
      aprobadas: new Map(ahora.map((m) => [m.sessionId, { de: m.de, a: m.a }])),
      exigirHubspot: true,
    });
    if (hechas.saltadas.length) {
      // Solo si algo cambió en los milisegundos entre la cuenta y la escritura: no se mueve, y la verificación lo marca (INV2).
      console.warn(`[interlocutores] ${hechas.saltadas.length} reunión(es) de ${pedido.correo} dieron distinto al escribir y no se movieron.`);
    }
    const nombres = await revisarAcceso(teamMemberId, id, { movidas: hechas.cambian, antes: [], despues: [], delDominio: [], cambia: false });
    return NextResponse.json({
      ...(await vistaDeLaEmpresa(id, teamMemberId)),
      reuniones: hechas.cambian.length,
      movidas: resumirMovidas(hechas.cambian, nombres.nombre),
      sinMover: hechas.saltadas.length,
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    if (e instanceof RechazoDeInterlocutor) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof HubspotNoRespondio) {
      return NextResponse.json({ error: "No se pudo comprobar en HubSpot a qué cuenta va ese correo. Prueba en un momento." }, { status: 503 });
    }
    throw e;
  }
}

/**
 * ¿Quien pide abre cada ficha que este cambio toca (`fichasQuePideAbrir`)? Y el nombre de cada una para el aviso (todas las
 * que salen en él las abre, o son la casa).
 */
async function revisarAcceso(
  teamMemberId: string | null,
  paginaId: string,
  o: { movidas: readonly ReunionQueCambia[]; antes: readonly string[]; despues: readonly string[]; delDominio: readonly string[]; cambia: boolean },
): Promise<{ ok: boolean; nombre: (id: string) => string }> {
  const ids = [...new Set([...o.movidas.flatMap((m) => [m.de, m.a]), ...o.antes, ...o.despues, ...o.delDominio].filter((x): x is string => !!x))];
  const [categorias, fichas] = await Promise.all([
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    ids.length ? prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: true, emailDomains: true } }) : [],
  ]);
  const casa = esLaCasaEn(buildInternalDomainsSet(categorias));
  const deLaCasa = new Set(fichas.filter(casa).map((c) => c.id));
  const pedir = fichasQuePideAbrir({
    movidas: o.movidas,
    cambiaLaConfirmacion: o.cambia,
    antes: o.antes,
    despues: o.despues,
    delDominio: o.delDominio,
    esLaCasa: (x) => deLaCasa.has(x),
  });
  const noAbre = await queNoAbre(teamMemberId, paginaId, ids.filter((x) => !deLaCasa.has(x)));
  const ok = !pedir.some((x) => noAbre.has(x));
  const porId = new Map(fichas.map((c) => [c.id, c.name]));
  /* Una ficha que quien pide no abre no se nombra, ni en la respuesta final. */
  return { ok, nombre: (x) => (noAbre.has(x) ? "otra ficha" : (porId.get(x) ?? "otra ficha")) };
}
