# Fashion Fiesta Studio

Business system for Fashion Fiesta Ladies Tailoring & Textiles, a ladies tailoring and wholesale clothing shop in Shabiya 12, Mussafah, Abu Dhabi. Used daily by two owners on desktop and phone, and by tailors on phones. Replaces Odoo. Fresh start, no data migration.

## How we work
- Saaqib is the product owner. You are the builder.
- Work phase by phase (see Roadmap). Before starting a phase, post a short plan (files, tables, screens) and wait for "go".
- Load the frontend-design skill before building any screen.
- After each phase: run typecheck, lint and build, then give Saaqib a short click through checklist: what to open, what to click, what he should see.
- Never skip ahead, never refactor other phases without asking.
- Keep answers short. No long explanations unless asked.
- Commit at the end of each phase with a clear message. Push to GitHub so Vercel deploys.
- Every phase ends deployed on Vercel production. No local testing by Saaqib, ever. You run typecheck, lint, build and your own checks locally, then push to main, wait for the Vercel deploy to finish, confirm it is live with no runtime errors using the Vercel MCP, and only then post the checklist with the live URL. Saaqib tests on the live URL and sends change requests. Changes get pushed and deployed the same way. Never ask him to run a dev server, open localhost, or check a preview URL.
- Test against a temporary Neon branch, never the live database. Delete that branch at the end of every phase without asking.
- Seed a test owner login on the first deploy and tell him the credentials once, so he can log in immediately.

## Infra
- GitHub: Saxqb777/fashion-fiesta-
- Neon project: fashion-fiesta (created via Neon MCP)
- Vercel project: fashion-fiesta in team saxqb777s-projects (created via Vercel MCP)
- Use the Neon and Vercel MCP tools for any infra change. Never ask Saaqib to click around dashboards.

## Business facts
- Legal name: FASHION FIESTA LADIES TAILORING & TEXTILES SOLE PROPRIETORSHIP L.L.C
- Address: Shabiya 12, Mussafah, Abu Dhabi, United Arab Emirates
- TRN: 100545592600003
- Currency AED. VAT 5% on all sales and purchases. Store money as integer fils, display 2 decimals.
- 90 to 95% of orders are custom stitched. Ready made is rare but allowed.
- Stitching is done in house by salaried tailors, or outsourced to stitching units (mostly Ajman). Fabric bought from fabric suppliers.
- Embroidery machine run by an operator on a 50/50 split with the shop, both directions (shop's customer or operator's customer).
- Wholesale customers (schools, spas, businesses) buy on credit and have branches. Retail walk ins pay cash or card at the counter.
- One shop, the shop is also the store room.
- Users: Owner (full access), Tailor (own tasks + POS). Any tailor may do POS sales.
- Everything (bank details, credit days, tailors, categories) is entered inside the app via the Setup Wizard and Settings. Nothing hardcoded except the defaults above.
- Free typed lines (standing rule): lines on quotes, sales orders, invoices and POs never require an existing product. The owner can type any description, quantity and price directly on the line. When a line is saved with a description that does not match an existing product, the system creates that product automatically (name from the description, category "Uncategorised", price from the line) and links the line to it, silently, no popup. Next time she types the same name, it autocompletes from products with the last price she used for that customer.
- Same for fabrics on a PO: a new fabric name creates the fabric record automatically.
- Fabric leaves stock only by a tap: "Fabric taken" on a task (owner or the tailor) or "Fabric sent" on an outsourcing PO, metres prefilled from metres per piece and editable. Lines given to a stitching unit get a draft outsourcing PO, one per unit per order.
- Quantities in purchases and stock are stored as integer hundredths (1250 = 12.50 m), like money in fils.
- Price on a product is only a default. The line price is always editable.
- Naming: a document the customer sends us (their purchase order) is always called "Customer PO" in the app. "PO" alone always means our own purchase order to a supplier, under Purchases.
- Sales orders have a "Customer PO number" field. It prints on the Delivery Note and the Tax Invoice.
- New order and New quote have three ways in: manual lines, "Add lines from Excel" (template download, upload or paste, preview with errors in red, one draft per branch when a Branch column is present), and "Read their document" (AI, idea 1, Phase 3.5).
- Apply the free typed lines rule in Phase 2 for quotes and orders, Phase 3 for invoices, Phase 4 for POs.

