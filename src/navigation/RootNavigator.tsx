import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import HomeScreen from "../screens/HomeScreen";
import ScannerScreen from "../screens/ScannerScreen";
import ManualEntryScreen from "../screens/ManualEntryScreen";
import PermitReviewScreen from "../screens/PermitReviewScreen";
import RoutePreviewScreen from "../screens/RoutePreviewScreen";
import NavigationScreen from "../screens/NavigationScreen";
import SettingsScreen from "../screens/SettingsScreen";
import HistoryScreen from "../screens/HistoryScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Truck Navigation" }} />
        <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: "Scan Permit" }} />
        <Stack.Screen
          name="ManualEntry"
          component={ManualEntryScreen}
          options={{ title: "Paste Route Text" }}
        />
        <Stack.Screen
          name="PermitReview"
          component={PermitReviewScreen}
          options={{ title: "Review Route" }}
        />
        <Stack.Screen
          name="RoutePreview"
          component={RoutePreviewScreen}
          options={{ title: "Route" }}
        />
        <Stack.Screen
          name="Navigation"
          component={NavigationScreen}
          options={{ title: "Navigating", headerShown: false }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
