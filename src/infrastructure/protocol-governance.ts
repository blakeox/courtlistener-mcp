import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SERVER_CAPABILITIES,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from './protocol-constants.js';

type SupportedProtocolVersion = (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number];
type CapabilityKey = keyof typeof SERVER_CAPABILITIES;
export type CapabilityProfile = 'core' | 'extended' | 'async';

const CAPABILITY_PROFILE_PRIORITY: Readonly<Record<CapabilityProfile, number>> = Object.freeze({
  core: 0,
  extended: 1,
  async: 2,
});

export interface VersionedProtocolContract {
  protocolVersion: SupportedProtocolVersion;
  capabilities: {
    required: readonly CapabilityKey[];
    optional: readonly CapabilityKey[];
  };
  capabilityProfiles: {
    default: CapabilityProfile;
    supported: readonly CapabilityProfile[];
  };
  tools: readonly string[];
  resources: readonly string[];
  prompts: readonly string[];
}

export const GOVERNED_TOOL_NAMES = [
  'advanced_search',
  'analyze_case_authorities',
  'analyze_legal_argument',
  'get_bankruptcy_data',
  'get_bulk_data',
  'get_case_details',
  'get_citation_network',
  'get_comprehensive_case_analysis',
  'get_comprehensive_judge_profile',
  'get_docket',
  'get_docket_entries',
  'get_dockets',
  'get_enhanced_recap_data',
  'get_financial_disclosure',
  'get_financial_disclosure_details',
  'get_financial_disclosures',
  'get_judge',
  'get_judges',
  'get_opinion_text',
  'get_oral_argument',
  'get_oral_arguments',
  'get_parties_and_attorneys',
  'get_recap_document',
  'get_recap_documents',
  'get_related_cases',
  'get_visualization_data',
  'list_courts',
  'lookup_citation',
  'manage_alerts',
  'search_cases',
  'search_opinions',
  'smart_search',
  'validate_citations',
] as const;

export const GOVERNED_RESOURCE_URIS = [
  'courtlistener://api/status',
  'courtlistener://case/123456',
  'courtlistener://court/scotus',
  'courtlistener://docket/123456',
  'courtlistener://judge/123456',
  'courtlistener://opinion/123456',
  'courtlistener://schema/court',
  'courtlistener://schema/docket',
  'courtlistener://schema/judge',
  'courtlistener://schema/opinion',
  'courtlistener://schema/search-params',
  'courtlistener://search/recent',
] as const;

export const GOVERNED_PROMPT_NAMES = [
  'analyze-case',
  'case_brief',
  'citation_analysis',
  'compare-precedents',
  'draft-brief-section',
  'identify-issues',
  'judicial_due_diligence',
  'jurisdiction_comparison',
  'legal_assistant',
  'legal_research_workflow',
  'motion_drafting',
  'summarize-statute',
] as const;

const BASE_SURFACE_CONTRACT = Object.freeze({
  capabilities: {
    required: ['tools', 'resources', 'prompts', 'logging'] as const,
    optional: ['sampling'] as const,
  },
  tools: GOVERNED_TOOL_NAMES,
  resources: GOVERNED_RESOURCE_URIS,
  prompts: GOVERNED_PROMPT_NAMES,
});

const CAPABILITY_PROFILE_CONTRACT = Object.freeze({
  legacy: {
    default: 'extended' as const,
    supported: ['core', 'extended'] as const,
  },
  modern: {
    default: 'extended' as const,
    supported: ['core', 'extended', 'async'] as const,
  },
});

export const MCP_PROTOCOL_CAPABILITY_CONTRACT = Object.freeze({
  '2024-11-05': {
    protocolVersion: '2024-11-05',
    capabilityProfiles: CAPABILITY_PROFILE_CONTRACT.legacy,
    ...BASE_SURFACE_CONTRACT,
  },
  '2025-03-26': {
    protocolVersion: '2025-03-26',
    capabilityProfiles: CAPABILITY_PROFILE_CONTRACT.modern,
    ...BASE_SURFACE_CONTRACT,
  },
  '2025-06-18': {
    protocolVersion: '2025-06-18',
    capabilityProfiles: CAPABILITY_PROFILE_CONTRACT.modern,
    ...BASE_SURFACE_CONTRACT,
  },
  '2025-11-25': {
    protocolVersion: '2025-11-25',
    capabilityProfiles: CAPABILITY_PROFILE_CONTRACT.modern,
    ...BASE_SURFACE_CONTRACT,
  },
}) satisfies Record<SupportedProtocolVersion, VersionedProtocolContract>;

export type CapabilityProfileNegotiationReason =
  | 'accepted'
  | 'defaulted_missing_profile'
  | 'fallback_unknown_profile'
  | 'fallback_unsupported_profile';

export interface CapabilityProfileNegotiationDiagnostics {
  protocolVersion: SupportedProtocolVersion;
  requestedProfile: string | null;
  acceptedProfile: CapabilityProfile;
  accepted: boolean;
  reason: CapabilityProfileNegotiationReason;
  fallbackFrom?: string;
  supportedProfiles: readonly CapabilityProfile[];
}

