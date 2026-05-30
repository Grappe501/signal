@echo off
set TEMP=H:\THE_SIGNAL_CYCLE\tmp
set TMP=H:\THE_SIGNAL_CYCLE\tmp
if not exist %TEMP% mkdir %TEMP%
cd /d H:\THE_SIGNAL_CYCLE\reader
node scripts\setup-source.mjs > H:\THE_SIGNAL_CYCLE\tmp\build.log 2>&1
echo exit:%ERRORLEVEL%>> H:\THE_SIGNAL_CYCLE\tmp\build.log
