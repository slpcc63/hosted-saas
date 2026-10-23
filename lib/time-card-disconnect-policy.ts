export async function runTimeCardDisconnect<T>(input: {
  pluginIds: readonly string[];
  disconnect: () => Promise<T>;
}): Promise<T> {
  if (input.pluginIds.some(id => id !== 'square-time-card-manager')) {
    throw new Error('Square access is shared with another tool; disconnect was blocked');
  }
  return input.disconnect();
}
