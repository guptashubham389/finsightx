# FinSightX Gmail connection

Open the development app: https://groovy-gull-418.convex.site/

## Google setup

1. Enable the Gmail API in your Google Cloud project.
2. Configure the Google OAuth consent screen. For an app in testing, add your Gmail address as a test user.
3. Create an OAuth client of type **Web application**.
4. Add this exact **Authorized redirect URI**:

   `https://groovy-gull-418.convex.site/gmail/callback`

5. In the [Convex development deployment settings](https://dashboard.convex.dev/t/shubham-gupta-bcfe5/build-sprint-app/groovy-gull-418/settings/environment-variables), set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Use the Google client values there; do not paste them into chat, commit them, or print them. This app reads them only inside Convex functions.
6. Open the app and click **Connect Gmail**. Complete Google's permission screen.

The authorization request contains exactly one scope:

`https://www.googleapis.com/auth/gmail.readonly`

It does not request identity scopes, combine previously granted scopes, or request offline access. The access token exists only during the import and is not saved. If Google returns additional scopes from an old grant, the app refuses the import; remove the old app connection in your Google account and reconnect.

## What the import does

- Calls `users.messages.list` with `q="from:alerts@hdfcbank.bank.in newer_than:6m UPI"` and follows every `nextPageToken`.
- Counts the actual unique message IDs, rather than Google's result-size estimate.
- Fetches every result with `users.messages.get`, `format=full`.
- Uses the Gmail profile endpoint under the same read-only permission to isolate each account's ledger. The account address is converted into a secret-keyed hash and is not saved.
- Decodes plain text or HTML and parses explicit transaction fields. It never uses the subject or snippet to guess a transaction. Unsupported formats, missing payees, conflicting transactions, invalid dates, or unclear amounts are skipped and counted.
- Saves only ledger rows: transaction date, amount in rupees, debit/credit, merchant/payee, and hashed account/source keys needed for private access and duplicate prevention. Convex also adds its normal document ID and creation time.
- Prevents repeats by UPI reference where present, otherwise by Gmail message ID. Distinct emails without a common transaction reference cannot be reliably identified as duplicates and are not guessed to be the same transaction.
- Does not save original alert text, bodies, subjects, snippets, OAuth codes, access tokens, refresh tokens, or import reports. There are no logs of email contents or credentials.
- After the import, enter monthly salary and salary date to see salary minus recorded spending and upcoming bills for the current salary period. Gmail credits are not added again as salary.
- Manual transactions save date, amount, payee, type and optional note. Matching Gmail and manual spending is counted once when date, amount and payee match.

## Checking the real import

After connection, the app shows the total emails found, parsed rows, skipped rows, new rows saved and duplicates. The first five parsed rows appear next to the email date and the full decoded original alert text, laid out side by side at phone width. If fewer than five rows parse, all of them are shown with the count. Only alert bodies containing UPI are eligible. The page also contains the exact JSON output under **Exact import output**.

Compare the original alert text and each parsed date, amount, spent/received direction and payee on your phone. The original-text proof is only in the one-time response, with caching disabled; it is not in the database and cannot be retrieved later by the assistant. Reconnect to generate a new comparison report. Reloading the OAuth callback cannot repeat the import because Google authorization codes can only be exchanged once.

The **View saved ledger** link works after closing and reopening the page in the same browser, using a signed, secure, HTTP-only cookie valid for 30 days. After expiry, reconnecting the same Google account restores access. A different Google account gets a separate ledger. Changing the Google client secret changes the hashed account keys; keep it stable for this development implementation.

## Screen preview

Run `npm run preview`, then open `test-results/screens-preview.html`. It contains example values and lets you switch between the home, salary, upcoming, add-transaction, loading and error screens. Saving and Gmail connection are disabled in this preview.

To update the connected development app, run `npx convex dev --once` in a terminal with network access.

## Developer checks

```sh
npm test
npm run check
npm run test:browser
npx convex dev --once --typecheck enable
```

Tests use invented bank alerts. They are not evidence of a real Gmail connection or real parsing accuracy. Browser checks use Chrome installed on this Mac and verify the deployed screen plus the comparison layout. A real Gmail import must still be checked after the owner connects.

Reference: [Google Gmail message list API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Google OAuth for web servers](https://developers.google.com/identity/protocols/oauth2/web-server).
