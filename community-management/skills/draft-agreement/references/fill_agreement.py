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
from datetime import datetime, timedelta
from pathlib import Path

# ── Dependencies ──────────────────────────────────────────────────────────────
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    print("Installing pypdf...")
    os.system("pip install pypdf --quiet --break-system-packages")
    from pypdf import PdfReader, PdfWriter


# ── Helpers ───────────────────────────────────────────────────────────────────

def excel_serial_to_date(serial) -> str:
    """Convert an Excel date serial number to a readable string like 'May 29, 2026'."""
    try:
        serial = float(serial)
        # Excel's epoch is Dec 30, 1899
        dt = datetime(1899, 12, 30) + timedelta(days=serial)
        return dt.strftime("%B %d, %Y")
    except (ValueError, TypeError):
        # Already a readable string — return as-is
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
        # Already has AM/PM
        if "AM" in raw.upper() or "PM" in raw.upper():
            return raw
        parts = raw.split(":")
        hour = int(parts[0])
        minute = parts[1] if len(parts) > 1 else "00"
        # Hours 1-6 without AM/PM context are almost always PM for event times
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


# ── Main ──────────────────────────────────────────────────────────────────────

def fill_agreement(data: dict, template_path: str, output_path: str):
    """Fill the PDF template with the provided data dict and write to output_path."""

    # Build the field value map
    field_values = {
        "date_created":       datetime.today().strftime("%B %d, %Y"),
        "business_name":      str(data.get("business_name", "")),
        "event_representative": str(data.get("event_representative", "")),
        "phone_number":       format_phone(data.get("phone_number", "")),
        "email":              str(data.get("email", "")),
        "event_type":         str(data.get("event_type", "")),
        "event_date":         excel_serial_to_date(data.get("event_date", "")),
        "event_start_time":   format_time(data.get("event_start_time", "")),
        "event_end_time":     format_time(data.get("event_end_time", "")),
        "number_of_attendees": str(data.get("attendee_count", "")),
        # V1: left blank intentionally — sp-ARK fills manually
        "price":              "",
        "additional_fees":    "",
        "total_due":          "",
    }

    reader = PdfReader(template_path)
    writer = PdfWriter()
    writer.append(reader)

    # Fill fields across all pages
    for page_num in range(len(writer.pages)):
        writer.update_page_form_field_values(
            writer.pages[page_num],
            field_values,
            auto_regenerate=False,
        )

    with open(output_path, "wb") as f:
        writer.write(f)

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

    # Template lives in the same directory as this script
    script_dir = Path(__file__).parent
    template = str(script_dir / "sp-ark_event_template.pdf")
    output = "/home/claude/filled_agreement.pdf"

    if not Path(template).exists():
        print(f"❌ Template not found: {template}")
        sys.exit(1)

    fill_agreement(submission_data, template, output)
