#!/usr/bin/env bash
# Builds the Real Linux Lab: an Ubuntu 18.04 i386 kernel and a small initramfs with real
# bash + GNU tools and the course's practice files, for the v86 emulator in the browser.
#
#   scripts/linux-image/build.sh        → public/linux/{vmlinuz,initrd.img,bios.bin,manifest.json}
#
# Every package is pinned by SHA-256 in packages.lock (see resolve.py). No network inside the VM.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT=${OUT:-$ROOT/public/linux}
WORK=${WORK:-$ROOT/node_modules/.cache/linux-image}
MIRROR=${MIRROR:-https://archive.ubuntu.com/ubuntu}

log() { printf '\033[1m[linux-image]\033[0m %s\n' "$*" >&2; }

mkdir -p "$WORK/debs" "$OUT"

# 1. Download and verify the pinned packages
log "fetching packages"
while read -r path sha size; do
  [[ -z $path || $path == \#* ]] && continue
  deb="$WORK/debs/${path##*/}"
  if ! { [[ -f $deb ]] && echo "$sha  $deb" | sha256sum -c --status; }; then
    curl -fsSL --retry 3 -o "$deb.part" "$MIRROR/$path"
    mv "$deb.part" "$deb"
  fi
  echo "$sha  $deb" | sha256sum -c --quiet || { log "checksum mismatch: $deb"; exit 1; }
done < "$HERE/packages.lock"

# 2. Unpack
rm -rf "$WORK/rootfs" "$WORK/kernel" "$WORK/bios"
mkdir -p "$WORK/rootfs" "$WORK/kernel" "$WORK/bios"
for deb in "$WORK"/debs/*.deb; do
  case ${deb##*/} in
    linux-image-*) dpkg-deb -x "$deb" "$WORK/kernel" ;;
    seabios_*) dpkg-deb -x "$deb" "$WORK/bios" ;;
    *) dpkg-deb -x "$deb" "$WORK/rootfs" ;;
  esac
done
R=$WORK/rootfs

# 3. Trim what a terminal-only VM never reads
rm -rf "$R"/usr/share/{doc,man,info,locale,lintian,bug,menu,doc-base,common-licenses,bash-completion} \
       "$R"/usr/lib/i386-linux-gnu/gconv "$R"/etc/cron.daily "$R"/etc/init.d "$R"/etc/default

# 4. Fill the gaps update-alternatives / maintainer scripts would have filled
ln -sf gawk "$R/usr/bin/awk"
ln -sf bash "$R/bin/sh"
ln -sf /bin/nano "$R/usr/bin/editor" 2>/dev/null || true
for applet in mount umount hostname ps top free uptime kill killall pidof su setsid cttyhack clear reset \
              vi which more watch dmesg unzip xz unxz xzcat cpio w last strings; do
  if ! [[ -e $R/bin/$applet || -e $R/usr/bin/$applet || -e $R/sbin/$applet || -e $R/usr/sbin/$applet ]]; then
    ln -s /bin/busybox "$R/bin/$applet"
  fi
done
printf '#!/bin/sh\necho "This account is not available"\nexit 1\n' > "$R/usr/sbin/nologin"
chmod 755 "$R/usr/sbin/nologin"

# 5. The course's practice files (same as the in-app Lab)
log "exporting the lab fixture"
(cd "$ROOT" && LAB_EXPORT="$R" npx vitest run tests/content/lab-export.test.ts --reporter=dot >/dev/null)

# 6. System glue
mkdir -p "$R"/{proc,sys,dev,tmp,run,root,mnt}
chmod 1777 "$R/tmp"
echo "halden-lab" > "$R/etc/hostname"
cat > "$R/etc/os-release" <<'OS'
PRETTY_NAME="Halden Lab (Ubuntu 18.04 userland, Linux 4.15)"
NAME="Halden Lab"
ID=ubuntu
VERSION_ID="18.04"
OS
cat > "$R/etc/motd" <<'MOTD'

 Halden Lab: real Linux, in a tab.
 Real bash and GNU tools.
 Practice files are in ~/practice.
 No network; nothing leaves the page.
 Type exit for a root shell.

MOTD
cat > "$R/etc/profile" <<'PROFILE'
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export TERM=xterm-256color LANG=C.UTF-8 EDITOR=nano PAGER=less LESS=-R
PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
[ -f "$HOME/.bashrc" ] && [ -n "$BASH_VERSION" ] && . "$HOME/.bashrc"
PROFILE
cat > "$R/etc/lab-session" <<'SESSION'
#!/bin/bash
# The console session: analyst first; if they exit, a root shell; then analyst again.
for arg in $(cat /proc/cmdline); do
  case $arg in lab.cols=*) cols=${arg#*=} ;; lab.rows=*) rows=${arg#*=} ;; esac
done
stty sane cols "${cols:-80}" rows "${rows:-24}" 2>/dev/null
while true; do
  cat /etc/motd
  su -l analyst
  echo
  echo "Root shell. Type exit to log back in as analyst."
  HOME=/root bash -l
done
SESSION
chmod 755 "$R/etc/lab-session"
cat > "$R/init" <<'INIT'
#!/bin/busybox sh
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox mkdir -p /dev/pts
/bin/busybox mount -t devpts devpts /dev/pts
/bin/busybox mount -t tmpfs -o mode=1777 tmpfs /tmp
/bin/busybox hostname -F /etc/hostname
echo 'LAB-READY' > /dev/kmsg 2>/dev/null
exec /bin/busybox setsid /bin/busybox cttyhack /etc/lab-session
INIT
chmod 755 "$R/init"

# 7. Pack
log "packing initramfs"
python3 "$HERE/mkcpio.py" "$R" "$R/.lab-manifest" | xz -9e --check=crc32 > "$OUT/initrd.img"
install -m 644 "$WORK"/kernel/boot/vmlinuz-* "$OUT/vmlinuz"
install -m 644 "$WORK/bios/usr/share/seabios/bios.bin" "$OUT/bios.bin"
node -e '
const fs = require("fs"), crypto = require("crypto"), dir = process.argv[1];
const files = ["vmlinuz", "initrd.img", "bios.bin"].map((f) => {
  const b = fs.readFileSync(dir + "/" + f);
  return { name: f, size: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex").slice(0, 16) };
});
fs.writeFileSync(dir + "/manifest.json", JSON.stringify({ files, total: files.reduce((a, f) => a + f.size, 0) }, null, 2));
' "$OUT"
log "done: $(du -ch "$OUT"/vmlinuz "$OUT"/initrd.img "$OUT"/bios.bin | tail -1 | cut -f1) in $OUT"
