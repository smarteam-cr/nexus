"use client";

/**
 * Form de verificación del cliente externo.
 *
 * Único input: contraseña. POST a /api/external/verify-access con { token, password }.
 * Estados:
 *   - idle:        form visible
 *   - loading:     mientras llega la respuesta
 *   - success:     muestra "Acceso concedido al proyecto: X"
 *   - denied:      "Token o contraseña incorrectos"
 *   - rateLimited: "Demasiados intentos. Probá en N minutos"
 *   - error:       error de red u otro caso inesperado
 *
 * REGLA: este componente NO debe importar de librerías que carguen recursos
 * externos (analytics, error tracking de terceros, etc.). Solo React + Tailwind.
 */
import { useState, FormEvent } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; projectName: string }
  | { kind: "denied" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "error" };

/**
 * Destino post-verify por superficie (D.1.5) — WHITELIST CERRADA: el param
 * `next` jamás se interpola en la URL (nada de open redirect). Default kickoff
 * para los links ya compartidos sin param.
 */
const SURFACE_PATHS: Record<string, string> = {
  kickoff: "/external/kickoff",
  cronograma: "/external/cronograma",
};

export function VerifyForm({ token, next }: { token: string; next?: string }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.kind === "loading" || !password) return;

    setState({ kind: "loading" });

    try {
      const res = await fetch("/api/external/verify-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data?.ok) {
        setPassword("");
        setState({ kind: "success", projectName: data.projectName ?? "" });
        // La cookie httpOnly ya la seteó el endpoint. Navegación full (no
        // router.push) para que el server component de destino la lea. El
        // destino sale de la whitelist según el link que abrió el cliente.
        window.location.assign(SURFACE_PATHS[next ?? ""] ?? SURFACE_PATHS.kickoff);
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
            ✓
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Acceso concedido
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {state.projectName ? (
                <>Entrando a <span className="font-medium text-gray-900">{state.projectName}</span>…</>
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
          placeholder="Pegá la contraseña aquí"
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
