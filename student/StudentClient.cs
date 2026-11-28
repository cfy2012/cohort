using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

namespace CohortStudent
{
    /// <summary>
    /// Cohort 学生端：一个小窗口，填服务器地址 / 学号 / 姓名，点进入课堂。
    /// 用 Edge 的应用模式打开唯一的学生页面（没有地址栏、没有页签），自己记上次填过的信息。
    /// 目标 .NET Framework 4.x，C# 5 语法。
    /// </summary>
    public class StudentApp : Form
    {
        const string AppName = "Cohort 学生端";

        TextBox txtServer, txtNo, txtName;
        Button btnGo, btnTest;
        Label lblState;
        static string cfgPath;

        public StudentApp()
        {
            Text = AppName;
            ClientSize = new Size(430, 320);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(20, 23, 28);
            ForeColor = Color.FromArgb(233, 236, 241);
            Font = new Font("Microsoft YaHei UI", 9.5f);

            cfgPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "CohortStudent", "config.txt");

            Label title = new Label();
            title.Text = "进入课堂";
            title.Font = new Font("Microsoft YaHei UI", 17f, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(24, 18);
            Controls.Add(title);

            Label sub = new Label();
            sub.Text = "老师给的地址 + 你的学号姓名，填一次以后会自动记住";
            sub.ForeColor = Color.FromArgb(141, 148, 159);
            sub.AutoSize = true;
            sub.Location = new Point(26, 56);
            Controls.Add(sub);

            Controls.Add(MakeLabel("服务器地址", 26, 90));
            txtServer = MakeBox(26, 112, 378);
            txtServer.Text = "http://192.168.10.107:8080";
            Controls.Add(txtServer);

            Controls.Add(MakeLabel("学号", 26, 152));
            txtNo = MakeBox(26, 174, 180);
            Controls.Add(txtNo);

            Controls.Add(MakeLabel("姓名", 226, 152));
            txtName = MakeBox(226, 174, 178);
            Controls.Add(txtName);

            btnTest = MakeButton("测试连接", 26, 214, 110);
            btnTest.Click += delegate { TestServer(); };
            Controls.Add(btnTest);

            btnGo = MakeButton("进入课堂", 146, 214, 150);
            btnGo.BackColor = Color.FromArgb(47, 107, 255);
            btnGo.ForeColor = Color.White;
            btnGo.FlatAppearance.BorderSize = 0;
            btnGo.Click += delegate { EnterClass(); };
            Controls.Add(btnGo);

            lblState = new Label();
            lblState.Text = "";
            lblState.ForeColor = Color.FromArgb(141, 148, 159);
            lblState.AutoSize = false;
            lblState.Size = new Size(378, 40);
            lblState.Location = new Point(26, 254);
            Controls.Add(lblState);

            LoadConfig();
        }

        Label MakeLabel(string text, int x, int y)
        {
            Label l = new Label();
            l.Text = text;
            l.ForeColor = Color.FromArgb(141, 148, 159);
            l.AutoSize = true;
            l.Location = new Point(x, y);
            return l;
        }

        TextBox MakeBox(int x, int y, int w)
        {
            TextBox t = new TextBox();
            t.Location = new Point(x, y);
            t.Width = w;
            t.BorderStyle = BorderStyle.FixedSingle;
            t.BackColor = Color.FromArgb(29, 34, 42);
            t.ForeColor = Color.FromArgb(233, 236, 241);
            return t;
        }

        Button MakeButton(string text, int x, int y, int w)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = new Point(x, y);
            b.Width = w;
            b.Height = 34;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderColor = Color.FromArgb(70, 78, 92);
            b.BackColor = Color.FromArgb(29, 34, 42);
            b.ForeColor = Color.FromArgb(233, 236, 241);
            return b;
        }

        // ------------------------------------------------ 配置

