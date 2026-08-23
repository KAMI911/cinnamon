const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;

const common_css =
"                       \
  border-radius: 6px;   \
  border-width: 2px;    \
  border-color: black;  \
  color: black;         \
  padding: 12px;        \
  text-align: center;   \
";

// ShowMonitorLabels is an unauthenticated D-Bus method (js/ui/cinnamonDBus.js),
// so displayName/connector (interpolated into Pango markup below) and color
// (interpolated into a raw St CSS style string) are all caller-controlled.
const VALID_CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([0-9., ]+\))$/;

var MonitorLabel = GObject.registerClass(
class MonitorLabel extends St.BoxLayout {
    _init(monitor, connector, info) {
        this._monitor = monitor;
        this._connector = connector;
        this._index = info[0];
        this._cloned = info[1];
        this._displayName = info[2];
        this._color = VALID_CSS_COLOR.test(info[3]) ? info[3] : "white";

        super._init({
            style: `${common_css} background-color: ${this._color};`,
            vertical: true,
        });

        let labelText;

        if (this._cloned) {
            let str = _("Mirrored Displays");
            labelText = `<b>${str}</b>`;
        } else {
            let displayName = GLib.markup_escape_text(`${this._displayName}`, -1);
            let connectorText = GLib.markup_escape_text(`${this._connector}`, -1);
            labelText = `<b>${this._index}  ${displayName}</b>\n${connectorText}`
        }

        this._label = new St.Label();
        this._label.clutter_text.set_markup(labelText);
        this.add_child(this._label);

        Main.uiGroup.add_child(this);

        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        this.x = workArea.x + 6 * global.ui_scale;
        this.y = workArea.y + 6 * global.ui_scale;
    }
});

var MonitorLabeler = class {
    constructor() {
        this._labels = [];
        this._trackedClients = new Map();
        this._active = false;
        this._monitorManager = Meta.MonitorManager.get();

        this._showIdleId = 0;
    }

    show(dict, sender) {
        this._active = true;
        this.watchSender(sender);

        if (this._showIdleId != 0) {
            GLib.source_remove(this._showIdleId);
            this._showIdleId = 0;
        }

        this._showIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => this._realShow(dict));
    }

    _realShow(dict) {
        for (let label of this._labels) {
            label.destroy();
        }

        this._labels = [];

        for (let connector in dict) {
            let index = this._monitorManager.get_monitor_for_connector(connector);
            if (index == -1) {
                continue;
            }

            let layoutMonitor = 0;

            try {
                layoutMonitor = Main.layoutManager.monitors[index];
            } catch {
                continue;
            }

            let info = dict[connector].deep_unpack();

            let label = new MonitorLabel(layoutMonitor, connector, info);
            this._labels.push(label);
        }

        this._showIdleId = 0;

        return GLib.SOURCE_REMOVE;
    }

    hide(sender=null) {
        const watchHandle = this._trackedClients.get(sender);
        if (watchHandle !== undefined) {
            Gio.bus_unwatch_name(watchHandle);
            this._trackedClients.delete(sender)
        }

        if (this._trackedClients.size > 0) {
            return;
        }

        if (this._showIdleId != 0) {
            GLib.source_remove(this._showIdleId);
            this._showIdleId = 0;
        }

        for (let label of this._labels) {
            label.destroy();
        }

        this._labels = [];
        this._active = false;
    }

    watchSender(sender) {
        if (this._trackedClients.has(sender)) {
            return;
        }

        let watchHandle = Gio.bus_watch_name(Gio.BusType.SESSION, sender, 0, null, (c, name) => this.hide(name))
        this._trackedClients.set(sender, watchHandle);
    }
};
