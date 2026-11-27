using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace Ayvago.Editor
{
    /// <summary>
    /// The Ayvago menu: install the WebGL template, apply the player settings every Ayvago game
    /// uses, build into a studio checkout (<see cref="AyvagoBuildWindow"/>) and set up the Claude
    /// Code files for the project.
    /// </summary>
    public static class AyvagoEditorMenu
    {
        public const string TemplateName = "Ayvago";
        public const string TemplateSetting = "PROJECT:Ayvago";
        public const string GameIdVariable = "AYVAGO_GAME_ID";

        /// <summary>The package's folder on disk (Library/PackageCache/... for a git install).</summary>
        public static string PackageRoot
        {
            get
            {
                var info = PackageInfo.FindForAssembly(typeof(AyvagoEditorMenu).Assembly);
                if (info != null && !string.IsNullOrEmpty(info.resolvedPath)) return info.resolvedPath;
                // fallback: an embedded copy under Packages/
                return Path.GetFullPath(Path.Combine("Packages", "com.ayvago.sdk"));
            }
        }

        public static string ProjectRoot
        {
            get { return Path.GetDirectoryName(Application.dataPath); }
        }

        static string TemplateTarget
        {
            get { return Path.Combine(Application.dataPath, "WebGLTemplates", TemplateName); }
        }

        [MenuItem("Ayvago/Install WebGL Template", false, 1)]
        public static void InstallTemplate()
        {
            InstallTemplate(true);
        }

        /// <summary>Copies WebGLTemplates~/Ayvago from the package into Assets/WebGLTemplates/Ayvago (replacing it).</summary>
        public static bool InstallTemplate(bool tell)
        {
            var source = Path.Combine(PackageRoot, "WebGLTemplates~", TemplateName);
            if (!Directory.Exists(source))
            {
                EditorUtility.DisplayDialog("Ayvago", "The template was not found in the package:\n" + source, "OK");
                return false;
            }
            var target = TemplateTarget;
            if (Directory.Exists(target)) Directory.Delete(target, true);
            CopyDirectory(source, target);
            AssetDatabase.Refresh();
            Debug.Log("[ayvago] WebGL template installed: Assets/WebGLTemplates/" + TemplateName);
            if (tell) EditorUtility.DisplayDialog("Ayvago", "The Ayvago WebGL template is in Assets/WebGLTemplates/Ayvago.\nRun Ayvago → Apply Player Settings next.", "OK");
            return true;
        }

        [MenuItem("Ayvago/Apply Player Settings", false, 2)]
        public static void ApplyPlayerSettings()
        {
            if (!Directory.Exists(TemplateTarget) && !InstallTemplate(false)) return;
            ApplySettings();
            EditorUtility.DisplayDialog("Ayvago", "WebGL player settings applied:\n" +
                "• template Ayvago\n• compression Disabled, no decompression fallback, data caching on\n" +
                "• threads off, run in background off, explicitly thrown exceptions only\n" +
                "• WebGL 2 only, linear colour space\n• stripping High, engine code stripped, IL2CPP optimized for size\n" +
                "• memory: up to 512 MB\n\nCode optimization (Unity 6: Disk Size with LTO) is set in the build profile.", "OK");
        }

        /// <summary>The settings every Ayvago WebGL build uses (docs/unity/AYVAGO_UNITY_SDK.md §2).</summary>
        public static void ApplySettings()
        {
            PlayerSettings.WebGL.template = TemplateSetting;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.threadsSupport = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.maximumMemorySize = 512;
            PlayerSettings.runInBackground = false;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.High);
            PlayerSettings.SetIl2CppCodeGeneration(NamedBuildTarget.WebGL, Il2CppCodeGeneration.OptimizeSize);
        }

        [MenuItem("Ayvago/Build WebGL…", false, 20)]
        public static void OpenBuildWindow()
        {
            AyvagoBuildWindow.Open();
        }

        [MenuItem("Ayvago/Set Up Claude Code Files", false, 40)]
        public static void SetUpClaudeFiles()
        {
            var docs = Path.Combine(PackageRoot, "Documentation~");
            var claude = Path.Combine(docs, "claude");
            var root = ProjectRoot;
            string note;
            var claudeMd = Path.Combine(root, "CLAUDE.md");
            if (File.Exists(claudeMd))
            {
                File.Copy(Path.Combine(claude, "CLAUDE.md"), Path.Combine(root, "CLAUDE.ayvago.md"), true);
                note = "CLAUDE.md already exists, so the Ayvago one was written to CLAUDE.ayvago.md: merge it into your CLAUDE.md (or import it there with a line \"@CLAUDE.ayvago.md\").";
                Debug.Log("[ayvago] " + note);
            }
            else
            {
                File.Copy(Path.Combine(claude, "CLAUDE.md"), claudeMd, false);
                note = "CLAUDE.md written to the project root.";
            }
            // the skill and the SDK contract it refers to (refreshed from the package every time)
            var skillDir = Path.Combine(root, ".claude", "skills", "ayvago-unity-game");
            Directory.CreateDirectory(skillDir);
            File.Copy(Path.Combine(claude, "skills", "ayvago-unity-game", "SKILL.md"), Path.Combine(skillDir, "SKILL.md"), true);
            File.Copy(Path.Combine(docs, "AYVAGO_UNITY_SDK.md"), Path.Combine(skillDir, "AYVAGO_UNITY_SDK.md"), true);
            EditorUtility.DisplayDialog("Ayvago", note + "\n\nThe skill is in .claude/skills/ayvago-unity-game/ (SKILL.md and the SDK contract AYVAGO_UNITY_SDK.md).", "OK");
        }

        internal static void CopyDirectory(string source, string target)
        {
            Directory.CreateDirectory(target);
            foreach (var file in Directory.GetFiles(source))
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)), true);
            foreach (var dir in Directory.GetDirectories(source))
                CopyDirectory(dir, Path.Combine(target, Path.GetFileName(dir)));
        }

        internal static long DirectorySize(string path)
        {
            if (!Directory.Exists(path)) return 0;
            long total = 0;
            foreach (var f in Directory.GetFiles(path, "*", SearchOption.AllDirectories)) total += new FileInfo(f).Length;
            return total;
        }
    }
}
