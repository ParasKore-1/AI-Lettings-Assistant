import { buildThread, type ConversationWithMessages } from '@keyring/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Play, Smartphone, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { KeyringLogo, Skeleton } from '../../components/ui/misc';
import { startProfiling, stopProfiling } from '../../lib/profiling';
import { cn, queryKeys } from '../../lib/utils';
import { toast } from '../../stores/toasts';
import { MaintenanceTicketCard } from '../chat/cards/MaintenanceTicketCard';
import { PropertyCardGrid } from '../chat/cards/PropertyCard';
import { ViewingSlotPicker } from '../chat/cards/ViewingSlotPicker';
import { EmptyState, SuggestionChip } from '../chat/EmptyState';
import { SUGGESTIONS } from '../chat/suggestions';
import { CodeBlock } from '../chat/markdown/CodeBlock';
import { Markdown } from '../chat/markdown/Markdown';
import { ChatActionsContext, type ChatRowActions } from '../chat/messages/ChatActionsContext';
import { MessageRow, PendingUserMessage, SystemNotice } from '../chat/messages/MessageBubble';
import { BranchSwitcher } from '../chat/messages/MessageActions';
import { ErrorBanner, TypingIndicator } from '../chat/messages/StatusViews';
import { createChatEngine } from '../chat/stream/chatEngine';
import { useStreamStore } from '../chat/stream/streamStore';
import { ChatEngineContext, useChatStream } from '../chat/stream/useChatStream';
import { AttachmentChip } from '../composer/AttachmentChip';
import { Composer } from '../composer/Composer';
import { ConversationListItem } from '../conversations/ConversationListItem';
import { createFakeStreamFetch, PG_CONVERSATION, PG_MARKDOWN, PG_PROPERTIES, PG_TICKET, pgMessage, pgSlots } from './fixtures';

const PG_ID = 'playground';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wider text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

const staticMessages = {
  user: pgMessage({ id: 'pg_u1', role: 'user', content: 'What deposit protection rules apply in England?' }),
  assistant: pgMessage({ id: 'pg_a1', role: 'assistant', parentId: 'pg_u1', content: PG_MARKDOWN, feedback: 'up' }),
  stopped: pgMessage({ id: 'pg_a2', role: 'assistant', content: 'Here is the first part of an answer that the user stopped half-way thro', status: 'stopped' }),
  error: pgMessage({
    id: 'pg_a3',
    role: 'assistant',
    content: 'The partial text stays visible when the connection drops, so nothing is',
    status: 'error',
    error: { code: 'network', message: 'The connection dropped before the reply finished.' },
  }),
  system: pgMessage({ id: 'pg_s1', role: 'system', content: 'Conversation shared — anyone with the link can read it.' }),
};

