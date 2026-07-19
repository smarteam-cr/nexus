"use client";

/**
 * components/clients/CanvasBoundary.tsx
 *
 * Error boundary POR CANVAS dentro del workspace del cliente. Un canvas con
 * data inesperada (snapshot viejo, shape que evolucionó, bug de un renderer)
 * deja de tumbar el workspace ENTERO: cae solo ese canvas, con los tabs, el
 * header y el resto del panel intactos.
 *
 * Es un class component porque React solo expone getDerivedStateFromError en
 * clases — no hay hook equivalente. "Reintentar" limpia el estado y re-monta
 * los children (suficiente para errores transitorios de fetch/hidratación);
 * si el error es determinista, vuelve a caer acá y no más arriba.
 */
import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  /** Nombre visible del canvas ("Kickoff", "Cronograma"…) para el fallback. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class CanvasBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error, { tags: { canvas: this.props.label } }); // no-op sin DSN
    console.error(`[canvas boundary] ${this.props.label}:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full rounded-2xl border border-line bg-surface px-6 py-6 text-center">
          <h3 className="text-sm font-bold text-fg">
            No se pudo cargar {this.props.label}
          </h3>
          <p className="mt-1.5 text-xs text-fg-muted">
            El resto del workspace sigue disponible. Probá reintentar; si
            persiste, recargá la página.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 text-xs font-semibold text-white bg-brand hover:bg-brand-dark px-3.5 py-2 rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
