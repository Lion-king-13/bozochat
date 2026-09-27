import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useLogout } from '../lib/auth';

/**
 * Menu du compte. Volontairement sans bibliothèque : un bouton, une liste `role="menu"`,
 * et les trois façons attendues de refermer (clic extérieur, Échap, choix d'une entrée).
 * L'icône est faite de trois barres qui pivotent d'un quart de tour à l'ouverture —
 * jamais de croix, jamais un nombre de barres différent.
 */
export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /** Déplace le focus d'une entrée à l'autre, en bouclant. */
  function moveFocus(delta: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    const from = current === -1 ? (delta > 0 ? -1 : 0) : current;
    items[(from + delta + items.length) % items.length]?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
    // Le menu n'est monté qu'au rendu suivant : on attend avant de viser une entrée.
    requestAnimationFrame(() => moveFocus(event.key === 'ArrowDown' ? 1 : -1));
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1);
  }

  function onLogout() {
    setOpen(false);
    logout.mutate(undefined, { onError: () => toast.error('La déconnexion a échoué.') });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 hover:bg-stone-100"
      >
        {/* Taille fixe : la rotation ne déplace jamais l'en-tête. */}
        <span
          aria-hidden="true"
          className={`flex h-3.5 w-4 flex-col justify-between transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
        >
          <span className="block h-0.5 w-full rounded-full bg-stone-700" />
          <span className="block h-0.5 w-full rounded-full bg-stone-700" />
          <span className="block h-0.5 w-full rounded-full bg-stone-700" />
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Menu du compte"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-10 mt-2 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-sm"
        >
          <Link
            role="menuitem"
            to="/app/settings/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
          >
            Profil
          </Link>
          <div className="my-1 border-t border-stone-200" />
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            className="block w-full px-3 py-2 text-left hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
