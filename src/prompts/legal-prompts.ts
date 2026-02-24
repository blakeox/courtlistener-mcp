import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptHandler } from '../server/prompt-handler.js';

export class SummarizeStatutePromptHandler implements PromptHandler {
  name = 'summarize-statute';
  description = 'Generate a concise summary of a statute or legal provision';
  arguments = [
    {
      name: 'statute_text',
      description: 'The full text of the statute to summarize',
      required: true,
    },
    {
      name: 'jurisdiction',
      description: 'The jurisdiction (e.g., federal, state)',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please provide a concise summary of the following statute:

${args.statute_text || '[Statute text not provided]'}
${args.jurisdiction ? `\nJurisdiction: ${args.jurisdiction}` : ''}

Please include:
1. Main purpose and scope
2. Key provisions
3. Exceptions or limitations
4. Effective date or applicability`,
          },
        },
      ],
    };
  }
}

export class ComparePrecedentsPromptHandler implements PromptHandler {
  name = 'compare-precedents';
  description = 'Compare and contrast multiple legal precedents';
  arguments = [
    {
      name: 'case_citations',
      description: 'Comma-separated list of case citations to compare',
      required: true,
    },
    {
      name: 'focus_issue',
      description: 'Specific legal issue to focus the comparison on',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please compare and contrast the following legal precedents:

Cases: ${args.case_citations || '[Citations not provided]'}
${args.focus_issue ? `\nFocus on: ${args.focus_issue}` : ''}

Please analyze:
1. Key holdings in each case
2. Similarities in reasoning
3. Points of divergence
4. Binding authority and jurisdiction
5. Current applicability`,
          },
        },
      ],
    };
  }
}

export class AnalyzeCasePromptHandler implements PromptHandler {
  name = 'analyze-case';
  description = 'Perform comprehensive analysis of a legal case';
  arguments = [
    {
      name: 'case_citation',
      description: 'Citation of the case to analyze',
      required: true,
    },
    {
      name: 'analysis_type',
      description: 'Type of analysis: holding, reasoning, impact, or full',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the following case:

Citation: ${args.case_citation || '[Citation not provided]'}
Analysis Type: ${args.analysis_type || 'full'}

Please provide:
1. Facts of the case
2. Legal issues presented
3. Court's holding
4. Reasoning and analysis
5. Precedential value
6. Potential impact`,
          },
        },
      ],
    };
  }
}

export class DraftBriefSectionPromptHandler implements PromptHandler {
  name = 'draft-brief-section';
  description = 'Help draft a section of a legal brief';
  arguments = [
    {
      name: 'section_type',
      description: 'Type of section: facts, argument, conclusion',
      required: true,
    },
    {
      name: 'key_points',
      description: 'Key points to include (comma-separated)',
      required: true,
    },
    {
      name: 'supporting_cases',
      description: 'Supporting case citations',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help draft the following section of a legal brief:

Section Type: ${args.section_type || 'argument'}
Key Points: ${args.key_points || '[Not provided]'}
${args.supporting_cases ? `\nSupporting Cases: ${args.supporting_cases}` : ''}

Please draft a well-structured section that:
1. States the key points clearly
2. Supports arguments with legal authority
3. Uses proper legal writing style
4. Follows logical organization`,
          },
        },
      ],
    };
  }
}

export class IdentifyIssuesPromptHandler implements PromptHandler {
  name = 'identify-issues';
  description = 'Identify legal issues in a factual scenario';
  arguments = [
    {
      name: 'fact_pattern',
      description: 'Description of the factual scenario',
      required: true,
    },
    {
      name: 'jurisdiction',
      description: 'Applicable jurisdiction',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please identify the legal issues in the following scenario:

Fact Pattern:
${args.fact_pattern || '[Fact pattern not provided]'}
${args.jurisdiction ? `\nJurisdiction: ${args.jurisdiction}` : ''}

Please identify:
1. All potential legal issues
2. Applicable areas of law
3. Relevant legal standards
4. Potential claims or defenses
5. Key questions to research`,
          },
        },
      ],
    };
  }
}

export class LegalResearchWorkflowPromptHandler implements PromptHandler {
  name = 'legal_research_workflow';
  description =
    'Step-by-step case research workflow guiding through searching, analyzing, and synthesizing findings';
  arguments = [
    {
      name: 'topic',
      description: 'The legal topic or question to research',
      required: true,
    },
    {
      name: 'jurisdiction',
      description: 'The jurisdiction to focus on (e.g., "federal", "California")',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please conduct a step-by-step legal research workflow on the following topic:

Topic: ${args.topic || '[Topic not provided]'}
${args.jurisdiction ? `Jurisdiction: ${args.jurisdiction}` : ''}

Follow these steps:
1. Search for relevant cases using the available search tools
2. Identify the leading precedents and landmark decisions
3. Analyze the legal reasoning and holdings in each key case
4. Note any circuit splits or conflicting authorities
5. Synthesize the findings into a cohesive research summary
6. Identify any gaps in the research that need further investigation

For each case found, provide the citation, holding, and relevance to the research topic.`,
          },
        },
      ],
    };
  }
}

