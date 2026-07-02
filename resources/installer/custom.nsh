; custom.nsh — electron-builder NSIS custom hooks for by-claw-nanobot
;
; Features:
;   1. Default install path: C:\Program Files (x86)\ByNanobot\by-claw-nanobot
;   2. Startup auto-launch checkbox after directory page
;   3. Multi-language support

!include "MUI2.nsh"
!include "nsDialogs.nsh"

; ─── Installer-only global variables ─────────────────────────────────────────
!ifndef BUILD_UNINSTALLER

Var StartupCheckbox
Var RunAtStartup

Function StartupOptionsPage
  !insertmacro MUI_HEADER_TEXT "$(StartupPageTitle)" "$(StartupPageSubtitle)"
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 10u 100% 12u "$(StartupCheckboxLabel)"
  Pop $StartupCheckbox
  ${NSD_SetState} $StartupCheckbox ${BST_UNCHECKED}
  nsDialogs::Show
FunctionEnd

Function StartupOptionsLeave
  ${NSD_GetState} $StartupCheckbox $RunAtStartup
FunctionEnd

!endif ; BUILD_UNINSTALLER

; ─── Language strings ────────────────────────────────────────────────────────
!macro customHeader
  !pragma warning disable 6040
  !pragma warning disable 7025

  LangString StartupPageTitle     ${LANG_ENGLISH}             "Startup Options"
  LangString StartupPageSubtitle  ${LANG_ENGLISH}             "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_ENGLISH}             "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_SIMPCHINESE}         "启动选项"
  LangString StartupPageSubtitle  ${LANG_SIMPCHINESE}         "配置 by-claw-nanobot 随 Windows 启动的方式"
  LangString StartupCheckboxLabel ${LANG_SIMPCHINESE}         "Windows 启动时自动运行 by-claw-nanobot"

  LangString StartupPageTitle     ${LANG_TRADCHINESE}         "啟動選項"
  LangString StartupPageSubtitle  ${LANG_TRADCHINESE}         "設定 by-claw-nanobot 隨 Windows 啟動的方式"
  LangString StartupCheckboxLabel ${LANG_TRADCHINESE}         "Windows 啟動時自動執行 by-claw-nanobot"

  LangString StartupPageTitle     ${LANG_JAPANESE}            "起動オプション"
  LangString StartupPageSubtitle  ${LANG_JAPANESE}            "by-claw-nanobot の Windows 起動設定"
  LangString StartupCheckboxLabel ${LANG_JAPANESE}            "Windows 起動時に by-claw-nanobot を自動的に起動する"

  LangString StartupPageTitle     ${LANG_GERMAN}              "Startoptionen"
  LangString StartupPageSubtitle  ${LANG_GERMAN}              "Konfigurieren Sie den Windows-Autostart von by-claw-nanobot"
  LangString StartupCheckboxLabel ${LANG_GERMAN}              "by-claw-nanobot beim Windows-Start automatisch starten"

  LangString StartupPageTitle     ${LANG_FRENCH}              "Options de démarrage"
  LangString StartupPageSubtitle  ${LANG_FRENCH}              "Configurer le démarrage automatique de by-claw-nanobot"
  LangString StartupCheckboxLabel ${LANG_FRENCH}              "Lancer by-claw-nanobot automatiquement au démarrage de Windows"

  LangString StartupPageTitle     ${LANG_KOREAN}              "시작 옵션"
  LangString StartupPageSubtitle  ${LANG_KOREAN}              "Windows에서 by-claw-nanobot 시작 방식 구성"
  LangString StartupCheckboxLabel ${LANG_KOREAN}              "Windows 시작 시 by-claw-nanobot 자동 실행"

  LangString StartupPageTitle     ${LANG_RUSSIAN}             "Параметры запуска"
  LangString StartupPageSubtitle  ${LANG_RUSSIAN}             "Настройка автозапуска by-claw-nanobot"
  LangString StartupCheckboxLabel ${LANG_RUSSIAN}             "Запускать by-claw-nanobot автоматически при старте Windows"

  LangString StartupPageTitle     ${LANG_SPANISHINTERNATIONAL} "Opciones de inicio"
  LangString StartupPageSubtitle  ${LANG_SPANISHINTERNATIONAL} "Configurar el inicio automático de by-claw-nanobot"
  LangString StartupCheckboxLabel ${LANG_SPANISHINTERNATIONAL} "Iniciar by-claw-nanobot automáticamente al arrancar Windows"

  LangString StartupPageTitle     ${LANG_TURKISH}             "Başlangıç Seçenekleri"
  LangString StartupPageSubtitle  ${LANG_TURKISH}             "by-claw-nanobot Windows başlangıç ayarlarını yapılandırın"
  LangString StartupCheckboxLabel ${LANG_TURKISH}             "Windows başladığında by-claw-nanobot'ı otomatik başlat"

  ; Remaining languages use English fallback
  LangString StartupPageTitle     ${LANG_ITALIAN}             "Startup Options"
  LangString StartupPageSubtitle  ${LANG_ITALIAN}             "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_ITALIAN}             "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_DUTCH}               "Startup Options"
  LangString StartupPageSubtitle  ${LANG_DUTCH}               "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_DUTCH}               "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_DANISH}              "Startup Options"
  LangString StartupPageSubtitle  ${LANG_DANISH}              "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_DANISH}              "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_SWEDISH}             "Startup Options"
  LangString StartupPageSubtitle  ${LANG_SWEDISH}             "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_SWEDISH}             "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_NORWEGIAN}           "Startup Options"
  LangString StartupPageSubtitle  ${LANG_NORWEGIAN}           "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_NORWEGIAN}           "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_FINNISH}             "Startup Options"
  LangString StartupPageSubtitle  ${LANG_FINNISH}             "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_FINNISH}             "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_PORTUGUESE}          "Startup Options"
  LangString StartupPageSubtitle  ${LANG_PORTUGUESE}          "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_PORTUGUESE}          "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_PORTUGUESEBR}        "Startup Options"
  LangString StartupPageSubtitle  ${LANG_PORTUGUESEBR}        "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_PORTUGUESEBR}        "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_POLISH}              "Startup Options"
  LangString StartupPageSubtitle  ${LANG_POLISH}              "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_POLISH}              "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_UKRAINIAN}           "Startup Options"
  LangString StartupPageSubtitle  ${LANG_UKRAINIAN}           "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_UKRAINIAN}           "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_CZECH}               "Startup Options"
  LangString StartupPageSubtitle  ${LANG_CZECH}               "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_CZECH}               "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_SLOVAK}              "Startup Options"
  LangString StartupPageSubtitle  ${LANG_SLOVAK}              "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_SLOVAK}              "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_HUNGARIAN}           "Startup Options"
  LangString StartupPageSubtitle  ${LANG_HUNGARIAN}           "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_HUNGARIAN}           "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_ARABIC}              "Startup Options"
  LangString StartupPageSubtitle  ${LANG_ARABIC}              "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_ARABIC}              "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_THAI}                "Startup Options"
  LangString StartupPageSubtitle  ${LANG_THAI}                "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_THAI}                "Launch by-claw-nanobot automatically when Windows starts"

  LangString StartupPageTitle     ${LANG_VIETNAMESE}          "Startup Options"
  LangString StartupPageSubtitle  ${LANG_VIETNAMESE}          "Configure how by-claw-nanobot starts with Windows"
  LangString StartupCheckboxLabel ${LANG_VIETNAMESE}          "Launch by-claw-nanobot automatically when Windows starts"

  !pragma warning error 6040