## Stack
- Next.js App Router, TypeScript strict, Tailwind
- shadcn/ui as base primitives only, fully restyled with our tokens
- Neon Postgres + Drizzle ORM, migrations in repo
- Auth: Auth.js credentials (email + password). Owner creates all accounts. No self signup.
- Photos: Vercel Blob
- PDFs: @react-pdf/renderer
- Motion: framer motion, used sparingly
- PWA: installable, tailor screens must work on a cheap Android phone
- Deploy: Vercel. Env vars in .env.example, never commit secrets.

## Design system (this matters most)
This must not look like an ERP or a template. Target reaction from the owners: "wow".

Tokens (start here, sample the real logo at public/brand/logo.png and adjust):
- Background paper: #FAF7F2
- Surface: #FFFFFF
- Ink: #1F1A17
- Muted ink: #6F6560
- Brand red (hero): #D7182A
- Brand red deep: #B3121F
- Accents from the logo swoosh, used only for status tags, chart lines and tiny details: magenta #E6007E, green #8DC63F, blue #00AEEF, yellow #FFD200
- Border: #E8E1D9
- Radius: 14px cards, 10px inputs, full for pills
- Shadows: almost none. Use borders and background shifts for depth.

Type:
- Headings and big numbers: Fraunces (display serif)
- Body and UI: Manrope
- Numbers in tables use tabular figures

Rules:
- Home screen is called "Today", not Dashboard. One hero number (cash in hand), then "Needs your attention" as a list of items each with exactly one action button. Not a grid of four stat tiles.
- Every order shows a stage tracker: Quote → Confirmed → Stitching → Ready → Delivered → Invoiced → Paid. Current stage highlighted in red, next action button right under it.
- Tailor tasks are photo cards. Approved work goes into a Gallery page.
- Customer tiers: VIP, Regular, New. VIP sorts first and gets a small magenta tag.
- Empty states always teach: one sentence and one button to add the first record. Never an empty table.
- Celebrations: payment received, invoice fully paid, task approved get a short satisfying animation (under 1 second). Big numbers count up on load.
- Tailor phone screens: max three primary actions per screen, buttons at least 48px tall, camera upload front and centre.
- Sidebar rule (standing): the sidebar stays at these 8 items forever. Every new feature lives inside an existing page, Today, Reports, Settings or Team. Never a new menu item.
- Forbidden: purple or blue gradients, emoji in the UI, icons inside coloured circles on stat cards, "Welcome back" banners, lorem ipsum, placeholder avatars, generic admin sidebar with 20 items. Sidebar is short and grouped: Today, Orders, Customers, Money, Workshop, Purchases, Reports, Settings.
- Copy is plain and warm. "Who owes you", not "Accounts receivable". Keep the accounting term as a small secondary label where it helps.
- Hyphens and em dashes are not used in UI copy or documents. Use colons or full stops.

## Documents (PDF templates)
One shared template family: Quote, Sales Order confirmation, Delivery Note, Tax Invoice, Credit Note, Receipt, Statement of Account, Purchase Order.
- A4. Red header band with the logo on the left, document title on the right in Fraunces.
- Thin accent stripe under the header using the four swoosh colours.
- Company block with legal name, address, TRN. Customer block with name, branch, TRN if any, and the Customer PO number on the Delivery Note and Tax Invoice when the order has one.
- Lines table with description, qty, unit price, VAT 5%, line total. Totals box: subtotal, VAT, grand total, amount paid, balance due.
- Footer: bank details from Settings, payment terms, thank you line.
- Tax Invoice must satisfy UAE FTA requirements: the words "Tax Invoice", supplier TRN, date, unique number, VAT amount shown.
- Numbering: FF-Q-0001, FF-SO-0001, FF-DN-0001, FF-INV-0001, FF-CN-0001, FF-RCT-0001, FF-PO-0001. Prefixes editable in Settings, never reused.
- An issued Tax Invoice is never edited or deleted. Corrections are Credit Notes (FF-CN).
- Deposits: a payment can be taken on an order before it is invoiced. It shows on the order page and prints on the invoice as "Paid in advance".
- Walk ins: a retail order can be invoiced and paid in one step.
- Every PDF has a Send on WhatsApp button (idea 8).

