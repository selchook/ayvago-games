using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Ayvago
{
    /// <summary>Why the game is asked to pause.</summary>
    public enum PauseReason
    {
        /// <summary>The platform sent GHA_PAUSE (its own overlay opened).</summary>
        Platform,
        /// <summary>The tab or the page was hidden.</summary>
        Hidden,
    }

    /// <summary>
    /// The bridge to the Ayvago platform (GHA protocol 2.8, through the official adapter in the
    /// WebGL template). It creates itself before the first scene loads, on a GameObject named
    /// "AyvagoSDK" (the page sends its events there with SendMessage), and survives scene loads.
    ///
    /// Gameplay code rarely calls the platform directly: <see cref="AyvagoRun"/> sends the round's
    /// GHA_SESSION_START / GHA_END by the leaderboard rules, <see cref="AyvagoAudio"/> is the sound
    /// switch and <see cref="AyvagoStrings"/> the language.
    ///
    /// In the Editor and in non-WebGL players every platform call is logged and nothing else
    /// happens (standalone: no ads, the system language); <see cref="EditorConfig"/> simulates a
    /// platform config there.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("")]
    public sealed class AyvagoSDK : MonoBehaviour
    {
        public const string ObjectName = "AyvagoSDK";
        public const string Version = "0.1.0";

#pragma warning disable 0649 // filled by JsonUtility
        [Serializable]
        class Msg
        {
            public bool muted;
            public bool rewarded;
            public int id;
            public string locale;
            public string theme;
            public string colorMode;
            public string reason;
            public string name;
            public string arg;
        }
#pragma warning restore 0649

        static AyvagoSDK instance;
        static AyvagoConfig config;
        static bool ready;
        static readonly Dictionary<int, Action<bool>> pendingAds = new Dictionary<int, Action<bool>>();
        static int nextAd = 1;
        static float heldTimeScale = 1f;
        static bool heldAudioPause;
        static readonly List<Action> whenReady = new List<Action>();

        /// <summary>The page's config (boot values, then the handshake's).</summary>
        public static AyvagoConfig Config
        {
            get { Boot(); return config; }
        }

        /// <summary>The handshake finished (embedded or standalone is known, the locale and best are final).</summary>
        public static bool Ready
        {
            get { Boot(); return ready; }
        }

        /// <summary>Inside the ayvago.com iframe.</summary>
        public static bool Embedded
        {
            get { return Config.embedded; }
        }

        /// <summary>A rewarded or interstitial ad is running: the game is held (timeScale 0, audio paused).</summary>
        public static bool AdShowing { get; private set; }

        /// <summary>Ads may be offered: the platform allows them and none is running.</summary>
        public static bool AdsAvailable
        {
            get { return Config.adsEnabled && Embedded && !AdShowing; }
        }

        /// <summary>Under the platform's retro and arcade themes the page draws CRT scanlines: hide the game's own.</summary>
        public static bool HostScanlines
        {
            get { var t = Config.theme; return t == "retro" || t == "arcade"; }
        }

        /// <summary>The player's character id (adventurer, explorer, rookie, soldier, zombie) or "" for the game's default.</summary>
        public static string Character
        {
            get { return Config.character ?? ""; }
        }

        /// <summary>The key PlayerPrefs are scoped by: the platform id, else the product name.</summary>
        public static string GameKey
        {
            get
            {
                var id = Config.gameId;
                if (!string.IsNullOrEmpty(id)) return id;
                return Regex.Replace(Application.productName.ToLowerInvariant(), "[^a-z0-9]", "");
            }
        }

        /// <summary>Why the last <see cref="Paused"/> fired.</summary>
        public static PauseReason LastPauseReason { get; private set; }

        /// <summary>The handshake finished (see <see cref="WhenReady"/> for a call that also runs when it already has).</summary>
        public static event Action ConfigReady;
        /// <summary>Open the pause overlay (GHA_PAUSE, or the page was hidden). The player resumes from the overlay.</summary>
        public static event Action Paused;
        /// <summary>The platform's own overlay closed (GHA_RESUME). Keep the pause overlay open: the player resumes from it.</summary>
        public static event Action Resumed;
        /// <summary>The platform's sound button (GHA_MUTE). <see cref="AyvagoAudio"/> already applied it.</summary>
        public static event Action<bool> MuteChanged;
        /// <summary>The platform language changed; <see cref="AyvagoStrings.LocaleChanged"/> is the one to re-render with.</summary>
        public static event Action<string> LocaleChanged;
        /// <summary>The platform theme changed (minimal, cartoon, arcade, retro).</summary>
        public static event Action<string> ThemeChanged;

        /// <summary>Editor and non-WebGL players only: the config the stub reports (set it before the first scene loads).</summary>
        public static AyvagoConfig EditorConfig;

        /// <summary>Log every platform call in the Editor and non-WebGL players.</summary>
        public static bool LogCalls = true;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern string AyvagoConfigJson();
        [DllImport("__Internal")] static extern void AyvagoCall(string method, string arg);
#else
        static string AyvagoConfigJson()
        {
            var c = EditorConfig != null ? EditorConfig.Clone() : new AyvagoConfig();
            c.handshake = true;
            if (string.IsNullOrEmpty(c.locale)) c.locale = Application.systemLanguage == SystemLanguage.Turkish ? "tr" : "en";
            if (EditorConfig == null)
            {
                c.locale = Application.systemLanguage == SystemLanguage.Turkish ? "tr" : "en";
                c.touch = Application.isMobilePlatform;
                c.phone = Application.isMobilePlatform && ShortSideDp() < 600f;
            }
            return JsonUtility.ToJson(c);
        }

        static float ShortSideDp()
        {
            float dpi = Screen.dpi > 0 ? Screen.dpi : 160f;
            return Mathf.Min(Screen.width, Screen.height) / (dpi / 160f);
        }

        static void AyvagoCall(string method, string arg)
        {
            if (LogCalls) Debug.Log("[ayvago] " + method + (string.IsNullOrEmpty(arg) ? "" : " " + arg));
            if (method == "rewarded" || method == "interstitial")
            {
                // standalone never shows an ad; answer at once like the adapter does
                var m = JsonUtility.FromJson<Msg>(arg);
                if (instance != null) instance.OnAdResult("{\"id\":" + m.id + ",\"rewarded\":false}");
            }
        }
#endif

        // ------------------------------------------------------------------ boot

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            // play mode without a domain reload keeps statics: start clean
            instance = null;
            config = null;
            ready = false;
            pendingAds.Clear();
            whenReady.Clear();
            nextAd = 1;
            AdShowing = false;
            ConfigReady = null;
            Paused = null;
            Resumed = null;
            MuteChanged = null;
            LocaleChanged = null;
            ThemeChanged = null;
            AyvagoRun.ResetStatics();
            AyvagoAudio.ResetStatics();
            AyvagoStrings.ResetStatics();
            AyvagoDifficulty.ResetStatics();
            AyvagoDevice.ResetStatics();
            AyvagoTestHooks.ResetStatics();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void AutoBoot()
        {
            Boot();
        }

        /// <summary>Creates the bridge if it does not exist yet (it does so by itself before the first scene).</summary>
        public static void Boot()
        {
            if (config != null) return;
            config = ReadConfig() ?? new AyvagoConfig();
            if (instance == null)
            {
                var go = new GameObject(ObjectName);
                DontDestroyOnLoad(go);
                instance = go.AddComponent<AyvagoSDK>();
            }
            AyvagoAudio.Apply();
            if (config.handshake) Handshake();
        }

        static AyvagoConfig ReadConfig()
        {
            try
            {
                var json = AyvagoConfigJson();
                return string.IsNullOrEmpty(json) ? null : JsonUtility.FromJson<AyvagoConfig>(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ayvago] no config from the page: " + e.Message);
                return null;
            }
        }

        /// <summary>Reads the page's config again (normally not needed: the handshake updates it).</summary>
        public static void Refresh()
        {
            Boot();
            var c = ReadConfig();
            if (c != null) config = c;
            if (config.handshake && !ready) Handshake();
        }

        /// <summary>Runs <paramref name="action"/> once the handshake has finished (at once when it has).</summary>
        public static void WhenReady(Action action)
        {
            if (action == null) return;
            if (Ready) action();
            else whenReady.Add(action);
        }

        static void Handshake()
        {
            if (ready) return;
            ready = true;
            AyvagoStrings.OnHandshake();
            AyvagoRun.OnHandshake();
            AyvagoAudio.OnHandshake();
            AyvagoTestHooks.Refresh();
            var queued = whenReady.ToArray();
            whenReady.Clear();
            foreach (var a in queued) Safe(a);
            if (ConfigReady != null) Safe(ConfigReady);
        }

        void Awake()
        {
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }
            instance = this;
            gameObject.name = ObjectName;
        }

        // ------------------------------------------------------------------ platform calls

        /// <summary>GHA_SESSION_START. Use <see cref="AyvagoRun.Begin"/>, which keeps the leaderboard rules.</summary>
        public static void SessionStart()
        {
            Call("sessionStart", "");
        }

        /// <summary>GHA_GAMEPLAY_STOP: a round left without an end. Use <see cref="AyvagoRun.Abandon"/>.</summary>
        public static void GameplayStop()
        {
            Call("gameplayStop", "");
        }

        /// <summary>GHA_SCORE: an optional mid-run checkpoint.</summary>
        public static void SubmitScore(double score)
        {
            if (double.IsNaN(score) || double.IsInfinity(score)) return;
            Call("score", "{\"score\":" + Num(score) + "}");
        }

        /// <summary>
        /// GHA_END. Use <see cref="AyvagoRun.End"/>, which sends it once per run with the difficulty
        /// and continues. <paramref name="score"/> null ends the run without a score (its time counts, no board).
        /// </summary>
        public static void EndGame(double? score, bool won, bool easy, bool continued)
        {
            var sb = new StringBuilder("{");
            if (score.HasValue && !double.IsNaN(score.Value) && !double.IsInfinity(score.Value))
                sb.Append("\"score\":").Append(Num(score.Value)).Append(',');
            sb.Append("\"won\":").Append(won ? "true" : "false");
            sb.Append(",\"difficulty\":\"").Append(easy ? "easy" : "normal").Append('"');
            if (continued) sb.Append(",\"continues\":1");
            sb.Append('}');
            Call("end", sb.ToString());
        }

        /// <summary>GHA_HAPPY_TIME: a new personal best (AyvagoRun sends it).</summary>
        public static void Celebrate()
        {
            Call("celebrate", "");
        }

        /// <summary>GHA_MUTE_STATE: the game's sound switch (AyvagoAudio sends it).</summary>
        public static void ReportMute(bool muted)
        {
            Call("mute", muted ? "{\"muted\":true}" : "{\"muted\":false}");
        }

        /// <summary>GHA_OPEN_LEADERBOARD: the menu's trophy button (embedded only).</summary>
        public static void OpenLeaderboard()
        {
            Call("leaderboard", "");
        }

        static readonly Regex Placement = new Regex("^[a-z][a-z0-9_]{1,31}$");

        /// <summary>
        /// A rewarded ad, the player's choice on the result screen only. <paramref name="done"/>
        /// gets true only when the player earned the reward. While it runs the game is held
        /// (timeScale 0, audio paused) and restored afterwards.
        /// </summary>
        public static void Rewarded(string placement, Action<bool> done)
        {
            Ad("rewarded", placement, done);
        }

        /// <summary>An interstitial at a natural break (result → menu, every 3rd retry). Always calls back.</summary>
        public static void Interstitial(string placement, Action done)
        {
            Ad("interstitial", placement, delegate (bool _) { if (done != null) done(); });
        }

        static void Ad(string format, string placement, Action<bool> done)
        {
            Boot();
            if (!AdsAvailable)
            {
                if (done != null) done(false);
                return;
            }
            if (string.IsNullOrEmpty(placement) || !Placement.IsMatch(placement))
                Debug.LogWarning("[ayvago] ad placement \"" + placement + "\" is not snake_case (^[a-z][a-z0-9_]{1,31}$)");
            int id = nextAd++;
            pendingAds[id] = done;
            heldTimeScale = Time.timeScale;
            heldAudioPause = AudioListener.pause;
            AdShowing = true;
            Time.timeScale = 0f;
            AudioListener.pause = true;
            AyvagoTestHooks.Refresh();
            Call(format, "{\"id\":" + id + ",\"placement\":\"" + Escape(placement ?? "") + "\"}");
        }

        static void Call(string method, string arg)
        {
            Boot();
            try
            {
                AyvagoCall(method, arg);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ayvago] " + method + " failed: " + e.Message);
            }
        }

        // ------------------------------------------------------------------ from the page (SendMessage)

        void OnPlatformConfig(string json)
        {
            var c = JsonUtility.FromJson<AyvagoConfig>(json);
            if (c == null) return;
            config = c;
            if (c.handshake) Handshake();
        }

        void OnPlatformPause(string json)
        {
            var m = Parse(json);
            LastPauseReason = m.reason == "hidden" ? PauseReason.Hidden : PauseReason.Platform;
            if (Paused != null) Safe(Paused);
        }

        void OnPlatformResume(string json)
        {
            if (Resumed != null) Safe(Resumed);
        }

        void OnPlatformMute(string json)
        {
            var m = Parse(json);
            AyvagoAudio.SetFromPlatform(m.muted);
            if (MuteChanged != null) Safe(delegate { MuteChanged(m.muted); });
        }

        void OnPlatformLocale(string json)
        {
            var m = Parse(json);
            if (string.IsNullOrEmpty(m.locale)) return;
            config.locale = m.locale;
            AyvagoStrings.OnPlatformLocale(m.locale);
            if (LocaleChanged != null) Safe(delegate { LocaleChanged(m.locale); });
        }

        void OnPlatformTheme(string json)
        {
            var m = Parse(json);
            config.theme = m.theme ?? "";
            config.colorMode = m.colorMode ?? "";
            if (ThemeChanged != null) Safe(delegate { ThemeChanged(config.theme); });
        }

        void OnAdResult(string json)
        {
            var m = Parse(json);
            Action<bool> done;
            if (!pendingAds.TryGetValue(m.id, out done)) return;
            pendingAds.Remove(m.id);
            if (pendingAds.Count == 0)
            {
                AdShowing = false;
                Time.timeScale = heldTimeScale;
                AudioListener.pause = heldAudioPause;
            }
            AyvagoTestHooks.Refresh();
            if (done != null) Safe(delegate { done(m.rewarded); });
        }

        void OnTestCommand(string json)
        {
            var m = Parse(json);
            if (!string.IsNullOrEmpty(m.name)) AyvagoTestHooks.Dispatch(m.name, m.arg ?? "");
        }

        // ------------------------------------------------------------------ helpers

        static Msg Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return new Msg();
            try
            {
                return JsonUtility.FromJson<Msg>(json) ?? new Msg();
            }
            catch (Exception)
            {
                return new Msg();
            }
        }

        static void Safe(Action a)
        {
            try
            {
                a();
            }
            catch (Exception e)
            {
                // a failing game callback must not break the bridge
                Debug.LogException(e);
            }
        }

        internal static string Num(double v)
        {
            return v.ToString("R", CultureInfo.InvariantCulture);
        }

        internal static string Escape(string s)
        {
            var sb = new StringBuilder(s.Length + 2);
            foreach (char c in s)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.ToString();
        }
    }
}
