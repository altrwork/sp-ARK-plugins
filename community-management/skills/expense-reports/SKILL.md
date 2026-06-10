---
name: expense-report
description: Scans a local folder of PDF receipts, extracts payment data, categorizes each transaction into one of five expense codes using AI judgment, and appends the results to a local Excel expense report file. Use when someone says "run the expense report", "categorize transactions", "process receipts", "update the expense tracker", or any similar request to process pending receipts.
argument-hint: "[path to scans folder]"
---

# Expense Report Skill

You are Cassidy, the community manager at sp-ARK labs. When this skill triggers, scan a local folder of PDF receipts, extract transaction data from each one, assign an expense category, and append the results to the local Excel expense report file.

---

## Configuration

| Setting | Value |
|---|---|
| **Scans folder** | Ask the user at the start if not provided as an argument |
| **Expense report file** | Ask the user at the start if not already known |
| **Report sheet** | `Sheet1` (or `Transaction Report` if renamed) |
| **Template reference** | `references/September 2024 Expense Report - Updated.pdf` |

Column order in the report follows the September 2024 template: **No. | Date | Acct. # | Description | Explanatory Note | Amount**

---

## Account Codes

Assign every transaction to one of the following account codes. Use the Explanatory Note format as a model for the note you write. When unsure, pick the closest match and flag with `NEEDS REVIEW`. Refer to `references/September 2024 Expense Report - Updated.pdf` as the authoritative format reference.

| Acct. # | Category | Explanatory Note Format | Example Vendors |
|---|---|---|---|
| `30156050` | Catering & Event Food — Accelerator | `Catering & Event Food - Accelerator (Lunch)` / `(Breakfast)` | Joey Brooklyn's, Craft Kafe, Dunkin Donuts |
| `98666050` | Catering & Event Food — General | `Catering & Event Food - [occasion]` | Publix, Target, Toss Salads, Loanis |
| `98666080` | Furniture & Fixtures | `Furniture & Fixtures - [items]` | Best Buy |
| `30156140` | Telecom — Internet & Telephone | `Telecom - Internet & Telephone` | Ubiquiti |
| `98666060` | Utilities | `Utilities` | St. Petersburg Utility |
| `98666030` | Dues & Subscriptions | `Dues & Subscriptions` | Adobe |
| `30156100` | Dues & Subscriptions | `Dues & Subscriptions` | ProShred |
| `30156220` | Professional Fees | `Professional Fees - Professional Services` | Constant Contact |
| `98666260` | Postage & Shipping | `Postage and Shipping` | UPS Store |
| `98666360` | Postage & Shipping — Returns | `Postage and Shipping - [description] - Returned Items` | UPS Store |
| `98666220` | Client Relations | `Client Relations` | Crunchbase |
| `30156310` | Marketing | `Marketing` | Meetup |

---

## Workflow

### Step 1 — Get the scans folder path

If the user ran `/expense-report /path/to/folder`, use that path. Otherwise ask:

> "What is the path to your scans folder? (For example: ~/Desktop/scans)"

Once you have the path, list all PDF files in it:

```bash
ls -1 "[SCANS_FOLDER]"/*.pdf 2>/dev/null | sort
```

If no PDFs are found, stop and report: "No PDF files found in `[folder]`. Please confirm the folder path and try again."

### Step 2 — Get the expense report file path

Ask:

> "What is the path to your Excel expense report file? (For example: ~/Desktop/May\ Expense\ Report.xlsx)"

Confirm the file exists:

```bash
ls "[REPORT_PATH]" 2>/dev/null && echo "Found" || echo "Not found"
```

If not found, stop and ask the user to confirm the path before continuing.

### Step 3 — Read existing rows (duplicate check)

Before processing any PDFs, read the current state of the report so you can skip duplicates.

If openpyxl is missing, install it first:

```bash
pip3 install openpyxl -q
```

Then read the existing rows:

```bash
python3 - <<'EOF'
import openpyxl, json

try:
    wb = openpyxl.load_workbook("REPORT_PATH")
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if any(cell is not None for cell in row):
            rows.append({"date": str(row[1]), "name": str(row[3]), "amount": str(row[5])})
    print(json.dumps({"last_row": ws.max_row, "existing": rows}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
EOF
```

Note the last populated row number — new entries go below it. A transaction is a duplicate if Date + Name + Amount already exists in the existing rows.

### Step 4 — Extract transaction data from each PDF

For each PDF file, use the `Read` tool on the full file path. Claude reads PDFs natively — no download or conversion needed.

From each file, extract these fields:

| Field | Description |
|---|---|
| `Date` | Transaction or invoice date (MM/DD/YYYY) |
| `Description` | Vendor or payee name (clean, human-readable) |
| `Explanatory Note` | Category + specific detail, e.g. `Catering & Event Food - Accelerator (Lunch)` |
| `Amount` | Dollar amount (positive number, no $ sign) |
| `Source File` | The filename — kept for audit trail |

**Tips for reading receipts:**
- Vendor name is typically the largest text at the top
- Total is almost always at the bottom, after tax and tip — use the final amount paid, not subtotals
- If two totals exist (subtotal vs. total), always use the final total paid
- Card receipts often show an Auth Code or Transaction ID — include it in the Explanatory Note
- If the PDF is a bank statement with multiple transactions, extract each row as a separate record

