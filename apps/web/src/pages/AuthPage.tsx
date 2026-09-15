import { loginSchema, registerSchema } from '@bozochat/shared';
import type { ZodType } from 'zod';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Field } from '../components/Field';
import { Logo } from '../components/Logo';
import { ApiRequestError } from '../lib/api';
import { useLogin, useMe, useRegister } from '../lib/auth';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === 'login' ? login : register;

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (me.data) return <Navigate to="/app" replace />;

  function validate<T>(schema: ZodType<T>, data: unknown): T | null {
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    setFieldErrors(errors);
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));

    // 1. Validation côté client avec les mêmes schémas que le serveur
    // 2. Appel API — les erreurs serveur sont affichées proprement
    try {
      if (mode === 'login') {
        const input = validate(loginSchema, data);
        if (!input) return;
        await login.mutateAsync(input);
      } else {
        const input = validate(registerSchema, data);
        if (!input) return;
        await register.mutateAsync(input);
      }
      navigate('/app');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors ?? {});
        if (!err.fieldErrors) setFormError(err.message);
      } else {
        setFormError('Une erreur inattendue est survenue.');
      }
    }
  }

  const isLogin = mode === 'login';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8">
        <Logo />
      </div>
      <form
        noValidate
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">{isLogin ? 'Connexion' : 'Créer un compte'}</h1>

        {formError && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        {!isLogin && (
          <Field
            label="Nom affiché"
            name="displayName"
            autoComplete="name"
            error={fieldErrors.displayName}
          />
        )}
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <Field
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          error={fieldErrors.password}
        />

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {mutation.isPending ? 'Patientez…' : isLogin ? 'Se connecter' : 'Créer mon compte'}
        </button>

        <p className="text-center text-sm text-stone-600">
          {isLogin ? (
            <>
              Pas encore de compte ?{' '}
              <Link to="/register" className="font-medium text-brand-600">
                Inscrivez-vous
              </Link>
            </>
          ) : (
            <>
              Déjà inscrit ?{' '}
              <Link to="/login" className="font-medium text-brand-600">
                Connectez-vous
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
