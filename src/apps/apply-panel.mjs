/**
 * Apply panel: one target, a control bar, and an observer checklist. DESIGN.md §7.2.
 */

import { ALL_KEY, CSS, PRIORITY, SOURCE_MANUAL, TEMPLATES } from "../const.mjs";
import { defaultSense, senses, verdictFor, winningFor } from "../rules.mjs";
import { ruleSummary, senseLabels, sourceLabel } from "../labels.mjs";
import { api } from "../api.mjs";
import { RulesWindow } from "./rules-window.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Panel default lifetime per kind. §6 */
const DEFAULT_LIFETIME = { grant: "moves", restore: "moves", deny: "manual" };

const KIND_CHOICES = { grant: "PF1SV.Kind.grant", restore: "PF1SV.Kind.restore", deny: "PF1SV.Kind.deny" };
const LIFETIME_CHOICES = {
  manual: "PF1SV.Lifetime.manual",
  moves: "PF1SV.Lifetime.moves",
  rounds: "PF1SV.Lifetime.rounds",
  buff: "PF1SV.Lifetime.buff",
};

const VIDEO = /\.(webm|mp4|m4v|ogv)$/i;

function portrait(doc) {
  const src = doc.texture?.src;
  if (src && !VIDEO.test(src)) return src;
  return doc.actor?.img ?? "icons/svg/mystery-man.svg";
}

function badge(rule, senseNames) {
  if (!rule) return { kind: "none", text: game.i18n.localize("PF1SV.State.None"), ruleId: null };
  return { kind: rule.kind, text: ruleSummary(rule, senseNames), ruleId: rule.id, source: sourceLabel(rule.source) };
}

const escape = (text) => Handlebars.escapeExpression(text);

