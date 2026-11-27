using UnityEngine;
using UnityEngine.UI;

namespace Ayvago
{
    /// <summary>
    /// Shared UI settings and helpers for the package's runtime-built UI (key help, HUD chips).
    /// Text is UGUI <see cref="Text"/> by default with <see cref="BodyFont"/> / <see cref="TitleFont"/>;
    /// a TextMeshPro game sets <see cref="CreateText"/> and <see cref="SetTextValue"/> (README:
    /// "Using TextMeshPro") so the package never depends on TMP.
    /// </summary>
    public static class AyvagoUI
    {
        /// <summary>
        /// The retro style (retro-genre games: Press Start 2P + Pixelify Sans, plain boxes). False is
        /// the modern style (Fredoka + Nunito, frosted glass), every other game.
        /// </summary>
        public static bool Retro;

        /// <summary>The body font (modern: Nunito ExtraBold; retro: Pixelify Sans). Null: Unity's built-in font.</summary>
        public static Font BodyFont;

        /// <summary>The title font (modern: Fredoka Bold; retro: Press Start 2P behind Ayvago Pixel TR).</summary>
        public static Font TitleFont;

        /// <summary>Builds a text object under <paramref name="parent"/>; null uses UGUI Text.</summary>
        public delegate Graphic TextFactory(RectTransform parent, string text, float size, Color color, bool title);

        /// <summary>Replace to build every package text with TextMeshPro (return the TMP_Text).</summary>
        public static TextFactory CreateText;

        /// <summary>Sets a text built by <see cref="CreateText"/> (needed with a custom factory).</summary>
        public static System.Action<Graphic, string> SetTextValue;

        /// <summary>Gives a text a dark outline to read straight over the game (needed with a custom factory).</summary>
        public static System.Action<Graphic> AddOutline;

        static Font builtin;

        static Font Builtin
        {
            get
            {
                if (builtin == null) builtin = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return builtin;
            }
        }

        public static RectTransform NewRect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            return rt;
        }

        public static Image NewImage(string name, Transform parent, Sprite sprite, Color color)
        {
            var rt = NewRect(name, parent);
            rt.gameObject.AddComponent<CanvasRenderer>();
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        /// <summary>A sliced rounded rectangle of <paramref name="radius"/> design px.</summary>
        public static Image RoundedImage(string name, Transform parent, float radius, Color color)
        {
            var img = NewImage(name, parent, AyvagoSprites.Rounded, color);
            img.type = Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = AyvagoSprites.RoundedRadius / Mathf.Max(0.5f, radius);
            return img;
        }

        /// <summary>A text, sized to its content (read its width with <see cref="Width"/>).</summary>
        public static Graphic Text(Transform parent, string value, float size, Color color, bool title = false)
        {
            var rt = NewRect("Text", parent);
            if (CreateText != null)
            {
                var g = CreateText(rt, value, size, color, title);
                if (g != null)
                {
                    g.raycastTarget = false;
                    Fit(g);
                    return g;
                }
            }
            rt.gameObject.AddComponent<CanvasRenderer>();
            var t = rt.gameObject.AddComponent<Text>();
            t.font = (title ? TitleFont : BodyFont) ?? BodyFont ?? Builtin;
            t.fontSize = Mathf.RoundToInt(size);
            t.fontStyle = FontStyle.Bold;
            t.color = color;
            t.alignment = TextAnchor.MiddleCenter;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            t.text = value;
            Fit(t);
            return t;
        }

        /// <summary>Changes a text made by <see cref="Text"/> and refits its box.</summary>
        public static void SetText(Graphic g, string value)
        {
            var t = g as Text;
            if (t != null) t.text = value;
            else if (SetTextValue != null) SetTextValue(g, value);
            Fit(g);
        }

        /// <summary>Dark outline and a soft shadow, for labels straight over the game.</summary>
        public static void Outline(Graphic g)
        {
            if (g is Text)
            {
                var o = g.gameObject.AddComponent<UnityEngine.UI.Outline>();
                o.effectColor = new Color32(0x0a, 0x0e, 0x1c, 0xff);
                o.effectDistance = new Vector2(2.5f, -2.5f);
                var s = g.gameObject.AddComponent<Shadow>();
                s.effectColor = new Color(0f, 0f, 0f, 0.6f);
                s.effectDistance = new Vector2(0f, -3f);
            }
            else if (AddOutline != null) AddOutline(g);
        }

        static void Fit(Graphic g)
        {
            var rt = g.rectTransform;
            rt.sizeDelta = new Vector2(Mathf.Ceil(LayoutUtility.GetPreferredWidth(rt)), Mathf.Ceil(LayoutUtility.GetPreferredHeight(rt)));
        }

        /// <summary>The drawn width of a text (its preferred width).</summary>
        public static float Width(Graphic g)
        {
            return g.rectTransform.sizeDelta.x;
        }

        /// <summary>#rrggbb or #rrggbbaa.</summary>
        public static Color Hex(string hex)
        {
            Color c;
            return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.magenta;
        }
    }
}
