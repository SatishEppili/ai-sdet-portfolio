/**
 * Runs IN THE BROWSER via locator.evaluateAll(inspectInPage, opts), so it must be fully
 * self-contained: no imports, no outer variables. (No eval/new Function either, so it also
 * works on pages with a strict Content-Security-Policy.)
 *
 * Used for both sides of healing, so they are described identically:
 *  - fingerprints: the elements a working locator matched (recorded on a green run)
 *  - candidates:   every plausible element on the page when a locator breaks
 */
import type { ElementDescriptor } from './types';

export const CANDIDATE_SELECTOR =
  'a, button, input, select, textarea, [role], h1, h2, h3, h4, h5, h6, label, img, [data-test], span, p, li, td';

export interface InspectOptions {
  limit: number;
  /** Tag each described element with data-heal-id=<index> so a choice can be mapped back. */
  tag: boolean;
}

export function inspectInPage(els: Element[], opts: InspectOptions): { count: number; items: (ElementDescriptor & { index: number })[] } {
  const clean = (s: string | null | undefined, n = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const describe = (el: Element): ElementDescriptor => {
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    let role = el.getAttribute('role') ?? '';
    if (!role) {
      if (tag === 'a') role = el.hasAttribute('href') ? 'link' : '';
      else if (tag === 'button') role = 'button';
      else if (tag === 'select') role = 'combobox';
      else if (tag === 'textarea') role = 'textbox';
      else if (/^h[1-6]$/.test(tag)) role = 'heading';
      else if (tag === 'img') role = 'img';
      else if (tag === 'input') {
        role = type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio'
          : ['submit', 'button', 'reset'].includes(type) ? 'button' : type === 'number' ? 'spinbutton' : 'textbox';
      }
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    const labelFromIds = labelledBy
      ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      : '';
    const labelEl = (input.labels && input.labels[0]) || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
    const text = clean((el as HTMLElement).innerText ?? el.textContent);
    const name = clean(
      el.getAttribute('aria-label') ||
        labelFromIds ||
        labelEl?.textContent ||
        (['button', 'link', 'heading'].includes(role) ? text : '') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        (tag === 'input' && ['submit', 'button'].includes(type) ? input.value : ''),
    );
    const attrs: Record<string, string> = {};
    for (const a of ['id', 'name', 'type', 'placeholder', 'href', 'title', 'alt', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v) attrs[a] = (a === 'href' ? v.replace(/^https?:\/\/[^/]+/, '') : v).slice(0, 80);
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      tag,
      role,
      name,
      text,
      testId: el.getAttribute('data-test') ?? '',
      attrs,
      classes: Array.from(el.classList).filter((c) => !/^(ng-|_ng)/.test(c)).slice(0, 5),
      ancestorTestId: el.parentElement?.closest('[data-test]')?.getAttribute('data-test') ?? '',
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
    };
  };

  const items: (ElementDescriptor & { index: number })[] = [];
  for (const el of els) {
    if (items.length >= opts.limit) break;
    if (el.closest('script, style, noscript, svg')) continue;
    const index = items.length;
    if (opts.tag) el.setAttribute('data-heal-id', String(index));
    items.push({ ...describe(el), index });
  }
  return { count: els.length, items };
}
