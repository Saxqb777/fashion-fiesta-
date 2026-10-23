# NOTES: working memory

Newest at top. Keep under 150 lines. Rules for this file are in CLAUDE.md under "How we work".

## Where we are (2026-10-23)
- Live: https://fashion-fiesta-three.vercel.app (Vercel production, deploys from main)
- Done and live: Phases 0 to 7, Fiesta (idea 45) and the Tax tab (ideas 25 to 28), all shipped 2026-10-23.
- Next on the roadmap: the other AI ideas (11, 23, 24, supplier note photos), only once Saaqib approves them.
- Tax decisions (2026-10-23): every standard rated sale goes in box 1a Abu Dhabi (fixed establishment), emirate is only a drill down filter; financial year is the calendar year; VAT quarters calendar until Saaqib confirms the real period from the FTA certificate.
- Email: Resend domain fashionfiestauae.com created (eu-west-1) and RESEND_API_KEY is in Vercel. Waiting on Saaqib to add the 5 DNS records at Openprovider (4 for Resend plus the studio CNAME). Then I run verify-domain and send a test email.
- Phase 4.5 Key Account mode shipped 2026-10-22. Bedashing is a key account with 24 unverified branches on production. Checklist sent.
- Small deploy (measurement templates, pieces link, nightly backup, bug fixes) shipped 2026-10-22. Checklist sent.
- Bugs fixed in that deploy, all in earlier phases:
  - A deposit already used could be applied again on the next invoice. No real payments were in production yet, so no data was affected.
  - The customer list always showed 0 branches, and the supplier list always showed 0 fabrics.
  - On the order editor, Save could fire before the customer's details had loaded.
  - Save buttons with their own disabled rule did not grey out while saving.
  - Cause of the first two: a Drizzle subquery without a join renders a bare "id". Always write the table name in raw subqueries.

## Half done
- Nothing.

## How the Tax tab works (for later work)
- Reports, Tax: VAT return (/reports/tax), Corporate tax (/reports/tax/corporate), E-invoicing (/reports/tax/e-invoicing). /reports/vat redirects.
- lib/tax/vat.ts vatPack(): full VAT 201 boxes with the documents behind each. Purchases count only with VAT and a supplier TRN; the rest is listed as not claimable.
- tax_periods: one row per quarter once touched. Status not_started (no row), pack_ready, filed (date and EmaraTax reference). Only after the quarter ends. Review JSON kept on the row.
- Check this quarter (lib/tax/review.ts): fixed rule checks (shop TRN, wholesale customers without TRN, delivered not invoiced, deposits before invoice, VAT without supplier TRN, invoice VAT not 5 percent, quick sale over AED 10,000, credit notes, swings vs last quarter), then Claude rewrites the wording only. Buttons always come from the rules.
- Corporate: monthly P&L added up, SBR (revenue up to AED 3m, years ending by 31 Dec 2026), 9 percent above AED 375,000, year end balances from the app. Return due 30 Sep of the next year.
- E-invoicing (lib/tax/einvoice.ts): PINT AE 1.0.1 UBL. billing-1@ae-1, flags 00000000, endpoint scheme 0235 with the TIN (first 10 digits of the TRN), emirate codes, credit note reason codes DL8.61.1.A to E. Seller needs the trade licence (Settings, Money). Not validated against the official Schematron yet: the ASP will validate.
- Downloads: /api/tax/vat-pack?q=, /api/tax/corporate?y=, /api/tax/xml?kind=&id=, /api/tax/einvoices?q= (zip, fflate). Excel: /api/reports/vat and /api/reports/corporate.

