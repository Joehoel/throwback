import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Throwback — fotobeheer</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        Koppel OneDrive om foto's na te lopen: bijschriften, typefouten en
        scheve scans verbeteren met AI.
      </p>

      <ClientOnly
        fallback={
          <div className="h-11 w-44 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        }
      >
        <ConnectArea />
      </ClientOnly>
    </div>
  )
}

/** Session-dependent UI. Client-only: better-auth's session store has no
 * meaningful value during SSR (the session resolves after hydration). */
function ConnectArea() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="h-11 w-44 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
    )
  }

  if (session?.user) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm">
          Ingelogd als <strong>{session.user.email}</strong>
        </p>
        <button
          onClick={() => void authClient.signOut()}
          className="h-10 rounded border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Uitloggen
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() =>
        void authClient.signIn.social({
          provider: 'microsoft',
          callbackURL: '/',
        })
      }
      className="h-11 rounded bg-[#0067b8] px-6 font-medium text-white hover:bg-[#005da6]"
    >
      OneDrive koppelen
    </button>
  )
}