!macroend

; ─── Insert startup options page after directory selection ───────────────────
!macro customPageAfterChangeDir
  Page custom StartupOptionsPage StartupOptionsLeave
!macroend

; ─── Fix default install path ────────────────────────────────────────────────
!macro customInit
  ReadRegStr $R0 HKLM "Software\com.byclaw.nanobot" "InstallLocation"
  ${If} $R0 == ""
    StrCpy $INSTDIR "$PROGRAMFILES32\ByNanobot\by-claw-nanobot"
  ${EndIf}
!macroend

; ─── Install: nanobot bundle unpack + Python install + auto-start ────────────
!macro customInstall
  ; Unpack nanobot bundle if present (zip-based)
  IfFileExists "$INSTDIR\resources\nanobot-bundle\nanobot_manifest.json" nanobot_already_unpacked 0
  IfFileExists "$INSTDIR\resources\nanobot-bundle\*.zip" 0 nanobot_done

    ; Use PowerShell to extract the nanobot zip
    nsExec::ExecToLog 'powershell -NoProfile -Command "Expand-Archive -LiteralPath ''$INSTDIR\resources\nanobot-bundle\nanobot.zip'' -DestinationPath ''$INSTDIR\resources\nanobot-bundle'' -Force"'
    Delete "$INSTDIR\resources\nanobot-bundle\nanobot.zip"
    Goto nanobot_done

  nanobot_already_unpacked:
  nanobot_done:

  ; Install Python embedded distribution if present
  IfFileExists "$INSTDIR\resources\python\python.zip" 0 python_done
    nsExec::ExecToLog 'powershell -NoProfile -Command "Expand-Archive -LiteralPath ''$INSTDIR\resources\python\python.zip'' -DestinationPath ''$INSTDIR\resources\python'' -Force"'
    Delete "$INSTDIR\resources\python\python.zip"
  python_done:

  ${If} $RunAtStartup == ${BST_CHECKED}
    WriteRegStr HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Run" \
      "by-claw-nanobot" \
      '"$INSTDIR\by-claw-nanobot.exe"'
  ${Else}
    DeleteRegValue HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Run" \
      "by-claw-nanobot"
  ${EndIf}
!macroend

; ─── Uninstall: kill processes before removing files ─────────────────────────
!macro customUnInit
  nsExec::ExecToLog 'cmd /c taskkill /F /IM by-claw-nanobot.exe /T 2>nul'
  Sleep 800
  nsExec::ExecToLog 'powershell -NoProfile -Command "$$root=''$INSTDIR''; Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$root) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Sleep 500
!macroend

; ─── Uninstall: cleanup residual files and user data ─────────────────────────
!macro customUnInstall
  DeleteRegValue HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "by-claw-nanobot"

  IfFileExists "$INSTDIR\resources\*.*" 0 +2
    RMDir /r "$INSTDIR\resources"
  IfFileExists "$INSTDIR\*.*" 0 +2
    RMDir /r "$INSTDIR"

  ; %LOCALAPPDATA%\ByNanobot — app userData
  ReadEnvStr $0 LOCALAPPDATA
  ${If} $0 != ""
    RMDir /r "$0\ByNanobot"
  ${EndIf}

  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete agent data in ~/.by-claw-nanobot?" IDNO skip_agent_data
  ReadEnvStr $0 USERPROFILE
  ${If} $0 != ""
    RMDir /r "$0\.by-claw-nanobot"
  ${EndIf}
  skip_agent_data:

  DeleteRegKey HKLM "Software\com.byclaw.nanobot"
!macroend
