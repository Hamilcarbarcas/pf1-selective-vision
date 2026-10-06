/**
 * Re-run `isVisible` (and the marker sync riding `refreshToken`) on this client. DESIGN.md §4.5.
 */

import { MODULE_ID } from "./const.mjs";

export function refreshToken(tokenDoc) {
  tokenDoc?.object?.renderFlags.set({ refreshVisibility: true });
}

export function refreshAllRuled() {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens.placeables) {
    if (token.document.flags?.[MODULE_ID]?.rules) token.renderFlags.set({ refreshVisibility: true });
  }
}
