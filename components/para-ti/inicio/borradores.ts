"use client";

/**
 * borradores.ts — los borradores de eventos de la agenda del inicio, compartidos entre la agenda, «Lo que importa hoy»
 * y el panel del hueco (2026-10-17). Viven en la memoria de la pestaña: no se guardan en la base ni en el navegador, y
 * se pierden al recargar (el evento de verdad lo guarda la persona en Google Calendar).
 *
 * Cada borrador lleva el correo de quien lo armó: otra persona que entre en la misma pestaña no lo ve.
 */
import { useSyncExternalStore } from "react";
import { primerHuecoLaboral, type EventoParaLaGrilla } from "@/lib/mi-dia/inicio";
import { MINUTOS_DEL_BORRADOR, reunionPlaneadaDelBorrador, type BorradorDeEvento, type CuentaDelBorrador, type InvitadoDelBorrador } from "@/lib/mi-dia/agenda-borrador";

interface Estado {
  lista: BorradorDeEvento[];
  /** El que tiene abierto su cuadro de edición. */
  editando: string | null;
  /** El que la agenda tiene que mostrar (ir a su día y llevarlo a la vista). Lo consume la agenda. */
  enfocar: string | null;
}

let estado: Estado = { lista: [], editando: null, enfocar: null };
/** Las reuniones que la agenda tiene cargadas: «Agendar» busca la primera hora libre sin pisarlas. */
let eventosDeLaAgenda: EventoParaLaGrilla[] = [];
const oyentes = new Set<() => void>();

function cambiar(nuevo: Partial<Estado>) {
  estado = { ...estado, ...nuevo };
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
}

const VACIO: Estado = { lista: [], editando: null, enfocar: null };

/** Los borradores de quien mira. */
export function useBorradores(correo: string): Estado {
  const e = useSyncExternalStore(
    suscribir,
    () => estado,
    () => VACIO,
  );
  return e.lista.some((b) => b.correo !== correo) ? { ...e, lista: e.lista.filter((b) => b.correo === correo) } : e;
}

/** La agenda avisa qué reuniones tiene cargadas. */
export function fijarEventosDeLaAgenda(eventos: readonly EventoParaLaGrilla[]) {
  eventosDeLaAgenda = [...eventos];
}

let contador = 0;
const nuevoId = () => `b${Date.now().toString(36)}${(contador++).toString(36)}`;

export function crearBorrador(b: {
  correo: string;
  inicio: string;
  fin: string;
  titulo?: string;
  invitados?: InvitadoDelBorrador[];
  cuenta?: CuentaDelBorrador | null;
  origen: BorradorDeEvento["origen"];
  abierto?: boolean;
  enfocar?: boolean;
  objetivo?: string | null;
  tarea?: BorradorDeEvento["tarea"];
  deLaReunion?: string | null;
}): BorradorDeEvento {
  const nuevo: BorradorDeEvento = {
    id: nuevoId(),
    correo: b.correo,
    inicio: b.inicio,
    fin: b.fin,
    titulo: b.titulo ?? "",
    invitados: b.invitados ?? [],
    cuenta: b.cuenta ?? null,
    origen: b.origen,
    abierto: b.abierto ?? false,
    objetivo: b.objetivo ?? null,
    tarea: b.tarea ?? null,
    deLaReunion: b.deLaReunion ?? null,
  };
  // Un borrador sin tocar (sin título, invitados ni cuenta) se reemplaza: tocar otra hora no deja basura.
  const lista = estado.lista.filter((x) => x.abierto || x.titulo.trim() || x.invitados.length || x.cuenta);
  cambiar({ lista: [...lista, nuevo], editando: nuevo.id, enfocar: b.enfocar ? nuevo.id : estado.enfocar });
  return nuevo;
}

export function cambiarBorrador(id: string, cambios: Partial<Omit<BorradorDeEvento, "id" | "correo">>) {
  cambiar({ lista: estado.lista.map((b) => (b.id === id ? { ...b, ...cambios } : b)) });
}

export function quitarBorrador(id: string) {
  cambiar({ lista: estado.lista.filter((b) => b.id !== id), editando: estado.editando === id ? null : estado.editando });
}

/**
 * «Ya lo guardé»: la persona guardó el evento en Google Calendar. Con una cuenta (y sin ser el bloque de una tarea),
 * queda la reunión planeada en Tareas (/api/tareas/reuniones-planeadas) y la cuenta cuenta como con reunión. El borrador
 * se quita si salió bien; si no, queda para reintentar y devuelve el mensaje.
 */
export async function yaLoGuarde(b: BorradorDeEvento): Promise<{ ok: true; planeada: boolean } | { ok: false; error: string }> {
  const cuerpo = reunionPlaneadaDelBorrador(b);
  if (!cuerpo) {
    quitarBorrador(b.id);
    return { ok: true, planeada: false };
  }
  try {
    const r = await fetch("/api/tareas/reuniones-planeadas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: j?.error ?? "No se pudo dejar la reunión en tus tareas." };
    }
  } catch {
    return { ok: false, error: "No se pudo dejar la reunión en tus tareas. Revisa tu conexión." };
  }
  quitarBorrador(b.id);
  return { ok: true, planeada: true };
}

export function editarBorrador(id: string | null) {
  if (estado.editando !== id) cambiar({ editando: id });
}

export function yaEnfocado() {
  if (estado.enfocar) cambiar({ enfocar: null });
}

/**
 * La primera hora libre en horario laboral (lib/mi-dia/inicio.ts), sin pisar las reuniones de la agenda ni los
 * borradores de quien mira.
 */
export function primeraHoraLibre(correo: string, ahora: Date, minutos = MINUTOS_DEL_BORRADOR): { inicio: string; fin: string } {
  const ocupado = [...eventosDeLaAgenda, ...estado.lista.filter((b) => b.correo === correo).map((b) => ({ id: b.id, inicio: b.inicio, fin: b.fin }))];
  return primerHuecoLaboral(ocupado, ahora, { minutos });
}
