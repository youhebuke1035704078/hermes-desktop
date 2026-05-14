; Kill running Hermes Desktop before install/uninstall to prevent locked file errors
!macro customInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend

; Keep Windows app managers, Start Menu shortcuts, and uninstall registry icons
; pinned to the Hermes girl avatar. Some app managers do not resolve standalone
; .ico DisplayIcon values reliably, so expose the embedded executable icon too.
!macro customInstall
  SetOutPath "$INSTDIR"
  File /oname=HermesDesktop.ico "${PROJECT_DIR}\build\icon.ico"

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Icon" "$appExe,0"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "DisplayIcon" "$appExe,0"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "Icon" "$appExe,0"
  !endif
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "ApplicationIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\${APP_EXECUTABLE_FILENAME}" "" "$appExe"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\${APP_EXECUTABLE_FILENAME}" "Path" "$INSTDIR"

  ${if} ${FileExists} "$newStartMenuLink"
    Delete "$newStartMenuLink"
  ${endif}
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  ${ifNot} ${isNoDesktopShortcut}
    ${if} ${FileExists} "$newDesktopLink"
      Delete "$newDesktopLink"
    ${endif}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endif}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  nsExec::ExecToLog '"$SYSDIR\ie4uinit.exe" -show'
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend
