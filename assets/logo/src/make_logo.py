"""Latti 세 면 상자 로고의 SVG 원본을 만든다 (Inkscape 1.2 로 모서리 둥글리기와 합치기).

윗면은 Toss 파랑 #3182f6, 옆 두 면은 앱 잉크 #191f28, 바탕은 흰색.
256 격자. 결과는 이 폴더의 상위(assets/logo/)에 쓴다. PNG 는 node scripts/make-icons.mjs 가 만든다.

usage: python3 -I assets/logo/src/make_logo.py
"""
import math, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from geo import f, pt, polar, inset, poly_path, smooth_rect  # noqa: E402

OUT = os.path.dirname(HERE)
WORDMARK_SRC = os.path.join(OUT, "wordmark.svg")
WORK = tempfile.mkdtemp(prefix="latti-logo-")
ENV = dict(os.environ, INKSCAPE_PROFILE_DIR=os.path.join(WORK, "profile"))

BLUE, INK, WHITE = "#3182f6", "#191f28", "#ffffff"
C = (128, 128)

# 크기 (256 격자에서 상자 높이와 배율)
MARK_H = 204          # 원본 표식: 상자 높이 204, 가운데 128
ICON_S = 0.70         # 앱 아이콘(가득 찬 흰 사각형 위): 상자 높이 = 204 * 0.70 = 143 (56 %)
ICON_LIFT = 3         # 아래 두 면이 무거워 보여 3 단위 올린다
MASK_S = 0.58         # 둥근 마스크(안전 원 지름 80 %) 안에 넉넉히
TILE_S = 0.72         # 흰 둥근 타일(설치 아이콘)
FAV_S = 144 / 188.04  # 16, 32 px 파비콘: 상자 너비 144 단위 = 16 px 에서 9 px, 32 px 에서 18 px (세로 모서리가 픽셀 경계에 닿는다)
AND_S = 0.45          # 안드로이드 적응형 앞면(108 중 72 가 보인다)

# ---------------------------------------------------------------- Inkscape
def ink(src, actions, dst):
    a = ";".join(actions) + f";export-plain-svg;export-filename:{dst};export-overwrite;export-do"
    r = subprocess.run(["inkscape", src, f"--actions={a}"], env=ENV, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr)

TOK = re.compile(r"[MLHVCAZmlhvcaz]|-?\d*\.?\d+(?:e-?\d+)?")
ARITY = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "A": 7, "Z": 0}

def transform_abs(d, sx=1.0, tx=0.0, ty=0.0):
    out, i, t, cmd = [], 0, TOK.findall(d.replace(",", " ")), None
    while i < len(t):
        if t[i].isalpha():
            cmd = t[i].upper() if t[i] in "zZ" else t[i]; i += 1
            if cmd != cmd.upper():
                raise ValueError("relative command in " + d[:60])
            out.append(cmd)
            if cmd == "Z":
                continue
        n = ARITY[cmd]
        p = [float(x) for x in t[i:i + n]]; i += n
        if cmd == "H": p = [p[0] * sx + tx]
        elif cmd == "V": p = [p[0] * sx + ty]
        elif cmd == "A": p = [p[0] * sx, p[1] * sx, p[2], p[3], p[4], p[5] * sx + tx, p[6] * sx + ty]
        else: p = [v * sx + (tx if k % 2 == 0 else ty) for k, v in enumerate(p)]
        out.append(" ".join(f(v) for v in p))
        if cmd == "M": cmd = "L"
    s = ""
    for o in out:
        s += o if o[0].isalpha() else (" " if s and not s[-1].isalpha() else "") + o
    return s

def collect(svgfile, ids):
    root = ET.parse(svgfile).getroot()
    out = {}
    for el in root.iter():
        if el.get("id") in ids:
            out[el.get("id")] = transform_abs(el.get("d"))
    return out

def bbox_of(svgfile, ids):
    r = subprocess.run(["inkscape", svgfile, "--query-all"], env=ENV, capture_output=True, text=True)
    bs = []
    for line in r.stdout.splitlines():
        p = line.split(",")
        if p[0] in ids:
            x, y, w, h = map(float, p[1:5]); bs.append((x, y, x + w, y + h))
    return (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))

# ---------------------------------------------------------------- geometry
def hexv(R):
    return [polar(C, R, -90 + 60 * k) for k in range(6)]

def face_polys(R, g, r):
    """세 마름모 면(윗면, 왼면, 오른면). 면 사이 틈 g, 모든 모서리 반지름 r: 안으로 r 만큼 줄인 뒤 2r 둥근 선을 둘러 합친다."""
    v = hexv(R)
    polys = [[v[0], v[1], C, v[5]], [v[5], C, v[3], v[4]], [C, v[1], v[2], v[3]]]
    inner = [[0, 1, 1, 0], [1, 1, 0, 0], [1, 0, 0, 1]]
    return [inset(polys[i], [r + g / 2 * inner[i][k] for k in range(4)]) for i in range(3)]

def source(polys, r, sx=1.0, tx=0.0, ty=0.0):
    body = ""
    for i, p in enumerate(polys):
        d = transform_abs(poly_path(p), sx, tx, ty)
        body += f'<path id="f{i}" d="{d}" fill="#000"/>'
        body += f'<path id="f{i}s" d="{d}" fill="none" stroke="#000" stroke-width="{f(2 * r * sx)}" stroke-linejoin="round"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">{body}</svg>'

