{
  description = "supy: natywna aplikacja Android otwierajaca aktualna strone SUP";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/46db2e09e1d3f113a13c0d7b81e2f221c63b8ce9";

  outputs = { nixpkgs, ... }:
    let
      # Increase both values for every APK delivered to the user.
      version = "1.0.6";
      versionCode = 7;
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" ];
      builds = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };
          android = pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ "36" ];
            buildToolsVersions = [ "36.0.0" ];
            includeEmulator = false;
            includeSystemImages = false;
            includeNDK = false;
          };
          sdk = "${android.androidsdk}/libexec/android-sdk";
          tools = "${sdk}/build-tools/36.0.0";
          toolEnv = {
            JAVA_HOME = "${pkgs.jdk17}";
            AAPT2 = "${tools}/aapt2";
            ZIPALIGN = "${tools}/zipalign";
            APKSIGNER = "${tools}/apksigner";
            SUPY_VERSION_CODE = toString versionCode;
          };
          verify = pkgs.writeShellApplication {
            name = "supy-verify";
            runtimeInputs = [ pkgs.coreutils pkgs.gnugrep pkgs.unzip pkgs.jdk17 ];
            runtimeEnv = toolEnv;
            text = builtins.readFile ./scripts/verify-apk.sh;
          };
          unsigned = pkgs.stdenvNoCC.mkDerivation {
            pname = "supy-android";
            inherit version;
            src = pkgs.lib.fileset.toSource {
              root = ./.;
              fileset = pkgs.lib.fileset.unions [ ./AndroidManifest.xml ./res ./src ];
            };
            nativeBuildInputs = [ pkgs.jdk17 pkgs.zip verify ];
            JAVA_HOME = "${pkgs.jdk17}";
            dontConfigure = true;
            dontFixup = true;
            buildPhase = ''
              runHook preBuild
              mkdir -p generated classes dex
              ${tools}/aapt2 compile --dir res -o resources.zip
              ${tools}/aapt2 link \
                -I ${sdk}/platforms/android-36/android.jar \
                --manifest AndroidManifest.xml --java generated \
                --min-sdk-version 26 --target-sdk-version 36 \
                --version-code ${toString versionCode} --version-name ${version} \
                -o unaligned.apk resources.zip
              find src generated -name '*.java' -print | LC_ALL=C sort > sources.list
              # Android's LambdaMetafactory stub lacks javac's bootstrap method.
              # JDK 8 signatures plus d8 desugaring support the minimum API 26.
              javac -encoding UTF-8 --release 8 \
                -classpath ${sdk}/platforms/android-36/android.jar \
                -d classes @sources.list
              jar --create --file classes.jar -C classes .
              ${tools}/d8 --release --min-api 26 \
                --lib ${sdk}/platforms/android-36/android.jar \
                --output dex classes.jar
              touch -t 198001010000.02 dex/classes.dex
              zip -X -j unaligned.apk dex/classes.dex
              ${tools}/zipalign -f -p 4 unaligned.apk supy-unsigned.apk
              runHook postBuild
            '';
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              supy-verify supy-unsigned.apk unsigned
              runHook postCheck
            '';
            installPhase = ''
              runHook preInstall
              install -Dm644 supy-unsigned.apk "$out/supy-unsigned.apk"
              runHook postInstall
            '';
          };
          signer = pkgs.writeShellApplication {
            name = "supy-sign";
            runtimeInputs = [ pkgs.coreutils pkgs.jdk17 pkgs.openssl pkgs.util-linux verify ];
            runtimeEnv = toolEnv // {
              SUPY_UNSIGNED_APK = "${unsigned}/supy-unsigned.apk";
            };
            text = builtins.readFile ./scripts/sign-apk.sh;
          };
        in {
          inherit unsigned verify signer;
          devShell = pkgs.mkShell ({
            packages = [ pkgs.jdk17 android.androidsdk verify ];
            ANDROID_HOME = sdk;
            ANDROID_SDK_ROOT = sdk;
            shellHook = ''export PATH="${tools}:${sdk}/platform-tools:$PATH"'';
          } // toolEnv);
        });
    in {
      packages = forAllSystems (system: { default = builds.${system}.unsigned; });
      apps = forAllSystems (system: {
        default = {
          type = "app";
          meta.description = "Build, sign and verify supy with a persistent local key";
          program = "${builds.${system}.signer}/bin/supy-sign";
        };
        verify = {
          type = "app";
          meta.description = "Verify supy APK metadata, alignment and signatures";
          program = "${builds.${system}.verify}/bin/supy-verify";
        };
      });
      devShells = forAllSystems (system: { default = builds.${system}.devShell; });
    };
}
