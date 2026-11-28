using System;
using UnityEngine;

namespace Ayvago
{
    /// <summary>
    /// The one sound switch (protocol 2.5). The game's sound buttons, the platform's sound button
    /// (GHA_MUTE) and GHA_MUTE_STATE are the same switch: a change made in the game is reported to
    /// the platform (once after the handshake and on every change); a change made by the platform
    /// is applied and never echoed back. Kept in PlayerPrefs. It drives
    /// <c>AudioListener.volume</c>; ads hold the game with <c>AudioListener.pause</c> without touching it.
    /// </summary>
    public static class AyvagoAudio
    {
        static bool loaded;
        static bool muted;
        static float volume = 1f;

        /// <summary>The switch changed (game button or platform): keep the sound buttons' icons in step.</summary>
        public static event Action<bool> Changed;

        internal static void ResetStatics()
        {
            loaded = false;
            muted = false;
            volume = 1f;
            Changed = null;
        }

        static void Load()
        {
            if (loaded) return;
            loaded = true;
            muted = AyvagoPrefs.GetBool("muted", false);
        }

        /// <summary>The player's switch is off.</summary>
        public static bool Muted
        {
            get { Load(); return muted; }
        }

        /// <summary>Nothing can be heard: the switch is off or an ad is running.</summary>
        public static bool Silenced
        {
            get { return Muted || AyvagoSDK.AdShowing || AudioListener.pause; }
        }

        /// <summary>The master volume while the switch is on (0..1, default 1).</summary>
        public static float Volume
        {
            get { return volume; }
            set { volume = Mathf.Clamp01(value); Apply(); }
        }

        /// <summary>The game's own sound button: sets the switch and reports it to the platform.</summary>
        public static void SetMuted(bool value)
        {
            Set(value, false);
        }

        public static void Toggle()
        {
            SetMuted(!Muted);
        }

        internal static void SetFromPlatform(bool value)
        {
            Set(value, true);
        }

        static void Set(bool value, bool fromPlatform)
        {
            Load();
            bool changed = muted != value;
            muted = value;
            AyvagoPrefs.SetBool("muted", value);
            Apply();
            if (changed && Changed != null)
            {
                try { Changed(value); }
                catch (Exception e) { Debug.LogException(e); }
            }
            // a platform change is not echoed; before the handshake the first report carries it
            if (!fromPlatform && AyvagoSDK.Ready) AyvagoSDK.ReportMute(value);
            AyvagoTestHooks.Refresh();
        }

        internal static void Apply()
        {
            Load();
            AudioListener.volume = muted ? 0f : volume;
        }

        internal static void OnHandshake()
        {
            Load();
            AyvagoSDK.ReportMute(muted);
        }
    }
}
