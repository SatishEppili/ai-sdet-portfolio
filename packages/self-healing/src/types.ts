/** off = plain locators; heal = repair broken locators at runtime; learn = record fingerprints. */
export type HealMode = 'off' | 'heal' | 'learn';

/** What an element looked like the last time its locator worked (recorded on a green run). */
export interface ElementDescriptor {
  tag: string;
  role: string;
  /** Accessible-ish name: aria-label, <label>, button/link text, placeholder, alt, title. */
  name: string;
  text: string;
  testId: string;
  attrs: Record<string, string>; // id, name, type, placeholder, href, title, alt, aria-label
  classes: string[];
  /** data-test of the nearest ancestor that has one (where the element lives on the page). */
  ancestorTestId: string;
  visible: boolean;
}

export interface Fingerprint extends ElementDescriptor {
  key: string; // `${route}::${testId}`
  route: string; // normalised pathname, e.g. /product/:id
  /** How many elements the locator matched (1 = single element, >1 = list). */
  count: number;
  recordedAt: string;
}

export interface Candidate extends ElementDescriptor {
  /** Index into the page's candidate list (data-heal-id on the element during healing). */
  index: number;
  score: number;
}

export interface HealResult {
  ok: boolean;
  testId: string;
  route: string;
  /** Human-readable new locator, e.g. getByTestId('product-title'). */
  newLocator?: string;
  /** Suggested replacement for byTestId(...) in the page object, when the element has a data-test. */
  suggestedTestId?: string;
  strategy?: 'fingerprint' | 'llm';
  score?: number;
  confidence?: number;
  reason: string;
  candidates: number;
  ms: number;
}
