# Renders the "PS" monogram (same look as public/icons/ps.svg) to PNG icons with PIL.
import sys
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; font = sys.argv[2]
def icon(size, rounded):
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill="#14181F")
    else: d.rectangle([0, 0, s, s], fill="#14181F")
    f = ImageFont.truetype(font, int(s * 0.39))
    d.text((s / 2, s / 2), "PS", font=f, fill="#FFFFFF", anchor="mm")
    return im.resize((size, size), Image.LANCZOS)
icon(192, False).save(f"{out}/icon-192.png")
icon(512, False).save(f"{out}/icon-512.png")
icon(180, False).convert("RGB").save(f"{out}/apple-touch-icon.png")
icon(64, True).save(f"{out}/favicon-64.png")
print("icons ok")