def faces(g, r, height=MARK_H, R=104):
    acts = []
    for i in range(3):
        acts += [f"select-by-id:f{i}s", "object-stroke-to-path", "select-clear",
                 f"select-by-id:f{i},f{i}s", "path-union", "select-clear"]
    polys = face_polys(R, g, r)
    s1, o1 = f"{WORK}/s1.svg", f"{WORK}/o1.svg"
    open(s1, "w").write(source(polys, r)); ink(s1, acts, o1)
    x0, y0, x1, y1 = bbox_of(o1, ["f0", "f1", "f2"])
    sx = height / (y1 - y0)
    tx = 128 - (x0 + x1) / 2 * sx
    ty = 128 - (y0 + y1) / 2 * sx
    s2, o2 = f"{WORK}/s2.svg", f"{WORK}/o2.svg"
    open(s2, "w").write(source(polys, r, sx, tx, ty)); ink(s2, acts, o2)
    p = collect(o2, ["f0", "f1", "f2"])
    return {"top": p["f0"], "left": p["f1"], "right": p["f2"], "scale": sx}

# ---------------------------------------------------------------- documents
def doc(title, inner, vb="0 0 256 256", w=256, h=256):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img">'
            f'<title>{title}</title>{inner}</svg>\n')

def mark(m, top=BLUE, side=INK):
    return (f'<path id="top" fill="{top}" d="{m["top"]}"/>'
            f'<path id="left" fill="{side}" d="{m["left"]}"/>'
            f'<path id="right" fill="{side}" d="{m["right"]}"/>')

def placed(m, s, lift=0.0, top=BLUE, side=INK):
    t = 128 - 128 * s
    return f'<g transform="translate({f(t)} {f(t - lift)}) scale({f(s)})">{mark(m, top, side)}</g>'

TILE = smooth_rect(0, 0, 256, 256, 46)   # iOS 아이콘 모양에 가까운 연속 곡률 모서리(시작점 59 단위)
TILE_SMALL = smooth_rect(0, 0, 256, 256, 40)

def write(name, text):
    open(os.path.join(OUT, name), "w").write(text)

def main():
    big = faces(g=12, r=10)       # 원본(세 면 상자 확정판과 같은 치수)
    small = faces(g=22, r=7)      # 16 to 32 px 용: 틈을 넓히고 모서리를 덜 둥글게
    wm = ET.parse(WORDMARK_SRC).getroot()
    wd = [e for e in wm.iter() if e.get("d")][0].get("d")
    W, H = map(float, wm.get("viewBox").split()[2:])

    write("mark.svg", doc("Latti 세 면 상자", mark(big)))
    write("mark-small.svg", doc("Latti 세 면 상자 작은 판", mark(small)))
    write("mark-mono.svg", doc("Latti 세 면 상자 한 색", mark(big, INK, INK)))
    write("icon.svg", doc("Latticework 앱 아이콘", f'<rect width="256" height="256" fill="{WHITE}"/>' + placed(big, ICON_S, ICON_LIFT)))
    write("icon-tile.svg", doc("Latticework 둥근 타일", f'<path fill="{WHITE}" d="{TILE}"/>' + placed(big, TILE_S, 2)))
    write("icon-maskable.svg", doc("Latticework 마스크 아이콘", f'<rect width="256" height="256" fill="{WHITE}"/>' + placed(big, MASK_S, 2)))
    write("favicon.svg", doc("Latticework 파비콘", f'<path fill="{WHITE}" d="{TILE_SMALL}"/>' + placed(small, FAV_S, 0)))
    # 16 px 판: 세로 틈이 픽셀 한 칸에 딱 맞게 반 픽셀(8 단위) 왼쪽으로 민다
    write("favicon-16.svg", doc("Latticework 파비콘 16", f'<path fill="{WHITE}" d="{TILE_SMALL}"/><g transform="translate(-8 0)">' + placed(small, FAV_S, 0) + "</g>"))
    # 어두운 바탕: 옆면만 흰색으로 뒤집고 윗면은 그대로 파랑 (앱의 Latti 얼굴과 어두운 시작 화면)
    write("mark-reversed.svg", doc("Latti 세 면 상자 어두운 바탕", mark(big, BLUE, WHITE)))
    write("mark-small-reversed.svg", doc("Latti 세 면 상자 작은 판 어두운 바탕", mark(small, BLUE, WHITE)))
    write("android-foreground.svg", doc("Latticework 안드로이드 앞면", placed(big, AND_S, 2)))
    write("android-monochrome.svg", doc("Latticework 안드로이드 한 색", placed(big, AND_S, 2, "#000000", "#000000")))

    # 세로 묶음: 표식 256, 틈 48, 글자 높이 = 표식의 0.19
    s = 256 * 0.19 / H
    ww, wh = W * s, H * s
    tw = max(256, ww); th = 256 + 48 + wh
    inner = f'<g transform="translate({f((tw - 256) / 2)} 0)">{mark(big)}</g>'
    inner += f'<path fill="{INK}" transform="translate({f((tw - ww) / 2)} {f(256 + 48)}) scale({f(s)})" d="{wd}"/>'
    write("lockup.svg", doc("Latticework 시작 화면 묶음", inner, f"0 0 {f(tw)} {f(th)}", f(tw), f(th)))
    write("wordmark.svg", doc("Latticework", f'<path fill="{INK}" d="{wd}"/>', f"0 0 {f(W)} {f(H)}", f(W), f(H)))

    # 앱 코드(src/logo.tsx)에 넣을 경로
    import json
    json.dump({"big": {k: big[k] for k in ("top", "left", "right")},
               "small": {k: small[k] for k in ("top", "left", "right")},
               "tile": TILE_SMALL, "wordmark": {"d": wd, "w": round(W, 2), "h": round(H, 2)}},
              open(os.path.join(WORK, "paths.json"), "w"), ensure_ascii=False, indent=1)
    print(os.path.join(WORK, "paths.json"))

if __name__ == "__main__":
    main()
