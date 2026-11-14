"""Generates the NSIS installer artwork into build/ (needs Pillow: pip install pillow).
Run: python scripts/make-installer-art.py
  installerSidebar.bmp / uninstallerSidebar.bmp  164x314
  installerHeader.bmp                            150x57
"""
from PIL import Image, ImageDraw, ImageFont

icon = Image.open('build/icon.png').convert('RGBA')
BG_TOP, BG_BOT = (43, 43, 43), (5, 5, 5)


def font(size):
    for name in ('segoeuib.ttf', 'arialbd.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def gradient(w, h):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))
    return img


def sidebar(path):
    img = gradient(164, 314)
    logo = icon.resize((96, 96), Image.LANCZOS)
    img.paste(logo, (34, 70), logo)
    d = ImageDraw.Draw(img)
    f = font(17)
    text = 'AppleLauncher'
    w = d.textlength(text, font=f)
    d.text(((164 - w) / 2, 184), text, font=f, fill=(255, 255, 255))
    img.save(path, format='BMP')


def header(path):
    img = Image.new('RGB', (150, 57), (8, 8, 8))
    logo = icon.resize((41, 41), Image.LANCZOS)
    img.paste(logo, (101, 8), logo)
    img.save(path, format='BMP')


sidebar('build/installerSidebar.bmp')
sidebar('build/uninstallerSidebar.bmp')
header('build/installerHeader.bmp')
print('installer art written to build/')
