using System.Collections.Generic;
using UnityEngine;

namespace Ayvago
{
    /// <summary>
    /// Procedural sprites for the package UI (nothing depends on editor-made assets): anti-aliased
    /// rounded rectangles as 9-slice sprites, a triangle for arrow keys, the modern HUD chip's
    /// frosted glass and the retro chip's bordered box. Made once and cached.
    /// </summary>
    public static class AyvagoSprites
    {
        /// <summary>The corner radius baked into <see cref="Rounded"/>, in texture pixels.</summary>
        public const float RoundedRadius = 32f;

        /// <summary>The modern chip's texture scale (texture pixels per design pixel).</summary>
        public const float GlassScale = 2f;
        /// <summary>Room round the modern chip for its shadow, in design pixels (the studio's GLASS_PAD).</summary>
        public const float GlassPad = 12f;
        /// <summary>The chip height the glass is baked for (the studio's HUD_CHIP_H).</summary>
        public const float ChipHeight = 44f;

        static Sprite rounded, triangle, glass;
        static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        /// <summary>A white rounded rectangle, 9-sliced; set Image.pixelsPerUnitMultiplier = 32 / radius.</summary>
        public static Sprite Rounded
        {
            get
            {
                if (rounded == null) rounded = Box("rounded", 68, 68, 32f, 0f, Color.white, Color.clear, 34);
                return rounded;
            }
        }

        /// <summary>A white rounded outline of <paramref name="stroke"/> design px at <paramref name="radius"/> design px (multiplier 32 / radius).</summary>
        public static Sprite RoundedRing(float radius, float stroke)
        {
            float px = Mathf.Max(1f, stroke * RoundedRadius / Mathf.Max(0.5f, radius));
            string key = "ring" + px.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
            Sprite s;
            if (cache.TryGetValue(key, out s) && s != null) return s;
            s = Box(key, 68, 68, 32f, px, Color.clear, Color.white, 34);
            cache[key] = s;
            return s;
        }

