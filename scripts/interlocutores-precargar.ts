/**
 * scripts/interlocutores-precargar.ts — precarga «Unidades e interlocutores» con el mapa de gente que dio una persona del
 * equipo (2026-11-25). Simulacro por defecto (solo lectura): quién queda en qué ficha, confirmada o por confirmar, y
 * cuántas reuniones cambiarían de dueña y adónde.
 *
 * Uso:
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json>
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --confirmar-sugeridas   # ¿y si las sugeridas se confirman?
 *   … --el-mapa-manda   # el mapa reemplaza lo que ya dijo una persona en esas fichas (por defecto se conserva)
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --sigla strato=SAS --dominio strato=stratospherecorp.com
 *       # ¿y si además la ficha tuviera esa sigla, o ese dominio (que se quita de la ficha que lo tenga)? Solo en memoria.
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --por <correo del equipo> --apply
 *
 * El formato del mapa: scripts/lib/interlocutores-precarga.ts (no vive en el repo: trae correos de personas del cliente).
 * Escribe SOLO por lib/clients/personas-de-la-empresa-server.ts › `guardarInterlocutor` (el único escritor) y después
 * re-resuelve las reuniones de esas personas (lib/sessions/resolve-client.ts › `reResolverReunionesDe`), que es lo que
 * mueve a las dueñas: lo que alguien asignó a mano no se mueve.
 *
 * ⚠ Después del SQL scripts/sql/2026-11-25-interlocutores-confirmados.sql y del deploy del código que lo lee (si no,
 * producción re-resuelve con el código viejo y deshace la mudanza: KNOWN-ERRORS, «el backfill no pega»). El `--apply`
 * aborta si /api/health no corre un código que conoce la columna (la base ya la tiene, pero eso no alcanza).
 * Respaldo: la tabla PersonaDeLaEmpresa (guard) y, en JSON, la dueña de antes y después de cada reunión que se mueve y sus
 * vínculos a proyectos completos. El --apply mueve exactamente lo del simulacro de esa misma corrida: lo que dé distinto
 * al escribir se salta y se lista.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { leerMapa } from "./lib/interlocutores-precarga";

/* El simulacro no puede escribir ni por error: la conexión es de solo lectura. */
if (!process.argv.includes("--apply")) process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

/** Un archivo que solo existe desde este cambio: si el commit que corre producción lo tiene, el código está desplegado. */
const ARCHIVO_DEL_CAMBIO = "lib/clients/interlocutores.ts";

/**
 * Contra producción, el `--apply` solo después del deploy: con el código viejo, producción re-resuelve sin la gente
 * confirmada y deshace la mudanza. Lo comprueba en /api/health (el commit que corre tiene que traer este cambio).
 */
