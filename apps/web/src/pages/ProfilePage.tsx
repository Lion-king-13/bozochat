import {
  changeEmailSchema,
  changePasswordSchema,
  updateProfileSchema,
  type PublicUser,
} from '@bozochat/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ZodError } from 'zod';
import { Field } from '../components/Field';
import { ApiRequestError } from '../lib/api';
import { useMe } from '../lib/auth';
import { initials } from '../lib/format';
import { useChangeEmail, useChangePassword, useUpdateProfile } from '../lib/profile';

const CARD = 'space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm';
const SUBMIT =
  'rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60';

/** Erreurs des trois formulaires : mêmes règles d'affichage que la page de connexion. */
function useFormErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  return {
    fieldErrors,
    formError,
    reset() {
      setFieldErrors({});
      setFormError(null);
    },
    /** Validation locale : les messages viennent des schémas partagés avec le serveur. */
    fromZod(error: ZodError) {
      const errors: Record<string, string> = {};
      for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errors);
    },
    setField(field: string, message: string) {
      setFieldErrors({ [field]: message });
    },
    fromApi(error: unknown) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fieldErrors ?? {});
        if (!error.fieldErrors) setFormError(error.message);
      } else {
        setFormError('Une erreur inattendue est survenue.');
      }
    },
  };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

/** Aperçu de la photo : image si elle se charge, initiales sinon (URL absente ou cassée). */
function AvatarPreview({ url, displayName }: { url: string; displayName: string }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const trimmed = url.trim();

  if (trimmed && brokenUrl !== trimmed) {
    return (
      <img
        src={trimmed}
        alt=""
        onError={() => setBrokenUrl(trimmed)}
        className="h-16 w-16 rounded-full border border-stone-200 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-600"
    >
      {initials(displayName)}
    </span>
  );
}

function IdentityForm({ me }: { me: PublicUser }) {
  const update = useUpdateProfile();
  const errors = useFormErrors();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl ?? '');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.reset();
    // Un champ vide retire la photo : `null` est la valeur attendue par l'API.
    const parsed = updateProfileSchema.safeParse({
      displayName,
      avatarUrl: avatarUrl.trim() === '' ? null : avatarUrl,
    });
    if (!parsed.success) {
      errors.fromZod(parsed.error);
      return;
    }
    try {
      const user = await update.mutateAsync(parsed.data);
      // On repart des valeurs enregistrées (nom découpé, adresse normalisée).
      setDisplayName(user.displayName);
      setAvatarUrl(user.avatarUrl ?? '');
      toast.success('Profil mis à jour.');
    } catch (error) {
      errors.fromApi(error);
    }
  }

  async function removeAvatar() {
    errors.reset();
    try {
      await update.mutateAsync({ avatarUrl: null });
      setAvatarUrl('');
      toast.success('Photo de profil retirée.');
    } catch (error) {
      errors.fromApi(error);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className={CARD}>
      <h2 className="font-semibold">Identité</h2>
      <FormError message={errors.formError} />

      <div className="flex items-center gap-4">
        <AvatarPreview url={avatarUrl} displayName={displayName || me.displayName} />
        {me.avatarUrl && (
          <button
            type="button"
            onClick={() => void removeAvatar()}
            disabled={update.isPending}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60"
          >
            Retirer la photo
          </button>
        )}
      </div>

      <Field
        label="Nom affiché"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        autoComplete="name"
        error={errors.fieldErrors.displayName}
      />
      <Field
        label="Photo de profil (adresse http ou https)"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="https://exemple.test/photo.png"
        inputMode="url"
        error={errors.fieldErrors.avatarUrl}
      />

      <button type="submit" disabled={update.isPending} className={SUBMIT}>
        {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}

function EmailForm({ me }: { me: PublicUser }) {
  const change = useChangeEmail();
  const errors = useFormErrors();
  const [email, setEmail] = useState(me.email);
  const [currentPassword, setCurrentPassword] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.reset();
    const parsed = changeEmailSchema.safeParse({ email, currentPassword });
    if (!parsed.success) {
      errors.fromZod(parsed.error);
      return;
    }
    try {
      const user = await change.mutateAsync(parsed.data);
      setEmail(user.email);
      setCurrentPassword('');
      toast.success('Adresse e-mail mise à jour.');
    } catch (error) {
      errors.fromApi(error);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className={CARD}>
      <h2 className="font-semibold">Adresse e-mail</h2>
      <p className="text-sm text-stone-600">
        Votre mot de passe actuel est demandé : cette adresse sert à vous connecter.
      </p>
      <FormError message={errors.formError} />

      <Field
        label="Adresse e-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        error={errors.fieldErrors.email}
      />
      <Field
        label="Mot de passe actuel"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
        error={errors.fieldErrors.currentPassword}
      />

      <button type="submit" disabled={change.isPending} className={SUBMIT}>
        {change.isPending ? 'Mise à jour…' : "Changer l'adresse"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const errors = useFormErrors();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.reset();
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      errors.fromZod(parsed.error);
      return;
    }
    if (newPassword !== confirmPassword) {
      errors.setField('confirmPassword', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    try {
      await change.mutateAsync(parsed.data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Mot de passe mis à jour.');
    } catch (error) {
      errors.fromApi(error);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className={CARD}>
      <h2 className="font-semibold">Mot de passe</h2>
      <p className="text-sm text-stone-600">Vous restez connecté après le changement.</p>
      <FormError message={errors.formError} />

      <Field
        label="Mot de passe actuel"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
        error={errors.fieldErrors.currentPassword}
      />
      <Field
        label="Nouveau mot de passe"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        error={errors.fieldErrors.newPassword}
      />
      <Field
        label="Confirmer le nouveau mot de passe"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        error={errors.fieldErrors.confirmPassword}
      />

      <button type="submit" disabled={change.isPending} className={SUBMIT}>
        {change.isPending ? 'Mise à jour…' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}

export function ProfilePage() {
  const me = useMe();
  if (!me.data) return null;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Profil</h1>
          <Link
            to="/app"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            Retour au chat
          </Link>
        </div>

        <IdentityForm me={me.data} />
        <EmailForm me={me.data} />
        <PasswordForm />
      </div>
    </section>
  );
}
