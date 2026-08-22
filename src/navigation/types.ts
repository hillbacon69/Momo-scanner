import type { ParsedPermit, RoutePlan } from "../types/permit";

export type RootStackParamList = {
  Home: undefined;
  Scanner: undefined;
  ManualEntry: undefined;
  PermitReview: { permit: ParsedPermit };
  RoutePreview: { routePlan: RoutePlan };
  Navigation: { routePlan: RoutePlan };
  Settings: undefined;
  History: undefined;
};
