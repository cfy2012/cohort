using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

namespace CohortSetup
{
    /// <summary>
    /// Cohort 安装器：把随包携带的 zip（编译进 exe 的资源）解到目标目录，建桌面快捷方式，然后启动。
    /// 编译时用 /define:TEACHER 或 /define:STUDENT 区分教师端 / 学生端。
    /// </summary>
    public class Setup
    {
        [STAThread]
        public static void Main(string[] args)
        {
#if TEACHER
            string productName = "Cohort 讲台";
            string exeName     = "Cohort.exe";
            string preferDir   = @"C:\Cohort";
#else
            string productName = "Cohort 学生端";
            string exeName     = "CohortStudent.exe";
            string preferDir   = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "CohortStudent");
#endif

            try
            {
                string target = preferDir;
                if (args.Length > 0 && Directory.Exists(args[0])) target = args[0];   // 便于自定义/自测目录
                try
                {
                    if (!Directory.Exists(target)) Directory.CreateDirectory(target);
                    File.WriteAllText(Path.Combine(target, ".probe"), "x");
                    File.Delete(Path.Combine(target, ".probe"));
                }
                catch
                {
                    // 没权限（比如 Program Files）就退到当前用户目录
                    target = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CohortStudent");
                    Directory.CreateDirectory(target);
                }

                string zipPath = Path.Combine(Path.GetTempPath(), "cohort_payload_" + Guid.NewGuid().ToString("N") + ".zip");
                ExtractResource("payload", zipPath);

                using (ZipArchive zip = ZipFile.OpenRead(zipPath))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        string dest = Path.Combine(target, entry.FullName);
                        if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(dest); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        if (File.Exists(dest)) File.Delete(dest);
                        entry.ExtractToFile(dest, true);
                    }
                }
                try { File.Delete(zipPath); } catch { }

                MakeShortcut(target, exeName, productName);

                string exe = Path.Combine(target, exeName);
                if (File.Exists(exe))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exe);
                    psi.WorkingDirectory = target;
                    Process.Start(psi);
                }

                MessageBox.Show("安装完成：" + target + "\n桌面已创建快捷方式。", productName,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("安装失败：" + ex.Message, productName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void ExtractResource(string name, string outPath)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(name))
            {
                if (s == null) throw new Exception("安装包损坏：找不到内部数据");
                using (FileStream f = new FileStream(outPath, FileMode.Create, FileAccess.Write))
                {
                    byte[] buf = new byte[81920];
                    int n;
                    while ((n = s.Read(buf, 0, buf.Length)) > 0) f.Write(buf, 0, n);
                }
            }
        }

        static void MakeShortcut(string targetDir, string exeName, string productName)
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string link = Path.Combine(desktop, productName + ".lnk");
                Type t = Type.GetTypeFromProgID("WScript.Shell");
                object shell = Activator.CreateInstance(t);
                object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { link });
                Type sct = sc.GetType();
                sct.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { Path.Combine(targetDir, exeName) });
                sct.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { targetDir });
                sct.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { Path.Combine(targetDir, exeName) + ",0" });
                sct.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            }
            catch { }
        }
    }
}
