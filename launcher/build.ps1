# 编译两个软件：教师端 Cohort.exe、学生端 CohortStudent.exe
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
$root = Split-Path -Parent $PSScriptRoot

& $csc /nologo /target:winexe /out:"$root\Cohort.exe" `
  /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll `
  /optimize "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -eq 0) { "教师端编译完成：$root\Cohort.exe" } else { "教师端编译失败" }

& $csc /nologo /target:winexe /out:"$root\CohortStudent.exe" `
  /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll `
  /optimize "$root\student\StudentClient.cs"
if ($LASTEXITCODE -eq 0) { "学生端编译完成：$root\CohortStudent.exe" } else { "学生端编译失败" }
