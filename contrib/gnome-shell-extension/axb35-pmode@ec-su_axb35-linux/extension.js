import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Exposed by the ec_su_axb35 driver, which reads EC register 0x31 — the
// register the physical P-MODE button sets. The driver does not call
// sysfs_notify(), so no event is available and we have to poll. Every read
// is an ACPI EC transaction, so keep this interval conservative.
const PMODE_PATH = '/sys/class/ec_su_axb35/apu/power_mode';
const PMODE_POLL_SECONDS = 3;

// Only read once the node above is missing, to tell a module that is merely
// not loaded from one the running kernel has no build of — the usual state
// after a kernel update when the driver was installed with `make install`.
const OSRELEASE_PATH = '/proc/sys/kernel/osrelease';

// Live APU package power, published by amdgpu in microwatts. A plain sysfs
// read with no EC involved, so it can be polled a little faster. The hwmon
// number is not stable across boots and is resolved at runtime.
const HWMON_DIR = '/sys/class/hwmon';
const POWER_ATTR = 'power1_average';
const POWER_POLL_SECONDS = 2;

// NOTE: the embedded controller stores an ordinal (0/1/2), not a wattage.
// The figures below are those of the GMKtec EVO-X2. Other vendors using the
// AXB35-02 board may ship different presets — adjust here if yours differ.
const MODES = {
    'quiet':       {label: 'Quiet',       watts: 55,  emoji: '🌿'},
    'balanced':    {label: 'Balanced',    watts: 85,  emoji: '⚖️'},
    'performance': {label: 'Performance', watts: 120, emoji: '🚀'},
};
const ORDER = ['quiet', 'balanced', 'performance'];

const PModeIndicator = GObject.registerClass(
class PModeIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'P-MODE Indicator');

        this._settings = settings;
        this._modeFile = Gio.File.new_for_path(PMODE_PATH);
        this._powerFile = this._findPowerFile();
        this._mode = undefined;
        this._power = null;
        this._modeCancellable = null;
        this._powerCancellable = null;
        this._depCancellable = null;
        this._modeTimeoutId = null;
        this._powerTimeoutId = null;

        // Emoji rather than a symbolic icon: the Adwaita power-profile icons
        // are already used by GNOME's own Power Mode menu, which shows a
        // different thing entirely (the amd_pstate EPP hint, not the EC budget).
        // Two labels so the reading can carry its own font size. Reading
        // first, emoji on the right.
        const box = new St.BoxLayout({style_class: 'pmode-box'});
        this._wattsLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'pmode-watts',
        });
        this._emojiLabel = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._wattsLabel);
        box.add_child(this._emojiLabel);
        this.add_child(box);

        this._items = new Map();
        for (const key of ORDER) {
            const {label, watts, emoji} = MODES[key];
            // Read-only: the button is physical, writing would need root.
            const item = new PopupMenu.PopupMenuItem(
                `${emoji}  ${label} — ${watts} W`, {reactive: false});
            this.menu.addMenuItem(item);
            this._items.set(key, item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._powerSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Live power reading', this._settings.get_boolean('show-power'));
        this._powerSwitch.connect('toggled', (item, state) => {
            this._settings.set_boolean('show-power', state);
        });
        if (!this._powerFile)
            this._powerSwitch.setSensitive(false);
        this.menu.addMenuItem(this._powerSwitch);
        this._settingsId = this._settings.connect('changed::show-power', () => {
            this._powerSwitch.state = this._settings.get_boolean('show-power');
            this._syncPowerPolling();
        });

        // Only shown when something is wrong: with the panel and the check
        // mark both saying which mode is active, a status line would be
        // redundant the rest of the time.
        this._statusItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            style_class: 'pmode-status-item',
        });
        this._statusItem.visible = false;
        this.menu.addMenuItem(this._statusItem);

        this._readMode();
        this._modeTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, PMODE_POLL_SECONDS, () => {
                this._readMode();
                return GLib.SOURCE_CONTINUE;
            });
        this._syncPowerPolling();
    }

    // The amdgpu hwmon index varies between boots, so look it up by name.
    _findPowerFile() {
        const dir = Gio.File.new_for_path(HWMON_DIR);
        let iter;
        try {
            iter = dir.enumerate_children('standard::name',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return null;
        }

        let info;
        while ((info = iter.next_file(null)) !== null) {
            const hwmon = dir.get_child(info.get_name());
            try {
                const [ok, contents] = hwmon.get_child('name').load_contents(null);
                if (!ok || new TextDecoder().decode(contents).trim() !== 'amdgpu')
                    continue;
            } catch {
                continue;
            }
            const power = hwmon.get_child(POWER_ATTR);
            if (power.query_exists(null))
                return power;
        }
        return null;
    }

    // Nothing is polled while the reading is switched off.
    _syncPowerPolling() {
        const wanted = this._powerFile !== null &&
            this._settings.get_boolean('show-power');

        if (wanted && !this._powerTimeoutId) {
            this._readPower();
            this._powerTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, POWER_POLL_SECONDS, () => {
                    this._readPower();
                    return GLib.SOURCE_CONTINUE;
                });
        } else if (!wanted && this._powerTimeoutId) {
            GLib.Source.remove(this._powerTimeoutId);
            this._powerTimeoutId = null;
            this._powerCancellable?.cancel();
            this._powerCancellable = null;
            this._power = null;
            this._setLabel();
        }
    }

    _readMode() {
        if (this._modeCancellable)
            return; // previous read still in flight
        this._modeCancellable = new Gio.Cancellable();
        this._modeFile.load_contents_async(this._modeCancellable, (file, res) => {
            this._modeCancellable = null;
            let mode = null;
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (ok)
                    mode = new TextDecoder().decode(contents).trim();
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;
                mode = null;
            }
            this._updateMode(mode);
        });
    }

    _readPower() {
        if (this._powerCancellable)
            return;
        this._powerCancellable = new Gio.Cancellable();
        this._powerFile.load_contents_async(this._powerCancellable, (file, res) => {
            this._powerCancellable = null;
            let watts = null;
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (ok) {
                    const uw = parseInt(new TextDecoder().decode(contents).trim(), 10);
                    if (Number.isFinite(uw))
                        watts = Math.round(uw / 1000000);
                }
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;
            }
            if (watts !== this._power) {
                this._power = watts;
                this._setLabel();
            }
        });
    }

    // Panel shows the live draw with the button position to its right,
    // e.g. "34 W ⚖️". The reading is padded with U+2007 FIGURE SPACE, whose
    // advance equals a digit's, so the indicator keeps a constant width from
    // 9 W to 115 W instead of nudging its neighbours every couple of seconds.
    _setLabel() {
        const info = MODES[this._mode];
        this._emojiLabel.text = info ? info.emoji : '?';
        this._wattsLabel.text = this._power === null
            ? ''
            : `${String(this._power).padStart(3, ' ')} W`;
    }

    _updateMode(mode) {
        if (mode === this._mode)
            return;
        this._mode = mode;
        this._setLabel();

        const info = MODES[mode];
        if (info) {
            this._statusItem.visible = false;
        } else if (this._modeFile.query_exists(null)) {
            this._setStatus('Unexpected EC value');
        } else {
            this._setStatus('ec_su_axb35 module not loaded');
            this._checkModuleInstalled();
        }

        for (const [key, item] of this._items) {
            // NONE keeps the ornament column, so the checked entry stays
            // aligned with the others, but draws nothing — NO_DOT would put
            // an empty circle in front of every inactive mode.
            item.setOrnament(key === mode
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
        }
    }

    _setStatus(text) {
        this._statusItem.label.text = text;
        this._statusItem.visible = true;
    }

    // modules.dep lists every module modprobe can find for a given kernel.
    // Read only on the transition into the error state, so about a megabyte
    // once rather than on every poll.
    _checkModuleInstalled() {
        if (this._depCancellable)
            return;
        let release;
        try {
            const [, contents] = Gio.File.new_for_path(OSRELEASE_PATH)
                .load_contents(null);
            release = new TextDecoder().decode(contents).trim();
        } catch {
            return;
        }

        const depFile = Gio.File.new_for_path(`/lib/modules/${release}/modules.dep`);
        this._depCancellable = new Gio.Cancellable();
        depFile.load_contents_async(this._depCancellable, (file, res) => {
            this._depCancellable = null;
            let deps;
            try {
                const [, contents] = file.load_contents_finish(res);
                deps = new TextDecoder().decode(contents);
            } catch {
                return;
            }
            // Matches a plain `make install` (updates/ec_su_axb35.ko) as well
            // as DKMS's compressed updates/dkms/ec_su_axb35.ko.zst. The node
            // may have appeared while the file was being read.
            if (/(^|\/)ec_su_axb35\.ko/m.test(deps) || this._mode !== null)
                return;
            this._setStatus(`ec_su_axb35 not installed for kernel ${release}`);
        });
    }

    destroy() {
        for (const id of ['_modeTimeoutId', '_powerTimeoutId']) {
            if (this[id]) {
                GLib.Source.remove(this[id]);
                this[id] = null;
            }
        }
        this._modeCancellable?.cancel();
        this._powerCancellable?.cancel();
        this._depCancellable?.cancel();
        this._modeCancellable = null;
        this._powerCancellable = null;
        this._depCancellable = null;
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = null;
        }
        this._settings = null;
        super.destroy();
    }
});

export default class PModeIndicatorExtension extends Extension {
    enable() {
        this._indicator = new PModeIndicator(this.getSettings());
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
