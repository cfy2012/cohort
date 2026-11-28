using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Cohort
{
    /// <summary>
    /// Cohort 启动器：探测本机地址 → 放行防火墙 → 拉起 PHP 工作进程 → 拉起 Caddy(HTTPS) → 健康检查
    /// 目标 .NET Framework 4.x（Windows 自带），C# 5 语法。
    /// </summary>
    public class Launcher : Form
    {
        // ---------- 常量 ----------
        // 工作进程数按 CPU 核数自动放大：一个班 50 台设备同时提问也能扛住
        static int PhpWorkerCount = CalcWorkerCount();
        const int PhpBasePort    = 8081;   // 8081..8081+N-1
        const int HttpsPort      = 443;
        const int HttpPort       = 8080;
        const string AppName     = "Cohort 课堂";

        static int CalcWorkerCount()
        {
            int cores = Environment.ProcessorCount;
            int n = cores * 3;               // PHP 内置服务器单线程，进程数要压得住并发
            if (n < 8) n = 8;                // 少核机器也别低于 8（够 50 人常规用）
            if (n > 24) n = 24;              // 上限，避免吃光内存
            return n;
        }

        // ---------- 路径 ----------
        static string root;      // D:\Cohort
        static string runtime;   // D:\Cohort\runtime
        static string phpExe;
        static string caddyExe;
        static string webRoot;

        // ---------- 状态 ----------
        static List<Process> children = new List<Process>();
        static string lanIp = "";
        static bool servicesUp = false;
        static bool phpOk = false;
        static volatile bool running = true;
        static volatile bool starting = false;

        // ---------- 作业对象：启动器一死，子进程全部跟着死 ----------
        // 光靠 FormClosing 里 taskkill 不够：任务管理器强杀、崩溃、注销时窗口根本没机会走那个回调，
        // php/caddy 就成了孤儿进程。Windows 作业对象设 KILL_ON_JOB_CLOSE，句柄一关内核直接收尸。
        static IntPtr jobHandle = IntPtr.Zero;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
        const int JobObjectExtendedLimitInformation = 9;

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll")]
        static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpInfo, uint cbInfo);

        [DllImport("kernel32.dll")]
        static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr hObject);

        static void InitJob()
        {
            try
            {
                // 匿名作业对象：不跨进程共用，避免两个启动器互相抢同名作业
                jobHandle = CreateJobObject(IntPtr.Zero, null);
                if (jobHandle == IntPtr.Zero) return;
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation, ref info,
                    (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)));
            }
            catch { jobHandle = IntPtr.Zero; }
        }

        static void AddToJob(Process p)
        {
            if (p == null || jobHandle == IntPtr.Zero) return;
            try { AssignProcessToJobObject(jobHandle, p.Handle); }
            catch { }
        }

        /// <summary>开始服务前先清场：把上一次没退干净的 php / caddy 收掉，免得端口被占</summary>
        static void KillStaleProcesses()
        {
            int killed = 0;
            try
            {
                foreach (Process p in Process.GetProcessesByName("php"))
                {
                    try
                    {
                        if (p.MainModule != null &&
                            string.Equals(p.MainModule.FileName, phpExe, StringComparison.OrdinalIgnoreCase))
                        { p.Kill(); killed++; }
                    }
                    catch { }
                }
            }
            catch { }
            try
            {
                foreach (Process p in Process.GetProcessesByName("caddy"))
                {
                    try
                    {
                        if (p.MainModule != null &&
                            string.Equals(p.MainModule.FileName, caddyExe, StringComparison.OrdinalIgnoreCase))
                        { p.Kill(); killed++; }
                    }
                    catch { }
                }
            }
            catch { }
            if (killed > 0)
            {
                try { File.AppendAllText(Path.Combine(runtime, "logs", "launcher.log"),
                    DateTime.Now.ToString("s") + "  清掉上次残留进程 " + killed + " 个" + Environment.NewLine, Encoding.UTF8); }
                catch { }
            }
        }

        // ---------- 控件 ----------
        Label lblIp, lblAddr, lblSvc, lblAi, lblPhp, lblLogTitle;
        TextBox logBox;
        Button btnStart, btnStop, btnTeacher, btnStudent, btnCopy;

        // ============================================================ 入口

        [STAThread]
        public static void Main(string[] args)
        {
            ResolvePaths();

            // 任何未处理异常都写日志，避免进程悄无声息地消失
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                try
                {
                    Exception ex = e.ExceptionObject as Exception;
                    string msg = ex != null ? ex.ToString() : "unknown";
                    string dir = Path.Combine(runtime, "logs");
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    File.AppendAllText(Path.Combine(dir, "launcher-crash.log"),
                        DateTime.Now.ToString("s") + "  " + msg + Environment.NewLine, Encoding.UTF8);
                }
                catch { }
            };
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e)
            {
                try
                {
                    File.AppendAllText(Path.Combine(runtime, "logs", "launcher-crash.log"),
                        DateTime.Now.ToString("s") + "  UI: " + e.Exception + Environment.NewLine, Encoding.UTF8);
                }
                catch { }
            };

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            InitJob();
            // 进程级兜底：无论走正常关闭还是被强杀，Job 句柄一关子进程就被内核收掉
            AppDomain.CurrentDomain.ProcessExit += delegate { CloseHandle(jobHandle); };

            Application.Run(new Launcher());
        }

        static void ResolvePaths()
        {
            root    = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            runtime = Path.Combine(root, "runtime");
            phpExe  = Path.Combine(runtime, "php\\php.exe");
            caddyExe= Path.Combine(runtime, "caddy\\caddy.exe");
            webRoot = Path.Combine(root, "web\\public");
        }

        // ============================================================ UI

        public Launcher()
        {
            Text = AppName;
            BackColor = Color.FromArgb(14, 16, 19);
            ForeColor = Color.FromArgb(233, 236, 241);
            Font = new Font("Microsoft YaHei UI", 9.75f);
            ClientSize = new Size(780, 620);
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(720, 560);
            FormBorderStyle = FormBorderStyle.Sizable;
            DoubleBuffered = true;

            // ---- 头部 ----
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 92;
            header.Padding = new Padding(28, 22, 28, 0);
            Controls.Add(header);

            Label brand = new Label();
            brand.Text = "◉  " + AppName;
            brand.Font = new Font("Microsoft YaHei UI", 16f, FontStyle.Bold);
            brand.ForeColor = Color.FromArgb(91, 140, 255);
            brand.AutoSize = true;
            brand.Location = new Point(26, 18);
            header.Controls.Add(brand);

            Label sub = new Label();
            sub.Text = "本机课堂服务 · 一键启动 · 学生连同一个 Wi-Fi 即可访问";
            sub.ForeColor = Color.FromArgb(141, 148, 159);
            sub.AutoSize = true;
            sub.Location = new Point(30, 52);
            header.Controls.Add(sub);

            // ---- 地址卡片 ----
            Panel addrCard = MakeCard(24, 104, 732, 116);
            Controls.Add(addrCard);
            addrCard.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;

            Label t1 = MakeCaption("学生访问地址");
            t1.Location = new Point(20, 14);
            addrCard.Controls.Add(t1);

            lblIp = new Label();
            lblIp.Text = "探测中…";
            lblIp.Font = new Font("Consolas", 22f, FontStyle.Bold);
            lblIp.ForeColor = Color.White;
            lblIp.AutoSize = true;
            lblIp.Location = new Point(20, 38);
            addrCard.Controls.Add(lblIp);

            lblAddr = new Label();
            lblAddr.Text = "";
            lblAddr.ForeColor = Color.FromArgb(141, 148, 159);
            lblAddr.Font = new Font("Consolas", 10f);
            lblAddr.AutoSize = true;
            lblAddr.Location = new Point(20, 80);
            addrCard.Controls.Add(lblAddr);

            // ---- 状态卡片 ----
            Panel statusCard = MakeCard(24, 232, 732, 128);
            Controls.Add(statusCard);
            statusCard.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;

            Label t2 = MakeCaption("运行状态");
            t2.Location = new Point(20, 12);
            statusCard.Controls.Add(t2);

            lblSvc = MakeStatusRow(statusCard, 40, "Web 服务");
            lblPhp = MakeStatusRow(statusCard, 68, "PHP 后端");
            lblAi  = MakeStatusRow(statusCard, 96, "AI 引擎（LM Studio:1234）");

            // ---- 按钮 ----
            Panel buttons = new Panel();
            buttons.Location = new Point(24, 372);
            buttons.Size = new Size(732, 46);
            buttons.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(buttons);

            btnStart = MakeButton("启动服务", true, new Point(0, 0));
            btnStart.Click += delegate { StartServices(); };
            buttons.Controls.Add(btnStart);

            btnStop = MakeButton("停止", false, new Point(112, 0));
            btnStop.Click += delegate { StopServices(); };
            buttons.Controls.Add(btnStop);

            btnTeacher = MakeButton("教师控制台", false, new Point(206, 0));
            btnTeacher.Width = 112;
            btnTeacher.Click += delegate { OpenUrl("http://127.0.0.1:" + HttpPort + "/admin"); };
            buttons.Controls.Add(btnTeacher);

            btnStudent = MakeButton("学生端预览", false, new Point(326, 0));
            btnStudent.Width = 112;
            btnStudent.Click += delegate
            {
                if (lanIp == "") { Log("还没探测到本机 IP"); return; }
                OpenUrl("https://" + lanIp + "/");
            };
            buttons.Controls.Add(btnStudent);

            btnCopy = MakeButton("复制地址", false, new Point(446, 0));
            btnCopy.Width = 112;
            btnCopy.Click += delegate
            {
                try { Clipboard.SetText("https://" + lanIp + "/"); Log("地址已复制"); }
                catch { }
            };
            buttons.Controls.Add(btnCopy);

            // ---- 日志 ----
            lblLogTitle = MakeCaption("日志");
            lblLogTitle.Location = new Point(26, 432);
            Controls.Add(lblLogTitle);

            logBox = new TextBox();
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.BackColor = Color.FromArgb(11, 13, 16);
            logBox.ForeColor = Color.FromArgb(141, 148, 159);
            logBox.BorderStyle = BorderStyle.FixedSingle;
            logBox.Font = new Font("Consolas", 9f);
            logBox.Location = new Point(24, 456);
            logBox.Size = new Size(732, 140);
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            Controls.Add(logBox);

            Load += delegate
            {
                DetectIp();
                if (!IsAdmin()) Log("提示：当前不是管理员，防火墙规则可能加不上（右键以管理员身份运行更稳）");
                StartServices();
                StartPolling();
            };
            FormClosing += delegate { running = false; StopServices(); };
        }

        Panel MakeCard(int x, int y, int w, int h)
        {
            Panel p = new Panel();
            p.Location = new Point(x, y);
            p.Size = new Size(w, h);
            p.BackColor = Color.FromArgb(23, 27, 33);
            p.Padding = new Padding(1);
            p.Paint += delegate(object s, PaintEventArgs e)
            {
                Control c = (Control)s;
                e.Graphics.DrawRectangle(new Pen(Color.FromArgb(38, 44, 54)), 0, 0, c.Width - 1, c.Height - 1);
            };
            return p;
        }

        Label MakeCaption(string text)
        {
            Label l = new Label();
            l.Text = text;
            l.ForeColor = Color.FromArgb(94, 101, 114);
            l.AutoSize = true;
            l.Font = new Font("Microsoft YaHei UI", 8.5f);
            return l;
        }

        Label MakeStatusRow(Panel parent, int y, string name)
        {
            Label dot = new Label();
            dot.Text = "●";
            dot.AutoSize = true;
            dot.ForeColor = Color.FromArgb(94, 101, 114);
            dot.Location = new Point(20, y);
            parent.Controls.Add(dot);

            Label nameLb = new Label();
            nameLb.Text = name;
            nameLb.AutoSize = true;
            nameLb.ForeColor = Color.FromArgb(200, 205, 214);
            nameLb.Location = new Point(44, y - 1);
            parent.Controls.Add(nameLb);

            Label val = new Label();
            val.Text = "未启动";
            val.AutoSize = true;
            val.ForeColor = Color.FromArgb(94, 101, 114);
            val.Location = new Point(260, y - 1);
            parent.Controls.Add(val);
            val.Tag = dot;
            return val;
        }

        Button MakeButton(string text, bool primary, Point pos)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = pos;
            b.Size = new Size(104, 38);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = Color.FromArgb(48, 56, 70);
            b.BackColor = primary ? Color.FromArgb(91, 140, 255) : Color.FromArgb(29, 34, 42);
            b.ForeColor = primary ? Color.White : Color.FromArgb(220, 225, 233);
            b.Font = new Font("Microsoft YaHei UI", 9.5f, primary ? FontStyle.Bold : FontStyle.Regular);
            b.Cursor = Cursors.Hand;
            b.UseVisualStyleBackColor = false;
            return b;
        }

        void SetStatus(Label val, bool ok, string text)
        {
            if (InvokeRequired) { BeginInvoke(new Action(delegate { SetStatus(val, ok, text); })); return; }
            val.Text = text;
            val.ForeColor = ok ? Color.FromArgb(55, 211, 153) : Color.FromArgb(141, 148, 159);
            Label dot = (Label)val.Tag;
            if (dot != null) dot.ForeColor = ok ? Color.FromArgb(55, 211, 153) : Color.FromArgb(242, 112, 107);
        }

        // ============================================================ 日志

        void Log(string msg)
        {
            if (InvokeRequired) { BeginInvoke(new Action(delegate { Log(msg); })); return; }
            string line = DateTime.Now.ToString("HH:mm:ss") + "  " + msg + Environment.NewLine;
            logBox.AppendText(line);
        }

        // ============================================================ 网络

        static bool IsAdmin()
        {
            try
            {
                WindowsIdentity id = WindowsIdentity.GetCurrent();
                WindowsPrincipal p = new WindowsPrincipal(id);
                return p.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch { return false; }
        }

        void DetectIp()
        {
            lanIp = PickLanIp();
            lblIp.Text = lanIp == "" ? "未探测到局域网地址" : lanIp;
            lblAddr.Text = lanIp == "" ? "" : "https://" + lanIp + "/　（HTTPS 若被浏览器拦截，可改用 http://" + lanIp + ":" + HttpPort + "/）";
            Log("本机局域网地址：" + (lanIp == "" ? "未找到" : lanIp));
            WriteRuntimeInfo();
        }

        /// <summary>把地址信息写到 runtime/runtime-info.json，供 Web 端显示</summary>
        void WriteRuntimeInfo()
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("{");
                sb.AppendLine("  \"ip\": \"" + lanIp + "\",");
                sb.AppendLine("  \"https_port\": " + HttpsPort + ",");
                sb.AppendLine("  \"http_port\": " + HttpPort + ",");
                sb.AppendLine("  \"lan_url\": \"https://" + lanIp + "/\",");
                sb.AppendLine("  \"lan_url_http\": \"http://" + lanIp + ":" + HttpPort + "/\",");
                sb.AppendLine("  \"updated_at\": \"" + DateTime.Now.ToString("s") + "\"");
                sb.AppendLine("}");
                File.WriteAllText(Path.Combine(runtime, "runtime-info.json"), sb.ToString(), new UTF8Encoding(false));
            }
            catch { }
        }

        static string PickLanIp()
        {
            string best = "";
            int bestScore = -1;
            NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces();
            foreach (NetworkInterface nic in nics)
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                IPInterfaceProperties props = nic.GetIPProperties();

                bool hasGateway = false;
                foreach (GatewayIPAddressInformation g in props.GatewayAddresses)
                {
                    if (g.Address == null) continue;
                    string ga = g.Address.ToString();
                    if (ga.StartsWith("0.0.0.0")) continue;
                    hasGateway = true;
                    break;
                }

                int score = 0;
                if (hasGateway) score += 10;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet) score += 6;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) score += 4;
                string name = nic.Name.ToLower();
                if (name.Contains("vethernet") || name.Contains("virtual") || name.Contains("vmware") || name.Contains("hyper-v")) score -= 8;

                foreach (UnicastIPAddressInformation u in props.UnicastAddresses)
                {
                    if (u.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    string ip = u.Address.ToString();
                    if (ip.StartsWith("169.254")) continue;
                    if (ip.StartsWith("127.")) continue;
                    if (score > bestScore) { bestScore = score; best = ip; }
                }
            }
            return best;
        }

        void EnsureFirewall()
        {
            if (!IsAdmin()) return;
            AddRule("Cohort HTTPS " + HttpsPort, HttpsPort);
            AddRule("Cohort HTTP " + HttpPort, HttpPort);
        }

        static void AddRule(string name, int port)
        {
            try
            {
                RunHidden("netsh", new string[] {
                    "advfirewall", "firewall", "add", "rule",
                    "name=" + name, "dir=in", "action=allow",
                    "protocol=TCP", "localport=" + port, "profile=any"
                }, 4000);
            }
            catch { }
        }

        static string RunHidden(string exe, string[] args, int timeoutMs)
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = exe;
            psi.Arguments = JoinArgs(args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            Process p = Process.Start(psi);
            if (p == null) return "";
            string output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
            if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } }
            return output;
        }

        static string JoinArgs(string[] args)
        {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < args.Length; i++)
            {
                if (i > 0) sb.Append(' ');
                string a = args[i];
                if (a.IndexOf(' ') >= 0) sb.Append('"').Append(a).Append('"');
                else sb.Append(a);
            }
            return sb.ToString();
        }

        // ============================================================ 进程

        void StartServices()
        {
            // starting 防抖：启动过程中再点一次「启动服务」不会又拉起一轮 php 工作进程
            if (servicesUp || starting) return;
            starting = true;
            btnStart.Enabled = false;
            Thread t = new Thread(delegate()
            {
                try
                {
                    KillStaleProcesses();
                    DetectIp();
                    EnsureFirewall();
                    EnsureCert();
                    StartPhpWorkers();
                    EnsureLmStudio();
                    WriteCaddyfile();
                    StartCaddy();
                    WaitHealthy();
                }
                catch (Exception ex)
                {
                    Log("启动失败：" + ex.Message);
                }
                finally { starting = false; }
                SetStatus(lblSvc, servicesUp, servicesUp ? "运行中 · " + lanIp : "未启动");
                SetStatus(lblPhp, phpOk, phpOk ? PhpWorkerCount + " 个工作进程" : "未启动");
                btnStart.Enabled = true;
            });
            t.IsBackground = true;
            t.Start();
        }

        void StartPhpWorkers()
        {
            if (!File.Exists(phpExe)) { Log("找不到 php.exe：" + phpExe); return; }

            string router = Path.Combine(webRoot, "router.php");
            for (int i = 0; i < PhpWorkerCount; i++)
            {
                int port = PhpBasePort + i;
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = phpExe;
                psi.Arguments = "-S 127.0.0.1:" + port + " -t \"" + webRoot + "\" \"" + router + "\"";
                psi.WorkingDirectory = webRoot;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.EnvironmentVariables["PHP_INI_SCAN_DIR"] = "";
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;

                Process p = new Process();
                p.StartInfo = psi;
                p.EnableRaisingEvents = false;
                p.Start();
                children.Add(p);
                AddToJob(p);

                // 输出落盘，避免管道缓冲阻塞
                RedirectTo(p, Path.Combine(runtime, "logs", "php-" + port + ".log"));
            }
            Thread.Sleep(1200);
            phpOk = true;
            Log("PHP 工作进程已启动：" + PhpBasePort + "~" + (PhpBasePort + PhpWorkerCount - 1));
        }

        /// <summary>AI 引擎：如果本机装了 LM Studio，就顺手把它的本地服务拉起来（老师不用自己点）</summary>
        void EnsureLmStudio()
        {
            try
            {
                string lms = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".lmstudio", "bin", "lms.exe");
                if (!File.Exists(lms))
                {
                    Log("没检测到 LM Studio（lms.exe），AI 对话暂时用不了；可以在控制台「AI 引擎」页按提示处理");
                    return;
                }

                string st = RunHidden(lms, new string[] { "server", "status" }, 8000);
                if (st.IndexOf("running on port", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    Log("AI 服务已在运行（LM Studio 1234）");
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = lms;
                psi.Arguments = "server start --port 1234";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                Process p = Process.Start(psi);
                if (p != null)
                {
                    children.Add(p);
                    AddToJob(p);
                    RedirectTo(p, Path.Combine(runtime, "logs", "lmstudio.log"));
                }
                Log("正在后台启动 AI 服务（LM Studio 1234），首次启动稍慢");
            }
            catch (Exception ex)
            {
                Log("AI 服务启动出错：" + ex.Message);
            }
        }

        void RedirectTo(Process p, string logPath)
        {
            try
            {
                string dir = Path.GetDirectoryName(logPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            }
            catch { return; }

            string path = logPath;
            Process proc = p;
            StreamWriter w;
            try { w = new StreamWriter(path, true, Encoding.UTF8); }
            catch { return; }
            object gate = new object();

            Thread so = new Thread(delegate()
            {
                try
                {
                    while (running)
                    {
                        string line = proc.StandardOutput.ReadLine();
                        if (line == null) { Thread.Sleep(60); continue; }
                        lock (gate) { try { w.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " " + line); w.Flush(); } catch { } }
                    }
                }
                catch { }
            });
            so.IsBackground = true;
            so.Start();

            Thread se = new Thread(delegate()
            {
                try
                {
                    while (running)
                    {
                        string line = proc.StandardError.ReadLine();
                        if (line == null) { Thread.Sleep(60); continue; }
                        lock (gate) { try { w.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " " + line); w.Flush(); } catch { } }
                    }
                }
                catch { }
            });
            se.IsBackground = true;
            se.Start();
        }

        /// <summary>
        /// 第一次启动时用 PHP 的 openssl 生成一张自签证书，交给 Caddy 用。
        /// 刻意不安装到系统信任库：学生端首次访问点一次“继续访问”即可。
        /// </summary>
        void EnsureCert()
        {
            string certFile = Path.Combine(runtime, "certs", "server.pem");
            string keyFile  = Path.Combine(runtime, "certs", "server.key");
            if (File.Exists(certFile) && File.Exists(keyFile)) return;

            // 全新安装时 certs 目录还不存在，make-cert.php 直接写文件会失败，必须先建好
            try { Directory.CreateDirectory(Path.Combine(runtime, "certs")); }
            catch (Exception ex) { Log("创建证书目录失败：" + ex.Message); return; }

            string tool = Path.Combine(runtime, "tools", "make-cert.php");
            if (!File.Exists(tool) || !File.Exists(phpExe)) { Log("证书生成工具缺失，将退化为 HTTP"); return; }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = phpExe;
            psi.Arguments = "\"" + tool + "\" \"" + certFile + "\" \"" + keyFile + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.EnvironmentVariables["OPENSSL_CONF"] = Path.Combine(runtime, "php", "extras", "ssl", "openssl.cnf");

            try
            {
                Process p = Process.Start(psi);
                p.WaitForExit(15000);
                if (File.Exists(certFile)) Log("已生成自签证书");
                else Log("证书生成失败");
            }
            catch (Exception ex) { Log("证书生成异常：" + ex.Message); }
        }

        void WriteCaddyfile()
        {
            string[] upstreams = new string[PhpWorkerCount];
            for (int i = 0; i < PhpWorkerCount; i++) upstreams[i] = "127.0.0.1:" + (PhpBasePort + i);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("\tadmin off");
            sb.AppendLine("\tauto_https disable_redirects");
            sb.AppendLine("\tlog {");
            sb.AppendLine("\t\toutput file \"" + Path.Combine(runtime, "logs", "caddy.log").Replace("\\", "/") + "\" {");
            sb.AppendLine("\t\t\troll_size 5mb");
            sb.AppendLine("\t\t\troll_keep 3");
            sb.AppendLine("\t\t}");
            sb.AppendLine("\t\tlevel INFO");
            sb.AppendLine("\t}");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine("https://:" + HttpsPort + " {");
            sb.AppendLine("\ttls \"" + Path.Combine(runtime, "certs", "server.pem").Replace("\\", "/") + "\" \"" + Path.Combine(runtime, "certs", "server.key").Replace("\\", "/") + "\"");
            sb.AppendLine("\tencode gzip zstd");
            sb.AppendLine("\thandle /assets/* {");
            sb.AppendLine("\t\troot * \"" + Path.Combine(root, "web", "public").Replace("\\", "/") + "\"");
            sb.AppendLine("\t\tfile_server");
            sb.AppendLine("\t}");
            sb.AppendLine("\thandle {");
            sb.AppendLine("\t\treverse_proxy " + string.Join(" ", upstreams) + " {");
            sb.AppendLine("\t\t\tlb_policy round_robin");
            sb.AppendLine("\t\t}");
            sb.AppendLine("\t}");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine("http://:" + HttpPort + " {");
            sb.AppendLine("\thandle /assets/* {");
            sb.AppendLine("\t\troot * \"" + Path.Combine(root, "web", "public").Replace("\\", "/") + "\"");
            sb.AppendLine("\t\tfile_server");
            sb.AppendLine("\t}");
            sb.AppendLine("\thandle {");
            sb.AppendLine("\t\treverse_proxy " + string.Join(" ", upstreams) + " {");
            sb.AppendLine("\t\t\tlb_policy round_robin");
            sb.AppendLine("\t\t}");
            sb.AppendLine("\t}");
            sb.AppendLine("}");

            string path = Path.Combine(runtime, "Caddyfile");
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
            Log("Caddyfile 已生成");
        }

        void StartCaddy()
        {
            if (!File.Exists(caddyExe)) { Log("找不到 caddy.exe：" + caddyExe); return; }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = caddyExe;
            psi.Arguments = "run --config \"" + Path.Combine(runtime, "Caddyfile") + "\" --adapter caddyfile";
            psi.WorkingDirectory = runtime;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;

            Process p = new Process();
            p.StartInfo = psi;
            p.Start();
            children.Add(p);
            AddToJob(p);
            RedirectTo(p, Path.Combine(runtime, "logs", "caddy-console.log"));
            Log("Caddy 已启动（HTTPS " + HttpsPort + " / HTTP " + HttpPort + "）");
        }

        void WaitHealthy()
        {
            for (int i = 0; i < 40; i++)
            {
                if (!running) return;
                if (Ping("http://127.0.0.1:" + HttpPort + "/api/ping")) { servicesUp = true; Log("健康检查通过，服务已就绪"); return; }
                Thread.Sleep(700);
            }
            Log("健康检查未通过，请看 runtime/logs 下的日志");
        }

        static bool Ping(string url)
        {
            try
            {
                WebClient wc = new WebClient();
                wc.Encoding = Encoding.UTF8;
                string s = wc.DownloadString(url);
                return s.IndexOf("\"ok\": true", StringComparison.Ordinal) >= 0 || s.IndexOf("\"ok\":true", StringComparison.Ordinal) >= 0;
            }
            catch { return false; }
        }

        void StopServices()
        {
            // 复制一份再遍历：子进程退出事件会同时改动 children，直接 foreach 会抛"集合已修改"
            Process[] snapshot;
            try { snapshot = children.ToArray(); } catch { snapshot = new Process[0]; }
            foreach (Process p in snapshot)
            {
                try { if (!p.HasExited) { KillTree(p.Id); } }
                catch { }
            }
            children.Clear();
            servicesUp = false;
            phpOk = false;
            starting = false;
            // 兜底扫一遍：间接拉起的进程（caddy 的子进程、漏登记的）也一并收掉
            KillStaleProcesses();
        }

        static void KillTree(int pid)
        {
            try
            {
                RunHidden("taskkill", new string[] { "/PID", pid.ToString(), "/T", "/F" }, 3000);
            }
            catch { }
        }

        // ============================================================ 轮询

        void StartPolling()
        {
            Thread t = new Thread(delegate()
            {
                while (running)
                {
                    try
                    {
                        string status = GetStatusJson();
                        bool aiOn = status.IndexOf("\"ok\": true") >= 0 && status.IndexOf("\"ai\": {") >= 0 && ExtractBool(status, "ai");
                        SetStatus(lblSvc, servicesUp, servicesUp ? "运行中 · " + lanIp : "未启动");
                        SetStatus(lblPhp, phpOk, phpOk ? PhpWorkerCount + " 个工作进程" : "未启动");
                        SetStatus(lblAi, aiOn, aiOn ? "已连接" : "未连接（打开 LM Studio 启动服务）");
                    }
                    catch { }
                    Thread.Sleep(4000);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        static string GetStatusJson()
        {
            try
            {
                WebClient wc = new WebClient();
                wc.Encoding = Encoding.UTF8;
                return wc.DownloadString("http://127.0.0.1:" + HttpPort + "/api/status");
            }
            catch { return ""; }
        }

        static bool ExtractBool(string json, string key)
        {
            int i = json.IndexOf("\"" + key + "\"");
            if (i < 0) return false;
            int colon = json.IndexOf(':', i);
            if (colon < 0) return false;
            string rest = json.Substring(colon + 1, Math.Min(20, json.Length - colon - 1)).Trim();
            return rest.StartsWith("true");
        }

        // ============================================================ 打开浏览器

        void OpenUrl(string url)
        {
            try
            {
                string edge = FindEdge();
                if (edge != "")
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = edge;
                    // 独立浏览器配置：不和老师平时的浏览器共用缩放/插件，页面永远 100%
                    string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CohortShell");
                    psi.Arguments = "--app=" + url + " --user-data-dir=\"" + profile + "\" --window-size=1500,950";
                    Process.Start(psi);
                }
                else
                {
                    ProcessStartInfo psi = new ProcessStartInfo(url);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                }
                Log("已打开：" + url);
            }
            catch (Exception ex) { Log("打开浏览器失败：" + ex.Message); }
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
    }
}
