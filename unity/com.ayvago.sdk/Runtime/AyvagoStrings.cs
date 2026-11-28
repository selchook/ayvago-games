using System;
using System.Collections.Generic;
using System.Text;

namespace Ayvago
{
    /// <summary>
    /// The TR/EN string table. Every visible string goes through it: register the game's own with
    /// <see cref="Register"/>, read with <see cref="T"/>, and re-render on
    /// <see cref="LocaleChanged"/> (the platform's GHA_LOCALE_CHANGE, or the standalone language
    /// toggle). The core strings (play, retry, menu, ... the ad labels and the key help) are the
    /// studio's own, copied from src/core/i18n.ts.
    ///
    /// The language: <c>?lang=</c> when given; inside Ayvago the platform's locale; standalone the
    /// player's last choice, else the browser language.
    /// </summary>
    public static class AyvagoStrings
    {
        static readonly Dictionary<string, string> CoreTr = new Dictionary<string, string>
        {
            { "play", "OYNA" }, { "retry", "TEKRAR" }, { "menu", "MENÜ" }, { "resume", "DEVAM" }, { "paused", "DURAKLATILDI" },
            { "score", "SKOR" }, { "best", "EN İYİ" }, { "level", "SEVİYE" }, { "lives", "CAN" }, { "time", "SÜRE" }, { "moves", "HAMLE" },
            { "gameOver", "OYUN BİTTİ" }, { "newBest", "YENİ REKOR!" }, { "youWin", "KAZANDIN!" }, { "levelClear", "BÖLÜM TAMAM!" },
            { "tapToStart", "Başlamak için dokun" }, { "howTo", "NASIL OYNANIR" }, { "sound", "SES" }, { "on", "AÇIK" }, { "off", "KAPALI" },
            { "next", "SONRAKİ" }, { "ready", "HAZIR" }, { "go", "BAŞLA!" }, { "wave", "DALGA" }, { "combo", "KOMBO" },
            { "diffEasy", "KOLAY" }, { "diffNormal", "NORMAL" }, { "diffEasyNote", "Kolay: sıralamaya girmez" },
            { "easy", "KOLAY" }, { "normal", "NORMAL" },
            { "adLoading", "Reklam yükleniyor…" }, { "adBadge", "REKLAM" }, { "adContinue", "DEVAM ET" }, { "adContinueNote", "Reklam izle, devam et" },
            { "adContinued", "DEVAM!" }, { "adDouble", "2× ÖDÜL" }, { "adDoubleNote", "Reklam izle, ödülünü ikiye katla" }, { "adDoubled", "ÖDÜL 2 KATINA ÇIKTI!" },
            { "adFailed", "Reklam tamamlanmadı" },
            { "kh_title", "KONTROLLER" }, { "kh_any", "Başlamak için bir tuşa bas ya da tıkla" }, { "kh_space", "BOŞLUK" }, { "kh_pause", "Duraklat" },
        };

        static readonly Dictionary<string, string> CoreEn = new Dictionary<string, string>
        {
            { "play", "PLAY" }, { "retry", "RETRY" }, { "menu", "MENU" }, { "resume", "RESUME" }, { "paused", "PAUSED" },
            { "score", "SCORE" }, { "best", "BEST" }, { "level", "LEVEL" }, { "lives", "LIVES" }, { "time", "TIME" }, { "moves", "MOVES" },
            { "gameOver", "GAME OVER" }, { "newBest", "NEW BEST!" }, { "youWin", "YOU WIN!" }, { "levelClear", "LEVEL CLEAR!" },
            { "tapToStart", "Tap to start" }, { "howTo", "HOW TO PLAY" }, { "sound", "SOUND" }, { "on", "ON" }, { "off", "OFF" },
            { "next", "NEXT" }, { "ready", "READY" }, { "go", "GO!" }, { "wave", "WAVE" }, { "combo", "COMBO" },
            { "diffEasy", "EASY" }, { "diffNormal", "NORMAL" }, { "diffEasyNote", "Easy: not ranked" },
            { "easy", "EASY" }, { "normal", "NORMAL" },
            { "adLoading", "Loading ad…" }, { "adBadge", "AD" }, { "adContinue", "CONTINUE" }, { "adContinueNote", "Watch an ad to continue" },
            { "adContinued", "KEEP GOING!" }, { "adDouble", "2× REWARD" }, { "adDoubleNote", "Watch an ad to double your reward" }, { "adDoubled", "REWARD DOUBLED!" },
            { "adFailed", "The ad did not finish" },
            { "kh_title", "CONTROLS" }, { "kh_any", "Press any key or click to start" }, { "kh_space", "SPACE" }, { "kh_pause", "Pause" },
        };

