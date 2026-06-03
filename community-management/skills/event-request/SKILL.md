---
name: sp-ark-event-agreement
description: Generates a filled Event Rental Agreement PDF for sp-ARK Labs by reading submissions from the Microsoft Forms-synced Excel workbook in OneDrive. Use when the user says "generate event agreement," "create rental agreement," "event request PDF," "fill out the agreement for [name/company]," or any similar request to produce an event rental agreement from a form submission.
---

# sp-ARK Event Rental Agreement Skill

You are a community manager for sp-ARK Labs. When this skill triggers, your job is to read event request submissions from OneDrive, let the user pick one, and generate a filled Event Rental Agreement PDF.

---

## Step 1 — Read the OneDrive workbook

Use the MS365 connector to read the used range from the Forms-synced Excel workbook.

**Workbook details (hardcoded for sp-ARK demo environment):**
- Drive ID: `b!YbMlVs-uWUynup7fvO9QLvQfsg_KioVJqk8MJ5VtnaRz8ZfA0YmwTIScVygOqdHw`
- Drive Item ID: `016SA4FQPXEB5DHBW5ERDZSFUAIRZWY6HS`
- Worksheet: `Sheet1`

Call Graph batch endpoint:
```
GET /me/drive/items/016SA4FQPXEB5DHBW5ERDZSFUAIRZWY6HS/workbook/worksheets/Sheet1/usedRange?$select=values
```

The response contains a `values` array. Row 0 is the header row. Rows 1+ are submissions.

**Column mapping (0-indexed):**
| Index | Column name | PDF field |
|-------|-------------|-----------|
| 0 | Id | — (internal) |
| 1 | Start time | — (internal) |
| 2 | Completion time | — (internal) |
| 3 | Email | — (submitter email, internal) |
| 4 | Name | — (internal) |
| 5 | Business, Company, or Organization Name | `business_name` |
| 6 | Authorized Event Representative (Full Name) | `event_representative` |
| 7 | Phone Number | `phone_number` |
| 8 | Email Address | `email` |
| 9 | Type of Event | `event_type` |
| 10 | Event Date | `event_date` (convert from Excel serial — see Step 3) |
| 11 | Event Start Time | `event_start_time` |
| 12 | Event End Time | `event_end_time` |
| 13 | Expected Number of Attendees | `attendee_count` |

---

## Step 2 — Present submissions and let user pick

Display a numbered list of all submissions (skip row 0 which is the header):

```
Found X event request submissions:

1. Robidoux LLC — Networking Event — May 29, 2026
2. Uncreated LLC — Networking — May 31, 2026

Which submission would you like to generate the agreement for?
```

Format: `[Company Name] — [Event Type] — [Event Date]`

Wait for the user to pick by number or by name. If they name a company that matches one submission unambiguously, proceed without asking again.

---

## Step 3 — Run the fill script

Once the user has picked a submission, run `fill_agreement.py` from the same references directory as this skill, passing the submission data as a JSON argument.

**Important: pass the raw Excel date serial — the script converts it automatically.**

Excel stores dates as serial numbers (days since 1899-12-30). Example: `46171` → `May 29, 2026`.

**The script uses `pymupdf` (fitz) to fill the PDF.** It auto-sizes the font in each field so all text fits regardless of length — do not use pypdf for this task. If pymupdf is not installed, the script installs it automatically.

Run the script like this:

```bash
python /path/to/skill/references/fill_agreement.py '{
  "business_name": "Robidoux LLC",
  "event_representative": "Jarred Robidoux",
  "phone_number": "4846315985",
  "email": "JarredRobidoux@gmail.com",
  "event_type": "Networking Event",
  "event_date": 46171,
  "event_start_time": "10:00",
  "event_end_time": "1:00",
  "attendee_count": "100"
}'
```

**Important — path resolution in the sandbox:**
The references folder is at `/sessions/quirky-serene-pascal/mnt/.remote-plugins/plugin_01VPim7t9neYFbxTZF1ry9uh/skills/event-request/references/`. Since this is read-only, run the script by importing it as a module inline rather than calling it directly:

```python
import sys
sys.path.insert(0, '/sessions/quirky-serene-pascal/.local/lib/python3.10/site-packages')
sys.path.insert(0, '/path/to/references')
import fill_agreement as fa

fa.fill_agreement(data_dict, template_path, output_path)
```

Set `output_path` to a writable location such as `/sessions/quirky-serene-pascal/mnt/outputs/filled_agreement_<company>.pdf`. Use `shutil.move` if saving to a path that already exists.

The template PDF lives at: `references/sp-ark event template.pdf` (note the spaces in the filename).

---

## Step 4 — Present the PDF

Use `present_files` to deliver the filled PDF to the user. Tell the user: "Here is the filled Event Rental Agreement for [Company Name]. The agreement date has been set to today."

---

## Edge Cases

- **Workbook not found or empty**: Tell the user the workbook couldn't be read and ask them to confirm the Forms sync is set up in OneDrive.
- **User names a company not in the list**: Show the full list again and ask them to pick by number.
- **Multiple submissions from the same company**: Show all of them with their submission dates and ask the user to confirm which one.
- **Missing fields in a row**: Proceed with what's available. Leave the PDF field blank rather than guessing. Note which fields were missing in your response.

---

## Important notes

- `date_created` is always set to today's date by the fill script automatically — do not ask the user for it.
- `price`, `additional_fees`, and `total_due` are left blank in V1 — sp-ARK fills these manually after the agreement is generated.
- The signature blocks at the bottom of page 3 are intentionally left blank — they are hand-signed.
- Do not modify the PDF template. It lives in the references directory alongside fill_agreement.py.
