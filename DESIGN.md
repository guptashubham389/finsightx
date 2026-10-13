# DESIGN.md, FinSightX

## 1. The feeling, in labels
- Safe-to-spend number in big font, the first thing you see.
- Number turns red under ₹500/day for the days left until salary, green above that.
- Under it, a small line: days left until salary.

## 2. References, one per component
Safe-to-spend number: Weekly Budgeting home screen (weeklybudgeting.com)
Take: number at the top, transactions below it, scrollable
Ignore: other bottom options, no "Dashboard" title at the top

Add transaction (+) button: Weekly Budgeting (weeklybudgeting.com)
Take: button sits at the bottom, floating over the list, big, in blue
Ignore: assigning transactions to funds; only spending and recurring bills
Mine: Spent / Upcoming switch, date, amount, note. Manual spends never double-count Gmail ones.

Transaction list: Google Pay transaction history
Take: date filter at the top, month and year headers, each row shows date, name of the other party and amount
Ignore: search at the top, payment-method filter
Mine: Upcoming entries in lighter font with "Upcoming" next to the date; filter is Upcoming / Historical

## 3. Type and colour
Font: Google Sans; if not available, fall back to Inter
Sizes: big number 48 / headings 20 / body 16 / small line 13
Text on background: dark grey on white
Accent: blue
Safe / not safe: green / red
Error: orange



## 4. Screens
Home
Empty: Know your safe-to-spend number until your next salary. [Connect Gmail] We only read HDFC alerts.
Loading: Our engine is reading your spend alerts.
Error (Gmail access failed): We could not connect to your Gmail. [Try again]
Error (no HDFC alerts found): We could not find any HDFC alerts. Connect another Gmail or add spends with +.
Done: Safe-to-spend number, red/green, days to salary. Based on N HDFC alerts, last updated <time>.

Salary (after Connect Gmail, before the number)
Fields: monthly salary, salary date
Empty: Enter your salary. It helps us forecast your safe-to-spend number.
Saving: "Salary is being recorded…"
Error: Monthly salary → "Enter the salary amount". Salary date → "Enter the salary date".
Done: "Salary recorded", then straight to Home Loading and the safe-to-spend number.



Add transaction (+)
Fields: Spent / Upcoming switch (default Spent), date, paid to, amount, note (optional)
Empty: Blank form, Spent selected, today's date filled in.
Saving: Button reads "Saving in your personal ledger…"
Error: Date → "Enter the date". Paid to → "Enter the payee". Amount → "Enter the amount".
Done: Back on Home, a small message shows old number → new number.



## 5. The first screen's words
Headline: Know your safe-to-spend number until your next salary.
Button: Connect Gmail
Under it: We only read HDFC alerts.


## 6. Principles
1. Always show what information is considered to show the number
2. never use words that creates lack of trust in a user such as 'predict', 'guess', etc
