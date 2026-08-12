import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type FreePortModule = {
  freePort: (port: number, options?: { excludePid?: number }) => void;
};

let freePortModule: FreePortModule | undefined;

async function loadFreePortModule(): Promise<FreePortModule> {
  if (!freePortModule) {
    const scriptPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/free-port.mjs"
    );
    freePortModule = (await import(pathToFileURL(scriptPath).href)) as FreePortModule;
  }
  return freePortModule;
}

export async function freeDevListenPort(port: number): Promise<void> {
  const { freePort } = await loadFreePortModule();
  freePort(port, { excludePid: process.pid });
}