async function assertCodigoDesplegado(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return;
  const base = process.env.NEXUS_URL ?? "https://nexus.smarteamcr.com";
  const sha = await fetch(`${base}/api/health`)
    .then((r) => r.json() as Promise<{ sha?: string }>)
    .then((j) => j.sha ?? "")
    .catch(() => "");
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`No se pudo leer qué commit corre en ${base}/api/health: sin eso no se escribe.`);
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}:${ARCHIVO_DEL_CAMBIO}`], { stdio: "ignore" });
  } catch {
    throw new Error(`Producción corre ${sha.slice(0, 8)}, que todavía no trae «Unidades e interlocutores»: despliega antes (o haz git fetch si ya está).`);
  }
  console.log(`  ✓ producción corre ${sha.slice(0, 8)}, con «Unidades e interlocutores»`);
}

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const fecha = (d: Date) => d.toISOString().slice(0, 10);

/** Los `--opcion clave=valor` repetidos. */
function valores(nombre: string): [string, string][] {
  const out: [string, string][] = [];
  process.argv.forEach((a, i) => {
    if (a !== nombre) return;
    const [k, ...v] = (process.argv[i + 1] ?? "").split("=");
    if (k && v.length) out.push([k, v.join("=")]);
  });
  return out;
}

async function main() {
  const ruta = arg("--mapa");
  if (!ruta) throw new Error("Falta --mapa <archivo.json>.");
  const mapa = leerMapa(ruta);
  const confirmarSugeridas = process.argv.includes("--confirmar-sugeridas");
  /* Por defecto se CONSERVA lo que ya dijo una persona en las fichas del mapa (una confirmación o una sugerencia que el mapa
     no trae). Con --el-mapa-manda, el mapa reemplaza eso, y el simulacro lista qué se pierde. */
  const elMapaManda = process.argv.includes("--el-mapa-manda");
  const escribir = resolverApply({ tablas: ["PersonaDeLaEmpresa"] });
  const por = arg("--por");
  if (escribir && (!por || !por.includes("@"))) throw new Error("Con --apply, --por <correo de quien dio el mapa> es obligatorio.");
  if (escribir && confirmarSugeridas) throw new Error("--confirmar-sugeridas es solo para el simulacro: las sugeridas se confirman en la pantalla.");

  const { prisma } = await import("@/lib/db/prisma");
  const { esquemaDesactualizado } = await import("@/lib/db/esquema");
  const { reResolverReunionesDe } = await import("@/lib/sessions/resolve-client");
  const { guardarInterlocutor, motivoParaNoGuardar } = await import("@/lib/clients/personas-de-la-empresa-server");

  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "simulacro, solo lectura"})`);
  console.log(`\n# ${mapa.titulo}\n`);

  try {
    /* ── 1. Las fichas ── */
    const ids = Object.values(mapa.fichas).map((f) => f.id);
    const fichas = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const [clave, f] of Object.entries(mapa.fichas)) {
      const real = fichas.find((x) => x.id === f.id);
      if (!real) throw new Error(`La ficha «${clave}» (${f.id}) no existe en esta base.`);
      if (real.name !== f.nombre) console.log(`⚠ La ficha «${clave}» se llama «${real.name}» (el mapa dice «${f.nombre}»).`);
    }
    const nombreDe = new Map<string, string>(fichas.map((f) => [f.id, f.name]));
    const idDe = (clave: string) => mapa.fichas[clave]!.id;

    /* ── 2. ¿La base ya tiene la columna? ── */
    let columnaLista = true;
    let confirmadasHoy: { correo: string; clientId: string; confirmadaPorEmail: string | null; confirmadaAt: Date | null }[] = [];
    let sugeridasHoy: { correo: string; clientId: string }[] = [];
    const correos = mapa.personas.map((p) => p.correo);
    try {
      confirmadasHoy = await prisma.personaDeLaEmpresa.findMany({
        where: { correo: { in: correos }, confirmadaAt: { not: null } },
        select: { correo: true, clientId: true, confirmadaPorEmail: true, confirmadaAt: true },
      });
      sugeridasHoy = await prisma.personaDeLaEmpresa.findMany({
        where: { correo: { in: correos }, confirmadaAt: null, origenes: { has: "equipo" } },
        select: { correo: true, clientId: true },
      });
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
      columnaLista = false;
      console.log("⚠ A esta base le falta scripts/sql/2026-11-25-interlocutores-confirmados.sql: el simulacro supone que nadie está confirmado.\n");
    }
    if (escribir && !columnaLista) throw new Error("Primero el SQL 2026-11-25-interlocutores-confirmados.sql.");

    /* ── 3. Quién queda dónde ── */
    const filas = await prisma.personaDeLaEmpresa.findMany({
      where: { correo: { in: correos } },
      select: { correo: true, clientId: true, nombre: true, reuniones: true },
    });
    const sesiones = await prisma.firefliesSession.findMany({
      where: { participants: { hasSome: correos } },
      select: { participants: true, resolvedClientId: true },
    });
    console.log("## Las personas\n");
    console.log("| Persona | Correo | Rol | Queda | Hoy la copia la tiene en | Sus reuniones hoy, por dueña |");
    console.log("|---|---|---|---|---|---|");
    for (const p of mapa.personas) {
      const conf = (p.confirmadaEn ?? []).map((k) => mapa.fichas[k]!.nombre);
      const sug = (p.sugeridaEn ?? []).map((k) => mapa.fichas[k]!.nombre);
      const queda = conf.length
        ? `CONFIRMADA en ${conf.join(" y ")}${conf.length > 1 ? " (del grupo)" : ""}`
        : `por confirmar (sugerida en ${sug.join(" y ")})${confirmarSugeridas ? " · el simulacro la cuenta confirmada" : ""}`;
      const copia = filas.filter((f) => f.correo === p.correo).map((f) => `${nombreDe.get(f.clientId) ?? "otra ficha"} (${f.reuniones})`);
      const porDuena = new Map<string, number>();
      for (const s of sesiones) {
        if (!s.participants.some((x) => x.trim().toLowerCase() === p.correo)) continue;
        const k = s.resolvedClientId ?? "";
        porDuena.set(k, (porDuena.get(k) ?? 0) + 1);
      }
      const otrasDuenas = [...porDuena.keys()].filter((k) => k && !nombreDe.has(k));
      if (otrasDuenas.length) {
        for (const c of await prisma.client.findMany({ where: { id: { in: otrasDuenas } }, select: { id: true, name: true } })) nombreDe.set(c.id, c.name);
      }
      const reuniones = [...porDuena].map(([k, n]) => `${k ? nombreDe.get(k) : "por decidir"} ${n}`).join(", ") || "ninguna";
      console.log(`| ${p.nombre || "—"} | ${p.correo} | ${p.rol ?? "sin rol"} | ${queda} | ${copia.join(", ") || "—"} | ${reuniones} |`);
      if (p.nota) console.log(`|  | ↳ ${p.nota} | | | | |`);
    }
    /* Lo que ya dijo una persona en las fichas del mapa y el mapa no trae: se conserva (o, con --el-mapa-manda, se pierde). */
    const queda = new Map<string, { confirmadaEn: string[]; sugeridaEn: string[] }>();
    const avisos: string[] = [];
    for (const p of mapa.personas) {
      const delMapa = (p.confirmadaEn ?? []).map(idDe);
      const sugeridasDelMapa = (p.sugeridaEn ?? []).map(idDe);
      const otrasConfirmadas = confirmadasHoy.filter((c) => c.correo === p.correo && ids.includes(c.clientId) && !delMapa.includes(c.clientId));
      const otrasSugeridas = sugeridasHoy.filter((c) => c.correo === p.correo && ids.includes(c.clientId) && !sugeridasDelMapa.includes(c.clientId));
      for (const c of otrasConfirmadas) {
        const quien = `${c.confirmadaPorEmail ?? "alguien"}${c.confirmadaAt ? ` el ${fecha(c.confirmadaAt)}` : ""}`;
        avisos.push(`${p.correo}: ${elMapaManda ? "PIERDE" : "conserva"} la confirmación en ${nombreDe.get(c.clientId)} (la puso ${quien})`);
      }
      for (const c of otrasSugeridas) avisos.push(`${p.correo}: ${elMapaManda ? "pierde" : "conserva"} la sugerencia en ${nombreDe.get(c.clientId)}`);
      const confirmadaEn = elMapaManda ? delMapa : [...new Set([...delMapa, ...otrasConfirmadas.map((c) => c.clientId)])];
      const sugeridaEn = (elMapaManda ? sugeridasDelMapa : [...new Set([...sugeridasDelMapa, ...otrasSugeridas.map((c) => c.clientId)])]).filter(
        (f) => !confirmadaEn.includes(f),
      );
      queda.set(p.correo, { confirmadaEn, sugeridaEn });
    }
    /* El rol y el nombre que ya puso una persona en esas fichas tampoco se pisan por defecto. */
    const yaDichos = await prisma.personaDeLaEmpresa.findMany({
      where: { correo: { in: correos }, clientId: { in: ids } },
      select: { correo: true, rol: true, rolFuente: true, nombre: true },
    });
    const mandaRol = new Map<string, boolean>();
    const mandaNombre = new Map<string, boolean>();
    for (const p of mapa.personas) {
      const suyas = yaDichos.filter((f) => f.correo === p.correo);
      const rolDePersona = suyas.find((f) => f.rolFuente === "persona" && f.rol)?.rol ?? null;
      const choca = !!p.rol && !!rolDePersona && rolDePersona !== p.rol;
      if (choca) avisos.push(`${p.correo}: ${elMapaManda ? `PIERDE el rol «${rolDePersona}» (queda «${p.rol}»)` : `conserva el rol «${rolDePersona}» (el mapa dice «${p.rol}»)`}`);
      mandaRol.set(p.correo, !!p.rol && (elMapaManda || !rolDePersona));
      mandaNombre.set(p.correo, !!p.nombre && (elMapaManda || !suyas.some((f) => f.nombre)));
    }
    if (avisos.length) {
      console.log("");
      console.log("Lo que ya estaba en la base, en las fichas del mapa:");
      for (const a of avisos) console.log(`  ${a}`);
    }

    /* ── 4. Las reuniones que cambiarían de dueña ── */
    const hipotesis = new Map<string, string[]>();
    for (const p of mapa.personas) {
      const q = queda.get(p.correo)!;
      const propias = [...q.confirmadaEn, ...(confirmarSugeridas ? q.sugeridaEn : [])];
      const deFuera = confirmadasHoy.filter((c) => c.correo === p.correo && !ids.includes(c.clientId)).map((c) => c.clientId);
      hipotesis.set(p.correo, [...new Set([...deFuera, ...propias])]);
    }
    /* Lo que se pide simular de las fichas (solo en memoria, nunca con --apply): una sigla, un dominio que se pasa. */
    const siglas = valores("--sigla");
    const dominios = valores("--dominio");
    if (escribir && (siglas.length || dominios.length)) throw new Error("--sigla y --dominio son solo para el simulacro: esos datos los cambia una persona en la ficha.");
    const ajustarFichas = siglas.length || dominios.length
      ? (clients: Parameters<NonNullable<Parameters<typeof reResolverReunionesDe>[1]["ajustarFichas"]>>[0]) =>
          clients.map((c) => {
            let x = c;
            for (const [k, sigla] of siglas) if (idDe(k) === c.id) x = { ...x, siglas: [...(x.siglas ?? []), sigla] };
            for (const [k, dominio] of dominios) {
              if (idDe(k) === c.id) x = { ...x, emailDomains: [...x.emailDomains, dominio] };
              else if (x.emailDomains.includes(dominio)) x = { ...x, emailDomains: x.emailDomains.filter((d) => d !== dominio) };
            }
            return x;
          })
      : undefined;
    if (ajustarFichas) {
      console.log("");
      console.log(`En memoria: ${[...siglas.map(([k, v]) => `sigla «${v}» en ${mapa.fichas[k]!.nombre}`), ...dominios.map(([k, v]) => `${v} pasa a ${mapa.fichas[k]!.nombre}`)].join(" · ")}.`);
    }
    const { cambian: sinCambio } = await reResolverReunionesDe(correos, { aplicar: false, exigirHubspot: true });
    const { cambian: conCambio } = await reResolverReunionesDe(correos, { hipotesis, aplicar: false, ajustarFichas, exigirHubspot: true });
    const yaDistintas = new Set(sinCambio.map((c) => c.sessionId));
    const porElMapa = conCambio.filter((c) => !yaDistintas.has(c.sessionId) || sinCambio.find((x) => x.sessionId === c.sessionId)?.a !== c.a);
    const nombre = (id: string | null) => (id ? (nombreDe.get(id) ?? id) : "por decidir");
    console.log(`\n## Las reuniones que cambian de dueña: ${porElMapa.length}\n`);
    if (sinCambio.length) {
      console.log(`(Aparte, ${sinCambio.length} de sus reuniones ya hoy están distintas de lo que diría el resolver: se re-resuelven igual con el --apply.)\n`);
    }
    const grupos = new Map<string, typeof porElMapa>();
    for (const c of porElMapa) {
      const k = `${nombre(c.de)} → ${nombre(c.a)}`;
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    for (const [k, lista] of [...grupos].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`### ${k}: ${lista.length}`);
      for (const c of lista.sort((a, b) => +a.date - +b.date)) console.log(`- ${fecha(c.date)} · ${c.title}`);
      console.log("");
    }
    if (!porElMapa.length) console.log("Ninguna: el mapa no cambia la dueña de ninguna reunión.\n");

    /* Las reglas del escritor (equipo, categorías, la casa): se miran TODAS antes de escribir la primera. */
    const rechazos: string[] = [];
    for (const p of mapa.personas) {
      const motivo = await motivoParaNoGuardar({ correo: p.correo, fichas: [...(p.confirmadaEn ?? []), ...(p.sugeridaEn ?? [])].map(idDe) });
      if (motivo) rechazos.push(`${p.correo}: ${motivo}`);
    }
    if (rechazos.length) {
      console.log(`⛔ El mapa trae ${rechazos.length} persona(s) que no se pueden guardar:`);
      for (const r of rechazos) console.log(`  ${r}`);
      console.log("");
    }

    if (!escribir) {
      console.log("Simulacro: no se escribió nada. Para aplicarlo: ALLOW_PROD_WRITE=1 … --por <correo> --apply");
      return;
    }
    if (rechazos.length) throw new Error("Corrige el mapa antes del --apply.");

    /* ── 5. Aplicar ── */
    await assertCodigoDesplegado();
    /* Todo lo que el --apply toca: las personas, la dueña de cada reunión que se mueve y sus vínculos a proyectos
       COMPLETOS (se sueltan los de otra ficha, también los que puso una persona). */
    const idsQueSeMueven = conCambio.map((c) => c.sessionId);
    const respaldo = guardarRespaldoJson({
      mapa: mapa.titulo,
      reuniones: conCambio.map((c) => ({ id: c.sessionId, resolvedClientIdAntes: c.de, resolvedClientIdDespues: c.a })),
      vinculos: await prisma.sessionProject.findMany({ where: { sessionId: { in: idsQueSeMueven } } }),
      // Lo que el cambio de dueña desestima o suelta (reResolveSession): los hechos y los análisis de venta.
      hechos: await prisma.hechoDeReunion.findMany({ where: { sessionId: { in: idsQueSeMueven } } }),
      analisisDeVenta: await prisma.analisisDeVenta.findMany({ where: { sessionId: { in: idsQueSeMueven } } }),
      personas: await prisma.personaDeLaEmpresa.findMany({ where: { correo: { in: correos } } }),
    });
    console.log(`Respaldo JSON: ${respaldo}`);
    const tocables = ids;
    for (const p of mapa.personas) {
      await guardarInterlocutor({
        tocables,
        cambio: {
          correo: p.correo,
          // Sin rol o sin nombre en el mapa no se borra el que ya tenga; el que puso una persona se conserva (salvo --el-mapa-manda).
          ...(mandaNombre.get(p.correo) ? { nombre: p.nombre } : {}),
          ...(mandaRol.get(p.correo) && p.rol ? { rol: p.rol } : {}),
          confirmadaEn: queda.get(p.correo)!.confirmadaEn,
          sugeridaEn: queda.get(p.correo)!.sugeridaEn,
        },
        porEmail: por!,
      });
    }
    console.log(`Personas escritas: ${mapa.personas.length}.`);
    /* Se mueve exactamente lo del simulacro de arriba (con su dueña nueva); lo que dé distinto ahora se salta y se lista. */
    const { cambian: movidas, saltadas } = await reResolverReunionesDe(correos, {
      aplicar: true,
      aprobadas: new Map(conCambio.map((c) => [c.sessionId, { de: c.de, a: c.a }])),
      exigirHubspot: true,
    });
    console.log(`Reuniones re-resueltas: ${movidas.length}.`);
    if (saltadas.length) {
      console.log(`⚠ ${saltadas.length} dieron distinto que en el simulacro y NO se movieron (vuelve a correr el simulacro):`);
      for (const c of saltadas) console.log(`  - ${fecha(c.date)} · ${c.title}: ${nombre(c.de)} → ${nombre(c.a)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
