/**
 * Ambient type declarations for @onflow/* packages.
 *
 * The `@onflow/fcl` package declares `"types": "types/fcl.d.ts"` in its
 * package.json but does not actually ship that file in its npm tarball
 * (as of the version installed). Rather than pin an older version or fight
 * upstream, we declare the surfaces we use as permissive ambients.
 *
 * Typings are intentionally loose — FCL's runtime API is documented at
 * https://developers.flow.com/build/tools/clients/fcl-js and we prefer to
 * rely on our own wrapper (`lib/flow.ts`) for type-safety.
 */

declare module "@onflow/fcl" {
  // --- Config chainable ---
  interface FclConfig {
    put(key: string, value: unknown): FclConfig;
    get<T = unknown>(key: string, fallback?: T): Promise<T>;
  }

  export function config(): FclConfig;

  // --- Current user / auth ---
  export interface CurrentUser {
    addr: string | null;
    loggedIn: boolean;
    cid?: string | null;
    expiresAt?: number | null;
    services?: unknown[];
  }

  export const currentUser: {
    (): {
      subscribe(cb: (user: CurrentUser) => void): () => void;
      snapshot(): Promise<CurrentUser>;
    };
    subscribe(cb: (user: CurrentUser) => void): () => void;
    snapshot(): Promise<CurrentUser>;
    authenticate(): Promise<CurrentUser>;
    unauthenticate(): void;
    signUserMessage(message: string): Promise<unknown>;
  };

  export function authenticate(): Promise<CurrentUser>;
  export function unauthenticate(): void;
  export function logIn(): Promise<CurrentUser>;
  export function logOut(): void;

  // --- Query / transactions ---
  export interface QueryArgs {
    cadence: string;
    args?: (arg: typeof arg, t: unknown) => unknown[];
    limit?: number;
  }

  export function query<T = unknown>(opts: QueryArgs): Promise<T>;

  // `arg` is used inside query `args` builders: arg(value, t.Address)
  export function arg(value: unknown, type: unknown): unknown;

  // --- Signature verification ---
  export interface CompositeSignature {
    addr: string;
    keyId: number;
    signature: string;
    f_type?: string;
    f_vsn?: string;
  }

  export const AppUtils: {
    verifyUserSignatures(
      messageHex: string,
      compositeSignatures: CompositeSignature[],
      opts?: { fclCryptoContract?: string },
    ): Promise<boolean>;
  };

  // Catch-all for anything else we might incidentally reference.
  const _default: Record<string, unknown>;
  export default _default;
}

declare module "@onflow/types" {
  // Cadence type markers are opaque objects at runtime.
  export const Address: unknown;
  export const String: unknown;
  export const Bool: unknown;
  export const Int: unknown;
  export const UInt: unknown;
  export const UInt8: unknown;
  export const UInt16: unknown;
  export const UInt32: unknown;
  export const UInt64: unknown;
  export const Int8: unknown;
  export const Int16: unknown;
  export const Int32: unknown;
  export const Int64: unknown;
  export const UFix64: unknown;
  export const Fix64: unknown;
  export const Optional: (t: unknown) => unknown;
  export const Array: (t: unknown) => unknown;
  export const Dictionary: (k: unknown, v: unknown) => unknown;
  export const Identity: unknown;
}
