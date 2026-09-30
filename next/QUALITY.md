# Code quality (MIG-213)

The console's half of the platform code standard. `ng build` and `ng test` enforce it; nothing new
was installed for it.

## What the build runs

- **The TypeScript compiler** (`tsconfig.json`): `strict`, plus `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and
  `noPropertyAccessFromIndexSignature`. `ng build` checks the app, and `ng test` checks the specs too, so one
  unused import or local in either one fails the run. When a signature needs a parameter that the body does not
  use, the parameter gets a `_` prefix (`(_id: number, key: string) => ...`).
  An effect that is only there for what it does goes in the constructor as `effect(...)` rather than in
  a private field that nothing reads.
- **The Angular compiler**: `strictTemplates`, `strictInjectionParameters` and
  `strictInputAccessModifiers`, so a template is type-checked like the code.
- **`src/app/code-standard.spec.ts`**: scans every `.ts` and `.html` file under `src/app`, specs included,
  and names the file and line of anything that breaks a rule:
  - no `console` calls. The three that are the right place for their message are listed in the spec's
    `CONSOLE_ALLOWED`, each with its reason: a dashboard widget that throws, an unknown icon name
    (checked in dev mode only), and the characterisation recorder's output;
  - no `debugger` statement;
  - a `TODO`, `FIXME` or `HACK` names its board card, like `TODO(MIG-249)`;
  - no commented-out code. This is a heuristic: a `//` comment that ends in `;`, `{` or `}` and is
    shaped like a statement, or an HTML comment that starts with markup or template syntax. The spec
    tests the heuristic on real prose from the console, so it keeps leaving prose alone;
  - never two blank lines in a row.
- **`design-system.spec.ts`, `layout-rules.spec.ts`** and the other scans (MIG-212, MIG-257) hold the
  screens to the design system in the same way.

## Left out, and why

- **ESLint** (`@angular-eslint`): it would add a tree of npm dependencies to a repository that already
  has open Dependabot alerts. The compiler flags and the scan above cover what we would have used it for:
  unused code, logging left in, and dead code.
- **Prettier** is installed and `.prettierrc` exists, but `prettier --check` is not in the build. It
  would rewrite 650 of the 676 files under `src/app`, mostly by wrapping lines to 100 characters. That churn
  would help no reader and would collide with every open branch.
- **Owners on TODOs**: the card id is the owner, because the board card has the assignee. Writing a
  person's name as well would only give it a second place to go stale.
- **Scanned but excluded**: `code-standard.spec.ts` itself, since its rules spell out what they look for,
  and `src/app/characterisation/pinned/`, which `scripts/characterisation/record.mjs` writes and which is
  never edited by hand.
- `e2e/` (Playwright) is not part of `ng build` or `ng test`, so neither the compiler flags nor the scan
  check it.
