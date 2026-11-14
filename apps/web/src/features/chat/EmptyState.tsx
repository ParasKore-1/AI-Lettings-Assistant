import { KeyringLogo } from '../../components/ui/misc';
import { SUGGESTIONS, type Suggestion } from './suggestions';


export function SuggestionChip({ suggestion, onPick }: { suggestion: Suggestion; onPick: (prompt: string) => void }) {
  const Icon = suggestion.icon;
  return (
    <button
      type="button"
      onClick={() => onPick(suggestion.prompt)}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm shadow-card transition-colors hover:border-accent/50 hover:bg-accent-soft"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-muted transition-colors group-hover:bg-surface group-hover:text-accent">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="font-medium">{suggestion.title}</span>
    </button>
  );
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-[8vh] pb-8 text-center sm:px-6 sm:pt-[14vh]">
      <KeyringLogo className="size-12" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}.</h1>
      <p className="mt-2 max-w-md text-fg-muted">
        I’m Keyring — ask me about tenancies, deposits, viewings or repairs. I can draft letters and log tickets too.
      </p>
      <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <SuggestionChip key={s.title} suggestion={s} onPick={onPick} />
        ))}
      </div>
      <p className="mt-6 text-xs text-fg-subtle">
        Keyring is a fictional demo. Listings are invented and answers are general information, not legal advice.
      </p>
    </div>
  );
}
