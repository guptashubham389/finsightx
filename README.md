# FinSightX

FinSightX reads HDFC bank alerts from Gmail and shows monthly salary minus recorded spending and upcoming bills until the next salary date. The number turns red below ₹500 per remaining day and green at or above ₹500.

Personal ledger access uses a signed browser cookie. Email content and Google tokens are not stored. Manual transactions matching Gmail spending by date, amount and payee count once.

## Run the checks

```sh
npm install
npm run check
npm test
npm run preview
```

Open `test-results/screens-preview.html` to inspect the screens using example values.

## Publish to GitHub and Convex

The prepared shipping command creates a **public** GitHub repository named **finsightx**, pushes the source, installs and configures Convex static hosting, pushes the hosting changes, then uploads the build to the current Convex development deployment.

In your Mac's Terminal:

```sh
cd /Users/shubhamgupta/build-sprint-app
gh auth login
npx convex login
npm run ship
```

Git needs your name and email configured before committing. The command stops if a different repository is already connected or if `finsightx` already exists without a local connection. It does not change an existing repository's visibility.

For subsequent uploads after setup:

```sh
npm run deploy
```

`deploy` targets the existing development deployment so the configured Google callback address remains valid. It does not create a production deployment. For a separate production release, configure the Google OAuth client and environment variables for that deployment before switching to `static-hosting deploy`.

The public landing screen is built into `dist/`. Static hosting serves the landing screen and its assets. Authenticated Home, Salary, Add transaction and Gmail callback routes remain server-rendered HTTP pages. Exact routes take precedence over static routing, preserving `/gmail/callback` and the private data checks. Signed-in visitors to the static landing screen are sent to `/home`.

See [GMAIL_SETUP.md](GMAIL_SETUP.md) for the required Google environment variables and Gmail permission setup, and [Convex's static-hosting guide](https://github.com/get-convex/static-hosting) for the component.

Never commit `.env` files, Google client secrets or access tokens. They are excluded from the source files the shipping command stages.
