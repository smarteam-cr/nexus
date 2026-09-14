/**
 * components/documentacion/comentarios/almacen.ts — de dónde salen y a dónde van los comentarios.
 *
 * Una interfaz y no llamadas sueltas: la pantalla habla con `AlmacenDeComentarios`, y el almacén
 * real habla con la API. Así la misma pantalla se prueba con un almacén en memoria donde no hay
 * sesión (la base local no tiene login), sin tocar el código que ve el equipo.
 */
import { fetchJson } from "@/lib/api/fetch-json";
import type { HiloVisto } from "@/lib/documentacion/comentarios";

/** Lo que hace falta para abrir un hilo: dónde (bloque + cita con su contexto) y qué se dice. */
export interface NuevoHilo {
  bloqueId: string;
  cita: string;
  antes: string;
  despues: string;
  cuerpo: string;
}

export interface AlmacenDeComentarios {
  listar(paginaId: string): Promise<HiloVisto[]>;
  crear(paginaId: string, nuevo: NuevoHilo): Promise<HiloVisto>;
  responder(hiloId: string, cuerpo: string): Promise<void>;
  resolver(hiloId: string, resuelto: boolean): Promise<void>;
  editar(hiloId: string, comentarioId: string, cuerpo: string): Promise<void>;
  borrar(hiloId: string, comentarioId: string): Promise<void>;
}

const json = (cuerpo: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

/** El almacén de verdad: la API de Documentación. */
export const almacenDeLaApi: AlmacenDeComentarios = {
  async listar(paginaId) {
    const r = await fetchJson<{ hilos: HiloVisto[] }>(`/api/documentacion/paginas/${paginaId}/comentarios`);
    return r.hilos;
  },
  async crear(paginaId, nuevo) {
    const r = await fetchJson<{ hilo: HiloVisto }>(`/api/documentacion/paginas/${paginaId}/comentarios`, {
      method: "POST",
      ...json(nuevo),
    });
    return r.hilo;
  },
  async responder(hiloId, cuerpo) {
    await fetchJson(`/api/documentacion/comentarios/${hiloId}`, { method: "POST", ...json({ cuerpo }) });
  },
  async resolver(hiloId, resuelto) {
    await fetchJson(`/api/documentacion/comentarios/${hiloId}`, { method: "PATCH", ...json({ resuelto }) });
  },
  async editar(hiloId, comentarioId, cuerpo) {
    await fetchJson(`/api/documentacion/comentarios/${hiloId}/${comentarioId}`, {
      method: "PATCH",
      ...json({ cuerpo }),
    });
  },
  async borrar(hiloId, comentarioId) {
    await fetchJson(`/api/documentacion/comentarios/${hiloId}/${comentarioId}`, { method: "DELETE" });
  },
};
