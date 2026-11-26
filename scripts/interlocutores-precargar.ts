/**
 * scripts/interlocutores-precargar.ts — precarga «Unidades e interlocutores» con el mapa de gente que dio una persona del
 * equipo (2026-11-25). Simulacro por defecto (solo lectura): quién queda en qué ficha, confirmada o por confirmar, y
 * cuántas reuniones cambiarían de dueña y adónde.
 *
 * Uso:
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json>
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --confirmar-sugeridas   # ¿y si las sugeridas se confirman?
 *   … --el-mapa-manda   # el mapa reemplaza lo que ya dijo una persona en esas fichas (por defecto se conserva)
 *   … --con-la-deriva   # mover también las reuniones de otra gente que ya hoy dan distinto de lo guardado
 *   npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --sigla strato=SAS --dominio strato=stratospherecorp.com
 *       # ¿y si además la ficha tuviera esa sigla, o ese dominio (que se quita de la ficha que lo tenga)? Solo en memoria.
 *
 * Los cambios de las FICHAS que aprobó una persona (una sigla, un dominio que pasa) van en el mapa (`cambiosDeFichas`) y
 * el --apply los escribe primero; con ellos, el simulacro y el --apply miran TODAS las reuniones, no solo las del mapa.
 * El simulacro dice el porqué de cada reunión que cambia, lo que cuelga de ellas (vínculos, minutas, hechos, tareas,
 * pedidos, análisis de venta), lo que este cambio le suma a las invariantes que lo miran, y una HUELLA de lo que se mueve.
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/interlocutores-precargar.ts --mapa <archivo.json> --por <correo del equipo> --huella <la del simulacro> --apply
 *
 * El formato del mapa: scripts/lib/interlocutores-precarga.ts (no vive en el repo: trae correos de personas del cliente).
 * Escribe SOLO por lib/clients/personas-de-la-empresa-server.ts › `guardarInterlocutor` (el único escritor) y después
 * re-resuelve las reuniones (lib/sessions/resolve-client.ts › `reResolverReunionesDe`), que es lo que mueve a las dueñas:
 * lo que alguien asignó a mano no se mueve.
 *
 * ⚠ Después del SQL scripts/sql/2026-11-25-interlocutores-confirmados.sql y del deploy de ESTE código (si no, producción
 * re-resuelve con otro código y deshace la mudanza: KNOWN-ERRORS, «el backfill no pega»). El `--apply` aborta si el
 * commit de /api/health no tiene el mismo código que decide de quién es cada reunión.
 * El --apply escribe solo si la huella de ahora es la que se pidió (la de lo que se vio). Antes de escribir guarda un
 * respaldo JSON (las fichas, las personas, la dueña de antes y después de cada reunión y lo que cuelga de ellas). Si
 * escribir las fichas o las personas falla, las deja como estaban y no mueve nada; HubSpot no se vuelve a consultar
 * después de escribir (se usa lo que respondió para el simulacro).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { leerMapa, normalizarDominio, normalizarSigla } from "./lib/interlocutores-precarga";

/* El simulacro no puede escribir ni por error: la conexión es de solo lectura. */
if (!process.argv.includes("--apply")) process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

/** El código que decide de quién es cada reunión: producción tiene que correr exactamente este. */
const LO_QUE_DECIDE = ["lib/sessions/categorize.ts", "lib/sessions/resolve-client.ts"];

/**
 * Contra producción, el `--apply` solo con el mismo código desplegado: con otro, producción re-resuelve distinto y deshace
 * (o tuerce) la mudanza. Lo comprueba en /api/health: el commit que corre tiene que traer, sin diferencias, el código que
 * decide de quién es cada reunión (revisión del 26 nov: antes bastaba con que trajera el cambio anterior).
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
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
  } catch {
    throw new Error(`Producción corre ${sha.slice(0, 8)}, que este checkout no conoce: haz git fetch y vuelve a correr.`);
  }
  try {
    execFileSync("git", ["diff", "--quiet", sha, "--", ...LO_QUE_DECIDE], { stdio: "ignore" });
  } catch {
    throw new Error(
      `Producción corre ${sha.slice(0, 8)} y su ${LO_QUE_DECIDE.join(" o ")} no es el de este checkout: el simulacro no calcula lo que ` +
        "calcularía producción. Despliega este código (o deja el checkout en ese commit) y vuelve a correr el simulacro.",
    );
  }
  console.log(`  ✓ producción corre ${sha.slice(0, 8)}, con el mismo código que decide de quién es cada reunión`);
}

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function fallar(motivo: string): never {
  throw new Error(motivo);
}

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const igual = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

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

/** Los candados de un vínculo (lib/sessions/session-project-locks.ts › `isLockedLink`), para leerlos y decirlos. */
const CANDADOS = {
  source: true,
  reviewedAt: true,
  included: true,
  handoffOverride: true,
  timelineOverride: true,
  diagnosisOverride: true,
  planningOverride: true,
  implementationOverride: true,
  kickoffOverride: true,
  explorationOverride: true,
  techRequirementsOverride: true,
  deliveryOverride: true,
} as const;

