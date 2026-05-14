; Kill running Hermes Desktop before install/uninstall to prevent locked file errors
!macro customInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend

; Keep Windows app managers, Start Menu shortcuts, and uninstall registry icons
; pinned to the Hermes girl avatar. NSIS upgrades can preserve old .lnk files,
; so relying only on the executable resource may leave third-party app lists
; showing an old cached icon after reinstall.
!macro customInstall
  SetOutPath "$INSTDIR"
  File /oname=HermesDesktop.ico "${PROJECT_DIR}\build\icon.ico"

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\HermesDesktop.ico"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" "DisplayIcon" "$INSTDIR\HermesDesktop.ico"
  !endif

  ${if} ${FileExists} "$newStartMenuLink"
    Delete "$newStartMenuLink"
  ${endif}
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\HermesDesktop.ico" 0 "" "" "${APP_DESCRIPTION}"
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  ${ifNot} ${isNoDesktopShortcut}
    ${if} ${FileExists} "$newDesktopLink"
      Delete "$newDesktopLink"
    ${endif}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\HermesDesktop.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endif}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend
