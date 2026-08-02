from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
LABELS = ASSETS / "labels"
TEMPLATES = ASSETS / "product-templates"
LOGO_PATH = ASSETS / "soltides-logo-header-v2.png"

# 40 x 20 mm at 600 DPI. Every print label stays at the same 2:1 ratio.
PRINT_W = 945
PRINT_H = 472
PRINT_DPI = (600, 600)

WHITE = (255, 255, 255, 255)
GOLD = (214, 154, 30, 255)
GOLD_DARK = (177, 113, 7, 255)
NAVY = (4, 24, 51, 255)
TRANSPARENT = (0, 0, 0, 0)

FONT_REGULAR = r"C:\Windows\Fonts\ARIALN.TTF"
FONT_BOLD = r"C:\Windows\Fonts\ARIALNB.TTF"


PRODUCTS = [
    {
        "image": "slp-3.png",
        "label": "slp-3-label.png",
        "title": "SLP-3",
        "dose": "60mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "slp-2.png",
        "label": "slp-2-label.png",
        "title": "SLP-2",
        "dose": "15mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "tesamorelin.png",
        "label": "tesamorelin-label.png",
        "title": "TESAMORELIN",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "klow-blend.png",
        "label": "klow-blend-label.png",
        "title": "KLOW BLEND",
        "dose": "50mg / 10mg / 10mg / 10mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "bpc-157-tb-500.png",
        "label": "bpc-157-tb-500-blend-label.png",
        "title": "BPC-157 +\nTB-500",
        "dose": "10mg / 10mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "mt-1.png",
        "label": "mt-1-label.png",
        "title": "MT-1",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "mots-c.png",
        "label": "mots-c-label.png",
        "title": "MOTS-C",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "cp10.png",
        "label": "cp10-label.png",
        "title": "CJC-1295 NO DAC\n+ IPAMORELIN",
        "dose": "5mg / 5mg",
        "vial": "3mL VIAL",
        "template": "clear-3ml-vial-base.png",
        "region": (320, 536, 704, 1200),
    },
    {
        "image": "nad-plus.png",
        "label": "nad-plus-500mg-label-10ml.png",
        "title": "NAD+",
        "dose": "500mg",
        "vial": "10mL VIAL",
        "template": "amber-10ml-vial-base.png",
        "region": (290, 554, 735, 1198),
    },
    {
        "image": "lc216.png",
        "label": "lc216-label.png",
        "title": "LIPO-B",
        "dose": "10mL",
        "vial": "10mL VIAL",
        "template": "amber-10ml-vial-base.png",
        "region": (290, 554, 735, 1198),
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates: Iterable[str] = (
        FONT_BOLD if bold else FONT_REGULAR,
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    max_height: int,
    *,
    start_size: int,
    min_size: int,
    bold: bool = True,
    spacing: int = 3,
) -> ImageFont.FreeTypeFont:
    for size in range(start_size, min_size - 1, -1):
        candidate = load_font(size, bold=bold)
        box = draw.multiline_textbbox((0, 0), text, font=candidate, spacing=spacing, align="center")
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return candidate
    return load_font(min_size, bold=bold)


def crop_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def load_logo() -> Image.Image:
    return crop_alpha(Image.open(LOGO_PATH))


def paste_scaled_center(canvas: Image.Image, art: Image.Image, cx: int, y: int, width: int) -> None:
    art = crop_alpha(art)
    height = round(art.height * width / art.width)
    art = art.resize((width, height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(art, (cx - width // 2, y))


def centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    cx: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    *,
    fill=NAVY,
    spacing: int = 3,
) -> None:
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    width = box[2] - box[0]
    draw.multiline_text((cx - width / 2, y), text, font=font, fill=fill, spacing=spacing, align="center")


def centered_text_in_box(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[int, int, int, int],
    font: ImageFont.FreeTypeFont,
    *,
    fill=NAVY,
    spacing: int = 3,
) -> None:
    x0, y0, x1, y1 = box
    bounds = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    x = x0 + (x1 - x0 - width) / 2 - bounds[0]
    y = y0 + (y1 - y0 - height) / 2 - bounds[1]
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=spacing, align="center")


def gold_badge(canvas: Image.Image, box: tuple[int, int, int, int], text: str, font: ImageFont.FreeTypeFont) -> None:
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    badge = Image.new("RGBA", (width, height), TRANSPARENT)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=max(10, height // 4), fill=255)
    gradient = Image.new("RGBA", (width, height), TRANSPARENT)
    pixels = gradient.load()
    for x in range(width):
        t = x / max(1, width - 1)
        highlight = 1.0 - abs(t - 0.34) * 0.7
        r = int(GOLD_DARK[0] + (GOLD[0] - GOLD_DARK[0]) * highlight)
        g = int(GOLD_DARK[1] + (GOLD[1] - GOLD_DARK[1]) * highlight)
        b = int(GOLD_DARK[2] + (GOLD[2] - GOLD_DARK[2]) * highlight)
        for y in range(height):
            pixels[x, y] = (r, g, b, 255)
    gradient.putalpha(mask)
    canvas.alpha_composite(gradient, (x0, y0))
    draw = ImageDraw.Draw(canvas)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x0 + (width - tw) / 2, y0 + (height - th) / 2 - bbox[1]), text, font=font, fill=WHITE)


def front_art(product: dict[str, object], width: int, height: int, logo: Image.Image) -> Image.Image:
    art = Image.new("RGBA", (width, height), TRANSPARENT)
    draw = ImageDraw.Draw(art)
    cx = width // 2

    paste_scaled_center(art, logo, cx, round(height * 0.055), round(width * 0.70))

    title = str(product["title"])
    title_font = fit_font(
        draw,
        title,
        round(width * 0.78),
        round(height * 0.27),
        start_size=round(height * 0.13),
        min_size=round(height * 0.055),
        spacing=2,
    )
    centered_text_in_box(
        draw,
        title,
        (round(width * 0.11), round(height * 0.29), round(width * 0.89), round(height * 0.52)),
        title_font,
        spacing=2,
    )

    dose = str(product["dose"])
    dose_font = fit_font(
        draw,
        dose,
        round(width * 0.66),
        round(height * 0.09),
        start_size=round(height * 0.085),
        min_size=round(height * 0.035),
    )
    dose_box = draw.textbbox((0, 0), dose, font=dose_font)
    badge_w = min(round(width * 0.82), max(round(width * 0.46), dose_box[2] - dose_box[0] + round(width * 0.12)))
    badge_h = round(height * 0.13)
    badge_y = round(height * 0.60)
    gold_badge(art, (cx - badge_w // 2, badge_y, cx + badge_w // 2, badge_y + badge_h), dose, dose_font)

    divider_y = round(height * 0.78)
    draw.line((round(width * 0.13), divider_y, round(width * 0.87), divider_y), fill=GOLD, width=max(2, width // 180))

    vial_font = fit_font(draw, str(product["vial"]), round(width * 0.72), round(height * 0.07), start_size=round(height * 0.064), min_size=20)
    centered_text(draw, str(product["vial"]), cx, round(height * 0.81), vial_font)
    footer_font = fit_font(draw, "FOR RESEARCH USE ONLY", round(width * 0.86), round(height * 0.055), start_size=round(height * 0.048), min_size=16, bold=False)
    centered_text(draw, "FOR RESEARCH USE ONLY", cx, round(height * 0.90), footer_font)
    return art


def cylindrical_wrap(art: Image.Image) -> Image.Image:
    """Apply subtle real-world label curvature without stretching the typography."""
    src = np.asarray(art.convert("RGBA"), dtype=np.float32)
    height, width, _ = src.shape
    out = np.zeros_like(src)
    for x in range(width):
        xn = (2.0 * x / max(1, width - 1)) - 1.0
        source_normal = xn + 0.08 * (xn**3 - xn)
        sx = (source_normal + 1.0) * 0.5 * (width - 1)
        x0 = int(np.floor(sx))
        x1 = min(width - 1, x0 + 1)
        blend = sx - x0
        column = src[:, x0, :] * (1.0 - blend) + src[:, x1, :] * blend
        shift = int(round(1.5 * xn * xn))
        shade = 0.94 + 0.06 * np.sqrt(max(0.0, 1.0 - xn * xn))
        column[:, :3] *= shade
        if shift:
            out[shift:, x, :] = column[: height - shift, :]
        else:
            out[:, x, :] = column
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def create_vial(product: dict[str, object], logo: Image.Image) -> Image.Image:
    base = Image.open(TEMPLATES / str(product["template"])).convert("RGBA")
    left, top, right, bottom = product["region"]
    width, height = right - left, bottom - top
    label_art = front_art(product, width, height, logo)
    label_art = cylindrical_wrap(label_art)
    base.alpha_composite(label_art, (left, top))
    return base


def create_print_label(product: dict[str, object], logo: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (PRINT_W, PRINT_H), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    outer = (7, 7, PRINT_W - 8, PRINT_H - 8)
    draw.rounded_rectangle(outer, radius=28, fill=WHITE, outline=GOLD, width=4)

    paste_scaled_center(canvas, logo, PRINT_W // 2, 20, 330)

    title = str(product["title"])
    title_font = fit_font(draw, title, 820, 126, start_size=88, min_size=40, spacing=3)
    centered_text_in_box(draw, title, (55, 130, PRINT_W - 55, 260), title_font, spacing=3)

    dose = str(product["dose"])
    dose_font = fit_font(draw, dose, 520, 62, start_size=58, min_size=30)
    dose_bbox = draw.textbbox((0, 0), dose, font=dose_font)
    badge_w = min(650, max(225, dose_bbox[2] - dose_bbox[0] + 90))
    gold_badge(canvas, (PRINT_W // 2 - badge_w // 2, 278, PRINT_W // 2 + badge_w // 2, 346), dose, dose_font)

    draw.line((205, 370, 740, 370), fill=GOLD, width=3)
    footer = f'{product["vial"]}   •   FOR RESEARCH USE ONLY'
    footer_font = fit_font(draw, footer, 820, 44, start_size=37, min_size=23)
    centered_text(draw, footer, PRINT_W // 2, 390, footer_font)
    return canvas


def generate(*, labels_only: bool = False, vials_only: bool = False) -> None:
    LABELS.mkdir(parents=True, exist_ok=True)
    logo = load_logo()
    for product in PRODUCTS:
        if not vials_only:
            label = create_print_label(product, logo)
            destination = LABELS / str(product["label"])
            label.save(destination, dpi=PRINT_DPI, optimize=True)
            print(f"saved {destination}")
        if not labels_only:
            vial = create_vial(product, logo)
            destination = ASSETS / str(product["image"])
            vial.save(destination, optimize=True)
            print(f"saved {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate all SolTides print labels and curved premium vial images.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--labels-only", action="store_true")
    group.add_argument("--vials-only", action="store_true")
    args = parser.parse_args()
    generate(labels_only=args.labels_only, vials_only=args.vials_only)


if __name__ == "__main__":
    main()
