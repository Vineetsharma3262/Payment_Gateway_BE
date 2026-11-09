# Email templates

One folder per template. Each folder contains:

- `subject.txt` — one line, variables allowed.
- `body.html` — rich HTML body. Variables allowed. Kept inline so Resend can
  deliver without an external CSS fetch.
- `body.txt` — plain-text fallback. Variables allowed.

Variables use `{{name}}` syntax. Example:

```
Hi {{name}}, click {{resetUrl}} to reset your password.
```

Unknown variables render as the literal placeholder in dev and raise in prod
(see `template-loader.ts`). Add a new template by creating a new folder with
these three files; the loader picks it up on next startup.

Variables available per template live in `src/modules/notifications/
template-contracts.ts` so the application code is type-checked against the
template surface.
