// First: Kazakh Intl for Chrome, whose ICU has no Kazakh, before anything creates a formatter.
import "@uki/i18n/polyfill";

import { mount } from "../../lib/mount.tsx";
import { PopupRoot } from "./popup-root.tsx";
import "../../styles.css";

mount(<PopupRoot />);