## Data model (core tables)
users, customers, customer_branches, suppliers (type: fabric | outsourcing), products, fabrics, quotes, quote_lines, sales_orders, so_lines, tasks (status: assigned | in_progress | submitted | approved | rejected | declined, photos as blob urls; assigned to a tailor or, until Phase 4 POs exist, to a stitching unit), purchase_orders, po_lines, supplier_bills, supplier_payments, invoices, invoice_lines, credit_notes, credit_note_lines, delivery_notes, delivery_note_lines, payments (with allocations to invoices), embroidery_jobs, expenses, cash_book, pos_sales, pos_sale_lines, stock_movements, notifications, activity_log, settings.
- Every table: id (uuid), created_at, updated_at, created_by.
- Soft delete where a record can have history (customers, suppliers, products). Hard delete only for drafts.
- activity_log records who did what on every create, update, status change.

## Roadmap
Phase 0: Scaffold, tokens, fonts, layout shell, auth, Settings, first run Setup Wizard (owner account, company details prefilled, bank details, default credit days, VAT, numbering, add tailors and embroidery operator, "setup complete" flag). Deploy to Vercel so Saaqib can open it on his phone.
Phase 1: Master data: Customers (+ branches, tiers, credit terms), Suppliers, Products, Fabrics. Full add, edit, search, soft delete.
Phase 2: Quotes → Sales Orders with lines, assign each line to a tailor task or an outsourcing PO, stage tracker, tailor phone screens (My tasks, task detail, photo upload, submit), owner approve or reject, Gallery.
Phase 3: Invoices from SO (full or partial), payments with allocation, receipts, statements, all PDF templates, overdue logic from credit days, due reminders in Today.
Phase 3.5: "Read their document" (idea 1, AI). Upload a Customer PO, a quote, Excel, a photo or a screenshot; Claude reads it and fills the order screen with lines tagged "from document, check", unknown fields in red. Nothing is saved until she presses Save as draft or Confirm. One order per branch when the document covers several.
Phase 4: Purchase Orders, goods receipt into fabric stock, supplier bills, supplier payments, stock movements when fabric is issued to a task.
Phase 4.5: Key Account mode. A switch on any customer. When on, the customer page becomes a full account space for the owners only: branches with emirate, address, contact and delivery notes (importable from Excel); optional staff per branch with role and sizes; an account catalogue of their uniform items with agreed prices; order lines allocated per branch and per staff; delivery runs grouped by emirate, assigned to a delivery company, one delivery note per branch with delivered or pending status; one Tax Invoice per order covering all branches, carrying their Customer PO number, with an optional per branch quantity breakdown section when the customer wants it; and an account report tab (orders by season, per branch, delivered vs pending, balance, days to pay). All of it is the same data as the rest of the system, filtered to that customer, so overall reports still include them. First key account is Bedashing.
Phase 5: Cash book (auto entries from every money event), Expenses, Embroidery jobs with 50/50 settlement, POS quick sale for tailors (cash or card, receipt share).
Phase 6: Today screen, Reports (who owes you with aging, sales by customer, VAT summary for filing, tailor output), notifications, celebrations, PWA, polish pass against the Design system rules.
Phase 7: Seed script with realistic demo data, handover notes for the owners.

## Parked for v2
POS card terminal integration (provider to be confirmed), tailor attendance, WhatsApp reminders, deeper reports, connect an accredited e-invoicing provider (idea 28 prepares the export). (Salaries moved to Phase 5, idea 17.)