export class CitationAnalysisPromptHandler implements PromptHandler {
  name = 'citation_analysis';
  description =
    'Analyze the citation network for a case, including cited cases and citation patterns';
  arguments = [
    {
      name: 'case_citation',
      description: 'The citation of the case to analyze (e.g., "410 U.S. 113")',
      required: true,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the citation network for the following case:

Case Citation: ${args.case_citation || '[Citation not provided]'}

Please perform the following analysis:
1. Look up the case and confirm its full name and details
2. Identify the cases cited within this opinion (authorities relied upon)
3. Identify cases that have subsequently cited this case (citing references)
4. Analyze citation patterns — which cases are most frequently co-cited
5. Determine whether the case has been distinguished, followed, or overruled
6. Assess the current precedential strength based on citation treatment
7. Summarize the citation network and the case's influence on the law`,
          },
        },
      ],
    };
  }
}

export class JurisdictionComparisonPromptHandler implements PromptHandler {
  name = 'jurisdiction_comparison';
  description = 'Compare how different jurisdictions approach a legal issue';
  arguments = [
    {
      name: 'legal_issue',
      description: 'The legal issue to compare across jurisdictions',
      required: true,
    },
    {
      name: 'jurisdictions',
      description:
        'Comma-separated list of jurisdictions to compare (e.g., "California, New York, Texas")',
      required: true,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    const jurisdictions = args.jurisdictions || '[Jurisdictions not provided]';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please compare how different jurisdictions approach the following legal issue:

Legal Issue: ${args.legal_issue || '[Legal issue not provided]'}
Jurisdictions: ${jurisdictions}

For each jurisdiction listed, please:
1. Search for leading cases and statutes addressing this issue
2. Summarize the prevailing legal standard or rule
3. Note any unique statutory provisions or procedural requirements
4. Identify key differences in how each jurisdiction treats the issue
5. Highlight any recent trends or shifts in the law

Then provide a comparative analysis:
- A side-by-side comparison of the approaches
- Areas of agreement across jurisdictions
- Significant points of divergence
- Practical implications of the differences`,
          },
        },
      ],
    };
  }
}

export class CaseBriefPromptHandler implements PromptHandler {
  name = 'case_brief';
  description = 'Generate a structured case brief from a court opinion';
  arguments = [
    {
      name: 'opinion_id',
      description: 'The opinion ID to brief (CourtListener opinion ID)',
      required: true,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate a case brief for the following opinion:

Opinion ID: ${args.opinion_id || '[Opinion ID not provided]'}

Please read the full opinion text and produce a brief with:
1. **Case Name**: Full case name and citation
2. **Court**: The court that issued the opinion
3. **Date**: Date of the decision
4. **Facts**: Key facts of the case in concise narrative form
5. **Procedural History**: How the case reached this court
6. **Issue(s)**: The legal question(s) presented
7. **Holding**: The court's answer to each issue
8. **Reasoning**: The court's rationale and analysis
9. **Rule**: The legal rule or standard established or applied
10. **Disposition**: The outcome (affirmed, reversed, remanded, etc.)
11. **Significance**: The precedential value and broader impact`,
          },
        },
      ],
    };
  }
}

export class MotionDraftingPromptHandler implements PromptHandler {
  name = 'motion_drafting';
  description = 'Draft a motion outline supported by case law research';
  arguments = [
    {
      name: 'motion_type',
      description:
        'Type of motion (e.g., "Motion to Dismiss", "Summary Judgment", "Motion to Compel")',
      required: true,
    },
    {
      name: 'supporting_cases',
      description: 'Optional comma-separated case citations to use as supporting authority',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please draft a motion outline for the following:

Motion Type: ${args.motion_type || '[Motion type not provided]'}
${args.supporting_cases ? `Supporting Cases: ${args.supporting_cases}` : ''}

Please follow these steps:
1. Research the legal standard for this type of motion
2. Identify the key elements that must be established
3. ${args.supporting_cases ? 'Analyze the provided supporting cases for relevant holdings' : 'Search for relevant supporting case law'}
4. Structure the motion outline with:
   a. Introduction and relief sought
   b. Statement of relevant facts
   c. Legal standard applicable to this motion
   d. Argument sections with supporting authorities
   e. Conclusion and specific relief requested
5. For each argument, cite the relevant legal authority
6. Note any potential counterarguments and how to address them`,
          },
        },
      ],
    };
  }
}

export class JudicialDueDiligencePromptHandler implements PromptHandler {
  name = 'judicial_due_diligence';
  description = "Review a judge's financial disclosures, background, and ruling patterns";
  arguments = [
    {
      name: 'judge_name',
      description: 'The name of the judge to research',
      required: true,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please conduct due diligence on the following judge:

Judge Name: ${args.judge_name || '[Judge name not provided]'}

Please investigate:
1. Look up the judge using the available search tools and confirm their full name, court, and appointment details
2. Review any available financial disclosure records for potential conflicts of interest
3. Search for recent opinions authored by this judge to identify ruling patterns
4. Analyze the judge's tendencies in key areas (e.g., sentencing patterns, procedural rulings, substantive law)
5. Note any notable or controversial decisions
6. Identify any recusal history or ethics-related matters
7. Summarize the judge's judicial philosophy and approach based on their record`,
          },
        },
      ],
    };
  }
}
