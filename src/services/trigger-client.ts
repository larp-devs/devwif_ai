// src/services/trigger-client.ts
// In v4, TriggerClient is no longer exported. Use tasks.trigger directly.

// Export the tasks module for v4 API
export async function triggerTask(taskId: string, payload: any) {
  // Use the trigger method from the tasks module
  const { tasks } = await import("@trigger.dev/sdk");
  return await tasks.trigger(taskId, payload);
}
