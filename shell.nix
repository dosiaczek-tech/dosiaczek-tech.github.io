{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = [ pkgs.nodejs_22 (pkgs.python3.withPackages (ps: [ ps.requests ps.pillow ])) pkgs.patchelf ];
  SWAN_DYNAMIC_LINKER = pkgs.stdenv.cc.bintools.dynamicLinker;
  SWAN_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.gfortran.cc.lib pkgs.stdenv.cc.cc.lib ];
}
