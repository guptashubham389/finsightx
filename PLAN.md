# PLAN.md, FinSightX

Work on one milestone at a time. Get approval before writing app code. Check each milestone in the phone browser at https://groovy-gull-418.convex.site. After you confirm it works: commit, push, deploy, and add one line to PROGRESS.md.

## Milestone 1 — Prove Gmail alerts become accurate ledger rows

On the live link, after Connect Gmail, read your HDFC UPI alerts into ledger rows and save them privately in Convex.

Proof on screen:
- Emails found, rows parsed, and rows skipped.
- Five parsed rows next to their original alert text, so you can compare date, amount, spent or received, and payee. If fewer than five parse, show every parsed row and state the count.
- Original alert text is shown only for this check; never save it in the database or repository.
- Reconnecting does not create duplicate ledger rows.
- Closing and reopening the app in the same browser keeps your saved ledger available.

This comes first because the spending number cannot be trusted if the source rows are wrong.

## Milestone 2 — Prove the remaining-spending calculation

Use saved HDFC UPI alert rows to estimate spending for the remaining days until salary, including recurring bills and their payment dates. Use six months of alerts when available; send the latest 200 rows at most to the AI.

Enter monthly salary and salary date. Convex calculates safe-to-spend as salary minus spending since salary minus the remaining-spending estimate. AI never performs the safe-to-spend arithmetic or invents past transactions.

Proof:
- Compare estimates for past salary periods with what was actually spent after each cutoff, using only information available before that cutoff.
- Aim for an error within ₹1,000 per month, as specified in PRODUCT.md. Show the actual error and available history; do not claim accuracy before checking it.
- Show the salary, recorded spending, and remaining expenses used to calculate the number.
- Enforce the AI input, output, and hourly call limits in Convex. On failure or a cap being hit, show “we will get back soon”.

## Milestone 3 — Add missing spending and upcoming expenses

On the live phone screen, add Spent or Upcoming transactions with date, paid to, amount, and an optional note. Save them in the personal ledger and include upcoming expenses in the calculation without double-counting Gmail entries or recurring bills.

Proof:
- Saving returns to Home and shows the old safe-to-spend number → the new number.
- Matching manual and Gmail transactions count once.
- Closing and reopening keeps the saved entry and its effect on the number.
- Home follows DESIGN.md: a 48px number, red below ₹500 per remaining day and green at or above it, days until salary underneath, and Historical / Upcoming transaction filters.

## Parked

- Voice entry for transactions.
- Account aggregator connections and a full household financial view.
- Banks other than HDFC and statement formats outside the HDFC UPI alerts in this milestone plan.
- SMS imports.
- Personalised AI or human advice, including investment or loan advice.
- A separate “Can I afford this purchase?” flow; keep the safe-to-spend number as the current core action.
- Manual income entries beyond the monthly salary field; agree on how they affect the calculation before adding them.
