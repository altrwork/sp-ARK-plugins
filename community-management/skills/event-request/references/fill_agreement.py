"""
fill_agreement.py
Fills the sp-ARK Event Rental Agreement PDF template with submission data.

Usage:
    python fill_agreement.py '<json_string>'

The JSON string should contain the following keys:
    business_name, event_representative, phone_number, email,
    event_type, event_date (Excel serial OR readable string),
    event_start_time, event_end_time, attendee_count

Output:
    /home/claude/filled_agreement.pdf
"""

import sys
import json
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path

# ── Dependencies ──────────────────────────────────────────────────────────────
try:
    import fitz  # pymupdf
except ImportError:
    print("Installing pymupdf...")
    os.system("pip install pymupdf --quiet --break-system-packages")
    import fitz


# ── Helpers ───────────────────────────────────────────────────────────────────

def excel_serial_to_date(serial) -> str:
    """Convert an Excel date serial number to a readable string like 'May 29, 2026'."""
    try:
        serial = float(serial)
        dt = datetime(1899, 12, 30) + timedelta(days=serial)
        return dt.strftime("%B %d, %Y")
    except (ValueError, TypeError):
        return str(serial)


def format_phone(raw: str) -> str:
    """Format a 10-digit phone number as (XXX) XXX-XXXX."""
    digits = "".join(filter(str.isdigit, str(raw)))
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return str(raw)


def format_time(raw: str) -> str:
    """Convert 24h time string like '13:00' to '1:00 PM', leave '10:00' as '10:00 AM'."""
    try:
        raw = str(raw).strip()
        if "AM" in raw.upper() or "PM" in raw.upper():
            return raw
        parts = raw.split(":")
        hour = int(parts[0])
        minute = parts[1] if len(parts) > 1 else "00"
        if hour < 12:
            period = "PM" if 1 <= hour <= 6 else "AM"
        else:
            period = "PM"
        display_hour = hour if hour <= 12 else hour - 12
        if display_hour == 0:
            display_hour = 12
        return f"{display_hour}:{minute} {period}"
    except Exception:
        return str(raw)


def fit_fontsize(text: str, field_width: float, max_size: float = 12.0) -> float:
    """Return the largest font size where text fits within field_width.
    Uses 0.65x font size as a conservative average character width."""
    if not text:
        return max_size
    return min(field_width / (len(text) * 0.65), max_size)


# ── Main ──────────────────────────────────────────────────────────────────────

def fill_agreement(data: dict, template_path: str, output_path: str):
    """Fill the PDF template with the provided data dict and write to output_path.

    Uses pymupdf (fitz) to generate proper appearance streams so text renders
    correctly in all viewers (including macOS Preview). Font size is auto-fitted
    per field so long values like email addresses are never clipped.
    """

    field_values = {
        "date_created":         datetime.today().strftime("%B %d, %Y"),
        "business_name":        str(data.get("business_name", "")),
        "event_representative": str(data.get("event_representative", "")),
        "phone_number":         format_phone(data.get("phone_number", "")),
        "email":                str(data.get("email", "")),
        "event_type":           str(data.get("event_type", "")),
        "event_date":           excel_serial_to_date(data.get("event_date", "")),
        "event_start_time":     format_time(data.get("event_start_time", "")),
        "event_end_time":       format_time(data.get("event_end_time", "")),
        "number_of_attendees":  str(data.get("attendee_count", "")),
        # V1: left blank intentionally — sp-ARK fills manually
        "price":                "",
        "additional_fees":      "",
        "total_due":            "",
    }

    # Write to a temp path first (pymupdf can't overwrite an open file)
    tmp_path = output_path + ".tmp.pdf"

    doc = fitz.open(template_path)
    for page in doc:
        for widget in page.widgets():
            name = widget.field_name
            if name in field_values:
                value = field_values[name]
                widget.field_value = value
                widget.text_fontsize = fit_fontsize(value, widget.rect.width)
                widget.update()

    doc.save(tmp_path)
    doc.close()
    shutil.move(tmp_path, output_path)

    print(f"✅ Agreement generated: {output_path}")
    print(f"   Company:    {field_values['business_name']}")
    print(f"   Rep:        {field_values['event_representative']}")
    print(f"   Event date: {field_values['event_date']}")
    print(f"   Event type: {field_values['event_type']}")
    print(f"   Start/End:  {field_values['event_start_time']} – {field_values['event_end_time']}")
    print(f"   Attendees:  {field_values['number_of_attendees']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fill_agreement.py '<json_string>'")
        sys.exit(1)

    try:
        submission_data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        sys.exit(1)

    script_dir = Path(__file__).parent
    template = str(script_dir / "sp-ark_event_template.pdf")
    output = "/home/claude/filled_agreement.pdf"

    if not Path(template).exists():
        print(f"❌ Template not found: {template}")
        sys.exit(1)

    fill_agreement(submission_data, template, output)
