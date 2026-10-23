import type { GuideTour } from "./types";

/**
 * The scripts. Each mission walks her through the real screens, one tap at a time, in the order the
 * shop actually works. {placeholders} are the ids of the practice records, sent by the server.
 * Selectors lean on what the screens already carry: labels, links and data-mission marks.
 */

const NEW_ORDER = "/orders/new";
const SAVE_ORDER = '[data-mission~="confirm-order"]';
const STAGE = 'section[aria-label="Order stage"]';

export const MISSION_TOURS: Record<string, GuideTour> = {
  look: {
    key: "look",
    title: "Look around",
    steps: [
      { at: "/today", go: "/today", target: '[data-guide~="hero"]', say: "This is **Today**, where every day starts. The big number is the cash you have right now.", advance: "next" },
      { at: "/today", target: '[data-guide~="attention-list"]', say: "**Needs your attention** lists what is waiting for you. Each line has one button.", advance: "next" },
      { at: "/today", target: '[data-mission~="attention"]', say: "Tap the button on the first line to deal with it.", advance: "click" },
      { say: "That is the habit: open Today, then one tap per line until the list is empty.", advance: "mission" },
    ],
  },

  quote: {
    key: "quote",
    title: "Quote first",
    steps: [
      { at: "/orders/quotes/new", go: "/orders/quotes/new?customer={quoteCustomer}", target: '[data-guide~="customer"]', say: "A school asks what 20 pinafores would cost. Their name is already picked here.", advance: "next" },
      { at: "/orders/quotes/new", target: '[aria-label="Line 1 description"]', say: "Type what they want: **School pinafore**.", fill: "School pinafore", advance: "filled" },
      { at: "/orders/quotes/new", target: '[aria-label="Line 1 quantity"]', say: "How many? Type **20**.", fill: "20", advance: "filled" },
      { at: "/orders/quotes/new", target: '[aria-label="Line 1 price before VAT"]', say: "Price for one, before VAT: **85**. The app adds the 5% VAT for you.", fill: "85", advance: "filled" },
      { at: "/orders/quotes/new", target: SAVE_ORDER, say: "Tap **Save quote**.", advance: { path: "/orders/quotes/[id]" } },
      { at: "/orders/quotes/[id]", target: '[data-mission~="whatsapp"]', say: "This is the quote. **Send on WhatsApp** sends the PDF to the customer. You can try it later.", advance: "next" },
      { at: "/orders/quotes/[id]", target: 'a[href^="/orders/new?fromQuote="]', say: "The school said yes. Tap **Confirm as order**.", advance: { path: NEW_ORDER } },
      { at: NEW_ORDER, target: SAVE_ORDER, say: "Lines and prices came over from the quote. Tap **Confirm order**.", advance: { path: "/orders/[id]" } },
      { at: "/orders/[id]", target: STAGE, say: "Every order shows where it is, from Quote to Paid. This one is now Confirmed.", advance: "mission" },
    ],
  },

  walkin: {
    key: "walkin",
    title: "A walk in",
    steps: [
      { at: NEW_ORDER, go: "/orders/new?customer={mehwish}", target: '[aria-label="Line 1 description"]', say: "Ma'am Mehwish wants an abaya. Type **Abaya**.", fill: "Abaya", advance: "filled" },
      { at: NEW_ORDER, target: '[aria-label="Line 1 price before VAT"]', say: "Her price, before VAT: **350**.", fill: "350", advance: "filled" },
      { at: NEW_ORDER, target: '[data-mission~="measure"]', say: "Now her measurements. Tap the **ruler**.", advance: { see: '[data-guide~="measure-dialog"]' } },
      { at: NEW_ORDER, target: '[data-guide~="measure-dialog"]', say: "Name it **Self**, type a few measurements, any numbers will do, then tap **Save measurements**. Next time they fill in by themselves.", advance: { gone: '[data-guide~="measure-dialog"]' } },
      { at: NEW_ORDER, target: '[data-guide~="assign"]', say: "Who stitches it? Tap **Assign**.", advance: "click" },
      { at: NEW_ORDER, target: '[aria-label="Line 1 assignee 1"]', say: "Pick a tailor, for example **Ahmed**.", fill: "Ahmed", advance: "filled" },
      { at: NEW_ORDER, target: SAVE_ORDER, say: "All set. Tap **Confirm order**.", advance: { path: "/orders/[id]" } },
      { at: "/orders/[id]", target: STAGE, say: "Done. The tailor now has this task on his phone, with her measurements.", advance: "mission" },
    ],
  },

  approve: {
    key: "approve",
    title: "Approve work",
    steps: [
      { at: "/workshop/tasks/{goodTask}", go: "/workshop/tasks/{goodTask}", target: '[data-guide~="task-photos"]', say: "Ahmed finished the chef jackets and sent photos. Look at them first.", advance: "next" },
      { at: "/workshop/tasks/{goodTask}", target: '[data-mission~="approve"]', say: "They look right. Tap **Approve**.", advance: { gone: '[data-mission~="approve"]' } },
      { at: "/workshop", go: "/workshop", target: 'a[href="/workshop/gallery"]', say: "Approved work goes to the **Gallery**. Tap it.", advance: { path: "/workshop/gallery" } },
      { at: "/workshop/gallery", say: "Every approved piece is kept here, handy to show customers.", advance: "mission" },
    ],
  },

  fix: {
    key: "fix",
    title: "Fix a mistake",
    steps: [
      { at: "/workshop/tasks/{wrongTask}", go: "/workshop/tasks/{wrongTask}", target: '[data-guide~="task-photos"]', say: "Imran's photo shows the wrong garment.", advance: "next" },
      { at: "/workshop/tasks/{wrongTask}", target: '[data-mission~="reject"]', say: "Tap **Send back**.", advance: { see: '[role=dialog] textarea[name="reason"]' } },
      { at: "/workshop/tasks/{wrongTask}", target: '[role=dialog] textarea[name="reason"]', say: "Tell him what to fix, in a few words.", fill: "Wrong garment. This should be the black abaya.", advance: "filled" },
      { at: "/workshop/tasks/{wrongTask}", target: '[role=dialog] button[type=submit]', say: "Tap **Send back**. He sees your reason on his phone.", advance: { gone: '[role=dialog] textarea[name="reason"]' } },
      { say: "Sent back. When he submits again, it comes back to Today for you.", advance: "mission" },
    ],
  },

  deliver: {
    key: "deliver",
    title: "Deliver and invoice",
    steps: [
      { at: "/orders/{alDahraOrder}", go: "/orders/{alDahraOrder}", target: STAGE, say: "Al Dahra's order is **Ready**. Next it goes out with a delivery note.", advance: "next" },
      { at: "/orders/{alDahraOrder}", target: 'a[data-mission~="make-dn"]', say: "Tap **Make delivery note**.", advance: { path: "/orders/{alDahraOrder}/deliver" } },
      { at: "/orders/{alDahraOrder}/deliver", target: 'button[data-mission~="make-dn"]', say: "Everything ready is filled in. Tap **Make delivery note**.", advance: { path: "/orders/{alDahraOrder}" } },
      { at: "/orders/{alDahraOrder}", target: 'a[data-mission~="make-invoice"]', say: "Delivered. Now the bill: tap **Make invoice**.", advance: { path: "/money/invoices/new" } },
      { at: "/money/invoices/new", target: 'button[data-mission~="make-invoice"]', say: "The lines come from what was delivered. Tap **Issue Tax Invoice**.", advance: { path: "/money/invoices/[id]" } },
      { at: "/money/invoices/[id]", target: '[data-mission~="pdf"]', say: "This is the Tax Invoice. Tap **PDF** to see what the customer gets.", advance: "click" },
      { say: "That PDF is ready to send on WhatsApp or by email.", advance: "mission" },
    ],
  },

  paid: {
    key: "paid",
    title: "Get paid",
    steps: [
      { at: "/orders/{alDahraOrder}", go: "/orders/{alDahraOrder}", target: 'a[data-mission~="record-payment"]', say: "Al Dahra paid the whole invoice. Tap **Record payment**.", advance: { path: "/money/payments/new" } },
      { at: "/money/payments/new", target: '[data-guide~="payment-amount"]', say: "The full amount is already filled in and set against the invoice.", advance: "next" },
      { at: "/money/payments/new", target: '[data-guide~="save-payment"]', say: "Tap **Record** to save it.", advance: { path: "/money/payments/[id]" } },
      { at: "/money/payments/[id]", say: "Paid. The receipt is made, the cash book is updated and the order shows Paid.", advance: "mission" },
    ],
  },

  owes: {
    key: "owes",
    title: "Someone owes you",
    steps: [
      { at: "/money", go: "/money", target: 'a[href="/money/statement/{pinkMeUp}"]', say: "**Who owes you**, oldest first. Pink Me Up owes you money. Tap **Statement**.", advance: { path: "/money/statement/{pinkMeUp}" } },
      { at: "/money/statement/{pinkMeUp}", target: '[data-mission~="whatsapp"]', say: "Every invoice and payment on one page. Tap **Send on WhatsApp**. In Practice it only opens your own number.", advance: "click" },
      { say: "That is a polite reminder sent in two taps.", advance: "mission" },
    ],
  },

  bigone: {
    key: "bigone",
    title: "The big one",
    steps: [
      { at: NEW_ORDER, go: "/orders/new?customer={bedashing}", file: "bedashing-po.pdf", say: "Bedashing sent their own purchase order. Tap **Download it** to save the sample, then Next.", advance: "next" },
      { at: NEW_ORDER, target: '[data-mission~="read-document"]', say: "No typing: tap **Read their document**.", advance: { see: '[data-guide~="doc-file"]' } },
      { at: NEW_ORDER, target: '[data-guide~="doc-file"]', say: "Tap **Choose a file** and pick the Bedashing PDF you downloaded. Reading takes about half a minute.", advance: { see: '[data-guide~="doc-drafts"], [data-guide~="doc-put"]' } },
      { at: NEW_ORDER, target: '[data-guide~="doc-drafts"], [data-guide~="doc-put"]', say: "Lines it read are marked to check. It found two branches: tap **Make 2 draft orders**.", advance: { path: "/orders" } },
      { at: "/orders", target: '[data-guide~="order-row"]', say: "Here are the drafts. Open one.", advance: { path: "/orders/[id]" } },
      { at: "/orders/[id]", target: 'a[href$="/edit"]', say: "Tap **Review and confirm**.", advance: { path: "/orders/[id]/edit" } },
      { at: "/orders/[id]/edit", target: SAVE_ORDER, say: "Check the lines, then tap **Confirm order**.", advance: { path: "/orders/[id]" } },
      { at: "/orders/[id]", target: STAGE, say: "A full order from the customer's own paper, without typing it.", advance: "mission" },
    ],
  },

  fabric: {
    key: "fabric",
    title: "Buy fabric",
    steps: [
      { at: "/purchases/orders/new", go: "/purchases/orders/new?supplier={alNoor}", target: '[aria-label="Line 1 description"]', say: "An order to Al Noor Textiles. Type the fabric: **Cotton drill, navy**.", fill: "Cotton drill, navy", advance: "filled" },
      { at: "/purchases/orders/new", target: '[aria-label="Line 1 quantity"]', say: "How many metres? **50**.", fill: "50", advance: "filled" },
      { at: "/purchases/orders/new", target: '[aria-label="Line 1 price"]', say: "Price per metre, before VAT: **12**.", fill: "12", advance: "filled" },
      { at: "/purchases/orders/new", target: '[data-mission~="confirm-po"]', say: "Tap **Confirm PO**.", advance: { path: "/purchases/orders/[id]" } },
      { at: "/purchases/orders/[id]", target: 'a[data-mission~="receive"]', say: "The fabric arrived. Tap **Receive goods**.", advance: { path: "/purchases/orders/[id]/receive" } },
      { at: "/purchases/orders/[id]/receive", target: 'button[data-mission~="receive"]', say: "All 50 metres came. Tap **Record what arrived**.", advance: { path: "/purchases/orders/[id]" } },
      { say: "The fabric is now on the shelf, in stock, ready to cut.", advance: "mission" },
    ],
  },

  team: {
    key: "team",
    title: "Pay the team",
    steps: [
      { at: "/settings/team", go: "/settings/team", target: '[data-guide~="pay-{imran}"]', say: "Salary day. Tap **Pay** next to Imran.", advance: { see: '[data-guide~="pay-dialog"]' } },
      { at: "/settings/team", target: '[data-guide~="pay-dialog"]', say: "His advance comes off by itself. Check the amount, then tap **Mark paid**.", advance: { gone: '[data-guide~="pay-dialog"]' } },
      { say: "Paid. It is in the cash book and in expenses.", advance: "mission" },
    ],
  },

  close: {
    key: "close",
    title: "Close the day",
    steps: [
      { at: "/money/cash", go: "/money/cash", target: '[data-guide~="close-day"]', say: "End of the day. The app knows what should be in the drawer.", advance: "next" },
      { at: "/money/cash", target: "#counted", say: "Count the drawer and type what you counted. For practice, type the expected cash.", fill: "@data-expected", advance: "filled" },
      { at: "/money/cash", target: '[data-mission~="close-day"]', say: "Tap **Close the day**.", advance: "click" },
      { say: "If the count is short or over, it shows in red, and tomorrow's Today starts from the real number.", advance: "mission" },
    ],
  },

  numbers: {
    key: "numbers",
    title: "Your numbers",
    steps: [
      { at: "/reports/profit", go: "/reports/profit", target: '[data-guide~="profit"]', say: "**Profit** for this month: sales, less fabric, stitching and running costs.", advance: "next" },
      { at: "/reports/profit", target: 'a[href="/reports/tax"]', say: "Now tap **Tax**.", advance: { path: "/reports/tax" } },
      { at: "/reports/tax", target: '[data-guide~="tax-hero"]', say: "VAT to pay this quarter, with every step to file it on EmaraTax further down.", advance: "next" },
      { at: "/reports/tax", target: '[data-mission~="excel"]', say: "Tap **Download Excel**: the file for your accountant.", advance: "click" },
      { say: "Every report downloads the same way.", advance: "mission" },
    ],
  },

  progress: {
    key: "progress",
    title: "Show your progress",
    steps: [
      { at: "/workshop/tasks/{pantsTask}", go: "/workshop/tasks/{pantsTask}", target: '[data-guide~="progress-box"]', say: "Your pants task. This shows how many are done.", advance: "next" },
      { at: "/workshop/tasks/{pantsTask}", target: '[data-mission~="progress"]', say: "Tap **+** until it shows **18**. It saves by itself.", advance: "mission" },
    ],
  },

  submit: {
    key: "submit",
    title: "Send it in",
    steps: [
      { at: "/workshop/tasks/{pantsTask}", go: "/workshop/tasks/{pantsTask}", target: '[data-guide~="photo"]', say: "Finished? Tap **Take photo of the work**.", advance: { see: '[data-mission~="submit"]:not([disabled])' } },
      { at: "/workshop/tasks/{pantsTask}", target: '[data-mission~="submit"]', say: "Tap **Submit**. The owner reviews it.", advance: "click" },
      { say: "Sent. You will see here when it is approved.", advance: "mission" },
    ],
  },

  sale: {
    key: "sale",
    title: "A quick sale",
    steps: [
      { at: "/today/sale", go: "/today/sale", target: '[aria-label="Item"]', say: "A customer buys a shawl. Type **Shawl**.", fill: "Shawl", advance: "filled" },
      { at: "/today/sale", target: "[data-guide-popup]", say: "Tap it in the list.", advance: { see: '[aria-label="Item 1 price each, before VAT"]' } },
      { at: "/today/sale", target: '[aria-label="Item 1 price each, before VAT"]', say: "Price, before VAT: **40**.", fill: "40", advance: "filled" },
      { at: "/today/sale", target: '[data-mission~="pay-cash"]', say: "Paid in cash. Tap **Cash**.", advance: { path: "/today/sale/[id]" } },
      { say: "The receipt is ready to share on WhatsApp.", advance: "mission" },
    ],
  },
};

