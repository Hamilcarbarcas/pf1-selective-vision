/**
 * GM relay. DESIGN.md §8.3.
 *
 * One generic primitive: update a token's flags inside this module's namespace. Rule logic runs on
 * the writing client.
 */

import { MODULE_ID } from "./const.mjs";

const CHANNEL = `module.${MODULE_ID}`;
const TIMEOUT_MS = 15_000;
const FLAG_PREFIX = `flags.${MODULE_ID}.`;

/** @type {Map<string, {resolve: Function, reject: Function, timer: number}>} */
const pending = new Map();

async function updateTokenFlags({ uuid, update }) {
  const keys = Object.keys(update ?? {});
  if (!keys.length) return true;
  const outside = keys.find((k) => !k.startsWith(FLAG_PREFIX));
  if (outside) throw new Error(`key outside module flags: "${outside}"`);
  const doc = await fromUuid(uuid);
  if (!(doc instanceof foundry.documents.TokenDocument)) throw new Error(`no token at "${uuid}"`);
  await doc.update(update);
  return true;
}

function report(error) {
  console.error(`${MODULE_ID} | write failed`, error);
  ui.notifications.warn(game.i18n.format("PF1SV.Relay.Failed", { error: error.message ?? String(error) }));
}

/**
 * Write a flag update to a token, directly or through the active GM.
 * @param {TokenDocument} doc
 * @param {object} update  flat keys under `flags.pf1-selective-vision.`
 * @returns {Promise<void>} rejects on failure, already reported
 */
export async function writeFlags(doc, update) {
  if (!Object.keys(update).length) return;

  if (doc.canUserModify(game.user, "update")) {
    try {
      await doc.update(update);
    } catch (err) {
      report(err);
      throw err;
    }
    return;
  }

  const gm = game.users.activeGM;
  if (!gm) {
    const err = new Error(game.i18n.localize("PF1SV.Relay.NoGM"));
    report(err);
    throw err;
  }

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      const err = new Error(game.i18n.localize("PF1SV.Relay.Timeout"));
      report(err);
      reject(err);
    }, TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    game.socket.emit(CHANNEL, {
      type: "request",
      requestId,
      gmId: gm.id,
      args: { uuid: doc.uuid, update },
    });
  });
}

export function registerSocket() {
  game.socket.on(CHANNEL, async (msg) => {
    if (msg?.type === "response") {
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      pending.delete(msg.requestId);
      clearTimeout(entry.timer);
      if (msg.error) {
        const err = new Error(msg.error);
        report(err);
        entry.reject(err);
      } else entry.resolve();
      return;
    }

    if (msg?.type !== "request" || msg.gmId !== game.user.id) return;
    let error = null;
    try {
      await updateTokenFlags(msg.args);
    } catch (err) {
      console.error(`${MODULE_ID} | relay: update failed`, err, msg.args);
      error = err.message ?? String(err);
    }
    game.socket.emit(CHANNEL, { type: "response", requestId: msg.requestId, error });
  });
}
