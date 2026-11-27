using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Ayvago
{
    /// <summary>The screen names of the test-hook contract.</summary>
    public static class AyvagoScreen
    {
        public const string Intro = "intro";
        public const string Menu = "menu";
        public const string Play = "play";
        public const string Pause = "pause";
        public const string Result = "result";
    }

    /// <summary>
    /// What the page's <c>window.__ayvago.state()</c> returns: the game's own fields (screen,
    /// score, level, extra) plus the SDK's, filled in by <see cref="AyvagoTestHooks"/>.
    /// </summary>
    [Serializable]
    public class AyvagoTestState
    {
        public string engine = "unity";
        public string sdk = AyvagoSDK.Version;
        // the game's
        public string screen = AyvagoScreen.Intro;
        public double score;
        public int level;
        /// <summary>Game-specific JSON (or text) for the game's own tests; "" when none.</summary>
        public string extra = "";
        // the SDK's
        public string orientation = "landscape";
        public string locale = "en";
        public bool embedded;
        public string difficulty = "normal";
        public bool offersDifficulty;
        public bool offersContinue;
        public bool continueOffered;
        public bool runActive;
        public int continues;
        public bool hasBest;
        public double best;
        public bool muted;
        public bool silenced;
        public bool adShowing;
        public float timeScale = 1f;
    }

    /// <summary>
    /// The test hooks (docs/unity/AYVAGO_UNITY_SDK.md §8): smoke tests, the platform harness and the
    /// store-art capture drive a Unity game through them, so every game must
    /// - <see cref="Publish"/> its screen on every change (intro, menu, play, pause, result) and its
    ///   score when it changes, and
    /// - handle <see cref="Command"/>: play, pause, resume, retry, menu, end [score], continue,
    ///   stage &lt;name&gt; (optional).
    /// The SDK handles sound, difficulty &lt;easy|normal&gt; and locale &lt;en|tr&gt; itself (and still
    /// raises the event, so a menu can redraw). The page reaches them as
    /// <c>window.__ayvago.state()</c> and <c>window.__ayvago.command(name, arg)</c>.
    /// </summary>
    public static class AyvagoTestHooks
    {
        /// <summary>A test command: (name, arg). arg is "" when none.</summary>
        public static event Action<string, string> Command;

        /// <summary>The result screen shows the rewarded CONTINUE offer right now (set by the game; cleared by AyvagoRun).</summary>
        public static bool ContinueOffered
        {
            get { return continueOffered; }
            set { if (continueOffered == value) return; continueOffered = value; Refresh(); }
        }

        static bool continueOffered;
        static bool published;
        static string screen = AyvagoScreen.Intro;
        static double score;
        static int level;
        static string extra = "";
        static string lastJson = "";

        /// <summary>The last JSON published (also in the Editor, for play-mode tests).</summary>
        public static string LastJson
        {
            get { return lastJson; }
        }

        internal static void ResetStatics()
        {
            Command = null;
            continueOffered = false;
            published = false;
            screen = AyvagoScreen.Intro;
            score = 0;
            level = 0;
            extra = "";
            lastJson = "";
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void AyvagoPublishState(string json);
#else
        static void AyvagoPublishState(string json)
        {
        }
#endif

        /// <summary>
        /// Publishes the game's state. Call it on every screen change and whenever the score or level
        /// changes; an unchanged state is not sent again, so calling it every frame is cheap.
        /// </summary>
        public static void Publish(string screenName, double scoreValue = 0, int levelValue = 0, string extraJson = null)
        {
            published = true;
            screen = string.IsNullOrEmpty(screenName) ? screen : screenName;
            score = scoreValue;
            level = levelValue;
            extra = extraJson ?? "";
            Emit();
        }

        /// <summary>Publishes the last game state again with fresh SDK fields (the SDK calls it on its own changes).</summary>
        public static void Refresh()
        {
            if (published) Emit();
        }

        static void Emit()
        {
            var c = AyvagoSDK.Config;
            var s = new AyvagoTestState
            {
                screen = screen,
                score = score,
                level = level,
                extra = extra,
                orientation = AyvagoDevice.IsLandscape ? "landscape" : "portrait",
                locale = AyvagoStrings.Lang,
                embedded = c.embedded,
                difficulty = AyvagoDifficulty.IsEasy ? "easy" : "normal",
                offersDifficulty = AyvagoDifficulty.Offered,
                offersContinue = AyvagoRun.OffersContinue,
                continueOffered = continueOffered,
                runActive = AyvagoRun.Active,
                continues = AyvagoRun.Continues,
                hasBest = AyvagoRun.HasBest,
                best = AyvagoRun.Best,
                muted = AyvagoAudio.Muted,
                silenced = AyvagoAudio.Silenced,
                adShowing = AyvagoSDK.AdShowing,
                timeScale = Time.timeScale,
            };
            var json = JsonUtility.ToJson(s);
            if (json == lastJson) return;
            lastJson = json;
            try
            {
                AyvagoPublishState(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ayvago] test state not published: " + e.Message);
            }
        }

        /// <summary>Editor and play-mode tests: runs a command as if the page had sent it.</summary>
        public static void Send(string name, string arg = "")
        {
            Dispatch(name, arg ?? "");
        }

        internal static void Dispatch(string name, string arg)
        {
            switch (name)
            {
                case "sound":
                    AyvagoAudio.Toggle();
                    break;
                case "difficulty":
                    AyvagoDifficulty.Current = arg == "easy" ? Difficulty.Easy : Difficulty.Normal;
                    break;
                case "locale":
                    AyvagoStrings.SetLang(arg);
                    break;
            }
            if (Command == null) return;
            try
            {
                Command(name, arg);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }
        }
    }
}
