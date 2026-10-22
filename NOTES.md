# NOTES: working memory

Newest at top. Keep under 150 lines. Rules for this file are in CLAUDE.md under "How we work".

## Where we are (2026-10-22)
- Live: https://fashion-fiesta-three.vercel.app (Vercel production, deploys from main)
- Done and live: Phases 0, 1, 2, 3, 3.5, 4.
- Now: Phase 4.5 Key Account mode.
- Small deploy (measurement templates, pieces link, nightly backup, bug fixes) shipped 2026-10-22. Checklist sent.
- Bugs fixed in that deploy, all in earlier phases:
  - A deposit already used could be applied again on the next invoice. No real payments were in production yet, so no data was affected.
  - The customer list always showed 0 branches, and the supplier list always showed 0 fabrics.
  - On the order editor, Save could fire before the customer's details had loaded.
  - Save buttons with their own disabled rule did not grey out while saving.
  - Cause of the first two: a Drizzle subquery without a join renders a bare "id". Always write the table name in raw subqueries.

## Half done
- Phase 4.5 plan approved ("go"), not started:
  - Schema: key account switch, branch emirate and verified flag, account staff, account catalogue, line allocations, delivery runs, season, invoice branch breakdown, Delivery supplier type, label layout setting.
  - Customer page tabs: Overview, Branches, Staff, Catalogue, Orders, Deliveries, Report.
  - Bedashing demo: 24 UAE lounges captured from bedashingbeauty.com/lounges (Abu Dhabi 15, Dubai 5, Sharjah 2, Fujairah 1, Ras Al Khaimah 1). They get seeded as unverified with a one tap confirm.

## Decisions (newest first)
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
- Embroidery machine brand and model: to confirm with the operator. It decides the file format for ideas 36 and 43.
- Neon Launch plan (later, his call): gives a 7 day rewind window and daily snapshots. He adds a card in Neon billing, then I set both up.

## Infra facts
- Neon: project little-mud-41727057, main branch br-mute-feather-b3bhmnqk. Manual snapshot "before-phase-4" exists.
- Vercel: project prj_grSCaYpWGqE93VbWkOQzahVzymA0, team team_yKuXQ8P3eoGrvRnTWMIqSiGo, region sin1.
- Env vars are in Vercel for all three environments: DATABASE_URL, AUTH_SECRET, BLOB_READ_WRITE_TOKEN, ANTHROPIC_API_KEY, CRON_SECRET. They are never in git.
- Cron: /api/cron/backup at 22:00 UTC.
- Migrations live in /drizzle and run during build. The latest is 0008_measurement_templates.
