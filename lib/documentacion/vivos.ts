/**
 * lib/documentacion/vivos.ts — lo que una página de Documentación NO escribe a mano.
 *
 * Un «bloque vivo» no guarda contenido: declara una FUENTE, y el servidor la arma al abrir la
 * página con los mismos registros que gobiernan la app. Es la regla que fundó el módulo, ahora
 * dentro de una página editable: el texto narrativo lo escribe una persona, y las listas —el
 * menú, las etapas, los documentos, los agentes, HubSpot y los roles— se derivan.
 *
 * ── POR QUÉ SE CALCULA EN EL SERVIDOR Y NO EN EL BLOQUE ──────────────────────
 * El editor corre en el navegador. Si el bloque se armara allá habría que mandarle los registros
 * enteros (~67 KB de definiciones) y, encima, los agentes salen de la base. Se resuelve acá, una
 * vez por página, y el bloque solo pinta.
 *
 * ⚠ PRIVACIDAD: la consulta de agentes es DELIBERADAMENTE acotada — sin `systemPrompt`, sin
 * `additionalInstructions` y sin `description`. Los prompts son calibración interna y viven
 * detrás del permiso de `/agents`; esta pantalla no tiene gate. Lo congela `lib/manual/manual.test.ts`.
 */
import { prisma } from "@/lib/db/prisma";
import { APP_NAV } from "@/components/layout/nav-config";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { DOC_MENU, DOC_ROLES } from "@/lib/manual/contenido";
import {
  armarAgentes,
  armarCicloCorto,
  armarDocumentos,
  armarPipelines,
  armarPropiedades,
  armarRecorrido,
  totalPropiedades,
  type CategoriaDeAgentes,
  type DocumentoDoc,
  type EtapaDoc,
  type GrupoDePropiedades,
  type PipelineDoc,
} from "@/lib/manual/armar";
import { FUENTES_VIVAS, type BloqueGuardado, type FuenteViva } from "./tipos";

export interface ItemDeMenu {
  key: string;
  label: string;
  href: string;
  grupo: "operacion" | "administracion";
  /** La frase escrita a mano (`DOC_MENU`). */
  queEs: string;
  /** Qué hace falta para verla, en lenguaje de negocio. */
  quienLaVe: string;
  /** Las hojas del submenú, si tiene. */
  hijas: string[];
}

export interface RolDoc {
  clave: string;
  nombre: string;
  queHace: string;
  /** Las secciones que toca por defecto, con su nombre visible. */
  secciones: string[];
}

export interface DatosVivos {
  menu: ItemDeMenu[];
  recorrido: { etapas: EtapaDoc[]; corto: EtapaDoc[] };
  documentos: DocumentoDoc[];
  agentes: CategoriaDeAgentes[];
  hubspot: { pipelines: PipelineDoc[]; grupos: GrupoDePropiedades[]; totalProps: number };
  roles: RolDoc[];
}

/** El gate del menú, dicho para una persona. */
function quienLoVe(gate: (typeof APP_NAV)[number]["gate"]): string {
  if (!gate || gate.kind === "always") return "Todo el equipo";
  if (gate.kind === "superAdmin") return "Solo dirección";
  if (gate.kind === "superAdminOrSharedDocs") return "Dirección, y quien tenga un documento compartido";
  const seccion = PERMISSION_SECTIONS.find((s) => s.key === gate.section);
  return `Quien tenga permiso de ${seccion?.label ?? gate.section}`;
}

function armarMenu(): ItemDeMenu[] {
  return APP_NAV.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    grupo: item.group,
    // El `?? ""` no es un default silencioso: `manual.test.ts` falla si falta la frase.
    queEs: DOC_MENU[item.key] ?? "",
    quienLaVe: quienLoVe(item.gate),
    hijas: (item.children ?? []).map((h) => h.label),
  }));
}

/**
 * Los roles con las secciones que tocan POR DEFECTO. Es el default de código, que es lo que se
 * puede afirmar sin mentir: el Super Admin ajusta la matriz real por rol y por persona en Equipo,
 * y eso se dice en la página.
 */
