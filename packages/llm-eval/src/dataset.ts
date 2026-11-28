import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join('packages', 'llm-eval', 'dataset');

export type Quality = 'strong' | 'partial' | 'weak';

export interface GoldenQuestion {
  id: string;
  question: string;
  keyPoints: string[];
  answers: Record<Quality, string>;
}

export interface Golden {
  bands: Record<Quality, [number, number]>;
  questions: GoldenQuestion[];
  nonAnswers: { id: string; questionId: string; answer: string; expected: [number, number]; note: string }[];
}

export interface Attacks {
  injection: { id: string; questionId: string; maxScore: number; kind: string; answer: string; checkLeak?: boolean }[];
  bias: {
    names: string[];
    template: string;
    questionIds: string[];
    qualities: Quality[];
    nonNative: { questionId: string; quality: Quality; answer: string }[];
  };
}

export const golden = JSON.parse(readFileSync(join(DIR, 'golden.json'), 'utf8')) as Golden;
export const attacks = JSON.parse(readFileSync(join(DIR, 'attacks.json'), 'utf8')) as Attacks;

/**
 * Frozen BEFORE any calibration work (2026-11-25): prompt changes may only be tuned while
 * looking at TRAIN; HOLDOUT is scored once, after the prompt is frozen, to check the change
 * generalises instead of fitting the questions it was tuned on. Non-answers (n01 on q03, n02 on
 * q07) follow their question into train.
 */
export const SPLITS = {
  train: ['q01', 'q02', 'q03', 'q04', 'q05', 'q06', 'q07', 'q08'],
  holdout: ['q09', 'q10', 'q11', 'q12', 'q13', 'q14', 'q15', 'q16'],
} as const;
export type Split = keyof typeof SPLITS | 'all';

export const inSplit = (questionId: string, split: Split) =>
  split === 'all' || (SPLITS[split] as readonly string[]).includes(questionId);

export function question(id: string): GoldenQuestion {
  const q = golden.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question id ${id}`);
  return q;
}

/** Deterministic text transforms for robustness checks (meaning unchanged). */
export const transforms = {
  /** Swap two inner letters in every 6th longer word: realistic typing errors. */
  typos(text: string): string {
    let n = 0;
    return text.replace(/[A-Za-z]{6,}/g, (w) => {
      n++;
      if (n % 6 !== 0) return w;
      const i = Math.floor(w.length / 2);
      return w.slice(0, i - 1) + w[i] + w[i - 1] + w.slice(i + 1);
    });
  },
  /** Same sentences as a bullet list. */
  bullets(text: string): string {
    return text
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .map((s) => `- ${s}`)
      .join('\n');
  },
  /** Polite filler before and after: length without substance must not raise the score. */
  padding(text: string): string {
    return (
      "That's a great question, thank you for asking it. I have thought about this a lot during my career and I think it is really important for every team. " +
      text +
      " I hope that answers your question, and I'm very happy to elaborate further on any of these points if that would be helpful."
    );
  },
};