/** Qué hizo una persona con un vínculo, en palabras: los documentos para los que lo eligió (o lo sacó). */
function loQueEligio(v: {
  source: string;
  reviewedAt: Date | null;
  included: boolean;
  handoffOverride: boolean | null;
  timelineOverride: boolean | null;
  diagnosisOverride: boolean | null;
  planningOverride: boolean | null;
  implementationOverride: boolean | null;
  kickoffOverride: boolean | null;
  explorationOverride: boolean | null;
  techRequirementsOverride: boolean | null;
  deliveryOverride: boolean | null;
}): string {
  const elegida = [
    v.handoffOverride === true && "handoff",
    v.kickoffOverride === true && "kickoff",
    v.diagnosisOverride === true && "diagnóstico",
    v.planningOverride === true && "planificación",
    v.implementationOverride === true && "ejecución",
    v.timelineOverride === true && "cronograma",
    v.explorationOverride === true && "exploración",
    v.techRequirementsOverride === true && "requerimientos técnicos",
    v.deliveryOverride === true && "entrega",
  ].filter((x): x is string => !!x);
  const partes = [
    elegida.length ? `elegida para ${elegida.join(", ")}` : null,
    v.handoffOverride === false ? "sacada del handoff" : null,
    !v.included ? "excluida a mano" : null,
    v.source === "manual" ? "vínculo puesto a mano" : null,
    v.reviewedAt ? "revisado" : null,
  ].filter((x): x is string => !!x);
  return partes.join(" · ") || "sin candado";
}