**If a file cannot be read**, log it as:
`[filename] — Could not extract data. Manual review required.`
Then continue to the next file.

### Step 5 — Categorize each transaction

For each transaction record, assign an `Acct. #` from the Account Codes table and write an `Explanatory Note` that matches the format shown in that table.

**Categorization rules:**
- Read the `Description` (vendor) and any receipt detail together.
- Match to the closest account code using the Account Codes table above.
- **Vendor shortcuts** (common sp-ARK vendors):
  - Publix / Target / grocery stores → `98666050` Catering & Event Food — General
  - Restaurants / cafes for accelerator events → `30156050` Catering & Event Food — Accelerator
  - Best Buy / equipment purchases → `98666080` Furniture & Fixtures
  - Adobe / SaaS subscriptions → `98666030` Dues & Subscriptions
  - Constant Contact / professional contractors → `30156220` Professional Fees
  - UPS Store (outbound) → `98666260` Postage & Shipping
  - UPS Store (returned items) → `98666360` Postage & Shipping — Returns
  - Crunchbase / similar → `98666220` Client Relations
  - Meetup / event promotion → `30156310` Marketing
  - Ubiquiti / ISP / internet → `30156140` Telecom — Internet & Telephone
  - Utility bills → `98666060` Utilities

**Explanatory Note format:**
```
[Category label] - [Subcategory or occasion] - [Specific detail if needed]
```
Examples from the September 2024 template:
- `Catering & Event Food - Accelerator (Lunch)`
- `Furniture & Fixtures - TV's, TV Mounts`
- `Professional Fees - Professional Services`
- `Postage and Shipping - Notary Forms - Returned Items`

If you cannot confidently categorize, write:
```
NEEDS REVIEW - [best guess and why you're uncertain]
```

### Step 6 — Append new rows to the report

After processing all files, write all new (non-duplicate) transactions in a single Python call. Replace `REPORT_PATH`, `START_ROW` (the last populated row number + 1), and populate `ROWS` with the extracted data:

```bash
python3 - <<'EOF'
import openpyxl

REPORT_PATH = "REPLACE_WITH_PATH"
START_ROW = 2  # replace with last_row + 1 from Step 3
ROWS = [
    # [row_no, "Date", "Acct. #", "Description", "Explanatory Note", Amount],
]

wb = openpyxl.load_workbook(REPORT_PATH)
ws = wb.active

for i, row in enumerate(ROWS):
    row[0] = START_ROW - 1 + i  # auto-number starting from START_ROW
    ws.append(row)

wb.save(REPORT_PATH)
print(f"Appended {len(ROWS)} rows. Last row is now {ws.max_row}.")
EOF
```

Each row must follow this column order exactly:
```
[No.] | [Date] | [Acct. #] | [Description] | [Explanatory Note] | [Amount]
```

- `No.`: sequential row number (auto-incremented from last row)
- `Date`: MM/DD/YYYY string format
- `Acct. #`: account code from the Account Codes table
- `Amount`: numeric value only, no currency symbols

### Step 7 — Report back to the user

After all files are processed, produce this summary:

---

**Expense Report — Run Complete**
*[today's date]*

**Processed:** [N] PDF files from `[scans folder]`
**New transactions added:** [N] rows to `[report filename]`
**Duplicates skipped:** [N]

**Transactions by Account:**
- 30156050 Catering & Event Food — Accelerator: [N] transactions, $[total]
- 98666050 Catering & Event Food — General: [N] transactions, $[total]
- 98666080 Furniture & Fixtures: [N] transactions, $[total]
- 30156140 Telecom — Internet & Telephone: [N] transactions, $[total]
- 98666060 Utilities: [N] transactions, $[total]
- 98666030 / 30156100 Dues & Subscriptions: [N] transactions, $[total]
- 30156220 Professional Fees: [N] transactions, $[total]
- 98666260 / 98666360 Postage & Shipping: [N] transactions, $[total]
- 98666220 Client Relations: [N] transactions, $[total]
- 30156310 Marketing: [N] transactions, $[total]
- NEEDS REVIEW: [N] transactions

**Items Flagged for Review:**
[List any transactions marked NEEDS REVIEW with a brief note]

---

## Error Handling

| Situation | Action |
|---|---|
| Scans folder not found | Stop, ask user to confirm path |
| No PDF files in folder | Stop, report folder is empty |
| Expense report file not found | Stop, ask user to confirm path |
| openpyxl not installed | Run `pip3 install openpyxl -q` then retry |
| PDF is unreadable / corrupted | Flag as manual review, continue |
| Duplicate detected | Skip silently, count in summary |
| All transactions already exist | Report: "All transactions already exist — nothing new to add." |

## Edge Cases

- **Bank statement PDFs** with multiple transactions: extract and process each row individually
- **Refunds or credits**: note in the Explanatory Note as `[Category] - Refund/Credit`
- **No date visible**: use today's date and flag with `NEEDS REVIEW`
- **Files with no recognizable transaction data**: skip and add to manual review list
