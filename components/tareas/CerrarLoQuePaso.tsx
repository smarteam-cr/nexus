"use client";

/**
 * components/tareas/CerrarLoQuePaso.tsx — «Nexus sugiere cerrar N tareas que ya pasaron» (DECISIONS «Tareas
 * internas…» › «Menos tareas a la vista»). La franja va arriba, una vez; «Revisar» abre la lista con el motivo de cada
 * una, todas marcadas, y la persona desmarca lo que sigue y confirma. Una abierta pasa a «Ya no se hará» con el motivo;
 * una propuesta, a «Descartada». Nada se cierra solo: lo cierra quien confirma, por el escritor de siempre.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, FranjaDeSugerencias } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { Casilla } from "@/components/contexto/ListaDeReuniones";
import type { TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";

const cuantas = (n: number) => (n === 1 ? "1 tarea" : `${n} tareas`);

export function CerrarLoQuePaso({ tareas, onAbrir, onCerradas }: { tareas: readonly TareaVista[]; onAbrir: (t: TareaVista) => void; onCerradas: () => void }) {
  const toast = useToast();
  const conSugerencia = tareas.filter((t) => t.cerrar);
  const [abierto, setAbierto] = useState(false);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [cerrando, setCerrando] = useState(false);
  if (!conSugerencia.length) return null;
  const marcadas = conSugerencia.filter((t) => !fuera.has(t.id));

  async function cerrar() {
    setCerrando(true);
    let hechas = 0;
    const fallas: string[] = [];
    for (const t of marcadas) {
      const s = t.cerrar!;
      try {
        if (s.accion === "descartar") await apiTareas.decidir(t.id, t.version, { tipo: "rechazar", motivo: s.motivo });
        else await apiTareas.cambiar(t.id, { accion: "estado", hacia: "no_se_hara", motivo: s.motivo, version: t.version });
        hechas++;
      } catch (e) {
        fallas.push(`T-${t.numero}: ${e instanceof Error ? e.message : "no se pudo"}`);
      }
    }
    setCerrando(false);
    if (hechas) toast.success(`Cerraste ${cuantas(hechas)}. Cada una guarda su motivo en la historia.`);
    if (fallas.length) toast.error(fallas.join(" · "));
    setAbierto(false);
    setFuera(new Set());
    onCerradas();
  }

  return (
    <>
      <FranjaDeSugerencias acciones={<BotonBlanco onClick={() => setAbierto(true)}>Revisar</BotonBlanco>}>
        Nexus sugiere cerrar {cuantas(conSugerencia.length)} que ya pasaron y nadie tocó. Tú decides cuáles.
      </FranjaDeSugerencias>
      <Modal
        open={abierto}
        onClose={() => !cerrando && setAbierto(false)}
        title="Cerrar lo que ya pasó"
        description="Desmarca lo que todavía hay que hacer. Las abiertas pasan a «Ya no se hará» y las propuestas se descartan, con el motivo escrito. Nada se borra."
        size="lg"
        footer={
          <>
            <BotonTexto onClick={() => setAbierto(false)} disabled={cerrando}>
              Cancelar
            </BotonTexto>
            <BotonAzul onClick={() => void cerrar()} disabled={cerrando || !marcadas.length}>
              {cerrando ? "Cerrando…" : marcadas.length ? `Cerrar ${marcadas.length === 1 ? "la tarea" : `las ${marcadas.length}`}` : "Cerrar"}
            </BotonAzul>
          </>
        }
      >
        <ul className="divide-y divide-line rounded-lg border border-line">
          {conSugerencia.map((t) => {
            const s = t.cerrar!;
            const marcada = !fuera.has(t.id);
            return (
              <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                <Casilla
                  className="mt-0.5"
                  marcada={marcada}
                  etiqueta={`Cerrar T-${t.numero}`}
                  onCambiar={() =>
                    setFuera((f) => {
                      const n = new Set(f);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => onAbrir(t)} className="text-left text-sm text-fg hover:text-brand">
                    {t.titulo} <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
                  </button>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {t.cliente ? `${t.cliente.nombre} · ` : ""}
                    {s.accion === "descartar" ? "Propuesta: se descarta" : "Pasa a «Ya no se hará»"} · {s.motivo}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
