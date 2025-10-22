import { useRef, useEffect } from "react";

// --- Configuration ---
// The number of renders to trigger the warning.
const RENDER_LIMIT = 15;
// The time window in milliseconds to count the renders.
const TIME_LIMIT_MS = 2000; // 2 seconds

/**
 * A custom hook to detect potential infinite render loops in React components.
 * It should be used for debugging during development.
 * @param {string} componentName - The name of the component to display in the warning message.
 */
export const useRenderLoopDetector = (componentName = "UnknownComponent") => {
  const renderTimestamps = useRef([]);

  // This useEffect runs after every render because it has no dependency array.
  useEffect(() => {
    const now = Date.now();
    const newTimestamps = [...renderTimestamps.current, now];

    // Keep only timestamps from the last TIME_LIMIT_MS.
    const recentTimestamps = newTimestamps.filter(
      (timestamp) => now - timestamp < TIME_LIMIT_MS
    );

    if (recentTimestamps.length > RENDER_LIMIT) {
      console.warn(
        `[Render Loop Detector] Potential infinite loop in ${componentName}. ` +
          `Component rendered ${recentTimestamps.length} times in the last ${TIME_LIMIT_MS}ms.`
      );
      // In a production build, you could report this to a logging service.
      // e.g., Sentry.captureMessage(`Infinite loop in ${componentName}`);

      // Clear timestamps to prevent repeated warnings for the same loop instance.
      renderTimestamps.current = [];
    } else {
      renderTimestamps.current = recentTimestamps;
    }
  });
};
