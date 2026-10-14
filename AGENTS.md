# AGENTS.md

## 1. How the product works
Interface: an app screen on the phone; key call to action is 'click to know your safe to spend number'
Business logic: Gmail alerts become ledger rows. A Convex action sends those rows to the AI with 'review last 6 months HDFC UPI alerts, forecast the remaining days until salary, adjust for upcoming expenses added by the user', including fixed bills like those paid by the 25th. Safe-to-spend = salary (entered by the user) minus spent so far since salary minus that forecast.
Database: transactions (amount, spent or received, mode: UPI or manually added, date, day of month), salary amount and salary date
Third party: Login via Google; Gmail API (reads HDFC alerts), keys GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, both in Convex environment variables, dev and prod; AI model gpt-6-luna, key OPENAI_API_KEY in Convex environment variables, dev and prod
Not in v1: recording transactions from voice commands

When I report a bug, I'll name the part. Look there first, and tell me if you think I named the wrong one.

## 2. How we work
- Read IDEA_SCOPE.md, PRODUCT.md, PLAN.md and PROGRESS.md before anything else, and DESIGN.md before any screen work.
- Before writing code, tell me in two or three sentences what you think I'm after, then your plan. Wait for my yes. Don't guess.
- One milestone at a time: the next one in PLAN.md, working end to end. Nothing outside it.
- If I ask for something new mid-milestone, add it to the parked list in PLAN.md and carry on.
- Never say "done" until you've seen it work (a test, or a screenshot at phone width) and told me how to check it on my phone.
- When I report a bug, find the cause before changing anything. Fix only that.
- When we add something new, write tests so what already works doesn't break. When I drop a feature, drop its tests.
- Build and test only in the phone browser, at the live link. No web test page for a product that lives somewhere else.
- After I confirm a milestone works: commit, push, and add one line to PROGRESS.md.
- Never put a key or password in code, in a VITE_ variable (those are sent to every visitor) or in a committed file.
- Highlight any bug to me and resolve it only after my go-ahead.


## 3. Shipping
Live link: https://groovy-gull-418.convex.site
Repo: https://github.com/guptashubham389/finsightx, public
Deploy: npm run deploy. A push never deploys by itself. After I say a milestone works: commit, push, then deploy.
Keys: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY lives in Convex environment variables, set for dev and for prod. Never in code, a VITE_ variable or a committed file. Never ask me to paste it into chat.
.gitignore covers .env.local.
Real people's data (chats, names, phone numbers) never goes in the repo, not even as a test file. Tests use made-up examples.
Every limit and every "is this allowed" check happens in a Convex function, never only on screen.
Before I share the link: I open it on my phone, logged out, on mobile data, and do the core flow once.


## 4. The AI call
Model: gpt-6-luna, thinking low
What goes in, and its limit: at most 200 alert rows,if more, keep the latest 200
Where it runs: a Convex action. Never in the interface.
Key: OPENAI_API_KEY in Convex environment variables, dev and prod.
Reply cap: max_output_tokens - 500
Calls cap: at most 100 AI calls an hour across the app, checked in the kitchen (Convex rate limiter)
Provider limit: a hard monthly limit of 5$ amount, set by me
When a cap is hit or the call fails: show "we will get back soon"
Login: Google
The AI must never: never do the safe-to-spend arithmetic, never invent a transaction that isn't in the alerts, never give advice on investing or loans.
