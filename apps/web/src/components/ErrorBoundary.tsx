import { Component, type ReactNode } from 'react';

/** Dernier filet de sécurité : jamais d'écran blanc ni de stack trace pour l'utilisateur. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <h1 className="text-2xl font-bold">Oups, quelque chose s’est mal passé.</h1>
        <p className="text-stone-600">
          Rechargez la page. Si le problème persiste, réessayez plus tard.
        </p>
        <button
          onClick={() => location.reload()}
          className="rounded-lg bg-ink px-4 py-2 text-white"
        >
          Recharger
        </button>
      </div>
    );
  }
}
