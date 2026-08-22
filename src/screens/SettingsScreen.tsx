import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { clearHereApiKey, getHereApiKey, setHereApiKey } from "../services/config";

export default function SettingsScreen() {
  const [apiKey, setApiKeyInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getHereApiKey().then((key) => {
      if (key) setApiKeyInput(key);
    });
  }, []);

  async function handleSave() {
    if (!apiKey.trim()) {
      Alert.alert("Enter a key", "Paste your HERE API key first.");
      return;
    }
    await setHereApiKey(apiKey);
    setSaved(true);
  }

  async function handleClear() {
    await clearHereApiKey();
    setApiKeyInput("");
    setSaved(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>HERE Routing API Key</Text>
      <Text style={styles.helperText}>
        Truck Navigation uses HERE's routing engine to geocode and drive the permit's route (truck
        mode, with your load's dimensions applied when known). Create a free key at{" "}
        <Text style={styles.link} onPress={() => Linking.openURL("https://platform.here.com/")}>
          platform.here.com
        </Text>
        .
      </Text>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={(v) => {
          setApiKeyInput(v);
          setSaved(false);
        }}
        placeholder="Paste your HERE API key"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, styles.primaryButton]} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{saved ? "Saved ✓" : "Save Key"}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleClear}>
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>
        The key is stored only on this device (secure storage), never sent anywhere except to
        HERE's API.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  helperText: { fontSize: 14, color: "#4b5563", lineHeight: 20 },
  link: { color: "#2563eb", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
  buttonRow: { flexDirection: "row", gap: 10 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6" },
  primaryButton: { backgroundColor: "#2563eb" },
  buttonText: { fontWeight: "600", color: "#111827" },
  primaryButtonText: { fontWeight: "700", color: "#ffffff" },
  note: { fontSize: 12, color: "#9ca3af", marginTop: 8 },
});
