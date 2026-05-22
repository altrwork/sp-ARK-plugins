---
name: draft-agreement
description: Pulls the latest Microsoft Forms event rental submission from Outlook, extracts the event details, asks for pricing, and generates a filled Word document agreement ready for review. Use when someone says "draft an agreement", "create an event agreement", "new event rental", or "I got a new form submission".
argument-hint: "[optional: number of recent submissions to show, default 5]"
---

# Draft Agreement Skill

You are Cassidy, the community manager at sp-ARK labs. When this skill triggers, find the most recent event rental form submission(s) in Outlook, extract the event details, collect pricing from the user, and generate a completed Event Rental Agreement as a Word document saved locally.

---

## Reference Template

Before generating the Word document, read the agreement template to confirm the exact layout, section order, and legal language:

```
Read: references/agreement-template.pdf
```

The generated document must match this template exactly — same sections, same numbering, same legal text. Only the fields in section 1.2 (Event Details) and 1.3 (Pricing Terms), plus the date at the top, change per agreement.

---

## Configuration

| Setting | Value |
|---|---|
| **Lead Organization** | STAR-TEC Enterprises, Inc, DBA spARK Labs by ARK Invest |
| **Premises** | ARK Innovation Center, 1101 4th St South, St. Petersburg, FL 33701 |
| **spARK Authorized Rep** | Rebecca Brown, CEO, President |
| **Output folder** | Ask the user, or default to `~/Desktop` |

---

## Workflow

### Step 1 — Find the Forms submission email

Use the ms365 MCP to search Outlook for recent Microsoft Forms notification emails. Microsoft Forms sends notifications with a subject that typically contains "New response" or the form name.

Search for recent submissions:
```
mcp__ms365__search-messages (or equivalent email search tool)
query: "Microsoft Forms" OR "event rental" OR "event request"
folder: inbox
top: 5
```

Show Cassidy a numbered list of matching emails with sender, subject, and date. Ask her to confirm which one to process, or confirm the most recent if there is only one.

If no matching emails are found, ask Cassidy to provide the form data manually and skip to Step 3.

### Step 2 — Read the email and extract event details

Open the selected email and read its full body. Microsoft Forms notification emails list each question and answer on separate lines.

Extract the following fields from the email body:

| Field | Look for |
|---|---|
| `org_name` | Organization name, company name, or group name |
| `rep_name` | Contact person, authorized representative, or submitter name |
| `phone` | Phone number |
| `email` | Email address |
| `event_type` | Type of event, space requested, or room/hall name |
| `event_date` | Date of the event |
| `start_time` | Start time |
| `end_time` | End time |
| `attendees` | Expected number of guests or attendees |

If any field is missing from the email, ask Cassidy to fill it in before continuing.

Show Cassidy a clean summary of what was extracted and ask her to confirm or correct anything before proceeding.

### Step 3 — Get pricing from Cassidy

Pricing is determined manually. Ask:

> "What are the pricing details for this event?
> - Price (e.g. $2,000.00 4-hour Event with 20% discount):
> - Additional Fees (or N/A):
> - Total Due:"

Wait for Cassidy's response before continuing.

### Step 4 — Generate the Word document

Install python-docx if needed:

```bash
pip3 install python-docx -q
```

Then generate the agreement:

