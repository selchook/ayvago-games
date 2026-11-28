using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Ayvago.Editor
{
    /// <summary>
    /// Ayvago → Build WebGL…: builds the game with the Ayvago template into a studio checkout
    /// (selchook/ayvago-games) at public/games/&lt;slug&gt;/. It replaces only index.html, Build/ and
    /// TemplateData/ there (and StreamingAssets/ when the build has one); it never touches
    /// ayvago.json or ayvago/ (the store art the studio generates).
    /// The studio path is kept per machine (EditorPrefs); the slug per project
    /// (ProjectSettings/Ayvago.json, commit it).
    /// </summary>
    public sealed class AyvagoBuildWindow : EditorWindow
    {
        const string StudioPref = "Ayvago.StudioPath";
        static readonly Regex SlugRule = new Regex("^[a-z0-9]+(-[a-z0-9]+)*$");
        /// <summary>The first download budget (docs/unity/AYVAGO_UNITY_SDK.md §2).</summary>
        const long BudgetBytes = 25L * 1024 * 1024;

        [Serializable]
        class ProjectSettingsFile
        {
            public string slug = "";
        }

        string studio = "";
        string slug = "";

        static string SettingsPath
        {
            get { return Path.Combine(AyvagoEditorMenu.ProjectRoot, "ProjectSettings", "Ayvago.json"); }
        }

        public static void Open()
        {
            var w = GetWindow<AyvagoBuildWindow>(true, "Ayvago Build WebGL");
            w.minSize = new Vector2(520f, 230f);
            w.Show();
        }

        void OnEnable()
        {
            studio = EditorPrefs.GetString(StudioPref, "");
            slug = LoadSlug();
        }

        public static string LoadSlug()
        {
            try
            {
                if (File.Exists(SettingsPath)) return JsonUtility.FromJson<ProjectSettingsFile>(File.ReadAllText(SettingsPath)).slug ?? "";
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ayvago] ProjectSettings/Ayvago.json: " + e.Message);
            }
            return "";
        }

        static void SaveSlug(string value)
        {
            File.WriteAllText(SettingsPath, JsonUtility.ToJson(new ProjectSettingsFile { slug = value }, true));
        }

        void OnGUI()
        {
            EditorGUILayout.LabelField("Studio checkout (selchook/ayvago-games)", EditorStyles.boldLabel);
            EditorGUILayout.BeginHorizontal();
            studio = EditorGUILayout.TextField(studio);
            if (GUILayout.Button("Browse…", GUILayout.Width(80f)))
            {
                var picked = EditorUtility.OpenFolderPanel("The ayvago-games checkout", studio, "");
                if (!string.IsNullOrEmpty(picked)) studio = picked;
            }
            EditorGUILayout.EndHorizontal();
            EditorGUILayout.Space();
            slug = EditorGUILayout.TextField("Game slug", slug);
            EditorGUILayout.HelpBox("Writes public/games/" + (string.IsNullOrEmpty(slug) ? "<slug>" : slug) +
                "/index.html, Build/ and TemplateData/ in the studio. ayvago.json and ayvago/ (store art) stay as they are.", MessageType.Info);
            EditorGUILayout.Space();
            if (GUILayout.Button("Build WebGL", GUILayout.Height(32f)))
            {
                var s = studio;
                var g = slug;
                // after this GUI pass: a build inside OnGUI breaks the layout stack
                EditorApplication.delayCall += () => Build(s, g);
            }
        }

        /// <summary>Builds into &lt;studio&gt;/public/games/&lt;slug&gt;/. Returns false (after a dialog) on any problem.</summary>
        public static bool Build(string studioPath, string gameSlug)
        {
            string problem = Validate(studioPath, gameSlug);
            if (problem != null)
            {
                EditorUtility.DisplayDialog("Ayvago build", problem, "OK");
                return false;
            }
            EditorPrefs.SetString(StudioPref, studioPath);
            SaveSlug(gameSlug);
            var meta = Path.Combine(studioPath, "games", gameSlug, "game.json");
            if (!File.Exists(meta) && !EditorUtility.DisplayDialog("Ayvago build",
                    "games/" + gameSlug + "/game.json does not exist in the studio yet. Build anyway? (Write game.json with \"engine\": \"unity\" and guide.json before testing.)",
                    "Build", "Cancel"))
                return false;

            if (PlayerSettings.WebGL.template != AyvagoEditorMenu.TemplateSetting || PlayerSettings.WebGL.compressionFormat != WebGLCompressionFormat.Disabled)
            {
                if (!EditorUtility.DisplayDialog("Ayvago build", "The WebGL settings are not the Ayvago ones (template Ayvago, compression Disabled). Apply them now?", "Apply and build", "Cancel"))
                    return false;
                if (!Directory.Exists(Path.Combine(Application.dataPath, "WebGLTemplates", AyvagoEditorMenu.TemplateName)) && !AyvagoEditorMenu.InstallTemplate(false)) return false;
                AyvagoEditorMenu.ApplySettings();
            }
            var id = gameSlug.Replace("-", "");
            PlayerSettings.SetTemplateCustomValue(AyvagoEditorMenu.GameIdVariable, id);

            var scenes = new List<string>();
            foreach (var s in EditorBuildSettings.scenes)
                if (s.enabled) scenes.Add(s.path);
            if (scenes.Count == 0)
            {
                EditorUtility.DisplayDialog("Ayvago build", "No scene is enabled in Build Settings. The Boot scene (AyvagoBootIntro) goes first, the game after it.", "OK");
                return false;
            }

            var temp = Path.Combine(AyvagoEditorMenu.ProjectRoot, "Temp", "AyvagoWebGL");
            if (Directory.Exists(temp)) Directory.Delete(temp, true);
            var options = new BuildPlayerOptions
            {
                scenes = scenes.ToArray(),
                locationPathName = temp,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };
            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                EditorUtility.DisplayDialog("Ayvago build", "The build " + report.summary.result + " (" + report.summary.totalErrors + " errors). See the Console.", "OK");
                return false;
            }

            var dest = Path.Combine(studioPath, "public", "games", gameSlug);
            Directory.CreateDirectory(dest);
            ReplaceFile(Path.Combine(temp, "index.html"), Path.Combine(dest, "index.html"));
            ReplaceDirectory(Path.Combine(temp, "Build"), Path.Combine(dest, "Build"));
            ReplaceDirectory(Path.Combine(temp, "TemplateData"), Path.Combine(dest, "TemplateData"));
            if (Directory.Exists(Path.Combine(temp, "StreamingAssets")))
            {
                Debug.LogWarning("[ayvago] the build has StreamingAssets/: copied too, but everything should ship inside the build");
                ReplaceDirectory(Path.Combine(temp, "StreamingAssets"), Path.Combine(dest, "StreamingAssets"));
            }

            long size = AyvagoEditorMenu.DirectorySize(Path.Combine(dest, "Build"));
            string mb = (size / 1048576.0).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
            string msg = "Built into public/games/" + gameSlug + "/ (Build/ " + mb + " MB).";
            if (size > BudgetBytes) msg += "\n\nOver the 25 MB first-download budget: aim for 10–15 MB.";
            msg += "\n\nNext, in the studio: node scripts/gen-registry.mjs && node scripts/gen-platform.mjs --live, " +
                   "then node scripts/smoke-test.mjs --dev --serial " + gameSlug + ".";
            Debug.Log("[ayvago] " + msg);
            EditorUtility.DisplayDialog("Ayvago build", msg, "OK");
            return true;
        }

        static string Validate(string studioPath, string gameSlug)
        {
            if (string.IsNullOrEmpty(studioPath) || !Directory.Exists(studioPath)) return "Pick the folder of your ayvago-games checkout.";
            var pkg = Path.Combine(studioPath, "package.json");
            if (!File.Exists(pkg) || !File.ReadAllText(pkg).Contains("\"ayvago-games\"") || !Directory.Exists(Path.Combine(studioPath, "games")))
                return studioPath + " is not an ayvago-games checkout (no package.json named ayvago-games, or no games/).";
            if (string.IsNullOrEmpty(gameSlug) || !SlugRule.IsMatch(gameSlug)) return "The slug is lower-case words joined by hyphens, like moon-rover.";
            var id = gameSlug.Replace("-", "");
            if (id.Length < 3 || id.Length > 32) return "The platform id (the slug without hyphens) must be 3 to 32 letters or digits.";
            return null;
        }

        static void ReplaceFile(string source, string target)
        {
            if (!File.Exists(source)) return;
            File.Copy(source, target, true);
        }

        static void ReplaceDirectory(string source, string target)
        {
            if (Directory.Exists(target)) Directory.Delete(target, true);
            if (Directory.Exists(source)) AyvagoEditorMenu.CopyDirectory(source, target);
        }
    }
}
