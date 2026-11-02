import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = { title: string; onClose: () => void; children: ReactNode };

/**
 * Fenêtre modale sur `<dialog>` natif : focus piégé, Échap et arrière-plan inerte gérés par le
 * navigateur. Plein écran sur téléphone, centrée à partir de `sm`.
 */
export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Pas de close() au nettoyage : il émettrait `close`, donc onClose, et StrictMode (qui monte
  // les effets deux fois en dev) refermerait la fenêtre aussitôt ouverte. Retiré du DOM, un
  // <dialog> quitte de toute façon le mode modal.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Clic sur le fond (le <dialog> lui-même, pas son contenu) : fermeture.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 backdrop:bg-ink/40 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl sm:shadow-xl"
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <h2 id={titleId} className="truncate text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
