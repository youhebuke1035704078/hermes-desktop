; Kill running Hermes Desktop before install/uninstall to prevent locked file errors
!macro customInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend

; Keep Windows app managers, Start Menu shortcuts, and uninstall registry icons
; pinned to the Hermes girl avatar. Some app managers do not resolve standalone
; .ico files or DisplayIcon values with ",0" reliably, so expose the executable
; path directly and make the uninstall InstallLocation explicit.
!macro customInstall
  SetOutPath "$INSTDIR"
  File /oname=HermesDesktop.ico "${PROJECT_DIR}\build\icon.ico"

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Icon" "$appExe"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "ApplicationIcon" "$appExe"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "InstallLocation" "$INSTDIR"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "DisplayIcon" "$appExe"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "Icon" "$appExe"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "ApplicationIcon" "$appExe"
  !endif
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "ApplicationIcon" "$appExe"
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
