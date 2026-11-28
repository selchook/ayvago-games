using System;
using UnityEngine;

namespace Ayvago
{
    /// <summary>Which way the game's leaderboard ranks (game.json platform.scoring.order).</summary>
    public enum ScoreOrder
    {
        /// <summary>Higher is better (points). The default.</summary>
        Desc,
        /// <summary>Lower is better (time trials, in milliseconds).</summary>
        Asc,
    }

    /// <summary>What <see cref="AyvagoRun.End"/> did with a run.</summary>
    public struct AyvagoRunResult
    {
        /// <summary>GHA_END went out (false: a second End, no run, or a run too short to send).</summary>
        public bool Sent;
        /// <summary>GHA_END carried a score (false: a time trial that was not finished).</summary>
        public bool Scored;
        /// <summary>The score that was sent (rounded to a whole number, never below 0).</summary>
        public double Score;
        /// <summary>A new personal best (GHA_HAPPY_TIME went out with it).</summary>
        public bool NewBest;
        /// <summary>An Easy run: practice, never on a board and never a best.</summary>
        public bool Practice;
        /// <summary>The run was shorter than <see cref="AyvagoRun.MinDurationMs"/> and not won: no GHA_END, it counts as left.</summary>
        public bool TooShort;
        /// <summary>The run used its rewarded continue.</summary>
        public bool Continued;
    }

    /// <summary>
    /// One round, by the platform's leaderboard rules (docs/unity/AYVAGO_UNITY_SDK.md §6):
    /// - <see cref="Begin"/> on PLAY and RETRY sends GHA_SESSION_START (the platform opens a
    ///   server score session; 60 per player per game per hour).
    /// - <see cref="End"/> on the result screen sends exactly one GHA_END per run, with the
    ///   difficulty and the continue; a second call is ignored.
    /// - <see cref="Abandon"/> (MENU or RETRY from the pause overlay) sends GHA_GAMEPLAY_STOP, never an END.
    /// - <see cref="Continue"/> runs the rewarded continue: same session, <c>continues: 1</c>.
    /// - The best is kept per game (PlayerPrefs), replaced by the platform's when it sends one,
    ///   compared by <see cref="Order"/>; Easy runs never set it.
    /// Set <see cref="Order"/> and <see cref="MinDurationMs"/> to the game's platform.scoring.
    /// </summary>
    public static class AyvagoRun
    {
        /// <summary>The board's order (game.json platform.scoring.order; default desc).</summary>
        public static ScoreOrder Order = ScoreOrder.Desc;

        /// <summary>
        /// game.json platform.scoring.minDurationMs (studio default 3000). The server rejects a
        /// shorter run, so a run that ends sooner without being won sends no GHA_END (it is left,
        /// its time still counts). 0 turns the rule off.
        /// </summary>
        public static int MinDurationMs = 3000;

        /// <summary>The game offers the rewarded continue on its result screen (ads.continue).</summary>
        public static bool OffersContinue;

        /// <summary>A run is open: begun and not ended or left.</summary>
        public static bool Active { get; private set; }

        /// <summary>The rewarded continue used in this run (0 or 1).</summary>
        public static int Continues { get; private set; }

        /// <summary>Runs begun on this page (RETRY counts): every 3rd retry may show the "replay" interstitial.</summary>
        public static int RunsStarted { get; private set; }

        /// <summary>After every run that ended (sent or not).</summary>
        public static event Action<AyvagoRunResult> RunEnded;

        static double startedAt;
        static bool bestLoaded;
        static bool hasBest;
        static double best;

        internal static void ResetStatics()
        {
            Order = ScoreOrder.Desc;
            MinDurationMs = 3000;
            OffersContinue = false;
            Active = false;
            Continues = 0;
            RunsStarted = 0;
            RunEnded = null;
            bestLoaded = false;
            hasBest = false;
            best = 0;
        }

        static double Now
        {
            get { return Time.realtimeSinceStartupAsDouble; }
        }

        /// <summary>Wall-clock milliseconds since <see cref="Begin"/> (what the server measures).</summary>
        public static double ElapsedMs
        {
            get { return Active ? (Now - startedAt) * 1000.0 : 0; }
        }

        /// <summary>A round starts (PLAY, RETRY): GHA_SESSION_START. A run still open is left first.</summary>
        public static void Begin()
        {
            if (Active) Abandon();
            Active = true;
            Continues = 0;
            RunsStarted++;
            startedAt = Now;
            AyvagoSDK.SessionStart();
            AyvagoTestHooks.Refresh();
        }

