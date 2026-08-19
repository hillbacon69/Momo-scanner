import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { parsePermitText } from "../services/permitParser";

type Props = NativeStackScreenProps<RootStackParamList, "ManualEntry">;

export default function ManualEntryScreen({ navigation }: Props) {
  const [text, setText] = useState("");

  function handleParse() {
    const permit = parsePermitText(text, "manual");
    navigation.replace("PermitReview", { permit });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.label}>
        Paste the permit's route/dimensions text below (from the QR link, a PDF, or typed from the
        printed permit).
      </Text>
      <TextInput
        style={styles.input}
        multiline
        textAlignVertical="top"
        placeholder={
          "Example:\nPERMIT NO: TX-123456\nFROM: Odessa, TX TO: Midland, TX\nHEIGHT: 14 FT 6 IN  WIDTH: 12 FT  WEIGHT: 95000 LBS\n\n1. BEGIN AT ORIGIN.\n2. PROCEED EAST ON I-20 FOR 12 MILES TO EXIT 136.\n3. TURN RIGHT (SOUTH) ONTO SH-349.\n4. CONTINUE ON SH-349 FOR 3.5 MILES.\n5. END AT DESTINATION."
        }
        placeholderTextColor="#9ca3af"
        value={text}
        onChangeText={setText}
      />
      <Pressable
        style={[styles.button, text.trim().length === 0 && styles.buttonDisabled]}
        disabled={text.trim().length === 0}
        onPress={handleParse}
      >
        <Text style={styles.buttonText}>Parse Route</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontSize: 14, color: "#374151" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111827",
  },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#93c5fd" },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});
