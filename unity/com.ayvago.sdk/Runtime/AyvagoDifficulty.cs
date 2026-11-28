using System;

namespace Ayvago
{
    public enum Difficulty
    {
        Normal,
        Easy,
    }

    /// <summary>
    /// EASY / NORMAL on the menu, remembered between visits (PlayerPrefs). Easy runs are practice
    /// (protocol 2.6): GHA_END carries <c>difficulty: "easy"</c>, they stay off the boards and
    /// never set the best. A game that offers the choice sets <see cref="Offered"/> = true.
    /// </summary>
    public static class AyvagoDifficulty
    {
        static bool loaded;
        static Difficulty current = Difficulty.Normal;

        /// <summary>The game shows the EASY / NORMAL toggle. Without it every run is Normal.</summary>
        public static bool Offered;

        public static event Action<Difficulty> Changed;

        internal static void ResetStatics()
        {
            loaded = false;
            current = Difficulty.Normal;
            Offered = false;
            Changed = null;
        }

        /// <summary>The chosen difficulty (remembered).</summary>
        public static Difficulty Current
        {
            get
            {
                if (!loaded)
                {
                    loaded = true;
                    current = AyvagoPrefs.GetString("difficulty", "normal") == "easy" ? Difficulty.Easy : Difficulty.Normal;
                }
                return current;
            }
            set
            {
                var before = Current;
                current = value;
                AyvagoPrefs.SetString("difficulty", value == Difficulty.Easy ? "easy" : "normal");
                if (before != value && Changed != null) Changed(value);
                AyvagoTestHooks.Refresh();
            }
        }

        /// <summary>This run is Easy (offered and chosen).</summary>
        public static bool IsEasy
        {
            get { return Offered && Current == Difficulty.Easy; }
        }
    }
}