## How Fiesta works (for later work)
- Floating button bottom right for owners only (not tailors, not practice logins). Chat panel: right sheet on a laptop, full screen on a phone.
- POST /api/fiesta streams NDJSON events (text, tool status, card, nav, error, done). Model claude-opus-5-5, adaptive thinking, effort medium, server side refusal fallbacks ("default"), cached system prompt and tools. Max 10 turns per question.
- Tools in lib/fiesta/tools.ts: read tools (customers, orders, reports, tailor output, tasks, team, fabric, money) and prepare tools (navigate, payment, reassign task, draft order or quote, statement email, message draft). Prepare tools only return a card.
- Her tap goes to actions/fiesta.ts confirmCard, which calls the same actions the screens use (recordPayment, reassignTask, importDrafts, sendDocEmail), so every rule still applies. A "Confirmed card <id>" line is appended to the chat so the card shows Done later.
- Transcript per conversation in fiesta_messages, stored exactly as exchanged and only appended to. Today's date and the screen text travel with each message, never in the system prompt (keeps the cache). Works in Practice on sandbox data.

## How Phase 7 works (for later phases)
- Two databases on the Neon project: neondb (Live) and practice (sandbox). `db` from "@/db" picks per request: the proxy reads the signed session and sets header x-ff-db (browser values are stripped); dbMode() reads it from Next's request store. withDb("practice" | "live", fn) forces one; liveDb is always Live.
- Logins always check Live first. Practice tailor logins (ahmed@ / imran@ / sajid@practice.ff, password practice1) exist only in the sandbox and can never reach Live. Real tailors always stay on Live.
- Owner mode is in the JWT and users.practice_mode (Live). Switching reloads the page fully.
- Reset practice = buildSandbox() in lib/practice/seed.ts: truncates the sandbox, copies settings, owners, customers, branches, master data from Live, then seeds about 60 orders and 3 months of money relative to today. Takes about 5 seconds. Mission progress lives in the sandbox, so a reset clears it.
- Missions: words in lib/practice/missions-data.ts, checks in lib/practice/index.ts. Ticks come from sandbox data or practice_events (taps marked data-track, page views). Buttons to glow carry data-mission.
- In Practice: emails are logged as sent but never leave; WhatsApp opens to the owner's own phone (users.phone, else shop phone; both empty today, so it opens the WhatsApp picker); share links carry a practice flag and open the sandbox copy.
- Migrations run on both databases during the build. New tables must work in both.

## How Phase 6 works (for later phases)
- notify(to, note) in lib/notify.ts: one row per user in notifications, then web push after the response. Dead push subscriptions are removed on 404/410.
- Reports read from lib/reports.ts. Each report is a Table, so the page and the Excel download (/api/reports/[name]) share the same data via lib/report-registry.ts.
- VAT quarters start from settings.vatPeriodStartMonth (Settings, Money). Purchases count for input VAT only with VAT and a supplier TRN.
- P&L: fabric is a cost when taken or sent (cost per metre), not when bought. Before VAT throughout.
- Email: lib/email.ts posts to Resend from {emailFromLocal}@EMAIL_DOMAIN, reply to the sending owner, PDF attached. Every send is in email_log and shows on the record. Templates in Settings, Email; empty means default.
- Statements to many customers at once: Money, Who owes you, Email statements.
- Raw SQL: do not use month, week, or other keywords as bare aliases.

