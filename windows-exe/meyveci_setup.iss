#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#define MyAppName "Meyveci.az"
#define MyAppPublisher "MAREHO MMC"
#define MyAppExeName "Meyveci.exe"

[Setup]
AppId={{5C7B1D5A-67AD-4A8C-A21C-72F777E7A31B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://meyveci.az
AppSupportURL=https://meyveci.az
DefaultDirName={localappdata}\Programs\Meyveci
DefaultGroupName=Meyveci.az
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=MeyveciSetup
SetupIconFile=meyveci.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Files]
Source: "Meyveci.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Meyveci.az"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\Meyveci.az"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Meyveci.az tətbiqini aç"; Flags: nowait postinstall skipifsilent