## Ideas backlog
Status values: proposed, approved, built. Saaqib marks ideas approved. Build only approved ideas, in the phase they belong to. Never build a proposed idea without approval.
Standing permission: small taste improvements (spacing, wording, micro animation, a smarter default) are allowed in any phase if they follow the Design system rules. Flag each one in the end of phase checklist.

1. Paper in, record out. built for customer documents (Phase 3.5). Supplier delivery note photos stay approved, with the other AI ideas after Phase 6. Effort: large.
   What: upload a Customer PO or a customer's own quote (PDF, Excel, photo, WhatsApp screenshot, handwritten slip) and Claude turns it into a draft quote or order with lines to check; photo a supplier delivery note and it prefills the goods receipt. Nothing is saved until the owner confirms.
   Why: most orders start as a scribble. She checks instead of types.

2. Measurement card. built. Build in Phase 2 with orders and tasks (store and prefill). Effort: medium.
   What: body measurements saved once per customer, and size runs per branch for wholesale. New order lines prefill from last time with a "still the same?" nudge.
   Why: no notebook hunting, no re measuring a regular.

3. Last price memory. built. Phase 2. Covered by the free typed lines rule. Effort: small.
   What: an order line prefills the unit price from this customer's last order of the same product, with a small "last time 45.00" chip.
   Why: she never has to remember what she charged the school in March.

4. Order again. built. Phase 2. Effort: small.
   What: one tap on any past sales order copies its lines, sizes and prices into a new order; she only edits quantities.
   Why: school uniform repeats every term take seconds, not a rebuild.

5. Batch done. built. Phase 2. Effort: small.
   What: a tailor types "25 of 30" and takes one photo of the stack; the order line shows a progress bar instead of 25 separate submissions.
   Why: she sees how far the order is without asking anyone.

6. Pick this roll. built. Shelf location in Phase 1; task card with metres to cut, Fabric taken and short stock warning in Phase 4. Effort: medium.
   What: a task card shows the fabric photo, its shelf spot and metres to cut; assigning a task warns if stock is short.
   Why: no wrong roll, no half cut orders, no walk to the shelf to check.

7. What to say when you call. proposed. Phase 3. Effort: small.
   What: the customer page shows a call box: balance, oldest unpaid invoice, last payment, promised date, tap to call. One tap records "they promised the 15th" and Today reminds her that morning. Broken promises count on the customer.
   Why: every dues call starts prepared and ends with a date, not a maybe.

8. Send on WhatsApp. approved. Phase 3, on every PDF. Effort: small.
   What: every document has a Send button that opens WhatsApp to the customer's number with a short message and the PDF.
   Why: the invoice reaches the school before she puts the phone down.

9. Daily close. approved. Phase 5. Effort: medium.
   What: end of day screen. The owner enters counted cash; the system shows expected cash, card total and the difference, flagged in red if it does not match. One per day, kept in history.
   Why: thirty seconds at closing, and the morning hero number is true.

10. Can we promise that date. proposed. Phase 2. Effort: medium.
    What: when confirming an order, the screen shows how many pieces each tailor already has due before the promised date and flags a tight date. Not a planner, just a warning.
    Why: she stops promising Thursday when the workshop is full.

11. Dues call script. proposed. AI, together after Phase 6. Effort: small.
    What: Claude writes what to say when calling about dues, from the customer's invoices, payments and past promises. Builds on idea 7.
    Why: a polite, prepared call every time.

12. WhatsApp message drafts. proposed. AI, together after Phase 6. Effort: small.
    What: ready to send messages: payment reminder, order ready, quote follow up, in the customer's tone and language.
    Why: no typing the same message twenty times a week.

13. Ask your shop. proposed. AI, together after Phase 6. Effort: medium.
    What: type a question such as "how much did Bedashing order this year" or "who is late paying" and get the answer from the shop's own data.
    Why: answers without building a report.

14. Save as draft for orders. built. Phase 2 follow up. Effort: small.
    What: orders can be saved as a draft: no number, no tasks, not in any report, until she presses Confirm order.
    Why: park an incomplete order without it counting anywhere.

