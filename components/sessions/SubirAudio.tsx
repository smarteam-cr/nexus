"use client";

/**
 * SubirAudio — sube la grabación de una reunión presencial y la deja transcribiéndose (T5, 2026-10-25). Solo se muestra
 * con la transcripción de audio prendida (REUNIONES_AUDIO=1).
 *
 * Tres pasos: POST /api/sessions/[id]/audio abre la subida; el navegador sube el archivo DIRECTO a Google Cloud Storage
 * (con su barra de avance: nginx corta en 1 MB y un audio pesa decenas); POST .../audio/subido pide la transcripción.
 * Mientras Google transcribe, mira el estado cada 20 segundos y refresca la página cuando el texto llegó. Las reglas:
 * lib/sessions/audio-de-reunion.ts.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import { ACEPTA_AUDIO, USD_POR_MINUTO_DE_AUDIO, estadoDelAudioParaLaPersona, problemaDelAudio, type EstadoDelAudio } from "@/lib/sessions/audio-de-reunion";

export interface AudioVisto {
  estado: EstadoDelAudio;
  archivo: string;
  error: string | null;
  minutos: number | null;
}

/** Sube el archivo con un PUT a la dirección de Google, con avance. */
function subirA(destino: string, archivo: File, alAvanzar: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", destino);
    xhr.setRequestHeader("Content-Type", archivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alAvanzar(Math.round((100 * e.loaded) / e.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Google respondió ${xhr.status} al subir el audio.`)));
    xhr.onerror = () => reject(new Error("Se cortó la conexión subiendo el audio. Vuelve a intentarlo."));
    xhr.send(archivo);
  });
}

export function SubirAudio({ sessionId, inicial, alTerminarLaSubida }: { sessionId: string; inicial: AudioVisto | null; alTerminarLaSubida?: () => void }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [audio, setAudio] = useState<AudioVisto | null>(inicial);
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mientras Google transcribe, se mira cada 20 segundos; cuando termina, la página se refresca con el texto.
  const transcribiendo = audio?.estado === "TRANSCRIBIENDO";
  useEffect(() => {
    if (!transcribiendo) return;
    const t = setInterval(() => {
      fetchJson<{ audio: AudioVisto | null }>(`/api/sessions/${encodeURIComponent(sessionId)}/audio`)
        .then(({ audio: a }) => {
          setAudio(a);
          if (a?.estado === "LISTO") router.refresh();
        })
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, [transcribiendo, sessionId, router]);

  async function subir(archivo: File) {
    setError(null);
    const problema = problemaDelAudio({ archivo: archivo.name, bytes: archivo.size, tipo: archivo.type });
    if (problema) {
      setError(problema);
      return;
    }
    try {
      setAvance(0);
      const base = `/api/sessions/${encodeURIComponent(sessionId)}/audio`;
      const { subida } = await fetchJson<{ subida: string }>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo: archivo.name, tipo: archivo.type, bytes: archivo.size }),
      });
      await subirA(subida, archivo, setAvance);
      await fetchJson(`${base}/subido`, { method: "POST" });
      setAudio({ estado: "TRANSCRIBIENDO", archivo: archivo.name, error: null, minutos: null });
      alTerminarLaSubida?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el audio.");
    } finally {
      setAvance(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  const ocupado = avance !== null || transcribiendo;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={entrada}
          type="file"
          accept={ACEPTA_AUDIO}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
        />
        <Button variant="secondary" size="sm" disabled={ocupado} loading={avance !== null} onClick={() => entrada.current?.click()}>
          {audio?.estado === "ERROR" ? "Subir el audio otra vez" : "Subir el audio de la reunión"}
        </Button>
        <span className="text-xs text-fg-muted">
          .m4a, .mp3, .wav… La transcribe Google (unos US${(USD_POR_MINUTO_DE_AUDIO * 60).toFixed(2)} por hora de audio) y Nexus la lee como cualquier reunión.
        </span>
      </div>
      {avance !== null && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${avance}%` }} />
          </div>
          <p className="text-xs text-fg-muted">Subiendo el audio… {avance} %. No cierres esta página hasta que termine.</p>
        </div>
      )}
      {audio && avance === null && (
        <p className={audio.estado === "ERROR" ? "text-xs text-warn-ink" : "text-xs text-fg-secondary"}>
          {audio.archivo ? `«${audio.archivo}»: ` : ""}
          {estadoDelAudioParaLaPersona(audio)}
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );
}
