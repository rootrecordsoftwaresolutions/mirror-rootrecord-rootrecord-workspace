"""Resize tablet screenshots for Google Play 7\" and 10\" buckets (16:9)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image

# Play: 7\" — 16:9 or 9:16, sides 320–3840 px
SIZE_7 = (1920, 1080)
# Play: 10\" — 16:9 or 9:16, sides 1080–7680 px
SIZE_10 = (2560, 1440)


def crop_to_aspect(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    tw, th = target_w, target_h
    tr = tw / th
    iw, ih = img.size
    sr = iw / ih
    if sr > tr:
        nw = int(ih * tr)
        left = (iw - nw) // 2
        img = img.crop((left, 0, left + nw, ih))
    else:
        nh = int(iw / tr)
        top = (ih - nh) // 2
        img = img.crop((0, top, iw, top + nh))
    return img.resize((tw, th), Image.Resampling.LANCZOS)


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Admin\Pictures\tablet")
    if not src.is_dir():
        print(f"Not a directory: {src}", file=sys.stderr)
        sys.exit(1)

    out7 = src / "7"
    out10 = src / "10"
    out7.mkdir(exist_ok=True)
    out10.mkdir(exist_ok=True)

    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = sorted(
        p for p in src.iterdir() if p.is_file() and p.suffix.lower() in exts
    )
    if not files:
        print(f"No images found in {src}")
        sys.exit(0)

    for path in files:
        stem = path.stem
        try:
            im = Image.open(path).convert("RGB")
        except OSError as e:
            print(f"Skip {path.name}: {e}")
            continue

        im7 = crop_to_aspect(im, *SIZE_7)
        im10 = crop_to_aspect(im, *SIZE_10)

        out7_path = out7 / f"{stem}_7inch.jpg"
        out10_path = out10 / f"{stem}_10inch.jpg"
        im7.save(out7_path, "JPEG", quality=92, optimize=True)
        im10.save(out10_path, "JPEG", quality=92, optimize=True)
        print(out7_path.name, "->", SIZE_7, "|", out10_path.name, "->", SIZE_10)

    print(f"Done. {len(files)} source(s) -> {out7} and {out10}")


if __name__ == "__main__":
    main()
