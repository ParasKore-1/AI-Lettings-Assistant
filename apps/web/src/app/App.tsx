import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, Link, RouterProvider, useParams } from 'react-router-dom';
import { Toaster } from '../components/ui/Toaster';
import { Spinner } from '../components/ui/misc';
import { useAppearance, useVisualViewportHeight } from '../hooks/useAppearance';
import { createQueryClient } from '../lib/queryClient';
import { ChatScreen } from '../features/chat/ChatScreen';
import { createChatEngine } from '../features/chat/stream/chatEngine';
import { ChatEngineContext } from '../features/chat/stream/useChatStream';
import { AppShell } from '../features/layout/AppShell';

const SharePage = lazy(() => import('../features/share/SharePage').then((m) => ({ default: m.SharePage })));
const PlaygroundPage = lazy(() =>
  import('../features/playground/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })),
);

function ChatRoute() {
  const { id } = useParams();
  // key: a different conversation gets a fresh screen (scroll position, edit state…)
  return <ChatScreen key={id} conversationId={id} />;
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-3 inline-block text-accent underline">
          Back to Keyring
        </Link>
      </div>
    </div>
  );
}

const Fallback = () => (
  <div className="grid h-full place-items-center">
    <Spinner className="size-6 text-accent" />
  </div>
);

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <ChatScreen key="new" /> },
      { path: '/c/:id', element: <ChatRoute /> },
    ],
  },
  {
    path: '/share/:id',
    element: (
      <Suspense fallback={<Fallback />}>
        <SharePage />
      </Suspense>
    ),
  },
  {
    path: '/playground',
    element: (
      <Suspense fallback={<Fallback />}>
        <PlaygroundPage />
      </Suspense>
    ),
  },
  { path: '*', element: <NotFound /> },
],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [engine] = useState(() => createChatEngine({ queryClient }));
  useAppearance();
  useVisualViewportHeight();

  return (
    <QueryClientProvider client={queryClient}>
      <ChatEngineContext.Provider value={engine}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <Toaster />
      </ChatEngineContext.Provider>
    </QueryClientProvider>
  );
}
