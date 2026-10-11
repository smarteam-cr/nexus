/**
 * scripts/tareas-ensayo.ts — ensaya la lectura de Tareas internas sobre reuniones REALES, sin escribir y sin IA
 * (docs/tareas-plan.md §13, «Antes del código»).
 *
 * Imprime, por reunión: cuántas líneas trae «Próximos pasos», de quién es cada una (seguro · confirmar · ambiguo ·
 * equipo · nadie), a quién más nombra el detalle, qué cliente sugiere en una reunión interna, si haría falta la IA (y
 * por qué), qué líneas formarían un proyecto y el tope de tokens que tendría la llamada. No crea nada: la conexión nace
 * de solo lectura.
 *
 * Uso (desde una PC de desarrollo; contra producción solo lee):
 *   npx tsx scripts/tareas-ensayo.ts "Sprint planning de marketing"
 *   npx tsx scripts/tareas-ensayo.ts "Retro" --como aortega@smarteamcr.com --max 3
 *
 * Sin `--como`, lee como el primer Super Admin activo (ve todas las reuniones).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { describirDestino } from "./lib/guard";

/* ⛔ Ni por error: la conexión nace de solo lectura y con tope de tiempo (pg lee PGOPTIONS al abrir cada conexión). */
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=30000"].filter(Boolean).join(" ");

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const q = process.argv.slice(2).find((a, i, xs) => !a.startsWith("--") && !(i > 0 && xs[i - 1].startsWith("--")));
  if (!q) {
    console.log('Uso: npx tsx scripts/tareas-ensayo.ts "<parte del título>" [--como correo] [--max N]');
    process.exit(1);
  }
  const max = Number(arg("--max") ?? 5);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (solo lectura)\n`);

  const { contextoDeTareas } = await import("@/lib/tareas/servidor");
  const { clientesQueVesParaTareas } = await import("@/lib/tareas/clientes");
  const { getReunionesParaTareas } = await import("@/lib/sessions/reuniones-para-tareas");
  const { itemsDeActionItems, itemsDeProximosPasos } = await import("@/lib/tareas/proximos-pasos");
  const { prepararLineas, necesitaModelo } = await import("@/lib/tareas/lectura-armar");
  const { clientesDeLasLineas } = await import("@/lib/tareas/lectura");
  const { raicesCompartidas } = await import("@/lib/tareas/texto");
  const { maxTokensDeLaLectura } = await import("@/lib/tareas/ia/pedido");
  const { rolPorDefecto, semanaDeLaReunion, diaYHora } = await import("@/lib/tareas/semana");
  const { equipoDeLaMayoria } = await import("@/lib/tareas/equipos");
  const { LINEAS_PARA_UN_PROYECTO } = await import("@/lib/tareas/reglas");

  const como = arg("--como");
  const tm = como
    ? await prisma.teamMember.findUnique({ where: { email: como.toLowerCase() } })
    : await prisma.teamMember.findFirst({ where: { roleEnum: "SUPER_ADMIN", deactivatedAt: null }, orderBy: { createdAt: "asc" } });
  if (!tm) throw new Error(como ? `No hay nadie del equipo con el correo ${como}.` : "No hay un Super Admin activo.");
  const ctx = await contextoDeTareas({ teamMember: tm });
  const clientes = await clientesQueVesParaTareas(tm);
  const nombreDe = (id: string) => clientes.porId.get(id)?.nombre ?? id;

  const reuniones = await getReunionesParaTareas({ quien: { email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, q, tope: max });
  if (!reuniones.length) {
    console.log(`Ninguna reunión con «${q}» que ${tm.name} pueda leer.`);
    return;
  }

  for (const r of reuniones) {
    const lineas = r.actionItems.length ? itemsDeActionItems(r.actionItems) : itemsDeProximosPasos(r.notas ?? "");
    const rol = rolPorDefecto(r.inicio, r.titulo);
    const equipo = equipoDeLaMayoria(r.participantes, ctx.miembros) ?? ctx.equipo;
    console.log(`━━ ${r.titulo} · ${diaYHora(r.inicio)} · semana ${semanaDeLaReunion(r.inicio)}`);
    console.log(`   ${r.participantes.length} personas · ${r.puertasAdentro ? "puertas adentro" : r.duenoClienteNombre ? `de ${r.duenoClienteNombre}` : "sin dueño (se lee como interna)"} · rol por defecto: ${rol} · equipo: ${equipo}`);
    console.log(`   notas: ${r.notas ? `${r.notas.length} caracteres` : "sin notas"} · action items: ${r.actionItems.length} · líneas: ${lineas.length}`);
    if (!lineas.length) {
      console.log("   (no hay «Próximos pasos»: no hay qué leer)\n");
      continue;
    }
    const clienteDeLaReunion = r.duenoClienteId && !r.puertasAdentro ? r.duenoClienteId : null;
    const porLinea = clienteDeLaReunion ? new Map() : await clientesDeLasLineas(lineas, clientes);
    const prep = prepararLineas(lineas, {
      lectura: { id: "ensayo", equipo, semana: semanaDeLaReunion(r.inicio), pedidaPorEmail: ctx.email, inicio: r.inicio },
      miembros: ctx.miembros,
      participantes: r.participantes,
      clienteDeLaReunion,
      clientesPorLinea: porLinea,
      candidatasPorDueno: new Map(),
      lapidas: [],
    });
    for (const p of prep) {
      const quien =
        p.persona.tipo === "seguro"
          ? p.dueno
          : p.persona.tipo === "equipo"
            ? "el equipo → Por asignar"
            : p.persona.tipo === "ninguno"
              ? "nadie → Por asignar"
              : `${p.persona.tipo} (${p.linea.personas.join(", ")})`;
      console.log(`   ${p.ref} [${quien}] ${p.linea.titulo}${p.linea.detalle ? ` — ${p.linea.detalle.slice(0, 90)}${p.linea.detalle.length > 90 ? "…" : ""}` : ""}`);
      if (p.menciones.length) console.log(`        menciona: ${p.menciones.map((m) => `${m.nombreDicho}${m.pide ? " (pedido)" : ""}`).join(", ")}`);
      if (p.clienteSugerido) console.log(`        cliente sugerido: ${nombreDe(p.clienteSugerido)}`);
      else if (p.clientesCandidatos.length) console.log(`        clientes posibles: ${p.clientesCandidatos.map(nombreDe).join(", ")}`);
    }
    const m = necesitaModelo(prep, rol);
    const grupos = raicesCompartidas(prep.map((p) => `${p.linea.titulo} ${p.linea.detalle ?? ""}`), LINEAS_PARA_UN_PROYECTO);
    console.log(`   IA: ${m.necesita ? `sí — ${m.motivos.join("; ")}` : "no hace falta"} · tope de la llamada: ${maxTokensDeLaLectura(lineas.length, 0)} tokens de salida`);
    if (grupos.length) console.log(`   podría sugerir un proyecto por: ${grupos.slice(0, 5).join(", ")}`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