15. Add lines from Excel. built. Phase 2 follow up. Effort: medium.
    What: New order and New quote take a template, an uploaded sheet or pasted rows; preview with errors in red; one draft per branch when a Branch column is present.
    Why: big corporate orders in one go.

16. Opening balances. approved. Phase 3. Effort: medium.
    What: a setup step and a Settings tab for cash in hand today, who owes you now (customer, amount, since when) and who you owe now (supplier, amount). These seed the first invoices, bills and cash book so day one numbers are right.
    Why: the app starts with the real numbers, not zero.

17. Salaries. approved. Phase 5 (moved from v2). Effort: medium.
    What: each tailor on Team has a salary, pay day and pay history. Today warns before pay day with the total. Mark paid writes to the cash book and expenses.
    Why: pay day never surprises the cash drawer.

18. Profit per order. proposed. Phase 5. Effort: medium.
    What: price minus fabric used, outsourcing cost and embroidery share, shown on the order page once delivered.

19. Monthly P&L. proposed. Phase 6. Effort: medium.
    What: sales, minus fabric, outsourcing and embroidery share, minus salaries, minus expenses, equals operating profit. Starts from the go live month, no old data.

20. Customer health. proposed. Phase 6. Effort: small.
    What: last order date, total this year, average days to pay, and a nudge when a customer has not ordered for 90 days.

21. Tailor scorecard. proposed. Phase 6. Effort: small.
    What: pieces per week, on time percentage, rejection rate.

22. Catch up feed. proposed. Phase 6. Effort: medium.
    What: "Needs your attention" on Today covers overdue invoices, tasks to review, tailor questions, salary due, supplier bills due, quotes unanswered for 7 days, fabric running low and the daily close difference. One button each.

23. AI setup assistant. proposed. AI, after Phase 6. Effort: large.
    What: a chat during setup that asks about the business and imports customers, suppliers, products and opening balances from Excel or photos.

24. Weekly digest. proposed. AI, after Phase 6. Effort: small.
    What: a Saturday morning summary of what happened, what is due and who to chase.

25. VAT return pack. approved. After Phase 6, as a "Tax" tab under Reports. Effort: medium.
    What: quarterly figures laid out like the FTA return boxes (standard rated supplies by emirate, output VAT, purchases, recoverable input VAT, net payable), each box drilling down to the invoices and bills behind it. Export to PDF and Excel for the accountant. Submission stays manual on EmaraTax.

26. AI review before filing. approved. After Phase 6, Tax tab. Effort: small.
    What: Claude checks the quarter for missing TRNs, invoices still in draft, input VAT on bills without a tax invoice, unusual swings versus last quarter, and writes a plain language list of what to fix.

27. Corporate tax pack. approved. After Phase 6, Tax tab. Effort: medium.
    What: yearly P&L summary with a Small Business Relief check and a checklist for the accountant.

28. E-invoicing readiness. approved. After Phase 6, Tax tab. Effort: medium.
    What: UAE Peppol PINT format export of every Tax Invoice, so an accredited service provider can be connected before 1 July 2027.

29. Fabric metres per garment. built. Phase 4. Effort: small.
    What: each product has a default metres used, editable per order line. Drives fabric stock out and profit per order.

30. Credit limit warning. built. Phase 4. Effort: small.
    What: on new order and on confirm, warn when the customer is over their credit limit or has overdue invoices, with the amounts. Warn, never block.

31. Alterations and repairs. proposed. Effort: small.
    What: one tap quick job that creates a mini task and a small invoice, no order flow.

32. Fitting appointments. proposed. Effort: small.
    What: a trial date on an order, with a reminder on Today.

33. Bank statement import. proposed. Effort: medium.
    What: upload the bank Excel, match payments to invoices, flag what does not match.

34. Data export. proposed. Effort: small.
    What: one button exports everything to Excel, so the owners are never locked in.

35. Garment labels. approved. Phase 4.5. Effort: small.
    What: print a small label per piece from an order: customer, branch, person, size, order number. Tick off each piece at delivery.

36. Embroidery design files. approved. Phase 5, with embroidery jobs. Effort: small.
    What: store the digitised machine file per customer with thread colours, size and placement notes. The operator downloads it from the embroidery job.

