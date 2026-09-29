# GNOME Shell Extension
Shows the live APU power draw in the top bar, with the position of the
physical P-MODE button to its right.

| Button position | Top bar |
|---|---|
| `quiet`       | 34 W 🌿 |
| `balanced`    | 34 W ⚖️ |
| `performance` | 34 W 🚀 |

The drop-down repeats the three modes with their nominal wattage, marks the
active one, and carries a switch to turn the live reading on or off. Read-only
as far as the hardware goes — the button is physical, writing to the EC would
need root.

GNOME's own Power Mode menu cannot show this: without an ACPI `platform_profile`
on this board, power-profiles-daemon only drives the `amd_pstate` EPP hint and
never touches the embedded controller.

### Installation & Usage
1. Install the driver with DKMS (see `contrib/ubuntu/`) rather than a plain
   `sudo make install`, which builds it for the running kernel only and leaves
   it behind at the next kernel update. Make sure the module is loaded
   (`cat /sys/class/ec_su_axb35/apu/power_mode`), and load it at boot with
   `echo ec_su_axb35 | sudo tee /etc/modules-load.d/ec_su_axb35.conf`.
2. Copy the extension:
   `cp -r axb35-pmode@ec-su_axb35-linux ~/.local/share/gnome-shell/extensions/`
3. Log out and log back in. GNOME Shell only scans for extensions at session
   start, so a new one is invisible until then (and under Wayland the Shell
   cannot be restarted in place).
4. `gnome-extensions enable axb35-pmode@ec-su_axb35-linux`

### Live power reading
The figure left of the emoji is the APU package power published by `amdgpu` in
`/sys/class/hwmon/hwmonN/power1_average`. The hwmon index changes between boots,
so it is resolved at startup by looking for the one whose `name` is `amdgpu`. If
no such hwmon is found the extension simply shows the emoji alone and the switch
is greyed out.

The switch is stored in GSettings (`show-power`, default on) and survives a
session. Turning it off stops the polling entirely rather than just hiding the
figure. `schemas/gschemas.compiled` is committed so the extension works from a
plain copy; regenerate it with `glib-compile-schemas schemas/` if you edit the
XML.

Note that this is the current draw, not the budget: a short burst boosts well
above the nominal figure before the sustained limit takes over.

### Wattage labels in the menu
The EC stores an ordinal (`0x00`=balanced, `0x01`=performance, `0x02`=quiet),
not a wattage. The 55 / 85 / 120 W figures are those of the GMKtec EVO-X2 and
are **not read from the hardware**. If your vendor ships different presets,
edit `MODES` at the top of `extension.js`.

### Troubleshooting
When `/sys/class/ec_su_axb35/apu/power_mode` is missing the top bar shows `?`
and the drop-down says why:

- *ec_su_axb35 not installed for kernel X*: the running kernel has no build of
  the module, typically right after a kernel update when the driver was
  installed with `make install`. Rebuild it
  (`make && sudo make install && sudo modprobe ec_su_axb35`), or move to DKMS
  so it happens by itself.
- *ec_su_axb35 module not loaded*: the module is installed but not loaded,
  `sudo modprobe ec_su_axb35`.

The indicator picks the module up within 3 seconds, no need to log out.

### Notes
The driver does not call `sysfs_notify()`, so the extension polls
`/sys/class/ec_su_axb35/apu/power_mode` every 3 seconds with an asynchronous
read. The power reading is a plain sysfs read with no EC transaction involved
and uses its own 2 second timer. Tested on GNOME Shell 50 (Ubuntu 26.04); the
APIs used are unchanged since GNOME 45.
