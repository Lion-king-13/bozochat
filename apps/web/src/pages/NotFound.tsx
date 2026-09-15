import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Page introuvable</h1>
      <Link to="/" className="text-brand-600">
        Retour à l’accueil
      </Link>
    </div>
  );
}
