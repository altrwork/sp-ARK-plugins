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
| **Account split (default)** | `1050 Cash in Bank - Bank of Tampa 5688 (Program)` |

---

## Expense Category Codes

Assign every transaction to exactly one of the following five codes. Use the descriptions to guide your judgment. When unsure, pick the closest match and note your reasoning in the Notes field.

| Code | Label | What belongs here |
|---|---|---|
| `6080` | Office & Operating Expenses | Supplies, kitchen items, snacks, cleaning, utilities, small equipment, event materials, meals |
| `6100` | Professional Services | Contractors, consultants, freelancers, memberships, subscriptions to professional tools |
| `6200` | Marketing & Events | Event costs, promotional materials, advertising, sponsorships, content production |
| `6300` | Technology & Software | SaaS subscriptions, software licenses, AI tools, hosting, digital infrastructure |
| `6400` | Facilities & Infrastructure | Rent, security, building systems, physical infrastructure, maintenance |

> **Note for Cassidy:** These are placeholder codes. Replace with the real chart-of-accounts codes once received.

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
            rows.append({"date": str(row[0]), "name": str(row[2]), "amount": str(row[5])})
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
| `Transaction Type` | `Expenditure` for purchases, `Deposit` for credits/refunds |
| `Name` | Vendor or payee name (clean, human-readable) |
| `Memo/Description` | Raw description, memo, or line items from the receipt |
| `Amount` | Dollar amount (positive number, no $ sign) |
| `Source File` | The filename — kept for audit trail |

**Tips for reading receipts:**
- Vendor name is typically the largest text at the top
- Total is almost always at the bottom, after tax and tip — use the final amount paid, not subtotals
- If two totals exist (subtotal vs. total), always use the final total paid
- Card receipts often show an Auth Code or Transaction ID — include it in Memo/Description
- If the PDF is a bank statement with multiple transactions, extract each row as a separate record

**If a file cannot be read**, log it as:
`[filename] — Could not extract data. Manual review required.`
Then continue to the next file.

### Step 5 — Categorize each transaction

For each transaction record, assign it to one of the five expense codes from the Configuration table.

**Categorization rules:**
- Read the `Name` (vendor) and `Memo/Description` together.
- Apply the category definitions above.
- **Vendor shortcuts** (common sp-ARK vendors):
  - Amazon → `6080` if memo mentions supplies, snacks, kitchen, batteries, cables; `6300` if software/service
  - Anthropic → `6300` Technology & Software
  - Captivate / Opus Clip / Haven Media / similar content tools → `6200` Marketing & Events
  - spARK LABS (own domain) → `6080` unless memo indicates otherwise
  - Pollen Robot → `6080` (office tool/equipment)
  - Emerge AI Hub → `6200` (event-related)
  - Restaurants / cafes → `6080` Office & Operating Expenses - Meals & Hospitality
  - Zoom → `6300` Technology & Software

**Build the Notes field** using this format:
```
[Code] [Label] - [Subcategory] - [Specific description]
```
Example: `6080 Office & Operating Expenses - Meals & Hospitality - Staff breakfast at Blue Sail Cafe`

If you cannot confidently categorize, set Notes to:
```
NEEDS REVIEW - [best guess and why you're uncertain]
```

### Step 6 — Append new rows to the report

After processing all files, write all new (non-duplicate) transactions in a single Python call. Replace `REPORT_PATH` and populate `ROWS` with the extracted data:

```bash
python3 - <<'EOF'
import openpyxl

REPORT_PATH = "REPLACE_WITH_PATH"
ROWS = [
    # ["Date", "Transaction Type", "Name", "Memo/Description", "Split", Amount, "Notes"],
]

wb = openpyxl.load_workbook(REPORT_PATH)
ws = wb.active

for row in ROWS:
    ws.append(row)

wb.save(REPORT_PATH)
print(f"Appended {len(ROWS)} rows. Last row is now {ws.max_row}.")
EOF
```

Each row must follow this column order exactly:
```
[Date] | [Transaction Type] | [Name] | [Memo/Description] | [Split] | [Amount] | [Notes]
```

- `Split`: always `1050 Cash in Bank - Bank of Tampa 5688 (Program)` unless the receipt specifies otherwise
- `Date`: MM/DD/YYYY string format
- `Amount`: numeric value only, no currency symbols

### Step 7 — Report back to the user

After all files are processed, produce this summary:

---

**Expense Report — Run Complete**
*[today's date]*

**Processed:** [N] PDF files from `[scans folder]`
**New transactions added:** [N] rows to `[report filename]`
**Duplicates skipped:** [N]

**Transactions by Category:**
- 6080 Office & Operating Expenses: [N] transactions, $[total]
- 6100 Professional Services: [N] transactions, $[total]
- 6200 Marketing & Events: [N] transactions, $[total]
- 6300 Technology & Software: [N] transactions, $[total]
- 6400 Facilities & Infrastructure: [N] transactions, $[total]
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
- **Refunds or credits**: set Transaction Type to `Deposit`
- **No date visible**: use today's date and flag with `NEEDS REVIEW`
- **Files with no recognizable transaction data**: skip and add to manual review list
