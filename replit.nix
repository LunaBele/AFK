{ pkgs }: {
  deps = [
    pkgs.libuuid
    pkgs.pkg-config
    pkgs.cairo
    pkgs.pango
    pkgs.libjpeg
    pkgs.giflib
    pkgs.pixman
  ];
}