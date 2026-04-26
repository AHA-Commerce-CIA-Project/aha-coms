import { Elysia } from 'elysia'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Readable } from 'node:stream'
import { app } from './src/index'
// SvelteKit's adapter-node emits `build/handler.js` exporting `handler` — a
// Connect/Polka-style Node middleware `(req, res, next)`. We bridge it to a
// WHATWG Fetch handler so Elysia can serve SSR alongside `/api/*` on a single
// port. (Bun's node:http compat is solid enough for this static shim.)
//
// `handler.js` is a build artifact with no `.d.ts`; the ts-expect-error keeps
// us honest about the missing types without scattering ambient declarations.
// The local `NodeMiddleware` type below pins what we actually need from it.
// @ts-expect-error — no types emitted by adapter-node
import { handler as svelteKitHandler } from '../web/build/handler.js'

type NodeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void

async function fetchToNode(
  request: Request,
  middleware: NodeMiddleware,
): Promise<Response> {
  const url = new URL(request.url)

  // Build a minimal IncomingMessage backed by the request's body stream so
  // SvelteKit can read POST bodies, form submissions, etc.
  const socket = new Socket()
  const bodyStream: Readable = request.body
    ? Readable.fromWeb(request.body as never)
    : Readable.from([])
  const req = Object.assign(bodyStream, {
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: request.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(request.headers),
    rawHeaders: [...request.headers].flat() as string[],
    socket,
    connection: socket,
    complete: true,
    aborted: false,
  }) as unknown as IncomingMessage

  const res = new ServerResponse(req)

  return await new Promise<Response>((resolveResp, rejectResp) => {
    const chunks: Buffer[] = []

    // Capture writes — ServerResponse normally pipes to a socket; we intercept
    // to assemble the body for our Response.
    const origWrite = res.write.bind(res)
    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk != null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
      }
      return origWrite(chunk as never, ...(args as []))
    }) as typeof res.write

    const origEnd = res.end.bind(res)
    res.end = ((chunk?: unknown, ...args: unknown[]) => {
      if (chunk != null && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
      }
      const headers = new Headers()
      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v == null) continue
        if (Array.isArray(v)) v.forEach((vv) => headers.append(k, String(vv)))
        else headers.set(k, String(v))
      }
      resolveResp(
        new Response(chunks.length ? Buffer.concat(chunks) : null, {
          status: res.statusCode,
          headers,
        }),
      )
      return origEnd(chunk as never, ...(args as []))
    }) as typeof res.end

    middleware(req, res, (err?: unknown) => {
      if (err) rejectResp(err instanceof Error ? err : new Error(String(err)))
      // If `next()` is called without err and the response wasn't ended,
      // SvelteKit declined the request — return a 404.
      else if (!res.writableEnded) {
        resolveResp(new Response('Not Found', { status: 404 }))
      }
    })
  })
}

const server = new Elysia()
  .use(app)
  .all('/*', ({ request }) => fetchToNode(request, svelteKitHandler))
  .listen(process.env.PORT ?? 3000)

console.log(`Server running at http://localhost:${server.server!.port}`)