/** Every component in every state. Rendered once per theme panel. */
function Showcase() {
  const qc = useQueryClient();
  const live = useQuery({
    queryKey: queryKeys.conversation(PG_ID),
    queryFn: () => qc.getQueryData<ConversationWithMessages>(queryKeys.conversation(PG_ID))!,
    staleTime: Infinity,
  });
  const liveThread = useMemo(() => buildThread(live.data?.messages ?? []), [live.data]);
  const slots = useMemo(pgSlots, []);

  return (
    <div className="space-y-8">
      <Section title="Live stream (real engine, fake network)">
        <div className="space-y-5">
          {liveThread.length === 0 && <p className="text-sm text-fg-subtle">Press “Replay stream” above.</p>}
          {liveThread.map((m) => (
            <MessageRow key={m.id} message={m} siblingIndex={0} siblingTotal={1} canEdit={false} />
          ))}
        </div>
      </Section>

      <Section title="Message bubbles">
        <div className="space-y-6">
          <MessageRow message={staticMessages.user} siblingIndex={1} siblingTotal={2} canEdit />
          <MessageRow message={staticMessages.assistant} siblingIndex={0} siblingTotal={3} canEdit />
          <SystemNotice>{staticMessages.system.content}</SystemNotice>
          <MessageRow message={staticMessages.stopped} siblingIndex={0} siblingTotal={1} canEdit />
          <MessageRow message={staticMessages.error} siblingIndex={0} siblingTotal={1} canEdit />
          <PendingUserMessage content="Sending… (optimistic message)" attachments={[]} />
          <div className="flex gap-4">
            <KeyringLogo className="size-7" />
            <TypingIndicator />
          </div>
        </div>
      </Section>

      <Section title="Error & status banners">
        <div className="space-y-2.5">
          <ErrorBanner title="Connection lost mid-reply" description="The partial reply is kept." onRetry={() => toast({ title: 'Retry clicked' })} />
          <ErrorBanner tone="warning" title="Slow down a little" description="Rate limited." retryAt={Date.now() + 9000} onRetry={() => undefined} />
          <ErrorBanner tone="offline" title="You’re offline" description="The reply resumes when you reconnect." />
        </div>
      </Section>

      <Section title="Message actions">
        <div className="flex flex-wrap items-center gap-4">
          <BranchSwitcher index={1} total={3} label="Response" onPrev={() => undefined} onNext={() => undefined} />
        </div>
      </Section>

      <Section title="Composer">
        <div className="space-y-3">
          <Composer draftKey="pg-composer-idle" streaming={false} onSend={() => toast({ title: 'Send clicked' })} onStop={() => undefined} />
          <Composer draftKey="pg-composer-streaming" streaming onSend={() => undefined} onStop={() => toast({ title: 'Stop clicked' })} placeholder="Streaming state — Stop replaces Send" />
          <Composer
            draftKey="pg-composer-offline"
            streaming={false}
            sendBlockedReason="You’re offline — reconnect to send."
            onSend={() => undefined}
            onStop={() => undefined}
          />
        </div>
      </Section>

      <Section title="Attachment chips">
        <div className="flex flex-wrap gap-2">
          <AttachmentChip name="tenancy-agreement.pdf" size={482_000} mimeType="application/pdf" previewUrl={null} progress={0.42} status="uploading" onRemove={() => undefined} />
          <AttachmentChip name="boiler-fault.jpg" size={1_240_000} mimeType="image/jpeg" previewUrl={null} progress={1} status="done" onRemove={() => undefined} />
          <AttachmentChip name="inventory.pdf" size={2_100_000} mimeType="application/pdf" previewUrl={null} progress={1} status="done" onRemove={() => undefined} />
          <AttachmentChip name="too-big.png" size={9_000_000} mimeType="image/png" previewUrl={null} progress={0} status="error" error="Larger than 5 MB" onRemove={() => undefined} />
        </div>
      </Section>

      <Section title="Suggestion chips & empty state">
        <div className="grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.slice(0, 2).map((s) => (
            <SuggestionChip key={s.title} suggestion={s} onPick={(p) => toast({ title: p })} />
          ))}
        </div>
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyState onPick={(p) => toast({ title: p })} />
        </div>
      </Section>

      <Section title="Conversation list items">
        <ul className="w-72 rounded-xl bg-surface-2 py-2">
          <ConversationListItem conversation={{ ...PG_CONVERSATION, id: 'pg-c1', title: 'Deposit protection rules', pinned: true }} onRename={() => undefined} onTogglePin={() => undefined} onDelete={() => undefined} />
          <ConversationListItem conversation={{ ...PG_CONVERSATION, id: 'pg-c2', title: 'Booking a viewing' }} streaming onRename={() => undefined} onTogglePin={() => undefined} onDelete={() => undefined} />
          <ConversationListItem conversation={{ ...PG_CONVERSATION, id: 'pg-c3', title: 'A very long conversation title that needs truncating nicely' }} onRename={() => undefined} onTogglePin={() => undefined} onDelete={() => undefined} />
        </ul>
      </Section>

      <Section title="Markdown & code">
        <Markdown text={PG_MARKDOWN} />
        <CodeBlock lang="csv" code={'Tenant,Rent,Due\nA. Okafor,1450,2026-12-01'} />
      </Section>

      <Section title="Tool result cards">
        <PropertyCardGrid properties={PG_PROPERTIES} onBookViewing={(p) => toast({ title: `Book ${p.address}` })} />
        <ViewingSlotPicker propertyTitle="Bright two-bed flat — Flat 4, 27 Wrenfield Road" slots={slots} onConfirm={() => undefined} />
        <ViewingSlotPicker propertyTitle="Confirmed state" slots={slots} initialConfirmedId={slots[0]!.id} />
        <MaintenanceTicketCard ticket={PG_TICKET} />
        <MaintenanceTicketCard ticket={{ ...PG_TICKET, id: 'pg_t2', reference: 'KR-10442', priority: 'emergency', status: 'scheduled', title: 'Gas smell in kitchen' }} />
      </Section>

      <Section title="Skeletons">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
        </div>
      </Section>
    </div>
  );
}

function Panel({ theme, mobile, children }: { theme: 'light' | 'dark'; mobile: boolean; children: ReactNode }) {
  return (
    <div
      data-theme={theme}
      className={cn('min-w-0 rounded-3xl border border-border bg-bg p-4 text-fg sm:p-6', mobile && 'mx-auto w-full max-w-[390px]')}
    >
      <p className="mb-5 text-sm font-semibold capitalize">{theme} theme</p>
      {children}
    </div>
  );
}

