# Maintainer: Gehaxelt <github@gehaxelt.in>
# Contributor: Gehaxelt <github@gehaxelt.in>
# Attention: This was vibe-coded, use with caution.

pkgname=ec-su_axb35-linux-dkms
_gitname=ec-su_axb35-linux
pkgver=0.1.r29.e483ec9
pkgrel=1
pkgdesc="Linux driver for the embedded controller on the Sixunited AXB35-02 board (DKMS build)"
arch=(x86_64)
url="https://github.com/cmetz/${_gitname}"
license=(GPL2)
depends=(dkms linux-headers bc tk)
source=("git+https://github.com/cmetz/${_gitname}.git")
sha256sums=(SKIP)

pkgver() {
    cd "$_gitname"
    echo "0.1.r$(git rev-list --count HEAD).$(git rev-parse --short HEAD)"
}

prepare() {
    cd "$_gitname"

    # Create DKMS configuration
    cat > dkms.conf << 'EOF'
PACKAGE_NAME="ec_su_axb35"
PACKAGE_VERSION="0.1"
MAKE_INITRD="make all"
BUILT_MODULE_NAME[0]="ec_su_axb35"
BUILT_MODULE_LOCATION[0]="."
DEST_MODULE_LOCATION[0]="/kernel/drivers/misc"
BUILT_MODULE_NAME[1]="su_axb35_hwmon"
BUILT_MODULE_LOCATION[1]="."
DEST_MODULE_LOCATION[1]="/kernel/drivers/hwmon"
INSTALL_MODULE[0]="yes"
INSTALL_MODULE[1]="yes"
AUTOINSTALL="yes"
EOF

    # Patch main Makefile for DKMS
    cat > Makefile << 'EOF'
KERNEL_BUILD ?= $(KSRC)
PWD := $(CURDIR)

.PHONY: all
all:
	$(MAKE) -C $(KERNEL_BUILD) M=$(PWD) modules

.PHONY: clean
clean:
	$(MAKE) -C $(KERNEL_BUILD) M=$(PWD) clean
EOF

    # Create Kbuild for main module (includes both ec_su_axb35 and hwmon)
    cat > Kbuild << 'EOF'
obj-m += ec_su_axb35.o su_axb35_hwmon.o
ec_su_axb35-y := src/ec_su_axb35.o
su_axb35_hwmon-objs := hwmon/ec-su_axb35-hwmon.o
EOF
}

package() {
    cd "$_gitname"

    # Install DKMS sources
    install -Dm 0644 dkms.conf "${pkgdir}/usr/src/${_gitname}-${pkgver}/dkms.conf"
    install -Dm 0644 Kbuild "${pkgdir}/usr/src/${_gitname}-${pkgver}/Kbuild"
    install -Dm 0644 Makefile "${pkgdir}/usr/src/${_gitname}-${pkgver}/Makefile"
    install -Dm 0644 LICENSE "${pkgdir}/usr/src/${_gitname}-${pkgver}/LICENSE"
    cp -r src "${pkgdir}/usr/src/${_gitname}-${pkgver}/src"
    cp -r hwmon "${pkgdir}/usr/src/${_gitname}-${pkgver}/hwmon"

    # Install the monitor script
    install -Dm 0755 scripts/su_axb35_monitor "${pkgdir}/usr/local/bin/su_axb35_monitor"

    # Install info script
    install -Dm 0755 scripts/info.sh "${pkgdir}/usr/local/bin/ec-su-axb35-info"

    # Install python GUI
    install -Dm 0755 python-gui/ec-su_axb35-linux-gui.py "${pkgdir}/usr/local/bin/ec-su_axb35-linux-gui"

    # Install desktop file
    install -Dm 0644 python-gui/ec-fan-control.desktop "${pkgdir}/usr/share/applications/ec-fan-control.desktop"

    # Install modules-load.d conf for auto-loading at boot
    install -Dm 0644 /dev/stdin "${pkgdir}/etc/modules-load.d/ec-su_axb35.conf" << 'EOF'
ec_su_axb35
su_axb35_hwmon
EOF
}
