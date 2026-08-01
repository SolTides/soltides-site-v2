from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
LABELS = ASSETS / "labels"
LOGO_PATH = ASSETS / "soltides-logo-header-v2.png"

CANVAS_W = 2000
CANVAS_H = 1000
MARGIN = 48
RADIUS = 54
BORDER = 6

WHITE = (255, 255, 255, 255)
GOLD = (214, 154, 30, 255)
GOLD_DARK = (184, 123, 13, 255)
BLACK = (18, 18, 18, 255)
TRANSPARENT = (0, 0, 0, 0)


PRODUCTS = [
    {
        "filename": "cp10-label.png",
        "title": "CJC-1295 NO DAC\n+ IPAMORELIN",
        "dose": "5mg / 5mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "lc216-label.png",
        "title": "LIPO-B",
        "dose": "10mL",
        "vial": "10mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "mots-c-label.png",
        "title": "MOTS-C",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "nad-plus-500mg-label-10ml.png",
        "title": "NAD+",
        "dose": "500mg",
        "vial": "10mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "mt-1-label.png",
        "title": "MT-1",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "bpc-157-tb-500-blend-label.png",
        "title": "BPC-157 +\nTB-500 BLEND",
        "dose": "10mg / 10mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "klow-blend-label.png",
        "title": "KLOW BLEND",
        "dose": "50mg / 10mg / 10mg / 10mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "tesamorelin-label.png",
        "title": "TESAMORELIN",
        "dose": "10mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "slp-2-label.png",
        "title": "SLP-2",
        "dose": "15mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
    {
        "filename": "slp-3-label.png",
        "title": "SLP-3",
        "dose": "60mg",
        "vial": "3mL VIAL",
        "footer": "FOR RESEARCH USE ONLY",
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates: Iterable[str]
    if bold:
        candidates = (
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
        )
    else:
        candidates = (
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
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
    bold: bool = False,
    spacing: int = 0,
) -> ImageFont.FreeTypeFont:
    for size in range(start_size, min_size - 1, -2):
        font = load_font(size, bold=bold)
        left, top, right, bottom = draw.multiline_textbbox(
            (0, 0),
            text,
            font=font,
            spacing=spacing,
            align="center",
        )
        if (right - left) <= max_width and (bottom - top) <= max_height:
            return font
    return load_font(min_size, bold=bold)


def crop_logo() -> Image.Image:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    alpha = logo.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    return logo


def add_gold_pill(
    base: Image.Image,
    rect: tuple[int, int, int, int],
    radius: int,
) -> None:
    x1, y1, x2, y2 = rect
    pill = Image.new("RGBA", (x2 - x1, y2 - y1), TRANSPARENT)
    draw = ImageDraw.Draw(pill)
    draw.rounded_rectangle((0, 0, x2 - x1 - 1, y2 - y1 - 1), radius=radius, fill=GOLD)

    alpha_mask = pill.getchannel("A")

    for y in range(y2 - y1):
        blend = y / max(1, (y2 - y1 - 1))
        r = int(GOLD[0] * (1 - blend) + GOLD_DARK[0] * blend)
        g = int(GOLD[1] * (1 - blend) + GOLD_DARK[1] * blend)
        b = int(GOLD[2] * (1 - blend) + GOLD_DARK[2] * blend)
        line = Image.new("RGBA", (x2 - x1, 1), (r, g, b, 255))
        pill.alpha_composite(line, (0, y))
    pill.putalpha(alpha_mask)

    base.alpha_composite(pill, (x1, y1))


def create_label(product: dict[str, str], logo: Image.Image) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), TRANSPARENT)
    draw = ImageDraw.Draw(img)

    rect = (MARGIN, MARGIN, CANVAS_W - MARGIN, CANVAS_H - MARGIN)
    draw.rounded_rectangle(rect, radius=RADIUS, fill=WHITE, outline=GOLD, width=BORDER)

    logo_target_w = 860
    scale = min(logo_target_w / logo.width, 148 / logo.height)
    logo_size = (int(logo.width * scale), int(logo.height * scale))
    logo_resized = logo.resize(logo_size, Image.LANCZOS)
    logo_x = (CANVAS_W - logo_resized.width) // 2
    logo_y = 70
    img.alpha_composite(logo_resized, (logo_x, logo_y))

    title_top = 188
    title_box_h = 336
    title_lines = product["title"].count("\n") + 1
    title_plain = product["title"].replace("\n", " ")
    title_len = len(title_plain)

    if title_lines > 1:
        title_start = 152
        title_min = 88
        title_max_width = 1740
    elif title_len <= 6:
        title_start = 210
        title_min = 112
        title_max_width = 1500
    elif title_len <= 10:
        title_start = 194
        title_min = 102
        title_max_width = 1620
    else:
        title_start = 172
        title_min = 90
        title_max_width = 1760

    title_font = fit_font(
        draw,
        product["title"],
        max_width=title_max_width,
        max_height=title_box_h,
        start_size=title_start,
        min_size=title_min,
        bold=True,
        spacing=6,
    )
    title_bbox = draw.multiline_textbbox(
        (0, 0),
        product["title"],
        font=title_font,
        spacing=6,
        align="center",
    )
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    title_x = (CANVAS_W - title_w) // 2
    title_y = title_top + (title_box_h - title_h) // 2
    draw.multiline_text(
        (title_x, title_y),
        product["title"],
        font=title_font,
        fill=BLACK,
        spacing=6,
        align="center",
    )

    pill_top = 532
    dose_font = fit_font(
        draw,
        product["dose"],
        max_width=980,
        max_height=104,
        start_size=92,
        min_size=44,
        bold=True,
    )
    dose_bbox = draw.textbbox((0, 0), product["dose"], font=dose_font)
    dose_w = dose_bbox[2] - dose_bbox[0]
    dose_h = dose_bbox[3] - dose_bbox[1]
    pill_w = max(360, dose_w + 130)
    pill_h = 112
    pill_x = (CANVAS_W - pill_w) // 2
    pill_y = pill_top
    add_gold_pill(img, (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h), radius=28)
    draw.rounded_rectangle(
        (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h),
        radius=30,
        outline=GOLD_DARK,
        width=2,
    )
    draw.text(
        ((CANVAS_W - dose_w) // 2, pill_y + (pill_h - dose_h) // 2 - 8),
        product["dose"],
        font=dose_font,
        fill=WHITE,
    )

    divider_y = 694
    line_width = 4
    diamond_size = 18
    gap = 24
    center_x = CANVAS_W // 2
    left_end = center_x - gap
    right_start = center_x + gap
    line_span = 500
    draw.line((left_end - line_span, divider_y, left_end, divider_y), fill=GOLD, width=line_width)
    draw.line((right_start, divider_y, right_start + line_span, divider_y), fill=GOLD, width=line_width)
    diamond = [
        (center_x, divider_y - diamond_size),
        (center_x + diamond_size, divider_y),
        (center_x, divider_y + diamond_size),
        (center_x - diamond_size, divider_y),
    ]
    draw.polygon(diamond, fill=WHITE, outline=GOLD)
    inner = 9
    draw.polygon(
        [
            (center_x, divider_y - inner),
            (center_x + inner, divider_y),
            (center_x, divider_y + inner),
            (center_x - inner, divider_y),
        ],
        fill=GOLD,
    )

    footer_text = f'{product["vial"]}    •    {product["footer"]}'
    footer_font = fit_font(
        draw,
        footer_text,
        max_width=1540,
        max_height=54,
        start_size=44,
        min_size=24,
        bold=True,
    )
    footer_bbox = draw.textbbox((0, 0), footer_text, font=footer_font)
    footer_w = footer_bbox[2] - footer_bbox[0]
    footer_h = footer_bbox[3] - footer_bbox[1]
    footer_y = 760
    draw.text(((CANVAS_W - footer_w) // 2, footer_y), footer_text, font=footer_font, fill=BLACK)

    return img


def main() -> None:
    LABELS.mkdir(parents=True, exist_ok=True)
    logo = crop_logo()

    for product in PRODUCTS:
        destination = LABELS / product["filename"]
        label = create_label(product, logo)
        label.save(destination, dpi=(300, 300))
        print(f"saved {destination}")


if __name__ == "__main__":
    main()