        void LoadConfig()
        {
            try
            {
                if (!File.Exists(cfgPath)) return;
                string[] lines = File.ReadAllLines(cfgPath, Encoding.UTF8);
                if (lines.Length > 0 && lines[0].Trim() != "") txtServer.Text = lines[0].Trim();
                if (lines.Length > 1) txtNo.Text = lines[1].Trim();
                if (lines.Length > 2) txtName.Text = lines[2].Trim();
            }
            catch { }
        }

        void SaveConfig()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(cfgPath));
                File.WriteAllLines(cfgPath, new string[] {
                    txtServer.Text.Trim(), txtNo.Text.Trim(), txtName.Text.Trim()
                }, Encoding.UTF8);
            }
            catch { }
        }

        // ------------------------------------------------ 动作

        string BaseUrl()
        {
            string s = txtServer.Text.Trim();
            if (!s.StartsWith("http://") && !s.StartsWith("https://")) s = "http://" + s;
            if (!s.StartsWith("http://127.0.0.1") && !s.StartsWith("https://127.0.0.1") && s.IndexOf(':') < 0)
                s += ":8080";
            return s.TrimEnd('/');
        }

        void SetState(string text, Color color)
        {
            lblState.Text = text;
            lblState.ForeColor = color;
        }

        void TestServer()
        {
            btnTest.Enabled = false;
            SetState("连接中…", Color.FromArgb(141, 148, 159));
            try
            {
                WebClient wc = new WebClient();
                wc.Encoding = Encoding.UTF8;
                wc.Headers.Add("User-Agent", "CohortStudent");
                string s = wc.DownloadString(BaseUrl() + "/api/ping");
                bool ok = s != null && s.IndexOf("\"ok\": true") >= 0;
                if (ok) SetState("连接正常，可以进了", Color.FromArgb(55, 211, 153));
                else SetState("有响应但不像 Cohort 服务，检查地址", Color.FromArgb(240, 181, 72));
            }
            catch (Exception ex)
            {
                SetState("连不上：" + ex.Message + "\n确认连的是同一个 Wi-Fi、地址没打错", Color.FromArgb(242, 112, 107));
            }
            btnTest.Enabled = true;
        }

        void EnterClass()
        {
            if (txtNo.Text.Trim() == "" || txtName.Text.Trim() == "")
            {
                SetState("学号和姓名都要填", Color.FromArgb(242, 112, 107));
                return;
            }
            SaveConfig();

            string url = BaseUrl() + "/?no=" + Uri.EscapeDataString(txtNo.Text.Trim())
                       + "&name=" + Uri.EscapeDataString(txtName.Text.Trim());
            try
            {
                string edge = FindEdge();
                if (edge != "")
                {
                    System.Diagnostics.ProcessStartInfo psi = new System.Diagnostics.ProcessStartInfo();
                    psi.FileName = edge;
                    // 独立配置目录：不受浏览器原有缩放影响，打开就是 100%
                    string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CohortShellStudent");
                    psi.Arguments = "--app=" + url + " --user-data-dir=\"" + profile + "\" --window-size=1180,860";
                    System.Diagnostics.Process.Start(psi);
                    SetState("已打开课堂窗口", Color.FromArgb(55, 211, 153));
                    // 课堂窗口已经交给 Edge，本进程没必要继续留在后台（否则关掉窗口还留一个隐形进程）
                    Close();
                    return;
                }
                System.Diagnostics.ProcessStartInfo psi2 = new System.Diagnostics.ProcessStartInfo(url);
                psi2.UseShellExecute = true;
                System.Diagnostics.Process.Start(psi2);
                SetState("已用默认浏览器打开", Color.FromArgb(55, 211, 153));
            }
            catch (Exception ex)
            {
                SetState("打开失败：" + ex.Message, Color.FromArgb(242, 112, 107));
            }
        }

        static string FindEdge()
        {
            string[] paths = new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe")
            };
            foreach (string p in paths) if (File.Exists(p)) return p;
            return "";
        }

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new StudentApp());
        }
    }
}
