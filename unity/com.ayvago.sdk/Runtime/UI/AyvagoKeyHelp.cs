using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Ayvago
{
    /// <summary>
    /// One key-help row, the same format as the studio's Phaser <c>keyHelp</c>: key groups and what
    /// they do. <c>new AyvagoKeyRow("kh_gas", "W", "Up")</c> draws [W] / [↑] Gas. Caps inside a group
    /// are separated by spaces ("A D" is [A][D]). Up, Down, Left and Right draw arrows; Space is
    /// drawn wide and localized; anything else is printed as written. The label is a string key
    /// (<see cref="AyvagoStrings"/>), shown as is when there is no such key.
    /// </summary>
    [Serializable]
    public class AyvagoKeyRow
    {
        public string label;
        public string[] keys;

        public AyvagoKeyRow(string label, params string[] keys)
        {
            this.label = label;
            this.keys = keys;
        }
    }

    /// <summary>
    /// The keyboard controls drawn as key caps (src/core/key-help.ts): rounded light caps with a
    /// darker bottom edge, arrows as triangles, SPACE / BOŞLUK wide, "/" between groups. Desktop
    /// only (touch screens show their touch buttons); <c>?keyhelp</c> forces it. Three places:
    /// <list type="number">
    /// <item><see cref="InMenu"/>: the menu's HOW TO PLAY box shows the keys instead of the how-to text.</item>
    /// <item><see cref="ShowFirstPlay"/>: the first round on this browser shows them along the bottom,
    /// without a band, outlined; they fade after 10 s of play and hide while paused.</item>
    /// <item><see cref="PauseStrip"/>: the pause overlay's dark rounded strip along the bottom.</item>
    /// </list>
    /// </summary>
    public static class AyvagoKeyHelp
    {
        static readonly List<AyvagoKeyRow> rows = new List<AyvagoKeyRow>();

        static readonly Dictionary<string, float> Arrows = new Dictionary<string, float>
        {
            { "Right", 0f }, { "Down", 90f }, { "Left", 180f }, { "Up", 270f },
        };

        static readonly Color Ink = new Color32(0x1d, 0x24, 0x36, 0xff);

        /// <summary>The game's rows (at most 6). Set them once at boot.</summary>
        public static void SetRows(params AyvagoKeyRow[] value)
        {
            rows.Clear();
            if (value != null) rows.AddRange(value);
        }

        public static IList<AyvagoKeyRow> Rows
        {
            get { return rows.AsReadOnly(); }
        }

        static bool Forced
        {
            get { return AyvagoSDK.Config.keyhelp; }
        }

        /// <summary>This device gets the key help: rows are set and it is not a touch screen (or <c>?keyhelp</c>).</summary>
        public static bool Shown
        {
            get { return rows.Count > 0 && (Forced || !AyvagoDevice.Touch); }
        }

        /// <summary>
        /// The first-play keys are due: a desktop that has not seen them. Automated browsers
        /// (navigator.webdriver: smoke tests, store art) skip them; <c>?keyhelp</c> shows them every time.
        /// </summary>
        public static bool Due
        {
            get
            {
                if (!Shown) return false;
                if (Forced) return true;
                if (AyvagoSDK.Config.webdriver) return false;
                return !AyvagoPrefs.GetBool("keyhelp", false);
            }
        }

        struct Piece
        {
            public RectTransform rt;
            public float w;
            public float h;
        }

        static Piece Cap(Transform parent, string k, float h)
        {
            var c = AyvagoUI.NewRect("Key " + k, parent);
            float deg;
            bool arrow = Arrows.TryGetValue(k, out deg);
            Graphic label = null;
            float w = h;
            if (!arrow)
            {
                string text = k == "Space" ? AyvagoStrings.T("kh_space") : k;
                label = AyvagoUI.Text(c, text, Mathf.Round(h * (k.Length > 1 ? 0.42f : 0.5f)), Ink);
                w = Mathf.Max(h, Mathf.Ceil(AyvagoUI.Width(label)) + h * 0.55f);
            }
            if (k == "Space") w = Mathf.Max(w, h * 2.8f);
            float r = Mathf.Round(h * 0.22f);
            // shadow, darker bottom edge, face, sheen (bottom to top)
            Layer(c, "Shadow", w, h, 0f, -5f, r, new Color(0f, 0f, 0f, 0.35f));
            Layer(c, "Edge", w, h, 0f, -3f, r, new Color32(0x8e, 0x9a, 0xb8, 0xff));
            Layer(c, "Face", w, h - 1f, 0f, 0.5f, r, new Color32(0xf3, 0xf6, 0xfd, 0xff));
            Layer(c, "Sheen", w - 8f, h * 0.3f, 0f, h / 2f - 3f - h * 0.15f, Mathf.Max(2f, r - 3f), new Color(1f, 1f, 1f, 0.9f));
            if (arrow)
            {
                // the studio's triangle: tip at +s, base at -0.7s, ±0.85s wide, 1 px above centre
                float s = h * 0.24f;
                var pivot = AyvagoUI.NewRect("Arrow", c);
                pivot.anchoredPosition = new Vector2(0f, 1f);
                pivot.localRotation = Quaternion.Euler(0f, 0f, -deg);
                var tri = AyvagoUI.NewImage("Triangle", pivot, AyvagoSprites.Triangle, Ink);
                tri.rectTransform.sizeDelta = new Vector2(s * 1.7f, s * 1.7f);
                tri.rectTransform.anchoredPosition = new Vector2(s * 0.15f, 0f);
            }
            if (label != null)
            {
                label.rectTransform.SetAsLastSibling();
                label.rectTransform.anchoredPosition = new Vector2(0f, 1f);
            }
            c.sizeDelta = new Vector2(w, h);
            return new Piece { rt = c, w = w, h = h };
        }

        static void Layer(Transform parent, string name, float w, float h, float x, float y, float radius, Color color)
        {
            var img = AyvagoUI.RoundedImage(name, parent, radius, color);
            img.rectTransform.sizeDelta = new Vector2(w, h);
            img.rectTransform.anchoredPosition = new Vector2(x, y);
        }

        /// <summary>Pieces laid left to right with a gap, centred on a new container.</summary>
        static Piece Row(Transform parent, List<Piece> parts, float gap)
        {
            var c = AyvagoUI.NewRect("Row", parent);
            float w = gap * Mathf.Max(0, parts.Count - 1), h = 0f;
            foreach (var p in parts)
            {
                w += p.w;
                h = Mathf.Max(h, p.h);
            }
            float x = -w / 2f;
            foreach (var p in parts)
            {
                p.rt.SetParent(c, false);
                p.rt.anchoredPosition = new Vector2(x + p.w / 2f, p.rt.anchoredPosition.y);
                x += p.w + gap;
            }
            c.sizeDelta = new Vector2(w, h);
            return new Piece { rt = c, w = w, h = h };
        }

        static Piece Label(Transform parent, string s, float size, Color color, bool outline)
        {
            var g = AyvagoUI.Text(parent, s, size, color);
            if (outline) AyvagoUI.Outline(g);
            return new Piece { rt = g.rectTransform, w = Mathf.Ceil(AyvagoUI.Width(g)), h = g.rectTransform.sizeDelta.y };
        }

        static Piece Keys(Transform parent, AyvagoKeyRow r, float h, bool outline)
        {
            var parts = new List<Piece>();
            for (int i = 0; i < r.keys.Length; i++)
            {
                if (i > 0) parts.Add(Label(parent, "/", Mathf.Round(h * 0.5f), AyvagoUI.Hex(outline ? "#c9d3ec" : "#8f9cc0"), outline));
                var caps = new List<Piece>();
                foreach (var k in r.keys[i].Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)) caps.Add(Cap(parent, k, h));
                parts.Add(Row(parent, caps, Mathf.Round(h * 0.15f)));
            }
            return Row(parent, parts, Mathf.Round(h * 0.22f));
        }

        static string LabelOf(AyvagoKeyRow r)
        {
            return AyvagoStrings.Has(r.label) ? AyvagoStrings.T(r.label) : r.label;
        }

        /// <summary>
        /// Every key with what it does, in lines no wider than <paramref name="maxW"/>, centred on
        /// the returned container (its sizeDelta is the drawn size, after any scaling down).
        /// </summary>
        public static RectTransform Block(Transform parent, float maxW, Color labelColor, bool outline = false, float cap = 34f)
        {
            float H = cap, k = H / 34f;
            float gapX = Mathf.Round(34f * k), gapY = Mathf.Round(14f * k), lineH = H + 6f;
            var c = AyvagoUI.NewRect("Ayvago Key Help", parent);
            var items = new List<Piece>();
            foreach (var r in rows)
            {
                var parts = new List<Piece> { Keys(c, r, H, outline), Label(c, LabelOf(r), Mathf.Round(21f * k), labelColor, outline) };
                items.Add(Row(c, parts, Mathf.Round(12f * k)));
            }
            var lines = new List<List<Piece>> { new List<Piece>() };
            float lw = 0f;
            foreach (var it in items)
            {
                var cur = lines[lines.Count - 1];
                if (cur.Count > 0 && lw + gapX + it.w > maxW)
                {
                    lines.Add(new List<Piece> { it });
                    lw = it.w;
                }
                else
                {
                    lw += (cur.Count > 0 ? gapX : 0f) + it.w;
                    cur.Add(it);
                }
            }
            var built = new List<Piece>();
            foreach (var l in lines) built.Add(Row(c, l, gapX));
            float w = 0f;
            foreach (var b in built) w = Mathf.Max(w, b.w);
            float h = lines.Count * lineH + (lines.Count - 1) * gapY;
            for (int i = 0; i < built.Count; i++)
                built[i].rt.anchoredPosition = new Vector2(0f, h / 2f - lineH / 2f + 2f - i * (lineH + gapY));
            float scale = w > maxW && w > 0f ? maxW / w : 1f;
            c.localScale = new Vector3(scale, scale, 1f);
            c.sizeDelta = new Vector2(w, h);
            return c;
        }

        /// <summary>
        /// Mode 1, the menu: the keys inside the HOW TO PLAY box (instead of its how-to text), labels in
        /// <paramref name="labelColor"/> (the box's body colour). Null when this device gets no key help:
        /// show the how-to text then.
        /// </summary>
        public static RectTransform InMenu(RectTransform box, Color labelColor, float cap = 34f, float padding = 16f)
        {
            if (!Shown || box == null) return null;
            Canvas.ForceUpdateCanvases();
            var size = box.rect.size;
            var b = Block(box, Mathf.Max(10f, size.x - padding * 2f), labelColor, false, cap);
            float s = b.localScale.x, hh = b.sizeDelta.y * s, room = size.y - padding * 2f;
            if (room > 0f && hh > room) s *= room / hh;
            b.localScale = new Vector3(s, s, 1f);
            return b;
        }

        /// <summary>
        /// Mode 2, the first play, if due (<see cref="Due"/>): the keys along the bottom of
        /// <paramref name="root"/> (the play screen's full-screen RectTransform), straight over the
        /// game without a band, outlined, for <paramref name="seconds"/> of play (time at
        /// timeScale 0 does not count, and they hide meanwhile); then they fade and count as seen.
        /// Nothing waits on them. Null when not due.
        /// </summary>
        public static AyvagoKeyHelpHint ShowFirstPlay(RectTransform root, float seconds = 10f, float bottom = -1f)
        {
            if (!Due || root == null) return null;
            Canvas.ForceUpdateCanvases();
            bool land = AyvagoDevice.IsLandscape;
            float width = root.rect.width;
            var holder = AyvagoUI.NewRect("Ayvago First Keys", root);
            holder.anchorMin = holder.anchorMax = new Vector2(0.5f, 0f);
            var b = Block(holder, land ? width - 200f : width - 48f, AyvagoUI.Hex("#e8edf8"), true);
            float h = b.sizeDelta.y * b.localScale.y;
            float y = (bottom >= 0f ? bottom : land ? 26f : 60f) + h / 2f;
            holder.anchoredPosition = new Vector2(0f, y);
            var hint = holder.gameObject.AddComponent<AyvagoKeyHelpHint>();
            hint.Init(seconds, y);
            return hint;
        }

        internal static void MarkSeen()
        {
            if (!Forced) AyvagoPrefs.SetBool("keyhelp", true);
        }

        /// <summary>
        /// Mode 3, the pause overlay: every key in one dark rounded band along the bottom of
        /// <paramref name="root"/>, its bottom edge <paramref name="bottom"/> px up (two or more
        /// lines when it does not fit). Null when this device gets no key help. It fades in on
        /// unscaled time, so it works at timeScale 0.
        /// </summary>
        public static RectTransform PauseStrip(RectTransform root, float bottom = 24f, float maxW = -1f)
        {
            if (!Shown || root == null) return null;
            Canvas.ForceUpdateCanvases();
            const float padX = 26f, padY = 14f;
            float limit = maxW > 0f ? maxW : root.rect.width - 48f;
            var band = AyvagoUI.NewRect("Ayvago Key Strip", root);
            band.anchorMin = band.anchorMax = new Vector2(0.5f, 0f);
            var shadow = AyvagoUI.RoundedImage("Shadow", band, 22f, new Color(0f, 0f, 0f, 0.25f));
            var body = AyvagoUI.RoundedImage("Body", band, 22f, new Color(13 / 255f, 18 / 255f, 36 / 255f, 0.82f));
            var rim = AyvagoUI.NewImage("Rim", band, AyvagoSprites.RoundedRing(22f, 2f), new Color(1f, 1f, 1f, 0.14f));
            rim.type = Image.Type.Sliced;
            rim.pixelsPerUnitMultiplier = AyvagoSprites.RoundedRadius / 22f;
            var k = Block(band, limit - padX * 2f, AyvagoUI.Hex("#e8edf8"));
            var size = new Vector2(k.sizeDelta.x * k.localScale.x + padX * 2f, k.sizeDelta.y * k.localScale.y + padY * 2f);
            band.sizeDelta = size;
            shadow.rectTransform.sizeDelta = size;
            shadow.rectTransform.anchoredPosition = new Vector2(0f, -6f);
            body.rectTransform.sizeDelta = size;
            rim.rectTransform.sizeDelta = size;
            band.anchoredPosition = new Vector2(0f, bottom + size.y / 2f);
            var fade = band.gameObject.AddComponent<AyvagoFade>();
            fade.Play(0f, 1f, 0.2f, 0.06f);
            return band;
        }
    }

    /// <summary>The first-play keys (<see cref="AyvagoKeyHelp.ShowFirstPlay"/>).</summary>
    [AddComponentMenu("")]
    public sealed class AyvagoKeyHelpHint : MonoBehaviour
    {
        CanvasGroup group;
        RectTransform rt;
        float seconds, played, y, appear, fadeOut = -1f;
        bool closed;

        internal void Init(float duration, float baseY)
        {
            seconds = duration;
            y = baseY;
            rt = (RectTransform)transform;
            group = gameObject.AddComponent<CanvasGroup>();
            group.alpha = 0f;
            group.blocksRaycasts = false;
            group.interactable = false;
        }

        /// <summary>Fades the keys out now (the round ended early, say).</summary>
        public void Close()
        {
            if (closed) return;
            closed = true;
            AyvagoKeyHelp.MarkSeen();
            fadeOut = 0f;
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (closed)
            {
                fadeOut += dt;
                float p = Mathf.Clamp01(fadeOut / 0.6f);
                group.alpha = 1f - p * p;
                rt.anchoredPosition = new Vector2(0f, y - 12f * p * p);
                if (p >= 1f) Destroy(gameObject);
                return;
            }
            // hidden while the game is paused (the pause has its own strip); paused time does not count
            bool paused = Time.timeScale <= 0f;
            appear = Mathf.Min(1f, appear + dt / 0.38f);
            float e = 1f - Mathf.Pow(1f - appear, 3f);
            group.alpha = paused ? 0f : e;
            rt.anchoredPosition = new Vector2(0f, y - 16f * (1f - e));
            played += Time.deltaTime;
            if (played >= seconds) Close();
        }
    }

    /// <summary>A CanvasGroup fade on unscaled time (works while the game is paused).</summary>
    [AddComponentMenu("")]
    public sealed class AyvagoFade : MonoBehaviour
    {
        CanvasGroup group;
        float from, to, duration, delay, t;
        bool destroyAtEnd, running;

        public void Play(float fromAlpha, float toAlpha, float seconds, float delaySeconds = 0f, bool destroy = false)
        {
            group = GetComponent<CanvasGroup>();
            if (group == null) group = gameObject.AddComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            from = fromAlpha;
            to = toAlpha;
            duration = Mathf.Max(0.0001f, seconds);
            delay = delaySeconds;
            destroyAtEnd = destroy;
            t = 0f;
            running = true;
            group.alpha = from;
        }

        void Update()
        {
            if (!running) return;
            t += Time.unscaledDeltaTime;
            float p = Mathf.Clamp01((t - delay) / duration);
            group.alpha = Mathf.Lerp(from, to, p);
            if (p < 1f) return;
            running = false;
            if (destroyAtEnd) Destroy(gameObject);
        }
    }
}
