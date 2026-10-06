/**
 * Public API at `game.modules.get("pf1-selective-vision").api`. DESIGN.md §8.
 */

import { KINDS, MODULE_ID, PRIORITY, SOURCE_FALLBACK } from "./const.mjs";
import {
  applyUpdate,
  editUpdate,
  findRule,
  indexFor,
  isLive,
  keysForObserver,
  makeRule,
  observerKey,
  removalUpdate,
  resolveTarget,
  senses,
  toStored,
  winningFor,
  winningIds,
} from "./rules.mjs";
import { writeFlags } from "./socket.mjs";

let warnedNoSource = false;

function requireTarget(target) {
  const doc = resolveTarget(target);
  if (!doc) throw new Error(`${MODULE_ID} | no token for target: ${target}`);
  return doc;
}

function keysOf(observers) {
  const keys = [];
  for (const observer of [observers].flat()) {
    const key = observerKey(observer);
    if (!key) {
      console.error(`${MODULE_ID} | observer not resolvable`, observer);
      continue;
    }
    if (!keys.includes(key)) keys.push(key);
  }
  if (!keys.length) throw new Error(`${MODULE_ID} | no valid observers`);
  return keys;
}

function sourceOf(opts) {
  if (opts.source) return String(opts.source);
  if (!warnedNoSource) {
    warnedNoSource = true;
    console.warn(`${MODULE_ID} | rule written without a source; recorded as "${SOURCE_FALLBACK}"`);
  }
  return SOURCE_FALLBACK;
}

async function apply(kind, target, observers, opts = {}) {
  const doc = requireTarget(target);
  const keys = keysOf(observers);
  const { storedLifetime: _ignored, ...rest } = opts;
  const rule = makeRule(kind, { ...rest, source: sourceOf(opts) }, doc);
  const { update, ids } = applyUpdate(doc, keys, rule, { replace: opts.replace !== false });
  await writeFlags(doc, update);
  return ids;
}

/** Re-applies: `applied` becomes now. Omitted fields keep their values. §3.5 */
async function update(target, ruleId, changes = {}) {
  const doc = requireTarget(target);
  const old = findRule(doc, ruleId);
  if (!old) throw new Error(`${MODULE_ID} | no rule "${ruleId}" on ${doc.name}`);
  const kind = changes.kind ?? old.kind;
  const has = (field) => changes[field] !== undefined;
  const rule = makeRule(
    kind,
    {
      walls: has("walls") ? changes.walls : old.kind === "grant" ? old.walls : true,
      sense: has("sense") ? changes.sense : old.sense,
      priority: has("priority") ? changes.priority : old.priority,
      source: has("source") ? changes.source : old.source,
      tag: has("tag") ? changes.tag : old.tag,
      label: has("label") ? changes.label : old.label,
      storedLifetime: has("lifetime") ? undefined : old.lifetime,
      lifetime: changes.lifetime,
    },
    doc
  );
  await writeFlags(doc, editUpdate(old.key, ruleId, rule));
}

async function remove(target, ruleIds) {
  const doc = requireTarget(target);
  const ids = new Set([ruleIds].flat());
  await writeFlags(doc, removalUpdate(doc, (_rule, id) => ids.has(id)));
}

async function clear(target, { observers, source, tag } = {}) {
  const doc = requireTarget(target);
  const keys = observers === undefined ? null : keysOf(observers);
  await writeFlags(
    doc,
    removalUpdate(
      doc,
      (rule, _id, key) =>
        (!keys || keys.includes(key))
        && (source === undefined || rule?.source === source)
        && (tag === undefined || (rule?.tag ?? "") === tag)
    )
  );
}

function rules(target, { observer } = {}) {
  const doc = requireTarget(target);
  const idx = indexFor(doc);
  if (!idx) return [];
  const keys = observer === undefined ? null : keysForObserver(observer) ?? [];
  const winners = winningIds(doc);
  const out = [];
  for (const [key, list] of idx) {
    if (keys && !keys.includes(key)) continue;
    for (const rule of list) {
      out.push({ ...toStored(rule), id: rule.id, key, live: isLive(rule, doc), winning: winners.has(rule.id) });
    }
  }
  return out;
}

function verdict(target, observer) {
  const doc = requireTarget(target);
  const keys = keysForObserver(observer);
  if (!keys) throw new Error(`${MODULE_ID} | observer not resolvable: ${observer}`);
  const rule = winningFor(doc, keys);
  return rule ? { ...toStored(rule), id: rule.id, key: rule.key } : null;
}

export const api = {
  grant: (target, observers, opts) => apply("grant", target, observers, opts),
  deny: (target, observers, opts) => apply("deny", target, observers, opts),
  restore: (target, observers, opts) => apply("restore", target, observers, opts),
  update,
  remove,
  clear,
  rules,
  verdict,
  senses,
  KINDS,
  PRIORITY,
  get version() {
    return game.modules.get(MODULE_ID)?.version;
  },
};
