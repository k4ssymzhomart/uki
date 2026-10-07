// What test/integration/global-setup.ts provides to the stack tests through inject("stack").
import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    stack: { apiUrl: string; publishableKey: string; secretKey: string };
  }
}