const SAVE_IN = (field: string) => `form:has([name="${field}"]) button[type=submit]`;

/** Setting up the real shop, in Live. Nothing is filled for her: the coach only shows where. */
export const SETUP_TOURS: Record<string, GuideTour> = {
  shop: {
    key: "shop",
    title: "Shop details",
    steps: [
      { at: "/settings/shop", go: "/settings/shop", target: 'form:has([name="legalName"])', say: "These print on every quote and invoice. Check the legal name, address and TRN, and add the shop's **phone** and **email**. Then tap **Save changes**.", advance: { tap: SAVE_IN("legalName") } },
      { at: "/settings/shop", target: '[data-guide~="stamp"]', say: "Optional: add the shop stamp, so it prints in the signature box.", advance: "next" },
    ],
  },
  money: {
    key: "money",
    title: "Bank, VAT and licence",
    steps: [
      { at: "/settings/money", go: "/settings/money", target: 'form:has([name="iban"])', say: "Bank details print on every invoice, so customers can pay you. Type them as on your bank letter, then tap **Save changes**.", advance: { tap: SAVE_IN("iban") } },
      { at: "/settings/money", target: 'form:has([name="vatPeriodStartMonth"])', say: "Pick the month your VAT quarter starts, as on your FTA certificate. Then tap its **Save**. Not sure? Leave January.", advance: "next" },
      { at: "/settings/money", target: 'form:has([name="tradeLicense"])', say: "Add the **trade licence number**. E-invoices need it. Then tap **Save tax details**.", advance: { tap: SAVE_IN("tradeLicense") } },
    ],
  },
  team: {
    key: "team",
    title: "Your team",
    steps: [
      { at: "/settings/team", go: "/settings/team", target: '[data-guide~="add-person"]', say: "Add each tailor, so you can give them work. Tap **Add person**.", advance: { see: '[role=dialog] input[name="email"]' } },
      { at: "/settings/team", target: '[role=dialog]:has(input[name="email"])', say: "Their name, email and a password they will use on their phone. Then save. Add the next tailor the same way.", advance: { gone: '[role=dialog] input[name="email"]' } },
      { at: "/settings/team", target: '[data-guide~="team-list"]', say: "Tap the pencil next to your own name to add **your phone number**. WhatsApp messages use it.", advance: "next" },
      { at: "/settings/team", target: '[data-guide~="salaries"]', say: "Set each tailor's salary and pay day here. Today reminds you before pay day.", advance: "next" },
      { at: "/settings/team", target: '[data-guide~="operator"]', say: "The embroidery operator's name and phone. He shares the work 50/50 with the shop.", advance: "next" },
    ],
  },
  suppliers: {
    key: "suppliers",
    title: "Suppliers",
    steps: [
      { at: "/purchases/suppliers", go: "/purchases/suppliers", target: 'a[href="/purchases/suppliers/new"]', say: "Add the shops you buy fabric from, the stitching units in Ajman and the delivery company. Tap **Add supplier**.", advance: { path: "/purchases/suppliers/new" } },
      { at: "/purchases/suppliers/new", target: "main form", say: "Name, type and phone. The type matters: **Fabric**, **Stitching unit** or **Delivery**. Then save. Add the others the same way.", advance: { tap: "main form button[type=submit]" } },
    ],
  },
  catalogue: {
    key: "catalogue",
    title: "Products and fabrics",
    steps: [
      { at: "/orders/products", go: "/orders/products", target: '[data-guide~="add-product"]', say: "The garments you make, with your usual price. Orders fill in from these. Tap **Add product**.", advance: { see: '[role=dialog] input[name="name"]' } },
      { at: "/orders/products", target: '[role=dialog]:has(input[name="name"])', say: "Name and price. Then save. You can also just type new items on an order: they are added here by themselves.", advance: { gone: '[role=dialog] input[name="name"]' } },
      { at: "/purchases/fabrics", go: "/purchases/fabrics", target: 'a[href="/purchases/fabrics/new"]', say: "Now the fabrics on your shelf. Tap **Add fabric**.", advance: { path: "/purchases/fabrics/new" } },
      { at: "/purchases/fabrics/new", target: "main form", say: "Name, colour, cost per metre and the shelf spot, so tailors find the right roll. Then save.", advance: { tap: "main form button[type=submit]" } },
    ],
  },
  customers: {
    key: "customers",
    title: "Customers",
    steps: [
      { at: "/customers", go: "/customers", target: "main", say: "Your customers. Schools, spas and companies need their **TRN** and **address**: they print on Tax Invoices and e-invoices.", advance: "next" },
      { at: "/customers", target: 'a[href="/customers/new"]', say: "Tap **Add customer** for anyone missing. Open an existing one to add a TRN, address or branches.", advance: "next" },
    ],
  },
  opening: {
    key: "opening",
    title: "Opening balances",
    steps: [
      { at: "/settings/opening", go: "/settings/opening", target: "main form", say: "Where the shop stands today: cash in the drawer, money in the bank, who owes you and who you owe. Day one numbers start from here. Then save.", advance: { tap: "main form button[type=submit]" } },
    ],
  },
};

export const SETUP_ORDER = ["shop", "money", "team", "suppliers", "catalogue", "customers", "opening"] as const;
export type SetupKey = (typeof SETUP_ORDER)[number];
