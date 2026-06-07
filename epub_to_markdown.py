#!/usr/bin/env python3
"""
Convert an epub file to a single markdown file.
Usage: python epub_to_markdown.py <path_to_epub> [output.md]
"""

import sys
import re
import ebooklib
from ebooklib import epub
import html2text

def epub_to_markdown(epub_path, output_path=None):
    book = epub.read_epub(epub_path)

    converter = html2text.HTML2Text()
    converter.ignore_links = False
    converter.ignore_images = True
    converter.body_width = 0  # no line wrapping

    sections = []

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        content = item.get_content().decode("utf-8", errors="ignore")
        md = converter.handle(content)
        # strip leading/trailing blank lines per section
        md = md.strip()
        if md:
            sections.append(md)

    full_text = "\n\n---\n\n".join(sections)

    # collapse 3+ consecutive blank lines into 2
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)

    if output_path is None:
        output_path = epub_path.rsplit(".", 1)[0] + ".md"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    print(f"Written to: {output_path}")
    print(f"Characters: {len(full_text):,}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python epub_to_markdown.py <path_to_epub> [output.md]")
        sys.exit(1)

    epub_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    epub_to_markdown(epub_path, output_path)
