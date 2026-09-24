import { clearDecisionSnapshot } from "../decision/decisionSession";
import { resetV3OnboardingForDemo } from "../onboarding/onboardingStorage";
import { consumeResearchSection } from "../research/researchModel";
import { writeWatchTargets } from "../watch/watchTargets";

export function clearV3DemoDeviceState() {
  resetV3OnboardingForDemo();
  writeWatchTargets([]);
  clearDecisionSnapshot();
  consumeResearchSection();
}
