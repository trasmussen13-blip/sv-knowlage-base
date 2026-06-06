export const PLATFORMS = [
  "AXM Lite",
  "AXM Classic", 
  "AXM Plus",
  "LSM Basic",
  "LSM Business",
  "LSM Professional",
  "LSM Online",
  "SmartIntego Manager",
  "Smart.Surveil",
  "Smart.XChange",
  "Other",
] as const;

export const HARDWARE_COMPONENTS = [
  "Digital Cylinder AX",
  "3061 Cylinder",
  "SmartHandle AX",
  "3062 SmartHandle",
  "SmartRelay 3063",
  "SmartLocker AX",
  "Electronic Furniture Lock",
  "Padlock AX",
  "PIN Code Keypad",
  "SmartCard",
  "Transponder",
  "SmartTag",
  "SlimTag",
  "AX2Go Mobile Credential",
  "SmartCD",
  "SmartStick AX",
] as const;

export const SYSTEM_LAYERS = [
  { id: "software", label: "Software Layer", description: "AXM / LSM / integrations" },
  { id: "network",  label: "Network Layer",  description: "VN / WaveNet / connectivity" },
  { id: "database", label: "Database Layer", description: "SQL / ADS / LocalDB" },
  { id: "device",   label: "Device Layer",   description: "locks / handles / relays" },
  { id: "identity", label: "Identity Layer", description: "transponders / cards / mobile credentials" },
] as const;

export const ROOT_CAUSE_OPTIONS = [
  "Configuration mismatch",
  "Firmware incompatibility",
  "Database corruption / sync error",
  "Network timeout / unreachable node",
  "Permission / access rights issue",
  "Programming sequence error",
  "Credential revocation failure",
  "Driver / software version conflict",
  "Hardware defect",
  "User error",
  "Other (describe below)",
] as const;

export const INTERVENTION_TOOLS = [
  "SmartCD programming",
  "SmartStick AX",
  "AXM reconfiguration",
  "LSM reconfiguration",
  "Database repair / restore",
  "Firmware update",
  "Factory reset",
  "Credential re-issue",
  "Network reconfiguration",
  "Manual override",
  "Remote support session",
  "Hardware replacement",
  "Other",
] as const;
