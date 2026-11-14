import { buildThread } from '@keyring/shared';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { KeyringLogo, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { formatDateTime, queryKeys } from '../../lib/utils';
import { ChatActionsContext, READ_ONLY_ACTIONS } from '../chat/messages/ChatActionsContext';
import { MessageList } from '../chat/messages/MessageList';

/** Public read-only view of a shared conversation (default branch only). */
export function SharePage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: queryKeys.shared(id), queryFn: () => api.getShared(id), retry: false });
  const thread = useMemo(() => buildThread(query.data?.messages ?? []), [query.data]);

  useEffect(() => {
    if (query.data) document.title = `${query.data.conversation.title} · Shared on Keyring`;
  }, [query.data]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="flex items-center gap-2" aria-label="Keyring home">
          <KeyringLogo className="size-7" />
          <span className="font-semibold tracking-tight">Keyring</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-xs text-fg-muted">
          <Eye className="size-3.5" aria-hidden="true" /> Read-only
        </span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => (window.location.href = '/')}>
          Start your own chat
        </Button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {query.isPending ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-6 pt-10" role="status" aria-label="Loading">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24" />
          </div>
        ) : query.isError ? (
          <div className="mx-auto max-w-md px-6 pt-[18vh] text-center">
            <h1 className="text-xl font-semibold">This chat isn’t available</h1>
            <p className="mt-2 text-fg-muted">The owner may have stopped sharing it.</p>
          </div>
        ) : (
          <>
            <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
              <h1 className="text-xl font-semibold tracking-tight">{query.data.conversation.title}</h1>
              <p className="text-sm text-fg-subtle">Shared conversation · {formatDateTime(query.data.conversation.updatedAt)}</p>
            </div>
            <ChatActionsContext.Provider value={READ_ONLY_ACTIONS}>
              <MessageList
                conversationId={`share:${id}`}
                messages={query.data.messages}
                thread={thread}
                streaming={false}
                canEdit={false}
              />
            </ChatActionsContext.Provider>
          </>
        )}
      </main>
    </div>
  );
}
