using UnityEngine;
using UnityEngine.UI;

namespace Ayvago
{
    /// <summary>
    /// One always-visible HUD readout in its own chip (src/core/ui.ts hudChip): iOS-like frosted
    /// glass in the modern style, a plain dark box with a 3 px border in retro
    /// (<see cref="AyvagoUI.Retro"/>). The chip lays out an icon, a caption and the text in a row
    /// and fits its width to them; its anchored edge stays put as the text changes. No bare HUD
    /// text: every score, lives, timer or ammo readout gets one.
    /// </summary>
    [AddComponentMenu("")]
    public sealed class AyvagoHudChip : MonoBehaviour
    {
        public enum Align
        {
            Left,
            Center,
            Right,
        }

        /// <summary>The studio's top row: chips centred 50 px from the top, 16 px from the side.</summary>
        public const float RowY = 50f;
        public const float Margin = 16f;
        /// <summary>The right-most chip's right edge leaves room for the pause button (100 px from the right).</summary>
        public const float RightEdge = 100f;

        Image bg;
        Image icon;
        Graphic caption;
        Graphic text;
        RectTransform rt;
        bool retro;
        float minWidth;

        /// <summary>The chip's width without its shadow.</summary>
        public float Width { get; private set; }

        /// <summary>
        /// A chip on <paramref name="parent"/> (a full-screen RectTransform): <paramref name="align"/>
        /// picks the edge it hangs from (left, centre or right of the top row), <paramref name="x"/>
        /// is the distance from that edge and <paramref name="y"/> the chip's centre line below the top.
        /// </summary>
        public static AyvagoHudChip Create(RectTransform parent, Align align, float x, float y = RowY, string captionText = null, string value = "", Sprite iconSprite = null)
        {
            var root = AyvagoUI.NewRect("Ayvago HUD Chip", parent);
            float ax = align == Align.Left ? 0f : align == Align.Center ? 0.5f : 1f;
            root.anchorMin = root.anchorMax = new Vector2(ax, 1f);
            root.pivot = new Vector2(ax, 0.5f);
            root.anchoredPosition = new Vector2(align == Align.Right ? -x : x, -y);
            var chip = root.gameObject.AddComponent<AyvagoHudChip>();
            chip.Build(captionText, value, iconSprite);
            return chip;
        }

        void Build(string captionText, string value, Sprite iconSprite)
        {
            rt = (RectTransform)transform;
            retro = AyvagoUI.Retro;
            minWidth = AyvagoSprites.ChipHeight;
            if (retro)
            {
                bg = AyvagoUI.NewImage("Box", rt, AyvagoSprites.RetroBox(new Color32(0xff, 0xd2, 0x3f, 0xff)), Color.white);
                bg.type = Image.Type.Sliced;
            }
            else
            {
                bg = AyvagoUI.NewImage("Glass", rt, AyvagoSprites.Glass, Color.white);
                bg.type = Image.Type.Sliced;
                bg.pixelsPerUnitMultiplier = AyvagoSprites.GlassScale;
            }
            if (iconSprite != null) SetIcon(iconSprite);
            if (!string.IsNullOrEmpty(captionText)) SetCaption(captionText);
            text = AyvagoUI.Text(rt, value ?? "", retro ? 18f : 26f, Color.white, true);
            if (!retro && text is Text)
            {
                var s = text.gameObject.AddComponent<Shadow>();
                s.effectColor = new Color(0f, 0f, 0f, 0.5f);
                s.effectDistance = new Vector2(0f, -1f);
            }
            Layout();
        }

        /// <summary>Retro only: the border colour (default the HUD yellow #ffd23f).</summary>
        public void SetAccent(Color accent)
        {
            if (!retro) return;
            bg.sprite = AyvagoSprites.RetroBox(accent);
        }

        public void SetText(string value)
        {
            AyvagoUI.SetText(text, value ?? "");
            Layout();
        }

        /// <summary>A small caption before the text ("SCORE"): dimmed in the modern style, yellow in retro.</summary>
        public void SetCaption(string value)
        {
            if (caption == null)
            {
                caption = AyvagoUI.Text(rt, value, retro ? 12f : 15f, retro ? (Color)new Color32(0xff, 0xd2, 0x3f, 0xff) : new Color(1f, 1f, 1f, 0.78f));
            }
            else AyvagoUI.SetText(caption, value);
            Layout();
        }

        /// <summary>An icon before the text (a coin before the coin count), <paramref name="size"/> px high; null removes it.</summary>
        public void SetIcon(Sprite sprite, float size = 30f)
        {
            if (sprite == null)
            {
                if (icon != null) Destroy(icon.gameObject);
                icon = null;
                Layout();
                return;
            }
            if (icon == null) icon = AyvagoUI.NewImage("Icon", rt, sprite, Color.white);
            icon.sprite = sprite;
            icon.preserveAspect = true;
            var r = sprite.rect;
            icon.rectTransform.sizeDelta = new Vector2(size * r.width / Mathf.Max(1f, r.height), size);
            Layout();
        }

        /// <summary>The chip never gets narrower than this.</summary>
        public void SetMinWidth(float value)
        {
            minWidth = Mathf.Max(value, AyvagoSprites.ChipHeight);
            Layout();
        }

        void Layout()
        {
            if (rt == null || text == null) return;
            float gap = retro ? 10f : 8f, padX = retro ? 14f : 18f;
            float inner = 0f;
            int n = 0;
            if (icon != null) { inner += icon.rectTransform.sizeDelta.x; n++; }
            if (caption != null) { inner += AyvagoUI.Width(caption); n++; }
            inner += AyvagoUI.Width(text);
            n++;
            inner += gap * (n - 1);
            Width = Mathf.Max(minWidth, Mathf.Ceil(inner + padX * 2f));
            float h = AyvagoSprites.ChipHeight;
            rt.sizeDelta = new Vector2(Width, h);
            float pad = retro ? 0f : AyvagoSprites.GlassPad;
            bg.rectTransform.sizeDelta = new Vector2(Width + pad * 2f, h + pad * 2f);
            float x = -inner / 2f;
            if (icon != null) x = Place(icon.rectTransform, x, gap);
            if (caption != null) x = Place(caption.rectTransform, x, gap);
            Place(text.rectTransform, x, gap);
        }

        static float Place(RectTransform r, float x, float gap)
        {
            float w = r.sizeDelta.x;
            r.anchoredPosition = new Vector2(x + w / 2f, 0f);
            return x + w + gap;
        }
    }
}
