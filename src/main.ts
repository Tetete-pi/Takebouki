import "./style.css";
import { manifest } from "./config/manifest";
import { GachaApp } from "./ui/app";

const mount = document.querySelector<HTMLDivElement>("#app");
if (!mount) {
  throw new Error("#app が見つかりません。index.html を確認してください。");
}

const app = new GachaApp({ manifest });
mount.append(app.element);
