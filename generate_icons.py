from pathlib import Path
from PIL import Image, ImageDraw

# Colours
BG_TOP = (230, 246, 255)   # #E6F6FF
BG_BOTTOM = (56, 189, 248) # #38BDF8
RING_A = (56, 189, 248)    # #38BDF8
RING_B = (125, 211, 252)   # #7DD3FC
NAVY = (11, 116, 197)      # #0B74C5
WHITE = (255, 255, 255)

def lerp(a, b, t):
    return int(a + (b - a) * t)

def make_gradient(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = lerp(BG_TOP[0], BG_BOTTOM[0], t)
        g = lerp(BG_TOP[1], BG_BOTTOM[1], t)
        b = lerp(BG_TOP[2], BG_BOTTOM[2], t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img

def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    return mask

def draw_icon(size, out_path):
    # Background
    bg = make_gradient(size)
    radius = int(size * 0.1875)  # matches the 96/512 feel
    mask = rounded_rect_mask(size, radius)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(canvas)

    # Target geometry
    cx = cy = size // 2
    r_outer = int(size * 0.289)   # ~148 at 512
    r1 = int(size * 0.234)        # ~120
    r2 = int(size * 0.164)        # ~84
    r3 = int(size * 0.094)        # ~48
    r_dot = int(size * 0.031)     # ~16

    # White disc
    d.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=WHITE)

    # Rings (stroke width scales)
    w = max(2, int(size * 0.051))  # ~26 at 512

    def ring(r, colour):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=w)

    ring(r1, RING_A)
    ring(r2, RING_B)
    ring(r3, RING_A)

    # Centre dot
    d.ellipse([cx - r_dot, cy - r_dot, cx + r_dot, cy + r_dot], fill=NAVY)

    # Diagonal shaft (two strokes for highlight)
    x0 = int(size * 0.289)  # ~148
    y0 = int(size * 0.711)  # ~364
    x1 = cx
    y1 = cy

    shaft_w = max(2, int(size * 0.031))      # ~16
    shaft_w2 = max(1, int(size * 0.016))     # ~8

    d.line([(x0, y0), (x1, y1)], fill=NAVY, width=shaft_w, joint="curve")
    d.line([(x0, y0), (x1, y1)], fill=RING_B, width=shaft_w2, joint="curve")

    canvas.save(out_path, "PNG")

def write_svg(out_path):
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-label="Goal Tracker icon">
  <defs>
    <linearGradient id="bg" x1="96" y1="80" x2="416" y2="432">
      <stop offset="0" stop-color="#E6F6FF"/>
      <stop offset="1" stop-color="#38BDF8"/>
    </linearGradient>
  </defs>

  <rect x="48" y="48" width="416" height="416" rx="96" fill="url(#bg)"/>

  <circle cx="256" cy="256" r="148" fill="#ffffff"/>
  <circle cx="256" cy="256" r="120" fill="none" stroke="#38BDF8" stroke-width="26"/>
  <circle cx="256" cy="256" r="84"  fill="none" stroke="#7DD3FC" stroke-width="26"/>
  <circle cx="256" cy="256" r="48"  fill="none" stroke="#38BDF8" stroke-width="26"/>
  <circle cx="256" cy="256" r="16"  fill="#0B74C5"/>

  <path d="M148 364 L256 256" stroke="#0B74C5" stroke-width="16" stroke-linecap="round"/>
  <path d="M148 364 L256 256" stroke="#7DD3FC" stroke-width="8" stroke-linecap="round"/>
</svg>
"""
    out_path.write_text(svg, encoding="utf-8")

def main():
    out_dir = Path("public/icons")
    out_dir.mkdir(parents=True, exist_ok=True)

    # SVG (for reference/use in docs)
    write_svg(out_dir / "target-icon.svg")

    # Required PNGs
    draw_icon(192, out_dir / "icon-192.png")
    draw_icon(512, out_dir / "icon-512.png")
    draw_icon(512, out_dir / "maskable-512.png")
    draw_icon(180, out_dir / "apple-touch-icon.png")

    print("Generated icons in public/icons/")

if __name__ == "__main__":
    main()
