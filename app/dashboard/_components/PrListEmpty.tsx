export function PrListEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
      <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
        Aucune PR pour l&apos;instant
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Ouvre une pull request sur GitHub pour déclencher une analyse.
      </p>
    </div>
  );
}
