' ProfManager — dev server auto-start (hidden, self-healing)
' Launches scripts\start-dev.mjs detached from any console so it never
' receives Ctrl+C and is not tied to a terminal window.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\issam\Desktop\fff"
sh.Run """C:\Users\issam\AppData\Local\Programs\nodejs\node.exe"" ""scripts\start-dev.mjs""", 0, False
