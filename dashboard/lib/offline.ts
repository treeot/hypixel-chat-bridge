/** Operator-facing explanation for a failed bridge.accounts() result. */
export function offlineMessage(result: { status: number; error: string }): string {
  switch (result.status) {
    case 0:
      return "Bridge offline: can't reach the bridge. Check BRIDGE_URL and that the bridge is running."
    case 401:
      return "Bridge API rejected the token: check BRIDGE_TOKEN matches the bridge's REST_API_TOKEN."
    case 404:
      return 'Dashboard API is off: set DASHBOARD_API=true on the bridge.'
    default:
      return `Bridge error: ${result.error}`
  }
}
