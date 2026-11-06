umask 077
key_dir="$HOME/.local/share/supy-android"
keystore="$key_dir/release.p12"
password="$key_dir/release.password"
mkdir -p "$key_dir"
chmod 700 "$key_dir"
exec 9>"$key_dir/sign.lock"
flock 9

if [[ -e "$keystore" && -e "$password" ]]; then
  printf 'Reusing signing key: %s\n' "$keystore"
elif [[ -e "$keystore" || -e "$password" ]]; then
  printf 'Incomplete signing identity. Restore release.p12 AND release.password from backup in %s.\n' "$key_dir" >&2
  exit 1
else
  key_stage=$(mktemp -d "$key_dir/.new-key.XXXXXXXX")
  trap 'rm -rf -- "$key_stage"' EXIT
  openssl rand -base64 36 > "$key_stage/release.password"
  keytool -genkeypair -noprompt \
    -keystore "$key_stage/release.p12" -storetype PKCS12 \
    -storepass:file "$key_stage/release.password" \
    -keypass:file "$key_stage/release.password" \
    -alias supy -keyalg RSA -keysize 3072 -sigalg SHA256withRSA \
    -validity 10000 -dname 'CN=supy, OU=Android, O=dosiaczek'
  mv "$key_stage/release.password" "$password"
  mv "$key_stage/release.p12" "$keystore"
  rmdir "$key_stage"
  trap - EXIT
  printf 'Created signing identity in %s. Back up release.p12 AND release.password.\n' "$key_dir"
fi
chmod 600 "$keystore" "$password"

mkdir -p dist
stage=$(mktemp -d "$PWD/dist/.supy-sign.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
# PKCS#12 uses the keystore password for the key; preserve zipalign's padding.
"$APKSIGNER" sign \
  --ks "$keystore" --ks-type PKCS12 --ks-key-alias supy \
  --ks-pass "file:$password" --alignment-preserved true \
  --v1-signing-enabled false --v2-signing-enabled true \
  --v3-signing-enabled true --v4-signing-enabled false \
  --out "$stage/supy.apk" "$SUPY_UNSIGNED_APK"
supy-verify "$stage/supy.apk"
digest=$(sha256sum "$stage/supy.apk")
printf '%s  supy.apk\n' "${digest%% *}" > "$stage/supy.apk.sha256"
chmod 644 "$stage/supy.apk" "$stage/supy.apk.sha256"
mv -f "$stage/supy.apk" dist/supy.apk
mv -f "$stage/supy.apk.sha256" dist/supy.apk.sha256
printf '\nInstallable APK: %s/dist/supy.apk\nSigning key (back it up): %s\n' "$PWD" "$keystore"
