apk="${1:?Usage: supy-verify path/to/supy.apk [signed|unsigned]}"
mode="${2:-signed}"
if [[ "$mode" != signed && "$mode" != unsigned ]]; then
  printf 'Expected signed or unsigned verification mode.\n' >&2
  exit 1
fi
badging=$("$AAPT2" dump badging "$apk")
printf '%s\n' "$badging"
grep -Fq "package: name='io.github.dosiaczek.supy' versionCode='$SUPY_VERSION_CODE'" <<< "$badging"
grep -Fxq "minSdkVersion:'26'" <<< "$badging"
grep -Fxq "targetSdkVersion:'36'" <<< "$badging"
grep -Fxq "application-label:'supy'" <<< "$badging"
grep -Fq "launchable-activity: name='io.github.dosiaczek.supy.MainActivity'" <<< "$badging"
unzip -tqq "$apk"
"$ZIPALIGN" -c -p 4 "$apk"
if [[ "$mode" == signed ]]; then
  "$APKSIGNER" verify --min-sdk-version 26 --verbose --print-certs "$apk"
elif "$APKSIGNER" verify "$apk" >/dev/null 2>&1; then
  printf 'The sandbox output was unexpectedly signed.\n' >&2
  exit 1
fi
printf 'Verified %s APK: %s\n' "$mode" "$apk"
