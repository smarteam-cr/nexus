"use client";

/**
 * YaLaAgende — «Ya la agendé» en una cuenta sin siguiente paso (2026-10-20, decisión de Elías). La persona no da su
 * palabra: elige la reunión de su calendario en un buscador chico, y Nexus la verifica allá antes de contarla como el
 * siguiente paso (POST /api/para-ti/ya-la-agende). Hecho eso, la línea se va de «Lo que importa hoy».
 *
 * Las líneas resueltas viven en la memoria de la pestaña: al recargar «Para ti», la regla de servicio ya ve la reunión.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toast";
import { BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { diaEnCostaRica, elDiaDeLaReunion } from "@/lib/mi-dia/servicio";
import { horaCR } from "@/lib/mi-dia/inicio";
import type { Pendiente } from "@/lib/para-ti/tipos";
import { ENLACE_BOTON } from "./piezas";

interface ReunionParaElegir {
  id: string;
  titulo: string;
  inicio: string;
  deLaCuenta: boolean;
  empresas: string[];
}

/** Sin tildes ni mayúsculas: «Cayala» encuentra «Cayalá». */
const normalizarBusqueda = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/* ── Las líneas ya resueltas (en la pestaña) ── */
let resueltas: ReadonlySet<string> = new Set();
const oyentes = new Set<() => void>();
const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
};
function resolver(clave: string) {
  resueltas = new Set([...resueltas, clave]);
  for (const o of oyentes) o();
}
const VACIO: ReadonlySet<string> = new Set();

/** ¿Esta línea ya se resolvió con «Ya la agendé»? */
export function useYaAgendada(clave: string): boolean {
  return useSyncExternalStore(
    suscribir,
    () => resueltas,
    () => VACIO,
  ).has(clave);
}

export default function YaLaAgende({ it }: { it: Pendiente }) {
  const [abierto, setAbierto] = useState(false);
  if (!it.clientId) return null;
  return (
    <>
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className={ENLACE_BOTON}>
        Ya la agendé
      </button>
      {abierto && <ElegirLaReunion clave={it.clave} clientId={it.clientId} empresa={it.meta.split(" · ")[0]?.trim() || "la cuenta"} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function ElegirLaReunion({ clave, clientId, empresa, onCerrar }: { clave: string; clientId: string; empresa: string; onCerrar: () => void }) {
  const toast = useToast();
  const [datos, setDatos] = useState<{ reuniones: ReunionParaElegir[]; dias: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const hoyISO = diaEnCostaRica(new Date().toISOString());

  useEffect(() => {
    let vivo = true;
    fetch(`/api/para-ti/ya-la-agende?cliente=${encodeURIComponent(clientId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { reuniones?: ReunionParaElegir[]; dias?: number; error?: string } | null;
        if (!vivo) return;
        if (!r.ok || !j?.reuniones) setError(j?.error ?? "No se pudo leer tu calendario.");
        else {
          setError(null);
          setDatos({ reuniones: j.reuniones, dias: j.dias ?? 30 });
        }
      })
      .catch(() => vivo && setError("No se pudo leer tu calendario. Revisa tu conexión."));
    return () => {
      vivo = false;
    };
  }, [clientId, vuelta]);

  const lista = useMemo(() => {
    const n = normalizarBusqueda(q);
    const todas = datos?.reuniones ?? [];
    return n ? todas.filter((r) => normalizarBusqueda(`${r.titulo} ${r.empresas.join(" ")}`).includes(n)) : todas;
  }, [datos, q]);

  async function elegir(r: ReunionParaElegir) {
    setGuardando(r.id);
    try {
      const res = await fetch("/api/para-ti/ya-la-agende", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, eventoId: r.id }) });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "No se pudo guardar.");
        if (res.status === 404) setVuelta((v) => v + 1);
        return;
      }
      toast.success(`Listo: la reunión ${elDiaDeLaReunion(r.inicio, hoyISO)} es el siguiente paso de ${empresa}.`);
      resolver(clave);
      onCerrar();
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className={ROTULO_DEL_SISTEMA}>¿Cuál reunión agendaste con {empresa}?</p>
        <BotonTexto className="p-0" onClick={onCerrar}>
          Cerrar
        </BotonTexto>
      </div>
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca por el título o la empresa"
        aria-label="Buscar la reunión en tu calendario"
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg"
      />
      {error ? (
        <p className="text-[13px] text-danger-ink">{error}</p>
      ) : !datos ? (
        <p className="text-[13px] text-fg-muted">Leyendo tu calendario…</p>
      ) : lista.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-fg-secondary">
            {datos.reuniones.length === 0
              ? `No veo reuniones con otras personas en tu calendario en los próximos ${datos.dias} días.`
              : "Ninguna reunión coincide con lo que buscas."}{" "}
            Si la agendaste recién, vuelve a revisar en un minuto.
          </p>
          <BotonTexto className="self-start p-0" onClick={() => setVuelta((v) => v + 1)}>
            Volver a revisar
          </BotonTexto>
        </div>
      ) : (
        <ul className="flex max-h-64 flex-col overflow-y-auto">
          {lista.slice(0, 30).map((r) => (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                disabled={guardando !== null}
                onClick={() => void elegir(r)}
                className={cn("flex w-full flex-col gap-0.5 px-1.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-60", guardando === r.id && "bg-surface-hover")}
              >
                <span className="text-[13px] font-medium leading-[19px] text-fg">{r.titulo || "Reunión sin título"}</span>
                <span className="text-xs text-fg-muted">
                  {elDiaDeLaReunion(r.inicio, hoyISO)}, {horaCR(r.inicio)}
                  {r.deLaCuenta ? ` · con ${empresa}` : r.empresas.length ? ` · ${r.empresas.join(", ")}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