        static readonly Dictionary<string, string> GameTr = new Dictionary<string, string>();
        static readonly Dictionary<string, string> GameEn = new Dictionary<string, string>();
        static string lang;

        /// <summary>The language changed ("en" or "tr"): re-render every text.</summary>
        public static event Action<string> LocaleChanged;

        internal static void ResetStatics()
        {
            GameTr.Clear();
            GameEn.Clear();
            lang = null;
            LocaleChanged = null;
        }

        /// <summary>"en" or "tr".</summary>
        public static string Lang
        {
            get
            {
                if (lang == null) lang = Initial();
                return lang;
            }
        }

        public static bool IsTurkish
        {
            get { return Lang == "tr"; }
        }

        static string Normalize(string l)
        {
            return !string.IsNullOrEmpty(l) && l.ToLowerInvariant().StartsWith("tr") ? "tr" : "en";
        }

        static string Initial()
        {
            var c = AyvagoSDK.Config;
            if (c.langForced || c.embedded) return Normalize(c.locale);
            var saved = AyvagoPrefs.GetString("lang", "");
            return saved == "tr" || saved == "en" ? saved : Normalize(c.locale);
        }

        /// <summary>Adds (or replaces) one of the game's strings in both languages.</summary>
        public static void Register(string key, string en, string tr)
        {
            GameEn[key] = en;
            GameTr[key] = tr;
        }

        /// <summary>
        /// The string for <paramref name="key"/> in the current language (the game's, then the core's,
        /// then English, then the key itself). <paramref name="vars"/> are name/value pairs that fill
        /// <c>{name}</c> placeholders: <c>T("vs", "name", peer)</c>.
        /// </summary>
        public static string T(string key, params object[] vars)
        {
            string s;
            bool tr = IsTurkish;
            if (!((tr ? GameTr : GameEn).TryGetValue(key, out s) || (tr ? CoreTr : CoreEn).TryGetValue(key, out s)
                || GameEn.TryGetValue(key, out s) || CoreEn.TryGetValue(key, out s)))
                s = key;
            if (vars != null)
                for (int i = 0; i + 1 < vars.Length; i += 2)
                    s = s.Replace("{" + vars[i] + "}", Convert.ToString(vars[i + 1], System.Globalization.CultureInfo.InvariantCulture));
            return s;
        }

        /// <summary>Whether a string exists for <paramref name="key"/>.</summary>
        public static bool Has(string key)
        {
            return GameEn.ContainsKey(key) || CoreEn.ContainsKey(key);
        }

        /// <summary>The standalone language toggle: switches, remembers and re-renders.</summary>
        public static void SetLang(string value)
        {
            var l = Normalize(value);
            AyvagoPrefs.SetString("lang", l);
            Apply(l);
        }

        static void Apply(string l)
        {
            bool changed = Lang != l;
            lang = l;
            AyvagoTestHooks.Refresh();
            if (changed && LocaleChanged != null)
            {
                try { LocaleChanged(l); }
                catch (Exception e) { UnityEngine.Debug.LogException(e); }
            }
        }

        internal static void OnHandshake()
        {
            Apply(Initial());
        }

        internal static void OnPlatformLocale(string locale)
        {
            Apply(Normalize(locale));
        }

        /// <summary>Upper case by the current language: i → İ and ı → I in Turkish.</summary>
        public static string Upper(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            if (!IsTurkish) return s.ToUpperInvariant();
            var sb = new StringBuilder(s.Length);
            foreach (char c in s)
            {
                if (c == 'i') sb.Append('İ');
                else if (c == 'ı') sb.Append('I');
                else sb.Append(char.ToUpperInvariant(c));
            }
            return sb.ToString();
        }

        /// <summary>Lower case by the current language: I → ı and İ → i in Turkish.</summary>
        public static string Lower(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            if (!IsTurkish) return s.ToLowerInvariant();
            var sb = new StringBuilder(s.Length);
            foreach (char c in s)
            {
                if (c == 'I') sb.Append('ı');
                else if (c == 'İ') sb.Append('i');
                else sb.Append(char.ToLowerInvariant(c));
            }
            return sb.ToString();
        }
    }
}
