#!/usr/bin/env python3
"""Write a "newc" cpio archive (the Linux initramfs format) from a directory.

Everything is owned by root unless the optional manifest (lines "mode uid gid /path",
octal mode) says otherwise. Usage: mkcpio.py ROOTFS [MANIFEST] > initrd.cpio
"""
import os
import stat
import sys


def main():
    root = sys.argv[1]
    overrides = {}
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        for line in open(sys.argv[2]):
            parts = line.split(' ', 3)
            if len(parts) == 4:
                overrides[parts[3].rstrip('\n')] = (int(parts[0], 8), int(parts[1]), int(parts[2]))
    out = sys.stdout.buffer
    ino = [1]

    def header(name, mode, uid, gid, nlink, mtime, size, rdev=0):
        fields = [ino[0], mode, uid, gid, nlink, mtime, size, 0, 0, rdev >> 8, rdev & 0xff, len(name) + 1, 0]
        ino[0] += 1
        h = b'070701' + b''.join(b'%08X' % f for f in fields) + name.encode() + b'\0'
        out.write(h + b'\0' * ((4 - len(h) % 4) % 4))

    def pad(n):
        out.write(b'\0' * ((4 - n % 4) % 4))

    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(dirnames) + sorted(filenames):
            entries.append(os.path.join(dirpath, name))
    for path in entries:
        rel = os.path.relpath(path, root)
        if rel == '.lab-manifest':
            continue
        st = os.lstat(path)
        kind = stat.S_IFMT(st.st_mode)
        perm, uid, gid = stat.S_IMODE(st.st_mode), 0, 0
        if '/' + rel in overrides:
            perm, uid, gid = overrides['/' + rel]
        if kind == stat.S_IFLNK:
            target = os.readlink(path).encode()
            header(rel, kind | 0o777, uid, gid, 1, 0, len(target))
            out.write(target)
            pad(len(target))
        elif kind == stat.S_IFDIR:
            header(rel, kind | perm, uid, gid, 2, int(st.st_mtime), 0)
        elif kind == stat.S_IFREG:
            data = open(path, 'rb').read()
            header(rel, kind | perm, uid, gid, 1, int(st.st_mtime), len(data))
            out.write(data)
            pad(len(data))
    # device nodes the kernel needs before devtmpfs is mounted
    header('dev/console', stat.S_IFCHR | 0o600, 0, 0, 1, 0, 0, (5 << 8) | 1)
    header('dev/null', stat.S_IFCHR | 0o666, 0, 0, 1, 0, 0, (1 << 8) | 3)
    header('TRAILER!!!', 0, 0, 0, 1, 0, 0)
    out.write(b'\0' * 512)


if __name__ == '__main__':
    main()
