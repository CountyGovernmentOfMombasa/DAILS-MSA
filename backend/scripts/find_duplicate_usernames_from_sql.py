#!/usr/bin/env python3
import re
from collections import Counter, defaultdict
from pathlib import Path

SQL_PATH = Path(r"c:\Users\Admin\WDP\backend\database\admin_users_insert_from_csv_20251101.sql")

pattern = re.compile(r"\(\s*\d+\s*,\s*'([^']+)'\s*,")

usernames = []
line_hits = defaultdict(list)

with SQL_PATH.open('r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        m = pattern.search(line)
        if m:
            u = m.group(1)
            usernames.append(u)
            line_hits[u].append(i)

counts = Counter(usernames)

dups = {u: (c, line_hits[u]) for u, c in counts.items() if c > 1}

print(f"Total rows parsed: {len(usernames)}")
print(f"Duplicate usernames: {len(dups)} kinds")
for u, (c, lines) in sorted(dups.items(), key=lambda x: (-x[1][0], x[0].lower())):
    print(f"{u}: {c} occurrences on lines {lines}")
