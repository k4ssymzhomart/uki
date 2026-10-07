// Type-check shim for Node's tsc: the two Deno globals the functions use. The Edge Runtime provides
// the real ones.
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