        /// <summary>A white triangle pointing right (+x), filling its square.</summary>
        public static Sprite Triangle
        {
            get
            {
                if (triangle != null) return triangle;
                const int n = 64;
                var px = new Color32[n * n];
                // corners: (n, n/2), (0, 0), (0, n); coverage from the distance to each edge
                var a = new Vector2(n, n * 0.5f);
                var b = new Vector2(0f, 0f);
                var c = new Vector2(0f, n);
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        var p = new Vector2(x + 0.5f, y + 0.5f);
                        float d = Mathf.Min(Edge(p, a, b), Mathf.Min(Edge(p, b, c), Edge(p, c, a)));
                        px[y * n + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(d + 0.5f) * 255f));
                    }
                triangle = Make("triangle", n, n, px, Vector4.zero);
                return triangle;
            }
        }

        // signed distance of p from edge a→b of a clockwise triangle: positive inside (its right-hand side)
        static float Edge(Vector2 p, Vector2 a, Vector2 b)
        {
            var e = b - a;
            var n = new Vector2(e.y, -e.x).normalized;
            return Vector2.Dot(p - a, n);
        }

        /// <summary>
        /// The modern HUD chip: frosted glass baked at <see cref="GlassScale"/>× for a
        /// <see cref="ChipHeight"/> px pill, with its soft shadow in <see cref="GlassPad"/> px round it.
        /// Size the Image to (width + 2·pad, height + 2·pad) and set pixelsPerUnitMultiplier = GlassScale.
        /// </summary>
        public static Sprite Glass
        {
            get
            {
                if (glass != null) return glass;
                float k = GlassScale, pad = GlassPad * k, h = ChipHeight * k, r = h / 2f;
                int tw = Mathf.RoundToInt(2f * (r + pad) + 4f), th = Mathf.RoundToInt(h + 2f * pad);
                var px = new Color32[tw * th];
                float x0 = pad, x1 = tw - pad, y0 = pad, y1 = th - pad;
                for (int y = 0; y < th; y++)
                    for (int x = 0; x < tw; x++)
                    {
                        var p = new Vector2(x + 0.5f, y + 0.5f);
                        float sd = Sdf(p, x0, y0, x1, y1, r);
                        float cover = Mathf.Clamp01(0.5f - sd);
                        // drop shadow (blur 10, 3 px down), only outside the glass
                        float sh = Sdf(p + new Vector2(0f, 3f * k), x0, y0, x1, y1, r);
                        float shadowA = 0.42f * (1f - Smooth(Mathf.Clamp01((sh + 2f * k) / (10f * k)))) * (1f - cover);
                        var col = new Color(0f, 0f, 0f, shadowA);
                        if (cover > 0f)
                        {
                            // 0 at the top edge, 1 at the bottom (texture rows run bottom-up)
                            float v = Mathf.Clamp01((y1 - p.y) / h);
                            var body = Color.Lerp(new Color(30 / 255f, 36 / 255f, 60 / 255f, 0.42f), new Color(10 / 255f, 13 / 255f, 28 / 255f, 0.52f), v);
                            body = Over(new Color(1f, 1f, 1f, 0.07f), body);
                            if (v < 0.6f) body = Over(new Color(1f, 1f, 1f, 0.26f * (1f - v / 0.6f)), body);
                            float rimA = v < 0.45f ? Mathf.Lerp(0.75f, 0.22f, v / 0.45f) : Mathf.Lerp(0.22f, 0.14f, (v - 0.45f) / 0.55f);
                            float rim = Mathf.Clamp01(Mathf.Min(0.5f - sd, 0.5f + sd + 1.5f * k));
                            body = Over(new Color(1f, 1f, 1f, rimA * rim), body);
                            body.a *= cover;
                            col = Over(body, col);
                        }
                        px[y * tw + x] = col;
                    }
                float border = r + pad;
                glass = Make("glass", tw, th, px, new Vector4(border, border - 2f, border, border - 2f));
                return glass;
            }
        }

        /// <summary>The retro chip: a dark box with a 3 px border in <paramref name="accent"/> (9-sliced, 1 texture px per design px).</summary>
        public static Sprite RetroBox(Color accent)
        {
            string key = "retro" + ColorUtility.ToHtmlStringRGBA(accent);
            Sprite s;
            if (cache.TryGetValue(key, out s) && s != null) return s;
            const int n = 16;
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    bool edge = x < 3 || y < 3 || x >= n - 3 || y >= n - 3;
                    px[y * n + x] = edge ? (Color32)accent : new Color32(0, 0, 0, 158);
                }
            s = Make(key, n, n, px, new Vector4(4f, 4f, 4f, 4f));
            cache[key] = s;
            return s;
        }

        // a rounded box: fill inside, a stroke of `stroke` px along the inside of the edge
        static Sprite Box(string name, int w, int h, float radius, float stroke, Color fill, Color line, float border)
        {
            var px = new Color32[w * h];
            float m = 1f;   // one transparent texel round the shape keeps bilinear edges clean
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float sd = Sdf(new Vector2(x + 0.5f, y + 0.5f), m, m, w - m, h - m, radius);
                    float cover = Mathf.Clamp01(0.5f - sd);
                    var c = fill;
                    c.a *= cover;
                    if (stroke > 0f)
                    {
                        float s = Mathf.Clamp01(Mathf.Min(0.5f - sd, 0.5f + sd + stroke));
                        var l = line;
                        l.a *= s;
                        c = Over(l, c);
                    }
                    px[y * w + x] = c;
                }
            return Make(name, w, h, px, new Vector4(border, border, border, border));
        }

        // signed distance to a rounded rectangle (negative inside)
        static float Sdf(Vector2 p, float x0, float y0, float x1, float y1, float r)
        {
            var c = new Vector2((x0 + x1) * 0.5f, (y0 + y1) * 0.5f);
            var half = new Vector2((x1 - x0) * 0.5f - r, (y1 - y0) * 0.5f - r);
            var q = new Vector2(Mathf.Abs(p.x - c.x) - half.x, Mathf.Abs(p.y - c.y) - half.y);
            var outside = new Vector2(Mathf.Max(q.x, 0f), Mathf.Max(q.y, 0f));
            return outside.magnitude + Mathf.Min(Mathf.Max(q.x, q.y), 0f) - r;
        }

        static float Smooth(float t)
        {
            return t * t * (3f - 2f * t);
        }

        // straight-alpha "source over destination"
        static Color Over(Color src, Color dst)
        {
            float a = src.a + dst.a * (1f - src.a);
            if (a <= 0f) return new Color(0f, 0f, 0f, 0f);
            float k = dst.a * (1f - src.a);
            return new Color((src.r * src.a + dst.r * k) / a, (src.g * src.a + dst.g * k) / a, (src.b * src.a + dst.b * k) / a, a);
        }

        static Sprite Make(string name, int w, int h, Color32[] px, Vector4 border)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.name = "Ayvago " + name;
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.hideFlags = HideFlags.DontSave;
            tex.SetPixels32(px);
            tex.Apply(false, true);
            var s = Sprite.Create(tex, new Rect(0f, 0f, w, h), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, border);
            s.name = tex.name;
            s.hideFlags = HideFlags.DontSave;
            return s;
        }
    }
}