37. Salary advances. approved. Phase 5, with salaries. Effort: small.
    What: record an advance to a tailor, deduct it automatically on pay day, show the balance on Team.

38. Rework task. proposed. Effort: small.
    What: one tap from a credit note or an order creates a fix task linked to the original order.

39. Sample stage. proposed. Effort: small.
    What: an optional "Sample" stage before Stitching, with a photo and the customer's approval date.

40. Tailor language toggle. proposed. Effort: medium.
    What: Urdu and Hindi hints on tailor screens. English stays the default.

41. Quote accepted by link. proposed. Effort: small.
    What: the shared quote has an Accept button; tapping it confirms the order with a timestamp and notifies the owner.

42. Push notifications. proposed. Phase 6. Effort: medium.
    What: the tailor's phone buzzes on a new task; the owner's phone on payment received or task submitted.

43. Embroidery Studio. proposed. After Phase 6, inside Workshop. Effort: large.
    What: the owner or operator uploads a logo or image, sets the size in cm and the thread colours. The system cleans and vectorises the image, auto digitises it to a machine file (DST by default, format set per machine model in Settings), shows a stitch preview and stitch count, and saves it as the customer's design file. The operator downloads it and finishes the work on the machine and his own software. The system makes the first file, the operator owns the final. Research Ink/Stitch for the digitising step before planning this.

44. Email from the system. approved. Phase 6. Effort: medium.
    What: Settings gets "Connect email": an owner signs in with Google once and the system sends from her own Gmail address (send permission only, never reads the inbox). A second owner can connect her own. Every PDF (Quote, Sales Order confirmation, Delivery Note, Tax Invoice, Credit Note, Receipt, Statement, Purchase Order) gets a "Send by email" button next to "Send on WhatsApp": a ready email with the recipient from the customer or branch contact, subject and short body from a template editable in Settings, PDF attached; she reviews and taps Send. Sent emails are logged on the record (when, to whom, by whom, the PDF version that went) with one tap Resend. Due reminders and statements go the same way from Who owes you, one customer or several at once. With no email connected, the button explains in one line how to connect it.

45. Fiesta, the Fashion Fiesta assistant. approved. After Phase 6, the first AI item, before the Tax tab. Effort: large.
    What: a floating button bottom right on every page, owner only at first, opening a chat panel powered by Claude that knows this business from the live data: shop, customers, orders, money, workshop, fabric, tailors, embroidery and UAE VAT rules.
    - Takes her there: "open Bedashing", "show overdue", "new quote for Al Dahra" navigates to the page or record with filters and fields prefilled.
    - Answers from the data: "how much did Bedashing order this year", "who hasn't paid", "how many pants did Ahmed stitch this month", "which fabric is low".
    - Prepares actions she confirms with one tap: record a payment, assign a task, create a draft order or quote, send a reminder by email or WhatsApp.
    - Explains the screen she is on in plain words.
    - Drafts emails and WhatsApp messages to customers, suppliers or tailors in her tone.
    - Talks business: ideas, pricing, a late payer, what to offer a new spa, how other uniform suppliers work, grounded in her own numbers when relevant.
    Rules: Fiesta can read anything and prepare anything, but saves or sends nothing without her tap. Same design tokens as the app, Fraunces for its name, red only on the confirm button. Conversation history kept per owner. Works on phone. Fiesta covers ideas 12 (WhatsApp message drafts) and 13 (Ask your shop).

46. Fiesta for tailors. proposed. Effort: medium.
    What: task questions answered on the tailor's phone screens, in Urdu and Hindi too.

Open questions for Saaqib:
- Embroidery machine brand and model: confirm with the operator. It decides the machine file format for ideas 36 and 43.

(Ask your shop is idea 13, already in the backlog.)

Notes: Reading customer documents (idea 1) is Phase 3.5. After Phase 6, Fiesta (idea 45) comes first, then the Tax tab (ideas 25 to 28), then the other AI ideas (11, 23, 24 and supplier note photos).
