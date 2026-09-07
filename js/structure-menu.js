// A short grace period lets the pointer travel from a mesh to its action card.
export class StructureMenu {
  constructor(element, { nameFor, onAction }) {
    this.element = element;
    this.nameFor = nameFor;
    this.onAction = onAction;
    this.id = null;
    this.locked = false;
    element.addEventListener('pointerenter', () => { this.locked = true; this.cancelClose(); });
    element.addEventListener('pointerleave', () => { this.locked = false; this.scheduleClose(); });
    element.addEventListener('focusin', () => { this.locked = true; this.cancelClose(); });
    element.addEventListener('focusout', event => {
      if (!element.contains(event.relatedTarget)) { this.locked = false; this.scheduleClose(); }
    });
    element.addEventListener('click', event => {
      const button = event.target.closest('[data-structure-action]');
      if (!button || !this.id) return;
      const id = this.id, action = button.dataset.structureAction;
      this.close();
      if (action !== 'close') this.onAction(action, id);
    });
  }
  show(id, event, { force = false } = {}) {
    if (!id) { this.scheduleClose(); return; }
    if (this.locked && !force) return;
    this.cancelClose();
    if (this.id === id && !this.element.hidden && !force) return;
    this.id = id;
    this.element.querySelector('[data-structure-name]').textContent = this.nameFor(id);
    this.element.hidden = false;
    const bounds = this.element.parentElement.getBoundingClientRect();
    const width = this.element.offsetWidth, height = this.element.offsetHeight;
    const x = event ? event.clientX - bounds.left + 12 : bounds.width - width - 12;
    const y = event ? event.clientY - bounds.top + 12 : 60;
    this.element.style.left = `${Math.max(8, Math.min(x, bounds.width - width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(y, bounds.height - height - 8))}px`;
    if (force) this.element.querySelector('button').focus();
  }
  scheduleClose() {
    if (this.locked || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.close(); }, 650);
  }
  cancelClose() {
    clearTimeout(this.timer);
    this.timer = null;
  }
  close() {
    this.cancelClose();
    this.element.hidden = true;
    this.id = null;
    this.locked = false;
  }
}
