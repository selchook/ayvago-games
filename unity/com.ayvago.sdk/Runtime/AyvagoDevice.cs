using UnityEngine;
using UnityEngine.UI;

namespace Ayvago
{
    public enum Orientation
    {
        Landscape,
        Portrait,
    }

    /// <summary>game.json <c>orientation</c>: adaptive (the default for new games) or a fixed one.</summary>
    public enum OrientationSetting
    {
        Adaptive,
        Landscape,
        Portrait,
    }

    /// <summary>
    /// The device rule shared with the studio (src/core/registry.ts) and ayvago.com: a phone is a
    /// touch-first device (no hover, a coarse pointer) whose screen's short side is under 600 CSS px.
    /// Adaptive games run landscape 1280×720 on desktops and tablets and portrait 720×1280 on
    /// phones, decided once at boot; <c>?orient=portrait|landscape</c> forces one.
    /// </summary>
    public static class AyvagoDevice
    {
        public static readonly Vector2 Landscape = new Vector2(1280f, 720f);
        public static readonly Vector2 Portrait = new Vector2(720f, 1280f);

        static bool decided;
        static Orientation orientation;

        internal static void ResetStatics()
        {
            decided = false;
            orientation = Orientation.Landscape;
        }

        /// <summary>A phone (the page measured it with the platform's rule).</summary>
        public static bool IsPhone
        {
            get { return AyvagoSDK.Config.phone; }
        }

        /// <summary>A touch screen: show touch controls (tablets in landscape too), hide the key help.</summary>
        public static bool Touch
        {
            get { return AyvagoSDK.Config.touch; }
        }

        /// <summary>The orientation for a setting on this device (no decision is stored).</summary>
        public static Orientation Resolve(OrientationSetting setting)
        {
            if (setting == OrientationSetting.Landscape) return Orientation.Landscape;
            if (setting == OrientationSetting.Portrait) return Orientation.Portrait;
            var o = AyvagoSDK.Config.orient;
            if (o == "portrait") return Orientation.Portrait;
            if (o == "landscape") return Orientation.Landscape;
#if UNITY_EDITOR
            // the Game view's shape stands in for the device in the Editor
            if (AyvagoSDK.EditorConfig == null) return Screen.height > Screen.width ? Orientation.Portrait : Orientation.Landscape;
#endif
            return IsPhone ? Orientation.Portrait : Orientation.Landscape;
        }

        /// <summary>Decides the game's orientation once (call it at boot with the game.json setting). Later calls return the first answer.</summary>
        public static Orientation Decide(OrientationSetting setting)
        {
            if (!decided)
            {
                decided = true;
                orientation = Resolve(setting);
            }
            return orientation;
        }

        /// <summary>The game's orientation (adaptive unless <see cref="Decide"/> was called with another setting).</summary>
        public static Orientation Current
        {
            get { return Decide(OrientationSetting.Adaptive); }
        }

        public static bool IsLandscape
        {
            get { return Current == Orientation.Landscape; }
        }

        /// <summary>The design resolution: 1280×720 in landscape, 720×1280 in portrait.</summary>
        public static Vector2 ReferenceResolution
        {
            get { return IsLandscape ? Landscape : Portrait; }
        }

        /// <summary>Sets a Canvas Scaler to the design resolution of the current orientation (the whole frame always fits).</summary>
        public static void Configure(CanvasScaler scaler)
        {
            if (scaler == null) return;
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = ReferenceResolution;
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.Expand;
        }
    }
}
