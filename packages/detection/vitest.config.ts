import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(vitestBase, defineConfig({ test: { environment: "node" } }));
