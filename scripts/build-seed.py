"""Rebuilds the employer seed list from live validation results.

Input:  /tmp/employer-validation.tsv  (name, ats, slug, industry, size, hq, postings, pmJobs)
Output: server/data/employers.seed.ts with only boards that answered with real postings.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "server" / "data" / "employers.seed.ts"
TSV = Path("/tmp/employer-validation.tsv")

rows = []
seen = set()
for line in TSV.read_text().splitlines():
    parts = line.split("\t")
    if len(parts) < 8:
        continue
    name, ats, slug, industry, size, hq, postings, pm_jobs = parts[:8]
    key = (ats, slug)
    if key in seen:
        continue
    seen.add(key)
    rows.append({
        "name": name.strip(),
        "ats": ats.strip(),
        "slug": slug.strip(),
        "industry": industry.strip() or "Unspecified",
        "size": size.strip() or "Midsize",
        "hq": hq.strip() or "—",
        "postings": int(postings),
        "pm": int(pm_jobs),
    })

# Group by industry for a readable, auditable file.
rows.sort(key=lambda r: (-r["pm"], r["industry"], r["name"]))

def ts(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")

lines = []
current = None
for row in rows:
    if row["industry"] != current:
        current = row["industry"]
        lines.append("")
        lines.append(f"  // {'-' * 60} {current}")
    lines.append(
        f"  ['{ts(row['name'])}', '{row['ats']}', '{ts(row['slug'])}', "
        f"'{ts(row['industry'])}', '{row['size']}', '{ts(row['hq'])}'],"
    )

block = "const RAW: Row[] = [\n" + "\n".join(lines).lstrip("\n") + "\n];\n"

text = SEED.read_text()
updated = re.sub(r"const RAW: Row\[\] = \[.*?\n\];\n", block, text, flags=re.S)
SEED.write_text(updated)

print(f"{len(rows)} employers written")
print(f"total PM roles on those boards: {sum(r['pm'] for r in rows)}")
print(f"total postings: {sum(r['postings'] for r in rows)}")
