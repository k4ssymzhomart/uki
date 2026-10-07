import { browser } from "wxt/browser";
import { mount } from "../../lib/mount.tsx";
import { PopupRoot } from "./popup-root.tsx";
import "../../styles.css";

mount(<PopupRoot productName={browser.runtime.getManifest().name} />);