        /// <summary>
        /// The round ended (the result screen): exactly one GHA_END for the run, with the
        /// difficulty and the continue, and GHA_HAPPY_TIME on a new best. A second call, or a call
        /// without a run, is ignored. Scores are sent as whole numbers, never below 0. A time
        /// trial (<see cref="ScoreOrder.Asc"/>) that was not won has no time: it is sent without a
        /// score. A run shorter than <see cref="MinDurationMs"/> that was not won sends nothing.
        /// </summary>
        public static AyvagoRunResult End(double score, bool won)
        {
            var r = new AyvagoRunResult();
            if (!Active)
            {
                Debug.LogWarning("[ayvago] AyvagoRun.End without an open run (call Begin on PLAY and RETRY; End once per run)");
                return r;
            }
            bool tooShort = !won && MinDurationMs > 0 && ElapsedMs < MinDurationMs;
            Active = false;
            r.Practice = AyvagoDifficulty.IsEasy;
            r.Continued = Continues > 0;
            if (tooShort)
            {
                r.TooShort = true;
                AyvagoSDK.GameplayStop();
                Finish(r);
                return r;
            }
            r.Scored = !(Order == ScoreOrder.Asc && !won) && !double.IsNaN(score) && !double.IsInfinity(score);
            r.Score = r.Scored ? Math.Max(0, Math.Round(score)) : 0;
            r.NewBest = r.Scored && !r.Practice && Beats(r.Score);
            if (r.NewBest) SetBest(r.Score);
            AyvagoSDK.EndGame(r.Scored ? (double?)r.Score : null, won, r.Practice, r.Continued);
            r.Sent = true;
            if (r.NewBest) AyvagoSDK.Celebrate();
            Finish(r);
            return r;
        }

        static void Finish(AyvagoRunResult r)
        {
            AyvagoTestHooks.ContinueOffered = false;
            AyvagoTestHooks.Refresh();
            if (RunEnded == null) return;
            try
            {
                RunEnded(r);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }
        }

        /// <summary>The round is left without an end (MENU or RETRY from pause): GHA_GAMEPLAY_STOP, no score.</summary>
        public static void Abandon()
        {
            if (!Active) return;
            Active = false;
            AyvagoSDK.GameplayStop();
            AyvagoTestHooks.ContinueOffered = false;
            AyvagoTestHooks.Refresh();
        }

        /// <summary>An optional mid-run checkpoint (GHA_SCORE).</summary>
        public static void Checkpoint(double score)
        {
            if (Active) AyvagoSDK.SubmitScore(Math.Max(0, Math.Round(score)));
        }

        /// <summary>
        /// The result screen may offer the rewarded continue: the game offers it, ads are on, the
        /// run is open (End not called yet) and has not continued. Hold End back while it is offered.
        /// </summary>
        public static bool CanContinue
        {
            get { return Active && OffersContinue && Continues == 0 && AyvagoSDK.AdsAvailable; }
        }

        /// <summary>
        /// The player pressed CONTINUE: shows the rewarded ad ("continue"). <paramref name="done"/>
        /// true: the run goes on in the same score session (no new Begin) and its END will carry
        /// <c>continues: 1</c>. False: the ad did not finish; call <see cref="End"/> as usual.
        /// </summary>
        public static void Continue(Action<bool> done)
        {
            if (!CanContinue)
            {
                if (done != null) done(false);
                return;
            }
            AyvagoSDK.Rewarded("continue", delegate (bool ok)
            {
                if (ok) MarkContinued();
                if (done != null) done(ok);
            });
        }

        /// <summary>For a game that runs the rewarded ad itself: the run continued after it.</summary>
        public static void MarkContinued()
        {
            if (!Active) return;
            Continues = 1;
            AyvagoTestHooks.ContinueOffered = false;
            AyvagoTestHooks.Refresh();
        }

        // ------------------------------------------------------------------ best

        /// <summary>The player has a best (local, or the platform's record).</summary>
        public static bool HasBest
        {
            get { LoadBest(); return hasBest; }
        }

        /// <summary>The best score (0 when none).</summary>
        public static double Best
        {
            get { LoadBest(); return hasBest ? best : 0; }
        }

        /// <summary>Whether <paramref name="score"/> would be a new best by <see cref="Order"/>.</summary>
        public static bool Beats(double score)
        {
            LoadBest();
            if (!hasBest) return Order == ScoreOrder.Asc || score > 0;
            return Order == ScoreOrder.Asc ? score < best : score > best;
        }

        static void LoadBest()
        {
            if (bestLoaded) return;
            bestLoaded = true;
            double v;
            hasBest = AyvagoPrefs.TryGetDouble("best", out v);
            best = hasBest ? v : 0;
        }

        static void SetBest(double v)
        {
            bestLoaded = true;
            hasBest = true;
            best = v;
            AyvagoPrefs.SetDouble("best", v);
        }

        /// <summary>Protocol 2.4: the platform's best replaces the local one; null clears it; absent keeps it.</summary>
        internal static void OnHandshake()
        {
            var c = AyvagoSDK.Config;
            if (!c.hasBest) return;
            if (c.best >= 0) SetBest(c.best);
            else
            {
                bestLoaded = true;
                hasBest = false;
                best = 0;
                AyvagoPrefs.Delete("best");
            }
        }
    }
}
