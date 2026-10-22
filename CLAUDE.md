# etow3d

## Deploying

The game is a static site on Firebase Hosting: the `etow3d` site of the shared
`flubber-8ae55` project, live at https://etow3d.web.app. When asked to deploy, deploy
from an up-to-date `main` (merge the work first) and run:

```sh
npm install
npm run build && node scripts/deploy-hosting.mjs --dry-run   # check the file list first
npm run deploy
```

That builds with Vite and publishes `dist/` through `scripts/deploy-hosting.mjs`, which
reads `firebase.json` and `.firebaserc` and authenticates with the service account in the
`FIREBASE_SERVICE_ACCOUNT` environment variable (JSON or base64 JSON; never print it or
write it into the repo). Do not use `npx firebase-tools deploy` with that service account:
it fails on a Service Usage permission check (403 on serviceusage.googleapis.com).

The sandbox may block https://etow3d.web.app itself; the script's output (the released
version and time) is the confirmation. See **Deploying** in README.md for the details.
