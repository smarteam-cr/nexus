/**
 * components/escala/comentarios/almacen.ts — de dónde salen y a dónde van los comentarios.
 *
 * Una interfaz y no llamadas sueltas (el mismo molde que Documentación): la pantalla habla con
 * `AlmacenDeLaEscala`, y el almacén real habla con la API. Así la pantalla se puede probar con un
 * almacén en memoria donde no hay sesión (la base local no tiene login).
 */
import { fetchJson } from "@/lib/api/fetch-json";
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { ComentarioVisto, EstadoDeComentario, TipoDeComentario } from "@/lib/escala/comentarios/reglas";

export interface NuevoComentario {
  ancla: string;
  tipo: TipoDeComentario;
  cuerpo: string;
  decisionQueCambiaria?: string | null;
  clienteId?: string | null;
  clienteNombre?: string | null;
  perfilCierre?: Cierre | null;
  perfilDespues?: Despues | null;
  /** La clave de la edición por industria desde la que se comenta (null = la escala general). */
  edicion?: string | null;
}

export type NuevoEstado =
  | { estado: "abierto" }
  | { estado: "respondido"; respuesta?: string | null }
  | { estado: "cambio_pendiente"; cambioQue: string; cambioCaso?: string | null; cambioDecision: string }
  | { estado: "descartado"; motivoDescarte?: string | null };

export interface ClienteParaElegir {
  id: string;
  nombre: string;
  categoria: string;
}

export interface AlmacenDeLaEscala {
  listar(filtro: { ancla?: string; area?: string; estado?: EstadoDeComentario }): Promise<ComentarioVisto[]>;
  crear(nuevo: NuevoComentario): Promise<ComentarioVisto>;
  editar(id: string, datos: { cuerpo: string; decisionQueCambiaria: string | null }): Promise<void>;
  borrar(id: string): Promise<void>;
  responder(id: string, cuerpo: string): Promise<void>;
  editarRespuesta(id: string, cuerpo: string): Promise<void>;
  borrarRespuesta(id: string): Promise<void>;
  cambiarEstado(id: string, estado: NuevoEstado): Promise<void>;
  clientes(): Promise<ClienteParaElegir[]>;
  exportar(): Promise<{ markdown: string; filas: number }>;
}

const json = (cuerpo: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

/** El almacén de verdad: la API de la escala. */
export const almacenDeLaApi: AlmacenDeLaEscala = {
  async listar(filtro) {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => !!v) as [string, string][]);
    const r = await fetchJson<{ comentarios: ComentarioVisto[] }>(`/api/escala/comentarios?${q}`);
    return r.comentarios;
  },
  async crear(nuevo) {
    const r = await fetchJson<{ comentario: ComentarioVisto }>("/api/escala/comentarios", { method: "POST", ...json(nuevo) });
    return r.comentario;
  },
  async editar(id, datos) {
    await fetchJson(`/api/escala/comentarios/${id}`, { method: "PATCH", ...json(datos) });
  },
  async borrar(id) {
    await fetchJson(`/api/escala/comentarios/${id}`, { method: "DELETE" });
  },
  async responder(id, cuerpo) {
    await fetchJson(`/api/escala/comentarios/${id}/respuestas`, { method: "POST", ...json({ cuerpo }) });
  },
  async editarRespuesta(id, cuerpo) {
    await fetchJson(`/api/escala/respuestas/${id}`, { method: "PATCH", ...json({ cuerpo }) });
  },
  async borrarRespuesta(id) {
    await fetchJson(`/api/escala/respuestas/${id}`, { method: "DELETE" });
  },
  async cambiarEstado(id, estado) {
    await fetchJson(`/api/escala/comentarios/${id}/estado`, { method: "POST", ...json(estado) });
  },
  async clientes() {
    const r = await fetchJson<{ clientes: ClienteParaElegir[] }>("/api/escala/clientes");
    return r.clientes;
  },
  async exportar() {
    return fetchJson<{ markdown: string; filas: number }>("/api/escala/comentarios/exportar");
  },
};
