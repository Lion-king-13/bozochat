import { useId, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

/** Champ de formulaire accessible : label associé, erreur annoncée aux lecteurs d'écran. */
export function Field({ label, error, ...input }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-3 py-2 outline-none transition focus:ring-2 focus:ring-brand-400 ${
          error ? 'border-red-500' : 'border-stone-300'
        }`}
        {...input}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
