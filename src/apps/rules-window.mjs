/**
 * Rules window: every rule on one target, with inline edit and remove. DESIGN.md §7.3.
 */

import { ALL_KEY, CSS, TEMPLATES } from "../const.mjs";
import { defaultSense, findRule, indexFor, isLive, senses, winningIds } from "../rules.mjs";
import { kindLabel, lifetimeLabel, observerName, ruleSummary, senseLabels, sourceLabel } from "../labels.mjs";
import { api } from "../api.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KIND_CHOICES = { grant: "PF1SV.Kind.grant", restore: "PF1SV.Kind.restore", deny: "PF1SV.Kind.deny" };
const EDIT_LIFETIME_CHOICES = {
  keep: "PF1SV.Lifetime.keep",
  manual: "PF1SV.Lifetime.manual",
  moves: "PF1SV.Lifetime.moves",
  rounds: "PF1SV.Lifetime.rounds",
};

export class RulesWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [`${CSS}rules`],
    window: { icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 640, height: 480 },
    actions: {
      edit: RulesWindow.#onEdit,
      cancel: RulesWindow.#onCancel,
      save: RulesWindow.#onSave,
      remove: RulesWindow.#onRemove,
    },
  };

  static PARTS = {
    body: { template: `${TEMPLATES}/rules-window.hbs`, scrollable: [`.${CSS}rule-groups`] },
  };

  /**
   * Bring an open window for this token forward, or open one.
   * @param {object} [options]
   * @param {string} [options.edit]  rule id to open in edit mode
   */
  static open(doc, { edit } = {}) {
    const id = `${CSS}rules-${doc.id}`;
    const app = foundry.applications.instances.get(id) ?? new this(doc, { id });
    if (edit) app.startEdit(edit);
    app.render({ force: true });
    if (app.rendered) app.bringToFront();
    return app;
  }

  constructor(doc, options = {}) {
    super(options);
    this.targetDoc = doc;
    /** Rule id being edited and its working values. */
    this.editing = null;
    /** Rule id to scroll into view after the next render. */
    this.scrollTarget = null;
  }

  /** Put one rule in edit mode. */
  startEdit(ruleId) {
    const rule = findRule(this.targetDoc, ruleId);
    if (!rule) return false;
    this.editing = {
      id: rule.id,
      kind: rule.kind,
      walls: rule.kind === "grant" ? rule.walls : true,
      sense: rule.sense || defaultSense(),
      priority: rule.priority,
      tag: rule.tag ?? "",
      label: rule.label ?? "",
      lifetime: "keep",
      rounds: 10,
    };
    this.scrollTarget = rule.id;
    return true;
  }

  get title() {
    return game.i18n.format("PF1SV.Rules.Title", { name: this.targetDoc.name });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const doc = this.targetDoc;
    const scene = doc.parent;
    const senseNames = senseLabels();
    const winners = winningIds(doc);
    const idx = indexFor(doc) ?? new Map();

    if (this.editing && !findRule(doc, this.editing.id)) this.editing = null;

    const groups = [...idx.entries()]
      .map(([key, list]) => ({
        key,
        name: observerName(key, scene),
        rules: list.map((rule) => {
          const editing = this.editing?.id === rule.id ? this.editing : null;
          return {
            id: rule.id,
            kind: rule.kind,
            kindLabel: kindLabel(rule.kind),
            summary: ruleSummary(rule, senseNames),
            priority: rule.priority,
            source: sourceLabel(rule.source),
            tag: rule.tag,
            label: rule.label,
            lifetime: lifetimeLabel(rule.lifetime),
            live: isLive(rule, doc),
            winning: winners.has(rule.id),
            editing,
            editGrant: editing?.kind === "grant",
            editRounds: editing?.lifetime === "rounds",
          };
        }),
      }))
      .sort((a, b) => (a.key === ALL_KEY ? -1 : b.key === ALL_KEY ? 1 : a.name.localeCompare(b.name)));

    return Object.assign(context, {
      css: CSS,
      groups,
      empty: !groups.length,
      kinds: KIND_CHOICES,
      lifetimes: EDIT_LIFETIME_CHOICES,
      senses: senses(),
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-edit]")) {
      el.addEventListener("change", (ev) => {
        const field = this.#readField(ev.currentTarget);
        if (field === "kind" || field === "lifetime") this.render();
      });
    }
    if (this.scrollTarget) {
      this.element.querySelector(`[data-rule="${this.scrollTarget}"]`)?.scrollIntoView({ block: "nearest" });
      this.scrollTarget = null;
    }
  }

  #readField(el) {
    const field = el.dataset.edit;
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (field === "priority" || field === "rounds") value = Number(value);
    if (this.editing) this.editing[field] = value;
    return field;
  }

  static #onEdit(_event, target) {
    if (this.startEdit(target.closest("[data-rule]").dataset.rule)) this.render();
  }

  static #onCancel() {
    this.editing = null;
    this.render();
  }

  static async #onSave() {
    if (!this.editing) return;
    for (const el of this.element.querySelectorAll("[data-edit]")) this.#readField(el);
    const e = this.editing;
    const changes = {
      kind: e.kind,
      priority: Number.isFinite(e.priority) ? e.priority : 0,
      tag: e.tag,
      label: e.label,
    };
    if (e.kind === "grant") Object.assign(changes, { walls: e.walls, sense: e.sense });
    if (e.lifetime === "manual") changes.lifetime = {};
    else if (e.lifetime === "moves") changes.lifetime = { targetMoves: true };
    else if (e.lifetime === "rounds") changes.lifetime = { rounds: Math.max(1, Number(e.rounds) || 1) };

    // Cleared first: the update's own re-render arrives before the await returns.
    this.editing = null;
    try {
      await api.update(this.targetDoc, e.id, changes);
    } catch (err) {
      console.error(err);
      this.editing = e;
      this.render();
    }
  }

  static async #onRemove(_event, target) {
    const id = target.closest("[data-rule]").dataset.rule;
    if (this.editing?.id === id) this.editing = null;
    try {
      await api.remove(this.targetDoc, id);
    } catch (err) {
      console.error(err);
    }
  }
}
