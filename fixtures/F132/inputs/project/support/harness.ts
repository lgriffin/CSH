// Local stand-ins for jest-cucumber, cucumber-js and Playwright, so the fixture type-checks without them.
type Step = (text: string | RegExp, fn: (...args: string[]) => void) => void;
export interface Steps { given: Step; when: Step; then: Step; and: Step; but: Step }
export const loadFeature = (path: string): { path: string } => ({ path });
export const defineFeature = (_f: { path: string }, body: (test: (title: string, fn: (s: Steps) => void) => void) => void): void => body(() => undefined);
export const Given: Step = () => undefined;
export const When: Step = () => undefined;
export const Then: Step = () => undefined;
type Body = () => void | Promise<void>;
type Options = { tag: string | string[] };
export const test = Object.assign((_t: string, _o: Options | Body, _b?: Body) => undefined, { describe: (_t: string, _o: Options | Body, _b?: Body) => undefined });
