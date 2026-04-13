; Kill running Hermes Desktop before install/uninstall to prevent locked file errors
!macro customInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /f /im hermes-desktop.exe'
!macroend
