import * as SecureStore from "expo-secure-store";

const HERE_API_KEY_STORAGE_KEY = "here_api_key";

export class MissingApiKeyError extends Error {
  constructor() {
    super("No HERE API key configured. Add one in Settings before scanning a permit.");
    this.name = "MissingApiKeyError";
  }
}

export async function getHereApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(HERE_API_KEY_STORAGE_KEY);
}

export async function setHereApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(HERE_API_KEY_STORAGE_KEY, key.trim());
}

export async function clearHereApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(HERE_API_KEY_STORAGE_KEY);
}

export async function requireHereApiKey(): Promise<string> {
  const key = await getHereApiKey();
  if (!key) throw new MissingApiKeyError();
  return key;
}
