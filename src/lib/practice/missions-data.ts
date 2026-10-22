/**
 * The missions, as words and where to start. Shared by the panel in the browser and the checks on the server.
 * `target` names the button that glows: elements carry data-mission="<target>".
 */
export type MissionKey =
  | "look" | "walkin" | "owes" | "bigone" | "approve" | "fix" | "deliver" | "paid" | "fabric" | "close" | "team" | "numbers"
  | "progress" | "submit" | "sale";

export type Mission = { key: MissionKey; title: string; text: string; targets: string[]; file?: string };

export const OWNER_MISSIONS: Mission[] = [
  { key: "look", title: "Look around", text: "Today shows what needs you. Tap the button on the first item under Needs your attention.", targets: ["attention"] },
  { key: "walkin", title: "A walk in", text: "Ma'am Mehwish wants one abaya. Type it as a line, add her measurements, give it to a tailor, then Confirm order.", targets: ["new-order", "measure", "confirm-order"] },
  { key: "owes", title: "Someone owes you", text: "Open Who owes you, find Pink Me Up, open the statement and tap Send on WhatsApp. In Practice it opens to your own number.", targets: ["statement", "whatsapp"] },
  { key: "bigone", title: "The big one", text: "Download the Bedashing PO from the sample files. New order, Read their document, check the lines, make the two drafts, then confirm one.", targets: ["read-document", "confirm-order"], file: "bedashing-po.pdf" },
  { key: "approve", title: "Approve work", text: "Ahmed sent his chef jackets. Open his task, approve it, then find it in the Gallery.", targets: ["approve", "gallery"] },
  { key: "fix", title: "Fix a mistake", text: "Imran's photo shows the wrong garment. Send his task back with a short reason.", targets: ["reject"] },
  { key: "deliver", title: "Deliver and invoice", text: "Al Dahra's order is ready. Make the delivery note, make the Tax Invoice, then open its PDF.", targets: ["make-dn", "make-invoice", "pdf"] },
  { key: "paid", title: "Get paid", text: "Al Dahra paid the whole invoice. Record the payment.", targets: ["record-payment"] },
  { key: "fabric", title: "Buy fabric", text: "Order fabric from Al Noor Textiles with the sample Excel, confirm the PO, receive the goods and watch the stock rise.", targets: ["new-po", "po-excel", "receive"], file: "fabric-po.xlsx" },
  { key: "close", title: "Close the day", text: "Count the drawer. Enter the expected cash shown on the card, see that it matches, then save.", targets: ["close-day"] },
  { key: "team", title: "Pay the team", text: "Pay Imran this month's salary. His advance comes off by itself.", targets: ["pay-salary"] },
  { key: "numbers", title: "Your numbers", text: "Open Reports. Look at Profit for this month, then VAT for this quarter, and download one Excel.", targets: ["excel"] },
];

export const TAILOR_MISSIONS: Mission[] = [
  { key: "progress", title: "Show your progress", text: "Open My tasks, then the pants task. Update it to 18 of 25.", targets: ["progress"] },
  { key: "submit", title: "Send it in", text: "Take a photo of the work and submit it for review.", targets: ["photo", "submit"] },
  { key: "sale", title: "A quick sale", text: "Make a quick sale of one item, paid cash, then open the receipt.", targets: ["quick-sale", "pay-cash"] },
];

export type MissionStatus = "done" | "skipped" | "open";
export type MissionView = Mission & { status: MissionStatus; href: string };
export type MissionsState = {
  role: "owner" | "tailor";
  missions: MissionView[];
  finished: boolean;
  finishSeen: boolean;
  login?: { email: string; password: string };
};

export const SAMPLE_FILES = [
  { file: "bedashing-po.pdf", label: "Bedashing Customer PO", note: "PDF, two branches" },
  { file: "order-slip.jpg", label: "Handwritten order slip", note: "Photo" },
  { file: "fabric-po.xlsx", label: "Fabric order", note: "Excel, for Buy fabric" },
  { file: "staff-sizes.xlsx", label: "Bedashing staff sizes", note: "Excel, for the Staff tab" },
] as const;

/** Shown to owners so a tailor can try the phone missions. The other practice tailors are imran@ and sajid@. */
export const PRACTICE_LOGIN_HINT = "ahmed@practice.ff";
