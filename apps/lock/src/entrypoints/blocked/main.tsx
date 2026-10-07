// First: Kazakh Intl for Chrome, whose ICU has no Kazakh, before anything creates a formatter.
import "@uki/i18n/polyfill";

import { mount } from "../../lib/mount.tsx";
import { BlockedRoot } from "./blocked-root.tsx";
import "../../styles.css";

mount(<BlockedRoot />);
