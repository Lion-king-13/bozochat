/** État initial de `/app` : sur mobile la liste occupe l'écran, ce panneau est donc masqué. */
export function EmptyState() {
  return (
    <section className="hidden flex-1 items-center justify-center p-8 text-center sm:flex">
      <div>
        <h1 className="text-2xl font-bold">Sélectionnez une conversation</h1>
        <p className="mt-2 text-stone-600">
          Choisissez une conversation dans la liste pour afficher les messages.
        </p>
      </div>
    </section>
  );
}
