import { Link } from 'react-router';
import { Logo } from '../components/Logo';

const benefits = [
  {
    title: 'Instantané',
    text: 'Les messages arrivent en temps réel, sans rafraîchir. Fini les e-mails pour une question rapide.',
  },
  {
    title: 'Rien ne se perd',
    text: 'Badges, notifications et compteurs de non-lus : vous savez exactement ce qui vous attend.',
  },
  {
    title: 'Sous contrôle',
    text: 'Chaque entreprise a son espace. Vous décidez qui accède à quelle conversation.',
  },
];

const plans = [
  {
    name: 'Free',
    price: '0 €',
    period: 'pour toujours',
    features: [
      '10 membres',
      '5 conversations de groupe',
      '90 jours d’historique',
      'Support communautaire',
    ],
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '6 €',
    period: 'par utilisateur / mois',
    features: [
      'Membres illimités',
      'Groupes illimités',
      'Historique illimité',
      'Support prioritaire',
    ],
    highlighted: true,
  },
];

export function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <a href="#pricing" className="hidden text-stone-600 hover:text-ink sm:inline">
            Tarifs
          </a>
          <Link to="/login" className="text-stone-600 hover:text-ink">
            Connexion
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800"
          >
            Essayer maintenant
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-600">
            Messagerie d’équipe temps réel
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Toute votre équipe, <span className="text-brand-500">au même endroit.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600">
            Conversations privées et de groupe, notifications instantanées, accès maîtrisés. Simple
            à adopter, pensé pour les équipes professionnelles.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-block rounded-xl bg-brand-500 px-6 py-3 text-lg font-semibold text-ink shadow hover:bg-brand-400"
          >
            Essayer maintenant — c’est gratuit
          </Link>
          {/* TODO S6 : remplacer par une capture animée (GIF / vidéo) de l’application */}
          <div className="mx-auto mt-14 aspect-video max-w-3xl rounded-2xl border border-stone-200 bg-white shadow-xl" />
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          {benefits.map((b) => (
            <article key={b.title} className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-lg font-semibold">{b.title}</h2>
              <p className="mt-2 text-stone-600">{b.text}</p>
            </article>
          ))}
        </section>

        <section id="pricing" className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Des tarifs simples</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {plans.map((p) => (
              <article
                key={p.name}
                className={`rounded-2xl border p-8 ${
                  p.highlighted
                    ? 'border-brand-500 bg-brand-50 shadow-lg'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="mt-4">
                  <span className="text-4xl font-extrabold">{p.price}</span>{' '}
                  <span className="text-stone-500">{p.period}</span>
                </p>
                <ul className="mt-6 space-y-2 text-stone-700">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`mt-8 block rounded-lg px-4 py-2 text-center font-medium ${
                    p.highlighted
                      ? 'bg-brand-500 text-ink hover:bg-brand-400'
                      : 'bg-ink text-white hover:bg-stone-800'
                  }`}
                >
                  Essayer maintenant
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} BozoChat — projet étudiant
      </footer>
    </div>
  );
}
