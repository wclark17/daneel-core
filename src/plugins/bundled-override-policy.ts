import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { NormalizedPluginsConfig } from "./config-normalization-shared.js";
import { isBundledPluginInsideDevSourceRoot } from "./dev-source-root.js";
import type { PluginCandidate } from "./discovery.js";

type PluginEntryOverrideConfig = {
  externalOverride?: boolean;
};

export function isBundledRuntimePluginCandidate(params: {
  candidate: PluginCandidate;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (params.candidate.origin !== "bundled") {
    return false;
  }
  return !isBundledPluginInsideDevSourceRoot({
    rootDir: params.candidate.rootDir,
    env: params.env,
  });
}

export function allowsBundledPluginOverride(params: {
  pluginId: string;
  config?: OpenClawConfig;
  normalized?: Pick<NormalizedPluginsConfig, "entries">;
}): boolean {
  const normalizedEntry = params.normalized?.entries[params.pluginId] as
    | PluginEntryOverrideConfig
    | undefined;
  if (normalizedEntry?.externalOverride === true) {
    return true;
  }
  return params.config?.plugins?.entries?.[params.pluginId]?.externalOverride === true;
}
