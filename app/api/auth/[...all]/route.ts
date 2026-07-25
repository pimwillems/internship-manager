import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

// Block public sign-up: the coordinator account is only ever created by the
// env-seed helper. Every other auth endpoint (sign-in, sign-out, …) passes
// through.
export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.includes("/sign-up")) {
    return new Response("Not found", { status: 404 });
  }
  return handlers.POST(request);
}
