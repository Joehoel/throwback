import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/lib/auth-server'

/**
 * Verification endpoint: proves we can exchange the better-auth session for a
 * Microsoft Graph access token (with Files.ReadWrite) and call OneDrive.
 * Open while logged in: GET /api/drive
 */
export const Route = createFileRoute('/api/drive')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) {
          return Response.json({ error: 'not logged in' }, { status: 401 })
        }

        const token = await auth.api.getAccessToken({
          body: { providerId: 'microsoft' },
          headers: request.headers,
        })
        const accessToken = token?.accessToken
        if (!accessToken) {
          return Response.json(
            { error: 'no access token', tokenResult: token },
            { status: 500 },
          )
        }

        const res = await fetch(
          'https://graph.microsoft.com/v1.0/me/drive/root?$select=id,name,webUrl,folder',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        const drive = await res.json()
        return Response.json({ graphStatus: res.status, drive })
      },
    },
  },
})
