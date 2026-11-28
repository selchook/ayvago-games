using System.Globalization;
using UnityEngine;

namespace Ayvago
{
    /// <summary>
    /// PlayerPrefs scoped to the game ("ayvago.&lt;key&gt;.&lt;gameId&gt;"), saved at once: on WebGL
    /// PlayerPrefs live in IndexedDB and are only written by <c>PlayerPrefs.Save()</c>.
    /// </summary>
    public static class AyvagoPrefs
    {
        static string Key(string key)
        {
            return "ayvago." + key + "." + AyvagoSDK.GameKey;
        }

        public static bool Has(string key)
        {
            return PlayerPrefs.HasKey(Key(key));
        }

        public static string GetString(string key, string fallback)
        {
            return PlayerPrefs.GetString(Key(key), fallback);
        }

        public static void SetString(string key, string value)
        {
            PlayerPrefs.SetString(Key(key), value);
            PlayerPrefs.Save();
        }

        public static bool GetBool(string key, bool fallback)
        {
            return PlayerPrefs.GetInt(Key(key), fallback ? 1 : 0) != 0;
        }

        public static void SetBool(string key, bool value)
        {
            PlayerPrefs.SetInt(Key(key), value ? 1 : 0);
            PlayerPrefs.Save();
        }

        /// <summary>Doubles are kept as text: PlayerPrefs floats lose whole numbers above 16 777 216.</summary>
        public static bool TryGetDouble(string key, out double value)
        {
            value = 0;
            if (!Has(key)) return false;
            return double.TryParse(GetString(key, ""), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }

        public static void SetDouble(string key, double value)
        {
            SetString(key, value.ToString("R", CultureInfo.InvariantCulture));
        }

        public static void Delete(string key)
        {
            PlayerPrefs.DeleteKey(Key(key));
            PlayerPrefs.Save();
        }
    }
}
