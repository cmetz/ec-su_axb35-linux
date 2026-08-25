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

# DKMS install (recommended)
```
$ sudo dkms add -m ec-su_axb35 -v 1.0
$ sudo dkms build -m ec-su_axb35 -v 1.0
$ sudo dkms install -m ec-su_axb35 -v 1.0
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

# Temperature device
/sys/class/ec_su_axb35/temp1/                   - CPU temperature in °C
/sys/class/ec_su_axb35/temp1/temp          (RO) - current
/sys/class/ec_su_axb35/temp1/min           (RO) - min temp measured since driver load
/sys/class/ec_su_axb35/temp1/max           (RO) - max temp measured since driver load

# APU device
/sys/class/ec_su_axb35/apu/power_mode      (RW) - [quiet, balanced, performance]
```

# Input device
The front power-mode button is exposed as an input device:
```
$ cat /proc/bus/input/devices
I: Bus=0019 Vendor=0001 Product=0001 Version=0100
N: Name="ec_su_axb35 power mode button"
B: EV=12
B: KEY=1000000 0 0
```
Pressing the button emits a `KEY_POWER` event. Bind it in your DE to cycle
power modes, or let the D-Bus service (`com.evox2.powermode`) handle it via
sysfs polling.

# Python GUI app (needs root to write to /sys/class/ec_su_axb35/*)
to test:
python ./ec-su_axb35-linux-gui.py

to install:
sudo install -m 755 ec-su_axb35-linux-gui.py /usr/local/bin/ec-su_axb35-linux-gui
cp ec-fan-control.desktop ~/.local/share/applications/
