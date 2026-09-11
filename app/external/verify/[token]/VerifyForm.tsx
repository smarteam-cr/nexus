"use client";

/**
 * Form de verificación del cliente externo.
 *
 * Único input: contraseña. POST a /external/verify-access con { token, password }.
 * Estados:
 *   - idle:        form visible
 *   - loading:     mientras llega la respuesta
 *   - success:     muestra "Entrando a <proyecto> · <cliente>"
 *   - denied:      "Token o contraseña incorrectos"
 *   - rateLimited: "Demasiados intentos. Probá en N minutos"
 *   - error:       error de red u otro caso inesperado
 *
 * REGLA: este componente NO debe importar de librerías que carguen recursos
 * externos (analytics, error tracking de terceros, etc.). Solo React + Tailwind.
 */
import { useState, FormEvent } from "react";
import { IconCheck } from "@/components/ui/AcceptReject";
import { esIdDeAcceso, rutaDeSuperficie, superficieDeNext } from "@/lib/external/rutas";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; proyecto: string; cliente: string }
  | { kind: "denied" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "error" };

/**
 * Destino post-verify: la dirección de ESTE proyecto en la superficie que pide el enlace
 * (`?next=`, lista cerrada — lib/external/rutas.ts). El id lo manda el servidor y se valida acá:
 * nada del parámetro ni de la respuesta se interpola en una URL sin pasar por `rutaDeSuperficie`.
 *
 * Antes el destino era `/external/<superficie>` sin proyecto: quedaba en la barra con cara de
 * compartible y, reenviado, mostraba el último proyecto que había abierto el navegador de quien lo
 * recibía (incidente del 2026-09-10).
 */
export function VerifyForm({ token, next }: { token: string; next?: string }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.kind === "loading" || !password) return;

    setState({ kind: "loading" });

    try {
      const res = await fetch("/external/verify-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data?.ok) {
        // Sin un id válido no hay a dónde ir: mejor un error que una dirección armada con basura.
        if (!esIdDeAcceso(data.acceso)) {
          setState({ kind: "error" });
          return;
        }
        setPassword("");
        setState({
          kind: "success",
          proyecto: typeof data.proyecto === "string" ? data.proyecto : "",
          cliente: typeof data.cliente === "string" ? data.cliente : "",
        });
        // La credencial httpOnly ya la sumó el endpoint. Navegación full (no router.push) para
        // que el server component de destino la lea.
        window.location.assign(rutaDeSuperficie(data.acceso, superficieDeNext(next)));
        return;
      }
      if (res.status === 429) {
        setState({
          kind: "rateLimited",
          retryAfterSeconds: typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : 600,
        });
        return;
      }
      // 401 u otro — mensaje genérico (no revelar si era token o pass)
      setState({ kind: "denied" });
    } catch {
      setState({ kind: "error" });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (state.kind === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
            <IconCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Acceso concedido
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {state.proyecto ? (
                <>
                  Entrando a <span className="font-medium text-gray-900">{state.proyecto}</span>
                  {state.cliente && <> · {state.cliente}</>}…
                </>
              ) : (
                <>Entrando al proyecto…</>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
    >
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={state.kind === "loading" || state.kind === "rateLimited"}
          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="Pega la contraseña aquí"
        />
      </div>

      {state.kind === "denied" && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700">
            Token o contraseña incorrectos.
          </p>
        </div>
      )}

      {state.kind === "rateLimited" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-700">
            Demasiados intentos. Probá de nuevo en{" "}
            <span className="font-semibold">
              {formatRetryAfter(state.retryAfterSeconds)}
            </span>
            .
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2">
          <p className="text-xs text-gray-700">
            No se pudo verificar el acceso. Probá de nuevo en unos segundos.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={state.kind === "loading" || state.kind === "rateLimited" || !password}
        className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {state.kind === "loading" ? "Verificando…" : "Acceder"}
      </button>
    </form>
  );
}

function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}
