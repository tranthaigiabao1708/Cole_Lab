"""Chạy thử hàm predict trên bộ mẫu công khai data/samples.jsonl."""
import json
from pathlib import Path

from solution.normalize import predict

samples = [json.loads(ln) for ln in Path("data/samples.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip()]
ok = 0
for s in samples:
    got = predict(s["input"])
    passed = got == s["expected"]
    ok += passed
    mark = "ĐẠT " if passed else "SAI "
    print(f"{mark} {s['input']['text']!r:40} -> {got.get('text')!r}  (mong đợi {s['expected']['text']!r})")
print(f"\n{ok}/{len(samples)} mẫu đạt")