## How Phase 5 works (for later phases)
- cash_book is the single money ledger. Every money action writes its own row in the same batch (cashEntry in lib/cash.ts): customer payments, quick sales, supplier payments, expenses, salaries, advances, embroidery settlements, moves between pots, daily close differences, opening cash. Pots: cash (drawer) and bank (card, transfer, cheque).
- Daily close writes the difference to the cash book, so the drawer balance equals what was counted. Count again the same day replaces it.
- Embroidery: balance with the operator = done jobs (shop's customer: operator's share owed to him; his customer: shop's share owed by him) minus settlements. Share percent is frozen per job.
- Quick sale: FF-POS Simplified Tax Invoice. Tailors can open only their own sales and PDFs.
- Salary payment: gross is the expense (category Salaries), advances taken off, only the net leaves the cash book.

## How Phase 4.5 works (for later phases)
- Customer page tabs when Key account is on: Overview, Branches, Staff, Catalogue, Orders, Deliveries, Report. Same page, no new menu item.
- Order lines can be split per branch and person (so_line_allocations). Parts must add up. Parts on a delivery note cannot be removed.
- Delivery notes have a status. Counter notes are delivered at once. Run notes start pending. Only delivered notes move the order stage; pending ones still count against what is left to send.
- Garment labels: worked out from lines and splits, ticked off per piece (piece_ticks). Layout in Settings, Shop.
- Agreed prices (account_items) beat last price when she picks the item.

## Decisions (newest first)
- 2026-10-23: VAT period start month is left for the owners to set themselves in Settings, Money (VAT period). Calendar quarters until they change it. Not an open question any more.
- 2026-10-23 Email: Saaqib's Resend account (Gmail login) holds another domain (docledger.site), so the app gets a send only key restricted to fashionfiestauae.com, not full access. It cannot read domains, so Settings, Email shows Connected for it (status "send_only"). Domain checks go through the Resend connector instead.
- 2026-10-23 Tax tab answers: all standard rated sales go in box 1a Abu Dhabi (the shop's fixed establishment); emirate is only a filter in the drill down. Financial year is the calendar year. VAT quarters stay calendar until Saaqib confirms from the FTA certificate.
- 2026-10-23: Main login password sorted by Saaqib himself, no reset needed.
- 2026-10-23 Fiesta: Saaqib said "plan it and go". Curated tools instead of free SQL, so passwords and secrets can never reach the model. Navigation needs no tap; anything that saves or sends always needs her tap on a card. Ideas 12 and 13 are covered by Fiesta.
- 2026-10-22 Phase 7 build: on a laptop the missions card sits inside the sidebar so it never covers a button; on a phone it starts folded as a pill. Seeded photos are drawn illustrations (no stock photos). Fabric mission uses the new Add lines from Excel on the PO screen.
- 2026-10-22 Phase 7 go: Phase 7 is now Practice mode and missions (CLAUDE.md roadmap updated). Practice is a second Neon database "practice" on the same project. Real tailors always stay on Live; tailor missions use practice only tailor logins. The PO screen gets "Add lines from Excel" for mission 9. Reset practice also clears mission progress.
- 2026-10-22 Phase 6 build: Reports tabs are Who owes you, Sales, Profit, VAT, Tailors, Customers. Settings got an Email tab. The "Soon" and Phase badges were removed from the menu, since every section is now built.
- 2026-10-22 Phase 6 answers: email is sent from an address on fashionfiestauae.com through Resend, with replies going to the owner's Gmail. Ideas 19, 20, 21, 22 and 42 approved; push notifications go to owners and tailors. The VAT period is calendar quarters by default, with the start month as a setting in Settings, Money (Saaqib confirms it from the FTA certificate).
- 2026-10-22: Opening bank balance added next to opening cash (Settings, Opening balances). It seeds the cash book's Bank pot. Reason: card and transfer money made the bank go negative without a start figure.
- 2026-10-22 Phase 5 answers: quick sale prints a Simplified Tax Invoice in its own series FF-POS. Embroidery 50/50 runs as one balance with the operator, settled any time. Card money goes to the Bank pot. Salaries are paid from cash or bank, chosen each time.
- 2026-10-22: Every document series starts at 1001 (FF-Q-1001 and so on, FF-POS-1001 too). Live sequences reset; checked first that nothing had been issued. Reason: Saaqib's choice.
- 2026-10-22: Domain DNS record will be added by Saaqib after everything is fully live.
- 2026-10-22: Custom domain studio.fashionfiestauae.com added to Vercel. DNS sits with Openprovider (the Webador site), so Saaqib adds a CNAME there. Share links switch to it by themselves once the CNAME points to Vercel (PUBLIC_APP_URL plus a DNS check). Reason: no broken links before the record exists.
- 2026-10-22: Quote validity days and terms in Settings, Money. Expired is shown, not stored. Stamp in Settings, Shop, prints on Tax Invoice, Delivery Note and Credit Note only (not Quote or PO), as asked.
- 2026-10-22: Neon stays on the Free plan for now; Saaqib will decide on Launch later. Reason: still testing, and the nightly Excel backup covers it. Launch costs about $10 to $16 a month.
- Measurement templates: per garment type, an ordered pick from the master field list. Each category maps to a template, and old sets stay as they are. Reason: show only the relevant fields when measuring.
- Phase 4.5:
  - Delivery company is a supplier with type "Delivery". Reason: no new menu item, and it reuses bills and payments.
  - Season is a free label with autocomplete. Reason: no fixed list to maintain.
  - Labels print on A4 sticker sheets, 24 per sheet, 70 x 37 mm, with the layout kept as a setting. Reason: a thermal printer can be added later.
  - Splitting a line per branch is optional, and the parts must add up. Reason: most orders are not split.
  - Delivery notes go per branch, with one Tax Invoice per order and an optional per branch breakdown. Reason: this is how Bedashing works.
  - Bedashing gets Key Account mode on, with branches preloaded from their website as unverified. Reason: the account page must not be empty for the demo.
- Backups:
  - The app exports itself nightly, and Neon gets upgraded when the shop goes live. Reason: the free plan has no scheduled snapshots, and point in time restore is only 6 hours.
  - Backups are encrypted (AES-256-GCM, key derived from AUTH_SECRET) and kept in the main public Blob store. Reason: a private store could not be connected via MCP.
  - The private Blob store "fashion-fiesta-backups" exists but is unused and empty.
- Phase 4:
  - Metres use 2 decimals, stored as hundredths.
  - One draft outsourcing PO is made automatically per unit per order.
  - "Fabric taken" is a tap on the task, with metres prefilled and editable, by the owner or the tailor.
  - "Fabric sent" on outsourcing POs works the same way.
  - An empty credit limit means no limit, and the warning shows overdue only. The warning never blocks.
- Phase 3.5:
  - The model reads Customer PO files, and the original file is kept on the order or quote as "Customer PO file".
  - Sizes and per person names go into line notes in a structured way.
  - ANTHROPIC_API_KEY lives only in Vercel and in the gitignored .env.local.
- Phase 3 PDFs:
  - PAID mark, signatory and stamp box, "Payments received".
  - Statement wording: "Balance from previous records" and "Credit on account".
  - Delivery Note and Credit Note footers show phone and email, not bank details.
- 40 customers were seeded into production by a one time script. Bedashing has the note "Key account, Phase 4.5".

## Open questions for Saaqib
- Owner phone numbers are empty, so Practice WhatsApp opens the contact picker instead of his own chat. Add a phone in Settings, Team.
- Add the DNS records at Openprovider (table sent 2026-10-23): TXT resend._domainkey, MX send (feedback-smtp.eu-west-1.amazonses.com, priority 10), TXT send (v=spf1 include:amazonses.com ~all), CNAME rsend (send.forge.rmta.net), CNAME studio. Then say "DNS added".
- Trade licence number and issuer, in Settings, Money (needed on e-invoices).
- The studio CNAME is in the same DNS table: name "studio", value 94f92b8040c50980.vercel-dns-016.com.
- Embroidery machine brand and model: to confirm with the operator. It decides the file format for ideas 36 and 43.
- Neon Launch plan (later, his call): gives a 7 day rewind window and daily snapshots. He adds a card in Neon billing, then I set both up.

## Infra facts
- Neon: project little-mud-41727057, main branch br-mute-feather-b3bhmnqk. Manual snapshot "before-phase-4" exists.
- Vercel: project prj_grSCaYpWGqE93VbWkOQzahVzymA0, team team_yKuXQ8P3eoGrvRnTWMIqSiGo, region sin1.
- Env vars are in Vercel for all three environments: DATABASE_URL, AUTH_SECRET, BLOB_READ_WRITE_TOKEN, ANTHROPIC_API_KEY, CRON_SECRET. They are never in git.
- Cron: /api/cron/backup at 22:00 UTC.
- Migrations live in /drizzle and run during build, on Live and Practice. The latest is 0016_tax.
- Vercel also has NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, EMAIL_DOMAIN, PRACTICE_DATABASE_URL. RESEND_API_KEY (send only, fashionfiestauae.com only).
- Careful: .env.local holds the production DATABASE_URL. For tests always export the branch URL after sourcing it.
