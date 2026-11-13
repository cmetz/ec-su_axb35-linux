# ec-su_axb35-linux
Linux driver for the embedded controller on the Sixunited AXB35-02 board.

Vendors using that board:
  - GMKtec EVO-X2
  - Bosgame M5
  - FEVM FA-EX9
  - Peladn YO1
  - NIMO AI MiniPC
  - Corsair AI Workstation 300

An update to date list can be found [here](https://strixhalo-homelab.d7.wtf/Hardware/Boards/Sixunited-AXB35)

For more details, please have a look at the desevens wiki: https://strixhalo-homelab.d7.wtf/Guides/Power-Mode-and-Fan-Control

# Build instructions
```
$ make
$ sudo make install
$ sudo insmod ec_su_axb35
```

# Devices
```
# Fan devices
/sys/class/ec_su_axb35/fan1/                    - CPU fan 1
/sys/class/ec_su_axb35/fan2/                    - CPU fan 2
/sys/class/ec_su_axb35/fan3/                    - System fan
/sys/class/ec_su_axb35/fanX/rpm            (RO) - current speed in rpm
/sys/class/ec_su_axb35/fanX/mode           (RW) - [auto, fixed, curve]
/sys/class/ec_su_axb35/fanX/level          (RW) - [0-5] (0=0%, 1=20%, ..., 5=100%)
/sys/class/ec_su_axb35/fanX/rampup_curve   (RW) - 5 values (°C thresholds for level 1-5)
/sys/class/ec_su_axb35/fanX/rampdown_curve (RW) - 5 values (°C thresholds for level 1-5)
/sys/class/ec_su_axb35/fanX/duty           (RW) - fan1 and fan2 only: [auto, 0-100] duty override in % (see below)

# Temperature device
/sys/class/ec_su_axb35/temp1/                   - CPU temperature in °C
/sys/class/ec_su_axb35/temp1/temp          (RO) - current
/sys/class/ec_su_axb35/temp1/min           (RO) - min temp measured since dirver load
/sys/class/ec_su_axb35/temp1/max           (RO) - amx temp measured since driver load

# APU device
/sys/class/ec_su_axb35/apu/power_mode      (RW) - [quiet, balanced, performance]
```

# Duty override (fan1, fan2)
On some EC firmware the `mode` and `level` writes no longer move the fans (seen on AXB35-02 boards with BIOS 3.11:
the files take the values, the fans stay on the firmware's curve). The EC's duty override still works. Writing a
percentage sets that fan's duty directly; `auto` hands it back to the firmware's control. The driver also hands both
fans back when it unloads.

```
$ echo 80 | sudo tee /sys/class/ec_su_axb35/fan1/duty
$ echo auto | sudo tee /sys/class/ec_su_axb35/fan1/duty
```

A fan curve on top of it is a small loop in user space: read `temp1/temp` every second and write the duty you want.
In `performance` power mode the firmware can take a fan back now and then, so write the duty again every few seconds
rather than once. The override was found in the board's DSDT by
[nathanmarlor/strix-halo-fan-control](https://github.com/nathanmarlor/strix-halo-fan-control).

# Python GUI app (needs root to write to /sys/class/ec_su_axb35/*)
to test:
python ./ec-su_axb35-linux-gui.py

to install:
sudo install -m 755 ec-su_axb35-linux-gui.py /usr/local/bin/ec-su_axb35-linux-gui
cp ec-fan-control.desktop ~/.local/share/applications/
