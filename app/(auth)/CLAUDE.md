# app/(auth)/

Authentication screens. Shared layout with no bottom tabs.

## Screens
- **login.tsx** — Email/password sign in. Redirects to teacher or parent dashboard based on role.
- **signup.tsx** — Email/password + role selection (teacher or parent) + first/last name. Sends verification email. If parent, immediately runs `acceptPendingInvites`.
- **verify-email.tsx** — Shown when `emailVerified === false`. Has resend button + reload button. Polls Firebase Auth for verification status.
- **forgot-password.tsx** — Sends password reset email via Firebase Auth.

## Routing
`_layout.tsx` defines a Stack navigator. Auth state is checked in `app/index.tsx` — if authenticated and verified, redirects to `(teacher)` or `(parent)` based on role.
