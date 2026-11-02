import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Texte du bouton au repos, ex. « Retirer ». */
  label: string;
  /** Question affichée à la place du bouton, ex. « Retirer Julie du groupe ? ». */
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className: string;
};

const CONFIRM =
  'rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60';
const CANCEL = 'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100';

/**
 * Action destructive en deux temps, confirmée sur place plutôt qu'avec `window.confirm` :
 * pas de boîte native par-dessus la modale, et fonctionne aussi là où elle est bloquée.
 * Le focus passe sur « confirmer » pour enchaîner au clavier.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  className,
}: Props) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    // `basis-full` : dans une ligne flex, la question passe dessous au lieu d'écraser le nom.
    <span
      role="group"
      aria-label={question}
      className="flex basis-full flex-wrap items-center gap-2"
    >
      <span className="text-sm text-stone-700">{question}</span>
      <button
        ref={confirmRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className={CONFIRM}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={CANCEL}>
        Annuler
      </button>
    </span>
  );
}
