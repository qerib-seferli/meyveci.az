using System;
using System.Diagnostics;
using System.IO;

internal static class Program
{
    private const string AppUrl = "https://meyveci.az/index.html?app=exe";

    [STAThread]
    private static void Main()
    {
        try
        {
            var browser = FindBrowser();

            if (!string.IsNullOrWhiteSpace(browser) && File.Exists(browser))
            {
                // EXE üçün ayrıca browser profili istifadə olunur. Beləliklə saytın
                // EXE marker-i adi Edge/Chrome, PWA və telefon sessiyalarına qarışmır.
                var profileDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Meyveci",
                    "DesktopProfile"
                );

                Directory.CreateDirectory(profileDir);

                var arguments =
                    "--user-data-dir=\"" + profileDir + "\" " +
                    "--app=\"" + AppUrl + "\" " +
                    "--start-maximized " +
                    "--no-first-run " +
                    "--no-default-browser-check";

                Process.Start(new ProcessStartInfo
                {
                    FileName = browser,
                    Arguments = arguments,
                    UseShellExecute = false
                });
                return;
            }

            // Windows-da Edge/Chrome yolu tapılmasa belə sayt itmir:
            // sistemin standart brauzerində açılır.
            Process.Start(new ProcessStartInfo
            {
                FileName = AppUrl,
                UseShellExecute = true
            });
        }
        catch
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = AppUrl,
                    UseShellExecute = true
                });
            }
            catch
            {
                // Installer/launcher saytın öz işlək kodlarına təsir etmir.
            }
        }
    }

    private static string FindBrowser()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
        };

        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate))
                return candidate;
        }

        return null;
    }
}