```bash
python3 - <<'EOF'
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import datetime

# --- Fill these in from extracted data ---
DATE_CREATED    = "REPLACE"
ORG_NAME        = "REPLACE"
REP_NAME        = "REPLACE"
PHONE           = "REPLACE"
EMAIL           = "REPLACE"
EVENT_TYPE      = "REPLACE"
EVENT_DATE      = "REPLACE"
START_TIME      = "REPLACE"
END_TIME        = "REPLACE"
ATTENDEES       = "REPLACE"
PRICE           = "REPLACE"
ADDITIONAL_FEES = "REPLACE"
TOTAL_DUE       = "REPLACE"
OUTPUT_PATH     = "REPLACE"  # e.g. ~/Desktop/Delta Sigma Theta - Event Agreement - May 2026.docx
# -----------------------------------------

doc = Document()

def bold(paragraph, text):
    run = paragraph.add_run(text)
    run.bold = True
    return run

def heading(doc, text, level=1):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11)
    return p

# Title
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.LEFT
bold(title, "STAR-TEC Enterprises, Inc. DBA spARK Labs by ARK Invest")

doc.add_paragraph()
h = doc.add_paragraph()
bold(h, "EVENT RENTAL AGREEMENT")

doc.add_paragraph()
p = doc.add_paragraph()
bold(p, f"Date Agreement Created: ")
p.add_run(DATE_CREATED)

doc.add_paragraph()
heading(doc, "1. Fundamental Provisions")
doc.add_paragraph("The following is a summary schedule of certain fundamental terms of this Event Rental Agreement.")

doc.add_paragraph()
heading(doc, "1.1 Lead Organization Details")
doc.add_paragraph("Lead Organization:\nSTAR-TEC Enterprises, Inc, DBA spARK Labs by ARK Invest")
doc.add_paragraph("Premises:\nARK Innovation Center\n1101 4th St South\nSt. Petersburg, FL 33701")

doc.add_paragraph()
heading(doc, "1.2 Event Details")
details = [
    ("Business, Company, or Organization Name: ", ORG_NAME),
    ("Authorized Event Representative: ", REP_NAME),
    ("Phone Number: ", PHONE),
    ("Email: ", EMAIL),
    ("Type of Event: ", EVENT_TYPE),
    ("Event Date: ", EVENT_DATE),
    ("Event Start Time: ", START_TIME),
    ("Event End Time: ", END_TIME),
    ("Expected Number of Attendees: ", ATTENDEES),
]
for label, value in details:
    p = doc.add_paragraph()
    p.add_run(label)
    bold(p, value)

doc.add_paragraph()
heading(doc, "1.3 Pricing Terms")
for label, value in [("Price: ", PRICE), ("Additional Fees (if applicable): ", ADDITIONAL_FEES), ("Total Due: ", TOTAL_DUE)]:
    p = doc.add_paragraph()
    p.add_run(label)
    bold(p, value)

# Legal sections
sections = [
    ("2. Payment Terms", [
        "2.1 Payment for event rentals is accepted by invoice through QuickBooks only. Payment is due immediately upon receipt of the invoice.",
        "2.2 No refunds will be provided unless the event must be canceled due to circumstances beyond STAR-TEC's control. Such uncontrollable conditions include, but are not limited to, severe weather emergencies, natural disasters, government-mandated closures, loss of power or utilities, or other events that render the facility unusable.",
        "2.3 If the event is canceled by the Business, Company, or Organization less than 30 days prior to the scheduled event date, a cancellation fee of $250 will apply. Cancellations made 30 days or more in advance will not incur a fee.",
    ]),
    ("3. Access and Use of Premises", [
        "3.1 The Business, Company, or Organization shall have access only to the spaces reserved for the event, which may include the following: IF Hall, Training Room 1, Training Room 2, Kitchen, all conference rooms, and Balcony.",
        "3.2 Access for event setup and teardown will be permitted during the agreed-upon times as outlined in the reservation confirmation.",
        "3.3 The Business, Company, or Organization must ensure that all attendees and vendors comply with STAR-TEC's facility rules and policies.",
    ]),
    ("4. Alcohol Policy", [
        "4.1 If alcohol will be served or sold during the event, the Business, Company, or Organization must comply with all applicable laws and regulations. If alcohol is sold, a valid liquor license must be provided to STAR-TEC prior to the event.",
        "4.2 STAR-TEC reserves the right to deny alcohol service if proper documentation is not provided or if safety concerns arise.",
    ]),
    ("5. Cleanup Responsibilities", [
        "5.1 The Business, Company, or Organization is responsible for ensuring that all event areas are returned to their original condition following the event. This includes removal of all decorations, trash, and personal belongings.",
        "5.2 Failure to comply with cleanup requirements may result in a cleaning service fee determined by STAR-TEC based on the event's size and duration.",
    ]),
    ("6. Insurance and Liability", [
        "6.1 The Business, Company, or Organization is encouraged to carry general liability insurance for the duration of the event. STAR-TEC's insurance does not cover losses or damages to property belonging to the Business, Company, or Organization, its employees, contractors, guests, or attendees.",
        "6.2 The Business, Company, or Organization agrees to hold harmless and indemnify STAR-TEC Enterprises, Inc., its officers, employees, and representatives from any claims, damages, or liabilities arising out of the event, except in cases of STAR-TEC's gross negligence or willful misconduct.",
    ]),
    ("7. Termination and Default", [
        "7.1 STAR-TEC reserves the right to terminate this Agreement immediately if the Business, Company, or Organization violates any terms of this Agreement, engages in illegal activity, or causes harm to the facility or other occupants.",
        "7.2 In the event of termination due to default, no refund will be issued.",
    ]),
    ("8. Force Majeure", [
        "8.1 STAR-TEC shall not be liable or responsible for any failure or delay in providing the venue or services due to conditions beyond its reasonable control, including but not limited to natural disasters, fire, flood, pandemic, acts of government, civil unrest, strikes, power outages, or other unforeseen emergencies.",
    ]),
    ("9. Notices", [
        "9.1 All notices or communications related to this Agreement must be provided in writing by hand delivery, email, or postal mail.",
    ]),
    ("10. Complete Agreement", [
        "10.1 This Agreement constitutes the entire understanding between STAR-TEC and the Business, Company, or Organization and supersedes all prior discussions or agreements, whether written or oral. No modification shall be valid unless in writing and signed by both parties.",
    ]),
]

for section_title, paragraphs in sections:
    doc.add_paragraph()
    heading(doc, section_title)
    for para in paragraphs:
        doc.add_paragraph(para)

# Signature block
doc.add_paragraph()
doc.add_paragraph()
doc.add_paragraph("STAR-TEC Enterprises, Inc, DBA spARK Labs by ARK Invest")
doc.add_paragraph(f"Authorized Event Representative: Rebecca Brown CEO, President")
doc.add_paragraph()
doc.add_paragraph("_________________________________     _______________________________")
doc.add_paragraph("Signature                                          Signature")
doc.add_paragraph()
doc.add_paragraph("_________________________________     _______________________________")
doc.add_paragraph("Printed Name                                   Printed Name")
doc.add_paragraph()
doc.add_paragraph("________________     _______________")
doc.add_paragraph("Date                           Date")

import os
output = os.path.expanduser(OUTPUT_PATH)
doc.save(output)
print(f"Saved: {output}")
EOF
```

### Step 5 — Confirm and report back

Once the file is saved, tell Cassidy:

> "Agreement drafted and saved to `[OUTPUT_PATH]`.
>
> **[ORG_NAME] — [EVENT_DATE]**
> - Rep: [REP_NAME] ([EMAIL])
> - Event: [EVENT_TYPE], [START_TIME]–[END_TIME]
> - Attendees: [ATTENDEES]
> - Total Due: [TOTAL_DUE]
>
> Open the file, review the details, and adjust anything before sending."

---

## Error Handling

| Situation | Action |
|---|---|
| No Forms emails found in Outlook | Ask Cassidy to paste or type the form details manually |
| Missing field in email | Ask Cassidy to provide the missing value |
| python-docx not installed | Run `pip3 install python-docx -q` then retry |
| Output folder doesn't exist | Ask Cassidy to confirm the save location |
