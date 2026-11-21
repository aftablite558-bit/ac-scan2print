// AC Scan2Print — Deno Edge Function Wrapper
import { createLiveSupabaseAdapter, readDenoRuntimeEnv } from './supabaseAdapter.ts';
import type { RuntimeEnv, Scan2PrintBackendAdapter } from './types.ts';

declare const Deno: {
  serve(handler: (req: Request) => Promise<Response>): void;
};

export function serveEdgeFunction(
  handler: (req: Request, adapter: Scan2PrintBackendAdapter, env: RuntimeEnv) => Promise<Response>
): void {
  Deno.serve(async (req: Request) => {
    const adapter = createLiveSupabaseAdapter();
    const env = readDenoRuntimeEnv();
    return handler(req, adapter, env);
  });
}
