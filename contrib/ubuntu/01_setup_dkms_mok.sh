#!/usr/bin/env bash
# 01_setup_dkms_mok.sh
# Sets up DKMS and enrolls a MOK key for secure boot module signing.
# Run this first, then reboot and complete MOK enrollment before running script 2.
# Not needed when Secure Boot is disabled: run script 2 directly.
# Tested under Ubuntu 26.04

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

MOK_KEY="/var/lib/shim-signed/mok/MOK.priv"
MOK_CERT="/var/lib/shim-signed/mok/MOK.der"

[[ $EUID -ne 0 ]] && error "Run as root (sudo $0)"

# Check secure boot state
if ! mokutil --sb-state 2>/dev/null | grep -q "SecureBoot enabled"; then
    warn "Secure boot does not appear to be enabled, so no MOK enrollment is needed."
    warn "You can run 02_install_ec_axb35_dkms.sh directly."
    read -rp "Continue anyway? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
fi

# Check if MOK already exists
if [[ -f "$MOK_KEY" && -f "$MOK_CERT" ]]; then
    info "MOK key pair already exists at ${MOK_KEY} and ${MOK_CERT}"
    info "Skipping key generation."
else
    info "Installing dkms and openssl..."
    apt-get install -y dkms openssl

    info "Generating DKMS MOK key pair..."
    dkms generate_mok
    info "MOK key pair created at ${MOK_KEY} and ${MOK_CERT}"
fi

if [[ "$(mokutil --test-key "$MOK_CERT" 2>/dev/null)" == *"is already enrolled"* ]]; then
    info "MOK key is already enrolled, no reboot needed."
    info "Run: sudo bash contrib/ubuntu/02_install_ec_axb35_dkms.sh"
    exit 0
fi

# Enroll the key
info "Enrolling MOK public key..."
echo ""
warn "You will be prompted to set a password for MOK enrollment."
warn "Password MUST be 5 characters or fewer (UEFI keyboard limitation)."
warn "You will need this password at the next boot screen."
echo ""

mokutil --import "$MOK_CERT"

info "MOK enrollment request submitted."
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  REBOOT REQUIRED${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "At the blue MOK Manager screen:"
echo "  1. Press any key"
echo "  2. Select 'Enroll MOK'"
echo "  3. Select 'Continue'"
echo "  4. Select 'Yes'"
echo "  5. Enter the password you just set"
echo "  6. Select 'Reboot'"
echo ""
echo "After reboot, run: sudo bash contrib/ubuntu/02_install_ec_axb35_dkms.sh"
echo ""
read -rp "Reboot now? [y/N] " doreboot
if [[ "$doreboot" =~ ^[Yy]$ ]]; then
    systemctl reboot
fi
