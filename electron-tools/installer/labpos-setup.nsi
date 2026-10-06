; =====================================================================
; Optix LAB MedSync Setup — hand-written NSIS installer (compiled with native makensis)
;   Placeholders __APP_VERSION__ and __ESTIMATED_KB__ are filled in by
;   build-installer.sh before compiling. Do not edit the built .nsi by hand.
; =====================================================================
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ---- App info ---------------------------------------------------------
!define APP_NAME      "Optix LAB MedSync"
!define APP_VERSION   "__APP_VERSION__"
!define APP_PUBLISHER "System Optix"
!define APP_EXE       "Optix LAB MedSync.exe"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\..\dist-installer\Optix-LAB-MedSync-Setup-${APP_VERSION}__SUFFIX__.exe"
InstallDir "__PF__\${APP_NAME}"
InstallDirRegKey HKLM "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APP_NAME} Setup"

!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"

; ---- Wizard pages (classic Next -> Next -> Finish) --------------------
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install ${APP_NAME} ${APP_VERSION} on your computer.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME

!insertmacro MUI_PAGE_DIRECTORY

Page custom DesktopPageCreate DesktopPageLeave

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME} now"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---- Desktop-shortcut option page -------------------------------------
Var DesktopCheckbox

Function DesktopPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Choose Shortcuts" "Select which shortcuts Setup should create."
  ${NSD_CreateCheckbox} 0 20u 100% 12u "Create a &desktop shortcut"
  Pop $DesktopCheckbox
  ${NSD_Check} $DesktopCheckbox
  nsDialogs::Show
FunctionEnd

Function DesktopPageLeave
FunctionEnd

; ---- Main installation section -----------------------------------------
Section "${APP_NAME}" SecMain
  SectionIn RO
  SetShellVarContext all
  SetOutPath "$INSTDIR"

  ; App payload (Electron build: Optix LAB MedSync.exe + resources)
  File /r "..\..\__OUT__\__UNPACKED__\*.*"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Remember install location
  WriteRegStr HKLM "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\${APP_NAME}" "Version" "${APP_VERSION}"

  ; Add/Remove Programs (Control Panel) entry
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME} ${APP_VERSION}"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "EstimatedSize" __ESTIMATED_KB__
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1

  ; Start Menu shortcuts ("Optix LAB MedSync" folder)
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; Optional desktop shortcut (checkbox on the wizard page)
  ${NSD_GetState} $DesktopCheckbox $0
  ${If} $0 == 1
    CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
SectionEnd

; ---- Uninstaller ----------------------------------------------------------
Section "Uninstall"
  SetShellVarContext all

  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKLM "Software\${APP_NAME}"

  ; NOTE: user data (SQLite database at %APPDATA%\${APP_NAME}\labpos.db)
  ; is intentionally left behind so uninstalling never deletes lab records.
SectionEnd