function getFallbackProfile(
  requestedProfile: CapabilityProfile,
  supportedProfiles: readonly CapabilityProfile[],
): CapabilityProfile {
  const requestedPriority = CAPABILITY_PROFILE_PRIORITY[requestedProfile];
  const bestMatch = [...supportedProfiles]
    .filter((profile) => CAPABILITY_PROFILE_PRIORITY[profile] <= requestedPriority)
    .sort((left, right) => CAPABILITY_PROFILE_PRIORITY[right] - CAPABILITY_PROFILE_PRIORITY[left])[0];

  return bestMatch ?? supportedProfiles[0] ?? 'core';
}

export function negotiateCapabilityProfile(
  version: SupportedProtocolVersion,
  requestedProfile: string | null | undefined,
): CapabilityProfileNegotiationDiagnostics {
  const contract = getProtocolContract(version);
  const supportedProfiles = contract.capabilityProfiles.supported;
  const normalizedProfile = requestedProfile?.trim().toLowerCase() ?? '';

  if (!normalizedProfile) {
    return {
      protocolVersion: version,
      requestedProfile: requestedProfile ?? null,
      acceptedProfile: contract.capabilityProfiles.default,
      accepted: true,
      reason: 'defaulted_missing_profile',
      supportedProfiles,
    };
  }

  if (!(normalizedProfile in CAPABILITY_PROFILE_PRIORITY)) {
    return {
      protocolVersion: version,
      requestedProfile: requestedProfile ?? null,
      acceptedProfile: contract.capabilityProfiles.default,
      accepted: true,
      reason: 'fallback_unknown_profile',
      fallbackFrom: normalizedProfile,
      supportedProfiles,
    };
  }

  const requested = normalizedProfile as CapabilityProfile;
  if (supportedProfiles.includes(requested)) {
    return {
      protocolVersion: version,
      requestedProfile: requestedProfile ?? null,
      acceptedProfile: requested,
      accepted: true,
      reason: 'accepted',
      supportedProfiles,
    };
  }

  return {
    protocolVersion: version,
    requestedProfile: requestedProfile ?? null,
    acceptedProfile: getFallbackProfile(requested, supportedProfiles),
    accepted: true,
    reason: 'fallback_unsupported_profile',
    fallbackFrom: requested,
    supportedProfiles,
  };
}

export interface DeprecationPolicy {
  minimumNoticeDays: number;
  requireReplacementForToolChanges: boolean;
}

export const DEPRECATION_POLICY: DeprecationPolicy = Object.freeze({
  minimumNoticeDays: 30,
  requireReplacementForToolChanges: true,
});

export interface GovernanceDeprecationEntry {
  id: string;
  surface: 'protocol' | 'tool';
  target: string;
  replacement?: string;
  announcedOn: string;
  removeAfter: string;
}

export const GOVERNANCE_DEPRECATIONS: readonly GovernanceDeprecationEntry[] = Object.freeze([
  {
    id: 'tool-get-docket-entries-docket-id',
    surface: 'tool',
    target: 'get_docket_entries.input.docket_id',
    replacement: 'get_docket_entries.input.docket',
    announcedOn: '2026-03-01',
    removeAfter: '2026-05-01',
  },
]);

export function getProtocolContract(version: SupportedProtocolVersion): VersionedProtocolContract {
  return MCP_PROTOCOL_CAPABILITY_CONTRACT[version];
}

export function getAdvertisedCapabilityKeys(): CapabilityKey[] {
  return (Object.keys(SERVER_CAPABILITIES) as CapabilityKey[]).filter(
    (key) => SERVER_CAPABILITIES[key] !== undefined,
  );
}

export function validateGovernanceDeprecations(
  policy: DeprecationPolicy = DEPRECATION_POLICY,
  entries: readonly GovernanceDeprecationEntry[] = GOVERNANCE_DEPRECATIONS,
): string[] {
  const violations: string[] = [];

  for (const entry of entries) {
    const announced = Date.parse(entry.announcedOn);
    const removeAfter = Date.parse(entry.removeAfter);

    if (Number.isNaN(announced) || Number.isNaN(removeAfter)) {
      violations.push(`${entry.id}: invalid announcedOn/removeAfter date format`);
      continue;
    }

    if (removeAfter <= announced) {
      violations.push(`${entry.id}: removeAfter must be after announcedOn`);
      continue;
    }

    const minimumNoticeMs = policy.minimumNoticeDays * 24 * 60 * 60 * 1000;
    if (removeAfter - announced < minimumNoticeMs) {
      violations.push(`${entry.id}: deprecation notice is shorter than ${policy.minimumNoticeDays} days`);
    }

    if (policy.requireReplacementForToolChanges && entry.surface === 'tool' && !entry.replacement) {
      violations.push(`${entry.id}: tool deprecation requires a replacement target`);
    }
  }

  return violations;
}

export const GOVERNED_PROTOCOL_POINTERS = Object.freeze({
  defaultProtocolVersion: PROTOCOL_VERSION,
  preferredProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
});
