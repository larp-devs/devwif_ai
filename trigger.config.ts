import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_xadoucnepuzlmbifjvgz",
  runtime: "node-22",
  logLevel: "debug",
  // Specify machine preset for Node.js >=22.0.0 compatibility
  machine: "small-1x",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 0,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  // Simplified v4 build config
  build: {
    // Remove build extensions for now - will handle binary separately if needed
  },
});