async function main() {
  const ruta = arg("--mapa");
  if (!ruta) throw new Error("Falta --mapa <archivo.json>.");
  const mapa = leerMapa(ruta);
  const confirmarSugeridas = process.argv.includes("--confirmar-sugeridas");
  /* Por defecto se CONSERVA lo que ya dijo una persona en las fichas del mapa (una confirmación o una sugerencia que el mapa
     no trae). Con --el-mapa-manda, el mapa reemplaza eso, y el simulacro lista qué se pierde. */
  const elMapaManda = process.argv.includes("--el-mapa-manda");
  /* Las reuniones de OTRA gente que ya hoy dan distinto de lo guardado no son de este cambio: por defecto no se mueven. */
  const conLaDeriva = process.argv.includes("--con-la-deriva");
  const escribir = resolverApply({ tablas: ["PersonaDeLaEmpresa", "Client"] });
  const por = arg("--por");
  const huellaPedida = arg("--huella");
  if (escribir && (!por || !por.includes("@"))) throw new Error("Con --apply, --por <correo de quien dio el mapa> es obligatorio.");
  if (escribir && !huellaPedida) throw new Error("Con --apply, --huella <la del simulacro> es obligatoria: se escribe solo lo que se vio.");
  if (escribir && confirmarSugeridas) throw new Error("--confirmar-sugeridas es solo para el simulacro: las sugeridas se confirman en la pantalla.");

  const { prisma } = await import("@/lib/db/prisma");
  const { esquemaDesactualizado } = await import("@/lib/db/esquema");
  const { reResolverReunionesDe } = await import("@/lib/sessions/resolve-client");
  const { guardarInterlocutor, motivoParaNoGuardar, fotoDeLaPersona, restaurarPersona } = await import("@/lib/clients/personas-de-la-empresa-server");
  const { huellaDeMovidas } = await import("@/lib/clients/interlocutores");
  const { isLockedLink } = await import("@/lib/sessions/session-project-locks");
  const { destinosDelegados } = await import("@/lib/seguimiento/hechos/estado");
  const { INV37 } = await import("@/lib/invariantes/sesiones");

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
    const idDe = (clave: string) => mapa.fichas[clave]?.id ?? fallar(`La ficha «${clave}» no está en el mapa.`);

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
    /* Los cambios de las fichas: los aprobados van en el mapa (y el --apply los escribe); los de la línea de comandos son
       solo para probar en el simulacro. Los dos quedan como los guarda la ficha (mayúsculas, minúsculas, sin «@»). */
    const siglasCli = valores("--sigla").map(([k, v]): [string, string] => [k, normalizarSigla(v) ?? fallar(`--sigla ${k}=${v}: una sigla tiene 2 letras o más.`)]);
    const dominiosCli = valores("--dominio").map(([k, v]): [string, string] => [k, normalizarDominio(v) ?? fallar(`--dominio ${k}=${v}: va como «empresa.com».`)]);
    if (escribir && (siglasCli.length || dominiosCli.length)) {
      throw new Error("En el --apply, los cambios de las fichas van en el mapa (cambiosDeFichas), que es lo que se aprobó.");
    }
    const siglas = [...(mapa.cambiosDeFichas?.siglas ?? []), ...siglasCli];
    const dominios = [...(mapa.cambiosDeFichas?.dominios ?? []), ...dominiosCli];
    for (const [k] of [...siglas, ...dominios]) idDe(k);
    const cambianFichas = siglas.length > 0 || dominios.length > 0;
    const mismoDominio = (guardado: string, dominio: string) => guardado.trim().toLowerCase().replace(/^@/, "") === dominio;
    /* El cambio de las fichas, UNA función para el simulacro, la cuenta de INV37 y lo que escribe el --apply. */
    const ajustar = <T extends { id: string; siglas?: string[] | null; emailDomains: string[] }>(clients: readonly T[]): T[] =>
      clients.map((c) => {
        let x = c;
        for (const [k, sigla] of siglas) {
          const actuales = x.siglas ?? [];
          if (idDe(k) === c.id && !actuales.some((s) => normalizarSigla(s) === sigla)) x = { ...x, siglas: [...actuales, sigla] } as T;
        }
        for (const [k, dominio] of dominios) {
          const loTiene = x.emailDomains.some((d) => mismoDominio(d, dominio));
          if (idDe(k) === c.id) {
            if (!loTiene) x = { ...x, emailDomains: [...x.emailDomains, dominio] } as T;
          } else if (loTiene) {
            x = { ...x, emailDomains: x.emailDomains.filter((d) => !mismoDominio(d, dominio)) } as T;
          }
        }
        return x;
      });
    if (cambianFichas) {
      console.log("");
      console.log(`Las fichas cambian (en memoria): ${[...siglas.map(([k, v]) => `sigla «${v}» en ${mapa.fichas[k]!.nombre}`), ...dominios.map(([k, v]) => `${v} pasa a ${mapa.fichas[k]!.nombre}`)].join(" · ")}.`);
      console.log("Con eso cambian también reuniones de otra gente: se miran TODAS las reuniones, no solo las de este mapa.");
    }
    /* HubSpot se consulta UNA vez: la cuenta de hoy, la del cambio y el --apply usan lo mismo. */
    const hoy = await reResolverReunionesDe(correos, { aplicar: false, exigirHubspot: true, todas: cambianFichas });
    const con = await reResolverReunionesDe(correos, {
      hipotesis,
      aplicar: false,
      ajustarFichas: cambianFichas ? ajustar : undefined,
      hubspot: hoy.hubspot,
      todas: cambianFichas,
    });
    const yaDistintas = new Map(hoy.cambian.map((c) => [c.sessionId, c.a]));
    const porElMapa = con.cambian.filter((c) => !yaDistintas.has(c.sessionId) || yaDistintas.get(c.sessionId) !== c.a);
    /* La DERIVA: reuniones que ya hoy dan distinto de lo guardado, y que el cambio no toca. Las de la gente del mapa se
       ponen al día con el --apply; las de otra gente no son de este cambio y no se mueven (salvo --con-la-deriva). */
    const deriva = con.cambian.filter((c) => yaDistintas.has(c.sessionId) && yaDistintas.get(c.sessionId) === c.a);
    const deLaGente = new Set(
      deriva.length
        ? (await prisma.firefliesSession.findMany({ where: { id: { in: deriva.map((c) => c.sessionId) } }, select: { id: true, participants: true } }))
            .filter((s) => s.participants.some((x) => correos.includes(x.trim().toLowerCase())))
            .map((s) => s.id)
        : [],
    );
    const derivaPropia = deriva.filter((c) => deLaGente.has(c.sessionId));
    const derivaAjena = deriva.filter((c) => !deLaGente.has(c.sessionId));
    const aprobadas = [...porElMapa, ...derivaPropia, ...(conLaDeriva ? derivaAjena : [])];
    const huella = huellaDeMovidas(aprobadas);

    const otrasDuenas = [...new Set(con.cambian.flatMap((c) => [c.de, c.a]).filter((x): x is string => !!x && !nombreDe.has(x)))];
    for (const c of otrasDuenas.length ? await prisma.client.findMany({ where: { id: { in: otrasDuenas } }, select: { id: true, name: true } }) : []) {
      nombreDe.set(c.id, c.name);
    }
    const nombre = (id: string | null) => (id ? (nombreDe.get(id) ?? id) : "por decidir");
    type Reunion = (typeof con.cambian)[number];
    /* Sin ficha no siempre es «por decidir»: una reunión interna queda en la categoría Interna. */
    const adonde = (c: Reunion) =>
      c.a
        ? nombre(c.a)
        : c.porQue?.paso === "interna"
          ? "Interna (reunión del equipo)"
          : c.porQue?.paso === "categoria"
            ? "una categoría"
            : c.porQue?.paso === "empresa-de-hubspot-sin-ficha"
              ? "una empresa de HubSpot sin ficha"
              : "por decidir";
    const listar = (lista: readonly Reunion[], conDeA = false) => {
      for (const c of [...lista].sort((a, b) => +a.date - +b.date)) {
        console.log(`- ${fecha(c.date)} · ${c.title.trim()}${conDeA ? ` · ${nombre(c.de)} → ${adonde(c)}` : ""} — ${porQueEnPalabras(c.porQue)}`);
      }
    };
    console.log(`\n## Las reuniones que cambian de dueña: ${porElMapa.length}\n`);
    const grupos = new Map<string, Reunion[]>();
    for (const c of porElMapa) {
      const k = `${nombre(c.de)} → ${adonde(c)}`;
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    for (const [k, lista] of [...grupos].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`### ${k}: ${lista.length}`);
      listar(lista);
      console.log("");
    }
    if (!porElMapa.length) console.log("Ninguna: el mapa no cambia la dueña de ninguna reunión.\n");
    const dosNombres = porElMapa.filter((c) => c.a === null && c.porQue?.entre === "dos-nombres").length;
    if (dosNombres) console.log(`De las que quedan por decidir, ${dosNombres} es(son) porque el título nombra a las dos fichas (la regla: una reunión de dos la asigna una persona en /sessions).\n`);
    if (derivaPropia.length) {
      console.log(`### Además, ${derivaPropia.length} de la gente del mapa que ya hoy dan distinto de lo guardado (el --apply las pone al día):`);
      listar(derivaPropia, true);
      console.log("");
    }
    if (derivaAjena.length) {
      console.log(
        `### Aparte, ${derivaAjena.length} de OTRA gente que ya hoy dan distinto de lo guardado: no son de este cambio. ` +
          (conLaDeriva ? "Con --con-la-deriva, el --apply las mueve también:" : "El --apply NO las mueve (con --con-la-deriva las movería):"),
      );
      listar(derivaAjena, true);
      console.log("");
    }

    /* ── 4b. Lo que cuelga de las reuniones que se mueven (las aprobadas) ── */
    const idsCambian = aprobadas.map((c) => c.sessionId);
    const destino = new Map(aprobadas.map((c) => [c.sessionId, c.a]));
    const reunion = new Map(aprobadas.map((c) => [c.sessionId, c]));
    const [vinculos, tareas, pedidos, hechos, analisis, lecturas, minutas, viejos, corridas] = await Promise.all([
      prisma.sessionProject.findMany({
        where: { sessionId: { in: idsCambian } },
        select: { sessionId: true, ...CANDADOS, project: { select: { name: true, clientId: true } } },
      }),
      prisma.tarea.findMany({ where: { sessionId: { in: idsCambian } }, select: { numero: true, sessionId: true, clientId: true, cita: true, estado: true } }),
      prisma.pedidoFueraDeAlcance.findMany({ where: { sessionId: { in: idsCambian }, estado: { not: "DESCARTADO" } }, select: { sessionId: true, clientId: true, pedido: true } }),
      /* Un hecho vivo es «pendiente»; lo delegado se anota en cada destino (destinosDelegados), no en el estado. */
      prisma.hechoDeReunion.findMany({ where: { sessionId: { in: idsCambian }, estado: "pendiente" }, select: { sessionId: true, clientId: true, destinos: true } }),
      prisma.analisisDeVenta.count({ where: { sessionId: { in: idsCambian } } }),
      prisma.lecturaDeReunion.count({ where: { sessionId: { in: idsCambian } } }),
      prisma.sessionMinute.findMany({ where: { sessionId: { in: idsCambian } }, select: { sessionId: true } }),
      prisma.actionItem.count({ where: { sessionId: { in: idsCambian } } }),
      prisma.agentRun.findMany({ where: { sourceSessionIds: { hasSome: idsCambian } }, select: { clientId: true } }),
    ]);
    const ajeno = (sessionId: string | null, clientId: string | null) => {
      const a = sessionId ? destino.get(sessionId) : undefined;
      return !!a && !!clientId && a !== clientId;
    };
    const seSueltan = vinculos.filter((v) => ajeno(v.sessionId, v.project.clientId));
    const esperan = vinculos.filter((v) => destino.get(v.sessionId) === null);
    const quedanBien = vinculos.filter((v) => !!destino.get(v.sessionId) && v.project.clientId === destino.get(v.sessionId));
    const tareasQueCruzan = tareas.filter((t) => t.cita && ajeno(t.sessionId, t.clientId));
    const pedidosQueCruzan = pedidos.filter((x) => ajeno(x.sessionId, x.clientId));
    const seRetiran = hechos.filter((h) => h.sessionId && destino.get(h.sessionId) !== h.clientId);
    const conDelegado = seRetiran.filter((h) => destinosDelegados(h.destinos).length > 0);
    const porProyecto = (lista: typeof vinculos) => {
      const n = new Map<string, number>();
      for (const v of lista) {
        const k = `«${v.project.name.trim()}» (${nombre(v.project.clientId)})`;
        n.set(k, (n.get(k) ?? 0) + 1);
      }
      return [...n].map(([k, x]) => `${k} ${x}`).join(", ");
    };
    const conCandado = (lista: typeof vinculos) => {
      for (const v of lista.filter(isLockedLink).sort((a, b) => +reunion.get(a.sessionId)!.date - +reunion.get(b.sessionId)!.date)) {
        const r = reunion.get(v.sessionId)!;
        console.log(`    · ${fecha(r.date)} · ${r.title.trim()} → «${v.project.name.trim()}» (${adonde(r)}): ${loQueEligio(v)}`);
      }
    };
    console.log("## Lo que cuelga de esas reuniones\n");
    console.log(`- Vínculos a proyectos: ${vinculos.length}.`);
    console.log(
      `  - Se sueltan ${seSueltan.length} (reuniones que pasan a otra ficha, a proyectos que no son de ella)${seSueltan.length ? `: ${porProyecto(seSueltan)}` : ""}. ` +
        `${seSueltan.filter(isLockedLink).length} los eligió o revisó una persona${seSueltan.some(isLockedLink) ? ":" : "."}`,
    );
    conCandado(seSueltan);
    const aInterna = esperan.filter((v) => reunion.get(v.sessionId)!.porQue?.paso === "interna").length;
    console.log(
      `  - Esperan ${esperan.length} (reuniones que quedan sin ficha: ${aInterna} de las que pasan a Interna, ${esperan.length - aInterna} de las que quedan por decidir)` +
        `${esperan.length ? `: ${porProyecto(esperan)}` : ""}. No alimentan ningún documento hasta que una persona asigne la reunión en /sessions (el chokepoint solo lee las reuniones de la ficha). ` +
        `${esperan.filter(isLockedLink).length} los eligió una persona y salen de esos documentos${esperan.some(isLockedLink) ? " (si se quieren ahí, asignar la reunión a mano ANTES del --apply: lo asignado a mano no se mueve):" : "."}`,
    );
    conCandado(esperan);
    if (quedanBien.length) console.log(`  - Quedan bien ${quedanBien.length} (ya eran de proyectos de la ficha nueva).`);
    const minutasPorDestino = new Map<string, number>();
    for (const m of minutas) {
      const k = adonde(reunion.get(m.sessionId)!);
      minutasPorDestino.set(k, (minutasPorDestino.get(k) ?? 0) + 1);
    }
    console.log(
      `- Minutas: ${minutas.length}${minutas.length ? ` (${[...minutasPorDestino].map(([k, n]) => `${n} a ${k}`).join(", ")})` : ""}; lecturas (compromisos, pedidos): ${lecturas}. ` +
        "Van con su reunión: las lee la ficha nueva; si queda sin ficha, ningún documento las lee hasta que alguien la asigne.",
    );
    console.log(
      `- Hechos pendientes: ${seRetiran.length} se retiran solos («La reunión cambió de dueño») y se vuelven a pedir en la ficha nueva` +
        (conDelegado.length
          ? `; ${conDelegado.length} tienen un destino delegado (una propuesta de la ficha, una alerta…): se retira de su módulo si se puede, y si no, el hecho sigue vivo e INV45 lo muestra (remedio: scripts/hechos-fuera-de-su-cliente.ts).`
          : "."),
    );
    console.log(`- Análisis de venta: ${analisis}. Los de la dueña anterior se sueltan al cambiar de dueña (INV57).`);
    console.log(`- Tareas con la cita de una reunión que cambia de ficha: ${tareasQueCruzan.length}${tareasQueCruzan.length ? ` (${tareasQueCruzan.map((t) => `T-${t.numero}`).join(", ")}): quedan en su ficha y ponen INV42 en rojo hasta que alguien les cambie el cliente` : ""}.`);
    console.log(`- Pedidos fuera de alcance de esas reuniones: ${pedidosQueCruzan.length}${pedidosQueCruzan.length ? ": quedan en su ficha y ponen INV46 en rojo hasta que alguien los descarte o los pase" : ""}.`);
    console.log(`- Pendientes del sistema viejo (ActionItem, sin escritores): ${viejos}. Se quedan como están.`);
    const sinNombre = [...new Set(corridas.map((r) => r.clientId).filter((x): x is string => !!x && !nombreDe.has(x)))];
    for (const c of sinNombre.length ? await prisma.client.findMany({ where: { id: { in: sinNombre } }, select: { id: true, name: true } }) : []) nombreDe.set(c.id, c.name);
    const corridasPor = new Map<string, number>();
    for (const r of corridas) {
      const k = r.clientId ? nombre(r.clientId) : "sin ficha";
      corridasPor.set(k, (corridasPor.get(k) ?? 0) + 1);
    }
    console.log(
      `- Corridas de agentes que usaron estas reuniones: ${corridas.length}${corridas.length ? ` (${[...corridasPor].map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}. ` +
        "Los documentos ya generados no cambian solos; al regenerarlos, salen sin las reuniones que ya no son de su ficha.",
    );

    /* ── 4c. Lo que este cambio le suma a las invariantes (medido en memoria) ── */
    console.log("\n## Lo que este cambio le suma a las invariantes (medido en memoria)\n");
    console.log("No dice si una invariante ya está en rojo por otra cosa: eso lo dice `npm run check:invariants`. Córrelo antes y después del --apply y compara que no aparezca nada nuevo de estas fichas.\n");
    const hoyCruzan = vinculos.filter((v) => {
      const r = reunion.get(v.sessionId)!;
      return r.de !== null && v.project.clientId !== r.de;
    });
    console.log(
      `- INV1 (vínculos que cruzan cliente): no suma. El --apply suelta los ${seSueltan.length} vínculos a proyectos de otra ficha en la misma transacción que mueve cada reunión; ` +
        `los ${esperan.length} de las que quedan sin ficha no cuentan (INV1 solo mira reuniones con dueña).`,
    );
    if (hoyCruzan.length) {
      const despues = (v: (typeof vinculos)[number]) => (destino.get(v.sessionId) === null ? "esperan" : v.project.clientId === destino.get(v.sessionId) ? "bien" : "sueltan");
      const n = (k: string) => hoyCruzan.filter((v) => despues(v) === k).length;
      console.log(`  Hoy ya cruzan ${hoyCruzan.length} de estos vínculos (INV1 ya los cuenta): con la mudanza, ${n("bien")} quedan bien, ${n("sueltan")} se sueltan y ${n("esperan")} dejan de contar (su reunión queda sin ficha).`);
    }
    console.log(
      `- INV2 (lo guardado = lo que diría el resolver): no suma si el --apply mueve las ${aprobadas.length} aprobadas; las que den distinto al escribir se saltan, se listan y esas sí quedan en INV2.` +
        (derivaAjena.length && !conLaDeriva ? ` Las ${derivaAjena.length} de otra gente que ya hoy dan distinto siguen contando: no son de este cambio.` : ""),
    );
    if (cambianFichas) {
      /* INV37 de verdad (dominios Y la empresa escrita como dominio, sin distinguir mayúsculas), con las fichas como están
         y con el cambio. */
      const todasLasFichas = await prisma.client.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, company: true, emailDomains: true, siglas: true },
      });
      const sobre = (lista: typeof todasLasFichas) => ({ client: { findMany: async () => lista } }) as unknown as Parameters<typeof INV37.correr>[0];
      const detalle = (r: { lineas: string[] }) =>
        new Set(
          r.lineas
            .flatMap((l) => l.split("\n"))
            .map((l) => l.trim())
            .filter((l) => l.startsWith("·")),
        );
      const antes = detalle(await INV37.correr(sobre(todasLasFichas), new Date()));
      const despues = detalle(await INV37.correr(sobre(ajustar(todasLasFichas)), new Date()));
      const suma = [...despues].filter((l) => !antes.has(l));
      const quita = [...antes].filter((l) => !despues.has(l));
      console.log(
        `- INV37 (un dominio en una sola ficha): ${suma.length ? `SUMA ${suma.length}: ${suma.join(" ; ")}` : "no suma"}` +
          `${quita.length ? `; deja de contar ${quita.length}: ${quita.join(" ; ")}` : ""} (hoy hay ${antes.size} dominio(s) repetido(s); con el cambio, ${despues.size}).`,
      );
    }
    console.log(`- INV42 (tareas con la cita de una reunión de otra ficha): ${tareasQueCruzan.length ? `SUMA ${tareasQueCruzan.length}` : "no suma"}.`);
    console.log(
      `- INV45 (hechos vivos fuera de su cliente): ${conDelegado.length ? `suma como mucho ${conDelegado.length} (los que tienen un destino delegado que su módulo no pueda retirar)` : "no suma (los pendientes se retiran solos)"}.`,
    );
    console.log(`- INV46 (pedidos fuera de alcance de otra ficha): ${pedidosQueCruzan.length ? `SUMA ${pedidosQueCruzan.length}` : "no suma"}.`);
    console.log(`- INV57 (análisis de venta de otra dueña): no suma; los ${analisis} se sueltan al cambiar de dueña, y el --apply espera a que termine.`);

    /* Las reglas del escritor (equipo, categorías, la casa): se miran TODAS antes de escribir la primera. */
    const rechazos: string[] = [];
    for (const p of mapa.personas) {
      const motivo = await motivoParaNoGuardar({ correo: p.correo, fichas: [...(p.confirmadaEn ?? []), ...(p.sugeridaEn ?? [])].map(idDe) });
      if (motivo) rechazos.push(`${p.correo}: ${motivo}`);
    }
    if (rechazos.length) {
      console.log(`\n⛔ El mapa trae ${rechazos.length} persona(s) que no se pueden guardar:`);
      for (const r of rechazos) console.log(`  ${r}`);
      console.log("");
    }

    console.log(`\nHuella del simulacro: ${huella} (${aprobadas.length} reunión(es) que se mueven). El --apply la pide.`);
    if (!escribir) {
      console.log(`Simulacro: no se escribió nada. Para aplicarlo: ALLOW_PROD_WRITE=1 … --por <correo> --huella ${huella}${conLaDeriva ? " --con-la-deriva" : ""} --apply`);
      return;
    }
    if (rechazos.length) throw new Error("Corrige el mapa antes del --apply.");
    if (huellaPedida !== huella) {
      throw new Error(
        `La huella de ahora es ${huella} y pediste ${huellaPedida}: lo que se mueve cambió desde que lo viste (una reunión nueva, alguien confirmó ` +
          "gente…). No se escribió nada: revisa el simulacro de arriba y aplícalo con su huella.",
      );
    }

    /* ── 5. Aplicar ── */
    await assertCodigoDesplegado();
    /* Lo que hay que poder devolver si escribir falla: las fichas que el cambio toca (como están) y cada persona en las
       fichas del mapa. */
    const tocadas = <T extends { id: string; siglas: string[]; emailDomains: string[] }>(todas: T[]): T[] => {
      const despues = new Map(ajustar(todas).map((c) => [c.id, c]));
      return todas.filter((c) => {
        const d = despues.get(c.id)!;
        return !igual(c.siglas, d.siglas) || !igual(c.emailDomains, d.emailDomains);
      });
    };
    const fichasAntes = cambianFichas ? tocadas(await prisma.client.findMany({ select: { id: true, name: true, siglas: true, emailDomains: true } })) : [];
    const fotos = new Map<string, Awaited<ReturnType<typeof fotoDeLaPersona>>>();
    for (const p of mapa.personas) fotos.set(p.correo, await fotoDeLaPersona(p.correo, ids));
    /* Todo lo que el --apply toca: las fichas que cambian, las personas, la dueña de cada reunión que se mueve y lo que
       cuelga de ellas COMPLETO (vínculos, también los que puso una persona; hechos; análisis de venta). */
    const respaldo = guardarRespaldoJson({
      mapa: mapa.titulo,
      huella,
      fichas: fichasAntes,
      reuniones: aprobadas.map((c) => ({ id: c.sessionId, title: c.title, resolvedClientIdAntes: c.de, resolvedClientIdDespues: c.a })),
      vinculos: await prisma.sessionProject.findMany({ where: { sessionId: { in: idsCambian } } }),
      hechos: await prisma.hechoDeReunion.findMany({ where: { sessionId: { in: idsCambian } } }),
      analisisDeVenta: await prisma.analisisDeVenta.findMany({ where: { sessionId: { in: idsCambian } } }),
      personas: await prisma.personaDeLaEmpresa.findMany({ where: { correo: { in: correos } } }),
    });
    console.log(`Respaldo JSON: ${respaldo}`);

    /* Las fichas y las personas: si algo falla, se devuelven como estaban y no se mueve ninguna reunión. */
    let escritas = 0;
    try {
      if (cambianFichas) {
        await prisma.$transaction(async (tx) => {
          const actuales = await tx.client.findMany({ select: { id: true, siglas: true, emailDomains: true } });
          const porId = new Map(actuales.map((c) => [c.id, c]));
          for (const c of ajustar(actuales)) {
            const a = porId.get(c.id)!;
            if (igual(a.siglas, c.siglas ?? []) && igual(a.emailDomains, c.emailDomains)) continue;
            await tx.client.update({ where: { id: c.id }, data: { siglas: c.siglas ?? [], emailDomains: c.emailDomains } });
          }
        });
        console.log("Fichas actualizadas (siglas y dominios).");
      }
      for (const p of mapa.personas) {
        await guardarInterlocutor({
          tocables: ids,
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
        escritas++;
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      try {
        for (const p of mapa.personas) await restaurarPersona(fotos.get(p.correo)!, p.correo, ids);
        if (fichasAntes.length) {
          await prisma.$transaction(fichasAntes.map((f) => prisma.client.update({ where: { id: f.id }, data: { siglas: f.siglas, emailDomains: f.emailDomains } })));
        }
      } catch (e2) {
        throw new Error(`No se pudo escribir (${motivo}) ni deshacer lo escrito (${e2 instanceof Error ? e2.message : e2}): devuélvelo desde el respaldo ${respaldo}.`);
      }
      throw new Error(`No se pudo escribir: ${motivo}. Se deshizo lo escrito (las fichas y las personas quedan como estaban) y no se movió ninguna reunión.`);
    }
    console.log(`Personas escritas: ${escritas}.`);

    /* Se mueve exactamente lo aprobado (con su dueña nueva), con lo que HubSpot respondió para el simulacro: no se le vuelve
       a preguntar con las fichas ya escritas. Lo que dé distinto ahora se salta y se lista. */
    let movidas: Reunion[];
    let saltadas: Reunion[];
    try {
      ({ cambian: movidas, saltadas } = await reResolverReunionesDe(correos, {
        aplicar: true,
        aprobadas: new Map(aprobadas.map((c) => [c.sessionId, { de: c.de, a: c.a }])),
        hubspot: con.hubspot,
        todas: cambianFichas,
        esperarLoQueCuelga: true,
      }));
    } catch (e) {
      throw new Error(
        `Las fichas y las personas quedaron escritas, pero la mudanza de las reuniones se cortó: ${e instanceof Error ? e.message : e}. ` +
          "Lo que alcanzó a moverse quedó bien (cada reunión se mueve con sus vínculos en una transacción). Para completarlo, vuelve a correr el " +
          "simulacro con --con-la-deriva (lo que falta sale como «ya hoy dan distinto») y aplícalo con su huella nueva.",
      );
    }
    const ajenas = new Set(conLaDeriva ? [] : derivaAjena.map((c) => c.sessionId));
    const comoSeDijo = saltadas.filter((c) => ajenas.has(c.sessionId));
    const sorpresas = saltadas.filter((c) => !ajenas.has(c.sessionId));
    console.log(`Reuniones re-resueltas: ${movidas.length} de ${aprobadas.length} aprobadas.`);
    if (comoSeDijo.length) console.log(`(${comoSeDijo.length} de otra gente que ya daban distinto no se movieron, como dijo el simulacro.)`);
    if (sorpresas.length) {
      console.log(`⚠ ${sorpresas.length} dieron distinto que en el simulacro y NO se movieron (quedan en INV2 hasta que alguien las revise en /sessions):`);
      for (const c of sorpresas) console.log(`  - ${fecha(c.date)} · ${c.title}: ${nombre(c.de)} → ${nombre(c.a)}`);
    }
    const vistas = new Set([...movidas, ...saltadas].map((c) => c.sessionId));
    const noSalieron = aprobadas.filter((c) => !vistas.has(c.sessionId));
    if (noSalieron.length) {
      const ahora = new Map(
        (await prisma.firefliesSession.findMany({ where: { id: { in: noSalieron.map((c) => c.sessionId) } }, select: { id: true, resolvedClientId: true } })).map((s) => [
          s.id,
          s.resolvedClientId,
        ]),
      );
      const yaEstaban = noSalieron.filter((c) => ahora.get(c.sessionId) === c.a);
      const yaNo = noSalieron.filter((c) => ahora.get(c.sessionId) !== c.a);
      if (yaEstaban.length) console.log(`${yaEstaban.length} ya estaban en su ficha nueva (las movió la app): se soltaron sus vínculos a proyectos de otra ficha.`);
      if (yaNo.length) {
        console.log(`⚠ ${yaNo.length} ya no cambian (algo cambió desde el simulacro) y no se movieron:`);
        for (const c of yaNo) console.log(`  - ${fecha(c.date)} · ${c.title}: sigue en ${nombre(ahora.get(c.sessionId) ?? null)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** El porqué de la dueña nueva, en palabras (la traza de la cascada). */
function porQueEnPalabras(t: { paso?: string; entre?: string } | undefined): string {
  const entre: Record<string, string> = {
    nombre: "el título la nombra",
    confirmada: "la gente que confirmó el equipo",
    gente: "lo aprendido de los títulos",
    dominio: "el dominio de su gente",
    "dos-nombres": "el título nombra a las dos fichas",
    "gente-de-varias": "hay gente de dos fichas",
    "sin-pista": "sin pista (la gente del grupo no decide sola)",
  };
  const paso: Record<string, string> = {
    "a-mano": "asignada a mano",
    "interna-por-titulo": "reunión interna: por el título",
    interna: "reunión interna",
    "gente-confirmada": "gente confirmada",
    dominio: "por el dominio",
    categoria: "por una categoría",
    hubspot: "por la empresa de HubSpot",
    "empresa-de-hubspot-sin-ficha": "una empresa de HubSpot sin ficha",
    titulo: "por el título",
    "sin-dueno": "sin pista",
  };
  if (!t?.paso) return "sin pista";
  return t.entre ? `${paso[t.paso] ?? t.paso}: ${entre[t.entre] ?? t.entre}` : (paso[t.paso] ?? t.paso);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