export class ApplyPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [`${CSS}apply`],
    window: { icon: "fa-solid fa-eye-low-vision", resizable: true },
    position: { width: 480, height: "auto" },
    actions: {
      apply: ApplyPanel.#onApply,
      clearChecked: ApplyPanel.#onClearChecked,
      checkSelected: ApplyPanel.#onCheckSelected,
      uncheckAll: ApplyPanel.#onUncheckAll,
      openRules: ApplyPanel.#onOpenRules,
      editRule: ApplyPanel.#onEditRule,
    },
  };

  static PARTS = {
    body: { template: `${TEMPLATES}/apply-panel.hbs`, scrollable: [`.${CSS}observers`] },
  };

  /** Bring an open panel for this token forward, or open one. */
  static open(doc) {
    const id = `${CSS}apply-${doc.id}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.render({ force: true });
      existing.bringToFront();
      return existing;
    }
    return new this(doc, { id }).render({ force: true });
  }

  constructor(doc, options = {}) {
    super(options);
    this.targetDoc = doc;
    this.draft = {
      kind: "grant",
      walls: true,
      sense: defaultSense(),
      priority: PRIORITY.MANUAL,
      lifetime: DEFAULT_LIFETIME.grant,
      rounds: 10,
      buff: "",
      tag: "",
      label: "",
      checked: new Set(),
    };
  }

  get title() {
    return game.i18n.format("PF1SV.Apply.Title", { name: this.targetDoc.name });
  }

  /** Active buffs on the target's and each checked observer's actor. */
  #buffChoices() {
    const scene = this.targetDoc.parent;
    const actors = new Map();
    const add = (actor) => actor && actors.set(actor.uuid, actor);
    add(this.targetDoc.actor);
    for (const id of this.draft.checked) if (id !== ALL_KEY) add(scene?.tokens.get(id)?.actor);

    const choices = {};
    for (const actor of actors.values()) {
      for (const item of actor.items) {
        if (item.type === "buff" && item.system?.active) choices[item.uuid] = `${actor.name}: ${item.name}`;
      }
    }
    return choices;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const doc = this.targetDoc;
    const draft = this.draft;
    const senseNames = senseLabels();

    const observers = (doc.parent?.tokens.contents ?? [])
      .filter((t) => t !== doc)
      .map((t) => ({
        id: t.id,
        name: t.name,
        img: portrait(t),
        owned: t.hasPlayerOwner,
        disposition: t.disposition,
        checked: draft.checked.has(t.id),
        state: badge(verdictFor(doc, t), senseNames),
      }))
      .sort((a, b) => b.owned - a.owned || b.disposition - a.disposition || a.name.localeCompare(b.name));

    const buffs = draft.lifetime === "buff" ? this.#buffChoices() : {};
    if (draft.lifetime === "buff" && !(draft.buff in buffs)) draft.buff = Object.keys(buffs)[0] ?? "";

    return Object.assign(context, {
      css: CSS,
      draft,
      isGrant: draft.kind === "grant",
      kinds: KIND_CHOICES,
      lifetimes: LIFETIME_CHOICES,
      senses: senses(),
      showRounds: draft.lifetime === "rounds",
      showBuff: draft.lifetime === "buff",
      buffs,
      hasBuffs: Object.keys(buffs).length > 0,
      all: {
        checked: draft.checked.has(ALL_KEY),
        state: badge(winningFor(doc, [ALL_KEY]), senseNames),
      },
      observers,
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-field]")) {
      el.addEventListener("change", (ev) => this.#onField(ev.currentTarget));
    }
    for (const el of this.element.querySelectorAll("input[data-observer]")) {
      el.addEventListener("change", (ev) => {
        const box = ev.currentTarget;
        if (box.checked) this.draft.checked.add(box.dataset.observer);
        else this.draft.checked.delete(box.dataset.observer);
        if (this.draft.lifetime === "buff") this.render();
      });
    }
    for (const row of this.element.querySelectorAll("li[data-rule]")) {
      row.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#confirmRemove(row.dataset);
      });
    }
  }

  /** Right-click on an observer row: remove the rule deciding it. §7.2 */
  async #confirmRemove({ rule, summary, source, observerName }) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "PF1SV.Apply.RemoveTitle" },
      content: `<p>${game.i18n.format("PF1SV.Apply.RemoveContent", {
        rule: escape(summary),
        source: escape(source),
        observer: escape(observerName),
      })}</p>`,
      rejectClose: false,
    });
    if (!confirmed) return;
    try {
      await api.remove(this.targetDoc, rule);
    } catch (err) {
      console.error(err);
    }
  }

  #readField(el) {
    const field = el.dataset.field;
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (field === "priority" || field === "rounds") value = Number(value);
    this.draft[field] = value;
    return field;
  }

  #onField(el) {
    const field = this.#readField(el);
    if (field === "kind") this.draft.lifetime = DEFAULT_LIFETIME[this.draft.kind];
    if (field === "kind" || field === "lifetime") this.render();
  }

  /** Pick up text a pending `change` hasn't committed yet. */
  #syncFromDom() {
    for (const el of this.element.querySelectorAll("[data-field]")) this.#readField(el);
  }

  #checkedObservers() {
    const scene = this.targetDoc.parent;
    const out = [];
    for (const id of this.draft.checked) {
      if (id === ALL_KEY) out.push(ALL_KEY);
      else {
        const doc = scene?.tokens.get(id);
        if (doc) out.push(doc);
      }
    }
    return out;
  }

  #lifetimeOption() {
    const { lifetime, rounds, buff } = this.draft;
    if (lifetime === "moves") return { targetMoves: true };
    if (lifetime === "rounds") return { rounds: Math.max(1, Number(rounds) || 1) };
    if (lifetime === "buff") return buff ? { buff } : null;
    return {};
  }

  static async #onApply() {
    this.#syncFromDom();
    const observers = this.#checkedObservers();
    if (!observers.length) return ui.notifications.warn("PF1SV.Apply.NoneChecked", { localize: true });
    const lifetime = this.#lifetimeOption();
    if (!lifetime) return ui.notifications.warn("PF1SV.Apply.NoBuff", { localize: true });

    const { kind, walls, sense, priority, tag, label } = this.draft;
    try {
      await api[kind](this.targetDoc, observers, {
        source: SOURCE_MANUAL,
        walls,
        sense,
        priority: Number.isFinite(priority) ? priority : PRIORITY.MANUAL,
        tag,
        label,
        lifetime,
      });
    } catch (err) {
      console.error(err);
    }
  }

  static async #onClearChecked() {
    const observers = this.#checkedObservers();
    if (!observers.length) return ui.notifications.warn("PF1SV.Apply.NoneChecked", { localize: true });
    try {
      await api.clear(this.targetDoc, { observers, source: SOURCE_MANUAL });
    } catch (err) {
      console.error(err);
    }
  }

  static #onCheckSelected() {
    const scene = this.targetDoc.parent;
    for (const token of canvas.tokens?.controlled ?? []) {
      const doc = token.document;
      if (doc !== this.targetDoc && doc.parent === scene) this.draft.checked.add(doc.id);
    }
    this.render();
  }

  static #onUncheckAll() {
    this.draft.checked.clear();
    this.render();
  }

  static #onOpenRules() {
    RulesWindow.open(this.targetDoc);
  }

  static #onEditRule(_event, target) {
    RulesWindow.open(this.targetDoc, { edit: target.dataset.rule });
  }
}