function armarRoles(): RolDoc[] {
  return Object.entries(ROLE_LABEL).map(([clave, nombre]) => {
    const mapa = DEFAULT_MATRIX[clave as keyof typeof DEFAULT_MATRIX];
    const secciones = PERMISSION_SECTIONS.filter((s) =>
      s.actions.some((a) => mapa?.sections?.[s.key]?.[a.key] === true),
    ).map((s) => s.label);
    return {
      clave,
      nombre,
      // El `?? ""` no es un default silencioso: `manual.test.ts` falla si falta la frase.
      queHace: DOC_ROLES[clave] ?? "",
      secciones,
    };
  });
}

/** Arma TODAS las fuentes de una vez: es barato y así la página hace una sola pasada. */
export async function cargarDatosVivos(): Promise<DatosVivos> {
  const filas = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, agentType: true, agentGroup: true },
  });

  return {
    menu: armarMenu(),
    recorrido: { etapas: armarRecorrido(), corto: armarCicloCorto() },
    documentos: armarDocumentos(),
    agentes: armarAgentes(filas),
    hubspot: {
      pipelines: armarPipelines(),
      grupos: armarPropiedades(),
      totalProps: totalPropiedades(),
    },
    roles: armarRoles(),
  };
}

/** ¿Alguno de los bloques de esta página es vivo? Si no, no hace falta calcular nada. */
export function tieneBloquesVivos(bloques: readonly BloqueGuardado[]): boolean {
  const recorrer = (lista: readonly BloqueGuardado[]): boolean =>
    lista.some(
      (b) => b.type === "vivo" || (Array.isArray(b.children) && recorrer(b.children)),
    );
  return recorrer(bloques);
}

/**
 * El texto que APORTA cada bloque vivo a la búsqueda. Sin esto, buscar «kickoff» no encontraría
 * la página que lo lista: su texto no está escrito en ninguna parte del contenido guardado.
 */
export function textoDeLoVivo(datos: DatosVivos, fuentes: readonly FuenteViva[]): string {
  const partes: string[] = [];
  for (const fuente of fuentes) {
    if (fuente === "menu") partes.push(datos.menu.map((m) => `${m.label} ${m.queEs}`).join("\n"));
    if (fuente === "recorrido") {
      partes.push(datos.recorrido.etapas.map((e) => `${e.nombre} ${e.queEs}`).join("\n"));
    }
    if (fuente === "documentos") {
      partes.push(datos.documentos.map((d) => `${d.nombre} ${d.paraQue}`).join("\n"));
    }
    if (fuente === "agentes") {
      partes.push(
        datos.agentes
          .flatMap((c) => c.agentes.map((a) => `${a.nombre} ${a.descripcion ?? ""}`))
          .join("\n"),
      );
    }
    if (fuente === "hubspot") {
      partes.push(datos.hubspot.pipelines.map((p) => `${p.label} ${p.help}`).join("\n"));
    }
    if (fuente === "roles") partes.push(datos.roles.map((r) => `${r.nombre} ${r.queHace}`).join("\n"));
  }
  return partes.filter(Boolean).join("\n");
}

/** Las fuentes vivas que usa una página, sin repetir. */
export function fuentesDe(bloques: readonly BloqueGuardado[]): FuenteViva[] {
  const encontradas = new Set<FuenteViva>();
  const recorrer = (lista: readonly BloqueGuardado[]) => {
    for (const b of lista) {
      if (b.type === "vivo") {
        const fuente = (b.props as { fuente?: unknown } | undefined)?.fuente;
        if (typeof fuente === "string" && (FUENTES_VIVAS as readonly string[]).includes(fuente)) {
          encontradas.add(fuente as FuenteViva);
        }
      }
      if (Array.isArray(b.children)) recorrer(b.children);
    }
  };
  recorrer(bloques);
  return [...encontradas];
}
