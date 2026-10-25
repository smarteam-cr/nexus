/**
 * lib/smarteam/perfil.ts — el perfil de la empresa que usa Nexus (hoy Smarteam): sus formas, lo que se acepta al editarlo
 * y cómo se le cuenta a un agente (R13, 2026-10-25). PURO y client-safe.
 *
 * Elías, 24 oct: el cliente ideal, las buyer personas y lo demás de Smarteam tienen que estar bien armados en la
 * arquitectura y ser fáciles de usar. Todo cuelga de la ficha de la empresa (`PerfilDeLaEmpresa`, y `IcpItem` y
 * `BuyerPersona` con su `clientId`), y se lee por UN lector (lib/smarteam/contexto.ts). Es de la empresa que usa Nexus,
 * no una constante del código: así otra empresa podría usarlo (ARCHITECTURE §0).
 */
import { z } from "zod";
import type { IcpSection } from "@prisma/client";

export interface ServicioDelPerfil {
  nombre: string;
  descripcion: string | null;
  /** La tarifa, como la dice Ventas («US$ 85 la hora», «desde US$ 4.000»): texto, no un número que se suma. */
  tarifa: string | null;
}

export interface ClienteDeReferencia {
  clientId: string;
  /** El nombre de la empresa al leer (no se guarda: sale de su ficha). */
  nombre?: string;
  /** La industria por la que es referencia (una de «Industria (Smarteam)», o texto). */
  industria: string;
  porque: string | null;
}

export interface PerfilDeLaEmpresa {
  propuestaDeValor: string | null;
  positionStatement: string | null;
  tono: string | null;
  servicios: ServicioDelPerfil[];
  clientesDeReferencia: ClienteDeReferencia[];
}

export const PERFIL_VACIO: PerfilDeLaEmpresa = { propuestaDeValor: null, positionStatement: null, tono: null, servicios: [], clientesDeReferencia: [] };

const texto = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable();

/** Lo que acepta la ruta al guardar el perfil (Zod en la frontera). */
export const PerfilEdicionSchema = z.strictObject({
  propuestaDeValor: texto(4000),
  positionStatement: texto(4000),
  tono: texto(4000),
  servicios: z
    .array(z.strictObject({ nombre: z.string().trim().min(1, "Cada servicio necesita un nombre.").max(120), descripcion: texto(1000), tarifa: texto(120) }))
    .max(40),
  clientesDeReferencia: z
    .array(z.strictObject({ clientId: z.string().min(1).max(64), industria: z.string().trim().min(1, "Cada referencia necesita su industria.").max(80), porque: texto(500) }))
    .max(60),
});
export type PerfilEdicion = z.infer<typeof PerfilEdicionSchema>;

/** Lectura tolerante del Json guardado: lo que no tiene forma se salta. */
export function leerServicios(v: unknown): ServicioDelPerfil[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.nombre !== "string" || !o.nombre.trim()) return [];
    return [{ nombre: o.nombre.trim(), descripcion: typeof o.descripcion === "string" ? o.descripcion : null, tarifa: typeof o.tarifa === "string" ? o.tarifa : null }];
  });
}

export function leerReferencias(v: unknown): ClienteDeReferencia[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.clientId !== "string" || typeof o.industria !== "string") return [];
    return [{ clientId: o.clientId, industria: o.industria, porque: typeof o.porque === "string" ? o.porque : null }];
  });
}

/** Una referencia por empresa e industria: la segunda igual sobra. */
export function sinReferenciasRepetidas(refs: readonly ClienteDeReferencia[]): ClienteDeReferencia[] {
  const vistos = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.clientId}:${r.industria.toLowerCase()}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// ── Lo que lee un agente ─────────────────────────────────────────────────────────────────────────

export interface ContextoDeLaEmpresaQueUsaNexus {
  /** null = no se sabe cuál es (ninguna o dos empresas nuestras sin perfil): sin perfil, con el resto. */
  empresa: { id: string; nombre: string } | null;
  perfil: PerfilDeLaEmpresa;
  /** El tono: el del perfil, o el de Marketing (`MarketingSettings.brandVoice`) mientras el perfil no lo tenga. */
  tono: string | null;
  /** El cliente ideal, por sección, en el orden de Marketing › Audiencia. */
  clienteIdeal: { seccion: IcpSection; etiqueta: string; items: string[] }[];
  buyerPersonas: { nombre: string; cargo: string | null; descripcion: string; dolores: string | null; objetivos: string | null }[];
}

/**
 * Lo que la preventa necesita de Smarteam para abrir y para «Contarle», sin inflar el pedido: la propuesta de valor y el
 * position statement, cortos. Sin ninguno de los dos, null (y el pedido no suma nada).
 */
export function textoParaLaPreventa(c: ContextoDeLaEmpresaQueUsaNexus | null, max = 900): string | null {
  if (!c) return null;
  const partes = [c.perfil.propuestaDeValor && `Propuesta de valor: ${c.perfil.propuestaDeValor}`, c.perfil.positionStatement && `Position statement: ${c.perfil.positionStatement}`].filter(
    (x): x is string => !!x,
  );
  if (!partes.length) return null;
  const t = partes.join("\n");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * El bloque que se le pasa a un agente: lo que Nexus sabe de la empresa que lo usa. Sin lo que falta (una sección vacía
 * no se nombra: el agente no tiene que adivinar qué quiso decir un título sin nada abajo).
 */
export function textoParaElAgente(c: ContextoDeLaEmpresaQueUsaNexus, o: { con?: readonly ("perfil" | "clienteIdeal" | "buyerPersonas" | "referencias")[] } = {}): string {
  const con = new Set(o.con ?? ["perfil", "clienteIdeal", "buyerPersonas", "referencias"]);
  const partes: string[] = [];
  if (con.has("perfil")) {
    if (c.perfil.propuestaDeValor) partes.push(`Propuesta de valor de ${c.empresa?.nombre ?? "la empresa"}:\n${c.perfil.propuestaDeValor}`);
    if (c.perfil.positionStatement) partes.push(`Position statement:\n${c.perfil.positionStatement}`);
    if (c.tono) partes.push(`Tono de la marca:\n${c.tono}`);
    if (c.perfil.servicios.length) {
      partes.push(`Servicios:\n${c.perfil.servicios.map((s) => `- ${s.nombre}${s.descripcion ? `: ${s.descripcion}` : ""}${s.tarifa ? ` (${s.tarifa})` : ""}`).join("\n")}`);
    }
  }
  if (con.has("clienteIdeal") && c.clienteIdeal.length) {
    partes.push(`Cliente ideal:\n${c.clienteIdeal.map((s) => `${s.etiqueta}:\n${s.items.map((i) => `- ${i}`).join("\n")}`).join("\n\n")}`);
  }
  if (con.has("buyerPersonas") && c.buyerPersonas.length) {
    partes.push(
      `Buyer personas:\n${c.buyerPersonas
        .map((p) => `- ${p.nombre}${p.cargo ? ` (${p.cargo})` : ""}: ${p.descripcion}${p.dolores ? ` | Dolores: ${p.dolores}` : ""}${p.objetivos ? ` | Objetivos: ${p.objetivos}` : ""}`)
        .join("\n")}`,
    );
  }
  if (con.has("referencias") && c.perfil.clientesDeReferencia.length) {
    partes.push(`Clientes de referencia por industria:\n${c.perfil.clientesDeReferencia.map((r) => `- ${r.industria}: ${r.nombre ?? r.clientId}${r.porque ? ` (${r.porque})` : ""}`).join("\n")}`);
  }
  return partes.join("\n\n");
}
