"""Construction helpers for the Latti marks (256 grid). Pure geometry, no I/O."""
import math

def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def pt(p):
    return f"{f(p[0])} {f(p[1])}"

def rot(p, deg, c=(0, 0)):
    a = math.radians(deg)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))

def polar(c, r, deg):
    a = math.radians(deg)
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))

def circle(c, r):
    """Circle as two arcs (clockwise)."""
    a = (c[0] - r, c[1]); b = (c[0] + r, c[1])
    return f"M{pt(a)}A{f(r)} {f(r)} 0 1 1 {pt(b)}A{f(r)} {f(r)} 0 1 1 {pt(a)}Z"

def ellipse(c, a, b, tilt, ccw=False):
    """Ellipse with semi-axes a (local u), b (local v), rotated by tilt degrees. ccw=True winds it the other way
    (used for holes under the nonzero rule)."""
    p1 = (c[0] + a * math.cos(math.radians(tilt)), c[1] + a * math.sin(math.radians(tilt)))
    p2 = (2 * c[0] - p1[0], 2 * c[1] - p1[1])
    s = 0 if ccw else 1
    return f"M{pt(p1)}A{f(a)} {f(b)} {f(tilt)} 1 {s} {pt(p2)}A{f(a)} {f(b)} {f(tilt)} 1 {s} {pt(p1)}Z"

def epoint(c, a, b, tilt, theta):
    """Point on a tilted ellipse at parameter theta (deg); theta=90 is the near (front) side."""
    u = a * math.cos(math.radians(theta)); v = b * math.sin(math.radians(theta))
    return rot((c[0] + u, c[1] + v), tilt, c)

def front_band(c, ao, bo, ai, bi, tilt, ci):
    """Closed region: front half (v>=0) of the band between outer ellipse (centre c) and inner (centre ci)."""
    Lo = epoint(c, ao, bo, tilt, 180); Ro = epoint(c, ao, bo, tilt, 0)
    Li = epoint(ci, ai, bi, tilt, 180); Ri = epoint(ci, ai, bi, tilt, 0)
    return (f"M{pt(Lo)}A{f(ao)} {f(bo)} {f(tilt)} 0 0 {pt(Ro)}L{pt(Ri)}"
            f"A{f(ai)} {f(bi)} {f(tilt)} 0 1 {pt(Li)}Z")

def half_disc(c, r, tilt, back=True):
    """Half disc on the back (v<0) side of an axis tilted by tilt degrees."""
    R = rot((c[0] + r, c[1]), tilt, c); L = rot((c[0] - r, c[1]), tilt, c)
    sweep = 0 if back else 1
    return f"M{pt(R)}A{f(r)} {f(r)} 0 0 {sweep} {pt(L)}Z"

def line_x(p1, d1, p2, d2):
    """Intersection of lines p1+t*d1 and p2+s*d2."""
    den = d1[0] * d2[1] - d1[1] * d2[0]
    t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
    return (p1[0] + t * d1[0], p1[1] + t * d1[1])

def inset(poly, offs):
    """Offset a convex polygon inward; offs[i] applies to edge poly[i]->poly[i+1]. Polygon must be clockwise on screen."""
    n = len(poly)
    lines = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        d = (b[0] - a[0], b[1] - a[1]); L = math.hypot(*d)
        nx, ny = -d[1] / L, d[0] / L  # inward normal for clockwise (y-down) winding
        lines.append(((a[0] + nx * offs[i], a[1] + ny * offs[i]), d))
    return [line_x(lines[i - 1][0], lines[i - 1][1], lines[i][0], lines[i][1]) for i in range(n)]

def poly_path(poly):
    return "M" + "L".join(pt(p) for p in poly) + "Z"

def smooth_rect(x, y, w, h, r, k=1.28, c=0.2):
    """Rounded rectangle with continuous-curvature corners (no bone effect).
    Each corner is one cubic that starts k*r before the corner; handles pulled to c of that length from the corner."""
    a = min(k * r, w / 2, h / 2)
    h1 = a * c
    P = []
    P.append(f"M{pt((x + a, y))}H{f(x + w - a)}")
    P.append(f"C{pt((x + w - h1, y))} {pt((x + w, y + h1))} {pt((x + w, y + a))}")
    P.append(f"V{f(y + h - a)}")
    P.append(f"C{pt((x + w, y + h - h1))} {pt((x + w - h1, y + h))} {pt((x + w - a, y + h))}")
    P.append(f"H{f(x + a)}")
    P.append(f"C{pt((x + h1, y + h))} {pt((x, y + h - h1))} {pt((x, y + h - a))}")
    P.append(f"V{f(y + a)}")
    P.append(f"C{pt((x, y + h1))} {pt((x + h1, y))} {pt((x + a, y))}Z")
    return "".join(P)

def spiral_edge(c, r0, r1, a0, a1, step=45):
    """Polar curve r(a) linear from r0 at a0 to r1 at a1 (deg), as cubic Hermite segments. Returns (start, 'C..C..')."""
    n = max(1, int(math.ceil(abs(a1 - a0) / step)))
    def P(a):
        t = (a - a0) / (a1 - a0); r = r0 + (r1 - r0) * t
        return (c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a)))
    def D(a):  # derivative per radian
        dr = (r1 - r0) / math.radians(a1 - a0)
        t = (a - a0) / (a1 - a0); r = r0 + (r1 - r0) * t
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        return (dr * ca - r * sa, dr * sa + r * ca)
    out = []
    for i in range(n):
        s = a0 + (a1 - a0) * i / n; e = a0 + (a1 - a0) * (i + 1) / n
        h = math.radians(e - s) / 3
        ps, pe, ds, de = P(s), P(e), D(s), D(e)
        c1 = (ps[0] + ds[0] * h, ps[1] + ds[1] * h); c2 = (pe[0] - de[0] * h, pe[1] - de[1] * h)
        out.append(f"C{pt(c1)} {pt(c2)} {pt(pe)}")
    return P(a0), "".join(out)
