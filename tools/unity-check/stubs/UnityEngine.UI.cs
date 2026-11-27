// Compile-only stubs of the uGUI (com.unity.ugui) API the Ayvago package uses. Real signatures,
// empty bodies; never shipped (see UnityEngine.cs).
using UnityEngine;

namespace UnityEngine.EventSystems
{
    public abstract class UIBehaviour : MonoBehaviour
    {
    }

    public abstract class BaseRaycaster : UIBehaviour
    {
    }
}

namespace UnityEngine.UI
{
    using UnityEngine.EventSystems;

    public interface ICanvasElement
    {
    }

    public interface ILayoutElement
    {
    }

    public abstract class Graphic : UIBehaviour, ICanvasElement
    {
        public virtual Color color { get { throw null; } set { } }
        public virtual bool raycastTarget { get { throw null; } set { } }
        public RectTransform rectTransform { get { throw null; } }
    }

    public abstract class MaskableGraphic : Graphic
    {
    }

    public class Image : MaskableGraphic, ILayoutElement
    {
        public enum Type
        {
            Simple = 0,
            Sliced = 1,
            Tiled = 2,
            Filled = 3,
        }

        public enum FillMethod
        {
            Horizontal = 0,
            Vertical = 1,
            Radial90 = 2,
            Radial180 = 3,
            Radial360 = 4,
        }

        public enum Origin360
        {
            Bottom = 0,
            Right = 1,
            Top = 2,
            Left = 3,
        }

        public Sprite sprite { get { throw null; } set { } }
        public Type type { get { throw null; } set { } }
        public bool preserveAspect { get { throw null; } set { } }
        public FillMethod fillMethod { get { throw null; } set { } }
        public float fillAmount { get { throw null; } set { } }
        public bool fillClockwise { get { throw null; } set { } }
        public int fillOrigin { get { throw null; } set { } }
        public float pixelsPerUnitMultiplier { get { throw null; } set { } }
    }

    public class Text : MaskableGraphic, ILayoutElement
    {
        public Font font { get { throw null; } set { } }
        public virtual string text { get { throw null; } set { } }
        public int fontSize { get { throw null; } set { } }
        public FontStyle fontStyle { get { throw null; } set { } }
        public TextAnchor alignment { get { throw null; } set { } }
        public HorizontalWrapMode horizontalOverflow { get { throw null; } set { } }
        public VerticalWrapMode verticalOverflow { get { throw null; } set { } }
    }

    public abstract class BaseMeshEffect : UIBehaviour
    {
    }

    public class Shadow : BaseMeshEffect
    {
        public Color effectColor { get { throw null; } set { } }
        public Vector2 effectDistance { get { throw null; } set { } }
    }

    public class Outline : Shadow
    {
    }

    public class RectMask2D : UIBehaviour
    {
    }

    public class GraphicRaycaster : BaseRaycaster
    {
    }

    public class CanvasScaler : UIBehaviour
    {
        public enum ScaleMode
        {
            ConstantPixelSize = 0,
            ScaleWithScreenSize = 1,
            ConstantPhysicalSize = 2,
        }

        public enum ScreenMatchMode
        {
            MatchWidthOrHeight = 0,
            Expand = 1,
            Shrink = 2,
        }

        public ScaleMode uiScaleMode { get { throw null; } set { } }
        public Vector2 referenceResolution { get { throw null; } set { } }
        public ScreenMatchMode screenMatchMode { get { throw null; } set { } }
        public float matchWidthOrHeight { get { throw null; } set { } }
    }

    public static class LayoutUtility
    {
        public static float GetPreferredWidth(RectTransform rect) { throw null; }
        public static float GetPreferredHeight(RectTransform rect) { throw null; }
    }
}
