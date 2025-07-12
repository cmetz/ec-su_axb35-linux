# Makefile for ec_su_axb35

KERNEL_BUILD ?= /lib/modules/$(shell uname -r)/build
MODULE_NAME := ec_su_axb35.ko
MODULE_INSTALLED_PATH := $(shell modinfo -n $(basename $(MODULE_NAME)) 2>/dev/null)
PWD := $(CURDIR)

.PHONY: default
default: modules

.PHONY: modules
modules:
	$(MAKE) -C $(KERNEL_BUILD) M=$(PWD) modules

.PHONY: modules_install
modules_install: modules
	$(MAKE) -C $(KERNEL_BUILD) M=$(PWD) modules_install

.PHONY: clean
clean:
	$(MAKE) -C $(KERNEL_BUILD) M=$(PWD) clean
	rm -rf $(BUILD_DIR)

.PHONY: install
install: modules_install
	depmod
	@echo "Installing su_axb35_monitor script to /usr/local/bin/"
	install -m 0755 scripts/su_axb35_monitor /usr/local/bin/

.PHONY: uninstall
uninstall:
	@if [ -n "$(MODULE_INSTALLED_PATH)" ]; then \
		echo "Removing $(MODULE_INSTALLED_PATH)"; \
		rm -v "$(MODULE_INSTALLED_PATH)"; \
		depmod; \
	else \
		echo "Module not found."; \
	fi
	@if [ -f "/usr/local/bin/su_axb35_monitor" ]; then \
		echo "Removing /usr/local/bin/su_axb35_monitor"; \
		rm -v "/usr/local/bin/su_axb35_monitor"; \
	else \
		echo "Monitor script not found."; \
	fi