function ReplayControls() {
  const chat = useChatStream(PG_ID);
  const qc = useQueryClient();
  const [counts, setCounts] = useState<[string, number][] | null>(null);
  const [profiling, setProfiling] = useState(false);
  const busy = chat.phase === 'sending' || chat.phase === 'streaming';

  useEffect(() => {
    if (!profiling) return;
    const map = startProfiling();
    const t = setInterval(() => setCounts([...map.entries()].sort()), 300);
    return () => {
      clearInterval(t);
      stopProfiling();
    };
  }, [profiling]);

  const replay = () => {
    qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(PG_ID), { conversation: PG_CONVERSATION, messages: [] });
    useStreamStore.getState().reset(PG_ID);
    globalThis.__KR_PROFILE__?.clear();
    void chat.send('Draft a rent reminder for Sam', { parentId: null });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button leading={<Play className="size-4" />} onClick={replay} disabled={busy}>
        Replay stream
      </Button>
      {busy && (
        <Button variant="outline" onClick={chat.stop}>
          Stop
        </Button>
      )}
      {chat.phase === 'error' && (
        <Button variant="outline" onClick={() => void chat.retry()}>
          Retry
        </Button>
      )}
      <label className="ml-2 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={profiling} onChange={(e) => setProfiling(e.target.checked)} />
        <Activity className="size-4 text-fg-subtle" aria-hidden="true" /> Show render counts
      </label>
      {profiling && counts && (
        <output className="w-full rounded-xl bg-surface-3 p-3 font-mono text-xs">
          {counts.length === 0 ? 'Replay to collect counts…' : counts.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
        </output>
      )}
    </div>
  );
}

export function PlaygroundPage() {
  const qc = useQueryClient();
  const [mobile, setMobile] = useState(false);
  const [dropConnection, setDropConnection] = useState(false);
  const engine = useMemo(
    () => createChatEngine({ queryClient: qc, fetch: createFakeStreamFetch({ tokenMs: 35, failAt: dropConnection ? 30 : null }) }),
    [qc, dropConnection],
  );

  const actions = useMemo<ChatRowActions>(
    () => ({
      conversationId: PG_ID,
      readOnly: false,
      regenerate: () => toast({ title: 'Regenerate clicked' }),
      resume: (id) => void engine.start(PG_ID, { intent: 'resume', assistantMessageId: id }),
      retry: () => toast({ title: 'Retry clicked' }),
      editAndResend: (_m, text) => toast({ title: `Edit & resend: ${text}` }),
      stepSibling: () => undefined,
      setFeedback: () => undefined,
      sendFollowUp: (text) => toast({ title: text }),
    }),
    [engine],
  );

  useEffect(() => {
    document.title = 'Component playground · Keyring';
    if (!qc.getQueryData(queryKeys.conversation(PG_ID))) {
      qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(PG_ID), { conversation: PG_CONVERSATION, messages: [] });
    }
  }, [qc]);

  return (
    <ChatEngineContext.Provider value={engine}>
      <ChatActionsContext.Provider value={actions}>
        <div className="kr-scroll h-full overflow-y-auto">
          <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <Link to="/" className="flex items-center gap-2">
                <KeyringLogo />
                <span className="font-semibold">Keyring</span>
              </Link>
              <h1 className="text-sm text-fg-muted">Component playground</h1>
              <span className="flex-1" />
              <Button
                size="sm"
                variant={mobile ? 'primary' : 'outline'}
                aria-pressed={mobile}
                leading={<Smartphone className="size-4" />}
                onClick={() => setMobile((m) => !m)}
              >
                Mobile width
              </Button>
              <Button
                size="sm"
                variant={dropConnection ? 'primary' : 'outline'}
                aria-pressed={dropConnection}
                leading={<Unplug className="size-4" />}
                onClick={() => setDropConnection((d) => !d)}
              >
                Drop connection mid-stream
              </Button>
            </div>
            <div className="mx-auto max-w-[1500px] px-4 pb-3 sm:px-6">
              <ReplayControls />
            </div>
          </header>
          <div className={cn('mx-auto grid max-w-[1500px] gap-6 p-4 sm:p-6', !mobile && 'xl:grid-cols-2')}>
            <Panel theme="light" mobile={mobile}>
              <Showcase />
            </Panel>
            <Panel theme="dark" mobile={mobile}>
              <Showcase />
            </Panel>
          </div>
        </div>
      </ChatActionsContext.Provider>
    </ChatEngineContext.Provider>
  );
}
