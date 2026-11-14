import { DebugModeSchema, type DebugMode } from '@keyring/shared';

/**
 * Process-wide failure injection for demos and e2e tests. A per-request
 * `x-keyring-debug` header takes precedence so parallel tests don't interfere.
 */
export function createDebugState(enabled: boolean) {
  let state: { mode: DebugMode; once: boolean } = { mode: 'normal', once: true };
  return {
    enabled,
    get: () => state,
    set(mode: DebugMode, once: boolean) {
      state = { mode, once };
    },
    consume(header: string | undefined): DebugMode {
      if (!enabled) return 'normal';
      const fromHeader = DebugModeSchema.safeParse(header);
      if (fromHeader.success) return fromHeader.data;
      const mode = state.mode;
      if (state.once) state = { mode: 'normal', once: true };
      return mode;
    },
  };
}

export type DebugState = ReturnType<typeof createDebugState>;
